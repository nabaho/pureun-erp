/* 푸른통합시스템 — 서류 판독 층
   사진 한 장이 명함인지 사업자등록증인지 중소기업확인서인지 가리고, 항목을 읽어 내고,
   사업자등록번호가 맞는지 기계로 검증하는 유일한 파일이다.
   사진첩·명함첩·푸른이알피가 모두 이 파일을 쓴다 — 판독 방식(모델·프롬프트)이
   바뀌어도 앱은 손대지 않는다. (저장 층 pu-photo-store.js 와 같은 원리)

   이 층은 읽고·검증하고·앱별 이름으로 바꾸기만 한다. **저장하지 않는다.**
   저장은 부르는 쪽 책임이다 — 그래서 이 파일이 실데이터를 망칠 경로가 없다.

   fetch·키 읽기는 주입받는다. 노드에서 가짜로 갈아끼워 검사할 수 있어야 하고,
   앱마다 키를 얻는 방법이 다르기 때문이다(명함첩 공유 키 / 포털 공용 설정 / 이 기기). */
(function (global) {
  'use strict';

  /* ── 주입받는 것 ── */
  var deps = {
    fetch: null,       // (url, init) => Promise<{ok,status,json()}>
    getKey: null,      // () => Promise<string>  AI 키 (옛 길 — 서버 대리인이 없을 때만)
    getNtsKey: null,   // () => Promise<string>  국세청 키(없으면 조회를 건너뛴다)
    delay: null,       // (fn, ms) — 검사에서 기다림 없이 진행시키려고 주입받는다
    /* 서버 대리인 (2026-08-17) — 있으면 **브라우저는 열쇠를 모른다.**
         readDocUrl : 판독 대리인 주소
         getToken   : () => Promise<string>  로그인 증명(누가 부르는지 서버가 확인한다) */
    readDocUrl: null,
    getToken: null
  };

  function init(o) {
    o = o || {};
    deps.fetch = o.fetch || (typeof global.fetch === 'function' ? global.fetch.bind(global) : null);
    deps.getKey = o.getKey || null;
    deps.getNtsKey = o.getNtsKey || null;
    deps.delay = o.delay || function (fn, ms) { setTimeout(fn, ms); };
    deps.readDocUrl = o.readDocUrl || null;
    deps.getToken = o.getToken || null;
    return true;
  }

  /* 서버 대리인을 쓸 수 있나 — 주소와 로그인 증명이 둘 다 있어야 한다.
     ⚠ 하나만 있으면 안 쓴다. 토큰 없이 부르면 서버가 401 로 막아
       「판독이 안 된다」로만 보이고 원인을 못 짚는다. */
  function useProxy() {
    return !!(deps.readDocUrl && deps.getToken);
  }

  /* ── 사업자등록번호 ── */

  function bizNoDigits(v) { return String(v == null ? '' : v).replace(/\D/g, ''); }

  /* 국세청 사업자등록번호 체크섬.
     AI가 한 자리 잘못 읽으면 여기서 걸린다 — '검증 통과하면 자동 입력'의 근거가 이 함수다.
     잘못 읽은 번호가 그대로 저장되면 4대보험 신고서·계약서로 흘러가 되돌리기 어렵다.
     (푸른이알피에 있던 같은 계산식을 여기로 모았다) */
  function bizNoValid(v) {
    var d = bizNoDigits(v);
    if (!/^\d{10}$/.test(d)) return false;
    var w = [1, 3, 7, 1, 3, 7, 1, 3, 5], s = 0;
    for (var i = 0; i < 9; i++) s += parseInt(d[i], 10) * w[i];
    s += Math.floor(parseInt(d[8], 10) * 5 / 10);
    return (10 - (s % 10)) % 10 === parseInt(d[9], 10);
  }

  function fmtBizNo(v) {
    var d = bizNoDigits(v);
    return d.length === 10 ? d.slice(0, 3) + '-' + d.slice(3, 5) + '-' + d.slice(5) : d;
  }

  /* ── 앱별 필드 이름 변환표 ──
     같은 사업자등록번호를 앱마다 다른 이름으로 부른다:
       명함첩 bizno · 푸른이알피 bizNo · 기금관리 biz_no
     이 표를 앱이 각자 들고 있으면 한 곳만 고쳐도 조용히 안 붙는다. 여기 한 곳에 둔다.
     왼쪽 = 판독 결과 이름, 오른쪽 = 그 앱의 필드 이름. */
  var MAP = {
    cards: {
      card: { name: 'name', company: 'company', dept: 'dept', title: 'title',
              mobile: 'mobile', tel: 'tel', fax: 'fax', email: 'email',
              companyTel: 'companyTel', companyFax: 'companyFax', companyAddr: 'companyAddr',
              website: 'website', address: 'address', memo: 'memo' },
      bizreg: { company: 'company', ceo: 'ceo', bizno: 'bizno', corpno: 'corpno',
                openDate: 'openDate', bizType: 'bizType', bizItem: 'bizItem',
                companyTel: 'companyTel', companyFax: 'companyFax', address: 'address', memo: 'memo' }
    },
    erp: {
      bizreg: { company: 'name', ceo: 'ceo', bizno: 'bizNo', corpno: 'corpNo',
                openDate: 'openDate', bizType: 'bizType', bizItem: 'bizCategory',
                companyTel: 'phone', companyFax: 'fax', address: 'address', memo: 'note' },
      /* 유효기간을 함께 넘긴다 — 만료된 확인서로 신청하면 반려된다.
         이 칸이 없으면 언제 만료되는지 아무도 알 수 없다(읽어도 버리는 셈). */
      sme: { company: 'name', bizno: 'bizNo', ceo: 'ceo', smeType: 'companySize',
             industry: 'industry', expiry: 'smeExpiry', issueNo: 'smeIssueNo',
             issueDate: 'smeIssueDate' }
    },
    fund: {
      bizreg: { company: 'name', ceo: 'ceo', bizno: 'biz_no', corpno: 'corp_no',
                bizType: 'biz_type', address: 'address', memo: 'note' },
      sme: { company: 'name', bizno: 'biz_no', ceo: 'ceo', smeType: 'company_size' }
    }
  };

  /* 명함첩 레코드는 종류를 kind 로 구분한다(card / biz). 다른 앱은 종류 칸이 없다. */
  var CARDS_KIND = { card: 'card', bizreg: 'biz' };

  /* 사업자등록번호에 해당하는 이름들 — 담을 때 보기 좋은 꼴로 바꿔 넣는다. */
  var BIZNO_KEYS = { bizno: 1, bizNo: 1, biz_no: 1 };

  /* 판독 결과를 그 앱의 필드 이름으로 바꾼다.
     **빈 값은 아예 싣지 않는다** — 빈 값을 실어 보내면 기존에 들어 있던 대표자·주소를
     빈 값으로 덮어써 버린다(자동 입력에서 가장 위험한 사고). */
  function mapTo(target, kind, fields) {
    var table = MAP[target] && MAP[target][kind];
    if (!table) return {};
    var src = fields || {};
    var out = {};
    for (var from in table) {
      if (!Object.prototype.hasOwnProperty.call(table, from)) continue;
      var v = src[from];
      if (v === undefined || v === null || String(v).trim() === '') continue;
      var to = table[from];
      out[to] = BIZNO_KEYS[to] ? fmtBizNo(v) : v;
    }
    if (target === 'cards' && CARDS_KIND[kind]) out.kind = CARDS_KIND[kind];
    return out;
  }

  /* ── 판독 프롬프트 ──
     종류 판정과 항목 판독을 **한 번의 호출로** 한다. 따로 부르면 사진을 두 번 올려
     시간·비용이 두 배가 되고, 판정과 판독이 서로 다른 판단을 할 수 있다.
     명함·사업자등록증 키 목록은 명함첩이 쓰던 문장을 그대로 가져왔다 —
     이미 현장에서 검증된 프롬프트를 새로 쓰지 않는다. */
  var PROMPT_ALL =
    '이 이미지가 어떤 서류인지 가리고 정보를 추출해 JSON으로만 답하세요.' +
    '\nkind 는 다음 중 하나입니다: card(명함), bizreg(사업자등록증), sme(중소기업확인서 또는 중견기업확인서), payslip(급여 관련 서류 — 급여명세서·임금대장·급여이체내역·４대보험 산정보수 등 사람의 임금 금액이 적힌 것), meeting(회의·현장 사진 — 사람들이 모여 있거나 사업장·작업 현장 모습), contract(계약서 — 자문계약서·위임계약서·용역계약서·수임약정서 등 우리 사무소와 업체가 맺은 약정 문서), chat(대화 캡처 — 카카오톡·문자·메일 화면을 찍거나 캡처한 것. 말풍선이나 메일 본문이 보이면 대화입니다), timesheet(근태·휴무표 — 근무일·유급일·휴무일 날짜를 사람별로 적은 것. 손글씨 메모라도 사람 이름과 날짜 목록이 줄줄이 있으면 이것입니다. **임금 금액이 적혀 있으면 timesheet 이 아니라 payslip 입니다**), form(서식 — 신청서·확인서·공문·조사표처럼 칸 이름과 값이 표로 짜인 문서인데 위 종류 어디에도 안 드는 것), other(위 아홉이 아님).' +
    /* 대화가 급여 얘기를 담고 있어도 대화다(대표 지시 2026-08-12) — 캡처 하나가
       「급여대장」으로 분류돼 급여서류 경고까지 뜬 실사례에서 나온 규칙이다.
       서류는 서류 자체를 찍은 것이고, 대화는 서류에 **대해 말한** 것이다. */
    '\n⚠ 대화 캡처가 급여·계약 이야기를 담고 있어도 kind=chat 입니다. 서류 자체를 찍은 것만 payslip·contract 입니다.' +
    '\nkind=card 이면 키: name(이름), company(회사명), dept(부서), title(직책), mobile(휴대폰), tel(직통전화), fax(개인팩스), email(이메일), companyTel(회사 대표번호), companyFax(회사 팩스), companyAddr(회사 주소), website(홈페이지), address(개인 주소), memo(기타 정보), pairs(명함에 적힌 모든 줄 — 아래 규칙).' +
    '\nkind=bizreg 이면 키: docName(문서 제목 그대로 — 아래 【제목】 규칙), company(상호/법인명), ceo(대표자), bizno(사업자등록번호), corpno(법인등록번호), openDate(개업연월일), bizType(업태), bizItem(종목), companyTel(대표번호), companyFax(팩스), address(사업장 소재지), memo(기타), pairs(문서의 모든 칸 — 아래 규칙).' +
    '\nkind=sme 이면 키: docName(문서 제목 그대로 — 아래 【제목】 규칙), company(상호/법인명), bizno(사업자등록번호), ceo(대표자), smeType(기업규모 — 소기업/중기업/중견기업 등), issueNo(발급번호), issueDate(발급일), expiry(유효기간 만료일), industry(주업종), pairs(문서의 모든 칸 — 아래 규칙).' +
    /* 급여서류는 **금액을 읽지 않는다.** 어느 회사·언제 것인지만 담는다.
       임금 금액은 사람마다 다른 민감정보인데, 사진첩은 그것을 어디에도 쓰지 않으므로
       읽어 둘 이유가 없다. 읽어서 담으면 클라우드에 한 벌 더 쌓이는 위험만 는다. */
    '\nkind=payslip 이면 키: company(사업장·회사명), period(귀속 연월 — 2026-04 형식), docName(서류 이름 그대로 — 예 급여명세서·임금대장), memo(무엇에 쓰는 서류인지 한 줄). **금액과 사람 이름은 담지 마세요.**' +
    '\nkind=meeting 이면 키: memo(무엇을 하는 장면인지 한 줄), company(현장 간판·표지에 회사명이 보이면 그 이름, 없으면 빈 문자열).' +
    /* 계약서는 **금액도 담는다**(대표 지시 2026-08-10). 급여서류와 다르다 —
       급여는 사람마다 다른 임금이라 안 담지만, 계약 보수는 우리 사무소의
       수임 조건이라 나중에 찾아볼 일이 실제로 있다. */
    /* 위임사무·부가세·상대 연락처(대표 지시 2026-08-13): "위임사무 등도 읽어야
       되고 보수도 부가세 포함인지 별도인지도 읽어야 한다. 대표자·주소·연락처·
       사업체도 읽어야 추후 계약관리에 연동할 수 있다."
       ⚠ 실제 오독: 서명란의 **우리 쪽(을)** 을 상대로 담았다 — 푸른노무법인/권형하가
         상호·대표자 칸에 들어왔다. 상대는 언제나 갑(맡긴 쪽)이다. */
    '\nkind=contract 이면 키: company(상대 업체 상호), ceo(상대 업체 대표자), address(상대 업체 주소), companyTel(상대 업체 연락처), bizno(상대 사업자등록번호 — 적혀 있으면), docName(계약서 이름 그대로 — 예 자문계약서·위임계약서), scope(위임사무·업무 범위 — 제1조 등에 적힌 맡은 일을 그대로, 예 인사노무진단(RBA 점검)), signDate(계약 체결일 — 2026-08-10 형식), startDate(계약 시작일), endDate(계약 종료일 — 없으면 빈 문자열), term(계약 기간을 적은 그대로 — 예 1년, 자동연장), fee(보수·자문료·용역비 — 적힌 그대로), vat(부가세 — 별도/포함 중 적힌 그대로, 표기가 없으면 빈 문자열), retainer(착수금), success(성공보수 — 예 승소시 청구액의 10%), deposit(계약금), memo(위에 안 담긴 특약이나 눈여겨볼 조건 한 줄), pairs(계약서의 모든 조항·칸 — 아래 규칙). **없는 항목은 빈 문자열로 두고 지어내지 마세요.**' +
    '\n⚠ 계약서에 우리 사무소(푸른노무법인·권형하)와 상대 업체가 함께 적혀 있으면 company·ceo·address·companyTel 에는 **상대 업체(갑) 쪽**을 담으세요. 푸른노무법인 쪽 정보를 담으면 안 됩니다.' +
    /* 대화 캡처(대표 지시 2026-08-12): "대화 내용 요약하고 정리할 수 있게.
       상대방이 입력한 부분 우선 정리해서 기록하고 업무 수행할 수 있게."
       금액·주민번호는 담지 않는다 — 급여서류에서 금액을 안 읽는 것과 같은 이유다. */
    '\nkind=chat 이면 키: company(상대방 회사·사업장 이름 — 대화방 제목이나 말풍선 옆 이름에서), name(상대방 이름·직함 — 예 임대순 대표), channel(카톡·문자·메일 중 무엇인지), chatDate(대화 날짜가 보이면 2026-08-12 형식), summary(대화 전체를 두 문장 이내로 요약), todos(할 일 목록 — 아래 규칙).' +
    '\ntodos 규칙: [{"t":"할 일 한 줄","done":true/false,"ours":true/false}] 배열입니다.' +
    ' **상대방이 보낸 요청·전달사항을 먼저** 담고(ours=false), 우리 쪽이 하기로 약속한 일을 다음에 담으세요(ours=true).' +
    ' 대화 안에서 이미 처리된 것으로 보이면(예: "송부 드렸습니다") done=true.' +
    ' 인사말·잡담은 담지 말고, **급여 금액과 주민등록번호는 t 에 적지 마세요.**' +
    /* 근태·휴무표(대표 지시 2026-08-13): "한글 부분 자동 엑셀로 정리. OCR 정밀하게."
       손글씨라 틀릴 수 있다 — 그래서 **지어내지 않는 것**이 정확한 것보다 먼저다.
       사람이 원본과 나란히 놓고 확인하는 화면이 뒤에 있으므로, 못 읽은 것은
       못 읽었다고 남기는 쪽이 훨씬 낫다. */
    '\nkind=timesheet 이면 키: company(사업장·가게 이름), period(귀속 월 — 예 5월), docName(제목 그대로), rows(사람별 줄 — 아래 규칙).' +
    '\nrows 규칙: [{"name":"이름","paid":[1,5,25],"off":[11,19,28],"adj":"+4일","note":"정상"}] 배열입니다.' +
    ' paid 는 유급 날짜, off 는 휴무 날짜 — **숫자 배열**(1~31)로. adj 는 가감 표기 그대로(+4일, -3일, 정상 등), note 는 그 밖의 표기.' +
    ' 「정상근무」만 적힌 사람은 paid·off 를 빈 배열로 두고 note 에 정상근무.' +
    ' **흐려서 읽을 수 없는 숫자는 지어내지 말고 건너뛰세요** — 그리고 그 줄 note 에 "일부 판독 불확실" 을 덧붙이세요.' +
    ' 임금 금액은 담지 마세요.' +
    /* 일반 서식(대표 지시 2026-08-13): "캡처되거나 PDF로 들어온 서식들 글자를
       선명하게 읽고 정리하고 싶다. 문서들을 인식하는 거다."
       아는 종류가 아니면 아무것도 안 읽고 버리던 것이 원인이었다(실사례:
       정부지원 신청서가 「서류로 보이지 않음」). 아는 칸은 이름 붙은 키로,
       나머지는 **모든 칸을 이름:값 쌍으로** 담아 하나도 버리지 않는다. */
    '\nkind=form 이면 키: docName(서식 제목 그대로), company(업체·기관명), ceo(대표자), bizno(사업자등록번호), address(주소), companyTel(전화번호), companyFax(팩스번호), name(담당자 이름), title(담당자 직위), mobile(담당자 휴대폰), email(이메일), pairs(문서의 **모든** 칸 — 아래 규칙).' +
    /* 문서 차례 그대로(대표 지시 2026-08-13): "데이터를 읽을 때 맨 위에서부터
       순서대로 읽었으면 좋겠다. 데이터 순서가 바뀐다. 모든 데이터들 순서가 같다."
       ⚠ 예전에는 "위 키에 이미 담은 칸은 다시 담지 마세요" 였다. 그래서 화면이
         아는 칸(코드에 박아 둔 고정 차례)을 먼저 다 그리고 나머지를 뒤에 붙여,
         원본에서는 「업체명 → 업종 → 사업자등록번호」인데 화면에서는 업종이 한참
         아래로 밀렸다. 사람이 원본과 한 줄씩 대조할 수가 없었다.
       ⚠ 그래서 **일부러 두 번 담는다.** 이름 붙은 키는 명함첩·업체관리로 넘길 때
         쓰고(그게 없으면 자동 등록이 멈춘다), pairs 는 사람이 눈으로 볼 차례다.
       ⚠ k 는 **문서에 적힌 이름 그대로**여야 한다 — 우리 이름(「상호」)으로 바꿔
         적으면 원본에 없는 낱말이라 짚어 갈 수가 없다. */
    '\npairs 규칙(kind=card·bizreg·sme·contract·form 에 모두 해당): [{"k":"칸 이름 그대로","v":"값 그대로"}] 배열입니다.' +
    ' 문서에 적힌 **모든 칸을 맨 위에서부터 아래 차례대로** 담으세요.' +
    ' **위 키에 담은 칸도 빠짐없이 다시 담으세요** — 화면이 이 차례 그대로 원본과 나란히 놓고 대조합니다.' +
    ' k 는 **문서에 적힌 이름 그대로** 쓰세요(예: "업체명", "휴대폰번호" — "상호"·"휴대폰"으로 바꾸지 마세요).' +
    ' 빈 칸은 건너뛰세요. 체크 표시 칸은 v 에 선택된 것을 적으세요(예: "있음 (푸른 노무법인 / 권형하)").' +
    ' 급여서류(payslip)·근태표(timesheet)·대화(chat)·회의사진(meeting)에는 pairs 를 담지 마세요.' +
    /* 처음 보는 서류도 **제목만은 남긴다**(대표 지시 2026-08-15) — 갈래를 못 가려도
       제목이 남으면 나중에 찾을 수 있고, 화면이 제목별로 묶어 새 서식을 알아볼 수 있다.
       예전에는 kind 만 담으라고 해서, 못 가린 서류는 아무 실마리도 없이 쌓였다. */
    '\nkind=other 이면 kind 와 docName(문서 제목이 보이면 그대로 — 아래 【제목】 규칙. 서류가 아니어서 제목이 없으면 빈 문자열) 만 담으세요.' +
    /* 한글 우선(2026-08-07 대표 지시) — 명함은 같은 내용을 한글·영문으로 나란히
       적어 두는 일이 많다. 그때 영문을 담으면 **명함첩·업체관리에서 한글로 찾는
       사람이 못 찾고**, 같은 회사가 두 벌로 쌓인다. 그래서 읽을 수 있으면 한글이다.
       ⚠ 이메일·홈페이지까지 한글로 바꾸라는 말이 아니다 — 그건 원래 영문이다.
       ⚠ 없는 한글을 지어내지 말 것 — 영문 이름을 한글로 옮겨 적으면 실제와 다른
          회사명이 만들어져 업체관리에 잘못 들어간다. */
    /* 【제목】 규칙(대표 지시 2026-08-15) — "사업자등록증명 도 제목을 정확하게
       인지하게해라. 모든 서식에 제목을 찾고 제목에 따라 정렬하는 프로세스로 만들어라."
       ⚠ 실사례: 국세청 「사업자등록증명」(증명원)을 올렸더니 그냥 「사업자등록증」으로
         읽혔다. 둘은 다른 서류인데 갈래 이름만 보여 구분할 길이 없었다.
       ⚠ 갈래(kind)는 일부러 안 나눈다 — 증명원에도 상호·대표자·사업자번호가 똑같이
         들어 있어 업체관리·명함첩으로 가는 길은 그대로여야 한다. 가르는 것은 **제목**이다.
       ⚠ 그래서 「비슷한 이름으로 고쳐 적는 것」을 막는 것이 이 규칙의 전부다.
         모델이 아는 이름(사업자등록증)으로 끌어당기면 이 기능이 통째로 무의미해진다. */
    '\n【제목】 docName 에는 **문서 맨 위에 적힌 제목을 글자 그대로** 옮기세요.' +
    ' 줄여 쓰거나, 늘려 쓰거나, 더 익숙한 이름으로 바꾸지 마세요.' +
    ' 예: 「사업자등록증명」은 「사업자등록증」이 아닙니다 — 적힌 그대로 사업자등록증명 입니다.' +
    ' 「중견기업확인서」를 「중소기업확인서」로 바꾸지 마세요.' +
    ' 제목 옆·아래에 괄호로 딸린 말(예: (법인사업자))은 docName 에 넣지 말고 pairs 에만 담으세요.' +
    ' 제목이 여러 줄로 나뉘어 적혀 있으면 한 줄로 이어 붙이고, 글자 사이 띄어쓰기는 정리하세요' +
    '(예: "사 업 자 등 록 증 명" → 사업자등록증명).' +
    ' 문서에 제목이 안 보이면 지어내지 말고 빈 문자열로 두세요.' +
    '\n【한글 우선】 한글과 영문이 함께 적힌 명함·서류는 **한글 표기를 담으세요.**' +
    ' 이름·회사명·부서·직책·주소가 두 언어로 나란히 있으면 한글 쪽을 고릅니다' +
    '(예: "Pureun Labor Law Firm / 푸른노무법인" → 푸른노무법인,' +
    ' "16, Jeongjail-ro, Seocho-gu / 서울 서초구 정곡빌딩 16" → 한글 주소).' +
    ' 그 칸에 한글이 없을 때만 영문을 담고, 영문만 있는 명함은 영문 그대로 담습니다.' +
    ' **영문을 한글로 번역하거나 소리나는 대로 옮겨 적지 마세요** — 명함에 적힌 한글만 씁니다.' +
    ' 이메일·홈페이지는 원래 영문이므로 그대로 옮기세요.' +
    '\n없는 값은 빈 문자열. 날짜는 2026-08-03 형식. 전화번호는 010-1234-5678 형식.' +
    '\n사업자등록번호는 숫자 10자리를 정확히 옮기고 추측하지 마세요. JSON 외 텍스트 금지.';

  /* ── 쓸 모델 ──
     ⚠ 모델 이름을 한 곳에 박아 두면 구글이 그 모델을 내릴 때 앱이 조용히 멈춘다.
     실제로 그랬다 — `gemini-2.0-flash` 가 2026-06-01 에 서비스 종료되면서
     계속 429(사용 가능 한도 0)가 났고, '사용량 초과'로 잘못 짚었다.
     그래서 **여러 모델을 차례로 시도하고 되는 것을 기억한다.**
     앞에 있는 것이 우선. 무료 등급에서 쓸 수 있는 것만 둔다. */
  var MODELS = ['gemini-2.5-flash', 'gemini-3.1-flash-lite'];
  var goodModel = null;   // 한 번 통한 모델을 기억해 헛걸음을 줄인다

  function modelUrl(model, key) {
    return 'https://generativelanguage.googleapis.com/v1beta/models/' +
      model + ':generateContent?key=' + encodeURIComponent(key);
  }

  var NTS_URL = 'https://api.odcloud.kr/api/nts-businessman/v1/status?serviceKey=';

  var KINDS = { card: 1, bizreg: 1, sme: 1, payslip: 1, meeting: 1, contract: 1, chat: 1, timesheet: 1, form: 1, other: 1 };

  /* ── 판독기 판 번호 ──
     읽어 둔 결과에 이 번호를 함께 적는다. 가릴 수 있는 종류를 늘리면 번호를
     올리고, 사진첩은 **옛 번호로 읽은 사진을 다시 읽는다.**
     이게 없어서 실제로 당했다(2026-08-06 대표 화면): 회의사진 탭이 0장인데
     기타서류에 6장이 앉아 있었다 — meeting·payslip 을 가르치기 전에 읽혀
     'other' 로 굳은 사진들이었다. 사람이 한 장씩 「다시 판독」을 눌러야만
     풀리는 상태는 자동 분류라고 할 수 없다.
     ⚠ 종류를 늘리거나 프롬프트를 고치면 이 번호를 반드시 올릴 것. */
  var READ_VERSION = 9;   // …/ 7 = 계약서에 위임사무·부가세·상대 연락처 / 8 = 문서 차례 그대로(pairs 를 모든 서류에) / 9 = 모든 서류에 제목(docName), 사업자등록증명을 사업자등록증으로 줄여 쓰지 않기

  function fail(message) {
    return { kind: 'other', fields: {}, bizNoOk: null, ntsChecked: false, ntsState: null, error: message };
  }

  /* ── 일시적 실패는 스스로 다시 시도한다 ──
     실사용 보고(2026-08-03): 사업자등록증을 올렸는데 '오류 429' 한 번으로 끝났다.
     429(잠시 바쁨)·5xx(서버가 잠깐 죽음)는 조금 기다렸다 다시 부르면 되는 경우다.
     반대로 400·403(키가 틀렸거나 권한 없음)은 몇 번을 불러도 같으니 곧바로 알려준다. */
  var RETRY_WAITS = [2000, 5000];   // 최대 3번 부른다(처음 + 두 번)

  function isTransient(status) {
    return status === 429 || status === 408 || (status >= 500 && status < 600);
  }

  function busyMessage(status) {
    if (status === 429) {
      return 'AI가 잠시 바쁩니다 — 잠시 뒤 「다시 판독」을 눌러 주세요.' +
        '\n계속 같으면 AI 키의 하루 사용량을 다 썼을 수 있습니다.';
    }
    return 'AI 서버가 잠시 응답하지 않습니다 — 잠시 뒤 「다시 판독」을 눌러 주세요.';
  }

  /* 한 모델로 부른다. 일시적 실패는 기다렸다 다시. 실패하면 이유를 담아 throw.
     ⚠ AI가 준 설명(error.message)을 반드시 담는다 — 우리 문구만 보여주고 그것을
     버렸더니 '사용량 초과'로 잘못 짚었다(실제로는 모델이 없어진 것이었다). */
  function askModel(model, key, init, attempt) {
    attempt = attempt || 0;
    return deps.fetch(modelUrl(model, key), init).then(function (r) {
      if (r && r.ok) return r.json();
      var status = (r && r.status) || 0;
      if (isTransient(status) && attempt < RETRY_WAITS.length) {
        return waitFor(RETRY_WAITS[attempt]).then(function () {
          return askModel(model, key, init, attempt + 1);
        });
      }
      return apiReason(r).then(function (why) {
        var e = new Error((isTransient(status) ? busyMessage(status)
          : 'AI가 응답하지 않습니다 (오류 ' + status + ')') + (why ? '\n' + why : ''));
        e.status = status;
        throw e;
      });
    });
  }

  /* 응답 본문에 담긴 AI 쪽 설명을 꺼낸다. 없거나 못 읽어도 조용히 넘어간다. */
  function apiReason(r) {
    if (!r || !r.json) return Promise.resolve('');
    return r.json().then(function (j) {
      return (j && j.error && j.error.message) || '';
    }).catch(function () { return ''; });
  }

  /* ── 서버 대리인에게 맡긴다 (2026-08-17) ──
     브라우저는 열쇠를 모르고, 사진과 프롬프트만 보낸다. 모델 고르기·재시도는 서버가 한다.
     ⚠ 서버가 준 **상태 숫자를 그대로** 다시 세운다 — 위쪽 askAny 를 부르는 곳들이
       이 숫자로 판단한다(429 면 잠시 뒤, 403 이면 곧바로 포기). 뭉개면 그 판단이 죽는다. */
  function askProxy(parts) {
    return Promise.resolve().then(deps.getToken).then(function (token) {
      if (!token) throw new Error('로그인을 확인해 주세요');
      return deps.fetch(deps.readDocUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ parts: parts })
      });
    }).then(function (r) {
      return (r && r.json ? r.json() : Promise.resolve(null)).catch(function () { return null; })
        .then(function (j) {
          if (r && r.ok && j && j.ok) return j.reply;
          var status = (j && j.status) || (r && r.status) || 0;
          var e = new Error((j && j.error) || 'AI가 응답하지 않습니다 (오류 ' + status + ')');
          e.status = status;
          throw e;
        });
    });
  }

  /* 모델을 차례로 시도한다. 기억해 둔 모델이 있으면 그것부터.
     ⚠ 서버 대리인이 있으면 여기 오지 않는다 — 아래 부르는 곳에서 갈린다. */
  function askAny(key, init) {
    var order = goodModel
      ? [goodModel].concat(MODELS.filter(function (m) { return m !== goodModel; }))
      : MODELS.slice();
    var lastErr = null;

    function step(i) {
      if (i >= order.length) {
        throw lastErr || new Error('쓸 수 있는 AI 모델이 없습니다');
      }
      return askModel(order[i], key, init).then(function (j) {
        goodModel = order[i];
        return j;
      }).catch(function (e) {
        lastErr = e;
        /* 모델이 없어졌거나(404) 그 모델에 한도가 없으면(429) 다음 모델로.
           키 문제(400·401·403)는 모델을 바꿔도 같으므로 곧바로 포기한다. */
        var s = e && e.status;
        if (s === 404 || s === 400 || isTransient(s)) {
          if (s === 400 && i + 1 >= order.length) throw e;
          if (s === 401 || s === 403) throw e;
          return step(i + 1);
        }
        throw e;
      });
    }
    return Promise.resolve().then(function () { return step(0); });
  }

  function waitFor(ms) {
    return new Promise(function (res) { (deps.delay || function (f, m) { setTimeout(f, m); })(res, ms); });
  }

  /* 사진 한 장을 판독한다.
     어떤 실패에도 예외를 밖으로 던지지 않는다 — 사진 한 장 판독 실패가
     여러 장 올리기 전체를 멈추면 안 된다. 실패는 error 에 한국어로 담아 돌려준다. */
  /* 여러 쪽을 한 번에 보낼 때 덧붙이는 말 (대표 결정 2026-08-10: "문서 통째로 한 번").
     계약서는 보수가 2조, 기간이 6조, 서명이 마지막 쪽에 흩어져 있다. 쪽마다 따로
     보면 아무도 문서 전체를 못 봐서 2쪽 이후는 죄다 빈칸으로 돌아온다. */
  var MULTI_NOTE =
    '\n\n이 그림들은 **한 문서의 여러 쪽**이며 쪽 순서대로 놓여 있습니다.' +
    ' 쪽마다 따로 답하지 말고 **전체를 함께 읽어 한 벌의 JSON**만 주세요.' +
    ' 항목이 여러 쪽에 흩어져 있으면 찾아서 채우고, 어느 쪽에도 없으면 빈 문자열로 두세요.';

  /* ── 급여표 판독 (급여데이터함 전용) ──
     위 PROMPT_ALL 의 kind=payslip 은 사진첩·명함첩·업체관리가 함께 쓰는 프롬프트라
     **일부러** 금액·이름을 담지 않는다(위 주석 참고). 급여데이터함은 그 반대로
     사람별 금액이 꼭 필요하므로, 기존 프롬프트를 건드리지 않고 **새 프롬프트로
     새 함수**를 만든다 — 다른 세 앱의 동작은 한 글자도 바뀌지 않는다. */
  var WAGE_PROMPT =
    '이 이미지는 급여명세서·임금대장 같은 급여 관련 서류입니다. 표에 적힌 사람별 항목과 금액을 JSON으로만 답하세요.' +
    '\n키: company(사업장·회사명), period(귀속 연월 — 2026-04 형식), docName(서류 이름 그대로 — 예 급여명세서·임금대장), rows(사람별 줄 — 아래 규칙).' +
    '\nrows 규칙: [{"name":"이름","pairs":[{"item":"항목 이름 그대로","value":"금액 그대로"}]}] 배열입니다.' +
    ' 한 사람에 여러 항목(기본급·상여·공제 등)이 있으면 pairs 에 모두 담으세요 — 항목 이름은 문서에 적힌 그대로 쓰고 바꿔 적지 마세요(예: "기본급"을 "기본임금"으로 바꾸지 마세요).' +
    ' 금액은 문서에 적힌 표기 그대로 담으세요(콤마 포함 등).' +
    ' **흐려서 읽을 수 없는 항목은 지어내지 말고 건너뛰세요.**' +
    ' 표에 없는 사람을 만들어 내지 마세요. JSON 외 텍스트 금지.';

  function wageFail(message) {
    return { ok: false, error: message, company: '', period: '', docName: '', rows: [] };
  }

  /* 판독 결과를 급여데이터함이 바로 buildValueRows 에 넘길 수 있는 꼴로 다듬는다.
     이름 없는 줄·항목 없는 pairs 는 버린다 — 빈 껍데기 값 줄이 저장되면 안 된다. */
  function afterWageRead(parsed) {
    var rows = Array.isArray(parsed.rows) ? parsed.rows : [];
    var cleaned = rows.map(function (p) {
      var pairs = Array.isArray(p && p.pairs) ? p.pairs : [];
      return {
        name: String((p && p.name) || '').trim(),
        pairs: pairs.map(function (pr) {
          return { item: String((pr && pr.item) || '').trim(), value: String((pr && pr.value) || '').trim() };
        }).filter(function (pr) { return pr.item; })
      };
    }).filter(function (r) { return r.name; });
    return {
      ok: true, error: null,
      company: String(parsed.company || '').trim(),
      period: String(parsed.period || '').trim(),
      docName: String(parsed.docName || '').trim(),
      rows: cleaned
    };
  }

  /* 프롬프트만 갈아 끼우고 나머지(모델·재시도·키 조달·결과 다듬기)는 함께 쓴다. */
  function readPairsWith(prompt, dataUrl) {
    if (!deps.fetch) return Promise.resolve(wageFail('판독 준비가 되지 않았습니다'));
    var imgs = (Array.isArray(dataUrl) ? dataUrl : [dataUrl])
      .map(function (u) { return String(u || '').split(',')[1] || ''; })
      .filter(Boolean);
    if (!imgs.length) return Promise.resolve(wageFail('사진을 읽을 수 없습니다'));

    var parts = imgs.map(function (b64) {
      return { inline_data: { mime_type: 'image/jpeg', data: b64 } };
    });
    parts.push({ text: prompt + (imgs.length > 1 ? MULTI_NOTE : '') });

    /* 서버 대리인이 있으면 열쇠를 아예 안 챙긴다(2026-08-17) */
    if (useProxy()) {
      return askProxy(parts).then(function (j) {
        var parsed = parseReply(j);
        if (!parsed) throw new Error('AI가 알아볼 수 없는 답을 보냈습니다');
        return afterWageRead(parsed);
      }).catch(function (e) {
        return wageFail((e && e.message) || String(e));
      });
    }

    var keyP = deps.getKey ? Promise.resolve().then(deps.getKey) : Promise.resolve('');
    return keyP.catch(function () { return ''; }).then(function (key) {
      if (!key) return wageFail('AI 키가 없습니다 — 포털 설정에서 등록해 주세요');
      return askAny(key, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: parts }], generationConfig: { temperature: 0 } })
      }).then(function (j) {
        var parsed = parseReply(j);
        if (!parsed) throw new Error('AI가 알아볼 수 없는 답을 보냈습니다');
        return afterWageRead(parsed);
      }).catch(function (e) {
        return wageFail((e && e.message) || String(e));
      });
    });
  }

  /* 급여표(급여명세서·임금대장) 한 장(또는 여러 쪽)을 사람별 금액까지 판독한다.
     read() 와 같은 모델·재시도·키 조달 배관을 그대로 쓰되, 프롬프트와 결과 꼴만 다르다. */
  function readWageTable(dataUrl) { return readPairsWith(WAGE_PROMPT, dataUrl); }

  /* ── 알림 캡처 판독 (급여데이터함 전용, 2026-08-15) ──
     문자·카톡으로 오는 「누가 며칠자 입사」·「OO씨 수당 얼마」를 읽는다.
     표가 아니라 줄글이라 기존 판독기로는 안 된다.
     결과 모양은 readWageTable 과 같게 맞춘다 — 부르는 쪽이 하나로 다룬다. */
  var NOTICE_PROMPT =
    '이 이미지는 급여 업무 관련 알림(문자·카카오톡·메일) 캡처입니다. 사람마다 무엇이 바뀌는지 JSON으로만 답하세요.' +
    '\n키: company(사업장·회사명이 보이면), period(귀속 연월 — 2026-08 형식, 없으면 빈 문자열), docName(무슨 알림인지 한 마디 — 예 입사 통보·수당 변경), rows(사람별 줄 — 아래 규칙).' +
    '\nrows 규칙: [{"name":"이름","pairs":[{"item":"바뀌는 것","value":"값"}]}] 배열입니다.' +
    ' item 은 무엇이 바뀌는지입니다 — 예 입사일·퇴사일·기본급·식대·직책수당.' +
    ' value 는 적힌 그대로 담으세요(날짜는 2026-08-12 형식, 금액은 적힌 표기 그대로).' +
    ' **흐릿하거나 확실하지 않으면 지어내지 말고 그 줄을 빼세요.**' +
    ' 인사말·잡담은 담지 마세요. **주민등록번호는 담지 마세요.**' +
    ' 사람 이름이 없으면 그 줄을 담지 마세요. JSON 외 텍스트 금지.';

  function readChangeNotice(dataUrl) {
    return readPairsWith(NOTICE_PROMPT, dataUrl);
  }

  function read(dataUrl) {
    if (!deps.fetch) return Promise.resolve(fail('판독 준비가 되지 않았습니다'));
    /* 한 장이면 그대로, 여러 장이면 **한 문서의 여러 쪽**으로 본다. */
    var imgs = (Array.isArray(dataUrl) ? dataUrl : [dataUrl])
      .map(function (u) { return String(u || '').split(',')[1] || ''; })
      .filter(Boolean);
    if (!imgs.length) return Promise.resolve(fail('사진을 읽을 수 없습니다'));

    var parts = imgs.map(function (b64) {
      return { inline_data: { mime_type: 'image/jpeg', data: b64 } };
    });
    parts.push({ text: PROMPT_ALL + (imgs.length > 1 ? MULTI_NOTE : '') });

    /* 서버 대리인이 있으면 열쇠를 아예 안 챙긴다(2026-08-17) */
    if (useProxy()) {
      return askProxy(parts).then(function (j) {
        var parsed = parseReply(j);
        if (!parsed) throw new Error('AI가 알아볼 수 없는 답을 보냈습니다');
        return afterRead(parsed);
      }).catch(function (e) {
        return fail((e && e.message) || String(e));
      });
    }

    var keyP = deps.getKey ? Promise.resolve().then(deps.getKey) : Promise.resolve('');
    return keyP.catch(function () { return ''; }).then(function (key) {
      if (!key) return fail('AI 키가 없습니다 — 포털 설정에서 등록해 주세요');
      var body = {
        contents: [{ parts: parts }],
        generationConfig: { temperature: 0 } // 같은 사진에 같은 답이 나와야 한다
      };
      return askAny(key, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }).then(function (j) {
        var parsed = parseReply(j);
        if (!parsed) throw new Error('AI가 알아볼 수 없는 답을 보냈습니다');
        return afterRead(parsed);
      }).catch(function (e) {
        return fail((e && e.message) || String(e));
      });
    });
  }

  /* AI 응답에서 JSON을 꺼낸다. ```json 껍데기를 벗기고, 그래도 안 되면 중괄호 구간만 잘라 본다. */
  function parseReply(j) {
    var parts = (j && j.candidates && j.candidates[0] && j.candidates[0].content
      && j.candidates[0].content.parts) || [];
    var t = parts.map(function (p) { return (p && p.text) || ''; }).join('');
    t = t.replace(/```json|```/g, '').trim();
    try { return JSON.parse(t); } catch (e) { /* 아래에서 한 번 더 */ }
    var a = t.indexOf('{'), b = t.lastIndexOf('}');
    if (a >= 0 && b > a) {
      try { return JSON.parse(t.slice(a, b + 1)); } catch (e2) { /* 포기 */ }
    }
    return null;
  }

  /* 판독 결과 정리 + 사업자번호 검증 + (키가 있을 때만) 국세청 조회 */
  function afterRead(parsed) {
    var kind = KINDS[parsed.kind] ? parsed.kind : 'other';
    var fields = {};
    for (var k in parsed) {
      if (!Object.prototype.hasOwnProperty.call(parsed, k) || k === 'kind') continue;
      var v = parsed[k];
      if (v === undefined || v === null || String(v).trim() === '') continue;
      fields[k] = typeof v === 'string' ? v.trim() : v;
    }

    var out = { kind: kind, fields: fields, bizNoOk: null, ntsChecked: false, ntsState: null, error: null };

    /* 명함에는 사업자번호가 없다 → 검증 대상이 아니므로 null 로 둔다.
       false 로 두면 화면이 '검증 실패'로 오해해 멀쩡한 명함을 사람에게 물어본다. */
    /* 서식은 사업자번호가 **있을 때만** 검산한다 — 번호 없는 서식이 더 많아서
       무조건 검사하면 멀쩡한 서식이 죄다 「검증 실패」로 보인다. 국세청 조회는
       안 한다(서식의 번호는 참고용이지 등록용이 아니다). */
    if (kind === 'form') {
      if (fields.bizno) {
        out.bizNoOk = bizNoValid(fields.bizno);
        out.fields.bizno = fmtBizNo(fields.bizno);
      }
      return Promise.resolve(out);
    }
    if (kind !== 'bizreg' && kind !== 'sme') return Promise.resolve(out);

    out.bizNoOk = bizNoValid(fields.bizno);
    if (fields.bizno) out.fields.bizno = fmtBizNo(fields.bizno);

    /* 체크섬에서 이미 걸린 번호로 국세청을 부르면 헛일이다 — 통과한 것만 묻는다. */
    if (!out.bizNoOk || !deps.getNtsKey) return Promise.resolve(out);

    return Promise.resolve().then(deps.getNtsKey).catch(function () { return ''; })
      .then(function (ntsKey) {
        if (!ntsKey) return out;
        return deps.fetch(NTS_URL + encodeURIComponent(ntsKey), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ b_no: [bizNoDigits(fields.bizno)] })
        }).then(function (r) {
          if (!r || !r.ok) throw new Error('국세청 응답 오류');
          return r.json();
        }).then(function (j) {
          var row = j && j.data && j.data[0];
          if (!row) throw new Error('국세청에 자료가 없습니다');
          out.ntsChecked = true;
          out.ntsState = row.b_stt || null;
          return out;
        }).catch(function () {
          /* 조회 못 했는데 했다고 하면 안 된다 — 판독 결과는 그대로 살린다. */
          out.ntsChecked = false;
          return out;
        });
      });
  }

  /* ── AI 키를 어디서 얻는가 ──
     키 읽는 코드를 앱마다 복사하면 한 곳만 고쳐도 앱마다 다른 키를 보게 된다.
     그래서 '키가 어디 있는지'도 이 층이 안다. 순서는 명함첩·푸른카메라와 같게 맞췄다:
       ① 이 기기(브라우저) ② 명함첩 공유 키 ③ 포털 공용 설정
     국세청 키는 포털 공용 설정에만 둔다(명함첩은 국세청을 안 쓴다). */
  var LS_GEMINI = 'pucards_gemini_key';

  function readOnce(db, path) {
    if (!db) return Promise.resolve('');
    try {
      return db.ref(path).once('value')
        .then(function (s) { return (s && s.val()) || ''; })
        .catch(function () { return ''; });   // 권한이 없어도 조용히 넘어간다
    } catch (e) { return Promise.resolve(''); }
  }

  function localKey(name) {
    try {
      var ls = global.localStorage;
      return (ls && ls.getItem(name)) || '';
    } catch (e) { return ''; }
  }

  /* 판독 대리인 주소 — 서버 함수가 사는 곳.
     ⚠ 앱마다 적으면 한쪽만 고쳐진다. 여기 한 곳에만 둔다.
       (다른 서버 함수들과 같은 프로젝트·지역: asia-northeast3 / pureun-erp) */
  var READ_DOC_URL = 'https://asia-northeast3-pureun-erp.cloudfunctions.net/readDoc';

  /* ── 판독을 어떻게 부르는가 (2026-08-17) ──
     ⚠ 예전에는 여기서 **AI 열쇠를 브라우저로 가져왔다.** 그런데 그 열쇠는
       실시간DB 에 평문으로 있고 규칙상 로그인한 모든 직원이 읽는다 —
       꺼내 개인 용도로 써도 요금은 회사에 붙었다. 게다가 `AQ.` 로 시작하는
       AI 스튜디오 열쇠라 **자물쇠(웹사이트 제한)를 채울 방법도 없다**(확인 완료).
       그래서 **서버가 대신 부르고 브라우저는 열쇠를 아예 모른다.**

     ⚠ `getKey` 를 아직 남겨 둔다 — 서버가 아직 안 올라갔거나 로그인 증명을 못 얻을 때
       옛 길로 돌아가기 위해서다. 네 앱(사진첩·명함첩·enter·경력관리)이 다 옮겨지고
       서버가 안정되면 **getKey 와 실시간DB 의 열쇠를 함께 지워야** 이 문제가 끝난다.
       남겨 두면 열쇠가 DB 에 그대로 있어 지금 구멍이 안 막힌다. */
  function keysFrom(db, opts) {
    opts = opts || {};
    var auth = opts.auth || null;   // firebase.auth() — 로그인 증명을 얻는 곳
    return {
      readDocUrl: READ_DOC_URL,
      /* 로그인 증명. 없으면 null 을 돌려 **서버 대리인을 안 쓰게** 한다
         (토큰 없이 부르면 서버가 401 로 막아 원인을 못 짚는다). */
      getToken: auth ? function () {
        try {
          var u = auth.currentUser;
          if (!u) return Promise.resolve('');
          return u.getIdToken().catch(function () { return ''; });
        } catch (e) { return Promise.resolve(''); }
      } : null,
      getKey: function () {
        var mine = localKey(LS_GEMINI);
        if (mine) return Promise.resolve(mine);
        return readOnce(db, 'pucards/config/geminiKey').then(function (shared) {
          if (shared) return shared;
          return readOnce(db, 'data/app_config/geminiKey');
        });
      },
      getNtsKey: function () { return readOnce(db, 'data/app_config/ntsKey'); }
    };
  }

  /* ── 자동 입력 판정 ──
     "검증 통과하면 자동, 걸리면 사람 확인"을 앱마다 다시 쓰지 않도록 한 함수로 굳혔다.
     why 는 화면에 그대로 띄울 한국어다 — 영어 내부 용어를 노출하지 않는다(저장소 규칙). */
  function autoOk(result, nowMs) {
    var r = result || {};
    if (r.error) return { auto: false, why: '판독하지 못했습니다 — 직접 확인해 주세요' };
    if (r.kind === 'other' || !KINDS[r.kind]) return { auto: false, why: '어떤 서류인지 가리지 못했습니다' };
    /* 회의·현장 사진은 잘 읽힌 것이다 — 다만 명함첩에 넣을 것이 없다.
       '확인 필요'로 잡으면 할 일이 아닌 것이 할 일 목록에 쌓인다. */
    if (r.kind === 'meeting') return { auto: false, why: '회의·현장 사진입니다 — 명함첩에 넣을 것이 없습니다', done: true };
    /* 급여서류는 분류만 하고 어디에도 보내지 않는다.
       done: true — 넣을 곳이 없는 것은 **할 일이 아니다.** 이것이 없으면
       올릴 때마다 「확인 필요」가 쌓여, 치울 수 없는 할 일이 목록을 못 믿게 만든다
       (2026-08-04 "확인 필요 오류가 계속 나온다" 와 같은 종류의 문제). */
    if (r.kind === 'payslip') return { auto: false, why: '급여서류입니다 — 사진첩에만 보관합니다', done: true };
    /* 계약서도 명함첩·업체관리로 보내지 않는다 — 상대 업체는 이미 명함으로 들어와 있고,
       계약서에서 만든 업체는 이름만 있는 빈 껍데기가 되어 같은 회사가 두 벌 쌓인다.
       done: true — 넣을 곳이 없는 것은 할 일이 아니다(급여서류와 같은 이유). */
    if (r.kind === 'contract') return { auto: false, why: '계약서입니다 — 사진첩에만 보관합니다', done: true };
    /* 대화 캡처도 명함첩·업체관리로 보내지 않는다 — 요약·할 일이 사진에 붙어
       그 자리에서 일하는 물건이다. done: true — 넣을 곳이 없는 것은 할 일이 아니다. */
    if (r.kind === 'chat') return { auto: false, why: '대화 캡처입니다 — 요약과 할 일을 뽑아 두었습니다', done: true };
    /* 근태표도 명함첩·업체관리로 보내지 않는다 — 표로 정리해 확인·엑셀로 내리는
       것이 이 서류의 일이다. done: true — 넣을 곳이 없는 것은 할 일이 아니다. */
    if (r.kind === 'timesheet') return { auto: false, why: '근태·휴무표입니다 — 표로 정리해 두었습니다', done: true };
    /* 일반 서식도 어디로도 안 보낸다 — 읽어서 보여 주고 복사해 가는 물건이다. */
    if (r.kind === 'form') return { auto: false, why: '서식입니다 — 읽은 칸을 확인해 주세요', done: true };

    var f = r.fields || {};
    /* 회사도 이름도 못 읽었으면 넣을 것이 없다 — 빈 껍데기를 만들면 나중에 지우는 일이 생긴다. */
    if (!f.company && !f.name) return { auto: false, why: '회사나 이름을 읽지 못했습니다' };

    if (r.kind === 'bizreg' || r.kind === 'sme') {
      if (!r.bizNoOk) return { auto: false, why: '사업자등록번호를 확실히 읽지 못했습니다 — 번호를 확인해 주세요' };
      if (r.ntsChecked && r.ntsState && r.ntsState.indexOf('계속') < 0) {
        return { auto: false, why: '국세청에 ' + r.ntsState + '로 나옵니다 — 확인이 필요합니다' };
      }
    }

    if (r.kind === 'sme' && f.expiry) {
      var t = Date.parse(f.expiry);
      var now = nowMs || Date.now();
      if (!isNaN(t) && t < now) return { auto: false, why: '유효기간이 지난 확인서입니다 — 새로 발급받아야 합니다' };
    }

    return { auto: true, why: '' };
  }

  global.PuDocRead = {
    init: init,
    bizNoDigits: bizNoDigits,
    bizNoValid: bizNoValid,
    fmtBizNo: fmtBizNo,
    mapTo: mapTo,
    keysFrom: keysFrom,
    MODELS: MODELS,
    PROMPTS: { all: PROMPT_ALL },
    READ_VERSION: READ_VERSION,
    read: read,
    readWageTable: readWageTable,
    readChangeNotice: readChangeNotice,
    autoOk: autoOk,
    /* 검사 전용 — 바깥 함수들은 실패를 한국어 글로 감싸 버려서, 서버가 준
       **상태 숫자**가 살아 있는지 확인할 길이 없다. 그 안쪽을 열어 둔다.
       ⚠ 앱에서 부르지 말 것. */
    _askProxyForTest: function (parts) { return askProxy(parts); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
