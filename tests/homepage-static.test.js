'use strict';
/* 굳힌 홈페이지 사본(site/)이 지켜야 할 것 — 대표 지시 2026-08-31
   ═══════════════════════════════════════════════════════════════════════════
   「홈페이지가 외부로 나갈 경우 원래 있던 도메인으로 나가야 한다.
     나바호 깃허브로 나가면 안 된다」

   ★ 여기서 못 박는 것
     ① 「이 쪽의 진짜 주소」는 언제나 «우리 도메인»이다 — 임시 주소가 아니다.
        상대주소로 남으면 임시 주소가 «자기가 원본»이라고 검색엔진에 말한다.
     ② 미리보기 동안에는 검색에 안 잡힌다. 실제 운영용으로 굳히면 그 막음이 빠진다.
     ③ 쪽 사이 링크는 «상대주소»다 — 도메인을 옮겨도 고칠 것이 없어야 한다.
     ④ 방문자를 옛 사이트로 새 나가게 하지 않는다.
     ⑤ 부르는 자산이 실제로 있다 — 없으면 화면이 통째로 깨진다.
   실행: node --test tests/homepage-static.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const R = path.join(__dirname, '..');
const SITE = path.join(R, 'site');
const 진짜도메인 = 'https://푸른노무법인.kr';
const 옛도메인들 = [진짜도메인, 'https://xn--o80bs5mdnbm0bf80anms.kr'];

function 쪽들() {
  if (!fs.existsSync(SITE)) return [];
  const out = [];
  (function 훑기(dir) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach(e => {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) 훑기(p);
      else if (e.name === 'index.html') out.push(p);
    });
  })(SITE);
  return out;
}

const 쪽 = 쪽들();

test('굳힌 사본이 있다 (없으면 아래 검사가 아무것도 안 지킨다)', () => {
  assert.ok(쪽.length >= 10, '굳힌 쪽이 ' + 쪽.length + '개뿐이다 — freeze-homepage.js 를 돌렸는가');
});

test('★ 「이 쪽의 진짜 주소」는 언제나 «우리 도메인»이다 — 임시 주소가 원본 행세를 하면 안 된다', () => {
  쪽.forEach(p => {
    const h = fs.readFileSync(p, 'utf8');
    const m = /<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i.exec(h);
    const 이름 = path.relative(SITE, p);
    assert.ok(m, 이름 + ' — 진짜 주소(canonical)가 없다');
    assert.ok(m[1].indexOf(진짜도메인) === 0,
      '★ ' + 이름 + ' 의 진짜 주소가 우리 도메인이 아니다: ' + m[1]);
    /* og:url 도 같은 말을 해야 한다 — 카카오톡·페이스북에 뿌려지는 주소다 */
    const og = /<meta[^>]+property=["']og:url["'][^>]*content=["']([^"']+)["']/i.exec(h);
    if (og) {
      assert.ok(og[1].indexOf(진짜도메인) === 0,
        '★ ' + 이름 + ' 을 공유하면 엉뚱한 주소가 뿌려진다: ' + og[1]);
    }
  });
});

test('★ 미리보기 동안에는 검색에 안 잡힌다 — 진짜 홈페이지의 노출을 갉아먹지 않게', () => {
  쪽.forEach(p => {
    const h = fs.readFileSync(p, 'utf8');
    const 이름 = path.relative(SITE, p);
    const 미리보기 = /굳힌 사본 \(미리보기용/.test(h);
    const 막음 = /<meta[^>]+name=["']robots["'][^>]*noindex/i.test(h);
    /* ★ 값을 박지 않는다 — «스스로 무엇이라 말하는지»와 «실제 행동»이 같은지만 본다.
       실제 운영용으로 굳히면(--live) 막음이 빠지는 것이 맞다. */
    assert.equal(막음, 미리보기,
      미리보기 ? '★ ' + 이름 + ' 이 미리보기인데 검색을 막지 않았다'
               : '★ ' + 이름 + ' 이 운영용인데 검색을 막고 있다 — 홈페이지가 검색에서 사라진다');
  });
});

test('★ 쪽 사이 링크는 «상대주소»다 — 도메인을 옮길 때 고칠 것이 없어야 한다', () => {
  쪽.forEach(p => {
    const h = fs.readFileSync(p, 'utf8');
    const 이름 = path.relative(SITE, p);
    /* 머리띠 메뉴가 뿌리 절대주소(/people)로 남아 있으면,
       임시 주소에서는 깃허브 뿌리로 튀어 「없는 쪽」이 뜬다. */
    const 뿌리링크 = [...h.matchAll(/href="\/(?!\/)[^"]*"/g)].map(m => m[0]);
    assert.deepEqual(뿌리링크, [],
      '★ ' + 이름 + ' 에 뿌리 절대주소가 남아 있다: ' + 뿌리링크.slice(0, 3).join(' '));
  });
});

test('★ 방문자를 «옛 사이트»로 새 나가게 하지 않는다', () => {
  쪽.forEach(p => {
    const h = fs.readFileSync(p, 'utf8');
    const 이름 = path.relative(SITE, p);
    /* 진짜 주소(canonical·og:url)로 적는 것은 맞다 — 그 두 줄은 빼고 본다 */
    const 본문 = h.replace(/<link[^>]+rel=["']canonical["'][^>]*>/gi, ' ')
                  .replace(/<meta[^>]+property=["']og:[^>]*>/gi, ' ');
    옛도메인들.forEach(d => {
      const 샘 = [...본문.matchAll(new RegExp('(?:src|href)="' + d.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[^"]*"', 'g'))];
      assert.equal(샘.length, 0,
        '★ ' + 이름 + ' 이 방문자를 옛 사이트로 보낸다: ' + (샘[0] ? 샘[0][0] : ''));
    });
  });
});

test('★ 부르는 자산이 실제로 있다 — 없으면 화면이 통째로 깨진다', () => {
  const 없는것 = [];
  쪽.forEach(p => {
    const h = fs.readFileSync(p, 'utf8');
    const 여기 = path.dirname(p);
    [...h.matchAll(/(?:src|href)="((?:\.\.\/|\.\/)[^"]+)"/g)].forEach(m => {
      const u = m[1].split('?')[0].split('#')[0];
      if (!u || u.endsWith('/')) return;          // 쪽으로 가는 길은 폴더다
      const 자리 = path.resolve(여기, decodeURIComponent(u));
      if (!fs.existsSync(자리)) 없는것.push(path.relative(SITE, p) + ' → ' + u);
    });
  });
  assert.deepEqual(없는것.slice(0, 5), [],
    '★ 부르는데 없는 파일이 ' + 없는것.length + '개다 (화면이 깨진다)');
});

/* ══════ 잔뼈 — 없으면 «나중에» 아픈 것들 ══════ */

test('★ .nojekyll 이 있다 — 없으면 밑줄(_)로 시작하는 파일이 통째로 사라진다', () => {
  /* 깃허브는 올린 쪽을 «지킬(Jekyll)»로 한 번 더 굽는다. 굽게 두면 밑줄 파일·폴더가
     사라지고, 굽다가 멎으면 홈페이지가 통째로 안 올라간다. 지금은 밑줄 파일이 없지만
     «나중에 생기면» 그날 홈페이지가 조용히 반쪽이 된다. */
  assert.ok(fs.existsSync(path.join(SITE, '.nojekyll')), '★ .nojekyll 이 없다');
});

test('★ 404 쪽이 «한국어»로 있고, 홈페이지 모양을 그대로 쓴다', () => {
  const p = path.join(SITE, '404.html');
  assert.ok(fs.existsSync(p), '★ 404 쪽이 없다 — 깃허브의 영어 404 가 뜬다');
  const h = fs.readFileSync(p, 'utf8');
  assert.match(h, /찾으시는 쪽이 없습니다/, '한국어 안내가 없다');
  /* 머리띠·발이 그대로 있어야 «홈페이지처럼» 보인다 */
  ['footer', '041-556-0035'].forEach(표시 =>
    assert.ok(h.indexOf(표시) > 0, '★ 404 쪽에 홈페이지 틀(' + 표시 + ')이 없다'));
  /* 갈 곳을 준다 — 막다른 길로 두지 않는다 */
  assert.match(h, /홈으로 돌아가기/, '★ 돌아갈 길이 없다');
  assert.ok((h.match(/href="\/[a-z0-9_]+\//g) || []).length >= 5,
    '★ 다른 쪽으로 가는 길이 거의 없다');
});

test('★ robots.txt 와 쪽의 검색 차단이 «같은 말»을 한다', () => {
  const p = path.join(SITE, 'robots.txt');
  assert.ok(fs.existsSync(p), '★ robots.txt 가 없다');
  const r = fs.readFileSync(p, 'utf8');
  const 어느쪽 = 쪽[0];
  const 미리보기 = /굳힌 사본 \(미리보기용/.test(fs.readFileSync(어느쪽, 'utf8'));
  /* ★ 값을 박지 않는다 — 「미리보기면 막고, 운영용이면 연다」가 규칙이다.
     둘이 어긋나면(쪽은 막는데 robots 는 열려 있거나) 어느 쪽이 참인지 모르게 된다. */
  if (미리보기) {
    assert.match(r, /Disallow: \//, '★ 미리보기인데 robots 가 열려 있다');
  } else {
    assert.match(r, /Allow: \//, '★ 운영용인데 robots 가 막고 있다 — 검색에서 통째로 사라진다');
    assert.match(r, /Sitemap:/, '운영용이면 sitemap 자리를 알려야 한다');
  }
});

test('★ sitemap 에 굳힌 쪽이 «다» 들어 있고, 주소가 우리 도메인이다', () => {
  const p = path.join(SITE, 'sitemap.xml');
  assert.ok(fs.existsSync(p), '★ sitemap.xml 이 없다');
  const x = fs.readFileSync(p, 'utf8');
  const 적힌것 = [...x.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  assert.equal(적힌것.length, 쪽.length,
    '★ 굳힌 쪽은 ' + 쪽.length + '개인데 sitemap 에는 ' + 적힌것.length + '개다');
  적힌것.forEach(u => assert.ok(u.indexOf(진짜도메인) === 0,
    '★ sitemap 에 우리 도메인이 아닌 주소가 있다: ' + u));
});
