import './styles.css';
import { DEFAULT_MODEL_ID, MODELS, VOICE_STYLES, getModel, installedModelIds, downloadModel, removeModel, storageSupported } from './models.js';
import { synthesize, forgetEngine } from './tts.js';
import { normalizeTurkishTtsUrl, checkTurkishTtsReady } from './turkish-tts-api.js';
import { decodeAudio, makeWav, makeMp3, saveFile } from './audio.js';
import { chooseAvailableModel, modelVoices, modelMenuChoices } from './quick-controls.js';
import { createPicker, closePickers } from './pickers.js';

const $ = id => document.getElementById(id);
const STORAGE_KEY = 'soylet-settings-v1';
const saved = (() => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
  catch { return {}; }
})();
const state = {
  modelId: getModel(saved.modelId) ? saved.modelId : DEFAULT_MODEL_ID,
  voice: VOICE_STYLES.includes(saved.voice) ? saved.voice : 'F1',
  speed: Number.isFinite(saved.speed) && saved.speed >= 0.75 && saved.speed <= 1.35 ? saved.speed : 1,
  apiUrl: (() => {
    try { return saved.apiUrl ? normalizeTurkishTtsUrl(saved.apiUrl) : ''; }
    catch { return ''; }
  })(),
  installed: new Set(),
  busy: false,
  controller: null,
  audio: null,
  objectUrl: null
};
const textInput = $('text-input');
const player = $('audio-player');

function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({
    modelId: state.modelId, voice: state.voice, speed: state.speed, apiUrl: state.apiUrl
  })); } catch {}
}
function clearResult() {
  player.pause();
  player.removeAttribute('src');
  player.load();
  if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
  state.objectUrl = null;
  state.audio = null;
  $('audio-result').hidden = true;
  $('wav-button').disabled = true;
  $('mp3-button').disabled = true;
}
function showError(message) {
  $('error-box').textContent = message;
  $('error-box').hidden = false;
}
function clearError() { $('error-box').hidden = true; }
function showActivity(message, percent = null, cancellable = false, cancelLabel = 'İndirmeyi iptal et') {
  $('activity').hidden = false;
  $('activity-text').textContent = message;
  $('activity-percent').textContent = percent == null ? '' : `${Math.max(0, Math.min(100, percent))}%`;
  $('activity-bar').style.width = `${percent ?? 18}%`;
  $('cancel-download').hidden = !cancellable;
  $('cancel-download').textContent = cancelLabel;
}
function hideActivity() { $('activity').hidden = true; $('cancel-download').hidden = true; }
function refreshBusy() {
  $('speak-button').disabled = state.busy || !textInput.value.trim();
  $('speak-button').innerHTML = state.busy ? 'Ses hazırlanıyor…' : '<span aria-hidden="true">▶</span> Seslendir';
  $('wav-button').disabled = state.busy || !state.audio;
  $('mp3-button').disabled = state.busy || !state.audio;
  textInput.disabled = state.busy;
  $('clear-text').disabled = state.busy;
  renderQuickControls();
  renderModels();
}
function setBusy(busy) { state.busy = busy; refreshBusy(); }
function modelIsAvailable(id) {
  return id === 'turkish-tts-api' ? Boolean(state.apiUrl) : state.installed.has(id);
}
function activeModelIds() {
  const ids = new Set(state.installed);
  if (state.apiUrl) ids.add('turkish-tts-api');
  return ids;
}
const modelPicker = createPicker({
  trigger: $('quick-model-trigger'),
  popover: $('quick-model-options'),
  control: $('quick-model-control'),
  type: 'model',
  onSelect: (choice) => {
    if (choice.installed) {
      selectModel(choice.id);
      return;
    }
    // A model that is not downloaded stays unavailable until installed.
    // Direct the user to the matching green download button on the Models page.
    showPage('models');
    const index = MODELS.findIndex(model => model.id === choice.id);
    const card = $('model-list').children[index];
    card?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    card?.querySelector('.small-button.download, .small-button.api-configure')?.focus({ preventScroll: true });
  }
});
const voicePicker = createPicker({
  trigger: $('quick-voice-trigger'),
  popover: $('quick-voice-options'),
  control: $('quick-voice-control'),
  type: 'voice',
  onSelect: (choice) => {
    if (state.busy || state.voice === choice.id) return;
    state.voice = choice.id;
    updateVoiceOptions();
    persist();
    clearResult();
  }
});

function updateSpeedSlider() {
  const slider = $('quick-speed-range');
  slider.value = String(state.speed);
  slider.style.setProperty('--speed-fill', `${((state.speed - 0.75) / 0.60) * 100}%`);
  $('quick-speed-value').value = `${state.speed.toFixed(2)}×`;
}
function renderQuickControls() {
  const chosen = getModel(state.modelId);
  const downloaded = activeModelIds();
  modelPicker.setChoices(modelMenuChoices(MODELS, downloaded, state.modelId), state.modelId);
  $('quick-model-value').textContent = chosen
    ? `${chosen.title}${downloaded.has(chosen.id) ? '' : chosen.engine === 'turkish-tts-api' ? ' · API ayarla' : ' · Aktif edilmeli'}`
    : 'Model seç';
  $('quick-model-trigger').disabled = state.busy;

  const voices = modelVoices(chosen, VOICE_STYLES);
  $('quick-voice-control').hidden = voices.length === 0;
  voicePicker.setChoices(voices.map(voice => ({
    id: voice,
    label: `${voice.startsWith('F') ? 'Kadın' : 'Erkek'} ${voice.slice(1)} (${voice})`,
    status: voice === state.voice ? 'Seçili' : '',
    installed: true
  })), state.voice);
  $('quick-voice-value').textContent =
    `${state.voice.startsWith('F') ? 'Kadın' : 'Erkek'} ${state.voice.slice(1)} (${state.voice})`;
  $('quick-voice-trigger').disabled = state.busy || !voices.length;
  $('quick-speed-range').disabled = state.busy;
  updateSpeedSlider();
}
function renderModels() {
  const root = $('model-list');
  root.replaceChildren();
  for (const model of MODELS) {
    const installed = modelIsAvailable(model.id);
    const isApi = model.engine === 'turkish-tts-api';
    const selected = model.id === state.modelId;
    const card = document.createElement('div');
    card.className = `model-row${!installed ? ' not-installed' : selected ? ' active' : ''}`;
    const icon = document.createElement('span');
    icon.className = 'model-icon';
    icon.textContent = model.engine === 'piper' ? '♫' : '◉';
    const info = document.createElement('div');
    info.className = 'model-info';
    const title = document.createElement('h3');
    title.append(document.createTextNode(model.title));
    const badge = document.createElement('span');
    badge.className = `model-badge${installed ? ' installed' : ''}`;
    badge.textContent = installed && selected ? 'Varsayılan' : isApi ? (installed ? 'API tanımlı' : 'API ayarla') : installed ? 'İndirildi' : 'İndirilmedi';
    title.append(badge);
    const description = document.createElement('p');
    description.textContent = `${model.summary} · ${model.size}`;
    info.append(title, description);
    const actions = document.createElement('div');
    actions.className = 'model-buttons';
    const action = (label, className, callback) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `small-button ${className}`;
      button.textContent = label;
      button.disabled = state.busy;
      button.addEventListener('click', callback);
      actions.append(button);
    };
    if (installed) {
      if (!selected) action('Varsayılan seç', 'primary', () => selectModel(model.id));
      if (isApi) {
        action('API ayarları', 'api-configure', () => openApiConfig());
        action('Bağlantıyı kaldır', 'delete', () => removeApiConfig());
      } else {
        action('Sil', 'delete', () => deleteModel(model));
      }
    } else if (isApi) {
      action('API ayarla', 'api-configure', () => openApiConfig());
    } else {
      action('↓ İndir', 'download', () => installModel(model));
    }
    card.append(icon, info, actions);
    root.append(card);
  }
}
// Voice and speed are selected exclusively on the homepage.
function updateVoiceOptions() {
  renderQuickControls();
}
function selectModel(id) {
  if (state.busy || !modelIsAvailable(id)) return;
  state.modelId = id;
  persist();
  clearResult();
  clearError();
  updateVoiceOptions();
  renderModels();
}
function showPage(page) {
  const models = page === 'models';
  closePickers();
  $('home-page').hidden = models;
  $('models-page').hidden = !models;
  $('models-link').setAttribute('aria-expanded', String(models));
  const target = models ? $('models-page') : $('home-page');
  const anchor = models ? target.querySelector('.settings-section') : $('audio-result');
  target.insertBefore($('activity'), anchor);
  target.insertBefore($('error-box'), anchor);
  if (models) renderModels();
  window.scrollTo({ top: 0, behavior: 'instant' });
}
async function installModel(model, chooseAfter = false) {
  if (state.busy) return;
  clearError();
  setBusy(true);
  const controller = new AbortController();
  state.controller = controller;
  try {
    showActivity(`${model.title} indiriliyor…`, 0, true);
    await downloadModel(model, ({ filename, percent }) => {
      showActivity(`${model.title} · ${filename}`, percent, true);
    }, controller.signal);
    state.installed.add(model.id);
    const nextModel = chooseAfter
      ? model.id
      : chooseAvailableModel(state.modelId, MODELS, activeModelIds(), DEFAULT_MODEL_ID);
    if (nextModel !== state.modelId) {
      state.modelId = nextModel;
        clearResult();
      updateVoiceOptions();
      persist();
    }
    renderQuickControls();
    showActivity(`${model.title} indirildi, kullanıma hazır.`, 100);
  } catch (error) {
    if (error?.name === 'AbortError') showError('İndirme iptal edildi. İstersen kaldığı dosyadan devam edebilirsin.');
    else showError(error?.message || 'Model indirilirken bir hata oluştu.');
  } finally {
    state.controller = null;
    setBusy(false);
    window.setTimeout(() => { if (!state.busy) hideActivity(); }, 1800);
  }
}
async function deleteModel(model) {
  if (state.busy || !window.confirm(`${model.title} modelini bu tarayıcıdan silmek istiyor musun?`)) return;
  clearError();
  setBusy(true);
  try {
    await forgetEngine(model.id);
    await removeModel(model);
    state.installed.delete(model.id);
    if (state.modelId === model.id) {
      state.modelId = chooseAvailableModel(state.modelId, MODELS, activeModelIds(), DEFAULT_MODEL_ID);
        updateVoiceOptions();
      persist();
    }
    clearResult();
    renderQuickControls();
  } catch (error) {
    showError(error?.message || 'Model silinemedi.');
  } finally {
    setBusy(false);
  }
}
async function speak() {
  if (state.busy) return;
  const text = textInput.value.trim();
  if (!text) return showError('Seslendirmek için bir metin yazın.');
  clearError();
  clearResult();
  const model = getModel(state.modelId);
  const isApi = model.engine === 'turkish-tts-api';
  if (!modelIsAvailable(model.id)) {
    if (isApi) { openApiConfig(); return; }
    await installModel(model, false);
    if (!modelIsAvailable(model.id)) return;
  }
  const controller = isApi ? new AbortController() : null;
  state.controller = controller;
  setBusy(true);
  try {
    showActivity('Ses modeli hazırlanıyor…', null, isApi, 'Seslendirmeyi iptal et');
    const started = performance.now();
    const result = await synthesize(model, text, {
      voice: state.voice, speed: state.speed, apiUrl: state.apiUrl, signal: controller?.signal
    }, msg => showActivity(msg, null, isApi, 'Seslendirmeyi iptal et'));
    showActivity('Ses dosyası hazırlanıyor…');
    const audio = await decodeAudio(result.blob, result.nativeSpeed ? 1 : state.speed);
    const wav = makeWav(audio);
    state.audio = { ...audio, wav, model: model.id };
    state.objectUrl = URL.createObjectURL(wav);
    player.src = state.objectUrl;
    $('audio-result').hidden = false;
    $('audio-details').textContent = `${audio.duration.toFixed(1)} saniye · ${((performance.now() - started) / 1000).toFixed(1)} saniyede üretildi`;
    hideActivity();
    try { await player.play(); } catch {
      $('audio-details').textContent += ' · Oynatmak için ▶ tuşuna bas';
    }
  } catch (error) {
    hideActivity();
    showError(error?.name === 'AbortError' ? 'Seslendirme iptal edildi.' : error?.message || 'Ses üretimi başarısız.');
  } finally {
    state.controller = null;
    setBusy(false);
  }
}
async function downloadSound(format) {
  if (state.busy || !state.audio) return;
  clearError();
  setBusy(true);
  try {
    showActivity(format === 'mp3' ? 'MP3 dosyası kodlanıyor…' : 'WAV dosyası hazırlanıyor…');
    const blob = format === 'mp3' ? await makeMp3(state.audio) : state.audio.wav;
    saveFile(blob, `soylet-${Date.now()}.${format}`);
  } catch (error) {
    showError(error?.message || 'Ses dosyası kaydedilemedi.');
  } finally {
    hideActivity();
    setBusy(false);
  }
}
function openApiConfig() {
  if (state.busy) return;
  showPage('models');
  $('tts-api-panel').hidden = false;
  $('tts-api-url').value = state.apiUrl || '';
  $('tts-api-status').textContent = '';
  $('tts-api-url').focus();
}
function removeApiConfig() {
  if (state.busy || !state.apiUrl || !window.confirm('Turkish-TTS API bağlantısını kaldırmak istiyor musunuz?')) return;
  state.apiUrl = '';
  if (state.modelId === 'turkish-tts-api') {
    state.modelId = chooseAvailableModel(state.modelId, MODELS, activeModelIds(), DEFAULT_MODEL_ID);
  }
  persist();
  clearResult();
  clearError();
  $('tts-api-panel').hidden = true;
  renderQuickControls();
  renderModels();
}
$('tts-api-form').addEventListener('submit', event => {
  event.preventDefault();
  if (state.busy) return;
  try {
    state.apiUrl = normalizeTurkishTtsUrl($('tts-api-url').value);
    persist();
    selectModel('turkish-tts-api');
    $('tts-api-status').textContent = 'API tanımlandı. Seslendir düğmesine basıldığında metin bu sunucuya gönderilir.';
    renderQuickControls();
    renderModels();
  } catch (error) {
    $('tts-api-status').textContent = error.message;
  }
});
$('tts-api-check').addEventListener('click', async () => {
  if (state.busy) return;
  const status = $('tts-api-status');
  status.textContent = 'Sunucunun hazır olma durumu kontrol ediliyor…';
  $('tts-api-check').disabled = true;
  try {
    const ready = await checkTurkishTtsReady($('tts-api-url').value);
    status.textContent = `Sunucu hazır · Model havuzu: ${ready.pool_size ?? 'bilinmiyor'}`;
  } catch (error) {
    status.textContent = error.message;
  } finally {
    $('tts-api-check').disabled = false;
  }
});

$('home-link').addEventListener('click', () => showPage('home'));
$('models-link').addEventListener('click', () => showPage($('models-page').hidden ? 'models' : 'home'));
textInput.addEventListener('input', () => {
  $('character-count').textContent = `${textInput.value.length} karakter`;
  clearResult(); clearError(); refreshBusy();
});
$('clear-text').addEventListener('click', () => {
  textInput.value = ''; textInput.dispatchEvent(new Event('input')); textInput.focus();
});
$('speak-button').addEventListener('click', speak);
$('wav-button').addEventListener('click', () => downloadSound('wav'));
$('mp3-button').addEventListener('click', () => downloadSound('mp3'));
$('cancel-download').addEventListener('click', () => state.controller?.abort());
$('quick-speed-range').addEventListener('input', event => setSpeed(event.target.value));
function setSpeed(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return;
  state.speed = Math.min(1.35, Math.max(0.75, Math.round(parsed * 20) / 20));
  updateSpeedSlider();
  persist();
  clearResult();
}
async function initialize() {
  updateVoiceOptions();
  refreshBusy();
  if (!storageSupported()) {
    showError('Modelleri saklamak için HTTPS veya localhost üzerinden açmalısın. Güncel bir tarayıcı kullan.');
    return;
  }
  try {
    state.installed = new Set(await installedModelIds());
    const current = chooseAvailableModel(state.modelId, MODELS, activeModelIds(), DEFAULT_MODEL_ID);
    if (state.modelId !== current) {
      state.modelId = current;
        persist();
    }
    updateVoiceOptions();
    renderModels();
    if (typeof navigator.storage.persist === 'function') {
      navigator.storage.persist().catch(() => {});
    }
  } catch (error) {
    showError(`Model deposu okunamadı: ${error?.message || 'bilinmeyen hata'}`);
  }
}
initialize();
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(error => {
      console.warn('Çevrimdışı uygulama önbelleği etkinleştirilemedi:', error);
    });
  });
}
