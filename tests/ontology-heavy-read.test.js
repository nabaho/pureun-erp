/* 무거운 자리는 «켤 때만» 읽는다 (대표 지시 2026-09-04 ㉢)
 *
 * ■ 무엇이 문제였나
 *   진단을 한 번 돌릴 때마다 기업 상세(pucards/coInfo) **4,158곳 «전문»**을 받았다.
 *   관계에 쓰는 값은 셋(erpCoId·company·docs)뿐인데, 한 칸에는 pu-cards.html 의
 *   CO_FIELDS 서른 칸이 들어 있고 그 안에
 *     · 계좌번호(대표 결정으로 «온전히» 담긴다) · 예금주
 *     · 직전년도 매출액 · 생년월일
 *   이 있다. 받는 만큼 요금이 붙고, 그것이 통째로 브라우저 메모리에 올라왔다.
 *   CLAUDE.md 「관계 진단은 경량 메타데이터만 읽는다」와 어긋난다.
 *
 * ★ 어긋난 안내가 함께 있었다 — 어댑터 주석이 「두 자리 모두 «가벼운 자료»다」라고
 *   적어 두고 있었다. 읽은 사람이 안심하고 틀리는 자리다.
 *
 * ■ 지키는 규칙
 *   ① 무거운 자리는 «무겁다고 밝힌다» — 무엇이 함께 내려오는지 적는다
 *   ② 기본은 «안 읽는다». 켤 때만 읽는다
 *   ③ ★ 안 읽었으면 «숨기지 않는다» — 무엇이 빠졌는지 낮은 등급으로 남긴다
 *   ④ ★ 「안 읽음」과 「못 읽음(권한)」을 섞지 않는다 — 섞으면 권한 문제로 오해한다
 *   ⑤ ★ 켜면 실제로 읽고 관계가 나온다 — 스위치가 헛되면 안 된다
 * 실행: node --test tests/ontology-heavy-read.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const O = require('../js/pu-ontology.js');

const root = path.join(__dirname, '..');
const cards = fs.readFileSync(path.join(root, 'pu-cards.html'), 'utf8');
const erp = fs.readFileSync(path.join(root, 'pu-erp.html'), 'utf8');

test('★① 무거운 자리는 «무겁다고» 밝히고, 무엇이 함께 내려오는지 적는다', () => {
  const a = O.READ_ADAPTERS.cards_coinfo;
  assert.ok(a, '기업 상세 어댑터가 없습니다');
  assert.ok(a.heavy && a.heavy.length > 10,
    '★ 무거운 자리를 안 밝히면 다음 사람이 «가벼운 줄» 압니다');
  /* 관계에 실제로 쓰는 칸을 적어 둔다 — 얇은 거울을 만들 때 이것이 명세가 된다 */
  assert.deepEqual(a.uses, ['erpCoId', 'company', 'docs']);
  assert.ok(a.gives && a.gives.length, '켜면 무엇이 나오는지 안 적었습니다');
});

test('★★ 정말 민감한 칸이 그 자리에 있는가 — 원본에서 확인한다', () => {
  /* 값이 아니라 «주장이 사실인가»를 본다. 기업정보함이 그 칸을 지우면 이 검사도
     함께 낡아야 하므로, 저장소의 CO_FIELDS 를 직접 읽어 견준다. */
  const at = cards.indexOf('const CO_FIELDS = [');
  assert.ok(at > 0, 'CO_FIELDS 를 찾지 못했습니다');
  const 칸 = cards.slice(at, cards.indexOf('\n];', at));
  for (const k of ['bankAcct', 'bankHolder', 'sales', 'birth']) {
    assert.ok(칸.includes("'" + k + "'"),
      '★ ' + k + ' 이 CO_FIELDS 에서 사라졌다면 heavy 사유도 다시 써야 합니다');
  }
  /* 그 사유가 화면 말로도 적혀 있는가 */
  assert.match(O.READ_ADAPTERS.cards_coinfo.heavy, /계좌번호/);
});

test('★② 기본은 안 읽는다 — 켤 때만 읽는다', () => {
  const 기본 = O.getReadPlan({ uid: 'u1' }).find((x) => x.key === 'cards_coinfo');
  assert.ok(기본, '★ 목록에서 아예 빼면 «무엇을 안 읽었는지» 말할 수 없습니다');
  assert.equal(기본.skip, true, '★ 기본으로 4,158곳 전문을 받고 있습니다');

  const 켬 = O.getReadPlan({ uid: 'u1', heavy: true }).find((x) => x.key === 'cards_coinfo');
  assert.equal(켬.skip, false, '★ 켜도 안 읽으면 스위치가 헛됩니다');

  /* 가벼운 자리는 늘 읽는다 — 무거운 것만 걸러야 한다 */
  const 가벼운것 = O.getReadPlan({ uid: 'u1' }).filter((x) => !x.heavy);
  assert.ok(가벼운것.length >= 5 && 가벼운것.every((x) => x.skip === false),
    '★ 가벼운 자리까지 건너뛰면 진단이 통째로 비어 버립니다');
});

test('★★③④ 안 읽었으면 숨기지 않는다 — 그리고 «권한 문제»로 섞지 않는다', () => {
  const rep = O.auditIntegrated({ companies: [] },
    { cards_coinfo: { key: 'cards_coinfo', ok: false, skipped: true } }, {});
  const 알림 = rep.issues.find((i) => i.code === 'source_skipped_heavy');
  assert.ok(알림, '★★ 건너뛴 것을 조용히 넘기면 서류 관계가 «원래 없는» 줄 압니다');
  assert.equal(알림.severity, 'low', '건너뛴 것은 위험이 아니라 알림입니다');
  assert.match(알림.detail, /빠진 것/, '무엇이 빠졌는지 안 말합니다');

  /* 권한으로 막힌 것과 섞이면 안 된다 */
  assert.equal(rep.coverage.cards.denied, 0,
    '★★ 「안 읽음」을 「못 읽음(권한)」으로 셌습니다 — 없는 권한 문제를 찾게 됩니다');
  assert.equal(rep.coverage.cards.skipped, 1, '건너뛴 수를 안 셉니다');
  assert.ok(!rep.issues.some((i) => i.code === 'source_unreadable' && i.store === 'cards_coinfo'),
    '★★ 권한 오류로도 함께 올렸습니다');
});

test('★⑤ 켜면 실제로 읽고 관계가 나온다', () => {
  const data = { companies: [{ id: 'co1', name: '천성가축약품' }] };
  const value = { 'b1234567890': { company: '천성가축약품', erpCoId: 'co1',
    bankAcct: '110-123-456789', sales: '1200000000',
    docs: { d1: { docName: '사업자등록증', kind: 'biz' } } } };
  const rep = O.auditIntegrated(data,
    { cards_coinfo: { key: 'cards_coinfo', ok: true, value: value } }, {});
  assert.ok(rep.edges.some((e) => e.sourceStore === 'cards_coinfo' && e.predicate === 'attachedTo'),
    '★ 켰는데도 서류 관계가 안 나옵니다');
  assert.ok(!rep.issues.some((i) => i.code === 'source_skipped_heavy'),
    '읽었는데도 건너뛴 것으로 적혔습니다');
});

test('★ 저장되는 것에는 민감한 칸이 «안 들어간다» — 문제는 저장이 아니라 내려받기다', () => {
  const data = { companies: [{ id: 'co1', name: '천성가축약품' }] };
  const value = { 'b1': { company: '천성가축약품', erpCoId: 'co1',
    bankAcct: '110-123-456789', bankHolder: '홍길동', sales: '1200000000', birth: '1970-01-01',
    docs: { d1: { docName: '사업자등록증' } } } };
  const rep = O.auditIntegrated(data, { cards_coinfo: { key: 'cards_coinfo', ok: true, value } }, {});
  const 글 = JSON.stringify(O.buildSnapshot(rep));
  for (const 값 of ['110-123-456789', '홍길동', '1200000000', '1970-01-01']) {
    assert.ok(글.indexOf(값) < 0,
      '★ 관계망에 「' + 값 + '」 이 들어갔습니다 — 색인은 원본 payload 를 복제하지 않습니다');
  }
});

test('화면에 스위치가 있고 기본은 꺼져 있다', () => {
  assert.match(erp, /useState\(false\); var readHeavy/, '스위치 상태가 없습니다');
  assert.match(erp, /getReadPlan\(\{uid:[^}]*heavy:readHeavy===true\}\)/,
    '★ 스위치를 만들어 두고 진단에 안 넘기면 아무 일도 안 일어납니다');
  assert.match(erp, /if\(a\.skip\) return Promise\.resolve\(\{key:a\.key,ok:false,skipped:true/,
    '★ skip 이 달렸는데도 실제로는 받고 있습니다');
  assert.match(erp, /기업 상세도 함께 읽기/, '사람이 켤 자리가 화면에 없습니다');
});
