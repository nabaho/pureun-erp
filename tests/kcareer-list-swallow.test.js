/* 목록은 «구역»이지 «표»가 아니다 — 대표 제보 2026-09-06
   ─────────────────────────────────────────────────────────────
   「여전히 다른쪽 페이지는 안채워진다」

   기관 이력서 2쪽은 인적사항·학력·자격·경력이 «한 표» 안에 죽 이어져 있다.
   칸 지도(scan)는 그 표에서 학력 머리줄을 하나 찾고는 «표를 통째로» 목록으로 보아
   낱개 칸을 하나도 세지 않았다 — 성명·생년월일·주소가 아예 안 잡혔다.
   실측 2026-09-06: 채울 자리 «0개». 화면에는 「채울 곳 2군데」만 떴다.
   덤으로 빈 줄을 «표 끝까지» 세어 학력 4줄이 「빈 10줄」로 부풀었고,
   그 아래 자격·상벌 칸은 사람이 손으로 칠 자리조차 없었다.

   여기서 못 박는 것은 «값»이 아니라 «규칙»이다:
     ① 표를 하나로 묶든 둘로 나누든 채울 자리 수가 같다
     ② 목록 구역은 머리줄 + 이어지는 빈 줄까지다 — 표 끝까지가 아니다
     ③ 구역 밖 칸은 여전히 자리로 잡힌다(사람이 손으로 칠 수 있어야 한다) */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../js/kcareer-formmap.js');
const H = require('../hwpx_gen.js');

const tbl = (rows) => H.tablePara(rows, H.cols(rows[0].map(() => 1 / rows[0].length)));

const 인적 = [['성  명', '(한글)', '(한자)'],
              ['생년월일', '', ''],
              ['주  소', '', '']];
const 학력 = [['기 간', '학교명', '학 위'],
              ['', '', ''],
              ['', '', '']];

test('★ 표를 하나로 묶어도 낱개 자리가 그대로 잡힌다 — 예전엔 통째로 사라졌다', () => {
  const 나눔 = M.scan(tbl(인적) + tbl(학력));
  const 한덩이 = M.scan(tbl(인적.concat(학력)));
  assert.ok(나눔.slots.length > 0, '나눠 둔 서식에서는 원래 잡혔다(전제)');
  assert.equal(한덩이.slots.length, 나눔.slots.length,
    '표를 묶었다고 자리가 달라지면 안 됩니다 — 묶음 ' + 한덩이.slots.length
    + '개 / 나눔 ' + 나눔.slots.length + '개');
});

test('★ 묶인 표에서도 인적사항이 실제로 채워진다 — 「채웠다는데 비어 있다」를 막는다', () => {
  const xml = tbl(인적.concat(학력));
  const g = M.guess(M.scan(xml), {});
  const picks = {};
  g.slots.forEach((s) => { if (s.guess) picks[s.id] = s.guess; });
  const data = { fields: { name: '홍길동', birth: '1975.01.07', addr: '충남 천안시' },
                 edu: [{ period: '1991~1994', school: '심인고등학교', degree: '졸업' }] };
  const r = M.apply(xml, { picks: picks, lists: { L0: 'edu' }, data: data });
  const 다 = (r.xml.match(/<hp:t[^>]*>([\s\S]*?)<\/hp:t>/g) || [])
    .map((x) => x.replace(/<[^>]*>/g, '')).join(' ');
  assert.ok(다.indexOf('홍길동') >= 0, '성명이 안 들어갔습니다');
  assert.ok(다.indexOf('1975.01.07') >= 0, '생년월일이 안 들어갔습니다');
  assert.ok(다.indexOf('충남 천안시') >= 0, '주소가 안 들어갔습니다');
  assert.ok(다.indexOf('심인고등학교') >= 0, '학력 목록도 함께 들어가야 합니다');
});

test('★ 목록 구역은 «이어지는 빈 줄»까지다 — 표 끝까지 세면 「빈 10줄」이 된다', () => {
  const 자격 = [['자격증명', '취득년도', '발급기관'], ['', '', ''], ['', '', '']];
  const m = M.scan(tbl(학력.concat(자격)));
  const L = m.lists[0];
  assert.ok(L, '학력 머리줄은 목록으로 잡혀야 합니다');
  const 실제빈줄 = 학력.length - 1;                       /* 머리줄 뺀 나머지 */
  assert.equal(L.blank, 실제빈줄,
    '학력 빈 줄이 부풀었습니다 — ' + L.blank + '줄로 셌지만 실제는 ' + 실제빈줄 + '줄');
  assert.ok(L.end <= 학력.length, '구역이 자격 표까지 넘어갔습니다');
});

test('★ 목록 아래 «남의 칸»도 자리로 잡힌다 — 사람이 손으로 칠 수 있어야 한다', () => {
  const 자격 = [['자격증명', '취득년도', '발급기관'], ['', '', ''], ['', '', '']];
  const m = M.scan(tbl(학력.concat(자격)));
  const 아래 = m.slots.filter((s) => s.row >= 학력.length);
  assert.ok(아래.length > 0, '자격 표 빈 칸이 하나도 안 잡혔습니다');
});

test('한 표에 목록 구역이 둘이면 «둘 다» 알아본다 — 하나만 보고 멈추면 안 된다', () => {
  const 경력 = [['기간', '기관명', '직 위'], ['', '', '']];
  const m = M.scan(tbl(학력.concat(경력)));
  assert.equal(m.lists.length, 2, '구역마다 하나씩 나와야 합니다');
  assert.ok(m.lists.every((l, i, a) => a.filter((x) => x.id === l.id).length === 1),
    '구역 이름이 겹치면 채우기 지시가 서로를 덮습니다');
});
