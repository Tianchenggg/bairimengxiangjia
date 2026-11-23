(() => {
  'use strict';

  const storageKey = 'daydreamer.audio.enabled';
  let soundOn = true;
  let hadGesture = false;
  let context;
  let output;
  let noise;

  try {
    soundOn = localStorage.getItem(storageKey) !== 'off';
  } catch {
    // Private browsing can disable storage.
  }

  function prepare() {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context || !soundOn || !hadGesture) return null;
    try {
      if (!context || context.state === 'closed') {
        context = new Context();
        output = context.createGain();
        output.gain.value = 0.39;
        output.connect(context.destination);
        noise = context.createBuffer(1, Math.ceil(context.sampleRate * 0.34), context.sampleRate);
        const samples = noise.getChannelData(0);
        for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
      }
      if (context.state !== 'running') context.resume().catch(() => {});
      return context;
    } catch {
      return null;
    }
  }

  function unlock(event) {
    if (!event.isTrusted) return;
    hadGesture = true;
    if (soundOn) prepare();
    document.removeEventListener('pointerdown', unlock, true);
    document.removeEventListener('keydown', unlock, true);
    document.removeEventListener('touchend', unlock, true);
  }
  for (const type of ['pointerdown', 'keydown', 'touchend']) {
    document.addEventListener(type, unlock, { capture: true, passive: true });
  }

  // A short felt attack and quickly decaying upper partials keep the notes soft.
  function key(pitch, start, length, level = 1) {
    const fundamental = 440 * 2 ** ((pitch - 69) / 12);
    const partials = [[1, 0.25, 1], [2.001, 0.074, 0.53], [3.97, 0.016, 0.25]];
    for (const [ratio, strength, decay] of partials) {
      const oscillator = context.createOscillator();
      const envelope = context.createGain();
      const end = start + length * decay;
      oscillator.frequency.value = fundamental * ratio;
      envelope.gain.setValueAtTime(0.0001, start);
      envelope.gain.exponentialRampToValueAtTime(level * strength, start + 0.009);
      envelope.gain.exponentialRampToValueAtTime(0.0001, end);
      oscillator.connect(envelope);
      envelope.connect(output);
      oscillator.onended = () => {
        oscillator.disconnect();
        envelope.disconnect();
      };
      oscillator.start(start);
      oscillator.stop(end + 0.012);
    }
  }

  // A sheet brushes across the table, briefly catching on the grain mid-stroke.
  function paper(start, length, cutoff, level) {
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const envelope = context.createGain();
    source.buffer = noise;
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(cutoff, start);
    filter.frequency.exponentialRampToValueAtTime(cutoff * 1.25, start + length * 0.52);
    filter.frequency.exponentialRampToValueAtTime(cutoff * 0.64, start + length);
    filter.Q.value = 0.65;
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(level, start + length * 0.17);
    envelope.gain.exponentialRampToValueAtTime(level * 0.31, start + length * 0.41);
    envelope.gain.exponentialRampToValueAtTime(level * 0.72, start + length * 0.55);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + length);
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(output);
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      envelope.disconnect();
    };
    source.start(start, Math.random() * 0.065, length + 0.006);
  }

  // Onset, duration, center frequency, gain. Low short strokes are tabletop taps.
  const strokes = {
    select: [[0, 0.08, 1600, 0.24]],
    lock: [[0, 0.145, 1350, 0.22], [0.14, 0.045, 440, 0.32]],
    open: [[0, 0.14, 2200, 0.29], [0.104, 0.18, 1450, 0.24]],
    swap: [[0, 0.17, 1250, 0.27], [0.15, 0.21, 1730, 0.25]],
    deal: [[0, 0.055, 540, 0.28]]
  };

  // MIDI pitch, onset in seconds, ring time, touch.
  const scores = {
    select: [],
    lock: [],
    open: [],
    offer: [[50, 0, 0.82, 0.65], [57, 0.115, 0.64, 0.52], [64, 0.31, 0.9, 0.72]],
    final: [[45, 0, 1.05, 0.7], [57, 0.13, 0.91, 0.54], [64, 0.27, 0.85, 0.53], [67, 0.52, 1, 0.7]],
    deal: [[55, 0, 0.7, 0.65], [62, 0.09, 0.72, 0.63], [71, 0.205, 0.92, 0.67]],
    swap: [],
    result: [[50, 0, 0.95, 0.68], [57, 0.105, 0.83, 0.54], [66, 0.22, 0.84, 0.6], [69, 0.37, 1.08, 0.62]],
    summary: [[55, 0, 1, 0.62], [62, 0.1, 0.9, 0.55], [67, 0.22, 1.02, 0.61], [71, 0.37, 1, 0.61], [74, 0.54, 1.2, 0.63]]
  };

  function play(cue) {
    if (!Object.hasOwn(scores, cue) || !prepare()) return;
    const start = context.currentTime + 0.01;
    for (const [offset, length, cutoff, gain] of strokes[cue] || []) {
      paper(start + offset, length, cutoff, gain);
    }
    for (const [pitch, offset, duration, volume] of scores[cue]) {
      key(pitch, start + offset, duration, volume);
    }
  }

  function toggle() {
    soundOn = !soundOn;
    try {
      localStorage.setItem(storageKey, soundOn ? 'on' : 'off');
    } catch {}
    if (soundOn) prepare();
    if (output && context.state !== 'closed') {
      output.gain.setTargetAtTime(soundOn ? 0.39 : 0, context.currentTime, 0.012);
    }
    return soundOn;
  }

  window.DreamAudio = Object.freeze({ enabled: () => soundOn, toggle, play });
})();
