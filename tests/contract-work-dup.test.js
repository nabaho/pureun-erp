'use strict';
// 계약·컨설팅이 업무관리에 두 건으로 남는 문제 — node --test tests/contract-work-dup.test.js
//
// 무슨 일이 있었나
//   계약을 이관하면 컨설팅이 태어난다. 업무관리는 «계약»도 «컨설팅»도 업무로 만드므로
//   같은 일이 두 건이 된다. 원래는 푸른이알피의 동기화 엔진이 계약 업무를
//   「이관」으로 닫아 주기로 되어 있었는데, 그 엔진에 구멍이 있었다.
//
//   엔진은 처음 보는 건이면 «기준선만 찍고» 돌아간다. 그런데 아래 스냅샷 쓰기는
//   두 값(pe_closed·ws_done)을 늘 같게 적는다. 그래서 처음 본 순간 두 쪽이 어긋나 있으면
//   — 계약을 등록한 날 바로 이관하면 그렇게 된다 —
//   그 어긋남이 기준선으로 굳고, 그 뒤로는 「변한 게 없다」가 되어 영영 안 맞춰진다.
//
// 이 검사가 지키는 것
//   ① 굳은 기준선을 푼다 (원본이 정본)
//   ② 이관하는 그 순간 엔진에 신호를 보낸다
//   ③ 이관될 계약은 애초에 업무로 만들지 않는다
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const erp = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8').replace(/\r\n/g, '\n');
const work = fs.readFileSync(path.join(__dirname, '..', 'work.html'), 'utf8').replace(/\r\n/g, '\n');

function grab(src, name){
  const i = src.indexOf('function ' + name + '(');
  assert.ok(i >= 0, '못 찾음: ' + name);
  let d = 0, j = i;
  for(;;j++){ if(src[j] === '{') d++; else if(src[j] === '}'){ d--; if(!d){ j++; break; } } }
  return src.slice(i, j);
}

/* ════════════════════════════════════════════════════════════
   ① 업무시트의 「끝났나」를 한 자리에서 쓴다 (wsPutState)
   ════════════════════════════════════════════════════════════ */
function putBox(){
  const box = { String, Date, Object };
  vm.createContext(box);
  vm.runInContext(
    'function wsToday(){ return "2026-08-24"; }\n'
    + grab(erp, 'wsPutState') + '\n'
    + 'this.run=function(done,pe){ var up={}; wsPutState(up,"W1",done,pe,"NOW"); return JSON.stringify(up); };', box);
  return box;
}

test('이관된 계약은 「이관」으로 닫는다 — 어디로 갔는지도 함께 적는다', () => {
  const up = JSON.parse(putBox().run(true, { status:'transferred', transferredTo:'consulting:현콘-2026-018' }));
  assert.equal(up['work_erp/items/W1/state'], 'done');
  assert.equal(up['work_erp/items/W1/status'], '이관');
  assert.equal(up['work_erp/items/W1/end_way'], 'transfer');
  assert.equal(up['work_erp/items/W1/end_to'], 'consulting:현콘-2026-018');
  assert.equal(up['work_erp/items/W1/done_date'], '2026-08-24');
});

test('취소·종료는 그 말대로 적는다 — 「끝났다」 한 덩어리로 뭉개지 않는다', () => {
  const b = putBox();
  assert.equal(JSON.parse(b.run(true, { status:'cancelled' }))['work_erp/items/W1/status'], '취소');
  assert.equal(JSON.parse(b.run(true, { status:'closed' }))['work_erp/items/W1/status'], '종료');
});

test('되살릴 때는 종료 표시를 걷어낸다', () => {
  const up = JSON.parse(putBox().run(false, { status:'progress' }));
  assert.equal(up['work_erp/items/W1/state'], null);
  assert.equal(up['work_erp/items/W1/done_date'], null);
  assert.equal(up['work_erp/items/W1/status'], '진행중');
  assert.ok(!('work_erp/items/W1/end_way' in up), '끝낸 방식을 남겨 두면 다음에 잘못 읽힌다');
});

test('끝낸 방식을 두 군데서 따로 적지 않는다 — 한 함수만 쓴다', () => {
  const eng = erp.slice(erp.indexOf('function wsSyncRun('), erp.indexOf('function MyDeskV2('));
  assert.equal((eng.match(/wsPutState\(/g) || []).length, 2, '기준선과 본줄기 두 곳에서 같은 함수를 부른다');
  assert.ok(eng.indexOf("'/end_way'] = pw") < 0, '엔진 안에 같은 코드가 또 있으면 한쪽만 고쳐진다');
});

/* ════════════════════════════════════════════════════════════
   ② 굳은 기준선을 푼다
   ════════════════════════════════════════════════════════════ */
const 엔진 = erp.slice(erp.indexOf('function wsSyncRun('), erp.indexOf('function MyDeskV2('));

test('처음 보는데 이미 어긋나 있으면 그대로 굳히지 않는다', () => {
  const i = 엔진.indexOf('if(!snap.synced_at){');
  const 기준선 = 엔진.slice(i, 엔진.indexOf('return;', i));
  assert.match(기준선, /if\(peClosed !== wsDone\)\{ wsPutState\(up, wid, peClosed, pe, now\);/,
    '원본(푸른이알피)을 정본으로 삼아 한 번 맞춘다');
  assert.match(기준선, /pe_closed:peClosed, ws_done:peClosed/,
    '기준선 자체도 어긋나지 않게 적는다 — 안 그러면 다음 판에서 또 어긋난 것으로 읽힌다');
});

test('이미 굳어 버린 옛 기준선도 푼다', () => {
  assert.match(엔진, /var skew = \(!peChanged && !wsChanged && \(!!snap\.pe_closed !== !!snap\.ws_done\)\);/);
  assert.match(엔진, /if\(peChanged \|\| wsChanged \|\| skew\)\{/, '변화가 없어도 이때는 들어간다');
  assert.match(엔진, /if\(skew\)\{ want = peClosed; \}/, '원본이 정본');
});

test('굳은 기준선인지 알아보는 근거가 코드에 남아 있다 — 스냅샷은 늘 두 값을 같게 적는다', () => {
  // 이 전제가 깨지면 skew 판정이 헛돈다. 그래서 여기서 함께 못박는다.
  assert.match(엔진, /pe_closed:want, ws_done:want/);
});

test('사람이 방금 손댄 건은 skew 로 가로채지 않는다 — 되살린 것을 도로 닫으면 안 된다', () => {
  // skew 는 «양쪽 다 안 바뀌었을 때» 만 참이 된다
  assert.match(엔진, /skew = \(!peChanged && !wsChanged &&/);
});

/* ════════════════════════════════════════════════════════════
   ③ 이관하는 그 순간 엔진을 깨운다
   ════════════════════════════════════════════════════════════ */
test('이관이 끝나면 동기화 신호를 찍는다 — 푸른이알피를 다시 열 때까지 기다리지 않는다', () => {
  const f = grab(erp, 'wsPingSync');
  assert.match(f, /fbDb\.ref\('work_erp\/sync_ping'\)\.set\(/);
  assert.match(f, /from:'transfer'/);
  assert.match(f, /catch/, '신호를 못 보내도 이관 자체는 굴러가야 한다');
});

test('이관하는 두 길에서 모두 신호를 찍는다 (보통 이관 · 덜 끝난 이관 정리)', () => {
  const d = grab(erp, 'doTransfer').length ? erp.slice(erp.indexOf('async function doTransfer('),
    erp.indexOf('// 필터 (다중 kinds + 담당자)')) : '';
  assert.equal((d.match(/wsPingSync\(\)/g) || []).length, 2);
});

test('그 신호는 엔진이 이미 지켜보던 것이다 — 새 배관을 놓지 않았다', () => {
  assert.match(erp, /var ref = fbDb\.ref\('work_erp\/sync_ping'\);/);
  assert.match(erp, /wsSyncRun\(null,onlyWid\|\|null\)/);
});

test('되먹임이 없다 — 엔진은 items 에만 쓰고 신호는 안 건드린다', () => {
  assert.ok(엔진.indexOf('sync_ping') < 0, '엔진이 신호를 쓰면 제가 쓴 걸 제가 듣고 끝없이 돈다');
});

/* ════════════════════════════════════════════════════════════
   ④ 이관될 계약은 업무로 만들지 않는다
   ════════════════════════════════════════════════════════════ */
function xferBox(){
  const box = { String };
  vm.createContext(box);
  vm.runInContext(
    work.match(/var PE_XFER_KIND=\{[^}]*\};/)[0] + '\n'
    + grab(work, 'peWillTransfer') + '\n'
    + 'this.f=peWillTransfer;', box);
  return box.f;
}

test('사건·컨설팅·기금·기타 계약은 이관된다 — 그것이 진짜 업무가 된다', () => {
  const f = xferBox();
  ['case', 'consulting', 'fund', 'other'].forEach(k => {
    assert.equal(f({ kinds:[k] }), true, k + ' 을 놓쳤다');
  });
});

test('상담사항·업체계약은 이관돼도 업무가 안 생긴다 — 그래서 이건 업무로 만든다', () => {
  const f = xferBox();
  assert.equal(f({ kinds:['consult'] }), false, '상담사항은 이관 자체가 없다');
  assert.equal(f({ kinds:['company'] }), false, '업체관리로 가는데 업체는 업무가 아니다');
  assert.equal(f({ kinds:['consult', 'company'] }), false);
});

test('종류가 섞여 있으면 하나라도 이관 대상이면 이관된다', () => {
  assert.equal(xferBox()({ kinds:['company', 'consulting'] }), true);
});

test('옛 자료(kind 하나짜리)와 빈 값도 넘어진다', () => {
  const f = xferBox();
  assert.equal(f({ kind:'consulting' }), true, '옛날에는 kinds 가 아니라 kind 였다');
  assert.equal(f({ kind:'consult' }), false);
  assert.equal(f({}), false);
  assert.equal(f({ kinds:[] }), false);
  assert.equal(f(null), false);
});

test('이관될 계약은 새 업무로 만들지 않는다', () => {
  const auto = work.slice(work.indexOf('function peAutoSync('), work.indexOf('function puerpModal('));
  assert.match(auto, /if\(d\[0\]==='contract'&&peWillTransfer\(x\)\) c0\.xfer=1;/);
  const i = auto.lastIndexOf('cand.forEach(function(c){');   // 앞의 것은 미러용 — 뒤의 것이 «만드는» 자리다
  const 만드는곳 = auto.slice(i, i + 900);
  assert.match(만드는곳, /if\(c\.xfer\) return;/);
  assert.ok(만드는곳.indexOf('if(c.xfer) return;') < 만드는곳.indexOf("up[NS+'/pe_seen/'"),
    'pe_seen 에 적기 전에 빠져야 한다 — 적어 두면 종류가 바뀌어도 영영 안 만들어진다');
});

test('이미 연결된 계약 업무의 미러는 끊지 않는다 — 후보에서 통째로 빼지 않았다', () => {
  const auto = work.slice(work.indexOf('function peAutoSync('), work.indexOf('function puerpModal('));
  assert.match(auto, /cand\.push\(c0\);/, '표시만 달고 후보에는 넣는다');
  // 미러는 candByRef 를 본다 — 후보에 없으면 담당자·업무명이 안 따라온다
  assert.match(auto, /var c=candByRef\[k\]; if\(!c\) return;/);
});

test('손으로 [가져오기] 하는 길은 막지 않는다 — 사람이 일부러 고른 것이다', () => {
  const p = grab(work, 'puerpCandidates');
  assert.ok(p.indexOf('peWillTransfer') < 0);
});
