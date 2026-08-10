/* 「업체가 전혀 일치하지 않는다」 + 「잘못 붙은 것을 고친다」
   (2026-08-10) 대표 제보 두 가지:
     ① 165,000원 · 적요 「최건(아우어베이커리」 에 후보 7곳이 떴는데 근거가 죄다 「입금이력」이었다.
        「이 회사는 매달 165,000원을 낸다」는 뜻일 뿐이라 165,000원 업체가 열둘이면 열둘이 다 뜬다.
        정작 적요의 아우어베이커리는 후보에 없는데 「골라야 합니다」라고 부추기고 있었다.
     ② 자동으로 붙은 것이 잘못됐을 때 고칠 길이 없었다 (지금 「수정」은 담당·성과만 바꾼다). */
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8').replace(/\r\n/g, '\n');

let pass = 0, fail = 0;
function t(name, got, want){
  const G = JSON.stringify(got), W = JSON.stringify(want);
  if(G === W){ pass++; console.log('  PASS ' + name + '  (' + G + ')'); }
  else { fail++; console.log('  FAIL ' + name + '\n    받음 ' + G + '\n    기대 ' + W); }
}

const vm = require('vm');
const ctx = { console:console };
ctx.window = ctx;
vm.createContext(ctx);
const grab = (from, to) => src.slice(src.indexOf(from), src.indexOf(to));
vm.runInContext(grab('function erpNormName(', 'function erpIsClinicItem('), ctx);
vm.runInContext(grab('function erpNameEvidence(s){', 'if(typeof window !== \'undefined\'){\n  window.erpNameEvidence'), ctx);

console.log('\n[① 금액지문은 업체를 좁히는 근거가 못 된다]');
const ev = (nm, fp, iv) => ctx.erpNameEvidence({ nameScore:nm, fpScore:fp, invScore:iv });
t('★ 금액만 같으면 후보가 아니다', ev(0, 95, 0).ok, false);
t('금액지문이라고 따로 표시한다 (몇 곳을 뺐는지 세려면 구분이 필요하다)', ev(0, 95, 0).fp, true);
t('이름이 맞으면 통과', ev(75, 0, 0).ok, true);
t('세금계산서가 맞으면 통과', ev(0, 0, 100).ok, true);
t('이름이 있으면 금액지문은 안 본다', ev(75, 95, 0).why, '이름');
t('세금계산서가 이름보다 앞선다', ev(75, 0, 100).why, '세금계산서');
t('아무 근거도 없으면 금액지문이라고 하지 않는다', !!ev(20, 0, 0).fp, false);

console.log('\n[② 적요에서 이름일 만한 조각 뽑기]');
/* 통장에는 「최건(아우어베이커리」 처럼 예금주와 상호가 함께 찍힌다.
   통째로만 견주면 둘 다 못 찾으므로 괄호 안팎을 따로 본다. */
t('★ 괄호 «안» 의 상호를 먼저 본다 (상호가 업체명일 때가 많다)',
  ctx.erpMemoNames('최건(아우어베이커리')[0], '아우어베이커리');
t('괄호 «앞» 의 예금주도 본다', ctx.erpMemoNames('최건(아우어베이커리').indexOf('최건') >= 0, true);
t('닫는 괄호가 없어도 읽는다 (통장이 적요를 자른다)',
  ctx.erpMemoNames('최건(아우어베이커리').length >= 2, true);
t('닫는 괄호가 있어도 읽는다', ctx.erpMemoNames('황규주(팔천식품)')[0], '팔천식품');
t('괄호가 없으면 통째로', ctx.erpMemoNames('노리시스템(주)').length >= 1, true);
t('한 글자는 뽑지 않는다 (아무 데나 걸린다)', ctx.erpMemoNames('김'), []);
t('빈 적요는 빈 목록', ctx.erpMemoNames(''), []);
t('없는 값도 안 터진다', ctx.erpMemoNames(null), []);

console.log('\n[③ 적요의 이름으로 업체를 찾는다]');
/* ★ 「업체는 있는데 받을 항목이 없다」와 「업체 자체가 없다」는 해야 할 일이 «다르다» —
   앞은 사무관리에 건을 만들면 되고, 뒤는 업체부터 만들어야 한다.
   그냥 「후보 없음」이라고만 하면 둘 중 무엇인지 알 수 없어 아무것도 못 한다. */
const cos = [
  { id:'c1', name:'아우어베이커리' },
  { id:'c2', name:'(주)케이아이알' },
  { id:'c3', name:'중원대학교' }
];
const pends = [{ id:'p1', companyName:'(주)케이아이알', label:'자문료' }];

const r1 = ctx.erpFindCompanyByMemo('최건(아우어베이커리', cos, pends);
t('업체를 찾았다', r1.found, true);
t('어느 업체인지 알려준다', r1.company.name, '아우어베이커리');
t('★ 받을 항목이 없다는 것까지 알려준다 (사무관리에 건을 만들면 된다)', r1.pending.length, 0);
t('어느 이름으로 찾았는지도 남긴다', r1.matched, '아우어베이커리');

const r2 = ctx.erpFindCompanyByMemo('케이아이알', cos, pends);
t('받을 항목이 있으면 그것도 알려준다 (매칭이 못 찾은 것 — 찾기에서 고르면 된다)', r2.pending.length, 1);

const r3 = ctx.erpFindCompanyByMemo('없는회사이름', cos, pends);
t('★ 업체 자체가 없으면 없다고 한다 (업체부터 만들어야 한다)', r3.found, false);
t('무엇으로 찾아봤는지 남긴다 (왜 못 찾았는지 사람이 짚어 볼 수 있다)', r3.tried.length > 0, true);
t('적요가 비면 아무 말도 안 한다', ctx.erpFindCompanyByMemo('', cos, pends), null);
t('업체 목록이 없어도 안 터진다', ctx.erpFindCompanyByMemo('아우어', null, null).found, false);
t('이름이 없는 업체는 건너뛴다',
  ctx.erpFindCompanyByMemo('아우어베이커리', [{ id:'x' }, cos[0]], []).company.name, '아우어베이커리');

console.log('\n[④ 표에서는 이름이 꼭 같은 것만 — 505줄 × 900업체를 매번 훑을 수 없다]');
const idx = ctx.erpCoIndexByName(cos);
t('이름으로 바로 찾는다', ctx.erpQuickCoByMemo(idx, '최건(아우어베이커리').name, '아우어베이커리');
/* 「(주)」 같은 꾸밈말은 erpNormName 이 걷어내므로 «케이아이알» 로도 바로 찾힌다 */
t('꾸밈말이 달라도 찾는다', ctx.erpQuickCoByMemo(idx, '케이아이알').name, '(주)케이아이알');
t('이름이 다르면 표에서는 못 찾는다 (샅샅이 뒤지는 것은 찾기 창의 몫)',
  ctx.erpQuickCoByMemo(idx, '아우어'), null);
t('빈 적요도 안 터진다', ctx.erpQuickCoByMemo(idx, ''), null);
t('색인이 없어도 안 터진다', ctx.erpQuickCoByMemo(null, '아우어베이커리'), null);

console.log('\n[⑤ 조용히 빼지 않는다]');
t('금액만 같아서 뺀 곳의 수를 센다', /if\(r\.score > 0 && !ev\.ok && ev\.fp\) fpHidden\+\+;/.test(src), true);
t('목록에 달아 돌려준다 (부르는 쪽이 두 번 세지 않게)', /res\.fpHidden = fpHidden;/.test(src), true);
t('찾기 창에서 몇 곳을 뺐는지 말해 준다',
  /'· 금액만 같은 '\+_hid\+'곳은 후보에서 뺐습니다/.test(src), true);
/* 세어 둔 값을 «실제로 읽어야» 한다 — 글자만 있고 0 을 넣으면 띠가 아예 안 뜬다 */
t('센 값을 그대로 읽는다', /var _hid = parseInt\(_sg\.fpHidden, 10\) \|\| 0;/.test(src), true);
t('그중 하나가 맞을 때의 길도 알려준다', /그중 하나가 맞으면 위에서 이름으로 찾아 고르세요/.test(src), true);

console.log('\n[⑥ 표에서 «왜 후보가 없는지» 를 말한다]');
const WHY = grab('function whyNone(row){', '  function recipeFor(row){');
t('whyNone 구역을 잘라냈다', WHY.length > 100 && WHY.length < 700, true);
t('업체를 못 찾으면 noco', /if\(!co\) return \{ kind:'noco' \};/.test(WHY), true);
t('받을 항목 수로 갈린다', /kind:\(n > 0 \? 'hasitem' : 'noitem'\)/.test(WHY), true);
t('후보도 기억도 없을 때만 본다', /var _why=\(_st\.state==='none' && !isCms && !_rec\) \? whyNone\(row\) : null;/.test(src), true);
t('「등록된 업체지만 받을 항목이 없습니다」', /'등록된 업체지만 받을 항목이 없습니다'/.test(src), true);
t('「등록된 업체가 아닙니다」', /'등록된 업체가 아닙니다'/.test(src), true);
t('받을 항목이 있으면 몇 건인지 적는다', /'받을 항목 '\+_why\.n\+'건 있음 — 금액이 안 맞습니다'/.test(src), true);
t('찾은 업체를 회색으로 둔다 (후보가 아니라 참고다)',
  /\(_why && _why\.co\) \? h\('span',\{style:\{color:'#64748b',fontWeight:400\}/.test(src), true);

console.log('\n[⑦ 업체 바꾸기 — 되돌리기와 다르다]');
/* 되돌리면 그 통장 줄로 돌아가 처음부터 다시 골라야 한다.
   이것은 앞 업체를 물리고 새 업체로 «한 번에» 다시 붙인다. */
const MOVE = grab('movePop && (function(){', '// ── 4-3 비교 수정 팝업');
t('업체 바꾸기 구역을 잘라냈다', MOVE.length > 2000, true);
t('★ 앞 확정을 먼저 무른다', /if\(!erpUndoIncome\(fi\)\)\{ showToast\('❌ 앞 확정을 되돌리지 못했습니다'\); return; \}/.test(MOVE), true);
t('되돌리기가 실패하면 옮기지 않는다 (둘 다 살아 있으면 돈이 두 번 잡힌다)',
  /erpUndoIncome\(fi\)\)\{[\s\S]{0,80}?return; \}[\s\S]{0,400}?saveIncome/.test(MOVE), true);
t('★ 성과급을 새 업체 담당자로 다시 나눈다 (대표 선택)', /saveIncome\([\s\S]{0,90}?withPerf:true/.test(MOVE), true);
t('금액·날짜는 그대로 간다', /\{ date:fi\.date, amount:_amt, memo:_memo2, _k:'' \}/.test(MOVE), true);
t('★ 적요 머리말을 떼어 낸다 (안 떼면 옮길 때마다 「[하나은행]」이 겹쳐 붙는다)',
  /replace\(\/\^\\\[하나\(은행\|카드\)\\\]\\s\*\/, ''\)/.test(MOVE), true);
t('저장이 터지면 알린다 (조용히 삼키면 앞 건만 물리고 끝난다)',
  /showToast\('❌ 옮기지 못했습니다: ' \+ \(e && e\.message\)\)/.test(MOVE), true);
t('어디서 옮겨 왔는지 남긴다', /movedFrom:fi\.id, movedFromName:\(fi\.companyName\|\|''\)/.test(MOVE), true);
t('누가 언제 옮겼는지도 남긴다', /movedAt:new Date\(\)\.toISOString\(\)/.test(MOVE) && /movedBy:/.test(MOVE), true);
t('묻고 나서 옮긴다 (돈이 누구에게 가는지 바뀐다)', /if\(!\(await popConfirm\(_msg\)\)\) return;/.test(MOVE), true);
t('확인 글에 지금 업체와 옮길 곳을 함께 적는다',
  /'· 지금: ' \+ \(fi\.companyName\|\|'-'\)/.test(MOVE) && /'· 옮길 곳: ' \+ p\.companyName/.test(MOVE), true);
t('새 담당자가 누구인지도 적는다', /\(담당 ' \+ _newStaff/.test(MOVE), true);
t('지금 붙어 있는 그 건은 목록에서 뺀다 (제자리로 옮길 일은 없다)',
  /if\(p\.item && p\.item\.id === fi\.sourceId\) return false;/.test(MOVE), true);
t('금액이 가까운 순으로 세운다 (옮길 곳은 대개 같은 금액이다)',
  /Math\.abs\(\(a\.expect\|\|a\.amount\)-_amt\) - Math\.abs\(\(b\.expect\|\|b\.amount\)-_amt\)/.test(MOVE), true);
t('금액 차이를 함께 보여준다', /d===0\?'금액 일치':\(d>0\?'\+':''\)\+d\.toLocaleString\(\)/.test(MOVE), true);

console.log('\n[⑧ 확정 이력 — 잘못될 여지가 어디인지 보인다]');
/* 조건 없이 «늘» 그린다 — false 로 막아 놓아도 글자만 보고 통과하면 검사가 아무것도 못 지킨다 */
t('업체 바꾸기 단추가 조건 없이 늘 있다',
  /\}\},\r?\n?\s*h\('button',\{onClick:function\(\)\{ setMovePop\(\{fi:fi, q:'' \}\); \},/.test(src)
  || /\n\s{28}h\('button',\{onClick:function\(\)\{ setMovePop\(\{fi:fi, q:'' \}\); \},/.test(src), true);
/* 되돌린 건에는 단추가 아예 안 그려진다 — 이미 물린 것을 또 옮길 수는 없다.
   되돌림 표시와 단추 묶음이 «같은 삼항의 양쪽» 이라야 그렇게 된다. */
t('되돌린 건에는 안 보인다 (이미 물린 것을 또 옮길 수는 없다)',
  /'되돌림 '\+fi\.undoneDate\.slice\(0,10\)\)[\s\S]{0,600}?setMovePop/.test(src), true);
t('되돌리기와 다르다는 것을 적어 둔다', /앞 업체의 입금표시·성과급은 되돌립니다/.test(src), true);
t('옛 「수정」은 이름을 「담당·성과」로 바꿨다 (무엇을 고치는지 헷갈렸다)',
  /whiteSpace:'nowrap'\}\},'담당·성과'\)/.test(src), true);
t('자동으로 붙은 건에 표시가 붙는다', /fi\.autoConfirmed && h\('span',\{title:'사람이 고르지 않고 자동으로 붙은 건입니다'/.test(src), true);
t('옮긴 건에도 표시가 붙는다', /fi\.movedFrom && h\('span',\{title:'업체를 바꾼 건입니다/.test(src), true);
t('자동 확정만 모아 볼 수 있다', /if\(autoOnly\) allInc = allInc\.filter\(function\(fi\)\{ return fi && fi\.autoConfirmed; \}\);/.test(src), true);
t('거른 상태를 단추가 알려준다', /autoOnly\?'↩ 전체 보기':'⚡ 자동 확정만 보기'/.test(src), true);

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===\n');
process.exit(fail ? 1 : 0);
