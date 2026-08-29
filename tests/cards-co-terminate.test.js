'use strict';
/* ══════ 기업 상세에서 «계약해지로 처리» (대표 지시 2026-08-29) ══════
   대표님: 「기업해지 사업장은 클릭해서 계약해지사업장으로 처리하면 명함, 사업자도
   모두 계약해지로 보내지게 만들어라 … 푸른이알피에서 계약해지하는 경우에도 서로
   동기화되어 연결되게 해라」

   ■ 두 방향 가운데 «읽는 쪽»은 이미 있었다
     푸른이알피 업체관리의 status 가 inactive·terminated·closed 면 ErpMatch 가 left 로
     읽어 명함·사업자·기업상세·담당 칸에 🚪 를 붙인다(2026-08-11). 그러니 저쪽에서
     해지하면 이쪽은 «저절로» 따라온다.
   ■ 없던 것은 «쓰는 쪽»이다
     기업정보함에서 눌러 업체관리 상태를 바꾸는 길이 아예 없었다.

   ★ 여기서 못 박는 것
     ① 원본은 «푸른이알피 업체관리의 status» 하나다. 기업정보함에 따로 안 적는다.
     ② 업체관리에 없는 곳은 상태를 못 바꾼다 — 조용히 넘기지 않고 그렇게 말한다.
     ③ 이미 그 상태인 곳은 건드리지 않는다.
     ④ 담당자 개개인은 «퇴사로 만들지 않는다» (대표 결정 2026-08-29).
        계약해지는 «업체»의 상태, 퇴사는 «사람»의 상태다. 그분들은 여전히 그 회사에
        다니신다 — 섞으면 진짜 퇴사와 구별이 안 되고 재계약 때 한 명씩 풀어야 한다.
     ⑤ 회사 수가 몇이든 읽기 한 번·쓰기 한 번 (2026-08-16 의 교훈).
     ⑥ 「해지 풀기」는 «상태만» 되돌린다 — 폴더는 손대지 않는다. */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8');

function fn(name) {
  const at = SRC.search(new RegExp('(?:^|\\n)(?:async )?function ' + name + '\\('));
  assert.ok(at >= 0, name + ' 을 찾지 못했다');
  const open = SRC.indexOf('{', at);
  let d = 0;
  for (let k = open; k < SRC.length; k++) {
    if (SRC[k] === '{') d++;
    else if (SRC[k] === '}') { d--; if (!d) return SRC.slice(at, k + 1); }
  }
  throw new Error(name + ' 의 끝을 찾지 못했다');
}

function ctx(cos) {
  const b = { _list: cos || [], coList: () => b._list };
  vm.createContext(b);
  /* 「해지로 보는 상태」 목록도 «진짜»를 싣는다 — vm 에서 최상위 const 는 칸의 값이
     되지 않으므로 var 로 바꿔 넣는다. 대역을 쓰면 읽는 쪽과 같은 잣대인지가 안 보인다. */
  const at = SRC.indexOf('const CO_CLOSED_ST');
  assert.ok(at >= 0, 'CO_CLOSED_ST 을 찾지 못했다');
  vm.runInContext(SRC.slice(at, SRC.indexOf('\n', at)).replace(/^const /, 'var '), b);
  vm.runInContext(fn('coTerminatePlan'), b);
  return b;
}
const plan = (b, keys, on) => JSON.parse(JSON.stringify(
  vm.runInContext('coTerminatePlan(__k, ' + (on ? 'true' : 'false') + ')',
    Object.assign(b, { __k: keys }))));

const co = (key, name, erp) => ({ key, name, erp: erp || null });
const erp = (id, status) => ({ id, coName: 'x', status,
  left: (status === 'inactive' || status === 'terminated' || status === 'closed') });

/* ── ① 될 것 / 이미 된 것 / 못 하는 것 ─────────────────────────────── */
test('★ 업체관리에 «없는» 곳은 상태를 못 바꾼다 — 조용히 넘기지 않는다', () => {
  const b = ctx([ co('111', '(주)소온', null) ]);
  const p = plan(b, ['111'], true);
  assert.equal(p.rows.length, 0);
  assert.equal(p.noErp.length, 1, '★ 조용히 빠지면 처리된 줄 안다');
  assert.equal(p.noErp[0].name, '(주)소온');
});

test('이미 해지된 곳은 건드리지 않는다', () => {
  const b = ctx([ co('111', 'A', erp('c1', 'terminated')) ]);
  const p = plan(b, ['111'], true);
  assert.equal(p.rows.length, 0);
  assert.equal(p.already.length, 1);
});

test('풀 때는 «해지된 곳»만 대상이다', () => {
  const b = ctx([ co('111', 'A', erp('c1', 'terminated')),
                  co('222', 'B', erp('c2', 'active')) ]);
  const p = plan(b, ['111', '222'], false);
  assert.equal(p.rows.length, 1, '멀쩡한 곳까지 되돌리려 한다');
  assert.equal(p.rows[0].id, 'c1');
  assert.equal(p.already.length, 1, 'B 는 이미 안 해지된 상태다');
});

test('inactive·closed 도 해지로 본다 — 읽는 쪽과 같은 잣대', () => {
  ['inactive', 'closed', 'terminated'].forEach(st => {
    const b = ctx([ co('111', 'A', erp('c1', st)) ]);
    assert.equal(plan(b, ['111'], true).already.length, 1,
      st + ' 를 해지로 안 본다 — 🚪 는 붙는데 여기서는 아니라고 하면 어긋난다');
  });
});

test('고르지 않은 회사는 아예 안 본다', () => {
  const b = ctx([ co('111', 'A', erp('c1', 'active')),
                  co('222', 'B', erp('c2', 'active')) ]);
  const p = plan(b, ['111'], true);
  assert.equal(p.rows.length, 1);
  assert.equal(p.rows[0].id, 'c1');
});

/* ── ② 옮길 것을 미리 센다 ────────────────────────────────────────── */
test('폴더로 옮길 명함·사업자 수를 미리 센다 — 모르고 누르면 안 된다', () => {
  const b = ctx([ Object.assign(co('111', 'A', erp('c1', 'active')),
    { cards: [{ id: 'k1' }, { id: 'k2' }], bizs: [{ id: 'b1' }] }) ]);
  const p = plan(b, ['111'], true);
  assert.equal(p.cards, 2);
  assert.equal(p.bizs, 1);
});

/* ── ③ 원본은 하나 · 쓰기는 한 번 ─────────────────────────────────── */
test('★ 상태를 적는 곳이 «푸른이알피 업체관리» 하나다', () => {
  const src = fn('coTerminate');
  assert.ok(/data\/companies\/v\//.test(src), '업체관리에 안 쓴다');
  assert.ok(!/coInfo\/[^']*\/status|\/status'\]\s*=\s*.*pucards/.test(src),
    '★ 기업정보함에도 상태를 적는다 — 두 곳에 적으면 어느 쪽이 참인지 모른다');
});

test('★ 회사가 몇이든 읽기 한 번·쓰기 한 번', () => {
  const src = fn('coTerminate');
  assert.equal((src.match(/once\(/g) || []).length, 1,
    '★ 회사마다 업체관리를 읽는다 — 2026-08-16 에 5,000건 오류를 낸 방식이다');
  const ups = (src.match(/\.update\(/g) || []).length;
  assert.ok(ups >= 1 && ups <= 2, '쓰기가 ' + ups + '번이다 (업체관리 1 + 회사폴더 1 까지)');
  assert.ok(/autoFolderFlush\(/.test(src), '명함·사업자를 한 장씩 옮긴다');
});

/* 진짜로 돌려 «보낸 통»을 본다.
   ⚠ 「소스에 data/companies/u 가 있나」만 보면, 보내기 직전에 그 칸을 지우는 고장이
     그대로 샌다 — 2026-08-29 고장 시험에서 실제로 샜다. */
function runTerminate(on, cos) {
  const writes = [], puWrites = [], flushed = [];
  const list = [{ id: 'c1', name: 'A', status: 'active', bizNo: '111' }];
  const b = {
    coList: () => cos, ErpMatch: { load: () => {} },
    _coFolders: {}, _canon: s => String(s || ''),
    erpClosedFolderOf: () => null, autoFolderFlush: x => flushed.push(x),
    DB_ROOT: 'pucards',
    Store: { db: { ref: () => ({ update: u => { puWrites.push(u); return Promise.resolve(); } }) } },
    firebase: { database: () => ({ ref: () => ({
      once: () => Promise.resolve({ val: () => ({ v: { c1: list[0] } }) }),
      update: u => { writes.push(u); return Promise.resolve(); } }) }) }
  };
  vm.createContext(b);
  const at = SRC.indexOf('const CO_CLOSED_ST');
  vm.runInContext(SRC.slice(at, SRC.indexOf('\n', at)).replace(/^const /, 'var '), b);
  vm.runInContext(fn('coClosedFolder'), b);
  vm.runInContext(fn('coTerminatePlan'), b);
  vm.runInContext(fn('coTerminate'), b);
  b.__p = vm.runInContext("coTerminatePlan(['111'], " + (on ? 'true' : 'false') + ')', b);
  return vm.runInContext("coTerminate(__p, " + (on ? 'true' : 'false') + ", '권형하')", b)
    .then(r => ({ r, writes, puWrites, flushed }));
}

test('★ 보낸 통에 «갱신시각»이 들어 있다 — 없으면 푸른이알피 화면이 안 바뀐다', () => {
  return runTerminate(true, [ co('111', 'A', erp('c1', 'active')) ]).then(o => {
    assert.equal(o.writes.length, 1, '쓰기가 한 번이 아니다');
    assert.ok(o.writes[0]['data/companies/u'],
      '★ 갱신시각이 «보낸 통에» 없다 — 저쪽이 다시 안 읽어 화면이 그대로다');
    assert.equal(o.writes[0]['data/companies/v/c1'].status, 'terminated');
    assert.equal(o.writes[0]['data/companies/v/c1'].updatedBy, '권형하');
  });
});

test('★ 풀면 «계약중»으로 되돌린다', () => {
  return runTerminate(false, [ co('111', 'A', erp('c1', 'terminated')) ]).then(o => {
    assert.equal(o.writes[0]['data/companies/v/c1'].status, 'active');
    assert.equal(o.flushed.length, 0, '★ 풀면서 폴더까지 옮겼다');
  });
});

/* ── ④ 담당자는 손대지 않는다 (대표 결정) ─────────────────────────── */
test('★ 담당자를 퇴사로 만들지 «않는다»', () => {
  const src = fn('coTerminate');
  assert.ok(!/contacts|cardMarkLeft|bulkMarkLeft|planLeftMarks|leftAt/.test(src),
    '★ 계약해지는 «업체»의 상태다. 담당자를 퇴사로 만들면 진짜 퇴사와 구별이 안 되고,\n'
    + '  재계약할 때 한 명씩 풀어야 한다 (대표 결정 2026-08-29)');
});

/* ── ⑤ 폴더는 «이미 있는 것»을 찾아 쓴다 ──────────────────────────── */
test('★ 계약해지 회사 폴더를 이름으로 «찾아» 쓴다 — 새로 만들지 않는다', () => {
  const b = { _canon: s => String(s||'').replace(/^\s*\d+\s*[.)\-]?\s*/,'').replace(/\s/g,''),
              _coFolders: { f1:{id:'f1',name:'1. 업체관리'},
                            f2:{id:'f2',name:'2. 계약해지사업장'} } };
  vm.createContext(b);
  vm.runInContext(fn('coClosedFolder'), b);
  const g = vm.runInContext('coClosedFolder()', b);
  assert.ok(g, '「2. 계약해지사업장」을 못 찾았다 — 새로 만들면 해지 업체가 두 곳으로 갈린다');
  assert.equal(g.id, 'f2');
});

test('★ 엉뚱한 폴더에는 안 걸린다 — 「업체」나 「사업장」이 들어야 한다', () => {
  const mk = names => {
    const f = {}; names.forEach((n, i) => { f['f' + i] = { id: 'f' + i, name: n }; });
    const b = { _canon: s => String(s||'').replace(/^\s*\d+\s*[.)\-]?\s*/,'').replace(/\s/g,''),
                _coFolders: f };
    vm.createContext(b);
    vm.runInContext(fn('coClosedFolder'), b);
    return vm.runInContext('coClosedFolder()', b);
  };
  assert.equal(mk(['1. 업체관리']), null, '★ 살아 있는 거래처 폴더로 해지 업체를 보낸다');
  /* ⚠ 「업체·사업장」 조건을 빼면 이런 폴더가 걸린다 — 2026-08-29 고장 시험에서 샜다 */
  assert.equal(mk(['연말정산 종료분']), null,
    '★ 해지와 무관한 「종료」 폴더로 업체를 보낸다');
  assert.equal(mk(['퇴사자 서류']), null, '★ 사람 서류함으로 업체를 보낸다');
  assert.ok(mk(['2. 계약해지사업장']), '진짜 해지 폴더를 못 찾았다');
});

test('폴더가 없으면 «만들지 않고» 상태만 바꾼다', () => {
  const src = fn('coTerminate');
  assert.ok(/coClosedFolder\(\)/.test(src), '폴더를 찾지 않는다');
  assert.ok(!/putGroup\(\{|coFolders\/'\s*\+\s*uid/.test(src),
    '★ 폴더를 새로 만든다 — 대표님이 만드신 폴더와 갈린다');
});

/* ── ⑥ 풀 때는 폴더를 안 건드린다 ─────────────────────────────────── */
test('★ 「해지 풀기」는 상태만 되돌리고 폴더는 그대로 둔다', () => {
  const src = fn('coTerminate');
  const at = src.indexOf('autoFolderFlush');
  assert.ok(at >= 0, '폴더 옮기는 곳을 못 찾았다');
  const before = src.slice(0, at);
  assert.ok(/if\s*\(\s*on\s*\)|on\s*&&/.test(before),
    '★ 풀 때도 폴더를 옮긴다 — 정리해 둔 것이 되돌아가 버린다');
});

/* ── ⑦ 화면 ──────────────────────────────────────────────────────── */
test('선택 막대에 계약해지 단추가 있다', () => {
  const src = fn('coListHtml');
  const at = src.indexOf('coselbar');
  assert.ok(at >= 0, '선택 막대를 못 찾았다');
  assert.ok(/coAskTerminate\(/.test(src.slice(at, at + 2500)), '계약해지 단추가 없다');
});

test('★ 도구줄을 그릴 때 회사 목록을 훑지 «않는다»', () => {
  /* 4,147곳을 그릴 때마다 훑으면 고를 때마다 도구줄이 그 셈에 매달린다.
     거는지 푸는지는 «누를 때» 정한다. */
  const src = fn('coListHtml');
  const at = src.indexOf('coselbar');
  assert.ok(!/coTerminatePlan\(/.test(src.slice(at, at + 2500)),
    '★ 도구줄이 그려질 때마다 회사 전체를 훑는다');
});
