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
