/* CMS 일괄이체 — 예전 이름으로 찾기 · 이어 붙일 때 기억 · 해지 업체는 종류를 묻기
 * (2026-08-26 대표 답: 「예전 이름 기억」 / 「해지된 경우 물어볼 것 —
 *  대부분 자문료이지만 컨설팅 미납 또는 사건 미납으로 들어오는 경우 있음」)
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8');
function bare(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}
function cutBlock(src, header) {
  const i = src.indexOf(header);
  assert.ok(i >= 0, '못 찾음: ' + header);
  let j = src.indexOf('{', i), d = 0;
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); }
  }
  throw new Error('닫는 괄호 없음: ' + header);
}
const B = bare(SRC);

/* apply() 는 파일에 둘이다 — CMS 나누기의 것만 잘라 온다(그 안에 «이미 입금» 세는 줄이 있다). */
function cutCmsApply(){
  const mark = SRC.indexOf("var _dup = sel.filter(function(n){ return !!paidMap[n]; });");
  assert.ok(mark >= 0, 'CMS apply 표식을 못 찾았다');
  const head = SRC.lastIndexOf('  async function apply(){', mark);
  assert.ok(head >= 0, 'CMS apply 머리줄을 못 찾았다');
  return cutBlock(SRC.slice(head), '  async function apply(){');
}

/* ── 찾는 순서를 실제로 돌려 본다 ── */
const ctx = { console, String, Object, Array, Math, window: {} };
vm.createContext(ctx);
vm.runInContext('function erpNormName(s){ return String(s||"").toLowerCase().replace(/[\\s\\-()·.,]/g, ""); }', ctx);
vm.runInContext('function _nbDigits(s){ return String(s||"").replace(/\\D/g, ""); }', ctx);
vm.runInContext('function _erpNameCmp(){ return { score:0 }; }', ctx);
vm.runInContext('function erpAliasCompany(){ return null; }', ctx);
vm.runInContext('function erpCleanMemo(s){ return s; }', ctx);
vm.runInContext(cutBlock(SRC, 'function erpNicebillMatchCo(idx, name, bizNo, out){'), ctx);
const match = ctx.erpNicebillMatchCo;

const E = (id, name, biz) => ({ id: id, name: name, norm: ctx.erpNormName(name), biz: biz || '' });
function idxOf(entries, prevs) {
  const idx = { byNorm: {}, byBiz: {}, byPrev: {}, list: entries, cache: {} };
  entries.forEach((e) => {
    if (e.norm) idx.byNorm[e.norm] = e;
    if (e.biz.length >= 10) idx.byBiz[e.biz] = e;
  });
  (prevs || []).forEach((p) => { idx.byPrev[ctx.erpNormName(p.name)] = { e: p.e, matched: p.name }; });
  return idx;
}

test('★★ 예전 이름으로 업체를 찾고, «무엇을 보고 찾았는지» 담아 준다', () => {
  const a = E('c1', '천안청화공사', '6128108893');
  const idx = idxOf([a], [{ name: '◯◯산업', e: a }]);
  const out = {};
  const hit = match(idx, '◯◯산업', '', out);
  assert.strictEqual(hit && hit.id, 'c1', '예전 이름으로 못 찾는다');
  assert.strictEqual(out.via, 'prev', '무엇을 보고 찾았는지 안 담는다 — 말없이 붙으면 안 된다');
  assert.strictEqual(out.matched, '◯◯산업');
});

test('★★ 현재 이름이 예전 이름보다 «먼저»다', () => {
  const a = E('c1', '가나상사', '');
  const b = E('c2', '나중회사', '');
  const idx = idxOf([a, b], [{ name: '가나상사', e: b }]);
  const out = {};
  const hit = match(idx, '가나상사', '', out);
  assert.strictEqual(hit.id, 'c1', '예전 이름이 현재 이름을 이겼다');
  assert.strictEqual(out.via, 'name');
});

test('★★ 사업자번호가 예전 이름보다 «먼저»다 (번호는 안 겹친다)', () => {
  const a = E('c1', '번호로찾을회사', '1112233333');
  const b = E('c2', '다른회사', '');
  const idx = idxOf([a, b], [{ name: '옛이름', e: b }]);
  const out = {};
  const hit = match(idx, '옛이름', '111-22-33333', out);
  assert.strictEqual(hit.id, 'c1', '번호가 있는데 예전 이름이 이겼다');
  assert.strictEqual(out.via, 'name', '번호로 찾은 것도 prev 가 아니다');
});

test('아무것도 못 찾으면 null 이고 via 는 비어 있다', () => {
  const idx = idxOf([E('c1', '어떤회사', '')], []);
  const out = {};
  assert.strictEqual(match(idx, '없는이름', '', out), null);
  assert.strictEqual(out.via, '');
});

test('out 을 안 줘도 죽지 않는다 (부르는 곳이 여럿이다)', () => {
  const a = E('c1', '천안청화공사', '');
  const idx = idxOf([a], [{ name: '◯◯산업', e: a }]);
  assert.strictEqual(match(idx, '◯◯산업', '').id, 'c1');
});

/* ── 색인에 예전 이름을 싣는가 ── */
test('★ 색인이 예전 이름을 싣는다 — 현재 이름과 부딪히면 «현재»가 이긴다', () => {
  const fn = bare(cutBlock(SRC, 'function erpNicebillCoIndex(){'));
  assert.ok(/byPrev:\{\}/.test(fn), '예전 이름 자리가 없다');
  assert.ok(/erpPrevList\(c\)\.forEach/.test(fn), '예전 이름을 안 싣는다');
  assert.ok(/if\(pk && !idx\.byNorm\[pk\] && !idx\.byPrev\[pk\]\)/.test(fn),
    '현재 이름과 부딪혀도 덮어쓴다');
});

/* ── 화면에 적는가 ── */
test('★★ 예전 이름으로 붙은 줄에 그 사실을 적는다', () => {
  assert.ok(B.indexOf("prevVia:(_mv.via === 'prev' ? _mv.matched : '')") >= 0, '줄에 안 담는다');
  assert.ok(B.indexOf("' · 예전 이름 「' + it.prevVia + '」'") >= 0,
    '화면에 안 적는다 — 왜 붙었는지 모르면 매달 조용히 틀린다');
});

/* ── 이어 붙일 때 예전 이름으로도 기억 ── */
test('★★ 이어 붙이면 «업체의 예전 이름»으로도 남긴다', () => {
  assert.ok(/dbPatch\('companies', _co\.id, \{ prevNames: erpPrevList\(_co\)\.concat\(\[linking\.name\]\) \}\)/.test(B),
    '이 화면에서만 통하는 별칭만 남기고 있다');
});

test('★★ 막는 규칙 셋에 걸리면 예전 이름으로는 «안» 남긴다', () => {
  assert.ok(/erpPrevNameConflict\(dbGet\('companies', \[\]\) \|\| \[\], _co\.id, linking\.name\)/.test(B),
    '막는 규칙을 안 본다 — 두 회사가 섞일 수 있다');
  assert.ok(/if\(!_pw && _co\)\{/.test(B), '걸려도 그냥 넣는다');
});

test('★ 무엇을 남겼는지 말해 준다', () => {
  assert.ok(SRC.indexOf('예전 이름으로도 남겼습니다 — 업체관리에서 지울 수 있습니다') >= 0,
    '남겨 놓고 안 알려 준다');
});

/* ── 해지 업체 종류 묻기 ── */
test('★★ 해지·미등록 업체가 섞이면 «종류를 묻는다»', () => {
  const fn = bare(cutCmsApply());
  assert.ok(/var offNames = sel\.filter\(function\(n\)\{ var c = byNameAll\[n\]; return !!\(c && c\.off\); \}\)/.test(fn),
    '해지·미등록 업체를 안 가려낸다');
  assert.ok(/if\(offNames\.length\)\{/.test(fn), '섞여 있어도 안 묻는다');
  assert.ok(fn.indexOf('await popConfirm(') >= 0, '묻지 않는다');
});

test('★ 고를 것이 넷이다 — 자문료·컨설팅·사건·기타수입 (대표 답)', () => {
  const fn = cutCmsApply();
  ['자문료', '컨설팅', '사건', '기타수입'].forEach((k) => {
    assert.ok(fn.indexOf("key:'" + k + "'") >= 0, k + ' 이 고를 것에 없다');
  });
});

test('★★ 고른 종류는 «해지·미등록» 업체에만 쓴다 (나머지는 자문료)', () => {
  const fn = bare(cutCmsApply());
  assert.ok(/var _k = \(byNameAll\[n\] && byNameAll\[n\]\.off\) \? offKind : '자문료';/.test(fn),
    '멀쩡한 업체 것까지 종류를 바꾸고 있다');
});

test('★ 그만두면 아무 일도 안 한다', () => {
  const fn = bare(cutCmsApply());
  assert.ok(/if\(k === false\) return;/.test(fn), '그만둬도 입금을 만든다');
});

test('★★ 종류가 «두 갈래 모두»에 넘어간다 (한쪽만 넘기면 조용히 자문료가 된다)', () => {
  const fn = bare(cutCmsApply());
  /* ⚠ 인자 목록을 통째로 못 박지 않는다 — 2026-08-28 에 «금액»(_amt)이 뒤에 붙으면서
     뜻은 그대로인데 모양이 달라 이 검사가 깨졌다. 볼 것은 «종류가 넘어가는가» 다. */
  assert.ok(/props\.addIncome\([^)]*\b_k\b/.test(fn),
    '업체입금 탭 갈래에 종류를 안 넘긴다');
  assert.ok(/erpAddCompanyIncome\([^)]*\b_k\b/.test(fn),
    '거래내역 갈래에 종류를 안 넘긴다');
  /* 금액도 두 갈래 모두에 넘어가야 한다 — 안 넘기면 저장 함수가 «지금 자문료»를 꺼내 쓴다
     (김보람 과장 건의 2026-08-28: 보여준 275,000 대신 440,000 이 적히던 일) */
  assert.ok(/props\.addIncome\([^)]*\b_amt\b/.test(fn) &&
            /erpAddCompanyIncome\([^)]*\b_amt\b/.test(fn),
    '두 갈래 모두에 «적을 금액»을 넘겨야 한다');
});

test('★★ 받는 쪽 두 함수가 종류를 «쓴다» (안 쓰면 넘겨도 소용없다)', () => {
  /* 머리줄도 통째로 못 박지 않는다 — 인자가 하나 늘면 못 찾는다 */
  const a = bare(cutBlock(SRC, 'function erpAddCompanyIncome(co, month, year, date, note, kind'));
  assert.ok(/kind:\(kind \|\| '자문료'\)/.test(a), 'erpAddCompanyIncome 이 종류를 안 쓴다');
  const b = bare(cutBlock(SRC, '  function addIncome(co, month, date, note, kind'));
  assert.ok(/kind:\(kind \|\| '자문료'\)/.test(b), '업체입금 탭 addIncome 이 종류를 안 쓴다');
  /* 받은 «금액»도 실제로 쓰는가 — 안 쓰면 넘겨도 소용없다 */
  assert.ok(/amount != null/.test(a) && /amount != null/.test(b),
    '★ 받은 금액을 안 쓰고 co.fee 를 꺼내 쓰면 화면과 저장이 갈라진다');
});

/* ── 물음창 ── */
test('★ 물음창이 길 넷 이상을 낼 수 있다', () => {
  const fn = bare(cutBlock(SRC, 'window.popConfirm = function(msg, onYes, opts){'));
  assert.ok(/\(opts\.choices \|\| \[\]\)\.forEach/.test(fn), '여러 갈래를 못 낸다');
  assert.ok(/b2\.onclick = function\(\)\{ close\(c\.key\); \}/.test(fn), '눌러도 아무 일이 없다');
});

test('★★ 길을 준 곳에는 「확인」을 안 붙인다 (무엇이 기본인지 흐려진다)', () => {
  const fn = bare(cutBlock(SRC, 'window.popConfirm = function(msg, onYes, opts){'));
  assert.ok(/if\(!opts\.choices \|\| !opts\.choices\.length\) btns\.appendChild\(ok\);/.test(fn),
    '고를 것이 다섯이 된다');
});

test('★★ choices 를 «안» 준 곳은 그대로다 (이 물음창은 230군데가 쓴다)', () => {
  const fn = bare(cutBlock(SRC, 'window.popConfirm = function(msg, onYes, opts){'));
  assert.ok(/var extra = \[\];/.test(fn), '기본이 없음이어야 한다');
  assert.ok(fn.indexOf('opts.choices = ') < 0, '안 준 값을 스스로 채우고 있다');
});
