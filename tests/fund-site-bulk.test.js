/* 참여사업장 일괄 채우기 · 직전년도 매출액
 *
 * 대표 지시 2026-09-05:
 *   「참여사업장의 사업자 및 담당자 정보등에 대해서도 기업정보함에서 당겨오기 할 수 있게 하고
 *    기업정보함의 정보를 여기서 찾아서 넣을 수 있게하고 한꺼번에 넣을 수 있게 해라.
 *    그리고 전년도 매출등에 대한 정보도 들어 갈 수 있게 해라.」
 *
 * ⚠ 이 저장소는 통째로 github.io 로 공개된다 — 실제 상호·번호 금지. 여기 자료는 전부 가짜다.
 *
 * 지켜야 하는 것
 *  ① 빈 칸만 채운다 — 사람이 손으로 넣은 값이 조용히 사라지면 안 된다
 *  ② 담당자는 «비어 있을 때»만 — 이미 적힌 사람을 다른 사람으로 바꿔치기하면 안 된다
 *  ③ 짝이 확실할 때만 — 후보가 둘 이상이면 그 사업장은 건너뛴다
 *  ④ 넣는 «순간» 서버 값을 다시 본다 — 미리보기와 적용 사이에 누가 채웠을 수 있다
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

/* ══════ 짝짓기 — 여기가 가장 위험하다 (남의 회사 번호가 박힌다) ══════ */
function matcher() {
  const box = {};
  new Function([grabFn('_digits'), grabFn('_cardFundKey'), grabFn('_siteCardMatch'),
    'this.f=_siteCardMatch;'].join('\n')).call(box);
  return box.f;
}

const IDX = [
  { _id: 'b1', k: 'biz', c: '가나다산업㈜', bz: '412-81-12595', ceo: '김대표', ad: '○○시 1' },
  { _id: 'b2', k: 'biz', c: '라마바물산', bz: '134-81-03880', ceo: '이대표', ad: '○○시 2' },
  { _id: 'b3', k: 'biz', c: '라마바물산산업', bz: '999-99-99999', ceo: '박대표' },
  { _id: 'k1', k: 'card', c: '가나다산업㈜', n: '김담당', ti: '과장', m: '010-0000-0000' }
];

test('사업자등록번호가 맞으면 그것으로 짝짓는다 — 표기가 달라도', () => {
  const m = matcher();
  assert.equal(m({ name: '엉뚱한 이름', biz_no: '4128112595' }, IDX)._id, 'b1',
    '구분기호가 없어도 숫자가 같으면 같은 회사다');
  assert.equal(m({ name: '', biz_no: '412-81-12595' }, IDX)._id, 'b1');
});

test('번호가 없으면 이름이 «완전히» 같을 때만', () => {
  const m = matcher();
  assert.equal(m({ name: '가나다산업(주)' }, IDX)._id, 'b1', '㈜·(주) 표기 차이는 넘어간다');
  /* 「라마바물산」과 「라마바물산산업」 — 부분일치를 쓰면 여기서 섞인다 */
  assert.equal(m({ name: '라마바물산' }, IDX)._id, 'b2', '완전히 같은 것을 골라야 한다');
  assert.equal(m({ name: '라마바' }, IDX), null, '부분일치로 남의 회사를 집으면 안 된다');
});

test('짝이 확실하지 않으면 건너뛴다', () => {
  const m = matcher();
  assert.equal(m({ name: '없는회사' }, IDX), null);
  assert.equal(m({ name: '가' }, IDX), null, '너무 짧은 이름은 아무거나 걸린다');
  assert.equal(m({ name: '' }, IDX), null);
  /* 같은 번호가 둘이면 사람이 볼 일이다 */
  const dup = IDX.concat([{ _id: 'b9', k: 'biz', c: '다른회사', bz: '412-81-12595' }]);
  assert.equal(m({ name: '아무', biz_no: '412-81-12595' }, dup), null, '번호가 겹치면 골라선 안 된다');
});

test('명함은 짝짓기에 안 쓴다 — 회사 번호는 등록증에만 있다', () => {
  const m = matcher();
  const onlyCard = [{ _id: 'k9', k: 'card', c: '명함만있는회사', n: '홍길동' }];
  assert.equal(m({ name: '명함만있는회사' }, onlyCard), null);
});

/* ══════ 채우는 칸 ══════ */
test('채우는 칸이 실제 사업장 칸과 맞는다', () => {
  const box = {};
  new Function([grabDecl('SITE_FIELDS'), grabDecl('CONTACT_FIELDS'),
    grabDecl('SITE_BULK'), grabDecl('SITE_BULK_C'), grabDecl('SITE_CARD_MAP'),
    'this.o={F:SITE_FIELDS,C:CONTACT_FIELDS,B:SITE_BULK,BC:SITE_BULK_C,M:SITE_CARD_MAP};'].join('\n')).call(box);
  const o = box.o;
  const sf = o.F.map(x => x[0]), cf = o.C.map(x => x[0]);
  o.B.forEach(b => {
    assert.ok(sf.includes(b[0]), 'SITE_FIELDS 에 없는 칸을 채우려 한다: ' + b[0]);
    assert.ok(o.M.some(m => m[1] === b[0]), '기업정보함에서 가져올 짝이 없다: ' + b[0]);
  });
  o.BC.forEach(b => {
    assert.ok(cf.includes(b[0]), 'CONTACT_FIELDS 에 없는 담당자 칸: ' + b[0]);
    assert.ok(o.M.some(m => m[1] === '_c_' + b[0]), '기업정보함에서 가져올 짝이 없다: ' + b[0]);
  });
  /* 상호는 «채우지» 않는다 — 이름이 비어 있으면 애초에 짝을 못 짓는다 */
  assert.ok(!o.B.some(b => b[0] === 'name'), '상호를 덮어쓰려 한다');
});

/* ══════ 직전년도 매출액 ══════ */
test('매출액 칸이 사업장·연도별 양쪽에 생겼다', () => {
  const box = {};
  new Function([grabDecl('SITE_FIELDS'), grabDecl('SY_COLS'), grabDecl('SITE_CARD_MAP'),
    'this.o={F:SITE_FIELDS,Y:SY_COLS,M:SITE_CARD_MAP};'].join('\n')).call(box);
  const o = box.o;
  assert.ok(o.F.some(x => x[0] === 'sales'), '사업장 기본에 매출 칸이 없다');
  assert.ok(o.Y.some(x => x[0] === 'sales'), '연도별 기록에 매출 칸이 없다 — 해마다 달라지는 값이다');
  /* 기업정보함의 sales(직전년도 매출액)를 sl 로 받아 온다 — CO_KEYMAP 과 짝이 맞아야 한다 */
  assert.ok(o.M.some(x => x[0] === 'sl' && x[1] === 'sales'), '기업정보함 매출을 안 가져온다');
  const km = grabDecl('CO_KEYMAP');
  assert.ok(km.includes("['sales','sl']"), "기업 상세의 sales 를 sl 로 안 받는다 — 짝이 끊긴다");
});

/* ══════ 빈 칸만 · 담당자는 비었을 때만 ══════ */
test('이미 적힌 값은 건드리지 않는다', () => {
  const b = grabFn('bulkSiteCards');
  assert.match(b, /if\(String\(site\[c\[0\]\]\|\|''\)\.trim\(\)\) return;/,
    '이미 적힌 칸을 덮어쓰려 한다');
  assert.match(b, /status!=='closed'/, '탈퇴한 사업장까지 채우려 한다');
});

test('담당자는 «비어 있을 때»만 넣는다 — 사람을 바꿔치기하지 않는다', () => {
  const b = grabFn('bulkSiteCards');
  assert.match(b, /_primaryContact\(site\)\.c/, '지금 담당자를 안 본다');
  assert.match(b, /!String\(pc\.name\|\|''\)\.trim\(\)&&!String\(pc\.mobile\|\|''\)\.trim\(\)/,
    '이름도 휴대폰도 없을 때만 넣어야 한다');
  /* 적용할 때도 다시 본다 — 미리보기 뒤에 누가 넣었을 수 있다 */
  const a = grabFn('applyBulkSites');
  assert.match(a, /if\(String\(\(pc\.c\|\|\{\}\)\.name\|\|''\)\.trim\(\)\|\|String\(\(pc\.c\|\|\{\}\)\.mobile\|\|''\)\.trim\(\)\)\{ skip\+\+; return; \}/,
    '적용 순간에 담당자를 다시 안 본다');
});

test('넣는 순간 서버 값을 다시 본다', () => {
  const a = grabFn('applyBulkSites');
  assert.match(a, /ref\(NS\+'\/sites\/'\+fid\)\.once\('value'\)/, '서버를 다시 안 읽는다');
  assert.match(a, /if\(String\(site\[p\.key\]\|\|''\)\.trim\(\)\)\{ skip\+\+; return; \}/,
    '그 사이 채워진 칸을 덮어쓴다');
  assert.match(a, /window\._sitePlan=null/, '계획을 안 비우면 두 번 눌려 두 번 들어간다');
  assert.match(a, /_audit\(fid,'참여사업장 일괄 채움'/, '기록에 안 남는다');
});

test('담당자를 넣을 때 기존 연락처 목록을 통째로 지우지 않는다', () => {
  const a = grabFn('applyBulkSites');
  assert.match(a, /var list=pc\.list\.slice\(\)/, '연락처가 여럿일 때 나머지가 날아간다');
  assert.match(a, /list\[pc\.idx\]=Object\.assign\(\{\},list\[pc\.idx\],item\)/, '');
  assert.match(a, /isPrimary:true/, '대표 연락처 표시를 안 단다');
});

/* ══════ 화면 배선 ══════ */
test('명부에 일괄 단추가 있고 ⓘ 가 붙어 있다', () => {
  assert.ok(SRC.includes('onclick="bulkSiteCards()"'), '일괄 채우기 단추가 없다');
  assert.ok(SRC.includes("'bulk.site':{t:"), 'ⓘ 설명이 등록되지 않았다');
  /* 하나씩 고르는 길(기업정보함에서 추가)도 그대로 있어야 한다 */
  assert.ok(SRC.includes("openCardPick('site')") || SRC.includes("openCardPick(\\'site\\')"),
    '하나씩 고르는 길이 사라졌다');
});
