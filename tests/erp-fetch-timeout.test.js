'use strict';
// 바깥 부름에 시간 제한 — node --test tests/erp-fetch-timeout.test.js
//
// 왜: AI·구글·국세청·NAS 로 나가는 부름에 시간 제한이 «하나도» 없었다.
//     답이 안 오면 fetch 는 영영 기다린다 — 화면은 「생각 중…」·「불러오는 중…」에
//     갇히고, 사람이 할 수 있는 일은 새로고침뿐이다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const app = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8').replace(/\r\n/g, '\n');

function grab(name){
  const i = app.indexOf('function ' + name + '(');
  assert.ok(i >= 0, name + ' 를 찾지 못했다');
  let d = 0, j = i;
  for(;;j++){ if(app[j] === '{') d++; else if(app[j] === '}'){ d--; if(!d){ j++; break; } } }
  return app.slice(i, j);
}

/* ── 빠짐없이 걸렸나 ── */
test('★ 시간 제한 없이 바깥으로 나가는 부름이 하나도 없다', () => {
  const left = [];
  app.split('\n').forEach(function(t, i){
    if(/\bfetch\(/.test(t) && !/fetchT\(/.test(t)) left.push((i + 1) + ': ' + t.trim().slice(0, 80));
  });
  /* 남아도 되는 것은 **감싸개 자신이 진짜 fetch 를 부르는 줄**뿐이다.
     ⚠ 「두 곳」이라고 개수를 못 박지 않는다 — 감싸개가 하나 늘어도 뜻은 그대로인데
       검사가 막는다. 남은 줄이 «전부» 감싸개 자신인지를 본다(그게 지키려는 것이다). */
  left.forEach(function (t) {
    assert.match(t, /return fetch\(url, (?:opts|o)\)/,
      '시간 제한 없이 나가는 부름이 남았습니다:\n' + left.join('\n'));
  });
  assert.ok(left.length >= 1, '감싸개가 진짜 fetch 를 부르는 줄이 사라졌습니다.');
});

test('AI 부름 두 곳 다 걸렸다', () => {
  // 둘 다 프록시로 나간다 (api.anthropic.com 직접 호출은 걷어냈다)
  assert.match(app, /fetchT\(_proxy,\{/, 'AI 요약');
  assert.match(app, /var res = await fetchT\(proxyUrl,\{/, 'AI 도우미 대화');
});

test('구글·국세청·NAS 도 걸렸다', () => {
  ['https://api.odcloud.kr', 'https://gmail.googleapis.com', 'https://www.googleapis.com/calendar/v3',
   'https://vision.googleapis.com', 'https://data.jsdelivr.com'].forEach(function(u){
    const re = new RegExp('fetchT\\(\'' + u.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&'));
    assert.match(app, re, u);
  });
  /* ⚠ 예전에는 「NAS 다섯 곳·자동 백업 세 곳」이라고 **개수**를 못 박았다.
     NAS 부름이 하나 늘면 — 제대로 감싸서 늘려도 — 검사가 막는다.
     「빠짐없이 걸렸나」는 위 첫 검사가 이미 통째로 지킨다(감싸지 않은 fetch 가
     한 줄이라도 남으면 거기서 걸린다). 여기서는 **있기는 한가**만 본다. */
  assert.ok((app.match(/fetchT\(getNasBase\(\)/g) || []).length >= 1, 'NAS 부름이 사라졌습니다');
  assert.ok((app.match(/fetchT\(base\+'\/webapi/g) || []).length >= 1, 'NAS 자동 백업이 사라졌습니다');
});

/* ── 도구가 제대로 도나 ── */
function sandbox(){
  const box = { setTimeout, clearTimeout, Error, Math, Object, Promise };
  vm.createContext(box);
  vm.runInContext('var FETCH_MS = 20000;\n' + grab('fetchT') + '\nthis.f = fetchT;', box);
  return box;
}

test('시간이 지나면 끊고, 끊겼다고 표시한다', async () => {
  const box = sandbox();
  // 진짜 AbortController 처럼 — 끊으면 signal 에 걸어 둔 것이 불린다
  box.AbortController = class { constructor(){ this.signal = { aborted:false }; }
    abort(){ this.signal.aborted = true; if(this.signal._on) this.signal._on(); } };
  box.fetch = (u, o) => new Promise(function(_, rej){
    o.signal._on = function(){ const e = new Error('aborted'); e.name = 'AbortError'; rej(e); };
  });
  await assert.rejects(box.f('u', null, 30), function(e){
    assert.equal(e.timeout, true, '끊긴 것임을 알려 줘야 한다');
    assert.match(e.message, /초 안에 답이 오지 않았습니다/);
    return true;
  });
});

test('제때 오면 그대로 돌려주고 시계를 푼다', async () => {
  const box = sandbox();
  let cleared = false;
  box.clearTimeout = function(t){ cleared = true; clearTimeout(t); };
  box.AbortController = class { constructor(){ this.signal = {}; } abort(){} };
  box.fetch = () => Promise.resolve({ ok:true, body:'답' });
  const r = await box.f('u', null, 5000);
  assert.equal(r.body, '답');
  assert.equal(cleared, true, '시계를 안 풀면 나중에 헛되이 끊는다');
});

test('★ 그냥 실패한 것은 끊긴 것으로 바꾸지 않는다', async () => {
  // 「시간이 지났습니다」와 「연결에 실패했습니다」는 다음에 할 일이 다르다
  const box = sandbox();
  box.AbortController = class { constructor(){ this.signal = {}; } abort(){} };
  box.fetch = () => Promise.reject(new Error('네트워크 없음'));
  await assert.rejects(box.f('u'), function(e){
    assert.equal(e.timeout, undefined);
    assert.equal(e.message, '네트워크 없음');
    return true;
  });
});

test('원래 주던 값을 그대로 넘긴다 (signal 만 더한다)', async () => {
  const box = sandbox();
  let got = null;
  box.AbortController = class { constructor(){ this.signal = 'SIG'; } abort(){} };
  box.fetch = (u, o) => { got = o; return Promise.resolve({}); };
  await box.f('u', { method:'POST', body:'x', credentials:'omit' });
  assert.equal(got.method, 'POST');
  assert.equal(got.body, 'x');
  assert.equal(got.credentials, 'omit');
  assert.equal(got.signal, 'SIG');
});

test('준 것을 고치지 않는다 (같은 옵션을 두 번 써도 안전하게)', async () => {
  const box = sandbox();
  box.AbortController = class { constructor(){ this.signal = 'SIG'; } abort(){} };
  box.fetch = () => Promise.resolve({});
  const opts = { method:'POST' };
  await box.f('u', opts);
  assert.equal(opts.signal, undefined, '넘겨받은 것에 손대면 다음 호출에 남는다');
});

test('끊을 수 없는 옛 브라우저는 그냥 지나간다', async () => {
  const box = sandbox();
  box.AbortController = undefined;
  box.fetch = () => Promise.resolve({ ok:true });
  const r = await box.f('u');
  assert.equal(r.ok, true);
});

/* ── 사람에게 뭐라고 하나 ── */
test('AI 는 시간이 지났을 때와 실패했을 때를 갈라 말한다', () => {
  assert.match(app, /⏱ AI 요약이 45초 안에 오지 않았습니다 — 다시 눌러 주세요/);
  assert.match(app, /⏱ 45초 동안 답이 오지 않았습니다\. 질문을 조금 짧게 줄여 다시 물어봐 주세요\./);
  assert.match(app, /연결 오류가 발생했습니다\. 인터넷 연결을 확인해주세요\./, '연결 실패 말은 그대로 둔다');
});

test('AI 는 넉넉히 45초를 준다 (기본 20초로는 짧다)', () => {
  assert.match(app, /\}, 45000\)/);
  assert.equal((app.match(/\}, 45000\)/g) || []).length, 2, 'AI 두 곳');
});

test('★ 시간이 지난 것을 「옛 서버」로 잘못 보고 다시 걸지 않는다', () => {
  // 급여 메일은 옛 서버용 되돌림이 있다 — 끊긴 것까지 다시 걸면 30초를 또 기다린다
  const p = grab('postMail');
  assert.match(p, /if\(e && e\.timeout\) throw e;/);
  assert.ok(p.indexOf('if(e && e.timeout) throw e;') < p.indexOf('return fetchT(url, {\n          method:\'POST\',\n          headers:{ \'Content-Type\':\'application/json\' }'));
});

test('화면이 갇히지 않는다 — 끝나면 반드시 푼다', () => {
  // 시간 제한이 있어도 로딩 표시를 안 풀면 화면은 그대로 갇힌다
  const ai = app.slice(app.indexOf('function aiSummarize(){'), app.indexOf('function aiSummarize(){') + 2200);
  assert.match(ai, /\.finally\(function\(\)\{ setAiLoading\(false\); \}\)/);
  const chat = app.slice(app.indexOf('var res = await fetchT(proxyUrl,{') - 1800,
                         app.indexOf('function handleKey(e){ if(e.key===\'Enter\''));
  assert.match(chat, /\}\s*\n\s*setLoading\(false\);/, 'try/catch 밖에서 반드시 푼다');
});
