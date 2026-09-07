/* 사진첩 → 기업 상세 다리의 구멍 둘 (대표 지시 2026-09-07)

   ■ ① 못 보낸 «까닭»이 화면에 안 나왔다
   `read.filedInfoError` 를 쓰는 자리는 둘인데 그리는 자리가 **0곳**이었다. 실패하면
   아래 「보내기」 단추가 그대로 다시 나와, 사람은 왜 안 갔는지 모른 채 같은 단추를
   또 눌렀다 — 같은 답이 또 오고, 고장인 줄 안다.
   ★ 명함(`filedError`)·업체관리(`filedCoError`)·근로자(`filedWkError`) 실패는 **다**
     화면에 나온다. 넷 중 기업 상세 것만 빠져 있었다.

   ■ ② 서식은 「상호를 적어 주세요」해 놓고 적어도 안 받았다
   상호 «묻는» 목록(`CO_FIX_KINDS`)에는 `form` 이 있는데, 상호로 «보낼 수 있나»를
   보는 문(`canSendCoInfo`)은 `cms`·`bankbook` 둘만 적어 두었다.
   하필 그 함수 바로 위 주석이 통장에서 겪고 이렇게 적어 두었다 —
   「적는 칸을 내주고 그 값을 안 보는 것은 적으라고 해 놓고 안 받는 것이다」.

   ★ 못 박는 것
     ① 「상호를 묻는 갈래」와 「상호로 보낼 수 있는 갈래」가 **같다**
        (상수를 함께 쓰지 못한다 — 검사 일곱 벌이 canSendCoInfo 를 통째로 떠서 돌린다.
         그래서 목록은 제자리에 두고, 같은지는 여기서 지킨다.)
     ② 상호로 가는 길은 «스스로» 열리지 않는다 — 사람이 눌러야 한다
     ③ 못 보낸 까닭이 화면에 나오고, 다시 보낼 길이 함께 있다

   ⚠ 화면 쪽은 «조건을 통째로» 본다. 「글자가 있나」만 보면 `false && read.filedInfoError`
     로 꺼도 글자는 남아 초록이 된다 — 2026-09-07 고장넣기에서 실제로 샜다
     (이 저장소 「되풀이된 실수 ②」 그대로다).

     node --test tests/photos-coinfo-name-kinds.test.js */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'pu-photos.html'), 'utf8').split('\r\n').join('\n');

function fnBody(name) {
  const i = SRC.search(new RegExp('(?:^|\\n)(?:async )?function ' + name + '\\('));
  assert.ok(i >= 0, name + ' 을 찾지 못했습니다');
  const open = SRC.indexOf('{', i);
  let d = 0;
  for (let k = open; k < SRC.length; k++) {
    if (SRC[k] === '{') d++;
    else if (SRC[k] === '}') { d--; if (!d) return SRC.slice(i, k + 1); }
  }
  assert.fail(name + ' 의 끝을 찾지 못했습니다');
}
const bare = s => String(s).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

/* 상호를 «묻는» 갈래 — 화면 쪽 목록 */
function 묻는갈래() {
  const m = SRC.match(/const CO_FIX_KINDS = \{([^}]*)\}/);
  assert.ok(m, 'CO_FIX_KINDS 를 못 찾았다');
  return m[1].split(',').map(s => s.split(':')[0].trim()).filter(Boolean).sort();
}

/* 판독기가 가르는 갈래 전부 (js/pu-doc-read.js 의 목록) */
const ALL_KINDS = ['card', 'bizreg', 'sme', 'payslip', 'meeting', 'contract', 'wcontract',
  'chat', 'timesheet', 'cms', 'bankbook', 'idcard', 'resident', 'mandate', 'consent',
  'form', 'other'];

/* 문을 통째로 떠서 «돌린다» */
function gate() {
  const ctx = { console, String, Number, Object, Promise };
  vm.createContext(ctx);
  const fix = SRC.match(/^const FIX_KEYS = \[[^\n]*\];/m);
  assert.ok(fix, 'FIX_KEYS 를 못 찾았다');
  vm.runInContext(fix[0].replace('const ', 'var ') + '\n'
    + fnBody('readFields') + '\n'
    + fnBody('canSendCoInfo') + '\n'
    + fnBody('autoSendCoInfo'), ctx);
  return ctx;
}
function 보내는갈래(c) {
  return ALL_KINDS.filter(k =>
    c.canSendCoInfo({ kind: k, fields: { company: '아이행복어린이집' } })).sort();
}

/* ── ① 두 목록이 같다 ── */

test('★★ 「상호를 묻는 갈래」와 「상호로 보낼 수 있는 갈래」가 같다', () => {
  const a = 묻는갈래(), b = 보내는갈래(gate());
  assert.equal(b.join(','), a.join(','),
    '★ 두 목록이 어긋났다 — 묻는 것: ' + a.join(',') + ' / 받는 것: ' + b.join(',')
    + '\n  적는 칸을 내주고 그 값을 안 보면 「적으라고 해 놓고 안 받는 것」이 된다.');
});

test('★★ 서식(form)이 그 안에 있다 — 2026-09-07 에 빠져 있던 그것이다', () => {
  assert.ok(묻는갈래().indexOf('form') >= 0, '★ 서식에 상호를 묻지 않는다');
  assert.equal(gate().canSendCoInfo({ kind: 'form', fields: { company: '아이행복' } }), true,
    '★ 서식에 상호를 적어도 안 받는다');
});

test('★★ 상호를 «묻지 않는» 갈래는 상호로 못 보낸다 — 급여명세서로 회사가 생기면 안 된다', () => {
  const c = gate();
  ['payslip', 'timesheet', 'chat', 'idcard', 'card'].forEach(k =>
    assert.equal(c.canSendCoInfo({ kind: k, fields: { company: '아이행복' } }), false,
      '★ ' + k + ' 이 상호만으로 기업 상세에 간다'));
});

test('★ 사업자번호가 열 자리면 갈래를 안 가린다 — 번호가 곧 회사다', () => {
  const c = gate();
  ['form', 'cms', 'bankbook', 'payslip', 'other'].forEach(k =>
    assert.equal(c.canSendCoInfo({ kind: k, fields: { bizno: '312-81-49225' } }), true,
      '★ ' + k + ' 이 번호가 있는데도 못 간다'));
});

test('★ 상호도 번호도 없으면 안 간다 · 이미 보낸 것도 안 간다', () => {
  const c = gate();
  /* ⚠ assert 마다 «무엇이 틀렸는지»를 적는다 — 말 없는 assert 는 나중에 그 줄만
       보고는 알 수 없다. 2026-09-07 고장넣기에서 첫 줄이 말없이 터져 무슨 고장인지
       못 가렸다. */
  assert.equal(c.canSendCoInfo({ kind: 'form', fields: {} }), false,
    '★ 상호도 번호도 없는데 보낼 수 있다고 한다 — 어느 회사인지 모른다');
  assert.equal(c.canSendCoInfo({ kind: 'form', fields: { company: '   ' } }), false,
    '★ 빈칸만 적어도 보낼 수 있다고 한다');
  assert.equal(c.canSendCoInfo({ kind: 'form', fields: { company: 'x' }, filedInfo: { at: 1 } }), false,
    '★ 이미 보낸 것을 또 보낸다');
  assert.equal(c.canSendCoInfo({ kind: 'form', error: '판독 실패', fields: { company: 'x' } }), false,
    '★ 판독이 실패한 것을 보낸다');
  assert.equal(c.canSendCoInfo(null), false, '★ 판독 결과가 없는데 보낸다');
});

/* ── ② 상호로 가는 길은 스스로 안 열린다 ── */

test('★★ 상호만 있는 것은 «스스로» 안 간다 — 이름 맞추기가 틀리면 남의 회사에 붙는다', () => {
  const c = gate();
  ['form', 'cms', 'bankbook'].forEach(k => {
    /* bizNoOk 를 참으로 «억지로» 둬도 안 가야 한다 — 번호가 없으니까 */
    assert.equal(c.autoSendCoInfo({ kind: k, bizNoOk: true, fields: { company: '아이행복' } }), false,
      '★ ' + k + ' 이 상호만으로 스스로 갔다');
  });
});

test('★★ 번호를 «직접» 본다 — bizNoOk 하나에 기대면 판독기가 바뀔 때 조용히 열린다', () => {
  const body = bare(fnBody('autoSendCoInfo'));
  assert.match(body, /bizno/, '★ 번호를 안 본다 — bizNoOk 만 믿고 있다');
  assert.match(body, /length < 10|length >= 10/, '★ 열 자리를 안 센다');
  assert.match(body, /bizNoOk === true/, '★ 검산 결과를 안 본다');
});

test('★ 검산한 번호는 스스로 간다 — 그 길을 막아 버리면 안 된다', () => {
  const c = gate();
  assert.equal(c.autoSendCoInfo({ kind: 'form', bizNoOk: true, fields: { bizno: '312-81-49225' } }), true);
  assert.equal(c.autoSendCoInfo({ kind: 'form', bizNoOk: false, fields: { bizno: '312-81-49225' } }), false,
    '★ 검산에 걸린 번호가 스스로 갔다 — 지어낸 번호도 열 자리다');
});

/* ── ③ 못 보낸 까닭이 화면에 나온다 ── */

test('★★ 못 보낸 까닭을 «그린다» — 적어 두기만 하면 아무도 못 본다', () => {
  const panel = fnBody('renderReadPanel');
  /* ⚠ 조건을 통째로 못 박는다 — 「글자가 있나」만 보면 false && … 로 꺼도 초록이다 */
  assert.match(panel, /\} else if \(read\.filedInfoError\) \{/,
    '★ filedInfoError 갈래가 없거나 조건이 달라졌다 — 실패가 조용히 삼켜진다');
  assert.match(panel, /기업 상세에 보내지 못했습니다/, '★ 무엇이 실패했는지 안 말한다');
  assert.match(panel, /esc\(read\.filedInfoError\)/, '★ 까닭 글자를 그대로 안 낸다');
});

test('★★ 넷 다 «같은 결»로 나온다 — 하나만 빠져 있던 것이 이 일의 시작이다', () => {
  const panel = fnBody('renderReadPanel');
  ['filedError', 'filedCoError', 'filedInfoError', 'filedWkError'].forEach(k =>
    assert.match(panel, new RegExp('\\} else if \\(read\\.' + k + '\\) \\{'),
      '★ ' + k + ' 갈래가 없거나 조건이 달라졌다'));
  /* 네 실패 줄이 모두 같은 차림(.cause)이어야 한다 — 하나만 다르면 눈이 그것을 놓친다 */
  const causes = (panel.match(/class="cause">[^<]*/g) || []);
  assert.ok(causes.length >= 4, '★ 실패 줄이 ' + causes.length + '개뿐이다 (넷이어야 한다)');
});

test('★★ 다시 보낼 길이 함께 있다 — 까닭만 말하고 길이 없으면 막다른 곳이다', () => {
  const panel = fnBody('renderReadPanel');
  const at = panel.indexOf('read.filedInfoError');
  const seg = panel.slice(at, panel.indexOf('} else', at) + 1);
  assert.match(seg, /sendCoInfoNow\(\)/, '★ 다시 보낼 단추가 없다');
  /* ⚠ 단추 조건을 여기 따로 적으면 보내는 쪽과 갈려, 눌러도 아무 일이 안 일어난다 */
  assert.match(seg, /canSendCoInfo\(read\)/,
    '★ 보낼 수 있는지를 canSendCoInfo 로 안 묻는다 — 죽은 단추가 생긴다');
});

test('★ 이미 보냈으면 실패 줄이 안 나온다 — 옛 실패가 성공 위에 남으면 안 된다', () => {
  const panel = fnBody('renderReadPanel');
  const ok = panel.indexOf('read.filedInfo && read.filedInfo.at');
  const err = panel.indexOf('read.filedInfoError');
  assert.ok(ok > 0 && err > ok, '★ 실패 줄이 성공 줄보다 «앞»에 있다');
  /* 성공 줄과 실패 줄 «사이»에 else if 가 있어야 한 사슬이다 —
     두 개의 if 로 나뉘어 있으면 옛 실패가 성공 위에 함께 남는다. */
  assert.match(panel.slice(ok, err), /\} else if \(/,
    '★ 두 줄이 같은 사슬(else if)이 아니다 — 둘이 함께 나온다');
});
