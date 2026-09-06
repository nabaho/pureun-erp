/* 근로복지넷 입력 도우미 — 옮겨 적을 값을 «맞게» 세우는가.

   근로복지넷은 인증서·간편인증으로 사람이 직접 로그인하는 곳이고 열린 통로(API)가 없다.
   그래서 앱은 «옮겨 적는 일»만 돕는다: 칸 차례대로 값을 세우고 칸마다 [복사]를 둔다.

   ⚠ 칸 차례는 «별지 제1호서식 지원신청서»를 따른다 — 공단이 받는 종이가 곧 화면이 묻는 것이다.
   ⚠ [복사] 단추의 «번호»가 그 줄의 값과 어긋나면, 화면에는 맞는 값이 보이는데
     엉뚱한 값이 복사된다. 눈으로는 안 보인다 — 눌러 보고 확인한다.
   ⚠ 금액·사람 수는 «쉼표 없는 숫자»를 복사한다(관공서 입력칸이 쉼표를 안 받는 곳이 많다).
     화면에는 쉼표를 넣어 보여 준다 — 둘이 다르므로 둘 다 본다.
   ⚠ 없는 값을 지어내지 않는다. 빈 칸은 «어디서 채우는지»를 알려 준다.

   실행: node fund-erp/tools/check_helper.js */
const fs = require('fs'), path = require('path');
const W = path.resolve(__dirname, '..', '..');
const src = fs.readFileSync(path.join(W, 'fund.html'), 'utf8');
let JSDOM;
/* jsdom 이 없는 곳에서 이 한 줄이 저장소의 «모든 앱» 배포를 막지 않게 한다 */
try { JSDOM = require('jsdom').JSDOM; }
catch (e) { console.log('SKIP: jsdom 이 없어 입력 도우미 검사를 건너뜁니다 (npm i jsdom --no-save)'); process.exit(0); }

let bad = 0;
const ok = (n, c, w) => { if (c) console.log('  · ' + n); else { bad++; console.log('  ✗ ' + n + (w ? '  — ' + w : '')); } };
function gF(n){const i=src.indexOf('function '+n+'(');if(i<0)throw Error('없음 '+n);let d=0;
  for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}}

const dom = new JSDOM('<!doctype html><body><div id=x></div></body>');
global.window = dom.window; global.document = dom.window.document;
global.esc = v => String(v==null?'':v).replace(/[&<>"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));
global.num = v => (v==null||v===''?'':Math.round(Number(String(v).replace(/[^0-9.-]/g,''))||0));
global.hlp = () => '';
global.yearSel = () => '';
global.syLoad = () => {};
global.loadingHTML = (m) => String(m || '불러오는 중');
let copied = null;
global.toast = () => {};
global._copyText = (t, msg) => { copied = { t: t, msg: msg }; };
(0, eval)(gF('_dotDate'));
(0, eval)(gF('_officersOf'));
(0, eval)(gF('_boss'));
(0, eval)(gF('_subPlanAgg'));
(0, eval)(gF('_subNetRows'));
(0, eval)(gF('subNetCopy'));
(0, eval)(gF('subNetCopyAll'));
(0, eval)(gF('subsidyHelperPanel'));

/* 사업장 둘 — 상시근로자 65+47, 출연금 3,000,000+2,000,000 */
const SITES = { a:{ name:'가나기계', company_size:65, contrib:3000000, status:'active' },
                b:{ name:'다라전자', company_size:47, contrib:2000000, status:'active' } };
const FUND = { name:'가나공동근로복지기금', chairman:'홍길동', address:'어느시 어느구 1',
  phone:'041-000-0000', inka_no:'0000-0000-0', corp_reg_no:'000000-0000000',
  tax_id_no:'000-00-00000', inka_date:'2021-04-22',
  officers:[{ role:'이사장', name:'홍길동' }],
  years:{ 2026:{ subsidy:{ gov_contrib:4000000, request_amount:9000000 } } } };
global.S = { fundId:'F1', sitesFor:'F1', sites:SITES, year:2026, sy:{} };

const draw = (f) => { document.getElementById('x').innerHTML = subsidyHelperPanel(f); return document.getElementById('x'); };
const box = draw(FUND);
const rows = [].slice.call(box.querySelectorAll('tbody tr'));
const label = (tr) => (tr.querySelector('th') ? tr.querySelector('th').textContent : '').trim();
const named = {};
rows.forEach((tr) => { if (tr.children.length === 3) named[label(tr)] = tr; });
const val = (n) => named[n] ? (named[n].children[1].textContent || '').trim() : '(칸 없음)';
const btn = (n) => named[n] ? named[n].querySelector('button') : null;

console.log('■ 칸 차례가 별지 제1호서식 그대로인가');
const order = rows.filter(t => t.children.length === 3).map(label);
console.log('   ' + order.join(' | '));
const HEAD6 = ['기금법인명','대표자','소재지','전화','기금인가번호','법인등록번호'];
ok('신청인 여섯 칸이 서식 차례대로', HEAD6.every((k, i) => order[i] === k), order.slice(0, 6).join('|'));
ok('그 다음이 현황·규모', order.indexOf('참여사업장 수') === 6 && order.indexOf('지원신청 금액') > 6, order.join('|'));
/* 서식에 «있는 칸»과 «없는 칸»을 갈라 둔다 — 섞으면 어느 것이 서식이 요구한 값인지 모른다 */
const heads = rows.filter(t => t.children.length === 1).map(t => (t.textContent || '').trim());
ok('서식에 없는 칸은 따로 묶고 그렇다고 말한다',
   heads.some(h => /그 밖에 자주 묻는 것/.test(h) && /별지 제1호서식에는 없/.test(h)), heads.join(' / '));
ok('고유번호·인가일이 그 묶음 뒤에 온다',
   order.indexOf('고유번호') > order.indexOf('지원신청 금액'), order.join('|'));

console.log('\n■ 값이 맞게 서는가');
ok('기금법인명', val('기금법인명') === '가나공동근로복지기금', val('기금법인명'));
ok('대표자는 명부의 이사장을 쓴다', val('대표자') === '홍길동', val('대표자'));
ok('기금인가번호', val('기금인가번호') === '0000-0000-0', val('기금인가번호'));
ok('참여사업장 수 = 2개사', /^2\s*개사$/.test(val('참여사업장 수')), val('참여사업장 수'));
ok('상시근로자 수 = 112명 (65+47)', /^112\s*명$/.test(val('상시근로자 수')), val('상시근로자 수'));
/* 출연(예정) 금액 = 참여사 출연금 + 지자체 출연금 (3,000,000+2,000,000+4,000,000) */
ok('출연(예정) 금액에 지자체 출연금이 더해진다', /^9,000,000\s*원$/.test(val('출연(예정) 금액')), val('출연(예정) 금액'));
ok('인가일은 서식 관례(2021. 4. 22.)로 보인다', val('인가일') === '2021. 4. 22.', val('인가일'));

console.log('\n■ 눌러서 «그 줄의 값»이 복사되는가');
/* 단추 번호가 줄과 어긋나면 화면에는 맞는 값이 보이는데 엉뚱한 값이 복사된다 */
/* 단위(개사·명·원)는 «일부러» 복사하지 않는다 — 관공서 칸은 숫자만 받는다.
   그래서 견줄 때는 단위를 뺀 «값 부분»만 본다(단위는 흐린 글씨로 따로 그린다). */
const shownVal = (n) => { const td = named[n].children[1].cloneNode(true);
  [].slice.call(td.querySelectorAll('.muted')).forEach((x) => x.remove());
  return (td.textContent || '').trim(); };
let wrong = 0;
Object.keys(named).forEach((k) => {
  const b = btn(k); if (!b || !/subNetCopy\(/.test(b.getAttribute('onclick') || '')) return;
  const i = +(b.getAttribute('onclick').match(/subNetCopy\((\d+)\)/) || [])[1];
  copied = null; subNetCopy(i);
  const shown = shownVal(k).replace(/,/g, '');      /* 쉼표는 보기용이다 */
  const got = String((copied || {}).t || '');
  if (got !== shown) { wrong++; console.log('      ' + k + ': 보임 ' + shown + ' / 복사 ' + got); }
});
ok('모든 칸이 «보이는 그 값»을 복사한다', wrong === 0, wrong + '칸 어긋남');
copied = null; subNetCopy(order.indexOf('출연(예정) 금액') >= 0 ? +(btn('출연(예정) 금액').getAttribute('onclick').match(/\((\d+)\)/)[1]) : 0);
ok('금액은 «쉼표 없이» 복사한다 (관공서 칸이 쉼표를 안 받는다)', copied.t === '9000000', copied.t);
ok('화면에는 쉼표를 넣어 보여 준다', /9,000,000/.test(val('출연(예정) 금액')), val('출연(예정) 금액'));
ok('무엇을 복사했는지 말해 준다', /출연\(예정\) 금액/.test(copied.msg) && /9000000/.test(copied.msg), copied.msg);

console.log('\n■ 전부 복사 — 표에 붙일 수 있게');
copied = null; subNetCopyAll();
const lines = String(copied.t).split('\n');
ok('칸이름과 값을 탭으로 갈라 준다', lines.every(l => l.split('\t').length === 2), lines[0]);
ok('빈 칸은 안 넣는다', lines.every(l => l.split('\t')[1] !== ''), lines.join(' / '));
ok('첫 줄이 기금법인명', lines[0] === '기금법인명\t가나공동근로복지기금', lines[0]);

console.log('\n■ 없는 값을 «지어내지 않는다»');
/* ⚠ 사업장도 함께 비운다. 기금만 비우면 참여사업장 수·상시근로자 수가 그대로 차 있어
     「빈 칸을 어떻게 다루나」를 못 본다 — 처음에 그렇게 헛돌았다. */
const _keep = S.sites; S.sites = {};
const bare = draw({ name:'', years:{} });
const brows = [].slice.call(bare.querySelectorAll('tbody tr')).filter(t => t.children.length === 3);
const bl = (t) => (t.querySelector('th').textContent || '').trim();
const bfind = (n) => brows.filter(t => bl(t) === n)[0];
ok('빈 칸은 「아직 없습니다」라고 말한다', /아직 없습니다/.test((bfind('기금법인명').children[1].textContent || '')),
   bfind('기금법인명').children[1].textContent);
ok('빈 칸에는 [복사]를 안 준다 (복사할 것이 없다)',
   !/subNetCopy/.test(bfind('기금법인명').innerHTML), bfind('기금법인명').innerHTML.slice(0, 120));
ok('기금 칸은 기금 정보로 보낸다', /goTab\('info'\)/.test(bfind('기금법인명').innerHTML));
ok('사업장 칸은 참여사업장으로 보낸다', /goTab\('sites'\)/.test(bfind('참여사업장 수').innerHTML));
/* 신청액은 «같은 탭 안»이라 하위 탭으로 옮겨야 한다 — goTab 을 쓰면 제자리에 머문다 */
ok('신청액은 신청·정산 하위 탭으로 보낸다', /goSubTab\('apply'\)/.test(bfind('지원신청 금액').innerHTML),
   bfind('지원신청 금액').innerHTML.slice(0, 160));
ok('어디서 채우는지 알려 준다', /당겨오기/.test(bfind('지원신청 금액').children[1].textContent || ''),
   bfind('지원신청 금액').children[1].textContent);
copied = null; subNetCopyAll();
ok('아무것도 없으면 복사하지 않는다', copied === null, JSON.stringify(copied));
S.sites = _keep;

console.log('\n■ 배선');
ok('하위 탭에 자리가 있다', /\['helper','⌨ 입력 도우미'\]/.test(src));
ok('그 탭이 이 화면을 그린다', /S\.subTab==='helper' \? subsidyHelperPanel\(f\)/.test(src));
/* 명부를 아직 안 읽었는데 그려 버리면 「참여사업장 0개사·상시근로자 0명」이 뜬다 —
   맞는 값처럼 보이지만 «아직 모르는» 값이다. 그럴 땐 불러오는 중이라고 말해야 한다.
   ⚠ 글자로 보면 안 된다. 처음에 소스에서 `S.sitesFor!==S.fundId` 를 찾게 했더니
     그 갈래를 `if(false)` 로 막아도 통과했다 — 해 보고 확인한다. */
let asked = null;
global.NS = 'ns';
global.fbDb = { ref: (r) => { asked = r; return { once: () => ({ then: () => ({ catch: () => {} }) }) }; } };
const _sf = S.sitesFor, _sv = S.sites;
S.sitesFor = 'OTHER'; S.sites = null;
const loading = subsidyHelperPanel(FUND);
ok('명부를 아직 안 읽었으면 «0개사»를 안 보여 준다', !/0\s*개사/.test(loading), loading.slice(0, 160));
ok('그 자리에서 명부를 읽으러 간다', /\/sites\//.test(String(asked)), String(asked));
S.sitesFor = _sf; S.sites = _sv;
/* 클립보드를 막아 둔 환경이 있다 — 되돌림 길이 한 곳에 모여 있어야 빠뜨리지 않는다 */
ok('복사는 한 곳(_copyText)에서만 한다',
   (src.match(/execCommand\('copy'\)/g) || []).length === 1, '되돌림 길이 여러 곳에 흩어져 있다');
ok('무엇을 왜 이렇게 하는지 ⓘ 로 알린다', /'sub\.helper':/.test(src));

console.log(bad ? '\nFAILURES ' + bad : '\nALL PASS (입력 도우미가 옮겨 적을 값을 맞게 세운다)');
process.exit(bad ? 1 : 0);
