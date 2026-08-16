'use strict';
/* 유실 검사·포렌식이 백업을 통째로 안 받게 — id 명부 (대표 승인 2026-08-16)

   8월 요금 ₩75,000의 숨은 구멍: 「잃어버린 자료 찾기」 화면이 열리는 순간
   백업 스냅샷을 최대 36벌(≈125MB, ≈₩190) 통째로 내려받았다.
   검사에 실제로 필요한 것은 본문이 아니라 **id 명부**뿐이다.

   여기서는 글자 매칭이 아니라 **가짜 DB로 실제로 돌려서 내려받기 횟수를 센다** —
   「명부가 있으면 본문 수신 0회」가 이 고침의 존재 이유라서, 그 숫자 자체를 못 박는다.
   (오늘 「글자가 있나」식 검사가 주석·죽은 문자열에 세 번 속았다.) */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(path.join(__dirname, '..'), 'pu-erp.html'), 'utf8');

function stripComments(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/[^\n]*/gm, ' ');
}
function fnSlice(startMarker, endMarker) {
  const i = app.indexOf(startMarker);
  assert.ok(i >= 0, startMarker + ' 를 찾지 못했습니다.');
  const j = app.indexOf(endMarker, i + startMarker.length);
  assert.ok(j > i, endMarker + ' 를 찾지 못했습니다.');
  return app.slice(i, j);
}

/* ── 소스에서 진짜 함수들을 뽑아 조립한다 ── */
const SRC = [
  (app.match(/var LOST_SCAN_STORES = \[[^\]]*\];/) || [''])[0],
  (app.match(/var LOST_STORE_LABELS = \{[^}]*\};/) || [''])[0],
  (app.match(/var LOST_SCAN_MAX_DAILY = [^;]*;/) || [''])[0],
  (app.match(/var LOST_SCAN_MAX_RECENT = [^;]*;/) || [''])[0],
  fnSlice('function _snapIdIndex(', 'async function _lostLoadSnapKeys('),
  fnSlice('async function _lostLoadSnapKeys(', 'async function _lostSnapEnsureIds('),
  fnSlice('async function _lostSnapEnsureIds(', 'function _lostSnapTs('),
  fnSlice('function _lostSnapTs(', 'async function erpScanLostRecords('),
  fnSlice('async function erpScanLostRecords(', '// ── 백업 JSON 파일'),
  fnSlice('async function erpRestoreLostRecords(', 'window.erpScanLostRecords ='),
  fnSlice('function _fxNo(', 'async function erpDataForensics('),
  (app.match(/var FORENSIC_MAX_DAILY = [^;]*;/) || [''])[0],
  (app.match(/var FORENSIC_MAX_RECENT = [^;]*;/) || [''])[0],
  (app.match(/var FORENSIC_HIT_CAP = [^;]*;/) || [''])[0],
  fnSlice('function _fxTime(', 'function _fxNo('),
  fnSlice('async function erpDataForensics(', '// 콘솔용 요약 출력'),
  'function _fxConsole(){}',
  'function normalizeFbValue(v){ return v; }',
].join('\n');
assert.ok(SRC.indexOf('_snapIdIndex') > 0, '조립된 소스가 비었습니다.');

/* ── 가짜 실시간DB — 내려받기 한 번 한 번을 장부에 적는다 ── */
function makeDb(tree, log) {
  function resolve(p) {
    let cur = tree;
    for (const part of p.split('/').filter(Boolean)) {
      if (cur == null || typeof cur !== 'object') return null;
      cur = cur[part];
    }
    return cur === undefined ? null : cur;
  }
  function put(p, v) {
    const parts = p.split('/').filter(Boolean);
    let cur = tree;
    for (let i = 0; i < parts.length - 1; i++) cur = (cur[parts[i]] = cur[parts[i]] || {});
    cur[parts[parts.length - 1]] = v;
  }
  return {
    ref(p) {
      const q = { _limit: null };
      q.orderByKey = function () { return q; };
      q.limitToLast = function (n) { q._limit = n; return q; };
      q.once = function () {
        log.push({ op: 'read', path: p, limit: q._limit });
        let v = resolve(p);
        if (q._limit && v && typeof v === 'object') {
          const ks = Object.keys(v).sort().slice(-q._limit);
          const cut = {};
          ks.forEach((k) => { cut[k] = v[k]; });
          v = cut;
        }
        return Promise.resolve({ val: () => v, exists: () => v != null });
      };
      q.set = function (v) { log.push({ op: 'set', path: p }); put(p, v); return Promise.resolve(); };
      q.update = function (v) { log.push({ op: 'update', path: p }); return Promise.resolve(); };
      return q;
    },
  };
}

function build(tree, opts) {
  const log = [];
  const o = opts || {};
  const sandbox = new Function(
    'fbDb', 'window', 'dbGet', 'dbUpsertMany',
    SRC + '\nreturn { _snapIdIndex, _lostSnapEnsureIds, erpScanLostRecords, erpRestoreLostRecords, erpDataForensics };'
  )(makeDb(tree, log), { _erpErrLog: function () { } }, o.dbGet || (() => []), o.dbUpsertMany || (() => true));
  return { fns: sandbox, log };
}

const SNAP = {
  savedAt: '2026-08-15T10:00:00',
  data: {
    contracts: [
      { id: 'c1', no: 'K-1', companyName: '한빛유통' },
      { id: 'c2', no: 'K-2', companyName: '두리상사', _deleted: true },
    ],
    cases: { a: { id: 's1', caseNo: 'J-9', name: '해솔테크' } },
  },
};

test('id 명부 만들기 (_snapIdIndex)', async (t) => {
  const { fns } = build({});

  await t.test('id 마다 번호·업체명이 붙는다 — 화면에 보일 두 가지', () => {
    const m = fns._snapIdIndex(SNAP.data);
    assert.deepEqual(m.contracts.c1, { n: 'K-1', c: '한빛유통' });
    assert.deepEqual(m.cases.s1, { n: 'J-9', c: '해솔테크' });
  });

  await t.test('휴지통행(_deleted)은 명부에서 뺀다 — 넣으면 「유실」로 잘못 센다', () => {
    const m = fns._snapIdIndex(SNAP.data);
    assert.equal(m.contracts.c2, undefined);
  });

  await t.test('빈 자료면 빈 명부', () => {
    assert.deepEqual(fns._snapIdIndex(null), {});
    assert.deepEqual(fns._snapIdIndex({}), {});
  });
});

test('명부 얻기 (_lostSnapEnsureIds) — 내려받기 횟수를 센다', async (t) => {
  await t.test('명부가 이미 있으면 본문 수신 0회', async () => {
    const { fns, log } = build({});
    const got = await fns._lostSnapEnsureIds({ ids: { contracts: { c1: { n: 'K-1', c: '한빛유통' } } }, path: 'serverBackups', fbKey: 'x' });
    assert.ok(got.ids.contracts.c1);
    assert.equal(log.filter((l) => l.op === 'read').length, 0, '명부가 있는데도 내려받았습니다 — 고침의 존재 이유가 사라집니다.');
  });

  await t.test('명부가 없는 옛 백업은 한 번 받고, 인덱스에 명부를 적어 둔다(자가 치유)', async () => {
    const tree = { serverBackups: { old1: SNAP } };
    const { fns, log } = build(tree);
    const got = await fns._lostSnapEnsureIds({ ids: null, path: 'serverBackups', fbKey: 'old1' });
    assert.ok(got.ids.contracts.c1, '옛 백업에서 명부를 못 만들었습니다.');
    assert.equal(log.filter((l) => l.op === 'read').length, 1);
    const heal = log.find((l) => l.op === 'set' && l.path === 'serverBackupsIndex/old1/ids');
    assert.ok(heal, '자가 치유가 없으면 옛 백업이 밀려날 때까지 매 검사가 비쌉니다.');
    assert.ok(tree.serverBackupsIndex.old1.ids.contracts.c1, '적힌 명부가 비었습니다.');
  });
});

test('유실 검사 (erpScanLostRecords) — 본문 없이 대조한다', async (t) => {
  const IDS = { contracts: { c1: { n: 'K-1', c: '한빛유통' }, gone1: { n: 'K-7', c: '사라진상사' } } };
  const tree = {
    serverBackupsIndex: { '2026-08-15': { savedAt: '2026-08-15T10:00:00', ids: IDS } },
    serverBackupsRecentIndex: {},
    serverBackups: { '2026-08-15': SNAP },
  };
  // 현재 자료에는 c1 만 있다 → gone1 이 유실 후보
  const dbGet = (k) => (k === 'contracts' ? [{ id: 'c1' }] : []);

  await t.test('명부가 있으면 스냅샷 본문을 한 번도 안 받는다', async () => {
    const { fns, log } = build(tree, { dbGet });
    const rep = await fns.erpScanLostRecords();
    assert.equal(rep.candidates.length, 1);
    assert.equal(rep.candidates[0].id, 'gone1');
    const bodyReads = log.filter((l) => l.op === 'read' && /^serverBackups\/|^serverBackupsRecent\//.test(l.path));
    assert.equal(bodyReads.length, 0,
      '본문을 받고 있습니다: ' + bodyReads.map((l) => l.path).join(', '));
  });

  await t.test('후보에 번호·업체명이 명부에서 온다 — 본문 없이도 알아볼 수 있게', async () => {
    const { fns } = build(tree, { dbGet });
    const rep = await fns.erpScanLostRecords();
    assert.equal(rep.candidates[0].no, 'K-7');
    assert.equal(rep.candidates[0].companyName, '사라진상사');
    assert.equal(rep.candidates[0].item, null, '본문이 딸려 오면 검사가 다시 비싸집니다.');
  });

  await t.test('인덱스를 읽을 때도 최신 N개만 자른다(limitToLast)', async () => {
    const { fns, log } = build(tree, { dbGet });
    await fns.erpScanLostRecords();
    const idxReads = log.filter((l) => l.op === 'read' && /Index$/.test(l.path));
    assert.ok(idxReads.length >= 2);
    idxReads.forEach((l) => assert.ok(l.limit > 0, l.path + ' 를 통째로 읽고 있습니다.'));
  });

  await t.test('휴지통(trash_bin)에 있는 것은 유실이 아니다', async () => {
    const { fns } = build(tree, {
      dbGet: (k) => (k === 'contracts' ? [{ id: 'c1' }]
        : k === 'trash_bin' ? [{ item: { id: 'gone1' } }] : []),
    });
    const rep = await fns.erpScanLostRecords();
    assert.equal(rep.candidates.length, 0, '스스로 지운 것을 「유실」이라 하면 늑대소년이 됩니다.');
  });
});

test('복원 (erpRestoreLostRecords) — 본문은 그때 가서, 스냅샷당 한 번만', async (t) => {
  const tree = { serverBackups: { '2026-08-15': SNAP } };

  await t.test('명부 후보를 복원하면 그 스냅샷 하나만 내려받는다', async () => {
    const upserts = [];
    const { fns, log } = build(tree, { dbUpsertMany: (st, items) => { upserts.push({ st, items }); return true; } });
    const res = await fns.erpRestoreLostRecords([
      { store: 'contracts', id: 'c1', item: null, snapPath: 'serverBackups', snapFbKey: '2026-08-15', snapKey: 'daily:2026-08-15' },
      { store: 'cases', id: 's1', item: null, snapPath: 'serverBackups', snapFbKey: '2026-08-15', snapKey: 'daily:2026-08-15' },
    ]);
    assert.equal(res.restored, 2, '복원이 안 됐습니다: ' + JSON.stringify(res));
    const bodyReads = log.filter((l) => l.op === 'read');
    assert.equal(bodyReads.length, 1, '같은 스냅샷을 여러 번 받고 있습니다.');
    assert.equal(upserts.length, 2);
    assert.equal(upserts[0].items[0].companyName, '한빛유통', '본문이 아니라 껍데기를 복원했습니다.');
  });

  await t.test('본문을 이미 가진 후보(포렌식 적중)는 안 내려받는다', async () => {
    const { fns, log } = build(tree);
    const res = await fns.erpRestoreLostRecords([
      { store: 'contracts', id: 'c9', item: { id: 'c9', no: 'K-9' }, snapKey: '' },
    ]);
    assert.equal(res.restored, 1);
    assert.equal(log.filter((l) => l.op === 'read').length, 0);
  });
});

test('요금 구멍이 다시 열리지 않게 (소스 못박기)', async (t) => {
  await t.test('화면을 연다고 검사가 자동으로 돌지 않는다', () => {
    /* 종전: useEffect(function(){ runScan(); runForensics(''); }, []) — 열람 = ₩190. */
    assert.equal(/useEffect\(function\(\)\{\s*runScan\(\)/.test(stripComments(app)), false,
      '화면을 여는 것만으로 검사가 돕니다 — 열람 자체가 돈이 됩니다.');
    assert.match(app, /function startAll\(\)\{ runScan\(\); runForensics\(''\); \}/,
      '검사를 시작할 길이 없습니다.');
    assert.match(app, /검사 시작/, '시작 단추가 없습니다.');
  });

  await t.test('백업을 쓸 때 명부가 같이 실린다 — 이게 없으면 자가 치유만 영원히 돈다', () => {
    const clean = stripComments(app);
    assert.match(clean, /serverBackupsIndex\/' \+ id\)\.set\(\{[^}]*ids: _snapIdIndex\(snap\.data\)/,
      '일간 백업 인덱스에 명부가 안 실립니다.');
    assert.match(clean, /serverBackupsRecentIndex\/'\+key\] = \{[^}]*ids:_snapIdIndex\(snap\.data\)/,
      '수시 백업 인덱스에 명부가 안 실립니다.');
  });

  await t.test('포렌식 재고 확인(낱말 없음)은 본문을 안 받는다 — 실제로 돌려서 센다', async () => {
    /* ⚠ 글자 검사(「가드가 다운로드보다 앞에 있나」)로는 못 잡는다 —
       같은 낱말의 가드가 앞 구역에도 있어서, 이 구역 가드만 죽여도 통과한다.
       그래서 실행해서 수신 횟수 자체를 센다. */
    const IDS = { contracts: { c1: { n: 'K-1', c: '한빛유통' } } };
    const tree = {
      serverBackupsIndex: { '2026-08-15': { savedAt: '2026-08-15T10:00:00', ids: IDS } },
      serverBackupsRecentIndex: {},
      serverBackups: { '2026-08-15': SNAP },
      data: {},
    };
    const { fns, log } = build(tree);
    const rep = await fns.erpDataForensics('');
    assert.equal(rep.backups.length, 1, '재고 목록이 비었습니다.');
    assert.equal(rep.backups[0].counts.contracts, 1, '건수를 명부에서 못 셌습니다.');
    const bodyReads = log.filter((l) => l.op === 'read' && /^serverBackups\/|^serverBackupsRecent\//.test(l.path));
    assert.equal(bodyReads.length, 0,
      '낱말 없이 여는 재고 확인이 본문을 받습니다(20벌 ≈ 70MB): ' + bodyReads.map((l) => l.path).join(', '));
  });

  await t.test('낱말을 넣으면 본문을 받아서 찾는다 — 찾기 자체는 살아 있어야 한다', async () => {
    const tree = {
      serverBackupsIndex: { '2026-08-15': { savedAt: '2026-08-15T10:00:00' } },
      serverBackupsRecentIndex: {},
      serverBackups: { '2026-08-15': SNAP },
      data: {},
    };
    const { fns, log } = build(tree);
    const rep = await fns.erpDataForensics('한빛유통');
    assert.ok(rep.hits.some((x) => x.id === 'c1'), '백업 속 낱말 적중을 못 찾습니다.');
    assert.ok(log.some((l) => l.op === 'read' && l.path === 'serverBackups/2026-08-15'),
      '본문 없이 낱말을 찾았다고 합니다 — 그럴 수 없습니다.');
  });
});
