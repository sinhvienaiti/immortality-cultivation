# Lab kỹ năng: sửa hộp xám Song Long theo review, 04/11/2026 (chiều)

**Lý do:** một review độc lập của hộp xám Song Long Hí Châu (Twin Dragons, One Burning Pearl; bản trước: [`2026-11-04-lab-twin-dragons-greybox.md`](2026-11-04-lab-twin-dragons-greybox.md)) xác nhận cờ tắt giữ nguyên trận, test và build đạt, nhưng tìm ra 9 vấn đề:
- chiêu trúng quá nhiều thú so với đích 12–20 của §2 luật 4;
- mỗi lần tung không có ngân sách sát thương, nên mạnh hơn cả tuyệt kỹ;
- trần cụm bầy bị đặt lại ở mỗi khối và mỗi tick;
- test không giữ được luật nào;
- đường A được lợi vì thứ tự tính;
- và bốn việc nhỏ hơn.

Bản này kiểm từng mục trên mã, sửa các mục có thật, đo lại bằng bot và ghi số.

**Tóm tắt:**
- Mỗi lần tung có **ngân sách riêng cho mỗi bên** (mỗi con rồng giữ một cổng). Mỗi bên có hệ số giảm dần riêng. Mỗi lần tung chỉ còn **một đòn vùng**.
- Lúc 35–45 thú trên hai đường, Song Long nay trúng **17,2 con mỗi lần tung** (p10–p90: 14–21); **80 % số lần tung nằm trong 12–20** (trước: 35,5 con, 0 %).
- Trái/phải nay **50/50** ở trung vị; 92 % số lần tung nằm trong 40/60–60/40.
- Cờ vẫn tắt mặc định. Trận mặc định giữ đúng từng byte như `1a78a82`, và nay có test ghim băm.
- Ô 2 vẫn chiếm 41–50 % sát thương cả trận (canon §7.3: ≤ 20 %). Đây là câu hỏi cho anh, không phải lỗi mã (§7).

## 1. Đã làm, theo commit

| Commit | Nội dung |
|---|---|
| `68be1b8` | Sim:<br>- `src/content/data/twin-pearl.ts`: thêm `pool`;<br>- `src/sim/twin-pearl.ts`: ngân sách, bên, một đòn vùng, một thứ tự, miễn sát thương, dọn hiệu năng;<br>- `src/app/app.ts`: `matchRulesHash` phủ bảng thử khi header bật cờ;<br>- `tests/sim/twin-pearl.test.ts`: từ 14 lên 27 test. |
| `4e0800f` | Lab:<br>- `src/lab/skills-main.ts`: chỉ hoãn mở âm thanh khi có `?key2=twin-pearl`;<br>- `src/lab/twin-pearl-greybox.ts`: đo phím tới đòn đầu ở khung hiện, ngân sách còn lại, trái/phải theo bên của sim. |
| commit này | Changelog này, kèm một dòng đính chính ở đầu changelog hộp xám. |

Không sửa canon, `docs/games/tu-tien/00-canon.md`, `school-kiem.ts`, `rules.ts`, `combat.ts`, `src/kit/**` hay game khác.

## 2. Từng mục của review: sửa hay bác

| # | Mục review | Kiểm trên mã | Việc đã làm |
|---|---|---|---|
| 1 | Tầm: 35,4 con mỗi lần tung, đích 12–20 | Đúng. Mọi khối phủ trọn hai đường, và không có gì giới hạn số con bị trúng | Không thêm trần số con. Ngân sách ở mục 2 tự giới hạn: 17,2 con lúc 35–45 thú, 80 % số lần tung trong 12–20. Hình học vẫn phủ trọn hai đường, nhưng lúc đông sát thương không tới được cổng (§5). Hướng cuối cùng vẫn do anh chọn (DRAGON_SKILL §8.8). |
| 2 | Không có ngân sách mỗi lần tung (12,9 W, ô 2 chiếm 59–61 % sát thương) | Đúng | **Sửa.** Mỗi bên được 2,5 W, chia chạm/hành lang/hoa sen theo 15/45/40, cộng 0,8 W cho đường trời của bên đó. Ngân sách nhân M_q và bucket như mọi đòn, rồi tiêu theo thứ tự tới trước bằng máu hiệu dụng. Cách tiêu giống trần 4 W của Lạc Kiếm Trận (`limit` của `damageBeast`). |
| 3 | Trần cụm bầy 60 % đặt lại ở mỗi khối, mỗi tick (một lần tung lấy tới 93,6 % cụm) | Đúng (`createAreaHit` trong `strikeVolume`) | **Sửa.** Cả lần tung là một đòn vùng (`cast.area`). Có test: cụm 6 Thạch Thử mất đúng 60 % máu. |
| 4 | Test không giữ luật: 7 đột biến vẫn qua 14 test; không có băm ghim cho cờ tắt | Đúng | **Sửa.** 27 test, mỗi khối được kiểm bằng chính đòn nó gây ra. Băm world của cờ tắt được ghim, tính trên bản xuất sạch của `1a78a82`. Mỗi đột biến dưới đây làm hỏng ít nhất một test. |
| 5 | Đường A được lợi vì thứ tự tính | Đúng: khối của đường A chạy trước mỗi tick nên lấy các chỗ đầu của hệ số giảm dần | **Sửa.** Mỗi bên có hệ số giảm dần và ngân sách riêng. Mỗi tick gom mọi thú trong các khối đang sống trong một lượt, rồi đánh theo một thứ tự: loại đòn, gần Trận Tâm, mã thú nhỏ. Có test: đám thú đối xứng gương nhận đòn đối xứng, sinh bên nào trước cũng vậy. |
| 6 | `TWIN_PEARL` không nằm trong `rulesHash` | Đúng | **Sửa.** `matchRulesHash(stage, { swordKey2 })` chỉ thêm bảng thử khi header có cờ. Không có cờ thì các phần và giá trị băm như cũ. |
| 7 | Chiêu giải khi chỉ còn Vương đang gầm (miễn sát thương) | Đúng | **Sửa.** Chiêu chỉ giải khi có thú nhận được sát thương. Thú đang miễn sát thương không vào sổ, nên không chiếm chỗ của hệ số giảm dần và không dùng hết loại đòn. |
| 8 | Hiệu năng (5,3 µs mỗi tick, không phải vấn đề) | Đúng | **Dọn** các chỗ rẻ: sổ đánh chỉ mục theo slot; vệt thân tính một lần mỗi đường mỗi tick; vùng hoa sen tính một lần mỗi thú; không còn closure hay mảng mới mỗi tick. |
| 9 | Lab: hoãn mở âm thanh ở mọi phiên; đo "phím → vẽ" lúc `render()` trả về, chưa phải lúc hiện | Đúng | **Sửa.** Chỉ hoãn khi có `?key2=twin-pearl`. "Phím → hiện" lấy mốc thời gian của khung kế tiếp sau khung có đòn đầu; giữ thêm số "đã nộp". |
| — | Lỗi cũ: thú bầy 1 máu đứng một mình không chết vì đòn vùng (`combat.ts`: 60 % của 1 làm tròn xuống 0) | Đúng | **Không sửa ở đây.** Đây là luật chung của mọi chiêu vùng trong `combat.ts`. Sửa sẽ đổi trận mặc định, trái luật "tắt cờ giữ nguyên từng byte". Ghi lại để làm riêng, kèm cập nhật golden. |

**Đột biến đã thử trên bản sao** (mỗi dòng: đổi một luật, chạy lại test):

| Đột biến | Kết quả |
|---|---|
| Hoa sen nửa thành đầy | 1 test hỏng |
| Bỏ đòn giữ F0 | 1 test hỏng |
| Bỏ hộp chạm đường B | 1 test hỏng |
| Bỏ trần cụm | 1 test hỏng |
| Bỏ Thế | 1 test hỏng |
| Hệ số giảm dần chung hai bên | 2 test hỏng |
| Khối trời trúng thú dưới đất | 1 test hỏng |
| Bỏ giới hạn ngân sách | 1 test hỏng |
| Giải khi chỉ có Vương đang gầm | 1 test hỏng |
| Cho thú miễn sát thương vào sổ | 1 test hỏng |
| Mỗi đòn một đòn vùng | 1 test hỏng |

Đột biến "đổi thứ tự hai đường" của review không còn chỗ để áp, vì mã mới không đánh theo thứ tự đường. Tính đối xứng được giữ bằng test gương.

**Ngoài Git, công cụ đo** (`tmp/skill-reach/key2-dense.ts`): khi dựng lại world ở lúc đông, một đòn đường thẳng ô 2 còn chờ của trận gốc có thể chạm trong cửa sổ 110 tick và bị tính nhầm cho lần tung đang đo. Review thấy 5 lần như vậy. Nay bản sao bỏ các đòn đường thẳng còn chờ trước khi tung, ở cả hai biến thể.

**Đính chính các nhận định trước** (báo cáo dựng, changelog hộp xám, DRAGON_SKILL §8):

| Nhận định trước | Sự thật |
|---|---|
| "Đã vượt đích tầm" | Sai: vượt **trên** đích 12–20, không phải đạt. |
| "Chiêu phủ đều cả hai bên" | Sai: thứ tự tính nghiêng 1–4 điểm về trái. Nay đã sửa. |
| "Phủ 100 % mỗi đường" | Chỉ đúng khi tính mọi khối, kể cả hộp giữ F0 và phần nửa của hoa sen. Riêng thân rồng chỉ phủ 66,7 % đường đi; không phần nào của thân chạm 8,6 m cuối, từ khúc quanh vào Trận Tâm. Theo thiết kế, đầu rồng xuất phát ở điểm gặp, còn hộp giữ và hoa sen phủ đoạn này. |
| "Phím tới đòn đầu 2,5–20 ms" | Đó là lúc lệnh vẽ trả về, chưa phải lúc hình hiện. Đo lại ở §6. |
| "5–7 lần tung mỗi phút" | Đó là mỗi phút đánh. Tính trên cả trận: Song Long 4,5 lần mỗi phút, đường thẳng hôm nay 3,9. |
| "Đòn đầu muộn 0,2 %" | Nay 3 lần muộn và 1 lần không trúng trong 15 374 lần tung của trận thật (0,03 %). Các lần do Vương đang gầm không còn, vì chiêu không giải khi chỉ có Vương. |

## 3. Luật của chiêu sau khi sửa (số thử)

**Ngân sách** (`TWIN_PEARL.pool`):
- `sideW100: 250`: mỗi bên 2,5 W, đúng bằng sát thương ô 2 hôm nay lên con đầu tiên. Chia 15 % chạm (cả hộp giữ F0 và hộp chạm F1–F2), 45 % thân rồng trên đất, 40 % hoa sen.
- `skyW100: 80`: mỗi bên 0,8 W cho đuôi quét trời, đúng bằng máu một con Hỏa Nha.
- Tất cả nhân M_q của Cast và bucket của ghế, như mọi đòn. Ví dụ ở bậc "good", Tâm nhãn tắt, K0: mỗi bên 34 + 101 + 72 + 90 = 297 máu, cả lần tung 594 máu (6,6 W). Chớp nhân 1,25.
- Mỗi đòn lấy từ phần của bên mình và loại của mình, tối đa phần còn lại. Phần nào hết thì lần tung đó không trúng thêm con nào bằng phần ấy: không vào sổ, không giảm Thế.

**Bên:**
- Tây là thú cổng A và quạ ở x < 0; đông là thú cổng B và quạ ở x ≥ 0.
- Mỗi bên có hệ số giảm dần riêng (100 %, 85 %, 70 %, 55 %, rồi sàn 40 %).
- Một con thú đơn độc mỗi bên vì vậy nhận đủ 2,5 W như ô 2 hôm nay; có test giữ điều này.

**Thứ tự mỗi tick:** loại đòn (chạm, hành lang, hoa sen), rồi gần Trận Tâm nhất (theo đường đi), rồi mã thú nhỏ.

**Không đổi:**
- Mọi khối, mọi khung.
- Tối đa 3 đòn mỗi con, mỗi loại một đòn, cách nhau ≥ 20 tick.
- Trần 1,5 W của Vương mỗi mã lần tung.
- Chia 15/45/40 của từng con; hoa sen nửa ngoài cánh.

**Chọn 2,5 W thế nào:** quét bảy mức ngân sách, mỗi mức 17 hồ sơ × 20 seed (§5.3). 2,5 W là mức có nhiều lần tung trong 12–20 nhất lúc 35–45 thú (80 %). Mức này cũng là mốc dễ hiểu: mỗi rồng mang đúng ô 2 hôm nay.

## 4. Tắt cờ thì không đổi gì

- **Golden:** `scripts/balance/golden.ts` vẫn là `TODO(lane-7)`. Thay vào đó có ba bằng chứng:
  1. **Test ghim băm** (`twin-pearl.test.ts`, "the flag off: world hashes pinned on 1a78a82"): một trận kịch bản có ô 2 đường thẳng, ô 4 và ô 1, hai seed, ghi băm world và số thú sống mỗi 300 tick. Script chạy trên bản xuất sạch `git archive 1a78a82` và trên cây hiện tại cho cùng 8 giá trị. Cùng script mà bật cờ thì ra giá trị khác.
  2. **Bot kiểu golden:** 9 hồ sơ × 4 seed, `BOT_HASHES=1`, so với `golden-before` của bước dựng (chính là `1a78a82`): 36/36 file trùng ở mọi trường bot cũ có ghi, gồm 1 693 mốc băm world và local.
  3. **340 trận "hôm nay"** của ma trận mới trùng từng trường với lần đo sáng 04/11.
- **Test:** `vitest run`: 83 file, **780 test đạt** (trước 767; thêm 13).
- **tsc:** sạch. Kiểm kit `src/kit/verify-kit.mjs`: đạt.
- **Build:** `vite build` vào thư mục tạm: đạt. Tìm tên mã lab trong bản build (`TwinPearlGreybox`, `keyToFirstHitMs`, `LabHerd`, `skills-lab`) đều 0 kết quả.

## 5. Đo lại (bot của SKILL_REACH, 17 hồ sơ × 20 seed, Cân bằng, bộ điều nhịp bật)

### 5.1 Tầm mỗi lần tung, quét đỉnh, lúc 35–45 thú trên hai đường (92 lần tung)

| Chỉ số | Đích | Hôm nay | Song Long trước sửa | Song Long sau sửa, chưa có ngân sách | **Song Long sau sửa** |
|---|---|---|---|---|---|
| Thú khác nhau bị trúng (p10–p90) | 12–20 | 2,8 (1–5) | 36,4 (32–41) | 31,5 (28–36) | **17,2 (14–21)** |
| Lần tung trong 12–20 | | 0 % | 0 % | 0 % | **80 %** |
| Phần thú đang sống bị trúng | | 7 % | 90 % | 77 % | 43 % |
| Trái/phải, trung vị (p10–p90 phần trái) | 40/60–60/40 | một bên | 57,5/42,5 | 58/42 (47–66 %) | **50/50 (43–57 %)** |
| Lần tung trong 40/60–60/40 | | 2 % | 64 % | 55 % | **92 %** |
| Trúng quạ | | 2 % | 96 % | 96 % | 92 % |
| Đòn đầu | ≤ 50 ms | F12 = 200 ms | F0–F1 | F0–F1 | F0 (82) hoặc F1 (10): 0–17 ms |
| Hạ mỗi lần tung | | 2,4 | 21,3 | 15,0 | 7,8 |
| Sát thương hiệu dụng mỗi lần tung | | 1,1 W | 13,2 W | 11,8 W | **5,9 W** |
| Thừa | | 71 % | 22 % | 17 % | 27 % |
| Đòn xa nhất trên đất, trung vị (tây / đông; cổng cách Trận Tâm 23,3 m) | | 5,4 / 2 m | | 22,9 / 22 m | 15,4 / 20,2 m |
| Phần thú xa hơn 12 m bị trúng | | 0 % | | 74 % | 26 % |

- Cột "trước sửa" lấy từ DRAGON_SKILL §8.2 (cùng ma trận, mã `6e68958`). Cột "chưa có ngân sách" là mã mới với ngân sách rất lớn: tách được phần do ngân sách và phần do các sửa khác.
- Theo mật độ (quét đỉnh), Song Long sau sửa:
  - 15–24 thú: 10,9 con, 42 % trong 12–20;
  - 25–34 thú: 14,4 con, 78 %;
  - 35–45 thú: 17,2 con, 80 %.
- Theo phần của chiêu (35–45 thú): giữ F0 10,1 %, chạm 3,5 %, thân 41 %, trời 12 %, hoa sen đầy 26 %, hoa sen nửa 7,4 %. Gộp theo loại là chạm 14 %, hành lang 53 %, hoa sen 33 %; thiết kế là 15/45/40.

### 5.2 Các chỉ số của BALANCE.md

Mỗi ô: số hôm nay · số Song Long sau sửa. Dải đích Cân bằng: Thắng 75–90 % · S trung vị 35–65 % · P 15–35 % · I ≤ 10 % · O ≤ 8 % · N 0,3–1 · Q trung vị 50–70 %.

| Hồ sơ | Thắng | S | P | I | O | N | Q | Gõ | Ô 1/gõ | Ô 2/cả trận | Đánh nền | Phút | Thua ở đợt |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 30 WPM 90 % | 0 · 100 % | 0 · 42 % | 74 · 55 % | 0,6 · 1,3 % | 0 · 0 % | 0 · 0,1 | 79 · 70 % | 80 · 84 % | 39 · 24 % | 23 · 47 % | 10,5 · 8 % | 8 · 12,7 | 4: 3 · 5: 16 · 6: 1 / — |
| 30 WPM 97 % | 5 · 100 % | 0 · 57 % | 71 · 50 % | 0,7 · 1,5 % | 0 · 0 % | 0,05 · 0 | 77 · 69 % | 81 · 85 % | 42 · 25 % | 21 · 48 % | 8,7 · 6,4 % | 9,1 · 11,9 | 4: 1 · 5: 7 · 6: 11 / — |
| 45 WPM 90 % | 0 · 100 % | 0 · 37 % | 71 · 56 % | 0,3 · 1,5 % | 0 · 0 % | 0 · 0,25 | 76 · 70 % | 82 · 85 % | 45 · 29 % | 20 · 45 % | 8 · 6,3 % | 7,7 · 10,9 | 5: 17 · 6: 3 / — |
| 45 WPM 97 % | 0 · 100 % | 0 · 47 % | 69 · 53 % | 0,4 · 1,6 % | 0 · 0 % | 0 · 0,2 | 75 · 68 % | 83 · 87 % | 48 · 29 % | 19 · 45 % | 6,6 · 5,2 % | 8,2 · 10,2 | 5: 7 · 6: 13 / — |
| 60 WPM 90 % | 0 · 100 % | 0 · 36 % | 72 · 60 % | 0,2 · 1,6 % | 0 · 0 % | 0 · 0,35 | 76 · 70 % | 84 · 86 % | 48 · 33 % | 20 · 41 % | 6,2 · 5,7 % | 7,1 · 9,6 | 5: 14 · 6: 6 / — |
| 60 WPM 97 % | 0 · 100 % | 0 · 49 % | 69 · 54 % | 0,6 · 1,6 % | 0 · 0 % | 0 · 0 | 73 · 68 % | 85 · 87 % | 51 · 33 % | 18 · 43 % | 5,2 · 4,4 % | 7,8 · 9,3 | 5: 7 · 6: 13 / — |
| 80 WPM 90 % | 0 · 100 % | 0 · 39 % | 70 · 58 % | 0,6 · 1,5 % | 0 · 0 % | 0 · 0,1 | 74 · 70 % | 84 · 87 % | 51 · 34 % | 19 · 41 % | 5,6 · 5,3 % | 7,5 · 9,4 | 5: 9 · 6: 11 / — |
| 80 WPM 97 % | 40 · 100 % | 0 · 52 % | 67 · 51 % | 1,2 · 2,1 % | 0 · 0 % | 0,4 · 0 | 72 · 68 % | 85 · 88 % | 52 · 35 % | 18 · 42 % | 5,1 · 3,9 % | 8,4 · 9,1 | 5: 3 · 6: 9 / — |
| Trẻ em (15 WPM 88 %) | 0 · 5 % | 0 · 0 % | 83 · 71 % | 0,2 · 0,3 % | 0 · 0 % | 0 · 0,05 | 95 · 81 % | 72 · 76 % | 22 · 13 % | 26 · 48 % | 20 · 15 % | 5,4 · 10,3 | 3: 15 · 4: 5 / 4: 3 · 5: 6 · 6: 10 |
| Mới (25 WPM 92 %) | 0 · 95 % | 0 · 46 % | 75 · 54 % | 0,4 · 1 % | 0 · 0 % | 0 · 0,1 | 82 · 71 % | 78 · 82 % | 37 · 21 % | 22 · 48 % | 12,1 · 9,2 % | 8,5 · 13,7 | 4: 5 · 5: 12 · 6: 3 / 6: 1 |
| Chậm chắc (25 WPM 99 %) | 0 · 100 % | 0 · 64 % | 71 · 49 % | 0,6 · 1,2 % | 0 · 0 % | 0 · 0 | 78 · 69 % | 80 · 85 % | 39 · 22 % | 22 · 49 % | 9,6 · 6,9 % | 9,9 · 12,6 | 5: 9 · 6: 11 / — |
| Chuẩn (35 WPM 95 %) | 0 · 100 % | 0 · 45 % | 72 · 55 % | 0,3 · 1,2 % | 0 · 0 % | 0 · 0,05 | 77 · 70 % | 81 · 85 % | 44 · 27 % | 20 · 46 % | 8,4 · 6,4 % | 8,5 · 11 | 5: 10 · 6: 10 / — |
| Khá (50 WPM 96 %) | 5 · 100 % | 0 · 54 % | 70 · 53 % | 0,6 · 2 % | 0 · 0 % | 0,05 · 0 | 75 · 68 % | 83 · 87 % | 48 · 28 % | 20 · 46 % | 6,3 · 5 % | 8,6 · 9,6 | 5: 2 · 6: 17 / — |
| Ẩu (50 WPM 85 %) | 0 · 100 % | 0 · 28 % | 73 · 60 % | 0,3 · 1,3 % | 0 · 0 % | 0 · 0,7 | 77 · 71 % | 82 · 85 % | 45 · 30 % | 21 · 43 % | 8,2 · 6,9 % | 7,5 · 10,8 | 4: 4 · 5: 10 · 6: 6 / — |
| Nhanh (70 WPM 97 %) | 10 · 100 % | 0 · 60 % | 68 · 51 % | 1,3 · 2,5 % | 0 · 0 % | 0,1 · 0 | 74 · 68 % | 85 · 88 % | 51 · 30 % | 19 · 45 % | 5,3 · 4,3 % | 8,4 · 9 | 5: 2 · 6: 16 / — |
| Không gõ | 0 · 0 % | 0 · 0 % | 82 · 82 % | 0 · 0 % | 0 · 0 % | 0 · 0 | 100 · 100 % | 0 · 0 % | — | 0 · 0 % | 74,8 · 74,8 % | 1 · 1 | 1: 20 / 1: 20 |
| Chỉ gõ (35 WPM 95 %, không mua) | 0 · 100 % | 0 · 45 % | 75 · 57 % | 0,5 · 1,5 % | 0 · 0 % | 0 · 0,1 | 79 · 70 % | 91 · 93 % | 42 · 26 % | 23 · 50 % | 9,5 · 6,9 % | 7,8 · 11,1 | 4: 2 · 5: 13 · 6: 5 / — |

**Thêm cho bot Chuẩn** (hôm nay → Song Long sau sửa):
- Ô 2: 5,0 → 5,6 lần mỗi phút đánh; 8,5 → 21,4 W mỗi phút; 1,9 → 6,5 con trúng và 1,6 → 3,6 con hạ mỗi lần tung.
- Sát thương cả trận: ô 4 15,1 → 10,0 %, tuyệt kỹ 10,7 → 6,3 %.
- Mỗi lần tuyệt kỹ (mọi bot gõ): 4,1 → 2,9 W hiệu dụng, vì Song Long đã hạ trước nhiều con.
- Đợt 2: thú lọt 14 → 6,6 %; Trận Lực mất 30 → 8,8 %.
- Thời gian sống trung bình của một thú: 12,5 → 10,1 s.

**Cổng bot đo được** (Song Long sau sửa):
- **B1 trượt:** Mới → Nhanh thắng 95–100 %, P 49–60 %.
- **B2 đạt; B3 đạt** phần bot Mới (95 %).
- **B4 đạt:** S Chậm chắc 64 % so với Ẩu 28 %; Chuẩn hạ thú 10,1 s so với Ẩu 10,6 s.
- **B5 đạt** phần Cân bằng.
- **CB1, CB2 (85 %), HC2 (7 chữ sống): đạt.**
- **CB3 trượt sát:** bot Nhanh 30,4 %; mọi bot khác ≤ 29,5 %.
- **CB9 trượt:** Chuẩn 11,0 phút.
- **§7.3 trượt:** ô 2 chiếm 45,7 % (đích ≤ 20 %), đánh nền 6,4 % (đích 12–18 %).

### 5.3 Quét ngân sách (bằng chứng cho câu hỏi của anh, không phải đề xuất)

Mỗi mức là ngân sách mỗi bên. Trời giữ 0,8 W. Mỗi mức chạy 17 hồ sơ × 20 seed.

| Mỗi bên | Trúng lúc 35–45 thú (trong 12–20) | W mỗi lần tung | Đòn xa nhất tây/đông | Mới → Nhanh thắng | Chuẩn: thắng · S · P · Q | Ô 2/cả trận (mọi bot) |
|---|---|---|---|---|---|---|
| 1,25 W | 11,9 (58 %) | 3,4 | 13,1 / 13,1 m | 0–60 % | 0 · 0 · 67 · 73 % | 29–36 % |
| 1,5 W | 13,0 (67 %) | 3,9 | 13,4 / 13,6 m | 5–90 % | 40 · 0 · 65 · 72 % | 32–40 % |
| 1,75 W | 14,3 (84 %) | 4,4 | 14,4 / 13,6 m | 30–100 % | 90 · 10 · 63 · 71 % | 34–43 % |
| 2,0 W | 15,2 (84 %) | 4,9 | 14,9 / 16,0 m | 45–100 % | 95 · 21 · 60 · 71 % | 37–45 % |
| **2,5 W (mặc định)** | **17,2 (80 %)** | **5,9** | **15,4 / 20,2 m** | **95–100 %** | **100 · 45 · 55 · 70 %** | **41–50 %** |
| 3,75 W | 21,8 (35 %) | 8,1 | 17,7 / 21,4 m | 100 % | 100 · 57 · 49 · 67 % | 48–58 % |
| 5,0 W | 26,2 (2 %) | 9,7 | 19,8 / 21,8 m | 100 % | 100 · 57 · 47 · 67 % | 53–61 % |
| không giới hạn | 31,5 (0 %) | 11,8 | 22,9 / 22,0 m | 100 % | 100 · 62 · 46 · 65 % | 57–64 % |

**Đọc bảng:**
- **Tỉ lệ thắng có một "vách"** giữa 1,25 W và 2,5 W:
  - dưới 2,5 W, nhiều bot thua lại (ở 1,75 W, Mới → Nhanh chỉ thắng 30–100 %);
  - từ 2,5 W trở lên, mọi bot Mới → Nhanh thắng 95–100 %.
- **Không mức nào đưa ô 2 về ≤ 20 % mà vẫn giữ được tầm.** Ở 1,25 W, ô 2 vẫn chiếm 29–36 % sát thương, nhưng phần lớn bot đã thua lại (Mới → Nhanh thắng 0–60 %).
- **P của Chuẩn vẫn 46–67 % ở mọi mức** (đích 15–35 %), nên riêng ô 2 không cân được cả trận.

## 6. Lab (đo lại phím tới đòn đầu)

`tmp/shots/dragon/greybox/review/latency-v2.json`, kịch bản `latency-keys-v2.mjs`:
- Chrome không giao diện qua `heavy.sh --perf`, chất lượng High, 1920 × 1080, khung rAF thật, phím thật qua CDP.
- Hai lượt, mỗi lượt 5 lần tung: lượt A bấm `2` ngay phím đầu của trang, lượt B bấm một phím không gán trước.

| | Kết quả |
|---|---|
| Đòn đầu | F0 cả 10 lần |
| Phím → hiện (mốc thời gian của khung kế tiếp; khung có đòn đầu chắc chắn đã hiện) | 17,4–30,9 ms |
| Phím → nộp (lệnh vẽ trả về, cách đo cũ) | 3,3–18,6 ms |
| Thú sống lúc tung | 41–48 |
| Thú khác nhau bị trúng | 15–20 |
| Trái/phải | 46/54 tới 52/48 |
| Ngân sách | gần cạn ở mọi lần tung (594–640 máu, còn 0–44 máu mỗi bên) |

- Đích ≤ 50 ms đạt cả khi tính tới khung hiện. Đây là cận trên, vì mốc của rAF kế tiếp đến sau lúc khung trước được hiện.
- Không chụp lại tấm khung và clip: khối và khung không đổi, chỉ đổi con nào bị trúng. Tấm khung và clip ở `tmp/shots/dragon/greybox/` vẫn đúng về hình học.

## 7. Chưa làm, và câu hỏi cho anh

- **Ô 2 chiếm bao nhiêu sát thương cả trận** (DRAGON_SKILL §8.8, câu 2)?
  - Ở 2,5 W mỗi bên, ô 2 chiếm 41–50 %. Canon §7.3 cho mỗi chiêu vùng ≤ 20 %.
  - Quét ở §5.3 cho thấy muốn về 20 % thì chiêu phải yếu tới mức bot thua lại.
  - Cần anh chọn: giữ 20 % (đổi thiết kế, ví dụ hồi chiêu dài hơn hoặc ô 2 thành chiêu thưa), hay cho chiêu biểu tượng một trần riêng cao hơn.
- **Phủ trọn đường hay sát thương tới cổng** (§8.8, câu 1): ngân sách làm cả hai đích 12–20 và phủ hình học trọn đường cùng đạt. Nhưng lúc đông, sát thương dừng ở 15–20 m từ Trận Tâm. Rồng vẫn chạy tới cổng mà không cắn những con xa. Phần nhìn cần cho thấy điều này, ví dụ đầu rồng nhạt dần khi bên đó hết sức.
- **Lỗi cũ trần cụm với 1 máu** (mục 2): làm riêng trong `combat.ts`, kèm golden.
- Như bản trước: chưa có hình, VFX, âm thanh; app chưa bật được cờ; sim chưa phát `skill-fx` cho chiêu này; lab không giữ hồi chiêu.

## 8. Tái lập

Chạy từ `games/immortality-cultivation`. Mọi file đo ở `tmp/skill-reach/`, ngoài Git.

| Việc | Lệnh |
|---|---|
| Test | `node_modules/.bin/vitest run tests/sim/twin-pearl.test.ts` |
| Ma trận (trận thật và quét đỉnh) | `KEY2_OUT=tmp/skill-reach/key2-fix ../../.local/bin/heavy.sh --cores=6 tmp/skill-reach/key2-matrix.sh line twin-pearl twin-pearl+pool100000s100000 twin-pearl+pool125 twin-pearl+pool150 twin-pearl+pool175 twin-pearl+pool200 twin-pearl+pool375 twin-pearl+pool500` (5 phút trên 6 lõi) |
| Gộp số | `KEY2_ROOT=tmp/skill-reach/key2-fix KEY2_VARIANTS="line twin-pearl …" node_modules/.bin/tsx tmp/skill-reach/key2-aggregate.ts` → `tmp/skill-reach/key2-fix/numbers.json`, `aggregate.txt` |
| Biến thể ngân sách | hậu tố `@twin-pearl+pool<mỗi bên W×100>[s<trời W×100>]` (`key2-numbers.ts`, chỉ đổi số trong bộ nhớ) |
| Kiểm cờ tắt | 9 hồ sơ × seed 1–4 với `BOT_HASHES=1` vào `tmp/skill-reach/key2-review/golden-now/`, so với `tmp/shots/dragon/greybox/golden-before/` |
| Lab | `vite --port 3241`, rồi `URL=http://127.0.0.1:3241/skills-lab.html ../../.local/bin/heavy.sh --perf node src/kit/tools/cdp-run.mjs tmp/shots/dragon/greybox/review/latency-keys-v2.mjs --width=1920 --height=1080` |
