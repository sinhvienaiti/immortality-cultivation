import { WORD_FX } from "../word-fx";

// Existing painted, straight-alpha ingredient from the game's ice kit; no new media.
export const WORD_GLINT_URL = new URL("../../../art-src/lab/vfx/ice-ult/glint.png", import.meta.url).href;
export const WORD_GLINT_COLOR = "rgb(229, 229, 206)";

export const WORD_FX_CSS = `
.ic-bq { overflow: hidden; }
.ic-bq__cell:not(.ic-bq__item) { overflow: visible; isolation: isolate; }
.ic-word-flight { position: fixed; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 46; }
.ic-quyet.is-hushed .ic-word-flight { visibility: hidden; }
.ic-bq__word { position: relative; }
.ic-bq__letter { display: inline-block; position: relative; transform-origin: 50% 65%; }
.ic-bq__letter.is-done { color: #E5C77B; }
.ic-bq__letter.is-lead { color: #E5D9BC; }
.ic-bq__letter.is-next { text-decoration: underline; text-decoration-color: #E5D399; text-decoration-thickness: 2px; text-underline-offset: 4px; }
.ic-bq__letter::after {
  content: attr(data-letter); position: absolute; inset: 0; pointer-events: none;
  color: #E5D399; text-shadow: 0 0 7px rgba(229, 211, 153, .8);
  opacity: max(var(--word-flash, 0), var(--word-key-glow, 0));
}
.ic-bq__cell::after {
  content: ''; position: absolute; inset: 0; pointer-events: none; border: 1.5px solid #E55757;
  border-radius: inherit; box-shadow: inset 0 0 6px rgba(229, 87, 87, .45); opacity: var(--word-error, 0);
}
.ic-bq__mote {
  position: absolute; left: calc(50% - ${WORD_FX.motePx / 2}px); top: calc(50% - ${WORD_FX.motePx / 2}px); width: ${WORD_FX.motePx}px; height: ${WORD_FX.motePx}px;
  pointer-events: none; opacity: 0; background: ${WORD_GLINT_COLOR};
  mask: url("${WORD_GLINT_URL}") center / contain no-repeat;
}
.ic-bq__cell.is-preview .ic-bq__letter.is-next { text-decoration: none; }
`;
