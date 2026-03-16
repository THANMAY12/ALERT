import pandas as pd
import numpy as np

WINDOW = 20

df = pd.read_csv("data/training_dataset.csv")

features = df.drop("risk", axis=1).values
labels = df["risk"].values

X = []
y = []

for i in range(len(df) - WINDOW):
    X.append(features[i:i+WINDOW])
    y.append(labels[i+WINDOW])

X = np.array(X)
y = np.array(y)

np.save("data/X.npy", X)
np.save("data/y.npy", y)

print("Sequences created:", X.shape)