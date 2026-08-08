/* 검사가 「그 PC의 경로」를 박아 두면 안 된다
   ══════════════════════════════════════════
   2026-08-08 실제 사고: tests/ledger-paren-name.test.js 가
     fs.readFileSync('C:/Users/fair0/Documents/pureunall/pu-erp.html')
   라고 적어 두었다. 대표님 컴퓨터에서는 늘 통과했지만 **배포 서버(리눅스)에서는
   늘 실패**해 모든 PR 이 막혔다.

   더 나쁜 것은, 통과할 때조차 **PR 의 내용이 아니라 그때 그 PC 에 있던 파일**을
   읽었다는 점이다 — 무엇을 검사한 것인지 알 수 없다.

   검사는 언제나 **제 자리(__dirname)를 기준**으로 파일을 찾아야 한다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const dir = __dirname;
const SELF = path.basename(__filename);
/* ⚠ 자기 자신은 뺀다 — 이 파일은 「걸려야 하는 모양」을 **예시로** 들고 있어서
   자기를 잡는다. 대신 아래 「헛돌지 않는다」에서 그 규칙이 진짜로 무는지 확인한다. */
const files = fs.readdirSync(dir)
  .filter(function (f) { return f.endsWith('.test.js') && f !== SELF; });

test('★ 검사 파일에 그 PC의 절대 경로가 없다', () => {
  const bad = [];
  files.forEach(function (f) {
    const s = fs.readFileSync(path.join(dir, f), 'utf8');
    /* 윈도우 드라이브 문자(C:/ · C:\) 와 유닉스 홈 경로 */
    const hits = s.match(/['"][A-Za-z]:[\\/][^'"]*['"]|['"]\/(?:home|Users)\/[^'"]*['"]/g) || [];
    if (hits.length) bad.push(f + ' → ' + hits[0].slice(0, 70));
  });
  assert.deepEqual(bad, [],
    '그 PC 에서만 통하는 경로입니다 — 배포 서버에서는 늘 실패하고, 통과할 때도 ' +
    'PR 이 아니라 그 PC 의 파일을 검사합니다:\n  ' + bad.join('\n  '));
});

test('검사가 헛돌지 않는다', () => {
  assert.ok(files.length > 30, '검사 파일을 ' + files.length + '개만 찾았습니다 — 훑기가 깨졌습니다.');
  /* 일부러 넣은 가짜 문자열이 실제로 걸리는지 — 규칙 자체를 확인한다 */
  const re = /['"][A-Za-z]:[\\/][^'"]*['"]|['"]\/(?:home|Users)\/[^'"]*['"]/;
  assert.ok(re.test("readFileSync('C:/Users/x/a.html')"), '윈도우 경로를 못 잡습니다.');
  assert.ok(re.test('readFileSync("/home/runner/a.html")'), '리눅스 경로를 못 잡습니다.');
  assert.ok(!re.test("path.join(__dirname, '..', 'pu-erp.html')"), '바른 방식을 잘못 잡습니다.');
});
