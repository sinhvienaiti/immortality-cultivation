// Source: games/dragon-hold/tests/boundary.test.ts @06cd4e6 (adapted: pure groups of M0A_PLAN §2.1, synthesized-sound ban, storage owner)
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Tu Tiên Thủ Ải's boundary (M0A_PLAN §2.1, §3.1, canon D44). src/ imports
 * only src/**, three, three/examples/jsm/* and @fontsource/*; no other game.
 * The pure groups (src/sim, src/local, src/typing, src/content,
 * src/tinh-tu/sim) are deterministic TypeScript: no three, DOM, clock,
 * storage, network, process, Intl, host-locale formatting (toLocale*),
 * structuredClone, queueMicrotask, Math.random (or any Math[…]), trig, pow,
 * hypot or **, and they import only each other and pure kit files, also
 * through the kit's import chains (a kit file may call toLocale* with a
 * literal locale). Real-player positions stay in src/local (canon D28, D34):
 * no src/sim file but the match driver (world.ts) imports src/local.
 * No game file outside src/kit (src, scripts, tests, root configs; canon §22)
 * reaches kit/feedback/audio-cues or kit/audio/dragon-voice (they synthesize
 * sound with OscillatorNode, Q6), even through a kit barrel, and none uses
 * OscillatorNode or createOscillator. Only src/app/storage.ts touches browser
 * storage, by name, member (`window.localStorage`) or element access
 * (`globalThis["localStorage"]`). src/kit/** is checked by
 * src/kit/verify-kit.mjs instead.
 */
const ROOT = resolve(__dirname, "..");
const SRC = join(ROOT, "src");
const KIT = join(SRC, "kit");
const PURE = ["src/sim", "src/local", "src/typing", "src/content", "src/tinh-tu/sim"];
// Kit modules the pure groups may import; the chain check below proves each file reached is pure.
const PURE_KIT = ["src/kit/platform", "src/kit/typing", "src/kit/balance", "src/kit/vocab", "src/kit/input"];
const SOUND_SYNTH = ["src/kit/feedback/audio-cues.ts", "src/kit/audio/dragon-voice.ts"];
const STORAGE_OWNER = "src/app/storage.ts";
/** The one src/sim file that runs the local layer before each tick (stepMatch, runLog). */
const MATCH_DRIVER = "src/sim/world.ts";
const CODE = /\.(ts|tsx|mts|js|mjs)$/;

type Source = { path: string; abs: string; text: string };

const toRepo = (abs: string): string => relative(ROOT, abs).split(sep).join("/");
// I/O-light: /mnt/d is a 9P mount (~20 ms a visit), so each file is read, parsed and resolved once.
const readCache = new Map<string, Source>();
function read(abs: string): Source {
  let source = readCache.get(abs);
  if (source === undefined) {
    source = { path: toRepo(abs), abs, text: readFileSync(abs, "utf8") };
    readCache.set(abs, source);
  }
  return source;
}

function walk(dir: string): Source[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) return abs === KIT ? [] : walk(abs);
    return CODE.test(name) ? [read(abs)] : [];
  });
}

const sources = walk(SRC);
/** Every game file outside src/kit (canon §22): src, scripts, tests and the root configs. */
const gameFiles = [
  ...sources,
  ...walk(join(ROOT, "scripts")),
  ...walk(join(ROOT, "tests")),
  ...["vite.config.ts", "vitest.config.ts"].filter((name) => existsSync(join(ROOT, name))).map((name) => read(join(ROOT, name))),
];
const isPure = (path: string) => PURE.some((dir) => path.startsWith(dir + "/"));

/** Module specifiers of static imports, re-exports, import types and dynamic imports (once per Source object). */
const specCache = new WeakMap<Source, string[]>();
function specifiers(source: Source): string[] {
  let specs = specCache.get(source);
  if (specs === undefined) {
    specs = ts.preProcessFile(source.text, true, true).importedFiles.map((file) => file.fileName);
    specCache.set(source, specs);
  }
  return specs;
}

/** The repo-relative path a relative specifier points at (no extension resolution needed for prefix checks). */
const target = (source: Source, spec: string) => toRepo(resolve(dirname(source.abs), spec));

/** The file a relative specifier loads (.ts, then /index.ts), or null; once per (directory, specifier). */
const resolveCache = new Map<string, string | null>();
function resolveFile(from: string, spec: string): string | null {
  const base = resolve(dirname(from), spec);
  if (resolveCache.has(base)) return resolveCache.get(base)!;
  let found: string | null = null;
  for (const candidate of [base, base + ".ts", join(base, "index.ts")]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      found = candidate;
      break;
    }
  }
  resolveCache.set(base, found);
  return found;
}

/** Every file reachable from `roots` through relative imports (roots included), by absolute path. */
function reach(roots: readonly Source[]): Map<string, Source> {
  const seen = new Map<string, Source>();
  const queue = [...roots];
  while (queue.length > 0) {
    const source = queue.pop()!;
    if (seen.has(source.abs)) continue;
    seen.set(source.abs, source);
    for (const spec of specifiers(source)) {
      if (!spec.startsWith(".")) continue;
      const next = resolveFile(source.abs, spec);
      if (next !== null && !seen.has(next)) queue.push(read(next));
    }
  }
  return seen;
}

const BARE_ALLOWED = [/^three$/, /^three\/examples\/jsm\//, /^@fontsource\//];
const OTHER_GAMES = ["space-typing", "dragon-hold", "typing-defense", "typing-survival"];

const BANNED_GLOBALS = new Set([
  "window", "document", "Date", "performance", "localStorage", "sessionStorage", "indexedDB", "requestAnimationFrame",
  "setTimeout", "setInterval", "crypto", "navigator", "globalThis", "fetch", "XMLHttpRequest", "WebSocket",
  // Host and scheduling: environment, locale data, structured cloning, microtasks.
  "process", "Intl", "structuredClone", "queueMicrotask",
]);
const BANNED_MATH = new Set(["random", "sin", "cos", "tan", "asin", "acos", "atan", "atan2", "sinh", "cosh", "tanh", "asinh", "acosh", "atanh", "exp", "expm1", "log", "log1p", "log2", "log10", "pow", "hypot", "cbrt"]);
const SYNTH_NAMES = new Set(["OscillatorNode", "createOscillator"]);
const STORAGE_NAMES = new Set(["localStorage", "sessionStorage", "safeLocalStorage", "safeSessionStorage", "indexedDB"]);

/** Property names, object keys and qualified-name tails are not uses of a global. */
function isNameSlot(node: ts.Identifier): boolean {
  const parent = node.parent;
  if (ts.isPropertyAccessExpression(parent) && parent.name === node) return true;
  if ((ts.isPropertyAssignment(parent) || ts.isPropertySignature(parent) || ts.isPropertyDeclaration(parent) || ts.isMethodDeclaration(parent) || ts.isMethodSignature(parent)) && parent.name === node) return true;
  return ts.isQualifiedName(parent) && parent.right === node;
}

/** Identifier uses (and `x.name` property accesses when `members` is set) whose text is in `names`; comments and strings never count. */
function namesUsed(source: Source, names: ReadonlySet<string>, members = false): string[] {
  const file = ts.createSourceFile(source.path, source.text, ts.ScriptTarget.Latest, true);
  const found: string[] = [];
  const at = (node: ts.Node) => source.path + ":" + (file.getLineAndCharacterOfPosition(node.getStart()).line + 1);
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && names.has(node.text) && (members || !isNameSlot(node))) found.push(at(node) + " uses " + node.text);
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

/** `x.toLocaleY("en-US")`: a call whose first argument is a literal locale (deterministic; kit files only). */
function literalLocaleCall(node: ts.PropertyAccessExpression): boolean {
  const call = node.parent;
  return ts.isCallExpression(call) && call.expression === node && call.arguments.length > 0 && ts.isStringLiteralLike(call.arguments[0]!);
}

/** Identifiers and operators the pure groups may not use. */
function purityProblems(source: Source): string[] {
  const file = ts.createSourceFile(source.path, source.text, ts.ScriptTarget.Latest, true);
  const problems: string[] = [];
  const at = (node: ts.Node) => source.path + ":" + (file.getLineAndCharacterOfPosition(node.getStart()).line + 1);
  const kit = source.path.startsWith("src/kit/");
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && BANNED_GLOBALS.has(node.text) && !isNameSlot(node)) problems.push(at(node) + " uses " + node.text);
    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "Math" && BANNED_MATH.has(node.name.text)) {
      problems.push(at(node) + " uses Math." + node.name.text);
    }
    // Math["random"], Math[name]: any element access on Math dodges the name check.
    if (ts.isElementAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "Math") problems.push(at(node) + " uses Math[…]");
    // Host-locale formatting (toLocaleString, toLocaleLowerCase, …); a kit file may pass a literal locale.
    if (ts.isPropertyAccessExpression(node) && node.name.text.startsWith("toLocale") && !(kit && literalLocaleCall(node))) problems.push(at(node) + " uses " + node.name.text);
    if (ts.isBinaryExpression(node) && (node.operatorToken.kind === ts.SyntaxKind.AsteriskAsteriskToken || node.operatorToken.kind === ts.SyntaxKind.AsteriskAsteriskEqualsToken)) {
      problems.push(at(node) + " uses **");
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return problems;
}

/** Locals a kit file declares (kit/balance names a local `window`): only undeclared names are globals. */
function declared(source: Source): Set<string> {
  const names = new Set<string>();
  const file = ts.createSourceFile(source.path, source.text, ts.ScriptTarget.Latest, true);
  const visit = (node: ts.Node): void => {
    if ((ts.isParameter(node) || ts.isVariableDeclaration(node) || ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isImportSpecifier(node)) && node.name && ts.isIdentifier(node.name)) names.add(node.name.text);
    ts.forEachChild(node, visit);
  };
  visit(file);
  return names;
}

/**
 * Browser storage uses: the names as identifiers, as members (`window.localStorage`,
 * `self.sessionStorage`) or as element keys (`globalThis["indexedDB"]`); comments,
 * strings, object keys and declarations never count.
 */
function storageUses(source: Source): string[] {
  const file = ts.createSourceFile(source.path, source.text, ts.ScriptTarget.Latest, true);
  const found: string[] = [];
  const at = (node: ts.Node) => source.path + ":" + (file.getLineAndCharacterOfPosition(node.getStart()).line + 1);
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && STORAGE_NAMES.has(node.text)) {
      const parent = node.parent;
      const member = ts.isPropertyAccessExpression(parent) && parent.name === node;
      if (member || !isNameSlot(node)) found.push(at(node) + " uses " + node.text);
    }
    if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression) && STORAGE_NAMES.has(node.argumentExpression.text)) {
      found.push(at(node) + " uses " + node.argumentExpression.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

/** src/sim files other than the match driver that import src/local (the world never reads real-player positions, D28, D34). */
function simLocalImports(list: readonly Source[]): string[] {
  return list
    .filter((source) => source.path.startsWith("src/sim/") && source.path !== MATCH_DRIVER)
    .flatMap((source) =>
      specifiers(source)
        .filter((spec) => {
          if (!spec.startsWith(".")) return false;
          const to = target(source, spec);
          return to === "src/local" || to.startsWith("src/local/");
        })
        .map((spec) => source.path + " → " + spec),
    );
}

/** For each root, the synthesized-sound kit files its import chain reaches. */
function soundSynthReached(roots: readonly Source[]): string[] {
  const bad: string[] = [];
  for (const root of roots) {
    const reached = [...reach([root]).values()].map((source) => source.path).filter((path) => SOUND_SYNTH.includes(path));
    for (const path of reached) bad.push(root.path + " → " + path);
  }
  return bad;
}

describe("immortality-cultivation boundary", () => {
  it("finds the source tree", () => {
    expect(sources.length).toBeGreaterThan(20);
    for (const path of ["src/content/types.ts", "src/content/rules.ts", "src/app/storage.ts", "src/sim/world.ts"]) expect(sources.some((source) => source.path === path)).toBe(true);
    for (const path of SOUND_SYNTH) expect(existsSync(join(ROOT, path))).toBe(true);
    // The sound ban also covers scripts, tests and the root configs (canon §22: every game file outside src/kit).
    for (const path of ["scripts/visual/scenarios/ic-bench.mjs", "scripts/tinh-tu/bots.ts", "tests/boundary.test.ts", "vite.config.ts"]) expect(gameFiles.some((source) => source.path === path)).toBe(true);
  });

  it("imports only src/**, three, three/examples/jsm/* and @fontsource/*", () => {
    const bad: string[] = [];
    for (const source of sources) {
      for (const spec of specifiers(source)) {
        if (spec.startsWith(".")) {
          if (!target(source, spec).startsWith("src/")) bad.push(source.path + " → " + spec);
        } else if (!BARE_ALLOWED.some((pattern) => pattern.test(spec))) bad.push(source.path + " → " + spec);
      }
    }
    expect(bad).toEqual([]);
  });

  it("never names another game", () => {
    const bad = sources.filter((source) => specifiers(source).some((spec) => OTHER_GAMES.some((game) => spec.includes(game)))).map((source) => source.path);
    expect(bad).toEqual([]);
  });

  it("keeps the Node-only kit tools out of the game", () => {
    const bad = sources.filter((source) => specifiers(source).some((spec) => spec.startsWith(".") && target(source, spec).startsWith("src/kit/tools"))).map((source) => source.path);
    expect(bad).toEqual([]);
  });

  it("asks for assets only under /assets/immortality-cultivation/", () => {
    const bad: string[] = [];
    for (const source of sources) {
      for (const match of source.text.matchAll(/["'`](\/assets\/[^"'`]*)/g)) {
        const url = match[1]!;
        if (!url.startsWith("/assets/immortality-cultivation/")) bad.push(source.path + " → " + url);
      }
    }
    expect(bad).toEqual([]);
  });

  it("keeps the pure groups pure: imports", () => {
    const bad: string[] = [];
    for (const source of sources.filter((s) => isPure(s.path))) {
      for (const spec of specifiers(source)) {
        if (!spec.startsWith(".")) {
          bad.push(source.path + " → " + spec);
          continue;
        }
        const to = target(source, spec);
        if (!PURE.some((dir) => to.startsWith(dir + "/")) && !PURE_KIT.some((dir) => to === dir || to.startsWith(dir + "/"))) bad.push(source.path + " → " + spec);
      }
    }
    expect(bad).toEqual([]);
  });

  it("keeps the pure groups pure: no DOM, clock, storage, network, process, Intl, toLocale*, structuredClone, queueMicrotask, Math.random or Math[…], trig, pow or **", () => {
    const bad = sources.filter((s) => isPure(s.path)).flatMap(purityProblems);
    expect(bad).toEqual([]);
  });

  it("keeps real-player positions out of the world: only the match driver (world.ts) of src/sim imports src/local (D28, D34)", () => {
    expect(simLocalImports(sources)).toEqual([]);
  });

  it("keeps every kit file the pure groups reach, directly or through a barrel, pure as well", () => {
    // Rồng's round 2 lesson: the kit/platform barrel also loads frame-loop.ts and safe-storage.ts (window, localStorage).
    const reached = [...reach(sources.filter((s) => isPure(s.path))).values()];
    const kitFiles = reached.filter((source) => source.path.startsWith("src/kit/"));
    expect(kitFiles.some((s) => s.path === "src/kit/platform/rng.ts")).toBe(true);
    expect(kitFiles.map((s) => s.path).filter((path) => path === "src/kit/platform/index.ts" || path === "src/kit/platform/frame-loop.ts" || path === "src/kit/platform/safe-storage.ts")).toEqual([]);
    const bad = kitFiles.flatMap((source) => {
      const own = declared(source);
      return purityProblems(source).filter((problem) => !own.has(problem.split(" uses ")[1] ?? ""));
    });
    expect(bad).toEqual([]);
  });

  it("never reaches kit/feedback/audio-cues or kit/audio/dragon-voice from any game file (src, scripts, tests, configs), even through a kit barrel (D44, PB-20, canon §22)", () => {
    expect(soundSynthReached(gameFiles)).toEqual([]);
  });

  it("never synthesizes sound: no OscillatorNode or createOscillator in any game file outside src/kit (Q6, canon §22)", () => {
    expect(gameFiles.flatMap((source) => namesUsed(source, SYNTH_NAMES, true))).toEqual([]);
  });

  it("touches browser storage only in src/app/storage.ts, by name, member or element access (canon §23.1)", () => {
    const bad = sources
      .filter((source) => source.path !== STORAGE_OWNER)
      .flatMap((source) => [
        ...storageUses(source),
        ...specifiers(source)
          .filter((spec) => spec.startsWith(".") && target(source, spec).startsWith("src/kit/platform/safe-storage"))
          .map((spec) => source.path + " imports " + spec),
      ]);
    expect(bad).toEqual([]);
  });

  it("catches what it should (self-test)", () => {
    const fake = (text: string, path = "src/sim/fake.ts"): Source => ({ path, abs: join(ROOT, path), text });
    expect(purityProblems(fake("const a = Math.random();"))).toHaveLength(1);
    expect(purityProblems(fake("const t = Date.now();"))).toHaveLength(1);
    expect(purityProblems(fake("const p = 2 ** 3;"))).toHaveLength(1);
    expect(purityProblems(fake("const s = Math.sin(1);"))).toHaveLength(1);
    expect(purityProblems(fake("void fetch('/x');"))).toHaveLength(1);
    expect(purityProblems(fake("// window, Date, Math.random() in a comment\nconst text = 'document';\nconst o = { window: 1 };"))).toEqual([]);
    expect(specifiers(fake('import { x } from "../../../space-typing/src/logic";'))).toEqual(["../../../space-typing/src/logic"]);
    // Synthesized sound: a direct use, a member call, never a comment or string.
    expect(namesUsed(fake("const o = new OscillatorNode(ctx);", "src/audio/fake.ts"), SYNTH_NAMES, true)).toHaveLength(1);
    expect(namesUsed(fake("ctx.createOscillator();", "src/audio/fake.ts"), SYNTH_NAMES, true)).toHaveLength(1);
    expect(namesUsed(fake("// createOscillator\nconst s = 'OscillatorNode';", "src/audio/fake.ts"), SYNTH_NAMES, true)).toEqual([]);
    // Storage: the kit wrapper and the raw global count; an object key does not.
    expect(storageUses(fake("safeLocalStorage.getItem('k');", "src/ui/fake.ts"))).toHaveLength(1);
    expect(storageUses(fake("const o = { localStorage: 1 };", "src/ui/fake.ts"))).toEqual([]);
    // Storage by member and element access counts too (part A review: these slipped through).
    for (const text of [
      "window.localStorage.getItem('k');",
      "globalThis.localStorage.clear();",
      "self.sessionStorage.setItem('k', 'v');",
      "const s = window['localStorage'];",
      'const db = globalThis["indexedDB"];',
      "const s = window?.localStorage;",
      "const s = window[`sessionStorage`];",
    ]) {
      expect(storageUses(fake(text, "src/ui/fake.ts")), text).toHaveLength(1);
    }
    expect(storageUses(fake("// window.localStorage\nconst k = 'localStorage';\ninterface Bag { localStorage: number }\nconst o = { sessionStorage: 2 };", "src/ui/fake.ts"))).toEqual([]);
    // Purity, hardened: process, Intl, toLocale*, structuredClone, queueMicrotask and Math[…] in the pure groups.
    for (const text of [
      "const r = Math['random']();",
      "const key = 'random';\nconst r = Math[key]();",
      "const t = process.hrtime();",
      "const n = new Intl.NumberFormat('en').format(2);",
      "const s = (1.5).toLocaleString();",
      "const w = 'A'.toLocaleLowerCase('en-US');",
      "const c = structuredClone({ a: 1 });",
      "queueMicrotask(() => undefined);",
    ]) {
      expect(purityProblems(fake(text)).length, text).toBeGreaterThan(0);
    }
    // A kit file reached by a pure group may lower-case with a literal locale (kit/vocab/content-filter.ts), not with the host's.
    expect(purityProblems(fake('const w = "A".toLocaleLowerCase("en-US");', "src/kit/vocab/fake.ts"))).toEqual([]);
    expect(purityProblems(fake('const w = "A".toLocaleLowerCase();', "src/kit/vocab/fake.ts"))).toHaveLength(1);
    // Real-player positions: a sim file importing src/local is caught; the match driver and type-only content imports are not.
    expect(simLocalImports([fake('import { playerPos } from "../local/player";', "src/sim/fake.ts")])).toEqual(["src/sim/fake.ts → ../local/player"]);
    expect(simLocalImports([fake('import type { LocalState } from "../local";', "src/sim/fake.ts")])).toEqual(["src/sim/fake.ts → ../local"]);
    expect(simLocalImports([fake('import { stepLocal } from "../local/index";', MATCH_DRIVER)])).toEqual([]);
    expect(simLocalImports([fake('import type { LocalState } from "../content/types";', "src/sim/fake.ts")])).toEqual([]);
    // The chain check follows a kit barrel to the synthesizers.
    expect(soundSynthReached([fake('import { TIERS } from "../kit/feedback";', "src/view/fake.ts")])).toEqual(["src/view/fake.ts → src/kit/feedback/audio-cues.ts"]);
    expect(soundSynthReached([fake('import { BusMix } from "../kit/audio";', "src/audio/fake.ts")])).toEqual(["src/audio/fake.ts → src/kit/audio/dragon-voice.ts"]);
    expect(soundSynthReached([fake('import { TIERS } from "../kit/feedback/tiers";', "src/view/fake.ts")])).toEqual([]);
    // … from scripts too, and the names there count.
    expect(soundSynthReached([fake('import { AudioCues } from "../../src/kit/feedback";', "scripts/visual/fake.mjs")])).toEqual(["scripts/visual/fake.mjs → src/kit/feedback/audio-cues.ts"]);
    expect(namesUsed(fake("const osc = ctx.createOscillator();", "scripts/visual/fake.mjs"), SYNTH_NAMES, true)).toHaveLength(1);
  });
});
