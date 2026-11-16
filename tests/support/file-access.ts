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

export type TestFileAccessResult<Value> =
  | { ok: true; value: Value }
  | { ok: false; error: TestFileAccessFailure };

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

export class TestFileAccessFake implements TestFileAccessPort {
  readonly followRequests: TestFileReference[] = [];
  readonly openRequests: TestOpenRequest[] = [];
  readonly writeRequests: { file: TestFileReference; text: string }[] = [];
  readonly capability: TestFileAccessCapability;

  private readonly files = new Map<string, FakeFile>();
  private readonly openQueue: TestFileReference[] = [];
  private readonly followers = new Map<
    string,
    Set<(result: TestFileAccessResult<TestFileContents>) => void>
  >();
  private readonly pendingWrites: PendingWrite[] = [];
  private nextModifiedAt = new Date('2026-11-16T18:06:00.000Z');
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

  setModifiedAt(modifiedAt: Date): void {
    this.nextModifiedAt = modifiedAt;
  }

  pauseWrites(): void {
    this.writesPaused = true;
  }

  releaseWrites(): void {
    this.writesPaused = false;

    for (const pending of this.pendingWrites.splice(0)) {
      pending.resolve(this.completeWrite(pending.file, pending.text));
    }
  }

  externalWrite(file: TestFileReference, text: string): void {
    const current = this.files.get(file.id);

    if (current === undefined) {
      throw new Error(`No fake file ${file.id}`);
    }

    const contents = { text, modifiedAt: this.nextModifiedAt };

    this.files.set(file.id, { ...current, ...contents });

    for (const notify of this.followers.get(file.id) ?? []) {
      notify({ ok: true, value: contents });
    }
  }

  externalFailure(file: TestFileReference, reason: string): void {
    for (const notify of this.followers.get(file.id) ?? []) {
      notify({ ok: false, error: { reason } });
    }
  }

  async open(request: TestOpenRequest): Promise<TestFileAccessResult<TestFileReference | null>> {
    this.openRequests.push(request);

    return { ok: true, value: this.openQueue.shift() ?? null };
  }

  async read(file: TestFileReference): Promise<TestFileAccessResult<TestFileContents>> {
    const current = this.files.get(file.id);

    return current === undefined
      ? { ok: false, error: { reason: `No fake file ${file.id}` } }
      : {
          ok: true,
          value: { text: current.text, modifiedAt: current.modifiedAt },
        };
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
    const current = this.files.get(file.id);

    if (current === undefined) {
      return { ok: false, error: { reason: `No fake file ${file.id}` } };
    }

    const contents = { text, modifiedAt: this.nextModifiedAt };

    this.files.set(file.id, { ...current, ...contents });

    return { ok: true, value: contents };
  }
}
