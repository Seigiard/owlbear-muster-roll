import { DOWNLOAD_URL_LIFETIME_MS } from '@/core/timing';

// The Owlbear iframe may block downloads; only a live room can show whether this one works.
export function downloadJsonFile(fileName: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');

  link.href = url;
  link.download = fileName;
  // Some browsers ignore a click on a link that is not in the document.
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, DOWNLOAD_URL_LIFETIME_MS);
}
