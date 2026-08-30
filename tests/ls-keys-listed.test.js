'use strict';
/* p_ 로 시작하는 저장 키를 쓰면서 허용목록(LS_VALID_KEYS)에 안 넣으면,
   앱이 «시작할 때마다» 도는 청소가 그 키를 조용히 지운다.
   실행: node --test tests/*.test.js

   ★ 왜 이 검사가 있나 (2026-08-29 실제로 겪은 일)
     `p_subSyncSeeded`(부담당 첫 맞춤을 끝냈다는 표)가 목록에 없었다. 그래서
     새로고침할 때마다 표가 지워지고 «첫 맞춤»이 다시 돌아, 이알피에 부담당을
     되풀이해 올렸다. 화면에는 아무 표시가 없어 알아채기 어려웠다.
   ⚠ 키 이름을 박지 않는다 — 「쓰는 키가 모두 목록 안에 있다」는 규칙만 본다.
     키를 늘려도 안 깨지고, 목록에 넣기를 잊으면 그 자리에서 걸린다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const APPS = ['gov-consulting.html'];

APPS.forEach(function (file) {
  test(file + ' — 쓰는 p_ 키는 모두 허용목록에 있다 (없으면 시작할 때 지워진다)', () => {
    const t = fs.readFileSync(path.join(root, file), 'utf8');

    const listed = t.match(/const LS_VALID_KEYS\s*=\s*\[([^\]]*)\]/);
    assert.ok(listed, 'LS_VALID_KEYS 를 찾을 수 없습니다');
    const valid = new Set(listed[1].split(',').map(s => s.trim().replace(/'/g, '')).filter(Boolean));

    const pm = t.match(/const LS_VALID_PREFIXES\s*=\s*\[([^\]]*)\]/);
    const prefixes = pm ? pm[1].split(',').map(s => s.trim().replace(/'/g, '')).filter(Boolean) : [];

    /* 쓰는 키 모으기 — 직접 부르는 것과 감싼 것(lsSet) 둘 다 */
    const used = new Set();
    for (const m of t.matchAll(/localStorage\.(?:getItem|setItem|removeItem)\('([a-zA-Z0-9_]+)'/g)) used.add(m[1]);
    for (const m of t.matchAll(/lsSet\('([a-zA-Z0-9_]+)'/g)) used.add(m[1]);

    assert.ok(used.size > 10, '쓰는 키를 ' + used.size + '개만 찾았습니다 — 찾는 규칙이 어긋났습니다');

    const bad = [...used].filter(k =>
      k.startsWith('p_') && !valid.has(k) && !prefixes.some(p => k.startsWith(p)));

    assert.deepEqual(bad, [],
      '★ 이 키들은 앱이 시작할 때 청소가 «지웁니다» — LS_VALID_KEYS 에 넣어 주세요:\n  ' + bad.join(' '));
  });
});
