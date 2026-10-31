# Model export

`train_export.py` reproduces the notebook (`Code_Kelompok3.ipynb`) on the same split
(`test_size=0.2, random_state=42, stratify=y`) and writes everything the site needs.

```bash
pip install scikit-learn pandas numpy
# Download 278k_song_labelled.csv from https://www.kaggle.com/datasets/abdullahorzan/moodify-dataset
python -I train_export.py path/to/278k_song_labelled.csv ../public ../src/data
```

What it does, beyond the notebook:

- Trains the browser model: same hyper-parameters, `n_estimators=40`, `max_depth=14`, on **unscaled**
  features (trees split on thresholds, so z-scoring is unnecessary).
- Packs the trees into `public/forest.bin` (format documented in `src/forest.ts`). Leaf probabilities are
  stored as bytes; the quantised forest agrees with scikit-learn on 99.95% of 2,000 test songs.
- Writes `src/data/metrics.json`: accuracy, confusion matrix, per-class scores and importance for the web model,
  plus the checks quoted on the page (majority and logistic-regression baselines, valence+energy only,
  top-3 features only, duplicate counts).
- Writes `src/data/tracks.json` (120 test-set songs and the per-mood medians used as presets) and
  `src/data/parity.json` (reference probabilities for `npm test`).

Measured here with scikit-learn 1.9: the notebook's 500-tree configuration scores 92.1% (the notebook reports
92.28%; the difference is the library version) and has 9,246,642 nodes.
