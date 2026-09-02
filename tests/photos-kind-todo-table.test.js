'use strict';
/* 갈래마다 「할 일인가」를 한 표로 못 박는다 — 대표 보고 2026-08-15
   "경고표시 왜 계속 나오나?"

   ⚠ 실제로 겪은 일: 2026-08-10 에 계약서(contract) 갈래를 넣으면서 판독기에는
     「사진첩에만 보관합니다 · done:true」라고 적어 두고 화면 쪽(needsCheck·checkWhy)
     에는 안 넣었다. 계약서 18장이 「읽은 값이 미덥지 않음 — 열어서 확인」이라는
     **틀린 이유**로 ⚠ 를 달고 영영 안 없어졌다.

   기존 검사는 「할 일이면 이유가 있고 아니면 없다」만 보았다 — 계약서는 할 일로
   잡히고 이유도 (틀렸지만) 있었으므로 **그 검사를 통과했다.**
   그래서 여기서는 **갈래마다 무엇이 맞는지를 표로** 적는다. 갈래를 새로 넣고
   이 표에 안 적으면 검사가 멈춰 세운다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');
const reader = fs.readFileSync(path.join(R, 'js', 'pu-doc-read.js'), 'utf8');

function fnOf(src, name) {
  const m = src.match(new RegExp('function ' + name + '\\([\\s\\S]*?\\n\\}'));
  assert.ok(m, name + ' 를 찾지 못했습니다');
  return m[0];
}

function load() {
  const keep = app.match(/const KEEP_ONLY = \{[^}]*\};/);
  assert.ok(keep, 'KEEP_ONLY 목록을 찾지 못했습니다');
  /* ⚠ 화면에서 값을 그대로 가져온다 — 여기 숫자를 베껴 적으면 화면이 바뀔 때
     검사만 옛 값을 보게 된다(그러면 「작은 원본」 판정이 어긋난다). */
  const minEdge = app.match(/const MIN_READ_EDGE = \{[\s\S]*?\};/);
  assert.ok(minEdge, 'MIN_READ_EDGE 를 찾지 못했습니다');
  /* ⚠ 2026-08-24: 서식·대화캡처가 「사람이 해서 달라지는 것이 있을 때만」 할 일이 되어
     formTodo·chatTodo(그리고 canSendCoInfo·실패 갈래)를 함께 떠야 한다 — 안 실으면
     needsCheck 가 그 줄에서 멎어 이 표 검사가 통째로 운다. */
  const rules = ['READ_FAIL_RULES', 'FAIL_GIVEUP'].map(function (n) {
    const m = app.match(new RegExp('^const ' + n + ' = [\\s\\S]*?;$', 'm'));
    assert.ok(m, n + ' 를 찾지 못했습니다');
    return m[0];
  }).join('\n');
  const src = [
    'const CARD_KINDS = { card: 1, bizreg: 1 };',
    'const CO_KINDS = { bizreg: 1, sme: 1 };',
    minEdge[0],
    keep[0],
    /* ⚠ 근로자 서류 넷(2026-09-01) — 화면에서 그대로 가져온다. 여기 베껴 적으면
       화면이 늘어날 때 검사만 옛 목록을 본다. 안 실으면 checkWhy 가 그 줄에서 멎어
       이 표 검사가 통째로 운다(2026-08-24 formTodo 와 같은 자리). */
    (function(){ const m = app.match(/^const WORKER_KINDS = {[^}]*};$/m); assert.ok(m, 'WORKER_KINDS 를 찾지 못했습니다'); return m[0]; })(),
    fnOf(app, 'canSendWorker'),
    fnOf(app, 'workerWhyNot'),
    rules,
    fnOf(app, 'readAnyField'),
    fnOf(app, 'coFilledOk'),
    fnOf(app, 'coTodo'),
    fnOf(app, 'tooSmall'),
    fnOf(app, 'readFailKind'),
    fnOf(app, 'readFailAdvice'),
    fnOf(app, 'canSendCoInfo'),
    fnOf(app, 'formTodo'),
    fnOf(app, 'chatTodo'),
    fnOf(app, 'checkWhy'),
    fnOf(app, 'needsCheck')
  ].join('\n');
  const ctx = { Object, Array, String, Number, Boolean, Math, RegExp };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return ctx;
}

/* 잘 읽힌 사진 한 장 — 갈래만 바꿔 가며 넣는다.
   ⚠ auto:false 다. 판독기는 「넣을 곳이 없는 갈래」에 auto:false + done:true 를
     준다(autoOk). 그 상태에서 할 일이 되는지가 이 검사의 핵심이다. */
function photo(kind, extra) {
  return { meta: { w: 2000, h: 1400, read: Object.assign(
    { kind: kind, auto: false, fields: { company: '가야엔지니어링' } }, extra || {}) } };
}

/* 갈래 → [할 일인가, 이유에 들어 있어야 할 말, 판독 결과 덧붙임]
   ⚠ 판독기가 아는 갈래를 **빠짐없이** 적는다(아래에서 대조한다).
   ⚠ 명함·사업자등록증·중소기업확인서는 **잘 읽힌 뒤에야**(auto:true) 「어디로
     보낼까」 단계에 닿는다. auto:false 면 그 전에 「값이 미덥지 않음」으로 걸리므로,
     보내기 단계를 보려면 auto:true 로 넣어야 한다. */
const TABLE = {
  meeting:   [false, null],                    // 회의·현장 사진 — 넣을 곳이 없다
  contract:  [false, null],                    // 계약서 — 사진첩에만 보관(2026-08-15 고침)
  payslip:   [true,  /지워/],                  // 보관하지 않는 서류 — 지워야 한다
  /* ⚠ 2026-08-24 대표 지시로 둘의 뜻이 바뀌었다 — 「조건 없이 할 일」에서
     「사람이 해서 달라지는 것이 있을 때만」으로. 그래서 표에는 **할 일이 되는 꼴**을
     넣고, 할 일이 아닌 꼴은 아래에 따로 못박는다. */
  chat:      [true,  /할 일/, { fields: { company: '가야엔지니어링',
                                          todos: [{ t: '견적서 보내기', done: false }] } }],
  timesheet: [true,  /대조/],                  // 손글씨 숫자는 기계가 검산할 방법이 없다
  form:      [true,  /기업 상세/, { fields: { company: '가야엔지니어링',
                                             bizno: '312-81-49225' } }],
  /* CMS 자동이체 신청서 (대표 지시 2026-08-28) — 서식과 같은 자리로 간다.
     ⚠ 그 서식에는 **사업자번호 칸이 아예 없다.** 업체명만으로도 보낼 수 있어야 하므로
       여기 표본도 업체명만 준다 — 그것으로 할 일이 잡혀야 맞다. */
  cms:       [true,  /기업 상세/, { fields: { company: '아이행복어린이집',
                                             bankName: '국민은행',
                                             bankAcct: '123456-04-567890',
                                             bankHolder: '양유정' } }],
  card:      [true,  /기업정보함/, { auto: true }],   // 잘 읽혔는데 아직 기업정보함에 안 갔다
  bizreg:    [true,  /기업정보함/, { auto: true }],   // 〃
  sme:       [true,  /업체관리/, { auto: true }], // 업체관리에 못 넣었다
  /* 통장·계좌 (2026-08-31 갈래 추가 / 2026-09-02 갈 곳 부여) — 서식·CMS 와 같은 자리로 간다.
     ⚠ 갈래를 만들 때 «보낼 길»을 안 만들어, 은행·계좌·예금주를 읽어 놓고 아무 곳에도
       안 갔다. 그 서식에도 사업자번호 칸이 없어 업체명으로 찾는다(CMS 와 같은 규칙). */
  bankbook:  [true,  /기업 상세/, { fields: { company: '아이행복어린이집',
                                             bankName: '국민은행',
                                             bankAcct: '123456-04-567890',
                                             bankHolder: '양유정' } }],
  /* ── 근로자 서류 넷 (대표 결정 2026-09-01) ──
     회사가 아니라 «사람»에게 간다. 열쇠가 「이름 + 회사」라 둘 다 있어야 할 일이 된다 —
     회사가 없으면 보낼 수 없으므로 아래 NOT_TODO 에 그 꼴을 따로 못박는다. */
  idcard:    [true,  /근로자 정보함/, { fields: { name: '강석', company: '해찬솔에프쓰리' } }],
  resident:  [true,  /근로자 정보함/, { fields: { name: '강석', company: '해찬솔에프쓰리' } }],
  mandate:   [true,  /근로자 정보함/, { fields: { name: '강석', company: '해찬솔에프쓰리' } }],
  consent:   [true,  /근로자 정보함/, { fields: { name: '강석', company: '해찬솔에프쓰리' } }],
  /* ── 근로계약서 (대표 지시 2026-09-02) ──
     ⚠ 바로 위 contract 와 «갈 곳이 다르다». 우리 사무소 계약은 사진첩에만 두지만,
       근로계약서는 근로자와 사업주의 것이라 «사람»에게 간다(WORKER_KINDS). */
  wcontract: [true,  /근로자 정보함/, { fields: { name: '강석', company: '해찬솔에프쓰리' } }],
  other:     [true,  /분류 지정/]              // 종류를 못 가렸다(내용은 읽었다)
};

for (const kind of Object.keys(TABLE)) {
  const [want, why, extra] = TABLE[kind];
  test('★ ' + kind + ' — ' + (want ? '할 일이다' : '할 일이 아니다'), () => {
    const c = load();
    const p = photo(kind, extra);
    assert.equal(c.needsCheck(p), want,
      kind + ' 의 판정이 표와 다릅니다. 갈래를 새로 넣었다면 KEEP_ONLY 와 이 표를 함께 고쳐 주세요.');
    const w = c.checkWhy(p);
    assert.equal(!!w, want, kind + ' — 할 일 여부와 이유가 어긋납니다: "' + w + '"');
    if (why) assert.match(w, why, kind + ' 의 이유가 엉뚱합니다: "' + w + '"');
  });
}

/* ── 「할 일이 아닌 꼴」도 표만큼 못박는다 (대표 지시 2026-08-24) ──
   위 표는 갈래마다 한 줄뿐이라 「언제 할 일이 아닌가」를 담을 수 없다. 그 자리를
   비워 두면 조건을 도로 「조건 없이 할 일」로 되돌려도 검사가 통과한다. */
const NOT_TODO = [
  ['서식 — 보낼 곳이 없다(사업자번호를 못 읽음)', 'form',
    { fields: { docName: '통합 기술보호지원반 신청서' } }],
  ['서식 — 기업 상세로 이미 보냈다', 'form',
    { fields: { bizno: '312-81-49225' }, filedInfo: { at: 1756000000000, n: 4 } }],
  ['대화캡처 — 뽑은 할 일을 다 끝냈다', 'chat',
    { fields: { todos: [{ t: 'ㄱ', done: true }] } }],
  ['대화캡처 — 뽑은 할 일이 하나도 없다', 'chat', { fields: {} }],
  /* ── 근로자 서류 — 이미 근로자 정보함에 보냈다 (2026-09-01) ── */
  ['신분증 — 근로자 정보함에 이미 보냈다', 'idcard',
    { fields: { name: '강석', company: '해찬솔에프쓰리' },
      filedWk: { at: 1756000000000, n: 1 } }],
  /* ⚠ 통장도 같다 — 보낸 뒤에도 할 일로 남으면 치울 수 없는 ⚠ 가 된다 */
  ['통장 — 기업 상세로 이미 보냈다', 'bankbook',
    { fields: { company: '아이행복어린이집', bankName: '국민은행',
                bankAcct: '123456-04-567890', bankHolder: '양유정' },
      filedInfo: { at: 1756000000000, n: 3 } }]
];
for (const [name, kind, extra] of NOT_TODO) {
  test('★ ' + name + ' — 할 일이 아니다', () => {
    const c = load();
    const p = photo(kind, extra);
    assert.equal(c.needsCheck(p), false,
      '★ 치울 수 없는 할 일이 쌓이면 정작 손봐야 할 것이 묻힙니다');
    assert.equal(c.checkWhy(p), '', '할 일이 아니면 이유도 없어야 합니다');
  });
}

test('★ 판독기가 아는 갈래가 표에 하나도 빠지지 않았다', () => {
  /* 갈래를 새로 넣고 표에 안 적으면 여기서 멈춘다 — 이번 사고가 정확히 그것이었다. */
  const m = reader.match(/var KINDS = \{([^}]*)\}/);
  assert.ok(m, '판독기의 갈래 목록을 찾지 못했습니다');
  const kinds = m[1].split(',').map(s => s.split(':')[0].trim()).filter(Boolean);
  const missing = kinds.filter(k => !(k in TABLE));
  assert.deepEqual(missing, [],
    '판독기는 아는데 이 표에 없는 갈래: ' + missing.join(', ')
    + ' — 할 일인지 아닌지 정하고 KEEP_ONLY·표에 함께 적어 주세요');
});

test('★ 보관만 하는 갈래는 한 곳에만 적혀 있다', () => {
  /* 갈래 이름을 함수 안에 흩어 적으면 한쪽이 꼭 빠진다 — 목록(KEEP_ONLY) 하나로 본다.
     ⚠ 2026-08-27: 판정 자체도 checkWhy 한 곳으로 모았다(needsCheck 는 그것을 그대로
       쓴다). 그래서 「두 함수가 같은 목록을 쓰는가」는 이제 잴 것이 없다. */
  const why = fnOf(app, 'checkWhy');
  assert.match(why, /KEEP_ONLY\[r\.kind\]/, 'checkWhy 가 공용 목록을 안 씁니다');
  assert.match(fnOf(app, 'needsCheck'), /return !!checkWhy\(it\);/,
    '★ 판정이 다시 두 벌로 갈라지면 목록에서 한쪽이 빠집니다');
  assert.ok(!/r\.kind === 'meeting'/.test(why),
    '갈래를 함수 안에 또 적어 두었습니다 — 목록 한 곳으로 모아 주세요');
});

test('급여서류는 「보관만」 목록에 넣지 않는다 — 지워야 끝나는 일이다', () => {
  /* ⚠ 지금은 payslip 을 목록보다 **먼저** 가르므로 목록에 넣어도 겉으로는 아무
     일이 없다. 그래서 잘못 넣어도 아무 검사가 안 걸린다 — 조용한 함정이다.
     나중에 판정 순서를 손대는 순간 급여서류가 할 일에서 통째로 사라진다
     (보관하지 않기로 한 서류가 목록에서 없어지면 아무도 안 지운다). */
  const keep = app.match(/const KEEP_ONLY = \{([^}]*)\};/);
  assert.ok(keep, 'KEEP_ONLY 를 찾지 못했습니다');
  assert.ok(!/payslip/.test(keep[1]),
    '급여서류가 「보관만」 목록에 들어 있습니다 — 지워야 하는 서류가 할 일에서 사라집니다');
  /* ⚠ 2026-08-27: 순서를 보던 자리가 needsCheck 였는데, 판정이 checkWhy 한 곳으로
     모이면서 그쪽으로 옮겼다. 지키는 것은 그대로 — 급여서류가 목록보다 앞이다. */
  const why = fnOf(app, 'checkWhy');
  assert.ok(why.indexOf("kind === 'payslip'") < why.indexOf('KEEP_ONLY'),
    '급여서류 판정이 목록보다 뒤로 밀렸습니다 — 순서가 바뀌면 조용히 사라집니다');
});

test('「확인했음」을 누르면 치울 수 있다 — 치울 수 없는 할 일을 만들지 않는다', () => {
  /* payslip 만 예외다(지워야 끝난다). 나머지는 반드시 빠져나갈 길이 있어야 한다. */
  const c = load();
  ['chat', 'timesheet', 'form', 'card', 'bizreg', 'sme', 'other'].forEach(function (k) {
    assert.equal(c.needsCheck(photo(k, { ack: true })), false,
      k + ' 은 「확인했음」으로도 안 치워집니다 — 목록을 못 믿게 됩니다');
  });
});
