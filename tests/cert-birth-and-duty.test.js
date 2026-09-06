'use strict';
/* 증명서 — 생년월일과 담당업무를 «있는 자료에서» 당겨온다.
   실행: node --test tests/*.test.js

   대표 지시 2026-09-06: 「생년월일 등 내용을 입력해야 하는데 이 부분은 어떻게 해야 하나,
   그리고 퇴사자들 중에 직급이나 직책 또는 노무사 여부도 모두 연결이 되어 있는데
   퇴사자들 자동으로 당겨오게 할 수 있나?」

   ── 실측 (2026-09-06, 서버 자료 32명) ────────────────────────────────
     생년월일  재직 11명 중 9명 있음 / 퇴사 21명 «전원» 없음
     주민번호  25명 있음  ← 여기서 뽑으면 32명 중 25명이 그 자리에서 채워진다
     직위      32명 «전원» 있음 (노무사 18 · 대표노무사 1 · 직원 7 · 사무장/차장/과장/대리/주임/사무직)
     담당업무  32명 중 «1명»만 있음 ← 여기가 진짜 비어 있던 곳
   퇴사자가 통째로 빈 까닭: 급여대장 가져오기가 생년월일을 빈칸으로,
   직위를 무조건 「직원」으로 지어 넣었다.

   ── 이 검사가 못 박는 것 ──────────────────────────────────────────
     ① 주민번호에서 생년월일을 «맞게» 뽑는다 (100년 단위를 뒷자리로 가른다)
     ② 못 뽑으면 «지어내지 않는다» — 증명서에 틀린 날짜가 박히면 안 된다
     ③ 담당업무 자리에 «직위»를 옮겨 적지 않는다 (「담당업무: 직원」이 나가던 자리)
     ④ 사람을 바꾸면 손으로 넣은 생년월일을 비운다 (앞사람 것이 따라가면 안 된다)
     ⑤ 주민번호 자체는 증명서 어디에도 그리지 않는다                                  */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(R, 'pu-erp.html'), 'utf8').replace(/\r\n/g, '\n');
const bare = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

/* 세 함수를 «떠서 돌려» 본다 — 글자만 찾으면 꺼 버려도 통과한다 */
function load(){
  const from = src.indexOf('function birthFromRrn(rrn){');
  const to = src.indexOf('try { window.birthFromRrn', from);
  assert.ok(from >= 0 && to > from, '생년월일·담당업무 함수를 못 찾았습니다');
  const ctx = { window: {} };
  vm.createContext(ctx);
  new vm.Script(src.slice(from, to)
    + '\nthis.birthFromRrn = birthFromRrn; this.certBirthOf = certBirthOf;'
    + '\nthis.certDutyOf = certDutyOf; this.CERT_DUTY_BY_TITLE = CERT_DUTY_BY_TITLE;').runInContext(ctx);
  return ctx;
}

/* ══════ ① 주민번호 → 생년월일 ══════ */

test('★★ 뒷자리 첫 숫자로 «어느 100년»인지 가른다', () => {
  const { birthFromRrn } = load();
  /* 검사고정-허용: 주민등록번호 규칙이다 — 값이 곧 규칙인 자리 */
  assert.equal(birthFromRrn('960429-2419110'), '1996-04-29', '1·2 는 1900년대(내국인)');
  assert.equal(birthFromRrn('900101-1000000'), '1990-01-01');
  assert.equal(birthFromRrn('050101-3000000'), '2005-01-01', '3·4 는 2000년대(내국인)');
  assert.equal(birthFromRrn('101231-4000000'), '2010-12-31');
  assert.equal(birthFromRrn('850615-5000000'), '1985-06-15', '5·6 은 1900년대(외국인)');
  assert.equal(birthFromRrn('850615-6000000'), '1985-06-15');
  assert.equal(birthFromRrn('030401-7000000'), '2003-04-01', '7·8 은 2000년대(외국인)');
  assert.equal(birthFromRrn('030401-8000000'), '2003-04-01');
  assert.equal(birthFromRrn('991231-9000000'), '1899-12-31', '9·0 은 1800년대');
});

test('★★ 뒷자리를 안 보고 무조건 19를 붙이면 100년이 어긋난다', () => {
  const { birthFromRrn } = load();
  const a = birthFromRrn('050101-3000000');
  assert.notEqual(a, '1905-01-01',
    '★★ 2005년생을 1905년생으로 적었습니다 — 뒷자리 첫 숫자를 보십시오');
  assert.equal(a.slice(0, 2), '20');
});

test('★★ 못 뽑으면 «지어내지 않는다» — 빈 문자열을 준다', () => {
  const { birthFromRrn } = load();
  ['', null, undefined, '96042', '960429', '960429-', 'abcdefg',
    '961329-2000000',   /* 13월 */
    '960432-2000000',   /* 32일 */
    '960429-0000000'.replace('0000000', '_______')
  ].forEach(function(bad){
    const got = birthFromRrn(bad);
    assert.equal(got, '', '★★ 「' + String(bad) + '」에서 「' + got + '」을 지어냈습니다');
  });
});

test('★★ 열세 자리가 아니면 아예 안 본다 — 사업자번호를 잘못 넣어도 날짜를 짓지 않는다', () => {
  const { birthFromRrn } = load();
  /* 실측(2026-09-06): 주민번호를 가진 25명이 «모두» 열세 자리다.
     길이를 안 보면 아래 사업자번호에서 「2007-87-03」 이 튀어나와 증명서에 박힌다. */
  assert.equal(birthFromRrn('207-87-03540'), '',
    '★★ 사업자번호에서 생년월일을 지어냈습니다');
  assert.equal(birthFromRrn('9604292'), '',
    '★★ 앞 일곱 자리만으로 날짜를 지어냈습니다 — 빈칸으로 두고 사람에게 물어야 합니다');
  assert.equal(birthFromRrn('96042924191100'), '', '열네 자리도 안 본다');
  assert.equal(birthFromRrn('960429-2419110'), '1996-04-29', '★ 제대로 된 것은 그대로 읽는다');
});

test('붙임표가 없어도, 빈칸이 섞여도 읽는다', () => {
  const { birthFromRrn } = load();
  assert.equal(birthFromRrn('9604292419110'), '1996-04-29');
  assert.equal(birthFromRrn(' 960429 - 2419110 '), '1996-04-29');
});

/* ══════ ② 어느 것을 먼저 보는가 ══════ */

test('★★ 적어 둔 생년월일이 «먼저»다 — 주민번호는 없을 때만 본다', () => {
  const { certBirthOf } = load();
  assert.equal(certBirthOf({ birthDate: '1990-05-05', rrn: '960429-2419110' }), '1990-05-05',
    '★★ 사람이 적어 둔 값을 주민번호가 덮었습니다');
  assert.equal(certBirthOf({ birthDate: '', rrn: '960429-2419110' }), '1996-04-29',
    '★★ 주민번호가 있는데도 안 뽑았습니다 — 퇴사자 14명이 여기서 채워집니다');
  assert.equal(certBirthOf({ birthDate: '   ', rrn: '960429-2419110' }), '1996-04-29',
    '빈칸만 든 값은 «없는 것»으로 본다');
  assert.equal(certBirthOf({}), '', '둘 다 없으면 지어내지 않는다');
  assert.equal(certBirthOf(null), '');
});

/* ══════ ③ 담당업무 자리에 직위를 옮겨 적지 않는다 ══════ */

test('★★ 「담당업무: 직원」이 다시 나가지 않는다 — 직위는 담당업무가 아니다', () => {
  const { certDutyOf } = load();
  ['직원', '사무직', '주임', '대리', '과장', '차장', '사무장'].forEach(function(t){
    const got = certDutyOf({ title: t });
    assert.notEqual(got, t,
      '★★ 직위 「' + t + '」을 담당업무 자리에 그대로 옮겨 적었습니다');
    assert.ok(got && got !== '-', '★ 「' + t + '」의 담당업무가 비었습니다');
  });
});

test('★ 직위마다 «자기 문구»가 나온다 — 표의 줄이 죽어 있지 않다', () => {
  const { certDutyOf, CERT_DUTY_BY_TITLE } = load();
  assert.match(certDutyOf({ title: '대표노무사' }), /노무법인 운영/);
  assert.match(certDutyOf({ title: '노무사' }), /노무자문/);
  assert.match(certDutyOf({ title: '사무장' }), /사무 총괄/,
    '★ 사무장이 기본 문구로 떨어졌습니다 — 표의 줄이 지워졌는지 보십시오');
  /* 등록부에 없는 직위여도 「노무사」가 들어 있으면 노무사 일이다 */
  assert.equal(certDutyOf({ title: '수석노무사' }), certDutyOf({ title: '노무사' }),
    '★ 노무사가 들어간 직위를 못 알아봤습니다');
  /* ⚠ 표에 «기본값과 똑같은» 줄을 넣으면 그 줄은 지워도 아무 일이 안 일어난다 —
     검사가 못 잡는 죽은 줄이다. 표에는 다른 말을 쓰는 직위만 둔다. */
  const 기본 = certDutyOf({ title: '이런직위는없다' });
  Object.keys(CERT_DUTY_BY_TITLE).forEach(function(t){
    assert.notEqual(CERT_DUTY_BY_TITLE[t], 기본,
      '★ 「' + t + '」 줄이 기본 문구와 같습니다 — 지워도 티가 안 나는 죽은 줄입니다');
  });
});

test('★ 적어 둔 담당업무가 언제나 이긴다', () => {
  const { certDutyOf } = load();
  assert.equal(certDutyOf({ title: '노무사', duties: '산재 전담' }), '산재 전담');
  assert.equal(certDutyOf({ title: '직원', jobDuty: '4대보험 신고' }), '4대보험 신고');
  assert.equal(certDutyOf({ title: '직원', duties: '  ' }), certDutyOf({ title: '직원' }),
    '빈칸만 든 값은 «없는 것»으로 본다');
});

test('모르는 직위여도 «직위 이름»을 담당업무로 내보내지 않는다', () => {
  const { certDutyOf } = load();
  const got = certDutyOf({ title: '없는직책이름' });
  assert.notEqual(got, '없는직책이름', '★★ 모르는 직위가 그대로 새어 나갑니다');
  assert.ok(got && got !== '-');
});

/* ══════ ④ 화면에 제대로 걸려 있나 ══════ */

test('★★ 증명서가 세 자리를 차례로 본다 — 손입력 → 인사기록 → 주민번호', () => {
  assert.match(bare, /String\(birthInput\|\|''\)\.trim\(\)\s*\|\|\s*certBirthOf\(u\)/,
    '★★ 증명서가 아직 u.birthDate 하나만 봅니다 — 퇴사자는 전원 「-」로 나갑니다');
  assert.doesNotMatch(bare, /'생년월일'[^]{0,400}?u\.birthDate \|\| '-'/,
    '★★ 옛 코드(u.birthDate || \'-\')가 남아 있습니다');
});

test('★★ 담당업무가 직위로 되돌아가지 않았다', () => {
  assert.doesNotMatch(bare, /dutyText\s*=\s*[^;]*\(u\.title\s*\|\|\s*'-'\)/,
    '★★ 담당업무 마지막 갈래가 다시 직위입니다 — 「담당업무: 직원」이 나갑니다');
  assert.match(bare, /var dutyText = String\(dutyInput\|\|''\)\.trim\(\) \|\| certDutyOf\(u\)/,
    '★★ 담당업무가 직위별 문구를 안 씁니다');
});

test('★★ 생년월일 입력칸이 있고, 사람을 바꾸면 비운다', () => {
  assert.match(bare, /value:birthInput,\s*onChange/,
    '★★ 생년월일을 손으로 넣을 칸이 없습니다 — 주민번호가 없는 7명은 넣을 길이 없습니다');
  const 고르는칸 = bare.match(/onChange:function\(e\)\{ if\(e\.target\.value\)[^}]*setSid\(e\.target\.value\)[^}]*\}/g) || [];
  assert.equal(고르는칸.length, 2, '재직·퇴직 두 칸이 있어야 합니다 — 찾은 것 ' + 고르는칸.length + '개');
  고르는칸.forEach(function(seg, i){
    assert.match(seg, /setBirthInput\(''\)/,
      '★★ ' + (i + 1) + '번째 고르는 칸이 생년월일을 안 비웁니다 — 앞사람 생년월일이 그대로 따라갑니다');
  });
});

/* ══════ ⑤ 주민번호는 «보이지» 않는다 ══════ */

test('★★ 증명서 문서에 주민번호 자체를 그리지 않는다', () => {
  const from = bare.indexOf('function renderCertContent(){');
  const to = bare.indexOf('function ', from + 30);
  assert.ok(from > 0, 'renderCertContent 를 못 찾았습니다');
  const 문서 = bare.slice(from, to > from ? to : from + 12000);
  assert.doesNotMatch(문서, /u\.rrn/,
    '★★ 증명서에 주민번호가 그려집니다 — 나가는 문서에는 생년월일까지만 적습니다');
});
