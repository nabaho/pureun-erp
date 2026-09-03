/* 기업 상세를 «조용하게» — 겹치는 요약·같은 이름 서류·긴 설명 (대표 화면 2026-09-03)
   「중복과 계약 당시 같은 부분 오류가 생겨서 같은 내용도 있다. 이런 부분은 복잡하지 않게
    정리하는 방법 없나? 그리고 중복 여부 체크해서 중복이면 제거하는 게 좋다.
    그리고 너무 불필요한 설명 많다. 이런 부분 간단하게 한 줄로 하고 마우스 표시에 따라
    설명이 나오면 좋겠다.」

   대표 화면에서 실제로 이랬다 — 계약이 «한 건»뿐인 회사인데
     「이 회사에서 한 일 1건」 → 「모두 300,000원 · 1건」 → 「해 모름 · 1건 · 300,000원」
     → 「계약 (이름 없음) 300,000원」
   같은 값이 «네 번» 나왔다. 서류는 같은 이름이 두 줄로 섰고, 설명이 석 줄로 깔렸다.

     node --test tests/cards-co-detail-quiet.test.js */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'pu-cards.html'), 'utf8').split('\r\n').join('\n');

function fnBody(name) {
  const i = SRC.indexOf('\nfunction ' + name + '(');
  assert.ok(i >= 0, name + ' 을 찾지 못했습니다');
  const open = SRC.indexOf('{', i);
  let d = 0;
  for (let k = open; k < SRC.length; k++) {
    if (SRC[k] === '{') d++;
    else if (SRC[k] === '}') { d--; if (!d) return SRC.slice(i, k + 1); }
  }
  assert.fail(name + ' 의 끝을 찾지 못했습니다');
}
function load() {
  const ctx = {
    console,
    esc: s => String(s == null ? '' : s).replace(/[&<>"']/g,
      c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    fmtDate: () => '2026-09-03',
    _norm: s => String(s == null ? '' : s).toLowerCase().replace(/\s+/g, ''),
    coDocPairsHtml: () => ''
  };
  vm.createContext(ctx);
  vm.runInContext(fnBody('hintLine') + '\n' + fnBody('coDocsFold') + '\n' + fnBody('coDocsListHtml'), ctx);
  return ctx;
}

/* ── ① 설명은 한 줄, 자세한 것은 마우스로 ── */

test('★ 화면에는 «한 마디»만, 온전한 설명은 말풍선에', () => {
  const c = load();
  const h = c.hintLine('끌어다 놓으면 붙습니다', '어느 사업 것인지 이름으로는 알 수 없었습니다');
  assert.match(h, />끌어다 놓으면 붙습니다/, '짧은 한 마디가 화면에 나와야 한다');
  assert.match(h, /title="어느 사업 것인지 이름으로는 알 수 없었습니다"/, '온전한 설명이 말풍선에 없다');
  assert.ok(h.indexOf('<i class="hq">?</i>') > 0, '말풍선이 있다는 표시가 없으면 아무도 안 올려 본다');
});

test('★ 말풍선이 없으면 물음표를 «안» 붙인다 — 눌러도 안 나오는 표시는 고장으로 읽힌다', () => {
  const c = load();
  const h = c.hintLine('그냥 한 마디', '');
  assert.ok(h.indexOf('hq') < 0, '물음표가 붙었다: ' + h);
  assert.ok(h.indexOf('title=') < 0, '빈 말풍선이 붙었다: ' + h);
  assert.match(h, />그냥 한 마디</);
});

test('한 마디가 없으면 아무것도 안 그린다 — 빈 줄이 자리를 먹으면 안 된다', () => {
  const c = load();
  assert.equal(c.hintLine('', '설명만 있다'), '');
  assert.equal(c.hintLine(null, null), '');
});

test('★ 꺾쇠를 말풍선에도 그대로 안 내보낸다 — 속성이 깨진다', () => {
  const c = load();
  const h = c.hintLine('짧게', '따옴표 " 와 <b>꺾쇠</b>');
  assert.ok(h.indexOf('title="따옴표 " 와') < 0, '★ 말풍선 속성이 깨졌다: ' + h);
  assert.ok(h.indexOf('&quot;') > 0);
});

/* ── ② 같은 이름 서류를 접는다 ── */

test('★ 같은 이름 서류를 «한 줄»로 접는다 — 대표 화면에 두 줄로 서 있던 그것이다', () => {
  const c = load();
  const h = c.coDocsListHtml([
    { name: '통합 기술보호지원반 신청서', at: 3, year: '2026', id: 'p1' },
    { name: '통합 기술보호지원반 신청서', at: 2, year: '2026', id: 'p2' },
    { name: '사업자등록증', at: 1, year: '2026', id: 'p3' }
  ], '읽어 온 서류');
  /* 접히지 않은 줄은 둘(신청서 하나 + 등록증 하나) */
  assert.equal(h.split('class="cof codoc"').length - 1, 3,
    '접은 것도 «펼치면» 나와야 한다 — 줄 자체를 없애면 자료가 사라진 것처럼 보인다');
  assert.match(h, /같은 이름 2장/, '몇 장인지 세어 말해야 한다');
  assert.match(h, /<details class="codocdup"/, '접어 두고 눌러서 펼치게 한다');
});

test('★★ 세는 것은 «접기 전» 장수다 — 접었다고 서류가 줄어든 것이 아니다', () => {
  const c = load();
  const h = c.coDocsListHtml([
    { name: '신청서', at: 3 }, { name: '신청서', at: 2 }, { name: '신청서', at: 1 }
  ], '읽어 온 서류');
  assert.match(h, /읽어 온 서류 3건/, '★ 접었다고 3건이 1건으로 보이면 안 된다');
  assert.match(h, /같은 이름 3장/);
});

test('★★ 자료를 «지우지 않는다» — 접기는 그릴 때만 한다', () => {
  const c = load();
  const docs = [{ name: '신청서', at: 3 }, { name: '신청서', at: 2 }];
  c.coDocsListHtml(docs, '읽어 온 서류');
  assert.equal(docs.length, 2, '★ 원본 목록이 줄었다 — 그리는 함수가 자료를 건드렸다');
  const w = fnBody('coDocsFold');
  assert.ok(!/\.remove\(|Store\.(put|del)|splice\(/.test(w), '지우는 코드가 들어 있다');
});

test('이름이 다르면 안 접는다 · 빈 이름끼리는 「서식」으로 모인다', () => {
  const c = load();
  const a = c.coDocsFold([{ name: '가' }, { name: '나' }]);
  assert.equal(a.length, 2);
  assert.equal(a[0].dup.length, 0);
  const b = c.coDocsFold([{ name: '' }, {}]);
  assert.equal(b.length, 1, '이름을 못 읽은 것끼리는 한 줄로 모인다');
  assert.equal(b[0].dup.length, 1);
});

test('접는 잣대는 «이름 하나»다 — 날짜까지 같아야 접으면 정작 그 경우가 안 접힌다', () => {
  const c = load();
  /* 대표 화면의 그것: 같은 신청서를 2026-09-03 과 2026-08-31 에 두 번 읽었다 */
  const r = c.coDocsFold([
    { name: '통합 기술보호지원반 신청서', at: 300, by: '권형하' },
    { name: '통합 기술보호지원반 신청서', at: 200, by: '권형하' }
  ]);
  assert.equal(r.length, 1);
  assert.equal(r[0].at, 300, '최근 것이 대표로 선다');
});

/* ── ③ 겹치는 요약 줄 ── */

test('★ 한 건뿐이면 «합계 줄»을 따로 안 그린다 — 그 줄 자체가 금액을 말한다', () => {
  const at = SRC.indexOf('const 합계따로 =');
  assert.ok(at > 0, '합계 줄을 가르는 자리가 없다');
  const seg = SRC.slice(at, at + 900);
  assert.match(seg, /const 합계따로 = filtered \|\| all\.length > 1;/);
  assert.match(seg, /합계따로 \? `<div class="cohist-sum">/, '한 건이어도 합계 줄이 그대로 나온다');
  /* ⚠ 제목에도 금액을 올리지 않는다 — 올려 보니 브라우저에서 여전히 두 번 나왔다
       (제목의 300,000원 + 그 줄의 300,000원, 실측 2026-09-03). */
  assert.ok(seg.indexOf('sumAll.fee.toLocaleString()+\'원\'}</span></div>') < 0,
    '★ 제목에 금액을 올리면 한 건짜리 회사에서 또 두 번 나온다');
});

test('★ 줄이 하나뿐이면 «해 묶음 머리»도 안 그린다 — 바로 밑 줄이 같은 말을 한다', () => {
  const i = SRC.indexOf('if(grouped && rows.length > 1 && r.year !== curY){');
  assert.ok(i > 0, '★ 해 묶음 머리가 줄 수와 상관없이 나온다 — 「해 모름 1건 300,000원」이 겹친다');
  assert.equal(SRC.split('cohist-yr"><span class="n">').length - 1, 1, '그리는 자리가 둘이면 한쪽만 고쳐진다');
});

test('★★ 여러 건일 때는 «그대로» 둔다 — 조용하게 한다고 쓸모까지 없애면 안 된다', () => {
  /* 합계·해 묶음은 건이 여럿일 때 진짜로 쓸모가 있다. 조건이 «건수»에 걸려 있는지 본다. */
  const at = SRC.indexOf('const 합계따로 =');
  assert.match(SRC.slice(at, at + 120), /all\.length > 1/);
  const yr = SRC.indexOf('if(grouped && rows.length > 1');
  assert.ok(yr > 0);
});
