/* 6-3B: 문자 원본을 잃지 않고, 금액만으로 업무를 확정하지 않는다. */
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const O=require('../js/pu-ontology.js');
const erp=fs.readFileSync(path.join(__dirname,'..','pu-erp.html'),'utf8');
const ID='a'.repeat(64);
const item=(patch={})=>({id:ID,date:'2026-09-04 09:31',amount:120000,type:'income',src:'bank',cancel:false,...patch});

test('자동 수집 출처는 공통 온톨로지 용어로 등록돼 있다',()=>{
  assert.equal(O.TERMS.provenanceFields.originSystem,'수집 원본 시스템');
  assert.equal(O.TERMS.provenanceFields.originId,'수집 원본 영구 ID');
});

test('문자 배치 검증은 원본 ID·일시·금액·종류·출처·취소값을 모두 검사하며 원본을 바꾸지 않는다',()=>{
  const valid=item(),before=JSON.stringify(valid);assert.equal(O.validateHanaSourceBatch([valid]).ok,true);
  for(const patch of [{id:'bad'},{date:'2026-02-30 09:00'},{date:'2026-09-04 24:00'},{amount:0},{amount:1.2},{amount:Number.MAX_SAFE_INTEGER+1},
    {type:'other'},{src:'other'},{cancel:'true'}])assert.equal(O.validateHanaSourceBatch([item(patch)]).ok,false,JSON.stringify(patch));
  assert.equal(O.validateHanaSourceBatch([valid,valid]).ok,false);
  assert.equal(O.validateHanaSourceBatch(null).ok,false);
  assert.equal(O.validateHanaSourceBatch([null]).ok,false);
  assert.equal(JSON.stringify(valid),before);
});

function helperContext(){
  const code=erp.slice(erp.indexOf('function _bankDraftSlimRow('),erp.indexOf('var BANK_DRAFT_MAX'));
  const calls=[];const ctx={console:{},FB_DB_REST:'https://db.test',firebase:{auth:()=>({currentUser:{getIdToken:async()=> 'token'}})},
    fetchT:async(url)=>{calls.push(url);return {ok:true,json:async()=>ctx.remote};},encodeURIComponent};
  vm.createContext(ctx);new vm.Script(code).runInContext(ctx);return {ctx,calls};
}
const row=(patch={})=>({_k:'hana-'+ID,type:'income',src:'bank',date:'2026-09-04 09:31',amount:120000,memo:'입금자',cancel:false,originSystem:'hana-sms',originId:ID,...patch});
const batch=(rows,id='lb-1')=>({id,rows});

test('수신 원본과 저장 묶음은 행을 한 번씩 대응시키며 ID·내용·취소가 다르면 확인하지 않는다',()=>{
  const {ctx}=helperContext(),x=row(),before=JSON.stringify(x);
  assert.deepEqual(Array.from(ctx.erpHanaReceiptBatches([x],[batch([x])])),['lb-1']);
  assert.equal(ctx.erpHanaReceiptBatches([x],[batch([row({originSystem:'',originId:''})])]),null);
  assert.equal(ctx.erpHanaReceiptBatches([x],[batch([row({originId:'b'.repeat(64)})])]),null);
  assert.equal(ctx.erpHanaReceiptBatches([x],[batch([row({amount:1})])]),null);
  assert.equal(ctx.erpHanaReceiptBatches([x],[batch([row({cancel:true})])]),null);
  assert.equal(ctx.erpHanaReceiptBatches([x,x],[batch([x])]),null);
  assert.equal(ctx.erpHanaReceiptBatches([x],[{...batch([x]),_deleted:true}]),null);
  assert.equal(JSON.stringify(x),before);
});

test('서버 REST 사본에서 같은 원본을 확인한 뒤에만 수신 완료가 가능하다',async()=>{
  const {ctx,calls}=helperContext(),x=row(),local=[batch([x])];ctx.remote=batch([x]);
  assert.equal(await ctx.erpHanaStoredOnServer([x],local),true);assert.equal(calls.length,1);
  assert.ok(calls[0].includes('/data/ledger_batches/v/lb-1.json?auth='));
  ctx.remote=batch([row({amount:1})]);assert.equal(await ctx.erpHanaStoredOnServer([x],local),false);
  ctx.firebase.auth=()=>({currentUser:null});assert.equal(await ctx.erpHanaStoredOnServer([x],local),false);
  assert.equal(await ctx.erpHanaStoredOnServer([x],[]),false);
});

test('문자 가져오기는 검증→저장확인→ack 순이며, 금액만으로 연결 ID를 쓰지 않는다',()=>{
  const start=erp.indexOf('  async function importHanaSms(silent){'),end=erp.indexOf('  /* 거래내역 화면을 열면',start),body=erp.slice(start,end);
  assert.ok(body.indexOf('validateHanaSourceBatch(d.items)')<body.indexOf("hanaSmsCall('ack'"));
  assert.ok(body.indexOf('erpHanaStoredOnServer(incoming,keep)')<body.indexOf("hanaSmsCall('ack'"));
  assert.match(body,/originSystem:'hana-sms', originId:x\.id/);
  assert.match(body,/officeStatus:ms\.length\?'ambiguous':'missing'/);
  assert.doesNotMatch(body,/auto\[row\._k\]=ms\[0\]\.id/);
  assert.match(body,/문자는 대기함에 남아 재시도할 수 있습니다/);
});

test('파일·다른 거래 화면도 금액 단독 자동연결을 하지 않고 저장 실패를 성공으로 처리하지 않는다',()=>{
  assert.doesNotMatch(erp,/if\(ms\.length === 1\) auto\[row\._k\] = ms\[0\]\.id/);
  assert.doesNotMatch(erp,/if\(ms\.length === 1\) em\[row\.id\] = \{pendingId: ms\[0\]\.id\}/);
  assert.match(erp,/if\(!dbUpsert\(LEDGER_BATCH_KEY, _bat\)\)throw new Error/);
  assert.match(erp,/\(r\.cancel\?'\|cancel':''\).*\+ origin/);
});
