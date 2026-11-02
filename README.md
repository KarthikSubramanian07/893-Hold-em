<div align="center">

<img src="docs/media/hero-showdown.jpg" alt="A showdown at Bar 893: the Kitsune and Tengu masks across a black lacquer table, gold leaf over the winning cards, red eye-lines to the two seats the House caught, and the Master saying: Paid. But Karthik and Mio got seen. The street remembers faces." width="100%" />

# 893 Hold'em

**A co-op poker heist for 2 to 6. Beat the House without saying a word.**

**[Play at holdem893.pages.dev →](https://holdem893.pages.dev)**

One link, no accounts. Open a table, send the link, and sit down at Bar 893, up a
staircase too narrow for two in Shinjuku's Golden Gai. It's 3 a.m. It's raining.

`co-op` · `poker` · `multiplayer` · `browser game` · `rust` · `webassembly` · `three.js` · `cloudflare durable objects`

</div>

---

> **8 · 9 · 3**, read *ya-ku-za*: the worst hand in oicho-kabu, eight plus nine plus three,
> twenty, which scores zero. The yakuza took the name for themselves.
> Everybody at this table starts with a bad hand. The point is to play it together.

## How a night plays

Your crew sits on one side of the table. The House sits across, one mask for every two of you.

1. **The deal.** Two cards each, face down. Five on the board, turned over street by street.
2. **The House Rule.** From the second hand, one card flips and bends the hand: Fog hides the river, Mirror shows a mask's card, Bond shares every raise, Reversal makes the weakest hand win. Nine in all. Rumour says there's a tenth.
3. **Four quiet calls.** Pre-flop, flop, turn, river. Everyone still in picks **Fold 降**, **Stay 待**, or **Raise 攻** in secret, and every call flips at once. That flip is the only conversation you get.
4. **The showdown.** Two counts, settled together:
   - **Take 円.** The crew's best hand faces the House's best. Win, and *every* stake still in gets paid, even the trash riding along.
   - **Heat 熱.** Each mask watches two seats. Lose to the mask watching you and you draw heat, even when the crew wins. You were seen.

Six hands a night. Reach the take target and you get away clean. Hit the heat limit and the bar gets raided.

A raise says *I'm carrying this one*. Riding it turns your heat into the crew's take. Whether that's a good trade depends on the night, and you can't talk about it.

## The bar

The story, the Master behind the counter, the masks, the regulars, the stamps, and the
spoilers live in [`docs/STORY.md`](docs/STORY.md). The rules and the art direction live in
[`docs/DESIGN.md`](docs/DESIGN.md).

<table>
<tr>
<td><img src="docs/media/landing-desktop.jpg" alt="The landing page: a matchbook-paper hero with 893 Hold'em in ink and vermilion" /></td>
<td><img src="docs/media/receipt-desktop.jpg" alt="The end-of-night receipt with a RAID stamp" /></td>
</tr>
<tr>
<td colspan="2"><img src="docs/media/matchbook.jpg" alt="The matchbook: a vermilion matchbook opened to the hanko stamps a crew has earned" /></td>
</tr>
</table>

## Architecture

```mermaid
flowchart LR
  subgraph Browser["Your browser"]
    HUD["React 19 HUD<br/>washi paper, calls, receipt"]
    Scene["three.js night scene<br/>lantern, rain, neon, masks"]
    Story["Story layer<br/>the Master, regulars, stamps"]
    Local["Practice table<br/>src/client/net/local.ts"]
    WasmB["Rust engine as wasm"]
    HUD --- Scene
    HUD --- Story
    Local --> WasmB
  end

  subgraph Pages["holdem893.pages.dev, Cloudflare Pages"]
    Static["Static site and game bundle"]
    MW["functions/_middleware.ts<br/>Markdown for agents, real 404s"]
    Fn["functions/room/[code].ts"]
  end

  subgraph Rooms["holdem893-rooms, a private Worker"]
    DO["One Durable Object per table<br/>worker/index.ts: sockets, storage, alarms"]
    WasmS["Rust engine as wasm<br/>crates/engine"]
    DO -- "JSON in, JSON out" --> WasmS
  end

  HUD -- "page load" --> MW --> Static
  HUD <-- "WebSocket /room/K7QX2" --> Fn
  Fn -- "service binding" --> DO
  HUD -. "/practice, no network" .-> Local
```

One Rust engine runs in all three places that need the rules: the table's Durable Object,
the practice table in your tab, and the balancing simulator. They can't disagree.

### One hand, start to finish

```mermaid
sequenceDiagram
  autonumber
  participant P as Each player
  participant DO as Table (Durable Object)
  participant E as Rust engine
  DO->>E: deal hole cards, draw a House Rule
  E-->>DO: a private view for every seat
  DO-->>P: your cards only, never anyone else's
  loop four rounds: preflop, flop, turn, river
    P->>DO: a secret call: fold, stay, or raise
    Note over DO: an alarm fires when the timer runs out,<br/>and the regulars think on their own clock
    DO->>E: all calls are in
    E-->>DO: calls turn over together, next card
    DO-->>P: the new board and everyone's calls
  end
  DO->>E: showdown
  E-->>DO: crew best vs House best, take, heat
  DO-->>P: the result, and what it did to you
```

### Where the code lives

```
crates/
  engine/    Rust. Cards, a seeded RNG, a bit-sliced 7-card evaluator, Monte Carlo
             odds, the night state machine, per-seat redaction, and the regulars.
  wasm/      wasm-bindgen bindings: one package for the Worker, the browser, and tests.
  sim/       Self-play simulator that tunes heat limits and take targets.
worker/      The rooms Durable Object: hibernating sockets, storage, alarms.
functions/   Pages Functions: the room forwarder and the agent-friendly middleware.
site/        Markdown pages, built into HTML, .md, llms.txt, and the sitemap.
src/
  client/    React HUD, three.js scene, synthesized sound, the story layer.
  edge/      Markdown negotiation and honest 404s, unit tested.
  engine/    Typed wrappers over the wasm engine.
```

| Layer | Where | What |
| --- | --- | --- |
| **Rules engine** | `crates/engine` (Rust) | Cards and a seeded RNG, a bit-sliced 7-card evaluator (~25 ns/hand in wasm), Monte Carlo odds, the night state machine, per-seat redaction, the regulars (bots), and room protocol validation. No I/O; the whole table serializes. |
| **Bindings** | `crates/wasm` | `wasm-bindgen` `Table`: JSON strings in, JSON strings out. One package runs in the Worker, the browser, and the tests. |
| **Rooms** | `worker/index.ts` | A thin Durable Object: hibernating WebSockets, SQLite-backed storage after every change, one alarm for call timers, regulars' think time, and the showdown. |
| **Edge** | `functions/room/[code].ts` | A Pages Function that forwards `/room/<code>` to the private Worker over a service binding, so players only ever see the Pages URL. |
| **Client** | `src/client` | React 19 HUD on washi paper, a three.js night scene (lantern, rain, neon, masks), synthesized sound, the story layer, stamps, and easter eggs. |
| **Simulator** | `crates/sim` | Plays thousands of all-regular nights to tune heat limits and take targets per table and crew size. |

Why Rust here: the hand evaluator and the regulars' Monte Carlo run inside a Worker with a
CPU budget per message, the rules have to be identical on the server, in the browser's
practice mode, and in the balancing simulator, and the type system makes "no hidden card ever
reaches the wire" something the tests can prove. Why not Rust everywhere: a TypeScript
Durable Object reloads in a second, the same wasm package is tested in Vitest, and the upload
is a quarter of the size.

### Secrecy

Every message a socket receives is built by `view::view_for`, the only path from hidden state
to the wire. Tests serialize views and assert that no other seat's hole cards, no House card,
and no undealt board card appear in the JSON; the rooms smoke test checks every view two live
clients receive over a whole night.

### Practice, alone

`/practice` (or **Sit with the regulars** on the landing page) opens a table that never
touches the network: the same wasm `Table` the Durable Object runs, hosted in the tab by
`src/client/net/local.ts`. It mirrors `worker/index.ts` step for step (hello first, effects
carried out the same way, `wake()` driven from `nextWake()` with `setTimeout` instead of an
alarm), so the store just gets a different line to talk to. The table seats you as host with
three regulars at Shitamachi on a 60-second fuse, and you can change all of it in the lobby.
The game lives in `sessionStorage`, so a reload picks the night back up.

Its code is `ALONE`. There's an O in it, which the room alphabet never uses, so no server
table can share it. The engine is fetched only when you sit down, so the landing page carries
no wasm and no three.js. The page still only ever receives `stateFor(you)`; a Vitest suite
plays whole nights on the real engine with fake timers and checks every view for other seats'
cards.

## Run it

Needs [Bun](https://bun.sh) (installs and scripts), Node 22+ (Wrangler and Vitest run on it), Rust (stable) with the `wasm32-unknown-unknown` target, and `wasm-pack`.

```sh
bun install
bun run dev                      # builds the wasm engine, then Vite on :5173 + the rooms Worker on :8787
```

| Command | Does |
| --- | --- |
| `bun run test` | Vitest: client, story, audio, scene helpers |
| `cargo test --workspace --release` | The engine: rules, views, bots, rooms, evaluator (exhaustive over all 2.6M five-card hands) |
| `cargo test --release -p hachi-engine -- --ignored` | All 133,784,560 seven-card hands |
| `bun run smoke:rooms` | Two WebSocket clients play a whole night against `wrangler dev`, checking every view for leaks |
| `bun run e2e` | Two real browsers play a whole night through the UI |
| `bun run e2e:practice` | One browser plays a practice night through the UI, with no Worker running (`npx vite --port 5213` first) |
| `cargo run --release -p hachi-sim` | Rebalance the tables |
| `bun run deploy:rooms` | Deploy the rooms Worker by hand (uses your `wrangler login`) |

## Deploy

Cloudflare builds and deploys both halves on every push to `main`, through the
Cloudflare GitHub app: Pages for the site, Workers Builds for the rooms Worker.
There is no API token anywhere in the repo or CI. Settings and the one-time setup
are in [`docs/DEPLOY.md`](docs/DEPLOY.md).

## License

MIT. Matches for the crew. Strike on box.
