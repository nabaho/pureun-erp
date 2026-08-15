'use strict';
// AI 요약이 늘 실패하던 것 — node --test tests/erp-ai-proxy.test.js
//
// 왜: 상담기록의 [AI 요약] 이 브라우저에서 api.anthropic.com 을 «바로» 불렀다.
//     열쇠를 안 실었으니 401 이고, 열쇠를 실었다면 화면 소스에 그대로 드러난다.
//     게다가 그 주소는 브라우저에서 CORS 로 막힌다 — 어느 쪽이든 늘 실패했다.
//     옆의 AI 도우미(대화)는 프록시를 제대로 쓰고 있었다.
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
const SUM = grab('aiSummarize');

/* ── 바로 부르지 않는다 ── */
test('★ 브라우저에서 AI 를 바로 부르지 않는다', () => {
  // 주석에는 「왜 그러면 안 되는지」가 적혀 있어야 하므로, «부르는 곳»만 본다
  const calls = app.match(/fetchT?\([^)\n]*api\.anthropic\.com[^)\n]*/g) || [];
  assert.deepEqual(calls, [], '이 주소는 브라우저에서 CORS 로 막힌다');
  assert.match(app, /브라우저에서 api\.anthropic\.com 을 바로 부르면 안 된다/, '까닭은 주석에 남긴다');
});

test('★ 열쇠를 화면 소스에 싣지 않는다', () => {
  // 열쇠를 넣어 «고치면» 저장소가 공개라 그대로 노출된다 — 프록시가 유일한 길이다
  assert.ok(!/x-api-key/i.test(app));
  assert.ok(!/anthropic-version/i.test(app));
  assert.ok(!/sk-ant-/.test(app));
});

test('AI 요약도 프록시로 보낸다', () => {
  assert.match(SUM, /var _proxy = erpAiProxyUrl\(\);/);
  assert.match(SUM, /fetchT\(_proxy,\{/);
});

/* ── 두 곳이 갈라지지 않는다 ── */
test('★ 설정을 읽는 곳이 하나다', () => {
  // 각자 읽으면 한쪽만 고쳐진다
  assert.equal((app.match(/function erpAiProxyUrl\(\)/g) || []).length, 1);
  assert.equal((app.match(/erpAiProxyUrl\(\)/g) || []).length, 3, '정의 1 + 부르는 곳 2(요약·도우미)');
  assert.ok(app.indexOf("dbGet('setting_ai_proxy_url','') || localStorage") < 0
    || (app.match(/setting_ai_proxy_url/g) || []).length === 1, '설정 열쇠는 한 곳에서만 읽는다');
});

test('AI 도우미도 같은 함수를 쓴다', () => {
  assert.match(app, /var proxyUrl = erpAiProxyUrl\(\);/);
});

test('설정을 읽는 순서는 종전 그대로', () => {
  const p = grab('erpAiProxyUrl');
  const order = ['setting_ai_proxy_url', 'pureun_v6_ai_proxy_url', 'aiProxyUrl'];
  let at = -1;
  order.forEach(function(k){
    const i = p.indexOf(k);
    assert.ok(i > at, k + ' 순서가 바뀌면 쓰던 설정이 무시된다');
    at = i;
  });
});

test('설정이 깨져 있어도 터지지 않는다', () => {
  const box = { window:{}, localStorage:{ getItem(){ throw new Error('막힘'); } } };
  vm.createContext(box);
  vm.runInContext(grab('erpAiProxyUrl') + '\nthis.f = erpAiProxyUrl;', box);
  assert.equal(box.f(), '');
});

test('설정이 있으면 그대로 돌려준다', () => {
  const box = { window:{ PU_CFG:{} }, localStorage:{ getItem(){ return null; } },
                dbGet:(k, d) => (k === 'setting_ai_proxy_url' ? 'https://내프록시/ai' : d) };
  vm.createContext(box);
  vm.runInContext(grab('erpAiProxyUrl') + '\nthis.f = erpAiProxyUrl;', box);
  assert.equal(box.f(), 'https://내프록시/ai');
});

/* ── 사람에게 뭐라고 하나 ── */
test('★ 설정이 없으면 부르기 전에 말해 준다', () => {
  // 없는 곳으로 보내 놓고 「연결 오류」라고 하면 무엇을 해야 할지 알 수 없다
  assert.match(SUM, /if\(!_proxy\)\{/);
  assert.match(SUM, /AI 설정이 없습니다 — 환경설정에서 AI 프록시 주소를 등록해 주세요/);
  // 부르기 전에 막아야 한다 — 뒤에 막으면 「불러오는 중」이 잠깐 뜬다
  assert.ok(SUM.indexOf('if(!_proxy){') < SUM.indexOf('setAiLoading(true)'));
});

test('빈 답이 와도 「완료」라고 하지 않는다', () => {
  assert.match(SUM, /if\(!text\)\{ showToast\('AI 요약이 비어서 왔습니다/);
  assert.ok(SUM.indexOf("if(!text){") < SUM.indexOf("upd('summary', text)"), '비었으면 덮어쓰지 않는다');
});

test('답 읽는 순서가 AI 도우미와 같다', () => {
  // 프록시가 돌려주는 모양은 서버마다 다르다 — 두 곳이 다르게 읽으면 한쪽만 된다
  assert.match(SUM, /var text = d\.reply \|\| d\.text/);
  assert.match(app, /var reply = data\.reply \|\| data\.text/);
});

test('시간 제한과 갇힘 방지는 그대로', () => {
  assert.match(SUM, /\}, 45000\)/);
  assert.match(SUM, /\.finally\(function\(\)\{ setAiLoading\(false\); \}\)/);
  assert.match(SUM, /e && e\.timeout/, '끊긴 것과 실패한 것을 갈라 말한다');
});
