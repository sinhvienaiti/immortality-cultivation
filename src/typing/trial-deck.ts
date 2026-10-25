/**
 * Bộ thử dự phòng (canon §25): the labelled fallback word set of a match when
 * the shared vocabulary (/vocabulary/) does not load. Taken from
 * shared/vocabulary levels 001 (48 words: a cold start's base words) and 002
 * (16 words: new words), a–z of 3–8 letters, no flagged word; meanings and IPA
 * as in the source. Pure data (canon §25 names src/content/data/ for it; that
 * folder is Lane 2's, so it lives with the deck builder, LANES.md).
 * Owner: Lane 3.
 */

export interface TrialWord {
  readonly en: string;
  readonly vi: string;
  readonly ipa: string;
  /** Vocabulary level of the source list. */
  readonly level: number;
}

/** Shown wherever the fallback set is in use (results, debug), so nobody takes it for the real deck. */
export const TRIAL_DECK_LABEL = "Bộ thử dự phòng: không tải được kho từ chung";

const ROWS: readonly (readonly [en: string, vi: string, ipa: string, level: number])[] = [
  ["good", "tốt; hay", "/ɡʊd/", 1],
  ["bad", "tệ, xấu, tồi, dở", "/bæd/", 1],
  ["big", "to, lớn", "/bɪɡ/", 1],
  ["small", "nhỏ; bé", "/smɔl/", 1],
  ["old", "già; lớn tuổi", "/oʊld/", 1],
  ["young", "trẻ; non; còn nhỏ", "/jʌŋ/", 1],
  ["new", "mới", "/nu/", 1],
  ["happy", "vui vẻ; hạnh phúc", "/ˈhæpi/", 1],
  ["sad", "buồn; buồn bả; buồn rầu", "/sæd/", 1],
  ["hot", "nóng, nóng bức", "/hɑt/", 1],
  ["cold", "lạnh; rét", "/koʊld/", 1],
  ["easy", "dễ; dễ dàng", "/ˈizi/", 1],
  ["hard", "khó, khó khăn", "/hɑɹd/", 1],
  ["right", "đúng, chính xác", "/ɹaɪt/", 1],
  ["wrong", "sai", "/ɹɔŋ/", 1],
  ["please", "xin; làm ơn; xin vui lòng", "/pliz/", 1],
  ["thanks", "lời cảm ơn; sự biết ơn", "/θæŋks/", 1],
  ["day", "ngày; một ngày đêm", "/deɪ/", 1],
  ["night", "đêm, ban đêm", "/naɪt/", 1],
  ["morning", "buổi sáng", "/ˈmɔɹnɪŋ/", 1],
  ["evening", "chiều tối", "/ˈivnɪŋ/", 1],
  ["time", "thời gian; thì giờ", "/taɪm/", 1],
  ["year", "năm", "/jɪɹ/", 1],
  ["week", "tuần, tuần lễ", "/wik/", 1],
  ["today", "hôm nay", "/təˈdeɪ/", 1],
  ["home", "nhà, chỗ ở, nơi ở", "/hoʊm/", 1],
  ["house", "nhà, căn nhà", "/haʊs/", 1],
  ["room", "phòng; căn phòng", "/ɹum/", 1],
  ["school", "trường học, trường", "/skul/", 1],
  ["work", "công việc, việc làm", "/wɝk/", 1],
  ["job", "công việc; nghề nghiệp", "/dʒɑb/", 1],
  ["family", "gia đình", "/ˈfæməli/", 1],
  ["friend", "bạn, người bạn thân", "/fɹɛnd/", 1],
  ["people", "người, người ta", "/ˈpipəl/", 1],
  ["person", "người, con người", "/ˈpɝsən/", 1],
  ["man", "đàn ông", "/mæn/", 1],
  ["woman", "phụ nữ, đàn bà", "/ˈwʊmən/", 1],
  ["child", "đứa trẻ, đứa bé", "/tʃaɪld/", 1],
  ["mother", "mẹ, má", "/ˈmʌðɚ/", 1],
  ["father", "cha; bố; ba", "/ˈfɑðɚ/", 1],
  ["brother", "anh (em) trai", "/ˈbɹʌðɚ/", 1],
  ["sister", "chị gái; em gái", "/ˈsɪstɚ/", 1],
  ["name", "tên; tên gọi", "/neɪm/", 1],
  ["book", "sách; quyển sách", "/bʊk/", 1],
  ["word", "từ", "/wɝd/", 1],
  ["question", "câu hỏi", "/ˈkwɛstʃən/", 1],
  ["answer", "câu trả lời; lời đáp", "/ˈænsɚ/", 1],
  ["idea", "ý tưởng, ý niệm", "/aɪˈdiə/", 1],
  ["early", "sớm; trước giờ", "/ˈɝli/", 2],
  ["late", "muộn, trễ", "/leɪt/", 2],
  ["always", "luôn luôn; lúc nào cũng", "/ˈɔlˌweɪz/", 2],
  ["never", "chưa bao giờ, không bao giờ", "/ˈnɛvɚ/", 2],
  ["often", "thường; hay; thường xuyên", "/ˈɔfən/", 2],
  ["together", "cùng nhau; với nhau", "/təˈɡɛðɚ/", 2],
  ["again", "lại, lần nữa", "/əˈɡɛn/", 2],
  ["already", "đã, rồi", "/ɔlˈɹɛdi/", 2],
  ["maybe", "có lẽ, có thể", "/ˈmeɪbi/", 2],
  ["really", "thực sự, thật sự", "/ˈɹɪli/", 2],
  ["possible", "có thể (xảy ra/tồn tại)", "/ˈpɑsəbəl/", 2],
  ["simple", "đơn giản, dễ dàng", "/ˈsɪmpəl/", 2],
  ["enough", "đủ", "/ɪˈnʌf/", 2],
  ["sure", "chắc chắn, không nghi ngờ", "/ʃʊɹ/", 2],
  ["free", "miễn phí", "/fɹi/", 2],
  ["full", "đầy", "/fʊl/", 2],
];

export const TRIAL_WORDS: readonly TrialWord[] = ROWS.map(([en, vi, ipa, level]) => ({ en, vi, ipa, level }));
