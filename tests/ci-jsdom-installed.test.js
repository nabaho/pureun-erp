'use strict';
/* 화면을 «진짜로 그려 보는» 검사가 CI 에서도 실제로 돌아야 한다.

   이 저장소에는 package.json 이 없어 CI 가 아무것도 설치하지 않는다. 그래서 jsdom 이
   없고, jsdom 을 쓰는 검사기 다섯은 모두 「없으면 SKIP」 관례로 «곱게 건너뛰고» 있었다.
   그 관례 자체는 옳다 — 없다고 빨강이 되면 「열이 어긋났다」가 아니라 «검사기를 못
   돌렸다»는 뜻인데도 배포가 멎는다(2026-09-06 에 실제로 멎었다).

   문제는 그 결과다. 다섯이 «CI 에서 한 번도 돌지 않았다.»
   문자열만 보는 검사는 「단추는 있는데 창이 안 뜨는 것」, 「열이 한 칸 밀린 것」,
   「서식이 빈 채로 나가는 것」을 못 잡는다 — 그러라고 만든 것이 이 다섯이다.

   그러니 SKIP 관례는 그대로 두고, CI 에서는 «jsdom 을 깔아» 실제로 돌게 한다.

   ⚠ 깐 node_modules 가 배포본에 남으면 안 된다. GitHub Pages 는 저장소를 통째로
     올리므로, 지우지 않으면 수십 MB 의 남의 코드가 인터넷에 공개된다
     (2026-08-15 에 fund-erp/tools 가 실제로 그랬다).
     그쪽은 tests/dev-tools-not-published.test.js 가 «실제로 돌려서» 지킨다.

   실행: node --test tests/ci-jsdom-installed.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const WF = path.join(root, '.github/workflows');

/* 검사를 돌리는 워크플로 — 여기가 늘면 이 검사도 함께 늘어야 한다 */
const 검사도는곳 = ['deploy-pages.yml', 'quality-gate.yml'];

const read = (f) => fs.readFileSync(path.join(WF, f), 'utf8').replace(/\r\n/g, '\n');

test('★ jsdom 을 쓰는 검사기가 실제로 있다 — 없으면 이 검사가 헛돈다', () => {
  const tools = fs.readdirSync(path.join(root, 'fund-erp/tools'))
    .filter((f) => f.endsWith('.js'))
    .filter((f) => /require\(['"]jsdom['"]\)/
      .test(fs.readFileSync(path.join(root, 'fund-erp/tools', f), 'utf8')));
  assert.ok(tools.length >= 3,
    'jsdom 을 쓰는 검사기가 ' + tools.length + '개뿐입니다 — 이 검사의 전제가 바뀌었습니다');
});

for (const f of 검사도는곳) {
  test('★ ' + f + ' — 검사를 돌리기 «전에» jsdom 을 깐다', () => {
    const y = read(f);
    const 설치 = y.indexOf('npm i jsdom');
    assert.ok(설치 >= 0,
      f + ' 이 jsdom 을 깔지 않습니다 — 화면을 그려 보는 검사 다섯이 CI 에서 통째로 건너뛰어집니다');
    const 검사 = y.indexOf('node --test');
    assert.ok(검사 >= 0, f + ' 에 검사 실행이 없습니다');
    assert.ok(설치 < 검사,
      '설치가 검사보다 «뒤»에 있으면 아무 소용이 없습니다');
  });

  test(f + ' — 설치가 실패해도 검사는 돈다 (npm 이 잠깐 죽었다고 배포가 멎으면 안 된다)', () => {
    const y = read(f);
    const line = y.split('\n').find((l) => l.includes('npm i jsdom'));
    assert.ok(line, 'npm i jsdom 줄을 찾지 못했습니다');
    assert.match(line, /\|\|\s*true|continue-on-error/,
      '설치 한 줄이 죽으면 배포 전체가 멎습니다 — 그때는 SKIP 으로 물러나야 합니다: ' + line.trim());
  });
}

test('★ 깐 node_modules 는 배포본에서 지운다 — 남의 코드가 인터넷에 올라가면 안 된다', () => {
  const y = read('deploy-pages.yml');
  const 지우는대목 = y.slice(y.indexOf('Strip developer-only files'));
  assert.ok(지우는대목.includes('node_modules'),
    'jsdom 을 깔아 놓고 지우지 않으면 수십 MB 의 남의 코드가 그대로 공개됩니다');
});

test('SKIP 관례는 그대로다 — jsdom 이 없는 곳(개발자 컴퓨터)에서는 여전히 건너뛴다', () => {
  const dir = path.join(root, 'fund-erp/tools');
  const 관례없는것 = fs.readdirSync(dir).filter((f) => f.endsWith('.js')).filter((f) => {
    const s = fs.readFileSync(path.join(dir, f), 'utf8');
    return /require\(['"]jsdom['"]\)/.test(s) && !/SKIP:/.test(s);
  });
  assert.deepEqual(관례없는것, [],
    '이 검사기들이 jsdom 없이 죽습니다 — CI 가 아닌 곳에서 전체 검사가 빨강이 됩니다: '
    + 관례없는것.join(', '));
});
