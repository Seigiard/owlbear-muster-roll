import type { Page } from '@playwright/test';
import { Result } from 'better-result';

export type TestFileAccessCapability = 'open-only' | 'write-and-follow';

export type TestFileReference = {
  id: string;
  name: string;
};

export type TestFileContents = {
  text: string;
  modifiedAt: Date;
};

export type TestFileAccessFailure = {
  reason: string;
};

export type TestFileAccessResult<Value> = Result<Value, TestFileAccessFailure>;

export type TestOpenRequest = {
  mode: 'open' | 'save';
  suggestedName?: string;
};

export type TestFileAccessPort = {
  capability: TestFileAccessCapability;
  open: (request: TestOpenRequest) => Promise<TestFileAccessResult<TestFileReference | null>>;
  read: (file: TestFileReference) => Promise<TestFileAccessResult<TestFileContents>>;
  write: (file: TestFileReference, text: string) => Promise<TestFileAccessResult<TestFileContents>>;
  follow: (
    file: TestFileReference,
    onChange: (result: TestFileAccessResult<TestFileContents>) => void,
  ) => () => void;
};

type FakeFile = TestFileReference & TestFileContents;

type PendingWrite = {
  file: TestFileReference;
  text: string;
  resolve: (result: TestFileAccessResult<TestFileContents>) => void;
};

type PendingRead = {
  file: TestFileReference;
  resolve: (result: TestFileAccessResult<TestFileContents>) => void;
};

type BrowserFileAccessControl = {
  queueFile: (name: string, text: string) => void;
  rewriteFile: (name: string, text: string) => void;
};

type TestPickerWindow = Window & {
  musterRollFileAccessControl?: BrowserFileAccessControl;
};

export async function installBrowserFileAccessFake(page: Page): Promise<void> {
  await page.addInitScript(() => {
    type BrowserFakeFile = {
      name: string;
      text: string;
      lastModified: number;
    };

    type FakeHandle = {
      name: string;
      getFile: () => Promise<{
        lastModified: number;
        text: () => Promise<string>;
      }>;
      createWritable: () => Promise<{
        write: (text: string) => Promise<void>;
        close: () => Promise<void>;
      }>;
    };

    type PickerWindow = Window & {
      musterRollFileAccessControl?: BrowserFileAccessControl;
      showOpenFilePicker?: () => Promise<FakeHandle[]>;
      showSaveFilePicker?: (options?: { suggestedName?: string }) => Promise<FakeHandle>;
    };

    // SAFETY: the test installs only the optional picker and control properties declared above.
    const browser = window as PickerWindow;
    const openQueue: FakeHandle[] = [];
    const files = new Map<string, BrowserFakeFile>();
    let nextModifiedAt = Date.parse('2026-11-16T18:06:00.000Z');

    function createHandle(file: BrowserFakeFile): FakeHandle {
      return {
        name: file.name,
        getFile: async () => ({
          lastModified: file.lastModified,
          text: async () => file.text,
        }),
        createWritable: async () => {
          let pendingText = file.text;

          return {
            write: async (text) => {
              pendingText = text;
            },
            close: async () => {
              file.text = pendingText;
              nextModifiedAt += 1000;
              file.lastModified = nextModifiedAt;
            },
          };
        },
      };
    }

    browser.musterRollFileAccessControl = {
      queueFile: (name, text) => {
        const file = { name, text, lastModified: nextModifiedAt };
        files.set(name, file);
        openQueue.push(createHandle(file));
      },
      rewriteFile: (name, text) => {
        const file = files.get(name);

        if (file === undefined) {
          throw new Error(`No browser file ${name}`);
        }

        file.text = text;
        nextModifiedAt += 1000;
        file.lastModified = nextModifiedAt;
      },
    };
    browser.showOpenFilePicker = async () => {
      const handle = openQueue.shift();

      if (handle === undefined) {
        throw new DOMException('The user aborted a request.', 'AbortError');
      }

      return [handle];
    };

    browser.showSaveFilePicker = async (options) =>
      createHandle({
        name: options?.suggestedName ?? 'untitled.json',
        text: '',
        lastModified: nextModifiedAt,
      });
  });
}

export async function queueBrowserFile(page: Page, name: string, text: string): Promise<void> {
  await page.evaluate(
    ({ fileName, fileText }) => {
      // SAFETY: installBrowserFileAccessFake installs only the optional control property declared.
      const control = (window as TestPickerWindow).musterRollFileAccessControl;

      if (control === undefined) {
        throw new Error('The browser file-access fake is not installed');
      }

      control.queueFile(fileName, fileText);
    },
    { fileName: name, fileText: text },
  );
}

export async function rewriteBrowserFile(page: Page, name: string, text: string): Promise<void> {
  await page.evaluate(
    ({ fileName, fileText }) => {
      // SAFETY: installBrowserFileAccessFake installs only the optional control property declared.
      const control = (window as TestPickerWindow).musterRollFileAccessControl;

      if (control === undefined) {
        throw new Error('The browser file-access fake is not installed');
      }

      control.rewriteFile(fileName, fileText);
    },
    { fileName: name, fileText: text },
  );
}

export class TestFileAccessFake implements TestFileAccessPort {
  readonly followRequests: TestFileReference[] = [];
  readonly openRequests: TestOpenRequest[] = [];
  readonly readRequests: TestFileReference[] = [];
  readonly writeRequests: {
    file: TestFileReference;
    text: string;
  }[] = [];
  readonly capability: TestFileAccessCapability;
  private readonly files = new Map<string, FakeFile>();
  private readonly openQueue: TestFileReference[] = [];
  private readonly followers = new Map<
    string,
    Set<(result: TestFileAccessResult<TestFileContents>) => void>
  >();
  private readonly pendingReads: PendingRead[] = [];
  private readonly pendingWrites: PendingWrite[] = [];
  private readonly writeFailures: string[] = [];
  private nextModifiedAt = new Date('2026-11-16T18:06:00.000Z');
  private readsBeforePause: number | null = null;
  private writesPaused = false;
  constructor(capability: TestFileAccessCapability = 'write-and-follow') {
    this.capability = capability;
  }
  addFile(id: string, name: string, text: string): TestFileReference {
    const reference = { id, name };
    this.files.set(id, { ...reference, text, modifiedAt: this.nextModifiedAt });

    return reference;
  }
  queueOpen(file: TestFileReference): void {
    this.openQueue.push(file);
  }
  isFollowing(file: TestFileReference): boolean {
    return (this.followers.get(file.id)?.size ?? 0) > 0;
  }
  setModifiedAt(modifiedAt: Date): void {
    this.nextModifiedAt = modifiedAt;
  }
  queueWriteFailure(reason: string): void {
    this.writeFailures.push(reason);
  }
  pauseReads(): void {
    this.readsBeforePause = 0;
  }
  pauseReadsAfter(completedReads: number): void {
    this.readsBeforePause = completedReads;
  }
  releaseNextRead(): void {
    const pending = this.pendingReads.shift();

    if (pending !== undefined) {
      pending.resolve(this.completeRead(pending.file));
    }
  }
  releaseReads(): void {
    this.readsBeforePause = null;

    while (this.pendingReads.length > 0) {
      this.releaseNextRead();
    }
  }
  pauseWrites(): void {
    this.writesPaused = true;
  }
  releaseNextWrite(): void {
    const pending = this.pendingWrites.shift();

    if (pending !== undefined) {
      pending.resolve(this.completeWrite(pending.file, pending.text));
    }
  }
  releaseWrites(): void {
    this.writesPaused = false;

    while (this.pendingWrites.length > 0) {
      this.releaseNextWrite();
    }
  }
  externalWrite(file: TestFileReference, text: string): void {
    const contents = this.replaceFile(file, text);

    for (const notify of this.followers.get(file.id) ?? []) {
      notify(Result.ok(contents));
    }
  }
  externalWriteSilently(file: TestFileReference, text: string): void {
    this.replaceFile(file, text);
  }
  private replaceFile(file: TestFileReference, text: string): TestFileContents {
    const current = this.files.get(file.id);

    if (current === undefined) {
      throw new Error(`No fake file ${file.id}`);
    }

    const contents = { text, modifiedAt: this.nextModifiedAt };
    this.files.set(file.id, { ...current, ...contents });

    return contents;
  }
  externalFailure(file: TestFileReference, reason: string): void {
    for (const notify of this.followers.get(file.id) ?? []) {
      notify(Result.err({ reason }));
    }
  }
  async open(request: TestOpenRequest): Promise<TestFileAccessResult<TestFileReference | null>> {
    this.openRequests.push(request);

    return Result.ok(this.openQueue.shift() ?? null);
  }
  read(file: TestFileReference): Promise<TestFileAccessResult<TestFileContents>> {
    this.readRequests.push(file);

    if (this.readsBeforePause === null) {
      return Promise.resolve(this.completeRead(file));
    }

    if (this.readsBeforePause > 0) {
      this.readsBeforePause -= 1;

      return Promise.resolve(this.completeRead(file));
    }

    return new Promise((resolve) => {
      this.pendingReads.push({ file, resolve });
    });
  }
  private completeRead(file: TestFileReference): TestFileAccessResult<TestFileContents> {
    const current = this.files.get(file.id);

    return current === undefined
      ? Result.err({ reason: `No fake file ${file.id}` })
      : Result.ok({ text: current.text, modifiedAt: current.modifiedAt });
  }
  write(file: TestFileReference, text: string): Promise<TestFileAccessResult<TestFileContents>> {
    this.writeRequests.push({ file, text });

    if (!this.writesPaused) {
      return Promise.resolve(this.completeWrite(file, text));
    }

    return new Promise((resolve) => {
      this.pendingWrites.push({ file, text, resolve });
    });
  }
  follow(
    file: TestFileReference,
    onChange: (result: TestFileAccessResult<TestFileContents>) => void,
  ): () => void {
    this.followRequests.push(file);
    const listeners = this.followers.get(file.id) ?? new Set();
    listeners.add(onChange);
    this.followers.set(file.id, listeners);

    return () => {
      listeners.delete(onChange);
    };
  }
  private completeWrite(
    file: TestFileReference,
    text: string,
  ): TestFileAccessResult<TestFileContents> {
    const failure = this.writeFailures.shift();

    if (failure !== undefined) {
      return Result.err({ reason: failure });
    }

    const current = this.files.get(file.id);

    if (current === undefined) {
      return Result.err({ reason: `No fake file ${file.id}` });
    }

    const contents = { text, modifiedAt: this.nextModifiedAt };
    this.files.set(file.id, { ...current, ...contents });

    return Result.ok(contents);
  }
}
