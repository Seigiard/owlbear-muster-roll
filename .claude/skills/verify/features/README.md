# Muster Roll feature map

Run `bun run verify list` for the executable selection and unmapped specs.
Every filename below is under `tests/` and ends in `.e2e.ts`.
Run `bun run verify full` for every discovered browser spec.

| Profile | Feature | Existing specs |
| --- | --- | --- |
| `sheets` | [Sheets and navigation](sheets.md) | `characters`, `delete`, `field-edit`, `select-field`, `cell-name`, `sheet-layout`, `single-sheets`, `templates`, `sidebar`, `tabs`, `repeat-blocks`, `repeat-tabs`, `nested-repeat`, `navigation-v4`, `repeat-tab-context`, `window`, `primitives` |
| `builder` | [Builder](builder.md) | `builder`, `builder-snapshot` |
| `players` | [Player access](player-access.md) | `access`, `owner`, `player`, `propose`, `pending`, `no-gm`, `hidden-tabs`, `hidden-sheets`, `liveness` |
| `rolls` | [Rolls](rolls.md) | `roll`, `dice-choice-field`, `dice-extension`, `repeat-tab-dice` |
| `tokens` | [Token links and selection](tokens.md) | `link`, `open`, `selection` |
| `data` | [Snapshots](snapshots.md) and [room data](room-data.md) | `preset`, `preset-change`, `snapshot`, `room-copy`, `wipe`, `catch-up`, `replica`, `sync`, `duplicate` |
| `platform` | [Platform boundary](platform.md) | `smoke`, `port-contract-storage` |

`quick` runs only tests tagged `@verify-quick`. Those journeys cover an actual
download/import/restart round trip, a populated section moved by a preset
change, and a persisted dice choice whose option is removed.
They supplement existing tests; they do not replace the feature profiles.
The profiles group whole spec files. For preset layout changes, run `quick`,
`data` and `sheets`. For dice-choice option changes, run `quick`, `data` and
`rolls`. Those combinations include cross-feature journeys whose files belong
to another group.

## Coverage limits

- The builder's native file-input fallback lacks a full browser round trip
  without the File System Access fake. The pending builder candidate is not
  integrated by this task.
- TASK-109 records copied nested token reveal that loses the parent path.
  A green unrelated token test does not close that defect.
- Mock tests do not establish real Owlbear delivery, host quotas, external
  dice interoperability or native OS file-picker behavior.
- Multiple GM clients and fault scenarios already present in the suite remain
  included in `full`. This task adds no new rare-race or multi-GM scope.
- Passing every listed test does not establish exhaustive interaction coverage.
- The new characterization journeys have passed on the current implementation.
  They have not been calibrated by deliberately introducing each protected
  defect. No mutation-probe result is claimed.
