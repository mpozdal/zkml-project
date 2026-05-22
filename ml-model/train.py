import json
import numpy as np
from sklearn.datasets import fetch_openml
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler

credit_data = fetch_openml(data_id=31, as_frame=True, parser="auto")
df = credit_data.frame

feature_names = ["duration", "credit_amount", "installment_commitment", "age"]
X_raw = df[feature_names].values

y = np.where(df["class"].values == "good", 1, 0)

scaler = StandardScaler()
X_scaled = scaler.fit_transform(X_raw)

X_train, X_test, y_train, y_test = train_test_split(
    X_scaled, y, test_size=0.2, random_state=42
)

_, X_test_raw, _, _ = train_test_split(
    X_raw, y, test_size=0.2, random_state=42
)

model = LogisticRegression()
model.fit(X_train, y_train)

raw_weights = model.coef_[0]
raw_bias = model.intercept_[0]

SCALE = 1000

sample_client_raw = X_test_raw[0]
sample_client_scaled = X_test[0]

weights_int = [int(w * SCALE) for w in raw_weights]
bias_int = int(raw_bias * SCALE)
client_features_int = [int(x * SCALE) for x in sample_client_scaled]

score_int = sum(x * w for x, w in zip(client_features_int, weights_int)) + (bias_int * SCALE)
decision = 1 if score_int > 0 else 0

input_data = {
    "weights": [str(w) for w in weights_int],
    "bias": str(bias_int * SCALE),
    "client_input": [str(x) for x in client_features_int],
    "expected_decision": str(decision)
}

with open("input.json", "w") as f:
    json.dump(input_data, f, indent=4)