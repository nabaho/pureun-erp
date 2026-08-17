'use strict';
// 알림 캡처(입퇴사·수당변경) 판독. 실행: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = path.join(__dirname, '..', 'js', 'pu-doc-read.js');

function loadRead() {
  const src = fs.readFileSync(SRC, 'utf8');
  const sandbox = { window: {}, console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(src, { filename: 'pu-doc-read.js' }).runInContext(sandbox);
  return sandbox.window.PuDocRead;
}

function fakeFetch(reply) {
  const calls = [];
  const fn = function (url, init) {
    calls.push({ url: url, body: JSON.parse(init.body) });
    return Promise.resolve({ ok: true, status: 200,
      json: () => Promise.resolve({ candidates: [{ content: { parts: [{ text: reply }] } }] }) });
  };
  fn.calls = calls;
  return fn;
}
const IMG = 'data:image/jpeg;base64,AAAA';

test('판독 층에 readChangeNotice 가 붙는다', () => {
  assert.equal(typeof loadRead().readChangeNotice, 'function');
});

test('★ 입사 알림에서 누가·언제부터를 뽑는다', async () => {
  const R = loadRead();
  R.init({ fetch: fakeFetch(JSON.stringify({
    company: '화담원', period: '2026-08', docName: '입사 통보',
    rows: [{ name: '김신입', pairs: [{ item: '입사일', value: '2026-08-12' }] }]
  })), getKey: () => Promise.resolve('KEY') });
  const r = await R.readChangeNotice(IMG);
  assert.equal(r.ok, true);
  assert.equal(r.rows[0].name, '김신입');
  assert.equal(r.rows[0].pairs[0].item, '입사일');
  assert.equal(r.rows[0].pairs[0].value, '2026-08-12');
});

test('★ 수당 변경에서 항목·금액을 뽑는다', async () => {
  const R = loadRead();
  R.init({ fetch: fakeFetch(JSON.stringify({
    rows: [{ name: '홍길동', pairs: [{ item: '식대', value: '200,000' }] }]
  })), getKey: () => Promise.resolve('KEY') });
  const r = await R.readChangeNotice(IMG);
  assert.equal(r.rows[0].pairs[0].item, '식대');
});

test('이름 없는 줄·항목 없는 짝은 버린다', async () => {
  const R = loadRead();
  R.init({ fetch: fakeFetch(JSON.stringify({
    rows: [{ name: '', pairs: [{ item: '식대', value: '1' }] },
           { name: '홍길동', pairs: [{ item: '', value: '1' }, { item: '식대', value: '2' }] }]
  })), getKey: () => Promise.resolve('KEY') });
  const r = await R.readChangeNotice(IMG);
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].pairs.length, 1);
});

test('AI 키가 없으면 부르지 않고 한국어로 알린다', async () => {
  const R = loadRead();
  const f = fakeFetch('{}');
  R.init({ fetch: f, getKey: () => Promise.resolve('') });
  const r = await R.readChangeNotice(IMG);
  assert.equal(r.ok, false);
  assert.match(r.error, /키/);
  assert.equal(f.calls.length, 0);
});

test('AI 가 JSON 이 아닌 말을 해도 터지지 않는다', async () => {
  const R = loadRead();
  R.init({ fetch: fakeFetch('죄송합니다'), getKey: () => Promise.resolve('KEY') });
  const r = await R.readChangeNotice(IMG);
  assert.equal(r.ok, false);
  assert.ok(r.error);
});

test('★ 지어내지 말라고 못 박는다', () => {
  const src = fs.readFileSync(SRC, 'utf8');
  /* ⚠ `;\n` 이 아니라 `;\r?\n` 이어야 한다 — 이 저장소는 core.autocrlf=true 라
     윈도우 작업트리에서 파일이 CRLF 로 놓인다. 앞이 [\s\S] 인 자리는 \r 을 삼켜
     탈이 없지만, 글자 바로 뒤에 \n 을 붙이면 \r 에 걸려 못 찾는다. */
  const fn = src.match(/var NOTICE_PROMPT =[\s\S]*?;\r?\n/);
  assert.ok(fn, 'NOTICE_PROMPT 를 찾을 수 없습니다');
  assert.match(fn[0], /지어내지/);
  assert.match(fn[0], /주민등록번호/, '주민번호는 담지 않는다고 못 박아야 합니다');
});

test('★ 기존 함수·프롬프트가 그대로다 — 다른 앱이 함께 씁니다', () => {
  const R = loadRead();
  assert.equal(typeof R.read, 'function');
  assert.equal(typeof R.readWageTable, 'function');
  assert.match(R.PROMPTS.all, /금액과 사람 이름은 담지 마세요/);
});
