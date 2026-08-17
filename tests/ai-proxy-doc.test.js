'use strict';
// AI 프록시 문서가 코드와 어긋나지 않는가 — node --test tests/ai-proxy-doc.test.js
//
// 왜: 「환경설정에서 등록하세요」라고 해 놓고 그 칸이 없었던 적이 있다(#221).
//     안내와 문서는 조용히 낡는다 — 코드가 바뀌면 여기서 걸리게 해 둔다.
//     이 문서를 보고 그대로 만들면 실제로 돌아야 한다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const doc  = fs.readFileSync(path.join(root, 'docs', 'AI-프록시-만들기.md'), 'utf8').replace(/\r\n/g, '\n');
const erp  = fs.readFileSync(path.join(root, 'pu-erp.html'), 'utf8').replace(/\r\n/g, '\n');
const work = fs.readFileSync(path.join(root, 'work.html'), 'utf8').replace(/\r\n/g, '\n');
const portal = fs.readFileSync(path.join(root, 'enter.html'), 'utf8').replace(/\r\n/g, '\n');

const worker = (doc.match(/```js\n([\s\S]*?)\n```/) || [])[1];

/* ── 붙여넣을 코드가 실제로 도나 ── */
test('★ Worker 코드에 문법 오류가 없다 (그대로 붙여넣는 것이다)', () => {
  assert.ok(worker && worker.length > 500, 'js 토막을 찾지 못했다');
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'aiproxy-')), 'w.mjs');
  fs.writeFileSync(f, worker);
  execFileSync(process.execPath, ['--check', f]);   // 문법이 틀리면 여기서 터진다
});

test('키를 코드에 적지 않고 비밀값으로 받는다', () => {
  assert.match(worker, /env\.ANTHROPIC_API_KEY/);
  assert.ok(!/sk-ant-[A-Za-z0-9]/.test(worker), '문서에 진짜 키가 들어가면 안 된다');
  assert.match(doc, /Name \| `ANTHROPIC_API_KEY`/, '넣을 이름을 코드와 같게 알려 준다');
  assert.match(doc, /Secret/, 'Text 로 넣으면 나중에 그대로 보인다');
});

test('브라우저 예비요청(OPTIONS)을 받는다', () => {
  // 이게 없으면 브라우저가 본 요청을 아예 보내지 않는다
  assert.match(worker, /request\.method === 'OPTIONS'/);
  assert.match(worker, /'Access-Control-Allow-Headers': 'Content-Type'/);
  assert.match(worker, /'Access-Control-Allow-Methods': 'POST, OPTIONS'/);
});

test('우리 앱 주소에서 온 것만 받는다', () => {
  assert.match(worker, /const ALLOW = \[/);
  assert.match(worker, /'https:\/\/nabaho\.github\.io'/);
  assert.match(worker, /const allowed = ALLOW\.includes\(origin\);/);
});

/* ── 앱이 읽는 모양과 맞나 ── */
test('★ 실패를 앱이 읽는 모양으로 돌려준다', () => {
  // work.html 은 d.error.message 를 본다 — 다른 모양이면 까닭이 안 보인다
  assert.match(worker, /\{ error: \{ message:/);
  assert.match(work, /if\(d&&d\.error\) throw new Error\(d\.error\.message\|\|'AI 오류'\)/);
});

test('★ 성공은 받은 그대로 돌려준다 (앱이 content\\[\\] 를 읽는다)', () => {
  assert.match(worker, /return reply\(data, 200, cors\);/);
  [erp, work].forEach(function(s){
    assert.match(s, /\(d\.content\|\|\[\]\)\.filter\(function\(x\)\{return x\.type==='text';\}\)|\(d\.content\|\|\[\]\)\.filter\(function\(b\)\{return b\.type==='text';\}\)/);
  });
});

test('★ 문서에 적은 모델이 코드와 같다', () => {
  const models = (work.match(/var AI_MODELS=\[([^\]]*)\]/) || [])[1];
  assert.match(models, /'claude-opus-5'/);
  assert.match(models, /'claude-sonnet-4-20250514'/);
  assert.match(doc, /`claude-opus-5`/);
  assert.match(doc, /`claude-sonnet-4-20250514`/);
  /* 푸른이알피의 AI 부름은 sonnet 고정.
     ⚠ 「두 곳」이라고 개수를 못 박지 않는다 — AI 부름이 하나 늘면, 같은 모델로
       제대로 늘려도 검사가 막는다. 지키려는 것은 개수가 아니라
       **「딴 모델을 쓰는 곳이 없다」**이다. */
  const used = (erp.match(/model: ?'[^']+'/g) || []).map(function (s) { return s.replace(/model: ?/, ''); });
  assert.ok(used.length >= 1, '푸른이알피에서 AI 모델을 고르는 자리가 사라졌습니다.');
  used.forEach(function (m) {
    assert.equal(m, "'claude-sonnet-4-20250514'", '문서에 없는 모델을 씁니다: ' + m);
  });
});

test('★ 문서에 적은 max_tokens 가 코드와 같다', () => {
  assert.match(erp, /max_tokens:800/);
  assert.match(erp, /max_tokens: 1000/);
  assert.match(work, /max_tokens:8000/);
  assert.match(doc, /800\(요약\) · 1000\(도우미\) · 8000\(업무관리\)/);
});

test('★ 문서에 적은 시간 제한이 코드와 같다', () => {
  assert.equal((erp.match(/\}, 45000\)/g) || []).length, 2, '푸른이알피 두 곳 45초');
  assert.match(work, /var AI_WAIT_MS=60000;/);
  assert.match(doc, /45초\(푸른이알피\)·60초\(업무관리\)/);
});

/* ── 가리키는 자리가 실제로 있나 ── */
test('★ 문서가 가리키는 설정 칸이 포털에 있다', () => {
  assert.match(doc, /\[⚙ 설정\]  →  「AI 프록시 주소」/);
  assert.match(portal, /<label for="cfgProxy">AI 프록시 주소<\/label>/);
  assert.match(portal, /\['cfgProxy','aiProxyUrl'\]/);
  assert.match(portal, /id="cfgFab"[^>]*>⚙ 설정/);
});

test('앱이 그 값을 실제로 읽는다', () => {
  assert.match(erp, /function erpAiProxyUrl\(\)/);
  assert.match(erp, /window\.PU_CFG && window\.PU_CFG\.aiProxyUrl/);
  assert.match(work, /window\.PU_CFG&&window\.PU_CFG\.aiProxyUrl/);
});

/* ── 돈이 새는 것을 숨기지 않는다 ── */
test('★ 이 프록시가 열쇠 없이 열려 있다는 것을 분명히 적는다', () => {
  // 「어디서 왔나」는 프로그램으로 부르면 꾸며댈 수 있다 — 그걸 안전장치라고 하면 거짓말이다
  assert.match(doc, /이 프록시는 열쇠가 없습니다/);
  assert.match(doc, /꾸며댈 수 있습니다/);
  assert.match(doc, /한 달 상한을 겁니다/, '진짜 안전장치를 알려 준다');
});

test('앱이 증표를 안 보낸다는 전제가 아직 맞다', () => {
  // 나중에 증표를 붙이면 이 검사가 걸린다 — 그때 문서도 같이 고쳐야 한다
  [erp, work].forEach(function(s){
    assert.ok(!/Authorization[^\n]*proxy|x-proxy-token|X-App-Secret/i.test(s));
  });
  assert.match(erp, /headers:\{'Content-Type':'application\/json'\}/);
  assert.match(work, /headers:\{'Content-Type':'application\/json'\}/);
});
