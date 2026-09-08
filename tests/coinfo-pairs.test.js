'use strict';
/* 서류에 «적힌 것 전부»를 그 서류 밑에 보관한다 (대표 결정 2026-08-28)
   ═══════════════════════════════════════════════════════════════════════════
   대표 지시: 「기업정보함에는 사진첩에서 들어온 그 기업과 관련된 정보는 모두 보관하고 싶다」

   ■ 무엇이 버려지고 있었나
     판독 층(AI)은 서류를 읽어 두 가지를 만든다 —
       ① 이름 붙은 칸 : company · ceo · sales 처럼 «정해진 이름»
       ② pairs        : 문서에 적힌 «모든 항목»을 적힌 그대로 [{k,v}]
     그런데 기업정보함으로 보낼 때는 KEEP 29칸만 통과했다. pairs 는 «저장되는 곳이
     아예 없었다» — 통째로 버려졌다.
     중간에 「되메우기」(PAIR_TO_KEY, 이름표 55가지)가 있어 아는 이름은 칸으로
     옮겨지지만, 그 목록에 없는 항목(신청 사유·사업 기간·지원 금액·고용보험
     관리번호 …)은 그대로 사라졌다. 서식은 계속 새로 생기므로 «이름표를 쫓아가는
     방식은 끝이 없다».

   ■ 어떻게 바꿨나 — 회사 칸이 아니라 «서류 밑»에 통째로
     docs/{서류열쇠}/pairs 에 그 서류의 항목을 그대로 담는다.
     ⚠ 회사 칸(ceo·address…)에 밀어 넣지 «않는다». 서류마다 표기가 달라 서로 덮고
       어긋난다 — 서류 밑에 두면 그 서류가 뭐라고 했는지가 영영 남는다.
     ⚠ 개수·길이는 «자른다». 판독이 어긋나 글자가 쏟아지면 그것이 그대로 요금이다
       (2026-08-16·08-26 두 번 겪었다). 자른 것은 잘랐다고 남긴다 — 조용히 줄이면
       나중에 「왜 없지」가 된다.
     ⚠ 개인정보는 «거르지 않는다» — 대표 결정 2026-08-28 (가) 「그대로 다 담는다」.
       주민등록번호는 판독 층이 애초에 안 읽는다(PROMPT 에 못 박혀 있다).

   ★ 여기서 못 박는 것
     ① pairs 가 그 서류 밑에 통째로 남는다
     ② 서류 정보(이름·해·사진번호·누가·언제)는 하던 대로 그대로
     ③ pairs 가 없으면 그 칸을 아예 안 만든다 (빈 껍데기 금지)
     ④ 너무 많거나 길면 자르고, 잘랐다고 남긴다
     ⑤ 회사 칸을 덮지 않는다 — 서류 밑에만 있다
     ⑥ 같은 서류를 두 번 보내도 줄이 안 는다 (하던 규칙)
   실행: node --test tests/coinfo-pairs.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'pu-doc-file.js'), 'utf8');

function load(existing){
  const i = src.indexOf('function sendToCoInfo');
  const j = src.indexOf('function sendToCompany');
  assert.ok(i > 0 && j > i, 'sendToCoInfo 를 찾지 못했습니다');
  const writes = [];
  const ctx = {
    Promise, Object, String, Date, Error, Array, Math, JSON, Number,
    CARDS_ROOT: 'pucards',
    CO_LABEL: { ceo:'대표자', address:'소재지' },
    FIELD_LABEL: { ceo:'대표자', address:'소재지', companyTel:'대표번호',
                   bizItem:'종목', sales:'매출액', workers:'상시근로자수' },
    CO_PAIRS_MAX: 60, CO_PAIR_LEN: 300,
    bizKey: v => { const d = String(v||'').replace(/\D/g,''); return d.length>=10 ? d : ''; },
    deps: { db: { ref: p => ({
      once: () => Promise.resolve({ val: () => existing }),
      update: v => { writes.push({ path:p, val:v }); return Promise.resolve(); }
    }) } },
    _writes: writes
  };
  vm.createContext(ctx);
  vm.runInContext(src.slice(i, j), ctx);
  return ctx;
}
const PHOTO = { year:'2026', id:'p77', owner:'kwon' };
const PAIRS = [
  { k:'신청 사유', v:'설비 노후로 인한 교체' },
  { k:'사업 기간', v:'2026-03-01 ~ 2026-12-31' },
  { k:'지원 희망금액', v:'80,000,000원' },
  { k:'고용보험 관리번호', v:'12345678900' }
];
const SEND = { fields:{ bizno:'134-86-05772', company:'가나테크', ceo:'나성환',
                        docName:'4·4 제도 도입기업 선정 신청서', pairs: PAIRS },
               byName:'권형하', photo: PHOTO };

/* ══════ ① 서류 밑에 통째로 남는다 ══════ */

test('★ 서류에 적힌 항목이 그 서류 밑에 통째로 남는다', () => {
  const c = load({});
  return c.sendToCoInfo(SEND).then(() => {
    const doc = c._writes[0].val['docs/2026_p77'];
    assert.ok(doc, '서류 줄이 없다');
    assert.ok(doc.pairs, '★ pairs 가 저장되지 않았다 — 여기가 이 작업의 전부다');
    assert.equal(doc.pairs.length, 4);
  });
});

test('★ 이름표에 «없는» 항목도 남는다 — 이름표를 쫓아가는 방식은 끝이 없다', () => {
  const c = load({});
  return c.sendToCoInfo(SEND).then(() => {
    const got = c._writes[0].val['docs/2026_p77'].pairs.map(p => p.k);
    ['신청 사유', '사업 기간', '지원 희망금액', '고용보험 관리번호'].forEach(function (k) {
      assert.ok(got.indexOf(k) >= 0,
        '★ 「' + k + '」이 사라졌다 — 되메우기 이름표에 없는 항목이 바로 이런 것이다');
    });
  });
});

test('값도 «적힌 그대로» 남는다', () => {
  const c = load({});
  return c.sendToCoInfo(SEND).then(() => {
    const p = c._writes[0].val['docs/2026_p77'].pairs.find(x => x.k === '지원 희망금액');
    assert.equal(p.v, '80,000,000원');
  });
});

/* ══════ ② 하던 것은 그대로 ══════ */

test('서류 정보(이름·해·사진번호·누가·언제)는 하던 대로 그대로다', () => {
  const c = load({});
  return c.sendToCoInfo(SEND).then(() => {
    const doc = c._writes[0].val['docs/2026_p77'];
    assert.equal(doc.name, '4·4 제도 도입기업 선정 신청서');
    assert.equal(doc.year, '2026');
    assert.equal(doc.id, 'p77');
    assert.equal(doc.owner, 'kwon');
    assert.equal(doc.by, '권형하');
    assert.ok(doc.at, '언제인지가 없다');
  });
});

test('같은 서류를 두 번 보내도 줄이 안 는다 — 하던 규칙 그대로', () => {
  const c = load({ docs: { '2026_p77': { name:'옛것' } } });
  return c.sendToCoInfo(SEND).then(() => {
    const v = (c._writes[0] || {}).val || {};
    assert.equal(v['docs/2026_p77'], undefined, '이미 있는 서류를 다시 썼다');
  });
});

/* ══════ ③ 없으면 안 만든다 ══════ */

test('★ pairs 가 없으면 그 칸을 아예 안 만든다 — 빈 껍데기를 두지 않는다', () => {
  const c = load({});
  const noPairs = { fields:{ bizno:'134-86-05772', ceo:'나성환', docName:'사업자등록증' },
                    byName:'권형하', photo: PHOTO };
  return c.sendToCoInfo(noPairs).then(() => {
    const doc = c._writes[0].val['docs/2026_p77'];
    assert.ok(doc, '서류 줄 자체는 있어야 한다');
    assert.equal(doc.pairs, undefined, '빈 pairs 칸을 만들면 저장소만 는다');
  });
});

test('빈 항목·빈 값은 안 담는다', () => {
  const c = load({});
  const dirty = { fields:{ bizno:'134-86-05772', docName:'서식',
    pairs:[ { k:'', v:'값만' }, { k:'항목만', v:'' }, { k:'쓸것', v:'있다' }, null ] },
    photo: PHOTO };
  return c.sendToCoInfo(dirty).then(() => {
    const p = c._writes[0].val['docs/2026_p77'].pairs;
    assert.equal(p.length, 1);
    assert.equal(p[0].k, '쓸것');
  });
});

/* ══════ ④ 너무 많거나 길면 자른다 ══════ */

test('★ 항목이 너무 많으면 자르고 «잘랐다고» 남긴다 — 조용히 줄이면 「왜 없지」가 된다', () => {
  const many = [];
  for (let i = 0; i < 200; i++) many.push({ k:'항목' + i, v:'값' + i });
  const c = load({});
  return c.sendToCoInfo({ fields:{ bizno:'134-86-05772', docName:'서식', pairs: many },
                          photo: PHOTO }).then(() => {
    const doc = c._writes[0].val['docs/2026_p77'];
    assert.ok(doc.pairs.length <= 60,
      '★ 판독이 어긋나 글자가 쏟아지면 그것이 그대로 요금이다');
    assert.ok(doc.pairsCut > 0, '★ 자른 개수를 안 남기면 없어진 줄도 모른다');
    assert.equal(doc.pairsCut, 200 - doc.pairs.length);
  });
});

test('값이 아주 길면 자른다 — 판독이 본문을 통째로 담는 일이 있다', () => {
  const long = 'ㄱ'.repeat(5000);
  const c = load({});
  return c.sendToCoInfo({ fields:{ bizno:'134-86-05772', docName:'서식',
                                   pairs:[{ k:'비고', v: long }] }, photo: PHOTO }).then(() => {
    const p = c._writes[0].val['docs/2026_p77'].pairs[0];
    assert.ok(p.v.length <= 300, '한 값이 5,000자면 서류 한 장이 그만큼 무거워진다');
  });
});

test('안 자를 만큼이면 그대로 두고 «잘랐다»고 안 한다', () => {
  const c = load({});
  return c.sendToCoInfo(SEND).then(() => {
    assert.equal(c._writes[0].val['docs/2026_p77'].pairsCut, undefined);
  });
});

/* ══════ ⑤ 회사 칸을 덮지 않는다 ══════ */

test('★ pairs 는 «서류 밑»에만 있다 — 회사 칸을 덮지 않는다', () => {
  const c = load({});
  return c.sendToCoInfo(SEND).then(() => {
    const v = c._writes[0].val;
    assert.equal(v.pairs, undefined,
      '★ 회사 칸에 밀어 넣으면 서류마다 표기가 달라 서로 덮고 어긋난다');
    /* 문서 항목 이름이 «회사 칸»이 되면 안 된다.
       ⚠ 서류이름이 갈래(tags/…)가 되는 것은 하던 대로라 여기서 안 본다 —
         그것까지 걸면 멀쩡한 동작을 고장으로 읽는다(처음 판에서 그렇게 걸렸다). */
    const 회사칸 = Object.keys(v).filter(k => k.indexOf('/') < 0);
    PAIRS.forEach(function (p) {
      assert.equal(회사칸.indexOf(p.k), -1,
        '★ 「' + p.k + '」이 회사 칸이 되었다 — 서류마다 표기가 달라 서로 덮는다');
    });
  });
});

test('사진이 없으면 pairs 도 안 담는다 — 담을 서류가 없다', () => {
  const c = load({});
  return c.sendToCoInfo({ fields: SEND.fields, byName:'권형하' }).then(() => {
    const v = c._writes[0].val;
    assert.equal(Object.keys(v).filter(k => k.indexOf('docs/') === 0).length, 0);
  });
});

/* ══════ ⑥ 팩스가 회사로 올라온다 ══════ */

test('★ 팩스가 회사 칸으로 올라온다 — 되메워 놓고 버리던 칸이다', () => {
  const c = load({});
  return c.sendToCoInfo({ fields:{ bizno:'134-86-05772', companyFax:'041-556-0036',
                                   docName:'서식' }, photo: PHOTO }).then(() => {
    assert.equal(c._writes[0].val.companyFax, '041-556-0036');
  });
});

test('담당자 이름은 회사 칸으로 «안» 올린다 — 회사 이름을 가린다', () => {
  /* coVal(o,'name') 은 extra.name 을 먼저 본다. 담당자 이름을 그 칸에 넣으면
     상세 패널에서 «회사 이름» 자리를 가린다. 담당자는 pairs 에 그대로 남는다. */
  const c = load({});
  return c.sendToCoInfo({ fields:{ bizno:'134-86-05772', name:'박대리', docName:'서식' },
                          photo: PHOTO }).then(() => {
    assert.equal(c._writes[0].val.name, undefined);
  });
});

/* ══════ ⑦ 화면에 «실제로» 나온다 ══════ */

const cardsSrc = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8')
  .replace(/\r\n/g, '\n');
function cardsFn(name){
  let i = cardsSrc.indexOf('\nfunction ' + name + '(');
  assert.ok(i >= 0, name + ' 를 찾을 수 없습니다');
  const open = cardsSrc.indexOf('{', i);
  let d = 0;
  for (let k = open; k < cardsSrc.length; k++) {
    if (cardsSrc[k] === '{') d++;
    else if (cardsSrc[k] === '}') { d--; if (!d) return cardsSrc.slice(i, k + 1); }
  }
  assert.fail(name + ' 의 끝을 찾을 수 없습니다');
}
function drawDocs(docs){
  const ctx = { console, Object, Array, String, Number,
    esc: s => String(s==null?'':s),
    fmtDate: () => '2026-08-28' };
  vm.createContext(ctx);
  /* ⚠ 2026-09-03: 목록이 «같은 이름 접기»(coDocsFold)와 «한 줄 설명»(hintLine)을 부른다.
     대역을 넣으면 접기가 통째로 죽어도 이 검사가 모른다 — «진짜»를 함께 싣는다. */
  ctx._norm = s => String(s == null ? '' : s).toLowerCase().replace(/\s+/g, '');
  vm.runInContext(cardsFn('coDocPairsHtml') + '\n' + cardsFn('hintLine') + '\n'
    + cardsFn('coDocsFold') + '\n' + cardsFn('coDocsListHtml'), ctx);
  return ctx.coDocsListHtml(docs, '읽어 온 서류');
}

test('★ 담아 둔 것이 «화면에» 나온다 — 저장만 하고 안 보이면 소용없다', () => {
  const h = drawDocs([{ name:'서식', year:'2026', id:'p77', at: 1, pairs: PAIRS }]);
  assert.ok(h.indexOf('신청 사유') > 0, '★ 담아 둔 항목이 화면 어디에도 안 나온다');
  assert.ok(h.indexOf('설비 노후로 인한 교체') > 0, '값이 안 나온다');
  assert.ok(h.indexOf('적힌 것 4개') > 0, '몇 개인지 안 알려 준다');
});

test('★ 접어 둔다 — 서류 한 장에 항목이 수십 개라 펼쳐 두면 서류 목록이 묻힌다', () => {
  const h = drawDocs([{ name:'서식', id:'p77', at:1, pairs: PAIRS }]);
  assert.match(h, /<details/, '펼쳐 둔 채로 두면 목록이 안 보인다');
  assert.equal(/<details[^>]*\bopen\b/.test(h), false, '처음부터 펼쳐져 있다');
});

test('담은 것이 없으면 펼칠 것도 안 만든다', () => {
  const h = drawDocs([{ name:'서식', id:'p77', at:1 }]);
  assert.equal(h.indexOf('적힌 것'), -1);
  assert.ok(h.indexOf('서식') > 0, '서류 줄 자체는 있어야 한다');
});

test('★ 자른 것이 있으면 «잘랐다»고 화면에도 말한다', () => {
  const h = drawDocs([{ name:'서식', id:'p77', at:1, pairs: PAIRS, pairsCut: 12 }]);
  assert.ok(h.indexOf('12') > 0, '★ 조용히 줄이면 나중에 「왜 없지」가 된다');
});

/* ══════ ⑧ 어긋남 알림이 우리말로 ══════ */

test('★ 어긋남 알림에 영어가 안 샌다 — 기업정보함 칸 이름표를 쓴다', () => {
  const c = load({ companyTel:'041-000-0000' });
  return c.sendToCoInfo({ fields:{ bizno:'134-86-05772', companyTel:'041-556-0035',
                                   docName:'서식' }, photo: PHOTO }).then(r => {
    assert.ok(r.message.indexOf('대표번호') > 0,
      '★ 업체관리(ERP) 이름표에는 companyTel 이 없어 영어가 그대로 샜다');
    assert.equal(r.message.indexOf('companyTel'), -1);
  });
});
