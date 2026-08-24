'use strict';
// 팀 현황판 — node --test tests/team-board.test.js
//
// 왜: 팀 전체가 진행 257건 한 표였다. 스크롤이 유일한 길이라
//     정작 알고 싶은 「누가 밀리고 있나」가 이백 줄 안에 묻혔다.
//     사람이 먼저 오게 바꾼다 — 한 사람 = 한 칸, 눌러야 그 사람의 표가 열린다.
//
// 이 검사가 지키는 것
//   ① 칸의 숫자가 실제 건수와 맞는다 (숫자가 틀리면 이 화면은 쓸모가 없다)
//   ② 눌렀을 때 왜 그것만 보이는지 화면이 말한다
//   ③ 표의 도구(깔때기·정렬·접기)를 현황판까지 끌고 오지 않는다
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'work.html'), 'utf8').replace(/\r\n/g, '\n');
const CSS = src.slice(src.indexOf('<style>') + 7, src.indexOf('</style>'));

function grab(name){
  const i = src.indexOf('function ' + name + '(');
  assert.ok(i >= 0, '못 찾음: ' + name);
  let d = 0, j = i;
  for(;;j++){ if(src[j] === '{') d++; else if(src[j] === '}'){ d--; if(!d){ j++; break; } } }
  return src.slice(i, j);
}

function makeBox(opts){
  opts = opts || {};
  const log = { saved:{}, render:0, filter:null, cleared:[] };
  const box = {
    console, Date, Math, String, Number, Array, Object, isNaN, parseInt,
    S: { fPop:'x', colPop:{} },
    localStorage: {
      getItem(k){ return Object.prototype.hasOwnProperty.call(log.saved, k) ? log.saved[k]
        : (k === 'work_team_view' && opts.stored != null ? opts.stored : null); },
      setItem(k, v){ log.saved[k] = String(v); }
    },
    esc: x => String(x == null ? '' : x).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])),
    escJ: x => String(x == null ? '' : x).replace(/\\/g, '\\\\').replace(/'/g, "\\'"),
    itemDue: (it) => (it && it.due) || '',
    mgrSubNames: (it) => (it && it.subs) || [],
    _dayDiff: (a, b) => Math.round((new Date(a + 'T00:00:00') - new Date(b + 'T00:00:00')) / 86400000),
    wkLogsOf: (id) => (opts.logs || {})[id] || [],
    todayStr: () => opts.today || '2026-08-24',
    fSet(sc, k, v){ log.filter = sc + '|' + k + '|' + [].concat(v).join(','); },
    fClear(sc, k){ log.cleared.push(sc + '|' + k); },
    renderTeam(){ log.render++; }
  };
  box.window = box;
  vm.createContext(box);
  vm.runInContext(
    grab('dday') + '\n'
    + src.match(/var TEAMVIEW_KEY='[^']*';/)[0] + '\n'
    + grab('teamView') + '\n' + grab('setTeamView') + '\n' + grab('teamViewSeg') + '\n'
    + grab('teamOnly') + '\n'
    + grab('teamCardData') + '\n' + grab('teamCardHTML') + '\n' + grab('teamBoardHTML') + '\n'
    + 'this.data=teamCardData; this.card=teamCardHTML; this.board=teamBoardHTML;', box);
  box._log = log;
  return box;
}

/* 여덟 건 — 사람 셋, 사정이 저마다 다르다 (오늘 = 2026-08-24) */
const 업무 = [
  { _id:'a', mgr_main:{name:'권형하'}, due:'2026-08-10', last:{d:'2026-08-23'} },   // 지남
  { _id:'b', mgr_main:{name:'권형하'}, due:'2026-08-27', last:{d:'2026-08-01'} },   // 임박 + 방치
  { _id:'c', mgr_main:{name:'권형하'}, due:'2026-12-01', last:null },               // 기록 아예 없음 → 방치
  { _id:'d', mgr_main:{name:'김혜민'}, due:'2026-08-31', last:{d:'2026-08-24'} },   // 임박(D-7)
  { _id:'e', mgr_main:{name:'김혜민'}, due:'', last:{d:'2026-08-20'} },             // 기한 없음
  { _id:'f', mgr_main:{name:'김윤희'}, due:'2026-09-30', last:{d:'2026-08-22'} },
  { _id:'g', mgr_main:{name:'김윤희'}, due:'2026-08-24', last:{d:'2026-08-22'}, subs:['권형하'] },
  { _id:'h', mgr_main:null,            due:'', last:{d:'2026-08-22'} }              // 담당 미지정
];
const 기록 = { a:[{d:'2026-08-24'}], f:[{d:'2026-08-23'}] };
const 칸 = () => {
  const box = makeBox({ logs:기록 });
  const out = {};
  Array.from(box.data(업무, 'wk', '2026-08-24')).forEach(c => { out[c.nm] = c; });
  return out;
};

/* ────────────────────────────────────────────────
   ① 숫자가 맞는다
   ──────────────────────────────────────────────── */
test('한 사람 = 한 칸, 주담당 건수가 큰 숫자다', () => {
  const c = 칸();
  assert.equal(c['권형하'].main, 3);
  assert.equal(c['김혜민'].main, 2);
  assert.equal(c['김윤희'].main, 2);
});

test('담당이 없는 건도 사라지지 않는다 — 「(담당 미지정)」 칸으로 간다', () => {
  assert.equal(칸()['(담당 미지정)'].main, 1);
});

test('부담당으로 붙어 있는 건도 그 사람 칸에 센다 — 주담당이 아니어도 하는 일이다', () => {
  const c = 칸();
  assert.equal(c['권형하'].sub, 1, 'g 는 김윤희가 주담당, 권형하가 부담당');
  assert.equal(c['김윤희'].sub, 0);
});

test('부담당 건은 큰 숫자에 섞지 않는다 — 아래 담당별 묶음과 기준이 어긋나면 안 된다', () => {
  assert.equal(칸()['권형하'].main, 3, '부담당 1건을 더해 4가 되면 안 된다');
});

test('기한이 지난 것과 임박한 것을 가른다', () => {
  const c = 칸();
  assert.equal(c['권형하'].over, 1, 'a(8/10)만 지났다');
  assert.equal(c['권형하'].soon, 1, 'b(8/27)가 임박');
  assert.equal(c['김혜민'].over, 0);
  assert.equal(c['김혜민'].soon, 1, 'd(8/31)는 D-7');
});

test('오늘이 기한인 것은 「지남」이 아니라 「임박」이다', () => {
  assert.equal(칸()['김윤희'].soon, 1, 'g 는 오늘(8/24)이 기한');
  assert.equal(칸()['김윤희'].over, 0);
});

test('기한이 없는 건은 지남에도 임박에도 안 들어간다 — 없는 기한을 지어내지 않는다', () => {
  const c = 칸();
  assert.equal(c['김혜민'].over + c['김혜민'].soon, 1, 'e 는 기한이 없다');
});

test('마지막 기록이 2주 넘게 묵었으면 방치로 센다', () => {
  assert.equal(칸()['권형하'].stale, 2, 'b(8/1)와 c(기록 없음)');
});

test('기록이 아예 없는 건도 방치다 — 「아직 아무도 손대지 않았다」가 가장 위험하다', () => {
  const one = makeBox({}).data([{ _id:'z', mgr_main:{name:'홍길동'}, last:null }], 'wk', '2026-08-24');
  assert.equal(Array.from(one)[0].stale, 1);
});

test('이 주에 기록을 쓴 건수를 센다', () => {
  const c = 칸();
  assert.equal(c['권형하'].rec, 1);
  assert.equal(c['김윤희'].rec, 1);
  assert.equal(c['김혜민'].rec, 0);
});

/* ────────────────────────────────────────────────
   ② 순서 — 손봐야 할 사람이 위로
   ──────────────────────────────────────────────── */
test('기한 지난 것이 있는 사람이 맨 위 — 그것이 가장 급하다', () => {
  const box = makeBox({ logs:기록 });
  assert.equal(Array.from(box.data(업무, 'wk', '2026-08-24'))[0].nm, '권형하');
});

test('사정이 같으면 이름 순 — 볼 때마다 자리가 뒤집히지 않게', () => {
  const box = makeBox({});
  const rows = [
    { _id:'1', mgr_main:{name:'나나'}, last:{d:'2026-08-23'} },
    { _id:'2', mgr_main:{name:'가가'}, last:{d:'2026-08-23'} }
  ];
  assert.equal(Array.from(box.data(rows, 'wk', '2026-08-24')).map(c => c.nm).join(','), '가가,나나');
});

/* ────────────────────────────────────────────────
   ③ 칸의 모양
   ──────────────────────────────────────────────── */
test('칸을 누르면 그 사람만 표로 간다', () => {
  const html = makeBox({ logs:기록 }).card(칸()['권형하']);
  assert.match(html, /onclick="teamOnly\('권형하'\)"/);
});

test('눈여겨볼 것이 없으면 그렇게 말한다 — 빈 칸으로 두지 않는다', () => {
  const box = makeBox({});
  const c = Array.from(box.data([{ _id:'1', mgr_main:{name:'가가'}, due:'2026-12-01', last:{d:'2026-08-23'} }],
    'wk', '2026-08-24'))[0];
  assert.match(box.card(c), /눈여겨볼 것 없음/);
});

test('부담당 건수는 있을 때만 적는다', () => {
  const box = makeBox({ logs:기록 });
  const c = 칸();
  assert.match(box.card(c['권형하']), /\+ 부담당 1건/);
  assert.ok(box.card(c['김윤희']).indexOf('부담당') < 0, '0건인데 적으면 눈만 어지럽다');
});

test('이 주 기록은 몇 개 중 몇 개인지 함께 적는다 — 퍼센트만으로는 크기를 모른다', () => {
  assert.match(makeBox({ logs:기록 }).card(칸()['권형하']), /이 주 기록 1\/3건/);
});

test('보여줄 사람이 없으면 빈 화면 대신 한 줄을 남긴다', () => {
  assert.match(makeBox({}).board([], 'wk', '2026-08-24'), /진행 중인 업무가 없습니다/);
});

/* ────────────────────────────────────────────────
   ④ 현황판과 표 사이
   ──────────────────────────────────────────────── */
test('팀 전체는 현황판으로 열린다 — 이백 줄 표가 먼저 오지 않는다', () => {
  assert.equal(makeBox({}).teamView(), 'board');
  assert.equal(makeBox({ stored:'table' }).teamView(), 'table');
  assert.equal(makeBox({ stored:'gallery' }).teamView(), 'board', '모르는 값은 현황판으로');
});

test('칸을 누르면 그 사람으로 걸러 표를 연다', () => {
  const box = makeBox({});
  box.teamOnly('김혜민');
  assert.equal(box._log.filter, 'team|mgr|김혜민');
  assert.equal(box._log.saved['work_team_view'], 'table');
  assert.equal(box._log.render, 1);
});

test('현황판으로 돌아가면 담당 조건을 푼다 — 칸의 숫자와 표의 숫자가 어긋나 읽히지 않게', () => {
  const box = makeBox({});
  box.setTeamView('board');
  assert.equal(box._log.cleared.join(','), 'team|mgr');
});

test('표로 갈 때는 걸어 둔 조건을 건드리지 않는다', () => {
  const box = makeBox({});
  box.setTeamView('table');
  assert.equal(box._log.cleared.length, 0);
});

test('보기를 바꾸면 표 머리에 떠 있던 팝업을 닫는다', () => {
  const box = makeBox({});
  box.setTeamView('table');
  assert.equal(box.S.fPop, '');
  assert.equal(box.S.colPop, null);
});

test('고르는 단추는 이미 쓰던 세그먼트 모양 그대로', () => {
  const html = makeBox({ stored:'table' }).teamViewSeg();
  assert.match(html, /class="vseg"/);
  assert.match(html, /현황판/);
  assert.match(html, /class="on" onclick="setTeamView\('table'\)"/);
});

/* ────────────────────────────────────────────────
   ⑤ 화면에 실제로 달려 있다
   ──────────────────────────────────────────────── */
const RT = src.slice(src.indexOf('function renderTeam(){'), src.indexOf('function teamSort('));

test('현황판이면 표를 만들지 않고 끝낸다 — 만들고 버리면 이백 줄을 헛그린다', () => {
  const i = RT.indexOf("if(_tv==='board'){");
  assert.ok(i > 0, '갈림길을 못 찾음');
  assert.ok(i < RT.indexOf('<div class="panel tbl" id="teamtbl"'), '표를 만들기 전에 갈라진다');
  assert.match(RT.slice(i, i + 500), /teamBoardHTML\(open,wk,today\)/);
  assert.match(RT.slice(i, i + 500), /return;/);
});

test('현황판에는 표의 도구를 끌고 오지 않는다 (깔때기·정렬·접기)', () => {
  const i = RT.indexOf("if(_tv==='board'){");
  const 조각 = RT.slice(i, RT.indexOf('return;', i));
  ['fBtn(', 'teamFoldAll', 'teamSort', 'colBtn'].forEach(t =>
    assert.ok(조각.indexOf(t) < 0, t + ' 이 현황판까지 따라왔다'));
});

test('열 접기 단추는 표일 때만 낸다 — 현황판에는 접을 열이 없다', () => {
  assert.match(RT, /\(_tv==='table'\?colBtn\('team'\):''\)/);
});

test('현황판에서도 어느 주를 보고 있는지는 알려 준다', () => {
  const i = RT.indexOf("if(_tv==='board'){");
  assert.match(RT.slice(i, RT.indexOf('return;', i)), /isCurWeek\(\)/);
});

test('한 사람만 걸러 보는 중이면 그렇게 말하고 돌아갈 길을 준다', () => {
  assert.match(RT, /님이 맡은 업무만 보고 있습니다 \(주담당·부담당 모두\)/);
  // 소스에서는 작은따옴표가 escape 되어 있다: setTeamView(\'board\')
  assert.match(RT, /setTeamView\(\\'board\\'\)">현황판으로 →/);
});

test('칸 모양이 CSS에 있다', () => {
  ['.tmwrap{', '.tmc{', '.tmsig .over{', '.tmsig .soon{', '.tmsig .stale{', '.tmbar{'].forEach(c =>
    assert.ok(CSS.indexOf(c) >= 0, c + ' 없음'));
  assert.match(CSS, /\.tmwrap\{[^}]*auto-fill/, '창 너비에 따라 칸 수가 정해진다');
});
