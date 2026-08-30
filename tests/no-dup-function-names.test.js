/* 한 파일 안에 «같은 이름의 함수»가 두 번 — 저장소 전체를 지킨다.

   이 검사가 있는 까닭 — 세 번 겪었다.
     · mbGo        — 새로 지었더니 「칸 열기」 mbGo 가 이미 있었다. 쪽 넘김이 통째로 안 먹었다.
     · toggleNoMail — 확인을 묻는 쪽이 죽고 묻지 않는 쪽이 돌아, 명함 수신거부가
                      «확인 없이» 켜졌다. 심지어 검사가 «먼저 나오는» 죽은 쪽을 읽어 초록이었다.
     · loadImg      — 사진첩. 뒤엣것이 이겨, AI 와 상관없는 카메라·밝기 실패에도
                      「AI 가 준 사진을 읽지 못했습니다」가 떴다.
   셋 다 **구문오류도 없고 검사도 다 통과**했다. 화면에서 눌러 보고서야 알았다.
   그래서 값이 아니라 «규칙»을 못 박는다 — 한 파일에 같은 이름은 하나다.

   ⚠ docs/ 는 뺀다 — 목업은 뒤 script 로 «일부러» 덮어쓰는 자리가 있다
     (homepage-dash-spec 의 drawAll·go: 「이 쪽에는 목록·편집칸이 없다」).
   ⚠ 줄 첫머리(들여쓰기 없음)의 선언만 본다. 함수 «안»의 함수는 겹쳐도 밖을 안 덮는다. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const 안봄 = new Set(['node_modules', '.git', 'docs', 'backups', 'templates', '.claude', 'coverage']);

function 파일들(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (안봄.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) 파일들(p, out);
    else if (/\.(html|js)$/i.test(e.name)) out.push(p);
  }
  return out;
}

/* ⚠ 주석을 먼저 걷는다 — 잘 쓴 «설명»이 검사를 통과시키면 안 된다 */
const 걷기 = s => s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, ' ');

function 겹친이름(src) {
  const 셈 = {};
  const re = /\nfunction\s+([A-Za-z_$][\w$]*)\s*\(/g;
  let m;
  while ((m = re.exec(src))) 셈[m[1]] = (셈[m[1]] || 0) + 1;
  return Object.keys(셈).filter(k => 셈[k] > 1);
}

test('★★ 한 파일 안에 «같은 이름의 함수»가 둘이 아니다 (저장소 전체)', () => {
  const 걸린것 = [];
  for (const p of 파일들(ROOT, [])) {
    const dup = 겹친이름(걷기(fs.readFileSync(p, 'utf8')));
    if (dup.length) 걸린것.push(path.relative(ROOT, p).replace(/\\/g, '/') + ' → ' + dup.join(', '));
  }
  assert.deepEqual(걸린것, [],
    '★ 같은 이름의 함수가 둘입니다 — 뒤엣것이 이기고 앞엣것은 «한 줄도 안 돕니다».\n' +
    '   고칠 때: 어느 쪽이 맞는지 정하고 하나를 지운 뒤, 화면에서 눌러 확인하십시오.\n' +
    '   ' + 걸린것.join('\n   '));
});

/* 검사 자체가 도는지 — 훑을 파일이 없으면 위 검사는 «늘 초록»이다. */
test('★ 훑을 파일이 실제로 있다 — 빈손으로 통과하지 않는다', () => {
  const n = 파일들(ROOT, []).length;
  assert.ok(n > 50, '★ 훑은 파일이 ' + n + '개뿐입니다 — 걸러내는 규칙이 너무 넓습니다');
});
