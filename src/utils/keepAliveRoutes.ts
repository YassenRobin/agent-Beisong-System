export const KEEP_ALIVE_PATHS = [
  '/',
  '/agent',
  '/articles',
  '/questions',
  '/ai-generate',
  '/weak-points',
  '/train',
  '/creative-recite',
  '/rogue',
  '/favorites',
  '/wrong',
  '/rankings',
  '/api',
] as const;

export type KeepAlivePath = typeof KEEP_ALIVE_PATHS[number];

export function isKeepAlivePath(pathname: string): boolean {
  return KEEP_ALIVE_PATHS.includes(pathname as KeepAlivePath);
}

export function getKeepAlivePath(pathname: string): KeepAlivePath | null {
  return isKeepAlivePath(pathname) ? pathname as KeepAlivePath : null;
}
