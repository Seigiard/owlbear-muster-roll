import { useEffect, useId, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { TabPanel, Tabs } from 'react-aria-components';

import {
  parsePresetFile,
  windowSizeOf,
  type Preset,
  type PresetTemplate,
  type WindowSize,
} from '@/core/preset';
import type { SheetData, VersionedRecord } from '@/core/records';
import { copy } from '@/ui/copy';
import { presetFailureMessage } from '@/ui/preset-errors';
import type { DiceRolling } from '@/ui/sheet/dice-button';
import { ReadOnlySheetHeader } from '@/ui/sheet/sheet-header';
import { SheetBody } from '@/ui/sheet/sheet-body';
import { TabBar, type ShellTab } from '@/ui/shell/tab-bar';
import { CONTENT_CLASS } from '@/ui/shell/window-shell';
import { applyTheme } from '@/ui/theme';

import { addressSearch, readAddress, type PreviewAddress } from './address';
import {
  PRESET_LIST_PATH,
  PRESETS_CHANGED_EVENT,
  presetListSchema,
  type PresetListEntry,
} from './protocol';
import { previewSheets, type PreviewSheet } from './sample-records';
import { createStubRolling } from './stub-rolling';
import { PREVIEW_THEMES } from './themes';

type ListState =
  | { kind: 'loading' }
  | { kind: 'failed' }
  | { kind: 'loaded'; entries: readonly PresetListEntry[] };

const CONTROL_CLASS = 'touch-target rounded-sm border border-line bg-surface px-2 text-text';

const SWITCH_CLASS = 'flex items-center gap-2';

// One stub for the page, so a roll in flight survives a redraw.
const stubRolling = createStubRolling();

// TASK-40: a dev-only page that draws a preset file as a player sees it, and draws it again on
// each save. It has no Owlbear, no background page and no engine.
export function PreviewPage(): ReactNode {
  const [address, setAddress] = useState(() => readAddress(window.location.search));
  const list = usePresetList();
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
  const sheets = useMemo(() => previewSheets(preset, address.content), [preset, address.content]);
  const size = windowSizeOf(preset);

  return (
    <div className="flex flex-wrap items-start gap-4">
      <SheetFrame
        title="Character sheet"
        kind="pc"
        size={size}
        sheet={sheets.character}
        template={preset.character}
        records={sheets.records}
        rolling={stubRolling}
      />
      <SheetFrame
        title="NPC sheet"
        kind="npc"
        size={size}
        sheet={sheets.npc}
        template={preset.npc}
        records={sheets.records}
        rolling={stubRolling}
      />
    </div>
  );
}

type SheetFrameProps = {
  title: string;
  kind: SheetData['kind'];
  size: WindowSize;
  sheet: PreviewSheet;
  template: PresetTemplate;
  records: ReadonlyMap<string, VersionedRecord>;
  rolling: DiceRolling;
};

// The window at the preset's window size, laid out as `WindowShell` lays out its tabs: the tab bar
// with the sheet's one tab, then the content area that scrolls inside. A character has a tab of its
// own name; NPCs share the pinned NPC tab. The read-only view a player gets: no edit inputs and no
// row controls.
function SheetFrame({
  title,
  kind,
  size,
  sheet,
  template,
  records,
  rolling,
}: SheetFrameProps): ReactNode {
  const tab: ShellTab = {
    id: sheet.sheetId,
    label: kind === 'pc' ? sheet.name : copy.place.npc,
    content: null,
  };

  return (
    <figure className="flex shrink-0 flex-col gap-1">
      <figcaption className="text-label-sm text-text-muted">
        {title}, {size.width} × {size.height} px
      </figcaption>
      <div
        className="flex flex-col overflow-hidden rounded-lg bg-surface text-body text-text"
        style={{ width: size.width, height: size.height }}
        data-preview-frame
      >
        <Tabs className="flex min-h-[0] flex-1 flex-col" selectedKey={tab.id}>
          <TabBar
            scrollingTabs={kind === 'pc' ? [tab] : []}
            pinnedTabs={kind === 'pc' ? [] : [tab]}
          />
          <TabPanel id={tab.id} className={CONTENT_CLASS}>
            <ReadOnlySheetHeader
              name={sheet.name}
              canEdit={false}
              variant={kind === 'pc' ? 'character' : 'npc'}
            />
            <SheetBody
              template={template}
              sheetId={sheet.sheetId}
              records={records}
              editing={null}
              rolling={rolling}
              pending={null}
            />
          </TabPanel>
        </Tabs>
      </div>
    </figure>
  );
}

// The list loads once, and again on each change the dev server reports. An older answer that lands
// after a newer one is dropped.
function usePresetList(): ListState {
  const [state, setState] = useState<ListState>({ kind: 'loading' });

  useEffect(() => {
    let latest = 0;
    let active = true;

    const load = (): void => {
      latest += 1;

      const request = latest;

      void fetchPresetList().then((next) => {
        if (active && request === latest) {
          setState(next);
        }
      });
    };

    load();

    const hot = import.meta.hot;

    hot?.on(PRESETS_CHANGED_EVENT, load);

    return () => {
      active = false;
      hot?.off(PRESETS_CHANGED_EVENT, load);
    };
  }, []);

  return state;
}

async function fetchPresetList(): Promise<ListState> {
  try {
    const response = await fetch(PRESET_LIST_PATH, { cache: 'no-store' });

    if (!response.ok) {
      return { kind: 'failed' };
    }

    const parsed = presetListSchema.safeParse(await response.json());

    return parsed.success ? { kind: 'loaded', entries: parsed.data } : { kind: 'failed' };
  } catch {
    return { kind: 'failed' };
  }
}
