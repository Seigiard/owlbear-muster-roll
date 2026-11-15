export function anchorLines(source: string, find: string): number[] {
  const lines: number[] = [];
  let index = 0;

  while ((index = source.indexOf(find, index)) !== -1) {
    lines.push(source.slice(0, index).split('\n').length);
    index += find.length;
  }

  return lines;
}

export function describeStale(source: string, find: string): string {
  const lines = anchorLines(source, find);

  if (lines.length > 1) {
    return `anchor matches ${lines.length} times, at lines ${lines.join(', ')}`;
  }

  const findLines = find.split('\n');

  const missing = findLines.findIndex(
    (line) => line.trim() !== '' && !source.includes(line.trim()),
  );

  if (missing === -1) {
    return 'anchor not found; each of its lines exists, but not as one block';
  }

  return `anchor not found; its line ${missing + 1} is gone: ${findLines[missing].trim()}`;
}
