// Entry point of index.html. Until integration (M0A_PLAN §6.9) it shows a
// "being built" card; then it routes to startApp (src/app/app.ts).
// The HN0 bench and the Tĩnh Tu trial have their own pages (bench.html, tinh-tu.html).
// Owner: step 0 / integration (LANES.md).

function showBuilding(doc: Document): void {
  const host = doc.getElementById("ic-overlay") ?? doc.body;
  doc.body.style.cssText = "margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0f16;color:#e8ecf4;font:16px/1.6 system-ui,sans-serif";
  const card = doc.createElement("main");
  card.dataset.state = "building";
  card.style.cssText = "max-width:34rem;padding:2rem;text-align:center";
  const title = doc.createElement("h1");
  title.textContent = "Tu Tiên Thủ Ải";
  title.style.cssText = "font-size:2.2rem;margin:0 0 .5rem";
  const status = doc.createElement("p");
  status.textContent = "Đang dựng: mốc M0a (hộp xám, bench 3D HN0, bản thử Tĩnh Tu).";
  status.style.color = "#aab3c5";
  const links = doc.createElement("p");
  links.style.color = "#aab3c5";
  for (const [href, label] of [
    ["bench.html", "Bench HN0"],
    ["tinh-tu.html", "Tĩnh Tu (thử)"],
  ] as const) {
    const link = doc.createElement("a");
    link.href = href;
    link.textContent = label;
    link.style.cssText = "color:#7ff5e0;margin:0 .6rem";
    links.append(link);
  }
  card.append(title, status, links);
  host.append(card);
}

showBuilding(document);
