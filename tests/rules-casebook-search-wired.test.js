'use strict';
/* 서고 4단계 배선 — 화면이 정말 그렇게 이어져 있는가 (설계서 §5-③)

   순수 판정은 tests/rules-casebook-search.test.js 가 본다. 여기는 «배선»이다.
   배선이 어긋나면 순수 함수가 아무리 맞아도 화면에서는 아무 일도 안 일어난다.

   실행: node --test tests/rules-casebook-search-wired.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

/* ⚠ 줄끝을 고른다 — 윈도우 CRLF 에서 「글자 뒤 \n」 정규식이 안 맞는다 */
const src = fs.readFileSync(path.join(__dirname, '..', 'rules.html'), 'utf8').replace(/\r\n/g, '\n');

function fn(name) {
  const marker = 'function ' + name + '(';
  let start = src.indexOf(marker);
  if (start < 0) throw new Error('함수 못찾음: ' + name);
  if (src.slice(start - 6, start) === 'async ') start -= 6;
  let pd = 0, pEnd = -1;
  for (let i = start + marker.length - 1; i < src.length; i++) {
    if (src[i] === '(') pd++;
    else if (src[i] === ')') { pd--; if (pd === 0) { pEnd = i; break; } }
  }
  const bodyStart = src.indexOf('{', pEnd + 1);
  let d = 0;
  for (let i = bodyStart; i < src.length; i++) {
    if (src[i] === '{') d++;
    else if (src[i] === '}') { d--; if (d === 0) return src.slice(start, i + 1); }
  }
  throw new Error('함수 끝 못찾음: ' + name);
}

/* ── ⓐ 검색 ── */

test('★ 서고 검색 함수가 순수 판정을 «그대로» 쓴다 — 화면에 셈을 다시 짜지 않는다', () => {
  const f = fn('cbSearch');
  ['idxLookups', 'idxRefs', 'searchCaveat'].forEach((n) =>
    assert.ok(f.indexOf('CB.' + n + '(') >= 0, 'CB.' + n + ' 을 안 씁니다'));
});

test('★★ 색인을 «두 방향»으로 읽는다 — 한 방향만 하면 「되는 것 같은데 안 나온다」', () => {
  const f = fn('cbSearch');
  assert.match(f, /orderByKey\(\)[\s\S]{0,80}startAt\([\s\S]{0,20}prefix/,
    '앞머리 훑기가 없습니다 — 「연차」로 「연차유급휴가」를 못 찾습니다');
  assert.match(f, /lk\.exact\.map|exact\.forEach|of lk\.exact/,
    '앞토막 정확히 찾기가 없습니다 — 「연차유급휴가」로 「연차」를 못 찾습니다');
});

test('★★ 본문은 «후보만» 읽는다 — 전부 읽으면 지금(artsBuild)과 같아진다', () => {
  const f = fn('cbSearch');
  const 본문읽기 = (f.match(/paths\.text\(/g) || []).length;
  assert.equal(본문읽기, 1, '본문을 읽는 자리가 ' + 본문읽기 + '곳입니다 — 한 곳이어야 합니다');
  assert.match(f, /all\.map\(|for\s*\(\s*const\s+r\s+of\s+all/,
    '후보 목록(all)을 돌며 읽어야 합니다');
  assert.ok(!/paths\.revs\(|paths\.index\(/.test(f),
    '검색이 목록·회차 층을 통째로 읽으면 서고를 여는 값이 사라집니다');
});

test('★★ 판정은 «본문»이 한다 — 색인은 좁히는 도구일 뿐이다', () => {
  const f = fn('cbSearch');
  /* 보관함 검색(artsSearch)과 똑같은 셈이어야 한다 */
  assert.match(f, /stripWs\(a\.title\)\s*\+\s*a\.bodyNs/,
    '보관함과 다른 방식으로 맞추면 같은 검색어에 결과가 갈립니다');
  assert.match(fn('artsSearch'), /stripWs\(a\.title\)\s*\+\s*a\.bodyNs/,
    '보관함 쪽 셈이 바뀌었습니다 — 서고 쪽도 함께 고쳐야 합니다');
});

test('★ 한 번 읽은 본문은 다시 안 읽는다', () => {
  assert.match(fn('cbSearch'), /CB_SEARCH_CACHE\[/, '캐시가 없으면 글자마다 다시 읽습니다');
});

test('★★ 글자마다 Firebase 를 읽지 않는다 — 모아서 한 번', () => {
  const at = src.indexOf('$("arts-q").addEventListener');
  assert.ok(at >= 0, '검색어 입력 배선을 찾지 못했습니다');
  const seg = src.slice(at, at + 700);
  assert.match(seg, /setTimeout/, '모아 두는 장치가 없습니다');
  assert.match(seg, /clearTimeout/, '앞의 것을 취소하지 않으면 여러 번 나갑니다');
  assert.match(seg, /CB_SEARCH_LAST/, '같은 검색어로 두 번 읽습니다');
  assert.match(seg, /renderArts\(\)/, '보관함 쪽은 즉시 다시 그려야 손맛이 남습니다');
});

test('★ 늦게 온 답이 «지금 검색어»를 덮지 않는다', () => {
  const at = src.indexOf('$("arts-q").addEventListener');
  assert.match(src.slice(at, at + 700), /value\.trim\(\)\s*===\s*q/,
    '그 사이 더 쳤으면 버려야 합니다 — 안 그러면 옛 결과가 뒤늦게 화면을 덮습니다');
});

/* ── 한 목록에 섞기 (대표 결정) ── */

test('★★ 보관함과 서고를 한 목록에 섞는다', () => {
  const r = fn('renderArts');
  assert.match(r, /concat\(CB_SEARCH_ROWS\)/, '서고 결과가 목록에 안 섞입니다');
  assert.match(r, /localeCompare[\s\S]{0,40}a\.num/, '섞은 뒤 사업장·조문번호로 줄세워야 합니다');
});

test('★★ 어디서 왔는지 «딱지»로 가른다 — 권한이 다르다(서고는 직원 전체)', () => {
  assert.match(fn('renderArts'), /src===\s*"cb"[\s\S]{0,120}cbtag/, '서고 딱지가 없습니다');
  assert.match(src, /\.cbtag\{/, '딱지 모양을 정한 곳이 없습니다');
});

test('★★ 색인의 한계를 «늘» 적는다 — 안 적으면 「검색했는데 없네」로 읽힌다', () => {
  assert.match(fn('renderArts'), /CB_SEARCH_NOTE/,
    '한계 문장을 화면에 안 내놓습니다');
});

test('보관함 쪽 검색은 그대로다 — 서고를 붙였다고 기존 동작을 바꾼 것이 아니다', () => {
  assert.match(src, /function artsBuild\(/);
  assert.match(src, /보관된 원문이 없어/);
  assert.match(fn('renderArts'), /artsSearch\(q\)/);
});

/* ── ⓑ 문안 은행 적립 ── */

test('★★ 올릴 때 문안 은행에 흘려보낸다 — 이미 있는 길을 그대로 탄다', () => {
  const at = src.indexOf('문안 은행 적립');
  assert.ok(at >= 0, '적립하는 자리가 없습니다');
  const seg = src.slice(at, at + 1200);
  assert.match(seg, /bankAccum\(/, '적립 셈을 새로 만들지 말고 bankAccum 을 쓰세요');
  assert.match(seg, /bankMergeUpload\(/, '올리는 길도 이미 있는 것을 쓰세요');
  assert.match(seg, /bankStale\(/, '「개정 전 문구 의심」 표시를 함께 달아야 합니다');
});

test('★★ 개정본(after)만 적립한다 — before 가 섞이면 다음 사람이 옛 문구를 복사한다', () => {
  const at = src.indexOf('문안 은행 적립');
  const seg = src.slice(at, at + 1200);
  assert.match(seg, /if\(after&&/, 'after 가 있을 때만 적립해야 합니다');
  assert.match(seg, /after\.text/, 'after 의 글을 넣어야 합니다');
  assert.ok(!/before\.text|d\.role==="before"/.test(seg),
    'before 를 은행에 넣고 있습니다');
});

test('★★ 적립이 실패해도 올리기는 계속된다 — 은행이 서고를 막으면 안 된다', () => {
  /* ⚠ 창을 «적립 대목까지»로 좁힌다. 넉넉히 잡으면 바로 뒤의 «바깥 catch»(올리기 실패를
     fails 에 넣는 그 자리)까지 들어와, 멀쩡한 코드를 틀렸다고 한다 — 실제로 그랬다. */
  const at = src.indexOf('문안 은행 적립');
  const end = src.indexOf('done++;', at);
  assert.ok(end > at, '적립 대목 뒤의 done++ 를 찾지 못했습니다');
  const seg = src.slice(at, end);
  assert.match(seg, /catch\s*\(\s*e2\s*\)/, '적립을 제 try 로 감싸야 합니다');
  assert.ok(!/fails\.push/.test(seg), '적립 실패를 올리기 실패로 세면 안 됩니다');
  /* 그 «바깥» 은 여전히 올리기 실패를 세고 있어야 한다 — 그쪽을 없앤 것이 아니다 */
  assert.match(src.slice(end, end + 300), /fails\.push/,
    '올리기 실패를 세는 자리가 사라졌습니다');
});

test('★ 적립한 것을 사람에게 말한다 — 딴 화면이라 조용히 늘면 확인할 길이 없다', () => {
  assert.match(src, /문안 은행에 조문 \$\{은행\}개 적립/,
    '마무리 알림에 적립 셈이 없습니다');
});
