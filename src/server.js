// @ts-nocheck
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const express = require("express");
const cors = require("cors");
const http = require("http");
const crypto = require("crypto");
const socketIo = require("socket.io");
const { spawn } = require("child_process");
const fs = require("fs-extra");

const app = express();
const server = http.createServer(app);

const dashboardUser = process.env.DASHBOARD_USERNAME;
const dashboardPassword = process.env.DASHBOARD_PASSWORD;
const authConfigured = Boolean(dashboardUser || dashboardPassword);
if (authConfigured && (!dashboardUser || !dashboardPassword)) {
  throw new Error("Set both DASHBOARD_USERNAME and DASHBOARD_PASSWORD");
}
if (process.env.NODE_ENV === "production" && !authConfigured) {
  throw new Error("DASHBOARD_USERNAME and DASHBOARD_PASSWORD are required in production");
}

function credentialsMatch(header) {
  if (!authConfigured) return true;
  if (!header || !header.startsWith("Basic ")) return false;
  const supplied = Buffer.from(header.slice(6), "base64").toString("utf8");
  const expected = `${dashboardUser}:${dashboardPassword}`;
  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);
  return suppliedBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(suppliedBuffer, expectedBuffer);
}

function requireDashboardAuth(req, res, next) {
  if (credentialsMatch(req.headers.authorization)) return next();
  res.set("WWW-Authenticate", 'Basic realm="Signup dashboard", charset="UTF-8"');
  return res.status(401).send("Authentication required");
}

// Configure socket.io with proper CORS
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true
});

// Middleware
app.use(cors({
  origin: "*",
  methods: ["GET", "POST"],
  credentials: true
}));
// Hosting providers call this endpoint without dashboard credentials.
app.get("/health", (_req, res) => res.status(200).json({ ok: true }));
app.use(requireDashboardAuth);
app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

let automationProcess = null;
let automationStats = {
  isRunning: false,
  successful: 0,
  failed: 0,
  total: 0,
  target: 0,
  referralCode: "",
  progress: 0,
  startTime: null,
  currentPhone: "",
  lastPhone: ""
};

let logs = [];

// API Routes
app.post("/api/start", (req, res) => {
  const { referralCode, targetSignups = 1000, startPhone = "5000000001" } = req.body;

  if (!referralCode) {
    return res.status(400).json({ error: "Referral code required" });
  }

  if (automationProcess) {
    return res.status(409).json({ error: "Already running" });
  }

  automationStats = {
    isRunning: true,
    successful: 0,
    failed: 0,
    total: 0,
    target: targetSignups,
    referralCode: referralCode,
    progress: 0,
    startTime: Date.now(),
    currentPhone: startPhone,
    lastPhone: startPhone
  };

  logs = [];
  addLog("info", `🚀 Starting for referral: ${referralCode}`);
  addLog("info", `📱 Starting phone: ${startPhone}`);
  addLog("info", `🎯 Target: ${targetSignups} signups`);

  // Spawn the automation process
  automationProcess = spawn("node", [
    path.join(__dirname, "runner.js"),
    referralCode,
    targetSignups.toString(),
    startPhone.toString()
  ], {
    stdio: ["pipe", "pipe", "pipe", "ipc"],
    cwd: path.resolve(__dirname, ".."),
    env: { ...process.env }
  });

  // Handle IPC messages
  automationProcess.on("message", (msg) => {
    if (msg.type === "progress") {
      automationStats = { ...automationStats, ...msg.stats };
      automationStats.uptime = Math.floor((Date.now() - automationStats.startTime) / 1000);
      io.emit("progress", automationStats);
    } else if (msg.type === "log") {
      addLog(msg.logType || "info", msg.message);
      io.emit("log", { type: msg.logType || "info", message: msg.message });
    } else if (msg.type === "complete") {
      automationStats.isRunning = false;
      automationStats = { ...automationStats, ...msg.stats };
      io.emit("complete", { stats: automationStats });
      automationProcess = null;
    }
  });

  // Handle stdout
  automationProcess.stdout.on("data", (data) => {
    const output = data.toString().trim();
    if (output) {
      console.log("[Automation]", output);
      // Also send to dashboard
      if (output.includes('SUCCESS') || output.includes('❌')) {
        io.emit("log", { type: "info", message: output });
      }
    }
  });

  // Handle stderr
  automationProcess.stderr.on("data", (data) => {
    const output = data.toString().trim();
    if (output) {
      console.error("[Error]", output);
      io.emit("log", { type: "error", message: output });
    }
  });

  // Handle process exit
  automationProcess.on("close", (code) => {
    automationStats.isRunning = false;
    automationProcess = null;
    io.emit("stopped", { message: `Process ended with code ${code}` });
    console.log(`Process exited with code ${code}`);
  });

  // Handle process error
  automationProcess.on("error", (error) => {
    console.error("Process error:", error);
    automationStats.isRunning = false;
    automationProcess = null;
    io.emit("stopped", { message: `Process error: ${error.message}` });
  });

  res.json({ success: true, message: "Started" });
});

app.post("/api/stop", (req, res) => {
  if (!automationProcess) {
    return res.status(400).json({ error: "Not running" });
  }
  
  try {
    automationProcess.kill('SIGTERM');
    automationStats.isRunning = false;
    automationProcess = null;
    addLog("warning", "⏹️ Stopped by user");
    io.emit("stopped", { message: "Stopped by user" });
    res.json({ success: true, message: "Stopped" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/status", (req, res) => {
  res.json({
    status: automationStats.isRunning ? "running" : "idle",
    stats: automationStats
  });
});

app.get("/api/logs", (req, res) => {
  res.json({ logs: logs.slice(-100) });
});

app.get("/api/results", (req, res) => {
  try {
    const resultsPath = path.join(__dirname, "../results/results.json");
    if (fs.existsSync(resultsPath)) {
      const data = fs.readJsonSync(resultsPath);
      res.json(data);
    } else {
      res.json([]);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/clear-results", (req, res) => {
  try {
    const resultsPath = path.join(__dirname, "../results/results.json");
    fs.writeJsonSync(resultsPath, []);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Helper function
function addLog(type, message) {
  logs.push({ type, message, timestamp: new Date().toISOString() });
  if (logs.length > 1000) logs = logs.slice(-1000);
}

// Socket.io connection
io.on("connection", (socket) => {
  console.log("📱 Dashboard connected - Socket ID:", socket.id);
  
  // Send current status immediately
  socket.emit("progress", automationStats);
  socket.emit("logs", logs.slice(-50));
  
  // Send connection confirmation
  socket.emit("log", { type: "success", message: "✅ Connected to server" });

  socket.on("disconnect", () => {
    console.log("📱 Dashboard disconnected - Socket ID:", socket.id);
  });
});

// Serve frontend
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📱 Open this URL in your browser`);
  console.log(`ℹ️  Press Ctrl+C to stop`);
});

// Socket.IO does not pass through Express middleware, so secure its event
// connection separately as well.
io.use((socket, next) => {
  if (credentialsMatch(socket.handshake.headers.authorization)) return next();
  next(new Error("Authentication required"));
});
