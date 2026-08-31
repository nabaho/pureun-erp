'use strict';
/* 홈페이지 올리기 — «아무 파일이나» 올라가면 안 된다.
   ═══════════════════════════════════════════════════════════════════════════
   대표 결정 2026-08-31: 「나」 — 단추를 누를 때만 올린다.

   ★ 여기가 이 기능에서 가장 위험한 자리다.
     화면에서 부르는 서버 함수가 저장소에 파일을 쓴다. 자리를 넓게 열어 두면
     앱 코드·검사·보안규칙·배포 워크플로까지 «화면에서» 갈아 끼울 수 있게 된다.
     그래서 site/ 아래 .html «만» 받는다.

   ★ 값을 박지 않고 «규칙»을 본다 — 올려도 되는 것은 되고, 안 되는 것은 안 되는가.
   실행: node --test tests/site-publish.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const R = path.join(__dirname, '..');
const S = require(path.join(R, 'functions', 'site-publish.js'));

test('★ 홈페이지 쪽은 올릴 수 있다', () => {
  ['site/index.html',
   'site/people/index.html',
   'site/notice/139/index.html',
   'site/work5a/index.html'].forEach(p => {
    assert.equal(S.올릴자리인가(p), true, '올려야 할 자리를 막았다: ' + p);
  });
});

test('★ 홈페이지 «밖»은 못 올린다 — 앱 코드·검사·보안규칙·배포가 여기로 뚫리면 안 된다', () => {
  ['pu-home.html',                      // 앱 화면
   'pu-cards.html',
   'index.html',                        // 저장소 뿌리
   'js/pu-home-fill.js',                // 부품
   'tests/site-publish.test.js',        // 검사 — 막는 것을 스스로 지울 수 있으면 안 된다
   'functions/index.js',                // 서버
   '.github/workflows/deploy.yml',      // 배포
   'firebase.json',
   'database.rules.json',
   'site/README.md',                    // .html 이 아니다
   'site/people/index.php',
   'site/people/index.js'
  ].forEach(p => {
    assert.equal(S.올릴자리인가(p), false, '★ 여기에 쓸 수 있으면 안 된다: ' + p);
  });
});

test('★ 빠져나가는 수를 막는다 — 상위 이동·빗금 두 개·역슬래시·인코딩', () => {
  ['site/../pu-home.html',
   'site/./../../etc/passwd',
   'site//people/index.html',
   'site\\people\\index.html',
   'site/people/%2e%2e/index.html',
   'site/people/index.html?x=1',
   'site/people/index.html#a',
   'https://남의곳/site/index.html',
   '/site/people/index.html',
   'SITE/people/index.html',            // 대문자로 규칙을 비켜 가려는 것
   '',
   null,
   undefined,
   'site/' + 'a/'.repeat(40) + 'index.html'   // 너무 깊은 자리
  ].forEach(p => {
    assert.equal(S.올릴자리인가(p), false, '★ 빠져나갔다: ' + String(p).slice(0, 60));
  });
});

test('★ 올리는 사연에 «누가·무엇을»이 남는다 — 나중에 되짚을 유일한 실마리다', () => {
  const m = S.사연('권형하', 'site/people/index.html', '구성원 9명');
  assert.match(m, /site\/people\/index\.html/, '무엇을 올렸는지 안 적었다');
  assert.match(m, /권형하/, '누가 올렸는지 안 적었다');
  assert.match(m, /손으로 고치지 마십시오/, '손으로 고치면 덮인다는 경고가 없다');
  /* 줄바꿈을 넣어 이력을 어지럽히지 못하게 한다 */
  const 장난 = S.사연('권형하\n\n가짜 줄', 'site/index.html', '가\r\n나');
  assert.equal(장난.split('\n').filter(l => l.indexOf('가짜 줄') >= 0).length, 1,
    '★ 이름에 줄바꿈을 넣어 이력을 꾸밀 수 있다');
});

test('★ 크기 한도가 있다 — 실수 한 번으로 저장소에 수십 MB 가 들어가면 안 된다', () => {
  assert.ok(S.MAX_BYTES > 100 * 1024, '굳힌 쪽 하나(20~50KB)도 못 올릴 만큼 빡빡하다');
  assert.ok(S.MAX_BYTES <= 5 * 1024 * 1024, '★ 한도가 너무 헐겁다');
});

test('★ 지금 있는 파일을 갈아 끼울 때는 «본 그것»의 sha 를 함께 보낸다 — 남이 고친 것을 안 덮게', async () => {
  const 부른것 = [];
  const 가짜 = async (token, route, options) => {
    부른것.push({ route: route, method: (options && options.method) || 'GET',
                  body: options && options.body });
    if (!options) return { sha: 'OLDSHA' };          // 지금 있는 것을 읽는 호출
    return { commit: { sha: 'NEWSHA' } };
  };
  await S.올리기(가짜, 'T', 'nabaho/pureunall', 'site/people/index.html', '<html>새것</html>', '사연');
  assert.equal(부른것.length, 2, '읽고 쓰는 두 걸음이어야 한다');
  assert.equal(부른것[0].method, 'GET', '먼저 지금 있는 것을 읽어야 한다');
  const 보낸것 = JSON.parse(부른것[1].body);
  assert.equal(보낸것.sha, 'OLDSHA',
    '★ 본 그것의 sha 를 안 보냈다 — 그 사이 남이 고친 것을 조용히 덮는다');
  assert.equal(Buffer.from(보낸것.content, 'base64').toString('utf8'), '<html>새것</html>');
});

test('★ 처음 올리는 파일이면 sha 없이 올린다 — 없는 것을 읽다 멈추면 안 된다', async () => {
  const 부른것 = [];
  const 가짜 = async (token, route, options) => {
    if (!options) { const e = new Error('Not Found'); e.status = 404; throw e; }
    부른것.push(JSON.parse(options.body));
    return { commit: { sha: 'NEW' } };
  };
  await S.올리기(가짜, 'T', 'nabaho/pureunall', 'site/새쪽/index.html', '<html>처음</html>', '사연');
  assert.equal(부른것.length, 1);
  assert.equal('sha' in 부른것[0], false, '★ 없는 파일에 sha 를 붙여 보냈다');
});

/* ══════ 그림 올리기 (대표 지시 2026-08-31 「다음」) ══════
   ★ 새 자문사 로고를 넣으려면 그림을 올려야 한다. 여기가 «두 번째로 위험한» 자리다 —
     글자만 받던 통로가 이제 아무 바이트나 받게 된다.
   ★ 그래서 자리를 «아주 좁게» 연다: site/files/logo/ 아래 그림 한 겹만. */

test('★ 로고 그림은 올릴 수 있다', () => {
  ['site/files/logo/wookwang.png',
   'site/files/logo/a-b_1.svg',
   'site/files/logo/x.jpg',
   'site/files/logo/x.jpeg',
   'site/files/logo/x.webp'].forEach(p => {
    assert.equal(S.올릴그림자리인가(p), true, '올려야 할 그림을 막았다: ' + p);
  });
});

test('★ 그림 자리 밖에는 못 올린다 — 글자 통로보다 «더» 좁아야 한다', () => {
  ['site/people/index.html',        // 쪽은 그림 통로로 올리면 안 된다
   'site/files/x.png',              // 로고 칸 밖
   'site/files/logo/깊은/x.png',    // 한 겹만
   'site/files/logo/x.php',
   'site/files/logo/x.html',
   'site/files/logo/x.js',
   'site/files/logo/x.svgz',
   'files/logo/x.png',
   'site/files/logo/../../pu-home.html',
   'site/files/logo/x.png?a=1',
   'SITE/files/logo/x.png',
   'site/files/logo/x.PNG',         // 대문자로 규칙을 비켜 가려는 것
   ''].forEach(p => {
    assert.equal(S.올릴그림자리인가(p), false, '★ 여기에 그림을 쓸 수 있으면 안 된다: ' + p);
  });
});

test('★ 두 통로가 «서로 넘나들지» 않는다 — 쪽 자리에 그림, 그림 자리에 쪽', () => {
  assert.equal(S.올릴자리인가('site/files/logo/x.png'), false,
    '★ 그림을 «쪽 통로»로 올릴 수 있다');
  assert.equal(S.올릴그림자리인가('site/people/index.html'), false,
    '★ 쪽을 «그림 통로»로 올릴 수 있다');
});

test('★ 그림 한도는 쪽 한도보다 «작다» — 사진기 원본이 그대로 들어오면 저장소가 부푼다', () => {
  assert.ok(S.MAX_IMAGE_BYTES < S.MAX_BYTES, '★ 그림 한도가 쪽 한도보다 헐겁다');
  assert.ok(S.MAX_IMAGE_BYTES >= 100 * 1024, '홈페이지 로고(5~70KB)도 못 올릴 만큼 빡빡하다');
  assert.ok(S.MAX_IMAGE_BYTES <= 1024 * 1024, '★ 한도가 너무 헐겁다');
});

test('★ 그림은 «다시 감싸지» 않는다 — 감싸면 글자가 그대로 파일이 되어 그림이 깨진다', async () => {
  const 보낸것 = [];
  const 가짜 = async (token, route, options) => {
    if (!options) { const e = new Error("Not Found"); e.status = 404; throw e; }
    보낸것.push(JSON.parse(options.body));
    return { commit: { sha: "NEW" } };
  };
  const 그림base64 = Buffer.from('가짜 그림 바이트').toString('base64');
  await S.올리기(가짜, 'T', 'r', 'site/files/logo/x.png', 그림base64, '사연', true);
  assert.equal(보낸것[0].content, 그림base64,
    '★ 이미 base64 인 그림을 다시 감쌌다 — 그림이 깨진다');

  보낸것.length = 0;
  await S.올리기(가짜, 'T', 'r', 'site/people/index.html', '<html>글</html>', '사연');
  assert.equal(Buffer.from(보낸것[0].content, 'base64').toString('utf8'), '<html>글</html>',
    '글자는 감싸서 보내야 한다');
});
