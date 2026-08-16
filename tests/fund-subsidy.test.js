/* 근로복지공단 지원금 심사점수 — 평가표 배점 회귀
 *
 * ⚠ 이 저장소는 통째로 github.io 로 공개된다 — 실제 기금명 금지.
 *   여기 숫자는 공단이 배포한 «평가표 서식의 예시값»이라 특정 기금의 실적이 아니다.
 *
 * 평가표는 2025년에 개정됐다(별지 제3호의2):
 *   정성 30→40점(소규모기업 기여도 신설) · ① 25→15점 · ② 세부기준 단일화(②-2 삭제)
 *   · ③ 1인당 기지원액 삭제 → 참여기업 1개소당 평균 근로자수 · ④ 15점 그대로
 * 지나간 해를 새 배점으로 셈하면 그때 낸 서류와 어긋나므로 **해마다 갈라 쓴다**.
 * 그래서 여기서 지키는 것은 두 가지다:
 *   ① 2025년 이후는 새 배점으로 셈한다
 *   ② 2024년 이전은 «건드리지 않았다» — 평가표 서식의 예시가 89점 그대로 나온다
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'fund.html'), 'utf8');

function grabFn(name) {
  const i = SRC.indexOf('function ' + name + '(');
  assert.ok(i >= 0, 'fund.html 에 함수가 없다: ' + name);
  let d = 0, on = false;
  for (let j = i; j < SRC.length; j++) {
    if (SRC[j] === '{') { d++; on = true; }
    else if (SRC[j] === '}') { d--; if (on && !d) return SRC.slice(i, j + 1); }
  }
  throw new Error('함수 끝을 못 찾음: ' + name);
}
function grabDecl(name) {
  const i = SRC.indexOf('var ' + name + '=');
  assert.ok(i >= 0, 'fund.html 에 상수가 없다: ' + name);
  let d = 0;
  for (let j = SRC.indexOf('=', i); j < SRC.length; j++) {
    const c = SRC[j];
    if (c === '{' || c === '[') d++;
    else if (c === '}' || c === ']') { d--; if (!d) return SRC.slice(i, SRC.indexOf(';', j) + 1); }
  }
  throw new Error('상수 끝을 못 찾음: ' + name);
}

const sandbox = {};
sandbox.num = v => { if (v === '' || v == null) return ''; const n = Number(String(v).replace(/,/g, '')); return isFinite(n) ? n : ''; };
const code = ['SUB_RULE', 'SUB_BAND', 'SUB_BAND_LBL'].map(grabDecl).join('\n') + '\n'
  + ['subRule', 'subTier', '_subP1', '_subP2a', '_subP2b', '_subP3', '_subP3avg', '_subP4', 'subsidyCalc']
      .map(grabFn).join('\n') + '\nreturn subsidyCalc;';
const subsidyCalc = new Function('num', code)(sandbox.num);

/* 점수표를 그리는 함수도 함께 가져온다 — 셈만 고치고 화면이 옛 글을 띄우면 사람이 속는다.
   esc 는 fund.html 것과 같은 일을 하는 최소판으로 대신한다(HTML 특수문자 막기). */
const rowsCode = grabFn('_subScoreRows') + '\nreturn _subScoreRows;';
const _subScoreRows = new Function('esc', rowsCode)(
  s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));

/* 공단 평가표 서식에 실린 예시값 — 참여 16개사·근로자 385명·최다 56명·상위3 160명,
   출연(예정)금 3.85억·신청 1.925억(정확히 2.00배), 1인당 기지원 738,793원. 서식의 합계는 89점. */
const EX = { type: '1', nSite: 16, nEmp: 385, maxEmp: 56, top3: 160,
             contrib: 385000000, apply: 192500000, prevPerWorker: 738793 };
const calc = (o) => subsidyCalc(Object.assign({}, EX, o));

test('2024년 이전 배점은 손대지 않았다 — 서식 예시가 89점 그대로', () => {
  const c = calc({ year: '2024', qual: 28 });
  assert.equal(c.rubric, '2024');
  assert.equal(c.p1 * c.w1, 25, '① 은 25점(가중치 5)');
  assert.equal(c.p2 * 3, 15);
  assert.equal(c.p3 * 3, 9, '③ 1인당 기지원 738,793원 → 3점 × 3');
  assert.equal(c.p4 * 3, 12, '16개사 → 4점 × 3');
  assert.equal(c.qualMax, 30);
  assert.equal(c.score, 89);
});

test('2024년은 정성에 40을 넣어도 30으로 자른다', () => {
  assert.equal(calc({ year: '2024', qual: 40 }).qual, 30);
});

test('2025년은 새 배점 — ①15점, 정성 40점 상한', () => {
  const c = calc({ year: '2025', qual: 28 });
  assert.equal(c.rubric, '2025');
  assert.equal(c.w1, 3);
  assert.equal(c.p1 * c.w1, 15);
  assert.equal(c.qualMax, 40);
});

test('2025년 ②는 상위 3개소를 보지 않는다(세부기준 단일화)', () => {
  /* 상위 3개소가 90%를 넘어도 2025년판에서는 점수가 깎이지 않아야 한다.
     옛 배점에서는 같은 값이 ②-2 로 걸려 점수가 떨어진다 — 그 차이를 여기서 못 박는다. */
  const heavy = { nSite: 16, nEmp: 385, maxEmp: 56, top3: 370 };
  const c25 = calc(Object.assign({ year: '2025', qual: 28 }, heavy));
  const c24 = calc(Object.assign({ year: '2024', qual: 28 }, heavy));
  assert.equal(c25.p2, 5, '2025년은 최다 기업 비중만 본다');
  assert.equal(c24.p2, 0, '2024년은 상위3 96%가 걸려 배제된다');
});

test('2025년 ③은 참여기업 1개소당 평균 근로자수 — 적을수록 높다', () => {
  assert.equal(calc({ year: '2025', qual: 28 }).p3, 5, '385÷16 = 24.1명 → 30명 미만 5점');
  assert.equal(calc({ year: '2025', qual: 28, nSite: 10, nEmp: 385 }).p3, 4, '38.5명 → 4점');
  assert.equal(calc({ year: '2025', qual: 28, nSite: 6, nEmp: 385 }).p3, 3, '64.2명 → 3점');
  assert.equal(calc({ year: '2025', qual: 28, nSite: 4, nEmp: 385 }).p3, 2, '96.3명 → 2점');
  assert.equal(calc({ year: '2025', qual: 28, nSite: 3, nEmp: 385 }).p3, 1, '128.3명 → 1점');
});

test('2025년 ③은 사람이 넣은 1인당 기지원액을 쳐다보지 않는다', () => {
  /* 옛 입력값이 남아 있어도 새 배점의 ③ 이 흔들리면 안 된다 — 화면에 그 칸이 없기 때문이다. */
  const a = calc({ year: '2025', qual: 28, prevPerWorker: 0 });
  const b = calc({ year: '2025', qual: 28, prevPerWorker: 99999999 });
  assert.equal(a.p3, b.p3);
  assert.equal(a.score, b.score);
});

test('2025년 정량 만점은 60점, 정성까지 채우면 100점', () => {
  const p = calc({ year: '2025', qual: 40, nSite: 30, nEmp: 385 });
  assert.equal(p.quant, 60);
  assert.equal(p.score, 100);
  assert.equal(p.rate, 1);
});

test('2026년과 미확인 연도도 새 배점을 따른다', () => {
  assert.equal(calc({ year: '2026', qual: 28 }).rubric, '2025');
  assert.equal(calc({ year: '2027', qual: 28 }).rubric, '2025');
});

test('점수표 화면이 그해 배점을 그대로 적는다', () => {
  const g = { nSite: 16, nEmp: 385, maxEmp: 56, top3: 160 };
  const h25 = _subScoreRows(g, calc({ year: '2025', qual: 28 }));
  assert.match(h25, /③ 참여기업 1개소당 평균 근로자수/);
  assert.match(h25, /24\.1명/, '평균을 실제로 셈해 보여 준다');
  assert.match(h25, /적을수록 높은 점수/);
  assert.match(h25, /15\/15/, '① 이 15점 만점으로 나온다');
  assert.match(h25, /28\/40/, '정성이 40점 만점으로 나온다');
  assert.ok(!/1인당 이미 지원받은 금액/.test(h25), '없어진 항목을 아직 적으면 안 된다');
  assert.ok(!/상위 3개소 .*낮은 쪽 반영/.test(h25), '②-2 를 아직 적으면 안 된다');

  const h24 = _subScoreRows(g, calc({ year: '2024', qual: 28 }));
  assert.match(h24, /③ 1인당 이미 지원받은 금액/, '옛 해는 옛 항목 그대로');
  assert.match(h24, /25\/25/, '① 이 25점 만점');
  assert.match(h24, /28\/30/, '정성이 30점 만점');
  assert.ok(!/평균 근로자수/.test(h24), '옛 해에 새 항목이 새어 들면 안 된다');
});

test('배제 사유는 배점판과 무관하게 그대로다', () => {
  /* 출연금이 신청액보다 적으면(①=0) 어느 해든 배제 */
  ['2024', '2025'].forEach(y => {
    const c = calc({ year: y, qual: 28, contrib: 100000000, apply: 192500000 });
    assert.equal(c.p1, 0);
    assert.ok(c.excluded);
    assert.equal(c.expect, 0);
  });
});
