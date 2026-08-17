'use strict';
/* 원본에서 함수 하나를 **통째로** 뽑는다. (검사용 공용 도구 — 검사 파일이 아니다)

   ■ 왜 있나

   검사들이 함수를 뽑을 때 두 가지 방법을 쓰는데 둘 다 조용히 어긋난다:

     ① `function X\([\s\S]*?\n\}`  — **열 0 의 첫 중괄호**에서 끊긴다.
        함수 안에 열 0 짜리 `}` 가 하나라도 생기면 뒤를 통째로 못 본다.
     ② `src.slice(at, at + 900)`   — **고정 폭**이라 함수가 길어지면 못 닿는다.
        실제로 16,145자짜리 함수를 900자만 보고 있던 곳이 있었다(6%).

   ①은 「없어야 한다」를 볼 때 **조용히 통과**하고, ②는 대개 소리 나게 깨지지만
   그때 깨지는 것은 «옳은 고침» 쪽이다 — 둘 다 검사를 못 믿게 만든다.

   ■ 쓰는 법

     const { cutFn } = require('./cut-fn');
     const fn = cutFn(src, 'function openViewer(');
     const fn2 = cutFn(src, 'async function camUpload(');

   ⚠ `decl` 은 **선언 첫머리 그대로** 준다. 이름만 주면 위쪽 «부르는 자리»가
     먼저 걸려 엉뚱한 함수를 잘라 낸다. */

/* 중괄호 짝을 세어 진짜 끝을 찾는다.
   ⚠ 따옴표·주석 안의 중괄호까지 세지는 않는다 — 이 저장소의 함수에서는 그것이
     짝을 어긋나게 한 적이 없고, 온전한 구문 분석은 검사 도구로 과하다.
     혹시 어긋나면 아래 sane 검사가 알려 준다(끝을 못 찾으면 던진다). */
function cutFn(src, decl) {
  const head = src.indexOf(decl);
  if (head < 0) throw new Error('원본에서 「' + decl + '」 을 찾지 못했습니다 — 이름이 바뀌었나요?');
  let i = src.indexOf('{', head + decl.length);
  if (i < 0) throw new Error('「' + decl + '」 의 여는 중괄호를 찾지 못했습니다.');
  let d = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') d++;
    else if (src[i] === '}') { d--; if (!d) return src.slice(head, i + 1); }
  }
  throw new Error('「' + decl + '」 의 끝(닫는 중괄호)을 찾지 못했습니다.');
}

module.exports = { cutFn };
