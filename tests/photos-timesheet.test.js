/* 근태·휴무표 — 손글씨를 표로, 원본과 절반씩 나란히 (대표 지시 2026-08-13)
   "한글 부분 자동 엑셀로 정리할 수 있나? OCR 정밀하게 처리해야 되는데.
    A4 정도 크기는 화면의 나머지 절반에 인식된 내용을 정리해서 보여줄 수 있게 —
    그렇게 해야 정밀하게 찾을 수 있다."

   ⚠ 손글씨 숫자는 어떤 도구든 틀린다. 그래서 이 검사가 지키는 것은
     「정확히 읽는다」가 아니라 **정직함의 겹**이다:
       못 읽으면 지어내지 않는다 · 범위 밖 날짜는 안 받는다 ·
       개수를 세어 보여 준다 · 사람이 고칠 수 있고 고친 것이 저장된다 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'pu-photos.html'), 'utf8');
const lib = fs.readFileSync(path.join(root, 'js', 'pu-doc-read.js'), 'utf8');

function fnOf(src, name, indent) {
  const pad = indent || '';
  const m = src.match(new RegExp('function ' + name + '\\([\\s\\S]*?\\r?\\n' + pad + '\\}'));
  assert.ok(m, name + ' 을 찾을 수 없습니다');
  return m[0];
}

/* ── 판독 층 ── */
test('★ 판독기가 timesheet 을 알고, 판 번호가 올랐다', () => {
  assert.match(lib, /var KINDS = \{[^}]*timesheet: 1/, '모르면 other 로 뭉개집니다');
  const v = lib.match(/var READ_VERSION = (\d+);/);
  assert.ok(v && +v[1] >= 5,
    '판 번호를 안 올리면 이미 급여서류로 굳은 근태표가 다시 안 읽힙니다: ' + (v && v[1]));
});

test('★ 금액이 적혀 있으면 근태표가 아니라 급여서류다', () => {
  /* 이 경계가 무너지면 임금이 적힌 서류가 「보관 가능」 쪽으로 새어 들어온다 —
     급여서류 안 받기(2026-08-06 대표 결정)가 뚫리는 구멍이 된다. */
  assert.match(lib, /임금 금액이 적혀 있으면 timesheet 이 아니라 payslip/,
    '금액 있는 서류가 근태표로 분류되면 보유기준이 뚫립니다');
});

test('★ 못 읽은 숫자는 지어내지 말라고 시킨다', () => {
  assert.match(lib, /흐려서 읽을 수 없는 숫자는 지어내지 말고 건너뛰세요/,
    '지어낸 날짜는 틀린 날짜보다 나쁩니다 — 검산에도 안 걸립니다');
  assert.match(lib, /일부 판독 불확실/,
    '자신 없는 줄을 표시해야 사람이 그 줄부터 봅니다');
  assert.match(lib, /임금 금액은 담지 마세요/, '근태표에서도 금액은 안 담습니다');
});

test('★ 근태표는 어디로도 안 보낸다 (autoOk)', () => {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(lib.match(/var KINDS = \{[^\n]*/)[0], ctx);
  vm.runInContext('var bizNoValid = function(){ return false; };', ctx);
  vm.runInContext(fnOf(lib, 'autoOk', '  '), ctx);
  const v = ctx.autoOk({ kind: 'timesheet', fields: { rows: [] }, error: null });
  assert.equal(v.auto, false);
  assert.equal(v.done, true, 'done 이 없으면 넣을 곳 없는 것이 할 일로 쌓입니다');
  assert.match(v.why, /근태/, '왜 자동이 아닌지 사람 말로 적혀야 합니다');
});

/* ── 화면: 분류와 자리 ── */
test('★ 근태표 탭이 있고 이름표가 붙는다', () => {
  assert.match(app, /timesheet: '근태·휴무표'/, '이름표가 없으면 「알 수 없음」으로 뜹니다');
  const tabs = app.match(/const KIND_TABS = \[[\s\S]*?\n\];/)[0];
  assert.match(tabs, /key: 'timesheet'[^\n]*kinds: \['timesheet'\], main: 'timesheet'/,
    'main 이 없으면 끌어다 놓기·분류 지정으로 이 칸에 못 넣습니다');
});

test('★ 새 근태표는 「표를 원본과 대조」로 눈에 띈다', () => {
  const w = fnOf(app, 'checkWhy');
  assert.match(w, /timesheet'\) return '근태표 — 표를 원본과 대조'/);
  /* ⚠ **코드 꼴로 찾는다**(`if (!r.auto)`). 그냥 `!r.auto` 로 찾으면 그 줄을 설명하는
     주석을 먼저 집어 순서가 거꾸로 나온다 — 2026-08-27 에 실제로 그렇게 걸렸다. */
  assert.ok(w.indexOf("kind === 'timesheet'") < w.indexOf('if (!r.auto)'),
    '★ auto 판정이 먼저면 근태표가 「미덥지 않음」으로 뭉뚱그려집니다');
});

test('★ 넓은 표 종류만 판이 화면 절반을 쓴다', () => {
  /* 대표 지시의 핵심 — "그렇게 해야 정밀하게 찾을 수 있다"
     2026-08-13 다시 겨눔: 서식(form)도 절반을 쓰게 되어 종류 판단이
     wideKind 한 곳으로 모였다. 지키는 것은 「넓은 표 종류만 넓힌다」이다. */
  assert.match(app, /#readPanel\.wide\{flex:0 0 50%\}/, '넓은 판 꾸밈이 없습니다');
  const p = fnOf(app, 'renderReadPanel');
  assert.match(p, /classList\.toggle\('wide', !!\(it && it\.meta && wideKind\(it\.meta\.read\)\)\)/,
    '판을 넓힐지는 wideKind 한 곳이 정해야 합니다');
  assert.match(p, /timesheetBox\(it\)/, '함수만 있고 안 부르면 화면에 아무것도 없습니다');

  /* wideKind 를 실제로 돌려 본다 — 명함까지 절반을 쓰면 사진이 좁아진다 */
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(fnOf(app, 'wideKind'), ctx);
  assert.equal(ctx.wideKind({ kind: 'timesheet' }), true, '근태표가 안 넓혀집니다');
  assert.equal(ctx.wideKind({ kind: 'form' }), true, '서식이 안 넓혀집니다');
  assert.equal(ctx.wideKind({ kind: 'card' }), false, '명함까지 넓히면 사진이 좁아집니다');
  assert.equal(ctx.wideKind(null), false);
});

/* ── 날짜 정직함 ── */
test('★ 날짜는 1~31 만 받는다 — 실제로 돌려 본다', () => {
  const ctx = { String, parseInt, Array };
  vm.createContext(ctx);
  vm.runInContext(fnOf(app, 'tsParseDays'), ctx);
  /* ⚠ vm 안에서 만든 배열은 밖의 배열과 **다른 종류**라 deepEqual 이 튕긴다.
     알맹이만 견주려고 글자로 이어 붙인다(지난 검사들과 같은 방식). */
  const days = function (s) { return ctx.tsParseDays(s).join(','); };
  assert.equal(days('1, 5, 25'), '1,5,25');
  assert.equal(days('4.11.12.13.14.18.26'), '4,11,12,13,14,18,26',
    '손글씨는 점으로 잇습니다 — 쉼표만 받으면 절반이 버려집니다');
  assert.equal(days('0, 15, 32, 99'), '15', '달력에 없는 날짜를 받으면 검산이 무의미합니다');
  assert.equal(days(''), '');
  assert.equal(days('정상'), '');
});

/* ── 표 그리기 ── */
function boxCtx() {
  const ctx = { Array, Object, String, parseInt };
  vm.createContext(ctx);
  vm.runInContext('var esc = function(s){ return String(s); };', ctx);
  vm.runInContext('var viewingOther = function(){ return false; };', ctx);
  vm.runInContext(fnOf(app, 'tsRows'), ctx);
  vm.runInContext(fnOf(app, 'tsParseDays'), ctx);
  vm.runInContext(fnOf(app, 'tsDays'), ctx);
  vm.runInContext(fnOf(app, 'timesheetBox'), ctx);
  return ctx;
}
const SAMPLE = { id: 'p1', meta: { read: { kind: 'timesheet', rv: 5, fields: {
  company: '애플미르 정육식당', period: '5월',
  rows: [
    { name: '배영승', paid: [1, 5, 25], off: [11, 19, 28], adj: '+4일', note: '' },
    { name: '이옥자', paid: [1, 5, 25], off: [6, 7, 13, 22, 27], adj: '+2일', note: '일부 판독 불확실' },
    { name: '이산다라', paid: [], off: [], adj: '', note: '정상근무' }
  ]
} } } };

test('★ 사람별 표가 그려진다 — 개수 검산이 눈에 보인다', () => {
  const h = boxCtx().timesheetBox(SAMPLE);
  assert.match(h, /배영승/);
  assert.match(h, /1, 5, 25/);
  /* ⚠ 「3일」 하나만 찾으면 안 된다 — 유급·휴무 개수가 우연히 같은 줄이 있어,
     한쪽을 안 세어 줘도 다른 쪽 숫자에 걸려 통과한다(실제로 그랬다).
     **개수 딱지가 줄마다 둘씩** 있는지를 센다. */
  const marks = (h.match(/<b>\d+일<\/b>/g) || []);
  assert.equal(marks.length, SAMPLE.meta.read.fields.rows.length * 2,
    '유급·휴무 **양쪽** 개수를 세어 줘야 손글씨 「+4일」과 견줍니다: ' + marks.join(' '));
  assert.ok(marks.indexOf('<b>3일</b>') >= 0, '유급 3일이 안 세어졌습니다');
  assert.ok(marks.indexOf('<b>5일</b>') >= 0, '휴무 5일이 안 세어졌습니다');
  assert.match(h, /class="iffy"/, '판독이 자신 없다고 한 줄은 노랗게 떠야 그 줄부터 봅니다');
  assert.equal((h.match(/class="iffy"/g) || []).length, 1, '자신 있는 줄까지 노랗게 물들면 안 됩니다');
  assert.match(h, /tsCell\(0,'name'/, '칸을 바로 고칠 수 있어야 합니다');
  assert.match(h, /tsDownload\(\)/, '엑셀 내려받기가 없으면 정리한 보람이 없습니다');
  assert.match(h, /tsCopy\(\)/, '쓰던 엑셀에 붙여넣는 길도 있어야 합니다');
  assert.match(h, /tsAddRow\(\)/, '판독이 줄을 통째로 놓치면 사람이 더할 수 있어야 합니다');
});

test('★ 남의 사진이면 칸이 잠긴다', () => {
  const ctx = boxCtx();
  vm.runInContext('viewingOther = function(){ return true; };', ctx);
  const h = ctx.timesheetBox(SAMPLE);
  assert.ok(/ readonly/.test(h), '남의 사진은 보기만 — 고치기와 같은 원칙입니다');
});

test('줄을 못 뽑았으면 그렇다고 말한다', () => {
  const h = boxCtx().timesheetBox({ meta: { read: { kind: 'timesheet', fields: {} } } });
  assert.match(h, /뽑지 못했습니다/, '빈 화면은 고장으로 읽힙니다');
  assert.equal(boxCtx().timesheetBox({ meta: { read: { kind: 'card', fields: {} } } }), '',
    '명함 패널에 근태 상자가 생기면 안 됩니다');
});

/* ── 고치기 → 저장 ── */
function cellCtx(blocked) {
  const saved = [];
  const it = JSON.parse(JSON.stringify(SAMPLE));
  const ctx = {
    Array, Object, String, parseInt, console, JSON,
    viewerId: 'p1', gridItems: [it], gridYear: '2026',
    blockedIfOther: function () { return !!blocked; },
    photoOwner: function (id) { return 'owner-of-' + id; },
    renderReadPanel: function () {},
    confirm: function () { return true; },
    alert: function () {},
    PuPhotoStore: { saveRead: function (y, id, read, owner) {
      saved.push({ id: id, read: read, owner: owner });
      return { catch: function () {} };
    } }
  };
  vm.createContext(ctx);
  ['tsRows', 'tsParseDays', 'tsSave', 'tsCell', 'tsAddRow', 'tsDelRow'].forEach(function (n) {
    vm.runInContext(fnOf(app, n), ctx);
  });
  return { ctx: ctx, it: it, saved: saved };
}

test('★ 칸을 고치면 그 사진 주인 자리에 저장된다', () => {
  const c = cellCtx(false);
  c.ctx.tsCell(0, 'paid', '1. 5. 25. 27');
  assert.equal(c.saved.length, 1, '화면만 바뀌고 저장이 안 되면 새로고침에 되돌아갑니다');
  assert.deepEqual(JSON.parse(JSON.stringify(c.saved[0].read.fields.rows[0].paid)), [1, 5, 25, 27],
    '적은 글이 날짜 배열로 바뀌어 담겨야 엑셀 개수가 맞습니다');
  assert.equal(c.saved[0].owner, 'owner-of-p1', '주인 자리가 아니면 엉뚱한 곳에 써집니다');
});

test('★ 사람이 고친 줄은 「판독 불확실」 표시가 걷힌다', () => {
  const c = cellCtx(false);
  c.ctx.tsCell(1, 'off', '6, 7, 13, 22, 27');
  assert.equal(c.saved[0].read.fields.rows[1].note, '',
    '확인이 끝난 줄이 계속 노랗게 떠 있으면 표시를 못 믿게 됩니다');
});

test('★ 남의 사진은 고칠 수 없다', () => {
  const c = cellCtx(true);
  c.ctx.tsCell(0, 'name', '다른이름');
  c.ctx.tsAddRow();
  c.ctx.tsDelRow(0);
  assert.equal(c.saved.length, 0);
  assert.equal(c.it.meta.read.fields.rows[0].name, '배영승');
});

test('줄 더하기·지우기 — 고친 결과 위에 이어서 손댄다', () => {
  const c = cellCtx(false);
  c.ctx.tsAddRow();
  assert.equal(c.saved[0].read.fields.rows.length, 4, '판독이 놓친 사람을 더할 수 있어야 합니다');
  c.ctx.tsDelRow(0);
  /* 방금 더한 결과(4줄) 위에서 지운다 — 3줄. 옛 판(3줄)에서 지워 2줄이 되면
     연달아 손댈 때마다 앞 수정이 날아간다는 뜻이다. */
  assert.equal(c.saved[1].read.fields.rows.length, 3, '앞서 고친 것이 날아갔습니다');
  assert.equal(c.saved[1].read.fields.rows[0].name, '이옥자', '지운 줄이 아니라 다음 줄이 와야 합니다');
});

/* ── 엑셀 ── */
test('★ CSV 는 한글이 안 깨지고(BOM), 쉼표 든 칸도 안 무너진다', () => {
  const dl = fnOf(app, 'tsDownload');
  assert.match(dl, /﻿/, 'BOM 이 없으면 엑셀에서 한글이 깨집니다 — 열자마자 못 쓰는 파일');
  const ctx = { String };
  vm.createContext(ctx);
  vm.runInContext(fnOf(app, 'csvEsc'), ctx);
  assert.equal(ctx.csvEsc('1, 5, 25'), '"1, 5, 25"', '쉼표 든 칸을 안 감싸면 열이 밀립니다');
  assert.equal(ctx.csvEsc('그냥글'), '그냥글');
  assert.equal(ctx.csvEsc('말"표'), '"말""표"');
});

test('★ 표에 개수 열이 함께 나간다', () => {
  const ctx = { Array, Object, String, parseInt };
  vm.createContext(ctx);
  vm.runInContext(fnOf(app, 'tsRows'), ctx);
  vm.runInContext(fnOf(app, 'tsDays'), ctx);
  vm.runInContext(fnOf(app, 'tsTable'), ctx);
  const t = ctx.tsTable(JSON.parse(JSON.stringify(SAMPLE)));
  assert.deepEqual(JSON.parse(JSON.stringify(t.head)),
    ['이름', '유급 날짜', '유급 일수', '휴무 날짜', '휴무 일수', '가감', '비고']);
  const row = JSON.parse(JSON.stringify(t.body[0]));
  assert.equal(row[0], '배영승');
  assert.equal(row[2], 3, '유급 일수가 세어져 나가야 엑셀에서 다시 안 셉니다');
  assert.equal(row[4], 3, '휴무 일수도');
  assert.match(JSON.parse(JSON.stringify(t.title)).join(''), /애플미르/, '어느 사업장 몇 월인지 파일에 적혀야 합니다');
});

test('★ 근태표 사람 이름이 찾기에 걸린다', () => {
  assert.match(fnOf(app, 'hayOf'), /Array\.isArray\(f\.rows\)/,
    '「배영승」으로 치면 그분이 적힌 달이 나와야 합니다');
});
