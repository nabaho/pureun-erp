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
  const src = [
    'const CARD_KINDS = { card: 1, bizreg: 1 };',
    'const CO_KINDS = { bizreg: 1, sme: 1 };',
    minEdge[0],
    keep[0],
    fnOf(app, 'readAnyField'),
    fnOf(app, 'coFilledOk'),
    fnOf(app, 'tooSmall'),
    fnOf(app, 'checkWhy'),
    fnOf(app, 'needsCheck')
  ].join('\n');
  const ctx = {};
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
  chat:      [true,  /할 일/],                 // 뽑아 둔 할 일을 사람이 본다
  timesheet: [true,  /대조/],                  // 손글씨 숫자는 확인 전까지 못 믿는다
  form:      [true,  /읽은 칸/],               // 읽은 칸을 한 번 본다
  card:      [true,  /명함첩/, { auto: true }],   // 잘 읽혔는데 아직 명함첩에 안 갔다
  bizreg:    [true,  /명함첩/, { auto: true }],   // 〃
  sme:       [true,  /업체관리/, { auto: true }], // 업체관리에 못 넣었다
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
  /* 두 함수에 따로 적으면 이번처럼 한쪽이 빠진다 */
  const why = fnOf(app, 'checkWhy'), need = fnOf(app, 'needsCheck');
  assert.match(why, /KEEP_ONLY\[r\.kind\]/, 'checkWhy 가 공용 목록을 안 씁니다');
  assert.match(need, /KEEP_ONLY\[r\.kind\]/, 'needsCheck 가 공용 목록을 안 씁니다');
  assert.ok(!/r\.kind === 'meeting'/.test(why + need),
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
  const need = fnOf(app, 'needsCheck');
  assert.ok(need.indexOf("kind === 'payslip'") < need.indexOf('KEEP_ONLY'),
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
