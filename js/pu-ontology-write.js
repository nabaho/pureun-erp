/* 푸른통합 온톨로지 저장 관문 v1
 *
 * 기존 앱은 data-mode="observe" 로 위반을 기록만 한다. 새 앱은 선언이 없으면
 * enforce 이며, 이 모듈의 prepareRecord/createGateway 를 지나야 저장된다.
 * 화면 칸을 고정하지 않고 영구 ID·출처·판·수정차수처럼 바뀌면 안 되는 뼈대만 지킨다.
 */
(function(root, factory){
  var ontology = root && root.PuOntology;
  if(typeof module === 'object' && module.exports) ontology = require('./pu-ontology.js');
  var api = factory(ontology || {});
  if(typeof module === 'object' && module.exports) module.exports = api;
  if(root) root.PuOntologyWrite = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function(O){
  'use strict';

  var CONTRACT_VERSION = 1;
  var ID_BAD = /[.#$\/\[\]]/;
  var MODES = { observe:1, enforce:1 };
  /* 2026-09-06 이전부터 운영 중인 앱만 관찰 유예를 받는다. 여기에 없는 새 프로그램은
     화면 태그에 observe를 써도 강제 모드다. 기존 앱도 정리가 끝나는 순서대로 뺀다. */
  var LEGACY_OBSERVE_PROGRAMS = {
    erp:1,consult:1,work:1,career:1,govbid:1,mail:1,cards:1,photos:1,fund:1,
    rules:1,docs:1,payroll:1,paydata:1,home:1,news:1
  };
  var RELATION_FIELDS = ['companyId','sid','sourceId'];
  var issues = [];
  var issueSeen = {};
  var rawTransactions = typeof WeakMap === 'function' ? new WeakMap() : null;

  function clean(v){ return v == null ? '' : String(v).trim(); }
  function own(o,k){ return Object.prototype.hasOwnProperty.call(o||{},k); }
  function copy(v){
    if(!v || typeof v !== 'object') return v;
    if(Array.isArray(v)) return v.slice();
    return Object.assign({},v);
  }
  function resolveMode(mode){ return MODES[mode] ? mode : 'enforce'; }
  function runtimeMode(program,declared){
    return LEGACY_OBSERVE_PROGRAMS[program] ? resolveMode(declared||'observe') : 'enforce';
  }
  function auditProgramContracts(programs){
    var missing=[],legacy=[],enforced=[];
    Object.keys(programs||{}).forEach(function(key){
      var p=programs[key]||{};
      if(LEGACY_OBSERVE_PROGRAMS[key]){legacy.push(key);return;}
      if(!Array.isArray(p.writeContracts)||!p.writeContracts.length)missing.push(key);
      else enforced.push(key);
    });
    Object.keys(LEGACY_OBSERVE_PROGRAMS).forEach(function(key){if(!programs||!programs[key])missing.push('stale:'+key);});
    return {ok:missing.length===0,missing:missing,legacy:legacy,enforced:enforced};
  }
  function currentSchema(){ return Number(O.VERSION)||1; }
  function knownType(type){ return !!(O.TERMS && O.TERMS.entityTypes && O.TERMS.entityTypes[type]); }
  function timeValue(v){ return typeof v === 'number' ? isFinite(v) : !!clean(v); }
  function issue(code,message,field,severity){ return {code:code,message:message,field:field||'',severity:severity||'error'}; }

  function validateRecord(value, options){
    options=options||{};
    var out=[];
    if(!value || typeof value !== 'object' || Array.isArray(value)){
      return {ok:false,issues:[issue('record_invalid','저장값이 레코드 모양이 아닙니다.')]};
    }
    var id=clean(value.id), type=clean(value.entityType), schema=Number(value.schemaVersion);
    if(!id) out.push(issue('id_missing','영구 ID가 없습니다.','id'));
    else if(ID_BAD.test(id)||id.length>200) out.push(issue('id_invalid','영구 ID에 Firebase 금지문자 또는 지나치게 긴 값이 있습니다.','id'));
    if(!type) out.push(issue('entity_type_missing','공통 개체 종류(entityType)가 없습니다.','entityType'));
    else if(!knownType(type)) out.push(issue('entity_type_unknown','온톨로지 사전에 없는 개체 종류입니다: '+type,'entityType'));
    if(!Number.isInteger(schema)) out.push(issue('schema_version_missing','자료 구조 판(schemaVersion)이 없습니다.','schemaVersion'));
    else if(schema < Math.max(1,currentSchema()-1) || schema > currentSchema()) out.push(issue('schema_version_unsupported','지원하지 않는 자료 구조 판입니다: '+schema,'schemaVersion'));
    if(Number(value.contractVersion)!==CONTRACT_VERSION) out.push(issue('contract_version_invalid','저장 계약 판이 맞지 않습니다.','contractVersion'));
    if(!timeValue(value.createdAt)) out.push(issue('created_at_missing','생성 시각이 없습니다.','createdAt'));
    if(!timeValue(value.updatedAt)) out.push(issue('updated_at_missing','수정 시각이 없습니다.','updatedAt'));
    if(!Number.isInteger(Number(value.revision)) || Number(value.revision)<1) out.push(issue('revision_invalid','수정차수(revision)는 1 이상의 정수여야 합니다.','revision'));
    RELATION_FIELDS.forEach(function(f){
      if(own(value,f) && value[f]!=='' && value[f]!=null && (!clean(value[f]) || ID_BAD.test(clean(value[f]))))
        out.push(issue('relation_id_invalid',f+' 관계 열쇠가 올바르지 않습니다.',f));
    });
    var hasSourceKind=!!clean(value.sourceKind),hasSourceId=!!clean(value.sourceId);
    if(hasSourceKind!==hasSourceId) out.push(issue('source_pair_incomplete','원본 관계는 sourceKind와 sourceId를 함께 저장해야 합니다.','sourceId'));
    if(clean(value.companyName) && !clean(value.companyId) && options.allowPendingCompany!==true)
      out.push(issue('company_name_is_not_key','업체명만 관계 열쇠로 저장할 수 없습니다. companyId가 필요합니다.','companyId'));
    if(type==='Person' && !clean(value.sid)) out.push(issue('sid_missing','사람 개체에는 영구 사번(sid)이 필요합니다.','sid'));
    return {ok:out.length===0,issues:out};
  }

  function prepareRecord(record, options){
    options=options||{};
    var previous=options.previous||null, now=options.now==null?Date.now():options.now;
    var expected=options.expectedRevision;
    if(previous && expected!=null && Number(previous.revision||0)!==Number(expected)){
      return {ok:false,value:null,issues:[issue('revision_conflict','다른 사용자가 먼저 수정했습니다. 최신 자료를 다시 연 뒤 저장하세요.','revision')]};
    }
    var out=copy(record)||{};
    out.entityType=clean(options.entityType||out.entityType);
    out.schemaVersion=currentSchema();
    out.contractVersion=CONTRACT_VERSION;
    out.createdAt=previous&&previous.createdAt!=null?previous.createdAt:(out.createdAt!=null?out.createdAt:now);
    out.updatedAt=now;
    if(previous&&previous.createdBy!=null) out.createdBy=previous.createdBy;
    else if(out.createdBy==null&&clean(options.actor)) out.createdBy=clean(options.actor);
    if(clean(options.actor)) out.updatedBy=clean(options.actor);
    out.revision=previous?Number(previous.revision||0)+1:Math.max(1,Number(out.revision||1));
    var checked=validateRecord(out,options);
    return {ok:checked.ok,value:out,issues:checked.issues};
  }

  function tombstone(previous,options){
    options=options||{};
    if(!previous || typeof previous!=='object') return {ok:false,value:null,issues:[issue('delete_target_missing','삭제할 원본을 찾지 못했습니다.')]};
    var next=Object.assign({},previous,{_deleted:true,deletedAt:options.now==null?Date.now():options.now,deletedBy:clean(options.actor)});
    return prepareRecord(next,Object.assign({},options,{entityType:previous.entityType,previous:previous}));
  }

  function recordLike(value){ return !!(value&&typeof value==='object'&&!Array.isArray(value)&&(own(value,'id')||own(value,'entityType'))); }
  function inspectWrite(input){
    input=input||{};
    var mode=resolveMode(input.mode), out=[];
    if(input.kind==='remove'||input.value===null){
      out.push(issue('physical_delete','물리적 삭제 대신 삭제 표식(tombstone)을 저장해야 합니다.','_deleted'));
    }else if(input.kind==='update'&&input.value&&typeof input.value==='object'&&!recordLike(input.value)){
      Object.keys(input.value).forEach(function(k){
        var child=input.value[k],childPath=refPath(input.path,k);
        if(child!==null&&!recordLike(child)){
          out.push(Object.assign(issue('partial_update_unverifiable','부분 update는 현재 revision과 필수 필드를 검증할 수 없습니다. 공용 트랜잭션 저장을 사용하세요.'),{path:childPath}));
          return;
        }
        var checked=inspectWrite({kind:child===null?'remove':'set',path:childPath,value:child,mode:'enforce'});
        checked.issues.forEach(function(x){out.push(Object.assign({},x,{path:checked.path}));});
      });
    }else if(input.kind==='transaction'){
      out.push(issue('transaction_requires_gateway','직접 transaction은 수정차수 계약을 보장할 수 없습니다. 공용 저장 관문을 사용하세요.','revision'));
    }else if(recordLike(input.value)){
      out=validateRecord(input.value,input).issues;
    }
    var valid=out.length===0;
    return {ok:mode==='observe'||valid,valid:valid,mode:mode,path:clean(input.path),issues:out};
  }

  function remember(report,program,reporter){
    if(report.valid) return;
    report.issues.forEach(function(x){
      var row=Object.assign({program:clean(program)||'unknown',path:x.path||report.path,at:Date.now()},x);
      issues.push(row); if(issues.length>500) issues.shift();
      var sig=row.program+'|'+row.path.split('/').slice(0,3).join('/')+'|'+row.code;
      if(issueSeen[sig]) return; issueSeen[sig]=1;
      if(typeof reporter==='function') reporter(row);
      else if(typeof console!=='undefined'&&console.warn) console.warn('[온톨로지 저장 감시] '+row.message+' ('+row.path+')');
    });
  }

  function createGateway(options){
    options=options||{};
    var mode=resolveMode(options.mode), actor=options.actor||'', now=typeof options.now==='function'?options.now:function(){return Date.now();};
    return {
      mode:mode,
      inspect:function(input){return inspectWrite(Object.assign({},input,{mode:mode}));},
      prepare:function(record,ctx){return prepareRecord(record,Object.assign({actor:actor,now:now()},ctx||{}));},
      save:function(ref,record,ctx){
        ctx=ctx||{}; var failure=null;
        if(!ref||typeof ref.transaction!=='function') return Promise.reject(new Error('트랜잭션 저장소가 없습니다.'));
        var transaction=rawTransactions&&rawTransactions.get(ref)||ref.transaction;
        return Promise.resolve(transaction.call(ref,function(previous){
          var p=prepareRecord(record,Object.assign({actor:actor,now:now(),previous:previous},ctx));
          if(!p.ok){failure=p;return undefined;} return p.value;
        })).then(function(result){
          if(failure) throw new Error(failure.issues[0].message);
          if(!result||result.committed===false) throw new Error('다른 사용자가 먼저 수정했습니다. 최신 자료를 다시 연 뒤 저장하세요.');
          return result;
        });
      },
      remove:function(ref,previous,ctx){
        var gone=tombstone(previous,Object.assign({actor:actor,now:now()},ctx||{}));
        if(!gone.ok) return Promise.reject(new Error(gone.issues[0].message));
        return this.save(ref,gone.value,Object.assign({},ctx||{},{entityType:previous.entityType,expectedRevision:previous.revision}));
      }
    };
  }

  /* 기존 자료를 곧바로 고치지 않는다. 무엇을 자동 보완할 수 있고 무엇은 사람이
     ID를 확인해야 하는지 계획만 돌려준다. patches는 명시적으로 승인한 이관기만 쓴다. */
  function planMigration(records,options){
    options=options||{};var rows=Array.isArray(records)?records:[],ready=[],blocked=[];
    rows.forEach(function(record,index){
      if(!record||!clean(record.id)){blocked.push({index:index,id:'',issues:[issue('id_missing','영구 ID가 없어 자동 변환할 수 없습니다.','id')]});return;}
      var p=prepareRecord(record,{entityType:options.entityType||record.entityType,previous:record,
        expectedRevision:record.revision,now:options.now==null?Date.now():options.now,actor:options.actor||'',allowPendingCompany:options.allowPendingCompany});
      (p.ok?ready:blocked).push(p.ok?{index:index,id:record.id,value:p.value}:{index:index,id:record.id,issues:p.issues});
    });
    return {readOnly:true,total:rows.length,ready:ready,blocked:blocked,
      counts:{ready:ready.length,blocked:blocked.length}};
  }

  function refPath(parent,child){
    var a=clean(parent).replace(/^\/+|\/+$/g,''),b=clean(child).replace(/^\/+|\/+$/g,'');
    return a&&b?a+'/'+b:(a||b);
  }
  function rejected(message,completion){
    var e=new Error(message); e.code='ONTOLOGY_WRITE_BLOCKED';
    if(typeof completion==='function') setTimeout(function(){completion(e);},0);
    return Promise.reject(e);
  }
  function installFirebaseCompat(firebase,options){
    options=options||{};
    if(!firebase||typeof firebase.database!=='function'||firebase.database.__puOntologyWrapped) return false;
    var original=firebase.database,mode=resolveMode(options.mode),program=options.program||'unknown',reporter=options.reporter;
    function patchRef(ref,path){
      if(!ref||ref.__puOntologyWrapped) return ref;
      Object.defineProperty(ref,'__puOntologyWrapped',{value:true});
      var child=ref.child;if(typeof child==='function')ref.child=function(p){return patchRef(child.call(this,p),refPath(path,p));};
      var push=ref.push;
      if(typeof push==='function')ref.push=function(value,completion){
        if(arguments.length===0)return patchRef(push.call(this),refPath(path,'{push}'));
        var report=inspectWrite({kind:'push',path:refPath(path,'{push}'),value:value,mode:mode});
        remember(report,program,reporter);
        if(!report.ok)return rejected(report.issues[0].message,completion);
        return push.apply(this,arguments);
      };
      ['set','update','remove','transaction'].forEach(function(kind){
        var fn=ref[kind];if(typeof fn!=='function')return;
        if(kind==='transaction'&&rawTransactions)rawTransactions.set(ref,fn);
        ref[kind]=function(value,completion){
          var actualKind=kind==='remove'?'remove':kind;
          var report=inspectWrite({kind:actualKind,path:path,value:kind==='remove'?null:value,mode:mode});
          remember(report,program,reporter);
          if(!report.ok)return rejected(report.issues[0].message,kind==='remove'?value:completion);
          return fn.apply(this,arguments);
        };
      });
      return ref;
    }
    function patchDb(db){
      if(!db||db.__puOntologyWrapped)return db;
      Object.defineProperty(db,'__puOntologyWrapped',{value:true});
      var ref=db.ref;if(typeof ref==='function')db.ref=function(p){return patchRef(ref.call(this,p),clean(p));};
      return db;
    }
    function wrapped(){return patchDb(original.apply(firebase,arguments));}
    Object.getOwnPropertyNames(original).forEach(function(k){try{if(k!=='length'&&k!=='name'&&k!=='prototype')Object.defineProperty(wrapped,k,Object.getOwnPropertyDescriptor(original,k));}catch(e){}});
    wrapped.__puOntologyWrapped=true; wrapped.__puOntologyOriginal=original;
    firebase.database=wrapped;
    return true;
  }

  function detectProgram(){
    if(typeof location==='undefined')return '';
    var file=(location.pathname||'').split('/').pop(),search=location.search||'',best='';
    Object.keys(O.PROGRAMS||{}).forEach(function(k){var f=O.PROGRAMS[k].file||'',parts=f.split('?');if(parts[0]===file){if(parts[1]&&search.indexOf(parts[1])>=0)best=k;else if(!best)best=k;}});
    if(!best)Object.keys(O.SATELLITES||{}).some(function(k){var s=O.SATELLITES[k]||{};if(clean(s.file).split('?')[0]===file){best=clean(s.program);return true;}return false;});
    return best;
  }
  function getIssues(){return issues.slice();}
  function clearIssues(){issues.length=0;issueSeen={};}

  var api={CONTRACT_VERSION:CONTRACT_VERSION,LEGACY_OBSERVE_PROGRAMS:LEGACY_OBSERVE_PROGRAMS,
    resolveMode:resolveMode,runtimeMode:runtimeMode,auditProgramContracts:auditProgramContracts,
    validateRecord:validateRecord,prepareRecord:prepareRecord,planMigration:planMigration,
    inspectWrite:inspectWrite,tombstone:tombstone,createGateway:createGateway,installFirebaseCompat:installFirebaseCompat,
    detectProgram:detectProgram,getIssues:getIssues,clearIssues:clearIssues};

  if(typeof window!=='undefined'&&window.firebase&&typeof document!=='undefined'){
    var script=document.currentScript,declared=script&&script.getAttribute('data-mode');
    var program=detectProgram();
    installFirebaseCompat(window.firebase,{mode:runtimeMode(program,declared),program:program});
  }
  return api;
});
