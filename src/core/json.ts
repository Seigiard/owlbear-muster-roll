export type JsonPrimitive = string | number | boolean | null;

export type JsonObject = { [key: string]: JsonValue };

export type JsonValue = JsonPrimitive | JsonValue[] | JsonObject;

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

  if (!(first instanceof Object) || !(second instanceof Object)) {
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
