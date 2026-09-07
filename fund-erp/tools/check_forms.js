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
  gV('_KOR_D'), gV('_KOR_P'), gV('_KOR_U'),
  gF('_officersOf'), gF('_boss'), gF('_isBlankCell'), gF('_isLabelCell'), gF('_bakeText'),
  gF('_isRateRow'), gF('stripBaked'), gF('korWon'), gF('_docRok'),
  gF('_dotDate'), gF('fillContribDoc'), gF('fillChecklistDoc'), gF('budgetOf'), gF('_hasBudget'), gF('_reserveRate'), gF('_bizFinOf'),
  gF('bizplanRows'), gF('bizplanBS'), gF('fillBizplanDoc'), gF('fillCommittee'),
  /* hwpFormHTML 이 끝에서 fillDerived 를, 설립 출연확인서에서 fillFoundContribDoc 를 부른다(2026-09-07).
     여기 없으면 「fillDerived is not defined」로 이 검사가 통째로 죽는다 — 서식이 안 채워지는 게 아니라
     하네스가 낡은 것인데 그렇게 읽힌다. */
  gV('_K'), gF('_siteWrep'), gF('_prepCommittee'), gF('_dashPhone'), gF('_prepDirectors'), gF('_bizTotals'),
  gF('fillDerived'), gF('fillFoundContribDoc'),
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

console.log('\n■ 협의회 위원 격자 — 누가 들어가나 (코덱스 #13)');
{
  /* 위원은 «이사»다. 감사는 위원이 아니라 따로 두는 기관인데,
     역할 글자에 「근로자측·사용자측」이 들어 있다는 이유로 위원 칸에 앉았다. */
  const f = { officers: [
    { role:'이사장',        name:'가대표', birth:'1970-01-01', title:'대표이사' },
    { role:'사용자측 이사', name:'나사측', birth:'1975-02-02', title:'부장' },
    { role:'근로자측 이사', name:'다노측', birth:'1980-03-03', title:'과장' },
    { role:'사용자측 감사', name:'라사감', birth:'1985-04-04', title:'차장' },
    { role:'근로자측 감사', name:'마노감', birth:'1990-05-05', title:'대리' },
  ]};
  const grid = '<table>' + ['근로자측','사용자측'].map(side =>
      '<tr><td>' + side + '</td><td></td><td></td><td></td></tr>'
      + '<tr><td></td><td></td><td></td><td></td></tr>'
      + '<tr><td></td><td></td><td></td><td></td></tr>').join('') + '</table>';
  const d = dom.window.document.createElement('div');
  d.innerHTML = grid;
  fillCommittee(d, f);
  const t = T(d.textContent);
  chk('근로자측 이사가 들어간다', t.includes('다노측'), t);
  chk('사용자측 이사가 들어간다', t.includes('나사측'), t);
  chk('근로자측 감사는 위원이 아니다', !t.includes('마노감'), t);
  chk('사용자측 감사도 위원이 아니다', !t.includes('라사감'), t);
  /* 이사장도 위원이 맞지만 명부에 «측»이 없어 어느 쪽인지를 모른다 —
     한쪽에 밀어 넣으면 그럴듯하게 틀린 채 관청에 나간다. 빈칸으로 둔다. */
  chk('측을 모르는 이사장을 지어내서 넣지 않는다', !t.includes('가대표'), t);
}

/* ── 장부에서 채우던 서식 둘을 변환본 위로 옮겼다 ──────────

   둘 다 변환본에 «남의 값»이 박혔 있었고, 걷어내기는 숫자만 지우므로
   한글로 적힌 것은 그대로 남았다 — 출연확인서의 「오백만원」,
   체크리스트의 「65명」·「서비스」·「생활원조, 체육문화활동, 기타복리후생」,
   그리고 착안사항 여덟 칸의 「해당·비해당」 — 남이 판단한 것이다. */
console.log('\n■ 기금 출연 확인서 — 사업장마다 한 장씩');
{
  const f = { name:'가나공동', fund_type:'공동', officers:[], years:{} };
  global.funds.X = f; global.S.formFund = 'X'; global.S.f15Close = null;
  const sites = [{ _id:'s1', name:'가나기계(주)', ceo:'김가나' },
                 { _id:'s2', name:'다라전자(주)', ceo:'이다라' },
                 { _id:'s3', name:'마바산업(주)', ceo:'박마바' }];
  global.S._docR = { fid:'X', yr:2026, sites:sites,
                     sy:{ s1:{contrib:3070000}, s2:{contrib:12340000}, s3:{} } };
  const d = dom.window.document.createElement('div');
  d.innerHTML = hwpFormHTML('sub_contrib', f, sites);
  const ps = [].slice.call(d.querySelectorAll('p'))
    .filter(x => /출 연 확 인 서/.test(T(x.textContent)));
  chk('출연한 두 곳만 두 장', ps.length === 2, ps.length);
  const all = T(d.textContent);
  chk('내지 않은 사업장은 없다', !all.includes('마바산업'), all);
  chk('금액이 한글로 적힌다 (삼백칠만원정)', all.includes('삼백칠만원정'), all);
  chk('숫자도 같이 (3,070,000)', all.includes('3,070,000'), all);
  chk('둘째 장은 12,340,000', all.includes('12,340,000'), all);
  chk('사업장명·대표가 들어간다', all.includes('가나기계(주)') && all.includes('김가나'), all);
  /* 변환본에 박혀 있던 남의 금액 — 한글이라 걷어내기가 못 지우던 것 */
  chk('남의 금액 「오백만원」이 사라졌다', !all.includes('오백만원'), all);
  chk('남의 숫자 5,000,000 도 없다', !all.includes('5,000,000'), all);

  /* 출연한 곳이 없으면 지어내지 않고 빈 확인서와 까닭을 남긴다 */
  global.S._docR = { fid:'X', yr:2026, sites:sites, sy:{} };
  const d2 = dom.window.document.createElement('div');
  d2.innerHTML = hwpFormHTML('sub_contrib', f, sites);
  const t2 = T(d2.textContent);
  chk('출연이 없으면 까닭을 적어 둔다', t2.includes('출연한 사업장이 없어'), t2);
  chk('그래도 남의 금액은 안 남는다', !t2.includes('오백만원') && !t2.includes('5,000,000'), t2);

  /* ⚠ 장부를 «못 읽었을 때»가 진짜 위험하다. 그냥 돌아가면 원본에 박힌
     남의 금액 「오백만원」이 그대로 인쇄된다 — 한글이라 걷어내기가 못 지운다.
     읽었든 못 읽었든 이 서식은 항상 다시 짜야 한다. */
  global.S._docR = null;
  const d3 = dom.window.document.createElement('div');
  d3.innerHTML = hwpFormHTML('sub_contrib', f, sites);
  const t3 = T(d3.textContent);
  chk('장부를 못 읽어도 남의 금액은 없다',
      !t3.includes('오백만원') && !t3.includes('5,000,000'), t3.slice(0, 260));
  chk('못 읽은 까닭을 따로 적어 둔다', t3.includes('아직 못 읽었습니다'), t3.slice(0, 260));
  chk('그래도 빈 확인서 한 장은 남긴다', /출 연 확 인 서/.test(t3), t3.slice(0, 260));
}

console.log('\n■ 자율 체크리스트 — 남의 답을 지우고 우리 자료를 넣는가');
{
  const f = { name:'가나공동', fund_type:'공동', region:'대전', chairman:'홍길동',
              inka_no:'제2024-3호', inka_date:'2024-06-11', officers:[],
              years:{ 2026:{ subsidy:{ request_amount:80000000 } } } };
  global.funds.X = f; global.S.formFund = 'X'; global.S.f15Close = null;
  const sites = [{ _id:'s1', name:'가나기계(주)', company_size:31 },
                 { _id:'s2', name:'다라전자(주)', company_size:18 }];
  global.S._docR = { fid:'X', yr:2026, sites:sites,
    sy:{ s1:{contrib:3070000}, s2:{contrib:12340000} },
    welf:[{category:'경조사비지원'},{category:'생활안정자금'},
          {category:'대부사업'},{category:'경조사비지원'}],
    R:{ bfEnd:154300000 } };
  const d = dom.window.document.createElement('div');
  d.innerHTML = hwpFormHTML('sub_checklist', f, sites);
  const rows = [].slice.call(d.querySelectorAll('tr'));
  const flat = t => String(t||'').replace(/\s/g,'');
  const after = h => { for (let i=0;i<rows.length;i++) {
      const c = [].slice.call(rows[i].children).map(x => flat(x.textContent));
      if (c[0] === h) return { hd:c, tds:[].slice.call(rows[i+1].children).map(x => (x.textContent||'').trim()) };
    } return null; };
  const cur = after('지역');
  const g = h => { const i = cur.hd.indexOf(h); return i < 0 ? '(칸 없음)' : cur.tds[i]; };
  chk('지역', g('지역') === '대전', g('지역'));
  chk('참여회사 두 곳', g('공동기금참여회사') === '가나기계(주), 다라전자(주)', g('공동기금참여회사'));
  chk('근로자수 = 31+18', g('참여회사근로자수') === '49명', g('참여회사근로자수'));
  chk('기금규모는 천원 단위', g('기금규모(천원)') === '154,300', g('기금규모(천원)'));
  chk('출연금액 = 3,070,000+12,340,000', g('출연금액(원)') === '15,410,000', g('출연금액(원)'));
  chk('지원신청금액', g('지원신청금액(원)') === '80,000,000', g('지원신청금액(원)'));
  chk('인가번호에 인가일을 괄호로', /제2024-3호.*2024/.test(g('기금인가번호(인가일자)')), g('기금인가번호(인가일자)'));
  /* 지원내용은 목적사업의 갈래다 — 대부사업은 복지사업이 아니라 뻐다 */
  chk('지원내용은 갈래만 · 중복 없이',
      g('지원내용') === '경조사비지원, 생활안정자금', g('지원내용'));
  chk('대부사업은 지원내용이 아니다', !g('지원내용').includes('대부'), g('지원내용'));
  /* 업종은 기금 자료에 없다 — 지어내지 않고 비운다 */
  chk('업종은 비워 둔다 (지어내지 않는다)', g('업종') === '', g('업종'));

  const all = T(d.textContent);
  chk('남의 근로자수 「65명」이 없다', !all.includes('65명'), all.slice(0, 300));
  chk('남의 업종 「서비스」가 없다', !all.includes('서비스'), all.slice(0, 300));
  chk('남의 지원내용이 없다', !all.includes('생활원조'), all.slice(0, 300));

  /* 가장 위험했던 것 — 남이 판단한 「해당·비해당」이 그대로 나가던 것 */
  const chkRow = after('공동기금법인명');
  chk('착안사항·제출서류 칸은 모두 비어 있다',
      chkRow.tds.slice(1).every(v => v === ''), chkRow.tds.join('|'));
  /* 서식 자체의 안내문에도 「‘해당’, ‘비해당’으로 표시해 주세요」가 있다 —
     글자 전체에서 찾으면 그것이 걸린다. «칸» 단위로 본다. */
  const answered = [].slice.call(d.querySelectorAll('td,th'))
    .map(x => (x.textContent||'').trim()).filter(v => v === '해당' || v === '비해당');
  chk('남의 판단이 든 칸은 하나도 없다', answered.length === 0, answered.join('|'));
}

/* ── 한글로 적힌 금액·사람 수도 걷어낸다 ─────────────

   걷어내기는 오랫동안 «숫자»만 봤다. 그래서 변환본에 딜려 온 남의 값 중
   한글로 적힌 것과 「N명」이 그대로 인쇄되고 있었다 — 서식 세 종에서 발견했다.
     contrib          「오백만원정」
     bizplan          「신규 출연기금 ( 일천만원)」
     sub_welfare_plan 「대상인원: 65명」

   ⚠ 서식 «안내문»은 건드리면 안 된다 — 설립인가신청서의
     「위원이 4명 이상일 경우에는 별도 용지에」는 서식의 일부다.
     금액과 같이 「미만·이상」이 붙으면 둔다. */
console.log('\n■ 한글 금액·사람 수도 걷어낸다');
{
  const f = { name:'가나공동', fund_type:'공동', officers:[], years:{} };
  global.funds.X = f; global.S.formFund = 'X'; global.S.f15Close = null; global.S._docR = null;
  const t = k => T(draw(k, f));

  const c = t('contrib');
  chk('출연확인서(contrib) — 「오백만원정」이 없다', !c.includes('오백만원'), c.slice(0, 200));
  chk('그 자리가 빈칸으로 남는다', /금 액 : ＿/.test(c.replace(/\s+/g, ' ')), c.slice(0, 200));

  const b = t('bizplan');
  chk('사업계획서 — 「일천만원」이 없다', !b.includes('일천만원'), b.slice(0, 200));

  const w = t('sub_welfare_plan');
  chk('복지사업계획서 — 「65명」이 없다', !w.includes('65명'), w.slice(0, 200));
  chk('그 자리는 「명」을 남긴 빈칸', /＿명/.test(w), w.slice(0, 200));

  /* 서식 안내문은 그대로 — 지우면 서류를 어떻게 내는지를 모르게 된다 */
  const k = t('inka');
  chk('설립인가신청서 — 「4명 이상」 안내문은 남는다', k.includes('4명 이상'), k.slice(0, 200));
  /* 「사원」·「직원」은 금액이 아니다 — 원 앞에 백·천·만·억이 있어야 금액으로 본다 */
  const x = t('tax_bizreg');
  chk('「주주(사원)명부」 같은 말은 안 건드린다', x.includes('사원)명부'), x.slice(0, 200));
}

console.log(bad ? '\nFAILURES ' + bad : '\nALL PASS (서식 동작 확인)');
process.exit(bad ? 1 : 0);
