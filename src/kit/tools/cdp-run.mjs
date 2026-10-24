#!/usr/bin/env node
// Source: games/space-typing/scripts/visual/cdp-run.mjs (kit copy, unchanged; log fixes in shared/game-kit/DRIFT.md)
/**
 * Multi-step Chrome driver for visual checks (hover, press, scroll, frame
 * sequences, several screenshots per run). scripts/visual/shot.mjs takes one
 * picture; this one runs a scenario module:
 *
 *   node scripts/visual/cdp-run.mjs scripts/visual/scenarios/title-deck.mjs [--width=1907] [--height=856] [--dpr=1] [--headful]
 *
 * A scenario is `export default async function (page) { … }` using the page API
 * below; its return value is printed as JSON with console warnings and page
 * exceptions. Scenarios read URL / OUT_DIR / Q from the environment.
 *
 * Windows + WSL (owner's machine): Chrome is the Windows one and WSL cannot reach
 * its DevTools port (NAT), so run this file with a Windows Node (portable zip
 * from nodejs.org is enough, Node 22+), from games/space-typing. Dev servers in
 * WSL are reachable at 127.0.0.1 (scripts/dev/wsl-local-stack.sh starts them).
 * CHROME_PATH overrides the browser path.
 */
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const flag = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith("--" + name + "="));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const scenarioPath = process.argv.slice(2).find((a) => !a.startsWith("--"));
if (!scenarioPath) {
  console.error("Usage: node scripts/visual/cdp-run.mjs <scenario.mjs> [--width=] [--height=] [--dpr=] [--headful]");
  process.exit(2);
}
const width = Number(flag("width", "1642"));
const height = Number(flag("height", "799"));
const dpr = Number(flag("dpr", "1"));
const headful = process.argv.includes("--headful");
const DEFAULT_CHROME = {
  win32: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  darwin: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  linux: "/usr/bin/google-chrome",
};
const chrome = process.env.CHROME_PATH ?? DEFAULT_CHROME[process.platform];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = 9300 + Math.floor(Math.random() * 600);
const profile = mkdtempSync(join(tmpdir(), "st-cdp-"));
const browser = spawn(chrome, [
  ...(headful ? [] : ["--headless=new"]),
  "--remote-debugging-port=" + port,
  "--window-size=" + width + "," + height,
  "--hide-scrollbars",
  // Real GPU (WebGL2 backgrounds, 3D models).
  "--ignore-gpu-blocklist",
  // Local self-signed nginx certificate (https://typing-game.local).
  "--ignore-certificate-errors",
  "--autoplay-policy=no-user-gesture-required",
  "--no-first-run",
  "--no-default-browser-check",
  "--user-data-dir=" + profile,
  // Extra flags, e.g. CHROME_FLAGS="--disable-gpu-vsync --disable-frame-rate-limit" for an uncapped frame rate (render benches).
  ...(process.env.CHROME_FLAGS ?? "").split(/\s+/).filter(Boolean),
  "about:blank",
], { stdio: "ignore" });

let socket;
let nextId = 0;
const pending = new Map();
const logs = [];
const exceptions = [];
let loaded = false;
const send = (method, params = {}) => new Promise((done, fail) => {
  const id = ++nextId;
  pending.set(id, (m) => (m.error ? fail(new Error(method + ": " + m.error.message)) : done(m.result)));
  socket.send(JSON.stringify({ id, method, params }));
});

const page = {
  logs, exceptions, send, sleep, width, height, dpr,
  async goto(url, { waitLoad = true, settle = 0 } = {}) {
    loaded = false;
    await send("Page.navigate", { url });
    for (let w = 0; waitLoad && !loaded && w < 30000; w += 100) await sleep(100);
    if (settle) await sleep(settle);
  },
  async eval(expression, { await: awaitPromise = true } = {}) {
    const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise, userGesture: true });
    if (r.exceptionDetails) return { evalError: r.exceptionDetails.exception?.description ?? r.exceptionDetails.text };
    return r.result?.value;
  },
  async locate(selector) {
    return page.eval("(() => { const el = document.querySelector(" + JSON.stringify(selector) +
      "); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, top: r.top, left: r.left }; })()");
  },
  async mouse(x, y, type = "mouseMoved", extra = {}) {
    await send("Input.dispatchMouseEvent", { type, x, y, button: type === "mouseMoved" ? "none" : "left", clickCount: 1, ...extra });
  },
  async hover(selector) {
    const p = await page.locate(selector);
    if (!p) { logs.push("hover target not found: " + selector); return null; }
    await page.mouse(p.x - 30, p.y - 30);
    await page.mouse(p.x, p.y);
    return p;
  },
  async click(selector, { fallback = true } = {}) {
    const p = await page.locate(selector);
    if (!p || p.w === 0) {
      if (fallback) await page.eval("document.querySelector(" + JSON.stringify(selector) + ")?.click()");
      logs.push("click fallback: " + selector);
      return null;
    }
    await page.mouse(p.x, p.y);
    await page.mouse(p.x, p.y, "mousePressed");
    await page.mouse(p.x, p.y, "mouseReleased");
    return p;
  },
  /** Holds the mouse down (for :active / press-effect pictures); call release(p). */
  async press(selector) {
    const p = await page.locate(selector);
    if (!p) return null;
    await page.mouse(p.x, p.y);
    await page.mouse(p.x, p.y, "mousePressed");
    return p;
  },
  async release(p) { await page.mouse(p.x, p.y, "mouseReleased"); },
  async key(key, { code, text } = {}) {
    await send("Input.dispatchKeyEvent", { type: "keyDown", key, code: code ?? key, text: text ?? (key.length === 1 ? key : undefined) });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key, code: code ?? key });
  },
  async typeKeys(text, delay = 45) {
    for (const ch of text) { await page.key(ch); await sleep(delay); }
  },
  async shot(file, { clip, fullPage = false, format } = {}) {
    const fmt = format ?? (file.endsWith(".jpg") ? "jpeg" : "png");
    const params = { format: fmt, ...(fmt === "jpeg" ? { quality: 82 } : {}) };
    if (clip) params.clip = { ...clip, scale: clip.scale ?? 1 };
    if (fullPage) {
      const m = await send("Page.getLayoutMetrics");
      params.clip = { x: 0, y: 0, width: m.cssContentSize.width, height: m.cssContentSize.height, scale: 1 };
      params.captureBeyondViewport = true;
    }
    const r = await send("Page.captureScreenshot", params);
    mkdirSync(dirname(resolve(file)), { recursive: true });
    writeFileSync(resolve(file), Buffer.from(r.data, "base64"));
    return file;
  },
  /** `count` pictures `interval` ms apart (each capture also takes ~50–300 ms). */
  async frames(prefix, count, interval, opts = {}) {
    const out = [];
    for (let i = 0; i < count; i += 1) {
      out.push(await page.shot(prefix + "-" + String(i).padStart(2, "0") + (opts.ext ?? ".jpg"), opts));
      await sleep(interval);
    }
    return out;
  },
  /** Slows every CSS/Web animation (0.1 = ten times slower) to inspect short effects. */
  async slowAnimations(rate) {
    await send("Animation.enable");
    await send("Animation.setPlaybackRate", { playbackRate: rate });
  },
  async viewport(w, h, scale = dpr) {
    await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: scale, mobile: false });
  },
};

async function main() {
  let pages = [];
  for (let a = 0; a < 120 && pages.length === 0; a += 1) {
    try { pages = (await (await fetch("http://127.0.0.1:" + port + "/json/list")).json()).filter((p) => p.type === "page"); } catch {}
    if (pages.length === 0) await sleep(250);
  }
  if (!pages.length) throw new Error("DevTools endpoint did not come up (is CHROME_PATH right?)");
  socket = new WebSocket(pages[0].webSocketDebuggerUrl);
  await new Promise((ok, fail) => { socket.addEventListener("open", ok, { once: true }); socket.addEventListener("error", fail, { once: true }); });
  socket.addEventListener("message", (event) => {
    const m = JSON.parse(event.data);
    if (m.id !== undefined && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    if (m.method === "Page.loadEventFired") loaded = true;
    if (m.method === "Runtime.consoleAPICalled" && ["warning", "error"].includes(m.params.type)) {
      logs.push(m.params.type + ": " + m.params.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 300));
    }
    if (m.method === "Runtime.exceptionThrown") {
      const d = m.params.exceptionDetails;
      exceptions.push((d.exception?.description ?? d.text ?? "").slice(0, 400));
    }
  });
  await send("Page.enable");
  await send("Runtime.enable");
  await page.viewport(width, height, dpr);
  const scenario = (await import(pathToFileURL(resolve(scenarioPath)).href)).default;
  const result = await scenario(page);
  console.log(JSON.stringify({ result, logs: logs.slice(0, 40), exceptions: exceptions.slice(0, 20) }, null, 1));
}

main()
  .catch((e) => { console.error(e?.stack ?? e); process.exitCode = 1; })
  .finally(async () => {
    try { await send("Browser.close"); } catch {}
    try { socket?.close(); } catch {}
    await sleep(600);
    try { browser.kill(); } catch {}
    // Windows keeps the profile locked for a moment after Chrome exits.
    for (let i = 0; i < 10; i += 1) {
      try { rmSync(profile, { recursive: true, force: true }); break; } catch { await sleep(400); }
    }
    process.exit(process.exitCode ?? 0);
  });
