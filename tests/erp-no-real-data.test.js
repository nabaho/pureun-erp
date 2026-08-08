'use strict';
// 코드에 실데이터가 다시 박히는 것을 막는 검사 — 실행: node --test tests/*.test.js
//   (이 환경의 node는 --test 에 디렉터리 인자를 주면 죽는다. 반드시 glob으로 파일을 넘긴다.)
//
// 이 저장소는 **공개**이고 main 이 GitHub Pages 로 실제 배포된다.
// 코드에 박은 실데이터는 그 순간부터 인터넷에 열린다.
//
// 같은 사고가 네 번 반복됐다:
//   2026-07-28 업체 실데이터
//   2026-08-04 직원 명단(USERS_SEED)·법인카드 계좌(ACCOUNTS_SEED)·외부 인력 연락처
//   2026-08-05 직원 4·5월 실급여(importPay45)
//   2026-08-05 직원 16명 연차대장(LEAVE_LEDGER_SEED — 육아휴직·배우자 출산휴가 포함)
//
// 매번 사람이 눈으로 찾아냈다. 이름 목록으로 검사하면 새 직원이 들어올 때
// 못 잡으므로, **덩치**로 잡는다 — 코드에 박힌 큰 데이터 뭉치는 거의 언제나
// 실데이터다. 진짜 필요한 상수(세액표·요율표 등)는 아래 허용 목록에 적는다.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const erp = fs.readFileSync(path.join(root, 'pu-erp.html'), 'utf8');

/* 실데이터가 아니라고 확인된 큰 상수. 새로 추가할 때는 왜 실데이터가 아닌지
   한 줄로 적을 것 — 적을 수 없으면 실데이터일 가능성이 높다. */
const ALLOWED = [
  'SIMPLE_TAX_TABLE',   // 국세청 간이세액표 — 공개 자료
  'TAX_TABLE',          // 〃
  'INSURANCE_RATES',    // 4대보험 요율 — 공개 자료
  'RATES',              // 〃
  'HOLIDAY',            // 법정 공휴일 — 공개 자료
];

test('SEED 상수에 실데이터를 박지 않는다', () => {
  /* 회귀 방지: 2026-08-05 LEAVE_LEDGER_SEED 에 직원 16명의 2022~2026 연차대장이
     그대로 있었다. 비고에 육아휴직·배우자 출산휴가·휴직 사유까지 들어 있어
     급여보다 민감했다. 8/4 정리에서 놓친 것이다.

     한 사람 몫 레코드는 대략 200~400자다. 2,000자를 넘는 뭉치는 여러 사람의
     실데이터이지 코드 상수가 아니다. */
  const LIMIT = 2000;
  const offenders = [];
  const re = /var\s+([A-Za-z_0-9]*SEED[A-Za-z_0-9]*)\s*=\s*\[/g;
  let m;
  while ((m = re.exec(erp)) !== null) {
    const name = m[1];
    if (ALLOWED.some(a => name.indexOf(a) >= 0)) continue;
    /* 선언이 끝나는 줄까지의 길이를 잰다 — 이 저장소는 큰 시드를 한 줄에 쓴다. */
    const nl = erp.indexOf('\n', m.index);
    const len = (nl < 0 ? erp.length : nl) - m.index;
    if (len > LIMIT) offenders.push(name + '(' + len + '자)');
  }
  assert.deepEqual(offenders, [],
    '코드에 박힌 실데이터로 보입니다 — 공개 저장소이므로 인터넷에 그대로 열립니다: ' +
    offenders.join(', ') +
    '\n실데이터라면 지우고 Firebase 에만 두세요. 진짜 상수라면 이 검사의 ALLOWED 에 이유와 함께 적으세요.');
});

test('빈 시드가 서버를 지우는 길을 남기지 않는다', () => {
  /* 실데이터를 지울 때 **시드만 비우고 불러오기 함수를 남기면** 그 함수가
     빈 배열을 서버에 써서 실제 데이터를 지운다 — 2026-07 에 사업장 26곳·
     일정 53건이 이렇게 날아갔고 백업에서 복구했다.
     그래서 시드를 지울 때는 불러오기 함수와 단추까지 함께 없앤다. */
  assert.ok(!/LEAVE_LEDGER_SEED/.test(erp),
    '연차대장 시드가 되살아났습니다');
  assert.ok(!/onClick:importSeed/.test(erp),
    '연차대장 불러오기 단추가 남아 있습니다 — 시드가 비면 서버 대장을 지웁니다');
  assert.ok(!/function importPay45/.test(erp),
    '급여 불러오기 함수가 되살아났습니다');
  assert.ok(!/onClick:importPay45/.test(erp),
    '급여 불러오기 단추가 남아 있습니다');
});

test('직원 명단·계좌·외부 인력 시드는 비어 있다', () => {
  /* 2026-08-04 에 비운 것들이 되살아나지 않게 못 박는다. */
  for (const v of ['USERS_SEED', 'ACCOUNTS_SEED', 'EXTERNAL_STAFF_SEED']) {
    const m = erp.match(new RegExp('var\\s+' + v + '\\s*=\\s*\\[([\\s\\S]{0,40})'));
    assert.ok(m, v + ' 선언을 찾을 수 없습니다');
    assert.match(m[1].trim(), /^\]/, v + ' 에 다시 실데이터가 들어갔습니다');
  }
});
