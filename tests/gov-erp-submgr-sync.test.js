/* 부담당 맞추기 — 푸른이알피 ↔ 정부컨설팅 (대표 지시 2026-08-29)

   대표 결정: 사업장·일정 둘 다 올린다 · 빼는 것도 그대로 따라간다.
   그대로 붙이면 두 앱이 서로 되돌리는 «진동» 이 난다 —
   이알피에서 뺀 사람이 정부컨설팅 일정에 남아 있으면 그 일정이 다시 올려 버리고,
   그것을 이알피가 또 되돌린다.

   ★ 이 검사는 「글자가 있나」가 아니라 **실제로 함수를 돌려서** 본다.
     글자만 보면, 안내 주석에 적힌 낱말이 검사를 통과시킨다.

   여기서 못 박는 것은 «규칙» 이지 «지금 값» 이 아니다 —
   이름·건수·문구가 바뀌어도 아래 규칙만 지키면 깨지지 않는다. */
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'gov-consulting.html'), 'utf8');
/* 주석을 먼저 걷는다 — 잘 쓴 주석이 검사를 통과시키면 안 된다 */
const bare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
const S = bare(SRC);

/* ── 앱에서 «맞추기 엔진» 을 그대로 떼어 온다 ──────────────────
   사업장 이름 짝짓기(coKey·findCoForErp)부터 맞추기까지가 한 덩어리다. */
function loadEngine(over) {
  const a = S.indexOf('const CO_CORP_RE');
  /* 끝 자리는 «코드» 로 잡는다 — 주석을 걷어 낸 판이라 주석 표지는 남아 있지 않다 */
  const b = S.indexOf('let _erpPlan');
  assert.ok(a > 0 && b > a, '맞추기 엔진을 찾지 못했다 — 자리가 바뀌었으면 이 검사도 함께 고칠 것');

  /* 사업장별 짝짓기가 erpConsCode 를 쓴다(2026-09-03) — 엔진 토막 «밖»에 있어
     따로 떠서 함께 싣는다. 가짜로 대신하면 실제와 어긋나도 검사가 모른다. */
  const enLine = S.split(/\r?\n/).find((x) => x.trim().startsWith('const _en=')) || '';
  assert.ok(enLine, '_en 을 찾지 못했다');
  const cc = S.indexOf('function erpConsCode(');
  const ccEnd = S.indexOf('\nfunction ', cc + 10);
  assert.ok(cc > 0 && ccEnd > cc, 'erpConsCode 를 찾지 못했다');

  const g = S.indexOf('function getCoAtts');
  const gEnd = S.indexOf('\nfunction coAttStaffList', g);
  assert.ok(g > 0 && gEnd > g, 'getCoAtts 를 찾지 못했다');

  const st = {
    cos: [], scheds: [], staff: [], ls: {},
    toasts: [], cloud: [], today: '2026-08-29', me: 'a1',
  };
  const ctx = {
    console, JSON, Object, Array, String, Number, Date, Set, Math, Promise, RegExp,
    ERP: { loaded: true, consultings: [], dir: [], types: [] },
    FB_READY: true,
    ERP_LS_PREFIX: 'pureun_v6_',
    localStorage: {
      getItem: (k) => (k in st.ls ? st.ls[k] : null),
      setItem: (k, v) => { st.ls[k] = String(v); },
    },
    _fbDB: {
      ref: (p) => ({
        once: () => Promise.resolve({ val: () => ctx._formVal }),
        update: (u) => { st.cloud.push(u); return Promise.resolve(); },
      }),
    },
    _formVal: undefined,          // 저장형식 확인이 돌려줄 값 (검사마다 세팅)
    getCos: () => JSON.parse(JSON.stringify(st.cos)),
    setCos: (v) => { st.cos = JSON.parse(JSON.stringify(v)); },
    getScheds: () => JSON.parse(JSON.stringify(st.scheds)),
    setScheds: (v) => { st.scheds = JSON.parse(JSON.stringify(v)); },
    getStaff: () => JSON.parse(JSON.stringify(st.staff)),
    /* 사업장별 짝짓기가 이음표를 읽는다 — 이 검사에선 이을 것이 없어 빈 표로 둔다
       (빈 표면 findCoForErp 가 종류를 못 받아 예전처럼 첫 것을 집는다). */
    getErpTypeMap: () => ({}),
    todayStr: () => st.today,
    myId: () => st.me,
    toast: (m) => { st.toasts.push(String(m)); },
    lsSet: (k, v) => { st.ls[k] = String(v); },
    renderDash: () => {}, renderCal: () => {},
    erpSidName: (sid) => (ctx.ERP.dir.find((u) => u.sid === sid) || {}).name || '',
    govStaffIdByErp: (sid, name) => {
      const bySid = st.staff.find((a) => a.erpSid === sid);
      if (bySid) return bySid.id;
      const byName = st.staff.find((a) => a.name === name);
      return byName ? byName.id : '';
    },
  };
  Object.assign(ctx, over || {});
  vm.createContext(ctx);
  vm.runInContext(enLine + '\n' + S.slice(cc, ccEnd) + '\n' + S.slice(g, gEnd) + '\n' + S.slice(a, b), ctx);
  ctx._st = st;
  return ctx;
}

/* 흔히 쓰는 판 하나 — 사업장 1곳, 이알피 컨설팅 1건, 직원 셋 */
function board(over) {
  const ctx = loadEngine(over);
  const st = ctx._st;
  st.staff = [
    { id: 'a1', name: '권형하', erpSid: 'S1' },
    { id: 'a2', name: '박한별', erpSid: 'S2' },
    { id: 'a3', name: '김동현', erpSid: 'S3' },
    { id: 'a9', name: '손님노무사' },                 // 사번 없음 — 이알피가 모르는 사람
  ];
  ctx.ERP.dir = [
    { sid: 'S1', name: '권형하' }, { sid: 'S2', name: '박한별' }, { sid: 'S3', name: '김동현' },
  ];
  st.cos = [{ id: 'c1', name: '승진텍라인', defAtt: 'a1', defCoAtts: ['a2', 'a3'], types: ['t1'], erpId: 'E1' }];
  ctx.ERP.consultings = [
    { id: 'E1', companyName: '승진텍라인', managerMain: 'S1', managerSubs: ['S2', 'S3'] },
  ];
  st.ls['pureun_v6_consultings'] = JSON.stringify(ctx.ERP.consultings);
  ctx._formVal = 'E1';                                // 이알피가 건별 칸으로 저장돼 있다
  return ctx;
}

/* ══════ ① 진동 — 이 검사가 이 기능의 심장이다 ══════ */

test('이알피에서 뺀 사람은 «앞으로 올» 일정에서도 빠져, 그 일정이 도로 올리지 못한다', async () => {
  const ctx = board(); const st = ctx._st;
  st.scheds = [
    { id: 's1', coId: 'c1', typeId: 't1', date: '2026-09-10', attId: 'a1', coAttIds: ['a2', 'a3'] },
  ];
  st.ls['p_subSyncSeeded'] = '2026-08-01';            // 첫 판은 지났다
  ctx.ERP.consultings[0].managerSubs = ['S2'];       // 이알피에서 김동현을 뺐다
  st.ls['pureun_v6_consultings'] = JSON.stringify(ctx.ERP.consultings);

  ctx.erpSyncSubsDown();

  assert.deepStrictEqual(st.cos[0].defCoAtts, ['a2'], '사업장 부담당에서 빠져야 한다');
  assert.ok(!st.scheds[0].coAttIds.includes('a3'),
    '앞으로 올 일정에도 남아 있으면, 그 일정이 이알피로 도로 올려 진동한다');

  /* 되돌아가지 않는지 실제로 확인한다 — 올리기를 돌려도 이알피가 그대로여야 한다 */
  st.cloud.length = 0;
  await ctx.erpSyncSubsUp('c1');
  assert.strictEqual((ctx.ERP.consultings[0].managerSubs||[]).join(','), 'S2', '올리기가 뺀 사람을 되살렸다 — 진동한다');
  assert.strictEqual(st.cloud.length, 0, '바뀐 것이 없으면 클라우드에 쓰지 않아야 한다');
});

test('지난 일정의 부담당은 담당이 바뀌어도 그대로 남는다', () => {
  const ctx = board(); const st = ctx._st;
  st.scheds = [
    { id: 's0', coId: 'c1', typeId: 't1', date: '2026-08-04', attId: 'a1', coAttIds: ['a2', 'a3'] },
  ];
  st.ls['p_subSyncSeeded'] = '2026-08-01';
  ctx.ERP.consultings[0].managerSubs = ['S2'];
  ctx.erpSyncSubsDown();
  assert.ok(st.scheds[0].coAttIds.includes('a3'),
    '지난 방문은 «그 날 누가 갔다» 는 증빙 기록이다 — 지우면 안 된다');
});

/* ══════ ② 일정은 거울이 아니라 «더하기만» 하는 입구 ══════ */

test('일정에서 더한 사람은 사업장·이알피로 올라간다', async () => {
  const ctx = board(); const st = ctx._st;
  await ctx.coAddSubsFromSched('c1', ['a2', 'a9']);   // a2 는 이미 있음, a9 는 새 사람
  assert.ok(st.cos[0].defCoAtts.includes('a9'), '새로 더한 사람이 사업장 부담당에 붙어야 한다');
});

test('일정에서 «뺀» 것은 사업장·이알피를 건드리지 않는다', async () => {
  const ctx = board(); const st = ctx._st;
  await ctx.coAddSubsFromSched('c1', []);            // 뺀 사람은 아예 넘어오지 않는다
  assert.deepStrictEqual(st.cos[0].defCoAtts, ['a2', 'a3'], '사업장 부담당이 그대로여야 한다');
  assert.strictEqual((ctx.ERP.consultings[0].managerSubs||[]).join(','), 'S2,S3', '이알피가 그대로여야 한다');
});

/* ══════ ③ 사번 — 이름으로 밀어 넣지 않는다 ══════ */

test('사번 없는 사람은 이알피에 올리지 않고, 못 올렸다고 말해 준다', async () => {
  const ctx = board(); const st = ctx._st;
  st.cos[0].defCoAtts = ['a2', 'a9'];                // a9 는 사번이 없다
  const r = await ctx.erpSyncSubsUp('c1');
  /* 이알피 쪽 배열은 앱 안에서 새로 만들어진 것이라 종류까지 같지는 않다 — 값으로 견준다 */
  assert.strictEqual((ctx.ERP.consultings[0].managerSubs||[]).join(','), 'S2',
    '사번 없는 사람을 이름으로 올리면 동명이인에게 남의 컨설팅이 붙는다');
  assert.ok(r.missing.includes('손님노무사'), '못 올린 사람을 돌려줘야 한다');
  assert.ok(st.toasts.join(' ').includes('손님노무사'), '조용히 넘기지 말고 말해 줘야 한다');
});

test('이알피가 모르는 사람(사번 없음)을 내려받기가 지우지 않는다', () => {
  const ctx = board(); const st = ctx._st;
  st.cos[0].defCoAtts = ['a2', 'a9'];
  st.ls['p_subSyncSeeded'] = '2026-08-01';
  ctx.ERP.consultings[0].managerSubs = ['S2'];
  ctx.erpSyncSubsDown();
  assert.ok(st.cos[0].defCoAtts.includes('a9'),
    '이알피에 보이지 않는 사람은 이알피가 «빠졌다» 고 말할 수 없다');
});

/* ══════ ④ 첫 판 — 거울을 세우면서 지우지 않는다 ══════ */

test('처음 맞출 때는 정부컨설팅에만 있던 부담당을 지우지 않고 합친다', () => {
  const ctx = board(); const st = ctx._st;
  delete st.ls['p_subSyncSeeded'];                   // 아직 한 번도 안 맞췄다
  st.cos[0].defCoAtts = ['a3'];                      // 여기에만 있는 사람
  ctx.ERP.consultings[0].managerSubs = ['S2'];       // 이알피에만 있는 사람
  ctx.erpSyncSubsDown();
  const got = st.cos[0].defCoAtts.slice().sort();
  assert.deepStrictEqual(got, ['a2', 'a3'],
    '첫 판부터 이알피를 잣대로 삼으면, 손으로 넣어 둔 부담당이 한꺼번에 지워진다');
  assert.ok(st.ls['p_subSyncSeeded'], '첫 판을 마쳤다고 적어 둬야 다음부터 거울로 돈다');
});

/* ══════ ⑤ 이알피에 쓰는 법 ══════ */

test('이알피에는 부담당 칸만 쓴다 — 레코드를 통째로 덮지 않는다', async () => {
  const ctx = board(); const st = ctx._st;
  st.cos[0].defCoAtts = ['a2'];
  await ctx.erpSyncSubsUp('c1');
  assert.strictEqual(st.cloud.length, 1, '클라우드에 한 번 써야 한다');
  const paths = Object.keys(st.cloud[0]);
  const consPaths = paths.filter((p) => /\/v\//.test(p));
  assert.ok(consPaths.length > 0, '건별 칸 경로로 써야 한다');
  consPaths.forEach((p) => {
    assert.ok(/\/v\/[^/]+\/[^/]+$/.test(p),
      '「data/consultings/v/<id>」 처럼 레코드를 통째로 덮으면 남이 고친 다른 칸이 되돌아간다: ' + p);
  });
  assert.ok(!paths.some((p) => /managerMain/.test(p)), '주담당은 건드리지 않는다');
});

test('저장 형식을 확인하기 전에는 클라우드에 쓰지 않는다', async () => {
  const ctx = board(); const st = ctx._st;
  ctx._formVal = null;                               // 건별 칸 저장이 아니다(또는 확인 불가)
  st.cos[0].defCoAtts = ['a2'];
  await ctx.erpSyncSubsUp('c1');
  assert.strictEqual(st.cloud.length, 0,
    '배열형이면 v/<id> 는 없는 자리다 — 자리번호로 쓰면 엉뚱한 컨설팅의 부담당을 덮는다');
});

test('종료된 이알피 컨설팅은 맞추지 않는다', () => {
  const ctx = board(); const st = ctx._st;
  ctx.ERP.consultings[0].closedDate = '2026-07-31';
  assert.deepStrictEqual(Object.keys(ctx.erpConsByCo()), [], '종료 건은 짝짓지 않는다');
});

test('이알피와 안 이어진 사업장은 올리지 않는다', async () => {
  const ctx = board(); const st = ctx._st;
  st.cos.push({ id: 'c2', name: '여기서만관리', defAtt: 'a1', defCoAtts: ['a2'], types: ['t1'] });
  st.cloud.length = 0;
  const r = await ctx.erpSyncSubsUp('c2');
  assert.strictEqual(r, null, '짝이 없는 사업장은 정부컨설팅 안에서만 관리한다');
  assert.strictEqual(st.cloud.length, 0);
});

/* ══════ ⑥ 창 안에 «어디까지 따라가는지» 를 적어 둔다 ══════ */

test('부담당 칸 밑에 따라가는 범위를 적는 자리가 있다', () => {
  assert.ok(/mCoSubSyncNote/.test(SRC) && /mEditSubSyncNote/.test(SRC),
    '사업장·일정 두 창 모두에 안내 자리가 있어야 한다');
  const a = S.indexOf('function renderSubSyncNote');
  assert.ok(a > 0, 'renderSubSyncNote 가 없다');
  const body = S.slice(a, a + 1600);
  assert.ok(/erpConsByCo/.test(body),
    '이알피와 «이어진» 사업장에만 안내가 떠야 한다 — 아무 데나 띄우면 거짓말이 된다');
  assert.ok(/erpSid/.test(body),
    '사번이 안 걸린 사람을 창 안에서 짚어 줘야 한다');
});
