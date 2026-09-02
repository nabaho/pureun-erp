/* 기금 결산 검사 3종을 CI 에서 돌린다.
   실행: node --test tests/*.test.js

   그동안 이 검사들은 «사람이 손으로 돌릴 때만» 돌았다. 그래서
   조용히 꺼진 채 main 에 올라간 적이 있다 — 샌드박스에 이름 하나(bfMovesOf)가
   빠져 결산 회귀 167건이 첫 호출에서 죽었는데, 아무도 몰랐다.
   여기 걸어 두면 그런 일이 더는 조용할 수 없다.

   세 검사가 보는 것이 다르다:
     check_fund    화면·엑셀·서식의 배선(문자열·구조)
     check_closing 결산 엔진 — 확정 결산서 16건의 현금·준비금·자산총계
     check_stmt    제출본 대조 — 실제로 낸 결산서의 재무제표 «줄»

   셋 다 1초 안에 끝난다(합쳐 1.1초). */
const { test } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.resolve(__dirname, '..');
const TOOLS = path.join(ROOT, 'fund-erp', 'tools');

const CHECKS = [
  ['check_fund.js', '화면·엑셀·서식 배선'],
  ['check_closing.js', '결산 엔진 회귀(확정 결산서)'],
  ['check_stmt.js', '제출본 대조(재무제표 줄)'],
  /* 통장 한 줄을 쪼갠 분개가 표마다 계정별로 갈라지나 —
     합계만 보는 검사로는 «첫 조각에 전액이 몰린 것»을 못 잡는다. */
  ['check_split.js', '분할 분개가 계정별로 갈라지는가'],
];
/* pii_scan 은 통과 문구가 다르고(«✓ 전 서식 깨끗함»), 무엇보다
   «서식 템플릿에 남의 개인정보가 없는가»를 본다 — 공개 배포되는 파일이라 이게 제일 급하다.
   예전엔 이 검사가 다른 폴더를 보고 있어, 깨끗하다고 하는 동안 실명·집주소·계좌번호가 남아 있었다. */
const PII = ['pii_scan.js', '서식에 남의 개인정보가 없는가'];

/* 서식을 «진짜로 그려» 보는 검사. 문자열만 보는 검사는 «차례가 바뀐 것»을 못 잡는다 —
   실제로 stripBaked 를 나중에 넣으며 지원신청서 금액·신청일이 조용히 비었다.
   jsdom 이 있어야 돌고, 없으면 SKIP 이라 말한다(조용히 통과하지 않는다). */
const FORMS = ['check_forms.js', '서식이 정말 채워지는가'];

for (const [file, what] of CHECKS) {
  test('기금 결산 검사 — ' + what + ' (' + file + ')', () => {
    const p = path.join(TOOLS, file);
    assert.ok(fs.existsSync(p), file + ' 이 없습니다');
    const r = spawnSync(process.execPath, [p], {
      cwd: ROOT, encoding: 'utf8', timeout: 120000,
    });
    const out = (r.stdout || '') + (r.stderr || '');
    /* 종료 코드만 보면 안 된다 — 검사가 «첫 호출에서 죽어도» 0 이 아닌 값이
       안 나오는 길이 있었다. 통과 문구가 실제로 찍혔는지 함께 본다. */
    assert.ok(/ALL PASS/.test(out),
      file + ' 이 통과 문구를 남기지 않았습니다:\n' + out.slice(-2000));
    assert.strictEqual(r.status, 0, file + ' 실패:\n' + out.slice(-2000));
  });
}

test('기금 서식 검사 — ' + PII[1] + ' (' + PII[0] + ')', () => {
  const p = path.join(TOOLS, PII[0]);
  assert.ok(fs.existsSync(p), PII[0] + ' 이 없습니다');
  const r = spawnSync(process.execPath, [p], { cwd: ROOT, encoding: 'utf8', timeout: 120000 });
  const out = (r.stdout || '') + (r.stderr || '');
  assert.ok(/전 서식 깨끗함/.test(out),
    '서식 템플릿에 남의 개인정보가 남아 있습니다:\n' + out.slice(-2000));
  assert.strictEqual(r.status, 0, PII[0] + ' 실패:\n' + out.slice(-2000));
});

test('기금 서식 검사 — ' + FORMS[1] + ' (' + FORMS[0] + ')', () => {
  const p = path.join(TOOLS, FORMS[0]);
  assert.ok(fs.existsSync(p), FORMS[0] + ' 이 없습니다');
  const r = spawnSync(process.execPath, [p], { cwd: ROOT, encoding: 'utf8', timeout: 120000 });
  const out = (r.stdout || '') + (r.stderr || '');
  // SKIP 도 «통과»로 본다 — 다만 무엇을 건너뛰었는지 화면에 남는다
  if (/^SKIP:/m.test(out)) { console.log('  ' + out.trim().split(/\r?\n/)[0]); return; }
  assert.ok(/ALL PASS/.test(out), '서식이 제대로 안 채워집니다:\n' + out.slice(-2500));
  assert.strictEqual(r.status, 0, FORMS[0] + ' 실패:\n' + out.slice(-2500));
});

/* 검사가 «몇 건을 돌았는지»도 못 박는다.
   건수가 확 줄면 검사가 조용히 꺼진 것이다 — 통과 문구만으로는 못 잡는다.
   숫자를 늘리는 것은 자유다. 줄이려면 왜 줄였는지 여기 적고 줄여야 한다. */
const FLOOR = { 'check_fund.js': 400, 'check_closing.js': 160, 'check_stmt.js': 100 };
for (const [file, min] of Object.entries(FLOOR)) {
  test('기금 결산 검사가 꺼지지 않았다 — ' + file + ' ≥ ' + min + '건', () => {
    const r = spawnSync(process.execPath, [path.join(TOOLS, file)], {
      cwd: ROOT, encoding: 'utf8', timeout: 120000,
    });
    const m = /ALL PASS \((\d+)/.exec((r.stdout || '') + (r.stderr || ''));
    assert.ok(m, file + ' 에서 건수를 못 읽었습니다');
    assert.ok(Number(m[1]) >= min,
      file + ' 이 ' + m[1] + '건만 돌았습니다(최소 ' + min + '건). 검사가 꺼졌는지 보세요.');
  });
}
