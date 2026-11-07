import assert from "node:assert/strict";
import { test } from "vitest";
import * as THREE from "three";
import { ScreenFx, type ScreenFxHost } from "../../src/view/screen-fx";

type Impact = {
  uniforms: Record<string, { value: unknown }>;
  render(renderer: THREE.WebGLRenderer, write: THREE.WebGLRenderTarget, read: THREE.WebGLRenderTarget): void;
};

function setup(drawMask: boolean, failDraw = false) {
  const passes: unknown[] = [];
  const composer = {
    passes,
    insertPass: (pass: unknown, index: number) => { passes.splice(index, 0, pass); },
    removePass: (pass: unknown) => { passes.splice(passes.indexOf(pass), 1); },
  } as unknown as ScreenFxHost["composer"];
  const original = new THREE.WebGLRenderTarget(8, 8);
  let target: THREE.WebGLRenderTarget | null = original;
  let mask: THREE.WebGLRenderTarget | null = null;
  let draws = 0;
  let scratch: THREE.WebGLRenderTarget | null = null;
  let scratchDisposed = false;
  const compiled: (THREE.WebGLRenderTarget | null)[] = [];
  const renderer = {
    getRenderTarget: () => target,
    setRenderTarget: (next: THREE.WebGLRenderTarget | null) => { target = next; },
    initTexture: () => undefined,
    compile: () => { compiled.push(target); },
    render: (object: THREE.Object3D) => {
      draws += 1;
      object.traverse((child) => {
        const material = (child as THREE.Mesh).material;
        if (!(material instanceof THREE.ShaderMaterial)) return;
        for (const { value } of Object.values(material.uniforms)) {
          if (value instanceof THREE.Texture) {
            assert.notEqual(value, target?.texture, "GL_INVALID_OPERATION: framebuffer feedback loop");
          }
        }
      });
      scratch = target;
      assert.ok(scratch, "prewarm must not draw onto the display");
      scratch.addEventListener("dispose", () => { scratchDisposed = true; });
      if (failDraw) throw new Error("draw failed");
    },
  } as unknown as THREE.WebGLRenderer;
  const fx = new ScreenFx({ composer, composerOn: () => true, addOverlay: () => () => undefined,
    ...(drawMask ? { drawActorMask: (r: THREE.WebGLRenderer, to: THREE.WebGLRenderTarget) => {
      mask = to;
      r.setRenderTarget(to);
    } } : {}),
  });
  const impact = passes.find((p) => "uniforms" in (p as object) && "tMask" in (p as Impact).uniforms) as Impact;
  const saved = Object.fromEntries(Object.entries(impact.uniforms).map(([key, uniform]) => [key, uniform.value]));
  return { fx, renderer, impact, original, saved, compiled,
    state: () => ({ target, mask, draws, scratch, scratchDisposed }) };
}

for (const drawMask of [true, false]) {
  test(`prewarm samples a separate target and restores samplers (actor mask: ${drawMask})`, () => {
    const h = setup(drawMask);
    try {
      h.fx.prewarm(h.renderer);
      const s = h.state();
      assert.equal(s.draws, 1);
      assert.deepEqual(h.compiled, [null]);
      assert.equal(s.target, h.original);
      assert.notEqual(s.scratch, s.mask);
      assert.equal(s.scratchDisposed, true);
      for (const [key, value] of Object.entries(h.saved)) assert.equal(h.impact.uniforms[key]!.value, value);
      // The live pass still reads the mask and writes the composer's other buffer.
      const write = new THREE.WebGLRenderTarget(8, 8);
      try { h.impact.render(h.renderer, write, h.original); }
      finally { write.dispose(); }
      assert.equal(h.impact.uniforms.tDiffuse!.value, h.original.texture);
    } finally { h.fx.dispose(); h.original.dispose(); }
  });
}

test("prewarm restores state and releases its target after a draw failure", () => {
  const h = setup(true, true);
  try {
    assert.throws(() => h.fx.prewarm(h.renderer), /draw failed/);
    assert.equal(h.state().target, h.original);
    assert.equal(h.state().scratchDisposed, true);
    for (const [key, value] of Object.entries(h.saved)) assert.equal(h.impact.uniforms[key]!.value, value);
  } finally { h.fx.dispose(); h.original.dispose(); }
});
