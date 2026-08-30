/* 기업정보함 기업 상세 — 들어가면 화면이 계속 멈추던 것.
   실행: node --test tests/*.test.js

   대표 화면 2026-08-16: "기업상세 에 들어가면 계속해서 화면이 멈춘다 근본적 해결 부탁한다."
   콘솔에 파이어베이스 오류가 1,000건 넘게(1ms 간격) 쏟아지고 있었다.

   ★ 잰 값 (명함 6,270 · 사업자 346 · 회사 4,100)
       50줄만 그리는데 53ms — 그중 51ms 가 «회사 목록 다시 조립»이었다.
       조립을 기억해 두면 53ms → 2.4ms (22배). 「50개씩 보기」로는 안 줄던 고정비다.
     여기에 명함·폴더·회사정보 세 곳을 실시간으로 듣고 있어, 저장이 한 건 오갈 때마다
     그 53ms 를 통째로 다시 치렀다. 저장이 몰리면 화면이 계속 멈춘 것처럼 보인다.

   ★ 여기서 못 박는 것
     ① 회사 목록은 자료가 바뀌지 않는 한 다시 조립하지 않는다 (느려지면 고친 뜻이 없다)
     ② 자료가 들어오는 문에서는 «반드시» 새로 조립한다 (새 명함이 조용히 안 나오면 안 된다)
     ③ 몰아친 다시 그리기는 한 번으로 묶되, 밀린 것을 «건너뛰지는» 않는다
     ④ 다음에 또 멈추면 화면이 스스로 원인을 말한다 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8');

/* ══════ ① 회사 목록을 기억해 둔다 ══════ */

function loadCoCache(){
  const i = src.indexOf('/* ══════ 회사 목록 다시 조립하기 — 순수 로직 (테스트 대상) ══════');
  assert.ok(i >= 0, '시작 표식 못찾음');
  const j = src.indexOf('function coListBuild(){', i);
  assert.ok(j > i, 'coListBuild 를 못찾음');
  const ctx = { console, Object, Array, String, Number, Math, JSON };
  ctx.builds = 0;
  /* 2026-08-30: 자료가 바뀌는 문(coListBust)에서 세금계산서 발급처 «자동 채우기»가
     깨어난다. 이 검사가 보는 것은 «다시 조립하는가» 뿐이라 대역은 아무 일도 안 한다. */
  ctx.taxAutoSoon = () => {};
  vm.createContext(ctx);
  vm.runInContext(src.slice(i, j) + '\nfunction coListBuild(){ builds++; return [{key:"k"+builds}]; }', ctx);
  return ctx;
}

test('두 번 물어도 한 번만 조립한다', () => {
  /* renderCoPage 는 한 번 그릴 때 coList() 를 두 번 부른다(목록 + 갈래 개수). */
  const C = loadCoCache();
  C.coList(); C.coList();
  assert.equal(C.builds, 1);
});

test('열 번을 물어도 한 번만 조립한다', () => {
  const C = loadCoCache();
  for (let i = 0; i < 10; i++) C.coList();
  assert.equal(C.builds, 1);
});

test('같은 답을 그대로 돌려준다 — 물을 때마다 다른 것이 나오면 안 된다', () => {
  const C = loadCoCache();
  assert.equal(C.coList(), C.coList());
});

test('자료가 들어오면 다시 조립한다 — 새 명함이 조용히 안 나오면 안 된다', () => {
  const C = loadCoCache();
  C.coList();
  C.coListBust();
  C.coList();
  assert.equal(C.builds, 2);
});

test('새로 조립하라고 한 뒤에는 새 답을 준다', () => {
  const C = loadCoCache();
  const a = C.coList();
  C.coListBust();
  assert.notEqual(C.coList(), a);
});

/* ══════ ② 자료가 들어오는 문에서 반드시 새로 뽑는다 ══════ */

test('명함·회사정보·푸른이알피 세 문에서 모두 새로 조립한다', () => {
  /* 한 곳만 빠져도 그 자료로 바뀐 회사가 목록에 조용히 안 나타난다. */
  const doors = [
    ["watchCardMap(this.db.ref(DB_ROOT+'/items')", '명함이 들어오는 문'],
    /* ⚠ 짚는 것은 «들어오는 길(경로)» 이지 «구독 방식» 이 아니다.
       2026-08-23 coInfo 를 건별 구독으로 바꾸자 on('value') 를 찾던 표시가 못 찾았다 —
       규칙(들어오는 문에서 새로 뽑는다)은 하나도 안 바뀌었는데도 그랬다(CLAUDE.md). */
    ["DB_ROOT+'/coInfo'", '회사정보가 들어오는 문'],
  ];
  doors.forEach(([mark, what]) => {
    const i = src.indexOf(mark);
    assert.ok(i > 0, what + ' 을 못 찾음');
    assert.ok(src.slice(i, i + 220).includes('coListBust()'), what + ' 에서 새로 안 뽑는다');
  });
  /* 푸른이알피는 다 읽은 «뒤»에 준비 완료로 바뀐다 — 그 자리에서 새로 뽑아야 한다 */
  const erp = src.indexOf('ErpMatch.ready=true;');
  assert.ok(erp > 0, '푸른이알피 준비 자리를 못 찾음');
  assert.ok(src.slice(erp, erp + 160).includes('coListBust()'), '푸른이알피를 다 읽고도 새로 안 뽑는다');
});

test('이 PC에만 저장하는 길(로컬)에서도 새로 뽑는다', () => {
  const i = src.indexOf('else { state.items[it.id]=it;');
  assert.ok(i > 0, '로컬 저장 자리를 못 찾음');
  assert.ok(src.slice(i, i + 140).includes('coListBust()'));
});

/* ══════ ③ 몰아친 다시 그리기를 한 번으로 묶는다 ══════ */

function loadBurst(){
  const i = src.indexOf('function makeBurstRunner(');
  assert.ok(i >= 0, 'makeBurstRunner 를 못찾음');
  const j = src.indexOf('const _soonTick', i);
  const ctx = { console };
  vm.createContext(ctx);
  vm.runInContext(src.slice(i, j), ctx);
  return ctx;
}

test('같은 프레임에 몰린 것은 한 번만 그린다', () => {
  const C = loadBurst();
  let queued = null, ran = 0;
  const run = C.makeBurstRunner(fn => { queued = fn; }, () => ran++);
  for (let i = 0; i < 500; i++) run();
  assert.equal(ran, 0, '아직 그리기 전이어야 한다');
  queued();
  assert.equal(ran, 1, '500번 몰렸어도 한 번만 그려야 한다');
});

test('밀린 그리기를 건너뛰지 않는다 — 저장한 것이 화면에 안 보이면 안 된다', () => {
  const C = loadBurst();
  let queued = null, ran = 0;
  const run = C.makeBurstRunner(fn => { queued = fn; }, () => ran++);
  run(); queued();
  assert.equal(ran, 1);
  run(); queued();
  assert.equal(ran, 2, '다음 것도 반드시 그려야 한다');
});

test('그리다 잘못돼도 다음 그리기가 막히지 않는다', () => {
  const C = loadBurst();
  let queued = null, ran = 0;
  const run = C.makeBurstRunner(fn => { queued = fn; }, () => { ran++; });
  run(); queued();
  run();
  assert.ok(queued, '다음 것이 예약돼야 한다');
  queued();
  assert.equal(ran, 3 - 1);
});

test('실시간으로 들어오는 자리들이 묶어 그리기를 쓴다', () => {
  /* 사람이 누른 것은 묶지 않는다 — 실시간 자리만이다. */
  [["watchCardMap(this.db.ref(DB_ROOT+'/items')", 'renderSoon()'],
   ["watchCardMap(this.db.ref(DB_ROOT+'/groups')", 'renderSoon()'],
   ["DB_ROOT+'/coInfo'", 'renderCoSoon()'],
   ["DB_ROOT+'/coFolders'", 'renderCoSoon()'],
   ["DB_ROOT+'/coTagHidden'", 'renderCoSoon()']].forEach(([mark, want]) => {
    const i = src.indexOf(mark);
    assert.ok(i > 0, mark + ' 을 못 찾음');
    /* 건별 구독은 줄이 나뉘므로 넉넉히 본다 — 보는 것은 «누구를 부르나» 다 */
    assert.ok(src.slice(i, i + 420).includes(want), mark + ' 이 아직 바로 그린다');
  });
});

/* ══════ ④ 다음에 또 멈추면 스스로 이름을 댄다 ══════ */

function loadWatch(){
  const i = src.indexOf('function coWatchVerdict(');
  const j = src.indexOf('let _coWatch', i);
  const ctx = { console, Object, Array, String, Number, Math };
  vm.createContext(ctx);
  vm.runInContext(src.slice(i, j), ctx);
  return ctx;
}

const norm = { renders: 2, builds: 1, blockedMs: 0, pending: 0, parked: 0 };

test('멀쩡하면 멀쩡하다고 한다 — 없는 문제를 지어내지 않는다', () => {
  const C = loadWatch();
  /* vm 밖과 안의 Array 는 서로 다른 것이라 내용으로 견준다 */
  const v = C.coWatchVerdict(norm);
  assert.equal(v.length, 1);
  assert.equal(v[0], '눈에 띄는 문제 없음');
});

test('서버가 거부한 저장이 있으면 그것을 첫째로 짚는다', () => {
  const C = loadWatch();
  const v = C.coWatchVerdict(Object.assign({}, norm, { parked: 7 }));
  assert.match(v[0], /거부한 저장 7건/);
});

test('저장이 몰려 다시 그리기가 잦으면 그렇게 말한다', () => {
  const C = loadWatch();
  const v = C.coWatchVerdict(Object.assign({}, norm, { renders: 40 }));
  assert.ok(v.some(x => /40번 다시 그렸/.test(x)));
});

test('회사 목록을 여러 번 조립하면 짚어 준다 — 기억해 두기가 깨진 것이다', () => {
  const C = loadWatch();
  const v = C.coWatchVerdict(Object.assign({}, norm, { builds: 30 }));
  assert.ok(v.some(x => /30번 다시 조립/.test(x)));
});

test('오래 멈춰 있었으면 몇 ms 인지 말한다', () => {
  const C = loadWatch();
  const v = C.coWatchVerdict(Object.assign({}, norm, { blockedMs: 2400 }));
  assert.ok(v.some(x => /2400ms/.test(x)));
});

test('기업 상세를 열면 지켜보기가 켜진다', () => {
  const i = src.indexOf('function openCoPage()');
  assert.ok(src.slice(i, i + 700).includes('coWatchStart()'), '열어도 안 지켜본다');
});
