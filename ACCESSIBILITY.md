# Accessibility

893 Hold'em aims to meet **WCAG 2.2 Level AA** on every page and state of the site.

## What was tested (November 2026)

- **Automated:** axe-core 4.14 with tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa` and `wcag22aa`,
  in headless Chrome at 1440×900, 390×844 and 320×800, on every route and state: the cold open, the
  landing page, static docs (Rules, About, Contact, Privacy, 404), the matchbook, profile editing, the
  lobby, the rules drawer, the turn (`nod`), paused state, river decision (`call`), showdown, and the
  night's receipt. Zero violations across all runs.
- **By hand, over the DevTools protocol:** keyboard navigation and focus management across phase
  transitions, focus rescue on unmounted controls, visible focus rings, dialog trapping and Escape
  handling, live region announcements, color-independent card indicators, contrast of text and UI
  tokens, reflow at 320 px, target sizes, and motion reduction.

## How the game handles it

- **Keyboard play:** every phase is playable from the keyboard. Press `1` or `2` to nod at a teammate,
  `P` to pass, `I` for In, `O` for Out, `T` to hear a full table recap, and `?` to open the rules drawer.
- **Screen reader announcements:** a polite live region (`aria-live="polite"`) announces phase
  transitions, dealt board cards, House reveals, nods turned over, showdown outcomes, and marker
  progress toward the door or sirens. Pressing `T` at any time reads the entire state of the table.
- **Focus rescue:** when interactive elements unmount (such as lobby controls when play begins, or dock
  buttons when moves lock), focus is caught by the active panel or heading rather than falling back to
  the document root.
- **Motion toggle:** a dedicated Motion switch in the masthead and top bar allows players to stop all
  looping animations (smoke wisps, dust particles, rain, and neon flicker), honoring both user preference
  and `prefers-reduced-motion`. Police lights and neon surge frequencies stay strictly below 3 flashes per
  second (WCAG 2.3.1).
- **Practice pause:** practice tables running locally can be paused at any time with the Pause button
  or dialog without forfeiting clock time or regular moves.
- **Colour and contrast:** card ranks and suit names are conveyed in text and accessible labels, not by
  red/black color alone. Text on vermilion buttons and thermal paper receipts meets 4.5:1 contrast
  thresholds.

## Known limitations

- **3D Canvas:** the bar room, table, lanterns, and felt are rendered in a WebGL canvas (`<canvas>`).
  Assistive technology cannot perceive individual 3D geometries or shader passes directly. To bridge
  this, the canvas carries `role="img"` with a full text description of the table state, complemented by
  the live announcer and the `T` table recap shortcut.
- **Live multiplayer clock:** while practice tables can be paused, shared multiplayer tables cannot pause
  the countdown clock for one seat without stopping play for all participants.
- **Haptic audio:** ambient audio cues augment visual notifications; all vital gameplay cues also appear
  in visual text and screen reader announcements.

## Reporting a barrier

Open an issue at <https://github.com/KarthikSubramanian07/893-Hold-em/issues> with the page, what you
were trying to do, and the browser and assistive technology you use. Accessibility issues are treated
as bugs.
