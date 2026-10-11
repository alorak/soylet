import { getModelFile } from './models.js';

const runtimeBase = `${import.meta.env.BASE_URL}runtime/`;
let engine = null;

async function closeEngine() {
  if (!engine) return;
  const old = engine;
  engine = null;
  if (old.kind === 'supertonic') {
    for (const session of old.sessions) await session.release();
  }
  if (old.kind === 'piper') {
    old.SessionClass._instance = null;
  }
}

export async function forgetEngine(modelId) {
  if (!modelId || engine?.modelId === modelId) await closeEngine();
}

async function ensureEngine(model, update) {
  if (engine?.modelId === model.id) return engine;
  await closeEngine();
  if (model.engine === 'piper') {
    update?.('Piper çalışma motoru yükleniyor…');
    const { TtsSession } = await import('@mintplex-labs/piper-tts-web');
    TtsSession._instance = null; // Upstream class uses one global session for every voice.
    const session = await TtsSession.create({
      voiceId: model.voiceId,
      wasmPaths: {
        onnxWasm: runtimeBase,
        piperData: `${runtimeBase}piper_phonemize.data`,
        piperWasm: `${runtimeBase}piper_phonemize.wasm`
      }
    });
    engine = { kind: 'piper', modelId: model.id, session, SessionClass: TtsSession };
    return engine;
  }

  update?.('Supertonic ONNX modelleri belleğe alınıyor…');
  const ort = await import('onnxruntime-web');
  const { TextToSpeech, UnicodeProcessor } = await import('./vendor/supertonic-helper.js');
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.wasmPaths = runtimeBase;
  const config = JSON.parse(await (await getModelFile(model, 'tts.json')).text());
  const indexer = JSON.parse(await (await getModelFile(model, 'unicode_indexer.json')).text());
  const sessions = [];
  try {
    for (const name of ['duration_predictor.onnx','text_encoder.onnx','vector_estimator.onnx','vocoder.onnx']) {
      update?.(`Supertonic yükleniyor: ${name}`);
      const file = await getModelFile(model, name);
      sessions.push(await ort.InferenceSession.create(await file.arrayBuffer(), {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all'
      }));
    }
    engine = {
      kind: 'supertonic', modelId: model.id, sessions, styles: new Map(),
      tts: new TextToSpeech(config, new UnicodeProcessor(indexer), ...sessions)
    };
    return engine;
  } catch (error) {
    for (const session of sessions) await session.release();
    throw error;
  }
}

async function getStyle(engineInstance, model, voice) {
  const { loadVoiceStyle } = await import('./vendor/supertonic-helper.js');
  const name = /^[FM][1-5]$/.test(voice) ? voice : 'F1';
  if (engineInstance.styles.has(name)) return engineInstance.styles.get(name);
  const blob = await getModelFile(model, `${name}.json`);
  const url = URL.createObjectURL(blob);
  try {
    const style = await loadVoiceStyle([url]);
    engineInstance.styles.set(name, style);
    return style;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function synthesize(model, text, { voice = 'F1', speed = 1 } = {}, update) {
  if (!text.trim()) throw new Error('Lütfen seslendirmek istediğiniz metni yazın.');
  const instance = await ensureEngine(model, update);
  if (model.engine === 'piper') {
    update?.('Türkçe metin seslendiriliyor…');
    // Piper's browser adapter returns 16-bit WAV; speed change is applied in audio.js.
    return { blob: await instance.session.predict(text), nativeSpeed: false };
  }
  update?.('Supertonic Türkçe sesi üretiyor…');
  const style = await getStyle(instance, model, voice);
  const { writeWavFile } = await import('./vendor/supertonic-helper.js');
  const { wav, duration } = await instance.tts.call(
    text, 'tr', style, 8, speed, 0.25,
    (step, total) => update?.(`Ses üretiliyor: ${step}/${total}`)
  );
  const length = Math.max(1, Math.min(wav.length, Math.floor(instance.tts.sampleRate * duration[0])));
  const buffer = writeWavFile(wav.slice(0, length), instance.tts.sampleRate);
  return { blob: new Blob([buffer], { type: 'audio/wav' }), nativeSpeed: true };
}