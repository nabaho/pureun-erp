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
  /* ⚠ 2026-09-03 고침 — 예전에는 「옮길 사진이 없습니다」라는 «말»을 못 박았다.
     REST 목록 받기를 버리면서(열쇠 통로가 틀려 한 번도 안 통했다) 그 말이
     「확인할 명함이 없습니다」로 바뀌었다. 지켜야 할 성질은 말이 아니라
     «끝났을 때 아무 말도 없지 않다»다 — 말이 없으면 대표님은 고장으로 보신다. */
  /* ⚠ 두 자리를 «갈라» 본다 — 하나로 묶어 보면 한쪽을 없애도 통과한다
     (2026-09-03 에 실제로 그랬다: 「끝났습니다」를 지웠는데 안 걸렸다). */
  assert.match(m[0], /확인할 명함이 없습니다|옮길 사진이 없습니다/,
    '할 것이 없을 때 아무 말이 없으면 단추가 죽은 것으로 보입니다.');
  assert.match(m[0], /끝났습니다/,
    '다 끝났을 때 아무 말이 없으면 언제까지 기다려야 하는지 알 수 없습니다.');
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

/* ══ 왜 이 단추는 «한 번도» 통하지 않았나 (2026-09-03) ══
   대표님이 누르니 401 「Unauthorized request.」 가 떴다.
   그 말은 «권한이 없다»가 아니라 «열쇠를 못 알아본다»는 뜻이다 —
   권한 문제라면 「Permission denied」 라고 한다(직접 두 가지를 다 확인했다).

   까닭: 실시간DB REST 는 로그인 열쇠를 `Authorization: Bearer` 로 받지 않는다.
        그 자리는 구글 OAuth 열쇠 자리다. 우리 열쇠는 주소(?auth=)로만 받는다.
   그래서 shallow(번호만 받기) 길을 아예 버리고, 이 파일이 이미 쓰는 방식
   (카드 목록으로 자리를 만들어 한 자리씩 SDK 로 읽기)으로 바꿨다.

   여기서 못 박는 것은 두 가지다 — «통하는 길로 가는가», «까닭이 눈에 닿는가». */

const { cutFn } = require('./cut-fn.js');
const vm = require('node:vm');
const escLine = html.match(/const esc = s => [^\r\n]+/)[0];

/* ⚠ 「없어야 한다」를 볼 때는 주석을 먼저 걷는다 — 잘 쓴 주석이 검사를 걸리게 한다.
     아래 두 검사가 실제로 내 주석 때문에 걸렸다(2026-09-03). */
const { stripComments } = require('./strip-comments');
const 알맹이 = stripComments(html);

/* 진짜 함수를 그대로 떼어 와 돌려 본다 — 글자만 보면 «돌아가는지»는 모른다 */
function 떼어실행(고를것, 밑감) {
  const fn = cutFn(html, 고를것);
  assert.ok(fn, 고를것 + ' 을 찾지 못했습니다.');
  const ctx = Object.assign({}, 밑감 || {});
  vm.createContext(ctx);
  vm.runInContext(escLine + ';' + fn, ctx);
  return ctx;
}

test('★★★ 목록을 REST 로 받지 않는다 — 열쇠 통로가 틀려 한 번도 통하지 않았다', () => {
  assert.equal(알맹이.indexOf('photos.json'), -1,
    '★ REST 로 사진 목록을 받는 길이 돌아왔습니다. 그 길은 401 ' +
    '「Unauthorized request.」 로 «반드시» 막힙니다 — 열쇠를 머리글로 못 보냅니다.');
  assert.equal(알맹이.indexOf('shallow=true'), -1,
    'shallow 로 번호만 받는 길이 돌아왔습니다 — 브라우저에서는 안 통하는 길입니다.');
});

test('★★★ 로그인 열쇠를 «주소»에 넣지 않는다 — 주소는 기록에 남는다', () => {
  /* ?auth= 를 쓰면 통한다. 그래도 안 쓴다 — 주소는 서버 기록에 남고,
     그 열쇠 한 줄이면 이 사람 자격으로 무엇이든 읽을 수 있다.
     통하는 길이 «있다»는 것이 이 검사를 무르게 하는 까닭이 되어선 안 된다. */
  assert.doesNotMatch(알맹이, /[?&]auth=/,
    '★ 로그인 열쇠를 주소에 넣습니다 — 주소는 기록에 남습니다. ' +
    '목록이 필요하면 카드 목록으로 훑거나, 서버(관리자 권한)에게 시키세요.');
});

test('★★ 훑을 자리는 «앱이 아는 카드»로 만든다 — 앞면·뒷면 두 자리', () => {
  const ctx = 떼어실행('function _cardsPhotoIds(',
    { state: { items: { a1: {}, b2: {} } } });
  const ids = ctx._cardsPhotoIds();
  /* ⚠ vm 안 배열은 다른 세계의 Array 다 — Array.from 으로 옮겨 비교한다 */
  assert.deepEqual(Array.from(ids).sort(), ['a1', 'a1_b', 'b2', 'b2_b'],
    '앞면·뒷면 두 자리를 다 훑어야 합니다 — 한쪽만 훑으면 뒷면 원본이 영영 남습니다.');
});

test('★ 카드가 하나도 없어도 터지지 않는다', () => {
  const ctx = 떼어실행('function _cardsPhotoIds(', { state: {} });
  assert.deepEqual(Array.from(ctx._cardsPhotoIds()), [],
    'state.items 가 아직 없을 때 터지면 단추가 아무 말도 못 합니다.');
});

test('★★★ 까닭을 «글자 그대로» 보여 준다 — 태그로 먹히면 빈 줄이 된다', () => {
  const ctx = 떼어실행('function _whyBox(');
  const out = ctx._whyBox('<b>망함</b> & <script>x</script>');
  assert.match(out, /&lt;b&gt;망함/,
    '★ 까닭을 esc 없이 넣습니다 — 태그가 섞이면 화면에 «빈 줄»만 보입니다ㆍ' +
    '2026-09-03 에 대표님이 두 번 그 빈 줄을 보셨습니다.');
  assert.equal(out.indexOf('<script>'), -1, '태그가 그대로 들어갑니다.');
  assert.match(out, /white-space:\s*pre-wrap/,
    '줄바꿈을 살리지 않습니다 — JSON 본문이 한 줄로 뭉쳐 읽을 수 없습니다.');
});

test('★★ 까닭이 «빈 칸»으로 나가지 않는다 — 대표님이 본 그 빈 줄', () => {
  const ctx = 떼어실행('function _errWord(');
  /* ⚠ 마지막 것이 «빈 칸 막이»를 실제로 지나가는 유일한 것이다 —
     앞의 것들은 String(e) 이 [object Object] 나 Error 를 내놓아 그 자리를 안 지난다.
     이것을 빼면 막이를 없애도 검사가 통과한다(2026-09-03 에 실제로 그랬다). */
  const 빈것 = [undefined, null, {}, new Error(''), { name: '', message: '' },
    { name: '', message: '', toString: () => '' }];
  빈것.forEach((v, i) => {
    const r = ctx._errWord(v);
    assert.ok(typeof r === 'string' && r.trim().length > 0,
      '★ ' + i + '번째 빈 까닭이 «빈 줄»로 나갑니다 — 화면에 아무것도 안 보입니다.');
  });
  assert.match(ctx._errWord(new Error('터졌다')), /터졌다/,
    '까닭이 있는데 버립니다 — 그것이 고칠 단서입니다.');
});

test('★★ 뜻밖에 멈추면 «창으로도» 알린다 — 화면 글자는 덮일 수 있다', () => {
  const fn = cutFn(html, 'window.pucardsMovePhotosToStorage = async function(');
  assert.ok(fn, '단추 함수를 찾지 못했습니다.');
  assert.match(fn, /alert\(/,
    '★ 뜻밖에 멈춘 까닭을 창으로 안 띄웁니다 — 다른 알림이 덮으면 ' +
    '대표님은 아무 까닭도 못 보시고, 고칠 자리를 영영 못 찾습니다.');
  assert.match(fn, /console\.error\(/, '되짚을 기록을 안 남깁니다.');
  assert.match(fn, /_whyBox\(/, '까닭을 글자 그대로 보여 주는 칸을 안 씁니다.');
});

test('★★ 실패했으면 «처음 까닭»을 마무리에 적는다 — 숫자만으로는 못 고친다', () => {
  const fn = cutFn(html, 'window.pucardsMovePhotosToStorage = async function(');
  assert.match(fn, /if\(!firstWhy\)\s*firstWhy\s*=/,
    '처음 실패한 까닭을 담지 않습니다 — 실패 수만 보면 무엇이 잘못인지 모릅니다.');
  assert.match(fn, /failed && firstWhy/,
    '★ 담아 두고 «보여 주지» 않습니다 — 담기만 하면 아무도 못 봅니다.');
});

test('★ 원본이 없는 자리는 그냥 지나간다 — 실패로 세지 않는다', () => {
  const fn = cutFn(html, 'window.pucardsMovePhotosToStorage = async function(');
  assert.match(fn, /if\(!dataUrl[\s\S]{0,60}skipped\+\+/,
    '원본이 없는 자리를 실패로 세면, 12,000곳이 «실패»로 보여 겁이 납니다.');
});
