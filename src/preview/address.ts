import type { PreviewContent } from './sample-records';
import type { PreviewThemeName } from '@/ui/themes';

// What the page address keeps, so a reload or a shared link shows the same view.
export type PreviewAddress = {
  // The list key of the chosen file. `null`, or a key not in the list, shows the first file.
  preset: string | null;
  content: PreviewContent;
  theme: PreviewThemeName;
};

const PRESET_PARAM = 'preset';
const CONTENT_PARAM = 'content';
const THEME_PARAM = 'theme';

// Defaults stay out of the address: sample content, as a sheet in play, and Owlbear's dark theme.
export function readAddress(search: string): PreviewAddress {
  const params = new URLSearchParams(search);
  const preset = params.get(PRESET_PARAM);

  return {
    preset: preset === null || preset === '' ? null : preset,
    content: params.get(CONTENT_PARAM) === 'empty' ? 'empty' : 'sample',
    theme: params.get(THEME_PARAM) === 'light' ? 'light' : 'dark',
  };
}

// The query string of `address`, with its "?", or "" when every value is the default.
export function addressSearch(address: PreviewAddress): string {
  const params = new URLSearchParams();

  if (address.preset !== null) {
    params.set(PRESET_PARAM, address.preset);
  }

  if (address.content === 'empty') {
    params.set(CONTENT_PARAM, 'empty');
  }

  if (address.theme === 'light') {
    params.set(THEME_PARAM, 'light');
  }

  const search = params.toString();

  return search === '' ? '' : `?${search}`;
}
