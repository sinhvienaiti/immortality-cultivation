/**
 * Tĩnh Tu grey-box DOM (canon §16, M0A_PLAN §6.8): Tĩnh Thất (lessons, tier,
 * speed, the new-word ledger), the Khẩu Quyết card (untimed, each word typed
 * once), the 60 s session (water gradient, paper slips with their own rim
 * and icon per kind, never colour only), the end screen (score, words met,
 * the "chọn nhầm" list with meanings). Keyboard only; reduced motion. Tĩnh
 * Thất opens a new lesson only with ≥ 6 words left in the ledger, otherwise
 * it offers a review session (Thường only). The wall clock (Date.now,
 * performance.now) lives here, never in src/tinh-tu/sim.
 * Owner: Lane 8.
 */
import { gameStorage, loadKey, loadSkill, saveKey } from "../../app/storage";
import { GAME_ID, NEW_WORDS, SIM, TINH_TU } from "../../content/rules";
import { typedLetter, vietnameseInputSign } from "../../kit/input/keys";
import { createLearningBridge } from "../../kit/learning/bridge";
import { runFrameLoop, type FrameLoop } from "../../kit/platform/frame-loop";
import { KEY } from "../../kit/typing/router";
import {
  NEW_PROGRESS,
  addSessionScore,
  buildPools,
  canOpenLesson,
  minutesUntilWords,
  sessionInit,
  tamMaDistance,
  type LessonDef,
  type LessonProgress,
  type RecordSource,
  type WordRecord,
} from "../sim/lesson";
import { khauQuyetDraft, sessionDrafts, type DraftAuthor, type DraftRecord } from "../sim/learning";
import {
  createTinhTuSession,
  currentResult,
  drainEvents,
  lockedPaper,
  paperLook,
  stepTinhTu,
  summarize,
  typedLetters,
  type SessionCommand,
  type SessionSummary,
  type TinhTuSession,
  type TinhTuTier,
} from "../sim/session";
import { TRIAL_LESSONS, TRIAL_WORDS } from "../sim/trial-set";
import { topicGroup } from "../sim/topics";
import { ICONS } from "./icons";
import { lessonCounted, openLedger } from "./ledger";
import { loadRecords } from "./records";
import { createLearningSender } from "./sender";
import { SPEED_CHOICES, UNKNOWN_WPM, choiceSpeed, eEffX10, flagSpeed, profileSpeed, type Speed } from "./speed";
import { TT_CSS } from "./styles";

const STEP_MS = 1000 / SIM.tickHz;
const TIER_NAME: Readonly<Record<TinhTuTier, string>> = { "nhap-mon": "Nhập Môn", "tham-ngo": "Tham Ngộ" };
const ABANDON_MS = 2000;
const IME_NOTICE_MS = 6000;
/** Rows of Tĩnh Thất: the lessons, the review session, the tier, the speed (when not measured). */
const REVIEW_ROW = TRIAL_LESSONS.length;
const TIER_ROW = REVIEW_ROW + 1;
const SPEED_ROW = TIER_ROW + 1;

type Screen = "loading" | "home" | "khau-quyet" | "session" | "end";

interface KhauQuyet {
  readonly lesson: LessonDef;
  index: number;
  typed: number;
  errors: number;
  startedMs: number;
  readonly done: boolean[];
}

interface Gloss {
  readonly vi: string;
  readonly ipa: string;
  readonly group: string | null;
}

/** A short meaning for a slip: the whole gloss when short, else its first senses (notes in brackets out). */
export function shortGloss(vi: string, max = 44): string {
  const senses = vi
    .replace(/\s*\([^)]*\)/g, "")
    .split(";")
    .map((sense) => sense.trim())
    .filter((sense) => sense !== "");
  let out = senses[0] ?? "";
  for (const sense of senses.slice(1)) if (out.length + sense.length + 2 <= max) out += "; " + sense;
  return out.length <= max ? out : out.slice(0, max - 1) + "…";
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
}

/** A word with its typed part highlighted and its first letter underlined. */
function wordHtml(text: string, typed: number): string {
  const head = escapeHtml(text.slice(0, typed));
  const first = typed === 0 ? '<span class="tt-first">' + escapeHtml(text[0] ?? "") + "</span>" + escapeHtml(text.slice(1)) : escapeHtml(text.slice(typed));
  return (typed > 0 ? '<span class="tt-typed">' + head + "</span>" : "") + first;
}

const LOOK_ICON = { minh: ICONS.sun, plain: "", other: ICONS.drop, tamma: ICONS.crackedEye } as const;

function motionReduced(win: Window, search: URLSearchParams): boolean {
  const flag = search.get("motion");
  if (flag === "full") return false;
  if (flag === "reduce") return true;
  const setting = loadKey("settings").value.motion;
  if (setting !== "system") return setting === "reduce";
  return win.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

export function startTinhTu(doc: Document): void {
  const win = doc.defaultView ?? window;
  const search = new URLSearchParams(win.location.search);
  const debug = search.get("debug") === "1";
  const seedFlag = Number(search.get("seed"));
  const seedBase = Number.isInteger(seedFlag) && seedFlag > 0 ? seedFlag >>> 0 : Date.now() >>> 0;

  const style = doc.createElement("style");
  style.textContent = TT_CSS;
  doc.head.append(style);
  const app = doc.getElementById("tt-app") ?? doc.body.appendChild(doc.createElement("div"));
  app.id = "tt-app";
  app.className = "tt-app" + (motionReduced(win, search) ? " tt-reduce" : "");
  app.innerHTML =
    '<header class="tt-top"><span><b>Tu Tiên Thủ Ải</b> · Tĩnh Tu (bản thử)</span><span class="tt-top-status"></span></header>' +
    '<div class="tt-ime" role="status" hidden>Bộ gõ tiếng Việt đang bật (Unikey, EVKey hoặc bộ gõ của máy): chuyển sang chế độ E (tiếng Anh) rồi gõ tiếp.</div>' +
    '<main class="tt-main"></main><footer class="tt-keys"></footer>';
  const main = app.querySelector<HTMLElement>(".tt-main")!;
  const keysBar = app.querySelector<HTMLElement>(".tt-keys")!;
  const topStatus = app.querySelector<HTMLElement>(".tt-top-status")!;
  const imeBanner = app.querySelector<HTMLElement>(".tt-ime")!;

  const bridge = createLearningBridge({ gameId: GAME_ID, storage: gameStorage });
  const sender = createLearningSender(bridge, (message) => console.error(message));
  const opened = openLedger(loadKey("newwords").value);
  const ledger = opened.ledger;
  const fixedSpeed: Speed | null = flagSpeed(search) ?? profileSpeed(loadSkill("adult", "balanced"));

  const glosses = new Map<string, Gloss>();
  for (const lesson of TRIAL_LESSONS) for (const word of lesson.words) glosses.set(word.text, { vi: word.vi, ipa: word.ipa, group: lesson.group });
  for (const word of TRIAL_WORDS) if (!glosses.has(word.text)) glosses.set(word.text, { vi: word.vi, ipa: word.ipa, group: word.group });

  let screen: Screen = "loading";
  let row = 0;
  let tier: TinhTuTier = search.get("tier") === "tham-ngo" ? "tham-ngo" : "nhap-mon";
  let speedChoice = 0;
  let notice = "";
  let records = new Map<string, WordRecord>();
  let recordSource: RecordSource = "trial";
  const progress = new Map<string, LessonProgress>();
  const openedLessons = new Set<string>();
  let sessionNo = 0;
  let kq: KhauQuyet | null = null;
  let session: TinhTuSession | null = null;
  let sessionLesson: LessonDef | null = null;
  let summary: SessionSummary | null = null;
  let loop: FrameLoop | null = null;
  let pending: SessionCommand[] = [];
  let lastFrame = 0;
  let acc = 0;
  let abandonUntil = 0;
  let imeTimer = 0;
  const paperEls = new Map<number, HTMLElement>();

  const speed = (): Speed => fixedSpeed ?? choiceSpeed(SPEED_CHOICES[speedChoice] ?? 0);
  const speedLabel = (): string => {
    if (fixedSpeed !== null) return Math.round(fixedSpeed.wpm) + " WPM (" + (fixedSpeed.source === "flag" ? "?wpm=" : "hồ sơ gõ") + ")";
    const choice = SPEED_CHOICES[speedChoice] ?? 0;
    return choice === 0 ? "chưa biết (dùng " + UNKNOWN_WPM + " WPM)" : choice + " WPM";
  };
  const groupVi = (group: string | null): string => (group === null ? "—" : topicGroup(group).vi);
  const lessonProgress = (lesson: LessonDef): LessonProgress => progress.get(lesson.id) ?? NEW_PROGRESS;
  const send = (record: DraftRecord): void => void sender.send(record, Date.now());
  /** A person playing; the session id is unique for this page visit. */
  const author = (): DraftAuthor => ({ bot: false, session: "page-" + seedBase + "-" + sessionNo });
  const isOpened = (lesson: LessonDef): boolean =>
    openedLessons.has(lesson.id) || lessonCounted(ledger.snapshot(), lesson.words.map((word) => word.text), Date.now());

  function setKeys(html: string): void {
    keysBar.innerHTML = html;
  }

  function renderStatus(): void {
    const left = ledger.remaining(Date.now());
    topStatus.textContent = "Sổ từ mới: còn " + left + "/" + NEW_WORDS.perWindow + " từ trong 20 phút" + (opened.interim ? " · sổ tạm của trang" : "");
  }

  // ── Tĩnh Thất ─────────────────────────────────────────────────────────────

  function renderHome(): void {
    screen = "home";
    renderStatus();
    const rows: string[] = TRIAL_LESSONS.map((lesson, index) => {
      const done = lessonProgress(lesson);
      return (
        '<li class="tt-row" data-row="' + index + '"><span class="tt-num">' + (index + 1) + '</span><span><span class="tt-title">' + escapeHtml(lesson.name) +
        " (ô " + lesson.slot + ')</span><br><span class="tt-detail">Bài "' + escapeHtml(lesson.topicLabel) + '" · nhóm ' + escapeHtml(groupVi(lesson.group)) +
        (isOpened(lesson) ? "" : " · bài mới: 6 từ") + '</span></span><span class="tt-progress">' + done.points + "/" + TINH_TU.full +
        (done.linhNgo ? ' <span class="tt-done">Lĩnh ngộ</span>' : "") + "</span></li>"
      );
    });
    rows.push('<li class="tt-row" data-row="' + REVIEW_ROW + '"><span class="tt-num">' + (REVIEW_ROW + 1) + '</span><span><span class="tt-title">Phiên ôn</span><br><span class="tt-detail">Chỉ Thường (từ đến hạn), không có từ mới</span></span></li>');
    rows.push('<li class="tt-row" data-row="' + TIER_ROW + '"><span class="tt-num">·</span><span class="tt-choice">Bậc: ‹ <b>' + TIER_NAME[tier] + "</b> ›</span>" +
      '<span class="tt-detail">' + (tier === "nhap-mon" ? "mọi lá phù có nhãn" : "hiện chủ đề của bài; 1/3 Tâm ma không nhãn") + "</span></li>");
    rows.push('<li class="tt-row" data-row="' + SPEED_ROW + '"><span class="tt-num">·</span><span class="tt-choice">Tốc độ gõ: ' + (fixedSpeed === null ? "‹ " : "") + "<b>" + escapeHtml(speedLabel()) + "</b>" + (fixedSpeed === null ? " ›" : "") + "</span></li>");
    main.innerHTML =
      '<section class="tt-home" data-screen="home"><h1>Tĩnh Thất</h1><p class="tt-muted">Lĩnh ngộ công pháp: 100 điểm Tĩnh Tu, cộng dồn qua các phiên. Phiên 60 s; gõ Minh và Thường, tránh Tâm ma.</p>' +
      '<p class="tt-source">' + (recordSource === "portal" ? "Bản ghi học: từ portal." : "Bộ thử dự phòng (không có portal): độ thuộc của Thường và Tâm ma là giả định, chỉ để thử.") +
      (opened.interim ? " Sổ cái từ mới: bản tạm của trang (chờ Làn 3 giao typing/new-word-ledger.ts)." : "") + "</p>" +
      '<ol class="tt-rows">' + rows.join("") + '</ol><p class="tt-note" role="status">' + escapeHtml(notice) + "</p></section>";
    main.querySelector('[data-row="' + row + '"]')?.classList.add("is-selected");
    setKeys("<kbd>↑</kbd><kbd>↓</kbd> chọn · <kbd>←</kbd><kbd>→</kbd> đổi bậc, tốc độ · <kbd>1</kbd>–<kbd>4</kbd> chọn nhanh · <kbd>Enter</kbd> vào");
  }

  function startSelected(): void {
    if (row === TIER_ROW || row === SPEED_ROW) {
      changeValue(1);
      return;
    }
    if (row === REVIEW_ROW) {
      notice = "";
      startSession(null);
      return;
    }
    const lesson = TRIAL_LESSONS[row]!;
    if (!isOpened(lesson)) {
      const now = Date.now();
      const left = ledger.remaining(now);
      if (!canOpenLesson(left)) {
        const minutes = minutesUntilWords(ledger.snapshot(), now);
        notice = "Sổ từ mới còn " + left + " từ: còn " + minutes + " phút nữa đủ " + TINH_TU.lessonWords + " từ cho bài mới. Trong lúc chờ, chọn Phiên ôn (chỉ Thường).";
        row = REVIEW_ROW;
        renderHome();
        return;
      }
      // The Khẩu Quyết card is the first meeting: the 6 words count now (canon §6.4).
      for (const word of lesson.words) ledger.take(word.text, now, "tinh-tu");
      saveKey("newwords", ledger.snapshot(), now);
      openedLessons.add(lesson.id);
    }
    notice = "";
    startKhauQuyet(lesson);
  }

  function changeValue(dir: 1 | -1): void {
    if (row === TIER_ROW) tier = tier === "nhap-mon" ? "tham-ngo" : "nhap-mon";
    else if (row === SPEED_ROW && fixedSpeed === null) speedChoice = (speedChoice + dir + SPEED_CHOICES.length) % SPEED_CHOICES.length;
    renderHome();
  }

  function homeKey(event: KeyboardEvent): boolean {
    const rowCount = SPEED_ROW + 1;
    switch (event.code) {
      case "ArrowUp":
        row = (row + rowCount - 1) % rowCount;
        renderHome();
        return true;
      case "ArrowDown":
        row = (row + 1) % rowCount;
        renderHome();
        return true;
      case "ArrowLeft":
      case "ArrowRight":
        // On the speed row ←/→ change the speed; anywhere else they switch the tier.
        if (row === SPEED_ROW) changeValue(event.code === "ArrowLeft" ? -1 : 1);
        else {
          tier = tier === "nhap-mon" ? "tham-ngo" : "nhap-mon";
          renderHome();
        }
        return true;
      case "Digit1":
      case "Digit2":
      case "Digit3":
      case "Digit4":
        row = Number(event.code.slice(5)) - 1;
        renderHome();
        return true;
      case "Enter":
      case "NumpadEnter":
        startSelected();
        return true;
      default:
        return false;
    }
  }

  // ── Khẩu Quyết ────────────────────────────────────────────────────────────

  function startKhauQuyet(lesson: LessonDef): void {
    sessionNo += 1;
    kq = { lesson, index: 0, typed: 0, errors: 0, startedMs: Date.now(), done: lesson.words.map(() => false) };
    renderStatus();
    renderKhauQuyet();
  }

  function renderKhauQuyet(flash = false): void {
    screen = "khau-quyet";
    const card = kq!;
    const finished = card.index >= card.lesson.words.length;
    const items = card.lesson.words
      .map((word, index) => {
        const current = index === card.index;
        const typed = current ? card.typed : card.done[index] ? word.text.length : 0;
        return (
          '<li class="' + (current ? "is-current" : card.done[index] ? "is-done" : "") + '" data-word="' + escapeHtml(word.text) + '"><span class="tt-kq-word' + (current && flash ? " tt-err-word" : "") + '">' +
          (card.done[index] ? escapeHtml(word.text) : wordHtml(word.text, typed)) + '</span><span class="tt-ipa">' + escapeHtml(word.ipa) + "</span><span>" + escapeHtml(shortGloss(word.vi, 60)) +
          '</span><span class="tt-kq-check">' + (card.done[index] ? "✓" : "") + "</span></li>"
        );
      })
      .join("");
    main.innerHTML =
      '<section class="tt-card" data-screen="khau-quyet"><h1>Khẩu Quyết · ' + escapeHtml(card.lesson.name) + "</h1>" +
      '<p class="tt-muted">Bài "' + escapeHtml(card.lesson.topicLabel) + '" · nhóm ' + escapeHtml(groupVi(card.lesson.group)) + ". 6 từ mới: đọc nghĩa, IPA rồi gõ lại mỗi từ một lần. Không tính giờ.</p>" +
      '<ol class="tt-kq">' + items + "</ol>" +
      '<p class="tt-note" role="status">' + (finished ? "Đã gõ đủ 6 từ. Enter: vào phiên 60 s (" + TIER_NAME[tier] + ")." : "Phát âm: bản thử M0a không phát âm (hộp xám im lặng).") + "</p></section>";
    setKeys(finished ? "<kbd>Enter</kbd> vào phiên · <kbd>Esc</kbd> về Tĩnh Thất" : "Gõ từ đang sáng · <kbd>Backspace</kbd> xóa một chữ · <kbd>Esc</kbd> về Tĩnh Thất");
  }

  function khauQuyetKey(event: KeyboardEvent, letter: string | null): boolean {
    const card = kq!;
    const finished = card.index >= card.lesson.words.length;
    if (event.code === "Escape") {
      renderHome();
      return true;
    }
    if (finished) {
      if (event.code === "Enter" || event.code === "NumpadEnter") startSession(card.lesson);
      return event.code === "Enter" || event.code === "NumpadEnter";
    }
    const word = card.lesson.words[card.index]!;
    if (event.code === "Backspace") {
      card.typed = Math.max(0, card.typed - 1);
      renderKhauQuyet();
      return true;
    }
    if (letter === null) return false;
    if (letter !== word.text[card.typed]) {
      card.errors += 1;
      renderKhauQuyet(true);
      return true;
    }
    card.typed += 1;
    if (card.typed === word.text.length) {
      send(khauQuyetDraft({ id: word.text, text: word.text }, card.errors, Date.now() - card.startedMs, author()));
      card.done[card.index] = true;
      card.index += 1;
      card.typed = 0;
      card.errors = 0;
      card.startedMs = Date.now();
    }
    renderKhauQuyet();
    return true;
  }

  // ── Session ───────────────────────────────────────────────────────────────

  function startSession(lesson: LessonDef | null): void {
    if (lesson === null) sessionNo += 1;
    const seed = (seedBase + sessionNo * 7919) >>> 0;
    const pools = buildPools(TRIAL_WORDS, records, lesson, seed);
    session = createTinhTuSession(
      sessionInit({ seed, tier, mode: lesson === null ? "review" : "lesson", eEffX10: eEffX10(speed()), lesson, pools }),
    );
    sessionLesson = lesson;
    pending = [];
    abandonUntil = 0;
    paperEls.clear();
    screen = "session";
    renderStatus();
    // A review session has Thường only (canon §6.4): its legend says so and nothing else.
    const legend =
      lesson === null
        ? "<span><i></i> Giấy trơn: Thường (từ đến hạn), +2</span><span>Phiên ôn: không có từ mới, không có Tâm ma; không tính vào lĩnh ngộ.</span>"
        : '<span><i class="look-minh"></i>' + ICONS.sun + " Minh: từ mới của bài, +5</span>" +
          "<span><i></i> Giấy trơn: Thường" + (tier === "tham-ngo" ? " cùng chủ đề" : "") + ", +2</span>" +
          '<span><i class="look-other"></i>' + ICONS.drop + " Thường khác chủ đề, +2</span>" +
          '<span><i class="look-tamma"></i>' + ICONS.crackedEye + " Tâm ma: đừng gõ, −3</span>" +
          (tier === "tham-ngo" ? "<span>Tham Ngộ: 1/3 Tâm ma trông như giấy trơn; xét từ có thuộc chủ đề của bài không.</span>" : "");
    main.innerHTML =
      '<section class="tt-session" data-screen="session"><div class="tt-hud"><span class="tt-time"></span><span class="tt-score"></span>' +
      (lesson !== null ? '<span>Minh: <span class="tt-minh-dots"></span></span>' : "") + "<span>" + (lesson === null ? "Phiên ôn" : escapeHtml(lesson.name)) + " · " + TIER_NAME[tier] + "</span></div>" +
      (lesson !== null ? '<div class="tt-topic">Chủ đề của bài: <b>' + escapeHtml(groupVi(lesson.group)) + "</b> (" + escapeHtml(lesson.topicLabel) + ")</div>" : "") +
      '<div class="tt-water" style="--points:' + session.points + '">' +
      Array.from({ length: session.points }, (_, point) => '<div class="tt-point" data-point="' + point + '"></div>').join("") +
      '</div><div class="tt-legend">' + legend + '</div><p class="tt-note" role="status"></p></section>';
    setKeys("Gõ chữ trên lá phù · <kbd>Backspace</kbd> xóa · <kbd>Esc</kbd> nhả khóa (Esc hai lần: bỏ phiên) · đồng hồ không dừng");
    lastFrame = win.performance.now();
    acc = 0;
    loop = runFrameLoop({ update: updateSession, draw: drawSession });
  }

  function updateSession(now: number): void {
    const s = session;
    if (s === null) return;
    acc += Math.min(Math.max(0, now - lastFrame), 60_000);
    lastFrame = now;
    let steps = 0;
    while (acc >= STEP_MS && !s.ended && steps < 600) {
      stepTinhTu(s, pending);
      pending = [];
      acc -= STEP_MS;
      steps += 1;
    }
    const events = drainEvents(s);
    for (const record of sessionDrafts(s, events, author())) send(record);
    for (const event of events) {
      if (event.type === "key" && (event.result === KEY.wrong || event.result === KEY.switch) && event.serial >= 0) {
        const el = paperEls.get(event.serial);
        el?.classList.remove("tt-err");
        void el?.offsetWidth;
        el?.classList.add("tt-err");
      }
    }
    if (s.ended) finishSession();
  }

  function drawSession(): void {
    const s = session;
    if (s === null || screen !== "session") return;
    const left = Math.max(0, Math.ceil((s.endTick - s.tick) / SIM.tickHz));
    main.querySelector(".tt-time")!.textContent = left + " s";
    main.querySelector(".tt-score")!.textContent = "Điểm phiên: " + currentResult(s).score;
    const dots = main.querySelector(".tt-minh-dots");
    if (dots !== null) dots.innerHTML = s.minhWords.map((word) => '<span class="' + (s.typedCount[word]! > 0 ? "is-typed" : "") + '"></span>').join("");
    const live = new Set<number>();
    const locked = lockedPaper(s);
    for (const paper of s.papers) {
      live.add(paper.serial);
      let el = paperEls.get(paper.serial);
      if (el === undefined) {
        el = doc.createElement("div");
        const look = paperLook(paper);
        el.className = "tt-paper look-" + look;
        const gloss = glosses.get(paper.text);
        el.innerHTML =
          (LOOK_ICON[look] === "" ? "" : '<span class="tt-icon">' + LOOK_ICON[look] + "</span>") + '<span class="tt-word"></span>' +
          (paper.showMeaning && gloss !== undefined ? '<span class="tt-meaning">' + escapeHtml(shortGloss(gloss.vi)) + ' <span class="tt-ipa">' + escapeHtml(gloss.ipa) + "</span></span>" : "") +
          '<span class="tt-life"><i></i></span>';
        main.querySelector('[data-point="' + paper.point + '"]')?.append(el);
        paperEls.set(paper.serial, el);
      }
      const typed = typedLetters(s, paper);
      const word = el.querySelector<HTMLElement>(".tt-word")!;
      const html = wordHtml(paper.text, locked === paper ? typed : 0);
      if (word.innerHTML !== html) word.innerHTML = html;
      el.classList.toggle("is-locked", locked === paper);
      el.classList.toggle("in-grace", paper.graceFrom >= 0);
      const lifePct = Math.max(0, Math.min(100, ((paper.expires - s.tick) * 100) / Math.max(1, paper.expires - paper.born)));
      el.querySelector<HTMLElement>(".tt-life i")!.style.width = lifePct.toFixed(1) + "%";
    }
    for (const [serial, el] of paperEls) {
      if (live.has(serial)) continue;
      el.remove();
      paperEls.delete(serial);
    }
    const note = main.querySelector(".tt-note");
    if (note !== null) note.textContent = abandonUntil > win.performance.now() ? "Esc lần nữa để bỏ phiên (không tính điểm)." : "";
  }

  function stopLoop(): void {
    loop?.stop();
    loop = null;
  }

  function finishSession(): void {
    const s = session!;
    stopLoop();
    summary = summarize(s);
    if (sessionLesson !== null) progress.set(sessionLesson.id, addSessionScore(lessonProgress(sessionLesson), summary.score));
    renderEnd();
  }

  function abandonSession(): void {
    const s = session;
    stopLoop();
    if (s !== null) for (const record of sessionDrafts(s, drainEvents(s), author())) send(record);
    session = null;
    notice = "Đã bỏ phiên: không tính điểm.";
    renderHome();
  }

  function sessionKey(event: KeyboardEvent, letter: string | null): boolean {
    const s = session;
    if (s === null) return false;
    if (letter !== null) {
      pending.push({ type: "letter", letter: letter.charCodeAt(0) - 97 });
      return true;
    }
    if (event.code === "Backspace") {
      pending.push({ type: "backspace" });
      return true;
    }
    if (event.code === "Escape") {
      if (lockedPaper(s) !== null || pending.length > 0) {
        pending.push({ type: "escape" });
        return true;
      }
      const now = win.performance.now();
      if (now < abandonUntil) abandonSession();
      else abandonUntil = now + ABANDON_MS;
      return true;
    }
    return false;
  }

  // ── End screen ────────────────────────────────────────────────────────────

  function renderEnd(): void {
    screen = "end";
    const result = summary!;
    const lesson = sessionLesson;
    const done = lesson === null ? null : lessonProgress(lesson);
    const missing = result.minhMissing;
    const status =
      lesson === null
        ? "Phiên ôn: không tính vào lĩnh ngộ."
        : result.completed
          ? "Hoàn thành phiên: đã gõ đủ 6 từ Minh (điểm từ 40 tới 100)."
          : "Chưa hoàn thành: còn " + missing.length + " từ Minh chưa gõ (" + missing.join(", ") + "), không có sàn 40.";
    const minhList =
      lesson === null
        ? ""
        : "<h2>Từ Minh của bài</h2><ul class=\"tt-words\">" +
          lesson.words
            .map((word) => {
              const typed = result.minhTyped.includes(word.text);
              return '<li class="' + (typed ? "" : "is-missed") + '"><b>' + escapeHtml(word.text) + "</b> " + (typed ? "✓" : "· chưa gõ") + '<br><span class="tt-ipa">' + escapeHtml(word.ipa) + "</span> " + escapeHtml(shortGloss(word.vi)) + "</li>";
            })
            .join("") +
          "</ul>";
    const thuongList =
      result.thuongTyped.length === 0
        ? ""
        : '<h2>Thường đã gõ</h2><ul class="tt-words">' +
          result.thuongTyped.map((text) => "<li><b>" + escapeHtml(text) + "</b> " + escapeHtml(shortGloss(glosses.get(text)?.vi ?? "")) + "</li>").join("") +
          "</ul>";
    const wrongList =
      result.wrongWords.length === 0
        ? lesson === null
          ? ""
          : '<h2>Chọn nhầm</h2><p class="tt-muted">Không có: bạn đã tránh mọi Tâm ma.</p>'
        : '<h2>Chọn nhầm (Tâm ma đã gõ, −3 mỗi lần; không ghi vào sổ học)</h2><ul class="tt-words">' +
          result.wrongWords
            .map((text) => {
              const gloss = glosses.get(text);
              const away = lesson !== null && gloss?.group != null ? " · nhóm " + groupVi(gloss.group) + ", cách bài " + tamMaDistance(lesson, gloss.group) + " bậc" : "";
              return "<li><b>" + escapeHtml(text) + "</b> " + escapeHtml(shortGloss(gloss?.vi ?? "")) + '<br><span class="tt-muted">' + escapeHtml(away) + "</span></li>";
            })
            .join("") +
          "</ul>";
    main.innerHTML =
      '<section class="tt-end" data-screen="end"><h1>Kết phiên · ' + (lesson === null ? "Phiên ôn" : escapeHtml(lesson.name)) + " · " + TIER_NAME[result.tier] + "</h1>" +
      '<p class="tt-end-score">Điểm phiên: ' + result.score + "</p><p>" + escapeHtml(status) + "</p>" +
      "<p>Minh ×" + TINH_TU.minhPoints + ": " + result.minh + " · Thường ×" + TINH_TU.thuongPoints + ": " + result.thuong + " · Chọn nhầm ×−" + TINH_TU.wrongPoints + ": " + result.wrong + "</p>" +
      (done === null ? "" : '<p class="tt-progress">Tiến độ lĩnh ngộ: <b>' + done.points + "/" + TINH_TU.full + "</b> sau " + done.sessions + " phiên" + (done.linhNgo ? '<span class="tt-linh-ngo">Lĩnh ngộ</span>' : "") + "</p>") +
      minhList + thuongList + wrongList + "</section>";
    setKeys((lesson !== null && done !== null && !done.linhNgo ? "<kbd>Enter</kbd> phiên tiếp (cùng bài) · " : "<kbd>Enter</kbd> về Tĩnh Thất · ") + "<kbd>Esc</kbd> về Tĩnh Thất");
    renderStatus();
  }

  function endKey(event: KeyboardEvent): boolean {
    if (event.code === "Escape") {
      renderHome();
      return true;
    }
    if (event.code !== "Enter" && event.code !== "NumpadEnter") return false;
    const lesson = sessionLesson;
    if (lesson !== null && !lessonProgress(lesson).linhNgo) startKhauQuyet(lesson);
    else renderHome();
    return true;
  }

  // ── Keyboard ──────────────────────────────────────────────────────────────

  function showIme(): void {
    imeBanner.hidden = false;
    win.clearTimeout(imeTimer);
    imeTimer = win.setTimeout(() => (imeBanner.hidden = true), IME_NOTICE_MS);
  }

  win.addEventListener(
    "keydown",
    (event) => {
      if (vietnameseInputSign(event)) showIme();
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const letter = typedLetter(event);
      let handled = false;
      if (screen === "home") handled = homeKey(event);
      else if (screen === "khau-quyet") handled = khauQuyetKey(event, letter);
      else if (screen === "session") handled = sessionKey(event, letter);
      else if (screen === "end") handled = endKey(event);
      if (handled || event.code === "Backspace" || event.code.startsWith("Arrow")) event.preventDefault();
    },
    true,
  );

  if (debug) {
    (win as unknown as Record<string, unknown>)["__tt"] = {
      state: () => ({
        screen,
        row,
        tier,
        notice,
        remaining: ledger.remaining(Date.now()),
        interimLedger: opened.interim,
        records: recordSource,
        khauQuyet: kq === null ? null : { index: kq.index, words: kq.lesson.words.map((word) => word.text) },
        session:
          session === null
            ? null
            : {
                tick: session.tick,
                endTick: session.endTick,
                ended: session.ended,
                lessonGroup: session.init.lessonGroup,
                result: currentResult(session),
                locked: lockedPaper(session)?.serial ?? -1,
                papers: session.papers.map((paper) => ({
                  serial: paper.serial,
                  text: paper.text,
                  kind: paper.kind,
                  labelled: paper.labelled,
                  otherGroup: paper.otherGroup,
                  showMeaning: paper.showMeaning,
                  group: paper.group,
                  typed: typedLetters(session!, paper),
                  expires: paper.expires,
                })),
              },
        summary,
        progress: Object.fromEntries(progress),
        learning: { sent: sender.sent, refused: sender.refused },
      }),
    };
  }

  main.innerHTML = '<p class="tt-muted" data-screen="loading">Đang mở Tĩnh Thất…</p>';
  void loadRecords(bridge, TRIAL_WORDS, TRIAL_LESSONS, Date.now()).then((result) => {
    records = result.records;
    recordSource = result.source;
    renderHome();
  });
}
