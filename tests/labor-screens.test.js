/* 노동법 화면이 급여관리에 제대로 물려 있는가 — payroll-os.html
   왜 검사하는가: 화면 3장은 계산을 **직접 하지 않고** 코어(PuLaborCore)를 불러야 한다.
   누군가 급한 마음에 화면에 계산식을 박으면, 사업장 110곳에서 규칙이 갈라진다.
   실행: node tests/labor-screens.test.js */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const H = fs.readFileSync(path.join(ROOT, 'payroll-os.html'), 'utf8');
const CORE = fs.readFileSync(path.join(ROOT, 'js', 'pu-labor-core.js'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
}
function eq(name, got, want) {
  ok(name + ' (=' + want + ')', got === want, '실제 ' + got);
}
function section(t) { console.log('\n── ' + t + ' ──'); }

section('연결 — 코어 로드·메뉴·렌더');
ok('코어 스크립트를 불러온다', /<script src="js\/pu-labor-core\.js\?v=\d+"><\/script>/.test(H));
ok('코어 스크립트가 화면 코드보다 먼저 온다',
  H.indexOf('pu-labor-core.js') < H.indexOf('function screenAttend'));
['attend', 'leave', 'sever'].forEach(function (id) {
  ok('메뉴에 ' + id + ' 있음', H.indexOf("{id:'" + id + "'") > -1);
  ok('render 에 ' + id + ' 분기 있음', H.indexOf("App.screen==='" + id + "'") > -1);
});
['screenAttend', 'screenLeave', 'screenSever'].forEach(function (fn) {
  ok(fn + ' 정의됨', H.indexOf('function ' + fn + '(') > -1);
});

section('규칙은 코어에만 — 화면에 계산식이 박히지 않았는가');
/* 화면 블록만 떼어 본다(코어 파일은 별도라 여기 없다).
   ⚠ 시작점은 달력·근태·연차·퇴직 코드가 모두 들어오도록 노동법 화면 블록의
     첫 줄(var LC = …)로 잡는다. screenAttend 부터 잡으면 그보다 앞에 있는
     달력 코드가 빠져 「코어를 부르는가」 검사가 헛돈다. */
const i0 = H.indexOf('var LC = (typeof PuLaborCore'), i1 = H.indexOf('function render()');
const SCR = H.slice(i0, i1 > i0 ? i1 : H.length);
ok('화면 블록을 찾았다', SCR.length > 500, '길이 ' + SCR.length);
['statutoryAllowances', 'accrueAnnual', 'annualLedger', 'annualUnusedPay',
  'promotionSchedule', 'averageWage', 'severancePay', 'retirementIncomeTax',
  'dcContribution', 'hourlyOrdinary'].forEach(function (fn) {
    ok('화면이 코어의 ' + fn + '() 를 부른다', SCR.indexOf('LC.' + fn + '(') > -1);
  });
// 가산율·연차일수 같은 법정 숫자를 화면에 다시 적으면 안 된다
ok('화면에 가산율 1.5/2.0 을 다시 적지 않았다', !/[^\d.]1\.5\s*\*|\*\s*1\.5|\*\s*2\.0/.test(SCR));
ok('화면에 연차 15/25 를 계산식으로 박지 않았다', !/15\s*\+\s*bonus|Math\.min\(15/.test(SCR));
/* 설명문(note)에는 법 공식을 글로 적어 둔다 — "1일 평균임금 × 30일 × 재직일수/365".
   그건 계산이 아니라 안내다. 안내문은 곱셈기호(×)를 쓰고 코드는 ASCII 별표(*)를
   쓰므로, 별표로만 찾으면 안내문을 오탐하지 않는다. */
ok('퇴직금 30일 공식을 화면에서 계산하지 않았다', !/\*\s*30\b/.test(SCR));

section('화면이 쓰는 기존 도우미가 실제로 있는가');
['function dedupeEmps(', 'function won(', 'function navTo(', 'function dbGet(',
  'function dbSet(', 'function goBack('].forEach(function (fn) {
    ok('도우미 ' + fn.replace('function ', '').replace('(', '') + ' 존재', H.indexOf(fn) > -1);
  });
ok('setAttend·lput·addSever 가 window 에 노출됨',
  /window\.setAttend\s*=/.test(H) && /window\.lput\s*=/.test(H) && /window\.addSever\s*=/.test(H));

section('코어 자체 규율');
ok('코어에 사업장 이름이 박혀 있지 않다(설정 주입식)',
  !/화담원|제이앤드씨|늘봄|주민정/.test(CORE));
ok('코어는 DOM 을 만지지 않는다',
  !/document\.|window\.addEventListener|innerHTML/.test(CORE));
ok('코어는 Firebase 를 모른다', !/firebase|dbGet|dbSet/.test(CORE));
ok('코어가 node 에서 단독으로 불린다', /module\.exports/.test(CORE));
ok('법 근거가 주석에 적혀 있다',
  /근기법 56조/.test(CORE) && /퇴직급여법/.test(CORE) && /소득세법/.test(CORE));

section('개인정보 — 실데이터가 섞여 들어가지 않았는가');
ok('코어에 주민번호 형태 문자열이 없다', !/\d{6}\s*-\s*\d{7}/.test(CORE));
ok('화면 블록에 직원 실명 시드가 없다', !/LEAVE_LEDGER_SEED/.test(SCR));


section('간이세액표 — 앱 연결');
ok('설정 카드에 간이세액표 가져오기 버튼', H.indexOf('importTaxTable()') > -1);
ok('importTaxTable 정의됨', H.indexOf('function importTaxTable(') > -1);
ok('window 에 노출됨', /window\.importTaxTable\s*=/.test(H));
ok('tax_table 키로 저장한다', /dbSet\('tax_table'/.test(H));
ok('올릴 때 모양을 검사한다(rows 없으면 거부)', /rows 가 없습니다/.test(H));
ok('마지막 구간 상한을 검사한다(높은 급여 누락 방지)', /마지막 구간에 상한이 있습니다/.test(H));
ok('표 없으면 화면이 알린다', /간이세액표가 없어 소득세를 계산하지 못합니다/.test(H));

section('근태 → 급여 미리보기');
ok('미리보기 표가 있다', H.indexOf('근태 반영 급여 미리보기') > -1);
ok('통합계산은 코어가 한다(LC.monthlyPayroll)', SCR.indexOf('LC.monthlyPayroll(') > -1);
ok('간이세액표를 코어에 넘긴다', /간이세액표: TT/.test(SCR));
ok('최저임금 연도값을 코어에 넘긴다', /최저임금시급: mwH/.test(SCR));
/* 자녀공제 금액은 코어에만 있어야 한다. 화면 설명문은 "12,500"(쉼표)으로 적으므로
   쉼표 없는 숫자로 찾으면 계산식이 박힌 경우만 걸린다. */
ok('화면에 자녀공제 금액을 계산식으로 박지 않았다', !/\b12500\b|\b29160\b/.test(SCR));
ok('코어에 자녀공제 금액이 있다', /12500/.test(CORE) && /29160/.test(CORE));
ok('코어가 국세청 산식을 추정하지 않는다고 밝힌다', /산식을 짓지 않는다|산식을 공개하지 않는다/.test(CORE));


section('일별 출퇴근 달력 — 연결');
ok('screenDayCalendar 정의됨', H.indexOf('function screenDayCalendar(') > -1);
ok('근태 화면이 직원 선택 시 달력으로 보낸다', H.indexOf('if (App.emp) return screenDayCalendar();') > -1);
ok('화면 이동에 emp·day 차원이 있다(뒤로가기 동작)',
  /emp:App\.emp/.test(H) && /a\.emp===b\.emp/.test(H) && /App\.day=s\.day/.test(H));
['saveDay', 'delDay', 'clearDays', 'setHolidays'].forEach(function (fn) {
  ok(fn + ' 정의·노출',
    H.indexOf('function ' + fn + '(') > -1 && H.indexOf('window.' + fn + ' = ' + fn) > -1);
});
ok('달력 집계는 코어가 한다(LC.summarizeAttendance)', SCR.indexOf('LC.summarizeAttendance(') > -1);
ok('일별 기록이 손입력을 대신한다(derivedAttend 우선)',
  /var der = derivedAttend\(/.test(SCR) && /var att = der \|\|/.test(SCR));
ok('미리보기도 달력 값을 쓴다', /근태집계: derivedAttend\(/.test(SCR));
ok('같은 날짜는 덮어쓴다(두 줄이면 시간이 두 배로 센다)',
  /filter\(function \(r\) \{ return r\.date !== rec\.date; \}\)/.test(H));
ok('공휴일 없으면 화면이 경고한다', /공휴일을 넣지 않으면/.test(H));
ok('주 12시간 한도 초과를 알린다', /연장근로 주 12시간 한도 초과/.test(H));
ok('달력 값 칸은 읽기전용으로 둔다(두 값이 싸우지 않게)', /달력으로 계산된 값/.test(H));

section('월 이름 읽기 — 실제 시트 이름이 제각각이다');
/* 급여대장 시트 이름은 '3월'·'2026-03'·'23년 7월'·'25.05 늘봄반찬' 등으로 섞여 온다.
   여기서 연·월을 잘못 읽으면 달력이 안 그려지거나 최저임금 연도가 어긋난다. */
const grabFn = (name) => {
  const i = H.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('못 찾음: ' + name);
  let d = 0, st = false;
  for (let j = i; j < H.length; j++) {
    if (H[j] === '{') { d++; st = true; }
    else if (H[j] === '}') { d--; if (st && d === 0) return H.slice(i, j + 1); }
  }
  throw new Error('괄호 안 닫힘: ' + name);
};
const laborYear = () => '2026';
eval(grabFn('laborYearOfMonth'));
eval(grabFn('laborMonthNum'));
eq("'2026-03' → 2026년", laborYearOfMonth('2026-03'), '2026');
eq("'2026-03' → 3월", laborMonthNum('2026-03'), 3);
eq("'3월' → 3월", laborMonthNum('3월'), 3);
eq("'3월' → 연도 없으면 올해", laborYearOfMonth('3월'), '2026');
eq("'23년 7월' → 2023년", laborYearOfMonth('23년 7월'), '2023');
eq("'23년 7월' → 7월", laborMonthNum('23년 7월'), 7);
eq("'25.05 늘봄반찬' → 5월", laborMonthNum('25.05 늘봄반찬'), 5);
eq('월을 못 읽으면 null (달력 대신 합계 입력 안내)', laborMonthNum('놀봄모종'), null);
eq("'25.05 늘봄반찬' → 2025년", laborYearOfMonth('25.05 늘봄반찬'), '2025');
eq("'25.12' → 12월", laborMonthNum('25.12'), 12);
eq('13월 같은 헛값은 안 받는다', laborMonthNum('25.13'), null);
eq("'23년 7월 사계절찬' → 7월", laborMonthNum('23년 7월 사계절찬'), 7);

console.log('\n════════════════════════════════');
console.log('  통과 ' + pass + ' · 실패 ' + fail);
console.log('════════════════════════════════');
process.exit(fail ? 1 : 0);
