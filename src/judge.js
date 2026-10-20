/** 구간이 바뀌려면 새 구간이 이 시간 이상 이어져야 한다. */
export const HYSTERESIS_MS = 150;

/** '큼' 표정·안내는 큼 구간이 이 시간 이상 이어질 때. */
export const LOUD_FEEDBACK_MS = 500;

/** 저장값이 없을 때의 교실 소음 기준 (dBFS). */
export const DEFAULT_NOISE_DB = -45;

const MIN_REQUIRED_MS = 1500;
const MAX_REQUIRED_MS = 8000;

export function countHangul(text) {
  if (!text) return 0;
  const found = String(text).match(/[가-힣]/g);
  return found ? found.length : 0;
}

export function clampSecPerChar(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0.2;
  return Math.min(0.35, Math.max(0.15, n));
}

/** 읽기 모드 필요 시간(ms). 한글만 세고, 1.5초~8초로 가둔다. */
export function requiredMsForText(text, secPerChar = 0.2) {
  const seconds = countHangul(text) * clampSecPerChar(secPerChar);
  return Math.min(MAX_REQUIRED_MS, Math.max(MIN_REQUIRED_MS, seconds * 1000));
}

/**
 * 작음 < noise+10dB ≤ 알맞음 ≤ (시범+8dB 또는 noise+30dB) < 큼
 * 시범이 너무 작아 구간이 뒤집히면 알맞음 폭을 8dB로 벌린다.
 */
function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function boundsFromCalibration(noiseDb, demoDb) {
  const noise = finiteNumber(noiseDb) ?? DEFAULT_NOISE_DB;
  const lowBound = noise + 10;
  const demo = finiteNumber(demoDb);
  let highBound = demo === null ? noise + 30 : demo + 8;
  if (highBound <= lowBound) highBound = lowBound + 8;
  return { noiseDb: noise, lowBound, highBound };
}

export function defaultCalibration() {
  return boundsFromCalibration(DEFAULT_NOISE_DB, null);
}

/** 마이크 민감도 0(크게 말해야) ~ 100(작게도 인정). 딱 좋아요 구간 너비는 고정. */
export function boundsFromSensitivity(noiseDb, sensitivity) {
  const noise = Number.isFinite(Number(noiseDb)) ? Number(noiseDb) : DEFAULT_NOISE_DB;
  const s = Math.min(100, Math.max(0, Number(sensitivity)));
  const t = Number.isFinite(s) ? s / 100 : 0.5;
  const lowBound = noise + 18 - t * 12;
  const highBound = lowBound + 18;
  return { noiseDb: noise, lowBound, highBound };
}

export function clampMicSensitivity(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 50;
  return Math.min(100, Math.max(0, n));
}

export function rawZone(db, lowBound, highBound) {
  if (db < lowBound) return 'quiet';
  if (db > highBound) return 'loud';
  return 'good';
}

function snapshot(state, config) {
  const zone = state.committed ?? 'quiet';
  let feedback = 'none';
  if (state.loudMs >= LOUD_FEEDBACK_MS) feedback = 'loud';
  else if (zone === 'good') feedback = 'good';
  else if (zone === 'quiet' && state.lastDb > config.noiseDb) feedback = 'quiet';

  return {
    zone,
    accumulatedMs: state.accumulatedMs,
    passed: state.accumulatedMs >= config.requiredMs,
    feedback,
    loudMs: state.loudMs,
  };
}

/**
 * 순수 판정기.
 * 첫 구간은 바로 확정하고, 그 다음부터는 150ms 히스테리시스를 적용한다.
 * 확정 구간이 알맞음일 때만 누적한다. 작음·큼에서는 누적이 멈춘다.
 */
export function createJudge(config) {
  const state = {
    committed: null,
    pending: null,
    pendingMs: 0,
    accumulatedMs: 0,
    loudMs: 0,
    lastDb: -100,
  };

  return {
    reset() {
      state.committed = null;
      state.pending = null;
      state.pendingMs = 0;
      state.accumulatedMs = 0;
      state.loudMs = 0;
      state.lastDb = -100;
    },
    push(db, dtMs) {
      const dt = Math.max(0, Number(dtMs) || 0);
      state.lastDb = Number(db);
      const next = rawZone(state.lastDb, config.lowBound, config.highBound);

      if (state.committed === null) {
        state.committed = next;
        state.pending = null;
        state.pendingMs = 0;
      } else if (next === state.committed) {
        state.pending = null;
        state.pendingMs = 0;
      } else {
        if (state.pending !== next) {
          state.pending = next;
          state.pendingMs = 0;
        }
        state.pendingMs += dt;
        if (state.pendingMs >= HYSTERESIS_MS) {
          state.committed = state.pending;
          state.pending = null;
          state.pendingMs = 0;
        }
      }

      if (state.committed === 'good') state.accumulatedMs += dt;
      if (state.committed === 'loud') state.loudMs += dt;
      else state.loudMs = 0;

      return snapshot(state, config);
    },
  };
}

/** 가짜 dB 시계열 [{ db, dtMs }] → 마지막 판정과 구간 기록. */
export function judgeSeries(samples, config) {
  const judge = createJudge(config);
  let result = {
    zone: 'quiet',
    accumulatedMs: 0,
    passed: false,
    feedback: 'none',
    loudMs: 0,
  };
  const trace = [];
  for (const sample of samples) {
    result = judge.push(sample.db, sample.dtMs);
    trace.push(result.zone);
  }
  return { ...result, trace };
}
