'use strict';
/* 📗 통장 사본 — 읽은 뒤 «어디로 가는가» (대표 물음 2026-09-03)

   「통장사본 등을 읽기하는 것도 필요한데 어떻게 해야하나」

   ■ 무엇이 막혀 있었나
   읽기는 2026-08-31 부터 되고 있었다. 막힌 곳은 «그다음»이다 —
   통장에는 **사업자등록번호 칸이 아예 없다.** 그래서 업체를 찾을 열쇠가 «상호» 하나뿐인데,
   「동탄반송점 …」처럼 지점 이름이면 업체관리의 이름과 안 맞는다.
   그러면 **아무 데도 안 가고 할 일에도 안 떴다** — 읽어 놓고 조용히 사진첩에만 남았다.
   사람은 계좌가 어디로도 안 갔다는 것조차 알 길이 없었다.

   ■ 고친 것 넷
   ① 사람이 적은 상호가 «실제로» 먹힌다 — 종전에는 적는 칸을 내주고도 판독값만 보았다
   ② 통장·CMS·서식에도 「회사 채우기」 칸이 뜬다(그 셋은 «회사»만 묻는다)
   ③ 못 보냈으면 **할 일로 남기고 까닭을 말한다** + 「그냥 보관」으로 치울 수 있다
   ④ 평생계좌를 계좌번호와 «갈라» 읽는다 — 한 칸이면 어느 쪽이 담겼는지 모른다

   실행: node --test tests/photos-bankbook-route.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { cutFn } = require('./cut-fn');

const R = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');
const reader = fs.readFileSync(path.join(R, 'js', 'pu-doc-read.js'), 'utf8');

/* 판정을 «실제로» 돌린다 — 글자로만 보면 「부르긴 하는데 값이 틀린」 것을 못 잡는다 */
function load() {
  const grab = re => { const m = app.match(re); assert.ok(m, '못 찾음: ' + re); return m[0].replace('const ', 'var '); };
  const c = { Number, Math, String, RegExp, Object, Array, Boolean, Date };
  vm.createContext(c);
  vm.runInContext([
    grab(/^const FIX_KEYS = \[[^\r\n]*\];/m),
    grab(/^const CO_FIX_KINDS = \{[^}]*\};/m),
    grab(/^const WORKER_KINDS = \{[^}]*\};/m),
    cutFn(app, 'function readFields('),
    cutFn(app, 'function canSendCoInfo('),
    cutFn(app, 'function fixKeysOf('),
    cutFn(app, 'function fixBoxOn('),
    cutFn(app, 'function coWhyNot('),
    cutFn(app, 'function formTodo(')
  ].join('\n'), c);
  return c;
}
const F = load();

const bank = (fields, extra) => Object.assign({ kind: 'bankbook', fields: fields || {} }, extra || {});

/* ══════ ① 사람이 적은 상호가 «먹힌다» ══════ */

test('★★★ 손으로 적은 상호로도 기업 상세에 보낼 수 있다 — 적는 칸을 내주고 안 받으면 안 된다', () => {
  const r = bank({ bankName: '중소기업은행', bankAcct: '547-000000-00-000' });
  assert.equal(F.canSendCoInfo(r), false, '아무것도 없으면 못 보냅니다');
  const typed = bank({ bankName: '중소기업은행' }, { fix: { company: '가나김산업' } });
  assert.equal(F.canSendCoInfo(typed), true,
    '★★★ 사람이 상호를 적었는데도 「보낼 수 없다」입니다 — 적으라고 해 놓고 그 값을 안 봅니다.\n' +
    '  (종전에는 read.fields 만 보아 fix 가 통째로 무시됐습니다)');
});

test('★★ 막는 쪽과 보내는 쪽이 «같은 값»을 본다 — 갈리면 옛 이름으로 간다', () => {
  const send = cutFn(app, 'function coInfoFields(');
  assert.match(send, /readFields\(read\)/,
    '★★ 보내는 자리가 판독값만 보면 「단추는 떴는데 옛 이름으로 간다」가 됩니다');
  assert.match(cutFn(app, 'function canSendCoInfo('), /readFields\(read\)/);
});

/* ══════ ② 회사 채우기 칸 ══════ */

test('★★ 통장·CMS·서식에도 «회사 채우기» 칸이 뜬다 — 통장에는 사업자번호 칸이 없다', () => {
  ['bankbook', 'cms', 'form'].forEach(function (k) {
    assert.equal(F.fixBoxOn({ kind: k, fields: {} }), true, '★★ ' + k + ' 에 칸이 안 뜹니다');
  });
  assert.equal(F.fixBoxOn({ kind: 'bankbook', fields: {}, filedInfo: { at: 1, n: 3 } }), false,
    '★ 이미 보냈으면 칸을 접습니다');
});

test('★★ 그 셋에는 «회사»만 묻는다 — 통장에 이름 칸은 쓸 데가 없다', () => {
  const co = F.fixKeysOf({ kind: 'bankbook' }).map(function (p) { return p[0]; });
  assert.deepEqual(Array.prototype.slice.call(co), ['company'],
    '★★ 통장에 이름 칸까지 내면 무엇을 적으라는 건지 알 수 없습니다');
  const wk = F.fixKeysOf({ kind: 'idcard' }).map(function (p) { return p[0]; });
  assert.ok(wk.indexOf('name') >= 0 && wk.indexOf('company') >= 0,
    '★★ 근로자 서류는 이름·회사 둘 다 물어야 합니다 — 사람을 가리는 열쇠입니다');
});

test('★★★ 안 그린 칸은 «건드리지 않는다» — 저장 한 번에 이름이 지워지면 안 된다', () => {
  const fn = cutFn(app, 'function fixSave(');
  assert.match(fn, /Object\.assign\(\{\}, \(it\.meta\.read\.fix \|\| \{\}\)/,
    '★★★ 빈 판에서 새로 만들면 통장을 저장할 때 이미 채워 둔 이름이 조용히 지워집니다');
  assert.match(fn, /fixKeysOf\(it\.meta\.read\)\.forEach/,
    '★★ 안 그린 칸까지 훑으면 없는 칸을 빈 값으로 덮습니다');
});

/* ══════ ③ 조용히 멈추지 않는다 ══════ */

test('★★★ 못 보낸 통장은 «할 일»로 남는다 — 조용히 멈추면 아무도 모른다', () => {
  const why = cutFn(app, 'function checkWhy(');
  assert.match(why, /어느 업체 것인지 몰라 못 보냈습니다/,
    '★★★ 통장이 아무 데도 안 갔는데 할 일에도 안 뜨면, 읽힌 계좌가 어디로도 안 갔다는 것을\n' +
    '  사람이 알 길이 없습니다(2026-09-03 대표 물음이 바로 이것입니다)');
  assert.match(why, /r\.kind === 'bankbook' && !\(r\.filedInfo && r\.filedInfo\.at\) && !\(r\.coSkip && r\.coSkip\.at\)/,
    '★★ 이미 보냈거나 「그냥 보관」한 것까지 할 일로 남으면 치울 수 없는 ⚠ 가 됩니다');
});

test('★★ 「그냥 보관」으로 치울 수 있다 — 업체 없는 통장이 영영 ⚠ 로 남으면 안 된다', () => {
  const fn = cutFn(app, 'function coSkipSave(');
  assert.match(fn, /coSkip: \{ at: Date\.now\(\)/, '★★ 답한 표시가 없으면 다음에 또 뜹니다');
  assert.match(fn, /by: PuPhotoStore\.myName\(\)/, '★ 누가 정했는지 남아야 합니다');
  assert.match(fn, /PuPhotoStore\.saveRead\(/, '★★ 저장을 안 하면 새로고침에 도로 살아납니다');
  assert.ok(fn.indexOf('deletePhoto') < 0 && fn.indexOf('fields') < 0,
    '★★ 답했다고 사진이나 판독값까지 없애면 잘못 눌렀을 때 잃는 것이 너무 큽니다');
  assert.match(app, /onclick="coSkipSave\(\)"/, '★★ 단추가 없으면 함수만 있고 아무도 못 누릅니다');
});

test('★ 왜 못 보내는지 화면이 말한다 — 단추만 없으면 「왜 안 되지」로 시간을 버린다', () => {
  assert.equal(F.coWhyNot(bank({ bankName: '농협' })), '어느 업체 것인지 몰라 기업 상세로 못 보냈습니다 — 상호를 적어 주세요');
  assert.equal(F.coWhyNot(bank({ bizno: '312-81-49225' })), '', '★ 보낼 수 있으면 까닭이 없어야 합니다');
  assert.equal(F.coWhyNot({ kind: 'idcard', fields: {} }), '', '★ 근로자 서류는 이 말을 쓰지 않습니다');
});

/* ══════ ④ 계좌가 둘일 때 ══════ */

test('★★★ 평생계좌를 계좌번호와 «갈라» 읽는다 — 한 칸이면 어느 쪽인지 모른다', () => {
  assert.match(reader, /bankAcctAlt\(평생계좌·모계좌처럼/,
    '★★★ 통장 겉장에 계좌가 둘 적힌 것이 흔합니다. 한 칸뿐이면 둘 중 하나만 담기고\n' +
    '  어느 쪽인지도 몰라, 그 값으로 자동이체를 걸면 틀린 계좌로 나갑니다');
  assert.match(reader, /정식 계좌번호를 bankAcct 에, 평생계좌·모계좌처럼 이름이 따로 붙은 것을 bankAcctAlt 에/,
    '★★ 어느 것을 어디 담을지 안 알려 주면 뒤바뀝니다');
  assert.match(reader, /하나뿐이면 bankAcct 에만 담고 bankAcctAlt 는 빈 문자열/,
    '★ 하나뿐일 때 같은 값이 두 칸에 들어가면 「둘인 줄」 압니다');
});

test('★★ 개인사업자 통장은 사람 이름과 상호를 «둘 다» 담는다', () => {
  assert.match(reader, /예금주가 사람 이름이고 상호가 함께 적혀 있으면\(개인사업자 통장\)/,
    '★★ 하나만 담으면 「누구 것인가」와 「어느 업체 것인가」 가운데 하나를 잃습니다');
});

test('★★ 주민번호는 그대로 «안 읽는다» — 계좌를 나눠 담는다고 넓히지 않는다', () => {
  const i = reader.indexOf('kind=bankbook 이면 키:');
  const line = reader.slice(i, reader.indexOf('\n', i));
  ['rrn', '주민', '생년월일'].forEach(function (k) {
    assert.ok(line.indexOf(k) < 0, '★★ 키 목록에 「' + k + '」이 들어왔습니다');
  });
  assert.match(reader, /kind=bankbook 에서도 \*\*주민등록번호는 절대 담지 마세요\*\*/);
});

test('★★ 읽은 계좌가 표에 «보인다» — 이름표가 없으면 안 읽힌 것처럼 보인다', () => {
  const m = /const READ_ROWS = \[([\s\S]*?)\];/.exec(app);
  assert.ok(m, 'READ_ROWS 를 못 찾았습니다');
  ['bankName', 'bankAcct', 'bankAcctAlt', 'bankHolder'].forEach(function (k) {
    assert.ok(m[1].indexOf("'" + k + "'") > 0,
      '★★ 「' + k + '」에 이름표가 없어 판독 표에서 통째로 빠집니다');
  });
});

test('★★ 물음 판을 올렸다 — 안 올리면 이미 읽어 둔 통장에 평생계좌가 «영영» 안 잡힌다', () => {
  const pv = Number((/var PROMPT_VERSION = (\d+);/.exec(reader) || [])[1]);
  assert.ok(pv >= 16, '★★ 물음이 바뀌었으면 판을 올려야 스스로 다시 읽힙니다 (지금 ' + pv + ')');
  const rv = Number((/var READ_VERSION = (\d+);/.exec(reader) || [])[1]);
  assert.ok(rv >= pv, '★ 판독기 판이 물음 판보다 낮습니다');
});
