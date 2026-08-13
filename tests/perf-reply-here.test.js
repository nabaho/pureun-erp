'use strict';
// 성과급 이의 답변을 업무관리에서 — node --test tests/perf-reply-here.test.js
//
// 방향: 역할로 나눈다.
//   계산·조정·발행·마감 = 푸른이알피 / 확인·이의·답변 = 업무관리
// 왜: 전에는 대표가 업무관리 「전체 현황」에서 이의를 «보기만» 하고,
//     답변은 푸른이알피 「확인 현황」에서 해야 했다. 같은 자료를 두 화면에서
//     보면서 손은 한 곳에서만 쓸 수 있으니 늘 오갔다.
//     그리고 직원에게는 「확인이 남았습니다」 띠가 뜨는데 대표에게는 아무것도 없어
//     이의가 올라와도 열어봐야 알았다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'work.html'), 'utf8').replace(/\r\n/g, '\n');

function grab(name){
  const i = src.indexOf('function ' + name + '(');
  assert.ok(i >= 0, name + ' 를 찾지 못했다');
  let d = 0, j = i;
  for(;;j++){ if(src[j] === '{') d++; else if(src[j] === '}'){ d--; if(!d){ j++; break; } } }
  return src.slice(i, j);
}

/* ── 답변을 여기서 쓴다 ── */
test('대표가 업무관리에서 답변을 쓴다', () => {
  assert.match(src, /function pcReply\(ym,sid,fid\)\{/);
  assert.match(src, /답변하고 닫기/);
});

test('쓰는 자리는 직원이 못 쓰는 items/<fid>/reply 다', () => {
  const r = grab('pcReplyRef');
  assert.match(r, /PC_PATH\+'\/'\+ym\+'\/p\/'\+sid\+'\/items\/'\+fid\+'\/reply'/);
});

test('답변 모양이 푸른이알피가 쓰던 것과 같다', () => {
  // 두 곳이 다른 모양으로 쓰면 한쪽에서 답한 것이 다른 쪽에서 안 닫힌다
  const r = grab('pcReply');
  assert.match(r, /text:t\.slice\(0,500\)/, '길이 제한도 같아야 한다');
  assert.match(r, /at:new Date\(\)\.toISOString\(\)/);
  assert.match(r, /by:pcMySid\(\)/);
  assert.match(r, /state:'done'/);
  const erp = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8').replace(/\r\n/g, '\n');
  const e = erp.slice(erp.indexOf('function pcfReply('), erp.indexOf('function pcfReply(') + 400);
  assert.match(e, /text: String\(text\|\|''\)\.slice\(0,500\), at:new Date\(\)\.toISOString\(\), by:by\|\|'', state:'done'/);
});

test('빈 답변은 저장하지 않는다', () => {
  const r = grab('pcReply');
  assert.match(r, /if\(t\.length<2\)\{ toast\('답변을 적어주세요','err'\); return; \}/);
});

test('두 번 눌러도 두 번 저장되지 않는다', () => {
  const r = grab('pcReply');
  assert.match(r, /btn\.disabled=true; btn\.textContent='저장 중…'/);
  assert.match(r, /btn\.disabled=false; btn\.textContent='답변하고 닫기'/, '실패하면 다시 눌릴 수 있어야 한다');
});

test('저장 뒤 다시 읽어 화면·띠·배지를 맞춘다', () => {
  // 안 읽으면 방금 답한 이의가 그대로 열려 보인다
  assert.match(grab('pcReply'), /return pcRefresh\(\)\.then\(route\);/);
});

test('실패하면 조용히 넘어가지 않는다', () => {
  assert.match(grab('pcReply'), /toast\('답변 저장 실패 — '\+\(e&&e\.message\|\|''\),'err'\)/);
});

/* ── 엉뚱한 사람에게 쓰지 않는다 ── */
test('★ 사본 안의 p.sid 를 믿지 않는다', () => {
  // 사본이 잘못 발행되면 남의 칸에 답변이 들어간다 — 화면이 고른 사번을 그대로 넘긴다
  assert.match(src, /h\+= sel \? pcAdmOneHTML\(ym, sel, all\[sel\], mask\)/);
  assert.match(src, /function pcAdmOneHTML\(ym, sid, p, mask\)\{/);
  assert.ok(src.indexOf("escJ(p.sid||'')") < 0, 'p.sid 로 경로를 만들면 안 된다');
});

test('아직 안 답한 이의에만 답변칸이 난다', () => {
  assert.match(src, /if\(st==='obj' && ob && !\(it\.reply && it\.reply\.state==='done'\)\)\{/);
});

/* ── 역할 나누기가 지켜진다 ── */
test('금액은 여기서 못 고친다 — 원본으로 보낸다', () => {
  const r = grab('pcReply');
  assert.ok(!/amount|total|pct/.test(r));
  assert.match(src, /금액을 고쳐야 하면 푸른이알피 <b>입금관리 → 성과분배<\/b>에서 고친 뒤 다시 발행하세요/);
});

test('마감은 여전히 푸른이알피에서 한다', () => {
  assert.match(src, /푸른이알피 성과관리 → 확인 현황에서 마감하세요/);
});

test('대표가 직원의 확인·이의·완료를 대신 누르지 못한다', () => {
  const adm = src.slice(src.indexOf('function pcAdminHTML'), src.indexOf('/* ── 안내 띠'));
  ['pcSetOk(', 'pcSaveObj(', 'pcMarkDone(', 'pcWithdrawObj('].forEach(function(f){
    assert.ok(adm.indexOf(f) < 0, f + ' 가 대표 화면에 있으면 안 된다');
  });
});

/* ── 대표에게 알린다 ── */
test('답할 이의를 세는 곳이 하나다 (띠와 배지가 어긋나지 않게)', () => {
  assert.equal((src.match(/function pcAdmPending\(\)/g) || []).length, 1);
  const p = grab('pcAdmPending');
  assert.match(p, /if\(w\.k!=='obj'\) return;/, '이의가 열린 사람만 센다');
  assert.match(p, /n\+=w\.open\.length/, '건수');
  assert.match(p, /people\+\+/, '사람 수');
  assert.match(p, /if\(d>oldest\) oldest=d;/, '가장 오래된 것이 며칠째인지');
});

test('상단 띠가 대표에게도 뜬다', () => {
  const b = grab('pcBand');
  assert.match(b, /성과급 이의 '\+a\.n\+'건이 답을 기다립니다/);
  assert.match(b, /답변하러 가기 →/);
});

test('내 확인이 먼저다 (내 일이 남았으면 그것부터)', () => {
  // 대표도 직원이다. 자기 확인이 남았는데 남의 이의부터 보이면 순서가 뒤집힌다
  const b = grab('pcBand');
  assert.match(b, /if\(!pend\.length && S\.view!=='perf'\)\{/);
});

test('성과급 화면에서는 띠를 띄우지 않는다', () => {
  const b = grab('pcBand');
  assert.match(b, /S\.view!=='perf'/);
  assert.match(b, /if\(!pend\.length \|\| S\.view==='perf'\)\{ el\.style\.display='none'/);
});

test('오래 기다린 이의는 붉게 — 며칠째인지 함께 보여준다', () => {
  const b = grab('pcBand');
  assert.match(b, /var slow=a\.oldest>=3;/);
  assert.match(b, /가장 오래된 것 '\+a\.oldest\+'일째/);
});

test('메뉴 배지가 내 확인 + 답할 이의를 함께 센다', () => {
  assert.match(src, /\.filter\(function\(x\)\{return !x\.p\.done;\}\)\.length \+ pcAdmPending\(\)\.n;/);
});

/* ── 화면 너비 ── */
test('성과급 화면은 넓은 모니터에서 늘어나지 않는다', () => {
  // 최대 너비가 없어 「확인한 때」가 화면 끝에 붙어 있었다
  const r = grab('renderPerf');
  assert.match(r, /var h='<div style="max-width:860px">';/);
  assert.match(r, /app\.innerHTML=h\+'<\/div>';/, '연 칸은 닫아야 한다');
});

test('#app 전체를 좁히지는 않는다 (업무 목록은 넓어야 한다)', () => {
  assert.match(src, /#app\{padding:18px 22px 90px\}/);
});

/* ── 실제로 돌려 본다 ── */
test('세는 함수가 실제로 맞게 센다', () => {
  const box = { S:{}, Date:Date };
  vm.createContext(box);
  vm.runInContext(grab('pcDaysAgo') + '\n' + grab('pcWho') + '\n' + grab('pcAdmPending')
    + '\nthis.f=pcAdmPending;', box);
  const days = (n) => new Date(Date.now() - n * 86400000).toISOString();
  box.S.perfAll = [
    { ym:'2026-07', all:{
      u1:{ items:{ a:{}, b:{} }, objection:{ byItem:{ a:{ text:'다릅니다', at:days(5) },
                                                     b:{ text:'이것도', at:days(1) } } } },
      u2:{ done:true, items:{ c:{} } },
      u3:{ items:{ d:{} } },                                   // 미확인 — 이의는 아니다
      u4:{ items:{ e:{} }, objection:{ byItem:{ e:{ text:'답 받음', at:days(9) } } },
           /* 답이 달린 이의는 닫힌 것 */ } } },
    { ym:'2026-06', all:{
      u5:{ items:{ f:{} }, objection:{ byItem:{ f:{ text:'물렸음', at:days(20), withdrawnAt:days(19) } } } } } }
  ];
  box.S.perfAll[0].all.u4.items.e.reply = { text:'확인했습니다', state:'done' };
  const r = box.f();
  assert.equal(r.n, 2, '열린 이의만 — 답한 것·물린 것은 빼고');
  assert.equal(r.people, 1);
  assert.equal(r.oldest, 5, '가장 오래된 것');
  assert.deepEqual(Array.from(r.months), ['7월']);
});

test('답할 이의가 없으면 0 이다 (띠도 배지도 안 뜬다)', () => {
  const box = { S:{ perfAll:[] }, Date:Date };
  vm.createContext(box);
  vm.runInContext(grab('pcDaysAgo') + '\n' + grab('pcWho') + '\n' + grab('pcAdmPending')
    + '\nthis.f=pcAdmPending;', box);
  assert.equal(box.f().n, 0);
  // 대표가 아니면 S.perfAll 이 빈 손으로 온다(서버가 막는다) — 그래도 터지지 않아야 한다
  box.S.perfAll = null;
  assert.equal(box.f().n, 0);
});
