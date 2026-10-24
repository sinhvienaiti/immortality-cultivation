# Agent guidance: Tu Tiên Thủ Ải (`immortality-cultivation`)

A standalone 3D typing pass-defense game. A cultivator holds Thanh Thạch Ải:
beast tides walk flow fields from two gates and a sky route towards the Trận
Tâm at the field's centre. The player walks (right click, arrows) and types
English words into the Bàn Quyết, a DOM bar of 5 skill slots outside the
canvas; plain beasts carry no words. Between waves the player buys
mechanisms and đan phù. Solo first; 2–3 seats with bots later.
Dev port 3008, host `tutien.typing-game.local`; `gameId` `immortality-cultivation`.

## Design

- Authoritative design (Vietnamese): `docs/games/tu-tien/` in the parent repo
  (`../..` from this repo's root). `00-canon.md` holds every rule and number
  and wins when documents disagree (decisions D01–D46); `M0A_PLAN.md` is the
  build plan (step 0, lanes, contracts, gates); `DANH_GIA_2026-10-24.md` gives
  the reasons.
- Current milestone: **M0a** grey box (full core rules, primitive placeholders,
  procedural ground) + the HN0 3D bench + the Tĩnh Tu trial page. State
  (25/10): step 0 done (scaffold, data contract, storage, boundary test, key
  router, match header); lanes 1–8 build on the stubs (`TODO(<lane>)`).
- Never judge a shared gate (`docs/games/BALANCE.md`) by a game-only band
  (canon D15): print the shared band, which is the gate of record.
- Rule numbers live in `src/content/rules.ts`, each pointing to its canon
  section; per-entity tables in `src/content/data/*.ts`.

## Lanes

Each lane writes only its own paths. See [LANES.md](LANES.md) for owned paths,
contracts, the event list and how to ask for a shared type change.

## Hard rules

- Never modify `games/space-typing`, any `games/.wt-*` worktree or another
  game. Copy code you reuse into this repo with a one-line
  `// Source: games/<repo>/<path> @<commit> (adapted: …)` header, list it in
  `docs/SYNC_DEBT.md`; never import across repos.
- No media in Git, ever: images, audio, video, `.glb`, `.gltf`, `.bin`, `.ktx2`.
  `public/assets/**` and `art-src/` are ignored.
- Never build character, creature, building or prop models in code. Allowed:
  primitive placeholders (one colour per beast family; biped tall, quadruped
  long and low, flyer floats, swarm in clusters), procedural ground, roads,
  decals, particles, shaders, instancing. Real models come from the owner as GLB.
- `src/sim`, `src/local`, `src/typing`, `src/content`, `src/tinh-tu/sim` are
  pure deterministic TypeScript at a fixed 60 Hz: integer state, seeded RNG
  (`world.rng.<stream>`, never `crit`), no `three`, `window`, `document`,
  `Date`, `performance`, `localStorage`, `fetch`, `Math.random`, trig, `pow`,
  `hypot` or `**`, also through kit import chains. Wall clock enters only as
  an argument (`nowMs`). Real-player positions stay in `src/local` (canon D28,
  D34); the world never reads them.
- `src/app/storage.ts` is the only file that touches browser storage.
- M0a has no sound (canon D26, Q6 of `tools/audio-lab/DECISIONS.md`): hooks
  stay silent; never write synthesized sound; never import
  `kit/feedback/audio-cues` or `kit/audio/dragon-voice`, not even through the
  `kit/feedback` or `kit/audio` barrels (import kit files directly); no
  `OscillatorNode` or `createOscillator`.
- M0a does not change `shared/game-kit` (canon D44). Never edit `src/kit/**`
  by hand: it is copied by `node scripts/sync-game-kit.mjs --target
  games/immortality-cultivation` (run in the parent repo) and sha256-checked by
  `src/kit/verify-kit.mjs`. Kit gaps stay local and go into `docs/SYNC_DEBT.md`.
- `tests/boundary.test.ts` enforces the four rules above.
- Bots never send learning events; they build dry-run drafts only (canon D43).
- No destructive git (`reset --hard`, `checkout -- .`, `clean -f`, bare
  `stash`, force push). Never push. Never run `sudo`, `scripts/setup-nginx.sh`,
  `pnpm media:push/pull`, or `pnpm bootstrap` with uncommitted work.
- TypeScript strict. Code comments in English, short. Docs and changelogs in
  Vietnamese with full diacritics; each lane adds
  `docs/changelog/<date>-m0a-<lane>.md`.
- Kill every background process you start (Vite, Chrome). Heavy work runs one
  at a time under `flock /tmp/tg-heavy.lock` with `VITEST_MAX_THREADS=4`; bots
  `--jobs=4` (WSL has 7 GB).
- On the Dell, Vite in WSL does not see files edited from Windows: restart it
  after a change, or run it with `CHOKIDAR_USEPOLLING=1`.
- Browser checks: Vite on port 3008 with `--strictPort`; scenarios through the
  kit runner `node src/kit/tools/cdp-run.mjs <scenario.mjs>`; functional runs
  may use Chrome for Testing in WSL, anything timing or GPU uses Windows Chrome
  (one GPU run at a time: `D:\_tools\gpu.lock`); screenshots go to
  `tmp/shots/<lane>/` (ignored) and must be looked at before claiming anything visual.

## Commands

| Command | Does |
|---|---|
| `pnpm dev` | Vite on 127.0.0.1:3008 (strict port); serves `/vocabulary/` and `/typing-texts/` from the parent `shared/` |
| `pnpm test` | Vitest (`tests/**`) |
| `pnpm build` | `tsc --noEmit` then `vite build` of `index.html`, `bench.html`, `tinh-tu.html` |
| `pnpm check` | Kit hash check, tests, build |
| `pnpm ic:balance` | Headless bots on the M0a stage (`scripts/balance/run.ts`, Lane 7) |
| `pnpm ic:golden:update` | Rewrite golden hashes after a deliberate rule change |
| `pnpm ic:calibrate` | Measure D_ref, D_đơn (`scripts/balance/calibrate.ts`) |
| `pnpm tt:bots` | Tĩnh Tu bots and HC4–HC7 (`scripts/tinh-tu/bots.ts`, Lane 8) |
| `pnpm visual <scenario.mjs>` | Real-browser scenario over CDP (`src/kit/tools/cdp-run.mjs`) |

Pages: `/` the game ("Đang dựng" until integration), `/bench.html` the HN0
bench (Lane 1), `/tinh-tu.html` the Tĩnh Tu trial (Lane 8).
