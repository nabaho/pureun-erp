'use strict';
/* 👷 근로자 정보함 화면 — 집단 진정은 «한 줄로 접힌다» (대표 결정 2026-09-01, 검토안 ㉯)
   ═══════════════════════════════════════════════════════════════════════════
   ■ 무엇을 못 박나
     ① 사람 열쇠 규칙이 사진첩 쪽(js/pu-doc-file.js)과 **한 글자도 같다**
        — 어긋나면 이은 서류가 «딴 사람»에게 붙거나 아무에게도 안 붙는다.
     ② 한 사건에 2명 이상이면 **한 줄로 접힌다**. 1명은 안 접는다(「집단 1명」은 말이 안 된다).
     ③ 펼치면 **대표 신청인이 맨 위**, 사람마다 **수금 상태**가 따로 보인다.
        집단 건에서 가장 자주 묻는 것이 「누가 아직 안 냈나」다.
     ④ 접든 펼치든 **같은 사람이 두 번 안 나온다**.
     ⑤ ⚠⚠ 주민번호는 **가려서** 보이고 눌러야 나온다. 그리고 이 화면은 그것을
        **저장하지 않는다** — 볼 때 이알피 사건에서 읽어 온다.
     ⑥ 옆줄 갈래 셈과 목록이 **같은 곳에서** 나온다(따로 세면 두 숫자가 어긋난다).
     ⑦ 표 한 칸은 한 줄이다 — 자리가 넓어도 두 줄로 만들지 않는다.

   실행: node --test tests/cards-worker-page.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(R, 'pu-cards.html'), 'utf8');
const FILE_SRC = fs.readFileSync(path.join(R, 'js', 'pu-doc-file.js'), 'utf8');

function cut(name) {
  const i = SRC.indexOf('function ' + name + '(');
  assert.ok(i > 0, name + ' 을 찾지 못했습니다');
  const j = SRC.indexOf('\r\n}', i);
  assert.ok(j > i, name + ' 의 끝을 찾지 못했습니다');
  return SRC.slice(i, j + 3);
}
function grab(re, what) {
  const m = SRC.match(re);
  assert.ok(m, what + ' 를 찾지 못했습니다');
  return m[0];
}

function load(over) {
  const ctx = {
    console, Object, Array, String, Number, Boolean, Math, Date, JSON, RegExp,
    state: { view: 'wk', wkQ: '', wkFolder: '', wkPick: '' },
    document: { body: { classList: { contains: () => true } }, getElementById: () => null },
    esc: v => String(v == null ? '' : v),
    digits: v => String(v || '').replace(/\D/g, ''),
    fmtBizno: v => String(v || ''),
    fmtDate: ts => String(ts || ''),
    /* ⚠ 화면에서 «그대로» 가져온다 — 여기 베껴 적으면 화면이 바뀔 때 검사만 옛 규칙을 본다 */
    _norm: null,
    _erpHistTypes: {},
    erpHistVisible: () => true,
    erpHistName: r => String((r && r.typeName) || ''),
    erpHistStat: r => String((r && r.status) || 'run'),
    erpHistYear: r => Number((r && r.year) || 0),
    erpHistMd: v => String(v || '')
  };
  Object.assign(ctx, over || {});
  vm.createContext(ctx);
  vm.runInContext([
    grab(/^const _norm = [^\n]*;$/m, '_norm'),
    'var _wkInfo = {}, _wkInfoOn = false, _wkListMemo = null, _wkOpen = {}, _wkRrnOpen = {};',
    grab(/const WK_DOC_LABEL = \{[\s\S]*?\};/, 'WK_DOC_LABEL'),
    grab(/const WK_DOC_ICON = \{[\s\S]*?\};/, 'WK_DOC_ICON'),
    grab(/const WK_FOLDERS = \[[\s\S]*?\n\];/, 'WK_FOLDERS'),
    cut('wkSafe'), cut('wkKeyOf'), cut('wkCaseWorkers'), cut('wkCaseRow'),
    cut('wkAllCases'), cut('wkListBuild'), cut('wkFoldRows'),
    cut('wkFolderPick'), cut('wkCount'), cut('wkMatch'), cut('wkVisible'),
    cut('wkMaskRrn'), cut('wkRrnShown'), cut('wkRrnCellHtml'),
    cut('wkDocsSummary'), cut('wkCasesSummary'), cut('wkStatChip'),
    cut('wkRowHtml'), cut('wkListHtml'), cut('wkDetailHtml')
  ].join('\n'), ctx);
  return ctx;
}

/* 사건 하나 — 이알피에 저장되는 꼴 그대로(workers 가 맨 위에 있다) */
function caseRec(o) {
  return Object.assign({ id: 'C1', typeName: '임금체불 진정', status: 'run', year: 2026,
    companyName: '해찬솔에프쓰리', bizNo: '312-81-49225', _kind: 'case', workers: [] }, o);
}
function erp(recs) { return { byBiz: { '3128149225': recs }, byName: {} }; }
const W = (name, x) => Object.assign({ name: name }, x || {});

/* ══════════ ① 열쇠 규칙이 사진첩 쪽과 같다 ══════════ */

test('★★★ 사람 열쇠 규칙이 사진첩 쪽(js/pu-doc-file.js)과 «한 글자도» 같다', () => {
  const c = load();
  const fctx = { console, Promise, Object, Array, String, Number, Date };
  fctx.window = fctx; fctx.globalThis = fctx; fctx.self = fctx;
  vm.createContext(fctx);
  vm.runInContext(FILE_SRC, fctx);
  const NAMES = ['홍길동', '김 수', '이.권우'];
  /* ⚠ 유한회사·농업회사법인 표기를 «반드시» 넣는다 — 업체 찾기(coNameKey)는 그것을
     걷어내고 사람 열쇠는 안 걷어낸다. 이 표본이 없으면 두 쪽이 어긋나도 안 걸린다
     (2026-09-02 되돌림 검사에서 실제로 안 걸렸다). */
  const COS = ['(주)가나', '가나', '가나㈜', '주식회사 가나', '  가나  ', '한서정공',
    '(유)대성', '유한회사 대성', '유한책임회사 대성', '농업회사법인 한들', '㈲대성',
    '(주) 대명크라샤', '에스오에스종합관리', 'ABC Corp', '가나.다'];
  NAMES.forEach(function (n) {
    COS.forEach(function (co) {
      assert.equal(c.wkKeyOf(n, co), fctx.PuDocFile.workerKey(n, co),
        '★★★ 「' + n + ' / ' + co + '」 의 열쇠가 두 쪽에서 다릅니다.\n' +
        '  사진첩이 이은 서류가 근로자 정보함에서 딴 사람에게 붙거나 아무에게도 안 붙습니다.');
    });
  });
});

test('★ 회사나 이름이 비면 열쇠를 안 만든다 — 빈 것끼리 묶이면 남남이 한 사람이 된다', () => {
  const c = load();
  assert.equal(c.wkKeyOf('홍길동', ''), '');
  assert.equal(c.wkKeyOf('', '가나'), '');
});

/* ══════════ ② 조립 — 사건과 사진첩을 «사람»으로 모은다 ══════════ */

test('★ 사건의 근로자와 사진첩 서류가 «같은 사람»으로 합쳐진다', () => {
  const c = load();
  const key = c.wkKeyOf('강석', '해찬솔에프쓰리');
  const list = c.wkListBuild(erp([caseRec({ workers: [W('강석', { phone: '010-1' })] })]),
    (function () { const o = {}; o[key] = { name: '강석', company: '해찬솔에프쓰리',
      docs: { d1: { kind: 'timesheet', at: 100 } } }; return o; })());
  assert.equal(list.length, 1, '한 사람이어야 합니다: ' + JSON.stringify(list.map(x => x.key)));
  assert.equal(list[0].cases.length, 1, '사건이 안 붙었습니다');
  assert.equal(list[0].docs.length, 1, '서류가 안 붙었습니다');
  assert.equal(list[0].phone, '010-1', '사람 정보가 사건에서 와야 합니다');
});

test('★★ 회사가 다르면 같은 이름이라도 «다른 사람»이다', () => {
  const c = load();
  const list = c.wkListBuild({ byBiz: {}, byName: {
    a: [caseRec({ id: 'C1', companyName: '가나', bizNo: '', workers: [W('김수')] })],
    b: [caseRec({ id: 'C2', companyName: '다라', bizNo: '', workers: [W('김수')] })]
  } }, {});
  assert.equal(list.length, 2, '★★ 회사가 다른 같은 이름이 한 사람이 됐습니다');
});

test('★★ 회사를 못 읽은 사건의 근로자는 «그 사건 안에서만» 한 사람이다', () => {
  const c = load();
  const list = c.wkListBuild({ byBiz: {}, byName: {
    a: [caseRec({ id: 'C1', companyName: '', bizNo: '', workers: [W('김수')] })],
    b: [caseRec({ id: 'C2', companyName: '', bizNo: '', workers: [W('김수')] })]
  } }, {});
  assert.equal(list.length, 2,
    '★★ 회사 없는 사건 둘의 「김수」가 한 사람으로 묶였습니다 — 남남일 수 있습니다');
});

test('★★★ 주민번호는 «사건에서만» 온다 — 사진첩 쪽에서는 한 글자도 안 온다', () => {
  const c = load();
  const key = c.wkKeyOf('강석', '가나');
  const info = {}; info[key] = { name: '강석', company: '가나',
    rrn: '900101-1234567', address: '충남 …',          /* 있어서는 안 되는 값 */
    docs: { d1: { kind: 'idcard', at: 1, rrn: '900101-1234567' } } };
  const list = c.wkListBuild({ byBiz: {}, byName: {} }, info);
  assert.equal(list.length, 1);
  assert.equal(list[0].rrn, '',
    '★★★ 사진첩 자리에 있던 주민번호를 그대로 읽었습니다 — 그 자리에는 담기지 않습니다');
  assert.equal(list[0].address, '', '★★★ 주소를 사진첩 자리에서 읽었습니다');
  const flat = JSON.stringify(list[0].docs);
  assert.ok(flat.indexOf('900101') < 0, '★★★ 서류 줄에 주민번호가 남았습니다: ' + flat);
});

test('이름이 없는 것은 사람으로 세지 않는다 — 빈 껍데기가 목록에 쌓이면 안 된다', () => {
  const c = load();
  const list = c.wkListBuild(erp([caseRec({ workers: [W(''), W('  ')] })]), { x: { company: '가나' } });
  assert.equal(list.length, 0);
});

/* ══════════ ③ 집단 진정 접기 ══════════ */

function group(n) {
  const ws = [];
  for (let i = 0; i < n; i++) ws.push(W('사람' + i, { isPrimary: i === 2, paidConfirmed: i < 2 }));
  return caseRec({ workers: ws });
}

test('★★ 한 사건에 2명 이상이면 «한 줄로 접힌다»', () => {
  const c = load();
  const rows = c.wkFoldRows(c.wkListBuild(erp([group(5)]), {}));
  assert.equal(rows.length, 1, '★★ 다섯 명이 ' + rows.length + '줄입니다 — 한 줄이어야 합니다');
  assert.equal(rows[0].type, 'group');
  assert.equal(rows[0].members.length, 5);
});

test('★ 한 명뿐인 사건은 «안 접는다» — 「집단 1명」은 말이 안 된다', () => {
  const c = load();
  const rows = c.wkFoldRows(c.wkListBuild(erp([group(1)]), {}));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].type, 'one', '혼자인데 집단으로 접혔습니다');
});

test('★★ 사건에 둘이 적혀 있어도 «한 사람»이면 안 접는다 — 「집단 1명」은 말이 안 된다', () => {
  /* 이름·회사가 같은 두 줄은 한 사람으로 합쳐진다(대표 결정 「이름 + 회사」).
     그러면 사건은 2명이라 하는데 실제 사람은 하나다 — 그때 접으면 「집단 1명」이 된다. */
  const c = load();
  const rows = c.wkFoldRows(c.wkListBuild(erp([caseRec({ workers: [W('김수'), W('김수')] })]), {}));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].type, 'one',
    '★★ 사람이 하나인데 집단으로 접혔습니다 — 「집단 1명」이 보입니다');
});

test('★★ 펼친 줄에서 «대표 신청인»이 맨 위다', () => {
  const c = load();
  const rows = c.wkFoldRows(c.wkListBuild(erp([group(5)]), {}));
  assert.equal(rows[0].members[0].name, '사람2',
    '★★ 대표 신청인이 맨 위가 아닙니다: ' + rows[0].members.map(m => m.name).join(','));
});

test('★★ 접든 펼치든 «같은 사람이 두 번» 안 나온다', () => {
  const c = load();
  const list = c.wkListBuild(erp([group(4),
    caseRec({ id: 'C2', typeName: '부당해고', workers: [W('사람0'), W('사람1')] })]), {});
  const rows = c.wkFoldRows(list);
  const seen = {};
  rows.forEach(function (r) {
    (r.type === 'group' ? r.members : [r.p]).forEach(function (p) {
      assert.ok(!seen[p.key], '★★ 「' + p.name + '」 이 두 번 나옵니다');
      seen[p.key] = true;
    });
  });
  assert.equal(Object.keys(seen).length, list.length, '접는 사이에 사람이 사라졌습니다');
});

test('★ 사람마다 수금 상태가 «따로»다 — 집단 건에서 가장 자주 묻는 것이다', () => {
  const c = load();
  const rows = c.wkFoldRows(c.wkListBuild(erp([group(5)]), {}));
  const paid = rows[0].members.filter(m => m.paid.C1).length;
  assert.equal(paid, 2, '수금 확정이 2명이어야 합니다: ' + paid);
});

/* ══════════ ④ 표 — 칸마다 제 뜻, 한 칸은 한 줄 ══════════ */

test('★★ 접힌 줄의 «수금»이 「가진 것」 칸에 들어가지 않는다 (2026-09-02 실측에서 걸렸다)', () => {
  const c = load();
  const rows = c.wkFoldRows(c.wkListBuild(erp([group(5)]), {}));
  const html = c.wkRowHtml(rows[0], 1);
  const tds = html.replace(/\s+/g, ' ').match(/<td[^>]*>[\s\S]*?<\/td>/g) || [];
  assert.ok(tds.length >= 6, '칸이 ' + tds.length + '개입니다');
  assert.ok(tds[3].indexOf('수금') >= 0, '★★ 「걸린 사건」 칸에 수금 셈이 없습니다: ' + tds[3]);
  assert.ok(tds[4].indexOf('수금') < 0,
    '★★ 「가진 것」 칸에 수금이 들어갔습니다 — 칸마다 제 뜻이 있습니다: ' + tds[4]);
});

test('★ 표 한 칸은 «한 줄»이다 — 넘치면 …로 자른다', () => {
  const css = SRC.slice(SRC.indexOf('.wktbl td{'));
  assert.match(css.slice(0, 200), /white-space:nowrap/, '★ 칸이 두 줄로 접힙니다');
  assert.match(css.slice(0, 200), /text-overflow:ellipsis/, '★ 넘친 글자를 …로 안 자릅니다');
});

test('빈 값(0·없음)은 그리지 않는다 — 없는 것이 쌓이면 있는 것이 안 보인다', () => {
  const c = load();
  const p = c.wkListBuild(erp([caseRec({ workers: [W('강석')] })]), {})[0];
  const s = c.wkDocsSummary(p);
  assert.ok(s.indexOf('0') < 0, '0 을 그렸습니다: ' + s);
});

/* ══════════ ⑤ ⚠⚠ 주민번호는 가려서, 눌러야 나온다 ══════════ */

test('★★★ 주민번호는 «가려서» 보인다', () => {
  const c = load();
  const m = c.wkMaskRrn('900101-1234567');
  assert.ok(m.indexOf('900101') < 0, '★★★ 앞자리가 그대로 보입니다: ' + m);
  assert.ok(m.indexOf('1234567') < 0, '★★★ 뒷자리가 그대로 보입니다: ' + m);
});

test('★★★ 눌러야 나온다 — 처음에는 가려져 있다', () => {
  const c = load();
  const p = { key: 'k', rrn: '900101-1234567' };
  const shut = c.wkRrnCellHtml(p);
  assert.ok(shut.indexOf('900101') < 0, '★★★ 누르지도 않았는데 번호가 보입니다: ' + shut);
  assert.match(shut, /wkRrnToggle/, '★ 볼 길이 아예 없습니다');
  c._wkRrnOpen.k = true;
  assert.ok(c.wkRrnCellHtml(p).indexOf('900101-1234567') >= 0, '누르고도 안 나옵니다');
});

test('★ 화면이 「저장하지 않는다」고 말한다 — 안 그러면 여기 주민번호가 쌓이는 줄 안다', () => {
  const c = load();
  const p = c.wkListBuild(erp([caseRec({ workers: [W('강석', { rrn: '900101-1234567' })] })]), {})[0];
  assert.match(c.wkDetailHtml(p), /저장하지 않습니다/);
});

test('★ 화면을 나서면 드러낸 번호가 다시 가려진다', () => {
  assert.match(cut('enterWkView'), /_wkRrnOpen = \{\}/,
    '★ 열어 둔 번호가 다음 사람에게 그대로 보입니다');
});

/* ══════════ ⑥ 옆줄 — 셈이 목록과 같은 곳에서 나온다 ══════════ */

test('★ 옆줄 갈래 셈과 목록이 «같은 곳»에서 나온다', () => {
  const c = load();
  const list = c.wkListBuild(erp([group(3),
    caseRec({ id: 'C2', typeName: '부당해고', workers: [W('혼자')] })]), {});
  c.wkList = () => list;
  assert.equal(c.wkCount(''), list.length);
  assert.equal(c.wkCount('group'), 3, '집단에 걸린 사람 셈이 틀립니다');
  assert.equal(c.wkCount('case'), 4);
  assert.equal(c.wkCount('doc'), 0);
});

test('★ 옆줄이 wkCount 를 쓴다 — 따로 세면 두 숫자가 어긋난다', () => {
  const side = SRC.slice(SRC.indexOf("if(state.view==='wk'){"), SRC.indexOf("if(state.view==='co'){"));
  assert.match(side, /wkCount\(f\.id\)/, '★ 옆줄이 제 나름대로 셉니다');
  assert.match(side, /WK_FOLDERS\.forEach/, '★ 갈래 목록을 옆줄에 베껴 적었습니다');
});

test('★ 옆줄에 근로자 단추가 있고 그 화면으로 간다', () => {
  assert.match(SRC, /onclick="openWkPage\(\)"[^>]*>👷/, '★ 들어갈 길이 없습니다');
  assert.match(SRC, /openWkPage\(\)\{ enterWkView\(\)/, '★ 단추가 아무 데도 안 갑니다');
});

test('★ 그 화면에서 명함 목록 UI 를 숨긴다 — 두 화면이 겹치면 지금 어디인지 모른다', () => {
  const fn = cut('renderPC');
  assert.match(fn, /isWk/, '★ 근로자 정보함 화면을 renderPC 가 모릅니다');
  assert.match(fn, /isSet\|\|isMat\|\|isMail\|\|isCo\|\|isWk/, '★ 명함 목록이 함께 보입니다');
  assert.match(fn, /if\(isWk\)\{ renderWkPage\(\)/, '★ 그 화면을 그리지 않습니다');
});

/* ══════════ ⑦ 새 저장소를 만들지 않았다 ══════════ */

test('★★ 사람을 «새로 저장하지» 않는다 — 조립해서 보여 줄 뿐이다', () => {
  const build = cut('wkListBuild');
  assert.doesNotMatch(build, /\.update\(|\.set\(|\.push\(\)/,
    '★★ 목록을 조립하면서 서버에 씁니다 — 같은 사람이 두 곳에 생깁니다');
  /* 읽는 자리는 pucards/workerInfo 하나뿐이다 */
  const load2 = cut('loadWkInfo');
  assert.match(load2, /workerInfo/, '읽는 자리가 없습니다');
  assert.doesNotMatch(load2, /\.update\(|\.set\(/, '★ 읽기만 해야 하는 자리에서 씁니다');
});
