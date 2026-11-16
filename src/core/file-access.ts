export type FileAccessCapability = 'open-only' | 'write-and-follow';

export type FileReference = {
  id: string;
  name: string;
};

export type FileContents = {
  text: string;
  modifiedAt: Date;
};

export type FileAccessFailure = {
  reason: string;
};

export type FileAccessResult<Value> =
  | { ok: true; value: Value }
  | { ok: false; error: FileAccessFailure };

export type FileOpenRequest = {
  mode: 'open' | 'save';
  suggestedName?: string;
};

export type FileAccessPort = {
  capability: FileAccessCapability;
  open: (request: FileOpenRequest) => Promise<FileAccessResult<FileReference | null>>;
  read: (file: FileReference) => Promise<FileAccessResult<FileContents>>;
  write: (file: FileReference, text: string) => Promise<FileAccessResult<FileContents>>;
  follow: (
    file: FileReference,
    onChange: (result: FileAccessResult<FileContents>) => void,
  ) => () => void;
};
