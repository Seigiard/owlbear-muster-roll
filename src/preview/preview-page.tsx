import { useEffect, useId, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import {
  openTabIndex,
  parsePresetFile,
  windowSizeOf,
  type Preset,
  type WindowSize,
} from '@/core/preset';
import type { VersionedRecord } from '@/core/records';
import { sheetKey, sheetName, sheetPolicy } from '@/core/sheets';
import { copy } from '@/copy';
import { presetFailureMessage } from '@/ui/preset-errors';
import type { DiceRolling } from '@/ui/sheet/dice-button';
import { SheetBody } from '@/ui/sheet/sheet-body';
import { SheetHeader } from '@/ui/sheet/sheet-header';
import { previewSidebarEntries, sidebarSheetId } from '@/ui/shell/sidebar-entries';
import {
  templateIndexFromKey,
  templateTabKey,
  templateTabLabel,
  WindowFrame,
} from '@/ui/shell/window-frame';
import type { ShellTab } from '@/ui/shell/tab-bar';
import { applyTheme } from '@/ui/theme';

import { addressSearch, readAddress, type PreviewAddress } from './address';
import type { PresetListEntry } from './protocol';
import { CONTROL_CLASS, type ListState, usePresetList } from './preset-list';
import { previewSheets, type PreviewSheet } from './sample-records';
import { createStubRolling } from './stub-rolling';
import { PREVIEW_THEMES } from './themes';

const SWITCH_CLASS = 'flex items-center gap-2';

// One stub for the page, so a roll in flight survives a redraw.
const stubRolling = createStubRolling();

// TASK-40: a dev-only page that draws a preset file as a player sees it, and draws it again on
// each save. It has no Owlbear, no background page and no engine.
export function PreviewPage(): ReactNode {
  const [address, setAddress] = useState(() => readAddress(window.location.search));
  const list = usePresetList(import.meta.hot);
  const presetSelectId = useId();

  useEffect(() => {
    applyTheme(PREVIEW_THEMES[address.theme], document.documentElement);
  }, [address.theme]);

  function change(next: PreviewAddress): void {
    window.history.replaceState(null, '', `${window.location.pathname}${addressSearch(next)}`);
    setAddress(next);
  }

  const entries = list.kind === 'loaded' ? list.entries : [];
  const chosen = entries.find((entry) => entry.key === address.preset) ?? entries[0];

  return (
    <main className="min-h-dvh bg-surface-bar p-4 text-body text-text">
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <label htmlFor={presetSelectId}>Preset</label>
          <select
            id={presetSelectId}
            className={CONTROL_CLASS}
            value={chosen?.key ?? ''}
            disabled={chosen === undefined}
            onChange={(event) => {
              change({ ...address, preset: event.target.value });
            }}
          >
            {entries.map((entry) => (
              <option key={entry.key} value={entry.key}>
                {entry.launch ? `${entry.label} (launch file)` : entry.label}
              </option>
            ))}
          </select>
        </div>
        <label className={SWITCH_CLASS}>
          <input
            type="checkbox"
            role="switch"
            className="accent-accent"
            checked={address.content === 'sample'}
            onChange={(event) => {
              change({ ...address, content: event.target.checked ? 'sample' : 'empty' });
            }}
          />
          Sample values
        </label>
        <label className={SWITCH_CLASS}>
          <input
            type="checkbox"
            role="switch"
            className="accent-accent"
            checked={address.theme === 'light'}
            onChange={(event) => {
              change({ ...address, theme: event.target.checked ? 'light' : 'dark' });
            }}
          />
          Light theme
        </label>
      </div>
      <PreviewBody list={list} chosen={chosen} address={address} />
    </main>
  );
}

function PreviewBody({
  list,
  chosen,
  address,
}: {
  list: ListState;
  chosen: PresetListEntry | undefined;
  address: PreviewAddress;
}): ReactNode {
  if (list.kind === 'loading') {
    return <p className="text-text-muted">Loading…</p>;
  }

  if (list.kind === 'failed') {
    return <p role="alert">The dev server did not give the preset list.</p>;
  }

  if (chosen === undefined) {
    return <p>No preset file found.</p>;
  }

  return <PresetView key={chosen.key} entry={chosen} address={address} />;
}

function PresetView({
  entry,
  address,
}: {
  entry: PresetListEntry;
  address: PreviewAddress;
}): ReactNode {
  const parsed = useMemo(
    () => (entry.text === null ? null : parsePresetFile(entry.text)),
    [entry.text],
  );

  if (parsed === null) {
    return <p role="alert">Cannot read {entry.label}.</p>;
  }

  if (!parsed.ok) {
    return (
      <p role="alert" className="text-danger-text">
        {presetFailureMessage(parsed.error)}
      </p>
    );
  }

  return <PresetFrames preset={parsed.value} address={address} />;
}

function PresetFrames({ preset, address }: { preset: Preset; address: PreviewAddress }): ReactNode {
  const preview = useMemo(() => previewSheets(preset, address.content), [preset, address.content]);
  const size = windowSizeOf(preset);

  return (
    <div className="flex flex-wrap items-start gap-4">
      {preview.sheets.map((sheet) => (
        <SheetFrame
          key={sheet.sheetId}
          preset={preset}
          size={size}
          initialSheet={sheet}
          sheets={preview.sheets}
          records={preview.records}
          rolling={stubRolling}
        />
      ))}
    </div>
  );
}

type SheetFrameProps = {
  preset: Preset;
  size: WindowSize;
  initialSheet: PreviewSheet;
  sheets: readonly PreviewSheet[];
  records: ReadonlyMap<string, VersionedRecord>;
  rolling: DiceRolling;
};

// One frame per initial template: the frame lists every template in its sidebar, and clicking a
// sidebar entry selects the template shown in that frame. The content is read-only and uses the
// same SheetHeader and SheetBody as the room window.
function SheetFrame({
  preset,
  size,
  initialSheet,
  sheets,
  records,
  rolling,
}: SheetFrameProps): ReactNode {
  const [selectedSheetId, setSelectedSheetId] = useState(initialSheet.sheetId);
  const [chosenTabs, setChosenTabs] = useState<ReadonlyMap<string, number>>(() => new Map());
  const sheet = sheets.find((candidate) => candidate.sheetId === selectedSheetId) ?? initialSheet;
  const policy = sheetPolicy(sheet.template, sheet.sheetId);
  const name = sheetName(records, preset, sheet.sheetId) ?? '';

  const sidebar = previewSidebarEntries(
    sheets.map((candidate) => ({
      template: candidate.template,
      sheetId: candidate.sheetId,
      name: sheetName(records, preset, candidate.sheetId) ?? '',
    })),
  );

  const visibleIndexes = sheet.template.tabs.map((_tab, index) => index);

  const openTab = openTabIndex(sheet.template, chosenTabs.get(sheet.sheetId));

  const tabs: ShellTab[] = visibleIndexes.map((index) => {
    const templateTab = sheet.template.tabs[index];

    return {
      id: templateTabKey(index),
      label: templateTabLabel(templateTab?.title),
    };
  });

  const header = (
    <SheetHeader
      sheetId={sheet.sheetId}
      name={name}
      nameField={policy.nameField}
      records={records}
      editing={null}
      status={policy.hidden ? null : policy.write === 'players-edit' ? 'can-edit' : 'read-only'}
      gm={null}
      focusName={false}
      onNameFocused={noop}
    />
  );

  const content = (
    <SheetBody
      template={sheet.template}
      sheetId={sheet.sheetId}
      openTab={openTab}
      records={records}
      editing={null}
      rolling={rolling}
      pending={null}
    />
  );

  const selectedSidebarEntry = sheetKey(sheet.sheetId);

  return (
    <figure className="flex shrink-0 flex-col gap-1">
      <figcaption className="text-label-sm text-text-muted">
        {sheet.template.title}, {size.width} × {size.height} px
      </figcaption>
      <div
        className="h-full overflow-clip rounded-window bg-surface text-body text-text"
        style={{ width: size.width, height: size.height }}
        data-preview-frame
      >
        <WindowFrame
          layout={{
            sidebar,
            selectedSidebarEntry,
            onSelectSidebarEntry: (id) => {
              const selected = sidebarSheetId(sidebar, id);

              if (selected !== null) {
                setSelectedSheetId(selected);
              }
            },
            tabs,
            selectedTab: openTab === null ? null : templateTabKey(openTab),
            onSelectTab: (id) => {
              const index = templateIndexFromKey(id);

              if (index !== null) {
                setChosenTabs((current) => new Map(current).set(sheet.sheetId, index));
              }
            },
            panelLabel: name === '' ? copy.unnamed : name,
            header,
            content,
            frameClassName: 'h-full',
          }}
        />
      </div>
    </figure>
  );
}

function noop(): void {
  // The preview focuses no name.
}
