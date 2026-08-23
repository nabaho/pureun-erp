/* 자동매칭이 틀렸을 때 «그 자리에서» 고치기
   (2026-08-13) 김보람 제보 — 세 건 모두 자동으로 후보가 붙은 줄이었다.
     1. 1/28 이현아 1,000,000 → 「상대방미정」 사건에 붙음 (사건이 등록돼 있지 않다)
     2. 1/20 계룡시청소년상담복지센터 300,000 → 「엠비프라텍」 에 붙음
     3. 1/29 (자)천안청화공사 1,100,000 → 「웅천새마을금고」 에 붙음

   까닭: 「찾기」·「등록」·「보류」 는 _st.state==='none' — «후보가 하나도 없을 때» 만 나온다.
   후보가 붙는 순간 셋 다 사라지므로, 엉뚱하게 붙어도 떼어낼 길이 그 자리에 없었다.
   일단 확정한 뒤 「확정 이력 ▸ 업체 바꾸기」 로 돌아가야 했다.

   ★ 더 나쁜 것: 적요와 업체명이 같으면 잘못 배운 별칭을 «안 지웠다».
     「(자)천안청화공사」 를 바로잡아도 별칭이 남아 다음 달에 또 웅천새마을금고로 끌려간다. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const src = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8').replace(/\r\n/g, '\n');

let pass = 0, fail = 0;
function t(name, got, want){
  const G = JSON.stringify(got), W = JSON.stringify(want);
  if(G === W){ pass++; console.log('  PASS ' + name + '  (' + G + ')'); }
  else { fail++; console.log('  FAIL ' + name + '\n    받음 ' + G + '\n    기대 ' + W); }
}

console.log('\n■ 표 — 후보가 붙어 있어도 「바꾸기」 가 있다');
/* ⚠ 단추의 «글월 모양»이 아니라 「어느 줄에 · 무엇을 여는가」를 본다.
   2026-08-23 단추에 class 하나(ld-act-more)가 붙자 모양을 그대로 찾던 검사가 깨졌다 —
   규칙은 하나도 안 바뀌었는데도 그랬다(CLAUDE.md). */
t('후보가 붙은 줄(none 이 아닌 줄)에 바꾸기 단추가 나온다',
  /_st\.state!=='none' && !isCms && h\('button',\{[\s\S]{0,120}?openFindRow\(row\)/.test(src), true);
t('그 단추 이름은 「↔ 바꾸기」', /\},'↔ 바꾸기'\)/.test(src), true);
// 단추 «자신의» 코드만 떼어 본다 — 뒤따르는 확정 단추까지 훑으면 늘 confirmRow 가 걸린다
const REMATCH_BTN = (function(){
  const b = src.indexOf("'↔ 바꾸기'");
  const a = src.lastIndexOf("_st.state!=='none' && !isCms", b);
  return (a < 0 || b < 0) ? '' : src.slice(a, b);
})();
t('바꾸기 단추의 코드를 찾았다', REMATCH_BTN.length > 0, true);
t('바꾸기는 확정하지 않는다 — 제 코드 안에 confirmRow 가 없다',
  /confirmRow/.test(REMATCH_BTN), false);
t('바꾸기는 찾기 창만 연다', /openFindRow\(row\)/.test(REMATCH_BTN), true);
t('CMS 합계 줄에는 안 붙인다 — 거기선 CMS 단추 하나여야 한다',
  /_st\.state!=='none' && !isCms/.test(src), true);
t('확정 단추는 그대로 있다',
  /_st\.state==='ready' && pItem && h\('button',\{[\s\S]{0,120}?confirmRow\(row,pItem/.test(src), true);
// 바꾸기가 확정보다 «왼쪽» 이어야 한다 — 오른쪽 끝은 늘 확정 자리다(손이 기억하는 위치)
t('바꾸기가 확정보다 앞에 온다',
  src.indexOf("'↔ 바꾸기'") < src.indexOf("style:_actBtn('#16a34a','#fff','#16a34a')},'확정'"), true);

console.log('\n■ 찾기 창 — 지금 무엇이 붙어 있는지 먼저 보여준다');
t('붙어 있는 후보를 창 위에 적는다',
  /_sel && pendById\[_sel\] && h\('div'[\s\S]{0,400}?'지금 붙어 있는 것 — '/.test(src), true);
t('아직 확정이 아니라고 못 박는다', /아직 확정한 것이 아닙니다/.test(src), true);

console.log('\n■ 찾기 창 — 목록에 맞는 것이 없을 때의 길');
t('「사무관리에 없음 — 수입으로만 등록」 이 있다',
  /'✎ 사무관리에 없음 — 수입으로만 등록'/.test(src), true);
t('그 길은 직접 등록 창(dirPop)을 연다',
  /맞는 것이 없나요\?[\s\S]{0,700}?setDirPop\(\{row:_row/.test(src), true);
t('나눠담기도 창 안에서 갈 수 있다',
  /맞는 것이 없나요\?[\s\S]{0,1500}?setSpRow\(_row\); setSpOpen\(_row\._k\)/.test(src), true);
t('보류함도 창 안에서 갈 수 있다',
  /맞는 것이 없나요\?[\s\S]{0,2000}?holdRow\(_row\)/.test(src), true);
t('어디로 가든 찾기 창은 닫는다 — 창 두 개가 겹치면 안 된다',
  /setSugPopK\(''\); setSugPopQ\(''\);\n\s*setDirPop/.test(src), true);

console.log('\n■ 바꾼 뒤 — 무엇을 무엇으로 바꿨는지 말해 준다');
t('바꾸기 전에 붙어 있던 이름을 잡아 둔다',
  /var _was = \(_sel && pendById\[_sel\]\) \? \(pendById\[_sel\]\.companyName \|\| ''\) : '';/.test(src), true);
t('「A → B 로 바꿨습니다」 라고 알린다',
  /showToast\('↔ ' \+ _was \+ ' → ' \+ _c\.companyName \+ ' 로 바꿨습니다'/.test(src), true);
t('처음 고르는 것이면 예전처럼 「기억함」',
  /🔖 기억함 — 다음부터 「'\+_memo\+'」 은 '\+_c\.companyName/.test(src), true);

// ── 잘못 배운 별칭 지우기 — 소스의 진짜 함수로 확인한다 ──
console.log('\n■ 적요=업체명이어도 잘못 배운 것은 지운다');
const store = {};
const ctx = { console:console, KEY:'pu_',
  localStorage:{ getItem(k){ return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
                 setItem(k, v){ store[k] = v; } } };
ctx.window = ctx;
vm.createContext(ctx);
const grab = (from, to) => {
  const a = src.indexOf(from), b = src.indexOf(to, a);
  if(a < 0 || b < 0) throw new Error('소스에서 못 찾음: ' + from);
  return src.slice(a, b);
};
// 최소한의 받침대 — dbGet/dbSet 은 소스의 것을 그대로 쓰기엔 짐이 너무 크다
vm.runInContext(`
  var _st = {};
  function dbGet(k, def){ return _st.hasOwnProperty(k) ? _st[k] : def; }
  function dbSet(k, v){ _st[k] = v; return true; }
  function erpNormName(s){ return String(s||'').replace(/[\\s()（）㈜(주)주식회사]/g, '').toLowerCase(); }
`, ctx);
vm.runInContext(grab('var PAYER_ALIAS_KEY =', '\n// ── 출금 적요 → 카테고리 학습 ──'), ctx);

// ① 「이현아」 → 상대방미정 으로 잘못 배운 상태
ctx.erpLearnPayerAlias('이현아', { companyName:'상대방미정' });
t('잘못 배운 것이 들어 있다', ctx.erpAliasCompany('이현아').companyName, '상대방미정');
// ② 진짜 업체로 다시 고르면 덮어쓴다
ctx.erpLearnPayerAlias('이현아', { companyName:'한국산업인력공단' });
t('다시 고르면 새 곳으로 바뀐다', ctx.erpAliasCompany('이현아').companyName, '한국산업인력공단');
t('셈도 1부터 다시 — 틀린 학습의 무게를 물려받지 않는다', ctx.erpAliasCompany('이현아').count, 1);

// ③ ★ 적요가 곧 업체명인 경우 — 예전에는 그냥 false 로 돌아서 틀린 별칭이 남았다
ctx.erpLearnPayerAlias('(자)천안청화공사', { companyName:'웅천새마을금고' });
t('잘못 배운 「천안청화공사 → 웅천새마을금고」',
  ctx.erpAliasCompany('(자)천안청화공사').companyName, '웅천새마을금고');
const ret = ctx.erpLearnPayerAlias('(자)천안청화공사', { companyName:'(자)천안청화공사' });
t('배울 것이 없으므로 false 를 돌려준다', ret, false);
t('그래도 틀린 별칭은 지워진다', ctx.erpAliasCompany('(자)천안청화공사'), null);

// ④ 없는 것을 지우려 해도 안 터진다
t('없는 것을 지워도 조용하다', ctx.erpForgetPayerAlias('없는키'), false);
t('빈 적요는 배우지 않는다', ctx.erpLearnPayerAlias('', { companyName:'아무데나' }), false);
t('업체명이 없으면 배우지 않는다', ctx.erpLearnPayerAlias('적요', {}), false);

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===\n');
if(fail) process.exit(1);
