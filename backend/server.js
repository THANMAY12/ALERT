require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
// cors package removed — using manual CORS headers instead (Express v5 compatible)
const axios = require("axios");
const dns = require("dns");
const http = require("http");
const { Server } = require("socket.io");

dns.setServers(["8.8.8.8", "8.8.4.4"]);

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: false
  }
});

// Manual CORS middleware — fully compatible with Express v5
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});
app.use(express.json());

/* -----------------------------
   MongoDB Connection
------------------------------ */

mongoose.connect(process.env.MONGO_URI);

mongoose.connection.on("connected", () => {
  console.log("MongoDB Connected");
});

mongoose.connection.on("error", (err) => {
  console.log("MongoDB Error:", err);
});

/* -----------------------------
   Schemas
------------------------------ */

const sensorSchema = new mongoose.Schema({
  temperature: Number,
  humidity: Number,
  soil: Number,
  motion: Number,
  vibration: Number,
  ax: Number,
  ay: Number,
  az: Number,
  gx: Number,
  gy: Number,
  gz: Number,
  lat: Number,
  lon: Number,
  timestamp: {
    type: Date,
    default: Date.now
  }
});

const predictionSchema = new mongoose.Schema({
  risk: String,
  probability: Number,
  timestamp: {
    type: Date,
    default: Date.now
  }
});

const Sensor = mongoose.model("Sensor", sensorSchema);
const Prediction = mongoose.model("Prediction", predictionSchema);
app.get("/", (req,res)=>{
    res.send("ALERT Backend Running")
})
/* -----------------------------
   Receive Data From ESP32
------------------------------ */

app.post("/data", async (req, res) => {

  try {

    const sensorData = new Sensor(req.body);
    await sensorData.save();

    io.emit("sensor_update", sensorData);

    console.log("Sensor data stored");

    const last20 = await Sensor.find()
      .sort({ timestamp: -1 })
      .limit(20);

    if (last20.length === 20) {

      try {

        const response = await axios.post(
          process.env.ML_SERVER,
          { readings: last20 }
        );

        const result = response.data;

        const newPred = await Prediction.create({
          risk: result.risk,
          probability: result.probability
        });

        io.emit("prediction_update", newPred);

        console.log("Prediction stored:", result);

      } catch (err) {
        console.log("ML service error");
      }

    }

    res.json({ status: "stored" });

  } catch (error) {

    res.status(500).json({ error: "Server error" });

  }

});

/* -----------------------------
   Get Latest Sensor Data
------------------------------ */

app.get("/latest", async (req, res) => {

  const data = await Sensor.findOne()
    .sort({ timestamp: -1 });

  res.json(data);

});

/* -----------------------------
   Get Last 20 Readings
------------------------------ */

app.get("/last20", async (req, res) => {

  const data = await Sensor.find()
    .sort({ timestamp: -1 })
    .limit(20);

  res.json(data);

});

/* -----------------------------
   Get Latest Prediction
------------------------------ */

app.get("/prediction", async (req, res) => {

  const pred = await Prediction.findOne()
    .sort({ timestamp: -1 });

  res.json(pred);

});


/* -----------------------------
   Prediction History
------------------------------ */

app.get("/prediction-history", async (req, res) => {

  try {

    const data = await Prediction.find()
      .sort({ timestamp: -1 })
      .limit(50);

    res.json(data);

  } catch (err) {

    res.status(500).json({
      error: "Prediction history fetch failed"
    });

  }

});

/* -----------------------------
   Export CSV
------------------------------ */

app.get("/export", async (req, res) => {

  try {

    const { start, end } = req.query;

    const data = await Sensor.find({
      timestamp: {
        $gte: new Date(start),
        $lte: new Date(end)
      }
    }).sort({ timestamp: 1 });

    let csv = "timestamp,temperature,humidity,soil,motion,vibration,ax,ay,az,gx,gy,gz\n";

    data.forEach(d => {
      csv += `${d.timestamp},${d.temperature},${d.humidity},${d.soil},${d.motion},${d.vibration},${d.ax},${d.ay},${d.az},${d.gx},${d.gy},${d.gz}\n`;
    });

    res.header("Content-Type", "text/csv");
    res.attachment("sensor_data.csv");

    res.send(csv);

  } catch (err) {

    res.status(500).json({
      error: "CSV export failed"
    });

  }

});
/* -----------------------------
   Get Data By Time Range
------------------------------ */

app.get("/history", async (req, res) => {

  try {

    const { start, end } = req.query;

    const data = await Sensor.find({
      timestamp: {
        $gte: new Date(start),
        $lte: new Date(end)
      }
    }).sort({ timestamp: 1 });

    res.json(data);

  } catch(err){

    res.status(500).json({error:"History fetch failed"});

  }

});


app.get("/api/health", (req, res) => {

  res.status(200).json({
    status: "ok"
  });

});
/* -----------------------------
   Start Server
------------------------------ */

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});