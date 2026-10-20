import assert from 'node:assert/strict';
import test from 'node:test';
import { cheerText, parseSentences, resolveGoal, sentenceAt, stoneLabel, stoneTotal, stoneWindow, textPreview } from '../src/race.js';

test('빈 줄은 문장에서 빠지고, 칸이 더 많으면 문장을 처음부터 다시 쓴다', () => {
  const sentences = parseSentences(' 하나 \n\n둘\n');
  assert.deepEqual(sentences, ['하나', '둘']);
  assert.equal(sentenceAt(sentences, 2), '하나');
  assert.equal(sentenceAt(sentences, 3), '둘');
});

test('직접 입력은 1에서 30까지이고, 지문 줄 수는 제한이 없다', () => {
  assert.equal(resolveGoal('auto', 5, 50), 50);
  assert.equal(resolveGoal('auto', 5, 3), 3);
  assert.equal(resolveGoal('manual', 0, 10), 1);
  assert.equal(resolveGoal('manual', 99, 10), 30);
});

test('시작·중간·도착 돌이 있고 한 화면에는 최대 5개만 보인다', () => {
  assert.equal(stoneTotal(5), 6);
  assert.equal(stoneLabel(0, 5), '시작');
  assert.equal(stoneLabel(1, 5), '1');
  assert.equal(stoneLabel(5, 5), '도착');
  assert.deepEqual(stoneWindow(12, 0), { start: 0, count: 5, index: 0 });
  assert.deepEqual(stoneWindow(12, 5), { start: 5, count: 5, index: 5 });
  assert.deepEqual(stoneWindow(12, 12), { start: 10, count: 3, index: 12 });
});

test('통과 문구는 반 전체를 말한다', () => {
  assert.equal(cheerText(1, 4), '우리 반이 한 칸 더 왔어요!');
  assert.equal(cheerText(2, 4), '2칸 남았어요, 함께 가요!');
  assert.equal(cheerText(4, 4), '우리 반이 함께 해냈어요!');
  assert.equal(textPreview(['가나다라마바사아자차카타파하ABCDEFGHIJK']), '가나다라마바사아자차카타파하ABCDEF');
});
