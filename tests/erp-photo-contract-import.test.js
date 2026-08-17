/* 사진첩 계약서 → 이알피 계약추가 가져오기 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const HTML = path.join(__dirname, '..', 'pu-erp.html');
const src = fs.readFileSync(HTML, 'utf8').replace(/\r\n/g, '\n');

function slice(a, b){
  const i = src.indexOf(a);
  if(i < 0) throw new Error('시작 표식 못찾음: ' + a);
  const j = src.indexOf(b, i);
  if(j < 0) throw new Error('끝 표식 못찾음: ' + b);
  return src.slice(i, j);
}

// 최상위 function 선언 하나를 통째로 꺼낸다 — 중괄호를 세어 끝을 찾는다.
// ('\n}\n' 같은 표식은 닫는 중괄호를 빠뜨려 SyntaxError 가 난다)
//
// 주의 두 가지:
// 1) 매개변수 목록에 기본값/구조분해로 중괄호가 들어있으면
//    (예: function bar(opts = {a:1}){...}) 본문이 아니라 매개변수 목록의
//    '{' 부터 세기 시작하면 조기 종료해버린다. 그래서 매개변수 목록을
//    괄호 깊이로 먼저 끝까지 건너뛴 다음에야 본문의 '{' 부터 센다.
// 2) 본문 안 문자열 리터럴에 짝 안 맞는 중괄호가 있으면 그래도 잘못 잘릴 수
//    있다. 이건 토크나이저 없이는 완전히 못 막으므로, 대신 꺼낸 텍스트가
//    실제로 파싱되는지 검증해서 실패하면 "이 함수, 잘렸을 수 있음" 이라고
//    이름을 콕 집어 알려준다 (원래 harness 코드 위치를 가리키는 뜬금없는
//    SyntaxError 대신).
function fn(name){
  const marker = 'function ' + name + '(';
  const start = src.indexOf(marker);
  if(start < 0) throw new Error('함수 못찾음: ' + name);

  // 매개변수 목록을 괄호 깊이로 건너뛴다 — 그 안의 '{'/'}' (기본값 객체 등)는
  // 본문 중괄호 세기에 끼어들면 안 된다.
  let pdepth = 0, parenEnd = -1;
  for(let i = start + marker.length - 1; i < src.length; i++){
    if(src[i] === '(') pdepth++;
    else if(src[i] === ')'){ pdepth--; if(pdepth === 0){ parenEnd = i; break; } }
  }
  if(parenEnd < 0) throw new Error('매개변수 목록 끝을 못찾음: ' + name);

  const bodyStart = src.indexOf('{', parenEnd + 1);
  if(bodyStart < 0) throw new Error('함수 본문 시작을 못찾음: ' + name);

  let depth = 0;
  for(let i = bodyStart; i < src.length; i++){
    if(src[i] === '{') depth++;
    else if(src[i] === '}'){
      depth--;
      if(depth === 0){
        const extracted = src.slice(start, i + 1);
        try{
          new vm.Script(extracted); // 꺼낸 텍스트가 실제로 파싱되는지 확인
        } catch(e){
          throw new Error('함수 추출이 잘렸을 가능성 있음: ' + name + ' (' + e.message + ')');
        }
        return extracted;
      }
    }
  }
  throw new Error('함수 끝을 못찾음: ' + name);
}

let pass = 0, fail = 0;
const t = (name, got, want) => {
  const G = JSON.stringify(got), W = JSON.stringify(want);
  if(G === W) pass++;
  else { fail++; console.log('FAIL ' + name + '\n  got  = ' + G + '\n  want = ' + W); }
};

/* ═══ 1. PuPhotoStore 로드 + 초기화 ═══ */
{
  t('★ pu-photo-store.js 를 로드한다', /<script src="js\/pu-photo-store\.js\?v=\d+"><\/script>/.test(src), true);
  t('★ 인증 완료 시 PuPhotoStore.init 을 부른다', /PuPhotoStore\.init\(\s*\{\s*db:\s*fbDb,\s*uid:\s*user\.uid\s*\}\s*\)/.test(src), true);
}

/* ═══ 2. erpVatTextToFlag — 부가세 문구 판정 ═══ */
{
  const c = vm.createContext({});
  vm.runInContext(fn('erpVatTextToFlag'), c);
  t('"포함" 이 들어있으면 체크', c.erpVatTextToFlag('부가세 포함'), true);
  t('"별도" 이 들어있으면 해제', c.erpVatTextToFlag('부가세 별도'), false);
  t('빈 문자열은 건드리지 않음(null)', c.erpVatTextToFlag(''), null);
  t('애매한 문구도 건드리지 않음(null)', c.erpVatTextToFlag('추후 협의'), null);
  t('undefined 도 null', c.erpVatTextToFlag(undefined), null);
  t('"포함"과 "별도"가 둘 다 있으면 건드리지 않음(null)', c.erpVatTextToFlag('부가세 별도(포함 여부 추후 확정)'), null);
}

/* ═══ 3. erpBuildContractPhotoMatches — 회사명으로 후보 찾기 ═══ */
{
  const c = vm.createContext({});
  vm.runInContext(fn('erpNormName'), c);
  vm.runInContext(slice('// 두 문자열의 최장 공통 부분문자열 길이', 'function _erpNameCmp('), c);
  vm.runInContext(fn('_erpNameCmp'), c);
  /* 최저점수 상수는 함수 밖 전역이라 fn() 하나로는 안 딸려온다.
     예전엔 그 뒤의 장식용 「// ====」 배너까지 slice 로 쓸어와 상수 + 함수 세 개를
     통째로 물어왔다 — 배너 문구만 바꿔도 이 검사가 엉뚱한 이유로 깨졌다.
     값은 여기 직접 넣고, 소스의 실제 값은 아래에서 따로 고정해 지킨다. */
  c.ERP_PHOTO_MATCH_MIN_SCORE = 60;
  vm.runInContext(fn('erpBuildContractPhotoMatches'), c);
  t('★ 후보 최저점수가 60으로 고정돼 있다(바뀌면 의도한 것인지 봐야 한다)',
    /var ERP_PHOTO_MATCH_MIN_SCORE\s*=\s*60;/.test(src), true);

  const items = [
    { id:'p1', year:'2026', fields:{ company:'주식회사 유원에프앤비' }, at:1000 },
    { id:'p2', year:'2025', fields:{ company:'가야엔지니어링' }, at:2000 },
    { id:'p3', year:'2026', fields:{ company:'' }, at:3000 },            // 회사명 없음 — 후보에서 빠져야 함
    { id:'p4', year:'2024', fields:{ company:'유원에프앤비 지점' }, at:4000 }, // 부분 일치도 잡혀야 함
  ];

  const r1 = c.erpBuildContractPhotoMatches('유원에프앤비', items);
  t('회사명이 일치/포함되는 사진만 후보로 나온다', r1.map(x => x.id).sort(), ['p1', 'p4']);
  t('★ 점수 높은 것이 먼저 온다', r1.map(x => x.id), ['p1', 'p4']);
  t('회사명이 없는 사진은 후보에서 빠진다', r1.some(x => x.id === 'p3'), false);
  t('회사명이 2글자 미만이면 후보 없음', c.erpBuildContractPhotoMatches('유', items), []);
  t('빈 배열이면 후보 없음', c.erpBuildContractPhotoMatches('유원에프앤비', []), []);
}

/* ═══ 4. erpContractPhotoApplyPatch — 고를 값 계산 ═══ */
{
  const c = vm.createContext({});
  vm.runInContext(fn('erpVatTextToFlag'), c);
  vm.runInContext(fn('erpContractPhotoApplyPatch'), c);

  const baseF = {
    amounts:{ consulting:0 }, briefs:{ consulting:'' },
    company:{ name:'유원에프앤비', bizNo:'', ceo:'', address:'' },
    contractFeeVatIncluded:false
  };
  const fields1 = {
    deposit:'500000', scope:'취업규칙 정비', signDate:'2026-07-01',
    startDate:'2026-07-01', endDate:'2027-06-30', vat:'별도',
    ceo:'김대표', address:'서울시 강남구', bizno:'1234567890'
  };
  const r1 = c.erpContractPhotoApplyPatch(fields1, 'consulting', baseF);
  t('계약금이 채워진다', r1.patch.amounts.consulting, 500000);
  t('업무요약이 채워진다', r1.patch.briefs.consulting, '취업규칙 정비');
  t('계약일이 채워진다', r1.patch.signDate, '2026-07-01');
  t('계약기간이 채워진다', [r1.patch.startDate, r1.patch.endDate], ['2026-07-01', '2027-06-30']);
  t('★ 부가세 "별도" → 체크 해제', r1.patch.contractFeeVatIncluded, false);
  t('비어 있던 대표자·주소·사업자번호가 덤으로 채워진다',
    [r1.patch.company.ceo, r1.patch.company.address, r1.patch.company.bizNo],
    ['김대표', '서울시 강남구', '1234567890']);
  t('미리보기 줄에 계약금이 사람이 읽을 형태로 들어간다',
    r1.previewLines.some(l => l.indexOf('500,000') >= 0), true);

  // 부가세 문구가 애매하면 그 칸은 patch 에 아예 없어야 한다(안 건드림)
  const fields2 = Object.assign({}, fields1, { vat:'추후 협의' });
  const r2 = c.erpContractPhotoApplyPatch(fields2, 'consulting', baseF);
  t('★ 부가세가 애매하면 patch 에 그 키 자체가 없다', 'contractFeeVatIncluded' in r2.patch, false);
  t('애매한 부가세 원문을 미리보기에 남긴다', r2.previewLines.some(l => l.indexOf('추후 협의') >= 0), true);

  // 이미 채워진 대표자·주소·사업자번호는 안 건드린다
  const filledF = Object.assign({}, baseF, { company: Object.assign({}, baseF.company, { ceo:'기존대표' }) });
  const r3 = c.erpContractPhotoApplyPatch(fields1, 'consulting', filledF);
  t('★ 이미 채워진 대표자는 안 건드린다', r3.patch.company.ceo, '기존대표');
  t('비어 있던 주소는 그대로 채워진다', r3.patch.company.address, '서울시 강남구');

  // 쉼표(천단위 구분)·통화기호가 들어간 금액도 온전히 파싱돼야 한다 —
  // parseInt는 쉼표에서 멈추므로 "5,000,000원" 을 그대로 넣으면 5원으로 잘린다.
  const fieldsComma = Object.assign({}, fields1, { deposit:'5,000,000원' });
  const rComma = c.erpContractPhotoApplyPatch(fieldsComma, 'consulting', baseF);
  t('★ 쉼표+통화기호가 섞인 계약금이 잘리지 않고 온전히 들어간다', rComma.patch.amounts.consulting, 5000000);
  t('쉼표 없는 금액은 그대로(회귀 없음)', c.erpContractPhotoApplyPatch(Object.assign({}, fields1, { deposit:'500000' }), 'consulting', baseF).patch.amounts.consulting, 500000);

  // 계약금(deposit)이 없고 수수료(fee)만 있으면 fee 로 대체돼야 한다
  const fieldsFeeOnly = { fee:'1,200,000원', scope:'급여대행' };
  const rFee = c.erpContractPhotoApplyPatch(fieldsFeeOnly, 'consulting', baseF);
  t('★ 계약금이 없으면 수수료(fee)에서 금액을 가져온다', rFee.patch.amounts.consulting, 1200000);

  // 계약금·수수료가 둘 다 없거나 0이면 patch 에 amounts 키 자체가 없어야 한다(0을 쓰지 않는다)
  const rNoAmt = c.erpContractPhotoApplyPatch({ scope:'업무 없음' }, 'consulting', baseF);
  t('★ 금액이 없으면 patch 에 amounts 키가 아예 없다', 'amounts' in rNoAmt.patch, false);
  const rZeroAmt = c.erpContractPhotoApplyPatch({ deposit:'0원', fee:'0' }, 'consulting', baseF);
  t('★ 금액이 0이어도 patch 에 amounts 키가 아예 없다', 'amounts' in rZeroAmt.patch, false);

  /* ── 보수·계약금이 둘 다 읽혔을 때 — 기계가 고르지 않는다 ──
     fee 는 판독기가 «보수·자문료·용역비» 를 모두 담는 칸이라 「보수」로 부른다. */
  const rBoth = c.erpContractPhotoApplyPatch({ deposit:'3,000,000원', fee:'10,000,000원' }, 'consulting', baseF);
  t('★ 계약금·보수가 다르면 둘 다 후보로 내놓는다',
    (rBoth.amountChoices || []).map(x => [x.key, x.label, x.amount]),
    [['deposit', '계약금', 3000000], ['fee', '보수', 10000000]]);
  t('안 고르면 계약금이 기본값(칸 이름과 같다)', rBoth.patch.amounts.consulting, 3000000);
  const rSame = c.erpContractPhotoApplyPatch({ deposit:'3,000,000원', fee:'3,000,000원' }, 'consulting', baseF);
  t('둘이 같은 금액이면 고르라고 묻지 않는다', rSame.amountChoices, null);
  t('한쪽만 있으면 고르라고 묻지 않는다', rFee.amountChoices, null);

  /* ── ★ 못 읽은 금액은 «못 읽었다고 말한다» (부가세와 같은 태도) ──
     "1,000만원" 은 쉼표만 떼면 1,000원이 된다 — 1만 배 틀린 값이 조용히 들어가면 안 된다.
     단위를 해석하지는 않는다. 원문을 보여 주고 사람이 판단하게 한다. */
  const rClean = c.erpContractPhotoApplyPatch({ deposit:'5,000,000원' }, 'consulting', baseF);
  t('깨끗이 읽힌 금액에는 군말을 안 붙인다',
    rClean.previewLines.some(l => l.indexOf('원문') >= 0), false);
  const rMan = c.erpContractPhotoApplyPatch({ deposit:'1,000만원' }, 'consulting', baseF);
  t('★ "1,000만원" 은 숫자만 읽혔다고 알려 준다',
    rMan.previewLines.some(l => l.indexOf('원문') >= 0 && l.indexOf('1,000만원') >= 0), true);
  const rRange = c.erpContractPhotoApplyPatch({ deposit:'1,000,000~2,000,000' }, 'consulting', baseF);
  t('★ 범위로 적힌 금액도 알려 준다',
    rRange.previewLines.some(l => l.indexOf('원문') >= 0), true);

  // 위 호출들이 baseF 및 그 중첩 객체를 건드리지 않았어야 한다 — Preact 상태 업데이트는
  // 새 객체를 필요로 하므로, 여기서 조용히 원본을 고치는 회귀는 눈에 안 띄고 상태갱신을 깨뜨린다.
  t('★ baseF.amounts.consulting 이 원래 값 그대로다(비변형)', baseF.amounts.consulting, 0);
  t('★ baseF.briefs.consulting 이 원래 값 그대로다(비변형)', baseF.briefs.consulting, '');
  t('★ baseF.company.ceo 가 원래 값 그대로다(비변형)', baseF.company.ceo, '');
}

(async () => {
  /* ═══ 5. erpLoadMyContractPhotos — 캐시 로더 ═══ */
  await (async () => {
    const c = vm.createContext({ window: { _erpErrLog: null }, fbAuthUid: 'u1' });
    vm.runInContext(slice('var _erpMyContractPhotos = null;', 'function erpLoadMyContractPhotos('), c); // 전역 변수 3개
    vm.runInContext(fn('erpLoadMyContractPhotos'), c);

    let listYearCalls = 0;
    c.PuPhotoStore = {
      listYears: function(){ return Promise.resolve(['2026', '2025']); },
      listYear: function(year){
        listYearCalls++;
        if(year === '2026'){
          return Promise.resolve({
            a1: { read: { kind:'contract', fields:{ company:'가나다' } }, __year:'2026', upAt: 111 },
            a2: { read: { kind:'card', fields:{} }, __year:'2026' }   // 계약서가 아닌 것 — 걸러져야 함
          });
        }
        return Promise.resolve({
          b1: { read: { kind:'contract', fields:{ company:'라마바' } }, __year:'2025', upAt: 222 }
        });
      }
    };

    await new Promise(function(resolve){
      c.erpLoadMyContractPhotos(function(items){
        t('계약서 kind 만 걸러진다(2건)', items.length, 2);
        t('연도별 항목이 다 합쳐진다', items.map(x => x.id).sort(), ['a1', 'b1']);
        // 두 번째 호출은 캐시에서 바로 온다 — listYear 가 다시 불리지 않아야 한다
        const callsBefore = listYearCalls;
        c.erpLoadMyContractPhotos(function(items2){
          t('두 번째 호출은 캐시를 그대로 돌려준다', items2.length, 2);
          t('두 번째 호출은 새로 안 읽는다', listYearCalls, callsBefore);
          resolve();
        });
      });
    });
  })();

  /* ═══ 6. PhotoContractPickerModal — 후보 목록 팝업 ═══
     ★ 「함수가 있다」만 보면 만들어 놓고 화면에 안 붙여도 통과한다.
       h() 를 가짜로 세워 «실제로 그려» 무엇이 나오는지, 누르면 무엇이 불리는지 본다. */
  {
    const c = vm.createContext({});
    // 아주 작은 h() — 그린 결과를 그대로 나무 구조로 돌려준다
    vm.runInContext([
      'function h(tag, props){',
      '  var kids = Array.prototype.slice.call(arguments, 2);',
      '  return { tag:tag, props:props||{}, kids:kids };',
      '}',
      'var escCalls = 0;',
      'function useEscClose(){ escCalls++; }',
      'function fmtDate(ts){ return "2026.08.15"; }'
    ].join('\n'), c);
    vm.runInContext(fn('PhotoContractPickerModal'), c);

    const items = [
      { id:'p1', year:'2026', at:1000, score:100, fields:{ company:'유원에프앤비', signDate:'2026-07-01', docName:'컨설팅 계약서' } },
      { id:'p2', year:'2025', at:2000, score:70,  fields:{ company:'유원에프앤비 지점' } }
    ];
    let closed = 0, picked = null;
    const tree = c.PhotoContractPickerModal({ items: items, onClose:function(){ closed++; }, onSelect:function(it){ picked = it; } });

    // 나무를 훑어 원하는 것을 찾는다
    function walk(n, out){
      if(!n || typeof n !== 'object') return out;
      if(Array.isArray(n)){ n.forEach(function(x){ walk(x, out); }); return out; }
      if(n.tag){ out.push(n); walk(n.kids, out); }
      return out;
    }
    const nodes = walk(tree, []);
    const texts = [];
    (function collect(n){
      if(n == null) return;
      if(Array.isArray(n)){ n.forEach(collect); return; }
      if(typeof n === 'string'){ texts.push(n); return; }
      if(n.kids) collect(n.kids);
    })(tree);

    t('★ 제목이 뜬다', texts.indexOf('📷 사진첩 계약서에서 가져오기') >= 0, true);
    t('★ Esc 로 닫히게 걸어 두었다', c.escCalls, 1);
    t('★ 후보 수만큼 줄을 그린다', nodes.filter(function(n){ return n.props && n.props.onMouseEnter; }).length, 2);
    /* 계약일이 있으면 그걸, 없으면 찍은 날짜를 보여 준다 — 「날짜 미상」이 함부로 뜨면 안 된다 */
    t('계약일이 있으면 계약일을 보여 준다', texts.indexOf('2026-07-01') >= 0, true);
    t('계약일이 없으면 찍은 날짜로 대신한다', texts.indexOf('2026.08.15') >= 0, true);
    t('문서명이 있으면 문서명을', texts.indexOf('컨설팅 계약서') >= 0, true);
    t('문서명이 없으면 회사명으로', texts.indexOf('유원에프앤비 지점') >= 0, true);

    const rows = nodes.filter(function(n){ return n.props && n.props.onMouseEnter; });
    rows[1].props.onClick();
    t('★ 누른 그 건이 onSelect 로 넘어온다', picked && picked.id, 'p2');
    // 바깥을 누르면 닫힌다 (안쪽을 눌렀을 때는 안 닫혀야 한다)
    tree.props.onClick({ stopPropagation:function(){}, target:tree, currentTarget:tree });
    t('★ 바깥을 누르면 닫힌다', closed, 1);
    tree.props.onClick({ stopPropagation:function(){}, target:{}, currentTarget:tree });
    t('★ 안쪽을 누르면 안 닫힌다 (고르다 말고 창이 사라지면 안 된다)', closed, 1);
    const xBtn = nodes.filter(function(n){ return n.tag === 'button' && n.props.onClick === undefined ? false : n.kids && n.kids.indexOf('×') >= 0; })[0];
    xBtn.props.onClick();
    t('× 로도 닫힌다', closed, 2);

    t('후보가 없으면 줄이 없다',
      walk(c.PhotoContractPickerModal({ items:[], onClose:function(){}, onSelect:function(){} }), [])
        .filter(function(n){ return n.props && n.props.onMouseEnter; }).length, 0);
    t('items 를 안 넘겨도 안 죽는다',
      !!c.PhotoContractPickerModal({ onClose:function(){}, onSelect:function(){} }), true);
  }

  /* ═══ 7. ContractModal 배선 ═══ */
  {
    const blk = slice('function ContractModal(props){', '\n// ============ 방금 들어온 건 표시 ============');
    t('★ photoMatches 자리가 있다', /var pm = useState\(\[\]\); var photoMatches = pm\[0\]; var setPhotoMatches = pm\[1\];/.test(blk), true);
    t('★ 창을 열 때 한 번 읽어 둔다', /useEffect\(function\(\)\{ erpLoadMyContractPhotos\(function\(\)\{ setContractPhotosLoaded\(true\); \}\); \}, \[\]\);/.test(blk), true);
    /* ★ 계약유형을 둘 이상 골랐으면 어느 쪽 계약금에 넣을지 알 수 없다 — 아예 안 찾는다 */
    t('★ 계약유형이 «정확히 하나»일 때만 찾는다', /\(f\.kinds\|\|\[\]\)\.length !== 1/.test(blk), true);
    t('★ 아니면 후보를 비운다 (앞서 찾은 것이 남아 있으면 안 된다)', /\{ setPhotoMatches\(\[\]\); return; \}/.test(blk), true);
    t('회사명·유형 수·읽기 완료가 바뀌면 다시 찾는다',
      /\}, \[f\.company\.name, \(f\.kinds\|\|\[\]\)\.length, contractPhotosLoaded\]\);/.test(blk), true);
    t('★ 배지는 찾은 것이 있을 때만 보인다', /photoMatches\.length > 0 &&/.test(blk), true);
    /* ★★ 배지가 «어느 탭에» 있는지 — 이 기능이 실제로 보이느냐를 가른다.
       계약유형 체크박스는 계약정보 탭에 있고, 새 계약은 유형이 0개로 시작한다.
       배지를 기업정보 탭(회사명 칸 옆)에 두면 「유형 하나만 체크」 조건이 그 화면에서는
       영영 성립하지 않아, 새 계약에서는 배지가 한 번도 안 뜬다(수정 화면에서만 보였다).
       실제로 그렇게 배포됐다 — 유형을 고르는 바로 그 화면에 있어야 한다. */
    {
      const badgeAt = blk.indexOf("'📷 계약서 ' + photoMatches.length");
      const companyTabAt = blk.indexOf("if(tab === 'company'){");
      const contractTabAt = blk.indexOf("} else if(tab === 'contract'){");
      t('배지·두 탭의 자리를 모두 찾을 수 있다',
        badgeAt > 0 && companyTabAt > 0 && contractTabAt > companyTabAt, true);
      t('★ 배지는 계약정보 탭에 있다 (기업정보 탭이 아니다)',
        badgeAt > contractTabAt, true);
    }
    t('배지에 몇 건인지 적는다', /'📷 계약서 ' \+ photoMatches\.length \+ '건 발견'/.test(blk), true);
    t('★ 배지를 누르면 목록이 열린다', /onClick:function\(\)\{ setPhotoPickerOpen\(true\); \}/.test(blk), true);
    t('목록 팝업이 실제로 그려진다', /photoPickerOpen && h\(PhotoContractPickerModal, \{/.test(blk), true);
    t('★ 고르면 채울 값을 계산한다', /erpContractPhotoApplyPatch\(it\.fields, kindV, f\)/.test(blk), true);
    /* ★ 바로 안 채운다 — 판독 글자는 틀릴 수 있어 사람이 보고 정해야 한다 */
    t('★ 고른 뒤 바로 안 채우고 미리보기로 넘긴다', /setPhotoPreview\(\{ item: it, kindV: kindV, result: result \}\)/.test(blk), true);
    t('무엇이 바뀌는지 줄줄이 보여 준다', /photoPreview\.result\.previewLines\.map/.test(blk), true);
    /* ★ 지키려는 것은 「고를 때가 아니라 적용을 눌러야 비로소 f 를 덮어쓴다」는 것이지,
       그 한 줄의 «생김새» 가 아니다. 전에는 표현식을 통째로 못 박아, 금액 고르기가 들어오면서
       patch 를 지역 변수로 한 번 거치자 뜻은 그대로인데 검사만 깨졌다.
       ContractModal 전체에는 setF 가 수십 군데 있으니(폼 전체의 공용 갱신 방식) 이 기능의
       두 곳만 잘라서 본다 — 고르는 곳에는 없어야 하고, 적용하는 곳에는 있어야 한다. */
    const pickBlk = slice('photoPickerOpen && h(PhotoContractPickerModal, {', 'photoPreview && h(\'div\', {');
    t('★ 고르는 단계에서는 절대 안 덮어쓴다 (setF 가 없다)', /setF\(/.test(pickBlk), false);
    const applyBlk = slice('photoPreview && h(\'div\', {', '\n// ============ 방금 들어온 건 표시 ============');
    t('★ 적용하는 곳에서만 덮어쓴다', (applyBlk.match(/setF\(/g) || []).length, 1);
    t('★ 덮어쓰는 값은 미리보기가 계산해 둔 patch 다',
      /Object\.assign\(\{\}, prev, patch\)|Object\.assign\(\{\}, prev, photoPreview\.result\.patch\)/.test(applyBlk), true);
    t('가져올 값이 없으면 그렇게 말한다', /'이 계약서에서 가져올 값이 없습니다'/.test(blk), true);
    t('★ 그때는 「적용」을 누를 수 없다 (눌러도 아무 일 없는 단추를 두지 않는다)',
      /disabled: !photoPreview\.result\.previewLines\.length/.test(blk), true);
    t('채우고 나면 몇 가지를 채웠는지 알려 준다', /'📷 사진첩 계약서에서 ' \+ photoPreview\.result\.previewLines\.length \+ '가지를 채웠습니다'/.test(blk), true);
  }

  /* ═══ 8. 📄 연결된 계약서 — 한 줄 + 팝업 안 팝업 ═══
     대표 지시 2026-08-17: 「계약정보에 서식이 다 나오면 복잡하니 팝업으로」. */
  {
    const blk = slice('function ContractModal(props){', '\n// ============ 방금 들어온 건 표시 ============');
    const applyBlk = slice('photoPreview && h(\'div\', {', '\n// ============ 방금 들어온 건 표시 ============');

    /* ★ 출처를 남긴다 — 안 하면 적용하는 순간 어느 사진에서 왔는지 잃는다 */
    t('★ 적용할 때 어느 사진에서 왔는지 계약에 적어 둔다',
      /srcPhoto:\s*\{[\s\S]{0,240}?id: photoPreview\.item\.id[\s\S]{0,240}?year: photoPreview\.item\.year/.test(applyBlk), true);

    /* ★ 한 줄은 «가져온 적 있는» 계약에만 — 옛 계약에는 안 나온다 */
    t('★ 연결된 사진이 있을 때만 한 줄이 나온다', /f\.srcPhoto && f\.srcPhoto\.id &&/.test(blk), true);
    t('한 줄에 「원본·판독 보기」 단추가 있다', /'원본·판독 보기'/.test(blk), true);
    t('★ 누르면 팝업이 열린다 (계약정보에 바로 펼치지 않는다)', /setDocViewOpen\(true\)/.test(blk), true);
    t('팝업이 실제로 그려진다', /docViewOpen && f\.srcPhoto && h\(ContractDocViewModal, \{/.test(blk), true);

    const vw = fn('ContractDocViewModal');

    /* ★ 겹치는 순서 — 미리보기 위에 떠야 한다. 아래로 깔리면 눌러도 안 보인다. */
    const zView = Number((vw.match(/zIndex:\s*(\d+)/) || [])[1]);
    const zPrev = Number((applyBlk.match(/zIndex:\s*(\d+)/) || [])[1]);
    t('두 창의 겹침 순서를 읽을 수 있다', zView > 0 && zPrev > 0, true);
    t('★ 원본 보기 창이 미리보기보다 위에 뜬다', zView > zPrev, true);

    /* ★ 원본은 본인 것만 읽힌다 — 막히면 까닭을 적고, 판독 결과는 그대로 보여야 한다 */
    t('★ 원본이 안 열려도 조용히 비워 두지 않는다', /원본을 열 수 없습니다/.test(vw), true);
    t('원본 읽기는 공용 저장 층을 거친다', /PuPhotoStore\.loadFull\(src\.year, src\.id\)/.test(vw), true);
    t('★ 판독 결과는 이미 받아 둔 목록에서 꺼낸다 (다시 안 읽는다)',
      /erpLoadMyContractPhotos\(function\(items\)\{/.test(vw), true);

    /* ★ 좁은 화면 — 좌우가 안 들어가니 한 쪽씩 보는 갈래를 둔다 */
    t('★ 폰에서는 원본만 먼저 보여 준다', /useState\(IS_MOBILE \? 'scan' : 'both'\)/.test(vw), true);
    t('나란히·원본만·판독만 세 갈래가 있다',
      /'나란히 보기'/.test(vw) && /'원본만'/.test(vw) && /'판독만'/.test(vw), true);

    /* 어느 칸으로 들어갔는지 표시 — 「이 금액 어디서 나왔지」를 여기서 끝낸다 */
    t('판독 항목마다 어느 칸에 쓰였는지 적는다', /into: *'계약금'/.test(src), true);
    t('★ 계약서의 모든 조항(pairs)까지 이어 보여 준다', /readFields\.pairs/.test(vw), true);
  }

  console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===');
  process.exit(fail ? 1 : 0);
})();
