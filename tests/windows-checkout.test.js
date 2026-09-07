'use strict';
/* 검사가 «윈도우에서도» 맞아야 한다.

   2026-09-07 확인: 현재 main 을 윈도우에서 돌리면 5건이 빨갛다. CI(리눅스)는 초록이다.
   둘 다 «윈도우에서만» 새는 자리였고, 코드가 틀린 것이지 환경이 틀린 것이 아니다.

   ㉠ 줄끝 — 이 저장소는 윈도우에서 **CRLF** 로 내려온다. 그래서 `];\n` 처럼
      «글자 뒤에 곧바로 \n» 을 요구하는 정규식은 `];\r\n` 을 못 맞춘다.
      `rules-casebook-since`·`rules-casebook-review` 넷이 「규칙집을 못 찾았습니다」로
      죽었다 — 규칙집은 멀쩡히 있었다.
      ⚠ `\n\}` 처럼 «줄바꿈이 앞에» 오는 것은 CRLF 에서도 맞는다(\r\n} 안에 \n} 이 있다).
        깨지는 것은 앞에 글자가 붙은 경우뿐이다.
   ㉡ 경로 구분자 — `tools/dead-code.js` 가 `path.relative` 결과를 그대로 열쇠로 써서
      윈도우에서 `reference\payroll_mvp.html` 이 됐다. 그러면
      `!f.startsWith('reference/')` 를 **그대로 통과**하고, 게다가 `^[^/]+\.html$` 는
      역슬래시를 막지 않아 «최상위 html» 로 세어졌다. 참고본의 함수 셋이
      「아무도 안 부른다」로 올라왔다.

   ★ 왜 고치는가 — 로컬에서 늘 빨간 검사를 보면 사람이 **빨강을 무시하게 된다.**
     팀은 윈도우에서 일한다. 그 값이 이 검사의 값이다.

   실행: node --test tests/windows-checkout.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const TESTS = path.join(ROOT, 'tests');

/* ── ㉠ 줄끝 ── */

test('★★ 「;\\n」 을 정규식에 쓰는 검사는 줄끝을 고른다', () => {
  /* ⚠ 무엇을 짚고 무엇을 안 짚는지 —
       짚는다   `;\n`  ← 「글자 뒤에 곧바로 줄바꿈」. CRLF 에서는 `;\r\n` 이라 안 맞는다.
       안 짚는다 `\n}`  ← 줄바꿈이 «앞»에 온다. `\r\n}` 안에 `\n}` 이 있어 그대로 맞는다.
                `[^\n]` ← 문자군. 주석 지우기 같은 데 쓰이고 CRLF 와 무관하다.
                `'…\n'` ← 사람에게 보일 문구 안의 줄바꿈.
     처음엔 「글자 뒤 \n」 을 통째로 짚었더니 넷을 헛짚었다(one-line-cells·
     ref-drawer-visible·rules-storage·rules-daejo-funnel). 실제로 깨지는 모양만 짚는다. */
  /* ⚠ 범위는 «규정관리(rules.html)를 읽는 검사» 로 좁혔다.
       저장소 전체로 넓히면 31개 파일이 걸린다(2026-09-07 실측) — 그런데 실제로
       깨져 있던 것은 넷뿐이었다. 나머지는 `;\n` 정규식이 있어도 그 자리가
       판정을 좌우하지 않아 그냥 지나간다.
     ★ 다른 앱 파일 31개를 여기서 건드리지 않는다 — 그 앱들은 다른 방이 맡고 있고,
       한 PR 이 남의 앱 검사를 뭉텅이로 고치면 부딪힘만 커진다.
       넓은 쪽은 STATUS.md 에 적어 각 방이 자기 앱에서 고르게 한다. */
  const 위험 = [];
  for (const f of fs.readdirSync(TESTS).filter(f => f.endsWith('.test.js'))) {
    const s = fs.readFileSync(path.join(TESTS, f), 'utf8');
    if (!/readFileSync\([^)]*'rules\.html'/.test(s)) continue;
    if (!/;\\n/.test(s)) continue;
    const 고름 = /replace\(\s*\/\\r\\n\/g|split\('\\r\\n'\)|\\r\?\\n/.test(s);
    if (!고름) 위험.push(f);
  }
  assert.deepEqual(위험, [],
    '이 검사들이 CRLF(윈도우) 체크아웃에서 조용히 안 맞습니다. '
    + "읽을 때 `.replace(/\\r\\n/g, '\\n')` 로 고르거나 정규식을 `\\r?\\n` 으로 하세요: "
    + 위험.join(', '));
});

test('★ 실제로 이 컴퓨터에서 규칙집을 찾을 수 있다 — 줄끝이 무엇이든', () => {
  const src = fs.readFileSync(path.join(ROOT, 'rules.html'), 'utf8').replace(/\r\n/g, '\n');
  const m = src.match(/const RULES = (\[[\s\S]*?\]);\n/);
  assert.ok(m, '규칙집을 못 찾았습니다 — 줄끝을 고른 뒤에도 못 찾으면 규칙집이 정말 바뀐 것입니다');
  const rules = JSON.parse(m[1]);
  assert.ok(rules.length > 50, '규칙집이 너무 짧습니다: ' + rules.length);
});

/* ── ㉡ 경로 구분자 ── */

test('★★ 죽은 코드 훑기가 경로 구분자를 고른다 — 안 고르면 reference/ 가 새어 들어온다', () => {
  const src = fs.readFileSync(path.join(ROOT, 'tools', 'dead-code.js'), 'utf8');
  assert.match(src, /path\.sep|replace\(\s*\/\\\\\/g|split\(path\.sep\)/,
    'path.relative 결과를 그대로 쓰면 윈도우에서 `reference\\x` 가 되어 '
    + "`startsWith('reference/')` 를 통과합니다");
});

test('★ 훑은 결과에 역슬래시 경로가 없다 — 있으면 걸러내기가 새고 있다는 뜻', () => {
  let out = '';
  try {
    out = execFileSync(process.execPath, [path.join(ROOT, 'tools', 'dead-code.js')],
      { cwd: ROOT, encoding: 'utf8', timeout: 120000 });
  } catch (e) {
    out = String((e && (e.stdout || '')) || '') + String((e && (e.stderr || '')) || '');
  }
  const 역슬래시 = out.split(/\r?\n/).filter(l => /[A-Za-z0-9_.-]\\[A-Za-z0-9_.-]/.test(l));
  assert.deepEqual(역슬래시, [],
    '경로가 역슬래시로 나옵니다 — 그러면 reference/·docs/ 걸러내기가 윈도우에서 새어 나가고, '
    + '참고본의 함수가 「아무도 안 부른다」로 올라옵니다:\n      ' + 역슬래시.join('\n      '));
});
