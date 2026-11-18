/** Ticket 397: focused typecheck, real-human FK/IK probe and reproducible clip export.
 * Run from this worktree: node --import tsx src/lab/anim-r1-check.ts
 * Does not run a game build or suite. No browser/GPU/audio-onset claim.
 */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import ts from "typescript";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Animator } from "./anim/animator";
import { resampleClip } from "./anim/resample";
import { ClipSampler } from "./anim/rig";
import { AnimR1 } from "./anim-r1-controller";
import { R1_RELEASE_FRAME, R1_SLOT } from "./anim-r1-poses";
import { FAN_SWEEP } from "./anim/fan-sweep-poses";

const files = ["anim-r1-poses.ts", "anim-r1-controller.ts", "anim-r1-lab.ts", "anim-r1-check.ts", "anim-r1-review.ts", "skills-main.ts"]
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
  const cpu: number[] = [], delays: number[] = [];
  const r1 = new AnimR1(anim, { now: () => now, available: () => available, cutStop: () => { stops++; },
    release: () => { releases++; }, charge: () => {}, prop: () => {}, note: () => {} });
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
            typed: r1.typed, word: r1.word, ball: pos.toArray(), root: root.position.toArray(), state: anim.state };
        }
        lockedSamples++;
      }
      prevBalls[i]!.copy(pos); lastLocked[i] = locked;
      minBallY = Math.min(minBallY, pos.y);
    }
    for (let i = 0; i < prevQ.length; i++) {
      if (anim.rig.names[i]!.startsWith("upperarm") || anim.rig.names[i]!.startsWith("hand_")) {
        const angle = anim.rig.bones[i]!.quaternion.angleTo(prevQ[i]!) * 180 / Math.PI;
        if (angle > maxAngle) { maxAngle = angle; worstAngle = { frame: frames, bone: anim.rig.names[i], stage: anim.keyPoses.stage, phase: anim.keyPoses.phase }; }
      }
      prevQ[i]!.copy(anim.rig.bones[i]!.quaternion);
    }
  };
  const advance = (seconds: number, measure = true) => { for (let i = 0; i < Math.ceil(seconds * hz); i++) frame(measure); };
  advance(1, false);
  const type = (word: string, interval: number): void => {
    r1.begin(word);
    for (const ch of word) {
      const stamp = now + 0.01; r1.text(ch, stamp); frame();
      if (r1.typed === word.length) delays.push(r1.releases.at(-1)!.bodyMs - stamp);
      advance(interval);
    }
    advance(0.9);
  };
  return { anim, r1, root, model, frame, advance, type, sourceClips: gltf.animations,
    available: (on: boolean) => { available = on; },
    stats: () => ({ hz, frames, releases, stops, lockedSamples, lockedSpeedMps: lockedSpeed,
      bindFrames, maxHandOrArmStepDeg: maxAngle, minBallY, worstFoot, worstAngle,
      inputToBodyP95Ms: percentile(delays, 0.95), inputToBodyMaxMs: Math.max(...delays),
      inputToMotionMaxMs: Math.max(...r1.releases.map(r => r.motionMs === null ? Infinity : r.motionMs - r.keyMs)),
      cpuP95Ms: percentile(cpu.slice(hz), 0.95) }) };
}
function percentile(a: number[], p: number): number {
  return [...a].sort((a, b) => a - b)[Math.ceil(a.length * p) - 1] ?? 0;
}

const results = [];
for (const hz of [60, 120]) {
  const s = await setup(hz);
  assert.equal(s.anim.rig.count, 66);
  for (const wpm of [15, 45, 90]) for (const word of ["art", "sword", "cultivar"]) s.type(word, 60 / (wpm * 5));
  s.r1.begin(); s.r1.text("s"); s.advance(0.2); s.r1.text("w"); s.advance(0.2);
  s.r1.text("o"); s.advance(0.3);
  const phase = s.anim.keyPoses.phase, releases = s.r1.releases.length;
  s.r1.text("x"); s.advance(0.2);
  assert.equal(s.r1.typed, 3); assert.equal(s.r1.mistakes, 1);
  s.r1.text("Backspace"); s.advance(0.4);
  assert.ok(s.anim.keyPoses.phase < phase, "Correction must lower the shown wind-up");
  s.r1.retarget(6, -3); s.advance(0.6); s.r1.text("Escape"); s.advance(0.5);
  assert.equal(s.r1.releases.length, releases, "Correction/error/target/cancel must never release");
  assert.equal(s.anim.keyPoses.active, false);
  // Burst inputs, interrupted recovery, 180-degree retarget, pause and hit: no deferred release queue.
  s.r1.begin("art"); for (const ch of "art") s.r1.text(ch); s.frame();
  s.r1.text("a"); s.frame();
  assert.equal(s.r1.typed, 1); assert.equal(s.anim.keyPoses.stage, "charge", "A new word must interrupt recovery directly");
  s.r1.cancel(); s.advance(0.15);
  s.r1.begin(); s.r1.text("s"); s.advance(0.3); s.r1.retarget(0, 9); s.advance(0.8);
  s.r1.cancel(); s.advance(0.5);
  const pose = s.anim.rig.bones.map(b => b.quaternion.clone());
  s.anim.update(0); s.root.updateMatrixWorld(true);
  assert.ok(s.anim.rig.bones.every((b, i) => b.quaternion.angleTo(pose[i]!) < 0.01), "Pause must not accumulate layers");
  assert.deepEqual(s.r1.pulseKinds.slice(0, 6), [0, 1, 2, 0, 1, 2]);
  assert.ok(s.r1.releases.every(r => r.bodyFrame === r.fxFrame && r.drawFrame === r.bodyFrame));
  assert.ok(s.r1.releases.every(r => r.poseApplied && r.motionMs !== null));
  const stats = s.stats();
  assert.equal(stats.releases, s.r1.releases.length, "Exactly one real host release callback per last key");
  assert.ok(stats.inputToBodyMaxMs <= 50);
  assert.ok(stats.inputToMotionMaxMs <= 50);
  assert.equal(stats.bindFrames, 0);
  assert.ok(stats.lockedSpeedMps <= 0.05, `Planted foot sliding: ${stats.lockedSpeedMps} m/s`);
  assert.ok(stats.minBallY >= -0.033, `Foot penetration: ${stats.minBallY}`);
  // Guard stale spacing state from the pre-existing fanSweep, and hold/cancel lifecycle.
  s.r1.stop(); s.advance(0.4);
  s.anim.keyPoses.add("r1-other", FAN_SWEEP);
  s.anim.release("r1-other", "attack", 0, -5, true); s.frame();
  s.r1.begin(); assert.equal(s.r1.active, false, "F2 waits for a different authored skill to settle");
  s.advance(1.2); s.r1.begin(); s.r1.text("s"); s.advance(0.15); s.r1.text("Escape"); s.advance(0.4);
  assert.equal(s.anim.keyPoses.active, false);
  s.available(false); s.r1.text("s"); assert.equal(s.r1.typed, 0);
  s.r1.stop(); s.r1.begin(); assert.equal(s.r1.active, false);
  s.available(true);
  // Compare the authored motion's largest arm/wrist step with the existing sword clip at this rate.
  const sourceClip = s.sourceClips.find(c => c.name === "Sword_Regular_A")!;
  const sampler = new ClipSampler(sourceClip, s.anim.rig);
  const rq = new Float32Array(s.anim.rig.count * 4), rp = new Float32Array(s.anim.rig.count * 3);
  const previous = s.anim.rig.bones.map(() => new THREE.Quaternion());
  const current = new THREE.Quaternion(); let referenceStep = 0;
  for (let f = 0; f <= Math.ceil(sourceClip.duration * hz); f++) {
    s.anim.rig.restPose(rq, rp); sampler.sample(Math.min(f / hz, sourceClip.duration), rq, rp);
    s.anim.rig.names.forEach((name, i) => {
      current.fromArray(rq, i * 4).normalize();
      if (f && (name.startsWith("upperarm") || name.startsWith("hand_"))) referenceStep = Math.max(referenceStep, current.angleTo(previous[i]!) * 180 / Math.PI);
      previous[i]!.copy(current);
    });
  }
  Object.assign(stats, { sourceSwordPeakStepDeg: referenceStep, stepRatioToSource: stats.maxHandOrArmStepDeg / referenceStep });
  assert.ok(stats.maxHandOrArmStepDeg <= 1.5 * referenceStep, "Transition step exceeds 1.5x the existing sword reference peak");
  results.push(stats);
}

// Bake exactly the same Animator/key-pose/IK path at 60 Hz into one complete local-space clip.
const baked = await setup(60);
const markers: Record<string, number> = {};
const times: number[] = [], rotations = baked.anim.rig.bones.map(() => [] as number[]), positions = baked.anim.rig.bones.map(() => [] as number[]);
baked.r1.begin();
const sample = (t: number) => {
  times.push(t);
  baked.anim.rig.bones.forEach((b, i) => { rotations[i]!.push(...b.quaternion.toArray()); positions[i]!.push(...b.position.toArray()); });
};
sample(0);
for (let f = 1; f <= 108; f++) {
  if ([1, 14, 27, 40, R1_RELEASE_FRAME].includes(f)) baked.r1.text("sword"[[1, 14, 27, 40, R1_RELEASE_FRAME].indexOf(f)]!);
  baked.frame(); sample(f / 60);
  if (baked.anim.keyPoses.stage === "charge" && baked.anim.keyPoses.phase >= 2.95 && markers.windup_end === undefined) markers.windup_end = f / 60;
  if (f === R1_RELEASE_FRAME) markers.release = f / 60;
  if (baked.anim.keyPoses.stage === "recover" && markers.recover === undefined) markers.recover = f / 60;
}
const tracks: THREE.KeyframeTrack[] = [];
baked.anim.rig.names.forEach((name, i) => {
  tracks.push(new THREE.QuaternionKeyframeTrack(name + ".quaternion", times, rotations[i]!));
  tracks.push(new THREE.VectorKeyframeTrack(name + ".position", times, positions[i]!));
});
const clip = new THREE.AnimationClip("Sword_A_R1", 1.8, tracks);
assert.ok(clip.validate());
assert.ok(THREE.AnimationClip.parse(THREE.AnimationClip.toJSON(clip)).validate());
// Verify every exported sample against the recorded pose through the same canonical-name sampler.
const roundtrip = new ClipSampler(THREE.AnimationClip.parse(THREE.AnimationClip.toJSON(clip)), baked.anim.rig);
const loadedQ = new Float32Array(baked.anim.rig.count * 4), loadedP = new Float32Array(baked.anim.rig.count * 3);
for (let f = 0; f < times.length; f++) {
  roundtrip.sample(times[f]!, loadedQ, loadedP);
  baked.anim.rig.bones.forEach((_b, i) => {
    const expected = new THREE.Quaternion().fromArray(rotations[i]!, f * 4).normalize();
    assert.ok(new THREE.Quaternion().fromArray(loadedQ, i * 4).normalize().angleTo(expected) < 0.001);
    for (let j = 0; j < 3; j++) assert.ok(Math.abs(loadedP[i * 3 + j]! - positions[i]![f * 3 + j]!) < 0.00001);
  });
}
const out = fileURLToPath(new URL("../../art-src/lab/anim/round1/", import.meta.url)); mkdirSync(out, { recursive: true });
const clipJson = { ...THREE.AnimationClip.toJSON(clip), extras: { family: "cast_sword", variant: "A", loop: false,
  events: Object.entries(markers).map(([name, timeS]) => ({ name, timeS })), externalEvents: ["hit"],
  mask: baked.anim.rig.names, provenance: "397: authored on existing human rig, no retarget" } };
writeFileSync(out + "sword-a.clip.json", JSON.stringify(clipJson) + "\n");
for (const [name, phase] of [["s0", 0], ["s1", 3]] as const) {
  baked.anim.keyPoses.freeze(R1_SLOT, phase); baked.advance(0.5);
  const poseTracks = baked.anim.rig.bones.flatMap(b => [
    new THREE.QuaternionKeyframeTrack(b.name + ".quaternion", [0], b.quaternion.toArray()),
    new THREE.VectorKeyframeTrack(b.name + ".position", [0], b.position.toArray()),
  ]);
  writeFileSync(out + name + ".clip.json", JSON.stringify(THREE.AnimationClip.toJSON(new THREE.AnimationClip(name.toUpperCase(), 0, poseTracks))) + "\n");
}
writeFileSync(out + "manifest.json", JSON.stringify({ ticket: 397, method: "Code key poses via existing PoseAuthor + Animator + FootLock; baked at 60 Hz",
  source: "art-src/lab/anim/human-base-animations.glb", rig: "human", joints: 66,
  clips: ["sword-a.clip.json", "s0.clip.json", "s1.clip.json"], fps: 60, durationS: 1.8,
  markersS: markers, hit: "External actual k1 projectile impact event; never a clip damage trigger",
  coordinates: "Original canonical human bone local transforms; loaded under the existing +z human wrapper; no retarget",
  rootMotion: false, acceptance: "Technical round 1 only; not shared-system acceptance at 9" }, null, 2) + "\n");
console.log(JSON.stringify({ typeDiagnostics: diagnostics.length, results, export: { out, tracks: tracks.length, frames: times.length },
  limits: "CPU fixed-step scheduling only; no OS key/render presentation latency, GPU, audio onset or blind judging" }, null, 2));
