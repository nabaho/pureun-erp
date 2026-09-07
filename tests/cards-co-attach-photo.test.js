/* 📎 사진첩 서류를 «이 회사에» 붙인다 + 떼기 (대표 지시 2026-09-07 「ㄴ」)

   ■ 무엇이 없었나
   점검(#1089)의 ㉡ — `coInfo/{회사}/docs` 에 서류를 «새로 만드는» 코드가 기업정보함에
   한 곳도 없었다. 있던 것은 지우기·되살리기·사업에 배정하기뿐이다.
   사진첩 → 기업 상세의 다리는 «사업자번호 숫자 하나»뿐이라, 번호를 못 읽은 서류는
   업체관리에 그 상호가 없으면 못 갔다.

   ★ 못 박는 것
     ① **값(회사 칸)은 한 글자도 안 건드린다.** 값 채우기는 사진첩의 「보내기」 몫이다 —
        거기가 「빈 칸만 채운다」를 공들여 지키는 자리다. 여기서 덮으면 그 공이 무너진다.
     ② 서류 열쇠(dk)가 사진첩과 «같은 규칙»이다 — 다르면 같은 서류가 두 줄로 선다.
     ③ 적힌 것(pairs) 한계가 사진첩과 «같은 수»다 — 이 화면은 그 파일을 안 실어
        상수를 함께 쓸 수 없으므로, 같은지는 여기서 지킨다.
     ④ **떼는 길이 있다.** 붙이는 길만 만들면 잘못 붙인 것이 영영 남는다.
        떼기는 「같은 서류 정리」와 «같은 휴지통·같은 열쇠»를 써서 되돌리기가 그대로 붙는다.
     ⑤ 사진첩을 통째로 안 읽는다(limitToLast).

     node --test tests/cards-co-attach-photo.test.js */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'pu-cards.html'), 'utf8').split('\r\n').join('\n');
const DOCFILE = fs.readFileSync(path.join(ROOT, 'js', 'pu-doc-file.js'), 'utf8').split('\r\n').join('\n');

function fnBody(name, src) {
  const s = src || SRC;
  const i = s.search(new RegExp('(?:^|\\n)(?:async )?function ' + name + '\\('));
  assert.ok(i >= 0, name + ' 을 찾지 못했습니다');
  const open = s.indexOf('{', i);
  let d = 0;
  for (let k = open; k < s.length; k++) {
    if (s[k] === '{') d++;
    else if (s[k] === '}') { d--; if (!d) return s.slice(i, k + 1); }
  }
  assert.fail(name + ' 의 끝을 찾지 못했습니다');
}

/* 순수 로직을 통째로 떠서 «돌린다» */
function load() {
  const ctx = { console, Object, String, Number, Array, Date, Math, JSON };
  vm.createContext(ctx);
  const a = SRC.indexOf('const CO_ATTACH_SCAN =');
  const b = SRC.indexOf('/* ── 화면 ── */', a);
  assert.ok(a > 0 && b > a, '알맹이를 못 찾았다');
  /* ⚠ 최상위 const 는 컨텍스트 값이 되지 않는다 — var 로 바꿔 실어야 꺼내 본다 */
  vm.runInContext(SRC.slice(a, b).replace(/\nconst /g, '\nvar '), ctx);
  return ctx;
}
const READ = (o) => Object.assign({ kind: 'form', fields: { docName: '고용안정 지원금 신청서' } }, o || {});
const ITEM = (o) => Object.assign({ at: 1000, owner: 'u1', read: READ() }, o || {});

/* ── ② 서류 열쇠가 사진첩과 같다 ── */

test('★★ 서류 열쇠 규칙이 사진첩과 «같다» — 다르면 같은 서류가 두 줄로 선다', () => {
  const c = load();
  assert.equal(c.coAttachDocKey('2026', 'abc'), '2026_abc');
  /* 실시간DB 가 열쇠에 못 쓰는 글자는 밑줄로 — 사진첩과 같은 목록이다 */
  assert.equal(c.coAttachDocKey('2026', 'a.b#c$d/e[f]g'), '2026_a_b_c_d_e_f_g');
  assert.equal(c.coAttachDocKey('', 'x'), 'unknown_x', '해가 없으면 unknown 이다');
  assert.equal(c.coAttachDocKey('2026', ''), '', '사진 번호가 없으면 열쇠가 없다');
  /* 사진첩 쪽 규칙 원문과 견준다 — 한쪽만 바뀌면 잡는다 */
  assert.match(DOCFILE, /String\(ph0\.year \|\| 'unknown'\) \+ '_' \+ String\(ph0\.id\)\.replace\(\/\[\.#\$\/\[\\\]\]\/g, '_'\)/,
    '★ 사진첩 쪽 열쇠 규칙이 바뀌었다 — 이쪽도 함께 고쳐야 한다');
});

/* ── ③ 적힌 것 한계가 사진첩과 같은 수 ── */

test('★★ 적힌 것 한계가 사진첩과 «같은 수»다 — 상수를 함께 쓸 수 없어 검사가 묶는다', () => {
  const max = Number((DOCFILE.match(/CO_PAIRS_MAX = (\d+)/) || [])[1]);
  const len = Number((DOCFILE.match(/CO_PAIR_LEN = (\d+)/) || [])[1]);
  const myMax = Number((SRC.match(/CO_ATTACH_PAIRS_MAX = (\d+)/) || [])[1]);
  const myLen = Number((SRC.match(/CO_ATTACH_PAIR_LEN = (\d+)/) || [])[1]);
  assert.ok(max > 0 && len > 0, '사진첩 쪽 수를 못 찾았다');
  assert.equal(myMax, max, '★ 개수 한계가 어긋났다 (' + myMax + ' vs ' + max + ')');
  assert.equal(myLen, len, '★ 길이 한계가 어긋났다 (' + myLen + ' vs ' + len + ')');
});

test('★ 개수·길이를 자르고 «몇 개 잘랐는지» 남긴다 — 조용히 줄이면 「왜 없지」가 된다', () => {
  const c = load();
  const many = [];
  for (let i = 0; i < 70; i++) many.push({ k: 'k' + i, v: 'v' + i });
  const t = c.coAttachPairs(many);
  assert.equal(t.pairs.length, 60);
  assert.equal(t.cut, 10, '★ 잘린 개수를 안 남긴다');
  const long = c.coAttachPairs([{ k: 'a'.repeat(400), v: 'b'.repeat(400) }]);
  assert.equal(long.pairs[0].k.length, 300);
  assert.equal(long.pairs[0].v.length, 300);
  /* 빈 껍데기는 세지도 담지도 않는다 */
  const empty = c.coAttachPairs([{ k: '', v: 'x' }, { k: 'y', v: '  ' }, null]);
  assert.equal(empty.pairs.length, 0);
  assert.equal(empty.cut, 0, '★ 빈 껍데기를 「잘렸다」로 센다');
});

/* ── 고를 수 있는 것만 세운다 ── */

test('★★ 판독 못 한 것·이미 붙은 것은 «애초에 안 세운다»', () => {
  const c = load();
  assert.equal(c.coAttachRow('2026', 'a', ITEM({ read: null })), null, '★ 판독 안 한 것이 나온다');
  assert.equal(c.coAttachRow('2026', 'a', ITEM({ read: READ({ error: '실패' }) })), null,
    '★ 판독이 실패한 것이 나온다');
  assert.equal(c.coAttachRow('2026', 'a', ITEM(), { '2026_a': 1 }), null,
    '★ 이미 붙은 서류를 또 고르게 한다');
  assert.equal(c.coAttachRow('2026', '', ITEM()), null, '★ 사진 번호가 없는데 나온다');
  assert.ok(c.coAttachRow('2026', 'a', ITEM()), '★ 멀쩡한 것이 안 나온다');
});

test('★ 서류 이름의 못 쓰는 글자를 다듬는다 — 실시간DB 열쇠(tags)로도 쓰인다', () => {
  const c = load();
  const r = c.coAttachRow('2026', 'a',
    ITEM({ read: READ({ fields: { docName: '신청서 [2026]  #1/2' } }) }));
  assert.equal(r.name, '신청서 2026 1 2');
});

test('★★ 최근 것부터 세운다 — 방금 찍은 것을 스무 줄 아래에서 찾게 두지 않는다', () => {
  const c = load();
  const rows = c.coAttachList({
    '2026': { b: ITEM({ at: 300 }), a: ITEM({ at: 100 }) },
    '2025': { z: ITEM({ at: 200 }) }
  }, {});
  assert.equal(rows.map(r => r.id).join(','), 'b,z,a');
  assert.equal(rows.map(r => r.dk).join(','), '2026_b,2025_z,2026_a');
});

/* ── ① 값을 안 건드린다 (이 검사가 이 일의 핵심이다) ── */

test('★★★ 값(회사 칸)을 «한 글자도» 안 건드린다 — 사람이 고쳐 둔 값을 덮으면 안 된다', () => {
  const c = load();
  const row = c.coAttachRow('2026', 'a', ITEM());
  const upd = c.coAttachWrites('3128149225', row, '나');
  const keys = Object.keys(upd).sort();
  assert.equal(keys.join('\n'), [
    'coInfo/3128149225/at',
    'coInfo/3128149225/by',
    'coInfo/3128149225/docs/2026_a',
    'coInfo/3128149225/tags/고용안정 지원금 신청서'
  ].join('\n'), '★ 서류·갈래·손댄 때 말고 다른 자리를 쓴다');
  /* 사진첩이 채우는 회사 칸(KEEP) 가운데 하나도 없어야 한다 */
  ['company', 'ceo', 'addr', 'bizno', 'tel', 'fax', 'bankAcct', 'email']
    .forEach(k => assert.ok(keys.indexOf('coInfo/3128149225/' + k) < 0,
      '★ 회사 칸 ' + k + ' 을 건드린다 — 값 채우기는 사진첩 「보내기」 몫이다'));
  /* 갈등 자리(conflicts)도 안 만든다 — 값을 안 보니 어긋날 것도 없다 */
  assert.ok(keys.every(k => k.indexOf('/conflicts/') < 0), '★ conflicts 를 만든다');
});

test('★★ 붙일 줄이 사진첩 docs 줄과 «같은 칸»이다 — 다르면 화면이 못 그린다', () => {
  const c = load();
  const doc = c.coAttachDoc(c.coAttachRow('2026', 'a', ITEM()), '나');
  assert.equal(Object.keys(doc).sort().join(','), 'at,by,id,name,owner,year');
  assert.equal(doc.name, '고용안정 지원금 신청서');
  assert.equal(doc.year, '2026');
  assert.equal(doc.id, 'a');
  assert.equal(doc.owner, 'u1');
  assert.equal(doc.by, '나');
  assert.ok(doc.at > 0);
  /* 사진첩 쪽이 담는 칸과 견준다 */
  assert.match(DOCFILE, /var doc = \{ name: tag \|\| '서식', year: String\(ph\.year \|\| ''\), id: String\(ph\.id\),/,
    '★ 사진첩 쪽 docs 줄의 칸이 바뀌었다 — 이쪽도 함께 고쳐야 한다');
});

test('★ 이름이 비면 «서식» 이다 — 사진첩과 같은 물러남', () => {
  const c = load();
  const row = c.coAttachRow('2026', 'a', ITEM({ read: READ({ fields: {} }) }));
  const doc = c.coAttachDoc(row, '나');
  assert.equal(doc.name, '서식');
  /* 이름이 없으면 갈래 딱지는 «안» 붙인다 — tags/ 가 빈 열쇠가 되면 못 쓴다 */
  const upd = c.coAttachWrites('k1', row, '나');
  assert.ok(Object.keys(upd).every(k => k.indexOf('/tags/') < 0),
    '★ 이름이 없는데 갈래 딱지를 붙인다');
});

test('★ 적힌 것이 있으면 서류 줄 밑에 함께 담는다', () => {
  const c = load();
  const row = c.coAttachRow('2026', 'a', ITEM({
    read: READ({ fields: { docName: '신청서', pairs: [{ k: '신청 사유', v: '고용유지' }] } })
  }));
  const doc = c.coAttachDoc(row, '나');
  assert.equal(doc.pairs.length, 1);
  assert.equal(doc.pairs[0].k, '신청 사유');
});

test('★ 온전치 않은 것으로는 아무것도 안 쓴다', () => {
  const c = load();
  assert.equal(c.coAttachWrites('', c.coAttachRow('2026', 'a', ITEM()), '나'), null);
  assert.equal(c.coAttachWrites('k1', null, '나'), null);
  assert.equal(c.coAttachDoc(null, '나'), null);
});

/* ── ④ 떼는 길이 있고, 휴지통과 «같은 자리»다 ── */

test('★★★ 떼기가 「같은 서류 정리」와 «같은 휴지통·같은 열쇠»를 쓴다 — 되돌리기가 그대로 붙는다', () => {
  const c = load();
  const doc = { name: '신청서', year: '2026', id: 'a', owner: 'u1', at: 5, by: '나' };
  const mine = c.coDetachWrites('k1', '가나상사', '2026_a', doc, 7, '나');
  assert.equal(Object.keys(mine).sort().join('\n'),
    ['coInfo/k1/docs/2026_a', 'trashDocs/k1_2026_a'].join('\n'),
    '★ 휴지통 자리나 열쇠가 다르다 — 되돌리기가 안 붙는다');
  assert.equal(mine['coInfo/k1/docs/2026_a'], null, '★ 원래 자리에서 안 뺀다 — 두 곳에 남는다');
  /* ⚠ deepEqual 은 «다른 세계»에서 만든 것과 안 맞는다(vm) — 글자로 견준다.
       이 저장소에서 여러 번 밟은 자리다. */
  assert.equal(JSON.stringify(mine['trashDocs/k1_2026_a']),
    JSON.stringify({ at: 7, by: '나', coKey: 'k1', coName: '가나상사', docKey: '2026_a', doc: doc }),
    '★ 휴지통에 담는 칸이 「같은 서류 정리」와 다르다 — 되돌릴 원본을 안 담으면 되살릴 수 없다');
  /* 「같은 서류 정리」가 쓰는 자리와 «글자 그대로» 견준다 */
  const dup = fnBody('coDocDupWrites');
  assert.match(dup, /trashDocs\/\$\{id\}/, '★ 정리 쪽 휴지통 자리가 바뀌었다');
  assert.match(dup, /r\.coKey \+ '_' \+ r\.docKey/, '★ 정리 쪽 휴지통 열쇠가 바뀌었다');
});

test('★★ 되돌리기가 «내가 넣은 줄»도 되살릴 수 있다 — 칸 이름이 같아야 한다', () => {
  const c = load();
  const doc = { name: '신청서', year: '2026', id: 'a' };
  const row = c.coDetachWrites('k1', '가나', '2026_a', doc, 7, '나')['trashDocs/k1_2026_a'];
  /* coDocTrashRestoreWrites 가 보는 칸: coKey · docKey · doc */
  const restore = fnBody('coDocTrashRestoreWrites');
  ['coKey', 'docKey', 'doc'].forEach(k =>
    assert.ok(row[k] !== undefined, '★ 되돌리기가 보는 칸 ' + k + ' 이 없다'));
  assert.match(restore, /row\.coKey.*row\.docKey|row\.docKey/, '되돌리기가 그 칸을 안 본다');
});

test('★ 온전치 않은 것으로는 아무것도 안 뗀다', () => {
  const c = load();
  assert.equal(c.coDetachWrites('', 'x', '2026_a', {}, 1, '나'), null);
  assert.equal(c.coDetachWrites('k1', 'x', '', {}, 1, '나'), null);
});

/* ── ⑤ 통째로 안 읽는다 ── */

test('★★ 사진첩을 «통째로» 안 읽는다 — 최근 것만, 올해·지난해 둘만', () => {
  const fn = fnBody('openCoAttach');
  assert.match(fn, /limitToLast\(CO_ATTACH_SCAN\)/,
    '★ 한도를 안 걸고 읽는다 — 사진 수천 장이 그대로 요금이다');
  assert.match(fn, /now - 1/, '★ 지난해를 안 본다 — 1월에는 아무것도 안 나온다');
  assert.ok(!/once\('value'\)\s*;?\s*\n[^]*?items\/\$\{uid\}/.test(fn), '');
  assert.match(fn, /puphotos\/\$\{uid\}\/items|puphotos\/u\/\$\{uid\}\/items/,
    '★ 내 사진첩 자리를 안 읽는다');
});

test('★★ 남의 사진첩은 «안 읽는다» (1걸음) — 그리고 그 사실을 화면에 적는다', () => {
  const fn = fnBody('openCoAttach');
  assert.match(fn, /currentUser/, '★ 내 계정을 안 본다');
  /* ⚠ 「내가 찍은」은 «두 곳»에 있다(고르개 각주 + 「붙일 서류가 없습니다」 안내).
       느슨하게 찾으면 각주를 지워도 초록이다 — 그 문장을 콕 집는다. */
  assert.match(fn, /내가 찍은 사진 가운데/,
    '★ 「내가 찍은 것만」이라고 안 말한다 — 없는 것을 있는 줄 안다');
  assert.match(fn, /최근 \$\{CO_ATTACH_SCAN\}장/,
    '★ 몇 장까지 보는지 안 말한다 — 안 보이는 서류를 「없다」로 읽는다');
  /* 사람을 고르는 화면은 아직 없다 — 있는 것처럼 보이면 안 된다 */
  assert.ok(fn.indexOf('puphotos/owners') < 0, '★ 남의 사진첩을 훑는다 (1걸음 밖이다)');
});

/* ── 화면 ── */

test('★★★ 「📎 붙이기」 단추가 서류 0건에도 보인다 — 그때가 가장 필요한 때다', () => {
  /* ⚠ 글자 «차례»로 재면 안 된다 — 단추를 목록 «안»으로 넣어도 글자는 여전히
       coDocsListHtml 뒤에 있어 초록이 된다(2026-09-07 고장넣기에서 실제로 샜다).
       **그려 본다.** 서류가 0건일 때 단추가 남아 있는지가 알맹이다. */
  const ctx = {
    console, Object, String, Number, Array,
    esc: v => String(v == null ? '' : v),
    fmtDate: () => '',
    coDocsListHtml: docs => ((docs || []).length ? '<목록>' : ''),
  };
  vm.createContext(ctx);
  vm.runInContext(fnBody('coDocsHtml') + '\n;globalThis.__f = coDocsHtml;', ctx);
  const 빔 = ctx.__f({ extra: { docs: {} } });
  assert.ok(빔.indexOf('openCoAttach()') > 0,
    '★ 서류 0건이면 붙이는 단추까지 사라진다 — 그때가 가장 필요한 때다');
  const 있음 = ctx.__f({ extra: { docs: { a: { at: 1 } } } });
  assert.ok(있음.indexOf('openCoAttach()') > 0, '★ 서류가 있을 때 단추가 없다');
  assert.ok(있음.indexOf('<목록>') > 0, '★ 목록을 안 그린다');
  /* 이 검사의 전제 — 목록은 0건이면 빈 글자를 돌려준다 */
  assert.match(fnBody('coDocsListHtml'), /if\(!docs \|\| !docs\.length\) return '';/,
    '★ 목록이 0건일 때 빈 글자를 안 돌려준다 — 이 검사의 전제가 틀렸다');
});

test('★★★ 서류 줄에 «열쇠»를 싣는다 — 안 실으면 떼기가 한 번도 안 나온다', () => {
  /* ⚠ 2026-09-07 에 이것을 «흘렸다». coDocsHtml 이 Object.values 로 열쇠를 버려서,
       줄마다 d._k 가 없어 떼기 단추가 아예 안 그려졌다 — 검사는 다 초록이었고
       화면을 그려 보고서야 알았다. 그리기 자리에서 열쇠가 오는지를 본다. */
  const ctx = {
    console, Object, String, Number, Array,
    esc: v => String(v == null ? '' : v),
    fmtDate: () => '',
    coDocsListHtml: docs => JSON.stringify((docs || []).map(d => d._k))
  };
  vm.createContext(ctx);
  vm.runInContext(fnBody('coDocsHtml') + '\n;globalThis.__f = coDocsHtml;', ctx);
  const out = ctx.__f({ extra: { docs: { '2026_a': { at: 2 }, '2025_b': { at: 1 } } } });
  assert.ok(out.indexOf('"2026_a","2025_b"') > 0,
    '★ 서류 줄에 열쇠가 없다 — 떼기가 한 번도 안 나온다: ' + out);
});

test('★★ 서류 줄에 「떼기」가 있고, 눌러도 원본 보기로 «안» 넘어간다', () => {
  const fn = fnBody('coDocsListHtml');
  assert.match(fn, /coDetach\('\$\{esc\(d\._k\)\}'\)/, '★ 떼는 길이 없다');
  /* 줄 전체에 openCoDoc 이 걸려 있다 — 막지 않으면 떼기를 누를 때 사진첩이 열린다 */
  assert.match(fn, /event\.stopPropagation\(\);coDetach/,
    '★ 떼기를 누르면 사진첩 창까지 열린다');
  /* 열쇠가 없는 옛 줄에는 안 낸다 — 눌러도 아무 일이 없는 단추를 만들지 않는다 */
  assert.match(fn, /\$\{d\._k \? `<em/, '★ 열쇠 없는 옛 줄에도 떼기를 낸다');
});

test('★★ 「값은 안 채운다」를 화면이 «말한다» — 말 안 하면 채워졌다고 믿는다', () => {
  const fn = fnBody('openCoAttach');
  assert.match(fn, /값은 채우지 않습니다/, '★ 값을 안 채운다는 것을 안 말한다');
  assert.match(fnBody('coDocsHtml'), /값은 채우지 않습니다/, '★ 단추 말풍선에도 없다');
});

test('★★ 떼기는 «묻고», 「휴지통으로 옮긴다」고 말한다 — 지우는 것으로 읽히면 안 누른다', () => {
  const fn = fnBody('coDetach');
  /* ⚠ `/confirm\(/` 만 보면 `false && confirm(` 으로 꺼도 초록이다 —
       2026-09-07 고장넣기에서 실제로 샜다. 조건을 통째로 못 박는다. */
  assert.match(fn, /if\(!confirm\(`/, '★ 묻지도 않고 뗀다');
  assert.match(fn, /휴지통으로 옮깁니다/, '★ 어디로 가는지 안 말한다');
  assert.match(fn, /원본 사진은 «그대로»/, '★ 사진첩 원본이 안전한지 안 말한다');
  assert.match(fn, /되살리려면 환경설정 → 🗑 휴지통/, '★ 되살리는 길을 안 알려 준다');
});

test('★ 붙이고·떼고 나면 받아 둔 휴지통을 «버린다» — 안 버리면 옛 목록이 뜬다', () => {
  ['coAttachDo', 'coDetach'].forEach(n =>
    assert.match(fnBody(n), /trashDocsBust\(\)/, '★ ' + n + ' 이 받아 둔 것을 안 버린다'));
});
