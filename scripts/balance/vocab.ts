/**
 * The bots' word source (canon §17.1, §25): the same cold start as the page
 * (app/learning.ts loadDeckSource at vocabulary level 1, no portal records),
 * read from the parent repo's shared/vocabulary on disk. Node has no
 * `/vocabulary/` server, so `fetch` is answered from those files for the
 * duration of the load; any other URL goes to the real fetch.
 * Script side (Node): not part of the pure groups.
 * Owner: Lane 7.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDeckSource, type DeckSource, type GlossOf } from "../../src/app/learning";

const HERE = dirname(fileURLToPath(import.meta.url));
/** games/immortality-cultivation/scripts/balance → the parent repo's shared/vocabulary. */
export const VOCABULARY_DIR = resolve(HERE, "..", "..", "..", "..", "shared", "vocabulary");
/** The page's level for a profile with none (app.ts VOCAB_LEVEL). */
export const BOT_VOCAB_LEVEL = 1;

let cached: Promise<DeckSource> | null = null;

/** Serves `/vocabulary/<path>` from disk while `run` runs. */
async function withVocabularyFetch<T>(run: () => Promise<T>): Promise<T> {
  const real = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
    if (url.startsWith("/vocabulary/")) {
      const file = join(VOCABULARY_DIR, url.slice("/vocabulary/".length).split("?")[0]!);
      if (!existsSync(file)) return new Response("not found", { status: 404 });
      return new Response(readFileSync(file, "utf8"), { status: 200, headers: { "content-type": "application/json" } });
    }
    return real(input, init);
  }) as typeof fetch;
  try {
    return await run();
  } finally {
    globalThis.fetch = real;
  }
}

/** The page's cold-start deck source (cached per process). Throws when the vocabulary is missing: bots never play on the labelled fallback set unasked. */
export function botDeckSource(): Promise<DeckSource> {
  cached ??= withVocabularyFetch(() =>
    loadDeckSource(BOT_VOCAB_LEVEL, {
      // No portal for bots: a cold start (canon §17.1, §25).
      lookup: async () => {
        throw new Error("bots: no portal");
      },
      nowMs: 0,
    }),
  ).then((source) => {
    if (source.fallback) throw new Error("bots: shared/vocabulary did not load from " + VOCABULARY_DIR + " (run inside the parent repo)");
    return source;
  });
  return cached;
}

export const glossOf = (source: DeckSource): GlossOf => (wordId) => source.gloss.get(wordId) ?? null;
