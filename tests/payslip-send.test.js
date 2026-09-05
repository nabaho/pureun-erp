/* 급여명세서 «보내기» 가 지켜야 하는 규칙 — 2026-09-05 대표 지시로 넷을 고쳤다
   ═══════════════════════════════════════════════════════════════════════════
   대표 지시: 「푸른이알피에 등록된 이메일 주소로 메일 보내는 부분,
              급여명세서 보내기 할 때 부분 검토해달라」 → 「모두 고쳐라」

   찾은 것 넷 — 다시 돌아가지 못하게 여기서 못 박는다.

   ① 「전체 발송」이 «보내지 않았다»
      mailto: 창을 사람 수만큼 여는 코드였다. 브라우저는 두 번째 창부터
      대개 막으므로 10명이면 1명치만 뜨고 9명은 조용히 사라졌다.
      그런데도 토스트는 「10명 초안 생성됨」이라 떴다.
      초안 본문에는 실지급액 한 줄뿐이라 «임금명세서가 아니었다»
      (근기법 §48② — 지급·공제 항목별 금액이 필수 기재사항).

   ② 교부 기록이 «한 줄도» 안 남았다
      서버는 이미 발송번호와 보낸 사람을 돌려주고 있었는데 화면이 버렸다.
      임금명세서 교부는 법정 의무인데 「보냈다」를 증명할 것이 없었다.

   ③ 「자동발송 테스트(내 메일)」이 «내 메일»이 아니었다
      코드에 지메일 하나가 박혀 있어 누가 눌러도 그리로 갔다.
      게다가 내용이 직원 명단 «첫 사람»의 진짜 급여였다 —
      직원이 시험 삼아 눌러 보면 남의 급여가 나가는 길이었다.

   ④ 받는 주소가 비면 서버가 그 지메일로 보냈다 (b.to || TEST_TO)
      화면에는 울타리가 있었지만 서버에는 없었다. 울타리는 둘 다에 있어야 한다.

   ⚠ 글자로 보는 검사이므로 «주석을 먼저 걷는다».
     이 저장소 주석에는 위 사연이 그대로 적혀 있어서, 안 걷으면
     잘 쓴 주석이 검사를 통과시킨다(tests-must-strip-comments). */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const 뿌리 = path.join(__dirname, '..');

/* 주석을 걷는다 — «글자열 속»은 건드리지 않고 한 글자씩 걸어간다.
   정규식 한 줄로 지우면 "…xhtml+xml,*<slash>*" 같은 글자열의 별-빗금을
   주석 끝으로 읽고 진짜 코드를 지운다(2026-09-05 에 실제로 그랬다). */
function 주석걷기(원본) {
  const s = String(원본);
  let 나옴 = '', i = 0;
  while (i < s.length) {
    const c = s[i], 다음 = s[i + 1];
    if (c === '\\') { 나옴 += s.slice(i, i + 2); i += 2; continue; }
    if (c === '/' && 다음 === '*') {
      const 끝 = s.indexOf('*/', i + 2);
      i = 끝 < 0 ? s.length : 끝 + 2; 나옴 += ' '; continue;
    }
    if (c === '/' && 다음 === '/') {
      const 끝 = s.indexOf('\n', i);
      i = 끝 < 0 ? s.length : 끝; 나옴 += ' '; continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < s.length) {
        if (s[j] === '\\') { j += 2; continue; }
        if (s[j] === c) { j++; break; }
        j++;
      }
      나옴 += s.slice(i, j); i = j; continue;
    }
    나옴 += c; i++;
  }
  return 나옴;
}

function 함수몸(소스, 이름) {
  const 시작 = 소스.indexOf('function ' + 이름 + '(');
  if (시작 < 0) return null;
  const 열림 = 소스.indexOf('{', 시작);
  if (열림 < 0) return null;
  let 깊이 = 0;
  for (let i = 열림; i < 소스.length; i++) {
    if (소스[i] === '{') 깊이++;
    else if (소스[i] === '}') { 깊이--; if (깊이 === 0) return 소스.slice(시작, i + 1); }
  }
  return null;
}

const 화면 = 주석걷기(fs.readFileSync(path.join(뿌리, 'pu-erp.html'), 'utf8'));
const 서버 = 주석걷기(fs.readFileSync(path.join(뿌리, 'functions', 'index.js'), 'utf8'));

/* ═══ ① 모두에게 보내기가 «진짜로» 보낸다 ═══════════════════════════════ */

test('★ 「모두에게 보내기」가 mailto 창 열기가 아니다', () => {
  const 모두 = 함수몸(화면, '명세서모두보내기');
  assert.ok(모두, '명세서모두보내기 함수가 없다');
  assert.ok(!/mailto:/.test(모두),
    '★ 아직 mailto: 창을 연다 — 브라우저가 두 번째부터 막아 대부분 사라진다');
  assert.ok(!/window\.open\s*\(/.test(모두),
    '★ 창을 여는 방식이다 — 보내는 것이 아니다');
});

test('★ 모두에게 보내기와 줄 단추가 «같은 길»을 쓴다', () => {
  /* 둘이 따로 있으면 한쪽만 고쳐져 「같은 단추인데 다른 것이 나가는」 일이 생긴다.
     실제로 그랬다 — 줄 단추는 PDF 를 붙였고 전체 발송은 한 줄짜리 초안이었다. */
  const 모두 = 함수몸(화면, '명세서모두보내기');
  const 줄 = 함수몸(화면, 'sendPayslipRow');
  assert.ok(/명세서한사람보내기\s*\(/.test(모두), '★ 모두에게 보내기가 공용 보내개를 안 쓴다');
  assert.ok(/명세서한사람보내기\s*\(/.test(줄), '★ 줄 단추가 공용 보내개를 안 쓴다');
});

test('★ 보내는 것에 PDF 명세서가 «붙는다» — 실지급액 한 줄은 명세서가 아니다', () => {
  const 한사람 = 함수몸(화면, '명세서한사람보내기');
  assert.ok(한사람, '명세서한사람보내기 함수가 없다');
  assert.ok(/attachments\s*:/.test(한사람), '★ 첨부가 없다');
  assert.ok(/buildPayslipPdfBase64\s*\(/.test(한사람), '★ PDF 를 안 만든다');
});

test('★ 한꺼번에 던지지 않고 «차례로» 보낸다', () => {
  /* 한꺼번에 던지면 메일 서버가 막고, 중간에 멎어도 어디까지 갔는지 모른다 */
  const 모두 = 함수몸(화면, '명세서모두보내기');
  assert.ok(/\.then\s*\(\s*function/.test(모두) && /차례/.test(모두),
    '★ 차례로 잇는 짜임이 아니다');
  assert.ok(!/Promise\.all\s*\(/.test(모두), '★ 한꺼번에 던진다');
});

test('★ 보내기 전에 «몇 명에게 가는지» 묻는다', () => {
  const 모두 = 함수몸(화면, '명세서모두보내기');
  assert.ok(/popConfirm\s*\(/.test(모두), '★ 안 묻고 바로 나간다 — 되돌릴 수 없는 일이다');
});

/* ═══ ② 교부 기록 ═══════════════════════════════════════════════════════ */

test('★ 보낸 것을 «적는다» — 교부는 근기법 §48② 의무다', () => {
  const 한사람 = 함수몸(화면, '명세서한사람보내기');
  assert.ok(/명세서보냄기록\s*\(/.test(한사람), '★ 보내고도 아무것도 안 적는다');
});

test('★ «실패도» 적는다 — 성공만 적으면 기록이 아니다', () => {
  /* 성공만 적으면 「기록이 없다」가 안 보낸 것인지 보냈는데 안 적힌 것인지 모른다 */
  const 한사람 = 함수몸(화면, '명세서한사람보내기');
  const 기록자리 = 한사람.indexOf('명세서보냄기록');
  assert.ok(기록자리 > 0, '기록하는 자리가 없다');
  const 던지는자리 = 한사람.indexOf('throw');
  assert.ok(던지는자리 < 0 || 기록자리 < 던지는자리,
    '★ 실패하면 적기 전에 던져 버린다 — 실패가 기록에 안 남는다');
});

test('★ 기록에 «발송번호»가 들어간다 — 그것이 증거다', () => {
  const 기록 = 함수몸(화면, '명세서보냄기록');
  assert.ok(기록, '명세서보냄기록 함수가 없다');
  assert.ok(/mailId\s*:/.test(기록), '★ 발송번호를 안 적는다 — 증명할 것이 없다');
  assert.ok(/\bok\s*:/.test(기록), '★ 됐는지 안 됐는지를 안 적는다');
  assert.ok(/\bby\s*:/.test(기록), '★ 누가 보냈는지를 안 적는다');
});

test('★ 기록에 «금액»은 안 넣는다 — 여기 있을 것이 아니다', () => {
  const 기록 = 함수몸(화면, '명세서보냄기록');
  assert.ok(!/netPay|grossPay|totalDeduct|실지급/.test(기록),
    '★ 교부 기록에 급여액을 복사했다 — 원본보다 넓게 퍼진다');
});

test('★ 서버가 발송번호와 나간 주소를 «돌려준다» — 화면이 적을 수 있게', () => {
  const 보냄 = 서버.slice(서버.indexOf('exports.sendPayslip'));
  assert.ok(/id\s*:\s*\(r &&/.test(보냄), '★ 발송번호를 안 돌려준다');
  assert.ok(/from\s*:\s*FROM/.test(보냄), '★ 어느 주소로 나갔는지 안 돌려준다');
});

test('★ 기록이 «보이는 자리»에 있다 — 적기만 하면 없는 것과 같다', () => {
  assert.ok(/명세서보냄찾기\s*\(/.test(화면), '★ 기록을 도로 읽는 곳이 없다');
  assert.ok(/'보낸 때'/.test(화면), '★ 표에 보여 주는 칸이 없다');
});

/* ═══ ③ 시험 발송 ═══════════════════════════════════════════════════════ */

test('★ 시험 발송이 «로그인한 나»에게 간다', () => {
  const 시험 = 함수몸(화면, 'sendPayslipTest');
  assert.ok(시험, 'sendPayslipTest 함수가 없다');
  assert.ok(/내메일주소\s*\(/.test(시험), '★ 내 주소를 안 쓴다');
});

test('★ 코드에 «박아 둔 받는 주소»가 없다 — 누가 눌러도 한 곳으로 가면 안 된다', () => {
  /* 예전에는 지메일 하나가 박혀 있었고, 단추 설명은 「본인 메일」이라 적혀 있었다 */
  const 시험 = 함수몸(화면, 'sendPayslipTest');
  assert.ok(!/@(gmail|naver|daum|hanmail|nate)\.(com|net|co\.kr)/i.test(시험),
    '★ 받는 주소가 코드에 박혀 있다');
  assert.ok(!/PAYSLIP_TEST_TO/.test(화면), '★ 박아 둔 시험 주소가 아직 남아 있다');
});

test('★ 시험 메일에 «남의 진짜 급여»를 싣지 않는다', () => {
  const 견본 = 함수몸(화면, 'payslipTestHtml');
  assert.ok(견본, 'payslipTestHtml 함수가 없다');
  assert.ok(!/calcPayroll\s*\(/.test(견본), '★ 진짜 급여를 셈해서 싣는다');
  assert.ok(!/getRec\s*\(/.test(견본), '★ 진짜 급여 자료를 읽는다');
  assert.ok(/견본/.test(견본), '★ 견본이라고 말하지 않는다 — 받는 사람이 진짜로 안다');
});

/* ═══ ④ 서버 울타리·회신 주소 ═══════════════════════════════════════════ */

test('★ 받는 주소가 비면 «안 보낸다» — 울타리는 서버에도 있어야 한다', () => {
  const 보냄 = 서버.slice(서버.indexOf('exports.sendPayslip'));
  /* 규칙은 「비면 다른 데로 새지 않는다」이다 — 빈 값을 «주소»로 갈음하지 않는다.
     (b.to || "") 처럼 빈 글자로 받는 것은 괜찮다. 아래에서 되돌리기 때문이다. */
  assert.ok(!/b\.to\s*\|\|\s*(TEST_TO|['"][^'"]*@)/.test(보냄),
    '★ 주소가 비면 다른 곳으로 보낸다 — 남의 급여명세서가 갈 수 있다');
  assert.ok(/status\(400\)/.test(보냄), '★ 잘못된 주소를 되돌리지 않는다');
  /* 되돌리는 자리가 «실제로 보내기 전»에 있어야 한다 */
  assert.ok(보냄.indexOf('status(400)') < 보냄.indexOf('resend.emails.send'),
    '★ 주소를 검사하기 전에 이미 보낸다');
});

test('★ 회신 주소가 «있다» — 본문에 「연락 주세요」라 써 놓고 갈 곳이 없으면 거짓말이다', () => {
  const 보냄 = 서버.slice(서버.indexOf('exports.sendPayslip'));
  assert.ok(/reply_to\s*[:=]/.test(보냄), '★ Reply-To 를 안 붙인다');
  assert.ok(/REPLY_TO\s*=/.test(서버), '★ 회신 주소가 정해져 있지 않다');
  /* 붙이는 자리가 «보내기 전»이어야 한다 — 뒤에 붙이면 안 실린다 */
  assert.ok(보냄.indexOf('reply_to') < 보냄.indexOf('resend.emails.send'),
    '★ 회신 주소를 보낸 뒤에 붙인다 — 실리지 않는다');
});

test('★ 메일 열쇠가 «이 PC 의 파일»에만 있지 않다 — 다시 올리면 발송이 멎는다', () => {
  /* functions/.env 는 저장소에 없다(gitignore). 그대로 다시 올리면
     RESEND_API_KEY 가 지워져 급여명세서 발송이 통째로 멎는 지뢰였다. */
  assert.ok(/secrets:\s*\[\s*["']RESEND_API_KEY["']/.test(서버),
    '★ 열쇠가 파이어베이스 비밀값으로 안 묶여 있다 — 배포 한 번에 발송이 멎는다');
  assert.ok(!fs.existsSync(path.join(뿌리, 'functions', '.env')),
    '열쇠 파일이 저장소에 들어왔다 — 절대 커밋하면 안 된다');
});
