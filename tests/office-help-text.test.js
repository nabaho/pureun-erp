/* 사무관리 안내문 정리 — 지운 문구는 사라졌고, 남기기로 한 문구는 그대로인지 점검
   (대표 승인분: 중복 설명 삭제 · 괄호 설명 떼기 · 필터 배너/반복 문구 공용화) */
const fs = require('fs');
const path = require('path');
// 인자를 안 주면 저장소의 대상 파일을 본다 (node tests/office-help-text.test.js 로 바로 실행)
const TARGET = process.argv[2] || path.join(__dirname, '..', 'pu-erp.html');
const html = fs.readFileSync(TARGET, 'utf8');

let pass = 0, fail = 0;
function ok(n, c, e) { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; console.log('  FAIL ' + n + (e ? ' — ' + e : '')); } }
function count(s) { return html.split(s).length - 1; }
function gone(label, s) { ok(label + ' — 지워졌다: "' + s + '"', count(s) === 0, '아직 ' + count(s) + '곳 남아 있다'); }
function kept(label, s) { ok(label + ' — 그대로 있다: "' + s + '"', count(s) >= 1, '사라졌다'); }

/* ── ① 삭제 (승인분) ── */
gone('①-1 의뢰인 유형 제목 괄호', '버튼에 마우스를 올리면 설명');
kept('①-1 제목 본문은 남는다', '⚖️ 의뢰인 유형 — 먼저 선택하세요');
gone('①-2 기업정보 탭 의뢰인 안내 밴드', '· 회사가 의뢰인 (자문/컨설팅 일반 케이스)');
gone('①-2 기업정보 탭 의뢰인 안내 밴드(근로자)', '· 근로자가 의뢰인 (해고·체불·산재 등 노동 사건). 회사 정보는 피신청인/사용자로 자동 처리');
gone('①-2 기업정보 탭 의뢰인 안내 밴드(둘 다)', '· 회사 + 근로자 동시 등록 (특수 케이스)');
kept('①-2 ctDesc 밴드는 그대로 (설명 원본 한 곳)',
     '🏢 회사가 의뢰인 — 회사정보(회사명·대표자·사업자번호)를 입력합니다. 예) 취업규칙·자문·컨설팅·인사노무 일반');
gone('①-3 컨설팅/기금/기타 관리번호 꼬리말 span',
     "h('span', { style:{ fontSize:'10.5px', color:'#94a3b8', marginLeft:'8px', fontFamily:'inherit', fontWeight:400 } }, '(유형 변경 시 자동 갱신)')");
kept('①-3 관리번호 라벨은 그대로', '유형 (변경 시 관리번호 자동 갱신)');
/* 사건관리 쪽 같은 꼬리말(색이 #60a5fa)은 승인 범위가 아니라 그대로 둔다 */
ok('①-3 남은 (유형 변경 시 자동 갱신) 은 사건관리 1곳뿐',
   count('(유형 변경 시 자동 갱신)') === 1, count('(유형 변경 시 자동 갱신)') + '곳');
gone('①-4 칸반 단계 헤더 title(단독보기)', '클릭하면 3컬럼 보기로 돌아갑니다');
gone('①-4 칸반 단계 헤더 title(3컬럼)', '클릭하면 이 단계만 단독으로 봅니다');
kept('①-4 헤더 라벨은 그대로', "isFocused ? '◱ 전체보기' : '⛶ 단독'");
gone('①-5 업체 상세 공유 배지',
     "h('span', { style:{ fontSize:'10px', color:'#1e40af', background:'#dbeafe', padding:'2px 8px', borderRadius:'10px', fontWeight:600 } }, '공유')");
kept('①-5 공유 배지 위 제목은 그대로', '🔄 회사정보 (계약관리 동기화)');

/* ── ② 괄호만 떼기 (승인분) ── */
gone('②-6 난이도 헤더 괄호', '난이도: 1 쉬움 ~ 5 어려움 (셀 더블클릭으로 입력)');
ok('②-6 난이도 헤더 본문은 모바일·PC 두 곳 그대로',
   count("'data-tip':'난이도: 1 쉬움 ~ 5 어려움'") === 2, count("'data-tip':'난이도: 1 쉬움 ~ 5 어려움'") + '곳');
gone('②-7 특이사항 tipTitle 괄호', "co.note + '\\n(더블클릭으로 편집)'");
ok('②-7 빈 비고 기본 안내는 남는다 (두 곳)',
   count("{ tipTitle: (co.note ? co.note : '더블클릭으로 편집') }") === 2);
kept('②-7 renderCell 기본 툴팁은 손대지 않았다', "title: options.tipTitle || '더블클릭으로 편집',");
gone('②-8 담당자 안내 괄호', '(사용자 추가/이름 변경 시 자동 반영)');
kept('②-8 환경설정 경로 안내는 그대로', '💡 환경설정 → 인사관리기준 → 사용자 관리에 등록된 ');
gone('②-9 동일인 동기화 꼬리말', '해제하려면 위 체크박스 해제.');
kept('②-9 동일인 동기화 본문은 그대로', '🔒 회사정보(대표자/연락처)와 동기화 중 - 회사정보 수정 시 자동 반영.');
gone('②-10 기업정보함 자동연동 괄호', '자동연동 안 됨(퇴사·승진 시 아래 버튼으로 직접 갱신)');
kept('②-10 기업정보함 자동연동 본문은 그대로', ' 가져옴 · 자동연동 안 됨');
gone('②-11 계약번호 연도 select title 앞부분', '년도 선택 (클릭하여 펼침). ');
kept('②-11 연도 select title 뒷부분은 그대로', "title:'선택하면 그 연도의 다음 번호가 자동 입력됩니다',");
gone('②-12 근로자 없음 안내 옛 문구', '의뢰인이 근로자인 경우 [+ 근로자 추가] 클릭 (부당해고·체불 등)');
kept('②-12 근로자 없음 안내 새 문구', "'+ 근로자 추가를 눌러 추가'");
gone('②-13 회사명 입력칸 placeholder 옛 문구', '회사명 입력 또는 엑셀 행 붙여넣기 (탭 구분 자동 분리)');
kept('②-13 회사명 입력칸 placeholder 새 문구', "placeholder:'회사명 또는 엑셀 한 행 붙여넣기',");
gone('②-14 근로자 이름칸 placeholder 괄호', '이름 * (엑셀 행 붙여넣기 시 자동 분리)');
kept('②-14 근로자 이름칸 placeholder 본문', "placeholder:'이름 *',");
gone('②-15 계약번호 수동입력 버튼 title', '과거 데이터 입력 시 계약번호를 직접 지정할 수 있습니다');
kept('②-15 화면 경고는 그대로 남는다', '⚠️ 과거 데이터 입력 시에만 사용');

/* ── ③-1 필터 경고 배너 공용화 ── */
ok('③-1 FilterWarnBanner 가 한 번 정의돼 있다',
   count('function FilterWarnBanner(props){') === 1);
ok('③-1 FilterWarnBanner 를 정확히 3곳에서 쓴다',
   count('h(FilterWarnBanner,') === 3, count('h(FilterWarnBanner,') + '곳');
ok('③-1 배너 문구는 한 곳에만 있다',
   count('⚠️ 필터 적용 중 — ') === 1, count('⚠️ 필터 적용 중 — ') + '곳');
gone('③-1 "· 전체 N건 중 M건 표시" 줄', '· 전체 ');
gone('③-1 필터 해제 버튼 title', '모든 필터를 해제하고 전체를 표시합니다');
ok('③-1 필터 해제 버튼 라벨은 한 곳에 남는다',
   count('✕ 필터 해제 (전체 보기)') === 1);
/* 세 호출부가 각자의 숨김 건수 계산식을 그대로 쓴다 */
ok('③-1 계약관리 호출부는 자기 계산식(hidden)을 쓴다',
   /h\(FilterWarnBanner, \{ hidden: hidden, filters: af,/.test(html));
ok('③-1 사건관리 호출부는 자기 계산식(_scopedCount - filtered.length)을 쓴다',
   html.indexOf("h(FilterWarnBanner, { hidden: _scopedCount - filtered.length, filters: _activeFilters, onReset: _resetCaseFilters })") > 0);
ok('③-1 컨설팅/기금/기타 호출부는 자기 계산식을 쓴다',
   html.indexOf("h(FilterWarnBanner, { hidden: _scopedCount - filtered.length, filters: _activeFilters, onReset: resetProjView })") > 0);

/* ── ③-2 공용 문구 상수 ── */
/* [문구, 상수명, 원문이 파일에 남아도 되는 개수(정의 1곳 + 승인 범위 밖), 바꿔 끼운 호출부 개수] */
const CONSTS = [
  ['업체명과 다르게 입금될 때만 입력 (예: 모회사·협회·대표자 개인)', 'PAYER_PH', 1, 3],
  ['이번 달 신규만 표시', 'MONTH_ONLY_TIP', 1, 4],
  ['+ 부담당 추가...', 'SUBMGR_ADD_OPT', 1, 4],
  [' - 재배정 필요)', 'REASSIGN_SUFFIX', 1, 4],
  // 주소 문구는 환경설정(회사정보)·인사관리(근로자명부)에도 있는데 그쪽은 승인 범위가 아니라 그대로 둔다
  ['⚠️ 주소 정보 없음', 'ADDR_NONE_MSG', 3, 4],
  ['✓ 주소 입력됨: ', 'ADDR_OK_MSG', 2, 4],
  ['첫 화면 기본값으로 (상태·유형·담당·정렬·검색 초기화)', 'RESET_VIEW_TIP', 1, 2],
  ['같은 이름으로 따로 등록된 업체를 한 쌍씩 확인하고 합칩니다', 'CO_MERGE_TIP', 1, 2],
  ['합치면서 사무대행 표시가 딸려오지 않은 업체를 사무대행 탭에 되살립니다', 'CO_SUBOFFICE_FIX_TIP', 1, 2],
  ['이름으로만 이어진 계약·사건·컨설팅·기금·기타에 업체 ID를 붙입니다', 'CO_LINK_TIP', 1, 2],
  ['월 자문료를 모두 부가세 포함으로 지정합니다 (미확정은 금액 변화 없음)', 'CO_VAT_ALL_TIP', 1, 2]
];
CONSTS.forEach(function (row) {
  const lit = row[0], name = row[1], litLeft = row[2], uses = row[3];
  const def = "var " + name + " = '" + lit + "';";
  ok('③-2 ' + name + ' 이 한 번만 정의돼 있다', count(def) === 1, def);
  ok('③-2 ' + name + ' 원문이 ' + litLeft + '곳뿐이다 (정의 1곳 + 승인 범위 밖)',
     count(lit) === litLeft, count(lit) + '곳');
  ok('③-2 ' + name + ' 을 ' + uses + '곳에서 갖다 쓴다 (정의 1곳 + 호출부 ' + uses + '곳)',
     count(name) === uses + 1, count(name) + '곳');
});

/* ── 손대지 말라고 한 문구 (안전·업무 문구) ── */
kept('보존 동일사업장 중복계약 안내', '— 아래는 이미 저장된 계약입니다');
kept('보존 청구 중단 체크 설명', '체크 시 청구·세금계산서 발행 중단 상태로 표시됩니다');
kept('보존 사업자번호 자동 반영 안내', '※ 이 정보는 변경 시 같은 사업자번호의 모든 계약에 자동 반영됩니다.');
kept('보존 계약고유 필드 안내', '계약별 고유 필드 - 업체관리에서 변경해도 계약관리에 동기화 안 됨');
kept('보존 사건 삭제 입금 경고', '이 사건에 연동된 입금 ');
kept('보존 사건 삭제 입금 경고(뒷줄)', '매출에서 빼려면 입금관리에서 별도로 삭제하세요.');
kept('보존 계약번호 수동입력 화면 경고', '⚠️ 과거 데이터 입력 시에만 사용');

/* ── 의뢰인 유형 설명이 화면 밴드 한 곳뿐인지 ──
   '회사가 의뢰인' 은 파일 전체에 3곳:
     1) ctDesc 설명 밴드 (화면에 보이는 설명 — 이 한 곳만 설명이다)
     2) ctBar 버튼 title 툴팁 안('【회사가 의뢰인일 때】')
     3) 사건관리 의뢰인 유형 select 의 option 라벨('🏢 회사가 의뢰인')  ← 고르는 항목, 설명 아님
   그래서 '설명 밴드' 는 em dash 를 붙인 '회사가 의뢰인 —' 개수로 센다. */
ok('의뢰인 유형 설명 밴드는 정확히 1곳', count('회사가 의뢰인 —') === 1, count('회사가 의뢰인 —') + '곳');
ok('회사가 의뢰인 전체 3곳 (설명 1 + 툴팁 1 + 드롭다운 항목 1)',
   count('회사가 의뢰인') === 3, count('회사가 의뢰인') + '곳');
ok('툴팁 쪽은 그대로 남아 있다', count('【회사가 의뢰인일 때】') === 1);
ok('사건관리 드롭다운 항목은 그대로 남아 있다',
   count("h('option', { value:'company' }, '🏢 회사가 의뢰인')") === 1);

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===');
process.exit(fail ? 1 : 0);
