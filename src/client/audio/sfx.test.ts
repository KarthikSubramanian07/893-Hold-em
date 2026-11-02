import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The engine reads the mute flag when the module loads, so each test stubs the
// browser first and then imports a fresh copy.

class FakeStorage {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
}

let storage: FakeStorage;
let created: number;

beforeEach(() => {
  vi.resetModules();
  storage = new FakeStorage();
  created = 0;
  vi.stubGlobal('localStorage', storage);
  // A context that counts constructions; the voices never get far enough to need more.
  class FakeContext {
    state = 'suspended';
    currentTime = 0;
    constructor() {
      created++;
    }
    resume() {
      this.state = 'running';
      return Promise.resolve();
    }
    suspend() {
      return Promise.resolve();
    }
  }
  vi.stubGlobal('window', { AudioContext: FakeContext });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const load = async () => (await import('./index')).sfx;

describe('sfx', () => {
  it('reads the saved mute choice', async () => {
    storage.setItem('893:muted', '1');
    expect((await load()).muted()).toBe(true);
  });

  it('defaults to sound on', async () => {
    expect((await load()).muted()).toBe(false);
  });

  it('saves the mute choice', async () => {
    const sfx = await load();
    sfx.setMuted(true);
    expect(storage.getItem('893:muted')).toBe('1');
    expect(sfx.muted()).toBe(true);
    sfx.setMuted(false);
    expect(storage.getItem('893:muted')).toBe('0');
  });

  it('makes no audio context and plays nothing before unlock', async () => {
    const sfx = await load();
    sfx.deal();
    sfx.win();
    sfx.ambience(true);
    sfx.hover();
    expect(created).toBe(0);
    expect(sfx.unlocked()).toBe(false);
  });

  it('survives storage that throws', async () => {
    vi.stubGlobal('localStorage', {
      getItem() {
        throw new Error('denied');
      },
      setItem() {
        throw new Error('denied');
      },
    });
    const sfx = await load();
    expect(sfx.muted()).toBe(false);
    expect(() => sfx.setMuted(true)).not.toThrow();
    expect(sfx.muted()).toBe(true);
  });

  it('is a no-op without WebAudio', async () => {
    vi.stubGlobal('window', {});
    const sfx = await load();
    expect(() => {
      sfx.unlock();
      sfx.click();
    }).not.toThrow();
    expect(sfx.unlocked()).toBe(false);
  });
});
