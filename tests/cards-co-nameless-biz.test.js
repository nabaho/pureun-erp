'use strict';
/* 상호를 못 읽은 사업자등록증이 기업 상세에서 «사라지던» 것 (대표 지시 2026-08-30, 안 ⓓ 선행)
   ═══════════════════════════════════════════════════════════════════════════
   ■ 무엇이 문제였나
     사업자등록증을 사진으로 읽을 때 번호는 또렷한데 상호가 흐려 못 읽는 일이 있다.
     그러면 그 등록증은 «어디에도 안 보인다» —
       · 회사 목록(coListBuild)이 맨 끝에서 이름 없는 것을 걸러 버렸다
       · 그래서 기업 상세 4,154곳 어디에도 그 회사가 없다
       · 채워 넣으려 해도 들어갈 자리가 화면에 없다 (서류가 미아가 된다)

     지금은 사업자 탭을 열면 그 등록증이 보이므로 «겨우» 눈에 띄었다. 그런데
     대표 지시 2026-08-30 안 ⓓ 로 사업자 탭을 등록증 서류함으로 좁히고 회사를
     찾는 입구를 기업 상세 하나로 모은다 — 그 전에 이 구멍을 막지 않으면
     등록증이 통째로 «없는 것»이 된다.

   ■ 어떻게 고쳤나
     · 번호가 있으면 이름이 없어도 회사 줄을 남긴다.
     · 다만 o.name 에 번호를 «집어넣지 않는다». name 은 푸른이알피가 이름으로
       업체를 맞출 때 쓰는 칸이라(ErpMatch), 거기 숫자를 넣으면 숫자 이름을 가진
       엉뚱한 업체와 맞을 길이 열린다. 보여줄 이름은 따로 만든다(coDisplayName).
     · 화면은 그 자리가 «비어 있다»고 말한다 — 조용히 번호만 보이면 상호인 줄 안다.

   ★ 여기서 못 박는 것
     ① 번호만 있는 등록증도 회사 목록에 남는다
     ② 그 회사의 열쇠는 사업자번호다 (이름 없는 것끼리 한 줄로 뭉치지 않는다)
     ③ 이름도 번호도 없으면 여전히 안 남는다 (빈 줄을 만들지 않는다)
     ④ 이름이 있으면 예전 그대로다 (멀쩡한 회사를 건드리지 않는다)
     ⑤ 보여줄 이름은 따로 만든다 — o.name 은 비운 채로 둔다
     ⑥ 화면 줄이 그 «보여줄 이름»을 쓴다
     ⑦ 화면이 「상호를 못 읽었다」고 말한다
   실행: node --test tests/cards-co-nameless-biz.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8').replace(/\r\n/g, '\n');

/* 주석을 걷어 낸 소스 — 잘 쓴 주석이 검사를 통과시키는 일을 막는다
   (memory: tests-must-strip-comments). */
function code(s){
  return String(s)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n').map(l => l.replace(/(^|[^:])\/\/.*$/, '$1')).join('\n');
}

function fnBody(name, s){
  s = s || src;
  let i = s.indexOf('\nfunction ' + name + '(');
  if (i < 0) i = s.indexOf('\nasync function ' + name + '(');
  assert.ok(i >= 0, name + ' 를 찾을 수 없습니다');
  const open = s.indexOf('{', i);
  let d = 0;
  for (let k = open; k < s.length; k++) {
    if (s[k] === '{') d++;
    else if (s[k] === '}') { d--; if (!d) return s.slice(i, k + 1); }
  }
  assert.fail(name + ' 의 끝을 찾을 수 없습니다');
}

/* ── 회사 목록 세우기만 떼어 돌린다 (co-erp-contact.test.js 와 같은 대역) ── */
function buildList(items){
  const ctx = { console, Object, String, Number, Array,
    _coWatch: null, _coListMemo: null, _coInfo: {},
    allItems: () => items || [],
    digits: v => String(v || '').replace(/\D/g, ''),
    _norm: v => String(v || '').replace(/\s+/g, ''),
    coKeyOf: it => { const d = String(it.bizno || '').replace(/\D/g, '');
                     return d.length >= 10 ? d : ('n' + String(it.company || '').replace(/\s+/g, '')); },
    ErpMatch: { ready: true, match: () => null, matchAll: () => ({}) },
    coEffectiveExtra: () => null,
    /* 줄 세우기가 «보여줄 이름»으로 정렬하므로 대역에도 실어 준다 — 진짜와 같은 것을 쓴다 */
    fmtBizno: v => { const d = String(v || '').replace(/\D/g, '');
                     return d.length === 10 ? d.slice(0,3)+'-'+d.slice(3,5)+'-'+d.slice(5) : (v || ''); } };
  vm.createContext(ctx);
  vm.runInContext(fnBody('coDisplayName') + '\n' + fnBody('coListBuild'), ctx);
  return ctx.coListBuild();
}

/* 이름 만들기만 떼어 돌린다 */
function loadName(){
  const ctx = { console, Object, String, Number, Array,
    digits: v => String(v || '').replace(/\D/g, '') };
  vm.createContext(ctx);
  const fmt = src.match(/^const fmtBizno = [\s\S]*?;$/m);
  assert.ok(fmt, 'fmtBizno 를 찾을 수 없습니다');
  vm.runInContext(fmt[0].replace(/^const /, 'var ') + '\n' + fnBody('coDisplayName'), ctx);
  return ctx;
}

/* 번호는 또렷한데 상호가 흐려 못 읽은 등록증 — 실제로 겪는 모습 그대로 */
const NO_NAME = { id:'b1', kind:'biz', company:'', bizno:'312-86-30570',
                  ceo:'', address:'' };
const NAMED   = { id:'b2', kind:'biz', company:'가나테크', bizno:'134-86-05772' };

/* ══════ ① 남는가 ══════ */

test('★ 상호를 못 읽은 등록증도 회사 목록에 남는다 — 이게 이 고침의 전부다', () => {
  const rows = buildList([NO_NAME]);
  assert.equal(rows.length, 1,
    '★ 걸러 버리면 그 등록증은 기업 상세 어디에도 없다 — 채워 넣을 자리조차 없어진다');
});

test('그 회사도 등록증을 «가진 것»으로 세고 있다 — 서류가 딸려 와야 고칠 수 있다', () => {
  const o = buildList([NO_NAME])[0];
  assert.equal(o.docs, 1);
  assert.equal(o.bizs.length, 1, '원본을 쥐고 있어야 열어 보고 상호를 채운다');
});

/* ══════ ② 열쇠 ══════ */

test('★ 이름 없는 회사끼리 한 줄로 뭉치지 않는다 — 열쇠가 사업자번호라서', () => {
  const other = { id:'b3', kind:'biz', company:'', bizno:'123-45-67890' };
  const rows = buildList([NO_NAME, other]);
  assert.equal(rows.length, 2,
    '★ 이름으로 묶으면 상호 못 읽은 등록증이 전부 «빈 이름» 한 회사로 뭉친다');
  assert.deepEqual(rows.map(o => o.key).sort(), ['1234567890', '3128630570']);
});

/* ══════ ③ 빈 줄은 안 만든다 ══════ */

test('이름도 번호도 없으면 여전히 안 남는다 — 빈 줄을 만들지 않는다', () => {
  const junk = { id:'b9', kind:'biz', company:'', bizno:'' };
  assert.equal(buildList([junk]).length, 0,
    '가리킬 것이 하나도 없는 줄은 목록만 어지럽힌다');
});

/* ══════ ④ 멀쩡한 회사는 그대로 ══════ */

test('상호가 있는 회사는 예전 그대로다', () => {
  const rows = buildList([NAMED]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, '가나테크');
});

/* ══════ ⑤ 보여줄 이름은 따로 ══════ */

test('★ o.name 에 번호를 집어넣지 않는다 — 푸른이알피가 이름으로 업체를 맞춘다', () => {
  const o = buildList([NO_NAME])[0];
  assert.equal(o.name, '',
    '★ 여기 숫자를 넣으면 숫자 이름을 가진 엉뚱한 업체와 맞을 길이 열린다');
});

test('★ 보여줄 이름은 사업자번호로 만든다', () => {
  const N = loadName();
  const shown = N.coDisplayName({ name:'', bizno:'312-86-30570' });
  assert.match(shown, /312/, '★ 사람이 어느 등록증인지 가릴 실마리는 번호뿐이다');
});

test('상호가 있으면 보여줄 이름도 상호다', () => {
  const N = loadName();
  assert.equal(N.coDisplayName({ name:'가나테크', bizno:'134-86-05772' }), '가나테크');
});

/* ══════ ⑥⑦ 화면 ══════ */

test('★ 회사 줄이 «보여줄 이름»을 쓴다 — o.name 을 그대로 그리지 않는다', () => {
  const row = code(fnBody('coListHtml'));
  const nm = row.match(/class="nm">\$\{([^}]*)\}/);
  assert.ok(nm, '상호 칸(.nm)을 못 찾았다');
  assert.match(nm[1], /coDisplayName/,
    '★ esc(o.name) 그대로면 상호 못 읽은 회사는 이름 칸이 빈 줄로 보인다');
});

/* ⚠ 이 검사는 두 번 헛돌았다 —
     ① 그냥 「상호」를 찾으니 표 머리글(<th>상호</th>)에 걸려 늘 통과했다.
     ② 「상호…못 읽」을 찾으니 이번엔 말풍선(title="…못 읽었습니다")에 걸렸다.
        딱지를 떼도 말풍선이 남아 검사가 통과했다 — 그런데 말풍선은 «올려 놔야» 보인다.
   그래서 «태그 사이의 보이는 글»만 센다: > 와 < 사이에 있어야 한다. */
test('★ 화면이 「상호를 못 읽었다」고 «보이는 글»로 말한다 — 번호만 보이면 상호인 줄 안다', () => {
  const row = code(fnBody('coListHtml'));
  assert.match(row, />[^<>]*상호[^<>]*못\s*읽[^<>]*</,
    '★ 조용히 번호만 그리면 그 숫자가 회사 이름인 줄 알고 계약서에 그대로 옮겨 적는다');
});
