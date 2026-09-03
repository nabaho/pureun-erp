/* 기업정보함 원본 사진을 파일 창고(Storage)로 — 대표 결정 2026-08-09

   왜: 사진을 실시간DB 에 base64 로 넣어 명함 4,400장이 약 1.7GB 가 됐고,
   무료 한도(1GB)를 이것 하나로 넘겨 **데이터베이스가 멈출 뻔했다**(2026-08-09).
   창고로 옮기면 실시간DB 는 0.1GB 로 떨어진다.

   여기서 못 박는 것은 「사진을 잃지 않는 순서」다 — 올리고·확인하고·그제야 지운다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const R = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(R, 'pu-cards.html'), 'utf8');

/* ── 어느 창고를 보는가 ── */
test('★ 서울 창고를 본다 (미국 기본 창고가 아니다)', () => {
  const m = html.match(/storageBucket:\s*'([^']+)'/);
  assert.ok(m, 'storageBucket 설정이 없습니다.');
  assert.equal(m[1], 'pureun-erp-photos',
    '기본 창고(pureun-erp.firebasestorage.app)는 미국(us-east1)이고 위치를 못 바꿉니다. ' +
    '명함 사진에는 고객사 임직원 개인정보가 들어 있어 서울 창고를 씁니다.');
});

/* ── 개인 폴더는 창고에 안 간다 ── */
test('★ 개인 폴더 명함은 창고로 보내지 않는다', () => {
  const m = html.match(/_inBucket\(id\)\{[\s\S]*?\n  \}/);
  assert.ok(m, '_inBucket 이 없습니다 — 갈라 보내는 판단이 사라졌습니다.');
  assert.ok(/=== DB_ROOT/.test(m[0]),
    '개인 폴더(pucards_private)는 창고 규칙에 자리가 없습니다. ' +
    '보내면 조용히 저장에 실패해 사진이 사라집니다.');
  assert.ok(/mode==='firebase'/.test(m[0]), '데모 모드에서 창고를 부르면 터집니다.');
});

/* ── 읽는 순서 ── */
test('★ 읽기는 창고 먼저, 없으면 실시간DB', () => {
  const m = html.match(/async getPhoto\(id\)\{[\s\S]*?\n  \},/);
  assert.ok(m, 'getPhoto 를 찾지 못했습니다.');
  const bucketAt = m[0].indexOf('_fetchFromBucket');
  const dbAt = m[0].indexOf("ref(`${this._rootOf");
  assert.ok(bucketAt > 0 && dbAt > 0, '두 갈래가 다 있어야 합니다.');
  assert.ok(bucketAt < dbAt,
    '옮기는 중에는 사진이 두 곳에 나뉘어 있습니다. 한쪽만 보면 사라진 것처럼 보입니다.');
});

test('창고에 없어도 터지지 않는다 (아직 안 옮긴 사진)', () => {
  const m = html.match(/async getPhoto\(id\)\{[\s\S]*?\n  \},/);
  assert.ok(/catch\(e\)\{ p=''; \}/.test(m[0]),
    '창고에 없으면 404 가 납니다 — 받아서 실시간DB 로 넘어가야 합니다.');
});

/* ── 쓰는 길 ── */
test('★ 창고 저장이 실패하면 실시간DB 로 물러선다', () => {
  const m = html.match(/putPhoto\(id,dataUrl\)\{[\s\S]*?\n  delPhoto/);
  assert.ok(m, 'putPhoto 를 찾지 못했습니다.');
  assert.ok(/_putToBucket\(id, dataUrl\)\.catch/.test(m[0]),
    '창고가 안 될 때 물러설 곳이 없으면 방금 찍은 명함이 사라집니다.');
  assert.ok(/photos\/\$\{id\}`\)\.set\(dataUrl\)/.test(m[0]), '물러설 곳이 실시간DB 여야 합니다.');
});

test('★ 지울 때는 두 곳 다 지운다', () => {
  const m = html.match(/delPhoto\(id\)\{[\s\S]*?\n  \/\* ──/);
  assert.ok(m, 'delPhoto 를 찾지 못했습니다.');
  assert.ok(/_photoRef\(id\)\.delete\(\)/.test(m[0]), '창고에 남으면 지운 사진이 되살아납니다.');
  assert.ok(/\.remove\(\)/.test(m[0]), '실시간DB 에 남아도 되살아납니다.');
});

/* ── 옮기기 도구 — 여기가 이 작업의 핵심이다 ── */
test('★ 올리고 → 되읽어 확인하고 → 그제야 지운다', () => {
  const m = html.match(/window\.pucardsMovePhotosToStorage = async function\(\)\{[\s\S]*?\n\};/);
  assert.ok(m, '옮기기 도구가 없습니다.');
  const put = m[0].indexOf('_putToBucket');
  const back = m[0].indexOf('_fetchFromBucket');
  const del = m[0].indexOf('.remove()');
  assert.ok(put > 0 && back > 0 && del > 0, '세 걸음이 다 있어야 합니다.');
  assert.ok(put < back && back < del,
    '확인을 건너뛰고 지우면 창고에 안 올라간 사진이 영영 사라집니다. ' +
    '명함은 다시 찍으려면 그 사람을 또 만나야 합니다.');
});

test('★ 한 장이 실패해도 그 장은 실시간DB 에 남긴다', () => {
  const m = html.match(/window\.pucardsMovePhotosToStorage = async function\(\)\{[\s\S]*?\n\};/);
  /* 지우기가 try 안에 있어야 한다 — 실패하면 지우기까지 못 가고 넘어간다.
     (줄바꿈·들여쓰기로 못 박지 않는다 — 파일이 CRLF 라 어긋난다) */
  const body = m[0];
  /* ⚠ 2026-08-27 고침 — 예전에는 try 가 «_putToBucket 으로 시작하는지»를 봤다.
     그런데 「한 장씩만 받기」로 바뀌면서(484249c4, 통째로 읽던 것 고침) try 가
     «그 한 장을 읽는 것»으로 시작하게 됐고, 검사가 깨졌다. 코드는 더 나아졌는데
     검사가 옛 «방식»에 못 박혀 있었던 것이다.
     여기서 지켜야 할 것은 방식이 아니라 «지우기가 try 안에 있는가» 하나다 —
     그러니 지우기 «앞의 가장 가까운» try 를 찾아 그것으로 본다. */
  const catchAt = body.search(/\}\s*catch\(e\)\{\s*failed\+\+/);
  const delAt = body.indexOf('.remove()');
  let tryAt = -1;
  const re = /try\s*\{/g;
  let hit;
  while ((hit = re.exec(body)) && hit.index < delAt) tryAt = hit.index;
  assert.ok(tryAt > 0 && catchAt > 0, '한 장씩 감싸는 try/catch 가 있어야 합니다.');
  assert.ok(tryAt < delAt && delAt < catchAt,
    '지우기가 try 밖에 있으면 올리기에 실패한 장도 지워집니다.');
  assert.ok(/실시간DB 에 그대로 둡니다/.test(body), '실패한 장을 어떻게 했는지 말해야 합니다.');
});

test('되돌릴 수 없는 일이라 먼저 묻는다', () => {
  const m = html.match(/window\.pucardsMovePhotosToStorage = async function\(\)\{[\s\S]*?\n\};/);
  assert.ok(/confirm\(/.test(m[0]), '실시간DB 에서 지우는 일이라 확인을 받아야 합니다.');
  assert.ok(/장/.test(m[0]) && /MB/.test(m[0]), '몇 장·몇 MB 인지 보여줘야 판단할 수 있습니다.');
});

test('끊겨도 이어서 한다 — 이미 옮긴 것은 목록에 없다', () => {
  const m = html.match(/window\.pucardsMovePhotosToStorage = async function\(\)\{[\s\S]*?\n\};/);
  /* 옮긴 것은 실시간DB 에서 지우므로, 다시 실행하면 남은 것만 읽힌다.
     ⚠ 2026-08-27 고침 — 예전에는 「photos 를 통째로 once('value')」를 못 박고 있었다.
       그런데 484249c4 가 «바로 그 통째로 읽기»를 없앴다(목록만 읽고 사진은 한 장씩).
       검사가 고쳐진 쪽을 되레 막고 있었던 것이다. 지켜야 할 것은 읽는 «방법»이 아니라
       «남은 것만 본다»는 성질이다. */
  assert.ok(/_cardsPhotoIds\(\)/.test(m[0]),
    '남아 있는 것만 읽어야 이어서 하기가 됩니다.');
  assert.ok(/옮길 사진이 없습니다|이미 (다 옮겨졌습니다|끝났습니다)/.test(m[0]),
    '다 끝났을 때 아무 말이 없으면 고장으로 보입니다.');
});

test('깨진 값은 지우지 않고 남겨 둔다', () => {
  const m = html.match(/window\.pucardsMovePhotosToStorage = async function\(\)\{[\s\S]*?\n\};/);
  const body = m[0];
  /* ⚠ 2026-08-27 고침 — 예전에는 「{ skipped++; continue; }」라는 «글자»를 못 박았다.
     484249c4 가 같은 일을 else 로 바꿔 쓰면서 깨졌다. 지켜야 할 성질은 하나다:
     data: 로 시작하지 않는 값은 «올리지도 지우지도 않고» 건너뛴다. */
  assert.ok(/indexOf\('data:'\)!==0/.test(body),
    '깨진 값을 가려내는 곳이 없습니다.');
  const guardAt = body.search(/indexOf\('data:'\)!==0/);
  const skipAt = body.indexOf('skipped++', guardAt);
  const putAt = body.indexOf('_putToBucket');
  assert.ok(skipAt > guardAt && skipAt < putAt,
    '빈 값·깨진 값을 창고에 올리려다 실패하고 지우면 안 됩니다 — '
    + '가려낸 «뒤에» 올리기가 와야 합니다.');
});

/* ── 옛 도구는 그대로 둔다 ── */
test('썸네일 옮기기 도구는 건드리지 않았다', () => {
  assert.ok(/window\.pucardsMoveThumbs = async function/.test(html),
    '썸네일 옮기기는 목적이 다릅니다(내려받는 양 줄이기) — 지우면 안 됩니다.');
});

test('⛔ 화질 깎기 도구를 이 길에 섞지 않는다', () => {
  const m = html.match(/window\.pucardsMovePhotosToStorage = async function\(\)\{[\s\S]*?\n\};/);
  assert.ok(!/shrink|Shrink/.test(m[0]),
    '창고로 옮기는 것은 화질을 그대로 두려고 하는 일입니다. 여기서 깎으면 되돌릴 수 없습니다.');
});

/* ══ 막혔을 때 «어디서» 막혔는지 말하는가 (2026-09-03) ══
   대표님이 단추를 누르니 화면에 「목록을 읽지 못했습니다」 한 줄만 떴다.
   그 문장이 겉(단추 쪽)과 속(REST 쪽)에 «똑같이» 적혀 있어, 로그인·주소·인터넷·권한
   가운데 어디서 막힌 것인지 화면만 보고는 알 수 없었다 — 고칠 자리를 못 찾는다.
   여기서 못 박는 것은 「무슨 말을 하는가」가 아니라 «가려낼 수 있는가»다. */

const { cutFn } = require('./cut-fn.js');

test('★★ 막히는 자리마다 «번호»를 붙인다 — 어디서 막혔는지 화면만 보고 안다', () => {
  const fn = cutFn(html, 'async function _cardsPhotoIds(');
  assert.ok(fn, '_cardsPhotoIds 를 찾지 못했습니다.');
  const said = (fn.match(/throw new Error\('([^']*)/g) || [])
    .map((t) => t.replace(/^throw new Error\('/, ''));
  assert.ok(said.length >= 3,
    '막힐 자리가 여럿인데 말하는 자리가 ' + said.length + '개뿐입니다.');
  const 번호 = /^[①②③④⑤⑥⑦⑧⑨]/;
  const 맨말 = said.filter((t) => !번호.test(t));
  assert.deepEqual(맨말, [],
    '★ 번호 없는 말이 있습니다: ' + JSON.stringify(맨말) + ' — ' +
    '번호가 없으면 대표님 화면을 보고도 어느 걸음에서 막혔는지 알 수 없습니다.');
});

test('★★ 겉 문장과 속 문장이 «달라야» 한다 — 같으면 구별이 안 된다', () => {
  const fn = cutFn(html, 'async function _cardsPhotoIds(');
  const box = html.match(/_mvBox\(`<b style="color:#dc2626">([^<]+)</);
  assert.ok(box, '단추 쪽 빨간 문장을 찾지 못했습니다.');
  assert.ok(fn.indexOf(box[1]) < 0,
    '★ 겉과 속이 같은 말(「' + box[1] + '」)을 합니다 — ' +
    '화면에 두 줄이 겹쳐 떠서 무엇이 진짜 까닭인지 가려낼 수 없습니다(2026-09-03 에 실제로 그랬다).');
});

test('★ 거절당하면 «번호와 본문»을 함께 말한다 — 숫자만으로는 못 고친다', () => {
  const fn = cutFn(html, 'async function _cardsPhotoIds(');
  assert.match(fn, /res\.status/, '몇 번으로 거절당했는지 안 말합니다.');
  assert.match(fn, /res\.text\(\)/,
    '★ 파이어베이스가 보내 준 까닭(Permission denied / Unauthorized request)을 버립니다 — ' +
    '숫자 401 만으로는 권한 문제인지 열쇠 문제인지 가릴 수 없습니다.');
});

test('★ 인터넷이 막힌 것도 «잡아서» 말한다 — 그냥 터지게 두지 않는다', () => {
  const fn = cutFn(html, 'async function _cardsPhotoIds(');
  const at = fn.indexOf('await fetch(');
  assert.ok(at > 0, 'fetch 를 찾지 못했습니다.');
  const okAt = fn.indexOf('if(!res.ok)');
  assert.ok(okAt > at, 'res.ok 검사가 fetch 뒤에 없습니다.');
  assert.ok(fn.slice(at, okAt).indexOf('catch') > 0,
    '★ fetch 를 감싸지 않았습니다 — 인터넷·차단 프로그램에 막히면 ' +
    '까닭 없는 빈 줄만 뜹니다.');
});

test('★★ 까닭이 «빈 칸»으로 나가지 않는다 — 대표님이 겪은 그 빈 줄', () => {
  const fn = cutFn(html, 'function _errWord(');
  assert.ok(fn, '_errWord 가 없습니다 — 까닭을 다듬는 자리가 사라졌습니다.');
  const vm = require('node:vm');
  const ctx = { out: null };
  vm.createContext(ctx);
  vm.runInContext(fn + '; out = _errWord;', ctx);
  /* ⚠ 마지막 넷째가 «빈 칸 막이»를 실제로 지나가는 유일한 것이다 —
     앞의 것들은 String(e) 이 [object Object] 나 Error 를 내놓아 그 자리를 안 지난다.
     이것을 빼면 막이를 없애도 검사가 통과한다(2026-09-03 에 실제로 그랬다). */
  const 빈것 = [undefined, null, {}, new Error(''), { name: '', message: '' },
    { name: '', message: '', toString: () => '' }];
  빈것.forEach((v, i) => {
    const r = ctx.out(v);
    assert.ok(typeof r === 'string' && r.trim().length > 0,
      '★ ' + i + '번째 빈 까닭이 «빈 줄»로 나갑니다 — 화면에 아무것도 안 보입니다.');
  });
  assert.match(ctx.out(new Error('터졌다')), /터졌다/,
    '까닭이 있는데 버립니다 — 그것이 고칠 단서입니다.');
});

/* ══ 까닭이 «보이는가» (2026-09-03 두 번째 헛걸음) ══
   번호를 붙였는데도 대표님 화면에는 빨간 줄 아래가 «여전히 비어» 있었다.
   까닭 글자를 HTML 로 그대로 넣었기 때문이다 — 파이어베이스가 보낸 본문에
   태그가 섞여 있으면 글자가 아니라 «태그»로 먹혀 아무것도 안 보인다.
   여기서 못 박는 것은 「무슨 말을 하는가」가 아니라 «그 말이 눈에 닿는가»다. */

test('★★★ 까닭을 «글자 그대로» 넣는다 — 태그로 먹히면 빈 줄이 된다', () => {
  const fn = cutFn(html, 'window.pucardsMovePhotosToStorage = async function(');
  assert.ok(fn, '단추 함수를 찾지 못했습니다.');
  const at = fn.indexOf('사진 목록을 못 받았습니다');
  assert.ok(at > 0, '까닭을 알리는 자리를 찾지 못했습니다.');
  /* ⚠ 문장 뒤만 보면 안 된다 — 알리는 일이 그 앞줄에도 있다.
     catch 블록 처음부터 본다. */
  const from = fn.lastIndexOf('catch(e){', at);
  const 뒤 = fn.slice(from > 0 ? from : at, at + 700);
  assert.match(뒤, /esc\(\s*why\s*\)/,
    '★ 까닭을 esc() 없이 넣습니다 — 파이어베이스가 보낸 본문에 태그가 섞이면 ' +
    '글자가 태그로 먹혀 화면에 «빈 줄»만 보입니다(2026-09-03 에 실제로 그랬다).');
});

test('★★ 창으로도 띄운다 — 화면 글자는 덮일 수 있지만 창은 안 덮인다', () => {
  const fn = cutFn(html, 'window.pucardsMovePhotosToStorage = async function(');
  const at = fn.indexOf('사진 목록을 못 받았습니다');
  /* ⚠ 문장 뒤만 보면 안 된다 — 알리는 일이 그 앞줄에도 있다.
     catch 블록 처음부터 본다. */
  const from = fn.lastIndexOf('catch(e){', at);
  const 뒤 = fn.slice(from > 0 ? from : at, at + 700);
  assert.match(뒤, /alert\(/,
    '★ 까닭을 창으로 안 띄웁니다 — 다른 알림이 덮거나 CSS 에 먹히면 ' +
    '대표님은 아무 까닭도 못 보십니다. 그러면 고칠 자리를 영영 못 찾습니다.');
  assert.match(뒤, /console\.error\(/,
    '개발자 기록에도 남기지 않습니다 — 나중에 되짚을 단서가 사라집니다.');
});
