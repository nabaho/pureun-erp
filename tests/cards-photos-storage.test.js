/* 명함첩 원본 사진을 파일 창고(Storage)로 — 대표 결정 2026-08-09

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
  const tryAt = body.search(/try\s*\{\s*await Store\._putToBucket/);
  const catchAt = body.search(/\}\s*catch\(e\)\{\s*failed\+\+/);
  const delAt = body.indexOf('.remove()');
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
  /* 옮긴 것은 실시간DB 에서 지우므로, 다시 실행하면 남은 것만 읽힌다 */
  assert.ok(/photos`\)\.once\('value'\)/.test(m[0]),
    '남아 있는 것만 읽어야 이어서 하기가 됩니다.');
  assert.ok(/이미 끝났습니다/.test(m[0]), '다 끝났을 때 아무 말이 없으면 고장으로 보입니다.');
});

test('깨진 값은 지우지 않고 남겨 둔다', () => {
  const m = html.match(/window\.pucardsMovePhotosToStorage = async function\(\)\{[\s\S]*?\n\};/);
  assert.ok(/indexOf\('data:'\)!==0\)\{ skipped\+\+; continue; \}/.test(m[0]),
    '빈 값·깨진 값을 창고에 올리려다 실패하고 지우면 안 됩니다.');
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
