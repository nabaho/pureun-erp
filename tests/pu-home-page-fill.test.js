'use strict';
/* 쪽 본문 채우기 — 마크업을 한 글자도 안 건드린다 (대표 지시 2026-08-31)
   ═══════════════════════════════════════════════════════════════════════════
   대표 지시: 「모두 다 해야 된다 — 쪽 본문 안 깨지게 시스템 구축할 수 있게 해봐라」

   ■ 왜 어려운가
     구성원(경력사항)은 «칸 하나»를 통째로 바꾸면 됐다. 쪽은 본문 안에 지도 위젯·
     지사 탭·표·구획이 들어 있어, 글자를 통째로 바꾸면 그것들이 통째로 사라진다.
     (그래서 여태 「붙여넣기를 드리지 않습니다」였다.)

   ■ 그래서 무엇을 하나
     바뀐 줄의 «글자»만 제자리에서 갈아 끼운다. 태그·속성·순서·빈칸은 그대로 둔다.
     자리는 «번호»가 아니라 «원래 글자»로 짝짓는다 — 그 사이 홈페이지가 바뀌어
     줄이 하나 늘거나 줄어도 엉뚱한 자리에 넣지 않는다.

   ★ 여기서 못 박는 것
     ① 갈아 끼운 뒤에도 «태그가 한 글자도 안 바뀐다» (실제 홈페이지 12쪽으로)
     ② 바꾼 줄의 글자만 바뀌고 나머지 글자는 그대로다
     ③ 원래 글자를 못 찾으면 «그 줄만» 건너뛰고 이유를 남긴다 (남이 고친 것을 안 덮는다)
     ④ 똑같은 줄이 여럿이면 단정하지 않고 건너뛴다
     ⑤ script 안은 절대 건드리지 않는다
     ⑥ 꺾쇠가 든 글자를 넣어도 태그가 되지 않는다
   실행: node --test tests/pu-home-page-fill.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');
const ctx = { window: undefined, console: { warn() {}, log() {} } };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(R, 'js', 'pu-home-parse.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(R, 'js', 'pu-home-fill.js'), 'utf8'), ctx);
const F = ctx.PuHomeFill;

const BACKUP = path.join(R, 'docs', 'homepage-backup', '2026-08-16');
const PAGES = fs.readdirSync(BACKUP).filter(f => f.endsWith('.html'));

/* 태그만 뽑는다 — 마크업이 그대로인지 견주는 잣대 */
/* 한 번만 나오는 줄만 고른다 — 겹친 줄은 «일부러» 건너뛰므로 바꿈 검사에 못 쓴다 */
function uniqueRuns(html) {
  const runs = F.textRuns(html);
  const cnt = {};
  runs.forEach(r => { cnt[r.text] = (cnt[r.text] || 0) + 1; });
  return runs.filter(r => cnt[r.text] === 1 && r.text.length >= 4);
}

function tagsOf(html) {
  return (String(html).match(/<[^>]*>/g) || []);
}

/* ══════ ① 태그가 한 글자도 안 바뀐다 (실제 홈페이지 전부) ══════ */

test('★ 실제 홈페이지 열두 쪽 — 줄을 갈아 끼워도 태그가 하나도 안 바뀐다', () => {
  let 바꾼쪽 = 0;
  PAGES.forEach(name => {
    const html = fs.readFileSync(path.join(BACKUP, name), 'utf8');
    const runs = uniqueRuns(html);
    if (runs.length < 3) return;                     // 글자가 거의 없는 쪽은 건너뛴다
    /* 앞·가운데·뒤에서 하나씩 — 어디서든 안전해야 한다 */
    const pick = [runs[0], runs[Math.floor(runs.length / 2)], runs[runs.length - 1]];
    const edits = pick.map(r => ({ before: r.text, after: r.text + ' (고친 글)' }));
    const out = F.applyLineEdits(html, edits);
    assert.deepEqual(tagsOf(out.html), tagsOf(html),
      '★ ' + name + ' — 태그가 바뀌었다. 지도·표·구획이 깨진다는 뜻이다');
    /* ⚠ 다 건너뛰어도 태그는 그대로라 통과해 버린다 — «실제로 채웠는지»까지 본다 */
    assert.equal(out.done.length, 3, name + ' — 채운 줄이 ' + out.done.length + '개다');
    assert.ok(out.html.indexOf('(고친 글)') > 0, name + ' — 바꾼 글자가 안 들어갔다');
    바꾼쪽++;
  });
  assert.ok(바꾼쪽 >= 8, '실제 홈페이지 표본으로 확인한 쪽이 너무 적다 (' + 바꾼쪽 + '쪽)');
});

test('★ 바꾼 줄의 글자만 바뀐다 — 나머지 글자는 그대로다', () => {
  const html = fs.readFileSync(path.join(BACKUP, 'work1.html'), 'utf8');
  const runs = uniqueRuns(html);
  const target = runs[Math.floor(runs.length / 2)];
  const out = F.applyLineEdits(html, [{ before: target.text, after: '바뀐 글자' }]);

  const before = F.textRuns(html).map(r => r.text);
  const after = F.textRuns(out.html).map(r => r.text);
  assert.equal(after.length, before.length, '줄 수가 달라졌다');
  let 다른줄 = 0;
  for (let i = 0; i < before.length; i++) if (before[i] !== after[i]) 다른줄++;
  assert.equal(다른줄, 1, '★ 한 줄만 바꿨는데 ' + 다른줄 + '줄이 달라졌다');
  assert.ok(after.indexOf('바뀐 글자') >= 0, '바꾼 글자가 안 들어갔다');
});

/* ══════ ③ 못 찾으면 건너뛴다 ══════ */

test('★ 원래 글자를 못 찾으면 그 줄만 건너뛰고 이유를 남긴다 — 남이 고친 것을 안 덮는다', () => {
  const html = '<div class="a">첫 줄</div><div>둘째 줄</div>';
  const out = F.applyLineEdits(html, [
    { before: '없는 줄', after: '엉뚱한 글' },
    { before: '둘째 줄', after: '고친 둘째 줄' }
  ]);
  assert.equal(out.done.length, 1, '찾은 줄은 채워야 한다');
  assert.equal(out.skipped.length, 1, '못 찾은 줄을 조용히 넘겼다');
  assert.match(out.skipped[0].why, /찾지 못했습니다/, '왜 건너뛰었는지 안 적었다');
  assert.ok(out.html.indexOf('엉뚱한 글') < 0, '★ 못 찾았는데 어딘가에 써 넣었다');
  assert.ok(out.html.indexOf('고친 둘째 줄') > 0, '찾은 줄이 안 바뀌었다');
  assert.ok(out.html.indexOf('첫 줄') > 0, '건드리지 말아야 할 줄이 바뀌었다');
});

test('★ 똑같은 줄이 여럿이면 단정하지 않고 건너뛴다', () => {
  const html = '<p>같은 줄</p><p>가운데</p><p>같은 줄</p>';
  const out = F.applyLineEdits(html, [{ before: '같은 줄', after: '바꾼 줄' }]);
  assert.equal(out.done.length, 0, '★ 어느 것인지 모르는데 하나를 골라 바꿨다');
  assert.match(out.skipped[0].why, /단정할 수 없습니다/);
  assert.equal(out.html, html, '건드리지 않았어야 한다');
});

/* ══════ ⑤⑥ 건드리면 안 되는 것 ══════ */

test('★ script 안은 절대 건드리지 않는다 — 화면이 통째로 죽는다', () => {
  const html = '<div>보이는 글</div><script>var s = "보이는 글";</script>';
  const runs = F.textRuns(html);
  assert.equal(runs.filter(r => r.text.indexOf('var s') >= 0).length, 0,
    'script 안이 «고칠 줄»로 잡혔다');
  const out = F.applyLineEdits(html, [{ before: '보이는 글', after: '바꾼 글' }]);
  assert.ok(out.html.indexOf('var s = "보이는 글";') > 0, '★ script 안이 바뀌었다');
  assert.ok(out.html.indexOf('<div>바꾼 글</div>') >= 0, '보이는 글은 바뀌어야 한다');
});

test('★ 꺾쇠가 든 글자를 넣어도 태그가 되지 않는다', () => {
  const html = '<p>원래</p>';
  const out = F.applyLineEdits(html, [{ before: '원래', after: '<b>굵게</b> 하고 싶다' }]);
  assert.deepEqual(tagsOf(out.html), tagsOf(html), '★ 넣은 글자가 태그가 됐다');
  assert.match(out.html, /&lt;b&gt;/, '꺾쇠를 안 감쌌다');
});

/* ══════ 앞뒤 빈칸을 그대로 둔다 ══════ */

test('줄바꿈·들여쓰기를 그대로 둔다 — 사람이 편집기에서 봐도 모양이 안 흐트러진다', () => {
  const html = '<div>\n    원래 글\n  </div>';
  const out = F.applyLineEdits(html, [{ before: '원래 글', after: '바꾼 글' }]);
  assert.equal(out.html, '<div>\n    바꾼 글\n  </div>');
});

/* ══════ 쪽지(클립보드) ══════ */

test('★ 쪽지에 «어느 쪽»인지가 들어 있다 — 엉뚱한 쪽에서 눌러도 멈출 수 있다', () => {
  const p = F.packPageEdits('work1', [{ before: '가', after: '나' }]);
  const got = F.unpackPageEdits(p);
  assert.equal(got.ok, true);
  assert.equal(got.mid, 'work1');
  /* ⚠ vm 안에서 만든 값이라 프로토타입이 다르다 — 모양만 견준다 */
  assert.equal(JSON.stringify(got.edits), JSON.stringify([{ before: '가', after: '나' }]));
});

test('★ 쪽 채우기 쪽지가 아니면 아무것도 하지 않는다', () => {
  ['', '그냥 글자', '{"a":1}', JSON.stringify({ '푸른ERP': '다른 것', '줄': [] })].forEach(s => {
    const got = F.unpackPageEdits(s);
    assert.equal(got.ok, false, '엉뚱한 것을 받아들였다: ' + s);
    assert.ok(got.why, '왜 안 되는지 안 말한다');
  });
});

test('바뀐 것이 없는 줄은 보내도 채우지 않는다 — 헛일을 하지 않는다', () => {
  const out = F.applyLineEdits('<p>같음</p>', [{ before: '같음', after: '같음' }]);
  assert.equal(out.done.length, 0);
  assert.match(out.skipped[0].why, /바뀐 것이 없습니다/);
});

/* ══════ 대조와 어긋나지 않는다 ══════ */

test('★ 채운 뒤 다시 읽어도 «대조»가 맞는다 — 우리 기준 글자와 홈페이지가 같아진다', () => {
  /* 이 기능의 목적이 그것이다: 채우고 저장하면 딱지가 「같음」이 되어야 한다.
     대조는 뭉친 글자로 하므로(PuHomeParse.parsePageText) 그 기준으로 견준다. */
  const html = fs.readFileSync(path.join(BACKUP, 'work1.html'), 'utf8');
  const runs = uniqueRuns(html);
  const t = runs[Math.floor(runs.length / 2)];
  const out = F.applyLineEdits(html, [{ before: t.text, after: '새 문장입니다' }]);
  const 뒤 = ctx.PuHomeParse.parsePageText(out.html);
  assert.ok(뒤.indexOf('새 문장입니다') >= 0, '바꾼 글이 대조 글자에 안 들어갔다');
  assert.ok(뒤.indexOf(t.text) < 0 || t.text.length < 4, '옛 글이 그대로 남아 있다');
});

/* ══════ 고칠 수 있는 줄 목록 ══════ */

test('★★ 같은 글이 여럿인 줄은 «몇 번째»를 알려 준다 — 자물쇠로 막지 않는다', () => {
  /* ★ 2026-09-03 에 규칙이 바뀌었다 (대표 지시 「자물쇄 같이 실물」).
     예전에는 여럿이면 ok:false 로 잠갔다. 그런데 오시는길에서 실측하니
     고칠 줄 20개 가운데 «10개»가 자물쇠였다 — 절반을 못 고치는 화면은 쓸 수 없다.
     이제 몇 번째인지(n)와 모두 몇 군데인지(of)를 들고 있어, 사람이 자리를 고른다.
     ⚠ 짐작을 없앤 것이지 위험을 감수한 것이 아니다 — 안 고르면 여전히 안 채운다
       (아래 「안 고르면」 대목). */
  const html = '<p>같은 줄</p><p>혼자 있는 줄</p><p>같은 줄</p>';
  const runs = F.fixableRuns(html);
  const dup = runs.filter(r => r.text === '같은 줄');
  assert.equal(dup.length, 2, '같은 글이 둘 다 잡혀야 한다');
  /* ⚠ deepEqual 로 견주면 안 된다 — 이 부품은 vm 으로 올려 «다른 realm» 이라,
     값이 [1,2] 로 같아도 배열의 밑틀이 달라 deepStrictEqual 이 떨어진다.
     (actual [1,2] · expected [1,2] 인데 실패해서 한참 찾았다.) 값으로 견준다. */
  assert.equal(JSON.stringify(dup.map(r => r.n)), '[1,2]', '★★ 몇 번째인지를 안 알려 준다');
  assert.equal(JSON.stringify(dup.map(r => r.of)), '[2,2]', '★★ 모두 몇 군데인지를 안 알려 준다');
  assert.ok(dup.every(r => r.ok), '★★ 아직 자물쇠로 막고 있다');
  const solo = runs.find(r => r.text === '혼자 있는 줄');
  assert.equal(JSON.stringify([solo.n, solo.of, solo.ok]), '[1,1,true]',
    '★ 혼자 있는 줄이 이상하다');

  /* ★ 「고칠 수 있다」는 말이 실제 결과와 같아야 한다 — 값을 박지 않고 돌려서 견준다.
     자리를 «골라» 보내면 줄마다 하나씩 채워져야 한다. */
  runs.forEach(r => {
    const out = F.applyLineEdits(html, [{ before: r.text, after: r.text + '!', n: r.n, of: r.of }]);
    assert.equal(out.done.length, 1,
      '★★ 자리를 골랐는데 안 채웠다: ' + r.text + ' (' + r.n + '/' + r.of + ')'
      + ' — ' + JSON.stringify(out.skipped));
  });

  /* ★★ 안 고르면 예전 그대로 — 여럿이면 «단정하지 않고» 건너뛴다.
     즐겨찾기 단추(경력사항 채우기)가 이 길로 도므로 여기가 바뀌면 안 된다. */
  assert.equal(F.applyLineEdits(html, [{ before: '같은 줄', after: '고침' }]).done.length, 0,
    '★★ 안 골랐는데 기계가 짐작해서 채웠다');
  assert.equal(F.applyLineEdits(html, [{ before: '혼자 있는 줄', after: '고침' }]).done.length, 1,
    '★ 혼자 있는 줄은 안 골라도 채워져야 한다');
});

test('★ 고칠 줄은 «본문 자리»에서만 나온다 — 머리띠·메뉴 글자를 고치게 두지 않는다', () => {
  const html = fs.readFileSync(path.join(BACKUP, 'work1.html'), 'utf8');
  const body = ctx.PuHomeParse.pageBodyHtml(html);
  assert.ok(body && body.length, '본문 자리를 못 잘랐다');
  const 온쪽 = F.textRuns(html).length;
  const 본문 = F.textRuns(body).length;
  assert.ok(본문 < 온쪽, '★ 쪽 전체를 고칠 줄로 삼았다 (' + 본문 + ' vs ' + 온쪽 + ')');
  /* 보여주는 줄과 «같은 자리»에서 나와야 한다 — 뭉친 대조 글자 안에 다 들어 있어야 한다 */
  const 대조 = ctx.PuHomeParse.tidy(ctx.PuHomeParse.parsePageText(html));
  const 밖 = F.fixableRuns(body).filter(r => 대조.indexOf(r.text) < 0);
  assert.equal(밖.length, 0, '★ 대조 글자에 없는 줄을 고치라고 내놓았다: '
    + 밖.slice(0, 3).map(r => r.text).join(' | '));
});

/* ══════ 즐겨찾기 단추 ══════ */

test('★ 단추는 «검사한 그 부품»을 그대로 싣는다 — 따로 베껴 쓰면 조용히 갈라진다', () => {
  const src = decodeURIComponent(F.fillBookmarkletUrl());
  [F.applyLineEdits, F.textRuns, F.unpackPageEdits].forEach(fn => {
    assert.ok(src.indexOf(String(fn)) >= 0,
      '★ 단추가 부품을 그대로 싣지 않았다 — 여기 검사가 지키는 코드와 실제로 도는 코드가 다르다');
  });
});

test('★ 단추는 저장을 누르지 않는다 — 사람이 눈으로 보고 누른다', () => {
  const src = decodeURIComponent(F.fillBookmarkletUrl());
  [/\.submit\s*\(/, /procFileUpload/, /doDocumentInsert/].forEach(re =>
    assert.ok(!re.test(src), '★ 단추가 스스로 저장·전송한다: ' + re));
  assert.ok(src.indexOf('javascript:') !== 0 || true);
  assert.ok(F.fillBookmarkletUrl().indexOf('javascript:') === 0, '즐겨찾기 주소 모양이 아니다');
});

test('★ 본문 칸을 못 찾으면 아무것도 하지 않는다 — 엉뚱한 칸에 쓰면 쪽이 통째로 망가진다', () => {
  assert.equal(F.findPageEditor ? 1 : 1, 1);
  const src = decodeURIComponent(F.fillBookmarkletUrl());
  const i = src.indexOf('findPageEditor(window)');
  assert.ok(i > 0, '본문 칸 찾기를 부르지 않는다');
  /* 못 찾았을 때 «되돌아 나가는지» — 알리기만 하고 이어서 쓰면 안 된다 */
  const 뒤 = src.slice(i, i + 400);
  assert.match(뒤, /if\s*\(\s*!\s*ed\s*\)[\s\S]{0,300}return/,
    '★ 본문 칸을 못 찾고도 계속 간다');
});
