'use strict';
/* 백업에 담기는 주민등록번호를 잠근다 (대표 지시 2026-08-29)

   「푸른 화면에서는 주민번호가 보여야 한다. 그렇게 해야 업무 작업이 가능하다.
     하지만 백업 시 주번 암호화해야 된다.」

   ★ 그래서 이 검사가 지키는 것은 «두 쪽» 이다 —
     ① 백업으로 나가는 사본에는 주민번호가 «글자 그대로» 남지 않는다
     ② 그런데 화면과 살아 있는 자료는 «건드리지 않는다»(업무가 돌아가야 한다)
   ★ 그리고 되돌리기가 반드시 풀어야 한다 — 안 풀면 주민번호 자리에
     enc:v1:… 이 들어가 「자료가 깨졌다」로 보인다. 그게 제일 나쁜 결말이다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

const R = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(R, 'js', 'pu-rrn-seal.js'), 'utf8');
const erp = fs.readFileSync(path.join(R, 'pu-erp.html'), 'utf8');

const ctx = {
  crypto: webcrypto, TextEncoder, TextDecoder, Promise, Array, Object, Error, String, JSON,
  btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
  atob: (s) => Buffer.from(s, 'base64').toString('binary'),
  Uint8Array,
};
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(src, ctx);
const S = ctx.PuRrnSeal;

/* ⚠ 잠금 모듈은 vm 안(다른 realm)에서 돈다 — 거기서 만든 객체는 «생김새가 같아도»
   host 의 것과 prototype 이 달라 deepEqual 이 통과하지 못한다. 한 번 JSON 을
   거쳐 host 쪽 객체로 되돌린 뒤 견준다(값을 견주려는 것이지 realm 을 견주는 게 아니다). */
const 값만 = (x) => JSON.parse(JSON.stringify(x));

const 자료 = () => ({
  companies: [{ name: '가나상사', bizNo: '123-45-67890',
    workers: [{ name: '홍길동', rrn: '900101-1234567', phone: '010-1111-2222' },
              { name: '김철수', rrn: '8501011234567' }] }],
  user_accounts: { p001: { name: '권형하', rrn: '700101-1234567', role: 'admin' } },
  기타: { 법인등록번호: '110111-1234567', 빈칸: '', 메모: '주민번호를 확인할 것' },
});

test('★ 백업 사본에는 주민번호가 글자 그대로 남지 않는다', async () => {
  const key = await S.importKey(S.newKeyB64());
  const 잠금 = await S.seal(자료(), key);
  const 글자 = JSON.stringify(잠금);
  for (const rrn of ['900101-1234567', '8501011234567', '700101-1234567']) {
    assert.ok(글자.indexOf(rrn) < 0,
      '★ 백업에 주민번호가 그대로 남아 있습니다: ' + rrn);
  }
});

test('★ 주민번호 «말고는» 건드리지 않는다 — 업무 자료가 바뀌면 안 된다', async () => {
  const key = await S.importKey(S.newKeyB64());
  const 잠금 = await S.seal(자료(), key);
  assert.equal(잠금.companies[0].name, '가나상사');
  assert.equal(잠금.companies[0].workers[0].name, '홍길동');
  assert.equal(잠금.companies[0].workers[0].phone, '010-1111-2222');
  /* 사업자등록번호(10자리)는 주민번호가 아니다 — 잠그면 안 된다 */
  assert.equal(잠금.companies[0].bizNo, '123-45-67890');
  /* 「주민번호」라는 말이 든 메모는 값이 주민번호가 아니다 — 칸 이름이 아니라 값이다 */
  assert.equal(잠금.기타.메모, '주민번호를 확인할 것');
  assert.equal(잠금.기타.빈칸, '', '빈 칸을 잠그면 푼 뒤 모양이 달라집니다');
});

test('★ 되돌리면 «글자 하나까지» 그대로 돌아온다 — 안 그러면 업무가 멈춘다', async () => {
  const key = await S.importKey(S.newKeyB64());
  const 원본 = 자료();
  const 되돌림 = await S.unseal(await S.seal(자료(), key), key);
  assert.deepEqual(값만(되돌림), 원본);
});

test('★ 원본을 «고치지 않는다» — 같은 덩어리로 요약·id명부를 만들기 때문', async () => {
  const key = await S.importKey(S.newKeyB64());
  const d = 자료();
  await S.seal(d, key);
  assert.equal(d.companies[0].workers[0].rrn, '900101-1234567',
    '★ 잠그면서 원본까지 바꿨습니다 — 백업 요약이 어긋납니다.');
});

test('★ 남의 열쇠로는 못 푼다 — 못 풀어야 잠근 뜻이 있다', async () => {
  const a = await S.importKey(S.newKeyB64());
  const b = await S.importKey(S.newKeyB64());
  const 잠금 = await S.seal(자료(), a);
  await assert.rejects(() => S.unseal(잠금, b));
});

test('★ 같은 값도 잠글 때마다 «다른 글자» 가 된다 — 같으면 견줘서 알아낼 수 있다', async () => {
  const key = await S.importKey(S.newKeyB64());
  const 하나 = await S.sealOne('900101-1234567', key);
  const 둘 = await S.sealOne('900101-1234567', key);
  assert.notEqual(하나, 둘, '★ 두 번 잠근 값이 같으면 「누가 누구와 같은 번호인가」가 드러납니다.');
});

test('★ 잠금이 생기기 «전» 백업은 그대로 지나간다 — 옛 백업 스무 벌을 손볼 일이 없다', async () => {
  const key = await S.importKey(S.newKeyB64());
  const 옛것 = 자료();
  const 결과 = await S.unseal(옛것, key);
  assert.deepEqual(값만(결과), 자료(), '★ 안 잠긴 옛 백업을 풀다가 깨뜨렸습니다.');
});

test('★ 두 번 잠그지 않는다 — 겹쳐 잠그면 한 번 풀어서는 안 열린다', async () => {
  const key = await S.importKey(S.newKeyB64());
  const 한번 = await S.seal(자료(), key);
  const 두번 = await S.seal(한번, key);
  assert.deepEqual(값만(await S.unseal(두번, key)), 자료());
});

/* ══════════════════════════════════════════════════════════════════════════
   화면 쪽 배선 — 여기가 끊기면 위의 모든 것이 소용없다 */

test('★ 백업을 «쓰는» 길이 잠금을 거친다', () => {
  assert.match(erp, /<script src="js\/pu-rrn-seal\.js(\?v=\d+)?"><\/script>/,
    '★ 잠금 모듈을 안 불러옵니다.');
  const w = erp.slice(erp.indexOf('function serverBackupWrite(id, snap){'), erp.indexOf('function _serverBackupWriteRaw'));
  assert.match(w, /erpSealSnap\(snap\)/, '★ 백업을 잠그지 않고 씁니다.');
});

test('★ 잠글 수 없으면 «백업을 쓰지 않는다» — 안 잠긴 백업이 더 나쁘다', () => {
  const w = erp.slice(erp.indexOf('function serverBackupWrite(id, snap){'), erp.indexOf('function _serverBackupWriteRaw'));
  assert.match(w, /catch\(function\(e\)\{/, '★ 실패를 안 잡습니다.');
  assert.match(w, /throw e;/, '★ 실패했는데 성공한 척 넘어갑니다.');
  assert.match(w, /erpAlert/,
    '★ 조용히 건너뛰면 「백업이 도는 줄 알았다」가 됩니다 — 소리 내어 알려야 합니다.');
});

test('★ 백업을 «읽는» 길은 «모두» 푼다 — 한 곳이라도 빠지면 그 길로 enc:v1: 이 들어간다', () => {
  /* ⚠ 개수를 박지 않는다. 「백업 본문을 읽는 자리마다 바로 뒤에 푸는 줄이 있는가」를 본다. */
  const re = /await fbDb\.ref\((?:q|entry)\.path \+ '\/' \+ (?:q|entry)\.fbKey\)\.once\('value'\);/g;
  const sites = [...erp.matchAll(re)];
  assert.ok(sites.length >= 3, '백업 본문을 읽는 자리를 못 찾았습니다(' + sites.length + '곳)');
  for (const m of sites) {
    const after = erp.slice(m.index, m.index + 400);
    assert.match(after, /erpUnsealSnap\(/,
      '★ 백업을 읽고 «안 푸는» 자리가 있습니다 — 그 길로 되돌리면 주민번호 자리에\n' +
      '  enc:v1:… 이 들어가 자료가 깨진 것처럼 보입니다.\n  ' + after.split('\n')[0]);
  }
});

test('★ 열쇠는 «없을 때만» 넣는다 — 갈아치우면 옛 백업 스무 벌을 못 푼다', () => {
  const k = erp.slice(erp.indexOf('function erpBackupKey('), erp.indexOf('function erpSealSnap('));
  assert.match(k, /transaction\(/,
    '★ set 으로 넣으면 두 관리자가 같은 순간에 처음 켤 때 열쇠가 덮어써집니다.');
  assert.match(k, /cur \|\| made/, '★ 이미 있는 열쇠를 갈아치우면 옛 백업을 영영 못 풉니다.');
});

/* ★ 2026-08-29 실제로 낼 뻔한 사고 —
   「있으면 그대로, 없으면 만들기」를 transaction 하나로 하면 **둘째 날부터 백업이 멈춘다.**
   transaction 은 같은 값을 돌려줘도 쓰기를 한 번 보내는데, 규칙이 열쇠를 못 바꾸게
   `!data.exists()` 로 막고 있어 그 쓰기가 거부되기 때문이다. 규칙과 코드가 «따로»
   맞아 보여도 «함께» 돌리면 안 맞는 자리다 — 그래서 규칙 쪽이 아니라 여기에 못 박는다. */
test('★ 이미 열쇠가 있으면 «읽기만» 한다 — 안 그러면 둘째 날부터 백업이 멈춘다', () => {
  const k = erp.slice(erp.indexOf('function erpBackupKey('), erp.indexOf('function erpSealSnap('));
  /* 먼저 읽는 자리가 있어야 하고, 있으면 그대로 돌려줘야 한다 */
  assert.match(k, /once\('value'\)/,
    '★ 먼저 읽지 않고 곧바로 transaction 을 겁니다 — 있는 열쇠에 쓰기를 시도해\n' +
    '  규칙(!data.exists())에 막히고, 그러면 백업이 아예 안 떠집니다.');
  assert.match(k, /if\(have\) return have;/,
    '★ 읽어 놓고도 그 값을 안 쓰면 읽은 뜻이 없습니다.');
  /* 남이 먼저 넣어 막혔을 때 다시 읽는 길 */
  assert.match(k, /\.then\(read, read\)/,
    '★ 두 사람이 같은 순간에 처음 켜면 한쪽은 규칙에 막힙니다 — 그때 다시 읽어\n' +
    '  먼저 넣은 쪽의 열쇠를 써야 합니다. 안 그러면 그 기기는 영영 백업을 못 뜹니다.');
});
