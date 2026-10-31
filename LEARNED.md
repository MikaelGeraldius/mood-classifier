# Song mood classifier: notes for the portfolio

**What it is.** A Random Forest that names a song's mood (sad, happy, energetic, calm) from nine Spotify audio
features, trained on 277,938 labelled songs (Moodify dataset, Kaggle). Machine Learning final project, Group 3,
Universitas Multimedia Nusantara. I then rebuilt it as a web page where the model runs in the browser.

**Result.** 92.28% accuracy on 55,588 held-out songs (500 trees, depth 20). Calm is easiest (precision 0.95,
recall 0.97); energetic is hardest (0.89 / 0.90) because it overlaps with happy.

**My part on the web version.** Retrained a 40-tree, depth-14 forest (91.3%), packed its 357,368 nodes into a
1.4 MB (gzipped) binary, and wrote a TypeScript reader that agrees with scikit-learn on 99.95% of test songs. Built an
interactive page: sliders with live what-if lines, a valence/energy mood map you can drag, and the evaluation.

## What I learned

1. **A score needs a baseline beside it.** Always answering "happy" gets 38.3%; logistic regression gets 83.5%.
   The forest adds about nine points over a linear model: a smaller, more honest claim than "92%".
2. **Check what a cleaning step actually did.** `drop_duplicates()` removed 0 rows because the CSV's index column
   made every line unique. 1,687 songs are exact repeats; 547 test songs have a twin in training.
3. **Valence was not the axis I expected.** Under 5% of the importance; valence + energy alone reach only 67.3%.
   Instrumentalness, energy and acousticness alone reach 79.9%. The labels follow texture more than positivity.
4. **The mistakes have a shape.** Happy and energetic swap most (838 and 795 songs); calm is the most separate.
5. **Trees don't need scaling.** Thresholds move with the scale; the answers don't. Dropping the scaler simplified
   the browser model.
6. **Shipping a model is a size problem.** 9.2 million nodes down to 357 thousand cost about one point of accuracy.
7. **Third-party APIs change.** Spotify closed audio features to new apps in November 2024, so the page can't look
   songs up by name; you set the features or load a real test-set song.

Skills: Python, pandas, scikit-learn (Random Forest, evaluation), model compression and export, TypeScript,
React, data visualisation, accessible interactive UI.
