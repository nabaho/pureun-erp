'use strict';
/* 찾기 칸에서 한글이 깨지지 않는다
   ═══════════════════════════════════════════════════════════════════════════
   대표 화면 2026-08-24: 「내 서명 명함」에서 「권」을 치니 칸에 «ㄱㅜㅓㄴ» 이 남고
   「찾은 명함이 없습니다」가 떴다. 명함 문제가 아니라 «한글 입력이 깨진 것»이다.

   ■ 까닭
     한글은 자모 여러 번이 모여 한 글자가 된다(조합, composition).
     그 도중에 화면을 다시 그리면 입력 칸이 새 것으로 바뀌면서 조합 버퍼가 끊긴다 —
     그래서 완성되지 못한 자모가 그대로 글자로 남는다.
     찾기 칸 다섯 곳이 모두 «글자 하나마다» 화면을 다시 그리고 있었다.

   ■ 어떻게 고쳤나
     ① 내 서명·주소록(팝업) — 입력 칸은 «그대로 두고» 결과 목록만 새로 그린다.
        입력 칸이 살아 있으므로 조합이 끊기지 않고, 치는 동안 결과가 바로 바뀐다.
     ② 자료 찾기·보낸/받은 메일 찾기(화면 전체를 그리는 것) — 조합 중에는 안 그리고,
        조합이 끝나면 그린다. 자모가 흩어지는 일이 없어진다.

   ★ 여기서 못 박는 것
     ① 팝업 찾기 칸은 화면을 다시 그리지 않는다 (목록만 바꾼다)
     ② 화면 전체를 그리는 찾기 칸은 «조합 중»에는 안 그린다
     ③ 조합이 끝나면 반드시 그린다 — 안 그리면 친 글자로 찾지 못한다
   실행: node --test tests/cards-search-ime.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8').replace(/\r\n/g, '\n');

function fnBody(name){
  let i = src.indexOf('\nfunction ' + name + '(');
  assert.ok(i >= 0, name + ' 를 찾을 수 없습니다');
  const open = src.indexOf('{', i);
  let d = 0;
  for (let k = open; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); }
  }
  assert.fail(name + ' 의 끝을 찾을 수 없습니다');
}
/* 화면에 실제로 걸린 oninput 들을 모은다 */
function inputs(){
  return (src.match(/oninput="[^"]*"/g) || []);
}

/* ══════ ① 팝업은 화면을 다시 그리지 않는다 ══════ */

test('★ 내 서명 찾기 칸이 팝업을 다시 그리지 않는다', () => {
  const fn = fnBody('mySignHtml');
  const m = fn.match(/id="msQ"[\s\S]{0,320}?oninput="([^"]*)"/);
  assert.ok(m, '내 서명 찾기 칸을 찾지 못했습니다');
  assert.equal(/showPanel\(/.test(m[1]), false,
    '★ 글자마다 팝업을 다시 그리면 한글 조합이 끊겨 「ㄱㅜㅓㄴ」이 된다: ' + m[1]);
  assert.match(m[1], /msType\(/, '목록만 바꾸는 길을 안 쓴다');
});

test('★ 주소록 찾기 칸도 팝업을 다시 그리지 않는다', () => {
  const fn = fnBody('addrBookHtml');
  const m = fn.match(/id="abQ"[\s\S]{0,320}?oninput="([^"]*)"/);
  assert.ok(m, '주소록 찾기 칸을 찾지 못했습니다');
  assert.equal(/showPanel\(/.test(m[1]), false,
    '★ 글자마다 팝업을 다시 그리면 한글 조합이 끊긴다: ' + m[1]);
  assert.match(m[1], /abType\(/, '목록만 바꾸는 길을 안 쓴다');
});

test('목록만 바꾸는 길이 «입력 칸을 건드리지 않는다»', () => {
  for (const [n, listId] of [['msType', 'msList'], ['abType', 'abList']]) {
    const fn = fnBody(n);
    assert.ok(fn.indexOf(listId) > 0, n + ' 이 목록 칸(' + listId + ')을 안 바꾼다');
    assert.equal(/showPanel\(/.test(fn), false,
      '★ ' + n + ' 이 팝업을 통째로 다시 그린다 — 조합이 끊긴다');
    assert.equal(/\.focus\(\)/.test(fn), false,
      '★ ' + n + ' 이 초점을 다시 잡는다 — 안 건드렸으면 그럴 일이 없다');
  }
});

test('바꿀 목록 칸이 화면에 실제로 있다', () => {
  assert.match(fnBody('mySignHtml'), /id="msList"/, '내 서명 목록 칸이 없다');
  assert.match(fnBody('addrBookHtml'), /id="abList"/, '주소록 목록 칸이 없다');
});

test('고르기(☑)는 목록과 단추를 함께 새로 그린다', () => {
  /* 고르면 ☑ 도 바뀌고 아래 「고른 N명 넣기」도 바뀐다 — 한쪽만 바꾸면 숫자가 어긋난다 */
  const fn = fnBody('abToggle');
  assert.ok(fn.indexOf('abList') > 0 || fn.indexOf('showPanel') > 0, '목록을 안 바꾼다');
  assert.ok(fn.indexOf('abAdd') > 0 || fn.indexOf('showPanel') > 0,
    '고른 개수를 보여 주는 단추를 안 바꾼다');
});

/* ══════ ② · ③ 화면 전체를 그리는 것은 조합 중에 안 그린다 ══════ */

test('★ 화면을 다시 그리는 찾기 칸은 모두 조합 중을 피한다', () => {
  const bad = [];
  for (const h of inputs()) {
    if (!/renderMailPage\(\)|showPanel\(/.test(h)) continue;       // 그리지 않는 것은 안전
    if (/isComposing/.test(h)) continue;                           // 조합 중을 피한다
    bad.push(h.slice(0, 90));
  }
  assert.deepEqual(bad, [],
    '★ 조합 중에 화면을 그리면 한글이 「ㄱㅜㅓㄴ」처럼 흩어진다:\n  ' + bad.join('\n  '));
});

test('★ 조합이 끝나면 반드시 다시 그린다 — 안 그리면 친 글자로 못 찾는다', () => {
  const guarded = inputs().filter(h => /isComposing/.test(h)).length;
  const ends = (src.match(/oncompositionend="[^"]*"/g) || []).length;
  assert.ok(guarded > 0, '조합 중을 피하는 칸이 하나도 없다');
  assert.ok(ends >= guarded,
    '★ 조합 중을 피하는 칸이 ' + guarded + '곳인데 조합 끝 손잡이는 ' + ends
    + '곳뿐이다 — 모자란 칸은 글자를 쳐도 아무 일이 안 난다');
});

test('조합 끝 손잡이도 같은 일을 한다', () => {
  for (const h of (src.match(/oncompositionend="[^"]*"/g) || [])) {
    assert.match(h, /renderMailPage\(\)|showPanel\(|Type\(/,
      '조합이 끝났는데 찾기를 안 한다: ' + h);
  }
});
