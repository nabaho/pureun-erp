'use strict';
/* 경력관리 — PDF 서식에 «한글» 이 실제로 들어가는지 지킨다 (대표 지시 2026-09-02 「가로」)

   ■ 무슨 일이 있었나
   기관이 PDF 로 보낸 빈 서식에 이름을 넣으려니 한 자도 안 들어갔다. pdf-lib 이 딸려
   주는 Helvetica 는 서유럽 글자만 담아서, 조용히 비는 것도 아니고 그 자리에서 터진다:
     WinAnsi cannot encode "권" (0xad8c)
   그래서 나눔고딕(SIL OFL)을 저장소에 담고 fontkit 으로 심게 고쳤다.

   ■ 그런데 «두 번째» 함정이 있었다 — 이 검사가 지키는 것이 그것이다
   폰트를 심을 때 subset(쓴 글자만 골라 담기) 을 켜면 PDF 가 730KB → 9KB 로 준다.
   솔깃해서 켰다. 결과:
       「권형하 · 공인노무사 등록번호」  →  「권형하 ·   노     호」
   터지지도, 물음표도 아니고 «그냥 빈자리» 다. 검사도 조용히 초록이었다.
   까닭: @pdf-lib/fontkit 의 subset 이 한글 «합성글립» 의 부품을 같이 안 담는다.
   박힌 폰트를 뜯어 재 보면 — 켬: 그린 글립 16개 중 6개가 «획 0개»
                             끔: 16개 중 1개(빈칸 — 원래 획이 없는 것이 맞다)

   ■ 여기서 «값» 을 못 박는 까닭
   보통은 「지금 값」을 박지 말라는 규칙이 맞다. 그런데 subset:false 는 지금 값이 아니라
   **규칙**이다 — 켜면 글자가 사라진다. 크기를 줄이려는 다음 사람이 반드시 다시 켠다.
   그때 이 검사가 까닭까지 들고 막는다.                              검사고정-허용

   ⚠ 이 파일은 주석에 subset:true 라는 «글자» 를 여러 번 담고 있다. 그래서 소스를
     글자로 볼 때는 반드시 주석을 먼저 걷는다 — 안 걷으면 자기 주석 때문에 깨진다. */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { stripComments } = require('./strip-comments');
const { cutFn } = require('./cut-fn');

const ROOT = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(ROOT, 'kcareer.html'), 'utf8');
const bare = stripComments(app);

test('한글 폰트를 심는 자리가 있다 (Helvetica 로 되돌아가지 않았다)', () => {
  const fn = cutFn(bare, 'async function _koFontFor(');
  assert.ok(fn, '_koFontFor 가 없다 — 한글을 심는 자리가 사라졌다');
  assert.ok(/registerFontkit/.test(fn),
    'registerFontkit 없이 embedFont 하면 「input must be StandardFonts」로 터진다');
  assert.ok(/embedFont/.test(fn), 'embedFont 로 폰트를 심어야 한다');
});

test('⛔ subset 을 켜지 않는다 — 켜면 한글이 빈자리가 된다', () => {
  const fn = cutFn(bare, 'async function _koFontFor(');
  assert.ok(/subset\s*:\s*false/.test(fn),
    'subset:false 를 «적어» 두어야 한다 — 빠뜨리면 다음 사람이 켠다');
  assert.ok(!/subset\s*:\s*true/.test(fn),
    'subset:true 는 한글 합성글립의 부품을 빠뜨린다 — 「공인노무사」가 「 노 」로 나온다.\n' +
    '    크기(730KB→9KB)가 아까워 켜는 것인데, 이력서 한 장 730KB 는 붙임서류로 문제없다.');
});

test('PDF 에 글자를 그릴 때 한글 폰트를 쓴다 (StandardFonts 로 안 돌아간다)', () => {
  const fn = cutFn(bare, 'async function savePdfEdited(');
  assert.ok(fn, 'savePdfEdited 가 없다');
  assert.ok(/_koFontFor\s*\(/.test(fn),
    'savePdfEdited 가 _koFontFor 를 안 부른다 — 한글이 다시 안 들어간다');
  assert.ok(!/StandardFonts/.test(fn),
    'StandardFonts(Helvetica)로 되돌아가면 한글에서 그 자리에서 터진다');
});

test('폰트를 못 실으면 «까닭을 들고» 멈춘다 (조용히 Helvetica 로 안 빠진다)', () => {
  const fn = cutFn(bare, 'async function _koFontFor(');
  assert.ok(/throw\s+new\s+Error/.test(fn),
    '못 심었을 때 던지지 않으면, 뒤에서 「WinAnsi cannot encode」로 엉뚱하게 터진다');
  const load = cutFn(bare, 'async function _loadKoFont(');
  assert.ok(load && /throw\s+new\s+Error/.test(load),
    '폰트 파일을 못 받았을 때(404 등)도 까닭을 들고 멈춰야 한다');
});

test('나눔고딕 파일이 저장소에 «실제로» 있고, 한글이 든 TTF 다', () => {
  const fn = cutFn(bare, 'async function _loadKoFont(');
  const m = /KO_FONT_URL\s*=\s*'([^']+)'/.exec(bare);
  assert.ok(m, 'KO_FONT_URL 을 못 찾았다');
  const p = path.join(ROOT, m[1]);
  assert.ok(fs.existsSync(p), '폰트 파일이 없다: ' + m[1] + ' — 화면은 404 로 멈춘다');
  const buf = fs.readFileSync(p);
  assert.ok(buf.length > 500 * 1024,
    '폰트가 너무 작다(' + (buf.length / 1024).toFixed(0) + 'KB) — 한글 전체가 든 파일이 아니다');
  /* TrueType 머리표: 00 01 00 00 또는 'true' */
  const head = buf.slice(0, 4).toString('hex');
  assert.ok(head === '00010000' || head === '74727565',
    '폰트 파일 머리표가 TTF 가 아니다(' + head + ') — 내려받다 만 파일일 수 있다');
  assert.ok(fn, '_loadKoFont 가 없다');
});

test('폰트 쓸 권리를 밝힌 파일이 함께 있다 (남의 폰트를 싣는 것이 아니다)', () => {
  const lic = fs.readdirSync(path.join(ROOT, 'fonts'))
    .filter((f) => /OFL|LICENSE|licen/i.test(f));
  assert.ok(lic.length,
    'fonts/ 에 OFL(쓸 권리) 파일이 없다 — 폰트를 PDF 에 실어 밖으로 내보내는 일이다');
});

test('배포가 fonts/ 를 걷어내지 않는다', () => {
  const wf = fs.readFileSync(path.join(ROOT, '.github/workflows/deploy-pages.yml'), 'utf8');
  const 지운다 = /for d in ([^\n]*(?:\\\n[^\n]*)*)/.exec(wf);
  assert.ok(지운다, '배포에서 «빼는 목록» 을 못 찾았다 — 이 검사를 손봐야 한다');
  assert.ok(!/\bfonts\b/.test(지운다[1]),
    '배포가 fonts/ 를 지운다 — 여기서는 되고 «올린 화면에서만» 404 로 안 된다');
});
