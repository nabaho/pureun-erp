/* 초기화면 줄 — 「내외관리」로 합치기 (대표 지시 2026-08-29~30)
 *
 * 대표: 「업무관리를 자료함으로 넣고 진행해줘」
 *       「캡쳐와같이 설명은 빼라」
 *       「우리사무실을 하나로 합치고 내외관리로 바꿔서 앱도 합쳐달라」
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const EN = fs.readFileSync(path.join(__dirname, '..', 'enter.html'), 'utf8');
function bare(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}
const E = bare(EN);
function cut(a, b) {
  const i = E.indexOf(a); assert.ok(i >= 0, '못 찾음: ' + a);
  const j = E.indexOf(b, i); assert.ok(j >= 0, '끝 못 찾음: ' + b);
  return E.slice(i, j);
}
const ROWS = cut('var APP_ROWS = [', '\n  ];');
const APPS = cut('var APPS = [', '\n  ];');
const rowOf = (key) => {
  const m = new RegExp("key:'" + key + "'[\\s\\S]{0,260}?row:'([a-z]+)'").exec(APPS);
  return m ? m[1] : null;
};

test('★★ 줄은 셋이고, 넷째는 «내외관리» 하나로 합쳤다', () => {
  const ids = (ROWS.match(/id:'([a-z]+)'/g) || []).map((s) => s.slice(4, -1));
  assert.deepStrictEqual(ids, ['client', 'store', 'inout'],
    '★ 줄 구성이 다르다: ' + ids.join(','));
  assert.ok(/label:'내외관리'/.test(ROWS), '★ 이름이 「내외관리」가 아니다');
  assert.ok(!/id:'office'|id:'outside'/.test(ROWS),
    '★ 「우리 사무실」·「대외」가 아직 따로 남아 있다');
});

test('★★ 줄 설명(hint)을 «안 그린다»', () => {
  assert.ok(!/hint:/.test(ROWS), '★ 줄 정의에 설명이 아직 있다');
  assert.ok(!/tilerow-s/.test(E),
    '★★ 화면이 아직 설명 칸을 그린다 — 한 줄이 더 붙어 타일이 아래로 밀린다');
});

test('★★ 업무관리는 «자료함»이다 (대표 지시)', () => {
  assert.strictEqual(rowOf('work'), 'store');
});

test('★★ 경력관리·홈페이지 관리가 «한 줄»에 모였다', () => {
  assert.strictEqual(rowOf('career'), 'inout');
  assert.strictEqual(rowOf('home'), 'inout');
});

test('★ 모든 타일이 «실제로 있는 줄»에 있다 (없는 줄이면 화면에서 사라진다)', () => {
  const ids = (ROWS.match(/id:'([a-z]+)'/g) || []).map((s) => s.slice(4, -1));
  const used = (APPS.match(/row:'([a-z]+)'/g) || []).map((s) => s.slice(5, -1));
  used.forEach((r) => assert.ok(ids.indexOf(r) >= 0, '★ 없는 줄을 가리킨다: ' + r));
});

/* ── ⚙ 설정·백업·복구는 «타일이 아니다» ──
   2026-08-30 대표 지시로 뒤집혔다: "이것 중복되는거 아닌가 … 중복은 삭제해라".
   화면 왼쪽 아래 떠 있는 단추(#cfgFab · pu-backup-admin-button)와 같은 일이라,
   타일로도 두면 한 가지 일에 문이 둘이 된다.
   ⚠ 앞선 검사는 「타일로 들어왔다」를 지키고 있었다 — 지금은 그 반대를 지킨다. */
test('★★ ⚙ 설정·백업·복구를 «타일로 되돌리지 않는다» — 떠 있는 단추와 중복이다', () => {
  ['cfg', 'backup'].forEach((k) => {
    assert.strictEqual(rowOf(k), null,
      '★ ' + k + ' 이 다시 타일로 들어왔다 — 왼쪽 아래 떠 있는 단추와 중복이다.'
      + ' 타일로 두려면 떠 있는 단추를 먼저 없애야 한다');
  });
  /* 내외관리 줄은 이 둘뿐이다 */
  ['career', 'home'].forEach((k) =>
    assert.strictEqual(rowOf(k), 'inout', k + ' 이 내외관리에 없다'));
});

test('★★ 떠 있는 단추는 남아 있다 — 타일을 걷어내며 같이 지우면 길이 사라진다', () => {
  assert.match(E, /id="cfgFab"/, '★ ⚙ 설정 단추가 없어졌다');
  /* 이 화면은 $() 로 집는다 — 실제로 쓰이고 있는지만 본다(집는 방법은 안 따진다) */
  assert.match(E, /cfgFab'\)[\s\S]{0,80}?addEventListener/, '★ ⚙ 설정 단추를 아무도 안 누른다');
  /* 백업 단추는 js/pu-backup.js 가 만든다 — 포털은 그것을 싣기만 한다 */
  assert.match(E, /js\/pu-backup\.js/, '★ 백업 도구를 안 싣는다');
});

test('★★ 설정·백업은 «언제나» 관리자에게만 보인다 (대표 지시 2026-08-30)', () => {
  /* ⚙ 단추: 기본이 숨김이고(CSS) 관리자일 때만 켠다 — 모를 때 새지 않는다 */
  assert.match(E, /#cfgFab\{display:none/, '★ ⚙ 단추 기본이 숨김이 아니다 — 잠깐이라도 샌다');
  assert.match(E, /cfgFab[\s\S]{0,120}?sgIsAdmin\(\)/,
    '★ ⚙ 단추가 관리자인지 안 보고 켜진다');
  /* 백업 단추: uid_roles 를 보고 만든다 (js/pu-backup.js) */
  const bk = fs.readFileSync(path.join(__dirname, '..', 'js', 'pu-backup.js'), 'utf8');
  assert.match(bk, /uid_roles/, '★ 백업 단추가 권한을 안 본다');
  assert.match(bk, /isAdmin/, '★ 백업 단추가 관리자인지 안 본다');
});

test('★★ act 타일도 «같은 길»로 그린다 (그림·글자가 하나뿐이다)', () => {
  /* 두 길로 그리면 「PC 전용」 경고 같은 것이 한쪽에만 남는다 — 실제로 그럴 뻔했다. */
  const at = E.indexOf("var isAct = typeof app.act === 'function';");
  assert.ok(at > 0, '★ act 타일을 가리는 곳이 없다');
  assert.ok(/a\.href = isAct \? '#'/.test(E.slice(at, at + 400)), '★ 주소를 안 가린다');
  /* ★ 타일 그리는 곳에 a.innerHTML 이 «하나»여야 한다 —
     둘이면 act 타일과 보통 타일이 따로 그려져, 「PC 전용」 경고 같은 것이
     한쪽에만 남는다(실제로 그럴 뻔했다). */
  const build = cut('APPS.forEach(function(app){', 'buildHomeBar();');
  assert.strictEqual((build.match(/a\.innerHTML =/g) || []).length, 1,
    '★★ act 타일을 «따로» 그린다 — 그림·글자가 두 벌이 되면 한쪽만 낡는다');
});

test('★★ 빈 줄은 «안 보인다»', () => {
  assert.ok(/function hideEmptyRows\(\)/.test(E),
    '★ 타일이 없는 줄이 제목만 남는다 — 「여기 뭐가 있어야 하나」로 읽힌다');
  assert.ok(/hideEmptyRows\(\);/.test(E.replace(/function hideEmptyRows\(\)/, '')),
    '★ 만들어 놓고 «부르지 않는다»');
});
