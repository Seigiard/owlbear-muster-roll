export const FORMULA_FUNCTION_NAMES = ['floor', 'ceil'] as const;

const FIELD_ID_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

// A formula reads `d20` as a dice term, so no field can carry that id.
const DICE_TERM_PATTERN = /^[dD][0-9]+$/;

const FUNCTION_NAMES: ReadonlySet<string> = new Set(FORMULA_FUNCTION_NAMES);

// Field ids become object keys in records, where a prototype member name reads an inherited value.
const PROTOTYPE_MEMBER_NAMES: ReadonlySet<string> = new Set(
  Object.getOwnPropertyNames(Object.prototype),
);

export function isFieldId(id: string): boolean {
  return (
    FIELD_ID_PATTERN.test(id) &&
    !DICE_TERM_PATTERN.test(id) &&
    !FUNCTION_NAMES.has(id) &&
    !PROTOTYPE_MEMBER_NAMES.has(id)
  );
}

// A template id follows the field id rules. It also names a single sheet's sheet id and a
// sheet's `set`, so it stays within the sheet id length.
export const TEMPLATE_ID_MAX_LENGTH = 64;

export function isTemplateId(id: string): boolean {
  return id.length <= TEMPLATE_ID_MAX_LENGTH && isFieldId(id);
}
