/* 사진첩 — 돌아가는 길 (대표 보고 2026-08-07)
   "초기화면이나 직전화면으로 돌아가려고 하면 계속 헷갈린다."

   원인은 **나가는 단추가 화면마다 다른 자리에 있던 것**이다 —
   설정·휴지통은 본문 위, 걸러보기는 왼쪽 사이드바 구석. 걸러본 결과가 0장이면
   화면이 텅 비어 왼쪽 구석의 작은 단추를 못 찾는다.

   이제 나가는 길이 셋이고 셋 다 늘 같게 움직인다:
     ① 제목 누르기 → 언제나 처음 / ② Esc → 한 단계 뒤로 / ③ 본문 맨 위 띠 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'pu-photos.html'), 'utf8');

function fn(name, ctx) {
  const m = html.match(new RegExp('function ' + name + '\\([\\s\\S]*?\\n\\}'));
  assert.ok(m, name + ' 를 찾지 못했습니다.');
  vm.createContext(ctx);
  vm.runInContext(m[0], ctx);
  return ctx[name];
}
/* whereNow 는 바깥 값만 읽는 순수 함수라 그대로 돌릴 수 있다 */
function where(over) {
  const ctx = Object.assign({
    view: 'photos', oldOnly: false, needOnly: false, gridQ: '', kindTab: 'all',
    KIND_TABS: [{ key: 'card', label: '명함' }], customTabLabel: (k) => k
  }, over);
  return fn('whereNow', ctx)();
}

/* ── ① 지금 어디에 있는지 말한다 ── */
test('처음 화면에서는 띠가 안 뜬다', () => {
  assert.equal(where({}), null, '아무 데도 안 들어갔는데 나가는 띠가 뜨면 시끄럽습니다.');
});

test('★ 어느 화면에 있든 이름을 말해 준다', () => {
  assert.equal(where({ view: 'settings' }), '설정');
  assert.equal(where({ view: 'trash' }), '휴지통');
  assert.match(where({ oldOnly: true }), /보유기간 지난/);
  assert.match(where({ needOnly: true }), /확인이 필요/);
  assert.match(where({ gridQ: '삼성' }), /삼성/);
  /* ⚠ 분류 탭만 뺐다(대표 지시 2026-08-17: "이 셀 없애 달라") — 탭 줄이 바로
     위에서 지금 어느 분류인지 파랗게 보여 주고 「전체사진」 탭도 거기 있어,
     같은 말을 두 번 하는 자리였다. Esc 는 그대로 돌아간다(isFiltered 로 가른다 —
     tests/photos-tab-edit.test.js 가 그 하나를 못박는다). */
  assert.equal(where({ kindTab: 'card' }), null,
    '분류 탭에서는 띠를 안 그린다 — 탭 줄이 이미 알려 준다');
});

test('걸러보기보다 화면 이름이 먼저다', () => {
  assert.equal(where({ view: 'settings', oldOnly: true }), '설정',
    '설정에 있는데 「지난 사진 보는 중」이라고 하면 헷갈립니다.');
});

test('모르는 분류에도 터지지 않는다', () => {
  /* 분류 탭은 이제 띠를 안 그린다(위 참고) — 지킬 것은 «터지지 않는다» 이다 */
  assert.equal(where({ kindTab: '내가만든분류' }), null);
});

/* ── ② 띠가 실제로 그려지는가 ── */
test('★ 나가는 띠가 본문 맨 위 한 자리에 있다', () => {
  assert.ok(/<div id="backBar"[\s\S]{0,400}id="backBtn"[\s\S]{0,200}id="backWhere"/.test(html),
    '나가는 단추와 「지금 어디인지」가 한 띠에 있어야 합니다.');
  const m = html.match(/function renderBackBar\(\)[\s\S]*?\n\}/);
  assert.ok(m, 'renderBackBar 가 없습니다.');
  assert.ok(/bar\.style\.display = where \? 'flex' : 'none'/.test(m[0]));
  assert.ok(/backWhere'\)\.innerHTML = esc\(where\)/.test(m[0]),
    '지금 무엇을 보고 있는지 적어야 합니다.');
  /* 걸러 놓기만 하고 무엇을 하라는 말이 없으면 사람은 멈춘다.
     대표 보고(2026-08-08): "확인 필요로 체크하였다. 어떻게 하라는 건가." */
  assert.ok(/whatToDo\(\)/.test(m[0]), '다음에 할 일을 함께 적어야 합니다.');
  const w = html.match(/function whatToDo\(\)[\s\S]*?\n\}/);
  assert.ok(w, 'whatToDo 가 없습니다.');
  assert.ok(/확인했음/.test(w[0]), '확인 필요를 어떻게 치우는지 알려 줘야 합니다.');
  assert.ok(/골라서 지워/.test(w[0]), '지난 사진을 어떻게 하는지 알려 줘야 합니다.');
});

test('걸러보기를 바꾸면 띠도 따라온다', () => {
  const m = html.match(/function renderGridCount\(\)[\s\S]*?\n\}/)
         || html.match(/renderNeedBox\(\);[\s\S]{0,120}renderBackBar\(\);/);
  assert.ok(/renderNeedBox\(\);[\s\S]{0,120}renderBackBar\(\);/.test(html),
    '걸러보기를 켜고 껐는데 띠가 그대로면 안 됩니다.');
  const sv = html.match(/function showView\([\s\S]*?\n\}/);
  assert.ok(/renderBackBar\(\);/.test(sv[0]), '화면을 옮길 때도 띠를 새로 그려야 합니다.');
});

/* ── ③ 제목을 누르면 처음으로 ── */
test('★ 제목을 누르면 언제나 처음 화면', () => {
  assert.ok(/class="brand" onclick="goHome\(\)"/.test(html),
    '인터넷에서 가장 익숙한 방식입니다 — 이게 없어서 헤맸습니다.');
  const m = html.match(/function goHome\(\)[\s\S]*?\n\}/);
  assert.ok(m && /showView\('photos'\)/.test(m[0]) && /clearAllFilters\(\)/.test(m[0]),
    '화면도 걸러보기도 함께 풀려야 진짜 처음입니다.');
});

test('★ 처음으로 갈 때 걸러보기가 하나도 안 남는다', () => {
  const m = html.match(/function clearAllFilters\(\)[\s\S]*?\n\}/);
  assert.ok(m, 'clearAllFilters 가 없습니다.');
  for (const line of ['needOnly = false', 'oldOnly = false', "kindTab = 'all'", "gridQ = ''"]) {
    assert.ok(m[0].includes(line), '처음으로 갔는데 ' + line + ' 이 안 풀립니다.');
  }
  assert.ok(/\$\('q'\)/.test(m[0]), '찾기 칸의 글자도 지워야 합니다 — 안 지우면 또 걸립니다.');
});

/* ── ④ 한 단계 뒤로 ── */
test('★ 걸러보기 중이면 걸러보기만 풀고, 다른 화면이면 사진으로', () => {
  const m = html.match(/function goBack\(\)[\s\S]*?\n\}/);
  assert.ok(m, 'goBack 이 없습니다.');
  assert.ok(/if \(view !== 'photos'\) \{ showView\('photos'\); return; \}/.test(m[0]));
  assert.ok(/clearAllFilters\(\)/.test(m[0]));
});

/* 2026-08-10 다시 겨눔 — 처리를 escOnce() 하나로 모았다. 예전에는 세 곳에서
   따로 ESC 를 듣다가, 크게 보기를 닫은 처리기가 viewerId 를 비운 직후 「뒤로」
   처리기가 그 빈 값을 보고 탭까지 풀어 버렸다(대표 보고: 기타서류에서 서류를
   보다 ESC 를 누르면 전체사진으로 튄다). 지킬 것은 「한 번에 한 가지만」이다. */
test('★ Esc 는 크게 보기·팝업·카메라를 앞질러 가지 않는다', () => {
  const esc = (html.match(/function escOnce\(\)[\s\S]*?\n\}/) || [])[0];
  assert.ok(esc, 'Esc 처리를 한 곳에 모은 escOnce 가 없습니다.');
  for (const guard of ['viewerId', 'kindPopup', 'camOv', 'shareRev']) {
    assert.ok(esc.includes(guard),
      'Esc 를 눌렀을 때 ' + guard + ' 이 먼저 닫혀야 합니다 — 안 그러면 사진을 보다 말고 화면이 튑니다.');
  }
  /* ⚠ 예전에는 whereNow() 로 갈랐다. 2026-08-17 분류 탭에서 띠를 없애자
     whereNow() 가 거기서 null 이 되어 **Esc 가 같이 죽었다** — 대표가 원한 것이
     바로 그 Esc 였다. 그래서 「띠에 적을 말」과 「Esc 가 할 일이 있는가」를
     갈랐다(isFiltered). */
  assert.ok(/if \(!isFiltered\(\)\) return;/.test(esc),
    '이미 처음 화면이면 아무 일도 없어야 합니다.');
});

test('★ ESC 를 듣는 곳은 하나뿐이다 — 둘이면 한 번 누른 것이 두 가지 일을 한다', () => {
  const blocks = html.match(/addEventListener\('keydown'/g) || [];
  assert.equal(blocks.length, 1,
    'ESC 를 듣는 곳이 ' + blocks.length + '군데입니다 — 순서에 기대면 코드를 옮길 때 조용히 깨집니다.');
});

test('★ 크게 보기를 닫아도 탭·찾기는 그대로 둔다', () => {
  const esc = html.match(/function escOnce\(\)[\s\S]*?\n\}/)[0];
  const at = esc.indexOf('closeViewer()');
  assert.ok(at > 0, '크게 보기를 닫는 곳이 없습니다.');
  const line = esc.slice(esc.lastIndexOf('\n', at), esc.indexOf('\n', at));
  assert.ok(/return;/.test(line),
    '닫고 곧바로 끝내지 않으면 아래 goBack 까지 내려가 탭이 풀립니다.');
  assert.ok(esc.indexOf('goBack()') > at, '뒤로 가기는 크게 보기보다 뒤에 와야 합니다.');
});

/* ── ⑤ 결과가 0장일 때 ── */
test('★ 걸러본 결과가 0장이면 크게 안내하고 돌아갈 단추를 준다', () => {
  const m = html.match(/function renderGrid\(\)[\s\S]*?\n  const counts/);
  assert.ok(m, 'renderGrid 를 찾지 못했습니다.');
  assert.ok(/bigNote/.test(m[0]), '작은 회색 글씨만 두면 빈 화면에서 길을 잃습니다.');
  assert.ok(/onclick="goHome\(\)"/.test(m[0]), '빈 화면에 돌아갈 단추가 있어야 합니다.');
  for (const cond of ['oldOnly', 'needOnly', 'gridQ', "kindTab !== 'all'"]) {
    assert.ok(m[0].includes(cond), cond + ' 일 때의 빈 화면 안내가 없습니다.');
  }
});

test('지난 것이 0장이면 「없습니다」라고 분명히 말한다', () => {
  assert.ok(/보유기간이 지난 사진이 없습니다/.test(html),
    '0장인데 아무 말이 없으면 고장으로 보입니다.');
});

/* ── ⑥ 담당자를 못 읽으면 이유를 말한다 ── */
test('★ 담당자 정보를 못 읽으면 화면이 이유를 말한다', () => {
  const m = html.match(/function renderRetBox\(\)[\s\S]*?\n\}/);
  assert.ok(m && /if \(retError\)/.test(m[0]),
    '「-」만 보이면 규칙을 두 번 게시하고도 원인을 못 짚습니다(실제로 그랬습니다).');
  assert.ok(/permission\|denied/.test(m[0]),
    '권한 문제일 때는 규칙을 게시하라고 알려 줘야 합니다.');
  assert.ok(/사진첩의 다른 기능은 그대로/.test(m[0]),
    '앱 전체가 고장 난 것처럼 보이면 안 됩니다.');
  const l = html.match(/function loadRetention\(\)[\s\S]*?\n\}/);
  assert.ok(/retError = String/.test(l[0]) && /renderRetBox\(\)/.test(l[0]),
    '잡기만 하고 화면에 안 알리면 조용히 넘어갑니다.');
});

test('다시 읽히면 오류 안내가 사라진다', () => {
  const l = html.match(/function loadRetention\(\)[\s\S]*?\n\}/);
  assert.ok(/retError = '';/.test(l[0]), '규칙을 고친 뒤에도 빨간 글씨가 남으면 안 됩니다.');
});
