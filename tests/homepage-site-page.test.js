'use strict';
/* 새 홈페이지의 «쪽 본문»을 고친다 — 굳힌 여덟 쪽으로 돌려서 확인한다.
   ═══════════════════════════════════════════════════════════════════════════
   ★ 여기서 못 박는 것
     ① 고쳐도 «태그가 한 글자도 안 바뀐다» (지도·표·구획·지사 탭이 그대로다)
     ② 고치는 자리는 «본문»뿐 — 머리띠·발·상담문의 띠는 후보에도 안 든다
     ③ 발에도 있는 글자(전화번호 같은 것)를 본문에서 고칠 수 있다
        — 쪽 전체에 대고 고치면 「두 군데라 못 한다」고 헛걸린다
     ④ 못 찾은 줄은 «그 줄만» 건너뛴다
   실행: node --test tests/homepage-site-page.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');
const ctx = { window: undefined, console: { warn() {}, log() {} } };
vm.createContext(ctx);
['pu-home-parse.js', 'pu-home-fill.js', 'pu-site-page.js'].forEach(f => {
  vm.runInContext(fs.readFileSync(path.join(R, 'js', f), 'utf8'), ctx);
});
const P = ctx.PuSitePage;
const 갈아끼우기 = ctx.PuHomeFill.applyLineEdits;

const SITE = path.join(R, 'site');
const 쪽들 = ['greeting', 'work1', 'work2', 'work3', 'work4', 'work5a', 'work5b', 'inquiry']
  .map(mid => ({ mid: mid, 자리: path.join(SITE, mid, 'index.html') }))
  .filter(p => fs.existsSync(p.자리));

function 태그들(html) { return (String(html).match(/<[^>]*>/g) || []); }

/* 본문에서 «한 번만» 나오는 줄 — 겹친 줄은 일부러 건너뛰므로 바꿈 확인에 못 쓴다 */
function 고칠수있는줄(html) {
  const 자리 = P.본문자리(html);
  const 본문 = html.slice(자리.시작, 자리.끝);
  const runs = ctx.PuHomeFill.textRuns(본문);
  const cnt = {};
  runs.forEach(r => { cnt[r.text] = (cnt[r.text] || 0) + 1; });
  return runs.filter(r => cnt[r.text] === 1 && r.text.length >= 4);
}

test('굳힌 쪽이 있다 (없으면 아래 검사가 아무것도 안 지킨다)', () => {
  assert.ok(쪽들.length >= 6, '굳힌 쪽이 ' + 쪽들.length + '개뿐이다');
});

test('★ 여덟 쪽 — 줄을 갈아 끼워도 태그가 하나도 안 바뀐다', () => {
  let 바꾼쪽 = 0;
  쪽들.forEach(p => {
    const html = fs.readFileSync(p.자리, 'utf8');
    const runs = 고칠수있는줄(html);
    if (runs.length < 2) return;
    const 고칠것 = [runs[0], runs[runs.length - 1]]
      .map(r => ({ before: r.text, after: r.text + ' (고친 글)' }));
    const out = P.쪽고치기(html, 고칠것, 갈아끼우기);
    assert.deepEqual(태그들(out.html), 태그들(html),
      '★ ' + p.mid + ' — 태그가 바뀌었다. 지도·표·구획이 깨진다는 뜻이다');
    assert.equal(out.done.length, 2, p.mid + ' — 채운 줄이 ' + out.done.length + '개다');
    assert.ok(out.html.indexOf('(고친 글)') > 0, p.mid + ' — 바꾼 글자가 안 들어갔다');
    바꾼쪽++;
  });
  assert.ok(바꾼쪽 >= 6, '실제로 확인한 쪽이 너무 적다 (' + 바꾼쪽 + '쪽)');
});

test('★ 고치는 자리는 «본문»뿐 — 머리띠·발은 손도 안 댄다', () => {
  const html = fs.readFileSync(쪽들[0].자리, 'utf8');
  const 자리 = P.본문자리(html);
  assert.ok(자리 && 자리.끝 > 자리.시작, '본문 자리를 못 찾았다');
  const 앞 = html.slice(0, 자리.시작);
  const 뒤 = html.slice(자리.끝);
  const runs = 고칠수있는줄(html);
  const out = P.쪽고치기(html, [{ before: runs[0].text, after: '바뀐 글자' }], 갈아끼우기);
  assert.equal(out.html.slice(0, 자리.시작), 앞, '★ 본문 «앞»이 바뀌었다(머리띠)');
  assert.ok(out.html.endsWith(뒤), '★ 본문 «뒤»가 바뀌었다(발·상담문의 띠)');
});

test('★ 본문과 발에 «같은 글»이 있어도 본문 것을 고친다 — 쪽 전체에 대고 하면 헛걸린다', () => {
  /* 이것이 «본문만 떼는» 까닭이다. 쪽 전체를 대상으로 하면 같은 글이 두 군데라
     「어느 것인지 단정할 수 없다」며 건너뛴다 — 정작 고쳐야 할 때 못 고친다.
     회사 이름·전화번호·주소처럼 발에도 나오는 글이 여기 걸린다. */
  const 쪽 = '<div class="bh_page_widget_inner"><p>천안본사 041-556-0035</p></div>'
    + '<footer><p>천안본사 041-556-0035</p></footer>';
  const 고칠것 = [{ before: '천안본사 041-556-0035', after: '천안본사 041-000-0000' }];

  const 온쪽 = 갈아끼우기(쪽, 고칠것);
  assert.equal(온쪽.done.length, 0, '전제가 깨졌다 — 쪽 전체로도 고쳐진다면 이 검사는 뜻이 없다');
  assert.match(온쪽.skipped[0].why, /단정할 수 없습니다/);

  const 본문만 = P.쪽고치기(쪽, 고칠것, 갈아끼우기);
  assert.equal(본문만.done.length, 1, '★ 본문 것을 못 고쳤다');
  assert.ok(본문만.html.indexOf('<div class="bh_page_widget_inner"><p>천안본사 041-000-0000</p>') === 0,
    '★ 본문이 안 바뀌었다');
  assert.ok(본문만.html.indexOf('<footer><p>천안본사 041-556-0035</p></footer>') > 0,
    '★ 발까지 바꿨다 — 본문만 고쳐야 한다');
});

test('★ 못 찾은 줄은 «그 줄만» 건너뛰고 이유를 남긴다', () => {
  const html = fs.readFileSync(쪽들[0].자리, 'utf8');
  const runs = 고칠수있는줄(html);
  const out = P.쪽고치기(html, [
    { before: '이 쪽에 없는 글입니다', after: '엉뚱한 글' },
    { before: runs[0].text, after: '제대로 고친 글' }
  ], 갈아끼우기);
  assert.equal(out.done.length, 1, '찾은 줄은 고쳐야 한다');
  assert.equal(out.skipped.length, 1, '못 찾은 줄을 조용히 넘겼다');
  assert.ok(out.html.indexOf('엉뚱한 글') < 0, '★ 못 찾았는데 어딘가에 써 넣었다');
  assert.ok(out.html.indexOf('제대로 고친 글') > 0, '찾은 줄이 안 바뀌었다');
});

test('★ 본문 자리를 못 찾으면 «아무것도 안 고친다»', () => {
  const 딴글 = '<html><body><p>본문 표시가 없는 쪽</p></body></html>';
  const out = P.쪽고치기(딴글, [{ before: '본문 표시가 없는 쪽', after: '바꿈' }], 갈아끼우기);
  assert.equal(out.html, 딴글, '★ 자리도 못 찾았는데 고쳤다');
  assert.equal(out.done.length, 0);
  assert.match(out.skipped[0].why, /본문 자리/, '왜 못 했는지 안 말한다');
});

test('★ 화면이 고쳐 둔 것에서 «정말 바뀐 줄»만 골라 낸다', () => {
  const 골라낸것 = P.고칠줄({ '첫 줄': '고친 첫 줄', '둘째 줄': '둘째 줄', '셋째 줄': '   ' });
  assert.equal(골라낸것.length, 1, '★ 안 바뀐 줄·빈 줄까지 보냈다');
  assert.equal(골라낸것[0].before, '첫 줄');
  assert.equal(골라낸것[0].after, '고친 첫 줄');
  assert.equal(P.고칠줄(null).length, 0, '없는 것을 받아도 멎지 않아야 한다');
});
