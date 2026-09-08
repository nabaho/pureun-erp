'use strict';
/* 칸마다 «어디서 온 값인지» 보여 준다 (대표 지시 2026-08-24, 보강 검토 4순위)
   ═══════════════════════════════════════════════════════════════════════════
   ■ 무엇이 문제였나
     기업 상세의 한 회사 값은 «네 곳»에서 온다 —
       ① 사업자등록증 (기업정보함의 등록증 사진에서 읽은 값)
       ② 명함        (회사이름·사업자번호)
       ③ 푸른이알피  (대표자 — 등록증에 없을 때 채운다)
       ④ 사진첩 서식 (기술보호울타리 신청서 같은 것 — sendToCoInfo)
     그런데 화면은 값만 보여 주고 «그중 어디»인지 한 글자도 안 알려 줬다.
     「이 매출액 어디서 봤더라」에 답할 수가 없어, 사진첩에 그 서류가 그대로 있는데도
     다시 찾아 헤매게 된다. 어느 쪽이 더 믿을 만한지도 가릴 수 없다.

   ■ 어떻게 고쳤나
     · 목록을 세울 때(coListBuild) 어느 자리에서 채운 칸인지 o.srcOf 에 적어 둔다.
       — 서버를 더 읽지 않는다. 이미 손에 든 것을 적어 두기만 한다.
     · 사진첩이 빈 칸을 채울 때(sendToCoInfo) coInfo/{회사}/src/{칸} 에
       «그 서류의 열쇠»를 남긴다.
       ⚠ 서류 이름·날짜·사람·사진번호를 칸마다 통째로 베끼지 «않는다» —
         그건 이미 docs/{열쇠} 에 한 번 들어 있다. 열쇠 한 줄만 가리킨다.
         칸이 20개면 그 차이가 20배다(2026-08-16 대량 쓰기 사고를 되풀이하지 않는다).

   ★ 여기서 못 박는 것
     ① 등록증·명함·푸른이알피에서 온 값은 그 이름을 말한다
     ② 서식에서 온 값은 서류 이름·언제·누가까지 말하고 원본으로 가는 길을 준다
     ③ coVal 이 «고른 쪽»의 출처를 말한다 — 어긋나면 거짓말이 된다
     ④ 모르면 아무 말도 안 한다 (지어내지 않는다)
     ⑤ src 는 docs 열쇠만 가리킨다 — 통째로 베끼면 요금이 는다
     ⑥ 이미 값이 있던 칸에는 src 를 안 쓴다 (그 값은 이 서류에서 온 게 아니다)
     ⑦ 상세 패널이 «실제로» 그 줄에 출처를 그린다
   실행: node --test tests/co-field-source.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8').replace(/\r\n/g, '\n');
const jsrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'pu-doc-file.js'), 'utf8');

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
const plain = v => JSON.parse(JSON.stringify(v));

/* ── 출처 읽기만 떼어 돌린다 ── */
function loadSrc(){
  const ctx = { console, Object, Array, String, Number,
    /* 2026-08-30: 상호 못 읽은 회사도 목록에 남는다 — 화면이 «보여줄 이름»을 쓴다 */
    coDisplayName: o => (o && String(o.name||'').trim()) || (o && o.bizno) || '',
    CO_FIELDS: [['ceo','대표자'], ['address','소재지'], ['sales','매출액'], ['name','상호']] };
  vm.createContext(ctx);
  vm.runInContext(fnBody('coVal') + '\n' + fnBody('coSrcOf'), ctx);
  return ctx;
}
const co = o => Object.assign({ key:'1348605772', name:'가나테크', cards:[], erp:null,
  extra:{}, srcOf:{} }, o||{});

/* ══════ ① 등록증·명함·푸른이알피 ══════ */

test('★ 사업자등록증에서 온 값은 「사업자등록증」이라 말한다', () => {
  const C = loadSrc();
  const s = C.coSrcOf(co({ ceo:'나성환', srcOf:{ ceo:'사업자등록증' } }), 'ceo');
  assert.equal(s && s.label, '사업자등록증');
});

test('명함에서 온 값은 「명함」이라 말한다', () => {
  const C = loadSrc();
  assert.equal(C.coSrcOf(co({ name:'가나테크', srcOf:{ name:'명함' } }), 'name').label, '명함');
});

test('푸른이알피가 채운 대표자는 「푸른이알피」라 말한다', () => {
  const C = loadSrc();
  assert.equal(C.coSrcOf(co({ ceo:'나성환', srcOf:{ ceo:'푸른이알피' } }), 'ceo').label, '푸른이알피');
});

/* ══════ ② 서식에서 온 값 ══════ */

const WITH_DOC = co({
  extra: {
    sales: '1240000000',
    src: { sales: '2026_p77' },
    docs: { '2026_p77': { name:'기술보호울타리 신청서', year:'2026', id:'p77',
                          owner:'kwon', at: 1755000000000, by:'권형하' } }
  }
});

test('★ 서식에서 온 값은 «어느 서류»인지 말한다', () => {
  const s = loadSrc().coSrcOf(WITH_DOC, 'sales');
  assert.equal(s.label, '기술보호울타리 신청서');
});

test('★ 언제·누가까지 말한다 — 「이 숫자 어디서 봤더라」에 답해야 한다', () => {
  const s = loadSrc().coSrcOf(WITH_DOC, 'sales');
  assert.equal(s.by, '권형하');
  assert.equal(s.at, 1755000000000);
});

test('★ 원본 서류로 가는 길을 준다 — 사진 번호·해·주인', () => {
  const s = loadSrc().coSrcOf(WITH_DOC, 'sales');
  assert.equal(s.photoId, 'p77', '★ 사진 번호가 없으면 원본을 못 연다');
  assert.equal(s.photoYear, '2026');
  assert.equal(s.photoOwner, 'kwon');
});

test('서식 값인데 src 기록이 없으면 (옛 기록) 그냥 「서식」이라 한다', () => {
  /* 4순위 이전에 들어온 값에는 src 가 없다. 그래도 «서식에서 왔다»는 것까지는 참이다 —
     그것마저 숨기면 등록증에서 온 값과 구별이 안 된다. */
  const s = loadSrc().coSrcOf(co({ extra:{ sales:'1240000000' } }), 'sales');
  assert.equal(s.label, '서식');
  assert.equal(s.photoId, '', '없는 사진 번호를 지어내면 안 된다');
});

test('src 가 가리키는 서류가 사라졌으면 그냥 「서식」으로 물러난다', () => {
  const s = loadSrc().coSrcOf(co({ extra:{ sales:'1', src:{ sales:'2026_없는것' }, docs:{} } }), 'sales');
  assert.equal(s.label, '서식');
});

/* ══════ ③ coVal 이 고른 쪽과 «같은 쪽» ══════ */

test('★ 서식 값이 이기면 출처도 서식이라 한다 — 어긋나면 거짓말이 된다', () => {
  const C = loadSrc();
  /* 등록증에도 대표자가 있고 서식에도 있다. coVal 은 extra 를 먼저 고른다. */
  const o = co({ ceo:'옛대표', srcOf:{ ceo:'사업자등록증' },
    extra:{ ceo:'새대표', src:{ ceo:'2026_p9' },
            docs:{ '2026_p9':{ name:'중소기업확인서', id:'p9', year:'2026' } } } });
  assert.equal(C.coVal(o, 'ceo'), '새대표', '먼저 규칙을 확인한다');
  assert.equal(C.coSrcOf(o, 'ceo').label, '중소기업확인서',
    '★ 보이는 값은 서식 것인데 출처는 등록증이라 하면 엉뚱한 서류를 뒤지게 된다');
});

test('★ 서식 칸이 비어 있으면 «등록증» 쪽 출처를 말한다', () => {
  const C = loadSrc();
  const o = co({ ceo:'나성환', srcOf:{ ceo:'사업자등록증' }, extra:{ ceo:'   ' } });
  assert.equal(C.coVal(o, 'ceo'), '나성환');
  assert.equal(C.coSrcOf(o, 'ceo').label, '사업자등록증');
});

/* ══════ ④ 모르면 아무 말도 안 한다 ══════ */

test('★ 출처를 모르면 아무 말도 안 한다 — 지어내면 안 된다', () => {
  assert.equal(loadSrc().coSrcOf(co({ ceo:'나성환' }), 'ceo'), null);
});

test('값이 아예 없는 칸도 아무 말 안 한다', () => {
  assert.equal(loadSrc().coSrcOf(co({}), 'ceo'), null);
});

/* ══════ ⑤ 목록을 세울 때 적어 둔다 ══════ */

/* ⚠ coListBuild 안에 srcOf 가 «적혀 있는지» 보는 것으로는 모자란다 — 빈 srcOf:{} 만
     남기고 채우기를 지워도 통과한다(실제로 그렇게 샜다). 그러니 «세워 보고» 확인한다. */
function buildList(bizItems, cardItems, erp){
  const items = [].concat(bizItems || [], cardItems || []);
  const ctx = { console, Object, String, Number, Array,
    /* 2026-08-30: 상호 못 읽은 회사도 목록에 남는다 — 화면이 «보여줄 이름»을 쓴다 */
    coDisplayName: o => (o && String(o.name||'').trim()) || (o && o.bizno) || '',
    _coWatch: null, _coListMemo: null, _coInfo: {},
    allItems: () => items,
    digits: v => String(v || '').replace(/\D/g, ''),
    _norm: v => String(v || '').replace(/\s+/g, ''),
    coKeyOf: it => { const d = String(it.bizno || '').replace(/\D/g, '');
                     return d.length >= 10 ? d : ('n' + String(it.company || '').replace(/\s+/g, '')); },
    ErpMatch: { ready: true, match: () => erp || null,
      /* 2026-08-28: coListBuild 가 전체를 한 번에 맞춘다 — 대역도 같은 답을 준다 */
      matchAll: list => { const out = {}; (list||[]).forEach(o=>{ if(o && erp) out[o.key] = erp; }); return out; } },
    /* 2026-08-30: 예전에 판독한 등록증은 세금계산서 발급 메일이 «메모»에만 있다 —
       회사로 올릴 때 그것을 되살린다. 대역도 «진짜와 같은 답»을 준다.
       ⚠ 점(.)은 줄바꿈을 안 먹으므로 [^\n] 을 따로 쓰지 않는다. */
    taxInvoiceFromText: v => { const m = String(v == null ? '' : v)
      .match(/세금계산서.{0,60}?([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/); return m ? m[1] : ''; },
    coEffectiveExtra: () => null };
  vm.createContext(ctx);
  vm.runInContext(fnBody('coListBuild'), ctx);
  return ctx.coListBuild();
}
const BIZ = { kind:'biz', company:'가나테크', bizno:'134-86-05772', ceo:'나성환',
              address:'충남 천안시 서북구 1' };

test('★ 등록증에서 채운 칸에 «사업자등록증» 표가 붙는다 — 세워 보고 확인한다', () => {
  const o = buildList([BIZ])[0];
  assert.equal(o.srcOf.ceo, '사업자등록증',
    '★ 적어 두지 않으면 나중에는 어디서 온 값인지 알아낼 길이 아예 없다');
  assert.equal(o.srcOf.address, '사업자등록증');
});

test('★ 명함만 있는 회사의 이름에는 «명함» 표가 붙는다', () => {
  const o = buildList([], [{ kind:'card', company:'다라산업', bizno:'' }])[0];
  assert.equal(o.srcOf.name, '명함');
});

test('★ 푸른이알피가 채운 대표자에는 «푸른이알피» 표가 붙는다', () => {
  /* 등록증에 대표자가 없을 때만 ERP 가 채운다 — 그때 출처도 ERP 여야 한다 */
  const o = buildList([{ kind:'biz', company:'마바물산', bizno:'120-81-04455' }],
                      [], { ceoRaw:'홍길동', type:'유지' })[0];
  assert.equal(o.ceo, '홍길동', '먼저 ERP 가 채우는지 확인한다');
  assert.equal(o.srcOf.ceo, '푸른이알피',
    '★ ERP 가 채운 값을 등록증에서 온 것처럼 보이면 없는 서류를 뒤지게 된다');
});

test('등록증에 대표자가 있으면 푸른이알피가 덮지 않는다 — 표도 등록증 그대로', () => {
  const o = buildList([BIZ], [], { ceoRaw:'홍길동', type:'유지' })[0];
  assert.equal(o.ceo, '나성환');
  assert.equal(o.srcOf.ceo, '사업자등록증');
});

test('★ 출처를 알아내려고 서버를 더 읽지 않는다 (2026-08-16 요금 사고)', () => {
  assert.equal(/db\.ref\(|Store\.db\.ref\(|once\(/.test(fnBody('coListBuild')), false);
});

/* ══════ ⑥ 사진첩이 src 를 남긴다 ══════ */

function loadSend(existing){
  const i = jsrc.indexOf('function sendToCoInfo');
  const j = jsrc.indexOf('function sendToCompany');
  assert.ok(i > 0 && j > i, 'sendToCoInfo 를 찾지 못했습니다');
  const writes = [];
  const ctx = {
    /* 2026-08-30: 상호 못 읽은 회사도 목록에 남는다 — 화면이 «보여줄 이름»을 쓴다 */
    coDisplayName: o => (o && String(o.name||'').trim()) || (o && o.bizno) || '',
    Promise, Object, String, Date, Error,
    CARDS_ROOT: 'pucards',
    CO_LABEL: { ceo:'대표자', address:'소재지', sales:'매출액' },
    /* 2026-08-28: 어긋남 알림이 «기업정보함» 이름표를 먼저 본다 */
    FIELD_LABEL: { ceo:'대표자', address:'소재지', companyTel:'대표번호' },
    /* 2026-08-28: 서류 밑에 pairs 를 담는다 — 그 한계값 */
    CO_PAIRS_MAX: 60, CO_PAIR_LEN: 300,
    bizKey: v => { const d = String(v||'').replace(/\D/g,''); return d.length>=10 ? d : ''; },
    deps: { db: { ref: p => ({
      once: () => Promise.resolve({ val: () => existing }),
      update: v => { writes.push({ path:p, val:v }); return Promise.resolve(); }
    }) } },
    _writes: writes
  };
  vm.createContext(ctx);
  vm.runInContext(jsrc.slice(i, j), ctx);
  return ctx;
}
const SEND = { fields:{ bizno:'134-86-05772', ceo:'나성환', sales:'1240000000',
                        docName:'기술보호울타리 신청서' },
               byName:'권형하', photo:{ year:'2026', id:'p77', owner:'kwon' } };

test('★ 새로 채운 칸마다 어느 서류에서 왔는지 남는다', () => {
  const c = loadSend({});
  return c.sendToCoInfo(SEND).then(() => {
    const v = c._writes[0].val;
    assert.ok(v['src/ceo'], '★ 대표자를 채워 놓고 어디서 왔는지 안 남겼다');
    assert.ok(v['src/sales'], '★ 매출액 출처가 없다');
  });
});

test('★ src 는 docs 열쇠만 가리킨다 — 통째로 베끼면 칸 수만큼 요금이 는다', () => {
  const c = loadSend({});
  return c.sendToCoInfo(SEND).then(() => {
    const v = c._writes[0].val;
    assert.equal(typeof v['src/ceo'], 'string',
      '★ 서류 이름·날짜·사람·사진번호를 칸마다 베끼면 docs 를 스무 번 되풀이하는 셈이다');
    assert.ok(v['docs/' + v['src/ceo']], '★ 가리키는 서류가 같은 쓰기 안에 없다 — 끊긴 화살표다');
  });
});

test('★ 이미 값이 있던 칸에는 src 를 안 쓴다 — 그 값은 이 서류에서 온 게 아니다', () => {
  const c = loadSend({ ceo:'나성환' });                  /* 같은 값이 이미 있다 */
  return c.sendToCoInfo(SEND).then(() => {
    const v = (c._writes[0] || {}).val || {};
    assert.equal(v['src/ceo'], undefined,
      '★ 안 채운 칸에 출처를 붙이면 남의 서류를 가리키게 된다');
    assert.ok(v['src/sales'], '채운 칸(매출액)에는 남아야 한다');
  });
});

test('어긋난 칸에도 src 를 안 쓴다 — 값을 안 넣었으니 출처도 없다', () => {
  const c = loadSend({ ceo:'김철수' });                  /* 다른 값이 있다 */
  return c.sendToCoInfo(SEND).then(() => {
    const v = c._writes[0].val;
    assert.equal(v['src/ceo'], undefined);
    assert.ok(v['conflicts/ceo'], '어긋남 기록은 그대로 남아야 한다');
  });
});

test('사진이 없으면 src 를 안 쓴다 — 가리킬 서류가 없다', () => {
  const c = loadSend({});
  return c.sendToCoInfo({ fields: SEND.fields, byName:'권형하' }).then(() => {
    const v = c._writes[0].val;
    assert.equal(v['src/ceo'], undefined, '★ 없는 서류를 가리키면 눌러도 안 열린다');
    assert.equal(v.ceo, '나성환', '값은 그대로 채워져야 한다');
  });
});

test('값이 하나도 안 채워지면 src 때문에 쓰기가 생기지 않는다', () => {
  /* docName 도 채워지는 칸이라 함께 막아 둔다 — 안 그러면 「안 채웠다」가 아니다 */
  const c = loadSend({ ceo:'나성환', sales:'1240000000', docName:'기술보호울타리 신청서' });
  return c.sendToCoInfo(SEND).then(r => {
    /* 서류 기록(docs)·갈래(tags)는 남을 수 있다. src 만으로 쓰기가 늘면 안 된다. */
    const v = (c._writes[0] || {}).val || {};
    assert.equal(Object.keys(v).filter(k => k.indexOf('src/') === 0).length, 0);
    assert.ok(r.ok);
  });
});

/* ══════ ⑦ 상세 패널이 «실제로» 그린다 ══════ */

function drawPanel(o){
  const ctx = { console, Object, Array, String, Number,
    /* 2026-08-30: 상호 못 읽은 회사도 목록에 남는다 — 화면이 «보여줄 이름»을 쓴다 */
    coDisplayName: o => (o && String(o.name||'').trim()) || (o && o.bizno) || '',
    esc: s => String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
    fmtDate: t => '2026-08-13',
    CO_FIELDS: [['ceo','대표자'], ['sales','매출액']],
    _coFolders: {},
    coConflictHtml: () => '', coDocsHtml: () => '',
    /* 2026-09-02: 회사 열쇠 한 줄 — 이 검사는 안 본다 */
    coErpPinHtml: () => '',
    coErpHtml: () => '', coCardsHtml: () => '', coTagsOf: () => [] };
  vm.createContext(ctx);
  /* ⚠ 2026-08-31(점검 B2): 상세에 계약 기간 한 줄이 붙었다. 대역을 넣는 대신 «진짜»를
     실어 준다 — 대역을 넣으면 그 줄이 터져도 이 검사가 모른다. */
  /* ⚠ 2026-08-31: 출처를 «짧게» 적는 잣대가 갈라져 나왔다(coSrcShort). 대역이 아니라
     진짜를 함께 싣는다 — 안 실으면 상세가 통째로 터지고, 그 까닭이 안 보인다. */
  /* ⚠ 2026-08-31: 기업정보 접기/펼치기(대표 지시)로 CO_FIELDS 를 그리는 자리가
     coInfoBoxHtml·coInfoSummary 로 옮겨 갔다 — 대역이 아니라 진짜를 함께 싣는다. */
  vm.runInContext('let _coInfoOpen = true;\n'   // 펼친 채로 봐야 값·출처 줄이 보인다
    + src.match(/^const CO_SRC_SHORT = \{[^}]*\};/m)[0].replace(/^const /, 'var ')
    + '\n' + fnBody('coSrcShort') + '\n'
    + fnBody('coVal') + '\n' + fnBody('coSrcOf') + '\n'
    + fnBody('erpContractPeriod') + '\n' + fnBody('todayYmd') + '\n'
    + fnBody('coSrcTagHtml') + '\n' + fnBody('coInfoSummary') + '\n' + fnBody('coInfoBoxHtml') + '\n'
    + fnBody('coDetailPanelHtml'), ctx);
  return ctx.coDetailPanelHtml(o);
}

test('★ 상세 패널이 그 줄에 출처를 «그린다» — 함수만 있고 안 그리면 소용없다', () => {
  const h = drawPanel(WITH_DOC);
  assert.ok(h.indexOf('기술보호울타리 신청서') > 0,
    '★ 값 옆에 어느 서류인지 안 뜨면 4순위를 만든 뜻이 없다');
});

test('출처를 모르는 칸에는 아무것도 안 붙는다 — 표가 시끄러워지면 안 된다', () => {
  const h = drawPanel(co({ ceo:'나성환' }));
  assert.equal(h.indexOf('cosrc'), -1);
});

test('★ 사진 번호가 있을 때만 「원본 보기」가 붙는다', () => {
  assert.ok(drawPanel(WITH_DOC).indexOf('openCoDoc') > 0, '원본으로 가는 길이 없다');
  const old = co({ extra:{ sales:'1240000000' } });      /* src 없는 옛 기록 */
  assert.equal(drawPanel(old).indexOf('openCoDoc'), -1,
    '★ 사진 번호도 없이 「원본 보기」를 띄우면 눌러도 아무 일이 없다');
});

test('★ 화면만 읽는다 — 서버에 쓰지 않는다', () => {
  for (const n of ['coSrcOf', 'coSrcTagHtml']) {
    assert.equal(/db\.ref\(|Store\.db|firebase\.database\(|\.update\(/.test(fnBody(n)), false,
      '★ ' + n + ' 이 서버를 건드린다 — 보여 주기만 해야 한다');
  }
});
