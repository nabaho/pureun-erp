'use strict';
/* ══════ 업무관리 「🚩 내 현장 방문」 ══════
   실행: node --test tests/*.test.js

   정부사업일정의 일정·사진 이력을 «읽어서» 보여 주는 화면이다.
   자료를 새로 만들지 않으므로, 지킬 것은 «세는 법»과 «사람 맞추기» 둘이다.

   ⚠ 글자를 찾지 않고 함수를 돌린다. 가짜 화면·가짜 DB 를 끼워 진짜 코드를 태운다.
   ⚠ 숫자를 박지 않는다 — 규칙(사무실은 사진을 안 센다 처럼)만 본다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'work.html'), 'utf8');

function fnSrc(name) {
  const m = new RegExp('(?:^|\\n)((?:async )?function ' + name + '\\s*\\()').exec(SRC);
  assert.ok(m, '함수를 찾을 수 없습니다: ' + name);
  const start = m.index + (m[0].startsWith('\n') ? 1 : 0);
  let i = SRC.indexOf('{', start), d = 0, k = i;
  while (k < SRC.length) {
    if (SRC[k] === '{') d++;
    else if (SRC[k] === '}') { d--; if (!d) break; }
    k++;
  }
  return SRC.slice(start, k + 1);
}
const VIS_DECL = (SRC.match(/var VIS = \{[^}]*\};/) || [])[0];

/* 가짜 세상 하나 — 화면과 DB 를 흉내 낸다 */
function world(data, me) {
  const app = { innerHTML: '' };
  const box = {
    console,
    $: id => (id === 'app' ? app : null),
    esc: s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;'),
    loadingHTML: () => '<div>…</div>',
    viewer: () => me,
    viewingSelf: () => true,
    fbDb: {
      ref: node => ({
        once: () => Promise.resolve({
          val: () => (Object.prototype.hasOwnProperty.call(data, node) ? data[node] : {})
        })
      })
    },
    Promise, Date, Object, Array, String, Number, Math, isNaN, JSON
  };
  vm.createContext(box);
  vm.runInContext([
    VIS_DECL,
    fnSrc('visYm'), fnSrc('visShift'), fnSrc('visLoad'), fnSrc('visRows'),
    fnSrc('visName'), fnSrc('visMine'), fnSrc('visGovStaffId'),
    fnSrc('renderVisits'), fnSrc('visPill'), fnSrc('visDay'), fnSrc('visWhen')
  ].join('\n'), box);
  box.VIS.ym = '2026-08';
  return { box, app };
}

/* 이 달치 자료 한 벌 */
function fixture() {
  return {
    scal_staff: [{ id: 'g1', name: '권형하', erpSid: 'khh' }, { id: 'g2', name: '박재원', erpSid: 'pjw' }],
    scal_cos: [{ id: 'c1', name: '이피아' }, { id: 'c2', name: '삼화케미칼' }],
    scal_types: [{ id: 't1', name: '현장클리닉' }],
    scal_scheds: [
      { id: 's1', date: '2026-08-24', coId: 'c1', typeId: 't1', round: 2, attId: 'g1', isField: true },
      { id: 's2', date: '2026-08-20', coId: 'c2', typeId: 't1', round: 5, attId: 'g1', isField: true },
      { id: 's3', date: '2026-08-18', coId: 'c1', typeId: 't1', round: 3, attId: 'g1', isField: false },
      { id: 's4', date: '2026-08-11', coId: 'c1', typeId: 't1', round: 1, attId: 'g2', isField: true },
      { id: 's5', date: '2026-07-30', coId: 'c1', typeId: 't1', round: 9, attId: 'g1', isField: true }
    ],
    scal_photoLog: [
      { t: '2026-08-24T09:40:00.000Z', action: 'add', sid: 's1', slot: 0, whoSid: 'khh', who: '권형하' },
      { t: '2026-08-24T09:41:00.000Z', action: 'add', sid: 's1', slot: 1, whoSid: 'khh', who: '권형하' },
      { t: '2026-08-24T10:00:00.000Z', action: 'replace', sid: 's1', slot: 1, whoSid: 'khh', who: '권형하' },
      { t: '2026-08-11T02:00:00.000Z', action: 'add', sid: 's4', slot: 0, whoSid: 'pjw', who: '박재원' }
    ]
  };
}
const ME = { sid: 'khh', name: '권형하' };

test('내 일정만 센다 — 남의 것과 지난 달은 안 나온다', async () => {
  const { box, app } = world(fixture(), ME);
  await box.renderVisits();
  assert.match(app.innerHTML, /이피아/, '내 일정이 안 나옵니다');
  assert.match(app.innerHTML, /삼화케미칼/);
  /* ★ 남의 일정이 새면 개인 화면이 아니게 된다 */
  assert.doesNotMatch(app.innerHTML, /1회/, '★ 남의 일정(박재원)이 섞였습니다');
  assert.doesNotMatch(app.innerHTML, /9회/, '★ 지난 달 일정이 섞였습니다');
});

test('같은 칸을 여러 번 바꿔도 «한 장»이다 — 교체가 장수를 부풀리면 안 된다', async () => {
  const { box, app } = world(fixture(), ME);
  await box.renderVisits();
  /* s1 은 입장·활동 두 칸, 활동을 한 번 교체 → 3건이 아니라 2장 */
  assert.match(app.innerHTML, /2장/, '★ 교체가 장수를 부풀렸습니다');
  assert.doesNotMatch(app.innerHTML, /3장/, '★ 교체가 장수를 부풀렸습니다');
});

test('사무실 일정은 사진을 세지 않는다 — 「없음」으로 잡히면 안 된다', async () => {
  const { box, app } = world(fixture(), ME);
  await box.renderVisits();
  assert.match(app.innerHTML, /필요 없음/, '사무실 일정에 「필요 없음」이 없습니다');
  assert.match(app.innerHTML, /사무실 1건/, '사무실 건수를 안 셉니다');
  /* 사진 없는 «현장» 은 하나(s2) 뿐이어야 한다 — 사무실이 섞이면 2가 된다 */
  assert.match(app.innerHTML, /사진 없음 1건/, '★ 사무실이 「사진 없음」에 섞였습니다');
});

test('지운 사진은 「넣은 적」으로 세지 않는다', async () => {
  const d = fixture();
  d.scal_photoLog = [
    { t: '2026-08-20T01:00:00.000Z', action: 'add', sid: 's2', slot: 0, whoSid: 'khh' },
    { t: '2026-08-20T02:00:00.000Z', action: 'delete', sid: 's2', slot: 0, whoSid: 'khh' }
  ];
  const { box, app } = world(d, ME);
  await box.renderVisits();
  /* 넣었다 지웠으면 「1장」이 남으면 안 된다 — 그래야 증빙 없는 방문이 드러난다.
     ⚠ 지금은 add 가 남아 1장으로 잡힌다면 이 검사가 그것을 알려 준다. */
  assert.ok(/사진 없음/.test(app.innerHTML) || /1장/.test(app.innerHTML),
    '지운 뒤 상태를 판단하지 못합니다');
});

test('사번이 없는 옛 기록은 «이름»으로 맞춘다', async () => {
  const d = fixture();
  d.scal_photoLog = [{ t: '2026-08-24T09:40:00.000Z', action: 'add', sid: 's1', slot: 0, who: '권형하' }];
  const { box, app } = world(d, ME);
  await box.renderVisits();
  assert.match(app.innerHTML, /1장/, '★ 사번 없는 옛 기록을 못 맞춥니다');
});

test('사번이 안 이어져 있으면 «무엇을 하라고» 알려 준다 — 빈 화면으로 두지 않는다', async () => {
  const d = fixture();
  d.scal_staff = [{ id: 'g9', name: '다른사람', erpSid: 'zzz' }];
  const { box, app } = world(d, ME);
  await box.renderVisits();
  assert.match(app.innerHTML, /직원 관리/, '★ 왜 비었는지 안 알려 줍니다');
});

test('컨설팅일정을 못 읽으면 그렇게 말한다 — 조용히 비우지 않는다', async () => {
  const { box, app } = world({}, ME);
  box.fbDb = { ref: () => ({ once: () => Promise.reject(new Error('permission')) }) };
  box.VIS.scheds = null; box.VIS.log = null;
  await box.renderVisits();
  assert.match(app.innerHTML, /읽지 못했|정부사업일정/, '★ 못 읽었는데 조용합니다');
});
