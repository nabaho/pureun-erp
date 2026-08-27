'use strict';
/* 주담당 칸에 사번이 아닌 값이 들어간 것을 그 자리에서 알린다 — 실행: node --test tests/*.test.js

   대표 결정 2026-08-27: 「사번이 아닌 것은 바로 알린다」

   ── 무슨 일이 있었나 ────────────────────────────────────────
   업체 13곳의 주담당 칸에 사번이 아니라 **「김보람(박은비)」라는 글자**가 적혀
   있었다. 화면에는 사람 이름처럼 보여 아무도 몰랐다.

   ⚠ 사번이 아니면 그 사람의 메일 주소를 만들 수 없다(sidToEmail). 그래서
   급여데이터함이 어느 계정과도 못 잇고, **그 13곳으로 온 메일은 영원히 공용
   칸에 떨어진다.** 「아직 안 들어온 사람」과 겉모습이 같아 가릴 수도 없었다 —
   앞은 기다리면 되고 뒤는 업체관리를 고쳐야 한다(할 일이 다르다).

   급여데이터함은 이미 badSid 로 빨간 줄을 세우고 있었다(2026-08-17).
   **정작 고쳐야 할 곳인 업체관리가 조용했다.** */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const R = path.join(__dirname, '..');
const ERP = fs.readFileSync(path.join(R, 'pu-erp.html'), 'utf8');
const STORE = fs.readFileSync(path.join(R, 'js', 'pu-paydata-store.js'), 'utf8');

function cut(src, name) {
  const m = src.match(new RegExp('function ' + name + '\\s*\\([\\s\\S]*?\\n  \\}'));
  assert.ok(m, name + ' 을 찾을 수 없습니다');
  return m[0];
}

test('★ 업체관리가 사번이 아닌 주담당을 알린다 — 여기가 고칠 곳이다', () => {
  const fn = cut(ERP, 'renderMgrCell');
  assert.match(fn, /badSid/, '사번인지 보지 않습니다');
  assert.match(fn, /⚠ /, '눈에 띄는 표가 없습니다');
});

test('★ 무엇이 잘못됐고 무슨 일이 생기는지 말한다 — 「이상함」만으로는 못 고친다', () => {
  const fn = cut(ERP, 'renderMgrCell');
  assert.match(fn, /사번이 아닙니다/);
  assert.match(fn, /공용 칸/, '메일이 어떻게 되는지 안 알려 줍니다');
  assert.match(fn, /두 번 눌러/, '어떻게 고치는지 안 알려 줍니다');
});

test('★ 두 화면이 같은 잣대를 쓴다 — 다르면 한쪽만 빨갛다', () => {
  const a = (ERP.match(/SID_RE_CO\s*=\s*(\/[^\n]+\/)/) || [])[1];
  const b = (STORE.match(/SID_RE\s*=\s*(\/[^\n]+\/)/) || [])[1];
  assert.ok(a, '업체관리에 사번 꼴이 없습니다');
  assert.ok(b, '급여데이터함에 사번 꼴이 없습니다');
  assert.equal(a, b, '업체관리 ' + a + ' / 급여데이터함 ' + b + ' — 잣대가 다릅니다');
});

test('사번 꼴이 실제로 쓰는 사번을 받아들인다', () => {
  const re = new RegExp((ERP.match(/SID_RE_CO\s*=\s*\/([^\n]+)\/;/) || [])[1]);
  ['A-001', 'P-002', 'A-003', 'T-005', 'A001'].forEach(s => {
    assert.ok(re.test(s), s + ' 를 사번으로 안 봅니다');
  });
});

test('★ 사람 이름·메모는 사번이 아니다', () => {
  const re = new RegExp((ERP.match(/SID_RE_CO\s*=\s*\/([^\n]+)\/;/) || [])[1]);
  ['김보람(박은비)', '김보람', '박은비 대리', '미정', '2026', ''].forEach(s => {
    assert.equal(re.test(s), false, '「' + s + '」 를 사번으로 봤습니다');
  });
});

test('급여데이터함 쪽 빨간 줄은 그대로 둔다 — 두 곳에서 봐야 놓치지 않는다', () => {
  assert.match(STORE, /badSid: !SID_RE\.test\(sid\)/);
  /* 사번이 아닌 것은 목록 맨 아래로 — 사이에 섞이면 고칠 것이 묻힌다 */
  assert.match(STORE, /a\.badSid !== b\.badSid/);
});
