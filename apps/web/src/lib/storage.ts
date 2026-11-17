/**
 * localStorage can throw (private mode, blocked storage) or be empty; the
 * game must work either way, so every access is guarded.
 */
export function readLocal(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeLocal(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // not persisted; fine
  }
}

const NAME_KEY = 'lagswitch.name';
const ADJECTIVES = ['laggy', 'jittery', 'buffering', 'offline', 'throttled', 'dropped'];
const NOUNS = ['router', 'packet', 'modem', 'socket', 'ping', 'cable'];

const pick = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)] as T;

export function getPlayerName(): string {
  const saved = readLocal(NAME_KEY);
  if (saved && /^[\p{L}\p{N} _.-]{1,16}$/u.test(saved)) return saved;
  const name = `${pick(ADJECTIVES)}_${pick(NOUNS)}`;
  writeLocal(NAME_KEY, name);
  return name;
}

export function setPlayerName(name: string): string {
  const clean = name
    .replace(/[^\p{L}\p{N} _.-]/gu, '')
    .trim()
    .slice(0, 16);
  if (clean) writeLocal(NAME_KEY, clean);
  return clean || getPlayerName();
}
