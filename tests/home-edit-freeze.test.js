/* 구성원 편집칸 틀고정 — node --test tests/home-edit-freeze.test.js
 *
 * 대표 지시 2026-09-03 「이 부분 전체 틀고정해야 한다」.
 * 경력이 열여덟 줄이라 굴리다 보면 「누구 자료인지·무슨 업무인지」가 위로 사라졌다.
 * 그래서 경력 목록 «위 전부»를 붙였다.
 *
 * ★ 무엇을 지키는가
 *   ① 경력 목록 위의 칸들은 붙은 칸(.stick) «안»에 있다
 *   ② 경력 목록(careerBox)은 붙은 칸 «밖»에 있다 — 안에 들어가면 굴릴 것이 없어진다
 *   ③ 붙은 칸에 높이 한도가 있다 — 담당 업무가 열 줄이면 화면을 다 먹는다
 *   ④ 태그 짝이 맞는다 — .fld 를 갈라 썼으므로 어긋나기 쉽다
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'pu-home.html'), 'utf8');

/* 주석을 걷는다. 안 걷으면 «주석에 적힌 말»이 검사를 통과시킨다 —
   이 저장소에서 실제로 그런 일이 있었다(tests-must-strip-comments). */
function 주석걷기(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, '');
}

/* memberEdit 한 함수만 떼어 온다 — 다른 함수의 같은 글자에 속지 않게 */
function memberEditSrc() {
  const at = SRC.indexOf('function memberEdit(');
  assert.ok(at > 0, 'memberEdit 함수를 못 찾았습니다');
  const next = SRC.indexOf('\nfunction ', at + 10);
  return 주석걷기(SRC.slice(at, next > 0 ? next : SRC.length));
}

/* 어느 칸이 «붙는가»는 그 글자를 어느 그릇에 담는지로 정해진다 —
   붙은칸 에 담으면 붙고, h 에 담으면 구른다.
   ★ 주석에 적힌 말로 판단하지 않는다. 주석은 위에서 걷어냈다. */
function 담긴그릇(src, marker) {
  const at = src.indexOf(marker);
  assert.ok(at > 0, '화면에 「' + marker + '」가 없습니다');
  const 앞 = src.slice(0, at);
  const 붙 = 앞.lastIndexOf('붙은칸 +=');
  const 구 = Math.max(앞.lastIndexOf('h +='), 앞.lastIndexOf('let h ='));
  return 붙 > 구 ? '붙은칸' : 'h';
}

test('① 경력 목록 «위 전부»가 붙은 칸에 담긴다', () => {
  const src = memberEditSrc();
  assert.match(src, /let 붙은칸 = ''/, '붙은 칸을 모으는 그릇이 없습니다 — 틀고정이 사라졌습니다');
  assert.match(src, /'<div class="stick shadow">' \+ 붙은칸/,
    '모은 것을 붙은 칸으로 내보내지 않습니다');

  /* 굴려도 늘 보여야 하는 것들 */
  ['>구분<', '<b>이름</b>', '메인 설명', '담당 업무', '경력사항 — '].forEach(m => {
    assert.equal(담긴그릇(src, m), '붙은칸',
      '「' + m.replace(/<[^>]*>/g, '') + '」가 붙은 칸에서 빠졌습니다 — 굴리면 사라집니다');
  });
});

test('② 경력 목록은 붙은 칸 «밖»이다 — 안에 넣으면 굴릴 것이 없어진다', () => {
  const src = memberEditSrc();
  assert.equal(담긴그릇(src, 'id="careerBox"'), 'h',
    '경력 목록이 붙은 칸에 들어갔습니다 — 열여덟 줄이 다 붙으면 굴릴 자리가 없습니다');
  /* 담당 업무 «목록»은 붙는다(보통 두세 줄이라 괜찮다). 경력만 밖이어야 한다. */
  assert.equal(담긴그릇(src, 'id="dutyBox"'), '붙은칸',
    '담당 업무 칸이 붙은 칸 밖으로 나갔습니다');
});

test('③ 붙은 칸에 높이 한도가 있다 — 담당 업무가 길어도 화면을 다 먹지 않는다', () => {
  /* 값(56vh)이 아니라 «한도가 있는가»를 본다 — CLAUDE.md 의 검사 규칙이다 */
  /* ⚠ '.stick{' 을 그냥 찾으면 «.esc > .stick{margin-top:2px}» 이 먼저 걸린다 —
     줄 맨 앞의 홑 규칙을 잡는다. */
  const m = /(?:^|\n)\.stick\{([^}]*)\}/.exec(SRC);
  assert.ok(m, '.stick 스타일이 없습니다');
  const rule = m[1];
  assert.match(rule, /position:\s*sticky/, '붙지 않습니다 — 틀고정이 아닙니다');
  assert.match(rule, /max-height:\s*\d/, '높이 한도가 없습니다 — 붙은 칸이 화면을 다 먹을 수 있습니다');
  assert.match(rule, /overflow-y:\s*auto/, '한도를 넘으면 잘려서 안 보입니다 — 안에서 구르게 해야 합니다');
});

test('④ 붙은 칸이 «밖»에 숨을 두지 않는다 — 그 틈으로 경력 줄이 비쳐 지나간다', () => {
  /* 2026-09-03 재어서 찾았다: .esc > .stick{margin-top:2px} 때문에 붙은 칸이
     쉴 때 62+2px, 붙을 때 62px 에 있었다 — 굴릴 때 2px 띠로 경력 줄이 지나갔다.
     앞선 세션은 같은 일을 12px 여백으로 겪어 13px 틈을 봤다.
     ★ 숨은 «안»(padding)에서 갖는다. 그래야 붙은 뒤에도 아래 글을 덮는다.
       고친 뒤 실측: 틈 0px, 경력만 500px 굴렀다. */
  const m = /\.esc *> *\.stick\{([^}]*)\}/.exec(SRC);
  assert.ok(m, '.esc > .stick 규칙이 없습니다');
  assert.match(m[1], /margin-top:\s*0/,
    '붙은 칸이 밖에 숨을 갖고 있습니다 — 그만큼 틈이 생겨 경력 줄이 비쳐 보입니다');
  const 안 = /(?:^|\n)\.stick\{([^}]*)\}/.exec(SRC);
  assert.match(안[1], /padding-top:\s*[1-9]/,
    '숨이 통째로 사라졌습니다 — 붙은 칸 «안»에서 가져야 합니다');
});

test('④ 경력사항의 이름줄과 목록을 갈랐는데 .fld 가 반쪽으로 열려 있지 않다', () => {
  /* 경력사항은 «이름줄은 붙고, 목록은 구르는» 칸이라 .fld 하나를 둘로 갈랐다.
     한쪽을 안 닫으면 그 아래 전체가 그 칸 안으로 딸려 들어간다 — 화면이 무너진다. */
  const src = memberEditSrc();
  const 이름줄 = src.indexOf('경력사항 — ');
  assert.ok(이름줄 > 0, '경력사항 이름줄이 없습니다');
  /* 이름줄 조각은 «스스로 닫는다» — .fldbar 와 .fld 둘 다.
     조각의 끝은 붙은 칸을 내보내는 줄이다(그 사이가 이름줄 조각). */
  const 내보냄 = src.indexOf('<div class="stick shadow">');
  assert.ok(내보냄 > 이름줄, '붙은 칸을 내보내는 자리가 경력사항 이름줄보다 앞에 있습니다');
  assert.match(src.slice(이름줄, 내보냄), /<\/div><\/div>'\s*;/,
    '경력사항 이름줄의 .fld 가 열린 채 끝납니다 — 아래 전체가 그 안으로 들어갑니다');
  /* 목록은 «자기 .fld» 를 새로 연다 */
  const 목록 = src.indexOf('id="careerBox"');
  assert.match(src.slice(목록 - 120, 목록), /<div class="fld">/,
    '경력 목록이 감싸개 없이 놓였습니다');
});
