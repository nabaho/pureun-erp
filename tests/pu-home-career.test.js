'use strict';
/* 경력관리 항목 → 홈페이지 경력사항 문장.
   기간이 끝난 것을 現 으로 올려두면 밖에서 보기에 나쁘다. 그 판단을 여기서 한다.
   실행: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');
function load() {
  const ctx = { window: undefined, globalThis: {} };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(R, 'js', 'pu-home-career.js'), 'utf8'), ctx);
  return ctx.globalThis.PuHomeCareer;
}
const C = load();
const TODAY = '2026-08-16';

test('진행중이면 現 을 붙인다', () => {
  const r = C.toLine({ org: '충남', role: '노동권익보호관', end: '' }, TODAY);
  assert.equal(r.text, '現 충남 노동권익보호관');
  assert.equal(r.ended, false);
});

test('기간이 끝났으면 前 을 붙인다', () => {
  const r = C.toLine({ org: '대전질병판정위원회', role: '위원', end: '2026-04-30' }, TODAY);
  assert.equal(r.text, '前 대전질병판정위원회 위원');
  assert.equal(r.ended, true);
});

test('오늘이 끝나는 날이면 아직 끝난 게 아니다', () => {
  const r = C.toLine({ org: '가', role: '위원', end: TODAY }, TODAY);
  assert.equal(r.ended, false);
});

test('기간을 모르면 끝났다고 단정하지 않고 표시만 남긴다', () => {
  const r = C.toLine({ org: '노사발전재단', role: '차별시정 강사' }, TODAY);
  assert.equal(r.text, '現 노사발전재단 차별시정 강사');
  assert.equal(r.unknown, true);
});

test('직책이 없으면 기관명만 쓴다', () => {
  const r = C.toLine({ org: 'ISO 45001 심사원' }, TODAY);
  assert.equal(r.text, '現 ISO 45001 심사원');
});

test('홈페이지에 現 으로 있는데 기간이 끝난 것을 찾아낸다', () => {
  const live = ['現 충남 노동권익보호관', '現 대전질병판정위원회 위원'];
  const items = [
    { org: '충남', role: '노동권익보호관', end: '' },
    { org: '대전질병판정위원회', role: '위원', end: '2026-04-30' }
  ];
  const bad = C.expiredInLive(live, items, TODAY);
  assert.deepEqual(bad, ['現 대전질병판정위원회 위원']);
});

/* --- 검토 지적 반영 검사 --- */

test('period 만 있고 범위 표시 없이 날짜 하나뿐이면 시작일로 보고 끝났다고 단정하지 않는다', () => {
  const r1 = C.toLine({ org: '가', role: '나', period: '2020-01' }, TODAY);
  assert.equal(r1.ended, false);
  assert.equal(r1.unknown, true);

  const r2 = C.toLine({ org: '가', role: '나', period: '2020-01-15' }, TODAY);
  assert.equal(r2.ended, false);
  assert.equal(r2.unknown, true);

  const r3 = C.toLine({ org: '가', role: '나', period: '2022-05 ~ 2026-04' }, TODAY);
  assert.equal(r3.ended, true);

  const r4 = C.toLine({ org: '가', role: '나', period: '2024. 3. ~ 현재' }, TODAY);
  assert.equal(r4.ended, false);
  assert.equal(r4.unknown, true);
});

test('end 칸이 날짜로 안 읽히면 period 의 진짜 끝난 날짜를 본다', () => {
  const r = C.toLine({ org: '가', role: '나', end: '현재', period: '2022-05 ~ 2026-04' }, TODAY);
  assert.equal(r.ended, true);
  assert.equal(r.text, '前 가 나');
});

test('공백 개수나 가운뎃점 표기가 달라도 만료 항목을 잡아낸다', () => {
  const live = [
    '現  충남지방노동위원회 심판담당공익위원 ',
    '現 충남지방노동위원회·심판담당공익위원'
  ];
  const items = [
    { org: '충남지방노동위원회', role: '심판담당공익위원', end: '2026-04-30' }
  ];
  const bad = [...C.expiredInLive(live, items, TODAY)];
  assert.deepEqual(bad, live);
});

test('일자 없이 연-월만 있어도 지났는지 비교 방향은 맞다', () => {
  /* end: '2026-04' 처럼 일자가 없으면 31일로 채운다. 실제로 없는 날짜(2026-04-31)가
     만들어질 수 있지만, "이 기간이 지났는가"를 비교하는 방향은 항상 안전하다. */
  const r = C.toLine({ org: '가', role: '나', end: '2026-04' }, TODAY);
  assert.equal(r.ended, true);
});
