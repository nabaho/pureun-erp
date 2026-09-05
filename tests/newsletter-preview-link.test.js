/* 미리보기·튕김·규칙 — 2026-09-05 대표 화면에서 나온 탈 셋
   ═══════════════════════════════════════════════════════════════════════════
   ① 「자료를 읽지 못했습니다 — permission_denied at /ilabor/items」
      서버(ilaborPull)가 관리자 SDK 로 담기만 하던 자리라 규칙이 «아예 없었다».
      기본 거절에 걸려, 받아 둔 자료 10건을 화면이 하나도 못 읽었다.

   ② 미리보기 안에서 링크를 누르면 «미리보기가 통째로 날아갔다».
      srcdoc 안의 <a> 는 그 창을 그대로 떠난다 — 대표께서 실제로 그렇게 하셨고
      돌아올 길이 없어 미리보기가 사라졌다.

   ③ 그렇게 눌렀을 때 깃허브의 «영어 404» 가 떴다.
      추적 링크가 모르는 번호면 기본 주소로 튕기는데, 그 자리(/pureunall/)에는
      index 파일이 없다. ⚠ 받는 분이 눌러도 같은 일이 난다 — 우리 편지를 열고
      링크를 눌렀는데 영어 404 를 보는 것이다. */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { 주석걷기, 함수몸 } = require('./helpers/strip-comments.js');

const 뿌리 = path.join(__dirname, '..');
const 화면 = 주석걷기(fs.readFileSync(path.join(뿌리, 'pu-news.html'), 'utf8'));
const 서버 = 주석걷기(fs.readFileSync(path.join(뿌리, 'functions', 'index.js'), 'utf8'));
const 서식 = 주석걷기(fs.readFileSync(path.join(뿌리, 'js', 'pu-news-tpl.js'), 'utf8'));

/* ═══ ① 받아 둔 자료를 «읽을 수 있는가» ═══════════════════════════════ */

test('★ ilabor 자리에 규칙이 있다 — 없으면 받아 놓고 아무도 못 읽는다', () => {
  const 만들개 = fs.readFileSync(path.join(뿌리, 'scripts', 'make-firebase-rules.js'), 'utf8');
  assert.ok(/rules\.ilabor\s*=/.test(만들개), '★ ilabor 규칙이 만들개에 없다');
});

test('★ 규칙이 «읽기만» 연다 — 화면이 원본을 지우면 다시 받을 수 없다', () => {
  const out = require('node:child_process')
    .execSync('node scripts/make-firebase-rules.js', { cwd: 뿌리 }).toString();
  const j = JSON.parse(out);
  const r = j.rules && j.rules.ilabor;
  assert.ok(r, '★ 만들어진 규칙에 ilabor 가 없다');
  assert.ok(/isAdmin/.test(String(r['.read'])), '★ 아무나 읽는다 — 남의 회원 계정으로 받아 온 자료다');
  assert.equal(r['.write'], false, '★ 화면이 쓸 수 있다 — 원본을 지울 수 있는 길이 열린다');
});

/* ═══ ② 미리보기에서 링크를 눌러도 미리보기가 살아 있다 ═══════════════ */

test('★ 미리보기 안의 링크는 «새 창»으로 연다 — 미리보기가 날아가면 안 된다', () => {
  /* srcdoc 안의 <a> 는 기본으로 그 창을 떠난다. 떠나면 돌아올 길이 없다. */
  const 자리 = ['미리보기그리기', '크게보기', '지난미리보기그리기'];
  자리.forEach(function (이름) {
    const 몸 = 함수몸(화면, 이름);
    assert.ok(몸, 이름 + ' 함수가 없다');
    if (!/srcdoc/.test(몸)) return;                 /* srcdoc 을 안 쓰면 볼 것이 없다 */
    assert.ok(/base target="_blank"/.test(몸),
      '★ ' + 이름 + ' — 링크를 누르면 미리보기가 통째로 날아간다');
  });
});

test('★ «진짜 편지»에는 base 를 넣지 않는다 — 메일 프로그램이 알아서 연다', () => {
  assert.ok(!/<base/i.test(서식),
    '★ 편지에 base 가 들어갔다 — 받는 프로그램에 따라 엉뚱하게 굴 수 있다');
});

/* ═══ ③ 모르는 번호로 튕길 때 404 가 아니다 ═══════════════════════════ */

test('★ 튕겨 보내는 자리에 «문이 있다» — 404 로 보내지 않는다', () => {
  const m = /res\.redirect\(302,[^)]*\)/.exec(서버);
  assert.ok(m, '★ 튕겨 보내는 자리를 못 찾았다');
  const 줄 = m[0];
  assert.ok(!/pureunall\/"\s*\)/.test(줄),
    '★ index 파일이 없는 자리로 보낸다 — 깃허브의 영어 404 가 뜬다');
  assert.ok(/\.html/.test(줄), '★ 실제 쪽으로 보내지 않는다');
});

test('★ 그 자리에 «정말로 파일이 있다» — 주소만 바꾸고 파일이 없으면 같은 일이다', () => {
  const m = /res\.redirect\(302,[^)]*\|\|\s*"([^"]+)"/.exec(서버);
  assert.ok(m, '★ 기본 주소를 못 찾았다');
  const 파일 = String(m[1]).split('/').pop();
  assert.ok(파일 && /\.html$/.test(파일), '★ 기본 주소가 파일이 아니다: ' + m[1]);
  assert.ok(fs.existsSync(path.join(뿌리, 파일)),
    '★ 보내는 자리에 그 파일이 없다 — 또 404 다: ' + 파일);
});
