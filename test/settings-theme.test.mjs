import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const script = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

test('brand is a clickable text-only home button', () => {
  const brand = html.match(/<button class="brand"[^>]*>.*?<\/button>/s)?.[0];
  assert.ok(brand);
  assert.match(brand, /id="home-link"/);
  assert.match(brand, /söylet<span class="brand-dot">\.<\/span>/);
  assert.doesNotMatch(brand, /brand-icon|<svg|<img/);
  assert.match(script, /\$\('home-link'\)\.addEventListener\('click'/);
});

test('Models page opens directly on model list without the old settings introduction', () => {
  for (const removed of ['back-button', 'KİŞİSELLEŞTİR', 'Seslendirmeye dön',
    'Ses modellerini yönet ve konuşma şeklini ayarla.']) {
    assert.ok(!html.includes(removed), `Redundant text remains: ${removed}`);
    assert.ok(!script.includes("$('back-button')"));
  }
  assert.match(html, /id="models-page"[^>]*aria-label="Modeller"/);
  assert.match(html, /id="models-link"[^>]*aria-controls="models-page"/);
  assert.doesNotMatch(html, /<h2>Ses ayarları<\/h2>|id="speed-range"|id="voice-select"|id="tone-select"/);
  assert.match(html, /<h2>Ses modelleri<\/h2>/);
});

test('only undownloaded models are gray, downloads green and selection explicit', () => {
  assert.match(script, /!installed \? ' not-installed' : selected \? ' active'/);
  assert.match(script, /action\('↓ İndir', 'download', \(\) => installModel\(model\)\)/);
  assert.match(script, /action\('Varsayılan seç', 'primary', \(\) => selectModel\(model\.id\)\)/);
  assert.match(script, /selected \? 'Varsayılan'/);
  assert.match(css, /\.model-row\.not-installed\{/);
  assert.match(css, /\.small-button\.download\{[^}]*background:#178249/);
});

test('navy is the app accent, and old purple accent is gone', () => {
  assert.match(css, /\.brand-dot\{color:#1d4e86\}/);
  assert.match(css, /\.primary-button,[^\n]*\{background:#193f73/);
  assert.ok(!/#(?:6655ea|6350ea|6755ed|6956ed|efeaff)/i.test(css));
});
