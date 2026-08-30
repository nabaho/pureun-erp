/* PC 기업 상세 표 — 회사 열쇠에 작은따옴표가 들어 있으면 줄을 눌러도 아무 일이 안 일어난다
   (2026-08-15)

   ★ 무엇이 문제였나
     사업자번호 10자리가 없는 회사의 열쇠는 'n' + 다듬은 회사이름 이다(coKeyOf).
     이름 다듬기(_norm)는 공백·(주)·주식회사·㈜·[.#$/[]] 만 지울 뿐
     «작은따옴표는 안 지운다» — 「O'Brien 코리아」 같은 이름이 그대로 열쇠에 들어간다.
     esc() 가 ' 를 &#39; 로 바꿔 주지만, 브라우저는 큰따옴표 onclick 속성을 읽을 때
     그 엔티티를 «먼저 ' 로 되돌린 뒤» 자바스크립트로 실행한다.
       onclick="pickCo('n오'brien코리아')"   ← 인자가 중간에서 끊긴다
     구문 오류가 나고 «조용히» 실패한다 — 눌러도 아무 일이 없다.

   ★ 고치는 법: 먼저 역슬래시를 붙이고, 그 다음 esc.
       esc(String(o.key).replace(/'/g,"\\'"))
     ⚠ 순서를 뒤집으면 이미 &#39; 로 바뀌어 있어 아무것도 안 걸리는 «죽은 코드» 가 된다.
       (이 저장소에서 실제로 겪은 실수다 — 8612행이 그렇게 되어 있어 함께 바로잡았다.) */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const src = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8').replace(/\r\n/g, '\n');

let pass = 0, fail = 0;
function t(name, got, want){
  const G = JSON.stringify(got), W = JSON.stringify(want);
  if(G === W){ pass++; console.log('  PASS ' + name + '  (' + G + ')'); }
  else { fail++; console.log('  FAIL ' + name + '\n    받음 ' + G + '\n    기대 ' + W); }
}

/* ── coListHtml 을 실제로 돌린다 (화면 그리기에 필요한 것만 세워 준다) ── */
function run(list, sel){
  const ctx = { console:console };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext([
    "const esc = s => String(s??'').replace(/[&<>\"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[c]));",
    'var state = { coSel: SEL, coColFilter: {}, coSort:{}, coTag:\'\' };',
    'function coArrow(){ return \'\'; }',
    'function coTagsOf(o){ return (o && o.tags) || []; }',
    /* 2026-08-30: 상호 못 읽은 회사도 목록에 남는다 — 줄이 «보여줄 이름»을 쓴다 */
    "function coDisplayName(o){ return (o && String(o.name||'').trim()) || (o && o.bizno) || ''; }",
    'function coDocIcons(){ return \'\'; }',
    'function coMgrCell(){ return \'\'; }'
  ].join('\n').replace('SEL', JSON.stringify(sel || {})), ctx);
  // 검사 대상 함수만 떼어 온다
  /* 나눠 보기가 붙은 뒤로 coListHtml 은 «잘린 쪽»을 받는다(2026-08-15).
     여기서 볼 것은 열쇠 이스케이프뿐이라 한 쪽에 다 담아 넘긴다. */
  /* 2026-08-24(2순위): 회사 목록 위에 «고아 기업정보» 알림 띠가 붙었다 —
     이 검사는 열쇠 이스케이프만 보므로 빈 값으로 둔다. */
  vm.runInContext("function coSizeSelHtml(){return ''} function coPagerHtml(){return ''} function coOrphanBarHtml(){return ''} function coMissing(){return []} function coCares(o){return !!(o&&(o.erp||((o.tags||[]).length)))}", ctx);
  vm.runInContext(src.slice(src.indexOf('function coListHtml(info){'),
                            src.indexOf('function coDocsHtml(')), ctx);
  return ctx.coListHtml({ rows:list, total:list.length, page:0, pages:1, size:200,
                          from:list.length?1:0, to:list.length });
}

/* 사업자번호가 없어 이름으로 열쇠를 만든 회사 — 이름에 작은따옴표가 있다 */
const QUOTE_KEY = "n오'brien코리아";
function row(o){ return Object.assign({ cards:[], docs:0, erp:null, tags:[], bizno:'' }, o); }
const ROWS = [row({ key:QUOTE_KEY, name:"오'brien 코리아" })];

console.log('\n[① 열쇠가 자바스크립트 문자열로 성하게 실린다]');
const html = run(ROWS);
/* ⚠ 닫는 따옴표까지 붙여 찾지 않는다 — 고른 줄에는 표시 클래스가 하나 더 붙는다
   (2026-08-17 끌어서 고르기). 이 검사가 보려는 것은 «줄이 그려졌는가» 뿐이다. */
t('줄을 그렸다', html.indexOf('class="corow') >= 0, true);
/* 브라우저가 하는 일을 그대로 흉내낸다 — 속성값의 엔티티를 되돌린 뒤 자바스크립트로 읽는다 */
function attrOf(h, name){
  const m = h.match(new RegExp(name + '="([^"]*)"'));
  return m ? m[1].replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&') : null;
}
const onclick = attrOf(html, 'onclick(?=="pickCo)') || (html.match(/onclick="(pickCo[^"]*)"/) || [])[1];
const jsClick = String(onclick || '').replace(/&#39;/g, "'");
t('줄 누르기 코드가 있다', /^pickCo\(/.test(jsClick), true);
/* ★ 핵심 — 이 코드가 «구문 오류 없이» 읽히고, 열쇠가 통째로 전달되어야 한다 */
let gotKey = null;
const cx = { pickCo:function(k){ gotKey = k; }, coToggle:function(k){ gotKey = k; } };
vm.createContext(cx);
let syntaxOk = true;
try { vm.runInContext(jsClick, cx); } catch(e){ syntaxOk = false; }
t('★ 구문 오류 없이 실행된다 (전에는 여기서 조용히 죽었다)', syntaxOk, true);
t('★ 열쇠가 잘리지 않고 그대로 넘어온다', gotKey, QUOTE_KEY);

console.log('\n[② 체크상자도 같은 열쇠를 온전히 넘긴다]');
const onchange = (html.match(/onchange="(coToggle[^"]*)"/) || [])[1];
const jsChange = String(onchange || '').replace(/&#39;/g, "'");
gotKey = null;
let ok2 = true;
try { vm.runInContext(jsChange, cx); } catch(e){ ok2 = false; }
t('★ 구문 오류 없이 실행된다', ok2, true);
t('★ 열쇠가 그대로 넘어온다', gotKey, QUOTE_KEY);

console.log('\n[③ 따옴표 없는 흔한 회사도 예전 그대로다]');
const plain = run([row({ key:'3128152792', name:'푸른노무법인', bizno:'312-81-52792' })]);
gotKey = null;
vm.runInContext(String((plain.match(/onclick="(pickCo[^"]*)"/) || [])[1]).replace(/&#39;/g, "'"), cx);
t('열쇠가 그대로', gotKey, '3128152792');

console.log('\n[④ 다른 특수문자도 화면을 깨뜨리지 않는다]');
/* 회사 이름에는 & 나 < 가 들어가기도 한다. 열쇠에 실려도 태그가 깨지면 안 된다. */
const AMP = 'nA&B<코리아';
const h2 = run([row({ key:AMP, name:'A&B<코리아' })]);
t('꺾쇠가 태그로 새지 않는다', h2.indexOf('<코리아') < 0, true);
gotKey = null;
let ok4 = true;
try { vm.runInContext(String((h2.match(/onclick="(pickCo[^"]*)"/) || [])[1])
  .replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'), cx); }
catch(e){ ok4 = false; }
t('구문 오류 없이 실행된다', ok4, true);
t('열쇠가 그대로', gotKey, AMP);

console.log('\n[⑤ 고른 표시는 원래 열쇠로 본다 — 화면용으로 바꾼 글자로 보면 안 켜진다]');
const hSel = run(ROWS, (function(){ const s = {}; s[QUOTE_KEY] = 1; return s; })());
/* ⚠ 표 «머리»의 「전체 고르기」 네모도 함께 켜지므로, 그냥 찾으면 줄의 네모가 안 켜져도 통과한다.
   반드시 줄(tbody) 안의, coToggle 이 달린 네모만 본다. */
const body = hSel.split('<tbody>')[1] || '';
t('★ 줄의 체크가 켜져 있다', /<input type="checkbox" checked[\s\S]{0,40}onchange="coToggle/.test(body), true);
t('머리의 「전체 고르기」와 헷갈리지 않았다', body.indexOf('coSelAll') < 0, true);

console.log('\n[⑥ 순서가 맞다 — 먼저 역슬래시, 그 다음 esc]');
const BLK = src.slice(src.indexOf('function coListHtml(info){'), src.indexOf('function coDocsHtml('));
t('★ 이 파일의 다른 곳과 같은 방식', /esc\(String\(o\.key\)\.replace\(\/'\/g,"\\\\'"\)\)/.test(BLK), true);
t('★ 뒤집힌 죽은 코드가 아니다 (esc 뒤에 바꾸면 아무것도 안 걸린다)',
  /esc\(o\.key\)\.replace\(\/'\/g/.test(BLK), false);
t('★ 맨 열쇠를 그대로 심던 옛 코드가 사라졌다', /pickCo\('\$\{esc\(o\.key\)\}'\)/.test(src), false);
t('체크상자 쪽도', /coToggle\('\$\{esc\(o\.key\)\}'\)/.test(src), false);
t('한 번만 만들어 둘 다 쓴다 (한쪽만 고치는 일이 없게)', /const kJs = esc\(String\(o\.key\)\.replace/.test(BLK), true);

console.log('\n[⑦ 같은 실수가 있던 담당 노무사 거르기도 바로잡았다]');
/* esc() «뒤에» 바꾸고 있어 아무것도 안 걸리는 죽은 코드였다 */
t('★ 순서를 바로잡았다', /esc\(_one\.replace\(\/'\/g,"\\\\'"\)\)/.test(src), true);
t('★ 뒤집힌 옛 코드가 사라졌다', /esc\(_one\)\.replace\(\/'\/g/.test(src), false);

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===\n');
process.exit(fail ? 1 : 0);
