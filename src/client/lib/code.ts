// Room codes as people actually type them: lowercase, with spaces or a dash,
// sometimes pasted as the whole invite link.
import { CODE_RE } from '../../protocol';

/** Uppercase and strip everything that cannot be part of a code. Accepts a full invite URL. */
export function normalizeCode(raw: string): string {
  const s = raw.trim();
  const fromUrl = /\/t\/([A-Za-z0-9]+)/.exec(s);
  const body = fromUrl ? fromUrl[1]! : s;
  return body.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function isValidCode(raw: string): boolean {
  return CODE_RE.test(raw);
}

/** Parse what a person typed into a code, or null if it can't be one. */
export function parseCode(raw: string): string | null {
  const c = normalizeCode(raw);
  return isValidCode(c) ? c : null;
}

export function inviteUrl(origin: string, code: string): string {
  return `${origin.replace(/\/+$/, '')}/t/${code}`;
}
