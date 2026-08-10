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
    getKey: null,      // () => Promise<string>  AI 키
    getNtsKey: null,   // () => Promise<string>  국세청 키(없으면 조회를 건너뛴다)
    delay: null        // (fn, ms) — 검사에서 기다림 없이 진행시키려고 주입받는다
  };

  function init(o) {
    o = o || {};
    deps.fetch = o.fetch || (typeof global.fetch === 'function' ? global.fetch.bind(global) : null);
    deps.getKey = o.getKey || null;
    deps.getNtsKey = o.getNtsKey || null;
    deps.delay = o.delay || function (fn, ms) { setTimeout(fn, ms); };
    return true;
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
    '\nkind 는 다음 중 하나입니다: card(명함), bizreg(사업자등록증), sme(중소기업확인서 또는 중견기업확인서), payslip(급여 관련 서류 — 급여명세서·임금대장·급여이체내역·４대보험 산정보수 등 사람의 임금 금액이 적힌 것), meeting(회의·현장 사진 — 사람들이 모여 있거나 사업장·작업 현장 모습), contract(계약서 — 자문계약서·위임계약서·용역계약서·수임약정서 등 우리 사무소와 업체가 맺은 약정 문서), other(위 여섯이 아님).' +
    '\nkind=card 이면 키: name(이름), company(회사명), dept(부서), title(직책), mobile(휴대폰), tel(직통전화), fax(개인팩스), email(이메일), companyTel(회사 대표번호), companyFax(회사 팩스), companyAddr(회사 주소), website(홈페이지), address(개인 주소), memo(기타 정보).' +
    '\nkind=bizreg 이면 키: company(상호/법인명), ceo(대표자), bizno(사업자등록번호), corpno(법인등록번호), openDate(개업연월일), bizType(업태), bizItem(종목), companyTel(대표번호), companyFax(팩스), address(사업장 소재지), memo(기타).' +
    '\nkind=sme 이면 키: company(상호/법인명), bizno(사업자등록번호), ceo(대표자), smeType(기업규모 — 소기업/중기업/중견기업 등), issueNo(발급번호), issueDate(발급일), expiry(유효기간 만료일), industry(주업종).' +
    /* 급여서류는 **금액을 읽지 않는다.** 어느 회사·언제 것인지만 담는다.
       임금 금액은 사람마다 다른 민감정보인데, 사진첩은 그것을 어디에도 쓰지 않으므로
       읽어 둘 이유가 없다. 읽어서 담으면 클라우드에 한 벌 더 쌓이는 위험만 는다. */
    '\nkind=payslip 이면 키: company(사업장·회사명), period(귀속 연월 — 2026-04 형식), docName(서류 이름 그대로 — 예 급여명세서·임금대장), memo(무엇에 쓰는 서류인지 한 줄). **금액과 사람 이름은 담지 마세요.**' +
    '\nkind=meeting 이면 키: memo(무엇을 하는 장면인지 한 줄), company(현장 간판·표지에 회사명이 보이면 그 이름, 없으면 빈 문자열).' +
    /* 계약서는 **금액도 담는다**(대표 지시 2026-08-10). 급여서류와 다르다 —
       급여는 사람마다 다른 임금이라 안 담지만, 계약 보수는 우리 사무소의
       수임 조건이라 나중에 찾아볼 일이 실제로 있다. */
    '\nkind=contract 이면 키: company(상대 업체 상호), ceo(상대 업체 대표자), docName(계약서 이름 그대로 — 예 자문계약서·위임계약서), signDate(계약 체결일 — 2026-08-10 형식), startDate(계약 시작일), endDate(계약 종료일 — 없으면 빈 문자열), term(계약 기간을 적은 그대로 — 예 1년, 자동연장), fee(월 자문료·용역비 — 적힌 그대로, 예 300,000원/월), retainer(착수금), success(성공보수 — 예 승소시 청구액의 10%), deposit(계약금), memo(위에 안 담긴 특약이나 눈여겨볼 조건 한 줄). **없는 항목은 빈 문자열로 두고 지어내지 마세요.**' +
    '\nkind=other 이면 kind 만 담으세요.' +
    /* 한글 우선(2026-08-07 대표 지시) — 명함은 같은 내용을 한글·영문으로 나란히
       적어 두는 일이 많다. 그때 영문을 담으면 **명함첩·업체관리에서 한글로 찾는
       사람이 못 찾고**, 같은 회사가 두 벌로 쌓인다. 그래서 읽을 수 있으면 한글이다.
       ⚠ 이메일·홈페이지까지 한글로 바꾸라는 말이 아니다 — 그건 원래 영문이다.
       ⚠ 없는 한글을 지어내지 말 것 — 영문 이름을 한글로 옮겨 적으면 실제와 다른
          회사명이 만들어져 업체관리에 잘못 들어간다. */
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

  var KINDS = { card: 1, bizreg: 1, sme: 1, payslip: 1, meeting: 1, contract: 1, other: 1 };

  /* ── 판독기 판 번호 ──
     읽어 둔 결과에 이 번호를 함께 적는다. 가릴 수 있는 종류를 늘리면 번호를
     올리고, 사진첩은 **옛 번호로 읽은 사진을 다시 읽는다.**
     이게 없어서 실제로 당했다(2026-08-06 대표 화면): 회의사진 탭이 0장인데
     기타서류에 6장이 앉아 있었다 — meeting·payslip 을 가르치기 전에 읽혀
     'other' 로 굳은 사진들이었다. 사람이 한 장씩 「다시 판독」을 눌러야만
     풀리는 상태는 자동 분류라고 할 수 없다.
     ⚠ 종류를 늘리거나 프롬프트를 고치면 이 번호를 반드시 올릴 것. */
  var READ_VERSION = 3;   // 1 = card·bizreg·sme·meeting·other / 2 = payslip 추가 / 3 = 한글 우선

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

  /* 모델을 차례로 시도한다. 기억해 둔 모델이 있으면 그것부터. */
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
  function read(dataUrl) {
    if (!deps.fetch) return Promise.resolve(fail('판독 준비가 되지 않았습니다'));
    var b64 = String(dataUrl || '').split(',')[1] || '';
    if (!b64) return Promise.resolve(fail('사진을 읽을 수 없습니다'));

    var keyP = deps.getKey ? Promise.resolve().then(deps.getKey) : Promise.resolve('');
    return keyP.catch(function () { return ''; }).then(function (key) {
      if (!key) return fail('AI 키가 없습니다 — 포털 설정에서 등록해 주세요');
      var body = {
        contents: [{ parts: [
          { inline_data: { mime_type: 'image/jpeg', data: b64 } },
          { text: PROMPT_ALL }
        ] }],
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

  function keysFrom(db) {
    return {
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
    autoOk: autoOk
  };
})(typeof window !== 'undefined' ? window : globalThis);
