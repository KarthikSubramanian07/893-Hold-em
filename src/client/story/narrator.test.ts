import { describe, expect, it } from 'vitest';
import type { GameView } from '../../engine/types';
import { classifyShowdown, lowestMeter, markerCrossed, nodKind, playedYakuza } from './analysis';
import { entry, fixture, hv, scriptedNight, seatOver, withResult } from './fixtures';
import { CHAPTERS, REVEAL } from './lines';
import { idleLine, narrate } from './narrator';
import { REGULARS } from './regulars';

const EVENING = new Date(2026, 10, 1, 21, 15);
const ctx = { now: EVENING };

const ids = (lines: { id: string }[]) => lines.map((l) => l.id.split(':').slice(2).join(':'));

/** A showdown pair: the call, then the resolved hand. */
function showdown(edit: (v: GameView) => GameView = (v) => v): [GameView, GameView] {
  return [fixture('call'), edit(fixture('showdown'))];
}

/** Lines everyone at the table hears (not the welcome or your own reveal). */
const shared = (lines: { id: string }[]) => lines.filter((l) => !l.id.includes(':reveal:'));

describe('determinism', () => {
  it('gives the same lines for the same views, every time', () => {
    const run = () => {
      let prev: GameView | null = null;
      return scriptedNight().map((s) => {
        const out = narrate(prev, s.view, 's0', ctx);
        prev = s.view;
        return out;
      });
    };
    expect(run()).toEqual(run());
  });

  it('gives every seat at the table the same shared lines', () => {
    const steps = scriptedNight();
    for (let i = 1; i < steps.length; i++) {
      const a = narrate(steps[i - 1]!.view, steps[i]!.view, 's0', ctx);
      const b = narrate(steps[i - 1]!.view, steps[i]!.view, 's1', { ...ctx, returning: true });
      // Joins skip the viewer's own seat, so compare from the first hand on.
      if (steps[i]!.view.phase !== 'lobby') expect(shared(b)).toEqual(shared(a));
    }
  });

  it('varies the welcome between tables', () => {
    const texts = new Set<string>();
    for (const code of ['AAAAA', 'BBBBB', 'CCCCC', 'DDDDD', 'EEEEE', 'FFFFF', 'GGGGG', 'HHHHH']) {
      texts.add(narrate(null, fixture('lobby', { code }), 's0', { ...ctx, returning: false })[0]!.text);
    }
    expect(texts.size).toBeGreaterThan(1);
  });

  it('says nothing when nothing changed', () => {
    const v = fixture('call');
    expect(narrate(v, v, 's0', ctx)).toEqual([]);
  });

  it('never uses an exclamation point and fills every template hole', () => {
    let prev: GameView | null = null;
    for (const s of scriptedNight()) {
      for (const l of narrate(prev, s.view, 's0', ctx)) {
        expect(l.text).not.toMatch(/[!！{}]/);
        expect(l.hold).toBeGreaterThan(0);
      }
      prev = s.view;
    }
  });
});

describe('welcome', () => {
  const lobby = fixture('lobby');

  it('greets a first visit and a return differently', () => {
    const first = narrate(null, lobby, 's0', { ...ctx, returning: false });
    const back = narrate(null, lobby, 's0', { ...ctx, returning: true });
    expect(ids(first)).toEqual(['welcome:first']);
    expect(ids(back)).toEqual(['welcome:returning']);
    expect(first[0]!.speaker).toBe('master');
  });

  it('never tells a practice player to send a link', () => {
    for (const returning of [false, true]) {
      const said = narrate(null, { ...lobby, code: 'ALONE' }, 's0', { ...ctx, returning });
      expect(ids(said)).toEqual(['welcome:practice']);
      expect(said[0]!.text).not.toMatch(/link/i);
    }
  });

  it('notices a table code with 893 in it', () => {
    expect(ids(narrate(null, { ...lobby, code: 'Q893K' }, 's0', ctx))).toEqual(['welcome:code893']);
    expect(ids(narrate(null, { ...lobby, code: 'Q839K' }, 's0', ctx))).toEqual(['welcome:first']);
  });

  it('has a remark for anyone who calls themselves the boss', () => {
    const v = seatOver(lobby, 's0', { name: 'Oyabun' });
    const [l] = narrate(null, v, 's0', ctx);
    expect(l!.id).toMatch(/welcome:oyabun$/);
    expect(l!.kanji).toBe('親分');
    expect(ids(narrate(null, seatOver(lobby, 's0', { name: '親分' }), 's0', ctx))).toEqual(['welcome:oyabun']);
  });

  it('knows when it is really three in the morning', () => {
    expect(ids(narrate(null, lobby, 's0', { now: new Date(2026, 10, 1, 3, 12) }))).toEqual(['welcome:threeAm']);
  });

  it('seats spectators and rejoining players without the full welcome', () => {
    expect(ids(narrate(null, lobby, null, ctx))).toEqual(['welcome:spectator']);
    expect(ids(narrate(null, fixture('call'), 's0', ctx))).toEqual(['welcome:rejoin']);
  });

  it('treats a new room code as a fresh arrival', () => {
    expect(ids(narrate(fixture('call'), { ...lobby, code: 'ZZZZZ' }, 's0', ctx))).toEqual(['welcome:first']);
  });
});

describe('joins', () => {
  const lobby = fixture('lobby');

  it('lets a regular introduce themselves', () => {
    const next = { ...lobby, seats: [...lobby.seats, { ...lobby.seats[2]!, id: 's4', name: 'Mame', bot: true }] };
    const [l, ...rest] = narrate(lobby, next, 's0', ctx);
    expect(rest).toEqual([]);
    expect(l!.speaker).toBe('Mame');
    expect(l!.kanji).toBe('豆');
  });

  it('has the Master name a new human', () => {
    const next = { ...lobby, seats: [...lobby.seats, { ...lobby.seats[1]!, id: 's2', name: 'Ren', bot: false }] };
    const [l] = narrate(lobby, next, 's0', ctx);
    expect(l!.speaker).toBe('master');
    expect(l!.text).toContain('Ren');
  });

  it('does not announce the viewer to themselves', () => {
    const before = { ...lobby, seats: lobby.seats.slice(1) };
    expect(narrate(before, lobby, 's0', ctx)).toEqual([]);
  });

  it('says one line even when several sit down at once', () => {
    const before = { ...lobby, seats: lobby.seats.slice(0, 1) };
    expect(narrate(before, lobby, 's0', ctx)).toHaveLength(1);
  });
});

describe('the night and its hands', () => {
  it('opens the night with one line about the table', () => {
    for (const table of ['shitamachi', 'kabukicho', 'oyabun'] as const) {
      const config = { difficulty: table, timer: 30 as const };
      const out = narrate(fixture('lobby', { config }), fixture('nod', { config }), 's0', ctx);
      expect(ids(out)).toEqual([`night:${table}`]);
      expect(out[0]!.kanji).toBe(CHAPTERS[table].kanji);
      expect(CHAPTERS[table].intro).toContain(out[0]!.text);
    }
  });

  it('starts a second night in the same room', () => {
    expect(ids(narrate(fixture('over'), fixture('nod', { night: 2 }), 's0', ctx))).toEqual(['night:shitamachi']);
  });

  it('lets an ordinary hand go by without a word', () => {
    expect(narrate(fixture('showdown'), fixture('nod', { hand: 4 }), 's0', ctx)).toEqual([]);
  });

  it('calls last orders, and knows how far the door is', () => {
    const out = narrate(fixture('showdown', { hand: 9 }), fixture('nod', { hand: 10, meter: 2 }), 's0', ctx);
    expect(ids(out)).toEqual(['hand:last']);
    expect(out[0]!.text).toContain('9 steps');
    const near = narrate(fixture('showdown', { hand: 9 }), fixture('nod', { hand: 10, meter: 9 }), 's0', ctx);
    expect(near[0]!.text).toMatch(/door is right there/);
    const hot = narrate(fixture('showdown', { hand: 9 }), fixture('nod', { hand: 10, meter: -7 }), 's0', ctx);
    expect(hot[0]!.mood).toBe('danger');
  });
});

describe('the nods', () => {
  const toCall = (edit: (v: GameView) => GameView) => narrate(fixture('nod', { hand: 3 }), edit(fixture('call')), 's0', ctx);

  it('reads the patterns worth a word', () => {
    // Mio's two neighbours both nodded at Mio.
    expect(nodKind(fixture('call'))?.kind).toBe('pile-on');
    expect(nodKind(seatOver(fixture('call'), 's2', { nod: 's3' }))).toBeNull();
    // Both of Ren's neighbours nodded at Ren.
    const pile = seatOver(fixture('call'), 's1', { nod: 's2' });
    expect(nodKind(seatOver(pile, 's3', { nod: 's2' }))?.kind).toBe('pile-on');
    const none = { ...fixture('call'), seats: fixture('call').seats.map((s) => ({ ...s, nod: null })) };
    expect(nodKind(none)?.kind).toBe('all-pass');
    const quiet = seatOver(seatOver(fixture('call'), 's2', { nod: null }), 's3', { nod: null });
    const mutual = seatOver(quiet, 's1', { nod: 's0' });
    expect(nodKind(seatOver(mutual, 's0', { nod: 's1' }))?.kind).toBe('mutual');
  });

  it('names the teammate both neighbours nodded at', () => {
    const out = toCall((v) => ({ ...v, seats: v.seats.map((s) => ({ ...s, nod: s.id === 's1' || s.id === 's3' ? 's2' : null })) }));
    expect(ids(out)).toEqual(['nods:pile-on']);
    expect(out[0]!.text).toContain('Ren');
    expect(out[0]!.kanji).toBe('頷');
  });

  it('sometimes remarks on a table where nobody nodded', () => {
    let spoke = 0;
    for (let i = 0; i < 30; i++) {
      const code = `N${String(i).padStart(4, '0')}`;
      const out = narrate({ ...fixture('nod'), hand: 3, code }, { ...fixture('call'), code, seats: fixture('call').seats.map((s) => ({ ...s, nod: null })) }, 's0', ctx);
      if (out.length) {
        spoke++;
        expect(ids(out)).toEqual(['nods:all-pass']);
      }
    }
    expect(spoke).toBeGreaterThan(3);
    expect(spoke).toBeLessThan(27);
  });
});

describe('the marker', () => {
  it('finds the step before either end', () => {
    expect(markerCrossed({ meter: 7, door: 9, sirens: 6 }, { meter: 8, door: 9, sirens: 6 })).toBe('door-near');
    expect(markerCrossed({ meter: -3, door: 9, sirens: 6 }, { meter: -5, door: 9, sirens: 6 })).toBe('sirens-near');
    expect(markerCrossed({ meter: 8, door: 9, sirens: 6 }, { meter: 8, door: 9, sirens: 6 })).toBeNull();
    expect(markerCrossed({ meter: -5, door: 9, sirens: 6 }, { meter: -4, door: 9, sirens: 6 })).toBeNull();
    expect(lowestMeter([entry(1, 'crew', 2, 2), entry(2, 'house', -4, 4), entry(3, 'crew', 3, 3)])).toBe(-2);
  });

  it('speaks when the marker lands a step from the sirens or the door', () => {
    const [prev, next] = showdown((v) => ({ ...v, meter: -7 }));
    const out = narrate({ ...prev, meter: -4 }, withResult(next, { outcome: 'house', moved: -3 }), 's0', ctx);
    expect(ids(out)).toContain('marker:sirens-near');
    const up = narrate({ ...prev, meter: 7 }, { ...next, meter: 10 }, 's0', ctx);
    expect(ids(up)).toContain('marker:door-near');
  });
});

describe('the showdown', () => {
  const classify = (edit: (v: GameView) => GameView) => classifyShowdown(edit(fixture('showdown'))).kind;

  it('reads ordinary outcomes', () => {
    expect(classify((v) => withResult(v, { outcome: 'house', crewBest: hv(2, 'pair', 'Pair of twos', ['2c', '2d', 'Kh', '9s', '4h']) }))).toBe('house');
    expect(classify((v) => withResult(v, { outcome: 'tie' }))).toBe('tie');
    expect(classify((v) => withResult(v, { outcome: 'walked', crewBest: null, ins: [] }))).toBe('walked');
  });

  it('calls a bad beat when a full house or better loses', () => {
    expect(classify((v) => withResult(v, { outcome: 'house' }))).toBe('bad-beat');
  });

  it('crowns a royal flush on either side', () => {
    const royal = hv(9_000_000, 'straight-flush', 'Royal flush', ['Ah', 'Kh', 'Qh', 'Jh', 'Th']);
    expect(classify((v) => withResult(v, { crewBest: royal }))).toBe('royal');
    expect(classify((v) => withResult(v, { outcome: 'house', houseBest: royal }))).toBe('royal');
  });

  it('hears 8-9-3 in the champion’s cards and the board', () => {
    const v = seatOver({ ...fixture('showdown'), board: ['3c', 'Kh', '7s', '2c', 'Qh'] }, 's1', { cards: ['8h', '9d'] });
    expect(playedYakuza(v.seats[1]!, v.board)).toBe(true);
    expect(classifyShowdown(v).kind).toBe('yakuza');
    expect(playedYakuza({ ...v.seats[1]!, hand: null, cards: ['Kd', 'Qs'] }, ['8c', '9c', '3c', '2d', '4d'])).toBe(false);
  });

  it('notices a teammate who sat out holding the winner', () => {
    const v = withResult(fixture('showdown'), { outcome: 'house', crewBest: hv(2, 'pair', 'Pair of twos', ['2c', '2d', 'Kh', '9s', '4h']), couldHave: ['s2'] });
    const said = classifyShowdown(v);
    expect(said.kind).toBe('sat-out');
    expect(said.seat?.id).toBe('s2');
    const out = narrate(fixture('call'), v, 's1', ctx);
    expect(ids(out)).toContain('showdown:sat-out');
    expect(out[0]!.text).toContain('Ren');
  });

  it('celebrates a carrier nobody nodded at', () => {
    const v = { ...fixture('showdown'), seats: fixture('showdown').seats.map((s) => ({ ...s, nod: null })) };
    expect(classifyShowdown(v).kind).toBe('blind-carry');
    expect(ids(narrate(fixture('call'), v, 's0', ctx))).toEqual(['showdown:blind-carry']);
  });

  it('cheers the whole crew In and winning', () => {
    const v = withResult(fixture('showdown'), { ins: ['s0', 's1', 's2', 's3'], moved: 4 });
    expect(classifyShowdown(v).kind).toBe('all-in');
    expect(ids(narrate(fixture('call'), v, 's0', ctx))).toEqual(['showdown:all-in', 'swing:up']);
  });

  it('marks a big swing toward the sirens', () => {
    const v = withResult(fixture('showdown'), { outcome: 'house', moved: -4, ins: ['s0', 's1', 's2', 's3'], crewBest: hv(2, 'pair', 'Pair of twos', ['2c', '2d', 'Kh', '9s', '4h']) });
    expect(ids(narrate(fixture('call'), v, 's0', ctx))).toContain('swing:down');
  });

  it('tells only you about the monster you never saw', () => {
    const flush = hv(6_000_000, 'flush', 'Flush, ace high', ['Ah', 'Qh', '9h', '6h', '2h']);
    // Ren sat Out on it; a hand that won says so itself.
    const v = seatOver(fixture('showdown'), 's2', { hand: flush });
    const mine = narrate(fixture('call'), v, 's2', ctx);
    const theirs = narrate(fixture('call'), v, 's1', ctx);
    expect(ids(mine)).toEqual(['reveal:s2']);
    expect(mine[0]!.text).toMatch(/flush/i);
    expect(REVEAL.length).toBeGreaterThan(0);
    expect(theirs).toEqual([]);
  });

  it('stays quiet on an ordinary showdown, and never repeats itself', () => {
    const [prev, next] = showdown();
    expect(narrate(prev, next, 's0', ctx)).toEqual([]);
    expect(narrate(next, { ...next, ready: ['s0', 's1'] }, 's0', ctx)).toEqual([]);
  });
});

describe('the regulars', () => {
  it('sometimes lets a bot regular who carried the hand say a word, and only from their own lines', () => {
    let spoke = 0;
    for (let i = 0; i < 40; i++) {
      const code = `Q${String(i).padStart(4, '0')}`;
      const asTetsu = (v: GameView) => ({
        ...v,
        code,
        seats: v.seats.map((s) => (s.id === 's1' ? { ...s, name: 'Tetsu', bot: true } : s)),
      });
      const [prev, next] = showdown(asTetsu);
      const out = narrate({ ...prev, code }, next, 's0', ctx);
      expect(out.length).toBeLessThanOrEqual(1);
      if (out.length) {
        spoke++;
        expect(out[0]!.speaker).toBe('Tetsu');
        expect(REGULARS.Tetsu.carried).toContain(out[0]!.text);
      }
    }
    expect(spoke).toBeGreaterThan(4);
    expect(spoke).toBeLessThan(30);
  });
});

describe('the verdict', () => {
  it('reads a chapter epilogue for each ending', () => {
    for (const table of ['shitamachi', 'kabukicho', 'oyabun'] as const) {
      for (const verdict of ['clean', 'raid', 'dawn'] as const) {
        const config = { difficulty: table, timer: 30 as const };
        const prev = fixture('showdown', { config, hand: 6 });
        // A raid reached at the sirens, not at the clock.
        const over = fixture('over', { config, verdict });
        const next = verdict === 'raid' ? { ...over, meter: -over.sirens } : over;
        const out = narrate(prev, next, 's0', ctx);
        const epilogue = out.filter((l) => l.id.includes(`verdict:${table}:${verdict}`));
        expect(epilogue.length).toBeGreaterThanOrEqual(1);
        expect(CHAPTERS[table].epilogue[verdict].some((run) => run[0] === epilogue[0]!.text)).toBe(true);
        expect(epilogue[0]!.kanji).toBe(CHAPTERS[table].kanji);
      }
    }
  });

  it('tells a raid at dawn at the boss\'s table in its own words', () => {
    const config = { difficulty: 'oyabun' as const, timer: 30 as const };
    const prev = fixture('showdown', { config, hand: 10 });
    const next = fixture('over', { config, verdict: 'raid', hand: 10, meter: 3 });
    const epilogue = narrate(prev, next, 's0', ctx).filter((l) => l.id.includes('verdict:oyabun:raid'));
    expect(CHAPTERS.oyabun.epilogue.dawn.some((run) => run[0] === epilogue[0]!.text)).toBe(true);
  });

  it('adds a word about a close shave', () => {
    const history = [entry(1, 'house', -7, 4), entry(2, 'crew', 4, 4), entry(3, 'crew', 4, 4), entry(4, 'crew', 4, 4), entry(5, 'crew', 4, 4), entry(6, 'crew', 2, 2)];
    const over = fixture('over', { history });
    expect(ids(narrate(fixture('showdown', { hand: 6 }), over, 's0', ctx))).toContain('coda:close');
  });

  it('adds a word about a night with no step toward the sirens', () => {
    const history = [entry(1, 'crew', 4, 4), entry(2, 'crew', 4, 4), entry(3, 'crew', 3, 3)];
    expect(ids(narrate(fixture('showdown', { hand: 3 }), fixture('over', { history }), 's0', ctx))).toContain('coda:sweep');
  });

  it('does not talk about the marker on top of a raid', () => {
    const over = fixture('over', { verdict: 'raid', meter: -8 });
    const out = narrate(fixture('showdown', { hand: 6, meter: -6 }), over, 's0', ctx);
    expect(out.every((l) => !l.id.includes('marker'))).toBe(true);
  });
});

describe('idle', () => {
  it('only talks in the lobby, sometimes, and the same way for everyone', () => {
    const lobby = fixture('lobby');
    const lines = Array.from({ length: 30 }, (_, t) => idleLine(lobby, t));
    expect(lines.filter(Boolean).length).toBeGreaterThan(10);
    expect(lines.filter((l) => l === null).length).toBeGreaterThan(2);
    expect(Array.from({ length: 30 }, (_, t) => idleLine(lobby, t))).toEqual(lines);
    expect(idleLine(fixture('call'), 1)).toBeNull();
  });
});

describe('a second night at the same table', () => {
  it('reseeds the line choices, and the first night is unchanged', async () => {
    const { seedOf } = await import('./narrator');
    expect(seedOf({ code: 'K7QX2', night: 0 })).toBe('K7QX2');
    expect(seedOf({ code: 'K7QX2', night: 1 })).toBe('K7QX2');
    expect(seedOf({ code: 'K7QX2', night: 2 })).toBe('K7QX2~2');
    expect(seedOf({ code: 'K7QX2', night: 3 })).not.toBe(seedOf({ code: 'K7QX2', night: 2 }));
  });
});
