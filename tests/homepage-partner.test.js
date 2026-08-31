'use strict';
/* 자문사현황 쪽을 «자료로» 그린다 — 로고를 보이고, 숨기고, 차례를 바꾼다.
   ═══════════════════════════════════════════════════════════════════════════
   ★ 여기서 못 박는 것
     ① 지금 쪽에서 읽어 다시 그리면 «똑같다»
     ② 로고를 숨기면 «그것만» 사라진다 (틀은 그대로)
     ③ 차례를 바꾸면 그 차례로 늘어선다
     ④ 차례에 «없는» 로고도 사라지지 않는다 — 새로 생긴 로고가 조용히 빠지면 안 된다
     ⑤ 보일 로고가 하나도 없으면 «아무것도 하지 않는다» (통째로 지우는 사고를 막는다)
   실행: node --test tests/homepage-partner.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');
const ctx = { window: undefined, console: { warn() {}, log() {} } };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(R, 'js', 'pu-site-partner.js'), 'utf8'), ctx);
const P = ctx.PuSitePartner;

const PAGE = path.join(R, 'site', 'partner', 'index.html');
const 원본 = fs.readFileSync(PAGE, 'utf8');

function 뭉치기(s) {
  return String(s).replace(/>\s+/g, '>').replace(/\s+</g, '<').replace(/\s+/g, ' ');
}

test('★ 지금 쪽에서 읽어 다시 그리면 똑같다', () => {
  const 로고 = P.로고읽기(원본);
  assert.ok(로고.length >= 10, '읽은 로고가 ' + 로고.length + '장뿐이다');
  로고.forEach(x => assert.ok(x.그림, '그림 없는 칸이 있다: ' + JSON.stringify(x)));
  assert.equal(뭉치기(P.쪽그리기(원본, 로고)), 뭉치기(원본),
    '★ 다시 그린 쪽이 지금 쪽과 다르다 — 화면이 달라진다는 뜻이다');
});

test('★ 로고를 숨기면 «그것만» 사라진다 — 머리띠·발은 그대로', () => {
  const 로고 = P.로고읽기(원본);
  const 숨길것 = 로고[2];
  const 고른것 = P.올릴로고(원본, { 숨김: { [숨길것.srl]: true } });
  assert.equal(고른것.갈것.length, 로고.length - 1);
  assert.equal(고른것.숨긴것.length, 1);

  const 새쪽 = P.쪽그리기(원본, 고른것.갈것);
  assert.equal(P.칸들(새쪽).length, 로고.length - 1, '★ 칸 수가 안 줄었다');
  assert.ok(새쪽.indexOf(숨길것.그림) < 0, '★ 숨긴 로고가 남아 있다');
  로고.filter(x => x.srl !== 숨길것.srl).forEach(x => {
    assert.ok(새쪽.indexOf(x.그림) > 0, '다른 로고가 함께 사라졌다');
  });
  ['footer', '041-556-0035', 'canonical'].forEach(표시 => {
    assert.ok(새쪽.indexOf(표시) > 0, '★ 쪽의 틀(' + 표시 + ')이 사라졌다');
  });
});

test('★ 차례를 바꾸면 그 차례로 늘어선다', () => {
  const 로고 = P.로고읽기(원본);
  const 뒤집기 = 로고.map(x => x.srl).reverse();
  const 고른것 = P.올릴로고(원본, { 차례: 뒤집기 });
  assert.deepEqual(고른것.갈것.map(x => x.srl), 뒤집기, '★ 정한 차례대로 안 됐다');

  const 새쪽 = P.쪽그리기(원본, 고른것.갈것);
  const 그린차례 = P.칸들(새쪽).map(c => (/<img[^>]+src="([^"]+)"/.exec(c.html) || [, ''])[1]);
  assert.deepEqual(그린차례, 고른것.갈것.map(x => x.그림), '★ 그린 차례가 정한 차례와 다르다');
});

test('★ 차례에 «없는» 로고도 사라지지 않는다 — 새로 생긴 것이 조용히 빠지면 안 된다', () => {
  const 로고 = P.로고읽기(원본);
  /* 두 장만 차례를 정하고 나머지는 안 적었다 */
  const 고른것 = P.올릴로고(원본, { 차례: [로고[5].srl, 로고[1].srl] });
  assert.equal(고른것.갈것.length, 로고.length, '★ 차례에 안 적은 로고가 사라졌다');
  assert.equal(고른것.갈것[0].srl, 로고[5].srl, '정한 것이 앞에 와야 한다');
  assert.equal(고른것.갈것[1].srl, 로고[1].srl);
});

test('★ 없어진 로고를 차례에 적어 두었어도 멎지 않는다', () => {
  const 로고 = P.로고읽기(원본);
  const 고른것 = P.올릴로고(원본, { 차례: ['999999', 로고[0].srl] });
  assert.equal(고른것.갈것.length, 로고.length, '★ 없는 것을 만나 목록이 줄었다');
  assert.equal(고른것.갈것[0].srl, 로고[0].srl);
});

test('★ 보일 로고가 하나도 없으면 «아무것도 하지 않는다» — 통째로 지우는 사고를 막는다', () => {
  assert.throws(() => P.쪽그리기(원본, []), /하나도 없습니다/,
    '★ 빈 목록으로 그려 로고를 통째로 지웠다');
  const 다숨김 = {};
  P.로고읽기(원본).forEach(x => { 다숨김[x.srl] = true; });
  const 고른것 = P.올릴로고(원본, { 숨김: 다숨김 });
  assert.equal(고른것.갈것.length, 0, '전제 확인');
  assert.throws(() => P.쪽그리기(원본, 고른것.갈것), /하나도 없습니다/);
});
