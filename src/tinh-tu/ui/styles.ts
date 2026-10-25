/**
 * Grey-box styles of the Tĩnh Tu page (canon §16, §21.1, §24): still water
 * as a gradient, giấy dó slips told apart by rim and icon (also in greyscale),
 * words 30 px Be Vietnam Pro 700, IPA in Noto Sans, no shaking, reduced
 * motion turns every animation off. Kit semantic colours only for their
 * meaning (#7FF5E0 typed letters; #FFB020 a slip about to leave).
 * Owner: Lane 8.
 */
export const TT_CSS = `
:root { color-scheme: dark; }
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; }
body { background: #0b1118; color: #ece6d6; font: 16px/1.5 "Be Vietnam Pro", "Segoe UI", system-ui, sans-serif; }
.tt-app { min-height: 100vh; display: flex; flex-direction: column; }
.tt-top { display: flex; justify-content: space-between; align-items: baseline; gap: 1rem; padding: .6rem 1.4rem; border-bottom: 1px solid #243140; color: #b9c2cf; font-size: .95rem; }
.tt-top b { color: #ece6d6; font-weight: 700; }
.tt-ime { margin: .5rem 1.4rem 0; padding: .5rem .9rem; border: 2px solid #c9b98f; border-radius: 6px; background: #1d1a12; color: #f1e6c4; }
.tt-main { flex: 1; display: flex; flex-direction: column; padding: 1rem 1.4rem; min-height: 0; }
.tt-keys { padding: .5rem 1.4rem .8rem; color: #8f9aab; font-size: .9rem; border-top: 1px solid #1c2733; }
.tt-keys kbd { display: inline-block; min-width: 1.6em; padding: 0 .35em; margin: 0 .15em; border: 1px solid #4a5869; border-bottom-width: 2px; border-radius: 4px; color: #d8dee8; font: 600 .85rem/1.5 "Be Vietnam Pro", system-ui, sans-serif; text-align: center; }
h1 { margin: 0 0 .4rem; font-size: 1.7rem; font-weight: 700; }
h2 { margin: 1rem 0 .4rem; font-size: 1.15rem; font-weight: 700; color: #d9cfb6; }
.tt-muted { color: #9aa5b5; }
.tt-note { min-height: 1.5em; margin: .6rem 0 0; padding: .5rem .8rem; border-left: 4px solid #c9b98f; background: #151d27; }
.tt-note:empty { visibility: hidden; }
.tt-source { font-size: .92rem; color: #b8c0cc; }

/* Tĩnh Thất */
.tt-rows { list-style: none; margin: .8rem 0 0; padding: 0; display: grid; gap: .45rem; max-width: 60rem; }
.tt-row { display: flex; align-items: baseline; gap: .8rem; padding: .6rem .9rem; border: 2px solid #233140; border-radius: 8px; background: #111a24; }
.tt-row.is-selected { border-color: #ece6d6; background: #1a2533; }
.tt-row .tt-num { min-width: 1.6rem; color: #c9b98f; font-weight: 700; }
.tt-row .tt-title { font-weight: 700; }
.tt-row .tt-detail { color: #a7b1bf; font-size: .95rem; }
.tt-row .tt-progress { margin-left: auto; white-space: nowrap; font-weight: 700; }
.tt-row .tt-done { color: #ece6d6; border: 2px solid #ece6d6; border-radius: 999px; padding: 0 .5rem; font-size: .85rem; }
.tt-choice { display: inline-flex; gap: .4rem; align-items: baseline; }
.tt-choice b { padding: 0 .4rem; border-bottom: 2px solid #ece6d6; }

/* Khẩu Quyết */
.tt-kq { list-style: none; margin: .8rem 0 0; padding: 0; display: grid; gap: .5rem; max-width: 52rem; }
.tt-kq li { display: grid; grid-template-columns: 9.5rem 10rem 1fr 2rem; align-items: baseline; gap: .8rem; padding: .55rem .9rem; border: 2px solid #233140; border-radius: 8px; background: #111a24; }
.tt-kq li.is-current { border-color: #ece6d6; background: #1d2836; }
.tt-kq li.is-done { opacity: .72; }
.tt-kq .tt-kq-word { font-size: 1.6rem; font-weight: 700; letter-spacing: .02em; }
.tt-kq .tt-kq-check { font-weight: 700; color: #ece6d6; }
.tt-ipa { font-family: "Noto Sans", "Charis SIL", "Be Vietnam Pro", system-ui, sans-serif; color: #c8cfda; }
.tt-typed { background: #7FF5E0; color: #0c1c19; border-radius: 3px; }
.tt-first { text-decoration: underline; text-decoration-thickness: 3px; text-underline-offset: 5px; }
.tt-err-word { animation: tt-err .18s ease-out; }

/* Session */
.tt-session { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.tt-hud { display: flex; flex-wrap: wrap; gap: .4rem 1.6rem; align-items: baseline; font-size: 1.05rem; }
.tt-hud .tt-time { font-size: 1.6rem; font-weight: 700; min-width: 4.5rem; }
.tt-hud .tt-minh-dots span { display: inline-block; width: .85rem; height: .85rem; margin-right: .2rem; border: 2px solid #ece6d6; border-radius: 50%; vertical-align: -1px; }
.tt-hud .tt-minh-dots span.is-typed { background: #ece6d6; }
.tt-topic { margin: .5rem 0 .2rem; font-size: 1.15rem; }
.tt-topic b { font-size: 1.35rem; color: #f3ead2; }
.tt-water { position: relative; flex: 1; min-height: 20rem; margin-top: .4rem; border-radius: 14px; overflow: hidden;
  background: repeating-linear-gradient(180deg, rgba(255,255,255,.025) 0 2px, transparent 2px 26px), linear-gradient(180deg, #1c2e40 0%, #13212f 55%, #0c1620 100%);
  display: grid; grid-template-columns: repeat(var(--points), 1fr); gap: 1rem; padding: 1.4rem 1.2rem 2.2rem; }
.tt-point { position: relative; display: flex; align-items: center; justify-content: center; }
.tt-point::after { content: ""; position: absolute; bottom: -1.3rem; left: 50%; width: 7.5rem; height: 1.1rem; transform: translateX(-50%); border-radius: 50%; border: 2px solid rgba(214,224,236,.18); }
.tt-paper { position: relative; width: min(100%, 15.5rem); min-height: 7.2rem; padding: .7rem .8rem .9rem; border-radius: 6px; background: #ece3cf; color: #1d1a16;
  box-shadow: 0 6px 14px rgba(0,0,0,.35); animation: tt-drift .45s ease-out; display: flex; flex-direction: column; gap: .2rem; }
.tt-paper .tt-icon { position: absolute; top: .45rem; right: .5rem; width: 1.6rem; height: 1.6rem; }
.tt-paper .tt-icon svg { width: 100%; height: 100%; }
.tt-paper .tt-word { font-size: 30px; font-weight: 700; line-height: 1.2; letter-spacing: .02em; padding-right: 1.6rem; }
.tt-paper .tt-meaning { font-size: .98rem; line-height: 1.3; color: #3a3226; }
.tt-paper .tt-meaning .tt-ipa { color: #4f4a42; font-size: .9rem; }
.tt-paper .tt-life { margin-top: auto; height: 6px; border-radius: 3px; background: rgba(29,26,22,.15); overflow: hidden; }
.tt-paper .tt-life i { display: block; height: 100%; background: rgba(29,26,22,.55); }
.tt-paper.look-minh { outline: 4px solid #fff4d6; outline-offset: 3px; box-shadow: 0 0 0 10px rgba(255,244,214,.16), 0 6px 14px rgba(0,0,0,.35); }
.tt-paper.look-minh .tt-icon { color: #4a3510; }
.tt-paper.look-other { border: 3px dashed #7d8796; background: #e2dccd; }
.tt-paper.look-other .tt-icon { color: #23364f; }
.tt-paper.look-tamma { background: linear-gradient(180deg, #4b3f57 0%, #2b2534 100%); color: #f1e8f7; border: 3px solid #7c6a8d; }
.tt-paper.look-tamma .tt-icon { color: #efe4f6; }
.tt-paper.look-tamma .tt-life { background: rgba(255,255,255,.15); }
.tt-paper.look-tamma .tt-life i { background: rgba(255,255,255,.6); }
.tt-paper.is-locked { box-shadow: 0 0 0 3px #7FF5E0, 0 6px 14px rgba(0,0,0,.35); }
.tt-paper.look-minh.is-locked { box-shadow: 0 0 0 10px rgba(255,244,214,.16), 0 0 0 3px #7FF5E0, 0 6px 14px rgba(0,0,0,.35); }
.tt-paper.in-grace .tt-life i { background: #FFB020; }
.tt-paper.tt-err { animation: tt-err .18s ease-out; }
.tt-legend { display: flex; flex-wrap: wrap; gap: .5rem 1.4rem; margin-top: .7rem; color: #b8c0cc; font-size: .92rem; }
.tt-legend span { display: inline-flex; align-items: center; gap: .4rem; }
.tt-legend i { display: inline-block; width: 1.5rem; height: 1rem; border-radius: 3px; background: #ece3cf; }
.tt-legend i.look-minh { outline: 3px solid #fff4d6; outline-offset: 2px; }
.tt-legend i.look-other { border: 2px dashed #7d8796; background: #e2dccd; }
.tt-legend i.look-tamma { background: #3a3245; border: 2px solid #7c6a8d; }
.tt-legend svg { width: 1.1rem; height: 1.1rem; }

/* End */
.tt-end-score { font-size: 1.35rem; font-weight: 700; margin: .2rem 0; }
.tt-words { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr)); gap: .4rem .8rem; max-width: 64rem; }
.tt-words li { padding: .4rem .7rem; border: 2px solid #233140; border-radius: 6px; background: #111a24; }
.tt-words li b { font-size: 1.15rem; }
.tt-words li.is-missed { border-style: dashed; }
.tt-linh-ngo { display: inline-block; margin-left: .6rem; padding: 0 .6rem; border: 2px solid #ece6d6; border-radius: 999px; }

@keyframes tt-drift { from { transform: translateY(-1.6rem); opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes tt-err { 0% { outline: 3px solid #5b4630; } 100% { outline: 3px solid transparent; } }
.tt-reduce *, .tt-reduce *::before, .tt-reduce *::after { animation: none !important; transition: none !important; }
@media (max-height: 760px) { .tt-paper { min-height: 6.4rem; } .tt-water { min-height: 17rem; padding-top: 1rem; } h1 { font-size: 1.45rem; } }
`;
