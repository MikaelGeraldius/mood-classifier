# Song mood classifier

Paste a Spotify link, upload a song, or set nine audio features by hand, and a Random Forest names the mood:
sad, happy, energetic or calm. The model runs in the browser. Built from the Machine Learning final project of
Group 3 at Universitas Multimedia Nusantara (Alto Dev, Claudia Wiyadi Gunawan, Gerald Fedorian,
Mikael Geraldius Gunawan, Nadine Kay Ludony).

React + TypeScript + Vite, custom CSS, Lenis for smooth scrolling. Visual system in `DESIGN.md`.

## Your own songs

Spotify closed its audio-features API to new apps in November 2024, so the features come from
[ReccoBeats](https://reccobeats.com) (free, no key, same nine features on Spotify's scales):

- **Spotify link** → `GET api.reccobeats.com/v1/audio-features?ids=<spotify id>` (falling back to a ReccoBeats
  id lookup), plus the title and artist from ReccoBeats and the cover from Spotify's public oEmbed.
- **Audio file** (anything the browser can decode) → decoded in the page, cut into up to three 30-second mono
  22 kHz WAV clips from across the song (about 1.3 MB each; the API takes 5 MB and analyses 30 s), each sent to
  `POST api.reccobeats.com/v1/analysis/audio-features`, results averaged.
- **ReccoBeats unavailable** (it was down in October 2026: `530`, Cloudflare `1033`) → the browser estimates all
  nine features itself (`src/analysis.ts`): from the uploaded file, or for a link from Spotify's public 30-second
  preview, found in the track's embed page. Loudness and tempo are measured; energy, danceability,
  acousticness, instrumentalness, speechiness and valence are heuristic estimates (unvalidated against Spotify's
  values); liveness uses the dataset's typical value. The page says when features are estimated.

Analysed songs are kept in this browser's localStorage (up to 24). The mood is always computed locally.

**Proxy.** Browsers only let a page read ReccoBeats' replies if ReccoBeats sends CORS headers, and on the live
site the requests were refused ("Your browser blocked the request…"). So requests go through a proxy:

- `npm run dev`: Vite's dev server proxies `/reccobeats/*`, `/spotify/*` and `/scdn/*` (`vite.config.ts`). Nothing
  to set up.
- Live site: a Cloudflare Worker (`proxy/`, free plan) at the address in `src/config.ts`. Deploy steps in
  `proxy/README.md`. Without it the site calls ReccoBeats directly.

**Not yet tested against the live ReccoBeats API**: the build environment couldn't reach it. The flows are
tested end to end with mocked responses (shapes taken from its OpenAPI description), and the parser accepts
both `{ content: [...] }` lists and bare objects. Check a link and an upload once on the deployed site.

## Run it

```bash
npm install
npm run dev        # development server
npm test           # forest vs scikit-learn on 200 test songs; link parsing, clips, WAV, tempo estimate
npm run build      # fetches fonts, type-checks, builds into dist/
```

## Where things are

| Path | What |
| --- | --- |
| `ml/train_export.py` | Trains the 40-tree forest, exports `public/forest.bin`, writes `src/data/*.json`. See `ml/README.md`. |
| `public/forest.bin` | The model: 357,368 nodes, 3.2 MB (1.4 MB gzipped). |
| `src/forest.ts` | Reads the binary; `predict`, plus the sweeps behind the slider lines and the mood map. |
| `src/content.ts` | Every fact and number on the page. Full-model numbers are copied from the notebook output. |
| `src/components/Classifier.tsx` | Link and upload, your songs, presets, sliders, verdict, probabilities, mood map. |
| `src/components/HeroDemo.tsx` | The opening's queue card: dataset songs played through the forest. |
| `src/songs.ts` | ReccoBeats calls, Spotify preview lookup, audio decoding and WAV clips, saved songs. |
| `src/analysis.ts` | Estimates the nine features from audio in the browser (FFT, onsets, tempo, heuristics). |
| `proxy/` | Cloudflare Worker that adds CORS headers for ReccoBeats and Spotify (see its README). |
| `src/hooks.ts`, `src/scroll.ts` | Smooth scroll, anchor glides and reveals (ported from mikael-portfolio). |
| `src/components/Results.tsx` | Accuracy against baselines, confusion matrix, per-mood scores, importance. |
| `src/App.tsx` | Page structure, method, and "What I learned". |
| `LEARNED.md` | The lessons, written to drop into the portfolio. |

## Publishing

`.github/workflows/deploy.yml` builds and deploys to GitHub Pages on a push to `main`, with
`BASE_PATH=/mood-classifier/`. Set Settings > Pages > Source to **GitHub Actions**. The build uses a relative
base by default, so `dist/` also works copied into any sub-folder (for example inside the portfolio).

Fonts are downloaded from Fontshare at build time and never committed (see `FONTS.md`). If Fontshare can't be
reached the build continues with fallback fonts.

Not published: the report PDF (it lists every member's student email) and the 27 MB CSV.

## Design skills

Built with three agent skills, installed per project (they live in `.claude/`, which is not committed;
`skills-lock.json` records the versions):

```bash
npx skills add emilkowalski/skill --skill emil-design-eng -a claude-code -y
npx skills add pbakaus/impeccable -a claude-code -y
npx skills add https://github.com/Leonxlnx/taste-skill --skill design-taste-frontend -a claude-code -y
```

Checks run on this version: `impeccable detect` (no findings), taste `lint.mjs` (0 fail, 0 warn) and taste
`inspect.mjs` at 1440/768/390 (0 fail; warnings for fonts not loaded in the build sandbox and no video).
