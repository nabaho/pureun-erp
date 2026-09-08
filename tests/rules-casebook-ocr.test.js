/* ㉢ 스캔뿐인 옛 회차의 «글자 읽기(OCR)» — 대표 결정 2026-09-07 「읽혀 검색에 걸리게」
 *
 * 이 검사가 지키는 것은 «선 셋»이다. 하나만 무너져도 기계가 잘못 읽은 글이
 * 원문 행세를 하고, 그 글자가 다음 개정 규정에 그대로 옮겨 붙는다.
 *
 *   ① 원문 자리(text)에 안 쓴다        — 딴 층(paths.ocr)이다
 *   ② 문안 은행에 안 넣는다            — 적립은 올리기 길에만 있다
 *   ③ 「검토 시작」을 안 열어 준다      — noText 를 안 지운다
 *
 * ⚠ 값을 박지 않는다. 「40자」처럼 값 자체가 규칙인 것만 까닭과 함께 박는다.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { stripComments } = require('./strip-comments.js');

const ROOT = path.join(__dirname, '..');
const CB = require(path.join(ROOT, 'js', 'pu-rules-casebook.js'));
const HTML = stripComments(fs.readFileSync(path.join(ROOT, 'rules.html'), 'utf8'));

/* 스캔뿐인 회차 한 벌 — 본문류 셋과 제출류 하나 */
const 스캔회차 = () => ({
  year: '2019', ownerUid: 'u1',
  docs: {
    after:  { name: 'a.pdf', sha: 'h1', path: 'casebook/s/2019/after.pdf', noText: true },
    before: { name: 'b.pdf', sha: 'h2', path: 'casebook/s/2019/before.pdf', noText: true },
    daejo:  { name: 'd.pdf', sha: 'h3', noText: true },                    /* 원본이 없다 */
    report: { name: 'r.pdf', sha: 'h4', path: 'casebook/s/2019/report.pdf', noText: true }
  }
});

/* ══════ ① 원문 자리에 안 쓴다 ══════════════════════════════════════ */

test('★★ OCR 은 원문 층(text)과 «딴 자리»에 담긴다 — 같은 자리면 되돌릴 길이 없다', () => {
  const t = CB.paths.text('site_가', '2019', 'after');
  const o = CB.paths.ocr('site_가', '2019', 'after');
  assert.notEqual(o, t, '★ OCR 이 원문 자리에 앉습니다 — 추정이 원문을 덮습니다');
  /* «아래»에 두어도 안 된다 — 원문 층을 통째로 지우면 추정도 함께 사라진다.
     원문 층의 «뿌리»(사업장 앞까지)를 잘라 내어 그 아래가 아닌지 본다. */
  const 원문뿌리 = t.slice(0, t.indexOf('site_가'));
  const OCR뿌리 = o.slice(0, o.indexOf('site_가'));
  assert.ok(!OCR뿌리.startsWith(원문뿌리) && !원문뿌리.startsWith(OCR뿌리),
    '★★ 한쪽이 다른 쪽 «아래»입니다(' + 원문뿌리 + ' ↔ ' + OCR뿌리 + ')'
    + ' — 원문 층을 지우면 추정도 함께 지워지거나 그 반대가 됩니다');
  /* 사업장·회차·서류를 다 갈라야 한 회차의 서류끼리도 안 섞인다 */
  assert.notEqual(CB.paths.ocr('site_가', '2019', 'after'), CB.paths.ocr('site_가', '2019', 'before'));
  assert.notEqual(CB.paths.ocr('site_가', '2019', 'after'), CB.paths.ocr('site_가', '2020', 'after'));
  assert.notEqual(CB.paths.ocr('site_가', '2019', 'after'), CB.paths.ocr('site_나', '2019', 'after'));
});

test('OCR 자리도 «아는 서류»만 받는다 — 모르는 이름은 그 자리에서 걸린다', () => {
  assert.throws(() => CB.paths.ocr('site_가', '2019', '아무거나'), /알 수 없는 역할/);
});

test('★ 화면도 원문 자리에 OCR 을 쓰지 않는다 — 쓰는 곳은 paths.ocr 뿐이다', () => {
  /* 「담는다」는 set/update 다. paths.text 로 쓰는 곳이 올리기 길 말고 늘면 안 된다. */
  const 원문쓰기 = HTML.match(/ref\(CB\.paths\.text\([^)]*\)\)\.(set|update)\(/g) || [];
  assert.equal(원문쓰기.length, 1,
    '★ 원문 자리에 쓰는 곳이 ' + 원문쓰기.length + '군데입니다 — 올리기(cbUpload) 한 곳이어야 합니다');
});

/* ══════ ② 문안 은행에 안 넣는다 ════════════════════════════════════ */

test('★★ 읽어낸 글은 문안 은행에 «적립되지 않는다» — 추정 문구가 다음 규정에 복사된다', () => {
  const i = HTML.indexOf('async function cbOcrRun');
  assert.ok(i > 0, 'cbOcrRun 이 없습니다');
  /* 함수 끝까지가 아니라 «넉넉히» 훑는다 — 뒤에 몰래 붙여도 걸리게 */
  const 몸 = HTML.slice(i, i + 6000);
  assert.ok(!/bankAccum/.test(몸),
    '★ OCR 길에 문안 은행 적립(bankAccum)이 들어왔습니다 — 추정 문구가 은행에 섞입니다');
});

/* ══════ ③ 「검토 시작」을 안 열어 준다 ═════════════════════════════ */

test('★★ 읽어내도 「검토 시작」은 여전히 막힌다 — 틀린 글자가 다음 규정에 남는다', () => {
  const rev = 스캔회차();
  assert.equal(CB.canStartReview(rev).ok, false, '읽기 전부터 열려 있습니다');
  /* 읽어낸 뒤의 회차 — 딱지만 붙는다 */
  Object.assign(rev.docs.after, CB.ocrMark('가'.repeat(500)));
  assert.equal(CB.canStartReview(rev).ok, false,
    '★ OCR 을 읽었다고 검토가 열렸습니다 — 추정 글이 개정 문안의 밑감이 됩니다');
});

test('★★ 딱지는 noText 를 «지우지 않는다» — 그것은 「원본에 글자층이 없었다」는 사실이다', () => {
  const 딱지 = CB.ocrMark('가나다라마');
  assert.ok(!('noText' in 딱지),
    '★ 딱지가 noText 를 건드립니다 — 지우면 원문인지 추정인지 아무도 못 가리고 검토가 열립니다');
  assert.equal(딱지.ocr, true);
  assert.equal(딱지.ocrN, 5, '글자 수가 실제 길이와 다릅니다');
  assert.ok(딱지.ocrAt, '언제 읽었는지가 없습니다');
});

test('★ 훑기는 «열린다» — 보기와 쓰기는 다르다', () => {
  const rev = 스캔회차();
  const 전 = CB.canScan(rev);
  assert.equal(전.ok, false, '글도 추정도 없는데 훑기가 열려 있습니다');
  assert.ok(전.why, '★ 못 하는 까닭을 안 말합니다 — 흐린 단추만 보면 아무도 모릅니다');

  Object.assign(rev.docs.after, CB.ocrMark('가'.repeat(500)));
  const 후 = CB.canScan(rev);
  assert.equal(후.ok, true, '★ 추정 본문이 있는데 훑기가 안 열립니다 — 읽은 뜻이 없어집니다');
  assert.equal(후.ocr, true, '★★ 추정으로 훑는다는 «딱지»가 없습니다 — 결과가 원문 훑기로 읽힙니다');
});

test('원문이 있으면 훑기는 딱지 없이 열린다', () => {
  const rev = { docs: { after: { name: 'a.hwp', sha: 'h', artCount: 90 } } };
  const r = CB.canScan(rev);
  assert.equal(r.ok, true);
  assert.equal(r.ocr, false, '원문인데 「OCR 추정」 딱지가 붙었습니다');
});

test('canScan 과 canStartReview 가 «같은 함수로 갈음되지» 않았다', () => {
  const rev = 스캔회차();
  Object.assign(rev.docs.after, CB.ocrMark('가'.repeat(500)));
  assert.notEqual(CB.canScan(rev).ok, CB.canStartReview(rev).ok,
    '★ 둘이 같아졌습니다 — 하나로 합치면 추정 글로 검토가 열립니다');
});

/* ══════ 어디에 단추를 붙이나 ═══════════════════════════════════════ */

test('★ 글이 없고 원본이 있는 «본문류»에만 붙는다', () => {
  const rev = 스캔회차();
  assert.equal(CB.canOcr(rev, 'after').ok, true);
  assert.equal(CB.canOcr(rev, 'before').ok, true);
});

test('★★ 제출류(신고서·의견·동의)에는 «안» 붙는다 — 도장·손글씨는 기계가 못 읽는다', () => {
  const rev = 스캔회차();
  CB.SUBMIT_ROLES.forEach((role) => {
    rev.docs[role] = { name: 'x.pdf', sha: 'h', path: 'casebook/s/2019/' + role + '.pdf', noText: true };
    const r = CB.canOcr(rev, role);
    assert.equal(r.ok, false, '★ ' + role + ' 에 글자 읽기가 붙었습니다 — 뽑아 봐야 쓸 데가 없습니다');
    assert.match(r.why, /적기|손글씨|도장/, '왜 안 되는지 대신 무엇을 하라는 말이 없습니다');
  });
});

test('이미 본문이 있으면 안 붙는다 — 읽을 것이 없다', () => {
  const rev = { docs: { after: { name: 'a.hwp', sha: 'h', path: 'casebook/s/2019/after.hwp' } } };
  const r = CB.canOcr(rev, 'after');
  assert.equal(r.ok, false);
  assert.match(r.why, /이미 본문/);
});

test('★ 원본이 없으면 안 붙는다 — 읽을 그림 자체가 없다', () => {
  const rev = 스캔회차();          /* daejo 는 일부러 path 가 없다 */
  const r = CB.canOcr(rev, 'daejo');
  assert.equal(r.ok, false, '★ 원본도 없는데 단추가 붙었습니다 — 눌러도 실패만 합니다');
  assert.match(r.why, /원본/);
});

test('없는 서류에는 안 붙는다', () => {
  assert.equal(CB.canOcr({ docs: {} }, 'after').ok, false);
  assert.equal(CB.canOcr(null, 'after').ok, false, 'rev 가 없을 때 넘어집니다');
});

test('한 번 읽은 것은 «다시 읽기»로 열려 있다 — 흐린 스캔은 한 번에 안 된다', () => {
  const rev = 스캔회차();
  assert.equal(CB.canOcr(rev, 'after').again, false);
  Object.assign(rev.docs.after, CB.ocrMark('가'.repeat(100)));
  const r = CB.canOcr(rev, 'after');
  assert.equal(r.ok, true, '★ 한 번 읽으면 다시 읽을 길이 막혔습니다');
  assert.equal(r.again, true, '★ 「다시」인지 「처음」인지 화면이 못 가립니다');
});

/* ══════ 쓰레기를 안 담는다 ═════════════════════════════════════════ */

test('★★ 글이라 할 만한 것이 없으면 «안 담는다» — 검색이 더러워지는 것은 안 걸리는 것보다 나쁘다', () => {
  /* 검사고정-허용: 한글 40자가 «규칙»이다. 스캔 잡티는 「| ! \' ,」 같은 것을 수천 개
     만들어 내므로 «길이»로 재면 통과한다 — 재는 것은 한글 글자 수여야 한다. */
  assert.equal(CB.OCR_MIN_KO, 40);

  assert.equal(CB.ocrWorth('').ok, false, '빈 글이 통과했습니다');
  assert.equal(CB.ocrWorth(null).ok, false, '없는 값에서 넘어집니다');
  assert.equal(CB.ocrWorth('가'.repeat(CB.OCR_MIN_KO - 1)).ok, false, '문턱 바로 아래가 통과했습니다');
  assert.equal(CB.ocrWorth('가'.repeat(CB.OCR_MIN_KO)).ok, true, '문턱을 넘었는데 막혔습니다');
});

test('★★ 잡티 수천 자는 «길이»로는 통과하지만 막혀야 한다', () => {
  const 잡티 = "|!',.-_ ".repeat(2000);        /* 16,000자인데 한글은 0자 */
  assert.ok(잡티.length > 10000);
  assert.equal(CB.ocrWorth(잡티).ok, false,
    '★ 글자 수로 재고 있습니다 — 도장만 있는 장의 잡티가 그대로 검색에 들어갑니다');
});

test('안 담은 까닭에 «몇 자였는지»와 «다음에 무엇을 할지»가 있다', () => {
  const r = CB.ocrWorth('가나다');
  assert.equal(r.ko, 3, '몇 자인지를 안 세었습니다');
  assert.match(r.why, /3/, '★ 몇 자였는지를 안 말합니다 — 아깝게 놓친 건지 알 수 없습니다');
  assert.match(r.why, /도장|손글씨|흐릴/, '★ 왜 이런 일이 생기는지를 안 말합니다');
});

/* ══════ 담는 모양 ═════════════════════════════════════════════════ */

test('★ 담는 줄에 «어느 층에서 온 글인지»가 박혀 있다', () => {
  const row = CB.ocrRow('가나다', { uid: 'u9', by: '홍길동', pages: 3, engine: 'tesseract.js kor+eng' });
  assert.equal(row.kind, 'ocr',
    '★★ kind 가 없습니다 — 옮기다 섞이면 추정을 원문으로 읽습니다');
  assert.equal(row.t, '가나다');
  assert.equal(row.ownerUid, 'u9', '누가 읽었는지가 없으면 서버 규칙이 막습니다');
  assert.equal(row.by, '홍길동');
  assert.equal(row.pages, 3);
  assert.ok(row.at, '언제 읽었는지가 없습니다');
});

test('본문 한도는 «한 자리»에서 온다 — 세 곳에 박으면 어긋난다', () => {
  const 넘침 = CB.ocrRow('가'.repeat(CB.TEXT_MAX + 500), { uid: 'u' });
  assert.equal(넘침.t.length, CB.TEXT_MAX, '★ 한도를 넘겨 담습니다 — 서버가 통째로 물립니다');
  assert.equal(CB.ocrMark('가'.repeat(CB.TEXT_MAX + 500)).ocrN, CB.TEXT_MAX,
    '★ 딱지의 글자 수와 실제 담긴 길이가 다릅니다');
});

test('★★ 모듈·서버 규칙·화면이 «같은 한도»를 본다', () => {
  assert.match(HTML, /CB_TEXT_MAX\s*=\s*CB\.TEXT_MAX/,
    '★ 화면이 한도를 다시 박아 두었습니다 — 모듈을 고쳐도 화면은 옛 수를 씁니다');
  /* ⚠ 파일 아무 데나 그 수가 있는 것으로는 모자란다 — «층마다» 따로 봐야 한다.
       원문 층만 맞고 OCR 층이 작으면, 화면은 담고 서버가 그 한 층만 조용히 물린다. */
  const 층 = RULES.rules_mgmt.casebook;
  [['원문', 층.text], ['OCR', 층.ocr]].forEach(([이름, 칸]) => {
    assert.match(칸.$site.$rev.$role.t['.validate'], new RegExp('<=\\s*' + CB.TEXT_MAX + '\\b'),
      '★★ ' + 이름 + ' 층의 본문 한도가 모듈(' + CB.TEXT_MAX + ')과 어긋났습니다'
      + ' — 화면은 담고 서버가 물립니다');
  });
});

test('★★ 화면이 «거른 뒤에» 담는다 — 거르기를 지나쳐 담으면 잡티가 그대로 들어간다', () => {
  const i = HTML.indexOf('const 값=CB.ocrWorth(글)');
  assert.ok(i > 0, '★ 화면이 거르기(ocrWorth)를 아예 안 부릅니다');
  const 담기 = HTML.indexOf('CB.paths.ocr(CB_HIST_KEY,revId,role)).set(', i);
  assert.ok(담기 > i, '★ 거르기보다 «먼저» 담습니다 — 거르는 뜻이 없습니다');
  const 사이 = HTML.slice(i, 담기);
  assert.match(사이, /if\s*\(\s*!값\.ok\s*\)/,
    '★★ 거른 결과를 «보지 않고» 담습니다 — 도장뿐인 장의 잡티가 검색에 들어갑니다');
  assert.match(사이, /return\s*;/,
    '★★ 걸러 놓고 «멈추지 않습니다» — 말만 하고 그대로 담습니다');
});

/* ══════ 검색이 무엇을 읽나 ═════════════════════════════════════════ */

/* 검색 함수 한 덩이 — 「어디를 읽고 무엇을 들고 다니는가」를 이 안에서만 본다.
   ⚠ 파일 전체로 보면 훑기 쪽이 대신 통과시켜 준다(실제로 그렇게 새어 나갔다). */
const CBSEARCH = (() => {
  const i = HTML.indexOf('async function cbSearch(');
  assert.ok(i > 0, 'cbSearch 가 없습니다');
  return HTML.slice(i, HTML.indexOf('function renderArts(', i));
})();

test('★★ 글을 고르는 일은 «한 자리»다 — 각자 고르면 딱지 없는 OCR 이 생긴다', () => {
  assert.deepEqual(CB.pickText({ t: '원문입니다' }, { t: '추정입니다' }),
    { t: '원문입니다', ocr: false }, '★ 원문이 있는데 추정을 골랐습니다');
  assert.deepEqual(CB.pickText({ t: '' }, { t: '추정입니다' }),
    { t: '추정입니다', ocr: true }, '★ 원문이 없는데 추정을 안 씁니다 — 읽은 뜻이 없어집니다');
  assert.deepEqual(CB.pickText(null, null), { t: '', ocr: false }, '없는 값에서 넘어집니다');
  assert.equal(CB.pickText({ t: '   ' }, { t: '추정' }).ocr, true, '공백뿐인 원문을 글로 셌습니다');
});

test('★★ 화면의 검색·훑기가 «그 한 자리»를 쓴다 — 직접 고르면 딱지를 잊는다', () => {
  const 쓴곳 = (HTML.match(/CB\.pickText\(/g) || []).length;
  assert.ok(쓴곳 >= 2,
    '★ pickText 를 쓰는 곳이 ' + 쓴곳 + '군데입니다 — 검색과 훑기 둘 다 써야 합니다');
});

test('★★ 「검토 시작」에는 OCR 되돌림이 «없다» — 일부러다', () => {
  const i = HTML.indexOf('data-cb-start');
  assert.ok(i > 0);
  const 시작 = HTML.slice(HTML.indexOf('[data-cb-start]', i));
  const 몸 = 시작.slice(0, 2500);
  assert.ok(/CB\.paths\.text\(/.test(몸), '검토 시작이 본문을 안 읽습니다');
  assert.ok(!/CB\.paths\.ocr\(/.test(몸),
    '★★ 검토 시작이 OCR 층으로 되돌아갑니다 — 추정 글이 개정 문안의 밑감이 됩니다');
});

test('★★ 검색이 «실제로» OCR 층을 읽는다 — 안 읽으면 읽어낸 글이 영영 안 걸린다', () => {
  assert.match(CBSEARCH, /CB\.paths\.ocr\(/,
    '★★ 검색이 OCR 층을 안 봅니다 — 10분 걸려 읽어도 검색에 안 걸립니다'
    + '(대표 결정 2026-09-07 「읽혀 검색에 걸리게」가 그대로 무너집니다)');
});

test('★★ 검색 줄이 «어디서 온 글인지»를 들고 다닌다 — 안 들면 그릴 때 딱지를 못 붙인다', () => {
  assert.match(CBSEARCH, /out\.push\(\{[^}]*\bocr\s*:/,
    '★★ 걸린 줄에 OCR 여부가 안 실립니다 — 그릴 때 원문과 못 가립니다');
  assert.match(CBSEARCH, /ocr\s*:\s*고른\.ocr/,
    '★ 고른 결과가 아니라 딴 값을 싣고 있습니다 — 늘 원문으로 보이거나 늘 추정으로 보입니다');
});

test('★★ 검색 결과에 «어디서 온 글인지» 딱지가 붙는다', () => {
  assert.match(HTML, /h\.ocr\s*\?/, '★ 검색 줄이 OCR 인지 아닌지를 안 가립니다');
  /* 딱지 글월이 실제로 그려지는가 — 「OCR」만으로는 주석에도 있으니 화면 글월로 본다 */
  assert.match(HTML, /🗄 서고 \$\{escapeH\(String\(h\.rec\.savedAt\|\|""\)\)\}\s*· OCR 추정/,
    '★★ 딱지 없이 한 목록에 섞였습니다 — 추정 조문이 원문으로 읽힙니다');
});

/* ══════ 색인 ══════════════════════════════════════════════════════ */

test('★ 색인은 «개정본만» — 옛 문구가 검색에 섞이면 안 된다', () => {
  const 글 = ('연차유급휴가 사용촉진 '.repeat(5));
  assert.ok(CB.idxKeysOf('after', 글).length > 0);
  assert.deepEqual(CB.idxKeysOf('before', 글), [], '★ 개정 «전» 문구가 색인에 들어갑니다');
  assert.deepEqual(CB.idxKeysOf('daejo', 글), []);
});

/* ══════ 밖으로 안 내보낸다 ════════════════════════════════════════ */

test('★★★ 읽는 일이 «이 브라우저 안»에서 끝난다 — 서고에는 근로자 이름·서명이 섞인다', () => {
  const i = HTML.indexOf('async function cbOcrRun');
  const 몸 = HTML.slice(i, i + 6000);
  assert.ok(!/readDoc|ocrExtract|vision/i.test(몸),
    '★★★ OCR 길이 서버 판독(readDoc·Vision)을 부릅니다 — 남의 이름이 밖으로 나갑니다');
  /* 읽개는 wasm 이라 창 안에서 돈다. 그 사실을 «누르기 전에» 사람에게도 말하는가.
     ⚠ 파일 아무 데나 그 말이 있는 것으로는 모자란다 — 묻는 창 «안»에 있어야 한다. */
  const 묻는곳 = 몸.slice(몸.indexOf('confirm('), 몸.indexOf('))return;'));
  assert.ok(묻는곳.length > 0, '묻지 않고 바로 읽습니다');
  assert.match(묻는곳, /브라우저 안에서만/,
    '★★ 묻는 창이 「밖으로 안 나간다」를 안 말합니다 — 근로자 이름·서명이 있는 서류라 그 말이 필요합니다');
  assert.match(묻는곳, /안 보냅니다|안 나갑니다/,
    '★ 「어디로 안 보내는지」를 안 말합니다');
});

test('★ 처음 한 번 받는 15MB 를 «미리» 말한다 — 안 하면 멈춘 줄 알고 창을 닫는다', () => {
  assert.match(HTML, /15MB/, '★ 사전 내려받기를 안 알립니다');
  assert.match(HTML, /처음 한 번[만]?/, '★ 「매번 받나」를 알 수 없습니다');
});

test('★★ 읽개를 못 받으면 «기억을 지운다» — 안 지우면 다시 눌러도 영영 안 된다', () => {
  const i = HTML.indexOf('function loadOcrLib(');
  assert.ok(i > 0, 'loadOcrLib 이 없습니다');
  const 몸 = HTML.slice(i, i + 1200);
  const 지움 = (몸.match(/ocrLibP\s*=\s*null/g) || []).length;
  assert.ok(지움 >= 2,
    '★★ 실패를 기억한 채로 둡니다(' + 지움 + '군데만 지움) — 인터넷이 돌아와도 다시 안 됩니다');
});

test('★ 쪽 수에 한도가 있다 — 100쪽을 통째로 걸면 30분을 앉아 기다린다', () => {
  assert.match(HTML, /OCR_MAX_PAGES\s*=\s*\d+/, '쪽 한도가 없습니다');
  assert.match(HTML, /Math\.min\(doc\.numPages\s*,\s*OCR_MAX_PAGES\)/,
    '★ 한도를 정해 놓고 안 씁니다');
  /* 잘라 냈으면 «잘랐다»고 말해야 한다 — 안 말하면 다 읽은 줄 안다.
     ⚠ 「만드는 쪽」과 「쓰는 쪽」을 «둘 다» 본다. 한쪽만 보면 이름이 어긋나도 통과하고,
       그러면 값이 늘 undefined 라 안내가 «영영 안 뜬다»(조용히 없는 기능이 된다). */
  /* ⚠ 돌려주는 자리가 «둘»이다(그림 한 장 · PDF 여러 쪽). 하나만 보면 다른 쪽에서
       이름이 어긋나도 통과한다 — 정작 잘리는 것은 PDF 쪽인데 그게 조용히 빠진다. */
  assert.ok((HTML.match(/잘림\s*:/g) || []).length >= 2,
    '★★ 몇 쪽을 못 읽었는지 «세는 자리»가 빠졌습니다 — 그림 쪽과 PDF 쪽 둘 다 세야 합니다');
  assert.match(HTML, /쪽\.잘림/, '★ 세어 놓고 «말하지» 않습니다 — 다 읽은 줄 압니다');
});

/* ══════ 서버 규칙 ═════════════════════════════════════════════════ */

const RULES = JSON.parse(
  require('child_process').execFileSync('node',
    [path.join(ROOT, 'scripts', 'make-firebase-rules.js')], { encoding: 'utf8' })).rules;

test('★ OCR 층이 서버에 «따로» 나 있다', () => {
  const cb = RULES.rules_mgmt.casebook;
  assert.ok(cb.ocr, '★ OCR 층에 규칙이 없습니다 — 담기지 않습니다');
  assert.ok(cb.text, '원문 층이 사라졌습니다');
  assert.notEqual(cb.ocr, cb.text);
});

test('★★ 서버가 «누가 읽었는지»를 못 박는다 — 남의 이름으로 추정을 앉힐 수 없다', () => {
  const r = RULES.rules_mgmt.casebook.ocr.$site.$rev.$role;
  assert.match(r.ownerUid['.validate'], /auth\.uid/,
    '★ 아무 이름이나 적을 수 있습니다');
  assert.match(r['.validate'], /ownerUid/, '임자 없이 담깁니다');
  assert.match(r['.validate'], /kind/, '★★ 어느 층에서 온 글인지 없이 담깁니다');
  assert.match(r.kind['.validate'], /'ocr'/, '★ kind 에 아무 값이나 들어갑니다');
});

test('★ 모르는 칸은 서버가 막는다 — 아무거나 쌓이면 층이 무너진다', () => {
  const r = RULES.rules_mgmt.casebook.ocr.$site.$rev.$role;
  assert.equal(r.$other['.validate'], false, '★ 모르는 칸이 그냥 들어옵니다');
});

test('★★ 딱지 세 칸만 열렸다 — 이름·해시·원본 자리는 여전히 임자만', () => {
  const d = RULES.rules_mgmt.casebook.rev.$site.$rev.docs.$role;
  ['ocr', 'ocrN', 'ocrAt'].forEach((k) => {
    assert.ok(d[k], '★ ' + k + ' 칸이 없습니다 — 서버가 딱지를 물립니다');
    assert.ok(d[k]['.write'], '★ ' + k + ' 를 임자만 쓸 수 있습니다 — 퇴사한 담당자의 회차는 영영 못 읽습니다');
  });
  ['name', 'sha', 'path'].forEach((k) => {
    assert.ok(!d[k]['.write'],
      '★★ ' + k + ' 이 누구나 쓸 수 있게 열렸습니다 — 딱지 셋만 넓히기로 한 것입니다');
  });
});

test('★ noText 는 넓히지 않았다 — 열면 남이 「검토 시작」을 열 수 있다', () => {
  const d = RULES.rules_mgmt.casebook.rev.$site.$rev.docs.$role;
  assert.ok(!d.noText['.write'],
    '★★ noText 가 누구나 쓸 수 있게 열렸습니다 — 지우면 추정 글로 검토가 열립니다');
});
