/* 푸른통합시스템 온톨로지 v1
   - 기존 운영 데이터는 정본으로 그대로 둔다.
   - 이 모듈은 읽기·진단·관계 후보 생성만 하며 저장하거나 삭제하지 않는다.
   - 새 프로그램은 PROGRAMS와 TERMS에 먼저 등록한 뒤 데이터를 만든다. */
(function(root, factory){
  var api = factory();
  if(typeof module === 'object' && module.exports) module.exports = api;
  if(root) root.PuOntology = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function(){
  'use strict';

  var VERSION = 2;
  var TERMS = {
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
  function normName(v){ return clean(v).toLowerCase().replace(/[\s()（）·.,_\-주식회사㈜]/g,''); }
  function normBiz(v){ return clean(v).replace(/\D/g,''); }
  function canon(type, id){ return type + ':' + encodeURIComponent(clean(id)); }
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
        var id = clean(r.id || (store==='user_accounts'||store==='user_dir' ? r.sid : ''));
        if(!id){ issue(issues,'high','missing_id',store,'',store+' '+(pos+1)+'번째', '관계를 고정할 ID가 없습니다.'); return; }
        if(seen[id]) issue(issues,'high','duplicate_id',store,id,id,'같은 ID가 두 번 이상 존재합니다.');
        seen[id] = 1; indexes[store][id] = r; entities[canon(type,id)] = { type:type, store:store, id:id };
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

  function auditPrograms(appKeys){
    appKeys = appKeys || [];
    var missing=appKeys.filter(function(k){ return !PROGRAMS[k]; });
    var extra=Object.keys(PROGRAMS).filter(function(k){ return appKeys.indexOf(k)<0; });
    return { registered:Object.keys(PROGRAMS).length, missing:missing, extra:extra, ok:missing.length===0 };
  }

  return { VERSION:VERSION, TERMS:TERMS, PROGRAMS:PROGRAMS, STORE_TYPES:STORE_TYPES, READ_ADAPTERS:READ_ADAPTERS,
    audit:audit, auditIntegrated:auditIntegrated, getReadPlan:getReadPlan, auditPrograms:auditPrograms,
    canonicalId:canon, sourceCanonicalId:sourceCanon, normalizeCompanyName:normName, normalizeBusinessNumber:normBiz };
});
