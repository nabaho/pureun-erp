'use strict';
/* 경력사항 줄마다 前/現 «골라» 넣기 (대표 지시 2026-09-03)

   「전, 현 한자를 선택해야할 경우가 많다. 이부분은 경력관리와 연결해서 선택하고
     전현도 선택할 수 있게 해달라」
   승인받은 목업: docs/mockups/home-career-eraprefix.html

   ★ 왜 필요했나 — 「現」·「前」은 자판으로 바로 안 나온다. 열여덟 줄을 고치려면
     한자를 열여덟 번 찾아 넣어야 했다.

   ★ 이 검사가 지키는 것
     ① 앞한자 규칙이 «한 자리»에 있다(eraOf·eraBody·withEra) — 화면이 정규식을 따로 쓰면 갈라진다
     ② 칸에는 «속글»만 있고, 글자를 쳐도 앞한자가 안 사라진다
     ③ 켜진 딱지를 다시 누르면 «없음» — 학력·자격증에 「現」을 억지로 안 붙인다
     ④ 자동은 «첫 값»일 뿐 — 딱지로 바꾼 것이 넣을 때 되돌아가지 않는다 (급소)
     ⑤ 딱지가 줄 높이를 안 늘린다(한 칸은 한 줄) · 덧창에서 체크를 안 뒤집는다
   실행: node --test tests/home-career-era.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(R, 'pu-home.html'), 'utf8');
const careerJs = fs.readFileSync(path.join(R, 'js', 'pu-home-career.js'), 'utf8');

/* 주석은 걷어 놓고 본다 — 잘 쓴 주석이 검사를 통과시키면 아무것도 안 지킨다 */
const 알맹이 = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

function 떼기(이름, 글 = src) {
  const at = 글.search(new RegExp('^function ' + 이름 + '\\(', 'm'));
  assert.ok(at > 0, '★ ' + 이름 + ' 을 못 찾았습니다');
  return 글.slice(at, 글.indexOf('\n}', at) + 2);
}
function 한줄상수(이름) {
  const m = new RegExp('\\nconst ' + 이름 + ' = [^\\n]*;').exec(src);
  assert.ok(m, '★ const ' + 이름 + ' 을 못 찾았습니다');
  return m[0].replace(/\nconst /, '\nvar ');
}

/* 진짜 부품을 싣는다 — 베끼면 부품이 바뀌어도 이 검사는 옛 규칙을 지킨다 */
function 부품() {
  const c = { window: undefined, String, Object, Array, Number, Boolean, RegExp };
  vm.createContext(c);
  vm.runInContext(careerJs, c);
  return c.PuHomeCareer;
}

/* ══════ ① 앞한자 규칙 — 한 자리에 ══════ */

test('★ 앞한자를 읽는다 — 現 · 前 · 없음 세 자리', () => {
  const C = 부품();
  assert.equal(C.eraOf('現 푸른노무법인 대표'), 'now');
  assert.equal(C.eraOf('前 충남 노동정책 추진단위원'), 'past');
  assert.equal(C.eraOf('고려대학교 노동대학원 졸업'), '', '★ 한자가 없는 줄을 現 으로 읽습니다');
  assert.equal(C.eraOf('  現 앞에 빈칸이 있는 줄'), 'now', '★ 앞 빈칸 때문에 못 읽습니다');
  assert.equal(C.eraOf(''), '');
  assert.equal(C.eraOf(null), '', '★ 빈 값에서 터집니다 — 새 줄을 더하면 그 자리가 null 입니다');
});

test('★★ 한자를 뗄 때 «뒤의 빈칸까지» 뗀다 — 안 그러면 빈칸이 홈페이지 글로 나간다', () => {
  const C = 부품();
  assert.equal(C.eraBody('現 푸른노무법인 대표'), '푸른노무법인 대표');
  assert.equal(C.eraBody('現　푸른'), '푸른', '★ 전각 빈칸이 남습니다');
  assert.equal(C.eraBody('고려대학교 졸업'), '고려대학교 졸업', '★ 한자가 없는 줄을 깎았습니다');
  /* 딱지를 켰다 끄면 속글 앞에 빈칸 하나가 남는 것이 여기서 나온다 */
  assert.equal(C.withEra(C.withEra('푸른', 'now'), ''), '푸른',
    '★★ 켰다 끄면 앞에 빈칸이 남습니다 — 그 줄이 그대로 홈페이지로 나갑니다');
});

test('★★ 한자를 «겹쳐» 붙이지 않는다 — 누를 때마다 늘어나면 안 된다', () => {
  const C = 부품();
  assert.equal(C.withEra('現 가나', 'past'), '前 가나', '★ 前 現 가나 처럼 겹쳤습니다');
  assert.equal(C.withEra('現 가나', 'now'), '現 가나');
  assert.equal(C.withEra('가나', ''), '가나');
  assert.equal(C.withEra('前 가나', ''), '가나');
  /* 여러 번 눌러도 한 자리만 바뀐다 */
  let s = '가나';
  ['now', 'past', 'now', ''].forEach(k => { s = C.withEra(s, k); });
  assert.equal(s, '가나');
});

/* ══════ ② 경력사항 줄 — 칸에는 속글만 ══════ */

test('★ 줄마다 딱지가 있고, 칸에는 «속글»만 들어간다', () => {
  const at = 알맹이.indexOf('id="careerBox"');
  assert.ok(at > 0, '★ 경력사항 목록을 못 찾았습니다');
  const 칸 = 알맹이.slice(at, at + 1200);
  assert.match(칸, /eraPickHtml\(/, '★★ 경력사항 줄에 前/現 딱지가 없습니다 — 한자를 손으로 칩니다');
  assert.match(칸, /careerEra\(/, '★ 딱지를 눌러도 아무 일이 안 일어납니다');
  assert.match(칸, /PuHomeCareer\.eraBody\(line\)/,
    '★★ 칸에 앞한자가 «함께» 들어갑니다 — 딱지와 칸이 같은 한자를 두 번 보여 주고,\n' +
    '  칸에서 지우면 딱지만 켜진 채로 남습니다');
});

function 편집상자(줄들) {
  const c = {
    App: { draft: { careers: (줄들 || []).slice() }, dirty: false, render() { c.App._그렸다 = true; } },
    markDirty() {}, document: { getElementById: () => null },
    String, Object, Array, Number, Boolean, RegExp
  };
  vm.createContext(c);
  /* window 를 안 두면 부품이 globalThis(=이 상자)에 PuHomeCareer 를 건다 */
  vm.runInContext(careerJs, c);
  vm.runInContext(한줄상수('ERA_LIKELY') + '\n' + 떼기('eraInfoText') + '\n'
    + 떼기('careerEdit') + '\n' + 떼기('careerEra'), c);
  return c;
}

test('★★ 글자를 쳐도 앞한자가 «안 사라진다» — 칸에는 속글만 있으니까', () => {
  const c = 편집상자(['現 푸른노무법인 대표']);
  c.careerEdit(0, '푸른노무법인 대표이사');
  assert.equal(c.App.draft.careers[0], '現 푸른노무법인 대표이사',
    '★★ 한 자 칠 때마다 앞의 現 이 사라집니다');
});

test('★★ 칸에 한자를 «직접 쳐 넣으면» 그것이 이긴다 — 안 그러면 글자가 안 먹는다', () => {
  const c = 편집상자(['고려대학교 졸업']);
  c.careerEdit(0, '前 고려대학교 졸업');
  assert.equal(c.App.draft.careers[0], '前 고려대학교 졸업',
    '★★ 쳐 넣은 한자가 그 자리에서 지워집니다 — 「글자가 안 먹는다」로 보입니다');
});

test('★★ 켜진 딱지를 다시 누르면 «없음» — 학력·자격증에 現 을 억지로 안 붙인다', () => {
  const c = 편집상자(['現 공인노무사']);
  c.careerEra(0, 'now');
  assert.equal(c.App.draft.careers[0], '공인노무사',
    '★★ 없음으로 돌아갈 길이 없습니다 — 「現 공인노무사」를 지울 수 없습니다');
  c.careerEra(0, 'past');
  assert.equal(c.App.draft.careers[0], '前 공인노무사');
});

test('★ 딱지를 누르면 «저장 안 됨»이 켜진다 — 안 켜지면 고친 것을 잃는다', () => {
  const c = 편집상자(['공인노무사']);
  c.careerEra(0, 'now');
  assert.equal(c.App.dirty, true, '★ 딱지로 고친 것이 저장 안 된 채 화면을 떠납니다');
});

test('★★ 딱지를 눌러도 창을 «통째로 다시 그리지 않는다» — 굴린 자리가 맨 위로 튄다', () => {
  /* 경력사항은 열여덟 줄이다. 다시 그리면 굴린 자리와 커서를 잃는다. */
  const c = 편집상자(['現 가', '나']);
  const 단추 = [{ className: '' }, { className: 'past' }];
  const row = { querySelectorAll: () => 단추, classList: { toggle() {} } };
  c.document = { getElementById: (id) => (id === 'careerBox'
    ? { querySelectorAll: () => [row, row] } : null) };
  c.App._그렸다 = false;
  c.careerEra(0, 'past');
  assert.equal(c.App._그렸다, false,
    '★★ 딱지 한 번에 화면을 통째로 다시 그립니다 — 굴린 자리가 맨 위로 튑니다');
  assert.equal(단추[1].className, 'past on', '★ 딱지가 켜진 것으로 안 보입니다');
  assert.equal(단추[0].className, '', '★ 앞서 켜져 있던 딱지가 안 꺼졌습니다');
});

test('★ 줄을 못 찾으면 그때는 다시 그린다 — 조용히 아무 일도 안 하면 안 된다', () => {
  const c = 편집상자(['現 가']);
  c.App._그렸다 = false;
  c.careerEra(0, 'past');
  assert.equal(c.App.draft.careers[0], '前 가', '★ 자료가 안 바뀝니다');
  assert.equal(c.App._그렸다, true,
    '★ 딱지만 갈아 끼울 자리가 없는데 다시 그리지도 않습니다 — 화면과 자료가 달라집니다');
});

test('★ 안 고른 줄이 몇인지 세어 준다 — 전현이 있을 만한 줄만', () => {
  const c = 편집상자([]);
  assert.match(c.eraInfoText(['충남 노사민정협의회 위원', '現 대표']), /1개/);
  assert.equal(c.eraInfoText(['고려대학교 졸업', '공인노무사']), '',
    '★ 학력·자격증까지 「안 골랐다」고 조릅니다 — 늘 켜진 경고는 아무도 안 봅니다');
});

/* ══════ ③ 가져오기 창 — 자동은 «첫 값»일 뿐 ══════ */

function 가져오기상자(kind, 항목, 옵션) {
  const o = 옵션 || {};
  const c = {
    Pull: { kind: kind, sel: {}, era: {}, items: { [kind]: 항목 }, q: '', f: '' },
    todayString: () => '2026-09-07',
    toCareerItem: (it) => it,
    kindHasPeriod: () => !!o.hasPeriod,
    itemWhen: () => '',
    esc: (s) => String(s == null ? '' : s),
    document: { getElementById: () => null },
    renderPull() {},
    closeModal() {}, toast() {},
    App: { draft: { kind: 'member', careers: [] }, dirty: false, render() {} },
    console: { warn() {} },
    String, Object, Array, Number, Boolean, RegExp
  };
  vm.createContext(c);
  vm.runInContext(careerJs, c);
  vm.runInContext(한줄상수('ERA_AUTO_KINDS') + '\n' + 떼기('eraPickHtml') + '\n'
    + 떼기('pullAutoEra') + '\n' + 떼기('pullEraOf') + '\n' + 떼기('pullEra') + '\n'
    + 떼기('찾기꼴') + '\n' + 떼기('pullPass') + '\n' + 떼기('pullVisible') + '\n'
    + 떼기('pullListHtml') + '\n' + 떼기('pullApply'), c);
  return c;
}

/* 위촉장 두 건 — 하나는 하는 중, 하나는 끝남 */
const 위촉 = [
  { org: '충남 노사민정협의회', role: '분과위원', period: '2024-03-01 ~ ' },
  { org: '한국토지주택공사', role: '긴급상담위원', period: '2023-05-01 ~ 2025-04-30' }
];

test('★ 위촉장은 기간으로 «첫 값»이 정해진다 — 여태 하던 그대로', () => {
  const c = 가져오기상자('wiccok', 위촉, { hasPeriod: true });
  const h = c.pullListHtml('2026-09-07');
  assert.match(h, /class="era"/, '★★ 가져오기 창에 前/現 딱지가 없습니다');
  /* 하는 중 → 現 이 켜짐 · 끝남 → 前 이 켜짐 */
  const 줄 = h.split('<label').slice(1);
  assert.equal(줄.length, 2);
  assert.match(줄[0], /class=" on"[^>]*>現/, '★ 하고 있는 위촉이 現 으로 안 켜집니다');
  assert.match(줄[1], /class="past on"[^>]*>前/, '★ 끝난 위촉이 前 으로 안 켜집니다');
});

test('★★ 학력·자격증은 첫 값이 «없음» — 「現 공인노무사」가 되지 않게', () => {
  const 자격 = [{ org: '고용노동부', role: '공인노무사' }];
  const c = 가져오기상자('license', 자격, { hasPeriod: false });
  const h = c.pullListHtml('2026-09-07');
  assert.doesNotMatch(h, / on"/, '★★ 자격증에 現 딱지가 미리 켜져 있습니다');
  assert.match(h, /전현 없는 갈래/, '★ 왜 딱지가 꺼져 있는지 화면이 말해 주지 않습니다');
  /* 넣어 보면 한자가 안 붙는다 */
  c.Pull.sel = { 'license:0': true };
  c.pullApply();
  assert.equal(c.App.draft.careers[0], '고용노동부 공인노무사',
    '★★ 「現 고용노동부 공인노무사」로 들어갑니다 — 사람이 늘 손으로 지우던 줄입니다');
});

test('★★★ 딱지로 바꾼 것이 넣을 때 «되돌아가지 않는다»', () => {
  /* 급소 — pullApply 가 line.text 를 그냥 쓰면 사람이 고친 것이 조용히 자동값으로
     되돌아간다. 오류도 안 나고 화면과 들어간 글이 달라져 알 수가 없다. */
  const c = 가져오기상자('wiccok', 위촉, { hasPeriod: true });
  c.pullEra('wiccok', 1, 'now');            // 끝난 것을 「現」으로 바꾼다
  c.Pull.sel = { 'wiccok:1': true };
  c.pullApply();
  assert.equal(c.App.draft.careers[0], '現 한국토지주택공사 긴급상담위원',
    '★★★ 딱지로 現 으로 바꿨는데 前 으로 들어갔습니다 — 화면과 들어간 글이 다릅니다');
});

test('★★ 켜진 딱지를 다시 누르면 «없음»으로 들어간다 — 자동으로 되돌아가지 않는다', () => {
  /* 「안 적힘」과 「없음으로 골랐음」을 안 가르면, 자동이 現 인 줄에서 없음을 고른 것이
     조용히 現 으로 되돌아간다. */
  const c = 가져오기상자('wiccok', 위촉, { hasPeriod: true });
  c.pullEra('wiccok', 0, 'now');            // 이미 現 이던 것을 다시 눌러 없음으로
  c.Pull.sel = { 'wiccok:0': true };
  c.pullApply();
  /* ⚠ 꼬리표(※기간 모름)는 이 딱지와 «상관없다». 「2024-03-01 ~ 」은 끝이 비어 있어
     예전부터 「기간 모름」으로 본다 — 그 규칙은 그대로 두고 앞한자만 본다. */
  assert.equal(c.PuHomeCareer.eraOf(c.App.draft.careers[0]), '',
    '★★ 없음으로 골랐는데 現 이 다시 붙었습니다');
  assert.match(c.App.draft.careers[0], /^충남 노사민정협의회 분과위원/,
    '★ 앞한자를 떼면서 속글까지 깎았습니다');
});

test('★ 딱지는 «기간이 어떤가»만 말한다 — 무엇이 들어갈지 단정하지 않는다', () => {
  /* 사람이 앞한자를 바꿀 수 있으므로 「기간 끝남 → 前」은 틀린 안내가 된다 */
  const c = 가져오기상자('wiccok', 위촉, { hasPeriod: true });
  const h = c.pullListHtml('2026-09-07');
  assert.match(h, /기간 끝남/, '★ 기간이 끝났다는 사실을 안 알려 줍니다');
  assert.ok(h.indexOf('기간 끝남 → 前') < 0,
    '★ 딱지가 「→ 前」이라고 단정합니다 — 사람이 現 으로 바꿔 두면 틀린 안내입니다');
});

test('★★ era 칸이 없는 옛 상태에서도 창이 죽지 않는다', () => {
  const c = 가져오기상자('wiccok', 위촉, { hasPeriod: true });
  delete c.Pull.era;
  const h = c.pullListHtml('2026-09-07');
  assert.match(h, /class="era"/,
    '★★ 딱지 하나 때문에 가져오기 창이 통째로 죽습니다');
});

/* ══════ ④ 모양 — 줄이 늘지 않고, 체크를 뒤집지 않는다 ══════ */

test('★★ 딱지가 줄 높이를 «안 늘린다» — 한 칸은 한 줄이다', () => {
  const era = /(?:^|\n)\.era\{([^}]*)\}/.exec(src);
  assert.ok(era, '★ 딱지 꾸밈이 없습니다');
  assert.match(era[1], /flex:\s*0 0 auto/,
    '★★ 딱지가 줄어들거나 늘어납니다 — 좁은 화면에서 한자가 짜부라집니다');
  const 줄 = /(?:^|\n)\.car \.l\{([^}]*)\}/.exec(src);
  assert.ok(줄, '★ 경력 줄 꾸밈이 없습니다');
  assert.ok(줄[1].indexOf('flex-wrap') < 0,
    '★★ 경력 줄이 두 줄로 접힙니다 — 표 전체가 그만큼 길어집니다(2026-08-30 대표 지시)');
});

test('★★ 덧창 안의 딱지가 «체크를 뒤집지 않는다»', () => {
  /* <label class="pk"> 안에 있어서, 막지 않으면 딱지를 누를 때마다 체크가 켜졌다 꺼진다 */
  const f = 떼기('eraPickHtml');
  assert.match(f, /event\.preventDefault\(\)/,
    '★★ 딱지를 누르면 체크까지 뒤집힙니다 — 고른 것이 조용히 풀립니다');
  assert.match(f, /type="button"/,
    '★ type 을 안 적었습니다 — form 안에 들어가면 제출이 되어 고른 것이 통째로 사라집니다');
});

test('★ 딱지 한 벌을 «두 자리»가 함께 쓴다 — 두 벌이면 한쪽만 고쳐진다', () => {
  const 부른곳 = (알맹이.match(/eraPickHtml\(/g) || []).length;
  assert.ok(부른곳 >= 3, '★ 딱지를 부르는 자리가 ' + 부른곳 + '곳입니다 — 만든 곳 하나와 부르는 곳 둘이어야 합니다');
  assert.equal((알맹이.match(/function eraPickHtml\(/g) || []).length, 1,
    '★★ 딱지를 만드는 함수가 둘입니다 — 한쪽만 고쳐져 「대표 화면은 그대로」가 됩니다');
});

test('★ 앞한자 규칙을 화면이 «따로» 만들지 않는다 — 부품 하나만 본다', () => {
  /* 화면에 /^(現|前)/ 같은 정규식을 또 쓰면 규칙이 둘로 갈라진다
     (한쪽은 앞 빈칸을 봐 주고 한쪽은 안 봐 주는 식으로). */
  assert.ok(알맹이.indexOf('(現|前)') < 0,
    '★★ 화면이 앞한자 정규식을 따로 씁니다 — 부품(PuHomeCareer)과 갈라집니다');
});
