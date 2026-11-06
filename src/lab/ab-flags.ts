export interface AbFlag {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  readonly enabledWhenSet: boolean;
}

// Only the comparison value is written; the opposite state uses the existing default.
export const AB_FLAGS: readonly AbFlag[] = [
  { key: "deathfx", label: "Painted foe deaths", value: "old", enabledWhenSet: false },
  { key: "foeaura", label: "Foe auras", value: "0", enabledWhenSet: false },
  { key: "presence", label: "Hero presence", value: "0", enabledWhenSet: false },
  { key: "cutinmat", label: "Cut-in materials", value: "0", enabledWhenSet: false },
  { key: "ambient", label: "Ambient", value: "0", enabledWhenSet: false },
  { key: "chargefill", label: "Charge layer", value: "0", enabledWhenSet: false },
  { key: "video", label: "Video clips", value: "0", enabledWhenSet: false },
  { key: "sigil", label: "Painted sigils", value: "code", enabledWhenSet: false },
  { key: "readable", label: "Readability dimming", value: "1", enabledWhenSet: true },
];

export function abFlagEnabled(url: URL, flag: AbFlag): boolean {
  return (url.searchParams.get(flag.key) === flag.value) === flag.enabledWhenSet;
}

export function withAbFlag(url: URL, flag: AbFlag, enabled: boolean): URL {
  const next = new URL(url.href);
  if (enabled === flag.enabledWhenSet) next.searchParams.set(flag.key, flag.value);
  else next.searchParams.delete(flag.key);
  return next;
}
