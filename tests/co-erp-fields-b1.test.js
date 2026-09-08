'use strict';
/* ══════ 업태·종목·팩스·이메일 — 있는데 안 보이던 넷 (점검 B1, 2026-08-31) ══════
   대표님이 회사를 열면 이 넷이 빈칸이었다. 그런데 값은 «이미 있었다» —

     · 팩스  : 판독기가 등록증·명함에서 companyFax 를 읽어 담고 있었고
               (js/pu-doc-file.js 의 KEEP 에도 있다), 명함·사업자 표에는 「회사팩스」
               열까지 있었다. 그런데 ① 기업 상세에 «칸이 없고» ② 등록증에서 회사로
               «올리는 줄이 빠져» 있었다. 담는 곳과 보이는 곳이 짝이 아니었던 것이다.
     · 업태·종목·이메일 : 업체관리(푸른이알피)에 적혀 있는데 기업정보함이 «안 꺼냈다».
               등록증이 없는 회사(명함만 있는 곳)는 영영 빈칸이었다.

   ■ 이것이 2026-08-27 의 「대표번호」와 «같은 결함»이다
     그때도 등록증에서 읽어 두고 회사로 안 올려, 거래처 288곳이 전부 「대표번호 없음」이었다.
     그래서 이 파일은 조각이 아니라 «파이프»를 시험한다 — coListBuild 를 세워서 돌린다.

   ★ 여기서 못 박는 것
     ① 등록증의 팩스가 회사에 올라온다
     ② 명함의 «회사» 팩스는 올라오고, «개인» 팩스·이메일은 안 올라온다
     ③ 업체관리의 업태·종목·팩스·이메일이 빈칸을 채운다 (출처는 「푸른이알피」)
     ④ 종목은 «이름이 다르다» — 업체관리 bizCategory ↔ 기업정보함 bizItem
     ⑤ 등록증이 업체관리보다 앞선다 — 덮지 않는다
     ⑥ 담는 곳(KEEP)과 보이는 곳(CO_FIELDS)이 짝이다
   실행: node --test tests/co-erp-fields-b1.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8').replace(/\r\n/g, '\n');
const doc = fs.readFileSync(path.join(__dirname, '..', 'js', 'pu-doc-file.js'), 'utf8');

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

/* 회사를 «세워서» 확인한다 — 조각만 보면 파이프가 끊긴 것을 못 잡는다(2026-08-27 의 교훈) */
function buildList(items, erp){
  const ctx = { console, Object, String, Number, Array,
    _coWatch: null, _coListMemo: null, _coInfo: {},
    allItems: () => items || [],
    digits: v => String(v || '').replace(/\D/g, ''),
    _norm: v => String(v || '').replace(/\s+/g, ''),
    coKeyOf: it => { const d = String(it.bizno || '').replace(/\D/g, '');
                     return d.length >= 10 ? d : ('n' + String(it.company || '').replace(/\s+/g, '')); },
    ErpMatch: { ready: true, match: () => erp || null,
      matchAll: list => { const out = {}; (list||[]).forEach(o=>{ if(o && erp) out[o.key] = erp; }); return out; } },
    taxInvoiceFromText: () => '',
    coEffectiveExtra: () => null };
  vm.createContext(ctx);
  vm.runInContext(fnBody('coListBuild'), ctx);
  return ctx.coListBuild();
}

/* 업체관리 자료를 «훑는 대목»을 그대로 돌린다 — 이름 맞바꾸기(bizCategory→bizItem)가
   여기서 일어나므로, 손으로 지어낸 rec 로는 그 어긋남을 영영 못 잡는다. */
function scanErp(cos){
  const a = src.indexOf('      const byBiz={}, byName={}');
  const b = src.indexOf('      ErpMatch.byBiz=byBiz;');
  assert.ok(a > 0 && b > a, '업체 훑는 자리를 찾지 못했습니다');
  const ctx = { console, Object, String, Number, Array,
    cos: cos, nameBySid: {}, byTaxEmail: {},
    ErpMatch: { _norm: v => String(v||'').replace(/\s+/g,''),
                _digits: v => String(v||'').replace(/\D/g,'') } };
  vm.createContext(ctx);
  vm.runInContext(src.slice(a, b) + '\nvar OUT = byBiz;', ctx);
  return ctx.OUT;
}

const 등록증 = { kind:'biz', company:'가나테크', bizno:'134-86-05772', ceo:'나성환',
                address:'충남 천안시 서북구 1', companyTel:'041-556-0035',
                companyFax:'041-556-0036', bizType:'서비스', bizItem:'노무' };
const 업체 = (extra) => Object.assign({ name:'가나테크', bizNo:'134-86-05772',
  ceo:'나성환', typeCode:'자문', status:'active', managerMain:'s1' }, extra || {});

/* ══════ ① 등록증의 팩스가 회사에 올라온다 ══════ */

test('★ 등록증의 팩스가 회사에 올라온다 — 읽어 두고도 회사에 안 올리면 없는 값이다', () => {
  const o = buildList([등록증])[0];
  assert.equal(o.companyFax, '041-556-0036',
    '★ 공문·신고서에 팩스를 적을 때마다 명함을 도로 뒤져야 한다');
  assert.equal(o.srcOf.companyFax, '사업자등록증', '어디서 온 값인지 말해야 한다');
});

/* ══════ ② 명함 — 회사 것만 올린다 ══════ */

test('★ 명함의 «개인» 팩스·이메일은 회사 값이 «아니다»', () => {
  /* 2026-08-27 에 tel·mobile 로 정한 규칙과 같은 결이다. 그 사람이 나가면 못 쓰는
     번호가 계약서·신고서에 그대로 나간다. */
  const 명함 = { kind:'card', name:'김대리', company:'다라산업',
    fax:'031-111-1111', email:'kim@dara.co.kr',
    companyFax:'031-222-2222', companyTel:'031-222-2220' };
  const o = buildList([명함])[0];
  assert.equal(o.companyFax, '031-222-2222', '★ 회사 팩스는 올라와야 한다');
  assert.equal(o.srcOf.companyFax, '명함');
  assert.ok(!o.fax, '★ 개인 팩스가 회사 값으로 올라왔다: ' + o.fax);
  assert.ok(!o.email,
    '★ 명함 이메일이 회사 이메일이 됐다 — 그 사람이 나가면 공문이 죽은 주소로 간다: ' + o.email);
});

/* ══════ ③④ 업체관리에서 채운다 — 이름이 다른 것까지 ══════ */

test('★ 업체관리를 훑을 때 업태·종목·팩스·이메일을 실어 둔다', () => {
  const r = scanErp([업체({ bizType:'제조업', bizCategory:'금속가공',
                           fax:'02-123-4567', email:'info@gana.co.kr' })])['1348605772'];
  assert.ok(r, '업체 기록을 못 만들었다');
  assert.equal(r.bizType, '제조업');
  assert.equal(r.fax, '02-123-4567');
  assert.equal(r.email, 'info@gana.co.kr');
  assert.equal(r.bizItem, '금속가공',
    '★ 종목의 «이름이 다르다» — 업체관리는 bizCategory, 기업정보함은 bizItem 이다. '
    + '여기서 맞춰 담지 않으면 조용히 빈칸이 된다');
});

test('★ 등록증이 없는 회사도 업체관리 값으로 채워진다 — 명함만 있는 곳이 그렇다', () => {
  const 명함 = { kind:'card', name:'김대리', company:'다라산업' };
  const erp = { company:'다라산업', ceoRaw:'김보람', phone:'', address:'',
    bizType:'제조업', bizItem:'금속가공', fax:'02-123-4567', email:'info@dara.co.kr' };
  const o = buildList([명함], erp)[0];
  assert.equal(o.bizType, '제조업', '★ 업체관리에 적혀 있는데 회사를 열면 빈칸이었다');
  assert.equal(o.bizItem, '금속가공');
  assert.equal(o.companyFax, '02-123-4567', '★ 업체관리 fax 는 회사 팩스(companyFax) 자리에 든다');
  assert.equal(o.email, 'info@dara.co.kr');
  ['bizType','bizItem','companyFax','email'].forEach(f => {
    assert.equal(o.srcOf[f], '푸른이알피',
      '★ ' + f + ' 의 출처를 안 남겼다 — 사람이 보고 판단할 수 없다');
  });
});

test('★ 등록증이 업체관리보다 «앞선다» — 덮으면 법적 원본이 밀린다', () => {
  const erp = { company:'가나테크', ceoRaw:'다른사람', phone:'', address:'',
    bizType:'딴업태', bizItem:'딴종목', fax:'02-999-9999', email:'x@x.kr' };
  const o = buildList([등록증], erp)[0];
  assert.equal(o.bizType, '서비스', '★ 업체관리가 등록증을 덮었다');
  assert.equal(o.bizItem, '노무');
  assert.equal(o.companyFax, '041-556-0036');
  assert.equal(o.srcOf.bizType, '사업자등록증');
  /* 등록증에 없는 것(이메일)만 업체관리가 채운다 */
  assert.equal(o.email, 'x@x.kr');
});

test('업체관리에 없는 값은 조용히 빈칸으로 둔다 — 지어내지 않는다', () => {
  const o = buildList([{ kind:'card', name:'김대리', company:'마바' }],
    { company:'마바', ceoRaw:'', phone:'', address:'',
      bizType:'', bizItem:'', fax:'', email:'' })[0];
  assert.ok(!o.bizType && !o.bizItem && !o.companyFax && !o.email);
});

/* ══════ ⑥ 담는 곳과 보이는 곳이 짝이다 ══════ */

test('★ 팩스가 «보이는 곳»(CO_FIELDS)에 있다 — 담기만 하고 안 보이면 없는 값이다', () => {
  const at = src.indexOf('const CO_FIELDS');
  const decl = src.slice(at, src.indexOf('];', at));
  assert.ok(decl.indexOf("['companyFax'") >= 0,
    '★ 기업 상세에 팩스 칸이 없다 — 판독기는 읽어 담는데 회사를 열면 없는 값처럼 보인다');
  /* 사람 팩스(fax)를 회사 칸으로 들이면 안 된다 — 그 사람이 나가면 못 쓴다 */
  assert.ok(!/\['fax'/.test(decl),
    "★ 개인 팩스(fax)가 회사 칸에 들어왔다 — 회사 팩스는 companyFax 다");
});

test('★ CO_FIELDS 와 KEEP 이 짝이다 — 한쪽만 늘리면 값이 안 오거나 안 보인다', () => {
  /* 이 짝이 어긋난 것이 바로 이번 결함이다: KEEP 에는 companyFax 가 «처음부터» 있었고
     CO_FIELDS 에만 없었다. 그래서 값은 쌓이는데 화면에 안 나왔다. */
  const at = src.indexOf('const CO_FIELDS');
  const decl = src.slice(at, src.indexOf('];', at));
  const 보이는 = [...decl.matchAll(/\['([A-Za-z0-9_]+)'/g)].map(m => m[1]);
  const kAt = doc.indexOf('var KEEP = [');
  const 담는 = [...doc.slice(kAt, doc.indexOf('];', kAt)).matchAll(/'([A-Za-z0-9_]+)'/g)].map(m => m[1]);

  /* ⚠ «양쪽으로» 견준다. 한쪽만 보면 반대쪽에서 빼는 고장이 그냥 통과한다 —
     실제로 그랬다(2026-08-31 고장넣기: KEEP 에서 companyFax 를 빼도 안 걸렸다).
     그런데 이번 결함이 바로 그 «한쪽만 있는» 상태였다.
     ⚠ 짝이 아닌 둘은 여기 «이름으로» 적어 둔다. 목록으로 적어야 새로 어긋난 칸이
       조용히 섞여 들어오지 않는다 —
         · KEEP 의 company : 상호다. 회사의 «이름»이라 CO_FIELDS 의 칸이 아니다(o.name)
         · CO_FIELDS 의 bizno : 사업자번호다. 회사를 가리는 «열쇠»라 따로 다룬다 */
  const 짝이아닌것 = { company: 'KEEP', bizno: 'CO_FIELDS' };
  담는.filter(k => 짝이아닌것[k] !== 'KEEP').forEach(k => {
    assert.ok(보이는.includes(k),
      '★ KEEP 이 담는 ' + k + ' 가 기업 상세에 없다 — 값은 쌓이는데 아무도 못 본다');
  });
  보이는.filter(k => 짝이아닌것[k] !== 'CO_FIELDS').forEach(k => {
    assert.ok(담는.includes(k),
      '★ 기업 상세의 ' + k + ' 를 판독기가 안 담는다(KEEP) — 칸만 있고 값이 영영 안 온다');
  });
});
