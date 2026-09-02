'use strict';
// 급여표 판독(급여데이터함 전용) — 실행: node --test tests/*.test.js
//   기존 kind=payslip 프롬프트는 사진첩·기업정보함·업체관리가 함께 쓰며
//   금액·이름을 **일부러** 담지 않는다. 급여데이터함은 반대로 사람별 금액이
//   꼭 필요하므로, 그 프롬프트를 건드리지 않고 새 함수 readWageTable 을 만들었다.
//   여기서는 그 새 함수만 검사한다 — 기존 read()/PROMPT_ALL 은 pu-doc-read.test.js 몫이다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadRead(env) {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'pu-doc-read.js'), 'utf8');
  const sandbox = Object.assign({ window: {}, console }, env || {});
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(src, { filename: 'pu-doc-read.js' }).runInContext(sandbox);
  return sandbox.window.PuDocRead;
}

function fakeFetch(reply, opts) {
  const calls = [];
  const fn = function (url, init) {
    calls.push({ url: url, body: JSON.parse(init.body) });
    if (opts && opts.httpFail) return Promise.resolve({ ok: false, status: 429, json: () => Promise.resolve({}) });
    return Promise.resolve({
      ok: true, status: 200,
      json: () => Promise.resolve({ candidates: [{ content: { parts: [{ text: reply }] } }] })
    });
  };
  fn.calls = calls;
  return fn;
}
const DUMMY_IMG = 'data:image/jpeg;base64,AAAA';

test('판독 층에 readWageTable 이 붙는다 — 기존 read 는 그대로다', () => {
  const R = loadRead();
  assert.equal(typeof R.readWageTable, 'function');
  assert.equal(typeof R.read, 'function', '기존 read 를 건드리면 안 됩니다');
});

test('★ 급여표에서 사람별 금액을 담아 온다 — kind=payslip 과 달리 이름·금액을 담는다', async () => {
  const R = loadRead();
  R.init({
    fetch: fakeFetch(JSON.stringify({
      company: '화담원', period: '2026-08', docName: '급여대장',
      rows: [
        { name: '홍길동', pairs: [{ item: '기본급', value: '3,200,000' }, { item: '실수령', value: '2,950,000' }] },
        { name: '김철수', pairs: [{ item: '기본급', value: '2,800,000' }] }
      ]
    })),
    getKey: () => Promise.resolve('KEY')
  });
  const r = await R.readWageTable(DUMMY_IMG);
  assert.equal(r.ok, true);
  assert.equal(r.error, null);
  assert.equal(r.company, '화담원');
  assert.equal(r.period, '2026-08');
  assert.equal(r.docName, '급여대장');
  assert.equal(r.rows.length, 2);
  assert.equal(r.rows[0].name, '홍길동');
  assert.equal(r.rows[0].pairs[0].item, '기본급');
  assert.equal(r.rows[0].pairs[0].value, '3,200,000');
});

test('이름 없는 줄은 버린다 — 빈 값 줄이 저장되면 안 된다', async () => {
  const R = loadRead();
  R.init({
    fetch: fakeFetch(JSON.stringify({
      company: '화담원', period: '2026-08',
      rows: [{ name: '', pairs: [{ item: '기본급', value: '1' }] }, { name: '홍길동', pairs: [] }]
    })),
    getKey: () => Promise.resolve('KEY')
  });
  const r = await R.readWageTable(DUMMY_IMG);
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].name, '홍길동');
  assert.equal(r.rows[0].pairs.length, 0);
});

test('항목 이름 없는 pairs 는 버린다', async () => {
  const R = loadRead();
  R.init({
    fetch: fakeFetch(JSON.stringify({
      rows: [{ name: '홍길동', pairs: [{ item: '', value: '1' }, { item: '기본급', value: '2' }] }]
    })),
    getKey: () => Promise.resolve('KEY')
  });
  const r = await R.readWageTable(DUMMY_IMG);
  assert.equal(r.rows[0].pairs.length, 1);
  assert.equal(r.rows[0].pairs[0].item, '기본급');
});

test('사람이 없어도 터지지 않는다', async () => {
  const R = loadRead();
  R.init({ fetch: fakeFetch(JSON.stringify({ company: 'x', rows: [] })), getKey: () => Promise.resolve('KEY') });
  const r = await R.readWageTable(DUMMY_IMG);
  assert.equal(r.ok, true);
  assert.equal(r.rows.length, 0);
});

test('AI 키가 없으면 부르지 않고 한국어로 알려준다', async () => {
  const R = loadRead();
  const f = fakeFetch('{}');
  R.init({ fetch: f, getKey: () => Promise.resolve('') });
  const r = await R.readWageTable(DUMMY_IMG);
  assert.equal(r.ok, false);
  assert.match(r.error, /키/);
  assert.equal(f.calls.length, 0);
});

test('사진이 없으면 부르지 않는다', async () => {
  const R = loadRead();
  const f = fakeFetch('{}');
  R.init({ fetch: f, getKey: () => Promise.resolve('KEY') });
  const r = await R.readWageTable('');
  assert.equal(r.ok, false);
  assert.equal(f.calls.length, 0);
});

test('AI가 JSON이 아닌 말을 해도 터지지 않는다', async () => {
  const R = loadRead();
  R.init({ fetch: fakeFetch('죄송합니다, 읽을 수 없습니다.'), getKey: () => Promise.resolve('KEY') });
  const r = await R.readWageTable(DUMMY_IMG);
  assert.equal(r.ok, false);
  assert.ok(r.error);
});

test('서버 오류에도 예외를 던지지 않는다', async () => {
  const R = loadRead();
  R.init({ fetch: fakeFetch('{}', { httpFail: true }), getKey: () => Promise.resolve('KEY') });
  const r = await R.readWageTable(DUMMY_IMG);
  assert.equal(r.ok, false);
  assert.ok(r.error);
});

test('여러 쪽을 한 문서로 함께 보낸다 — 기존 read() 와 같은 배관', async () => {
  const R = loadRead();
  const f = fakeFetch(JSON.stringify({ rows: [{ name: '홍길동', pairs: [{ item: '기본급', value: '1' }] }] }));
  R.init({ fetch: f, getKey: () => Promise.resolve('KEY') });
  await R.readWageTable([DUMMY_IMG, DUMMY_IMG]);
  assert.equal(f.calls[0].body.contents[0].parts.length, 3, '사진 두 장 + 지시문 한 개');
});

test('프롬프트가 항목 이름을 바꿔 적지 말라고 못 박는다', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'pu-doc-read.js'), 'utf8');
  assert.match(src, /WAGE_PROMPT/);
  assert.match(src, /바꿔 적지 마세요/);
  assert.match(src, /지어내지 말고 건너뛰세요/);
});

test('★ 기존 kind=payslip 프롬프트는 여전히 «금액»을 담지 않는다', () => {
  /* ⚠ 2026-09-01 대표 결정으로 **이름은 담는다** — 근로자 정보함이 「누구 것인가」를
     알아야 한다. 지키는 규칙은 그대로다: 급여데이터함용 함수를 더하면서 사진첩 등이
     함께 쓰는 payslip 프롬프트에 **금액을 끌어들이면 안 된다.** */
  const R = loadRead();
  assert.match(R.PROMPTS.all, /kind=payslip 이면 키: .*금액은 담지 마세요/,
    '급여데이터함용 함수를 더하면서 사진첩 등이 쓰는 payslip 프롬프트에 금액을 넣으면 안 됩니다');
  assert.doesNotMatch(R.PROMPTS.all, /kind=payslip 이면 키: .*pairs\(/,
    'payslip 에 pairs 가 생기면 금액이 통째로 딸려 옵니다');
});
