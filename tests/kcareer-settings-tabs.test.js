/* 환경설정 탭 여덟이 «형제»인가 — 하나가 안 닫히면 뒤의 화면들이 통째로 갇힌다.
   2026-08-29: 백업관리 패널의 </div> 가 빠져 있어 그 뒤 세 화면
   (직원관리·신분증관리·메뉴관리)이 전부 안 보였다. 대표가 신분증관리를 눌렀을 때
   «아무것도 없는 흰 화면»이 나온 까닭이다. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const lines = fs.readFileSync(path.join(__dirname, '..', 'kcareer.html'), 'utf8').split(/\r?\n/);

/* 환경설정 구역 안에서 div 짝을 세어 각 패널이 몇 겹 안에 있는지 잰다 */
function panelDepths() {
  const start = lines.findIndex((l) => l.includes('id="page-settings"'));
  assert.ok(start > 0, '환경설정 구역이 있어야 합니다');
  const out = [];
  let depth = 0;
  for (let i = start; i < lines.length; i++) {
    const l = lines[i];
    if (/class="tabpanel/.test(l)) {
      out.push({ id: (/id="([^"]+)"/.exec(l) || [])[1] || '?', depth: depth, line: i + 1 });
    }
    depth += (l.match(/<div\b/g) || []).length - (l.match(/<\/div>/g) || []).length;
    if (/<\/section>/.test(l)) return { panels: out, endDepth: depth };
  }
  throw new Error('구역 끝을 못 찾았습니다');
}

test('환경설정 탭 패널은 모두 같은 깊이의 «형제»다 — 하나라도 더 깊으면 갇힌 것이다', () => {
  const { panels } = panelDepths();
  /* 개수를 박지 않는다 — 탭을 합치거나 늘려도 «형제인가»라는 규칙은 그대로다 */
  assert.ok(panels.length >= 2, '탭 패널이 둘 이상이어야 합니다 (' + panels.length + ')');
  const d0 = panels[0].depth;
  panels.forEach((p) => {
    assert.equal(p.depth, d0,
      '「' + p.id + '」(줄 ' + p.line + ')이 다른 패널 안에 갇혀 있습니다 — 눌러도 빈 화면이 나옵니다');
  });
});

test('환경설정 구역의 div 짝이 맞는다 — 남거나 모자라면 뒤 화면이 밀린다', () => {
  assert.equal(panelDepths().endDepth, 0);
});

test('탭 단추마다 짝이 되는 패널이 있다 — id 는 tab-<이름>', () => {
  const src = lines.join('\n');
  const seg = src.slice(src.indexOf('id="page-settings"'), src.indexOf('</section>', src.indexOf('id="page-settings"')));
  const names = [...seg.matchAll(/<button class="tab[^"]*" data-tab="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(names.length >= 2, '탭 단추가 둘 이상이어야 합니다');
  names.forEach((n) => assert.ok(seg.indexOf('id="tab-' + n + '"') > 0, n + ' 짝 패널이 없습니다'));
});

/* ── 개인정보보관을 한 화면에 (대표 요청 2026-08-29) ── */
const src = lines.join('\n');
const bare = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');

test('사진 보관함과 도장 보관함이 «한 줄에 둘»이다 — 세로로 늘어놓으면 매번 스크롤한다', () => {
  const seg = src.slice(src.indexOf('id="tab-personal"'), src.indexOf('id="tab-account"'));
  assert.match(seg, /class="pi-side"/, '두 보관함을 한 줄에 묶는 칸이 있어야 합니다');
  const side = seg.slice(seg.indexOf('class="pi-side"'));
  assert.ok(side.indexOf('id="galleryCard"') > 0 && side.indexOf('id="stampCard"') > 0,
    '사진·도장이 «같은» 칸 안에 들어가야 나란히 놓입니다');
  assert.match(src, /\.pi-side\{[^}]*grid-template-columns:1fr 1fr/,
    '한 줄에 둘이려면 두 칸짜리 격자여야 합니다');
});

test('기본정보와 보관함이 «옆으로» 놓인다 — 한 화면에 다 보이게', () => {
  assert.match(src, /\.pi-two\{[^}]*display:grid/);
  const seg = src.slice(src.indexOf('id="tab-personal"'), src.indexOf('id="tab-account"'));
  assert.match(seg, /class="pi-two"/);
});

test('좁은 화면에서는 한 줄로 되돌린다 — 옆으로 밀려나면 못 쓴다', () => {
  assert.match(src, /@media\(max-width:1200px\)\{ \.pi-two\{grid-template-columns:1fr\} \}/);
});

test('도장은 화면 캡처를 «붙여넣어»도 등록된다 — 파일로 저장했다 다시 고르는 왕복을 없앤다', () => {
  assert.match(bare, /sDrop\.onpaste/);
  assert.match(bare, /clipboardData/);
  assert.match(bare, /getAsFile\(\)/);
});

test('붙여넣기는 «도장 칸을 누른 뒤»에만 받는다 — 화면 전체에서 받으면 엉뚱한 그림이 등록된다', () => {
  assert.doesNotMatch(bare, /document\.addEventListener\('paste'/,
    '문서 전체에 붙여넣기를 걸면 안 됩니다');
  assert.match(bare, /sDrop\.tabIndex/, '누를 수 있어야 붙여넣기를 받습니다');
});

test('★ 공통 탭 초기화는 «자기 짝 패널이 있는» 단추만 맡는다', () => {
  /* 이력서 화면 탭은 rhTab 으로 움직이고 패널 이름이 tab- 로 시작하지 않는다.
     그런데 initTabs 가 onclick 을 덮어써서, 누르면 없는 패널을 찾다가 네 패널을 «전부 껐다».
     처음엔 보이다가 한 번 누르면 빈 화면이 됐다(대표 제보 2026-08-29). */
  const at = bare.indexOf('function initTabs');
  const fn = bare.slice(at, at + 1600);
  assert.match(fn, /page\.querySelector\('#tab-'\s*\+\s*btn\.dataset\.tab\)/,
    '짝 패널이 없는 단추는 건드리지 말아야 합니다');
});

test('이력서 화면 탭은 제 함수(rhTab)를 그대로 쓴다 — 덮이면 화면이 빈다', () => {
  const seg = src.slice(src.indexOf('id="rh-tabrow"'), src.indexOf('id="rh-tabrow"') + 900);
  ['dm-quick', 'rh-edit', 'rh-pdf'].forEach((id) => {
    assert.ok(seg.indexOf("rhTab('" + id + "'") > 0, id + ' 단추가 rhTab 을 불러야 합니다');
    assert.equal(src.indexOf('id="tab-' + id + '"'), -1,
      'tab-' + id + ' 패널을 만들면 공통 초기화가 다시 가로챕니다');
  });
});

test('신분증과 계좌는 한 탭이다 — 둘 다 민감한 개인 서류다 (대표 지시 2026-08-29)', () => {
  assert.equal(src.indexOf('data-tab="account"'), -1, '계좌 탭 단추는 없어야 합니다');
  const seg = src.slice(src.indexOf('id="tab-idmgr"'), src.indexOf('id="tab-navmgr"'));
  assert.ok(seg.indexOf('id="idDocs"') > 0, '신분증 목록이 있어야 합니다');
  assert.ok(seg.indexOf('id="acList"') > 0, '계좌 목록이 같은 탭에 있어야 합니다');
  assert.ok(seg.indexOf('class="pi-side"') > 0, '둘을 한 줄에 나란히 놓아야 합니다');
});

test('합친 탭을 열면 계좌도 함께 그린다 — 안 그리면 빈 목록만 보인다', () => {
  const at = bare.indexOf("'idmgr':");
  assert.match(bare.slice(at, at + 200), /renderAccounts/);
});
