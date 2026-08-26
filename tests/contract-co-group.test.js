/* 계약창 의뢰인 목록 — 「한 회사 = 한 줄」로 묶기 (2026-08-26 대표 승인, 안 B)
 *
 * 대표가 겪은 일: 「청화」를 치면 천안청화공사 / 합자회사 천안청화공사 / (자)천안청화공사가
 * 세 줄로 뜨고, 기업정보함 줄을 고르니 «사업자번호가 안 들어왔다» — 그 번호는 업체 줄에만 있었다.
 *
 * 여기서 못 박는 것은 «규칙»이다. 특히 «안 묶는» 규칙 둘이 중요하다 —
 * 남의 회사를 합치면 엉뚱한 곳에 계약이 붙는다.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8');

/* 주석을 걷어낸 사본 — 「주석에 그 말이 있어서」 통과하는 일을 막는다. */
function bare(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}
/* 함수·블록을 «중괄호 세어» 자른다 — 글자 수로 자르면 옆 블록을 넘본다. */
function cutBlock(src, header) {
  const i = src.indexOf(header);
  assert.ok(i >= 0, '못 찾음: ' + header);
  let j = src.indexOf('{', i);
  assert.ok(j >= 0, '여는 괄호 없음: ' + header);
  let d = 0;
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); }
  }
  throw new Error('닫는 괄호 없음: ' + header);
}
function cutRange(src, from, to) {
  const a = src.indexOf(from);
  assert.ok(a >= 0, '못 찾음: ' + from);
  const b = src.indexOf(to, a);
  assert.ok(b >= 0, '못 찾음: ' + to);
  return src.slice(a, b + to.length);
}

/* ── 묶는 규칙을 «실제로 돌려» 본다 ── */
function makeCtx() {
  const ctx = { console, String, Object, Array, window: {} };
  vm.createContext(ctx);
  vm.runInContext(cutRange(SRC, 'var PC_CORP_TOKENS =', '\n'), ctx);
  vm.runInContext(cutBlock(SRC, 'function pcNormCo('), ctx);
  vm.runInContext(cutRange(SRC, 'var ERP_WORK_SRC =',
    'try { window.erpGroupCoHits = erpGroupCoHits; } catch(_){ }'), ctx);
  return ctx;
}
const G = makeCtx();
const group = (rows) => G.erpGroupCoHits(rows);

/* 줄 만들기 도우미 */
const co = (name, bizNo) => ({ label: name, bizNo: bizNo || '', source: '업체' });
const ct = (name, bizNo, date) => ({ label: name, bizNo: bizNo || '', source: '계약', date: date || '' });
const cs = (name, bizNo) => ({ label: name, bizNo: bizNo || '', source: '컨설팅' });
const pc = (name, bizNo, cards) => ({
  label: name, bizNo: bizNo || '', source: '기업정보함',
  _pc: { name: name, bizNo: bizNo || '', contacts: new Array(cards || 0).fill({}) }
});
const person = (who, coName) => ({
  label: who, bizNo: '', source: '명함',
  _pc: { name: coName, contacts: [{}], person: { name: who, title: '', isCeo: false } }
});

test('★ 대표가 겪은 그 경우 — 표기가 다른 세 줄이 한 줄이 된다', () => {
  const gs = group([
    co('천안청화공사', '612-81-08893'),
    pc('합자회사 천안청화공사', '', 3),
    pc('(자)천안청화공사', '', 1)
  ]);
  assert.strictEqual(gs.length, 1, '한 회사여야 한다');
  assert.strictEqual(gs[0].bizNo, '612-81-08893', '번호는 가지고 있는 줄에서 온다');
  assert.strictEqual(gs[0].name, '천안청화공사', '업체관리 이름을 앞세운다');
  assert.strictEqual(gs[0].rows.length, 3);
  assert.ok(gs[0].hasMaster && gs[0].hasCards);
});

test('★ 안 묶는 규칙 ① — 사업자번호가 다르면 이름이 같아도 절대 안 묶는다', () => {
  const gs = group([co('한빛산업', '111-11-11111'), co('한빛산업', '222-22-22222')]);
  assert.strictEqual(gs.length, 2, '번호가 다르면 다른 회사다');
  const nums = gs.map((x) => x.bizNo).sort().join(',');
  assert.strictEqual(nums, '111-11-11111,222-22-22222');
});

test('★ 안 묶는 규칙 ② — 번호가 둘 이상이면 번호 없는 줄은 «따로» 둔다', () => {
  const gs = group([
    co('한빛산업', '111-11-11111'),
    co('한빛산업', '222-22-22222'),
    pc('한빛산업', '', 2)
  ]);
  assert.strictEqual(gs.length, 3, '어느 쪽인지 모르면 찍어서 붙이지 않는다');
  const orphan = gs.find((x) => !x.bizNo);
  assert.ok(orphan, '번호 없는 무리가 따로 남아야 한다');
  assert.strictEqual(orphan.rows.length, 1);
});

test('번호 없는 줄은 그 이름에 번호가 «하나뿐»일 때 붙는다', () => {
  const gs = group([co('한빛산업', '111-11-11111'), pc('한빛산업', '', 2)]);
  assert.strictEqual(gs.length, 1);
  assert.strictEqual(gs[0].bizNo, '111-11-11111');
});

test('이름이 달라도 번호가 같으면 묶는다', () => {
  const gs = group([co('한빛산업', '111-11-11111'), ct('주식회사 완전다른이름', '111-11-11111')]);
  assert.strictEqual(gs.length, 1, '번호가 같으면 같은 회사다');
  assert.strictEqual(gs[0].rows.length, 2);
});

test('★ (자) 도 법인 표기로 본다 — 합자회사의 줄임말이다', () => {
  assert.strictEqual(G.pcNormCo('(자)천안청화공사'), '천안청화공사');
  assert.strictEqual(G.pcNormCo('합자회사 천안청화공사'), '천안청화공사');
  assert.strictEqual(G.pcNormCo('자애병원'), '자애병원', '이름 속 「자」는 지우면 안 된다');
});

test('★ 사람 줄은 «사람 이름»이 아니라 그 사람의 회사로 묶인다', () => {
  const gs = group([co('천안청화공사', '612-81-08893'), person('김상호', '천안청화공사')]);
  assert.strictEqual(gs.length, 1, '사람 이름으로 따로 떨어지면 안 된다');
  assert.strictEqual(gs[0].name, '천안청화공사');
});

test('정보 줄과 사업현황 줄을 갈라 담는다', () => {
  const gs = group([
    co('가나상사', '333-33-33333'),
    pc('가나상사', '333-33-33333', 4),
    ct('가나상사', '333-33-33333', '2025-03-11'),
    cs('가나상사', '333-33-33333')
  ]);
  assert.strictEqual(gs.length, 1);
  const g = gs[0];
  assert.strictEqual(g.info.length, 2, '업체·기업정보함은 정보 쪽');
  assert.strictEqual(g.work.length, 2, '계약·컨설팅은 사업현황 쪽');
  assert.strictEqual(g.counts['계약'], 1);
  assert.strictEqual(g.counts['컨설팅'], 1);
  assert.strictEqual(g.cardN, 4, '명함 장수');
});

test('묶은 «다른 이름»을 모두 들고 있다 (화면에 적어 보이려고)', () => {
  const g = group([
    co('천안청화공사', '612-81-08893'),
    pc('합자회사 천안청화공사', '', 3),
    pc('(자)천안청화공사', '', 1)
  ])[0];
  const others = g.aliases.filter((n) => n !== g.name).sort();
  assert.strictEqual(others.join(','), '(자)천안청화공사,합자회사 천안청화공사');
});

test('빈 목록·이상한 값에도 죽지 않는다', () => {
  assert.deepStrictEqual(Array.from(group([])), []);
  assert.deepStrictEqual(Array.from(group(null)), []);
  assert.strictEqual(group([{ label: '', bizNo: '', source: '업체' }]).length, 1);
});

/* ── 화면이 그 규칙을 «쓰는지» ── */
test('★ 여섯에서 자르는 것은 줄이 아니라 «회사»다', () => {
  const b = bare(SRC);
  assert.ok(b.indexOf('setAutoResults(erpGroupCoHits(res).slice(0,6))') >= 0,
    '묶은 뒤에 잘라야 같은 회사가 자리를 셋 먹지 않는다');
  assert.strictEqual(b.split('setAutoResults(res.slice(0,6))').length - 1, 0,
    '묶지 않고 자르던 옛 길이 남아 있다');
});

test('★ 엔터도 그룹 채우기를 부른다 (마우스와 손이 갈리면 안 된다)', () => {
  const b = bare(SRC);
  /* 파일 곳곳에 엔터 처리가 있다 — «이 목록의» 엔터만 본다. */
  const kd = b.indexOf("if(autoResults.length === 0) return;\r\n            if(e.key === 'ArrowDown')");
  const kd2 = kd >= 0 ? kd : b.indexOf("if(autoResults.length === 0) return;\n            if(e.key === 'ArrowDown')");
  assert.ok(kd2 >= 0, '의뢰인 칸의 키 처리를 못 찾았다');
  const i = b.indexOf("e.key === 'Enter'", kd2);
  assert.ok(i >= 0 && i - kd2 < 600, '그 안에서 엔터 처리를 못 찾았다');
  const near = b.slice(i, i + 240);
  assert.ok(near.indexOf('applyCoGroup(autoResults[autoIdx])') >= 0, '엔터가 그룹 채우기를 안 부른다');
  assert.ok(near.indexOf('onSelectPastCompany(') < 0, '엔터가 아직 옛 손을 부른다');
});

test('★ 「사업현황 보기」는 «보기만» 한다 — 회사 칸을 채우지 않는다', () => {
  const b = bare(SRC);
  const i = b.indexOf('사업현황 보기 (');
  assert.ok(i >= 0, '사업현황 단추를 못 찾았다');
  /* 그 단추의 onMouseDown 을 앞쪽에서 찾아 본다 */
  const btn = b.lastIndexOf('onMouseDown:function(e){', i);
  assert.ok(btn >= 0 && btn < i, '단추 손을 못 찾았다');
  const body = b.slice(btn, i);
  assert.ok(body.indexOf('setWorkOpen(') >= 0, '펼치기만 해야 한다');
  assert.ok(body.indexOf('applyCoGroup(') < 0, '사업현황 단추가 회사 칸을 채우고 있다');
});

test('★ 채울 때 이미 적힌 칸은 안 덮는다', () => {
  const fn = bare(cutBlock(SRC, 'function applyCoGroup('));
  assert.ok(/have\.trim\(\)\s*!==\s*''\s*\)\s*return/.test(fn),
    '이미 값이 있으면 건너뛰는 곳이 없다 — 손으로 고친 값이 덮인다');
  assert.ok(fn.indexOf('erpHitPri(a) - erpHitPri(b)') >= 0,
    '신뢰 순서(업체관리 → 기업정보함 → 계약)로 채워야 한다');
  assert.ok(fn.indexOf('mergeCompanyContacts(') >= 0, '담당자는 지우지 말고 «더해야» 한다');
});

test('★ 사업자번호가 채우는 칸 목록에 들어 있다 (대표가 겪은 바로 그 칸)', () => {
  const b = bare(SRC);
  const i = b.indexOf('var ERP_CO_FILL_KEYS');
  assert.ok(i >= 0, '채울 칸 목록이 없다');
  const list = b.slice(i, b.indexOf(';', i));
  ['bizNo', 'ceo', 'address', 'bizType', 'companyId'].forEach((k) => {
    assert.ok(list.indexOf("'" + k + "'") >= 0, k + ' 이 채울 칸 목록에서 빠졌다');
  });
});

test('★ 「사진까지 가져옵니다」라는 옛말이 사라졌다 (사진은 2026-08-09에 걷어냈다)', () => {
  assert.strictEqual(SRC.indexOf('누르면 사진까지 가져옵니다'), -1,
    '동작은 없는데 안내만 남아 화면이 거짓말을 한다');
});

test('묶은 다른 이름을 화면에 적는다', () => {
  const b = bare(SRC);
  assert.ok(b.indexOf('같은 회사로 봄 → ') >= 0, '무엇을 묶었는지 안 보여 주면 틀려도 모른다');
});
