import './styles.css';
import titleUrl from '../assets/pic/타이틀.png';
import creatorUrl from '../assets/pic/프로필/난쌤.png';
import bgmUrl from '../assets/bgm/Afternoon_High_Score.mp3';
import { listInputs, needlePercent, openMeter } from './audio/meter.js';
import {
  boundsFromCalibration,
  boundsFromSensitivity,
  clampMicSensitivity,
  createJudge,
  defaultCalibration,
  rawZone,
  requiredMsForText,
} from './judge.js';
import { cheerText, parseSentences, resolveGoal, sentenceAt, stoneLabel, stoneWindow, textPreview } from './race.js';
import {
  addRecord,
  clearRecords,
  loadCalibration,
  loadRecords,
  loadSettings,
  removeRecord,
  saveCalibration,
  saveSettings,
} from './storage.js';
import { animalImg, poseForStep, randomBackgroundUrl } from './ui/animals.js';
import { burstConfetti, playCorrectSound, playFinishSound, playWrongSound } from './ui/celebrate.js';
import { hintFromFeedback, meterMarkup } from './ui/meter-bar.js';

const APP_VERSION_LABEL = 'v2.0';

const ANIMALS = [
  ['rabbit', '토끼'],
  ['turtle', '거북이'],
  ['squirrel', '다람쥐'],
  ['penguin', '펭귄'],
  ['dog', '강아지'],
  ['bear', '아기곰'],
];

const app = document.querySelector('#app');
const siteFooter = document.querySelector('#site-footer');
const siteDialog = document.querySelector('#site-dialog');
const BGM_VOLUME_KEY = 'ttobakRelay.bgmVolume.v1';
const INSTAGRAM_URL = 'https://www.instagram.com/hello.nan_ssaem/';

const state = {
  screen: 'title',
  settings: loadSettings(),
  calibration: loadCalibration(),
  recordsBack: 'title',
  notice: '',
  micError: '',
  micStatus: '',
  devices: [],
  cal: null,
  race: null,
  soundOpen: false,
};

let bgm = null;
let bgmVolume = loadBgmVolume();
let bgmUnlocked = false;

let meter = null;
let meterDb = -80;
let judge = null;
let listeningArmed = false;
let armingListen = false;
let listenToken = 0;
let celebrateTimer = 0;
let jumpTimer = 0;
let spaceHeld = false;
let spaceDownAt = 0;
let lastSpaceUpAt = 0;
let lastTapDuration = Infinity;
let spaceDouble = false;
let calToken = 0;
let sampleBucket = null;
let raceMounted = false;
let lastWrongFeedback = '';

function animalName(id) {
  return ANIMALS.find(([key]) => key === id)?.[1] || '토끼';
}

function esc(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function median(values) {
  const nums = (values || []).filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!nums.length) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
}

function activeCalibration() {
  return state.calibration || defaultCalibration();
}

function loadBgmVolume() {
  try {
    const raw = localStorage.getItem(BGM_VOLUME_KEY);
    const n = Number(raw);
    if (Number.isFinite(n)) return Math.min(1, Math.max(0, n));
  } catch {
    /* ignore */
  }
  return 0.45;
}

function saveBgmVolume(value) {
  bgmVolume = Math.min(1, Math.max(0, Number(value) || 0));
  try {
    localStorage.setItem(BGM_VOLUME_KEY, String(bgmVolume));
  } catch {
    /* ignore */
  }
  if (bgm) bgm.volume = bgmVolume;
  syncSoundButton();
}

function ensureBgm() {
  if (bgm) return bgm;
  bgm = new Audio(bgmUrl);
  bgm.loop = true;
  bgm.preload = 'auto';
  bgm.volume = bgmVolume;
  return bgm;
}

async function playTitleBgm() {
  const audio = ensureBgm();
  audio.volume = bgmVolume;
  try {
    await audio.play();
    bgmUnlocked = true;
  } catch {
    /* 브라우저가 자동 재생을 막으면 첫 클릭 때 다시 시도 */
  }
}

function pauseTitleBgm() {
  if (!bgm) return;
  bgm.pause();
}

function syncTitleAudio() {
  if (state.screen === 'title') {
    playTitleBgm();
    startTitleParade();
  } else {
    state.soundOpen = false;
    pauseTitleBgm();
    stopTitleParade();
  }
}

const PARADE_ANIMALS = ['rabbit', 'turtle', 'squirrel', 'penguin', 'dog', 'bear'];
let paradeTimers = [];
let paradeActive = false;

function stopTitleParade() {
  paradeActive = false;
  paradeTimers.forEach((id) => window.clearTimeout(id));
  paradeTimers = [];
  document.querySelector('.title-parade')?.replaceChildren();
}

function startTitleParade() {
  const host = document.querySelector('.title-parade');
  if (!host || state.screen !== 'title') return;
  if (paradeActive && host.dataset.running === '1') return;
  stopTitleParade();
  paradeActive = true;
  host.dataset.running = '1';

  const schedule = (ms) => {
    const id = window.setTimeout(tick, ms);
    paradeTimers.push(id);
  };

  const tick = () => {
    if (!paradeActive || state.screen !== 'title') return;
    const hostNow = document.querySelector('.title-parade');
    if (!hostNow) return;
    const count = hostNow.querySelectorAll('.parade-animal').length;
    if (count < 2) spawnParadeAnimal(hostNow);
    schedule(1400 + Math.random() * 2200);
  };

  spawnParadeAnimal(host);
  schedule(1800 + Math.random() * 1600);
}

function spawnParadeAnimal(host) {
  if (!host || host.querySelectorAll('.parade-animal').length >= 2) return;
  const kind = PARADE_ANIMALS[Math.floor(Math.random() * PARADE_ANIMALS.length)];
  const el = document.createElement('div');
  el.className = 'parade-animal';
  el.innerHTML = animalImg(kind, 'side');
  const duration = 7 + Math.random() * 11;
  const bottom = 4 + Math.random() * 40;
  const size = 70 + Math.random() * 50;
  el.style.setProperty('--parade-duration', `${duration.toFixed(2)}s`);
  el.style.setProperty('--parade-bottom', `${Math.round(bottom)}px`);
  el.style.setProperty('--parade-size', `${Math.round(size)}px`);
  el.addEventListener('animationend', () => el.remove());
  host.appendChild(el);
}

function soundIcon() {
  return `<svg class="sound-icon" viewBox="0 0 48 48" aria-hidden="true"><path d="M10 18h8l10-8v28l-10-8h-8z" fill="currentColor"/><path d="M34 18c3 3 3 9 0 12" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M38 13c6 6 6 16 0 22" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>`;
}

function homeIcon() {
  return `<svg class="home-icon" viewBox="0 0 48 48" aria-hidden="true"><path d="M8 22 L24 8 L40 22 V40 H28 V28 H20 V40 H8 Z" fill="currentColor"/></svg>`;
}

function syncSoundButton() {
  const button = document.querySelector('[data-action="toggle-sound"]');
  if (!button) return;
  button.classList.toggle('is-muted', bgmVolume <= 0.01);
  button.setAttribute('aria-expanded', state.soundOpen ? 'true' : 'false');
  const panel = document.querySelector('#sound-panel');
  if (panel) panel.hidden = !state.soundOpen;
  const slider = document.querySelector('#bgm-volume');
  if (slider && Number(slider.value) !== bgmVolume) slider.value = String(bgmVolume);
}

function paintFooter() {
  if (!siteFooter) return;
  siteFooter.innerHTML = `
    <span>© 2026 또박또박 릴레이. All rights reserved.</span>
    <button type="button" class="footer-link" data-action="help">이용방법</button>
    <button type="button" class="footer-link" data-action="creator">만든이</button>
    <span>버전 ${APP_VERSION_LABEL}</span>
  `;
}

function openHelpDialog() {
  if (!siteDialog) return;
  siteDialog.innerHTML = `
    <div class="site-card help-card" role="dialog" aria-labelledby="help-title">
      <h2 id="help-title">이용방법</h2>
      <section class="help-block">
        <h3>세계관</h3>
        <p>우리 반이 고른 동물이 돌길을 달려요. 또박또박 알맞은 목소리로 말하면 동물이 한 칸씩 앞으로 가고, 결승 깃발까지 함께 도착하는 이야기예요.</p>
      </section>
      <section class="help-block">
        <h3>어떻게 이용하나요?</h3>
        <ol>
          <li>시작하기를 누른 뒤, 함께 달릴 동물과 모드를 고릅니다.</li>
          <li>읽기 모드는 지문을 줄마다 한 문장씩 넣고, 그 문장 수만큼 앞으로 갑니다.</li>
          <li>발표 모드는 목표 횟수를 정한 뒤, 알맞은 크기로 발표하면 한 칸 갑니다.</li>
          <li>마이크 막대에서 목소리가 ‘딱 좋아요’에 들어오게 말해 주세요.</li>
          <li>선생님은 듣기 시작·일시정지·한 칸 앞·뒤로 도울 수 있어요.</li>
        </ol>
      </section>
      <section class="help-block">
        <h3>언제 쓰면 좋나요?</h3>
        <p>아침 독서, 받아쓰기·낭독 연습, 발표 전 목소리 크기 맞추기, 쉬는 시간 짧은 몸풀기 활동에 잘 맞아요.</p>
      </section>
      <section class="help-block">
        <h3>누구와 함께하면 좋나요?</h3>
        <p>한 반 전체가 함께해도 좋고, 모둠끼리 번갈아 말해도 좋아요. 선생님과 학생이 같은 화면을 보며 응원할 때 가장 재미있어요.</p>
      </section>
      <button type="button" class="primary" data-action="close-dialog">닫기</button>
    </div>
  `;
  siteDialog.hidden = false;
}

function openCreatorDialog() {
  if (!siteDialog) return;
  siteDialog.innerHTML = `
    <div class="site-card creator-card" role="dialog" aria-labelledby="creator-title">
      <img class="creator-photo" src="${creatorUrl}" alt="난쌤 프로필">
      <h2 id="creator-title">난쌤</h2>
      <p class="creator-handle">@hello.nan_ssaem</p>
      <p class="creator-bio">교실에서 바로 쓰는 활동을 만드는 선생님이에요. 아이들이 또박또박 말하고, 반 전체가 함께 기뻐하는 순간을 만들고 싶어요.</p>
      <a class="primary creator-link" href="${INSTAGRAM_URL}" target="_blank" rel="noopener noreferrer">인스타그램 보기</a>
      <button type="button" data-action="close-dialog">닫기</button>
    </div>
  `;
  siteDialog.hidden = false;
}

function closeSiteDialog() {
  if (!siteDialog) return;
  siteDialog.hidden = true;
  siteDialog.innerHTML = '';
}

function openClearRecordsDialog() {
  if (!siteDialog) return;
  siteDialog.innerHTML = `
    <div class="site-card clear-card" role="dialog" aria-labelledby="clear-title">
      <h2 id="clear-title">기록을 모두 지울까요?</h2>
      <p class="clear-warn">지운 기록은 다시 불러올 수 없어요.</p>
      <div class="clear-actions">
        <button type="button" data-action="close-dialog">돌아가기</button>
        <button type="button" class="primary danger" data-action="do-clear">지우기</button>
      </div>
    </div>
  `;
  siteDialog.hidden = false;
}

function show(screen) {
  if (screen !== 'race') {
    window.clearTimeout(celebrateTimer);
    if (state.race?.status === 'celebrate') {
      if (state.race.reached >= state.race.goal) finishRace();
      else {
        state.race.status = 'idle';
        state.race.cheer = '';
        state.race.progress = 0;
      }
    }
    raceMounted = false;
  }
  state.screen = screen;
  paint();
}

function paint() {
  if (state.screen === 'title') paintTitle();
  else if (state.screen === 'setup') paintSetup();
  else if (state.screen === 'calibrate') paintCalibrate();
  else if (state.screen === 'race') paintRace();
  else paintRecords();
  syncTitleAudio();
}

function paintTitle() {
  app.innerHTML = `
    <section class="title-screen">
      <header class="title-bar">
        <div class="sound-control">
          <button type="button" class="sound-btn" data-action="toggle-sound" aria-label="사운드 조절" aria-expanded="${state.soundOpen ? 'true' : 'false'}">${soundIcon()}</button>
          <div id="sound-panel" class="sound-panel" ${state.soundOpen ? '' : 'hidden'}>
            <input id="bgm-volume" type="range" min="0" max="1" step="0.01" value="${bgmVolume}" aria-label="배경 음악 크기" />
          </div>
        </div>
      </header>
      <div class="title-main">
        <h1><img class="title-logo" src="${titleUrl}" alt="또박또박 릴레이"></h1>
        <button type="button" class="primary start-btn" data-action="go-setup">시작하기</button>
        <div class="title-tools">
          <button type="button" class="small" data-action="records">기록 보기</button>
        </div>
        <p id="mic-status" class="mic-status">${esc(state.micStatus)}</p>
      </div>
      <div class="title-parade" aria-hidden="true"></div>
    </section>
  `;
  syncSoundButton();
}

function deviceOptions(selected) {
  if (!state.devices.length) {
    return `<option value="">기본 마이크</option>`;
  }
  return state.devices
    .map((device, index) => {
      const label = device.label || `마이크 ${index + 1}`;
      const picked = device.deviceId === selected ? ' selected' : '';
      return `<option value="${esc(device.deviceId)}"${picked}>${esc(label)}</option>`;
    })
    .join('');
}

function fillDeviceSelects() {
  document.querySelectorAll('[data-devices]').forEach((select) => {
    const current = select.value || state.settings.deviceId;
    select.innerHTML = deviceOptions(current);
    select.value = current;
  });
}

function readSetup() {
  const root = document.querySelector('#setup');
  if (!root) return { ...state.settings };
  const mode = root.querySelector('input[name="mode"]:checked')?.value || state.settings.mode;
  const goalMode = mode === 'speak' ? 'manual' : 'auto';
  return {
    ...state.settings,
    animal: root.querySelector('.animal-card.selected')?.dataset.animal || state.settings.animal,
    mode,
    text: root.querySelector('#text')?.value ?? state.settings.text,
    goalMode,
    goalSteps: Number(root.querySelector('#goal-steps')?.value ?? state.settings.goalSteps),
    judgeMode: 'auto',
    speakSeconds: Number(root.querySelector('input[name="speakSeconds"]:checked')?.value || state.settings.speakSeconds),
    secPerChar: Number(root.querySelector('#sec-per-setup')?.value ?? state.settings.secPerChar),
    micSensitivity: Number(root.querySelector('#mic-sensitivity')?.value ?? state.settings.micSensitivity),
    calibrateChoice: 'saved',
    deviceId: root.querySelector('#device-setup')?.value ?? state.settings.deviceId,
  };
}

const TEXT_GHOST = '나는 학교에 가요.\n친구가 웃어요.';

function rememberSetup() {
  if (!document.querySelector('#setup')) return;
  state.settings = readSetup();
  saveSettings(state.settings);
}

function paintSetup() {
  const settings = state.settings;
  const speak = settings.mode === 'speak';
  const insecure = typeof window !== 'undefined' && !window.isSecureContext;
  const cards = ANIMALS.map(([id, label]) => `
    <button type="button" class="animal-card${settings.animal === id ? ' selected' : ''}" data-action="animal" data-animal="${id}">
      ${animalImg(id, 'pick')}
      <b>${label}</b>
    </button>
  `).join('');
  const sensitivity = clampMicSensitivity(settings.micSensitivity);

  app.innerHTML = `
    <section class="setup-screen" id="setup">
      <header class="setup-head">
        <h1>또박또박 릴레이 설정</h1>
        <button type="button" class="small home-icon-btn" data-action="home" aria-label="홈" title="홈">${homeIcon()}</button>
      </header>
      ${insecure ? `<p class="banner">https 주소에서 열어 주세요. 지금은 선생님 버튼으로 진행할 수 있어요.</p>` : ''}
      ${state.notice ? `<p class="notice">${esc(state.notice)}</p>` : ''}
      <div class="setup-board">
        <section class="pane pane-animals">
          <h2>함께 달릴 동물</h2>
          <div class="animals">${cards}</div>
        </section>
        <section class="pane pane-mode">
          <h2>모드</h2>
          <div class="mode-row">
            <label class="choice"><input type="radio" name="mode" value="read" ${settings.mode !== 'speak' ? 'checked' : ''}/> 읽기 모드</label>
            <label class="choice"><input type="radio" name="mode" value="speak" ${settings.mode === 'speak' ? 'checked' : ''}/> 발표 모드</label>
          </div>
          <div id="read-fields" ${speak ? 'hidden' : ''}>
            <div class="stack text-stack">
              <span class="field-hint">줄바꿈을 하면 한 문장으로 인식해요.</span>
              <div class="text-field">
                <textarea id="text" aria-label="지문">${esc(settings.text)}</textarea>
                <div class="text-ghost" aria-hidden="true" ${settings.text.trim() ? 'hidden' : ''}>${esc(TEXT_GHOST).replaceAll('\n', '<br>')}</div>
              </div>
            </div>
          </div>
          <div id="speak-fields" ${speak ? '' : 'hidden'}>
            <label class="stack">목표 횟수
              <input type="number" id="goal-steps" min="1" max="30" value="${esc(settings.goalSteps)}"/>
            </label>
          </div>
        </section>
        <section class="pane pane-mic">
          <h2>목소리 크기 설정</h2>
          <div class="setup-meter">
            ${meterMarkup()}
          </div>
          <label class="stack sensitivity-stack">마이크 민감도
            <input id="mic-sensitivity" type="range" min="0" max="100" step="1" value="${sensitivity}"/>
            <span class="sensitivity-ends"><span>크게 말해야 해요</span><span>작게도 괜찮아요</span></span>
          </label>
          <label class="stack">사용할 마이크
            <select id="device-setup" data-devices>${deviceOptions(settings.deviceId)}</select>
          </label>
          <div class="choices speak-clarity">
            <p class="pane-label">발음 또박또박 설정</p>
            <label class="stack">한 글자에 걸리는 시간
              <input id="sec-per-setup" type="range" min="0.15" max="0.35" step="0.01" value="${esc(settings.secPerChar)}"/>
              <span id="sec-label">${Number(settings.secPerChar).toFixed(2)}초</span>
            </label>
          </div>
        </section>
      </div>
      <div class="actions setup-start">
        <p class="fullscreen-tip">전체 화면을 권장합니다</p>
        <button type="button" class="primary race-start" data-action="start">경주 시작</button>
      </div>
    </section>
  `;
  ensureMeter();
  applyMicSensitivity(sensitivity);
  syncSetupMeter();
  syncTextGhost();
}

function paintCalibrate() {
  const phase = state.cal?.phase || 'wait';
  let body = '';
  if (phase === 'wait') {
    body = `<p class="lead">마이크를 준비하고 있어요.</p>`;
  } else if (phase === 'quiet') {
    body = `
      <p class="lead">모두 쉿! 3초 동안 조용히 해 주세요.</p>
      <p id="cal-count" class="count">${esc(state.cal.left || 3)}</p>
    `;
  } else if (phase === 'demo') {
    body = `
      <p class="lead">알맞은 목소리로 한 문장을 읽어 주세요.</p>
      <p id="cal-count" class="count">${esc(state.cal.left || 3)}</p>
    `;
  } else {
    const cal = state.cal;
    body = `
      <p class="lead">막대에서 경계를 살짝 고쳐도 좋아요.</p>
      <div class="preview" id="cal-preview">
        <i class="q"></i><i class="g"></i><i class="l"></i>
        <div id="cal-needle"></div>
      </div>
      <label class="stack">작음과 알맞음 사이
        <input id="bound-low" type="range" min="-80" max="-5" step="1" value="${Math.round(cal.lowBound)}"/>
      </label>
      <label class="stack">알맞음과 큼 사이
        <input id="bound-high" type="range" min="-80" max="-5" step="1" value="${Math.round(cal.highBound)}"/>
      </label>
      <button type="button" class="primary" data-action="save-cal">이 기준으로 시작</button>
    `;
  }
  app.innerHTML = `
    <section class="sheet">
      <h1>기준 맞추기</h1>
      ${state.micError ? `<p class="banner">${esc(state.micError)}</p>` : ''}
      ${body}
      <div class="actions">
        <button type="button" data-action="skip-cal">건너뛰기</button>
      </div>
    </section>
  `;
  if (phase === 'adjust') syncCalPreview();
}

function syncCalPreview() {
  const lowInput = document.querySelector('#bound-low');
  const highInput = document.querySelector('#bound-high');
  const preview = document.querySelector('#cal-preview');
  if (!lowInput || !highInput || !preview) return;
  let low = Number(lowInput.value);
  let high = Number(highInput.value);
  if (high < low) [low, high] = [high, low];
  const scale = (db) => Math.min(100, Math.max(0, ((db + 80) / 80) * 100));
  const lowPct = scale(low);
  const highPct = scale(high);
  const parts = preview.querySelectorAll('i');
  parts[0].style.width = `${lowPct}%`;
  parts[1].style.width = `${Math.max(0, highPct - lowPct)}%`;
  parts[2].style.width = `${Math.max(0, 100 - highPct)}%`;
  const needle = document.querySelector('#cal-needle');
  if (needle) needle.style.left = `${needlePercent(meterDb, low, high)}%`;
}

function currentSentence() {
  const race = state.race;
  if (!race) return '';
  if (race.mode === 'speak') return '생각한 것을 말해 볼까요?';
  if (race.reached >= race.goal) return '';
  return sentenceAt(race.sentences, race.reached);
}

function finishSpeech(race) {
  const name = animalName(race.animal);
  const count = Math.max(1, Number(race.goal) || 1);
  if (race.mode === 'speak') {
    return `나는 ${name}야! 오늘 우리 반에서 ${count}명이 발표를 성공했어. 정말 잘했어!`;
  }
  return `나는 ${name}야! 오늘 우리 반에서 ${count}명이 읽기를 성공했어. 정말 잘했어!`;
}

function fitSentenceText() {
  const sentence = document.querySelector('#sentence');
  const box = document.querySelector('.stage-main');
  if (!sentence || !box) return;
  const base = 64;
  const min = 28;
  sentence.style.fontSize = `${base}px`;
  let size = base;
  while (size > min && (sentence.scrollHeight > box.clientHeight || sentence.scrollWidth > box.clientWidth)) {
    size -= 2;
    sentence.style.fontSize = `${size}px`;
  }
}

function paintRace() {
  if (raceMounted && document.querySelector('.race') && document.querySelector('.race-title') && document.querySelector('#track-progress')) {
    syncRace();
    return;
  }
  const race = state.race;
  app.innerHTML = `
    <section class="race">
      <header class="race-head">
        <h1 class="race-title">또박또박 릴레이</h1>
        <button type="button" class="home-btn home-icon-btn" data-action="home" aria-label="홈" title="홈">${homeIcon()}</button>
      </header>
      <div class="race-body">
      <div class="track">
        <div class="track-progress" aria-live="polite">
          <span class="track-progress-label">진행</span>
          <strong id="track-progress">0 / ${esc(race.goal)}</strong>
        </div>
        <div class="lane"></div>
        <div id="runner" class="runner"><div id="animal" data-pose="smile">${animalImg(race.animal, 'smile')}</div></div>
      </div>
      <div class="stage">
        <button type="button" class="step-btn step-back" data-action="undo">&lt;후진</button>
        <div class="stage-main">
          <p id="mic-banner" class="banner" hidden></p>
          <p id="sentence" class="sentence"></p>
        </div>
        <button type="button" class="step-btn step-forward" data-action="pass">전진&gt;</button>
      </div>
      <div class="lower">
        <div class="meter-wrap">
          ${meterMarkup()}
          <p id="hint" class="hint"></p>
        </div>
        <p class="space-tip">스페이스바: 길게 누르면 듣기 · 떼면 일시정지 · 짧게 두 번 누르면 전진</p>
        <div class="teacher">
          <button type="button" data-action="listen">듣기 시작</button>
          <button type="button" data-action="pause">일시정지</button>
        </div>
      </div>
      </div>
      <div id="finish" class="finish" hidden>
        <div class="finish-speech">
          <div class="finish-animal">${animalImg(race.animal, 'done')}</div>
          <div class="finish-bubble">
            <h2>우리 반이 함께 해냈어요!</h2>
            <p id="finish-line" class="finish-line"></p>
          </div>
        </div>
        <div class="actions">
          <button type="button" data-action="undo">&lt;후진</button>
          <button type="button" data-action="records">기록 보기</button>
          <button type="button" class="primary" data-action="home">홈</button>
        </div>
      </div>
      <div id="confetti" class="confetti"></div>
    </section>
  `;
  raceMounted = true;
  syncRace();
}

function syncRace() {
  const race = state.race;
  if (!race) return;
  const sentence = document.querySelector('#sentence');
  if (sentence) sentence.textContent = currentSentence();
  fitSentenceText();
  renderStones(race);
  const track = document.querySelector('.track');
  if (track && race.background) {
    track.style.backgroundImage = `url("${String(race.background).replaceAll('"', '')}")`;
  }
  const runner = document.querySelector('#runner');
  if (runner) placeRunner();
  const banner = document.querySelector('#mic-banner');
  if (banner) {
    banner.hidden = !state.micError;
    banner.textContent = state.micError || '';
  }
  const finish = document.querySelector('#finish');
  if (finish) finish.hidden = race.status !== 'finished';
  const finishLine = document.querySelector('#finish-line');
  if (finishLine && race.status === 'finished') {
    finishLine.textContent = finishSpeech(race);
  }
  const finishAnimal = document.querySelector('.finish-animal');
  if (finishAnimal && race.status === 'finished') {
    finishAnimal.innerHTML = animalImg(race.animal, 'done');
  }
  const progress = document.querySelector('#track-progress');
  if (progress) {
    const left = Math.max(0, race.goal - race.reached);
    progress.textContent = `${left} / ${race.goal}`;
    const label = progress.parentElement?.querySelector('.track-progress-label');
    if (label) label.textContent = left === 0 ? '도착' : '남음';
  }
  const manual = race.judgeMode !== 'auto';
  document.querySelector('.teacher [data-action="listen"]')?.toggleAttribute('hidden', manual);
  document.querySelector('.teacher [data-action="pause"]')?.toggleAttribute('hidden', manual);
  document.querySelector('.teacher [data-action="listen"]')?.classList.toggle('is-on', !manual && race.status === 'listening');
  document.querySelector('.teacher [data-action="pause"]')?.classList.toggle('is-on', !manual && race.status !== 'listening');
  document.querySelector('#manual-note')?.toggleAttribute('hidden', !manual);
  document.querySelector('#voice')?.classList.toggle('is-manual', manual);
  syncAnimal();
  syncMeterBits();
}

function runnerStoneIndex(race) {
  return Math.min(Math.max(race.reached, 0), race.goal);
}

function renderStones(race) {
  const lane = document.querySelector('.lane');
  if (!lane) return;
  const index = runnerStoneIndex(race);
  const view = stoneWindow(race.goal, index);
  const key = `${view.start}:${view.count}:${race.goal}`;
  if (lane.dataset.window !== key) {
    lane.dataset.window = key;
    lane.innerHTML = Array.from({ length: view.count }, (_, offset) => {
      const stone = view.start + offset;
      const label = stoneLabel(stone, race.goal);
      const kind = stone <= 0 ? 'start' : stone >= race.goal ? 'finish' : 'mid';
      const flag = kind === 'finish' ? '<span class="flag"></span>' : '';
      return `<div class="cell cell-${kind}" data-index="${stone}">${flag}<span class="stone-no">${esc(label)}</span><i class="print"></i></div>`;
    }).join('');
  }
  lane.querySelectorAll('.cell').forEach((cell) => {
    const stone = Number(cell.dataset.index);
    cell.classList.toggle('done', stone < race.reached);
    cell.classList.toggle('current', stone === index);
  });
}

function placeRunner() {
  const race = state.race;
  const runner = document.querySelector('#runner');
  const lane = document.querySelector('.lane');
  const track = document.querySelector('.track');
  if (!race || !runner || !lane || !track) return;
  const index = runnerStoneIndex(race);
  const cell = lane.querySelector(`[data-index="${index}"]`);
  if (!cell) return;
  const trackBox = track.getBoundingClientRect();
  const cellBox = cell.getBoundingClientRect();
  runner.style.left = `${cellBox.left + cellBox.width / 2 - trackBox.left}px`;
  runner.style.top = `${cellBox.top + cellBox.height / 2 - trackBox.top}px`;
}

function syncAnimal() {
  const race = state.race;
  const animal = document.querySelector('#animal');
  if (!race || !animal) return;
  const pose = poseForStep({ reached: race.reached, goal: race.goal, jumping: race.jumping });
  if (animal.dataset.pose === pose) return;
  animal.dataset.pose = pose;
  animal.innerHTML = animalImg(race.animal, pose);
}

function resetVoiceZones() {
  document.querySelectorAll('.voice-bar').forEach((bar) => {
    bar.style.gridTemplateColumns = '1fr 1fr 1fr';
  });
}

function applyMicSensitivity(value = state.settings.micSensitivity) {
  const sensitivity = clampMicSensitivity(value);
  const noiseDb = Number.isFinite(state.calibration?.noiseDb)
    ? state.calibration.noiseDb
    : defaultCalibration().noiseDb;
  const calibration = boundsFromSensitivity(noiseDb, sensitivity);
  state.calibration = calibration;
  state.settings.micSensitivity = sensitivity;
  saveCalibration(calibration);
  saveSettings(state.settings);
  return calibration;
}

function syncTextGhost() {
  const text = document.querySelector('#text');
  const ghost = document.querySelector('.text-ghost');
  if (!text || !ghost) return;
  ghost.hidden = Boolean(String(text.value || '').trim());
}

function syncSetupMeter() {
  if (state.screen !== 'setup') return;
  resetVoiceZones();
  const cal = activeCalibration();
  const needle = document.querySelector('#needle');
  if (needle) needle.style.left = `${needlePercent(meterDb, cal.lowBound, cal.highBound)}%`;
  const zone = rawZone(meterDb, cal.lowBound, cal.highBound);
  const voice = document.querySelector('#voice');
  if (!voice) return;
  voice.classList.toggle('is-loud', zone === 'loud');
  voice.classList.toggle('is-good', zone === 'good');
  voice.classList.toggle('is-quiet', zone === 'quiet');
}

function syncMeterBits() {
  const race = state.race;
  if (!race || state.screen !== 'race') return;
  const cal = activeCalibration();
  resetVoiceZones();
  const needle = document.querySelector('#needle');
  if (needle && race.judgeMode === 'auto') {
    needle.style.left = `${needlePercent(meterDb, cal.lowBound, cal.highBound)}%`;
  }
  const hint = document.querySelector('#hint');
  if (hint && race.status === 'listening') hint.textContent = race.hint || '';
  if (hint && race.status !== 'listening') hint.textContent = '';
  const voice = document.querySelector('#voice');
  if (voice) {
    voice.classList.toggle('is-loud', race.feedback === 'loud' && race.status === 'listening');
    voice.classList.toggle('is-good', race.feedback === 'good' && race.status === 'listening');
    voice.classList.toggle('is-quiet', race.feedback === 'quiet' && race.status === 'listening');
  }
}

function hop() {
  const race = state.race;
  const runner = document.querySelector('#runner');
  if (!race || !runner) return;
  race.jumping = true;
  syncAnimal();
  runner.classList.remove('hop');
  void runner.offsetWidth;
  runner.classList.add('hop');
  window.clearTimeout(jumpTimer);
  jumpTimer = window.setTimeout(() => {
    if (!state.race) return;
    state.race.jumping = false;
    syncAnimal();
  }, 600);
}

function handleFrame({ db, dt }) {
  meterDb = db;
  if (sampleBucket) sampleBucket.push(db);
  if (state.screen === 'setup') syncSetupMeter();
  if (state.screen === 'calibrate' && state.cal?.phase === 'adjust') syncCalPreview();
  const race = state.race;
  if (!race || state.screen !== 'race' || race.judgeMode !== 'auto' || race.status !== 'listening' || !judge) return;
  if (!listeningArmed) {
    listeningArmed = true;
    return;
  }
  const result = judge.push(db, dt);
  race.zone = result.zone;
  race.feedback = result.feedback;
  race.accumulatedMs = result.accumulatedMs;
  race.progress = race.requiredMs ? Math.min(1, result.accumulatedMs / race.requiredMs) : 0;
  race.face = 'smile';
  race.hint = hintFromFeedback(result.feedback);
  if (
    race.status === 'listening'
    && (result.feedback === 'loud' || result.feedback === 'quiet')
    && result.feedback !== lastWrongFeedback
  ) {
    lastWrongFeedback = result.feedback;
    playWrongSound();
  }
  if (result.feedback === 'good' || result.feedback === 'none') {
    lastWrongFeedback = '';
  }
  syncMeterBits();
  if (result.passed) passTurn();
}

async function ensureMeter() {
  if (meter) return true;
  const opened = await openMeter({
    deviceId: state.settings.deviceId,
    onFrame: handleFrame,
    onError(error) {
      state.micError = error.code === 'insecure'
        ? 'https 주소에서 열어 주세요. 지금은 선생님 버튼으로 진행해요.'
        : '마이크를 쓸 수 없어요. 선생님 버튼으로 계속할 수 있어요.';
    },
  });
  meter = opened;
  if (!meter) return false;
  state.micError = '';
  state.devices = await listInputs();
  fillDeviceSelects();
  return true;
}

function fallbackManual() {
  if (state.race) state.race.judgeMode = 'manual';
  if (!state.micError) {
    state.micError = '마이크를 쓸 수 없어요. 선생님 버튼으로 계속할 수 있어요.';
  }
}

function collectSeconds(seconds, token) {
  sampleBucket = [];
  return new Promise((resolve) => {
    const started = performance.now();
    const timer = window.setInterval(() => {
      const left = Math.max(1, Math.ceil((seconds * 1000 - (performance.now() - started)) / 1000));
      const count = document.querySelector('#cal-count');
      if (count) count.textContent = String(left);
      if (token !== calToken || performance.now() - started >= seconds * 1000) {
        window.clearInterval(timer);
        const out = sampleBucket ? sampleBucket.slice() : [];
        sampleBucket = null;
        resolve(out);
      }
    }, 100);
  });
}

async function beginCalibration() {
  const token = ++calToken;
  state.micError = '';
  state.cal = { phase: 'wait', left: 3 };
  paintCalibrate();
  const ok = await ensureMeter();
  if (token !== calToken) return;
  if (!ok) {
    fallbackManual();
    show('race');
    return;
  }
  state.cal = { phase: 'quiet', left: 3 };
  paintCalibrate();
  const noiseSamples = await collectSeconds(3, token);
  if (token !== calToken) return;
  const noiseDb = median(noiseSamples);
  state.cal = { phase: 'demo', left: 3, noiseDb };
  paintCalibrate();
  const demoSamples = await collectSeconds(3, token);
  if (token !== calToken) return;
  const demoDb = median(demoSamples);
  const bounds = boundsFromCalibration(noiseDb ?? state.calibration?.noiseDb, demoDb);
  state.cal = { phase: 'adjust', ...bounds };
  paintCalibrate();
}

function skipCalibration() {
  calToken += 1;
  sampleBucket = null;
  if (!state.calibration) {
    state.calibration = defaultCalibration();
    saveCalibration(state.calibration);
  }
  show('race');
  if (state.race?.judgeMode === 'auto') ensureMeter();
}

function saveCalFromSliders() {
  const low = Number(document.querySelector('#bound-low')?.value);
  const high = Number(document.querySelector('#bound-high')?.value);
  const noiseDb = Number.isFinite(state.cal?.noiseDb) ? state.cal.noiseDb : defaultCalibration().noiseDb;
  let lowBound = Math.min(low, high);
  let highBound = Math.max(low, high);
  if (highBound - lowBound < 3) highBound = lowBound + 3;
  const calibration = { noiseDb, lowBound, highBound };
  saveCalibration(calibration);
  state.calibration = calibration;
  show('race');
  if (state.race?.judgeMode === 'auto') ensureMeter();
}

function createRace(settings, sentences) {
  const goalMode = settings.mode === 'speak' ? 'manual' : settings.goalMode;
  return {
    sentences,
    goal: resolveGoal(goalMode, settings.goalSteps, sentences.length),
    reached: 0,
    status: 'idle',
    mode: settings.mode,
    judgeMode: settings.judgeMode,
    secPerChar: settings.secPerChar,
    speakSeconds: Number(settings.speakSeconds) || 5,
    animal: settings.animal,
    background: randomBackgroundUrl(),
    jumping: false,
    cheer: '',
    face: 'default',
    feedback: 'none',
    zone: 'quiet',
    progress: 0,
    hint: '',
    recordId: null,
    requiredMs: 0,
    accumulatedMs: 0,
  };
}

function startFromSetup() {
  const settings = readSetup();
  state.settings = settings;
  saveSettings(settings);
  state.notice = '';
  const sentences = settings.mode === 'read' ? parseSentences(settings.text) : [];
  if (settings.mode === 'read' && sentences.length === 0) {
    state.notice = '읽을 문장을 한 줄씩 넣어 주세요.';
    paintSetup();
    return;
  }
  state.race = createRace(settings, sentences);
  persistSetupCalibration();
  show('race');
  if (settings.judgeMode === 'auto') ensureMeter();
}

function persistSetupCalibration() {
  const value = document.querySelector('#mic-sensitivity')?.value ?? state.settings.micSensitivity;
  applyMicSensitivity(value);
}

async function startListening() {
  const race = state.race;
  if (!race || race.status !== 'idle' || race.judgeMode !== 'auto' || race.reached >= race.goal || armingListen) return;
  const token = ++listenToken;
  armingListen = true;
  try {
    const ok = await ensureMeter();
    if (token !== listenToken || !state.race || state.race.status !== 'idle') return;
    if (!ok) {
      fallbackManual();
      syncRace();
      return;
    }
    const text = race.mode === 'read' ? sentenceAt(race.sentences, race.reached) : '';
    race.requiredMs = race.mode === 'speak' ? race.speakSeconds * 1000 : requiredMsForText(text, race.secPerChar);
    const cal = activeCalibration();
    judge = createJudge({
      noiseDb: cal.noiseDb,
      lowBound: cal.lowBound,
      highBound: cal.highBound,
      requiredMs: race.requiredMs,
    });
    listeningArmed = false;
    race.status = 'listening';
    race.progress = 0;
    race.cheer = '';
    race.face = 'default';
    race.hint = '';
    race.feedback = 'none';
    race.accumulatedMs = 0;
    syncRace();
  } finally {
    armingListen = false;
  }
}

function pauseListening() {
  listenToken += 1;
  const race = state.race;
  if (!race || race.status !== 'listening') return;
  race.status = 'idle';
  race.progress = 0;
  race.face = 'default';
  race.hint = '';
  race.feedback = 'none';
  race.accumulatedMs = 0;
  listeningArmed = false;
  lastWrongFeedback = '';
  judge?.reset();
  syncRace();
}

function passTurn() {
  listenToken += 1;
  const race = state.race;
  if (!race || race.status === 'celebrate' || race.status === 'finished' || race.reached >= race.goal) return;
  race.status = 'celebrate';
  race.reached += 1;
  race.cheer = cheerText(race.reached, race.goal);
  race.face = 'smile';
  race.hint = '';
  race.feedback = 'good';
  race.progress = 1;
  listeningArmed = false;
  lastWrongFeedback = '';
  judge?.reset();
  syncRace();
  hop();
  playCorrectSound();
  window.clearTimeout(celebrateTimer);
  celebrateTimer = window.setTimeout(() => {
    if (!state.race || state.race !== race) return;
    if (race.reached >= race.goal) finishRace();
    else {
      race.status = 'idle';
      race.cheer = '';
      race.face = 'default';
      race.progress = 0;
      race.feedback = 'none';
      syncRace();
      if (spaceHeld) startListening();
    }
  }, 1500);
}

function finishRace() {
  const race = state.race;
  if (!race) return;
  race.status = 'finished';
  race.cheer = '우리 반이 함께 해냈어요!';
  race.face = 'smile';
  saveRaceRecord(true);
  syncRace();
  burstConfetti(document.querySelector('#confetti'));
  playFinishSound();
}

function saveRaceRecord(completed) {
  const race = state.race;
  if (!race || race.recordId) return;
  const record = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    date: new Date().toISOString(),
    animal: race.animal,
    mode: race.mode,
    goalSteps: race.goal,
    reachedSteps: race.reached,
    completed: Boolean(completed),
    textPreview: textPreview(race.sentences),
  };
  if (addRecord(record)) race.recordId = record.id;
}

function undoStep() {
  const race = state.race;
  if (!race || race.reached <= 0 || race.status === 'listening') return;
  window.clearTimeout(celebrateTimer);
  window.clearTimeout(jumpTimer);
  if (race.recordId) {
    removeRecord(race.recordId);
    race.recordId = null;
  }
  race.reached -= 1;
  race.status = 'idle';
  race.cheer = '';
  race.face = 'default';
  race.progress = 0;
  race.hint = '';
  race.feedback = 'none';
  race.jumping = false;
  playWrongSound();
  syncRace();
}

function goHome() {
  pauseListening();
  window.clearTimeout(celebrateTimer);
  window.clearTimeout(jumpTimer);
  if (state.race && state.race.reached > 0) {
    saveRaceRecord(state.race.reached >= state.race.goal);
  }
  state.race = null;
  show('title');
}

async function refreshMic() {
  state.micStatus = '확인하고 있어요.';
  const status = document.querySelector('#mic-status');
  if (status) status.textContent = state.micStatus;
  if (meter) {
    meter.stop();
    meter = null;
  }
  const ok = await ensureMeter();
  state.micStatus = ok ? '마이크를 쓸 수 있어요.' : (state.micError || '마이크를 쓸 수 없어요.');
  const next = document.querySelector('#mic-status');
  if (next) next.textContent = state.micStatus;
}

async function changeDevice(id) {
  state.settings.deviceId = id;
  saveSettings(state.settings);
  pauseListening();
  if (meter) {
    meter.stop();
    meter = null;
  }
  if (state.race?.judgeMode === 'auto' || state.screen === 'calibrate') await ensureMeter();
}

function formatWhen(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function paintRecords() {
  const records = loadRecords()
    .slice()
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const now = new Date();
  const monthSum = records
    .filter((record) => {
      const date = new Date(record.date);
      return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
    })
    .reduce((sum, record) => sum + (Number(record.reachedSteps) || 0), 0);
  const items = records.length
    ? records.map((record) => {
      const done = record.completed ? '함께 도착' : `${record.reachedSteps}/${record.goalSteps}칸`;
      const preview = record.textPreview ? ` · ${esc(record.textPreview)}` : '';
      return `<li>${esc(formatWhen(record.date))} · ${esc(animalName(record.animal))} · ${record.mode === 'speak' ? '발표' : '읽기'} · ${esc(done)}${preview}</li>`;
    }).join('')
    : '<li>아직 기록이 없어요.</li>';
  const backLabel = state.recordsBack === 'race' ? '경주로 돌아가기' : '처음으로';
  app.innerHTML = `
    <section class="sheet">
      <h1>기록</h1>
      <div class="records-head">
        <p class="sum">이번 달 우리 반이 함께 간 칸 수: ${monthSum}</p>
        <div class="records-actions">
          <button type="button" data-action="ask-clear">전체 지우기</button>
          <button type="button" class="primary" data-action="records-back">${backLabel}</button>
        </div>
      </div>
      <ul class="record-list">${items}</ul>
    </section>
  `;
}

function handleUiAction(event) {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  if (action === 'toggle-sound') {
    state.soundOpen = !state.soundOpen;
    syncSoundButton();
    bgmUnlocked = true;
    playTitleBgm();
    return;
  }
  if (action === 'help') {
    openHelpDialog();
    return;
  }
  if (action === 'creator') {
    openCreatorDialog();
    return;
  }
  if (action === 'close-dialog') {
    closeSiteDialog();
    return;
  }
  if (action === 'animal') {
    const next = readSetup();
    next.animal = button.dataset.animal;
    state.settings = next;
    saveSettings(next);
    paintSetup();
    return;
  }
  if (action === 'start') startFromSetup();
  else if (action === 'go-setup') show('setup');
  else if (action === 'home') goHome();
  else if (action === 'refresh-mic') refreshMic();
  else if (action === 'records') {
    rememberSetup();
    if (state.screen === 'race') {
      pauseListening();
      state.recordsBack = 'race';
    } else if (state.screen === 'setup') {
      state.recordsBack = 'setup';
    } else {
      state.recordsBack = 'title';
    }
    show('records');
  } else if (action === 'records-back') show(state.recordsBack || 'title');
  else if (action === 'skip-cal') skipCalibration();
  else if (action === 'save-cal') saveCalFromSliders();
  else if (action === 'listen') startListening();
  else if (action === 'pause') pauseListening();
  else if (action === 'pass') passTurn();
  else if (action === 'undo') undoStep();
  else if (action === 'ask-clear') {
    openClearRecordsDialog();
  } else if (action === 'do-clear') {
    clearRecords();
    closeSiteDialog();
    paintRecords();
  }
}

document.addEventListener('click', (event) => {
  const actionEl = event.target.closest('[data-action]');
  if (actionEl) {
    handleUiAction(event);
  } else if (state.screen === 'title' && !bgmUnlocked) {
    bgmUnlocked = true;
    playTitleBgm();
  }
  if (state.soundOpen && !event.target.closest('.sound-control')) {
    state.soundOpen = false;
    syncSoundButton();
  }
  if (!siteDialog?.hidden && event.target === siteDialog) closeSiteDialog();
});

app.addEventListener('change', (event) => {
  const target = event.target;
  if (target.name === 'mode' || target.name === 'goalMode' || target.name === 'judgeMode' || target.name === 'speakSeconds') {
    state.settings = readSetup();
    saveSettings(state.settings);
    if (target.name === 'mode' || target.name === 'goalMode') paintSetup();
  }
  if (target.id === 'device-setup' || target.id === 'device-race') changeDevice(target.value);
});

app.addEventListener('input', (event) => {
  const target = event.target;
  if (target.id === 'bgm-volume') {
    saveBgmVolume(target.value);
    playTitleBgm();
  }
  if (target.id === 'text' || target.id === 'goal-steps') {
    state.settings = readSetup();
    saveSettings(state.settings);
    if (target.id === 'text') syncTextGhost();
  }
  if (target.id === 'mic-sensitivity') {
    applyMicSensitivity(target.value);
    syncSetupMeter();
  }
  if (target.id === 'sec-per-setup') {
    const label = document.querySelector('#sec-label');
    if (label) label.textContent = `${Number(target.value).toFixed(2)}초`;
    state.settings = readSetup();
    saveSettings(state.settings);
  }
  if (target.id === 'sec-per') {
    const label = document.querySelector('#sec-per-label');
    if (label) label.textContent = `${Number(target.value).toFixed(2)}초`;
    if (state.race) state.race.secPerChar = Number(target.value);
    state.settings.secPerChar = Number(target.value);
    saveSettings(state.settings);
  }
  if (target.id === 'bound-low' || target.id === 'bound-high') syncCalPreview();
});

document.addEventListener('keydown', (event) => {
  if (state.screen !== 'race') return;
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  if (event.key === ' ' || event.code === 'Space') {
    event.preventDefault();
    if (event.repeat) return;
    const now = performance.now();
    if (now - lastSpaceUpAt < 400 && lastTapDuration < 400) {
      spaceDouble = true;
      spaceHeld = false;
      lastSpaceUpAt = 0;
      lastTapDuration = Infinity;
      pauseListening();
      passTurn();
      return;
    }
    spaceDouble = false;
    spaceHeld = true;
    spaceDownAt = now;
    startListening();
  } else if (event.key === 'Escape') {
    pauseListening();
  } else if (event.key === 'Enter') {
    event.preventDefault();
    passTurn();
  } else if (event.key === 'Backspace') {
    event.preventDefault();
    undoStep();
  }
});

document.addEventListener('keyup', (event) => {
  if (state.screen !== 'race') return;
  if (event.key !== ' ' && event.code !== 'Space') return;
  if (spaceDouble) {
    spaceDouble = false;
    spaceHeld = false;
    lastSpaceUpAt = 0;
    lastTapDuration = Infinity;
    return;
  }
  spaceHeld = false;
  lastTapDuration = performance.now() - spaceDownAt;
  lastSpaceUpAt = performance.now();
  pauseListening();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    spaceHeld = false;
    pauseListening();
    pauseTitleBgm();
  } else if (state.screen === 'title') {
    playTitleBgm();
  }
});

window.addEventListener('resize', () => {
  if (state.screen === 'race') {
    placeRunner();
    fitSentenceText();
  }
});

paintFooter();
paint();
ensureBgm();
playTitleBgm();
