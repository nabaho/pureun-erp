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

/* ── ⚙ 설정·백업·복구 타일 ── */
test('★★ ⚙ 설정·백업·복구가 «타일»로 들어왔다 — 관리자에게만', () => {
  ['cfg', 'backup'].forEach((k) => {
    assert.strictEqual(rowOf(k), 'inout', k + ' 타일이 내외관리에 없다');
    const m = new RegExp("key:'" + k + "'[\\s\\S]{0,400}?adminOnly:true").test(APPS);
    assert.ok(m, '★★ ' + k + ' 이 «전원»에게 보인다 — 관리자 전용이어야 한다');
  });
  assert.ok(/if\(app\.adminOnly && !\(typeof sgIsAdmin === 'function' && sgIsAdmin\(\)\)\) return;/.test(E),
    '★ adminOnly 를 적어 놓고 «보고 있지 않다»');
});

test('★★ 이미 있는 단추를 «그대로 누른다» (하는 일을 옮겨 적지 않는다)', () => {
  assert.ok(/if\(typeof cfgOpen === 'function'\) cfgOpen\(\);/.test(E),
    '★ 설정 여는 일을 두 벌로 적었다 — 한쪽만 고치고 지나가게 된다');
  assert.ok(/getElementById\('pu-backup-admin-button'\)[\s\S]{0,120}?b\.click\(\)/.test(E),
    '★ 백업 여는 일을 두 벌로 적었다');
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
