from flask import Flask,request,jsonify
import tensorflow as tf
import numpy as np

app = Flask(__name__)

model = tf.keras.models.load_model(
"models/landslide_model.h5"
)

@app.route("/predict",methods=["POST"])
def predict():

    data = request.json

    readings = data.get("readings", [])

    if len(readings) < 20:
        return jsonify({"error":"Need 20 sensor readings"}),400

    features=[]

    for r in readings[:20]:

        features.append([
        r["temperature"],
        r["humidity"],
        r["soil"],
        r["motion"],
        r["vibration"],
        r["ax"],
        r["ay"],
        r["az"],
        r["gx"],
        r["gy"],
        r["gz"]
        ])

    X = np.array(features)
    X = X.reshape(1,20,11)

    pred = model.predict(X)

    label = np.argmax(pred)

    risk_map={
    0:"SAFE",
    1:"WARNING",
    2:"DANGER"
    }

    return jsonify({
    "risk":risk_map[label],
    "probability":float(np.max(pred))
    })
app.run(port=6000)