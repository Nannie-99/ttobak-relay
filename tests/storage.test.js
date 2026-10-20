import assert from 'node:assert/strict';
import test from 'node:test';
import { addRecord, clearRecords, loadRecords, loadSettings, RECORDS_KEY, saveSettings } from '../src/storage.js';

function memoryStorage() {
  const map = new Map();
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(key, String(value));
    },
    removeItem(key) {
      map.delete(key);
    },
  };
}

test('설정과 기록은 기기에 저장되고 학생 이름은 들어가지 않는다', () => {
  globalThis.localStorage = memoryStorage();
  assert.equal(saveSettings({ animal: 'dog', mode: 'speak', text: '안녕' }), true);
  assert.equal(loadSettings().animal, 'dog');
  assert.equal(loadSettings().mode, 'speak');
  addRecord({
    id: 'r1',
    date: '2026-10-20T01:00:00.000Z',
    animal: 'dog',
    mode: 'read',
    goalSteps: 3,
    reachedSteps: 2,
    completed: false,
    textPreview: '안녕하세요',
    studentName: '홍길동',
    number: 12,
  });
  const raw = globalThis.localStorage.getItem(RECORDS_KEY);
  assert.equal(raw.includes('홍길동'), false);
  assert.equal(raw.includes('studentName'), false);
  assert.equal(loadRecords()[0].textPreview, '안녕하세요');
  assert.equal(clearRecords(), true);
  assert.deepEqual(loadRecords(), []);
});

test('저장소가 고장 나도 멈추지 않고 기본값으로 돌아온다', () => {
  globalThis.localStorage = {
    getItem() {
      throw new Error('blocked');
    },
    setItem() {
      throw new Error('blocked');
    },
  };
  assert.equal(saveSettings({ animal: 'bear' }), false);
  assert.equal(loadSettings().animal, 'rabbit');
  assert.deepEqual(loadRecords(), []);
});
