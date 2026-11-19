/** Theme tokens live in styles.css ([data-theme]); the choice is persisted in localStorage (device setting, not in backups). */
export type Theme = 'dark' | 'light';
export const THEME_KEY = 'diyet.theme';
export const THEME_LABEL: Record<Theme, string> = { dark: 'Gece (koyu, varsayılan)', light: 'Krem & Adaçayı (açık)' };
export function getTheme(): Theme { try { return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark'; } catch { return 'dark'; } }
export function applyTheme(t: Theme = getTheme()) {
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'light' ? '#F5F0E6' : '#121416');
}
export function setTheme(t: Theme) { try { localStorage.setItem(THEME_KEY, t); } catch { /* private mode */ } applyTheme(t); }
