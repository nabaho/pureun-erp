'use strict';
/* 도메인을 지키는 검사 (대표 지시 2026-09-03 「fairrunlabor.com 이걸로 도메인 연결해라」)
 *
 * ■ 왜 이 검사가 필요한가
 *   깃허브 페이지는 저장소의 «CNAME 파일 하나»로 어느 주소를 받을지 정한다.
 *   그 파일이 사라지면 홈페이지가 통째로 404 가 되는데 —
 *   오류도 안 나고, 저장소도 멀쩡해 보이고, 검사도 다 초록이다.
 *   실제로 굳히개(scripts/freeze-homepage.js)가 이 파일을 «몰랐다».
 *   그대로 두었으면 다음에 다시 굳히는 날 도메인이 조용히 끊겼을 것이다.
 *
 * ■ 이 검사가 지키는 것
 *   ① 굳히개가 CNAME 을 «만든다»
 *   ② 그 안에 우리 도메인이 들어 있다 (주소 하나만, 앞뒤 군더더기 없이)
 *   ③ 「원본은 여기」(canonical)와 «얹히는 주소»를 헷갈리지 않는다
 *   ④ 화면이 사람에게 보여 주는 주소가 그 도메인이다
 *
 * 실행: node --test tests/*.test.js
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const R = path.join(__dirname, '..');
const 굳히개 = fs.readFileSync(path.join(R, 'scripts', 'freeze-homepage.js'), 'utf8');
const 화면 = fs.readFileSync(path.join(R, 'pu-home.html'), 'utf8');

/* 주석을 걷는다 — 주석에 적은 주소가 검사를 통과시키면 아무것도 안 지킨다 */
function 알맹이(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}
const 굳 = 알맹이(굳히개);
const 화 = 알맹이(화면);

test('★★★ 굳히개가 CNAME 을 만든다 — 없으면 도메인이 «조용히» 끊긴다', () => {
  assert.match(굳, /담기\(\s*['"]CNAME['"]/,
    '★★★ 굳히개가 CNAME 을 안 만든다 — 다시 굳히는 날 홈페이지가 통째로 404 가 된다');
});

test('★★★ CNAME 에 «주소 하나»만 들어간다 — 군더더기가 붙으면 깃허브가 못 읽는다', () => {
  const m = /const SITE_DOMAIN = ['"]([^'"]+)['"]/.exec(굳);
  assert.ok(m, '★★ 도메인을 한 자리에 안 두었다 — 여기저기 박으면 옮길 때 하나가 남는다');
  const d = m[1];
  assert.match(d, /^[a-z0-9.-]+\.[a-z]{2,}$/i,
    '★★★ 주소 모양이 아니다: 「' + d + '」 — https:// 나 뒤 빗금을 넣으면 안 된다');
  assert.ok(d.indexOf('/') < 0 && d.indexOf(':') < 0,
    '★★★ 빗금·콜론이 들어갔다 — 깃허브가 이 파일을 못 읽어 도메인이 안 붙는다');
  /* 파일에 «그 한 줄»만 담기는지 */
  const 담는줄 = /담기\(\s*['"]CNAME['"][^)]*\)/.exec(굳);
  assert.ok(담는줄, '★ CNAME 을 담는 줄을 못 찾았다');
  assert.ok(담는줄[0].indexOf('SITE_DOMAIN') > 0,
    '★★ 도메인을 그 자리에 «글자로» 박았다 — 한 자리(SITE_DOMAIN)에서 가져올 것');
});

test('★★ 「원본은 여기」와 «얹히는 주소»를 헷갈리지 않는다', () => {
  /* canonical(REAL_ORIGIN)은 아직 «옛 홈페이지»다. 얹히는 주소(SITE_DOMAIN)와 합치면,
     옛 홈페이지가 진짜인 동안에도 검색엔진이 이 사본을 원본으로 삼는다. */
  const real = /const REAL_ORIGIN = ['"]([^'"]+)['"]/.exec(굳);
  const site = /const SITE_DOMAIN = ['"]([^'"]+)['"]/.exec(굳);
  assert.ok(real && site, '★ 두 주소를 못 찾았다');
  assert.notEqual(real[1].replace(/^https?:\/\//, ''), site[1],
    '★★ 「원본은 여기」와 「얹히는 주소」가 같아졌다 — 옮길 때인지 확인할 것');
});

test('★★ 화면이 사람에게 보여 주는 주소가 «그 도메인»이다', () => {
  const site = /const SITE_DOMAIN = ['"]([^'"]+)['"]/.exec(굳)[1];
  const view = /const SITE_VIEW = ['"]([^'"]+)['"]/.exec(화);
  assert.ok(view, '★★ 화면에 «눌러 볼 주소»가 없다');
  assert.ok(view[1].indexOf(site) > 0,
    '★★ 화면이 옛 주소를 보여 준다 (' + view[1] + ') — 도메인을 옮겼으면 여기도 옮길 것');
});

test('★★★ «읽는 자리»는 도메인을 따라가지 않는다 — 도메인이 흔들려도 올리기는 돈다', () => {
  /* 2026-09-02 에 도메인이 붙자 읽는 길이 끊겨 올리기가 통째로 멎은 적이 있다.
     그 뒤로 읽는 자리는 저장소 원본(raw)이다. 여기가 도메인으로 되돌아가면 그 일이 되풀이된다. */
  const base = /const SITE_BASE = ['"]([^'"]+)['"]/.exec(화);
  assert.ok(base, '★ 읽는 자리를 못 찾았다');
  assert.match(base[1], /^https:\/\/raw\.githubusercontent\.com\/nabaho\//,
    '★★★ 읽는 자리가 도메인을 탄다 — 도메인이 흔들리면 올리기가 통째로 멎는다: ' + base[1]);
});
