'use strict';
/* 서고를 «보여 주는» 부분 (설계서 §5-①②)

   ★ 여기서 지키는 것 넷
     ① 목록은 index 층«만» 보고 만든다 — 회차·본문이 섞이면 서고를 여는 순간 수십 MB
     ② 안 준 조건으로는 «안 거른다» — 빈 값을 조건으로 삼으면 아무것도 안 보인다
     ③ 회차는 «회차 번호»로 줄 세운다 — 2022 다음은 2022-2 다
     ④ 못 하는 것은 «왜 못 하는지»를 말한다 — 단추만 흐리면 아무도 모른다 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const CB = require(path.join(__dirname, '..', 'js', 'pu-rules-casebook.js'));

const IDX = {
  site_a: { site: '한빛산업', bizno: '1234567890', industry: '제조', size: 42,
            revCount: 3, lastYear: '2024', updatedBy: '권형하', updatedAt: '2026-09-07 10:00' },
  site_b: { site: '가나상사', bizno: '2223334440', industry: '도소매', size: 8,
            revCount: 1, lastYear: '2024', updatedBy: '김노무', updatedAt: '2026-09-01 09:00' },
  site_c: { site: '다래물산', bizno: '3334445550', industry: '건설',
            revCount: 2, lastYear: '2021', updatedBy: '권형하', updatedAt: '2026-08-01 09:00' },
  site_d: { site: '연도없음', revCount: 1, updatedBy: '권형하' }
};

/* ── ① 목록 ─────────────────────────────────────────────────────── */

test('★ 최근 연도가 앞, 같은 해면 사업장 이름 차례', () => {
  const r = CB.indexRows(IDX);
  assert.deepEqual(Array.from(r, x => x.site), ['가나상사', '한빛산업', '다래물산', '연도없음']);
});

test('★ 연도를 모르는 것은 «맨 뒤» — 가운데 섞이면 목록이 뒤죽박죽으로 보인다', () => {
  const r = CB.indexRows(IDX);
  assert.equal(r[r.length - 1].site, '연도없음');
});

test('★ 없는 칸을 지어내지 않는다 — 규모를 모르면 null 이지 0 이 아니다', () => {
  const r = CB.indexRows(IDX).find(x => x.siteKey === 'site_d');
  assert.equal(r.size, null, '모르는 규모를 0 으로 적으면 「직원 없는 회사」가 된다');
  assert.equal(r.industry, '');
});

test('업체가 아닌 것이 섞여 있어도 줄로 세지 않는다', () => {
  const r = CB.indexRows({ site_a: IDX.site_a, 뭔가: 3, 또: null, 배열: [1, 2] });
  assert.equal(r.length, 1);
});

/* ── 거르기 ─────────────────────────────────────────────────────── */

test('★★ 안 준 조건으로는 «안 거른다» — 빈 거르개는 전부를 보인다', () => {
  const rows = CB.indexRows(IDX);
  assert.equal(CB.filterIndex(rows, {}).length, rows.length);
  assert.equal(CB.filterIndex(rows, { text: '', year: '', industry: '' }).length, rows.length);
});

test('글자로 찾을 때 사업장·사업자번호·업종·담당을 함께 본다', () => {
  const rows = CB.indexRows(IDX);
  assert.equal(CB.filterIndex(rows, { text: '한빛' })[0].site, '한빛산업');
  assert.equal(CB.filterIndex(rows, { text: '2223334440' })[0].site, '가나상사');
  assert.equal(CB.filterIndex(rows, { text: '건설' })[0].site, '다래물산');
  assert.equal(CB.filterIndex(rows, { text: '김노무' })[0].site, '가나상사');
});

test('연도·업종·담당으로 거른다', () => {
  const rows = CB.indexRows(IDX);
  assert.equal(CB.filterIndex(rows, { year: '2024' }).length, 2);
  assert.equal(CB.filterIndex(rows, { industry: '제조' }).length, 1);
  assert.equal(CB.filterIndex(rows, { by: '권형하' }).length, 3);
});

test('★ 규모로 거를 때 «모르는 것»은 빼 놓는다 — 0명으로 치면 안 된다', () => {
  const rows = CB.indexRows(IDX);
  const 작은곳 = CB.filterIndex(rows, { sizeMax: 10 });
  assert.deepEqual(Array.from(작은곳, x => x.site), ['가나상사']);
  assert.ok(!작은곳.some(x => x.size == null), '규모를 모르는 곳이 「10명 이하」에 끼면 안 됩니다');
  assert.deepEqual(Array.from(CB.filterIndex(rows, { sizeMin: 30 }), x => x.site), ['한빛산업']);
});

test('고를 수 있는 연도는 «실제로 있는 것»만, 최근 순', () => {
  assert.deepEqual(Array.from(CB.yearsOf(CB.indexRows(IDX))), ['2024', '2021']);
});

/* ── ② 사업장 이력 ──────────────────────────────────────────────── */

const REV = {
  '2022': { year: '2022', by: '권형하', at: '2022-03-10',
            docs: { after: { name: 'a.hwp', sha: 'x1', artCount: 60 }, daejo: { name: 'd.hwp', sha: 'x2' } } },
  '2022-2': { year: '2022', by: '권형하', docs: { after: { name: 'b.hwp', sha: 'x3' } } },
  '2024': { year: '2024', by: '김노무',
            docs: { before: { name: 'c.hwp', sha: 'x4' }, after: { name: 'e.hwp', sha: 'x5' },
                    report: { name: 'f.hwp', sha: 'x6' } } }
};

test('★ 회차는 최근이 앞 — 같은 해면 «회차 번호»가 뒤엣것이 나중이다', () => {
  assert.deepEqual(Array.from(CB.revRows(REV), r => r.revId), ['2024', '2022-2', '2022']);
});

test('★ 서류 칩은 «자리 차례»가 회차마다 안 바뀐다 — 눈이 같은 자리를 본다', () => {
  const r = CB.revRows(REV).find(x => x.revId === '2024');
  assert.deepEqual(Array.from(r.chips, c => c.role), ['before', 'after', 'report'],
    'ROLES 에 적은 차례를 그대로 따라야 합니다');
  assert.deepEqual(Array.from(r.chips, c => c.label), ['개정 전', '개정본', '신고서']);
});

test('회차에 적힌 해가 없으면 회차 번호에서 가져온다', () => {
  const r = CB.revRows({ '2019': { docs: {} } })[0];
  assert.equal(r.year, '2019');
});

/* ── 「이 회차로 검토 시작」 ─────────────────────────────────────── */

test('개정본이 있으면 검토를 이어갈 수 있다', () => {
  assert.equal(CB.canStartReview(REV['2024']).ok, true);
});

test('★★ 못 할 때는 «왜 못 하는지»를 말한다 — 단추만 흐리면 아무도 모른다', () => {
  const 개정본없음 = CB.canStartReview({ docs: { daejo: { name: 'd.hwp', sha: 'z' } } });
  assert.equal(개정본없음.ok, false);
  assert.ok(개정본없음.why.length > 0);

  const 글없음 = CB.canStartReview({ docs: { after: { name: 'scan.pdf', sha: 'z', noText: true } } });
  assert.equal(글없음.ok, false);
  assert.ok(글없음.why.indexOf('스캔') >= 0, '스캔 파일이라는 것을 말해야 고칠 수 있습니다');
});

/* ── 실적표 ─────────────────────────────────────────────────────── */

test('★ 실적표는 «화면에서 거른 뒤»의 줄을 받는다 — 보는 것과 내보낸 것이 같아야 한다', () => {
  const rows = CB.filterIndex(CB.indexRows(IDX), { by: '권형하' });
  const s = CB.perfSheet(rows);
  assert.equal(s.rows.length, 3);
  assert.equal(s.headers.length, s.colRatios.length, '칸 수와 너비 수가 어긋나면 표가 밀립니다');
  s.rows.forEach(r => assert.equal(r.length, s.headers.length));
});

test('실적표에서 «모르는 규모»는 0 이 아니라 빈칸이다', () => {
  const s = CB.perfSheet(CB.indexRows(IDX));
  const 연도없음 = s.rows.find(r => r[0] === '연도없음');
  assert.equal(연도없음[3], '', '모르는 것을 0 으로 적으면 실적표가 거짓말을 합니다');
});
