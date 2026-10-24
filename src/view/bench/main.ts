/**
 * bench.html entry: the HN0 bench (canon §20.3): cases 0, A–E, B–E at
 * COUNT 60 / 120 / 300; results on `window.__icBench`, `__icBenchStop`,
 * `__icBenchCamera`; the page sets `?motion=full` when measuring.
 * Owner: Lane 1. TODO(lane-1): until then an empty frame (M0A_PLAN §2.4).
 */

function showEmptyFrame(doc: Document): void {
  const host = doc.getElementById("ic-bench") ?? doc.body;
  doc.body.style.cssText = "margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0f16;color:#aab3c5;font:16px/1.6 system-ui,sans-serif";
  const note = doc.createElement("p");
  note.dataset.state = "empty";
  note.textContent = "Bench HN0: khung trống (Làn 1 dựng).";
  host.append(note);
}

showEmptyFrame(document);
