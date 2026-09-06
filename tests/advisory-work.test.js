'use strict';
// 자문·급여도 업무로 — node --test tests/advisory-work.test.js
//
// 대표 지시 2026-09-05: "자문 이나 급여에 대한 대응도 모두 업무에 포함 시킬수 있게 해라
//                       그래서 자문사 등도 모두 표시되어 확인 할 수 있게 해라."
//
// 업무관리는 푸른이알피 다섯 갈래(계약·사건·컨설팅·기금·기타사업)만 당겨 왔다.
// 정작 «달마다 돈이 들어오는» 자문사는 한 곳도 업무에 없었다 — 업체관리에 있는데
// 그 갈래를 안 읽었을 뿐이다. 담당·월 자문료·계약기간이 거기 다 있다.
// 급여 업무는 만들어지긴 했는데 담당이 «비어» 있어 (담당 미지정)에만 쌓였다.
//
// 대표 결정 2026-09-05
//   · 자문 범위 = 「거래 중인 곳만」 (해지·중단·계약종료일 지난 곳 제외)
//   · 방치 세기  = 「안 센다」 (자문은 매주 적을 일이 아니다)
//
// 이 검사가 지키는 것
//   ① 업체관리가 「자문」 구분의 업무가 된다
//   ② 끝난 자문사는 안 들어온다 — 그리고 그 잣대를 다른 갈래에 흘리지 않는다
//   ③ 자문은 미기록·방치·기록률에서 뺀다 (목록에서는 안 뺀다)
//   ④ 급여 업무에 담당이 들어간다 — 못 찾으면 비운다
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const W = fs.readFileSync(path.join(__dirname, '..', 'work.html'), 'utf8').replace(/\r\n/g, '\n');

function grab(name){
  const i = W.indexOf('function ' + name + '(');
  assert.ok(i >= 0, '못 찾음: ' + name);
  let d = 0, j = i;
  for(;; j++){ if(W[j] === '{') d++; else if(W[j] === '}'){ d--; if(!d){ j++; break; } } }
  return W.slice(i, j);
}
/* 「var 이름=…;」 한 덩이를 통째로 — 끝을 세 가지로 짚어 보고
   그중 «실제로 말이 되는» 가장 짧은 것을 고른다.
   ⚠ 무턱대고 아래쪽 ^}; 까지 삼키면 화면 코드가 딸려 와 vm 안에서 터진다. */
function gvar(n){
  const cand = [';$', '^\\];$', '^\\};$']
    .map(end => new RegExp('^var ' + n + '=[\\s\\S]*?' + end, 'm').exec(W))
    .filter(Boolean).map(m => m[0]).sort((a, b) => a.length - b.length);
  for(const s of cand){ try{ new Function(s); return s; }catch(e){} }
  throw new Error('못 읽음: ' + n);
}
function code(t){
  return t.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

/* ══════════════════════════════════════════════
   ① 업체관리 → 자문 업무
   ══════════════════════════════════════════════ */
function candBox(master, today){
  const b = {
    console, String, Number, Object, Array, Date,
    peMaster: master,
    peTypes: {},
    _peU2N: { 'P-003': '박한별', 'P-004': '김혜민' },
    todayStr: () => today || '2026-09-05',
    safeKey: s => String(s == null ? '' : s).replace(/[.#$/[\]\s]/g, '_'),
    briefTrim: s => String(s || ''),
    peTypeName: (t, c) => String(c || ''),
    _peRawType: () => '',
    peStatus: x => String((x && x.status) || '')
  };
  vm.createContext(b);
  vm.runInContext([
    gvar('PE_DEF'), gvar('PE_CKIND'),
    "var END_WAYS=[['done','종료','x','closed']];var END_BY_PE={closed:'done'};",
    grab('peType'), grab('peEndWay'), grab('_peClosed'), grab('_peDue'),
    grab('_peCandOf'), grab('puerpCandidates')
  ].join('\n'), b);
  return b;
}

const 자문사 = {
  id: 'co-1', name: '(주)토탈방재', typeCode: '자문', status: 'active',
  managerMain: 'P-003', managerSubs: ['P-004'],
  contractStartDate: '2026-01-01', contractEndDate: '2026-12-31',
  monthlyAdvisoryFee: 220000
};

test('★★ 업체관리 한 곳이 「자문」 구분의 업무가 된다', () => {
  const c = candBox({ companies: [자문사] }).puerpCandidates();
  assert.equal(c.length, 1);
  assert.equal(c[0].cat, '자문');
  assert.equal(c[0].company, '(주)토탈방재');
});

test('★ 업체는 회사 이름이 name 이다 — 다른 갈래(companyName)와 칸이 다르다', () => {
  const D = gvar('PE_DEF');
  assert.match(D, /\['companies','자문'/);
  assert.match(D, /function\(x\)\{return x\.name\|\|x\.companyName\|\|'';\}/);
  /* 한 함수에서 둘 다 보게 하지 않는다 — 사건에 name 이 생기는 날 엉뚱한 값을 집는다 */
  assert.match(grab('_peCandOf'), /var co=dCo\?dCo\(x\):\(x\.companyName\|\|x\.fundName\|\|x\.targetName\|\|''\);/);
});

test('★★ 그 업체의 번호를 들고 온다 — 담당자·오간 메일·보낸 자료가 그대로 붙는다', () => {
  const c = candBox({ companies: [자문사] }).puerpCandidates();
  assert.equal(c[0].co_id, 'co-1');
});

test('다른 갈래의 co_id 는 예전 그대로 companyId 를 본다', () => {
  const c = candBox({ case: [{ id: 'k1', companyName: '나래', companyId: 'co-9', managerMain: 'P-003' }] })
    .puerpCandidates();
  assert.equal(c[0].co_id, 'co-9');
});

test('★ 담당·부담당이 함께 온다 — 「내 업무」에 나오려면 이것이 있어야 한다', () => {
  const c = candBox({ companies: [자문사] }).puerpCandidates();
  assert.equal(c[0].mgr, '박한별');
  assert.equal(c[0].mgrSid, 'P-003');
  assert.deepEqual(Array.from(c[0].subs), ['김혜민']);
});

test('★ 회사명을 업무명으로 쓰지 않는다 — 기업 칸과 똑같이 보인다', () => {
  const c = candBox({ companies: [자문사] }).puerpCandidates();
  assert.equal(c[0].title, '');
});

test('계약 만료일이 기한이 된다 — 자문 갱신이 D-30 으로 뜬다', () => {
  const c = candBox({ companies: [자문사] }).puerpCandidates();
  assert.equal(c[0].due, '2026-12-31');
  assert.equal(c[0].start, '2026-01-01');
});

/* ══════════════════════════════════════════════
   ② 끝난 자문사는 안 들어온다
   ══════════════════════════════════════════════ */
function 닫혔나(x, t, today){
  return candBox({}, today)._peClosed(x, t);
}

test('★★ 해지·중단한 업체는 안 들어온다', () => {
  assert.equal(닫혔나({ status: 'terminated' }, 'companies'), true);
  assert.equal(닫혔나({ status: 'inactive' }, 'companies'), true);
});

test('★★ 계약 종료일이 지났으면 안 들어온다', () => {
  assert.equal(닫혔나({ status: 'active', contractEndDate: '2026-08-31' }, 'companies', '2026-09-05'), true);
});

test('★ 오늘이 종료일이면 아직 살아 있다 — 마지막 날까지는 거래 중이다', () => {
  assert.equal(닫혔나({ status: 'active', contractEndDate: '2026-09-05' }, 'companies', '2026-09-05'), false);
});

test('종료일이 없으면 살아 있는 것으로 본다 — 기간 없는 자문이 사라지면 안 된다', () => {
  assert.equal(닫혔나({ status: 'active' }, 'companies'), false);
});

test('★★ 그 잣대를 «다른 갈래»에 흘리지 않는다 — 살아 있는 사건이 조용히 사라진다', () => {
  assert.equal(닫혔나({ status: 'inactive' }, 'case'), false);
  assert.equal(닫혔나({ status: 'terminated' }, 'consulting'), false);
  assert.equal(닫혔나({ status: 'active', contractEndDate: '2020-01-01' }, 'case', '2026-09-05'), false);
  assert.equal(닫혔나({ status: 'active', contractEndDate: '2020-01-01' }), false, '갈래를 안 주면 옛 규칙 그대로');
});

test('예전 규칙(closed·cancelled·transferred·보관)은 모든 갈래에서 그대로', () => {
  ['closed', 'cancelled', 'transferred'].forEach(st => {
    assert.equal(닫혔나({ status: st }, 'case'), true);
    assert.equal(닫혔나({ status: st }, 'companies'), true);
  });
  assert.equal(닫혔나({ archived: true }, 'companies'), true);
  assert.equal(닫혔나({ closedDate: '2026-01-01' }, 'case'), true);
});

test('★ 끝난 자문사는 후보에서 빠진다', () => {
  const b = candBox({ companies: [자문사, { id: 'co-2', name: '끊긴곳', status: 'terminated' }] });
  const c = b.puerpCandidates();
  assert.equal(c.length, 1);
  assert.equal(c[0].company, '(주)토탈방재');
});

test('★ 종료 반영도 갈래를 함께 넘긴다 — 나중에 해지하면 업무가 종료로 빠진다', () => {
  assert.match(code(grab('peAutoSync')), /_peClosed\(_rc,it\.ref&&it\.ref\.type\)/);
});

/* ══════════════════════════════════════════════
   ③ 자문은 세지 않는다 (목록에서는 안 뺀다)
   ══════════════════════════════════════════════ */
function cntBox(){
  const b = { console, String };
  vm.createContext(b);
  vm.runInContext(gvar('KIND_ALIAS') + '\n' + grab('catNorm') + '\n' + grab('countsLog'), b);
  return b;
}

test('★★ 자문은 세지 않는다', () => {
  const b = cntBox();
  assert.equal(b.countsLog({ cat: '자문' }), false);
});

test('★ 나머지는 예전대로 다 센다', () => {
  const b = cntBox();
  ['사건', '컨설팅', '기금', '기타사업', '계약', '업체', '급여', '', undefined].forEach(c => {
    assert.equal(b.countsLog({ cat: c }), true, String(c) + ' 이 빠졌다');
  });
  assert.equal(b.countsLog(null), true);
});

test('★★ 「내 업무」 미기록에서 뺀다', () => {
  assert.match(W, /var nolog=mine\.filter\(function\(it\)\{return countsLog\(it\)&&wkLogsOf\(it\._id,wk\)\.length===0;\}\);/);
});

test('★★ 「팀 전체」 미기록·2주\\+ 방치에서 뺀다', () => {
  const T = code(W.slice(W.indexOf('var totLogs=0;')));
  assert.match(T, /var stale=open\.filter\(function\(it\)\{ if\(!countsLog\(it\)\) return false;/);
  assert.match(T, /var nolog=open\.filter\(function\(it\)\{return countsLog\(it\)&&wkLogsOf/);
});

test('★★ 「사람 현황판」 방치에서 뺀다', () => {
  assert.match(code(grab('teamCardData')), /if\(countsLog\(it\)&&\(!ld\|\|_dayDiff\(today,ld\)>=14\)\) s\.stale\+\+;/);
});

test('★★ 「업무량」 방치와 기록률 분모에서 뺀다', () => {
  const V = code(W);
  assert.match(V, /if\(countsLog\(it\)\) r\.den\+\+;/);
  assert.match(V, /if\(countsLog\(it\)&&\(!ld\|\|_dayDiff\(today,ld\)>=14\)\) r\.stale\+\+;/);
  assert.match(V, /r\.rate=r\.den\?Math\.round\(r\.loggedN\/r\.den\*100\):0;/);
  assert.match(V, /var Trate=T\.den\?Math\.round\(T\.loggedN\/T\.den\*100\):0;/);
});

test('★★ 진행 건수(open)는 그대로 센다 — 목록에서 빼는 것이 아니다', () => {
  const V = code(W);
  assert.match(V, /var r=R\(nm\); r\.open\+\+;/);
  assert.ok(V.indexOf('if(countsLog(it)) r.open++') < 0, '진행 건수에서까지 뺐다');
  /* 사람 현황판의 큰 숫자(주담당 건수)도 그대로다 */
  assert.match(code(grab('teamCardData')), /var s=slot\(nm\); s\.main\+\+;/);
});

test('★ 기한(지남·임박)은 그대로 센다 — 날짜가 정해진 일은 다르다', () => {
  const C = code(grab('teamCardData'));
  const i = C.indexOf('if(d!==null&&d<0) s.over++;');
  assert.ok(i > 0);
  assert.ok(C.slice(i - 120, i).indexOf('countsLog') < 0, '기한까지 빼 버렸다');
});

test('구분 목록·색에 자문이 있다', () => {
  assert.match(W, /'자문':\['#f8fafc','#166534'\]/);
  assert.match(W, /var KIND_SET=\{'계약':1,'사건':1,'컨설팅':1,'기금':1,'기타사업':1,'자문':1\};/);
});

/* ══════════════════════════════════════════════
   ④ 급여 업무의 담당
   ══════════════════════════════════════════════ */
function payBox(co, u2n){
  const b = { console, String };
  vm.createContext(b);
  vm.runInContext(
    'var coSrc=' + JSON.stringify(co) + ';\n'
    + 'var _peU2N=' + JSON.stringify(u2n || {}) + ';\n'
    + grab('_payKey') + '\n' + grab('payMgrOf'), b);
  return b;
}
const 업체목록 = [{ id: 'co-7', name: '㈜가나전자', managerMain: 'P-004' }];

test('★★ 급여 업무의 담당을 업체관리에서 찾는다', () => {
  const g = payBox(업체목록, { 'P-004': '김혜민' }).payMgrOf('(주)가나전자');
  assert.equal(g.sid, 'P-004');
  assert.equal(g.name, '김혜민');
  assert.equal(g.co_id, 'co-7');
});

test('★ 상호 표기가 달라도 찾는다 — ㈜·(주)·빈칸을 떼고 견준다', () => {
  const b = payBox(업체목록, { 'P-004': '김혜민' });
  ['㈜가나전자', '주식회사 가나전자', '가나 전자', '(주)가나전자'].forEach(s => {
    assert.ok(b.payMgrOf(s), s + ' 를 못 찾았다');
  });
});

test('★★ 못 찾으면 비운다 — 아무나 넣으면 «남의 업무»가 된다', () => {
  assert.equal(payBox(업체목록, { 'P-004': '김혜민' }).payMgrOf('없는회사'), null);
  assert.equal(payBox(null, {}).payMgrOf('㈜가나전자'), null, '업체 목록이 아직인데 넣었다');
  assert.equal(payBox([], {}).payMgrOf('㈜가나전자'), null);
});

test('★★ 이름표를 못 읽었으면 넣지 않는다 — 사번만 있으면 화면에서 못 알아본다', () => {
  assert.equal(payBox(업체목록, {}).payMgrOf('㈜가나전자'), null);
});

test('업체에 담당이 안 적혀 있으면 비운다', () => {
  assert.equal(payBox([{ id: 'co-8', name: '㈜가나전자', managerMain: '' }], { 'P-004': '김혜민' })
    .payMgrOf('㈜가나전자'), null);
});

test('★ 만들 때 그 담당을 넣고, 없을 때만 「담당 미지정」 표를 단다', () => {
  const M = code(grab('payMakeItem'));
  assert.match(M, /var mg=payMgrOf\(site\);/);
  assert.match(M, /mgr_main:\{sid:\(mg&&mg\.sid\)\|\|'',name:\(mg&&mg\.name\)\|\|''\}, pe_nomgr:!mg,/);
  assert.match(M, /co_id:\(mg&&mg\.co_id\)\|\|'',/, '업체 번호가 없으면 메일·자료가 안 붙는다');
});

test('★ 이미 만든 급여 업무는 다시 안 만든다 — 담당이 바뀌어도 덮어쓰지 않는다', () => {
  const M = code(grab('payMakeItem'));
  assert.match(M, /if\(items\[id\]\) return Promise\.resolve\(id\);/);
  assert.ok(M.indexOf('payMgrOf') > M.indexOf('if(items[id])'), '이미 있는데도 담당을 다시 계산한다');
});

/* ══════════════════════════════════════════════
   ⑤ 갈래를 더했으면 «읽는 자리»도 함께
   ══════════════════════════════════════════════
   대표 보고 2026-09-06 「업무량에 … 모든 사업들을 포함시켜라」 —
   자문을 넣었는데 화면에 한 건도 안 나왔다. 까닭은 PE_KEYS 였다:
   PE_DEF 에만 넣고 PE_KEYS 를 빠뜨려 peLoadAll 이 data/undefined/v 를 읽었다.
   ⚠ 화면에는 아무 오류도 안 났다 — 읽기 실패는 조용히 캐시로 넘어가고,
     캐시에도 없으면 그냥 빈손이다. 그래서 「없는 것」과 구별이 안 됐다. */
test('★★ PE_DEF 의 모든 갈래가 PE_KEYS 에도 있다 — 없으면 그 갈래는 통째로 안 들어온다', () => {
  const b = { console };
  vm.createContext(b);
  vm.runInContext(gvar('PE_DEF') + '\n' + gvar('PE_KEYS') + '\nthis.D=PE_DEF; this.K=PE_KEYS;', b);
  const missing = Array.from(b.D).map(d => d[0]).filter(k => !b.K[k]);
  assert.deepEqual(missing, [], '읽는 자리가 없는 갈래: ' + JSON.stringify(missing));
});

test('★★ 자문은 data/companies 를 읽는다', () => {
  const b = { console };
  vm.createContext(b);
  vm.runInContext(gvar('PE_KEYS') + '\nthis.K=PE_KEYS;', b);
  assert.equal(b.K.companies, 'companies');
});

test('★ 바뀜 구독(peWatch)도 같은 목록을 쓴다 — 빠지면 새로고침해야만 보인다', () => {
  const F = code(grab('peWatch'));
  assert.match(F, /PE_DEF\.forEach/);
  assert.match(F, /'data\/'\+PE_KEYS\[d\[0\]\]\+'\/u'/);
});

test('★ 업체 명단을 두 번 읽지 않는다 — 업체 잇기와 나눠 쓴다', () => {
  const F = code(grab('peLoadAll'));
  assert.match(F, /if\(d\[0\]==='companies'&&coSrc&&coSrc\.length\) return Promise\.resolve\(\[d\[0\],coSrc\]\);/);
  assert.match(F, /if\(\(!coSrc\|\|!coSrc\.length\)&&peMaster\.companies\) coSrc=peMaster\.companies;/);
});

test('★★ 자문 업무명에 내부 번호가 안 나온다 — 유형 마스터 열쇠는 company(홑)다', () => {
  const D = gvar('PE_DEF');
  assert.match(D, /peTypeName\('company',x\.typeCode\)\|\|'자문'/);
  /* 마스터 이름표가 홑이라는 것 자체를 못 박아 둔다 */
  assert.match(W, /var PE_TKEY=\{company:'biz_company_types'/);
});
