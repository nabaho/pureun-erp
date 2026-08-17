/* 명함첩 — 팝업은 사진을 기다리지 않는다.
   실행: node --test tests/*.test.js

   대표 보고 2026-08-15: "폰에서 창 열 때 약 2초 걸린다. 모든 팝업이 이 정도로 늦다."

   **재서 원인을 잡았다.** 팝업을 만드는 JS 는 4ms 인데, 상세·수정창이 썸네일을
   서버에서 받을 때까지 **아무것도 안 그리고 돌아갔다**(`if (it.thumb === undefined)
   { ensureThumbs(...).then(다시 열기); return; }`). 서버가 350ms 면 팝업도 361ms —
   지연이 통신 시간을 그대로 따라갔다. 폰은 왕복이 느리고, 첫 화면에서 명함 6천 장
   (1.7MB)을 받는 동안 작은 조회가 그 뒤에 줄을 서서 2초가 됐다.

   이름·회사·전화·이메일은 **이미 메모리에 있다.** 먼저 띄우고 사진은 오면 끼운다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8');

function load(){
  const a = '/* ══════ 팝업은 먼저, 사진은 나중 — 순수 로직 (테스트 대상) ══════';
  const b = '/* ══════ 팝업은 먼저, 사진은 나중 — 화면 ══════ */';
  const i = src.indexOf(a), j = src.indexOf(b);
  assert.ok(i >= 0, '시작 표식 못찾음');
  assert.ok(j > i, '끝 표식 못찾음');
  const ctx = { console, Object, Array, String, Number, JSON, document: null, state: { items:{} }, Store: {}, $: null };
  vm.createContext(ctx);
  vm.runInContext(src.slice(i, j), ctx);
  return ctx;
}

/* ── 사진 자리 ── */

test('아직 안 받은 사진은 빈 자리를 미리 만들어 둔다', () => {
  /* 자리가 없으면 나중에 사진이 와도 넣을 곳이 없어 창을 통째로 다시 그려야 한다. */
  const C = load();
  const h = C.photoSlot('dphoto', undefined, 'k1', 'dphoto');
  assert.match(h, /id="dphoto"/, '자리를 안 만듭니다');
  assert.match(h, /display:none/, '빈 자리가 보이면 안 됩니다');
  assert.ok(!/src=/.test(h), '아직 없는 사진에 src 를 넣습니다');
});

test('이미 받은 사진은 곧바로 보인다', () => {
  const C = load();
  const h = C.photoSlot('dphoto', 'data:image/png;base64,AAA', 'k1', 'dphoto');
  assert.match(h, /src="data:image\/png;base64,AAA"/);
  assert.ok(!/display:none/.test(h), '가진 사진을 감춥니다');
});

test('사진이 없는 것으로 «확인된» 명함은 자리를 안 만든다', () => {
  /* '' 는 「받아 봤더니 없더라」다. 빈 칸만 남기지 않는다. */
  const C = load();
  assert.equal(C.photoSlot('dphoto', '', 'k1', 'dphoto'), '');
});

test('누르면 그 사진을 크게 보는 자리로 이어진다', () => {
  const C = load();
  assert.match(C.photoSlot('dphoto2', undefined, 'k1_b', 'dphoto'), /zoom\('k1_b'\)/);
});

test('덧붙일 모양이 있으면 함께 넣는다', () => {
  const C = load();
  const h = C.photoSlot('dphoto2', 'x', 'k1_b', 'dphoto', 'margin-top:-6px');
  assert.match(h, /margin-top:-6px/);
});

/* ── 늦게 온 사진 끼워 넣기 ── */

function fakeDom(cardId, ids){
  const els = {};
  ids.forEach(id => { els[id] = { id, src:'', style:{display:'none'}, removed:false,
    remove(){ this.removed = true; } }; });
  return {
    els,
    getElementById: id => (id==='detailM' || id==='pcDetail')
      ? { dataset:{ cardId } }
      : (els[id] || null)
  };
}

test('★ 늦게 온 사진을 열려 있는 창에 끼워 넣는다', () => {
  const C = load();
  const dom = fakeDom('k1', ['dphoto','dphoto2']);
  C.document = dom; C.$ = id => dom.getElementById(id);
  C.state.items = { k1: { id:'k1', thumb:'THUMB', thumb2:'' } };
  C.Store = { getPhoto: () => ({ then(){ /* 원본은 이 검사에서 안 본다 */ } }) };
  C.fillDetailPhotos('k1');
  assert.equal(dom.els.dphoto.src, 'THUMB', '사진이 안 들어갔습니다');
  assert.equal(dom.els.dphoto.style.display, '', '넣고도 감춰 둡니다');
});

test('사진이 없는 것으로 밝혀지면 빈 자리를 치운다', () => {
  const C = load();
  const dom = fakeDom('k1', ['dphoto','dphoto2']);
  C.document = dom; C.$ = id => dom.getElementById(id);
  C.state.items = { k1: { id:'k1', thumb:'', thumb2:'' } };
  C.Store = { getPhoto: () => ({ then(){} }) };
  C.fillDetailPhotos('k1');
  assert.equal(dom.els.dphoto.removed, true, '빈 자리가 그대로 남습니다');
});

test('★ 그 사이 다른 명함을 열었으면 손대지 않는다', () => {
  /* 안 막으면 앞 명함 사진이 뒤 명함 창에 붙는다 — 남의 얼굴이 붙는 사고다. */
  const C = load();
  const dom = fakeDom('k2', ['dphoto','dphoto2']);   /* 지금 창은 k2 */
  C.document = dom; C.$ = id => dom.getElementById(id);
  C.state.items = { k1: { id:'k1', thumb:'THUMB' } };
  C.Store = { getPhoto: () => ({ then(){} }) };
  C.fillDetailPhotos('k1');                          /* 늦게 온 것은 k1 */
  assert.equal(dom.els.dphoto.src, '', '다른 명함 창에 사진을 넣었습니다');
});

test('없는 명함·빈 창이어도 터지지 않는다', () => {
  const C = load();
  const dom = fakeDom('k1', []);
  C.document = dom; C.$ = id => dom.getElementById(id);
  C.state.items = {};
  C.Store = { getPhoto: () => ({ then(){} }) };
  assert.doesNotThrow(() => C.fillDetailPhotos('없는번호'));
  C.state.items = { k1:{ id:'k1', thumb:'T' } };
  assert.doesNotThrow(() => C.fillDetailPhotos('k1'));
});

/* ── 화면이 기다리지 않는지 ── */

function fnBody(name){
  let i = src.indexOf('\nfunction ' + name + '(');
  if (i < 0) i = src.indexOf('\nasync function ' + name + '(');
  assert.ok(i >= 0, name + ' 를 찾을 수 없습니다');
  const j = src.indexOf('\n}', i);
  return src.slice(i, j + 2);
}

test('★ 상세·수정창이 사진을 기다렸다가 여는 옛 방식을 안 쓴다', () => {
  /* 이 한 줄이 2초의 정체였다 — 돌아가서(return) 서버를 기다린 뒤에야 창을 만들었다. */
  assert.ok(!/ensureThumbs\([^)]*\)\.then\(\(\)=>open(Detail|PcDetail|Editor)\(/.test(src),
    '아직 사진을 받은 뒤에 창을 여는 곳이 있습니다');
});

test('상세를 열 때 사진은 뒤따라 채운다', () => {
  ['openDetail','openPcDetail'].forEach(fn=>{
    assert.match(fnBody(fn), /ensureThumbs\(id\)\.then\(\(\)=>fillDetailPhotos\(id\)\)/,
      fn + ' 이 사진을 뒤따라 채우지 않습니다');
  });
});

test('열린 창이 어느 명함 것인지 표시를 남긴다', () => {
  /* 이 표시가 없으면 늦게 온 사진을 «어느 창»에 넣을지 알 수 없다. */
  assert.match(fnBody('openDetail'), /dataset\.cardId = id/);
  assert.match(fnBody('openPcDetail'), /dataset\.cardId = id/);
});

test('수정창도 기다리지 않고, 사진은 뒤따라 채운다', () => {
  assert.match(fnBody('openEditor'), /editorFillPhoto\(item\.id\)/, '수정창이 사진을 안 채웁니다');
  const fill = fnBody('editorFillPhoto');
  assert.match(fill, /editing\.id !== itemId/, '다른 명함으로 옮겨도 덮어씁니다');
  assert.match(fill, /editing\.photoDirty/, '방금 붙인 사진을 옛 사진으로 덮습니다');
  assert.match(fill, /editorSnapshot\(\) === editing\.orig/, '고쳐 놓은 글자를 날립니다');
});
