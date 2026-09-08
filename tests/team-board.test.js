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

/* ⚠ 시계를 멈춰 둔다 — 이 검사는 「오늘 = 2026-08-24」를 딛고 서 있다.
   work.html 의 dday() 는 new Date() 로 «진짜 오늘» 을 본다. 그래서 이 파일은
   2026-08-25 0시에 저절로 깨졌다(g 의 기한 8/24 가 「임박」에서 「지남」이 됐다).
   ★ 고칠 것은 기댓값이 아니라 «검사가 시계를 타는 것» 이다 — 날짜를 못 박아 둔다.
     안 그러면 자정마다 아무도 안 건드린 검사가 빨갛게 되고, 다음 사람은
     자기가 무엇을 망가뜨렸는지 한참 찾는다. */
const 오늘 = '2026-08-24T09:00:00+09:00';
class 멈춘시계 extends Date {
  constructor(){ if(arguments.length === 0) super(오늘); else super(...arguments); }
  static now(){ return new Date(오늘).getTime(); }
}

function makeBox(opts){
  opts = opts || {};
  const log = { saved:{}, render:0, filter:null, cleared:[] };
  const box = {
    console, Date: 멈춘시계, Math, String, Number, Array, Object, isNaN, parseInt,
    S: { fPop:'x', colPop:{} },
    localStorage: {
      getItem(k){ return Object.prototype.hasOwnProperty.call(log.saved, k) ? log.saved[k]
        : (k === 'work_team_view' && opts.stored != null ? opts.stored : null); },
      setItem(k, v){ log.saved[k] = String(v); }
    },
    esc: x => String(x == null ? '' : x).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])),
    escJ: x => String(x == null ? '' : x).replace(/\\/g, '\\\\').replace(/'/g, "\\'"),
    itemDue: (it) => (it && it.due) || '',
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
    /* 2026-09-05 — 자문은 「2주+ 방치」에서 뺀다(countsLog). 그 잣대가
       teamCardData 안에서 도니 함께 실어 준다. 자문 자체는 tests/advisory-work.test.js 가 본다. */
    grab('catNorm') + '\n' + grab('countsLog') + '\n'
    + src.match(/var KIND_ALIAS=\{[^}]*\};/)[0] + '\n'
    + grab('dday') + '\n' + grab('mgrSubNames') + '\n'
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
  { _id:'g', mgr_main:{name:'김윤희'}, due:'2026-08-24', last:{d:'2026-08-22'},
    // ⚠ 부담당 칸에는 사람 아닌 것이 섞여 있다 — 엑셀 이관이 명부와 대조 없이 담았다
    mgr_subs:[{sid:'',name:'권형하'},{sid:'',name:'- 전화번호 : 042-520-8062'}] },
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

/* ⚠ 이 화면이 처음 나갔을 때 열두 사람 자리에 마흔 칸이 깔렸다.
   부담당 칸에 사람 아닌 글(「- 전화번호 : 042-…」, 「① 노동청」, 「- 조사관 : …」)이
   섞여 있는데, 그것들로도 칸을 만들었기 때문이다.
   엑셀 이관이 「공동작업자」 칸의 글을 명부와 대조 없이 그대로 담은 탓이다. */
test('사람 아닌 부담당은 칸을 만들지 않는다 — 열두 사람 자리에 마흔 칸이 깔렸던 일', () => {
  const c = 칸();
  assert.ok(!c['- 전화번호 : 042-520-8062'], '전화번호가 사람 칸을 차지했다');
  assert.equal(Object.keys(c).sort().join(','), '(담당 미지정),권형하,김윤희,김혜민');
});

test('주담당 건이 하나도 없으면 칸이 없다 — 담당별 묶음(teamNames)과 같은 규칙', () => {
  const box = makeBox({});
  const rows = [{ _id:'1', mgr_main:{name:'가가'}, last:{d:'2026-08-23'},
    mgr_subs:[{sid:'',name:'① 노동청'},{sid:'',name:'나나'}] }];
  const got = Array.from(box.data(rows, 'wk', '2026-08-24')).map(c => c.nm);
  assert.equal(got.join(','), '가가', '부담당으로만 등장한 이름은 칸을 못 만든다');
});

test('쓰레기가 아무리 많아도 칸 수는 사람 수 그대로다', () => {
  const box = makeBox({});
  const 쓰레기 = ['- 사업장 : 광유엔지니어링', '(010-1200-0010)', '② 노동위원회', '- 차의환 부장'];
  const rows = 쓰레기.map((g, i) => ({ _id:'r' + i, mgr_main:{name:'가가'}, last:{d:'2026-08-23'},
    mgr_subs:[{sid:'',name:g}] }));
  assert.equal(Array.from(box.data(rows, 'wk', '2026-08-24')).length, 1);
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

/* ⚠ 배지는 «드문 일» 에만 쓴다.
   처음에는 방치도 배지로 냈는데, 지금 팀은 이백오십칠 건이 «모두» 방치라
   칸마다 회색 딱지가 붙어 눈에 걸리는 것이 하나도 없었다.
   모두에게 똑같이 붙는 표시는 아무것도 구별해 주지 않으면서 자리만 차지한다. */
test('방치는 배지가 아니라 아래 회색 한 줄로 — 모두에게 붙는 표시는 배지가 못 된다', () => {
  const box = makeBox({ logs:기록 });
  const html = box.card(칸()['권형하']);
  assert.ok(html.indexOf('class="s stale"') < 0, '방치 배지가 남아 있다');
  assert.match(html, /class="tmrec"[^>]*>이 주 기록 1\/3 · 방치/);
});

test('방치에 분모를 함께 적는다 — 「방치 75」 만으로는 전부인지 일부인지 모른다', () => {
  const box = makeBox({ logs:기록 });
  assert.match(box.card(칸()['권형하']), /방치 2\/3/);
});

test('전부 방치면 굵게 — 일부만 방치인 것과 눈으로 갈린다', () => {
  const box = makeBox({});
  const c = Array.from(box.data([{ _id:'1', mgr_main:{name:'가가'}, last:null }], 'wk', '2026-08-24'))[0];
  assert.match(box.card(c), /방치 <b>1<\/b>\/1/);
});

test('눈여겨볼 것이 없으면 배지 줄을 아예 그리지 않는다 — 조용한 것이 「괜찮다」는 뜻', () => {
  const box = makeBox({});
  const c = Array.from(box.data([{ _id:'1', mgr_main:{name:'가가'}, due:'2026-12-01', last:{d:'2026-08-23'} }],
    'wk', '2026-08-24'))[0];
  const html = box.card(c);
  assert.ok(html.indexOf('class="tmsig"') < 0, '빈 배지 줄이 자리만 차지한다');
  assert.ok(html.indexOf('눈여겨볼 것 없음') < 0, '괜찮다는 말을 굳이 적지 않는다');
});

test('부담당 건수는 있을 때만 적는다', () => {
  const box = makeBox({ logs:기록 });
  const c = 칸();
  assert.match(box.card(c['권형하']), /\+ 부담당 1건/);
  assert.ok(box.card(c['김윤희']).indexOf('부담당') < 0, '0건인데 적으면 눈만 어지럽다');
});

test('이 주 기록은 몇 개 중 몇 개인지 함께 적는다 — 퍼센트만으로는 크기를 모른다', () => {
  assert.match(makeBox({ logs:기록 }).card(칸()['권형하']), /이 주 기록 1\/3/);
});

test('기한이 지났거나 임박한 것은 배지로 낸다 — 이건 드문 일이다', () => {
  const html = makeBox({ logs:기록 }).card(칸()['권형하']);
  assert.match(html, /class="s over">지남 1</);
  assert.match(html, /class="s soon">임박 1</);
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
  const 갈림길 = RT.slice(i, RT.indexOf('return;', i) + 7);   // 길이를 못 박지 않는다 — 안이 늘어난다
  assert.match(갈림길, /teamBoardHTML\(open,wk,today\)/);
  assert.match(갈림길, /return;/);
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

/* ────────────────────────────────────────────────
   ⑥ 부담당 칸 정리 — 사람을 실수로 지우지 않는 것이 전부다
   ──────────────────────────────────────────────── */
function junkBox(opts){
  opts = opts || {};
  const log = { updated:null, toast:[], render:0, modal:'' };
  const box = {
    console, String, Array, Object, Number,
    S: {}, NS: 'work_erp',
    esc: x => String(x == null ? '' : x).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])),
    ownerOptions: () => opts.people || [],
    allItems: () => opts.items || [],
    mgrSubNames: (it) => ((it && it.mgr_subs) || []).map(s => s && s.name).filter(Boolean),
    showModal(h){ log.modal = h; },
    closeM(){},
    toast(m){ log.toast.push(String(m)); },
    renderTeam(){ log.render++; },
    $: () => null,
    fbDb: { ref(){ return { update(u){ log.updated = u; return Promise.resolve(); } }; } },
    document: { querySelectorAll: () => (opts.checked || []) }
  };
  box.window = box;
  vm.createContext(box);
  vm.runInContext(
    grab('subJunkList') + '\n' + grab('subJunkModal') + '\n' + grab('subJunkRun') + '\n'
    + 'this.list=subJunkList; this.modal=subJunkModal; this.run=subJunkRun;', box);
  box._log = log;
  return box;
}

const 명부 = [{ name:'권형하' }, { name:'김혜민' }, { name:'임혜미' }];
const 더러운건 = [
  { _id:'1', company:'㈜가나', mgr_subs:[{name:'김혜민'},{name:'- 전화번호 : 042-520-8062'}] },
  { _id:'2', company:'다라',   mgr_subs:[{name:'- 전화번호 : 042-520-8062'}] },
  { _id:'3', company:'㈜마바', mgr_subs:[{name:'① 노동청'},{name:'임혜미'}] },
  { _id:'4', company:'사아',   mgr_subs:[] }
];

test('명부에도 없고 주담당으로도 나온 적 없는 이름만 「사람 아님」으로 본다', () => {
  const L = Array.from(junkBox({ people:명부, items:더러운건 }).list());
  assert.equal(L.map(x => x.name).join(','), '- 전화번호 : 042-520-8062,① 노동청');
});

test('퇴직자도 지우지 않는다 — ownerOptions 가 주담당으로 나온 이름을 함께 준다', () => {
  // 임혜미는 재직 명부에서 빠져도 주담당으로 등장하면 ownerOptions 에 들어온다
  const L = Array.from(junkBox({ people:[{ name:'권형하' }, { name:'임혜미' }], items:더러운건 }).list());
  assert.ok(L.every(x => x.name !== '임혜미'));
});

test('많이 붙은 것이 위로 — 어느 것이 큰 문제인지 먼저 보인다', () => {
  const L = Array.from(junkBox({ people:명부, items:더러운건 }).list());
  assert.equal(L[0].n, 2);
  assert.equal(L[1].n, 1);
});

test('어느 업무에 붙어 있었는지 한 건을 보여 준다 — 이름만으로는 사람인지 알기 어렵다', () => {
  const L = Array.from(junkBox({ people:명부, items:더러운건 }).list());
  assert.equal(L[0].ex, '㈜가나');
});

test('⚠ 명부를 못 읽었으면 아무것도 판정하지 않는다 — 전원을 「사람 아님」으로 몰면 큰일', () => {
  assert.equal(Array.from(junkBox({ people:[], items:더러운건 }).list()).length, 0);
});

test('이름 모양으로 짐작하지 않는다 — 「서경숙 팀장」도 명부에 있으면 그대로 둔다', () => {
  const L = Array.from(junkBox({
    people:[{ name:'서경숙 팀장' }],
    items:[{ _id:'1', mgr_subs:[{name:'서경숙 팀장'}] }]
  }).list());
  assert.equal(L.length, 0);
});

test('지우기 전에 반드시 목록을 보여 준다', () => {
  const box = junkBox({ people:명부, items:더러운건 });
  box.modal();
  assert.match(box._log.modal, /042-520-8062/);
  assert.match(box._log.modal, /① 노동청/);
  assert.match(box._log.modal, /사람이 섞여 있지 않은지 꼭 확인/);
  assert.match(box._log.modal, /업무·기록·노트는 그대로/, '무엇이 지워지는지 분명히 한다');
});

test('체크한 것만 지운다 — 체크를 푼 이름은 그대로 남는다', () => {
  const box = junkBox({ people:명부, items:더러운건,
    checked:[{ checked:true, getAttribute:() => '0' }, { checked:false, getAttribute:() => '1' }] });
  box.modal();
  box.run();
  const up = box._log.updated;
  assert.ok(up, '쓰기가 없었다');
  // 1번: 김혜민만 남는다 / 2번: 하나도 안 남아 null / 3번은 ① 노동청을 체크 안 했으니 손대지 않는다
  assert.equal(Object.keys(up).sort().join(','), 'work_erp/items/1/mgr_subs,work_erp/items/2/mgr_subs');
  assert.equal(Array.from(up['work_erp/items/1/mgr_subs']).map(s => s.name).join(','), '김혜민');
  assert.equal(up['work_erp/items/2/mgr_subs'], null, '빈 배열 대신 null 로 지운다');
});

test('아무것도 안 골랐으면 지우지 않고 그렇게 말한다', () => {
  const box = junkBox({ people:명부, items:더러운건,
    checked:[{ checked:false, getAttribute:() => '0' }] });
  box.modal();
  box.run();
  assert.equal(box._log.updated, null);
});

test('지울 것이 없으면 「없습니다」라고 하고 끝낸다', () => {
  const box = junkBox({ people:명부, items:[{ _id:'1', mgr_subs:[{name:'김혜민'}] }] });
  box.modal();
  assert.match(box._log.modal, /사람이 아닌 부담당이 없습니다/);
});

test('현황판에서 그 길을 낸다 — 있을 때만, 대표에게만', () => {
  const i = RT.indexOf("if(_tv==='board'){");
  const 조각 = RT.slice(i, RT.indexOf('return;', i));
  assert.match(조각, /if\(isAdmin\(\)\)\{/, '고칠 수 없는 사람에게 알려 봐야 걱정만 남는다');
  assert.match(조각, /if\(_sj\.length\)/, '없으면 띠도 없다');
  assert.match(조각, /subJunkModal\(\)/);
});

test('칸 모양이 CSS에 있다', () => {
  ['.tmwrap{', '.tmc{', '.tmsig .over{', '.tmsig .soon{', '.tmrec{'].forEach(c =>
    assert.ok(CSS.indexOf(c) >= 0, c + ' 없음'));
  assert.match(CSS, /\.tmwrap\{[^}]*auto-fill/, '창 너비에 따라 칸 수가 정해진다');
  assert.ok(CSS.indexOf('.tmsig .stale{') < 0, '안 쓰는 규칙은 남기지 않는다');
  assert.ok(CSS.indexOf('.tmbar{') < 0, '늘 비어 있는 막대는 줄 하나만 더 먹었다');
});
