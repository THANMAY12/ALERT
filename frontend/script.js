// Global Configuration
const API = "http://localhost:5000";
const socket = io(API); // Initialize Socket.io client

// Shared UI Elements
const dangerAlert = document.getElementById("dangerAlert");
const topPredictionBox = document.getElementById("topPredictionBox");
const riskLabel = document.getElementById("risk");
const probLabel = document.getElementById("probability");
const gaugeCenterText = document.getElementById("gaugeCenterText");

// Theme colors for Chart.js
const colors = {
    bg: 'rgba(18, 24, 38, 0.7)',
    grid: 'rgba(255, 255, 255, 0.03)',
    blue: '#38bdf8',
    green: '#34d399',
    red: '#fb7185',
    yellow: '#fbbf24',
    muted: '#94a3b8'
};

// Global Charts Object
let charts = {};
let riskGaugeChart = null;
let sensorMap = null;
let mapMarker = null;

// Initialize Chart.js defaults for futuristic look
Chart.defaults.color = colors.muted;
Chart.defaults.font.family = "'Rajdhani', sans-serif";

function buildLineChartConfig(label, colorHex) {
    return {
        type: "line",
        data: {
            labels: [],
            datasets: [{
                label: label,
                data: [],
                borderColor: colorHex,
                backgroundColor: colorHex + '20', // Add transparency for fill
                borderWidth: 2,
                pointBackgroundColor: colorHex,
                pointRadius: 1,
                pointHoverRadius: 5,
                fill: true,
                tension: 0.4 // Smooth curves
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(0,0,0,0.8)',
                    titleFont: { family: 'Orbitron' },
                    padding: 10,
                    borderColor: colorHex,
                    borderWidth: 1
                }
            },
            scales: {
                x: {
                    grid: { color: colors.grid, borderColor: colors.grid },
                    ticks: { maxTicksLimit: 8 }
                },
                y: {
                    grid: { color: colors.grid, borderColor: colors.grid }
                }
            }
        }
    };
}

function initCharts() {
    // 7 Dashboard Line Charts
    charts.temperatureChart = new Chart(document.getElementById("temperatureChart"), buildLineChartConfig("Temperature (°C)", "#ff4500"));
    charts.humidityChart = new Chart(document.getElementById("humidityChart"), buildLineChartConfig("Humidity", colors.blue));
    charts.soilChart = new Chart(document.getElementById("soilChart"), buildLineChartConfig("Soil Moisture", colors.green));
    charts.motionChart = new Chart(document.getElementById("motionChart"), buildLineChartConfig("Motion Array", colors.yellow));
    charts.vibrationChart = new Chart(document.getElementById("vibrationChart"), buildLineChartConfig("Vibration Hz", colors.red));
    charts.accChart = new Chart(document.getElementById("accChart"), buildLineChartConfig("Acceleration (AX)", "#ff00ff"));
    charts.gyroChart = new Chart(document.getElementById("gyroChart"), buildLineChartConfig("Gyroscope (GX)", "#ff9900"));

    // Prediction History Chart
    charts.predictionHistoryChart = new Chart(document.getElementById("predictionHistoryChart"), {
        type: "line",
        data: {
            labels: [],
            datasets: [{
                label: "AI Risk Probability",
                data: [],
                borderColor: colors.yellow,
                backgroundColor: colors.yellow + '30',
                fill: true,
                borderWidth: 2,
                tension: 0.3,
                stepped: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { grid: { color: colors.grid } },
                y: { min: 0, max: 1, grid: { color: colors.grid } }
            }
        }
    });

    // Analytics Chart
    charts.historyChart = new Chart(document.getElementById("historyChart"), buildLineChartConfig("Historical Data", colors.blue));

    // Doughnut Risk Gauge
    riskGaugeChart = new Chart(document.getElementById("riskGaugeChart"), {
        type: "doughnut",
        data: {
            labels: ["Risk", "Safe"],
            datasets: [{
                data: [0, 100], // Will be updated dynamically 
                backgroundColor: [colors.green, 'rgba(255,255,255,0.05)'],
                borderWidth: 0,
                hoverOffset: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '80%', // Thin gauge
            rotation: -90,
            circumference: 180, // Half circle gauge
            plugins: {
                legend: { display: false },
                tooltip: { enabled: false }
            }
        }
    });
}

function initMap() {
    // Initialize leaflet map pointing to a default location
    sensorMap = L.map('sensorMap').setView([0, 0], 2);
    
    // Use CartoDB Dark Matter tile layer as a base (it inverses well with CSS filters)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
        subdomains: 'abcd',
        maxZoom: 20
    }).addTo(sensorMap);

    // Initial marker
    const customIcon = L.divIcon({
        className: 'custom-ping',
        html: `<div style="width:15px;height:15px;background:${colors.blue};border-radius:50%;box-shadow:0 0 15px ${colors.blue};"></div>`,
        iconSize: [15,15],
        iconAnchor: [7.5, 7.5]
    });

    mapMarker = L.marker([0,0], {icon: customIcon}).addTo(sensorMap);
}


function updateGauge(risk, probability) {
    let color = colors.green;
    let probPct = Math.round(probability * 100);

    // Update aesthetic colors based on risk
    if (risk === "DANGER") color = colors.red;
    else if (risk === "WARNING") color = colors.yellow;
    
    riskGaugeChart.data.datasets[0].data = [probPct, 100 - probPct];
    riskGaugeChart.data.datasets[0].backgroundColor[0] = color;
    riskGaugeChart.update();

    gaugeCenterText.innerText = risk;
    gaugeCenterText.style.color = color;
    gaugeCenterText.style.textShadow = `0 0 15px ${color}`;
}

function updateTopPrediction(data) {
    riskLabel.innerText = data.risk;
    probLabel.innerText = (data.probability * 100).toFixed(1) + "%";

    // Update classes for CSS styling
    topPredictionBox.className = `prediction-box ${data.risk.toLowerCase()}`;
    
    // Danger Alert Logic
    if (data.risk === "DANGER") {
        dangerAlert.classList.remove("hidden");
    } else {
        dangerAlert.classList.add("hidden");
    }

    updateGauge(data.risk, data.probability);
}

// -------------------------------------
// DATA FETCHING & WEBSOCKETS
// -------------------------------------

async function loadInitialData() {
    try {
        // Fetch Last 20 to prepopulate charts
        const res20 = await fetch(API + "/last20");
        const data20 = await res20.json();
        
        if (data20 && data20.length > 0) {
            // Update cards with Latest (Data 20 is sorted desc natively in backend, so index 0 is latest)
            updateSensorCards(data20[0]);
            updateMap(data20[0]);

            // Reverse data to plot chronologically left to right
            const chronoData = [...data20].reverse();
            const labels = chronoData.map(d => new Date(d.timestamp).toLocaleTimeString());

            updateChartData(charts.temperatureChart, labels, chronoData.map(d => d.temperature));
            updateChartData(charts.humidityChart, labels, chronoData.map(d => d.humidity));
            updateChartData(charts.soilChart, labels, chronoData.map(d => d.soil));
            updateChartData(charts.motionChart, labels, chronoData.map(d => d.motion));
            updateChartData(charts.vibrationChart, labels, chronoData.map(d => d.vibration));
            updateChartData(charts.accChart, labels, chronoData.map(d => d.ax));
            updateChartData(charts.gyroChart, labels, chronoData.map(d => d.gx));
        }

        // Fetch Prediction
        const resPred = await fetch(API + "/prediction");
        const predData = await resPred.json();
        if (predData) updateTopPrediction(predData);

        // Fetch Prediction History
        const resPHist = await fetch(API + "/prediction-history");
        const phData = await resPHist.json();
        if (phData && phData.length > 0) {
            const chronoHist = [...phData].reverse();
            const pLabels = chronoHist.map(d => new Date(d.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}));
            const pValues = chronoHist.map(d => d.probability);
            updateChartData(charts.predictionHistoryChart, pLabels, pValues);
        }

    } catch (e) {
        console.error("Initialization Failed:", e);
    }
}

// Socket.IO Listeners for Real-Time execution
socket.on("connect", () => {
    console.log("WebSocket connected. Listening for real-time streams.");
});

socket.on("sensor_update", (newData) => {
    // 1. Update Cards
    updateSensorCards(newData);
    
    // 2. Update Map location
    updateMap(newData);

    // 3. Append to Charts (keep max 20 points)
    const timeLabel = new Date(newData.timestamp).toLocaleTimeString();
    
    appendDataToChart(charts.temperatureChart, timeLabel, newData.temperature);
    appendDataToChart(charts.humidityChart, timeLabel, newData.humidity);
    appendDataToChart(charts.soilChart, timeLabel, newData.soil);
    appendDataToChart(charts.motionChart, timeLabel, newData.motion);
    appendDataToChart(charts.vibrationChart, timeLabel, newData.vibration);
    appendDataToChart(charts.accChart, timeLabel, newData.ax);
    appendDataToChart(charts.gyroChart, timeLabel, newData.gx);
});

socket.on("prediction_update", (newPred) => {
    updateTopPrediction(newPred);
    
    const timeLabel = new Date(newPred.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    appendDataToChart(charts.predictionHistoryChart, timeLabel, newPred.probability, 50); // Keep max 50 history
});


// -------------------------------------
// HELPER FUNCTIONS
// -------------------------------------

function updateSensorCards(data) {
    document.getElementById("temperature").innerText = data.temperature ?? "--";
    document.getElementById("humidity").innerText = data.humidity ?? "--";
    document.getElementById("soil").innerText = data.soil ?? "--";
    document.getElementById("motion").innerText = data.motion ?? "--";
    document.getElementById("vibration").innerText = data.vibration ?? "--";
}

function updateMap(data) {
    // Assuming backend data has lat/lon properties, use them. If not fallback to default.
    const lat = data.lat !== undefined ? data.lat : 34.0522; // default LA
    const lon = data.lon !== undefined ? data.lon : -118.2437;
    
    mapMarker.setLatLng([lat, lon]);
    sensorMap.setView([lat, lon], 12, { animate: true }); // Zoom to layer
}

function updateChartData(chart, labels, data) {
    chart.data.labels = labels;
    chart.data.datasets[0].data = data;
    chart.update();
}

function appendDataToChart(chart, label, dataPoint, maxPoints = 20) {
    chart.data.labels.push(label);
    chart.data.datasets[0].data.push(dataPoint);

    // Shift if length exceeds maximum
    if (chart.data.labels.length > maxPoints) {
        chart.data.labels.shift();
        chart.data.datasets[0].data.shift();
    }
    chart.update('none'); // Update without full animation to be less jittery on real-time
}


// -------------------------------------
// ANALYTICS & EXPORT
// -------------------------------------

async function loadHistory() {
    const start = document.getElementById("start").value;
    const end = document.getElementById("end").value;

    if(!start || !end) {
        alert("Please select both Start and End Dates.");
        return;
    }

    try {
        const res = await fetch(API + `/history?start=${start}&end=${end}`);
        const data = await res.json();

        if (data.length === 0) {
            alert("No data found for the selected temporal range.");
            return;
        }

        const labels = data.map(d => new Date(d.timestamp).toLocaleDateString() + ' ' + new Date(d.timestamp).toLocaleTimeString());
        updateChartData(charts.historyChart, labels, data.map(d => d.humidity)); // Ploting humidity as a proxy for historical view

    } catch(e) {
        console.error("History fetch failed:", e);
    }
}

function downloadCSV() {
    const start = document.getElementById("start").value;
    const end = document.getElementById("end").value;
    
    if(!start || !end) {
        alert("Please select temporal range to export.");
        return;
    }
    window.open(API + `/export?start=${start}&end=${end}`);
}

// -------------------------------------
// ON LOAD
// -------------------------------------
window.onload = () => {
    initCharts();
    initMap();
    loadInitialData(); 
    // WebSocket takes over live updates, so setInterval is no longer required.
};

// Required wrapper to re-render map layout boundaries if window is resized heavily
window.addEventListener('resize', () => {
    if(sensorMap) {
        sensorMap.invalidateSize();
    }
});