'use strict';
/* ══════ 업무관리 「🚩 내 현장 방문」 ══════
   실행: node --test tests/*.test.js

   정부사업일정의 일정·사진 이력을 «읽어서» 보여 주는 화면이다.
   자료를 새로 만들지 않으므로, 지킬 것은 «세는 법»과 «사람 맞추기» 둘이다.

   ⚠ 글자를 찾지 않고 함수를 돌린다. 가짜 화면·가짜 DB 를 끼워 진짜 코드를 태운다.
   ⚠ 숫자를 박지 않는다 — 규칙(사무실은 사진을 안 센다 처럼)만 본다.
   ⚠ 「오늘」을 가짜로 넣는다 — 안 그러면 내일 이 검사가 저절로 깨진다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'work.html'), 'utf8');
const TODAY = '2026-08-30T09:00:00';

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
assert.ok(VIS_DECL, 'VIS 선언을 찾을 수 없습니다');
const KEEP_DECL = (SRC.match(/var LOG_KEEP = \d+;/) || [])[0];
assert.ok(KEEP_DECL, '★ 사진 이력을 몇 줄까지 붙들지 정한 곳이 없습니다');

const FNS = ['visYm', 'visShift', 'visToday', 'visSetMode', 'visSetScope', 'visSetPick',
  'visAdmin', 'visGo', 'visLoad', 'visRows', 'visName', 'visMine', 'visGovStaffId',
  'visForGid', 'visEnded', 'visCoOf', 'visAttIds', 'visWithNames', 'visWhere', 'visWhereCell', 'visPhotoMap', 'visSince', 'visDaysAgo', 'visLateRows',
  'visStaffSummary', 'renderVisits', 'visBadge', 'visLateTable', 'visSeg', 'visPill', 'visDay', 'visWhen'];

/* 가짜 세상 하나 — 화면과 DB 를 흉내 낸다 */
function world(data, me, opt) {
  const o = opt || {};
  const app = { innerHTML: '' };
  const badge = { textContent: '', style: {}, title: '' };
  const opened = [], asked = [];
  /* 「오늘」을 못 박는다 — 인자 없이 부르면 늘 2026-08-30 */
  const RealDate = Date;
  function FakeDate(...a) { return a.length ? new RealDate(...a) : new RealDate(TODAY); }
  FakeDate.now = () => new RealDate(TODAY).getTime();
  const box = {
    console,
    $: id => (id === 'app' ? app : id === 'cnt-visits' ? badge : null),
    esc: s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;'),
    loadingHTML: () => '<div>…</div>',
    viewer: () => me,
    viewingSelf: () => true,
    isAdmin: () => !!o.admin,
    S: { perfFin: !!o.admin },
    /* ⚠ 2026-09-08 — 앱끼리 창을 열 때는 공용 층(PuAppBar.goApp)을 쓴다
         (대표 지시 「모든 창은 2개가 열리지 않고 하나만」). 창 이름은 그쪽이 짓는다. */
    PuAppBar: { goApp: (u) => opened.push(u) },
    window: { open: () => { throw new Error('앱이 창을 직접 열면 안 됩니다 — PuAppBar.goApp'); } },
    fbDb: {
      ref: node => {
        const r = {
          once: () => Promise.resolve({
            val: () => (Object.prototype.hasOwnProperty.call(data, node) ? data[node] : {})
          }),
          limitToLast: k => { asked.push(node + ':' + k); return r; }
        };
        return r;
      }
    },
    Promise, Date: FakeDate, Object, Array, String, Number, Math, isNaN, JSON
  };
  vm.createContext(box);
  vm.runInContext([VIS_DECL, KEEP_DECL].concat(FNS.map(fnSrc)).join('\n'), box);
  box.VIS.ym = '2026-08';
  return { box, app, opened, asked, badge };
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

/* ══════ 이 달 — 세는 법 ══════ */

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
  assert.ok(/사진 없음/.test(app.innerHTML) || /1장/.test(app.innerHTML),
    '지운 뒤 상태를 판단하지 못합니다');
});

test('사번이 없는 옛 기록은 «이름»으로 맞춘다 — 「남이 넣음」으로 새지 않는다', async () => {
  const d = fixture();
  d.scal_photoLog = [{ t: '2026-08-24T09:40:00.000Z', action: 'add', sid: 's1', slot: 0, who: '권형하' }];
  const { box, app } = world(d, ME);
  await box.renderVisits();
  assert.match(app.innerHTML, /1장/, '★ 사번 없는 옛 기록을 못 맞춥니다');
  /* 사번이 없어도 이름이 나와 같으면 «내가» 넣은 것이다 */
  assert.doesNotMatch(app.innerHTML, /· [^<]*넣음/, '★ 내가 넣은 것을 남이 넣은 것으로 봅니다');
});

test('★ 남이 대신 넣어 준 사진도 «있음»으로 센다 — 「없음」으로 겁주지 않는다', async () => {
  /* 부담당이나 관리자가 대신 넣으면 예전에는 내 화면에만 「없음」으로 떴다.
     「내가 언제 넣었나」와 「이 방문에 증빙이 있나」는 다른 물음이다. */
  const d = fixture();
  d.scal_photoLog = [
    { t: '2026-08-24T09:40:00.000Z', action: 'add', sid: 's1', slot: 0, whoSid: 'pjw', who: '박재원' }
  ];
  const { box, app } = world(d, ME);
  await box.renderVisits();
  assert.match(app.innerHTML, /1장/, '★ 남이 넣은 증빙을 안 셉니다');
  assert.match(app.innerHTML, /박재원/, '★ 누가 넣었는지 안 적습니다');
  assert.doesNotMatch(app.innerHTML, /사진 없음 2건/, '★ 남이 넣은 방문을 「없음」으로 셌습니다');
});

test('★ 공용 기록보다 앞선 방문은 「기록 없음」 — 빨간 「없음」이 아니다', async () => {
  const d = fixture();
  /* 기록은 8/22 부터 있다(딴 일정 것) → 8/20 방문은 «알 수 없음», 8/24 는 진짜 없음 */
  d.scal_photoLog = [{ t: '2026-08-22T00:00:00.000Z', action: 'add', sid: 'sZ', slot: 0, whoSid: 'khh' }];
  const { box, app } = world(d, ME);
  await box.renderVisits();
  /* ★ 설명 글이 아니라 «표 칸»을 본다 — 글만 보면 줄이 사라져도 통과한다 */
  assert.match(app.innerHTML, />기록 없음</, '★ 표 칸이 「기록 없음」이 아닙니다');
  assert.match(app.innerHTML, /기록 없음 1건/, '★ 「기록 없음」을 따로 안 셉니다');
  assert.match(app.innerHTML, /사진 없음 1건/, '★ 기록 뒤 방문까지 「기록 없음」으로 묻었습니다');
});

test('★ 「기록 없음」이 없으면 그 설명도 안 적는다 — 없는 문제를 찾게 만들지 않는다', async () => {
  const d = fixture();
  d.scal_photoLog = [{ t: '2026-07-01T00:00:00.000Z', action: 'add', sid: 'sZ', slot: 0, whoSid: 'khh' }];
  const { box, app } = world(d, ME);
  await box.renderVisits();
  assert.doesNotMatch(app.innerHTML, /기록 없음/, '★ 「기록 없음」이 없는데 설명이 붙습니다');
});

test('★ 기록이 하나도 없으면 전부 「기록 없음」 — 온통 빨갛게 만들지 않는다', async () => {
  const d = fixture();
  d.scal_photoLog = [];
  const { box, app } = world(d, ME);
  await box.renderVisits();
  assert.doesNotMatch(app.innerHTML, /사진 없음/, '★ 기록 0건인데 「사진 없음」이라고 합니다');
  /* 머리 칩과 표 칸 «둘 다» — 한쪽만 보면 다른 쪽이 사라져도 모른다 */
  assert.match(app.innerHTML, /기록 없음 2건/, '★ 머리에 몇 건인지 안 적습니다');
  assert.match(app.innerHTML, />기록 없음</, '★ 표 칸이 「기록 없음」이 아닙니다');
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

test('★ 사진 이력을 «통째로» 읽지 않는다 — 지우는 곳이 없어 해마다 쌓인다', async () => {
  /* 이력은 지우는 곳이 없다. 통째로 읽으면 이 화면을 열 때마다 내려받는 양이
     끝없이 늘어난다 — 요금이 «조용히» 오르는 자리다. */
  const w = world(fixture(), ME);
  await w.box.renderVisits();
  const hit = w.asked.filter(function (x) { return x.indexOf('scal_photoLog:') === 0; });
  assert.equal(hit.length, 1, '★ 사진 이력에 창을 안 씌웁니다(통째로 읽습니다)');
  /* 다른 칸까지 자르면 일정이 사라진다 — 창은 «이력에만» */
  assert.equal(w.asked.filter(function (x) { return x.indexOf('scal_scheds:') === 0; }).length, 0,
    '★ 일정 목록까지 잘랐습니다 — 옛 일정이 통째로 사라집니다');
});

test('★ 표는 «스스로» 옆으로 구른다 — 쪽 전체가 밀리면 폰에서 못 읽는다', () => {
  /* 칸이 여섯이고 머리글이 안 접혀(nowrap) 폰에서는 화면 밖으로 나간다.
     ⚠ 굴러야 하는 것은 «표»지 쪽이 아니다. */
  const css = (SRC.match(/\.vis-wrap\{[^}]*\}/) || [''])[0];
  assert.match(css, /overflow-x:\s*auto/, '★ 표를 옆으로 굴릴 수 없습니다');
  /* 「내 현장 방문」이 그리는 표는 «모두» 그 안에 있어야 한다 */
  const blk = SRC.slice(SRC.indexOf('function renderVisits'), SRC.indexOf('function visSeg'));
  const tables = blk.match(/<table/g) || [];
  const wraps = blk.match(/<div class="vis-wrap"><table/g) || [];
  assert.ok(tables.length >= 2, '표를 못 찾았습니다');
  assert.equal(wraps.length, tables.length, '★ 감싸지 않은 표가 있습니다');
});

/* ══════ ④ 줄을 눌러 그 일정으로 ══════ */

test('★ 줄을 누르면 정부사업일정의 «그» 일정이 열린다', async () => {
  const { box, app, opened } = world(fixture(), ME);
  await box.renderVisits();
  assert.match(app.innerHTML, /visGo\('s1'\)/, '★ 줄에 건너갈 길이 없습니다');
  box.visGo('s1');
  assert.equal(opened.length, 1, '★ 아무것도 안 열립니다');
  assert.match(opened[0], /gov-consulting\.html#sc=s1/, '★ 그 일정으로 안 갑니다');
});

test('★ 여기서 «고치지» 않는다 — 넣는 일은 원래 자리에서만', () => {
  /* 업무관리가 컨설팅일정 자료를 쓰기 시작하면 같은 일을 두 곳에서 하게 되고,
     언젠가 한쪽이 어긋난다. 읽기만 하는 것이 이 화면의 규칙이다. */
  const blk = SRC.slice(SRC.indexOf('var VIS = {'), SRC.indexOf('function renderHo'));
  assert.doesNotMatch(blk, /\.set\(|\.update\(|\.push\(|fbPush/, '★ 이 화면이 자료를 씁니다');
});

/* ══════ ⑥ 밀린 것 모두 ══════ */

test('★ 「밀린 것 모두」는 지난 달 것도 담는다 — 달을 넘겨 가며 찾지 않게', async () => {
  const d = fixture();
  d.scal_photoLog = [{ t: '2026-06-01T00:00:00.000Z', action: 'add', sid: 'sZ', slot: 0 }];
  const { box, app } = world(d, ME);
  box.visSetMode('late');
  await box.renderVisits();
  assert.match(app.innerHTML, /9회/, '★ 지난 달에 밀린 것을 안 보여 줍니다');
  assert.match(app.innerHTML, /지남/, '★ 며칠 밀렸는지 안 적습니다');
});

test('★ 밀린 목록은 «오래된 것 먼저» — 급한 것이 아래로 가면 안 된다', async () => {
  const d = fixture();
  d.scal_photoLog = [{ t: '2026-06-01T00:00:00.000Z', action: 'add', sid: 'sZ', slot: 0 }];
  const { box, app } = world(d, ME);
  box.visSetMode('late');
  await box.renderVisits();
  assert.ok(app.innerHTML.indexOf('9회') < app.innerHTML.indexOf('5회'),
    '★ 오래된 것이 뒤에 있습니다');
});

test('★ 오늘·앞으로의 방문은 밀린 것이 아니다', async () => {
  const d = fixture();
  d.scal_scheds.push({ id: 's6', date: '2026-08-30', coId: 'c1', typeId: 't1', round: 7, attId: 'g1', isField: true });
  d.scal_scheds.push({ id: 's7', date: '2026-09-05', coId: 'c1', typeId: 't1', round: 8, attId: 'g1', isField: true });
  d.scal_photoLog = [{ t: '2026-06-01T00:00:00.000Z', action: 'add', sid: 'sZ', slot: 0 }];
  const { box, app } = world(d, ME);
  box.visSetMode('late');
  await box.renderVisits();
  assert.doesNotMatch(app.innerHTML, /7회/, '★ 오늘 방문을 밀린 것으로 셌습니다');
  assert.doesNotMatch(app.innerHTML, /8회/, '★ 앞으로의 방문을 밀린 것으로 셌습니다');
});

test('★ 끝난 컨설팅은 안 담는다 — 제출이 끝난 건을 매일 보여 주면 목록을 안 보게 된다', async () => {
  const d = fixture();
  d.scal_cos = [{ id: 'c1', name: '이피아', endedTypes: { t1: 1 } }, { id: 'c2', name: '삼화케미칼' }];
  d.scal_photoLog = [{ t: '2026-06-01T00:00:00.000Z', action: 'add', sid: 'sZ', slot: 0 }];
  const { box, app } = world(d, ME);
  box.visSetMode('late');
  await box.renderVisits();
  assert.doesNotMatch(app.innerHTML, /9회/, '★ 끝난 컨설팅을 담았습니다');
  assert.match(app.innerHTML, /5회/, '살아 있는 건까지 걸렀습니다');
});

test('★ 「기록 없음」은 빨간 것과 «섞지 않는다» — 진짜 빠진 것이 묻힌다', async () => {
  const d = fixture();
  /* 기록이 8/22 부터 → 8/20(s2)·7/30(s5)은 「기록 없음」 */
  d.scal_photoLog = [{ t: '2026-08-22T00:00:00.000Z', action: 'add', sid: 'sZ', slot: 0 }];
  const { box, app } = world(d, ME);
  box.visSetMode('late');
  await box.renderVisits();
  /* 8/24 만 진짜 「없음」이고, 그보다 앞선 둘은 「기록 없음」이어야 한다 */
  assert.match(app.innerHTML, /사진 없음 1건/, '★ 알 수 없는 것까지 「없음」으로 셌습니다');
  assert.match(app.innerHTML, /기록 없음 2건/, '★ 「기록 없음」을 따로 안 셉니다');
  assert.match(app.innerHTML, /알 수 없는 것/, '★ 왜 따로 두는지 안 적습니다');
  /* ★ 두 표가 «갈라져» 있어야 한다 — 섞이면 진짜 빠진 것이 묻힌다 */
  const cut = app.innerHTML.indexOf('알 수 없는 것');
  assert.ok(app.innerHTML.indexOf("visGo('s1')") < cut, '★ 진짜 빠진 것이 아래로 밀렸습니다');
  assert.ok(app.innerHTML.indexOf("visGo('s5')") > cut, '★ 알 수 없는 것이 위에 섞였습니다');
});

test('밀린 것이 없으면 그렇게 말한다 — 빈 표를 보여 주지 않는다', async () => {
  const d = fixture();
  d.scal_scheds = [{ id: 's1', date: '2026-08-24', coId: 'c1', typeId: 't1', round: 2, attId: 'g1', isField: true }];
  d.scal_photoLog = [{ t: '2026-08-01T00:00:00.000Z', action: 'add', sid: 's1', slot: 0, whoSid: 'khh' }];
  const { box, app } = world(d, ME);
  box.visSetMode('late');
  await box.renderVisits();
  assert.match(app.innerHTML, /밀린 것 없음|빠진 지난 방문이 없습니다/, '★ 밀린 것이 없는데 안 알려 줍니다');
});

/* ══════ ⑦ 옆줄 숫자 뱃지 ══════ */

test('★ 뱃지는 «밀린 건수»다 — 들어가지 않아도 몇 건인지 안다', async () => {
  const d = fixture();
  d.scal_photoLog = [{ t: '2026-06-01T00:00:00.000Z', action: 'add', sid: 'sZ', slot: 0 }];
  const w = world(d, ME);
  await w.box.renderVisits();
  /* s1(8/24)·s2(8/20)·s5(7/30) 셋이 증빙 없는 지난 현장 방문 */
  assert.equal(w.badge.textContent, 3, '★ 밀린 건수를 안 띄웁니다');
  assert.match(w.badge.title || '', /증빙/, '★ 무슨 숫자인지 안 알려 줍니다');
});

test('★ 뱃지 때문에 자료를 «새로 읽지» 않는다 — 숫자 하나로 요금을 올리지 않는다', () => {
  /* 대표 결정 2026-08-30 ㉯: 로그인마다 미리 읽는 길은 안 고른다.
     아직 안 읽었으면 «읽으러 가지 말고» 빈칸으로 둔다. */
  const w = world(fixture(), ME);
  w.box.VIS.scheds = null; w.box.VIS.log = null;
  w.box.visBadge();
  assert.equal(w.badge.textContent, '', '★ 안 읽었는데 숫자를 띄웁니다');
  assert.equal(w.asked.length, 0, '★ 뱃지가 자료를 읽으러 갔습니다');
});

test('★ 「기록 없음」은 뱃지에 안 센다 — 없는 일로 사람을 부르면 안 된다', async () => {
  const d = fixture();
  /* 기록이 8/22 부터 → 8/20·7/30 은 「기록 없음」, 8/24 만 진짜 밀림 */
  d.scal_photoLog = [{ t: '2026-08-22T00:00:00.000Z', action: 'add', sid: 'sZ', slot: 0 }];
  const w = world(d, ME);
  await w.box.renderVisits();
  assert.equal(w.badge.textContent, 1, '★ 알 수 없는 것까지 셌습니다');
});

test('밀린 것이 없으면 뱃지는 «빈칸» — 0 을 띄우지 않는다', async () => {
  const d = fixture();
  d.scal_scheds = [{ id: 's1', date: '2026-08-24', coId: 'c1', typeId: 't1', round: 2, attId: 'g1', isField: true }];
  d.scal_photoLog = [{ t: '2026-08-01T00:00:00.000Z', action: 'add', sid: 's1', slot: 0, whoSid: 'khh' }];
  const w = world(d, ME);
  await w.box.renderVisits();
  assert.equal(w.badge.textContent, '', '★ 0 을 띄웁니다');
});

/* ══════ ⑤ 전 직원 한눈에 (관리자) ══════ */

test('★ 「전 직원」 단추는 관리자에게만 보인다', async () => {
  const a = world(fixture(), ME, { admin: false });
  await a.box.renderVisits();
  assert.doesNotMatch(a.app.innerHTML, /전 직원/, '★ 관리자가 아닌데 전 직원 단추가 보입니다');
  const b = world(fixture(), ME, { admin: true });
  await b.box.renderVisits();
  assert.match(b.app.innerHTML, /전 직원/, '관리자에게 안 보입니다');
});

test('★ 관리자가 아니면 전 직원으로 «넘어갈 수도» 없다 — 단추만 숨기면 뚫린다', async () => {
  const { box, app } = world(fixture(), ME, { admin: false });
  box.visSetScope('all');
  await box.renderVisits();
  assert.doesNotMatch(app.innerHTML, /담당<\/th>/, '★ 권한 없이 전 직원 표가 열렸습니다');
  assert.doesNotMatch(app.innerHTML, /박재원/, '★ 남의 이름이 보입니다');
});

test('전 직원은 사람마다 «한 줄» — 처음부터 다 늘어놓지 않는다', async () => {
  const { box, app } = world(fixture(), ME, { admin: true });
  box.visSetScope('all');
  await box.renderVisits();
  assert.match(app.innerHTML, /권형하/);
  assert.match(app.innerHTML, /박재원/, '★ 일정이 있는 사람이 빠졌습니다');
  /* 줄을 눌러 펼치는 길이 있어야 한다 */
  assert.match(app.innerHTML, /visSetPick\('g2'\)/, '★ 그 사람 목록으로 갈 길이 없습니다');
});

test('★ 전 직원은 «밀린 날수»로 줄을 세운다 — 건수로 줄 세우는 표가 아니다', async () => {
  const d = fixture();
  /* 박재원에게 아주 오래 밀린 것을 하나 준다 */
  d.scal_scheds.push({ id: 's8', date: '2026-06-01', coId: 'c1', typeId: 't1', round: 6, attId: 'g2', isField: true });
  d.scal_photoLog = [{ t: '2026-05-01T00:00:00.000Z', action: 'add', sid: 'sZ', slot: 0 }];
  const { box, app } = world(d, ME, { admin: true });
  box.visSetScope('all');
  await box.renderVisits();
  /* 권형하가 방문 건수는 더 많지만, 더 오래 밀린 박재원이 위로 와야 한다 */
  assert.ok(app.innerHTML.indexOf('박재원') < app.innerHTML.indexOf('권형하'),
    '★ 오래 밀린 사람이 아래에 있습니다');
});

test('★ 남을 펼쳐 보면 «그 사람 눈»으로 본다 — 본인이 넣은 것에 제 이름이 붙으면 안 된다', async () => {
  /* 「누가 넣었나」를 보는 사람(관리자) 기준으로 재면, 박재원 님 화면에
     「박재원 넣음」이 붙는다 — 본인이 넣은 것인데 남이 넣은 것처럼 읽힌다. */
  const { box, app } = world(fixture(), ME, { admin: true });
  box.visSetScope('all');
  box.visSetPick('g2');
  await box.renderVisits();
  assert.match(app.innerHTML, /1장/, '★ 그 사람 사진을 안 셉니다');
  assert.doesNotMatch(app.innerHTML, /· [^<]*넣음/, '★ 본인이 넣은 것에 제 이름을 붙였습니다');
});

test('한 사람을 펼치면 «그 사람» 것이 나오고, 돌아갈 길이 있다', async () => {
  const { box, app } = world(fixture(), ME, { admin: true });
  box.visSetScope('all');
  box.visSetPick('g2');
  await box.renderVisits();
  assert.match(app.innerHTML, /박재원 님/, '★ 누구 것인지 안 적습니다');
  assert.match(app.innerHTML, /1회/, '★ 그 사람 일정이 안 나옵니다');
  assert.match(app.innerHTML, /전 직원으로/, '★ 돌아갈 길이 없습니다');
});
