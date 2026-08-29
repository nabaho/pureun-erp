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
  assert.ok(panels.length >= 8, '탭 패널이 여덟 이상이어야 합니다 (' + panels.length + ')');
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
  assert.ok(names.length >= 8, '탭 단추가 여덟 이상이어야 합니다');
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
