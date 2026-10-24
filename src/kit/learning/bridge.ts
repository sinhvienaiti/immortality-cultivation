/**
 * The game side of the portal learning bridge (portal/src/learning/bridge.ts).
 * Inside the portal iframe, events and queries go to the parent by
 * postMessage; played alone, events wait in a local queue that is sent the
 * next time the game runs inside the portal. Every event carries this game's
 * id: the portal drops events whose gameId is not the open game.
 */
import { safeLocalStorage } from "../platform/safe-storage";
import {
  LEARNING_ACK_MESSAGE,
  LEARNING_ATTEMPT_MESSAGE,
  LEARNING_ERROR_MESSAGE,
  LEARNING_LOOKUP_MESSAGE,
  LEARNING_QUERY_MESSAGE,
  LEARNING_QUERY_RESULT_MESSAGE,
  LOOKUP_MAX_IDS,
  PARENT_ORIGIN,
  REQUEST_FOCUS_MESSAGE,
  REVIEW_ERROR_MESSAGE,
  REVIEW_READY_MESSAGE,
  SHARED_MUSIC_MESSAGE,
  SPEECH_MESSAGE,
  assertGameId,
} from "./contract";
import { normalizeLearningEntityId, type LearningEvent } from "./events";
import type { LearningEntityType } from "../vocab/types";

/** Where the bridge posts and listens; the browser window by default, a fake in tests. */
export type BridgeHost = {
  /** The portal window, or null when the game is not framed. */
  parent: { postMessage(message: unknown, targetOrigin: string): void } | null;
  addEventListener(type: "message", listener: (event: MessageEvent<unknown>) => void): void;
  removeEventListener(type: "message", listener: (event: MessageEvent<unknown>) => void): void;
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  now(): number;
};

/** The part of platform/safe-storage the queue needs. */
export type QueueStorage = {
  readJson(key: string): unknown;
  writeJson(key: string, value: unknown): boolean;
};

export type LearningBridgeOptions = {
  /** Required: the id this game has in portal/public/games.json. */
  gameId: string;
  parentOrigin?: string;
  host?: BridgeHost;
  storage?: QueueStorage;
  /** Defaults to "<gameId>:learning-queue:v1". */
  queueKey?: string;
  /** Oldest events are dropped past this many (default 500). */
  maxQueue?: number;
  /** How long a query or lookup waits for the portal (default 2000 ms, 01 §6.1). */
  timeoutMs?: number;
};

export type LearningRecordLookup = {
  entityType: LearningEntityType;
  entityIds: string[];
};

export class LearningBridgeError extends Error {
  constructor(
    readonly code: "no-portal" | "timeout" | "portal-error" | "disposed",
    message: string,
  ) {
    super(message);
    this.name = "LearningBridgeError";
  }
}

type Pending = {
  resolve(value: unknown): void;
  reject(error: Error): void;
  timer: unknown;
};

function browserHost(): BridgeHost | null {
  if (typeof window === "undefined") return null;
  const framed = window.parent !== window;
  return {
    parent: framed ? window.parent : null,
    addEventListener: (type, listener) => window.addEventListener(type, listener),
    removeEventListener: (type, listener) => window.removeEventListener(type, listener),
    setTimeout: (callback, ms) => window.setTimeout(callback, ms),
    clearTimeout: (handle) => window.clearTimeout(handle as number),
    now: () => Date.now(),
  };
}

function isLearningEvent(value: unknown): value is LearningEvent {
  if (value === null || typeof value !== "object") return false;
  const event = value as Partial<LearningEvent>;
  return event.version === 1 && typeof event.gameId === "string" && typeof event.entityId === "string";
}

export class LearningBridge {
  readonly gameId: string;
  readonly parentOrigin: string;
  readonly #host: BridgeHost | null;
  readonly #storage: QueueStorage;
  readonly #queueKey: string;
  readonly #maxQueue: number;
  readonly #timeoutMs: number;
  readonly #pending = new Map<string, Pending>();
  readonly #listeners = new Map<string, Set<(data: Record<string, unknown>) => void>>();
  readonly #onWindowMessage = (event: MessageEvent<unknown>): void => this.#receive(event);
  #sequence = 0;
  #disposed = false;

  constructor(options: LearningBridgeOptions) {
    this.gameId = assertGameId(options.gameId);
    this.parentOrigin = options.parentOrigin ?? PARENT_ORIGIN;
    this.#host = options.host ?? browserHost();
    this.#storage = options.storage ?? safeLocalStorage;
    this.#queueKey = options.queueKey ?? this.gameId + ":learning-queue:v1";
    this.#maxQueue = Math.max(1, options.maxQueue ?? 500);
    this.#timeoutMs = Math.max(1, options.timeoutMs ?? 2000);
    this.#host?.addEventListener("message", this.#onWindowMessage);
    if (this.embedded) this.flushQueue();
  }

  /** True inside the portal iframe. */
  get embedded(): boolean {
    return this.#host?.parent != null && !this.#disposed;
  }

  /** Sends one event to the portal, or queues it when there is no portal. */
  sendAttempt(event: LearningEvent): void {
    if (event.gameId !== this.gameId) {
      throw new TypeError("learning event gameId " + event.gameId + " is not " + this.gameId);
    }
    if (!this.embedded) {
      this.#writeQueue([...this.queued(), event]);
      return;
    }
    this.#post({ type: LEARNING_ATTEMPT_MESSAGE, requestId: this.#requestId(), event });
  }

  /** Events waiting for a portal (played alone). */
  queued(): LearningEvent[] {
    const raw = this.#storage.readJson(this.#queueKey);
    return Array.isArray(raw) ? raw.filter(isLearningEvent).filter((event) => event.gameId === this.gameId) : [];
  }

  /** Sends the queued events when inside the portal; returns how many were sent. */
  flushQueue(): number {
    if (!this.embedded) return 0;
    const events = this.queued();
    if (events.length === 0) return 0;
    for (const event of events) {
      this.#post({ type: LEARNING_ATTEMPT_MESSAGE, requestId: this.#requestId(), event });
    }
    this.#writeQueue([]);
    return events.length;
  }

  /** shared/learning/query.mjs query (filters, sort, page); resolves with the portal's result. */
  query(query: Record<string, unknown>): Promise<unknown> {
    return this.#request(LEARNING_QUERY_MESSAGE, query);
  }

  /** Records for up to 200 ids; an id with no record is a new word. */
  lookup(entityIds: readonly string[], entityType: LearningEntityType = "vocabulary"): Promise<unknown> {
    const ids = [...new Set(entityIds.map((id) => (entityType === "vocabulary" ? normalizeLearningEntityId(id) : id.trim())))]
      .filter((id) => id !== "");
    if (ids.length === 0 || ids.length > LOOKUP_MAX_IDS) {
      return Promise.reject(new RangeError("lookup takes 1 to " + String(LOOKUP_MAX_IDS) + " ids"));
    }
    const query: LearningRecordLookup = { entityType, entityIds: ids };
    return this.#request(LEARNING_LOOKUP_MESSAGE, query);
  }

  /** Asks the portal to focus the game's iframe (06 §2: the first key must reach the game). */
  requestFocus(): boolean {
    if (!this.embedded) return false;
    this.#post({ type: REQUEST_FOCUS_MESSAGE, gameId: this.gameId });
    return true;
  }

  /** Tells the portal speech is playing, so it ducks its music. */
  speechActive(active: boolean): void {
    if (!this.embedded) return;
    this.#post({ type: SPEECH_MESSAGE, active });
  }

  reviewReady(requestId: string, result: Record<string, unknown>): void {
    if (!this.embedded) return;
    this.#post({ type: REVIEW_READY_MESSAGE, requestId, result });
  }

  reviewError(requestId: string, message: string): void {
    if (!this.embedded) return;
    this.#post({ type: REVIEW_ERROR_MESSAGE, requestId: requestId.slice(0, 100), message });
  }

  /** Portal messages of one type (review datasets, English activities, shared music). */
  onMessage(type: string, handler: (data: Record<string, unknown>) => void): () => void {
    let handlers = this.#listeners.get(type);
    if (handlers === undefined) {
      handlers = new Set();
      this.#listeners.set(type, handlers);
    }
    handlers.add(handler);
    return () => {
      handlers?.delete(handler);
    };
  }

  onSharedMusic(handler: (playing: boolean) => void): () => void {
    return this.onMessage(SHARED_MUSIC_MESSAGE, (data) => {
      if (typeof data["playing"] === "boolean") handler(data["playing"]);
    });
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#host?.removeEventListener("message", this.#onWindowMessage);
    for (const [, pending] of this.#pending) {
      this.#host?.clearTimeout(pending.timer);
      pending.reject(new LearningBridgeError("disposed", "learning bridge closed"));
    }
    this.#pending.clear();
    this.#listeners.clear();
  }

  #request(type: string, query: unknown): Promise<unknown> {
    const host = this.#host;
    if (host === null || !this.embedded) {
      return Promise.reject(new LearningBridgeError("no-portal", "the game is not inside the portal"));
    }
    const requestId = this.#requestId();
    return new Promise((resolve, reject) => {
      const timer = host.setTimeout(() => {
        this.#pending.delete(requestId);
        reject(new LearningBridgeError("timeout", "the portal did not answer in time"));
      }, this.#timeoutMs);
      this.#pending.set(requestId, { resolve, reject, timer });
      this.#post({ type, requestId, query });
    });
  }

  #receive(event: MessageEvent<unknown>): void {
    if (this.#disposed || this.#host?.parent == null) return;
    if (event.source !== this.#host.parent || event.origin !== this.parentOrigin) return;
    if (event.data === null || typeof event.data !== "object" || Array.isArray(event.data)) return;
    const data = event.data as Record<string, unknown>;
    const type = data["type"];
    if (typeof type !== "string") return;

    const requestId = data["requestId"];
    if (typeof requestId === "string" && this.#pending.has(requestId)) {
      if (type === LEARNING_QUERY_RESULT_MESSAGE || type === LEARNING_ERROR_MESSAGE) {
        const pending = this.#pending.get(requestId)!;
        this.#pending.delete(requestId);
        this.#host.clearTimeout(pending.timer);
        if (type === LEARNING_QUERY_RESULT_MESSAGE) {
          pending.resolve(data["result"]);
        } else {
          const error = data["error"] as { message?: unknown } | undefined;
          pending.reject(
            new LearningBridgeError(
              "portal-error",
              typeof error?.message === "string" ? error.message : "learning request failed",
            ),
          );
        }
        return;
      }
    }
    if (type === LEARNING_ACK_MESSAGE) return;

    for (const handler of this.#listeners.get(type) ?? []) {
      try {
        handler(data);
      } catch (error) {
        console.error("Learning bridge handler failed", error);
      }
    }
  }

  #requestId(): string {
    this.#sequence += 1;
    const now = this.#host?.now() ?? 0;
    return this.gameId + "-" + now.toString(36) + "-" + this.#sequence.toString(36);
  }

  #post(message: Record<string, unknown>): void {
    this.#host?.parent?.postMessage(message, this.parentOrigin);
  }

  #writeQueue(events: LearningEvent[]): void {
    this.#storage.writeJson(this.#queueKey, events.slice(-this.#maxQueue));
  }
}

/** Builds the bridge; `gameId` is required. */
export function createLearningBridge(options: LearningBridgeOptions): LearningBridge {
  return new LearningBridge(options);
}
