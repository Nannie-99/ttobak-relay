export function micConstraints(deviceId) {
  const audio = {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
  };
  if (deviceId) audio.deviceId = { ideal: deviceId };
  return { audio };
}

export function rmsToDbfs(samples) {
  if (!samples || samples.length === 0) return -100;
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const v = samples[i];
    sum += v * v;
  }
  const rms = Math.sqrt(sum / samples.length);
  if (rms < 1e-8) return -100;
  return 20 * Math.log10(rms);
}

export function smoothDb(prev, next, alpha = 0.3) {
  if (!Number.isFinite(prev)) return next;
  return alpha * next + (1 - alpha) * prev;
}

export function meterScale(lowBound, highBound) {
  const low = Number(lowBound);
  const high = Number(highBound);
  const safeLow = Number.isFinite(low) ? low : -35;
  const safeHigh = Number.isFinite(high) ? high : -15;
  const lo = Math.min(safeLow, safeHigh);
  const hi = Math.max(safeLow, safeHigh);
  const span = Math.max(6, hi - lo);
  const min = lo - span;
  const max = hi + span;
  return { lowBound: lo, highBound: hi, span, min, max, total: max - min };
}

export function needlePercent(db, lowBound, highBound) {
  const { min, max } = meterScale(lowBound, highBound);
  const t = (db - min) / (max - min);
  if (!Number.isFinite(t)) return 50;
  return Math.min(96, Math.max(4, t * 100));
}

/** 작아요 / 딱 좋아요 / 너무 커요 구간의 가로 비율(%) */
export function zoneWidths(lowBound, highBound) {
  const { lowBound: lo, highBound: hi, min, max, total } = meterScale(lowBound, highBound);
  const quiet = ((lo - min) / total) * 100;
  const good = ((hi - lo) / total) * 100;
  const loud = ((max - hi) / total) * 100;
  return {
    quiet: Math.max(8, quiet),
    good: Math.max(8, good),
    loud: Math.max(8, loud),
  };
}

export function applyVoiceZones(lowBound, highBound, root = document) {
  const bar = root.querySelector?.('.voice-bar') || document.querySelector('.voice-bar');
  if (!bar) return;
  const widths = zoneWidths(lowBound, highBound);
  const sum = widths.quiet + widths.good + widths.loud;
  const q = (widths.quiet / sum) * 100;
  const g = (widths.good / sum) * 100;
  const l = (widths.loud / sum) * 100;
  bar.style.gridTemplateColumns = `${q}% ${g}% ${l}%`;
}

export async function listInputs() {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((device) => device.kind === 'audioinput');
  } catch {
    return [];
  }
}

export async function openMeter({ deviceId, onFrame, onError }) {
  if (typeof window === 'undefined' || !window.isSecureContext) {
    const error = new Error('insecure');
    error.code = 'insecure';
    onError?.(error);
    return null;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    const error = new Error('unsupported');
    error.code = 'missing';
    onError?.(error);
    return null;
  }

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia(micConstraints(deviceId));
  } catch (error) {
    error.code = error?.name === 'NotFoundError' || error?.name === 'OverconstrainedError'
      ? 'missing'
      : 'denied';
    onError?.(error);
    return null;
  }

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const context = new AudioContextClass();
  if (context.state === 'suspended') {
    try {
      await context.resume();
    } catch {
      /* 다음 클릭에서 다시 깨운다 */
    }
  }

  const source = context.createMediaStreamSource(stream);
  const analyser = context.createAnalyser();
  analyser.fftSize = 2048;
  source.connect(analyser);
  const data = new Float32Array(analyser.fftSize);

  let smoothed = null;
  let stopped = false;
  let last = performance.now();
  let rafId = 0;

  const tick = (now) => {
    if (stopped) return;
    const dt = Math.min(100, Math.max(0, now - last));
    last = now;
    analyser.getFloatTimeDomainData(data);
    const rawDb = rmsToDbfs(data);
    smoothed = smoothDb(smoothed, rawDb, 0.3);
    onFrame?.({ db: smoothed, rawDb, dt });
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);

  return {
    stop() {
      stopped = true;
      cancelAnimationFrame(rafId);
      stream.getTracks().forEach((track) => track.stop());
      try {
        source.disconnect();
      } catch {
        /* already stopped */
      }
      context.close().catch(() => {});
    },
  };
}
