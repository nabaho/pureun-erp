/* 근로복지공단 지원금 신청 6종 — 자동 생성
 *
 * 대표 지시 2026-08-24 검토 ③. 원본 대조:
 *   03_과거자료/2020년/1. 대흥공동기금/4. 지원금신청/ 의 실제 제출본
 *   (7 자율체크리스트 · 8 기금출연확인서 · 9 서약서 · 10 복지사업계획서 ·
 *    12 재산목록표 · 13 지급신청서)
 *
 * ⚠ 이 저장소는 통째로 github.io 로 공개된다 — 실제 기금명·번호·금액 금지. 여기 자료는 전부 가짜다.
 *
 * 지켜야 하는 것
 *  ① 별지15호(노동부)와 «같은 산출»을 쓴다 — 따로 세면 두 기관에 낸 숫자가 어긋난다
 *  ② 대부사업은 복지사업비가 아니다 — 자산이라 8칸에도, 지원내용에도 안 들어간다
 *  ③ 사람이 판단할 것은 «비워 둔다» — 앱이 미리 찍어 두면 확인 없이 나간다
 *  ④ 읽어 둔 값이 이 기금·이 해 것인지 확인하고 쓴다
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'fund.html'), 'utf8');

function grabFn(name) {
  const i = SRC.indexOf('function ' + name + '(');
  assert.ok(i >= 0, 'fund.html 에 함수가 없다: ' + name);
  let d = 0, on = false;
  for (let j = i; j < SRC.length; j++) {
    if (SRC[j] === '{') { d++; on = true; }
    else if (SRC[j] === '}') { d--; if (on && !d) return SRC.slice(i, j + 1); }
  }
  throw new Error('함수 끝을 못 찾음: ' + name);
}
function grabDecl(name) {
  const i = SRC.indexOf('var ' + name + '=');
  assert.ok(i >= 0, 'fund.html 에 상수가 없다: ' + name);
  let d = 0, on = false;
  for (let j = SRC.indexOf('=', i); j < SRC.length; j++) {
    const c = SRC[j];
    if (c === '{' || c === '[') { d++; on = true; }
    else if (c === '}' || c === ']') { d--; if (on && !d) return SRC.slice(i, j + 1) + ';'; }
  }
  throw new Error('상수 끝을 못 찾음: ' + name);
}

/* ══════ 금액 한글 ══════
   출연확인서가 「일억오천만원정(￦150,000,000)」처럼 숫자와 한글을 나란히 적는다.
   고쳐 쓰는 것을 막으려는 관례라 한쪽만 적으면 공단이 되돌려보낸다. */
function kw() {
  const box = {};
  new Function([grabDecl('_KOR_D'), grabDecl('_KOR_P'), grabDecl('_KOR_U'),
    grabFn('num'), grabFn('korWon'), 'this.f=korWon;'].join('\n')).call(box);
  return box.f;
}

test('금액을 한글로 — 실제 제출본과 같은 꼴', () => {
  const f = kw();
  assert.equal(f(150000000), '일억오천만', '실제 제출본이 「일억오천만원」이었다');
  assert.equal(f(50000000), '오천만');
  assert.equal(f(200000000), '이억');
  assert.equal(f(0), '영');
  assert.equal(f(1), '일');
  assert.equal(f(10), '일십', '금액 대문자 표기는 십·백·천 앞의 일을 살린다');
  assert.equal(f(1234), '일천이백삼십사');
  assert.equal(f(100000000), '일억', '억 앞의 일은 반드시 살린다');
  assert.equal(f(1000000000000), '일조');
  assert.equal(f(305000000), '삼억오백만', '0 인 자리는 건너뛴다');
  assert.equal(f(-50000), '마이너스 오만');
});

/* ══════ 복지사업 8칸으로 모으기 ══════ */
function sa() {
  const box = {};
  new Function([grabDecl('SUB_ROWS'), grabFn('num'), grabFn('subAmounts'),
    'this.f=subAmounts; this.R=SUB_ROWS;'].join('\n')).call(box);
  return box;
}

test('WELF_CATS 의 모든 분류가 8칸에 «한 번씩» 들어간다', () => {
  const box = {};
  new Function([grabDecl('WELF_CATS'), grabDecl('SUB_ROWS'),
    'this.c=WELF_CATS; this.r=SUB_ROWS;'].join('\n')).call(box);
  const mapped = [].concat.apply([], box.r.map(r => r[1]));
  box.c.filter(c => c !== '대부사업').forEach(c => {
    const hits = mapped.filter(x => x === c).length;
    assert.equal(hits, 1, '분류가 ' + hits + '번 들어갔다(1번이어야 한다): ' + c
      + ' — 0번이면 그 돈이 계획서에서 사라지고, 2번이면 두 번 세어진다');
  });
  assert.ok(!mapped.includes('대부사업'), '대부는 자산이지 복지사업비가 아니다');
  assert.equal(box.r.length, 8, '공단 서식은 8칸이다');
});

test('목적사업을 8칸으로 모은다 — 대부는 뺀다', () => {
  const box = sa();
  const r = box.f([
    { category: '체육문화비', budget: 5000000 },
    { category: '동호회비', budget: 1000000 },
    { category: '격려금', budget: 8000000 },
    { category: '대부사업', budget: 30000000 }
  ], 'budget');
  assert.equal(r['체육ㆍ문화활동'], 6000000, '체육문화비와 동호회비는 한 칸이다');
  assert.equal(r['기타 사업비'], 8000000, '격려금은 서식에 칸이 없어 기타로 간다');
  assert.equal(r._total, 14000000, '대부 3천만원이 복지사업비에 섞였다');
});

test('분류가 낯설거나 비어 있어도 돈은 살린다 — 기타로 모은다', () => {
  const box = sa();
  const r = box.f([{ category: '알 수 없는 분류', budget: 700000 }, { category: '', budget: 300000 }], 'budget');
  /* 버리면 계획서 합계가 «조용히» 줄어든다 — 사람은 왜 줄었는지 알 길이 없다.
     분류를 골라 달라고 말하는 것은 화면이 할 일이고, 숫자는 일단 살린다. */
  assert.equal(r['기타 사업비'], 1000000, '분류를 못 알아본다고 돈을 버리면 안 된다');
  assert.equal(r._total, 1000000);
});

/* ══════ 서식을 «정말 그려» 본다 ══════ */
const FUND = {
  _id: 'F1', name: '가짜공동근로복지기금', short_name: '가짜 1호', fund_type: '공동', region: '충남',
  inka_no: '0000-2020-0', inka_date: '2020-03-23', corp_reg_no: '000000-0000000', chairman: '홍길동',
  address: '○○도 ○○시 ○○로 1', phone: '000-000-0000',
  years: { 2025: { subsidy: { request_amount: 200000000, decided_amount: 150000000, paid_date: '' } } }
};
const SITES = [{ _id: 'S1', name: '가나다산업', ceo: '김대표', company_size: '25', biz_type: '제조업' },
               { _id: 'S2', name: '라마바물산', ceo: '이대표', company_size: '15', biz_type: '제조업' }];
const EXTRA = {
  fid: 'F1', yr: 2025, sites: SITES,
  sy: { S1: { contrib: 150000000 }, S2: { contrib: 50000000 } },
  welf: [{ name: '체육문화활동비', category: '체육문화비', budget: 5000000, beneficiaries: 40 },
         { name: '명절 격려금', category: '격려금', budget: 8000000, beneficiaries: 40 },
         { name: '생활안정자금 대부', category: '대부사업', budget: 30000000, beneficiaries: 3 }],
  R: { run: { deposit: 170000000, trust: 0, secu: 0, own: 0, reit: 0, etc: 0, loan: 30000000 }, bfEnd: 200000000 },
  fin: { totalAssets: 213000000, basic: 200000000 }
};

function doc(kind, opts) {
  opts = opts || {};
  const box = {};
  new Function('F', 'SITES', 'X', [
    grabDecl('WELF_CATS'), grabDecl('SUB_ROWS'), grabDecl('BF_KINDS'),
    grabDecl('_KOR_D'), grabDecl('_KOR_P'), grabDecl('_KOR_U'),
    'var S={formFund:"' + (opts.formFund || 'F1') + '",year:' + (opts.year || 2025) + ',_docR:X,_docBf:null};',
    grabFn('num'), grabFn('esc'), grabFn('dgV'), grabFn('dgWon'), grabFn('dgToday'), grabFn('_dotDate'),
    grabFn('korWon'), grabFn('subAmounts'), grabFn('_docRok'), grabFn('_docWait'),
    grabFn('guessBfKind'), grabFn('bfMovesOf'), grabFn('bfDays'), grabFn('bfReason'),
    'function hwpFormHTML(){return null;} function charterSane(){return "";} function charterGong(){return "";}',
    'function _fyRange(){return {start:"",end:""};} function _officersOf(){return [];}',
    'function _auditorsOf(){return [];} function _closeFigures(){return "";}',
    grabFn('docBody'),
    'this.html=docBody("' + kind + '",F,SITES);'
  ].join('\n')).call(box, opts.fund || FUND, opts.sites || SITES,
    ('extra' in opts) ? opts.extra : EXTRA);
  return box.html;
}
const pages = h => (h.match(/class='a4'/g) || []).length;

test('서약서 — 반환 사유 네 가지와 30일 조항이 그대로 있다', () => {
  const h = doc('sub_oath');
  assert.ok(h.includes('[별지 제2호의3 서식]'), '서식 번호가 다르다');
  ['거짓이나 그 밖의 부정한 방법', '사정 변경으로 취소 요청', '5년간 지원목적에 위배',
   '요건을 갖추지 못한 경우', '30일 이내'].forEach(k =>
    assert.ok(h.includes(k), '서약 내용이 빠졌다: ' + k));
  assert.ok(h.includes('근로복지공단 이사장 귀하'));
  assert.ok(h.includes('가짜공동근로복지기금') && h.includes('0000-2020-0'));
  assert.equal(pages(h), 1);
});

test('기금출연확인서 — 출연한 사업장마다 한 장, 금액은 한글과 숫자 나란히', () => {
  const h = doc('sub_contrib');
  assert.equal(pages(h), 2, '출연한 사업장이 둘이면 확인서도 두 장이다');
  assert.ok(h.includes('일억오천만원정 (￦150,000,000)'), '한글·숫자를 나란히 안 적었다');
  assert.ok(h.includes('오천만원정 (￦50,000,000)'));
  assert.ok(h.includes('가나다산업') && h.includes('라마바물산'));
  assert.ok(h.includes('김대표') && h.includes('이대표'), '확인서에 서명할 사람이 없다');
});

test('기금출연확인서 — 그 해 출연이 없으면 「만들 수 없다」고 말한다', () => {
  const h = doc('sub_contrib', { extra: Object.assign({}, EXTRA, { sy: {} }) });
  assert.match(h, /출연한 사업장이 없습니다/, '0원짜리 확인서를 만들면 안 된다');
  assert.ok(!h.includes('￦0'), '금액 0원으로 확인서를 찍으면 안 된다');
});

test('복지사업계획서 — 8칸 합계가 총지출예상금액과 맞는다', () => {
  const h = doc('sub_welfare_plan');
  assert.ok(h.includes('[별지 제2호서식]'), '서식 번호가 다르다');
  assert.ok(h.includes('13,000,000원'), '총지출 예상금액(5백+8백만)이 안 맞는다');
  assert.ok(h.includes('5,000,000원') && h.includes('8,000,000원'));
  assert.ok(!h.includes('30,000,000'), '대부 3천만원이 복지사업비로 새어 들어갔다');
  assert.ok(h.includes('40명 × 125,000원'), '산출근거를 대상인원으로 나눠 적어야 한다');
  assert.ok(h.includes('운영규정 제7조'), '근거 조문이 서식과 다르다');
});

test('복지사업계획서 — 목적사업이 비었으면 그렇게 알린다', () => {
  const h = doc('sub_welfare_plan', { extra: Object.assign({}, EXTRA, { welf: [] }) });
  assert.match(h, /목적사업이 비어 있습니다/, '빈 계획서를 말없이 내밀면 안 된다');
});

/* 여기가 이 묶음에서 가장 틀리기 쉬운 자리다 — 계와 항목이 다른 숫자를 뜻한다 */
test('지급신청서 — 항목별 칸은 비운다(결정금액 배분은 앱이 모른다)', () => {
  const h = doc('sub_payment');
  assert.ok(h.includes('[별지 제6호서식]'), '서식 번호가 다르다');
  assert.ok(h.includes('150,000,000'), '지원결정금액(A)이 안 들어갔다');
  /* 계 = 결정액인데 항목 칸에 복지사업 «계획액»을 넣으면 합이 안 맞는 표가 나간다 */
  const body = h.slice(h.indexOf('주택구입자금'), h.indexOf('항목별 칸은'));
  assert.ok(!/5,000,000|8,000,000/.test(body), '항목 칸에 복지사업 계획액이 들어갔다 — 계와 합이 안 맞는다');
  assert.match(h, /참고로 2025년 복지사업 계획은/, '참고 금액을 안 알려 주면 옮겨 적을 수가 없다');
  assert.match(h, /계좌는 시스템에 담지 않습니다/, '계좌를 담지 않는다는 것을 말해야 한다');
});

test('지급신청서 — 아직 받은 것이 없으면 B=0, 남은 금액=A', () => {
  const h = doc('sub_payment');
  const row = h.slice(h.indexOf('>계<'), h.indexOf('주택구입자금'));
  assert.ok(row.includes('150,000,000'), 'A 가 안 들어갔다');
  assert.ok(row.includes('>0<'), '받은 것이 없으면 0 이라고 적어야 한다');
});

test('재산목록표 — 기본재산은 운용 내역, 보통재산은 나머지, 합계가 자산총계', () => {
  const h = doc('sub_assets');
  assert.ok(h.includes('금융회사 예입ㆍ예탁') && h.includes('170,000,000'));
  assert.ok(h.includes('근로자 대부금') && h.includes('30,000,000'));
  assert.ok(h.includes('200,000,000'), '기본재산 계가 안 맞는다');
  assert.ok(h.includes('13,000,000'), '보통재산(자산총계 − 기본재산)이 안 맞는다');
  assert.ok(h.includes('213,000,000'), '합계가 자산총계와 다르다');
  assert.ok(!h.includes('투자신탁'), '잔액이 0 인 운용 방법까지 줄을 만들면 표가 지저분해진다');
  assert.ok(!/운용 내역 합계[\s\S]{0,40}다릅니다/.test(h), '맞는데 어긋났다고 경고한다');
});

test('재산목록표 — 운용 내역이 기본재산 총액과 어긋나면 알린다', () => {
  const bad = Object.assign({}, EXTRA, { R: Object.assign({}, EXTRA.R, { bfEnd: 250000000 }) });
  const h = doc('sub_assets', { extra: bad });
  assert.match(h, /운용 내역 합계[\s\S]{0,60}다릅니다/, '어긋났는데 말없이 넘어간다');
});

test('자율체크리스트 — 판단할 것은 비워 둔다', () => {
  const h = doc('sub_checklist');
  ['특수관계인', '동일기업', '분할', '중소기업', '2억원 한도'].forEach(k =>
    assert.ok(h.includes(k), '착안사항이 빠졌다: ' + k));
  /* 앱이 미리 「비해당」을 찍어 두면 확인 없이 그대로 나간다 */
  assert.ok(!/>\s*(해당|비해당)\s*</.test(h), '착안사항 답을 앱이 미리 찍었다 — 확인 없이 그대로 나간다');
  assert.match(h, /비워 두었습니다/, '왜 비었는지 말해 줘야 한다');
});

test('자율체크리스트 — 현황은 장부·명부에서 채운다', () => {
  const h = doc('sub_checklist');
  assert.ok(h.includes('충남'), '지역이 안 들어갔다');
  assert.ok(h.includes('가나다산업, 라마바물산'), '참여회사가 안 들어갔다');
  assert.ok(h.includes('40명'), '참여회사 근로자수 합계(25+15)가 안 맞는다');
  assert.ok(h.includes('200,000<') || h.includes('>200,000'), '기금규모(천원)가 안 맞는다');
  assert.ok(h.includes('200,000,000'), '출연금액 합계가 안 맞는다');
  assert.ok(h.includes('2020. 3. 23.'), '인가일자가 서식 관례대로 안 찍혔다');
  assert.ok(!h.includes('대부사업'), '지원내용에 대부가 섞였다 — 기본재산으로 하는 것이라 뺀다');
});

/* ══════ 가장 위험한 자리 — 남의 기금·지난해 숫자 ══════ */
test('읽어 둔 숫자가 다른 기금·다른 해 것이면 쓰지 않는다', () => {
  ['sub_contrib', 'sub_welfare_plan', 'sub_assets'].forEach(k => {
    const stale = Object.assign({}, EXTRA, { yr: 2024 });
    const h = doc(k, { extra: stale });
    assert.match(h, /아직 못 읽었습니다|비어 있습니다/, k + ': 지난해 자료를 그대로 썼다');
    assert.ok(!h.includes('150,000,000'), k + ': 지난해 금액이 올해 서류에 찍혔다');

    const alien = Object.assign({}, EXTRA, { fid: 'F9' });
    const h2 = doc(k, { extra: alien });
    assert.ok(!h2.includes('150,000,000'), k + ': 남의 기금 금액이 이 기금 서류에 찍혔다');
  });
});

test('자료를 아직 못 읽었어도 빈 서식은 그려 준다', () => {
  const h = doc('sub_assets', { extra: null });
  assert.match(h, /아직 못 읽었습니다/);
  assert.ok(h.includes('재 산 목 록 표'), '못 읽었다고 아무것도 안 보여 주면 답답하다');
});

test('서식 여섯 가지가 모두 배선돼 있다', () => {
  ['sub_oath', 'sub_contrib', 'sub_welfare_plan', 'sub_payment', 'sub_assets', 'sub_checklist']
    .forEach(k => assert.ok(SRC.includes("kind==='" + k + "'"), '자동 생성 갈래가 없다: ' + k));
  /* 장부가 필요한 것만 읽는다 — 서약서는 기금 정보만으로 그려진다 */
  const need = grabDecl('DOC_NEEDS_LEDGER');
  assert.ok(!need.includes('sub_oath'), '서약서는 장부가 필요 없다 — 괜히 읽으면 느려진다');
  ['sub_contrib', 'sub_welfare_plan', 'sub_assets', 'sub_checklist'].forEach(k =>
    assert.ok(need.includes(k), '장부를 읽어야 하는데 목록에서 빠졌다: ' + k));
});

/* ══════ 없는 칸을 보고 있던 자리들 ══════
   사업장 자료에 contribution 이라는 칸은 «없다» — SITE_FIELDS 는 contrib 다.
   그래서 지원신청서 초안의 출연금이 늘 비어 나갔고, 엑셀 신청서의 신청액에는
   사람이 적은 값 대신 «설립 출연금»이 들어갔다. 둘 다 공단으로 나가는 숫자다. */
test('없는 칸(contribution)을 더는 보지 않는다', () => {
  assert.ok(!/[sx]\.contribution\b/.test(SRC.replace(/\/\*[\s\S]*?\*\//g, '')),
    '사업장에 없는 칸을 아직 보고 있다 — 그 칸은 늘 비어 나간다');
  assert.match(grabFn('fillSubsidy'), /num\(sub\.request_amount\)/,
    '엑셀 신청서가 사람이 적은 신청액을 안 쓴다');
});

test('지원신청서 초안의 출연금이 채워진다', () => {
  const h = doc('subsidy');
  assert.ok(h.includes('150,000,000') && h.includes('50,000,000'),
    '사업장별 그 해 출연금이 안 들어갔다');
  assert.ok(h.includes('200,000,000'), '출연금 합계가 안 맞는다');
});

test('그 해 값이 없으면 기본 출연금으로 채운다', () => {
  const base = SITES.map(function (x) { return Object.assign({}, x, { contrib: '11000000' }); });
  const h = doc('subsidy', { sites: base, extra: Object.assign({}, EXTRA, { sy: {}, sites: base }) });
  assert.ok(h.includes('11,000,000'), '그 해 값이 없을 때 기본 출연금도 안 쓴다');
  assert.ok(h.includes('22,000,000'), '합계가 안 맞는다');
});

test('공단 엑셀 양식으로 채우는 길은 그대로 둔다', () => {
  /* 실제 제출은 공단이 해마다 내려 주는 엑셀로 한다 — HTML 초안은 «미리보기»다.
     엑셀 길을 없애면 해마다 바뀌는 양식을 따라갈 방법이 사라진다. */
  assert.match(SRC, /subsidy:\{key:'subsidy'/, '엑셀 양식 길이 사라졌다');
  assert.ok(SRC.includes('2025년 공동근로복지기금지원신청서'), '올해 공단 양식 이름이 사라졌다');
});
