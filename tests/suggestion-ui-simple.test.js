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
  assert.match(html, /max-height:100dvh;border-radius:0/);
});

test('일반 사용자는 건의 작성 안내만 보고 전체 목록과 상세에는 들어가지 못한다', () => {
  assert.match(html, /sgIsAdmin\(\)\?sgViewList\(\):sgViewMemberHome\(\)/);
  assert.match(html, /건의의 제목·내용·첨부파일은 관리자만 확인합니다/);
  assert.match(html, /function sgViewDetail\(id\)\{\s*if\(!sgIsAdmin\(\)\)\{ sgViewMemberHome\(\); return; \}/);
  assert.match(html, /if\(!sgIsAdmin\(\)\)\{ box\.innerHTML=''; return; \}/);
});

test('Firebase 배포 설정은 관리자 전용 건의 규칙 파일을 사용한다', () => {
  const firebase = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'firebase.json'), 'utf8'));
  assert.equal(firebase.database.rules, 'docs/firebase-rules-3순위-포털권한.json');
});

test('건의 원문과 처리결과는 상위 data 권한의 영향을 받지 않는 비공개 경로를 사용한다', () => {
  assert.match(html, /SG_PRIVATE_PATH = 'suggestions_private'/);
  assert.match(html, /SG_META_PRIVATE_PATH = 'suggestions_meta_private'/);
  assert.match(html, /SG_RESOLVED_PRIVATE_PATH = 'suggestions_resolved_private'/);
  assert.match(html, /function sgEnsurePrivateMigration\(\)/);
  assert.match(html, /updates\['data\/suggestions'\]=null/);
  assert.doesNotMatch(html, /db\.ref\('data\/suggestions'\)\.push\(\)/);
});
