/* 업무관리 「내 업무」 — 열 접기 · 구분별 묶어 보기 · 상태 · 계획과 실적
   설계: docs/superpowers/specs/2026-08-07-업무관리-내업무화면-design.md */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const W = fs.readFileSync(process.argv[2] || path.join(ROOT, 'work.html'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
}
function grab(name) {
  const i = W.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('못 찾음: ' + name);
  let d = 0, st = false;
  for (let j = i; j < W.length; j++) {
    if (W[j] === '{') { d++; st = true; }
    else if (W[j] === '}') { d--; if (st && d === 0) return W.slice(i, j + 1); }
  }
  throw new Error('괄호 안 닫힘: ' + name);
}
const gvar = n => {
  const cand = [';$', '^\\];$', '^\\};$']
    .map(end => new RegExp('^var ' + n + '=[\\s\\S]*?' + end, 'm').exec(W))
    .filter(Boolean).map(m => m[0]).sort((a, b) => a.length - b.length);
  for (const s of cand) { try { new Function(s); return s; } catch (e) {} }
  throw new Error('못 읽음: ' + n);
};

let S = { me: { sid: 'u1', name: '김동현' } };
let STORE = {};                                  // localStorage 대역
const localStorage = {
  getItem(k) { return k in STORE ? STORE[k] : null; },
  setItem(k, v) { STORE[k] = String(v); }
};
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function escJ(s) { return esc(String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")); }
function route() {} function renderMy() {}
function fHas(sc, k) { return (S.F && S.F[sc] && S.F[sc][k]) instanceof Array; }
function catBadge(c) { return '<span class="cat">' + esc(c) + '</span>'; }
let PATCHED = null;
function patchItem(id, f) { PATCHED = { id: id, f: f }; return Promise.resolve(true); }

eval(gvar('STATUSES') + '\n' + gvar('COLS_KEY') + '\n' + gvar('MYCOLS') + '\n' + gvar('COLS_DEFAULT') + '\n'
  + gvar('GRP_KEY') + '\n' + gvar('GRP_ORDER') + '\n'
  + gvar('KIND_SET') + '\n' + gvar('KIND_ALIAS') + '\n'
  + ['catNorm', 'colPref', 'colHidden', 'colToggle', 'colChips', 'colTH', 'colTD',
     'grpOn', 'grpToggle', 'grpFold', 'grpFolded', 'grpFoldToggle', 'groupRows',
     'grpHeadHTML', 'stSelect', 'setStatus'].map(grab).join('\n'));

/* ── 접을 수 있는 열 ──
   묶어 보기는 꺼 두고 본다. 켜면 구분 열이 자동으로 접히는데, 그것은
   아래 「묶어 보기」 묶음에서 따로 확인한다. */
S.grpOn = false;
ok('접을 수 있는 열은 다섯 (기업·요일 칸·종료는 접지 않는다)',
  MYCOLS.map(c => c[0]).join() === 'cat,pt,st,last,due');
ok('처음에는 업무와 최근 기록이 접혀 있다',
  colHidden('pt') === true && colHidden('last') === true
  && colHidden('cat') === false && colHidden('st') === false && colHidden('due') === false);
ok('접을 수 없는 열은 언제나 펴져 있다',
  colHidden('co') === false && colHidden('') === false);

/* ── 켜고 끄기 ── */
STORE = {}; S.cols = undefined;
colToggle('last');
ok('접힌 열을 펴면 펴진다', colHidden('last') === false);
ok('편 것이 이 브라우저에 저장된다', STORE[COLS_KEY] === 'pt');
colToggle('st');
ok('펴진 열을 접으면 접힌다', colHidden('st') === true);
ok('접힌 목록이 함께 저장된다', STORE[COLS_KEY].split(',').sort().join() === 'pt,st');
colToggle('co');
ok('접을 수 없는 열은 눌러도 안 바뀐다',
  colHidden('co') === false && STORE[COLS_KEY].split(',').sort().join() === 'pt,st');

STORE = {}; S.cols = undefined;
colToggle('pt'); colToggle('last');
ok('전부 펴면 빈 값으로 저장된다', STORE[COLS_KEY] === '');
S.cols = undefined;
ok('빈 값은 기본값이 아니라 "전부 펴짐"으로 읽는다 (다시 접히면 편 뜻이 무시된다)',
  colHidden('pt') === false && colHidden('last') === false);

/* ── 띠와 칩 ── */
STORE = {}; S.cols = undefined; S.F = {};
ok('펴진 열은 보통 칸으로 그린다',
  colTH('st', '상태', 'width:74px') === '<th style="width:74px">상태</th>'
  && colTD('st', '<b>진행중</b>') === '<td><b>진행중</b></td>');
ok('접힌 열은 띠가 되고 눌러서 편다',
  colTH('last', '최근 기록').indexOf('class="cband"') > 0
  && colTH('last', '최근 기록').indexOf("colToggle('last')") > 0
  && colTD('last', '기록 없음') === '<td class="cband"></td>');
ok('띠에 열 이름이 남아 무엇을 접었는지 보인다',
  colTH('last', 'x').indexOf('최근 기록') > 0);
ok('접힌 칸은 내용을 그리지 않는다 (그리면 폭이 안 준다)',
  colTD('last', '아주아주 긴 최근 기록 내용').indexOf('아주') < 0);
S.F = { my: { last: ['기록 없음'] } };
ok('조건이 걸린 채 접힌 열에는 점이 붙는다 (왜 안 나오는지 모를 일을 막는다)',
  colTH('last', 'x').indexOf('class="cbd"') > 0);
S.F = {};
ok('조건이 없으면 점이 없다', colTH('last', 'x').indexOf('class="cbd"') < 0);
ok('칩은 다섯 개, 접힌 것은 체크가 없다', (function () {
  const h = colChips();
  return (h.match(/chipbtn/g) || []).length === 5
    && h.indexOf('✓ 상태') > 0 && h.indexOf('✓ 업무') < 0;
})());
ok('접을 수 없는 열은 칩에 없다', colChips().indexOf('기업') < 0);

/* ── 구분별 묶어 보기 ── */
const mk = (cat, no) => ({ _id: no, cat: cat, no: no });
let rows = groupRows([mk('컨설팅', 'c1'), mk('계약', 'k1'), mk('기금', 'f1'), mk('사건', 's1'), mk('계약', 'k2')]);
ok('푸른이알피와 같은 고정 순서로 묶는다',
  rows.map(r => r[0]).join() === '계약,사건,컨설팅,기금');
ok('묶음 안 차례는 넘겨받은 그대로 (기한순은 이미 위에서 매겼다)',
  rows[0][1].map(i => i._id).join() === 'k1,k2');
rows = groupRows([mk('교육', 'e1'), mk('사건', 's1'), mk('감사', 'a1')]);
ok('모르는 구분은 뒤에 이름순으로',
  rows.map(r => r[0]).join() === '사건,감사,교육');
ok('옛 이름은 지금 이름으로 묶는다 (업체 = 계약)',
  groupRows([mk('업체', 'x1'), mk('계약', 'x2')]).length === 1);
ok('구분이 비면 기타로', groupRows([{ _id: 'n1' }])[0][0] === '기타');
ok('빈 목록은 빈 묶음', groupRows([]).length === 0);

/* ── 켜고 끄기와 접기 ── */
STORE = {}; S.grpOn = undefined; S.grpF = undefined;
ok('처음에는 묶어서 본다', grpOn() === true);
grpToggle();
ok('끄면 꺼지고 기억된다', grpOn() === false && STORE[GRPON_KEY] === '0');
grpToggle();
ok('다시 켜진다', grpOn() === true && STORE[GRPON_KEY] === '1');

STORE = {}; S.grpF = undefined;
ok('처음에는 아무 묶음도 접혀 있지 않다', grpFolded('계약') === false);
grpFoldToggle('계약');
ok('접으면 접히고 기억된다', grpFolded('계약') === true && STORE[GRP_KEY] === '계약');
grpFoldToggle('기금');
ok('여러 묶음을 접을 수 있다', STORE[GRP_KEY].split(',').sort().join() === '계약,기금');
grpFoldToggle('계약');
ok('다시 펴면 목록에서 빠진다', grpFolded('계약') === false && STORE[GRP_KEY] === '기금');
ok('소제목에 구분과 건수, 접힘 표시가 들어간다', (function () {
  const open = grpHeadHTML('사건', 21, 9), shut = grpHeadHTML('기금', 3, 9);
  return open.indexOf('▾') > 0 && open.indexOf('21건') > 0 && open.indexOf('colspan="9"') > 0
    && shut.indexOf('▸') > 0;
})());
ok('따옴표가 든 구분 이름도 안 깨진다', grpHeadHTML("사'건", 1, 9).indexOf("사\\'건") > 0);

S.grpOn = true; STORE = {}; S.cols = undefined;
ok('묶어 보기를 켜면 구분 열이 자동으로 접힌다 (소제목에 이미 쓰여 있다)',
  colHidden('cat') === true);
S.grpOn = false;
ok('끄면 구분 열이 돌아온다', colHidden('cat') === false);

/* ── 상태 드롭다운 ── */
ok('다섯 상태가 모두 선택지로 나온다', (function () {
  const h = stSelect('검토', 'W1');
  return STATUSES.every(s => h.indexOf('>' + s[0] + '<') > 0)
    && (h.match(/<option/g) || []).length === 5;
})());
ok('지금 상태가 골라져 있다', (function () {
  const h = stSelect('보류', 'W1');
  return /value="보류" selected/.test(h) && !/value="진행중" selected/.test(h);
})());
ok('상태가 비어 있으면 진행중으로 본다 (옛 자료)',
  /value="진행중" selected/.test(stSelect('', 'W1')));
ok('모르는 상태여도 목록이 깨지지 않는다', (function () {
  const h = stSelect('이상한값', 'W1');
  return (h.match(/<option/g) || []).length === 5 && h.indexOf('selected') < 0;
})());
ok('줄 열기로 번지지 않는다 (상태를 바꾸려다 드로어가 열리면 안 된다)',
  stSelect('진행중', 'W1').indexOf('event.stopPropagation()') > 0);
ok('따옴표가 든 업무ID도 안 깨진다', stSelect('진행중', "W'1").indexOf("W\\'1") > 0);

PATCHED = null;
setStatus('W1', '보류');
ok('고른 값이 저장된다', PATCHED && PATCHED.id === 'W1' && PATCHED.f.status === '보류');
PATCHED = null;
setStatus('W1', '이상한값');
ok('목록에 없는 값은 저장하지 않는다', PATCHED === null);
ok('눌러서 한 칸씩 도는 방식은 없앴다',
  W.indexOf('function cycleStatus(') < 0 && W.indexOf('cycleStatus(') < 0);
ok('푸른이알피 원본 상태는 그대로 아래에 붙는다',
  grab('rowHTML').indexOf('peStChip(it)') > 0);
ok('팀 전체·종료 화면의 상태 칩은 읽기용이라 클릭이 없다',
  grab('stChip').indexOf('onclick') < 0);

/* ── 표에 실제로 붙었나 ── */
const RM = grab('renderMy'), RH = grab('rowHTML');
ok('머리행이 접기를 거친다',
  RM.indexOf('colTH(k,fBtn') > 0 && RM.indexOf("colTH('last','최근 기록'") > 0);
ok('접힌 열의 걸러 보기 선택지는 세지 않는다 (헛일이다)',
  RM.indexOf("if(colHidden(k)) return colTH(k,'');") > 0);
ok('본문 다섯 칸이 접기를 거친다',
  ["colTD('cat'", "colTD('pt'", "colTD('st'", "colTD('last'", "colTD('due'"].every(s => RH.indexOf(s) > 0));
ok('업무 열을 접으면 진행률이 기업 칸으로 내려온다',
  RH.indexOf("colHidden('pt')?'<div class=\"sub\">'+stepChip(it._id)") > 0);
ok('기업 칸은 접히지 않는다', RH.indexOf("colTD('co'") < 0);
ok('칩이 표 위에 붙는다', RM.indexOf('colChips()+viewChips()') > 0);
ok('팀 전체에는 안 붙는다 (내 업무만의 설정이다)',
  grab('renderTeam').indexOf('colChips()') < 0);
ok('띠 모양이 CSS에 있다', W.indexOf('th.cband,td.cband{') > 0 && W.indexOf('.cbl{') > 0);
ok('묶어 보기를 켜면 소제목으로 그린다',
  RM.indexOf('grpHeadHTML(g[0],g[1].length,NCOL)') > 0 && RM.indexOf('groupRows(list)') > 0);
ok('끄면 예전처럼 한 덩어리',
  RM.indexOf('else list.forEach(function(it,i){ h+=rowHTML(it,i+1,i); });') > 0);
ok('접힌 묶음은 줄을 그리지 않는다', RM.indexOf('if(grpFolded(g[0])){') > 0);
ok('접힌 묶음의 건수도 번호에 반영한다 (펴면 번호가 이어진다)',
  RM.indexOf('gn+=g[1].length; return;') > 0);
ok('접힌 열도 띠로 한 칸이라 칸 수는 9로 고정', RM.indexOf('var NCOL=9;') > 0);
ok('묶어 보기 칩이 표 위에 있다', RM.indexOf('grpToggle()') > 0);
ok('조건 해제가 접힌 묶음도 편다', grab('myReset').indexOf('S.grpF={}') > 0);
ok('소제목 모양이 CSS에 있다', W.indexOf('tr.grph td{') > 0);

console.log('\n' + (fail ? 'FAILED ' + fail + '/' + (pass + fail) : 'ALL ' + pass + ' PASS'));
process.exit(fail ? 1 : 0);
