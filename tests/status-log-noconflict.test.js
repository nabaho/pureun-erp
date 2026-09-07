/* 「마지막 손댄 기록」을 방마다 딴 파일로 갈랐다 — 부딪힘이 정말 없나 (2026-09-07)
   대표 지시 「없애라」.

   ■ 무엇이 문제였나
   기록이 STATUS.md 안의 «표 하나»였다. 방이 스무 개씩 도는데 모두 그 표의 끝줄에
   덧붙이니 부딪혔다 — PR #1087 은 **3줄 덧붙였을 뿐인데 막혔다.**
   실측: 최근 STATUS.md 커밋 29개 중 **14개**가 그 표를, **15개**가 「2. 지금 손이 필요한 것」을 만졌다.

   ■ 고친 규칙
     ① 기록은 `status/날짜-가지이름.md` — **새 파일 하나**. 이름이 겹치지 않으니
        어떤 합치기 방식에서도 부딪힐 수가 없다(합치기 도구에 기대지 않는다).
     ② 「2. 지금 손이 필요한 것」은 «안 갈랐다» — 거기서 부딪히는 것은 뜻이 있다.
        자동으로 합치면 어긋난 안내가 조용히 남는다.
     ③ 갈라 놓아 잃은 「한눈에 보기」는 `scripts/status-log.js` 가 돌려준다.
     ④ 규칙은 CLAUDE.md 와 AGENTS.md **둘 다**에 적는다(Codex·Copilot 은 앞엣것을 안 읽는다).

   ■ ★ 이 검사의 핵심은 «진짜로 합쳐 보는 것»이다 (아래 마지막 검사)
     임시 저장소를 만들어 두 방이 각자 기록을 적고 실제로 git merge 한다.
     「부딪힐 리 없다」는 말이 아니라 «부딪히지 않았다»를 본다.
   실행: node --test tests/status-log-noconflict.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const 읽기 = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n');

/* ── ① 표는 옮겨졌나 ── */
test('★★ STATUS.md 에 «덧붙이는 표»가 더는 없다 — 그것이 부딪힘의 자리였다', () => {
  const s = 읽기('STATUS.md');
  const at = s.indexOf('## 6.');
  assert.ok(at > 0, '6절이 사라졌습니다 — 어디에 적을지 알 길이 없어집니다');
  const 절 = s.slice(at);
  /* 날짜로 시작하는 표 줄이 하나라도 있으면 다시 덧붙이는 자리가 된 것이다 */
  const 표줄 = (절.match(/^\| 20\d\d-\d\d-\d\d/gm) || []).length;
  assert.equal(표줄, 0,
    '★★ 6절에 날짜 표가 ' + 표줄 + '줄 있습니다 — 방들이 다시 그 끝줄에서 부딪힙니다');
  /* ⚠ 「status/ 라는 낱말이 있나」로는 부족하다 — 옛 기록 파일 이름에도 그 낱말이 있어
     «이름 규칙»을 지워도 통과했다(고장넣기에서 확인). 규칙 자체를 못 박는다. */
  assert.match(절, /status\/날짜-가지이름\.md/,
    '어디에·어떤 이름으로 적어야 하는지 안 알려 줍니다');
  assert.match(절, /node scripts\/status-log\.js/,
    '한눈에 보는 «돌릴 수 있는 줄»을 안 알려 줍니다');
});

test('옛 기록을 «버리지 않았다» — 역사는 그대로 남는다', () => {
  const 옛 = fs.readdirSync(path.join(ROOT, 'status'))
    .filter(function (n) { return /^0000-/.test(n); });
  assert.equal(옛.length, 1, '옛 기록 묶음이 없거나 여럿입니다: ' + JSON.stringify(옛));
  const s = fs.readFileSync(path.join(ROOT, 'status', 옛[0]), 'utf8').replace(/\r\n/g, '\n');
  const 줄 = (s.match(/^\| 20\d\d-\d\d-\d\d/gm) || []).length;
  assert.ok(줄 >= 40, '옮겨 온 기록이 ' + 줄 + '줄뿐입니다 — 옮기다 흘렸습니다');
  assert.match(s, /새 기록을 여기 붙이지 말/, '역사 파일에 새것을 붙이면 다시 부딪힙니다');
});

/* ── ② 뜻이 있는 부딪힘은 «그대로 남겼나» ── */
test('★★ 「2. 지금 손이 필요한 것」 은 안 갈랐다 — 그 부딪힘은 사람이 봐야 한다', () => {
  const s = 읽기('STATUS.md');
  assert.match(s, /^## 2\. 지금 손이 필요한 것/m,
    '★★ 그 절까지 갈랐습니다 — 두 방이 같은 항목을 다르게 고친 것을 아무도 못 봅니다');
  /* 까닭이 적혀 있어야 다음 사람이 「이것도 갈라야 하나」 하고 또 파지 않는다 */
  assert.match(s.slice(s.indexOf('## 6.')), /지금 손이 필요한 것[\s\S]{0,200}사람이 봐야/,
    '왜 그 절만 안 갈랐는지 안 적어 두었습니다 — 다음 사람이 또 파고듭니다');
});

/* ── ③ 한눈에 보는 도구 ── */
test('★ status-log 가 실제로 돌고, 날짜 내림차순으로 몬다', () => {
  const M = require(path.join(ROOT, 'scripts', 'status-log.js'));
  assert.equal(typeof M.목록, 'function');
  assert.equal(M.날짜('2026-09-07-photos-trash-drag.md'), '20260907');
  assert.equal(M.날짜('0000-옮겨온-기록.md'), '', '역사 뭉치는 날짜로 세지 않는다');

  const out = cp.execFileSync(process.execPath,
    [path.join(ROOT, 'scripts', 'status-log.js'), '--files'],
    { encoding: 'utf8', cwd: ROOT });
  assert.match(out, /status\//, '파일 목록을 못 냅니다');
  /* 실제로 있는 기록 수와 맞아야 한다 */
  const n = fs.readdirSync(path.join(ROOT, 'status')).filter(function (x) { return /\.md$/i.test(x); }).length;
  assert.match(out, new RegExp(n + '건'), '기록 수를 틀리게 셉니다');
});

test('★★ 새것이 «먼저» 온다 · md 아닌 것은 뺀다 — «도구를 그대로 돌려» 본다', () => {
  const M = require(path.join(ROOT, 'scripts', 'status-log.js'));
  /* ⚠ 검사가 정렬 규칙을 «제 사본»으로 다시 쓰면, 도구가 망가져도 통과한다
     (고장넣기에서 실제로 그랬다 — 차례를 뒤집어도 안 걸렸다). 도구를 부른다. */
  const 임시 = fs.mkdtempSync(path.join(os.tmpdir(), 'statsort-'));
  try {
    ['2026-09-01-a.md', '0000-역사.md', '2026-09-07-b.md', '2026-09-07-a.md',
     '메모.txt', '2026-09-05-c.MD'].forEach(function (n) {
      fs.writeFileSync(path.join(임시, n), '# ' + n + '\n');
    });
    const got = M.목록(임시).map(function (r) { return r.name; });
    assert.deepEqual(got,
      ['2026-09-07-a.md', '2026-09-07-b.md', '2026-09-05-c.MD', '2026-09-01-a.md', '0000-역사.md'],
      '차례가 어긋나거나 md 아닌 것이 섞였습니다 — 새것부터 봐야 지금 무엇이 도는지 압니다');
    assert.ok(got.indexOf('메모.txt') < 0, 'md 아닌 파일을 기록으로 셉니다');
  } finally { fs.rmSync(임시, { recursive: true, force: true }); }
});

test('기록이 하나도 없어도 «무엇을 하라»고 말한다', () => {
  const M = require(path.join(ROOT, 'scripts', 'status-log.js'));
  const 빈곳 = fs.mkdtempSync(path.join(os.tmpdir(), 'statlog-'));
  fs.mkdirSync(path.join(빈곳, 'status'));
  fs.mkdirSync(path.join(빈곳, 'scripts'));
  fs.copyFileSync(path.join(ROOT, 'scripts', 'status-log.js'), path.join(빈곳, 'scripts', 'status-log.js'));
  const out = cp.execFileSync(process.execPath, [path.join(빈곳, 'scripts', 'status-log.js')],
    { encoding: 'utf8' });
  assert.match(out, /status\/날짜-가지이름\.md/, '빈손일 때 무엇을 만들라고 안 알려 줍니다');
  fs.rmSync(빈곳, { recursive: true, force: true });
});

/* ── ④ 두 문에 함께 적었나 ── */
test('★ 규칙을 CLAUDE.md 와 AGENTS.md «둘 다»에 적었다', () => {
  ['CLAUDE.md', 'AGENTS.md'].forEach(function (f) {
    const s = 읽기(f);
    assert.match(s, /status\/날짜-가지이름\.md/,
      '★ ' + f + ' 에 새 규칙이 없습니다 — 그 문으로 들어온 도구는 옛 표에 덧붙입니다');
    assert.match(s, /status-log\.js/, f + ' 가 한눈에 보는 길을 안 알려 줍니다');
    assert.match(s, /지금 손이 필요한 것/,
      f + ' 가 «안 가른 절»을 안 적어 두었습니다 — 그것까지 갈라 버립니다');
  });
});

/* ── ⑤ ★★ 진짜로 합쳐 본다 ── */
test('★★★ 두 방이 같은 순간에 끝내도 «실제로» 부딪히지 않는다 — 진짜 git merge', () => {
  const 방 = fs.mkdtempSync(path.join(os.tmpdir(), 'statmerge-'));
  const g = function (args, cwd) {
    return cp.execFileSync('git', args, { cwd: cwd || 방, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  };
  try {
    g(['init', '-q', '-b', 'main']);
    g(['config', 'user.email', 't@t']);
    g(['config', 'user.name', 't']);
    fs.mkdirSync(path.join(방, 'status'));
    fs.writeFileSync(path.join(방, 'status', '0000-역사.md'), '# 역사\n');
    fs.writeFileSync(path.join(방, 'STATUS.md'), '# 상태\n\n## 6. 기록 — status/ 에\n');
    g(['add', '-A']); g(['commit', '-qm', '바탕']);

    /* 방 ㉠ — 사진첩 */
    g(['checkout', '-q', '-b', 'room-a']);
    fs.writeFileSync(path.join(방, 'status', '2026-09-07-photos-trash.md'), '# 사진첩 휴지통 끌기\n');
    g(['add', '-A']); g(['commit', '-qm', '방 가']);

    /* 방 ㉡ — 업체관리 (같은 순간) */
    g(['checkout', '-q', 'main']);
    g(['checkout', '-q', '-b', 'room-b']);
    fs.writeFileSync(path.join(방, 'status', '2026-09-07-erp-pull.md'), '# 업체관리 당겨오기\n');
    g(['add', '-A']); g(['commit', '-qm', '방 나']);

    /* 둘을 차례로 main 에 합친다 — 부딪히면 여기서 던진다 */
    g(['checkout', '-q', 'main']);
    g(['merge', '-q', '--no-edit', 'room-a']);
    let 부딪힘 = '';
    try { g(['merge', '--no-edit', 'room-b']); }
    catch (e) { 부딪힘 = String((e && (e.stdout || '')) + (e && (e.stderr || ''))); }
    assert.equal(부딪힘, '',
      '★★★ 두 방의 기록이 부딪혔습니다 — 파일을 가른 뜻이 없습니다:\n' + 부딪힘);

    /* 둘 다 살아 있어야 한다 — 한쪽이 조용히 사라지면 더 나쁘다 */
    const 남은 = fs.readdirSync(path.join(방, 'status')).sort();
    assert.deepEqual(남은,
      ['0000-역사.md', '2026-09-07-erp-pull.md', '2026-09-07-photos-trash.md'],
      '★★★ 합친 뒤 기록이 사라졌습니다: ' + JSON.stringify(남은));

    /* ★ 대조 — 옛 방식(한 표에 덧붙이기)은 «정말로» 부딪히는가.
       이것이 통과해야 위 검사가 «무엇을 막았는지» 뜻이 생긴다. */
    g(['checkout', '-q', '-B', 'old-a', 'HEAD']);
    fs.writeFileSync(path.join(방, 'STATUS.md'), '# 상태\n\n## 6. 기록\n\n| 날짜 | 무엇 |\n|---|---|\n');
    g(['add', '-A']); g(['commit', '-qm', '표 바탕']);
    const 바탕 = g(['rev-parse', 'HEAD']).trim();
    fs.appendFileSync(path.join(방, 'STATUS.md'), '| 2026-09-07 | 방 가가 한 일 |\n');
    g(['add', '-A']); g(['commit', '-qm', '방 가 덧붙임']);
    g(['checkout', '-q', '-b', 'old-b', 바탕]);
    fs.appendFileSync(path.join(방, 'STATUS.md'), '| 2026-09-07 | 방 나가 한 일 |\n');
    g(['add', '-A']); g(['commit', '-qm', '방 나 덧붙임']);
    g(['checkout', '-q', 'old-a']);
    let 옛부딪힘 = '';
    try { g(['merge', '--no-edit', 'old-b']); }
    catch (e) { 옛부딪힘 = 'conflict'; }
    assert.equal(옛부딪힘, 'conflict',
      '★ 옛 방식이 부딪히지 않았습니다 — 그러면 이 고침이 아무것도 막지 않은 것입니다');
  } finally {
    try { fs.rmSync(방, { recursive: true, force: true }); } catch (_) { }
  }
});
