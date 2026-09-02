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

  var VERSION = 1;
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
      entityTypes:['Person','Organization','Document'] }
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

  function arr(v){
    if(Array.isArray(v)) return v.filter(function(x){ return x && !x._deleted; });
    if(v && typeof v === 'object') return Object.keys(v).map(function(k){ return v[k]; }).filter(function(x){ return x && !x._deleted; });
    return [];
  }
  function clean(v){ return String(v == null ? '' : v).trim(); }
  function normName(v){ return clean(v).toLowerCase().replace(/[\s()（）·.,_\-주식회사㈜]/g,''); }
  function normBiz(v){ return clean(v).replace(/\D/g,''); }
  function canon(type, id){ return type + ':' + encodeURIComponent(clean(id)); }
  function edgeId(s, p, o){ return 'edge:' + encodeURIComponent(s+'|'+p+'|'+o); }
  function addEdge(out, subject, predicate, object, sourceStore, sourceId, confidence){
    if(!subject || !object) return;
    out.push({ id:edgeId(subject,predicate,object), subject:subject, predicate:predicate, object:object,
      sourceStore:sourceStore, sourceId:sourceId, confidence:confidence == null ? 1 : confidence, schemaVersion:VERSION });
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

  function auditPrograms(appKeys){
    appKeys = appKeys || [];
    var missing=appKeys.filter(function(k){ return !PROGRAMS[k]; });
    var extra=Object.keys(PROGRAMS).filter(function(k){ return appKeys.indexOf(k)<0; });
    return { registered:Object.keys(PROGRAMS).length, missing:missing, extra:extra, ok:missing.length===0 };
  }

  return { VERSION:VERSION, TERMS:TERMS, PROGRAMS:PROGRAMS, STORE_TYPES:STORE_TYPES,
    audit:audit, auditPrograms:auditPrograms, canonicalId:canon, normalizeCompanyName:normName, normalizeBusinessNumber:normBiz };
});
