/* 포털 로그인 신원 — 누구로 들어왔는지 «보이게» 한다
   (2026-08-10) 박재원 계정으로 접수된 제보: "박은비로 로그인했지만 박재원으로 뜸 (핸드폰)".
   사번이 P005(박재원)·A005(박은비)처럼 «숫자가 같고 앞글자만 다르다».
   아이디를 잘못 넣어도, 같은 사번이 두 사람에게 붙어 있어도, 남의 세션이 남은 폰이어도 —
   화면에는 이름 하나만 떠서 본인이 알아챌 길이 없었다.
   고침: ① 이름 옆에 사번 표시 ② 사번 겹침을 크게 경고 ③ 자동 로그인임을 알림
        ④ 명부에 없으면 없다고 말함. 판단은 사람이 하고, 화면은 사실을 보여준다. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const src = fs.readFileSync(path.join(__dirname, '..', 'enter.html'), 'utf8').replace(/\r\n/g, '\n');

let pass = 0, fail = 0;
function t(name, got, want){
  const G = JSON.stringify(got), W = JSON.stringify(want);
  if(G === W){ pass++; console.log('  PASS ' + name + '  (' + G + ')'); }
  else { fail++; console.log('  FAIL ' + name + '\n    받음 ' + G + '\n    기대 ' + W); }
}

const ctx = { console:console };
ctx.window = ctx;
vm.createContext(ctx);
const grab = (from, to) => src.slice(src.indexOf(from), src.indexOf(to));
vm.runInContext(grab('function sidToEmail(sid)', 'function isMobile()'), ctx);

console.log('\n[① 사번 ↔ 이메일 — 표시용 되돌리기]');
t('사번 → 이메일', ctx.sidToEmail('P005'), 'p005@pureun.kr');
t('줄표가 있어도 같은 이메일 (P-005 와 P005 는 같은 계정이다)', ctx.sidToEmail('P-005'), 'p005@pureun.kr');
t('이메일 → 표시용 사번', ctx.puEmailToSid('p005@pureun.kr'), 'P005');
t('a005 는 A005 로', ctx.puEmailToSid('a005@pureun.kr'), 'A005');
t('이메일이 아니면 빈 값', ctx.puEmailToSid('관리자'), '');
t('빈 값도 안 터진다', ctx.puEmailToSid(null), '');

console.log('\n[② 명부에서 찾기 — 겹침을 조용히 묻지 않는다]');
const roster = [
  { sid:'P005', name:'박재원', title:'노무사', role:'member', status:'active' },
  { sid:'A005', name:'박은비', title:'주임',   role:'member', status:'active' },
  { sid:'A003', name:'김보람', title:'과장',   role:'member', status:'active' }
];
t('박재원 이메일은 박재원', ctx.puDirMatch(roster, 'p005@pureun.kr').acct.name, '박재원');
t('★ 박은비 이메일은 박은비 (숫자가 같아도 앞글자가 다르면 다른 사람)',
  ctx.puDirMatch(roster, 'a005@pureun.kr').acct.name, '박은비');
t('정상이면 잡힌 사람은 한 명', ctx.puDirMatch(roster, 'a005@pureun.kr').all.length, 1);
t('명부에 없으면 없다고 한다', ctx.puDirMatch(roster, 'x999@pureun.kr').acct, null);
t('빈 명부도 안 터진다', ctx.puDirMatch(null, 'a005@pureun.kr').acct, null);

/* 같은 사번이 두 사람에게 — 관리자 실수(줄 복사 뒤 사번 안 바꿈)로 실제로 생길 수 있다 */
const dupRoster = [
  { sid:'P005', name:'박재원', status:'active' },
  { sid:'p-005', name:'박은비', status:'active' }   // 줄표·대소문자만 달라도 같은 계정이다
];
const dup = ctx.puDirMatch(dupRoster, 'p005@pureun.kr');
t('★ 겹침을 겹쳤다고 돌려준다 (find 하나면 조용히 첫 사람이 뜬다)', dup.all.length, 2);
t('겹친 두 사람의 이름이 다 있다', dup.all.map(function(x){ return x.name; }), ['박재원', '박은비']);

/* 퇴사자와 겹치면 재직자를 고른다 — 사번 재사용(퇴사자 사번을 새 직원에게) 대비 */
const reused = [
  { sid:'A003', name:'김보람', status:'left' },
  { sid:'A003', name:'박은비', status:'active' }
];
t('★ 퇴사자와 겹치면 재직자가 뜬다', ctx.puDirMatch(reused, 'a003@pureun.kr').acct.name, '박은비');
t('그래도 겹침은 알린다 (명부를 정리해야 한다)', ctx.puDirMatch(reused, 'a003@pureun.kr').all.length, 2);
t('전원 퇴사면 그중 첫 사람이라도 (이름이 아예 안 뜨는 것보다 낫다)',
  ctx.puDirMatch([{ sid:'A003', name:'김보람', status:'left' }], 'a003@pureun.kr').acct.name, '김보람');

console.log('\n[③ 화면 — 이름 옆에 사번이 뜬다]');
t('★ 머리에 사번을 함께 적는다',
  /\$\('userName'\)\.textContent = name \+ \(title \? ' · ' \+ title : ''\) \+ ' \(' \+ role \+ '\)'\s*\n\s*\+ \(mySid \? ' · ' \+ mySid\.toUpperCase\(\) : ''\);/.test(src), true);
t('마우스를 올리면 로그인 이메일이 보인다', /\.title = '로그인 계정: ' \+ email;/.test(src), true);
t('명부에 없어도 이메일에서 사번을 만들어 보여준다', /var mySid = acct \? String\(acct\.sid \|\| ''\) : puEmailToSid\(email\);/.test(src), true);

console.log('\n[④ 신원 안내 띠 — 이상할 때는 크게 말한다]');
t('겹침이면 빨간 띠', /dupAll\.length > 1\)\{/.test(src) && /여러 명에게 등록되어 있습니다/.test(src), true);
t('겹친 사람 이름을 모두 적는다', /dupAll\.map\(function\(x\)\{ return \(x\.name \|\| '\?'\)/.test(src), true);
/* 글자만 보면 조건을 false 로 막아도 통과한다 — «갈림길 자체» 를 못 박는다 */
t('명부에 없으면 노란 띠 (조건까지)', /\} else if\(!acct\)\{/.test(src), true);
t('명부에 없으면 노란 띠', /직원명부에서 <b>' \+ email \+ '<\/b> 을 찾지 못했습니다/.test(src), true);
t('★ 자동 로그인이면 「자동」이라고 말한다 (남의 세션이 남은 폰에서 걸린다)',
  /\} else if\(info\.via === 'auto'\)\{/.test(src) && /님으로 자동 로그인되었습니다/.test(src), true);
t('자동 띠에는 벗어나는 길을 적는다', /본인이 아니면 <b>로그아웃<\/b> 후 본인 아이디로 로그인하세요/.test(src), true);
t('자동 띠는 닫을 수 있다', /puIdBandX/.test(src), true);
t('방금 친 로그인 + 정상이면 띠가 없다', /puIdentityBand\(''\);   \/\/ 방금 친 로그인 \+ 명부 정상/.test(src), true);
t('띠는 하나만 그린다 (다시 그리면 갈아 끼움)', /var el = document\.getElementById\('puIdBand'\);\s*\n\s*if\(!el\)\{/.test(src), true);

console.log('\n[⑤ 「방금 로그인」과 「자동 진입」을 가른다]');
t('로그인 단추를 누르면 표시등을 켠다', /_freshLogin = true;\s*\/\/ 이번 진입은/.test(src), true);
t('진입할 때 읽고 바로 끈다 (다음 자동 복귀와 섞이지 않게)',
  /var _via = _freshLogin \? 'login' : 'auto';\s*\n\s*_freshLogin = false;/.test(src), true);
t('renderPortal 에 어느 길인지 넘긴다', /renderPortal\(m\.acct, \{ email:\(user\.email\|\|''\), all:m\.all, via:_via \}\)/.test(src), true);

console.log('\n[⑥ 명부 찾기가 겹침 정보를 끝까지 들고 간다]');
t('서버 명부도 puDirMatch 로 본다', /function _match\(list\)\{ return puDirMatch\(list, user\.email \|\| ''\); \}/.test(src), true);
t('로컬 폴백도 같은 꼴로 돌려준다', /catch\(e\)\{ return \{ acct:null, all:\[\] \}; \}/.test(src), true);
t('건의함에도 같은 사람이 전달된다 (팝업과 머리가 다른 이름을 말하면 안 된다)',
  /if\(window\.sgSetUser\) window\.sgSetUser\(acct\);/.test(src), true);

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===\n');
process.exit(fail ? 1 : 0);
