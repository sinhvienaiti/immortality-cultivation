/**
 * Paper-slip marks (canon §16: rim and icon, never colour alone; no Chinese
 * characters on round orbs): simple inline SVG shapes for the grey box.
 * Owner: Lane 8.
 */

const svg = (body: string): string =>
  '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + body + "</svg>";

const rays = [0, 45, 90, 135, 180, 225, 270, 315]
  .map((deg) => '<line x1="12" y1="2.5" x2="12" y2="5.5" transform="rotate(' + deg + ' 12 12)"/>')
  .join("");

export const ICONS = {
  /** Minh: the sun. */
  sun: svg('<circle cx="12" cy="12" r="4.2" fill="currentColor"/>' + rays),
  /** Thường of another group: an ink drop. */
  drop: svg('<path d="M12 3 C12 3 5.5 10.5 5.5 14.5 A6.5 6.5 0 0 0 18.5 14.5 C18.5 10.5 12 3 12 3 Z" fill="currentColor"/>'),
  /** Tâm ma: a cracked eye. */
  crackedEye: svg('<path d="M2 12 C5 6.5 19 6.5 22 12 C19 17.5 5 17.5 2 12 Z"/><circle cx="12" cy="12" r="2.6" fill="currentColor"/><path d="M13 3 L10.5 8.5 L13.5 11 L11 21"/>'),
} as const;
