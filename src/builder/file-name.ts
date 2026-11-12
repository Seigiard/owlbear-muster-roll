import { BLANK_NAME } from './builder-store';

// The time an earlier download added to a name, as `-2026-11-12-0930`.
const TIME_SUFFIX = /-\d{4}-\d{2}-\d{2}-\d{4}$/;

const JSON_EXTENSION = /\.json$/i;

// The draft's name from an opened file's name: no extension and no earlier time suffix, so a file
// downloaded twice does not collect two times.
export function nameFromFile(fileName: string): string {
  const name = fileName.replace(JSON_EXTENSION, '').replace(TIME_SUFFIX, '').trim();

  return name === '' ? BLANK_NAME : name;
}

// `{name}-{YYYY-MM-DD-HHmm}.json` in local time.
export function downloadFileName(name: string, now: Date): string {
  const date = [now.getFullYear(), now.getMonth() + 1, now.getDate()].map(twoDigits).join('-');
  const time = `${twoDigits(now.getHours())}${twoDigits(now.getMinutes())}`;

  return `${name}-${date}-${time}.json`;
}

function twoDigits(value: number): string {
  return String(value).padStart(2, '0');
}
