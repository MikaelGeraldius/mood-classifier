# Song mood classifier

Set nine Spotify audio features and a Random Forest names the song's mood: sad, happy, energetic or calm.
The model runs in the browser; nothing is sent anywhere. Built from the Machine Learning final project of
Group 3 at Universitas Multimedia Nusantara (Alto Dev, Claudia Wiyadi Gunawan, Gerald Fedorian,
Mikael Geraldius Gunawan, Nadine Kay Ludony).

React + TypeScript + Vite, custom CSS, no runtime dependencies beyond React. Same visual system as
`mikael-portfolio` (see `DESIGN.md`).

## Run it

```bash
npm install
npm run dev        # development server
npm test           # checks the browser forest against scikit-learn on 200 test songs
npm run build      # fetches fonts, type-checks, builds into dist/
```

## Where things are

| Path | What |
| --- | --- |
| `ml/train_export.py` | Trains the 40-tree forest, exports `public/forest.bin`, writes `src/data/*.json`. See `ml/README.md`. |
| `public/forest.bin` | The model: 357,368 nodes, 3.2 MB (1.4 MB gzipped). |
| `src/forest.ts` | Reads the binary; `predict`, plus the sweeps behind the slider lines and the mood map. |
| `src/content.ts` | Every fact and number on the page. Full-model numbers are copied from the notebook output. |
| `src/components/Classifier.tsx` | Presets, sliders, verdict, probabilities, mood map. |
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
