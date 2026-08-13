const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const net = require("net");

const ROOT = path.resolve(__dirname, "../../..");
const PORT = Number(process.env.OPENPARKING_QA_PORT || 3021);
const BASE = `http://127.0.0.1:${PORT}`;
const STATE = path.join(ROOT, "artifacts", "qa-server.json");
const LOG_DIR = path.join(ROOT, "logs");

function readState() {
  try { return JSON.parse(fs.readFileSync(STATE, "utf8")); } catch { return null; }
}

function isAlive(pid) {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

async function isHealthy() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try { return (await fetch(BASE, { signal: controller.signal })).ok; } catch { return false; } finally { clearTimeout(timer); }
}

function isPortOpen() {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port: PORT });
    const finish = (value) => { socket.destroy(); resolve(value); };
    socket.setTimeout(1000);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

async function waitForHealth(timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isHealthy()) return true;
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  return false;
}

async function start() {
  fs.mkdirSync(path.dirname(STATE), { recursive: true });
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const prior = readState();
  if (await isHealthy()) {
    const owned = Boolean(prior?.owned && isAlive(prior.pid));
    console.log(JSON.stringify({ status: owned ? "reused-owned" : "reused-external", baseUrl: BASE, pid: owned ? prior.pid : null }));
    return;
  }
  if (await isPortOpen()) throw new Error(`Port ${PORT} is occupied by an unhealthy external server; choose OPENPARKING_QA_PORT or stop that exact process.`);
  if (prior?.owned && isAlive(prior.pid)) throw new Error(`Owned PID ${prior.pid} is alive but ${BASE} is unhealthy.`);

  const nextBin = require.resolve("next/dist/bin/next");
  const stdout = fs.openSync(path.join(LOG_DIR, `qa-${PORT}.out.log`), "a");
  const stderr = fs.openSync(path.join(LOG_DIR, `qa-${PORT}.err.log`), "a");
  const child = spawn(process.execPath, [nextBin, "start", "apps/frontend", "-H", "127.0.0.1", "-p", String(PORT)], {
    cwd: ROOT,
    detached: true,
    windowsHide: true,
    stdio: ["ignore", stdout, stderr],
  });
  child.unref();
  fs.writeFileSync(STATE, JSON.stringify({ owned: true, pid: child.pid, port: PORT, baseUrl: BASE, startedAt: new Date().toISOString() }, null, 2));
  if (!(await waitForHealth())) {
    try { process.kill(child.pid); } catch {}
    fs.rmSync(STATE, { force: true });
    throw new Error(`Next.js did not become healthy at ${BASE}; see logs/qa-${PORT}.err.log.`);
  }
  console.log(JSON.stringify({ status: "started", baseUrl: BASE, pid: child.pid }));
}

async function stop() {
  const state = readState();
  if (!state?.owned) {
    console.log(JSON.stringify({ status: "not-owned", baseUrl: BASE }));
    return;
  }
  if (isAlive(state.pid)) process.kill(state.pid);
  fs.rmSync(STATE, { force: true });
  console.log(JSON.stringify({ status: "stopped", pid: state.pid, baseUrl: state.baseUrl }));
}

async function status() {
  const state = readState();
  console.log(JSON.stringify({ status: await isHealthy() ? "healthy" : "down", baseUrl: BASE, owned: Boolean(state?.owned && isAlive(state.pid)), pid: state?.pid || null }));
}

const action = process.argv[2] || "status";
({ start, stop, status }[action] || (() => Promise.reject(new Error("Use start, stop, or status."))))()
  .catch((error) => { console.error(error.message); process.exitCode = 1; });
