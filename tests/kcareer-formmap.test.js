/* 칸 지도 — 「이름은 짐작이지만 자리는 사실이다」
   묻는 것: 모양이 전혀 다른 서식이 와도 채울 자리를 «하나도 안 놓치는가».
   설계서: docs/superpowers/specs/2026-08-29-kcareer-칸지도-서식채움-design.md */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../js/kcareer-formmap.js');
const H = require('../hwpx_gen.js');

const tbl = (rows) => H.tablePara(rows, H.cols(rows[0].map(() => 1 / rows[0].length)));

/* 모양이 전혀 다른 서식들 — 여기에 하나를 더해도 검사가 그대로 돌아야 한다 */
const FORMS = {
  지원서: [['성  명', '(한글)', '생년월일', ''],
           ['현 주 소', '', '', ''],
           ['전화번호', '자택:____  직장:____', '휴대폰', '']],
  세로라벨: [['성명', ''], ['생년월일', ''], ['주소', ''], ['연락처', ''], ['이메일', '']],
  두쌍: [['신청인', '', '주민등록번호', ''], ['소속기관', '', '직  위', '']],
  처음보는말: [['위촉대상자', '', '위촉희망분야', ''], ['비상연락망', '', '', '']],
  도장자리: [['작성일', ''], ['성명', '(인)']]
};

/* 픽스처에서 «직접 세어» 견준다 — 숫자를 박아 두면 픽스처를 손볼 때마다 검사가 깨진다 */
const emptyCount = (rows) => rows.reduce((n, r) => n + r.filter((c) => c === '').length, 0);

test('빈 칸은 빠짐없이 자리로 잡는다 — 이름을 몰라도', () => {
  const m = M.scan(tbl(FORMS.처음보는말));
  /* 사전에 없는 말이라 짐작은 하나도 못 하지만, 자리는 «하나도 빠짐없이» 나와야 한다 */
  assert.equal(m.slots.filter((s) => s.kind === '빈칸').length, emptyCount(FORMS.처음보는말));
  assert.ok(m.slots.every((s) => s.guess === ''), 'scan 단계에서는 짐작하지 않는다');
});

test('어느 서식이든 빈 칸을 하나도 안 놓친다 — 이것이 이 모듈의 존재 이유다', () => {
  Object.keys(FORMS).forEach((name) => {
    const m = M.scan(tbl(FORMS[name]));
    assert.equal(m.slots.filter((s) => s.kind === '빈칸').length, emptyCount(FORMS[name]),
      name + ' 에서 빈 칸을 놓쳤습니다');
  });
});

test('왼쪽 칸 글자를 함께 담는다 — 짝 맞추기의 유일한 실마리다', () => {
  const m = M.scan(tbl(FORMS.세로라벨));
  const first = m.slots.find((s) => s.row === 0 && s.col === 1);
  assert.equal(first.left, '성명');
});

test('괄호 안내글은 「안내글뒤」로 — 덮지 않고 뒤에 이어 쓸 자리다', () => {
  const m = M.scan(tbl(FORMS.지원서));
  const hint = m.slots.find((s) => s.text === '(한글)');
  assert.ok(hint, '「(한글)」을 자리로 잡아야 합니다 — 여기서 이름이 통째로 빠졌었다');
  assert.equal(hint.kind, '안내글뒤');
  assert.equal(hint.left, '성  명');
});

test('칸 안에 라벨과 빈자리가 함께면 「칸안라벨」', () => {
  const m = M.scan(tbl(FORMS.지원서));
  const c = m.slots.find((s) => /자택/.test(s.text));
  assert.equal(c.kind, '칸안라벨');
});

test('그냥 본문은 자리로 보지 않는다 — 절대 덮지 않는다', () => {
  const m = M.scan(tbl([['제출서류', '1. 이력서(사진부착) 1부']]));
  assert.equal(m.slots.length, 0);
});

test('자리 이름표는 표·행·열로 만든다 — 기억의 열쇠가 된다', () => {
  const m = M.scan(tbl(FORMS.세로라벨));
  assert.equal(m.slots[0].id, 't0r0c1');
  const ids = m.slots.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length, '이름표가 겹치면 기억이 엉킨다');
});

test('서식 다섯을 다 훑는다 — 어느 것에서도 자리가 0이 되지 않는다', () => {
  Object.keys(FORMS).forEach((name) => {
    const m = M.scan(tbl(FORMS[name]));
    assert.ok(m.slots.length > 0, name + ' 에서 자리를 하나도 못 찾았습니다');
  });
});
