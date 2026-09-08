/* ⑦ «우리 것» 서식은 기업정보함으로 안 보낸다 — 대표 지시 2026-09-08
 *
 *   「캡쳐3은 기업정보함으로 보내는게 아니라 경력관리와 연결되어 있다.
 *     위촉장등은 보내기 필요 없다」
 *
 * ★★ 무엇이 잘못됐었나 — 2026-08-31 에 「서식·신청서도 기업정보함으로 보낸다」로
 *   정했는데, 상정한 것은 «거래처가 보낸 신청서»였다. 그런데 위촉장은 소속이
 *   푸른노무법인이고 성명이 우리 노무사다 — 보내면 거래처 명부(기업정보함)에 «우리 사람»이
 *   들어가고, 기업 상세로는 «우리 법인이 거래처»가 된다.
 *   위촉장의 집은 경력관리(「📋 위촉장」 — 만료 임박 알림까지 거기 있다)다.
 *
 * ⚠⚠ 이 검사가 가장 신경 쓰는 것은 «잘못 막는 것»이다. 거래처에 「푸른○○」이
 *   있으면(푸른물산·푸른산업 …) 그것까지 막으면 멀쩡한 거래처 서식이 안 보내진다.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { stripComments } = require('./strip-comments.js');
const { cutFn } = require('./cut-fn.js');

const ROOT = path.join(__dirname, '..');
/* ⚠ pu-doc-read.js 는 «브라우저 부품»이다 — module.exports 가 없고 global 에 붙는다.
     그래서 require 는 빈 것을 돌려준다(그렇게 한 번 걸렸다). 부른 뒤 global 에서 꺼낸다. */
require(path.join(ROOT, 'js', 'pu-doc-read.js'));
const DR = globalThis.PuDocRead;
assert.ok(DR && typeof DR.isOurs === 'function',
  '★ 판독 부품이 안 실렸거나 isOurs 를 안 내보냅니다');
const RAW = fs.readFileSync(path.join(ROOT, 'pu-photos.html'), 'utf8');
const APP = stripComments(RAW);

/* ══════ 우리 것을 알아본다 ═══════════════════════════════════════ */

test('★★★ 소속이 우리 법인이면 «우리 것»이다 — 위촉장이 바로 그 모양이다', () => {
  /* 대표님이 보내 주신 위촉장 그대로: 소속 푸른노무법인 · 성명 권형하 */
  assert.equal(DR.isOurs({ pairs: [{ k: '소 속', v: '푸른노무법인' }, { k: '성 명', v: '권형하' }] }), true,
    '★★★ 위촉장을 못 알아봅니다 — 거래처 명부(기업정보함)에 우리 사람이 들어갑니다');
  assert.equal(DR.isOurs({ company: '푸른노무법인' }), true, '★ 회사 칸으로도 알아봐야 합니다');
  assert.equal(DR.isOurs({ pairs: [{ k: '소속', v: '푸른이알피' }] }), true, '★ 푸른이알피도 우리입니다');
});

test('★★ 「주식회사·(주)·㈜·띄어쓰기」가 붙어도 알아본다 — 서식마다 적는 법이 다르다', () => {
  ['푸른노무법인', '푸른 노무법인', '(주)푸른노무법인', '㈜푸른노무법인',
   '주식회사 푸른노무법인', ' 푸른노무법인 '].forEach(function (v) {
    assert.equal(DR.isOurs({ company: v }), true, '★ 못 알아봅니다: 「' + v + '」');
  });
});

test('★★★ 「푸른○○」 거래처를 «잘못 막지» 않는다 — 이것이 이 검사의 주제다', () => {
  /* ⚠ 「푸른」 한 낱말로 가리면 멀쩡한 거래처 서식이 통째로 안 보내진다.
       잘못 막는 것은 조용히 일이 안 되는 것이라, 잘못 보내는 것보다 찾기 어렵다. */
  ['푸른물산', '푸른산업', '㈜푸른', '푸른테크', '푸른건설', '푸른상사',
   '푸른유통', '푸른전자'].forEach(function (v) {
    assert.equal(DR.isOurs({ company: v }), false,
      '★★★ 거래처를 우리 것으로 봤습니다: 「' + v + '」 — 그 업체 서식이 안 보내집니다');
  });
});

test('★ 아무 칸이나 보지 않는다 — 「대표자」에 우리 이름이 있어도 회사가 아니다', () => {
  /* 자문계약서에는 «우리 법인»이 상대 칸이 아닌 곳에 적힌다 — 그것으로 막으면
     정작 보내야 할 거래처 계약서가 막힌다. */
  assert.equal(DR.isOurs({ pairs: [{ k: '수임인', v: '푸른노무법인' }] }), false,
    '★ 「수임인」 칸을 보고 우리 것이라 했습니다 — 거래처 계약서가 막힙니다');
  assert.equal(DR.isOurs({ pairs: [{ k: '수납기관', v: '푸른노무법인' }] }), false,
    '★★ CMS 신청서의 수납기관은 «늘 우리»입니다 — 그것으로 막으면 거래처 신청서가 통째로 막힙니다');
});

test('빈 값·없는 값에서 넘어지지 않는다', () => {
  assert.equal(DR.isOurs(null), false);
  assert.equal(DR.isOurs({}), false);
  assert.equal(DR.isOurs({ company: '' }), false);
  assert.equal(DR.isOurs({ company: '   ' }), false, '공백만 있는 값을 우리 것으로 봤습니다');
  assert.equal(DR.isOurs({ pairs: 'x' }), false, 'pairs 가 배열이 아닐 때 넘어집니다');
  assert.equal(DR.isOurs({ pairs: [null, { k: '소속' }] }), false, 'pairs 에 빈 줄이 있을 때 넘어집니다');
});

test('★ 판정이 «한 곳»에 있다 — 화면마다 적으면 한 곳은 반드시 빠진다', () => {
  assert.ok(typeof DR.isOurs === 'function', '★ 공용 층에 판정이 없습니다');
  assert.ok(Array.isArray(DR.OUR_NAMES) && DR.OUR_NAMES.length >= 2, '우리 이름 목록이 없습니다');
  /* 화면이 이름을 «따로» 들고 있으면 안 된다 — 늘 때 한쪽만 고쳐진다 */
  assert.ok(!/OUR_NAMES\s*=/.test(APP),
    '★★ 화면이 우리 이름 목록을 스스로 들고 있습니다 — 공용 층 것을 받아 쓰세요');
});

/* ══════ 세 갈래 «모두» 막는다 ═══════════════════════════════════ */

test('★★★ 기업정보함·기업 상세·업체관리 «셋 다» 막는다 — 한 곳만 막으면 딴 길로 간다', () => {
  [['canSend', '기업정보함'], ['canSendCoInfo', '기업 상세'], ['canSendCo', '업체관리']]
    .forEach(function ([fn, 어디]) {
      const body = stripComments(cutFn(RAW, 'function ' + fn + '('));
      assert.ok(body, fn + ' 이 없습니다');
      assert.match(body, /isOursRead\(read\)/,
        '★★★ ' + 어디 + ' 로 가는 길이 안 막혔습니다 — 우리 법인이 거래처 자료가 됩니다');
    });
});

test('★★ 사람이 «고친 값»까지 본다 — 적으라고 해 놓고 안 받으면 안 된다', () => {
  const body = stripComments(cutFn(RAW, 'function isOursRead('));
  assert.ok(body, 'isOursRead 가 없습니다');
  assert.match(body, /readFields\(read\)/,
    '★★ 판독값만 봅니다 — 소속을 잘못 읽어 사람이 고쳐 놓아도 안 듣습니다');
  assert.match(body, /PuDocRead\.isOurs/, '★ 공용 판정을 안 씁니다');
  /* 판독기가 아직 안 실렸을 수도 있다 — 그때 화면이 죽으면 안 된다 */
  assert.match(body, /catch/, '★★ 판독기가 없을 때 화면이 통째로 죽습니다');
});

/* ══════ 왜 단추가 없는지 «말한다» ═══════════════════════════════ */

test('★★★ 단추를 그냥 없애지 않고 «까닭»을 적는다 — 안 적으면 화면을 안 믿게 된다', () => {
  assert.match(APP, /이 서류는 우리 것입니다/,
    '★★★ 단추만 사라졌습니다 — 다음 사람이 「왜 여기만 단추가 없지」를 한참 찾습니다\n'
    + '  (이 저장소가 여러 번 밟은 자리입니다)');
  assert.match(APP, /isOursRead\(read\)\) \{/, '★ 그 안내를 그리는 갈래가 없습니다');
  /* ⚠ 「경력관리 라는 글자가 파일에 있나」로는 모자랐다 — 판독 띠에도 그 낱말이 있어
       안내에서 지워도 통과했다(되돌림에서 드러났다). «그 안내 안»을 본다. */
  const i = APP.indexOf('이 서류는 우리 것입니다');
  const 안내 = APP.slice(i, i + 500);
  assert.match(안내, /경력관리/,
    '★★ «어디서 쓰는지»를 안 말합니다 — 「그럼 이 서류는 어디로?」가 남습니다');
  assert.match(안내, /위촉장/, '★ 무슨 서류를 말하는지 안 적었습니다');
});

test('★ 막는 것은 «보내기»뿐이다 — 판독·복사·보관은 그대로', () => {
  /* ⚠ 「우리 것」이라고 판독까지 막으면 위촉기간·기관을 읽어 둘 수 없다.
       경력관리가 그 값을 쓰므로 읽는 것은 그대로 되어야 한다. */
  const wait = stripComments(cutFn(RAW, 'function readWaitOf('));
  assert.ok(!/isOurs/.test(wait), '★★ 우리 것이라고 판독까지 막았습니다 — 경력관리가 쓸 값이 안 읽힙니다');
  const skip = stripComments(cutFn(RAW, 'function readSkipWhy('));
  assert.ok(!/isOurs/.test(skip), '★★ 판독 문지기에 넣었습니다 — 읽지도 않게 됩니다');
});

test('★★★ 판정 함수가 «실제로 있다» — typeof 로 감쌌으니 사라지면 조용히 통과한다', () => {
  /* ⚠⚠ 문지기가 `typeof isOursRead === 'function'` 으로 감싸져 있다(검사가 함수를
       낱개로 떼어 돌릴 때 터지지 않게). 그 대신 «함수가 사라지면 조용히 지나간다» —
       그 구멍을 여기서 막는다. 이것이 없으면 안전장치가 스스로 꺼진다. */
  assert.match(APP, /function isOursRead\(/,
    '★★★ 판정 함수가 사라졌습니다 — 문지기가 typeof 로 감싸져 있어 «조용히» 지나갑니다.\n'
    + '  위촉장이 다시 거래처 명부(기업정보함)으로 갑니다.');
  /* 그리고 그 함수가 공용 판정을 실제로 부르는지 */
  const body = stripComments(cutFn(RAW, 'function isOursRead('));
  assert.match(body, /PuDocRead\.isOurs/, '★★ 껍데기만 남고 판정을 안 부릅니다');
});
