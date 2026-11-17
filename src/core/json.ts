export type JsonPrimitive = string | number | boolean | null;

export type JsonObject = { [key: string]: JsonValue };

export type JsonValue = JsonPrimitive | JsonValue[] | JsonObject;

export type ReadonlyJsonValue =
  | JsonPrimitive
  | readonly ReadonlyJsonValue[]
  | { readonly [key: string]: ReadonlyJsonValue };

export function mutableJson(value: ReadonlyJsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map(mutableJson);
  }

  if (isReadonlyJsonPrimitive(value)) {
    return value;
  }

  if (isReadonlyJsonObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, mutableJson(item)]));
  }

  throw new Error('Unsupported readonly JSON value');
}

function isReadonlyJsonPrimitive(value: ReadonlyJsonValue): value is JsonPrimitive {
  return value === null || Object(value) !== value;
}

function isReadonlyJsonObject(
  value: ReadonlyJsonValue,
): value is { readonly [key: string]: ReadonlyJsonValue } {
  return value !== null && !Array.isArray(value) && Object(value) === value;
}

export function canonicalJson(value: JsonValue): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;

  if (isJsonObject(value)) {
    return `{${Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key] ?? null)}`)
      .join(',')}}`;
  }

  return JSON.stringify(value);
}

// Two JSON values with the same content. Object keys compare as a set, so key order does not count.
export function sameJson(first: JsonValue, second: JsonValue): boolean {
  if (first === second) {
    return true;
  }

  if (Array.isArray(first) || Array.isArray(second)) {
    return (
      Array.isArray(first) &&
      Array.isArray(second) &&
      first.length === second.length &&
      first.every((item, index) => {
        const other = second[index];

        return other !== undefined && sameJson(item, other);
      })
    );
  }

  if (!isJsonObject(first) || !isJsonObject(second)) {
    return false;
  }

  const keys = Object.keys(first);

  return (
    keys.length === Object.keys(second).length &&
    keys.every((key) => {
      const value = first[key];
      const other = second[key];

      return value !== undefined && other !== undefined && sameJson(value, other);
    })
  );
}

function isJsonObject(value: JsonValue): value is JsonObject {
  return value !== null && !Array.isArray(value) && Object(value) === value;
}
