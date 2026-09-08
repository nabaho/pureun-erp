/* Cloud Functions 관리자 SDK는 Firebase 보안규칙을 지나지 않는다.
 * 그래서 자동수집·메일·알림의 직접 쓰기도 별도 관문으로 관찰한다.
 * 현재 운영 자료를 멈추지 않도록 observe만 쓰며, 신규 서버 업무는 reviewRecord를
 * 통과시킨 뒤 저장한다. 값 본문은 절대 로그에 남기지 않는다. */
'use strict';
const CONTRACT_VERSION=1;
const BAD=/[.#$\/\[\]]/;
const seen=new Set(),issues=[];

function clean(v){return v==null?'':String(v).trim();}
function recordLike(v){return !!(v&&typeof v==='object'&&!Array.isArray(v)&&(Object.hasOwn(v,'id')||Object.hasOwn(v,'entityType')));}
function reviewRecord(v){
  const out=[];
  if(!recordLike(v))return {ok:true,issues:out};
  if(!clean(v.id)||BAD.test(clean(v.id)))out.push({code:'id_invalid',message:'영구 ID가 없거나 올바르지 않습니다.'});
  if(!clean(v.entityType))out.push({code:'entity_type_missing',message:'공통 개체 종류가 없습니다.'});
  if(!Number.isInteger(Number(v.schemaVersion)))out.push({code:'schema_version_missing',message:'자료 구조 판이 없습니다.'});
  if(Number(v.contractVersion)!==CONTRACT_VERSION)out.push({code:'contract_version_invalid',message:'저장 계약 판이 맞지 않습니다.'});
  if(!Number.isInteger(Number(v.revision))||Number(v.revision)<1)out.push({code:'revision_invalid',message:'수정차수가 없습니다.'});
  if(!!clean(v.sourceKind)!==!!clean(v.sourceId))out.push({code:'source_pair_incomplete',message:'원본 종류와 원본 ID는 함께 있어야 합니다.'});
  return {ok:out.length===0,issues:out};
}
function inspect(kind,path,value){
  if(kind==='remove'||value===null)return {ok:false,issues:[{code:'physical_delete',message:'물리적 삭제가 감지됐습니다.'}]};
  if(kind==='update'&&value&&typeof value==='object'&&!recordLike(value)){
    const out=[];Object.entries(value).forEach(([k,v])=>{const r=inspect(v===null?'remove':'set',(path?path+'/':'')+k,v);r.issues.forEach(x=>out.push({...x,path:(path?path+'/':'')+k}));});
    return {ok:out.length===0,issues:out};
  }
  return reviewRecord(value);
}
function note(program,path,report,logger){
  report.issues.forEach(x=>{const row={program,path:x.path||path,code:x.code,message:x.message,at:Date.now()};issues.push(row);if(issues.length>500)issues.shift();
    const key=program+'|'+row.path.split('/').slice(0,3).join('/')+'|'+row.code;if(seen.has(key))return;seen.add(key);
    (logger||console.warn)('[온톨로지 서버 저장 감시] '+row.program+' · '+row.path+' · '+row.message);
  });
}
function join(a,b){return [clean(a).replace(/^\/+|\/+$/g,''),clean(b).replace(/^\/+|\/+$/g,'')].filter(Boolean).join('/');}
function wrapDatabase(db,options={}){
  if(!db||db.__puOntologyServerWrapped)return db;
  Object.defineProperty(db,'__puOntologyServerWrapped',{value:true});
  const rawRef=db.ref.bind(db),program=options.program||'functions',logger=options.logger;
  function wrapRef(ref,path){
    if(!ref||ref.__puOntologyServerWrapped)return ref;
    Object.defineProperty(ref,'__puOntologyServerWrapped',{value:true});
    if(typeof ref.child==='function'){const raw=ref.child;ref.child=function(p){return wrapRef(raw.call(this,p),join(path,p));};}
    for(const kind of ['set','update','remove','push']){
      if(typeof ref[kind]!=='function')continue;const raw=ref[kind];
      ref[kind]=function(value){
        if(kind==='push'&&arguments.length===0)return wrapRef(raw.call(this),join(path,'{push}'));
        const report=inspect(kind,path,kind==='remove'?null:value);if(!report.ok)note(program,path,report,logger);
        return raw.apply(this,arguments);
      };
    }
    if(typeof ref.transaction==='function'){
      const raw=ref.transaction;
      ref.transaction=function(updateFn){
        const wrapped=typeof updateFn==='function'?function(current){
          const next=updateFn(current),report=inspect('set',path,next);
          if(next!==undefined&&!report.ok)note(program,path,report,logger);
          return next;
        }:updateFn;
        const args=[...arguments];args[0]=wrapped;
        return raw.apply(this,args);
      };
    }
    return ref;
  }
  db.ref=function(p){return wrapRef(rawRef(p),clean(p));};
  return db;
}
function getIssues(){return issues.slice();}
module.exports={CONTRACT_VERSION,reviewRecord,inspect,wrapDatabase,getIssues};
