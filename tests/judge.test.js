import assert from 'node:assert/strict';
import test from 'node:test';
import {
  boundsFromCalibration,
  boundsFromSensitivity,
  countHangul,
  judgeSeries,
  requiredMsForText,
} from '../src/judge.js';

const config = {
  noiseDb: -45,
  lowBound: -35,
  highBound: -15,
  requiredMs: 3000,
};

function fill(db, ms, dtMs = 50) {
  const count = Math.round(ms / dtMs);
  return Array.from({ length: count }, () => ({ db, dtMs }));
}

test('조용한 신호만 있으면 통과하지 않는다', () => {
  const result = judgeSeries(fill(-70, 5000), config);
  assert.equal(result.passed, false);
  assert.equal(result.zone, 'quiet');
  assert.equal(result.accumulatedMs, 0);
  assert.notEqual(result.feedback, 'loud');
});

test('알맞음 2초 + 큼 1초 + 알맞음 1초(필요 3초)면 통과한다', () => {
  const samples = [...fill(-25, 2000), ...fill(-5, 1000), ...fill(-25, 1000)];
  const result = judgeSeries(samples, config);
  assert.equal(result.passed, true);
  assert.equal(result.accumulatedMs, 3000);
});

test('150ms 미만의 짧은 튐으로는 구간이 바뀌지 않는다', () => {
  const samples = [...fill(-25, 1000, 10), ...fill(-5, 140, 10), ...fill(-25, 200, 10)];
  const result = judgeSeries(samples, config);
  assert.ok(result.trace.every((zone) => zone === 'good'));
  assert.equal(result.zone, 'good');
});

test('150ms 동안 이어지면 구간이 바뀐다', () => {
  const samples = [...fill(-25, 500, 10), ...fill(-5, 150, 10)];
  const result = judgeSeries(samples, config);
  assert.equal(result.zone, 'loud');
});

test('큼만 계속되면 통과하지 않고 큼 피드백이다', () => {
  const result = judgeSeries(fill(-5, 2000), config);
  assert.equal(result.passed, false);
  assert.equal(result.zone, 'loud');
  assert.equal(result.feedback, 'loud');
  assert.equal(result.accumulatedMs, 0);
});

test('소음보다 크지만 알맞음보다 작으면 작음 피드백이다', () => {
  const result = judgeSeries(fill(-40, 1000), config);
  assert.equal(result.zone, 'quiet');
  assert.equal(result.feedback, 'quiet');
  assert.equal(result.passed, false);
});

test('한글만 세고 필요 시간은 1.5초에서 8초 사이다', () => {
  assert.equal(countHangul('안녕! 123 hello'), 2);
  assert.equal(requiredMsForText('안녕'), 1500);
  assert.equal(requiredMsForText('가'.repeat(50), 0.2), 8000);
  assert.equal(requiredMsForText('가나다라마바사아', 0.1), 1500);
  assert.equal(requiredMsForText('가'.repeat(10), 0.35), 3500);
});

test('보정 경계: 시범이 없으면 소음+10부터 소음+30까지가 알맞음이다', () => {
  assert.deepEqual(boundsFromCalibration(-40, null), {
    noiseDb: -40,
    lowBound: -30,
    highBound: -10,
  });
  assert.deepEqual(boundsFromCalibration(-40, -22), {
    noiseDb: -40,
    lowBound: -30,
    highBound: -14,
  });
  const flipped = boundsFromCalibration(-40, -50);
  assert.equal(flipped.lowBound, -30);
  assert.ok(flipped.highBound > flipped.lowBound);
});

test('마이크 민감도가 높을수록 더 작은 목소리도 딱 좋아요에 들어온다', () => {
  const dull = boundsFromSensitivity(-45, 0);
  const keen = boundsFromSensitivity(-45, 100);
  assert.ok(keen.lowBound < dull.lowBound);
  assert.equal(Math.round(keen.highBound - keen.lowBound), 18);
  assert.equal(Math.round(dull.highBound - dull.lowBound), 18);
});
