/* 홈택스 세금계산서 엑셀 읽기
   (2026-08-10) 김보람 제보: "세금계산서 엑셀 일괄 업로드가 안 됩니다 — 두 경로 모두".
   까닭이 셋이었다.
     ① 홈택스 목록은 머리줄이 «두 줄» 이다(위=묶음 이름, 아래=칸 이름).
        「공급받는자」가 보이는 «첫» 줄을 머리줄로 잡아 묶음 줄을 골랐고,
        그 줄엔 작성일자·상호·공급가액이 없어 칸 번호가 모두 -1 → 모든 줄이 걸러져 0건.
        그런데 화면에는 「✅ 완료: 업체 0개」 만 떴다 — 실패인데 성공처럼 보였다.
     ② 머리줄을 제대로 골라도 「상호」가 두 번(공급자·공급받는자) 나온다.
        앞의 것을 집으면 모든 줄이 «우리 법인 이름» 으로 기록된다.
     ③ 진행·오류 안내를 「업체별 아카이브」 탭 안에만 그려서, 발행관리 탭에서 올리면
        아무것도 안 보였다 — 눌러도 아무 일이 안 일어나는 것처럼 보였다.

   ★ 진짜 엑셀을 만들어 «소스의 파서로» 읽어 본다. 흉내 낸 파서로 시험하면 아무 뜻이 없다. */
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

/* SheetJS 는 앱과 같은 판(0.18.5)을 쓴다 — 있으면 진짜 .xlsx 를 만들어 끝까지 돌려 본다.
   CI 에는 없으므로(런타임에 CDN 으로 받는다) 그때는 «엑셀 날짜 숫자→날짜» 만 대신 세워 둔다.
   이건 SheetJS 의 셈이지 우리 코드가 아니므로 대신 세워도 시험의 뜻이 상하지 않는다. */
let XLSX = null;
try { XLSX = require(path.join(__dirname, '..', '..', 'xlsx.full.min.js')); } catch(e){ }
const SSF_STUB = { parse_date_code:function(n){
  var ms = (n - 25569) * 86400000;             // 1899-12-30 기준 → 유닉스 기준
  var d = new Date(Math.round(ms));
  return { y:d.getUTCFullYear(), m:d.getUTCMonth() + 1, d:d.getUTCDate() };
} };

const ctx = { console:console };
ctx.window = ctx;
vm.createContext(ctx);
const grab = (from, to) => src.slice(src.indexOf(from), src.indexOf(to));
vm.runInContext(grab('function erpInvFillGroup(row){', 'if(typeof window !== \'undefined\'){\n  window.erpInvFillGroup'), ctx);

/* ══ 홈택스 「매출전자세금계산서목록」 의 실제 꼴 ══
   0: 제목 / 1: 빈 줄 / 2: 묶음 머리줄(병합) / 3: 칸 이름 줄 / 4~: 자료 */
const HOMETAX = [
  ['전자세금계산서 합계표 (매출)'],
  ['', '', '', '', '', '', '', '', '', '', '', '', ''],
  ['', '', '', '공급자', '', '', '공급받는자', '', '', '', '', '', ''],
  ['작성일자', '승인번호', '발급일자', '사업자등록번호', '상호', '성명',
   '사업자등록번호', '상호', '성명', '합계금액', '공급가액', '세액', '비고'],
  [45845, '20260709-410', '2026-07-09', '1234567890', '푸른노무법인', '권형하',
   '2098765432', '아우어베이커리', '최건', 181500, 165000, 16500, ''],
  [45846, '20260710-411', '2026-07-10', '1234567890', '푸른노무법인', '권형하',
   '3011122233', '(주)케이아이알', '김대표', 220000, 200000, 20000, '자문료']
];

console.log('\n[① 묶음 머리줄을 오른쪽으로 채운다 (병합된 칸은 맨 앞에만 글자가 있다)]');
t('공급자가 세 칸에 걸친다', ctx.erpInvFillGroup(HOMETAX[2]).slice(3, 6), ['공급자', '공급자', '공급자']);
t('공급받는자도 이어진다', ctx.erpInvFillGroup(HOMETAX[2]).slice(6, 9), ['공급받는자', '공급받는자', '공급받는자']);
t('앞의 빈 칸은 비운다', ctx.erpInvFillGroup(HOMETAX[2]).slice(0, 3), ['', '', '']);
t('빈 줄도 안 터진다', ctx.erpInvFillGroup(null), []);

console.log('\n[② 위아래 두 줄을 이어 「공급받는자 상호」 를 한 칸으로 읽는다]');
const merged = ctx.erpInvMergeHeader(HOMETAX, 3);
t('공급자 상호', merged[4], '공급자 상호');
t('★ 공급받는자 상호 (이것이 고객 이름이다)', merged[7], '공급받는자 상호');
t('묶음이 없는 칸은 그대로', merged[0], '작성일자');
t('첫 줄이면 이을 위 줄이 없다', ctx.erpInvMergeHeader(HOMETAX, 0), ['전자세금계산서 합계표 (매출)']);

console.log('\n[③ 칸 찾기 — 공급받는자 것을 공급자 것보다 «먼저»]');
const cols = ctx.erpInvCols(merged);
t('★ 상호는 공급받는자 것 (앞의 것을 집으면 모든 줄이 우리 법인이 된다)', cols.name, 7);
t('★ 사업자번호도 공급받는자 것', cols.biznum, 6);
t('작성일자', cols.date, 0);
t('공급가액', cols.supply, 10);
t('없는 칸은 -1', ctx.erpInvCols(['작성일자']).supply, -1);
/* 옛 규칙 /상호|공급받는자.*상호/ 는 「상호」가 먼저라 뒤 갈래가 영영 안 쓰였다 */
t('이어 붙이지 않은 줄에서는 앞의 상호를 집을 수밖에 없다 (그래서 ②가 필요하다)',
  ctx.erpInvCols(HOMETAX[3]).name, 4);

console.log('\n[④ 머리줄 고르기 — 낱말이 아니라 «칸이 실제로 잡히는 줄»]');
const pick = ctx.erpInvPickHeader(HOMETAX);
t('★ 묶음 줄(2)이 아니라 칸 이름 줄(3)을 고른다', pick.idx, 3);
t('이어 붙인 쪽을 쓴다', pick.merged, true);
t('고른 줄의 상호 칸이 공급받는자 것이다', pick.cols.name, 7);
/* 머리줄이 한 줄뿐인 파일도 있다 — 그것도 읽어야 한다 */
const ONE_ROW = [
  ['작성일자', '공급받는자 상호', '공급받는자 사업자등록번호', '공급가액'],
  ['2026-07-09', '아우어베이커리', '2098765432', 165000]
];
t('머리줄이 한 줄인 파일도 고른다', ctx.erpInvPickHeader(ONE_ROW).idx, 0);
t('그 경우 상호 칸', ctx.erpInvPickHeader(ONE_ROW).cols.name, 1);
t('머리줄이 없으면 -1', ctx.erpInvPickHeader([['가', '나'], ['1', '2']]).idx, -1);
t('빈 자료도 안 터진다', ctx.erpInvPickHeader(null).idx, -1);

console.log('\n[⑤ 날짜 — 엑셀 숫자·글자 여러 꼴을 읽는다]');
const SSF = XLSX ? XLSX.SSF : SSF_STUB;   // 없으면 대신 세운 것으로
t('「2026-07-09」', ctx.erpInvDateOf('2026-07-09', SSF), '2026-07-09');
t('「2026.7.9」 도 자릿수를 맞춰 준다', ctx.erpInvDateOf('2026.7.9', SSF), '2026-07-09');
t('「2026/07/09」', ctx.erpInvDateOf('2026/07/09', SSF), '2026-07-09');
t('★ 「20260709」 처럼 구분자가 없어도 읽는다', ctx.erpInvDateOf('20260709', SSF), '2026-07-09');
t('날짜가 아니면 빈 값', ctx.erpInvDateOf('없음', SSF), '');
t('빈 값도 안 터진다', ctx.erpInvDateOf(null, SSF), '');
// 엑셀이 날짜를 숫자로 넘겨줄 때 (홈택스 파일의 작성일자 칸이 이 꼴이다)
t('엑셀 날짜 숫자를 날짜로 바꾼다', ctx.erpInvDateOf(45845, SSF), '2025-07-07');
t('숫자 날짜도 YYYY-MM-DD 꼴이다', /^\d{4}-\d{2}-\d{2}$/.test(ctx.erpInvDateOf(45845, SSF)), true);

console.log('\n[⑥ 한 장을 통째로 읽어 본다 — 이것이 대표적인 재현이다]');
const got = ctx.erpInvParseSheet(HOMETAX, SSF);
t('★ 두 줄을 거둔다 (고치기 전에는 0줄이었다)', got.rows.length, 2);
t('★ 고객 이름을 적는다 (우리 법인 이름이 아니다)', got.rows[0].name, '아우어베이커리');
t('두 번째 줄도', got.rows[1].name, '(주)케이아이알');
t('공급가액을 읽는다', got.rows[0].supply, 165000);
t('공급받는자 사업자번호', got.rows[0].biznum, '2098765432');
t('비고도 읽는다', got.rows[1].note, '자문료');
t('잘 읽었으면 까닭을 적지 않는다', got.why, '');

console.log('\n[⑦ 못 읽으면 «왜» 를 말한다 — 조용히 0건이 되지 않게]');
const bad1 = ctx.erpInvParseSheet([['가', '나'], ['1', '2']], SSF);
t('머리줄을 못 찾았다고 말한다', bad1.why.indexOf('머리줄을 못 찾았습니다') === 0, true);
t('그때 거둔 줄은 없다', bad1.rows.length, 0);
const bad2 = ctx.erpInvParseSheet([
  ['작성일자', '공급받는자 상호', '공급가액'],
  ['날짜아님', '아우어베이커리', 1000]
], SSF);
t('머리줄은 찾았지만 못 읽었다고 말한다', bad2.why.indexOf('머리줄은 1째 줄에서 찾았는데') === 0, true);
t('몇 줄이 왜 걸렸는지도 적는다', bad2.why.indexOf('날짜를 못 읽은 줄 1') > 0, true);
t('빈 자료도 안 터진다', ctx.erpInvParseSheet(null, SSF).rows.length, 0);

if(XLSX){
  console.log('\n[⑧ 진짜 엑셀 파일을 만들어 끝까지 돌려 본다]');
  const ws = XLSX.utils.aoa_to_sheet(HOMETAX);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  const buf = XLSX.write(wb, { type:'buffer', bookType:'xlsx' });
  const wb2 = XLSX.read(buf, { type:'array', cellDates:false });
  const rows2 = XLSX.utils.sheet_to_json(wb2.Sheets[wb2.SheetNames[0]], { header:1, defval:'' });
  const out = ctx.erpInvParseSheet(rows2, XLSX.SSF);
  t('★ 실제 .xlsx 를 읽어 두 줄을 거둔다', out.rows.length, 2);
  t('★ 고객 이름이 맞다', out.rows.map(function(r){ return r.name; }), ['아우어베이커리', '(주)케이아이알']);
} else {
  console.log('\n[⑧ 건너뜀 — SheetJS 가 없다 (scratchpad/xlsx.full.min.js)]');
}

console.log('\n[⑨ 화면 — 어느 탭에서 올려도 진행·오류가 보인다]');
/* 전에는 이 안내를 아카이브 탭 안에만 그려서, 발행관리 탭에서 올리면
   진행도 오류도 결과도 아무것도 안 보였다 — 눌러도 반응이 없는 것처럼 보였다. */
t('안내를 탭 밖에 그린다',
  /uploadState\.status !== 'idle' && h\('div', \{ style:\{ marginBottom:'12px'/.test(src), true);
t('탭을 그리기 «전» 에 온다', src.indexOf("uploadState.status !== 'idle' && h('div', { style:{ marginBottom:'12px'")
  < src.indexOf("tab === 'issue' && renderIssue()"), true);
t('아카이브 안의 옛 안내는 걷어냈다',
  /uploadState\.status !== 'idle' && uploadState\.status !== 'done' && h\('div'/.test(src), false);
/* 「pre-line」은 파일 곳곳에 있으므로 «이 안내 상자 안에» 있는지를 본다 */
const BAND = src.slice(src.indexOf("uploadState.status !== 'idle' && h('div', { style:{ marginBottom:'12px'"),
                       src.indexOf("tab === 'issue' && renderIssue()"));
t('안내 상자를 잘라냈다', BAND.length > 300 && BAND.length < 1600, true);
t('줄바꿈이 보이게 한다 (여러 파일 오류를 줄마다 적는다)', /whiteSpace:'pre-line'/.test(BAND), true);
t('오류는 빨강, 완료는 초록', /uploadState\.status==='error' \? '#fef2f2' : uploadState\.status==='done' \? '#f0fdf4'/.test(src), true);

console.log('\n[⑩ 못 읽은 파일을 조용히 건너뛰지 않는다]');
t('못 읽은 파일을 모은다', /bad\.push\(file\.name \+ ' — ' \+ \(got\.why \|\| '읽을 줄이 없습니다'\)\)/.test(src), true);
t('★ 한 줄도 못 읽었으면 실패로 알린다 (전에는 「✅ 완료: 0개」 였다)',
  /if\(!allRows\.length\)\{\s*\n\s*setUploadState\(\{ status:'error'/.test(src), true);
t('무엇을 확인해야 하는지도 적는다', /홈택스 ▸ 조회\/발급 ▸ 전자세금계산서 ▸ 목록조회/.test(src), true);
// 표시는 ⚠·❌ 중 무엇이든 좋다 — 「못 읽은 파일을 성공 옆에 함께 적는가」만 지킨다
t('일부만 못 읽었으면 성공 옆에 함께 적는다', /bad\.length \? \('\\n.{0,3}못 읽은 파일 '\+bad\.length/.test(src), true);
t('장이 여럿이면 가장 많이 읽히는 장을 쓴다', /if\(res\.rows\.length > got\.rows\.length\) got = res;/.test(src), true);

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===\n');
process.exit(fail ? 1 : 0);
