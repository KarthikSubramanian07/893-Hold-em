# The night world · `src/client/scene`

> 3 a.m. in a Golden Gai bar, printed as a risograph.

The 3D table for 893 Hold'em: one paper lantern over a black urushi oval,
rain on the window behind the House, neon kanji bleeding through it, and one
masked House across the table with its cards in a row before it. Everyone's
cards lie face up for the rest of the crew to read, except yours: you hold
yours up to the camera, backs out, each one marked with a "?".

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
- **Shared per-frame values** (danger, neon, police lights, haze, the lantern's
  swaying position) live in one mutable bag (`live.ts`), damped once per frame
  by `<LiveDriver>`.

## Map

| File | What it is |
| --- | --- |
| `index.tsx` | `<TableScene>`: canvas, lights, performance monitor, suspense on fonts |
| `derive.ts` | View → targets: seat order, best fives, the House's mask and mood, nods received and nod threads, In/Out slips, marker → danger → neon / police / haze |
| `layout.ts` | Seat arc, the far-side composition (the House and the lantern), the House's card row, seat anchors, board slots, camera framing, a pure `projectNdc` |
| `maskShapes.ts` | The sculpt of all eight masks as outlines and height fields, shared by the mesh and the paint |
| `anchors.ts` / `AnchorTracker.tsx` | Each seat's position on screen, published for the HUD (see below) |
| `eggFx.ts` / `EggListener.tsx` | The room's easter-egg reactions: pure envelopes, and a listener for `893:egg` |
| `cardInfo.ts` | Card labels, kanji flourishes, texture keys, stance kanji (入 In, 出 Out) |
| `live.ts` / `LiveDriver.tsx` | The shared per-frame bag and its damping |
| `CameraRig.tsx` | Aspect framing, slow breathing, pointer parallax, a lean-in as the marker nears the sirens |
| `parts/Table.tsx` | Urushi oval, gold maki-e rim, sashiko felt, ashtray, sake set |
| `parts/Lantern.tsx` | The chōchin: ribbed lathe, glowing washi, swaying spot light with soft shadows; click it and it swings |
| `parts/Room.tsx` | The rain-on-glass shader, neon signs, mullions, police lights |
| `parts/Masks.tsx` | The House: a carved, painted mask with its extras (ears, nose, horns, beard, eboshi), glancing from seat to seat, its cards in a row before it |
| `parts/Nods.tsx` | Gold silk threads that bow from each nodder to the teammate they nodded at, once the nods turn over |
| `parts/Bar.tsx` | The counter on the left wall: a tokkuri and two cups for kanpai, the Master's bulb, and Kyū on her nights |
| `parts/Seats.tsx` | Place cards, avatar seals, face-up hole cards, lock candles, gold nod beads, In/Out slips |
| `parts/Card.tsx` | One damped card: deal, flip with a hop, sit out into the dark, showdown lift and glow |
| `parts/Board.tsx` · `HeroCards.tsx` | The five, and your two (held up to the camera, backs out with a "?" until the showdown) |
| `fx/` | Dust in the lantern cone, cigarette smoke, tie smoke, gold leaf, the post stack |
| `textures/` | Canvas painters for everything above |
| `dev.tsx` | The scene lab (dev only, see below) |

## What the view drives

| View | On the table |
| --- | --- |
| `phase: 'lobby'` | Six chairs; seals and place cards pop in as people join |
| `seats[].cards` | Teammates' cards lie face up; yours are `'back'` and float near the camera with a "?"; `null → card` deals from the House |
| `seats[].locked` | The seat's candle lights (nodded or passed during `nod`; In or Out picked during `call`) |
| `seats[].nod` | Once every nod is in: a gold thread bows from nodder to nodded, and the nodded seat collects a gold bead per nod |
| `seats[].stance` | At the showdown a stamped washi slip drops: 入 In or 出 Out. Seats that sat out go dark |
| `seats[].connected = false` | The seat dims |
| `house.cards` + `config.difficulty` | One masked figure (Okame, Kitsune or the Okina by table) with 3, 4 or 5 cards before it, the first face up |
| `meter / door / sirens` | As the marker slides toward the sirens: neon burns hotter and flickers faster, police lights strobe through the window, the camera leans in |
| `phase: 'showdown'` | Your own cards turn over; the best fives lift and glow: kin gold for the crew, neon red for the House |
| `result.outcome` | Crew: gold leaf, the House retreats. House: eyes flare, neon surges, heat haze. Tie: smoke. Everyone Out: the lantern dims |
| `verdict` | Clean: gold leaf. Raid: police lights full. Dawn: a dim lantern |

## The House

The House wears one mask per table, straight from `story/masks.ts`:

| Table | The House | Cards it holds |
| --- | --- | --- |
| Shitamachi | Okame | 3 |
| Kabukichō | Kitsune | 4 |
| Oyabun | Okina | 5 |

Every face is one height field over face coordinates (`maskShapes.ts`): a
lacquered shell with a rolled rim, carved sockets, and per-mask sculpting
(Okame's plum cheeks, the fox's muzzle, the hannya's mouth torn to the ears).
The texture painter (`textures/masks.ts`) works in the same coordinates and
bakes soft light and cavity shading from the same field, so paint and carving
always agree. The other masks (Hyottoko, Ebisu, Tengu, Hannya, the Oni) are
still carved and painted; the scene lab can seat them.

The far side is composed as one piece (`stageLayout`): the lantern hangs beside
the House, never in front of its face, and the House's card row is drawn in
toward the middle. Tests project the boxes through the resting camera at
1440×900, 1280×800, 1024×768 and 390×844 and fail on any overlap or any House
card off screen.

## Nods

- During `nod` nothing shows: nods are secret until every one is in.
- When the call opens, each nod becomes a gold silk thread that grows from the
  nodder's seat, bows over the table, and settles on the teammate they
  nodded at. It flashes bright, then rests as a faint line through the call
  and the showdown.
- The nodded seat collects one small gold bead per nod beside its place card.
- At the showdown the House turns to stare down the hand that beat it (or the
  first player In, when it wins).

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
  drift (the House settles on one seat instead of glancing), shortens the
  lantern's swing and the cups' lift, softens the neon stutter, and slows the
  rain.
- Masks are about 6.5k vertices each plus a few small extras; textures are
  painted once per mask and cached. The bar adds one small point light (the
  same count as before, since the masks no longer need a fill light).
- 60 fps at 1440×900 with the full post stack on an M1.

## Scene lab

```sh
npx vite --port 5191
open http://localhost:5191/scene.html?fixture=call
```

`Alt`+`1`–`5` pick a fixture, `Alt`+`P` plays a scripted hand (lobby → deal →
flop → nods → river → call → showdown), `Alt`+`G` shows the HUD guide bands, `Alt`+`H`
hides the buttons. Lab keys need Alt so that typing `893` or `kanpai` reaches
the easter eggs.
URL params: `fixture=lobby|nod|call|showdown|over|crowd`,
`quality=low`, `meter=<n>`, `outcome=crew|house|tie|walked`,
`verdict=clean|raid|dawn`, `clean` (no buttons), `play`,
`table=shitamachi|kabukicho|oyabun` (also resizes the House's hand),
`crew=<n>`, `cat` / `cat=0`. The lab installs the keyboard eggs, so typing `893`
or `kanpai` works.

`scene.html` is never built; Vite only builds `index.html`.
