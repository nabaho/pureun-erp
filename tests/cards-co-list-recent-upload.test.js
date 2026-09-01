'use strict';
/* 기업 상세 목록 차례 — 사진첩에서 최근에 올린 순서로 (대표 지시 2026-09-01)
   ═══════════════════════════════════════════════════════════════════════════
   ■ 대표 지시
     「기업상세 에서 리스트업순서를 최근 마지막에 사진첩에서 업로드한 것을
      순서대로해라」

   ■ 「사진첩에서 업로드한 것」을 어떻게 가리나
     사진첩이 명함·등록증을 기업정보함으로 보낼 때(js/pu-doc-file.js createOne)
     그 항목에 source:'pu-photos' 와 createdAt(=올린 때, takenAt)을 남긴다.
     손으로 「+ 명함 등록」한 것은 이 표가 없다 — 그 회사는 «사진첩 업로드»가 아니다.
     서식(신청서 등)은 회사 정보(coInfo/{회사}/docs/{열쇠})로 가고, 그 서류의 doc.at
     이 올린 때다(js/pu-doc-file.js sendToCoInfo).
     한 회사의 «가장 최근»은 이 셋(사진첩발 명함·사진첩발 등록증·서식) 중 가장 큰 값이다.

   ★ 여기서 못 박는 것
     ① 사진첩에서 온 등록증의 올린 때를 본다
     ② 사진첩에서 온 명함의 올린 때도 본다
     ③ 손으로 등록한 것(source 없음)은 «세지 않는다» — 사진첩 업로드가 아니다
     ④ 서식(coInfo 서류)의 올린 때도 본다 — 셋 중 가장 큰 값이 회사의 값이다
     ⑤ 아무것도 없으면 0이다 — 지어내지 않는다
     ⑥ CO_SORT 에 정렬 잣대로 있다
     ⑦ 기본 차례가 «이 잣대 · 최근 먼저»다 — 화면을 열자마자 이 순서로 보인다
   실행: node --test tests/cards-co-list-recent-upload.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8').replace(/\r\n/g, '\n');

function fnBody(name){
  const i = SRC.indexOf('\nfunction ' + name + '(');
  assert.ok(i >= 0, name + ' 를 찾지 못했다');
  const open = SRC.indexOf('{', i);
  let d = 0;
  for (let k = open; k < SRC.length; k++) {
    if (SRC[k] === '{') d++;
    else if (SRC[k] === '}') { d--; if (!d) return SRC.slice(i, k + 1); }
  }
  assert.fail(name + ' 의 끝을 찾지 못했다');
}
function load(){
  const ctx = { console, Object, String, Number, Array, Math };
  vm.createContext(ctx);
  vm.runInContext(fnBody('coLastUploadAt'), ctx);
  return ctx;
}
const CO = (o) => Object.assign({ key:'k1', name:'가나테크', bizs:[], cards:[], extra:{} }, o || {});

/* ══════ ①② 사진첩에서 온 것의 올린 때 ══════ */
test('★ 사진첩에서 온 등록증의 올린 때를 본다', () => {
  const c = load();
  const o = CO({ bizs:[{ source:'pu-photos', createdAt:1000 }] });
  assert.equal(c.coLastUploadAt(o), 1000);
});
test('사진첩에서 온 명함의 올린 때도 본다', () => {
  const c = load();
  const o = CO({ cards:[{ source:'pu-photos', createdAt:2000 }] });
  assert.equal(c.coLastUploadAt(o), 2000);
});

/* ══════ ③ 손으로 등록한 것은 안 센다 ══════ */
test('★ 손으로 등록한 명함(source 없음)은 세지 않는다 — 사진첩 업로드가 아니다', () => {
  const c = load();
  const o = CO({ cards:[{ createdAt:9999999 }] });   /* source 없음 — 손으로 등록 */
  assert.equal(c.coLastUploadAt(o), 0,
    '★ 손으로 넣은 것까지 세면 「사진첩에서 올린 순서」가 아니라 그냥 「넣은 순서」가 된다');
});

/* ══════ ④ 서식(coInfo 서류)도 본다 ══════ */
test('★ 서식(coInfo 서류)의 올린 때도 본다 — 셋 중 가장 큰 값이 회사의 값이다', () => {
  const c = load();
  const o = CO({
    bizs:[{ source:'pu-photos', createdAt:1000 }],
    cards:[{ source:'pu-photos', createdAt:2000 }],
    extra:{ docs:{ d1:{ at:3000 }, d2:{ at:500 } } }
  });
  assert.equal(c.coLastUploadAt(o), 3000);
});

/* ══════ ⑤ 아무것도 없으면 0 ══════ */
test('아무것도 없으면 0이다 — 지어내지 않는다', () => {
  const c = load();
  assert.equal(c.coLastUploadAt(CO()), 0);
});

/* ══════ ⑥ CO_SORT 에 있다 ══════ */
test('★ CO_SORT 에 정렬 잣대로 있다', () => {
  const at = SRC.indexOf('const CO_SORT = {');
  const end = SRC.indexOf('\nfunction coSorted', at);
  const seg = SRC.slice(at, end);
  assert.match(seg, /uploaded\s*:/, '★ 정렬 목록에 「최근 업로드」 잣대가 없다');
  assert.match(seg, /coLastUploadAt\(/, '잣대가 coLastUploadAt 을 안 쓴다 — 딴 값으로 정렬된다');
});

/* ══════ ⑦ 기본 차례 ══════ */
test('★★ 기본 차례가 «최근 업로드 먼저»다 — 화면을 열면 바로 이 순서로 보인다', () => {
  const m = SRC.match(/coSort\s*:\s*\{key:'(\w+)',\s*dir:'(\w+)'\}/);
  assert.ok(m, 'state.coSort 기본값을 찾지 못했다');
  assert.equal(m[1], 'uploaded', '★★ 기본 잣대가 최근 업로드가 아니다');
  assert.equal(m[2], 'desc', '★★ 최근이 «먼저» 와야 한다 — asc 면 오래된 것부터 나온다');
});
