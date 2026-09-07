'use strict';
/* 대괄호 라벨 · 「전 화」 · 자격번호 흩어짐 · 소재지 (대표 제보 2026-09-07)
   ─────────────────────────────────────────────────────────────
   대표 물음: 「사진 이름 직장전화번호 학력사항등에 대하여 왜 입력이안되나?」
   그 서식(지방공기업평가원 위촉직이사 지원서 2쪽)을 실제로 열어 하나씩 확인했다.

   ■ 넷이 서로 다른 까닭이었다
     ① 이름  「성 명 | [한글] [한자] [영문]」 — 세 라벨이 «한 칸에 대괄호»로 있다.
              칸 안 라벨 길은 «콜론»만 읽었다(1쪽의 「자택: 직장:」은 잘 됐다).
     ② 전화  「전 화 | [자택](  )  -[직장](  )  -」 — 왼쪽 라벨이 「전 화」인데
              사전에는 「전화번호」만 있었다(「전화번호?」는 «호»만 optional).
              게다가 칸 안이 대괄호꼴이라 콜론이 없다. 그래서 «채울 곳 목록에도» 안 올랐다.
     ③ 자격  자격번호가 「3 | 0 | 1 | 6」처럼 네 칸에 한 글자씩 흩어졌다.
              «숫자 칸 나눠 넣기»가 오작동했다 — 자격 표의 넓은 빈 칸 넷을 숫자 칸으로 봤다.
     ④ 소재지 학력 표의 소재지 칸이 «늘» 비었다 — 사전에 없었고 담을 칸도 없었다.

   여기서 못 박는 것:
     ① 대괄호 라벨이 «둘 이상»일 때만 그 길로 간다 — 하나뿐인 「[한자]」·「(한자)」는 옛 약속
     ② 「전 화」를 알아본다
     ③ 숫자로만 된 값 + 붙어 있는 칸일 때만 나눠 넣는다
     ④ 「라벨위」는 «같은 열»에서 찾는다 — 칸 순서로 보면 남의 열이 라벨이 된다
     ⑤ 세로로 합친 «구역 이름»은 라벨로 본다 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const X = require('../js/kcareer-hwpxfill.js');
const M = require('../js/kcareer-formmap.js');
const H = require('../hwpx_gen.js');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'kcareer.html'), 'utf8');
function tbl(rows) {
  var n = 0;
  rows.forEach(function (r) { if (r.length > n) n = r.length; });
  return H.tablePara(rows, H.cols(rows[0].map(function () { return 1 / n; })));
}
function 칸(t) {
  return '<hp:tc><hp:cellAddr colAddr="1" rowAddr="1"/><hp:p><hp:run><hp:t>'
    + t + '</hp:t></hp:run></hp:p></hp:tc>';
}
const WHO = { name: '권형하', nameHanja: '權炯河', nameEng: 'KWEON HYEONGHA',
  birth: '1975.01.07', phone: '010-0000-0000', phoneHome: '041-000-0000',
  phoneWork: '041-556-0035', license: '공인노무사 제3016호' };

/* ══════ ② 「전 화」 ══════ */
test('★★ 「전 화」를 알아본다 — 「전화번호?」는 «호»만 optional 이라 못 잡았다', () => {
  ['전 화', '전화', '전화번호', '전화번'].forEach(function (t) {
    assert.equal(X.fieldKeyOf(t), 'phone', t + ' 을 못 알아봅니다');
  });
  /* 갈래가 붙은 것은 그대로 갈라 본다 */
  assert.equal(X.fieldKeyOf('자택전화'), 'phoneHome');
  assert.equal(X.fieldKeyOf('직장전화'), 'phoneWork');
  assert.equal(X.fieldKeyOf('전화(자택)'), 'phoneHome');
});

/* ══════ ④ 소재지 ══════ */
test('★ 「소재지」 열을 알아본다 — 학력 표의 그 칸이 늘 비어 나갔다', () => {
  ['소재지', '소재', '지역', '위치'].forEach(function (t) {
    assert.equal(X.colKeyOf(t), 'area', t + ' 을 못 알아봅니다');
  });
  /* ⚠ 「학교소재지」는 학교명과 한 칸인 서식의 머리칸이다 — 그대로 school 이어야 한다 */
  assert.equal(X.colKeyOf('학교소재지'), 'school', '학교소재지가 area 로 바뀌면 학교명이 안 들어갑니다');
});

test('★ 담을 칸과 내보낼 값이 둘 다 있다 — 하나만 있으면 늘 빈다', () => {
  assert.match(SRC, /\{key:'area',label:'소재지'\}/, '학력 화면에 소재지 칸이 없습니다');
  assert.match(SRC, /area:r\.area\|\|''/, '채우기로 소재지 값을 내보내지 않습니다');
});

test('★★ 소재지가 실제로 학력 표에 들어간다', () => {
  const xml = tbl([
    [{ t: '학력사항', rowSpan: 2 }, '기 간', '학 교 명', '전 공', '소재지', '학 위'],
    [null, '년   월 ~   년   월', '', '', '', '']
  ]);
  const r = X.autoFill(xml, { fields: {}, edu: [{ period: '1994~1998', school: '영남대학교',
    major: '법학', area: '경산시', degree: '학사' }], career: [], secrets: {} });
  assert.ok(r.xml.indexOf('경산시') >= 0, '소재지가 안 들어갔습니다');
  /* 제 칸에 들어갔나 — 소재지 열에 있어야 한다 */
  const rows = X.splitRows(X.eachTable(r.xml, function (t) { return t; }).match(/<hp:tbl[\s\S]*<\/hp:tbl>/)[0]);
  const head = X.splitCells(rows[0]), data = X.splitCells(rows[1]);
  let 소재지열 = -1;
  head.forEach(function (c) { if (X.cellText(c).replace(/\s/g, '') === '소재지') 소재지열 = X.colAddrOf(c); });
  assert.ok(소재지열 >= 0, '소재지 열을 못 찾았습니다');
  let 값 = '';
  data.forEach(function (c) { if (X.colAddrOf(c) === 소재지열) 값 = X.cellText(c).trim(); });
  assert.equal(값, '경산시', '소재지가 «남의 칸»에 들어갔습니다');
});

/* ══════ ① 대괄호 라벨 ══════ */
test('★★★ 대괄호 라벨이 «둘 이상»이면 한 칸에 여러 값을 채운다 — 「[한글] [한자] [영문]」', () => {
  const out = X.cellText(X.incellFill(칸('[한글]     [한자]     [영문]'), WHO));
  ['권형하', '權炯河', 'KWEON HYEONGHA'].forEach(function (v) {
    assert.ok(out.indexOf(v) >= 0, v + ' 이 안 들어갔습니다: ' + out);
  });
  /* 라벨은 서식 문구다 — 지우지 않는다 */
  ['[한글]', '[한자]', '[영문]'].forEach(function (l) {
    assert.ok(out.indexOf(l) >= 0, l + ' 라벨이 사라졌습니다: ' + out);
  });
});

test('★★★ 「[자택](  )  -[직장](  )  -」 — 괄호 빈자리를 삼켜 값으로 바꾼다', () => {
  const out = X.cellText(X.incellFill(칸('[자택](  )  -[직장](  )  -'), WHO));
  assert.ok(out.indexOf('041-000-0000') >= 0, '자택이 안 들어갔습니다: ' + out);
  assert.ok(out.indexOf('041-556-0035') >= 0, '직장이 안 들어갔습니다: ' + out);
  /* ⚠ 괄호 빈자리를 남기면 「[자택]041-000-0000(  )  -」이 된다 */
  assert.equal(out.indexOf('(  )'), -1, '괄호 빈자리가 남았습니다: ' + out);
});

test('★★★ 대괄호가 «하나뿐»이면 건드리지 않는다 — 그 칸은 통째로 바꾸는 자리표다', () => {
  /* ⚠ 「[한자]」 한 칸은 값으로 «통째로» 바뀌어야 한다(옛 약속).
     칸 안 라벨 길이 여기 손대면 「[한자] 權炯河」처럼 안내글이 남아 이름이 두 겹이 된다. */
  assert.equal(X.cellText(X.incellFill(칸('[한자]'), WHO)), '[한자]',
    '★ 대괄호 하나뿐인 칸을 건드렸습니다');
  /* ⚠ 둥근 괄호 「(한자)」는 «안내글뒤» — 지우지 않고 뒤에 이어 쓴다 */
  assert.equal(X.cellText(X.incellFill(칸('(한자)'), WHO)), '(한자)',
    '★ 안내글 「(한자)」를 건드렸습니다');
  assert.equal(X.cellText(X.incellFill(칸('(인)'), WHO)), '(인)');
});

test('★ 콜론꼴은 그대로 된다 — 뒷걸음질하지 않는다', () => {
  const out = X.cellText(X.incellFill(칸('자택:            직장:'), WHO));
  assert.ok(out.indexOf('041-000-0000') >= 0, '자택이 안 들어갔습니다: ' + out);
  assert.ok(out.indexOf('041-556-0035') >= 0, '직장이 안 들어갔습니다: ' + out);
});

/* ══════ ③ 자격번호가 흩어지던 것 ══════ */
test('★★★ 숫자로만 된 값일 때만 나눠 넣는다 — 「공인노무사 제3016호」가 3|0|1|6 이 됐다', () => {
  assert.equal(M.digitsFor('공인노무사 제3016호', 4), '',
    '★ 글자가 섞인 값을 나눠 넣고 있습니다 — 서류에 「3|0|1|6」이 박힙니다');
  assert.equal(M.digitsFor('제3016호', 4), '', '앞에 글자가 있으면 나누지 않습니다');
  assert.equal(M.digitsFor('충남 천안시', 6), '');
  /* 숫자 칸은 그대로 되어야 한다 — 뒷걸음질 금지 */
  assert.equal(M.digitsFor('1975.01.07', 6), '750107');
  assert.equal(M.digitsFor('1975.01.07', 8), '19750107');
  assert.equal(M.digitsFor('750107', 6), '750107');
  assert.equal(M.digitsFor('1975.01.07', 5), '');
});

test('★★★ 칸이 «떨어져» 있으면 숫자 칸이 아니다 — 넓은 칸 넷을 숫자 칸으로 봤다', () => {
  /* 자격 및 면허 표: 종 류 | 취득년월일 | 상벌사항 | 상벌기관 — 넓은 칸 넷 */
  const 떨어진것 = [{ colAddr: 1 }, { colAddr: 5 }, { colAddr: 10 }, { colAddr: 15 }];
  const 붙은것 = [{ colAddr: 1 }, { colAddr: 2 }, { colAddr: 3 }, { colAddr: 4 }];
  const 가짜지도 = function (run) {
    return { slots: run.map(function (s, i) {
      return { tbl: 0, row: 0, col: 1 + i, kind: '빈칸', colAddr: s.colAddr }; }) };
  };
  assert.equal(M.digitRun(가짜지도(떨어진것), 0, 0, 1), null,
    '★ 떨어진 칸을 숫자 칸으로 봤습니다 — 자격번호가 한 글자씩 흩어집니다');
  assert.ok(M.digitRun(가짜지도(붙은것), 0, 0, 1), '붙은 칸은 숫자 칸이어야 합니다');
});

test('★★ 생년월일 숫자 칸은 그대로 된다 — 끝까지 돌려 확인한다', () => {
  const xml = tbl([['생년월일', '', '', '', '', '', '']]);
  const r = M.apply(xml, { picks: { t0r0c1: 'birth' }, data: { fields: WHO } });
  const cells = (r.xml.match(/<hp:t[^>]*>([\s\S]*?)<\/hp:t>/g) || [])
    .map(function (x) { return x.replace(/<[^>]*>/g, ''); });
  assert.deepEqual(cells.slice(1, 7), ['7', '5', '0', '1', '0', '7'],
    '★ 숫자 칸 나눠 넣기가 망가졌습니다');
});

test('★★ 자격번호가 «한 칸에 통째로» 들어간다', () => {
  const xml = tbl([
    [{ t: '자격및면허', rowSpan: 2 }, '종 류', '취득년월일', '상벌사항', '상벌기관'],
    [null, '', '', '', '']
  ]);
  const m = M.guess(M.scan(xml), { fields: WHO });
  const picks = {}; m.slots.forEach(function (s) { if (s.guess) picks[s.id] = s.guess; });
  const r = M.apply(xml, { picks: picks, lists: {}, data: { fields: WHO } });
  assert.ok(r.xml.indexOf('공인노무사 제3016호') >= 0,
    '자격번호가 통째로 안 들어갔습니다: ' + JSON.stringify(r.filled));
  assert.equal(r.xml.indexOf('>3<'), -1, '★ 한 글자씩 흩어져 들어갔습니다');
});

/* ══════ ④⑤ 라벨위는 같은 열에서 ══════ */
test('★★★ 「라벨위」는 «같은 열»에서 찾는다 — 빈 간격 줄에 전화번호가 박혔다', () => {
  /* 실측한 모양: 맨 앞에 세로로 합친 칸이 있어 「전 화」 줄에는 0번 열이 없다.
     그 아래는 «한 칸짜리 간격 줄»(0번 열)이다.
     칸 «순서»로 위를 보면 간격 줄의 첫 칸 ↔ 「전 화」 가 짝지어져 버린다. */
  const xml = tbl([
    [{ t: '사진', rowSpan: 2 }, '성 명', ''],
    [null, '전 화', ''],
    [{ t: '', colSpan: 3 }]
  ]);
  const rows = X.splitRows(xml.match(/<hp:tbl[\s\S]*<\/hp:tbl>/)[0]);
  /* 서식이 정말 그 모양인지 먼저 본다 — 아니면 검사가 헛것이다 */
  const 둘째 = X.splitCells(rows[1]).map(X.colAddrOf);
  const 셋째 = X.splitCells(rows[2]).map(X.colAddrOf);
  assert.equal(둘째.indexOf(0), -1, '「전 화」 줄에 0번 열이 없어야 합니다: ' + 둘째);
  assert.deepEqual(셋째, [0], '간격 줄은 0번 열 한 칸이어야 합니다: ' + 셋째);

  const m = M.guess(M.scan(xml), { fields: WHO });
  const 간격줄 = m.slots.filter(function (s) { return s.row === 2; });
  간격줄.forEach(function (s) {
    assert.equal(s.guess, '', '★ 빈 간격 줄이 「' + s.up + '」 칸으로 잡혔습니다 — 값이 박힙니다');
  });
  const picks = {}; m.slots.forEach(function (s) { if (s.guess) picks[s.id] = s.guess; });
  const r = M.apply(xml, { picks: picks, lists: {}, data: { fields: WHO } });
  const 마지막 = X.cellText(X.splitCells(X.splitRows(
    r.xml.match(/<hp:tbl[\s\S]*<\/hp:tbl>/)[0])[2])[0]).trim();
  assert.equal(마지막, '', '★ 빈 간격 줄에 값이 들어갔습니다: ' + 마지막);
});

test('★★ 세로로 합친 «구역 이름»은 라벨로 본다 — 자격및면허 → 자격', () => {
  const xml = tbl([
    [{ t: '자격및면허', rowSpan: 2 }, '종 류', '취득년월일'],
    [null, '', '']
  ]);
  const m = M.guess(M.scan(xml), { fields: WHO });
  const 첫칸 = m.slots.filter(function (s) { return s.row === 1 && s.col === 0; })[0];
  assert.ok(첫칸, '자리를 못 잡았습니다');
  assert.equal(첫칸.guess, 'license',
    '★ 구역 이름을 못 봤습니다 — 자격증이 안 채워집니다(up=' + 첫칸.up + ')');
});

test('★ 슬롯이 «진짜 열 번호»를 들고 있다 — 이것이 없으면 위 두 잣대가 못 돈다', () => {
  const xml = tbl([['성 명', ''], ['생년월일', '']]);
  const m = M.scan(xml);
  m.slots.forEach(function (s) {
    assert.ok(typeof s.colAddr === 'number', s.id + ' 에 열 번호가 없습니다');
  });
});

/* ══════ 끝까지 — 서식을 훑는 길에서도 되나 ══════ */
test('★★★ 대괄호 라벨이 둘 이상인 칸을 «칸안라벨»로 본다 — 여기서 못 보면 채우기가 안 온다', () => {
  /* ⚠ 위의 검사들은 incellFill 을 «직접» 불렀다. 실제 앱은 먼저 classify 로 갈래를 정하고,
     「칸안라벨」이 아니면 그 칸에 채우기를 «시도조차» 하지 않는다. */
  assert.equal(M.classify('[한글]     [한자]     [영문]'), '칸안라벨');
  assert.equal(M.classify('[자택](  )  -[직장](  )  -'), '칸안라벨');
  /* ⚠ 하나뿐인 것은 옛 약속 그대로 */
  assert.notEqual(M.classify('[한자]'), '칸안라벨', '★ 하나뿐인 자리표를 칸안라벨로 봤습니다');
  assert.equal(M.classify('(한자)'), '안내글뒤', '★ 안내글뒤 약속이 깨졌습니다');

  /* 끝까지 — 훑고·짐작하고·채운다 */
  const xml = tbl([['성 명', '[한글]     [한자]     [영문]']]);
  const m = M.guess(M.scan(xml), { fields: WHO });
  const s2 = m.slots.filter(function (x) { return x.col === 1; })[0];
  assert.ok(s2, '자리를 못 잡았습니다');
  assert.equal(s2.kind, '칸안라벨', '갈래가 칸안라벨이 아닙니다: ' + s2.kind);
  assert.equal(s2.guess, '__incell', '채우기로 안 넘깁니다: ' + s2.guess);
  const picks = {}; m.slots.forEach(function (x) { if (x.guess) picks[x.id] = x.guess; });
  const r = M.apply(xml, { picks: picks, lists: {}, data: { fields: WHO } });
  ['권형하', '權炯河', 'KWEON HYEONGHA'].forEach(function (v) {
    assert.ok(r.xml.indexOf(v) >= 0, v + ' 이 안 들어갔습니다');
  });
});

test('★★★ 슬롯의 «열 번호»가 실제로 쓰인다 — 떨어진 넓은 칸에 숫자가 흩어지면 안 된다', () => {
  /* ⚠ 위의 「떨어져 있으면 숫자 칸이 아니다」는 «가짜 지도»로 봤다. 그래서 훑는 쪽에서
     열 번호를 안 달아 두어도 통과했다. 여기서는 진짜 서식을 훑어 확인한다.
     ⚠ 열 번호를 «벌린다» — 실제 기관 서식의 자격 표는 열 번호가 1·5·10·15 처럼
       떨어져 있다(칸이 넓어 그 안에 잔 열이 여럿 든다). hwpx_gen 은 colSpan 을
       colAddr 에 반영하지 않으므로, 지은 뒤 번호를 두 배로 벌려 그 모양을 만든다.
     ⚠ 값은 «숫자만»으로 둔다 — 그래야 다른 빗장(글자 섞임)에 가려지지 않고
       열 번호 잣대 «하나»를 본다. */
  const 벌리기 = function (x) {
    return x.replace(/colAddr="(\d+)"/g, function (m, n) {
      return 'colAddr="' + (Number(n) * 2) + '"';
    });
  };
  const xml = 벌리기(tbl([
    [{ t: '자격및면허', rowSpan: 2 }, '종 류', '취득년월일', '상벌사항', '상벌기관'],
    [null, '', '', '', '']
  ]));
  /* 서식이 정말 «떨어진» 열인지 먼저 본다 — 붙어 있으면 이 검사는 뜻이 없다 */
  const 열 = X.splitCells(X.splitRows(xml.match(/<hp:tbl[\s\S]*<\/hp:tbl>/)[0])[1]).map(X.colAddrOf);
  assert.equal(열.length, 4, '자료 줄이 네 칸이어야 합니다: ' + 열);
  assert.notEqual(열[1], 열[0] + 1, '열이 붙어 있으면 이 검사는 뜻이 없습니다: ' + 열);

  const m = M.guess(M.scan(xml), { fields: { license: '3016' } });
  const 첫칸 = m.slots.filter(function (s2) { return s2.row === 1 && s2.col === 0; })[0];
  assert.ok(첫칸, '자리를 못 잡았습니다');
  assert.ok(typeof 첫칸.colAddr === 'number' && 첫칸.colAddr >= 0,
    '★ 슬롯에 진짜 열 번호가 없습니다 — 숫자 칸 잣대가 못 돕니다');
  const r = M.apply(xml, { picks: { 't0r1c0': 'license' }, lists: {},
                           data: { fields: { license: '3016' } } });
  assert.ok(r.xml.indexOf('3016') >= 0, '자격번호가 안 들어갔습니다: ' + JSON.stringify(r.filled));
  assert.equal(r.xml.indexOf('>3<'), -1, '★ 한 글자씩 흩어져 들어갔습니다(3|0|1|6)');
});
