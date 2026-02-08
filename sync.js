import fs from "node:fs/promises";

const SHEET_ID = process.env.SHEET_ID;
const GID = process.env.GID;           // gid листа (у тебя 0)
const OUT_FILE = process.env.OUT_FILE || "prices.json";

if (!SHEET_ID || !GID) {
  console.error("Missing env: SHEET_ID, GID");
  process.exit(1);
}

function parseCSV(text) {
  // простой CSV-парсер с поддержкой кавычек
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') { cell += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else cell += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ",") { row.push(cell); cell = ""; }
      else if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
      else if (ch === "\r") { /* ignore */ }
      else cell += ch;
    }
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

function buildGeoData(rows) {
  // у тебя диапазон A3:D106 → значит первые 2 строки мусор/шапка, данные с 3-й
  // а в CSV мы просто пропустим пустые/непохожие строки
  const geo = {};
  for (const r of rows) {
    const city = (r[0] || "").trim();
    const start = (r[1] || "").trim();
    const startPlus = (r[2] || "").trim();
    const all = (r[3] || "").trim();

    if (!city) continue;
    // фильтр: пропускаем строки, где цены не похожи на числа
    if (!/^\d/.test(start)) continue;

    geo[city] = { start, startPlus, all };
  }
  geo.__meta = { updatedAt: new Date().toISOString() };
  if (!geo["Москва"]) throw new Error("Bad export: no 'Москва' found (check sharing/publish)");
  return geo;
}

(async () => {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${encodeURIComponent(GID)}`;
  const r = await fetch(url, { headers: { accept: "text/csv" } });
  if (!r.ok) throw new Error(`CSV fetch error ${r.status}: ${await r.text()}`);

  const csv = await r.text();
  const rows = parseCSV(csv);
  const geo = buildGeoData(rows);

  await fs.writeFile(OUT_FILE, JSON.stringify(geo), "utf8");
  console.log("OK wrote", OUT_FILE, "rows=", Object.keys(geo).length);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
