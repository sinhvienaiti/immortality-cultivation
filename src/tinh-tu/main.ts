/**
 * tinh-tu.html entry: the Tĩnh Tu trial (canon §16, M0A_PLAN §6.8): Khẩu
 * Quyết card, 60 s session, Nhập Môn and Tham Ngộ, end screen; keyboard only.
 * The ledger (typing/new-word-ledger.ts) through src/app/storage.ts; wall
 * clock (Date.now) only in this UI layer, never in src/tinh-tu/sim.
 * Flags: ?wpm=, ?tier=tham-ngo, ?seed=, ?motion=full|reduce, ?debug=1 (window.__tt).
 * Owner: Lane 8.
 */
import "@fontsource/be-vietnam-pro/400.css";
import "@fontsource/be-vietnam-pro/700.css";
import "@fontsource/noto-sans/400.css";
import { startTinhTu } from "./ui/page";

startTinhTu(document);
