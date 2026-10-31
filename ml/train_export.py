"""Train the browser-sized Random Forest, export it as a compact binary, and write the
metrics the site shows. Mirrors the notebook (Code_Kelompok3.ipynb) except where noted.
Usage: python -I train_export.py path/to/278k_song_labelled.csv ../public ../src/data
"""
import sys, json, struct, time
import numpy as np, pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, confusion_matrix, precision_recall_fscore_support

csv, public_dir, data_dir = sys.argv[1:4]
F = ["danceability","energy","loudness","speechiness","acousticness","instrumentalness","liveness","valence","tempo"]
MOODS = ["sad","happy","energetic","calm"]
out = {}

raw = pd.read_csv(csv).dropna()
out["rows"] = int(len(raw))
# The notebook's drop_duplicates() keeps every row: the CSV's unnamed index column differs on each line.
out["notebookDropDuplicatesRemoved"] = int(len(raw) - len(raw.drop_duplicates()))
out["duplicateSongs"] = int(raw.duplicated(subset=F + ["labels"]).sum())
out["classCounts"] = {MOODS[k]: int(v) for k, v in raw["labels"].value_counts().sort_index().items()}

df = raw  # keep the notebook's rows so the split matches it
X, y = df[F], df["labels"]
Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)
out["trainRows"], out["testRows"] = int(len(Xtr)), int(len(Xte))

# How many exact duplicate songs sit on both sides of the split?
trkeys = set(map(tuple, Xtr.values)); out["testRowsAlsoInTrain"] = int(sum(tuple(r) in trkeys for r in Xte.values))

def rf(n, d):
    return RandomForestClassifier(n_estimators=n, max_depth=d, min_samples_split=5, min_samples_leaf=2,
        max_features="sqrt", class_weight="balanced", bootstrap=True, random_state=42, n_jobs=-1)

# Scaling check: trees split on thresholds, so z-scoring should not change a single prediction.
sc = StandardScaler().fit(Xtr)
a = rf(20, 14).fit(Xtr, ytr).predict(Xte)
b = rf(20, 14).fit(sc.transform(Xtr), ytr).predict(sc.transform(Xte))
out["scalingChangedPredictions"] = int((a != b).sum())

# Baselines
out["baselineMajority"] = float((yte == ytr.mode()[0]).mean())
lr = LogisticRegression(max_iter=2000).fit(sc.transform(Xtr), ytr)
out["baselineLogReg"] = float(accuracy_score(yte, lr.predict(sc.transform(Xte))))

# Ablation: the three most important features only
top3 = ["instrumentalness","energy","acousticness"]
m3 = rf(40, 14).fit(Xtr[top3], ytr); out["top3Accuracy"] = float(accuracy_score(yte, m3.predict(Xte[top3])))
# Ablation: valence + energy only (the circumplex axes)
ve = ["valence","energy"]
mve = rf(40, 14).fit(Xtr[ve], ytr); out["valenceEnergyAccuracy"] = float(accuracy_score(yte, mve.predict(Xte[ve])))

# The browser model: raw (unscaled) features, 40 trees, depth 14
t = time.time(); model = rf(40, 14).fit(Xtr, ytr); out["trainSeconds"] = round(time.time() - t, 1)
proba = model.predict_proba(Xte); pred = proba.argmax(1)
out["web"] = {
    "trees": 40, "maxDepth": 14,
    "accuracy": float(accuracy_score(yte, pred)),
    "confusion": confusion_matrix(yte, pred).tolist(),
    "perClass": [dict(zip(["precision","recall","f1","support"], map(float, v))) for v in zip(*precision_recall_fscore_support(yte, pred))],
    "importance": dict(sorted(zip(F, map(float, model.feature_importances_)), key=lambda kv: -kv[1])),
}

# ---- Binary export. sklearn grows trees depth-first, so a split's left child is the next node.
nodes_total = 0; trees = []
for est in model.estimators_:
    tr = est.tree_
    for i in range(tr.node_count):
        if tr.children_left[i] != -1: assert tr.children_left[i] == i + 1
    trees.append(tr); nodes_total += tr.node_count
feat = np.empty(nodes_total, np.uint8); val = np.empty(nodes_total, np.float32); right = np.zeros(nodes_total, np.uint32)
leafq = np.zeros((nodes_total, 4), np.uint8); roots = []; off = 0
for tr in trees:
    roots.append(off); n = tr.node_count
    leaf = tr.children_left[:n] == -1
    feat[off:off+n] = np.where(leaf, 255, tr.feature[:n])
    val[off:off+n] = tr.threshold[:n].astype(np.float32)
    right[off:off+n] = np.where(leaf, 0, tr.children_right[:n] + off)
    v = tr.value[:n, 0, :]; v = v / v.sum(1, keepdims=True)
    leafq[off:off+n] = np.round(v * 255).astype(np.uint8)
    off += n
# A leaf stores its four class probabilities (uint8, /255) in the 4 bytes a split uses for its threshold.
vbytes = val.view(np.uint8).reshape(-1, 4).copy()
isleaf = feat == 255; vbytes[isleaf] = leafq[isleaf]
header = struct.pack("<4sIII", b"RFM1", len(trees), nodes_total, len(F)) + np.array(roots, np.uint32).tobytes()
blob = header + feat.tobytes() + b"\0" * ((-len(header) - nodes_total) % 4) + vbytes.tobytes() + right.tobytes()
open(f"{public_dir}/forest.bin", "wb").write(blob)
out["web"]["nodes"] = int(nodes_total); out["web"]["bytes"] = len(blob)

# Reference predictions for the JS parity test (quantised the same way the browser reads them)
def q_predict(x):
    acc = np.zeros(4)
    for r in roots:
        i = r
        while feat[i] != 255:
            i = i + 1 if np.float32(x[feat[i]]) <= val[i] else right[i]
        acc += vbytes[i] / 255.0
    return acc / len(roots)
rng = np.random.default_rng(7); idx = rng.choice(len(Xte), 2000, replace=False)
qp = np.array([q_predict(Xte.values[i]) for i in idx])
out["web"]["quantisedAgreement"] = float((qp.argmax(1) == pred[idx]).mean())

# Sample tracks from the test set for "try a real track" (stratified, 30 per mood)
samp = []
for k in range(4):
    sub = np.where(yte.values == k)[0]; pick = rng.choice(sub, 30, replace=False)
    for i in pick:
        samp.append({"id": int(Xte.index[i]), "label": k, "f": [round(float(v), 4) for v in Xte.values[i]]})
rng.shuffle(samp)
# Per-mood medians: the starting points for each mood preset
medians = {MOODS[k]: [round(float(v), 4) for v in Xtr[ytr == k].median().values] for k in range(4)}
ranges = {f: [float(X[f].quantile(0.005)), float(X[f].quantile(0.995))] for f in F}

json.dump(out, open(f"{data_dir}/metrics.json", "w"), indent=2)
json.dump({"features": F, "moods": MOODS, "samples": samp, "medians": medians, "ranges": ranges,
           "parity": [{"f": [float(v) for v in Xte.values[i]], "p": [round(float(v), 6) for v in qp[j]]} for j, i in enumerate(idx[:200])]},
          open(f"{data_dir}/tracks.json", "w"))
print(json.dumps({k: v for k, v in out.items() if k != "web"}, indent=1)); print({k: v for k, v in out["web"].items() if k not in ("confusion",)})
