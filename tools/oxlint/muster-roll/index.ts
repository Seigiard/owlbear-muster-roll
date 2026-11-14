import { eslintCompatPlugin } from '@oxlint/plugins';

import { noHandAssembledClassNameRule } from './rules/no-hand-assembled-classname.ts';

/** Project-specific lint rules for Muster Roll source code. */
const musterRollPlugin = eslintCompatPlugin({
  meta: { name: 'muster-roll' },
  rules: {
    'no-hand-assembled-classname': noHandAssembledClassNameRule,
  },
});

export default musterRollPlugin;
