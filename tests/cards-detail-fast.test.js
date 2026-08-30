'use strict';
/* ══════ 명함 상세가 «늦게» 뜨던 것 + 팝업에서 바로 담당 지정 (대표 지시 2026-08-30) ══════
   대표님: 「기업정보함 팝업창이 늦게 나온다 … 여기에 푸른직원 담당 연결시킬 수 있나」

   ■ ① 왜 늦었나 — 창이 아니라 «사진»이다
     창은 바로 그려진다. 그런데 열자마자 Store.getPhoto 로 «원본 사진 두 장»을
     무조건 받아 왔다. 원본은 증빙용이라 일부러 크게 저장한 것이다(2026-08-09 결정으로
     창고에 두고 실시간DB에서 뺐다) — 명함을 훑기만 해도 그것이 계속 내려온다.
     속도도 요금도 그 값을 치른다.

     고침 둘:
       ㉮ 목록이 이미 쥔 썸네일(Store.thumbCache)을 창에 «넘겨준다» — 첫 그림이 즉시.
          예전에는 it.thumb 이 undefined 면 서버를 한 번 더 갔다(ensureThumbs).
       ㉯ 원본은 «누를 때만» 받는다. zoom() 이 이미 원본을 받아 오므로 새 길이 아니다.

   ■ ② 담당 지정 — 재료는 이미 다 있다
     it.owner 칸도, 직원 명부(data/user_dir)도 이미 읽고 있다. 팝업에서 «바로» 고를
     길만 없었다(목록으로 나가 ⋯ 메뉴를 거쳐야 했다).
     ⚠ 비어 있어도 «담당 없음»으로 보여 준다 — 안 보이면 담당이 없는 것인지 화면이
       빠뜨린 것인지 알 수 없다. */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8');

function fn(name) {
  const at = SRC.search(new RegExp('(?:^|\\n)(?:async )?function ' + name + '\\('));
  assert.ok(at >= 0, name + ' 을 찾지 못했다');
  const open = SRC.indexOf('{', at);
  let d = 0;
  for (let k = open; k < SRC.length; k++) {
    if (SRC[k] === '{') d++;
    else if (SRC[k] === '}') { d--; if (!d) return SRC.slice(at, k + 1); }
  }
  throw new Error(name + ' 의 끝을 찾지 못했다');
}
/* ⚠ 주석을 걷어 내고 본다 — 안 걷으면 «내가 쓴 설명»을 코드로 착각해 통과한다 */
const bare = s => String(s).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

/* ── ① 열 때 원본을 안 받는다 ─────────────────────────────────────── */
test('★ 상세를 열 때 «원본 사진»을 받지 않는다', () => {
  ['openPcDetail', 'openDetail'].forEach(n => {
    const src = bare(fn(n));
    assert.ok(!/Store\.getPhoto\(/.test(src),
      '★ ' + n + ' 이 열자마자 원본을 받는다 — 명함을 훑기만 해도 큰 사진이 계속 내려온다');
  });
});

test('★ 원본은 «누를 때» 받는다 — 앞면·뒷면 둘 다', () => {
  /* ⚠ 「getPhoto 가 들어 있나」로만 보면 한쪽만 없애도 통과한다 — 뒷면 줄이 남아
     있어서다(2026-08-30 고장 시험에서 샜다). 갈래마다 따로 못 박는다. */
  const z = bare(fn('zoom'));
  const back = z.split('_b')[1] || '';
  assert.ok(/endsWith\('_b'\)[\s\S]{0,120}Store\.getPhoto\(/.test(z),
    '★ 뒷면을 눌러도 원본이 안 온다');
  const front = z.slice(z.lastIndexOf('else src'));
  assert.ok(/Store\.getPhoto\(/.test(front),
    '★ 앞면을 눌러도 원본이 안 온다 — 원본을 볼 길이 아예 없어졌다');
});

/* ── ② 목록이 쥔 썸네일을 넘겨받는다 ─────────────────────────────── */
function seed(thumbCache, it) {
  const b = {
    state: { items: { c1: it } },
    Store: { thumbCache: thumbCache, getThumb: () => Promise.resolve('') }
  };
  vm.createContext(b);
  vm.runInContext(fn('detailThumbOf'), b);
  return b;
}

test('★ 목록이 이미 받아 둔 썸네일을 그대로 쓴다', () => {
  const b = seed({ c1: 'data:img-front', c1_b: 'data:img-back' },
                 { id: 'c1', kind: 'card' });
  const r = JSON.parse(JSON.stringify(vm.runInContext("detailThumbOf(state.items.c1)", b)));
  assert.equal(r.front, 'data:img-front',
    '★ 목록에 이미 있는 그림을 안 쓰고 서버를 다시 간다');
  assert.equal(r.back, 'data:img-back');
});

test('★ 명함에 이미 붙은 값이 «먼저»다 — 빈 글자도 답이다', () => {
  /* ⚠ 뒷면 캐시에 «값이 있는» 채로 봐야 한다. 캐시가 비어 있으면 빈 글자를 되살리는
     고장도 같은 답('')을 내어 그냥 통과한다(2026-08-30 고장 시험에서 샜다). */
  const b = seed({ c1: 'data:cache', c1_b: 'data:cache-back' },
                 { id: 'c1', kind: 'card', thumb: 'data:own', thumb2: '' });
  const r = JSON.parse(JSON.stringify(vm.runInContext("detailThumbOf(state.items.c1)", b)));
  assert.equal(r.front, 'data:own', '명함이 쥔 값을 두고 캐시를 썼다');
  assert.equal(r.back, '',
    '★ 빈 글자는 «사진 없는 명함»이라는 뜻이다 — 되살리면 없는 그림을 매번 받으러 간다');
});

test('아무 데도 없으면 빈 글자 — 지어내지 않는다', () => {
  const b = seed({}, { id: 'c1', kind: 'card' });
  const r = JSON.parse(JSON.stringify(vm.runInContext("detailThumbOf(state.items.c1)", b)));
  assert.equal(r.front, '');
  assert.equal(r.back, '');
});

test('★ 그래도 못 찾으면 뒤늦게 받아 채우는 길은 남아 있다', () => {
  const src = bare(fn('openPcDetail'));
  assert.ok(/ensureThumbs\(/.test(src) && /fillDetailPhotos\(/.test(src),
    '★ 캐시에 없는 명함은 사진이 영영 안 나온다');
});

/* ── ③ 팝업에서 바로 담당 지정 ───────────────────────────────────── */
test('★ 팝업에 「담당 지정」 단추가 있다', () => {
  const src = bare(fn('openPcDetail'));
  assert.ok(/askCardOwner\(/.test(src), '★ 담당을 지정하려면 목록으로 나가야 한다');
});

test('★ 담당이 비어 있어도 «담당 없음»으로 보여 준다', () => {
  const src = bare(fn('openPcDetail'));
  assert.ok(/담당 없음/.test(src),
    '★ 안 보이면 담당이 없는 것인지 화면이 빠뜨린 것인지 알 수 없다');
});

function ownerCtx(dirNames, answer) {
  const puts = [];
  const b = {
    /* ⚠ 명함을 «둘» 둔다. 하나만 두면 「전부 저장한다」는 고장이 그대로 샌다 —
       전부여도 한 장이라 개수가 같기 때문이다(2026-08-30 고장 시험에서 샜다). */
    state: { items: { c1: { id: 'c1', kind: 'card', owner: '박재원' },
                      c2: { id: 'c2', kind: 'card', owner: '김보람' } } },
    ErpMatch: { staffNames: () => dirNames },
    prompt: () => answer,
    toast: () => {},
    render: () => {},
    closeDetail: () => {},
    openPcDetail: () => {},
    openDetail: () => {},
    Store: { put: it => puts.push(it) },
    /* 바꾼 뒤 팝업을 다시 그린다 — PC 인지 폰인지만 가른다 */
    document: { body: { classList: { contains: () => true } } },
    _puts: puts
  };
  vm.createContext(b);
  vm.runInContext(fn('askCardOwner'), b);
  vm.runInContext("askCardOwner('c1')", b);
  return b;
}

test('★ 담당을 바꾸면 그 명함 «하나»만 저장한다', () => {
  const b = ownerCtx(['박재원', '김보람'], '김보람');
  assert.equal(b._puts.length, 1, '쓰기가 한 번이 아니다');
  assert.equal(b._puts[0].owner, '김보람');
  assert.equal(b._puts[0].id, 'c1');
});

test('★ 취소하면 «아무것도 안 쓴다»', () => {
  const b = ownerCtx(['박재원'], null);
  assert.equal(b._puts.length, 0, '★ 취소했는데 저장했다');
});

test('빈 글자를 넣으면 담당을 «떼는» 것이다', () => {
  const b = ownerCtx(['박재원'], '');
  assert.equal(b._puts.length, 1);
  assert.equal(b._puts[0].owner, '', '담당을 뗄 길이 없으면 잘못 넣은 것을 못 지운다');
});

test('★ 직원 명부를 «보여 준다» — 이름을 외워 치게 하지 않는다', () => {
  const src = bare(fn('askCardOwner'));
  assert.ok(/staffNames\(\)/.test(src),
    '★ 명부를 안 보여 주면 「박재원」과 「박 재원」이 따로 쌓인다');
});
