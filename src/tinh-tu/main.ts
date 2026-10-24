/**
 * tinh-tu.html entry: the Tĩnh Tu trial (canon §16, M0A_PLAN §6.8): Khẩu
 * Quyết card, 60 s session, Nhập Môn and Tham Ngộ, end screen; keyboard only.
 * The ledger (typing/new-word-ledger.ts) through src/app/storage.ts; wall
 * clock (Date.now) only in this UI layer, never in src/tinh-tu/sim.
 * Owner: Lane 8. TODO(lane-8): until then an empty frame (M0A_PLAN §2.4).
 */

function showEmptyFrame(doc: Document): void {
  const host = doc.getElementById("tt-app") ?? doc.body;
  doc.body.style.cssText = "margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0f16;color:#aab3c5;font:16px/1.6 system-ui,sans-serif";
  const note = doc.createElement("p");
  note.dataset.state = "empty";
  note.textContent = "Tĩnh Tu (thử): khung trống (Làn 8 dựng).";
  host.append(note);
}

showEmptyFrame(document);
