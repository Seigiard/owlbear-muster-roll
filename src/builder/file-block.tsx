import clsx from 'clsx';
import { useRef } from 'react';
import type { ChangeEvent, ReactNode } from 'react';
import { Button as AriaButton, Menu, MenuItem, MenuTrigger, Popover } from 'react-aria-components';

import { copy } from '@/copy';

import type { AttachedFile } from './attached-files';
import { BUILDER_EXAMPLES } from './examples';

export type FileBlockKind = 'preset' | 'snapshot';

type FileBlockProps = {
  kind: FileBlockKind;
  file: AttachedFile | null;
  hasContent: boolean;
  downloadText: string | null;
  canAttach: boolean;
  onOpenFile: () => Promise<boolean>;
  onSelectFile: (file: File) => void;
  onOpenExample?: (key: string) => void;
  onSaveAs: () => void;
  onDownloadCopy: () => void;
  onDetach: () => void;
  onClear: () => void;
};

const MENU_ITEM_CLASS =
  'touch-target flex cursor-default items-center rounded-sm px-3 data-focused:bg-surface-tab';

const FILE_BLOCK_CLASS =
  'press inline-flex min-w-[144px] max-w-[208px] flex-col items-start gap-1 rounded-md border border-line px-2 py-1 text-left text-text data-hovered:bg-fill';

const OPEN_FILE = 'open-file';
const SAVE_AS = 'save-as';
const DOWNLOAD_COPY = 'download-copy';
const DETACH = 'detach';
const CLEAR = 'clear';

export function FileBlock({
  kind,
  file,
  hasContent,
  downloadText,
  canAttach,
  onOpenFile,
  onSelectFile,
  onOpenExample,
  onSaveAs,
  onDownloadCopy,
  onDetach,
  onClear,
}: FileBlockProps): ReactNode {
  const fileInput = useRef<HTMLInputElement>(null);
  const downloadReasonId = `file-download-reason-${kind}`;
  const preset = kind === 'preset';
  const title = preset ? copy.builder.fileBlock.preset : copy.builder.fileBlock.snapshot;
  const emptyName = hasContent ? copy.builder.fileBlock.draft : copy.builder.fileBlock.empty;
  const fileName = file?.name ?? emptyName;
  const syncTime = file === null ? null : formatTime(file.lastSyncAt);

  const status =
    file === null ? copy.builder.fileBlock.draftStatus : statusText(file, syncTime ?? '');

  function handleAction(key: string): void {
    if (key === OPEN_FILE) {
      if (canAttach) {
        onOpenFile()
          .then((usedPort) => {
            if (!usedPort) {
              fileInput.current?.click();
            }
          })
          .catch(() => {
            fileInput.current?.click();
          });
      } else {
        fileInput.current?.click();
      }
    } else if (key === SAVE_AS) {
      onSaveAs();
    } else if (key === DOWNLOAD_COPY) {
      onDownloadCopy();
    } else if (key === DETACH) {
      onDetach();
    } else if (key === CLEAR) {
      onClear();
    } else {
      onOpenExample?.(key);
    }
  }

  return (
    <MenuTrigger>
      <AriaButton className={FILE_BLOCK_CLASS}>
        <span className="flex w-full items-center gap-1 text-label-sm font-medium">
          <span>{title}</span>
          <span
            data-file-status-dot
            aria-hidden="true"
            className={clsx(
              'mt-px size-2 rounded-full',
              file === null ? 'bg-text-muted' : 'bg-accent',
            )}
          />
        </span>
        <span className="max-w-full truncate text-label-sm" title={fileName}>
          {fileName}
        </span>
        <span className="max-w-full truncate text-label-sm text-text-muted">{status}</span>
      </AriaButton>
      <Popover
        placement="bottom start"
        isNonModal
        shouldCloseOnInteractOutside={() => true}
        className="rounded-md border border-line bg-surface-bar p-1 text-body text-text"
      >
        <Menu onAction={(key) => handleAction(String(key))}>
          {file === null ? (
            <MenuItem key="file-status" id="file-status" isDisabled className={MENU_ITEM_CLASS}>
              {copy.builder.fileBlock.notConnected}
            </MenuItem>
          ) : (
            <MenuItem
              key="file-info"
              id="file-info"
              isDisabled
              className="flex flex-col items-start gap-1 px-3 py-2"
            >
              <span className="text-label-sm font-medium">{copy.builder.fileBlock.file}</span>
              <span className="max-w-[256px] truncate" title={file.name}>
                {file.name}
              </span>
              <span className="text-label-sm text-text-muted">
                {copy.builder.fileBlock.synchronized}
              </span>
              <time
                className="text-label-sm text-text-muted"
                dateTime={file.lastSyncAt.toISOString()}
              >
                {syncTime}
              </time>
            </MenuItem>
          )}
          <MenuItem id={OPEN_FILE} className={MENU_ITEM_CLASS}>
            {file === null ? copy.builder.fileBlock.openFile : copy.builder.fileBlock.openOtherFile}
          </MenuItem>
          {preset
            ? BUILDER_EXAMPLES.map((example) => (
                <MenuItem key={example.key} id={example.key} className={MENU_ITEM_CLASS}>
                  {example.label}
                </MenuItem>
              ))
            : null}
          {canAttach ? (
            <MenuItem id={SAVE_AS} isDisabled={downloadText === null} className={MENU_ITEM_CLASS}>
              {file === null ? copy.builder.fileBlock.saveFile : copy.builder.fileBlock.saveAs}
            </MenuItem>
          ) : null}
          <MenuItem
            id={DOWNLOAD_COPY}
            isDisabled={downloadText === null}
            aria-describedby={downloadText === null ? downloadReasonId : undefined}
            className={MENU_ITEM_CLASS}
          >
            {copy.builder.fileBlock.downloadCopy}
            {downloadText === null ? (
              <span id={downloadReasonId} className="ml-2 text-label-sm text-text-muted">
                {copy.builder.downloadDisabled}
              </span>
            ) : null}
          </MenuItem>
          {file === null ? null : (
            <MenuItem id={DETACH} className={MENU_ITEM_CLASS}>
              {copy.builder.fileBlock.detach}
            </MenuItem>
          )}
          <MenuItem id={CLEAR} className={MENU_ITEM_CLASS}>
            {preset ? copy.builder.fileBlock.clearPreset : copy.builder.fileBlock.clearSnapshot}
          </MenuItem>
        </Menu>
      </Popover>
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        className="hidden"
        aria-label={
          file === null ? copy.builder.fileBlock.openFile : copy.builder.fileBlock.openOtherFile
        }
        data-builder-file-input={preset ? true : undefined}
        data-builder-snapshot-file-input={preset ? undefined : true}
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          const selected = event.target.files?.[0];

          event.target.value = '';

          if (selected !== undefined) {
            onSelectFile(selected);
          }
        }}
      />
    </MenuTrigger>
  );
}

function formatTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function statusText(file: AttachedFile, time: string): string {
  switch (file.status.kind) {
    case 'synchronized':
      return copy.builder.fileBlock.synchronizedAt(time);
    case 'saved':
      return copy.builder.fileBlock.savedAt(time);
    case 'blocked':
      return copy.builder.fileBlock.writeBlocked;
    case 'changed':
      return copy.builder.fileBlock.changedOnDisk;
    case 'refused':
    case 'failed':
      return file.status.message;
    default:
      return unknownStatus(file.status);
  }
}

function unknownStatus(status: never): never {
  throw new Error(`Unknown file status ${JSON.stringify(status)}`);
}
