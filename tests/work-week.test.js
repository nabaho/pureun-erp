/* 업무관리 주간 기록 — 요일 칸 · 자판 이동 · 한글 조합 · 기록 고치기 권한
   ⚠ 원래 임시 폴더에만 두었다가 한 번 날아갔다. 저장소에 둔다. */
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

const MON = '2026-07-27';                       // 월요일
let S = { week: MON, me: { sid: 'P-007', name: '김동현' } };
let wkCache = {}, steps = {}, INPUTS = [], CALLS = [];
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function escJ(s) { return esc(String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")); }
function pad(n) { return (n < 10 ? '0' : '') + n; }
function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function addDays(d, n) {
  const t = new Date((typeof d === 'string' ? new Date(d + 'T00:00:00') : d).getTime());
  t.setDate(t.getDate() + n); return t;
}
function todayStr() { return '2026-07-29'; }    // 수요일
function weekKeyOf() { return 'W1'; }
function logBtns() { return '<BTNS>'; }
function isAdmin() { return S.admin === true; }
function go(v) { CALLS.push(['go', v]); }
function shiftWeek(n) { CALLS.push(['shiftWeek', n]); }
function setWeek(v) { CALLS.push(['setWeek', v]); }
function itemModal() { CALLS.push(['itemModal']); }
function searchModal() { CALLS.push(['searchModal']); }
function keysModal() { CALLS.push(['modal']); }
function closeM() { CALLS.push(['closeM']); }
function closeCal() {} function closeDrawer() { CALLS.push(['closeDrawer']); }
function goBack() { CALLS.push(['goBack']); }
function showModal() { CALLS.push(['modal']); }
function fApply(a, b) { CALLS.push(['fApply', a, b]); }
function fPopClose(a) { CALLS.push(['fPopClose', a]); }
const document = {
  _h: [],
  addEventListener(t, f) { if (t === 'keydown') this._h.push(f); },
  removeEventListener() {},
  querySelectorAll(sel) {
    const m = /\[data-(\w+)="([^"]*)"\]/.exec(sel || '');
    const out = m ? INPUTS.filter(x => x.getAttribute('data-' + m[1]) === m[2]) : INPUTS.slice();
    out.indexOf = Array.prototype.indexOf;
    return out;
  },
  activeElement: { tagName: 'BODY' }
};
function $(id) { return null; }

eval(gvar('WDS') + '\n' + gvar('WKSPLIT_KEY') + '\n' + gvar('NAV_KEYS') + '\n' + gvar('KEYS') + '\n'
  + gvar('_KCODE') + '\n'
  + ['stepsOf', '_cut', 'wkDays', 'wkMarks', 'wkHeadHTML', 'wkCellHTML',
     'isPlanDay', 'planRowHTML',
     'wkPut', 'wkFocus', 'wkMove', 'wkSide',
     '_inTyping', '_ime', '_k', '_kNum', 'canLog'].map(grab).join('\n'));
// 화면 전체 자판 처리기를 그대로 실어 실제 분기를 태운다
eval(W.slice(W.indexOf("document.addEventListener('keydown',function(e){"),
             W.indexOf('/* 한글 입력 상태에서는')));
const fire = (o) => { CALLS = []; document._h.forEach(f => f(Object.assign({
  key: '', code: '', shiftKey: false, ctrlKey: false, metaKey: false, altKey: false,
  isComposing: false, keyCode: 0, preventDefault() {}, target: { tagName: 'BODY' } }, o))); return CALLS; };

/* ── 보여줄 요일 ── */
wkCache = {};
ok('기본은 월~금 다섯 칸',
  wkDays().length === 5 && wkDays()[0] === '2026-07-27' && wkDays()[4] === '2026-07-31');
wkCache = { W1: { A: { L1: { d: '2026-08-01', t: '토요일 정리' } } } };
ok('주말에 적은 기록이 있으면 토·일도 낸다 (안 보이면 사라진 줄 안다)',
  wkDays().length === 7 && wkDays()[6] === '2026-08-02');
wkCache = { W1: { A: { L1: { d: '2026-07-29', t: '수요일' } } } };
ok('주말 기록이 없으면 만들지 않는다 (늘 띄우면 평일이 좁아진다)', wkDays().length === 5);
wkCache = {}; S.week = '2026-08-03';
ok('주가 바뀌면 날짜도 따라간다', wkDays()[0] === '2026-08-03' && wkDays()[4] === '2026-08-07');
S.week = MON;

/* ── 머리행과 본문이 같은 격자 ── */
ok('머리행에 요일과 날짜, 오늘 표시',
  wkHeadHTML().indexOf('월 27') > 0 && wkHeadHTML().indexOf('금 31') > 0
  && wkHeadHTML().indexOf('wkh td') > 0);
ok('머리행과 본문이 같은 칸 수 (다르면 줄이 어긋난다)',
  /repeat\((\d+),1fr\)/.exec(wkHeadHTML())[1] === /repeat\((\d+),1fr\)/.exec(wkCellHTML({ _id: 'W1' }, [], 0))[1]);

/* ── 그 날 표시 = 달력을 줄 안으로 ──
   ⚠ 단계 기한 필드는 d 다 (due 아님). stepAdd·stepDate·드로어 날짜칸·캘린더가
     모두 d 를 쓴다. 예전에 이 붙박이 자료를 due 로 적어 두어, wkMarks 가 due 를
     보던 결함을 검사가 못 잡았다 — 검사가 코드와 같은 실수를 하고 있었다. */
steps = { W1: { s1: { t: '서면 제출', d: '2026-07-30', o: 1 } } };
const IT = { _id: 'W1', due: '2026-07-27', next: { date: '2026-07-28', text: '조사관 통화' } };
ok('기한·다음 할 일·진행 단계가 그 요일에 뜬다',
  wkMarks(IT, '2026-07-27').indexOf('기한') > 0
  && wkMarks(IT, '2026-07-28').indexOf('조사관 통화') > 0
  && wkMarks(IT, '2026-07-30').indexOf('서면 제출') > 0
  && wkMarks(IT, '2026-07-29') === '');
steps = { W1: { s1: { t: '자료수집', d: '2026-07-29', done: 1, o: 1 } } };
ok('끝낸 단계는 표시하지 않는다', wkMarks({ _id: 'W1' }, '2026-07-29') === '');
steps = { W1: { s1: { t: '자료수집', d: '2026-07-29', o: 1 }, s2: { t: '서면 작성', d: '2026-07-29', o: 2 } } };
ok('같은 날 여럿이면 하나만 보이고 +N', (function () {
  const m = wkMarks({ _id: 'W1' }, '2026-07-29');
  return m.indexOf('+1') > 0 && m.indexOf('자료수집') > 0;
})());
steps = {};
ok('긴 글자는 잘라 칸을 넘지 않게',
  wkMarks({ _id: 'W1', next: { date: '2026-07-29', text: '아주아주아주긴다음할일이름' } }, '2026-07-29').indexOf('…') > 0
  && _cut('짧다', 8) === '짧다');

/* ── 칸 내용 ── */
steps = {}; wkCache = {};
const cells = wkCellHTML({ _id: 'W1' }, [
  { d: '2026-07-27', t: '월요일 일', _id: 'L1' },
  { d: '2026-07-29', t: '수요일 일', _id: 'L2' }], 0).split('<div class="wkc');
ok('그 날 기록이 그 날 칸에만 들어간다',
  cells[1].indexOf('월요일 일') > 0 && cells[1].indexOf('수요일 일') < 0
  && cells[3].indexOf('수요일 일') > 0);
const cell = wkCellHTML({ _id: 'W1' }, [], 3);
ok('요일마다 입력칸이 있고 그 날짜를 달고 있다',
  (cell.match(/class="wkin"/g) || []).length === 5
  && cell.indexOf('data-d="2026-07-27"') > 0 && cell.indexOf('data-r="3"') > 0
  && cell.indexOf('data-c="4"') > 0);
ok('오늘 칸은 표가 난다', cell.indexOf('class="wkc td"') > 0);
ok('남이 쓴 기록에는 이름이, 고친 기록에는 표시가', (function () {
  const h = wkCellHTML({ _id: 'W1' }, [
    { d: '2026-07-27', t: 'x', byName: '권형하', _id: 'L1' },
    { d: '2026-07-28', t: 'y', byName: '김동현', ed_at: '2026-07-30', _id: 'L2' }], 0);
  return h.indexOf('권형하') > 0 && !/class="by">김동현/.test(h) && h.indexOf('(수정)') > 0;
})());
ok('기록마다 고치기·지우기가 붙는다',
  wkCellHTML({ _id: 'W1' }, [{ d: '2026-07-27', t: 'x', _id: 'L1' }], 0).indexOf('<BTNS>') > 0);
ok('따옴표가 든 업무ID도 안 깨진다', wkCellHTML({ _id: 'W"1' }, [], 0).indexOf('W&quot;1') > 0);

/* ── 자판으로 칸 옮기기 ── */
function mkGrid(rows, cols) {
  INPUTS = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    INPUTS.push({ value: '', focused: false, _r: String(r), _c: String(c),
      focus() { INPUTS.forEach(x => x.focused = false); this.focused = true; },
      setSelectionRange() {},
      getAttribute(k) { return k === 'data-r' ? this._r : k === 'data-c' ? this._c : null; } });
  }
  INPUTS.indexOf = Array.prototype.indexOf;
}
const at = (r, c, cols) => INPUTS[r * cols + c];
mkGrid(3, 5);
wkMove(at(0, 2, 5), 1);
ok('위아래는 같은 요일을 지킨다 (옆 요일로 새지 않는다)', at(1, 2, 5).focused);
mkGrid(3, 5);
wkMove(at(0, 1, 5), -1); const topStay = at(0, 1, 5).focused;
wkMove(at(2, 1, 5), 1);
ok('첫 줄·마지막 줄에서는 더 가지 않는다', topStay && at(2, 1, 5).focused);
mkGrid(3, 5);
wkSide(at(1, 0, 5), 1);
ok('좌우는 같은 줄에서 요일을 옮긴다', at(1, 1, 5).focused);
mkGrid(2, 5);
wkSide(at(0, 0, 5), -1); const leftStay = at(0, 0, 5).focused;
wkSide(at(0, 4, 5), 1);
ok('월요일에서 왼쪽·금요일에서 오른쪽은 그 자리', leftStay && at(0, 4, 5).focused);
INPUTS = []; INPUTS.indexOf = Array.prototype.indexOf;
ok('기록 칸이 없으면 조용히 넘어간다', wkFocus(0) === false);
ok('줄 표식이 없으면 좌우로 옮기지 않는다', wkSide({ getAttribute: () => null }, 1) === false);

const WK = grab('wkKey');
ok('↑↓는 저장하지 않고 칸만 옮긴다',
  WK.indexOf("e.key==='ArrowDown'||e.key==='ArrowUp'") > 0
  && WK.indexOf('wkMove') < WK.indexOf('wkSave'));   // 저장은 wkSave 가 맡는다(날짜에 따라 할 일/기록)
ok('좌우는 빈 칸에서만 (글자가 있으면 커서를 움직여야 한다)',
  WK.indexOf("(e.key==='ArrowLeft'||e.key==='ArrowRight')&&!inp.value") > 0);
ok('Shift+Enter 는 윗줄로', WK.indexOf('var step=e.shiftKey?-1:1') > 0);
ok('빈 칸에서 Enter 는 저장 없이 넘어간다', WK.indexOf('if(!txt.trim()){ wkMove(inp,step); return; }') > 0);
ok('요일 칸에 적으면 그 날짜로 저장된다',
  WK.indexOf("var day=inp.getAttribute('data-d')||''") > 0
  && WK.indexOf("var dateStr=day||(isCurWeek()?todayStr():ymd(addDays(S.week,4)))") > 0);

/* ── 한글 조합 중 Enter ──
   "설문 정리"를 치고 Enter를 누르면 마지막 글자를 확정하는 Enter가 먼저 온다.
   그것을 저장으로 받으면 "설문 정"만 저장되거나 같은 줄이 두 번 들어간다. */
ok('조합 중인 Enter 를 가려낸다',
  _ime({ isComposing: true }) === true && _ime({ keyCode: 229 }) === true
  && _ime({ isComposing: false, keyCode: 13 }) === false
  && _ime(null) === false && _ime(undefined) === false);
ok('조합 중에는 화면 단축키를 잡지 않는다',
  fire({ key: 'Enter', isComposing: true }).length === 0
  && fire({ key: 'n', code: 'KeyN', isComposing: true }).length === 0);
ok('주간 기록·빠른 기록도 흘려보낸다',
  WK.indexOf('if(_ime(e)) return;') > 0 && grab('qbKey').indexOf('if(_ime(e)) return;') > 0);

/* ── 단축키 ── */
S.view = 'my';                      // 주 이동·기록 칸 단축키는 주간 표가 있는 화면에서만
ok('입력 칸에서는 단축키가 가로채지 않는다',
  fire({ key: 'n', code: 'KeyN', target: { tagName: 'INPUT' } }).length === 0
  && fire({ key: '1', code: 'Digit1', target: { tagName: 'TEXTAREA' } }).length === 0);
ok('브라우저 단축키는 건드리지 않는다',
  fire({ key: 'n', code: 'KeyN', ctrlKey: true }).length === 0
  && fire({ key: 't', code: 'KeyT', altKey: true }).length === 0);
ok('Ctrl+K 는 입력 중에도 전체 검색',
  fire({ key: 'k', code: 'KeyK', ctrlKey: true, target: { tagName: 'INPUT' } })[0][0] === 'searchModal');
ok('한글 상태에서도 듣는다 (글자가 아니라 자판 자리를 본다)',
  fire({ key: 'ㅜ', code: 'KeyN' })[0][0] === 'itemModal'
  && fire({ key: 'ㅅ', code: 'KeyT' })[0][0] === 'setWeek');
ok('영문 대소문자 모두',
  fire({ key: 'N', code: 'KeyN' })[0][0] === 'itemModal'
  && fire({ key: 'n', code: 'KeyN' })[0][0] === 'itemModal');
ok('1~6 이 왼쪽 차례대로',
  [1, 2, 3, 4, 5, 6].every((n, i) => fire({ key: String(n), code: 'Digit' + n })[0][1] === NAV_KEYS[i]));
ok('7 이상은 아무 화면도 아니다',
  fire({ key: '7', code: 'Digit7' }).length === 0 && fire({ key: '0', code: 'Digit0' }).length === 0);
ok('숫자패드로도', fire({ key: '2', code: 'Numpad2' })[0][1] === 'team');
ok('[ ] 로 지난 주·다음 주, T 로 이번 주',
  fire({ key: '[', code: 'BracketLeft' })[0][1] === -1
  && fire({ key: ']', code: 'BracketRight' })[0][1] === 1
  && fire({ key: 't', code: 'KeyT' })[0][0] === 'setWeek');
S.view = 'kb';
ok('주간 표가 없는 화면에서는 주를 옮기지 않는다',
  fire({ key: '[', code: 'BracketLeft' }).length === 0);
S.view = 'my';
ok('? 는 도움말, / 는 빠른 기록 (Shift 하나로 갈린다)',
  fire({ key: '?', code: 'Slash', shiftKey: true })[0][0] === 'modal'
  && fire({ key: '/', code: 'Slash' }).length === 0);
S.fPop = 'team:cat';
ok('조건 목록이 열려 있으면 Enter 가 적용, Esc 가 닫기', (function () {
  const a = fire({ key: 'Enter' })[0], b = fire({ key: 'Escape' })[0];
  return a[0] === 'fApply' && a[1] === 'team' && b[0] === 'fPopClose';
})());
S.fPop = '';
ok('조건 목록이 닫혀 있으면 Enter 를 가로채지 않는다', fire({ key: 'Enter' }).length === 0);
S.view = 'team'; S.drawerId = 'W1';
ok('Esc 는 서랍을 먼저 닫는다', fire({ key: 'Escape' })[0][0] === 'closeDrawer');
delete S.drawerId;
ok('서랍이 없으면 뒤로', fire({ key: 'Escape' })[0][0] === 'goBack');
S.view = 'my';
ok('도움말에 적힌 키가 실제로 다뤄진다', (function () {
  const src = W.slice(W.indexOf("document.addEventListener('keydown'"), W.indexOf('function wkFocus')) + WK;
  const has = { '/': "_k(e,'/')", 'E': "_k(e,'E')", 'Enter': "e.key!=='Enter'",
    'Shift+Enter': 'e.shiftKey?-1:1', '↑ ↓': "e.key==='ArrowDown'", '← →': "e.key==='ArrowLeft'",
    'Ctrl+K': "e.key==='k'", 'N': "_k(e,'N')", '1 … 6': '_kNum(e)', '[  ]': "_k(e,'[')",
    'T': "_k(e,'T')", 'Esc': "e.key==='Escape'", 'Backspace': "e.key==='Backspace'",
    '?': "_k(e,'/',true)" };
  return KEYS.reduce((a, g) => a.concat(g[1].map(k => k[0])), [])
    .every(l => has[l] === undefined || src.indexOf(has[l]) > 0);
})());

/* ── 기록 고치기 권한 ── */
S.me = { sid: 'P-007', name: '김동현' }; S.admin = false;
ok('내가 쓴 기록만 고칠 수 있다',
  canLog({ by: 'P-007' }) === true && canLog({ byName: '김동현' }) === true
  && canLog({ by: 'P-001', byName: '권형하' }) === false && canLog(null) === false);
S.admin = true;
ok('대표는 남의 기록도 고칠 수 있다', canLog({ by: 'P-001', byName: '권형하' }) === true);
S.admin = false;
ok('고칠 수 없으면 버튼을 아예 안 그린다', grab('logBtns').indexOf("if(!canLog(l)) return '';") > 0);
ok('날짜를 바꾸면 옛 주차에서 지우고 새 주차에 넣는다 (주차가 달라질 수 있다)', (function () {
  const f = grab('saveLogEdit');
  return f.indexOf('if(oldWk&&oldWk!==newWk)') > 0        // 옛 주차 경로를 null 로
      && f.indexOf("+newWk+'/'+itemId+'/'+lid]=base") > 0  // 새 주차에 다시 넣는다
      && f.indexOf('itemlogs') > 0;                        // 건별 사본도 함께
})());
ok('내용을 비우거나 날짜가 이상하면 저장하지 않는다', (function () {
  const f = grab('saveLogEdit');
  return f.indexOf('내용을 비울 수 없습니다') > 0
      && f.indexOf('/^\\d{4}-\\d{2}-\\d{2}$/.test(d)') > 0;
})());
ok('고친 기록에는 누가 언제 고쳤는지 남는다',
  grab('saveLogEdit').indexOf('ed_at:') > 0 && grab('saveLogEdit').indexOf('ed_by:') > 0);
ok('지울 때는 건별 사본도 함께 읽어 고아 기록을 남기지 않는다',
  grab('delLog').indexOf('loadItemLogs') > 0);

/* ── 켜고 끄기 ── */
ok('요일별·한 칸을 오갈 수 있고 그 선택을 기억한다',
  grab('wkSplitToggle').indexOf('WKSPLIT_KEY') > 0
  && grab('wkSplitOn').indexOf("v!=='0'") > 0);
ok('요일별일 때만 쪼갠 칸을 그린다',
  grab('rowHTML').indexOf('wkSplitOn()?wkCellHTML(it,logs,rowIdx||0)') > 0);
ok('팀 전체는 예전 그대로 (남의 업무를 요일별로 적을 일은 없다)',
  grab('renderTeam').indexOf('wkCellHTML') < 0);

console.log('\n' + (fail ? 'FAILED ' + fail + '/' + (pass + fail) : 'ALL ' + pass + ' PASS'));
process.exit(fail ? 1 : 0);
