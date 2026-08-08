// 미입금 후보를 어느 원장에서 뽑는가 — 계약 중복과 sourceKind 깨짐
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, hint){
  if(cond){ pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (hint ? ' — ' + hint : '')); }
}
function eq(name, got, want){
  const good = JSON.stringify(got) === JSON.stringify(want);
  if(good){ pass++; console.log('  PASS ' + name + '  (' + JSON.stringify(got) + ')'); }
  else { fail++; console.log('  FAIL ' + name + '  받음 ' + JSON.stringify(got) + ' · 기대 ' + JSON.stringify(want)); }
}

console.log('\n[계약은 후보에서 뺀다 — 이관하면 사건·컨설팅이 생겨 성공보수가 두 번 잡혔다]');

// STORES 선언을 모두 찾아 계약이 들어있는지 본다
const storeDecls = src.match(/var STORES = \[[\s\S]{0,220}?\];/g) || [];
ok('STORES 선언을 찾았다 (거래내역·미입금대기)', storeDecls.length >= 2,
   '찾은 개수 ' + storeDecls.length);
storeDecls.forEach(function(d, i){
  ok('STORES #' + (i+1) + ' 에 계약이 없다', !/key:'contracts'/.test(d));
  ok('STORES #' + (i+1) + ' 에 4종이 다 있다',
     /key:'cases'/.test(d) && /key:'consultings'/.test(d) &&
     /key:'funds'/.test(d) && /key:'other_projects'/.test(d));
});

// 입금관리(미입금 대기)가 보는 4종 — 이쪽이 원래부터 맞았다. 거래내역이 여기에 맞춰졌는지 본다.
const pendDecl = (src.match(/4종 원장에서 미입금 항목 추출[\s\S]{0,900}?\];/) || [''])[0];
ok('입금관리의 4종 선언을 찾았다', pendDecl.length > 0);
ok('입금관리도 계약을 안 본다', pendDecl.length > 0 && !/key:\s*'contracts'/.test(pendDecl));
['cases','consultings','funds','other_projects'].forEach(function(k){
  ok('입금관리가 ' + k + ' 를 본다', new RegExp("key:\\s*'" + k + "'").test(pendDecl));
});
ok('왜 뺐는지 코드에 적혀 있다', /계약\(contracts\)은 넣지 않는다|계약\(contracts\)은 뺀다/.test(src));

console.log('\n[sourceKind 가 깨지지 않는다 — replace(\'s\',\'\') 는 맨 앞 s 를 지운다]');

// 실제 동작으로 확인
const stores = ['cases','consultings','funds','other_projects'];
eq('옛 방식은 이름을 망가뜨린다',
   stores.map(s => s.replace('s','')),
   ['caes','conultings','fund','other_project']);
eq('고친 방식은 끝의 s 만 지운다',
   stores.map(s => s.replace(/s$/,'')),
   ['case','consulting','fund','other_project']);

ok('코드에 옛 방식이 남아 있지 않다', !/store\.replace\('s',''\)/.test(src),
   "pItem.store.replace('s','') 가 아직 있습니다");
const fixed = (src.match(/store\.replace\(\/s\$\/,''\)/g) || []).length;
ok('고친 방식이 쓰인다 (' + fixed + '곳)', fixed >= 3);

console.log('\n[성과급 계산도 같은 이름을 쓴다]');
ok('성과급 계산이 끝의 s 만 지운다',
   /calcPerfShares\([\s\S]{0,220}?store==='companies'\?'company':[\s\S]{0,40}?store\.replace\(\/s\$\/,''\)/.test(src));

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===\n');
process.exit(fail ? 1 : 0);
