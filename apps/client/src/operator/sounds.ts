/**
 * Les bruits du standard (§15), synthétisés : chaque geste a son son. Le contexte audio
 * n'existe qu'après un premier geste de l'utilisateur, comme l'exigent les navigateurs.
 */
let context: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    context ??= new AudioContext();
    if (context.state === 'suspended') void context.resume();
    return context;
  } catch {
    return null;
  }
}

/** Un souffle de bruit filtré : base des bruits mécaniques. */
function noise(
  ctx: AudioContext,
  durationS: number,
  filter: BiquadFilterType,
  frequency: number,
  volume: number,
): void {
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * durationS), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const biquad = ctx.createBiquadFilter();
  biquad.type = filter;
  biquad.frequency.value = frequency;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationS);
  source.connect(biquad).connect(gain).connect(ctx.destination);
  source.start();
}

function tone(
  ctx: AudioContext,
  frequency: number,
  startS: number,
  durationS: number,
  volume: number,
  type: OscillatorType = 'sine',
): void {
  const oscillator = ctx.createOscillator();
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  const gain = ctx.createGain();
  const t = ctx.currentTime + startS;
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(volume, t + 0.01);
  gain.gain.setValueAtTime(volume, t + durationS - 0.02);
  gain.gain.linearRampToValueAtTime(0, t + durationS);
  oscillator.connect(gain).connect(ctx.destination);
  oscillator.start(t);
  oscillator.stop(t + durationS);
}

export const sounds = {
  /** La fiche s'enfonce dans la prise. */
  plug(): void {
    const ctx = audio();
    if (!ctx) return;
    noise(ctx, 0.07, 'lowpass', 900, 0.5);
    tone(ctx, 110, 0, 0.08, 0.25);
  },
  /** La fiche ressort. */
  unplug(): void {
    const ctx = audio();
    if (ctx) noise(ctx, 0.05, 'bandpass', 1_800, 0.35);
  },
  /** Le « clac » d'une clé. */
  clac(): void {
    const ctx = audio();
    if (!ctx) return;
    noise(ctx, 0.03, 'highpass', 2_500, 0.6);
    tone(ctx, 1_400, 0, 0.015, 0.15, 'square');
  },
  /** Le correspondant sonne. */
  ring(): void {
    const ctx = audio();
    if (!ctx) return;
    for (let i = 0; i < 16; i++) tone(ctx, i % 2 ? 480 : 440, i * 0.05, 0.05, 0.12);
  },
  /** Tonalité d'erreur : la prise refuse la fiche (§8.3). */
  error(): void {
    const ctx = audio();
    if (!ctx) return;
    tone(ctx, 420, 0, 0.15, 0.15, 'square');
    tone(ctx, 300, 0.17, 0.2, 0.15, 'square');
  },
};
