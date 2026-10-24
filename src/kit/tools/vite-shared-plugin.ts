// Source: games/space-typing/scripts/dev/vite.worktree.config.ts (the /vocabulary/ middleware; kit copy adds /typing-texts/ and shared models)
/**
 * Dev-only Vite plugin: serves the parent repo's shared folders read-only,
 * as the nginx dev config does (infra/nginx/typing-game.local.dev.conf), so a
 * game on 127.0.0.1:<port> loads real word lists without nginx. Optionally
 * serves a shared models folder (owner GLBs, never in Git) under a URL.
 *
 *   // vite.config.ts
 *   import { serveSharedFolders } from "./src/kit/tools/vite-shared-plugin";
 *   plugins: [serveSharedFolders({ sharedRoot: join(root, "..", "..", "shared") })]
 */
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";
import type { Plugin } from "vite";

export type SharedFoldersOptions = {
  /** The parent repo's shared/ folder. Defaults to <vite root>/../../shared. */
  sharedRoot?: string;
  /** URL prefix → folder under sharedRoot (or absolute). Defaults to /vocabulary/ and /typing-texts/. */
  routes?: Readonly<Record<string, string>>;
  /** A models folder served read-only at `modelsUrl` (absolute path, or relative to the Vite root). */
  modelsDir?: string;
  /** Defaults to "/shared-models/". */
  modelsUrl?: string;
};

export const DEFAULT_SHARED_ROUTES: Readonly<Record<string, string>> = {
  "/vocabulary/": "vocabulary",
  "/typing-texts/": "typing-texts",
};

export const SHARED_CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".glb": "model/gltf-binary", ".gltf": "model/gltf+json", ".bin": "application/octet-stream", ".ktx2": "image/ktx2",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".avif": "image/avif", ".svg": "image/svg+xml",
  ".json": "application/json", ".md": "text/markdown; charset=utf-8", ".txt": "text/plain; charset=utf-8",
  ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".wav": "audio/wav", ".m4a": "audio/mp4", ".mp4": "video/mp4", ".webm": "video/webm",
};

type Mount = { prefix: string; folder: string };

/** The file a request path maps to, or null (unknown prefix, escape attempt, missing file). */
export function resolveSharedFile(mounts: readonly Mount[], urlPath: string): string | null {
  let path: string;
  try {
    path = decodeURIComponent(urlPath.split("?")[0]!.split("#")[0]!);
  } catch {
    return null;
  }
  for (const { prefix, folder } of mounts) {
    if (!path.startsWith(prefix)) continue;
    const file = normalize(join(folder, path.slice(prefix.length)));
    if (!file.startsWith(folder + sep)) return null;
    if (!existsSync(file) || !statSync(file).isFile()) return null;
    return file;
  }
  return null;
}

/** Builds the URL → folder table the plugin serves. */
export function sharedMounts(viteRoot: string, options: SharedFoldersOptions = {}): Mount[] {
  const sharedRoot = resolve(options.sharedRoot ?? join(viteRoot, "..", "..", "shared"));
  const mounts: Mount[] = Object.entries(options.routes ?? DEFAULT_SHARED_ROUTES).map(([prefix, folder]) => ({
    prefix: prefix.endsWith("/") ? prefix : prefix + "/",
    folder: resolve(sharedRoot, folder),
  }));
  if (options.modelsDir !== undefined) {
    const prefix = options.modelsUrl ?? "/shared-models/";
    mounts.push({ prefix: prefix.endsWith("/") ? prefix : prefix + "/", folder: resolve(viteRoot, options.modelsDir) });
  }
  // Longest prefix first, so a nested mount wins.
  return mounts.sort((a, b) => b.prefix.length - a.prefix.length);
}

export function serveSharedFolders(options: SharedFoldersOptions = {}): Plugin {
  let mounts: Mount[] = [];
  return {
    name: "game-kit-shared-folders",
    apply: "serve",
    configResolved(config) {
      mounts = sharedMounts(config.root, options);
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.method !== "GET" && req.method !== "HEAD") return next();
        const file = resolveSharedFile(mounts, req.url ?? "/");
        if (file === null) return next();
        res.setHeader("Content-Type", SHARED_CONTENT_TYPES[extname(file).toLowerCase()] ?? "application/octet-stream");
        res.setHeader("Cache-Control", "no-cache");
        if (req.method === "HEAD") return void res.end();
        createReadStream(file).pipe(res);
      });
    },
  };
}
