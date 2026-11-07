import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const script = read('local-tts/manage.sh');
const compose = read('local-tts/compose.yaml');
const dockerfile = read('local-tts/Dockerfile');
const html = read('index.html');
const main = read('src/main.js');
const guide = read('docs/turkish-tts-local.md');
const architecture = read('docs/turkish-tts-local-architecture.md');

test('P1 container exposes Turkish-TTS on loopback only', () => {
  assert.match(compose, /127\.0\.0\.1:8000:8000/);
  assert.doesNotMatch(compose, /^\s+-\s+["']?8000:8000/m);
  assert.match(compose, /TTS_MODEL_MODEL_PATH: Trendyol\/Trendyol-TTS/);
  assert.match(compose, /HF_HOME: \/cache\/huggingface/);
  assert.match(compose, /hf-cache:\/cache\/huggingface/);
  assert.match(compose, /capabilities: \[gpu\]/);
  assert.match(compose, /TTS_API_CORS_ALLOWED_ORIGINS/);
  assert.match(compose, /https:\/\/alorak\.github\.io/);
  assert.doesNotMatch(compose, /\["\*"\]/);
});

test('local installer pins upstream and supports explicit download / start / stop without deleting cache', () => {
  assert.match(script, /REVISION="[a-f0-9]{40}"/);
  assert.match(script, /https:\/\/github\.com\/Boran-Sert\/Turkish-TTS\.git/);
  assert.match(script, /git -C "\$UPSTREAM" checkout --detach "\$REVISION"/);
  assert.match(script, /turkish-tts-fetch --model Trendyol\/Trendyol-TTS/);
  assert.match(script, /compose run --rm tts/);
  assert.match(script, /compose up -d tts/);
  assert.match(script, /compose down\s*\n/);
  assert.doesNotMatch(script, /compose down -v\s*\n/);
  assert.match(script, /\bdoctor\)/);
  assert.match(script, /\bsetup\)/);
  assert.match(script, /\bdownload\)/);
  assert.match(script, /\bstart\)/);
  assert.match(script, /\bstatus\)/);
  assert.match(script, /\blogs\)/);
  assert.match(script, /\bstop\)/);
});

test('Dockerfile installs complete upstream package before invoking API', () => {
  assert.match(compose, /dockerfile: \.\.\/Dockerfile/);
  assert.match(dockerfile, /FROM nvidia\/cuda:/);
  assert.match(dockerfile, /COPY src\/ \.\/src\//);
  assert.match(dockerfile, /RUN pip install --no-cache-dir torch==2\.5\.1/);
  assert.match(dockerfile, /pip install --no-cache-dir \./);
  assert.match(dockerfile, /CMD \["turkish-tts-server"\]/);
});

test('web UI does not claim to install native model; user explicitly selects localhost', () => {
  assert.match(html, /id="tts-api-local"/);
  assert.match(html, /Yerel GPU kurulum rehberi/);
  assert.match(html, /docs\/turkish-tts-local\.md/);
  assert.match(main, /const LOCAL_TTS_URL = 'http:\/\/127\.0\.0\.1:8000'/);
  assert.match(main, /'tts-api-local'\)\.addEventListener\('click'/);
  assert.match(main, /'tts-api-url'\)\.value = LOCAL_TTS_URL/);
  assert.match(main, /Bağlantıyı kontrol et ve Kaydet ve seç/);
  assert.doesNotMatch(main, /child_process|execSync|spawn\(/);
});

test('documented support, data flow and known constraints are explicit', () => {
  for (const term of ['WSL2', 'macOS', 'NVIDIA', '127.0.0.1:8000', 'Docker', 'CORS', 'P2']) {
    assert.ok(guide.includes(term), `Guide missing ${term}`);
  }
  assert.match(architecture, /kendi CUDA GPU bilgisayarında/);
  assert.match(architecture, /doğrulama/);
  assert.match(read('.gitignore'), /local-tts\/upstream\//);
});
