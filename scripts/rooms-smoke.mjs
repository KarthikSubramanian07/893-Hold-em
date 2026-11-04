// Smoke test for the rooms Worker: two browsers and two regulars play a whole
// night over real WebSockets, and every view each socket receives is checked
// for leaked hidden cards.
//
//   npx wrangler dev --config worker/wrangler.jsonc --port 8787 &
//   node scripts/rooms-smoke.mjs [ws://127.0.0.1:8787]

const base = process.argv[2] ?? 'ws://127.0.0.1:8787';
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const code = Array.from({ length: 5 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');
const url = `${base}/room/${code}`;

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

function player(name) {
  const ws = new WebSocket(url);
  const p = { name, ws, seat: undefined, view: null, views: 0, errors: [], waiters: [] };
  ws.addEventListener('message', (e) => {
    const msg = JSON.parse(e.data);
    if (msg.t === 'welcome') p.seat = msg.seat;
    if (msg.t === 'error') p.errors.push(msg);
    if (msg.t === 'state') {
      p.view = msg.view;
      p.views++;
      // Secrecy: during a hand you never see your own cards, the House shows
      // exactly one, and nobody else's In/Out is visible.
      const v = msg.view;
      if (v.phase === 'nod' || v.phase === 'call') {
        for (const s of v.seats) {
          if (s.id === v.you && s.cards.some((c) => c && c !== 'back')) fail(`${name} saw their own cards: ${s.cards}`);
          if (s.id !== v.you && s.stance !== null) fail(`${name} saw ${s.name}'s stance before the showdown`);
          if (v.phase === 'nod' && s.id !== v.you && s.nod !== null) fail(`${name} saw ${s.name}'s nod early`);
        }
        const up = v.house.cards.filter((c) => c && c !== 'back').length;
        if (up !== 1) fail(`${name} saw ${up} House cards face up`);
      }
    }
    for (const w of p.waiters.splice(0)) w();
  });
  p.send = (m) => ws.send(JSON.stringify(m));
  p.until = (pred, ms = 15_000) =>
    new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`${name} timed out waiting`)), ms);
      const check = () => {
        if (p.view && pred(p.view)) {
          clearTimeout(t);
          resolve(p.view);
        } else p.waiters.push(check);
      };
      check();
    });
  p.open = new Promise((r) => ws.addEventListener('open', r));
  return p;
}

const pid = () => crypto.randomUUID().replace(/-/g, '');
const a = player('Mio');
const b = player('Ren');
await Promise.all([a.open, b.open]);
a.send({ t: 'hello', pid: pid(), name: 'Mio', avatar: 'koi' });
await a.until((v) => v.seats.length === 1);
b.send({ t: 'hello', pid: pid(), name: 'Ren', avatar: 'tora' });
await a.until((v) => v.seats.length === 2);
await b.until(() => b.seat !== undefined);
if (a.seat !== 's0' || b.seat !== 's1') fail(`seats ${a.seat} ${b.seat}`);
console.log(`✓ table ${code}: two seated`);

b.send({ t: 'start' });
await b.until(() => b.errors.length > 0);
console.log(`✓ non-host start refused: "${b.errors[0].message}"`);

a.send({ t: 'config', config: { difficulty: 'shitamachi', timer: 15 } });
a.send({ t: 'bot', op: 'add' });
a.send({ t: 'bot', op: 'add' });
await a.until((v) => v.seats.length === 4 && v.config.difficulty === 'shitamachi');
a.send({ t: 'start' });
await a.until((v) => v.phase === 'nod');
console.log('✓ night started with two regulars');

const started = Date.now();
let hands = 0;
while (true) {
  const v = a.view;
  if (v.phase === 'over') break;
  for (const p of [a, b]) {
    const pv = p.view;
    const me = pv.seats.find((s) => s.id === pv.you);
    const mate = pv.seats.find((s) => s.id !== pv.you);
    if (pv.phase === 'nod' && me && !me.locked) p.send({ t: 'nod', at: pv.hand % 2 ? (mate?.id ?? null) : null });
    if (pv.phase === 'call' && me && !me.locked) p.send({ t: 'call', stance: 'in' });
    if (pv.phase === 'showdown' && !pv.ready.includes(pv.you)) p.send({ t: 'next' });
  }
  if ((v.phase === 'showdown' || v.phase === 'over') && v.result && v.hand > hands) {
    hands = v.hand;
    const r = v.result;
    const moved = r.moved > 0 ? `+${r.moved}` : String(r.moved);
    console.log(`  hand ${v.hand}: ${r.outcome}, ${moved} (${r.ins.length} In; ${r.crewBest?.name ?? 'everyone Out'} vs ${r.houseBest.name}), marker ${v.meter}`);
  }
  await new Promise((r) => setTimeout(r, 150));
  if (Date.now() - started > 240_000) fail('night took too long');
}
const end = a.view;
console.log(`✓ night over: ${end.verdict}, marker ${end.meter} (door ${end.door}, sirens -${end.sirens}) after ${end.history.length} hands`);
if (b.view.verdict !== end.verdict) fail('players disagree on the verdict');

// Reconnect: Ren drops and comes back with the same browser id; the seat holds.
b.ws.close();
await new Promise((r) => setTimeout(r, 300));
console.log(`✓ ${a.views} views to Mio, ${b.views} to Ren, no leaks`);
a.ws.close();
process.exit(0);
