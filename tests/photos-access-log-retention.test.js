'use strict';
/* 열람 기록 · 서류마다 다른 보유기한 (대표 지시 2026-09-01 · 검토안 Ⅱ-4, Ⅱ 보유기한)

   ■ ① 열람 기록 — 「누가 언제 그 사람 서류를 열었나」
   근로자 신분증을 담기 시작하면 이 물음에 답할 수 있어야 한다. 급여데이터함에는
   이미 있는데(paydata/access_log) 사진첩에는 없었다.
   ★ **서버 함수(photoView)에서 적는다.** 민감 서류 원본은 반드시 그 문을 지난다 —
     화면에는 주소가 안 적혀 있다. 화면에서 적으면 화면을 안 거치고 부르는 길로
     빠져나갈 수 있다. 기록은 «지나갈 수밖에 없는 자리»에 둔다.
   ⚠ 사유는 안 묻는다 — 급여데이터함은 「남의 자리를 들여다볼 때」라 사유를 받지만,
     여기는 볼 자격이 있는 사람이 제 일을 하는 것이다. 한 장 열 때마다 사유를 받으면
     사람이 앱을 피해 카톡으로 간다. 그게 더 나쁘다.
   ⚠ 기록이 실패해도 사진은 내준다. 기록 때문에 일이 막히면 안 된다.

   ■ ② 보유기한 — 신분증은 «가장 짧게», 동의서는 «가장 길게»
   거꾸로처럼 보이지만 이것이 맞다:
     · 신분증·등본은 확인용이다. 신고가 끝나면 들고 있을 까닭이 없고,
       들고 있으면 지키는 것이 아니라 짐이다. 새면 가장 크게 다친다.
     · 동의서는 근거다. 이것이 없으면 **나머지를 처리한 근거 자체가 사라진다.**

   실행: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');
const store = fs.readFileSync(path.join(R, 'js', 'pu-photo-store.js'), 'utf8');
const pv = fs.readFileSync(path.join(R, 'functions', 'photo-view.js'), 'utf8');
const idx = fs.readFileSync(path.join(R, 'functions', 'index.js'), 'utf8');

function fnOf(src, name) {
  const at = src.search(new RegExp('(async\\s+)?function ' + name + '\\s*\\('));
  assert.ok(at >= 0, '★ ' + name + ' 을 찾지 못했습니다');
  let i = src.indexOf('{', at), d = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') d++;
    else if (src[i] === '}') { d--; if (!d) return src.slice(at, i + 1); }
  }
  throw new Error('짝을 못 맞춤: ' + name);
}

/* ── ① 열람 기록 ── */

test('★★ 기록을 «서버 함수»에서 적는다 — 화면에서 적으면 빠져나갈 수 있다', () => {
  assert.match(idx, /function photoNoteView\(/,
    '★★ 열람 기록을 적는 자리가 없습니다');
  assert.match(idx, /photoNoteView\(decoded, v, gate\)/,
    '★★ 만들어 놓고 안 부릅니다');
  /* 화면 쪽에서 적으면 안 된다 — 그 길은 건너뛸 수 있다 */
  assert.ok(!/access_log/.test(app),
    '★★ 화면이 열람 기록을 적습니다 — 화면을 안 거치는 길로 빠져나갑니다');
});

test('★★ 원본을 «내준 뒤에» 적는다 — 실패한 것까지 「봤다」로 남으면 안 된다', () => {
  const h = idx.slice(idx.indexOf('exports.photoView'), idx.indexOf('exports.photoView') + 3000);
  const sent = h.indexOf('res.json({ ok: true, dataUrl');
  const noted = h.indexOf('photoNoteView(');
  assert.ok(sent > 0 && noted > sent,
    '★★ 내주기 «전»에 적습니다 — 창고에 원본이 없어 실패한 것도 「봤다」로 남습니다');
});

test('★★ 기록이 실패해도 «사진은 나간다» — 기록 때문에 일이 막히면 안 된다', () => {
  const fn = fnOf(idx, 'photoNoteView');
  assert.match(fn, /try \{/, '★★ 기록 실패가 요청을 통째로 깨뜨립니다');
  assert.match(fn, /catch \(e\) \{[\s\S]*console\.error/,
    '★ 조용히 삼키면 기록이 안 되는 줄도 모릅니다 — 서버 기록에는 남겨야 합니다');
  assert.ok(!/throw/.test(fn), '★★ 기록 실패로 throw 하면 사진이 안 나갑니다');
});

test('★★ 무엇을 적나 — 「누가·언제·무슨 자격으로·누구의 무슨 서류」', () => {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(fnOf(pv, 'logRow').replace(/^function /, 'var logRow = function ') + ';', ctx);
  const row = ctx.logRow({
    byUid: 'u1', byName: '권형하', as: 'admin',
    owner: 'u2', year: '2026', id: 'p9', kind: 'idcard', who: '김철수'
  });
  ['at', 'byUid', 'byName', 'as', 'owner', 'year', 'id', 'kind', 'who'].forEach(function (k) {
    assert.ok(row[k] !== undefined, '★★ 「' + k + '」를 안 적습니다');
  });
  assert.equal(row.as, 'admin', '★★ «무슨 자격으로» 봤는지가 없으면 관리자 열람을 못 가립니다');
  assert.equal(row.kind, 'idcard', '★★ 어떤 서류였는지가 없으면 신분증 열람을 못 가립니다');
  assert.equal(row.who, '김철수', '★★ 누구의 서류인지가 없으면 「그 사람 것을 봤나」에 못 답합니다');
  assert.ok(row.at > 0, '★ 언제인지를 안 적습니다');
});

test('★★ 기록에 «주민번호가 들어갈 자리»가 없다 — 기록이 새 유출원이 되면 안 된다', () => {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(fnOf(pv, 'logRow').replace(/^function /, 'var logRow = function ') + ';', ctx);
  /* 시늉으로 아무거나 다 넣어 봐도 정해 둔 칸만 나와야 한다 */
  const row = ctx.logRow({ byUid: 'u1', rrn: '900101-1234567', address: '어디', memo: '무엇' });
  ['rrn', 'address', 'memo'].forEach(function (k) {
    assert.equal(row[k], undefined, '★★ 「' + k + '」가 기록에 담깁니다 — 기록이 새 유출원이 됩니다');
  });
  /* 이름은 길어도 잘린다 — 기록 칸이 딴 창고가 되지 않게 */
  const long = ctx.logRow({ byName: 'ㄱ'.repeat(200), who: 'ㄴ'.repeat(200) });
  assert.ok(long.byName.length <= 40 && long.who.length <= 40, '★ 이름 길이를 안 막습니다');
});

test('★★ 규칙이 기록을 «총괄관리자만» 읽게 하고, «아무도 못 쓰게» 막는다', () => {
  /* ⚠ 「콘솔과 다른 곳이 어디인가」만 보는 검사로는 이것을 못 잡는다 —
     읽기를 전 직원에게 열어도 «다른 곳»의 목록은 그대로다(돌연변이에서 살아남았다).
     규칙이 **무엇이라 적혀 있는지**를 본다. */
  const rules = JSON.parse(
    fs.readFileSync(path.join(R, 'docs', 'rules-paste.json'), 'utf8')).rules;
  const a = rules.puphotos && rules.puphotos.access_log;
  assert.ok(a, '★★ 열람 기록 규칙이 없습니다 — 이름 없는 자리로 떨어져 전 직원이 읽습니다');
  assert.match(String(a['.read']), /isAdmin/,
    '★★ 열람 기록을 전 직원이 읽습니다 — 「누가 누구 서류를 봤나」는 그 자체로 민감합니다');
  assert.equal(a['.write'], false,
    '★★ 화면에서 기록을 쓸 수 있습니다 — **꾸며 낼 수 있는 기록은 기록이 아닙니다.**\n' +
    '  적는 것은 서버 함수 하나뿐이고, 그것은 Admin SDK 라 규칙을 안 지납니다.');
});

test('★ 자격(as)과 사진 정보를 «문지기가 함께» 돌려준다 — 두 번 읽지 않게', () => {
  const fn = fnOf(idx, 'photoGate');
  assert.match(fn, /return \{ ok: true, as: seen\.as, item: item \}/,
    '★ 자격·사진 정보를 버리면 기록을 적으려고 다시 읽어야 합니다');
});

/* ── ② 서류마다 다른 보유기한 ── */

function keeper(over) {
  const ctx = Object.assign({ Date: Date, Number: Number, String: String, isFinite: isFinite,
    Infinity: Infinity }, over || {});
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(app.match(/const KEEP_MONTHS_BY_KIND = \{[\s\S]*?\};/)[0].replace(/^const /, 'var ') +
    '\nvar KEEP_USED_YEARS = ' + (app.match(/KEEP_USED_YEARS = (\d+)/) || [, 5])[1] +
    ';\nvar KEEP_PLAIN_YEARS = ' + (app.match(/KEEP_PLAIN_YEARS = (\d+)/) || [, 1])[1] + ';' +
    '\nvar keepMonthsOverride = ' + JSON.stringify((over && over._ov) || {}) + ';', ctx);
  ['keepMonthsOf', 'isUsed', 'keepUntil'].forEach(function (n) {
    vm.runInContext(fnOf(app, n), ctx);
  });
  return ctx;
}
const yrAgo = n => Date.now() - n * 365 * 86400000;
const moAgo = n => Date.now() - n * 31 * 86400000;

test('★★ 신분증·등본이 «가장 짧다» — 확인용이지 증빙이 아니다', () => {
  const c = keeper();
  assert.equal(c.keepMonthsOf('idcard'), 3, '★★ 신분증이 3개월이 아닙니다');
  assert.equal(c.keepMonthsOf('resident'), 3);
  /* 넉 달 전에 찍은 신분증은 이미 지났다 */
  assert.ok(c.keepUntil({ takenAt: moAgo(4), read: { kind: 'idcard' } }) <= Date.now(),
    '★★ 넉 달 지난 신분증이 아직 「보관 중」입니다');
  /* 한 달 전 것은 아직 아니다 */
  assert.ok(c.keepUntil({ takenAt: moAgo(1), read: { kind: 'idcard' } }) > Date.now(),
    '★ 한 달밖에 안 된 신분증을 벌써 「지난 것」이라 합니다');
});

test('★★ 개인정보 동의서가 «가장 길다» — 없으면 나머지를 처리한 근거가 사라진다', () => {
  const c = keeper();
  const m = ['idcard', 'resident', 'mandate', 'contract', 'cms', 'consent']
    .map(function (k) { return [k, c.keepMonthsOf(k)]; });
  const max = m.reduce(function (a, b) { return b[1] > a[1] ? b : a; });
  assert.equal(max[0], 'consent',
    '★★ 가장 오래 두는 것이 동의서가 아닙니다: ' + JSON.stringify(m));
  const min = m.reduce(function (a, b) { return b[1] < a[1] ? b : a; });
  assert.ok(min[0] === 'idcard' || min[0] === 'resident',
    '★★ 가장 짧게 두는 것이 신분증·등본이 아닙니다: ' + JSON.stringify(m));
});

test('★★ 종류가 정한 기한이 «증빙 표시보다 먼저»다 — 안 그러면 신분증을 5년 든다', () => {
  const c = keeper();
  /* 신분증을 어딘가에 증빙으로 썼다고 5년을 두면, 가장 위험한 자료를
     가장 오래 들고 있는 것이 된다 — 그 반대로 가려는 것이다. */
  const used = { takenAt: moAgo(5), read: { kind: 'idcard' }, used: { at: Date.now(), where: '어딘가' } };
  assert.ok(c.keepUntil(used) <= Date.now(),
    '★★ 증빙으로 썼다고 신분증을 5년 들고 있습니다');
});

test('★ 종류가 안 정한 것은 «예전 그대로» — 증빙 5년 / 나머지 1년', () => {
  const c = keeper();
  assert.equal(c.keepMonthsOf('meeting'), null, '★ 회의사진에까지 기한을 매겼습니다');
  const plain = { takenAt: yrAgo(2), read: { kind: 'meeting' } };
  assert.ok(c.keepUntil(plain) <= Date.now(), '★ 2년 지난 회의사진이 안 지났다고 합니다');
  const proof = { takenAt: yrAgo(2), read: { kind: 'meeting' }, used: { at: Date.now() } };
  assert.ok(c.keepUntil(proof) > Date.now(), '★★ 증빙으로 쓴 사진의 5년이 사라졌습니다');
});

test('★ 급여서류는 «지금 즉시» — 받지 않기로 한 서류다', () => {
  const c = keeper();
  assert.equal(c.keepUntil({ takenAt: Date.now(), read: { kind: 'payslip' } }), 0);
});

test('★ 언제 것인지 «모르면» 안 센다 — 모른다고 지울 것으로 몰면 안 된다', () => {
  const c = keeper();
  assert.equal(c.keepUntil({ read: { kind: 'idcard' } }), Infinity,
    '★★ 찍은 날을 모르는 사진을 「지난 것」으로 몹니다');
});

test('★★ 설정에서 고친 값이 «이긴다» — 법이 바뀌면 화면에서 바꾼다', () => {
  const c = keeper({ _ov: { idcard: 1 } });
  assert.equal(c.keepMonthsOf('idcard'), 1, '★★ 고친 값을 안 씁니다');
  assert.equal(c.keepMonthsOf('consent'), 120, '★ 안 고친 것까지 바뀌었습니다');
  /* 말 안 되는 값은 처음 값으로 물러선다 */
  const bad = keeper({ _ov: { idcard: -5 } });
  assert.equal(bad.keepMonthsOf('idcard'), 3, '★★ 음수를 그대로 씁니다');
  const bad2 = keeper({ _ov: { idcard: 'ㄱ' } });
  assert.equal(bad2.keepMonthsOf('idcard'), 3, '★★ 글자를 그대로 씁니다');
});

/* ── ③ 저장 층 ── */

test('★★ 담당자를 바꿔도 «보유기한이 안 날아간다» — set 이 아니라 update 다', () => {
  /* ⚠ 같은 자리(retention)에 담당자와 보유기한이 함께 있다. set 으로 통째로 덮으면
     담당자를 바꿨을 뿐인데 신분증 3개월이 조용히 사라진다. */
  const fn = fnOf(store, 'setRetentionOwner');
  assert.match(fn, /\.update\(\{/,
    '★★ set 으로 덮습니다 — 담당자를 바꾸면 서류별 보유기한이 함께 날아갑니다');
  assert.ok(!/\.set\(\{/.test(fn), '★★ 아직 set 이 남아 있습니다');
  /* 앞사람 점검 기록을 비우는 뜻은 그대로여야 한다 */
  assert.match(fn, /lastAt: 0/, '★ 앞사람의 점검 기록을 안 비웁니다');
});

test('★★ 말 안 되는 보유기한은 «담기 전에» 막는다', () => {
  const ctx = { Object: Object, Number: Number, Math: Math, isFinite: isFinite,
    Promise: Promise, Error: Error };
  const wrote = {};
  ctx.deps = { db: { ref: function (p) { return { set: function (v) { wrote[p] = v; return Promise.resolve(); } }; } } };
  ctx.retentionPath = function () { return 'puphotos/retention'; };
  vm.createContext(ctx);
  vm.runInContext(fnOf(store, 'setKeepMonths'), ctx);
  return ctx.setKeepMonths({ idcard: 3, resident: -1, consent: 'ㄱ', mandate: 99999, 'bad key': 5 })
    .then(function () {
      /* ⚠ vm 안에서 만든 객체는 «다른 실체(realm)»의 Object 를 부모로 갖는다 —
         값이 똑같아도 deepEqual 이 실패한다(실제로 그랬다). JSON 을 한 번 거쳐
         이쪽 실체의 맨 객체로 바꿔 견준다. */
      const v = JSON.parse(JSON.stringify(wrote['puphotos/retention/months']));
      assert.deepEqual(v, { idcard: 3 },
        '★★ 말 안 되는 값이 담겼습니다: ' + JSON.stringify(v) + '\n' +
        '  0 이 들어가면 그 종류 사진이 통째로 「지난 것」이 되고, 지우면 되돌릴 수 없습니다.');
    });
});

test('★ 고치는 칸이 화면에 «있다» — 코드를 고치러 오지 않아도 되게', () => {
  assert.match(app, /id="keepRows"/, '★ 보유기한을 고치는 칸이 없습니다');
  assert.match(app, /function saveKeepMonths\(/, '★ 저장하는 길이 없습니다');
  assert.match(app, /PuPhotoStore\.setKeepMonths\(/, '★ 저장 층에 안 시킵니다');
  /* 값을 다시 읽어 칸에 채워야 한다 */
  assert.match(app, /renderKeepRows\(\)/, '★ 고친 값을 칸에 안 보여 줍니다');
  /* 기한이 바뀌면 「지난 사진」 수도 바뀐다 */
  assert.match(fnOf(app, 'saveKeepMonths'), /renderOldBox\(\)/,
    '★ 기한을 바꿨는데 「지난 사진」 수가 그대로입니다');
});
