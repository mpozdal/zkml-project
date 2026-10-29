"""Ocena jakości modelu i skutków kwantyzacji.

Skrypt uzupełnia train.py o metryki wymagane w rozdziale 4 pracy:
punkt odniesienia klasyfikatora większościowego, AUC, macierz pomyłek,
walidację krzyżową, porównanie z modelem na wszystkich cechach oraz
zgodność decyzji modelu zmiennoprzecinkowego z decyzją całkowitoliczbową
liczoną tak, jak robi to obwód.
"""

import json

import numpy as np
import pandas as pd
from sklearn.datasets import fetch_openml
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    precision_recall_fscore_support,
    roc_auc_score,
)
from sklearn.model_selection import StratifiedKFold, cross_validate, train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

SCALE = 1000
SEED = 42
FEATURE_NAMES = ["duration", "credit_amount", "installment_commitment", "age"]

# Oficjalna macierz kosztów zbioru German Credit: uznanie wniosku "bad"
# za "good" jest pięciokrotnie droższe niż odrzucenie wniosku "good".
COST_FN_GOOD_REJECTED = 1
COST_FP_BAD_ACCEPTED = 5

results = {}

# ---------------------------------------------------------------- dane
credit = fetch_openml(data_id=31, as_frame=True, parser="auto")
df = credit.frame
X_raw = df[FEATURE_NAMES].values.astype(float)
y = np.where(df["class"].values == "good", 1, 0)

n_good = int(y.sum())
n_bad = int(len(y) - n_good)
results["dataset"] = {
    "n": int(len(y)),
    "n_good": n_good,
    "n_bad": n_bad,
    "majority_share": round(n_good / len(y), 4),
}

# ------------------------------------------------- podział jak w train.py
scaler = StandardScaler()
X_scaled = scaler.fit_transform(X_raw)
X_train, X_test, y_train, y_test = train_test_split(
    X_scaled, y, test_size=0.2, random_state=SEED
)

model = LogisticRegression()
model.fit(X_train, y_train)

y_pred = model.predict(X_test)
y_score = model.predict_proba(X_test)[:, 1]

prec, rec, f1, _ = precision_recall_fscore_support(y_test, y_pred, labels=[0, 1])
tn, fp, fn, tp = confusion_matrix(y_test, y_pred, labels=[0, 1]).ravel()

majority_pred = np.ones_like(y_test)
results["model_4_features"] = {
    "accuracy": round(float(accuracy_score(y_test, y_pred)), 4),
    "auc": round(float(roc_auc_score(y_test, y_score)), 4),
    "precision_bad": round(float(prec[0]), 4),
    "recall_bad": round(float(rec[0]), 4),
    "f1_bad": round(float(f1[0]), 4),
    "confusion_matrix": {"tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp)},
    "cost": int(fp * COST_FP_BAD_ACCEPTED + fn * COST_FN_GOOD_REJECTED),
}
results["baseline_majority"] = {
    "accuracy": round(float(accuracy_score(y_test, majority_pred)), 4),
    "auc": 0.5,
    "recall_bad": 0.0,
    "cost": int(np.sum(y_test == 0) * COST_FP_BAD_ACCEPTED),
}

# --------------------------------------------------- walidacja krzyżowa
cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=SEED)
pipeline = make_pipeline(StandardScaler(), LogisticRegression())
cv_scores = cross_validate(pipeline, X_raw, y, cv=cv, scoring=["accuracy", "roc_auc"])
results["cross_validation_4_features"] = {
    "accuracy_mean": round(float(cv_scores["test_accuracy"].mean()), 4),
    "accuracy_std": round(float(cv_scores["test_accuracy"].std()), 4),
    "auc_mean": round(float(cv_scores["test_roc_auc"].mean()), 4),
    "auc_std": round(float(cv_scores["test_roc_auc"].std()), 4),
}

# ------------------------------------- model odniesienia: wszystkie cechy
X_full = pd.get_dummies(df.drop(columns=["class"]), drop_first=True).values.astype(float)
cv_full = cross_validate(pipeline, X_full, y, cv=cv, scoring=["accuracy", "roc_auc"])
results["cross_validation_all_features"] = {
    "n_columns_after_encoding": int(X_full.shape[1]),
    "accuracy_mean": round(float(cv_full["test_accuracy"].mean()), 4),
    "accuracy_std": round(float(cv_full["test_accuracy"].std()), 4),
    "auc_mean": round(float(cv_full["test_roc_auc"].mean()), 4),
    "auc_std": round(float(cv_full["test_roc_auc"].std()), 4),
}

# ------------------------------------------------ arytmetyka jak w obwodzie
weights_int = [int(w * SCALE) for w in model.coef_[0]]
bias_int = int(model.intercept_[0] * SCALE)


def circuit_score(scaled_row):
    """Odtwarza rachunek obwodu: obcięcie do liczby całkowitej,
    iloczyn skalarny z dzieleniem podłogowym składnik po składniku."""
    features_int = [int(value * SCALE) for value in scaled_row]
    return bias_int + sum((x * w) // SCALE for x, w in zip(features_int, weights_int))


scores_int = np.array([circuit_score(row) for row in X_test])
pred_int_ge = (scores_int >= 0).astype(int)   # próg obwodu
pred_int_gt = (scores_int > 0).astype(int)    # próg skryptu i aplikacji

results["quantized"] = {
    "accuracy_ge": round(float(accuracy_score(y_test, pred_int_ge)), 4),
    "agreement_with_float": round(float(np.mean(pred_int_ge == y_pred)), 4),
    "disagreements": int(np.sum(pred_int_ge != y_pred)),
    "threshold_conflicts": int(np.sum(pred_int_ge != pred_int_gt)),
    "scores_equal_zero": int(np.sum(scores_int == 0)),
    "min_abs_score": int(np.min(np.abs(scores_int))),
    "weights_int": weights_int,
    "bias_int": bias_int,
}

# ------------------------------------------------------------------ wynik
print(json.dumps(results, indent=2, ensure_ascii=False))

with open("evaluation_report.json", "w", encoding="utf-8") as handle:
    json.dump(results, handle, indent=2, ensure_ascii=False)
