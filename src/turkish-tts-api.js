/** Optional, user-configured GPU service. No request is made until the user asks for it. */
export function normalizeTurkishTtsUrl(value) {
  const input = String(value ?? '').trim();
  if (!input) throw new Error('Turkish-TTS sunucu adresini girin.');

  let parsed;
  try { parsed = new URL(input); }
  catch { throw new Error('Geçerli bir http:// veya https:// adresi girin.'); }

  if (!['https:', 'http:'].includes(parsed.protocol)) {
    throw new Error('Turkish-TTS için yalnızca HTTP veya HTTPS kullanılabilir.');
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('Sunucu adresinde kullanıcı bilgisi, sorgu veya # bulunamaz.');
  }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname.toLowerCase());
  if (parsed.protocol === 'http:' && !loopback) {
    throw new Error('Uzak sunucular HTTPS kullanmalıdır. HTTP yalnızca localhost için desteklenir.');
  }
  // Keep optional reverse-proxy base paths but do not append an endpoint twice.
  const path = parsed.pathname.replace(/\/+$/, '');
  return parsed.origin + path;
}

function friendlyNetworkError(error) {
  if (error?.name === 'AbortError') throw error;
  if (error instanceof TypeError) {
    throw new Error('Turkish-TTS sunucusuna bağlanılamadı. Adresi, HTTPS ve CORS ayarlarını kontrol edin.');
  }
  throw error;
}

export async function checkTurkishTtsReady(url, { fetchImpl = fetch, signal } = {}) {
  const base = normalizeTurkishTtsUrl(url);
  let response;
  try {
    response = await fetchImpl(`${base}/ready`, { method: 'GET', signal, headers: { Accept: 'application/json' } });
  } catch (error) { friendlyNetworkError(error); }
  if (!response.ok) throw new Error(`Turkish-TTS sunucusu hazır değil (HTTP ${response.status}).`);
  let data;
  try { data = await response.json(); }
  catch { throw new Error('Sunucu /ready yolundan geçerli JSON dönmedi.'); }
  if (data?.ready !== true) throw new Error('Turkish-TTS sunucusu model yüklemeyi henüz tamamlamadı.');
  return data;
}

export async function synthesizeWithTurkishTts(text, url, { fetchImpl = fetch, signal } = {}) {
  const input = String(text ?? '').trim();
  if (!input || input.length > 5000) throw new Error('Metin 1–5000 karakter arasında olmalıdır.');
  const base = normalizeTurkishTtsUrl(url);

  let response;
  try {
    response = await fetchImpl(`${base}/v1/tts`, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json', Accept: 'audio/wav' },
      body: JSON.stringify({ text: input })
    });
  } catch (error) { friendlyNetworkError(error); }

  if (!response.ok) {
    if (response.status === 503) throw new Error('Turkish-TTS sunucusu meşgul veya hazır değil (503).');
    if (response.status === 422) throw new Error('Turkish-TTS gönderilen metni kabul etmedi (422).');
    throw new Error(`Turkish-TTS ses üretimi başarısız (HTTP ${response.status}).`);
  }

  const blob = await response.blob();
  if (blob.size < 44) throw new Error('Turkish-TTS sunucusu geçerli bir WAV dosyası döndürmedi.');
  const bytes = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  const signature = String.fromCharCode(...bytes);
  if (!signature.startsWith('RIFF') || signature.slice(8, 12) !== 'WAVE') {
    throw new Error('Turkish-TTS yanıtı WAV biçiminde değil.');
  }
  return new Blob([blob], { type: 'audio/wav' });
}
