// Verifikasi key akses untuk APK. Key HANYA ada di Vercel (env APP_ACCESS_KEY), tidak pernah dimasukkan ke APK.
// Beberapa key boleh dipisah koma: APP_ACCESS_KEY=key1,key2,key3 (hapus satu untuk mencabut aksesnya).
import { createHash, timingSafeEqual } from 'node:crypto';

const WINDOW_MS = 60_000;
const MAX_FAILS = 8;          // maksimal key salah per IP per menit (best-effort, per instance)
const hits = new Map();

function sha(value) {
  return createHash('sha256').update(String(value)).digest();
}

function failedTooMuch(ip) {
  const now = Date.now();
  if (hits.size > 2000) {
    for (const [k, list] of hits) if (!list.some(t => now - t < WINDOW_MS)) hits.delete(k);
  }
  return (hits.get(ip) || []).filter(t => now - t < WINDOW_MS).length >= MAX_FAILS;
}

function recordFail(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter(t => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Gunakan metode POST.' });
  }

  const allowed = String(process.env.APP_ACCESS_KEY || '')
    .split(',').map(k => k.trim()).filter(Boolean);
  if (!allowed.length) {
    return res.status(503).json({ error: 'APP_ACCESS_KEY belum diatur di Environment Variables Vercel.' });
  }

  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (failedTooMuch(ip)) {
    return res.status(429).json({ error: 'Terlalu banyak percobaan. Coba lagi sebentar.' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const key = typeof body?.key === 'string' ? body.key.trim().slice(0, 200) : '';

  // Bandingkan hash agar panjang sama dan waktu perbandingan konstan.
  const given = sha(key);
  let match = false;
  for (const k of allowed) {
    if (timingSafeEqual(given, sha(k))) match = true;
  }

  if (!key || !match) {
    recordFail(ip);
    return res.status(401).json({ ok: false, error: 'Key salah.' });
  }
  return res.status(200).json({ ok: true });
}
