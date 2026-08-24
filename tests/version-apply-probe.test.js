/* 새 판으로 갈아탈 때, 그 판이 «실제로 나오는지» 먼저 두드려 본다
   (대표 제보 2026-08-24: 깃허브 오류 화면 — 분홍 유니콘 — 에 갇혔다)

   ★ 무슨 일이 있었나
     새 판이 올라오면 js/pu-version.js 가 곧바로 화면을 새로 열었다(?v=새커밋 8자리).
     그런데 깃허브 페이지는 배포를 «갈아 끼우는 동안» 잠깐 오류를 낸다. 하필 그 틈에
     열면 깃허브 오류 화면이 뜨는데, 거기서는 «우리 코드가 아예 안 돌아» 스스로
     빠져나올 수가 없다 — 사람이 직접 새로고침해야 했다.
     실제 화면: nabaho.github.io/pureunall/enter.html?v=35945b26 (PR #397 배포 직후)

   ★ 지키려는 것
     ① 먼저 받아 보고, 제대로 나올 때만 옮겨 간다
     ② 안 나오면 몇 번 더 기다렸다 두드린다 (배포는 대개 몇 초면 퍼진다)
     ③ 그래도 안 되면 «있던 화면에 머문다» — 옛 판이라도 도는 화면이,
        갇힌 오류 화면보다 낫다
   ※ 글자를 뒤지지 않고 «실제로 돌려 본다». 그래야 뜻이 지켜지는지 알 수 있다. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'pu-version.js'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, hint){
  if(cond){ pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (hint ? '\n    ' + hint : '')); }
}

/* ── 바깥세상 흉내 ──
   시계는 우리가 돌린다(45초를 진짜로 기다리지 않는다).
   화면 이동은 «갔다»만 적어 둔다. */
function makeWorld(pageStatus){
  const world = {
    navigated: null,
    clock: 0,
    timers: [],
    probes: 0,
    pageStatus: pageStatus,          // 새 판을 두드렸을 때 서버가 주는 응답
  };
  const noop = function(){};
  const el = () => ({
    style:{}, setAttribute:noop, addEventListener:noop, appendChild:noop,
    querySelector:() => null, removeChild:noop, parentNode:null, textContent:'', className:'',
  });
  const win = {
    PUVersion: undefined,
    URL: URL,
    Promise: Promise,
    /* ★ 시계도 우리가 쥔다 — 「손을 30초 놓으면 갈아탄다」를 진짜로 30초 기다릴 수 없다.
       Date.now() 만 쓰므로 그것만 흉내 내면 된다. */
    Date: { now: () => 1700000000000 + world.clock },
    Math: Math,
    location: { href:'https://x.test/enter.html', replace(u){ world.navigated = String(u); } },
    sessionStorage: (function(){ const m = {}; return {
      getItem:k => (k in m ? m[k] : null), setItem:(k,v) => { m[k] = String(v); }, removeItem:k => { delete m[k]; } }; })(),
    document: {
      readyState:'complete', scripts:[{ src:'https://x.test/js/pu-version.js?v=2' }],
      // <meta name="pu-release"> 에 «지금 판» 이 찍혀 있다
      querySelector:(s) => (/pu-release/.test(s) ? { getAttribute:() => 'OLDSHA000' } : null),
      createElement: el, addEventListener: noop, body: el(),
    },
    addEventListener: noop,
    setTimeout(fn, ms){ world.timers.push({ fn, at: world.clock + (ms || 0) }); return world.timers.length; },
    clearTimeout: noop,
    setInterval: () => 0,
    fetch(u){
      const url = String(u);
      if(url.indexOf('version.json') >= 0){
        return Promise.resolve({ ok:true, json:() => Promise.resolve({ sha:'NEWSHA111', shortSha:'newsha11' }) });
      }
      world.probes += 1;                                   // 새 판을 두드려 본 횟수
      return Promise.resolve({ ok: world.pageStatus < 400, status: world.pageStatus });
    },
  };
  win.window = win;
  world.win = win;
  /* 예약된 일을 시계만큼 돌린다 */
  world.tick = function(ms){
    world.clock += ms;
    const due = world.timers.filter(t => t.at <= world.clock).sort((a,b) => a.at - b.at);
    world.timers = world.timers.filter(t => t.at > world.clock);
    due.forEach(t => t.fn());
  };
  return world;
}

/* 약속(Promise)들이 다 끝나기를 기다린다 */
const settle = () => new Promise(r => setImmediate(r));

async function run(){
  /* ── ① 배포가 아직 안 퍼졌을 때: 옮겨 가지 않는다 ── */
  {
    const w = makeWorld(503);
    vm.createContext(w.win);
    vm.runInContext(SRC, w.win);
    await settle(); await settle();
    w.tick(2000); await settle(); await settle();   // scheduleApply → applyWhenIdle
    w.tick(60000); await settle(); await settle();  // 손 놓은 뒤(IDLE) 갈아타기 시도

    console.log('\n[① 배포가 아직 퍼지는 중(503) — 갇히지 않는다]');
    ok('★ 두드려는 봤다', w.probes >= 1, '두드린 횟수: ' + w.probes);
    ok('★ 오류가 나오는 판으로 «옮겨 가지 않는다»', w.navigated === null,
       '옮겨 간 곳: ' + w.navigated);

    /* 몇 번 더 기다렸다 두드린다 — 배포는 대개 몇 초면 퍼진다 */
    const before = w.probes;
    w.tick(3000); await settle(); await settle();
    w.tick(6000); await settle(); await settle();
    ok('★ 기다렸다 다시 두드린다', w.probes > before,
       before + '회 → ' + w.probes + '회');

    /* 그래도 안 되면 그만둔다 — 끝없이 두드리며 서버를 때리지 않는다 */
    for(let i = 0; i < 10; i++){ w.tick(60000); await settle(); await settle(); }
    ok('★ 끝없이 두드리지 않는다 (몇 번 해 보고 물러선다)', w.probes <= 6,
       '두드린 횟수: ' + w.probes);
    ok('★ 끝까지 안 되면 있던 화면에 머문다', w.navigated === null);
  }

  /* ── ② 배포가 다 퍼졌을 때: 곧바로 옮겨 간다 ── */
  {
    const w = makeWorld(200);
    vm.createContext(w.win);
    vm.runInContext(SRC, w.win);
    await settle(); await settle();
    w.tick(2000); await settle(); await settle();
    w.tick(60000); await settle(); await settle();

    console.log('\n[② 배포가 다 퍼졌으면(200) 갈아탄다]');
    ok('★ 새 판으로 옮겨 간다', typeof w.navigated === 'string' && w.navigated.indexOf('v=newsha11') > 0,
       '옮겨 간 곳: ' + w.navigated);
    ok('두드린 것은 한 번뿐이다 (될 때는 군더더기가 없다)', w.probes === 1,
       '두드린 횟수: ' + w.probes);
  }

  /* ── ③ 처음엔 안 나오다가 뒤늦게 나오면, 그때 옮겨 간다 ── */
  {
    const w = makeWorld(503);
    vm.createContext(w.win);
    vm.runInContext(SRC, w.win);
    await settle(); await settle();
    w.tick(2000); await settle(); await settle();
    w.tick(60000); await settle(); await settle();

    console.log('\n[③ 잠깐 안 나오다가 퍼지면 그때 간다]');
    ok('아직은 안 갔다', w.navigated === null);
    w.pageStatus = 200;                             // 배포가 이제 퍼졌다
    w.tick(3000); await settle(); await settle();
    ok('★ 퍼지고 나면 그때 옮겨 간다', typeof w.navigated === 'string' && w.navigated.indexOf('v=newsha11') > 0,
       '옮겨 간 곳: ' + w.navigated);
  }

  console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===\n');
  process.exit(fail ? 1 : 0);
}

run().catch(function(e){ console.log('★ 검사 자체가 터졌다: ' + (e && e.stack || e)); process.exit(1); });
