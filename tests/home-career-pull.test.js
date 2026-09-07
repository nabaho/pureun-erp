/* 경력사항 — 경력관리에서 «골라» 가져온다 (대표 지시 2026-09-02)
   「경력사항은 경력관리에 가져오고 선택가능하게해줘」

   가져오는 길(openPull)은 처음부터 있었다. 없던 것은 둘이다:
     ① 그 길이 화면 «맨 아래» 단추줄에만 있었다 — 경력사항을 보고 있는 사람 눈에 안 띈다.
        폰에서는 열여덟 줄을 다 지나야 나온다.
     ② 창을 열어도 «하나씩» 눌러야 했다 — 열여덟 줄이면 열여덟 번이다.

   지키는 규칙:
     ⓐ 경력사항 칸 «옆»에서 바로 가져올 수 있다
     ⓑ 아래 단추줄의 길은 «그대로 둔다» — PC 에서 그것으로 일하던 손버릇을 뺏지 않는다
     ⓒ 한 갈래를 통째로 고르고 풀 수 있다
     ⓓ ★ 「전부 고르기」는 «이 갈래만» 고른다 — 모든 갈래를 한꺼번에 고르면
        자격증까지 딸려 들어가고, 나중에 하나씩 지워야 한다
   실행: node --test tests/home-career-pull.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'pu-home.html'), 'utf8');

test('ⓐ 경력사항 칸 옆에서 바로 가져올 수 있다', () => {
  /* ⚠ .fldbar 로 시작하는 칸이 여럿이다(이름·담당 업무·경력사항) — 첫 번째를 잡으면
     엉뚱한 칸을 본다. 「경력사항」 이라는 말이 있는 자리에서부터 찾는다. */
  const at = src.indexOf("'<label style=\"margin:0\">경력사항 — '");
  assert.ok(at > 0, '경력사항 칸의 머리줄을 못 찾았습니다');
  const 칸 = src.slice(at, at + 700);
  assert.match(칸, /onclick="openPull\(\)/,
    '★ 경력사항 옆에 가져오는 길이 없습니다 — 맨 아래까지 굴려야 찾습니다');
});

test('ⓑ 가져오는 단추는 «하나»다 — 이름이 둘이면 두 기능처럼 보인다', () => {
  /* ⚠ 2026-09-06 이 검사를 뒤집었다.
     원래는 «두 곳에 다 있어야» 했다 — PC 에서 아래 단추줄로 일하던 손버릇을
     안 뺏으려고 일부러 겹쳐 두었다. 그런데 이름을 다르게 지어 놓았다:
       아래 단추줄 「경력관리에서 «당겨오기»」 · 경력사항 옆 「⤓ 경력관리에서 «가져오기»」.
     같은 openPull 인데 «다른 기능»으로 보였고, 대표께서 그것을 「겹침」으로 짚으셨다.
     겹쳐 둘 것이면 이름이 같아야 한다 — 그럴 바에는 칸 옆 하나로 둔다(제 자리다).
     ★ 지킬 것은 「두 곳에 있는가」가 아니라 «칸 옆에서 바로 가져올 수 있는가»다.
       그 규칙은 위 ⓐ 검사가 지킨다. */
  assert.equal((src.match(/onclick="openPull\(\)"/g) || []).length, 1,
    '★★ 가져오는 단추가 둘입니다 — 같은 일인데 두 기능처럼 보입니다');
  /* 이름은 «사람이 보는 곳»에서 하나여야 한다 — 주석과 로그는 상관없다.
     주석에는 왜 뗐는지가 적혀 있어야 하므로 걷어내고 본다. */
  const 알맹이 = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
  assert.ok(!/>경력관리에서 당겨오기</.test(알맹이) && !/경력관리에서 당겨오기<\/h2>/.test(알맹이),
    '★ 옛 이름(당겨오기)이 화면에 남아 있습니다 — 「가져오기」와 같은 일입니다');
});

test('ⓒ 한 갈래를 통째로 고르고 풀 수 있다', () => {
  assert.match(src, /function pullAll\(on\)/, '전부 고르는 함수가 없습니다');
  assert.match(src, /window\.pullAll = pullAll/, '화면에서 부를 수 없습니다');
  assert.match(src, /onclick="pullAll\(1\)"/, '「전부 고르기」 단추가 없습니다');
  assert.match(src, /onclick="pullAll\(0\)"/, '「고른 것 풀기」 단추가 없습니다');
});

/* ⓓ 진짜 함수를 떼어 돌린다 — 「이 갈래만」인지 눈으로 보지 말고 재어 본다.
   ★ 2026-09-05: pullAll 이 «보이는 것»만 고르게 바뀌었다(찾기·깔때기).
     그래서 거르는 부품(pullVisible·pullPass·찾기꼴)도 함께 떼어 온다 —
     가짜로 대신하면 «보이는 것만 고른다»는 새 규칙을 아무도 안 지킨다. */
function 떼기(이름) {
  const at = src.search(new RegExp('^function ' + 이름 + '\\(', 'm'));
  assert.ok(at > 0, 이름 + ' 을 못 찾았습니다');
  return src.slice(at, src.indexOf('\n}', at) + 2);
}

function 골라보기(옵션) {
  const o = 옵션 || {};
  const ctx = {
    Pull: { kind: 'wiccok', sel: {}, items: { wiccok: ['가', '나', '다'], cert: ['A', 'B'] },
            q: o.q || '', f: o.f || '' },
    renderPull() {},
    todayString: () => '2026-09-05',
    /* 바깥 부품은 가짜로 — 우리가 재는 것은 «고르는 규칙»이다 */
    toCareerItem: (it) => it,
    kindHasPeriod: () => true,
    itemWhen: (it) => String(o.when ? o.when[it] || '' : ''),
    PuHomeCareer: { toLine: (it) => ({ text: String(it),
      ended: !!(o.ended && o.ended.indexOf(it) >= 0),
      unknown: !!(o.unknown && o.unknown.indexOf(it) >= 0) }) },
    String, Object, Array, Number, Boolean
  };
  vm.createContext(ctx);
  vm.runInContext(떼기('찾기꼴') + '\n' + 떼기('pullPass') + '\n'
    + 떼기('pullVisible') + '\n' + 떼기('pullAll'), ctx);
  return ctx;
}

test('★ⓓ 「전부 고르기」는 «이 갈래만» 고른다 — 자격증이 딸려 들어가면 안 된다', () => {
  const ctx = 골라보기();
  vm.runInContext('pullAll(1)', ctx);
  assert.deepEqual(Object.keys(ctx.Pull.sel).sort(),
    ['wiccok:0', 'wiccok:1', 'wiccok:2'],
    '★ 보고 있지도 않은 갈래까지 골랐습니다 — 나중에 하나씩 지워야 합니다');
});

test('고른 것을 다시 풀 수 있다 — 다른 갈래는 그대로 둔다', () => {
  const ctx = 골라보기();
  ctx.Pull.sel['cert:0'] = true;          /* 다른 갈래에서 이미 골라 둔 것 */
  vm.runInContext('pullAll(1)', ctx);
  vm.runInContext('pullAll(0)', ctx);
  assert.deepEqual(Object.keys(ctx.Pull.sel), ['cert:0'],
    '★ 풀면서 다른 갈래에서 골라 둔 것까지 지웠습니다');
});

/* ══════ ⓔ 찾기·깔때기 (대표 지시 2026-09-05) ══════
   「찾기기능 과 필터링 기능도 만들어라 깔데기기능이 좋을것 같다」 */

test('★★★ 좁혀 놓고 「고르기」를 누르면 «보이는 것»만 골라진다', () => {
  /* 찾기·깔때기로 좁혀 놓고 눌렀는데 안 보이는 것까지 골라지면,
     무엇이 들어가는지 눈으로 확인할 수 없다 — 좁혀 놓고 고르는 것이 이 단추의 까닭이다. */
  const ctx = 골라보기({ q: '나' });
  vm.runInContext('pullAll(1)', ctx);
  assert.deepEqual(Object.keys(ctx.Pull.sel), ['wiccok:1'],
    '★★★ 안 보이는 것까지 골랐습니다 — 좁힌 뜻이 사라집니다');
});

test('★★★ 걸러도 «원래 번호»를 지킨다 — 번호가 밀리면 엉뚱한 것이 들어간다', () => {
  /* 고른 것은 kind:i 로 붙드는데 그 i 는 «거르기 전» 자리다.
     거르면서 1부터 다시 매기면 체크한 것과 들어가는 것이 달라진다. */
  const ctx = 골라보기({ q: '다' });
  const 보임 = vm.runInContext('pullVisible(todayString()).map(v => v.i)', ctx);
  assert.equal(JSON.stringify(보임), '[2]',
    '★★★ 걸러진 뒤 번호를 다시 매겼습니다 — 체크한 것과 들어가는 것이 달라집니다');
});

test('★★ 깔때기 — 끝난 것만 / 하는 중인 것만 골라 볼 수 있다', () => {
  const 끝남 = 골라보기({ f: 'past', ended: ['나'] });
  assert.equal(JSON.stringify(vm.runInContext('pullVisible("x").map(v => v.i)', 끝남)), '[1]',
    '★★ 「前 끝남」이 끝난 것만 안 보여 줍니다');
  const 하는중 = 골라보기({ f: 'now', ended: ['나'] });
  assert.equal(JSON.stringify(vm.runInContext('pullVisible("x").map(v => v.i)', 하는중)), '[0,2]',
    '★★ 「現 하는 중」이 끝난 것을 걸러내지 못했습니다');
});

test('★ 찾기는 «기간»으로도 걸린다 — 연도로 좁힐 수 있어야 한다', () => {
  const ctx = 골라보기({ q: '2019', when: { 가: '2026.01.01', 나: '2019.05.01 ~ 2020.02.29', 다: '' } });
  assert.equal(JSON.stringify(vm.runInContext('pullVisible("x").map(v => v.i)', ctx)), '[1]',
    '★ 기간으로는 못 찾습니다 — 연도로 좁힐 수 없습니다');
});

test('★ 찾기는 띄어쓰기를 무시한다 — 「서산 지사」로 쳐도 「서산지사」가 걸린다', () => {
  const ctx = 골라보기({ q: ' 나 ' });
  assert.equal(JSON.stringify(vm.runInContext('pullVisible("x").map(v => v.i)', ctx)), '[1]');
});

/* ══════ ⓕ 머리 틀고정 (대표 지시 2026-09-05 「상단 틀고정」) ══════ */

const 알맹이 = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
const 알 = 알맹이(src);
function 꾸밈(고르개) {
  const 찾는것 = 고르개.replace(/\s+/g, '');
  const re = /([^{}@]+)\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(알))) {
    if (m[1].split(',').map(x => x.trim().replace(/\s+/g, '')).includes(찾는것)) return m[2];
  }
  return '';
}

test('★★★ 머리가 «붙어» 있다 — 103건을 구르면 갈래 탭·찾기가 위로 사라진다', () => {
  const css = 꾸밈('.pullhead');
  assert.ok(css, '★★ 붙는 머리의 모양(CSS)이 없다');
  assert.match(css, /position: *sticky/,
    '★★★ .pullhead 가 실제로 안 붙는다 — 이름만 「head」다');
  assert.match(css, /top: *0/, '★ 어디에 붙을지를 안 정했다');
  assert.match(css, /background/, '★★ 바탕색이 없다 — 아래 글이 머리를 «통과해» 겹쳐 보인다');
  assert.match(css, /z-index/, '★★ 층이 없다 — 목록이 머리 위로 올라온다');
  /* 갈래 탭·찾기가 그 «안»에 들어 있어야 한다 */
  const at = src.indexOf('class="pullhead"');
  assert.ok(at > 0, '★★★ 머리 그릇이 없다');
  assert.ok(src.indexOf('class="tabs"', at) > at, '★★ 갈래 탭이 머리 밖에 있다');
  assert.ok(src.indexOf('class="pullbar"', at) > at, '★★ 찾기·깔때기가 머리 밖에 있다');
});

test('★★★ 이 덧창만 위 여백을 «첫 아이»에게 넘긴다 — 안 그러면 그 틈으로 글이 비친다', () => {
  /* 2026-09-03 편집칸에서 재어 확인한 일이다: 구르는 칸이 위 여백을 갖고 있으면
     붙은 머리가 그만큼 못 덮고, 그 틈으로 목록이 비쳐 보인다(여백 12px + 테두리). */
  assert.match(src, /openModal\(h, *'stickhead'\)/,
    '★★★ 덧창에 표시를 안 준다 — 위 여백 틈으로 글이 비친다');
  const 카드 = 꾸밈('.modalCard.stickhead');
  assert.ok(카드, '★★★ stickhead 모양이 없다 — 표시만 붙고 아무 일도 안 한다');
  assert.match(카드, /padding-top: *0/,
    '★★★ 구르는 칸이 위 여백을 그대로 갖고 있다');
  assert.ok(꾸밈('.modalCard.stickhead > :first-child'),
    '★★ 여백을 빼기만 하고 첫 아이에게 안 넘겼다 — 위 숨이 통째로 사라진다');
  assert.match(꾸밈('.pullhead'), /padding-top: *[1-9]/,
    '★★ 머리의 위 숨이 «안»에 없다 — 붙은 뒤 제목이 테두리에 붙어 버린다');
  /* 다른 덧창은 그대로여야 한다 — 여기서 여백을 통째로 빼면 모든 덧창이 붙어 버린다 */
  assert.match(꾸밈('.modalCard'), /padding: *16px/,
    '★★★ 모든 덧창의 여백을 건드렸다 — 이 덧창만 바꿔야 한다');
});

test('몇 건 골랐는지 화면이 말해 준다', () => {
  assert.match(src, /이 갈래에서 ' \+ 고른수 \+ '건 골랐습니다/,
    '고른 수를 안 알려 주면 다 골랐는지 알 수 없습니다');
});

test('고른 것이 없을 때 「풀기」는 눌리지 않는다', () => {
  assert.match(src, /pullAll\(0\)"'\s*\+\s*\(고른수 \? '' : ' disabled'\)/,
    '풀 것이 없는데 눌리는 단추는 「눌러도 아무 일 없는」 단추가 됩니다');
});
