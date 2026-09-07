'use strict';
/* 취업규칙 서고 2단계 — 일괄 분류 (설계서 §4 「이 물건의 심장」)
 *
 * ■ 폴더를 통째로 떨어뜨리면 파일마다 셋을 가려야 한다 — 어느 사업장 / 몇 년 / 무슨 서류.
 *   수백 건이라 한 줄씩 고칠 수 없다.
 *
 * ■ ★★ 원칙 — 못 가리면 «추측하지 않는다»
 *   빈칸은 눈에 띄지만 **틀린 값을 확신해서 넣으면 아무도 못 찾는다.**
 *   설계서가 이 원칙을 실제 사고로 확인했다 — `erpVatTextToFlag` 가 「부가세 불포함」을
 *   정반대로 판정해 청구액이 10% 적게 잡히고 있었다.
 *   그래서 애매한 것은 `etc` 로 밀어 넣지 않고 **「확인 필요」로 사람 앞에 올린다.**
 *
 * ■ 지키는 규칙
 *   ① ★ 못 가린 것은 «무엇을» 못 가렸는지 말한다 — 「확인 필요」만으로는 고칠 수가 없다
 *   ② ★ 연도를 못 가리면 «올해로 바꾸지 않는다» — 조용한 추측이 가장 나쁘다
 *   ③ ★ 한 회차에 취업규칙 둘 + 신·구 표시 없음 → 부칙 시행일이 «이른 쪽»이 before
 *   ④ ★ 시행일을 둘 다 모르면 «가리지 않는다» — 차례로 정하면 다시 읽을 때 답이 달라진다
 *   ⑤ ★ 폴더 한 번에 적용해도 «이미 가려진 줄»은 안 덮는다 (사람이 시키면 덮는다)
 *   ⑥ ★ 확인 필요분은 «빼고 먼저 올린다» — 17건 때문에 325건이 막히면 안 된다
 *   ⑦ ★ 쓰는 순서는 «무거운 것부터» — 끊겨도 고아 파일이 목록에 안 뜬다
 * 실행: node --test tests/rules-casebook-classify.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const CB = require(path.join(__dirname, '..', 'js', 'pu-rules-casebook.js'));

const ERP = [{ name: '한빛산업', bizno: '1234567890' }];

test('★ 다 가려지면 「확인 필요」가 아니다', () => {
  const r = CB.classifyOne({ path: '한빛산업/취업규칙_개정안_2022.hwp',
    name: '취업규칙_개정안_2022.hwp' }, ERP);
  assert.equal(r.site, '한빛산업');
  assert.equal(r.year, '2022');
  assert.equal(r.role, 'after');
  assert.equal(r.need, false);
  assert.deepEqual(r.why, []);
});

test('★★① 못 가린 것은 «무엇을» 못 가렸는지 말한다', () => {
  const r = CB.classifyOne({ path: 'A/규정.hwp', name: '규정.hwp' }, ERP);
  assert.equal(r.need, true);
  assert.deepEqual(r.why.sort(), ['사업장', '서류종류', '연도'],
    '★★ 「확인 필요」만 알려 주면 무엇을 고쳐야 하는지 알 수 없습니다');
});

test('★★② 연도를 못 가리면 «올해로 바꾸지 않는다»', () => {
  assert.equal(CB.yearOf('취업규칙.hwp', '', null), '',
    '★★ 조용히 올해로 두면 십 년치가 한 해에 쌓입니다');
  /* 파일명 › 본문 › 파일 수정일 차례 */
  assert.equal(CB.yearOf('규정_2019.hwp', '2022년 3월 1일', 0), '2019', '파일명이 먼저입니다');
  assert.equal(CB.yearOf('규정.hwp', '2021. 5. 1. 부터 시행한다', 0), '2021', '본문이 다음입니다');
  assert.equal(CB.yearOf('규정.hwp', '', Date.UTC(2018, 4, 1)), '2018', '마지막이 파일 수정일입니다');
  /* 본문에 여러 날짜가 있으면 «늦은 것» — 부칙이 뒤에 붙는다 */
  assert.equal(CB.yearOf('규정.hwp', '2015.1.1 제정 / 2020.7.1 개정', 0), '2020');
});

test('★★③ 취업규칙 둘 + 신·구 표시 없음 → 시행일이 «이른 쪽»이 before', () => {
  const rows = CB.classify([
    { path: '한빛산업/취업규칙(1)_2022.hwp', name: '취업규칙(1)_2022.hwp', head: '2022. 1. 1. 시행' },
    { path: '한빛산업/취업규칙(2)_2022.hwp', name: '취업규칙(2)_2022.hwp', head: '2022. 7. 1. 시행' }
  ], ERP);
  const 이른것 = rows.find((r) => r.name.includes('(1)'));
  const 늦은것 = rows.find((r) => r.name.includes('(2)'));
  assert.equal(이른것.role, 'before', '★★ 이른 시행일이 개정 «전»입니다');
  assert.equal(늦은것.role, 'after');
  assert.equal(이른것.need, false, '가렸는데도 확인 필요로 남았습니다');
  assert.match(이른것.how, /시행일/, '어떻게 가렸는지 안 남깁니다');
});

test('★★④ 시행일을 둘 다 모르면 «가리지 않는다»', () => {
  const rows = CB.classify([
    { path: '한빛산업/취업규칙(1)_2022.hwp', name: '취업규칙(1)_2022.hwp' },
    { path: '한빛산업/취업규칙(2)_2022.hwp', name: '취업규칙(2)_2022.hwp' }
  ], ERP);
  for (const r of rows) {
    assert.equal(r.role, null,
      '★★ 파일 차례로 신·구를 정하면 폴더를 다시 읽을 때 답이 달라집니다');
    assert.equal(r.need, true);
  }
});

test('둘이 아니라 셋이면 안 가린다 — 「둘일 때」의 규칙이다', () => {
  const rows = CB.classify([1, 2, 3].map((i) => ({
    path: '한빛산업/취업규칙(' + i + ')_2022.hwp', name: '취업규칙(' + i + ')_2022.hwp',
    head: '2022. ' + i + '. 1. 시행' })), ERP);
  assert.ok(rows.every((r) => r.role === null), '★ 셋을 신·구로 가르면 하나가 사라집니다');
});

test('★★⑤ 폴더 한 번에 적용해도 «이미 가려진 줄»은 안 덮는다', () => {
  const rows = CB.classify([
    { path: '2022개정/취업규칙_한빛산업_개정안.hwp', name: '취업규칙_한빛산업_개정안.hwp' },
    { path: '2022개정/신구대조표.hwp', name: '신구대조표.hwp' }
  ], ERP);
  const 적용 = CB.applyFolderSite(rows, '2022개정', '미래테크', '9998887777');
  const 이미 = 적용.find((r) => r.name.includes('한빛산업'));
  const 빈것 = 적용.find((r) => r.name.includes('신구대조표'));
  assert.equal(이미.site, '한빛산업', '★★ 맞게 가려진 것을 뭉갰습니다');
  assert.equal(빈것.site, '미래테크', '빈 줄이 안 채워졌습니다');
  assert.equal(빈것.how, '사람');
  assert.ok(!빈것.why.includes('사업장'), '채웠는데 아직 「사업장」을 못 가린 것으로 둡니다');

  /* 사람이 「전부 이 사업장으로」를 누르면 그때는 덮는다 */
  const 강제 = CB.applyFolderSite(rows, '2022개정', '미래테크', '9998887777', true);
  assert.equal(강제.find((r) => r.name.includes('한빛산업')).site, '미래테크');
});

test('★★ 폴더 이름에서 온 «짐작»은 사람이 알려 주면 덮는다', () => {
  /* 폴더가 「2022개정」 이면 siteOf 가 그것을 사업장으로 짚는다(약한 짐작).
     그것을 지켜 주면 「전부 이 사업장으로」를 눌러도 안 바뀐다 — 2026-09-05 에 실제로 그랬다. */
  const rows = CB.classify([{ path: '2022개정/신구대조표.hwp', name: '신구대조표.hwp' }], ERP);
  assert.equal(rows[0].site, '2022개정', '이 검사의 전제가 달라졌습니다');
  assert.equal(CB.firmSite(rows[0]), false, '★★ 폴더 이름을 «단단한» 짐작으로 봅니다');
  const r = CB.applyFolderSite(rows, '2022개정', '한빛산업', '1234567890');
  assert.equal(r[0].site, '한빛산업', '★★ 사람이 알려 줬는데 짐작이 이겼습니다');
});

test('다른 폴더는 안 건드린다', () => {
  const rows = CB.classify([
    { path: 'A/규정.hwp', name: '규정.hwp' }, { path: 'B/규정.hwp', name: '규정.hwp' }
  ], ERP);
  const r = CB.applyFolderSite(rows, 'A', '한빛산업', '1234567890');
  assert.equal(r.find((x) => x.path === 'B/규정.hwp').site, '', '★ 남의 폴더까지 채웠습니다');
});

test('★★⑥ 확인 필요분은 «빼고 먼저 올린다»', () => {
  const rows = CB.classify([
    { path: '한빛산업/취업규칙_개정안_2022.hwp', name: '취업규칙_개정안_2022.hwp' },
    { path: '한빛산업/신구대조표_2022.hwp', name: '신구대조표_2022.hwp' },
    { path: 'A/규정.hwp', name: '규정.hwp' }
  ], ERP);
  const s = CB.splitReady(rows);
  assert.equal(s.ready.length, 2, '★★ 한 건 때문에 나머지가 막히면 안 됩니다');
  assert.equal(s.need.length, 1);
  assert.ok(s.ready.every((r) => !r.need), '확인 필요분이 섞였습니다');
});

test('★★⑦ 쓰는 순서는 «무거운 것부터» — 끊겨도 고아가 목록에 안 뜬다', () => {
  assert.deepEqual(CB.WRITE_ORDER, ['file', 'text', 'rev', 'index'],
    '★★ 색인을 먼저 쓰면 «파일 없는 목록»이 생깁니다 — 눌러도 안 열리는 줄이 됩니다');
});

test('폴더는 맨 뒤 조각을 뺀 나머지다 — 깊은 폴더도 제 자리를 안다', () => {
  assert.equal(CB.folderOf({ path: '2022/한빛산업/규정.hwp' }), '2022/한빛산업');
  assert.equal(CB.folderOf({ path: '규정.hwp' }), '');
});

test('부칙 시행일을 날짜로 읽는다 — 견주려면 자리 수가 같아야 한다', () => {
  assert.equal(CB.effDateOf('2022. 7. 1. 부터 시행한다'), '2022-07-01');
  assert.equal(CB.effDateOf('2022년 12월 25일'), '2022-12-25');
  assert.equal(CB.effDateOf('시행일 없음'), '');
  /* 자리 수를 안 맞추면 '2022-7-1' > '2022-12-25' 가 되어 신·구가 뒤집힌다 */
  assert.ok(CB.effDateOf('2022. 7. 1.') < CB.effDateOf('2022. 12. 25.'),
    '★ 날짜 견주기가 뒤집힙니다');
});
