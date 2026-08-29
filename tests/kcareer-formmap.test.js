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

test('목록 표는 낱개 칸이 아니라 «한 줄»로 묶는다 — 아홉 줄이 되면 못 쓴다', () => {
  const m = M.scan(tbl([['기간', '기관명', '직위'], ['', '', ''], ['', '', ''], ['', '', '']]));
  assert.equal(m.lists.length, 1);
  assert.equal(m.lists[0].kind, 'career');
  assert.equal(m.lists[0].blank, 3, '빈 줄이 몇 개인지 알아야 「3줄까지」를 말해 준다');
  assert.equal(m.slots.length, 0, '목록 표의 칸은 낱개로 세지 않는다');
});

test('학교 열이 있으면 학력 표로 본다', () => {
  const m = M.scan(tbl([['기간', '학교명', '전공'], ['', '', '']]));
  assert.equal(m.lists[0].kind, 'edu');
});

test('머리행 열쇠가 하나뿐이면 목록 표로 보지 않는다 — 보통 표를 잘못 삼키면 안 된다', () => {
  const m = M.scan(tbl([['기간', '비고'], ['', '']]));
  assert.equal(m.lists.length, 0);
  assert.ok(m.slots.length > 0, '보통 표로서 자리는 나와야 합니다');
});

test('글상자를 세어서 알린다 — 조용히 빠지면 「채웠다는데 비어 있다」가 된다', () => {
  const xml = tbl([['성명', '']]) + '<hp:drawText><hp:p><hp:run><hp:t>글상자 속 글</hp:t></hp:run></hp:p></hp:drawText>';
  assert.equal(M.scan(xml).warn.textBoxes, 1);
});

test('중첩 표(칸 안의 표)를 세어서 알린다 — 건드리지 않되 «있다»고는 말한다', () => {
  const inner = tbl([['가', '']]);
  const outer = '<hp:tbl><hp:tr><hp:tc><hp:p><hp:run>' + inner + '</hp:run></hp:p></hp:tc></hp:tr></hp:tbl>';
  assert.equal(M.scan(outer).warn.nested, 1);
});

/* ── 짝 맞추기 ── 모르면 «모른다»고 남긴다. 지어내면 엉뚱한 자리에 값이 박힌다. */

test('★ 왼쪽이 성명이면 그 행의 「(한글)」은 이름 — 여기서 이름이 통째로 빠졌었다', () => {
  const m = M.guess(M.scan(tbl([['성  명', '(한글)', '생년월일', '']])), {});
  assert.equal(m.slots.find((s) => s.text === '(한글)').guess, 'name');
});

test('왼쪽이 성명이 «아니면» 「(한글)」에 이름을 넣지 않는다 — 엉뚱한 자리에 박힌다', () => {
  const m = M.guess(M.scan(tbl([['비고', '(한글)']])), {});
  assert.equal(m.slots.find((s) => s.text === '(한글)').guess, '');
});

test('「(한자)」는 한자 이름', () => {
  const m = M.guess(M.scan(tbl([['성  명', '(한자)']])), {});
  assert.equal(m.slots.find((s) => s.text === '(한자)').guess, 'nameHanja');
});

test('「(인)」은 도장 자리로 따로 표시한다 — 글자를 넣으면 안 된다', () => {
  const m = M.guess(M.scan(tbl([['성명', '(인)']])), {});
  assert.equal(m.slots.find((s) => s.text === '(인)').guess, '__stamp');
});

test('흔한 말을 알아본다 — 신청인·위촉대상자·추천인', () => {
  const m = M.guess(M.scan(tbl([['신청인', ''], ['위촉대상자', ''], ['추천인', '']])), {});
  m.slots.forEach((s) => assert.equal(s.guess, 'name', s.left + ' 을(를) 이름으로 봐야 합니다'));
});

test('주민등록번호는 알아보되 기본은 «비워 둠» — 자동으로 나가면 안 되는 정보다', () => {
  const m = M.guess(M.scan(tbl([['주민등록번호', '']])), {});
  const s = m.slots[0];
  assert.equal(s.guess, '', '짐작으로 채우지 않는다');
  assert.equal(s.hint, 'rrn', '무슨 칸인지는 알려 주되 값은 사람이 넣는다');
});

test('목록 표에도 짐작을 붙인다 — 경력 표면 경력을 넣는다', () => {
  const m = M.guess(M.scan(tbl([['기간', '기관명', '직위'], ['', '', '']])), {});
  assert.equal(m.lists[0].guess, 'career');
});

test('사전에 없는 말은 «모름»으로 남긴다 — 지어내지 않는다', () => {
  const m = M.guess(M.scan(tbl([['추천사유', ''], ['비상연락망', '']])), {});
  assert.ok(m.slots.every((s) => s.guess === ''), '모르면 모른다고 해야 사람이 고른다');
});

/* ── 되돌려 넣기와 서식 지문 ── */
const WHO = { fields: { name: '권형하', nameHanja: '權炯河', birth: '1975.01.07',
  phone: '010-1234-5678', addr: '충남 천안시', org: '푸른노무법인', title: '대표노무사' },
  career: [{ period: '2025', org: '충청남도', role: '노동권익보호관' }] };

test('빈 칸에 고른 값이 들어간다', () => {
  const xml = tbl([['성명', ''], ['주소', '']]);
  const r = M.apply(xml, { picks: { t0r0c1: 'name', t0r1c1: 'addr' }, data: WHO });
  assert.ok(r.xml.indexOf('권형하') > 0);
  assert.ok(r.xml.indexOf('충남 천안시') > 0);
  assert.equal(r.filled.length, 2);
});

test('★ 안내글 뒤에 «이어» 쓴다 — 「(한글)」을 지우지 않는다', () => {
  const xml = tbl([['성  명', '(한글)']]);
  const r = M.apply(xml, { picks: { t0r0c1: 'name' }, data: WHO });
  assert.ok(r.xml.indexOf('(한글)') > 0, '안내글은 남아야 합니다 — 서식이 뜻하는 바가 사라집니다');
  assert.ok(r.xml.indexOf('권형하') > 0, '이름이 들어가야 합니다');
});

test('«비워 둠»(빈 값)을 고르면 아무것도 안 넣는다', () => {
  const xml = tbl([['성명', '']]);
  const r = M.apply(xml, { picks: { t0r0c1: '' }, data: WHO });
  assert.equal(r.changed, false);
  assert.equal(r.filled.length, 0);
});

test('도장 자리에는 글자를 넣지 않는다 — 도장은 따로 찍는다', () => {
  const xml = tbl([['성명', '(인)']]);
  const r = M.apply(xml, { picks: { t0r0c1: '__stamp' }, data: WHO });
  assert.equal(r.changed, false);
});

test('목록 표는 고른 만큼 줄로 넣는다', () => {
  const xml = tbl([['기간', '기관명', '직위'], ['', '', '']]);
  const r = M.apply(xml, { picks: {}, lists: { L0: 'career' }, data: WHO });
  assert.ok(r.xml.indexOf('충청남도') > 0);
});

test('넣지 못한 자리는 «세어서» 돌려준다 — 조용히 넘기면 「저장했는데 비어 있다」가 된다', () => {
  const xml = tbl([['성명', '']]);
  const r = M.apply(xml, { picks: { t9r9c9: 'name' }, data: WHO });
  assert.equal(r.failed.length, 1);
  assert.equal(r.failed[0].id, 't9r9c9');
});

test('서식 지문 — 같은 서식은 같고, 칸 이름이 달라지면 달라진다', () => {
  const a = tbl([['성명', ''], ['주소', '']]);
  const b = tbl([['성명', ''], ['주소', '']]);
  const c = tbl([['성명', ''], ['연락처', '']]);
  assert.equal(M.fingerprint(a), M.fingerprint(b));
  assert.notEqual(M.fingerprint(a), M.fingerprint(c),
    '칸 이름이 달라지면 옛 기억을 쓰면 안 됩니다 — 엉뚱한 칸에 넣는 것이 더 나쁘다');
});

test('★ 서식 지문은 «채운 값»에 흔들리지 않는다 — 한 번 채운 서식도 같은 서식이다', () => {
  const before = tbl([['성명', ''], ['주소', '']]);
  const after = M.apply(before, { picks: { t0r0c1: 'name' }, data: WHO }).xml;
  assert.equal(M.fingerprint(before), M.fingerprint(after));
});

/* ── 입력판에서 «직접 친 글자»를 그대로 넣기 (2026-08-29 대표 승인) ── */

test('★ 직접 친 글자를 그 칸에 넣는다 — 사전에 없는 칸도 채울 수 있어야 한다', () => {
  const xml = tbl([['위촉희망분야', '']]);
  const r = M.apply(xml, { values: { t0r0c1: '노동관계 자문' }, data: WHO });
  assert.ok(r.xml.indexOf('노동관계 자문') > 0);
  assert.equal(r.filled.length, 1);
});

test('직접 친 글자는 «고른 열쇠»보다 앞선다 — 사람이 고쳐 쓴 것이 최종이다', () => {
  const xml = tbl([['성명', '']]);
  const r = M.apply(xml, { picks: { t0r0c1: 'name' }, values: { t0r0c1: '홍길동' }, data: WHO });
  assert.ok(r.xml.indexOf('홍길동') > 0);
  assert.equal(r.xml.indexOf('권형하'), -1, '직접 친 것이 이겨야 합니다');
});

test('안내글 뒤에 직접 친 글자도 «이어» 쓴다', () => {
  const xml = tbl([['성  명', '(한글)']]);
  const r = M.apply(xml, { values: { t0r0c1: '홍길동' }, data: WHO });
  assert.ok(r.xml.indexOf('(한글)') > 0, '안내글은 남아야 합니다');
  assert.ok(r.xml.indexOf('홍길동') > 0);
});

test('칸 안 라벨은 라벨마다 «따로» 친 값을 넣는다 — 자택과 직장이 섞이면 안 된다', () => {
  const xml = tbl([['전화번호', '자택:______  직장:______']]);
  const r = M.apply(xml, { values: { 't0r0c1:phoneHome': '041-111-1111', 't0r0c1:phoneWork': '041-222-2222' }, data: WHO });
  const txt = (r.xml.match(/<hp:t[^>]*>([\s\S]*?)<\/hp:t>/g) || []).map((x) => x.replace(/<[^>]*>/g, '')).join(' ');
  assert.match(txt, /자택:\s*041-111-1111/);
  assert.match(txt, /직장:\s*041-222-2222/);
});

test('빈 글자를 넣으면 그 칸은 비워 둔다 — 지우개로도 쓸 수 있어야 한다', () => {
  const xml = tbl([['성명', '']]);
  const r = M.apply(xml, { picks: { t0r0c1: 'name' }, values: { t0r0c1: '' }, data: WHO });
  assert.equal(r.changed, false);
});

/* ── 한 글자씩 쪼개진 칸 (대표 서식 실물 2026-08-29) ──
   「생 년 월 일 | 7 | 5 | 0 | 1 | 0 | 7 | 나이 | 만 43세」처럼
   날짜를 «한 자리씩» 나눠 적는 서식이 흔하다. 한 칸에 통째로 넣으면 첫 칸만 차고 나머지가 빈다. */

test('★ 라벨 뒤에 «좁은 빈 칸이 여럿» 이어지면 한 글자씩 나눠 넣는다', () => {
  const xml = tbl([['생년월일', '', '', '', '', '', '']]);
  const m = M.guess(M.scan(xml), WHO);
  const run = M.digitRun(m, 0, 0, 1);
  assert.ok(run, '한 글자씩 넣을 자리를 알아봐야 합니다');
  assert.equal(run.length, 6, '빈 칸 여섯이 이어져 있습니다');
});

test('날짜에서 숫자만 뽑아 칸 수에 맞춘다 — 1975.01.07 → 750107', () => {
  assert.equal(M.digitsFor('1975.01.07', 6), '750107');
  assert.equal(M.digitsFor('1975.01.07', 8), '19750107');
  assert.equal(M.digitsFor('750107', 6), '750107');
});

test('칸 수가 안 맞으면 «나눠 넣지 않는다» — 어긋나게 적느니 비워 둔다', () => {
  assert.equal(M.digitsFor('1975.01.07', 5), '');
  assert.equal(M.digitsFor('충남 천안시', 6), '', '숫자가 아닌 값은 나누지 않습니다');
});

test('★ 실제로 한 칸에 한 글자씩 들어간다', () => {
  const xml = tbl([['생년월일', '', '', '', '', '', '']]);
  const r = M.apply(xml, { picks: { t0r0c1: 'birth' }, data: WHO });
  const cells = (r.xml.match(/<hp:t[^>]*>([\s\S]*?)<\/hp:t>/g) || [])
    .map((x) => x.replace(/<[^>]*>/g, ''));
  assert.deepEqual(cells.slice(1, 7), ['7', '5', '0', '1', '0', '7']);
});

test('보통 칸에는 그대로 통째로 넣는다 — 나누기가 끼어들면 안 된다', () => {
  const r = M.apply(tbl([['생년월일', '']]), { picks: { t0r0c1: 'birth' }, data: WHO });
  assert.ok(r.xml.indexOf('1975.01.07') > 0);
});
