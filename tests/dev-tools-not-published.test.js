/* 개발자 도구 설정은 «배포본에» 남지 않는다.
   .mcp.json(한글 서식·법령·인사 MCP 연결)과 .claude/(스킬 9MB)는 앱이 부르지 않는다.
   그런데 GitHub Pages 는 저장소를 통째로 올리므로, 지우는 걸 빠뜨리면
   주소만 알면 열린다 — 2026-08-15 에 fund-erp/tools 가 실제로 그랬다.

   이 검사는 «목록에 이름이 있는가» 를 보지 않는다. 지우는 대목을 실제로 «돌려서»
   개발용이 사라지고 앱 파일이 살아남는지를 본다 — 목록 순서가 바뀌어도 안 깨진다.
   실행: node --test tests/dev-tools-not-published.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const yml = fs.readFileSync(path.join(root, '.github/workflows/deploy-pages.yml'), 'utf8');

/* 배포본에서 지우는 대목(run: | 블록)만 떼어 낸다 */
function stripScript() {
  const lines = yml.split('\n');
  const at = lines.findIndex((l) => /Strip developer-only files/.test(l));
  assert.ok(at >= 0, '「개발용 파일 지우기」 대목이 사라졌습니다');
  const runAt = lines.findIndex((l, i) => i > at && /^\s*run:\s*\|\s*$/.test(l));
  assert.ok(runAt > at, '지우는 대목이 run: | 형태가 아닙니다');
  const body = [];
  for (let i = runAt + 1; i < lines.length; i++) {
    if (lines[i].trim() && !/^\s{10}/.test(lines[i])) break;
    body.push(lines[i].replace(/^\s{10}/, ''));
  }
  /* ⚠ 줄끝의 \r 을 걷어 낸다. 이 저장소는 윈도우에서 CRLF 로 내려받히는데,
     그대로 bash 에 넘기면 줄마다 \r 이 붙어 이어짓기(\)와 for 문이 깨진다 —
     CI(리눅스·LF)에서는 멀쩡하고 «여기서만» 깨져, 검사 판정이 곳마다 달라진다. */
  return body.join('\n').replace(/\r/g, '');
}

/* 앱이 실제로 부르는 것 / 개발용인 것 */
const 살아야 = ['js', 'css', 'vendor', 'enter.html', 'fund.html', 'work.html', 'pu-erp.html',
  'manifest.json', 'hwpx_gen.js', 'pu-sw.js', 'hana-bridge.apk',
  'install.html', 'icon-portal-192.png', 'icon-portal-512.png'];
const 사라져야 = ['.mcp.json', '.claude', 'tests', 'docs', 'scripts', 'functions',
  'fund-erp', 'CLAUDE.md', 'README.md', 'firebase.json', '.firebaserc'];

const 폴더 = new Set(['js', 'css', 'vendor', '.claude', 'tests', 'docs', 'scripts',
  'functions', 'fund-erp']);

function 만들기(dir, name) {
  const p = path.join(dir, name);
  if (폴더.has(name)) { fs.mkdirSync(p, { recursive: true }); fs.writeFileSync(path.join(p, 'a.txt'), 'x'); }
  else fs.writeFileSync(p, 'x');
}

function 흉내내기() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pu-deploy-'));
  for (const name of 살아야.concat(사라져야)) 만들기(dir, name);
  fs.mkdirSync(path.join(dir, '.claude', 'skills', 'hwpx'), { recursive: true });
  const out = execFileSync('bash', ['-c', stripScript()], { cwd: dir, encoding: 'utf8' });
  return { dir, out };
}

test('개발자 도구 설정(.mcp.json)과 스킬(.claude)은 배포본에 남지 않는다', () => {
  const { dir } = 흉내내기();
  for (const gone of ['.mcp.json', '.claude']) {
    assert.ok(!fs.existsSync(path.join(dir, gone)),
      gone + ' 이 배포본에 남았습니다 — 주소만 알면 열립니다');
  }
});

test('지우기는 앱이 부르는 파일을 건드리지 않는다', () => {
  const { dir } = 흉내내기();
  for (const keep of 살아야) {
    assert.ok(fs.existsSync(path.join(dir, keep)),
      keep + ' 이 지워졌습니다 — 배포되면 앱이 열리지 않습니다');
  }
});

test('개발용이 남으면 배포가 멈춘다 (지우는 목록이 낡아도 여기서 걸린다)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pu-deploy-guard-'));
  for (const name of 살아야) 만들기(dir, name);
  /* 지우는 목록에서 빠진 것처럼 흉내낸다 — 마지막 문지기가 잡아야 한다 */
  fs.writeFileSync(path.join(dir, '.mcp.json'), 'x');
  const script = stripScript().replace(/\brm -f -- [^\n]*\n/, '\n');
  assert.throws(() => execFileSync('bash', ['-c', script], { cwd: dir, stdio: 'pipe' }),
    '개발용이 남았는데도 배포가 그대로 진행됩니다');
});

test('한글 서식 스킬은 저장소에 붙어 있다 (설치가 사람 손에 달려 있지 않다)', () => {
  const skill = path.join(root, '.claude/skills/hwpx');
  assert.ok(fs.existsSync(path.join(skill, 'SKILL.md')), '스킬 안내문이 없습니다');
  for (const f of ['secure_fill.py', 'fill_hwpx.py', 'clone_form.py', 'convert_hwp.py']) {
    assert.ok(fs.existsSync(path.join(skill, 'scripts', f)), '서식함에 쓸 ' + f + ' 이 없습니다');
  }
});

test('MCP 연결 설정은 저장소에 있고, 주소는 빈칸이 아니다', () => {
  const conf = JSON.parse(fs.readFileSync(path.join(root, '.mcp.json'), 'utf8'));
  const 서버 = conf.mcpServers || {};
  assert.ok(Object.keys(서버).length >= 2, 'MCP 서버가 2개 미만입니다');
  for (const [이름, v] of Object.entries(서버)) {
    if (v.type === 'http' || v.type === 'sse') {
      assert.match(String(v.url || ''), /^https:\/\/\S+$/, 이름 + ' 의 주소가 https 가 아닙니다');
    } else {
      assert.ok(v.command, 이름 + ' 을 실행할 명령이 없습니다');
    }
  }
});
