// node sync.js
import fs from "node:fs/promises";

const SHEET_ID = process.env.SHEET_ID;
const RANGE = process.env.RANGE;           // "Лист1!A:E"
const GOOGLE_KEY = process.env.GOOGLE_KEY; // API key
const OUT_FILE = process.env.OUT_FILE || "prices.json";

if (!SHEET_ID || !RANGE || !GOOGLE_KEY) {
  console.error("Missing env: SHEET_ID, RANGE, GOOGLE_KEY");
  process.exit(1);
}

async function getSheetValues() {
  const url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(RANGE)}`);
  url.searchParams.set("key", GOOGLE_KEY);

  const r = await fetch(url.toString(), { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`Google Sheets API error ${r.status}: ${await r.text()}`);
  const j = await r.json();
  return j.values || [];
}

function buildGeoData(values) {
  // ожидаем заголовок в 1 строке: city | start | startPlus | all | reviewsPro
  const geo = {};
  for (let i = 1; i < values.length; i++) {
    const row = values[i] || [];
    const city = String(row[0] || "").trim();
    if (!city) continue;

    geo[city] = {
      start: String(row[1] ?? "").trim(),
      startPlus: String(row[2] ?? "").trim(),
      all: String(row[3] ?? "").trim(),
      reviewsPro: String(row[4] ?? "").trim(),
    };
  }
  geo.__meta = { updatedAt: new Date().toISOString() };
  return geo;
}

(async () => {
  const values = await getSheetValues();
  const geo = buildGeoData(values);

  // защита от “перезатёрли пустым”
  if (!geo["Москва"]) throw new Error("Bad export: no 'Москва' row found");

  const json = JSON.stringify(geo);
  await fs.writeFile(OUT_FILE, json, "utf8");
  console.log("OK wrote", OUT_FILE, "bytes=", json.length);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

