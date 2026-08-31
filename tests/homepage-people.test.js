'use strict';
/* 구성원 쪽을 «자료로» 그린다 — 그려도 지금 화면과 같아야 한다.
   ═══════════════════════════════════════════════════════════════════════════
   대표 결정 2026-08-31: 홈페이지를 새로 만들고 푸른ERP 에서 고친다.

   ★ 여기서 못 박는 것
     ① 지금 쪽에서 자료를 읽어 «다시 그리면 똑같다» — 이것이 이 방식의 전부다.
        같지 않으면 「똑같이 만들었다」는 말이 거짓이 된다.
     ② 사람을 빼거나 더해도 «그 자리만» 바뀐다 — 머리띠·발·상담문의 띠는 그대로.
     ③ 글 번호가 창 여닫기와 맞물린다(카드를 눌러 창이 열리는 열쇠다).
     ④ 꺾쇠가 든 글자를 넣어도 태그가 되지 않는다.
   실행: node --test tests/homepage-people.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const R = path.join(__dirname, '..');
const B = require(path.join(R, 'scripts', 'build-people.js'));
const PAGE = path.join(R, 'site', 'people', 'index.html');
const 원본 = fs.readFileSync(PAGE, 'utf8');

/* 경력 칸의 «안쪽 감싸개»는 사람마다 있기도 없기도 하다(홈페이지에 글을 넣은 방식 차이).
   화면에는 아무 차이가 없어, 우리는 한 가지로 통일한다. 견줄 때는 그 차이만 걷는다. */
function 고르기(s) {
  return String(s).replace(/<div class="desc">\s*<div>/g, '<div class="desc">')
    .replace(/<\/div>\s*<\/div>(\s*<\/div>\s*<\/div>\s*<div class="bh bh_modal_dimmed")/g, '</div>$1');
}
function 뭉치기(s) {
  return 고르기(s).replace(/>\s+/g, '>').replace(/\s+</g, '<').replace(/\s+/g, ' ');
}

test('★ 지금 쪽에서 자료를 읽어 «다시 그리면 똑같다» — 이게 아니면 「똑같이 만들었다」가 거짓이다', () => {
  const 사람 = B.사람읽기(원본);
  assert.ok(사람.length >= 5, '읽은 사람이 ' + 사람.length + '명뿐이다');
  const 새쪽 = B.쪽그리기(원본, 사람);
  assert.equal(뭉치기(새쪽), 뭉치기(원본),
    '★ 자료로 다시 그린 쪽이 지금 쪽과 다르다 — 화면이 달라진다는 뜻이다');
});

test('★ 읽은 자료에 사람의 «모든 칸»이 들어 있다 — 하나라도 빠지면 그리는 순간 사라진다', () => {
  const 사람 = B.사람읽기(원본);
  사람.forEach(p => {
    assert.ok(p.srl && /^\d+$/.test(p.srl), '글 번호가 없다: ' + JSON.stringify(p));
    assert.ok(p.이름, '이름이 없다: ' + p.srl);
    assert.ok(p.사진, p.이름 + ' 의 사진이 없다');
    assert.ok(Array.isArray(p.경력), p.이름 + ' 의 경력이 목록이 아니다');
  });
  /* 이름과 직책이 «갈라져» 있어야 한다 — 붙어 있으면 대표 카드가 「권형하 공인노무사」가 된다 */
  const 대표 = 사람.find(p => p.직책1);
  assert.ok(대표, '직책1 이 있는 사람이 하나도 없다 — 갈라 읽지 못한 것이다');
  assert.doesNotMatch(대표.이름, new RegExp(대표.직책2),
    '★ 이름에 직책2 가 섞여 들어갔다: ' + 대표.이름);
});

test('★ 사람을 빼면 «그 사람만» 사라진다 — 머리띠·발·상담문의 띠는 그대로', () => {
  const 사람 = B.사람읽기(원본);
  const 뺀것 = 사람[1];
  const 새쪽 = B.쪽그리기(원본, 사람.filter(p => p.srl !== 뺀것.srl));

  assert.equal(B.카드들(새쪽).length, 사람.length - 1, '★ 카드 수가 안 줄었다');
  assert.ok(새쪽.indexOf('data-srl="' + 뺀것.srl + '"') < 0,
    '★ 뺀 사람의 흔적이 남아 있다');
  /* 나머지 사람은 그대로 있어야 한다 */
  사람.filter(p => p.srl !== 뺀것.srl).forEach(p => {
    assert.ok(새쪽.indexOf('data-srl="' + p.srl + '"') > 0, p.이름 + ' 이 함께 사라졌다');
  });
  /* 쪽의 «틀»은 손도 안 댄다 */
  ['bh_modal_dimmed', 'footer', '041-556-0035', 'canonical'].forEach(표시 => {
    assert.ok(새쪽.indexOf(표시) > 0, '★ 쪽의 틀(' + 표시 + ')이 사라졌다');
  });
});

test('★ 사람을 더하면 카드가 는다 — 새 노무사를 넣는 길이다', () => {
  const 사람 = B.사람읽기(원본);
  const 새사람 = { srl: '999', 이름: '홍길동', 직책1: '', 직책2: '공인노무사',
                   사진: '../files/attach/images/새사람.jpg', 경력: ['現 가', '現 나'] };
  const 새쪽 = B.쪽그리기(원본, 사람.concat([새사람]));
  assert.equal(B.카드들(새쪽).length, 사람.length + 1);
  assert.ok(새쪽.indexOf('id="bh_modal_999"') > 0, '★ 새 사람의 창이 없다');
  assert.ok(새쪽.indexOf('홍길동') > 0, '★ 새 사람의 이름이 없다');
  assert.ok(새쪽.indexOf('새사람.jpg') > 0, '★ 새 사람의 사진이 없다');
});

test('★ 글 번호가 «창 여닫기»와 맞물린다 — 어긋나면 카드를 눌러도 창이 안 열린다', () => {
  const 사람 = B.사람읽기(원본);
  const 새쪽 = B.쪽그리기(원본, 사람);
  B.카드들(새쪽).forEach(c => {
    const 열쇠 = [...new Set([...c.html.matchAll(/data-srl="(\d+)"/g)].map(m => m[1]))];
    assert.equal(열쇠.length, 1, '★ 한 카드 안에 글 번호가 여럿이다: ' + 열쇠.join(','));
    assert.ok(c.html.indexOf('id="bh_modal_' + 열쇠[0] + '"') > 0,
      '★ 카드의 글 번호(' + 열쇠[0] + ')와 창의 번호가 다르다');
  });
});

test('★ 꺾쇠가 든 글자를 넣어도 태그가 되지 않는다', () => {
  const 사람 = B.사람읽기(원본).slice(0, 1);
  사람[0] = Object.assign({}, 사람[0], {
    이름: '<b>굵게</b>', 경력: ['現 <script>나쁜것</script>', '現 가 < 나']
  });
  const 새쪽 = B.쪽그리기(원본, 사람);
  const 카드 = B.카드들(새쪽)[0].html;
  assert.ok(카드.indexOf('<b>굵게</b>') < 0, '★ 넣은 글자가 태그가 됐다');
  assert.ok(카드.indexOf('<script>나쁜것') < 0, '★ 넣은 글자가 스크립트가 됐다');
  assert.match(카드, /&lt;b&gt;/, '꺾쇠를 안 감쌌다');
});

test('★ 카드에는 «이름+직책1»을 붙여 찍고, 창에는 갈라 찍는다 (지금 홈페이지와 같게)', () => {
  const 사람 = B.사람읽기(원본);
  const 대표 = 사람.find(p => p.직책1);
  const 새쪽 = B.쪽그리기(원본, 사람);
  const 카드 = B.카드들(새쪽).find(c => c.html.indexOf('data-srl="' + 대표.srl + '"') > 0).html;
  assert.ok(카드.indexOf(대표.이름 + 대표.직책1) > 0,
    '★ 카드에 「' + 대표.이름 + 대표.직책1 + '」로 붙여 찍지 않았다');
  assert.match(카드, new RegExp('<span class="pl-5">' + 대표.직책1 + '</span>'),
    '★ 창에서 직책1 을 갈라 찍지 않았다');
});
