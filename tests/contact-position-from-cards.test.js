/* 명함첩에서 담당자를 가져와도 «직급» 이 빈칸으로 보이던 것 (2026-08-03 고침, 2026-08-15 반영)

   ★ 담당자의 직책이 두 칸에 나뉘어 있다 — role 과 position.
     화면마다 읽는 칸이 다르다: 계약창은 role, 업체관리·컨설팅은 position.
     명함첩에서 가져오는 자리가 role 한 칸에만 써 넣어, 업체관리에서는 직급이
     내내 빈칸이거나 옛 값 그대로였다.
   고침: ① 변환은 «정식 변환기(pcToContact)» 하나만 쓴다 — 자리마다 따로 만들면 또 갈린다.
        ② 최신정보로 갱신할 때 직급을 두 칸에 함께 쓴다. */
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
function fnOf(name){
  const marker = 'function ' + name + '(';
  const start = src.indexOf(marker);
  if(start < 0) throw new Error('함수 못찾음: ' + name);
  let d = 0;
  for(let i = src.indexOf('{', start); i < src.length; i++){
    if(src[i] === '{') d++;
    else if(src[i] === '}'){ d--; if(d === 0) return src.slice(start, i + 1); }
  }
  throw new Error('끝을 못찾음: ' + name);
}

console.log('\n[① 정식 변환기가 직급을 두 칸에 넣는다]');
const ctx = { console:console };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fnOf('pcToContact'), ctx);
const CARD = { n:'김보람', ti:'과장', d:'인사팀', m:'010-1111-2222', t:'031-000-0000', ct:'031-999-9999', e:'a@b.kr', ad:'천안시' };
const c = ctx.pcToContact(CARD, true, 'card-1');
t('이름', c.name, '김보람');
t('★ 직급이 role 에 들어간다 (계약창이 읽는 칸)', c.role, '과장');
t('★ 직급이 position 에도 들어간다 (업체관리·컨설팅이 읽는 칸)', c.position, '과장');
t('휴대폰', c.phone, '010-1111-2222');
t('회사전화', c.bizPhone, '031-000-0000');
t('이메일', c.email, 'a@b.kr');
t('어디서 왔는지 남긴다', [c.pcId, c.pcFrom], ['card-1', '명함첩']);
t('대표담당 표시', c.isPrimary, true);

console.log('\n[② 「과거 회사 불러오기」도 그 변환기를 쓴다]');
/* ★ 여기서 변환기를 따로 만들던 것이 이번 문제의 뿌리다.
   같은 일을 두 군데서 만들면 한쪽만 고쳐지고 다른 쪽은 조용히 옛날 그대로 남는다. */
t('★ 자리마다 따로 만들지 않는다',
  /function toContact\(x, primary, srcId\)\{ return pcToContact\(x, primary, srcId\); \}/.test(src), true);
t('★ 직접 만들던 옛 코드가 사라졌다',
  /return \{ id:'pc'\+Math\.random\(\)\.toString\(36\)\.slice\(2,9\), name:x\.n\|\|'', role:x\.ti\|\|'',/.test(src), false);

console.log('\n[③ 「명함첩 최신정보로 갱신」도 두 칸을 함께 고친다]');
const REFRESH = fnOf('refreshContactFromPucards');
t('★ position 을 다시 쓴다 (전에는 안 써서 옛 직급이 남았다)', /ct\.position = r\.ti\|\|'';/.test(REFRESH), true);
t('★ role 도 함께 쓴다 (계약창 쪽)', /ct\.role = r\.ti\|\|'';/.test(REFRESH), true);
t('한 줄에 몰아 쓰지 않고 둘 다 있다',
  /ct\.name = r\.ti/.test(REFRESH), false);
t('이름·연락처는 그대로 갱신한다',
  /ct\.phone = \(r\.m\|\|''\); ct\.bizPhone = \(r\.t\|\|r\.ct\|\|''\); ct\.email = \(r\.e\|\|''\);/.test(REFRESH), true);
/* 명함첩에서 온 담당자가 아니면 갱신할 근거가 없다 — 엉뚱한 사람 정보로 덮으면 안 된다 */
t('명함첩에서 온 담당자만 갱신한다', /if\(!ct\.pcId\)\{ showToast\('명함첩에서 가져온 담당자가 아닙니다'\); return; \}/.test(REFRESH), true);
t('명함첩에서 사라졌으면 기존 정보를 지키고 알린다',
  /기존 정보를 유지합니다/.test(REFRESH), true);

console.log('\n[④ 직책이 없는 명함은 빈칸으로 둔다 — 없는 직급을 지어내지 않는다]');
const noTitle = ctx.pcToContact({ n:'이름만', m:'010-0000-0000' }, false, '');
t('직급 없음(role)', noTitle.role, '');
t('직급 없음(position)', noTitle.position, '');
t('이름은 들어간다', noTitle.name, '이름만');

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===\n');
process.exit(fail ? 1 : 0);
