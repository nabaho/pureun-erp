'use strict';
/* 내려받기 — 셋 중 고르기, 그리고 «지금 보고 있는 목록»이 나간다
   ═══════════════════════════════════════════════════════════════════════════
   대표 지시 2026-08-29
     「명함 사업자 기업상세 각각 다운 받을 수 있게 해달라」
     「내려받는건 환경설정에서 할수 있게 해라」

   ■ 무엇이 잘못이었나
     ① 갈래가 «보고 있는 화면»으로 저절로 정해졌다(state.tab). 기업 상세를 보는 중에
        눌러도 명함이 나왔고, 기업 상세는 내보낼 길이 아예 없었다.
     ② 단추 설명은 「현재 목록」인데 «전체»가 나갔다. 폴더·탭으로 아무리 좁혀 놓아도
        6,295건이 통째로 나갔다 — 적힌 말과 하는 일이 달랐다.
        같은 날 대표가 「폴더로 분류하거나 탭으로 분류하면 된다」고 하신 뒤라,
        분류해 둔 것이 무시되는 것은 앞뒤가 안 맞았다.

   ★ 여기서 못 박는 것
     ① 창에 «적힌 수»와 파일에 «담기는 수»가 같다 — 이것이 알맹이다
     ② 세는 셈이 화면과 «한 벌»이다 (listItems · coVisible 을 그대로 쓴다)
     ③ 0건인 줄은 못 누른다
     ④ 내려받기는 환경설정에서 연다
   실행: node --test tests/cards-export-pick.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8').replace(/\r\n/g, '\n');
const code = s => String(s).replace(/\/\*[\s\S]*?\*\//g, ' ');

/* 중괄호를 세어 함수 한 덩이를 떼 온다 (길이로 자르면 근처가 길어질 때 터진다) */
function fn(name){
  const at = src.indexOf('function ' + name + '(');
  assert.ok(at >= 0, name + ' 을 찾지 못했습니다');
  let d = 0;
  for (let i = src.indexOf('{', at); i < src.length; i++){
    if (src[i] === '{') d++;
    else if (src[i] === '}'){ d--; if (!d) return src.slice(at, i + 1); }
  }
  assert.fail(name + ' 의 끝을 찾지 못했습니다');
}

/* ── exportScope 를 실제로 돌린다 — 「창에 적히는 수」가 여기서 나온다 ── */
function box(state, opts){
  const o = opts || {};
  const ctx = {
    console, state,
    listItems: kind => (o.byKind && o.byKind[kind]) || [],
    coVisible: () => o.co || [],
    narrowLabel: () => o.label || '전체',
    _coFolders: o.folders || {}
  };
  vm.createContext(ctx);
  vm.runInContext(fn('exportScope') + '\n' + fn('coScopeLabel'), ctx);
  return ctx;
}
const CARDS = n => Array.from({length:n}, (_,i)=>({ id:'c'+i, kind:'card' }));

test('★ 아무것도 안 골랐으면 «지금 보고 있는 목록»이 나간다', () => {
  const c = box({ sel:{}, coSel:{}, items:{} }, { byKind:{ card: CARDS(1240) } });
  const s = c.exportScope('card');
  assert.equal(s.n, 1240, '★ 화면에 1,240건인데 딴 수가 나온다');
  assert.equal(s.picked, false);
});

test('★ 네모로 골랐으면 «고른 수»가 그대로 나간다', () => {
  const items = {}; ['a','b','c'].forEach(id=>{ items[id] = { id, kind:'card' }; });
  items.z = { id:'z', kind:'biz' };                     /* 다른 갈래는 안 센다 */
  const c = box({ sel:{ a:1, b:1, c:1, z:1 }, coSel:{}, items },
                { byKind:{ card: CARDS(1240) } });
  const s = c.exportScope('card');
  assert.equal(s.n, 3, '★ 고른 3건이라 해 놓고 딴 수가 나간다');
  assert.equal(s.picked, true);
  /* 사업자 쪽은 그 갈래의 고른 것만 센다 */
  assert.equal(c.exportScope('biz').n, 1);
});

test('★ 기업 상세도 «각각» 셀 수 있다 — 예전엔 길이 아예 없었다', () => {
  const c = box({ sel:{}, coSel:{}, items:{}, coFolder:'', coFTab:'', coTag:'', coQ:'' },
                { co: [{key:'a'},{key:'b'},{key:'c'}] });
  assert.equal(c.exportScope('co').n, 3);
});

test('기업 상세도 골라 두면 고른 곳 수가 나간다', () => {
  const c = box({ sel:{}, coSel:{ a:1, b:1 }, items:{} }, { co: [{key:'a'}] });
  const s = c.exportScope('co');
  assert.equal(s.n, 2, '고른 2곳인데 보이는 1곳만 셌다');
  assert.equal(s.picked, true);
});

test('무엇이 걸려 있는지 줄에 적힌다 — 왜 그 수인지 알 수 있게', () => {
  const c = box({ sel:{}, coSel:{}, items:{}, coFolder:'f1', coFTab:'', coTag:'',
                  coQ:'천안', coOnlyCares:true },
                { co: [], folders:{ f1:{ id:'f1', name:'업체관리' } } });
  const sub = c.exportScope('co').sub;
  assert.ok(sub.includes('업체관리'), '폴더 이름이 안 적힌다');
  assert.ok(sub.includes('천안'), '찾은 말이 안 적힌다');
  assert.ok(sub.includes('거래처만'), '걸어 둔 거르개가 안 적힌다');
});

test('아무것도 안 걸었으면 「전체」라고 적는다', () => {
  const c = box({ sel:{}, coSel:{}, items:{}, coFolder:'', coFTab:'', coTag:'', coQ:'' }, { co: [] });
  assert.equal(c.exportScope('co').sub, '전체');
});

/* ── 창과 파일이 «같은 셈»을 쓰는가 — 글자로 본다 ── */
test('★ 세는 셈이 화면과 한 벌이다 — 따로 지으면 조용히 어긋난다', () => {
  const scope = code(fn('exportScope'));
  assert.match(scope, /listItems\(kind\)/,
    '★ 명함·사업자를 화면과 다른 셈으로 센다 — 화면 건수와 내려받은 건수가 갈린다');
  assert.match(scope, /coVisible\(\)/,
    '★ 기업 상세를 화면과 다른 셈으로 센다');
});

test('★ 명함·사업자 내보내기가 «전체»가 아니라 지금 목록을 담는다', () => {
  const body = code(fn('exportXlsx'));
  assert.match(body, /listItems\(tab\)/,
    '★ 내보낼 것을 listItems 로 안 고른다 — 폴더·탭으로 좁혀 놓아도 전체가 나간다');
  assert.doesNotMatch(body, /Object\.values\(state\.items\)\.filter\(it=>it\.kind===/,
    '★ 옛 방식(항목 전체 훑기)이 되살아났다 — 「현재 목록」이라 적어 놓고 전체를 낸다');
});

test('★ 기업 상세 값은 화면과 «같은 함수»(coVal)로 꺼낸다', () => {
  /* 따로 꺼내면 화면에는 보이는데 엑셀은 비는 칸이 생긴다 */
  assert.match(code(fn('coExportXlsx')), /coVal\(o\s*,\s*k\)/,
    '★ coVal 을 안 쓴다 — 서식에서 읽은 값이 엑셀에서 빠진다');
});

/* ── 창 ── */
test('★ 0건인 줄은 못 누른다 — 빈 파일을 받으면 고장으로 읽힌다', () => {
  const body = fn('openExportPick');
  assert.match(body, /const off = !s\.n/, '0건을 가리지 않는다');
  assert.match(body, /off\s*\?\s*''\s*:/, '0건인데도 누를 수 있게 두었다');
  assert.match(code(body), /이 조건에 맞는 것이 없습니다/,
    '0건인 까닭을 안 알려 준다 — 왜 못 누르는지 알 길이 없다');
});

test('★ 셋을 모두 고를 수 있다', () => {
  const list = src.slice(src.indexOf('const EXPORT_KINDS'), src.indexOf('function exportScope'));
  ['card', 'biz', 'co'].forEach(k => {
    assert.ok(list.includes("id:'" + k + "'"), '★ ' + k + ' 를 고를 수 없다');
  });
});

test('내보내기 대상은 «항목 갈래»가 아니다 — 이름을 겹쳐 쓰지 않는다', () => {
  /* kind:'co' 는 item 갈래를 뜻하는 말이라 임자가 있다(cards-co-info.test.js).
     겹쳐 쓰면 「기업정보를 셋째 갈래로 만들었나」로 읽힌다. */
  const list = src.slice(src.indexOf('const EXPORT_KINDS'), src.indexOf('function exportScope'));
  assert.doesNotMatch(list, /kind:\s*'/, '내보내기 목록이 kind 라는 이름을 쓴다');
});

test('★ 내려받기는 환경설정에서 연다 (대표 지시)', () => {
  /* ⚠ 2026-09-05: 탭을 없애고 한 화면이 되면서 SET_SECTIONS 안으로 옮겼다.
       내려받기는 «자주 쓰는 것» 칸이다 — 대표 지시로 여기가 집이다. */
  const set = src.slice(src.indexOf('function SET_SECTIONS(){'), src.indexOf('function openSettingsPage()'));
  assert.ok(set.length > 100, 'SET_SECTIONS 를 못 찾았다');
  assert.match(set, /openExportPick\(\)/,
    '★ 환경설정에서 내려받기를 열 수 없다 — 대표 지시로 여기가 «집»이다');
  assert.match(set, /'자주 쓰는 것'[\s\S]*openExportPick\(\)/,
    '내려받기가 «자주 쓰는 것» 칸에 없다');
});
