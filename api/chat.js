// Proxy ke OpenAI untuk asisten AI melayang di dalam APK.
// API key HANYA ada di Vercel (env OPENAI_API_KEY), tidak pernah dimasukkan ke APK.

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 15;      // maksimal permintaan per IP per menit (best-effort, per instance)
const MAX_MESSAGES = 12;        // riwayat percakapan yang dikirim
const MAX_CHARS = 2000;         // panjang maksimal tiap pesan
const hits = new Map();

const SYSTEM_PROMPT =
  'Kamu adalah asisten AI di dalam aplikasi Android. Jawab dalam bahasa yang dipakai pengguna ' +
  '(utamakan Bahasa Indonesia), singkat, jelas, dan akurat. Jika tidak yakin atau tidak tahu, ' +
  'katakan terus terang daripada menebak. Untuk soal hitungan atau logika, tunjukkan langkah ringkas ' +
  'lalu berikan jawaban akhir.';

function limited(ip) {
  const now = Date.now();
  if (hits.size > 2000) {
    for (const [key, list] of hits) if (!list.some(t => now - t < WINDOW_MS)) hits.delete(key);
  }
  const recent = (hits.get(ip) || []).filter(t => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > MAX_PER_WINDOW;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Gunakan metode POST.' });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Layanan AI belum dikonfigurasi di server.' });
  }

  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (limited(ip)) {
    return res.status(429).json({ error: 'Terlalu banyak permintaan. Coba lagi sebentar.' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const incoming = Array.isArray(body?.messages) ? body.messages.slice(-MAX_MESSAGES) : [];
  const messages = incoming
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map(m => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));
  if (!messages.length || messages[messages.length - 1].role !== 'user') {
    return res.status(400).json({ error: 'Pertanyaan kosong.' });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 28_000);
  try {
    const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
        max_completion_tokens: 800
      }),
      signal: controller.signal
    });
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      console.error('OpenAI error', upstream.status, JSON.stringify(data).slice(0, 500));
      const msg = upstream.status === 429
        ? 'Kuota/batas permintaan OpenAI tercapai. Coba lagi nanti.'
        : 'Layanan AI sedang bermasalah. Coba lagi nanti.';
      return res.status(502).json({ error: msg });
    }
    const reply = data?.choices?.[0]?.message?.content?.trim();
    if (!reply) return res.status(502).json({ error: 'AI tidak mengirim jawaban. Coba lagi.' });
    return res.status(200).json({ reply });
  } catch (err) {
    const timedOut = err?.name === 'AbortError';
    console.error('chat failed', err);
    return res.status(timedOut ? 504 : 502).json({ error: timedOut ? 'AI terlalu lama menjawab. Coba lagi.' : 'Gagal menghubungi layanan AI.' });
  } finally {
    clearTimeout(timer);
  }
}
