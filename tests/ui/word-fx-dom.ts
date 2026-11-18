/** Minimal DOM port for presenter integration; no browser/perceptual claims. */
class TestStyle {
  private readonly properties = new Map<string, string>();
  fontSize = "";
  gridTemplateColumns = "";
  setProperty(name: string, value: string): void { this.properties.set(name, value); }
  getPropertyValue(name: string): string { return this.properties.get(name) ?? ""; }
}

export class TestNode {
  children: TestNode[] = [];
  parent: TestNode | null = null;
  style = new TestStyle();
  dataset: Record<string, string> = {};
  className = "";
  id = "";
  hidden = false;
  title = "";
  clientWidth = 1264;
  scrollWidth = 140;
  private text = "";
  private readonly attributes = new Map<string, string>();
  readonly classList = {
    toggle: (name: string, value: boolean): void => {
      const names = new Set(this.className.split(" ").filter(Boolean));
      if (value) names.add(name); else names.delete(name);
      this.className = [...names].join(" ");
    },
  };

  constructor(readonly ownerDocument: TestDocument, readonly tag: string) {}
  set textContent(value: string) { this.text = value; this.children = []; }
  get textContent(): string { return this.text + this.children.map(child => child.textContent).join(""); }
  append(...children: TestNode[]): void {
    for (const child of children) { child.remove(); child.parent = this; this.children.push(child); }
  }
  replaceChildren(...children: TestNode[]): void {
    for (const child of this.children) child.parent = null;
    this.children = [];
    this.text = "";
    this.append(...children);
  }
  remove(): void {
    if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this);
    this.parent = null;
  }
  setAttribute(name: string, value: string): void { this.attributes.set(name, value); }
  getAttribute(name: string): string | null { return this.attributes.get(name) ?? null; }
  getBoundingClientRect(): { width: number } { return { width: this.textContent.length * 16 }; }
  getContext(): null { return null; }
  find(test: (node: TestNode) => boolean): TestNode | undefined {
    if (test(this)) return this;
    for (const child of this.children) { const found = child.find(test); if (found) return found; }
    return undefined;
  }
  all(test: (node: TestNode) => boolean): TestNode[] {
    return [...(test(this) ? [this] : []), ...this.children.flatMap(child => child.all(test))];
  }
}

export class TestDocument {
  created = 0;
  systemReduced = false;
  readonly head = new TestNode(this, "head");
  readonly documentElement = new TestNode(this, "html");
  readonly defaultView = {
    innerWidth: 1280, innerHeight: 720,
    getComputedStyle: (node: TestNode) => ({ fontSize: node.style.fontSize || "30px", fontFamily: "sans-serif" }),
    matchMedia: () => ({ matches: false }),
  };
  constructor() { const owner = this; this.defaultView.matchMedia = () => ({ get matches() { return owner.systemReduced; } }); }
  createElement(tag: string): TestNode { this.created += 1; return new TestNode(this, tag); }
  createTextNode(text: string): TestNode { const node = this.createElement("#text"); node.textContent = text; return node; }
  getElementById(id: string): TestNode | null { return this.head.find(node => node.id === id) ?? null; }
}
