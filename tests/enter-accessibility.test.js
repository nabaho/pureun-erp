const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'enter.html'), 'utf8');

test('로그인과 포털에 주요 문서 구조가 있다', () => {
  assert.match(source, /<main class="wrap" id="mainContent">/);
  assert.match(source, /<h1 class="eyebrow">푸른노무법인 통합 로그인 시스템<\/h1>/);
  assert.match(source, /<section class="portal" id="portalView" aria-labelledby="portalHeading">/);
  assert.match(source, /<h2 id="portalHeading">업무 시스템<\/h2>/);
});

test('비밀번호와 모달 조작에 접근성 이름과 상태가 있다', () => {
  assert.match(source, /id="eyeBtn"[^>]*aria-label="비밀번호 표시"[^>]*aria-pressed="false"/);
  assert.match(source, /id="pwModal" role="dialog" aria-modal="true" aria-labelledby="pwModalTitle"/);
  assert.match(source, /id="sgModal" role="dialog" aria-modal="true" aria-labelledby="sgTitle"/);
  assert.match(source, /id="sgPendModal" role="dialog" aria-modal="true" aria-labelledby="sgPendTitle"/);
  assert.match(source, /id="sgDoneModal" role="dialog" aria-modal="true" aria-labelledby="sgDoneTitle"/);
  assert.match(source, /if\(e\.key !== 'Escape'\) return;/);
});

test('서버 상태는 고정 문구가 아니라 Firebase 연결값을 반영한다', () => {
  assert.equal(source.includes('모든 시스템 정상'), false);
  assert.match(source, /db\.ref\('\.info\/connected'\)\.on\('value'/);
  assert.match(source, /role="status" aria-live="polite"/);
  assert.match(source, /서버 연결 끊김/);
});

test('근거 없는 암호화 사양 문구를 표시하지 않는다', () => {
  assert.equal(source.includes('TLS 1.3'), false);
  assert.equal(source.includes('256-bit encrypted'), false);
  assert.match(source, /안전한 인증 연결/);
});

test('데스크톱 타일은 넓게 배치되고 키보드 순서 변경을 지원한다', () => {
  assert.match(source, /\.portal\{display:none;width:100%;max-width:920px;\}/);
  assert.match(source, /Alt\+←\/→ 키로 순서를 바꿀 수 있습니다/);
  assert.match(source, /function onTileKeyDown\(e\)/);
  assert.match(source, /t\.addEventListener\('keydown', onTileKeyDown\)/);
});
