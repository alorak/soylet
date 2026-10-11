import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MODELS, DEFAULT_MODEL_ID, VOICE_STYLES, getModel } from '../src/models.js';
import { makeWav } from '../src/audio.js';

test('default Turkish Piper model is present', () => {
  const model = getModel(DEFAULT_MODEL_ID);
  assert.equal(model.engine, 'piper');
  assert.equal(model.voiceId, 'tr_TR-fettah-medium');
  assert.equal(model.files.length, 2);
  assert.ok(model.files.every(file => file.url.startsWith('https://')));
});
test('models have distinct IDs and Turkish voices', () => {
  assert.equal(new Set(MODELS.map(m => m.id)).size, MODELS.length);
  assert.equal(MODELS.filter(m => m.engine === 'piper').length, 3);
  const large = getModel('supertonic-3');
  assert.equal(VOICE_STYLES.length, 10);
  assert.equal(large.files.length, 16);
});
test('writes valid 16-bit mono PCM WAV', async () => {
  const blob = makeWav({ samples: new Float32Array([0, -1, 1, 0.5]), sampleRate: 22050 });
  const view = new DataView(await blob.arrayBuffer());
  assert.equal(blob.type, 'audio/wav');
  assert.equal(view.getUint32(0, true), 0x46464952);
  assert.equal(view.getUint32(8, true), 0x45564157);
  assert.equal(view.getUint16(22, true), 1);
  assert.equal(view.getUint32(24, true), 22050);
  assert.equal(view.getUint32(40, true), 8);
  assert.equal(view.getInt16(46, true), -32768);
  assert.equal(view.getInt16(48, true), 32767);
});