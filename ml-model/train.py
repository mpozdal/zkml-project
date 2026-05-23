import json
import hashlib
import time

import numpy as np
from sklearn.datasets import fetch_openml
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler


# =========================================================
# CONFIG
# =========================================================

SCALE = 1000
MODEL_VERSION = "v1-logreg-credit-zk"

FEATURE_NAMES = [
    "duration",
    "credit_amount",
    "installment_commitment",
    "age"
]


# =========================================================
# LOAD DATASET
# =========================================================

print("[1] Loading dataset...")

credit_data = fetch_openml(
    data_id=31,
    as_frame=True,
    parser="auto"
)

df = credit_data.frame

X_raw = df[FEATURE_NAMES].values

# good -> 1
# bad  -> 0
y = np.where(df["class"].values == "good", 1, 0)

print(f"Dataset size: {len(df)}")


# =========================================================
# PREPROCESSING
# =========================================================

print("[2] Scaling features...")

scaler = StandardScaler()
X_scaled = scaler.fit_transform(X_raw)

X_train, X_test, y_train, y_test = train_test_split(
    X_scaled,
    y,
    test_size=0.2,
    random_state=42
)

_, X_test_raw, _, _ = train_test_split(
    X_raw,
    y,
    test_size=0.2,
    random_state=42
)


# =========================================================
# TRAIN MODEL
# =========================================================

print("[3] Training logistic regression model...")

train_start = time.time()

model = LogisticRegression()
model.fit(X_train, y_train)

train_end = time.time()

print(f"Training completed in {train_end - train_start:.4f} sec")


# =========================================================
# EVALUATION
# =========================================================

print("[4] Evaluating model...")

y_pred = model.predict(X_test)

accuracy = accuracy_score(y_test, y_pred)

print(f"Accuracy: {accuracy:.4f}")
print("\nClassification Report:")
print(classification_report(y_test, y_pred))


# =========================================================
# EXTRACT MODEL PARAMETERS
# =========================================================

raw_weights = model.coef_[0]
raw_bias = model.intercept_[0]

print("\n[5] Raw model parameters")
print("Weights:", raw_weights)
print("Bias:", raw_bias)


# =========================================================
# QUANTIZATION (FIXED-POINT)
# =========================================================

print("\n[6] Quantizing model parameters...")

weights_int = [int(w * SCALE) for w in raw_weights]
bias_int = int(raw_bias * SCALE)

print("Quantized weights:", weights_int)
print("Quantized bias:", bias_int)


# =========================================================
# SAMPLE CLIENT
# =========================================================

sample_client_raw = X_test_raw[0]
sample_client_scaled = X_test[0]

client_features_int = [
    int(x * SCALE)
    for x in sample_client_scaled
]

print("\n[7] Sample client")
print("Raw features:", sample_client_raw)
print("Scaled integer features:", client_features_int)


# =========================================================
# FIXED-POINT INFERENCE
# =========================================================

print("\n[8] Running fixed-point inference...")

# IMPORTANT:
# x is scaled by SCALE
# w is scaled by SCALE
#
# therefore:
# (x * w) / SCALE keeps the same precision domain

score_int = (
    sum(
        (x * w) // SCALE
        for x, w in zip(client_features_int, weights_int)
    )
    + bias_int
)

decision = 1 if score_int > 0 else 0

print("Fixed-point score:", score_int)
print("Decision:", decision)


# =========================================================
# HASHES
# =========================================================

print("\n[9] Generating hashes...")

input_hash = hashlib.sha256(
    json.dumps(client_features_int).encode()
).hexdigest()

output_hash = hashlib.sha256(
    str(decision).encode()
).hexdigest()

model_hash = hashlib.sha256(
    json.dumps({
        "weights": weights_int,
        "bias": bias_int
    }).encode()
).hexdigest()

print("Input hash :", input_hash)
print("Output hash:", output_hash)
print("Model hash :", model_hash)


# =========================================================
# CIRCOM INPUT
# =========================================================

print("\n[10] Exporting witness input...")

input_data = {
    "client_input": [str(x) for x in client_features_int],
    "expected_decision": str(decision),

    # Optional public inputs
    "input_hash": input_hash,
    "output_hash": output_hash,
    "model_hash": model_hash
}

with open("input.json", "w") as f:
    json.dump(input_data, f, indent=4)

# =========================================================
# MODEL CONFIG
# =========================================================

print("\n[11] Exporting model configuration...")

model_config = {
    "modelVersion": MODEL_VERSION,
    "featureNames": FEATURE_NAMES,
    "scale": SCALE,

    # Model params
    "weights": weights_int,
    "bias": bias_int,

    # StandardScaler params
    "scalerMean": scaler.mean_.tolist(),
    "scalerScale": scaler.scale_.tolist(),

    # Metadata
    "accuracy": accuracy,
    "modelHash": model_hash,

    # Example
    "exampleRaw": [float(x) for x in sample_client_raw]
}

with open("model_config.json", "w") as f:
    json.dump(model_config, f, indent=4)

print("Saved: model_config.json")


# =========================================================
# SUMMARY
# =========================================================

print("\n=================================================")
print("ZKML TRAINING PIPELINE COMPLETED")
print("=================================================")

print(f"Model version : {MODEL_VERSION}")
print(f"Accuracy      : {accuracy:.4f}")
print(f"Decision      : {decision}")
print(f"Input hash    : {input_hash}")
print(f"Model hash    : {model_hash}")

print("\nFiles generated:")
print("- input.json")
print("- model_config.json")