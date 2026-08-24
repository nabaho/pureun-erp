/* 출연금 대조 — 같은 돈을 두 군데서 따로 적고 있다
 *
 * 대표 지시 2026-08-24 검토 ②:
 *   별지15호(노동부)는 «장부»의 출연금을 쓰고,
 *   지원신청서·기금출연확인서(공단)는 «사업장 명부»의 손입력 값을 쓴다.
 *   둘을 대조하지 않아, 한쪽만 고치면 같은 해에 대해 숫자가 다른 서류 두 벌이 나간다.
 *
 * ⚠ 이 저장소는 통째로 github.io 로 공개된다 — 실제 기금명·번호 금지. 여기 자료는 전부 가짜다.
 *
 * 지켜야 하는 것
 *  ① 앱은 «다르다»는 사실만 알린다 — 어느 쪽이 맞는지는 사람만 안다(대부 대조와 같은 규칙)
 *  ② 사업장의 «기본 출연금»을 그 해 출연금으로 쓰지 않는다 — 멀쩡한 해가 틀린 것으로 잡힌다
 *  ③ 자료를 아직 안 읽었으면 «모른다» — 0 과 견주면 온 세상이 틀린 것이 된다
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

function check(book, sites, sy) {
  const box = {};
  new Function([
    grabFn('num'), grabFn('contribCheck'), 'this.f=contribCheck;'
  ].join('\n')).call(box);
  return box.f(book, sites, sy);
}

const SITES = [
  { _id: 'S1', name: '가나다산업', contrib: '500000000' },   // 기본 출연금 — 그 해 값이 아니다
  { _id: 'S2', name: '라마바물산', contrib: '300000000' },
  { _id: 'S3', name: '나간 곳', status: 'closed', contrib: '900000000' }
];

test('두 숫자가 같으면 아무 말도 하지 않는다', () => {
  const r = check(800000000, SITES, { S1: { contrib: 500000000 }, S2: { contrib: 300000000 } });
  assert.equal(r.book, 800000000);
  assert.equal(r.site, 800000000);
  assert.equal(r.diff, 0);
  assert.equal(r.off, false, '같은데 다르다고 하면 곧 아무도 안 본다');
  assert.equal(r.nNone, 0);
});

test('다르면 차이를 짚는다', () => {
  const r = check(800000000, SITES, { S1: { contrib: 500000000 }, S2: { contrib: 100000000 } });
  assert.equal(r.site, 600000000);
  assert.equal(r.diff, 200000000, '장부 − 사업장 명부');
  assert.equal(r.off, true);
});

test('탈퇴한 사업장은 세지 않는다', () => {
  const r = check(800000000, SITES, { S1: { contrib: 500000000 }, S2: { contrib: 300000000 }, S3: { contrib: 900000000 } });
  assert.equal(r.site, 800000000, '나간 사업장 몫까지 더하면 늘 어긋난다');
  assert.equal(r.off, false);
});

/* 여기가 이 대조의 핵심이다. 지원금 한도 계산(_subPlanAgg)은 «그 해 값이 없으면
   기본 출연금으로 메운다» — 한도는 어떤 숫자든 있어야 계산되기 때문이다.
   그러나 «대조»에 그 규칙을 쓰면, 그 해 출연이 정말 0원인 해가 기본 출연금만큼
   틀린 것으로 잡힌다. 실제로 출연은 매년 하는 것이 아니다. */
test('사업장의 「기본 출연금」을 그 해 출연금으로 쓰지 않는다', () => {
  const r = check(0, SITES, {});      // 그 해 출연이 없었던 해
  assert.equal(r.site, 0, '기본 출연금 8억을 그 해 출연으로 세면 멀쩡한 해가 틀린 것이 된다');
  assert.equal(r.off, false, '장부도 0, 명부도 0 — 알릴 것이 없다');
  assert.equal(r.nNone, 2, '그 해 값이 안 적힌 사업장은 세어 알려 준다');

  const body = grabFn('contribCheck');
  assert.ok(!/s\.contrib/.test(body),
    '사업장의 기본 출연금(s.contrib)을 보고 있다 — 그것은 그 해 들어온 돈이 아니다');
});

test('그 해 값이 안 적힌 사업장을 세어 원인을 짚어 준다', () => {
  const r = check(800000000, SITES, { S1: { contrib: 500000000 } });
  assert.equal(r.nYear, 1);
  assert.equal(r.nNone, 1, '라마바물산에 그 해 값이 없다');
  assert.equal(r.off, true);
  assert.equal(r.diff, 300000000, '안 적힌 만큼이 그대로 차이로 남는다');
});

test('현물출연도 장부 쪽에 넣는다 — ⑬만 보면 늘 모자라게 나온다', () => {
  const from = SRC.indexOf('출연금이 사업장 명부와 어긋나는가');
  const panel = SRC.slice(from, SRC.indexOf('contribCheck(', from) + 80);
  assert.match(panel, /contribCheck\(R\.bf\.employer\+R\.bf\.other/,
    '⑬ 사업주 출연 + ⑮ 사업주 외의 자 출연을 함께 넘겨야 한다');
});

test('별지15호 화면이 사업장 「그 해」 값을 함께 읽는다', () => {
  const load = grabFn('f15Load');
  assert.match(load, /ref\(NS\+'\/site_years\/'\+fid\+'\/'\+yr\)/,
    '사업장 그 해 값을 안 읽으면 대조할 상대가 없다');
  assert.match(load, /S\.f15Sy=r\[3\]/, '읽어 놓고 쓰지 않는다');
  assert.match(load, /S\.f15Sy=null/, '기금을 옮길 때 지난 기금 값을 안 비우면 남의 숫자와 견준다');
});

test('결산 확정 전에도 짚어 준다 — 자료를 안 읽었으면 「모른다」', () => {
  const lock = grabFn('lockClosing');
  assert.match(lock, /contribCheck\(/, '확정하면 그 숫자가 별지15호로 나간다 — 그 전에 알려야 한다');
  /* 운영상황보고서 탭을 한 번도 안 열었으면 S.f15Sites 가 없다.
     그때 0 과 견주면 «모든 기금이 다 틀렸다»고 뜬다. */
  assert.match(lock, /S\.f15For===fid\+'\/'\+yr\s*&&\s*S\.f15Sites/,
    '자료가 이 기금·이 해의 것인지 안 보고 견준다 — 헛경고가 쏟아진다');
  const g = lock.indexOf('S.f15For===fid');
  assert.ok(g >= 0 && g < lock.indexOf('contribCheck('), '견준 뒤에 확인하면 늦다');
});

test('고치러 가는 곳을 알려 준다', () => {
  assert.match(grabFn('goSiteYears'), /S\.siteTab='years'/, '연도별 기록으로 안 간다');
  assert.match(grabFn('goSiteYears'), /S\.tab='sites'/, '참여사업장 탭으로 안 간다');
  assert.ok(SRC.includes('onclick="goSiteYears()"'), '화면에 그리로 가는 단추가 없다');
});

/* 대부 대조와 같은 규칙이다 — 사실만 알리고 «고치지» 않는다.
   한쪽 값을 다른 쪽에 써 넣으면, 사람이 모르는 사이에 제출 숫자가 바뀐다.
   어느 쪽이 맞는지는 통장과 약정서를 본 사람만 안다. */
test('앱이 어느 쪽을 「맞다」고 정하지 않는다', () => {
  const body = grabFn('contribCheck');
  assert.ok(!/fbDb|\.set\(|\.update\(|\.remove\(/.test(body), '대조하면서 서버에 쓰고 있다');
  // 돌려주는 것은 «보고»뿐이어야 한다 — 넘겨받은 자료를 손대면 부르는 쪽이 조용히 바뀐다
  const sites = [{ _id: 'S1', contrib: '500000000' }];
  const sy = { S1: { contrib: 400000000 } };
  const before = JSON.stringify({ sites, sy });
  const r = check(500000000, sites, sy);
  assert.equal(JSON.stringify({ sites, sy }), before, '넘겨받은 자료를 고쳤다');
  assert.deepEqual(Object.keys(r).sort(), ['book', 'diff', 'nNone', 'nYear', 'off', 'site'],
    '보고에 없는 것이 섞여 있다 — 대조는 «세는 일»이지 «고치는 일»이 아니다');
  assert.equal(r.off, true, '4억과 5억은 다르다');
});
