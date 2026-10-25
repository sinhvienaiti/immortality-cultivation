// Entry point of index.html: the game (src/app/app.ts startApp, M0A_PLAN §6.9).
// The HN0 bench and the Tĩnh Tu trial have their own pages (bench.html, tinh-tu.html).
// Owner: step 0 / integration (LANES.md).
import { startApp } from "./app/app";

const app = startApp(document);
if (import.meta.hot) import.meta.hot.dispose(() => app.dispose());
