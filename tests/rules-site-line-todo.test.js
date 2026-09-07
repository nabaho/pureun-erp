/* 규정관리 «사업장 줄» — 내가 이어서 할 곳만 (대표 결정 2026-09-07)
   목업 docs/mockups/2026-09-07-사업장줄-검토안.html

   ■ 무엇이 문제였나
   대표 지시 「사업장이 여러 개가 계속 이렇게 나오면 너무 많이 개수가 발생해서 관리가 어렵다」.
   실측 — 1900px 화면에서 칩은 «12개까지만» 보인다(칩 평균 124px · 줄 폭 1583px).
   구조상 원인 셋:
     ㉠ 아무것도 안 빠진다 — 「신고완료」가 되어도 줄에 그대로 남는다
     ㉡ **남의 끝난 일이 앞자리를 먹는다** — 신고(filedAt)가 없으면 dashStage 가
        «검토완료»로 분류해 앞쪽에 섞인다. 34곳 중 12곳이 그것이었고 「검토 15」가 헛말이 됐다
     ㉢ 정렬은 이미 급한 순이라 뒤쪽 두 무리만 접어도 대부분 들어온다

   ■ 대표 결정
     ㉠ **남의 완료본은 줄에서 뺀다** — 「내 할 일만 보이게」
     ㉡ **핀은 안 만든다** — 「안 쓴다. 버리고 단순하게」

   ■ 지키는 규칙
     ① 줄에는 개정중·검토완료·작성중 «내 것»만
     ② 집계는 **전체 곳수를 그대로** 말한다 — 접었다고 개수까지 감추면 접기 전보다 나쁘다
     ③ 접은 것이 있으면 «반드시» 말한다 — 조용히 줄면 「내 사업장이 사라졌다」가 된다
     ④ 그 단추는 **구르는 줄 밖**이다 — 안에 두면 칩과 함께 밀려 사라진다(목업 ㉡)
     ⑤ 여는 길은 «이미 있는 전체 보기» 하나 — 새 창을 만들지 않는다
     ⑥ 핀은 «없다»
   실행: node --test tests/rules-site-line-todo.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
/* 줄끝은 «읽을 때 한 번» 고른다 — 이 저장소는 윈도우에서 CRLF 로 내려온다
   (STATUS.md 「CI 는 초록인데 내 컴퓨터는 빨갛다」). */
const RAW = fs.readFileSync(path.join(ROOT, 'rules.html'), 'utf8').replace(/\r\n/g, '\n');

/* 잘라 낼 함수 — 중괄호를 세어 진짜 끝을 찾는다 */
function cut(decl) {
  const at = RAW.indexOf(decl);
  assert.ok(at > 0, decl + ' 을 못 찾았습니다');
  let i = RAW.indexOf('{', at + decl.length), d = 0;
  for (; i < RAW.length; i++) {
    if (RAW[i] === '{') d++;
    else if (RAW[i] === '}') { d--; if (!d) return RAW.slice(at, i + 1); }
  }
  throw new Error(decl + ' 의 끝을 못 찾았습니다');
}

/* ── 판정을 «실제로 돌려» 본다 ── */
function 판(myUid) {
  const ctx = { console: { warn() {}, log() {} }, myUid: () => myUid || 'me',
    myEmail: () => 'me@x', sameUser: (a, b) => a === b };
  vm.createContext(ctx);
  vm.runInContext(RAW.slice(RAW.indexOf('const isOwner='), RAW.indexOf('\n', RAW.indexOf('const isDone='))), ctx);
  vm.runInContext(RAW.match(/const DASH_TODO_K=\{[^}]*\};/)[0], ctx);
  vm.runInContext(cut('function dashTodo('), ctx);
  return ctx;
}
const 줄 = (k, over) => Object.assign({ stage: { k: k } }, over || {});

/* ── ① 줄에 남는 것 ── */
test('★ 이어서 할 것만 남는다 — 개정중·검토완료·작성중', () => {
  const c = 판();
  ['amending', 'reviewed', 'draft'].forEach(function (k) {
    assert.equal(c.dashTodo(줄(k)), true, k + ' 이 빠졌습니다 — 할 일이 안 보입니다');
  });
  ['filed', 'none'].forEach(function (k) {
    assert.equal(c.dashTodo(줄(k)), false,
      '★ ' + k + ' 가 줄에 남습니다 — 「아무것도 안 빠진다」가 그대로입니다');
  });
});

test('★★ 남의 완료본은 «검토완료로 보여도» 뺀다 — 34곳 중 12곳이 그것이었다', () => {
  const c = 판('me');
  /* 신고(filedAt)가 없어 dashStage 가 검토완료로 분류한 «남의» 기록 */
  const 남의것 = 줄('reviewed', { rec: { ownerUid: 'other', status: '완료' } });
  assert.equal(c.dashTodo(남의것), false,
    '★★ 남의 완료본이 앞자리를 먹습니다 — 집계 「검토 15」가 헛말이 됩니다');
  const 내것 = 줄('reviewed', { rec: { ownerUid: 'me' } });
  assert.equal(c.dashTodo(내것), true, '★ 내 것을 뺐습니다 — 할 일이 사라집니다');
});

test('초안만 있는 줄은 «내 것»이다 — 이 기기에 있는 것이라 주인이 없다', () => {
  const c = 판();
  assert.equal(c.dashTodo(줄('draft', { draft: { name: '가' } })), true,
    '초안이 빠지면 작성 중인 것을 못 이어갑니다');
});

test('빈 줄·모르는 갈래는 안 넣는다', () => {
  const c = 판();
  [null, undefined, {}, 줄('nosuch')].forEach(function (v) {
    assert.equal(c.dashTodo(v), false, '엉뚱한 것이 줄에 들어갑니다: ' + JSON.stringify(v));
  });
});

/* ── ② 집계는 전체를 그대로 ── */
test('★★ 집계가 «전체 곳수»를 그대로 말한다 — 접었다고 개수까지 감추면 더 나쁘다', () => {
  const fn = cut('function renderDash(');
  assert.match(fn, /all\.length\+"곳"/,
    '★★ 전체 곳수를 안 말합니다 — 접은 것이 아예 없는 것처럼 보입니다');
  /* ⚠ 「할 일」이라는 낱말만 보면 안 된다 — 「할 일 없음」에도 그 낱말이 있어
     숫자를 지워도 통과했다(고장넣기에서 확인). «몇 곳인지»를 못 박는다. */
  assert.match(fn, /할 일 "\+todo\.length/, '할 일이 «몇 곳»인지 안 말합니다');
  assert.match(fn, /할 일 없음/, '할 일이 없을 때 그렇다고 안 말합니다');
  /* 갈래 집계(개정·검토·작성)는 «할 일»만 센다 — 그래야 「검토 15」가 안 나온다 */
  assert.match(fn, /todo\.forEach\(r=>cnt\[r\.stage\.k\]\+\+\)/,
    '★ 갈래 집계를 전체로 셉니다 — 남의 완료본이 「검토」에 섞입니다');
  assert.ok(!/if\(cnt\.filed\)parts\.push/.test(fn),
    '신고완료를 할 일 집계에 넣었습니다 — 그것은 할 일이 아닙니다');
});

/* ── ③④⑤ 접은 것을 말하는 단추 ── */
test('★★ 접은 것이 있으면 «반드시» 말한다', () => {
  const fn = cut('function renderDash(');
  assert.match(fn, /접은수=all\.length-todo\.length/, '접은 수를 안 셉니다');
  assert.match(fn, /＋'\+접은수\+'곳 더/,
    '★★ 접었다는 말을 안 합니다 — 「내 사업장이 사라졌다」가 됩니다');
  assert.match(fn, /display=접은수\?"":"none"/, '접은 것이 없어도 단추가 남습니다');
});

test('★★ 그 단추는 «구르는 줄 밖»이다 — 안에 두면 밀려 사라진다', () => {
  /* 자리: #dash-list 는 overflow-x:auto 다. 단추는 그 «형제»여야 한다. */
  const i = RAW.indexOf('id="dash-list"');
  const j = RAW.indexOf('id="dash-more-wrap"');
  const k = RAW.indexOf('id="dash-all"');
  assert.ok(i > 0 && j > i, '★★ 단추 자리가 줄 밖에 없습니다');
  assert.ok(j < k, '전체 보기보다 앞에 두어야 손이 가까이 옵니다');
  /* 줄 자체는 여전히 구른다 — 그것을 없애면 높이가 늘어난다 */
  assert.match(RAW.slice(i, i + 130), /overflow-x:auto/, '줄이 더 이상 구르지 않습니다');
  /* 그리는 자리도 줄이 아니라 그 형제여야 한다 */
  const fn = cut('function renderDash(');
  assert.match(fn, /\$\("dash-more-wrap"\)/, '단추를 줄 안에 그립니다');
  assert.ok(!/list\.innerHTML=[^;]*dash-more/.test(fn),
    '★★ 단추를 구르는 줄 안에 넣었습니다 — 칩과 함께 밀려 사라집니다');
});

test('★ 여는 길은 «이미 있는 전체 보기» 하나 — 새 창을 만들지 않는다', () => {
  const fn = cut('function renderDash(');
  assert.match(fn, /\$\("dash-all"\)[\s\S]{0,40}click\(\)/,
    '★ 접은 것을 여는 길이 없거나 새 창을 만들었습니다');
  assert.match(RAW, /id="dash-all"/, '전체 보기 단추가 사라졌습니다');
});

test('단추에 «무엇이 접혔는지» 적는다 — 숫자만 있으면 무엇인지 모른다', () => {
  const fn = cut('function renderDash(');
  const i = fn.indexOf('dash-more');
  const seg = fn.slice(i, i + 300);
  ['신고완료', '미작성', '완료본'].forEach(function (w) {
    assert.ok(seg.indexOf(w) >= 0, '접힌 것에 「' + w + '」이 있다고 안 알려 줍니다');
  });
});

/* ── ⑥ 핀은 없다 ── */
test('★ 핀은 «안 만들었다» (대표 결정 「안 쓴다」)', () => {
  /* 설계에는 있었지만 쓰지 않기로 하셨다 — 쓰지 않는 기능은 화면만 어지럽힌다.
     ⚠ 「📌」는 다른 뜻으로도 쓰인다(증빙 표시 등) — 사업장 줄 자리에서만 본다. */
  const fn = cut('function renderDash(');
  assert.ok(!/pin|📌/i.test(fn), '★ 핀이 사업장 줄에 들어갔습니다 — 안 쓰기로 하셨습니다');
  const md = cut('function renderDashModal(');
  assert.ok(!/dashPin|togglePin|pinned/i.test(md),
    '★ 전체 보기에 핀이 들어갔습니다 — 안 쓰기로 하셨습니다');
});

/* ── 줄에 안 보이는 것도 «열 수는» 있어야 한다 ── */
test('★★ 접힌 사업장도 전체 보기에서는 그대로 보인다 — 가린 것이 아니다', () => {
  const md = cut('function renderDashModal(');
  assert.match(md, /dashRows\(\)/, '전체 보기가 전체를 안 읽습니다');
  assert.ok(!/dashTodo/.test(md),
    '★★ 전체 보기까지 걸렀습니다 — 접힌 사업장을 여는 길이 아예 없어집니다');
});

test('줄이 고르는 것과 여는 것이 «같은 목록»을 본다 — 엉뚱한 곳이 열리면 안 된다', () => {
  const fn = cut('function renderDash(');
  assert.match(fn, /DASH_VIEW=todo/,
    '보이는 것과 여는 것이 어긋납니다 — 칩을 눌러 다른 사업장이 열립니다');
});
