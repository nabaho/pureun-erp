/* 업무관리 종료 — 끝낸 방식(종료·취소·이관)과 사건 결과(승소·패소·…)
   두 축은 서로 다르다. 취하는 결과이지 끝낸 방식이 아니다.
   ⚠ 원래 임시 폴더에만 두었다가 한 번 날아갔다. 저장소에 둔다. */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const W = fs.readFileSync(process.argv[2] || path.join(ROOT, 'work.html'), 'utf8');
const P = fs.readFileSync(path.join(ROOT, 'pu-erp.html'), 'utf8');

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

const NS = 'work_erp';
let S = { me: { sid: 'u1', name: '김동현' } }, items = {}, UPDATED = null;
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function toast() {} function closeM() {} function route() {} function closeDrawer() {}
function todayStr() { return '2026-08-01'; }
function addLog() { return Promise.resolve(true); }
function peLinked(it) { return !!(it && it.src === 'puerp' && it.ref && it.ref.type && it.ref.id); }
const PE_KIND = { contract: '계약', case: '사건' };
const fbDb = { ref: () => ({ update: (u) => { UPDATED = u; return Promise.resolve(); } }) };

eval(gvar('END_WAYS') + '\n'
  + 'var END_BY_PE={}; END_WAYS.forEach(function(w){ END_BY_PE[w[3]]=w[0]; });\n'
  + 'var END_BY_KEY={}; END_WAYS.forEach(function(w){ END_BY_KEY[w[0]]=w; });\n'
  + gvar('CASE_RESULTS') + '\n'
  + 'var RES_BY_KEY={}; CASE_RESULTS.forEach(function(r){ RES_BY_KEY[r[0]]=r; });\n'
  + ['endWay', 'endBadge', 'hasResult', 'resBadge', 'peEndWay', 'peResult', '_peClosed',
     'setState', 'doComplete'].map(grab).join('\n'));

const path_ = (id, f) => NS + '/items/' + id + '/' + f;

/* ── 방식 3종 ── */
ok('방식 3종이 푸른이알피 상태와 1:1',
  END_WAYS.map(w => w[0]).join() === 'done,cancel,transfer'
  && END_WAYS.map(w => w[3]).join() === 'closed,cancelled,transferred');
ok('방식이 없으면 종료로 본다 (옛 자료)',
  endWay({}) === 'done' && endWay({ end_way: '엉뚱' }) === 'done' && endWay(null) === 'done');
ok('배지에 방식 이름이 들어간다',
  endBadge({ end_way: 'cancel' }).indexOf('취소') > 0 && endBadge({ end_way: 'transfer' }).indexOf('이관') > 0);

/* ── 푸른이알피에서 읽기 ── */
ok('status 에서 방식을 읽는다',
  peEndWay({ status: 'closed' }) === 'done' && peEndWay({ status: 'cancelled' }) === 'cancel'
  && peEndWay({ status: 'transferred' }) === 'transfer');
ok('status 가 없으면 종료 사유 문구에서 읽는다 (옛 자료)',
  peEndWay({ closedDate: '2026-01-01', closedReason: '취소' }) === 'cancel'
  && peEndWay({ closedAt: 'x', closeReason: '이관완료' }) === 'transfer');
ok('사유 없이 종료일만 있으면 종료', peEndWay({ closedDate: '2026-01-01' }) === 'done');
ok('끝나지 않은 건은 빈 문자열', peEndWay({ status: 'progress' }) === '' && peEndWay(null) === '');

/* ── 결과 5종 — 끝낸 방식과 다른 축 ── */
ok('결과 5종이 푸른이알피 값과 같다',
  CASE_RESULTS.map(r => r[0]).join() === 'win,lose,settlement,withdrawn,other');
ok('caseResult 를 그대로 읽되 엉뚱한 값은 버린다',
  peResult({ caseResult: 'win' }) === 'win' && peResult({ caseResult: '이상한값' }) === ''
  && peResult({}) === '' && peResult(null) === '');
ok('배지에 이름이 들어간다',
  resBadge({ end_result: 'win' }).indexOf('승소') > 0
  && resBadge({ end_result: 'withdrawn' }).indexOf('취하') > 0 && resBadge({}) === '');
ok('결과는 사건일 때만 묻는다',
  hasResult({ ref: { type: 'case', id: 'c1' } }) === true
  && hasResult({ cat: '사건' }) === true
  && hasResult({ cat: '컨설팅' }) === false
  && hasResult({ ref: { type: 'contract', id: 'k1' }, cat: '계약' }) === false
  && hasResult(null) === false);

/* ── 저장 ── */
items = { W1: {} }; UPDATED = null;
setState('W1', true, undefined, 'x', 'cancel');
ok('종료하면 방식과 상태 이름이 함께 저장된다',
  UPDATED[path_('W1', 'state')] === 'done' && UPDATED[path_('W1', 'end_way')] === 'cancel'
  && UPDATED[path_('W1', 'status')] === '취소');
ok('종료일을 오늘로 찍는다', UPDATED[path_('W1', 'done_date')] === '2026-08-01');

items = { W1: {} }; UPDATED = null;
setState('W1', true, undefined, 'x', 'transfer', '천안지청');
ok('이관은 넘긴 곳도 저장한다', UPDATED[path_('W1', 'end_to')] === '천안지청');
items = { W1: {} }; UPDATED = null;
setState('W1', true, undefined, 'x', 'done', '엉뚱한값');
ok('이관이 아니면 넘긴 곳을 비운다', UPDATED[path_('W1', 'end_to')] === null);

items = { W1: {} }; UPDATED = null;
setState('W1', true, undefined, 'x', 'done', '', 'win');
ok('결과가 함께 저장된다', UPDATED[path_('W1', 'end_result')] === 'win');
items = { W1: {} }; UPDATED = null;
setState('W1', true, undefined, 'x', 'done', '', '이상한값');
ok('엉뚱한 결과값은 저장하지 않는다', UPDATED[path_('W1', 'end_result')] === null);

items = { W1: {} }; UPDATED = null;
doComplete('W1', undefined, 'cancel', '', 'withdrawn');
ok('취소로 끝나도 결과를 함께 남길 수 있다 (다른 축이다)',
  UPDATED[path_('W1', 'end_way')] === 'cancel' && UPDATED[path_('W1', 'end_result')] === 'withdrawn');
items = { W1: {} }; UPDATED = null;
doComplete('W1', undefined);
ok('방식을 안 주면 종료로',
  UPDATED[path_('W1', 'end_way')] === 'done' && UPDATED[path_('W1', 'status')] === '종료');

/* ── 재개해도 지우지 않는다 —
   원래 취소였는지 이관이었는지를 잃으면 푸른이알피 상태를 되돌릴 수 없다 ── */
items = { W1: { end_way: 'transfer', end_to: '천안지청', end_result: 'settlement' } };
UPDATED = null; setState('W1', false, undefined, 'x');
ok('재개하면 진행중으로 돌아간다',
  UPDATED[path_('W1', 'state')] === null && UPDATED[path_('W1', 'status')] === '진행중');
ok('재개해도 끝낸 방식·넘긴 곳·결과는 남긴다 (되돌릴 근거)',
  UPDATED[path_('W1', 'end_way')] === 'transfer'
  && UPDATED[path_('W1', 'end_to')] === '천안지청'
  && UPDATED[path_('W1', 'end_result')] === 'settlement');

/* ── 푸른이알피와 함께 끝낼지 ── */
items = { W1: { src: 'puerp', ref: { type: 'case', id: 'c1' } } };
UPDATED = null; setState('W1', true, false, 'x', 'done');
ok('같이 끝내지 않기로 하면 동기화를 막는다', UPDATED[path_('W1', 'pe_nosync')] === true);
items = { W1: { src: 'puerp', ref: { type: 'case', id: 'c1' } } };
UPDATED = null; setState('W1', true, true, 'x', 'done');
ok('같이 끝내면 막지 않는다', UPDATED[path_('W1', 'pe_nosync')] === null);
items = { W1: {} }; UPDATED = null; setState('W1', true, undefined, 'x', 'done');
ok('연동되지 않은 자체 업무에는 그 표시가 없다',
  !(path_('W1', 'pe_nosync') in UPDATED));

/* ── 푸른이알피 엔진 ── */
/* 엔진은 MyDeskV2 밖으로 나가 top-level wsSyncRun 이 됐다(그 화면을 열어야만 돌던 것을
   앱 켤 때와 업무관리 신호에도 돌게 하려고). 주석 표시로 자르면 옮길 때마다 깨지므로
   함수 본문을 괄호로 잡는다. */
const ENG = (function () {
  const i = P.indexOf('function wsSyncRun(');
  if (i < 0) throw new Error('wsSyncRun 못 찾음');
  let d = 0, st = false;
  for (let j = i; j < P.length; j++) {
    if (P[j] === '{') { d++; st = true; }
    else if (P[j] === '}') { d--; if (st && !d) return P.slice(i, j + 1); }
  }
  throw new Error('wsSyncRun 끝 못 찾음');
})();
ok('엔진이 방식별 푸른이알피 상태를 쓴다',
  ENG.indexOf("done:{ st:'closed'") > 0 && ENG.indexOf("cancel:{ st:'cancelled'") > 0
  && ENG.indexOf("transfer:{ st:'transferred'") > 0);
ok('이관이면 넘긴 곳도 남긴다', ENG.indexOf('f.transferredTo = t.to') > 0);
ok('결과는 고른 것이 있을 때만 쓴다 (빈 값으로 덮으면 원본이 지워진다)',
  ENG.indexOf('if(t.res) f.caseResult = t.res;') > 0);
ok('재개는 종료 표시만 걷어낸다 (상태를 무조건 덮지 않는다)', (function () {
  const i = ENG.indexOf('// 재개 — 종료 표시만 걷어낸다');
  return i > 0 && ENG.slice(i, i + 320).indexOf("status: 'progress'") > 0;
})());
ok('푸른이알피에서 끝난 방식·결과가 업무관리로 온다',
  ENG.indexOf("pe.status === 'cancelled' ? 'cancel'") > 0
  && ENG.indexOf("if(pe.caseResult) up['work_erp/items/' + wid + '/end_result']") > 0);
ok('푸른이알피 쓰기는 dbPatch 로만', (function () {
  const tail = ENG.slice(ENG.indexOf('toPe.forEach'));
  return tail.indexOf('dbPatch(t.store, t.id, f)') > 0 && !/fbDb\.ref\('data\//.test(ENG);
})());

/* ── 종료 화면 ── */
const RA = grab('renderArchive');
ok('보관함이 아니라 종료다', W.indexOf("archive:'종료'") > 0 && !/<h1>보관함<\/h1>/.test(W));
ok('방식·결과로 걸러 본다',
  RA.indexOf('S.arWay') > 0 && RA.indexOf('S.arRes') > 0
  && RA.indexOf('endBadge(it)') > 0 && RA.indexOf('resBadge(it)') > 0);
/* 코드 한 줄을 글자 그대로 박아 두면 같은 뜻으로 고쳐 써도 깨진다(실제로 깨졌다).
   지켜야 하는 것은 「결과가 하나도 없으면 고르는 칸을 아예 안 낸다」는 뜻이다. */
ok('결과가 하나도 없으면 결과 고르는 칸을 띄우지 않는다',
  /if\s*\(\s*c\s*\)\s*resOpts\.push/.test(RA) && /resOpts\.length\s*>\s*1\s*\?/.test(RA));

/* pesync 열쇠는 **푸른이알피가 만들고** 업무관리는 읽기만 한다. 규칙이 한 글자라도
   다르면 — 실제로 그쪽만 하이픈을 _ 로 바꾸고 있었다 — 푸른이알피가 종료를 반영해도
   배지가 영원히 「반영 대기」로 남는다. 화면만 보아서는 알 수 없는 회귀라 못 박는다. */
ok('종료 배지 열쇠가 푸른이알피와 글자 단위로 같다', (function () {
  const i = P.indexOf('function wsSafeKey(');
  if (i < 0) return false;
  let d = 0, st = false, src = '';
  for (let j = i; j < P.length; j++) {
    if (P[j] === '{') { d++; st = true; }
    else if (P[j] === '}') { d--; if (st && d === 0) { src = P.slice(i, j + 1); break; } }
  }
  if (!src) return false;
  const erp = new Function('return (' + src + ')')();
  const work = new Function('return (' + grab('peSyncKey') + ')')();
  return ['계약-2026-046', '-Nabc123', 'case:임금체불-2026-007', 'a b.c#d', '기술보호-2026-006']
    .every(s => erp(s) === work(s));
})());
// 우리 쪽 자료의 열쇠(safeKey)는 그대로여야 한다 — 바꾸면 이미 쌓인 자료를 못 찾는다
ok('safeKey 는 하이픈을 건드리지 않는다',
  new Function('return (' + grab('safeKey') + ')')()('계약-2026-046') === '계약-2026-046');
ok('이관은 넘긴 곳을 목록에 보여준다', RA.indexOf("endWay(it)==='transfer'&&it.end_to") > 0);
ok('필터 초기화가 방식·결과도 푼다',
  grab('arReset').indexOf("S.arWay=''") > 0 && grab('arReset').indexOf("S.arRes=''") > 0);

console.log('\n' + (fail ? 'FAILED ' + fail + '/' + (pass + fail) : 'ALL ' + pass + ' PASS'));
process.exit(fail ? 1 : 0);
