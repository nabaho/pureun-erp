'use strict';
// js/pu-doc-read.js 단위 검사 — 실행: node --test tests/*.test.js
//   (이 환경의 node는 --test 에 디렉터리 인자를 주면 죽는다. 반드시 glob으로 파일을 넘긴다.)
//
// 판독 층은 AI(Gemini)와 국세청에 붙는 층이다. 검사에서는 fetch 를 가짜로 주입한다 —
// 실제 서버에 절대 붙지 않고, 저장 기능이 아예 없으므로 실데이터를 건드릴 경로도 없다.
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

test('판독 층이 window에 붙는다', () => {
  assert.ok(loadRead(), 'window.PuDocRead 가 없습니다');
});

/* ── 사업자등록번호 검증 ──
   이 검사가 "검증 통과하면 자동 입력"의 근거다. AI가 한 자리 잘못 읽는 사고를
   기계가 잡아내는지 확인한다.
   검사에 쓰는 번호는 체크섬 계산으로 만든 값이고 실제 사업장을 가리키지 않는다. */

test('사업자등록번호 체크섬 — 유효/무효를 가른다', () => {
  const R = loadRead();
  assert.equal(R.bizNoValid('220-81-62517'), true);
  assert.equal(R.bizNoValid('2208162517'), true);
  assert.equal(R.bizNoValid('220 81 62517'), true);
  // 한 자리만 틀리면 걸러진다 — AI 오인식을 잡는 지점
  assert.equal(R.bizNoValid('220-81-62518'), false);
  // 자리 수가 안 맞거나 값이 없으면 false
  assert.equal(R.bizNoValid('220-81-6251'), false);
  assert.equal(R.bizNoValid('220-81-625171'), false);
  assert.equal(R.bizNoValid('가나다'), false);
  assert.equal(R.bizNoValid(''), false);
  assert.equal(R.bizNoValid(null), false);
  assert.equal(R.bizNoValid(undefined), false);
});

test('사업자등록번호 표기 정리', () => {
  const R = loadRead();
  assert.equal(R.bizNoDigits('220-81-62517'), '2208162517');
  assert.equal(R.bizNoDigits(null), '');
  assert.equal(R.fmtBizNo('2208162517'), '220-81-62517');
  assert.equal(R.fmtBizNo('220-81-62517'), '220-81-62517');
  // 이상한 값이 와도 터지지 않는다
  assert.equal(R.fmtBizNo(''), '');
  assert.equal(R.fmtBizNo(null), '');
  assert.equal(R.fmtBizNo('123'), '123');
});

/* ── 앱별 필드 이름 변환 ──
   같은 사업자등록번호를 앱마다 다르게 부른다(명함첩 bizno · 푸른이알피 bizNo ·
   기금관리 biz_no). 변환이 틀리면 조용히 안 붙고 아무도 모른다. */

test('사업자등록증 → 명함첩 필드', () => {
  const R = loadRead();
  const out = R.mapTo('cards', 'bizreg', {
    company: '가나상사', ceo: '홍길동', bizno: '220-81-62517',
    openDate: '2020-01-02', bizType: '제조업', bizItem: '금속가공', address: '천안시'
  });
  assert.equal(out.kind, 'biz');       // 명함첩은 종류 칸이 있다
  assert.equal(out.company, '가나상사');
  assert.equal(out.bizno, '220-81-62517');
  assert.equal(out.bizItem, '금속가공');
  assert.equal(out.openDate, '2020-01-02');
});

test('사업자등록증 → 사업장 정보(푸른이알피) 필드', () => {
  const R = loadRead();
  const out = R.mapTo('erp', 'bizreg', {
    company: '가나상사', ceo: '홍길동', bizno: '2208162517',
    bizType: '제조업', bizItem: '금속가공', address: '천안시', companyTel: '041-000-0000'
  });
  assert.equal(out.name, '가나상사');        // 회사명은 name
  assert.equal(out.bizNo, '220-81-62517');   // 대문자 N + 보기 좋은 꼴
  assert.equal(out.bizCategory, '금속가공');  // 종목은 bizCategory
  assert.equal(out.bizType, '제조업');
  assert.equal(out.phone, '041-000-0000');
  assert.equal(out.address, '천안시');
  assert.ok(!('company' in out), '원래 이름이 남아 있으면 앱이 못 읽습니다');
  assert.ok(!('kind' in out), '종류 칸이 없는 앱에 kind 를 실으면 쓰레기 필드가 생깁니다');
});

test('사업자등록증 → 기금 참여사업장 필드', () => {
  const R = loadRead();
  const out = R.mapTo('fund', 'bizreg', {
    company: '가나상사', ceo: '홍길동', bizno: '2208162517', bizType: '제조업', address: '천안시'
  });
  assert.equal(out.name, '가나상사');
  assert.equal(out.biz_no, '220-81-62517'); // 기금은 스네이크
  assert.equal(out.biz_type, '제조업');
  assert.equal(out.address, '천안시');
});

test('명함 → 명함첩 필드는 이름이 그대로다', () => {
  const R = loadRead();
  const out = R.mapTo('cards', 'card', { name: '홍길동', company: '가나상사', mobile: '010-1234-5678' });
  assert.equal(out.kind, 'card');
  assert.equal(out.name, '홍길동');
  assert.equal(out.mobile, '010-1234-5678');
});

test('중소기업확인서 → 사업장 정보 필드 (기업규모가 들어간다)', () => {
  const R = loadRead();
  const out = R.mapTo('erp', 'sme', { company: '가나상사', bizno: '2208162517', smeType: '소기업', industry: '금속가공' });
  assert.equal(out.name, '가나상사');
  assert.equal(out.bizNo, '220-81-62517');
  assert.equal(out.companySize, '소기업');
  assert.equal(out.industry, '금속가공');
});

test('빈 값은 실어 보내지 않는다 — 기존 값을 빈 값으로 덮어쓰면 안 된다', () => {
  const R = loadRead();
  const out = R.mapTo('erp', 'bizreg', { company: '가나상사', ceo: '', bizno: '', address: null, bizType: '   ' });
  assert.equal(out.name, '가나상사');
  assert.ok(!('ceo' in out), '빈 대표자가 실려 기존 대표자를 지웁니다');
  assert.ok(!('bizNo' in out));
  assert.ok(!('address' in out));
  assert.ok(!('bizType' in out), '공백만 있는 값도 빼야 합니다');
});

test('모르는 목적지·종류는 빈 객체 — 엉뚱한 곳에 조용히 쓰지 않는다', () => {
  const R = loadRead();
  assert.deepEqual({ ...R.mapTo('아무거나', 'bizreg', { company: 'x' }) }, {});
  assert.deepEqual({ ...R.mapTo('erp', '아무거나', { company: 'x' }) }, {});
  assert.deepEqual({ ...R.mapTo('erp', 'card', { name: 'x' }) }, {});
  assert.deepEqual({ ...R.mapTo() }, {});
});

/* ── 판독 (Gemini) ──
   가짜 fetch 만 쓴다. 실제 AI·국세청에 붙지 않는다. */

function fakeFetch(reply, opts) {
  const calls = [];
  const fn = function (url, init) {
    calls.push({ url: url, body: JSON.parse(init.body) });
    if (opts && opts.httpFail) return Promise.resolve({ ok: false, status: 429, json: () => Promise.resolve({}) });
    if (opts && opts.network) return Promise.reject(new Error('네트워크 없음'));
    return Promise.resolve({
      ok: true, status: 200,
      json: () => Promise.resolve({ candidates: [{ content: { parts: [{ text: reply }] } }] })
    });
  };
  fn.calls = calls;
  return fn;
}
const DUMMY_IMG = 'data:image/jpeg;base64,AAAA';

test('사업자등록증을 읽고 번호 검증까지 한다', async () => {
  const R = loadRead();
  R.init({
    fetch: fakeFetch('```json\n{"kind":"bizreg","company":"가나상사","ceo":"홍길동","bizno":"220-81-62517"}\n```'),
    getKey: () => Promise.resolve('KEY')
  });
  const r = await R.read(DUMMY_IMG);
  assert.equal(r.kind, 'bizreg');
  assert.equal(r.fields.company, '가나상사');
  assert.equal(r.fields.ceo, '홍길동');
  assert.equal(r.bizNoOk, true);
  assert.equal(r.error, null);
  // 국세청 키를 안 넣었으므로 '조회하지 않았다'고 정확히 말해야 한다
  assert.equal(r.ntsChecked, false);
  assert.equal(r.ntsState, null);
});

test('번호가 한 자리 틀리면 검증에 걸린다 — 자동 입력하면 안 되는 경우', async () => {
  const R = loadRead();
  R.init({ fetch: fakeFetch('{"kind":"bizreg","company":"가나상사","bizno":"220-81-62518"}'),
           getKey: () => Promise.resolve('KEY') });
  const r = await R.read(DUMMY_IMG);
  assert.equal(r.bizNoOk, false);
});

test('명함은 번호 검증 대상이 아니다 (null, false 아님)', async () => {
  const R = loadRead();
  R.init({ fetch: fakeFetch('{"kind":"card","name":"홍길동","mobile":"010-1234-5678"}'),
           getKey: () => Promise.resolve('KEY') });
  const r = await R.read(DUMMY_IMG);
  assert.equal(r.kind, 'card');
  assert.equal(r.bizNoOk, null, '검증 대상이 아닌데 false 로 두면 화면이 실패로 오해합니다');
});

test('중소기업확인서는 유효기간을 읽는다', async () => {
  const R = loadRead();
  R.init({ fetch: fakeFetch('{"kind":"sme","company":"가나상사","bizno":"2208162517","smeType":"소기업","expiry":"2027-03-31"}'),
           getKey: () => Promise.resolve('KEY') });
  const r = await R.read(DUMMY_IMG);
  assert.equal(r.kind, 'sme');
  assert.equal(r.fields.expiry, '2027-03-31');
  assert.equal(r.fields.smeType, '소기업');
  assert.equal(r.bizNoOk, true);
  assert.equal(r.fields.bizno, '220-81-62517', '번호를 보기 좋은 꼴로 정리해야 합니다');
});

test('서류가 아니면 other 로 두고 억지로 맞추지 않는다', async () => {
  const R = loadRead();
  R.init({ fetch: fakeFetch('{"kind":"other"}'), getKey: () => Promise.resolve('KEY') });
  const r = await R.read(DUMMY_IMG);
  assert.equal(r.kind, 'other');
  assert.equal(r.error, null, '서류가 아닌 것은 실패가 아닙니다');
});

test('모르는 종류가 오면 other 로 떨어뜨린다', async () => {
  const R = loadRead();
  R.init({ fetch: fakeFetch('{"kind":"여권","name":"홍길동"}'), getKey: () => Promise.resolve('KEY') });
  const r = await R.read(DUMMY_IMG);
  assert.equal(r.kind, 'other');
});

test('프롬프트에 세 종류와 읽을 항목이 모두 들어 있다', () => {
  const R = loadRead();
  const p = R.PROMPTS.all;
  for (const w of ['명함', '사업자등록증', '중소기업확인서', 'bizno', 'expiry', 'kind', 'smeType']) {
    assert.ok(p.includes(w), '프롬프트에 ' + w + ' 가 없습니다');
  }
  assert.match(p, /JSON으로만|JSON 외/, 'JSON만 답하라는 지시가 없습니다');
  assert.match(p, /추측하지/, '사업자번호를 추측하지 말라는 지시가 없습니다');
});

/* 한글 우선(2026-08-07 대표 지시) — 명함에 한글·영문이 나란히 있으면 한글을 담는다.
   영문을 담으면 명함첩·업체관리에서 한글로 찾는 사람이 못 찾고 같은 회사가 두 벌로 쌓인다. */
test('★ 한글과 영문이 함께 있으면 한글을 담으라고 지시한다', () => {
  const p = loadRead().PROMPTS.all;
  assert.ok(/한글 우선/.test(p), '한글 우선 지시가 없습니다.');
  assert.ok(/한글 표기를 \*\*담으세요|한글 표기를 담으세요|한글 쪽을 고릅니다/.test(p),
    '무엇을 고를지가 분명하지 않습니다.');
  assert.ok(/한글이 없을 때만 영문/.test(p),
    '한글이 없는 칸까지 비우면 정보를 잃습니다.');
});

test('★ 없는 한글을 지어내지 말라고 못 박는다', () => {
  const p = loadRead().PROMPTS.all;
  assert.ok(/번역하거나 소리나는 대로 옮겨 적지 마세요/.test(p),
    '영문을 한글로 옮겨 적으면 실제와 다른 회사명이 업체관리에 들어갑니다.');
});

test('이메일·홈페이지는 한글 우선에서 빼 둔다', () => {
  const p = loadRead().PROMPTS.all;
  assert.ok(/이메일·홈페이지는 원래 영문/.test(p),
    '이 단서가 없으면 AI가 메일 주소까지 한글로 바꾸려 듭니다.');
});

/* ⚠ 프롬프트를 고치면 판독 번호를 반드시 올려야 한다 — 안 올리면 이미 읽어 둔
   사진은 옛 방식(영문) 그대로 굳는다. 2026-08-06 에 실제로 당했다(회의사진 0장). */
test('★ 프롬프트를 고쳤으면 판독 번호가 올라가 있다', () => {
  const R = loadRead();
  assert.ok(R.READ_VERSION >= 3,
    '번호를 안 올리면 이미 읽은 명함이 영문 그대로 굳습니다.');
});

test('AI 키가 없으면 부르지 않고 한국어로 알려준다', async () => {
  const R = loadRead();
  const f = fakeFetch('{}');
  R.init({ fetch: f, getKey: () => Promise.resolve('') });
  const r = await R.read(DUMMY_IMG);
  assert.equal(r.kind, 'other');
  assert.match(r.error, /키/);
  assert.equal(f.calls.length, 0, '키가 없는데 서버를 불렀습니다');
});

test('서버 오류·네트워크 끊김에도 예외를 던지지 않는다', async () => {
  const R1 = loadRead();
  R1.init({ fetch: fakeFetch('{}', { httpFail: true }), getKey: () => Promise.resolve('KEY') });
  const a = await R1.read(DUMMY_IMG);
  assert.equal(a.kind, 'other');
  assert.ok(a.error, '실패 이유가 없습니다');

  const R2 = loadRead();
  R2.init({ fetch: fakeFetch('{}', { network: true }), getKey: () => Promise.resolve('KEY') });
  const b = await R2.read(DUMMY_IMG);
  assert.equal(b.kind, 'other');
  assert.ok(b.error);
});

/* ── 일시적 실패는 스스로 다시 시도한다 ──
   실사용 보고(2026-08-03): 사업자등록증을 올렸는데 'AI 응답 오류 429' 로 끝났다.
   429는 "잠시 바쁘다"는 뜻이라 조금 기다렸다 다시 부르면 되는 경우다.
   한 번 실패로 끝내면 사용자는 서류가 잘못된 줄 안다. */

// 앞의 n번은 실패시키고 그 뒤엔 성공시키는 가짜 서버
function flakyFetch(failTimes, status, reply) {
  let n = 0;
  const fn = function () {
    n++;
    if (n <= failTimes) {
      return Promise.resolve({ ok: false, status: status, json: () => Promise.resolve({}) });
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({
      candidates: [{ content: { parts: [{ text: reply }] } }] }) });
  };
  fn.tries = function () { return n; };
  return fn;
}
// 기다리지 않고 곧바로 진행하는 가짜 기다림 (검사가 느려지지 않게)
const noWait = function (fn) { fn(); };

test('AI가 바쁘면(429) 기다렸다 스스로 다시 시도한다', async () => {
  const R = loadRead();
  const f = flakyFetch(2, 429, '{"kind":"bizreg","company":"가나상사","bizno":"220-81-62517"}');
  R.init({ fetch: f, getKey: () => Promise.resolve('KEY'), delay: noWait });
  const r = await R.read(DUMMY_IMG);
  assert.equal(r.kind, 'bizreg', '다시 시도해서 읽어냈어야 합니다');
  assert.equal(f.tries(), 3);
  assert.equal(r.error, null);
});

test('서버가 잠깐 죽어도(503) 다시 시도한다', async () => {
  const R = loadRead();
  const f = flakyFetch(1, 503, '{"kind":"card","name":"홍길동"}');
  R.init({ fetch: f, getKey: () => Promise.resolve('KEY'), delay: noWait });
  assert.equal((await R.read(DUMMY_IMG)).kind, 'card');
});

test('계속 바쁘면 포기하되, 서류가 잘못된 것처럼 말하지 않는다', async () => {
  const R = loadRead();
  const f = flakyFetch(99, 429, '{}');
  R.init({ fetch: f, getKey: () => Promise.resolve('KEY'), delay: noWait });
  const r = await R.read(DUMMY_IMG);
  assert.ok(r.error, '실패 이유가 없습니다');
  // 무한정 부르면 안 된다. 상한 = 모델 수 × (처음 1 + 다시 2)
  const cap = R.MODELS.length * 3;
  assert.ok(f.tries() <= cap, '다시 시도를 너무 많이 합니다: ' + f.tries() + ' (상한 ' + cap + ')');
  // 사람이 무엇을 하면 되는지 알 수 있어야 한다
  assert.match(r.error, /잠시|다시/, '기다렸다 다시 하라는 안내가 없습니다');
  assert.ok(!/서류가 아/.test(r.error), '서류가 잘못된 것처럼 말합니다: ' + r.error);
});

test('키가 틀린 것(400·403)은 다시 시도해도 소용없다 — 곧바로 알려준다', async () => {
  const R = loadRead();
  const f = flakyFetch(99, 403, '{}');
  R.init({ fetch: f, getKey: () => Promise.resolve('KEY'), delay: noWait });
  const r = await R.read(DUMMY_IMG);
  assert.equal(f.tries(), 1, '고쳐질 수 없는 오류로 서버를 여러 번 불렀습니다');
  assert.ok(r.error);
});

test('판독 실패는 「서류로 보이지 않음」과 다른 것이다', async () => {
  // 실사용 보고: 사업자등록증이 맞는데 '서류로 보이지 않음' 이라고 떴다.
  // 판독 실패(error 있음)와 정말 서류가 아닌 것(error 없음)을 화면이 가를 수 있어야 한다.
  const R1 = loadRead();
  R1.init({ fetch: flakyFetch(99, 429, '{}'), getKey: () => Promise.resolve('KEY'), delay: noWait });
  const failed = await R1.read(DUMMY_IMG);
  assert.ok(failed.error, '판독 실패에는 error 가 있어야 한다');

  const R2 = loadRead();
  R2.init({ fetch: fakeFetch('{"kind":"other"}'), getKey: () => Promise.resolve('KEY') });
  const notDoc = await R2.read(DUMMY_IMG);
  assert.equal(notDoc.error, null, '정말 서류가 아닌 것에는 error 가 없어야 한다');
});

/* ── 모델이 없어져도 버틴다 ──
   실사용 보고(2026-08-03): 계속 429가 났고, 원인은 사용량이 아니라
   `gemini-2.0-flash` 가 2026-06-01 에 서비스 종료된 것이었다.
   모델 이름을 한 곳에 박아 두면 구글이 모델을 내릴 때마다 앱이 조용히 멈춘다.
   그래서 여러 모델을 차례로 시도하고, 되는 것을 기억한다. */

// 모델 이름별로 다르게 응답하는 가짜 서버
function modelFetch(behavior, reply) {
  const seen = [];
  const fn = function (url, init) {
    const m = /models\/([^:]+):/.exec(url);
    const model = m ? m[1] : '?';
    seen.push(model);
    const how = behavior[model] || 'ok';
    if (how === 'ok') {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({
        candidates: [{ content: { parts: [{ text: reply }] } }] }) });
    }
    return Promise.resolve({
      ok: false, status: how,
      json: () => Promise.resolve({ error: { message: '모델을 찾을 수 없습니다', status: 'NOT_FOUND' } })
    });
  };
  fn.seen = seen;
  fn.models = function () { return seen.filter(function (v, i) { return seen.indexOf(v) === i; }); };
  return fn;
}

test('여러 모델을 쓴다 — 하나에 매달리지 않는다', () => {
  const R = loadRead();
  assert.ok(Array.isArray(R.MODELS), 'MODELS 목록이 없습니다');
  assert.ok(R.MODELS.length >= 2, '모델이 하나뿐이면 그것이 없어질 때 앱이 멈춥니다');
  // 서비스 종료된 모델을 쓰고 있지 않은지
  assert.ok(R.MODELS.indexOf('gemini-2.0-flash') < 0,
    'gemini-2.0-flash 는 2026-06-01 에 종료됐습니다');
});

test('첫 모델이 없어졌으면(404) 다음 모델로 넘어가 읽어낸다', async () => {
  const R = loadRead();
  const first = R.MODELS[0];
  const behavior = {}; behavior[first] = 404;
  const f = modelFetch(behavior, '{"kind":"card","name":"홍길동"}');
  R.init({ fetch: f, getKey: () => Promise.resolve('KEY'), delay: noWait });
  const r = await R.read(DUMMY_IMG);
  assert.equal(r.kind, 'card', '다음 모델로 읽어냈어야 합니다');
  assert.ok(f.models().length >= 2, '다음 모델을 시도하지 않았습니다');
});

test('첫 모델이 계속 바쁘면(429) 다음 모델로 넘어간다', async () => {
  // 종료된 모델은 429(사용 가능 한도 0)로 나오기도 한다 — 실제로 그랬다.
  const R = loadRead();
  const first = R.MODELS[0];
  const behavior = {}; behavior[first] = 429;
  const f = modelFetch(behavior, '{"kind":"bizreg","company":"가나상사","bizno":"220-81-62517"}');
  R.init({ fetch: f, getKey: () => Promise.resolve('KEY'), delay: noWait });
  const r = await R.read(DUMMY_IMG);
  assert.equal(r.kind, 'bizreg');
  assert.equal(r.bizNoOk, true);
});

test('되는 모델을 기억해 다음 판독에서 바로 쓴다', async () => {
  const R = loadRead();
  const first = R.MODELS[0];
  const behavior = {}; behavior[first] = 404;
  const f = modelFetch(behavior, '{"kind":"card","name":"홍길동"}');
  R.init({ fetch: f, getKey: () => Promise.resolve('KEY'), delay: noWait });
  await R.read(DUMMY_IMG);
  const afterFirst = f.seen.length;
  await R.read(DUMMY_IMG);
  // 두 번째 판독은 안 되는 모델을 다시 두드리지 않는다
  assert.equal(f.seen.length, afterFirst + 1,
    '되는 모델을 기억하지 않아 매번 헛걸음합니다: ' + JSON.stringify(f.seen));
});

test('모든 모델이 안 되면 AI가 준 설명을 그대로 남긴다', async () => {
  // 이번 사고의 교훈: 우리 문구만 보여주고 AI의 설명을 버렸더니
  // '사용량 초과'로 잘못 짚었다. 실제로는 모델이 없어진 것이었다.
  const R = loadRead();
  const behavior = {};
  R.MODELS.forEach(function (m) { behavior[m] = 404; });
  const f = modelFetch(behavior, '{}');
  R.init({ fetch: f, getKey: () => Promise.resolve('KEY'), delay: noWait });
  const r = await R.read(DUMMY_IMG);
  assert.ok(r.error, '실패 이유가 없습니다');
  assert.match(r.error, /모델을 찾을 수 없습니다/, 'AI가 준 설명을 버렸습니다: ' + r.error);
});

test('AI가 JSON이 아닌 말을 해도 터지지 않는다', async () => {
  const R = loadRead();
  R.init({ fetch: fakeFetch('죄송합니다, 읽을 수 없습니다.'), getKey: () => Promise.resolve('KEY') });
  const r = await R.read(DUMMY_IMG);
  assert.equal(r.kind, 'other');
  assert.ok(r.error);
});

test('AI가 앞뒤에 말을 붙여도 JSON만 골라낸다', async () => {
  const R = loadRead();
  R.init({ fetch: fakeFetch('알겠습니다. {"kind":"card","name":"홍길동"} 이상입니다.'),
           getKey: () => Promise.resolve('KEY') });
  const r = await R.read(DUMMY_IMG);
  assert.equal(r.kind, 'card');
  assert.equal(r.fields.name, '홍길동');
});

test('사진 데이터를 그대로 싣고 키를 주소에 넣는다', async () => {
  const R = loadRead();
  const f = fakeFetch('{"kind":"card","name":"홍길동"}');
  R.init({ fetch: f, getKey: () => Promise.resolve('KEY123') });
  await R.read('data:image/jpeg;base64,ZZZZ');
  assert.equal(f.calls.length, 1);
  assert.ok(f.calls[0].url.includes('KEY123'));
  assert.equal(f.calls[0].body.contents[0].parts[0].inline_data.data, 'ZZZZ',
    '사진 데이터가 실리지 않았습니다');
  // 같은 사진에 같은 답이 나와야 한다
  assert.equal(f.calls[0].body.generationConfig.temperature, 0);
});

test('사진이 없으면 부르지 않는다', async () => {
  const R = loadRead();
  const f = fakeFetch('{}');
  R.init({ fetch: f, getKey: () => Promise.resolve('KEY') });
  const r = await R.read('');
  assert.equal(r.kind, 'other');
  assert.ok(r.error);
  assert.equal(f.calls.length, 0);
});

/* ── 국세청 실제 조회 ── */

// 주소로 갈라 응답하는 가짜 서버 (Gemini / 국세청)
function fakeBoth(geminiText, ntsResult, opts) {
  const seen = { nts: 0 };
  const fn = function (url) {
    if (url.indexOf('odcloud') >= 0) {
      seen.nts++;
      if (opts && opts.ntsFail) return Promise.reject(new Error('국세청 응답 없음'));
      return Promise.resolve({ ok: true, json: () => Promise.resolve(ntsResult) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({
      candidates: [{ content: { parts: [{ text: geminiText }] } }] }) });
  };
  fn.seen = seen;
  return fn;
}

test('국세청 키가 있으면 조회해서 상태를 담는다', async () => {
  const R = loadRead();
  const f = fakeBoth('{"kind":"bizreg","company":"가나상사","bizno":"220-81-62517"}',
    { data: [{ b_stt: '계속사업자' }] });
  R.init({ fetch: f, getKey: () => Promise.resolve('KEY'), getNtsKey: () => Promise.resolve('NTS') });
  const r = await R.read(DUMMY_IMG);
  assert.equal(f.seen.nts, 1);
  assert.equal(r.ntsChecked, true);
  assert.equal(r.ntsState, '계속사업자');
});

test('체크섬에서 이미 걸린 번호는 국세청에 묻지 않는다', async () => {
  const R = loadRead();
  const f = fakeBoth('{"kind":"bizreg","company":"가나상사","bizno":"220-81-62518"}', { data: [] });
  R.init({ fetch: f, getKey: () => Promise.resolve('KEY'), getNtsKey: () => Promise.resolve('NTS') });
  const r = await R.read(DUMMY_IMG);
  assert.equal(f.seen.nts, 0, '틀린 번호로 국세청을 부르면 헛일입니다');
  assert.equal(r.ntsChecked, false);
});

test('명함은 국세청에 묻지 않는다', async () => {
  const R = loadRead();
  const f = fakeBoth('{"kind":"card","name":"홍길동"}', { data: [{ b_stt: '계속사업자' }] });
  R.init({ fetch: f, getKey: () => Promise.resolve('KEY'), getNtsKey: () => Promise.resolve('NTS') });
  await R.read(DUMMY_IMG);
  assert.equal(f.seen.nts, 0);
});

test('국세청 조회가 실패해도 판독 결과는 살린다', async () => {
  const R = loadRead();
  const f = fakeBoth('{"kind":"bizreg","company":"가나상사","bizno":"220-81-62517"}', null, { ntsFail: true });
  R.init({ fetch: f, getKey: () => Promise.resolve('KEY'), getNtsKey: () => Promise.resolve('NTS') });
  const r = await R.read(DUMMY_IMG);
  assert.equal(r.fields.company, '가나상사');
  assert.equal(r.bizNoOk, true);
  assert.equal(r.ntsChecked, false, '조회 못 했는데 했다고 하면 안 됩니다');
  assert.equal(r.error, null, '국세청 실패가 판독 실패로 번지면 안 됩니다');
});

test('국세청에 자료가 없어도 판독 결과는 살린다', async () => {
  const R = loadRead();
  const f = fakeBoth('{"kind":"bizreg","company":"가나상사","bizno":"220-81-62517"}', { data: [] });
  R.init({ fetch: f, getKey: () => Promise.resolve('KEY'), getNtsKey: () => Promise.resolve('NTS') });
  const r = await R.read(DUMMY_IMG);
  assert.equal(r.bizNoOk, true);
  assert.equal(r.ntsChecked, false);
});

test('폐업자로 나오면 상태를 그대로 남긴다 (판단은 부르는 쪽이 한다)', async () => {
  const R = loadRead();
  const f = fakeBoth('{"kind":"bizreg","company":"가나상사","bizno":"220-81-62517"}',
    { data: [{ b_stt: '폐업자' }] });
  R.init({ fetch: f, getKey: () => Promise.resolve('KEY'), getNtsKey: () => Promise.resolve('NTS') });
  const r = await R.read(DUMMY_IMG);
  assert.equal(r.ntsState, '폐업자');
  assert.equal(r.bizNoOk, true, '번호 자체는 맞으므로 검증은 통과다');
});

/* ── 자동 입력 판정 ── */

test('사업자등록증 — 번호 검증을 통과하면 자동 입력', () => {
  const R = loadRead();
  const v = R.autoOk({ kind: 'bizreg', fields: { company: '가나상사' }, bizNoOk: true, ntsChecked: false, error: null });
  assert.equal(v.auto, true);
});

test('사업자등록증 — 번호가 걸리면 사람 확인, 이유를 한국어로', () => {
  const R = loadRead();
  const v = R.autoOk({ kind: 'bizreg', fields: { company: '가나상사' }, bizNoOk: false, ntsChecked: false, error: null });
  assert.equal(v.auto, false);
  assert.match(v.why, /사업자등록번호/);
  assert.ok(!/[A-Za-z]{4,}/.test(v.why), '영어 내부 용어가 노출됩니다: ' + v.why);
});

test('폐업자·휴업자는 사람이 봐야 한다', () => {
  const R = loadRead();
  const closed = R.autoOk({ kind: 'bizreg', fields: { company: '가나상사' }, bizNoOk: true, ntsChecked: true, ntsState: '폐업자', error: null });
  assert.equal(closed.auto, false);
  assert.match(closed.why, /폐업/);
  const rest = R.autoOk({ kind: 'bizreg', fields: { company: '가나상사' }, bizNoOk: true, ntsChecked: true, ntsState: '휴업자', error: null });
  assert.equal(rest.auto, false);
  const live = R.autoOk({ kind: 'bizreg', fields: { company: '가나상사' }, bizNoOk: true, ntsChecked: true, ntsState: '계속사업자', error: null });
  assert.equal(live.auto, true);
});

test('명함 — 검증할 것이 없으므로 자동', () => {
  const R = loadRead();
  assert.equal(R.autoOk({ kind: 'card', fields: { name: '홍길동' }, bizNoOk: null, error: null }).auto, true);
});

test('이름도 회사도 못 읽었으면 자동으로 넣지 않는다', () => {
  const R = loadRead();
  assert.equal(R.autoOk({ kind: 'card', fields: {}, bizNoOk: null, error: null }).auto, false);
  assert.equal(R.autoOk({ kind: 'bizreg', fields: { bizno: '220-81-62517' }, bizNoOk: true, error: null }).auto, false);
});

test('중소기업확인서 — 유효기간이 지났으면 사람 확인', () => {
  const R = loadRead();
  const now = new Date(2026, 7, 3).getTime();
  const past = R.autoOk({ kind: 'sme', fields: { company: '가나상사', expiry: '2020-01-01' }, bizNoOk: true, error: null }, now);
  assert.equal(past.auto, false);
  assert.match(past.why, /유효기간|만료/);
  const ok = R.autoOk({ kind: 'sme', fields: { company: '가나상사', expiry: '2027-03-31' }, bizNoOk: true, error: null }, now);
  assert.equal(ok.auto, true);
  // 유효기간을 못 읽은 것만으로 막지는 않는다(번호가 맞으면 넣을 값이 있다)
  const noExp = R.autoOk({ kind: 'sme', fields: { company: '가나상사' }, bizNoOk: true, error: null }, now);
  assert.equal(noExp.auto, true);
});

test('판독 자체가 실패했거나 서류가 아니면 자동이 아니다', () => {
  const R = loadRead();
  assert.equal(R.autoOk({ kind: 'other', fields: {}, error: null }).auto, false);
  assert.equal(R.autoOk({ kind: 'card', fields: { name: '홍길동' }, error: 'AI 키가 없습니다' }).auto, false);
  assert.equal(R.autoOk().auto, false);
  assert.equal(R.autoOk({}).auto, false);
});

/* ── AI 키를 어디서 얻는가 ──
   앱마다 키 읽는 코드를 복사하면 한 곳만 고쳐도 앱마다 다른 키를 보게 된다.
   또 사진첩 화면에는 다른 앱 루트(pucards·data) 이름을 쓰면 안 되므로(정적 검사),
   키가 어디 있는지도 이 층이 알아야 한다. */

// 실시간DB 흉내 — 경로별 값을 준다.
function fakeDbKeys(map) {
  const asked = [];
  return {
    asked,
    ref(p) {
      asked.push(p);
      return { once: () => Promise.resolve({ val: () => (p in map ? map[p] : null) }) };
    }
  };
}

test('AI 키 — 이 기기 → 명함첩 공유 → 포털 공용 순서로 찾는다', async () => {
  const R = loadRead({ window: { localStorage: { getItem: () => 'LOCAL' } } });
  const db = fakeDbKeys({ 'pucards/config/geminiKey': 'SHARED', 'data/app_config/geminiKey': 'PORTAL' });
  assert.equal(await R.keysFrom(db).getKey(), 'LOCAL');

  const R2 = loadRead({ window: { localStorage: { getItem: () => null } } });
  assert.equal(await R2.keysFrom(db).getKey(), 'SHARED');

  const R3 = loadRead({ window: { localStorage: { getItem: () => null } } });
  assert.equal(await R3.keysFrom(fakeDbKeys({ 'data/app_config/geminiKey': 'PORTAL' })).getKey(), 'PORTAL');
});

test('AI 키 — 아무 데도 없으면 빈 문자열 (예외를 던지지 않는다)', async () => {
  const R = loadRead({ window: { localStorage: { getItem: () => null } } });
  assert.equal(await R.keysFrom(fakeDbKeys({})).getKey(), '');
});

test('AI 키 — 실시간DB 읽기가 막혀도 예외를 던지지 않는다', async () => {
  const R = loadRead({ window: { localStorage: { getItem: () => null } } });
  const badDb = { ref: () => ({ once: () => Promise.reject(new Error('권한 없음')) }) };
  assert.equal(await R.keysFrom(badDb).getKey(), '');
});

test('국세청 키는 포털 공용 설정에서만 찾는다', async () => {
  const R = loadRead({ window: { localStorage: { getItem: () => null } } });
  const db = fakeDbKeys({ 'data/app_config/ntsKey': 'NTS' });
  assert.equal(await R.keysFrom(db).getNtsKey(), 'NTS');
  assert.ok(db.asked.every(p => p.indexOf('pucards') < 0), '국세청 키를 명함첩에서 찾고 있습니다');
});

test('키 함수는 db 가 없어도 터지지 않는다', async () => {
  const R = loadRead({ window: { localStorage: { getItem: () => null } } });
  assert.equal(await R.keysFrom(null).getKey(), '');
  assert.equal(await R.keysFrom(null).getNtsKey(), '');
});

test('자동이 아닐 때는 이유가 항상 있다 — 화면이 아무 말도 못 하면 안 된다', () => {
  const R = loadRead();
  const cases = [
    undefined, {}, { kind: 'other', fields: {} }, { kind: 'card', fields: {} },
    { kind: 'bizreg', fields: { company: 'x' }, bizNoOk: false },
    { kind: 'card', fields: { name: 'x' }, error: '무슨 오류' },
    { kind: 'sme', fields: { company: 'x', expiry: '2000-01-01' }, bizNoOk: true }
  ];
  for (const c of cases) {
    const v = R.autoOk(c, new Date(2026, 7, 3).getTime());
    assert.equal(v.auto, false, JSON.stringify(c) + ' 는 자동이 아니어야 합니다');
    assert.ok(v.why && v.why.length > 0, JSON.stringify(c) + ': 이유가 비어 있습니다');
  }
});
