# Fonts: provenance and licence

General Sans is self-hosted from `public/fonts/`. The page loads no external font stylesheet or CDN.

| File | Family | Designer / foundry | Source |
| --- | --- | --- | --- |
| `GeneralSans-Regular.woff2` | General Sans 400 (text) | Indian Type Foundry | Fontshare |
| `GeneralSans-Medium.woff2` | General Sans 500 (labels) | Indian Type Foundry | Fontshare |
| `GeneralSans-Semibold.woff2` | General Sans 600 (headings) | Indian Type Foundry | Fontshare |

Retrieved 2026-10-30 from the web-font URLs that the Fontshare CSS API
(`https://api.fontshare.com/v2/css?f[]=general-sans@400,500,600`) returns. The files are
byte-for-byte as delivered: not subsetted, converted, renamed or edited.

SHA-256:

```
3ec2be771caf168b077ca05af4df1dace77088e2b3a27da570036e61be58a039  GeneralSans-Regular.woff2
c30377df1de8444d07161725c751f458beec07c28034df2fd275d1aa587a239f  GeneralSans-Medium.woff2
(GeneralSans-Semibold.woff2: printed by scripts/fetch-fonts.mjs on first download; record it here)
```

## Licence

Fontshare lists General Sans under the **ITF Free Font License** (`license_type: itf_ffl` in the Fontshare API).
The licence text on fontshare.com/terms was read before self-hosting. The relevant terms:

- Free for personal and commercial use, in any media including websites.
- "You may self-host the Font Software on your own servers or infrastructure for use on your own websites and
  applications, including through standard webfont technologies such as CSS @font-face."
- Not allowed: modifying, subsetting or converting the fonts; selling or re-sharing the files; distributing them
  through a font library, marketplace, **repository**, download service or publicly accessible server for others
  to use.

## How the files stay out of the public repository

Serving the fonts from the deployed site is explicitly allowed. The licence also lists "repository" among places
the font files must not be distributed for others, and this repository is public. So:

- `public/fonts/*.woff2` is in `.gitignore` and never committed.
- `scripts/fetch-fonts.mjs` runs before every build (`prebuild` in `package.json`). It downloads any missing file
  from the Fontshare CSS API above and checks it against the SHA-256 values listed here; a mismatch (a Fontshare
  update) is reported as a warning and the new file is used.
- Locally the files are already present, so builds do not touch the network.
