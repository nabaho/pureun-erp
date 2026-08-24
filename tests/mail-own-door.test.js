/* 메일을 «따로» 둔다 — 코드가 아니라 «문»을 나눈다
   (대표 지시 2026-08-21 「메일함만 별도로 분리해서 관리 … 가급적이면 바탕화면에」)

   ★ 왜 앱을 안 쪼갰나 — 메일은 명함 자료에 세 군데로 매여 있다.
       ① 받는사람 자동완성 : findPeople(state.items, …) — 명함 전체를 뒤진다
       ② 묶음 발송        : 고른 명함이 곧 받는 곳이다(bulkMailStart)
       ③ 보낸 기록        : _compose.cardId — 그 명함에 붙는다
     쪼개면 이 셋을 잃거나 명함 창고를 «두 벌» 갖춰야 한다. 두 벌이 되면 언젠가
     한쪽만 고친다 — 이 저장소에서 여러 번 겪은 일이다.
     그래서 파일은 한 벌 그대로 두고 주소(?view=mail)에만 제 이름·아이콘을 준다.

   ⚠ 나뉜 것이 «두 곳»에 걸려 있다 — <head> 의 manifest 갈아 끼우기와 화면을 고르는
     쪽이다. 한쪽만 고치면 「아이콘 이름은 메일인데 열리는 화면은 명함 목록」이 된다.
     이 검사가 그 둘이 같은 조건을 보는지까지 지킨다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const cards = fs.readFileSync(path.join(ROOT, 'pu-cards.html'), 'utf8');
const enter = fs.readFileSync(path.join(ROOT, 'enter.html'), 'utf8');
const appbar = fs.readFileSync(path.join(ROOT, 'js', 'pu-appbar.js'), 'utf8');
const mf = JSON.parse(fs.readFileSync(path.join(ROOT, 'pu-mail-manifest.json'), 'utf8'));

test('★ 메일 아이콘은 제 이름·제 그림으로 따로 앉는다', () => {
  assert.equal(mf.short_name, '메일');
  /* 들어가는 문이 메일 화면이어야 한다 — 여기가 틀리면 아이콘만 메일이고 명함이 열린다 */
  assert.match(mf.start_url, /view=mail/, '★ start_url 이 메일 화면을 가리키지 않습니다.');
  /* id 가 같으면 기기가 「같은 앱」으로 보고 아이콘을 하나로 합친다 */
  const cardsMf = JSON.parse(fs.readFileSync(path.join(ROOT, 'pu-cards-manifest.json'), 'utf8'));
  assert.notEqual(mf.id || mf.start_url, cardsMf.id || cardsMf.start_url,
    '★ 두 아이콘의 id 가 같으면 기기가 하나로 합칩니다.');
  /* 그림도 달라야 한다 — 똑같이 생기면 아이콘을 나눈 값어치가 없다 */
  const src = (mf.icons || []).map(i => i.src).join('|');
  assert.doesNotMatch(src, /(^|\|)icon-(192|512)\.png/,
    '★ 푸른 ERP 기본 아이콘을 그대로 쓰면 바탕화면에서 구별이 안 됩니다.');
  /* ★ 「내 컴퓨터에 있나」가 아니라 「저장소에 올라갔나」를 본다.
     .gitignore 가 *.png 를 통째로 막고 아이콘만 하나씩 풀어 주고 있어(개인정보가
     담긴 스캔이 png 로 올라오는 것을 막는 규칙이다), 그림을 새로 그려도 조용히
     안 올라간다 — 실제로 그랬다. 그러면 배포된 화면에서는 아이콘이 404 다. */
  (mf.icons || []).forEach(function (i) {
    assert.ok(fs.existsSync(path.join(ROOT, i.src)), '아이콘 파일이 없습니다: ' + i.src);
    let tracked = true;
    try {
      cp.execFileSync('git', ['ls-files', '--error-unmatch', i.src],
        { cwd: ROOT, stdio: 'ignore' });
    } catch (e) { tracked = false; }
    assert.ok(tracked,
      '★ ' + i.src + ' 이 저장소에 없습니다 — .gitignore 의 *.png 에 막힌 것입니다.'
      + ' `!' + i.src + '` 를 더해 주세요. 안 그러면 배포된 화면에서 아이콘이 안 뜹니다.');
  });
});

test('★ manifest 갈아 끼우기는 <head> 안에서 한다', () => {
  /* 「홈 화면에 추가」를 누르는 순간 브라우저는 «그때 걸려 있는» manifest 를 읽는다.
     화면이 다 그려진 뒤에 바꾸면 이미 기업정보함으로 담긴 뒤다. */
  const head = cards.slice(0, cards.indexOf('</head>'));
  assert.ok(head.includes('pu-mail-manifest.json'),
    '★ <head> 밖에서 바꾸면 이미 기업정보함으로 담긴 뒤입니다.');
  assert.match(head, /document\.title\s*=\s*'푸른 메일'/, '창 이름도 함께 바꿔야 합니다.');
});

test('★ 주소가 메일이면 첫 화면이 메일이다 — 마지막 보던 화면보다 앞선다', () => {
  /* 안 그러면 메일 아이콘을 눌렀는데 마지막에 보던 명함 목록이 열린다. */
  const at = cards.indexOf('function restoreLastScreen(){');
  assert.ok(at > 0);
  const fn = cards.slice(at, cards.indexOf('\n}', at));
  assert.match(fn, /urlWantsMail\(\)/, '★ 주소를 안 보면 저장된 화면이 이깁니다.');
  assert.ok(fn.indexOf('urlWantsMail()') < fn.indexOf('localStorage.getItem(lastScreenKey())'),
    '★ 저장된 화면을 읽기 «전에» 주소를 봐야 합니다.');
});

test('★ 문을 가리는 조건이 머리와 화면 두 곳에서 같다', () => {
  /* 한쪽만 고치면 이름은 메일인데 열리는 화면은 명함이 된다. */
  const hits = cards.match(/view=mail\(&\|\$\)/g) || [];
  assert.ok(hits.length >= 2,
    '★ manifest 갈아 끼우는 쪽과 화면 고르는 쪽이 같은 조건을 봐야 합니다.');
});

test('메일은 문이 셋이다 — 포털 타일 · 바탕화면 아이콘 · 즐겨찾기 손잡이', () => {
  /* 2026-08-21 처음에는 문을 셋 냈다가 같은 날 오후 포털 타일만 물렸다:
     「메일은 여기 있을 필요 없다, 기업정보함으로」. 까닭은 «한 프로그램»이 첫 화면에서
     타일 둘을 차지해 목록만 길어진다는 것이었다.

     2026-08-24 「해라 포털도」로 타일을 되살렸다. 사정이 달라졌다 — 같은 날 옆줄을
     «두 창»으로 나눠, 메일 문으로 들어가면 명함·사업자·기업 상세가 아예 안 보이고
     메일 살림만 보인다. 이제 타일 둘은 «한 프로그램의 문 둘»이 아니라 «다른 두 화면»이다.
     ⚠ 주소에 ?view=mail 이 없으면 타일을 눌러도 명함이 열린다 — 그게 옛 문제로 돌아가는 길이다. */
  assert.match(enter, /key:'mail'/,
    '★ 포털 첫 화면에 메일 타일이 있어야 합니다 (대표 지시 2026-08-24).');
  assert.match(enter, /key:'mail'[^\n]*pu-cards\.html\?view=mail/,
    '★ 메일 타일이 «메일 문»으로 가야 합니다 — 그냥 pu-cards.html 이면 명함이 열립니다.');
  assert.match(enter, /key:'cards'[^\n]*url:'pu-cards\.html'/,
    '★ 기업정보함 타일도 그대로 있어야 두 창입니다.');
  assert.match(appbar, /key: 'mail'[^\n]*url: 'pu-cards\.html\?view=mail'/,
    '★ 즐겨찾기 손잡이의 메일까지 없애면 ☰ 안으로 다시 숨습니다.');
});

test('☰ 메뉴의 메일 넷은 그대로 있고, 아이콘 만들기가 그 묶음에 붙었다', () => {
  /* 아이콘을 따로 냈다고 ☰ 에서 빼면 안 된다 — 명함을 보다 그 자리에서 쓰는 길
     (묶음 발송)이 메일의 진짜 쓰임새다. 어제 겪은 「안 보이면 없는 것」의 반대 실수다. */
  ['openMailPage()', 'openSentBox()', 'openSchedBox()', 'openMatPage()'].forEach(function (fn) {
    assert.ok(cards.includes("openMenu"), 'openMenu 를 찾지 못했습니다');
    assert.ok(cards.includes(fn), '★ ☰ 메뉴에서 ' + fn + ' 가 사라졌습니다.');
  });
  assert.match(cards, /addMailIcon\(\)/, '바탕화면 아이콘 만들기 길이 없습니다.');
});

test('아이콘 만들기는 «메일 문»에서만 담는다', () => {
  /* 명함 화면에서 그냥 담으면 기업정보함이 담긴다 — 아이콘은 그때 걸린 manifest 를 따른다. */
  const at = cards.indexOf('function addMailIcon(){');
  assert.ok(at > 0, 'addMailIcon 을 찾지 못했습니다.');
  const fn = cards.slice(at, cards.indexOf('\n}', at));
  assert.match(fn, /if\(!urlWantsMail\(\)\)/, '★ 메일 문이 아닌 곳에서 담으면 기업정보함이 담깁니다.');
  assert.match(fn, /view=mail/);
  /* 스스로 못 띄우는 브라우저에는 «어떻게 하는지»를 알려 준다 — 못 한다고만 하면 길이 끊긴다 */
  assert.match(fn, /홈 화면에 추가/);
});
