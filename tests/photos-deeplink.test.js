/* 주소로 사진 하나 열기 — 기업정보에서 「원본 보기」를 눌렀을 때 그 서류를 띄우는 통로.
   ⚠ openViewer 는 gridItems 안에 있는 사진만 연다. 그래서 연도를 먼저 맞추고
     목록을 불러온 **다음에야** 열 수 있다. 그 차례가 이 기능의 전부다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const photos = fs.readFileSync(path.join(__dirname, '..', 'pu-photos.html'), 'utf8');
const cards  = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8');

test('주소에서 사진 번호·연도·주인을 읽는다', () => {
  assert.match(photos, /function readAskedPhoto/);
  assert.match(photos, /q\.get\('photo'\)/);
  assert.match(photos, /q\.get\('year'\)/);
  assert.match(photos, /q\.get\('owner'\)/);
});

test('연도를 먼저 맞춘 다음 목록을 부른다', () => {
  /* 뒤바뀌면 엉뚱한 해의 목록에서 찾다가 「없다」고 한다 */
  /* ⚠ 'startUploadWatch();' 로 잡으면 함수 **정의**가 먼저 걸린다 — 부르는 자리를 곧바로 잡는다 */
  const ask = photos.indexOf('goPhotoIfAsked();');
  assert.ok(ask > 0, 'goPhotoIfAsked 를 부르는 자리를 찾지 못했습니다');
  const boot = photos.indexOf('const finishPhotoBoot', ask);
  const load = photos.indexOf('loadGrid();', ask);
  assert.ok(load > ask, '연도를 맞추기 전에 목록을 부른다');
  /* 계정이 바뀌거나 로그아웃된 뒤 느린 응답이 돌아오는 경우를 막기 위해 이제
     목록 읽기는 finishPhotoBoot 안에서 계정 세대 검사를 거친다. 글자 수로 거리를
     제한하지 말고, 주소 적용 → 안전한 부팅 → 목록 읽기 순서를 직접 확인한다. */
  assert.ok(boot > ask && load > boot,
    '주소 적용 뒤 안전한 부팅을 거쳐 목록을 읽는 순서가 아니다');
});

test('목록이 실린 뒤에 연다', () => {
  /* ⚠ 고정 폭(1400자)으로 자르던 것을 중괄호 짝으로 바꿨다 (2026-08-23) —
     loadGrid 에 한 줄(coSweep)이 붙자 함수가 1501자가 되어 창이 «끝에 못 닿았다».
     창 숫자를 키워 쫓아가면 다음에 또 같은 일이 생긴다
     (tests/test-cut-truncation.test.js 가 바로 그것을 잡아 알려 주었다).
     아래 cut() 이 이 파일에 이미 있다 — 그것을 쓴다. */
  const fn = cut(photos, 'function loadGrid()');
  const grid = fn.indexOf('renderGrid();');
  const open = fn.indexOf('openAskedPhoto();');
  assert.ok(grid > 0 && open > grid, '목록을 그리기 전에 열려고 한다');
});

/* 함수 하나를 중괄호 짝을 세어 뽑는다 — 고정 폭으로 자르면 코드가 길어질 때 못 닿는다. */
function cut(src, decl) {
  const head = src.indexOf(decl);
  assert.notEqual(head, -1, decl + ' 을 찾지 못했습니다');
  let i = src.indexOf('{', head + decl.length), d = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') d++;
    else if (src[i] === '}') { d--; if (!d) break; }
  }
  return src.slice(head, i + 1);
}

test('한 번 열면 지운다', () => {
  /* 안 지우면 다른 해로 옮길 때마다 그 사진이 다시 튀어나온다.

     ⚠ 예전에는 「_askedPhoto = null 이 두 번 나온다」고 **개수**를 셌다.
       갈래가 하나 늘면 — 거기서도 제대로 지워도 — 검사가 막고, 거꾸로
       한 갈래가 안 지워도 «다른 곳이 두 번이면» 통과한다. 거꾸로였다.
       그래서 **실제로 돌려** 어느 갈래로 나가든 비워지는지 본다. */
  const body = cut(photos, 'function openAskedPhoto(');
  const run = function (found) {
    const box = { _askedPhoto: { id: 'p1' }, opened: [], toasts: [] };
    new Function('box', 'gridItems', 'openViewer', 'toast',
      'var _askedPhoto = box._askedPhoto;' + body +
      '\nopenAskedPhoto();\nbox._askedPhoto = _askedPhoto;')(
      box,
      found ? [{ id: 'p1' }] : [],
      function (id) { box.opened.push(id); },
      function (m) { box.toasts.push(m); });
    return box;
  };

  const 찾음 = run(true);
  assert.deepEqual(찾음.opened, ['p1'], '찾았는데 안 열립니다.');
  assert.equal(찾음._askedPhoto, null, '열고 나서 안 지웠습니다 — 해를 옮길 때마다 또 튀어나옵니다.');

  const 못찾음 = run(false);
  assert.deepEqual(못찾음.opened, [], '없는 사진을 열려고 합니다.');
  assert.equal(못찾음._askedPhoto, null, '못 찾았을 때 안 지웠습니다 — 해를 옮길 때마다 또 튀어나옵니다.');
  assert.equal(못찾음.toasts.length, 1, '못 찾았다고 말해 주지 않으면 「고장」으로 읽습니다.');
});

test('못 찾으면 조용히 넘기지 않는다', () => {
  /* 지웠거나 볼 권한이 없을 수 있다 — 말 안 하면 「고장」으로 읽는다 */
  assert.match(photos, /그 서류 사진을 찾지 못했습니다/);
});

test('기업정보에서 새 창으로 열되 «한 창»만 쓴다', () => {
  /* 지금 창을 갈아타면 보던 회사와 고르던 것이 다 날아간다 — 그래서 새 창이다.
     ⚠ 그런데 «늘 새 창»(_blank)이면 누를 때마다 탭이 쌓인다(대표 지적 2026-08-27).
       창에 **이름**을 붙이면 브라우저가 그 창을 다시 쓴다. 자세한 것은
       tests/cards-doc-window-reuse.test.js 가 돌려서 본다. */
  assert.match(cards, /function openCoDoc/);
  /* ⚠ 2026-09-08 — 창 이름을 «앱이 짓지 않는다». 공용 층(PuAppBar.goApp)이 주소에서
       뽑는다(대표 지시 「모든 창은 2개가 열리지 않고 하나만」). 여기서는 «공용 층을
       쓰는가»만 보고, 이름이 실제로 같은지는 one-window-per-app 이 돌려서 본다. */
  assert.match(cards, /PuAppBar\.goApp\('pu-photos\.html\?' \+ q\)/,
    '★ 공용 층으로 열지 않으면 창 이름이 앱마다 갈려 탭이 쌓입니다');
  assert.doesNotMatch(cards, /window\.open\('pu-photos\.html/,
    '★★ 사진첩을 «직접» 여는 곳이 되살아났습니다 — 그 길만 다시 탭을 쌓습니다');
  assert.match(cards, /onclick="openCoDoc\(/);
});

test('주소에 넣는 값은 인코딩한다', () => {
  /* 사진 번호에 &·= 가 들어가면 주소가 갈라져 엉뚱한 사진이 열리거나 아무것도 안 열린다.

     ⚠ 예전에는 「encodeURIComponent 가 세 번 나온다」고 **개수**를 셌다. 값을
       하나 더 붙이면 — 제대로 감싸서 붙여도 — 검사가 막고, 거꾸로 하나를 안 감싸도
       다른 곳이 세 번이면 통과했다. 그래서 **실제로 돌려** 험한 값을 넣어 본다. */
  /* ⚠ 2026-09-03: 이름이 openCoDoc 으로 «시작하는» 다른 함수가 생기면 그쪽이 먼저
     걸린다(openCoDupDocs — async 라 await 가 들어 있어 통째로 터졌다).
     여는 괄호까지 붙여 «그 함수»를 찍는다. */
  const at = cards.indexOf('function openCoDoc(');
  assert.ok(at > 0, 'openCoDoc 를 찾지 못했습니다');
  let i = cards.indexOf('{', at), d = 0;
  for (; i < cards.length; i++) {
    if (cards[i] === '{') d++;
    else if (cards[i] === '}') { d--; if (!d) break; }
  }
  const body = cards.slice(at, i + 1);

  let url = '';
  /* ⚠ 2026-09-08 — 창 이름은 «앱이 짓지 않는다». 공용 층(PuAppBar.goApp)이 주소에서
       뽑는다(대표 지시 「모든 창은 2개가 열리지 않고 하나만」). 그래서 CO_DOC_WIN 대신
       PuAppBar 를 넣어 준다 — 여기서 재는 것은 «주소를 제대로 감쌌나»이고 그대로다. */
  new Function('encodeURIComponent', 'toast', 'PuAppBar',
    body + "\nopenCoDoc('2026&x', 'p 1=2&z', 'u#1');")(
    encodeURIComponent, function () { },
    { goApp: function (u) { url = u; return { focus: function () { } }; } });

  assert.ok(url.indexOf('pu-photos.html?') === 0, '새 창을 안 엽니다: ' + url);
  /* 값 안에 든 & = # 가 그대로 나가면 주소가 갈라진다 */
  const q = new URLSearchParams(url.slice(url.indexOf('?') + 1));
  assert.equal(q.get('photo'), 'p 1=2&z', '사진 번호가 갈라졌습니다: ' + url);
  assert.equal(q.get('year'), '2026&x', '연도가 갈라졌습니다: ' + url);
  assert.equal(q.get('owner'), 'u#1', '주인이 갈라졌습니다: ' + url);
});

test('사진 번호가 없는 옛 기록은 까닭을 말한다', () => {
  assert.match(cards, /예전 방식으로 보낸 서류입니다/);
});

test('주인도 맞춘 다음 목록을 부른다', () => {
  /* 연도만 맞추고 주인을 그대로 두면 **내 사진 목록**을 불러오므로 남이 올린 서류는
     아무리 찾아도 없다 — 「원본 보기가 안 된다」의 진짜 까닭이었다(2026-08-13). */
  const at = photos.indexOf('function goPhotoIfAsked');
  const fn = photos.slice(at, photos.indexOf('function openCamIfAsked', at));
  assert.match(fn, /gridOwner = \(who === me\.uid\) \? null : who/, '주인을 안 맞춘다');
  assert.match(fn, /who === me\.uid/, '내 사진인데도 남의 자리로 바꾸면 안 된다');
});
