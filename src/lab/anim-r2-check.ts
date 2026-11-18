/** Ticket 403: focused typecheck, real-human FK/IK/phalange probe.
 * Run from this worktree: node --import tsx src/lab/anim-r2-check.ts
 * Does not run a game build or suite. No browser/GPU/audio-onset claim.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import ts from "typescript";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Animator } from "./anim/animator";
import { resampleClip } from "./anim/resample";
import { AnimR1 } from "./anim-r1-controller";
import { FAMILIES, FAMILY_WORD, SEAL_NAMES } from "./anim-r2-poses";
import { FingerProbe } from "./anim-r2-hands";
import { FrontHandsView } from "./anim-r2-camera";

const files = ["anim-r1-poses.ts", "anim-r1-controller.ts", "anim-r1-lab.ts", "anim-r2-poses.ts", "anim-r2-hands.ts", "anim-r2-camera.ts", "anim-r2-check.ts", "anim-r2-review.ts", "skills-main.ts"]
  .map(f => fileURLToPath(new URL(f, import.meta.url)));
const options: ts.CompilerOptions = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler, strict: true, noUncheckedIndexedAccess: true,
  skipLibCheck: true, noEmit: true, types: ["vite/client", "node"] };
const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram(files, options));
assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, {
  getCanonicalFileName: x => x, getCurrentDirectory: () => process.cwd(), getNewLine: () => "\n",
}));

const source = fileURLToPath(new URL("../../art-src/lab/anim/human-base-animations.glb", import.meta.url));
async function setup(hz: number) {
  const data = readFileSync(source);
  // The live human profile also uses a plain material. No image decoder/GPU is part of this FK/IK probe.
  const loader = new GLTFLoader().register(() => ({ name: "R1_CPU_PLAIN_MATERIAL",
    loadMaterial: async () => new THREE.MeshStandardMaterial() }));
  const gltf = await loader.parseAsync(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), "");
  const root = new THREE.Group(), model = new THREE.Group();
  model.add(gltf.scene); gltf.scene.rotation.y = Math.PI;
  root.add(model); root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model), height = box.max.y - box.min.y;
  model.scale.setScalar(1.65 / height); model.position.y = -box.min.y * model.scale.x;
  root.updateMatrixWorld(true);
  const idle = gltf.animations.find(c => c.name === "Idle_A")!;
  const attack = gltf.animations.find(c => c.name === "Sword_Regular_A")!;
  const hit = gltf.animations.find(c => c.name === "Hit_Chest")!;
  const anim = new Animator(model, root, [
    { key: "idle", clip: resampleClip(idle, true), loop: true },
    { key: "attack", clip: resampleClip(attack, false), loop: false, release: 0.3 },
    { key: "hit", clip: resampleClip(hit, false), loop: false },
  ]);
  anim.place(0, 3, 0, -1);
  let now = 0, releases = 0, stops = 0, available = true;
  const cpu: number[] = [];
  const r1 = new AnimR1(anim, { now: () => now, available: () => available, cutStop: () => { stops++; },
    release: () => { releases++; }, charge: () => {}, prop: () => {}, note: () => {} });
  const allFrameFingers = new FingerProbe(anim);
  const feet = ["foot_l", "foot_r"].map(n => anim.rig.bone(n)!);
  const balls = ["ball_l", "ball_r"].map(n => anim.rig.bone(n)!);
  const prevFeet = feet.map(b => b.getWorldPosition(new THREE.Vector3()));
  const prevBalls = balls.map(b => b.getWorldPosition(new THREE.Vector3()));
  const lastLocked = [false, false];
  const prevQ = anim.rig.bones.map(b => b.quaternion.clone());
  const pos = new THREE.Vector3(), q = new THREE.Quaternion();
  let lockedSpeed = 0, lockedSamples = 0, bindFrames = 0, maxAngle = 0, frames = 0, minBallY = Infinity;
  let worstFoot: object | null = null, worstAngle: object | null = null;
  const frame = (measure = true): void => {
    now += 1000 / hz;
    const start = performance.now();
    anim.update(1 / hz); r1.afterBody(); root.updateMatrixWorld(true); r1.afterDraw();
    allFrameFingers.sample();
    assert.ok(anim.rig.bones.every(b => Number.isFinite(b.position.lengthSq()) && Math.abs(b.quaternion.length() - 1) < 0.001));
    cpu.push(performance.now() - start); frames++;
    if (!measure) {
      anim.rig.bones.forEach((b, i) => prevQ[i]!.copy(b.quaternion));
      feet.forEach((b, i) => { b.getWorldPosition(prevFeet[i]!); balls[i]!.getWorldPosition(prevBalls[i]!); lastLocked[i] = anim.feet?.lockedNow[i] ?? false; });
      return;
    }
    const armIndices = [anim.rig.find("upperarm_l"), anim.rig.find("upperarm_r")];
    if (armIndices.every(i => anim.rig.bones[i]!.quaternion.angleTo(q.fromArray(anim.rig.restQ, i * 4)) < 0.12)) bindFrames++;
    for (let i = 0; i < feet.length; i++) {
      const locked = anim.feet?.lockedNow[i] ?? false;
      feet[i]!.getWorldPosition(pos);
      const ankleSpeed = Math.hypot(pos.x - prevFeet[i]!.x, pos.z - prevFeet[i]!.z) * hz;
      prevFeet[i]!.copy(pos);
      balls[i]!.getWorldPosition(pos);
      const ballSpeed = Math.hypot(pos.x - prevBalls[i]!.x, pos.z - prevBalls[i]!.z) * hz;
      if (locked && lastLocked[i] && !anim.feet?.stepping[i]) {
        // A heel/ball pivot may move the ankle while the toe stays planted (or vice versa).
        const speed = Math.min(ankleSpeed, ballSpeed);
        if (speed > lockedSpeed) {
          lockedSpeed = speed;
          worstFoot = { frame: frames, side: i, stage: anim.keyPoses.stage, phase: anim.keyPoses.phase,
            family: r1.family, seal: r1.seals.id, typed: r1.typed, word: r1.word, ball: pos.toArray(), root: root.position.toArray(), state: anim.state };
        }
        lockedSamples++;
      }
      prevBalls[i]!.copy(pos); lastLocked[i] = locked;
      minBallY = Math.min(minBallY, pos.y);
    }
    for (let i = 0; i < prevQ.length; i++) {
      if (anim.rig.names[i]!.startsWith("upperarm") || anim.rig.names[i]!.startsWith("hand_")) {
        const angle = anim.rig.bones[i]!.quaternion.angleTo(prevQ[i]!) * 180 / Math.PI;
        if (angle > maxAngle) { maxAngle = angle; worstAngle = { frame: frames, bone: anim.rig.names[i], family: r1.family, seal: r1.seals.id, stage: anim.keyPoses.stage, phase: anim.keyPoses.phase }; }
      }
      prevQ[i]!.copy(anim.rig.bones[i]!.quaternion);
    }
  };
  const advance = (seconds: number, measure = true) => { for (let i = 0; i < Math.ceil(seconds * hz); i++) frame(measure); };
  advance(1, false);
  return { anim, r1, root, model, frame, advance, sourceClips: gltf.animations, now: () => now,
    available: (on: boolean) => { available = on; },
    stats: () => ({ hz, frames, releases, stops, lockedSamples, lockedSpeedMps: lockedSpeed,
      bindFrames, maxHandOrArmStepDeg: maxAngle, minBallY, worstFoot, worstAngle,
      inputToBodyP95Ms: percentile(r1.releases.map(r => r.bodyMs - r.keyMs), 0.95), inputToBodyMaxMs: Math.max(...r1.releases.map(r => r.bodyMs - r.keyMs)),
      inputToMotionMaxMs: Math.max(...r1.releases.map(r => r.motionMs === null ? Infinity : r.motionMs - r.keyMs)),
      fingers: allFrameFingers.report(),
      minPhalangeM: allFrameFingers.minM, phalangeViolations: allFrameFingers.violations,
      cpuP95Ms: percentile(cpu.slice(hz), 0.95) }) };
}
function percentile(a: number[], p: number): number {
  return [...a].sort((a, b) => a - b)[Math.ceil(a.length * p) - 1] ?? 0;
}

const results: object[] = [];
for (const hz of [60, 120]) {
  const s = await setup(hz);
  const seals: object[] = [], families: object[] = [];
  const allFingers = new FingerProbe(s.anim);
  for (let id = 0; id < 10; id++) {
    s.r1.inspect(id);
    for (let f = 0; f < hz; f++) { s.frame(); allFingers.sample(); }
    assert.ok(s.r1.seals.settled);
    const still = new FingerProbe(s.anim); still.sample();
    assert.ok(still.minM >= .004, `S${id}: minimum phalange gap ${still.minM}`);
    // Projection/restoration only; actual occlusion and skin still require browser captures.
    const camera = new THREE.PerspectiveCamera(28, 16 / 9, .05, 100);
    camera.position.set(4, 8, 12); camera.lookAt(0, 1, 3); camera.updateMatrixWorld(true);
    const oldP = camera.position.clone(), oldQ = camera.quaternion.clone(), fx = new THREE.Group();
    const front = new FrontHandsView(camera, s.root, fx); front.enabled = true; front.beforeDraw();
    for (const side of ["l", "r"]) for (const finger of ["index", "middle", "ring", "pinky", "thumb"]) {
      const p = s.anim.rig.bone(`${finger}_04_leaf_${side}`)!.getWorldPosition(new THREE.Vector3()).project(camera);
      assert.ok(Math.abs(p.x) < .98 && Math.abs(p.y) < .98 && Math.abs(p.z) < 1, `S${id}: fingertip outside front camera`);
    }
    assert.equal(fx.visible, false); front.afterDraw();
    assert.ok(camera.position.distanceTo(oldP) < 1e-8 && camera.quaternion.angleTo(oldQ) < 1e-7);
    assert.equal(fx.visible, true); fx.visible = false; front.beforeDraw(); front.reset(); assert.equal(fx.visible, false);
    seals.push({ id, name: SEAL_NAMES[id], ...still.report() });
  }
  for (let a = 0; a < 10; a++) for (let b = 0; b < 10; b++) if (a !== b) {
    s.r1.inspect(a); s.advance(.72); s.r1.inspect(b);
    for (let f = 0; f < Math.ceil(.72 * hz); f++) { s.frame(); allFingers.sample(); }
    s.r1.inspect(a); s.advance(.07); s.r1.inspect(b); s.advance(.09);
  }
  for (const family of FAMILIES) {
    s.r1.select(family); s.advance(.4);
    const fp = new FingerProbe(s.anim), start = s.r1.releases.length;
    for (const wpm of [15, 45, 90]) for (const word of ["art", FAMILY_WORD[family], "cultivar"]) {
      s.r1.begin(word);
      for (const ch of word) {
        s.r1.text(ch, s.now() + .01);
        for (let f = 0; f < Math.ceil(60 / (wpm * 5) * hz); f++) { s.frame(); fp.sample(); }
      }
      for (let f = 0; f < hz; f++) { s.frame(); fp.sample(); }
    }
    s.r1.begin("art"); for (const ch of "art") s.r1.text(ch, s.now() + .01); s.frame(); fp.sample(); s.advance(1);
    const rs = s.r1.releases.slice(start);
    assert.equal(rs.length, 10);
    assert.ok(rs.every(r => r.family === family && r.poseApplied && r.motionMs !== null));
    assert.ok(rs.every(r => r.fxFrame === r.bodyFrame && r.drawFrame === r.bodyFrame));
    const bodyMs = Math.max(...rs.map(r => r.bodyMs - r.keyMs));
    const motionMs = Math.max(...rs.map(r => r.motionMs === null ? Infinity : r.motionMs - r.keyMs));
    assert.ok(bodyMs <= 50 && motionMs <= 50);
    assert.ok(fp.minM >= .004);
    families.push({ family, releases: rs.length, keyToBodyMaxMs: bodyMs, keyToMotionMaxMs: motionMs, syncFrames: 0, fingers: fp.report() });
  }
  for (const delay of [.025, .1, .28, .55]) for (const family of FAMILIES) {
    s.r1.select(family); for (const ch of FAMILY_WORD[family]) { s.r1.text(ch); s.frame(); }
    s.advance(delay);
  }
  s.r1.select("palm"); s.r1.text("p"); s.advance(.3); s.r1.text("a"); s.advance(.2);
  const phase = s.anim.keyPoses.phase, count = s.r1.releases.length;
  s.r1.text("x"); s.r1.text("Backspace"); s.advance(.4);
  assert.ok(s.anim.keyPoses.phase < phase); s.r1.text("Escape"); s.advance(.5);
  assert.equal(s.r1.releases.length, count);
  for (const family of FAMILIES) {
    s.r1.select(family);
    const previous = s.r1.releases.length;
    for (const ch of FAMILY_WORD[family]) s.r1.text(ch);
    s.anim.update(0); s.r1.afterBody(false); s.root.updateMatrixWorld(true);
    assert.equal(s.r1.releases.length, previous, "Paused frames cannot flush a release");
    s.frame(); assert.equal(s.r1.releases.length, previous + 1); s.advance(1.1);
  }
  s.r1.select("sword"); s.r1.text("s"); s.advance(.3); s.r1.retarget(0, 9); s.advance(.8); s.r1.cancel(); s.advance(.5);
  s.r1.inspect(7); s.advance(.3); s.r1.stop(); s.advance(.6);
  assert.equal(s.anim.keyPoses.active, false);
  s.available(false); s.r1.begin(); assert.equal(s.r1.active, false); s.available(true);
  assert.deepEqual(s.r1.pulseKinds.slice(0, 6), [0, 1, 2, 0, 1, 2]);
  const stats = s.stats();
  assert.equal(stats.bindFrames, 0);
  assert.ok(stats.lockedSpeedMps <= .05, `Planted foot speed ${stats.lockedSpeedMps}; ${JSON.stringify(stats.worstFoot)}`);
  assert.ok(stats.minBallY >= -.033);
  assert.ok(stats.maxHandOrArmStepDeg <= 1800 / hz + .001);
  assert.ok(s.r1.releases.every(r => r.poseApplied && r.motionDeltaRad > .0001 && r.fxFrame === r.bodyFrame && r.bodyFrame === r.drawFrame));
  assert.equal(stats.releases, s.r1.releases.length);
  assert.ok(stats.inputToBodyMaxMs <= 50 && stats.inputToMotionMaxMs <= 50);
  assert.ok(stats.minPhalangeM >= .004 && stats.phalangeViolations === 0, JSON.stringify(stats.fingers));
  assert.ok(allFingers.minM >= .004 && s.r1.fingers.minM >= .004, JSON.stringify(s.r1.fingers.report()));
  results.push({ ...stats, seals, sealTransitions: allFingers.report(), families, allActiveFingers: s.r1.fingers.report() });
}
console.log(JSON.stringify({ typeDiagnostics: diagnostics.length, results,
  limits: "Fixed-step CPU on real rig, not OS/browser/present latency or skin-surface intersection; no visual acceptance" }, null, 2));
