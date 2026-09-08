/* 업체 수정 — 「기업정보함에서 사업자등록증 찾기」 + 단추를 제목 줄로
   (2026-08-10) 대표 지시: "사업자등록증 찾는 것도 기업정보함에서 사업자 찾기도 넣어달라.
   중간에 두지 말고 회사정보 제목 영역에 넣고, 사업자등록증 찾기도 그 영역에 넣어달라."

   사업자번호·업태·종목은 «사업자등록증에만» 있는 것이라 대표자 명함으로는 못 채운다.
   ★ 여기서도 이미 적어 둔 칸은 안 덮는다 — 대표자 찾기와 같은 규칙. */
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

/* 함수를 소스에서 그대로 떼어 실제로 돌려본다 (화면 그리기만 대신 세움) */
const body = src.slice(src.indexOf('  function fillCompanyFromPcBiz(row){'),
                       src.indexOf('  /* 기업정보함에서 대표자 채우기'));
function run(form, row){
  let out = null, msg = '', topUp = null;
  /* pcTopUpBiz — 검색목록에 업태가 없을 때 기업정보함 «원본» 에서 마저 읽어 오는 바깥 함수.
     (2026-08-11) 서버를 부르므로 여기서는 «불렀는지» 만 본다. 셈 자체는
     biztype-from-card.test.js 가 실제로 돌려서 확인한다. */
  const ctx = { setF:function(fn){ out = fn(form); }, showToast:function(m){ msg = m; }, console:console,
                pcTopUpBiz:function(r){ topUp = r; } };
  vm.createContext(ctx);
  vm.runInContext(body + '\nfillCompanyFromPcBiz(' + JSON.stringify(row) + ');', ctx);
  return { f: out, msg: msg, topUp: topUp };
}

/* searchPucardsCompanies 가 돌려주는 줄의 생김새 */
const ROW = { name:'평택시민의료생협', bizNo:'123-45-67890', ceo:'정은석',
              bizType:'병원', bizCategory:'의료업', address:'경기 평택시 중앙로 165',
              phone:'031-653-4123', fax:'031-657-4123', ceoEmail:'cust15@naver.com',
              corpNo:'110111-1234567', hasBiz:true };

console.log('\n[① 빈 업체 — 사업자등록증의 값이 들어온다]');
const a = run({}, ROW);
t('★ 사업자번호 (대표자 명함으로는 못 채우는 것)', a.f.bizNo, '123-45-67890');
t('★ 업태', a.f.bizType, '병원');
t('★ 종목', a.f.bizCategory, '의료업');
t('대표자', a.f.ceo, '정은석');
t('주소', a.f.address, '경기 평택시 중앙로 165');
t('대표 전화', a.f.phone, '031-653-4123');
t('팩스', a.f.fax, '031-657-4123');
t('대표 이메일', a.f.email, 'cust15@naver.com');
t('무엇을 채웠는지 말해 준다', /사업자번호·대표자·업태·종목·주소·대표 전화·팩스·대표 이메일 채움/.test(a.msg), true);

console.log('\n[② ★ 이미 적어 둔 값은 안 덮는다]');
/* 손으로 고쳐 둔 값이 말없이 바뀌면 바뀐 줄도 모르고 저장된다 (대표자 찾기와 같은 규칙) */
const b = run({ ceo:'전임대표', phone:'031-000-0000', bizType:'제조업' }, ROW);
t('대표자 그대로', b.f.ceo, '전임대표');
t('전화 그대로', b.f.phone, '031-000-0000');
t('업태 그대로', b.f.bizType, '제조업');
t('빈 칸만 채운다', b.f.bizNo, '123-45-67890');
t('덮은 칸은 「채움」에 안 넣는다 (거짓말이 된다)', /대표자/.test(b.msg.split('채움')[0]), false);
t('공백만 있는 칸은 빈 칸으로 본다', run({ phone:'  ' }, ROW).f.phone, '031-653-4123');

console.log('\n[③ 사업자등록증이 없는 회사 — 그렇다고 말해 준다]');
/* 명함만 있는 회사면 사업자번호·업태·종목이 안 온다.
   말해 주지 않으면 「가져왔는데 왜 비어 있지」 가 된다. */
const c = run({}, { name:'아우어베이커리', ceo:'최건', phone:'031-1', hasBiz:false });
t('사업자등록증이 없다고 적는다', /사업자등록증 없음 — 명함에서만/.test(c.msg), true);
t('없는 칸을 알린다', /기업정보함에 사업자번호·업태·종목·주소·팩스·대표 이메일 없음/.test(c.msg), true);
t('있는 것은 채운다', [c.f.ceo, c.f.phone], ['최건', '031-1']);
t('사업자등록증이 있으면 그 말은 안 한다', /사업자등록증 없음/.test(a.msg), false);

console.log('\n[④ 채울 것이 하나도 없을 때도 말해 준다]');
const d = run({ bizNo:'1', ceo:'2', bizType:'3', bizCategory:'4', address:'5',
                phone:'6', fax:'7', email:'8' }, ROW);
t('새로 채운 칸이 없다고 한다', /새로 채운 칸 없음/.test(d.msg), true);
t('아무 칸도 안 바뀐다', [d.f.bizNo, d.f.ceo, d.f.phone], ['1', '2', '6']);

console.log('\n[⑤ 이 창에 «없는 칸» 은 건드리지 않는다]');
/* 칸도 없는데 「채웠다」고 말하면 거짓말이 된다 (법인등록번호는 계약관리에만 있다) */
t('법인등록번호를 넣지 않는다', a.f.corpRegNo, undefined);
t('그래서 「법인등록번호 채움」이라 하지 않는다', /법인등록번호/.test(a.msg), false);

console.log('\n[⑥ 빈 값에도 안 터진다]');
t('빈 줄', run({}, {}).f.bizNo, undefined);
t('그래도 알림은 나간다', run({}, {}).msg.indexOf('📇') === 0, true);
/* 빈 값을 「채웠다」고 세면, 빈 칸을 빈 값으로 덮어쓰고도 채웠다고 말한다 */
 t('★ 빈 값은 채운 것으로 치지 않는다', /새로 채운 칸 없음/.test(run({}, {}).msg), true);
t('다른 칸을 건드리지 않는다', run({ note:'메모', typeCode:'자문' }, ROW).f.note, '메모');

console.log('\n[⑦ 화면 — 단추 둘이 제목 줄에 있다]');
/* ⚠ '🏢 회사정보' 는 계약 편집기에도 있다 — 업체 «수정» 창 안에서만 잘라야 한다.
   첫 번째를 집으면 엉뚱한 화면을 검사하게 된다(실제로 그랬다). */
const MODAL = src.slice(src.indexOf("'🏢 업체 수정 - '"), src.indexOf("// ============ 업체 상세"));
/* ⚠ 음수로 자르면 문자열 «끝» 에서 세어 엉뚱한 데를 본다 — 0 으로 막는다 */
const _fi = MODAL.indexOf("'🏢 회사정보'");
const FORM = MODAL.slice(Math.max(0, _fi - 900), _fi + 1500);
t('업체 수정 창을 잘라냈다', MODAL.length > 3000, true);
t('제목과 단추가 한 줄에 있다', /display:'flex', alignItems:'center'[\s\S]{0,240}?'🏢 회사정보'/.test(FORM), true);
t('사업자등록증 찾기 단추', /'📇 사업자등록증 찾기'/.test(FORM), true);
t('대표자 찾기 단추', /'📇 대표자 찾기'/.test(FORM), true);
t('★ 옛 자리(대표자 칸 아래)의 단추는 걷어냈다',
  /marginTop:'5px'[\s\S]{0,200}?'📇 기업정보함에서 대표자 찾기'/.test(src), false);
/* 조건 없이 «늘» 그려져야 한다 — false 로 막아 놔도 글자만 보면 통과한다.
   앞에 붙는 것이 「}, 」(앞 칸의 끝)이지 「false && 」 같은 조건이면 안 된다. */
t('사업자등록증 단추가 조건 없이 그려진다',
  /\}\), h\('button', \{ type:'button', onClick:function\(\)\{ setPcCoPick\(true\); \},/.test(FORM.replace(/\s+/g, ' ')), true);
t('대표자 단추가 창을 연다', /onClick:function\(\)\{ setPcPickMode\('ceo'\); \}/.test(src), true);

console.log('\n[⑧ 창은 계약관리가 쓰던 것을 그대로 쓴다]');
/* 같은 일에 창이 둘이면 한쪽만 고치는 사고가 난다 */
t('같은 창을 붙인다', /pcCoPick && h\(PucardsCompanyPickerModal, \{/.test(src), true);
t('그 업체 이름으로 먼저 찾아 준다',
  /pcCoPick && h\(PucardsCompanyPickerModal, \{\s*\n\s*initialQuery: f\.name \|\| '',/.test(src), true);
t('고르면 회사정보를 채운다', /onSelect:function\(row\)\{ setPcCoPick\(false\); fillCompanyFromPcBiz\(row\); \}/.test(src), true);
t('창이 하나뿐이다 (복사본을 새로 만들지 않았다)',
  (src.match(/function PucardsCompanyPickerModal\(props\)\{/g) || []).length, 1);

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===\n');
process.exit(fail ? 1 : 0);
