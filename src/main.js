import './styles.css';
import { DEFAULT_MODEL_ID, MODELS, VOICE_STYLES, getModel, installedModelIds, downloadModel, removeModel, storageSupported } from './models.js';
import { synthesize, forgetEngine } from './tts.js';
import { decodeAudio, makeWav, makeMp3, saveFile } from './audio.js';

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
  toneGroup: 'all',
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
    modelId: state.modelId, voice: state.voice, speed: state.speed
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
function showActivity(message, percent = null, cancellable = false) {
  $('activity').hidden = false;
  $('activity-text').textContent = message;
  $('activity-percent').textContent = percent == null ? '' : `${Math.max(0, Math.min(100, percent))}%`;
  $('activity-bar').style.width = `${percent ?? 18}%`;
  $('cancel-download').hidden = !cancellable;
}
function hideActivity() { $('activity').hidden = true; $('cancel-download').hidden = true; }
function refreshBusy() {
  $('speak-button').disabled = state.busy || !textInput.value.trim();
  $('speak-button').innerHTML = state.busy ? 'Ses hazırlanıyor…' : '<span aria-hidden="true">▶</span> Seslendir';
  $('wav-button').disabled = state.busy || !state.audio;
  $('mp3-button').disabled = state.busy || !state.audio;
  textInput.disabled = state.busy;
  $('clear-text').disabled = state.busy;
  $('speed-range').disabled = state.busy;
  $('voice-select').disabled = state.busy;
  $('tone-select').disabled = state.busy;
  renderModels();
}
function setBusy(busy) { state.busy = busy; refreshBusy(); }
function modelIsAvailable(id) { return state.installed.has(id); }
function refreshActiveLabel() {
  const model = getModel(state.modelId);
  $('active-model-label').textContent = model.title;
  $('active-voice-label').textContent = model.engine === 'supertonic' ? `${state.voice} · Türkçe` : 'Türkçe';
}
function renderModels() {
  const root = $('model-list');
  root.replaceChildren();
  for (const model of MODELS) {
    const installed = modelIsAvailable(model.id);
    const selected = model.id === state.modelId;
    const card = document.createElement('div');
    card.className = `model-row${selected ? ' active' : ''}`;
    const icon = document.createElement('span');
    icon.className = 'model-icon';
    icon.textContent = model.engine === 'piper' ? '♫' : '◉';
    const info = document.createElement('div');
    info.className = 'model-info';
    const title = document.createElement('h3');
    title.append(document.createTextNode(model.title));
    const badge = document.createElement('span');
    badge.className = `model-badge${installed ? ' installed' : ''}`;
    badge.textContent = selected && installed ? 'Aktif' : installed ? 'İndirildi' : 'İndirilmedi';
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
      if (!selected) action('Seç', 'primary', () => selectModel(model.id));
      action('Sil', 'delete', () => deleteModel(model));
    } else {
      action('↓ İndir', 'primary', () => installModel(model, true));
    }
    card.append(icon, info, actions);
    root.append(card);
  }
}
function updateVoiceOptions() {
  const model = getModel(state.modelId);
  const isSupertonic = model.engine === 'supertonic';
  $('voice-setting').hidden = !isSupertonic;
  $('tone-setting').hidden = !isSupertonic;
  $('speed-hint').textContent = isSupertonic
    ? 'Modelin doğal konuşma temposu'
    : 'Hız değişimi ses perdesini de az miktarda etkiler';
  $('controls-note').textContent = isSupertonic
    ? 'Kadın/erkek seçenekleri modelin 10 hazır ses karakteridir. Çocuk sesi veya bağımsız perde kontrolü bulunmaz.'
    : 'Piper tek sesli bir modeldir. Gerçek çocuk sesi, bağımsız ince/kalın ton veya başka bir ses karakteri desteklemez.';
  const select = $('voice-select');
  const group = $('tone-select');
  group.value = state.toneGroup;
  const filtered = VOICE_STYLES.filter(voice => state.toneGroup === 'all' || voice.startsWith(state.toneGroup));
  if (!filtered.includes(state.voice)) state.voice = filtered[0];
  select.replaceChildren();
  for (const voice of filtered) {
    const option = document.createElement('option');
    option.value = voice;
    option.textContent = `${voice.startsWith('F') ? 'Kadın' : 'Erkek'} ${voice.slice(1)} (${voice})`;
    select.append(option);
  }
  select.value = state.voice;
  $('speed-range').value = String(state.speed);
  $('speed-value').value = `${state.speed.toFixed(2)}×`;
  refreshActiveLabel();
}
function selectModel(id) {
  if (state.busy || !modelIsAvailable(id)) return;
  state.modelId = id;
  state.toneGroup = 'all';
  persist();
  clearResult();
  clearError();
  updateVoiceOptions();
  renderModels();
}
function showPage(page) {
  const settings = page === 'settings';
  $('home-page').hidden = settings;
  $('settings-page').hidden = !settings;
  $('settings-link').setAttribute('aria-expanded', String(settings));
  const target = settings ? $('settings-page') : $('home-page');
  const anchor = settings ? target.querySelector('.settings-section') : $('audio-result');
  target.insertBefore($('activity'), anchor);
  target.insertBefore($('error-box'), anchor);
  if (settings) renderModels();
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
    if (chooseAfter) {
      state.modelId = model.id;
      state.toneGroup = 'all';
      clearResult();
      updateVoiceOptions();
      persist();
    }
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
      state.modelId = DEFAULT_MODEL_ID;
      if (!state.installed.has(state.modelId) && state.installed.size) state.modelId = [...state.installed][0];
      state.toneGroup = 'all';
      updateVoiceOptions();
      persist();
    }
    clearResult();
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
  if (!modelIsAvailable(model.id)) {
    await installModel(model, false);
    if (!modelIsAvailable(model.id)) return;
  }
  setBusy(true);
  try {
    showActivity('Ses modeli hazırlanıyor…');
    const started = performance.now();
    const result = await synthesize(model, text, { voice: state.voice, speed: state.speed },
      msg => showActivity(msg));
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
    showError(error?.message || 'Ses üretimi başarısız.');
  } finally {
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
$('home-link').addEventListener('click', () => showPage('home'));
$('settings-link').addEventListener('click', () => showPage($('settings-page').hidden ? 'settings' : 'home'));
$('back-button').addEventListener('click', () => showPage('home'));
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
$('voice-select').addEventListener('change', event => {
  state.voice = event.target.value; persist(); clearResult(); refreshActiveLabel();
});
$('tone-select').addEventListener('change', event => {
  state.toneGroup = event.target.value; updateVoiceOptions(); persist(); clearResult();
});
$('speed-range').addEventListener('input', event => {
  state.speed = Number(event.target.value);
  $('speed-value').value = `${state.speed.toFixed(2)}×`;
  persist(); clearResult();
});
async function initialize() {
  updateVoiceOptions();
  refreshBusy();
  if (!storageSupported()) {
    showError('Modelleri saklamak için HTTPS veya localhost üzerinden açmalısın. Güncel bir tarayıcı kullan.');
    return;
  }
  try {
    state.installed = new Set(await installedModelIds());
    renderModels();
    if (typeof navigator.storage.persist === 'function') {
      navigator.storage.persist().catch(() => {});
    }
  } catch (error) {
    showError(`Model deposu okunamadı: ${error?.message || 'bilinmeyen hata'}`);
  }
}
initialize();
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(error => {
      console.warn('Çevrimdışı uygulama önbelleği etkinleştirilemedi:', error);
    });
  });
}
