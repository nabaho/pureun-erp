'use strict';
/* 👷 푸른이알피가 근로자 정보함에서 «당겨온다» (대표 지시 2026-09-02)

   "일반근로자들의 계약서, CMS 등록 개인 주민등록증 및 신분증 기타 위임장등을 스켄해서
    기업정보함등에 보관 … 스켄후 정보 저장후 **푸른이알피에 연결해서 정보를 당겨와야 한다**"

   ■ 무엇이 끊겨 있었나
   사진첩 → 갈래 가리기 → 민감 처리 → 근로자 정보함까지는 2026-09-01 에 이어졌다.
   끊긴 곳은 **마지막 한 칸** — 사건·계약의 근로자 명부가 그 사람들을 못 당겨왔다.
   서른 명 집단 진정이면 서류가 다 들어와 있는데도 이름을 서른 번 손으로 쳤다.

   ■ 이 검사가 지키는 것
   ① 사람 열쇠(이름+회사)가 **세 곳에서 한 글자도 같다** — 어긋나면 남의 서류가 붙는다
   ② 회사를 모르면 **아무도 안 내놓는다** — 전 직원 서류를 펼쳐 보이면 그것이 사고다
   ③ 당겨오는 것은 **이름뿐** — 주민번호·주소·연락처·계좌는 빈칸으로 들어간다
   ④ 이미 명부에 있는 사람은 **못 고른다**
   ⑤ 서류 목록을 명부에 **담지 않는다**(볼 때 읽는다)

   실행: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { cutFn } = require('./cut-fn');

/* ⚠ 순수 로직은 vm 안에서 돌아 «다른 realm» 의 배열을 돌려준다. 그대로 견주면
   assert 가 「모양은 같은데 같은 것이 아니다」로 운다 — 이 자리로 옮겨 견준다. */
const A = x => Array.prototype.slice.call(x);

const R = path.join(__dirname, '..');
const erp = fs.readFileSync(path.join(R, 'pu-erp.html'), 'utf8');
const cards = fs.readFileSync(path.join(R, 'pu-cards.html'), 'utf8');
const docFile = fs.readFileSync(path.join(R, 'js', 'pu-doc-file.js'), 'utf8');

/* ══════ 순수 로직을 원본 그대로 떼어 온다 ══════ */
function erpCtx() {
  const ctx = { String, Object, Number, Math, Date };
  vm.createContext(ctx);
  vm.runInContext([
    (erp.match(/^var WK_DOC_LABEL = \{[\s\S]*?\};/m) || [''])[0],
    (erp.match(/^var WK_WANT = \[[^\]]*\];/m) || [''])[0],
    cutFn(erp, 'function erpWkSafe('),
    cutFn(erp, 'function erpWkNorm('),
    cutFn(erp, 'function erpWkKey('),
    cutFn(erp, 'function erpWkDocsOf('),
    cutFn(erp, 'function erpWkCandidates('),
    cutFn(erp, 'function erpWkToWorkers(')
  ].join('\n'), ctx);
  return ctx;
}
const E = erpCtx();

/* 기업정보함(pu-cards)의 열쇠 규칙 */
function cardsKey() {
  const ctx = { String };
  vm.createContext(ctx);
  vm.runInContext([
    (cards.match(/^\s*const _norm = [^\n]*;/m) || [''])[0].replace(/^\s*const /, 'var '),
    cutFn(cards, 'function wkSafe('),
    cutFn(cards, 'function wkKeyOf(')
  ].join('\n'), ctx);
  return ctx.wkKeyOf;
}
/* 사진첩이 쓰는 저장 층(js/pu-doc-file.js)의 열쇠 규칙 */
function docFileKey() {
  const ctx = { String };
  vm.createContext(ctx);
  vm.runInContext([
    cutFn(docFile, 'function wkSafe('),
    cutFn(docFile, 'function wkCompanyNorm('),
    cutFn(docFile, 'function workerKey(')
  ].join('\n'), ctx);
  return ctx.workerKey;
}

/* 표본 — 「(주)마바텍라인」에서 서류가 들어온 세 사람 */
function sample() {
  return {
    '마바텍라인__김철수': {
      name: '김철수', company: '(주)마바텍라인',
      docs: {
        '2026_a1': { kind: 'idcard', docName: '주민등록증', at: 300, photo: { year: '2026', id: 'a1', owner: 'u1' } },
        '2026_a2': { kind: 'mandate', docName: '위임장', at: 200, photo: { year: '2026', id: 'a2', owner: 'u1' } },
        '2026_a3': { kind: 'consent', docName: '개인정보 동의서', at: 100, photo: { year: '2026', id: 'a3', owner: 'u1' } }
      }
    },
    '마바텍라인__이영희': {
      name: '이영희', company: '(주)마바텍라인',
      docs: {
        '2026_b1': { kind: 'idcard', docName: '운전면허증', at: 500, photo: { year: '2026', id: 'b1', owner: 'u1' } },
        '2026_b2': { kind: 'timesheet', docName: '8월 근태표', at: 400, photo: { year: '2026', id: 'b2', owner: 'u2' } }
      }
    },
    '가나김산업__김철수': {           /* 이름이 같은 «남남» — 회사가 다르다 */
      name: '김철수', company: '가나김산업',
      docs: { '2026_c1': { kind: 'idcard', docName: '주민등록증', at: 900, photo: { year: '2026', id: 'c1', owner: 'u1' } } }
    }
  };
}

/* ══════ ① 사람 열쇠가 세 곳에서 같다 ══════ */

test('★★★ 사람 열쇠가 «세 곳에서 한 글자도 같다» — 어긋나면 남의 서류가 붙는다', () => {
  const ck = cardsKey(), dk = docFileKey();
  const names = [
    ['김철수', '(주)마바텍라인'], ['김철수', '마바텍 라인'], ['이영희', '주식회사 가나김산업'],
    ['홍 길동', '㈜푸른'], ['최영도', '가.나.다'], ['김수', ''], ['', '(주)마바텍라인'],
    ['홍길동', 'ABC Corp'], ['서.민', '한/글']
  ];
  names.forEach(([n, c]) => {
    const a = E.erpWkKey(n, c), b = ck(n, c), d = dk(n, c);
    assert.equal(a, b, '★★★ 푸른이알피와 기업정보함의 열쇠가 다릅니다 (' + n + '·' + c + '): ' + a + ' vs ' + b);
    assert.equal(a, d, '★★★ 푸른이알피와 사진첩 저장 층의 열쇠가 다릅니다 (' + n + '·' + c + '): ' + a + ' vs ' + d);
  });
});

test('★★ 이름이 같아도 회사가 다르면 «다른 사람»이다 — 대표 결정 2026-09-01 ①', () => {
  assert.notEqual(E.erpWkKey('김철수', '마바텍라인'), E.erpWkKey('김철수', '가나김산업'),
    '★★ 동명이인이 한 사람으로 묶이면 사건 서류가 남에게 갑니다');
  assert.equal(E.erpWkKey('김철수', ''), '', '★ 회사가 없으면 열쇠를 만들지 않습니다');
  assert.equal(E.erpWkKey('', '마바텍라인'), '', '★ 이름이 없으면 열쇠를 만들지 않습니다');
});

/* ══════ ② 회사를 모르면 아무도 안 내놓는다 ══════ */

test('★★★ 회사를 안 쳤으면 «빈손»이다 — 전 직원 서류를 펼쳐 보이면 그것이 사고다', () => {
  const info = sample();
  assert.deepEqual(A(E.erpWkCandidates(info, '', [])), [],
    '★★★ 업체 없이 사람이 나오면 아무 사건 창에서나 전 직원 신분증 목록이 보입니다');
  assert.deepEqual(A(E.erpWkCandidates(info, '   ', [])), []);
});

test('★★ 그 업체 사람만 나온다 — 이름이 같은 남의 회사 사람은 안 섞인다', () => {
  const rows = E.erpWkCandidates(sample(), '(주)마바텍라인', []);
  assert.deepEqual(A(rows.map(r => r.name)).sort(), ['김철수', '이영희'],
    '★★ 「가나김산업 김철수」이 섞였습니다 — 남의 회사 사람입니다');
});

test('★ 회사 표기가 달라도 같은 회사로 본다 — 「(주)마바텍라인」과 「마바텍 라인」', () => {
  const rows = E.erpWkCandidates(sample(), '마바텍 라인', []);
  assert.equal(rows.length, 2,
    '★ 표기가 조금 달라 목록이 통째로 비면 「가져오기」의 뜻이 없습니다');
});

/* ══════ ③ 이름만 당긴다 ══════ */

test('★★★ 당겨오는 것은 «이름뿐» — 주민번호·주소·연락처·계좌는 빈칸이다', () => {
  const picked = [{ name: '김철수', company: '(주)마바텍라인' }];
  ['case', 'contract'].forEach(shape => {
    const ws = E.erpWkToWorkers(picked, shape, 0);
    assert.equal(ws.length, 1);
    const w = ws[0];
    assert.equal(w.name, '김철수', '★ 이름은 와야 합니다');
    Object.keys(w).forEach(k => {
      if (k === 'name' || k === 'id' || k === 'isPrimary') return;
      assert.equal(w[k], '',
        '★★★ 「' + k + '」에 값이 들어갔습니다(' + shape + ') — 근로자 서류에서 읽지 않는 것이라\n' +
        '  어딘가에서 지어낸 값입니다. 채워진 것처럼 보이면 사람이 확인을 건너뜁니다');
    });
  });
});

test('★★ 두 명부의 «칸 이름»이 각자 제 것이다 — 틀리면 넣어도 화면에 안 보인다', () => {
  const p = [{ name: '김철수' }];
  const c = E.erpWkToWorkers(p, 'case', 0)[0];
  const t = E.erpWkToWorkers(p, 'contract', 0)[0];
  /* 사건 창은 addr·pos·account, 계약 창은 address·position — 서식이 다르다 */
  assert.ok('addr' in c && 'pos' in c && 'account' in c,
    '★★ 사건 명부 칸(addr·pos·account)이 없습니다 — 넣어도 빈 줄로 보입니다');
  assert.ok('address' in t && 'position' in t && 'hireDate' in t,
    '★★ 계약 명부 칸(address·position·hireDate)이 없습니다');
});

test('★ 열쇠(id)가 사람마다 다르다 — 같으면 화면이 한 줄로 겹친다', () => {
  const many = ['가', '나', '다', '라', '마'].map(n => ({ name: n }));
  const ids = E.erpWkToWorkers(many, 'case', 0).map(w => w.id);
  assert.equal(new Set(ids).size, ids.length, '★ 같은 열쇠가 나왔습니다: ' + ids.join(','));
});

test('★ 첫 사람만 «대표»가 된다 — 이미 있는 사람이 있으면 아무도 대표가 아니다', () => {
  const p = [{ name: '가' }, { name: '나' }];
  const first = E.erpWkToWorkers(p, 'contract', 0);
  assert.equal(first[0].isPrimary, true);
  assert.equal(first[1].isPrimary, false, '★ 대표가 둘이면 서식이 누구를 쓸지 모릅니다');
  const later = E.erpWkToWorkers(p, 'contract', 3);
  assert.equal(later[0].isPrimary, false,
    '★ 이미 세 명이 있는데 새로 넣은 사람이 대표가 되면 서식의 이름이 바뀝니다');
});

/* ══════ ④ 이미 있는 사람 ══════ */

test('★★ 이미 명부에 있는 사람은 «못 고른다» — 두 번 들어가면 명부가 겹친다', () => {
  const rows = E.erpWkCandidates(sample(), '(주)마바텍라인', [{ name: '김철수' }]);
  const kim = rows.filter(r => r.name === '김철수')[0];
  assert.ok(kim, '★★ 이미 있는 사람을 목록에서 «빼면» 안 됩니다 — 「내가 넣었나」를 알 수 없습니다');
  assert.equal(kim.already, true, '★★ 이미 있다는 표시가 없습니다');
  assert.equal(rows.filter(r => r.name === '이영희')[0].already, false);
});

/* ══════ ⑤ 가진 서류 · 빠진 서류 ══════ */

test('★★ 빠진 서류를 짚어 준다 — 서른 명 중 누가 안 냈는지는 사람이 세면 틀린다', () => {
  /* ⚠ 「받아야 할 서류」 목록(WK_WANT)은 늘어난다(2026-09-02 에 근로계약서가 늘었다).
     그래서 목록을 통째로 박지 «않는다» — 안 낸 것은 짚고, 낸 것은 안 짚는지만 본다. */
  const d = E.erpWkDocsOf(sample(), '이영희', '(주)마바텍라인');
  assert.ok(A(d.missing).indexOf('mandate') >= 0 && A(d.missing).indexOf('consent') >= 0,
    '★★ 위임장·동의서가 빠진 것을 안 짚어 줍니다 — 한 장이 빠지면 그 사람 건을 못 냅니다');
  assert.ok(A(d.missing).indexOf('idcard') < 0,
    '★★ 이미 낸 신분증을 「없음」이라고 합니다 — 그 표시를 아무도 안 믿게 됩니다');
  const full = E.erpWkDocsOf(sample(), '김철수', '(주)마바텍라인');
  ['idcard', 'mandate', 'consent'].forEach(function (k) {
    assert.ok(A(full.missing).indexOf(k) < 0,
      '★ 낸 서류(' + k + ')를 「없음」이라고 합니다');
  });
});

test('★ 서류가 하나도 없는 사람에게는 «없음»을 안 그린다 — 온통 경고가 된다', () => {
  const d = E.erpWkDocsOf({}, '없는사람', '(주)마바텍라인');
  assert.deepEqual(A(d.docs), []);
  assert.deepEqual(A(d.missing), [], '★ 아직 아무것도 안 받은 사람에게 셋이 다 빨갛게 뜹니다');
});

test('★ 최근에 낸 서류가 위다 — 지금 하는 사건의 서류가 그것이다', () => {
  const d = E.erpWkDocsOf(sample(), '김철수', '(주)마바텍라인');
  const ats = d.docs.map(x => x.at);
  assert.deepEqual(A(ats), A(ats).sort((a, b) => b - a), '★ 서류 차례가 뒤섞였습니다');
});

test('★ 서류에 «원본을 찾을 것»이 딸려 온다 — 해·번호·주인 셋이 다 있어야 열린다', () => {
  const d = E.erpWkDocsOf(sample(), '김철수', '(주)마바텍라인');
  d.docs.forEach(doc => {
    assert.ok(doc.photo && doc.photo.id && doc.photo.year,
      '★ 사진을 가리키는 값이 빠졌습니다 — 「원본 보기」가 빈손이 됩니다');
    assert.ok('owner' in doc.photo,
      '★ 주인이 빠지면 남이 올린 서류의 원본을 못 엽니다(2026-08-27 과 같은 자리)');
  });
});

/* ══════ 화면이 그 규칙을 «실제로» 쓰는가 ══════ */

test('★★ 두 창이 모두 근로자 정보함을 «당겨온다» — 함수만 있고 안 부르면 소용없다', () => {
  assert.ok(erp.indexOf('WorkerDocPickerModal') > 0, '★★ 고르는 창이 없습니다');
  /* 사건 창(f.workers)과 계약 창(f.company.workers) 둘 다 */
  assert.match(erp, /erpWkToWorkers\(list, 'case'/, '★★ 사건 창이 명부에 안 넣습니다');
  assert.match(erp, /erpWkToWorkers\(list, 'contract'/, '★★ 계약 창이 명부에 안 넣습니다');
  /* 창을 여는 단추가 실제로 달려 있는가 */
  const opens = (erp.match(/setWkPickOpen\(true\)|setCtWkPickOpen\(true\)/g) || []).length;
  assert.ok(opens >= 2, '★★ 창을 여는 자리가 ' + opens + '곳입니다 — 두 창에 다 달려야 합니다');
});

test('★★ 명부 줄에 서류 딱지가 «붙는다» — 이것이 사건 중에 가장 자주 보는 것이다', () => {
  const n = (erp.match(/erpWkRowChips\(/g) || []).length;
  assert.ok(n >= 3, '★★ 딱지를 그리는 자리가 ' + n + '곳뿐입니다 — 함수 하나와 두 명부에 다 있어야 합니다');
});

test('★★★ 서류 목록을 명부에 «담지 않는다» — 담으면 지운 서류가 계속 「있음」으로 보인다', () => {
  const w = E.erpWkToWorkers([{ name: '김철수', docs: [{ kind: 'idcard' }], has: { idcard: 1 } }], 'case', 0)[0];
  assert.ok(!('docs' in w) && !('has' in w),
    '★★★ 명부 줄에 서류가 베껴졌습니다 — 사진첩에서 지워도 계속 「있음」으로 남습니다');
});

test('★★ 근로자 정보함을 «구독하지 않는다» — 늘 받아 두면 그것이 그대로 요금이다', () => {
  const fn = cutFn(erp, 'function erpLoadWorkerInfo(');
  assert.match(fn, /\.once\('value'\)/, '★★ once 가 아니면 서류 한 장마다 사람 전부가 다시 내려갑니다');
  assert.ok(!/\.on\(['"]value/.test(fn), '★★ 구독하고 있습니다');
  /* 한 번 읽으면 기억한다 — 창을 여닫을 때마다 다시 읽으면 같은 일이다 */
  assert.match(fn, /if\(_erpWkInfo\)/, '★ 읽어 둔 것을 안 쓰고 매번 다시 읽습니다');
});

test('★★ 못 읽어도 창이 «죽지 않는다» — 빈손으로 열고 없다고 말한다', () => {
  const fn = cutFn(erp, 'function erpLoadWorkerInfo(');
  assert.match(fn, /catch\(function\(e\)\{[\s\S]*cb && cb\(\{\}\)/,
    '★★ 못 읽었을 때 아무 말도 없으면 「읽는 중…」에서 영영 멎습니다');
});

test('★★ 무엇이 «안 오는지»를 창이 먼저 말한다 — 겪게 하면 이 길을 안 믿는다', () => {
  const fn = cutFn(erp, 'function WorkerDocPickerModal(');
  assert.match(fn, /주민번호·주소·연락처는 근로자 서류에서 읽지 않습니다/,
    '★★ 넣고 나서 「주민번호가 왜 비었지」를 겪게 하면 안 됩니다');
});

test('★ 원본은 «고른 뒤에» 받는다 — 목록을 열자마자 다 받으면 그것이 요금이다', () => {
  const fn = cutFn(erp, 'function WorkerDocPickerModal(');
  assert.ok(fn.indexOf('loadFullDetail') < 0,
    '★ 고르는 창이 원본을 받고 있습니다 — 서른 명 서류를 통째로 내려받습니다');
  const view = cutFn(erp, 'function WorkerDocViewModal(');
  assert.match(view, /PuPhotoStore\.loadFullDetail\(/,
    '★ 원본 보기가 저장 층을 안 거치면 민감 서류가 안 열립니다');
});
