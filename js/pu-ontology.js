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
      derivedFrom:['Case|Project|Task|Document|Submission','Contract|Case|Project|Document'],
      paidFor:['FinancialTransaction','Contract|Case|Project|Organization'],
      invoicedTo:['Invoice','Organization'],
      scheduledFor:['ScheduleEvent','Organization|Contract|Case|Project|Person'],
      evidencedBy:['Contract|Case|Project|FinancialTransaction','Document|MediaAsset'],
      attachedTo:['Document|MediaAsset|Message','Organization|Contract|Case|Project|Person'],
      ownedBy:['Document|MediaAsset|Message','Person'],
      transferredTo:['Task|Case|Project','Person'],
      forOrganization:['Task|Document|MediaAsset|Message|PayrollRecord|Policy|Submission','Organization'],
      fulfills:['Submission','Contract|Case|Project'],
      supersedes:['Policy|Document','Policy|Document']
    }
  };

  /* 포털 APPS의 key와 1:1로 맞춘다. 한 프로그램이 여러 뿌리를 읽어도
     자신이 정본으로 소유하는 뿌리는 primaryRoots에만 적는다. */
  var PROGRAMS = {
    erp:{ name:'푸른이알피', file:'pu-erp.html', primaryRoots:['data'],
      entityTypes:['Organization','Person','Employment','Contract','Case','Project','ScheduleEvent','FinancialTransaction','Invoice','PayrollRecord','Policy'] },
    consult:{ name:'정부사업일정', file:'gov-consulting.html', primaryRoots:['scal_roundlog','activeWriter/gov_consulting'],
      sharedRoots:['data/consultings','puphotos'], entityTypes:['Organization','Person','Project','ScheduleEvent','MediaAsset'] },
    work:{ name:'업무관리', file:'work.html', primaryRoots:['work_erp'], sharedRoots:['data','pucards/idx'],
      entityTypes:['Person','Organization','Task','ScheduleEvent'] },
    career:{ name:'경력관리', file:'kcareer.html', primaryRoots:['kcareer/{uid}'], sharedRoots:['data'],
      entityTypes:['Person','Employment','Project','Document'] },
    mail:{ name:'푸른 메일', file:'pu-cards.html?view=mail', primaryRoots:['pucards/mailbox','pucards/sentBox','pucards/scheduled'],
      entityTypes:['Person','Organization','Message','Document'] },
    cards:{ name:'기업정보함', file:'pu-cards.html', primaryRoots:['pucards'], sharedRoots:['data/companies'],
      entityTypes:['Organization','Person','Document','MediaAsset','Message'] },
    photos:{ name:'사진첩', file:'pu-photos.html', primaryRoots:['puphotos'], sharedRoots:['pucards/coInfo'],
      entityTypes:['Person','Organization','Document','MediaAsset'] },
    fund:{ name:'기금관리', file:'fund.html', primaryRoots:['data/funds'], sharedRoots:['data/finance_income','pucards/idx','pucards/coInfo'],
      entityTypes:['Organization','Person','Project','FinancialTransaction','Document'] },
    rules:{ name:'취업규칙 관리', file:'rules.html', primaryRoots:['chwieop'], sharedRoots:['data/user_dir'],
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
       빌려 읽는 곳: homepage/newsBrief(자동으로 담을 기사) · pucards/scheduled(보낸 결과).
       ⚠ 명단은 «여기가 정본»이다 — 기업정보함 명함을 실시간으로 끌어오지 않는다.
         끌어오면 명함 한 장이 바뀔 때 누구에게 갈지가 조용히 달라진다. */
    news:{ name:'뉴스레터 관리', file:'pu-news.html', primaryRoots:['newsletter'],
      sharedRoots:['homepage/newsBrief','pucards/scheduled'],
      entityTypes:['Organization','Person','Message','Document'] }
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
  var SOURCE_KIND_STORE = { company:'companies', contract:'contracts', case:'cases', consulting:'consultings', fund:'funds', other:'other_projects' };

  /* 2단계 읽기 어댑터. payload(사진 원본·문서 본문·제출 암호문·급여 직원표)는
     통합 화면에서 절대 읽지 않는다. in_app은 해당 프로그램 안에서만 진단한다. */
  var READ_ADAPTERS = {
    erp_core:{program:'erp',strategy:'local',path:'data',parser:'erp'},
    consult_core:{program:'consult',strategy:'local',path:'data/consultings',parser:'erp'},
    fund_core:{program:'fund',strategy:'local',path:'data/funds',parser:'erp'},
    work_items:{program:'work',strategy:'remote',path:'work_erp/items',parser:'workItems'},
    career_counts:{program:'career',strategy:'remote',path:'kcareer/{uid}/counts',parser:'coverage'},
    cards_index:{program:'cards',strategy:'remote',path:'pucards/idx',parser:'cardIndex'},
    /* ── 기업 상세·근로자 정보함 (대표 지시 2026-09-02) ──
       예전에는 기업정보함에서 pucards/idx 하나만 읽었다. 그런데 값이 모여 있는 곳은
       coInfo 다(업태·상시근로자수·매출액·은행계좌·세금계산서 발급처, 4,158곳) —
       통합 화면이 그것을 못 보고 있었다.
       ⚠⚠ 두 자리 모두 «가벼운 자료»다. 사진 원본·판독 글자·급여 금액은 여기 없다
         (2단계 문서의 「읽지 않는 자료」 규칙 그대로).
       ⚠ workerInfo 에는 주민번호·주소·연락처가 «애초에 담기지 않는다»
         (js/pu-doc-file.js 의 workerDocTargets — 담는 칸은 다섯뿐이다). */
    cards_coinfo:{program:'cards',strategy:'remote',path:'pucards/coInfo',parser:'coInfo'},
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
  function normName(v){ return clean(v).toLowerCase().replace(/[\s()（）·.,_\-주식회사㈜]/g,''); }
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
        seen[id] = 1; indexes[store][id] = r; entities[canon(type,id)] = { type:type, store:store, program:'erp', id:id, label:recordLabel(r,type,id) };
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

    ['finance_income','finance_expense','finance_invoice'].forEach(function(store){
      arr(data[store]).forEach(function(r){
        var kind=clean(r.sourceKind), sid=clean(r.sourceId), targetStore=SOURCE_KIND_STORE[kind];
        if(!kind || kind==='manual' || kind==='unknown' || !sid) return;
        if(targetStore && !(indexes[targetStore]||{})[sid]) issue(issues,'high','orphan_source',store,r.id,r.id,'sourceKind='+kind+' 이지만 원본 '+sid+'가 없습니다.');
        if(targetStore && (indexes[targetStore]||{})[sid]) addEdge(edges,canon(STORE_TYPES[store],r.id),store==='finance_invoice'?'invoicedTo':'paidFor',canon(STORE_TYPES[targetStore],sid),store,r.id,1);
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
  function getReadPlan(context){
    context=context||{};
    return Object.keys(READ_ADAPTERS).map(function(key){
      var a=READ_ADAPTERS[key], path=resolvePath(a.path,context);
      if(/\{uid\}/.test(a.path||'')&&!clean(context.uid)) return null;
      if(a.strategy!=='remote' || !path || /\{[^}]+\}/.test(path)) return null;
      return {key:key,program:a.program,path:path,parser:a.parser,strategy:a.strategy};
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
    var coverage={}; Object.keys(PROGRAMS).forEach(function(k){coverage[k]={program:k,name:PROGRAMS[k].name,state:'not_loaded',records:0,adapters:0,loaded:0,denied:0,inApp:0};});
    Object.keys(READ_ADAPTERS).forEach(function(key){
      var a=READ_ADAPTERS[key], c=coverage[a.program]; c.adapters++;
      if(a.strategy==='local'){c.loaded++;c.records+=(a.program==='consult'?arr(data.consultings).length:a.program==='fund'?arr(data.funds).length:Object.keys(base.stats).reduce(function(n,k){return n+(base.stats[k]||0);},0));return;}
      if(a.strategy==='in_app'){c.inApp++;return;}
      var r=sourceResults[key];
      if(!r)return;
      if(!r.ok){c.denied++;issue(issues,'medium','source_unreadable',key,'',PROGRAMS[a.program].name,'읽기 권한 또는 연결 문제: '+clean(r.error||'unknown'));return;}
      c.loaded++;var parsed=parseExternal(Object.assign({key:key},a),r.value,graph,companies); c.records+=parsed.records||0;
    });
    Object.keys(coverage).forEach(function(k){var c=coverage[k];c.state=c.denied?(c.loaded?'partial':'denied'):(c.loaded?(c.records?'ready':'empty'):(c.inApp?'in_app':'not_loaded'));});
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
  function linkName(v){return clean(v).toLowerCase().replace(/주식회사|유한회사|㈜|[\s()（）·.,_\-]/g,'');}
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

  /* 5단계 검증센터. 진단 결과를 사람이 한 건씩 검토할 작업목록으로 바꾼다.
     검토 상태는 화면 메모일 뿐이며 원본이나 서버에 기록하지 않는다. */
  var VALIDATION_CATEGORIES={
    identity:{label:'식별자·중복',codes:['missing_id','duplicate_id','ambiguous_company_name','duplicate_business_number']},
    organization:{label:'업체 연결',codes:['orphan_company','missing_company_id','unresolved_company','inferred_relation']},
    person:{label:'담당자 연결',codes:['orphan_person']},
    source:{label:'원본·권한',codes:['orphan_source','source_unreadable','dangling_relation']}
  };
  function validationCategory(code){
    var found='source';Object.keys(VALIDATION_CATEGORIES).some(function(k){if(VALIDATION_CATEGORIES[k].codes.indexOf(code)>=0){found=k;return true;}return false;});return found;
  }
  function issueProgram(store){
    var a=READ_ADAPTERS[store];return a&&a.program||'erp';
  }
  function validationAdvice(code,candidate){
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
      var program=issueProgram(x.store),category=validationCategory(x.code),seed=[x.code,x.store,x.id,x.candidate,x.detail,i].join('|');
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
      parts[vis].entities[key]={id:clean(e.id),type:e.type,program:clean(e.program||'erp'),source:clean(e.source||e.store),schemaVersion:VERSION};
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

  function auditPrograms(appKeys){
    appKeys = appKeys || [];
    var missing=appKeys.filter(function(k){ return !PROGRAMS[k]; });
    var extra=Object.keys(PROGRAMS).filter(function(k){ return appKeys.indexOf(k)<0; });
    return { registered:Object.keys(PROGRAMS).length, missing:missing, extra:extra, ok:missing.length===0 };
  }

  return { VERSION:VERSION, TERMS:TERMS, PROGRAMS:PROGRAMS, STORE_TYPES:STORE_TYPES, READ_ADAPTERS:READ_ADAPTERS,
    audit:audit, auditIntegrated:auditIntegrated, getReadPlan:getReadPlan, searchEntities:searchEntities, entityConnections:entityConnections,
    organization360:organization360, validateCompanyLink:validateCompanyLink, companyLinkCandidates:companyLinkCandidates,
    VALIDATION_CATEGORIES:VALIDATION_CATEGORIES, buildValidationQueue:buildValidationQueue,
    filterValidationQueue:filterValidationQueue, buildSnapshot:buildSnapshot, validateSnapshot:validateSnapshot, auditPrograms:auditPrograms,
    canonicalId:canon, sourceCanonicalId:sourceCanon, normalizeCompanyName:normName, normalizeBusinessNumber:normBiz };
});
