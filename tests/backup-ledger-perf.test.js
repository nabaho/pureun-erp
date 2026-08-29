/* 서버 백업 나눠 싣기·나눠 지우기 + 거래내역 드롭다운 후보 자르기
   ★ 백업이 한 덩어리 쓰기라 16MB 한도(write_too_big)에 걸려 조용히 실패했고,
     너무 커진 옛 스냅샷은 삭제조차 같은 한도에 걸려 쌓이며 용량(1GB)을 채웠다.
   ★ 거래내역은 행마다 미입금 수백 건을 <option> 으로 만들어 클릭마다 화면이 멈췄다.
   둘 다 "잘못되면 조용히" 라서, 여기서 소리 나게 고정한다. */
const fs = require('fs');
const vm = require('vm');
const { webcrypto } = require('node:crypto');
const path = require('path');

const HTML = path.join(__dirname, '..', 'pu-erp.html');
// 줄바꿈은 LF 로 통일해 읽는다 (윈도우 CRLF / CI LF 양쪽에서 같은 표식이 찾히도록)
const src = fs.readFileSync(HTML, 'utf8').replace(/\r\n/g, '\n');

function slice(a, b){
  const i = src.indexOf(a);
  if(i < 0) throw new Error('시작 표식 못찾음: ' + a);
  const j = src.indexOf(b, i);
  if(j < 0) throw new Error('끝 표식 못찾음: ' + b);
  return src.slice(i, j);
}

let pass = 0, fail = 0;
const t = (name, got, want) => {
  const G = JSON.stringify(got), W = JSON.stringify(want);
  if(G === W) pass++;
  else { fail++; console.log('FAIL ' + name + '\n  got  = ' + G + '\n  want = ' + W); }
};

/* ══════ 1. erpBackupBatches — 나눠 싣기 ══════ */
const bctx = (function(){
  const c = { console, Object, JSON, Array, String, Number, parseInt, isNaN, Math, window:{} };
  vm.createContext(c);
  vm.runInContext(slice('var BACKUP_BATCH_CHARS =', '// 스냅샷 한 벌 저장'), c);
  return c;
})();
// 조각들을 도로 합쳐 원본과 같은지 본다 — 실시간DB 가 하듯 경로를 적용하고,
// 0부터 이어지는 숫자 키 객체는 배열로 되돌린다.
function reassemble(batches){
  const root = {};
  batches.forEach(b => Object.keys(b).forEach(p => {
    const parts = p.split('/');
    let cur = root;
    for(let i = 0; i < parts.length - 1; i++){
      if(!cur[parts[i]]) cur[parts[i]] = {};
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = b[p];
  }));
  function arr(o){
    if(o === null || typeof o !== 'object' || Array.isArray(o)) return o;
    const ks = Object.keys(o);
    if(ks.length && ks.every((k, i) => String(i) === k || /^\d+$/.test(k))){
      const nums = ks.map(Number).sort((a, b) => a - b);
      if(nums[0] === 0 && nums[nums.length - 1] === nums.length - 1){
        return nums.map(n => arr(o[String(n)]));
      }
    }
    const out = {};
    ks.forEach(k => { out[k] = arr(o[k]); });
    return out;
  }
  return arr(root.data || {});
}
{
  // 작은 데이터 → 한 조각, 그대로 복원
  const data = { contracts: [{ id:'c1', name:'가나' }], app_settings: { a:1 } };
  const bs = bctx.erpBackupBatches(data, 1000000);
  t('작은 스냅샷은 한 조각', bs.length, 1);
  t('★ 조각을 합치면 원본 그대로', reassemble(bs), data);
}
{
  // 저장소 여러 개가 한도를 나눠 탄다
  const big = s => new Array(60).fill(0).map((_, i) => ({ id: s + i, memo: 'x'.repeat(50) }));
  const data = { a: big('a'), b: big('b'), c: big('c') };
  const one = JSON.stringify(data.a).length;              // 약 4천 자
  const bs = bctx.erpBackupBatches(data, one + 100);      // 조각당 저장소 하나 남짓
  t('★ 한도에 맞춰 여러 조각으로 갈린다', bs.length >= 3, true);
  bs.forEach(function(b, i){
    const sz = Object.keys(b).reduce((s, p) => s + JSON.stringify(b[p]).length, 0);
    t('조각 ' + i + ' 이 한도 안', sz <= one + 100, true);
  });
  t('★ 그래도 합치면 원본 그대로', reassemble(bs), data);
}
{
  // ★ 한 저장소가 혼자 한도를 넘으면(큰 배열) 행 단위로 쪼개지고, 합치면 배열로 돌아온다
  const rows = new Array(200).fill(0).map((_, i) => ({ id: 'r' + i, memo: 'ㅁ'.repeat(40), amount: i }));
  const data = { bank: rows, small: { x: 1 } };
  const lim = Math.floor(JSON.stringify(rows).length / 4);   // 배열 전체의 1/4 만 허용
  const bs = bctx.erpBackupBatches(data, lim);
  t('★ 큰 배열이 여러 조각으로 갈린다', bs.length >= 4, true);
  const paths = bs.flatMap(b => Object.keys(b));
  t('★ 행 단위 경로(data/bank/0…)로 실린다', paths.some(p => /^data\/bank\/\d+$/.test(p)), true);
  t('★ 합치면 배열 그대로 (모양이 안 바뀐다)', reassemble(bs), data);
}
{
  // 방어
  t('빈 데이터는 조각 없음', bctx.erpBackupBatches({}, 1000), []);
  t('null 도 안 터진다', bctx.erpBackupBatches(null, 1000), []);
  const weird = { f: function(){}, ok: [1, 2] };            // 직렬화 불가 키는 건너뛴다
  t('직렬화 불가 키는 조용히 건너뛴다', reassemble(bctx.erpBackupBatches(weird, 1000)), { ok: [1, 2] });
}

/* ══════ 2. buildBackupSnapshot — 임시 작업분 제외 ══════ */
{
  const store = {};
  const put = (k, v) => { store['pureun_v6_' + k] = JSON.stringify(v); };
  put('contracts', [{ id:'c1' }]);
  put('bank_ledger_draft', { rows: new Array(50).fill({ memo:'큰 임시 작업분' }) });
  put('co_merge_log', [{ id:'m1' }]);
  put('cms_ledger', [{ id:'cms1' }]);
  const c = {
    console, Object, JSON, Array, String, Number, Date,
    KEY: 'pureun_v6_',
    localStorage: {
      get length(){ return Object.keys(store).length; },
      key(i){ return Object.keys(store)[i]; },
      getItem(k){ return (k in store) ? store[k] : null; }
    }
  };
  vm.createContext(c);
  vm.runInContext(slice('function buildBackupSnapshot(){', '// 백업 목록용 경량 요약'), c);
  const snap = c.buildBackupSnapshot();
  t('진짜 데이터는 백업에 들어간다', !!snap.data.contracts, true);
  t('cms_ledger 도 들어간다 (서버 동기화 대상)', !!snap.data.cms_ledger, true);
  t('★ 올린 통장 파일(bank_ledger_draft)은 백업에 안 들어간다', 'bank_ledger_draft' in snap.data, false);
  t('★ 이 PC 전용 되돌리기 기록도 안 들어간다', 'co_merge_log' in snap.data, false);
}

/* ══════ 3. serverBackupWrite — 순서와 실패 처리 ══════ */
function writeCtx(failAt){
  const calls = [];
  let n = 0;
  const mkRef = (path) => ({
    set(v){ n++; calls.push({ op:'set', path: path || '/', size: JSON.stringify(v||{}).length });
      return (failAt === n) ? Promise.reject(new Error('write_too_big')) : Promise.resolve(); },
    update(v){ n++; calls.push({ op:'update', path: path || '/', keys: Object.keys(v) });
      return (failAt === n) ? Promise.reject(new Error('write_too_big')) : Promise.resolve(); },
    /* 백업 열쇠는 «없을 때만» 넣는 transaction 으로 얻는다 (2026-08-29 주민번호 잠금).
       쓰기 횟수에는 안 센다 — 이 검사가 세는 것은 백업 조각을 싣는 횟수다. */
    transaction(fn){ const v = fn(null); return Promise.resolve({ snapshot: { val: () => v } }); }
  });
  const c = {
    console: { log(){}, warn(){}, error(){} }, Object, JSON, Array, String, Number, parseInt, isNaN, Math, Promise,
    Error, Uint8Array, TextEncoder, TextDecoder, crypto: webcrypto,
    btoa: (x) => Buffer.from(x, 'binary').toString('base64'),
    atob: (x) => Buffer.from(x, 'base64').toString('binary'),
    fbDb: { ref: (p) => mkRef(p) },
    _snapSummary(){ return '요약'; },
    /* 2026-08-16 부터 인덱스에 id 명부(ids)가 같이 실린다 — 유실 검사가 본문을
       통째로 안 받게 하는 장치. 여기서는 흐름만 보므로 빈 명부로 대신한다. */
    _snapIdIndex(){ return {}; }
  };
  c.window = c;                 // 잠금 모듈이 window 에 붙는다
  vm.createContext(c);
  /* ★ 잠금 모듈을 «진짜로» 넣는다 — 가짜로 때우면 「백업이 실제로 잠기는가」를
     이 검사가 못 본다(2026-08-29 대표 지시 「백업 시 주번 암호화」). */
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'pu-rrn-seal.js'), 'utf8'), c);
  vm.runInContext(slice('var BACKUP_BATCH_CHARS =', '// 스냅샷 한 벌 삭제'), c);
  return { c, calls };
}
{
  const { c, calls } = writeCtx(0);
  const rows = new Array(40).fill(0).map((_, i) => ({ id:'r'+i, memo:'m'.repeat(30) }));
  let batches = 0;
  c.serverBackupWrite('2026-08-09', { savedAt:'T', version:'v6', data:{ a: rows, b: { x: 1 } } })
    .then(function(nn){ batches = nn; })
    .then(function(){
      t('★ 머리(메타)를 맨 먼저 set — 이전 반쪽을 지운다', calls[0].op === 'set' && calls[0].path === 'serverBackups/2026-08-09', true);
      t('조각은 스냅샷 자리에 update 로 실린다', calls.slice(1, -1).every(x => x.op === 'update' && x.path === 'serverBackups/2026-08-09'), true);
      t('★ 인덱스는 맨 마지막 — 전부 성공한 뒤에만', calls[calls.length - 1].path, 'serverBackupsIndex/2026-08-09');
      t('조각 수를 돌려준다', batches >= 1, true);
      afterWrite();
    })
    .catch(function(e){ fail++; console.log('FAIL serverBackupWrite 정상 흐름: ' + e.message); afterWrite(); });
}
function afterWrite(){
  // 조각 쓰기(2번째 호출)가 실패하면 인덱스를 쓰지 않는다
  const { c, calls } = writeCtx(2);
  let rejected = false;
  c.serverBackupWrite('2026-08-09', { savedAt:'T', version:'v6', data:{ a: [{ id:1 }] } })
    .catch(function(){ rejected = true; })
    .then(function(){
      t('★ 조각이 실패하면 전체가 실패로 알려진다', rejected, true);
      t('★ 실패했으면 인덱스는 안 쓴다 (반쪽이 목록에 안 보이게)',
        calls.some(x => String(x.path).indexOf('serverBackupsIndex') === 0), false);
      afterDelete();
    });
}
/* ══════ 4. erpBackupDeleteSnap — 나눠 지우기 ══════ */
function afterDelete(){
  const calls = [];
  const c = {
    console: { log(){}, warn(){} }, Object, JSON, Array, String, Number, Promise, Math, parseInt,
    window: {},
    FB_ALL_SYNC_KEYS: ['contracts','cases','finance_income'],
    SERVER_BACKUP_KEYS: ['contracts','activity_log'],
    fbDb: { ref: (p) => ({ update(v){ calls.push({ path: p || '/', keys: Object.keys(v) }); return Promise.resolve(); } }) }
  };
  vm.createContext(c);
  vm.runInContext(slice('function _backupKnownKeys(){', 'window.erpBackupDeleteSnap = erpBackupDeleteSnap;'), c);
  c.erpBackupDeleteSnap('2026-01-01').then(function(){
    t('★ 저장소들을 먼저 하나씩 비운다', calls.length >= 2, true);
    const first = calls.slice(0, -1);
    t('비우는 경로가 그 스냅샷의 data 안', first.every(x => x.keys.every(k => k.indexOf('serverBackups/2026-01-01/data/') === 0)), true);
    t('한 번에 40개 이하로 나눠 지운다', first.every(x => x.keys.length <= 40), true);
    const last = calls[calls.length - 1];
    t('★ 껍데기와 인덱스는 맨 마지막에 지운다',
      last.keys.indexOf('serverBackups/2026-01-01') >= 0 && last.keys.indexOf('serverBackupsIndex/2026-01-01') >= 0, true);
    afterPend();
  });
}

/* ══════ 5. erpPendOptions — 드롭다운 후보 자르기 ══════ */
function afterPend(){
  const c = { console, Object, JSON, Array, String, Number, parseInt, isNaN, Math, window:{} };
  vm.createContext(c);
  vm.runInContext(slice('function erpPendOptions(pending, usedBy', 'function FinanceLedger('), c);
  const mk = (n, base) => new Array(n).fill(0).map((_, i) => ({ id:'p'+i, expect: base + i * 1000, companyName:'회사'+i, label:'자문료' }));
  {
    const po = c.erpPendOptions(mk(444, 100000), {}, 'row1', 130000, '', 30);
    t('★ 444건이 30건으로 잘린다', po.list.length, 30);
    t('잘린 수를 알려 준다', po.more, 414);
    t('전체 수도 알려 준다', po.total, 444);
    t('★ 금액 가까운 순 — 첫 후보가 정확 일치', po.list[0].expect, 130000);
    const diffs = po.list.map(p => Math.abs(p.expect - 130000));
    t('★ 가까운 순 정렬이 유지된다', diffs.every((d, i) => i === 0 || d >= diffs[i-1]), true);
  }
  {
    // 다른 행이 고른 후보는 빠지고, 이 행 자신이 고른 것은 남는다
    const pend = mk(10, 100000);
    const used = { p3: 'otherRow', p5: 'row1' };
    const po = c.erpPendOptions(pend, used, 'row1', 100000, '', 30);
    t('★ 다른 행이 고른 후보는 빠진다', po.list.some(p => p.id === 'p3'), false);
    t('★ 이 행이 고른 후보는 남는다', po.list.some(p => p.id === 'p5'), true);
  }
  {
    // ★ 이 행이 고른 후보가 30등 밖이어도 목록에 도로 들어온다 — 빠지면 화면에서 선택이 사라져 보인다
    const pend = mk(100, 100000);                      // p0=100000 … p99=199000
    const po = c.erpPendOptions(pend, {}, 'row1', 100000, 'p99', 30);
    t('★ 선택돼 있던 먼 후보도 목록에 들어온다', po.list.some(p => p.id === 'p99'), true);
    t('그만큼 more 에서 빠진다', po.more, 100 - po.list.length);
  }
  {
    t('빈 목록도 안 터진다', c.erpPendOptions([], {}, 'r', 0, '', 30), { list:[], more:0, total:0 });
    t('null 이 섞여도 안 터진다', c.erpPendOptions([null, { id:'a', amount:5 }], null, 'r', 5, '', 30).list.length, 1);
    t('expect 가 없으면 amount 로 잰다', c.erpPendOptions([{ id:'a', amount: 700 }], {}, 'r', 700, '', 30).list[0].id, 'a');
  }

  /* ══════ 6. 배선 ══════ */
  t('★ 아침 백업이 나눠 싣기를 쓴다', /serverBackupWrite\(ymd, snap\)/.test(src), true);
  t('★ 저녁 백업도 나눠 싣기를 쓴다', /serverBackupWrite\(key, snap\)/.test(src), true);
  t('★ 옛 백업 통째 한 덩어리 쓰기가 사라졌다', /w\['serverBackups\/'\s*\+\s*ymd\]\s*=\s*snap/.test(src), false);
  t('★ 자동 정리(prune)가 나눠 지우기를 쓴다', /pp = pp\.then\(function\(\)\{ return erpBackupDeleteSnap\(dd\); \}\);/.test(src), true);
  t('★ 수동 정리도 나눠 지우기를 쓴다', /p = p\.then\(function\(\)\{ return erpBackupDeleteSnap\(dd\); \}\)/.test(src), true);
  t('★ 백업 실패가 소리를 낸다', /console\.warn\('\[ERP\] 서버 백업 실패:'/.test(src), true);
  /* (2026-08-09) 행마다 있던 <select> 자체를 없앴다 — 30건으로 자르는 것보다 확실한 답이다.
     고를 것은 「찾기 창」에서 고르고, 표에는 한 줄만 남는다.
     자르기 함수(erpPendOptions)는 그 창에서 계속 쓴다 — 다른 줄이 고른 건을 빼는 장치가 그 안에 있다. */
  t('★ 행마다 미입금 <option> 을 만들지 않는다',
    /h\('option',\{value:''\},'-- 업체\/항목 선택 --'\)/.test(src), false);
  t('★ 행마다 inMatch 전체를 훑던 filter 가 사라졌다',
    /pending\.filter\(function\(p\)\{\s*\n\s*var used=Object\.keys\(inMatch\)\.some/.test(src), false);
  t('찾기 창이 후보 자르기를 쓴다',
    /erpPendOptions\(pending, pendUsedBy, sugPopK, _row\.amount, _sel, 200\)/.test(src), true);
  t('다른 줄이 고른 건은 찾기 창에서도 빠진다', /if\(u && u !== rowKey\) continue;/.test(src), true);
  t('고른 후보 지도는 렌더마다 한 번만 만든다', /var pendUsedBy = \{\};/.test(src), true);

  console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===');
  process.exit(fail ? 1 : 0);
}
