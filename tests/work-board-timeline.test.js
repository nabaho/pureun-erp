'use strict';
// 보드(칸반)·타임라인 — node --test tests/work-board-timeline.test.js
//
// 왜: 「노션처럼」 보고 싶다는 요청. 표 하나뿐이던 내 업무 화면에
//     보드와 타임라인을 더했다. 셋은 «같은 목록»을 다른 모양으로 보여 줄 뿐이다.
//
// 이 검사가 지키려는 것 세 가지
//   ① 보드에서 업무가 사라지지 않는다 — 모르는 상태값도 「그 밖」 칸에 담긴다
//   ② 끌어 놓기가 표에서 쓰던 저장 길(setStatus)을 그대로 탄다 — 몰래 다른 데 쓰지 않는다
//   ③ 타임라인이 없는 기한을 지어내지 않는다 — 기한이 없으면 막대 대신 점
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'work.html'), 'utf8').replace(/\r\n/g, '\n');
const CSS = src.slice(src.indexOf('<style>') + 7, src.indexOf('</style>'));

// 함수 하나를 중괄호 짝을 세어 통째로 떠 온다 — 손으로 옮겨 적으면 검사만 통과할 수 있다
function grab(name){
  const i = src.indexOf('function ' + name + '(');
  assert.ok(i >= 0, '못 찾음: ' + name);
  let d = 0, j = i;
  for(;;j++){ if(src[j] === '{') d++; else if(src[j] === '}'){ d--; if(!d){ j++; break; } } }
  return src.slice(i, j);
}

/* ── 실제 소스를 그대로 돌릴 상자 ── */
function makeBox(opts){
  opts = opts || {};
  const log = { toast:[], status:[], route:0, saved:{} };
  const classes = {};                       // 흉내 낸 DOM: 칸마다 붙은 표시
  const box = {
    console, Date, Math, String, Number, Array, Object, JSON, isNaN, parseInt, parseFloat,
    items: opts.items || {},
    S: { fPop:{x:1}, colPop:{y:1} },
    localStorage: {
      getItem(k){ return Object.prototype.hasOwnProperty.call(log.saved, k) ? log.saved[k] : (opts.stored != null && k === 'work_my_mode' ? opts.stored : null); },
      setItem(k, v){ log.saved[k] = String(v); }
    },
    document: {
      querySelector(){ return null; },
      querySelectorAll(){ return []; }
    },
    $(id){ classes[id] = classes[id] || []; return { classList:{
      add(c){ if(classes[id].indexOf(c) < 0) classes[id].push(c); },
      remove(c){ classes[id] = classes[id].filter(x => x !== c); }
    } }; },
    toast(m, k){ log.toast.push(String(m) + '|' + (k || '')); },
    setStatus(id, st){ log.status.push(id + '→' + st); },
    route(){ log.route++; },
    openDrawer(){},
    esc: x => String(x == null ? '' : x).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])),
    escJ: x => String(x == null ? '' : x).replace(/\\/g, '\\\\').replace(/'/g, "\\'"),
    briefTrim: x => String(x || '').slice(0, 40),
    viewer: () => 'u1',
    roleOf: (it) => (it && it.sub ? 'sub' : 'main'),
    itemDue: (it) => (it && it.due) || '',
    stepsOf: (id) => (opts.steps || {})[id] || [],
    todayStr: () => opts.today || '2026-08-16'
  };
  box.window = box;
  vm.createContext(box);
  vm.runInContext(
    src.slice(src.indexOf('var CATS={'), src.indexOf('function catNorm(')) + '\n'
    + grab('catNorm') + '\n' + grab('catColor') + '\n' + grab('catBadge') + '\n'
    + src.match(/var STATUSES=\[[\s\S]*?\]\];/)[0] + '\n'
    + grab('dday') + '\n' + grab('ddayHTML') + '\n'
    + src.match(/var MYMODE_KEY='[^']*';/)[0] + '\n'
    + grab('myMode') + '\n' + grab('setMyMode') + '\n' + grab('myModeSeg') + '\n'
    + grab('bdCols') + '\n' + grab('bdCardHTML') + '\n' + grab('myBoardHTML') + '\n'
    + 'var _bdDrag=null;\n'
    + grab('bdDragStart') + '\n' + grab('bdDragEnd') + '\n'
    + grab('bdOver') + '\n' + grab('bdLeave') + '\n' + grab('bdDrop') + '\n'
    + grab('tlDay') + '\n' + grab('tlRange') + '\n' + grab('myTimelineHTML') + '\n'
    + 'this.setDrag=function(v){_bdDrag=v;}; this.getDrag=function(){return _bdDrag;};', box);
  box._log = log;
  box._classes = classes;
  return box;
}

const 표본 = {
  a: { id:'a', cat:'부해',   company:'㈜가나',  title:'부당해고 구제신청', status:'진행중',   start:'2026-08-01', due:'2026-08-20' },
  b: { id:'b', cat:'체불',   company:'다라',    title:'임금체불 진정',     status:'진행중',   start:'2026-08-05', due:'2026-08-18' },
  c: { id:'c', cat:'컨설팅', company:'㈜마바',  title:'현장클리닉',        status:'대기응답', start:'2026-08-02', due:'' },
  d: { id:'d', cat:'기금',   company:'사아㈜',  title:'기금 설립',         status:'검토',     start:'',           due:'2026-09-01' },
  e: { id:'e', cat:'급여',   company:'자차',    title:'급여 이관',         status:'옛날상태', start:'2026-08-03', due:'2026-08-25' }
};
const 목록 = Object.keys(표본).map(k => 표본[k]);

/* ────────────────────────────────────────────────────────────
   ① 어떤 모양으로 볼지 — 기억은 하되, 모르는 값은 표로 되돌린다
   ──────────────────────────────────────────────────────────── */
test('처음 들어오면 표 보기다 — 갑자기 낯선 화면이 뜨지 않는다', () => {
  assert.equal(makeBox({}).myMode(), 'table');
});

test('보드·타임라인만 기억한다 — 엉뚱한 값이 들어 있으면 표로 돌아간다', () => {
  assert.equal(makeBox({ stored:'board' }).myMode(), 'board');
  assert.equal(makeBox({ stored:'timeline' }).myMode(), 'timeline');
  assert.equal(makeBox({ stored:'gallery' }).myMode(), 'table', '없는 보기는 표로');
  assert.equal(makeBox({ stored:'' }).myMode(), 'table');
});

test('보기를 바꾸면 표 머리에 떠 있던 팝업을 닫는다', () => {
  const box = makeBox({});
  box.setMyMode('board');
  assert.equal(box.S.fPop, null, '걸러 보기 팝업이 갈 곳을 잃는다');
  assert.equal(box.S.colPop, null);
  assert.equal(box._log.route, 1, '화면을 다시 그린다');
  assert.equal(box.myMode(), 'board', '다음에 올 때도 기억한다');
});

test('보기 고르는 단추가 세 개 — 표·보드·타임라인', () => {
  const html = makeBox({ stored:'board' }).myModeSeg();
  assert.match(html, /class="vseg"/, '이미 쓰던 세그먼트 모양 그대로');
  ['표', '보드', '타임라인'].forEach(n => assert.ok(html.indexOf('>' + n + '<') > 0, n + ' 없음'));
  assert.match(html, /class="on" onclick="setMyMode\('board'\)"/, '지금 보기에 표시가 붙는다');
});

test('내 업무 머리에 그 단추가 실제로 달려 있다', () => {
  const i = src.indexOf('\'<div class="row hdr-my"');      // CSS 쪽 hdr-my 가 아니라 실제로 그리는 곳
  assert.ok(i > 0, '내 업무 머리를 못 찾음');
  const 머리 = src.slice(i, src.indexOf("+'</div>'", i));   // 그 머리 한 줄을 짓는 동안
  assert.ok(머리.indexOf('myModeSeg()') > 0, '만들어만 두고 안 붙이면 소용없다');
});

/* ────────────────────────────────────────────────────────────
   ② 보드 — 업무가 한 건도 사라지지 않는다
   ──────────────────────────────────────────────────────────── */
test('칸은 이미 정해진 상태(STATUSES)를 그대로 쓴다 — 색도 이름도 새로 만들지 않는다', () => {
  const box = makeBox({});
  const cols = box.bdCols([]);
  const names = Array.from(cols).map(c => c.name).join(',');
  const want = Array.from(box.STATUSES).map(s => s[0]).join(',');
  assert.equal(names, want);
});

test('모르는 상태값도 「그 밖」 칸에 담긴다 — 업무가 조용히 사라지지 않는다', () => {
  const cols = Array.from(makeBox({}).bdCols(목록));
  const total = cols.reduce((n, c) => n + c.items.length, 0);
  assert.equal(total, 목록.length, '들어간 건수 = 나온 건수');
  const etc = cols.filter(c => c.name === '그 밖')[0];
  assert.ok(etc, '「그 밖」 칸이 생긴다');
  assert.equal(Array.from(etc.items).map(x => x.id).join(','), 'e');
});

test('모르는 상태가 없으면 「그 밖」 칸도 만들지 않는다 — 빈 칸을 늘어놓지 않는다', () => {
  const cols = Array.from(makeBox({}).bdCols(목록.filter(x => x.id !== 'e')));
  assert.equal(cols.filter(c => c.name === '그 밖').length, 0);
});

test('칸마다 건수가 맞다', () => {
  const cols = Array.from(makeBox({}).bdCols(목록));
  const n = {}; cols.forEach(c => { n[c.name] = c.items.length; });
  assert.equal(n['진행중'], 2);
  assert.equal(n['대기응답'], 1);
  assert.equal(n['검토'], 1);
});

test('카드에 회사·업무·구분 배지가 들어간다', () => {
  const html = makeBox({ steps:{ a:[{done:1},{done:1},{done:0}] } }).bdCardHTML(표본.a);
  assert.match(html, /㈜가나/);
  assert.match(html, /부당해고 구제신청/);
  assert.match(html, /class="badge"/, '표에서 쓰는 배지 그대로 — 색이 갈라지지 않게');
  assert.match(html, /☑ 2\/3/, '진행 단계는 몇 개 중 몇 개인지');
  assert.match(html, /draggable="true"/);
  assert.match(html, /data-id="a"/);
  assert.match(html, /onclick="openDrawer\('a'\)"/, '눌러서 열리는 곳은 표와 같다');
});

test('단계가 없는 업무에는 ☑ 표시를 붙이지 않는다', () => {
  assert.ok(makeBox({}).bdCardHTML(표본.b).indexOf('☑') < 0);
});

test('빈 칸에는 무엇을 하면 되는지 한 줄이 뜬다', () => {
  const html = makeBox({}).myBoardHTML([표본.a]);
  assert.match(html, /여기로 끌어다 놓으세요/);
});

/* ────────────────────────────────────────────────────────────
   ③ 끌어 놓기 — 표에서 쓰던 저장 길을 그대로 탄다
   ──────────────────────────────────────────────────────────── */
function 끌어놓기(box, id, to){
  box.setDrag(id);
  box.bdDrop({ preventDefault(){} }, to);
}

test('다른 칸에 놓으면 표에서 쓰던 setStatus 로 저장한다 — 몰래 다른 데 쓰지 않는다', () => {
  const box = makeBox({ items:표본 });
  끌어놓기(box, 'a', '검토');
  assert.equal(box._log.status.join(','), 'a→검토');
});

test('제자리에 놓으면 아무것도 저장하지 않는다 — 헛저장은 되돌림 사고를 부른다', () => {
  const box = makeBox({ items:표본 });
  끌어놓기(box, 'a', '진행중');
  assert.equal(box._log.status.length, 0);
});

test('「그 밖」 칸으로는 옮길 수 없다 — 있지도 않은 상태로 만들 수 없다', () => {
  const box = makeBox({ items:표본 });
  끌어놓기(box, 'a', '그 밖');
  assert.equal(box._log.status.length, 0, '저장하지 않는다');
  assert.match(box._log.toast.join(''), /그 밖.*옮길 수 없습니다/, '왜 안 되는지 알려 준다');
});

test('끌던 것이 없는데 놓이면 그냥 넘어간다', () => {
  const box = makeBox({ items:표본 });
  box.setDrag(null);
  box.bdDrop({ preventDefault(){} }, '검토');
  assert.equal(box._log.status.length, 0);
  assert.equal(box._log.toast.length, 0, '괜한 말을 하지 않는다');
});

test('끌고 있을 때만 칸에 표시가 붙는다', () => {
  const box = makeBox({ items:표본 });
  box.bdOver({ preventDefault(){}, dataTransfer:{} }, '검토');
  assert.equal((box._classes['bdc-검토'] || []).length, 0, '아무것도 안 끌고 있으면 반응하지 않는다');
  box.setDrag('a');
  box.bdOver({ preventDefault(){}, dataTransfer:{} }, '검토');
  assert.ok((box._classes['bdc-검토'] || []).indexOf('over') >= 0);
  box.bdLeave('검토');
  assert.equal((box._classes['bdc-검토'] || []).indexOf('over'), -1);
});

test('놓고 나면 끌던 표시가 지워진다', () => {
  const box = makeBox({ items:표본 });
  끌어놓기(box, 'a', '검토');
  assert.equal(box.getDrag(), null);
});

/* ────────────────────────────────────────────────────────────
   ④ 타임라인 — 없는 기한을 지어내지 않는다
   ──────────────────────────────────────────────────────────── */
test('보이는 기간은 그 목록이 걸쳐 있는 날들로 정한다 (앞뒤 사흘 여유)', () => {
  const box = makeBox({ today:'2026-08-16' });
  const R = box.tlRange(목록);
  // ⚠ toISOString 은 세계표준시라 한국에서 하루가 밀린다 — 그 자리 시간으로 적는다
  const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const lo = ymd(new Date(+R.lo));
  const hi = ymd(new Date(+R.hi));
  assert.equal(lo, '2026-07-29', '가장 이른 날(8/1) 사흘 앞');
  assert.equal(hi, '2026-09-04', '가장 늦은 날(9/1) 사흘 뒤');
});

test('오늘이 기간 밖이면 기간을 늘려 오늘을 넣는다 — 오늘 선이 화면 밖에 있으면 소용없다', () => {
  const R = makeBox({ today:'2026-12-25' }).tlRange(목록);
  assert.ok(new Date(R.hi) >= new Date('2026-12-25T00:00:00'));
});

test('날짜가 하나도 없으면 오늘 하루만 그린다 — 빈 달을 몇 년치 그리지 않는다', () => {
  const R = makeBox({ today:'2026-08-16' }).tlRange([{ id:'x', status:'진행중' }]);
  assert.ok(R.days <= 7);
});

test('기간이 너무 길면 420일에서 자른다 — 옛 자료 한 건 때문에 몇 년이 늘어지지 않게', () => {
  const R = makeBox({ today:'2026-08-16' }).tlRange([
    { id:'x', start:'2015-01-01', due:'2030-01-01' }
  ]);
  assert.equal(R.days, 420);
});

test('시작일과 기한이 다 있으면 막대를 그린다', () => {
  const html = makeBox({}).myTimelineHTML([표본.a]);
  assert.match(html, /class="tlbar"/);
  assert.ok(html.indexOf('class="tldot"') < 0);
});

test('기한이 없으면 막대 대신 점 — 없는 기한을 지어내지 않는다', () => {
  const html = makeBox({}).myTimelineHTML([표본.c]);
  assert.match(html, /class="tldot"/);
  assert.ok(html.indexOf('class="tlbar"') < 0, '막대를 그리면 언제까지인지를 거짓으로 보여 준다');
  assert.match(html, /기한 없음/, '왜 점인지 짚어 준다');
});

test('시작일이 없고 기한만 있어도 그 자리에 점을 찍는다', () => {
  const html = makeBox({}).myTimelineHTML([표본.d]);
  assert.match(html, /class="tldot"/);
});

test('오늘 자리에 선이 그어진다', () => {
  assert.match(makeBox({}).myTimelineHTML([표본.a]), /class="tltoday"/);
});

test('줄 왼쪽에 회사와 업무 이름이 붙어 다닌다 — 옆으로 밀어도 누구 것인지 안 잃는다', () => {
  const html = makeBox({}).myTimelineHTML([표본.a]);
  assert.match(html, /class="tlname"[^>]*onclick="openDrawer\('a'\)"/);
  assert.match(CSS, /\.tlname\{[^}]*position:sticky/, '왼쪽 이름 칸은 붙박이');
});

test('달 이름 옆에 날짜 숫자가 겹쳐 붙지 않는다', () => {
  const html = makeBox({}).myTimelineHTML(목록);
  const head = html.slice(html.indexOf('class="tlmon"'), html.indexOf('</div><div class="tlrow"'));
  const at = [];
  head.replace(/class="tlmk( mon)?" style="left:(\d+)px"/g, (m, mon, x) => { at.push([+x, !!mon]); return m; });
  assert.ok(at.length > 3, '눈금이 몇 개는 있어야 한다');
  for(let i = 1; i < at.length; i++){
    assert.ok(at[i][0] - at[i - 1][0] >= 60, '눈금 글씨끼리 44px 안쪽으로 붙으면 겹쳐 읽힌다: ' + at[i - 1][0] + '↔' + at[i][0]);
  }
});

test('날짜 글씨는 맨 윗줄에만 — 줄마다 찍으면 도배가 된다', () => {
  assert.match(CSS, /\.tllane \.tlmk b\{display:none\}/);
});

test('보여줄 것이 없으면 빈 화면 대신 한 줄을 남긴다', () => {
  assert.match(makeBox({}).myTimelineHTML([]), /보여줄 업무가 없습니다/);
});

/* ────────────────────────────────────────────────────────────
   ⑤ 셋은 같은 목록을 본다
   ──────────────────────────────────────────────────────────── */
test('보드·타임라인도 표와 «똑같이 걸러진» 목록을 쓴다 — 보기마다 건수가 달라지면 안 된다', () => {
  const i = src.indexOf("if(myMode()!=='table'){");
  assert.ok(i > 0, '갈림길을 못 찾음');
  const 조각 = src.slice(i, i + 700);
  assert.match(조각, /myBoardHTML\(list\)/, '표가 쓰는 그 list 를 그대로 넘긴다');
  assert.match(조각, /myTimelineHTML\(list\)/);
  // 표를 그리기 «전에» 갈라져야 한다 — 뒤에 있으면 표를 만들고 버리는 셈
  assert.ok(i < src.indexOf('<div class="panel tbl" id="mytbl"'), '표를 만들기 전에 갈라진다');
});

test('걸러 보기가 걸려 있으면 보드·타임라인에서도 알려 준다 — 왜 몇 건뿐인지 모르면 불안하다', () => {
  const i = src.indexOf("if(myMode()!=='table'){");
  const 조각 = src.slice(i, i + 700);
  assert.match(조각, /histbanner/, '표에서 쓰던 그 띠 그대로');
  assert.match(조각, /표에서 조건 고치기/, '조건은 표에서 고친다고 길을 알려 준다');
  // ⚠ 「조건 모두 풀기」로 적는 것은 일부러다. 「모두 보기 →」는 캘린더에서 «고른 날»을
  //   놓는 띠의 말이고, work-my.test.js 가 그 말이 내 업무 화면에 없음을 지키고 있다.
  //   같은 말을 두 뜻으로 쓰면 누르는 사람도, 검사도 헷갈린다.
  assert.match(조각, /조건 모두 풀기/);
  assert.ok(조각.indexOf('모두 보기 →') < 0);
});
