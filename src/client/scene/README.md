# The night world · `src/client/scene`

> 3 a.m. in a Golden Gai bar, printed as a risograph.

![Four masks across the table under the Hush rule](../../../docs/media/night-table-masks.png)

The 3D table for 893 Hold'em: one paper lantern over a black urushi oval,
rain on the window behind the House, neon kanji bleeding through it, and the
masks of whichever table you sat down at, each one watching two of you.

```tsx
import { TableScene } from './scene';

<TableScene view={gameView} quality="high" />
```

That is the whole contract. Hand it a `GameView` and it draws the table, full
bleed, and animates whatever changed since the last view. `quality="low"` drops
the post stack for weak devices.

## How it thinks

```
GameView ──► derive.ts ──► SceneTargets ──► components damp toward targets each frame
               (pure)        (plain data)      (MathUtils.damp, dt capped at 0.05)
```

- **Nothing is tweened.** Every visual is a pure function of the view
  (`derive.ts`), and every component eases toward it each frame. Skip a street,
  reconnect mid-hand, swap fixtures at random: it all lands gracefully because
  there is no animation queue to get out of sync.
- **Nothing hits the network.** Fonts are bundled from `@fontsource`. Every 2D
  thing (cards, felt, lacquer, masks, neon, call slips) is painted on a canvas
  at runtime and cached. The environment map is built from `<Lightformer>`s.
  The troika name plates are clamped to Latin‑1 so troika never reaches for a
  CDN fallback font.
- **Shared per-frame values** (heat, neon, police lights, haze, the lantern's
  swaying position) live in one mutable bag (`live.ts`), damped once per frame
  by `<LiveDriver>`.

## Map

| File | What it is |
| --- | --- |
| `index.tsx` | `<TableScene>`: canvas, lights, performance monitor, suspense on fonts |
| `derive.ts` | View → targets: seat order, champions' best five, mask identities and moods, watchers, who was seen, heat → neon / police / haze |
| `watch.ts` | Pure watcher rules: who watches which seat, seen or clear at the showdown, each mask's tag colour and kanji |
| `layout.ts` | Seat arc, the far-side composition (masks, lantern, rule card), seat anchors, board slots, camera framing, a pure `projectNdc` |
| `maskShapes.ts` | The sculpt of all eight masks as outlines and height fields, shared by the mesh and the paint |
| `anchors.ts` / `AnchorTracker.tsx` | Each seat's position on screen, published for the HUD (see below) |
| `eggFx.ts` / `EggListener.tsx` | The room's easter-egg reactions: pure envelopes, and a listener for `893:egg` |
| `cardInfo.ts` | Card labels, kanji flourishes, texture keys, stance kanji (降 待 攻 伏) |
| `live.ts` / `LiveDriver.tsx` | The shared per-frame bag and its damping |
| `CameraRig.tsx` | Aspect framing, slow breathing, pointer parallax, a lean-in as heat climbs |
| `parts/Table.tsx` | Urushi oval, gold maki-e rim, sashiko felt, ashtray, sake set |
| `parts/Lantern.tsx` | The chōchin: ribbed lathe, glowing washi, swaying spot light with soft shadows; click it and it swings |
| `parts/Room.tsx` | The rain-on-glass shader, neon signs, mullions, police lights |
| `parts/Masks.tsx` | The House: carved, painted masks with their extras (ears, nose, horns, beard, eboshi), turning to watch their seats |
| `parts/Watch.tsx` | Silk eye-lines from each mask to the seat it's looking at, and the showdown's 見 brand or quiet relief |
| `parts/Bar.tsx` | The counter on the left wall: a tokkuri and two cups for kanpai, the Master's bulb, and Kyū on her nights |
| `parts/Seats.tsx` | Place cards, avatar seals, stake tokens (and the Hush cup), lock candles, call slips |
| `parts/Card.tsx` | One damped card: deal, flip with a hop, fold into the dark, showdown lift and glow |
| `parts/Board.tsx` · `HeroCards.tsx` · `RuleCard.tsx` | The five, your two (held up to the camera), the House Rule |
| `fx/` | Dust in the lantern cone, cigarette smoke, tie smoke, gold leaf, the post stack |
| `textures/` | Canvas painters for everything above |
| `dev.tsx` | The scene lab (dev only, see below) |

## What the view drives

| View | On the table |
| --- | --- |
| `phase: 'lobby'` | Six chairs; seals and place cards pop in as people join |
| `seats[].cards` | `null` absent, `'back'` face down, a card face up; `null → card` deals from the House |
| `seats[].active = false` | Cards slide back and go dark |
| `seats[].locked` | The seat's candle lights |
| `seats[].calls` | The newest call drops as a stamped washi slip; `'hidden'` stamps 伏 |
| `seats[].stake` | Lacquer tokens drop and clack; `null` (Hush) hides them under a cup |
| `seats[].connected = false` | The seat dims |
| `seats[].watcher` | A small hanko in the watching mask's colour on the seat's name plate; a faint thread from the mask when it looks that way |
| `house[]` + `config.difficulty` + `rule` | One masked figure per hand, the mask `maskFor()` names for this table (the Oni under his rule), cards in front |
| `result.burned` | At the showdown, seen seats get a red thread, a red bloom, and a 見 brand; the watcher's eyes flare even when the crew wins. Everyone else still in lets out a breath |
| `rule` | The tall lacquer card spins in from its back |
| `heat / heatLimit` | Neon burns hotter and flickers faster; police lights strobe past half; the camera leans in |
| `phase: 'showdown'` | Champions' best five lift and glow: kin gold for the crew, neon red for the House |
| `result.outcome` | Crew: gold leaf. House: eyes flare, neon surges, heat haze. Tie: smoke. Walked: the lantern dims |
| `verdict` | Clean: gold leaf. Raid: police lights full. Short: a dim lantern |

## The masks

Each table seats its own masks, in hand order, straight from
`story/masks.ts`:

| Table | Masks |
| --- | --- |
| Shitamachi | Okame, Hyottoko, Ebisu |
| Kabukichō | Kitsune, Tengu, Hannya |
| Oyabun | Okina, Hannya, Kitsune |
| Any, under the Oni rule | the last seat goes to the Oni |

Every face is one height field over face coordinates (`maskShapes.ts`): a
lacquered shell with a rolled rim, carved sockets, and per-mask sculpting
(Okame's plum cheeks, the fox's muzzle, the hannya's mouth torn to the ears).
The texture painter (`textures/masks.ts`) works in the same coordinates and
bakes soft light and cavity shading from the same field, so paint and carving
always agree. Anything that isn't a height field is built alongside: fox ears,
the tengu's nose and tokin, gold hannya horns, the Oni's horns and tusks,
the Okina's brow tufts and beard, Ebisu's eboshi, Hyottoko's pursed mouth and
tenugui knot.

The far side is composed as one piece (`stageLayout`): the lantern hangs in a
gap between masks (or beside a lone mask), and the rule card stands in another,
so no face is ever behind either. Tests project the boxes through the resting
camera at 1440×900, 1280×800, 1024×768 and 390×844 and fail on any overlap.

## Who's watching

Each mask watches two seats in seat order (mask 0 the first two, and so on;
an Oni's extra mask watches nobody). Your heat check is against your watcher.

- The mask glances slowly between its two seats; a faint silk thread in its
  colour runs from between its eyes to the plate it's looking at.
- Each seat's name plate (your own seal, for you) carries a small hanko in the
  watcher's colour and kanji.
- At the showdown, 1.5 s after the cards turn: a seat that drew heat is seen.
  Its watcher snaps round, leans in, eyes flaring red, the thread pulls taut
  and red, the seat blooms red and is branded 見. Seats that got away with it
  get one soft warm breath, and their thread goes slack and fades.

## Story hooks

The scene never imports UI. It listens for `893:egg` on `window` (see
`story/eggs.ts`) and reacts in its own frame loop:

| Egg | In the room |
| --- | --- |
| `neon` (type 8 9 3), `code-893` | The neon stutters like a dying ballast, then surges |
| `lantern` | Clicking the lantern swings it (a damped pendulum) and counts toward the egg via `lanternClick()`; eight clicks and it gutters |
| `kanpai` | The two cups on the counter rise, meet with a glint, and settle |
| `cat`, `cat-name` | Kyū closes her eyes, content |

Kyū sleeps on the ledger at the end of the counter when `catVisits(view.code)`
says it's one of her nights (pass `cat` to `<TableScene>` to force it). Hover
and she lifts her head and blinks; click to pet her (`petCat()`, once per
petting). The counter sits on the left wall, so on a portrait phone it is out
of frame.

## Seat anchors for the HUD

The scene publishes where each seat is on screen, so the HUD can float
reactions from the right seat:

```ts
import { useSeatAnchors, seatScreenAnchor } from './scene/anchors';

const a = useSeatAnchors((s) => s.seats[seatId]); // { x, y, pageX, pageY, visible }
const b = seatScreenAnchor(seatId);               // outside React
```

`x`/`y` are CSS pixels from the canvas's top-left; `pageX`/`pageY` are
viewport pixels for `position: fixed` overlays. The anchor sits just above the
seat's name plate (above your seal, for you). It updates about ten times a
second and only when something moved by more than a pixel, so subscribing is
cheap. `visible` is false when a seat is off screen.

## Performance

- `quality="high"`: riso misregistration and heat haze, bloom on emissives only
  (threshold 1.0), ACES tone mapping, vignette, grain.
- `<PerformanceMonitor>` drops the pixel ratio to 1 when frames slip, and drops
  the post stack only if it really can't keep up (under 24 fps). The pixel ratio
  is capped at 1.75.
- `prefers-reduced-motion` stills the camera, the lantern sway, and the masks'
  drift (they settle between their two seats instead of glancing), shortens the
  lantern's swing and the cups' lift, softens the neon stutter, and slows the
  rain.
- Masks are about 6.5k vertices each plus a few small extras; textures are
  painted once per mask and cached. The bar adds one small point light (the
  same count as before, since the masks no longer need a fill light).
- 60 fps at 1440×900 with the full post stack on an M1.

## Scene lab

```sh
npx vite --port 5191
open http://localhost:5191/scene.html?fixture=river
```

`Alt`+`1`–`5` pick a fixture, `Alt`+`P` plays a scripted hand (lobby → deal →
flop → turn → river → showdown), `Alt`+`G` shows the HUD guide bands, `Alt`+`H`
hides the buttons. Lab keys need Alt so that typing `893` or `kanpai` reaches
the easter eggs.
URL params: `fixture=lobby|preflop|river|showdown|over|crowd`,
`quality=low`, `heat=<n>`, `outcome=crew|house|tie|walked`,
`verdict=clean|raid|short`, `rule=<id>`, `clean` (no buttons), `play`,
`table=shitamachi|kabukicho|oyabun`, `masks=1..4` (reshapes the crew to
match; 4 brings the Oni), `crew=<n>`, `burned=s0,s3` (who was seen; empty for
nobody), `cat` / `cat=0`. The lab installs the keyboard eggs, so typing `893`
or `kanpai` works.

`scene.html` is never built; Vite only builds `index.html`.
