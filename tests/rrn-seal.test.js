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

/* ══════════════════════════════════════════════════════════════════════════
   공용 백업(js/pu-backup.js) — 2026-09-07

   ⚠ 왜 뒤늦게 붙었나: 위 검사들은 «pu-erp.html 하나»만 보고 있었다. 그런데 공용
     부품이 기금(임원 주민등록번호)·경력관리(주민번호)·취업규칙·명함·급여OS·업무를
     서른 시점씩 뜨면서 «안 잠갔다». 대표 지시는 「백업 시」이고, 이것도 백업이다.
     열린 문은 아니었다(systemBackups 는 관리자·위임관리인만 읽는다) — 그러나
     잠금을 만든 까닭이 「백업은 오래 남고, 옮겨 다니고, 아무도 안 본다」였다.
   ★ 이 검사가 «진짜 함수를 돌리는» 까닭: 글자만 보면 「부르는 줄이 있다」까지만 안다.
     열쇠를 두 번 쓰는지, 잠글 것이 없을 때 열쇠를 건드리는지는 돌려 봐야 안다. */
const bak = fs.readFileSync(path.join(R, 'js', 'pu-backup.js'), 'utf8');

/* 부품 안의 함수 하나를 떼어 온다 — 함수들은 IIFE 안 두 칸 들여쓰기라 끝이 '\n  }' 다 */
function 조각(이름) {
  const i = bak.indexOf('function ' + 이름 + '(');
  assert.ok(i >= 0, '★ ' + 이름 + ' 을 못 찾았습니다');
  const 끝 = bak.indexOf('\n  }', i);
  assert.ok(끝 > i, '★ ' + 이름 + ' 의 끝을 못 찾았습니다');
  return bak.slice(i, 끝 + 4);
}

/* 가짜 서버 — «실제 보안규칙과 같게» 굴린다.
   backup_key 는 `!data.exists()` 라 이미 있으면 쓰기가 거부된다. 그 거부를 흉내내지
   않으면 「둘째 날부터 백업이 멈추는」 버그를 검사가 통과시킨다. */
function 가짜서버(이미있는열쇠) {
  const store = {};
  if (이미있는열쇠) store['backup_key/v1'] = 이미있는열쇠;
  const 셈 = { 읽기: 0, 쓰기시도: 0, 거부: 0 };
  return {
    셈, store,
    ref(p) {
      return {
        once() {
          셈.읽기++;
          const v = store[p];
          return Promise.resolve({ val: () => (v === undefined ? null : v) });
        },
        transaction(fn) {
          셈.쓰기시도++;
          const cur = store[p] === undefined ? null : store[p];
          if (cur !== null) { 셈.거부++; return Promise.reject(new Error('PERMISSION_DENIED')); }
          const next = fn(cur);
          if (next !== undefined && next !== null) store[p] = next;
          return Promise.resolve({ committed: true, snapshot: { val: () => store[p] } });
        }
      };
    }
  };
}

/* 진짜 sealEntries·unsealBackup 을 돌릴 틀 */
function 백업틀(seal오버라이드) {
  const c = {
    Promise, Array, Object, Error, String, JSON, Number,
    window: { PuRrnSeal: seal오버라이드 === undefined ? S : seal오버라이드 }
  };
  vm.createContext(c);
  vm.runInContext("var SEAL_KEY_PATH = 'backup_key/v1';\n" + 조각('sealEntries') + '\n' + 조각('unsealBackup'), c);
  return c;
}

const 칸들 = () => [
  { path: 'fund_erp', exists: true, value: {
    funds: { f1: { name: '가나기금', officers: [
      { role: '이사장', name: '홍길동', rrn: '900101-1234567' },
      { role: '감사', name: '김철수' }] } } } },
  { path: 'work_erp', exists: false }
];

test('★★ 공용 백업도 잠근다 — 기금 임원 주민등록번호가 서른 시점에 쌓인다', async () => {
  const c = 백업틀(), db = 가짜서버();
  const out = await c.sealEntries(db, 칸들());
  const 글자 = JSON.stringify(값만(out));
  assert.ok(글자.indexOf('900101-1234567') < 0,
    '★★ 공용 백업에 주민등록번호가 글자 그대로 담깁니다.');
  assert.ok(글자.indexOf('가나기금') >= 0, '★ 주민번호 말고 다른 것까지 잠갔습니다.');
  assert.ok(글자.indexOf('홍길동') >= 0, '★ 이름을 잠그면 백업 요약이 어긋납니다.');
});

test('★★ 잠근 뒤 되돌리면 글자 하나까지 돌아온다 — 공용 백업 쪽 왕복', async () => {
  const c = 백업틀(), db = 가짜서버();
  const 잠금 = await c.sealEntries(db, 칸들());
  const 풀림 = await c.unsealBackup(db, { paths: 잠금, system: 'fund' });
  assert.deepEqual(값만(풀림.paths), 값만(칸들()));
  assert.equal(풀림.system, 'fund', '★ 푸는 동안 백업의 다른 칸이 사라졌습니다.');
});

test('★★ 잠글 것이 «없으면» 열쇠를 건드리지 않는다 — 주민번호 없는 앱의 백업이 멎는다', async () => {
  const c = 백업틀(), db = 가짜서버();
  const 맹칸 = [{ path: 'work_erp', exists: true, value: { tasks: { t1: { title: '회의' } } } }];
  const out = await c.sealEntries(db, 맹칸);
  assert.deepEqual(값만(out), 값만(맹칸));
  assert.equal(db.셈.읽기, 0,
    '★★ 잠글 것이 없는데 열쇠 칸을 읽습니다 — 그 칸은 관리자만 읽어서,\n' +
    '  주민번호가 없는 앱(업무·전자서명)의 백업이 권한 때문에 통째로 멎습니다.');
  assert.equal(db.셈.쓰기시도, 0, '★★ 잠글 것도 없는데 열쇠를 만들려 듭니다.');
});

test('★★ 열쇠가 이미 있으면 «읽기만» 한다 — 쓰면 규칙에 막혀 둘째 날부터 멈춘다', async () => {
  const c = 백업틀(), db = 가짜서버(S.newKeyB64());
  await c.sealEntries(db, 칸들());
  assert.ok(db.셈.읽기 >= 1, '★ 있는 열쇠를 읽지도 않았습니다.');
  assert.equal(db.셈.쓰기시도, 0,
    '★★ 있는 열쇠에 쓰기를 보냅니다 — 규칙이 !data.exists() 로 막으므로 거부되고,\n' +
    '  열쇠를 만든 «둘째 날부터» 이 앱의 백업이 아예 안 떠집니다.');
});

test('★ 열쇠가 없으면 한 번 만들고, 만든 그 열쇠로 잠근다', async () => {
  const c = 백업틀(), db = 가짜서버();
  const 잠금 = await c.sealEntries(db, 칸들());
  assert.ok(db.store['backup_key/v1'], '★ 열쇠를 안 만들었습니다.');
  /* 만든 열쇠로 진짜 풀리는가 — 「만들기만 하고 다른 것으로 잠갔다」를 잡는다 */
  const key = await S.importKey(db.store['backup_key/v1']);
  const 풀림 = await S.unseal(잠금, key);
  assert.equal(값만(풀림)[0].value.funds.f1.officers[0].rrn, '900101-1234567');
});

test('★★ 잠금 부품이 없으면 «백업을 쓰지 않는다» — 안 잠긴 백업이 더 나쁘다', async () => {
  const c = 백업틀(null), db = 가짜서버();
  await assert.rejects(() => c.sealEntries(db, 칸들()), /pu-rrn-seal/,
    '★★ 부품이 없는데 그냥 씁니다 — 주민번호가 맨몸으로 서른 시점에 쌓입니다.');
});

test('★★ 잠긴 백업인데 부품이 없으면 «복원을 멈춘다» — 그게 제일 나쁜 결말이다', async () => {
  const 잠금 = await (async () => {
    const c = 백업틀(), db = 가짜서버();
    return c.sealEntries(db, 칸들());
  })();
  const c2 = 백업틀(null), db2 = 가짜서버();
  await assert.rejects(() => c2.unsealBackup(db2, { paths: 값만(잠금) }), /pu-rrn-seal/,
    '★★ 못 푸는 백업을 그대로 씁니다 — 주민번호 자리에 enc:v1:… 이 들어가고,\n' +
    '  그 화면을 저장하는 순간 진짜 번호가 사라집니다.');
});

test('★ 잠금 «전» 옛 백업은 부품이 없어도 그대로 복원된다 — 옛 서른 벌을 손볼 일이 없다', async () => {
  const c = 백업틀(null), db = 가짜서버();
  const 옛것 = { paths: 값만(칸들()) };
  const 결과 = await c.unsealBackup(db, 옛것);
  assert.deepEqual(값만(결과.paths), 값만(칸들()));
});

test('★★ 셈(countToSeal)과 실제 잠금이 «어긋나지 않는다»', async () => {
  /* 어긋나면 둘 중 하나다: 셈이 0이라 열쇠를 안 가져왔는데 잠글 것이 있었다(터진다),
     또는 셈은 있는데 안 잠갔다(맨몸으로 나간다). 그래서 같은 walk 를 쓴다. */
  const d = 자료();
  const key = await S.importKey(S.newKeyB64());
  assert.equal(S.countToSeal(d), S.countSealed(await S.seal(d, key)),
    '★★ 「잠글 것이 몇인가」와 「실제로 몇을 잠갔나」가 다릅니다.');
  assert.equal(S.countToSeal({ tasks: { t1: { title: '회의' } } }), 0,
    '★ 주민번호가 없는데 잠글 것이 있다고 셉니다 — 그 앱 백업이 열쇠 권한에 걸립니다.');
});

/* ── 배선 — 여기가 끊기면 위의 모든 것이 소용없다 ── */

test('★★ 크기를 «재기 전에» 잠근다 — 재고 나서 잠그면 16MB 한도를 넘겨 통째로 거부된다', () => {
  const cs = 조각('createSnapshot');
  const a = cs.indexOf('sealEntries('), b = cs.indexOf('trimForWrite(');
  assert.ok(a >= 0, '★★ 공용 백업이 잠금을 아예 안 거칩니다.');
  assert.ok(b >= 0, '★ 크기 지킴이를 못 찾았습니다.');
  assert.ok(a < b,
    '★★ 크기를 «먼저» 재고 잠급니다. 잠근 값은 열세 자리에서 백 자리 가까이로 늘어나\n' +
    '  한도를 넘기고, 서버가 조각조각 거부해 백업이 영원히 성공하지 못합니다(2026-08-16).');
});

test('★★ 되돌리기는 «쓰기 전에» 푼다', () => {
  const r = 조각('restore');
  const a = r.indexOf('unsealBackup('), b = r.indexOf('restorePlan(');
  assert.ok(a >= 0, '★★ 복원이 안 풀고 씁니다 — 주민번호 자리에 enc:v1:… 이 들어갑니다.');
  assert.ok(a < b, '★★ 계획을 먼저 세우고 나중에 풉니다 — 푼 값이 쓰이지 않습니다.');
});

test('★★ 공용 백업을 쓰는 화면은 «모두» 잠금 부품을 먼저 부른다', () => {
  /* ⚠ 개수를 박지 않는다 — 앱이 늘어도 안 깨지게, 「부르는 화면마다」를 본다.
     ★ 순서까지 본다. 뒤에 부르면 pu-backup.js 가 볼 때 window.PuRrnSeal 이 아직 없어
       첫 백업이 「부품을 못 불러왔습니다」로 실패한다. */
  const 화면 = fs.readdirSync(R).filter(f => f.endsWith('.html'));
  const 쓰는곳 = [];
  for (const f of 화면) {
    const s = fs.readFileSync(path.join(R, f), 'utf8');
    const b = s.indexOf('js/pu-backup.js');
    if (b < 0) continue;
    쓰는곳.push(f);
    const k = s.indexOf('js/pu-rrn-seal.js');
    assert.ok(k >= 0, '★★ ' + f + ' 가 공용 백업을 쓰는데 잠금 부품을 안 부릅니다 —\n' +
      '  이 앱의 백업은 첫 시도부터 실패합니다(안 잠근 채로 쓰지는 않습니다).');
    assert.ok(k < b, '★★ ' + f + ' 가 잠금 부품을 «나중에» 부릅니다 — 순서가 뒤바뀌면\n' +
      '  pu-backup.js 가 볼 때 아직 부품이 없어 백업이 실패합니다.');
  }
  assert.ok(쓰는곳.length >= 10, '공용 백업을 쓰는 화면을 못 찾았습니다(' + 쓰는곳.length + '곳)');
});
