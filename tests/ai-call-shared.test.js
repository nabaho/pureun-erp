'use strict';
/* 기업정보함·경력관리도 서버로 — 열쇠가 브라우저를 완전히 떠난다 (대표 지시 2026-08-17 「1」)

   ⚠ 왜: 사진첩·급여데이터함은 공용 층(PuDocRead)을 써서 앞서 옮겼지만,
     기업정보함·경력관리는 **각자 따로** 구글을 불렀다. 그 둘이 남아 있는 한
     실시간DB 의 열쇠를 지울 수 없고, 지우기 전까지는 로그인한 모든 직원이
     그 열쇠를 읽을 수 있다. 이 검사는 「그 둘이 이제 열쇠를 안 만진다」를 못 박는다.

   ⚠ 글자 찾기로는 못 박히지 않는다 — 주석·죽은 문자열·딴 구역의 같은 낱말에
     여러 번 속았다. 그래서 **함수를 뽑아 실제로 돌려** 확인한다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');

/* ── 공용 호출기를 가짜 세상에 올린다 ── */
function loadCaller(extra) {
  const src = fs.readFileSync(path.join(R, 'js', 'pu-ai-call.js'), 'utf8');
  const ctx = Object.assign({ console, Promise, JSON, String, Number, Array, Object, Error }, extra || {});
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return ctx.PuAiCall;
}

/* 로그인한 척 */
function authWith(token) {
  return { currentUser: { getIdToken: () => Promise.resolve(token) } };
}
function res(status, body) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status: status, json: () => Promise.resolve(body) });
}
function reply(text) {
  return { candidates: [{ content: { parts: [{ text: text }] } }] };
}
const IMG = { inline_data: { mime_type: 'image/jpeg', data: 'QUJD' } };

/* HTML 에서 함수 하나를 통째로 뽑는다. `decl` 은 선언 첫머리 그대로.
   ⚠ `function 이름\([\s\S]*?\n\}` 식 정규식은 **0칸 여는 중괄호**에서 먼저 끊긴다
     (이번 작업에서 두 번 당했다). 여기서는 중괄호 짝을 세어 잘라 낸다.
   ⚠ 부르는 자리가 아니라 **선언**을 찾아야 한다 — 이름만 찾으면 위쪽 호출부에
     걸려 엉뚱한 함수를 잘라 낸다. */
function cutFn(src, decl) {
  const head = src.indexOf(decl);
  assert.notEqual(head, -1, decl + ' 을 찾지 못했습니다 — 이름이 바뀌었나요?');
  let i = src.indexOf('{', head + decl.length), depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (!depth) break; }
  }
  return src.slice(head, i + 1);
}

/* ══════ ① 공용 호출기 — 실제로 돌려 본다 ══════ */
test('공용 호출기(PuAiCall)', async (t) => {
  await t.test('★ 우리 서버를 부른다 — 구글을 직접 부르지 않는다', async () => {
    const calls = [];
    const P = loadCaller();
    const r = await P.ask([IMG], {
      auth: authWith('토큰'),
      fetch: (url, init) => { calls.push({ url, init }); return res(200, { ok: true, reply: reply('안녕') }); }
    });
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /cloudfunctions\.net\/readDoc$/, '우리 서버가 아닙니다: ' + calls[0].url);
    assert.doesNotMatch(calls[0].url, /generativelanguage/, '구글을 직접 불렀습니다 — 그러면 열쇠가 브라우저에 있어야 합니다.');
    assert.equal(P.textOf(r), '안녕');
  });

  await t.test('★ 로그인 증명을 붙여 보낸다', async () => {
    let seen = null;
    const P = loadCaller();
    await P.ask([IMG], {
      auth: authWith('토큰123'),
      fetch: (url, init) => { seen = init; return res(200, { ok: true, reply: reply('x') }); }
    });
    assert.equal(seen.headers.Authorization, 'Bearer 토큰123',
      '증명을 안 붙였습니다 — 서버가 401 로 막아 「판독이 안 된다」로만 보입니다.');
  });

  await t.test('★ 로그인이 없으면 아예 부르지 않는다 (옛 길로도 안 간다)', async () => {
    let called = 0;
    const P = loadCaller();
    await assert.rejects(
      () => P.ask([IMG], { auth: { currentUser: null }, fetch: () => { called++; return res(200, {}); } }),
      /로그인/);
    assert.equal(called, 0, '증명 없이 서버를 불렀습니다.');
  });

  await t.test('★ 실패하면 상태 숫자를 그대로 달아 던진다', async () => {
    const P = loadCaller();
    /* 401(로그인 만료)과 503(서버에 열쇠 없음)은 부르는 쪽의 안내가 갈린다 —
       숫자를 뭉개면 둘 다 「AI 오류」로만 보인다. */
    for (const s of [400, 401, 503]) {
      const e = await P.ask([IMG], { auth: authWith('t'), fetch: () => res(s, { ok: false, error: '싫다' }) })
        .then(() => null, (x) => x);
      assert.ok(e, s + ' 인데 성공했습니다');
      assert.equal(e.status, s, '상태 숫자가 사라졌습니다(' + s + ' → ' + e.status + ')');
    }
  });

  await t.test('★ 옵션을 안 주면 generationConfig 를 안 보낸다 (서버 기본값을 쓴다)', async () => {
    let body = null;
    const P = loadCaller();
    await P.ask([IMG], { auth: authWith('t'), fetch: (u, i) => { body = JSON.parse(i.body); return res(200, { ok: true, reply: reply('x') }); } });
    assert.equal('generationConfig' in body, false);

    await P.ask([IMG], {
      auth: authWith('t'), generationConfig: { temperature: 0, maxOutputTokens: 1500 },
      fetch: (u, i) => { body = JSON.parse(i.body); return res(200, { ok: true, reply: reply('x') }); }
    });
    assert.equal(body.generationConfig.maxOutputTokens, 1500,
      '길이 지정이 안 넘어갔습니다 — 경력관리의 긴 서류에서 답이 잘립니다.');
  });

  await t.test('★ ```json 껍데기를 벗긴다', () => {
    const P = loadCaller();
    assert.equal(P.textOf(reply('```json\n{"a":1}\n```')), '{"a":1}');
  });
});

/* ══════ ② 기업정보함 — 뽑아서 실제로 돌린다 ══════ */
test('기업정보함(pu-cards.html)', async (t) => {
  const src = fs.readFileSync(path.join(R, 'pu-cards.html'), 'utf8');

  await t.test('★ 판독이 서버를 거친다 — 열쇠를 한 번도 안 찾는다', async () => {
    const calls = [];
    const P = loadCaller();
    const ctx = {
      console, Promise, JSON, Error, String, Number, Array, Object,
      PuAiCall: P, firebase: { auth: () => authWith('토큰') },
      pcFetch: (url, init) => { calls.push(url); return res(200, { ok: true, reply: reply('{"name":"홍길동"}') }); },
      localStorage: { getItem: () => { throw new Error('열쇠를 이 기기에서 찾았습니다'); } }
    };
    vm.createContext(ctx);
    vm.runInContext(cutFn(src, 'async function aiExtract('), ctx);
    const out = await vm.runInContext('aiExtract("data:image/jpeg;base64,QUJD","card")', ctx);
    assert.equal(out.name, '홍길동', '판독이 안 됐습니다: ' + JSON.stringify(out));
    assert.equal(calls.length, 1);
    assert.match(calls[0], /\/readDoc$/, '구글을 직접 불렀습니다: ' + calls[0]);
  });

  await t.test('★ 로그인 여부로 판정한다 — 열쇠 유무로 판정하지 않는다', () => {
    const ctx = { console, Error };
    vm.createContext(ctx);
    vm.runInContext(cutFn(src, 'function aiReady('), ctx);
    ctx.firebase = { auth: () => ({ currentUser: { uid: 'u1' } }) };
    assert.equal(vm.runInContext('aiReady()', ctx), true, '로그인했는데 꺼져 있습니다.');
    ctx.firebase = { auth: () => ({ currentUser: null }) };
    assert.equal(vm.runInContext('aiReady()', ctx), false, '로그아웃인데 켜져 있습니다.');
  });

  await t.test('★ 켜자마자 이 기기에 남은 옛 열쇠를 지운다', () => {
    /* 지우는 줄만 있고 안 돌면 소용없다 — **화면 스크립트를 그대로 돌려**
       localStorage 에서 정말 지워졌는지 본다. 열쇠는 옛 판이 되살아나면
       그것부터 쓰이므로 「남겨 두고 안 쓴다」로는 부족하다. */
    const store = { pucards_gemini_key: 'AQ.옛열쇠' };
    const ctx = {
      console, Error,
      localStorage: { removeItem: (k) => { delete store[k]; }, getItem: (k) => store[k] || null }
    };
    vm.createContext(ctx);
    const at = src.indexOf("localStorage.removeItem('pucards_gemini_key')");
    assert.notEqual(at, -1, '옛 열쇠를 지우는 자리가 사라졌습니다.');
    vm.runInContext(src.slice(src.lastIndexOf('\n', at), src.indexOf('\n', at)), ctx);
    assert.equal(store.pucards_gemini_key, undefined,
      '옛 열쇠가 이 기기에 그대로 남았습니다 — 그 기기에서 꺼내 갈 수 있습니다.');
  });

  await t.test('★ 열쇠를 저장·공유하는 자리가 남아 있지 않다', () => {
    const live = strip(src);
    assert.doesNotMatch(live, /generativelanguage\.googleapis\.com/,
      '구글을 직접 부르는 자리가 남았습니다 — 그러면 열쇠도 남습니다.');
    assert.doesNotMatch(live, /setItem\(\s*['"]pucards_gemini_key/,
      '열쇠를 이 기기에 다시 저장합니다.');
    assert.doesNotMatch(live, /config\/geminiKey|['"]geminiKey['"]\s*\)/,
      '실시간DB 의 열쇠를 아직 읽습니다 — 지우면 기업정보함이 죽습니다.');
  });
});

/* ══════ ③ 경력관리 — 뽑아서 실제로 돌린다 ══════ */
test('경력관리(kcareer.html)', async (t) => {
  const src = fs.readFileSync(path.join(R, 'kcareer.html'), 'utf8');

  await t.test('★ 판독이 서버를 거친다 — 길이 지정(1500)도 함께 간다', async () => {
    const calls = [];
    const P = loadCaller();
    const ctx = {
      console, Promise, JSON, Error, String, Number, Array, Object,
      PuAiCall: P, firebase: { auth: () => authWith('토큰') },
      kcFetch: (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return res(200, { ok: true, reply: reply('{"name":"홍길동"}') }); },
      aiReady: () => true
    };
    vm.createContext(ctx);
    vm.runInContext(cutFn(src, 'async function _geminiOCR('), ctx);
    const out = await vm.runInContext('_geminiOCR("읽어줘","QUJD","image/jpeg")', ctx);
    assert.ok(out && out.parsed, '판독이 안 됐습니다: ' + JSON.stringify(out));
    assert.equal(out.parsed.name, '홍길동');
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/readDoc$/, '구글을 직접 불렀습니다: ' + calls[0].url);
    assert.equal(calls[0].body.generationConfig.maxOutputTokens, 1500,
      '길이 지정이 빠졌습니다 — 긴 증명서에서 답이 잘립니다.');
  });

  await t.test('★ 열쇠 저장·복원 자리가 남아 있지 않다', () => {
    const live = strip(src);
    assert.doesNotMatch(live, /generativelanguage\.googleapis\.com/,
      '구글을 직접 부르는 자리가 남았습니다.');
    assert.doesNotMatch(live, /LS\.set\(\s*NS\s*\+\s*['"]gemini_key/,
      '열쇠를 이 기기에 다시 저장합니다.');
    assert.doesNotMatch(live, /gemini_key\s*:\s*LS\.get/,
      '열쇠를 클라우드(_secrets)에 다시 올립니다 — 기기를 바꿔도 되살아납니다.');
    assert.doesNotMatch(live, /id=["']apiGM["']/,
      '열쇠 입력칸이 남았습니다 — 직원이 다시 열쇠를 브라우저에 넣게 됩니다.');
  });

  await t.test('★ 남아 있던 옛 열쇠를 지운다 (이 기기·클라우드 양쪽)', () => {
    const live = strip(src);
    assert.match(live, /LS\.remove\(\s*NS\s*\+\s*['"]gemini_key['"]\s*\)/,
      '이 기기에 남은 옛 열쇠를 안 지웁니다.');
    assert.match(live, /_secrets\/gemini_key['"]\s*\)\.remove\(\)/,
      '클라우드에 남은 옛 열쇠를 안 지웁니다 — 기기를 바꾸면 되살아납니다.');
  });
});

/* 주석과 이어진-줄 주석을 걷어 낸다 — 주석 속 낱말에 검사가 속지 않게. */
function strip(s) {
  return s.replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"\w])\/\/[^\n]*/g, '$1');
}
