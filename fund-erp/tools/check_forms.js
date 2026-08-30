/* 서식이 «정말 채워지는지» 실제로 그려 확인한다 — 소스에 글자가 있는지가 아니라.

   왜 필요한가: 문자열만 보는 검사는 «순서가 바뀐 것»을 못 잡는다.
   실제로 그랬다 — stripBaked 를 나중에 넣으면서 지원신청서의 금액·신청일이
   먼저 지워졌고, 검사는 전부 통과하는 동안 그 칸이 조용히 비어 있었다.

   실행: node fund-erp/tools/check_forms.js
   ⚠ 앞서 저지른 잘못: 한 번 확인하고 나서 파이프라인을 바꾼 뒤 그 칸을 다시 안 봤다.
     그래서 지원신청서 금액·날짜가 조용히 비어 있었다. 이 파일이 그것을 붙잡는다. */
const fs = require('fs'), path = require('path');
const W = path.resolve(__dirname, '..', '..');
const src = fs.readFileSync(path.join(W, 'fund.html'), 'utf8');
/* jsdom 이 있어야 «진짜로 그려» 볼 수 있다. 저장소에는 package.json 이 없어
   CI 가 못 깐다 — 없으면 곱게 건너뛰되, «건너뛰었다»고 분명히 말한다.
   조용히 통과하면 검사가 있는 줄 알고 안 보게 된다.
     설치: npm i jsdom --no-save */
let JSDOM;
try { JSDOM = require('jsdom').JSDOM; }
catch (e) {
  console.log('SKIP: jsdom 이 없어 서식 동작 검사를 건너뜁니다 (npm i jsdom --no-save)');
  process.exit(0);
}
const dom = new JSDOM('<!doctype html><body></body>');
global.window = dom.window; global.document = dom.window.document;
(0, eval)(fs.readFileSync(path.join(W, 'fund_forms.js'), 'utf8'));
function gF(n){const i=src.indexOf('function '+n+'(');if(i<0)throw Error('없음 '+n);let d=0;
  for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}}
function gV(n){const i=src.indexOf('var '+n+'=');if(i<0)throw Error('없음 '+n);let d=0;
  for(let k=src.indexOf('=',i);k<src.length;k++){const c=src[k];
    if(c==='{'||c==='[')d++;else if(c==='}'||c===']'){d--;if(!d)return src.slice(i,src.indexOf(';',k)+1);}}}
global.esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
global.num = v => { if (v === '' || v == null) return ''; const n = Number(String(v).replace(/,/g,'')); return isFinite(n) ? n : '' };
global.BAKE_BLANK = (src.match(/var BAKE_BLANK='([^']*)'/) || [])[1];
global.S = { fundId: 'X', year: 2026 };
global.funds = {};
(0, eval)([gV('OFFICER_ROLES'), gV('FORM_FILL'), gV('BIZ_BS_ROWS'), gV('BUDGET_KEYS'),
  gF('_officersOf'), gF('_boss'), gF('_isBlankCell'), gF('_isLabelCell'), gF('_bakeText'),
  gF('stripBaked'), gF('budgetOf'), gF('_hasBudget'), gF('_reserveRate'), gF('_bizFinOf'),
  gF('bizplanRows'), gF('bizplanBS'), gF('fillBizplanDoc'), gF('fillCommittee'),
  gF('fillRoster'), gF('fillSubsidyDoc'), gF('hwpFormHTML')].join('\n'));

let bad = 0;
const chk = (n, c, w) => { if (c) console.log('  · ' + n); else { bad++; console.log('  ✗ ' + n + (w ? '  — ' + w : '')); } };
const T = t => t.replace(/\s+/g, ' ');
const draw = (kind, f) => { const d = dom.window.document.createElement('div');
  d.innerHTML = hwpFormHTML(kind, f, []); return T(d.textContent); };

console.log('■ 지원신청서 — 금액·신청일이 정말 들어가나 (코덱스 #7)');
{
  const f = { name:'가나공동', fund_type:'공동', officers:[{role:'이사장',name:'홍길동'}],
    years:{2026:{subsidy:{request_amount:24000000}}} };
  global.funds.X = f; global.S.f15Close = null;
  const t = draw('subsidy', f), n = new Date();
  chk('지원신청 금액 24,000,000', t.includes('24,000,000'));
  chk('신청일 = 오늘', t.includes(n.getFullYear()+'년 '+(n.getMonth()+1)+'월 '+n.getDate()+'일'));
  chk('서명란 이름', t.includes('홍길동 (서명'));
  chk('남의 금액 10,000,000 은 사라짐', !t.includes('10,000,000'));
  chk('남의 날짜 2020년 05월 은 사라짐', !/2020년\s*0?5월/.test(t));
  chk('기금마다 다른 체크는 비었다', !/■체육/.test(t.replace(/\s/g,'')));
}

console.log('\n■ 추정재무상태표 — 확정 스냅샷의 «실제 모양»으로 (코덱스 #4)');
{
  const f = { name:'가나공동', fund_type:'공동', officers:[],
    years:{2026:{budget:{rev_contrib:8000000, rev_interest:56000,
      exp_purpose:5000000, exp_admin:500000, exp_etc:275000}}} };
  global.funds.X = f;
  /* closeSnapshot 이 실제로 담는 모양 그대로 — 자산총계는 assets 다 */
  global.S.f15Close = { fin: { cash:4984897, savings:0, loan:0, otherAsset:0, secu:0,
    res1:0, res2:2308897, assets:4984897, liab:2308897, basic:2676000, retained:0 } };
  const t = draw('bizplan', f);
  chk('추정 현금 7,266 천원', t.includes('7,266'), '스냅샷 모양(assets)으로 안 채워짐');
  chk('추정 준비금2 3,790 천원', t.includes('3,790'));
  chk('추정 기본재산 3,476 천원', t.includes('3,476'));
  /* 옛 스냅샷에는 준비금이 없다 — 0 으로 메우면 «준비금 0 인 기금»으로 셈해 틀린 표가 나온다 */
  global.S.f15Close = { fin: { cash:4984897, assets:4984897, liab:0, basic:2676000, retained:0 } };
  chk('옛 스냅샷이면 추정표를 안 채운다', !draw('bizplan', f).includes('7,266'));
}

console.log('\n■ 사업계획서 손익예산은 그대로인가 (제출본 대조)');
{
  const f = { name:'T', fund_type:'공동', officers:[],
    years:{2026:{budget:{rev_interest:56000, exp_purpose:5000000, exp_admin:500000, exp_etc:275000}}} };
  global.funds.X = f; global.S.f15Close = null;
  const t = draw('bizplan', f);
  ['△5,000','△4,944','△5,500','△5,444','5,775','5,719'].forEach(v => chk('제출본 값 ' + v, t.includes(v)));
}

console.log('\n■ 설립인가신청서는 그대로인가');
{
  const f = { name:'가나공동', fund_type:'공동', address:'충남 아산시', phone:'041-000-0000',
    officers:[{role:'이사장',name:'홍길동',birth:'1975-03-11',title:'대표이사',addr:'충남 아산시 온천대로 1'},
              {role:'근로자측 이사',name:'이근로',birth:'1986-11-25',title:'생산팀장'},
              {role:'사용자측 이사',name:'김사용',birth:'1980-07-02',title:'관리부장'}], years:{} };
  global.funds.X = f; global.S.f15Close = null;
  const t = draw('inka', f);
  ['홍길동','1975-03-11','대표이사','이근로','김사용','충남 아산시 온천대로 1'].forEach(v =>
    chk('값 ' + v, t.includes(v)));
}

console.log(bad ? '\nFAILURES ' + bad : '\nALL PASS (서식 동작 확인)');
process.exit(bad ? 1 : 0);
