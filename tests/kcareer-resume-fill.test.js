'use strict';
/* 기관 이력서(2쪽)가 통째로 비던 것을 고친다 (대표 지시 2026-09-05)
   「지원서2 쪽도 자료가 들어가야하는데 모두 빠졌다 경력사항등도 모두 빠져있다」
   「날짜나 지원자 이름 도장도 자동으로 채워줘야하는데 안들어갔다」

   ■ 실측으로 잡은 까닭 넷 (2026-09-05, 화면과 같은 시험 서식으로)
     ① 표 «밖» 문단은 아예 안 봤다 — 날짜·지원자 줄이 한 글자도 안 바뀌었다
     ② 자리표([한글]·1900.00.00·년 월 ~ 년 월)를 «값»으로 보아 건너뛰었다(10칸)
     ③ 같은 항목을 문서에 «한 번만» 채웠다 — 1쪽에 들어가면 2쪽 이력서는 빈다
     ④ 「근무부서」·「직위」를 알아보는 열쇠가 없어 한 칸에만 들어갔다

   ■ 고치면서 «드러난» 결함 둘 (원래 있던 것)
     ⓐ 값이 옆 칸으로 밀려 들어갔다 — 빈 칸끼리 XML 이 똑같아 «맨 앞 빈 칸»이 바뀌었다
     ⓑ 글자가 있는 칸에 빈 칸용으로 넣어 「천안고등학교고등학교」가 됐다

   ⚠ 이 파일이 지키는 가장 중요한 것은 «안 덮는 것»이다. 자리표를 값으로 바꾸는 일은
     「글자가 있는 칸은 덮지 않는다」는 굳은 규칙에 구멍을 내는 일이다 —
     잘못 넓히면 대표가 손으로 적어 둔 값을 조용히 지운다. */

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const F = require(path.join(__dirname, '..', 'js', 'kcareer-hwpxfill.js'));

/* ── 시험 서식 만들기(대표 화면과 같은 모양) ── */
function t(x) { return x == null || x === '' ? '<hp:t/>' : '<hp:t>' + x + '</hp:t>'; }
function tc(x) { return '<hp:tc><hp:subList><hp:p><hp:run charPrIDRef="0">' + t(x) + '</hp:run></hp:p></hp:subList></hp:tc>'; }
function tr(cs) { return '<hp:tr>' + cs.map(tc).join('') + '</hp:tr>'; }
function tbl(rs) { return '<hp:tbl>' + rs.map(tr).join('') + '</hp:tbl>'; }
function para(x) { return '<hp:p><hp:run charPrIDRef="0">' + t(x) + '</hp:run></hp:p>'; }
function cells(xml, 표번호, 줄번호) {
  const T = (xml.match(/<hp:tbl>[\s\S]*?<\/hp:tbl>/g) || [])[표번호];
  return F.splitCells(F.splitRows(T)[줄번호]).map((c) => F.cellText(c));
}

const 나 = {
  name: '권형하', nameHanja: '權炯夏', nameEng: 'KWON HYUNG HA',
  birth: '1975.01.07', addr: '충남 천안시 용곡4길 20', phoneWork: '041-556-0035'
};

/* ═══ ① 표 밖 문단 ═══ */
test('① 날짜의 «빈 자리»를 오늘로 채운다', () => {
  const xml = para('2026년      월      일');
  const r = F.autoFill(xml, { fields: 나 }, { today: new Date(2026, 8, 6) });
  const txt = F.paraText(r.xml);
  assert.match(txt, /2026년\s*9월\s*6일/, '월·일이 안 들어갔다: ' + txt);
});

test('① 이미 적힌 날짜는 «손대지 않는다»', () => {
  const xml = para('2025년  3월  14일');
  const r = F.autoFill(xml, { fields: 나 }, { today: new Date(2026, 8, 6) });
  assert.match(F.paraText(r.xml), /2025년\s*3월\s*14일/,
    '사람이 일부러 적은 날짜를 오늘로 바꿔 버리면 서류가 조용히 틀린다');
});

test('① 「지원자 ○ ○ ○ (인)」 의 이름 자리를 채운다', () => {
  ['지원자   ○  ○  ○      (인)', '신청인                (인)',
    '작성자 :            (서명 또는 인)'].forEach((줄) => {
    const r = F.autoFill(para(줄), { fields: 나 }, {});
    assert.match(F.paraText(r.xml), /권형하/, '못 채웠다: ' + 줄);
  });
});

test('① 이름이 이미 적힌 서명 줄은 «손대지 않는다»', () => {
  const r = F.autoFill(para('지원자  홍길동  (인)'), { fields: 나 }, {});
  const txt = F.paraText(r.xml);
  assert.match(txt, /홍길동/, '적혀 있던 이름이 사라졌다');
  assert.ok(txt.indexOf('권형하') < 0, '남의 이름 위에 덮어썼다: ' + txt);
});

test('① 「(인)」 글자는 지우지 않는다 — 도장은 덮는 것이지 지우는 것이 아니다', () => {
  const r = F.autoFill(para('지원자   ○  ○  ○      (인)'), { fields: 나 }, {});
  assert.match(F.paraText(r.xml), /\(인\)/, '(인) 이 사라지면 도장 자리를 못 찾는다');
});

/* ═══ ② 자리표 ═══ */
test('② 자리표를 알아본다', () => {
  ['[한글]', '[한자]', '[영문]', '년  월 ~  년  월', '1900.00.00', '0000.00.00',
    '○ ○ ○', '(   )', '______', '(자택)(   )   -'].forEach((x) => {
    assert.ok(F.isPlaceholder(x), '자리표로 못 알아봤다: [' + x + ']');
  });
});

test('★★ ② 뜻이 있는 글자는 «자리표가 아니다» — 여기가 뚫리면 서류가 조용히 틀린다', () => {
  ['1975.01.07', '2026.09.06', '권형하', '푸른노무법인', '대표노무사',
    '충남 천안시 용곡4길 20', '041-556-0035', '고등학교 졸업', '법과대학 법학부',
    '해당없음', '-'].forEach((x) => {
    assert.ok(!F.isPlaceholder(x),
      '뜻이 있는 글자를 자리표로 봤다 — 이것을 덮으면 대표가 적어 둔 값이 사라진다: [' + x + ']');
  });
});

test('② 「[한자]」처럼 자리표가 스스로 칸 이름을 말하면 그 자리에 넣는다', () => {
  const xml = tbl([['성   명', '[한글]', '[한자]', '[영문]']]);
  const r = F.autoFill(xml, { fields: 나 }, {});
  const c = cells(r.xml, 0, 0);
  assert.deepEqual(c, ['성   명', '권형하', '權炯夏', 'KWON HYUNG HA'],
    '자리표가 이름을 말하는데 못 알아들었다: ' + JSON.stringify(c));
});

test('② 자리표를 «바꾼다» — 앞에 덧붙이지 않는다', () => {
  const xml = tbl([['생년월일', '1900.00.00']]);
  const r = F.autoFill(xml, { fields: 나 }, {});
  assert.deepEqual(cells(r.xml, 0, 0), ['생년월일', '1975.01.07'],
    '「1975.01.071900.00.00」처럼 덧붙으면 안 된다');
});

/* ═══ ③ 쪽마다 다시 채우기 ═══ */
test('③ 같은 항목을 «표마다» 채운다 — 1쪽에 들어갔다고 2쪽을 건너뛰지 않는다', () => {
  const xml = tbl([['성명', '']]) + tbl([['성   명', '[한글]']]);
  const r = F.autoFill(xml, { fields: 나 }, {});
  assert.equal(cells(r.xml, 0, 0)[1], '권형하', '1쪽이 안 찼다');
  assert.equal(cells(r.xml, 1, 0)[1], '권형하',
    '2쪽 이력서가 비었다 — 이것이 대표가 보신 증상이다');
});

test('③ «한 표 안»에서는 여전히 첫 자리에만 넣는다', () => {
  /* 「신청인 성명」과 「대리인 성명」에 같은 이름이 두 번 박히면 안 된다 */
  const xml = tbl([['성명', ''], ['성명', '']]);
  const r = F.autoFill(xml, { fields: 나 }, {});
  assert.equal(cells(r.xml, 0, 0)[1], '권형하');
  assert.equal(cells(r.xml, 0, 1)[1], '', '한 표 안에서 두 번 넣었다');
});

/* ═══ ④ 경력 표 ═══ */
test('④ 근무부서·직위·담당업무가 «제 칸»에 들어간다', () => {
  const xml = tbl([
    ['경력사항', '근무기간', '근 무 처', '근무부서', '직  위', '담당업무'],
    ['', '년  월 ~  년  월', '', '', '', ''],
  ]);
  const r = F.autoFill(xml, {
    fields: 나,
    career: [{ period: '2016.01 ~ 현재', org: '푸른노무법인', dept: '자문팀',
      title: '대표노무사', role: '노무자문' }]
  }, {});
  const c = cells(r.xml, 0, 1);
  assert.deepEqual(c, ['', '2016.01 ~ 현재', '푸른노무법인', '자문팀', '대표노무사', '노무자문'],
    '칸이 어긋났다: ' + JSON.stringify(c));
});

test('④ 「직위」 칸 하나뿐인 옛 서식도 그대로 채워진다', () => {
  const xml = tbl([['기간', '기관명', '직위'], ['', '', '']]);
  const r = F.autoFill(xml, {
    fields: 나, career: [{ period: '2016', org: '푸른노무법인', role: '자문위원' }]
  }, {});
  assert.deepEqual(cells(r.xml, 0, 1), ['2016', '푸른노무법인', '자문위원'],
    '담당업무만 있는 자료가 「직위」 칸에 못 들어가면 오늘까지 되던 것이 안 된다');
});

/* ═══ ⓐ 칸 밀림 ═══ */
test('★★ ⓐ 값이 «옆 칸»으로 밀려 들어가지 않는다', () => {
  /* 빈 칸끼리는 XML 이 글자 하나까지 똑같다. 자리를 세지 않으면 맨 앞 빈 칸이 바뀐다.
     실측(2026-09-06): 경력 표의 근무처가 세로 병합 라벨 자리(0번 칸)에 들어갔다. */
  const xml = tbl([['경력', '기간', '근무처', '직위'], ['', '', '', '']]);
  const r = F.autoFill(xml, {
    fields: 나, career: [{ period: '2016.01 ~ 현재', org: '푸른노무법인', title: '대표노무사' }]
  }, {});
  const c = cells(r.xml, 0, 1);
  assert.equal(c[0], '', '0번 칸(세로 병합 라벨 자리)에 값이 들어갔다: ' + JSON.stringify(c));
  assert.equal(c[1], '2016.01 ~ 현재');
  assert.equal(c[2], '푸른노무법인');
});

/* ═══ ⓑ 학력 급 ═══ */
test('ⓑ 「고등학교」 자리에는 고등학교를, 「대학교」 자리에는 대학교를 넣는다', () => {
  const xml = tbl([
    ['학력', '기   간', '학교명', '전   공'],
    ['', '년  월 ~  년  월', '고등학교', ''],
    ['', '년  월 ~  년  월', '대학교', ''],
    ['', '년  월 ~  년  월', '대학원', ''],
  ]);
  const r = F.autoFill(xml, {
    fields: 나,
    edu: [{ period: '1999.03 ~ 2003.02', school: '영남대학교', major: '법과대학' },
      { period: '1996.03 ~ 1999.02', school: '천안고등학교', major: '인문계' }]
  }, {});
  assert.equal(cells(r.xml, 0, 1)[2], '천안고등학교',
    '고등학교 줄에 고등학교가 안 들어갔다 (순서로 밀어 넣으면 대학교가 온다)');
  assert.equal(cells(r.xml, 0, 2)[2], '영남대학교', '대학교 줄이 틀렸다');
  assert.equal(cells(r.xml, 0, 3)[2], '대학원',
    '맞는 학교가 없으면 그 줄은 «그대로 둔다» — 아무거나 넣으면 안 된다');
});

test('ⓑ 급 자리표를 «바꾼다» — 「천안고등학교고등학교」가 되면 안 된다', () => {
  const xml = tbl([['학력', '기간', '학교명'], ['', '', '고등학교']]);
  const r = F.autoFill(xml, {
    fields: 나, edu: [{ period: '1996', school: '천안고등학교' }]
  }, {});
  assert.equal(cells(r.xml, 0, 1)[2], '천안고등학교',
    '빈 칸용으로 넣으면 앞에 덧붙는다');
});

/* ═══ 보고 ═══ */
test('자리표를 값으로 바꾼 «곳 수»를 보고에 적는다', () => {
  const xml = tbl([['성   명', '[한글]', '[한자]']]);
  const r = F.autoFill(xml, { fields: 나 }, {});
  assert.ok((r.report.placeholders || 0) >= 2,
    '덮어쓴 자리는 사람에게 알려야 한다 — 몇 곳을 바꿨는지 세어 둔다');
});
