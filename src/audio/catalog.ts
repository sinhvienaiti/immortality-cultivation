/**
 * Silent sound hooks (canon §22, D26, Q6 of tools/audio-lab/DECISIONS.md):
 * the sound-id catalogue as canon §22 cards (purpose, the 4-part shape
 * prepare / attack / body / tail, size by the action's size, length, bus,
 * priority), every id `silent: true`: M0a plays nothing. Real sounds come at
 * M0b from recorded CC0 or Audio Lab through the owner's blind listening
 * board, written up in docs/audio/SOUND_LIST.md; never synthesized (no
 * OscillatorNode, createOscillator or any other source here, no import of
 * kit/feedback/audio-cues or kit/audio/dragon-voice: tests/boundary.test.ts,
 * tests/audio/**). ~55 ids in the canon's groups: keys 4, Kiếm 8, Thổ thể 8
 * (M1), beasts by class 14, Vương 6, tide 2, formation 4, UI 4, Tĩnh Tu 5.
 * Owner: Lane 6.
 */
import type { AUDIO } from "../content/rules";

export type AudioBus = (typeof AUDIO.buses)[number];

/** Size by the action's size (canon §22: a swarm is small; the Vương, an ultimate, Lôi Kiếp are huge). */
export type SoundSize = "tiny" | "small" | "medium" | "large" | "huge";

/** The milestone a sound belongs to (M0a lists them all, silent). */
export type SoundMilestone = "M0a" | "M1" | "Tĩnh Tu";

export interface SoundShape {
  /** Chuẩn bị, phát, thân, đuôi vang (canon §22, Q6). */
  readonly prepare: string;
  readonly attack: string;
  readonly body: string;
  readonly tail: string;
}

export interface SoundCard {
  readonly id: string;
  readonly purpose: string;
  readonly shape: SoundShape;
  readonly size: SoundSize;
  readonly lengthMs: number;
  readonly bus: AudioBus;
  /** 1 highest (canon §22: own pronunciation → warnings, Trận Lực < 30 % → keys → own skills → allies, impacts → swarm, ambience). */
  readonly priority: 1 | 2 | 3 | 4 | 5 | 6;
  readonly milestone: SoundMilestone;
  readonly silent: true;
}

const card = (id: string, purpose: string, shape: [string, string, string, string], size: SoundSize, lengthMs: number, bus: AudioBus, priority: SoundCard["priority"], milestone: SoundMilestone = "M0a"): SoundCard => ({
  id,
  purpose,
  shape: { prepare: shape[0], attack: shape[1], body: shape[2], tail: shape[3] },
  size,
  lengthMs,
  bus,
  priority,
  milestone,
  silent: true,
});

/** The M0a catalogue (all silent). */
export const SOUNDS: readonly SoundCard[] = [
  // Keys (4): wood and a small bell, the voice rule of AUDIO_PIPELINE §6.2 (1–4 kHz energy dies fast).
  card("key-letter", "Phím chữ đúng trên Bàn Quyết", ["—", "gõ gỗ khô", "chuông nhỏ ngắn", "đuôi thấp rất ngắn"], "tiny", 120, "typing", 3),
  card("key-wrong", "Phím sai", ["—", "gõ gỗ trầm", "tiếng gỗ tắt nhanh", "không đuôi cao"], "tiny", 140, "typing", 3),
  card("key-lock", "Phím đầu khóa một ô", ["—", "chạm mộc", "rung dây ngắn", "đuôi thấp"], "tiny", 180, "typing", 3),
  card("key-word", "Chữ cuối: từ thành nét thư pháp", ["hít khí ngắn", "nét bút quét", "vệt khí bay", "đuôi vang thấp"], "small", 420, "typing", 3),
  // Kiếm (8).
  card("kiem-auto", "Phi Kiếm (đánh nền)", ["rút kiếm khẽ", "vút", "kiếm xé gió", "đuôi gió ngắn"], "small", 380, "self", 4),
  card("kiem-volley", "Ngự Kiếm Quyết: băng 3 kiếm", ["ngân kim loại", "ba tiếng vút nối nhau", "kiếm lượn", "đuôi hẻm núi"], "medium", 900, "self", 4),
  card("kiem-line", "Nhất Tuyến Xuyên Vân", ["tụ khí", "phóng thẳng", "xé dài theo tuyến", "vọng hẻm núi"], "medium", 1100, "self", 4),
  card("kiem-ward", "Hồi Kiếm Hộ Thân: vòng hộ thân", ["kiếm xoay", "khóa vòng", "ngân đều", "tắt êm"], "medium", 900, "self", 4),
  card("kiem-ward-block", "Hộ thân đỡ một đòn", ["—", "va kim loại dày", "ngân rền", "đuôi vang vừa"], "medium", 700, "self", 4),
  card("kiem-dash", "Lưu Quang Bộ", ["dồn chân", "lướt", "vệt gió", "đuôi ngắn"], "small", 450, "self", 4),
  card("kiem-zone", "Lạc Kiếm Trận: vùng kiếm rơi", ["kiếm bay lên", "mưa kiếm cắm đất", "nhịp kiếm rơi", "đuôi đất vọng"], "large", 5000, "self", 4),
  card("kiem-ultimate", "Thiên Hà Kiếm Vũ: vạn kiếm", ["vạn kiếm ngân dần", "ba loạt rơi", "kiếm trút như mưa", "vọng hẻm núi dài"], "huge", 2600, "self", 4),
  // Thổ thể (8, M1).
  card("tho-auto", "Trấn Quyền (đánh nền)", ["co tay", "quyền nện", "đất rung nhẹ", "đuôi thấp"], "small", 400, "self", 4, "M1"),
  card("tho-cone", "Chấn Địa Quyền", ["dồn lực", "đấm nón", "đất vỡ", "đuôi đất"], "medium", 700, "self", 4, "M1"),
  card("tho-palm", "Phá Sơn Chưởng", ["gồng 0,4 s", "chưởng nặng", "đá nứt", "vọng sâu"], "large", 1000, "self", 4, "M1"),
  card("tho-guard", "Kim Cương Thân", ["hít sâu", "thân hóa đá", "rền thấp", "tắt dần"], "medium", 900, "self", 4, "M1"),
  card("tho-wall", "Thạch Bích dựng tường", ["đất chuyển", "tường trồi", "đá kết", "bụi lắng"], "large", 1200, "self", 4, "M1"),
  card("tho-wall-break", "Thạch Bích vỡ", ["nứt", "sụp", "đá lăn", "bụi"], "large", 1000, "self", 4, "M1"),
  card("tho-ultimate", "Sơn Hà Trấn", ["núi rền", "nện đất r 7 m", "sóng đất lan", "vọng hẻm núi dài"], "huge", 2400, "self", 4, "M1"),
  card("tho-taunt", "Điểm khiêu khích", ["—", "gõ đá", "ngân thấp", "ngắn"], "small", 500, "self", 4, "M1"),
  // Beasts by class (14).
  card("tide-swarm", "Lớp nền triều bầy theo mật độ (xa, gần, sát)", ["—", "—", "bầy rì rào", "lặp liền"], "medium", 4000, "enemies", 6),
  card("death-chain", "Chuỗi tan khói của nhiều thú chết gần nhau", ["—", "khói mực tan", "chuỗi xì khói", "đuôi gió"], "small", 600, "enemies", 6),
  card("beast-hit-small", "Thú nhỏ trúng đòn", ["—", "vệt mực chém", "rách gió", "ngắn"], "tiny", 200, "world", 5),
  card("beast-hit-medium", "Thú vừa trúng đòn", ["—", "va thịt dày", "gầm ngắn", "đuôi thấp"], "small", 350, "world", 5),
  card("beast-death-small", "Thú nhỏ tan khói", ["—", "khói phụt", "tan", "đuôi gió"], "small", 500, "enemies", 6),
  card("beast-death-medium", "Thú vừa tan khói", ["rên", "đổ", "khói mực bốc", "vọng"], "medium", 900, "enemies", 5),
  card("lang-howl", "Phong Lang hú", ["hít", "hú", "vọng núi", "đuôi dài"], "medium", 1400, "enemies", 5),
  card("lang-bite", "Sói cắn mép Trận Tâm", ["—", "cắn", "giằng", "ngắn"], "small", 400, "enemies", 5),
  card("nha-dive", "Hỏa Nha bổ nhào", ["kêu cao", "lao xuống", "cánh xé gió", "chạm đất"], "medium", 900, "enemies", 5),
  card("vien-throw", "Nham Viên ném đá", ["gầm gồng", "quăng", "đá bay", "đá vỡ"], "medium", 1200, "enemies", 5),
  card("tru-ram", "Thiết Giáp Trư húc", ["cào đất", "lao", "giáp nện", "đất rung"], "large", 1300, "enemies", 5),
  card("tru-capture", "Thiết Giáp Trư chiếm nhãn", ["—", "đè nhãn", "rền", "tắt"], "medium", 1000, "enemies", 2),
  card("elite-aura", "Tinh anh lộ diện", ["—", "khí ngân", "rung nền", "ngắn"], "small", 800, "enemies", 5),
  card("general-howl", "Lang Đầu Đàn Tru Đàn", ["hít sâu", "tru dài", "đàn đáp", "vọng hẻm núi"], "large", 2000, "warnings", 2),
  // Thú Vương (6).
  card("vuong-roar", "Thiết Bối Lang Vương gầm chuyển pha", ["hít rền", "gầm", "núi rung", "vọng rất dài"], "huge", 2500, "warnings", 2),
  card("vuong-voxe", "Vồ Xé (nón 6 m)", ["gồng vuốt", "vồ", "xé", "đuôi đất"], "large", 1200, "enemies", 2),
  card("vuong-charge", "Thiết Bối Xung: nạp và húc", ["cào đất dài", "lao", "giáp sắt nện", "đất vỡ vọng"], "huge", 2200, "warnings", 2),
  card("vuong-pillar", "Vương đâm Trận Trụ", ["—", "đá sắt va", "đá nứt", "vọng"], "huge", 1500, "world", 2),
  card("vuong-call", "Gọi Đàn", ["hít", "tru gọi", "đàn đáp xa", "vọng"], "large", 1800, "warnings", 2),
  card("vuong-fall", "Thú Vương ngã", ["rên dài", "đổ", "khói mực bốc", "lặng"], "huge", 3000, "world", 2),
  // Tide (2).
  card("wave-warning", "Báo đợt (5 s)", ["trống xa", "trống dồn", "tiếng cổng", "đuôi trống"], "medium", 1600, "warnings", 2),
  card("wave-end", "Hết đợt", ["—", "chiêng nhỏ", "ngân", "đuôi dài êm"], "medium", 1800, "ui", 5),
  // Formation (4).
  card("heart-hit", "Trận Tâm bị cắn, mất Trận Lực", ["—", "đá rung", "ngân trận", "ngắn"], "small", 400, "formation", 5),
  card("heart-low", "Trận Lực dưới 30 %", ["—", "trận rền", "nhịp cảnh báo", "lặp thưa"], "medium", 1500, "warnings", 2),
  card("node-off", "Tâm nhãn tắt (bị chiếm)", ["—", "trận vỡ nhịp", "rè", "tắt"], "medium", 900, "formation", 2),
  card("node-on", "Tâm nhãn sáng lại; Linh Dịch", ["—", "trận ngân", "sáng dần", "đuôi êm"], "medium", 1000, "formation", 4),
  // UI (4).
  card("ui-buy", "Mua, đặt, nâng cơ quan, đan phù", ["—", "gỗ chạm", "ngân nhỏ", "ngắn"], "tiny", 300, "ui", 5),
  card("ui-sell", "Bán cơ quan", ["—", "gỗ trượt", "ngắn", "—"], "tiny", 250, "ui", 5),
  card("ui-reject", "Lệnh bị từ chối", ["—", "gõ gỗ trầm", "ngắn", "—"], "tiny", 200, "ui", 5),
  card("ui-panel", "Mở, đóng bảng (cửa hàng, menu)", ["—", "giấy lật", "ngắn", "—"], "tiny", 250, "ui", 5),
  // Tĩnh Tu (5, the trial page).
  card("tt-leaf", "Lá phù hiện trên mặt nước", ["—", "nước gợn", "lá trôi", "đuôi nước"], "small", 900, "ambience", 6, "Tĩnh Tu"),
  card("tt-minh", "Gõ xong một từ Minh", ["—", "chuông đá nhỏ", "ngân", "đuôi êm"], "small", 1200, "typing", 3, "Tĩnh Tu"),
  card("tt-thuong", "Gõ xong một từ Thường", ["—", "gõ mộc", "ngắn", "đuôi nước"], "tiny", 600, "typing", 3, "Tĩnh Tu"),
  card("tt-tam-ma", "Chọn nhầm Tâm ma", ["—", "nước đục", "trầm", "tắt"], "small", 700, "typing", 3, "Tĩnh Tu"),
  card("tt-enlighten", "Lĩnh ngộ (100 điểm)", ["khí tụ", "chuông ngân", "sáng dần", "vọng dài"], "large", 3000, "ui", 4, "Tĩnh Tu"),
];

/** A card by id (undefined when the catalogue has no such id). */
export function soundCard(id: string): SoundCard | undefined {
  return SOUNDS.find((entry) => entry.id === id);
}
