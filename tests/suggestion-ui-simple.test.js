const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'enter.html'), 'utf8');

test('건의함 목록은 핵심 건수·상태·검색·기간을 한 화면에 간결하게 둔다', () => {
  assert.match(html, /class="sg-list-count"/);
  assert.match(html, /class="sg-list-tabs"/);
  assert.match(html, /id="sgListSearch"/);
  assert.match(html, /id="sgPeriodSelect"/);
  assert.doesNotMatch(html, /class="sg-sum"/);
  assert.doesNotMatch(html, /\('\+cnt\+'건\)/);
});

test('건의 목록 카드는 제목을 먼저 보여주고 상세 이동 표시가 있다', () => {
  assert.match(html, /\.sg-item::after\{content:'›'/);
  assert.match(html, /<div class="sg-itl">'\+sgEsc\(s\.title\)/);
  assert.match(html, /<div class="sg-meta"><span class="sg-badge/);
});

test('상세 화면은 처리와 자동개발을 분리하고 자동개발은 기본 접힘이다', () => {
  assert.match(html, /<details class="sg-section" open><summary>✅ 처리하기/);
  assert.match(html, /<details class="sg-section" id="sgDevBox"><summary>🤖 자동개발/);
  assert.doesNotMatch(html, /id="sgDevBox" open/);
  assert.match(html, /class="sg-back" id="sgBackList2"/);
});

test('휴대폰에서는 건의함이 화면 전체를 사용한다', () => {
  assert.match(html, /#sgModal\{padding:0;align-items:stretch;\}/);
  assert.match(html, /height:100dvh;max-height:none;border-radius:0/);
  assert.match(html, /body\.sg-modal-open\{overflow:hidden;\}/);
  assert.match(html, /document\.body\.classList\.add\('sg-modal-open'\)/);
});

/* ⚠ 2026-08-15 뒤집었다 — 예전에는 「헤더 폭과 무관하게 화면에 띄운다」가 목표였다.
   그런데 띄운 자리(오른쪽 아래 78px)가 pu-version.js 의 「최신」(96px)과 물렸고,
   일부 삼성·네이버 브라우저는 fixed 좌표를 무시하고 단추를 헤더 자리로 되돌려
   화면 위에서 잘랐다. !important 로도 막지 못했다.
   그래서 폰에서는 헤더 카드 안(로그아웃 옆)에 두고, 대신 헤더가 두 줄로 꺾이도록 했다. */
test('휴대폰 건의하기 버튼은 헤더 카드 안에 있다', () => {
  assert.match(html, /#sgFab\{position:relative;display:inline-flex;/);
  // PC용 `.pbar #sgFab{order:4}` 를 이기려면 같은 우선순위로 적어야 로그아웃 옆에 선다
  assert.match(html, /\.pbar #sgFab\{order:0;/);
  assert.match(html, /\.sg-tip\{display:none!important;\}/);
  // 헤더가 좁아지면 아래 줄로 꺾여야 단추가 밀려 잘리지 않는다
  assert.match(html, /\.pbar\{flex-wrap:wrap;/);
});

test('일반 사용자는 건의 작성 안내만 보고 전체 목록과 상세에는 들어가지 못한다', () => {
  assert.match(html, /sgIsAdmin\(\)\?sgViewList\(\):sgViewMemberHome\(\)/);
  assert.match(html, /건의의 제목·내용·첨부파일은 관리자만 확인합니다/);
  assert.match(html, /function sgViewDetail\(id\)\{\s*if\(!sgIsAdmin\(\)\)\{ sgViewMemberHome\(\); return; \}/);
  assert.match(html, /if\(!sgIsAdmin\(\)\)\{ box\.innerHTML=''; return; \}/);
});

/* ⚠ 2026-08-15 뒤집었다 — 예전에는 이 검사가 「firebase.json 이 규칙 파일을
   배포하게 되어 있다」를 못 박았다. 그런데 그 설정이 살아 있는 규칙을 지웠다:
   저장소의 규칙 파일에는 실제로 쓰이는 칸(puphotos·pucards_private·paydata)이
   빠져 있어서, 배포하는 순간 사진첩·기업정보함·급여데이터함이 통째로 먹통이 된다
   (규칙은 없으면 거부다).
   **콘솔이 원본이고 저장소 파일은 사본이다.** 사본으로 원본을 덮을 수 없으므로
   8a9122a 에서 database 항목을 뺐고, 이제 firebase deploy 는 함수만 올린다.
   그래서 이 검사도 반대를 지킨다 — 누가 다시 넣으면 여기서 걸린다. */
test('★ Firebase 배포 설정이 실시간DB 규칙을 건드리지 않는다 (콘솔이 원본)', () => {
  const firebase = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'firebase.json'), 'utf8'));
  assert.equal(firebase.database, undefined,
    'firebase.json 에 database 항목이 있으면 배포가 살아 있는 규칙을 덮어써 여러 앱이 먹통이 됩니다.');
});

/* 콘솔에 붙여넣는 파일이 원본이므로, 건의함이 관리자 전용인지는 그 파일에서 확인한다. */
test('붙여넣기용 규칙에서 건의 원문·메타는 관리자만 읽는다', () => {
  const rules = JSON.parse(fs.readFileSync(
    path.resolve(__dirname, '..', 'docs', 'firebase-rules-급여데이터함-포함(붙여넣기용).json'), 'utf8')).rules;
  for (const node of ['suggestions_private', 'suggestions_meta_private']) {
    assert.match(rules[node]['.read'], /isAdmin'\)\.val\(\) == true/, node + ' 읽기는 관리자 전용이어야 한다');
  }
});

test('건의 원문과 처리결과는 상위 data 권한의 영향을 받지 않는 비공개 경로를 사용한다', () => {
  assert.match(html, /SG_PRIVATE_PATH = 'suggestions_private'/);
  assert.match(html, /SG_META_PRIVATE_PATH = 'suggestions_meta_private'/);
  assert.match(html, /SG_RESOLVED_PRIVATE_PATH = 'suggestions_resolved_private'/);
  assert.match(html, /function sgEnsurePrivateMigration\(\)/);
  assert.match(html, /updates\['data\/suggestions'\]=null/);
  assert.doesNotMatch(html, /db\.ref\('data\/suggestions'\)\.push\(\)/);
});
