'use strict';
/* 부팅 때 「볼 수 있는 것만」 받기 (설계서 docs/superpowers/specs/2026-08-16-부팅-받기-줄이기-design.md)

   실측(2026-08-16): 계정 10개 중 재무 권한(fin)은 2개뿐인데 8명도 전 직원 급여
   (373KB)·수입 내역(958KB)을 매번 받아 브라우저에 깔고 있었다. 그리고 부팅이
   once('value') 통째 읽기 **뒤에** data.on() 을 붙여 같은 2.83MB 를 한 번 더
   받았다 — 켤 때마다 5.7MB. 「여는 것 자체가 받기」의 가장 큰 조각.

   ⚠ 이 검사는 글자 검사가 아니다 — 가짜 fbDb·fetch 로 **실제로 돌려서**
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

function makeEnv(opts) {
  opts = opts || {};
  const reads = { once: [], on: [], shallow: 0 };
  const shallowObj = {};
  (opts.serverKeys || MEASURED_KEYS).forEach(k => { shallowObj[k] = true; });

  const listeners = {};   // path -> {cb, err}
  const sandbox = {
    console: { log() {}, warn() {}, table() {} },
    Promise, JSON, Object, Array, String, Number, Date, Error,
    setTimeout, clearTimeout, encodeURIComponent,
    localStorage: {
      _s: opts.ls || {},
      getItem(k) { return this._s[k] || null; },
      setItem(k, v) { this._s[k] = v; }
    },
    firebase: {
      auth() {
        return { currentUser: opts.noUser ? null : {
          uid: 'U1',
          getIdToken() { return Promise.resolve('TOK'); }
        } };
      }
    },
    /* 실제 코드는 시간제한 래퍼(fetchT)를 거친다 — 저장소 규칙(erp-fetch-timeout) */
    fetchT(url, _opts, _ms) {
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
            reads.on.push(p);
            listeners[p] = { cb, err };
            if (opts.holdFirst) return;
            // 곧바로 첫 값을 준다 — 실제 구독처럼
            setTimeout(() => {
              if (opts.errPaths && opts.errPaths.indexOf(p) >= 0) { err && err(new Error('denied')); return; }
              cb({ val: () => ({ v: [1], u: 1 }) });
            }, 0);
          }
        };
      }
    },
    _fbApplyRecord(k, v, o) { applied.push({ k, opts: o }); return true; },
    _drainShrinkQueue() {},
    _fbInitialSyncFull(_r) { fullCalls++; return Promise.resolve(99); },
    window: {}
  };
  const applied = [];
  let fullCalls = 0;
  sandbox._fbApplyRecord = function (k, v, o) { applied.push({ k, opts: o }); return true; };
  sandbox._fbInitialSyncFull = function () { fullCalls++; return Promise.resolve(99); };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(SRC_EXCLUDE + '\n' + SRC_CONSTS + '\n' + SRC_BOOT, { filename: 'boot-sync.js' })
    .runInContext(sandbox);
  return {
    sandbox, reads, applied, listeners,
    fullCalls: () => fullCalls,
    plan: () => sandbox._bootKeyPlan(),
    sync: (r) => sandbox.fbInitialSync(r)
  };
}

/* ══════ ① 계획 — 누가 무엇을 받는가 ══════ */

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

test('재무 권한이 있으면(fin=true) 재무 열쇠도 받는다', async () => {
  const env = makeEnv({ fin: true });
  const plan = await env.plan();
  assert.ok(plan.keys.indexOf('finance_income') >= 0);
  assert.ok(plan.keys.indexOf('payroll_monthly') >= 0);
});

test('★ 권한을 모르면(fin=undefined) 전부 받는다 — 명시적 false 만 가른다', async () => {
  const env = makeEnv({});   // fin 값 없음 → null
  const plan = await env.plan();
  assert.equal(plan.mode, 'perKey');
  assert.ok(plan.keys.indexOf('finance_income') >= 0,
    '★ 권한이 불명확한데 가르면 재무 담당자가 빈 화면을 봅니다');
});

test('★ 권한 조회가 실패하면 통째 읽기로 간다 (fail-open)', async () => {
  const env = makeEnv({ rolesReject: true });
  await env.sync();
  assert.equal(env.fullCalls(), 1, '★ 조회 실패인데 가르기를 강행하면 무엇이 빠졌는지 아무도 모릅니다');
});

test('★ 열쇠 명단(shallow) 조회가 실패해도 통째 읽기로 간다', async () => {
  const env = makeEnv({ fin: true, shallowFail: true });
  await env.sync();
  assert.equal(env.fullCalls(), 1);
});

test('되돌림 스위치를 켜면 무조건 통째 읽기다', async () => {
  const env = makeEnv({ fin: true, ls: { pureun_v6_boot_full: '1' } });
  await env.sync();
  assert.equal(env.fullCalls(), 1, '스위치가 안 들으면 문제가 생겼을 때 되돌릴 길이 없습니다');
});

test('★ 로그류(payroll_audit_log)·안 올리는 것(co_merge_log·session)은 누구도 부팅에서 안 받는다', async () => {
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
    assert.ok(plan.keys.indexOf(k) >= 0,
      '★ ' + k + ' 가 빠지면 이미 끝난 이사가 다시 돕니다');
  }
});

/* ══════ ② 받기 — 몇 번 받는가 ══════ */

test('★ 열쇠별 모드는 data 통째 읽기를 한 번도 안 한다', async () => {
  const env = makeEnv({ fin: true });
  await env.sync();
  assert.ok(env.reads.once.every(p => p !== 'data'),
    '★ 통째 once() 가 남아 있으면 열쇠별로 가른 뜻이 없습니다');
  assert.equal(env.fullCalls(), 0);
});

test('★ 같은 열쇠에 구독을 두 번 안 붙인다 — 재동기화가 공짜가 되는 근거', async () => {
  const env = makeEnv({ fin: true });
  await env.sync();
  const n1 = env.reads.on.length;
  assert.ok(n1 > 0);
  await env.sync();          // 복귀 재동기화·수동 새로고침이 다시 부른 상황
  assert.equal(env.reads.on.length, n1,
    '★ 부를 때마다 다시 붙으면 그때마다 전부 다시 내려받습니다');
});

test('★ 첫 값은 부팅 적용(deferGate), 그 뒤 값은 실시간 적용으로 간다', async () => {
  const env = makeEnv({ fin: true });
  const remote = [];
  env.sandbox.window._fbApplyRemote = function (k, v) { remote.push(k); };
  await env.sync();
  assert.ok(env.applied.length > 0);
  assert.ok(env.applied.every(a => a.opts && a.opts.deferGate === true),
    '첫 값이 급감 보류 큐를 안 거치면 로그인 직후 모달이 쏟아집니다');
  // 두 번째 값 — 실시간 경로
  const p = 'data/companies';
  env.listeners[p].cb({ val: () => ({ v: [1, 2], u: 2 }) });
  assert.deepEqual(remote, ['companies'], '이후 값이 실시간 적용기로 안 갑니다');
});

test('★ 한 열쇠가 거부돼도 나머지는 받는다 — 그리고 그 열쇠는 다시 시도할 수 있다', async () => {
  const env = makeEnv({ fin: true, errPaths: ['data/companies'] });
  const n = await env.sync();
  assert.ok(n > 0, '한 열쇠 거부로 부팅이 통째로 빕니다');
  assert.equal(env.sandbox._fbKeyListeners['companies'], false,
    '거부된 열쇠 표시가 안 지워지면 ensure 가 영영 다시 못 받습니다');
});

test('★ erpEnsureKeys — 이미 받은 열쇠는 다시 안 받고, 안 받은 것만 받는다', async () => {
  const env = makeEnv({ fin: true });
  await env.sync();
  const n1 = env.reads.on.length;
  await env.sandbox.window.erpEnsureKeys(['payroll_audit_log']);
  assert.equal(env.reads.on.length, n1 + 1, '부팅에서 뺀 로그를 필요할 때 못 받습니다');
  await env.sandbox.window.erpEnsureKeys(['payroll_audit_log', 'companies']);
  assert.equal(env.reads.on.length, n1 + 1, '★ 이미 받은 것을 또 받습니다');
});

test('한 열쇠가 영영 침묵해도 부팅이 멎지 않는다', async () => {
  const env = makeEnv({ fin: true, holdFirst: true });
  env.sandbox._FB_KEY_FIRST_TIMEOUT_MS = 30;   // 검사에서만 짧게
  const n = await env.sync();
  assert.equal(typeof n, 'number', '침묵하는 열쇠 하나에 부팅 전체가 멈춥니다');
});

/* ══════ ③ 전역 구독 — 이중 다운로드의 두 번째 절반 ══════ */

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

function loadAudit(perKey, listened) {
  const src = sliceBetween('function addPayrollAudit(', '\n// 직원의 최근 N개월 급여 이력', 'addPayrollAudit');
  const calls = { ensure: [], set: [] };
  const sandbox = {
    Date, String, Promise,
    dbGet() { return [{ ts: 'old' }]; },
    dbSet(k, v) { calls.set.push(v.length); },
    CURRENT_USER: { name: '권형하' },
    _fbKeyListeners: listened ? { payroll_audit_log: true } : {},
    window: {
      _fbPerKeyMode: !!perKey,
      erpEnsureKeys(ks) { calls.ensure.push(ks); return Promise.resolve(1); }
    }
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(src, { filename: 'audit.js' }).runInContext(sandbox);
  sandbox.addPayrollAudit('P-003', '2026-08', 'base', 1, 2, '');
  return { calls, sandbox };
}

test('★ 감사 로그 — 안 받았으면 받아 온 뒤에 덧붙인다', async () => {
  const { calls } = loadAudit(true, false);
  assert.equal(calls.set.length, 0, '★ 받기 전에 썼습니다 — 서버의 최신 기록을 덮습니다');
  /* ⚠ vm 안에서 만든 배열이라 deepEqual 이 튕긴다 — 알맹이로 견준다 */
  assert.equal(calls.ensure.map(a => Array.prototype.join.call(a, ',')).join('|'), 'payroll_audit_log');
  await Promise.resolve();
  assert.equal(calls.set.length, 1, '받은 뒤에도 안 씁니다 — 감사 기록이 사라집니다');
});

test('감사 로그 — 이미 받았으면 곧바로 덧붙인다', () => {
  const { calls } = loadAudit(true, true);
  assert.equal(calls.set.length, 1);
  assert.equal(calls.ensure.length, 0, '이미 받았는데 또 받으러 갑니다');
});
