/* 설립 서식 — «자료는 있는데 배선이 없던» 자리가 정말 채워지는가. 그리고 지어내지 않는가.

   서식 18종을 «자료가 다 있는 기금»으로 실제로 그려 보고(2026-09-06), 그래도 비는 자리
   52개를 갈랐다. 여기서 보는 것은 그중 «자료는 있는데 잇지 않아» 비던 자리들이다:
     회의록의 이사 수·출연금·기금사용·연도·손익예산·목적사업, 등기신청서의 인가일·기본재산·
     이사 성명·주소·본점·전화·관할등기소, 취임승낙서의 선임일, 인감 서식의 이사 성명,
     사업자등록신청서의 대표자·전화·자본금·사업연도·자산, 임대차계약서의 법인번호 …

   ⚠ 실제로 그려 본다(jsdom). 소스에 글자가 있는지가 아니라 «그린 서식에 값이 서는지»를 본다.
   ⚠ 원본 글의 「금 액」「본 점」 사이는 붙임공백( )이다 — 보통 공백으로 찍은 규칙은
     눈으로는 같아 보여도 하나도 안 맞았다. 그래서 규칙의 공백은 \s* 다. 여기서도 그 자리를 본다.
   ⚠ 값이 없으면 «손대지 않는다». 빈 밑줄이 틀린 값보다 낫다 — 관청에 나가는 서류다.
   ⚠ 원본에 «글자로» 박힌 남의 것 둘 — 관할 등기소 「서울남부지방법원」, 주소 끝 「1004호」 —
     밑줄이 아니라 걷어내기가 못 잡았다. 우리 값으로 바꾸거나 걷는다.

   실행: node fund-erp/tools/check_derived.js */
const fs = require('fs'), path = require('path');
const W = path.resolve(__dirname, '..', '..');
const src = fs.readFileSync(path.join(W, 'fund.html'), 'utf8');
let JSDOM;
/* jsdom 이 없는 곳에서 이 한 줄이 저장소의 «모든 앱» 배포를 막지 않게 한다 */
try { JSDOM = require('jsdom').JSDOM; }
catch (e) { console.log('SKIP: jsdom 이 없어 서식 채움 검사를 건너뜁니다 (npm i jsdom --no-save)'); process.exit(0); }
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
global.S = { fundId: 'X', year: 2026, f15Close: null };
global.funds = {};
(0, eval)([gV('OFFICER_ROLES'), gV('FORM_FILL'), gV('BIZ_BS_ROWS'), gV('BUDGET_KEYS'), gV('_KOR_D'), gV('_KOR_P'), gV('_KOR_U'), gV('_K'),
  gF('_officersOf'), gF('_boss'), gF('_isBlankCell'), gF('_isLabelCell'), gF('_bakeText'), gF('_isRateRow'), gF('stripBaked'),
  gF('korWon'), gF('_docRok'), gF('_siteWrep'), gF('_prepCommittee'), gF('_dotDate'), gF('fillContribDoc'), gF('fillChecklistDoc'),
  gF('budgetOf'), gF('_hasBudget'), gF('_reserveRate'), gF('_bizFinOf'), gF('bizplanRows'), gF('bizplanBS'), gF('fillBizplanDoc'),
  gF('fillCommittee'), gF('fillRoster'), gF('fillSubsidyDoc'), gF('_dashPhone'), gF('_prepDirectors'), gF('_bizTotals'),
  gF('fillDerived'), gF('fillFoundContribDoc'), gF('hwpFormHTML')].join('\n'));

let bad = 0;
const ok = (n, c, w) => { if (c) console.log('  · ' + n); else { bad++; console.log('  ✗ ' + n + (w ? '  — ' + w : '')); } };
const T = t => String(t || '').replace(/\s+/g, ' ');
/* ⚠ 칸(td) 사이에 공백을 끼운다 — textContent 는 칸을 그냥 이어 붙여 「자본금10,000천원」이 되고,
     한 칸 안의 값과 두 칸에 걸친 값을 가를 수 없다. */
const draw = (kind, f, sites) => { const d = dom.window.document.createElement('div');
  d.innerHTML = hwpFormHTML(kind, f, sites || []).replace(/<\/t[dh]>/g, ' $&').replace(/<br\s*\/?>/g, ' ');
  return T(d.textContent); };

/* «자료가 다 있는» 기금 */
const F = { name:'가나공동근로복지기금', fund_type:'공동', chairman:'홍길동', inka_date:'2026-01-02',
  corp_reg_no:'000000-0000000', registry_office:'어느지방법원 등기소', phone:'041-000-0000',
  address:'충남 어느시 어느구 어느로 1', contribution_total:10000000, meeting_date:'2026-01-05',
  officers:[
    {role:'이사장',name:'홍길동',birth:'1975-03-11',title:'대표이사',addr:'충남 어느시 온천대로 1'},
    {role:'근로자측 이사',name:'박노측',birth:'1986-11-25',title:'생산팀장'},
    {role:'사용자측 이사',name:'최사측',birth:'1980-07-02',title:'관리부장'},
    {role:'근로자측 감사',name:'정감사'},{role:'사용자측 감사',name:'오감사'}],
  years:{2026:{budget:{rev_contrib:10000000, rev_interest:56000, exp_purpose:5000000, exp_admin:500000, exp_etc:275000}}} };
global.funds.X = F;
const SITES = [
  { name:'가나기계', ceo:'김가나', contrib:6000000, status:'active' },
  { name:'다라전자', ceo:'이다라', contrib:4000000, status:'active' },
  { name:'닫은곳', ceo:'없음', contrib:9000000, status:'closed' } ];

console.log('■ 회의록 — 명부·출연금·예산에서 온다');
{ const t = draw('minutes', F);
  ok('이사 선임 : 각 1 명 (노·사 각 1명이 명부에 있다)', /이사 선임 : 각 1 명/.test(t), t.match(/이사 선임[^가-힣]{0,20}/) && t.match(/이사 선임[^\n]{0,20}/)[0]);
  ok('기금 출연 금액 10,000,000원', /금 액 : 10,000,000원/.test(t));
  ok('기금사용 = 출연금의 80% = 8,000,000원', /기금사용 : 8,000,000원/.test(t));
  ok('사업계획 연도 2026', /2026년 사업계획\(안\)/.test(t) && /2026년도 사업계획\(안\)/.test(t));
  /* 사업계획서 손익예산 그대로: 수익 = 이자 56 + 사업외수익(예비비 275 − (0 − 목적사업 5,000 − 관리비 500)) = 5,831천원
     비용 = 5,000 + 500 + 275 + 56 = 5,831천원. 두 회계가 «따로» 0 으로 맞물리므로 수지차익은 0 이다. */
  ok('손익예산 수익·비용이 사업계획서와 같다', /손익예산 : 수익 5,831천원, 비용 5,831천원, 수지차익 0천원/.test(t),
     (t.match(/손익예산[^가]{0,60}/) || [''])[0]);
  ok('목적사업 5,000천원', /목적사업 : 5,000천원/.test(t));
  /* 추정대차대조표는 확정 결산 스냅샷이 있어야 한다 — 없으면 «비워 둔다» */
  ok('추정대차대조표는 스냅샷이 없으면 비워 둔다', /추정대차대조표 : 자산 [＿_]+천원/.test(t)); }

console.log('\n■ 기금출연확인서 — 사업장마다 한 장');
{ const t = draw('contrib', F, SITES);
  ok('사업장마다 한 장 (닫은 곳은 뺀다)', (t.match(/기 금 출 연 확 인 서/g) || []).length === 2, (t.match(/기 금 출 연 확 인 서/g) || []).length + '장');
  ok('금액이 한글·숫자로 선다', /육백만원정\(￦ 6,000,000\)/.test(t) && /사백만원정\(￦ 4,000,000\)/.test(t), t.slice(0, 200));
  ok('사업장·대표자가 선다', /가나기계 대표이사 김가나/.test(t) && /다라전자 대표이사 이다라/.test(t));
  ok('원본 자리표 「0000(주) 대표이사 0 0 0」이 안 남는다', !/0000\(주\)|0 0 0/.test(t));
  const t0 = draw('contrib', F, []);
  ok('출연 사업장이 없으면 지어내지 않고 까닭을 남긴다', /기본 출연금이 적힌 참여사업장이 없어/.test(t0) && /￦ [＿_]+/.test(t0)); }

console.log('\n■ 사업계획서·등기신청서·취임승낙서·인감·등록면허세');
{ const t = draw('bizplan', F);
  ok('사업계획서 예산편성 연도', /Ⅱ\. 2026년 예산편성/.test(t));
  const r = draw('reg_apply', F);
  ok('인가서 도달 연월일 = 인가일', /인가서도달 연월일 : 2026\. 1\. 2\./.test(r));
  ok('기본재산 = 출연금', /기본재산은 금 10,000,000원/.test(r));
  ok('대표권 있는 이사가 먼저, 제한규정에도 그 이름', /이사 홍길동 \(/.test(r) && /제한규정 : 이사 홍길동 이외에는/.test(r));
  ok('다음 이사가 이어 선다', /이사 박노측 \(/.test(r));
  /* 등기신청서엔 이사 자리가 둘뿐이라 «셋째부터»는 그려도 안 보인다 — 목록 자체를 본다.
     (감사를 끼워 넣는 되돌림이 그래서 안 잡혔다) */
  const dnames = _prepDirectors(F).map(o => o.name).join(',');
  ok('이사 차례 = 이사장 → 나머지 이사, 감사는 없다', dnames === '홍길동,박노측,최사측', dnames);
  ok('이사장 주소가 선다', /주소 : 충남 어느시 온천대로 1/.test(r));
  /* 남의 주소 끝 「1004호」가 우리 주소 뒤에 붙어 나갔다 */
  ok('남의 호수 잔재 「1004호」가 안 남는다', !/1004호/.test(r), (r.match(/.{0,20}1004호.{0,10}/) || [''])[0]);
  ok('본점·신청인 이사 성명·전화가 선다', /본 점 충남 어느시 어느구 어느로 1/.test(r) && /이사 성 명 홍길동 \(인\)/.test(r) && /전화 :041-000-0000/.test(r));
  ok('관할 등기소가 «우리 것»이다 (서울남부가 아니다)', /어느지방법원 등기소 귀중/.test(r) && !/서울남부/.test(r));
  const a = draw('reg_accept', F);
  ok('취임승낙서 선임일 = 설립준비위원회 회의일', /본인은 2026\. 1\. 5\. 가나/.test(a));
  ok('대표권 있는 이사 장에만 이사장 이름', (a.match(/위 이사 홍길동 \(개인인감\)/g) || []).length === 1 && /위 이사 [＿_]+ \(개인인감\)/.test(a));
  ok('협의회 명부 대표자', /대표자 : 홍길동 \(법인인감\)/.test(draw('reg_roster', F)));
  ok('인감신고서·인감대지 이사 성명', /이사 홍길동/.test(draw('reg_seal', F)) && /자격 및 성명 : 이사 홍길동/.test(draw('reg_sealpaper', F)));
  const l = draw('reg_license', F);
  ok('등록면허세 전화·신고인', /041-000-0000/.test(l) && /신고인 홍길동\(서명/.test(l)); }

console.log('\n■ 고유번호증 서식');
{ const b = draw('tax_bizreg', F);
  ok('대표자·전화', /홍길동 \(공동대표\)/.test(b) && /\(사업장\) 041-000-0000/.test(b));
  ok('자본금 = 출연금(천원) · 사업연도', /자본금 10,000천원/.test(b) && /사업연도 2026년도/.test(b));
  /* 설립등기신청서에 「기본재산은 금 N원」이라 적은 그 재산이 설립 시점의 자산이다 */
  /* ⚠ 머리줄부터 박는다 — 값 줄만 보면 셋째·넷째 칸까지 채운 되돌림도 옆으로 밀려 맞았다 */
  ok('자산 계·유동자산 = 기본재산, 고정자산·부채·종업원수는 비워 둔다',
     /자산 계 유동자산 고정자산 부채 계 유동부채 고정부채 종업원수 10,000천원 10,000천원 [＿_]+천원 [＿_]+천원 [＿_]+천원 [＿_]+천원 [＿_]+명/.test(b),
     (b.match(/자산 계 유동자산.{0,120}/) || [''])[0]);
  ok('신청인', /신 청 인 홍길동 \(인\)/.test(b));
  ok('임대차계약서 법인번호', /000000-0000000/.test(draw('tax_lease', F)));
  ok('전대동의서 날짜', /\d{4}년 \d{1,2}월 \d{1,2}일/.test(draw('tax_sublease', F)));
  ok('홈택스 신청인 이사', /이사 홍길동 \(서명 또는 인\)/.test(draw('tax_hometax', F))); }

console.log('\n■ (나) 주민등록번호 — 명부에 적으면 등기·세무 서식 다섯에 선다');
{ const R = Object.assign({}, F, { officers: F.officers.map((o, i) => i === 0 ? Object.assign({}, o, { rrn: '750311-1234567' }) : o) });
  global.funds.X = R;
  ok('등기신청서 이사장 이름 옆에 번호가 선다', /이사 홍길동 \(750311-1234567\)/.test(draw('reg_apply', R)));
  ok('번호가 없는 이사는 자리표를 그대로 둔다', /이사 박노측 \(_{6}-_{7}\)/.test(draw('reg_apply', R)));
  ok('인감신고서·인감카드의 주민등록번호 칸', /주민등록번호 750311-1234567/.test(draw('reg_seal', R)) && /주민등록번호 750311-1234567/.test(draw('reg_sealcard', R)));
  ok('인감대지', /주민등록번호 : 750311-1234567/.test(draw('reg_sealpaper', R)));
  /* 사업자등록신청서는 그 칸에 자리표가 둘 붙어 있다(대표자·공동대표) — 첫 것만 채우고 둘째는 둔다 */
  const bz = draw('tax_bizreg', R);
  ok('사업자등록신청서 대표자 번호 (둘째 자리표는 둔다)', /750311-1234567_{6}-_{7}/.test(bz), (bz.match(/주민등록번호.{0,40}/) || [''])[0]);
  /* 임대차계약서의 「주민번호」는 임대인 것이다 — 우리 번호를 넣으면 안 된다 */
  ok('임대인 주민번호 자리에 우리 번호를 넣지 않는다', !/750311-1234567/.test(draw('tax_lease', R)));
  global.funds.X = F; }

console.log('\n■ (나) 사무소 임대차 — 기금 정보의 묶음에서 온다');
{ const Lz = Object.assign({}, F, { lease_lessor: '가나기계', lease_addr: '충남 어느시 어느구 어느로 1', lease_from: '2026-03-01', lease_deposit: 5000000, lease_rent: 300000 });
  global.funds.X = Lz;
  const tl = draw('tax_lease', Lz);
  ok('임대차계약서 기간 시작일', /기간은 2026\. 3\. 1\.부터 2년간/.test(tl));
  ok('임대인 상호', /임대인 가나기계\(인\)/.test(tl));
  const bz = draw('tax_bizreg', Lz);
  ok('사업자등록신청서 임대차기간 = 시작일부터 2년 (끝은 하루 전)', /2026\. 3\. 1\. ~ 2028\. 2\. 29\./.test(bz), (bz.match(/2026\. 3\. 1\..{0,40}/) || [''])[0]);
  ok('보증금·월세가 적혀 있으면 넣는다', /5,000,000원 300,000원/.test(bz));
  /* 보증금·월세를 안 적었으면 원본의 「0원」을 그대로 둔다 — 0원인지 우리는 모른다 */
  const Lz0 = Object.assign({}, Lz, { lease_deposit: '', lease_rent: '' }); global.funds.X = Lz0;
  ok('보증금·월세를 안 적었으면 원본 그대로 둔다', /2028\. 2\. 29\. 0원 0원/.test(draw('tax_bizreg', Lz0)));
  ok('기금 정보에 임대차 묶음이 있다', /\['lease_lessor','임대인\(상호·성명\)','text'\]/.test(src) && /lease_lessor:'사무소 임대차'/.test(src));
  ok('임대인 주민등록번호 칸은 두지 않는다 (남의 것)', !/lease_lessor_rrn|lease_rrn/.test(src));
  ok('명부에 주민등록번호 칸이 있다', /class="off-rrn"/.test(gF('_offRow')) && /\['birth','title','rrn','addr'\]/.test(gF('_readOfficers')));
  global.funds.X = F; }

console.log('\n■ 밑줄이 «없는» 빈 칸 — 화면으로 보고서야 찾은 자리');
/* 앞서 훑기는 ＿ 만 세어, 원본이 «그냥 빈 채로» 둔 칸을 통째로 놓쳤다.
   설립등기신청서의 「주사무소」가 그래서 빈 줄로 나가고 있었다. */
{ const Lz = Object.assign({}, F, { lease_lessor: '가나기계(주)', lease_addr: '충남 어느시 어느구 어느로 1, 2층', lease_from: '2026-03-01' });
  global.funds.X = Lz;
  ok('설립등기신청서 주사무소', /주사무소 충남 어느시 어느구 어느로 1/.test(draw('reg_apply', Lz)));
  /* 기타사항의 「1. 설립인허가연월일」 다음 줄은 앞뒤 글이 없는 밑줄 한 마디다 — 앞 마디를 보고 채운다 */
  ok('기타사항 설립인허가연월일', /설립인허가연월일 2026\. 1\. 2\./.test(draw('reg_apply', Lz)),
     (draw('reg_apply', Lz).match(/설립인허가연월일.{0,20}/) || [''])[0]);
  /* 두 번 붙이지 않는다 — 서식 흐름에서는 걷어내기가 밑줄 마디를 «지워» 이 갈래를 안 타지만,
     원본이 바뀌어 값이 남는 날 두 번 찍히면 안 된다. 그 갈래만 따로 걸어 본다. */
  { const cell = dom.window.document.createElement('div');
    cell.innerHTML = '<table><tbody><tr><td>기타사항</td><td>1. 설립인허가연월일<br>2020. 9. 9.</td></tr></tbody></table>';
    fillDerived(cell, Lz, [], 'reg_apply');
    ok('이미 값이 있으면 두 번 붙이지 않는다', !/2026\. 1\. 2\./.test(cell.textContent), T(cell.textContent)); }
  ok('인감신고서·인감카드 본점(주사무소)', /본점\(주사무소\) 충남 어느시/.test(draw('reg_seal', Lz)) && /본점\(주사무소\) 충남 어느시/.test(draw('reg_sealcard', Lz)));
  ok('인감카드 자격 / 성명', /자격 \/ 성명 이사 홍길동/.test(draw('reg_sealcard', Lz)));
  ok('사업자등록신청서 사업장(단체)소재지', /사업장\(단체\)소재지 충남 어느시/.test(draw('tax_bizreg', Lz)));
  /* 「주소」 이름표가 임대인 줄과 임차인 줄에 «둘 다» 있다 — 줄로 갈라야 한다.
     ⚠ 납작하게 편 글로는 못 본다. 안 채운 ＿ 칸은 stripBaked 가 «빈 칸»으로 만들어(원래 동작)
       「주소 대표자」처럼 이어 붙는다 — 처음에 그걸 밑줄로 기대해 검사가 틀렸다. 칸으로 본다. */
  const lrow = (function () { const d = dom.window.document.createElement('div');
    d.innerHTML = hwpFormHTML('tax_lease', Lz, []);
    const o = {}; [].slice.call(d.querySelectorAll('tr')).forEach((tr) => {
      const c = [].slice.call(tr.children).map((x) => (x.textContent || '').trim());
      if (c.length >= 4 && /^임(대|차)인/.test(c[0].replace(/\s/g, ''))) o[c[0].replace(/\s/g, '')] = c;
      if (c.length >= 4 && c[0].replace(/\s/g, '') === '대표자') o['대표자'] = c;
    }); return o; })();
  /* 임대인 칸에 원본의 «남의 회사 이름»이 박혀 있었다 — 지우고 적어 둔 임대인을 넣는다 */
  ok('임대차계약서 임대인 = 적어 둔 임대인', (lrow['임대인(갑)'] || [])[1] === '가나기계(주)', JSON.stringify(lrow['임대인(갑)']));
  ok('임차인 주소를 채운다', (lrow['임차인(을)'] || [])[3] === '충남 어느시 어느구 어느로 1, 2층', JSON.stringify(lrow['임차인(을)']));
  ok('임대인 주소는 비워 둔다 (남의 것)', (lrow['임대인(갑)'] || [])[3] === '', JSON.stringify(lrow['임대인(갑)']));
  ok('임대인 대표자·주민번호는 손대지 않는다',
     (lrow['대표자'] || [])[1] === '' && /^_{6}-_{7}$/.test((lrow['대표자'] || [])[3] || ''), JSON.stringify(lrow['대표자']));
  global.funds.X = F; }
/* 공개 배포되는 파일이라 «파일 자체»에도 남의 이름이 없어야 한다 */
{ const raw = fs.readFileSync(path.join(W, 'fund_forms.js'), 'utf8');
  ok('공개 서식 파일에 남의 회사 이름이 없다', !/이볼브|이벌브/.test(raw)); }

console.log('\n■ 값이 없으면 «지어내지 않는다»');
{ const E = { name:'빈기금', fund_type:'공동', officers:[], years:{} }; global.funds.X = E;
  const all = ['minutes','reg_apply','reg_accept','reg_roster','reg_seal','reg_sealpaper','reg_license','tax_bizreg','tax_lease','tax_hometax','bizplan']
    .map(k => k + ':' + draw(k, E)).join('\n');
  ok('undefined·NaN·null 이 어디에도 없다', !/undefined|NaN|null/.test(all));
  /* 「금 액 : 0원」 — 앞서 `금 0원`으로 찍어 «액 :»이 사이에 끼는 자리를 못 물었다(되돌림이 헛돌았다) */
  ok('0원·0천원을 지어 넣지 않는다', !/금 액 : 0원|기금사용 : 0원|기본재산은 금 0원|자본금 0천원|이사 선임 : 각 0 명|목적사업 : 0천원/.test(all),
     (all.match(/.{0,20}(: 0원|금 0원|0천원|각 0 명).{0,10}/) || [''])[0]);
  ok('이사 성명 자리는 밑줄로 남는다', /이사 성 명 [＿_]+ \(인\)/.test(all));
  ok('임대인이 없으면 「임대인 ＿(인)」 그대로 (빈 이름을 채우지 않는다)', /임대인 [＿_]+\(인\)/.test(all));
  ok('주민등록번호가 없으면 자리표 그대로', /\(_{6}-_{7}\)/.test(all) && /주민등록번호 _{6}-_{7}/.test(all));
  ok('관할 등기소가 없으면 남의 것 대신 밑줄', /[＿_]+ 귀중/.test(all) && !/서울남부/.test(all));
  global.funds.X = F; }

console.log('\n■ 배선');
ok('hwpFormHTML 이 마지막에 fillDerived 를 부른다', /fillDerived\(d,f,sites,kind\);\s*return "<p class='note'>/.test(gF('hwpFormHTML')));
ok('설립 출연확인서는 걷어내기 «앞에» 다시 짠다', /if\(kind==='contrib'\) fillFoundContribDoc\(d,f,sites\);\s*stripBaked\(d\);/.test(gF('hwpFormHTML')));
/* 규칙의 공백은 \s* 여야 한다 — 원본은 붙임공백이다 */
ok('규칙의 공백을 붙임공백에도 맞춘다 (_rx)', /var _rx=function\(p\)\{ return new RegExp\(String\(p\)\.replace\(\/ \/g,'\\\\s\*'\)\); \};/.test(gF('fillDerived')));

console.log(bad ? '\nFAILURES ' + bad : '\nALL PASS (자료가 있는 자리는 서식에 선다, 없는 자리는 비어 있다)');
process.exit(bad ? 1 : 0);
