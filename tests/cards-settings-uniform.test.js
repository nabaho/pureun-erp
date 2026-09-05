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

/* SET_SECTIONS 를 «돌려» 본다 — 글자만 찾으면 칸을 통째로 지워도 통과한다 */
const vm = require('node:vm');
function sections(st) {
  const a = SRC.indexOf('function SET_SECTIONS(){');
  const b = SRC.indexOf('function openSettingsPage()');
  assert.ok(a > 0 && b > a, 'SET_SECTIONS 를 못 찾았다');
  const ctx = {
    state: Object.assign({ tab: 'card', views: {}, mailBlock: {}, privOpen: false }, st || {}),
    aiReady: () => true
  };
  vm.createContext(ctx);
  /* ⚠ 최상위 function 은 컨텍스트에 붙지만, const 는 안 붙는다 */
  vm.runInContext(SRC.slice(a, b) + '\n;globalThis.__out = SET_SECTIONS();', ctx);
  return ctx.__out;
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

test('★ 모든 칸이 «같은 단추»를 쓴다 — 정리 센터도 setbtn 이다', () => {
  const c = fnBody('openCleanupCenter');
  assert.match(c, /class="setbtn"/, '정리 센터가 남의 모양을 쓴다');
  const page = fnBody('renderSettingsPage');
  assert.match(page, /class="setbtn \$\{r\.cls\|\|''\}"/, '다른 칸이 남의 모양을 쓴다');
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

/* ⚠ 2026-09-05 「다」: 탭 여섯을 «칸» 여섯으로 폈다. 탭마다 있던 설명 한 줄은
     걷어냈다 — 대표 지시 「너무 불필요한 설명 많다」. 칸 제목이 그 몫을 한다. */
test('★★ 칸은 여섯이고, 차례가 곧 «얼마나 자주 쓰나»다', () => {
  const c = sections({ isAdmin: true });
  assert.equal(c.map(s => s.t).join(' / '),
    '자주 쓰는 것 / 자료 넣고 빼기 / 푸른이알피 연동 / 탭 · 계정 / 관리자 · 한 번만 하는 일'
    + ' / 위험 구역 — 되돌릴 수 없습니다');
});

test('★★ 대표가 아니면 관리자 칸이 «통째로» 사라진다 — 빈 제목만 남으면 더 이상하다', () => {
  const c = sections({ isAdmin: false });
  assert.ok(c.every(s => s.t.indexOf('관리자') < 0), '★ 직원에게 관리자 칸이 보인다');
  assert.ok(c.every(s => s.rows.length > 0), '★ 줄이 하나도 없는 빈 칸이 남았다');
  const 있는것 = c.map(s => s.rows.map(r => r.fn).join(',')).join(',');
  ['migrateInlineThumbs()', 'openExportLog()', 'openPrivateVault()'].forEach(fn =>
    assert.ok(있는것.indexOf(fn) < 0, '★ 직원에게 ' + fn + ' 가 보인다'));
});

test('★★ 설명은 «한 줄»이다 — 대표 지시 「너무 불필요한 설명 많다」', () => {
  sections({ isAdmin: true }).forEach(s => s.rows.forEach(r => {
    assert.ok(r.desc.length <= 20, '★ 「' + r.label + '」 설명이 ' + r.desc.length + '자다: ' + r.desc);
    assert.ok(r.label.length <= 22, '★ 「' + r.label + '」 이름이 길다');
  }));
});

test('★★ 「자주 쓰는 것」만 눈에 띈다 — 다 크면 아무것도 안 크다', () => {
  const c = sections({ isAdmin: true });
  const hero = c.filter(s => s.rows.some(r => r.cls === 'hero'));
  assert.equal(hero.length, 1, '★ hero 가 여러 칸에 흩어져 있다');
  assert.equal(hero[0].t, '자주 쓰는 것');
  assert.ok(hero[0].rows.every(r => r.cls === 'hero'), '★ 그 칸 안에서도 결이 다르다');
  assert.ok(decls('.setbtn.hero')['background'], 'hero 규칙이 CSS 에 없다');
});
