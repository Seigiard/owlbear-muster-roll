export {};

// Turns a junit XML report into a sorted list of `<status>\t<file> › <suite…> › <test>` lines.
// Usage: bun _bmad-output/implementation-artifacts/task-115-baseline/junit-list.ts <report.xml>
// Compare two lists with `comm -23 base.txt now.txt`: an empty result means no baseline test is
// missing or changed status.
const path = process.argv[2];

if (path === undefined) {
  console.error('usage: junit-list.ts <report.xml>');
  process.exit(2);
}

const xml = await Bun.file(path).text();
const decode = (text: string) =>
  text
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
const attr = (tag: string, name: string) => {
  const match = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);

  return match?.[1] === undefined ? '' : decode(match[1]);
};

const lines: string[] = [];
const suites: string[] = [];
const tokens = xml.matchAll(/<(\/?)(testsuite|testcase)\b([^>]*?)(\/?)>|<(skipped|failure|error)\b/g);
let open: { name: string; status: string } | null = null;

const close = () => {
  if (open !== null) {
    lines.push(`${open.status}\t${open.name}`);
    open = null;
  }
};

for (const token of tokens) {
  const [, closing, tag, attrs = '', selfClosing, child] = token;

  if (child !== undefined) {
    if (open !== null) {
      open.status = child === 'skipped' ? 'skip' : 'fail';
    }
    continue;
  }

  if (tag === 'testsuite') {
    if (closing === '/') {
      suites.pop();
    } else if (selfClosing !== '/') {
      suites.push(attr(attrs, 'name'));
    }
    continue;
  }

  if (closing === '/') {
    close();
    continue;
  }

  close();
  open = { name: [...suites, attr(attrs, 'name')].join(' › '), status: 'pass' };

  if (selfClosing === '/') {
    close();
  }
}

close();
console.log(lines.sort().join('\n'));
