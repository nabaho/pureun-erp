'use strict';
// 사무관리에서 끝난 일을 「내 실적으로 담기」 — node --test tests/kcareer-adopt.test.js
//
// 왜: 푸른이알피 실적은 «보여주기만» 했다(renderPuPerf). 그런데 이력서·경력증명서·
//     연도별 요약·AI 는 전부 get('case') 같은 «손으로 넣은 실적»만 본다.
//     그래서 사무관리에서 끝낸 사건이 증명서에 한 줄도 안 들어가,
//     같은 것을 손으로 다시 적어야 했다.
//
// 이 검사가 지키는 것
//   ① 밀어 넣지 않는다 — 본인이 담는다 (경력은 본인이 책임지는 자료다)
//   ② 끝난 것만 담는다 (진행 중인 일을 경력에 적으면 거짓이다)
//   ③ 두 번 담기지 않는다
//   ④ 금액은 안 담는다 (계약서와 엮인 값이라 틀린 채로 증명서에 박힌다)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const K = fs.readFileSync(path.join(__dirname, '..', 'kcareer.html'), 'utf8').replace(/\r\n/g, '\n');

function grab(name){
  const i = K.indexOf('function ' + name + '(');
  assert.ok(i >= 0, '못 찾음: ' + name);
  let d = 0, j = i;
  for(;;j++){ if(K[j] === '{') d++; else if(K[j] === '}'){ d--; if(!d){ j++; break; } } }
  return K.slice(i, j);
}

function makeBox(opts){
  opts = opts || {};
  const log = { toast:[], saved:{}, asked:null, answer:opts.answer !== false };
  const store = JSON.parse(JSON.stringify(opts.store || {}));
  const box = {
    console, Date, String, Object, Array, JSON, Math,
    _me: opts.me || { resolved:true, name:'권형하', sid:'P-001', isAdmin:true },
    NS: 'kc_',
    LS: { get(k){ return opts.cache && k === 'kc_' + (opts.cacheKey || 'pu_case_cache')
      ? JSON.stringify(opts.cache) : null; } },
    get(k){ return (store[k] || []).slice(); },
    set(k, arr){ store[k] = arr; log.saved[k] = arr; },
    toast(m){ log.toast.push(String(m)); },
    confirm(m){ log.asked = m; return log.answer; },
    nextId(prefix, s){ return prefix + '0001'; },
    renderList(){}, renderPuPerf(){}
  };
  box.window = box;
  vm.createContext(box);
  vm.runInContext(
    K.match(/var PU_COLLS=\{[\s\S]*?\};/)[0] + '\n'
    + K.match(/var PU_ADOPT=\{[^}]*\};/)[0] + '\n'
    // FORM_DEFS 는 통째로 크다 — 이 검사에 필요한 것(접두어)만 세워 준다
    + 'var FORM_DEFS={case:{prefix:"CS"},consult:{prefix:"CN"},fund:{prefix:"FD"},etc:{prefix:"ET"}};', box);
  vm.runInContext(
    grab('_puItemFields') + '\n' + grab('_puClosed') + '\n' + grab('_puRefOf') + '\n'
    + grab('puAdoptable') + '\n' + grab('_puToRec') + '\n' + grab('puAdopt') + '\n'
    + 'this.adoptable=puAdoptable; this.toRec=_puToRec; this.adopt=puAdopt; this.closed=_puClosed;', box);
  box._log = log;
  box._store = store;
  return box;
}

/* 사건 넷 — 끝난 것 둘, 진행 중 둘 */
const 사건 = [
  { id:'c1', companyName:'㈜가나', caseType:'부당해고', title:'구제신청 대리', caseNo:'사건-2026-011',
    closedDate:'2026-06-30' },
  { id:'c2', companyName:'다라산업', caseType:'임금체불', title:'진정 대응', status:'closed',
    closedDate:'2026-07-15' },
  { id:'c3', companyName:'마바㈜', caseType:'산재', title:'요양급여', status:'progress' },
  { id:'c4', companyName:'사아', caseType:'부당해고', title:'심문 준비' }
];

/* ══════════════════════════════════════════
   ① 끝난 것만
   ══════════════════════════════════════════ */
test('끝난 것만 담을 거리로 센다 — 진행 중인 일을 경력에 적으면 거짓이 된다', () => {
  const b = makeBox({});
  const got = Array.from(b.adoptable('cases', 사건)).map(c => c.id);
  assert.equal(got.join(','), 'c1,c2');
});

test('끝났다는 표시는 종료일이거나 status:closed 다', () => {
  const b = makeBox({});
  assert.equal(b.closed({ closedDate:'2026-01-01' }), true);
  assert.equal(b.closed({ status:'closed' }), true);
  assert.equal(b.closed({ status:'progress' }), false);
  assert.equal(b.closed({}), false);
  assert.equal(b.closed(null), false);
});

/* ══════════════════════════════════════════
   ② 두 번 담기지 않는다
   ══════════════════════════════════════════ */
test('이미 담은 건은 다시 안 센다 — 원본 표식으로 가른다', () => {
  const b = makeBox({ store:{ case:[{ id:'CS0001', peRef:'cases-c1' }] } });
  assert.equal(Array.from(b.adoptable('cases', 사건)).map(c => c.id).join(','), 'c2');
});

test('원본 표식은 종류와 번호를 함께 담는다 — 다른 종류에 같은 번호가 있어도 안 섞인다', () => {
  const b = makeBox({});
  assert.equal(b.toRec('cases', 사건[0]).peRef, 'cases-c1');
  assert.equal(b.toRec('funds', { id:'c1' }).peRef, 'funds-c1');
});

/* ══════════════════════════════════════════
   ③ 무엇이 담기나
   ══════════════════════════════════════════ */
test('회사·연도·내용이 담기고 상태는 「완료」다', () => {
  const r = makeBox({}).toRec('cases', 사건[0]);
  assert.equal(r.org, '㈜가나');
  assert.equal(r.year, '2026');
  assert.equal(r.project, '구제신청 대리');
  assert.equal(r.status, '완료');
  assert.equal(r.type, '부당해고');
});

test('어디서 온 것인지 비고에 남긴다 — 나중에 「이건 뭐지」가 되지 않게', () => {
  const r = makeBox({}).toRec('cases', 사건[0]);
  assert.match(r.note, /푸른이알피에서 담음/);
  assert.match(r.note, /사건-2026-011/);
});

test('⚠ 금액은 안 담는다 — 계약서와 엮인 값이라 틀린 채로 증명서에 박힌다', () => {
  const r = makeBox({}).toRec('cases',
    Object.assign({}, 사건[0], { contractFee:5000000, amount:3000000, successFee:10 }));
  assert.ok(!('amt' in r), '금액이 담겼다');
  assert.ok(String(JSON.stringify(r)).indexOf('5000000') < 0);
});

test('종류 칸이 없는 기금실적에는 유형을 적지 않는다 — 화면에 안 나오고 파일만 커진다', () => {
  const r = makeBox({}).toRec('funds', { id:'f1', companyName:'노리', fundType:'설립', closedDate:'2026-03-01' });
  assert.ok(!('type' in r));
  assert.equal(r.org, '노리');
});

test('컨설팅은 담당 칸에 본인 이름을 적는다', () => {
  const r = makeBox({}).toRec('consultings', { id:'x', companyName:'가', closedDate:'2026-01-01' });
  assert.equal(r.main, '권형하');
});

/* ══════════════════════════════════════════
   ④ 담기 — 본인만, 물어본 뒤에
   ══════════════════════════════════════════ */
function 상자(opt){
  return makeBox(Object.assign({
    cache:{ byMgr:{ '권형하':사건, '김혜민':[{ id:'z', companyName:'남의회사', closedDate:'2026-01-01' }] } },
    cacheKey:'pu_case_cache'
  }, opt || {}));
}

test('본인 것을 담으면 실적에 들어간다', () => {
  const b = 상자();
  b.adopt('cases', '권형하');
  const rows = b._store.case;
  assert.equal(rows.length, 2);
  assert.equal(rows.map(r => r.peRef).sort().join(','), 'cases-c1,cases-c2');
  assert.match(b._log.toast.join(''), /2건을 사건실적에 담았습니다/);
});

test('⚠ 남의 이름으로는 못 담는다 — 대표라도 남의 경력을 자기 것으로 담으면 안 된다', () => {
  const b = 상자();
  b.adopt('cases', '김혜민');
  assert.ok(!b._store.case, '남의 것이 담겼다');
  assert.match(b._log.toast.join(''), /본인 실적만/);
});

test('신원을 못 알아냈으면 아무것도 안 담는다', () => {
  const b = 상자({ me:{ resolved:false, name:'', isAdmin:true } });
  b.adopt('cases', '권형하');
  assert.ok(!b._store.case);
});

test('되돌리기 번거로운 일이라 물어본 뒤에 담는다', () => {
  const b = 상자({ answer:false });
  b.adopt('cases', '권형하');
  assert.ok(!b._store.case, '아니라고 했는데 담았다');
  assert.ok(b._log.asked, '묻지도 않았다');
});

test('물을 때 금액을 안 담는다는 것까지 적는다', () => {
  const b = 상자();
  b.adopt('cases', '권형하');
  assert.match(b._log.asked, /금액은 담지 않습니다/);
  assert.match(b._log.asked, /이미 담은 건은 건너뜁니다/);
});

test('담을 것이 없으면 조용히 지나가지 않고 그렇게 말한다', () => {
  const b = 상자({ store:{ case:[{ peRef:'cases-c1' }, { peRef:'cases-c2' }] } });
  b.adopt('cases', '권형하');
  assert.match(b._log.toast.join(''), /담을 것이 없습니다/);
});

test('두 번 눌러도 두 번 담기지 않는다', () => {
  const b = 상자();
  b.adopt('cases', '권형하');
  assert.equal(b._store.case.length, 2);
  // 담은 뒤의 상태를 그대로 이어받아 다시 눌러 본다
  const b2 = 상자({ store:{ case:b._store.case } });
  b2.adopt('cases', '권형하');
  // ⚠ 「담긴 것이 없다」는 배열이 비었는지가 아니라 «저장을 한 번도 안 했는지» 로 본다
  assert.ok(!b2._log.saved.case, '두 번째에도 저장이 일어났다');
  assert.match(b2._log.toast.join(''), /담을 것이 없습니다/);
});

/* ══════════════════════════════════════════
   ⑤ 화면에 실제로 달려 있다
   ══════════════════════════════════════════ */
test('네 종류 모두 이어져 있다 — 사건·컨설팅·기금·기타', () => {
  const m = K.match(/var PU_ADOPT=\{[^}]*\}/)[0];
  ['cases', 'consultings', 'funds', 'other_projects'].forEach(k =>
    assert.ok(m.indexOf(k) > 0, k + ' 이 빠졌다'));
  ['case', 'consult', 'fund', 'etc'].forEach(k =>
    assert.ok(m.indexOf("'" + k + "'") > 0, k + ' 이 빠졌다'));
});

test('단추는 본인 묶음에만 나온다', () => {
  const R = grab('renderPuPerf');
  assert.match(R, /var mine=!!\(_me\.name && nm===_me\.name\);/);
  assert.match(R, /\+\(!mine \? ''/);
});

test('담을 것이 몇 건인지 단추에 적는다 — 눌러 보기 전에 알 수 있게', () => {
  assert.match(grab('renderPuPerf'), /⬇ 내 실적으로 담기 '\+todoN/);
});

test('다 담았으면 단추 대신 그렇게 말한다 — 사라지면 「어디 갔지」가 된다', () => {
  assert.match(grab('renderPuPerf'), /끝난 건은 모두 담겨 있습니다/);
});

test('끝난 건이 아예 없으면 그 말도 안 한다 — 할 말이 없는 자리다', () => {
  assert.match(grab('renderPuPerf'), /: \(closed \? ' <span/);
});
