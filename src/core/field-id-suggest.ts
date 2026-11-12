import { isFieldId, isTemplateId } from '@/core/field-id';

// CAP-24: the id the builder gives a new field or template, made once from its label or title.

// Russian letters in the common Latin spelling, so "Сила" gives `sila`.
const RUSSIAN_LATIN: ReadonlyMap<string, string> = new Map([
  ['а', 'a'],
  ['б', 'b'],
  ['в', 'v'],
  ['г', 'g'],
  ['д', 'd'],
  ['е', 'e'],
  ['ё', 'e'],
  ['ж', 'zh'],
  ['з', 'z'],
  ['и', 'i'],
  ['й', 'y'],
  ['к', 'k'],
  ['л', 'l'],
  ['м', 'm'],
  ['н', 'n'],
  ['о', 'o'],
  ['п', 'p'],
  ['р', 'r'],
  ['с', 's'],
  ['т', 't'],
  ['у', 'u'],
  ['ф', 'f'],
  ['х', 'kh'],
  ['ц', 'ts'],
  ['ч', 'ch'],
  ['ш', 'sh'],
  ['щ', 'shch'],
  ['ъ', ''],
  ['ы', 'y'],
  ['ь', ''],
  ['э', 'e'],
  ['ю', 'yu'],
  ['я', 'ya'],
]);

// A short id reads well in a formula. The suffix still fits a template id's limit.
const BASE_MAX_LENGTH = 32;

export const FALLBACK_FIELD_ID = 'field';

export const FALLBACK_TEMPLATE_ID = 'sheet';

const COMBINING_MARKS = /\p{Mn}/gu;

const NOT_ID_CHARACTERS = /[^a-z0-9_]+/g;

const EDGE_UNDERSCORES = /^_+|_+$/g;

// A field id from `label`: transliterated, lower case, words joined by "_", and unique among
// `taken` with a numeric suffix. An empty result is `field`.
export function suggestFieldId(label: string, taken: ReadonlySet<string>): string {
  return uniqueId(idBase(label, FALLBACK_FIELD_ID), taken, isFieldId);
}

// A template id from its title, by the same rules, unique among the preset's template ids.
export function suggestTemplateId(title: string, taken: ReadonlySet<string>): string {
  return uniqueId(idBase(title, FALLBACK_TEMPLATE_ID), taken, isTemplateId);
}

function idBase(text: string, fallback: string): string {
  // Russian letters go first: `й` and `ё` would lose their marks in the decomposition.
  const latin = Array.from(text.toLowerCase())
    .map((character) => RUSSIAN_LATIN.get(character) ?? character)
    .join('')
    .normalize('NFKD')
    .replace(COMBINING_MARKS, '')
    .replace(NOT_ID_CHARACTERS, '_')
    .replace(EDGE_UNDERSCORES, '')
    .slice(0, BASE_MAX_LENGTH)
    .replace(EDGE_UNDERSCORES, '');

  if (latin === '') {
    return fallback;
  }

  // An id cannot start with a digit.
  return /^[0-9]/.test(latin) ? `_${latin}` : latin;
}

// The base itself, or the base with `_2`, `_3` and so on: the first that the rules accept and
// nothing takes. A base the rules refuse, such as `d20` or `floor`, takes a suffix too.
function uniqueId(
  base: string,
  taken: ReadonlySet<string>,
  accepts: (id: string) => boolean,
): string {
  if (accepts(base) && !taken.has(base)) {
    return base;
  }

  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base}_${suffix}`;

    if (accepts(candidate) && !taken.has(candidate)) {
      return candidate;
    }
  }
}
