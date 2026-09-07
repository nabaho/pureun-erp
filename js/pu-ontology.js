/* 푸른통합시스템 온톨로지 v3
   - 기존 운영 데이터는 정본으로 그대로 둔다.
   - 이 모듈은 읽기·진단·관계 후보 생성만 하며 저장하거나 삭제하지 않는다.
   - 새 프로그램은 PROGRAMS와 TERMS에 먼저 등록한 뒤 데이터를 만든다. */
(function(root, factory){
  var api = factory();
  if(typeof module === 'object' && module.exports) module.exports = api;
  if(root) root.PuOntology = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function(){
  'use strict';

  var VERSION = 3;
  var TERMS = {
    provenanceFields:{originSystem:'수집 원본 시스템',originId:'수집 원본 영구 ID'},
    companyLinkStates:{linked:'업체 ID 확인',pending:'업체 연결 보류',not_required:'근로자 의뢰 — 업체 연결 없음'},
    entityTypes: {
      Organization:'업체·기관', Person:'사람', Employment:'재직관계', Contract:'계약',
      Case:'사건', Project:'사업·컨설팅', Task:'업무', ScheduleEvent:'일정',
      FinancialTransaction:'입출금', Invoice:'세금계산서', Document:'문서',
      MediaAsset:'사진·첨부', Message:'메일·알림', PayrollRecord:'임금기록',
      Policy:'규정·정책', Submission:'제출·전자송부'
    },
    predicates: {
      belongsToOrganization:['Person','Organization'],
      contractedWith:['Contract','Organization'],
      concerns:['Case','Organization'],
      projectFor:['Project','Organization'],
      assignedTo:['Contract|Case|Project|Task|ScheduleEvent','Person'],
      assists:['Contract|Case|Project|Task','Person'],
      derivedFrom:['Organization|Contract|Case|Project|Task|Document|Submission','Contract|Case|Project|Document'],
      paidFor:['FinancialTransaction','Contract|Case|Project|Organization'],
      invoicedTo:['Invoice','Organization'],
      scheduledFor:['ScheduleEvent','Organization|Contract|Case|Project|Person'],
      evidencedBy:['Contract|Case|Project|FinancialTransaction','Document|MediaAsset'],
      attachedTo:['Document|MediaAsset|Message','Organization|Contract|Case|Project|Person'],
      ownedBy:['Document|MediaAsset|Message','Person'],
      transferredTo:['Task|Case|Project','Person'],
      forOrganization:['Task|Document|MediaAsset|Message|PayrollRecord|Policy|Submission','Organization'],
      fulfills:['Submission','Contract|Case|Project'],
      supersedes:['Policy|Document','Policy|Document'],
      /* 인사·급여 기록 → 그 기록의 «주인»(사번). 2026-09-04.
         ⚠ 이 넷(근로계약·근태·휴가·급여)은 «푸른노무법인 직원» 자료다 —
           고객 사업장 자료가 아니다(companyId 칸이 아예 없다).
           고객사 근로자는 사건(cases)의 workers 안에 있고, 사건은 이미 업체에 붙는다.
         ⚠ 관계어를 하나만 만든다 — Employment 와 PayrollRecord 를 갈라 두 개를
           만들면 사전에 말만 늘고 쓰는 자리는 같다. */
      recordedFor:['Employment|PayrollRecord','Person']
    }
  };

  /* 포털 APPS의 key와 1:1로 맞춘다. 한 프로그램이 여러 뿌리를 읽어도
     자신이 정본으로 소유하는 뿌리는 primaryRoots에만 적는다. */
  var PROGRAMS = {
    /* ⚠ 소유 저장뿌리는 «코드가 쓰는 자리»를 다 적는다 — 하나라도 빠지면
       그 자료는 온톨로지가 영영 못 본다. tests/ontology-registry.test.js 가
       앱·서버가 실제로 쓰는 뿌리를 훑어 여기와 맞춘다. */
    erp:{ name:'푸른이알피', file:'pu-erp.html', primaryRoots:['data','improve_requests','hanaSmsBridge','ieum_public'],
      entityTypes:['Organization','Person','Employment','Contract','Case','Project','ScheduleEvent','FinancialTransaction','Invoice','PayrollRecord','Policy'] },
    consult:{ name:'정부사업일정', file:'gov-consulting.html', primaryRoots:['scal_roundlog','activeWriter/gov_consulting'],
      sharedRoots:['data/consultings','puphotos'], entityTypes:['Organization','Person','Project','ScheduleEvent','MediaAsset'] },
    work:{ name:'업무관리', file:'work.html', primaryRoots:['work_erp'], sharedRoots:['data','pucards/idx'],
      entityTypes:['Person','Organization','Task','ScheduleEvent'] },
    career:{ name:'경력관리', file:'kcareer.html', primaryRoots:['kcareer/{uid}','kcareer_inbox','kcareer_pub'], sharedRoots:['data'],
      entityTypes:['Person','Employment','Project','Document'] },
    /* 정부사업신청 — 나라장터·알리오·기업마당 공고를 모아 본다(대표 지시 2026-09-05).
       ⚠ 경력관리와 «다른 집»이다. 여기 담기는 것은 «아직 안 한 일»(공고·기회)이고
         경력관리는 «이미 한 일»(실적)이다. 섞으면 지원서에 안 한 일이 실적으로 들어간다.
       빌려 읽는 곳: data/user_dir(대표인지 확인) · uid_roles(권한). 쓰지는 않는다. */
    govbid:{ name:'정부사업신청', file:'gov.html', primaryRoots:['gov/{uid}'], sharedRoots:['data/user_dir','uid_roles'],
      entityTypes:['Organization','Project','Document'] },
    /* ⚠ 저장 자리가 둘이다 — 옛 자리(pucards/mailbox)와 지금 쓰는 자리(mailbox).
       다음메일함 통째 동기화(functions/mail-sync.js)는 «최상위 mailbox» 에 담는다.
       등록부에 없던 탓에 2026-09-05 까지 온톨로지가 그 자료를 못 보고 있었다. */
    mail:{ name:'푸른 메일', file:'pu-cards.html?view=mail', primaryRoots:['pucards/mailbox','pucards/sentBox','pucards/scheduled','mailbox'],
      entityTypes:['Person','Organization','Message','Document'] },
    cards:{ name:'기업정보함', file:'pu-cards.html', primaryRoots:['pucards'], sharedRoots:['data/companies'],
      entityTypes:['Organization','Person','Document','MediaAsset','Message'] },
    photos:{ name:'사진첩', file:'pu-photos.html', primaryRoots:['puphotos'], sharedRoots:['pucards/coInfo'],
      entityTypes:['Person','Organization','Document','MediaAsset'] },
    fund:{ name:'기금관리', file:'fund.html', primaryRoots:['data/funds'], sharedRoots:['data/finance_income','pucards/idx','pucards/coInfo'],
      entityTypes:['Organization','Person','Project','FinancialTransaction','Document'] },
    rules:{ name:'취업규칙 관리', file:'rules.html', primaryRoots:['chwieop','rules_mgmt'], sharedRoots:['data/user_dir'],
      entityTypes:['Organization','Person','Policy','Document'] },
    docs:{ name:'문서관리', file:'docs-esign.html', primaryRoots:['esign'],
      entityTypes:['Organization','Person','Case','Document','Submission'] },
    payroll:{ name:'급여관리', file:'payroll-os.html', primaryRoots:['payroll_os'], sharedRoots:['data/user_dir'],
      entityTypes:['Organization','Person','Employment','PayrollRecord','Document'] },
    paydata:{ name:'급여데이터함', file:'pu-paydata.html', primaryRoots:['paydata'],
      entityTypes:['Organization','Person','PayrollRecord','Document','Message'] },
    home:{ name:'홈페이지 관리', file:'pu-home.html', primaryRoots:['homepage'], sharedRoots:['kcareer/{uid}/ls'],
      entityTypes:['Person','Organization','Document'] },
    /* 뉴스레터 관리 — 주간뉴스레터를 짓고 보낸다.
       소유: newsletter (설정·회차 초안·받는 명단).
       빌려 읽는 곳: homepage/newsBrief(자동으로 담을 기사) · pucards/scheduled(보낸 결과)
                   · mailbox(반송·자동회신을 찾는다 — 읽기만 한다).
       ⚠ 명단은 «여기가 정본»이다 — 기업정보함 명함을 실시간으로 끌어오지 않는다.
         끌어오면 명함 한 장이 바뀔 때 누구에게 갈지가 조용히 달라진다. */
    news:{ name:'뉴스레터 관리', file:'pu-news.html', primaryRoots:['newsletter','ilabor'],
      sharedRoots:['homepage/newsBrief','pucards/scheduled','mailbox'],
      entityTypes:['Organization','Person','Message','Document'] }
  };

  /* ══ 업체 고유번호 — 「머리 + 몸통」 (대표 지시 2026-09-03) ══════════════
     `자문-10001` 처럼 적는다.
       · 머리(자문·급여·노조·기금·대행·미정) = «뜻». 업무가 바뀌면 머리도 바뀐다.
       · 몸통(10001) = «열쇠». 한 번 주면 절대 안 바뀌고 재사용도 없다.
     ★★ 연결·검색·색인은 «몸통만» 본다.
       머리까지 붙여 이으면 자문이 급여로 바뀌는 날 조용히 끊긴다.
       그것이 이 설계의 전부다 — 뜻을 담되 뜻으로 잇지 않는다.
     ⚠ 지금 쓰는 내부 열쇠(`id`)는 «그대로» 둔다. 계약·사건·기금·입출금·
       세금계산서·사진 서류·명함이 전부 그것으로 이어져 있다.
       이 번호는 사람·엑셀·전화가 쓰는 칸을 «덧붙이는» 것이다. */
  var COMPANY_NUMBER = { min:10001, max:99999, digits:5, seqPath:'data/co_no_seq' };
  var COMPANY_NUMBER_HEADS = {
    자문:'노무자문', 급여:'급여 대행', 노조:'노사관계', 기금:'근로복지기금',
    대행:'사무대행 전용 등록', 미정:'업무 종류를 아직 안 정함'
  };
  /* 머리는 지금 상태에서 «다시 계산»한다 — 그래서 유형을 고치면 머리가 따라온다.
     ⚠ 사무대행 «전용» 등록이 이긴다. 자문이면서 사무대행을 겸하는 곳은
       머리가 `자문`이고 대행은 딱지로 따로 보인다
       (사무대행은 유형이 아니라 겸하는 일이다 — 대표 지시 2026-08-31). */
  function companyNumberHead(co){
    co = co || {};
    if(clean(co.status) === 'suboffice') return '대행';
    var t = clean(co.typeCode);
    return COMPANY_NUMBER_HEADS[t] ? t : '미정';
  }
  function companyNumberBody(co){
    var n = Number(co && co.puNo);
    if(!isFinite(n) || Math.floor(n) !== n) return 0;
    return (n >= COMPANY_NUMBER.min && n <= COMPANY_NUMBER.max) ? n : 0;
  }
  function formatCompanyNumber(co){
    var body = companyNumberBody(co);
    return body ? companyNumberHead(co) + '-' + body : '';
  }
  /* 사람이 적은 글에서 «몸통만» 뽑는다. 머리는 버린다 — 옛 번호로도 찾히게.
     ⚠⚠ 「끝에 붙은 다섯 자리」로 찾으면 안 된다 — 사업자번호 312-81-95374 의
       끝 다섯 자리(95374)를 고유번호로 읽어 엉뚱한 업체를 연다(2026-09-03 실제로 그랬다).
       숫자를 «다 모아» 정확히 다섯 자리일 때만 고유번호로 본다. */
  function parseCompanyNumber(text){
    var digits = clean(text).replace(/\D/g, '');
    if(digits.length !== COMPANY_NUMBER.digits) return 0;
    var n = Number(digits);
    return (n >= COMPANY_NUMBER.min && n <= COMPANY_NUMBER.max) ? n : 0;
  }
  /* 부여 순서 — 오래된 것부터. 다시 돌려도 «같은 번호»가 나와야 한다. */
  function companyNumberOrder(list){
    return arr(list).slice().sort(function(a,b){
      var ka = clean(a.createdAt) || clean(a.contractStartDate) || clean(a.firstContractDate) || '9999';
      var kb = clean(b.createdAt) || clean(b.contractStartDate) || clean(b.firstContractDate) || '9999';
      if(ka !== kb) return ka < kb ? -1 : 1;
      var na = clean(a.name||a.companyName), nb = clean(b.name||b.companyName);
      if(na !== nb) return na.localeCompare(nb, 'ko');
      return clean(a.id).localeCompare(clean(b.id));
    });
  }
  /* 이미 번호가 있는 곳은 «절대» 건드리지 않는다. 지운 업체도 세지 않는다. */
  function companyNumberTargets(list){
    return companyNumberOrder(arr(list).filter(function(c){ return c && !companyNumberBody(c); }));
  }
  function validateCompanyNumbers(list){
    var errors=[], warnings=[], seen={};
    arr(list).forEach(function(c){
      var body=companyNumberBody(c);
      if(!body){
        if(c && c.puNo !== undefined && c.puNo !== null && clean(c.puNo) !== '')
          errors.push({id:clean(c.id), message:'고유번호가 쓸 수 없는 값입니다: '+clean(c.puNo)});
        return;
      }
      if(seen[body]) errors.push({id:clean(c.id), message:'고유번호 '+body+' 가 두 곳에 있습니다(먼저: '+seen[body]+').'});
      else seen[body]=clean(c.id);
      var head=companyNumberHead(c), kept=clean(c.puNoHead);
      if(kept && kept!==head)
        warnings.push({id:clean(c.id), message:'머리가 '+kept+' 로 적혀 있는데 지금 유형은 '+head+' 입니다 — 이력을 남기고 고치세요.'});
    });
    return {ok:errors.length===0, errors:errors, warnings:warnings, readOnly:true};
  }
  /* 머리가 바뀌면 «그 자리에» 기록을 쌓는다 — 옛 번호로 찾아도 지금 번호로 데려가려고. */
  function companyNumberHistory(co, at, by){
    co = co || {};
    var head = companyNumberHead(co), kept = clean(co.puNoHead);
    var log = Array.isArray(co.puNoHistory) ? co.puNoHistory.slice() : [];
    if(kept === head) return {changed:false, head:head, puNoHistory:log};
    log.unshift({head:head, from:kept||'', at:clean(at)||new Date().toISOString(), by:clean(by)});
    return {changed:true, head:head, puNoHistory:log.slice(0,20)};
  }

  /* ── 등록부 밖에 있던 화면들 (2026-09-03) ──
     예전 검사는 «포털 타일 목록»만 봤다. 그런데 타일 없이 주소로 들어가는 화면이
     다섯이나 있었다 — 근로자가 폰으로 여는 제출 쪽, 이음센터 근무표 보기,
     취업규칙 작성기, 카메라, 설치 안내. 그 다섯이 검사를 통째로 안 지났다.
     ⚠ 딸린 화면은 «자기 저장뿌리를 갖지 않는다» — 주인 프로그램의 자리에 쓴다.
       자기 자리를 갖는다면 딸린 화면이 아니라 프로그램이므로 PROGRAMS 에 넣는다. */
  var PORTAL_FILE = 'enter.html';
  var SATELLITES = {
    ieum_view:{ name:'이음센터 근무일정 보기', file:'ieum-view.html', program:'erp',
      note:'이알피가 낸 근무표를 익명으로 보는 창 — 여기서 쓰지 않는다' },
    rules_writer:{ name:'취업규칙 작성기', file:'chwieop.html', program:'rules',
      note:'취업규칙 관리 안에 끼워 넣어 쓴다' },
    camera:{ name:'푸른카메라', file:'pu-camera.html', program:'photos',
      note:'사진을 찍어 사진첩에 넣는 입구' },
    esign_submit:{ name:'전자위임장 제출', file:'sign.html', program:'docs',
      note:'근로자가 폰으로 제출하는 쪽 — 문서관리가 받는다' }
  };
  var EXCLUDED_SCREENS = {
    'install.html':'포털 설치 안내 — 업무 자료를 담지 않는다',
    'fund-poc.html':'기금관리 실험 화면 — 운영에 쓰지 않는다'
  };

  /* ── 밑바탕 자리 — 업무 개체가 아니다 ──
     권한·접속·백업·요금 같은 것은 «누구의 업무 자료»가 아니라 시스템의 살림이다.
     온톨로지 개체로 만들지 않지만, 여기 안 적어 두면 「주인 없는 자리」로 걸린다. */
  var INFRA_ROOTS = {
    uid_roles:'권한', presence:'접속 표시', appBuild:'배포 판 번호', config:'공용 설정',
    billing:'요금 급증 감시', backup_key:'백업 열쇠', serverBackups:'서버 백업',
    serverBackupsIndex:'서버 백업 색인', serverBackupsRecentIndex:'서버 백업 최근 색인',
    systemBackups:'백업', systemBackupsIndex:'백업 색인', systemRestoreLog:'되살리기 기록',
    systemAlerts:'경보', exportLog:'내보내기 기록', exportLogTidy:'내보내기 기록 청소',
    exportSeen:'내보내기 확인', pureun_v6:'2026-05 에 멈춘 옛 사본 — 살아 있는 자리가 아니다'
  };

  /* ── 사전에만 있고 아직 만들지 않는 관계어 ──
     ⚠ 여기 적지 않은 관계어는 «코드가 실제로 만들어야» 한다
       (tests/ontology-registry.test.js). 사전에 말만 늘어나는 것을 막는다. */
  var PREDICATES_PLANNED = {
    belongsToOrganization:'사람→사업장 재직 — 사업장 근로자에게 영구 번호가 없어 미룸(2026-09-03 대표 ①: 일·기록을 사업장에만 붙인다)',
    evidencedBy:'업무→증빙 — 사진첩 서류를 업무에 붙이는 일은 다음 단계',
    transferredTo:'업무 인계 — 인계 기록에 영구 ID가 아직 없다',
    fulfills:'계약 이행 — 어떤 일이 계약을 채웠는지 기준이 없다',
    supersedes:'개정 관계 — 취업규칙 대조표를 통합 화면에서 읽지 않는다'
  };

  var STORE_TYPES = {
    companies:'Organization', user_accounts:'Person', user_dir:'Person', contracts:'Contract',
    cases:'Case', consultings:'Project', funds:'Project', other_projects:'Project',
    my_work_items:'Task', my_schedules:'ScheduleEvent', finance_income:'FinancialTransaction',
    finance_expense:'FinancialTransaction', finance_invoice:'Invoice', payroll_monthly:'PayrollRecord',
    employment_contracts:'Employment', attendance_records:'Employment', leave_of_absence:'Employment'
  };
  var COMPANY_STORES = ['contracts','cases','consultings','funds','other_projects','finance_income','finance_expense','finance_invoice','my_schedules'];
  var STAFF_STORES = ['contracts','cases','consultings','funds','other_projects','my_work_items','my_schedules'];
  /* 인사·급여 기록은 «사번»으로 사람에게 붙는다 (대표 판단 2026-09-04 「1」).
     ⚠ 사번 칸 이름이 갈래마다 다르다 — 급여는 empSid, 나머지는 sid.
       한쪽만 보면 급여가 통째로 안 붙는다(실제로 화면 두 곳이 그 흠으로 늘 비어 있었다).
     ⚠ 이름으로는 절대 안 맞춘다. 사번이 없으면 «안 잇고 알린다». */
  var PERSON_RECORD_STORES = ['employment_contracts','attendance_records','leave_of_absence','payroll_monthly'];
  function personSidOf(r){ return clean(r && (r.sid || r.empSid || r.ownerSid)); }
  var SOURCE_KIND_STORE = { company:'companies', contract:'contracts', case:'cases', consulting:'consultings', fund:'funds', other:'other_projects' };

  /* 2단계 읽기 어댑터. payload(사진 원본·문서 본문·제출 암호문·급여 직원표)는
     통합 화면에서 절대 읽지 않는다. in_app은 해당 프로그램 안에서만 진단한다. */
  var READ_ADAPTERS = {
    erp_core:{program:'erp',strategy:'local',path:'data',parser:'erp'},
    consult_core:{program:'consult',strategy:'local',path:'data/consultings',parser:'erp'},
    fund_core:{program:'fund',strategy:'local',path:'data/funds',parser:'erp'},
    work_items:{program:'work',strategy:'remote',path:'work_erp/items',parser:'workItems'},
    career_counts:{program:'career',strategy:'remote',path:'kcareer/{uid}/counts',parser:'coverage'},
    /* ⚠★ strategy:'local' 이다 — gov/{uid} 안에는 공공데이터포털·기업마당 «인증키»가 있다.
       remote 로 바꾸면 통합진단이 열쇠를 통째로 읽어 간다. 바꾸지 말 것. */
    gov_feed:{program:'govbid',strategy:'local',path:'gov/{uid}/feed',parser:'coverage'},
    cards_index:{program:'cards',strategy:'remote',path:'pucards/idx',parser:'cardIndex'},
    /* ── 기업 상세·근로자 정보함 (대표 지시 2026-09-02) ──
       예전에는 기업정보함에서 pucards/idx 하나만 읽었다. 값이 모여 있는 곳은 coInfo 다.

       ⚠⚠ 여기 적혀 있던 「두 자리 모두 «가벼운 자료»다」는 **틀린 말이었다**(2026-09-04).
         coInfo 한 칸에는 pu-cards.html 의 CO_FIELDS 서른 칸이 들어 있고, 그 안에
         **계좌번호(온전히)·예금주·직전년도 매출액·생년월일**이 있다.
         진단을 한 번 돌릴 때마다 그것이 4,158곳어치 브라우저 메모리로 내려온다.
         CLAUDE.md 「관계 진단은 경량 메타데이터만 읽는다」와 어긋난다.
       ★ 그래서 «무거운 자리»로 밝히고, 켤 때만 읽는다(heavy). 숨기지 않는다 —
         안 읽었으면 무엇이 빠졌는지 화면이 말한다.
       ⚠ 저장되는 것에는 그 칸들이 «안 들어간다» — putEntity 는 label 만 담는다.
         문제는 저장이 아니라 «내려받는 것»이다(요금 + 화면 메모리).
       ⚠ 언젠가 얇은 거울(erpCoId·company·docs 만)을 만들면 heavy 를 뗄 수 있다. */
    /* ── 얇은 거울 (4-D, 2026-09-05) ──
       ★ 거울을 «읽는 쪽»이 만든다. 기업정보함의 쓰는 자리마다 거울을 갱신하게 하면
         자리가 두 파일에 흩어져 있어 하나만 놓쳐도 조용히 낡는다 — 그 길을 안 골랐다.
         대신 무거운 자리를 «한 번» 읽은 김에 거울을 떠 두고, 다음부터는 이것만 읽는다.
       ⚠ 그래서 거울은 «낡을 수 있다». 숨기지 않는다 — 언제 뜬 것인지 화면이 말하고,
         새로 뜨려면 무거운 자리를 켜면 된다.
       ⚠ 담는 것은 관계에 쓰는 셋뿐이다(회사명·확정열쇠·서류목록).
         계좌번호·예금주·매출액·생년월일은 «애초에 안 담긴다». */
    cards_ontidx:{program:'cards',strategy:'remote',path:'pucards/ontIdx',parser:'coIdx',
      gives:'회사의 서류 관계(얇은 거울)'},
    cards_ontidx_meta:{program:'cards',strategy:'remote',path:'pucards/ontIdxMeta',parser:'idxMeta'},
    cards_coinfo:{program:'cards',strategy:'remote',path:'pucards/coInfo',parser:'coInfo',
      heavy:'기업 상세 4,158곳 전문 — 계좌번호·예금주·매출액·생년월일이 함께 내려온다',
      uses:['erpCoId','company','docs'], gives:'회사의 서류 관계(Document → Organization)'},
    cards_workers:{program:'cards',strategy:'remote',path:'pucards/workerInfo',parser:'workerInfo'},
    photos_items:{program:'photos',strategy:'remote',path:'puphotos/u/{uid}/items',parser:'photoItems'},
    payroll_index:{program:'payroll',strategy:'remote',path:'payroll_os/payroll/index',parser:'payrollIndex'},
    paydata_items:{program:'paydata',strategy:'remote',path:'paydata/u/{uid}/items',parser:'paydataItems'},
    home_members:{program:'home',strategy:'remote',path:'homepage/members',parser:'homeMembers'},
    home_pages:{program:'home',strategy:'remote',path:'homepage/config/pages',parser:'homePages'},
    mail_private:{program:'mail',strategy:'in_app',parser:'mailHeaders'},
    rules_documents:{program:'rules',strategy:'in_app',parser:'ruleMetadata'},
    esign_cases:{program:'docs',strategy:'in_app',parser:'esignMetadata'},
    newsletter_issues:{program:'news',strategy:'in_app',parser:'newsletterMetadata'}
  };

  function arr(v){
    if(Array.isArray(v)) return v.filter(function(x){ return x && !x._deleted; });
    if(v && typeof v === 'object') return Object.keys(v).map(function(k){ return v[k]; }).filter(function(x){ return x && !x._deleted; });
    return [];
  }
  function clean(v){ return String(v == null ? '' : v).trim(); }
  function recordLabel(r,type,id){
    r=r||{};
    if(type==='Organization')return clean(r.name||r.companyName||r.company||id);
    if(type==='Person')return clean(r.name||r.userName||r.sid||id);
    return clean(r.title||r.name||r.companyName||r.company||r.no||r.filename||r.월||id);
  }
  /* ★ 회사 이름 다듬개는 «하나»다 (2026-09-04).
     예전에는 여기가 /[\s()（）·.,_\-주식회사㈜]/ 였다 — 대괄호는 낱말이 아니라
     «글자 하나씩»을 지운다. 그래서 「한식당」→「한당」, 「대주건설」→「대건설」,
     「사조산업」→「조산업」이 되어, 서로 다른 회사가 «같은 열쇠»를 갖게 됐다.
     이 함수가 만드는 것이 companies.byName 이라, 이름으로 업체를 찾는 자리
     (resolve 414줄)가 조용히 남의 회사를 가리킬 수 있었다.
     ⚠ 아래 linkName(6-1단계 계약 검증)은 처음부터 갈래(|)로 옳게 적혀 있었다 —
       즉 «같은 일을 하는 다듬개 둘이 서로 다른 답»을 내고 있었다. 이제 하나다. */
  function normName(v){ return clean(v).toLowerCase().replace(/주식회사|유한회사|㈜|[\s()（）·.,_\-]/g,''); }
  function normBiz(v){ return clean(v).replace(/\D/g,''); }
  /* encodeURIComponent가 점(.)은 남기므로 Firebase 열쇠 금지문자까지 한 번 더 막는다. */
  function canon(type, id){ return type + ':' + encodeURIComponent(clean(id)).replace(/\./g,'%2E'); }
  function sourceCanon(type, program, id){ return canon(type,clean(program)+':'+clean(id)); }
  function edgeId(s, p, o){ return 'edge:' + encodeURIComponent(s+'|'+p+'|'+o); }
  function addEdge(out, subject, predicate, object, sourceStore, sourceId, confidence){
    if(!subject || !object) return;
    out.push({ id:edgeId(subject,predicate,object), subject:subject, predicate:predicate, object:object,
      sourceStore:sourceStore, sourceId:sourceId, confidence:confidence == null ? 1 : confidence, schemaVersion:VERSION });
  }
  function putEntity(out, type, id, program, source, label){
    id=clean(id); if(!id) return null;
    var key=sourceCanon(type,program,id);
    out[key]={type:type,id:id,program:program,source:source,label:clean(label)};
    return key;
  }
  function entries(v){
    if(Array.isArray(v)) return v.map(function(x,i){return [String(i),x];});
    if(v&&typeof v==='object') return Object.keys(v).map(function(k){return [k,v[k]];});
    return [];
  }
  function nestedRecords(v, depth){
    var out=[];
    function walk(x,path,left){
      entries(x).forEach(function(p){
        var val=p[1], next=path.concat(p[0]);
        if(!val||typeof val!=='object') return;
        if(left<=1 || val.id || val.title || val.filename || val.kind || val.name || val.월 || val.label) out.push({key:p[0],path:next,value:val});
        else walk(val,next,left-1);
      });
    }
    walk(v,[],depth||3); return out;
  }
  function issue(out, severity, code, store, id, label, detail, candidate){
    out.push({ severity:severity, code:code, store:store, id:id||'', label:label||id||store,
      detail:detail, candidate:candidate||null });
  }

  function audit(data){
    data = data || {};
    var issues = [], edges = [], entities = {}, stats = {}, indexes = {};
    Object.keys(STORE_TYPES).forEach(function(store){
      var list = arr(data[store]); stats[store] = list.length;
      var type = STORE_TYPES[store], seen = {};
      indexes[store] = {};
      list.forEach(function(r, pos){
        /* 사람의 통합 열쇠는 사번(sid)이다. 화면 내부 id보다 먼저 써야 담당관계의
           도착점과 실제 Person 개체가 같은 열쇠가 된다. */
        var id = clean((store==='user_accounts'||store==='user_dir') ? (r.sid||r.id) : r.id);
        if(!id){ issue(issues,'high','missing_id',store,'',store+' '+(pos+1)+'번째', '관계를 고정할 ID가 없습니다.'); return; }
        if(seen[id]) issue(issues,'high','duplicate_id',store,id,id,'같은 ID가 두 번 이상 존재합니다.');
        /* ★ 고유번호 «몸통»을 개체에 달아 둔다 (대표 지시 2026-09-05: 「온톨로지에 연결」).
           머리(자문·급여…)는 업무가 바뀌면 따라 바뀌므로 색인에 넣지 않는다 —
           연결·검색은 몸통만 본다는 규칙 그대로다. 몸통은 이름이 아니라 «영구 번호»라,
           이름을 안 싣는 관계망에도 실을 수 있고, 실어야 다른 프로그램이 번호로 잇는다. */
        seen[id] = 1; indexes[store][id] = r; entities[canon(type,id)] = { type:type, store:store, program:'erp', id:id, label:recordLabel(r,type,id), no:companyNumberBody(r) };
      });
    });

    var companies = arr(data.companies), byCoId=indexes.companies||{}, byCoName={}, byBiz={};
    companies.forEach(function(co){
      var n=normName(co.name||co.companyName), b=normBiz(co.bizNo||co.bizno);
      if(n){ if(!byCoName[n]) byCoName[n]=[]; byCoName[n].push(co); }
      if(b){ if(!byBiz[b]) byBiz[b]=[]; byBiz[b].push(co); }
    });
    Object.keys(byCoName).forEach(function(k){ if(byCoName[k].length>1) issue(issues,'medium','ambiguous_company_name','companies','',byCoName[k][0].name,'같은 정규화 업체명 '+byCoName[k].length+'건'); });
    Object.keys(byBiz).forEach(function(k){ if(byBiz[k].length>1) issue(issues,'high','duplicate_business_number','companies','',k,'같은 사업자번호 '+byBiz[k].length+'건'); });

    COMPANY_STORES.forEach(function(store){
      arr(data[store]).forEach(function(r){
        var rid=clean(r.id), cid=clean(r.companyId), label=clean(r.companyName||r.company||r.name||rid);
        var candidate=null, confidence=1;
        if(cid && !byCoId[cid]) issue(issues,'high','orphan_company',store,rid,label,'존재하지 않는 companyId: '+cid);
        if(!cid){
          var bz=normBiz(r.bizNo||r.bizno), nm=normName(r.companyName||r.company);
          var hits=(bz&&byBiz[bz]&&byBiz[bz].length===1)?byBiz[bz]:(nm&&byCoName[nm]&&byCoName[nm].length===1?byCoName[nm]:[]);
          if(hits.length===1){ candidate=hits[0].id; confidence=bz?0.99:0.85; issue(issues,'medium','missing_company_id',store,rid,label,'업체를 찾았지만 companyId가 비어 있습니다.',candidate); cid=candidate; }
          else if(label && store!=='my_schedules') issue(issues,'medium','unresolved_company',store,rid,label,'업체 ID를 확정하지 못했습니다.');
        }
        if(cid && byCoId[cid]){
          var st=STORE_TYPES[store], pred=store==='contracts'?'contractedWith':store==='cases'?'concerns':(store==='finance_invoice'?'invoicedTo':(store==='finance_income'||store==='finance_expense'?'paidFor':(store==='my_schedules'?'scheduledFor':'projectFor')));
          addEdge(edges,canon(st,rid),pred,canon('Organization',cid),store,rid,confidence);
        }
      });
    });

    var people={};
    arr(data.user_accounts).concat(arr(data.user_dir)).forEach(function(u){ if(u.sid) people[u.sid]=u; });
    STAFF_STORES.forEach(function(store){
      arr(data[store]).forEach(function(r){
        var rid=clean(r.id), st=STORE_TYPES[store];
        var main=clean(r.managerMain||r.managerSid||r.ownerSid);
        if(main){
          if(!people[main]) issue(issues,'high','orphan_person',store,rid,main,'등록되지 않은 주담당 사번입니다.');
          else addEdge(edges,canon(st,rid),'assignedTo',canon('Person',main),store,rid,1);
        }
        (Array.isArray(r.managerSubs)?r.managerSubs:[]).forEach(function(sid){
          sid=clean(sid); if(!sid) return;
          if(!people[sid]) issue(issues,'high','orphan_person',store,rid,sid,'등록되지 않은 부담당 사번입니다.');
          else addEdge(edges,canon(st,rid),'assists',canon('Person',sid),store,rid,1);
        });
      });
    });

    /* 인사·급여 기록 → 사람. 개체는 진작 만들어지고 있었는데 «어디에도 안 이어져»
       업체 360°에도, 사람 화면에도 안 나왔다(2026-09-03 점검에서 찾음). */
    PERSON_RECORD_STORES.forEach(function(store){
      arr(data[store]).forEach(function(r){
        var rid=clean(r.id), st=STORE_TYPES[store], sid=personSidOf(r);
        if(!rid) return;
        if(!sid){ issue(issues,'medium','missing_person_sid',store,rid,recordLabel(r,st,rid),
          '사번이 비어 있어 누구의 기록인지 확정할 수 없습니다.'); return; }
        if(!people[sid]){ issue(issues,'high','orphan_person',store,rid,sid,
          '등록되지 않은 사번입니다.'); return; }
        addEdge(edges,canon(st,rid),'recordedFor',canon('Person',sid),store,rid,1);
      });
    });

    ['finance_income','finance_expense','finance_invoice'].forEach(function(store){
      arr(data[store]).forEach(function(r){
        var kind=clean(r.sourceKind), sid=clean(r.sourceId), targetStore=SOURCE_KIND_STORE[kind];
        if(!kind || kind==='manual' || kind==='unknown' || !sid) return;
        if(targetStore && !(indexes[targetStore]||{})[sid]) issue(issues,'high','orphan_source',store,r.id,r.id,'sourceKind='+kind+' 이지만 원본 '+sid+'가 없습니다.');
        if(targetStore && (indexes[targetStore]||{})[sid]) addEdge(edges,canon(STORE_TYPES[store],r.id),store==='finance_invoice'?'invoicedTo':'paidFor',canon(STORE_TYPES[targetStore],sid),store,r.id,1);
      });
    });

    // 원본 계약·사건 관계는 명시적 ID만 색인한다. 번호만 있거나 참조가 모순되면 진단만 남긴다.
    ['contracts','cases','companies','consultings','funds','other_projects'].forEach(function(store){
      arr(data[store]).forEach(function(r){
        if(!clean(r.id))return;
        var checked=validateWorkReferences(r,data,{store:store}),bad=checked.errors.filter(function(x){return x.field.indexOf('source')===0;});
        if(bad.length){bad.forEach(function(x){issue(issues,'high','orphan_source',store,r.id,r.id,x.message);});return;}
        var refs=[];
        if(r.sourceContractId)refs.push(['contract',clean(r.sourceContractId)]);
        if((r.sourceKind==='contract'||r.sourceKind==='case')&&r.sourceId)refs.push([r.sourceKind,clean(r.sourceId)]);
        var seen=Object.create(null);
        refs.forEach(function(pair){var key=pair.join(':');if(seen[key])return;seen[key]=true;
          addEdge(edges,canon(STORE_TYPES[store],r.id),'derivedFrom',canon(STORE_TYPES[SOURCE_KIND_STORE[pair[0]]],pair[1]),store,r.id,1);
        });
      });
    });
    var sev={high:0,medium:0,low:0}; issues.forEach(function(x){ sev[x.severity]=(sev[x.severity]||0)+1; });
    return { schemaVersion:VERSION, readOnly:true, entityCount:Object.keys(entities).length, edgeCount:edges.length,
      issueCount:issues.length, severity:sev, stats:stats, entities:entities, edges:edges, issues:issues };
  }

  function resolvePath(path, context){
    context=context||{};
    return clean(path).replace(/\{uid\}/g,clean(context.uid));
  }
  /* ⚠ 무거운 자리는 «켤 때만» 읽는다(context.heavy). 목록에서 빼지는 않는다 —
     빼 버리면 무엇을 안 읽었는지 화면이 말할 수 없다. skip 을 달아 돌려준다. */
  function getReadPlan(context){
    context=context||{};
    var wantHeavy=context.heavy===true;
    return Object.keys(READ_ADAPTERS).map(function(key){
      var a=READ_ADAPTERS[key], path=resolvePath(a.path,context);
      if(/\{uid\}/.test(a.path||'')&&!clean(context.uid)) return null;
      if(a.strategy!=='remote' || !path || /\{[^}]+\}/.test(path)) return null;
      return {key:key,program:a.program,path:path,parser:a.parser,strategy:a.strategy,
        heavy:a.heavy||'', skip:!!a.heavy&&!wantHeavy};
    }).filter(Boolean);
  }
  function addForOrganization(edges, subject, rec, source, id, companies){
    var cid=clean(rec.companyId||rec.co_id||rec.company_id), name=clean(rec.companyName||rec.company||rec.사업장||rec.site);
    if(!cid&&name){ var hits=companies.byName[normName(name)]||[]; if(hits.length===1) cid=hits[0].id; }
    if(cid&&companies.byId[cid]) addEdge(edges,subject,'forOrganization',canon('Organization',cid),source,id,cid===clean(rec.companyId||rec.co_id||rec.company_id)?1:0.85);
  }
  function parseExternal(adapter, value, graph, companies){
    var key=adapter.key, program=adapter.program, entities=graph.entities, edges=graph.edges, count=0;
    function entity(type,id,label,rec){
      var subject=putEntity(entities,type,id,program,key,label); if(!subject)return null;
      count++; if(rec) addForOrganization(edges,subject,rec,key,id,companies); return subject;
    }
    if(adapter.parser==='coverage') return {records:value&&typeof value==='object'?1:0,entities:0};
    if(adapter.parser==='workItems') entries(value).forEach(function(p){
      var r=p[1]||{}, id=clean(r.id||p[0]), s=entity('Task',id,r.title||r.no,r); if(!s)return;
      var main=r.mgr_main&&r.mgr_main.sid||r.managerSid||r.ownerSid;
      if(main) addEdge(edges,s,'assignedTo',canon('Person',main),key,id,1);
      (Array.isArray(r.mgr_subs)?r.mgr_subs:[]).forEach(function(u){var sid=clean(u&&u.sid||u);if(sid)addEdge(edges,s,'assists',canon('Person',sid),key,id,1);});
      var ref=r.ref||{}, refType={contract:'Contract',case:'Case',consulting:'Project',fund:'Project',other:'Project'}[clean(ref.type)];
      if(refType&&ref.id)addEdge(edges,s,'derivedFrom',canon(refType,ref.id),key,id,1);
    });
    else if(adapter.parser==='cardIndex') entries(value).forEach(function(p){
      var r=p[1]||{}, type=r.k==='biz'?'Document':'Person'; entity(type,p[0],r.n||r.c||r.bz,r);
    });
    /* ── 기업 상세 (대표 지시 2026-09-02) ──
       ★ 여기가 신뢰도 1.0 이 나오는 자리다. 기업정보함이 2026-09-02 부터 사람이 «확정한»
         이알피 업체 열쇠를 erpCoId 에 적어 둔다 — 그것을 companyId 로 넘기면
         addForOrganization 이 1.0 으로 잇는다(상호로 맞추면 0.85 가 끝이다).
       ⚠ 확정하지 않은 회사는 예전처럼 이름으로 0.85 다 — 그것이 3단계로 못 넘어가던 까닭이다.
       ⚠ 서류는 «있다는 사실»만 개체로 만든다. pairs(문서의 모든 칸)는 읽지 않는다 —
         거기에는 계좌·주민번호가 딸려 올 수 있다. */
    else if(adapter.parser==='coInfo') entries(value).forEach(function(p){
      var r=p[1]||{}, coKey=clean(p[0]);
      var rec=Object.assign({},r,{companyId:clean(r.erpCoId)});
      /* ⚠ 회사 개체에는 rec 를 넘기지 «않는다» — 넘기면 addForOrganization 이
         Organization → Organization 관계를 만든다. 관계 사전에 없는 꼴이다.
         이알피 업체와 잇는 일은 아래 «서류»가 한다(Document → Organization). */
      var s0=entity('Organization','coinfo:'+coKey,r.company||coKey);
      entries(r.docs).forEach(function(d){
        var dk=clean(d[0]), doc=d[1]||{};
        var ds=entity('Document',coKey+'/'+dk,doc.docName||doc.kind||dk,rec);
        if(ds&&s0) addEdge(edges,ds,'attachedTo',s0,key,coKey+'/'+dk,1);
      });
    });
    /* ── 얇은 거울 읽기 (4-D) ── coInfo 파서와 «같은 관계»를 낸다.
       ⚠ 둘이 다른 관계를 내면 거울을 켰다 껐다 할 때 관계망이 흔들린다. */
    else if(adapter.parser==='coIdx') entries(value).forEach(function(p){
      var r=p[1]||{}, coKey=clean(p[0]);
      var rec={companyId:clean(r.e)};
      var s0=entity('Organization','coinfo:'+coKey,clean(r.c)||coKey);
      entries(r.d).forEach(function(d){
        var dk=clean(d[0]), doc=d[1]||{};
        var ds=entity('Document',coKey+'/'+dk,clean(doc.n)||clean(doc.k)||dk,rec);
        if(ds&&s0) addEdge(edges,ds,'attachedTo',s0,key,coKey+'/'+dk,1);
      });
    });
    else if(adapter.parser==='idxMeta') return {records:(value&&value.at)?1:0,entities:0};
    /* ── 근로자 정보함 (대표 지시 2026-09-01·02) ──
       사람↔서류 관계를 만들 수 있는 유일한 자리다. 사람은 이알피 사건에서 오고,
       여기에는 「어느 사진 서류가 누구 것인가」만 있다.
       ⚠ 이 Person 은 «기업정보함 안의» 사람이다(sourceCanon) — 직원 명부의
         Person(사번)과 섞이지 않는다. 이름을 프로그램 사이 열쇠로 쓰지 않는다는
         지침을 그렇게 지킨다.
       ⚠ 주민번호·주소·연락처는 이 자리에 애초에 없다. */
    else if(adapter.parser==='workerInfo') entries(value).forEach(function(p){
      var r=p[1]||{}, wKey=clean(p[0]);
      var ws=entity('Person',wKey,r.name||wKey,r);
      entries(r.docs).forEach(function(d){
        var dk=clean(d[0]), doc=d[1]||{};
        var ds=entity('Document',wKey+'/'+dk,doc.docName||doc.kind||dk,r);
        if(ds&&ws) addEdge(edges,ds,'attachedTo',ws,key,wKey+'/'+dk,1);
      });
    });
    else if(adapter.parser==='photoItems') nestedRecords(value,3).forEach(function(p){
      var r=p.value||{}, id=clean(r.id||p.key), s=entity('MediaAsset',id,r.filename||r.name||r.kind,r); if(!s)return;
      var sid=clean(r.sid||r.ownerSid); if(sid)addEdge(edges,s,'ownedBy',canon('Person',sid),key,id,1);
    });
    else if(adapter.parser==='payrollIndex') entries(value).forEach(function(site){
      entries(site[1]).forEach(function(p){var r=p[1]||{},id=clean(r.id||site[0]+'|'+(r.월||p[0]));entity('PayrollRecord',id,site[0]+' '+clean(r.월),Object.assign({site:site[0]},r));});
    });
    else if(adapter.parser==='paydataItems') nestedRecords(value,3).forEach(function(p){
      var r=p.value||{},id=clean(r.id||p.key);entity('Document',id,r.filename||r.kind,r);
    });
    else if(adapter.parser==='homeMembers') entries(value).forEach(function(p){var r=p[1]||{};entity('Person',r.id||p[0],r.name||r.label,r);});
    else if(adapter.parser==='homePages') entries(value).forEach(function(p){var r=p[1]||{};entity('Document',r.id||p[0],r.label||r.name,r);});
    return {records:count,entities:count};
  }
  function auditIntegrated(data, sourceResults, context){
    var base=audit(data), graph={entities:Object.assign({},base.entities),edges:base.edges.slice()}, issues=base.issues.slice();
    sourceResults=sourceResults||{}; context=context||{};
    var companies={byId:{},byName:{}};
    arr(data&&data.companies).forEach(function(c){if(!c||!c.id)return;companies.byId[c.id]=c;var n=normName(c.name||c.companyName);if(n){if(!companies.byName[n])companies.byName[n]=[];companies.byName[n].push(c);}});
    var coverage={}; Object.keys(PROGRAMS).forEach(function(k){coverage[k]={program:k,name:PROGRAMS[k].name,state:'not_loaded',records:0,adapters:0,loaded:0,denied:0,inApp:0,skipped:0};});
    Object.keys(READ_ADAPTERS).forEach(function(key){
      var a=READ_ADAPTERS[key], c=coverage[a.program]; c.adapters++;
      if(a.strategy==='local'){c.loaded++;c.records+=(a.program==='consult'?arr(data.consultings).length:a.program==='fund'?arr(data.funds).length:Object.keys(base.stats).reduce(function(n,k){return n+(base.stats[k]||0);},0));return;}
      if(a.strategy==='in_app'){c.inApp++;return;}
      var r=sourceResults[key];
      if(!r)return;
      /* ★ 「안 읽었다」와 「못 읽었다」는 다르다. 무거워서 건너뛴 것은 권한 문제가
         아니므로 denied 로 세지 않는다 — 대신 무엇이 빠졌는지 낮은 등급으로 남긴다.
         조용히 넘기면 사람은 서류 관계가 «원래 없는» 줄 안다. */
      if(r.skipped){c.skipped=(c.skipped||0)+1;
        issue(issues,'low','source_skipped_heavy',key,'',PROGRAMS[a.program].name,
          '무거운 자리라 이번 진단에서 건너뛰었습니다('+clean(a.heavy)+'). 빠진 것: '+clean(a.gives||'')+'.');
        return;}
      if(!r.ok){c.denied++;issue(issues,'medium','source_unreadable',key,'',PROGRAMS[a.program].name,'읽기 권한 또는 연결 문제: '+clean(r.error||'unknown'));return;}
      c.loaded++;var parsed=parseExternal(Object.assign({key:key},a),r.value,graph,companies); c.records+=parsed.records||0;
    });
    Object.keys(coverage).forEach(function(k){var c=coverage[k];
      c.state=c.denied?(c.loaded?'partial':'denied'):(c.loaded?(c.skipped?'partial':(c.records?'ready':'empty')):(c.inApp?'in_app':(c.skipped?'partial':'not_loaded')));});
    var edgeSeen={},dedup=[];graph.edges.forEach(function(e){if(!edgeSeen[e.id]){edgeSeen[e.id]=1;dedup.push(e);}});
    var sev={high:0,medium:0,low:0};issues.forEach(function(x){sev[x.severity]=(sev[x.severity]||0)+1;});
    var ready=Object.keys(coverage).filter(function(k){return ['ready','empty','partial'].indexOf(coverage[k].state)>=0;}).length;
    return Object.assign({},base,{schemaVersion:VERSION,entityCount:Object.keys(graph.entities).length,edgeCount:dedup.length,issueCount:issues.length,
      severity:sev,entities:graph.entities,edges:dedup,issues:issues,coverage:coverage,coverageCount:ready,programCount:Object.keys(PROGRAMS).length,readOnly:true});
  }

  /* 4단계 조회 엔진. 화면에 이미 올라온 관계망만 검색하며 서버를 다시 읽거나 쓰지 않는다. */
  function searchEntities(report,query,options){
    report=report||{};options=options||{};var q=clean(query).toLowerCase(),type=clean(options.type),limit=Math.max(1,Math.min(200,Number(options.limit)||30));
    return Object.keys(report.entities||{}).map(function(key){var e=report.entities[key]||{};return {key:key,id:e.id,type:e.type,label:clean(e.label||e.id),program:clean(e.program||'erp'),source:clean(e.source||e.store)};})
      .filter(function(e){return (!type||e.type===type)&&(!q||(e.label+' '+e.id).toLowerCase().indexOf(q)>=0);})
      .sort(function(a,b){return a.label.localeCompare(b.label,'ko');}).slice(0,limit);
  }
  function entityConnections(report,entityKey){
    report=report||{};var entities=report.entities||{},rows=[];
    (report.edges||[]).forEach(function(e){
      var other=null,direction='out';if(e.subject===entityKey)other=e.object;else if(e.object===entityKey){other=e.subject;direction='in';}else return;
      var n=entities[other]||{};rows.push({edgeId:e.id,predicate:e.predicate,direction:direction,confidence:Number(e.confidence),
        key:other,id:n.id||other,type:n.type||'Unknown',label:clean(n.label||n.id||other),program:clean(n.program||'erp'),sourceStore:e.sourceStore,sourceId:e.sourceId});
    });
    return rows.sort(function(a,b){return (a.type+a.label).localeCompare(b.type+b.label,'ko');});
  }
  function organization360(report,organizationId){
    var key=clean(organizationId);if(key.indexOf('Organization:')!==0)key=canon('Organization',key);
    var org=report&&report.entities&&report.entities[key];if(!org)return {ok:false,key:key,organization:null,total:0,groups:{},connections:[]};
    var connections=entityConnections(report,key),groups={};connections.forEach(function(x){if(!groups[x.type])groups[x.type]=[];groups[x.type].push(x);});
    return {ok:true,key:key,organization:{id:org.id,label:clean(org.label||org.id),program:clean(org.program||'erp')},total:connections.length,groups:groups,connections:connections};
  }

  /* 6-1단계 계약 입력 검증. 후보 검색과 확정 ID 검증을 분리한다.
     이 함수는 저장하지 않는다. 이름 일치만으로 companyId를 만들지 않는다. */
  /* 위 normName 과 «같은 일»이다 — 두 벌로 두면 한쪽만 고쳐져 답이 갈린다(실제로 그랬다) */
  function linkName(v){return normName(v);}
  function validateCompanyLink(record,companies){
    record=record||{};
    var co=record.company&&typeof record.company==='object'?record.company:{};
    var top=clean(record.companyId),nested=clean(co.companyId),id=top||nested;
    function result(ok,code,message,status){return {ok:ok,code:code,message:message,status:status||'blocked',companyId:ok?id:''};}
    if(top&&nested&&top!==nested)return result(false,'conflicting_company_ids','계약과 회사정보의 업체 ID가 다릅니다. 업체 연결에서 다시 선택하세요.');
    if(id&&record.companyLinkStatus==='pending')return result(false,'pending_company_id','연결 보류 상태에 업체 ID가 남아 있습니다. 업체를 다시 선택하거나 연결 보류를 다시 지정하세요.');
    if(!id){
      if(record.clientType==='worker')return result(true,'company_not_required','근로자 의뢰 — 업체 연결 없음','not_required');
      if(record.companyLinkStatus==='pending')return result(true,'company_link_pending','연결 보류 — 업체정보 동기화 안 함','pending');
      return result(false,'company_selection_required','업체를 선택하거나 신규·미확정 업체는 연결 보류를 선택하세요.');
    }
    if(!Array.isArray(companies))return result(false,'companies_unavailable','업체 목록을 확인할 수 없습니다. 목록을 불러온 뒤 다시 저장하세요.');
    var hits=companies.filter(function(x){return x&&!x._deleted&&clean(x.id)===id;});
    if(hits.length!==1)return result(false,hits.length?'duplicate_company_id':'orphan_company','업체 ID가 없거나 중복되어 연결할 수 없습니다. 업체관리에서 확인하세요.');
    var target=hits[0],biz=normBiz(co.bizNo!==undefined?co.bizNo:record.bizNo),targetBiz=normBiz(target.bizNo||target.bizno);
    if(biz&&targetBiz&&biz!==targetBiz)return result(false,'company_business_mismatch','선택한 업체와 입력한 사업자번호가 다릅니다. 업체 연결을 다시 확인하세요.');
    var name=linkName(co.name!==undefined?co.name:record.companyName),targetName=linkName(target.name||target.companyName);
    if(name&&targetName&&name!==targetName&&!(biz&&targetBiz&&biz===targetBiz))return result(false,'company_name_mismatch','입력한 회사명과 선택한 업체가 다릅니다. 업체를 다시 선택하세요.');
    return result(true,'company_link_valid','업체 ID 확인 완료','linked');
  }
  function companyLinkCandidates(record,companies,query){
    record=record||{};var co=record.company&&typeof record.company==='object'?record.company:{},q=clean(query).toLowerCase();
    var id=clean(record.companyId||co.companyId),name=linkName(co.name||record.companyName),biz=normBiz(co.bizNo||record.bizNo);
    return arr(companies).filter(function(x){
      if(!clean(x.id))return false;
      if(clean(x.id)===id)return true;
      if(q)return [x.name,x.companyName,x.id,x.bizNo,normBiz(x.bizNo)].join(' ').toLowerCase().indexOf(q)>=0;
      return (biz&&normBiz(x.bizNo)===biz)||(name&&linkName(x.name||x.companyName)===name);
    }).sort(function(a,b){return clean(a.id)===id?-1:clean(b.id)===id?1:clean(a.name).localeCompare(clean(b.name),'ko');})
      .slice(0,100).map(function(x){return {id:clean(x.id),name:clean(x.name||x.companyName),bizNo:clean(x.bizNo)};});
  }
  /* 사업자번호는 법인명을 달리 적어도 같은 업체임을 판별할 수 있는 안전한 키다.
     정확한 10자리 번호가 명부에서 한 번만 확인될 때에만 자동 연결한다. */
  function companyLinkAutoMatch(record,companies){
    record=record||{};
    var co=record.company&&typeof record.company==='object'?record.company:{};
    var biz=normBiz(co.bizNo!==undefined?co.bizNo:record.bizNo);
    if(biz.length!==10)return {ok:false,code:biz?'business_number_incomplete':'business_number_required',companyId:''};
    if(!Array.isArray(companies))return {ok:false,code:'companies_unavailable',companyId:''};
    var hits=companies.filter(function(x){
      return x&&!x._deleted&&clean(x.id)&&normBiz(x.bizNo||x.bizno)===biz;
    });
    if(!hits.length)return {ok:false,code:'business_number_not_found',companyId:'',bizNo:biz};
    if(hits.length!==1)return {ok:false,code:'duplicate_business_number',companyId:'',bizNo:biz};
    return {ok:true,code:'business_number_unique',companyId:clean(hits[0].id),
      companyName:clean(hits[0].name||hits[0].companyName),bizNo:biz};
  }

  /* 6-2단계: 현재 명부·업무 목록으로 신규 참조만 엄격히 검사한다.
     과거의 변경하지 않은 참조는 경고로 남기되 다른 사람/업무로 자동 치환하지 않는다. */
  function validateWorkReferences(record,data,options){
    record=record||{};data=data||{};options=options||{};
    var previous=options.previous||{},errors=[],warnings=[],people=Object.create(null),duplicates=Object.create(null);
    function problem(code,field,message,unchanged){(unchanged?warnings:errors).push({code:code,field:field,message:message});}
    ['user_dir','user_accounts'].forEach(function(store){
      var seen=Object.create(null);
      entries(data[store]).forEach(function(pair){var u=pair[1];if(!u)return;var sid=clean(u.sid);if(!sid)return;if(seen[sid])duplicates[sid]=true;seen[sid]=true;people[sid]=Object.assign({},people[sid]||{},u);});
    });
    var main=clean(record.managerMain),subs=record.managerSubs==null?[]:record.managerSubs,oldSubs=Array.isArray(previous.managerSubs)?previous.managerSubs:[];
    if(options.requireMain&&!main)problem('missing_manager','managerMain','주담당 사번을 선택하세요.',false);
    if(!Array.isArray(subs)){problem('invalid_manager_subs','managerSubs','부담당은 사번 목록이어야 합니다.',false);subs=[];}
    var seenStaff=Object.create(null);
    function staff(sid,field,unchanged){
      if(!sid){problem('empty_manager_sid',field,'빈 부담당 사번을 제거하세요.',false);return;}
      if(seenStaff[sid]){problem('duplicate_manager_sid',field,'주담당·부담당에 같은 사번이 중복되어 있습니다: '+sid,false);return;}seenStaff[sid]=true;
      var u=people[sid];
      if(!u||duplicates[sid]){problem('unresolved_manager',field,'명부에서 사번을 유일하게 확인할 수 없습니다: '+sid,unchanged);return;}
      if(u._deleted||u.accessLocked||u.excludeFromAssign||(u.status&&u.status!=='active')||(options.unassignableSids||[]).indexOf(sid)>=0)
        problem('manager_not_assignable',field,'새로 배정할 수 없는 담당자입니다: '+sid,unchanged);
    }
    if(main)staff(main,'managerMain',main===clean(previous.managerMain));
    subs.forEach(function(sid){sid=clean(sid);staff(sid,'managerSubs',oldSubs.indexOf(sid)>=0);});
    function reference(kind,id,field,unchanged){
      var store=SOURCE_KIND_STORE[kind];
      if(!store||!id){problem('invalid_source_pair',field,'원본 종류와 실제 ID를 함께 선택하세요.',unchanged);return null;}
      if(store===options.store&&id===clean(record.id)){problem('self_reference',field,'자기 자신을 원본 업무로 연결할 수 없습니다.',false);return null;}
      var hits=arr(data[store]).filter(function(x){return clean(x.id)===id;});
      if(hits.length!==1){problem('unresolved_source',field,'원본 ID가 없거나 중복되어 있습니다: '+kind+' / '+id,unchanged);return null;}
      return hits[0];
    }
    var kind=clean(record.sourceKind),id=clean(record.sourceId),oldPair=kind===clean(previous.sourceKind)&&id===clean(previous.sourceId);
    var pairTarget=null;
    if(id||(kind&&kind!=='manual'&&kind!=='unknown'))pairTarget=reference(kind,id,'sourceId',oldPair);
    var contractId=clean(record.sourceContractId),no=clean(record.sourceContractNo),target=null;
    if(contractId){
      target=reference('contract',contractId,'sourceContractId',contractId===clean(previous.sourceContractId));
      if(kind==='contract'&&id&&id!==contractId)problem('conflicting_contract_refs','sourceContractId','원본 계약 ID 두 곳이 서로 다릅니다.',false);
      if(target&&no&&clean(target.contractNo)!==no)problem('contract_number_changed','sourceContractNo','원본 계약번호가 현재 번호와 다릅니다. ID는 유지하고 원본을 확인하세요.',contractId===clean(previous.sourceContractId)&&no===clean(previous.sourceContractNo));
    }else if(kind==='contract'&&id){
      if(pairTarget&&no&&clean(pairTarget.contractNo)!==no)problem('contract_number_changed','sourceContractNo','원본 계약번호가 현재 번호와 다릅니다. ID는 유지하고 원본을 확인하세요.',oldPair&&no===clean(previous.sourceContractNo));
    }else if(no){
      problem('legacy_contract_number','sourceContractNo','계약번호만으로 연결하지 않습니다. 원본 계약을 선택해 ID를 확정하세요.',no===clean(previous.sourceContractNo));
    }
    return {ok:errors.length===0,errors:errors,warnings:warnings,readOnly:true};
  }
  function workReferenceCandidates(data,query,options){
    data=data||{};options=options||{};var q=clean(query).toLowerCase(),rows=[];
    ['contract','case'].forEach(function(kind){arr(data[SOURCE_KIND_STORE[kind]]).forEach(function(r){
      if(!clean(r.id)||(SOURCE_KIND_STORE[kind]===options.store&&clean(r.id)===clean(options.id)))return;
      var label=clean(r.contractNo||r.caseNo||r.title||r.id),name=clean(r.companyName||(r.company&&r.company.name));
      if(q&&[label,name,r.id].join(' ').toLowerCase().indexOf(q)<0)return;
      rows.push({kind:kind,id:clean(r.id),label:label,name:name,contractNo:kind==='contract'?clean(r.contractNo):''});
    });});
    return rows.sort(function(a,b){return (a.label+a.id).localeCompare(b.label+b.id,'ko');}).slice(0,100);
  }

  /* 6-3단계: 배치 전체를 먼저 검사한다. 원본/입력은 바꾸지 않고 한 행이라도
     잘못되면 저장 호출 전 모두 보류한다. 같은 배치 안의 새 참조는 승인하지 않는다. */
  function validateWorkBatch(store,records,data,options){
    data=data||{};options=options||{};var errors=[],warnings=[],seen=Object.create(null);
    if(!STORE_TYPES[store]||!Array.isArray(records))return {ok:false,errors:[{row:0,message:'저장 종류 또는 입력 목록을 확인하세요.'}],warnings:[],readOnly:true};
    records.forEach(function(record,i){
      if(!record||typeof record!=='object'||Array.isArray(record)){errors.push({row:i+1,message:'입력 행이 올바르지 않습니다.'});return;}
      var id=clean(record.id),previous=entries(data[store]).map(function(p){return p[1];}).filter(function(x){return x&&clean(x.id)===id;});
      function fail(message){errors.push({row:i+1,id:id,message:message});}
      if(typeof record.id!=='string'||!id||id!==record.id||/[.#$\[\]\/\u0000-\u001f\u007f]/.test(id))fail('유효한 영구 ID가 필요합니다.');
      if(seen[id])fail('입력 목록에 같은 ID가 중복되어 있습니다.');seen[id]=true;
      if(previous.length>1||previous.some(function(x){return x._deleted;}))fail('기존 ID가 중복되었거나 삭제된 기록입니다.');
      if(previous.length&&options.allowExisting!==true)fail('이미 존재하는 ID입니다. 새 자료로 덮어쓸 수 없습니다.');
      var checked=validateWorkReferences(record,data,{store:store,requireMain:true,
        previous:options.allowExisting&&previous.length===1?previous[0]:null,unassignableSids:options.unassignableSids||[]});
      checked.errors.forEach(function(x){fail(x.message);});
      checked.warnings.forEach(function(x){warnings.push({row:i+1,id:id,message:x.message});});
    });
    return {ok:errors.length===0,errors:errors,warnings:warnings,readOnly:true};
  }

  /* 문자 원본은 업무 관계가 아니다. 유효한 원본만 한 묶음으로 수용하며,
     불량 행을 버린 뒤 전체 수신을 완료 처리하지 않는다. */
  function validateHanaSourceBatch(items){
    var errors=[],seen=Object.create(null);
    if(!Array.isArray(items))return {ok:false,errors:[{row:0,message:'문자 목록을 확인할 수 없습니다.'}],readOnly:true};
    items.forEach(function(x,i){
      function fail(message){errors.push({row:i+1,message:message});}
      if(!x||typeof x!=='object'){fail('문자 행이 올바르지 않습니다.');return;}
      if(!/^[a-f0-9]{64}$/.test(String(x.id||'')))fail('원본 문자 ID가 올바르지 않습니다.');
      if(seen[x.id])fail('수신 목록에 원본 문자 ID가 중복되어 있습니다.');seen[x.id]=true;
      var m=String(x.date||'').match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/);
      if(!m||Number(m[4])>23||Number(m[5])>59||new Date(Date.UTC(+m[1],+m[2]-1,+m[3])).toISOString().slice(0,10)!==String(x.date).slice(0,10))fail('거래 일시가 올바르지 않습니다.');
      if(typeof x.amount!=='number'||!Number.isSafeInteger(x.amount)||x.amount<=0)fail('거래 금액이 올바르지 않습니다.');
      if(x.type!=='income'&&x.type!=='expense')fail('입출금 종류를 확인하세요.');
      if(x.src!=='bank'&&x.src!=='card')fail('은행·카드 출처를 확인하세요.');
      if(x.cancel!=null&&typeof x.cancel!=='boolean')fail('취소 표시를 확인하세요.');
    });
    return {ok:errors.length===0,errors:errors,readOnly:true};
  }

  /* 5단계 검증센터. 진단 결과를 사람이 한 건씩 검토할 작업목록으로 바꾼다.
     검토 상태는 화면 메모일 뿐이며 원본이나 서버에 기록하지 않는다. */
  var VALIDATION_CATEGORIES={
    identity:{label:'식별자·중복',codes:['missing_id','duplicate_id','ambiguous_company_name','duplicate_business_number']},
    organization:{label:'업체 연결',codes:['orphan_company','missing_company_id','unresolved_company','inferred_relation']},
    person:{label:'담당자 연결',codes:['orphan_person']},
    source:{label:'원본·권한',codes:['orphan_source','source_unreadable','dangling_relation']},
    registry:{label:'등록·계약',codes:['program_no_root','root_double_owned','satellite_orphan','root_not_read','predicate_planned']}
  };
  function validationCategory(code){
    var found='source';Object.keys(VALIDATION_CATEGORIES).some(function(k){if(VALIDATION_CATEGORIES[k].codes.indexOf(code)>=0){found=k;return true;}return false;});return found;
  }
  function issueProgram(store){
    var a=READ_ADAPTERS[store];return a&&a.program||'erp';
  }
  function validationAdvice(code,candidate){
    if(code==='program_no_root')return '공통 사전의 등록부에 그 프로그램이 소유한 저장 자리를 적으세요.';
    if(code==='root_double_owned')return '저장 자리의 주인을 하나로 정하고, 나머지는 빌려 읽는 자리로 옮기세요.';
    if(code==='satellite_orphan')return '딸린 화면이 가리키는 프로그램을 등록부에 넣거나 주인을 고치세요.';
    if(code==='root_not_read')return '읽기 계획에 어댑터를 넣거나, 통합 화면에서 읽지 않을 자료라면 앱 내부로 선언하세요.';
    if(code==='predicate_planned')return '이 관계어는 아직 만들지 않기로 한 것입니다. 사유가 끝나면 만들고, 안 쓸 것은 사전에서 빼세요.';
    if(code==='missing_company_id'&&candidate)return '후보 업체 ID를 원본에서 대조한 뒤 명시적으로 확정하세요.';
    if(code==='inferred_relation')return '이름으로 추정된 관계입니다. 원본에서 영구 ID를 확인해 확정하세요.';
    if(code==='source_unreadable')return '로그인 권한과 프로그램 연결 상태를 확인한 뒤 다시 진단하세요.';
    if(code==='duplicate_id'||code==='duplicate_business_number'||code==='ambiguous_company_name')return '두 원본을 나란히 대조하고 정본을 결정하세요. 자동 병합하지 않습니다.';
    if(code==='missing_id')return '원본 프로그램의 정상 저장 절차로 영구 ID를 부여하세요.';
    return '원본 프로그램에서 연결 ID와 대상 존재 여부를 확인하세요.';
  }
  function buildValidationQueue(report){
    report=report||{};var raw=(report.issues||[]).map(function(x){return Object.assign({},x);}),entities=report.entities||{};
    (report.edges||[]).forEach(function(e){
      if(!entities[e.subject]||!entities[e.object]) raw.push({severity:'high',code:'dangling_relation',store:e.sourceStore,id:e.sourceId,
        label:e.predicate,detail:'관계의 시작 또는 도착 개체가 현재 관계망에 없습니다.',candidate:null});
      else if(Number(e.confidence)<1) raw.push({severity:'medium',code:'inferred_relation',store:e.sourceStore,id:e.sourceId,
        label:(entities[e.subject]&&entities[e.subject].label)||e.sourceId,detail:'명시적 ID가 아닌 이름으로 연결된 후보입니다.',candidate:entities[e.object]&&entities[e.object].id});
    });
    var rank={high:0,medium:1,low:2};
    var items=raw.map(function(x,i){
      /* 등록부 진단처럼 프로그램을 스스로 아는 줄은 그것을 그대로 쓴다 —
         store 이름으로 되짚으면 전부 이알피 것으로 몰린다. */
      var program=(x.program&&PROGRAMS[x.program])?x.program:issueProgram(x.store),
          category=validationCategory(x.code),seed=[x.code,x.store,x.id,x.candidate,x.detail,i].join('|');
      return {reviewId:'review:'+encodeURIComponent(seed).replace(/\./g,'%2E'),severity:x.severity||'medium',category:category,code:x.code,
        store:clean(x.store),recordId:clean(x.id),label:clean(x.label||x.id||x.store),detail:clean(x.detail),candidate:x.candidate||null,
        program:program,programName:PROGRAMS[program]&&PROGRAMS[program].name||program,sourceFile:PROGRAMS[program]&&PROGRAMS[program].file||'',
        advice:validationAdvice(x.code,x.candidate),readOnly:true};
    }).sort(function(a,b){var ar=Object.prototype.hasOwnProperty.call(rank,a.severity)?rank[a.severity]:9,br=Object.prototype.hasOwnProperty.call(rank,b.severity)?rank[b.severity]:9;return ar-br||(a.category+a.label).localeCompare(b.category+b.label,'ko');});
    var counts={high:0,medium:0,low:0,open:items.length,categories:{}};
    items.forEach(function(x){counts[x.severity]=(counts[x.severity]||0)+1;counts.categories[x.category]=(counts.categories[x.category]||0)+1;});
    return {readOnly:true,sourceMutation:'never',total:items.length,counts:counts,categories:VALIDATION_CATEGORIES,items:items};
  }
  function filterValidationQueue(queue,options){
    queue=queue||{items:[]};options=options||{};var q=clean(options.query).toLowerCase(),category=clean(options.category),severity=clean(options.severity),status=clean(options.status),decisions=options.decisions||{};
    return (queue.items||[]).map(function(x){return Object.assign({},x,{reviewStatus:decisions[x.reviewId]||'open'});}).filter(function(x){
      if(category&&category!=='all'&&x.category!==category)return false;
      if(severity&&severity!=='all'&&x.severity!==severity)return false;
      if(status&&status!=='all'&&x.reviewStatus!==status)return false;
      return !q||[x.label,x.recordId,x.detail,x.candidate,x.programName].join(' ').toLowerCase().indexOf(q)>=0;
    });
  }

  /* 3단계 파생 색인 꾸러미. 확실한 관계(confidence=1)만 싣고, 원본 내용과
     사람·업체 이름(label)은 싣지 않는다. 서버 쓰기는 이 모듈의 책임이 아니다. */
  var VISIBILITY = {
    Organization:'internal',Contract:'internal',Case:'internal',Project:'internal',Task:'internal',ScheduleEvent:'internal',
    Document:'source',MediaAsset:'source',Message:'source',Policy:'source',Submission:'source',
    Person:'personal',Employment:'personal',FinancialTransaction:'financial',Invoice:'financial',PayrollRecord:'financial'
  };
  var VIS_RANK={internal:0,source:1,personal:2,financial:3};
  function visibilityOf(type){return VISIBILITY[type]||'source';}
  function edgeVisibility(edge,entities){
    var a=visibilityOf(entities[edge.subject]&&entities[edge.subject].type),b=visibilityOf(entities[edge.object]&&entities[edge.object].type);
    return VIS_RANK[a]>=VIS_RANK[b]?a:b;
  }
  function stable(v){
    if(Array.isArray(v))return '['+v.map(stable).join(',')+']';
    if(v&&typeof v==='object')return '{'+Object.keys(v).sort().map(function(k){return JSON.stringify(k)+':'+stable(v[k]);}).join(',')+'}';
    return JSON.stringify(v);
  }
  function fingerprint(v){
    var s=stable(v),h=2166136261;
    for(var i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}
    return ('00000000'+(h>>>0).toString(16)).slice(-8);
  }
  function buildSnapshot(report,options){
    options=options||{};
    if(!report||report.readOnly!==true||!report.entities||!Array.isArray(report.edges))throw new Error('읽기 전용 통합 진단 결과가 필요합니다.');
    var parts={internal:{entities:{},edges:{}},source:{entities:{},edges:{}},personal:{entities:{},edges:{}},financial:{entities:{},edges:{}}};
    Object.keys(report.entities).sort().forEach(function(key){
      var e=report.entities[key]||{}, vis=visibilityOf(e.type);
      /* ⚠ 이름표(label)는 «싣지 않는다» — 관계망은 원본 payload 를 복제하지 않는다.
         ★ 다만 고유번호 몸통(no)은 싣는다: 이름이 아니라 사람·엑셀·전화가 쓰라고 만든
           영구 번호이고, 이것이 있어야 다른 프로그램이 «업체 목록을 안 받고도» 번호로
           같은 업체를 가리킬 수 있다 (대표 지시 2026-09-05). 없으면 칸 자체를 안 만든다. */
      var row={id:clean(e.id),type:e.type,program:clean(e.program||'erp'),source:clean(e.source||e.store),schemaVersion:VERSION};
      var body=companyNumberBody({puNo:e.no});   /* audit 이 넣어 둔 몸통 — 범위 밖 값은 여기서 걸러진다 */
      if(body) row.no=body;
      parts[vis].entities[key]=row;
    });
    var excluded=0,dangling=0,confirmed=0;
    report.edges.slice().sort(function(a,b){return clean(a.id).localeCompare(clean(b.id));}).forEach(function(e){
      if(Number(e.confidence)!==1){excluded++;return;}
      if(!report.entities[e.subject]||!report.entities[e.object]){dangling++;return;}
      var vis=edgeVisibility(e,report.entities);
      parts[vis].edges[e.id]={id:e.id,subject:e.subject,predicate:e.predicate,object:e.object,sourceStore:clean(e.sourceStore),sourceId:clean(e.sourceId),confidence:1,schemaVersion:VERSION};confirmed++;
    });
    var core={schema:'ontology/v1',schemaVersion:VERSION,readOnlyDerived:true,sourceMutation:'never',partitions:parts};
    var fp=fingerprint(core), at=options.generatedAt||new Date().toISOString();
    return {meta:{schema:'ontology/v1',schemaVersion:VERSION,generationId:'ont-'+fp,generatedAt:at,readOnlyDerived:true,sourceMutation:'never',
      confirmedEdges:confirmed,excludedCandidates:excluded,danglingEdges:dangling,programCount:report.programCount||Object.keys(PROGRAMS).length,fingerprint:fp},partitions:parts};
  }
  function validateSnapshot(snap){
    var errors=[],forbidden=/[.#$\[\]\/]/;
    if(!snap||!snap.meta||snap.meta.schema!=='ontology/v1')errors.push('schema');
    if(!snap||!snap.meta||snap.meta.sourceMutation!=='never')errors.push('sourceMutation');
    ['internal','source','personal','financial'].forEach(function(vis){
      var p=snap&&snap.partitions&&snap.partitions[vis];if(!p){errors.push('partition:'+vis);return;}
      Object.keys(p.entities||{}).forEach(function(k){var e=p.entities[k]||{};if(forbidden.test(k))errors.push('firebaseKey:'+k);if('label' in e||'payload' in e||'content' in e)errors.push('sensitiveField:'+k);});
      Object.keys(p.edges||{}).forEach(function(k){if(forbidden.test(k))errors.push('firebaseKey:'+k);});
    });
    return {ok:errors.length===0,errors:errors};
  }

  /* ══════ 관계망 올리기 (6단계 ㉡, 2026-09-04) ══════
     지금까지 확정 관계망은 «파일 내려받기»뿐이었다. 그래서 볼 때마다 처음부터 다시
     훑어야 했고, 다른 프로그램은 관계망을 아예 몰랐다.

     ★ 이 함수는 «쓰지 않는다» — 무엇을 어디에 쓸지 «적어서 돌려줄» 뿐이다.
       서버에 닿는 일은 화면이 한다. 그래야 검사가 파이어베이스 없이 전부 재어 본다.

     자리 모양
       ontology/v1/gen/{판번호}/meta                    판 하나의 머리
       ontology/v1/gen/{판번호}/internal/entities|edges  직원 전원
       ontology/v1/gen/{판번호}/source/…                 직원 전원
       ontology/v1/gen/{판번호}/personal/…               관리자만
       ontology/v1/gen/{판번호}/financial/…              관리자만
       ontology/v1/current                              지금 볼 판 번호

     ⚠★ current 는 «맨 마지막»에 쓴다. 먼저 쓰면 반쯤 올라간 판을 남들이 읽는다.
     ⚠★ 옛 판을 «지우지 않는다» — 그것이 직전 판 보관이다. 새 판을 다 올린 뒤
        가리키는 곳만 바꾸므로, 올리다 끊겨도 보던 판이 그대로 산다.
     ⚠ 한 번에 다 쓰지 않는다. 실시간DB 는 한 번의 쓰기를 16MB 까지만 받는다 —
       이 저장소는 기금 스냅샷에서 write_too_big 을 실제로 맞은 적이 있다.
     ⚠ 원본을 향해서는 한 글자도 안 쓴다. 모든 경로가 ontology/ 로 시작한다. */
  var ONT_ROOT='ontology/v1';
  var ONT_CHUNK=400;          /* 한 번의 쓰기에 담는 칸 수 */
  function uploadPlan(snap,options){
    options=options||{};
    var checked=validateSnapshot(snap);
    if(!checked.ok) throw new Error('올릴 수 없는 관계망입니다: '+checked.errors.slice(0,3).join(', '));
    var gen=clean(snap.meta.generationId);
    if(!gen||/[.#$\[\]\/]/.test(gen)) throw new Error('판 번호가 자리 이름으로 쓸 수 없습니다.');
    var base=ONT_ROOT+'/gen/'+gen, writes=[], counts={entities:0,edges:0};
    writes.push({path:base+'/meta',value:{
      schema:'ontology/v1',schemaVersion:snap.meta.schemaVersion,generationId:gen,
      generatedAt:clean(snap.meta.generatedAt),fingerprint:clean(snap.meta.fingerprint),
      readOnlyDerived:true,sourceMutation:'never',
      confirmedEdges:Number(snap.meta.confirmedEdges)||0,
      excludedCandidates:Number(snap.meta.excludedCandidates)||0,
      previousGenerationId:clean(options.previousGenerationId)||null}});
    ['internal','source','personal','financial'].forEach(function(vis){
      ['entities','edges'].forEach(function(kind){
        var box=(snap.partitions[vis]||{})[kind]||{}, keys=Object.keys(box).sort();
        counts[kind]+=keys.length;
        for(var i=0;i<keys.length;i+=ONT_CHUNK){
          var part={};
          keys.slice(i,i+ONT_CHUNK).forEach(function(k){ part[k]=box[k]; });
          writes.push({path:base+'/'+vis+'/'+kind,value:part,merge:true});
        }
      });
    });
    /* ★ 맨 마지막 — 이 한 줄이 「이제 새 판을 보라」다 */
    writes.push({path:ONT_ROOT+'/current',value:gen,last:true});
    return {root:ONT_ROOT,generationId:gen,writes:writes,counts:counts,
      confirmed:Number(snap.meta.confirmedEdges)||0,
      excluded:Number(snap.meta.excludedCandidates)||0,
      sourceMutation:'never',readOnlyDerived:true};
  }

  /* ══════ 얇은 거울 뜨기 (4-D, 2026-09-05) ══════
     무거운 자리(coInfo 4,158곳)를 한 번 읽은 «그 값»에서 관계에 쓰는 셋만 뽑는다.
     ⚠ 이 함수도 쓰지 않는다 — 무엇을 어디에 쓸지 적어서 돌려줄 뿐이다.
     ⚠ 200곳씩 모아 쓴다(실시간DB 16MB · 2026-08-16 대량 쓰기 사고).
     ⚠ 계좌·예금주·매출액·생년월일은 «담을 자리 자체가 없다» — 셋만 뽑는다. */
  var ONT_IDX_CHUNK=200;
  function mirrorPlan(coInfoValue, options){
    options=options||{};
    var rows=[], at=Number(options.at)||Date.now();
    entries(coInfoValue).forEach(function(p){
      var k=clean(p[0]), r=p[1]||{};
      if(!k||/[.#$\[\]\/]/.test(k)) return;
      var d={};
      entries(r.docs).forEach(function(x){
        var dk=clean(x[0]), doc=x[1]||{};
        if(!dk||/[.#$\[\]\/]/.test(dk)) return;
        d[dk]={n:clean(doc.docName), k:clean(doc.kind)};
      });
      rows.push({key:k, value:{c:clean(r.company), e:clean(r.erpCoId), d:d}});
    });
    var writes=[];
    for(var i=0;i<rows.length;i+=ONT_IDX_CHUNK){
      var part={};
      rows.slice(i,i+ONT_IDX_CHUNK).forEach(function(x){ part['ontIdx/'+x.key]=x.value; });
      writes.push({path:'', value:part, merge:true});
    }
    /* ★ 「언제 뜬 것인가」는 «맨 마지막» — 반쯤 뜬 거울을 새것으로 읽으면 안 된다 */
    writes.push({path:'ontIdxMeta', value:{at:at, n:rows.length}, last:true});
    return {root:'pucards', writes:writes, rows:rows.length, at:at};
  }

  /* 포털 타일과 등록부를 맞춘다.
     ⚠ 예전에는 «개수가 같은가»를 봤다. 그러면 타일 없는 프로그램(근로자 전용·공개 화면)을
       하나 넣는 순간 검사가 깨져, 등록을 «안 하는» 쪽이 쉬워진다.
       그래서 규칙을 바꿨다 — 타일은 모두 등록돼 있어야 하고,
       타일 없는 등록 프로그램은 portal:false 로 «타일이 없음을 밝혀야» 한다. */
  function auditPrograms(appKeys){
    appKeys = appKeys || [];
    var missing=appKeys.filter(function(k){ return !PROGRAMS[k]; });
    var undeclared=Object.keys(PROGRAMS).filter(function(k){ return appKeys.indexOf(k)<0 && PROGRAMS[k].portal!==false; });
    /* ⚠ registered 는 «포털에 내건 것»만 센다. ok 판정이 이미 portal:false 를 빼고 있는데
       세는 쪽만 전부를 세어 앞뒤가 안 맞았다(정부사업신청을 등록하며 드러남 2026-09-06). */
    var declared=Object.keys(PROGRAMS).filter(function(k){ return PROGRAMS[k].portal!==false; });
    return { registered:declared.length, missing:missing, extra:undeclared, undeclared:undeclared,
      ok:missing.length===0 && undeclared.length===0 };
  }

  /* 소유는 «경로»로 본다.
     ⚠ 맨 앞 토막만 보면 안 된다 — 기금관리는 data/funds 를, 푸른 메일은
       pucards/mailbox 를 소유한다. 그것은 이알피·기업정보함 나무의 «곁방»이고
       주인이 둘인 것이 아니다. 주인이 둘이라고 볼 것은 «똑같은 경로»뿐이다. */
  function ownedRoots(){
    var byPath={}, byTop={};
    Object.keys(PROGRAMS).forEach(function(k){
      (PROGRAMS[k].primaryRoots||[]).forEach(function(r){
        var p=clean(r); if(!p) return;
        if(!byPath[p]) byPath[p]=[]; if(byPath[p].indexOf(k)<0) byPath[p].push(k);
        var top=p.split('/')[0];
        if(!byTop[top]) byTop[top]=[]; if(byTop[top].indexOf(k)<0) byTop[top].push(k);
      });
    });
    return {byPath:byPath, byTop:byTop};
  }

  /* 화면 파일 목록을 등록부와 맞춘다. 등록 프로그램·딸린 화면·포털·제외 넷 중 하나여야 한다. */
  function auditScreens(files){
    var known={};
    known[PORTAL_FILE]='포털';
    Object.keys(PROGRAMS).forEach(function(k){ known[clean(PROGRAMS[k].file).split('?')[0]]='프로그램'; });
    Object.keys(SATELLITES).forEach(function(k){ known[clean(SATELLITES[k].file)]='딸린 화면'; });
    Object.keys(EXCLUDED_SCREENS).forEach(function(f){ known[f]='등록 제외'; });
    var unknown=(files||[]).map(clean).filter(function(f){ return f && !known[f]; });
    var ghosts=Object.keys(known).filter(function(f){ return (files||[]).indexOf(f)<0; });
    return { ok:unknown.length===0 && ghosts.length===0, unknown:unknown, ghosts:ghosts, known:known };
  }

  /* 저장뿌리 목록을 등록부와 맞춘다. 소유가 밝혀졌거나 밑바탕으로 적혀 있어야 한다. */
  function auditRoots(roots){
    var owned=ownedRoots();
    var unowned=(roots||[]).map(clean).filter(function(r){ return r && !owned.byTop[r] && !INFRA_ROOTS[r]; });
    var doubled=Object.keys(owned.byPath).filter(function(p){ return owned.byPath[p].length>1; })
      .map(function(p){ return {root:p, programs:owned.byPath[p]}; });
    var nested=Object.keys(owned.byPath).filter(function(p){
      return p.indexOf('/')>0 && owned.byTop[p.split('/')[0]].length>1;
    }).map(function(p){ return {root:p, programs:owned.byPath[p], under:p.split('/')[0]}; });
    return { ok:unowned.length===0 && doubled.length===0, unowned:unowned, doubleOwned:doubled, nested:nested };
  }

  /* 등록부 자체의 구멍을 화면에서 볼 수 있게 진단한다. 원본은 읽지도 쓰지도 않는다. */
  function auditRegistry(){
    var out=[], owned=ownedRoots();
    Object.keys(PROGRAMS).forEach(function(k){
      if(!(PROGRAMS[k].primaryRoots||[]).length)
        out.push({severity:'high',code:'program_no_root',program:k,store:'',id:k,label:PROGRAMS[k].name,
          detail:'소유한 저장 자리를 밝히지 않았습니다.',candidate:null});
    });
    Object.keys(owned.byPath).forEach(function(r){
      if(owned.byPath[r].length>1) out.push({severity:'high',code:'root_double_owned',program:owned.byPath[r][0],store:'',id:r,label:r,
        detail:'같은 저장 자리를 '+owned.byPath[r].length+'개 프로그램이 소유합니다: '+owned.byPath[r].join(', '),candidate:null});
    });
    Object.keys(SATELLITES).forEach(function(k){
      var s=SATELLITES[k];
      if(!PROGRAMS[s.program]) out.push({severity:'high',code:'satellite_orphan',program:'erp',store:'',id:s.file,label:s.name,
        detail:'딸린 화면이 등록부에 없는 프로그램을 가리킵니다: '+s.program,candidate:null});
    });
    /* 소유는 밝혔지만 읽기 계획이 아직 안 다루는 자리 — 관계망이 그 자료를 못 본다. */
    var read={};
    Object.keys(READ_ADAPTERS).forEach(function(k){
      var a=READ_ADAPTERS[k];
      if(a.strategy==='in_app'){ read['@'+a.program]=true; return; }
      var top=clean(a.path).split('/')[0]; if(top) read[top]=true;
    });
    Object.keys(owned.byPath).forEach(function(r){
      if(read[r.split('/')[0]]) return;
      var program=owned.byPath[r][0]; if(read['@'+program]) return;
      out.push({severity:'medium',code:'root_not_read',program:program,store:'',id:r,label:r,
        detail:'소유는 밝혔지만 통합 진단이 아직 이 자리를 읽지 않습니다.',candidate:null});
    });
    Object.keys(PREDICATES_PLANNED).forEach(function(p){
      out.push({severity:'low',code:'predicate_planned',program:'erp',store:'',id:p,label:p,
        detail:PREDICATES_PLANNED[p],candidate:null});
    });
    return { readOnly:true, sourceMutation:'never', issues:out,
      counts:{ programs:Object.keys(PROGRAMS).length, satellites:Object.keys(SATELLITES).length,
        excluded:Object.keys(EXCLUDED_SCREENS).length, infraRoots:Object.keys(INFRA_ROOTS).length,
        plannedPredicates:Object.keys(PREDICATES_PLANNED).length, gaps:out.length } };
  }

  return { VERSION:VERSION, TERMS:TERMS, PROGRAMS:PROGRAMS, STORE_TYPES:STORE_TYPES, READ_ADAPTERS:READ_ADAPTERS,
    PORTAL_FILE:PORTAL_FILE, SATELLITES:SATELLITES, EXCLUDED_SCREENS:EXCLUDED_SCREENS, INFRA_ROOTS:INFRA_ROOTS,
    PREDICATES_PLANNED:PREDICATES_PLANNED, auditScreens:auditScreens, auditRoots:auditRoots, auditRegistry:auditRegistry,
    COMPANY_NUMBER:COMPANY_NUMBER, COMPANY_NUMBER_HEADS:COMPANY_NUMBER_HEADS,
    companyNumberHead:companyNumberHead, companyNumberBody:companyNumberBody, formatCompanyNumber:formatCompanyNumber,
    parseCompanyNumber:parseCompanyNumber, companyNumberOrder:companyNumberOrder, companyNumberTargets:companyNumberTargets,
    validateCompanyNumbers:validateCompanyNumbers, companyNumberHistory:companyNumberHistory,
    audit:audit, auditIntegrated:auditIntegrated, uploadPlan:uploadPlan, ONT_ROOT:ONT_ROOT, mirrorPlan:mirrorPlan, getReadPlan:getReadPlan, searchEntities:searchEntities, entityConnections:entityConnections,
    organization360:organization360, validateCompanyLink:validateCompanyLink, companyLinkCandidates:companyLinkCandidates,
    companyLinkAutoMatch:companyLinkAutoMatch,
    validateWorkReferences:validateWorkReferences, workReferenceCandidates:workReferenceCandidates, validateWorkBatch:validateWorkBatch,
    validateHanaSourceBatch:validateHanaSourceBatch,
    VALIDATION_CATEGORIES:VALIDATION_CATEGORIES, buildValidationQueue:buildValidationQueue,
    filterValidationQueue:filterValidationQueue, buildSnapshot:buildSnapshot, validateSnapshot:validateSnapshot, auditPrograms:auditPrograms,
    canonicalId:canon, sourceCanonicalId:sourceCanon, normalizeCompanyName:normName, normalizeBusinessNumber:normBiz };
});
