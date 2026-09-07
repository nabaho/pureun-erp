/* 업체관리 — 이관된 것을 맨 위에서 확인 · 세무사무실을 상세에서 보기 (대표 지시 2026-08-28)

   ★ ① 이관 확인
     계약관리에서 사건·컨설팅·기금·기타로 이관하면 「방금 들어온 건」 딱지가 붙고
     목록 맨 위로 올라온다(arvStamp·arvSort·arvBadge, 이틀 뒤 저절로 사라짐).
     그런데 «업체관리로 이관할 때만» 그것이 빠져 있어, 이관이 됐는지 사람이 알 길이 없었다.
     — 사무관리 다른 업무들과 같은 방식으로 맞춘다.

   ★ ② 세무사무실
     수정 화면에는 세무사무실 칸(이름·담당자·연락처·팩스·이메일)이 있는데
     «상세 보기»에는 없어서, 보려면 매번 [수정]을 눌러야 했다.
     보수총액 신고·연말정산 때 여기부터 찾는다. */
const fs = require('fs');
const path = require('path');
const { cutFn } = require('./cut-fn');

const src = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8').split('\r\n').join('\n');

let fail = 0, total = 0;
function ok(name, cond, hint) {
  total++;
  if (cond) { console.log('ok   ' + name); return; }
  fail++;
  console.log('FAIL ' + name + (hint ? '\n     → ' + hint : ''));
}

const co = cutFn(src, 'function CompanyManagement');
/* 상세 보기는 «따로 있는 부품»이다 — 목록(CompanyManagement)과 한 덩이가 아니다 */
const detail = cutFn(src, 'function CompanyDetailModal');

console.log('[① 이관하면 도장을 찍는다 — 두 갈래 모두]');
/* 이관은 «새 업체를 만드는 길»과 «이미 있는 업체에 이어 붙이는 길» 둘이다.
   한쪽만 찍으면 그 길로 들어온 것은 확인할 수 없다. */
/* ⚠ 2026-09-07 고침 — 전에는 두 줄이 «붙어 있는지»를 박아 두었다
   (arvStamp 다음 줄이 곧바로 dbUpsert 여야 통과). 그 사이에 줄이 하나 늘자
   기능은 멀쩡한데 검사가 깨졌다(이관 되돌리기 자리 xferUndo 를 넣을 때).
   봐야 할 것은 «붙어 있는가»가 아니라 «저장하기 전에 찍는가»다 — 차례로 본다. */
const xferFn = cutFn(src, 'function transferContract(');
const stampAt = xferFn.indexOf("Object.assign(item, arvStamp('계약', contract.contractNo));");
const saveAt = xferFn.indexOf("dbUpsert('companies', item)");
ok('새 업체를 만들 때 찍는다',
   stampAt > 0 && saveAt > 0 && stampAt < saveAt,
   '안 찍으면 새로 생긴 업체가 목록 어딘가에 조용히 묻힌다');
ok('기존 업체에 이어 붙일 때도 찍는다',
   /Object\.assign\(patch, arvStamp\('계약', contract\.contractNo\)\);/.test(src),
   '사람이 확인할 것은 「새 업체가 생겼나」가 아니라 「이관이 반영됐나」다');

console.log('\n[② 맨 위로 올라온다]');
ok('업체 목록이 arvSort 로 정렬된다', /fresh\.sort\(function\(a,b\)\{ return arvSort\(a, b, function\(x,y\)\{/.test(co),
   '맨 위로 안 오면 206곳 중에서 찾아야 한다');
ok('나머지는 등록일 최신순 그대로', /return \(y\.createdAt\|\|''\)\.localeCompare\(x\.createdAt\|\|''\);/.test(co),
   '기존 차례를 흔들면 안 된다 — 새 것만 위로 얹는다');

console.log('\n[③ 딱지가 보인다 — 컴퓨터·폰 둘 다]');
const badges = (co.match(/arvBadge\(co, 'companies', refreshCompanies\)/g) || []).length;
ok('업체명 옆에 딱지가 붙는다 (표·카드 두 곳)', badges === 2,
   '지금 ' + badges + '곳 — 한쪽만 달면 기기에 따라 안 보인다');
ok('사건관리와 같은 부품을 쓴다', /function arvBadge\(x, store, onDone\)/.test(src),
   '따로 만들면 모양·동작이 갈린다');
ok('이틀 뒤 저절로 사라진다', /var ARV_HOURS = 48;/.test(src));

console.log('\n[④ 세무사무실을 상세에서 본다]');
['taxOfficeName', 'taxContact', 'taxPhone', 'taxFax', 'taxEmail'].forEach(function (k) {
  ok('상세에 ' + k + ' 가 나온다', new RegExp("row\\('[^']+', co\\." + k + "\\)").test(detail),
     '수정 화면에만 있으면 볼 때마다 [수정]을 눌러야 한다');
});
ok('하나도 없으면 칸을 감춘다',
   /\(co\.taxOfficeName \|\| co\.taxContact \|\| co\.taxPhone \|\| co\.taxFax \|\| co\.taxEmail\) &&/.test(detail),
   '빈 줄 다섯은 화면만 길게 만든다');
/* 수정 화면과 «같은 이름»을 봐야 한다 — 한쪽만 이름이 바뀌면 조용히 빈칸이 된다 */
['taxOfficeName', 'taxContact', 'taxPhone', 'taxFax', 'taxEmail'].forEach(function (k) {
  ok('수정 화면도 같은 이름(' + k + ')을 쓴다', new RegExp("set\\('" + k + "'\\)").test(src));
});

console.log('\n  === ' + (total - fail) + ' 통과 / ' + fail + ' 실패 ===');
process.exit(fail ? 1 : 0);
