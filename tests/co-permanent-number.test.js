/* 업체 고유번호 — 「머리 + 몸통」 (대표 지시 2026-09-03)
   ═══════════════════════════════════════════════════════════════════════════
   ★ 여기서 못 박는 것 — 이 셋이 무너지면 설계가 무너진다
     ① 몸통은 «절대» 안 바뀐다. 부여는 번호 없는 곳에만 준다.
     ② 검색·연결은 «몸통만» 본다. 머리가 바뀌어도 옛 번호로 찾힌다.
     ③ 같은 몸통이 두 곳에 붙지 않는다. 번호는 뒤로 가지 않는다.
   실행: node --test tests/co-permanent-number.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const O = require('../js/pu-ontology.js');

const R = path.join(__dirname, '..');
const erp = fs.readFileSync(path.join(R, 'pu-erp.html'), 'utf8');
const has = (re, why) => assert.ok(re.test(erp), why);   // 4MB 파일에 match 를 쓰면 실패할 때 다 쏟아진다

test('머리는 업무 종류에서 «다시 계산»된다 — 유형을 고치면 따라온다', () => {
  assert.equal(O.companyNumberHead({ typeCode:'자문' }), '자문');
  assert.equal(O.companyNumberHead({ typeCode:'급여' }), '급여');
  assert.equal(O.companyNumberHead({ typeCode:'노조' }), '노조');
  assert.equal(O.companyNumberHead({ typeCode:'기금' }), '기금');
  assert.equal(O.companyNumberHead({}), '미정', '유형이 비면 자문으로 «지어내지» 않는다');
  assert.equal(O.companyNumberHead({ typeCode:'없는유형' }), '미정');
});

test('사무대행 «전용» 등록만 머리가 대행이다 — 겸업은 유형이 이긴다', () => {
  assert.equal(O.companyNumberHead({ typeCode:'자문', status:'suboffice' }), '대행');
  assert.equal(O.companyNumberHead({ typeCode:'자문', isSuboffice:true }), '자문',
    '자문이면서 사무대행을 겸하는 곳은 머리가 자문이다 — 대행은 딱지로 따로 본다');
});

test('머리가 바뀌어도 몸통은 그대로다 — 그래서 연결이 안 끊긴다', () => {
  const co = { typeCode:'자문', puNo:10004 };
  assert.equal(O.formatCompanyNumber(co), '자문-10004');
  const after = Object.assign({}, co, { typeCode:'급여' });
  assert.equal(O.formatCompanyNumber(after), '급여-10004');
  assert.equal(O.companyNumberBody(co), O.companyNumberBody(after), '★ 몸통이 바뀌면 설계가 무너진다');
});

test('옛 번호로 찾아도 같은 몸통이 나온다 — 머리는 버린다', () => {
  assert.equal(O.parseCompanyNumber('자문-10004'), 10004);
  assert.equal(O.parseCompanyNumber('급여-10004'), 10004);
  assert.equal(O.parseCompanyNumber('10004'), 10004, '몸통만 적어도 찾힌다');
  assert.equal(O.parseCompanyNumber('대행-10004'), 10004);
});

test('사업자번호를 고유번호로 읽지 않는다', () => {
  /* 왜 검사하나: 처음에 「끝에 붙은 다섯 자리」로 뽑았더니 312-81-95374 의
     95374 를 고유번호로 읽어 엉뚱한 업체를 열었다(2026-09-03). */
  assert.equal(O.parseCompanyNumber('312-81-95374'), 0);
  assert.equal(O.parseCompanyNumber('3128195374'), 0);
  assert.equal(O.parseCompanyNumber('41512345670'), 0, '공단 관리번호(열한 자리)도 아니다');
  assert.equal(O.parseCompanyNumber('00123'), 0, '범위 밖은 아니다');
  assert.equal(O.parseCompanyNumber(''), 0);
});

test('부여 대상은 «번호 없는 곳»뿐이다 — 있는 번호를 다시 매기지 않는다', () => {
  const list = [
    { id:'a', puNo:10001, createdAt:'2020-01-01' },
    { id:'b', createdAt:'2019-01-01' },
    { id:'c', createdAt:'2021-01-01' },
    { id:'d', puNo:10002, createdAt:'2018-01-01' }
  ];
  assert.deepEqual(O.companyNumberTargets(list).map(x => x.id), ['b', 'c'],
    '★ 이미 번호가 있는 곳이 대상에 들어가면 번호가 바뀐다');
});

test('부여 순서는 오래된 것부터 — 다시 돌려도 같은 순서다', () => {
  const list = [
    { id:'c', createdAt:'2021-01-01', name:'다' },
    { id:'a', createdAt:'2019-01-01', name:'가' },
    { id:'b', createdAt:'2019-01-01', name:'나' }
  ];
  const once = O.companyNumberTargets(list).map(x => x.id);
  const twice = O.companyNumberTargets(list.slice().reverse()).map(x => x.id);
  assert.deepEqual(once, ['a', 'b', 'c']);
  assert.deepEqual(once, twice, '★ 넣는 순서에 따라 번호가 달라지면 안 된다');
});

test('만든 날이 없으면 계약시작일로 — 그것도 없으면 맨 뒤로', () => {
  const list = [
    { id:'x', contractStartDate:'2015-05-05' },
    { id:'y' },
    { id:'z', createdAt:'2016-01-01' }
  ];
  assert.deepEqual(O.companyNumberTargets(list).map(x => x.id), ['x', 'z', 'y']);
});

test('같은 몸통이 두 곳에 있으면 잡는다', () => {
  const bad = O.validateCompanyNumbers([
    { id:'a', puNo:10001, typeCode:'자문' },
    { id:'b', puNo:10001, typeCode:'급여' }
  ]);
  assert.equal(bad.ok, false);
  assert.equal(bad.errors.length, 1);
  assert.ok(/두 곳/.test(bad.errors[0].message));
  assert.equal(bad.errors[0].id, 'b');
});

test('쓸 수 없는 값과 범위 밖 번호를 잡는다', () => {
  assert.equal(O.companyNumberBody({ puNo:9999 }), 0, '10001 아래는 안 쓴다');
  assert.equal(O.companyNumberBody({ puNo:100000 }), 0, '99999 위는 안 쓴다');
  assert.equal(O.companyNumberBody({ puNo:10001.5 }), 0, '소수는 안 쓴다');
  assert.equal(O.companyNumberBody({ puNo:'10001' }), 10001, '엑셀에서 글자로 들어온 것은 읽어 준다');
  const r = O.validateCompanyNumbers([{ id:'a', puNo:'없음' }]);
  assert.equal(r.ok, false, '★ 쓸 수 없는 값이 조용히 넘어가면 안 된다');
});

test('머리가 적힌 것과 지금 유형이 어긋나면 경고로 남긴다 — 자동으로 안 고친다', () => {
  const r = O.validateCompanyNumbers([{ id:'a', puNo:10004, typeCode:'급여', puNoHead:'자문' }]);
  assert.equal(r.ok, true, '경고는 오류가 아니다 — 업무를 막지 않는다');
  assert.equal(r.warnings.length, 1);
  assert.ok(/이력/.test(r.warnings[0].message));
});

test('머리가 바뀌면 이력이 쌓이고, 안 바뀌면 아무 일도 없다', () => {
  const changed = O.companyNumberHistory({ typeCode:'급여', puNoHead:'자문', puNo:10004 }, '2026-09-03T01:00:00Z', 'P-001');
  assert.equal(changed.changed, true);
  assert.equal(changed.head, '급여');
  assert.equal(changed.puNoHistory[0].from, '자문');
  assert.equal(changed.puNoHistory[0].by, 'P-001');
  const same = O.companyNumberHistory({ typeCode:'급여', puNoHead:'급여', puNo:10004 });
  assert.equal(same.changed, false, '★ 안 바뀐 것에 이력을 쌓으면 이력이 쓰레기가 된다');
  const kept = O.companyNumberHistory({ typeCode:'급여', puNoHead:'자문', puNo:10004,
    puNoHistory:[{ head:'자문', from:'', at:'2020-01-01' }] });
  assert.equal(kept.puNoHistory.length, 2, '지난 이력을 지우지 않는다');
  assert.equal(kept.puNoHistory[1].head, '자문', '새 것이 맨 앞이다');
});

test('이력이 끝없이 자라지 않는다', () => {
  const long = Array.from({ length: 30 }, (_, i) => ({ head:'자문', from:'급여', at:'2020-01-' + String(i + 1).padStart(2, '0') }));
  const r = O.companyNumberHistory({ typeCode:'급여', puNoHead:'자문', puNo:10004, puNoHistory:long });
  assert.ok(r.puNoHistory.length <= 20, '이력은 스무 줄까지만 (레코드가 부풀지 않게)');
});

/* ── 화면이 규칙을 «실제로» 쓰는가 ─────────────────────────────── */

test('업체관리 검색이 고유번호를 몸통으로 찾는다', () => {
  has(/parseCompanyNumber\(query\)/, '★ 검색이 고유번호를 안 봅니다');
  has(/companyNumberBody\(co\)\s*===\s*qqNo/, '★ 검색이 «몸통»으로 대조하지 않습니다 — 머리가 바뀌면 안 찾아집니다');
  assert.ok(!/formatCompanyNumber\(co\)\s*(===|==|\.indexOf)/.test(erp),
    '★ 머리까지 붙인 글자로 대조하고 있습니다 — 유형이 바뀌는 날 조용히 안 찾아집니다');
});

test('업체관리 표에 번호 칸이 있고, 다른 표는 건드리지 않았다', () => {
  const heads = (erp.match(/key:'(h1n|a1n)'/g) || []).length;
  assert.equal(heads, 2, '★ 업체관리의 두 표(사무대행·일반)에만 머리줄이 있어야 합니다');
  /* ⚠ 여기서 보는 것은 «칸이 몇 곳인가»이지 «무엇을 그리는가»가 아니다.
     처음에는 formatCompanyNumber 글자를 그대로 박아 두었는데, 2026-09-05 에
     대표 지시로 표에는 몸통만 그리도록 바꾸자 «멀쩡한 개선» 때문에 이 검사가 깨졌다.
     그리는 내용은 tests/co-no-column.test.js 가 따로 지킨다 — 여기서는 자리만 센다. */
  const cells = (erp.match(/PuOntology\.(companyNumberBody|formatCompanyNumber)\(co\)\) \|\| '—'/g) || []).length;
  assert.equal(cells, 2, '★ 번호 칸이 두 곳이어야 합니다 — 같은 「#」 칸 꼴이 다른 표에도 있어 엉뚱한 표에 들어간 적이 있습니다');
});

test('부여 화면은 번호통을 서버에서 잠그고 뽑는다', () => {
  has(/function coNoTakeBlock/, '★ 번호통 함수가 없습니다');
  const from = erp.indexOf('function coNoTakeBlock');
  const body = erp.slice(from, erp.indexOf('function CoNumberPanel'));
  assert.ok(/\.transaction\(/.test(body), '★ 잠그지 않고 뽑으면 둘이 동시에 누를 때 겹칩니다');
  assert.ok(/COMPANY_NUMBER\.seqPath/.test(body), '★ 번호통 자리를 공통 규칙에서 가져와야 합니다');
  assert.ok(/committed/.test(body), '★ 잠금이 막혔는지 확인하지 않습니다');
  assert.ok(/companyNumberBody\(c\)/.test(body),
    '★ 이미 쓰인 가장 큰 번호를 안 보면 번호통이 뒤처져 겹칩니다');
});

test('부여는 이미 번호가 있는 곳을 건드리지 않고, 겹친 번호가 있으면 멈춘다', () => {
  const from = erp.indexOf('function CoNumberPanel');
  const body = erp.slice(from, erp.indexOf('/* ── 사업자번호 칸 점검'))
    .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  assert.ok(/companyNumberTargets\(/.test(body), '★ 부여 대상을 공통 규칙으로 고르지 않습니다');
  /* ⚠ 「어딘가에 checked.errors 가 있다」로 보면 안 된다 — 경고 상자에도 있어서
       단추의 잠금을 빼도 검사가 통과했다(2026-09-03 되돌림 시험에서 걸렸다).
     단추의 «disabled 식» 안에 있는지를 본다. */
  const off = /disabled:\s*([^,]+),/g;
  const guards = [...body.matchAll(off)].map(m => m[1]);
  assert.ok(guards.some(g => /checked\.errors\.length/.test(g) && /targets\.length/.test(g)),
    '★ 같은 번호가 두 곳에 있는데도 부여 단추가 눌립니다 — 그 상태로 부여하면 사고가 커집니다');
  assert.ok(!/puNo:\s*c\.puNo/.test(body), '★ 기존 번호를 다시 쓰고 있습니다');
});

test('업체관리의 저장 문이 머리 이력을 남긴다', () => {
  has(/function coStampNumberHead/, '★ 이력 함수가 없습니다');
  const from = erp.indexOf('function coStampNumberHead');
  const body = erp.slice(from, from + 900).replace(/\/\*[\s\S]*?\*\//g, ' ');
  assert.ok(/companyNumberHistory\(/.test(body), '★ 공통 규칙으로 이력을 만들지 않습니다');
  assert.ok(!/puNo:/.test(body), '★ 이력을 남기면서 몸통을 건드리고 있습니다');
  /* 저장 문 두 곳(한 건·일괄)이 모두 지나야 한다 */
  assert.ok(/coStampNumberHead\(item\);\s*var ok = dbUpsert\('companies'/.test(erp),
    '★ 한 건 저장이 이력 문을 안 지납니다');
  assert.ok(/list\.map\(coStampNumberHead\)/.test(erp), '★ 일괄 저장이 이력 문을 안 지납니다');
});

test('번호통 자리는 규칙에 «이름»이 있고 뒤로 못 간다', () => {
  const rules = JSON.parse(fs.readFileSync(path.join(R, 'docs', 'firebase-rules-전체-적용본.json'), 'utf8'));
  const seq = rules.rules.data.co_no_seq;
  assert.ok(seq, '★ 번호통이 규칙에 이름 없이 열려 있습니다');
  assert.ok(/newData\.val\(\) > data\.val\(\)/.test(seq['.validate'] || ''),
    '★ 번호가 «뒤로 갈 수» 있습니다 — 되돌려 쓰면 옛 서류가 다른 업체를 가리킵니다');
  assert.ok(/isNumber/.test(seq['.validate'] || ''), '숫자만 받아야 합니다');
  assert.ok(String(seq['.write'] || '').length > 0, '쓰기 권한이 비어 있습니다');
});

test('공통 규칙에 머리 다섯과 「미정」이 다 있다', () => {
  ['자문', '급여', '노조', '기금', '대행', '미정'].forEach(k => {
    assert.ok(O.COMPANY_NUMBER_HEADS[k], k + ': 머리가 빠졌습니다');
    assert.ok(O.COMPANY_NUMBER_HEADS[k].length > 2, k + ': 무슨 뜻인지 적으세요');
  });
  assert.equal(O.COMPANY_NUMBER.digits, 5);
  assert.equal(O.COMPANY_NUMBER.min, 10001);
});
