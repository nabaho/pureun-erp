/* 지난 자료 중복 훑기 — 계약·사건·일반업무
   틀리는 방향이 둘이다. 놓치면 중복이 남고, 헛경고를 내면 아무도 안 본다.
   특히 "세부 종류를 못 읽은 것"을 조용히 넘기면 중복인지 아닌지 모른 채 지나간다. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const HTML = path.join(__dirname, '..', 'pu-erp.html');
const src = fs.readFileSync(HTML, 'utf8');

function slice(a, b){
  const i = src.indexOf(a);
  if(i < 0) throw new Error('시작 표식 못찾음: ' + a);
  const j = src.indexOf(b, i);
  if(j < 0) throw new Error('끝 표식 못찾음: ' + b);
  return src.slice(i, j);
}

let pass = 0, fail = 0;
const t = (name, got, want) => {
  const G = JSON.stringify(got), W = JSON.stringify(want);
  if(G === W) pass++;
  else { fail++; console.log('FAIL ' + name + '\n  got  = ' + G + '\n  want = ' + W); }
};

/* ── 샌드박스 ── */
function makeCtx(store){
  const c = {
    console, Date, Math, Object, JSON, Array, String, Number, parseInt, isNaN, RegExp,
    window:{}, showToast(){}, todayYMD(){ return '2026-08-04'; },
    dbGet(k, d){ return (k in store) ? store[k] : d; },
    dbSet(k, v){ store[k] = v; return true; },
    // 세부 종류 이름표는 유형 목록을 뒤지므로, 훑기 검사에서는 코드만 쓰게 단순화한다
    contractSubtypeLabel(rec, kindV){
      const code = c.contractSubtypeCode(rec, kindV);
      return code ? { code:code, name:code, agency:'', label:code } : null;
    },
    CompanyRef:{ _normBiz(s){ const d = String(s == null ? '' : s).replace(/\D/g, ''); return d; } }
  };
  vm.createContext(c);
  vm.runInContext(slice('function contractSubtypeCode(c, kindV){', 'function contractSubtypeLabel('), c);
  vm.runInContext(slice('var PC_CORP_TOKENS', 'function pcToContact('), c);
  vm.runInContext(slice('function isItemClosed(item){', '// ============ 종료 권한'), c);
  vm.runInContext(slice('// ============ 지난 자료 중복 훑기 ============', '// 여러 건 중 가장 센 판정'), c);
  return c;
}
const scan = (store, opts) => makeCtx(store).dupSweepScan(opts);
const K = (g) => g.verdict + ':' + g.kindLabel + ':' + g.coName + ':' + g.rows.length;

/* ═══ 1. 같은 사업장 판정 ═══ */
{
  const c = makeCtx({});
  t('사업자번호가 있으면 그것으로', c.dupSweepCoKey({ bizNo:'123-45-67890' }), 'b1234567890');
  t('★ 사업자번호가 같으면 이름이 달라도 같은 곳',
    c.dupSweepCoKey({ bizNo:'1234567890', companyName:'가나' }),
    c.dupSweepCoKey({ bizNo:'123-45-67890', companyName:'가나상사' }));
  t('★ (주) 표기 차이는 무시한다',
    c.dupSweepCoKey({ companyName:'(주)유원에프앤비' }),
    c.dupSweepCoKey({ companyName:'유원에프앤비' }));
  t('★ 주식회사 표기도 같게', c.dupSweepCoKey({ companyName:'주식회사 남양인텍' }),
    c.dupSweepCoKey({ companyName:'남양인텍' }));
  t('공백·기호 차이도 같게', c.dupSweepCoKey({ companyName:'가야 엔지니어링' }),
    c.dupSweepCoKey({ companyName:'가야엔지니어링' }));
  t('★ 다른 회사는 다른 열쇠',
    c.dupSweepCoKey({ companyName:'가나상사' }) === c.dupSweepCoKey({ companyName:'다라기업' }), false);
  t('사업자번호가 짧으면 이름으로 떨어진다',
    c.dupSweepCoKey({ bizNo:'123', companyName:'가나' }), c.dupSweepCoKey({ companyName:'가나' }));
  t('★ 이름도 번호도 없으면 훑지 않는다', c.dupSweepCoKey({}), '');
  t('null 도 빈 값', c.dupSweepCoKey(null), '');
  t('company.name 도 읽는다', c.dupSweepCoKey({ company:{ name:'가나상사' } }),
    c.dupSweepCoKey({ companyName:'가나상사' }));
}

/* ═══ 2. 종류·세부종류 펼치기 ═══ */
{
  const c = makeCtx({});
  t('계약이 종류를 두 개 가지면 둘로 펼친다',
    c.dupSweepFacets('contract', { kinds:['consulting','advisory'],
      typeCodes:{ consulting:'cons-a', advisory:'adv-b' } }).map(f => f.kindV + ':' + f.code),
    ['consulting:cons-a','advisory:adv-b']);
  t('세부 종류가 없으면 빈 코드로 내보낸다 (버리지 않는다)',
    c.dupSweepFacets('contract', { kinds:['consulting'] })[0].code, '');
  t('★ 종류조차 없으면 종류 미입력으로 남긴다',
    c.dupSweepFacets('contract', {})[0].label, '종류 미입력');
  t('사건은 한 짝', c.dupSweepFacets('case', { typeCodes:{ case:'case-dismiss' } }).length, 1);
  t('사건 세부 종류를 읽는다',
    c.dupSweepFacets('case', { typeCodes:{ case:'case-dismiss' } })[0].code, 'case-dismiss');
  t('일반업무는 업무종류+업무명',
    c.dupSweepFacets('work', { workType:'상담', title:'취업규칙 검토' })[0].code, '상담|취업규칙검토');
  t('★ 업무명 공백·대소문자 차이는 같게 본다',
    c.dupSweepFacets('work', { workType:'상담', title:'취업규칙 검토' })[0].code,
    c.dupSweepFacets('work', { workType:'상담', title:'취업규칙검토' })[0].code);
  t('업무종류·업무명이 다 없으면 빈 코드',
    c.dupSweepFacets('work', {})[0].code, '');
  t('모르는 갈래는 빈 배열', c.dupSweepFacets('없는것', { a:1 }), []);
}

/* ═══ 3. ★ 진짜 중복 / 재계약 / 판단 못 함 ═══ */
// 같은 사업장 · 같은 세부 종류 · 둘 다 진행 중 → 진짜 중복
{
  const r = scan({ contracts:[
    { id:'c1', companyName:'유원에프앤비', signDate:'2026-03-11', contractNo:'계약-041',
      kinds:['consulting'], typeCodes:{ consulting:'cons-ilteo' }, status:'signed' },
    { id:'c2', companyName:'(주)유원에프앤비', signDate:'2026-07-28', contractNo:'계약-172',
      kinds:['consulting'], typeCodes:{ consulting:'cons-ilteo' }, status:'signed' }
  ]});
  t('★ 같은 세부 종류가 둘 다 진행 중이면 진짜 중복', r.groups.map(K), ['dup:계약:유원에프앤비:2']);
  t('진행 중 건수를 센다', r.groups[0].openN, 2);
  t('집계', [r.counts.dup, r.counts.again, r.counts.unknown], [1, 0, 0]);
  t('훑은 건수', r.counts.scanned, 2);
  t('★ 날짜 순으로 보여준다', r.groups[0].rows.map(x => x.rec.contractNo), ['계약-041','계약-172']);
}
// 앞의 것이 종료 → 재계약
{
  const r = scan({ contracts:[
    { id:'c1', companyName:'가야엔지니어링', signDate:'2025-06-02', kinds:['advisory'],
      typeCodes:{ advisory:'adv-month' }, status:'closed' },
    { id:'c2', companyName:'가야엔지니어링', signDate:'2026-06-01', kinds:['advisory'],
      typeCodes:{ advisory:'adv-month' }, status:'signed' }
  ]});
  t('★ 앞이 종료면 재계약', r.groups.map(K), ['again:계약:가야엔지니어링:2']);
  t('진행 중 1건', r.groups[0].openN, 1);
}
// closedDate 로도 종료를 본다
{
  const r = scan({ contracts:[
    { id:'c1', companyName:'가나', signDate:'2025-01-01', kinds:['advisory'], typeCodes:{ advisory:'a' }, closedDate:'2025-12-31' },
    { id:'c2', companyName:'가나', signDate:'2026-01-01', kinds:['advisory'], typeCodes:{ advisory:'a' } }
  ]});
  t('closedDate 도 종료로 본다', r.groups[0].verdict, 'again');
}
// 셋 다 진행 중
{
  const r = scan({ contracts:[1,2,3].map(n => ({
    id:'c'+n, companyName:'가나', signDate:'2026-0'+n+'-01', kinds:['advisory'], typeCodes:{ advisory:'a' } }))});
  t('세 건도 한 묶음', r.groups[0].rows.length, 3);
  t('셋 다 진행 중이면 중복', r.groups[0].verdict, 'dup');
}
// 모두 종료 → 재계약(이력)
{
  const r = scan({ contracts:[
    { id:'c1', companyName:'가나', signDate:'2024-01-01', kinds:['advisory'], typeCodes:{ advisory:'a' }, status:'closed' },
    { id:'c2', companyName:'가나', signDate:'2025-01-01', kinds:['advisory'], typeCodes:{ advisory:'a' }, status:'closed' }
  ]});
  t('모두 종료면 재계약으로 모은다', r.groups[0].verdict, 'again');
  t('진행 중 0건', r.groups[0].openN, 0);
}
// ★ 세부 종류가 비어 있으면 판단 못 함 — 조용히 넘기지 않는다
{
  const r = scan({ contracts:[
    { id:'c1', companyName:'가나', signDate:'2026-01-01', kinds:['consulting'] },
    { id:'c2', companyName:'가나', signDate:'2026-02-01', kinds:['consulting'] }
  ]});
  t('★ 세부 종류 비면 판단 못 함', r.groups.map(K), ['unknown:계약:가나:2']);
  t('★ 진짜 중복으로 세지 않는다', r.counts.dup, 0);
  t('★ 다른 일로 넘기지도 않는다', r.counts.unknown, 1);
}
// 세부 종류가 다르면 아예 안 걸린다
{
  const r = scan({ contracts:[
    { id:'c1', companyName:'가나', signDate:'2026-01-01', kinds:['consulting'], typeCodes:{ consulting:'x' } },
    { id:'c2', companyName:'가나', signDate:'2026-02-01', kinds:['consulting'], typeCodes:{ consulting:'y' } }
  ]});
  t('★ 세부 종류가 다르면 헛경고를 내지 않는다', r.groups.length, 0);
  t('집계도 0', r.counts.groups, 0);
}
// 종류가 안 겹치면 안 걸린다
{
  const r = scan({ contracts:[
    { id:'c1', companyName:'가나', signDate:'2026-01-01', kinds:['consulting'], typeCodes:{ consulting:'x' } },
    { id:'c2', companyName:'가나', signDate:'2026-02-01', kinds:['advisory'],   typeCodes:{ advisory:'x' } }
  ]});
  t('★ 종류가 다르면 같은 코드라도 안 걸린다', r.groups.length, 0);
}
// 종류가 여럿인 계약 — 겹치는 종류에서만 걸린다
{
  const r = scan({ contracts:[
    { id:'c1', companyName:'가나', signDate:'2026-01-01', kinds:['consulting','advisory'],
      typeCodes:{ consulting:'x', advisory:'m' } },
    { id:'c2', companyName:'가나', signDate:'2026-02-01', kinds:['consulting'], typeCodes:{ consulting:'x' } }
  ]});
  t('★ 겹치는 종류에서만 한 묶음', r.groups.length, 1);
  t('그 묶음은 컨설팅', r.groups[0].kindV, 'consulting');
  t('자문은 혼자라 안 걸린다', r.groups[0].rows.length, 2);
}
// 다른 사업장은 섞이지 않는다
{
  const r = scan({ contracts:[
    { id:'c1', companyName:'가나', signDate:'2026-01-01', kinds:['advisory'], typeCodes:{ advisory:'a' } },
    { id:'c2', companyName:'다라', signDate:'2026-02-01', kinds:['advisory'], typeCodes:{ advisory:'a' } }
  ]});
  t('★ 다른 사업장은 묶지 않는다', r.groups.length, 0);
}
// 업체명이 없으면 훑지 않는다 (이름 없는 것끼리 묶으면 엉뚱하게 걸린다)
{
  const r = scan({ contracts:[
    { id:'c1', signDate:'2026-01-01', kinds:['advisory'], typeCodes:{ advisory:'a' } },
    { id:'c2', signDate:'2026-02-01', kinds:['advisory'], typeCodes:{ advisory:'a' } }
  ]});
  t('★ 업체를 특정할 수 없으면 훑지 않는다', r.groups.length, 0);
  t('훑은 건수에도 안 넣는다', r.counts.scanned, 0);
}
// 영구보관은 목록에서 빠진 건이다
{
  const r = scan({ contracts:[
    { id:'c1', companyName:'가나', signDate:'2026-01-01', kinds:['advisory'], typeCodes:{ advisory:'a' }, permanentArchived:true },
    { id:'c2', companyName:'가나', signDate:'2026-02-01', kinds:['advisory'], typeCodes:{ advisory:'a' } }
  ]});
  t('★ 영구보관은 훑지 않는다', r.groups.length, 0);
}

/* ═══ 4. 사건·일반업무 ═══ */
{
  const r = scan({ cases:[
    { id:'k1', companyName:'남양인텍', receiveDate:'2026-02-01', caseNo:'부해-001',
      typeCodes:{ case:'case-dismiss' }, status:'progress' },
    { id:'k2', companyName:'남양인텍', receiveDate:'2026-05-01', caseNo:'부해-014',
      typeCodes:{ case:'case-dismiss' }, status:'progress' }
  ]});
  t('★ 사건도 훑는다', r.groups.map(K), ['dup:사건:남양인텍:2']);
  t('사건은 접수일로 정렬', r.groups[0].rows.map(x => x.rec.caseNo), ['부해-001','부해-014']);
}
{
  const r = scan({ cases:[
    { id:'k1', companyName:'남양인텍', receiveDate:'2026-02-01', typeCodes:{ case:'case-dismiss' }, status:'closed' },
    { id:'k2', companyName:'남양인텍', receiveDate:'2026-05-01', typeCodes:{ case:'case-dismiss' }, status:'progress' }
  ]});
  t('종결된 사건이 있으면 재계약 갈래', r.groups[0].verdict, 'again');
}
{
  const r = scan({ cases:[
    { id:'k1', companyName:'가나', receiveDate:'2026-02-01', typeCodes:{ case:'case-dismiss' }, status:'transferred' },
    { id:'k2', companyName:'가나', receiveDate:'2026-05-01', typeCodes:{ case:'case-dismiss' }, status:'progress' }
  ]});
  t('★ 이송된 사건도 종료로 본다', r.groups[0].verdict, 'again');
}
{
  const r = scan({ my_work_items:[
    { id:'w1', companyName:'가나상사', itemNo:'WI-001', startDate:'2026-01-05',
      workType:'상담', title:'취업규칙 검토', status:'open' },
    { id:'w2', companyName:'가나상사', itemNo:'WI-009', startDate:'2026-03-05',
      workType:'상담', title:'취업규칙  검토', status:'open' }
  ]});
  t('★ 일반업무도 훑는다', r.groups.map(K), ['dup:일반업무:가나상사:2']);
  t('업무명 공백 차이로 갈라지지 않는다', r.groups[0].rows.length, 2);
}
{
  const r = scan({ my_work_items:[
    { id:'w1', companyName:'가나', startDate:'2026-01-05', workType:'상담', title:'A', archived:true },
    { id:'w2', companyName:'가나', startDate:'2026-03-05', workType:'상담', title:'A' }
  ]});
  t('★ 보관된 일반업무는 종료로 본다', r.groups[0].verdict, 'again');
}
// 갈래가 섞이지 않는다 — 계약과 사건이 한 묶음이 되면 안 된다
{
  const r = scan({
    contracts:[
      { id:'c1', companyName:'가나', signDate:'2026-01-01', kinds:['case'], typeCodes:{ case:'case-dismiss' } },
      { id:'c2', companyName:'가나', signDate:'2026-02-01', kinds:['case'], typeCodes:{ case:'case-dismiss' } }
    ],
    cases:[
      { id:'k1', companyName:'가나', receiveDate:'2026-03-01', typeCodes:{ case:'case-dismiss' } },
      { id:'k2', companyName:'가나', receiveDate:'2026-04-01', typeCodes:{ case:'case-dismiss' } }
    ]
  });
  t('★ 계약 묶음과 사건 묶음이 따로', r.groups.length, 2);
  t('갈래 이름이 각각', r.groups.map(g => g.kindLabel).sort(), ['계약','사건']);
  t('한 묶음에 두 건씩', r.groups.map(g => g.rows.length), [2,2]);
}
// 좁혀 훑기
{
  const store = {
    contracts:[
      { id:'c1', companyName:'가나', signDate:'2026-01-01', kinds:['advisory'], typeCodes:{ advisory:'a' } },
      { id:'c2', companyName:'가나', signDate:'2026-02-01', kinds:['advisory'], typeCodes:{ advisory:'a' } }
    ],
    cases:[
      { id:'k1', companyName:'가나', receiveDate:'2026-03-01', typeCodes:{ case:'x' } },
      { id:'k2', companyName:'가나', receiveDate:'2026-04-01', typeCodes:{ case:'x' } }
    ]
  };
  t('전체는 두 묶음', scan(store).groups.length, 2);
  t('계약만 좁히면 한 묶음', scan(store, { kinds:['contract'] }).groups.length, 1);
  t('좁힌 갈래만 나온다', scan(store, { kinds:['case'] }).groups[0].kindLabel, '사건');
}

/* ═══ 5. 정렬·집계·방어 ═══ */
{
  const r = scan({ contracts:[
    { id:'a1', companyName:'재계약회사', signDate:'2025-01-01', kinds:['advisory'], typeCodes:{ advisory:'a' }, status:'closed' },
    { id:'a2', companyName:'재계약회사', signDate:'2026-01-01', kinds:['advisory'], typeCodes:{ advisory:'a' } },
    { id:'b1', companyName:'모를회사', signDate:'2026-01-01', kinds:['consulting'] },
    { id:'b2', companyName:'모를회사', signDate:'2026-02-01', kinds:['consulting'] },
    { id:'d1', companyName:'중복회사', signDate:'2026-01-01', kinds:['advisory'], typeCodes:{ advisory:'z' } },
    { id:'d2', companyName:'중복회사', signDate:'2026-02-01', kinds:['advisory'], typeCodes:{ advisory:'z' } }
  ]});
  t('★ 급한 것부터 — 중복 → 판단 못 함 → 재계약',
    r.groups.map(g => g.verdict), ['dup','unknown','again']);
  t('집계 셋', [r.counts.dup, r.counts.unknown, r.counts.again], [1,1,1]);
  t('묶음 수', r.counts.groups, 3);
}
// 건수가 많은 묶음이 먼저
{
  const r = scan({ contracts:[
    { id:'x1', companyName:'둘', signDate:'2026-01-01', kinds:['advisory'], typeCodes:{ advisory:'a' } },
    { id:'x2', companyName:'둘', signDate:'2026-02-01', kinds:['advisory'], typeCodes:{ advisory:'a' } },
    { id:'y1', companyName:'셋', signDate:'2026-01-01', kinds:['advisory'], typeCodes:{ advisory:'a' } },
    { id:'y2', companyName:'셋', signDate:'2026-02-01', kinds:['advisory'], typeCodes:{ advisory:'a' } },
    { id:'y3', companyName:'셋', signDate:'2026-03-01', kinds:['advisory'], typeCodes:{ advisory:'a' } }
  ]});
  t('★ 건수 많은 묶음이 먼저', r.groups.map(g => g.rows.length), [3,2]);
}
t('저장소가 비어 있으면 빈 결과', scan({}).groups.length, 0);
t('빈 결과도 집계가 있다', scan({}).counts.groups, 0);
t('배열이 아니면 건너뛴다', scan({ contracts:'배열아님' }).groups.length, 0);
t('null 항목이 섞여도 안 터진다',
  scan({ contracts:[null, { id:'c1', companyName:'가나', kinds:['advisory'], typeCodes:{ advisory:'a' } }] }).groups.length, 0);
t('id 없는 건은 건너뛴다',
  scan({ contracts:[
    { companyName:'가나', kinds:['advisory'], typeCodes:{ advisory:'a' } },
    { id:'c2', companyName:'가나', kinds:['advisory'], typeCodes:{ advisory:'a' } }
  ]}).groups.length, 0);
// ★ 아무것도 저장하지 않는다
{
  const store = { contracts:[
    { id:'c1', companyName:'가나', signDate:'2026-01-01', kinds:['advisory'], typeCodes:{ advisory:'a' } },
    { id:'c2', companyName:'가나', signDate:'2026-02-01', kinds:['advisory'], typeCodes:{ advisory:'a' } }
  ]};
  const before = JSON.stringify(store);
  const c = makeCtx(store);
  c.dbSet = function(){ throw new Error('훑기는 저장하지 않아야 한다'); };
  let threw = '';
  try { c.dupSweepScan(); } catch(e){ threw = String(e.message); }
  t('★ 훑기가 아무것도 저장하지 않는다', threw, '');
  t('★ 자료가 그대로다', JSON.stringify(store), before);
}

/* ═══ 6. 화면 ═══ */
function renderSweep(result, filter){
  const nodes = [], texts = [];
  const rc = {
    console, Date, Math, Object, JSON, Array, String, Number, parseInt, isNaN, RegExp,
    window:{ innerWidth:1600 }, showToast(){},
    h(tag, props){
      const kids = Array.prototype.slice.call(arguments, 2);
      const node = { tag:(typeof tag === 'function' ? (tag.name||'fn') : tag), props:props||{}, kids:kids };
      nodes.push(node);
      kids.forEach(function walk(x){
        if(typeof x === 'string' || typeof x === 'number') texts.push(String(x));
        else if(Array.isArray(x)) x.forEach(walk);
      });
      return node;
    }
  };
  vm.createContext(rc);
  vm.runInContext(slice('// ── 지난 자료 중복 훑기 결과 ──', '\n//  - 사건유형 (case_types)'), rc);
  rc.dupSweepDateOf = (r) => String((r && (r.signDate || r.receiveDate || r.startDate)) || '');
  rc.dupSweepNoOf   = (r) => String((r && (r.contractNo || r.caseNo || r.itemNo)) || '');
  rc.DupSweepModal({ result:result, filter:filter || 'all',
    onFilter(){}, onClose(){}, onRescan(){}, onOpen(){} });
  return { nodes, texts, all:texts.join(' | ') };
}
{
  const r = scan({ contracts:[
    { id:'c1', companyName:'유원에프앤비', signDate:'2026-03-11', contractNo:'계약-041',
      kinds:['consulting'], typeCodes:{ consulting:'cons-ilteo' } },
    { id:'c2', companyName:'유원에프앤비', signDate:'2026-07-28', contractNo:'계약-172',
      kinds:['consulting'], typeCodes:{ consulting:'cons-ilteo' } }
  ]});
  let threw = '', v = null;
  try { v = renderSweep(r); } catch(e){ threw = String(e && e.message); }
  t('★ 창이 터지지 않고 그려진다', threw, '');
  if(!v){ console.log('렌더 실패 — 이후 생략'); process.exit(1); }
  t('업체명이 보인다', v.all.indexOf('유원에프앤비') >= 0, true);
  t('갈래 이름이 보인다', v.all.indexOf('계약') >= 0, true);
  t('관리번호가 둘 다 보인다',
    v.all.indexOf('계약-041') >= 0 && v.all.indexOf('계약-172') >= 0, true);
  t('판정 이름이 보인다', v.all.indexOf('진짜 중복') >= 0, true);
  t('진행 중 건수를 알려준다', v.all.indexOf('진행 중 2건') >= 0, true);
  t('★ 읽기만 한다고 밝힌다', v.all.indexOf('읽기만 합니다') >= 0, true);
  t('★ 합치기·지우기 버튼이 없다',
    v.nodes.some(n => n.tag === 'button' && /합치|병합|지우|삭제/.test(String(n.kids[0] || ''))), false);
  t('건마다 열기 버튼', v.nodes.filter(n => n.kids[0] === '열기').length, 2);
  t('왜 버튼을 안 뒀는지 적어 뒀다', v.all.indexOf('되돌릴 수 없습니다') >= 0, true);
  t('같은 사업장 판정 기준을 밝힌다', v.all.indexOf('표기 차이를 지운 회사명') >= 0, true);
}
// 갈래 필터
{
  const r = scan({ contracts:[
    { id:'c1', companyName:'중복회사', signDate:'2026-01-01', kinds:['advisory'], typeCodes:{ advisory:'a' } },
    { id:'c2', companyName:'중복회사', signDate:'2026-02-01', kinds:['advisory'], typeCodes:{ advisory:'a' } },
    { id:'u1', companyName:'모를회사', signDate:'2026-01-01', kinds:['consulting'] },
    { id:'u2', companyName:'모를회사', signDate:'2026-02-01', kinds:['consulting'] }
  ]});
  const all = renderSweep(r, 'all');
  t('전체 보기엔 둘 다', all.all.indexOf('중복회사') >= 0 && all.all.indexOf('모를회사') >= 0, true);
  const only = renderSweep(r, 'dup');
  t('★ 중복만 누르면 그것만', only.all.indexOf('중복회사') >= 0 && only.all.indexOf('모를회사') < 0, true);
  const none = renderSweep(r, 'again');
  t('그 갈래가 없으면 안내한다', none.all.indexOf('이 갈래에는 없습니다') >= 0, true);
}
{
  const v = renderSweep({ counts:{ dup:0, again:0, unknown:0, groups:0, scanned:12 }, groups:[] });
  t('★ 겹치는 게 없으면 깨끗하다고 말한다', v.all.indexOf('깨끗합니다') >= 0, true);
}

/* ═══ 7. 배선 ═══ */
t('계약관리 툴바에 버튼이 있다', /'🔎 지난 중복 훑기'/.test(src), true);
t('누를 때만 훑는다', /onClick:function\(\)\{ setDupSweep\(dupSweepScan\(\)\); \}/.test(src), true);
t('창이 연결돼 있다', /dupSweep && h\(DupSweepModal/.test(src), true);
t('★ 계약은 그 자리에서 열린다', /g\.kind === 'contract'[\s\S]{0,120}setModal\(\{ mode:'edit', cur:rec \}\)/.test(src), true);
t('★ 사건·업무는 그 화면으로 보낸다', /props\.onNavigate\(g\.goto\)/.test(src), true);
t('라우터가 이동 함수를 넘긴다', /h\(ContractManagement, \{ onNavigate:selectMenu \}\)/.test(src), true);
t('ContractManagement 가 props 를 받는다', /^function ContractManagement\(props\)\{/m.test(src), true);
t('밖에서 부를 수 있게 열어 뒀다', /window\.dupSweepScan\s*=/.test(src), true);
// ★ 저장 함수를 부르지 않는가 (훑기는 읽기 전용이다)
{
  const eng = slice('// ============ 지난 자료 중복 훑기 ============', '// 여러 건 중 가장 센 판정');
  t('★ 엔진에 dbSet 이 없다', /dbSet\(/.test(eng), false);
  t('★ 엔진에 dbUpsert·dbRemove 도 없다', /dbUpsert|dbRemove|dbPatch/.test(eng), false);
  const modal = slice('// ── 지난 자료 중복 훑기 결과 ──', '\n//  - 사건유형 (case_types)');
  t('★ 창에도 저장 호출이 없다', /dbSet\(|dbUpsert|dbRemove|dbPatch/.test(modal), false);
}

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===');
process.exit(fail ? 1 : 0);
