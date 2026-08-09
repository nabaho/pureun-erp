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
function route() {} function renderMy() {} function renderTeam() {}
function fRender(sc) { if (sc === 'team') renderTeam(); else renderMy(); }
function fHas(sc, k) { return (S.F && S.F[sc] && S.F[sc][k]) instanceof Array; }
function catBadge(c) { return '<span class="cat">' + esc(c) + '</span>'; }
function showModal() {} function closeM() {}
// 요일 칸 대역 — 커서가 실제로 그 날 칸에 잡히는지 보기 위함
let CELLS = [], FOCUSED = null;
const document = {
  querySelector(sel) {
    const m = /data-d="([^"]*)"/.exec(sel || '');
    return CELLS.filter(c => c.d === (m && m[1]))[0] || null;
  }
};
function wkPut(el) { if (!el) return false; FOCUSED = el; return true; }
function wkSplitOn() { return S.wkSplit !== false; }
let PATCHED = null;
function patchItem(id, f) { PATCHED = { id: id, f: f }; return Promise.resolve(true); }

const NS = 'work_erp';
let steps = {}, itemLogsCache = {};
let SET = null, UPDATED = null, LOGGED = null, DELETED = null, _lastLogId = '';
const fbDb = {
  ref(p) {
    return {
      set(v) { SET = { p: p, v: v }; return Promise.resolve(); },
      update(u) { UPDATED = u; return Promise.resolve(); },
      remove() { SET = { p: p, v: null }; return Promise.resolve(); }
    };
  }
};
function todayStr() { return '2026-08-07'; }     // 금요일
function addLog(id, t, d, k) { LOGGED = { id: id, t: t, d: d, k: k }; _lastLogId = 'L9'; return Promise.resolve(true); }
function _delLog(id, lid) { DELETED = { id: id, lid: lid }; }
function loadItemLogs() { return Promise.resolve(); }
function canLog(l) { return !!l && (l.by === S.me.sid || l.byName === S.me.name); }
function toast() {}
function rid(p) { return p + '9'; }

eval(gvar('STATUSES') + '\n' + gvar('PLAN_GROUP') + '\n' + gvar('COLS_KEY') + '\n' + gvar('COLSET') + '\n' + gvar('COLS_DEFAULT') + '\n'
  + gvar('GRP_KEY') + '\n' + gvar('GRP_ORDER') + '\n'
  + gvar('KIND_SET') + '\n' + gvar('KIND_ALIAS') + '\n'
  + ['catNorm', 'colCols', 'colHas', 'colPref', 'colForced', 'colHidden', 'colToggle', 'colBtn',
     'colPop', 'colPopClose', 'colPopHTML', 'colTH', 'colTD',
     'grpOn', 'grpToggle', 'grpFold', 'grpFolded', 'grpFoldToggle', 'groupRows',
     'grpHeadHTML', 'dayHeadHTML', 'calFocusDay', 'stSelect', 'setStatus',
     'stepsOf', 'isPlanDay', 'wkSave', 'planAdd', 'planCheck', 'planUncheck',
     'planDel', 'planToLog', 'logToPlan'].map(grab).join('\n'));

/* ── 접을 수 있는 열 ──
   묶어 보기는 꺼 두고 본다. 켜면 구분 열이 자동으로 접히는데, 그것은
   아래 「묶어 보기」 묶음에서 따로 확인한다. */
S.grpOn = false;
ok('접을 수 있는 열은 다섯 (기업·요일 칸·종료는 접지 않는다)',
  COLSET.my.map(c => c[0]).join() === 'cat,pt,st,last,due');
ok('처음에는 업무와 최근 기록이 접혀 있다',
  colHidden('my','pt') === true && colHidden('my','last') === true
  && colHidden('my','cat') === false && colHidden('my','st') === false && colHidden('my','due') === false);
ok('접을 수 없는 열은 언제나 펴져 있다',
  colHidden('my','co') === false && colHidden('my','') === false);

/* ── 켜고 끄기 ── */
STORE = {}; S.cols = undefined;
colToggle('my','last');
ok('접힌 열을 펴면 펴진다', colHidden('my','last') === false);
ok('편 것이 이 브라우저에 저장된다', STORE[COLS_KEY.my] === 'pt');
colToggle('my','st');
ok('펴진 열을 접으면 접힌다', colHidden('my','st') === true);
ok('접힌 목록이 함께 저장된다', STORE[COLS_KEY.my].split(',').sort().join() === 'pt,st');
colToggle('my','co');
ok('접을 수 없는 열은 눌러도 안 바뀐다',
  colHidden('my','co') === false && STORE[COLS_KEY.my].split(',').sort().join() === 'pt,st');

STORE = {}; S.cols = undefined;
colToggle('my','pt'); colToggle('my','last');
ok('전부 펴면 빈 값으로 저장된다', STORE[COLS_KEY.my] === '');
S.cols = undefined;
ok('빈 값은 기본값이 아니라 "전부 펴짐"으로 읽는다 (다시 접히면 편 뜻이 무시된다)',
  colHidden('my','pt') === false && colHidden('my','last') === false);

/* ── 띠와 칩 ── */
STORE = {}; S.cols = undefined; S.F = {};
ok('펴진 열은 보통 칸으로 그린다',
  colTH('my','st', '상태', 'width:74px').indexOf('<th style="width:74px">') === 0
  && colTH('my','st', '상태', 'width:74px').indexOf('상태</th>') > 0
  && colTD('my','st', '<b>진행중</b>') === '<td><b>진행중</b></td>');
/* 펴진 열에도 접는 손잡이가 있어야 한다. 없으면 한 번 편 뒤에는 팝업으로만
   다시 접을 수 있어 접고 펴는 일이 한쪽으로만 된다. */
ok('펴진 열에 접는 손잡이가 붙는다', (function () {
  const h = colTH('my','st', '상태', 'width:74px');
  return h.indexOf('class="cfold"') > 0 && h.indexOf("colToggle('my','st')") > 0 && h.indexOf('‹') > 0;
})());
ok('손잡이를 눌러도 걸러 보기 팝업이 열리지 않는다',
  colTH('my','st', '상태').indexOf('event.stopPropagation();colToggle') > 0);
ok('손잡이는 열 이름보다 앞에 온다 (칸 너비를 밀지 않게)',
  colTH('my','st', '상태').indexOf('cfold') < colTH('my','st', '상태').indexOf('상태'));
ok('접을 수 없는 열에는 손잡이가 없다', colTH('my','co', '기업').indexOf('cfold') < 0);
ok('손잡이 모양이 CSS에 있다', W.indexOf('tr.fhead .cfold{') > 0);
ok('접힌 열은 띠가 되고 눌러서 편다',
  colTH('my','last', '최근 기록').indexOf('class="cband"') > 0
  && colTH('my','last', '최근 기록').indexOf("colToggle('my','last')") > 0
  && colTD('my','last', '기록 없음') === '<td class="cband"></td>');
/* 띠는 폭 14px 세로줄이라 긴 이름은 머리칸 높이를 넘어 위아래가 잘린다.
   띠에만 두 글자로 줄이고, 툴팁에는 본디 이름을 둔다 — 줄인 것만 보이면
   무슨 열인지 알 수 없다. */
ok('띠 이름은 모두 두 글자 (길면 위아래가 잘린다)',
  ['my', 'team'].every(sc => colCols(sc).every(c => (c[2] || c[1]).length <= 2)));
ok('띠에는 줄인 이름이 들어간다', (function () {
  const h = colTH('my', 'last', 'x');
  return h.indexOf('<span class="cbl">기록</span>') > 0;
})());
ok('툴팁에는 본디 이름이 남아 무엇을 접었는지 알 수 있다',
  colTH('my', 'last', 'x').indexOf('title="최근 기록 — 눌러서 폅니다') > 0);
ok('줄일 것이 없는 열은 그대로', colTH('my', 'st', 'x').indexOf('상태') > 0);
/* 이름을 글자 그대로 못 박지 않는다 — 열 이름은 바뀌기 마련이고,
   그때마다 검사가 깨지면 모든 앱의 배포가 함께 막힌다. COLSET에서 끌어다 쓴다. */
ok('팀 띠도 줄인 이름을 쓰고 툴팁에는 본디 이름을 남긴다', (function () {
  const c = colCols('team').filter(x => x[0] === 'log')[0];
  colToggle('team', 'log');                 // 접어야 띠가 된다
  const h = colTH('team', 'log', 'x');
  colToggle('team', 'log');
  return !!c && h.indexOf('<span class="cbl">' + (c[2] || c[1]) + '</span>') > 0
    && h.indexOf('title="' + c[1]) > 0;
})());
ok('목록에는 본디 이름 그대로 (줄인 이름은 띠에만)', (function () {
  const c = colCols('team').filter(x => x[2] && x[2] !== x[1])[0];
  S.colPop = 'team';
  const h = colPopHTML('team');
  S.colPop = '';
  return !!c && h.indexOf('<span>' + c[1] + '</span>') > 0
    && h.indexOf('<span>' + c[2] + '</span>') < 0;
})());
ok('접힌 칸은 내용을 그리지 않는다 (그리면 폭이 안 준다)',
  colTD('my','last', '아주아주 긴 최근 기록 내용').indexOf('아주') < 0);
S.F = { my: { last: ['기록 없음'] } };
ok('조건이 걸린 채 접힌 열에는 점이 붙는다 (왜 안 나오는지 모를 일을 막는다)',
  colTH('my','last', 'x').indexOf('class="cbd"') > 0);
S.F = {};
ok('조건이 없으면 점이 없다', colTH('my','last', 'x').indexOf('class="cbd"') < 0);
/* ── 머리줄은 칩 하나로 ──
   열마다 칩을 하나씩 놓았더니 머리줄에 칩이 여덟 개가 되어 "화면을 편하게" 와
   정반대가 됐다. 자주 누르는 것이 아니므로 팝업 안으로 넣는다. */
S.grpOn = false; STORE = {}; S.cols = undefined;
ok('머리줄에는 열 칩이 하나뿐이다', (function () {
  const h = colBtn('my');
  return (h.match(/chipbtn/g) || []).length === 1 && h.indexOf('▦ 열') > 0;
})());
ok('몇 개를 접었는지 칩에 적는다 (접은 것을 잊지 않게)',
  colBtn('my').indexOf('2 접힘') > 0);
ok('다 펴면 숫자를 안 적는다', (function () {
  colToggle('my','pt'); colToggle('my','last');
  const h = colBtn('my');
  colToggle('my','pt'); colToggle('my','last');
  return h.indexOf('접힘') < 0;
})());
/* 창을 띄우지 않고 칩 바로 아래에 붙는 체크 목록.
   걸러 보기 깔때기와 같은 구조를 써서 여닫는 법을 새로 익히지 않아도 된다. */
S.grpOn = false; S.colPop = false; STORE = {}; S.cols = undefined;
ok('평소에는 목록이 안 붙어 있다', colBtn('my').indexOf('colpop') < 0);
colPop('my');
ok('칩을 누르면 열린다', S.colPop === 'my' && colBtn('my').indexOf('id="colpop"') > 0);
ok('다섯 열이 체크 목록으로 나온다', (function () {
  const h = colPopHTML('my');
  return COLSET.my.every(c => h.indexOf('<span>' + c[1] + '</span>') > 0)
    && (h.match(/type="checkbox"/g) || []).length === 5;
})());
ok('접힌 열은 체크가 꺼져 있다', (function () {
  const h = colPopHTML('my');
  const 업무 = h.slice(h.indexOf("colToggle('my','pt')") - 90, h.indexOf('<span>업무</span>'));
  const 상태 = h.slice(h.indexOf("colToggle('my','st')") - 90, h.indexOf('<span>상태</span>'));
  return 업무.indexOf('checked') < 0 && 상태.indexOf('checked') > 0;
})());
ok('창을 띄우지 않는다 (모달이 아니다)',
  colPopHTML('my').indexOf('showModal') < 0 && W.indexOf('function colModal(') < 0);
ok('뒤판을 누르면 닫힌다', colPopHTML('my').indexOf('class="fbk" onclick="colPopClose()"') > 0);
ok('목록 안을 눌러도 안 닫힌다', colPopHTML('my').indexOf('id="colpop" onclick="event.stopPropagation()"') > 0);
ok('깔때기와 같은 모양을 쓴다 (두 가지를 새로 익히지 않게)',
  colPopHTML('my').indexOf('class="fpop"') > 0 && colPopHTML('my').indexOf('class="fpl"') > 0);
ok('체크하면 그 자리에서 바로 반영된다 ([적용]을 또 누르지 않는다)',
  colPopHTML('my').indexOf("onchange=\"colToggle('my','pt')\"") > 0);
ok('열어 둔 채로 여러 개를 손볼 수 있다', (function () {
  colToggle('my','pt'); return S.colPop === 'my';
})());
colPopClose();
ok('닫으면 닫힌다', !S.colPop && colBtn('my').indexOf('colpop') < 0);
S.grpOn = true; S.colPop = 'my';
ok('묶어 보기가 잡은 줄은 흐리게, 손댈 수 없게', (function () {
  const h = colPopHTML('my');
  return h.indexOf('class="off"') > 0 && h.indexOf('disabled') > 0 && h.indexOf('묶음') > 0;
})());
S.grpOn = false; S.colPop = false; STORE = {}; S.cols = undefined;
ok('표 밖으로 띄운다 (표에 가로 스크롤이 있어 안에 두면 잘린다)',
  grab('colPopPos').indexOf('getBoundingClientRect') > 0);
ok('다시 그린 뒤 자리를 잡아 준다', grab('renderMy').indexOf('if(S.colPop) colPopPos();') > 0);

/* ── 팀 전체도 같은 접기를 쓴다 ──
   열 구성이 서로 다르므로(팀에는 「기록」이 있고 「이번 주」 격자가 없다)
   화면별로 나눠 담는다. 설정도 따로 기억한다 — 내 업무에서 접은 것이
   팀 전체까지 접어 버리면 두 화면을 같이 쓸 수 없다. */
ok('팀 전체에는 기록 열이 더 있다',
  colHas('team', 'log') === true && colHas('my', 'log') === false);
ok('기업·담당·종료는 두 화면 모두 접지 않는다',
  colHas('team', 'co') === false && colHas('team', 'mgr') === false
  && colHas('my', 'co') === false);
STORE = {}; S.cols = undefined; S.grpOn = false;
ok('두 화면이 서로 다른 곳에 기억한다',
  COLS_KEY.my === 'work_my_cols' && !!COLS_KEY.team && COLS_KEY.team !== COLS_KEY.my);
colToggle('team', 'log');
ok('팀에서 접은 것은 팀에만 저장된다',
  STORE[COLS_KEY.team].indexOf('log') >= 0 && !STORE[COLS_KEY.my]);
ok('팀에서 접어도 내 업무는 그대로',
  colHidden('team', 'log') === true && colHidden('my', 'st') === false);
ok('내 업무에 없는 열을 팀에서 접어도 내 업무는 모른다',
  colHidden('my', 'log') === false);
S.grpOn = true;
ok('구분 묶음은 내 업무만의 것이라 팀 구분은 안 잡는다',
  colForced('my', 'cat') === true && colForced('team', 'cat') === false);
S.grpOn = false;
ok('팀 띠도 눌러서 편다', (function () {
  const c = colCols('team').filter(x => x[0] === 'log')[0];
  const h = colTH('team', 'log', '');
  return h.indexOf("colToggle('team','log')") > 0 && h.indexOf(c[1]) > 0;
})());
ok('팀 칩은 팀 목록을 연다', colBtn('team').indexOf("colPop('team')") > 0);
S.colPop = 'team';
ok('팀 목록에는 접을 수 있는 열이 빠짐없이 나온다',
  (colPopHTML('team').match(/type="checkbox"/g) || []).length === colCols('team').length);
ok('한 화면 목록만 열린다 (둘이 겹쳐 뜨지 않게)',
  colBtn('my').indexOf('id="colpop"') < 0 && colBtn('team').indexOf('id="colpop"') > 0);
S.colPop = ''; STORE = {}; S.cols = undefined;

/* 팀 표에 실제로 붙었나 */
const RT = grab('renderTeam');
ok('팀 머리행이 접기를 거친다',
  RT.indexOf("colTH('team',k,fBtn('team',k,vals)+tSort(k),w)") > 0
  && RT.indexOf("if(colHidden('team',k)) return colTH('team',k,'');") > 0);
ok('접을 수 있는 팀 본문 칸은 모두 접기를 거친다',
  colCols('team').every(c => RT.indexOf("colTD('team','" + c[0] + "'") > 0));
ok('팀 칩이 머리줄에 붙는다', RT.indexOf("colBtn('team')+viewChips()") > 0);
ok('팀도 업무명을 접으면 진행률이 기업 칸으로 내려온다',
  RT.indexOf("colHidden('team','pt')?' '+stepChip(it._id)") > 0);
ok('팀도 다시 그린 뒤 목록 자리를 잡아 준다',
  RT.indexOf('if(S.colPop) colPopPos();') > 0);
/* 팀 머리칸 하나에 접기 손잡이·깔때기·정렬이 함께 있다.
   손잡이가 번지면 접으면서 정렬까지 바뀐다. */
ok('접기 손잡이가 정렬로 번지지 않는다',
  colTH('team', 'log', 'x').indexOf('event.stopPropagation();colToggle') > 0);
ok('정렬은 이름 글자에만 걸린다 (빈 자리를 눌러 엉뚱하게 정렬되지 않게)',
  RT.indexOf('<span onclick="teamSort(\\\'') > 0);
/* 접든 펴든 머리행·본문·소제목 colspan 이 같은 칸 수여야 한다(접힌 열도 띠로 한 칸을
   차지한다). 칸 수를 숫자로 못 박으면 열 하나 늘고 줄 때마다 검사가 깨져 모든 앱의
   배포가 막힌다 — renderTeam 이 실제로 그리는 칸을 세어 서로 맞는지만 본다. */
const teamHead = 2 + (RT.match(/\+t[fs]\('/g) || []).length;        // # + 열들 + 종료
const teamBody = 3 + (RT.match(/colTD\('team','/g) || []).length;   // 번호·기업·종료 + 열들
const teamSpan = (RT.match(/colspan="(\d+)"/g) || []).map(s => +s.match(/\d+/)[0]);
ok('팀 머리행과 본문의 칸 수가 같다',
  teamHead > 3 && teamHead === teamBody);
ok('소제목 colspan 도 같은 칸 수 (묶음 머리·빈 목록 두 곳)',
  teamSpan.length >= 2 && teamSpan.every(n => n === teamHead));

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
  colHidden('my','cat') === true);
S.grpOn = false;
ok('끄면 구분 열이 돌아온다', colHidden('my','cat') === false);

/* ── 묶어 보기가 잡고 있는 열은 죽은 단추가 되면 안 된다 ──
   예전에는 구분 칩·띠가 "눌러서 폅니다"라 해 놓고 눌러도 아무 일이 없었고,
   그러면서 접힘 목록에는 몰래 써 두어 묶어 보기를 끄면 까닭 없이 접혀 있었다. */
S.grpOn = true; STORE = {}; S.cols = undefined;
ok('묶어 보기 중에는 구분을 사람이 접고 펴는 대상이 아니라고 본다',
  colForced('my','cat') === true && colForced('my','pt') === false);
colToggle('my','cat');
ok('눌러도 접힘 목록에 몰래 쓰지 않는다 (끄면 까닭 없이 접혀 있게 된다)',
  (STORE[COLS_KEY.my] || '').indexOf('cat') < 0);
S.grpOn = false;
ok('묶어 보기를 끄면 구분이 멀쩡히 펴져 있다', colHidden('my','cat') === false);
S.grpOn = true;
ok('띠는 "펴기"가 아니라 묶음을 푸는 길을 준다', (function () {
  const h = colTH('my','cat', '');
  return h.indexOf('grpToggle()') > 0 && h.indexOf("colToggle('my','cat')") < 0
    && h.indexOf('묶음을 풀면') > 0;
})());
// 사람이 접은 것은 업무·최근 기록 둘뿐이다. 구분까지 세어 3이 되면 안 된다.
ok('묶어 보기가 잡은 열은 접힘 수에 세지 않는다',
  colBtn('my').indexOf('2 접힘') > 0 && colBtn('my').indexOf('3 접힘') < 0);
S.grpOn = false;

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
  RM.indexOf("colTH('my',k,fBtn") > 0 && RM.indexOf("colTH('my','last','최근 기록'") > 0);
ok('접힌 열의 걸러 보기 선택지는 세지 않는다 (헛일이다)',
  RM.indexOf("if(colHidden('my',k)) return colTH('my',k,'');") > 0);
ok('본문 다섯 칸이 접기를 거친다',
  ["colTD('my','cat'", "colTD('my','pt'", "colTD('my','st'", "colTD('my','last'", "colTD('my','due'"].every(s => RH.indexOf(s) > 0));
ok('업무 열을 접으면 진행률이 기업 칸으로 내려온다',
  RH.indexOf("colHidden('my','pt')?'<div class=\"sub\">'+stepChip(it._id)") > 0);
ok('기업 칸은 접히지 않는다', RH.indexOf("colTD('my','co'") < 0);
ok('칩이 표 위에 붙는다', RM.indexOf("colBtn('my')+viewChips()") > 0);

/* ── 캘린더에서 그 날을 골랐을 때 ──
   고른 날이 보고 있는 주가 아니면 그 주로 함께 옮긴다. 예전에는 걸러만 놓고
   주는 그대로 두어, 8/12 를 고르면 표는 8.3~8.7 을 보여 준 채 한 건도 안 남아
   자료가 사라진 것처럼 보였다. */
ok('고른 날이 다른 주면 그 주로 옮긴다',
  grab('calDayOnly').indexOf('!inWeek(S.calDay,S.week)') > 0
  && grab('calDayOnly').indexOf('setWeek(mondayOf(') > 0);
ok('같은 주 안이면 주를 옮기지 않는다 (보던 자리를 지킨다)',
  grab('calDayOnly').indexOf('inWeek(S.calDay,S.week)){ setWeek') > 0);
/* 고른 날은 거르지 않는다 —
   주간 계획을 세우려면 그 주 전체가 보여야 한다. 거르면 그 날 것만 남아
   예측 업무를 옆 요일에 걸 수가 없다. 대신 위로 모으고 그 칸을 밝힌다. */
ok('고른 날로 줄을 거르지 않는다',
  RM.indexOf('base=base.filter(calDayHas)') < 0);
ok('그 날 것을 위로 모으고 나머지는 아래에 둔다',
  RM.indexOf('(calDayHas(it)?hit:rest).push(it)') > 0
  && RM.indexOf('dayHeadHTML(S.calDay,hit.length,NCOL,true)') > 0
  && RM.indexOf("dayHeadHTML('',rest.length,NCOL,false)") > 0);
ok('나머지가 없으면 둘째 소제목을 안 그린다', RM.indexOf('if(rest.length){') > 0);
ok('날을 고르면 구분 묶음은 잠시 물러난다 (두 기준으로 묶으면 알 수 없다)',
  RM.indexOf('else if(S.calDay){') < RM.indexOf('else if(grpOn()){'));
ok('"모두 보기" 띠 안내가 없어졌다 (거르지 않으므로 풀 것이 없다)',
  RM.indexOf('것만 보고 있습니다') < 0 && RM.indexOf('모두 보기 →') < 0);
ok('고른 날은 걸러 보기 조건 수에 넣지 않는다',
  /var on=!!\(S\.q\|\|S\.f\|\|S\.myRole\|\|fAny\('my'\)\)/.test(RM));
ok('소제목에서 고른 날을 바로 놓을 수 있다',
  grab('dayHeadHTML').indexOf("calDayOnly(\\'\\')") > 0
  && grab('dayHeadHTML').indexOf('고른 날 놓기') > 0);
/* 날짜를 누르면 그 칸으로 커서까지 — 누르고 바로 적기 시작할 수 있게 */
ok('그리기가 끝난 뒤에 커서를 잡는다 (그 전에는 칸이 없다)',
  RM.indexOf('if(S._calFocus) setTimeout(calFocusDay,60);') > 0);
ok('고른 날의 첫 칸을 잡는다 — 줄이 그 날 것부터 오므로 가장 관련 있는 줄이다',
  grab('calFocusDay').indexOf(".wkin[data-d=\"'+d+'\"]") > 0);
ok('한 번 잡으면 표시를 지운다 (다시 그릴 때마다 커서를 뺏지 않게)',
  grab('calFocusDay').indexOf("S._calFocus=''") > 0);
CELLS = [{ d: '2026-08-10' }, { d: '2026-08-11' }, { d: '2026-08-12' }];
S.wkSplit = true; S._calFocus = '2026-08-11'; FOCUSED = null;
ok('고른 날 칸에 커서가 잡힌다', calFocusDay() === true && FOCUSED.d === '2026-08-11');
ok('한 번 잡으면 표시를 지운다 (다시 그릴 때마다 커서를 뺏지 않게)', S._calFocus === '');
FOCUSED = null;
ok('표시가 없으면 아무것도 안 한다', calFocusDay() === false && FOCUSED === null);
S._calFocus = '2026-08-11'; S.wkSplit = false; FOCUSED = null;
ok('한 칸 보기에는 날짜 칸이 없으므로 잡지 않는다',
  calFocusDay() === false && FOCUSED === null);
S.wkSplit = true; S._calFocus = '2026-08-31'; FOCUSED = null;
ok('그 주에 없는 날이면 조용히 넘어간다 (터지지 않는다)',
  calFocusDay() === false && FOCUSED === null);
S._calFocus = '';
ok('고른 날 요일 칸을 밝힌다 (어디에 적을지 눈에 들어오게)',
  grab('wkHeadHTML').indexOf("d===S.calDay?' pick':''") > 0
  && grab('wkCellHTML').indexOf("d===S.calDay?' pick':''") > 0
  && W.indexOf('.wkh.pick{') > 0 && W.indexOf('.wkc.pick{') > 0);
ok('팀 전체는 예전대로 거른다 (남이 그 날 무엇을 했는지 보는 화면이다)',
  grab('renderTeam').indexOf('S.calDay&&!calDayHas(it)') > 0);
ok('조건 때문에 빈 경우에는 조건 풀기를 준다',
  RM.indexOf('조건 모두 풀기') > 0);
ok('팀 전체에는 안 붙는다 (내 업무만의 설정이다)',
  grab('renderTeam').indexOf('colChips()') < 0);
ok('띠 모양이 CSS에 있다', W.indexOf('th.cband,td.cband{') > 0 && W.indexOf('.cbl{') > 0);
/* 띠의 세로 글자를 뒤집지 않는다.
   세로쓰기에서 영문은 글자가 눕지만 한글은 똑바로 선다. 영문 기준으로
   rotate(180deg) 를 더 걸면 한글이 거꾸로 보인다 — 실제로 그렇게 나갔었다. */
ok('접힌 열 이름을 뒤집지 않는다 (한글은 세로쓰기만으로 바로 읽힌다)', (function () {
  const i = W.indexOf('th.cband .cbl{');
  const rule = W.slice(i, W.indexOf('}', i));
  return rule.indexOf('vertical-rl') > 0 && rule.indexOf('rotate(') < 0;
})());
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

/* ── 머리행과 본문의 칸 수가 같은가 ──
   어긋나면 표 전체가 한 칸씩 밀린다. 접힌 열도 띠로 한 칸을 차지하므로
   접든 펴든 언제나 9칸이다. 소제목 colspan 도 같아야 한다. */
ok('머리행이 9칸', [
  '\'<th class="rowno">\'', "fh('cat'", "qBox('renderMy','기업'", "fh('pt'", "fh('st'",
  "colTH('my','last'", '\'<th class="wkhd"', "fh('due'", '종료</th>'
].every(s => RM.indexOf(s) > 0));
ok('본문도 9칸', [
  'tdNo(no', "colTD('my','cat'", 'class="itc"', "colTD('my','pt'", "colTD('my','st'",
  "colTD('my','last'", 'class="wkcell', "colTD('my','due'", 'endbtn'
].every(s => RH.indexOf(s) > 0));
ok('소제목 colspan 도 9', /var NCOL=9;/.test(RM));

/* ── 할 일이냐 기록이냐 — 그 칸의 날짜 하나로 정한다 ── */
ok('내일 이후는 할 일',
  isPlanDay('2026-08-08') === true && isPlanDay('2026-12-31') === true);
ok('오늘은 기록 (오늘 할 일은 지금 하는 중이다)', isPlanDay('2026-08-07') === false);
ok('지난 날은 기록', isPlanDay('2026-08-06') === false && isPlanDay('2020-01-01') === false);
ok('날짜가 없으면 기록', isPlanDay('') === false && isPlanDay(null) === false);

/* ── 저장 ── */
SET = null; LOGGED = null;
wkSave('W1', '임금대장 요청', '2026-08-10');
ok('내일 이후 칸에 적으면 할 일이 된다',
  SET && SET.p === 'work_erp/steps/W1/S9' && SET.v.t === '임금대장 요청'
  && SET.v.d === '2026-08-10' && SET.v.done === 0 && LOGGED === null);
ok('요일 칸에서 만든 할 일은 주간 묶음에 들어간다', SET.v.g === PLAN_GROUP);
ok('누가 걸었는지 남는다', SET.v.byName === '김동현');
SET = null; LOGGED = null;
wkSave('W1', '조사관 통화', '2026-08-05');
ok('지난 칸에 적으면 기록이 된다',
  LOGGED && LOGGED.t === '조사관 통화' && LOGGED.d === '2026-08-05' && SET === null);
SET = null; LOGGED = null;
wkSave('W1', '오늘 한 일', '2026-08-07');
ok('오늘 칸도 기록', LOGGED !== null && SET === null);
SET = null;
planAdd('W1', '   ', '2026-08-10');
ok('빈 내용은 저장하지 않는다', SET === null);

/* ── 그리기 ── */
const WC = grab('wkCellHTML'), PR = grab('planRowHTML'), WD = grab('wkDays');
ok('할 일이 그 날 칸에 그려진다', WC.indexOf('planRowHTML(it,s)') > 0);
ok('체크가 만든 기록은 칸에 다시 그리지 않는다 (같은 일이 두 번 보인다)',
  WC.indexOf("if(l.k==='step') return;") > 0);
ok('입력칸이 무엇이 될지 미리 알려 준다',
  WC.indexOf("isPlanDay(d)?'할 일…':'기록…'") > 0);
ok('안 한 계획이 지나면 붉게 남는다 (자동으로 밀지 않는다)',
  PR.indexOf('late=!s.done&&s.d<todayStr()') > 0 && W.indexOf('.wkpl.late .pk') > 0);
ok('체크와 체크 풀기가 같은 자리에서 갈린다',
  PR.indexOf("s.done?'planUncheck':'planCheck'") > 0);
ok('남이 건 할 일에는 이름이 붙는다', PR.indexOf('s.byName') > 0);
ok('토·일은 할 일이 있어도 열린다', WD.indexOf('Object.keys(steps||{})') > 0);
ok('요일 칸 입력이 새 저장 함수를 거친다', grab('wkKey').indexOf('wkSave(id,txt,dateStr)') > 0);
ok('할 일을 지워도 이미 된 기록은 안 지운다', (function () {
  const d = grab('planDel');
  return d.indexOf("'/steps/'") > 0 && d.indexOf('logs') < 0 && d.indexOf('delLog') < 0;
})());
ok('할 일 줄 모양이 CSS에 있다', W.indexOf('.wkpl{') > 0);
ok('끝낸 할 일에는 기록으로 옮기기가 없다 (체크를 풀면 된다)',
  PR.indexOf("s.done?'':'<span class=\"px\" onclick=\"planToLog") > 0);
ok('체크가 만든 기록에는 할 일로 옮기기를 달지 않는다',
  grab('logBtns').indexOf("l.k!=='step'") > 0);

/* ── 체크가 곧 실적 (Promise 를 거치므로 마무리를 안쪽으로 옮긴다) ── */
steps = { W1: { S1: { t: '자료 요청', d: '2026-08-10', done: 0, o: 1 } } };
UPDATED = null; LOGGED = null;
planCheck('W1', 'S1');
setTimeout(function () {
  ok('체크하면 그 날 기록이 생긴다',
    LOGGED && LOGGED.t === '자료 요청' && LOGGED.d === '2026-08-10' && LOGGED.k === 'step');
  ok('체크하면 단계가 끝난 것이 된다',
    UPDATED && UPDATED['work_erp/steps/W1/S1/done'] === 1);
  ok('누가 언제 했는지 남는다',
    UPDATED['work_erp/steps/W1/S1/by'] === '김동현'
    && UPDATED['work_erp/steps/W1/S1/at'] === '2026-08-07');
  ok('어느 기록에서 나온 것인지 남긴다 (체크를 풀 때 그것을 지운다)',
    UPDATED['work_erp/steps/W1/S1/lid'] === 'L9');

  steps = { W1: { S1: { t: '자료 요청', d: '2026-08-10', done: 1, lid: 'L9', o: 1 } } };
  UPDATED = null; DELETED = null;
  planUncheck('W1', 'S1');
  setTimeout(function () {
    ok('체크를 풀면 안 한 것으로 돌아간다', UPDATED['work_erp/steps/W1/S1/done'] === 0);
    ok('체크가 만든 기록은 체크가 거둔다', DELETED && DELETED.lid === 'L9');
    ok('이미 끝난 것을 또 체크하지 않는다', (function () {
      steps = { W1: { S1: { t: 'x', d: '2026-08-10', done: 1, o: 1 } } };
      LOGGED = null; planCheck('W1', 'S1'); return LOGGED === null;
    })());

    /* ── 잘못 들어간 것 옮기기 ── */
    steps = { W1: { S1: { t: '자료 요청', d: '2026-08-10', done: 0, o: 1 } } };
    SET = null; LOGGED = null;
    planToLog('W1', 'S1');
    setTimeout(function () {
      ok('할 일을 기록으로 옮기면 기록이 생기고 할 일은 없어진다',
        LOGGED && LOGGED.t === '자료 요청'
        && SET && SET.p === 'work_erp/steps/W1/S1' && SET.v === null);
      ok('옮긴 기록에는 체크 표시가 없다 (체크로 된 것이 아니다)', LOGGED.k === undefined);

      itemLogsCache = { W1: { L1: { t: '내일 할 일', d: '2026-08-10', by: 'u1', _id: 'L1' } } };
      SET = null; DELETED = null;
      logToPlan('W1', 'L1');
      setTimeout(function () {
        ok('기록을 할 일로 옮기면 그 날짜로 걸리고 기록은 지워진다',
          SET && SET.v.t === '내일 할 일' && SET.v.d === '2026-08-10'
          && DELETED && DELETED.lid === 'L1');

        itemLogsCache = { W1: { L2: { t: '남의 기록', d: '2026-08-10', by: 'u9', byName: '권형하', _id: 'L2' } } };
        SET = null; DELETED = null;
        logToPlan('W1', 'L2');
        ok('남이 쓴 기록은 옮기지 못한다', SET === null && DELETED === null);

        console.log('\n' + (fail ? 'FAILED ' + fail + '/' + (pass + fail) : 'ALL ' + pass + ' PASS'));
        process.exit(fail ? 1 : 0);
      }, 0);
    }, 0);
  }, 0);
}, 0);
