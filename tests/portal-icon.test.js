/* 「푸른 포털」 홈 화면 아이콘 (대표 지시 2026-08-24 「디자인 바꿔줘 너무 촌스럽다」)

   ★ 무엇이 촌스러웠나 — 이모지 🏠 를 흰 바탕에 박아 둔 것이었다.
     푸른 ERP 본 아이콘(icon-192.png)은 「푸」 마크인데 포털만 이모지라
     한 회사 아이콘 묶음 안에서 이것만 겉돌았다.
     게다가 바탕이 가장자리까지 안 차 있어, 안드로이드가 흰 접시 위에 얹어 놓았다.

   ★ 이 검사가 못 박는 것은 «어떤 그림인가» 가 아니라 —
     ① 이모지로 때우지 않는다 (기기마다 다른 그림이 나온다)
     ② 다시 그릴 수 있다 — 만드는 셈이 저장소에 남아 있다
     ③ 가장자리까지 찬 그림이라고 알려 준다(maskable) — 안 그러면 흰 접시가 생긴다
     ④ 저장소에 «올라가 있다» — .gitignore 의 *.png 에 막히면 배포된 화면에서 404 다
   ⚠ 색·획 자리는 안 박는다. 그것은 언제든 다듬을 수 있어야 하는 «취향» 이다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const mf = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const enter = fs.readFileSync(path.join(ROOT, 'enter.html'), 'utf8');

test('★ 포털 아이콘은 이모지가 아니다 — 기기마다 다른 그림이 나온다', () => {
  /* 창 아이콘(favicon)까지 봐야 한다. 홈 화면만 고치면 브라우저 탭은 그대로 이모지다. */
  /* ⚠ [^>]* 로 자르면 안 된다 — 그림이 data:image/svg+xml 이라 «값 안에» < > 가 있다.
     따옴표 사이를 통째로 집어야 한다(이 함정에 한 번 걸렸다). */
  const fav = enter.match(/<link rel="icon" href="([^"]*)"/);
  assert.ok(fav, '창 아이콘을 찾지 못했습니다');
  assert.doesNotMatch(fav[1], /<text/,
    '★ 이모지를 글자로 박으면 기기·브라우저마다 다른 그림이 나옵니다.');
  assert.match(fav[1], /<rect/, '획으로 그린 그림이어야 합니다.');
});

test('★ 다시 그릴 수 있어야 한다 — 만드는 셈이 저장소에 남아 있다', () => {
  /* 그림 파일만 있고 만든 방법이 없으면, 다음 사람은 «고칠» 수가 없어 새로 그린다.
     그러면 아이콘 묶음이 또 갈라진다. */
  const mk = path.join(ROOT, 'scripts', 'make-portal-icon.js');
  assert.ok(fs.existsSync(mk), '★ scripts/make-portal-icon.js 가 없습니다.');
  const src = fs.readFileSync(mk, 'utf8');
  assert.match(src, /icon-portal-192\.png/);
  assert.match(src, /icon-portal-512\.png/);
});

test('★ 가장자리까지 찬 그림이라고 알려 준다 — 안 그러면 흰 접시 위에 얹힌다', () => {
  (mf.icons || []).forEach(function (i) {
    assert.match(String(i.purpose || ''), /maskable/,
      '★ ' + i.src + ' 가 maskable 이 아니면 안드로이드가 흰 접시를 깔고 그림을 줄입니다.');
  });
});

test('★ 아이콘 파일이 저장소에 올라가 있다 — .gitignore 의 *.png 에 막히면 404 다', () => {
  /* 2026-08-21 메일 아이콘에서 실제로 겪은 일이다. 파일은 내 컴퓨터에 있는데
     배포된 화면에서는 안 뜬다 — 그때는 까닭을 찾는 데 한참 걸렸다. */
  (mf.icons || []).forEach(function (i) {
    assert.ok(fs.existsSync(path.join(ROOT, i.src)), '아이콘 파일이 없습니다: ' + i.src);
    let tracked = true;
    try {
      cp.execFileSync('git', ['ls-files', '--error-unmatch', i.src], { cwd: ROOT, stdio: 'ignore' });
    } catch (e) { tracked = false; }
    assert.ok(tracked, '★ ' + i.src + ' 이 저장소에 없습니다 — `!' + i.src + '` 를 .gitignore 에 더해 주세요.');
  });
});

test('포털 아이콘은 다른 앱 아이콘과 «다른 그림» 이다', () => {
  /* 홈 화면에 아이콘을 여럿 두는 목적이 「한눈에 찾기」다. 같은 그림이면 값어치가 없다. */
  const mine = fs.readFileSync(path.join(ROOT, 'icon-portal-192.png'));
  ['icon-192.png', 'icon-mail-192.png', 'icon-cards-192.png', 'icon-erp-192.png']
    .filter(function (f) { return fs.existsSync(path.join(ROOT, f)); })
    .forEach(function (f) {
      assert.ok(!mine.equals(fs.readFileSync(path.join(ROOT, f))),
        '★ ' + f + ' 와 같은 그림입니다 — 홈 화면에서 구별이 안 됩니다.');
    });
});
