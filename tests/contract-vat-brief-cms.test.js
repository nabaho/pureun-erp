/* 계약창 — 부가세 안내 · 업무 요약 자리 옮기기 · CMS 를 세부설정 박스로
   ★ 가장 위험한 것: 6열 격자에서 칸 수가 틀리면 모든 칸이 한 칸씩 밀린다(조용히).
     잔금 줄의 칸 수를 세어 고정한다.
   ★ 두 번째: CMS 를 박스 안으로 옮기면서, 계약유형을 안 고른 계약에서 CMS 가
     아예 사라져 끌 수도 없게 되면 안 된다. */
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

/* ═══ 1. 부가세 안내 — 켤 때만, 음소거 지켜짐 ═══ */
function vatCtx(muted){
  const store = {};
  if(muted) store['pureun_v6_vat_hint_off'] = '1';
  const shown = [];
  const c = {
    console, Object, JSON, String, Number, Promise,
    localStorage: {
      getItem(k){ return (k in store) ? store[k] : null; },
      setItem(k, v){ store[k] = String(v); }
    },
    window: {},
    showAlertMutable(msg, opts){ shown.push({ msg, opts }); return Promise.resolve(); }
  };
  vm.createContext(c);
  vm.runInContext(slice('var VAT_HINT_OFF_KEY =', '// 「다시 보지 않기」가 붙은 알림창'), c);
  return { c, shown, store };
}
{
  const { c, shown } = vatCtx(false);
  c.vatIncludedHint(true, '잔금');
  t('★ 켤 때 안내가 뜬다', shown.length, 1);
  t('★ 최종 금액을 넣으라고 말한다', /부가세를 더한 최종 금액/.test(shown[0].msg), true);
  t('★ 왜 위험한지 밝힌다', /적게 잡힙니다/.test(shown[0].msg), true);
  t('어느 칸인지 알려준다', /잔금/.test(shown[0].msg), true);
  t('다시 보지 않기가 붙는다', shown[0].opts.muteLabel, '다시 보지 않기');
}
{
  const { c, shown } = vatCtx(false);
  c.vatIncludedHint(false, '잔금');
  t('★ 끌 때는 안 뜬다 (되돌릴 수 있는 일이다)', shown.length, 0);
}
{
  const { c, shown } = vatCtx(true);
  c.vatIncludedHint(true, '잔금');
  t('★ 다시 보지 않기를 켰으면 안 뜬다', shown.length, 0);
}
{
  const { c, shown, store } = vatCtx(false);
  c.vatIncludedHint(true, '계약금');
  t('처음엔 음소거가 아니다', c.vatHintMuted(), false);
  shown[0].opts.onMute();
  t('★ onMute 를 부르면 그 뒤로 음소거', c.vatHintMuted(), true);
  t('음소거가 저장된다', store['pureun_v6_vat_hint_off'], '1');
  const again = [];
  c.showAlertMutable = function(m, o){ again.push(m); return Promise.resolve(); };
  c.vatIncludedHint(true, '계약금');
  t('★ 음소거 뒤 다시 켜도 안 뜬다', again.length, 0);
}
{
  // showAlertMutable 이 없어도(옛 브라우저·부분 로드) 체크 자체는 막히지 않아야 한다
  const { c } = vatCtx(false);
  c.showAlertMutable = undefined;
  let threw = '';
  try { c.vatIncludedHint(true, '잔금'); } catch(e){ threw = String(e.message); }
  t('★ 알림창이 없어도 안 터진다', threw, '');
}

/* ═══ 2. ★ 6열 격자의 칸 수 — 한 칸이라도 어긋나면 전부 밀린다 ═══ */
{
  const blk = slice("          if(isConsulting || isCase || isOther){", '          // 기금/업체/기타/상담');
  t('격자는 여전히 6열', /gridTemplateColumns:'90px 1fr 60px 120px auto auto'/.test(blk), true);
  // 잔금 줄: briefCell(1~2열 묶음) + 라벨 + input + 단위 + 토글 = 5개 자리
  t('★ 업무 요약이 잔금 줄로 들어갔다', /briefCell\(kindV\),\s*[\r\n]+\s*h\('span', \{ style:\{ fontSize:'10\.5px', color:'#64748b', fontWeight:600, textAlign:'right' \} \}, isConsulting \? '잔금' : '성공보수'\)/.test(blk), true);
  t('★ 옛 전체폭 업무 요약 줄이 사라졌다', /briefRow\(kindV\)/.test(blk), false);
  t('★ 잔금 줄 앞에 빈 칸 두 개가 남아 있지 않다',
    /h\('span'\),\s*[\r\n]+\s*h\('span'\),\s*[\r\n]+\s*h\('span', \{ style:\{ fontSize:'10\.5px'[^}]*\} \}, isConsulting \? '잔금'/.test(blk), false);
  t('부가세 줄은 그대로 빈 칸 3개 + 체크 + 빈 칸 2개',
    /h\('span'\), h\('span'\), h\('span'\),\s*[\r\n]+\s*h\('label'[\s\S]*?balanceFeeVatIncluded[\s\S]*?h\('span'\), h\('span'\)/.test(blk), true);
}

/* ═══ 2-2. ★★ 격자 칸 수를 실제로 센다 — 이게 조용히 어긋나면 모든 칸이 밀린다 ═══ */
function gridCtx(kindV, opts){
  opts = opts || {};
  const c = {
    console, Object, JSON, Array, String, Number, parseFloat, parseInt,
    f: Object.assign({
      kinds:[kindV], typeCodes:{}, amounts:{}, briefs:{},
      successFee:0, successFeeType:'amount',
      contractFeeVatIncluded:false, balanceFeeVatIncluded:false, fundVatIncluded:false
    }, opts.f || {}),
    BRIEF_KINDS:['case','consulting','fund','other'], BRIEF_MAX:40, BRIEF_PH:{},
    NumberInput:function NumberInput(){},
    kindInfo(){ return { color:'#000', icon:'X', label:'라벨' }; },
    getKindTypes(){ return [{ code:'t1', short:'약', name:'이름' }]; },
    setTypeCodeFor(){ return function(){}; },
    setAmountFor(){ return function(){}; },
    setSimple(){ return function(){}; },
    setBriefFor(){ return function(){}; },
    setF(){}, vatIncludedHint(){},
    // 아래쪽 종류(기금·업체·상담)는 아직 옛 briefRow 를 쓴다 — 전체폭 한 줄이라 열 계산에서 빼고 센다
    briefRow(){ return { tag:'div', props:{ style:{ gridColumn:'1 / -1' } }, kids:[] }; },
    h(tag, props){
      const kids = Array.prototype.slice.call(arguments, 2);
      return { tag, props: props || {}, kids };
    }
  };
  vm.createContext(c);
  vm.runInContext(slice('  function cmsBlock(){', '  // 종류별 세부설정 그리드 안에 들어가는'), c);
  // 격자를 만드는 map 표현식을 통째로 평가한다 — f.kinds 에 한 종류만 넣어 두었으므로 결과는 한 칸짜리 배열
  const expr = slice('(f.kinds||[]).map(function(kindV){', ',\r\n        // CMS 자동이체');
  vm.runInContext('var __arr = ' + expr + ';', c);
  return c.__arr[0];
}
// 칸 하나가 차지하는 열 수 — 1~3 묶음은 2칸, 전체폭은 한 줄을 통째로 쓴다
function cellSpan(x){
  const gc = x && x.props && x.props.style && x.props.style.gridColumn;
  if(gc === '1 / 3') return 2;
  if(gc === '1 / -1') return 6;
  return 1;
}
{
  // ★ 세어야 할 것은 칸 개수가 아니라 "차지하는 열 수" 다 — briefCell 이 두 칸을 묶기 때문.
  //   합이 6의 배수가 아니면 어딘가 한 칸이 밀려 라벨과 입력칸이 어긋난다.
  ['consulting','case','other','fund','company','consult'].forEach(function(kv){
    const node = gridCtx(kv);
    const cells = node.kids.filter(function(x){ return x !== null && x !== undefined && x !== false; });
    const span = cells.reduce(function(s, x){ return s + cellSpan(x); }, 0);
    t('★ ' + kv + ' 격자가 열을 딱 맞게 채운다', span % 6, 0);
  });
}
{
  // 컨설팅: 메인행 6 + 부가세행 6 + 잔금행(briefCell 2 + 4칸) 6 + 부가세행 6 = 24열 / 23칸
  const node = gridCtx('consulting');
  const cells = node.kids.filter(function(x){ return x !== null && x !== undefined && x !== false; });
  t('★ 컨설팅은 4줄(24열)을 쓴다', cells.reduce(function(s, x){ return s + cellSpan(x); }, 0), 24);
  t('★ 칸 개수는 23 (briefCell 이 두 칸을 묶으므로 하나 적다)', cells.length, 23);
  const spanning = cells.filter(function(x){ return cellSpan(x) === 2; });
  t('★ 1~2열을 묶는 칸이 정확히 하나', spanning.length, 1);
  t('★ 그 칸이 업무 요약이다',
    JSON.stringify(spanning[0].kids).indexOf('업무 요약') >= 0, true);
  t('★ 컨설팅 격자에 전체폭 줄이 남아 있지 않다',
    cells.some(function(x){ return cellSpan(x) === 6; }), false);
  // 업무 요약 바로 다음 칸이 '잔금' 라벨이어야 한다 — 여기가 어긋나면 라벨이 밀린다
  const at = cells.indexOf(spanning[0]);
  t('★ 업무 요약 다음 칸이 잔금 라벨', JSON.stringify(cells[at + 1].kids).indexOf('잔금') >= 0, true);
  t('★ 그다음이 금액 입력칸', typeof cells[at + 2].tag === 'function', true);
}
{
  // 사건은 '성공보수' 라벨 — 컨설팅과 같은 자리여야 한다
  const node = gridCtx('case');
  const cells = node.kids.filter(function(x){ return x !== null && x !== undefined && x !== false; });
  const spanning = cells.filter(function(x){ return cellSpan(x) === 2; });
  const at = cells.indexOf(spanning[0]);
  t('★ 사건도 업무 요약 다음이 성공보수 라벨',
    JSON.stringify(cells[at + 1].kids).indexOf('성공보수') >= 0, true);
}
{
  // 상담사항은 업무 요약이 없다 — 그래도 빈 칸이 나와 열 수가 유지되어야 한다 (아래 branch 는 briefRow 사용)
  const node = gridCtx('consult');
  const cells = node.kids.filter(function(x){ return x !== null && x !== undefined && x !== false; });
  t('상담사항도 열을 딱 맞게 채운다', cells.reduce(function(s, x){ return s + cellSpan(x); }, 0) % 6, 0);
}

/* ═══ 3. ★ briefCell 이 격자 칸을 정확히 하나만 차지하는가 ═══ */
function briefCtx(kinds, briefs){
  const made = [];
  const c = {
    console, Object, JSON, Array, String, Number,
    BRIEF_KINDS: kinds || ['case','consulting','fund','other'],
    BRIEF_MAX: 40,
    BRIEF_PH: { consulting:'예) 취업규칙 정비' },
    f: { briefs: briefs || {} },
    setBriefFor(){ return function(){}; },
    setF(){},
    h(tag, props){
      const kids = Array.prototype.slice.call(arguments, 2);
      const node = { tag, props: props || {}, kids };
      made.push(node);
      return node;
    }
  };
  vm.createContext(c);
  vm.runInContext(slice('  function briefCell(kindV){', '  // 종류별 세부설정 그리드 안에 들어가는'), c);
  return { c, made };
}
{
  const { c } = briefCtx();
  const cell = c.briefCell('consulting');
  t('★ 1~2열을 묶어 한 칸으로', cell.props.style.gridColumn, '1 / 3');
  t('입력칸이 안에 있다', cell.kids.some(k => k && k.props && k.props.type === 'text'), true);
  t('글자수 제한이 걸려 있다', cell.kids.find(k => k && k.props && k.props.type === 'text').props.maxLength, 40);
  t('★ 좁아도 넘치지 않게 minWidth 0', cell.props.style.minWidth, 0);
  t('말풍선에 최대 글자수를 알려준다',
    /최대 40자/.test(cell.kids.find(k => k && k.props && k.props.type === 'text').props.title), true);
}
{
  // 요약이 없는 종류(상담사항)에서도 칸은 반드시 하나 나와야 한다 — 안 그러면 격자가 밀린다
  const { c } = briefCtx(['case']);
  const cell = c.briefCell('consult');
  t('★ 요약 없는 종류도 빈 칸을 내보낸다', cell.tag, 'span');
  t('★ 그 빈 칸도 1~2열을 묶는다', cell.props.style.gridColumn, '1 / 3');
  t('★ null 을 돌려주지 않는다 (격자 밀림 방지)', cell === null, false);
}
{
  const { c } = briefCtx(undefined, { consulting:'취업규칙 정비' });
  t('저장된 요약이 그대로 보인다',
    c.briefCell('consulting').kids.find(k => k && k.props && k.props.type === 'text').props.value, '취업규칙 정비');
}

/* ═══ 4. ★ CMS — 박스 안으로 옮겼고, 없어지지 않는다 ═══ */
function cmsCtx(isCMS, extra){
  const made = [];
  const c = {
    console, Object, JSON, Array, String, Number,
    f: Object.assign({ isCMS: isCMS }, extra || {}),
    setF(){},
    h(tag, props){
      const kids = Array.prototype.slice.call(arguments, 2);
      const node = { tag, props: props || {}, kids };
      made.push(node);
      return node;
    }
  };
  vm.createContext(c);
  vm.runInContext(slice('  function cmsBlock(){', '  // 잔금·성공보수 줄의 왼쪽 두 칸'), c);
  return { c, made };
}
{
  const { c, made } = cmsCtx(false);
  c.cmsBlock();
  const txt = made.flatMap(n => n.kids).filter(k => typeof k === 'string').join(' | ');
  t('꺼진 상태에도 CMS 줄은 보인다', /CMS 자동이체/.test(txt), true);
  t('★ 꺼졌으면 이체일 칸이 없다', made.some(n => n.props && n.props.type === 'number'), false);
  t('★ 꺼졌으면 1회성 칸도 없다', /1회성/.test(txt), false);
  t('체크박스는 있다', made.some(n => n.props && n.props.type === 'checkbox'), true);
}
{
  const { c, made } = cmsCtx(true, { cmsPayDay:'25' });
  c.cmsBlock();
  const txt = made.flatMap(n => n.kids).filter(k => typeof k === 'string').join(' | ');
  t('★ 켜면 이체일 칸이 같은 줄에 나온다', made.some(n => n.props && n.props.type === 'number'), true);
  t('이체일 값이 들어가 있다', made.find(n => n.props && n.props.type === 'number').props.value, '25');
  t('★ 켜면 1회성 칸도 나온다', /1회성/.test(txt), true);
  t('등록됨으로 표시가 바뀐다', /등록됨/.test(txt), true);
  t('동기화 안내가 나온다', /자동 동기화/.test(txt), true);
}
{
  // 옛 데이터: cmsPayDay 없이 taxInvoicePaymentDay 만 있는 계약
  const { c, made } = cmsCtx(true, { taxInvoicePaymentDay:'10일' });
  c.cmsBlock();
  t('★ 옛 칸(taxInvoicePaymentDay)에서도 이체일을 읽는다',
    made.find(n => n.props && n.props.type === 'number').props.value, '10');
}
/* ── CMS 를 업무 요약 바로 아랫줄로 붙였는가 (구분선 없이) ── */
{
  const { c } = cmsCtx(false, { kinds:['consulting'] });
  const root = c.cmsBlock();
  t('★ 굵은 구분선이 없다 (다른 구역처럼 보이지 않게)', !!(root.props.style || {}).borderTop, false);
  t('★ 업무 요약 바로 아래로 바짝 붙는다', root.props.style.marginTop, '4px');
  t('줄 자체가 옅은 상자로 묶여 있다', /borderRadius/.test(JSON.stringify(root.kids[0].props.style)), true);
}
{
  // 종류가 하나면 "계약 전체에 하나만" 안내가 필요 없다
  const { c, made } = cmsCtx(false, { kinds:['consulting'] });
  c.cmsBlock();
  const txt = made.flatMap(n => n.kids).filter(k => typeof k === 'string').join(' | ');
  t('종류 하나면 안내를 안 띄운다', /계약 전체에 하나만/.test(txt), false);
}
{
  // ★ CMS 는 계약 전체에 하나뿐인 값 — 종류를 여럿 고르면 그렇다고 밝혀야 오해가 없다
  const { c, made } = cmsCtx(false, { kinds:['consulting','fund'] });
  c.cmsBlock();
  const txt = made.flatMap(n => n.kids).filter(k => typeof k === 'string').join(' | ');
  t('★ 종류가 여럿이면 계약 전체에 하나만이라고 알린다', /계약 전체에 하나만/.test(txt), true);
}
{
  // kinds 가 없어도(옛 계약·신규) 터지지 않아야 한다
  const { c } = cmsCtx(false);
  let threw = '';
  try { c.cmsBlock(); } catch(e){ threw = String(e.message); }
  t('★ kinds 가 없어도 안 터진다', threw, '');
}
// 배선 — 박스 안으로 들어갔고, 옛 자리는 비었고, 유형 없을 때 대비가 있다
t('★ CMS 가 종류별 세부설정 박스 안에 있다',
  /\}\),\s*[\r\n]+\s*\/\/ CMS 자동이체 — 계약 전체에 하나뿐인 값[\s\S]{0,200}?cmsBlock\(\)\s*[\r\n]+\s*\),/.test(src), true);
t('★ 진행상태 아래 옛 CMS 칸이 사라졌다',
  /\/\/ CMS 자동이체 \(자문\/급여대행 계약에 적용\)/.test(src), false);
t('★ 계약유형을 안 골랐을 때도 CMS 를 손댈 수 있다',
  /\(f\.kinds\|\|\[\]\)\.length === 0 && h\('div', \{ className:'fld' \}[\s\S]{0,160}?cmsBlock\(\)\)/.test(src), true);
t('그 이유를 코드에 적어 뒀다', /끌 길이 사라지면 안 된다/.test(src), true);

/* ═══ 5. 부가세 안내가 모든 부가세 체크박스에 붙었는가 ═══ */
{
  // 부가세포함 체크박스는 8곳 — 하나라도 빠지면 그 화면만 조용히 다르게 동작한다
  const boxes = src.match(/checked:!!f\.(contractFeeVatIncluded|balanceFeeVatIncluded|fundVatIncluded)/g) || [];
  const hints = src.match(/vatIncludedHint\(e\.target\.checked/g) || [];
  t('★ 부가세 체크박스 수와 안내 연결 수가 같다', hints.length, boxes.length);
  t('체크박스가 8곳', boxes.length, 8);
  t('★ 안내를 안 부르는 옛 형태가 남아 있지 않다',
    /onChange:function\(e\)\{ setF\(function\(prev\)\{ return Object\.assign\(\{\}, prev, \{ (contractFeeVatIncluded|balanceFeeVatIncluded|fundVatIncluded):e\.target\.checked \}\); \}\); \}/.test(src), false);
}
t('안내 함수를 밖에서도 쓸 수 있다', /window\.vatIncludedHint\s*=/.test(src), true);
t('음소거 판단 함수도 열려 있다', /window\.vatHintMuted\s*=/.test(src), true);

/* ═══ 6. 다시 보지 않기 알림창 — 어떻게 닫아도 약속을 지키는가 ═══ */
{
  const mk = slice('window.showAlertMutable = function(message, opts){', 'window.vatIncludedHint = vatIncludedHint;');
  t('★ 닫는 방식과 무관하게 cleanup 에서 음소거를 지킨다',
    /function cleanup\(\)\{[\s\S]{0,300}?_pureun_mute'\)\.checked && typeof opts\.onMute === 'function'\) opts\.onMute\(\)/.test(mk), true);
  t('확인 버튼이 cleanup 을 부른다', /_pureun_mute_ok'\)\.addEventListener\('click', cleanup\)/.test(mk), true);
  t('바깥을 눌러도 cleanup', /if\(e\.target === overlay\) cleanup\(\)/.test(mk), true);
  t('ESC·엔터도 cleanup', /if\(e\.key === 'Escape' \|\| e\.key === 'Enter'\)\{ cleanup\(\); \}/.test(mk), true);
  t('★ 글자는 escape 해서 넣는다 (제목·본문)', /_esc\(title\)[\s\S]{0,400}?_esc\(message\)/.test(mk), true);
}

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===');
process.exit(fail ? 1 : 0);
