/* 규정관리 대시보드가 로그인 전 상태로 굳던 문제 (2026-08-09)

   화면에는 「보관함 (5)」와 「사업장 0곳」이 함께 떠 있었다.
   두 숫자는 같은 visibleArch() 에서 나오므로 동시에 5와 0일 수 없다.

   까닭:
     ① 페이지가 열릴 때는 아직 로그인 전이라 FBUSER 가 없다 → myUid() 는 빈 문자열
     ② isOwner(r) 는 r.ownerUid === "" 를 견주므로 내 기록까지 전부 남의 것이 된다
     ③ 그래서 첫 renderDash() 는 「등록된 사업장이 없습니다」를 그린다
     ④ 로그인이 끝나면 보관함 수는 고쳐지는데(updateArchCnt) 대시보드는 다시 안 그린다

   그래서 검사는 「로그인 뒤에 화면이 따라오는가」를 본다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'rules.html'), 'utf8');

function cut(re, what) {
  const m = html.match(re);
  assert.ok(m, what + ' 를 찾지 못했습니다.');
  return m[0];
}


/* 함수를 «중괄호를 세어» 통째로 꺼낸다.
   예전에는 한 줄만 잘라 왔다. 그 함수가 여러 줄이 되는 순간 반 토막이 실려
   조용히 깨진다 — updateArchCnt 가 보관함 개수를 두 곳에 적게 되면서 그렇게 됐다. */
function fnOf(name){
  const marker = 'function ' + name + '(';
  const start = html.indexOf(marker);
  assert.ok(start >= 0, name + ' 를 찾지 못했습니다.');
  const bodyStart = html.indexOf('{', html.indexOf(')', start));
  let d = 0;
  for (let k = bodyStart; k < html.length; k++) {
    if (html[k] === '{') d++;
    else if (html[k] === '}') { d--; if (d === 0) return html.slice(start, k + 1); }
  }
  throw new Error(name + ' 의 끝을 찾지 못했습니다.');
}

/* 보관함 데이터층(loadArch ~ visibleArch)을 통째로 떼어 진짜로 돌린다 */
function boot(user) {
  const store = {};
  const painted = [];          // renderDash 가 불린 횟수를 센다
  const badge = { textContent: '' };
  const ctx = {
    console, JSON, String, Object, Array,
    ARCH_KEY: 'arch',
    FBUSER: user || null,
    FBNAME: null,
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); }
    },
    /* 대시보드는 펼쳐져 있는 상태로 둔다 */
    $: (id) => (id === 'dash' ? { style: { display: 'block' } } : badge),
    renderDash: () => { painted.push(1); }
  };
  vm.createContext(ctx);

  const layer = cut(
    /function loadArch\(\)[\s\S]*?function visibleArch\(\)\{[^\n]*\n/,
    '보관함 데이터층(loadArch~visibleArch)'
  );
  vm.runInContext(layer.replace(/^const /gm, 'var ').replace(/^let /gm, 'var '), ctx);
  vm.runInContext(fnOf('updateArchCnt'), ctx);

  /* 고침 뒤에 생기는 함수 — 없으면 여기서 걸린다(그게 이 검사의 핵심이다) */
  const rd = html.match(/function refreshDash\(\)\{[^\n]*\}/);
  if (rd) vm.runInContext(rd[0], ctx);

  ctx.__painted = painted;
  ctx.__badge = badge;
  ctx.__hasRefreshDash = !!rd;
  return ctx;
}

/* 노무사 한 사람이 맡아 둔 기록 5건 */
const RECS = [1, 2, 3, 4, 5].map((n) => ({
  id: 'site_' + n, site: '사업장' + n, ownerUid: 'uidA', owner: 'a@x.com', status: '작업중'
}));

/* ── ① 까닭 자체를 못 박아 둔다 ── */
test('★ 로그인 전에는 내 기록도 전부 걸러진다 (이것이 0곳의 까닭)', () => {
  const c = boot(null);                       // 아직 인증 전
  c.localStorage.setItem('arch', JSON.stringify(RECS));
  assert.equal(c.visibleArch().length, 0,
    '로그인 전 0건이 아니면 이 버그의 전제가 바뀐 것이니 원인부터 다시 봐야 합니다.');
});

test('★ 로그인 뒤에는 5건이 보인다 (같은 데이터, 같은 함수)', () => {
  const c = boot({ uid: 'uidA', email: 'a@x.com' });
  c.localStorage.setItem('arch', JSON.stringify(RECS));
  assert.equal(c.visibleArch().length, 5,
    '로그인했는데도 안 보이면 소유 규칙이 따로 깨진 것입니다.');
});

/* ── ② 진짜 고쳐야 하는 것 ── */
test('★ 보관함이 갱신되면 대시보드도 따라 그려진다', () => {
  const c = boot({ uid: 'uidA', email: 'a@x.com' });
  assert.ok(c.__hasRefreshDash, 'refreshDash() 가 없습니다 — 대시보드를 다시 그릴 길이 없습니다.');
  c.setLocal(RECS);                            // 로그인 완료 후 동기화가 하는 일
  assert.equal(c.__badge.textContent, '(5)', '보관함 수가 5로 갱신되어야 합니다.');
  assert.equal(c.__painted.length, 1,
    '보관함 수만 고치고 대시보드를 안 그리면 「보관함 (5)」와 「0곳」이 또 어긋납니다.');
});

test('대시보드를 접어 두었으면 굳이 그리지 않는다', () => {
  const c = boot({ uid: 'uidA', email: 'a@x.com' });
  c.$ = (id) => (id === 'dash' ? { style: { display: 'none' } } : c.__badge);
  c.setLocal(RECS);
  assert.equal(c.__painted.length, 0, '접힌 화면을 그리면 헛일입니다.');
});

test('★ 보관함 쓰기는 setLocal 한 곳뿐이어야 한다 (두 숫자가 다시 어긋나지 않게)', () => {
  const writes = html.match(/localStorage\.setItem\(ARCH_KEY/g) || [];
  assert.equal(writes.length, 1,
    'ARCH_KEY 를 여러 곳에서 쓰면 갱신을 빠뜨리는 자리가 다시 생깁니다.');
});

/* ── ③ 작성중 문서도 로그인 뒤에 다시 읽어야 한다 ── */
test('★ 로그인이 끝나면 작성중 문서를 다시 읽는다', () => {
  const auth = cut(/onAuthStateChanged\(u=>\{[\s\S]*?\n\}\);/, '인증 처리부');
  assert.ok(/loadDrafts\(\)/.test(auth),
    '로그인 전 loadDrafts() 는 FBUSER 가 없어 클라우드 문서를 못 읽습니다 — 인증 뒤 한 번 더 읽어야 합니다.');
});

/* ── ④ 사업자번호를 잃지 않아야 ERP 가 붙는다 ── */
test('★ 임시저장이 사업자번호를 함께 담는다', () => {
  const mk = cut(/function saveWorkFromUpload\([\s\S]*?\n\}/, 'saveWorkFromUpload');
  assert.ok(/bizno:/.test(mk),
    '사업자번호를 안 담으면 복원 뒤 상호명으로만 찾게 되어 ERP 매칭이 자주 빗나갑니다.');
});

test('★ 복원할 때 사업자번호를 되살린다', () => {
  const apply = cut(/async function applyWorkObject\([\s\S]*?\r?\n\}\r?\nasync function restoreWork/, 'applyWorkObject');
  assert.ok(!/SITE_BIZNO\[key\]="";/.test(apply),
    '복원하면서 사업자번호를 빈 값으로 지우면 번호 우선 매칭이 무력화됩니다.');
  assert.ok(/SITE_BIZNO\[key\]=o\.bizno/.test(apply), '보관해 둔 사업자번호를 되살려야 합니다.');
  assert.ok(/bizno:\s*o\.bizno/.test(apply), 'LAST.bizno 에도 실어야 findErpCompany 가 번호로 찾습니다.');
});
