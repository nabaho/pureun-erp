/* 발행관리 목록에 «홈택스로 올린 것» 을 함께 보여주기
   (2026-08-13) 김보람 제보: 발행관리 탭에서 엑셀을 올렸는데 목록은 그대로 「없음」 이었다.
   버튼은 발행관리 탭에 있는데 담기는 곳은 «업체별 아카이브»(IndexedDB)였고,
   발행관리 목록은 손으로 발행한 것(finance_invoice)만 봤기 때문이다.
   서버에 올리지는 않는다 — 홈택스 수천 건이 미수금·성과급으로 새면 안 된다.
   그래서 «화면에서만» 회색으로 섞어 보여주고, 윗줄 합계는 직접발행분만 센다. */
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

const ctx = { console:console };
ctx.window = ctx;
vm.createContext(ctx);
const grab = (from, to) => {
  const a = src.indexOf(from), b = src.indexOf(to, a);
  if(a < 0 || b < 0) throw new Error('소스에서 못 찾음: ' + from);
  return src.slice(a, b);
};
vm.runInContext(grab('function erpInvPeriodRange(monthFilter){', '\nif(typeof window !== \'undefined\'){\n  window.erpInvFillGroup'), ctx);

console.log('\n■ 기간 고르개 → 날짜 두 끝');
t('전체', ctx.erpInvPeriodRange(''), { lo:'0000-00-00', hi:'9999-99-99' });
t('연도별', ctx.erpInvPeriodRange('2026'), { lo:'2026-01-01', hi:'2026-12-31' });
t('1분기', ctx.erpInvPeriodRange('2026-Q1'), { lo:'2026-01-01', hi:'2026-03-31' });
t('4분기', ctx.erpInvPeriodRange('2026-Q4'), { lo:'2026-10-01', hi:'2026-12-31' });
t('월별', ctx.erpInvPeriodRange('2026-03'), { lo:'2026-03-01', hi:'2026-03-31' });
// 글자 비교라 2월에 31일을 써도 탈이 없다 — '2026-02-31' 보다 큰 2월 날짜는 없다
t('2월도 -31 로 끊어 놓치는 날이 없다',
  '2026-02-28' <= ctx.erpInvPeriodRange('2026-02').hi, true);
t('그 달을 넘지 않는다', '2026-03-01' <= ctx.erpInvPeriodRange('2026-02').hi, false);
t('아무 말이나 오면 전체로', ctx.erpInvPeriodRange('이상한값'), { lo:'0000-00-00', hi:'9999-99-99' });
t('null 도 전체로', ctx.erpInvPeriodRange(null), { lo:'0000-00-00', hi:'9999-99-99' });

console.log('\n■ 홈택스 한 줄 → 발행관리가 읽는 꼴');
const r = ctx.erpInvHtRow({ _id:'계룡시청소년상담복지센터|2026-01-20|300000|수수료#1',
  company:'계룡시청소년상담복지센터', biznum:'307-82-00000',
  date:'2026-01-20', supply:300000, item:'노무상담 수수료', note:'' });
t('홈택스분이라고 표가 붙는다', r.__hometax, true);
t('열쇠가 겹치지 않게 ht| 를 앞에 붙인다', r.id.slice(0, 3), 'ht|');
t('업체명', r.companyName, '계룡시청소년상담복지센터');
t('사업자번호도 실어 나른다', r.bizNo, '307-82-00000');
t('발행일', r.issueDate, '2026-01-20');
// 홈택스에는 «공급가액» 만 있으므로 부가세는 늘 별도로 본다
t('금액은 공급가액', r.amount, 300000);
t('부가세는 별도로 본다', r.vatType, 'separate');
t('빈 줄도 안 터진다', ctx.erpInvHtRow(null).amount, 0);
t('금액이 글자로 와도 숫자로', ctx.erpInvHtRow({ supply:'1,100,000' }).amount, 1);

console.log('\n■ 화면 — 섞어 보이되 재무 숫자는 안 건드린다');
t('목록은 직접발행 + 홈택스를 합쳐 그린다',
  /var listRows = filtered\.concat\(htShown\)/.test(src), true);
t('같은 날이면 직접발행이 위',
  /return \(a\.__hometax \? 1 : 0\) - \(b\.__hometax \? 1 : 0\);/.test(src), true);
t('윗줄 합계는 직접발행분(filtered)만 센다',
  /var totalAmount = filtered\.reduce/.test(src), true);
t('합계에 홈택스분을 더하지 않는다',
  /var totalAmount = (listRows|ht)\b/.test(src), false);
// 2026-08-14: 표는 깔때기로 한 번 더 거른 listRowsF 를 그린다 — listRows(직접발행+홈택스)에서 파생된 것이다
t('표는 listRows 에서 파생된 것을 그린다 — filtered 로 그리면 홈택스분이 안 보인다',
  /var listRowsF = listRows\.filter\(invFPass\);/.test(src) && /listRowsF\.map\(function\(it, idx\)\{/.test(src), true);
t('홈택스 줄은 고치거나 지울 수 없다 (읽기전용)',
  /isHt[\s\S]{0,300}?'읽기전용'/.test(src), true);
t('「구분」 칸이 생겼다', /h\('th', null, '구분'\)/.test(src), true);
t('빈 칸 수가 늘어난 만큼 colSpan 도 늘렸다', /colSpan:15/.test(src), true);

console.log('\n■ 기간 밖·많은 줄');
t('보고 있는 기간만 읽어 온다 — 통째로 읽으면 화면이 멈춘다',
  /idbGetRange\('invoice_history', 'date', rg\.lo, rg\.hi, HT_SHOW_MAX\)/.test(src), true);
t('끊었으면 «몇 건에서 끊었는지» 화면에 적는다 — 조용히 자르지 않는다',
  /ht\.capped &&[\s\S]{0,400}?끊었습니다/.test(src), true);
t('아카이브를 못 읽어도 직접발행분은 그대로 보인다',
  /홈택스 아카이브 로드 실패[\s\S]{0,160}?setHt\(\{ rows:\[\], capped:false, loading:false \}\)/.test(src), true);

console.log('\n■ 같은 파일을 두 번 올려도 겹치지 않는다');
t('열쇠에 Math.random() 을 안 섞는다 — 섞으면 같은 줄도 매번 새 줄이 된다',
  /_id:r\.name\+'\|'\+r\.date\+'\|'\+r\.supply\+'\|'\+Math\.random\(\)/.test(src), false);
t('열쇠는 업체|날짜|금액|품목#몇번째',
  /_id:base \+ '#' \+ seq\[base\]/.test(src), true);
t('이미 담긴 열쇠는 건너뛴다',
  /var invoices = keyed\.filter\(function\(r\)\{ return !haveIds\[r\._id\]; \}\)/.test(src), true);
t('업체 건수·금액은 «새로 담는 줄만» 센다',
  /var byCompany = \{\};\n\s*invoices\.forEach/.test(src), true);
t('뺀 자문업체를 몇 곳·몇 건인지 알려준다',
  /정기 자문업체 '\+skipCos\.length\+'곳 \/ '\+skipCnt/.test(src), true);
t('건너뛴 중복 건수도 알려준다', /이미 담겨 있어 건너뛴 '\+dupCnt/.test(src), true);

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===\n');
if(fail) process.exit(1);
