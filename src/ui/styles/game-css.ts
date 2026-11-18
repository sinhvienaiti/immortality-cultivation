/**
 * The game stylesheet (canon §21.1, §24): HUD, wave card, shop strip and shop
 * mode, Thu Hoạch, pause menu, notices and Linh Sa motes. Be Vietnam Pro
 * (kit --kit-font-battle), Noto Sans for IPA (--kit-font-ipa), sizes × --ui
 * (kit uiScale) and × --ic-text-scale (settings 100 / 125 / 150 %). DOM parts
 * never shake and take no canvas effect; with reduced motion
 * (html[data-motion="reduce"]) nothing animates. Installed by ui/skin.ts.
 * Owner: Lane 6.
 */
import { ZONE_PX } from "../screen-zones";
import { PALETTE, SEMANTIC } from "./palette";

const p = PALETTE;
const u = (px: number): string => "calc(" + px + "px * var(--ui, 1))";
const t = (px: number): string => "calc(" + px + "px * var(--ui, 1) * var(--ic-text-scale, 1))";

export const IC_STYLE_ID = "ic-skin-style";

export const IC_CSS = `
/* The Bàn Quyết band's height (screen-zones.ts quyetBand): panels sit above it. */
.ic-skin { --ic-quyet-h: calc((${ZONE_PX.quyet}px + ${ZONE_PX.quyetPerScale}px * (var(--ic-text-scale, 1) - 1)) * var(--ui, 1)); }
/* hidden always hides, whatever display a part's class sets. */
.ic-skin [hidden] { display: none !important; }
.ic-skin body { margin: 0; background: #0b0f16; overflow: hidden; }
.ic-app { position: fixed; inset: 0; overflow: hidden; font-family: var(--kit-font-battle); color: ${p.text}; }
.ic-canvas { position: absolute; inset: 0; }
.ic-overlay { position: absolute; inset: 0; pointer-events: none; z-index: 20; }
.ic-panel {
  background: ${p.panel}; border: 1.5px solid ${p.panelEdge}; border-radius: ${u(12)}; color: ${p.text};
  font-family: var(--kit-font-battle); box-sizing: border-box; transform: none; filter: none;
}
.ic-btn {
  font: inherit; color: inherit; background: rgba(242, 235, 221, 0.06); border: 1.5px solid ${p.panelEdge};
  border-radius: ${u(8)}; padding: ${u(4)} ${u(10)}; cursor: pointer; pointer-events: auto;
}
.ic-btn:hover { border-color: rgba(242, 235, 221, 0.5); }
.ic-btn:disabled { opacity: 0.45; cursor: default; }
.ic-btn.is-on { border-color: ${p.text}; background: rgba(242, 235, 221, 0.16); }
.ic-key { display: inline-block; min-width: 1.2em; text-align: center; font-weight: 800; font-size: max(11px, ${u(12)}); border: 1px solid rgba(242, 235, 221, 0.55); border-radius: 3px; padding: 0 4px; margin: 0 2px; }
.ic-icon { width: 1.25em; height: 1.25em; vertical-align: -0.22em; flex: none; }
.ic-muted { color: ${p.muted}; }

/* ── HUD (canon §6.6): Sinh lực + khiên, Chân Nguyên, Trận Lực, Thế; Linh Sa; notices ── */
.ic-hud { position: absolute; inset: 0; pointer-events: none; z-index: 30; }
/* A thin edge HUD. The renderer reserves this top band for gates and warnings. */
.ic-hud__left { position: absolute; left: 8px; top: 4px; display: flex; align-items: center; gap: 4px; }
.ic-hud__self { width: min(31vw, 420px); padding: 3px 6px; display: flex; align-items: center; gap: 8px; }
.ic-hud__row { flex: 1; min-width: 0; display: grid; grid-template-columns: auto minmax(28px, 1fr) auto; align-items: center; gap: 4px; font-size: 11px; }
.ic-hud__label { font-weight: 700; color: ${p.muted}; white-space: nowrap; }
.ic-hud__num { font-weight: 800; font-variant-numeric: tabular-nums; white-space: nowrap; }
.ic-bar { position: relative; height: 5px; border-radius: 3px; background: rgba(242,235,221,.12); overflow: hidden; }
.ic-bar__fill { position: absolute; inset: 0 auto 0 0; width: calc(var(--v, 0) * 100%); background: var(--c, ${p.text}); border-radius: inherit; }
.ic-bar__over { position: absolute; inset: 0 auto 0 0; width: calc(var(--s, 0) * 100%); background: ${p.shield}; }
.ic-hud__self.is-down { opacity: .6; }
.ic-hud__down { font-size: 11px; color: ${p.bad}; white-space: nowrap; }
.ic-hud__down:empty { display: none; }
.ic-hud__money { padding: 3px 5px; display: flex; gap: 4px; font-size: 11px; color: ${p.money}; }
.ic-hud__money .ic-coin { width: 0; height: 0; }
.ic-hud__top { position: absolute; inset: 0; }
.ic-hud__heart { position: absolute; top: ${ZONE_PX.heart.y}px; left: ${ZONE_PX.heart.x}px; width: ${ZONE_PX.heart.width}px; padding: 3px 6px; display: flex; align-items: center; gap: 6px; }
.ic-hud__heart .ic-bar { flex: 1; }
.ic-hud__heart.is-low { border-color: ${SEMANTIC.urgent}; }
.ic-hud__posture { position: absolute; top: 34px; left: 256px; width: 220px; padding: 2px 6px; display: grid; gap: 2px; }
.ic-hud__posture[hidden] { display: none; }
.ic-hud__posture.is-broken .ic-hud__label { color: ${p.postureBroken}; }
.ic-hud__posture.is-immune .ic-bar__fill { opacity: .45; }
.ic-hud__head { display: flex; justify-content: space-between; align-items: center; gap: 6px; font-size: 11px; }
.ic-hud__wave { position: absolute; right: 8px; top: 4px; padding: 3px 8px; font-size: 12px; font-weight: 800; }
.ic-notices { position: absolute; right: 8px; top: 34px; max-width: 260px; }
.ic-notice { padding: 2px 6px; font-size: 11px; line-height: 16px; text-align: right; }
.ic-notice.is-warn { border-color: ${SEMANTIC.urgent}; color: ${SEMANTIC.urgent}; }
.ic-notice.is-good { border-color: ${p.good}; color: ${p.good}; }
.ic-notice.is-soft { color: ${p.muted}; }

/* ── Wave card (canon §4.1, §13.3): per gate family icon and count; marks; peak strip ── */
.ic-wave { position: absolute; width: ${u(340)}; padding: ${u(10)} ${u(12)}; display: grid; gap: ${u(8)}; pointer-events: none; }
.ic-wave[hidden] { display: none; }
.ic-wave__head { display: flex; justify-content: space-between; align-items: baseline; gap: ${u(8)}; }
.ic-wave__title { font-size: ${t(18)}; font-weight: 800; }
.ic-wave__marks { display: flex; gap: ${u(6)}; color: ${p.muted}; }
.ic-wave__gates { display: grid; gap: ${u(6)}; }
.ic-wave__gate { display: grid; grid-template-columns: ${u(72)} 1fr; align-items: center; gap: ${u(6)}; font-size: ${t(13)}; }
.ic-wave__gate-name { font-weight: 800; color: ${p.muted}; white-space: nowrap; }
.ic-wave__foes { display: flex; flex-wrap: wrap; gap: ${u(4)} ${u(8)}; }
.ic-wave__foe { display: inline-flex; align-items: center; gap: ${u(3)}; white-space: nowrap; font-weight: 700; }
.ic-wave__foe .ic-icon { color: var(--fc, ${p.text}); }
.ic-wave__foe.is-elite { text-decoration: underline; text-underline-offset: 3px; }
.ic-strip { position: relative; height: ${u(10)}; border-radius: 3px; background: rgba(242, 235, 221, 0.1); overflow: hidden; }
.ic-strip__peak { position: absolute; top: 0; bottom: 0; background: rgba(242, 235, 221, 0.55); }
.ic-strip__beat { position: absolute; top: 3px; width: 3px; height: 4px; margin-left: -1px; background: ${p.text}; border-radius: 1px; }
.ic-wave__foot { font-size: ${t(13)}; color: ${p.muted}; display: flex; justify-content: space-between; gap: ${u(8)}; }

/* ── Shop strip (mouse) and shop mode (Backquote key), canon §5.1, §14.3, D45 ── */
.ic-shop { position: absolute; left: auto; right: 8px; top: 68px; bottom: calc(var(--ic-quyet-h) + 8px); width: ${ZONE_PX.drawer.viewWidth * 100}vw; max-width: ${ZONE_PX.drawer.maxWidth}px; min-width: ${ZONE_PX.drawer.minWidth}px; padding: 8px; display: grid; align-content: start; gap: 6px; overflow: auto; pointer-events: auto; z-index: 34; }
.ic-shop.is-placing { width: 190px; min-width: 190px; }
.ic-shop.is-placing .ic-shop__row:nth-child(2) { display: none; }
.ic-shop__head { flex-wrap: wrap; }
.ic-shop__row { display: grid !important; grid-template-columns: 1fr 1fr; }
.ic-shop__slot, .ic-shop__item { min-width: 0 !important; }
.ic-shop__slot b, .ic-shop__item b { overflow-wrap: anywhere; }

.ic-shop[hidden] { display: none; }
.ic-shop__head { display: flex; justify-content: space-between; align-items: center; gap: ${u(10)}; font-size: ${t(13)}; }
.ic-shop__title { font-weight: 800; font-size: ${t(15)}; }
.ic-shop__money { font-weight: 800; color: ${p.money}; }
.ic-shop__row { display: flex; flex-wrap: wrap; gap: ${u(6)}; }
.ic-shop__item, .ic-shop__slot { display: grid; justify-items: start; gap: 1px; min-width: ${u(104)}; text-align: left; font-size: ${t(12)}; }
.ic-shop__item b, .ic-shop__slot b { font-size: ${t(13)}; }
.ic-shop__price { color: ${p.money}; font-weight: 800; }
.ic-shop__item.is-poor .ic-shop__price { color: ${p.muted}; text-decoration: line-through; }
.ic-shop__slot.is-cursor, .ic-shop__item.is-cursor { border-color: ${p.text}; box-shadow: 0 0 0 2px rgba(242, 235, 221, 0.45); }
.ic-shop__slot.is-armed { border-style: dashed; }
.ic-shop__msg { font-size: ${t(13)}; color: ${p.muted}; min-height: 1.2em; }
.ic-shop__msg.is-confirm { color: ${SEMANTIC.urgent}; font-weight: 700; }
.ic-shop__keys { font-size: max(11px, ${u(12)}); color: ${p.muted}; }
.ic-shopmode { z-index: 35; }

/* ── Thu Hoạch (canon §17): learning and RPG lines apart; Sổ Từ ── */
.ic-results { position: absolute; left: 50%; top: calc((100vh - var(--ic-quyet-h)) / 2); translate: -50% -50%; width: min(${u(760)}, calc(100vw - 32px)); max-height: calc(100vh - var(--ic-quyet-h) - 32px); overflow: auto; padding: ${u(16)} ${u(20)}; display: grid; gap: ${u(12)}; pointer-events: auto; z-index: 55; }
.ic-results[hidden] { display: none; }
.ic-results__title { margin: 0; font-size: ${t(26)}; font-weight: 800; }
.ic-results__stars { font-size: ${t(22)}; letter-spacing: 0.1em; color: ${p.heart}; }
.ic-results__cols { display: grid; grid-template-columns: 1fr 1fr; gap: ${u(14)}; }
.ic-results__col { display: grid; align-content: start; gap: ${u(4)}; }
.ic-results__col h3 { margin: 0 0 ${u(4)}; font-size: ${t(14)}; letter-spacing: 0.04em; color: ${p.muted}; }
.ic-results__line { display: flex; justify-content: space-between; gap: ${u(10)}; font-size: ${t(15)}; border-bottom: 1px solid rgba(242, 235, 221, 0.08); padding: 2px 0; }
.ic-results__line b { font-variant-numeric: tabular-nums; }
.ic-results__foot { font-size: ${t(13)}; color: ${p.muted}; }

/* ── Pause menu (canon §4.1, §5.1, §24) ── */
.ic-menu-veil { position: absolute; inset: 0; background: rgba(8, 10, 14, 0.55); pointer-events: auto; z-index: 60; display: grid; place-items: center; }
.ic-menu-veil[hidden] { display: none; }
.ic-menu { width: min(${u(460)}, calc(100vw - 32px)); padding: ${u(14)} ${u(16)}; display: grid; gap: ${u(4)}; }
.ic-menu__title { margin: 0 0 ${u(6)}; font-size: ${t(22)}; font-weight: 800; }
.ic-menu__item { display: flex; justify-content: space-between; align-items: center; gap: ${u(10)}; width: 100%; padding: ${u(8)} ${u(12)}; font-size: ${t(16)}; text-align: left; }
.ic-menu__item.is-cursor { border-color: ${p.text}; background: rgba(242, 235, 221, 0.14); }
.ic-menu__value { color: ${p.muted}; font-weight: 700; white-space: nowrap; }
.ic-menu__hint { font-size: ${t(13)}; color: ${p.muted}; min-height: 1.2em; }
.ic-menu__hint.is-confirm { color: ${SEMANTIC.urgent}; font-weight: 700; }
.ic-menu__keys { display: grid; gap: ${u(2)}; max-height: ${u(300)}; overflow: auto; }

/* ── Linh Sa motes flying to the HUD (visual only, D34) ── */
.ic-motes { position: absolute; inset: 0; pointer-events: none; z-index: 31; }
.ic-mote { position: absolute; left: 0; top: 0; width: ${u(8)}; height: ${u(8)}; margin: ${u(-4)} 0 0 ${u(-4)}; border-radius: 50%; background: ${p.money}; box-shadow: 0 0 ${u(6)} rgba(255, 200, 58, 0.7); will-change: transform; }
.ic-mote[hidden] { display: none; }

/* ── Reduced motion (canon §24): nothing animates in the DOM ── */
html[data-motion="reduce"] .ic-app *, html[data-motion="reduce"] .ic-app *::before, html[data-motion="reduce"] .ic-app *::after { transition: none !important; animation: none !important; }
`;
