'use strict';
/* 기업 상세 첫 화면 — 「우리가 일하는 회사」로 열고, 할 일 단추를 첫 화면에 (대표 결정 2026-08-27)
   ═══════════════════════════════════════════════════════════════════════════
   ■ 무엇이 문제였나
     ① 첫 화면이 4,147곳을 이름순으로 늘어놓았다. 한글 정렬은 (사)·(유)·(재) 같은
        괄호 이름을 앞으로 몰아넣는데, 그게 거의 다 «명함 한 장짜리» 협회·단체다.
        사업자등록증이 있는 곳은 349곳뿐인데, 첫 100줄은 나머지 3,800곳부터 보여 줬다.
     ② 「📋 정보부족」·「⚠ 값이 다름」·「🚪 종료」 단추가 첫 화면에서 «하나도 안 보였다».
        폴더를 안 고르면 머리줄을 통째로 숨기고 있었기 때문이다. 그 규칙은 2026-08-17 에
        「폴더를 안 골랐으면 보여 줄 탭이 없어 빈 띠만 남는다」는 이유로 넣은 것인데,
        그 뒤 그 줄에 단추 넷이 들어와 «더는 빈 띠가 아니다». 이유가 사라진 규칙이었다.

   ■ 푸른이알피는 어떻게 하나 (pu-erp.html 업체관리)
       if(typeTab==='all') return ['자문','급여','노조','기금'].indexOf(c.typeCode)>=0
                                  && c.status==='active';
     «전체»조차 일하는 거래처만 보여 준다. 같은 회사를 다루는 두 화면이 한쪽은 312곳,
     한쪽은 4,147곳으로 열려 있었다.

   ★ 여기서 못 박는 것
     ① 첫 화면은 「우리가 일하는 회사」다 (coCares — 이미 있는 잣대를 그대로 쓴다)
     ② 「＃ 전체」로 «한 번 눌러» 돌아간다 — 접는 것이지 지우는 게 아니다
     ③ 두 칩은 저마다 «누르면 몇 곳이 되는지»를 보여 준다
     ④ 푸른이알피가 아직 안 실렸으면 «안 거른다» — 첫 그리기에 빈 화면이 뜨면 안 된다
     ⑤ 폴더·검색과 «함께» 좁혀진다
     ⑥ 머리줄이 「전체」에서도 보인다
     ⑦ 새 Firebase 쓰기가 없다
   실행: node --test tests/cards-co-landing.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8').replace(/\r\n/g, '\n');

function fnBody(name){
  let i = src.indexOf('\nfunction ' + name + '(');
  assert.ok(i >= 0, name + ' 를 찾을 수 없습니다');
  const open = src.indexOf('{', i);
  let d = 0;
  for (let k = open; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); }
  }
  assert.fail(name + ' 의 끝을 찾을 수 없습니다');
}

/* 거르기·세기를 떼어 돌린다 */
function load(state, cos, erpReady){
  const ctx = { console, Object, Array, String, Number,
    state: Object.assign({ coFolder:'', coFTab:'', coTag:'', coQ:'', coColFilter:{},
      coOnlyClosed:false, coOnlyNoBiz:false, coOnlyIncomplete:false, coOnlyUid:false,
      coOnlyCares:true }, state||{}),
    coList: () => cos || [],
    coFTabsOf: () => [], coTagsOf: o => (o && o.tags) || [],
    CO_SORT: { type: o => (o.erp && o.erp.type) || '' },
    coSorted: l => l,
    coIsUid: () => false,
    ErpMatch: { ready: erpReady !== false } };
  vm.createContext(ctx);
  vm.runInContext(src.match(/^const CO_CORE = [\s\S]*?\];/m)[0].replace(/^const /, 'var ') + '\n'
    + fnBody('coVal') + '\n' + fnBody('coMissing') + '\n' + fnBody('coCares') + '\n'
    + fnBody('coLacks') + '\n' + fnBody('coFilteredList') + '\n' + fnBody('coVisible') + '\n'
    + fnBody('coScopeCounts'), ctx);
  return ctx;
}
const 거래처 = (k, o) => Object.assign({ key:k, name:'거래처'+k, bizno:'1234567890',
  cards:[], bizs:[], docs:1, erp:{ type:'자문', left:false }, tags:[], extra:{} }, o||{});
const 명함만 = (k, o) => Object.assign({ key:k, name:'단체'+k, bizno:'',
  cards:[{}], bizs:[], docs:0, erp:null, tags:[], extra:{} }, o||{});

/* ══════ ① 첫 화면은 「우리가 일하는 회사」 ══════ */

test('★ 처음 들어오면 거래처만 보인다 — 4,147곳을 이름순으로 쏟지 않는다', () => {
  const cos = [명함만('a'), 거래처('b'), 명함만('c'), 거래처('d')];
  assert.deepEqual(load({}, cos).coVisible().map(o=>o.key), ['b','d']);
});

test('★ state 의 첫 값이 «켜짐»이다 — 첫 화면이 곧 이 상태다', () => {
  const m = src.match(/coOnlyCares\s*:\s*(true|false)/);
  assert.ok(m, 'state 에 coOnlyCares 첫 값이 없다');
  assert.equal(m[1], 'true',
    '★ 꺼진 채로 시작하면 첫 화면이 예전 그대로다 — 이 작업을 한 뜻이 없다');
});

test('사업 딱지가 붙은 회사도 「일하는 회사」다 — 거래처가 아니어도', () => {
  const cos = [명함만('a', { tags:['기술보호울타리'] }), 명함만('b')];
  assert.deepEqual(load({}, cos).coVisible().map(o=>o.key), ['a']);
});

/* ══════ ② 「＃ 전체」로 돌아간다 ══════ */

test('★ 끄면 4,147곳이 그대로 다 나온다 — 접는 것이지 지우는 게 아니다', () => {
  const cos = [명함만('a'), 거래처('b'), 명함만('c')];
  assert.equal(load({ coOnlyCares:false }, cos).coVisible().length, 3);
});

/* ══════ ③ 두 칩이 «누르면 몇 곳이 되는지»를 보여 준다 ══════ */

test('★ 「＃ 전체」가 «전체 수»를 말한다 — 거래처 수를 되풀이하면 누를 까닭이 안 보인다', () => {
  const cos = [명함만('a'), 거래처('b'), 명함만('c'), 거래처('d'), 명함만('e')];
  const C = load({ coOnlyCares:true }, cos);          /* 거래처만 켜 둔 상태에서 센다 */
  const n = C.coScopeCounts();
  assert.equal(n.cares, 2);
  assert.equal(n.all, 5,
    '★ 거래처 거르개를 «뺀» 수여야 한다 — 안 그러면 둘 다 2로 나와 고를 까닭이 없다');
});

test('꺼 둔 상태에서도 두 수가 같다 — 고르는 것에 따라 흔들리면 안 된다', () => {
  const cos = [명함만('a'), 거래처('b'), 명함만('c'), 거래처('d'), 명함만('e')];
  /* vm 안에서 만든 객체는 원형이 달라 deepEqual 이 그대로는 실패한다 — JSON 을 거친다 */
  const plain = v => JSON.parse(JSON.stringify(v));
  const on = plain(load({ coOnlyCares:true }, cos).coScopeCounts());
  const off = plain(load({ coOnlyCares:false }, cos).coScopeCounts());
  assert.deepEqual(on, off);
});

/* ══════ ④ 푸른이알피가 안 실렸으면 안 거른다 ══════ */

test('★ 푸른이알피가 아직 안 실렸으면 «안 거른다» — 첫 그리기에 빈 화면이 뜨면 안 된다', () => {
  /* ErpMatch 는 따로 불러온다. 그 전에는 어느 회사도 거래처로 안 보여, 켜 둔 채로
     거르면 「회사를 찾지 못했습니다」가 잠깐 떴다 사라진다 — 고장으로 보인다. */
  const cos = [명함만('a'), 명함만('b'), 명함만('c')];
  assert.equal(load({ coOnlyCares:true }, cos, false).coVisible().length, 3,
    '★ 실리기 전에 거르면 첫 화면이 통째로 빈다');
});

test('푸른이알피가 실린 뒤에는 제대로 거른다', () => {
  const cos = [명함만('a'), 거래처('b')];
  assert.equal(load({ coOnlyCares:true }, cos, true).coVisible().length, 1);
});

/* ══════ ⑤ 폴더·검색과 함께 ══════ */

test('★ 폴더와 «함께» 좁혀진다 — 덮어쓰지 않는다', () => {
  const cos = [거래처('a', { folder:'f1' }), 거래처('b', { folder:'f2' }),
               명함만('c', { folder:'f1' })];
  assert.deepEqual(load({ coFolder:'f1' }, cos).coVisible().map(o=>o.key), ['a']);
});

test('찾기와도 함께 좁혀진다', () => {
  const cos = [거래처('a', { name:'가나테크' }), 거래처('b', { name:'다라산업' })];
  assert.deepEqual(load({ coQ:'가나' }, cos).coVisible().map(o=>o.key), ['a']);
});

test('거르는 일은 coFilteredList 한 곳에만 둔다', () => {
  assert.match(fnBody('coFilteredList'), /coOnlyCares/,
    '★ 딴 곳에서 거르면 화면마다 결과가 어긋난다');
});

/* ══════ ⑥ 머리줄이 「전체」에서도 보인다 ══════ */

test('★ 폴더를 안 골라도 머리줄이 보인다 — 할 일 단추가 첫 화면에 있어야 한다', () => {
  const m = src.match(/hd\.style\.display = \(([^)]*)\)/);
  assert.ok(m, '머리줄을 감췄다 보이는 자리를 찾지 못했습니다');
  assert.equal(/coFolder/.test(m[1]), false,
    '★ 폴더를 안 골랐다고 머리줄을 숨기면 정보부족·종료 단추가 첫 화면에서 사라진다 — '
    + '그 줄은 이제 단추 넷이 든 줄이라 더는 «빈 띠»가 아니다');
});

test('그래도 설정·자료함·메일 화면에서는 숨긴다 — 거기 쓰는 줄이 아니다', () => {
  const m = src.match(/hd\.style\.display = \(([^)]*)\)/);
  ['isSet', 'isMat', 'isMail'].forEach(function (v) {
    assert.match(m[1], new RegExp(v), v + ' 화면에서 머리줄을 숨기지 않는다');
  });
});

/* ══════ ⑦ 두 칩이 늘 보인다 ══════ */

function drawTabs(state){
  const ctx = { console, Object, Array, String, Number,
    esc: s => String(s==null?'':s),
    state: Object.assign({ coFolder:'', coFTab:'', isAdmin:true, coPageSize:100,
      coOnlyClosed:false, coOnlyNoBiz:false, coOnlyIncomplete:false, coOnlyUid:false,
      coOnlyCares:true }, state||{}),
    _coFolders: {},
    coList: () => [],
    coSizeSelHtml: () => '', coClosedCount: () => 0, coNoBizCount: () => 0,
    coIncompleteCount: () => 0, coUidCount: () => 0,
    coScopeCounts: () => ({ cares: 312, all: 4147 }) };
  vm.createContext(ctx);
  const a = '/* ══════ 폴더 안의 탭 — 순수 로직 (테스트 대상) ══════';
  const b = '/* ══════ 폴더 안의 탭 — 화면 ══════ */';
  /* ⚠ coToolsHtml 은 저 조각 «밖»에 있다 — 따로 실어 준다. 대역을 쓰면 이 검사가
     보려는 것(두 칩이 실제로 그려지는가)을 아무것도 안 보게 된다. */
  vm.runInContext(src.slice(src.indexOf(a), src.indexOf(b)) + '\n'
    + fnBody('coFilters') + '\n' + fnBody('coFilterOnCount') + '\n' + fnBody('coFilterBtnHtml') + '\n' + fnBody('coToolsHtml') + '\n' + fnBody('renderCoFTabsHtml'), ctx);
  return ctx.renderCoFTabsHtml();
}

test('★ 두 칩이 «늘» 보인다 — 고르는 것이라 0곳이어도 숨기지 않는다', () => {
  /* 알림 단추(정보부족 등)는 0이면 숨긴다 — 누를 값이 없으니까.
     이 둘은 «고르는 것»이라 다르다. 숨기면 켜져 있는 줄도 모르고 되돌릴 길도 없다. */
  const h = drawTabs({});
  assert.ok(h.indexOf('거래처') > 0, '거래처 칩이 없다');
  assert.ok(h.indexOf('전체') > 0, '전체 칩이 없다');
  assert.ok(h.indexOf('312') > 0 && h.indexOf('4,147') > 0, '두 수가 다 보여야 고를 수 있다');
});

/* 칩 하나만 떼어 본다.
   ⚠ 줄 전체에서 찾으면 «한쪽만» 망가져도 다른 쪽 때문에 통과한다 — 실제로 그렇게 샜다
     (2026-08-27 고장넣기 H·I). 그래서 칩마다 따로 본다. */
function chip(html, label){
  const at = html.indexOf(label);
  assert.ok(at > 0, label + ' 칩이 없다');
  const start = html.lastIndexOf('<button', at);
  const end = html.indexOf('</button>', at);
  assert.ok(start >= 0 && end > start, label + ' 칩의 단추를 못 찾았다');
  return html.slice(start, end);
}

test('★ 칩마다 «저마다» 눌러서 갈 수 있다', () => {
  const h = drawTabs({});
  assert.match(chip(h, '거래처'), /coOnlyCares\s*=\s*true/, '거래처로 돌아갈 길이 없다');
  assert.match(chip(h, '🏢 전체'), /coOnlyCares\s*=\s*false/, '전체로 갈 길이 없다');
});

test('★ 칩마다 «저마다» 첫 쪽으로 돌린다 — 5쪽에서 바꾸면 빈 화면이 뜬다', () => {
  const h = drawTabs({});
  assert.match(chip(h, '거래처'), /coPage\s*=\s*0/, '거래처 칩이 쪽수를 안 되돌린다');
  assert.match(chip(h, '🏢 전체'), /coPage\s*=\s*0/, '전체 칩이 쪽수를 안 되돌린다');
});

test('★ 칩마다 «저마다» 켜진 것으로 보인다 — 어느 쪽인지 알아야 한다', () => {
  const on = drawTabs({ coOnlyCares:true });
  const off = drawTabs({ coOnlyCares:false });
  assert.match(chip(on, '거래처'), /class="pctool on"/, '거래처를 골랐는데 안 켜져 보인다');
  assert.equal(/class="pctool on"/.test(chip(on, '🏢 전체')), false,
    '고르지 않은 쪽이 켜져 보인다');
  assert.match(chip(off, '🏢 전체'), /class="pctool on"/, '전체를 골랐는데 안 켜져 보인다');
  assert.equal(/class="pctool on"/.test(chip(off, '거래처')), false,
    '고르지 않은 쪽이 켜져 보인다');
});

/* ══════ ⑧ 새 쓰기가 없다 ══════ */

test('★ 화면만 읽는다 — 서버에 쓰지 않는다', () => {
  for (const n of ['coScopeCounts', 'coFilteredList']) {
    assert.equal(/db\.ref\(|Store\.db|firebase\.database\(|\.update\(|Store\.put/.test(fnBody(n)), false,
      '★ ' + n + ' 이 서버를 건드린다');
  }
});
