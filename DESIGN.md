# Design: Song mood classifier

Inherits the portfolio's system, "Type on graphite" (`mikael-portfolio/DESIGN.md`): fields `#0e1115` /
`#151a21` / `#090b0e`, ink `#eef1f5`, supporting ink `#a7b1be`, one accent `#ff6b3d`, Gambarino for headings,
General Sans for everything read, flat and square, no shadows, gradients or rules.

## What this page adds

- **Two data tones.** `--track #262e39` (empty part of a bar) and `--mark #5c6878` (any mark that is not the
  answer). The accent marks only the answer: the predicted mood's bar, its region on the map, the slider lines
  (which plot that mood), the correct cells of the confusion matrix, and the headline accuracy.
- **No mood palette.** Four moods never get four hues. Every chart labels moods in text; colour only says
  "this is the one". The map gives each mood a fixed graphite step (sad `#1c232c`, happy `#2a333f`,
  energetic `#3a4552`, calm `#12171d`) and outlines the predicted region in the accent.
- **Choices** are plain text buttons (`aria-pressed`), chosen = ink with a 2px accent underline, 44px tall.
- **Sliders**: native range inputs, 2px track, 18px square thumb, 44px hit area. Above each, the chance of the
  predicted mood across that slider's range (a what-if line, recomputed as you move).

## Motion

Only where it carries information, transform and opacity only, removed under reduced motion:
the verdict rises 10px and fades in when the mood changes (280ms, ease-out `cubic-bezier(.23,1,.32,1)`);
probability and importance bars ease their `scaleX` (180–220ms); buttons press to 0.97 (160ms); the
slider thumb grows 1.2× while held. The sweeps and map trail a fast drag by a frame (`useDeferredValue`).

## Layout

Desktop: controls 7/12 left, readout sticky 5/12 right. Below 1024px the readout comes first and the caption
naming the current mood sticks under the header while you slide.
