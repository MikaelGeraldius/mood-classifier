# Design: Song mood classifier — "Night set"

A listening-app world in the house's own colours: it should feel at home next to a music player without
copying one. Built and checked with the impeccable, emil-design-eng and design-taste-frontend skills
(`skills-lock.json`; install commands in README).

## Colour

| Token | Value | Use |
| --- | --- | --- |
| `--ground` | `#121412` | Hero, results |
| `--raised` | `#191c1a` | Classifier, method, cards on deep |
| `--deep` | `#0b0c0b` | Header, learned, footer |
| `--surface` / `--surface-2` | `#232725` / `#2d322f` | Chips, inputs, song cards; the second under the pointer |
| `--ink` / `--ink-2` | `#f4f6f3` / `#a9b2ab` | Text; supporting text (7.9:1 on raised) |
| `--accent` | `#3fdc85` (hover `#66e8a0`) | The answer and the action. Text on it is `#06140c`. |
| `--track` / `--mark` | `#2f3431` / `#5f6862` | Empty part of a bar; any data mark that is not the answer |

Neutrals carry a faint green cast toward the accent. The accent marks only: buttons, the chosen chip, the
predicted mood (its bar, its outlined region on the map, the slider lines that plot it), the correct cells of the
confusion matrix and the headline accuracy. Four moods never get four hues; they are always named in text.

## Type

General Sans only: 600 for headings (tracking −0.035em at display size), 500 for labels, 400 for text. Hero
headline max 6rem. Tabular figures wherever numbers line up.

## Shape

Pills for every control (buttons, chips, the link field, the upload target); 12px cards (hero queue card,
song cards, lessons, the map); 6px bars with round ends. Separation is by tone; the only lines are focus and
selection outlines. Sliders read like a player's progress bar: 4px track, the part before the thumb filled in
ink (mint under the pointer), a 14px round thumb that grows on hover and press.

## Motion

Emil Kowalski's rules: custom curves (`--ease-out` `cubic-bezier(.23,1,.32,1)` for entrances and presses,
`--ease-in-out` `cubic-bezier(.77,0,.175,1)` for things morphing in place, linear only for the queue clock),
UI responses under 300ms, transitions not keyframes for anything interruptible, hover effects only on fine
pointers.

- **Scroll:** Lenis smooth wheel scrolling and distance-scaled, interruptible anchor glides, ported from
  mikael-portfolio (`src/hooks.ts`, `src/scroll.ts`).
- **Opening (the one authored moment):** headline, sentence, buttons and credit rise 32px out of a 6px blur,
  80ms apart; the queue card settles in from 96% scale. The queue then plays dataset songs every 3.6s: the nine
  feature bars and four vote bars morph (520ms ease-in-out), the verdict swaps with a blur-fade, a progress bar
  runs linear. It pauses off-screen, when the tab is hidden, and on the pause button.
- **Reveals:** every heading, lead, fact, result block, method step and lesson rises 28px out of a 4px blur
  once as it enters, siblings staggered 70ms (max four). Visible without script; shown after 2–3s if the
  observer never reports.
- **Feedback:** buttons scale 1.03 on hover and 0.97 on press; chips, cards, the upload target and icon
  buttons press to 0.94–0.98; a dragged file grows the target to 1.02 with a mint outline; new song cards rise in.
- **Reduced motion:** nothing travels or blurs; fades remain; the queue doesn't auto-advance (a Next button
  replaces Pause).

## Known departures

- Taste's `few-pictures` rule is allowed, not met. The honest pictures are the album covers of songs you link,
  which appear on the shelf and in the readout; stock photos of headphones would be filler.
- Taste's `no-footage` warning stays: no honest clip fits.
- The slider fill uses a `linear-gradient` with a hard stop (two flat colours, no blend), marked
  `taste-skill-ignore`.
