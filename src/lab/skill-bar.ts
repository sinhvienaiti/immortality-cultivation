export type IconStyle = "ink-gold" | "jewel-crest";

export const KEY_ICONS: Readonly<Record<"0" | "1" | "2" | "3" | "4" | "5" | "6" | "7", string | null>> = {
  "0": "flying-sword",
  "1": "sword-qi-strike",
  "2": null,
  "3": "returning-sword-guard",
  "4": "flowing-light-step",
  "5": "falling-sword-array",
  "6": "milky-way-sword-rain",
  // Lab: Vạn Kiếm Triều Tông; production icon: Vạn Phong Thính Chiếu. The owner will settle the name.
  "7": "myriad-edges-hear-the-edict",
};

export function iconSrc(style: IconStyle, id: string, base = "/art-src/lab/ui/skill-icons/"): string {
  const take = id === "flowing-light-step" || id === "asura-six-arms-avatar" ? "try2" : "try1";
  return `${base}${style}-${id}.v1-${take}-48.png`;
}

export function keyIcon(key: string, key2Twin: boolean): string | null {
  if (key === "2" && key2Twin) return "twin-dragons";
  return (KEY_ICONS as Readonly<Record<string, string | null>>)[key] ?? null;
}

export type SkillBarState = {
  style: IconStyle;
  slots: { key: string; id: string | null; src: string | null; missing: boolean }[];
};

type Slot = SkillBarState["slots"][number] & {
  el: HTMLDivElement;
  img: HTMLImageElement | null;
  note: HTMLSpanElement;
};

const TRANSITION = "transform 350ms ease-out,border-color 350ms ease-out,box-shadow 350ms ease-out";

/** The lab's real-size icon preview; empty and failed images have text only. */
export class SkillBar {
  private readonly el: HTMLDivElement;
  private readonly slots = new Map<string, Slot>();
  private style: IconStyle;
  private avoided: HTMLElement | null = null;

  constructor(parent: HTMLElement, opts: { style: IconStyle }) {
    this.style = opts.style;
    this.el = document.createElement("div");
    this.el.dataset.labSkillBar = "1";
    this.el.setAttribute("aria-label", "Lab skill icons");
    this.el.style.cssText = "position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:8;display:flex;gap:6px;padding:6px;"
      + "box-sizing:border-box;width:max-content;background:rgba(14,18,26,.78);border:1px solid #3a4558;border-radius:8px;font:11px system-ui;color:#e6e9ef";
    for (let n = 0; n < 10; n += 1) {
      const key = String(n);
      const el = document.createElement("div");
      el.dataset.skillKey = key;
      el.style.cssText = "position:relative;display:flex;align-items:center;justify-content:center;box-sizing:border-box;"
        + `width:56px;height:56px;flex:0 0 56px;border:1px solid #3a4558;border-radius:6px;transform:scale(1);transition:${TRANSITION}`;
      const note = document.createElement("span");
      note.textContent = "no icon";
      note.style.cssText = "font-size:9px;color:#8a94a6";
      const label = document.createElement("span");
      label.textContent = key;
      label.style.cssText = "position:absolute;right:3px;bottom:1px;font-size:11px;color:#e6e9ef;text-shadow:0 1px 3px #000;pointer-events:none";
      el.append(note, label);
      this.el.append(el);
      this.slots.set(key, { key, id: null, src: null, missing: true, el, img: null, note });
    }
    parent.append(this.el);
    window.addEventListener("resize", () => {
      if (this.avoided !== null) this.avoid(this.avoided);
    });
  }

  setSlot(key: string, id: string | null, name: string): void {
    const slot = this.slots.get(key);
    if (slot === undefined) return;
    slot.id = id;
    slot.el.title = name;
    this.load(slot);
  }

  setStyle(style: IconStyle): void {
    this.style = style;
    for (const slot of this.slots.values()) this.load(slot);
  }

  private load(slot: Slot): void {
    slot.img?.remove();
    slot.img = null;
    slot.src = slot.id === null ? null : iconSrc(this.style, slot.id);
    slot.missing = slot.src === null;
    slot.note.style.display = slot.missing ? "" : "none";
    if (slot.src === null) return;
    const img = document.createElement("img");
    img.alt = "";
    img.draggable = false;
    img.width = 48;
    img.height = 48;
    img.style.cssText = "display:block;width:48px;height:48px;flex:none;object-fit:contain;image-rendering:auto";
    slot.img = img;
    img.onerror = () => {
      // An old style's request can finish after a newer image has replaced it.
      if (slot.img !== img) return;
      slot.missing = true;
      img.style.display = "none";
      slot.note.style.display = "";
    };
    slot.el.prepend(img);
    img.src = slot.src;
  }

  flash(key: string): void {
    const slot = this.slots.get(key);
    if (slot === undefined) return;
    slot.el.style.transition = "none";
    slot.el.style.borderColor = "#7FF5E0";
    slot.el.style.boxShadow = "0 0 10px #7FF5E0";
    slot.el.style.transform = "scale(1.08)";
    // Commit the bright state, then let CSS return it to rest over 350 ms (also on repeated casts).
    void slot.el.offsetWidth;
    slot.el.style.transition = TRANSITION;
    slot.el.style.borderColor = "#3a4558";
    slot.el.style.boxShadow = "none";
    slot.el.style.transform = "scale(1)";
  }

  avoid(el: HTMLElement): void {
    this.avoided = el;
    this.el.style.left = "50%";
    this.el.style.transform = "translateX(-50%)";
    const b = this.el.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (b.left < r.right && b.right > r.left && b.top < r.bottom && b.bottom > r.top) {
      this.el.style.left = `${Math.max(12, Math.min(r.right + 12, window.innerWidth - b.width - 12))}px`;
      this.el.style.transform = "none";
    }
  }

  state(): SkillBarState {
    return {
      style: this.style,
      slots: [...this.slots.values()].map(({ key, id, src, missing }) => ({ key, id, src, missing })),
    };
  }
}
