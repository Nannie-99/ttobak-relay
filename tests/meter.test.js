import assert from 'node:assert/strict';
import test from 'node:test';
import { micConstraints, rmsToDbfs, smoothDb, zoneWidths } from '../src/audio/meter.js';

test('마이크 보정 기능 세 가지는 모두 꺼져 있다', () => {
  const { audio } = micConstraints();
  assert.equal(audio.echoCancellation, false);
  assert.equal(audio.noiseSuppression, false);
  assert.equal(audio.autoGainControl, false);
});

test('고른 마이크가 있어도 보정 기능은 꺼진 채로 남는다', () => {
  const { audio } = micConstraints('mic-1');
  assert.equal(audio.echoCancellation, false);
  assert.equal(audio.noiseSuppression, false);
  assert.equal(audio.autoGainControl, false);
  assert.deepEqual(audio.deviceId, { ideal: 'mic-1' });
});

test('RMS를 dBFS로 바꾼다', () => {
  const samples = new Float32Array(8).fill(0.1);
  assert.ok(Math.abs(rmsToDbfs(samples) - (-20)) < 0.001);
  assert.equal(rmsToDbfs(new Float32Array(4)), -100);
});

test('목소리 크기는 0.3 비율로 부드럽게 이어진다', () => {
  assert.equal(smoothDb(0, 10, 0.3), 3);
  assert.equal(smoothDb(null, -12, 0.3), -12);
});

test('경계에 따라 작아요·딱 좋아요·너무 커요 길이가 달라진다', () => {
  const wide = zoneWidths(-40, -10);
  const narrow = zoneWidths(-30, -25);
  assert.ok(wide.good > narrow.good);
  assert.ok(wide.quiet > 0 && wide.loud > 0);
});
