'use strict';
/* 부팅 「볼 수 있는 것만」 + 「안 바뀐 표는 다시 안 받기」
   (설계서 docs/superpowers/specs/2026-08-16-부팅-받기-줄이기-design.md, 대표 승인 2건)

   1차(#269): 통째 once() 뒤 data.on() 을 붙여 같은 2.83MB 를 한 번 더 받던 것
   (켤 때마다 5.7MB)을 열쇠별 구독으로 바꿈 + 재무 권한 없는 8명에게 급여·수입
   내려보내던 것을 끊음.
   2차(이 판): 어제 받은 표의 대부분은 오늘도 그대로인데 매번 전부 다시 받았다.
   모든 저장 경로가 표의 「바뀐 시각」(data/{표}/u)을 반드시 갱신하므로, 표마다
   그 한 칸만 감시(u-감시)하고 바뀐 표만 표 구독(live)으로 올린다.

   ⚠ 이 검사는 글자 검사가 아니다 — 가짜 fbDb·fetchT 로 **실제로 돌려서**
     어느 경로를 몇 번 읽는지 센다(이 저장소가 글자 검사에 네 번 속았다).
   실행: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const app = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8');

function sliceBetween(startMark, endMark, name) {
  const i = app.indexOf(startMark);
  assert.ok(i >= 0, name + ' 시작(' + startMark.slice(0, 30) + '…)을 찾을 수 없습니다');
  const j = app.indexOf(endMark, i);
  assert.ok(j > i, name + ' 끝을 찾을 수 없습니다');
  return app.slice(i, j);
}

/* ── 떠 올 조각들 ── */
const SRC_EXCLUDE = sliceBetween('var FB_EXCLUDE = [', 'var FB_FIN_KEYS', 'FB_EXCLUDE/fbShouldSync');
const SRC_CONSTS  = sliceBetween('var FB_FIN_KEYS = [', '// ── [보안규칙 대비] 전체 동기화 키', '가르기 상수');
const SRC_BOOT    = sliceBetween('/* ── 초기 동기화 갈림길', 'function _fbInitialSyncFull(', '부팅 갈림길');

/* 실측 서버 열쇠 명단(2026-08-16, data shallow) — 표류 검증용 고정값(일부) */
const MEASURED_KEYS = ['finance_income','payroll_monthly','companies','cms_ledger','contracts',
  'ledger_batches','payroll_audit_log','contract_forms','co_merge_log','consultings','closed_archive',
  'attendance_records','bank_processed','cases','finance_expense','user_accounts','project_progress',
  'mgr_rates','funds','leave_ledger','audit_log','error_log','trash_bin','activity_log',
  'mig_vat_type_v1','company_migration_v1_done','real_payroll_v3','user_dir','my_schedules',
  'ledger_held','payer_aliases','recurring_expenses','pay_items','dc_contributions','session'];

/* 가짜 서버 — 표마다 u(바뀐 시각)와 본문을 두고, 무엇을 몇 번 읽는지 센다 */
function makeEnv(opts) {
  opts = opts || {};
  const serverU = opts.serverU || {};             // k → u (없으면 1000)
  const reads = { watch: [], live: [], once: [], shallow: 0 };
  const shallowObj = {};
  (opts.serverKeys || MEASURED_KEYS).forEach(k => { shallowObj[k] = true; });

  const uListeners = {}, liveListeners = {};
  const applied = [];
  let fullCalls = 0;

  const sandbox = {
    console: { log() {}, warn() {}, table() {} },
    Promise, JSON, Object, Array, String, Number, Date, Error, parseInt,
    setTimeout, clearTimeout, encodeURIComponent,
    KEY: 'pureun_v6_',
    localStorage: {
      _s: opts.ls || {},
      getItem(k) { return Object.prototype.hasOwnProperty.call(this._s, k) ? this._s[k] : null; },
      setItem(k, v) { this._s[k] = String(v); }
    },
    firebase: {
      auth() {
        return { currentUser: opts.noUser ? null : {
          uid: 'U1', getIdToken() { return Promise.resolve('TOK'); }
        } };
      }
    },
    fetchT(url) {
      reads.shallow++;
      if (opts.shallowFail) return Promise.resolve({ ok: false, status: 401 });
      return Promise.resolve({ ok: true, json: () => Promise.resolve(shallowObj) });
    },
    fbDb: {
      ref(p) {
        return {
          once(_ev) {
            reads.once.push(p);
            if (p.indexOf('uid_roles/') === 0) {
              if (opts.rolesReject) return Promise.reject(new Error('perm'));
              return Promise.resolve({ val: () => (opts.fin === undefined ? null : opts.fin) });
            }
            return Promise.resolve({ val: () => null });
          },
          on(_ev, cb, err) {
            const mU = p.match(/^data\/([^/]+)\/u$/);
            const mK = p.match(/^data\/([^/]+)$/);
            if (mU) {
              reads.watch.push(mU[1]);
              uListeners[mU[1]] = { cb, err };
              if (opts.holdFirst) return;
              setTimeout(() => {
                if (opts.errPaths && opts.errPaths.indexOf(p) >= 0) { err && err(new Error('denied')); return; }
                const u = Object.prototype.hasOwnProperty.call(serverU, mU[1]) ? serverU[mU[1]] : 1000;
                cb({ val: () => u });
              }, 0);
            } else if (mK) {
              reads.live.push(mK[1]);
              liveListeners[mK[1]] = { cb, err };
              if (opts.holdFirst) return;
              setTimeout(() => {
                const u = Object.prototype.hasOwnProperty.call(serverU, mK[1]) ? serverU[mK[1]] : 1000;
                cb({ val: () => ({ v: [1], u: u }) });
              }, 0);
            }
          }
        };
      }
    },
    _fbApplyRecord(k, v, o) { applied.push({ k, opts: o }); return true; },
    _drainShrinkQueue() {},
    _fbInitialSyncFull() { fullCalls++; return Promise.resolve(99); },
    window: {}
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(SRC_EXCLUDE + '\n' + SRC_CONSTS + '\n' + SRC_BOOT, { filename: 'boot-sync.js' })
    .runInContext(sandbox);
  return {
    sandbox, reads, applied, uListeners, liveListeners,
    fullCalls: () => fullCalls,
    plan: () => sandbox._bootKeyPlan(),
    sync: (r) => sandbox.fbInitialSync(r)
  };
}
/* 로컬 사본 + 동기화 시각을 심는다 */
function withCache(keys, u) {
  const ls = {};
  keys.forEach(k => { ls['pureun_v6_' + k] = '[]'; ls['pureun_v6__meta_' + k] = String(u); });
  return ls;
}
const tick = () => new Promise(r => setTimeout(r, 5));

/* ══════ ① 계획 — 누가 무엇을 받는가 (1차에서 지키던 것 그대로) ══════ */

test('★ 재무 권한이 없으면(fin=false) 급여·수입·장부를 계획에서 뺀다', async () => {
  const env = makeEnv({ fin: false });
  const plan = await env.plan();
  assert.equal(plan.mode, 'perKey');
  for (const k of ['finance_income', 'payroll_monthly', 'cms_ledger', 'ledger_batches', 'bank_processed']) {
    assert.ok(plan.keys.indexOf(k) < 0, '★ ' + k + ' 를 권한 없는 기기가 받습니다');
  }
  assert.ok(plan.keys.indexOf('companies') >= 0, '업무 데이터까지 빠지면 화면이 깨집니다');
});

test('★ funds·mgr_rates 는 fin=false 여도 받는다 — 기금 «업무» 목록은 전 직원 화면이 쓴다', async () => {
  const env = makeEnv({ fin: false });
  const plan = await env.plan();
  assert.ok(plan.keys.indexOf('funds') >= 0, '★ funds 가 빠지면 기금 업무 화면이 깨집니다');
  assert.ok(plan.keys.indexOf('mgr_rates') >= 0);
});

test('★ 권한을 모르면(fin=undefined) 전부 받는다 — 명시적 false 만 가른다', async () => {
  const env = makeEnv({});
  const plan = await env.plan();
  assert.equal(plan.mode, 'perKey');
  assert.ok(plan.keys.indexOf('finance_income') >= 0,
    '★ 권한이 불명확한데 가르면 재무 담당자가 빈 화면을 봅니다');
});

test('★ 권한·명단 조회가 실패하면 통째 읽기로 간다 (fail-open)', async () => {
  const a = makeEnv({ rolesReject: true });
  await a.sync();
  assert.equal(a.fullCalls(), 1, '★ 조회 실패인데 가르기를 강행하면 무엇이 빠졌는지 아무도 모릅니다');
  const b = makeEnv({ fin: true, shallowFail: true });
  await b.sync();
  assert.equal(b.fullCalls(), 1);
});

test('되돌림 스위치를 켜면 무조건 통째 읽기다', async () => {
  const env = makeEnv({ fin: true, ls: { pureun_v6_boot_full: '1' } });
  await env.sync();
  assert.equal(env.fullCalls(), 1);
});

test('★ 로그류·안 올리는 것(payroll_audit_log·co_merge_log·session)은 부팅에서 안 받는다', async () => {
  const env = makeEnv({ fin: true });
  const plan = await env.plan();
  for (const k of ['payroll_audit_log', 'co_merge_log', 'session']) {
    assert.ok(plan.keys.indexOf(k) < 0, '★ ' + k + ' 를 부팅에서 받고 있습니다');
  }
});

test('★ 새 열쇠·이사표시가 명단에 있으면 저절로 포함된다 — 굳은 목록의 표류가 없다', async () => {
  const env = makeEnv({ fin: true });
  const plan = await env.plan();
  for (const k of ['mig_vat_type_v1', 'company_migration_v1_done', 'real_payroll_v3']) {
    assert.ok(plan.keys.indexOf(k) >= 0, '★ ' + k + ' 가 빠지면 이미 끝난 이사가 다시 돕니다');
  }
});

/* ══════ ② 안 바뀐 표는 다시 안 받기 — 이번 판의 핵심 ══════ */

test('★ 지난번 사본과 시각이 같은 표는 본문을 안 받는다 — 시각 한 칸만 본다', async () => {
  const keys = ['companies', 'cases'];
  const env = makeEnv({
    fin: true, serverKeys: keys,
    serverU: { companies: 500, cases: 500 },
    ls: withCache(keys, 500)                     // 지난번에 받아 둔 그대로
  });
  await env.sync();
  assert.deepEqual(env.reads.watch.sort(), ['cases', 'companies'], 'u-감시가 안 붙었습니다');
  assert.equal(env.reads.live.length, 0,
    '★ 안 바뀐 표의 본문을 또 받습니다 — 이 기능의 존재 이유가 사라집니다');
});

test('★ 바뀐 표만 본문을 받는다', async () => {
  const keys = ['companies', 'cases'];
  const env = makeEnv({
    fin: true, serverKeys: keys,
    serverU: { companies: 900, cases: 500 },     // companies 만 그 뒤에 바뀜
    ls: withCache(keys, 500)
  });
  const n = await env.sync();
  assert.deepEqual(env.reads.live, ['companies'], '바뀐 표를 못 알아봅니다');
  assert.equal(n, 1);
});

test('★ 사본이 없거나 시각이 없으면 받는다 (fail-open)', async () => {
  const keys = ['companies', 'cases', 'consultings'];
  const env = makeEnv({
    fin: true, serverKeys: keys,
    serverU: { companies: 500, cases: 500, consultings: 500 },
    ls: (() => {
      const l = withCache(['companies', 'consultings'], 500);
      delete l['pureun_v6__meta_companies'];   // companies: 사본은 있는데 시각이 없음
      delete l['pureun_v6_consultings'];       // consultings: 시각은 맞는데 사본이 없음
      return l;                                //   (저장공간 부족으로 사본만 날아간 경우) / cases: 둘 다 없음
    })()
  });
  await env.sync();
  assert.deepEqual(env.reads.live.sort(), ['cases', 'companies', 'consultings'],
    '★ 모르는데(또는 사본이 없는데) 믿으면 낡은·빈 화면으로 일하게 됩니다');
});

test('★ 시각(u)이 없는 옛 표는 사본이 있으면 그대로 쓴다', async () => {
  const env = makeEnv({
    fin: true, serverKeys: ['device_id'],
    serverU: { device_id: null },
    ls: withCache(['device_id'], 1)
  });
  await env.sync();
  assert.equal(env.reads.live.length, 0, 'u 없는 일회성 표시까지 매번 받습니다');
});

test('★ 감시 중이던 표가 바뀌면 그때 본문 구독으로 올라간다 — 실시간이 산다', async () => {
  const keys = ['companies'];
  const env = makeEnv({
    fin: true, serverKeys: keys,
    serverU: { companies: 500 },
    ls: withCache(keys, 500)
  });
  const remote = [];
  env.sandbox.window._fbApplyRemote = function (k, v) { remote.push(k); return true; };
  await env.sync();
  assert.equal(env.reads.live.length, 0);
  env.uListeners.companies.cb({ val: () => 900 });   // 다른 기기가 저장했다
  await tick();
  assert.deepEqual(env.reads.live, ['companies'],
    '★ 감시가 바뀜을 보고도 안 받으면 동료의 변경이 화면에 안 옵니다');
  assert.deepEqual(remote, ['companies'], '실시간 적용기(알림·폭풍감지)로 가야 합니다');
});

test('★ 이미 본문 구독 중인 표는 시각이 또 바뀌어도 다시 안 받는다 — 델타가 온다', async () => {
  const keys = ['companies'];
  const env = makeEnv({
    fin: true, serverKeys: keys,
    serverU: { companies: 900 },
    ls: withCache(keys, 500)                      // 바뀌었으니 부팅에 본문 구독으로 올라간다
  });
  env.sandbox.window._fbApplyRemote = function () { return true; };
  await env.sync();
  assert.equal(env.reads.live.length, 1);
  env.uListeners.companies.cb({ val: () => 950 });  // 또 바뀜 — 하지만 이미 구독 중
  await tick();
  assert.equal(env.reads.live.length, 1,
    '★ 구독 중인데 또 붙으면 저장할 때마다 큰 표를 통째로 다시 받습니다');
});

test('★ 첫 받기는 부팅 적용(deferGate), 그 뒤 값은 실시간 적용으로 간다', async () => {
  const keys = ['companies'];
  const env = makeEnv({ fin: true, serverKeys: keys, serverU: { companies: 900 }, ls: withCache(keys, 1) });
  const remote = [];
  env.sandbox.window._fbApplyRemote = function (k) { remote.push(k); return true; };
  await env.sync();
  assert.ok(env.applied.length > 0);
  assert.ok(env.applied.every(a => a.opts && a.opts.deferGate === true),
    '첫 값이 급감 보류 큐를 안 거치면 로그인 직후 모달이 쏟아집니다');
  env.liveListeners.companies.cb({ val: () => ({ v: [1, 2], u: 950 }) });
  assert.deepEqual(remote, ['companies']);
});

test('★ 같은 표에 감시를 두 번 안 붙인다 — 재동기화가 공짜', async () => {
  const env = makeEnv({ fin: true });
  await env.sync();
  const w = env.reads.watch.length, l = env.reads.live.length;
  await env.sync();
  assert.equal(env.reads.watch.length, w, '★ 부를 때마다 감시가 또 붙습니다');
  assert.equal(env.reads.live.length, l);
});

test('한 표가 거부·침묵해도 부팅이 멎지 않는다', async () => {
  const env = makeEnv({ fin: true, errPaths: ['data/companies/u'] });
  const n = await env.sync();
  assert.equal(typeof n, 'number');
  assert.equal(env.sandbox._fbKeyWatch.companies, false, '거부된 표시가 안 지워지면 영영 다시 못 붙습니다');

  const h = makeEnv({ fin: true, holdFirst: true, serverKeys: ['companies'] });
  h.sandbox._FB_KEY_FIRST_TIMEOUT_MS = 30;
  assert.equal(typeof (await h.sync()), 'number', '침묵하는 표 하나에 부팅 전체가 멈춥니다');
});

test('★ erpEnsureKeys 는 감시를 안 거치고 곧바로 본문 구독이다 — 시각만 믿는 지름길 금지', async () => {
  const env = makeEnv({
    fin: true, serverKeys: ['companies'],
    serverU: { companies: 500, payroll_audit_log: 500 },
    // 감사 로그는 사본도 시각도 맞다 — 그래도 받아야 한다. companies 는 부팅이
    // 사본을 그대로 쓰게 맞춰 둔다(이 검사가 볼 것은 ensure 쪽뿐이다).
    ls: withCache(['companies', 'payroll_audit_log'], 500)
  });
  await env.sync();
  await env.sandbox.window.erpEnsureKeys(['payroll_audit_log']);
  assert.deepEqual(env.reads.live, ['payroll_audit_log'],
    '★ 감사 로그를 시각만 보고 믿으면, 옛 코드 기기가 방금 덧붙인 기록을 덮습니다');
  const l = env.reads.live.length;
  await env.sandbox.window.erpEnsureKeys(['payroll_audit_log']);
  assert.equal(env.reads.live.length, l, '이미 받은 것을 또 받습니다');
});

/* ══════ ③ 전역 구독 — 이중 다운로드의 두 번째 절반 (1차 그대로) ══════ */

function loadSetupListener(perKey) {
  const src = sliceBetween('function fbSetupListener(){', '\n// 페이지 로드 시 자동 실행', 'fbSetupListener');
  const onCalls = [];
  const sandbox = {
    console: { log() {}, warn() {} },
    Date, Promise, Object, String,
    _fbListenerSetup: false,
    FB_ALL_SYNC_KEYS: ['companies'],
    fbDb: { ref(p) { return { on(ev) { onCalls.push(p + ':' + ev); }, off() {} }; } },
    _fbApplyRecord() { return true; },
    window: { _fbPerKeyMode: !!perKey },
    erpAlert: null
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(src + '\nfbSetupListener();', { filename: 'setup-listener.js' }).runInContext(sandbox);
  return onCalls;
}

test('★ 열쇠별 모드에서는 data 통째 구독을 안 붙인다 — 붙이면 전부를 한 번 더 받는다', () => {
  assert.deepEqual(loadSetupListener(true), [],
    '★ 열쇠별 구독 위에 통째 구독을 또 붙이면 서버가 모든 키를 다시 보냅니다(2.83MB)');
});

test('통째 모드에서는 예전 그대로 구독 둘을 붙인다', () => {
  assert.deepEqual(loadSetupListener(false).sort(),
    ['data:child_added', 'data:child_changed']);
});

/* ══════ ④ 급여 감사 로그 — 안 받은 채 덧붙이면 서버 기록을 덮는다 ══════ */

function loadAudit(perKey, live) {
  const src = sliceBetween('function addPayrollAudit(', '\n// 직원의 최근 N개월 급여 이력', 'addPayrollAudit');
  const calls = { ensure: [], set: [] };
  const sandbox = {
    Date, String, Promise,
    dbGet() { return [{ ts: 'old' }]; },
    dbSet(k, v) { calls.set.push(v.length); },
    CURRENT_USER: { name: '권형하' },
    _fbKeyLive: live ? { payroll_audit_log: true } : {},
    window: {
      _fbPerKeyMode: !!perKey,
      erpEnsureKeys(ks) { calls.ensure.push(Array.prototype.join.call(ks, ',')); return Promise.resolve(1); }
    }
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(src, { filename: 'audit.js' }).runInContext(sandbox);
  sandbox.addPayrollAudit('P-003', '2026-08', 'base', 1, 2, '');
  return { calls };
}

test('★ 감사 로그 — 안 받았으면 받아 온 뒤에 덧붙인다', async () => {
  const { calls } = loadAudit(true, false);
  assert.equal(calls.set.length, 0, '★ 받기 전에 썼습니다 — 서버의 최신 기록을 덮습니다');
  assert.deepEqual(calls.ensure, ['payroll_audit_log']);
  await tick();
  assert.equal(calls.set.length, 1, '받은 뒤에도 안 씁니다 — 감사 기록이 사라집니다');
});

test('감사 로그 — 이미 받았으면 곧바로 덧붙인다', () => {
  const { calls } = loadAudit(true, true);
  assert.equal(calls.set.length, 1);
  assert.equal(calls.ensure.length, 0);
});
