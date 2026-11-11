import { z } from 'zod';

// What the dev-server plugin (`scripts/preview-plugin.ts`) and the preview page share. This module
// imports nothing from Node, so the page can import it.

// The plugin answers here with every listed preset file and its text.
export const PRESET_LIST_PATH = '/__muster-roll-preview/presets';

// The plugin sends this custom HMR event when a listed file is added, changed or removed.
export const PRESETS_CHANGED_EVENT = 'muster-roll-preview:presets-changed';

// `bun run preview <path>` puts the absolute launch path here, and the plugin reads it.
export const LAUNCH_FILE_VARIABLE = 'MUSTER_ROLL_PREVIEW_PRESET';

export const presetListSchema = z.array(
  z.strictObject({
    // The page address names the chosen file by this key.
    key: z.string().min(1),
    label: z.string(),
    // The file given to the launch command. It is first in the list.
    launch: z.boolean(),
    // `null` when the file could not be read, as after it was deleted.
    text: z.string().nullable(),
  }),
);

export type PresetListEntry = z.infer<typeof presetListSchema>[number];
