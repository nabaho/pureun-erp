/* 폰에 「앱으로 깔기」 (대표 지시 2026-08-26 「폰에서 토탈프로그램 앱으로 깔 수 있게」)

   ★ 깔 수 있는 채비는 이미 돼 있었다 — manifest 도, 아이콘도 있었다.
     없던 것은 «길» 이었다. 두 곳이 끊겨 있었다.
       ⑴ install.html 에 <link rel="manifest"> 가 없었다. 그러면 안드로이드는
          「무엇을 설치할지」를 몰라 beforeinstallprompt 를 «영영 보내지 않는다» —
          곧 「홈화면에 설치하기」 단추가 뜨지도 않았다.
       ⑵ 그 install.html 로 «가는 길이 아무 데도 없었다». 안 보이면 없는 것이다.

   ★ 그래서 포털 머리줄에 「📲 앱으로 깔기」를 두고 —
       안드로이드 : 단추 한 번(prompt)
       아이폰      : 신호가 없으므로 install.html 의 세 걸음 안내로 보낸다
       이미 깔았으면 : 안 띄운다(standalone 으로 열렸는지로 안다)

   ⚠ 배선은 <head> 에 둔다 — 본문 스크립트에 두면 파이어베이스가 안 닿는 날
     단추가 통째로 사라진다(PC/폰 전환에서 겪은 일이다). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const enter = fs.readFileSync(path.join(ROOT, 'enter.html'), 'utf8');
const inst = fs.readFileSync(path.join(ROOT, 'install.html'), 'utf8');
const mf = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));

test('★ 설치 화면에 manifest 가 걸려 있다 — 없으면 설치 신호가 영영 안 온다', () => {
  assert.match(inst, /<link rel="manifest" href="[^"]*manifest\.json">/,
    '★ 이 줄이 없으면 안드로이드가 무엇을 설치할지 몰라 단추가 뜨지도 않습니다.');
  /* 설치 화면과 포털이 «같은» manifest 를 봐야 한다 — 다르면 두 앱이 깔린다 */
  const a = (inst.match(/rel="manifest" href="([^"]*)"/) || [])[1];
  const b = (enter.match(/rel="manifest" href="([^"]*)"/) || [])[1];
  assert.equal(a, b, '★ 설치 화면과 포털이 서로 다른 앱을 가리킵니다.');
});

test('★ 설치 화면으로 «가는 길» 이 있다 — 안 보이면 없는 것이다', () => {
  assert.match(enter, /id="appInstallBtn"/, '★ 포털에 「앱으로 깔기」 단추가 없습니다.');
  assert.match(enter, /location\.href = 'install\.html'/,
    '★ 신호가 없는 브라우저(아이폰)에서 갈 곳이 없습니다.');
});

test('★ 안드로이드는 단추 한 번으로 깔린다', () => {
  const head = enter.slice(0, enter.indexOf('</head>'));
  assert.match(head, /beforeinstallprompt/,
    '★ 설치 신호를 안 받아 두면 단추를 눌러도 아무 일이 없습니다.');
  assert.match(head, /_installEvt\.prompt\(\)/, '★ 받아만 두고 안 쓰면 뜻이 없습니다.');
  assert.match(head, /e\.preventDefault\(\); _installEvt = e;/,
    '★ 기본 알림을 막지 않으면 브라우저 것과 우리 것이 겹칩니다.');
});

test('★ 이미 깔았으면 안 띄운다 — 눌러도 할 일이 없는 단추다', () => {
  const head = enter.slice(0, enter.indexOf('</head>'));
  assert.match(head, /display-mode: standalone/, '★ 이미 앱으로 열렸는지 안 봅니다.');
  assert.match(head, /navigator\.standalone === true/, '★ 아이폰은 그 방식으로만 알 수 있습니다.');
  assert.match(head, /'appinstalled'/, '★ 깐 뒤에도 단추가 남아 있으면 헷갈립니다.');
});

test('★ 배선이 <head> 에 있다 — 앱이 죽는 날에도 깔 수 있어야 한다', () => {
  const head = enter.slice(0, enter.indexOf('</head>'));
  assert.ok(head.indexOf("getElementById('appInstallBtn')") > 0,
    '★ 본문에 두면 파이어베이스가 안 닿는 날 단추가 통째로 사라집니다.');
});

test('★ 아이콘을 길게 누르면 바로가기가 나온다 — 진짜 앱처럼', () => {
  assert.ok(Array.isArray(mf.shortcuts) && mf.shortcuts.length >= 3,
    '★ 바로가기가 없으면 늘 포털을 거쳐 들어가야 합니다.');
  mf.shortcuts.forEach(function (s) {
    assert.ok(s.name && s.url, '바로가기에 이름·주소가 없습니다: ' + JSON.stringify(s));
    /* ⚠ 그림이 저장소에 없으면 배포된 화면에서 404 다 (.gitignore 의 *.png 함정) */
    (s.icons || []).forEach(function (i) {
      assert.ok(fs.existsSync(path.join(ROOT, i.src)), '바로가기 그림이 없습니다: ' + i.src);
      let tracked = true;
      try { cp.execFileSync('git', ['ls-files', '--error-unmatch', i.src], { cwd: ROOT, stdio: 'ignore' }); }
      catch (e) { tracked = false; }
      assert.ok(tracked, '★ ' + i.src + ' 이 저장소에 없습니다 — 배포하면 404 입니다.');
    });
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   ★ 대표 지적 2026-08-26 「앱으로 깔기 무슨 의미가 있냐 그냥 크롬에서 여는 거라 같다」
   그 말이 맞았다. 주소창이 그대로 보이는 «크롬 바로가기» 가 만들어지고 있었다.

   ★ 까닭 : 크롬은 «fetch 를 듣는 서비스워커가 그 화면을 잡고 있을 때만»
     진짜 앱(WebAPK)으로 깔아 준다. 없으면 beforeinstallprompt 가 아예 안 오고,
     브라우저 메뉴의 「홈 화면에 추가」도 주소창 달린 바로가기로 끝난다.
     manifest 도 아이콘도 다 갖췄는데 이 한 가지가 빠져 헛돈 것이다.

   ★ 아래 검사는 «지금 파일 이름» 이 아니라 규칙을 못 박는다 —
     ⑴ 포털(start_url)과 설치 화면이 저마다 서비스워커를 등록하는가
     ⑵ 그 워커가 fetch 를 «듣는가» (안 들으면 크롬이 설치 자격을 안 준다)
     ⑶ 셋(포털·설치·기업정보함)이 «같은 파일» 인가 — 다르면 뒤에 연 앱이
       앞의 워커를 밀어내 공유받기가 죽는다(pu-sw.js 머리말의 약속). */

/* 한 파일에서 «scope 를 좁히지 않은» 서비스워커 등록의 파일 이름을 뽑는다.
   웹푸시(firebase-messaging-sw.js)는 scope 를 /push/ 로 좁혀 등록하므로
   설치 자격과 무관하다 — 그래서 scope 인자가 붙은 등록은 세지 않는다. */
function rootWorkersOf(src) {
  const out = [];
  const re = /navigator\.serviceWorker\.register\(\s*['"]([^'"]+)['"]\s*(,)?/g;
  let m;
  while ((m = re.exec(src))) { if (!m[2]) out.push(m[1].replace(/^.*\//, '')); }
  return out;
}

test('★ 포털과 설치 화면이 서비스워커를 등록한다 — 없으면 「크롬 바로가기」로 끝난다', () => {
  const p = rootWorkersOf(enter);
  assert.ok(p.length > 0,
    '★ 포털이 서비스워커를 등록하지 않습니다 — 포털이 곧 앱의 첫 화면(start_url)인데도요.\n' +
    '  크롬은 fetch 를 듣는 워커가 잡고 있는 화면만 진짜 앱으로 깔아 줍니다.');
  const i = rootWorkersOf(inst);
  assert.ok(i.length > 0,
    '★ 설치 화면이 서비스워커를 등록하지 않습니다 — 이 화면에서 설치 신호를 기다리는데도요.');
});

test('★ 그 워커가 fetch 를 «듣는다» — 안 들으면 크롬이 설치 자격을 안 준다', () => {
  rootWorkersOf(enter).concat(rootWorkersOf(inst)).forEach(function (name) {
    const f = path.join(ROOT, name);
    assert.ok(fs.existsSync(f), '★ 등록한 워커 파일이 없습니다: ' + name + ' (배포하면 404 입니다)');
    const sw = fs.readFileSync(f, 'utf8');
    assert.match(sw, /addEventListener\(\s*['"]fetch['"]/,
      '★ ' + name + ' 이 fetch 를 듣지 않습니다.\n' +
      '  크롬은 fetch 처리기가 있는 워커만 «설치 가능» 으로 봅니다 — 없으면\n' +
      '  beforeinstallprompt 가 영영 안 오고 주소창 달린 바로가기가 만들어집니다.');
  });
});

test('★ 포털·설치·기업정보함이 «같은» 워커를 쓴다 — 다르면 서로 밀어낸다', () => {
  const cards = fs.readFileSync(path.join(ROOT, 'pu-cards.html'), 'utf8');
  const all = new Set(rootWorkersOf(enter).concat(rootWorkersOf(inst)).concat(rootWorkersOf(cards)));
  assert.equal(all.size, 1,
    '★ 기본 scope 에 서로 다른 워커가 등록됩니다: ' + [...all].join(' · ') + '\n' +
    '  서비스워커는 한 scope 에 하나만 삽니다 — 나중에 연 앱이 앞의 것을 밀어내\n' +
    '  기업정보함·사진첩의 「공유 받기」가 죽습니다.');
});
