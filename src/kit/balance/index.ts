// Kit module balance/: multi-factor balance (docs/games/BALANCE.md §8): skill profile, before-stage levers, flow meter, pace director, human-like typist bots, gates B1–B9.
export {
  AUDIENCES, FAMILIARITIES, FAMILIARITY_SPEED, SKILL_FULL, SKILL_MODES, SKILL_RANGE, SKILL_RULES, SKILL_VERSION,
  blendSkill, newSkillProfile, parseSkill, serializeSkill, skillDefaults, skillStorageKey, updateSkill,
  type Audience, type ByFamiliarity, type Familiarity, type Measure, type SkillInput, type SkillMeasures, type SkillMode, type SkillProfile,
  type SkillRejection, type SkillRules, type SkillSample, type SkillTrend, type SkillUpdate, type SkillValues, type SkillView,
} from "./profile";
export {
  ADVICE_VI, DRAGON_C_REF, MAX_FATIGUE, NEW_WORD_RULES, PACE_RANGE,
  capacity, effectiveE, familiarityMix, newWordShare, paceK, peakLanes, scaleTicks, skillAdvice, suggestDifficulty, telegraphScale, telegraphTicks,
  type AdviceId, type DifficultySuggestion, type EffectiveInput, type NewWordRules, type PaceGame, type PaceRange,
} from "./pace";
export {
  BANDS, BAND_METRICS, BAND_MODES, METRIC_LABELS, MODE_LABELS, bandModeFor, rangeText, scoreBand, verdict,
  type Band, type BandMetric, type BandMode, type BandRow, type BandScore, type BandValues, type BandVerdict, type Range,
} from "./bands";
export { FLOW_RULES, FlowMeter, type FlowOutcome, type FlowRules, type FlowSnapshot, type FlowSummary, type FlowWindow } from "./flow";
export {
  PACE_LEVERS, PACE_RULES, PACE_TABLE, PaceDirector, paceTension,
  type PaceDecision, type PaceDir, type PaceDirectorOptions, type PaceEvent, type PaceLever, type PaceOff, type PaceRules, type PaceSummary, type PaceTable, type PaceVerdict,
} from "./director";
export {
  BOT_IDS, HumanTypist, KeyPlayer, RECOGNIZE, STANDARD_BOTS, TACTICS, TARGET_MIX, botParams, botSpec,
  type BotId, type BotSpec, type KeyEvent, type Tactics, type TargetMix, type TargetOption, type TypedWord, type TypistParams, type WordContext,
} from "./typist";
export {
  GATE_IDS, GATE_NAMES, formatGates, gate, pct, runGates, summarizeRuns,
  type BotModeSummary, type GateCheck, type GateId, type GateInput, type GateOptions, type GateResult, type GateStatus, type HumanMatch, type RunRecord,
} from "./gates";
export { clamp, detExp, detLn, logNormalDraw, median, medianInt, normalDraw, round3, toMilli } from "./math";
