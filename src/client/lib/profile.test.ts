import { describe, expect, it } from 'vitest';
import { NAME_MAX } from '../../protocol';
import { getPid, loadMuted, loadProfile, PROFILE_KEY, saveMuted, saveProfile, tidyName, type KV } from './profile';

function memory(): KV & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

describe('profile persistence', () => {
  it('round-trips a profile', () => {
    const kv = memory();
    expect(loadProfile(kv)).toBeNull();
    saveProfile({ name: '  Mio  ', avatar: 'koi' }, kv);
    expect(loadProfile(kv)).toEqual({ name: 'Mio', avatar: 'koi' });
  });

  it('rejects junk in storage', () => {
    const kv = memory();
    kv.setItem(PROFILE_KEY, '{not json');
    expect(loadProfile(kv)).toBeNull();
    kv.setItem(PROFILE_KEY, JSON.stringify({ name: 'Ren', avatar: 'dragon' }));
    expect(loadProfile(kv)).toBeNull();
    kv.setItem(PROFILE_KEY, JSON.stringify({ name: '   ', avatar: 'koi' }));
    expect(loadProfile(kv)).toBeNull();
  });

  it('caps names at the protocol limit, counting kanji as one', () => {
    expect(Array.from(tidyName('親分'.repeat(20))).length).toBe(NAME_MAX);
    expect(tidyName('a   b')).toBe('a b');
  });

  it('survives missing storage', () => {
    expect(loadProfile(null)).toBeNull();
    expect(saveProfile({ name: 'Sora', avatar: 'tsuru' }, null)).toEqual({ name: 'Sora', avatar: 'tsuru' });
  });

  it('makes a stable pid once', () => {
    const kv = memory();
    const a = getPid(kv);
    expect(a).toMatch(/^[A-Za-z0-9]{21}$/);
    expect(getPid(kv)).toBe(a);
  });

  it('remembers mute', () => {
    const kv = memory();
    expect(loadMuted(kv)).toBe(false);
    saveMuted(true, kv);
    expect(loadMuted(kv)).toBe(true);
  });
});
