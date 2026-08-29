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
