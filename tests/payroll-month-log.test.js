'use strict';
// 급여 처리를 「월 한 줄」로 — node --test tests/payroll-month-log.test.js
//
// 왜: 노무사 아닌 직원(사무장 등)이 급여관리에서 하는 일 — 자료 받고, 명세서 보내고 —
//     이 업무관리에 한 줄도 안 남았다. 그 사업장을 열어도 이 달에 무엇을 했는지 몰랐다.
//
// ⚠ 급여 앱은 한 글자도 안 건드린다. 이미 남기고 있는 것을 읽어 «비끄러맬» 뿐이다.
//     payroll_os/inbox      … 자료 수신 (사업장·월·ts)
//     payroll_os/slip_sent  … 명세서 발송 (열쇠 「사업장|월|성명」, at)
//
// 이 검사가 지키는 것
//   ① 사업장×월로 «한 줄»이다 (달마다 백 줄이 되면 사건 기록이 묻힌다)
//   ② 그 줄을 고쳐 쓴다 — 새로 쌓지 않는다
//   ③ 달라진 것이 없으면 아무것도 안 쓴다
//   ④ 권한이 없으면 그냥 안 돈다 (고장이 아니다)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const W = fs.readFileSync(path.join(__dirname, '..', 'work.html'), 'utf8').replace(/\r\n/g, '\n');

function grab(name){
  const i = W.indexOf('function ' + name + '(');
  assert.ok(i >= 0, '못 찾음: ' + name);
  let d = 0, j = i;
  for(;;j++){ if(W[j] === '{') d++; else if(W[j] === '}'){ d--; if(!d){ j++; break; } } }
  return W.slice(i, j);
}

function makeBox(opts){
  opts = opts || {};
  const log = { added:[], up:[], set:[] };
  const box = {
    console, Date, String, Number, Array, Object, Math, Promise, JSON, isNaN,
    paySrc: opts.pay === undefined ? null : opts.pay,
    PAY_ROOT: 'payroll_os', NS: 'work_erp', S: { year: 2026, me:{ sid:'P-001', name:'권형하' } },
    items: opts.items || {},
    itemLogsCache: opts.logs || {},
    wkCache: {},
    _normCo: s => String(s || '').replace(/\(주\)|㈜|주식회사|\(유\)|유한회사|[\s·.,\-()]/g, '').toLowerCase(),
    safeKey: s => String(s == null ? '' : s).replace(/[.#$/\[\]]/g, '_'),
    weekKeyOf: () => '2026-W36', weekYear: () => 2026, mondayOf: d => d,
    todayStr: () => '2026-09-05',
    openItems(){ return Object.keys(box.items).map(function(k){
      var it = box.items[k]; it._id = k; return it; }); },
    loadItemLogs(id){ return Promise.resolve(box.itemLogsCache[id] || {}); },
    addLog(id, t, d, k, extra){ log.added.push({ id, t, d, k, extra }); return Promise.resolve(true); },
    route(){},
    fbDb: { ref(p){ return {
      set(v){ log.set.push({ p, v }); return Promise.resolve(); },
      update(u){ log.up.push(u); return Promise.resolve(); },
      once(){
        var k = String(p).split('/')[1];
        if (opts.block) return Promise.reject(new Error('PERMISSION_DENIED'));
        return Promise.resolve({ val(){ return (opts.db || {})[k] || null; } });
      }
    }; }, }
  };
  box.fbDb.ref = (function(orig){ return function(p){
    if (p === undefined) return { update(u){ log.up.push(u); return Promise.resolve(); } };
    return orig(p);
  }; })(box.fbDb.ref);
  box.window = box;
  vm.createContext(box);
  vm.runInContext(
    W.match(/var paySrc=null, _payT=null;/)[0] + '\n'
    + grab('payLoad') + '\n' + grab('_payKey') + '\n' + grab('_payMon') + '\n' + grab('_payYm') + '\n'
    + grab('payRoll') + '\n' + grab('payLine') + '\n' + grab('payItemOf') + '\n'
    /* 2026-09-05 — 급여 업무의 담당을 푸른이알피 업체관리에서 찾아 넣는다.
       coSrc(업체 명단)·_peU2N(사번→이름)은 앱이 이미 들고 있는 것이라 흉내만 낸다. */
    + 'var coSrc=' + JSON.stringify(opts.co || null) + ';\n'
    + 'var _peU2N=' + JSON.stringify(opts.u2n || {}) + ';\n'
    + grab('payMgrOf') + '\n' + grab('payMakeItem') + '\n' + grab('payPutLine') + '\n'
    + 'var _payBusy=false;\n' + grab('paySync') + '\n'
    + 'this.load=payLoad; this.roll=payRoll; this.line=payLine; this.itemOf=payItemOf;'
    + 'this.make=payMakeItem; this.put=payPutLine; this.sync=paySync;', box);
  /* ⚠ 소스의 «var paySrc=null» 을 함께 돌리므로, 미리 넣어 둔 값이 그때 지워진다.
     그래서 돌린 «뒤에» 넣는다(이것 때문에 검사가 헛돌았다). */
  if (opts.pay !== undefined) box.paySrc = opts.pay;
  box._log = log;
  return box;
}

/* 9월: 자료 두 건 받고 명세서 두 명 보냄 (같은 사업장) */
const 급여 = {
  inbox: {
    m1:{ ts:new Date('2026-09-02T10:00:00').getTime(), 사업장:'㈜가나전자', 월:'9월', 종류:'급여대장' },
    m2:{ ts:new Date('2026-09-03T10:00:00').getTime(), 사업장:'가나전자',   월:'9월', 종류:'근태' },
    m3:{ ts:new Date('2026-09-04T10:00:00').getTime(), 사업장:'다라산업',   월:'9월' },
    m4:{ ts:new Date('2026-09-04T10:00:00').getTime(), 사업장:'',           월:'9월' }   // 사업장 미인식
  },
  sent: {
    '㈜가나전자|9월|홍길동':{ at:new Date('2026-09-05T09:00:00').getTime() },
    '㈜가나전자|9월|김철수':{ at:new Date('2026-09-05T09:01:00').getTime() },
    '이상한열쇠':{ at:1 }
  }
};

/* ══════════════════════════════════════
   ① 사업장×월로 한 덩어리
   ══════════════════════════════════════ */
test('표기가 달라도 같은 사업장이면 한 덩어리다 — 급여관리와 같은 잣대(siteKey)', () => {
  const b = makeBox({ pay:급여 });
  const r = b.roll();
  const 가나 = Object.keys(r).filter(k => k.indexOf('가나전자') === 0)[0];
  assert.ok(가나, '㈜가나전자와 가나전자가 갈라졌다');
  assert.equal(r[가나].got, 2);
  assert.equal(r[가나].sent, 2);
});

test('사업장이나 월을 못 읽은 줄은 셈에 안 넣는다 — 없는 것을 지어내지 않는다', () => {
  const r = makeBox({ pay:급여 }).roll();
  assert.equal(Object.keys(r).length, 2, '가나전자·다라산업 둘뿐이어야 한다');
});

test('열쇠 모양이 어긋난 발송 기록은 건너뛴다', () => {
  const r = makeBox({ pay:급여 }).roll();
  const 전체보냄 = Object.keys(r).reduce((n, k) => n + r[k].sent, 0);
  assert.equal(전체보냄, 2, '이상한 열쇠가 셈에 들어갔다');
});

test('월은 「9월」에서 읽고, 해는 손댄 때에서 정한다', () => {
  const r = makeBox({ pay:급여 }).roll();
  Object.keys(r).forEach(k => assert.match(r[k].ym, /^2026-09$/));
});

test('⚠ 12월 자료를 이듬해 1월에 만져도 해가 안 밀린다', () => {
  const b = makeBox({ pay:{ inbox:{ x:{ ts:new Date('2027-01-05T10:00:00').getTime(), 사업장:'가나', 월:'12월' } }, sent:{} } });
  const r = b.roll();
  assert.equal(r[Object.keys(r)[0]].ym, '2026-12');
});

/* ══════════════════════════════════════
   ② 한 줄로 어떻게 적나
   ══════════════════════════════════════ */
test('받은 것과 보낸 것을 한 줄에 담는다', () => {
  assert.equal(makeBox({}).line({ ym:'2026-09', got:3, sent:12 }),
    '💰 9월 급여 · 자료 3건 받음 · 명세서 12명 보냄');
});

test('한쪽만 있으면 그것만 적는다 — 「0건」을 굳이 알리지 않는다', () => {
  const b = makeBox({});
  assert.equal(b.line({ ym:'2026-09', got:3, sent:0 }), '💰 9월 급여 · 자료 3건 받음');
  assert.equal(b.line({ ym:'2026-09', got:0, sent:5 }), '💰 9월 급여 · 명세서 5명 보냄');
});

/* ══════════════════════════════════════
   ③ 고쳐 쓴다 — 쌓지 않는다
   ══════════════════════════════════════ */
const 업무 = { W1:{ company:'㈜가나전자', state:'open' } };

test('그 달 줄이 없으면 새로 만든다 — 월 표시(pm)를 함께 남긴다', async () => {
  const b = makeBox({ pay:급여, items:업무 });
  await b.put('W1', { ym:'2026-09', got:2, sent:2, last:Date.now(), site:'㈜가나전자' });
  assert.equal(b._log.added.length, 1);
  assert.equal(b._log.added[0].k, 'pay');
  assert.equal(b._log.added[0].extra.pm, '2026-09');
});

test('★ 그 달 줄이 있으면 «고쳐 쓴다» — 새로 쌓지 않는다', async () => {
  const b = makeBox({ pay:급여, items:업무,
    logs:{ W1:{ L1:{ k:'pay', pm:'2026-09', t:'💰 9월 급여 · 자료 1건 받음', w:'2026-W36' } } } });
  await b.put('W1', { ym:'2026-09', got:2, sent:2, last:Date.now(), site:'㈜가나전자' });
  assert.equal(b._log.added.length, 0, '새 줄을 만들었다');
  assert.equal(b._log.up.length, 1, '있던 줄을 안 고쳤다');
  const u = b._log.up[0];
  assert.match(JSON.stringify(u), /자료 2건 받음 · 명세서 2명 보냄/);
  assert.ok(Object.keys(u).some(k => /\/logs\//.test(k)) && Object.keys(u).some(k => /\/itemlogs\//.test(k)),
    '두 자리를 함께 고쳐야 한다 — 한쪽만 고치면 화면마다 다른 글이 보인다');
});

test('⚠ 달라진 것이 없으면 아무것도 안 쓴다 — 열 때마다 저장하면 트래픽만 먹는다', async () => {
  const b = makeBox({ pay:급여, items:업무,
    logs:{ W1:{ L1:{ k:'pay', pm:'2026-09', t:'💰 9월 급여 · 자료 2건 받음 · 명세서 2명 보냄', w:'2026-W36' } } } });
  const ch = await b.put('W1', { ym:'2026-09', got:2, sent:2, last:Date.now(), site:'㈜가나전자' });
  assert.equal(ch, false);
  assert.equal(b._log.added.length, 0);
  assert.equal(b._log.up.length, 0);
});

test('다른 달 줄은 건드리지 않는다 — 달마다 제 줄이 있다', async () => {
  const b = makeBox({ pay:급여, items:업무,
    logs:{ W1:{ L8:{ k:'pay', pm:'2026-08', t:'💰 8월 급여 · 자료 4건 받음', w:'2026-W32' } } } });
  await b.put('W1', { ym:'2026-09', got:1, sent:0, last:Date.now(), site:'㈜가나전자' });
  assert.equal(b._log.added.length, 1, '9월은 새 줄이어야 한다');
  assert.equal(b._log.up.length, 0, '8월 줄을 고쳤다');
});

/* ══════════════════════════════════════
   ④ 어디에 붙나
   ══════════════════════════════════════ */
test('그 사업장의 진행 업무에 붙는다', () => {
  assert.equal(makeBox({ items:업무 }).itemOf('가나전자')._id, 'W1');
});

test('짝이 없으면 null — 그때만 만든다', () => {
  assert.equal(makeBox({ items:업무 }).itemOf('없는회사'), null);
});

test('급여로 만든 업무가 있으면 그것에 붙인다 — 자문 업무를 급여 줄로 덮지 않는다', () => {
  const b = makeBox({ items:{
    W1:{ company:'㈜가나전자' },
    W2:{ company:'가나전자', pay_site:'가나전자' } } });
  assert.equal(b.itemOf('가나전자')._id, 'W2');
});

/* 2026-09-05 대표 지시 「급여에 대한 대응도 모두 업무에 포함」 —
   업체관리에서 담당을 찾아 넣는다. 못 찾으면 예전처럼 미지정이다. */
test('업체관리에서 담당을 못 찾으면 미지정으로 둔다 — 아무에게나 떠넘기지 않는다', async () => {
  const b = makeBox({ items:{} });
  await b.make('㈜가나전자');
  const v = b._log.set[0].v;
  assert.equal(v.cat, '급여');
  assert.equal(v.company, '㈜가나전자');
  assert.equal(v.pe_nomgr, true);
  assert.equal(v.mgr_main.name, '');
  assert.equal(v.pay_site, '가나전자');
  assert.match(b._log.set[0].p, /^work_erp\/items\/PAY-/);
});

test('이미 만든 업무는 두 번 안 만든다', async () => {
  const b = makeBox({ items:{ 'PAY-가나전자':{ company:'㈜가나전자' } } });
  await b.make('㈜가나전자');
  assert.equal(b._log.set.length, 0);
});

/* ══════════════════════════════════════
   ⑤ 권한이 없으면 그냥 안 돈다
   ══════════════════════════════════════ */
test('★ payroll_os 를 못 읽으면 아무것도 안 한다 — 고장이 아니다', async () => {
  const b = makeBox({ block:true, items:업무 });
  b.paySrc = null;
  const n = await b.sync();
  assert.equal(n, 0);
  assert.equal(b._log.added.length, 0);
  assert.equal(b._log.set.length, 0);
});

test('급여 앱을 한 글자도 안 건드린다 — 읽기만 한다', () => {
  const L = grab('payLoad');
  ['set(', 'update(', 'remove(', 'push('].forEach(t =>
    assert.ok(L.indexOf(t) < 0, '쓰기(' + t + ')가 들어 있다'));
  assert.match(L, /\.once\('value'\)/);
  // 쓰는 곳은 우리 자리(work_erp)뿐이다
  assert.ok(grab('payPutLine').indexOf('payroll_os') < 0);
  assert.ok(grab('payMakeItem').indexOf('payroll_os') < 0);
});

test('한 바퀴가 겹쳐 돌지 않는다', () => {
  assert.match(grab('paySync'), /if\(_payBusy\) return/);
});

test('업무 목록이 온 뒤에 돈다 — 먼저 돌면 붙일 자리를 못 찾는다', () => {
  assert.match(W, /setTimeout\(function\(\)\{ try\{ paySync\(\); \}catch\(e\)\{\} \}, 3000\);/);
});

test('여분 칸은 있을 때만 얹는다 — undefined 를 넣으면 파이어베이스가 물린다', () => {
  assert.match(grab('addLog'), /if\(extra\) for\(var _e in extra\)\{[^}]*extra\[_e\]!=null/);
});
