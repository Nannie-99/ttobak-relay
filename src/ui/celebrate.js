const COLORS = ['#F0C9A0', '#8FCB7A', '#7EC8E3', '#E07A6A'];

export function burstConfetti(container) {
  if (!container) return;
  container.replaceChildren();
  for (let i = 0; i < 36; i += 1) {
    const bit = document.createElement('i');
    bit.className = 'bit';
    const size = 10 + (i % 5) * 4;
    bit.style.left = `${(i * 17) % 100}%`;
    bit.style.width = `${size}px`;
    bit.style.height = `${size}px`;
    bit.style.background = COLORS[i % COLORS.length];
    bit.style.animationDelay = `${(i % 6) * 0.04}s`;
    container.appendChild(bit);
  }
  window.setTimeout(() => {
    container.replaceChildren();
  }, 2800);
}

let audioContext = null;

function getAudioContext() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!audioContext) audioContext = new AudioContextClass();
  if (audioContext.state === 'suspended') {
    audioContext.resume().catch(() => {});
  }
  return audioContext;
}

function playTone({ freq, type = 'sine', startAt = 0, attack = 0.05, duration = 0.25 }) {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime + startAt;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(attack, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + duration + 0.02);
}

export function playFinishSound() {
  [523.25, 659.25, 783.99].forEach((freq, index) => {
    playTone({ freq, startAt: index * 0.11, attack: 0.07, duration: 0.35 });
  });
}

/** 한 칸을 통과했을 때 */
export function playCorrectSound() {
  playTone({ freq: 587.33, attack: 0.08, duration: 0.16 });
  playTone({ freq: 783.99, startAt: 0.1, attack: 0.09, duration: 0.22 });
}

/** 목소리가 너무 크거나 작아 통과하지 못할 때 */
export function playWrongSound() {
  playTone({ freq: 220, type: 'triangle', attack: 0.05, duration: 0.18 });
  playTone({ freq: 164.81, type: 'triangle', startAt: 0.12, attack: 0.04, duration: 0.22 });
}
