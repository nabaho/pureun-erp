'use strict';
// 푸른노무법인 경력관리 — 기관 양식(HWPX) 자동 채움 모듈
// (브라우저 window.KcareerHwpxFill / Node module.exports 겸용, DOM 미사용 — XML 문자열만 다룬다)
// 설계서: docs/superpowers/specs/2026-08-27-kcareer-양식자동채움-design.md
//
// 무엇을 하나: 표에서 「성명」「연락처」 같은 라벨 칸을 알아보고 바로 옆 빈 칸에 값을 넣는다.
// 학력·경력처럼 머리행이 있는 목록 표는 아래 빈 행에 한 줄씩 채운다.
// ⚠ 글자가 한 자라도 있는 칸은 절대 덮지 않는다. 행을 새로 만들지도 않는다(v1).
(function (root) {

  /* ===== 라벨 사전 =====
     양식마다 칸 이름이 다르다(성명/이름/신청자). 공백·괄호·별표는 떼고 본다. */
  var FIELD_LABELS = [
    /* ⚠ 사람 이름이 들어갈 칸은 양식마다 부르는 말이 다르다 — 위원·강사·심사위원…
       못 알아보면 «이름부터» 비어 나가므로 여기가 가장 값이 크다. */
    { re: /^(성명|이름|신청자명?|신청인|성함|성명한글|한글성명|위촉대상자|추천인|대상자|위원명|강사명|자문위원|심사위원|평가위원|응시자|지원자|참여자|작성자|피추천인|본인성명|대표자명?)$/, key: 'name' },
    { re: /^(한자|한자성명|성명한자|한문성명|성명한문)$/, key: 'nameHanja' },
    { re: /^(영문|영문성명|영문이름|성명영문|영문명|성명영문여권상|영문성명여권상)$/, key: 'nameEng' },
    { re: /^(생년월일|생일|출생연월일|생년월일주민번호|출생일|생년월일만나이|생년월일연령|생년월일나이)$/, key: 'birth' },
    { re: /^(성별|성별구분)$/, key: 'gender' },
    { re: /^(연락처|전화번호?|휴대폰|핸드폰|휴대전화|이동전화|hp|연락처1|휴대전화번호|핸드폰번호|이동전화번호|개인연락처|본인연락처|연락처휴대폰|휴대폰번호)$/i, key: 'phone' },
    /* 번호를 갈라 담게 되면서(2026-08-30) 라벨도 갈라 본다 —
       전에는 번호 칸이 하나뿐이라 「자택」·「사무실」이 칸 안 라벨로만 있었다. */
    { re: /^(자택전화|자택전화번호|집전화)$/, key: 'phoneHome' },
    { re: /^(사무실전화|직장전화|회사전화|사무실전화번호|근무처전화|사무실번호|직장연락처|근무처연락처|사무소전화|회사연락처)$/, key: 'phoneWork' },
    { re: /^(팩스|팩스번호|fax)$/i, key: 'fax' },
    { re: /^(이메일|전자우편|e-?mail|메일주소|이메일주소|전자메일|e메일|메일)$/i, key: 'email' },
    { re: /^(주소|현주소|거주지|자택주소|주민등록주소|자택주소지|주소지|현거주지|우편물수령지|우편물수령주소|서류수령주소|송달주소)$/, key: 'addr' },
    { re: /^(회사주소|사무실주소|직장주소|근무지주소|근무처주소|사무소주소|근무처소재지|사업장주소|사무실소재지)$/, key: 'addrWork' },
    /* ⚠ 「자격증명」은 넣지 말 것 — 자격증 «목록 표»의 머리칸 이름이다.
       넣으면 그 머리칸 옆(첫 줄 첫 칸)에 자격 한 줄이 박혀 남의 표를 어지럽힌다. */
    { re: /^(자격증?|보유자격|자격사항|자격면허|자격\/면허|자격·면허|보유자격증|전문자격|자격종류|자격및면허)$/, key: 'license' },
    { re: /^(소속|소속기관|근무처|현근무처|회사명|직장명?|기관명|근무기관|소속기관명|소속단체|소속회사|소속법인|사업장명|현소속|기관단체명|근무처명|사무소명|소속처)$/, key: 'org' },
    /* ★ 「소속·직위」처럼 «둘을 묶어» 묻는 칸 (2026-09-06).
       한쪽만 넣으면 서류에 직위가 빠진 채 나간다 — 사람이 쓰듯 둘을 이어 쓴다.
       ⚠ normLabel 은 괄호·콜론만 떼고 «가운뎃점(·)·빗금(/)»은 남긴다 — 그래서 여기서 잡힌다.
       ⚠ 값은 _cvFillData 의 fields.orgTitle 이 「소속 직위」로 이어 붙여 준다. */
    { re: /^(소속·직위|소속\/직위|소속및직위|소속직위|기관및직위|기관·직위|근무처및직위|소속기관및직위)$/, key: 'orgTitle' },
    { re: /^(부서|부서명|소속부서|소속팀|팀명|담당부서)$/, key: 'dept' },
    { re: /^(직위|직책|현직위|담당직위|직급|현직|담당직책|직위직급|직위\/직급|현재직위)$/, key: 'title' },
    /* 주민등록번호는 «알아보되 채우지 않는다» — 자동으로 나가면 안 되는 정보다.
       열쇠를 rrn 으로 따로 두어, 칸 지도가 「무슨 칸인지는 알려 주고 값은 비워」 둘 수 있게 한다.
       ⚠ 여기에 값을 담는 자리(fields.rrn)를 만들지 말 것 — 담으면 언젠가 자동으로 나간다. */
    { re: /^(주민등록번호|주민번호|생년월일주민등록번호)$/, key: 'rrn' }
  ];
  /* 칸 안에 「자택:______ 직장:______」처럼 라벨과 빈자리가 함께 있는 양식이 많다.
     이런 자리는 라벨 바로 뒤(밑줄·공백)를 값으로 바꾼다. */
  var INCELL_LABELS = [
    { re: /자택/, key: 'phoneHome' }, { re: /직장|사무실/, key: 'phoneWork' },
    { re: /휴대폰|핸드폰|휴대전화/, key: 'phone' }, { re: /팩스|FAX/i, key: 'fax' },
    { re: /영문/, key: 'nameEng' },
    { re: /기관명/, key: 'org' }, { re: /부서명/, key: 'dept' }, { re: /직위/, key: 'title' },
    /* ⚠ 짧은 말은 «긴 말 뒤»에 둔다 — 같은 열쇠는 먼저 걸린 것만 쓰므로,
       「부서명 :」이 있는 칸에서 짧은 「부서」가 먼저 걸리면 라벨 뒤를 못 찾는다. */
    { re: /소속/, key: 'org' }, { re: /부서/, key: 'dept' }, { re: /직급/, key: 'title' },
    { re: /연락처/, key: 'phone' }, { re: /자격/, key: 'license' },
    { re: /한글/, key: 'name' }, { re: /한자/, key: 'nameHanja' },
    { re: /성명|이름/, key: 'name' }, { re: /생년월일/, key: 'birth' },
    { re: /이메일|E-?mail/i, key: 'email' }, { re: /주소/, key: 'addr' }
  ];
  /* 목록 표 머리행 열쇠 — 학력·경력 표의 열을 알아본다 */
  var COL_LABELS = [
    { re: /^(기간|연도|년도|재직기간|재학기간|활동기간|기간근무년수|근무기간|수행기간|위촉기간|참여기간|교육기간|근무연월|활동연도|기간년월)$/, key: 'period' },
    { re: /^(학교명?|출신학교|출신교|졸업학교|학교소재지|학교명소재지)$/, key: 'school' },
    /* ⚠ 전공과 학위를 갈라 본다 (2026-09-06) — 이력서에는 「전공」과 「학위」 칸이 따로 있는데
       둘 다 major 로 뭉쳐 있어 «먼저 걸린 한 칸»에만 들어갔다(같은 열쇠는 첫 열에만 넣으므로).
       ⚠ 「전공/학위」처럼 한 칸에 묶인 옛 서식은 그대로 major 다. 뒷걸음질하지 않게
         fillList 가 major↔degree 로 서로 메운다. */
    { re: /^(학위|학위명|졸업구분|졸업여부)$/, key: 'degree' },
    { re: /^(전공|전공\/학위|전공·학위|학과명?|단과대학|전공학과|전공분야|학위전공|전공및학위)$/, key: 'major' },
    { re: /^(기관명?|근무처|소속|발급기관|기관\/단체|위촉기관|직장명?|회사명|단체명|위촉처|발주처|주관기관|시행기관|소속기관)$/, key: 'org' },
    /* ⚠ 「직위」와 「담당업무」를 갈라 본다 (2026-09-05).
       전에는 둘 다 role 이어서, 이력서 경력 표(근무기간|근무처|근무부서|직위|담당업무)에서
       «먼저 걸린 한 칸»에만 들어가고 나머지가 비었다(같은 열쇠는 첫 열에만 넣으므로).
       ⚠ 그렇다고 옛 서식이 뒷걸음질하면 안 된다 — 「직위」 칸 하나뿐인 서식은
         그 칸에 담당업무라도 들어가야 한다. fillList 가 title↔role 로 서로 메운다. */
    { re: /^(부서|근무부서|소속부서|부서명|담당부서|소속팀|팀명)$/, key: 'dept' },
    { re: /^(직위|직책|직급|직위직급|현직위|담당직위|직위\/직급)$/, key: 'title' },
    { re: /^(내용|담당업무|활동내용|직책\/내용|주요활동|업무내용|담당업무구체적|담당역할|수행업무|수행내용|담당분야|경력내용|세부내용|활동사항|직무)$/, key: 'role' },
    /* ⚠ 아래 셋은 «채우지 않는다» — 머리행인 줄 알아보아 «경계»로 삼기 위한 것뿐이다.
       열 이름을 못 알아보면 머리행인 줄 몰라 남의 표에 값이 박힌다
       (실측 2026-08-29: 자격증 표에 경력이 죽 박혔다). */
    { re: /^(자격증명|자격명|면허명|자격사항|자격증|면허|자격종류|종목|자격종목)$/, key: 'certName' },
    { re: /^(취득년도|취득일자?|발급일자?|취득연월일|취득연월|발행일자?|수여일자?|발급연월일)$/, key: 'gotAt' },
    { re: /^(비고|참고|기타|비고사항|참고사항)$/, key: 'note' }
  ];

  /* ═══ 「자리표」 — 글자는 있지만 «뜻이 없는» 빈 칸 표시 ═══════════════════
     기관 서식은 빈 칸을 그냥 두지 않고 자리표를 박아 둔다:
       [한글] [한자] [영문] · (자택)(   )   - · 년  월 ~  년  월 · 1900.00.00
       ○ ○ ○ · ______ · (   ) · ○○○
     지금까지의 굳은 규칙은 「글자가 한 자라도 있는 칸은 절대 덮지 않는다」였다.
     그 규칙 때문에 이력서 2쪽이 통째로 비어 나갔다(실측 2026-09-05: 건너뛴 칸 10개).

     ⚠★ 이 자를 넓히는 것은 «덮어쓰기»를 넓히는 것이다. 잘못 넓히면 대표가 손으로
       적어 둔 값을 지운다 — 서류가 «조용히» 틀린다. 그래서 다음을 지킨다:
         ① 정해진 모양만 인정한다. 「뜻이 있어 보이면 손대지 않는다」가 기본값이다.
         ② 한글·숫자가 «뜻을 이루면» 자리표가 아니다.
            1900.00.00 은 자리표(달·일이 00 인 날짜는 없다).
            1975.01.07 은 «말이 되는 날짜»라 자리표가 아니다 — 절대 안 덮는다.
         ③ 사람이 직접 고쳐 친 값은 어떤 경우에도 안 덮는다(setCellText 는 따로다).
       tests/kcareer-placeholder.test.js 가 이 셋을 기계로 지킨다. */
  var PLACEHOLDER = [
    /* [한글] [한자] [영문] [성명] — 대괄호 안 «칸 이름» */
    /^\[[^\]]{1,8}\]$/,
    /* 년 월 ~ 년 월 · 년 월 일 — 숫자 없는 날짜 틀 */
    /^[\s~\-.·()]*[년월일][년월일\s~\-.·()]*$/,   /* 년·월·일 중 하나는 반드시 있어야 한다 — 없으면 「-」 같은 뜻 있는 글자까지 삼킨다 */
    /* 0000.00.00 · 1900.00.00 · 0000-00-00 — 달이나 일이 00 인 날짜는 없다 */
    /^\d{2,4}[.\-\/]\s?(00)[.\-\/]\s?\d{1,2}$|^\d{2,4}[.\-\/]\s?\d{1,2}[.\-\/]\s?(00)$|^\d{2,4}[.\-\/]00[.\-\/]00$/,
    /* ○ ○ ○ · ○○○ · □□□ · ×××  — 이름 자리 */
    /^[○◯ㅇ□■●▢×xX*＊\s]{1,12}$/,
    /* (자택)(   )   -  ·  (   ) - ·  -  — 번호 자리(괄호·붙임표·빈자리만) */
    /^[()（）\s\-–—_]{2,20}$/   /* ⚠ 두 글자 이상만 — 「-」 한 글자는 자리표가 아니라 «해당없음»이라는 뜻이다 */,
    /* (자택)(   )   -  처럼 «라벨 + 빈 괄호»  */
    /^[()（）]?\s*[가-힣]{1,4}\s*[()（）]?\s*[()（）]\s*[)）]?\s*[-–—]?\s*$/,
    /* ______  ·  ｜｜｜  — 밑줄만 */
    /^[_＿\-–—.·\s]{2,}$/
  ];
  /* 이 칸이 «자리표뿐인가» — 값이 아니라 자리 표시만 들어 있나 */
  function isPlaceholder(text) {
    var t = String(text == null ? '' : text).trim();
    if (!t) return false;                 /* 빈 칸은 자리표가 아니라 그냥 빈 칸이다 */
    if (t.length > 24) return false;      /* 긴 글은 뜻이 있다 — 손대지 않는다 */
    for (var i = 0; i < PLACEHOLDER.length; i++) if (PLACEHOLDER[i].test(t)) return true;
    return false;
  }
  /* 채울 수 있는 칸 = 비었거나 자리표뿐인 칸 */
  function isBlankish(tc) {
    var t = cellText(tc);
    return t === '' || isPlaceholder(t);
  }

  /* 자리표가 «스스로 칸 이름을 말할» 때가 있다 — 라벨 칸이 따로 없는 서식이다.
       성  명 | [한글] | [한자] | [영문]        ← 이름표가 자리표 안에 있다
       전  화 | (자택)(   )   -                 ← 「자택」이 자리표 안에 있다
     이 이름을 읽어 그 자리에 바로 넣는다.
     ⚠ 자리표일 때만 본다 — 뜻 있는 글자가 든 칸은 여기까지 오지 않는다.
     ⚠ 학력 표의 「고등학교」처럼 «급»을 말하는 것은 여기가 아니라 아래에서 다룬다. */
  function placeholderKey(text) {
    var t = String(text == null ? '' : text);
    if (!isPlaceholder(t)) return '';
    var 속 = t.replace(/[\[\]()（）{}<>《》「」\s_＿\-–—.·:：]/g, '').trim();
    if (!속) return '';
    var k = fieldKeyOf(속);
    if (k) return k;
    for (var i = 0; i < INCELL_LABELS.length; i++) {
      if (INCELL_LABELS[i].re.test(속)) return INCELL_LABELS[i].key;
    }
    return '';
  }

  function normLabel(s) {
    return String(s == null ? '' : s)
      .replace(/[\s ]+/g, '')      // 공백(성 명 → 성명)
      .replace(/[*※()（）:：]/g, '')    // 별표·괄호·콜론 장식
      .trim();
  }
  /* ── 「연락처(휴대)」처럼 «괄호로 갈래를 밝힌» 라벨 ──
     ★ 낱말을 더하는 대신 «규칙»으로 푼다. 기관 양식은 큰 이름 뒤 괄호로 갈래를 적는다:
         연락처(휴대) · 전화(자택) · 주소(직장) · 성명(한자)
     낱말 사전으로 쫓으면 조합이 끝없다(연락처(휴대)·연락처(휴대폰)·전화(핸드폰)…).
     «큰 이름 × 갈래» 두 표만 두면 곱셈으로 덮인다.
     ⚠ 통째로 「이름(갈래)」 꼴일 때만 본다 — 아무 데나 괄호가 있다고 잡으면
       「주소(우편번호 포함)」 같은 안내글까지 주소로 본다(실측: 그것은 «모름»으로 남는다).
     ⚠ 사전이 못 알아본 뒤에만 본다 — 사전이 먼저다. */
  var 갈래 = [
    { re: /^(휴대|휴대폰|핸드폰|이동|이동전화|hp)$/i, phone: 'phone' },
    { re: /^(자택|집|자가)$/,                          phone: 'phoneHome', addr: 'addr' },
    { re: /^(직장|사무실|회사|근무처|사무소)$/,          phone: 'phoneWork', addr: 'addrWork' },
    { re: /^(한글)$/,                                  name: 'name' },
    { re: /^(한자|한문)$/,                              name: 'nameHanja' },
    { re: /^(영문|영어)$/,                              name: 'nameEng' }
  ];
  var 큰이름 = [
    { re: /^(연락처|전화|전화번호|번호)$/, fam: 'phone' },
    { re: /^(주소|주소지|현주소)$/,        fam: 'addr' },
    { re: /^(성명|이름|성함)$/,            fam: 'name' }
  ];
  function bracketKey(text) {
    var m = /^([^([（]{1,10})[([（]([^)\]）]{1,8})[)\]）]$/.exec(String(text == null ? '' : text).trim());
    if (!m) return '';
    var base = normLabel(m[1]), qual = normLabel(m[2]);
    if (!base || !qual) return '';
    var fam = '';
    for (var i = 0; i < 큰이름.length; i++) if (큰이름[i].re.test(base)) { fam = 큰이름[i].fam; break; }
    if (!fam) return '';
    for (var j = 0; j < 갈래.length; j++) if (갈래[j].re.test(qual)) return 갈래[j][fam] || '';
    return '';
  }
  function fieldKeyOf(text) {
    var t = normLabel(text);
    if (!t || t.length > 12) return '';
    for (var i = 0; i < FIELD_LABELS.length; i++) if (FIELD_LABELS[i].re.test(t)) return FIELD_LABELS[i].key;
    return bracketKey(text);
  }
  function colKeyOf(text) {
    var t = normLabel(text);
    if (!t || t.length > 12) return '';
    for (var i = 0; i < COL_LABELS.length; i++) if (COL_LABELS[i].re.test(t)) return COL_LABELS[i].key;
    return '';
  }

  /* ===== XML 조각 다루기 ===== */
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  /* 이 칸에 «표가 또» 들어 있나 */
  function hasInnerTable(tc) { return tagBlocks(String(tc || ''), 'hp:tbl').length > 0; }
  /* 안쪽 표를 걷어 낸 «내 몫»만 남긴다 */
  function ownPart(tc) {
    var t = String(tc || '');
    var 표 = tagBlocks(t, 'hp:tbl');
    if (!표.length) return t;
    /* 뒤에서부터 잘라 내야 앞의 자리가 안 흔들린다 */
    for (var i = 표.length - 1; i >= 0; i--) t = t.slice(0, 표[i].start) + t.slice(표[i].end);
    return t;
  }
  /* 칸의 글자 — «안쪽 표의 글자는 안 읽는다».
     ⚠ 안 걷어 내면 「바깥글안쪽글」이 나와, 빈 칸인지 자리표인지 잘못 판단한다
       (코덱스 지적, 실측 2026-09-06). */
  function cellText(tc) {
    var out = '', re = /<hp:t(?:\s[^>]*)?>([\s\S]*?)<\/hp:t>/g, m;
    var 내몫 = ownPart(tc);
    while ((m = re.exec(내몫))) out += m[1];
    return out.replace(/<[^>]*>/g, '').trim();
  }
  function isEmptyCell(tc) { return cellText(tc) === ''; }

  /* 빈 칸에 값을 넣는다. 실제 한글 파일의 네 가지 빈 칸 모양을 다 받는다:
     <hp:t></hp:t> · <hp:t/> · run에 t 없음 · 문단에 run 없음.
     못 넣으면 null — 조용히 망가뜨리지 않는다. */
  function fillCell(tc, value) {
    /* ⚠ 안쪽 표가 든 칸은 건드리지 않는다 — 부모 칸을 통째로 손대면 안쪽 표가
       깨진다(코덱스 권고). 그 칸의 값은 «안쪽 표»를 따로 다뤄 넣는다. */
    if (hasInnerTable(tc)) return null;
    var v = esc(value);
    if (/<hp:t(?:\s[^>]*)?><\/hp:t>/.test(tc)) return tc.replace(/(<hp:t(?:\s[^>]*)?>)(<\/hp:t>)/, '$1' + v + '$2');
    if (/<hp:t(?:\s[^>]*)?\/>/.test(tc)) return tc.replace(/<hp:t((?:\s[^>]*)?)\/>/, '<hp:t$1>' + v + '</hp:t>');
    var mRun = tc.match(/<hp:run\b[^>]*>/);
    if (mRun) return tc.replace(mRun[0], mRun[0] + '<hp:t>' + v + '</hp:t>');
    var mP = tc.match(/<hp:p\b[^>]*>/);
    if (mP) return tc.replace(mP[0], mP[0] + '<hp:run charPrIDRef="0"><hp:t>' + v + '</hp:t></hp:run>');
    return null;
  }

  /* ── 칸의 글자를 «통째로 바꾼다» (대표 지시 2026-09-05 「화면에서 바로 수정」) ──
     ⚠ fillCell 과 다른 일이다. fillCell 은 «빈 칸»에 넣는 것이고, 글자가 있는 칸에 부르면
       run 앞에 새 <hp:t> 를 끼워 「권형하충남 천안시…」처럼 앞에 덧붙는다.
     ⚠ 이것은 «사람이 그 칸을 직접 고쳐 쳤을 때만» 부른다.
       자동 채우기(autoFill)는 여전히 글자가 있는 칸을 절대 건드리지 않는다 — 그 규칙은 그대로다.
     첫 <hp:t> 에 새 글자를 넣고 나머지는 비운다. 빈 글자('')를 주면 그 칸을 지운다. */
  function setCellText(tc, value) {
    /* ⚠ 안쪽 표가 든 칸은 통째로 바꾸지 않는다 — 안쪽 표의 글자까지 지워진다 */
    if (hasInnerTable(tc)) return null;
    var v = esc(value == null ? '' : value), n = 0, hit = false;
    /* ⚠★ 여는 태그를 «<hp:t(?:\s[^>]*)?>» 로 쓰지 말 것 — 그 꼴은 칸 태그 «<hp:tc …>» 까지 잡아먹는다.
       실측 2026-09-05: 795자짜리 칸이 500자로 줄고 <hp:tc> 여는 태그가 통째로 사라져
       문서가 못 그려졌다(글자 조각 12개 → 0개). 태그 이름이 «거기서 끝나야» 한다. */
    var out = String(tc).replace(/(<hp:t(?:\s[^>]*)?>)([\s\S]*?)(<\/hp:t>)/g, function (m, a, inner, b) {
      hit = true; n++;
      return a + (n === 1 ? v : '') + b;
    });
    /* 글자 조각이 하나도 없으면(빈 칸 모양) 넣는 일꾼에게 맡긴다 */
    if (!hit) return fillCell(tc, value);
    return out;
  }

  /* 표를 통째로 하나씩 — ⚠ 셀 안에 표가 또 있으면(중첩) 정규식이 경계를 잘못 짚으므로 건너뛴다 */
  /* ═══ 깊이를 세어 «그 켜의» 블록만 잘라 낸다 ═══════════════════════════
     ⚠ indexOf('</hp:tbl>') 로 끝을 찾으면 안 된다 — 표 안에 표가 있으면
       «안쪽» 닫는 태그를 짚어 구간이 통째로 어긋난다(실측 2026-09-06:
       바깥표+학력표를 표 «1개»로 보고, 그 1개가 학력표 길이였다).
     ⚠ 비탐욕 정규식(<hp:tr>[\s\S]*?</hp:tr>)도 같은 병이다 — 자식의 첫
       닫는 태그에서 끊긴다.
     돌려주는 것: [{ start, end, text }] — 자리까지 준다(뒤에서부터 고칠 수 있게). */
  function tagBlocks(xml, tag) {
    var open = '<' + tag, close = '</' + tag + '>';
    var out = [], pos = 0, src = String(xml || '');
    for (;;) {
      var s = src.indexOf(open, pos);
      if (s < 0) break;
      /* <hp:tbl> · <hp:tbl ...> 만. <hp:tblX> 같은 «다른 태그»는 아니다. */
      var after = src.charAt(s + open.length);
      if (after !== '>' && after !== ' ' && after !== '\t' && after !== '\r'
          && after !== '\n' && after !== '/') { pos = s + open.length; continue; }
      /* 빈 태그(<hp:tbl/>)면 그 자리에서 끝난다 */
      var head = src.indexOf('>', s);
      if (head < 0) break;
      if (src.charAt(head - 1) === '/') {
        out.push({ start: s, end: head + 1, text: src.slice(s, head + 1) });
        pos = head + 1; continue;
      }
      /* 깊이를 세며 «짝이 맞는» 닫는 태그를 찾는다 */
      var depth = 1, i = head + 1;
      for (;;) {
        var no = src.indexOf(open, i), nc = src.indexOf(close, i);
        if (nc < 0) { i = -1; break; }              /* 짝이 없다 — 건드리지 않는다 */
        if (no >= 0 && no < nc) {
          var a2 = src.charAt(no + open.length);
          if (a2 === '>' || a2 === ' ' || a2 === '\t' || a2 === '\r' || a2 === '\n' || a2 === '/') {
            var h2 = src.indexOf('>', no);
            if (h2 > 0 && src.charAt(h2 - 1) === '/') { i = h2 + 1; continue; }  /* 빈 태그는 안 센다 */
            depth++;
          }
          i = no + open.length; continue;
        }
        depth--;
        i = nc + close.length;
        if (depth === 0) break;
      }
      if (i < 0) break;                              /* 깨진 XML — 여기서 멈춘다 */
      out.push({ start: s, end: i, text: src.slice(s, i) });
      pos = i;
    }
    return out;
  }

  /* 표를 훑는다 — 중첩 표도 «각각» 본다.
     ⚠ 안쪽부터 본다(뒤에서부터). 부모를 먼저 바꾸면 자식의 자리가 흔들린다.
     ⚠ 콜백에 두 번째 값으로 «깊이»를 준다 — 부르는 쪽이 필요하면 쓴다. */
  function eachTable(xml, fn) {
    var src = String(xml || '');
    var 목록 = [];
    (function 모으기(안, 밑, 깊이) {
      tagBlocks(안, 'hp:tbl').forEach(function (b) {
        var 나 = { start: 밑 + b.start, end: 밑 + b.end, depth: 깊이 };
        /* 자식을 먼저 담는다 — 뒤에서 «안쪽부터» 고치게 된다 */
        var 속 = b.text.slice(b.text.indexOf('>') + 1, b.text.length - '</hp:tbl>'.length);
        모으기(속, 밑 + b.start + b.text.indexOf('>') + 1, 깊이 + 1);
        목록.push(나);
      });
    })(src, 0, 0);
    /* 뒤에 있는 것부터 바꾼다 — 앞의 자리가 안 흔들린다 */
    목록.sort(function (a, b) { return b.start - a.start; });
    var out = src;
    목록.forEach(function (b) {
      var 지금 = out.slice(b.start, b.end);
      var 새것 = fn(지금, b.depth);
      if (새것 != null && 새것 !== 지금) out = out.slice(0, b.start) + 새것 + out.slice(b.end);
    });
    return out;
  }
  /* 어느 모양으로 와도 «그 덩이의 속»을 돌려준다.
     ⚠ 부르는 쪽이 <hp:tbl>…</hp:tbl> 를 그대로 주기도 하고, <hp:p><hp:tbl>…</hp:p>
       처럼 «문단에 싸서» 주기도 한다(검사 도우미가 그렇다). 앞의 것만 받게 만들면
       뒤의 것에서 «0줄»이 나온다(실측 2026-09-06). */
  function innerOf(chunk, tag) {
    var t = String(chunk || '');
    var b = tagBlocks(t, tag)[0];
    if (!b) return t;                       /* 그 태그가 없으면 통째로 본다 */
    var head = b.text.indexOf('>');
    return b.text.slice(head + 1, b.text.length - ('</' + tag + '>').length);
  }
  /* 표의 «바로 아래» 행만. 손자(안쪽 표의 행)는 안 센다.
     ⚠ 따로 걸러 낼 것이 없다 — 깊이 세기가 이미 해 준다. 바깥 <hp:tr> 의 블록이
       안쪽 표를 통째로 품으므로 안쪽 행은 애초에 목록에 오르지 않는다.
       (전에 여기에 걸러 내는 걸음을 두었는데, 빼도 결과가 같아 «죽은 코드»였다.
        지울 수 있는 코드를 남기면 다음 사람이 함부로 못 건드린다.) */
  function splitRows(tbl) {
    return tagBlocks(innerOf(tbl, 'hp:tbl'), 'hp:tr').map(function (b) { return b.text; });
  }
  /* 행의 «바로 아래» 칸만 — 위와 같은 까닭으로 따로 거르지 않는다 */
  function splitCells(tr) {
    return tagBlocks(innerOf(tr, 'hp:tr'), 'hp:tc').map(function (b) { return b.text; });
  }
  /* 조각을 원문 안에서 딱 한 번만 바꾼다 — 같은 모양의 다른 칸을 건드리지 않게 */
  function replaceOnce(hay, oldStr, newStr) {
    var i = hay.indexOf(oldStr);
    return i < 0 ? hay : hay.slice(0, i) + newStr + hay.slice(i + oldStr.length);
  }
  /* ── 칸의 «진짜 열 번호» ──
     ★★ 대표 제보 2026-09-07: 이력서 2쪽에서 학력이 «자격 및 면허 표»에 박혀 나왔다.
     ■ 까닭
       기관 서식은 표 맨 앞에 「학력사항」·「경력사항」처럼 «세로로 합친» 이름 칸을 둔다.
       그 칸은 머리줄에만 있고 자료 줄에는 없다 — 머리줄 6칸, 자료 줄 5칸.
       열 이름을 «칸 순서»로 세면 자료 줄이 한 칸씩 밀려, 기간이 학교명 칸으로 들어가고
       「고등학교」가 적힌 줄은 「빈 줄이 아니다」라며 건너뛰게 된다. 그렇게 아래로 흘러
       남의 표(자격 및 면허)의 빈 줄이 학력 자리로 쓰였다.
     ■ 고침 — 한글 파일은 칸마다 «열 번호»를 적어 둔다. 그것을 읽는다.
     ⚠ 열 번호가 없는 서식(다른 프로그램이 만든 것)에서는 지금까지처럼 칸 순서로 간다 —
       오늘 되는 것이 뒷걸음질하면 안 된다.
     ⚠ 이름표 순서는 서식마다 다르다(colAddr 이 앞일 수도, rowAddr 이 앞일 수도 있다). */
  function colAddrOf(tc) {
    var m = /<hp:cellAddr[^>]*\bcolAddr="(\d+)"/.exec(String(tc == null ? '' : tc));
    return m ? parseInt(m[1], 10) : -1;
  }
  /* 줄의 «모양» — 칸 수와 첫 칸의 열 번호. 열 번호가 없으면 빈 글자(이 잣대를 쓰지 않는다) */
  function rowShape(cells) {
    if (!cells || !cells.length) return '';
    var a = colAddrOf(cells[0]);
    return a < 0 ? '' : (cells.length + ':' + a);
  }
  /* 이 칸이 어느 열인가 — 열 번호가 있으면 그것으로, 없으면 칸 순서로(옛 서식) */
  function keyAt(head, tc, i) {
    if (head && head.byCol) {
      var ca = colAddrOf(tc);
      if (ca >= 0) return head.byCol[ca] || '';
    }
    return (head && head.map[i]) || '';
  }
  /* ★ 줄에서 «n번째 칸»을 바꾼다.
     ⚠ replaceOnce 로 칸을 바꾸면 안 된다 — 빈 칸끼리는 XML 이 글자 하나까지 똑같아서
       「3번째 칸」에 넣으라고 해도 «맨 앞의 빈 칸»이 바뀐다. 실측(2026-09-06)에서
       경력 표의 근무처가 세로 병합 라벨 자리(0번 칸)에 들어갔다.
     ⚠ 이 함수 하나로만 칸을 바꾼다. 「자리」를 세는 곳이 둘이 되면 다시 어긋난다. */
  function replaceCellAt(tr, idx, newCell) {
    var re = /<hp:tc\b[\s\S]*?<\/hp:tc>/g, m, n = 0;
    while ((m = re.exec(tr))) {
      if (n === idx) return tr.slice(0, m.index) + newCell + tr.slice(m.index + m[0].length);
      n++;
    }
    return tr;
  }

  /* ===== ①-B 칸 안 라벨: 「자택:______ 직장:______」처럼 한 칸에 라벨과 빈자리가 함께 =====
     라벨 뒤의 밑줄(___)이나 콜론 뒤 빈자리를 값으로 바꾼다.
     ⚠ 라벨 뒤에 이미 글자가 있으면 건드리지 않는다. */
  /* used: «이 표에서» 이미 채운 열쇠. 표가 바뀌면 새로 시작한다.
     ⚠ 문서 전체로 두면 지원서(1쪽)+이력서(2쪽)가 한 파일인 서식에서 2쪽이 통째로 빈다
       (실측 2026-09-05: 건너뛴 칸 10개 중 name·birth·phone·org 가 2쪽 것이었다). */
  function fillInCell(tc, fields, report, used) {
    var txt = cellText(tc);
    if (!txt) return tc;
    var hits = [];
    INCELL_LABELS.forEach(function (L) {
      if (!L.re.test(txt)) return;
      if (fields[L.key] == null || fields[L.key] === '') return;
      if (hits.some(function (h) { return h.key === L.key; })) return;
      hits.push(L);
    });
    if (!hits.length) return tc;
    var out = tc, did = 0;
    hits.forEach(function (L) {
      /* <hp:t> 안의 글자만 바꾼다 — 태그를 건드리면 문서가 깨진다 */
      out = out.replace(/(<hp:t(?:\s[^>]*)?>)([\s\S]*?)(<\/hp:t>)/g, function (m, a, inner, b) {
        if (did >= hits.length) return m;
        /* 라벨 + 콜론 + «값 자리»
           ⚠ 값 자리는 밑줄만이 아니다. 실측(2026-08-29) 「기관명 : 부서명 : 직위 :」에서
             끝에 붙은 「직위」가 늘 빠졌다 — 뒤에 밑줄도 넉넉한 공백도 없이 문장이 끝난다.
             사이 공백이 좁으면 셋 다 빠졌다. 그래서 «끝» 과 «바로 다음 라벨» 도 값 자리로 본다.
           ⚠ 그렇다고 아무 데나 넣으면 안 된다 — 뒤에 이미 «글자»가 오면 건드리지 않는다.
             앞을 내다보기(?=…)로만 판단하고, 실제로 바꾸는 자리는 라벨+콜론까지다.
           ⚠ L.re.source 를 (?:…) 로 감싸야 한다 — 「직장|사무실」처럼 교대가 들어 있으면
             괄호 없이는 '직장' 또는 '사무실\s*[:：]?\s*' 로 갈라져 뒤가 통째로 사라진다. */
        var ANY = INCELL_LABELS.map(function (x) { return x.re.source; }).join('|');
        var BLANK = '_{2,}|\\u3000{2,}|[ \\t]{4,}';
        /* 밑줄·넓은 공백은 «값 자리»이므로 삼켜서 값으로 바꾼다(안 삼키면
           「직장:041-556-0035_______」처럼 밑줄이 남아 줄이 넘친다).
           삼킬 것이 없으면(끝이거나 바로 다음 라벨이면) 자리만 잡고 끼워 넣는다. */
        var re = new RegExp('((?:' + L.re.source + ')\\s*[:：]\\s*)(' + BLANK + ')?'
          + '(?=$|' + BLANK + '|\\s*(?:' + ANY + ')\\s*[:：])');
        if (!re.test(inner)) return m;
        var next = inner.replace(re, function (mm, head, blank, off, whole) {
          /* 뒤에 다른 라벨이 이어지면 사이를 벌린다 — 「푸른노무법인부서명」이 되지 않게 */
          var rest = whole.slice(off + mm.length);
          /* 밑줄 자리가 있으면 «그 자리에 딱» 넣는다(서식이 정한 간격을 따른다).
             빈자리가 아예 없을 때만 한 칸 띄운다 — 안 그러면 「직위 :대표노무사」로 붙는다. */
          var pre = (blank || /\s$/.test(head)) ? '' : ' ';
          return head + pre + esc(fields[L.key]) + (rest.replace(/^[\s_　]+/, '') ? '  ' : '');
        });
        if (next === inner) return m;
        did++; report.fields.push({ key: L.key, value: fields[L.key] });
        used[L.key] = true;
        return a + next + b;
      });
    });
    return out;
  }

  /* ===== ① 단일 값: 라벨 칸 → 같은 행의 바로 다음 빈 칸 ===== */
  function fillFields(tbl, fields, report) {
    var rows = splitRows(tbl), newTbl = tbl;
    /* ★ 이 표에서만 쓰는 「이미 채운 열쇠」 — 표가 바뀌면 비워진다 */
    var used = {};
    rows.forEach(function (tr) {
      var cells = splitCells(tr), newTr = tr;
      for (var i = 0; i < cells.length; i++) {
        /* 칸 안에 라벨과 빈자리가 함께 있는 모양(자택:___ 직장:___)을 먼저 처리한다 */
        var inFilled = fillInCell(cells[i], fields, report, used);
        if (inFilled !== cells[i]) { newTr = replaceCellAt(newTr, i, inFilled); cells[i] = inFilled; }
        /* 자리표가 스스로 이름을 말하면 그 자리에 바로 넣는다 — [한자] [영문] (자택)(  ) - */
        var 스스로 = placeholderKey(cellText(cells[i]));
        if (스스로 && !used[스스로] && fields[스스로] != null && fields[스스로] !== '') {
          var 새칸 = setCellText(cells[i], fields[스스로]);
          if (새칸) {
            newTr = replaceCellAt(newTr, i, 새칸); cells[i] = 새칸;
            used[스스로] = true;
            report.fields.push({ key: 스스로, value: fields[스스로] });
            report.placeholders = (report.placeholders || 0) + 1;
          }
        }
        if (i >= cells.length - 1) break;
        var key = fieldKeyOf(cellText(cells[i]));
        if (!key || fields[key] == null || fields[key] === '') continue;
        if (used[key]) continue;               // «이 표 안에서» 같은 값은 한 번만(첫 등장 우선)
        /* ⚠ 「값이 있으면 안 덮는다」는 그대로다. 다만 «자리표»는 값이 아니다 —
           [한글]·1900.00.00 같은 빈 칸 표시 때문에 이력서가 통째로 비었다. */
        var 자리표 = isPlaceholder(cellText(cells[i + 1]));
        if (!isEmptyCell(cells[i + 1]) && !자리표) { report.kept.push(key); continue; }
        var filled = 자리표 ? setCellText(cells[i + 1], fields[key]) : fillCell(cells[i + 1], fields[key]);
        if (자리표 && filled) report.placeholders = (report.placeholders || 0) + 1;
        if (!filled) continue;
        newTr = replaceCellAt(newTr, i + 1, filled);
        cells[i + 1] = filled;
        used[key] = true;
        report.fields.push({ key: key, value: fields[key] });
      }
      if (newTr !== tr) newTbl = replaceOnce(newTbl, tr, newTr);
    });
    return newTbl;
  }

  /* ===== ② 목록 표: 머리행을 알아보고 아래 빈 행에 한 줄씩 ===== */
  /* colMap: 머리행 이름표 → 열쇠 배열. AI에게 물어 얻은 짝짓기를 여기로 건넨다
     (js/kcareer-colmap-ai.js). 사전이 못 알아본 서식을 사람 손 없이 채우기 위한 것이다.
     ⚠ 사전보다 «앞선다» — 사전은 서식마다 새로 빗나가지만 AI는 그 표를 보고 답한다.
     ⚠ 없으면 지금까지처럼 사전으로 간다. AI가 없어도 앱은 그대로 돌아야 한다. */
  function detectHeader(cells, colMap) {
    var map = [], hit = 0, i;
    if (colMap) {
      var key = cells.map(function (c) { return cellText(c).replace(/[\s　]+/g, ''); }).join('|');
      var given = colMap[key];
      if (given && given.length === cells.length) {
        map = given.map(function (k) { return k === 'none' ? '' : k; });
        hit = map.filter(Boolean).length;
      }
    }
    if (!hit) {
      /* ⚠★ 머리행에는 «빈 칸이 없다» — 열 이름이 죽 적혀 있는 줄이기 때문이다.
         이 빗장이 없으면 「소속기관 | (빈칸) | 직위 | (빈칸)」 같은 «보통 라벨 표»가
         경력 목록으로 오인되어 그 표의 빈 칸을 통째로 놓친다
         (실측 2026-09-05: 사전에 「소속기관」을 더했더니 채울 자리 4개가 0개가 됐다).
         ⚠ 사전을 넓힐수록 이 오인이 잦아진다 — 낱말을 더할 때 이 빗장을 풀지 말 것.
         ⚠ 사람·AI 가 짚어 준 짝짓기(colMap)는 위에서 이미 hit 를 잡아 여기까지 오지 않는다. */
      for (i = 0; i < cells.length; i++) if (isEmptyCell(cells[i])) return null;
      for (i = 0; i < cells.length; i++) {
        var k = colKeyOf(cellText(cells[i]));
        map.push(k); if (k) hit++;
      }
    }
    if (hit < 2) return null;
    /* ★ 열 이름을 «진짜 열 번호»에도 적어 둔다 — 자료 줄이 밀려 있어도 제 칸을 찾는다.
       ⚠ 한 칸이라도 열 번호가 없으면 통째로 쓰지 않는다(반만 맞으면 더 위험하다). */
    var byCol = {}, 있다 = true;
    for (i = 0; i < cells.length; i++) {
      var ca = colAddrOf(cells[i]);
      if (ca < 0) { 있다 = false; break; }
      if (map[i]) byCol[ca] = map[i];
    }
    var kind = map.indexOf('school') >= 0 ? 'edu'
      : (map.indexOf('org') >= 0 && (map.indexOf('role') >= 0 || map.indexOf('title') >= 0
          || map.indexOf('dept') >= 0 || map.indexOf('period') >= 0)) ? 'career' : '';
    return kind ? { kind: kind, map: map, byCol: 있다 ? byCol : null } : null;
  }
  /* ── 여기서부터는 «남의 자리» ──
     ① 다음 머리행 — 열 이름이 둘 이상 잡히면 새 목록 표가 시작된 것이다
     ② 소제목 행 — 한 칸에만 글자가 있고 나머지가 빈 행(「5. 관련 분야 자격증 보유 사항」)
     둘 중 하나를 만나면 «멈춘다». 넘어가면 자격증 표에 경력이 박힌다. */
  function isBoundary(cells) {
    if (!cells.length) return false;
    /* ⚠ detectHeader 로만 보면 안 된다 — 그건 «채울 수 있는» 목록 표(학력·경력)만 참이다.
       자격증 머리행은 채울 대상이 아니라 detectHeader 가 거짓이고, 그래서 그냥 지나쳐
       그 아래에 경력이 박혔다. 여기서는 «열 이름이 둘 이상 잡히면» 머리행으로 본다. */
    var keys = 0;
    for (var k = 0; k < cells.length; k++) if (colKeyOf(cellText(cells[k]))) keys++;
    if (keys >= 2) return true;
    /* ★★ «통째로 빈 줄»은 경계가 아니다 — 채울 자리다 (대표 제보 2026-09-07).
       기관 서식의 경력 표 첫 줄에는 「년 월 ~ 년 월」 하나만 박혀 있다. 그것을 글자로 보아
       「첫 칸에만 글자가 있는 소제목」으로 오인해 그 자리에서 멈췄다 → 경력이 0줄이었다.
       ⚠ 진짜 소제목(「5. 관련 분야 자격증 보유 사항」)은 자리표가 아니므로 그대로 경계다. */
    if (rowIsEmpty(cells)) return false;
    var filled = 0, first = -1;
    for (var i = 0; i < cells.length; i++) {
      if (!isEmptyCell(cells[i])) { filled++; if (first < 0) first = i; }
    }
    /* 첫 칸에만 글자가 있고 다른 칸이 여럿 비어 있으면 소제목 줄로 본다 */
    return filled === 1 && first === 0 && cells.length >= 3;
  }

  /* 「빈 줄」 — 자리표만 박힌 줄도 빈 줄이다.
     ⚠ 이력서의 학력·경력 표는 「년  월 ~  년  월」이 미리 박혀 있다. 그것을 값으로 보면
       채울 줄이 하나도 없어 0/2줄이 된다(실측 2026-09-05). */
  /* 학력 표에 미리 박아 둔 «급» — 「고등학교」 줄에는 고등학교를 넣으라는 뜻이다.
     ⚠ 순서로 밀어 넣으면 대학원 줄에 고등학교가 들어간다. 급을 맞춰 고른다.
     ⚠ 이것은 학교명 열(school)에서만 본다 — 다른 칸의 같은 낱말은 뜻이 있는 글자다. */
  var LEVELS = ['초등학교', '중학교', '고등학교', '대학교', '대학원', '전문대학', '대학'];
  function levelOf(text) {
    var t = String(text == null ? '' : text).replace(/[\s　]+/g, '');
    for (var i = 0; i < LEVELS.length; i++) if (t === LEVELS[i]) return LEVELS[i];
    return '';
  }
  /* ── 목록 «줄 안»에서 빈 것으로 볼 글자인가 ──
     ⚠★ 낱개 칸의 「-」와 목록 줄의 「-」는 뜻이 다르다.
       · 낱개 칸  : 「-」는 «해당없음»이라는 대답이다 — 덮으면 안 된다(isPlaceholder 는 그대로).
       · 목록 줄  : 서식이 미리 그어 둔 «빈 자리»다.
     실측 2026-09-06 (대표 이력서 2쪽 학력 표):
         [년 월 ~ 년 월 | 고등학교 | - | ---- | -]
       「----」(넉 자)는 자리표인데 「-」(한 자)는 아니어서 구역이 머리줄 다음에서 끊겼다
       → 「학력 표 · 빈 0줄」 → 학력 칸이 낱개 14개로 흩어져 「채운 칸이 없습니다」로 끝났다.
     ⚠ 이 자를 낱개 칸 판정(isPlaceholder)에 합치지 말 것 — 「해당없음」을 덮게 된다. */
  var DASH_ONLY = /^[\-–—ー~〜]+$/;
  function isRowBlank(text) {
    var t = String(text == null ? '' : text).trim();
    return !t || isPlaceholder(t) || DASH_ONLY.test(t);
  }
  function rowIsEmpty(cells) {
    for (var i = 0; i < cells.length; i++) if (!isRowBlank(cellText(cells[i]))) return false;
    return true;
  }
  /* ── 목록 표 채우기 ──
     ⚠ 표 하나에 «구역이 여럿» 있을 수 있다. 대표 서식(2026-08-29)은 큰 표 하나 안에
       「3. 최종학력」「4. 경력사항」「5. 자격증」이 소제목으로 이어져 있었다.
     전에는 ①머리행을 «하나만» 찾고 ②그 아래를 «표 끝까지» 채웠다. 그래서
       · 첫 머리행이 학력인데 학력이 비면 표 전체를 포기해 경력이 안 들어갔고
       · 경력이 잡히면 자격증 표까지 죽 채워 «잘못 낸 서류»가 됐다.
     이제 구역마다 머리행을 찾고, 그 구역의 «연속된 빈 행»만 채운다. */
  function fillList(tbl, data, report, opts) {
    var rows = splitRows(tbl);
    var newTbl = tbl;
    for (var r = 0; r < rows.length; r++) {
      var head = detectHeader(splitCells(rows[r]), opts && opts.colMap);
      if (!head) continue;
      var items = data[head.kind] || [];
      var put = 0, donePick = {};
      /* 이 구역의 끝까지만 — 다음 머리행이나 소제목을 만나면 남의 자리다 */
      var q = r + 1, 모양 = null;
      for (; q < rows.length; q++) {
        var cells = splitCells(rows[q]);
        if (isBoundary(cells)) break;
        /* ★★ «자료 줄의 모양»이 바뀌면 그 구역은 끝났다 (대표 제보 2026-09-07).
           실측: 학력 구역(칸 5개·첫 열 1번)이 끝난 뒤 빈 줄 하나를 지나 「자격및면허」
           머리줄이 오는데 그 줄이 경계로 안 잡혀, 그 아래 빈 줄에 학력이 박혔다.
           ⚠ 모양이 다르면 «안 채우는» 쪽으로 멈춘다 — 남의 표에 박는 것보다 덜 나쁘다.
           ⚠ 열 번호가 없는 서식에서는 이 잣대를 쓰지 않는다(rowShape 가 빈 글자를 준다). */
        var 이모양 = rowShape(cells);
        if (이모양) {
          if (모양 == null) 모양 = 이모양;
          else if (모양 !== 이모양) break;
        }
        /* 이 줄의 «칸마다 어느 열인지»를 먼저 정해 둔다 — 채우는 중에 칸이 바뀌므로 */
        var keys = [];
        var lim = head.byCol ? cells.length : Math.min(cells.length, head.map.length);
        for (var kk = 0; kk < lim; kk++) keys.push(keyAt(head, cells[kk], kk));
        /* 「고등학교」처럼 급만 박힌 줄 — 그 급의 학교를 골라 넣는다.
           ⚠ 이 줄은 rowIsEmpty 가 거짓이다(글자가 있으므로). 그래서 따로 본다. */
        var 급 = '', 급칸 = -1;
        if (head.kind === 'edu') {
          for (var L = 0; L < keys.length; L++) {
            if (keys[L] !== 'school') continue;
            var lv = levelOf(cellText(cells[L]));
            if (lv) { 급 = lv; 급칸 = L; }
          }
        }
        var pick = -1;
        if (급) {
          for (var g = 0; g < items.length; g++) {
            if (donePick[g]) continue;
            if (String(items[g].school || '').indexOf(급) >= 0) { pick = g; break; }
          }
          /* 급이 박혀 있는데 맞는 학교가 없으면 «그 줄은 비워 둔다» —
             아무거나 넣으면 대학원 줄에 고등학교가 박힌다 */
          if (pick < 0) continue;
        } else {
          if (!rowIsEmpty(cells)) continue;             /* 값이 이미 있는 행은 건너뛴다 */
          while (put < items.length && donePick[put]) put++;
          if (put >= items.length) continue;
          pick = put;
        }
        var item = items[pick], newTr = rows[q], ok = false, used = {};
        for (var c = 0; c < lim; c++) {
          var k = keys[c];
          if (!k) continue;
          /* ⚠ 「직위」 칸 하나뿐인 옛 서식이 뒷걸음질하지 않게 서로 메운다.
             직위가 없으면 담당업무를, 담당업무가 없으면 직위를 넣는다.
             ⚠ 「둘 다 있는」 서식에서는 각자 제 값이 있으므로 이 길로 오지 않는다. */
          var 짝꿍 = { title: 'role', role: 'title', major: 'degree', degree: 'major' };
          if ((item[k] == null || item[k] === '') && 짝꿍[k]) {
            var 짝 = 짝꿍[k];
            if (item[짝] != null && item[짝] !== '' && !used[짝]) { k = 짝; }
          }
          if (item[k] == null || item[k] === '') continue;
          /* ⚠ 같은 열쇠가 두 열에 잡히면 «첫 열에만» 넣는다.
             「학과명」과 「학 위」가 둘 다 major 로 잡혀 「인문계」가 두 칸에 들어갔다
             (실측 2026-08-29). 「담당업무(구체적)」와 「직 위」도 같은 일이 났다. */
          if (used[k]) continue;
          used[k] = true;
          /* 글자가 있는 칸(자리표·급)은 «비운 뒤» 넣는다 — 빈 칸용으로 넣으면
             「천안고등학교고등학교」처럼 앞에 덧붙는다(실측 2026-09-06). */
          var 있던 = cellText(cells[c]);
          var filled = 있던 ? setCellText(cells[c], item[k]) : fillCell(cells[c], item[k]);
          if (!filled) continue;
          newTr = replaceCellAt(newTr, c, filled);
          cells[c] = filled; ok = true;
        }
        if (ok) { newTbl = replaceOnce(newTbl, rows[q], newTr); donePick[pick] = true; if (pick === put) put++; }
      }
      if (items.length) {
        var 넣은수 = Object.keys(donePick).length;
        report.lists.push({ kind: head.kind, put: 넣은수, total: items.length });
      }
      r = q - 1;                                        /* 이 구역은 다 봤다 — 다음 구역부터 */
    }
    return newTbl;
  }

  /* ═══ 표 «밖» 문단 — 날짜와 지원자 이름 ════════════════════════════════
     서식 맨 아래는 거의 늘 이 두 줄이다:
         2026년      월      일
         지원자   ○  ○  ○      (인)
     표가 아니라 본문 문단이라 지금까지 «한 글자도» 안 채워졌다.

     ⚠ 여기서 하는 일은 «자리표 채우기»뿐이다 — 빈 자리와 ○○○ 만 바꾼다.
       이미 적힌 날짜(2026년 9월 5일)는 손대지 않는다. 사람이 일부러 적은 날일 수 있다.
     ⚠ 도장은 여기서 안 찍는다 — 그림이라 XML 조각이 다르다(kcareer-hwpstamp.js).
       「(인)」 글자도 지우지 않는다. 도장은 덮는 것이지 지우는 것이 아니다. */

  /* 문단 하나의 글자를 모아 본다 */
  function paraText(p) {
    var out = '', re = /<hp:t(?:\s[^>]*)?>([\s\S]*?)<\/hp:t>/g, m;
    while ((m = re.exec(p))) out += m[1];
    return out.replace(/<[^>]*>/g, '');
  }
  /* 문단의 «첫 글자 조각»에 새 글자를 넣고 나머지 조각은 비운다 */
  function setParaText(p, text) {
    var done = false;
    return p.replace(/(<hp:t(?:\s[^>]*)?>)([\s\S]*?)(<\/hp:t>)/g, function (m, a, inner, b) {
      if (!done) { done = true; return a + esc(text) + b; }
      return a + b;
    });
  }
  function pad2(n) { return String(n).padStart(2, '0'); }

  /* 「  년   월   일」의 빈자리를 오늘로 채운다. 이미 적힌 숫자는 그대로 둔다. */
  function fillDateLine(txt, today) {
    var y = today.getFullYear(), mo = today.getMonth() + 1, d = today.getDate();
    var hit = false;
    var out = txt.replace(
      /(\d{4})?([\s\u3000_]*)년([\s\u3000_]*)(\d{1,2})?([\s\u3000_]*)월([\s\u3000_]*)(\d{1,2})?([\s\u3000_]*)일/,
      function (m, Y, s1, s2, M, s3, s4, D, s5) {
        /* 셋 다 이미 적혀 있으면 손대지 않는다 */
        if (Y && M && D) return m;
        hit = true;
        return (Y || y) + '년 ' + (M || mo) + '월 ' + (D || d) + '일';
      });
    return hit ? out : null;
  }
  /* 「지원자 ○ ○ ○」의 이름 자리를 채운다. 이미 이름이 적혀 있으면 그대로 둔다. */
  /* ⚠ «안 잡는 괄호»(?:…)로 둔다. 잡는 괄호로 두면 이것을 다른 자 안에 끼울 때
       자리가 한 칸씩 밀려, 「빈 자리」를 읽으려던 것이 «라벨 낱말»을 읽는다.
       그러면 「지원자」를 이미 적힌 이름으로 보고 늘 손을 뗀다(2026-09-06 두 번 겪었다). */
  var SIGN_LABELS = /(?:지원자|신청인|신청자|응시자|작성자|제출자|본인|성명|추천인|위촉대상자|대표자)/;
  function fillSignLine(txt, name) {
    if (!name) return null;
    if (!SIGN_LABELS.test(txt)) return null;
    /* 라벨 뒤의 «이름 자리» — ○○○ · 빈칸 · 밑줄. 뒤에 (인)·(서명 또는 인)이 와도 좋다.
       ⚠ SIGN_LABELS 는 그 자체가 «잡는 괄호»다. 다시 (…) 로 감싸면 자리가 밀려
         m[2] 가 빈 자리가 아니라 «라벨 낱말»이 된다 — 그러면 「지원자」를 이미 적힌
         이름으로 보고 늘 손을 뗀다(실측 2026-09-06에 그랬다). 안 잡는 괄호로 감싼다.
       ⚠ 뒤에 이미 이름이 적혀 있으면(「지원자 홍길동 (인)」) 아예 안 잡힌다 —
         라벨 바로 뒤가 «빈 자리»여야 하기 때문이다. 그것이 옳다. */
    var re = new RegExp('((?:' + SIGN_LABELS.source + ')\\s*[:：]?)'
      + '([\\s\\u3000○◯□■●▢_＿×\\-–—]*?)'
      + '(?=\\s*[(（]\\s*(?:서명\\s*(?:또는|및)?\\s*)?인\\s*[)）]|\\s*$)');
    var m = re.exec(txt);
    if (!m) return null;
    /* 자리에 이미 «뜻 있는 글자»가 있으면 손대지 않는다 */
    if (/[가-힣A-Za-z]/.test(m[2])) return null;
    /* 자리가 아예 없으면(라벨 바로 뒤가 끝) 한 칸 띄워 넣는다 */
    return txt.replace(re, function (all, head) {
      return head + (/[\s\u3000]$/.test(head) ? '' : '  ') + name + '  ';
    });
  }

  /* 표 밖 문단만 골라 채운다.
     ⚠ 표 «안»의 문단은 건드리지 않는다 — 그쪽은 칸 단위로 이미 다룬다.
       표를 잠시 들어내고 본 뒤 도로 끼운다. */
  function fillParagraphs(xml, fields, report, today) {
    /* ⚠ 비탐욕 정규식으로 표를 가리면 안 된다 — 중첩 표에서 «안쪽» 닫는 태그에
       끊겨, 바깥 표의 나머지가 «표 밖»으로 새어 나온다. 그러면 표 «안»의 문단을
       표 밖 문단으로 잘못 보고 손대거나, 진짜 표 밖 문단을 못 본다
       (실측 2026-09-06: 「지원자 ○ ○ ○」 줄이 안 채워졌다).
       깊이를 세는 tagBlocks 로 «맨 바깥» 표만 통째로 가린다. */
    var 표 = [], i = 0;
    var 뼈 = '', 끝 = 0;
    tagBlocks(String(xml || ''), 'hp:tbl').forEach(function (b) {
      뼈 += String(xml).slice(끝, b.start) + '\u0000TBL' + 표.length + '\u0000';
      표.push(b.text); 끝 = b.end;
    });
    뼈 += String(xml).slice(끝);
    var out = 뼈.replace(/<hp:p\b[\s\S]*?<\/hp:p>/g, function (p) {
      var txt = paraText(p);
      if (!txt.trim()) return p;
      var 날 = fillDateLine(txt, today || new Date());
      if (날 && 날 !== txt) {
        report.paras = (report.paras || 0) + 1;
        report.fields.push({ key: 'date', value: 날.trim() });
        return setParaText(p, 날);
      }
      var 서명 = fillSignLine(txt, fields && fields.name);
      if (서명 && 서명 !== txt) {
        report.paras = (report.paras || 0) + 1;
        report.fields.push({ key: 'signName', value: fields.name });
        return setParaText(p, 서명);
      }
      return p;
    });
    return out.replace(/\u0000TBL(\d+)\u0000/g, function (m, n) { return 표[Number(n)]; });
  }

  /* ===== 입구 =====
     data = { fields:{name,birth,gender,phone,email,addr,license,org},
              edu:[{period,school,major}], career:[{period,org,role}] } */
  function autoFill(sectionXml, data, opts) {
    data = data || {};
    var report = { fields: [], lists: [], kept: [], placeholders: 0 };
    var xml = eachTable(sectionXml, function (tbl) {
      var t = fillFields(tbl, data.fields || {}, report);
      t = fillList(t, data, report, opts);
      return t;
    });
    /* 표를 다 본 뒤 «표 밖» 문단(날짜·지원자)을 채운다 */
    xml = fillParagraphs(xml, data.fields || {}, report, (opts && opts.today) || null);
    return { xml: xml, report: report, changed: xml !== sectionXml };
  }

  /* 사람이 읽을 한 줄 요약 — 「인적 4칸 · 학력 2줄 · 경력 8/12줄(칸 부족)」 */
  function summarize(report) {
    var parts = [];
    if (report.fields.length) parts.push('인적 ' + report.fields.length + '칸');
    (report.lists || []).forEach(function (l) {
      var name = l.kind === 'edu' ? '학력' : '경력';
      parts.push(name + ' ' + (l.put < l.total ? (l.put + '/' + l.total + '줄(칸 부족)') : (l.put + '줄')));
    });
    return parts.length ? parts.join(' · ') : '알아본 칸이 없습니다';
  }

  var api = {
    autoFill: autoFill, summarize: summarize,
    fieldKeyOf: fieldKeyOf, colKeyOf: colKeyOf,
    cellText: cellText, isEmptyCell: isEmptyCell, fillCell: fillCell, setCellText: setCellText,
    /* 중첩 표를 다루는 자 — 칸 지도도 «같은 것»을 쓴다 */
    tagBlocks: tagBlocks, hasInnerTable: hasInnerTable, ownPart: ownPart,
    /* 자리표 자·문단 채우기 — 검사와 칸 지도가 «같은 자»를 쓰게 내보낸다 */
    isPlaceholder: isPlaceholder, isBlankish: isBlankish, placeholderKey: placeholderKey,
    /* ⚠ 목록 줄 판정은 «이 하나»를 쓴다 — 칸 지도(kcareer-formmap)도 같은 자를 쓴다.
       두 곳에 따로 두면 「지도엔 빈 줄인데 안 채워지는」 어긋남이 생긴다. */
    isRowBlank: isRowBlank, bracketKey: bracketKey,
    colAddrOf: colAddrOf, rowShape: rowShape,
    fillParagraphs: fillParagraphs, paraText: paraText,
    /* 칸 지도(kcareer-formmap.js)가 «같은 자»를 쓰도록 내보낸다 —
       따로 만들면 두 곳의 셈이 어긋나 「지도에는 있는데 안 채워지는 칸」이 생긴다 */
    splitRows: splitRows, splitCells: splitCells, eachTable: eachTable, normLabel: normLabel,
    /* 학력 표에 미리 박아 둔 «급 이름»(고등학교·대학교·대학원) — 칸 지도가 같은 자를 쓴다.
       ⚠ 급은 값이 아니다. 세는 자와 채우는 자가 다르면 화면이 거짓을 말한다. */
    levelOf: levelOf,
    /* ⚠ 칸을 바꿀 때는 «반드시» 이것을 쓴다 — 빈 칸끼리는 XML 이 글자 하나까지
       똑같아서, 글자로 찾아 바꾸면 맨 앞의 빈 칸이 바뀐다(칸 지도도 같은 결함을 겪었다). */
    replaceCellAt: replaceCellAt,
    /* 「자택:____ 직장:____」 같은 칸 안 라벨 목록 — 입력판(kcareer-formhtml.js)이 같은 자를 쓴다.
       사전을 두 곳에 두면 한쪽만 늘어나 「화면엔 칸이 있는데 안 채워지는」 자리가 생긴다. */
    incellLabels: function () { return INCELL_LABELS.slice(); }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KcareerHwpxFill = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
