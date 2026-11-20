// Sound made from nothing: a handful of WebAudio oscillators and noise bursts stand in for
// chimes, thuds and sirens, so the game needs no audio files. Everything is created lazily
// after the player's first key press (browsers refuse sound before a gesture) and every
// call is safe when audio is unavailable or muted.

/** Create the sound box. All methods are no-ops until `unlock` has run inside a gesture. */
export function createAudio() {
  let context = null;
  let master = null;
  let sirenNodes = null;
  let muted = false;

  function unlock() {
    if (context) {
      if (context.state === 'suspended') context.resume();
      return;
    }
    try {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) return;
      context = new AudioCtor();
      master = context.createGain();
      master.gain.value = 0.22;
      master.connect(context.destination);
    } catch {
      context = null;
    }
  }

  /** One short tone with a soft envelope. */
  function tone(freqFrom, freqTo, seconds, type, volume) {
    if (!context || muted) return;
    const now = context.currentTime;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqFrom, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, freqTo), now + seconds);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + seconds);
    osc.connect(gain).connect(master);
    osc.start(now);
    osc.stop(now + seconds + 0.02);
  }

  /** One burst of filtered noise: a crash, a thud, a splash of static. */
  function noise(seconds, volume, filterFreq) {
    if (!context || muted) return;
    const now = context.currentTime;
    const length = Math.max(1, Math.floor(context.sampleRate * seconds));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = context.createGain();
    gain.gain.value = volume;
    source.connect(filter).connect(gain).connect(master);
    source.start(now);
  }

  return {
    unlock,
    toggleMute() {
      muted = !muted;
      if (muted) this.siren(false);
      return muted;
    },
    isMuted() {
      return muted;
    },
    /** A bright two-note chime: a package collected, a job done. */
    pickup() {
      tone(660, 660, 0.09, 'sine', 0.5);
      setTimeout(() => tone(990, 990, 0.14, 'sine', 0.5), 70);
    },
    /** A small rising arpeggio: cash earned. */
    cash() {
      tone(523, 523, 0.08, 'triangle', 0.5);
      setTimeout(() => tone(659, 659, 0.08, 'triangle', 0.5), 60);
      setTimeout(() => tone(784, 1046, 0.16, 'triangle', 0.5), 120);
    },
    crash() {
      noise(0.22, 0.7, 700);
      tone(120, 40, 0.2, 'square', 0.3);
    },
    thud() {
      noise(0.1, 0.5, 400);
    },
    busted() {
      tone(392, 392, 0.16, 'square', 0.35);
      setTimeout(() => tone(330, 330, 0.16, 'square', 0.35), 150);
      setTimeout(() => tone(262, 196, 0.3, 'square', 0.35), 300);
    },
    /** The two-tone siren loop, on while the police are close and off when they are not. */
    siren(on) {
      if (!context) return;
      if (on && !sirenNodes && !muted) {
        const osc = context.createOscillator();
        const gain = context.createGain();
        const lfo = context.createOscillator();
        const lfoGain = context.createGain();
        osc.type = 'triangle';
        osc.frequency.value = 800;
        lfo.frequency.value = 0.7;
        lfoGain.gain.value = 160;
        lfo.connect(lfoGain).connect(osc.frequency);
        gain.gain.value = 0.045;
        osc.connect(gain).connect(master);
        osc.start();
        lfo.start();
        sirenNodes = { osc, lfo };
      } else if (!on && sirenNodes) {
        try {
          sirenNodes.osc.stop();
          sirenNodes.lfo.stop();
        } catch {
          // Already stopped: nothing to clean up.
        }
        sirenNodes = null;
      }
    },
  };
}
