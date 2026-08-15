'use strict';
// 업무관리 AI 호출에 시간 제한 — node --test tests/work-ai-timeout.test.js
//
// 왜: work.html 이 바깥으로 나가는 부름은 AI 프록시 하나뿐인데 시간 제한이 없었다.
//     답이 안 오면 영영 기다린다 — 「기록·노트·회고를 읽고 있습니다…」 창은
//     닫는 단추가 없어서 그대로 갇히고, [✨ AI 초안]·[🎤 AI 인터뷰] 단추는 눌린 채 멈춘다.
//     (pu-erp 는 이미 fetchT 로 막아 두었다 — 같은 구멍이 여기 남아 있었다)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'work.html'), 'utf8').replace(/\r\n/g, '\n');

function grab(name){
  const i = src.indexOf('function ' + name + '(');
  assert.ok(i >= 0, name + ' 를 찾지 못했다');
  let d = 0, j = i;
  for(;;j++){ if(src[j] === '{') d++; else if(src[j] === '}'){ d--; if(!d){ j++; break; } } }
  return src.slice(i, j);
}

function sandbox(){
  const box = { setTimeout, clearTimeout, Error, Math, Object, Promise };
  vm.createContext(box);
  vm.runInContext('var AI_WAIT_MS=60000;\n' + grab('aiFetch') + '\nthis.f = aiFetch;', box);
  return box;
}

/* ── 시간 제한이 걸렸다 ── */
test('★ 바깥 부름에 시간 제한이 없는 곳이 없다', () => {
  const left = [];
  src.split('\n').forEach(function(t, i){
    if(/\bfetch\(/.test(t) && !/aiFetch\(/.test(t)) left.push((i + 1) + ': ' + t.trim().slice(0, 80));
  });
  // aiFetch 안에서 진짜 fetch 를 부르는 두 곳만 남아야 한다
  assert.equal(left.length, 2, '남은 곳:\n' + left.join('\n'));
  assert.match(left[0], /return fetch\(url,opts\);/);
  assert.match(left[1], /return fetch\(url,o\)/);
});

test('AI 호출이 aiFetch 를 쓴다', () => {
  assert.match(grab('aiCall'), /return aiFetch\(url,\{method:'POST'/);
});

test('1분을 준다 (지식 뽑기는 기록을 통째로 읽는다)', () => {
  assert.match(src, /var AI_WAIT_MS=60000;/);
});

/* ── 도구가 제대로 도나 ── */
test('시간이 지나면 끊고, 끊겼다고 표시한다', async () => {
  const box = sandbox();
  box.AI_WAIT_MS = 30;
  vm.runInContext('AI_WAIT_MS=30;', box);
  box.AbortController = class { constructor(){ this.signal = { aborted:false }; }
    abort(){ this.signal.aborted = true; if(this.signal._on) this.signal._on(); } };
  box.fetch = (u, o) => new Promise(function(_, rej){
    o.signal._on = function(){ const e = new Error('aborted'); e.name = 'AbortError'; rej(e); };
  });
  await assert.rejects(box.f('u', {}), function(e){
    assert.equal(e.timeout, true);
    assert.match(e.message, /초 안에 답이 오지 않았습니다/);
    assert.match(e.message, /잠시 뒤 다시 해 주세요/, '다음에 뭘 할지 알려 준다');
    return true;
  });
});

test('제때 오면 그대로 돌려주고 시계를 푼다', async () => {
  const box = sandbox();
  let cleared = false;
  box.clearTimeout = function(t){ cleared = true; clearTimeout(t); };
  box.AbortController = class { constructor(){ this.signal = {}; } abort(){} };
  box.fetch = () => Promise.resolve({ ok:true, tag:'답' });
  const r = await box.f('u', {});
  assert.equal(r.tag, '답');
  assert.equal(cleared, true, '시계를 안 풀면 나중에 헛되이 끊는다');
});

test('그냥 실패한 것은 끊긴 것으로 바꾸지 않는다', async () => {
  const box = sandbox();
  box.AbortController = class { constructor(){ this.signal = {}; } abort(){} };
  box.fetch = () => Promise.reject(new Error('네트워크 없음'));
  await assert.rejects(box.f('u', {}), function(e){
    assert.equal(e.timeout, undefined);
    assert.equal(e.message, '네트워크 없음');
    return true;
  });
});

test('★ 넘겨받은 것을 고치지 않는다', () => {
  const box = sandbox();
  box.AbortController = class { constructor(){ this.signal = 'SIG'; } abort(){} };
  let got = null;
  box.fetch = (u, o) => { got = o; return Promise.resolve({}); };
  const opts = { method:'POST', body:'x' };
  box.f('u', opts);
  assert.equal(opts.signal, undefined, '넘겨받은 것에 손대면 다음 호출에 지난 signal 이 남는다');
  assert.equal(got.method, 'POST');
  assert.equal(got.body, 'x');
  assert.equal(got.signal, 'SIG');
});

test('끊을 수 없는 옛 브라우저는 그냥 지나간다', async () => {
  const box = sandbox();
  box.AbortController = undefined;
  box.fetch = () => Promise.resolve({ ok:true });
  assert.equal((await box.f('u', {})).ok, true);
});

/* ── 모델 바꿔 걸기와 부딪히지 않는다 ── */
test('★ 끊긴 것은 다음 모델로 다시 걸지 않는다', () => {
  // 프록시가 그 모델을 막은 것이 아니라 답이 늦은 것이다 — 다시 걸면 1분을 또 기다린다
  const c = grab('aiCall');
  assert.match(c, /if\(e&&e\.timeout\) throw e;/);
  assert.ok(c.indexOf('if(e&&e.timeout) throw e;') < c.indexOf('if(i<AI_MODELS.length-1)'),
    '모델을 바꾸기 «전에» 걸러야 한다');
});

test('모델 바꿔 걸기 자체는 그대로', () => {
  assert.match(grab('aiCall'), /if\(i<AI_MODELS\.length-1\)\{ i\+\+; return attempt\(\); \}/);
  assert.match(src, /var AI_MODELS=\['claude-opus-5','claude-sonnet-4-20250514'\];/);
});

/* ── 부른 쪽이 스스로 되돌아온다 ── */
test('실패하면 갇힌 화면이 풀린다', () => {
  // 시간 제한이 있어도 부른 쪽이 안 풀면 화면은 그대로 갇힌다
  assert.match(src, /\.catch\(function\(e\)\{ toast\('실패: '\+\(e\.message\|\|''\),'err'\); \}\)/);
  assert.match(src, /b2\.disabled=false; b2\.textContent='물어보기';/);
  assert.match(src, /b\.disabled=false; b\.textContent='✨ AI 초안';/);
  assert.match(src, /b\.disabled=false; b\.textContent='🎤 AI 인터뷰';/);
  // 닫는 단추가 없던 창은 실패하면 닫는 단추가 있는 창으로 바뀐다
  assert.match(src, /<button onclick="closeM\(\)">닫기<\/button>/);
});

test('★ 설정이 없으면 «어디에» 넣는지까지 말해 준다', () => {
  // 그 칸은 포털의 ⚙ 설정에만 있다(관리자 전용). 푸른이알피 설정을 가리키면
  // 찾다가 못 찾고 포기한다 — 실제로 대표가 「어떻게 하는 건지 모르겠다」고 했다.
  const c = grab('aiCall');
  assert.match(c, /시작 화면\(포털\) 왼쪽 아래 \[⚙ 설정\] → 「AI 프록시 주소」/);
  assert.match(c, /대표만 보입니다/, '직원이 찾아 헤매지 않게');
  assert.ok(!/푸른이알피 설정에서 먼저 등록/.test(c), '푸른이알피에는 그 칸이 없다');
});

test('가리키는 곳이 실제로 있다', () => {
  // 안내가 가리키는 칸이 포털에 정말 있는지 — 없으면 안 되는 걸 시키는 셈이다
  const portal = fs.readFileSync(path.join(__dirname, '..', 'enter.html'), 'utf8');
  assert.match(portal, /<label for="cfgProxy">AI 프록시 주소<\/label>/);
  assert.match(portal, /\['cfgProxy','aiProxyUrl'\]/, '넣은 값이 app_config 로 저장돼야 한다');
  assert.match(portal, /id="cfgFab"[^>]*>⚙ 설정/, '왼쪽 아래 ⚙ 설정 단추');
});
