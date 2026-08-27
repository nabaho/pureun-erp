'use strict';
// 퇴사자 몫을 사업장(회사)별로 나눠 배분 — node --test tests/handover-by-company.test.js
//
// 왜: 퇴사자 몫을 «한 사람에게 통째로» 넘기는 길(succBulk)은 있었지만,
//     사업장별로 각각 다른 사람에게 나눠 주는 길이 없어 열세 건을 하나씩 골라야 했다.
//     그리고 넘겨도 푸른이알피 사무관리에는 퇴사자가 주담당으로 남아 두 곳이 어긋났다.
//
// 이 검사가 지키는 것
//   ① 회사 단위로 갈린다 — 한 회사를 두 사람이 나눠 맡는 일이 기본이 되지 않게
//   ② 넘기면 푸른이알피 주담당도 함께 바뀐다 (요청만 적고 엔진이 처리)
//   ③ 옛 담당이 적어 둔 진행 메모도 새 담당에게 따라간다
//   ④ 되돌리기 어려운 일이라 반드시 물어본 뒤에 한다
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const W = fs.readFileSync(path.join(__dirname, '..', 'work.html'), 'utf8').replace(/\r\n/g, '\n');
const P = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8').replace(/\r\n/g, '\n');
const CSS = W.slice(W.indexOf('<style>') + 7, W.indexOf('</style>'));

function grab(src, name){
  const i = src.indexOf('function ' + name + '(');
  assert.ok(i >= 0, '못 찾음: ' + name);
  let d = 0, j = i;
  for(;;j++){ if(src[j] === '{') d++; else if(src[j] === '}'){ d--; if(!d){ j++; break; } } }
  return src.slice(i, j);
}

/* ════════════════════════════════════════════════════════
   ① 회사 단위로 갈린다
   ════════════════════════════════════════════════════════ */
function coBox(rows){
  const log = { handed:[], toast:[], asked:null, answer:true };
  const box = {
    String, Object, Array, Math,
    _items: rows,
    openItems(){ return rows; },
    _normCo: s => String(s || '').replace(/\(주\)|㈜|주식회사|\(유\)|유한회사|[\s·.,\-()]/g, '').toLowerCase(),
    toast(m, k){ log.toast.push(String(m) + '|' + (k || '')); },
    _handoverTo(id, sid, name, why){ log.handed.push(id + '→' + name + (why ? '/' + why : '')); },
    confirmM(msg, o){ log.asked = msg; return Promise.resolve(log.answer); }
  };
  box.window = box;
  vm.createContext(box);
  vm.runInContext(grab(W, 'succCoGroups') + '\n' + grab(W, 'succCoBulk')
    + '\nthis.groups=succCoGroups; this.bulk=succCoBulk;', box);
  box._log = log;
  return box;
}

const 업무 = [
  { _id:'1', mgr_main:{name:'임혜미'}, company:'㈜가나전자' },
  { _id:'2', mgr_main:{name:'임혜미'}, company:'(주)가나전자' },   // 같은 회사, 표기만 다름
  { _id:'3', mgr_main:{name:'임혜미'}, company:'가나 전자' },      // 빈칸까지 다름
  { _id:'4', mgr_main:{name:'임혜미'}, company:'다라산업' },
  { _id:'5', mgr_main:{name:'임혜미'}, company:'', client:'마바 의뢰인' },
  { _id:'6', mgr_main:{name:'임혜미'}, company:'' },               // 회사도 의뢰인도 없다
  { _id:'7', mgr_main:{name:'김혜민'}, company:'㈜가나전자' }      // 남의 것
];

test('회사별로 묶인다 — 표기가 달라도 같은 회사면 한 덩어리', () => {
  const g = Array.from(coBox(업무).groups('임혜미'));
  const 가나 = g.filter(x => x.items.length === 3)[0];
  assert.ok(가나, '㈜가나전자·(주)가나전자·가나 전자가 한 덩어리여야 한다');
  assert.equal(Array.from(가나.items).map(i => i._id).join(','), '1,2,3');
});

test('남의 업무는 안 들어온다', () => {
  const g = Array.from(coBox(업무).groups('임혜미'));
  const all = g.reduce((n, x) => n + x.items.length, 0);
  assert.equal(all, 6, '임혜미 것 여섯 건만');
});

test('회사도 의뢰인도 없는 건은 「(회사 없음)」으로 묶인다 — 사라지지 않는다', () => {
  const g = Array.from(coBox(업무).groups('임혜미'));
  assert.ok(g.some(x => x.name === '(회사 없음)'));
});

test('회사가 비면 의뢰인 이름을 쓴다', () => {
  const g = Array.from(coBox(업무).groups('임혜미'));
  assert.ok(g.some(x => x.name === '마바 의뢰인'));
});

test('건수가 많은 회사가 위로 — 큰 덩어리부터 정하게 된다', () => {
  const g = Array.from(coBox(업무).groups('임혜미'));
  assert.equal(g[0].items.length, 3);
});

test('건수가 같으면 이름순 — 볼 때마다 자리가 뒤집히지 않게', () => {
  const b = coBox([
    { _id:'a', mgr_main:{name:'X'}, company:'나나' },
    { _id:'b', mgr_main:{name:'X'}, company:'가가' }
  ]);
  assert.equal(Array.from(b.groups('X')).map(x => x.name).join(','), '가가,나나');
});

/* ════════════════════════════════════════════════════════
   ② 한 번에 넘기기 — 물어본 뒤에
   ════════════════════════════════════════════════════════ */
function sel(sid, name){
  return { value:sid, selectedIndex:0, options:[{ getAttribute:() => name }] };
}

test('회사 하나를 고르면 그 회사 것만 넘어간다', async () => {
  const b = coBox(업무);
  const k = Array.from(b.groups('임혜미'))[0].k;
  await b.bulk('임혜미', k, sel('P-004', '김혜민'));
  await new Promise(r => setTimeout(r, 0));
  assert.equal(b._log.handed.join(','), '1→김혜민/업체 단위 배분,2→김혜민/업체 단위 배분,3→김혜민/업체 단위 배분');
});

test('되돌리기 어려운 일이라 반드시 물어본 뒤에 한다', async () => {
  const b = coBox(업무);
  b._log.answer = false;
  const k = Array.from(b.groups('임혜미'))[0].k;
  await b.bulk('임혜미', k, sel('P-004', '김혜민'));
  await new Promise(r => setTimeout(r, 0));
  assert.equal(b._log.handed.length, 0, '아니라고 했는데 넘겼다');
  assert.ok(b._log.asked, '묻지도 않았다');
});

test('물을 때 무엇이 함께 따라가는지까지 적는다', async () => {
  const b = coBox(업무);
  await b.bulk('임혜미', Array.from(b.groups('임혜미'))[0].k, sel('P-004', '김혜민'));
  const q = b._log.asked;
  assert.match(q, /주간 기록/);
  assert.match(q, /인수인계 노트/);
  assert.match(q, /지식 카드/);
  assert.match(q, /푸른이알피 사무관리의 주담당/);
  assert.match(q, /되돌리려면/);
});

test('사람을 안 고르면 넘기지 않고 그렇게 말한다', async () => {
  const b = coBox(업무);
  await b.bulk('임혜미', Array.from(b.groups('임혜미'))[0].k, sel('', ''));
  assert.equal(b._log.handed.length, 0);
  assert.match(b._log.toast.join(''), /이어받을 사람을 먼저/);
});

test('없는 회사를 넘기라고 하면 조용히 지나가지 않는다', async () => {
  const b = coBox(업무);
  await b.bulk('임혜미', '없는회사', sel('P-004', '김혜민'));
  assert.equal(b._log.handed.length, 0);
  assert.match(b._log.toast.join(''), /넘길 건이 없습니다/);
});

/* ════════════════════════════════════════════════════════
   ③ 푸른이알피 주담당도 함께 넘어간다
   ════════════════════════════════════════════════════════ */
const HO = grab(W, '_handoverTo');

test('연동된 건은 푸른이알피에 주담당 넘기기 요청을 적는다', () => {
  assert.match(HO, /if\(peLinked\(it\)\) f\.pe_setmain=\{sid:sid,name:name,from:old\.sid\|\|'',/);
});

test('마스터에 바로 쓰지 않는다 — 저장형태를 아는 dbPatch 는 푸른이알피 안에만 있다', () => {
  // ⚠ 주석에도 그 낱말이 나온다 — «부르는 모양»으로 봐야 한다
  const 코드 = HO.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.ok(코드.indexOf("ref('data/") < 0);
  assert.ok(코드.indexOf('dbPatch(') < 0);
  assert.ok(코드.indexOf('dbSet(') < 0);
});

test('연동 안 된 자체 업무에는 그 요청을 안 적는다', () => {
  assert.match(HO, /if\(peLinked\(it\)\)/, '조건 없이 늘 적으면 쓸데없는 요청이 쌓인다');
});

const ENG = P.slice(P.indexOf('function wsSyncRun('), P.indexOf('function MyDeskV2('));

test('엔진이 그 요청을 읽어 마스터 주담당을 갈아 끼운다', () => {
  assert.match(ENG, /if\(w\.pe_setmain && w\.pe_setmain\.sid\)\{/);
  assert.match(ENG, /managerMain:t\.sid, managerSubs:t\.subs/);
});

test('처리한 요청은 지운다 — 안 지우면 다음 판에 또 돈다', () => {
  assert.match(ENG, /up\['work_erp\/items\/' \+ wid \+ '\/pe_setmain'\] = null;/);
});

test('이미 그 사람이 주담당이면 아무것도 안 한다', () => {
  const i = ENG.indexOf('if(w.pe_setmain && w.pe_setmain.sid){');
  assert.match(ENG.slice(i, i + 700), /if\(String\(pe\.managerMain \|\| ''\) !== _newM\)\{/);
});

test('새 주담당이 부담당에도 있으면 뺀다 — 한 사람이 두 자리를 차지하지 않게', () => {
  const i = ENG.indexOf('if(w.pe_setmain && w.pe_setmain.sid){');
  assert.match(ENG.slice(i, i + 700), /_keep = \(pe\.managerSubs \|\| \[\]\)\.filter/);
});

test('⚠ 기준선 분기보다 앞에 있어야 새로 연결된 건도 첫 판에 처리된다', () => {
  assert.ok(ENG.indexOf('if(w.pe_setmain') < ENG.indexOf('if(!snap.synced_at){'));
});

test('푸른이알피 쓰기는 dbPatch 로만 — 마스터를 통째로 갈지 않는다', () => {
  const i = ENG.indexOf('toPeM.forEach');
  assert.ok(i > 0);
  const 조각 = ENG.slice(i, i + 1200);
  assert.match(조각, /dbPatch\(t\.store, t\.id, \{ managerMain/);
  assert.ok(조각.indexOf("dbSet(t.store") < 0);
});

/* ════════════════════════════════════════════════════════
   ④ 옛 담당이 적어 둔 진행 메모도 따라간다
   ════════════════════════════════════════════════════════ */
const MOVE = (function(){
  const i = ENG.indexOf('toPeM.forEach');
  return ENG.slice(i, ENG.indexOf('// project_progress는', i) > 0
    ? ENG.indexOf('// project_progress는', i) : i + 1600);
})();

test('그 건의 진행 메모를 새 담당에게 옮긴다', () => {
  assert.match(MOVE, /PP\[iOld\] = Object\.assign\(\{\}, PP\[iOld\], \{ sid:t\.sid \}\);/);
  assert.match(MOVE, /ppDirty = 1;/);
});

test('⚠ updatedAt 은 손대지 않는다 — 찍으면 옛 값이 업무관리를 덮는다', () => {
  assert.ok(MOVE.indexOf('updatedAt:now') < 0);
  assert.match(MOVE, /updatedAt 은 손대지 않는다/);
});

test('새 담당에게 이미 그 건의 행이 있으면 건드리지 않는다 — 그 사람이 쓴 것이 먼저다', () => {
  assert.match(MOVE, /if\(iOld < 0 \|\| iNew >= 0\) return;/);
});

test('누가 넘겼는지 모르면 남의 기록을 손대지 않는다', () => {
  assert.match(MOVE, /if\(!t\.from \|\| t\.from === t\.sid\) return;/);
});

test('마스터 저장이 실패하면 진행 메모도 안 옮긴다 — 반쪽만 넘어가면 안 된다', () => {
  assert.match(MOVE, /if\(!dbPatch\([^)]*\)\) return;/);
});

/* ════════════════════════════════════════════════════════
   ⑤ 화면에 실제로 달려 있다
   ════════════════════════════════════════════════════════ */
test('인수인계 표가 회사별로 묶여 나온다', () => {
  assert.match(W, /succCoGroups\(nm\)\.forEach\(function\(g\)\{/);
  assert.match(W, /🔄 이 회사 넘기기/);
});

test('회사 묶음 머리줄에서 바로 사람을 고를 수 있다', () => {
  assert.match(W, /succCoBulk\(\\'/);
});

test('건별 [후임 선택]은 그대로 남는다 — 예외를 막지 않는다', () => {
  assert.match(W, /onchange="assignSuccessor\(/);
});

test('사람 이름에 빈칸이 있어도 묶음 id 를 찾는다', () => {
  assert.match(W, /var gid='sucCo-'\+safeKey\(nm\)\+'-'\+safeKey\(g\.k\);/);
});

test('묶음 머리줄 모양이 CSS에 있다', () => {
  assert.match(CSS, /\.hotbl tr\.hogrp td\{/);
  assert.ok(CSS.indexOf('.hotbl tr.hogrp td{position:sticky') < 0, '표 머리행과 겹친다');
});
