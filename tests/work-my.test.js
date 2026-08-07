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
function route() {} function renderMy() {}
function fHas(sc, k) { return (S.F && S.F[sc] && S.F[sc][k]) instanceof Array; }

eval(gvar('COLS_KEY') + '\n' + gvar('MYCOLS') + '\n' + gvar('COLS_DEFAULT') + '\n'
  + ['colPref', 'colHidden', 'colToggle', 'colChips', 'colTH', 'colTD'].map(grab).join('\n'));

/* ── 접을 수 있는 열 ── */
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

console.log('\n' + (fail ? 'FAILED ' + fail + '/' + (pass + fail) : 'ALL ' + pass + ' PASS'));
process.exit(fail ? 1 : 0);
