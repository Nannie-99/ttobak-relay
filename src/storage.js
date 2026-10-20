import { clampMicSensitivity, clampSecPerChar } from './judge.js';

const SETTINGS_KEY = 'ttobakRelay.settings.v1';
const CALIBRATION_KEY = 'ttobakRelay.calibration.v1';
export const RECORDS_KEY = 'ttobakRelay.records.v1';

const ANIMALS = ['rabbit', 'turtle', 'squirrel', 'penguin', 'dog', 'bear'];

export const defaultSettings = {
  animal: 'rabbit',
  mode: 'read',
  text: '',
  goalMode: 'auto',
  goalSteps: 5,
  judgeMode: 'auto',
  speakSeconds: 5,
  secPerChar: 0.2,
  micSensitivity: 50,
  calibrateChoice: 'saved',
  deviceId: '',
};

function readJson(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function clampGoal(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 5;
  return Math.min(30, Math.max(1, n));
}

/** 개발·시험 중 넣었던 지문은 예시 그림자 글씨가 보이도록 비웁니다. */
function scrubLegacyDemoText(text) {
  const t = String(text || '');
  if (!t.trim()) return '';
  if (/올랑이|세번|네번|다섯번|여섯번|일곱번|여덟번/.test(t)) return '';
  return t;
}

export function loadSettings() {
  const data = readJson(SETTINGS_KEY);
  if (!data || typeof data !== 'object') return { ...defaultSettings };
  const next = { ...defaultSettings };
  for (const key of Object.keys(defaultSettings)) {
    if (data[key] !== undefined) next[key] = data[key];
  }
  if (!ANIMALS.includes(next.animal)) next.animal = 'rabbit';
  if (next.mode !== 'speak') next.mode = 'read';
  if (next.goalMode !== 'manual') next.goalMode = 'auto';
  if (next.judgeMode !== 'manual') next.judgeMode = 'auto';
  if (next.calibrateChoice !== 'again') next.calibrateChoice = 'saved';
  next.goalSteps = clampGoal(next.goalSteps);
  next.secPerChar = clampSecPerChar(next.secPerChar);
  next.micSensitivity = clampMicSensitivity(next.micSensitivity);
  const speak = Number(next.speakSeconds);
  next.speakSeconds = speak === 3 || speak === 8 ? speak : 5;
  const rawText = typeof next.text === 'string' ? next.text : '';
  next.text = scrubLegacyDemoText(rawText);
  next.deviceId = typeof next.deviceId === 'string' ? next.deviceId : '';
  if (next.text !== rawText) writeJson(SETTINGS_KEY, next);
  return next;
}

export function saveSettings(settings) {
  const current = loadSettings();
  const merged = { ...current, ...settings };
  const next = {};
  for (const key of Object.keys(defaultSettings)) next[key] = merged[key];
  if (!ANIMALS.includes(next.animal)) next.animal = 'rabbit';
  if (next.mode !== 'speak') next.mode = 'read';
  if (next.goalMode !== 'manual') next.goalMode = 'auto';
  if (next.judgeMode !== 'manual') next.judgeMode = 'auto';
  if (next.calibrateChoice !== 'again') next.calibrateChoice = 'saved';
  next.goalSteps = clampGoal(next.goalSteps);
  next.secPerChar = clampSecPerChar(next.secPerChar);
  next.micSensitivity = clampMicSensitivity(next.micSensitivity);
  const speak = Number(next.speakSeconds);
  next.speakSeconds = speak === 3 || speak === 8 ? speak : 5;
  next.text = typeof next.text === 'string' ? next.text : '';
  next.deviceId = typeof next.deviceId === 'string' ? next.deviceId : '';
  return writeJson(SETTINGS_KEY, next);
}

export function loadCalibration() {
  const data = readJson(CALIBRATION_KEY);
  if (!data || typeof data !== 'object') return null;
  const noiseDb = Number(data.noiseDb);
  const lowBound = Number(data.lowBound);
  const highBound = Number(data.highBound);
  if (![noiseDb, lowBound, highBound].every(Number.isFinite)) return null;
  if (highBound <= lowBound) return null;
  return { noiseDb, lowBound, highBound };
}

export function saveCalibration(calibration) {
  const noiseDb = Number(calibration?.noiseDb);
  const lowBound = Number(calibration?.lowBound);
  const highBound = Number(calibration?.highBound);
  if (![noiseDb, lowBound, highBound].every(Number.isFinite)) return false;
  if (highBound <= lowBound) return false;
  return writeJson(CALIBRATION_KEY, { noiseDb, lowBound, highBound });
}

export function loadRecords() {
  const data = readJson(RECORDS_KEY);
  if (!Array.isArray(data)) return [];
  return data.filter((item) => item && typeof item === 'object' && item.id);
}

export function addRecord(record) {
  const clean = {
    id: String(record?.id || ''),
    date: String(record?.date || ''),
    animal: String(record?.animal || ''),
    mode: record?.mode === 'speak' ? 'speak' : 'read',
    goalSteps: Number(record?.goalSteps) || 0,
    reachedSteps: Number(record?.reachedSteps) || 0,
    completed: Boolean(record?.completed),
    textPreview: Array.from(String(record?.textPreview || '')).slice(0, 20).join(''),
  };
  if (!clean.id) return false;
  const all = loadRecords();
  all.push(clean);
  return writeJson(RECORDS_KEY, all);
}

export function removeRecord(id) {
  const all = loadRecords().filter((item) => item.id !== id);
  return writeJson(RECORDS_KEY, all);
}

export function clearRecords() {
  return writeJson(RECORDS_KEY, []);
}
