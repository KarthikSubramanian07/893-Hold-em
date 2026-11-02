import { describe, expect, it } from 'vitest';
import type { GameView } from '../../engine/types';
import { classifyShowdown, heatCrossed, playedYakuza } from './analysis';
import { fixture, hv, scriptedNight, seatOver, withResult } from './fixtures';
import { CHAPTERS } from './lines';
import { idleLine, narrate } from './narrator';

const EVENING = new Date(2026, 10, 1, 21, 15);
const ctx = { now: EVENING };

const ids = (lines: { id: string }[]) => lines.map((l) => l.id.split(':').slice(2).join(':'));

/** A showdown pair: the river call, then the resolved hand. */
function showdown(edit: (v: GameView) => GameView = (v) => v): [GameView, GameView] {
  return [fixture('river'), edit(fixture('showdown'))];
}

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
      if (steps[i]!.view.phase !== 'lobby') expect(b).toEqual(a);
    }
  });

  it('varies the line between tables', () => {
    const texts = new Set<string>();
    for (const code of ['AAAAA', 'BBBBB', 'CCCCC', 'DDDDD', 'EEEEE', 'FFFFF', 'GGGGG', 'HHHHH']) {
      const lobby = fixture('lobby', { code });
      const start = fixture('preflop', { code });
      texts.add(narrate(lobby, start, 's0', ctx)[0]!.text);
    }
    expect(texts.size).toBeGreaterThan(1);
  });

  it('does not repeat a rule line within a night until the bank runs out', () => {
    const seen = new Set<string>();
    for (let hand = 2; hand <= 4; hand++) {
      const prev = fixture('river', { hand: hand - 1, rule: 'kiri' });
      const next = fixture('preflop', { hand, rule: 'kiri' });
      seen.add(narrate(prev, next, 's0', ctx).find((l) => l.id.endsWith('rule:kiri'))!.text);
    }
    expect(seen.size).toBe(3);
  });

  it('says nothing when nothing changed', () => {
    const v = fixture('river');
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
    expect(ids(narrate(null, fixture('river'), 's0', ctx))).toEqual(['welcome:rejoin']);
  });

  it('treats a new room code as a fresh arrival', () => {
    expect(ids(narrate(fixture('river'), { ...lobby, code: 'ZZZZZ' }, 's0', ctx))).toEqual(['welcome:first']);
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
  it('opens the chapter and sits the lead mask for each table', () => {
    const lead = { shitamachi: 'okame', kabukicho: 'kitsune', oyabun: 'okina' } as const;
    for (const table of ['shitamachi', 'kabukicho'] as const) {
      const config = { difficulty: table, timer: 30 as const };
      const out = narrate(fixture('lobby', { config }), fixture('preflop', { config }), 's0', ctx);
      expect(ids(out)).toEqual([`night:${table}`, `mask:${lead[table]}`]);
      expect(out[0]!.kanji).toBe(CHAPTERS[table].kanji);
      expect(CHAPTERS[table].intro).toContain(out[0]!.text);
    }
  });

  it('turns the first House Rule at the boss’s table', () => {
    const config = { difficulty: 'oyabun' as const, timer: 30 as const };
    const out = narrate(fixture('lobby', { config }), fixture('preflop', { config, rule: 'hebi' }), 's0', ctx);
    expect(ids(out)).toEqual(['night:oyabun', 'mask:okina', 'rule:hebi']);
  });

  it('lets the Oni introduce himself under his own rule', () => {
    const config = { difficulty: 'oyabun' as const, timer: 30 as const };
    const out = narrate(fixture('lobby', { config }), fixture('preflop', { config, rule: 'oni' }), 's0', ctx);
    expect(out.map((l) => l.speaker)).toEqual(['master', 'oni']);
  });

  it('starts a second night in the same room', () => {
    expect(ids(narrate(fixture('over'), fixture('preflop'), 's0', ctx))).toEqual(['night:kabukicho', 'mask:kitsune']);
  });

  it('lets the House Rule speak for an ordinary hand', () => {
    const out = narrate(fixture('showdown', { hand: 2 }), fixture('preflop', { hand: 3, rule: 'homura' }), 's0', ctx);
    expect(ids(out)).toEqual(['rule:homura']);
    expect(out[0]!.kanji).toBe('炎');
  });

  it('marks the last hand, and knows what the crew still needs', () => {
    const out = narrate(fixture('showdown', { hand: 5 }), fixture('preflop', { hand: 6, rule: 'kiri', take: 14, target: 20, heat: 2 }), 's0', ctx);
    expect(ids(out)).toEqual(['hand:last', 'rule:kiri']);
    expect(out[0]!.text).toMatch(/6/);
  });

  it('names the player the Fox exposed', () => {
    const next = seatOver(fixture('preflop', { hand: 2, rule: 'kitsune' }), 's2', { cards: ['9s', '9h'] });
    const [l] = narrate(fixture('showdown', { hand: 1 }), next, 's0', ctx);
    expect(l!.text).toContain('Ren');
  });
});

describe('heat and take', () => {
  it('finds the highest mark crossed, and none at the raid', () => {
    expect(heatCrossed(3, 4, 8)).toBe('half');
    expect(heatCrossed(4, 5, 8)).toBeNull();
    expect(heatCrossed(5, 6, 8)).toBe('three-quarters');
    expect(heatCrossed(6, 7, 8)).toBe('one-away');
    expect(heatCrossed(2, 7, 8)).toBe('one-away');
    expect(heatCrossed(6, 8, 8)).toBeNull();
    expect(heatCrossed(5, 6, 7)).toBe('one-away');
  });

  it('speaks when the heat crosses half, three quarters, and one away', () => {
    const [prev, next] = showdown((v) => withResult({ ...v, heat: 4 }, { outcome: 'house', take: 0, heat: 1 }));
    expect(ids(narrate({ ...prev, heat: 3 }, next, 's0', ctx))).toContain('heat:half');
    expect(ids(narrate({ ...prev, heat: 6 }, { ...next, heat: 7 }, 's0', ctx))).toContain('heat:one-away');
    expect(ids(narrate({ ...prev, heat: 4 }, { ...next, heat: 4 }, 's0', ctx)).some((i) => i.startsWith('heat'))).toBe(false);
  });

  it('speaks once when the take reaches the target', () => {
    const [prev, next] = showdown();
    expect(ids(narrate({ ...prev, take: 18 }, { ...next, take: 24 }, 's0', ctx))).toContain('take');
    expect(ids(narrate({ ...prev, take: 21 }, { ...next, take: 27 }, 's0', ctx))).not.toContain('take');
  });
});

describe('the showdown', () => {
  const kind = (edit: (v: GameView) => GameView) => classifyShowdown(showdown(edit)[1]).kind;
  const twoPair = hv(3_000_000, 'two-pair', 'Two pair, kings and sevens', ['Kh', 'Kd', '7s', '7d', 'Ah']);

  it('reads ordinary outcomes', () => {
    expect(kind((v) => v)).toBe('crew');
    expect(kind((v) => withResult(v, { outcome: 'house', crewBest: twoPair }))).toBe('house');
    expect(kind((v) => withResult(v, { outcome: 'tie' }))).toBe('tie');
    expect(kind((v) => withResult(v, { outcome: 'walked', crewBest: null }))).toBe('walked');
  });

  it('calls a bad beat when a full house or better loses', () => {
    const big = (v: GameView) =>
      withResult(v, { outcome: 'house', crewBest: hv(7_000_000, 'full-house', 'Full house, sevens full of queens', ['7h', '7s', '7d', 'Qs', 'Qh']) });
    const sd = showdown((v) => seatOver(big(v), 's1', { champion: false }))[1];
    expect(classifyShowdown(sd).kind).toBe('bad-beat');
    expect(narrate(fixture('river'), sd, 's0', ctx)[0]!.text).toMatch(/full house/i);
  });

  it('crowns a royal flush on either side', () => {
    const royal = hv(9_000_000, 'straight-flush', 'Royal flush', ['Ah', 'Kh', 'Qh', 'Jh', 'Th']);
    expect(kind((v) => withResult(v, { crewBest: royal }))).toBe('royal');
    expect(kind((v) => withResult(v, { outcome: 'house', houseBest: royal }))).toBe('royal');
    const steel = hv(8_900_000, 'straight-flush', 'Straight flush, nine high', ['9h', '8h', '7h', '6h', '5h']);
    expect(kind((v) => withResult(v, { crewBest: steel }))).toBe('crew');
  });

  it('hears 8-9-3 in the champion’s cards and the board', () => {
    const champ = (cards: GameView['seats'][number]['cards'], board: GameView['board']) => (v: GameView) => seatOver({ ...v, board }, 's1', { cards });
    expect(kind(champ(['8h', '9s'], ['3c', 'Kd', '7s', '2c', 'Qh']))).toBe('yakuza');
    expect(kind(champ(['3h', 'Qs'], ['8c', '9d', '7s', '2c', 'Qh']))).toBe('yakuza');
    // The board alone holding 8, 9, 3 is not the champion's doing.
    expect(kind(champ(['7h', 'Qs'], ['8c', '9d', '3s', '2c', 'Qh']))).toBe('crew');
    const [, sd] = showdown(champ(['8h', '9s'], ['3c', 'Kd', '7s', '2c', 'Qh']));
    const [l] = narrate(fixture('river'), sd, 's0', ctx);
    expect(l!.kanji).toBe('八九三');
  });

  it('counts a best five holding 8, 9 and 3 whatever the hole cards', () => {
    const seat = { ...fixture('showdown').seats[0]!, cards: ['Ah', 'Kh'] as GameView['seats'][number]['cards'], hand: hv(6_000_000, 'flush', 'Flush, ace high', ['Ah', 'Kh', '9h', '8h', '3h']) };
    expect(playedYakuza(seat, ['9h', '8h', '3h', '2c', 'Qd'])).toBe(true);
  });

  it('bites under the Serpent when a tie goes to the House', () => {
    const same = hv(3_200_000, 'two-pair', 'Two pair, kings and sevens', ['Kh', 'Kc', '7s', '7d', 'Qh']);
    expect(kind((v) => withResult({ ...v, rule: 'hebi' }, { outcome: 'house', crewBest: same, houseBest: same }))).toBe('serpent');
  });

  it('celebrates a Reversal win', () => {
    expect(kind((v) => ({ ...v, rule: 'gyaku' }))).toBe('reversal');
  });

  it('notices a champion who never raised with a hand worth folding', () => {
    const quiet = (v: GameView) => seatOver(v, 's1', { cards: ['7h', '5s'], calls: ['stay', 'stay', 'stay', 'stay'], stake: 1 });
    expect(kind(quiet)).toBe('quiet-champion');
    expect(kind((v) => seatOver(quiet(v), 's1', { cards: ['7h', '7c'] }))).toBe('crew');
    const [, sd] = showdown(quiet);
    expect(narrate(fixture('river'), sd, 's0', ctx)[0]!.text).toContain('Mio');
  });

  it('pays a rider who had nothing', () => {
    const trash = (v: GameView) => seatOver(v, 's3', { hand: hv(1_000_000, 'high', 'Queen high', ['Qh', 'Kh', 'Jc', 'Ts', '7s']) });
    expect(kind(trash)).toBe('trash-rider');
    const [, sd] = showdown(trash);
    expect(narrate(fixture('river'), sd, 's0', ctx)[0]!.text).toContain('Daichi');
  });

  it('names the players who were seen on a winning hand', () => {
    const [, sd] = showdown((v) => withResult(v, { burned: ['s0', 's3'] }));
    expect(classifyShowdown(sd).kind).toBe('seen');
    const [l] = narrate(fixture('river'), sd, 's0', ctx);
    expect(l!.text).toContain('Karthik and Daichi');
  });

  it('treats a missing burned list as nobody seen', () => {
    const [, sd] = showdown();
    expect((sd.result as { burned?: string[] }).burned).toBeUndefined();
    expect(classifyShowdown(sd).kind).toBe('crew');
  });

  it('speaks exactly once per showdown', () => {
    const [prev, next] = showdown();
    expect(ids(narrate(prev, next, 's0', ctx))).toEqual(['showdown:crew']);
    expect(narrate(next, { ...next, ready: ['s0', 's1'] }, 's0', ctx)).toEqual([]);
  });
});

describe('the verdict', () => {
  it('reads a chapter epilogue for each ending', () => {
    for (const table of ['shitamachi', 'kabukicho', 'oyabun'] as const) {
      for (const verdict of ['clean', 'raid', 'short'] as const) {
        const config = { difficulty: table, timer: 30 as const };
        const prev = fixture('showdown', { config, hand: 6 });
        const next = fixture('over', { config, verdict, heat: 2, history: fixture('over').history });
        const out = narrate(prev, next, 's0', ctx);
        const epilogue = out.filter((l) => l.id.includes(`verdict:${table}:${verdict}`));
        expect(epilogue.length).toBeGreaterThanOrEqual(2);
        expect(CHAPTERS[table].epilogue[verdict].some((run) => run[0] === epilogue[0]!.text)).toBe(true);
        expect(epilogue[0]!.kanji).toBe(CHAPTERS[table].kanji);
      }
    }
  });

  it('adds a word about a close call', () => {
    const over = fixture('over', { heat: 7, heatLimit: 8 });
    expect(ids(narrate(fixture('showdown', { hand: 6, heat: 7 }), over, 's0', ctx))).toContain('coda:close');
  });

  it('adds a word about a clean sweep', () => {
    const history = Array.from({ length: 6 }, (_, i) => ({ ...fixture('over').history[0]!, hand: i + 1, outcome: 'crew' as const }));
    const over = fixture('over', { history });
    expect(ids(narrate(fixture('showdown', { hand: 6 }), over, 's0', ctx))).toContain('coda:sweep');
  });

  it('does not tell the heat story on top of a raid', () => {
    const over = fixture('over', { verdict: 'raid', heat: 8, heatLimit: 8 });
    const out = narrate(fixture('showdown', { hand: 6, heat: 6 }), over, 's0', ctx);
    expect(out.every((l) => !l.id.includes('heat'))).toBe(true);
  });
});

describe('idle', () => {
  it('only talks in the lobby, sometimes, and the same way for everyone', () => {
    const lobby = fixture('lobby');
    const lines = Array.from({ length: 30 }, (_, t) => idleLine(lobby, t));
    expect(lines.filter(Boolean).length).toBeGreaterThan(10);
    expect(lines.filter((l) => l === null).length).toBeGreaterThan(2);
    expect(Array.from({ length: 30 }, (_, t) => idleLine(lobby, t))).toEqual(lines);
    expect(idleLine(fixture('river'), 1)).toBeNull();
  });
});
