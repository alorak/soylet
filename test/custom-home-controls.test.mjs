import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const script = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const picker = readFileSync(new URL('../src/pickers.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

test('model and voice selectors are custom buttons rather than native comboboxes', () => {
  for (const id of ['quick-model-trigger', 'quick-voice-trigger']) {
    assert.match(html, new RegExp('<button[^>]+id="' + id + '"[^>]+aria-haspopup="listbox"'));
  }
  for (const id of ['quick-model-options', 'quick-voice-options']) {
    assert.match(html, new RegExp('id="' + id + '"[^>]+role="listbox"'));
  }
  assert.doesNotMatch(html, /id="quick-model-select"|id="quick-voice-select"/);
  assert.match(picker, /role', 'option'/);
  assert.match(picker, /ArrowDown/);
  assert.match(picker, /Escape/);
});

test('inactive models are labeled for activation and link to their download action', () => {
  assert.match(script, /modelMenuChoices\(MODELS, downloaded, state\.modelId\)/);
  assert.match(script, /if \(choice\.installed\)/);
  assert.match(script, /showPage\('settings'\)/);
  assert.match(script, /\.small-button\.download/);
});

test('homepage speed is an accessible range input synchronized with settings', () => {
  assert.match(html, /id="quick-speed-range" type="range" min="0\.75" max="1\.35" step="0\.05"/);
  assert.match(html, /id="quick-speed-value"/);
  assert.match(script, /setSpeed\(event\.target\.value\)/);
  assert.match(script, /updateSpeedSlider\(\)/);
  assert.match(css, /--speed-fill/);
  assert.doesNotMatch(html, /quick-speed-select/);
});

test('privacy statement is on the same footer line rather than its own paragraph', () => {
  assert.doesNotMatch(html, /class="privacy-note"/);
  assert.match(html, /Tarayıcında ses üret, özgürce dinle\..*Metin ve ses hiçbir sunucuya gönderilmez;/);
  assert.match(css, /\.footer\{white-space:nowrap/);
});
