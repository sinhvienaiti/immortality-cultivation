/**
 * Tĩnh Tu trial, keyboard only (canon §16; M0A_PLAN §6.8, §8 "Trình duyệt").
 * Opens /tinh-tu.html?debug=1 with an empty new-word ledger and plays it with
 * key events only: Tĩnh Thất → Khẩu Quyết (6 words typed once) → a 60 s
 * Nhập Môn session played to the end (Minh first, then Thường, never a Tâm
 * ma) → end screen → a Tham Ngộ session (topic shown) left with Esc Esc →
 * a second lesson refused while the ledger has < 6 words ("còn N phút nữa
 * đủ 6 từ") → a review session (Thường only) → a reload keeps the ledger.
 * Pictures in colour and in greyscale (slips must stay apart without colour).
 *
 *   URL=http://127.0.0.1:3008/ OUT_DIR=tmp/shots/tt node src/kit/tools/cdp-run.mjs scripts/visual/scenarios/tt-session.mjs --width=1280 --height=720
 *
 * Env: URL (http://127.0.0.1:3008/), OUT_DIR (tmp/shots/tt), WPM (35), SEED (7).
 * Owner: Lane 8.
 */
import { join, resolve } from "node:path";

const LEDGER_KEY = "immortality-cultivation.newwords";

export default async function ttSession(page) {
  const base = (process.env.URL ?? "http://127.0.0.1:3008/").replace(/\/?$/, "/");
  const out = resolve(process.env.OUT_DIR ?? "tmp/shots/tt");
  const wpm = Number(process.env.WPM ?? 35);
  const seed = Number(process.env.SEED ?? 7);
  const url = (extra = "") => base + "tinh-tu.html?debug=1&seed=" + seed + "&wpm=" + wpm + extra;
  const checks = {};
  const shots = [];
  const notes = [];
  const shot = async (name) => shots.push(await page.shot(join(out, name + ".png")));
  const state = () => page.eval("window.__tt ? window.__tt.state() : null");
  const waitFor = async (test, label, ms = 15000) => {
    for (let waited = 0; waited < ms; waited += 100) {
      const s = await state();
      if (s && test(s)) return s;
      await page.sleep(100);
    }
    notes.push("timed out waiting for " + label);
    return state();
  };
  const press = async (key, code) => {
    await page.key(key, code ? { code } : {});
    await page.sleep(60);
  };
  /** Esc lets go of a lock first; then Esc twice within 2 s leaves the session. */
  const leaveSession = async () => {
    for (let count = 0; count < 3; count += 1) {
      const s = await state();
      if (s?.screen !== "session") break;
      await page.key("Escape");
      await page.sleep(150);
    }
    return waitFor((v) => v.screen === "home", "home after Esc");
  };
  const look = (paper) => (paper.kind === "minh" ? "minh" : paper.kind === "tam-ma" ? (paper.labelled ? "tamma" : "plain") : paper.otherGroup ? "other" : "plain");
  const grey = async (on) => page.eval("document.documentElement.style.filter = " + JSON.stringify(on ? "grayscale(1)" : "") + "; true");

  /** Types the 6 Khẩu Quyết words, one key at a time. */
  const typeCard = async () => {
    const s = await waitFor((v) => v.screen === "khau-quyet", "Khẩu Quyết");
    const words = s?.khauQuyet?.words ?? [];
    for (const [index, word] of words.entries()) {
      for (const letter of word) {
        await page.key(letter);
        await page.sleep(35);
      }
      if (index === 2) await shot("tt-khau-quyet");
    }
    return waitFor((v) => v.khauQuyet?.index === words.length, "Khẩu Quyết done");
  };

  /**
   * Plays the session by keys: stays on the locked slip, else the Minh (untyped
   * first) or Thường that leaves first; never a Tâm ma. For the pictures it
   * stops typing from 4 s in until three different looks float together (at
   * most 12 s), shoots in colour and in greyscale, then plays on.
   */
  const playSession = async (untilMs, picture) => {
    const started = Date.now();
    let pictured = !picture;
    let meaningPictured = !picture;
    let keys = 0;
    while (Date.now() - started < untilMs) {
      const s = await state();
      if (!s || s.screen !== "session" || !s.session) break;
      const papers = s.session.papers;
      const elapsed = Date.now() - started;
      if (!meaningPictured && papers.some((paper) => paper.kind === "minh" && paper.showMeaning)) {
        // A Minh's first appearance carries its meaning and IPA.
        meaningPictured = true;
        await page.sleep(500);
        await shot(picture + "-meaning");
      }
      if (!pictured && elapsed > 4000 && s.session.locked < 0) {
        const looks = new Set(papers.map(look));
        if (looks.size < 3 && elapsed < 16000) {
          await page.sleep(100);
          continue;
        }
        pictured = true;
        await shot(picture);
        await grey(true);
        await shot(picture + "-grey");
        await grey(false);
        notes.push(picture + ": looks on screen " + [...looks].join(", ") + "; words " + papers.map((paper) => paper.text + "(" + look(paper) + ")").join(" "));
      }
      let target = papers.find((paper) => paper.serial === s.session.locked);
      if (!target) {
        const rank = (paper) => (paper.kind === "minh" ? 0 : 1);
        target = papers.filter((paper) => paper.kind !== "tam-ma").sort((a, b) => rank(a) - rank(b) || a.expires - b.expires)[0];
      }
      if (target) {
        const typed = target.serial === s.session.locked ? target.typed : 0;
        await page.key(target.text[typed]);
        keys += 1;
      }
      await page.sleep(70);
    }
    return keys;
  };

  // A fresh ledger, then the page.
  await page.goto(url());
  await page.eval("localStorage.removeItem(" + JSON.stringify(LEDGER_KEY) + "); true");
  await page.goto(url());
  let s = await waitFor((v) => v.screen === "home", "Tĩnh Thất");
  checks.homeLedger = s?.remaining;
  await shot("tt-home");

  // Lesson 1, Nhập Môn.
  await press("1", "Digit1");
  await press("Enter");
  s = await typeCard();
  checks.cardSent = s?.learning?.sent;
  await press("Enter");
  await waitFor((v) => v.screen === "session", "session");
  checks.sessionKeys = await playSession(70000, "tt-session-nhap-mon");
  s = await waitFor((v) => v.screen === "end", "end screen", 15000);
  checks.nhapMon = s?.summary ? { completed: s.summary.completed, score: s.summary.score, minh: s.summary.minh, thuong: s.summary.thuong, wrong: s.summary.wrong, minhAppearances: s.summary.minhAppearances } : null;
  checks.progress = s?.progress;
  checks.learning = s?.learning;
  await shot("tt-end");

  // Tham Ngộ on the same lesson (already counted in the ledger): topic on screen, left with Esc Esc.
  await press("Escape");
  await waitFor((v) => v.screen === "home", "home");
  await press("ArrowRight");
  await press("1", "Digit1");
  s = await state();
  checks.tierSwitched = s?.tier;
  checks.ledgerAfterLesson = s?.remaining;
  await press("Enter");
  await typeCard();
  await press("Enter");
  s = await waitFor((v) => v.screen === "session", "Tham Ngộ session");
  checks.thamNgoTopic = await page.eval("document.querySelector('.tt-topic')?.textContent ?? null");
  await playSession(22000, "tt-session-tham-ngo");
  s = await state();
  checks.thamNgoUnlabelled = s?.session?.papers.filter((paper) => !paper.labelled).length ?? null;
  s = await leaveSession();
  checks.abandonNotice = s?.notice;

  // Lesson 2 needs 6 new words; the ledger has 2 left: refused, the review row is offered.
  await press("2", "Digit2");
  await press("Enter");
  s = await state();
  checks.ledgerGate = { screen: s?.screen, row: s?.row, notice: s?.notice, remaining: s?.remaining };
  await shot("tt-ledger-gate");
  await press("Enter");
  s = await waitFor((v) => v.screen === "session" && v.session?.papers.length > 0, "review session");
  await page.sleep(2500);
  s = await state();
  checks.reviewKinds = [...new Set((s?.session?.papers ?? []).map((paper) => paper.kind))];
  checks.reviewGroup = s?.session?.lessonGroup ?? null;
  await shot("tt-review");
  await leaveSession();

  // The ledger outlives a reload; reduced motion turns the animations off.
  await page.goto(url("&motion=reduce"));
  s = await waitFor((v) => v.screen === "home", "home after reload");
  checks.ledgerAfterReload = s?.remaining;
  checks.reducedMotion = await page.eval("document.querySelector('.tt-app')?.classList.contains('tt-reduce') ?? null");
  checks.mouseUsed = false;

  const pass =
    checks.homeLedger === 8 &&
    checks.nhapMon?.completed === true &&
    checks.nhapMon.minhAppearances.every((count) => count >= 2) &&
    checks.learning?.refused === 0 &&
    checks.learning?.sent >= 6 &&
    checks.tierSwitched === "tham-ngo" &&
    checks.ledgerAfterLesson === 2 &&
    typeof checks.thamNgoTopic === "string" &&
    /Đã bỏ phiên/.test(checks.abandonNotice ?? "") &&
    checks.ledgerGate.screen === "home" &&
    checks.ledgerGate.row === 3 &&
    /phút nữa đủ 6 từ/.test(checks.ledgerGate.notice ?? "") &&
    checks.reviewKinds.length === 1 &&
    checks.reviewKinds[0] === "thuong" &&
    checks.ledgerAfterReload === 2 &&
    checks.reducedMotion === true &&
    notes.every((note) => !note.startsWith("timed out")) &&
    page.logs.length === 0 &&
    page.exceptions.length === 0;
  return { pass, checks, notes, shots, consoleProblems: page.logs.length + page.exceptions.length };
}
