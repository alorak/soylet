import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MODELS, DEFAULT_MODEL_ID, VOICE_STYLES } from '../src/models.js';
import { availableModels, chooseAvailableModel, modelVoices, SPEED_OPTIONS } from '../src/quick-controls.js';

test('homepage shows only downloaded models, preserving catalogue order', () => {
  const downloaded = new Set(['piper-dfki', 'supertonic-3']);
  assert.deepEqual(availableModels(MODELS, downloaded).map(m => m.id),
    ['piper-dfki', 'supertonic-3']);
  assert.equal(availableModels(MODELS, new Set()).length, 0);
});

test('saved deleted model falls back to a downloaded model', () => {
  assert.equal(
    chooseAvailableModel('supertonic-3', MODELS, new Set(['piper-fahrettin']), DEFAULT_MODEL_ID),
    'piper-fahrettin'
  );
  assert.equal(
    chooseAvailableModel('piper-dfki', MODELS, new Set(['piper-dfki','piper-fettah']), DEFAULT_MODEL_ID),
    'piper-dfki'
  );
  assert.equal(
    chooseAvailableModel('deleted-id', MODELS, new Set(['piper-dfki','piper-fettah']), DEFAULT_MODEL_ID),
    DEFAULT_MODEL_ID
  );
  assert.equal(
    chooseAvailableModel('deleted-id', MODELS, new Set(), DEFAULT_MODEL_ID),
    DEFAULT_MODEL_ID
  );
});

test('advanced voices are exposed only when the selected engine supports them', () => {
  assert.deepEqual(modelVoices(MODELS.find(m => m.id === 'piper-fettah'), VOICE_STYLES), []);
  const supertonic = MODELS.find(m => m.id === 'supertonic-3');
  assert.deepEqual(modelVoices(supertonic, VOICE_STYLES), VOICE_STYLES);
});

test('homepage speed choices match the settings slider increments', () => {
  assert.equal(SPEED_OPTIONS.length, 13);
  assert.equal(SPEED_OPTIONS[0], '0.75');
  assert.equal(SPEED_OPTIONS.at(-1), '1.35');
  assert.ok(SPEED_OPTIONS.includes('1.00'));
  assert.equal(new Set(SPEED_OPTIONS).size, SPEED_OPTIONS.length);
});
