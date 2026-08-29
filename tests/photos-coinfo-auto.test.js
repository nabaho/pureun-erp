'use strict';
/* 기업정보를 기업 상세로 «스스로» 보낸다 — 대표 지시 2026-08-23

   "사진첩에 정리된 기업정보를 기업정보함 기업상세에 연결되어 자동 저장될 수 있도록
    해달라."

   종전에는 사람이 「🏢 기업 상세로 보내기」를 눌러야 했다. 서식 캡처가 상담 한 건에
   여러 장씩 나오는데 장마다 누르는 것은 일이 아니다.

   ⚠ 그런데 canSendCoInfo 는 «사업자번호가 열 자리인가»만 본다 — 지어낸 번호도 열
     자리다. 그것만 보고 자동으로 밀어 넣으면 AI 가 흐린 자리를 메운 값이 기업정보함
     으로 조용히 흘러간다. 그래서 **기계가 번호를 검산한 것만**(bizNoOk) 스스로 보낸다.
     「기계 검증 통과분만 자동 입력」이라는 이 저장소의 규칙 그대로다.
   ⚠ auto 는 보지 않는다 — 서식의 auto=false 는 「자동 등록 대상이 아니다」는 뜻이고,
     정작 이 지시가 가리키는 것이 서식 캡처다.
   ⚠ 방금 올린 사진은 아직 격자 목록에 없다. 목록에서만 찾으면 «조용히 아무 일도»
     안 한다 — 자동으로 보내려는 바로 그 순간이 그때다.

   실행: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');

function fnOf(name) {
  const i = app.indexOf('function ' + name + '(');
  assert.ok(i >= 0, name + ' 를 찾지 못했습니다');
  let d = 0;
  for (let k = app.indexOf('{', i); k < app.length; k++) {
    if (app[k] === '{') d++;
    else if (app[k] === '}') { d--; if (!d) return app.slice(i, k + 1); }
  }
  throw new Error(name + ' 의 끝을 찾지 못했습니다');
}

/* ══════ ① 문턱 — 기계가 검산한 것만 ══════ */
const J = (function () {
  const c = { String, Boolean, Object };
  vm.createContext(c);
  vm.runInContext(fnOf('canSendCoInfo') + '\n' + fnOf('autoSendCoInfo'), c);
  return c;
})();
const rd = function (o) {
  return Object.assign({ kind: 'form', auto: false, bizNoOk: true,
    fields: { bizno: '312-81-28123', company: '남양인텍' } }, o || {});
};

test('★ 번호를 검산한 서식은 스스로 간다 — 이 지시가 가리키는 것이 서식 캡처다', () => {
  assert.equal(J.autoSendCoInfo(rd()), true,
    '★ auto 를 함께 보면 서식은 영영 자동으로 못 갑니다(서식의 auto 는 늘 false)');
});

test('★ 검산에 걸린 번호는 «스스로» 안 간다 — 지어낸 번호도 열 자리다', () => {
  assert.equal(J.autoSendCoInfo(rd({ bizNoOk: false })), false,
    '★ 열 자리만 보고 밀어 넣으면 지어낸 값이 기업정보함으로 흘러갑니다');
  assert.equal(J.autoSendCoInfo(rd({ bizNoOk: null })), false, '검산 안 한 것도 안 됩니다');
  assert.equal(J.autoSendCoInfo(rd({ bizNoOk: undefined })), false);
});

test('그래도 «사람이 누르는 길»은 남는다 — 사람이 보고 판단할 수 있어야 한다', () => {
  assert.equal(J.canSendCoInfo(rd({ bizNoOk: false })), true,
    '★ 단추까지 없애면 검산에 걸린 것은 영영 못 보냅니다');
});

test('번호가 없거나 짧으면 어느 길로도 안 간다 — 어느 회사인지 모른다', () => {
  assert.equal(J.autoSendCoInfo(rd({ fields: { company: '남양인텍' } })), false);
  assert.equal(J.autoSendCoInfo(rd({ fields: { bizno: '312-81' } })), false);
});

test('판독 실패·이미 보낸 것은 안 간다', () => {
  assert.equal(J.autoSendCoInfo(rd({ error: '실패' })), false);
  assert.equal(J.autoSendCoInfo(rd({ filedInfo: { at: 1 } })), false, '두 번 보내면 안 됩니다');
});

test('사업자등록증도 같은 길로 간다 — 서식만의 기능이 아니다', () => {
  assert.equal(J.autoSendCoInfo(rd({ kind: 'bizreg', auto: true })), true);
});

/* ══════ ② 방금 올린 사진도 보낸다 ══════ */

function runSend(o) {
  o = o || {};
  const calls = { sent: null, saved: null };
  const job = o.job || null;
  const ctx = {
    gridItems: o.gridItems || [],
    gridYear: '2026',
    viewerId: null,
    PuDocFile: { sendToCoInfo: function (a) { calls.sent = a; return Promise.resolve({ filled: ['ceo'], message: '1칸' }); } },
    PuPhotoStore: { myName: function () { return '권형하'; },
      saveRead: function (y, id, read, own) { calls.saved = { y: y, id: id, own: own }; return Promise.resolve(); } },
    photoOwner: function () { return 'U1'; },
    renderReadPanel: function () {},
    renderUp: function () {},
    console: { warn: function () {} },
    Date, Promise, Object, String, Boolean
  };
  vm.createContext(ctx);
  vm.runInContext(fnOf('canSendCoInfo') + '\n' + fnOf('coInfoFields') + '\n' + fnOf('autoCmsOn') + '\n' + fnOf('sendCoInfoWith') + '\n' + fnOf('sendCoInfo'), ctx);
  return { ctx, calls, job };
}
const settle = function () { return new Promise(function (r) { setTimeout(r, 20); }); };

test('★ 격자에 아직 없는 사진(방금 올린 것)도 보낸다 — 여기가 조용히 비던 자리다', async () => {
  const job = { _read: rd() };
  const r = runSend({ gridItems: [], job: job });
  r.ctx.sendCoInfo('p1', '2025', job);
  await settle();
  assert.ok(r.calls.sent, '★ 목록에서만 찾으면 방금 올린 사진은 아무 일도 안 일어납니다');
  assert.equal(r.calls.sent.photo.id, 'p1');
  assert.equal(r.calls.sent.photo.year, '2025', '★ 화면의 해로 짐작하면 엉뚱한 자리에 적힙니다');
  assert.equal(job._read.filedInfo.n, 1, '보냈다는 표시를 대기열 쪽에도 남겨야 또 안 보냅니다');
});

test('★ 격자에도 있고 대기열에도 있으면 «둘 다» 갱신한다 — 한쪽만 하면 또 보낸다', async () => {
  /* ⚠ 이 짝이 그 한 줄(job._read = read)이 지키는 «진짜» 경우다. 대기열만 있을 때는
     read 가 job._read 그 객체라 저절로 갱신되어, 그 줄을 지워도 티가 안 난다
     (되돌림 시험에서 그렇게 살아남아 이 검사를 더했다). 격자 쪽 read 로 갈 때는
     대기열 쪽이 옛 값으로 남아 «또 보내게» 된다. */
  const shared = rd();
  const it = { id: 'p9', meta: { read: shared } };
  const job = { _read: rd() };                 // 격자와 «다른» 객체
  const r = runSend({ gridItems: [it], job: job });
  r.ctx.sendCoInfo('p9', '2026', job);
  await settle();
  assert.ok(it.meta.read.filedInfo, '격자 쪽에 표시가 없습니다');
  assert.ok(job._read.filedInfo,
    '★ 대기열 쪽이 옛 값으로 남아 「아직 안 보냄」으로 보입니다 — 또 보내게 됩니다');
});

test('보낸 기록을 주인 자리·그 해에 적는다', async () => {
  const it = { id: 'p2', meta: { read: rd() } };
  const r = runSend({ gridItems: [it] });
  r.ctx.sendCoInfo('p2', '2024', null);
  await settle();
  assert.equal(r.calls.saved.y, '2024', '★ 다른 해 사진의 기록이 올해 자리에 적힙니다');
  assert.equal(r.calls.saved.own, 'U1', '주인 자리에 안 적으면 주인 화면에 「안 보냄」으로 남습니다');
});

test('해를 안 주면 사진에 새겨진 해를 쓰고, 그것도 없으면 화면의 해다', async () => {
  const it = { id: 'p3', meta: { __year: '2023', read: rd() } };
  const r = runSend({ gridItems: [it] });
  r.ctx.sendCoInfo('p3');
  await settle();
  assert.equal(r.calls.sent.photo.year, '2023');
});

/* ══════ ③ 배선 — 두 길 다 ══════ */

test('★ 올린 뒤 판독한 길에서 스스로 보낸다', () => {
  const i = app.indexOf('if (read.auto && canSendCo(read)) return sendCompany(sibs[0].id, year, sibs[0]);');
  assert.ok(i > 0, '업체관리 자동 보내기 자리를 찾지 못했습니다');
  const seg = app.slice(i, i + 700);
  assert.match(seg, /autoSendCoInfo\(read\)\) return sendCoInfo\(sibs\[0\]\.id, year, sibs\[0\]\)/,
    '★ 안 부르면 자동이 아닙니다');
});

test('★ 「다시 판독」 길에서도 스스로 보낸다 — 한쪽만 넣으면 「올릴 때는 되는데」가 된다', () => {
  const i = app.indexOf('if (read.auto && canSendCo(read)) return sendCompany(pages[0].id, gridYear, null);');
  assert.ok(i > 0, '다시 판독 쪽 자리를 찾지 못했습니다');
  const seg = app.slice(i, i + 700);
  assert.match(seg, /autoSendCoInfo\(read\)\) return sendCoInfo\(pages\[0\]\.id, gridYear, null\)/);
});

test('★ 업체관리 보내기와 따로 둔다 — 한쪽이 실패해도 다른 쪽은 되어야 한다', () => {
  /* .then 을 나눠 달았는지 — 같은 then 안에 넣으면 앞엣것이 던지면 뒤가 안 돈다. */
  const i = app.indexOf('sendCompany(sibs[0].id, year, sibs[0]);');
  const seg = app.slice(i, i + 500);
  assert.match(seg, /\}\)\.then\(function \(\) \{/, '★ 한 덩이에 넣으면 한쪽 실패가 다른 쪽을 삼킵니다');
});

test('★ 여러 쪽이어도 대표 쪽 하나만 — 쪽마다 보내면 같은 업체가 쪽수만큼 쌓인다', () => {
  assert.ok(app.indexOf('sendCoInfo(sibs[0].id, year, sibs[0])') > 0);
  assert.ok(app.indexOf('sendCoInfo(pages[0].id, gridYear, null)') > 0);
});

test('이미 있는 값은 안 덮는다 — 자동이라 더욱 그래야 한다', async () => {
  /* ⚠ 예전에는 소스의 «한 줄»을 글자 그대로 찾았다. 2026-08-24 에 그 자리를 고치자
     (값이 어긋날 때 알려 주려고) 뜻은 그대로인데 검사가 깨졌다.
     그래서 «실제로 돌려» 본다 — 글자가 아니라 하는 일을 지킨다. */
  const vm = require('node:vm');
  const file = fs.readFileSync(path.join(R, 'js', 'pu-doc-file.js'), 'utf8');
  const i = file.indexOf('function sendToCoInfo');
  const j = file.indexOf('function sendToCompany');
  assert.ok(i > 0 && j > i, 'sendToCoInfo 를 찾지 못했습니다');
  const writes = [];
  const ctx = {
    Promise, Object, String, Date, Error,
    CARDS_ROOT: 'pucards',
    CO_LABEL: { ceo: '대표자' },
    /* 2026-08-28: 어긋남 알림이 «기업정보함» 이름표를 먼저 본다 */
    FIELD_LABEL: { ceo:'대표자', address:'소재지', companyTel:'대표번호' },
    /* 2026-08-28: 서류 밑에 pairs 를 담는다 — 그 한계값 */
    CO_PAIRS_MAX: 60, CO_PAIR_LEN: 300,
    bizKey: v => { const d = String(v || '').replace(/\D/g, ''); return d.length >= 10 ? d : ''; },
    deps: { db: { ref: () => ({
      once: () => Promise.resolve({ val: () => ({ ceo: '사람이 고친 대표자' }) }),
      update: v => { writes.push(v); return Promise.resolve(); }
    }) } }
  };
  vm.createContext(ctx);
  vm.runInContext(file.slice(i, j), ctx);
  await ctx.sendToCoInfo({ fields: { bizno: '134-86-05772', ceo: '기계가 읽은 대표자' } });
  const wrote = writes[0] || {};
  assert.equal(wrote.ceo, undefined,
    '★ 자동으로 보내면서 덮어쓰면 사람이 고쳐 둔 값이 조용히 지워집니다');
  assert.ok(wrote['conflicts/ceo'], '덮지 않았으면 어긋났다고 알려는 줘야 한다');
});
