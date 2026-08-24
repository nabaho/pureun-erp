/* 기한 — 「누가 늦었나」를 화면이 스스로 말하게
 *
 * 대표 지시 2026-08-24: 「기한을 아무도 안 알려준다 — 42개를 하나씩 열어봐야 안다」.
 * 예전에는 연간 일정에 기한 «날짜»만 글자로 찍혔다. 지났는지는 사람이 달력을 보고 셌다.
 *
 * ⚠ 이 저장소는 통째로 github.io 로 공개된다 — 실제 기금명·번호 금지. 여기 자료는 전부 가짜다.
 *
 * 지켜야 하는 것
 *  ① 오늘 날짜는 «밖에서» 넣는다 — 함수가 스스로 new Date() 를 부르면 3월에만 깨지는
 *    검사가 된다(있으나 마나다)
 *  ② 연간 일정은 «한 번만» 읽는다 — 기금 42곳을 하나씩 조회하면 그 화면 한 번에 42번이다
 *  ③ 설립 중·지난 기금은 뺀다 — 안 굴러가는 기금이 늘 늦은 것으로 잡히면 표가 쓸모없다
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
  let d = 0, on = false;
  for (let j = SRC.indexOf('=', i); j < SRC.length; j++) {
    const c = SRC[j];
    if (c === '{' || c === '[') { d++; on = true; }
    else if (c === '}' || c === ']') { d--; if (on && !d) return SRC.slice(i, j + 1) + ';'; }
  }
  throw new Error('상수 끝을 못 찾음: ' + name);
}

/* 판정 함수들만 떼어 돌린다 — 화면 없이 순수 계산이다 */
function calc() {
  const box = {};
  new Function([
    grabDecl('ANNUAL_TMPL'), grabDecl('DUE_SHORT'), 'var DUE_SOON=30;',
    grabFn('dueDateOf'), grabFn('dueDays'), grabFn('dueState'), grabFn('dueItemsOf'),
    'this.o={dueDateOf:dueDateOf,dueDays:dueDays,dueState:dueState,dueItemsOf:dueItemsOf,' +
    'TMPL:ANNUAL_TMPL,SHORT:DUE_SHORT};'
  ].join('\n')).call(box);
  return box.o;
}

test('기한 날짜는 회계연도 + 해 오프셋으로 나온다', () => {
  const C = calc();
  // 2025 회계연도의 별지15호는 «다음 해» 3월 31일이 기한이다
  assert.equal(C.dueDateOf(['RPT-03', '', '', [1, '03-31']], 2025), '2026-03-31');
  // 같은 해 안에서 끝나는 일(가결산)은 오프셋 0
  assert.equal(C.dueDateOf(['CLS-01', '', '', [0, '12-31']], 2025), '2025-12-31');
  assert.equal(C.dueDateOf(['SUP-01', '', '', null], 2025), '', '기한 없는 일정은 빈 값');
});

test('며칠 남았는지 — 지났으면 음수', () => {
  const C = calc();
  assert.equal(C.dueDays('2026-03-01', '2026-03-31'), 30);
  assert.equal(C.dueDays('2026-03-31', '2026-03-31'), 0, '오늘이 기한이면 0');
  assert.equal(C.dueDays('2026-04-10', '2026-03-31'), -10, '지났으면 음수');
  assert.equal(C.dueDays('2026-02-28', '2026-03-01'), 1, '윤년 아닌 2월을 넘어간다');
  assert.equal(C.dueDays('2024-02-28', '2024-03-01'), 2, '윤년 2월 29일을 센다');
  assert.equal(C.dueDays('2026-01-01', '2027-01-01'), 365, '해를 넘어간다');
  assert.equal(C.dueDays('말도 안 되는 날', '2026-03-31'), null, '못 읽으면 null');
});

test('상태 — 완료·지남·임박·여유의 경계', () => {
  const C = calc();
  assert.equal(C.dueState('2026-03-31', true, '2026-08-24').k, 'done', '해 놓았으면 지나도 done');
  assert.equal(C.dueState('', false, '2026-08-24').k, 'none', '기한 없는 일정은 판정하지 않는다');

  const late = C.dueState('2026-03-31', false, '2026-08-24');
  assert.equal(late.k, 'late');
  assert.equal(late.days, 146, '며칠 지났는지 «양수»로 준다 — 화면에 그대로 찍는다');

  assert.equal(C.dueState('2026-08-24', false, '2026-08-24').k, 'soon', '오늘이 기한이면 아직 임박');
  assert.equal(C.dueState('2026-08-24', false, '2026-08-24').days, 0);
  assert.equal(C.dueState('2026-09-23', false, '2026-08-24').k, 'soon', '30일 남았으면 임박');
  assert.equal(C.dueState('2026-09-24', false, '2026-08-24').k, 'later', '31일 남았으면 아직 여유');
});

test('짧은 이름이 기한 있는 일정을 «모두» 덮는다', () => {
  const C = calc();
  C.TMPL.filter(t => t[3]).forEach(t => {
    assert.ok(C.SHORT[t[0]], '표 머리에 쓸 짧은 이름이 없다: ' + t[0] + ' (' + t[2] + ')');
    assert.ok(C.SHORT[t[0]].length <= 10, '표 칸에 안 들어갈 만큼 길다: ' + C.SHORT[t[0]]);
  });
  // 반대쪽 — 없어진 일정의 이름이 남아 있으면 표에 유령 칸이 생긴다
  const codes = C.TMPL.map(t => t[0]);
  Object.keys(C.SHORT).forEach(k =>
    assert.ok(codes.includes(k), 'ANNUAL_TMPL 에 없는 일정의 이름이 남아 있다: ' + k));
});

test('한 기금의 그 해 기한 — 체크한 것은 늦은 것으로 안 잡힌다', () => {
  const C = calc();
  const f = { fund_type: '공동' };
  const ann = { 2025: { 'RPT-03': { done: true } } };
  const its = C.dueItemsOf(f, 2025, ann, '2026-08-24');

  const f15 = its.filter(x => x.code === 'RPT-03')[0];
  assert.ok(f15, '별지15호가 목록에 없다');
  assert.equal(f15.k, 'done', '체크했는데도 늦은 것으로 잡혔다');

  const aud = its.filter(x => x.code === 'AUD-01')[0];
  assert.equal(aud.k, 'late', '체크 안 한 감사는 늦은 것이어야 한다');
  assert.ok(aud.days > 0);
  assert.ok(its.every(x => x.due), '기한 없는 일정이 섞여 들어왔다');
});

test('오늘 날짜를 «안에서» 만들지 않는다', () => {
  ['dueDays', 'dueState', 'dueItemsOf', 'dueDateOf'].forEach(fn => {
    const body = grabFn(fn).replace(/\/\*[\s\S]*?\*\//g, '');
    assert.ok(!/new Date\(\)|ymd\(\)/.test(body),
      fn + ' 이 스스로 오늘을 만든다 — 검사가 날짜에 따라 붙었다 떨어졌다 한다');
  });
});

/* ══════ 표를 «정말 그려» 본다 ══════
   글자로만 찾으면 소스에 남은 헛것(예: 손질 대본의 변수 이름)이 그대로 통과한다.
   실제로 그리면 그 자리에서 ReferenceError 로 걸린다. */
function renderDue(list, annual, today, fy) {
  const box = {};
  new Function('LIST', 'ANN', 'TODAY', 'FY', [
    grabDecl('ANNUAL_TMPL'), grabDecl('DUE_SHORT'), 'var DUE_SOON=30;',
    'var S={view:"home",dueLoaded:1,dueAll:ANN,dueFy:FY};',
    'var NS="fund_erp";',
    'function ymd(){ return TODAY; }',
    'function esc(s){ return String(s==null?"":s); }',
    'function hlp(k){ return "<i>"+k+"</i>"; }',
    'function loadingHTML(m){ return String(m||""); }',
    'function renderHome(){}',
    'function go(){} function goAnnual(){}',
    'var fbDb={ref:function(){ return {once:function(){ return Promise.resolve({val:function(){return {};}}); }}; }};',
    grabFn('isPast'), grabFn('dueDateOf'), grabFn('dueDays'), grabFn('dueState'),
    grabFn('dueItemsOf'), grabFn('dueMatrixHTML'),
    'this.html=dueMatrixHTML(LIST);'
  ].join('\n')).call(box, list, annual, today, fy);
  return box.html;
}

const FUNDS = [
  { _id: 'F1', short_name: '가짜 1호', name: '가짜공동근로복지기금', fund_type: '공동' },
  { _id: 'F2', short_name: '가짜 2호', name: '가짜2공동근로복지기금', fund_type: '공동' },
  { _id: 'F3', short_name: '설립중', name: '설립중기금', fund_type: '공동', setup_stage: '설립준비' },
  { _id: 'F4', short_name: '끝난 곳', name: '끝난기금', fund_type: '공동', lifecycle: '계약종료' }
];

test('기한 표가 실제로 그려진다 — 늦은 칸·완료 칸이 나온다', () => {
  const html = renderDue(FUNDS, { F1: { 2025: { 'RPT-03': { done: true } } } }, '2026-08-24', 2025);
  assert.ok(html.includes('가짜 1호') && html.includes('가짜 2호'), '기금이 표에 안 나왔다');
  assert.ok(html.includes('별지15호'), '일정 이름이 표 머리에 없다');
  assert.ok(/지남 \d+/.test(html), '지난 건수를 안 세었다');
  assert.ok(html.includes('goAnnual('), '칸을 눌러도 그 기금으로 못 간다');
  assert.ok(/일<\/span>/.test(html), '며칠 지났는지 칸에 안 찍혔다');
});

test('설립 중·지난 기금은 기한 표에서 뺀다', () => {
  const html = renderDue(FUNDS, {}, '2026-08-24', 2025);
  assert.ok(!html.includes('설립중'), '아직 안 굴러가는 기금이 늘 늦은 것으로 잡힌다');
  assert.ok(!html.includes('끝난 곳'), '끝난 기금이 늘 늦은 것으로 잡힌다');
});

test('완료한 것은 「지남」에서 빠지고 「완료」로 센다', () => {
  const none = renderDue([FUNDS[0]], {}, '2026-08-24', 2025);
  const all = {};
  new Function('O', grabDecl('ANNUAL_TMPL') + 'ANNUAL_TMPL.forEach(function(t){ if(t[3]) O[t[0]]={done:true}; });')({}, all);
  // 위 한 줄로는 못 채운다 — 직접 만든다
  const done = {};
  ['RPT-01', 'CLS-01', 'CLS-02', 'AUD-01', 'RPT-02', 'RPT-03', 'TAX-01'].forEach(c => { done[c] = { done: true }; });
  const full = renderDue([FUNDS[0]], { F1: { 2025: done } }, '2026-08-24', 2025);
  assert.ok(/지남 \d+/.test(none), '아무것도 안 했는데 지남이 0으로 나온다');
  assert.ok(!/지남 \d+/.test(full), '전부 체크했는데 아직 늦은 것이 있다고 한다');
  assert.ok(/완료 7/.test(full), '완료 건수를 안 세었다');
});

test('연간 일정을 «한 번만» 읽는다 — 기금별 반복 조회 금지', () => {
  const body = grabFn('dueMatrixHTML');
  const reads = body.match(/fbDb\.ref\([^)]*\)/g) || [];
  assert.equal(reads.length, 1, '읽는 자리가 하나여야 한다: ' + reads.join(', '));
  assert.match(body, /ref\(NS\+'\/annual'\)\.once\('value'\)/, '연간 일정 전체를 한 번에 읽어야 한다');
  /* 읽는 자리가 «다 읽었나» 표시 안에 있어야 한다 — 밖에 있으면 화면을 다시 그릴
     때마다 다시 읽는다(표를 한 번 보는 사이에 수십 번이 된다). */
  const guard = body.indexOf('if(!S.dueLoaded)');
  assert.ok(guard >= 0 && guard < body.indexOf('fbDb.ref'),
    '이미 읽었는지 보지 않고 읽는다 — 다시 그릴 때마다 서버를 부른다');
});

test('체크를 바꾸면 기한 표가 옛 상태를 안 들고 있는다', () => {
  assert.match(grabFn('toggleAnnual'), /_dueDirty\(\)/,
    '체크해도 기한 표가 그대로면 「했는데 왜 아직 빨갛지」가 된다');
  assert.match(grabFn('_dueDirty'), /S\.dueLoaded=0/, '다시 읽게 표시하지 않는다');
});

test('기금 안 연간 일정도 기한을 «색»으로 말한다', () => {
  const at = grabFn('annualTab');
  assert.match(at, /dueState\(/, '연간 일정이 아직 날짜만 글자로 찍는다');
  assert.ok(at.includes('일 지남'), '며칠 지났는지 안 알려 준다');
  assert.ok(at.includes('D-'), '며칠 남았는지 안 알려 준다');
  assert.match(at, /기한 지남/, '이 기금에 늦은 것이 몇 개인지 위에 안 보인다');
});

test('홈 보기에 「기한」 자리가 있고 배선이 걸려 있다', () => {
  assert.match(SRC, /\['due','기한'\]/, '홈 보기에 기한이 없다');
  assert.match(SRC, /S\.homeView==='due'\s*\)?\s*return dueMatrixHTML/, '기한을 골라도 안 그려진다');
  assert.ok(SRC.includes("'board.due':{t:"), 'ⓘ 설명이 등록되지 않았다');
  assert.match(grabFn('goAnnual'), /S\.tab='annual'/, '칸을 눌러도 연간 일정으로 안 간다');
});
