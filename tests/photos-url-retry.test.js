'use strict';
/* 주소가 「반만」 채워지던 것 — 다시 해 보고, 세어서 알려 준다 (2026-08-21)

   대표가 「전체 직원 사진 창고로 옮기기」를 한 번 더 누르신 뒤 실데이터를 셌다:
   사진 582장 중 창고에 있는 533장, 그중 주소가 다 채워진 것 501장, **32장은
   미리보기 주소만 있고 원본 주소가 없었다.**

   원본이 정말 창고에 없다면 미리보기도 같이 없을 것이다(둘을 한 번에 올린다).
   한쪽만 빈 것은 무더기로 돌 때 파일 metadata 읽기·쓰기가 «그때그때» 실패했다는
   뜻이다 — 그런데 옛 코드는 그 실패를 조용히 null 로 만들고, 셈에서는 그냥
   「채움」으로 세었다. 그래서 화면에는 다 된 것처럼 보이는데 큰 사진이 안 열렸고,
   대표가 버튼을 몇 번이나 눌러야 했다.

   수리 둘:
   ① 서버가 스스로 다시 해 본다(tokenUrl, 두 번까지) — 버튼을 여러 번 누르는 일이
      사라진다.
   ② 반만 채운 장수를 따로 세어 화면에 보여 준다 — 한 번 더 눌러야 하는지 안다.

   실행: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const R = path.join(__dirname, '..');
const MIG = require(path.join(R, 'functions', 'photos-migrate.js'));
const idx = fs.readFileSync(path.join(R, 'functions', 'index.js'), 'utf8');
const app = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');

/* ══════ ① 반만 채운 것을 센다 ══════ */

function server(items, urlFor) {
  const calls = { writeUrls: [] };
  const db = {
    listOwners: () => Promise.resolve(['U1']),
    listYears: () => Promise.resolve(['2026']),
    listYear: () => Promise.resolve(items),
    readItem: () => Promise.resolve(null),
    writeMigrated: () => Promise.resolve(),
    writeUrls: (u, y, id, urls) => { calls.writeUrls.push({ id, urls }); return Promise.resolve(); }
  };
  const bucket = { upload: () => Promise.resolve(), exists: () => Promise.resolve(true),
    downloadUrl: (p) => Promise.resolve(urlFor(p)) };
  return { db, bucket, calls };
}

test('★ 원본 주소만 못 만들면 「반만 채움」으로 센다 — 다 된 척하지 않는다', async () => {
  /* 이것이 실데이터의 32장과 똑같은 꼴이다: 미리보기는 되고 원본은 안 됐다. */
  const { db, bucket, calls } = server({ p1: { loc: 'storage' } },
    (p) => (/\/blobs\//.test(p) ? null : 'https://tok/' + p));
  const out = await MIG.migrateBatch(db, bucket, 30);
  assert.equal(out.partial, 1,
    '★ 반만 채운 것을 안 세면 화면에 다 된 것처럼 보이는데 큰 사진이 안 열립니다');
  assert.equal(out.linked, 1, '반만이라도 미리보기 주소는 적어 둔다 — 격자는 빨라진다');
  assert.equal(calls.writeUrls[0].urls.fullUrl, null);
});

test('둘 다 만들어지면 「반만 채움」은 0이다 — 멀쩡한 것을 문제로 세지 않는다', async () => {
  const { db, bucket } = server({ p2: { loc: 'storage' } }, (p) => 'https://tok/' + p);
  const out = await MIG.migrateBatch(db, bucket, 30);
  assert.equal(out.partial, 0);
  assert.equal(out.linked, 1);
});

test('둘 다 없는 유령은 「반만 채움」이 아니라 건너뜀이다 — 두 일을 섞지 않는다', async () => {
  const { db, bucket } = server({ p3: { loc: 'storage' } }, () => null);
  const out = await MIG.migrateBatch(db, bucket, 30);
  assert.equal(out.partial, 0, '★ 유령까지 「반만」으로 세면 영영 한 번 더 누르게 됩니다');
  assert.equal(out.skipped, 1);
});

test('★ 셈한 것을 응답과 화면이 함께 말한다 — 세고도 안 실으면 아무도 모른다', () => {
  assert.match(idx, /partial: result\.partial/, '서버 응답에 반만 채움이 없습니다');
  /* ⚠ 「반만 채움」이라는 낱말은 뒤에 붙는 안내 문장에도 나온다 — 그것만 보면
     «숫자를 보여 주는 줄»을 지워도 검사가 통과한다(실제로 그렇게 새 나갔다).
     그래서 숫자가 붙은 그 줄을 못박는다. */
  assert.match(app, /' · 반만 채움 ' \+ total\.partial/,
    '★ 화면이 반만 채운 «장수»를 안 보여 줍니다');
  assert.match(app, /total\.partial \+= \(r\.partial \|\| 0\)/,
    '★ 여러 번 도는 통과의 수를 안 더하면 마지막 한 통과의 수만 보입니다');
  assert.match(app, /한 번 더 누르면 채워집니다/,
    '★ 무엇을 해야 하는지 안 적으면 「반만 채움 32」만 보고 무슨 뜻인지 모릅니다');
});

/* ══════ ② 서버가 스스로 다시 해 본다 ══════ */

test('★ 주소 만들기를 한 번 삐끗했다고 포기하지 않는다 — 이것이 32장의 원인이다', () => {
  /* 실제 창고 감싸개는 Admin SDK 를 쓰므로 여기서 돌릴 수 없다. 대신 «다시 해 보는
     길이 코드에 있는지»를 못박는다. 없으면 32장이 또 생긴다. */
  const i = idx.indexOf('function tokenUrl(');
  assert.ok(i > 0, '★ 다시 해 보는 함수가 없습니다 — 옛 방식으로 되돌아갔습니다');
  let d = 0, fn = '';
  for (let k = idx.indexOf('{', i); k < idx.length; k++) {
    if (idx[k] === '{') d++;
    else if (idx[k] === '}') { d--; if (!d) { fn = idx.slice(i, k + 1); break; } }
  }
  assert.match(fn, /tokenUrl\(objectPath, left - 1\)/, '★ 저를 다시 부르지 않습니다');
  assert.match(fn, /if \(left <= 0\)/, '★ 그칠 곳이 없으면 영원히 돕니다');
  assert.match(fn, /setTimeout/, '곧바로 다시 하면 같은 이유로 또 막힙니다');
  assert.match(idx, /downloadUrl\(objectPath\) \{ return tokenUrl\(objectPath, 2\); \}/,
    '★ 창고 감싸개가 다시 해 보는 길을 안 씁니다');
});

test('★ this 로 저를 부르지 않는다 — 부르는 방식이 바뀌는 날 조용히 깨진다', () => {
  const i = idx.indexOf('function tokenUrl(');
  const seg = idx.slice(i, i + 1400);
  assert.ok(!/this\.downloadUrl/.test(seg),
    '★ 객체 안 this 로 되부르면 구조분해로 꺼내 쓰는 순간 죽습니다');
});

test('토큰 주소를 쓰는 까닭(만료 없음)을 그대로 지킨다 — 서명 URL 로 바꾸지 말 것', () => {
  /* ⚠ 주석에 「서명 URL(getSignedUrl)을 안 쓰는 이유」가 적혀 있다 — 왜 안 쓰는지
     남겨 둔 글이다. 주석을 걷고 «코드»만 본다. 안 그러면 설명 주석 자체가 걸려
     운다(이 저장소가 여러 번 당한 함정이다). */
  const code = idx.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*/gm, '');
  assert.ok(!/getSignedUrl/.test(code),
    '★ 서명 URL 은 만료됩니다 — 어느 날 옛 사진이 일제히 안 보입니다');
  assert.match(code, /firebaseStorageDownloadTokens/, '토큰 방식이 사라졌습니다');
});
