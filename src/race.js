export function parseSentences(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export const STONES_PER_SCREEN = 5;
export const MANUAL_GOAL_MAX = 30;

export function resolveGoal(goalMode, goalSteps, sentenceCount) {
  if (goalMode === 'auto') {
    const count = Number(sentenceCount) || 0;
    return Math.max(1, count);
  }
  const n = Math.round(Number(goalSteps));
  if (!Number.isFinite(n)) return 1;
  return Math.min(MANUAL_GOAL_MAX, Math.max(1, n));
}

/** 시작 돌 + 중간 돌 + 도착 돌 */
export function stoneTotal(goal) {
  return Math.max(2, (Number(goal) || 1) + 1);
}

export function stoneLabel(stone, goal) {
  const g = Math.max(1, Number(goal) || 1);
  const i = Number(stone) || 0;
  if (i <= 0) return '시작';
  if (i >= g) return '도착';
  return String(i);
}

export function stoneWindow(goal, index) {
  const total = stoneTotal(goal);
  const safeIndex = Math.min(Math.max(Number(index) || 0, 0), total - 1);
  const start = Math.floor(safeIndex / STONES_PER_SCREEN) * STONES_PER_SCREEN;
  const count = Math.min(STONES_PER_SCREEN, total - start);
  return { start, count, index: safeIndex };
}

export function sentenceAt(sentences, index) {
  if (!sentences?.length) return '';
  const i = ((index % sentences.length) + sentences.length) % sentences.length;
  return sentences[i];
}

export function cheerText(reached, goal) {
  if (reached >= goal) return '우리 반이 함께 해냈어요!';
  if (reached % 2 === 1) return '우리 반이 한 칸 더 왔어요!';
  return `${goal - reached}칸 남았어요, 함께 가요!`;
}

export function textPreview(sentences) {
  const first = sentences?.[0] || '';
  return Array.from(first).slice(0, 20).join('');
}
