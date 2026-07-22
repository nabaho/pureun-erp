'use strict';
// 푸른노무법인 — 전자위임장 서류/데이터 유틸 (브라우저 window.EsignDocs / Node 겸용)
// 1부: 순수 함수(검증·포맷·양식 문구) — Node 테스트 대상
// 2부: PDF/XLSX 생성(브라우저 전용) — Task 8에서 추가
(function (root) {

  // ── 주민/외국인등록번호 ──
  // 검증은 형식만 수행 — 2020.10 이후 발급분은 검증공식(체크섬)이 폐지되어
  // 체크섬 검사 시 정상 번호를 거부할 수 있음. 형식: 생년월일 6 + 성별코드(1-8) + 6자리.
  function fmtIdNo(v) {
    var d = String(v || '').replace(/[^0-9]/g, '');
    if (d.length !== 13) return String(v || '').trim();
    return d.slice(0, 6) + '-' + d.slice(6);
  }
  function validateIdNo(v) {
    var d = String(v || '').replace(/[^0-9]/g, '');
    if (d.length !== 13) return { ok: false, msg: '주민(외국인)등록번호 13자리를 입력해 주세요' };
    var mm = +d.slice(2, 4), dd = +d.slice(4, 6), g = +d[6];
    if (mm < 1 || mm > 12) return { ok: false, msg: '생년월일의 월이 올바르지 않습니다' };
    if (dd < 1 || dd > 31) return { ok: false, msg: '생년월일의 일이 올바르지 않습니다' };
    if (g < 1 || g > 8) return { ok: false, msg: '번호 형식이 올바르지 않습니다' };
    return { ok: true, msg: '' };
  }
  function maskIdNo(v) {
    var f = fmtIdNo(v);
    if (!/^\d{6}-\d{7}$/.test(f)) return f;
    return f.slice(0, 8) + '******';
  }

  // ── {{변수}} 치환 (pu-erp fillContractVars 패턴 준용) ──
  function fillVars(text, map) {
    var out = String(text || '');
    Object.keys(map || {}).forEach(function (k) {
      out = out.split('{{' + k + '}}').join(map[k] == null ? '' : String(map[k]));
    });
    return out;
  }

  // ── 양식 문구 (pu-erp.html CASE_CHEDANG_FORMS에서 이관 — 법적 문구 원문 유지) ──
  // 원문의 수기 기입란 표기({{근로자명}}/{{주민번호}}/{{근로자주소}}/{{계약일}})를
  // 전자위임장 공통 플레이스홀더({{이름}}/{{주민등록번호}}/{{주소}}/{{작성일}})로 치환.
  // 그 외 조항 문구는 원문 그대로(노무사 검토 대상).
  var ESIGN_FORMS = {
    delegationAgreement: {
      title: '위임약정서(임금체불)',
      body: '위   임   약   정   서\n\n본    인 (위임인)\n  이름 : {{이름}}\n  주민번호 : {{주민등록번호}}\n  주소 : {{주소}}\n  연락처 : {{근로자연락처}}\n  가족연락처(연락두절시) : {{가족연락처}}\n\n위임내용 : 미지급임금 등 체불 처리에 대한 일체의 사항 위임\n\n제1조[사건위임]\n  본인은 귀하에게 상기 사건의 처리에 관한 일체의 사항을 위임하고 대리사건에 관하여는 별도의 위임장에 기재된 권한을 귀하에게 수여한다.\n\n제2조[보수]\n  ① 본인은 사건처리를 위임함에 있어 착수금으로 금 {{착수금}}원(부가세포함)을 선지급한다.\n  ② 귀하는 착수금을 수령한 이후부터 위임사무를 개시한다.\n  ③ 착수금은 약정해지여부 및 사건처리결과에 관계없이 반환을 청구할 수 없으며 아래 제3조 성공보수지급시 공제하지 아니한다.\n\n제3조[성공보수]\n  ① 사건처리결과 성공한 때에는 총 수령금의 {{성공보수율}}(부가세포함)을 성공보수로 지급한다.\n\n제4조[사건을 성공으로 보는 경우] 다음의 경우에는 위임사무가 성공된 것으로 보고 제3조의 성공보수를 지급한다.\n  ① 위임사무 착수 후 본인이 귀하의 동의 없이 임의로 계약해지, 신청(청구)의 포기 및 취하, 화해한 때\n  ② 본인이 이 약정서에 정한 의무를 이행치 않거나 진술한 사실이 허위인 까닭에 귀하가 위임계약을 해지한 때\n  ③ 귀하의 책임없는 사유로 인하여 사건처리가 종결될 때\n\n제5조[자료제출]\n  본인은 위임사무를 원활히 행하는데 필요한 자료제출 요구에 적극 조력하며 귀하는 본인이 제시한 자료의 범위내에서 책임을 진다.\n\n제6조[인장사용] 본인은 위임사무의 필요한 범위에서 인장사용에 대하여 승인한다.\n\n제7조[자료의 보관]\n  ① 본인이 사무처리를 위하여 제공한 서류와 자료는 본인이 이 약정서에 정한 의무를 이행치 않을 때에 귀하가 이를 유치하여도 이의를 제기하지 않는다.\n  ② 위임사무가 종료된 때부터 3년이 경과한 때에는 귀하가 전항의 서류와 자료를 폐기하여도 이의를 제기하지 않는다.\n\n제8조[계약의 해지]\n  본인이 이 약정서에 정한 의무를 이행치 않을 때 또는 위임사무의 내용에 대하여 본인이 진술한 사실이 허위인 때에는 고의가 아닌 경우라도 귀하는 이 위임계약을 해제할 수 있다.\n\n제9조[성공보수 미지급시]\n  ① 위임인은 사건의 성공으로 금품을 지급받은 다음날부터 1주일 이내 수임인에게 성공보수를 지급한다.\n  ② 위임인이 수임인에게 성공보수를 지급하지 않은 경우 금품을 지급받은 다음날로부터 7일후 부터 연 15%의 이자를 지급한다.\n\n제10조[특별사항]\n  퇴직금등 기타 금액에 대하여 대리인이 위임인을 대신하여 수령할 수 있고, 이를 수령한 경우 성공보수를 제하고 위임인에게 지급할 수 있다.\n\n{{작성일}}\n\n위임인 :  {{이름}}                  (인)\n\n푸른노무법인 대표 권형하 노무사       (인)'
    },
    delegation: {
      title: '위임장',
      body: '위        임        장\n\n사 무 소 명 : 푸른 노무법인\n소   재   지 : 충남 천안시 서북구 원두정8길 6, 두정빌딩 3층\n연   락   처 : TEL 041-556-0035   FAX 041-556-3656\n이메일주소 : 370-6@daum.net\n\n성         명 : 대표 / 공인노무사   권 형 하\n                           공인노무사   박 한 별\n                           공인노무사   김 혜 민\n                           공인노무사   박 재 원\n\n상기인을 공인노무사법 제2조 제1항의 규정에 의하여 대리인으로 선임하고 아래 사항의 처리에 관한 일체의 권한을 위임합니다.\n\n---------------- 아         래 ----------------\n\n미지급임금 등 체불 처리에 대한 일체의 사항 위임\n\n{{작성일}}\n\n위임인 :  {{이름}}                  ( 서 명 )\n연락처 :  {{근로자연락처}}'
    },
    privacyConsent: {
      title: '개인정보 수집·이용·제공 동의서',
      body: '개인정보 제공 동의서\n\n성         명 : {{이름}}\n자 택 주 소 : {{주소}}\n연   락   처 : {{근로자연락처}}\n\n1. 본인은 아래 내용에 대하여 사전에 충분히 인지하였으며, \'개인정보보호법\' 등에 의해 보호되고 있는 본인에 관한 아래 정보자료를 푸른노무법인에서 수집·이용하는 것에 동의합니다.\n\n[개인정보항목]\n  가. 성명\n  나. 주소, 이메일, 연락처\n  다. 학력, 근무경력, 등록번호\n  라. 기타 관련된 개인정보\n\n[수집·이용목적]\n  가. 회원서비스의 기초자료\n  나. 회비산출의 근거자료\n  다. 회원에 대한 추천 등 실적증명자료\n  라. 제도개선, 동향파악등 기초자료\n\n[보유기간] 가입 후 탈퇴시까지\n\n개인정보의 수집·이용에 대해 ( ■ 동의함  □ 동의하지 않음 )\n\n2. 본인은 상기 개인정보에 대한 동의와 별도로 아래의 민감정보와 고유식별정보를 수집·이용하는 것에 동의합니다.\n\n[민감정보 항목]\n  가. 신체장애\n  나. 국가보훈대상\n  다. 병력\n  라. 범죄경력\n\n[수집·이용목적]\n  가. 우선채용대상자격 및 정부지원금(장려금 등)\n  나. 인사이동, 업무적합성판단, 기타 인적자원관리\n\n민감정보 수집·이용에 대해 ( ■ 동의함  □ 동의하지 않음 )\n\n[고유식별정보 항목]\n  가. 주민등록번호(외국인의 경우 외국인등록번호)\n\n[수집·이용목적]\n  가. 개인정보식별\n  나. 자격확인\n\n고유식별정보의 수집·이용에 대해 ( ■ 동의함  □ 동의하지 않음 )\n\n{{작성일}}\n\n서명 또는 (인) :  {{이름}}'
    }
  };

  // ══════════ 2부: 서류 생성 (브라우저 전용 — html2canvas/jsPDF/XLSX는 호출 페이지가 CDN 로드) ══════════
  var IS_BROWSER = (typeof document !== 'undefined');

  // A4 1페이지 서식 공통 래퍼 (맑은 고딕 렌더 → 래스터화라 폰트 임베드 불필요)
  function pageWrap(inner) {
    return '<div style="width:794px;min-height:1123px;padding:70px 60px;background:#fff;' +
      "font-family:'Malgun Gothic','맑은 고딕',sans-serif;font-size:14px;line-height:1.9;color:#111;box-sizing:border-box\">" +
      inner + '</div>';
  }
  function personVars(person, caseMeta) {
    return {
      '이름': person.name, '주민등록번호': person.idNo, '주소': person.addr,
      '근로자연락처': person.phone || '',
      '회사명': (caseMeta && caseMeta.company) || '', '작성일': (person.consentAt || '').slice(0, 10)
    };
  }
  function sigBlock(person) {
    return '<div style="margin-top:40px;text-align:right">' +
      '<span style="font-size:14px">위임인: ' + person.name + ' </span>' +
      '<img src="' + person.sigPng + '" style="height:60px;vertical-align:middle;border-bottom:1px solid #999">' +
      '<span style="font-size:12px;color:#555"> (서명)</span></div>';
  }

  // 위임약정서 + 위임장 (1인분, 1페이지)
  function buildDelegationHtml(person, caseMeta) {
    var v = personVars(person, caseMeta);
    return pageWrap(
      '<h2 style="text-align:center;font-size:22px;letter-spacing:8px;margin-bottom:24px">위 임 장</h2>' +
      '<div style="white-space:pre-wrap">' + fillVars(ESIGN_FORMS.delegation.body, v).replace(/\{\{[^}]+\}\}/g, '________') + '</div>' +
      '<hr style="margin:26px 0;border:none;border-top:1px dashed #999">' +
      '<h3 style="text-align:center;font-size:16px;margin-bottom:14px">' + ESIGN_FORMS.delegationAgreement.title + '</h3>' +
      '<div style="white-space:pre-wrap;font-size:12.5px;line-height:1.7">' + fillVars(ESIGN_FORMS.delegationAgreement.body, v).replace(/\{\{[^}]+\}\}/g, '________') + '</div>' +
      sigBlock(person) +
      '<div style="margin-top:16px;font-size:12px;color:#555">작성일: ' + v['작성일'] + ' · 전자제출(푸른노무법인 전자위임 시스템)</div>'
    );
  }

  // 개인정보 수집·이용·제공 동의서 (1인분)
  function buildConsentHtml(person, caseMeta) {
    var v = personVars(person, caseMeta);
    return pageWrap(
      '<h2 style="text-align:center;font-size:20px;margin-bottom:24px">' + ESIGN_FORMS.privacyConsent.title + '</h2>' +
      '<div style="white-space:pre-wrap">' + fillVars(ESIGN_FORMS.privacyConsent.body, v).replace(/\{\{[^}]+\}\}/g, '________') + '</div>' +
      '<div style="margin-top:24px">동의 일시: ' + String(person.consentAt || '').replace('T', ' ').slice(0, 16) + ' (전자 동의)</div>' +
      sigBlock(person)
    );
  }

  // HTML 배열 → 각 1페이지 PDF (pu-erp buildPayslipPdfBase64 패턴: 화면 밖 렌더 → html2canvas → jsPDF)
  async function htmlPagesToPdf(htmlArray, fileName) {
    if (!IS_BROWSER) throw new Error('브라우저 전용');
    var pdf = new jspdf.jsPDF({ unit: 'pt', format: 'a4' }); // 595 x 842pt
    for (var i = 0; i < htmlArray.length; i++) {
      var host = document.createElement('div');
      host.style.cssText = 'position:fixed;left:-9999px;top:0;z-index:-1';
      host.innerHTML = htmlArray[i];
      document.body.appendChild(host);
      var canvas = await html2canvas(host.firstChild, { scale: 1.5, useCORS: true, backgroundColor: '#ffffff' });
      host.remove();
      var imgH = 842, imgW = Math.min(595, canvas.width / canvas.height * 842);
      if (i > 0) pdf.addPage();
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.85), 'JPEG', (595 - imgW) / 2, 0, imgW, imgH);
    }
    pdf.save(fileName);
  }

  // 진정인 연명부 XLSX
  function downloadRosterXlsx(persons, caseMeta) {
    var rows = persons.map(function (p, i) {
      return { '순번': i + 1, '성명': p.name, '주민등록번호': p.idNo, '연락처': p.phone,
        '주소': p.addr, '입사일': p.joinDate || '', '퇴사일': p.leaveDate || '', '입금계좌': p.bank };
    });
    var ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{wch:5},{wch:10},{wch:16},{wch:15},{wch:40},{wch:11},{wch:11},{wch:24}];
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '진정인 연명부');
    XLSX.writeFile(wb, ((caseMeta && caseMeta.title) || '사건') + '_진정인연명부.xlsx');
  }

  // 체불/체당금 정리 XLSX — 기존 소액체당금 정리 엑셀 열 구조(개인정보 + 월별 체불 + 퇴직금 + 합계)
  function downloadArrearsXlsx(persons, arrearsMap, caseMeta) {
    var rows = persons.map(function (p, i) {
      var a = (arrearsMap && arrearsMap[p._subId]) || {};
      var m1 = +a.month1 || 0, m2 = +a.month2 || 0, m3 = +a.month3 || 0, sev = +a.severance || 0;
      return { '순번': i + 1, '성명': p.name, '주민등록번호': p.idNo, '연락처': p.phone, '주소': p.addr,
        '입사일': p.joinDate || '', '퇴사일': p.leaveDate || '', '입금계좌': p.bank,
        '체불임금(1개월차)': m1, '체불임금(2개월차)': m2, '체불임금(3개월차)': m3,
        '체불퇴직금': sev, '체불총액': m1 + m2 + m3 + sev };
    });
    var ws = XLSX.utils.json_to_sheet(rows);
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '체불임금정리');
    XLSX.writeFile(wb, ((caseMeta && caseMeta.title) || '사건') + '_체불임금정리.xlsx');
  }

  var api = {
    fmtIdNo: fmtIdNo, validateIdNo: validateIdNo, maskIdNo: maskIdNo,
    fillVars: fillVars, ESIGN_FORMS: ESIGN_FORMS,
    buildDelegationHtml: buildDelegationHtml, buildConsentHtml: buildConsentHtml,
    htmlPagesToPdf: htmlPagesToPdf, downloadRosterXlsx: downloadRosterXlsx, downloadArrearsXlsx: downloadArrearsXlsx
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.EsignDocs = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
