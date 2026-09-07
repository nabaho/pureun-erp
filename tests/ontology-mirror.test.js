/* 얇은 거울 — 4,158곳 전문을 «두 번 다시» 안 받는다 (온톨로지 4-D, 2026-09-05)
 *
 * ■ 4-C 는 절반이었다
 *   무거운 자리를 끄면 서류 관계가 통째로 빠지고, 켜면 여전히 기업 상세 4,158곳
 *   «전문»을 받는다(계좌번호·예금주·매출액·생년월일이 함께 내려온다).
 *   실시간DB 는 칸을 골라 줄 수 없어서다.
 *
 * ■ ★ 누가 거울을 유지하는가 — 「읽는 쪽」으로 정했다
 *   설계안은 두 길을 적어 두었다.
 *     ㉠ 기업정보함이 «쓸 때마다» 갱신 → 쓰는 자리가 pu-cards.html·js/pu-doc-file.js 두
 *        파일에 흩어져 있어 하나만 놓쳐도 조용히 낡는다. 안 골랐다.
 *     ㉡ Cloud Function 트리거 → 놓칠 수 없지만 함수 배포가 아직 안 돌았다.
 *   그래서 셋째 길로 갔다 — **무거운 자리를 한 번 읽은 김에 거울을 떠 둔다.**
 *   쓰는 자리를 하나도 안 건드리므로 «놓칠 자리»가 없다.
 *   ⚠ 대신 거울은 낡을 수 있다. 그것을 숨기지 않는다 — 언제 뜬 것인지 화면이 말한다.
 *
 * ■ 지키는 규칙
 *   ① ★ 거울에는 «관계에 쓰는 셋»만 담긴다 — 계좌·예금주·매출액·생년월일은 담길 자리가 없다
 *   ② ★ 거울로 읽어도 «같은 관계»가 나온다 — 켰다 껐다 할 때 관계망이 흔들리면 안 된다
 *   ③ ★ 「언제 뜬 것인가」를 맨 마지막에 쓴다 — 반쯤 뜬 거울을 새것으로 읽으면 안 된다
 *   ④ 모아서 쓴다 — 4,158곳을 한 곳씩 쓰면 2026-08-16 이 되풀이된다
 *   ⑤ ★ 화면이 «거울의 나이»를 말한다 — 낡은 것을 새것인 척하지 않는다
 *   ⑥ 원본을 향해 한 글자도 안 쓴다 (pucards/ontIdx 와 그 머리줄뿐)
 * 실행: node --test tests/ontology-mirror.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const O = require('../js/pu-ontology.js');

const erp = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8');

/* 진짜배기 — 민감한 칸이 잔뜩 붙은 기업 상세 한 벌 */
const 기업상세 = {
  b1234567890: {
    company: '천성가축약품', erpCoId: 'co1',
    bankAcct: '110-123-456789', bankHolder: '홍길동',
    sales: '1200000000', birth: '1970-01-01', bizType: '제조',
    docs: { d1: { docName: '사업자등록증', kind: 'biz', pairs: { 계좌: '110-123-456789' } },
            d2: { docName: 'CMS 자동이체', kind: 'cms' } }
  },
  b9999999999: { company: '가나다산업', erpCoId: '', docs: {} }
};

test('★★① 거울에는 «관계에 쓰는 셋»만 담긴다', () => {
  const plan = O.mirrorPlan(기업상세, { at: 1757000000000 });
  const 글 = JSON.stringify(plan.writes);
  for (const 값 of ['110-123-456789', '홍길동', '1200000000', '1970-01-01', '제조']) {
    assert.ok(글.indexOf(값) < 0,
      '★★ 거울에 「' + 값 + '」 이 담겼습니다 — 그러면 거울을 읽는 것도 위험해집니다');
  }
  /* 담아야 할 셋은 들어 있다 */
  const 첫줄 = plan.writes[0].value['ontIdx/b1234567890'];
  assert.deepEqual(Object.keys(첫줄).sort(), ['c', 'd', 'e']);
  assert.equal(첫줄.c, '천성가축약품');
  assert.equal(첫줄.e, 'co1');
  assert.deepEqual(첫줄.d.d1, { n: '사업자등록증', k: 'biz' });
});

test('★★② 거울로 읽어도 «같은 관계»가 나온다', () => {
  const data = { companies: [{ id: 'co1', name: '천성가축약품' }] };
  const 전문 = O.auditIntegrated(data,
    { cards_coinfo: { key: 'cards_coinfo', ok: true, value: 기업상세 } }, {});
  /* 거울을 떠서, 그것으로 다시 읽는다 */
  const plan = O.mirrorPlan(기업상세, {});
  const 거울값 = {};
  plan.writes.forEach((w) => { if (!w.path) Object.keys(w.value).forEach((k) => {
    거울값[k.replace('ontIdx/', '')] = w.value[k]; }); });
  const 거울 = O.auditIntegrated(data,
    { cards_ontidx: { key: 'cards_ontidx', ok: true, value: 거울값 } }, {});

  const 뽑기 = (r) => r.edges.filter((e) => e.predicate === 'attachedTo')
    .map((e) => e.subject + '|' + e.object).sort();
  assert.deepEqual(뽑기(거울), 뽑기(전문),
    '★★ 거울로 읽은 관계가 전문으로 읽은 것과 다릅니다 — 켰다 껐다 할 때 관계망이 흔들립니다');
  assert.ok(뽑기(거울).length >= 2, '관계가 하나도 안 나왔습니다 — 이 검사가 헛돕니다');
});

test('★★③ 「언제 뜬 것인가」를 «맨 마지막»에 쓴다', () => {
  const plan = O.mirrorPlan(기업상세, { at: 1757000000000 });
  const at = plan.writes.findIndex((w) => w.path === 'ontIdxMeta');
  assert.equal(at, plan.writes.length - 1,
    '★★ 머리줄을 먼저 쓰면 «반쯤 뜬» 거울을 새것으로 읽습니다');
  assert.equal(plan.writes[at].value.at, 1757000000000);
  assert.equal(plan.writes[at].value.n, 2, '몇 곳을 떴는지 안 남깁니다');
});

test('★④ 모아서 쓴다 — 한 곳씩이면 4,158번이다', () => {
  const 많이 = {};
  for (let i = 0; i < 900; i++) 많이['b' + i] = { company: '회사' + i, erpCoId: 'co' + i, docs: {} };
  const plan = O.mirrorPlan(많이, {});
  const 덩이 = plan.writes.filter((w) => !w.path);
  assert.ok(덩이.length >= 4 && 덩이.length <= 6,
    '★ 900곳을 ' + 덩이.length + '번에 씁니다');
  for (const w of 덩이) {
    assert.ok(Object.keys(w.value).length <= 200);
    assert.equal(w.merge, true, '★ set 으로 쓰면 앞서 쓴 조각이 지워집니다');
  }
  /* 쪼개면서 한 곳도 잃지 않는다 */
  const 담긴 = new Set();
  덩이.forEach((w) => Object.keys(w.value).forEach((k) => 담긴.add(k)));
  assert.equal(담긴.size, 900, '★ 쪼개면서 ' + (900 - 담긴.size) + '곳을 잃었습니다');
});

test('★⑥ 원본을 향해 한 글자도 안 쓴다', () => {
  const plan = O.mirrorPlan(기업상세, {});
  assert.equal(plan.root, 'pucards');
  for (const w of plan.writes) {
    assert.ok(w.path === 'ontIdxMeta' || w.path === '', '알 수 없는 자리: ' + w.path);
    if (!w.path) for (const k of Object.keys(w.value)) {
      assert.match(k, /^ontIdx\//, '★ 거울 밖에 씁니다: ' + k);
    }
  }
});

test('자리 이름으로 못 쓸 열쇠는 «건너뛴다» — 통째로 멎지 않는다', () => {
  const plan = O.mirrorPlan({ 'a.b': { company: '점든이름' }, ok1: { company: '멀쩡' } }, {});
  assert.equal(plan.rows, 1, '★ 실시간DB 가 못 받는 열쇠를 그대로 씁니다');
});

test('★⑤ 화면이 «거울의 나이»를 말하고, 안 읽었으면 못 뜨게 한다', () => {
  assert.match(erp, /🪞 얇은 거울/, '거울 칸이 화면에 없습니다');
  assert.match(erp, /마지막으로 뜬 때/,
    '★ 나이를 안 말하면 낡은 거울을 새것으로 믿습니다');
  assert.match(erp, /아직 없습니다 — 진단이 기업 상세 전문을 받고 있습니다/,
    '★ 거울이 없을 때 왜 아직 전문을 받는지 안 알려 줍니다');
  const at = erp.indexOf('function buildMirror()');
  assert.ok(at > 0, '거울 뜨는 자리가 없습니다');
  const fn = erp.slice(at, erp.indexOf('\n  /* ── ☁ 관계망 올리기', at));
  assert.match(fn, /if\(!_ontHeavyRaw\)/,
    '★ 안 읽고도 뜨려 들면 «빈 거울»이 서버에 올라갑니다');
  assert.match(fn, /window\.confirm\(/, '묻지 않고 4,158곳을 씁니다');
  assert.match(fn, /차례\.shift\(\)/, '★ 차례를 안 지키면 머리줄이 먼저 닿습니다');
});

test('거울을 «먼저» 읽는다 — 무거운 자리는 그대로 켤 때만', () => {
  const plan = O.getReadPlan({ uid: 'u1' });
  const 거울 = plan.find((x) => x.key === 'cards_ontidx');
  assert.ok(거울 && 거울.skip === false, '★ 거울을 기본으로 안 읽으면 서류 관계가 빕니다');
  const 무거운것 = plan.find((x) => x.key === 'cards_coinfo');
  assert.equal(무거운것.skip, true, '★ 기본으로 전문을 받고 있습니다');
});
