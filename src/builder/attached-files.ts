import type { FileContents, FileReference } from '@/core/file-access';

export type AttachedFileStatus =
  | { kind: 'synchronized' }
  | { kind: 'saved' }
  | { kind: 'blocked' }
  | { kind: 'changed' }
  | { kind: 'refused'; message: string }
  | { kind: 'failed'; message: string };

export type AttachedFile = {
  reference: FileReference | null;
  name: string;
  lastSyncAt: Date;
  status: AttachedFileStatus;
};

export type FileConflict = {
  contents: FileContents;
  canonicalText: string;
};

export type AttachedFileState = {
  file: AttachedFile | null;
  lastText: string | null;
  lastDocumentText: string | null;
  conflict: FileConflict | null;
  forceWrite: number;
  restoreText: string | null;
  restoreDocumentText: string | null;
};

export type AttachedFilesState = {
  preset: AttachedFileState;
  snapshot: AttachedFileState;
};

export type AttachedFilesAction =
  | {
      type: 'attach';
      kind: keyof AttachedFilesState;
      reference: FileReference | null;
      name: string;
      contents: FileContents;
      canonicalText: string;
    }
  | { type: 'detach'; kind: keyof AttachedFilesState }
  | { type: 'block'; kind: keyof AttachedFilesState }
  | { type: 'refuse'; kind: keyof AttachedFilesState; message: string }
  | { type: 'fail'; kind: keyof AttachedFilesState; message: string }
  | {
      type: 'conflict';
      kind: keyof AttachedFilesState;
      contents: FileContents;
      canonicalText: string;
    }
  | {
      type: 'accept-external';
      kind: keyof AttachedFilesState;
      contents: FileContents;
      canonicalText: string;
    }
  | { type: 'keep-local'; kind: keyof AttachedFilesState }
  | { type: 'take-file'; kind: keyof AttachedFilesState }
  | {
      type: 'write-succeeded';
      kind: keyof AttachedFilesState;
      contents: FileContents;
      text: string;
      documentText: string;
    }
  | {
      type: 'prepare-clear';
      kind: keyof AttachedFilesState;
      documentText: string;
    };

export function emptyAttachedFileState(): AttachedFileState {
  return {
    file: null,
    lastText: null,
    lastDocumentText: null,
    conflict: null,
    forceWrite: 0,
    restoreText: null,
    restoreDocumentText: null,
  };
}

export function emptyAttachedFilesState(): AttachedFilesState {
  return { preset: emptyAttachedFileState(), snapshot: emptyAttachedFileState() };
}

export function attachedFilesReducer(
  state: AttachedFilesState,
  action: AttachedFilesAction,
): AttachedFilesState {
  const current = state[action.kind];
  let next: AttachedFileState;

  switch (action.type) {
    case 'attach':
      next = {
        ...current,
        file: {
          reference: action.reference,
          name: action.name,
          lastSyncAt: action.contents.modifiedAt,
          status: { kind: 'synchronized' },
        },
        lastText: action.contents.text,
        lastDocumentText: action.canonicalText,
        conflict: null,
      };
      break;
    case 'detach':
      next = emptyAttachedFileState();
      break;
    case 'block':
      next =
        current.file === null
          ? current
          : { ...current, file: { ...current.file, status: { kind: 'blocked' } } };
      break;
    case 'refuse':
      next =
        current.file === null
          ? current
          : {
              ...current,
              file: { ...current.file, status: { kind: 'refused', message: action.message } },
            };
      break;
    case 'fail':
      next =
        current.file === null
          ? current
          : {
              ...current,
              file: { ...current.file, status: { kind: 'failed', message: action.message } },
            };
      break;
    case 'conflict':
      next =
        current.file === null
          ? current
          : {
              ...current,
              conflict: { contents: action.contents, canonicalText: action.canonicalText },
              file: { ...current.file, status: { kind: 'changed' } },
            };
      break;
    case 'accept-external':
      next =
        current.file === null
          ? current
          : {
              ...current,
              lastText: action.contents.text,
              lastDocumentText: action.canonicalText,
              conflict: null,
              file: {
                ...current.file,
                lastSyncAt: action.contents.modifiedAt,
                status: { kind: 'synchronized' },
              },
            };
      break;
    case 'keep-local':
      next =
        current.file === null
          ? current
          : {
              ...current,
              conflict: null,
              forceWrite: current.forceWrite + 1,
              file: { ...current.file, status: { kind: 'changed' } },
            };
      break;
    case 'take-file':
      next =
        current.file === null || current.conflict === null
          ? current
          : {
              ...current,
              lastText: current.conflict.contents.text,
              lastDocumentText: current.conflict.canonicalText,
              conflict: null,
              forceWrite: current.forceWrite + 1,
              file: {
                ...current.file,
                lastSyncAt: current.conflict.contents.modifiedAt,
                status: { kind: 'synchronized' },
              },
            };
      break;
    case 'write-succeeded':
      next =
        current.file === null
          ? current
          : {
              ...current,
              lastText: action.text,
              lastDocumentText: action.documentText,
              conflict: current.conflict,
              forceWrite: 0,
              restoreText:
                current.restoreDocumentText !== null &&
                current.restoreDocumentText === action.documentText &&
                current.restoreText === action.text
                  ? null
                  : current.restoreText,
              restoreDocumentText:
                current.restoreDocumentText !== null &&
                current.restoreDocumentText === action.documentText &&
                current.restoreText === action.text
                  ? null
                  : current.restoreDocumentText,
              file: {
                ...current.file,
                lastSyncAt: action.contents.modifiedAt,
                status: { kind: 'saved' },
              },
            };
      break;
    case 'prepare-clear':
      next = {
        ...current,
        lastDocumentText: action.documentText,
        restoreText: current.lastText,
        restoreDocumentText: current.lastDocumentText,
      };
      break;
    default:
      return unknownAction(action);
  }

  return { ...state, [action.kind]: next };
}

function unknownAction(action: never): never {
  throw new Error(`Unknown attached-file action ${JSON.stringify(action)}`);
}
