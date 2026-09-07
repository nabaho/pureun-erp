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
/* ⚠ .agents 는 Codex 가 저장소 스킬을 찾는 자리다($REPO_ROOT/.agents/skills).
     아직 비어 있어도 «지우는 목록에 미리» 있어야 한다 — 나중에 스킬을 넣는 사람이
     배포 게이트까지 같이 고칠 것이라고 기대하면 안 된다. 안 지우면 인터넷에 공개된다. */
const 사라져야 = ['.mcp.json', '.claude', '.agents', 'tests', 'docs', 'scripts', 'functions',
  'fund-erp', 'CLAUDE.md', 'AGENTS.md', 'README.md', 'firebase.json', '.firebaserc'];

const 폴더 = new Set(['js', 'css', 'vendor', '.claude', '.agents', 'tests', 'docs', 'scripts',
  'functions', 'fund-erp']);

function 만들기(dir, name) {
  const p = path.join(dir, name);
  if (폴더.has(name)) { fs.mkdirSync(p, { recursive: true }); fs.writeFileSync(path.join(p, 'a.txt'), 'x'); }
  else fs.writeFileSync(p, 'x');
}

/* ⚠ 여기서부터는 지우는 대목을 bash 로 «실제로» 돌린다. 그런데 이 저장소를 만지는
   윈도우 컴퓨터에는 V3(백신)가 깔려 있고, 파일을 무더기로 지우는 rm.exe 의 «실행 자체»를
   이따금 통째로 막는다 — bash 가 126(Permission denied)으로 죽는다. 같은 bash 안에서
   ls·cat·cp·mv·find·rmdir 은 멀쩡히 도는데 rm «만» 막힌다(랜섬웨어로 본 것이다).
   그러면 지우는 대목이 «한 줄도 돌지 않은» 것이라, 아래 검사들이 엉뚱한 곳을 가리킨다.
   「앱 파일이 지워졌다」고 하지만 사실 애초에 돌지도 않았고, 문지기 검사는 거꾸로
   «엉뚱한 이유로 통과»한다 — 배포가 멈춘 게 아니라 rm 이 못 뜬 것뿐이다.
   그래서 이 «한 가지» 경우만 가려내 건너뛴다. 무엇을 지우고 무엇을 남기는가 하는
   보장 자체는 리눅스인 CI 가 그대로 지킨다 — 거기서는 이 일이 일어나지 않는다. */
const 백신이막음 =
  'V3(백신)가 rm.exe 실행을 막아 「지우는 대목」이 돌지 않았습니다 — 검사가 아니라 이 컴퓨터의 사정입니다.\n'
  + '  보장은 리눅스인 CI 가 그대로 지킵니다. 이 컴퓨터에서도 돌려 보려면 V3 → 설정 → 검사 제외에\n'
  + '  C:\\Program Files\\Git\\usr\\bin\\rm.exe 를 넣으십시오.';

/* ⚠ bash 가 PATH 에 아예 없는 경우도 있다 — 이 저장소를 PowerShell 창에서 돌리면
     `spawnSync bash ENOENT` 로 죽는다(2026-09-07 실측: 윈도우 실패 8건 중 셋이 이것이었다).
     그것도 «이 컴퓨터의 사정»이지 검사가 잡아야 할 고장이 아니다 — 리눅스인 CI 에는
     bash 가 늘 있으므로 보장은 그대로 지켜진다. 백신 경우와 «같은 문»으로 건너뛴다. */
const 배시가없음 =
  'bash 를 찾지 못해 「지우는 대목」을 돌리지 못했습니다 — 검사가 아니라 이 컴퓨터의 사정입니다.\n'
  + '  보장은 리눅스인 CI 가 그대로 지킵니다. 이 컴퓨터에서도 돌려 보려면 Git Bash 창에서 돌리십시오.';

/* 지우는 대목을 bash 로 돌린다. rm 이 백신에 막힌 경우·bash 가 없는 경우«에만» 표시를 달아 던진다 */
function bash로돌리기(script, dir) {
  try {
    return execFileSync('bash', ['-c', script], { cwd: dir, encoding: 'utf8', stdio: 'pipe' });
  } catch (e) {
    if (e.status === 126 && /\brm: Permission denied/.test(String(e.stderr))) e.백신이막음 = true;
    if (e.code === 'ENOENT' && String(e.syscall || '').indexOf('bash') >= 0) e.배시가없음 = true;
    throw e;
  }
}

/* ⚠ CI 에서는 «절대» 건너뛰지 않는다. 리눅스에는 V3 가 없으니 거기서 rm 이 안 뜬다면
   그건 백신 사정이 아니라 진짜 고장이다 — 건너뛰기가 CI 의 보장을 갉아먹지 못하게 막는다. */
function 건너뛸까(e) { return Boolean(e && (e.백신이막음 || e.배시가없음)) && !process.env.CI; }

/* 백신에 막힌 것·bash 가 없는 것이면 건너뛴다. 그 밖의 실패는 감추지 않고 그대로 터뜨린다 */
function 막힌게아니면다시던지기(t, e) {
  if (!건너뛸까(e)) throw e;
  t.skip(e.배시가없음 ? 배시가없음 : 백신이막음);
}

/* ⚠ 한 번만 돌리고 그 «한 결과»를 아래 두 검사가 같이 본다.
   두 검사(지워졌나 / 남았나)는 같은 배포본을 앞뒤로 보는 것이라 두 번 돌릴 까닭이 없고,
   두 번 돌리면 rm 을 두 배로 부르는 통에 위에 적은 백신 판정에 곧바로 걸린다 —
   실제로 첫 번째는 통과하고 두 번째만 «늘» 막혔다. 지우는 대목·꾸민 파일이 매번 같으니
   한 번 돌린 결과를 나눠 봐도 잡아내는 것은 똑같다. */
let 흉내낸것 = null;
function 흉내내기() {
  if (흉내낸것) { if (흉내낸것.err) throw 흉내낸것.err; return 흉내낸것; }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pu-deploy-'));
  for (const name of 살아야.concat(사라져야)) 만들기(dir, name);
  fs.mkdirSync(path.join(dir, '.claude', 'skills', 'hwpx'), { recursive: true });
  try {
    흉내낸것 = { dir, out: bash로돌리기(stripScript(), dir) };
  } catch (e) {
    흉내낸것 = { err: e };
    throw e;
  }
  return 흉내낸것;
}

test('개발자 도구 설정(.mcp.json)과 스킬(.claude)은 배포본에 남지 않는다', (t) => {
  let dir;
  try { ({ dir } = 흉내내기()); } catch (e) { return 막힌게아니면다시던지기(t, e); }
  for (const gone of ['.mcp.json', '.claude']) {
    assert.ok(!fs.existsSync(path.join(dir, gone)),
      gone + ' 이 배포본에 남았습니다 — 주소만 알면 열립니다');
  }
});

test('지우기는 앱이 부르는 파일을 건드리지 않는다', (t) => {
  let dir;
  try { ({ dir } = 흉내내기()); } catch (e) { return 막힌게아니면다시던지기(t, e); }
  for (const keep of 살아야) {
    assert.ok(fs.existsSync(path.join(dir, keep)),
      keep + ' 이 지워졌습니다 — 배포되면 앱이 열리지 않습니다');
  }
});

test('개발용이 남으면 배포가 멈춘다 (지우는 목록이 낡아도 여기서 걸린다)', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pu-deploy-guard-'));
  for (const name of 살아야) 만들기(dir, name);
  /* 지우는 목록에서 빠진 것처럼 흉내낸다 — 마지막 문지기가 잡아야 한다 */
  fs.writeFileSync(path.join(dir, '.mcp.json'), 'x');
  const script = stripScript().replace(/\brm -f -- [^\n]*\n/, '\n');
  let 터진것 = null;
  try { bash로돌리기(script, dir); } catch (e) { 터진것 = e; }
  if (건너뛸까(터진것)) return t.skip(백신이막음);
  assert.ok(터진것, '개발용이 남았는데도 배포가 그대로 진행됩니다');
  /* ⚠ 「멈추기만」 하면 안 된다 — 문지기가 «잡아서» 멈춘 것인지까지 본다.
     bash 가 딴 까닭으로 죽어도 멈추기는 하므로, 그것까지 통과로 세면
     정작 문지기가 없어진 날에도 이 검사는 조용히 초록으로 남는다. */
  assert.match(String(터진것.stdout) + String(터진것.stderr),
    /::error::개발용 \.mcp\.json 이 아직 남아 있습니다/,
    '배포가 멈추긴 했지만 「개발용이 남았다」는 문지기가 잡은 것이 아닙니다');
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
