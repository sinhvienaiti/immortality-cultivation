// Build and check tools: Node only (vite.config.ts, scripts); never import from browser code.
// tools/cdp-run.mjs is the CDP scenario runner: node src/kit/tools/cdp-run.mjs <scenario.mjs>.
export {
  DEFAULT_SHARED_ROUTES,
  SHARED_CONTENT_TYPES,
  resolveSharedFile,
  serveSharedFolders,
  sharedMounts,
  type SharedFoldersOptions,
} from "./vite-shared-plugin";
