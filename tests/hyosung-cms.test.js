// 효성CMS(효성에프엠에스) 명세도 나이스빌처럼 알아본다 — 같은 창고(cms_ledger)에 쌓인다
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

// ── 진짜 함수를 떼어내 돌려본다 ──
function grab(name){
  const m = src.match(new RegExp('\\nfunction ' + name + '\\s*\\([^)]*\\)\\s*\\{'));
  if(!m) throw new Error('못 찾음: ' + name);
  let depth = 0;
  for(let j = m.index + m[0].length - 1; j < src.length; j++){
    if(src[j] === '{') depth++;
    else if(src[j] === '}'){ depth--; if(depth === 0) return src.slice(m.index + 1, j + 1); }
  }
  throw new Error('닫는 괄호 못 찾음: ' + name);
}
function grabVar(name){
  const i = src.indexOf('\nvar ' + name + ' = [');
  if(i < 0) throw new Error('못 찾음: ' + name);
  const end = src.indexOf('\n];', i);
  return src.slice(i + 1, end + 3);
}
const sandbox = {};
new Function('exports', 'window',
  grabVar('CMS_LAYOUTS') + '\n' + grabVar('NB_HDR_MAP') + '\n'
  + grab('_nbNorm') + '\n' + grab('_nbDigits') + '\n'
  + grab('erpDetectNicebillSheet') + '\n' + grab('_nbStatusOf') + '\n'
  + grab('_nbReason') + '\n' + grab('erpNbStat') + '\n' + grab('erpNbGroupByDate') + '\n'
  + grab('erpCmsProviderName') + '\n'
  // _excelToISO 는 다른 곳에 있어 간단히 대신한다 (YYYY-MM-DD 문자열만 쓴다)
  + 'function _excelToISO(v){ return String(v==null?"":v).trim(); }\n'
  + grab('erpParseNicebill') + '\n'
  + 'Object.assign(exports,{erpDetectNicebillSheet, erpParseNicebill, _nbStatusOf, erpCmsProviderName, erpNbGroupByDate});'
)(sandbox, {});
const { erpDetectNicebillSheet, erpParseNicebill, _nbStatusOf, erpCmsProviderName, erpNbGroupByDate } = sandbox;

console.log('\n[나이스빌 파일은 예전 그대로 알아본다]');
{
  const sheet = [
    ['나이스빌 CMS 출금결과'],
    ['회원명','납부금액','출금일','정산예정일','상태','수수료','사업자번호','회원코드'],
    ['가나상사','220,000','2026-07-05','2026-07-08','출금성공 [자동출금]','300','123-45-67890','A001'],
    ['다라산업','165,000','2026-07-05','2026-07-08','출금실패 [잔액부족]','0','234-56-78901','A002'],
  ];
  const det = erpDetectNicebillSheet(sheet);
  eq('나이스빌로 알아본다', det && det.layout, 'nicebill');
  eq('머리줄을 찾았다', det.hdr, 1);
  const p = erpParseNicebill(sheet, det);
  eq('두 줄을 읽었다', p.rows.length, 2);
  eq('출처가 나이스빌로 찍힌다', p.rows.map(r=>r.src), ['nicebill','nicebill']);
  eq('출금성공/실패를 가린다', p.rows.map(r=>r.status), ['ok','fail']);
  eq('실패 사유를 뽑는다', p.rows[1].reason, '잔액부족');
  eq('금액에서 쉼표를 뗀다', p.rows[0].amount, 220000);
  eq('집계', [p.stat.ok, p.stat.fail, p.stat.okAmt], [1, 1, 220000]);
}

console.log('\n[효성CMS 파일 — 열 이름이 달라도 알아본다]');
{
  const sheet = [
    ['효성에프엠에스 수납결과 내역'],
    ['납부자명','청구금액','수납일','입금예정일','수납결과','수수료','사업자번호','고객번호'],
    ['마바테크','330,000','2026-07-10','2026-07-13','정상','250','345-67-89012','H100'],
    ['사아물산','110,000','2026-07-10','2026-07-13','미납(잔액부족)','0','456-78-90123','H101'],
    ['자차기업','220,000','2026-07-10','2026-07-13','정상','250','567-89-01234','H102'],
  ];
  const det = erpDetectNicebillSheet(sheet);
  eq('효성으로 알아본다', det && det.layout, 'hyosung');
  const p = erpParseNicebill(sheet, det);
  eq('세 줄을 읽었다', p.rows.length, 3);
  eq('출처가 효성으로 찍힌다', p.rows.map(r=>r.src), ['hyosung','hyosung','hyosung']);
  eq('「정상」 을 출금성공으로 본다', p.rows.map(r=>r.status), ['ok','fail','ok']);
  eq('「미납」 을 실패로 본다', p.rows[1].status, 'fail');
  eq('수납일이 출금일로 들어간다', p.rows[0].wdate, '2026-07-10');
  eq('입금예정일이 정산예정일로 들어간다', p.rows[0].setdate, '2026-07-13');
  eq('집계 — 성공 2건 550,000', [p.stat.ok, p.stat.fail, p.stat.okAmt], [2, 1, 550000]);

  // 정산예정일 묶음이 통장 대조에 쓰인다 — 성공 건만 센다
  const by = erpNbGroupByDate(p.rows);
  eq('정산예정일로 묶인다', Object.keys(by), ['2026-07-13']);
  eq('그 날 합계는 성공분만', by['2026-07-13'].amount, 550000);
}

console.log('\n[효성 표기 여러 가지]');
[
  [['고객명','출금금액','출금일','정산일','결과'], 'hyosung'],
  [['회원성명','수납금액','이체일','입금일','수납결과'], 'hyosung'],
  [['수납자명','청구액','수납일','정산예정일','상태'], 'hyosung'],
].forEach(([hdr, want], i) => {
  const det = erpDetectNicebillSheet([hdr, ['업체'+i,'100000','2026-07-01','2026-07-03','정상']]);
  eq('표기 ' + (i+1) + ' — ' + hdr.slice(0,2).join('·'), det && det.layout, want);
});

console.log('\n[상태 말이 달라도 가린다]');
[['출금성공','ok'],['정상','ok'],['성공','ok'],['완료','ok'],['수납','ok'],
 ['출금실패','fail'],['미납','fail'],['불능','fail'],['잔액부족','fail'],['지급정지','fail'],['해지','fail'],
 ['출금중','pending'],['','pending'],['접수','pending']].forEach(([s, want]) => {
  eq('「'+(s||'빈칸')+'」 → '+want, _nbStatusOf(s), want);
});
eq('대괄호 앞만 본다', _nbStatusOf('출금성공 [자동재출금]'), 'ok');
eq('효성도 괄호가 붙을 수 있다', _nbStatusOf('미납(잔액부족)'), 'fail');

console.log('\n[통장 파일을 CMS 로 오인하지 않는다 — 가장 위험한 실수]');
[
  ['하나은행 통장', ['거래일시','적요','맡기신금액','찾으신금액','잔액','거래점']],
  ['하나카드', ['이용일','가맹점','이용금액','할부','승인번호']],
  ['빈 시트', ['','','']],
  ['금액만 있고 이름 없음', ['날짜','청구금액','비고']],
  ['이름만 있고 금액 없음', ['납부자명','연락처','주소']],
].forEach(([label, hdr]) => {
  eq(label + ' 은 CMS 가 아니다', erpDetectNicebillSheet([hdr, ['a','b','c']]), null);
});

console.log('\n[두 회사 명세가 한 창고에 섞여도 이름을 맞게 부른다]');
eq('나이스빌만', erpCmsProviderName([{src:'nicebill'},{src:'nicebill'}]), '나이스빌');
eq('효성만', erpCmsProviderName([{src:'hyosung'}]), '효성');
eq('섞이면 그냥 CMS', erpCmsProviderName([{src:'nicebill'},{src:'hyosung'}]), 'CMS');
eq('출처가 없는 옛 줄은 나이스빌로 본다', erpCmsProviderName([{}]), '나이스빌');
eq('빈 목록', erpCmsProviderName([]), '나이스빌');

console.log('\n[코드에 제대로 붙었는지]');
ok('회사별 생김새 표가 있다', /var CMS_LAYOUTS = \[/.test(src));
ok('효성 이름·금액 열 후보가 있다', /layout:'hyosung',[\s\S]{0,200}?납부자명[\s\S]{0,200}?청구금액/.test(src));
ok('창고에 출처를 함께 저장한다', /src:\(r\.src==='hyosung'\?'hyosung':'nicebill'\)/.test(src));
ok('읽을 때 출처를 찍는다', /src: det\.layout \|\| 'nicebill',/.test(src));
ok('출처 이름을 정하는 함수가 있다', /function erpCmsProviderName\(rows\)/.test(src));
ok('통장 적요에 효성 표식을 넣었다', /효성에프엠에스[\s\S]{0,80}?에프엠에스/.test(src));
ok('「효성」 한 낱말은 안 넣었다 (효성중공업 오인 방지)',
   !/CMS_MEMO_MARKERS = \[[^\]]*'효성'[,\]]/.test(src));
ok('명세 표에 출처 배지가 있다', /r\.src==='hyosung'\?'효성':'나이스빌'/.test(src));
ok('입금 메모에 어느 회사인지 남긴다', /r\.src==='hyosung'\?'효성CMS':'나이스빌CMS'/.test(src));
ok('수수료 지출 지급처도 실제 회사', /var _fp = erpCmsProviderName\(doneRows\) \+ ' CMS';/.test(src));
ok('빈 화면 안내가 두 회사를 말한다', /나이스빌 · 효성CMS 출금 결과 내역/.test(src));
ok('창고는 하나 그대로다 (cms_ledger)', /var CMS_LEDGER_KEY = 'cms_ledger';/.test(src));

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===\n');
process.exit(fail ? 1 : 0);
