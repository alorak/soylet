import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeTurkishTtsUrl, checkTurkishTtsReady, synthesizeWithTurkishTts } from '../src/turkish-tts-api.js';
import { getModel, isInstalled, downloadModel } from '../src/models.js';

function minimalWav() {
  const data = new Uint8Array(44);
  data.set([82, 73, 70, 70], 0); // RIFF
  data.set([87, 65, 86, 69], 8); // WAVE
  return data;
}

test('remote API URL must be opt-in and secure; local loopback is allowed', () => {
  assert.equal(normalizeTurkishTtsUrl('  http://127.0.0.1:8000/ '), 'http://127.0.0.1:8000');
  assert.equal(normalizeTurkishTtsUrl('http://localhost:8000'), 'http://localhost:8000');
  assert.equal(normalizeTurkishTtsUrl('http://[::1]:8000'), 'http://[::1]:8000');
  assert.equal(normalizeTurkishTtsUrl('https://tts.example.com/proxy/'), 'https://tts.example.com/proxy');
  for (const url of ['', 'ftp://tts.example.com', 'http://tts.example.com',
    'https://user:secret@tts.example.com', 'https://tts.example.com?secret=x',
    'https://tts.example.com/#fragment']) {
    assert.throws(() => normalizeTurkishTtsUrl(url), Error, url);
  }
});

test('the API model is never treated as an OPFS download', async () => {
  const model = getModel('turkish-tts-api');
  assert.equal(await isInstalled(model), false);
  await assert.rejects(downloadModel(model), /sunucu adresi yapılandırın/);
});

test('ready check uses GET /ready without sending user text', async () => {
  const calls = [];
  const result = await checkTurkishTtsReady('https://tts.example.com/sub/', {
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({ ready: true, pool_size: 1 }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
  });
  assert.equal(result.pool_size, 1);
  assert.equal(calls[0].url, 'https://tts.example.com/sub/ready');
  assert.equal(calls[0].options.method, 'GET');
  assert.equal(calls[0].options.body, undefined);
});

test('synthesis sends only user text via POST and returns a playable WAV Blob', async () => {
  const calls = [];
  const audio = await synthesizeWithTurkishTts(' Merhaba dünya. ', 'http://127.0.0.1:8000', {
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response(minimalWav(), { headers: { 'Content-Type': 'audio/wav' } });
    }
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'http://127.0.0.1:8000/v1/tts');
  assert.equal(calls[0].options.method, 'POST');
  assert.deepEqual(JSON.parse(calls[0].options.body), { text: 'Merhaba dünya.' });
  assert.equal(audio.type, 'audio/wav');
  assert.equal(audio.size, 44);
});

test('API errors, invalid WAV and fetch failures are surfaced safely', async () => {
  const stub = response => ({ fetchImpl: async () => response });
  await assert.rejects(
    synthesizeWithTurkishTts('Deneme', 'https://tts.example.com', stub(new Response('', { status: 503 }))),
    /meşgul veya hazır değil/
  );
  await assert.rejects(
    synthesizeWithTurkishTts('Deneme', 'https://tts.example.com', stub(new Response(new Uint8Array(44)))),
    /WAV biçiminde değil/
  );
  await assert.rejects(
    checkTurkishTtsReady('https://tts.example.com', stub(new Response(JSON.stringify({ ready: false })))),
    /henüz tamamlamadı/
  );
  await assert.rejects(
    checkTurkishTtsReady('https://tts.example.com', {
      fetchImpl: async () => { throw new TypeError('Failed to fetch'); }
    }), /CORS/
  );
  let calls = 0;
  await assert.rejects(synthesizeWithTurkishTts('Deneme', 'http://example.com', {
    fetchImpl: async () => { calls++; }
  }), /HTTPS/);
  assert.equal(calls, 0);
});

test('UI explicitly discloses that only the selected API model sends text', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const script = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(html, /id="tts-api-panel"/);
  assert.match(html, /Seslendir<\/strong> düğmesine bastığınızda metin/);
  assert.match(script, /apiUrl: state.apiUrl/);
  assert.match(script, /model\.engine === 'turkish-tts-api'/);
});
