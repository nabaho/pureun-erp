/* 「명함첩」 → 「기업정보함」 이름 바꾸기 (2026-08-26 대표 지시)
 *
 * 규칙: **화면에 옛 이름이 남으면 안 된다.**
 * 한 곳만 남아도 대표는 「여기만 왜 옛 이름이지」 하고 같은 것을 두 가지로 배운다.
 *
 * ⚠ 이 검사는 파일 목록을 «그때그때 훑는다» — 새 화면이 생겨도 자동으로 걸린다.
 *   목록을 여기 못 박으면 새 파일에 옛 이름이 들어와도 초록이다.
 * ⚠ docs/ 의 지난 계획서·설계서는 «그때의 기록»이라 보지 않는다.
 * ⚠ 「명함」(카드 한 장)은 그대로 쓰는 낱말이다 — 바뀐 것은 「명함첩」 세 글자뿐이다.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
/* 옛 이름을 조각으로 만든다 — 이 검사 파일이 나중에 일괄치환에 휩쓸리지 않게. */
const OLD = '명함' + '첩';
const NEW = '기업정보함';

function appFiles() {
  const out = [];
  fs.readdirSync(ROOT).forEach(function (f) {
    if (/\.html$/.test(f)) out.push(f);
    if (/^[^.]*manifest[^.]*\.json$/.test(f)) out.push(f);
    if (/-sw\.js$/.test(f) || f === 'firebase-messaging-sw.js') out.push(f);
  });
  fs.readdirSync(path.join(ROOT, 'js')).forEach(function (f) {
    if (/\.js$/.test(f)) out.push('js/' + f);
  });
  fs.readdirSync(path.join(ROOT, 'functions')).forEach(function (f) {
    if (/\.js$/.test(f)) out.push('functions/' + f);
  });
  return out;
}

test('앱 화면 어디에도 옛 이름이 남아 있지 않다', () => {
  const files = appFiles();
  assert.ok(files.length > 30, '훑을 파일을 못 찾았다 — 검사가 헛돌고 있다 (' + files.length + '개)');
  const left = [];
  files.forEach(function (rel) {
    const s = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const n = s.split(OLD).length - 1;
    if (n) left.push(rel + ' (' + n + '곳)');
  });
  assert.deepStrictEqual(left, [], '옛 이름이 남았다:\n  ' + left.join('\n  '));
});

test('훑는 범위에 정말 큰 화면들이 들어간다', () => {
  const files = appFiles();
  ['pu-cards.html', 'pu-erp.html', 'pu-photos.html', 'work.html', 'js/pu-doc-file.js']
    .forEach(function (f) {
      assert.ok(files.indexOf(f) >= 0, f + ' 이 훑는 범위에서 빠졌다');
    });
});

test('기업정보함 화면 자신이 새 이름을 쓴다', () => {
  const html = fs.readFileSync(path.join(ROOT, 'pu-cards.html'), 'utf8');
  const t = /<title>([^<]*)<\/title>/.exec(html);
  assert.ok(t, '<title> 이 없다');
  assert.ok(t[1].indexOf(NEW) >= 0, '제목이 새 이름이 아니다: ' + t[1]);

  const mf = JSON.parse(fs.readFileSync(path.join(ROOT, 'pu-cards-manifest.json'), 'utf8'));
  assert.ok(String(mf.name).indexOf(NEW) >= 0, 'manifest name 이 새 이름이 아니다: ' + mf.name);
  assert.ok(String(mf.short_name).indexOf(NEW) >= 0, 'manifest short_name 이 새 이름이 아니다: ' + mf.short_name);
});

test('푸른이알피가 그 화면을 부르는 말도 새 이름이다', () => {
  const erp = fs.readFileSync(path.join(ROOT, 'pu-erp.html'), 'utf8');
  assert.ok(erp.split(NEW).length - 1 > 50,
    '푸른이알피에서 새 이름이 너무 적게 쓰인다 — 옛 이름 자리가 통째로 지워진 것은 아닌지');
});
