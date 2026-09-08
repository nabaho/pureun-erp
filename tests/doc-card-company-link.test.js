'use strict';
/* ══════ 상호가 안 보여도 «그 회사» 명함이 된다 (대표 지시 2026-08-31) ══════
   대표 지시: 「사진첩에 기업의 정보를 화면 캡처로 합쳐서 정리하는 경우가 여러 번 있다.
   이럴 경우 담당자 정보를 별도 기업정보함에서 기업의 이름이 보이지 않더라도 정확하게
   찾아서 연결시켜 기업정보함 명함에 정확히 넣어라」

   ■ 무엇이 문제였나
     두 쪽짜리 신청서의 2쪽에는 담당자 정보만 있고 상호는 1쪽에 있다. 판독은 문서를
     통째로 하지만 상호 칸을 못 읽으면 mapTo 가 «빈 값을 아예 안 싣기» 때문에,
     명함의 회사 칸이 빈 채로 만들어진다.
     실제 화면에 그 자국이 남아 있었다 — 증빙 딱지가 「기업정보함 — 한재수」,
     즉 회사 이름 자리에 «사람 이름»이 적혀 있었다(회사가 비어서 이름으로 물러난 것).
     회사가 없는 명함은 기업 상세에서 어느 회사에도 안 붙는다 — 사람 따로, 회사 따로.

   ■ 어떻게 찾나 — 사업자번호가 «회사를 가리키는 유일한 값»이다
     ① pucards/bykey/b{번호} → 그 번호를 가진 등록증의 번호
     ② pucards/idx/{번호} → 그 등록증의 상호(c)
     ③ 없으면 pucards/coInfo/{번호}/company — 서식이 채워 둔 회사 이름

   ★ 여기서 못 박는 것
     ① 상호를 못 읽어도 사업자번호로 «찾아» 채운다
     ② 등록증이 없으면 기업 상세에 적힌 이름으로 물러난다
     ③ 목록을 통째로 훑지 «않는다» — 두세 칸만 읽는다
     ④ «다시 맞춰 본다» — 번호가 바뀐 옛 열쇠로 남의 회사를 붙이면 안 된다
     ⑤ 서류에 적힌 이름이 «먼저»다 — 찾은 것으로 덮지 않는다
     ⑥ 못 찾아도 명함은 만든다. 다만 못 찾았다고 «말한다»
   실행: node --test tests/doc-card-company-link.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const FILE = fs.readFileSync(path.join(ROOT, 'js', 'pu-doc-file.js'), 'utf8');
const READ = fs.readFileSync(path.join(ROOT, 'js', 'pu-doc-read.js'), 'utf8');
const PHOTOS = fs.readFileSync(path.join(ROOT, 'pu-photos.html'), 'utf8');

/* ── 진짜 층을 세운다. 서버만 대역이다 ─────────────────────────────
   ⚠ 대역이 «읽은 자리»를 다 적어 둔다 — 「목록을 통째로 훑지 않는다」를
     말이 아니라 «잰 것»으로 지키려면 그 자국이 있어야 한다. */
function boot(db){
  /* ⚠ 「번호 한 칸으로 찾기」가 켜진 상태로 세운다. 이 표시가 없으면 findExisting 이
     «옛 방식»으로 색인을 통째로 훑는다 — 그것은 이 파일이 보려는 것이 아니다
     (실제 배포에는 이 표시가 있다). 없으면 애먼 자리에서 실패한다. */
  db = Object.assign({ 'pucards/config/bykeyAt': 1 }, db || {});
  const reads = [];
  let seq = 0;
  const ref = (p) => ({
    once: () => { reads.push(p); return Promise.resolve({ val: () => db[p == null ? '' : p] }); },
    update: (u) => { Object.keys(u).forEach(k => { db[k] = u[k]; }); return Promise.resolve(); },
    set: (v) => { db[p] = v; return Promise.resolve(); },
    push: () => ({ key: 'new' + (++seq) })
  });
  const sandbox = { console, Promise, Object, String, Number, Array, Date, Math, JSON, RegExp,
    setTimeout, window: {} };
  sandbox.global = sandbox; sandbox.self = sandbox; sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(READ, sandbox);
  vm.runInContext(FILE, sandbox);
  const F = sandbox.window.PuDocFile || sandbox.PuDocFile;
  assert.ok(F, 'PuDocFile 을 세우지 못했다');
  F.init({ db: { ref: ref } });
  return { F, reads, db };
}
/* 두 쪽 신청서: 담당자는 읽혔고 «상호는 못 읽었다» */
const 담당자만 = { name:'한재수', dept:'경영지원', title:'팀장',
  tel:'041-000-2001', mobile:'010-1200-0018', email:'cust21@ganabsol.com',
  bizno:'304-81-18380' };

/* ── ①② 찾아서 채운다 ─────────────────────────────────────────── */

test('★ 상호를 못 읽어도 사업자번호로 «찾아» 채운다 — 등록증에서', async () => {
  const { F } = boot({
    'pucards/bykey/b3048118380': 'biz9',
    'pucards/idx/biz9': { k:'biz', bz:'304-81-18380', c:'가나비솔루션' }
  });
  const res = await F.sendToCards({ kind:'form', fields: 담당자만 });
  assert.equal(res.coFilled, '가나비솔루션',
    '★ 회사를 못 찾으면 그 사람은 어느 회사에도 안 붙는다 — 사람 따로 회사 따로 뜬다');
});

test('★ 등록증이 없으면 «기업 상세»에 적힌 이름으로 물러난다', async () => {
  const { F } = boot({ 'pucards/coInfo/3048118380/company': '가나비솔루션' });
  const res = await F.sendToCards({ kind:'form', fields: 담당자만 });
  assert.equal(res.coFilled, '가나비솔루션',
    '★ 등록증이 아직 없는 회사도 서식이 이름을 적어 두었을 수 있다');
});

test('둘 다 없으면 «지어내지 않는다» — 빈 것이 틀린 것보다 낫다', async () => {
  const { F } = boot({});
  const res = await F.sendToCards({ kind:'form', fields: 담당자만 });
  assert.ok(!res.coFilled, '★ 못 찾았는데 무언가를 붙였다: ' + res.coFilled);
  assert.equal(res.coMissing, true, '★ 못 찾았다는 것을 안 알리면 빈 명함이 조용히 쌓인다');
});

/* ── ③ 값싸게 찾는다 ───────────────────────────────────────────── */

test('★ 목록을 통째로 훑지 «않는다» — 두세 칸만 읽는다', async () => {
  /* 사진 한 장마다 색인 6천 줄을 내려받던 그 실수를 되풀이하지 않는다 */
  const { F, reads } = boot({
    'pucards/bykey/b3048118380': 'biz9',
    'pucards/idx/biz9': { k:'biz', bz:'304-81-18380', c:'가나비솔루션' }
  });
  await F.sendToCards({ kind:'form', fields: 담당자만 });
  const 통째 = reads.filter(p => /\/idx$|\/items$|data\/companies/.test(p));
  assert.deepEqual(통째, [],
    '★ 목록을 통째로 읽었다 — 사진 한 장마다 그만큼 돈이 나간다: ' + reads.join(' · '));
  const 회사찾기 = reads.filter(p => p.indexOf('bykey/b') >= 0 || p.indexOf('coInfo/') >= 0
    || p.indexOf('/idx/biz9') >= 0);
  assert.ok(회사찾기.length <= 3,
    '★ 회사 하나 찾는 데 ' + 회사찾기.length + '칸을 읽었다: ' + 회사찾기.join(' · '));
});

test('사업자번호가 없으면 «찾지도 않는다» — 헛돈이 나가면 안 된다', async () => {
  const { F, reads } = boot({});
  await F.sendToCards({ kind:'form', fields: { name:'한재수', mobile:'010-1200-0018' } });
  assert.deepEqual(reads.filter(p => p.indexOf('bykey/b') >= 0 || p.indexOf('coInfo/') >= 0), [],
    '★ 찾을 열쇠도 없는데 서버를 읽었다: ' + reads.join(' · '));
});

/* ── ④ 다시 맞춰 본다 ─────────────────────────────────────────── */

test('★ 번호가 «바뀐» 등록증의 옛 열쇠로 남의 회사를 붙이지 않는다', async () => {
  const { F } = boot({
    'pucards/bykey/b3048118380': 'biz9',
    /* 그 등록증은 번호를 다른 것으로 고쳤다 — 옛 열쇠만 남아 있다 */
    'pucards/idx/biz9': { k:'biz', bz:'134-86-05772', c:'엉뚱한회사' }
  });
  const res = await F.sendToCards({ kind:'form', fields: 담당자만 });
  assert.ok(!res.coFilled,
    '★ 옛 열쇠를 그대로 믿어 「' + res.coFilled + '」를 붙였다 — 남의 회사다');
});

test('가리킨 것이 «명함»이면 회사 이름으로 안 쓴다', async () => {
  const { F } = boot({
    'pucards/bykey/b3048118380': 'c9',
    'pucards/idx/c9': { k:'card', bz:'304-81-18380', c:'엉뚱한회사' }
  });
  assert.ok(!(await F.sendToCards({ kind:'form', fields: 담당자만 })).coFilled);
});

test('가리킨 등록증이 지워졌으면 조용히 넘어간다', async () => {
  const { F } = boot({ 'pucards/bykey/b3048118380': 'biz9' });
  const res = await F.sendToCards({ kind:'form', fields: 담당자만 });
  assert.equal(res.coMissing, true);
});

/* ── ⑤ 서류에 적힌 이름이 먼저다 ──────────────────────────────── */

test('★ 서류에 상호가 «적혀 있으면» 찾은 것으로 덮지 않는다', async () => {
  const { F, reads } = boot({
    'pucards/bykey/b3048118380': 'biz9',
    'pucards/idx/biz9': { k:'biz', bz:'304-81-18380', c:'옛이름' }
  });
  const res = await F.sendToCards({
    kind:'form', fields: Object.assign({}, 담당자만, { company:'가나비솔루션' }) });
  assert.ok(!res.coFilled, '★ 서류에 적힌 이름을 찾은 이름으로 덮었다');
  assert.ok(!res.coMissing, '이름이 있는데 「못 찾았다」고 하면 안 된다');
  assert.deepEqual(reads.filter(p => p.indexOf('bykey/b') >= 0), [],
    '★ 이미 이름이 있는데 찾으러 갔다 — 헛돈이다');
});

/* ── ⑥ 화면이 그 사실을 말한다 ────────────────────────────────── */

/* 알림 글귀를 «돌려» 본다 — 글자를 찾는 것만으로는 「false ? …」로 꺼 버린 고장이
   그냥 통과한다(2026-08-31 고장넣기에서 실제로 샜다). */
function coNote(res){
  const at = PHOTOS.indexOf('const coNote =');
  assert.ok(at > 0, '★ 찾아 붙인 사실을 알리는 자리가 없다');
  const end = PHOTOS.indexOf(';', PHOTOS.indexOf(': (res.coMissing', at));
  assert.ok(end > at, '그 자리의 끝을 찾지 못했다');
  const ctx = { res: res };
  vm.createContext(ctx);
  /* ⚠ vm 에서는 최상위 const 가 «칸의 값이 되지 않는다» — var 로 바꿔 실어야 꺼내 볼 수
     있다. 이 저장소에서 여러 번 밟은 함정이다(cards-cond-chip 의 COND_LABEL 도 같다). */
  vm.runInContext(PHOTOS.slice(at, end + 1).replace(/^\s*const /, 'var '), ctx);
  assert.ok(typeof ctx.coNote === 'string', '알림 글귀를 꺼내지 못했다');
  return ctx.coNote;
}

test('★ 사진첩이 «무엇에 붙였는지» 말한다 — 조용히 붙이면 틀려도 모른다', () => {
  const a = coNote({ coFilled:'가나비솔루션' });
  assert.ok(a.indexOf('가나비솔루션') > 0,
    '★ 어느 회사에 붙였는지 안 말한다 — 틀리게 붙어도 알아챌 길이 없다: ' + JSON.stringify(a));
  const b = coNote({ coMissing:true });
  assert.ok(b.indexOf('못 찾았') > 0,
    '★ 못 찾았을 때 아무 말이 없다 — 회사 칸이 빈 명함이 조용히 쌓인다: ' + JSON.stringify(b));
  assert.equal(coNote({}), '', '아무 일도 없었으면 아무 말도 안 한다');
  assert.match(PHOTOS, /message: \(res\.message \|\| ''\) \+ coNote/,
    '★ 만들어 놓고 화면에 안 붙이면 아무도 못 본다');
});

test('★ 증빙 딱지에 «회사» 이름이 남는다 — 사람 이름으로 물러나지 않는다', () => {
  /* 실제 화면에 「기업정보함 — 한재수」이 남아 있었다. 회사가 비어 사람 이름으로
     물러난 것인데, 나중에 증빙을 되짚을 때 어느 회사 것인지 알 수가 없다. */
  const at = PHOTOS.indexOf("markFiledUsed(id, year, '기업정보함 — '");
  assert.ok(at > 0, '증빙 딱지를 붙이는 자리를 찾지 못했다');
  const seg = PHOTOS.slice(at, at + 260);
  assert.match(seg, /res\.coFilled/,
    '★ 찾아 붙인 회사를 딱지에 안 쓴다 — 「기업정보함 — 한재수」이 그대로 남는다');
  assert.ok(seg.indexOf('read.fields.company') < seg.indexOf('res.coFilled'),
    '서류에 적힌 이름이 먼저다');
});

/* ── 이미 있는 명함도 채워진다 ───────────────────────────────── */

test('★ 이미 있는 명함의 «빈 회사 칸»도 이때 채워진다', async () => {
  /* 그 사람 명함이 회사 없이 먼저 만들어져 있었다 — 실제로 겪은 자국이다 */
  /* ⚠ boot 가 «세운 자리»를 받아 본다. 넣어 준 객체를 그대로 들여다보면 boot 가
     만든 사본을 못 보고 늘 「안 채웠다」가 된다(2026-08-31 에 실제로 헛돌았다). */
  const { F, db } = boot({
    'pucards/bykey/b3048118380': 'biz9',
    'pucards/idx/biz9': { k:'biz', bz:'304-81-18380', c:'가나비솔루션' },
    'pucards/bykey/c01012000018': 'card7',
    'pucards/idx/card7': { k:'card', m:'010-1200-0018', n:'한재수' },
    'pucards/items/card7': { id:'card7', kind:'card', name:'한재수', company:'' }
  });
  const res = await F.sendToCards({ kind:'form', fields: 담당자만 });
  assert.equal(res.created, false,
    '★ 같은 담당자가 서식마다 새 명함으로 쌓인다 — 명함과 같은 기준(휴대폰)으로 봐야 한다');
  assert.equal(db['pucards/items/card7/company'], '가나비솔루션',
    '★ 빈 회사 칸을 안 채웠다 — 그 사람은 계속 어느 회사에도 안 붙는다');
});
