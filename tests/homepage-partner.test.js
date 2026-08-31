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

/* ══════ 메인 화면의 «흐르는 로고 띠» ══════
   ★ 메인에도 자문사 로고가 실려 있다 — 그것도 «네 벌»이 이어 붙어 흐른다.
     자문사 쪽만 고치고 메인을 그대로 두면 «뺀 로고가 메인에서는 계속 돈다».
     원래 홈페이지는 한 자료를 두 쪽이 끌어다 썼는데, 굳히면서 그 연결이 끊겼다. */

const MAIN = path.join(R, 'site', 'index.html');
const 메인 = fs.existsSync(MAIN) ? fs.readFileSync(MAIN, 'utf8') : '';

test('★ 메인의 로고 띠를 «벌째로» 알아본다 — 위젯 경계를 뭉개면 띠가 무너진다', () => {
  const 로고 = P.로고읽기(원본);
  const 묶음 = P.로고묶음(메인, 로고);
  assert.ok(묶음.length >= 2, '★ 띠를 한 벌로 뭉쳤다 — 위젯 사이 감싸개가 통째로 사라진다');
  묶음.forEach(g => assert.equal(g.수, 로고.length,
    '한 벌에 로고가 ' + g.수 + '장이다(자문사 쪽은 ' + 로고.length + '장)'));
});

test('★ 메인을 그대로 다시 그리면 «똑같다» — 위젯 감싸개까지', () => {
  const 로고 = P.로고읽기(원본);
  assert.equal(뭉치기(P.메인그리기(메인, 로고, 로고)), 뭉치기(메인),
    '★ 다시 그린 메인이 지금과 다르다 — 화면이 달라진다는 뜻이다');
});

test('★ 자문사 쪽에서 뺀 로고는 «메인에서도» 사라진다', () => {
  const 로고 = P.로고읽기(원본);
  const 뺄것 = 로고[0];
  const 새것 = P.메인그리기(메인, 로고.slice(1), 로고);
  assert.ok(새것.indexOf(뺄것.그림.split('/').pop()) < 0,
    '★ 자문사 쪽에서 뺐는데 메인에서는 계속 돈다');
  로고.slice(1).forEach(x => assert.ok(새것.indexOf(x.그림.split('/').pop()) > 0,
    '다른 로고가 함께 사라졌다'));
});

test('★ 띠의 «벌 수»를 그대로 지킨다 — 벌이 줄면 흐르다 끊겨 보인다', () => {
  const 로고 = P.로고읽기(원본);
  const 벌수 = P.로고묶음(메인, 로고).length;
  const 새것 = P.메인그리기(메인, 로고.slice(1), 로고);
  const 새묶음 = P.로고묶음(새것, 로고);
  assert.equal(새묶음.length, 벌수, '★ 띠 벌 수가 바뀌었다');
  새묶음.forEach(g => assert.equal(g.수, 로고.length - 1,
    '★ 한 벌의 장수가 안 맞는다 — ' + g.수 + '장'));
});

test('★ 로고가 «아닌» 칸은 손도 안 댄다 — 메인에는 인사말 칸도 있다', () => {
  const 로고 = P.로고읽기(원본);
  const 로고칸수 = P.로고묶음(메인, 로고).reduce((a, g) => a + g.수, 0);
  const 딴칸수 = P.칸들(메인).length - 로고칸수;
  assert.ok(딴칸수 >= 1, '메인에 로고 아닌 칸이 하나도 없다면 이 검사는 뜻이 없다');
  const 새것 = P.메인그리기(메인, 로고.slice(1), 로고);
  const 새로고칸수 = P.로고묶음(새것, 로고).reduce((a, g) => a + g.수, 0);
  assert.equal(P.칸들(새것).length - 새로고칸수, 딴칸수,
    '★ 로고가 아닌 칸이 늘거나 줄었다');
});

test('★ 메인에 로고 띠가 없으면 «그대로 둔다» — 없는 것을 지어내지 않는다', () => {
  const 딴쪽 = '<html><body><p>로고가 없는 쪽</p></body></html>';
  const 로고 = P.로고읽기(원본);
  assert.equal(P.메인그리기(딴쪽, 로고, 로고), 딴쪽, '★ 로고 띠도 없는데 손을 댔다');
});

test('★ 한 위젯이 «두 벌»을 담고 있으면 두 벌로 그린다 — 벌 수를 줄이면 흐르다 끊긴다', () => {
  /* 지금 홈페이지는 위젯마다 딱 한 벌이라 이 길이 안 돈다. 그래도 규칙은 지켜야 한다 —
     띠 하나에 두 벌이 담긴 반죽으로 바뀌면, 한 벌만 그려 넣는 순간 띠가 짧아져
     흐르다 끊겨 보인다. 그런 띠를 지어내 확인한다. */
  const 로고 = P.로고읽기(원본).slice(0, 3);
  const 칸 = srl =>
    '<div class="bh bh_item item item1"><div class="bh bh_img_content">'
    + '<img src="' + 로고.find(x => x.srl === srl).그림.replace(/^\.\.\//, '') + '" alt="image">'
    + '</div><!--<a href="#" data-srl="' + srl + '"></a>--></div>';
  /* 한 띠 안에 같은 세 장이 «두 벌» */
  const 두벌 = '<div class="wrap">' + 로고.map(x => 칸(x.srl)).join('')
    + 로고.map(x => 칸(x.srl)).join('') + '</div>';

  const 묶음 = P.로고묶음(두벌, 로고);
  assert.equal(묶음.length, 1, '전제: 한 묶음이어야 한다');
  assert.equal(묶음[0].수, 6, '전제: 여섯 칸(세 장 × 두 벌)이어야 한다');

  const 새것 = P.메인그리기(두벌, 로고.slice(1), 로고);   // 두 장만 보이게
  const 새묶음 = P.로고묶음(새것, 로고);
  assert.equal(새묶음[0].수, 4, '★ 두 벌을 지키지 않았다 — 두 장 × 두 벌 = 4칸이어야 한다');
});

/* ══════ 새 로고 넣기 (대표 지시 2026-08-31 「다음」) ══════
   ★ 새로 넣은 로고는 «아직 쪽에 없다» — 목록 뒤에 붙여 준다.
     올리고 나면 쪽에서 읽히므로 다음부터는 이 길로 오지 않는다. */

test('★ 새로 넣은 로고가 목록 «맨 뒤»에 붙는다 — 있던 로고는 그대로', () => {
  const 로고 = P.로고읽기(원본);
  const 새것 = { srl: 'n1756000000000', 그림: '../files/logo/n1756000000000.png' };
  const 고른것 = P.올릴로고(원본, { 추가: [새것] });
  assert.equal(고른것.갈것.length, 로고.length + 1, '★ 새 로고가 안 붙었다');
  assert.equal(고른것.갈것[고른것.갈것.length - 1].srl, 새것.srl, '★ 맨 뒤가 아니다');
  로고.forEach((x, i) => assert.equal(고른것.갈것[i].srl, x.srl,
    '★ 있던 로고의 차례가 흐트러졌다'));
});

test('★ 새 로고가 실제로 쪽에 실린다', () => {
  const 새것 = { srl: 'n1756000000001', 그림: '../files/logo/n1756000000001.png' };
  const 고른것 = P.올릴로고(원본, { 추가: [새것] });
  const 새쪽 = P.쪽그리기(원본, 고른것.갈것);
  assert.ok(새쪽.indexOf('n1756000000001.png') > 0, '★ 새 로고 그림이 쪽에 없다');
  assert.equal(P.칸들(새쪽).length, P.로고읽기(원본).length + 1);
});

test('★ 이미 실린 로고를 또 넣어도 «겹치지» 않는다 — 올린 뒤에도 안전하다', () => {
  const 새것 = { srl: 'n1756000000002', 그림: '../files/logo/n1756000000002.png' };
  const 한번 = P.쪽그리기(원본, P.올릴로고(원본, { 추가: [새것] }).갈것);
  const 두번 = P.올릴로고(한번, { 추가: [새것] });
  assert.equal(두번.갈것.filter(x => x.srl === 새것.srl).length, 1,
    '★ 같은 로고가 두 번 실린다');
});

test('★ 엉뚱한 것을 넣어도 멎지 않는다 — 그림 없는 것은 그냥 무시한다', () => {
  const 로고 = P.로고읽기(원본);
  const 고른것 = P.올릴로고(원본, { 추가: [null, {}, { srl: 'x' }, { 그림: '' }] });
  assert.equal(고른것.갈것.length, 로고.length, '★ 빈 것이 목록에 들어갔다');
});

test('★ 새 로고도 «메인 띠»에 함께 실린다 — 한쪽만 실리면 두 쪽이 어긋난다', () => {
  const 로고 = P.로고읽기(원본);
  const 새것 = { srl: 'n1756000000003', 그림: '../files/logo/n1756000000003.png' };
  const 고른것 = P.올릴로고(원본, { 추가: [새것] });
  const 새메인 = P.메인그리기(메인, 고른것.갈것, 로고);
  assert.ok(새메인.indexOf('n1756000000003.png') > 0, '★ 새 로고가 메인 띠에 없다');
  P.로고묶음(새메인, 고른것.갈것).forEach(g => assert.equal(g.수, 로고.length + 1,
    '★ 메인 띠 한 벌의 장수가 안 맞는다 — ' + g.수 + '장'));
});
