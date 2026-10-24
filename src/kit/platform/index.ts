// Platform helpers copied unchanged from Space Typing src/platform.
export { RNG_STREAMS, RngStream, createRng, rngState, restoreRng, type Rng, type RngStreamName } from "./rng";
export {
  handleEach,
  runFrameLoop,
  type FrameError,
  type FrameLoop,
  type FrameLoopOptions,
  type FrameScheduler,
  type FrameStage,
} from "./frame-loop";
export {
  onStorageTrouble,
  safeLocalStorage,
  safeSessionStorage,
  type SafeStorage,
  type StorageArea,
  type StorageTrouble,
} from "./safe-storage";
export { resetCanvas2D } from "./canvas-state";
