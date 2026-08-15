/* 계약서를 AI 가 스스로 가린다 — 대표 지시 2026-08-10
   "자문계약서등은 인식이 안된는데 어떻게 해야하나?"

   자문등계약서는 손으로 만든 직접분류라 판독기가 이름조차 몰랐다. 계약서는
   늘 「기타서류」로 떨어졌고 그 탭은 0장으로 남았다. 종류를 하나 늘려
   고정 탭으로 올린다.

   금액도 담는다(대표 지시). 급여서류와는 다르다 — 급여는 사람마다 다른
   임금이라 안 담지만, 계약 보수는 우리 사무소의 수임 조건이다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'pu-photos.html'), 'utf8');
const reader = fs.readFileSync(path.join(root, 'js', 'pu-doc-read.js'), 'utf8');

test('★ 판독기가 계약서를 종류로 받아들인다', () => {
  const kinds = reader.match(/var KINDS = \{[^}]*\}/);
  assert.ok(kinds, 'KINDS 표를 찾지 못했습니다.');
  assert.ok(/contract: 1/.test(kinds[0]),
    'contract 가 KINDS 에 없으면 판독기가 답을 other 로 덮어 버립니다.');
});

test('★ 무엇이 계약서인지 프롬프트가 알려 준다', () => {
  const line = reader.match(/kind 는 다음 중 하나입니다[^']*/);
  assert.ok(line, '종류 목록 문장을 찾지 못했습니다.');
  /* 이름이 한 글자라도 다르면 판독기가 못 알아본다 — 앞뒤를 함께 본다. */
  assert.ok(/[ ,]contract\(계약서/.test(line[0]),
    '목록에 없거나 이름이 다르면 AI 가 계약서라는 답을 아예 내놓지 않습니다.');
  ['자문계약서', '위임계약서'].forEach(function (w) {
    assert.ok(line[0].indexOf(w) > -1, w + ' 를 예로 안 들면 무엇을 계약서로 볼지 애매합니다.');
  });
  assert.ok(!/위 다섯이 아님/.test(line[0]),
    'other 설명이 「위 다섯」에 멈춰 있으면 종류를 늘린 것과 어긋납니다.');
});

test('★ 계약서에서 금액까지 읽는다 — 급여서류와 다른 점', () => {
  const spec = reader.match(/kind=contract 이면 키:[^']*/);
  assert.ok(spec, 'contract 키 목록이 없습니다.');
  ['fee', 'retainer', 'success', 'deposit'].forEach(function (k) {
    assert.ok(spec[0].indexOf(k) > -1, k + ' 를 안 읽으면 대표 지시와 어긋납니다.');
  });
  ['signDate', 'endDate', 'term'].forEach(function (k) {
    assert.ok(spec[0].indexOf(k) > -1, k + ' 가 없으면 언제까지인지 알 수 없습니다.');
  });
  assert.ok(/지어내지 마세요/.test(spec[0]),
    '없는 금액을 지어내면 계약 조건을 잘못 알게 됩니다 — 안 읽느니만 못합니다.');
});

test('★ 계약서는 「확인 필요」로 쌓이지 않는다', () => {
  /* 넣을 곳이 없는 것은 할 일이 아니다 — 급여서류와 같은 이유.
     done 을 안 달면 계약서를 올릴 때마다 치울 수 없는 할 일이 쌓인다. */
  const fn = reader.match(/function autoOk\([\s\S]*?\n  \}/);
  assert.ok(fn, 'autoOk 를 찾지 못했습니다.');
  const line = fn[0].match(/if \(r\.kind === 'contract'\)[^\n]*/);
  assert.ok(line, '계약서를 따로 가르는 곳이 없습니다.');
  assert.ok(/done: true/.test(line[0]),
    'done 이 없으면 올릴 때마다 「확인 필요」가 쌓여 목록을 못 믿게 됩니다.');
  assert.ok(/계약서/.test(line[0]), '왜 넘어갔는지 한국어로 안 알려 줍니다.');
});

test('계약서는 명함첩·업체관리로 넘기지 않는다', () => {
  /* 상대 업체는 이미 명함으로 들어와 있다. 계약서로 또 만들면 이름만 있는
     빈 껍데기가 생겨 같은 회사가 두 벌 쌓인다. */
  const fn = reader.match(/function autoOk\([\s\S]*?\n  \}/)[0];
  const at = fn.indexOf("r.kind === 'contract'");
  const line = fn.slice(at, fn.indexOf('\n', at));
  assert.ok(/auto: false/.test(line), '계약서로 업체를 자동 생성하면 두 벌이 쌓입니다.');
});

test('★ 사진첩에 「계약서」 탭이 있다', () => {
  const tabs = app.match(/const KIND_TABS = \[[\s\S]*?\n\];/);
  assert.ok(tabs, 'KIND_TABS 를 찾지 못했습니다.');
  assert.ok(/kinds: \['contract'\]/.test(tabs[0]),
    '탭이 contract 를 안 걸면 계약서가 기타서류로 떨어집니다.');
  const row = tabs[0].match(/[^\n]*'contract'[^\n]*/)[0];
  assert.ok(/short:/.test(row),
    '짧은 이름이 없으면 폰에서 탭이 두 줄이 되어 사진을 밀어냅니다.');
});

test('계약서 탭이 기타서류보다 앞에 온다', () => {
  /* 「기타서류」는 나머지를 받는 자리다 — 뒤에 두어야 읽는 순서가 뜻과 맞는다. */
  const tabs = app.match(/const KIND_TABS = \[[\s\S]*?\n\];/)[0];
  assert.ok(tabs.indexOf("'contract'") < tabs.indexOf("key: 'other'"),
    '나머지를 받는 탭이 앞서면 표를 읽는 사람이 헷갈립니다.');
});

test('★ 읽어 둔 계약 조건이 크게 보기에 나온다', () => {
  const rows = app.match(/const READ_ROWS = \[[\s\S]*?\n\];/);
  assert.ok(rows, 'READ_ROWS 를 찾지 못했습니다.');
  ['signDate', 'endDate', 'term', 'fee', 'retainer', 'success', 'deposit', 'docName']
    .forEach(function (k) {
      assert.ok(rows[0].indexOf("'" + k + "'") > -1,
        k + ' 에 이름표가 없으면 읽고도 화면에 안 나와 「안 읽혔다」로 보입니다.');
    });
});
