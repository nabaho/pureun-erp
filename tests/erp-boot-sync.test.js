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
/* 되돌아갈 자리가 굳은 명단(FB_ALL_SYNC_KEYS)을 쓰므로 그것도 함께 넣는다
   (2026-08-29 「통째로 받기 없애줘」). 없으면 폴백이 ReferenceError 로 죽는데,
   그건 «검사가 못 돌아서» 지 코드가 틀려서가 아니다 — 헷갈리기 쉬운 자리다. */
const SRC_ALLKEYS = sliceBetween('var FB_ALL_SYNC_KEYS = [', '];', '전체 동기화 키') + '];';
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
  const reads = { watch: [], live: [], recLive: [], once: [], shallow: 0 };
  const writes = [];
  const shallowObj = {};
  (opts.serverKeys || MEASURED_KEYS).forEach(k => { shallowObj[k] = true; });

  const uListeners = {}, liveListeners = {}, recListeners = {};
  const applied = [];
  let fullCalls = 0;

  const sandbox = {
    /* warn 을 «모아 둔다» — 되돌아갈 때 어디까지 왔는지 적는지 확인해야 한다(2026-08-29) */
    console: { log(...a) { this.log.calls.push(a.join(' ')); }, warn(...a) { this.warn.calls.push(a.join(' ')); }, table() {} },
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
          /* ⚠ 콜백 꼴(once(ev, cb, err))도 받아야 한다 — 건별 구독이 「다 받았다」
             신호를 그 꼴로 쓴다. 약속만 돌려주면 그 약속이 영영 안 풀려 15초 뒤
             시간초과가 난다(실제로 그렇게 검사가 멈췄다). */
          once(_ev, cb, _err) {
            reads.once.push(p);
            let snap;
            if (p.indexOf('uid_roles/') === 0) {
              if (opts.rolesReject) {
                if (cb) return;                       // 콜백 꼴에서는 오류 콜백 몫이다
                return Promise.reject(new Error('perm'));
              }
              snap = { val: () => (opts.fin === undefined ? null : opts.fin) };
            } else {
              const mV = p.match(/^data\/([^/]+)\/v$/);
              if (mV) {
                const rows = (opts.records && opts.records[mV[1]]) || [{ id: 'r1' }];
                const map = {}; rows.forEach(r => { map[r.id] = r; });
                snap = { val: () => map };
              } else snap = { val: () => null };
            }
            if (cb) { setTimeout(() => cb(snap), 0); return; }
            return Promise.resolve(snap);
          },
          update(u) { writes.push(u); return Promise.resolve(); },
          off() { /* 오류 갈래에서 구독을 뗀다 */ },
          on(_ev, cb, err) {
            const mU = p.match(/^data\/([^/]+)\/u$/);
            /* 건별 구독 자리 — data/{칸}/v.
               ⚠ 옛 검사들은 「그 칸이 본문 구독으로 올라갔나」를 본다. 그 뜻은 그대로이므로
                 reads.live 에도 함께 담는다. 건별인지 아닌지는 reads.recLive 로 가른다. */
            const mV = p.match(/^data\/([^/]+)\/v$/);
            const mK = p.match(/^data\/([^/]+)$/);
            if (mV) {
              const k = mV[1];
              if (reads.recLive.indexOf(k) < 0) { reads.recLive.push(k); reads.live.push(k); }
              (recListeners[k] = recListeners[k] || {})[_ev] = { cb, err };
              if (opts.holdFirst) return;
              /* 붙일 때 있는 건들이 child_added 로 온다 — 그것이 곧 초기 적재다 */
              if (_ev === 'child_added') {
                setTimeout(() => {
                  (opts.records && opts.records[k] ? opts.records[k] : [{ id: 'r1' }])
                    .forEach(r => cb({ key: r.id, val: () => r }));
                }, 0);
              }
              return;
            }
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
    /* 건별 적용이 쓰는 바깥 조각들 — 이 검사가 보는 것은 «무엇을 구독하는가»라
       실제 화면 갱신은 흉내만 낸다. 없으면 ReferenceError 로 비동기 중에 터진다. */
    _dbCache: {},
    _scheduleFbChanged() {},
    confirm: () => (opts.confirmDelete !== false),
    _fbApplyRecord(k, v, o) { applied.push({ k, opts: o }); return true; },
    _drainShrinkQueue() {},
    _fbInitialSyncFull() { fullCalls++; return Promise.resolve(99); },
    window: {}
  };
  sandbox.console.warn.calls = [];
  sandbox.console.log.calls = [];
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(SRC_EXCLUDE + '\n' + SRC_CONSTS + '\n' + SRC_ALLKEYS + '\n' + SRC_BOOT, { filename: 'boot-sync.js' })
    .runInContext(sandbox);
  return {
    sandbox, reads, writes, applied, uListeners, liveListeners, recListeners,
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

/* ⚠ 예전에는 「조회가 실패하면 **통째 읽기**로 간다」였다(fail-open).
   그 길이 넷이었고(인증 전·명단 없음·계획 지연·계획 실패), 한 번 걸릴 때마다
   5.7MB 였다. 대표 지시 2026-08-29 「통째로 받기 없애줘」로 되돌아갈 자리를
   **굳은 명단 열쇠별 받기**로 바꿨다 — 여전히 fail-open 이지만 통째가 아니다.
   ★ 지키는 것은 「실패해도 화면이 안 빈다」와 「그래도 통째로는 안 받는다」 둘이다. */
test('★ 조회가 실패해도 화면이 안 빈다 — 다만 통째로는 «안» 받는다', async () => {
  for (const opts of [{ rolesReject: true }, { fin: true, shallowFail: true }]) {
    const env = makeEnv(opts);
    const plan = await env.plan();
    assert.equal(plan.mode, 'perKey',
      '★ 되돌아갈 자리가 아직 통째 읽기입니다 — 한 번에 5.7MB 입니다: ' + JSON.stringify(opts));
    assert.ok(plan.fallback, '되돌아온 길이라는 표시가 없습니다 — 로그에서 구분이 안 됩니다');
    /* 빈 화면이 되면 안 된다 — 업무 표도 재무 표도 명단에 들어 있어야 한다.
       (재무 권한을 «못 읽은» 것이므로 임의로 좁히지 않는다. 규칙이 막는다.) */
    assert.ok(plan.keys.indexOf('companies') >= 0, '★ 업무 표가 빠져 화면이 빕니다');
    assert.ok(plan.keys.indexOf('finance_income') >= 0,
      '★ 권한을 못 읽었는데 재무를 뺐습니다 — 재무 담당자가 빈 화면을 봅니다');
    await env.sync();
    assert.equal(env.fullCalls(), 0, '★ 되돌아온 길에서 통째 읽기를 불렀습니다: ' + JSON.stringify(opts));
  }
});

/* ★ 2026-08-29, 두 번째 콘솔에서 잡은 것 — «거짓 경고»
   ↳ 역할 783ms · 표 376ms · 여기까지 8010ms
   둘 다 0.8초 안에 왔는데도 8초에 「계획 지연」이 찍혔다. Promise.race 는 먼저 온
   쪽으로 끝나지만 **자명종은 그와 상관없이 반드시 울리기** 때문이다.
   나는 그 한 줄을 보고 「매번 되돌아가고 있다」고 읽었고, 그것은 틀린 읽기였다.
   ★ 거짓 경고는 없는 경고보다 나쁘다 — 없는 문제를 쫓게 만든다. */
test('★ 계획이 제때 섰으면 늦게 울린 자명종은 «아무 말도 하지 않는다»', async () => {
  const env = makeEnv({ fin: true });
  env.sandbox._BOOT_PLAN_TIMEOUT_MS = 20;          // 자명종을 코앞으로 당겨 놓고
  const plan = await env.plan();
  assert.equal(plan.mode, 'perKey');
  assert.ok(!plan.fallback, '제때 섰는데 되돌아간 것으로 적혔습니다');
  await new Promise((r) => setTimeout(r, 80));      // 자명종이 울리고도 남을 만큼 기다린다
  const warned = env.sandbox.console.warn.calls.join('\n');
  assert.ok(warned.indexOf('계획 지연') < 0,
    '★ 계획이 멀쩡히 섰는데 「계획 지연」이 찍힙니다 — 없는 문제를 쫓게 됩니다:\n  ' + warned);
});

test('★ 계획이 섰으면 «섰다고» 도 남긴다 — 실패만 적으면 잘 되는 줄을 알 수 없다', async () => {
  const env = makeEnv({ fin: true });
  await env.plan();
  const said = env.sandbox.console.log.calls.join('\n');
  assert.match(said, /서버 명단 \d+개/, '★ 계획이 선 것을 아무 데도 안 적습니다.');
  assert.match(said, /재무 [OX모]/, '★ 재무 권한을 어떻게 봤는지 안 적습니다.');
});

/* ★ 대표 콘솔 2026-08-29: 「서버 명단을 못 받았다(계획 지연)」.
   되돌아갈 자리가 제대로 돌아 통째 받기는 없었지만, «왜 늦었는지» 를 알 수가 없었다 —
   역할 조회가 늦은 것인지, 명단 조회가 늦은 것인지, 둘 다 왔는데 화면이 바빠 늦은 것인지.
   못 고치는 진단은 진단이 아니다. 그래서 되돌아간 자리에는 «어디까지 왔는지» 를 함께 남긴다. */
test('★ 되돌아갈 때 «어느 쪽이 늦었는지» 를 함께 남긴다', async () => {
  const env = makeEnv({ fin: true, shallowFail: true });
  const plan = await env.plan();
  assert.ok(plan.fallback, '되돌아온 길이 아닙니다');
  const line = env.sandbox.console.warn.calls.join('\n');
  assert.match(line, /역할/, '★ 역할 조회가 언제 왔는지 안 적습니다.');
  assert.match(line, /표/, '★ 명단 조회가 언제 왔는지 안 적습니다.');
  assert.match(line, /여기까지 \d+ms/, '★ 얼마나 기다렸는지 안 적습니다.');
});

test('★ 자동으로 도는 길에는 통째 읽기가 «하나도» 없다', async () => {
  /* 사람이 켠 스위치 말고, 저절로 통째로 가는 길이 남아 있으면 안 된다. */
  for (const opts of [{}, { fin: true }, { fin: false }, { rolesReject: true },
                      { fin: true, shallowFail: true }]) {
    const env = makeEnv(opts);
    await env.sync();
    assert.equal(env.fullCalls(), 0,
      '★ 자동 경로에서 통째로 받았습니다: ' + JSON.stringify(opts));
  }
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
  /* ⚠ 이 검사는 «칸 통째» 경로를 잰다 — 건별 칸(FB_RECORD_KEYS)으로 재면
     건별 경로로 가서 깨진다. 명단 밖 칸(user_accounts)으로 잰다.
     건별 경로는 아래 「건별 동기화」 검사가 따로 본다. */
  const keys = ['user_accounts'];
  const env = makeEnv({
    fin: true, serverKeys: keys,
    serverU: { user_accounts: 500 },          // 사본과 같다 — 부팅에는 안 올라간다
    ls: withCache(keys, 500)
  });
  const remote = [];
  env.sandbox.window._fbApplyRemote = function (k, v) { remote.push(k); return true; };
  await env.sync();
  assert.equal(env.reads.live.length, 0);
  env.uListeners[keys[0]].cb({ val: () => 900 });   // 다른 기기가 저장했다
  await tick();
  assert.deepEqual(env.reads.live, keys,
    '★ 감시가 바뀜을 보고도 안 받으면 동료의 변경이 화면에 안 옵니다');
  assert.deepEqual(remote, keys, '실시간 적용기(알림·폭풍감지)로 가야 합니다');
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
  /* ⚠ 이 검사는 «칸 통째» 경로를 잰다 — 건별 칸(FB_RECORD_KEYS)으로 재면
     건별 경로로 가서 깨진다. 명단 밖 칸(user_accounts)으로 잰다.
     건별 경로는 아래 「건별 동기화」 검사가 따로 본다. */
  const keys = ['user_accounts'];
  const env = makeEnv({ fin: true, serverKeys: keys, serverU: { user_accounts: 900 }, ls: withCache(keys, 1) });
  const remote = [];
  env.sandbox.window._fbApplyRemote = function (k) { remote.push(k); return true; };
  await env.sync();
  assert.ok(env.applied.length > 0);
  assert.ok(env.applied.every(a => a.opts && a.opts.deferGate === true),
    '첫 값이 급감 보류 큐를 안 거치면 로그인 직후 모달이 쏟아집니다');
  env.liveListeners[keys[0]].cb({ val: () => ({ v: [1, 2], u: 950 }) });
  assert.deepEqual(remote, keys);
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

/* mode: 'perKey' | 'full' | (그 밖 — 계획이 서지 않은 상태)
   ⚠ 2026-08-29 부터 통째 구독은 «양성 조건» 이다 — _fbBootMode 가 'full' 일 때만
     붙는다. 예전처럼 「열쇠별이 아니면 붙인다」로 두면, 중간에 실패해 어느 쪽도
     아닌 상태가 통째 구독을 되살린다. 그래서 세 번째 경우도 함께 잰다. */
function loadSetupListener(mode) {
  const src = sliceBetween('function fbSetupListener(){', '\n// 페이지 로드 시 자동 실행', 'fbSetupListener');
  const onCalls = [];
  const sandbox = {
    console: { log() {}, warn() {} },
    Date, Promise, Object, String,
    _fbListenerSetup: false,
    FB_ALL_SYNC_KEYS: ['companies'],
    fbDb: { ref(p) { return { on(ev) { onCalls.push(p + ':' + ev); }, off() {} }; } },
    _fbApplyRecord() { return true; },
    window: { _fbBootMode: mode, _fbPerKeyMode: mode === 'perKey' },
    erpAlert: null
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(src + '\nfbSetupListener();', { filename: 'setup-listener.js' }).runInContext(sandbox);
  return onCalls;
}

test('★ 열쇠별 모드에서는 data 통째 구독을 안 붙인다 — 붙이면 전부를 한 번 더 받는다', () => {
  assert.deepEqual(loadSetupListener('perKey'), [],
    '★ 열쇠별 구독 위에 통째 구독을 또 붙이면 서버가 모든 키를 다시 보냅니다(2.83MB)');
});

test('★ 통째 모드에서도 child_added 를 안 붙인다 — 그것이 마지막 「두 번 받기」였다', () => {
  /* 2026-08-16 에 열쇠별 모드의 두 번 받기를 막았는데, **통째 모드가 남아 있었다**
     (2026-08-18 요금 조사에서 찾았다: 18일간 내려받기 189GB).
     초기 동기화가 방금 다 받아 왔는데 child_added 를 붙이면 서버가 있는 키를
     **전부 한 번 더** 보낸다 — 예전 주석의 「no-op 이라 괜찮다」는 CPU 이야기였고
     내려받기는 한 벌 그대로였다. 켤 때마다 약 2.8MB.
     ⚠ 고침이 값을 실제로 아끼는지는 «무엇을 구독하는가»로만 확인할 수 있다 —
       화면은 둘 다 똑같이 도므로 눈으로는 못 가린다. */
  assert.deepEqual(loadSetupListener('full').sort(), ['data:child_changed'],
    '★ child_added 를 붙이면 켤 때마다 있는 키를 통째로 한 벌 더 받습니다.');
});

test('★ 계획이 서지 않은 상태에서는 통째 구독을 «안» 붙인다 (대표 지시 2026-08-29)', () => {
  /* 예전 조건은 「열쇠별이 아니면 붙인다」였다. 그래서 계획이 실패해 어느 쪽도
     아닌 상태가 곧바로 통째 구독이 됐다 — 요금이 새던 길이 여기로 이어졌다.
     이제는 «통째로 받기로 한 길» 에서만 붙는다. */
  assert.deepEqual(loadSetupListener(undefined), [],
    '★ 어느 길인지 모르는데 통째 구독을 붙였습니다 — 서버가 모든 키를 보냅니다.');
  assert.deepEqual(loadSetupListener('알 수 없음'), [],
    '★ 모르는 값이 통째 구독으로 새어 들어갑니다.');
});

test('★ 두 모드가 같은 것을 구독한다 — 한쪽만 다르면 그쪽에서만 요금이 샌다', () => {
  /* 열쇠별 = 아무것도 안 붙임(초기 동기화가 이미 실시간까지 맡는다)
     통째   = child_changed 하나(고침만 받는다)
     둘 다 **있는 키를 다시 받지 않는다**는 점이 같다. */
  const perKey = loadSetupListener('perKey');
  const full = loadSetupListener('full');
  assert.ok(perKey.indexOf('data:child_added') < 0 && full.indexOf('data:child_added') < 0,
    '어느 한쪽에라도 child_added 가 남으면 그 길로 들어온 사람은 두 배로 받습니다.');
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

/* ══════ ⑤ 건별 동기화 — 「칸 전체」 대신 「바뀐 건만」 (요금 조사 2026-08-18) ══════
   계약 한 건을 고치면 계약 115건 전부가 접속 중인 20대 모두로 내려갔다.
   18일간 내려받기 189GB. 그 큰 칸들만 건별로 바꿨다.
   ⚠ 「글자가 있나」로는 못 잡는다 — 어느 자리에 무엇을 붙였는지 **실제로 돌려** 센다. */

test('★ 큰 칸은 data/{칸}/v 에 붙는다 — 칸 통째로 안 붙는다', async () => {
  const keys = ['contracts'];
  const env = makeEnv({ fin: true, serverKeys: keys, serverU: { contracts: 900 }, ls: withCache(keys, 1) });
  await env.sync();
  assert.deepEqual(env.reads.recLive, keys, '★ 건별로 안 붙으면 한 건 고침에 칸 전체가 오갑니다');
  assert.ok(env.recListeners.contracts, '건별 구독이 없습니다');
  assert.ok(env.reads.once.every(p => p !== 'data/contracts'),
    '★ 칸을 통째로 한 번 더 받았습니다 — 그 「두 번 받기」로 이미 두 번 당했습니다');
});

test('★ 거래내역 묶음도 건별 구독하고 서버 1/로컬 17이면 빠진 16개만 복구한다', async () => {
  const local = [];
  for (let i = 0; i < 17; i++) local.push({ id: 'b' + i, rows: [{ date: '2026-01-01' }] });
  const ls = {
    pureun_v6_ledger_batches: JSON.stringify(local),
    pureun_v6__meta_ledger_batches: '1'
  };
  const env = makeEnv({
    fin: true, serverKeys: ['ledger_batches'], serverU: { ledger_batches: 900 }, ls,
    records: { ledger_batches: [local[0]] }
  });
  await env.sync();
  await tick();
  assert.deepEqual(env.reads.recLive, ['ledger_batches'], '통째 구독이면 17→1 급감 경고가 다시 뜹니다');
  const repair = env.writes.find(u => Object.keys(u).some(k => k.indexOf('data/ledger_batches/v/') === 0));
  assert.ok(repair, '서버에서 빠진 묶음을 복구하지 않았습니다');
  assert.equal(Object.keys(repair).filter(k => k.indexOf('data/ledger_batches/v/') === 0).length, 16);
  assert.equal(Object.prototype.hasOwnProperty.call(repair, 'data/ledger_batches'), false,
    '서버 전체를 덮으면 동료가 동시에 올린 묶음이 사라집니다');
});

test('★ 붙일 때 오는 건들이 초기 적재다 — 따로 통째로 안 받는다', async () => {
  const keys = ['contracts'];
  const env = makeEnv({
    fin: true, serverKeys: keys, serverU: { contracts: 900 }, ls: withCache(keys, 1),
    records: { contracts: [{ id: 'a' }, { id: 'b' }] }
  });
  await env.sync();
  await tick();
  const arr = JSON.parse(env.sandbox.localStorage.getItem('pureun_v6_contracts'));
  assert.deepEqual(arr.map(x => x.id).sort(), ['a', 'b'], '초기 적재가 안 됐습니다');
});

test('★ 한 건을 고치면 그 건만 갈아 끼운다 — 나머지는 그대로', async () => {
  const keys = ['contracts'];
  const env = makeEnv({
    fin: true, serverKeys: keys, serverU: { contracts: 900 }, ls: withCache(keys, 1),
    records: { contracts: [{ id: 'a', n: 1 }, { id: 'b', n: 2 }] }
  });
  await env.sync();
  await tick();
  env.recListeners.contracts.child_changed.cb({ key: 'b', val: () => ({ id: 'b', n: 99 }) });
  const arr = JSON.parse(env.sandbox.localStorage.getItem('pureun_v6_contracts'));
  assert.equal(arr.length, 2, '건수가 달라졌습니다');
  assert.equal(arr.find(x => x.id === 'b').n, 99, '고친 건이 안 반영됐습니다');
  assert.equal(arr.find(x => x.id === 'a').n, 1, '★ 안 건드린 건이 바뀌었습니다');
});

test('★ 새 건은 더해진다 — 동료가 새로 만든 것이 보여야 한다', async () => {
  const keys = ['contracts'];
  const env = makeEnv({
    fin: true, serverKeys: keys, serverU: { contracts: 900 }, ls: withCache(keys, 1),
    records: { contracts: [{ id: 'a' }] }
  });
  await env.sync();
  await tick();
  env.recListeners.contracts.child_added.cb({ key: 'z', val: () => ({ id: 'z' }) });
  const arr = JSON.parse(env.sandbox.localStorage.getItem('pureun_v6_contracts'));
  assert.deepEqual(arr.map(x => x.id).sort(), ['a', 'z']);
});

test('★ 지운 건은 빠진다', async () => {
  const keys = ['contracts'];
  const env = makeEnv({
    fin: true, serverKeys: keys, serverU: { contracts: 900 }, ls: withCache(keys, 1),
    records: { contracts: [{ id: 'a' }, { id: 'b' }] }
  });
  await env.sync();
  await tick();
  env.recListeners.contracts.child_removed.cb({ key: 'a', val: () => null });
  const arr = JSON.parse(env.sandbox.localStorage.getItem('pureun_v6_contracts'));
  assert.deepEqual(arr.map(x => x.id), ['b']);
});

/* ── 급감 차단: 칸 단위 장치가 건별로 오면 한 번도 안 걸린다 ── */
function manyRecords(n) {
  const a = [];
  for (let i = 0; i < n; i++) a.push({ id: 'r' + i });
  return a;
}

test('★ 한꺼번에 절반 넘게 지워지면 사람에게 묻는다 — 안 물으면 조용히 사라진다', async () => {
  const keys = ['contracts'];
  const env = makeEnv({
    fin: true, serverKeys: keys, serverU: { contracts: 900 }, ls: withCache(keys, 1),
    records: { contracts: manyRecords(20) },
    confirmDelete: false                       // 사람이 「아니오」
  });
  await env.sync();
  await tick();
  for (let i = 0; i < 12; i++) {
    env.recListeners.contracts.child_removed.cb({ key: 'r' + i, val: () => null });
  }
  const arr = JSON.parse(env.sandbox.localStorage.getItem('pureun_v6_contracts'));
  assert.ok(arr.length > 8,
    '★ 「아니오」인데도 지웠습니다 — 요금 아끼려다 자료가 조용히 사라집니다(남은 ' + arr.length + '건)');
});

test('한두 건 지우는 것은 안 묻는다 — 매번 물으면 사람이 그냥 눌러 버린다', async () => {
  const keys = ['contracts'];
  const env = makeEnv({
    fin: true, serverKeys: keys, serverU: { contracts: 900 }, ls: withCache(keys, 1),
    records: { contracts: manyRecords(20) },
    confirmDelete: false
  });
  await env.sync();
  await tick();
  env.recListeners.contracts.child_removed.cb({ key: 'r0', val: () => null });
  const arr = JSON.parse(env.sandbox.localStorage.getItem('pureun_v6_contracts'));
  assert.equal(arr.length, 19, '한 건 지움이 막혔습니다');
});

test('★ 건별 명단 밖 칸은 예전 그대로 — 모양이 다른 칸을 건드리면 자료가 어긋난다', async () => {
  /* 사번키(mgr_rates)·연도키(insurance_rates)·납작한 것(min_wage)은 건별 지도가 아니다. */
  const keys = ['user_accounts'];
  const env = makeEnv({ fin: true, serverKeys: keys, serverU: { user_accounts: 900 }, ls: withCache(keys, 1) });
  await env.sync();
  assert.deepEqual(env.reads.recLive, [], '★ 모양이 다른 칸을 건별로 다뤘습니다');
  assert.ok(env.liveListeners.user_accounts, '통째 구독이 없어졌습니다');
});
