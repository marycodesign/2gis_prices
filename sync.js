// node sync.js
const SHEET_ID = process.env.SHEET_ID;
const RANGE = process.env.RANGE;            // 'Лист1!A:E'
const GOOGLE_KEY = process.env.GOOGLE_KEY;  // твой ключ
const YANDEX_TOKEN = process.env.YANDEX_TOKEN;
const YANDEX_PATH = process.env.YANDEX_PATH || '/site-data/prices.json';

async function getSheetValues() {
  const url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(RANGE)}`);
  url.searchParams.set('key', GOOGLE_KEY);

  const r = await fetch(url.toString(), { headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error(`Google Sheets API error ${r.status}: ${await r.text()}`);
  const j = await r.json();
  return j.values || [];
}

function buildGeoData(values) {
  // ожидаем заголовок в 1 строке: city | start | startPlus | all | reviewsPro
  const geo = {};
  for (let i = 1; i < values.length; i++) {
    const row = values[i] || [];
    const city = String(row[0] || '').trim();
    if (!city) continue;
    geo[city] = {
      start: String(row[1] ?? '').trim(),
      startPlus: String(row[2] ?? '').trim(),
      all: String(row[3] ?? '').trim(),
      reviewsPro: String(row[4] ?? '').trim(),
    };
  }
  geo.__meta = { updatedAt: new Date().toISOString() };
  return geo;
}

async function yandexGetUploadHref() {
  const url = new URL('https://cloud-api.yandex.net/v1/disk/resources/upload');
  url.searchParams.set('path', YANDEX_PATH);
  url.searchParams.set('overwrite', 'true');

  const r = await fetch(url.toString(), {
    headers: { Authorization: `OAuth ${YANDEX_TOKEN}` },
  });
  if (!r.ok) throw new Error(`Yandex upload-url error ${r.status}: ${await r.text()}`);

  const j = await r.json();
  if (!j.href) throw new Error('Yandex response has no href');
  return j.href;
}

async function yandexPutFile(href, content) {
  const r = await fetch(href, {
    method: 'PUT',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: content,
  });
  if (!r.ok) throw new Error(`Yandex upload PUT error ${r.status}: ${await r.text()}`);
}

(async () => {
  const values = await getSheetValues();
  const geo = buildGeoData(values);

  // защита от “пустой выгрузки” (чтобы случайно не перезатереть файл мусором)
  if (!geo["Москва"]) throw new Error("Bad export: no 'Москва' row found");

  const json = JSON.stringify(geo);
  const href = await yandexGetUploadHref();
  await yandexPutFile(href, json);

  console.log('OK uploaded', YANDEX_PATH, 'bytes', json.length);
})().catch(e => {
  console.error(e);
  process.exit(1);
});
