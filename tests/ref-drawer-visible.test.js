'use strict';
/* ⋯ 참고 서랍이 «폰에서 실제로 보이는가» (대표 제보 2026-09-07 「참고가 안 열린다」)
 *
 * ★★ 무슨 일이 있었나
 *   서랍은 열리고 있었다 — display 도 flex 였고 자리도 잡혀 있었다.
 *   그런데 화면에 «한 점도» 안 그려졌다. 411px 실측에서 좌281~우431(화면 411)로
 *   잡혀 있으면서 보이지 않았다.
 *
 * ★ 까닭 둘이 겹쳤다
 *   ㉠ 폰 구간에서 header 는 overflow:hidden, .hdr-nav 는 overflow-x:auto —
 *      position:absolute 인 서랍을 «통째로 잘라 냈다».
 *   ㉡ header 에 backdrop-filter 가 걸려 있어, position:fixed 로 바꿔도 소용없었다.
 *      backdrop-filter 는 fixed 자손의 «담는 상자»가 되어 그 안에 가둔다.
 *   그래서 서랍을 머리줄 «밖»(body 직계)으로 꺼냈다.
 *
 * ★★ 이건 서고만의 일이 아니었다 — 표준규칙·문안 은행·보관함·조문 검색까지
 *   «다섯 개 전부» 폰에서 못 쓰는 상태였다. 서랍을 접은 날부터 줄곧 그랬다.
 */
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'rules.html'), 'utf8');

test('★★ 서랍이 머리줄 «밖»에 있다 — 안에 두면 잘린다', () => {
  const 머리줄 = SRC.slice(SRC.indexOf('<header'), SRC.indexOf('</header>'));
  assert.ok(머리줄.indexOf('id="ref-drawer"') < 0,
    '★ 서랍이 <header> 안에 있습니다. 머리줄의 overflow:hidden 과 backdrop-filter 가\n'
    + '  그 안의 것을 잘라 내고 가둡니다 — 폰에서 다섯 단추가 통째로 안 보이게 됩니다.');
  assert.ok(SRC.indexOf('id="ref-drawer"') > 0, '서랍 자체는 있어야 합니다');
});

test('★ 서랍은 «화면 기준»으로 뜬다 — 머리줄에 매이지 않는다', () => {
  const css = SRC.slice(SRC.indexOf('#ref-drawer{'), SRC.indexOf('#ref-drawer{') + 400);
  assert.ok(/position:\s*fixed/.test(css),
    '머리줄 밖으로 꺼냈어도 absolute 면 부모를 따라다닙니다 — fixed 라야 합니다');
});

test('★ 뜨는 자리를 «재서» 잡는다 — 화면 밖으로 안 나가게', () => {
  const fn = SRC.slice(SRC.indexOf('function toggleRefDrawer'),
                       SRC.indexOf('function toggleRefDrawer') + 900);
  assert.ok(/getBoundingClientRect/.test(fn), '단추 자리를 재야 그 밑에 붙일 수 있습니다');
  assert.ok(/Math\.max|Math\.min/.test(fn),
    '★ 화면 밖으로 나가지 않게 «조여» 주어야 합니다 — 411px 에서 오른쪽이 20px 잘렸습니다');
});

test('★ 바깥을 눌러 닫을 때 «서랍 자신»은 바깥이 아니다', () => {
  const at = SRC.indexOf('!e.target.closest(".refwrap")');
  assert.ok(at > 0, '바깥 클릭 닫기가 있어야 합니다');
  const 둘레 = SRC.slice(at, at + 200);
  assert.ok(/#ref-drawer/.test(둘레),
    '★ 서랍이 .refwrap 밖으로 나갔습니다 — 함께 안 보면 서랍 안을 눌러도 닫혀 버립니다');
});

test('★ 다섯 단추가 다 들어 있다 — 하나라도 빠지면 그 도구는 폰에서 못 간다', () => {
  const 서랍 = SRC.slice(SRC.indexOf('<div id="ref-drawer">'),
                        SRC.indexOf('</div>', SRC.indexOf('<div id="ref-drawer">')) + 6);
  ['open-std', 'open-bank', 'open-arch', 'open-arts', 'open-cb'].forEach((id) => {
    assert.ok(서랍.indexOf('id="' + id + '"') > 0, id + ' 가 서랍에 없습니다');
  });
});

test('⚠ 머리줄이 폰에서 «자르는» 것은 그대로다 — 그래서 밖으로 꺼낸 것이다', () => {
  /* 이 검사는 머리줄을 고치라는 것이 아니다. 머리줄의 자르기는 도구 띠를 옆으로
     밀어 보게 하는 «일부러 한 것»이다. 그 사실이 사라지면 위 결정의 근거도 사라지므로
     여기에 적어 둔다 — 없어지면 서랍을 도로 안에 넣어도 된다는 뜻이 된다. */
  assert.ok(/header\{overflow:hidden/.test(SRC.replace(/\s+/g, '')) ||
            /header\{[^}]*overflow:\s*hidden/.test(SRC),
    '머리줄의 자르기가 사라졌습니다 — 서랍을 밖에 둔 까닭을 다시 보세요');
});
