/**
 * Web Audio API synthesizer for the HorrorWriter Coven Sanctuary Editor.
 * 100% client-side, synthesized in real-time with zero external audio assets.
 */

let audioCtx = null;
let ambientGain = null;
let ambientSource = null;
let currentAmbientType = 'off';

function getContext() {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) {
      audioCtx = new AudioContext();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

/**
 * Synthesizes a tactile mechanical typewriter keystroke.
 * Includes subtle pitch variation so consecutive keystrokes feel organic.
 */
export function playTypewriterKey(isEnter = false) {
  const ctx = getContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  if (isEnter) {
    // Heavy mechanical carriage return + classic bell chime
    // 1. Mechanical clunk
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.12);
    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.13);

    // 2. High metallic bell ding
    const bell = ctx.createOscillator();
    const bellGain = ctx.createGain();
    bell.type = 'sine';
    bell.frequency.setValueAtTime(1860, now + 0.02);
    bellGain.gain.setValueAtTime(0.18, now + 0.02);
    bellGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
    bell.connect(bellGain);
    bellGain.connect(ctx.destination);
    bell.start(now + 0.02);
    bell.stop(now + 0.46);
    return;
  }

  // Regular typewriter key
  // Noise burst (the hammer strike)
  const bufferSize = Math.floor(ctx.sampleRate * 0.04);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.25));
  }

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  // Randomize pitch slightly around 950Hz
  filter.frequency.value = 850 + Math.random() * 250;
  filter.Q.value = 3.5;

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.22, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

  noise.connect(filter);
  filter.connect(noiseGain);
  noiseGain.connect(ctx.destination);

  noise.start(now);

  // Deep subtle mechanical spring thud
  const thud = ctx.createOscillator();
  const thudGain = ctx.createGain();
  thud.type = 'triangle';
  thud.frequency.setValueAtTime(180 + Math.random() * 40, now);
  thud.frequency.exponentialRampToValueAtTime(45, now + 0.04);
  thudGain.gain.setValueAtTime(0.18, now);
  thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

  thud.connect(thudGain);
  thudGain.connect(ctx.destination);

  thud.start(now);
  thud.stop(now + 0.05);
}

/**
 * Creates continuous ambient noise (Midnight Rain or Tape Hum)
 */
function createNoiseNode(ctx, type) {
  const bufferSize = ctx.sampleRate * 2;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const output = buffer.getChannelData(0);

  if (type === 'rain') {
    // Pink noise approximation for rain
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      output[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    }
  } else {
    // Brown noise for low tape flutter
    let lastOut = 0.0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      output[i] = (lastOut + (0.02 * white)) / 1.02;
      lastOut = output[i];
      output[i] *= 1.8;
    }
  }

  const whiteNoise = ctx.createBufferSource();
  whiteNoise.buffer = buffer;
  whiteNoise.loop = true;
  return whiteNoise;
}

export function setAmbientSound(type) {
  currentAmbientType = type;
  const ctx = getContext();
  if (!ctx) return;

  // Stop any existing ambient sound
  if (ambientSource) {
    try {
      if (ambientGain) {
        ambientGain.gain.linearRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      }
      setTimeout(() => {
        try {
          ambientSource?.stop();
          ambientSource?.disconnect();
          ambientSource = null;
        } catch (_) {}
      }, 350);
    } catch (_) {
      ambientSource = null;
    }
  }

  if (type === 'off' || !type) return;

  const now = ctx.currentTime;
  ambientGain = ctx.createGain();
  ambientGain.gain.setValueAtTime(0.001, now);

  if (type === 'rain') {
    const rainNoise = createNoiseNode(ctx, 'rain');
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1400; // Muffled night rain

    rainNoise.connect(filter);
    filter.connect(ambientGain);
    ambientGain.connect(ctx.destination);

    ambientGain.gain.linearRampToValueAtTime(0.18, now + 0.8);
    rainNoise.start(now);
    ambientSource = rainNoise;
  } else if (type === 'tape') {
    // 60Hz tape hum + subtle flutter
    const hum = ctx.createOscillator();
    hum.type = 'sawtooth';
    hum.frequency.setValueAtTime(60, now);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 180; // Only keep the low analog rumble

    const tapeNoise = createNoiseNode(ctx, 'tape');
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 320;

    hum.connect(filter);
    filter.connect(ambientGain);

    tapeNoise.connect(noiseFilter);
    noiseFilter.connect(ambientGain);

    ambientGain.connect(ctx.destination);
    ambientGain.gain.linearRampToValueAtTime(0.12, now + 0.8);

    hum.start(now);
    tapeNoise.start(now);
    ambientSource = {
      stop: () => {
        hum.stop();
        tapeNoise.stop();
      },
      disconnect: () => {
        hum.disconnect();
        tapeNoise.disconnect();
      }
    };
  }
}

export function getCurrentAmbientType() {
  return currentAmbientType;
}
