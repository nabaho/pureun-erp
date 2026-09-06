'use strict';
/* 주요업무 넣기 — node --test tests/home-work-edit.test.js
 *
 * 대표 지시 2026-09-06 「업무의 내용을 넣을 때 어떻게 해야 하나. 이렇게 보면
 *   전혀 확인이 안 되고 구분이 어렵다」 → 목업 docs/mockups/home-work-edit.html 의 ㉮㉯㉰.
 *
 * ★ 벤치마킹으로 알아낸 것 — 노무법인 다섯 곳(푸른·이안·선인·와이즈·호)을 열어 봤다.
 *   홈페이지 «내용»은 고칠 것이 없다. 설명까지 붙인 곳은 푸른과 이안 둘뿐이고
 *   번호를 쓰는 곳도 그 둘이다. 바꿀 것은 내용이 아니라 «넣는 화면»이었다.
 *
 * ★ 이 검사가 지키는 것
 *   ㉮ 쪽을 고르면 «저절로» 읽어온다 — 안 읽으면 늘 덩어리 글자만 보인다
 *   ㉯ 「대조 기준 글자」는 접혀 있다 — 기계가 견주는 값이지 사람이 읽을 글이 아니다
 *   ㉰ 줄을 «번호+제목» 항목으로 묶어 보여 준다 — 묶는 자리는 지어내지 않는다
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const R = path.join(__dirname, '..');
const RAW = fs.readFileSync(path.join(R, 'pu-home.html'), 'utf8');
/* 주석을 먼저 걷는다 — 잘 쓴 주석이 검사를 통과시키면 아무것도 안 지킨다 */
const H = RAW.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

function 함수(이름) {
  const i = H.search(new RegExp('(?:async )?function ' + 이름 + '\\('));
  assert.ok(i >= 0, '★ ' + 이름 + ' 을 못 찾았다');
  const j = H.indexOf('\nfunction ', i + 5), k = H.indexOf('\nasync function ', i + 5);
  return H.slice(i, Math.min(j < 0 ? H.length : j, k < 0 ? H.length : k));
}

/* ══════ ㉮ 저절로 읽어온다 ══════ */
test('★★ 쪽을 고르면 «저절로» 읽어온다 — 안 읽으면 덩어리 글자만 보인다', () => {
  /* 읽어온 줄은 화면에서만 살고 저장하지 않는다(홈페이지를 비추는 값이라 굳히면 낡는다).
     그래서 화면을 새로 열면 「홈페이지 확인 9/3」이라 적혀 있는데도 줄은 비어 있었다. */
  const s = 함수('쪽자동읽기');
  assert.match(s, /readOnePage\(/, '★★ 읽어오지 않습니다');
  assert.match(s, /kind !== 'page'/, '★ 쪽이 아닌데도 읽으려 듭니다');
  assert.match(s, /Array\.isArray/, '★★ 이미 읽은 쪽을 또 읽습니다 — 화면마다 서버를 부릅니다');
  assert.match(s, /App\.reading/, '★ 읽는 중에 또 부릅니다');

  /* 고르는 길 셋에 다 걸려 있어야 한다 — 하나라도 빠지면 그 길로 온 사람은 덩어리를 본다 */
  ['async go(group)', 'async select(key)', 'async jump(group, key)'].forEach(자리 => {
    const at = H.indexOf(자리);
    assert.ok(at > 0, '★ ' + 자리 + ' 를 못 찾았다');
    assert.match(H.slice(at, at + 700), /쪽자동읽기\(\)/,
      '★★ 「' + 자리 + '」로 왔을 때는 저절로 안 읽습니다');
  });
});

test('★★ 저절로 읽다 실패해도 «창을 띄우지 않는다»', () => {
  /* 사람이 부른 것이 아니다. 쪽을 고를 때마다 알림창이 뜨면 화면을 못 쓴다.
     읽어오는 단추가 그대로 남아, 사람이 누르면 그때 까닭을 알려 준다. */
  const s = 함수('readOnePage');
  assert.match(s, /조용히/, '★★ 조용히 읽는 길이 없습니다');
  const at = s.indexOf('if (잘못)');
  assert.ok(at > 0, '★ 실패를 다루는 곳이 없습니다');
  /* ⚠ 「그 언저리에 조용히 가 있나」로 보면 안 된다 — 아래쪽의 다른 조용히 가 대신 걸려,
     빠져나가는 줄을 지워도 통과했다(2026-09-06 되돌림 검사가 잡았다).
     «알림창(say)보다 «먼저» 빠져나가는가»를 본다. */
  const 뒤 = s.slice(at);
  const 빠짐 = 뒤.indexOf('조용히'), 알림 = 뒤.indexOf('say(');
  assert.ok(빠짐 >= 0 && 알림 > 빠짐,
    '★★ 저절로 읽다 실패했는데 알림창을 띄웁니다 — 쪽을 고를 때마다 뜹니다');
  /* 토스트도 안 띄운다 */
  assert.match(s, /if \(조용히\) return;/, '★ 조용히 읽었는데 토스트가 뜹니다');
});

test('⚠ 「저절로 읽기」를 loadDraft 안에 넣지 않는다', () => {
  /* 2026-09-06 에 loadDraft 를 «감싸는» 껍데기로 만들었다가, 이 함수를 글자로 떼어다
     돌리는 검사 열넷이 껍데기만 읽고 한꺼번에 깨졌다. loadDraft 는 자료만 만든다. */
  assert.ok(함수('loadDraft').indexOf('쪽자동읽기') < 0,
    '★★ loadDraft 가 서버를 부릅니다 — 이 함수를 떼어다 돌리는 검사들이 깨집니다');
  assert.ok(함수('loadAll').indexOf('쪽자동읽기') < 0,
    '★★ loadAll 이 서버를 부릅니다 — 첫 화면은 구성원이라 읽을 쪽도 없습니다');
});

/* ══════ ㉯ 대조 기준 글자는 접는다 ══════ */
test('★★ 「대조 기준 글자」는 접혀 있다 — 기계가 견주는 값이다', () => {
  /* 태그를 걷고 줄을 뭉쳐 만든 값인데 화면 한복판에 가장 크게 있어,
     그것이 편집칸인 줄 알게 됐다(대표 지적 「전혀 확인이 안 되고 구분이 어렵다」). */
  const s = 함수('pageEdit');
  const at = s.indexOf('대조 기준 글자');
  assert.ok(at > 0, '★ 대조 기준 글자 칸이 없습니다');
  assert.match(s.slice(Math.max(0, at - 200), at), /<details/,
    '★★ 대조 기준 글자가 펼쳐진 채 있습니다 — 그것이 편집칸인 줄 알게 됩니다');
  /* ⚠ 없애지는 «않는다» — 딱지가 「안 올라감」에 묶였을 때 푸는 유일한 길이다 */
  /* ⚠ 소스에서는 따옴표가 탈출돼 있다 — fieldEdit(\'text\' 꼴이다.
     탈출 없는 꼴만 찾으면 «멀쩡한데 빨간불»이 난다(이 저장소가 여러 번 겪은 자리다). */
  assert.match(s, /fieldEdit\(\\?'text\\?',this\.value\)/,
    '★★ 대조 기준 글자를 고칠 길이 사라졌습니다 — 묶인 딱지를 풀 방법이 없어집니다');
});

/* ══════ ㉰ 항목으로 묶는다 ══════ */
test('★★ 줄을 «번호+제목» 항목으로 묶어 보여 준다', () => {
  const s = 함수('pageLinesHtml');
  /* ⚠ 「항목머리 가 소스에 있나」로 보면 안 된다 — «만들어 놓고 안 쓰는» 것도 통과한다.
     실제로 되돌림 검사에서, 부르는 자리를 지웠는데 정의가 남아 통과했다(2026-09-06).
     ★ «부르는 자리»를 본다. 아래 ⑨(항목수)도 같은 까닭으로 고쳤다. */
  assert.match(s, /return 항목머리\(i\)/,
    '★★ 항목머리를 만들어 놓고 «안 씁니다» — 줄이 그대로 죽 섭니다');
  /* 묶는 자리를 «지어내지 않는다» — 홈페이지의 「01」 번호 줄이 곧 항목의 시작이다 */
  assert.match(s, /\^\\d\{1,2\}\$/, '★ 번호 줄을 알아보는 규칙이 없습니다');
  assert.match(s, /runs\[i \+ 1\]/, '★ 번호 다음 줄(제목)을 안 씁니다');
  assert.match(s, /항목수 \?[^:]*업무 /,
    '★ 업무가 몇 개인지 «화면에» 안 적습니다 — 세어만 놓고 안 씁니다');
  const css = /(?:^|\n)\.rows \.grp\{([^}]*)\}/.exec(RAW);
  assert.ok(css, '★ 항목 머리의 꾸밈이 없습니다');
});

test('★★ 항목으로 묶어도 «채우는 단위는 줄»이다 — 통째로 갈아 끼우지 않는다', () => {
  /* 통째로 갈아 끼우면 지도·표·구획이 깨진다. 묶는 것은 보여 주는 방식일 뿐이다. */
  const s = 함수('pageLinesHtml');
  assert.match(s, /pageRunEdit\(/, '★★ 줄 하나씩 고치는 길이 사라졌습니다');
  /* 항목 머리는 «보여 주기»만 한다 — 거기에 입력칸이 있으면 안 된다 */
  const at = s.indexOf('const 항목머리');
  const 머리 = s.slice(at, s.indexOf('};', at));
  assert.ok(머리.indexOf('<input') < 0,
    '★★ 항목 머리에 입력칸이 있습니다 — 채우는 단위가 줄이 아니게 됩니다');
});
