import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EGG_EVENT,
  type EggDetail,
  REPO_URL,
  catVisits,
  checkCode,
  checkName,
  clickCounter,
  greetConsole,
  installEggs,
  keyMatcher,
  lanternClick,
  nightOf,
  useEggs,
} from './eggs';
import { useMatchbook } from './stamps';

function key(target: EventTarget, k: string, over: Record<string, unknown> = {}) {
  const e = new Event('keydown');
  // Own properties shadow Event's getters, which is enough to fake a KeyboardEvent.
  for (const [name, value] of Object.entries({ key: k, ...over })) Object.defineProperty(e, name, { value });
  target.dispatchEvent(e);
}

function listen(target: EventTarget): EggDetail[] {
  const got: EggDetail[] = [];
  target.addEventListener(EGG_EVENT, (e) => got.push((e as CustomEvent<EggDetail>).detail));
  return got;
}

beforeEach(() => {
  useEggs.setState({ last: null, count: 0, session: [] });
  useMatchbook.getState().reset();
});

describe('keyMatcher', () => {
  it('finds 893 anywhere in a stream of keys', () => {
    const m = keyMatcher();
    expect(['1', '8', '9'].map(m)).toEqual([null, null, null]);
    expect(m('3')).toBe('neon');
    expect(['8', '9', '4'].map(m)).toEqual([null, null, null]);
  });

  it('knows the Konami code, case-insensitively', () => {
    const m = keyMatcher();
    const code = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'B', 'A'];
    expect(code.map(m).at(-1)).toBe('konami');
    expect(code.slice(1).map(m).at(-1)).toBeNull();
  });

  it('hears a toast', () => {
    const m = keyMatcher();
    expect([...'kanpai'].map(m).at(-1)).toBe('kanpai');
  });
});

describe('clickCounter', () => {
  it('fires on the eighth click inside the window, then starts over', () => {
    const c = clickCounter(8, 4000);
    const fired = Array.from({ length: 8 }, (_, i) => c(1000 + i * 100));
    expect(fired.slice(0, 7).every((f) => !f)).toBe(true);
    expect(fired[7]).toBe(true);
    expect(c(2000)).toBe(false);
  });

  it('forgets slow clicks', () => {
    const c = clickCounter(8, 4000);
    expect(Array.from({ length: 8 }, (_, i) => c(i * 1000)).some(Boolean)).toBe(false);
  });
});

describe('installEggs', () => {
  it('announces key eggs as events and in the store', () => {
    const target = new EventTarget();
    const got = listen(target);
    const stop = installEggs({ target, console: false, now: () => new Date(2026, 10, 1, 21) });
    for (const k of ['8', '9', '3']) key(target, k);
    expect(got.map((g) => g.id)).toEqual(['neon']);
    expect(got[0]!.line?.speaker).toBe('master');
    expect(useEggs.getState().last?.id).toBe('neon');
    expect(useMatchbook.getState().data.eggs).toContain('neon');
    stop();
    for (const k of ['8', '9', '3']) key(target, k);
    expect(got).toHaveLength(1);
  });

  it('ignores typing in fields, held keys, and shortcuts', () => {
    const target = new EventTarget();
    const got = listen(target);
    const stop = installEggs({ target, console: false, now: () => new Date(2026, 10, 1, 21) });
    for (const k of ['8', '9', '3']) key(target, k, { target: { tagName: 'INPUT' } });
    for (const k of ['8', '9', '3']) key(target, k, { metaKey: true });
    for (const k of ['8', '9', '3']) key(target, k, { repeat: true });
    expect(got).toEqual([]);
    stop();
  });

  it('slides out the hidden card and stamps it for the Konami code', () => {
    const target = new EventTarget();
    const got = listen(target);
    const stop = installEggs({ target, console: false, now: () => new Date(2026, 10, 1, 21) });
    for (const k of ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a']) key(target, k);
    expect(got.map((g) => g.id)).toEqual(['konami']);
    expect(got[0]!.line?.kanji).toBe('豚');
    expect(useMatchbook.getState().data.stamps.buta).toBeTypeOf('number');
    stop();
  });

  it('notices three in the morning once', () => {
    const target = new EventTarget();
    const got = listen(target);
    const at3 = () => new Date(2026, 10, 1, 3, 5);
    installEggs({ target, console: false, now: at3 })();
    installEggs({ target, console: false, now: at3 })();
    expect(got.map((g) => g.id)).toEqual(['three-am']);
  });
});

describe('names, codes, the lantern, the cat', () => {
  it('reacts to names once a session', () => {
    const target = new EventTarget();
    const got = listen(target);
    expect(checkName('Karthik', target)).toBeNull();
    expect(checkName(' oyabun ', target)?.id).toBe('oyabun');
    expect(checkName('親分', target)).toBeNull();
    expect(checkName('Master', target)?.id).toBe('master');
    expect(checkName('Kyū', target)?.id).toBe('cat-name');
    expect(got.map((g) => g.id)).toEqual(['oyabun', 'master', 'cat-name']);
  });

  it('greets codes with 893 in them', () => {
    const target = new EventTarget();
    expect(checkCode('K7QX2', target)).toBeNull();
    expect(checkCode('A893B', target)?.id).toBe('code-893');
  });

  it('gutters the lantern on the eighth quick click', () => {
    const target = new EventTarget();
    const got = listen(target);
    for (let i = 0; i < 8; i++) lanternClick(target, 10_000 + i * 200);
    expect(got.map((g) => g.id)).toEqual(['lantern']);
  });

  it('brings the cat on nights with a nine in them, and on some others', () => {
    expect(catVisits('K7QX2', new Date(2026, 10, 9, 23))).toBe(true);
    expect(catVisits('K7QX2', new Date(2026, 10, 19, 22))).toBe(true);
    // 2 a.m. on the 10th is still the night of the 9th.
    expect(nightOf(new Date(2026, 10, 10, 2)).day).toBe(9);
    expect(catVisits('K7QX2', new Date(2026, 10, 10, 2))).toBe(true);
    const codes = Array.from({ length: 600 }, (_, i) => `C${i}`);
    const visits = codes.filter((c) => catVisits(c, new Date(2026, 10, 12, 22))).length;
    expect(visits).toBeGreaterThan(60);
    expect(visits).toBeLessThan(150);
    // Every client at a table agrees.
    expect(catVisits('K7QX2', new Date(2026, 10, 12, 22))).toBe(catVisits('K7QX2', new Date(2026, 10, 12, 23, 59)));
  });
});

describe('the console', () => {
  it('prints a hanko and the way to the source', () => {
    const log = vi.fn();
    greetConsole({ log });
    const all = log.mock.calls.flat().join('\n');
    expect(all).toContain('八');
    expect(all).toContain(REPO_URL);
    expect(all).toContain('MIT');
  });
});
