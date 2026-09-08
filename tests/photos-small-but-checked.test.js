'use strict';
/* 작아도 «기계가 확인한» 것은 할 일이 아니다 — 대표 결정 2026-08-23

   "원본이 작다고 되어 있다. 그렇더라도 내용이 모두 제대로 정리가 되어 있다.
    이럴 경우 확인필요로 분류할 필요는 없어 보인다. 직접 사람이 또 체크할 필요가
    없어 보이는데 어떻게 쉽게 처리해야 하나"

   크기는 «원인을 짐작하는 자»였을 뿐이다. 걱정한 것은 작아서 못 읽는 것이 아니라
   AI가 흐린 자리를 지어내는 것이었다(8/13 지시). 그러면 물어야 할 것은 「몇
   픽셀인가」가 아니라 「읽어낸 값이 기계로 확인되는가」다.

   실데이터: 이 경고로 남아 있던 43장이 **전부** 사업자등록번호 체크섬을 통과한
   사업자등록증이었다 — 사람이 다시 볼 것이 없는데 목록만 채우고 있었다.

   ⚠ 풀어 준 곳과 «안» 풀어 준 곳을 둘 다 못박는다. 확인할 길이 없는 종류
     (계약서·근태표·서식·대화캡처)에서 풀면 지어낸 값이 조용히 흘러간다.

   실행: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');
const css = (app.match(/<style>([\s\S]*?)<\/style>/) || [, ''])[1];

/* ⚠ 중괄호를 세어 그 함수만 자른다 — `[\s\S]*?\n\}` 로는 들여쓴 함수의 끝을
   못 찾아 뒤따르는 함수까지 삼킨다(이 저장소가 여러 번 당했다). */
function fnOf(name) {
  const i = app.indexOf('function ' + name + '(');
  assert.ok(i >= 0, name + ' 를 찾지 못했습니다');
  let d = 0;
  for (let k = app.indexOf('{', i); k < app.length; k++) {
    if (app[k] === '{') d++;
    else if (app[k] === '}') { d--; if (!d) return app.slice(i, k + 1); }
  }
  throw new Error(name + ' 의 끝을 찾지 못했습니다');
}

/* 판정하는 함수들을 «실제로 돌린다» — 글자 모양만 보면 어떤 짝에서 어떻게
   갈리는지를 못 잡는다. 여기서 보고 싶은 것이 바로 그 짝이다. */
function load() {
  const consts = ['MIN_READ_EDGE', 'KEEP_ONLY', 'CARD_KINDS', 'CO_KINDS', 'WORKER_KINDS', 'TEL_SHAPE', 'MAIL_SHAPE']
    .map(function (n) {
      const i = app.indexOf('const ' + n + ' =');
      assert.ok(i > 0, n + ' 를 찾지 못했습니다');
      /* 선언 끝(;)까지 — 안에 세미콜론이 없는 리터럴들이다 */
      return app.slice(i, app.indexOf(';', i) + 1);
    }).join('\n');
  const src = consts + '\n' +
    ['tooSmall', 'smallCheckedOk', 'readAnyField', 'coFilledOk', 'coTodo',
     /* ⚠ 2026-09-01 근로자 서류 넷 */
     'canSendWorker', 'workerWhyNot',
     /* ⚠ 2026-09-02 💰 임금 확인 */
     'wageRead', 'wageOkOf', 'wageBoxOn', 'wageNeedsOk', 
     'needsCheck', 'checkWhy']
      .map(fnOf).join('\n');
  const ctx = { Math, Number, String, Object, Boolean, Date };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return ctx;
}
const S = load();

function it(kind, extra, w, h) {
  return { meta: Object.assign({ w: w || 360, h: h || 213 },
    { read: Object.assign({ kind: kind, auto: true, fields: {} }, extra || {}) }) };
}

/* ══════ ① 풀어 준 곳 ══════ */

test('★ 사업자등록증 — 번호 체크섬을 통과했으면 작아도 할 일이 아니다', () => {
  /* 실데이터 43장이 정확히 이 꼴이었다(bizNoOk=O, 국세청 조회는 안 함).
     ⚠ filedCo 를 채워 둔다 — 안 채우면 뒤쪽 「업체관리에 못 넣음」 줄에 걸려
       이 검사가 «엉뚱한 이유로» 운다(실제로 여기서 한 번 걸렸고, 그 덕에
       실데이터의 진짜 잡음이 크기가 아니라 업체관리라는 것을 알았다). */
  /* ⚠ filed(기업정보함)까지 채운다 — 사업자등록증은 CARD_KINDS 에도 들어 있어서,
     기업정보함에 안 갔으면 「기업정보함에 아직 안 감」으로 또 걸린다. 한 사진이 걸릴 수
     있는 이유가 여럿이라, 크기 하나만 보려면 나머지를 다 치워 놓아야 한다. */
  const x = it('bizreg', { bizNoOk: true, fields: { company: '(주)가나', bizNo: '123-45-67890' },
  /* ⚠ filedCo 에 at 이 있어야 «보낸 것»이다 — at 이 없으면 coTodo 가 「아직 안
     보냄」으로 보아 또 걸린다(여기서 한 번 걸렸다). */
    filed: { id: 'C1' }, filedCo: { at: 1, found: true, filled: ['addr'] } });
  assert.equal(S.tooSmall(x), 360, '작다는 판정 자체는 그대로여야 합니다');
  assert.equal(S.smallCheckedOk(x.meta.read), true);
  assert.equal(S.needsCheck(x), false,
    '★ 사람이 다시 볼 것이 없는데 목록만 채웁니다 — 이것이 대표가 지적한 그것입니다');
  assert.equal(S.checkWhy(x), '', '목록에서 뺐는데 이유가 남으면 떠다니는 이유가 됩니다');
});

test('★ 크기 규칙을 풀어도 «업체관리» 규칙은 따로 판단한다 — 두 일을 섞지 않았다', () => {
  /* 크기 쪽은 통과, 업체관리 쪽은 «아직 안 보냄»이면 그것으로 걸려야 한다.
     두 일을 한 덩이로 보면 크기를 풀다가 남의 할 일을 삼킨다.
     ⚠ 「보냈는데 업체가 없다」는 2026-08-23 결정으로 기다림이 되었다(업체는 계약이
       만든다) — 그건 tests/photos-co-follows-contract.test.js 에서 못박는다. */
  const x = it('bizreg', { bizNoOk: true, fields: { company: '(주)가나' },
    filed: { id: 'C1' } });                       // filedCo 없음 = 아직 안 보냄
  assert.equal(S.smallCheckedOk(x.meta.read), true, '크기 쪽 판정은 통과여야 합니다');
  assert.equal(S.needsCheck(x), true, '★ 업체관리 할 일까지 삼켰습니다');
  assert.match(S.checkWhy(x), /업체관리로 아직 안 보냄/,
    '★ 이유가 「원본이 작습니다」로 남으면 사람이 헛되이 원본을 대조합니다');
});

test('★ 명함 — 전화·메일 꼴이 맞으면 작아도 할 일이 아니다', () => {
  const x = it('card', { fields: { company: '제주노사민정협의회', name: '현봉철',
    tel: '064-751-2206', mobile: '010-1200-0012', fax: '064-751-2208',
    email: 'jejunosa@jejunosa.or.kr' }, filed: { id: 'K1' } });
  assert.equal(S.smallCheckedOk(x.meta.read), true);
  assert.equal(S.needsCheck(x), false, '★ 360px 명함이 다 읽혔는데 할 일로 남습니다');
});

/* ══════ ② 안 풀어 준 곳 — 여기서 풀면 지어낸 값이 조용히 흘러간다 ══════ */

test('★ 번호 체크섬이 걸린 사업자등록증은 그대로 할 일이다', () => {
  const x = it('bizreg', { bizNoOk: false, fields: { company: '(주)가나' } });
  assert.equal(S.smallCheckedOk(x.meta.read), false);
  assert.equal(S.needsCheck(x), true, '★ 번호를 못 읽었는데 통과시키면 지어낸 번호가 흘러갑니다');
  assert.match(S.checkWhy(x), /원본이 작습니다\(360px\)/);
});

test('★ 자동입력에 걸린 것은 통과 못 한다 — 폐업·기간만료가 여기로 온다', () => {
  /* autoOk 가 국세청 이상·유효기간 만료를 auto=false 로 돌려준다. 번호꼴만 보고
     통과시키면 「폐업으로 나오는데 번호는 맞다」가 조용히 새 나간다. */
  const x = it('bizreg', { auto: false, bizNoOk: true, fields: { company: '(주)가나' } });
  assert.equal(S.smallCheckedOk(x.meta.read), false, '★ auto 를 안 보면 폐업 업체가 통과합니다');
  assert.equal(S.needsCheck(x), true);
});

test('★ 전화 꼴이 어긋난 명함은 그대로 할 일이다 — 읽다 흘린 것이다', () => {
  const bad = it('card', { fields: { name: '홍길동', tel: '064-75-220' } });
  assert.equal(S.smallCheckedOk(bad.meta.read), false);
  assert.equal(S.needsCheck(bad), true);
});

test('★ 메일 꼴이 어긋난 명함도 그대로 할 일이다', () => {
  const bad = it('card', { fields: { name: '홍길동', tel: '064-751-2206', email: 'abc@' } });
  assert.equal(S.smallCheckedOk(bad.meta.read), false);
  assert.equal(S.needsCheck(bad), true);
});

test('★ 확인할 값이 하나도 없는 명함은 통과 못 한다 — 「검증했다」가 헛말이 된다', () => {
  const none = it('card', { fields: { name: '홍길동' } });
  assert.equal(S.smallCheckedOk(none.meta.read), false,
    '★ 전화도 메일도 없는데 「기계가 확인했다」고 하면 거짓입니다');
  assert.equal(S.needsCheck(none), true);
});

test('★ 기계가 가릴 수 없는 종류는 그대로 할 일이다 — 손글씨 표·줄글', () => {
  /* ⚠ 종류마다 기준이 다르다 — 대화캡처는 900, 근태표·서식은 1600. 한 크기로
     넷을 다 「작다」로 만들 수 없다(처음에 800×1100 로 넣어 대화캡처가 안 걸렸다). */
  for (const k of ['timesheet', 'form', 'chat']) {
    const x = it(k, { fields: { company: '가나' } }, 600, 800);
    assert.equal(S.smallCheckedOk(x.meta.read), false, k + ' 를 풀어 주고 있습니다');
    assert.equal(S.needsCheck(x), true,
      '★ ' + k + ' 는 맞는지 가릴 길이 없습니다 — 풀면 지어낸 값이 흘러갑니다');
  }
});

/* ══════ ③ 「작다」는 사실은 안 지운다 ══════ */

test('★ 통과해도 사진을 열면 작다고 알려 준다 — 목록에서 빼는 것과 숨기는 것은 다르다', () => {
  const fn = fnOf('smallBox');
  assert.match(fn, /if \(!tooSmall\(it\)\) return '';/,
    '★ 통과분에서 안내까지 없애면 왜 작게 담겼는지 영영 모릅니다');
  assert.match(fn, /smallCheckedOk\(m\.read\)/, '통과 여부에 따라 말투를 안 가릅니다');
  assert.match(fn, /기계 검증을 통과했습니다/, '통과했다는 사실을 안 알려 줍니다');
  assert.match(fn, /PDF로 저장해 올리기/, '더 크게 받는 길이 사라졌습니다');
  /* 통과한 것에 겁주는 말을 남기면 목록에서 뺀 판단을 화면이 뒤집는다.
     ⚠ 앞뒤 몇 글자를 잘라 보면 안 된다 — 두 갈래가 삼항 연산자로 «맞붙어» 있어
       창을 넓게 잡으면 반대쪽 문장이 딸려 온다(여기서 한 번 헛돌았다).
       갈림표(`: `)로 갈라 «각 갈래 안»을 본다. */
  const arms = fn.slice(fn.indexOf('const body = okd')).split('\n    : ');
  assert.equal(arms.length, 2, '두 갈래로 갈리지 않습니다 — 모양이 바뀌었습니다');
  assert.match(arms[0], /기계 검증을 통과했습니다/, '통과 갈래가 뒤바뀌었습니다');
  assert.ok(!/지어냈을 수 있습니다/.test(arms[0]),
    '★ 통과분에도 「지어냈을 수 있다」고 적으면 화면이 스스로를 뒤집습니다');
  assert.match(arms[1], /지어냈을 수 있습니다/,
    '★ 통과 못 한 것에서 경고를 없애면 지어낸 값을 그냥 믿게 됩니다');
});

test('통과분은 색을 낮춘다 — 할 일 색(주황)으로 두면 할 일처럼 보인다', () => {
  assert.match(css, /\.smallwarn\.okd\{/, '통과분 색 규칙이 없습니다');
  assert.match(css, /\.smallwarn\{[^}]*border:1\.5px solid #fbbf24/, '원래 주황이 사라졌습니다');
});

/* ══════ ④ 판정과 이유가 한 곳에서 나온다 ══════
   ⚠ 2026-08-27 다시 겨눔 — 종전에는 needsCheck·checkWhy 두 벌이 «같은 조건인가»를
     재고 있었다. 이제 needsCheck 가 checkWhy 를 그대로 쓴다(「이유가 있으면 곧 할 일」)
     — 어긋날 수가 없다. 그 구조가 살아 있는지를 못 박는다. */

test('★ 판정과 이유가 한 곳에서 나온다 — 어긋날 수 없게 해 둔다', () => {
  assert.match(fnOf('checkWhy'), /small && !smallCheckedOk\(r\)/);
  assert.match(fnOf('needsCheck'), /return !!checkWhy\(it\);/,
    '★ 다시 두 벌로 갈라지면 「목록엔 없는데 이유만 떠다니는」 사고가 돌아옵니다');
});
