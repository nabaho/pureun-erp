'use strict';
/* 「칸 지도」 길도 자리표를 알아본다 (대표 제보 2026-09-06 「이부분은 왜 안채워지나」)

   ■ 왜 아직 안 채워졌나 — 채우는 길이 «둘»인데 한 길만 고쳤다
     ① 사전 채우기(kcareer-hwpxfill.autoFill) — 9/6 오전에 자리표를 알아보게 고쳤다
     ② 칸 지도(kcareer-formmap)            — 대표가 쓰시는 길인데 그대로였다
   ②는 [한글]·1900.00.00·「년 월 ~ 년 월」을 «글자가 든 칸»으로 보아
     · 낱개 칸이면 「글자칸」으로 잡아 사람이 손으로 칠 때만 바뀌게 두었고
     · 목록 표에서는 「빈 줄이 0」이라 학력·경력을 한 줄도 안 채웠다.

   ■ 함께 드러난 결함 — 값이 «옆 칸»으로 밀려 들어갔다
     eachCellAt 이 rows[row].replace(cells[col], …) 로 칸을 «글자로» 찾아 바꿨다.
     빈 칸끼리는 XML 이 글자 하나까지 똑같아 맨 앞의 빈 칸이 바뀐다 —
     실측: 주소·전화가 세로 병합 라벨 자리(0번 칸)에 들어갔다.

   ⚠ 이 검사가 지키는 가장 중요한 것은 «두 길이 같은 자를 쓰는 것»이다.
     자리표 판정을 두 곳에 따로 쓰면 「저기선 채워지는데 여기선 안 채워진다」가 된다. */

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const M = require(path.join(__dirname, '..', 'js', 'kcareer-formmap.js'));
const X = require(path.join(__dirname, '..', 'js', 'kcareer-hwpxfill.js'));

const t = (x) => (x ? '<hp:t>' + x + '</hp:t>' : '<hp:t/>');
const tc = (x) => '<hp:tc><hp:subList><hp:p><hp:run charPrIDRef="0">' + t(x) + '</hp:run></hp:p></hp:subList></hp:tc>';
const tr = (cs) => '<hp:tr>' + cs.map(tc).join('') + '</hp:tr>';
const tbl = (rs) => '<hp:tbl>' + rs.map(tr).join('') + '</hp:tbl>';
function 칸(xml, 표, 줄) {
  const T = (xml.match(/<hp:tbl>[\s\S]*?<\/hp:tbl>/g) || [])[표];
  return X.splitCells(X.splitRows(T)[줄]).map((c) => X.cellText(c));
}
/* 화면이 하는 그대로 — 훑고, 짐작하고, 넣는다 */
function 채우기(xml, data) {
  const map = M.guess(M.scan(xml), data);
  const picks = {}, lists = {};
  map.slots.forEach((s) => { if (s.guess) picks[s.id] = s.guess; });
  map.lists.forEach((l) => { lists[l.id] = l.guess || l.kind; });
  return { map: map, r: M.apply(xml, { picks: picks, lists: lists, data: data }) };
}

const 나 = {
  fields: { name: '권형하', nameHanja: '權炯夏', nameEng: 'KWON HYUNG HA',
    birth: '1975.01.07', addr: '충남 천안시 용곡4길 20', phone: '010-1200-0003' },
  edu: [{ period: '1996.03 ~ 1999.02', school: '천안고등학교', major: '인문계', degree: '졸업' },
    { period: '1999.03 ~ 2003.02', school: '영남대학교', major: '법과대학 법학부', degree: '학사' }],
  career: [{ period: '2016.01 ~ 현재', org: '푸른노무법인', title: '대표노무사', role: '노무자문' }]
};

test('★★ 두 길이 «같은 자»로 자리표를 본다', () => {
  /* 따로 쓰면 「저기선 채워지는데 여기선 안 채워진다」가 된다 */
  assert.equal(typeof X.isPlaceholder, 'function', '판독 층에 자리표 자가 없다');
  const src = require('fs').readFileSync(
    path.join(__dirname, '..', 'js', 'kcareer-formmap.js'), 'utf8');
  assert.match(src, /X\.isPlaceholder/,
    '칸 지도가 판독 층의 자리표 자를 안 쓴다 — 여기서 새로 쓰면 두 길이 어긋난다');
});

test('자리표가 든 칸을 «채울 자리»로 잡는다', () => {
  const xml = tbl([['성   명', '[한글]'], ['생년월일', '1900.00.00']]);
  const map = M.scan(xml);
  const 잡힌 = map.slots.filter((s) => s.kind === '빈칸').map((s) => s.text);
  assert.ok(잡힌.indexOf('[한글]') >= 0, '[한글] 을 채울 자리로 안 잡았다');
  assert.ok(잡힌.indexOf('1900.00.00') >= 0, '1900.00.00 을 채울 자리로 안 잡았다');
});

test('⚠ 「(한자)」·「(인)」은 여전히 «안내글뒤»다 — 지우지 않는다', () => {
  /* 이 규칙이 이 모듈의 오래된 약속이다. 자리표 판정이 먼저 삼키면 안내글이 사라진다. */
  const map = M.scan(tbl([['성   명', '(한글)', '(한자)'], ['지원자', '(인)']]));
  const 종류 = {};
  map.slots.forEach((s) => { 종류[s.text] = s.kind; });
  assert.equal(종류['(한자)'], '안내글뒤', '(한자) 가 안내글뒤가 아니다');
  assert.equal(종류['(인)'], '안내글뒤', '(인) 이 안내글뒤가 아니다');
});

test('자리표를 «지우고» 넣는다 — 앞에 덧붙지 않는다', () => {
  const xml = tbl([['성   명', '[한글]']]);
  const { r } = 채우기(xml, 나);
  assert.equal(칸(r.xml, 0, 0)[1], '권형하',
    '「권형하[한글]」처럼 덧붙으면 안 된다');
});

test('자리표가 스스로 이름을 말하면 그 자리에 넣는다 — [한자]·[영문]', () => {
  const xml = tbl([['성   명', '[한글]', '[한자]', '[영문]']]);
  const { r } = 채우기(xml, 나);
  assert.deepEqual(칸(r.xml, 0, 0), ['성   명', '권형하', '權炯夏', 'KWON HYUNG HA'],
    '왼쪽 칸만 보면 「[한자]의 왼쪽은 [한글]」이라 아무것도 못 알아본다');
});

test('★★ 값이 «옆 칸»으로 밀려 들어가지 않는다', () => {
  /* 빈 칸끼리는 XML 이 똑같다 — 자리를 세지 않으면 맨 앞 빈 칸이 바뀐다.
     실측 2026-09-06: 주소·전화가 세로 병합 라벨 자리(0번 칸)에 들어갔다. */
  /* ⚠★ 시험 서식이 중요하다 — 목표 칸이 «그 줄의 첫 빈 칸»이면 글자로 찾아도 우연히 맞는다.
     실제 이력서처럼 «앞에 빈 칸이 먼저 오는» 줄이라야 밀림이 드러난다:
         (세로 병합 자리) | (세로 병합 자리) | 주   소 | ←여기
     실측 2026-09-06: 주소가 0번 칸에 들어갔다. */
  const xml = tbl([
    ['사진부착', '인적사항', '성   명', '[한글]'],
    ['', '', '주   소', ''],
    ['', '', '전   화', '']
  ]);
  const { r } = 채우기(xml, 나);
  const 줄1 = 칸(r.xml, 0, 1);
  assert.equal(줄1[0], '', '0번 칸(세로 병합 라벨 자리)에 값이 들어갔다: ' + JSON.stringify(줄1));
  assert.equal(줄1[1], '', '1번 칸에 값이 들어갔다: ' + JSON.stringify(줄1));
  assert.equal(줄1[3], '충남 천안시 용곡4길 20', '주소가 제자리에 없다: ' + JSON.stringify(줄1));
  /* 첫 줄도 그대로여야 한다 — 밀리면 여기부터 어그러진다 */
  assert.equal(칸(r.xml, 0, 0)[0], '사진부착', '다른 줄이 바뀌었다');
});

test('학력·경력 표의 «자리표만 박힌 줄»을 빈 줄로 센다', () => {
  const xml = tbl([
    ['학력', '기   간', '학교명', '전   공'],
    ['', '년  월 ~  년  월', '고등학교', ''],
    ['', '년  월 ~  년  월', '대학교', '']
  ]);
  const map = M.scan(xml);
  assert.equal(map.lists.length, 1, '학력 표를 목록으로 못 알아봤다');
  assert.ok(map.lists[0].blank >= 2,
    '빈 줄이 ' + map.lists[0].blank + ' 이다 — 「년 월 ~ 년 월」을 값으로 보면 0 이 되고,\n' +
    '    그러면 학력·경력이 한 줄도 안 들어간다');
});

test('학력·경력이 실제로 들어간다 — 급을 맞춰서', () => {
  const xml = tbl([
    ['학력', '기   간', '학교명', '전   공'],
    ['', '년  월 ~  년  월', '고등학교', ''],
    ['', '년  월 ~  년  월', '대학교', '']
  ]);
  const { r } = 채우기(xml, 나);
  assert.equal(칸(r.xml, 0, 1)[2], '천안고등학교', '고등학교 줄이 틀렸다');
  assert.equal(칸(r.xml, 0, 2)[2], '영남대학교', '대학교 줄이 틀렸다');
});
