let ctx: AudioContext | null = null;

function context(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function tone(
  freq: number,
  duration: number,
  type: OscillatorType = 'sine',
  gain = 0.12,
  startOffset = 0
) {
  try {
    const c = context();
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.connect(g);
    g.connect(c.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, c.currentTime + startOffset);
    g.gain.setValueAtTime(gain, c.currentTime + startOffset);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + startOffset + duration);
    osc.start(c.currentTime + startOffset);
    osc.stop(c.currentTime + startOffset + duration);
  } catch {
    // Audio not available — silent fail.
  }
}

// Soft ping when it becomes your turn.
export function playTurnStart() {
  tone(880, 0.12, 'sine', 0.1);
}

// Ascending burst when you conquer a territory.
export function playConquest() {
  tone(330, 0.07, 'square', 0.08, 0);
  tone(440, 0.07, 'square', 0.08, 0.07);
  tone(660, 0.18, 'sine', 0.1, 0.14);
}

// Low thud when you lose a territory.
export function playTerritoryLost() {
  tone(200, 0.25, 'sawtooth', 0.08, 0);
  tone(140, 0.3, 'sawtooth', 0.06, 0.1);
}

// Short ascending fanfare on match win.
export function playWin() {
  [440, 550, 660, 880].forEach((f, i) => tone(f, 0.22, 'sine', 0.12, i * 0.1));
}

// Descending minor on match loss or draw.
export function playLoss() {
  [440, 350, 260].forEach((f, i) => tone(f, 0.28, 'sine', 0.1, i * 0.13));
}
