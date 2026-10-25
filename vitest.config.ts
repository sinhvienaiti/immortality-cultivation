// Game tests only: src/kit/** keeps its own tests in shared/game-kit.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // The shared WSL machine (7 GB, other lanes' Chrome and bots) runs property tests 2–3× slower than alone:
    // vitest's 5 s default made `pnpm check` flaky (boss Gọi Đàn over 20 seeds: 3 s alone, 5–8.5 s loaded).
    testTimeout: 20_000,
  },
});
