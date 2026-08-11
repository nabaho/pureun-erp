/* 명함첩에서 회사를 가져와도 «업태·종목만» 안 들어오던 것 (2026-08-11)
   대표 보고: "명함첩에서 이름 가지고 왔는데 업태 종목은 계속 못 읽는다."

   ★ 까닭 — 자료가 없어서가 아니라 «어디를 보는지» 때문이었다.
     푸른이알피는 명함첩의 가벼운 검색목록(pucards/idx)만 받아 쓴다.
     그 목록에 업태(bt)·종목(bi) 칸이 생긴 것은 나중이라, 그 전에 저장된
     사업자등록증은 목록에 업태가 비어 있다 — 원본에는 멀쩡히 들어 있는데도.
     명함첩의 「검색목록 다시 만들기」를 눌러야만 되는데, 그걸 알 사람이 없다.
   고침: 고를 때 원본(pucards/items/{id})에서 «글자 칸 넷» 만 콕 집어 마저 읽는다.
        사진은 절대 안 읽는다 — 사업자등록증 원본은 사진 때문에 수 MB 다. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const src = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8').replace(/\r\n/g, '\n');

let pass = 0, fail = 0;
function t(name, got, want){
  const G = JSON.stringify(got), W = JSON.stringify(want);
  if(G === W){ pass++; console.log('  PASS ' + name + '  (' + G + ')'); }
  else { fail++; console.log('  FAIL ' + name + '\n    받음 ' + G + '\n    기대 ' + W); }
}

/* ── 가짜 명함첩 서버를 세워 실제로 읽어 본다 ── */
const READS = [];
function makeCtx(items){
  const ctx = { console:console, setTimeout:setTimeout, Promise:Promise };
  ctx.window = ctx;
  ctx.showToast = function(m){ ctx._toasts.push(m); };
  ctx._toasts = [];
  ctx._erpErrLog = function(){};
  ctx.fbDb = {
    ref: function(p){
      return { once: function(){
        READS.push(p);
        const m = p.match(/^pucards\/items\/([^/]+)\/(.+)$/);
        if(!m) return Promise.resolve({ val:function(){ return null; } });
        const v = (items[m[1]] || {})[m[2]];
        return Promise.resolve({ val:function(){ return v === undefined ? null : v; } });
      } };
    }
  };
  vm.createContext(ctx);
  vm.runInContext(src.slice(src.indexOf('function pcFetchBizFields(bizId){'),
                            src.indexOf('function PucardsCompanyPickerModal(props){')), ctx);
  return ctx;
}
const ITEMS = {
  'b1': { kind:'biz', bizType:'제조업', bizItem:'석재', corpno:'110111-1234567', openDate:'2010-03-02',
          photo:'data:image/jpeg;base64,AAAA' },
  'b2': { kind:'biz', bizno:'313-81-17783' },        // 원본에도 업태가 없다
  'b3': { kind:'biz', bizType:'  도매업  ' }         // 앞뒤 빈칸
};

(async function(){

console.log('\n[① 원본에서 업태·종목을 읽어 온다]');
const c1 = makeCtx(ITEMS);
const got = await c1.pcFetchBizFields('b1');
t('업태', got.bizType, '제조업');
t('종목', got.bizCategory, '석재');
t('법인등록번호도 함께', got.corpNo, '110111-1234567');
t('개업일도 함께', got.openDate, '2010-03-02');
t('앞뒤 빈칸은 털어 낸다', (await makeCtx(ITEMS).pcFetchBizFields('b3')).bizType, '도매업');

console.log('\n[② ★ 사진은 절대 안 읽는다 — 원본 한 장이 수 MB 다]');
t('읽은 칸이 넷뿐', READS.filter(p => p.indexOf('pucards/items/b1/') === 0).length, 4);
t('★ 레코드를 통째로 읽지 않는다', READS.indexOf('pucards/items/b1') >= 0, false);
t('★ 사진 칸을 안 읽는다', READS.some(p => /photo|img|thumb/i.test(p)), false);
t('읽은 칸 목록', READS.filter(p => p.indexOf('pucards/items/b1/') === 0)
  .map(p => p.split('/').pop()).sort(), ['bizItem','bizType','corpno','openDate']);

console.log('\n[③ 없는 것은 없다고 한다 — 빈 껍데기를 돌려주지 않는다]');
t('원본에도 업태가 없으면 없음', await makeCtx(ITEMS).pcFetchBizFields('b2'), null);
t('명함첩에 아예 없는 카드', await makeCtx(ITEMS).pcFetchBizFields('없는id'), null);
/* ★ 「null 이 돌아왔다」만 보면 안 된다 — 빈 id 로 pucards/items//bizType 을 읽으러 가도
   결과는 똑같이 null 이다. 아예 «읽지 않았는지» 를 봐야 한다(변이 b5). */
const _before = READS.length;
t('id 가 없으면 결과도 없음', await makeCtx(ITEMS).pcFetchBizFields(''), null);
t('★ id 가 없으면 서버에 묻지도 않는다', READS.length - _before, 0);

console.log('\n[④ 언제 원본을 더 읽는가]');
const c4 = makeCtx(ITEMS);
let applied = null;
function apply(x, filled){ applied = x; filled.push('업태'); }
c4.pcTopUpBiz({ bizId:'b1', bizType:'', bizCategory:'' }, apply);
await new Promise(r => setTimeout(r, 30));
t('★ 검색목록에 업태가 없으면 원본을 읽는다', applied && applied.bizType, '제조업');
applied = null;
c4.pcTopUpBiz({ bizId:'b1', bizType:'제조업', bizCategory:'석재' }, apply);
await new Promise(r => setTimeout(r, 30));
t('★ 검색목록에서 이미 다 왔으면 헛읽지 않는다', applied, null);
applied = null;
/* 사업자등록증 카드가 아예 없는 회사(명함만 있는 회사)는 읽을 곳이 없다.
   ★ 이때 「원본에도 비어 있습니다」라고 하면 거짓말이다 — 원본 자체가 없다(변이 b7). */
const cNoBiz = makeCtx(ITEMS);
cNoBiz.pcTopUpBiz({ bizId:'', bizType:'', bizCategory:'' }, apply);
await new Promise(r => setTimeout(r, 30));
t('사업자등록증 카드가 없는 회사는 읽을 곳이 없다', applied, null);
t('★ 그때 엉뚱한 안내를 띄우지 않는다', cNoBiz._toasts, []);
applied = null;
c4.pcTopUpBiz({ bizId:'b1', bizType:'제조업', bizCategory:'' }, apply);
await new Promise(r => setTimeout(r, 30));
t('한쪽만 비어 있어도 읽는다', applied && applied.bizCategory, '석재');

console.log('\n[⑤ 말해 준다 — 조용히 비워 두면 「가져왔는데 왜 비지」가 된다]');
const c5 = makeCtx(ITEMS);
c5.pcTopUpBiz({ bizId:'b2', bizType:'', bizCategory:'' }, function(){});
await new Promise(r => setTimeout(r, 30));
t('★ 원본에도 없으면 그렇게 말한다', /명함첩 사업자등록증에도 비어 있습니다/.test(c5._toasts.join('|')), true);
const c6 = makeCtx(ITEMS);
c6.pcTopUpBiz({ bizId:'b1', bizType:'', bizCategory:'' }, function(x, filled){ filled.push('업태','종목'); });
await new Promise(r => setTimeout(r, 30));
t('채웠으면 무엇을 채웠는지 말한다', /업태·종목 — 명함첩 원본에서 마저 가져왔습니다/.test(c6._toasts.join('|')), true);
const c7 = makeCtx(ITEMS);
c7.pcTopUpBiz({ bizId:'b1', bizType:'', bizCategory:'' }, function(){ /* 채운 칸 없음 */ });
await new Promise(r => setTimeout(r, 30));
t('채운 게 없으면 괜히 말하지 않는다', c7._toasts.length, 0);
const c8 = makeCtx(ITEMS);
c8.pcTopUpBiz({ bizId:'b1', bizType:'', bizCategory:'' }, function(){ throw new Error('x'); });
await new Promise(r => setTimeout(r, 30));
t('채우다 넘어져도 화면이 안 죽는다', true, true);

console.log('\n[⑥ 세 화면 모두에 배선되어 있다]');
t('계약 — 첨부칸 「명함첩 정보 가져오기」', /pcTopUpBiz\(row, _fillBizFromCard\);/.test(src), true);
t('계약 — 「과거 회사 불러오기」 자동완성', /pcTopUpBiz\(pc, _fillBizFromCard\);/.test(src), true);
const CO = src.slice(src.indexOf('function fillCompanyFromPcBiz(row){'),
                     src.indexOf('function fillCompanyFromPcBiz(row){') + 3000);
t('업체관리 — 「사업자등록증 찾기」', /pcTopUpBiz\(row, function\(x, filled\)\{/.test(CO), true);

console.log('\n[⑦ 이미 적어 둔 칸은 안 덮는다 — 손으로 고친 값이 말없이 바뀌면 안 된다]');
const FILL = src.slice(src.indexOf('function _fillBizFromCard(x, filled){'),
                       src.indexOf('async function fillCompanyImagesFromPucards'));
t('업태는 빈 칸일 때만', /if\(x\.bizType     && !String\(c\.bizType\|\|''\)\.trim\(\)\)/.test(FILL), true);
t('종목도 빈 칸일 때만', /if\(x\.bizCategory && !String\(c\.bizCategory\|\|''\)\.trim\(\)\)/.test(FILL), true);
t('법인등록번호도 빈 칸일 때만', /if\(x\.corpNo      && !String\(c\.corpRegNo\|\|''\)\.trim\(\)\)/.test(FILL), true);
t('바꿀 게 없으면 화면을 다시 그리지 않는다', /if\(!Object\.keys\(nx\)\.length\) return prev;/.test(FILL), true);
t('업체관리 업태도 빈 칸일 때만', /!String\(nx\.bizType\|\|''\)\.trim\(\)/.test(CO), true);
// 업태만 보면 종목 쪽 회귀를 놓친다 — 두 칸을 따로 본다(변이 b17)
t('업체관리 종목도 빈 칸일 때만', /!String\(nx\.bizCategory\|\|''\)\.trim\(\)/.test(CO), true);

console.log('\n[⑧ 「가져올 것 없음」으로 되돌아가기 «전» 에 원본을 본다]');
/* 나머지가 다 채워지고 업태만 비면 info 가 비어 early return 이라, 여기서 안 부르면 영영 못 읽는다 */
const IMG = src.slice(src.indexOf('var _topUpPending = !!(row.bizId'),
                      src.indexOf('var _topUpPending = !!(row.bizId') + 700);
t('★ 원본 확인이 먼저다', IMG.indexOf('pcTopUpBiz(row, _fillBizFromCard);')
  < IMG.indexOf('새로 가져올 정보가 없습니다'), true);
t('원본을 보러 갔으면 「없습니다」라고 하지 않는다', /if\(!_topUpPending\) showToast\('이 회사에서 새로 가져올 정보가 없습니다/.test(IMG), true);

console.log('\n[⑨ 목록의 안내 문구도 거짓말하지 않는다]');
t('★ 「업태 없음」이라 단정하지 않는다', /sub\.push\('업태 없음'\)/.test(src), false);
t('고를 때 원본을 본다고 알린다', /sub\.push\('업태 — 고를 때 원본 확인'\)/.test(src), true);

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===\n');
process.exit(fail ? 1 : 0);

})();
