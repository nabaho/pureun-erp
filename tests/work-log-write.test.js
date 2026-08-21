'use strict';
// 업무관리 기록 쓰기·고치기·지우기 — node --test tests/work-log-write.test.js
//
// 왜: 이 앱에서 «가장 많이 쓰는 길»인데 검사가 하나도 없었다
//     (검사 428개 중 업무관리를 보는 34개 어디에도 addLog·refreshLast·_delLog 가 없었다).
//     코드를 읽어 보니 맞게 짜여 있다 — 그 올바름을 여기서 묶어 둔다.
//     기록 한 줄이 세 자리(주간묶음·건별사본·최근기록)에 걸쳐 있어, 하나만 어긋나도
//     화면마다 다른 말을 하게 된다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'work.html'), 'utf8').replace(/\r\n/g, '\n');

function grab(name){
  const i = src.indexOf('function ' + name + '(');
  assert.ok(i >= 0, name + ' 를 찾지 못했다');
  let d = 0, j = i;
  for(;;j++){ if(src[j] === '{') d++; else if(src[j] === '}'){ d--; if(!d){ j++; break; } } }
  return src.slice(i, j);
}

/* 가짜 Firebase — 무엇을 어디에 썼는지 받아 적는다 */
function sandbox(opts){
  opts = opts || {};
  const box = {
    NS: 'work_erp', written: null, setPath: null, setVal: undefined,
    toasts: [], items: opts.items || {}, itemLogsCache: opts.logs || {}, wkCache: {},
    S: { me: opts.me || { sid:'u1', name:'권형하' } },
    Object, String, Promise, Date, JSON,
    toast(m, k){ box.toasts.push((k || '') + '|' + m); },
    isAdmin(){ return !!opts.admin; },
    todayStr(){ return '2026-08-15'; },
    rid(p){ return p + '1'; },
    weekYear(w){ return String(w).slice(0, 4); },
    mondayOf(d){ return d; },
    weekKeyOf(){ return opts.wk || '2026-W33'; },
    fbDb: {
      ref(p){
        return {
          update(o){ box.written = o; return opts.fail ? Promise.reject(new Error('권한 없음')) : Promise.resolve(); },
          set(v){ box.setPath = p; box.setVal = v; return opts.fail ? Promise.reject(new Error('권한 없음')) : Promise.resolve(); },
        };
      },
    },
  };
  vm.createContext(box);
  return box;
}

/* ── 최근 기록 다시 계산 ── */
function loadRefresh(logs, items){
  // ⚠ itemLogsCache 는 «건별» 로 나뉜다 — 그 건 밑에 넣어야 한다
  const b = sandbox({ logs: { it1: logs }, items });
  vm.runInContext(grab('refreshLast') + '\nthis.f = refreshLast;', b);
  return b;
}

test('★ 지운 뒤 남은 것 중 가장 최근으로 다시 잡는다', () => {
  const b = loadRefresh({ x: { d:'2026-08-01', t:'가' }, y: { d:'2026-08-10', t:'나' } }, { it1:{} });
  b.f('it1');
  // vm 밖으로 나온 객체는 deepEqual 이 겨레를 따진다 — 칸을 하나씩 본다
  assert.equal(b.setVal.d, '2026-08-10');
  assert.equal(b.setVal.t, '나');
  assert.equal(b.items.it1.last.t, '나', '화면이 쓰는 자리도 함께 고친다');
});

test('★ 인수인계 기록은 최근 기록으로 안 올린다', () => {
  // k 가 붙은 것은 업무 기록이 아니라 인수인계다 — 목록의 「최근 기록」에 뜨면 안 된다
  const b = loadRefresh({ x: { d:'2026-08-01', t:'업무' }, y: { d:'2026-08-20', t:'인수인계', k:'ho' } }, { it1:{} });
  b.f('it1');
  assert.equal(b.setVal.t, '업무');
});

test('다 지우면 최근 기록도 비운다', () => {
  const b = loadRefresh({}, { it1:{ last:{ d:'2026-08-01', t:'옛것' } } });
  b.f('it1');
  assert.equal(b.setVal, null, 'null 을 써야 서버에서도 지워진다');
  assert.equal(b.items.it1.last, null);
});

test('그 자리에만 쓴다 (업무 전체를 덮지 않는다)', () => {
  const b = loadRefresh({ x:{ d:'2026-08-01', t:'가' } }, { it1:{} });
  b.f('it1');
  assert.equal(b.setPath, 'work_erp/items/it1/last');
});

test('없는 업무여도 터지지 않는다', () => {
  const b = loadRefresh({ x:{ d:'2026-08-01', t:'가' } }, {});
  assert.doesNotThrow(() => b.f('없는것'));
});

/* ── 기록 더하기 ── */
function loadAdd(opts){
  const b = sandbox(opts);
  vm.runInContext(grab('addLog') + '\nthis.f = addLog;', b);
  return b;
}

test('★ 세 자리에 «한 번에» 쓴다 (하나만 들어가면 화면마다 말이 달라진다)', async () => {
  const b = loadAdd({ items: { it1: {} } });
  await b.f('it1', '오늘 한 일', '2026-08-15');
  const keys = Object.keys(b.written);
  assert.equal(keys.length, 3);
  assert.ok(keys.some(k => k.startsWith('work_erp/logs/')), '주간 묶음');
  assert.ok(keys.some(k => k.startsWith('work_erp/itemlogs/it1/')), '건별 사본');
  assert.ok(keys.includes('work_erp/items/it1/last'), '최근 기록');
});

test('★ 최근 기록은 «앞으로만» 간다', () => {
  // 옛 날짜를 뒤늦게 적었다고 최근 기록이 과거로 돌아가면 안 된다
  const b = loadAdd({ items: { it1: { last: { d:'2026-08-20', t:'나중 것' } } } });
  b.f('it1', '옛날 것', '2026-08-01');
  assert.ok(!Object.keys(b.written).includes('work_erp/items/it1/last'));
});

test('같은 날 다시 적으면 최근 기록도 바뀐다', () => {
  const b = loadAdd({ items: { it1: { last: { d:'2026-08-15', t:'아침' } } } });
  b.f('it1', '저녁', '2026-08-15');
  const nl = b.written['work_erp/items/it1/last'];
  assert.equal(nl.d, '2026-08-15');
  assert.equal(nl.t, '저녁');
});

test('빈 내용은 저장하지 않고 말해 준다', async () => {
  const b = loadAdd({});
  assert.equal(await b.f('it1', '   ', '2026-08-15'), false);
  assert.equal(b.written, null, '서버로 나가면 안 된다');
  assert.match(b.toasts[0], /내용을 입력하세요/);
});

test('누가 언제 썼는지 함께 남긴다', () => {
  const b = loadAdd({ items: { it1: {} }, me: { sid:'u9', name:'박재원' } });
  b.f('it1', '한 일', '2026-08-15');
  const log = b.written['work_erp/itemlogs/it1/L1'];
  assert.equal(log.by, 'u9');
  assert.equal(log.byName, '박재원');
  assert.ok(log.at, '적은 시각');
});

test('★ 저장에 실패하면 캐시를 고치지 않고 실패라고 말한다', async () => {
  // 실패했는데 화면만 바뀌면, 사람은 저장된 줄 알고 창을 닫는다
  const b = loadAdd({ items: { it1: {} }, fail: true });
  assert.equal(await b.f('it1', '한 일', '2026-08-15'), false);
  assert.equal(b.items.it1.last, undefined, '캐시가 바뀌면 안 된다');
  assert.match(b.toasts.join(' '), /저장 실패/);
});

test('성공했을 때만 캐시를 고친다', async () => {
  const b = loadAdd({ items: { it1: {} } });
  assert.equal(await b.f('it1', '한 일', '2026-08-15'), true);
  assert.equal(b.items.it1.last.d, '2026-08-15');
  assert.equal(b.items.it1.last.t, '한 일');
});

/* ── 남의 기록을 못 지운다 ── */
function loadCan(opts){
  const b = sandbox(opts);
  vm.runInContext(grab('canLog') + '\nthis.f = canLog;', b);
  return b;
}

test('★ 본인이 쓴 기록만 지울 수 있다', () => {
  const b = loadCan({ me: { sid:'u1', name:'권형하' } });
  assert.equal(b.f({ by:'u1' }), true);
  assert.equal(b.f({ by:'u9', byName:'남' }), false);
});

test('이름으로도 알아본다 (사번이 없던 옛 기록)', () => {
  const b = loadCan({ me: { sid:'u1', name:'권형하' } });
  assert.equal(b.f({ byName:'권형하' }), true);
});

test('대표는 다 지울 수 있다', () => {
  const b = loadCan({ me: { sid:'u1', name:'권형하' }, admin: true });
  assert.equal(b.f({ by:'u9', byName:'남' }), true);
});

test('기록이 없으면 못 지운다', () => {
  const b = loadCan({});
  assert.equal(b.f(null), false);
});

/* ── 화면 쪽 배선 ── */
test('★ 고치거나 지운 뒤 최근 기록을 다시 계산한다', () => {
  // 이걸 빼면 목록에 «지운 기록»이 계속 남는다
  const del = grab('_delLog');
  assert.match(del, /return refreshLast\(itemId\);/);
  const i = src.indexOf('function saveLogEdit(') >= 0 ? 'saveLogEdit' : null;
  const edit = src.slice(src.indexOf("up[NS+'/logs/'+weekYear(newWk)"), src.indexOf('// 마지막 기록 한 줄 다시 계산'));
  assert.match(edit, /return refreshLast\(itemId\);/);
});

test('지울 때 두 자리를 함께 지운다', () => {
  const del = grab('_delLog');
  assert.match(del, /up\[NS\+'\/itemlogs\/'\+itemId\+'\/'\+lid\]=null;/);
  assert.match(del, /up\[NS\+'\/logs\/'\+weekYear\(wk\)\+'\/'\+wk\+'\/'\+itemId\+'\/'\+lid\]=null;/);
});

test('★ 날짜를 옮기면 옛 주에서 뺀다 (두 주에 겹쳐 보이지 않게)', () => {
  const edit = src.slice(src.indexOf('var oldWk=l.w||weekKeyOf'), src.indexOf("if(msg)msg.textContent='저장 중…';"));
  assert.match(edit, /if\(oldWk&&oldWk!==newWk\) up\[NS\+'\/logs\/'\+weekYear\(oldWk\)\+'\/'\+oldWk\+'\/'\+itemId\+'\/'\+lid\]=null;/);
});

test('지우기 전에 그 건의 기록을 먼저 불러온다', () => {
  // 캐시가 비어 있으면 「본인 것인가」도 「최근 기록」도 틀리게 판단한다
  assert.match(src, /loadItemLogs\(itemId\)\.then\(function\(\)\{ _delLog\(itemId,lid\); \}\)/);
});
