/* 업무관리 걸러 보기(엑셀 자동필터) — 조건 모델과 체크 즉시 반영
   ⚠ 이 묶음은 원래 임시 폴더에만 있어 한 번 날아갔다. 저장소에 둔다. */
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

const TODAY = '2026-08-01';
let S = {}, RENDERED = 0;
function todayStr() { return TODAY; }
function renderMy() { RENDERED++; }
function renderTeam() { RENDERED++; }
function itemDue(it) { return it && it.due ? String(it.due) : ''; }
function dday(d) { return d ? Math.round((new Date(d + 'T00:00:00') - new Date(TODAY + 'T00:00:00')) / 86400000) : null; }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function _normCo(s) { return String(s || '').replace(/\(주\)|㈜|주식회사|[\s·.,\-()]/g, '').toLowerCase(); }

eval(gvar('DUE_BUCKETS') + '\n'
  + 'var DUE_LABEL={}, DUE_ORDER={};\n'
  + 'DUE_BUCKETS.forEach(function(b,i){ DUE_LABEL[b[0]]=b[1]; DUE_ORDER[b[0]]=i; });\n'
  + gvar('KIND_ALIAS') + '\n'
  + ['dueBucket', 'ptOf', 'catNorm', 'mgrSubNames', 'mgrAll'].map(grab).join('\n') + '\n'
  + gvar('FCOLS') + '\n'
  + ['fCols', 'fCol', 'fRender', 'fHas', 'fSel', 'fSet', 'fClear', 'fAny', 'fResetCols',
     'fLabel', '_fList', 'fVals', 'fPass', 'fPick', 'fPickAll',
     'fPopKey', 'fOpen', 'fOnly', 'fToggleOne', 'fBtn'].map(grab).join('\n'));

/* ── 조건 모델: '조건 없음' 과 '다 지웠다' 는 다르다 ──
   체크를 즉시 반영하면서 이 둘이 같은 값이면, 다 지운 순간 전부 다시 보여
   무엇을 한 것인지 알 수 없다. */
const ITEMS = [
  { cat: '계약', ptype: '취업규칙', status: '진행중', due: '2026-07-30' },
  { cat: '계약', ptype: '취업규칙', status: '진행중', due: '2026-08-04' },
  { cat: '사건', ptype: '부당해고', status: '진행중', due: '2026-08-04' },
  { cat: '컨설팅', ptype: '일터혁신', status: '보류', due: '' }
];
const keep = arr => arr.filter(it => fPass('my', it, ''));

S = { F: { my: {} } };
ok('조건 없음 — 거르지 않는다', keep(ITEMS).length === 4 && fAny('my') === false);
S = { F: { my: { cat: [] } } };
ok('다 지웠다 — 아무것도 안 남는다', keep(ITEMS).length === 0 && fAny('my') === true);
S = { F: { my: { cat: ['사건', '컨설팅'] } } };
ok('한 열에서 여러 값을 동시에', keep(ITEMS).length === 2);
S = { F: { my: { cat: ['계약'], due: ['over'] } } };
ok('열이 여러 개면 모두 만족해야 남는다', keep(ITEMS).length === 1);
S = { F: { my: { cat: ['사건'] }, team: {} } };
ok('두 화면의 조건이 섞이지 않는다',
  keep(ITEMS).length === 1 && ITEMS.filter(it => fPass('team', it, '')).length === 4);
S = { F: { my: { cat: ['사건'] } } };
ok('건수를 셀 때는 그 열만 되살린다 (엑셀과 같다)',
  fVals('my', 'cat', ITEMS.filter(it => fPass('my', it, 'cat'))).length === 3);
S = { F: { my: { cat: ['사건'], st: ['보류'] } } };
fClear('my', 'cat');
ok('그 열만 지우면 다른 열은 남는다', !fHas('my', 'cat') && fHas('my', 'st'));

/* ── 옛 이름 '업체' 는 '계약' 으로 읽는다 ── */
ok('걸러 보기가 옛 이름을 계약으로 묶는다',
  fCol('my', 'cat')[2]({ cat: '업체' }) === '계약'
  && fCol('my', 'cat')[2]({}) === '기타');

/* ── 담당은 한 건에 여러 명(주 1 + 부 N) ── */
ok('담당 값에 부담당까지 들어간다',
  fCol('team', 'mgr')[2]({ mgr_main: { name: '권형하' }, mgr_subs: [{ name: '김동현' }] })
    .join() === '권형하,김동현');
S = { F: { team: { mgr: ['김동현'] } } };
ok('부담당으로 붙은 건도 그 사람 것으로 걸린다',
  [{ mgr_main: { name: '권형하' }, mgr_subs: [{ name: '김동현' }] },
   { mgr_main: { name: '박한별' } }].filter(it => fPass('team', it, '')).length === 1);

/* ── 체크 한 칸이 곧바로 반영된다 ──
   ★ 여기서 버그가 났던 자리: '값 찾기'로 목록을 좁힌 뒤 하나를 체크하면
     "보이는 것 전부 체크됨"이 되어 조건이 걸리는 대신 풀려 버렸다.
     그 열의 값 전체(S._fAll)를 기준으로 세어야 한다. */
const ALL3 = ['계약', '사건', '컨설팅'];

S = { F: { my: {} }, _fAll: ALL3 };
fPick('my', 'cat', '컨설팅', false);
ok('조건이 없을 때 하나를 끄면 나머지만 남는다',
  fSel('my', 'cat').sort().join() === '계약,사건');

S = { F: { my: { cat: ['사건'] } }, _fAll: ALL3 };
fPick('my', 'cat', '컨설팅', true);
ok('★ 찾기로 좁힌 뒤 체크해도 조건이 풀리지 않는다 (예전 버그)',
  fHas('my', 'cat') && fSel('my', 'cat').sort().join() === '사건,컨설팅');

S = { F: { my: { cat: ['사건', '컨설팅'] } }, _fAll: ALL3 };
fPick('my', 'cat', '계약', true);
ok('마지막 값까지 채우면 조건 없음으로 지운다', !fHas('my', 'cat'));

S = { F: { my: { cat: ['사건'] } }, _fAll: ALL3 };
fPick('my', 'cat', '사건', false);
ok('하나뿐인 값을 끄면 다 지운 상태가 된다',
  fHas('my', 'cat') && fSel('my', 'cat').length === 0);

S = { F: { my: { cat: ['사건'] } }, _fAll: ALL3 };
fPick('my', 'cat', '사건', true);
ok('이미 든 값을 다시 체크해도 두 번 들어가지 않다',
  fSel('my', 'cat').join() === '사건');

S = { F: { my: {} }, _fAll: [] };
RENDERED = 0; fPick('my', 'cat', '사건', true);
ok('고를 값이 없으면 아무 일도 안 한다', RENDERED === 0 && !fHas('my', 'cat'));

S = { F: { my: { cat: ['사건'] } } };
fPickAll('my', 'cat', true);
ok('[전체 선택] 은 조건 없음', !fHas('my', 'cat'));
S = { F: { my: {} } };
fPickAll('my', 'cat', false);
ok('[모두 지우기] 는 다 지운 상태 — 찾기로 감춘 값까지 함께',
  fHas('my', 'cat') && fSel('my', 'cat').length === 0);

S = { F: { my: {} }, _fAll: ALL3 };
RENDERED = 0; fPick('my', 'cat', '사건', false);
ok('바꾸면 화면을 다시 그린다', RENDERED === 1);

/* ── 머리행 표시 ── */
S = { F: { my: {} } };
ok('아무것도 안 고르면 열 이름만', fBtn('my', 'cat', []).indexOf('>구분<') > 0);
S = { F: { my: { cat: ['사건'] } } };
ok('하나 고르면 그 값이 보인다', fBtn('my', 'cat', []).indexOf('>사건<') > 0);
S = { F: { my: { cat: ['사건', '컨설팅'] } } };
ok('여럿이면 개수가 보인다', fBtn('my', 'cat', []).indexOf('구분 2개') > 0);
S = { F: { my: { cat: [] } } };
ok('다 지웠으면 0개라고 보인다', fBtn('my', 'cat', []).indexOf('구분 0개') > 0);
S = { F: { my: { due: ['over'] } } };
ok('기한은 코드가 아니라 우리말로', fBtn('my', 'due', []).indexOf('기한 지남') > 0);

/* ── 요약 칩과 깔때기가 같은 상태를 쓴다 ── */
S = {};
fToggleOne('team', 'due', 'd7');
const chipOn = fOnly('team', 'due', 'd7');
fToggleOne('team', 'due', 'd7');
ok('임박 칩은 다음 할 일에서 임박만 고른 것과 같다',
  chipOn && !fHas('team', 'due'));
S = { F: { team: { due: ['d7', 'over'] } } };
ok('여러 개 골라 둔 상태는 칩이 켜진 것으로 보지 않는다', fOnly('team', 'due', 'd7') === false);

/* ── 기한은 겹치지 않는 칸 ── */
ok('한 건은 한 칸에만 든다',
  ['2026-07-31', '2026-08-01', '2026-08-08', '2026-08-09', '2026-08-31', '2026-09-01', '']
    .map(d => dueBucket({ due: d })).join() === 'over,d7,d7,d30,d30,later,none');

/* ── 화면 배선 ── */
const RM = grab('renderMy'), RT = grab('renderTeam'), PH = grab('fPopHTML');
ok('머리행 자체가 걸러 보기다 (위아래 따로 줄이 없다)',
  RM.indexOf('<tr class="fhead">') > 0 && RM.indexOf('<div class="fbar">') < 0
  && RM.indexOf('frow') < 0);
ok('체크는 fPick으로 한 칸씩 — fApply로 몰아 읽지 않는다',
  PH.indexOf('onchange="fPick(') > 0 && PH.indexOf('onchange="fApply(') < 0);
ok('값 전체를 기준으로 세도록 적어 둔다', PH.indexOf('S._fAll=vals.map') > 0);
ok('[적용]·[조건 없음] 은 없앴다', PH.indexOf('>적용<') < 0 && PH.indexOf('>조건 없음<') < 0);
ok('전체 선택·모두 지우기·닫기가 있다',
  ['전체 선택', '모두 지우기', '닫기'].every(s => PH.indexOf(s) > 0));
ok('다 지웠으면 그렇다고 알려 준다',
  PH.indexOf('고른 값이 없어 아무것도 보이지 않습니다') > 0 && /\.fwarn\{/.test(W));
ok('찾기 글자는 다시 그려도 남는다', PH.indexOf('S.fFind') > 0);
ok('팀 전체에도 같은 깔때기가 붙었다',
  ["tf('cat'", "tf('pt'", "tf('st'", "tf('due'"].every(s => RT.indexOf(s) > 0)
  && RT.indexOf("fBtn('team','mgr'") > 0);
ok('담당 묶음은 주담당 기준 — 부담당까지 묶으면 건수 합이 어긋난다',
  RT.indexOf('var names=teamNames();') > 0);
ok('긴 목록에서 머리행이 붙어 있는다',
  /\.panel\.tbl thead th\{position:sticky;top:0/.test(W)
  && (W.match(/<div class="panel tbl">/g) || []).length === 4);
ok('짧은 표가 빈 칸으로 길어지지 않는다 (min-height 없음)',
  !/\.panel\.tbl\{[^}]*min-height/.test(W));

/* ── 죽은 코드가 남지 않았나 ── */
['fClearCol', 'fPopFind', 'endLabel'].forEach(function (n) {
  ok('쓰지 않는 ' + n + ' 을 지웠다', W.indexOf('function ' + n + '(') < 0);
});

console.log('\n' + (fail ? 'FAILED ' + fail + '/' + (pass + fail) : 'ALL ' + pass + ' PASS'));
process.exit(fail ? 1 : 0);
