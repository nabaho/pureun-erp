'use strict';
/* 판독을 서버로 — 열쇠를 브라우저에서 없앤다 (대표 지시 2026-08-17)

   ⚠ 왜: 판독 열쇠가 실시간DB(`pucards/config/geminiKey`)에 평문으로 있고 규칙상
     **로그인한 모든 직원이 읽는다.** 꺼내 개인 용도로 써도 요금은 회사에 붙는다.
     게다가 `AQ.` 로 시작하는 AI 스튜디오 열쇠라 구글 API 키 목록에 없어
     **자물쇠(웹사이트 제한)를 채울 방법도 없다**(2026-08-17 확인).
     브라우저에 두는 한 반드시 샌다.

   여기서는 **글자 찾기가 아니라 실제로 돌려서** 확인한다 —
   「서버가 붙었을 때 열쇠를 한 번도 안 만진다」가 이 고침의 존재 이유라서,
   그 사실 자체를 못 박는다. (오늘까지 「낱말이 있나」식 검사가 주석·죽은
   문자열·딴 구역의 같은 낱말에 네 번 속았다.) */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');
const DR = require(path.join(R, 'functions', 'doc-read.js'));

/* ── 브라우저 판독 층을 가짜 세상에 올린다 ── */
function loadClient() {
  const src = fs.readFileSync(path.join(R, 'js', 'pu-doc-read.js'), 'utf8');
  const ctx = { console, setTimeout, Promise, JSON, Math, Date, String, Number, Array, Object, Error };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return ctx.PuDocRead;
}

function reply(text) {
  return { candidates: [{ content: { parts: [{ text: text }] } }] };
}
const GOOD = JSON.stringify({ kind: 'card', fields: { name: '홍길동' }, pairs: [] });

/* ══════ ① 브라우저 — 서버가 있으면 열쇠를 안 만진다 ══════ */
test('브라우저는 열쇠를 모른다', async (t) => {
  await t.test('★ 서버 대리인이 붙으면 열쇠를 한 번도 안 가져온다', async () => {
    const P = loadClient();
    let keyAsked = 0;
    const calls = [];
    P.init({
      fetch: function (url, init) {
        calls.push({ url: url, init: init });
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, reply: reply(GOOD) }) });
      },
      getKey: function () { keyAsked++; return Promise.resolve('AQ.비밀열쇠'); },
      readDocUrl: 'https://srv/readDoc',
      getToken: function () { return Promise.resolve('토큰'); },
      delay: (f) => f()
    });
    const out = await P.read('data:image/jpeg;base64,QUJD');
    assert.equal(out.kind, 'card', '판독이 안 됐습니다: ' + JSON.stringify(out));
    assert.equal(keyAsked, 0, '열쇠를 가져왔습니다 — 브라우저에 열쇠가 남으면 고친 뜻이 없습니다.');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://srv/readDoc', '구글을 직접 불렀습니다.');
  });

  await t.test('★ 구글 주소를 브라우저가 직접 부르지 않는다', async () => {
    const P = loadClient();
    const urls = [];
    P.init({
      fetch: function (url) {
        urls.push(String(url));
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, reply: reply(GOOD) }) });
      },
      getKey: () => Promise.resolve('AQ.비밀열쇠'),
      readDocUrl: 'https://srv/readDoc',
      getToken: () => Promise.resolve('토큰'),
      delay: (f) => f()
    });
    await P.read('data:image/jpeg;base64,QUJD');
    assert.ok(!urls.some((u) => /generativelanguage/.test(u)),
      '브라우저가 구글을 직접 부릅니다: ' + urls.join(', '));
  });

  await t.test('★ 보낸 몸통에 열쇠가 안 섞인다', async () => {
    const P = loadClient();
    let body = '';
    P.init({
      fetch: function (url, init) {
        body = String((init && init.body) || '');
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, reply: reply(GOOD) }) });
      },
      getKey: () => Promise.resolve('AQ.비밀열쇠'),
      readDocUrl: 'https://srv/readDoc',
      getToken: () => Promise.resolve('토큰'),
      delay: (f) => f()
    });
    await P.read('data:image/jpeg;base64,QUJD');
    assert.ok(body.indexOf('AQ.비밀열쇠') < 0, '몸통에 열쇠가 실려 나갔습니다.');
  });

  await t.test('로그인 증명을 붙여 보낸다 — 없으면 서버가 막는다', async () => {
    const P = loadClient();
    let auth = '';
    P.init({
      fetch: function (url, init) {
        auth = String(((init || {}).headers || {}).Authorization || '');
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, reply: reply(GOOD) }) });
      },
      readDocUrl: 'https://srv/readDoc',
      getToken: () => Promise.resolve('토큰'),
      delay: (f) => f()
    });
    await P.read('data:image/jpeg;base64,QUJD');
    assert.equal(auth, 'Bearer 토큰');
  });

  await t.test('서버가 없으면 옛 길로 돈다 — 옮기는 동안 판독이 멈추면 안 된다', async () => {
    const P = loadClient();
    let keyAsked = 0;
    const urls = [];
    P.init({
      fetch: function (url) {
        urls.push(String(url));
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(reply(GOOD)) });
      },
      getKey: function () { keyAsked++; return Promise.resolve('AQ.비밀열쇠'); },
      delay: (f) => f()
      // readDocUrl·getToken 없음
    });
    const out = await P.read('data:image/jpeg;base64,QUJD');
    assert.equal(out.kind, 'card');
    assert.equal(keyAsked, 1, '옛 길에서는 열쇠를 가져와야 합니다.');
    assert.ok(urls.some((u) => /generativelanguage/.test(u)));
  });

  await t.test('★ 토큰을 못 얻으면 옛 길로 돌지 않는다 — 조용히 새면 안 된다', async () => {
    /* 토큰이 없다고 옛 길로 돌아가면, 로그인이 잠깐 흔들릴 때마다 열쇠가
       브라우저로 내려온다. 차라리 판독을 실패시키고 이유를 말한다. */
    const P = loadClient();
    let keyAsked = 0;
    P.init({
      fetch: () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, reply: reply(GOOD) }) }),
      getKey: function () { keyAsked++; return Promise.resolve('AQ.비밀열쇠'); },
      readDocUrl: 'https://srv/readDoc',
      getToken: () => Promise.resolve(''),
      delay: (f) => f()
    });
    const out = await P.read('data:image/jpeg;base64,QUJD');
    assert.equal(keyAsked, 0, '토큰이 없다고 열쇠를 가져오면 구멍이 그대로입니다.');
    assert.ok(out.error, '실패했으면 이유를 말해야 합니다.');
  });

  await t.test('★ 서버가 준 상태 숫자를 그대로 살린다', async () => {
    /* 429(잠시 바쁨)·403(열쇠 문제)에 따라 위쪽 판단이 갈린다. 뭉개면 그 판단이 죽는다.
       ⚠ 글로만 보면 못 잡는다 — 오류 글은 상태를 지워도 그대로 남는다(실제로
         이 뮤테이션이 살아남았다). **던져진 것에 status 가 붙었는지**를 본다.
         readPairsWith·read 는 실패를 글로 감싸 버리므로 안쪽을 직접 두드린다. */
    const P = loadClient();
    let seen = null;
    P.init({
      fetch: () => Promise.resolve({
        ok: false, status: 429,
        json: () => Promise.resolve({ ok: false, error: 'AI가 잠시 바쁩니다', status: 429 })
      }),
      readDocUrl: 'https://srv/readDoc',
      getToken: () => Promise.resolve('토큰'),
      delay: (f) => f()
    });
    /* 판독 층 안쪽(askProxy)이 던지는 오류를 잡아 status 를 확인한다 */
    const inner = P._askProxyForTest;
    assert.equal(typeof inner, 'function', '안쪽을 확인할 길이 없습니다.');
    try {
      await inner([{ inline_data: { mime_type: 'image/jpeg', data: 'QUJD' } }]);
      assert.fail('실패해야 하는데 성공했습니다.');
    } catch (e) { seen = e; }
    assert.equal(seen.status, 429,
      '상태 숫자를 뭉개면 「잠시 뒤 다시」와 「곧바로 포기」를 못 가립니다.');

    const out = await P.read('data:image/jpeg;base64,QUJD');
    assert.match(out.error, /잠시 바쁩니다/);
  });
});

/* ══════ ② 서버 — 실제로 돌려서 확인한다 ══════ */
test('서버 대리인', async (t) => {
  const parts = [{ inline_data: { mime_type: 'image/jpeg', data: 'QUJD' } }, { text: '읽어라' }];

  await t.test('★ 보낼 것이 아무것도 없으면 구글을 부르기 전에 돌려보낸다', () => {
    /* 부르는 만큼이 그대로 요금이다 — 빈 요청은 여기서 끝낸다. */
    assert.equal(DR.validate(null).ok, false);
    assert.equal(DR.validate({ parts: [] }).ok, false);
    assert.equal(DR.validate({ parts: [{ text: '   ' }] }).ok, false, '빈칸만 보내는 것도 빈 요청입니다');
    assert.equal(DR.validate({ parts: [{ inline_data: { data: '' } }] }).ok, false, '빈 사진도 사진이 아닙니다');
  });

  await t.test('★ «글자만» 보내는 것도 옳은 길이다 — 글자 있는 PDF 는 그림 없이 읽는다', () => {
    /* ⚠ 2026-08-17 에 이 대리인을 만들 때는 판독이 늘 그림이었다. 그래서
       「사진이 한 장도 없으면 돌려보낸다」였다. 2026-08-24 에 「글자 있는 PDF 는
       글자로」가 들어오면서 글자만 담은 요청이 생겼는데, 여기서 되돌려보내
       **그 길이 한 번도 성공한 적이 없었다**(대표 보고 2026-08-26). */
    const v = DR.validate({ parts: [{ text: '사업자등록증명\n상호 주식회사 대원유지\n사업자등록번호 312-86-35425' }] });
    assert.equal(v.ok, true, '★ 글자만 보내면 「사진이 없습니다」로 되돌아갑니다 — PDF 판독이 통째로 막힙니다');
  });

  await t.test('너무 큰 요청은 받지 않는다', () => {
    const big = [{ inline_data: { mime_type: 'image/jpeg', data: 'A'.repeat(DR.MAX_BODY_BYTES + 10) } }];
    assert.equal(DR.validate({ parts: big }).ok, false);
    /* 글자가 너무 많을 때도 막는다 — 그때는 「사진이 크다」고 하면 거짓말이다 */
    const longText = DR.validate({ parts: [{ text: '가'.repeat(DR.MAX_BODY_BYTES) }] });
    assert.equal(longText.ok, false);
    assert.match(longText.error, /글자가 너무 많습니다/, '글자인데 「사진이 크다」고 합니다: ' + longText.error);
  });

  await t.test('제대로 된 요청은 통과한다', () => {
    assert.equal(DR.validate({ parts: parts }).ok, true);
  });

  await t.test('★ 구글에 보내는 몸통이 브라우저가 만들던 것과 같다', () => {
    /* temperature 0 이 빠지면 같은 사진에 다른 답이 나온다 */
    const b = DR.geminiBody(parts);
    assert.equal(b.generationConfig.temperature, 0);
    assert.deepEqual(b.contents[0].parts, parts);
  });

  /* 2026-08-17 — 경력관리가 긴 증명서를 읽을 때 답 길이를 1500 으로 지정한다.
     안 받으면 답이 잘리고, 통째로 받으면 부르는 쪽이 마음대로 키울 수 있다(=요금).
     그래서 **적힌 값만, 위를 막아** 받는다. */
  await t.test('★ 부르는 쪽이 정한 답 길이를 받아 넘긴다', () => {
    const v = DR.validate({ parts: parts, generationConfig: { maxOutputTokens: 1500 } });
    assert.equal(v.ok, true);
    const b = DR.geminiBody(v.parts, v.cfg);
    assert.equal(b.generationConfig.maxOutputTokens, 1500,
      '길이 지정이 사라졌습니다 — 긴 증명서에서 답이 잘립니다.');
    assert.equal(b.generationConfig.temperature, 0, 'temperature 0 이 빠졌습니다.');
  });

  await t.test('★ 답 길이를 마음대로 키우지 못한다 — 낸 만큼이 요금이다', () => {
    const b = DR.geminiBody(parts, { maxOutputTokens: 9999999 });
    assert.equal(b.generationConfig.maxOutputTokens, DR.MAX_OUTPUT_TOKENS,
      '한도를 넘겼습니다(' + b.generationConfig.maxOutputTokens + ') — 부르는 쪽이 요금을 정하게 됩니다.');
  });

  await t.test('★ 모르는 값은 안 받는다', () => {
    const b = DR.geminiBody(parts, { topK: 40, temperature: 99, candidateCount: 8 });
    assert.equal(b.generationConfig.topK, undefined, '적어 두지 않은 값이 그대로 넘어갔습니다.');
    assert.equal(b.generationConfig.candidateCount, undefined, '답을 여러 벌 받으면 요금이 배가 됩니다.');
    assert.equal(b.generationConfig.temperature, 0, '범위 밖 값을 그대로 썼습니다.');
  });

  await t.test('★ 오류 글에 열쇠가 섞여 나가지 않는다', () => {
    /* ⚠ 열쇠꼴(AQ.·AIza)로 생긴 것은 무늬로도 지워진다. 그래서 무늬에 안 걸리는
       모양으로 시험해야 **「넘겨받은 열쇠를 지운다」**를 실제로 확인할 수 있다 —
       처음에는 AQ. 로 시작하는 값으로 시험해 뮤테이션이 살아남았다. */
    const key = 'zz-사내키-1234567890';
    const why = DR.safeReason({ error: { message: '주소 …?key=' + key + ' 가 잘못됨' } }, key);
    assert.ok(why.indexOf(key) < 0, '오류 글로 열쇠가 새어 나갔습니다: ' + why);
    assert.match(why, /\(열쇠\)/);
  });

  await t.test('열쇠를 안 넘겨도 열쇠꼴 글자는 지운다', () => {
    const why = DR.safeReason({ error: { message: 'bad key AIzaSyDkZz5QlKSoqMOYByp5YGeMNLNDrIghlXX' } }, '');
    assert.ok(why.indexOf('AIzaSy') < 0, '파이어베이스 열쇠꼴이 그대로 나갔습니다: ' + why);
  });

  await t.test('★ 429 면 **같은 모델로** 다시 부른다', async () => {
    /* ⚠ 부른 횟수만 세면 못 잡는다 — 재시도를 꺼도 **다음 모델로 넘어가** 두 번이
       된다(실제로 이 뮤테이션이 살아남았다). 두 번 다 **같은 모델**인지 봐야 한다.
       모델을 바꾸면 앞 모델의 한도가 풀렸는지 영영 확인하지 않는다. */
    const tried = [];
    const r = await DR.callGemini(function (url) {
      tried.push(String(url));
      if (tried.length === 1) return Promise.resolve({ ok: false, status: 429, json: () => Promise.resolve({}) });
      return Promise.resolve({ ok: true, json: () => Promise.resolve(reply(GOOD)) });
    }, 'K', parts, [0]);
    assert.equal(r.ok, true);
    assert.equal(tried.length, 2, '잠시 바쁠 때 한 번에 포기하면 사용자가 손으로 다시 눌러야 합니다.');
    assert.ok(tried[0].indexOf(DR.MODELS[0]) > 0 && tried[1].indexOf(DR.MODELS[0]) > 0,
      '같은 모델로 다시 부르지 않고 딴 모델로 넘어갔습니다: ' + tried.join(' → '));
  });

  await t.test('★ 404 면 다음 모델로 갈아탄다', async () => {
    /* gemini-2.0-flash 가 종료됐을 때 앱이 조용히 멈춘 적이 있다 */
    const tried = [];
    const r = await DR.callGemini(function (url) {
      tried.push(url);
      if (tried.length === 1) return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
      return Promise.resolve({ ok: true, json: () => Promise.resolve(reply(GOOD)) });
    }, 'K', parts, [0]);
    assert.equal(r.ok, true);
    assert.equal(tried.length, 2);
    assert.ok(tried[0].indexOf(DR.MODELS[0]) > 0);
    assert.ok(tried[1].indexOf(DR.MODELS[1]) > 0);
  });

  await t.test('★ 403(열쇠 문제)이면 곧바로 포기한다 — 모델을 바꿔도 같다', async () => {
    let n = 0;
    const r = await DR.callGemini(function () {
      n++;
      return Promise.resolve({ ok: false, status: 403, json: () => Promise.resolve({ error: { message: '권한 없음' } }) });
    }, 'K', parts, [0]);
    assert.equal(r.ok, false);
    assert.equal(r.status, 403);
    assert.equal(n, 1, '열쇠 문제인데 모델을 바꿔 가며 부르면 요금만 나갑니다.');
  });

  await t.test('주소에 열쇠가 실린다 — 그건 서버 안에서만 일어난다', () => {
    assert.match(DR.modelUrl('m', 'K'), /generativelanguage\.googleapis\.com/);
    assert.match(DR.modelUrl('m', 'K'), /key=K$/);
  });
});

/* ══════ ③ 배선 — 앱이 auth 를 안 넘기면 고침이 무용지물이다 ══════ */
test('앱 배선', async (t) => {
  const photos = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');
  const paydata = fs.readFileSync(path.join(R, 'pu-paydata.html'), 'utf8');

  await t.test('★ 사진첩이 로그인 증명을 넘긴다', () => {
    assert.match(photos, /PuDocRead\.keysFrom\(db, \{ auth: firebase\.auth\(\) \}\)/,
      'auth 를 안 넘기면 서버 대리인을 못 써서 옛 길(열쇠 내려받기)로 돌아갑니다.');
  });

  await t.test('★ 급여데이터함도 넘긴다', () => {
    assert.match(paydata, /PuDocRead\.keysFrom\(db, \{ auth: firebase\.auth\(\) \}\)/);
  });

  await t.test('판독 대리인 주소가 한 곳에만 적혀 있다', () => {
    /* 앱마다 적으면 한쪽만 고쳐진다 */
    const js = fs.readFileSync(path.join(R, 'js', 'pu-doc-read.js'), 'utf8');
    assert.match(js, /READ_DOC_URL = 'https:\/\/asia-northeast3-pureun-erp\.cloudfunctions\.net\/readDoc'/);
    assert.ok(photos.indexOf('cloudfunctions.net/readDoc') < 0, '앱에 주소가 또 적혀 있습니다.');
    assert.ok(paydata.indexOf('cloudfunctions.net/readDoc') < 0, '앱에 주소가 또 적혀 있습니다.');
  });

  /* ══════ 마무리 — 열쇠가 브라우저로 «내려올 길» 자체가 없다 (2026-08-17) ══════
     금고에 넣고, 실시간DB 의 열쇠를 지우고, 서버 기록으로 `keySource secret` 을
     확인한 뒤 걷어냈다. 되살아나면 이틀 동안 막은 것이 도로아미타불이다. */
  await t.test('★ 판독 층이 열쇠를 «가져다 주지 않는다»', () => {
    const js = fs.readFileSync(path.join(R, 'js', 'pu-doc-read.js'), 'utf8');
    const at = js.indexOf('function keysFrom(');
    assert.ok(at > 0, 'keysFrom 을 찾지 못했습니다');
    let i = js.indexOf('{', at), d = 0;
    for (; i < js.length; i++) {
      if (js[i] === '{') d++;
      else if (js[i] === '}') { d--; if (!d) break; }
    }
    const fn = js.slice(at, i + 1);
    assert.doesNotMatch(fn, /getKey\s*:/,
      '★ 열쇠를 돌려주면 그 순간 다시 브라우저로 내려옵니다.');
    assert.doesNotMatch(fn, /geminiKey/,
      '★ 실시간DB 의 열쇠 자리를 다시 읽습니다 — 그 자리는 전 직원이 읽습니다.');
  });

  await t.test('★ 어느 화면도 열쇠를 넘기지 않는다', () => {
    /* 층이 안 줘도 화면이 제 손으로 넘기면 옛 갈래가 되살아난다. */
    ['pu-photos.html', 'pu-paydata.html', 'pu-cards.html', 'kcareer.html'].forEach(function (f) {
      const p = path.join(R, f);
      if (!fs.existsSync(p)) return;
      const src = fs.readFileSync(p, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"\w])\/\/[^\n]*/g, '$1');
      assert.doesNotMatch(src, /getKey\s*:/, f + ' 이 판독 층에 열쇠를 넘깁니다.');
    });
  });

  await t.test('★ 서버가 받아 둔 답 길이를 구글 부를 때 실제로 넘긴다', () => {
    /* validate 가 cfg 를 받아 두어도 callGemini 에 안 넘기면 그냥 버려진다 —
       경력관리의 긴 증명서가 조용히 잘린다. */
    const idx = fs.readFileSync(path.join(R, 'functions', 'index.js'), 'utf8');
    assert.match(idx, /callGemini\(fetch, key, v\.parts, null, v\.cfg\)/,
      '받아 둔 답 길이를 구글에 안 넘깁니다.');
  });
});
