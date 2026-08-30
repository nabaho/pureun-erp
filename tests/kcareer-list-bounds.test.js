/* 목록 표 채우기가 «남의 영역»을 침범하던 것 (대표 제보 2026-08-29)
   ─────────────────────────────────────────────────────────────
   큰 표 하나 안에 「3. 최종학력」「4. 경력사항」「5. 자격증」이 소제목으로 이어져 있는 서식에서,
   경력 목록이 «표 끝까지» 죽 채워져 자격증 표에 경력이 박혔다. 잘못 낸 서류가 된다.

   까닭: 빈 행이 아니면 `continue` 로 «건너뛰고 계속» 내려갔다.
        소제목 행이나 다음 머리행을 만나면 «멈춰야» 한다 — 거기부터는 남의 자리다. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../js/kcareer-hwpxfill.js');
const H = require('../hwpx_gen.js');

const tbl = (rows) => H.tablePara(rows, H.cols(rows[0].map(() => 1 / rows[0].length)));
const texts = (xml) => (xml.match(/<hp:t[^>]*>([\s\S]*?)<\/hp:t>/g) || [])
  .map((x) => x.replace(/<[^>]*>/g, ''));

const CAREER = [
  { period: '2026', org: '한국공인노무사회', role: '사업이사' },
  { period: '2025', org: '충청남도', role: '노동권익보호관' },
  { period: '2024', org: '대산지방해양수산청', role: '인사위원' }
];

test('★ 다음 머리행을 만나면 «멈춘다» — 남의 표에 경력이 박히면 안 된다', () => {
  const rows = [
    ['기간', '기관명', '직위'],
    ['', '', ''],                       /* 경력 자리 하나 */
    ['자격증명', '취득년도', '발급기관'],  /* ← 여기부터 남의 자리 */
    ['', '', ''],
    ['', '', '']
  ];
  const r = F.autoFill(tbl(rows), { fields: {}, career: CAREER });
  const t = texts(r.xml);
  /* 경력 자리(2행)에는 들어가고 */
  assert.ok(t.slice(3, 6).join('').indexOf('한국공인노무사회') >= 0, '경력 자리는 채워야 합니다');
  /* 자격증 아래(4·5행)에는 하나도 안 들어가야 한다 */
  const below = t.slice(9).join(' ');
  assert.equal(below.indexOf('충청남도'), -1, '자격증 표에 경력이 박혔습니다');
  assert.equal(below.indexOf('대산지방해양수산청'), -1, '자격증 표에 경력이 박혔습니다');
});

test('★ 소제목 행(한 칸만 글자)을 만나도 멈춘다 — 거기부터 다른 이야기다', () => {
  const rows = [
    ['기간', '기관명', '직위'],
    ['', '', ''],
    ['5. 관련 분야 자격증 보유 사항', '', ''],   /* 소제목 */
    ['', '', ''],
    ['', '', '']
  ];
  const r = F.autoFill(tbl(rows), { fields: {}, career: CAREER });
  const below = texts(r.xml).slice(9).join(' ');
  assert.equal(below.indexOf('충청남도'), -1, '소제목 아래로 넘어가면 안 됩니다');
});

test('빈 행이 이어지는 «자기 영역»은 그대로 다 채운다 — 지나치게 막지 않는다', () => {
  const rows = [['기간', '기관명', '직위'], ['', '', ''], ['', '', ''], ['', '', '']];
  const r = F.autoFill(tbl(rows), { fields: {}, career: CAREER });
  const all = texts(r.xml).join(' ');
  CAREER.forEach((c) => assert.ok(all.indexOf(c.org) >= 0, c.org + ' 이(가) 들어가야 합니다'));
});

test('몇 줄을 넣고 어디서 멈췄는지 보고한다 — 조용히 자르면 「왜 3줄만」이 된다', () => {
  const rows = [['기간', '기관명', '직위'], ['', '', ''], ['자격증명', '취득년도', '발급기관'], ['', '', '']];
  const r = F.autoFill(tbl(rows), { fields: {}, career: CAREER });
  const l = (r.report.lists || [])[0];
  assert.ok(l, '목록 표로 보고해야 합니다');
  assert.equal(l.put, 1);
  assert.equal(l.total, 3);
});

test('★ 같은 열쇠가 두 열에 잡히면 «첫 열에만» 넣는다 — 값이 두 번 나오면 안 된다', () => {
  /* 「학과명」과 「학 위」가 둘 다 major 로 잡혀 「인문계」가 두 칸에 들어갔다.
     「담당업무(구체적)」와 「직 위」도 둘 다 role 이라 같은 일이 났다. */
  const rows = [['기 간', '학교명', '학과명', '학 위', '비 고'], ['', '', '', '', '']];
  const r = F.autoFill(tbl(rows), {
    fields: {}, edu: [{ period: '1991', school: '심인고등학교', major: '인문계' }]
  });
  const row2 = texts(r.xml).slice(5, 10);
  assert.equal(row2.filter((x) => x === '인문계').length, 1,
    '같은 값이 두 칸에 들어갔습니다: ' + JSON.stringify(row2));
});

test('구역이 여럿이어도 각각 «자기 것»을 채운다 — 하나만 보고 멈추면 안 된다', () => {
  const rows = [
    ['기 간', '학교명', '학 위'], ['', '', ''],
    ['기간(근무년수)', '직장명', '직 위'], ['', '', '']
  ];
  const r = F.autoFill(tbl(rows), {
    fields: {}, edu: [{ period: '1991', school: '심인고', major: '인문계' }],
    career: [{ period: '2026', org: '한국공인노무사회', role: '사업이사' }]
  });
  const all = texts(r.xml).join(' ');
  assert.ok(all.indexOf('심인고') >= 0, '학력 구역이 채워져야 합니다');
  assert.ok(all.indexOf('한국공인노무사회') >= 0, '경력 구역도 채워져야 합니다');
  assert.equal((r.report.lists || []).length, 2, '구역마다 보고해야 합니다');
});
