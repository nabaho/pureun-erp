/* 업체관리 — 「기업정보함에서 대표자 찾기」가 연락처까지 채운다
   (2026-08-10) 대표 지적: "기업정보함에서 대표자 찾아서 수정하면 대표전화 팩스 이메일도
   입력되어야 하는데 이 부분은 입력이 안 된다".
   명함에는 그 값들이 이미 있는데 이름 한 칸만 가져오고 나머지를 버리고 있었다.
   ★ 이미 적어 둔 값은 덮어쓰지 않는다 — 손으로 고쳐 둔 것이 말없이 바뀌면 안 된다. */
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

/* 함수를 소스에서 그대로 떼어 실제로 돌려본다.
   setF·showToast 만 대신 세운다 — 화면에 그리는 일이지 이 함수의 판단이 아니다. */
const body = src.slice(src.indexOf('  function fillCeoFromPc(p){'), src.indexOf('  // 기업정보함에서 담당자 추가 (pcId 기록'));
function run(form, card){
  let out = null, msg = '';
  const ctx = {
    setF: function(fn){ out = fn(form); },
    showToast: function(m){ msg = m; },
    console: console
  };
  vm.createContext(ctx);
  vm.runInContext(body + '\nfillCeoFromPc(' + JSON.stringify(card) + ');', ctx);
  return { f: out, msg: msg };
}

/* 기업정보함 색인 한 줄 — n 이름 · ti 직책 · m 휴대폰 · t 전화 · ct 회사전화
   fx 개인팩스 · cfx 회사팩스 · e 이메일 (pu-cards.html idxRecord 가 담는 것) */
const CARD = { n:'이석권', ti:'대표이사', m:'010-1111-2222', t:'054-111-2222',
               ct:'054-999-8888', fx:'054-111-3333', cfx:'054-999-7777', e:'ceo@taesungdt.co.kr' };

console.log('\n[① 빈 업체 — 이름과 연락처가 함께 들어온다]');
const a = run({}, CARD);
t('대표자 이름', a.f.ceo, '이석권');
t('★ 대표 전화도 들어온다 (이것이 안 되던 것)', a.f.phone, '054-999-8888');
t('★ 팩스도', a.f.fax, '054-999-7777');
t('★ 대표 이메일도', a.f.email, 'ceo@taesungdt.co.kr');
t('무엇을 함께 채웠는지 말해 준다', /대표 전화·팩스·대표 이메일 함께 채움/.test(a.msg), true);

console.log('\n[② 「대표 전화」는 회사 번호가 먼저 — 대표 개인 휴대폰이 아니다]');
/* 이 칸은 회사의 대표 전화다. 개인 휴대폰이 들어가면 그 번호가 회사 대표번호로 굳는다. */
t('회사전화(ct)를 먼저', run({}, CARD).f.phone, '054-999-8888');
t('회사전화가 없으면 전화(t)', run({}, { n:'이석권', t:'054-111-2222', m:'010-1111-2222' }).f.phone, '054-111-2222');
t('둘 다 없을 때만 휴대폰', run({}, { n:'이석권', m:'010-1111-2222' }).f.phone, '010-1111-2222');
t('팩스도 회사팩스가 먼저', run({}, { n:'x', fx:'1', cfx:'2' }).f.fax, '2');
t('회사팩스가 없으면 개인팩스', run({}, { n:'x', fx:'1' }).f.fax, '1');

console.log('\n[③ ★ 이미 적어 둔 값은 안 덮는다]');
/* 손으로 고쳐 둔 번호가 명함 것으로 말없이 바뀌면, 바뀐 줄도 모르고 저장된다 */
const b = run({ phone:'041-000-1234', fax:'041-000-5678', email:'me@pureun.kr' }, CARD);
t('전화 그대로', b.f.phone, '041-000-1234');
t('팩스 그대로', b.f.fax, '041-000-5678');
t('이메일 그대로', b.f.email, 'me@pureun.kr');
t('그때는 「함께 채움」이라 하지 않는다 (거짓말이 된다)', /함께 채움/.test(b.msg), false);
t('공백만 있는 칸은 빈 칸으로 본다', run({ phone:'   ' }, CARD).f.phone, '054-999-8888');

console.log('\n[④ 대표자 이름은 고르러 온 것이니 바꾼다]');
/* 연락처와 다르다 — 대표자를 «다시 고르려고» 누른 것이므로 앞 이름을 갈아 끼운다 */
t('앞 대표자가 있어도 바꾼다', run({ ceo:'전임대표' }, CARD).f.ceo, '이석권');
t('이름이 없는 명함이면 앞 것을 지우지 않는다', run({ ceo:'전임대표' }, { e:'a@b.c' }).f.ceo, '전임대표');

console.log('\n[⑤ 명함에 없는 칸은 «없다고» 말해 준다]');
/* 「채웠겠지」 하고 넘어갔다가 빈 채로 저장되는 것이 이번 일의 시작이었다 */
const c = run({}, { n:'이석권', ct:'054-999-8888' });
t('전화만 채워진다', [c.f.phone, c.f.fax, c.f.email], ['054-999-8888', undefined, undefined]);
t('없는 것을 알린다', /명함에 팩스·이메일 없음/.test(c.msg), true);
t('다 있으면 없다는 말은 안 한다', /없음/.test(a.msg), false);

console.log('\n[⑥ 빈 값에도 안 터진다]');
t('빈 명함', run({}, {}).f.ceo, undefined);
t('그래도 알림은 나간다', run({}, {}).msg.indexOf('대표자 채움') === 0, true);
t('다른 칸을 건드리지 않는다', run({ name:'태성디티(주)', bizNo:'513-81-80377' }, CARD).f.name, '태성디티(주)');
t('사업자번호도 그대로', run({ name:'x', bizNo:'513-81-80377' }, CARD).f.bizNo, '513-81-80377');

console.log('\n[⑦ 고르는 창은 사람 명함만 준다 — 회사 이름이 대표자로 들어가면 안 된다]');
/* 사업자등록증 줄(k:'biz')의 n 은 «회사 이름» 이다. 그것이 넘어오면 대표자 칸에 회사명이 박힌다. */
t('사업자등록증 줄은 걸러 낸다', /if\(!r \|\| r\.k==='biz'\) continue;/.test(src), true);

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===\n');
process.exit(fail ? 1 : 0);
