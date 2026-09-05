/* 경력관리 — 서류 작업 화면: 도구는 왼쪽 기둥, 문서는 위아래로 꽉 (대표 지시 2026-09-05 「안 A」)

   ■ 무엇이 문제였나
     대표 제보: 「경력관리 계속 화면에 한글 내용이 안 보인다. A4 화면 전체가 다 나와야 되는데」
     실측(1600×900): 종이 칸 684px · A4 종이 1123px → 아래 439px 이 늘 잘려 있었다.
     ⑴ #kfSheetWrap{max-height:min(76vh,960px)} 로 칸이 못 박혀 있었고
     ⑵ 그 위에 탭줄·보관함 줄·편집 툴바 «세 층»이 먼저 자리를 먹었다.

   ■ 어떻게 고쳤나 (셋이 함께여야 한다 — 하나라도 빠지면 여전히 잘린다)
     ⑴ 카드를 화면 높이만큼 (--rhTop 을 «재서» 뺀다)
     ⑵ 툴바를 왼쪽 세로 기둥으로 (DOM 은 안 옮긴다)
     ⑶ 종이를 칸에 맞춰 줄인다 (⬍ 한 장 맞춤)

   ■ 실측으로 확인한 일곱 상태 (1600×900, 가짜 A4 3장)
     보통 684px/1123px 안 보임 → 작업 모드 문서칸 1026×715 · 종이 486×687 «다 보임» ·
     2쪽 넘김 · 폭 맞춤 · 100% · 다시 한 장 · 작업 모드 끄기 전부 정상. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { cutFn } = require('./cut-fn');

const source = fs.readFileSync(path.join(__dirname, '..', 'kcareer.html'), 'utf8');
const bare = source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');

test('★★ 도구가 «왼쪽 기둥»이 된다 — DOM 을 옮기지 않고', () => {
  /* ⚠ .rc-bar 는 이미 카드의 첫 자식이다. flex 로 세우면 그대로 왼쪽 기둥이 된다.
     자리를 옮기면 이 카드를 가리키는 다른 코드(>div:last-child 등)가 흔들린다. */
  assert.match(source, /#rcEditCard\.rh-work\{display:flex/);
  assert.match(source, /#rcEditCard\.rh-work>\.rc-bar\{flex:0 0 196px[^}]*flex-direction:column/);
  assert.match(source, /#rcEditCard\.rh-work \.kf-modes,\s*#rcEditCard\.rh-work \.rc-actions\{display:flex;flex-direction:column/);
  /* 문서와 서랍은 오른쪽 한 덩어리 안에서 갈린다 */
  assert.match(source, /#rcEditCard\.rh-work>div:last-child\{flex:1[^}]*grid-template-columns:1fr 300px/);
});

test('★★ 종이 칸의 «못 박힌 높이»를 푼다 — 이것이 잘림의 몸통이었다', () => {
  /* 평소 규칙은 그대로 둔다(다른 화면이 쓴다). 작업 모드에서만 푼다. */
  assert.match(source, /#kfSheetWrap\{[^}]*max-height:min\(76vh,960px\)/, '평소 규칙은 남아 있어야 합니다');
  assert.match(source, /#rcEditCard\.rh-work #kfSheetWrap\{[^}]*max-height:none/,
    '★ 이 한 줄이 없으면 무엇을 해도 A4 가 잘립니다');
});

test('★★ 쌓인 높이는 «재서» 쓴다 — 고정값을 박으면 좁은 화면에서 밀린다', () => {
  const fn = cutFn(bare, 'function rhWorkTop(');
  assert.match(fn, /getBoundingClientRect\(\)\.top/);
  assert.match(fn, /setProperty\('--rhTop'/);
  assert.match(source, /height:calc\(100vh - var\(--rhTop,170px\) - 14px\)/);
});

test('★★ 「한 장 맞춤」이 기본이다 — 폭만 맞추면 세로가 넘친다', () => {
  /* 폭 맞춤만 있던 것이 「A4 전체가 안 나온다」의 나머지 절반이었다. */
  assert.match(source, /var _rhFit='page', _rhPage=0;/);
  const fn = cutFn(bare, 'function rhApplyFit(');
  assert.match(fn, /Math\.min\(availW\/pw, availH\/ph\)/, '★ 가로·세로 중 빡빡한 쪽에 맞춰야 합니다');
  assert.match(source, /id="rhFitPage" class="on"/, '처음 켜진 단추도 「한 장」이어야 합니다');
});

test('★★ 크기는 zoom 으로 준다 — 종이 위 입력칸이 함께 줄어야 한다', () => {
  /* ⚠ transform 은 자리(layout)를 안 줄여 칸 밖으로 넘치고,
     캔버스만 줄이면 그 위에 떠 있는 입력칸이 제자리에 남아 어긋난다. */
  const fn = cutFn(bare, 'function rhApplyFit(');
  assert.match(fn, /x\.style\.zoom = z/);
  assert.doesNotMatch(fn, /style\.transform\s*=/, '★ transform 으로 바꾸지 마세요');
});

test('★★ 본디 크기는 style 에 적힌 px 로 읽는다 — 잰 값을 쓰면 잴 때마다 작아진다', () => {
  /* zoom 이 걸린 뒤 getBoundingClientRect 로 재면 이미 줄어든 값이 나와,
     맞출 때마다 종이가 계속 작아진다. */
  const fn = cutFn(bare, 'function rhApplyFit(');
  assert.match(fn, /parseFloat\(el\.style\.width\)/);
  assert.match(fn, /parseFloat\(el\.style\.height\)/);
});

test('★★ 종이를 새로 그린 뒤에는 반드시 다시 맞춘다', () => {
  /* 안 하면 채우기·모드 전환 때마다 본디 크기로 돌아가 또 잘린다. */
  assert.match(cutFn(bare, 'async function rhBuildInput('), /rhSetMode\("in"\);\s*_safe\(rhApplyFit\)/);
  assert.match(cutFn(bare, 'function rhSetMode('), /rhPreviewHwp\(\);\s*_safe\(rhApplyFit\)/);
  assert.match(bare, /addEventListener\('resize', function\(\)\{ _safe\(rhWorkTop\); _safe\(rhApplyFit\); \}\)/);
});

test('★★ 한글 서식을 열면 작업 모드로 들어간다 — 이것이 기본이다', () => {
  assert.match(bare, /rh-doc-on', _isHwp\);[\s\S]{0,200}rhWorkSet\(_isHwp\)/);
});

test('★★ 감춘 두 줄로 «돌아가는 길»이 있다 — 없으면 다른 양식을 못 올린다', () => {
  /* 작업 모드에서 보관함 줄·올리기 줄을 감춘다. 감추기만 하고 길을 안 내면 막다른 길이 된다. */
  assert.match(source, /body\.rh-work-on #rcTplLib,body\.rh-work-on #rhUploadBar\{display:none!important\}/);
  assert.match(source, /id="rhWorkBtn" onclick="rhWorkToggle\(\)"/, '켜고 끄는 단추가 있어야 합니다');
  assert.match(cutFn(bare, 'function rhWorkSet('), /rhWorkBtn[\s\S]{0,120}작업 모드 끄기/);
  /* 올리기는 «감춰 둔 진짜 단추»를 대신 누른다 — 새로 만들면 끌어놓기·보관함 담기가 갈라진다 */
  assert.match(cutFn(bare, 'function rhRailUpload('), /getElementById\('rcDrop'\)[\s\S]{0,40}click\(\)/);
});

test('★ 쪽 넘김은 «한 장 맞춤이고 여러 쪽일 때만» 뜬다', () => {
  const fn = cutFn(bare, 'function _rhPgLabel(');
  assert.match(fn, /_rhFit==='page' && total>1/);
  assert.match(source, /onclick="rhPageMove\(-1\)"/);
  assert.match(source, /onclick="rhPageMove\(1\)"/);
});

test('★ 기둥 전용 칸은 작업 모드에서만 — 평소 툴바에 끼면 줄이 길어진다', () => {
  assert.match(source, /\.rh-workonly\{display:none\}/);
  assert.match(source, /#rcEditCard\.rh-work \.rh-workonly\{display:block\}/);
});
