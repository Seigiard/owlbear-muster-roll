import exampleText from '../../docs/example-preset.json?raw';
import d20Text from '../../tests/fixtures/presets/d20.json?raw';
import d6PoolText from '../../tests/fixtures/presets/d6-pool.json?raw';

import { copy } from '@/ui/copy';

// The repository presets the builder offers under "Открыть…". `name` starts the download file name.
export type BuilderExample = { key: string; label: string; name: string; text: string };

export const BUILDER_EXAMPLES: readonly BuilderExample[] = [
  { key: 'example', label: copy.builder.openExample, name: 'example-preset', text: exampleText },
  { key: 'd20', label: copy.builder.openD20, name: 'd20', text: d20Text },
  { key: 'd6-pool', label: copy.builder.openD6Pool, name: 'd6-pool', text: d6PoolText },
];
