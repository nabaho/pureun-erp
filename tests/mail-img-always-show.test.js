/* 바깥에서 오는 그림 — 막지 않고 «늘 보여준다» (대표 결정 2026-09-06)
   ═══════════════════════════════════════════════════════════════════════════
   「그림을 막는게 자꾸나오는데 이부분 어떻게 해야하나?」

   ★ 예전에는 막아 두고 메일마다 「🖼 … 막았습니다 · 그림 보기」를 물었다.
     막는 까닭은 있다 — 부르는 순간 보낸 쪽이 «언제 열었는지» 알게 된다.
   ★ 그런데 이 메일함에서는 그 물음이 «끝나지 않았다». 실측 2026-09-06(받은메일함
     438통): 보낸이가 **185명**이라 자주 오는 50명을 다 풀어도 61%뿐이고,
     기업정보함에 있는 «아는 곳»만 자동으로 풀어도 45명(24%)뿐이라 **73%는 그대로
     물었다**. 자주 오는 곳이 광고·공공기관이라 명함이 없다.
     → 사람마다·메일마다 허락하는 길로는 못 끝낸다. 한 번에 정했다.
   ⚠ 잃는 것: 광고 보내는 쪽이 「이 주소는 살아 있고 언제 열어봤다」를 알게 된다.
     대표께서 그 값을 치르기로 정하셨다. 되살리지 말 것 — 되살리려면 대표께 먼저.

   여기서 지키는 것
   ① 바깥 그림을 «부른다» — 갈아치우던 옛 길이 되살아나면 걸린다
   ② 「막았습니다」 띠와 「그림 보기」가 되살아나지 않는다
   ③ ★ 안 뜨는 그림은 «조용히» 치운다 — 2026-09-05 에 고친 「찢어진 그림표」가
     되살아나면 안 된다. 늘 보여주기로 한 뒤에는 «죽은 주소»를 더 자주 만난다.
   ④ 그 손잡이는 «잡는 자리»(capture)로, «한 번만» 단다
   ⑤ 주소 검사는 그대로다 — 푼 것은 «부를지 말지»뿐이다
     (javascript: 따위를 실제로 넣어 보는 것은 tests/mail-daum-box-screen.test.js) */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8');
/* 주석을 먼저 걷는다 — 안 걷으면 «잘 쓴 주석»이 검사를 통과시킨다 */
const bare = app.replace(/\/\*[\s\S]*?\*\//g, ' ');

/* 그림을 다루는 대목만 잘라 본다 — 파일 전체에서 찾으면 딴 자리의 src 가 걸린다 */
function 그림대목(){
  const i = bare.indexOf("if(nm==='src' && tag==='IMG')");
  assert.ok(i > 0, '그림을 다루는 자리를 못 찾았습니다');
  const j = bare.indexOf('if(!MB_ATTR_OK[nm])', i);
  assert.ok(j > i, '그 대목의 끝을 못 찾았습니다');
  return bare.slice(i, j);
}

test('★★ 바깥에서 오는 그림을 «부른다» — 갈아치우던 옛 길이 없다', () => {
  const seg = 그림대목();
  assert.match(seg, /setAttribute\('src',\s*safe\)/,
    '★ 씻어 낸 주소를 그대로 넣지 않습니다 — 그림이 안 뜹니다');
  assert.ok(seg.indexOf('MB_IMG_BLANK') < 0,
    '★ 그림을 빈 그림으로 갈아치웁니다 — 다시 막고 있습니다');
  assert.ok(seg.indexOf('data-hold') < 0 && seg.indexOf('_mbImgHold') < 0,
    '★ 막은 표시를 답니다 — 다시 막고 있습니다');
  assert.ok(seg.indexOf('showImg') < 0,
    '★ 「보여줄까 말까」를 아직 따집니다 — 늘 보여주기로 했습니다');
});

test('★★ 「막았습니다」 띠와 「그림 보기」가 되살아나지 않는다', () => {
  assert.ok(bare.indexOf('막았습니다') < 0,
    '★ 「막았습니다」 안내가 되살아났습니다 — 메일마다 뜹니다');
  assert.ok(bare.indexOf('imghold') < 0, '★ 안내 띠의 꾸밈이 되살아났습니다');
  assert.ok(!/function\s+mbShowImg\s*\(/.test(bare), '★ 「그림 보기」 함수가 되살아났습니다');
  assert.ok(bare.indexOf('mbImgShow') < 0, '★ 메일마다 기억하던 자리가 되살아났습니다');
});

/* ══════ 안 뜨는 그림 — 실제로 돌려 본다 ══════ */

/* 그림 대목만 vm 으로 떼어 돌린다 — 창이 없어도 되게 지어 두었다 */
function 떼어오기(){
  const i = app.indexOf('const MB_IMG_BLANK');
  assert.ok(i > 0, 'MB_IMG_BLANK 자리를 못 찾았습니다');
  const j = app.indexOf('function mbCleanHtml', i);
  assert.ok(j > i, '그 다음 자리를 못 찾았습니다');
  const ctx = { console };
  vm.createContext(ctx);
  vm.runInContext(app.slice(i, j), ctx);
  /* ⚠ const 는 ctx 에 안 붙는다 — 안에서 꺼내 온다.
       처음에 이걸 몰라 「빈 그림으로 안 바꿉니다」로 헛돌았다(둘 다 undefined 였다). */
  ctx.__get = (expr) => vm.runInContext(expr, ctx);
  return ctx;
}
/* 가짜 그림 하나 — 속성만 들고 있으면 된다 */
function 가짜그림(o){
  const a = Object.assign({}, (o && o.attrs) || {});
  return {
    tagName: (o && o.tag) || 'IMG',
    attrs: a,
    closest: (sel) => ((o && o.본문안) === false ? null : (sel === '.dm-read .body' ? {} : null)),
    getAttribute: (k) => (k in a ? a[k] : null),
    setAttribute: (k, v) => { a[k] = String(v); },
  };
}

test('★★ 안 뜨는 그림을 «조용한 빈 자리»로 바꾼다 — 찢어진 그림표를 남기지 않는다', () => {
  const c = 떼어오기();
  const n = 가짜그림({ attrs: { src: 'http://x.kr/dead.png' } });
  assert.equal(c.mbDeadImgHit(n), true, '★ 안 뜨는 그림을 그냥 둡니다');
  const 빈그림 = c.__get('MB_IMG_BLANK');
  assert.ok(빈그림, '★ 빈 그림을 정해 둔 자리가 없습니다');
  assert.equal(n.attrs['data-dead'], '1');
  assert.equal(n.attrs.src, 빈그림, '★ 빈 그림으로 안 바꿉니다 — 깨진 네모가 남습니다');
  /* 넣는 것이 진짜 그림이고, «바깥을 안 부른다» */
  assert.match(빈그림, /^data:image\/(gif|png);base64,/, '★ 빈 자리에 바깥 주소를 넣습니다');
  const buf = Buffer.from(빈그림.slice(빈그림.indexOf(',') + 1), 'base64');
  assert.equal(buf.slice(0, 3).toString('latin1'), 'GIF', '★ 그림이 아닙니다 — 이것도 깨져 보입니다');
  assert.ok(buf.length < 200, '★ 빈 자리 하나에 ' + buf.length + '바이트를 씁니다');
});

test('★★ 같은 그림을 두 번 손대지 않는다 — 안 그러면 끝없이 되돈다', () => {
  const c = 떼어오기();
  const n = 가짜그림({ attrs: { src: 'http://x.kr/dead.png' } });
  assert.equal(c.mbDeadImgHit(n), true);
  assert.equal(c.mbDeadImgHit(n), false, '★ 빈 그림으로 바꾼 것을 또 손댑니다');
});

test('★ 본문 밖의 그림·그림이 아닌 것은 안 건드린다', () => {
  const c = 떼어오기();
  assert.equal(c.mbDeadImgHit(가짜그림({ 본문안: false })), false, '★ 본문 밖 그림까지 건드립니다');
  assert.equal(c.mbDeadImgHit(가짜그림({ tag: 'DIV' })), false, '★ 그림이 아닌 것도 건드립니다');
  assert.equal(c.mbDeadImgHit(null), false);
  assert.equal(c.mbDeadImgHit({ tagName: 'IMG' }), false, '★ closest 가 없는 것에서 터집니다');
});

test('★★ 손잡이를 «잡는 자리»(capture)로 단다 — error 는 거품처럼 올라오지 않는다', () => {
  const c = 떼어오기();
  const 단것 = [];
  const 가짜창 = { addEventListener: (t, f, cap) => 단것.push({ t, f, cap }) };
  assert.equal(c.mbWatchDeadImg(가짜창), true);
  assert.equal(단것.length, 1, '★ 손잡이를 하나만 달아야 합니다');
  assert.equal(단것[0].t, 'error');
  assert.equal(단것[0].cap, true,
    '★ 잡는 자리로 안 답니다 — 그림의 error 는 올라오지 않아 한 건도 못 잡습니다');
  /* 달아 둔 그 손잡이가 «실제로» 일하는가 */
  const n = 가짜그림({ attrs: {} });
  단것[0].f({ target: n });
  assert.equal(n.attrs['data-dead'], '1', '★ 달기만 하고 아무 일도 안 합니다');
});

test('★ 창이 없어도 터지지 않는다 — 검사 틀에는 창이 없다', () => {
  const c = 떼어오기();
  assert.equal(c.mbWatchDeadImg(null), false);
  assert.equal(c.mbWatchDeadImg({}), false);
});

test('★ 안 뜨는 그림 자리를 «감추지» 않는다 — 감추면 본문 칸이 무너진다', () => {
  const css = bare.match(/img\[data-dead\][^}]*\}/);
  assert.ok(css, '★ 안 뜨는 그림 자리를 꾸미는 규칙이 없습니다');
  assert.match(css[0], /dashed/, '실선 테두리는 «내용»처럼 읽힙니다');
  assert.ok(!/display:\s*none/.test(css[0]), '★ 아예 감춥니다 — 글줄이 어긋납니다');
});
