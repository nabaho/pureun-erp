/* 죽은 코드는 «0» 으로 둔다 — 그리고 세는 법이 틀리지 않는지 함께 본다 (STATUS ④ A1)
 *
 * ■ 이 자리가 오래 막혀 있던 까닭은 «세는 법»이었다 (2026-09-05 실측)
 *   STATUS 는 「원문 기준으로 다시 세야 한다」고만 적어 두었는데, 실제로 세어 보니
 *   순진하게 세는 길이 네 번 틀렸다. 네 번 다 «산 것을 죽었다»고 말했다 —
 *   그대로 지웠으면 화면이 멎었을 자리다.
 *
 *     ㉠ 중괄호 세기      "}" 가 글자 «안»에 있으면 몸통 끝이 어긋난다
 *                        → rules.html 의 dlDoc(두 곳에서 불린다)이 「146KB 죽은 코드」로
 *     ㉡ 글자 걷어내기    틀글(``)의 닫는 백틱을 놓치면 그 뒤가 통째로 글자가 된다
 *                        → pu-cards.html 의 함수 1,406개가 55개로
 *     ㉢ 앞의 점(.) 빼기  검사는 «ctx.fn(...)» 로 부른다 — 빼고 세면 안 잡힌다
 *                        → pickEmail 이 죽은 것으로
 *     ㉣ 즉시 실행 함수   (function 이름(){…})() 는 부르는 자리가 «없어도» 산다
 *                        → cleanupLS·bindGlobalPhotoDrag 등 여섯이 죽은 것으로
 *     ㉤ 주석 속 선언     「자리가 생기면 이렇게 쓰면 된다」를 진짜 선언으로 읽는다
 *                        → js/pu-co-thread.js 의 fromSms·fromKakao 가 죽은 것으로
 *
 * ■ 그래서 검사가 «두 가지»를 본다
 *   ① 죽은 함수가 0개다 (늘면 그 자리에서 걸린다)
 *   ② ★ 세는 연장이 위 다섯 함정에 «다시 빠지지 않는다» — 그것을 실제로 재어 본다.
 *      ①만 두면, 연장이 고장 나 「0개」라고 말할 때 아무도 모른다.
 * 실행: node --test tests/dead-code.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const T = require('../tools/dead-code.js');

const 전체 = T.파일모으기();

test('★① 아무 데서도 안 불리는 함수가 없다', () => {
  const 죽음 = T.훑기(T.볼파일(전체), 전체).filter((x) => x.없음);
  assert.deepEqual(죽음.map((x) => x.file + ':' + x.name), [],
    '★ 아무도 안 부르는 함수가 생겼습니다. 지우거나, 부르는 자리를 만드세요.\n'
    + '   확인: node tools/dead-code.js');
});

/* ── ② 연장이 다섯 함정에 안 빠지는지 «재어» 본다 ── */
const 재기 = (src) => T.훑기(['x.js'], { 'x.js': src });

test('★★㉠ 글자 안의 중괄호에 안 속는다', () => {
  const src = 'function a(){ return "}"; }\nfunction b(){ return 1; }\na(); b();\n';
  assert.deepEqual(재기(src), [], '★★ } 가 글자 안에 있어 셈이 어긋났습니다');
});

test('★★㉡ 틀글(``)의 닫는 백틱을 놓치지 않는다', () => {
  const src = 'function a(){ return `<b onclick="c()">${d()}</b>`; }\n'
    + 'function c(){}\nfunction d(){}\na();\n';
  assert.deepEqual(재기(src), [], '★★ 틀글 뒤가 통째로 글자로 읽혔습니다');
});

test('★★㉢ 검사가 «ctx.fn(...)» 로 부르는 것을 산 것으로 본다', () => {
  const r = T.훑기(['x.js'], { 'x.js': 'function only(){}\n', 'tests/y.test.js': 'c.only(1);' });
  assert.equal(r.length, 1);
  assert.equal(r[0].없음, false, '★★ 앞의 점을 빼고 세면 검사가 지키는 것도 죽은 것이 됩니다');
  assert.equal(r[0].검사만, true, '검사만 부르는 것으로 안 봅니다');
});

test('★★㉣ 즉시 실행 함수는 «부르는 자리가 없어도» 산 것이다', () => {
  assert.deepEqual(재기('(function boot(){ go(); })();\nfunction go(){}\n'), [],
    '★★ 즉시 실행 함수를 지우면 앱이 시작할 때 하던 일이 통째로 사라집니다');
});

test('★★㉤ 주석에 «적어 둔» 함수를 진짜 선언으로 읽지 않는다', () => {
  const src = '/* 자리가 생기면 이렇게 쓰면 된다:\n'
    + '     function fromSms(box){ return 1; } */\nfunction real(){}\nreal();\n';
  assert.deepEqual(재기(src), [],
    '★★ 주석 속 보기글을 죽은 코드로 셌습니다 — 그것은 코드가 아닙니다');
});

test('★★㉥ 글(.md)에 «적는 것»은 부르는 것이 아니다', () => {
  /* docs/ 아래만 문서로 보면, STATUS.md 에 이름을 한 번 적는 것만으로 「살아 있다」가
     되어 죽은 코드가 조용히 숨는다 — 2026-09-05 에 erpConsTypeName 이 실제로 그랬다. */
  const r = T.훑기(['x.js'], { 'x.js': 'function only(){}\n', 'STATUS.md': '`only` 를 나중에 지운다' });
  assert.equal(r.length, 1);
  assert.equal(r[0].검사만, true,
    '★★ 글에 적었다고 산 것이 됐습니다 — 그러면 STATUS 에 한 줄 적어 죽은 코드를 숨길 수 있습니다');
});

test('★★㉦ 연장과 제 검사는 «저 자신을 세지 않는다»', () => {
  /* 죽은 코드를 설명하려고 주석에 그 이름을 적으면 그것이 「부르는 자리」로 읽혀
     목록에서 사라진다 — 설명할수록 안 보이게 된다. 2026-09-05 에 실제로 그랬다. */
  const 전 = T.파일모으기();
  assert.ok(!전['tools/dead-code.js'], '★★ 연장이 제 자신을 셉니다');
  assert.ok(!전['tests/dead-code.test.js'], '★★ 이 검사가 제 자신을 셉니다');
});

test('★★㉧ «일부러 남긴 것»을 지울 것으로 내놓지 않는다', () => {
  /* 2026-09-05 에 열둘을 손으로 갈라 보니 셋은 일부러 남긴 것이었다 —
     work.html 의 옛 분류 다듬개는 「과거 데이터 해석용으로 남겨 둔다」고 적혀 있다.
     지우면 옛 자료를 읽을 길이 사라진다. 목록이 그것을 안 가르면 쓸모가 없다. */
  const r = T.훑기(['x.js'], {
    'x.js': '// 지금은 쓰지 않는다. 과거 자료 해석용으로 남겨 둔다\nfunction old(){}\nfunction plain(){}\n'
  });
  const 옛것 = r.filter((x) => x.name === 'old')[0];
  assert.ok(옛것 && 옛것.일부러 === true,
    '★★ 주석이 「남겨 둔다」고 적어 두었는데 지울 것으로 내놓습니다');
  const 그냥 = r.filter((x) => x.name === 'plain')[0];
  assert.ok(그냥 && 그냥.일부러 === false, '아무 말 없는 것까지 「일부러」로 봅니다');
});

test('★ 연장이 «넉넉한 쪽»으로 틀린다 — 산 것을 죽었다고 하느니 죽은 것을 남긴다', () => {
  /* 재귀는 제 몸통 안에서만 저를 부른다. 그래도 산 것으로 둔다(안전한 쪽). */
  assert.deepEqual(재기('function loop(n){ return n?loop(n-1):0; }\n'), [],
    '★ 재귀 함수를 죽은 것으로 셌습니다 — 이 연장은 안전한 쪽으로 틀려야 합니다');
});

test('연장이 실제 파일을 훑을 수 있다 — 선언을 못 찾으면 「0개」가 거짓이 된다', () => {
  const src = 전체['pu-cards.html'];
  const 수 = new Set(T.선언들(src).map((d) => d.name)).size;
  assert.ok(수 > 900,
    '★ 함수를 ' + 수 + '개밖에 못 찾았습니다 — 세는 법이 깨져 「죽은 코드 0개」가 거짓이 됩니다');
});
