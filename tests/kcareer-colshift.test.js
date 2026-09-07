'use strict';
/* 세로로 합친 이름 칸이 있는 서식 — 열이 한 칸씩 밀리던 것 (대표 제보 2026-09-07)
   ─────────────────────────────────────────────────────────────
   대표 화면(지방공기업평가원 위촉직이사 지원서 2쪽)에서 이렇게 나왔다:

       자격 및 면허
         종 류              취득년월일     상벌사항      상벌기관
         공인노무사 제3016호   1999 ~ 2003   영남대학교   법과대학 법학부 …
         ----               1999 ~ 2003   영남대학교   법과대학 법학부 …

   ★ 학력이 «자격 및 면허 표»에 박혔다. 안 채워진 것이 아니라 «틀리게» 채워졌다.
     모르고 내면 틀린 서류가 기관에 간다 — 안 채우는 것보다 나쁘다.

   ■ 까닭 (실측: 그 서식을 열어 fillList 안에 기록을 심어 확인)
     기관 서식은 표 맨 앞에 「학력사항」·「경력사항」처럼 «세로로 합친» 이름 칸을 둔다.
     그 칸은 머리줄에만 있고 자료 줄에는 없다 — 머리줄 6칸, 자료 줄 5칸.
     열 이름을 «칸 순서»로 세면 자료 줄이 한 칸씩 밀린다. 그래서
       ① 기간이 학교명 칸으로, 학교명이 전공 칸으로 들어가고
       ② 「고등학교」가 적힌 줄은 급 판정이 어긋나 「빈 줄이 아니다」라며 건너뛰고
       ③ 아래로 계속 흘러 남의 표(자격 및 면허)의 빈 줄이 학력 자리로 쓰였다
     경력은 첫 자료 줄(「년 월 ~ 년 월」 하나만 박힌 줄)을 «소제목»으로 오인해
     그 자리에서 멈춰 한 줄도 안 들어갔다.

   ■ 고침 — 한글 파일은 칸마다 «열 번호»(hp:cellAddr colAddr)를 적어 둔다. 그것을 읽는다.
     ⚠ 열 번호가 없는 서식에서는 지금까지처럼 칸 순서로 간다(뒷걸음질 금지).

   여기서 못 박는 것:
     ① 세로 합친 칸이 있어도 «제 칸»에 들어간다
     ② ★ 넘치는 자료가 «남의 표»로 새지 않는다
     ③ 자리표만 박힌 줄은 소제목이 아니라 «채울 자리»다
     ④ 진짜 소제목은 그대로 경계다
     ⑤ 열 번호가 없는 서식은 옛길 그대로 */
const test = require('node:test');
const assert = require('node:assert/strict');
const X = require('../js/kcareer-hwpxfill.js');
const H = require('../hwpx_gen.js');

function tbl(rows) {
  var n = 0;
  rows.forEach(function (r) { if (r.length > n) n = r.length; });
  return H.tablePara(rows, H.cols(rows[0].map(function () { return 1 / n; })));
}
/* 서식을 읽어 「줄마다 [열번호]글자」로 되돌린다 — 눈으로 보는 것과 같은 것을 본다 */
function 읽기(xml) {
  var out = [];
  X.eachTable(xml, function (t) {
    X.splitRows(t).forEach(function (tr) {
      out.push(X.splitCells(tr).map(function (c) {
        return { col: X.colAddrOf(c), t: X.cellText(c).replace(/\s+/g, ' ').trim() };
      }));
    });
    return t;
  });
  return out;
}
function 칸(줄, col) {
  for (var i = 0; i < 줄.length; i++) if (줄[i].col === col) return 줄[i].t;
  return '(그 열 없음)';
}

/* 대표 서식과 «같은 모양» — 머리줄에만 세로 합친 이름 칸이 있다 */
function 학력경력서식() {
  return tbl([
    [{ t: '학력사항', rowSpan: 3 }, '기 간', '학 교 명', '전 공', '학 위'],
    [null, '년   월 ~   년   월', '고등학교', '-', '-'],
    [null, '년   월 ~   년   월', '대학교', '', ''],
    [{ t: '자격및면허', rowSpan: 3 }, '종 류', '취득년월일', '상벌사항', '상벌기관'],
    [null, '', '', '', ''],
    [null, '', '', '', ''],
    [{ t: '경력사항', rowSpan: 3 }, '근무기간', '근 무 처', '직 위', '담당업무'],
    [null, '년   월 ~   년   월', '', '', ''],
    [null, '년   월 ~   년   월', '', '', '']
  ]);
}
const 자료 = {
  fields: {},
  edu: [{ period: '1991.03~1994.02', school: '천안A고등학교', major: '인문Z', degree: '졸업Z' },
        { period: '1994.03~1998.02', school: '영남B대학교', major: '법학Z', degree: '학사Z' }],
  career: [{ period: '2020.01~현재', org: '경력1법인', title: '직위1Z', role: '업무1Z' },
           { period: '2018.01~2019.12', org: '경력2법인', title: '직위2Z', role: '업무2Z' }],
  secrets: {}
};

test('★ 서식을 지은 것이 정말 «머리줄 5칸 · 자료 줄 4칸»인가 — 이것이 아니면 검사가 헛것이다', () => {
  const 줄 = 읽기(학력경력서식());
  assert.equal(줄[0].length, 5, '머리줄이 5칸이어야 합니다: ' + JSON.stringify(줄[0]));
  assert.equal(줄[1].length, 4, '자료 줄이 4칸이어야 합니다(세로 합친 칸이 없으니까)');
  assert.ok(줄[0][0].col >= 0, '열 번호가 없습니다 — 이 서식으로는 밀림을 못 봅니다');
  assert.equal(줄[0][1].col, 줄[1][0].col, '머리줄의 「기 간」과 자료 줄 첫 칸의 열 번호가 같아야 합니다');
});

test('★★★ 세로 합친 칸이 있어도 «제 칸»에 들어간다 — 밀리면 기간이 학교명 칸으로 간다', () => {
  const r = X.autoFill(학력경력서식(), 자료);
  const 줄 = 읽기(r.xml), h = 줄[0];
  const 기간열 = h[1].col, 학교열 = h[2].col, 전공열 = h[3].col, 학위열 = h[4].col;
  assert.equal(칸(줄[1], 기간열), '1991.03~1994.02', '기간이 제 칸에 없습니다');
  assert.equal(칸(줄[1], 학교열), '천안A고등학교', '학교명이 제 칸에 없습니다');
  assert.equal(칸(줄[1], 전공열), '인문Z', '전공이 제 칸에 없습니다');
  assert.equal(칸(줄[1], 학위열), '졸업Z', '★ 학위가 안 들어갔습니다 — 열이 밀리면 여기가 빕니다');
});

test('★★ 「고등학교」 줄에는 고등학교를, 「대학교」 줄에는 대학교를 — 급을 맞춘다', () => {
  const r = X.autoFill(학력경력서식(), 자료);
  const 줄 = 읽기(r.xml), 학교열 = 줄[0][2].col;
  assert.equal(칸(줄[1], 학교열), '천안A고등학교', '고등학교 줄에 다른 학교가 들어갔습니다');
  assert.equal(칸(줄[2], 학교열), '영남B대학교', '대학교 줄에 다른 학교가 들어갔습니다');
});

test('★★★ 넘치는 자료가 «남의 표»로 새지 않는다 — 이것이 「틀린 서류」를 막는 자리다', () => {
  /* ⚠ 반드시 «넘치게» 준다. 서식 줄이 2개인데 자료를 5개 준다.
     넘치지 않으면 새는지 안 새는지 알 수 없다(옛 코드도 통과해 버린다). */
  const 넘침 = {
    fields: {}, secrets: {},
    edu: [1, 2, 3, 4, 5].map(function (i) {
      return { period: '200' + i + '.03~200' + i + '.02', school: '학교' + i + 'Z',
               major: '전공' + i + 'Z', degree: '학위' + i + 'Z' };
    }),
    career: [1, 2, 3, 4, 5].map(function (i) {
      return { period: '201' + i + '.01~201' + i + '.12', org: '기관' + i + 'Z',
               title: '직위' + i + 'Z', role: '업무' + i + 'Z' };
    })
  };
  const r = X.autoFill(학력경력서식(), 넘침);
  const 줄 = 읽기(r.xml);
  /* 자격및면허 구역 = 줄3(머리줄)·줄4·줄5 */
  const 자격구역 = [줄[3], 줄[4], 줄[5]].map(function (rw) {
    return rw.map(function (c) { return c.t; }).join(' ');
  }).join(' | ');
  ['학교', '전공', '학위', '기관', '직위', '업무'].forEach(function (w) {
    assert.equal(자격구역.indexOf(w + '1Z'), -1,
      '★ 자격 및 면허 표에 「' + w + '1Z」가 들어갔습니다 — 틀린 서류가 나갑니다: ' + 자격구역);
    assert.equal(자격구역.indexOf(w + '5Z'), -1,
      '★ 자격 및 면허 표에 「' + w + '5Z」가 들어갔습니다: ' + 자격구역);
  });
  /* 자격 구역의 빈 줄은 «그대로 비어» 있어야 한다 */
  assert.equal(줄[4].map(function (c) { return c.t; }).join(''), '', '자격 표 빈 줄이 채워졌습니다');
  assert.equal(줄[5].map(function (c) { return c.t; }).join(''), '', '자격 표 빈 줄이 채워졌습니다');
});

test('★★★ 경력이 «한 줄도» 안 들어가던 것 — 자리표 줄을 소제목으로 오인했다', () => {
  const r = X.autoFill(학력경력서식(), 자료);
  const 줄 = 읽기(r.xml), h = 줄[6];
  const 기간열 = h[1].col, 기관열 = h[2].col, 직위열 = h[3].col, 업무열 = h[4].col;
  assert.equal(칸(줄[7], 기간열), '2020.01~현재', '★ 경력이 한 줄도 안 들어갔습니다');
  assert.equal(칸(줄[7], 기관열), '경력1법인', '근무처가 제 칸에 없습니다');
  assert.equal(칸(줄[7], 직위열), '직위1Z', '직위가 제 칸에 없습니다');
  assert.equal(칸(줄[7], 업무열), '업무1Z', '담당업무가 제 칸에 없습니다');
  assert.equal(칸(줄[8], 기관열), '경력2법인', '둘째 줄이 안 들어갔습니다');
  const 보고 = r.report.lists.filter(function (l) { return l.kind === 'career'; })[0];
  assert.ok(보고 && 보고.put === 2, '보고가 「2줄」이어야 합니다: ' + JSON.stringify(보고));
});

test('★★ 자리표만 박힌 줄은 «경계가 아니다» — 그러나 진짜 소제목은 그대로 경계다', () => {
  /* 자리표 줄 */
  const 자리표줄 = X.splitCells(X.splitRows(tbl([['가', '나', '다'],
    ['년   월 ~   년   월', '', '']]))[1]);
  assert.equal(X.isRowBlank('년   월 ~   년   월'), true, '자리표를 빈 것으로 안 봅니다');
  /* 진짜 소제목 — 첫 칸에만 «뜻 있는» 글자가 있다. 넘어가면 남의 표에 박힌다. */
  assert.equal(X.isRowBlank('5. 관련 분야 자격증 보유 사항'), false,
    '★ 소제목을 빈 줄로 보면 그 아래 남의 표에 박힙니다');
  assert.ok(자리표줄.length === 3);
});

test('★ 열 번호가 «없는» 서식은 옛길 그대로 — 오늘 되는 것이 뒷걸음질하면 안 된다', () => {
  /* 다른 프로그램이 만든 hwpx 에는 hp:cellAddr 가 없을 수 있다 */
  const 없앤것 = 학력경력서식().replace(/<hp:cellAddr[^>]*\/>/g, '');
  assert.equal(X.colAddrOf('<hp:tc><hp:t>가</hp:t></hp:tc>'), -1, '없는데 있다고 합니다');
  assert.equal(X.rowShape(['<hp:tc></hp:tc>']), '', '열 번호가 없으면 모양 잣대를 쓰지 않습니다');
  /* 터지지 않고, 옛길(칸 순서)로 무언가는 채운다 */
  const r = X.autoFill(없앤것, 자료);
  assert.ok(r && typeof r.xml === 'string' && r.xml.length > 0, '열 번호가 없으면 터집니다');
});

test('★ 열 번호 읽기 — 이름표 순서가 뒤바뀌어도 읽는다(서식마다 다르다)', () => {
  assert.equal(X.colAddrOf('<hp:tc><hp:cellAddr colAddr="7" rowAddr="2"/></hp:tc>'), 7);
  assert.equal(X.colAddrOf('<hp:tc><hp:cellAddr rowAddr="2" colAddr="7"/></hp:tc>'), 7,
    '이름표 순서가 뒤바뀌면 못 읽습니다');
  assert.equal(X.colAddrOf('<hp:tc></hp:tc>'), -1);
});

test('★ 모양이 바뀌면 구역이 끝난다 — 「안 채우는」 쪽으로 멈춘다', () => {
  /* 칸 수가 같아도 «첫 열 번호»가 다르면 남의 줄이다 */
  const a = ['<hp:tc><hp:cellAddr colAddr="1" rowAddr="1"/></hp:tc>', '<hp:tc></hp:tc>'];
  const b = ['<hp:tc><hp:cellAddr colAddr="0" rowAddr="2"/></hp:tc>', '<hp:tc></hp:tc>'];
  assert.equal(X.rowShape(a), '2:1');
  assert.equal(X.rowShape(b), '2:0');
  assert.notEqual(X.rowShape(a), X.rowShape(b), '모양이 같다고 보면 남의 줄까지 채웁니다');
});
