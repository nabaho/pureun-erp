'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const W=require('./ontology-write-server');

function fake(){
  const calls=[];
  function ref(path){return {child(p){return ref((path?path+'/':'')+p);},set(v){calls.push(['set',path,v]);return Promise.resolve();},
    update(v){calls.push(['update',path,v]);return Promise.resolve();},remove(){calls.push(['remove',path]);return Promise.resolve();},
    push(v){const r=ref((path?path+'/':'')+'new');if(arguments.length)r.set(v);return r;},
    transaction(fn){const next=fn({id:'x'});calls.push(['transaction',path,next]);return Promise.resolve({committed:next!==undefined});}};}
  return {db:{ref},calls};
}
test('관리자 SDK 쓰기도 값 본문 없이 위반 위치를 관찰한다',async()=>{
  const f=fake(),logs=[];W.wrapDatabase(f.db,{program:'test',logger:x=>logs.push(x)});
  await f.db.ref('mailbox').child('x').set({id:'x'});
  await f.db.ref().update({'mailbox/y':null});
  await f.db.ref('mailbox/z').transaction(()=>({id:'z'}));
  assert.equal(f.calls.length,3);assert.ok(logs.some(x=>x.includes('mailbox/x')));assert.ok(logs.some(x=>x.includes('mailbox/y')));
  assert.ok(logs.some(x=>x.includes('mailbox/z')));
  assert.ok(logs.every(x=>!x.includes(JSON.stringify({id:'x'}))));
});
test('새 서버 레코드가 사용할 명시적 검사는 저장 계약 판까지 본다',()=>{
  assert.equal(W.reviewRecord({id:'x',entityType:'Task',schemaVersion:3,contractVersion:W.CONTRACT_VERSION,revision:1}).ok,true);
  assert.equal(W.reviewRecord({id:'x',entityType:'Task'}).ok,false);
});
