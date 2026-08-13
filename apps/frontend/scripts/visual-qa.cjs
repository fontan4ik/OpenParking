const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../../..");
const OUT = path.join(ROOT, "artifacts", "iris-shots");
const REPORT = path.join(OUT, "results.json");
const BASE = process.env.OPENPARKING_QA_BASE_URL || "http://127.0.0.1:3021";

const SHOTS = [
  { name: "landing-desktop-dark-1440x900", route: "/", width: 1440, height: 900, theme: "dark" },
  { name: "landing-desktop-light-1440x900", route: "/", width: 1440, height: 900, theme: "light" },
  { name: "landing-mobile-dark-390x844", route: "/", width: 390, height: 844, theme: "dark" },
  { name: "landing-mobile-light-390x844", route: "/", width: 390, height: 844, theme: "light" },
  { name: "map-desktop-dark-1440x900", route: "/map", width: 1440, height: 900, theme: "dark" },
  { name: "map-desktop-light-1440x900", route: "/map", width: 1440, height: 900, theme: "light" },
  { name: "map-mobile-dark-390x844", route: "/map", width: 390, height: 844, theme: "dark" },
  { name: "map-mobile-light-390x844", route: "/map", width: 390, height: 844, theme: "light" },
];

function parseArgs(args) {
  const modeArg = args.find((arg) => arg.startsWith("--mode="));
  return {
    mode: modeArg ? modeArg.slice(7) : "quick",
    checkOnly: args.includes("--check-only"),
  };
}

function loadPlaywright() {
  const candidates = [
    process.env.PLAYWRIGHT_MODULE,
    "playwright",
    "C:/Users/jilig/AppData/Roaming/npm/node_modules/playwright/index.js",
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch {}
  }
  throw new Error(`Playwright not found. Set PLAYWRIGHT_MODULE or install it locally.`);
}

function browserExecutable() {
  const candidates = [
    process.env.PLAYWRIGHT_EXECUTABLE_PATH,
    process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, "Google", "Chrome", "Application", "chrome.exe"),
    process.env["PROGRAMFILES(X86)"] && path.join(process.env["PROGRAMFILES(X86)"], "Google", "Chrome", "Application", "chrome.exe"),
  ].filter(Boolean);
  const cache = process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "ms-playwright");
  if (cache && fs.existsSync(cache)) {
    for (const entry of fs.readdirSync(cache).sort().reverse()) {
      candidates.push(path.join(cache, entry, "chrome-win64", "chrome.exe"));
    }
  }
  return candidates.find((candidate) => fs.existsSync(candidate));
}

function selectedShots(mode) {
  if (mode === "full") return SHOTS;
  if (mode === "quick") return [SHOTS[0], SHOTS[6]];
  throw new Error(`Unknown mode '${mode}'. Use quick or full.`);
}

async function assertServer() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(BASE, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  } catch (error) {
    throw new Error(`QA server is unavailable at ${BASE}: ${error.message}`);
  } finally {
    clearTimeout(timer);
  }
}

async function captureSequence(browser, shots) {
  const first = shots[0];
  const context = await browser.newContext({
    viewport: { width: first.width, height: first.height },
    deviceScaleFactor: 1,
    reducedMotion: "no-preference",
  });
  const page = await context.newPage();
  const consoleErrors = [];
  const failedRequests = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message}`));
  page.on("response", (response) => {
    if (response.status() >= 400) failedRequests.push(`${response.status()} ${response.url()}`);
  });
  await page.addInitScript((theme) => localStorage.setItem("openparking-theme", theme), first.theme);

  const startedAt = Date.now();
  try {
    const response = await page.goto(`${BASE}${first.route}`, {
      waitUntil: "domcontentloaded",
      timeout: 20_000,
    });
    if (!response || !response.ok()) throw new Error(`navigation HTTP ${response?.status() || "unknown"}`);
    if (first.route === "/map") {
      await page.waitForSelector(".maplibregl-canvas", { state: "attached", timeout: 10_000 });
      await page.waitForFunction(() => {
        const canvas = document.querySelector(".maplibregl-canvas");
        return canvas && canvas.width > 0 && canvas.height > 0;
      }, null, { timeout: 10_000 });
      await page.waitForTimeout(1500);
    } else {
      await page.waitForSelector("main", { state: "visible", timeout: 10_000 });
      await page.evaluate(() => document.fonts?.ready);
      await page.waitForTimeout(700);
    }
    const results = [];
    for (const shot of shots) {
      const variantStartedAt = Date.now();
      await page.setViewportSize({ width: shot.width, height: shot.height });
      await page.evaluate((theme) => {
        localStorage.setItem("openparking-theme", theme);
        document.documentElement.dataset.theme = theme;
        window.dispatchEvent(new Event("resize"));
        window.scrollTo(0, 0);
      }, shot.theme);
      await page.waitForTimeout(first.route === "/map" ? 500 : 250);
      const file = path.join(OUT, `${shot.name}.png`);
      await page.screenshot({ path: file, fullPage: shot.route === "/" });
      results.push({ ...shot, ok: true, durationMs: Date.now() - variantStartedAt, file, consoleErrors: [...consoleErrors], failedRequests: [...failedRequests] });
    }
    return results;
  } catch (error) {
    return shots.map((shot) => ({ ...shot, ok: false, durationMs: Date.now() - startedAt, error: error.message, consoleErrors, failedRequests }));
  } finally {
    await context.close();
  }
}

async function runPool(items, concurrency, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function consume() {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, consume));
  return results;
}

async function captureGroup(browser, group) {
  let results = await captureSequence(browser, group);
  if (results.every((result) => !result.ok)) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    results = (await captureSequence(browser, group)).map((result) => ({ ...result, retry: 1 }));
  }
  return results;
}

function summarize(results, mode, checkOnly = false) {
  const failedShots = results.filter((result) => !result.ok);
  const failedRequests = results.flatMap((result) => result.failedRequests || []);
  const sameOriginFailures = failedRequests.filter((entry) => {
    try { return new URL(entry.replace(/^\d+\s+/, "")).origin === new URL(BASE).origin; } catch { return true; }
  });
  const externalWarnings = failedRequests.filter((entry) => !sameOriginFailures.includes(entry));
  const summary = {
    protocol: "VISUAL_QA_V1",
    mode,
    checkOnly,
    status: failedShots.length || sameOriginFailures.length ? "FAIL" : "PASS",
    shots: results.length,
    failedShots: failedShots.length,
    failedRequests: [...new Set(sameOriginFailures)],
    externalWarnings: [...new Set(externalWarnings)],
    durationMs: results.reduce((total, result) => total + (result.durationMs || 0), 0),
    report: REPORT,
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  return summary.status === "PASS" ? 0 : 1;
}

async function main(args = process.argv.slice(2)) {
  const { mode, checkOnly } = parseArgs(args);
  if (checkOnly) {
    if (!fs.existsSync(REPORT)) throw new Error(`No QA report at ${REPORT}`);
    const report = JSON.parse(fs.readFileSync(REPORT, "utf8"));
    process.exitCode = summarize(report.results, report.mode, true);
    return;
  }

  fs.mkdirSync(OUT, { recursive: true });
  await assertServer();
  const { chromium } = loadPlaywright();
  const executablePath = browserExecutable();
  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  try {
    const shots = selectedShots(mode);
    const groups = [...new Set(shots.map((shot) => shot.route))].map((route) => shots.filter((shot) => shot.route === route));
    const groupedResults = await runPool(groups, 2, (group) => captureGroup(browser, group));
    const results = groupedResults.flat();
    fs.writeFileSync(REPORT, JSON.stringify({ protocol: "VISUAL_QA_V1", mode, baseUrl: BASE, createdAt: new Date().toISOString(), results }, null, 2));
    process.exitCode = summarize(results, mode);
  } finally {
    await browser.close();
  }
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });

module.exports = { main, parseArgs, selectedShots, summarize, browserExecutable };
