/* 환경설정 여섯 탭의 «결»을 맞춘다 (대표 화면 2026-09-05)
   「전체적으로 내부가 통일이 안 되어 있다 — 형태를 일치시키고 디자인도 일치시켜달라」

   ■ 무엇이 달랐나 (대표 화면에서 잰 것)
     · 데이터·이알피·탭·계정 탭 — .setpanel 격자 안의 .setbtn 카드 (한 줄에 두셋)
     · 정리 탭 — 같은 .setbtn 인데 혼자 «전폭 줄»로 깔렸다.
       까닭: 그 탭만 내용이 #setInline(격자 «칸 하나», grid-column:1/-1) 바로 밑에 있어
       격자가 아니라 «블록»으로 쌓였다.
     · 탭·자료의 「내 탭 관리」 — 팝업 차림새가 그대로 들어왔다(.mhead 17px,
       .ditem 밑줄 #1e293b — 어두운 팝업용 색이라 흰 설정 화면에서 검게 튄다).

     node --test tests/cards-settings-uniform.test.js */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'pu-cards.html'), 'utf8').split('\r\n').join('\n');

function fnBody(name) {
  const i = SRC.search(new RegExp('(?:^|\\n)(?:async )?function ' + name + '\\('));
  assert.ok(i >= 0, name + ' 을 찾지 못했습니다');
  const open = SRC.indexOf('{', i);
  let d = 0;
  for (let k = open; k < SRC.length; k++) {
    if (SRC[k] === '{') d++;
    else if (SRC[k] === '}') { d--; if (!d) return SRC.slice(i, k + 1); }
  }
  assert.fail(name + ' 의 끝을 찾지 못했습니다');
}
/* 규칙 한 덩이를 «선언»으로 갈라 본다 — 있다/없다가 아니라 값을 본다 */
function decls(selector) {
  const i = SRC.indexOf('\n' + selector + '{');
  assert.ok(i > 0, selector + ' 규칙을 못 찾았다');
  const body = SRC.slice(i + selector.length + 2, SRC.indexOf('}', i));
  const out = {};
  body.split(';').forEach(d => {
    const k = d.indexOf(':');
    if (k > 0) out[d.slice(0, k).trim()] = d.slice(k + 1).trim();
  });
  return out;
}

/* ── ① 정리 탭이 다른 탭과 «같은 격자»에 있다 ── */

test('★★ 정리 탭의 줄들이 «격자» 안에 있다 — 혼자 전폭 줄로 깔리던 그것이다', () => {
  const c = fnBody('openCleanupCenter');
  assert.match(c, /\$\{introTxt\}<\/p><div class="setpanel">/,
    '★ 격자를 안 열었다 — 같은 .setbtn 인데 혼자 한 줄에 하나씩 깔린다');
  assert.match(c, /\? `<\/div><p class="setnote"/, '★ 격자를 안 닫았다');
});

test('★ 여는 곳과 닫는 곳이 «짝»이다 — 하나만 있으면 화면이 통째로 어긋난다', () => {
  const c = fnBody('openCleanupCenter');
  assert.equal(c.split('<div class="setpanel">').length - 1, 1);
  assert.equal(c.split('</div><p class="setnote"').length - 1, 1);
});

test('★★ 팝업(폰 시트)에서는 «예전 그대로»다 — 거기는 격자가 아니다', () => {
  const c = fnBody('openCleanupCenter');
  /* inline 일 때만 격자를 연다 — 삼항의 «참» 쪽에 있어야 한다 */
  const at = c.indexOf('let h = inline');
  const q = c.indexOf('?', at);
  const colon = c.indexOf('\n    : `<div class="mhead">', at);
  const 참쪽 = c.slice(q, colon);
  assert.match(참쪽, /<div class="setpanel">/, '★ 격자가 팝업 쪽에 붙었다');
});

test('★ 여섯 탭이 «같은 단추»를 쓴다 — 정리 탭도 setbtn 이다', () => {
  const c = fnBody('openCleanupCenter');
  assert.match(c, /class="setbtn"/, '정리 탭이 남의 모양을 쓴다');
  const page = fnBody('renderSettingsPage');
  assert.match(page, /class="setbtn \$\{cls\|\|''\}"/, '다른 탭이 남의 모양을 쓴다');
});

test('★ 격자는 «한 곳»에서만 정한다 — 두 벌이면 탭마다 칸 수가 달라진다', () => {
  const p = decls('.setpanel');
  assert.equal(p['display'], 'grid');
  assert.match(p['grid-template-columns'], /repeat\(auto-fill,minmax\(\d+px,1fr\)\)/);
  assert.equal(SRC.split('\n.setpanel{').length - 1, 1);
});

/* ── ② 환경설정 «안»에 펼친 패널도 같은 결 ── */

test('★★ 인라인 패널의 제목이 «설정 화면 크기»다 — 팝업 제목(17px)이 그대로 들어왔었다', () => {
  const b = decls('#setInline .mhead b');
  assert.ok(parseFloat(b['font-size']) < 17,
    '★ 팝업 제목 크기 그대로다 — 설정 화면에서 혼자 크다');
  assert.equal(b['color'], '#1e293b', '어두운 팝업용 빛깔이 그대로면 흰 바탕에서 안 맞는다');
});

test('★★ 인라인 패널의 줄 밑줄이 «연한 색»이다 — 팝업용 #1e293b 는 흰 바탕에서 검게 튄다', () => {
  const d = decls('#setInline .ditem');
  assert.equal(d['border-bottom-color'], '#e2e8f0');
});

test('★ 팝업 쪽은 «건드리지 않았다» — 어두운 바탕에서는 그 색이 맞다', () => {
  assert.match(decls('.ditem')['border-bottom'], /#1e293b/,
    '★ 팝업의 밑줄까지 연하게 바꾸면 어두운 바탕에서 안 보인다');
  assert.equal(decls('.mhead b')['font-size'], '17px', '팝업 제목은 그대로여야 한다');
});

/* ── ③ 폰 메뉴도 한 결 ── */

test('★ 폰 메뉴의 곁줄은 «모두» msub 다 — 나 혼자 <i> 를 쓰면 그 줄만 달라 보인다', () => {
  const at = SRC.indexOf('${hd(\'🔗 푸른이알피 연동\')}');
  assert.ok(at > 0, '폰 메뉴의 이알피 자리를 못 찾았다');
  const seg = SRC.slice(at, SRC.indexOf('${hd(\'⚙️ 설정\')}', at));
  assert.ok(!/<i>/.test(seg), '★ 이 자리에 <i> 곁줄이 남아 있다: ' + seg.match(/<i>[^<]*<\/i>/g));
  ['같은 서류 정리', '서류 배포 기록', '회사 빠진 명함 채우기'].forEach(n => {
    assert.ok(seg.indexOf(n) > 0, n + ' 단추가 없다');
  });
  /* 이 자리의 단추는 «모두» 곁줄을 하나씩 갖는다 — 수를 못 박지 말고 짝을 본다 */
  const 단추 = seg.split('class="sheetbtn"').length - 1;
  assert.equal(seg.split('class="msub"').length - 1, 단추,
    '단추 ' + 단추 + '개인데 곁줄이 그만큼이 아니다 — 한 줄만 달라 보인다');
});

/* ── 여섯 탭이 다 있다 ── */

test('★ 탭은 여섯이고, 저마다 «설명 한 줄»로 시작한다 — 하나만 없으면 그 탭이 낯설다', () => {
  const page = fnBody('renderSettingsPage');
  ['data', 'clean', 'erp', 'tabs', 'acct'].forEach(k => {
    assert.ok(page.indexOf("cur==='" + k + "'") > 0 || k === 'data', k + ' 탭이 없다');
  });
  /* 정리 탭의 설명은 openCleanupCenter 가 낸다(introTxt) — 그것도 setnote 다 */
  assert.match(fnBody('openCleanupCenter'), /<p class="setnote">\$\{introTxt\}<\/p>/);
  ['파일로 가져오고', '푸른이알피 업체관리와 대조', '폴더마다 만든 탭', '글자 자동인식']
    .forEach(t => assert.ok(page.indexOf(t) > 0, '「' + t + '」 설명이 없다'));
});
