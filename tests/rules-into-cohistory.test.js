'use strict';
// 취업규칙을 기업 상세 업무 이력의 한 갈래로 · 업무관리에서는 보기만
//   node --test tests/rules-into-cohistory.test.js
//
// 왜: 취업규칙 회차는 rules_mgmt/index 에 있고 컨설팅·사건은 data/*/v 에 있다.
// 자리가 다를 뿐 「그 회사와 있었던 일」인 것은 같다 — 한 표에서 봐야
// 「2026년에 이 회사와 무슨 일이 있었나」가 잡힌다.
//
// ★ 업무관리는 보여주기만 한다(대표 지시). 업무 기록에 자동으로 글을 쓰지 않는다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const readSrc = f => fs.readFileSync(path.join(root, f), 'utf8').split('\r\n').join('\n');
const cards = readSrc('pu-cards.html');
const work = readSrc('work.html');
const H = require(path.join(root, 'js', 'pu-rules-history.js'));

function seed() {
  return H._seed([
    ['site_b', 'r1', { site: '(주)한빛산업', bizno: '214-86-01234', asof: '2026-08-01',
      kind: '일부개정', changed: 3, arts: ['제12조(연차유급휴가)', '제31조(육아휴직)'], artsMore: 1,
      doneBy: '나바호', doneAt: '2026-08-23 14:20' }],
    ['site_b', 'r0', { site: '주식회사 한빛산업', bizno: '2148601234', asof: '2023-03-01',
      from: 'chwieop', changed: 86, doneBy: '이사무', doneAt: '2023-02-27 16:30' }],
    ['site_x', 'r1', { site: '성진테크', asof: '2024-11-01', kind: '전부개정', doneBy: '김노무' }]
  ].map(a => H._shape(a[0], a[1], a[2])));
}

/* ── 기업정보함: 회차 하나를 이력 줄로 옮기는 자리만 떼어 돌린다 ── */
function loadRow() {
  const from = cards.indexOf('function erpHistRow(rec, typesByKind){');
  const to = cards.indexOf('function erpHistRowHtml(row, grouped){');
  assert.ok(from > 0 && to > from, 'erpHistRow 를 찾을 수 없습니다');
  return new Function('erpHistName', 'erpHistYear', 'erpHistMd', 'erpHistFee', 'erpHistStat', 'window',
    cards.slice(from, to) + '\nreturn erpHistRow;'
  )(() => '이름', () => '2020', () => '', () => 0, () => 'run', { PuRulesHistory: H });
}

test('취업규칙 회차가 이력 줄로 옮겨진다 — 금액은 없고 상태는 늘 완료', () => {
  const list = seed();
  const erpHistRow = loadRow();
  const r = erpHistRow(Object.assign({ _kind: 'rules' }, list[0]), {});
  assert.equal(r.kind, 'rules');
  assert.equal(r.name, '일부개정 3개 조', '무엇이 얼마나 바뀌었는지가 이름이다');
  assert.equal(r.year, '2026');
  assert.equal(r.mgr, '나바호');
  assert.match(r.no, /2026-08-01 시행/);
  assert.equal(r.fee, 0, '취업규칙에는 금액이 없다 — 화면이 「—」로 그린다');
  assert.equal(r.stat, 'done', '확정된 회차만 담으므로 늘 완료다');
  assert.match(r.sub, /제12조\(연차유급휴가\)/, '바뀐 조가 아랫줄에 붙는다');
  assert.match(r.open, /^rules\.html\?sso=1#rev=/, '대조표는 규정관리에서 연다');
});

test('제정은 「N개 조」를 안 붙인다 — 전부 새로 만든 것이라 셈이 뜻이 없다', () => {
  const list = seed();
  const erpHistRow = loadRow();
  const enact = list.find(x => x.kind === '제정');
  const r = erpHistRow(Object.assign({ _kind: 'rules' }, enact), {});
  assert.equal(r.name, '제정');
  assert.equal(r.year, '2023');
});

test('취업규칙이 아닌 기록은 예전 길로 그대로 간다', () => {
  const erpHistRow = loadRow();
  const r = erpHistRow({ _kind: 'consulting', companyName: '가' }, {});
  assert.equal(r.kind, 'consulting');
  assert.equal(r.sub, undefined, '취업규칙에만 붙는 칸이 남의 갈래에 새면 안 된다');
  assert.equal(r.open, undefined);
});

test('기업 상세가 취업규칙 회차를 같은 표에 섞는다', () => {
  assert.match(cards, /rules:'취업규칙'/, '갈래 이름표');
  assert.match(cards, /_kind:'rules'/, '이력 자료에 섞는다');
  assert.match(cards, /\.cohist-row \.bd\.k-rules/, '줄 배지 색');
  assert.match(cards, /\.cohist-chip\.on\.k-rules/, '칩 색');
  // ⚠ loadErpCaseCons 에 끼워 넣지 않는다 — 그 함수는 「이알피의 정해진 자리만 읽는다」는
  //   약속이 있다(다른 검사가 지킨다). 그릴 때 붙이는 편이 더 옳기도 하다: 회차가 새로
  //   확정돼도 캐시가 낡지 않는다.
  assert.match(cards, /erpHistRecsFor\(data, o\.bizno, o\.name\)\.concat\(coRulesRecs\(o\)\)/);
  assert.match(cards, /function coRulesRecs\(o\)/);
  assert.match(cards, /Promise\.all\(paths\.map\(p=>db\.ref\(p\)\.once\('value'\)\)\)/,
    'loadErpCaseCons 가 읽는 자리는 그대로여야 한다');
});

test('기업 상세는 회차 원본이 아니라 가벼운 색인만 읽는다', () => {
  // 원본에는 신구대조표 전문이 들어 있다 — 회사 하나 보자고 통째로 받으면 안 된다
  assert.equal(cards.indexOf("ref('rules_mgmt/done"), -1);
  assert.equal(cards.indexOf('ref("rules_mgmt/done'), -1);
  assert.match(cards, /PuRulesHistory\.load\(/, '공용 읽개가 색인만 읽는다');
});

/* ── 업무관리: 보기만 ── */
function loadWorkBox(opts) {
  opts = opts || {};
  const from = work.indexOf('function dRulesHTML(it){');
  const to = work.indexOf('function wkOpenRuleRev(url){');
  assert.ok(from > 0 && to > from, 'dRulesHTML 를 찾을 수 없습니다');
  return new Function('window', 'coFind', 'esc', 'escJ',
    work.slice(from, to) + '\nreturn dRulesHTML;'
  )({ PuRulesHistory: H }, () => opts.co || null, s => String(s == null ? '' : s), s => String(s));
}

test('업무관리는 그 회사의 취업규칙 회차를 보여준다', () => {
  seed();
  const dRulesHTML = loadWorkBox({ co: { bizNo: '214-86-01234', name: '(주)한빛산업' } });
  const h = dRulesHTML({ company: '한빛산업', co_id: 'c1' });
  assert.match(h, /📕 취업규칙 이력/);
  assert.match(h, /2회차/, '사업자번호가 같으면 상호 표기가 달라도 한 줄기');
  assert.match(h, /일부개정/);
  assert.match(h, /제12조\(연차유급휴가\)/);
  assert.match(h, /보기만 합니다 · 고치는 곳은 규정관리입니다/);
});

test('회차가 없으면 칸 자체를 안 그린다 — 빈 칸이 생기면 안 된다', () => {
  seed();
  const dRulesHTML = loadWorkBox({ co: { bizNo: '999-99-99999', name: '없는회사' } });
  assert.equal(dRulesHTML({ company: '없는회사' }), '');
});

test('업체 목록을 아직 못 읽었어도 상호명으로 잇는다', () => {
  seed();
  const dRulesHTML = loadWorkBox({ co: null });          // coFind 가 아직 null
  const h = dRulesHTML({ company: '성진테크' });
  assert.match(h, /1회차/);
  assert.match(h, /전부개정/);
});

test('공용 읽개가 없으면 조용히 빈다 — 그 칸만 빠지고 서랍은 그대로 뜬다', () => {
  const from = work.indexOf('function dRulesHTML(it){');
  const to = work.indexOf('function wkOpenRuleRev(url){');
  const f = new Function('window', 'coFind', 'esc', 'escJ',
    work.slice(from, to) + '\nreturn dRulesHTML;')({}, () => null, s => s, s => s);
  assert.equal(f({ company: '가' }), '');
});

/* ★ 대표 지시 — 업무관리는 보여주기만 한다 */
test('업무관리는 취업규칙 때문에 업무 기록에 글을 쓰지 않는다', () => {
  const from = work.indexOf('function dRulesHTML(it){');
  const to = work.indexOf('// 관련 지식');
  const block = work.slice(from, to);
  ['fbDb.ref', '.set(', '.update(', '.push(', 'patchItem', 'addLog', 'saveNext']
    .forEach(w => assert.equal(block.indexOf(w), -1, '보기만 해야 하는데 「' + w + '」 가 있다'));
});

test('업무관리 취업규칙 칸이 서랍 밖으로 밀리지 않는다', () => {
  // 격자 1fr 칸은 기본값(min-width:auto)이라 안 접히는 긴 글이 오면 칸이 그만큼 벌어진다
  assert.match(work, /\.rhrow \.x\{[^}]*min-width:0/);
  assert.match(work, /\.rhrow \.x \.ar\{[^}]*white-space:normal/, '바뀐 조는 접혀서 다 보여야 한다');
});

test('두 화면 모두 공용 읽개를 판번호와 함께 읽는다', () => {
  [['pu-cards.html', cards], ['work.html', work]].forEach(([n, src]) => {
    assert.match(src, /js\/pu-rules-history\.js\?v=\d+/, n);
  });
});
