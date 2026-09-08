/* 푸른통합시스템 — 서류 판독 층
   사진 한 장이 명함인지 사업자등록증인지 중소기업확인서인지 가리고, 항목을 읽어 내고,
   사업자등록번호가 맞는지 기계로 검증하는 유일한 파일이다.
   사진첩·기업정보함·푸른이알피가 모두 이 파일을 쓴다 — 판독 방식(모델·프롬프트)이
   바뀌어도 앱은 손대지 않는다. (저장 층 pu-photo-store.js 와 같은 원리)

   이 층은 읽고·검증하고·앱별 이름으로 바꾸기만 한다. **저장하지 않는다.**
   저장은 부르는 쪽 책임이다 — 그래서 이 파일이 실데이터를 망칠 경로가 없다.

   fetch·키 읽기는 주입받는다. 노드에서 가짜로 갈아끼워 검사할 수 있어야 하고,
   앱마다 키를 얻는 방법이 다르기 때문이다(기업정보함 공유 키 / 포털 공용 설정 / 이 기기). */
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
    deps.app = o.app || null;
    return true;
  }

  /* ⑤ 어느 화면이 부르나 — 서버가 앱별로 셈을 적는다(대표 물음 2026-09-08).
     ★ 부르는 곳마다 적게 하지 «않는다». 여섯 군데가 저마다 init 하는데, 한 곳만
       빠뜨리면 그 앱은 셈에서 사라지고 「사진첩이 다 썼다」는 틀린 답이 나온다.
       화면 파일 이름은 «빠뜨릴 수가 없다».
     ⚠ 모르는 화면은 'other' 다 — 지어내지 않는다. 서버도 아는 이름만 받는다. */
  var APP_BY_PAGE = [
    [/pu-photos/i, 'photos'], [/pu-cards/i, 'cards'], [/kcareer/i, 'kcareer'],
    [/pu-paydata|payroll/i, 'payroll'], [/rules/i, 'rules'], [/fund/i, 'fund'],
    [/pu-erp/i, 'erp']
  ];
  /* 사람에게 보일 이름 — «이름을 정하는 곳»에 둔다. 화면 쪽에 두면 앱 이름이
     늘 때 한쪽만 고쳐져 「other 12번」처럼 뜻 모를 줄이 뜬다.
     ⚠ 사진첩 화면에 이 표를 두면 안 된다 — 거기에 다른 앱 이름을 글자로 적으면
       「다른 앱의 클라우드 루트를 건드리지 않는다」 검사가 걸린다(그 검사가 옳다). */
  var APP_KO = { photos: '사진첩', cards: '기업정보함', kcareer: '경력관리',
    payroll: '급여', rules: '취업규칙', fund: '기금', erp: '푸른이알피', other: '그 밖' };
  function appName() {
    if (deps.app) return deps.app;
    var p = '';
    try { p = String((global.location && global.location.pathname) || ''); } catch (_) { p = ''; }
    for (var i = 0; i < APP_BY_PAGE.length; i++) {
      if (APP_BY_PAGE[i][0].test(p)) return APP_BY_PAGE[i][1];
    }
    return 'other';
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
       기업정보함 bizno · 푸른이알피 bizNo · 기금관리 biz_no
     이 표를 앱이 각자 들고 있으면 한 곳만 고쳐도 조용히 안 붙는다. 여기 한 곳에 둔다.
     왼쪽 = 판독 결과 이름, 오른쪽 = 그 앱의 필드 이름. */
  var MAP = {
    cards: {
      card: { name: 'name', company: 'company', dept: 'dept', title: 'title',
              mobile: 'mobile', tel: 'tel', fax: 'fax', email: 'email',
              companyTel: 'companyTel', companyFax: 'companyFax', companyAddr: 'companyAddr',
              website: 'website', address: 'address', memo: 'memo' },
      /* ⚠ docName 을 «항목»에도 담는다 (대표 지시 2026-08-26 「고유번호증을 필터링
         가능하게」). 예전에는 서류이름이 coInfo 의 갈래(tags)에만 남아서, 사업자 목록
         에서는 그 한 장이 사업자등록증인지 고유번호증인지 알 길이 «전혀» 없었다.
         회사 단위가 아니라 서류 한 장 단위로 골라 봐야 할 때가 그래서 막혔다. */
      /* ── 서식·신청서 → «명함» (대표 지시 2026-08-31) ──────────────────────
         「사진은 각각 2장으로 넣었지만 하나의 회사이다. 기업정보함에 명함 내용과
          기업 상세를 각각 넣어 정리해라」
         신청서 2쪽의 «담당자 정보»(담당자명·이메일·부서·직위·유선·휴대전화)가 사람이고,
         1쪽이 회사다. 회사는 sendToCoInfo 로 기업 상세에, 사람은 여기 표를 거쳐 명함으로.
         ⚠⚠ company 를 «반드시» 싣는다. 실제로 명함 「이권우」의 회사 칸이 비어 있었는데,
           회사가 없으면 기업 상세가 회사를 사업자번호·상호로 묶으므로 그 사람은 어느
           회사에도 안 붙는다 — 사람 따로 회사 따로 뜨는 것이 그 증상이다.
         ⚠ 담당자 «유선»은 직통전화(tel)다. 회사 대표번호(companyTel)와 다른 번호이므로
           같은 칸에 넣으면 그 사람이 떠난 뒤에도 개인 번호가 회사 번호로 남는다.
         ⚠ 주소는 «회사 주소»(companyAddr)다. 개인 주소 칸에 넣으면 안 된다. */
      form: { name: 'name', title: 'title', dept: 'dept', tel: 'tel',
              mobile: 'mobile', email: 'email',
              company: 'company', companyTel: 'companyTel', companyFax: 'companyFax',
              address: 'companyAddr', homepage: 'website', bizno: 'bizno' },
      /* ⚠ issueDate(등록증 발급일)를 openDate(개업일)와 «따로» 둔다 (2026-09-07).
           공공기관은 대표자가 자주 바뀌어 등록증이 새로 발급되는데, 그때
           **개업일은 안 바뀌고 발급일만 바뀐다.** 한 칸에 섞으면 「어느 것이
           최신인가」를 영영 못 가린다 — 그것이 이 칸을 만든 까닭이다. */
      bizreg: { company: 'company', ceo: 'ceo', bizno: 'bizno', corpno: 'corpno',
                openDate: 'openDate', issueDate: 'issueDate',
                bizType: 'bizType', bizItem: 'bizItem',
                companyTel: 'companyTel', companyFax: 'companyFax', address: 'address',
                memo: 'memo', docName: 'docName' }
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

  /* 기업정보함 레코드는 종류를 kind 로 구분한다(card / biz). 다른 앱은 종류 칸이 없다. */
  /* 서식도 «명함»으로 담는다 (대표 지시 2026-08-31) — 담긴 것은 그 서식의 담당자다.
     회사 쪽은 명함이 아니라 기업 상세(sendToCoInfo)로 따로 간다. */
  var CARDS_KIND = { card: 'card', bizreg: 'biz', form: 'card' };

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
     명함·사업자등록증 키 목록은 기업정보함이 쓰던 문장을 그대로 가져왔다 —
     이미 현장에서 검증된 프롬프트를 새로 쓰지 않는다. */
  var PROMPT_ALL =
    '이 이미지가 어떤 서류인지 가리고 정보를 추출해 JSON으로만 답하세요.' +
    '\nkind 는 다음 중 하나입니다: card(명함), bizreg(사업자등록증), sme(중소기업확인서 또는 중견기업확인서), payslip(급여 관련 서류 — 급여명세서·임금대장·급여이체내역·４대보험 산정보수 등 사람의 임금 금액이 적힌 것), meeting(회의·현장 사진 — 사람들이 모여 있거나 사업장·작업 현장 모습), contract(계약서 — 자문계약서·위임계약서·용역계약서·수임약정서 등 우리 사무소와 업체가 맺은 약정 문서. **근로자와 사업주가 맺은 근로계약서는 여기가 아니라 wcontract 입니다**), wcontract(근로계약서 — 근로자와 사업주가 맺은 것. 「근로계약서」·「연봉계약서」·「촉탁근로계약서」처럼 근로 시작일·소정근로시간·임금이 적히고 근로자와 사업주가 서명한 문서. 우리 사무소가 당사자인 자문·위임·용역계약서는 contract 입니다), chat(대화 캡처 — 카카오톡·문자·메일 화면을 찍거나 캡처한 것. 말풍선이나 메일 본문이 보이면 대화입니다), timesheet(근태·휴무표 — 근무일·유급일·휴무일 날짜를 사람별로 적은 것. 손글씨 메모라도 사람 이름과 날짜 목록이 줄줄이 있으면 이것입니다. **임금 금액이 적혀 있으면 timesheet 이 아니라 payslip 입니다**), cms(CMS 자동이체 신청서 — 「계좌/신용카드 자동출금 이용신청서」처럼 은행·계좌번호·예금주·출금일을 적어 자동이체를 신청하는 문서. 수납기관명에 푸른노무법인이 적혀 있는 것이 대부분입니다), bankbook(통장·계좌 — 통장 표지나 통장 사본, 예금거래확인서·계좌확인서·이체확인증처럼 **은행명·계좌번호·예금주**를 보여 주는 것. 자동이체를 «신청»하는 서식이면 cms 이고, 계좌 자체를 보여 주는 것이면 bankbook 입니다), idcard(신분증 — 주민등록증·운전면허증·여권·외국인등록증처럼 **사람의 신분을 증명하는 증서**. 얼굴 사진과 주민등록번호(외국인등록번호)가 함께 있는 것이 대부분입니다), resident(주민등록 서류 — 주민등록등본·초본, 가족관계증명서처럼 **관공서가 떼어 주는 개인 신분·가족 사항 서류**), mandate(위임장 — 「위임장」이라는 제목으로 위임인이 수임인에게 어떤 일을 맡긴다고 적고 도장·서명한 문서. 약정 조항이 줄줄이 있는 「위임계약서」는 contract 입니다), consent(개인정보 동의서 — 「개인정보 수집·이용 동의서」·「고유식별정보 처리 동의서」처럼 **동의 항목과 동의함/동의하지 않음 표시**가 있는 문서), form(서식 — 신청서·확인서·공문·조사표처럼 칸 이름과 값이 표로 짜인 문서인데 위 종류 어디에도 안 드는 것), other(위 열이 아님).' +
    /* 대화가 급여 얘기를 담고 있어도 대화다(대표 지시 2026-08-12) — 캡처 하나가
       「급여대장」으로 분류돼 급여서류 경고까지 뜬 실사례에서 나온 규칙이다.
       서류는 서류 자체를 찍은 것이고, 대화는 서류에 **대해 말한** 것이다. */
    '\n⚠ 대화 캡처가 급여·계약 이야기를 담고 있어도 kind=chat 입니다. 서류 자체를 찍은 것만 payslip·contract 입니다.' +
    '\nkind=card 이면 키: name(이름), company(회사명), dept(부서), title(직책), mobile(휴대폰), tel(직통전화), fax(개인팩스), email(이메일), companyTel(회사 대표번호), companyFax(회사 팩스), companyAddr(회사 주소), website(홈페이지), address(개인 주소), memo(기타 정보), pairs(명함에 적힌 모든 줄 — 아래 규칙).' +
    '\nkind=bizreg 이면 키: docName(문서 제목 그대로 — 아래 【제목】 규칙), company(상호/법인명), ceo(대표자), bizno(사업자등록번호), corpno(법인등록번호), openDate(개업연월일), issueDate(**등록증 발급일** — 문서 아래쪽 「○○○○ 년 ○○ 월 ○○ 일  ○○세무서장」의 그 날짜. 2025-02-12 형식. **개업연월일과 다릅니다** — 개업일은 사업을 시작한 날이고 발급일은 이 등록증을 발급한 날입니다. 대표자가 바뀌면 개업일은 그대로이고 발급일만 새로 찍힙니다. 안 보이면 빈 문자열), bizType(업태), bizItem(종목), companyTel(대표번호), companyFax(팩스), address(사업장 소재지), taxInvoiceEmail(전자세금계산서 전용 전자우편주소), taxInvoiceContact(그 주소 옆·아래에 담당자 이름이 적혀 있으면 그 이름 — 없으면 빈 문자열), memo(기타), pairs(문서의 모든 칸 — 아래 규칙).' +
    /* ── 고유번호증도 bizreg 다 (대표 지시 2026-08-26) ──
       "고유번호증이 기업정보함에 입력이 안된다. 사업자등록증 고유번호증 모두 같은것이다."
       ⚠ 이 줄이 없어서 «어떤 건 들어가고 어떤 건 안 들어갔다». 고유번호증은
         · 제목이 「사업자등록증」이 아니고(사업자등록증이라는 낱말이 문서에 없다)
         · 칸 이름도 다르다 — 상호가 아니라 «단체명», 사업자등록번호가 아니라 «고유번호»
         그래서 판독기가 form(칸 이름과 값이 표로 짜인 문서) 으로 볼 여지가 컸다.
         form 으로 떨어지면 사업자 목록에 아예 안 들어간다 — 그것이 그 증상이다.
       ⚠ 번호는 열 자리로 같은 꼴이라 bizno 에 그대로 담으면 회사 열쇠가 맞는다
         (기업 상세는 사업자번호로 회사를 가른다). 새 칸을 만들면 열쇠가 갈라진다. */
    /* ── 세금계산서 발급처 (대표 지시 2026-08-30) ──
       「사업자등록증에 세금계산서 발급 이메일과 담당자가 있는 경우가 많이 있다」
       등록증 아래쪽에 「전자세금계산서 전용 전자우편주소」로 찍혀 나온다. 그 옆에
       담당자 이름이 손으로 적혀 있는 일도 흔하다.
       ⚠ 이 주소는 «우리가 그 업체에 계산서를 보낼» 곳이다 — 푸른이알피의 taxEmail
         (세무사무실·보수총액신고 요청처)과 «다른 자리»다. 섞으면 신고자료 요청이
         엉뚱한 주소로 나간다. */
    '\n⚠ 등록증 아래쪽 「전자세금계산서 전용 전자우편주소」 칸을 taxInvoiceEmail 에 담으세요.' +
    ' 주소가 둘 이상이면 «맨 앞 하나»만 담습니다. 그 옆이나 아래에 담당자 이름이 적혀' +
    ' 있으면 taxInvoiceContact 에 담고, 없으면 빈 문자열로 두세요.' +
    ' ⚠ 지어내지 마세요 — 안 적혀 있으면 빈 문자열입니다.' +
    '\n⚠ 「고유번호증」(수익사업을 하지 않는 비영리법인·국가기관 등에 부여)도 kind=bizreg 입니다.' +
    ' 사업자등록증과 같은 것으로 다루세요. 칸 이름이 다를 뿐입니다:' +
    ' 「고유번호」→bizno, 「단체명」→company, 「대표자 성명」→ceo, 「법인등록번호」→corpno,' +
    ' 「소재지」→address, 「교부 사유」·「대표자 주소」→memo.' +
    ' docName 에는 문서 제목 그대로 「고유번호증」을 담으세요 — 나중에 이것만 골라 봅니다.' +
    '\nkind=sme 이면 키: docName(문서 제목 그대로 — 아래 【제목】 규칙), company(상호/법인명), bizno(사업자등록번호), ceo(대표자), smeType(기업규모 — 소기업/중기업/중견기업 등), issueNo(발급번호), issueDate(발급일), expiry(유효기간 만료일), industry(주업종), pairs(문서의 모든 칸 — 아래 규칙).' +
    /* 급여서류는 **금액을 읽지 않는다.** 어느 회사·언제·«누구» 것인지만 담는다.
       임금 금액은 사람마다 다른 민감정보인데, 사진첩은 그것을 어디에도 쓰지 않으므로
       읽어 둘 이유가 없다. 읽어서 담으면 클라우드에 한 벌 더 쌓이는 위험만 는다.

       ── 이름은 읽는다 (대표 결정 2026-09-01) ──
       근로자 정보함을 만들면서 «이 서류가 누구 것인가»가 필요해졌다. 이름이 없으면
       급여서류는 회사·귀속월까지만 붙고 사람에게는 영영 못 붙는다.
       ⚠ 늘어난 것은 **이름 하나**다. 금액은 여전히 한 글자도 안 담는다 —
         「이름을 읽으니 금액도 함께」로 넓히지 말 것. 사람을 가리는 데 금액은 안 쓴다. */
    '\nkind=payslip 이면 키: company(사업장·회사명), period(귀속 연월 — 2026-04 형식), docName(서류 이름 그대로 — 예 급여명세서·임금대장), name(근로자 이름 — 한 사람 것일 때), rows(여러 사람이 한 장에 있을 때 — 아래 규칙), memo(무엇에 쓰는 서류인지 한 줄). **금액은 담지 마세요.**' +
    '\npayslip 의 rows 규칙: [{"name":"이름"}] 배열입니다 — 임금대장처럼 여러 사람이 한 표에 있으면 이름만 줄줄이 담으세요.' +
    ' 한 사람 것이면 rows 는 빈 배열로 두고 name 에만 담으세요. **금액·주민번호·계좌번호는 어느 쪽에도 담지 마세요.**' +
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
    /* ── CMS 자동이체 신청서 (대표 지시 2026-08-28) ──
       이 값들이 기업정보함의 «은행·자동이체» 칸으로 가고, 그 업체 계약의 자동이체를 켠다.
       ⚠⚠ **예금주 주민번호는 읽지 않는다.** 신청서에 적혀 있지만 자동이체를 아는 데
         필요 없고, 한 번 담기면 지우기 어렵다. 아래 물음에 일부러 넣지 않았고,
         「읽지 마세요」라고 못박아 둔다 — 안 그러면 pairs 로 딸려 나온다.
       ⚠ 계좌번호는 **그대로** 읽는다(대표 결정 2026-08-28: "뒤 계좌 모두 보여야 한다.
         그래야 추후 데이터를 이용해서 cms 자동입력할 수 있다"). 가리면 그 쓰임이 없어진다. */
    '\nkind=cms 이면 키: docName(서식 제목 그대로), company(신청 업체·기관명), payTo(수납기관명 — 예 푸른노무법인), applyType(신규/변경/해지 중 표시된 것 하나), bankName(은행명), bankAcct(계좌번호 — 적힌 그대로, 하이픈 포함), bankHolder(예금주), payDay(지정 출금일 — 숫자만, 예 25), amount(금액 — 숫자만), payerNo(납부자번호·고객번호), applyDate(신청일 — 2026-08-28 형식), name(신청인 이름), mobile(신청인 휴대폰), tel(신청인 전화), pairs(문서의 칸 — 아래 규칙). **없는 항목은 빈 문자열로 두고 지어내지 마세요.**' +
    /* ── 통장·계좌 (대표 지시 2026-08-31) ──
       "통장이나 계좌도 OCR 로 요청하는 경우 모두 가능하게 해라."
       통장 표지·통장 사본·계좌확인서·계좌이체 확인증처럼 **은행·계좌번호·예금주**가
       적힌 것을 통째로 이 갈래로 받는다. 예전에는 이런 사진이 form 이나 other 로 굳어
       계좌를 손으로 옮겨 적어야 했다.
       ⚠⚠ **주민번호는 읽지 않는다.** 통장 사본에 적혀 있는 경우가 있지만 계좌를 아는 데
         필요 없고, 한 번 담기면 지우기 어렵다 — cms 와 같은 규칙이다.
       ⚠ 계좌번호는 **그대로** 읽는다. 가리면 자동이체·이체에 쓸 수 없어 기능이 없어진다
         (대표 결정 2026-08-28 과 같은 까닭).
       ⚠ 자동이체 «신청서»는 cms 다 — 그쪽은 출금일·납부자번호까지 있는 서식이다.
         이 갈래는 계좌 그 자체를 보여 주는 것이다. */
    '\nkind=bankbook 이면 키: docName(문서 제목 그대로 — 예 통장 사본·예금거래확인서·계좌확인서), bankName(은행명 — 예 국민은행·농협), bankAcct(계좌번호 — 적힌 그대로, 하이픈 포함), bankAcctAlt(평생계좌·모계좌처럼 **따로 이름이 붙은 두 번째 계좌번호** — 적혀 있으면 적힌 그대로), bankHolder(예금주 — 사람 이름 또는 상호), acctType(예금 종류 — 보통예금·기업자유예금 등 적혀 있으면), company(사업자 통장이면 상호, 개인 통장이면 빈 문자열), bizno(사업자등록번호 — 적혀 있으면), openDate(개설일 — 적혀 있으면 2026-08-31 형식), memo(기타 한 줄), pairs(문서의 칸 — 아래 규칙). **없는 항목은 빈 문자열로 두고 지어내지 마세요.**' +
    '\n⚠ kind=bankbook 에서도 **주민등록번호는 절대 담지 마세요** — pairs 에도 넣지 마세요.' +
    /* ── 계좌가 «둘» 적힌 통장 (대표 지시 2026-09-03) ──
       통장 겉장에는 정식 계좌번호와 **평생계좌**가 함께 적힌 것이 흔하다. 칸이 하나뿐이면
       둘 중 하나만 담기고 **어느 쪽이 담겼는지도 모른다** — 그 값으로 자동이체를 걸면
       틀린 계좌로 나간다. 두 칸으로 나눠 담아 사람이 고르게 한다.
       ── 개인사업자 통장 ──
       예금주가 «사람 이름»인데 상호가 함께 적힌 것이 개인사업자 통장이다. 하나만 담으면
       「누구 것인가」와 「어느 업체 것인가」 가운데 하나를 잃는다. */
    '\n⚠ kind=bankbook 에서 계좌번호가 둘 이상 적혀 있으면 정식 계좌번호를 bankAcct 에, 평생계좌·모계좌처럼 이름이 따로 붙은 것을 bankAcctAlt 에 나눠 담으세요. 하나뿐이면 bankAcct 에만 담고 bankAcctAlt 는 빈 문자열로 두세요.' +
    '\n⚠ kind=bankbook 에서 예금주가 사람 이름이고 상호가 함께 적혀 있으면(개인사업자 통장) bankHolder 에 사람 이름을, company 에 상호를 **둘 다** 담으세요.' +
    '\n⚠ kind=cms 일 때 **주민등록번호·생년월일은 절대 읽지 마세요.** pairs 에도 넣지 마세요. 그 칸은 통째로 건너뜁니다.' +
    /* ── 근로자 서류 넷 (대표 지시 2026-09-01) ──
       신분증·주민등록등본·위임장·개인정보동의서를 스캔해 보관하기로 했다.
       이 넷을 알아보게 하는 «까닭»은 정보를 캐려는 것이 아니라 **민감으로 다루려는 것**이다 —
       종류가 안 잡히면 「민감 아님」으로 떨어져 **원본 주소가 만료 없이 사진에 적힌다**
       (js/pu-photo-store.js 의 SENSITIVE_KINDS 참고).

       ⚠⚠ 그래서 담는 것은 **이름 하나뿐**이다. 「누구 것인가」를 붙이는 데만 쓴다.
         주민번호·주소·연락처·가족사항은 **한 글자도 담지 않는다** — 담기는 순간
         그것이 사진 목록에 실려 내려가고, 목록은 화면을 열 때마다 통째로 온다.
         cms·bankbook 에서 계좌는 담되 주민번호는 안 담기로 한 것과 같은 셈이다.
       ⚠ pairs 도 안 받는다. pairs 는 「문서의 모든 칸」이라, 넣는 순간 주민번호가 딸려 온다. */
    /* ── 근로자의 근로계약서 (대표 지시 2026-09-02) ──
       「일반근로자들의 계약서 … 스캔해서 보관」. 여태 이런 사진은 contract 로 읽혔는데,
       contract 는 «우리 사무소와 업체가 맺은 약정»이다. 그대로 두면
       푸른이알피의 「사진첩에서 계약서 찾기」가 근로계약서로 뒤덮인다 —
       그 창은 kind=contract 만 모아 자문계약 창에 붙이기 때문이다.

       ── 임금은 읽는다. 다만 «사람이 확인해야» 산다 (대표 지시 2026-09-02) ──
       처음에는 안 읽기로 했다가 대표께서 「임금 읽고 사람 확인하는 단계」로 정하셨다.

       ⚠⚠ **적힌 그대로 담는다 — 숫자로 고치지 마세요.** 여기가 이 갈래에서 가장 위험한
         자리다. 계약서 금액은 «1만 배 틀리게 읽힌 전례»가 있다: 「월 100만원」을 기계가
         1,000 으로 읽으면 아무도 모르게 1,000원이 들어간다(pu-erp.html 의
         erpContractPhotoApplyPatch 가 그래서 금액 자동채움을 막아 두었다).
         단위를 «해석하는» 순간 그 사고가 난다 — 해석은 사람이 한다.
       ⚠ 화면이 이 값을 그대로 쓰지 «않는다». 사람이 보고 확인해야 «확인된 값»이 된다
         (pu-photos.html 의 wageNeedsOk·wageConfirm).
       ⚠⚠ **주민번호·주소·연락처는 그대로 안 담는다.** 근로계약서에는 실제로 다 적혀 있다.
         근로자 서류 넷과 같은 규칙이다 — 이번에 늘어난 것은 **임금 하나**다. */
    '\nkind=wcontract 이면 키: name(근로자 이름), company(사업장·회사명), position(직위·직종 — 적혀 있으면), hireDate(근로 시작일 — 2026-09-01 형식), endDate(근로 종료일 — 기간을 정한 계약이면), termType(기간의 정함 — 「있음」 또는 「없음」 중 읽히는 것), wageType(임금 형태 — 월급·시급·일급·연봉 중 적힌 것), wage(임금액 — **적힌 그대로**, 단위와 글자까지 그대로. 예 「월 2,500,000원」·「시급 10,030원」), docName(문서 제목 그대로 — 예 근로계약서·연봉계약서).' +
    '\n⚠ kind=wcontract 의 wage 는 **적힌 그대로** 담으세요 — 숫자만 남기거나 단위를 바꾸지 마세요. 「월 100만원」이면 「월 100만원」 그대로입니다.' +
    '\n⚠ kind=wcontract 에서 **주민등록번호·주소·연락처는 한 글자도 담지 마세요.** pairs 도 담지 마세요.' +
    '\nkind=idcard 이면 키: name(이름), docName(증서 이름 — 예 주민등록증·운전면허증·여권·외국인등록증), issueDate(발급일 — 적혀 있으면 2026-09-01 형식).' +
    '\nkind=resident 이면 키: name(본인 이름 — 세대주가 아니라 발급 대상 본인), docName(서류 이름 — 예 주민등록표 등본·초본·가족관계증명서), issueDate(발급일 — 2026-09-01 형식).' +
    '\nkind=mandate 이면 키: name(위임인 이름), company(위임인 소속 업체 — 적혀 있으면), agent(수임인 — 예 푸른노무법인), docName(문서 제목 그대로), scope(위임한 일 한 줄), signDate(작성일 — 2026-09-01 형식).' +
    '\nkind=consent 이면 키: name(동의한 사람 이름), company(소속 업체 — 적혀 있으면), docName(동의서 제목 그대로), purpose(수집·이용 목적 한 줄), signDate(동의 날짜 — 2026-09-01 형식).' +
    '\n⚠⚠ kind=idcard·resident·mandate·consent 에서는 **주민등록번호·외국인등록번호·주소·연락처·가족사항을 한 글자도 담지 마세요.** pairs 도 담지 마세요. 이 넷에서 필요한 것은 «누구 것인가»뿐입니다.' +
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
    /* ⚠ 이름 붙은 키를 늘렸다 (대표 지시 2026-08-23) — 기술보호울타리·현장클리닉의
       «사업장 정보 화면»을 캡처해 담을 때, 정작 자격을 가리는 숫자(매출액·상시
       근로자수)가 pairs 에만 있어 기업 상세 화면까지 오지 못했다. pairs 는 사람이
       눈으로 대조할 차례이고, 기업정보함으로 넘어가는 것은 «이름 붙은 키»뿐이다
       (js/pu-doc-file.js 의 sendToCoInfo 의 KEEP 목록). */
    '\nkind=form 이면 키: docName(서식 제목 그대로), company(업체·기관명), ceo(대표자), bizno(사업자등록번호), corpno(법인등록번호), address(주소), companyTel(전화번호), companyFax(팩스번호), homepage(홈페이지), openDate(설립일자·개업일), bizType(업태), bizItem(업종·종목), product(주생산품), sales(직전년도 매출액 — 숫자만, 단위 표기는 빼세요), workers(상시근로자수 — 숫자만), name(담당자 이름), title(담당자 직위), dept(담당자 부서), tel(담당자 유선전화), mobile(담당자 휴대폰), email(이메일), pairs(문서의 **모든** 칸 — 아래 규칙).' +
    /* 문서 차례 그대로(대표 지시 2026-08-13): "데이터를 읽을 때 맨 위에서부터
       순서대로 읽었으면 좋겠다. 데이터 순서가 바뀐다. 모든 데이터들 순서가 같다."
       ⚠ 예전에는 "위 키에 이미 담은 칸은 다시 담지 마세요" 였다. 그래서 화면이
         아는 칸(코드에 박아 둔 고정 차례)을 먼저 다 그리고 나머지를 뒤에 붙여,
         원본에서는 「업체명 → 업종 → 사업자등록번호」인데 화면에서는 업종이 한참
         아래로 밀렸다. 사람이 원본과 한 줄씩 대조할 수가 없었다.
       ⚠ 그래서 **일부러 두 번 담는다.** 이름 붙은 키는 기업정보함·업체관리로 넘길 때
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
       적어 두는 일이 많다. 그때 영문을 담으면 **기업정보함·업체관리에서 한글로 찾는
       사람이 못 찾고**, 같은 회사가 두 벌로 쌓인다. 그래서 읽을 수 있으면 한글이다.
       ⚠ 이메일·홈페이지까지 한글로 바꾸라는 말이 아니다 — 그건 원래 영문이다.
       ⚠ 없는 한글을 지어내지 말 것 — 영문 이름을 한글로 옮겨 적으면 실제와 다른
          회사명이 만들어져 업체관리에 잘못 들어간다. */
    /* 【제목】 규칙(대표 지시 2026-08-15) — "사업자등록증명 도 제목을 정확하게
       인지하게해라. 모든 서식에 제목을 찾고 제목에 따라 정렬하는 프로세스로 만들어라."
       ⚠ 실사례: 국세청 「사업자등록증명」(증명원)을 올렸더니 그냥 「사업자등록증」으로
         읽혔다. 둘은 다른 서류인데 갈래 이름만 보여 구분할 길이 없었다.
       ⚠ 갈래(kind)는 일부러 안 나눈다 — 증명원에도 상호·대표자·사업자번호가 똑같이
         들어 있어 업체관리·기업정보함으로 가는 길은 그대로여야 한다. 가르는 것은 **제목**이다.
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
  /* ⚠ 서버(functions/doc-read.js)의 MODELS 와 «같은 순서»여야 한다.
     2026-09-08 에 하나를 더 세웠다 — 몫은 모델마다 따로라 목록 길이가 곧 하루치다. */
  var MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-3.1-flash-lite'];
  var goodModel = null;   // 한 번 통한 모델을 기억해 헛걸음을 줄인다

  function modelUrl(model, key) {
    return 'https://generativelanguage.googleapis.com/v1beta/models/' +
      model + ':generateContent?key=' + encodeURIComponent(key);
  }

  var NTS_URL = 'https://api.odcloud.kr/api/nts-businessman/v1/status?serviceKey=';

  /* ⚠⚠ 이 목록은 «담아도 되는 갈래»다 — afterRead 가 여기 없는 갈래를 통째로
     'other' 로 떨어뜨린다. 그리고 민감 여부는 **갈래로** 가린다
     (js/pu-photo-store.js 의 SENSITIVE_KINDS · functions/photo-view.js).
     그래서 여기 빠지면 «민감 아님»이 되어 **원본 주소가 만료 없이 사진에 적힌다.**

     실제로 그렇게 당했다 — bankbook(2026-08-31)·idcard·resident·mandate·consent
     (2026-09-01) 다섯을 물음과 민감 목록에는 넣었는데 **이 줄만 안 늘렸다.**
     신분증을 읽어도 갈래가 other 로 굳어, 막으려던 바로 그 일이 그대로 열려 있었다.

     ⚠ 물음(PROMPT_ALL)에 갈래를 더하면 **이 줄을 반드시 함께 늘린다.**
       tests/photos-worker-doc-kinds.test.js 가 둘을 견주어 기계로 막는다. */
  /* ⚠ 한 줄로 둔다 — 검사 넷이 이 줄을 「한 줄 통째」로 뽑아 vm 에 올린다.
     여러 줄로 펼치면 그 검사들이 「구문 오류」로 깨진다. */
  var KINDS = { card: 1, bizreg: 1, sme: 1, payslip: 1, meeting: 1, contract: 1, wcontract: 1, chat: 1, timesheet: 1, cms: 1, bankbook: 1, idcard: 1, resident: 1, mandate: 1, consent: 1, form: 1, other: 1 };

  /* ── 판독기 판 번호 ──
     읽어 둔 결과에 이 번호를 함께 적는다. 가릴 수 있는 종류를 늘리면 번호를
     올리고, 사진첩은 **옛 번호로 읽은 사진을 다시 읽는다.**
     이게 없어서 실제로 당했다(2026-08-06 대표 화면): 회의사진 탭이 0장인데
     기타서류에 6장이 앉아 있었다 — meeting·payslip 을 가르치기 전에 읽혀
     'other' 로 굳은 사진들이었다. 사람이 한 장씩 「다시 판독」을 눌러야만
     풀리는 상태는 자동 분류라고 할 수 없다.
     ⚠ 종류를 늘리거나 프롬프트를 고치면 이 번호를 반드시 올릴 것. */
  var READ_VERSION = 16;  // …/ 11 = 글자 있는 PDF 는 글자로 판독(그림 왕복 없음) / 12 = 통장·계좌(bankbook) 갈래 추가 / 13 = 통장·근로자서류 다섯이 KINDS 에 빠져 other 로 굳던 것을 고침 + 급여명세서 이름 / 14 = 근로계약서(wcontract) 갈래 / 15 = 근로계약서의 임금(사람이 확인해야 산다)

  /* ── 「물음」이 바뀐 판 (대표 결정 2026-08-24) ──
     READ_VERSION 은 **판독기 전체**의 판이다 — 읽는 «길»이 바뀌어도 올라간다.
     그런데 다시 읽기는 «물음이 바뀐 때»만 값이 있다. 둘을 한 번호로 쓰면
     길만 바꿔도 읽어 둔 것 **전부**가 다시 읽을 것이 된다.

     ⚠ 실제로 그렇게 당했다: 11 은 글자 판독을 붙인 것이라 물음이 하나도 안 바뀌었는데,
       읽어 둔 574장(카메라로 찍은 회의사진·명함까지)이 다시 읽을 차례에 들어갔다.
       대부분은 다시 읽어도 «같은 답»이다.

     그래서 물음 판을 따로 센다.
     ⚠ 물음(PROMPT_ALL·MULTI_NOTE·TEXT_NOTE·갈래 목록·칸 이름)을 고치면 **이 번호를**
       올린다. 읽는 길만 손대면 READ_VERSION 만 올린다.

     12 = **통장·계좌(bankbook) 갈래를 더했다**(대표 지시 2026-08-31). 물음이 바뀌었으므로
       올린다 — 그래야 예전에 form·other 로 굳은 통장 사진이 «스스로» 다시 읽혀
       계좌가 잡힌다. 그것이 이 번호가 있는 까닭이다(2026-08-06 회의사진 6장과 같은 일).
     ⚠ 다시 읽기는 화면을 열 때 **세 장씩**만 한다(AUTO_RESTALE_MAX) — 574장 파도가
       한꺼번에 몰아치지 않는다.
     13 = **근로자 서류 넷(신분증·주민등록서류·위임장·동의서)과 급여명세서 이름**
       (대표 지시 2026-09-01). 물음이 바뀌었고, 무엇보다 위 KINDS 구멍 때문에
       그 넷과 통장이 여태 'other' 로 굳어 있다 — 올려야 스스로 다시 읽힌다.
     14 = **근로계약서(wcontract) 갈래**(대표 지시 2026-09-02). 여태 근로자의 근로계약서가
       contract 로 굳어 「사진첩에서 계약서 찾기」(자문계약 창)에 섞여 들어갔다.
       올려야 이미 굳은 것들이 스스로 제자리를 찾는다.
     ⚠ 다시 읽기는 화면을 열 때 세 장씩만 한다(AUTO_RESTALE_MAX). */
  var PROMPT_VERSION = 16;

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
        body: JSON.stringify({ parts: parts, app: appName() })
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
     위 PROMPT_ALL 의 kind=payslip 은 사진첩·기업정보함·업체관리가 함께 쓰는 프롬프트라
     **일부러** 금액을 담지 않는다(이름은 2026-09-01 부터 담는다 — 위 주석 참고). 급여데이터함은
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
    /* ⚠ 보낼 크기부터 줄인다(AI_SEND_EDGE) — 담는 크기를 올려도 요금이 안 오르게 */
    return shrinkAllForAi(dataUrl).then(function (small) {
      var imgs = small
        .map(function (u) { return String(u || '').split(',')[1] || ''; })
        .filter(Boolean);
      if (!imgs.length) return wageFail('사진을 읽을 수 없습니다');

      var parts = imgs.map(function (b64) {
        return { inline_data: { mime_type: 'image/jpeg', data: b64 } };
      });
      parts.push({ text: prompt + (imgs.length > 1 ? MULTI_NOTE : '') });
      return runParts(parts);
    });
  }

  /* 모델·재시도·키 조달·결과 다듬기 — 사진으로 보낼 때와 글자로 보낼 때가
     **똑같이** 쓴다. 두 벌로 두면 한쪽만 고쳐 놓고 다른 쪽은 옛 길로 남는다. */
  function runParts(parts) {

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

  /* ── 글자로 된 표를 판독한다 (대표 결정 2026-08-23) ──
     엑셀·한글·글자 있는 PDF 는 **사진으로 만들지 않는다.** 칸 값이 이미 글자라
     1↔7·4↔9 오독이 있을 수가 없다 — 사진으로 보내면 오히려 나빠진다.
     AI 가 하는 일은 「읽기」가 아니라 **어느 칸이 무엇인가 판단**뿐이다.

     결과 모양은 readWageTable 과 **같게** 맞춘다 — 부르는 쪽(판독 패널·값 만들기)이
     사진에서 온 것과 글자에서 온 것을 갈라 다룰 일이 없어야 한다. */
  var TABLE_PROMPT =
    '아래는 엑셀·한글 문서에서 그대로 뽑아 낸 표 글자입니다(탭으로 칸이 나뉘어 있습니다).\n' +
    '이 글자에서 근로자별 항목·값을 뽑아 JSON 으로만 답하십시오.\n' +
    '{"company":"사업장 이름 또는 빈 문자열","period":"YYYY-MM 또는 빈 문자열",' +
    '"docName":"서류 이름 또는 빈 문자열","rows":[{"name":"근로자 이름",' +
    '"pairs":[{"item":"항목 이름","value":"값"}],"iffy":false}]}\n' +
    '규칙:\n' +
    '- 값은 **글자에 적힌 그대로** 옮기십시오. 고쳐 쓰거나 계산하지 마십시오.\n' +
    '- 항목 이름도 문서에 적힌 그대로 쓰십시오(「기본급」을 「기본임금」으로 바꾸지 마십시오).\n' +
    '- 합계·소계 줄은 사람이 아니므로 담지 마십시오.\n' +
    '- 머리글이 여러 줄이거나 칸이 합쳐져 어느 항목인지 확실치 않으면 그 줄에 iffy:true 를 주십시오.\n' +
    '- 사람 이름을 못 찾으면 rows 를 빈 배열로 두십시오. 억지로 만들지 마십시오.';

  /* ⚠ 지우개(가림 층)를 못 찾으면 **막는다** (대표 지시 2026-08-17).
     예전에는 `if (RM && RM.maskRrnInText)` 라 **없으면 안 지우고 그냥 보냈다** —
     오류도 없고 아무 말도 없었다. 그러면 새 화면이 판독 층만 싣고 가림 층을
     빠뜨렸을 때 **아무도 모르게 새 나간다**(자문관리가 실제로 그 상태였다).
     조용히 새는 것보다 시끄럽게 멈추는 편이 낫다.
     ⚠ 사진 길(read)에는 이 문지기가 없다 — 사진은 화면의 가림 창이 맡는다.
       그쪽 울타리는 검사(tests/read-fence-apps.test.js)가 따로 지킨다. */
  function rrnScrub(body) {
    var RM = global.PuRrnMask;
    if (!RM || !RM.maskRrnInText) return null;      // null = 막는다
    return RM.maskRrnInText(body).text;
  }
  var NO_SCRUB = '주민번호 지우개(js/pu-rrn-mask.js)가 이 화면에 실려 있지 않아 판독을 멈췄습니다'
    + ' — 그대로 보내면 주민번호가 AI 로 나갑니다. 화면에 가림 층을 실어 주세요.';

  function readTableText(text, hint) {
    if (!deps.fetch) return Promise.resolve(wageFail('판독 준비가 되지 않았습니다'));
    var body = String(text == null ? '' : text).trim();
    /* 빈 글자로 AI 를 부르면 헛돈이고, 답도 쓸 수 없다 */
    if (!body) return Promise.resolve(wageFail('읽을 글자가 없습니다 — 빈 시트이거나 글자가 없는 파일입니다'));
    /* ⚠ 마지막 문지기 — 주민번호를 여기서 한 번 더 지운다. 부르는 쪽에서
       지우는 것을 잊어도 AI 로는 안 나가게 한다(사진 가림과 같은 원칙:
       문지기가 한 곳뿐이면 그 한 곳을 빠뜨렸을 때 그대로 나간다).
       글자는 사진과 달리 **자리를 틀릴 일이 없다.** */
    body = rrnScrub(body);
    if (body === null) return Promise.resolve(wageFail(NO_SCRUB));
    var where = String(hint || '').trim();
    var prompt = TABLE_PROMPT
      + (where ? '\n\n[이 글자는 여기서 뽑았습니다: ' + where + ']' : '')
      + '\n\n=== 표 글자 시작 ===\n' + body + '\n=== 표 글자 끝 ===';
    return runParts([{ text: prompt }]);
  }

  /* ══════ 한 줄 요약 (대표 지시 2026-08-29) ══════
     대표: 「첨부메일을 자동으로 인식해서 어떤 내용인지 요약정리」

     대기 칸에 자료가 예순 건 넘게 쌓이는데, 무엇인지 알려면 **하나씩 열어 봐야**
     했다. 파일 이름이 「직현병국퇴.pdf」·「@@근로계약서(2026)-텃골팜--.xls」 같아서
     이름만으로는 아무것도 알 수 없다.

     ⚠ 표를 뽑는 것(readTableText)과 **다른 일**이다. 그것은 사람별 금액을 값으로
       만드는 무거운 일이고, 이것은 「무엇인가」 한 줄이다. 프롬프트도 답도 작다.
     ⚠ 값으로 쓰지 않는다 — **보고 고르는 데만** 쓴다. 그래서 틀려도 자료가
       망가지지 않는다. 그 대신 사람 이름·금액을 **지어내지 말라**고 못 박는다. */
  var SUM_PROMPT =
    '아래는 급여 업무 서류에서 그대로 뽑아 낸 글자입니다.\n' +
    '이것이 **무슨 서류인지** 한 줄로 알려 주십시오. JSON 으로만 답하십시오.\n' +
    '{"sum":"한 줄 요약","kind":"ledger|attend|contract|output|etc",' +
    '"month":"YYYY-MM 또는 빈 문자열","company":"사업장 이름 또는 빈 문자열",' +
    '"people":0,"amount":"총액이 뚜렷하면 그대로, 아니면 빈 문자열"}\n' +
    '규칙:\n' +
    '- sum 은 **40자 안쪽 한 줄**. 예) 「8월 급여대장 · 12명」 「근로계약서 1부 · 박선희」\n' +
    '- kind: 급여대장=ledger, 근태·출근부=attend, 근로계약서=contract,\n' +
    '  명세서·이체·신고·원천징수=output, 그 밖=etc\n' +
    '- **글자에 없는 것은 지어내지 마십시오.** 모르면 빈 문자열, 사람 수는 0.\n' +
    '- people 은 표에 든 **근로자 줄 수**입니다. 합계 줄은 세지 마십시오.\n' +
    '- 주민등록번호·계좌번호는 답에 **옮기지 마십시오.**';

  function summarizeText(text, hint) {
    if (!deps.fetch) return Promise.resolve({ ok: false, error: '판독 준비가 되지 않았습니다' });
    var body = String(text == null ? '' : text).trim();
    if (!body) return Promise.resolve({ ok: false, error: '읽을 글자가 없습니다' });
    /* ⚠ 마지막 문지기 — 표 판독과 같은 자리에서 주민번호를 지운다.
       요약이라고 덜 지키면 안 된다(나가는 것은 똑같다).
       지우개가 없으면 **막는다**(2026-08-17) — 요약도 나가는 것은 똑같다. */
    body = rrnScrub(body);
    if (body === null) return Promise.resolve({ ok: false, error: NO_SCRUB });
    /* 요약은 앞부분만 봐도 된다 — 통째로 보내면 느리고 그대로 요금이다 */
    if (body.length > SUM_MAX) body = body.slice(0, SUM_MAX) + '\n…(뒤는 줄임)';
    var where = String(hint || '').trim();
    var prompt = SUM_PROMPT
      + (where ? '\n\n[이 글자는 여기서 뽑았습니다: ' + where + ']' : '')
      + '\n\n=== 글자 시작 ===\n' + body + '\n=== 글자 끝 ===';
    return runSum([{ text: prompt }]);
  }

  var SUM_MAX = 6000;

  /* 요약은 표 판독과 **배관은 같고 뒤처리만 다르다** — afterWageRead 를 안 탄다
     (사업자번호 조회·되메우기는 요약에 쓸데없고 그만큼 느리다). */
  function runSum(parts) {
    var after = function (j) {
      var p = parseReply(j);
      if (!p) return { ok: false, error: 'AI가 알아볼 수 없는 답을 보냈습니다' };
      var n = Number(p.people || 0);
      return {
        ok: true,
        sum: String(p.sum || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 80),
        kind: String(p.kind || ''),
        month: /^\d{4}-\d{2}$/.test(String(p.month || '')) ? String(p.month) : '',
        company: String(p.company || '').trim().slice(0, 60),
        people: (n > 0 && n < 10000) ? n : 0,
        amount: String(p.amount || '').trim().slice(0, 40)
      };
    };
    var fail = function (e) {
      return { ok: false, error: (e && e.message) || String(e) };
    };
    if (useProxy()) return askProxy(parts).then(after).catch(fail);
    var keyP = deps.getKey ? Promise.resolve().then(deps.getKey) : Promise.resolve('');
    return keyP.catch(function () { return ''; }).then(function (key) {
      if (!key) return { ok: false, error: 'AI 키가 없습니다 — 포털 설정에서 등록해 주세요' };
      return askAny(key, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: parts }], generationConfig: { temperature: 0 } })
      }).then(after).catch(fail);
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

  /* ══════ AI 에게 «보낼 크기» 상한 (대표 결정 2026-08-30) ══════
     담는 크기와 보내는 크기는 **다른 물건**이다.

     · 담는 크기 = 사람이 확대해서 읽는다 → 클수록 좋다(서류 2600px).
     · 보내는 크기 = AI 가 읽는다 → **큰 만큼 그대로 요금**이다.

     AI 는 그림을 768px 조각으로 나눠 세어 값을 매긴다. A4 를 2000px 로 보내면
     6조각이고 2600px 로 보내면 12조각이다 — **판독 한 번 값이 두 배**가 된다.
     지금까지 잘 읽히던 크기가 2000px 이므로 여기서 끊는다. 담는 크기를 올려도
     **판독 요금은 그대로**다.

     ⚠ 이 상한이 없으면, 담는 크기를 올리는 순간 판독 요금이 조용히 따라 오른다 —
       사진첩·기업정보함·급여데이터함이 모두 이 층으로 판독한다.
     ⚠ 이미 작은 것은 **키우지 않는다.** 키워 봐야 없던 글자가 생기지 않고 값만 는다.
     ⚠ 줄일 수 없는 자리(노드 검사 등)에서는 **그대로 보낸다** — 못 줄인다고
       판독 자체가 막히면 안 된다. */
  var AI_SEND_EDGE = 2000;

  function shrinkForAi(dataUrl) {
    var u = String(dataUrl || '');
    if (!u) return Promise.resolve(u);
    if (typeof document === 'undefined' || typeof Image === 'undefined') return Promise.resolve(u);
    return new Promise(function (res) {
      var im = new Image();
      im.onload = function () {
        try {
          var w = im.naturalWidth || im.width, h = im.naturalHeight || im.height;
          var edge = Math.max(w, h);
          if (!edge || edge <= AI_SEND_EDGE) return res(u);      // 이미 작다 — 그대로
          var k = AI_SEND_EDGE / edge;
          var c = document.createElement('canvas');
          c.width = Math.round(w * k); c.height = Math.round(h * k);
          var x = c.getContext('2d');
          x.imageSmoothingQuality = 'high';
          x.drawImage(im, 0, 0, c.width, c.height);
          res(c.toDataURL('image/jpeg', 0.92));
        } catch (_) { res(u); }
      };
      im.onerror = function () { res(u); };             // 못 읽으면 그대로 보낸다
      im.src = u;
    });
  }

  function shrinkAllForAi(dataUrl) {
    var list = Array.isArray(dataUrl) ? dataUrl : [dataUrl];
    return Promise.all(list.map(shrinkForAi));
  }

  function readChangeNotice(dataUrl) {
    return readPairsWith(NOTICE_PROMPT, dataUrl);
  }

  function read(dataUrl) {
    if (!deps.fetch) return Promise.resolve(fail('판독 준비가 되지 않았습니다'));
    /* ⚠ 보낼 크기부터 줄인다(AI_SEND_EDGE) — 담는 크기를 올려도 요금이 안 오르게 */
    return shrinkAllForAi(dataUrl).then(function (small) {
      /* 한 장이면 그대로, 여러 장이면 **한 문서의 여러 쪽**으로 본다. */
      var imgs = small
        .map(function (u) { return String(u || '').split(',')[1] || ''; })
        .filter(Boolean);
      if (!imgs.length) return fail('사진을 읽을 수 없습니다');

      var parts = imgs.map(function (b64) {
        return { inline_data: { mime_type: 'image/jpeg', data: b64 } };
      });
      parts.push({ text: PROMPT_ALL + (imgs.length > 1 ? MULTI_NOTE : '') });
      return runDocParts(parts, 'image');
    });
  }

  /* ── 글자로 된 서류를 판독한다 (대표 결정 2026-08-24) ──
     "글자 있는 PDF 는 글자로" — 홈택스·정부포털이 «만들어 준» PDF 는 안에 글자가
     그대로 있다. 실데이터에서 사진첩 서류의 65%(382/585)가 사업자등록증(명)이었다.
     그것을 3배 배율 그림(한 쪽 831KB)으로 바꿔 AI 에게 「읽어라」 하던 것을 그만둔다.

     ⚠ 무엇이 나아지나
       · 판독할 때마다 그림을 내려받지 않는다 — 되풀이 판독이 비용의 큰 몫이었다.
       · AI 입력이 한 쪽 3,000토큰 → 500~1,500토큰.
       · **1↔7 · 4↔9 오독이 원천적으로 없다.** 글자는 이미 정확하다.
       · 쪽수 제한이 사실상 없다 — 그림은 여러 장을 한 번에 넣으면 뒤쪽을 못 본다.
     ⚠ 물음(PROMPT_ALL)은 **그대로 쓴다.** 갈래 목록·칸 이름·제목 규칙·pairs 규칙을
       두 벌로 두면 한쪽만 고쳐 놓고 다른 쪽은 옛 규칙으로 남는다. 앞머리가 「이
       이미지가」로 시작하므로, 그것이 아래 글자를 가리킨다고 한 줄로 바로잡는다.
     ⚠ 주민번호는 여기서 한 번 더 지운다 — 부르는 쪽에서 잊어도 AI 로는 안 나가게
       (readTableText 와 같은 「마지막 문지기」 원칙). 글자는 사진과 달리 자리를
       틀릴 일이 없어 지우는 것이 안전하다. */
  var TEXT_NOTE =
    '\n\n⚠ 위에서 「이미지」라고 한 것은 아래 글자를 말합니다 — 이 서류에서 **그대로 뽑아 낸 글자**입니다(그림이 아닙니다).' +
    ' 글자는 이미 정확하므로 고쳐 쓰거나 지어내지 마십시오.' +
    ' 여러 쪽이면 「--- N쪽 ---」 로 나뉘어 있고, 쪽마다 따로 답하지 말고 **전체를 함께 읽어 한 벌의 JSON**만 주세요.';

  /* ═══ 「내 사전으로 읽어 달라」 ═══════════════════════════════════════
     경력관리처럼 «서류 종류마다 사전이 다른» 앱을 위한 입구다.
     사전만 밖에서 받고, 나머지(사진 줄이기·모델 물러서기·서버 대리인·여러 쪽)는
     이 층이 하던 그대로 한다.

     prompt : 부르는 쪽의 판독 사전(무엇을 어떤 JSON 으로 답할지)
     imgs   : dataURL 한 장 또는 여러 장. 여러 장이면 «한 문서의 여러 쪽»으로 읽는다.
              ⚠ 이것이 핵심이다 — 경력증명서가 2장이면 2장을 함께 봐야 한다.
     opts.mime : 그림이 아닌 것(PDF 원본 등)을 그대로 보낼 때의 종류

     돌려주는 것: { ok:true, data:{…AI 가 준 JSON…} } 또는 { ok:false, why:'한국어' }

     ⚠ afterRead(사업자번호 검증·국세청 조회)를 타지 않는다 — 경력관리가 읽는 것은
       명함·사업자등록증이 아니라 위촉장·경력증명서다. 검증할 번호가 없다.
     ⚠ 저장하지 않는다. 이 층의 원칙 그대로다. */
  function readWithPrompt(prompt, imgs, opts) {
    opts = opts || {};
    if (!deps.fetch) return Promise.resolve({ ok: false, why: '판독 준비가 되지 않았습니다' });
    var p = String(prompt == null ? '' : prompt).trim();
    if (!p) return Promise.resolve({ ok: false, why: '판독 사전이 없습니다' });
    var list = Array.isArray(imgs) ? imgs.slice() : [imgs];
    list = list.filter(function (u) { return u; });
    if (!list.length) return Promise.resolve({ ok: false, why: '읽을 것이 없습니다' });

    /* 그림이면 보내기 전에 줄인다 — 담는 크기를 올려도 요금이 안 오르게.
       그림이 아닌 것(PDF 원본)은 줄일 수 없으니 그대로 간다. */
    var 그림 = !opts.mime || opts.mime.indexOf('image/') === 0;
    var prep = 그림 ? shrinkAllForAi(list) : Promise.resolve(list);

    return prep.then(function (small) {
      var parts = [{ text: p }];
      small.forEach(function (u) {
        var str = String(u || '');
        var b64 = str.indexOf(',') >= 0 ? str.split(',')[1] : str;
        if (!b64) return;
        var mt = opts.mime || (/^data:([^;,]+)/.exec(str) || [])[1] || 'image/jpeg';
        parts.push({ inline_data: { mime_type: mt, data: b64 } });
      });
      if (parts.length < 2) return { ok: false, why: '읽을 것이 없습니다' };
      return runRawParts(parts);
    }).catch(function (e) {
      return { ok: false, why: (e && e.message) || String(e) };
    });
  }

  /* 답을 «그대로» 돌려주는 길 — runDocParts 와 달리 afterRead 를 안 탄다 */
  function runRawParts(parts) {
    var 마무리 = function (j) {
      var parsed = parseReply(j);
      if (!parsed) return { ok: false, why: 'AI 가 표 모양(JSON)으로 답하지 않았습니다' };
      return { ok: true, data: parsed };
    };
    if (useProxy()) {
      return askProxy(parts).then(마무리).catch(function (e) {
        return { ok: false, why: (e && e.message) || String(e) };
      });
    }
    var keyP = deps.getKey ? Promise.resolve().then(deps.getKey) : Promise.resolve('');
    return keyP.catch(function () { return ''; }).then(function (key) {
      if (!key) return { ok: false, why: '로그인을 확인해 주세요' };
      return askAny(key, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: parts }], generationConfig: { temperature: 0 } })
      }).then(마무리);
    }).catch(function (e) {
      return { ok: false, why: (e && e.message) || String(e) };
    });
  }

  function readDocText(text) {
    if (!deps.fetch) return Promise.resolve(fail('판독 준비가 되지 않았습니다'));
    var body = String(text == null ? '' : text).trim();
    /* 빈 글자로 AI 를 부르면 헛돈이고 답도 쓸 수 없다 — 부르는 쪽이 그림으로 가야 한다. */
    if (!body) return Promise.resolve(fail('읽을 글자가 없습니다'));
    body = rrnScrub(body);
    if (body === null) return Promise.resolve(fail(NO_SCRUB));
    return runDocParts([{ text: PROMPT_ALL + TEXT_NOTE + '\n\n' + body }], 'text');
  }

  /* 모델·재시도·키 조달·결과 다듬기 — 사진으로 보낼 때와 글자로 보낼 때가 **똑같이**
     쓴다. 두 벌로 두면 한쪽만 고쳐 놓고 다른 쪽은 옛 길로 남는다. */
  function runDocParts(parts, via) {
    /* 서버 대리인이 있으면 열쇠를 아예 안 챙긴다(2026-08-17) */
    if (useProxy()) {
      return askProxy(parts).then(function (j) {
        var parsed = parseReply(j);
        if (!parsed) throw new Error('AI가 알아볼 수 없는 답을 보냈습니다');
        return afterRead(parsed, via);
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
        return afterRead(parsed, via);
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
  /* via = 어느 길로 읽었나('text' 글자 / 'image' 그림). 결과에 함께 남긴다
     (대표 결정 2026-08-24) — 「글자가 있는데 그림으로 읽어 둔 것」만 골라 다시 읽는
     데 쓴다. 이 한 글자가 없으면 다시 읽을 값이 있는 것과 없는 것을 가릴 수 없어,
     판 번호를 올릴 때마다 읽어 둔 것 «전부»가 다시 읽힌다. */
  /* ── pairs 에만 담긴 값을 «이름 붙은 칸»으로 되메운다 (2026-08-26) ──

     대표 캡처의 실사례: 「4·4 제도 도입기업 선정 신청서」(성진테크)에서 화면에는
     사업자등록번호 204-81-33738 이 **또렷이 보이는데** 그 아래에는
     「사업자번호를 읽지 못해 기업 상세로 보낼 수 없습니다」가 떴다.

     까닭 — 판독 표는 pairs(문서에 적힌 차례 그대로)를 그리고, 「기업 상세로 보내기」는
     이름 붙은 칸(fields.bizno)을 본다. AI 가 **pairs 에만 담고 이름 붙은 칸을 비워 두면**
     사람 눈에는 있는 값이 프로그램에는 없는 것이 된다 — 화면이 스스로 모순된 말을 한다.
     지시문은 「이름 붙은 칸에 담은 것도 pairs 에 다시 담아라」고만 하고, 그 **반대**는
     시키지 않는다. 그래서 한쪽만 채워지는 일이 실제로 났다(서식 25장 가운데 5장).

     ⚠ 다시 판독하지 «않고» 고친다 — 판 번호를 올리면 읽어 둔 사진 수백 장이 다시
       읽히고 그것이 그대로 요금이다. 이 되메우기는 **읽어 둔 결과에도** 걸린다.
     ⚠ **비어 있는 칸만** 채운다. AI 가 담은 값을 덮으면 안 된다 —
       pairs 는 문서 표기 그대로라, 이름 붙은 칸이 더 다듬어져 있을 수 있다.
     ⚠ 채운다고 「검증 통과」가 되는 것은 아니다. 되메운 뒤에 검산(bizNoValid)을
       그대로 다시 돌린다 — 「기계 검증 통과분만 자동 입력」이라는 규칙은 그대로다. */
  var PAIR_TO_KEY = {
    사업자등록번호: 'bizno', 사업자번호: 'bizno', 사업자등록번호칸: 'bizno',
    법인등록번호: 'corpno', 법인번호: 'corpno',
    기업명: 'company', 업체명: 'company', 회사명: 'company', 상호: 'company',
    사업장명: 'company', 기관명: 'company', 사업체명: 'company', 법인명: 'company',
    대표자: 'ceo', 대표자명: 'ceo', 대표: 'ceo', 대표이사: 'ceo', 성명대표: 'ceo',
    주소: 'address', 소재지: 'address', 사업장소재지: 'address', 사업장주소: 'address',
    전화: 'companyTel', 전화번호: 'companyTel', 연락처: 'companyTel',
    대표번호: 'companyTel', 대표전화: 'companyTel',
    팩스: 'companyFax', 팩스번호: 'companyFax',
    홈페이지: 'homepage', 누리집: 'homepage',
    설립일: 'openDate', 설립일자: 'openDate', 개업일: 'openDate', 개업연월일: 'openDate',
    /* ⚠ 발급일은 openDate 로 보내면 «안 된다» — 개업일을 덮어쓴다.
         등록증 아래 날짜 줄이 pairs 에 「발급일」로 잡히는 일이 있어 여기도 이어 둔다. */
    발급일: 'issueDate', 발급일자: 'issueDate', 교부일: 'issueDate', 교부일자: 'issueDate',
    업태: 'bizType', 업종: 'bizItem', 종목: 'bizItem',
    주생산품: 'product', 주생산품목: 'product',
    매출액: 'sales', 직전년도매출액: 'sales', 전년도매출액: 'sales',
    상시근로자수: 'workers', 근로자수: 'workers', 상시근로자: 'workers',
    이메일: 'email', 전자우편: 'email',
    담당자: 'name', 담당자명: 'name',
    직위: 'title', 직책: 'title',
    휴대폰: 'mobile', 휴대전화: 'mobile', 휴대폰번호: 'mobile'
  };
  /* 되메우기를 하는 갈래 — 위 칸 이름들을 실제로 갖고 있는 것만.
     명함(card)은 칸 이름이 달라 섞으면 엉뚱한 자리에 들어간다. */
  var PAIR_FILL_KINDS = { form: 1, bizreg: 1, sme: 1, contract: 1 };

  /* 「업태(대표)」·「주소 (지역)」·「상시 근로자수」처럼 꾸밈이 붙은 이름을 맞춘다.
     괄호 안·빈칸·점·콜론을 떼고 견준다 — 문서마다 표기가 조금씩 다르다. */
  function pairKeyName(k) {
    return String(k == null ? '' : k)
      .replace(/\([^)]*\)/g, '')
      .replace(/[\s·:.\-_/]/g, '');
  }

  function fillFromPairs(kind, fields) {
    if (!PAIR_FILL_KINDS[kind]) return [];
    var pairs = Array.isArray(fields && fields.pairs) ? fields.pairs : [];
    if (!pairs.length) return [];
    var filled = [];
    pairs.forEach(function (p) {
      var key = PAIR_TO_KEY[pairKeyName(p && p.k)];
      if (!key) return;
      var val = (p && p.v == null) ? '' : String(p.v).trim();
      if (!val || val === '-') return;                  // 「-」는 문서에서 «없음»을 뜻한다
      if (String(fields[key] == null ? '' : fields[key]).trim()) return;   // 이미 있으면 안 덮는다
      fields[key] = val;
      filled.push(key);
    });
    return filled;
  }

  /* 이미 저장된 판독 결과를 그 자리에서 고친다(다시 안 읽는다).
     ⚠ 저장소에 다시 쓰지 «않는다» — 화면이 쓸 때마다 고쳐 쓰면 남의 수정과 부딪히고,
       사진 수백 장에 쓰기가 그만큼 늘어난다. 읽어 온 것을 그때그때 다듬을 뿐이다. */
  function healRead(read) {
    if (!read || read.error || !read.fields) return [];
    var had = String(read.fields.bizno || '').trim();
    var filled = fillFromPairs(read.kind, read.fields);
    if (!filled.length) return filled;
    /* 사업자번호가 «새로» 생겼으면 검산해서 자동 입력 규칙에 태운다.
       원래 있던 번호의 판정은 건드리지 않는다 — 국세청 조회까지 거친 값일 수 있다. */
    if (!had && read.fields.bizno) {
      read.fields.bizno = fmtBizNo(read.fields.bizno);
      read.bizNoOk = bizNoValid(read.fields.bizno);
    }
    return filled;
  }

  function afterRead(parsed, via) {
    var kind = KINDS[parsed.kind] ? parsed.kind : 'other';
    var fields = {};
    for (var k in parsed) {
      if (!Object.prototype.hasOwnProperty.call(parsed, k) || k === 'kind') continue;
      var v = parsed[k];
      if (v === undefined || v === null || String(v).trim() === '') continue;
      fields[k] = typeof v === 'string' ? v.trim() : v;
    }
    /* pairs 에만 담긴 값을 이름 붙은 칸으로 옮긴다 — 아래 검산보다 «먼저» 해야
       되메운 사업자번호도 검산을 받는다. */
    fillFromPairs(kind, fields);

    var out = { kind: kind, fields: fields, bizNoOk: null, ntsChecked: false, ntsState: null,
                error: null, via: (via === 'text' ? 'text' : 'image') };

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
     ⚠ **이제 안 얻는다** (2026-08-17). 열쇠는 금고(Secret Manager)에 있고 서버만 안다.
       예전에는 ①이 기기 ②기업정보함 공유 자리 ③포털 공용 설정 순으로 가져왔는데,
       ②③은 규칙상 **로그인한 모든 직원이 읽는** 자리였다 — 그것이 구멍이었다.
       그 자리들의 열쇠는 지웠고, 여기서 읽던 코드도 함께 걷어냈다.
     국세청 키(getNtsKey)는 판독과 무관하고 자리도 다르므로 그대로 둔다. */

  function readOnce(db, path) {
    if (!db) return Promise.resolve('');
    try {
      return db.ref(path).once('value')
        .then(function (s) { return (s && s.val()) || ''; })
        .catch(function () { return ''; });   // 권한이 없어도 조용히 넘어간다
    } catch (e) { return Promise.resolve(''); }
  }

  /* 판독 대리인 주소 — 서버 함수가 사는 곳.
     ⚠ 앱마다 적으면 한쪽만 고쳐진다. 여기 한 곳에만 둔다.
       (다른 서버 함수들과 같은 프로젝트·지역: asia-northeast3 / pureun-erp) */
  var READ_DOC_URL = 'https://asia-northeast3-pureun-erp.cloudfunctions.net/readDoc';
  /* 글자만 뽑는 대리인 — Google Vision (2026-09-08 대표 물음 「무료 OCR 이 더 있나」).
     ★ 몫이 Gemini 와 «따로»다(달마다 1,000장) — 하루 몫이 떨어진 날의 뒷길이다.
     ★ Vision 은 «글자만» 준다 — 칸을 채우는 것은 부르는 쪽 파서의 일이다.
     ⚠ 열쇠는 서버가 든다. 브라우저에 두면 누구나 복사한다(enter.html 이 그렇게 적어 두었다). */
  var READ_VISION_URL = 'https://asia-northeast3-pureun-erp.cloudfunctions.net/readVision';

  /* 사진 몇 장에서 «글자만» 뽑아 온다. 실패하면 throw 하고, 부르는 쪽은
     브라우저 판독(Tesseract)으로 물러선다 — 그 길을 막지 않는다.
     ⚠ 열쇠가 아직 없으면 서버가 503 으로 「아직 등록되지 않았습니다」라고 말한다.
       그것을 «고장»으로 다루지 말 것 — 물러설 길이 있다는 뜻이다. */
  function visionText(imgs, app) {
    var list = Array.isArray(imgs) ? imgs : [imgs];
    return Promise.resolve().then(deps.getToken).then(function (token) {
      if (!token) throw new Error('로그인을 확인해 주세요');
      return deps.fetch(READ_VISION_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ images: list, app: app || appName() })
      });
    }).then(function (r) {
      return (r && r.json ? r.json() : Promise.resolve(null)).catch(function () { return null; })
        .then(function (j) {
          if (r && r.ok && j && j.ok) return String(j.text || '');
          var status = (j && j.status) || (r && r.status) || 0;
          var e = new Error((j && j.error) || ('Vision이 응답하지 않습니다 (오류 ' + status + ')'));
          e.status = status;
          throw e;
        });
    });
  }

  /* ── 판독을 어떻게 부르는가 (2026-08-17) ──
     ⚠ 예전에는 여기서 **AI 열쇠를 브라우저로 가져왔다.** 그런데 그 열쇠는
       실시간DB 에 평문으로 있고 규칙상 로그인한 모든 직원이 읽는다 —
       꺼내 개인 용도로 써도 요금은 회사에 붙었다. 게다가 `AQ.` 로 시작하는
       AI 스튜디오 열쇠라 **자물쇠(웹사이트 제한)를 채울 방법도 없다**(확인 완료).
       그래서 **서버가 대신 부르고 브라우저는 열쇠를 아예 모른다.**

     ⚠ **열쇠를 «가져다 주는» 자리를 없앴다** (2026-08-17 마무리).
       네 앱을 다 옮기고, 열쇠를 금고(Secret Manager)에 넣고, 실시간DB 의 열쇠
       (`pucards/config/geminiKey`)를 지운 뒤다. 서버 기록에서 `keySource secret` 과
       판독 200 을 눈으로 확인하고 지웠다.

       ⚠ **되살리지 말 것.** 여기서 열쇠를 돌려주면 그 순간 열쇠가 다시 브라우저로
         내려온다 — 이틀 동안 막은 것이 바로 그것이다. 서버가 죽으면 판독이
         **안 되는 것이 맞다.**

       ⚠ 판독 함수 안에는 「열쇠를 받으면 직접 부르는」 옛 갈래가 코드로는 아직 남아
         있다(deps.getKey). **아무 화면도 그것을 안 넘기므로 돌지 않는다** —
         검사가 그 둘(여기서 안 주는 것 · 화면이 안 넘기는 것)을 못 박는다.
         갈래 자체는 여러 검사가 「열쇠를 주면 어떻게 되는가」를 재는 데 쓰고 있어
         남겨 둔다(지우면 검사 50여 곳이 함께 죽는다). */
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
      /* getKey 는 **일부러 안 준다** — 위 설명 참고. 실시간DB 의 열쇠도 지웠으므로
         되살려도 빈 값만 온다. 국세청 열쇠(getNtsKey)는 판독과 무관해 그대로 둔다. */
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
    /* 회의·현장 사진은 잘 읽힌 것이다 — 다만 기업정보함에 넣을 것이 없다.
       '확인 필요'로 잡으면 할 일이 아닌 것이 할 일 목록에 쌓인다. */
    if (r.kind === 'meeting') return { auto: false, why: '회의·현장 사진입니다 — 기업정보함에 넣을 것이 없습니다', done: true };
    /* 급여서류는 분류만 하고 어디에도 보내지 않는다.
       done: true — 넣을 곳이 없는 것은 **할 일이 아니다.** 이것이 없으면
       올릴 때마다 「확인 필요」가 쌓여, 치울 수 없는 할 일이 목록을 못 믿게 만든다
       (2026-08-04 "확인 필요 오류가 계속 나온다" 와 같은 종류의 문제). */
    if (r.kind === 'payslip') return { auto: false, why: '급여서류입니다 — 사진첩에만 보관합니다', done: true };
    /* 계약서도 기업정보함·업체관리로 보내지 않는다 — 상대 업체는 이미 명함으로 들어와 있고,
       계약서에서 만든 업체는 이름만 있는 빈 껍데기가 되어 같은 회사가 두 벌 쌓인다.
       done: true — 넣을 곳이 없는 것은 할 일이 아니다(급여서류와 같은 이유). */
    if (r.kind === 'contract') return { auto: false, why: '계약서입니다 — 사진첩에만 보관합니다', done: true };
    /* 대화 캡처도 기업정보함·업체관리로 보내지 않는다 — 요약·할 일이 사진에 붙어
       그 자리에서 일하는 물건이다. done: true — 넣을 곳이 없는 것은 할 일이 아니다. */
    if (r.kind === 'chat') return { auto: false, why: '대화 캡처입니다 — 요약과 할 일을 뽑아 두었습니다', done: true };
    /* 근태표도 기업정보함·업체관리로 보내지 않는다 — 표로 정리해 확인·엑셀로 내리는
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
    /* 이미 읽어 둔 결과를 **다시 판독하지 않고** 고친다 — pairs 에만 담긴 값을
       이름 붙은 칸으로 옮기고, 그때 사업자번호가 새로 생겼으면 검산도 다시 한다.
       돌려주는 것: 채운 칸 이름 배열(빈 배열이면 손댄 것이 없다). */
    healRead: healRead,
    MODELS: MODELS,
    PROMPTS: { all: PROMPT_ALL },
    READ_VERSION: READ_VERSION,
    PROMPT_VERSION: PROMPT_VERSION,
    read: read,
    /* 서류 종류마다 사전이 다른 앱을 위한 입구(경력관리) — 위 설명 참고 */
    readWithPrompt: readWithPrompt,
    readDocText: readDocText,
    appName: appName, APP_KO: APP_KO,   /* ⑤ 앱별 판독 셈 — 검사가 이것을 겨눈다 */
    visionText: visionText,    /* 글자만 뽑기 — 몫이 Gemini 와 따로다 (2026-09-08) */
    readWageTable: readWageTable,
    readTableText: readTableText,
    summarizeText: summarizeText,
    SUM_MAX: SUM_MAX,
    readChangeNotice: readChangeNotice,
    autoOk: autoOk,
    /* 검사 전용 — 바깥 함수들은 실패를 한국어 글로 감싸 버려서, 서버가 준
       **상태 숫자**가 살아 있는지 확인할 길이 없다. 그 안쪽을 열어 둔다.
       ⚠ 앱에서 부르지 말 것. */
    _askProxyForTest: function (parts) { return askProxy(parts); },
    /* 판독 결과를 다듬는 마지막 단계. 검사가 **진짜 그대로** 돌려 보라고 낸 통로다.
       ⚠ 예전에는 검사들이 이 함수의 «본문만 베어» 따로 돌렸다. 그러다 이 함수가
         옆 함수(fillFromPairs)를 부르기 시작하자, 코드는 멀쩡한데 검사 셋이
         한꺼번에 「없는 함수」로 넘어졌다(2026-08-26). 베지 말고 여기로 부른다. */
    _afterReadForTest: function (parsed, via) { return afterRead(parsed, via); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
