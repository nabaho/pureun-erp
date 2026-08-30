'use strict';
/* 물어보는 창을 «화면 가운데»로 (대표 지시 2026-08-30 「다음메일처럼 중앙에 만들어줘」)

   ★ 왜 바꿨나 — 브라우저가 주는 confirm() 은 창 «맨 위»에 붙어 뜨고 생김새를 못 만진다.
     굵게 하려고 적은 「**버리고**」의 별표가 그대로 보였다.

   ★ 여기서 못 박는 것
     ① 가운데 창(puAsk)이 있고, 답을 Promise 로 준다
     ② 취소로 «기우는» 창이다 — Esc·바깥 누르기가 모두 취소
        (되돌릴 수 없는 일이 조용히 일어나면 안 된다)
     ③ 카드 «안»을 눌러서는 안 닫힌다 (글을 고르다 닫히면 안 된다)
     ④ 층(z-index)이 자료 보내기 시트보다 «위»다 — 아니면 시트 뒤에 숨는다
     ⑤ 「쓰다 만 메일」 물음이 그 창을 쓴다 — 별표가 그대로 나오던 자리다
     ⑥ 물음이 끝난 «뒤»에 화면을 짓는다 — puAsk 는 confirm 과 달리 JS를 안 멈춘다
     ⑦ 넣는 값은 esc() 를 거친다 — 제목에 <> 가 있으면 창이 깨진다

   ⚠ confirm() 을 «전부» 갈아 끼우지 않았다. 몇 자리는 confirm() 이 JS를 멈춘다는
     성질에 기대어 짜여 있다(소스 주석에 그렇게 적혀 있다). 그 가정을 안 본 채
     바꾸면 조용히 어긋난다 — 검사도 그것을 요구하지 않는다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const raw = fs.readFileSync(path.join(ROOT, 'pu-cards.html'), 'utf8').replace(/\r\n/g, '\n');
/* ⚠ 주석을 걷고 본다 — 잘 쓴 «설명»이 검사를 통과시키면 안 된다 */
const src = raw.replace(/\/\*[\s\S]*?\*\//g, ' ');

function fnBody(name) {
  const i = src.indexOf('\nfunction ' + name + '(');
  assert.ok(i >= 0, name + ' 를 찾을 수 없습니다');
  return src.slice(i, src.indexOf('\n}', i) + 2);
}
function rule(sel) {
  const i = src.indexOf('\n' + sel + '{');
  assert.ok(i > 0, sel + ' 규칙을 찾지 못했습니다');
  return src.slice(i, src.indexOf('}', i) + 1);
}

/* ══════ ① 가운데 창이 있다 ══════ */
test('★★ 가운데에 뜨는 물음 창(puAsk)이 있고, 답을 Promise 로 준다', () => {
  const fn = fnBody('puAsk');
  assert.match(fn, /new Promise\(/, '★ 답을 Promise 로 주지 않습니다 — 부르는 쪽이 못 기다립니다');
  assert.match(fn, /appendChild\(/, '★ 화면에 안 붙입니다');
});

test('★★ 화면 «가운데»에 놓인다 — 이 일의 시작이 「중앙에」였다', () => {
  const r = rule('.puask');
  assert.match(r, /position:\s*fixed/, '★ 화면에 고정되지 않습니다');
  assert.match(r, /align-items:\s*center/, '★ 세로 가운데가 아닙니다');
  assert.match(r, /justify-content:\s*center/, '★ 가로 가운데가 아닙니다');
});

/* ══════ ② 취소로 기운다 ══════ */
test('★★ Esc 는 «취소»다 — 되돌릴 수 없는 일이 조용히 일어나면 안 된다', () => {
  const fn = fnBody('puAsk');
  const i = fn.indexOf('Escape');
  assert.ok(i > 0, '★ Esc 로 못 닫습니다');
  assert.match(fn.slice(i, i + 160), /shut\(false\)/,
    '★ Esc 가 «확인»으로 처리됩니다 — 무심코 누르면 되돌릴 수 없는 일이 일어납니다');
});

test('★★ 바깥 어두운 곳을 눌러도 «취소»다', () => {
  const fn = fnBody('puAsk');
  const i = fn.indexOf('el.onclick');
  assert.ok(i > 0, '★ 바깥을 눌러도 안 닫힙니다');
  assert.match(fn.slice(i, i + 120), /shut\(false\)/, '★ 바깥 누르기가 «확인»이 됩니다');
});

/* ══════ ③ 카드 안은 안 닫힌다 ══════ */
test('★★ 카드 «안»을 눌러서는 안 닫힌다 — 글을 고르다 닫히면 안 된다', () => {
  const fn = fnBody('puAsk');
  const i = fn.indexOf('el.onclick');
  assert.match(fn.slice(i, i + 120), /e\.target\s*===\s*el/,
    '★ 카드 안을 눌러도 닫힙니다 — 받는 곳 주소를 긁다가 닫힙니다');
});

/* ══════ ④ 층 ══════ */
test('★★ 층이 «자료 보내기 시트»보다 위다 — 아니면 시트 뒤에 숨어 안 눌린다', () => {
  const z = (sel) => {
    const m = rule(sel).match(/z-index:\s*(\d+)/);
    assert.ok(m, sel + ' 에 층이 없습니다');
    return Number(m[1]);
  };
  const mine = z('.puask');
  assert.ok(mine > z('.smbg'), '★ 자료 보내기 시트보다 아래입니다 (' + mine + ')');
  assert.ok(mine > z('.tax-modal'), '★ 세무사무실 창보다 아래입니다 (' + mine + ')');
});

/* ══════ ⑤⑥ 쓰다 만 메일 물음 ══════ */
test('★★ 「쓰다 만 메일」 물음이 그 창을 쓴다 — 별표가 그대로 나오던 자리다', () => {
  const fn = fnBody('openMailPage');
  assert.match(fn, /puAsk\(/, '★ 아직 브라우저 창으로 물어봅니다');
  assert.ok(fn.indexOf('confirm(') < 0, '★ confirm 이 남아 있습니다');
});

test('★★ 별표(**) 로 굵게 하려던 흔적이 없다 — 그대로 글자로 나온다', () => {
  const fn = fnBody('openMailPage');
  assert.ok(fn.indexOf('**') < 0,
    '★ 별표가 남아 있습니다 — 창에는 굵게 안 되고 별표가 그대로 보입니다');
  assert.match(fn, /<b>/, '★ 굵게 할 자리가 없습니다');
});

/* 여는 괄호부터 «짝 맞는» 닫는 괄호까지 잘라 낸다 — .then(…) 안을 실제로 들여다보려고 */
function parens(s, from) {
  const i = s.indexOf('(', from);
  assert.ok(i > 0, '괄호를 찾지 못했습니다');
  let d = 0;
  for (let k = i; k < s.length; k++) {
    if (s[k] === '(') d++;
    else if (s[k] === ')') { d--; if (!d) return s.slice(i, k + 1); }
  }
  assert.fail('짝 맞는 괄호를 찾지 못했습니다');
}

test('★★ 물음이 «끝난 뒤»에 화면을 짓는다 — puAsk 는 confirm 과 달리 JS를 안 멈춘다', () => {
  const fn = fnBody('openMailPage');
  const i = fn.indexOf('puAsk(');
  assert.ok(i > 0, '★ 가운데 창을 안 씁니다');
  const j = fn.indexOf('.then(', i);
  assert.ok(j > i, '★ 답을 안 기다립니다 — 답하기 전에 새 편지가 열립니다');
  /* ⚠ 「어딘가에 mailPageBuild 가 있다」로는 모자란다. 물음을 안 하는 길에도 하나 있어서,
       .then 안의 것을 빼먹어도 그 검사는 통과한다(실제로 되돌리기에서 안 걸렸다).
       그래서 .then(…) «안»을 들여다본다 — 여기에 없으면 답한 뒤 화면이 안 그려진다. */
  const then = parens(fn, j);
  assert.match(then, /mailPageBuild\(/,
    '★ 답을 받은 뒤에 화면을 안 짓습니다 — [이어서 쓰기]를 눌러도 아무 일이 안 일어납니다');
  /* 물음이 없는 길에도 있어야 한다 — 쓰다 만 글이 없으면 물어볼 것이 없다 */
  assert.ok(fn.split('mailPageBuild(').length - 1 >= 2,
    '★ 물어볼 것이 없을 때 화면을 안 짓습니다');
  assert.ok(src.indexOf('\nfunction mailPageBuild(') > 0, '★ mailPageBuild 가 없습니다');
});

test('★ 「이어서 쓰기」와 「버리고 새로」가 하던 일을 그대로 한다', () => {
  const fn = fnBody('openMailPage');
  assert.match(fn, /_compose = Object\.assign\(\{ picking:true \}, d\)/,
    '★ 이어서 쓰기가 쓰다 만 글을 안 불러옵니다');
  assert.match(fn, /clearDraft\(\)/,
    '★ 버리고 새로가 임시저장을 안 지웁니다 — 자동저장이 되살립니다');
});

/* ══════ ⑦ 넣는 값 ══════ */
test('★★ 창에 넣는 값은 esc() 를 거친다 — 제목에 <> 가 있으면 창이 깨진다', () => {
  const fn = fnBody('openMailPage');
  const i = fn.indexOf('puAsk(');
  const blk = fn.slice(i, fn.indexOf('.then(', i));
  for (const [k, name] of [['d.to', '받는 곳'], ['d.subject', '제목']]) {
    const at = blk.indexOf(k);
    assert.ok(at > 0, name + ' 을 안 보여 줍니다');
    assert.match(blk.slice(Math.max(0, at - 20), at + k.length),
      /esc\(/, '★ ' + name + ' 이 그대로 들어갑니다 — 창이 깨지거나 남의 글이 실행됩니다');
  }
  /* 단추 글자도 마찬가지 */
  const fnAsk = fnBody('puAsk');
  assert.match(fnAsk, /esc\(q\.ok/, '★ [확인] 글자가 그대로 들어갑니다');
  assert.match(fnAsk, /esc\(q\.cancel/, '★ [취소] 글자가 그대로 들어갑니다');
});
