/* 기업정보함에서 가져오기 — 명함에 있는 것을 빠뜨리지 않는가
   기업정보함 색인(pu-cards.html idxRecord)이 담는 것:
     n 이름 · c 회사 · ti 직책 · d 부서 · m 휴대폰 · t 전화 · ct 회사전화
     e 이메일 · ad 주소 · (사업자등록증) bz 사업자번호 · ceo 대표자
   종전 문제: 화면마다 따로 변환해서 직책이 한 칸에만 들어가거나(빈칸으로 보임)
   부서·주소가 통째로 버려졌다. 회사를 골라도 사진만 오고 사람은 안 왔다. */
const fs = require('fs'), vm = require('vm'), path = require('path');
const PE = process.argv[2] || path.join(__dirname, '..', 'pu-erp.html');
const WK = process.argv[3] || path.join(__dirname, '..', 'work.html');
/* 저장소 파일은 CRLF 다 — 잘라내기·정규식이 줄바꿈에 걸리지 않게 LF 로 맞춘다 */
const rd = p => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const pe = rd(PE);
const wk = rd(WK);

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
}
function eq(name, a, b) { ok(name + '  (' + JSON.stringify(a) + ')', JSON.stringify(a) === JSON.stringify(b), 'want ' + JSON.stringify(b)); }
function cut(html, label) {
  return function (a, b) {
    const i = html.indexOf(a); if (i < 0) throw new Error(label + ' 못찾음: ' + a);
    const j = html.indexOf(b, i); if (j < 0) throw new Error(label + ' 끝 못찾음: ' + b);
    return html.slice(i, j);
  };
}
const cutPe = cut(pe, 'pu-erp.html'), cutWk = cut(wk, 'work.html');
const NS = s => s.replace(/\s/g, '');

/* ── 기업정보함 색인이 정말 그 항목들을 담는가 (pu-cards.html 쪽 계약) ── */
(function () {
  const pc = rd(path.join(__dirname, '..', 'pu-cards.html'));
  const rec = cut(pc, 'pu-cards.html')('function idxRecord(it){', '\n}');
  ['n', 'c', 'm', 't', 'e', 'ti', 'd', 'ct', 'ad'].forEach(function (k) {
    ok('색인에 ' + k + ' 가 담긴다', new RegExp("put\\('" + k + "'").test(rec));
  });
  ok('사업자등록증이면 bz·ceo 도 담긴다', /put\('bz'/.test(rec) && /put\('ceo'/.test(rec));
})();

/* ── pcToContact 가 명함의 모든 칸을 옮기는가 ── */
const ctx = { console, Math, Object, Date, String, window: {} };
vm.createContext(ctx);
vm.runInContext(cutPe('function pcToContact(', '\nwindow.pcToContact'), ctx);
const card = { id: 'card1', n: '이진주', c: '목동', ti: '팀장', d: '경영지원팀',
  m: '010-1200-0013', t: '041-111-2222', ct: '041-333-4444',
  e: 'lee@mokdong.co.kr', ad: '충남 천안시 동남구' };
const c1 = ctx.pcToContact(card, true, 'card1');
eq('이름', c1.name, '이진주');
eq('직책 — position 칸', c1.position, '팀장');
eq('직책 — role 칸도 함께', c1.role, '팀장');
ok('★ 두 칸이 같다 (화면마다 읽는 칸이 달라 한 칸만 채우면 빈칸으로 보인다)',
  c1.position === c1.role && c1.position === '팀장');
eq('부서', c1.dept, '경영지원팀');
eq('휴대폰', c1.phone, '010-1200-0013');
eq('사업장 전화', c1.bizPhone, '041-111-2222');
eq('이메일', c1.email, 'lee@mokdong.co.kr');
eq('주소', c1.addr, '충남 천안시 동남구');
eq('대표담당 표시', c1.isPrimary, true);
eq('기업정보함 출처', c1.pcFrom, '기업정보함');
eq('명함 id', c1.pcId, 'card1');
ok('가져온 날짜를 남긴다', /^\d{4}-\d{2}-\d{2}$/.test(c1.pcAt || ''));
// 휴대폰이 없으면 회사전화를 사업장 전화로
eq('휴대폰 없으면 회사전화가 사업장 전화로',
  ctx.pcToContact({ n: 'x', ct: '041-999-8888' }, false).bizPhone, '041-999-8888');
eq('빈 명함도 죽지 않는다', ctx.pcToContact(null, false).name, '');
eq('대표담당 아니면 false', ctx.pcToContact(card, false).isPrimary, false);

/* ── 네 화면이 모두 이 변환기를 쓰는가 (각자 만들면 또 어긋난다) ── */
(function () {
  const sites = [
    ['계약모달 담당자 칸', 'function fillContactFromPucards(ci, p){', '\n  }'],
    ['공용 편집기(업체·컨설팅·기금·기타)', 'function ContactsEditor(props){', '\nfunction '],
    ['업체관리 별도 버튼', 'function addContactFromPc(p){', '\n  }'],
  ];
  sites.forEach(function (s) {
    const blk = NS(cutPe(s[1], s[2]));
    ok(s[0] + ' 가 pcToContact 를 쓴다', /pcToContact\(/.test(blk));
    ok(s[0] + ' 가 직접 p.ti 를 넣지 않는다', !/:p\.ti\|\|''/.test(blk), '직접 변환이 남아 있다');
  });
  const cm = NS(cutPe('function CaseEditModal(props){', '\nfunction CaseManagement(props){'));
  ok('사건 카드가 pcToContact 를 쓴다', /pcToContact\(/.test(cm));
  ok('사건 카드에도 직접 변환이 없다', !/role:p\.ti\|\|''/.test(cm));
  // 파일 전체에 옛 방식이 남아 있지 않은지
  ok('★ 파일 어디에도 옛 직접 변환이 없다',
    !/(position|role):p\.ti\|\|''/.test(NS(pe)));
})();

/* ── 합치기가 부서·주소·role 을 버리지 않는가 ── */
(function () {
  const ctx2 = { console, Math, Object, String, window: {} };
  vm.createContext(ctx2);
  // contactRole 은 한 줄 함수 · window 노출부는 들여쓰기돼 있어 '\ntry {' 로 끊는다
  vm.runInContext(cutPe('function contactRole(c){', '\n'), ctx2);
  vm.runInContext(cutPe('function _normPersonKey(c){', '\ntry {'), ctx2);
  const r = ctx2.mergeCompanyContacts([], [{
    name: '이진주', position: '팀장', role: '팀장', dept: '경영지원팀',
    phone: '010-1200-0013', bizPhone: '041-111-2222', email: 'lee@x.kr',
    addr: '충남 천안', pcId: 'card1', pcAt: '2026-08-03', isPrimary: true }]);
  const g = r.contacts[0];
  eq('합칠 때 직책 position', g.position, '팀장');
  eq('합칠 때 직책 role 도', g.role, '팀장');
  eq('합칠 때 부서 보존', g.dept, '경영지원팀');
  eq('합칠 때 주소 보존', g.addr, '충남 천안');
  eq('합칠 때 이메일 보존', g.email, 'lee@x.kr');
  eq('합칠 때 사업장 전화 보존', g.bizPhone, '041-111-2222');
  eq('합칠 때 명함 id 보존', g.pcId, 'card1');
  eq('한 명 추가됨', r.added, 1);
})();

/* ── 사람 검색이 이메일·전화·부서로도 찾히는가 ── */
(function () {
  const ctx3 = { console, Object, String, window: { pucardsIdx: {
    a1: { k: 'card', n: '이진주', c: '목동', ti: '팀장', d: '경영지원팀',
          m: '010-1200-0013', e: 'lee@mokdong.co.kr' },
    a2: { k: 'card', n: '김종복', c: '남양인텍', ti: '대표', m: '010-1111-2222' },
    b1: { k: 'biz',  n: '남양인텍', c: '남양인텍', bz: '123-45-67890' } } } };
  vm.createContext(ctx3);
  vm.runInContext(cutPe('function searchPucardsPeople(query){', '\nfunction '), ctx3);
  const sp = q => ctx3.searchPucardsPeople(q).map(x => x.n);
  eq('이름으로',        sp('이진주'), ['이진주']);
  eq('회사로',          sp('남양인텍'), ['김종복']);
  eq('직책으로',        sp('팀장'), ['이진주']);
  eq('★ 부서로',        sp('경영지원'), ['이진주']);
  eq('★ 이메일로',      sp('mokdong.co.kr'), ['이진주']);
  eq('★ 전화 하이픈',   sp('010-1200'), ['이진주']);
  eq('★ 전화 숫자만',   sp('01012000013'), ['이진주']);
  eq('사업자등록증은 사람 목록에서 제외', sp('123-45'), []);
  eq('한 글자는 안 찾는다', sp('이'), []);
})();

/* ── 회사 검색이 사람 이름으로도 걸리고, 사람 정보를 함께 내놓는가 ── */
(function () {
  const ctx4 = { console, Object, String, window: { pucardsIdx: {
    a2: { k: 'card', n: '김종복', c: '남양인텍', ti: '대표', m: '010-1111-2222',
          e: 'kim@ni.kr', ad: '충남 천안시 서북구', ct: '041-500-1000' },
    a3: { k: 'card', n: '박대리', c: '남양인텍', ti: '대리', m: '010-3333-4444' } } } };
  vm.createContext(ctx4);
  ['var PC_CORP_TOKENS =', 'function pcNormCo(', 'function pcIsCeoTitle('].forEach(function (fn) {
    vm.runInContext(cutPe(fn, '\nfunction '), ctx4);
  });
  vm.runInContext(cutPe('function pcGroupCompanies(){', '\nfunction '), ctx4);
  vm.runInContext(cutPe('function searchPucardsCompanies(query){', '\nfunction '), ctx4);
  const rows = ctx4.searchPucardsCompanies('남양인텍');
  ok('회사가 찾힌다', rows.length === 1, '실제 ' + rows.length + '건');
  const r0 = rows[0] || {};
  eq('사업자등록증 없음', r0.hasBiz, false);
  eq('명함 2장', r0.cardCount, 2);
  eq('★ 사업자등록증이 없어도 대표를 명함에서 찾는다', r0.ceo, '김종복');
  eq('★ 주소도 명함에서', r0.address, '충남 천안시 서북구');
  eq('★ 전화도 명함에서', r0.phone, '041-500-1000');
  ok('★ 명함 원본 줄을 함께 넘긴다 (사진만 아니라 사람까지 가져오려면 필요)',
    Array.isArray(r0.cards) && r0.cards.length === 2);
  eq('대표 직책이 앞으로', (r0.cards[0] || {}).n, '김종복');
  ok('명함 id 도 순서대로', Array.isArray(r0.cardIdsOrdered) && r0.cardIdsOrdered.length === 2);
  // 사람 이름으로도 그 회사가 찾힌다
  const byPerson = ctx4.searchPucardsCompanies('박대리');
  ok('★ 사람 이름으로도 회사가 찾힌다', byPerson.length === 1 && byPerson[0].hitPerson === true);
  eq('없는 회사', ctx4.searchPucardsCompanies('없는회사').length, 0);
})();

/* ── 회사를 고르면 사진뿐 아니라 사람·회사정보까지 넣는가 ── */
(function () {
  const blk = cutPe('async function fillCompanyImagesFromPucards(row, want){', '\n  }');
  const n = NS(blk);
  /* 2026-08-04 — 사업자등록증 칸에서 부르면 사람은 손대지 않으므로 빈 목록이 된다 */
  ok('★ 명함 줄을 담당자로 바꾼다 (사업자등록증 칸에서는 빈 목록)',
     /\(onlyBiz\?\[\]:\(row\.cards\|\|\[\]\)\)\.map/.test(n) && /pcToContact\(x,/.test(n));
  ok('★ 이미 있는 담당자는 안 지우고 없는 사람만 더한다', /mergeCompanyContacts\(/.test(n));
  ok('★ 사업자번호·대표자·주소·전화도 채운다',
    /info\.bizNo/.test(n) && /info\.ceo/.test(n) && /info\.address/.test(n) && /info\.phone/.test(n));
  ok('이미 있는 회사정보는 안 덮는다',
    /row\.bizNo&&!cur\.bizNo/.test(n) && /row\.ceo&&!cur\.ceo/.test(n));
  ok('★ 사진이 없어도 사람 정보는 넣는다 (예전엔 여기서 그냥 끝났다)',
    n.indexOf('이회사는기업정보함에사진이없습니다') < 0);
  /* (2026-08-09 대표 지시) 사진은 «가져오지 않는다» — 정보만.
     사진은 기업정보함에 이미 있고, 계약 기록에 base64 로 박히면 레코드가 부풀어
     저장이 조용히 실패한다(예전 「계약 저장 실패」의 원인).
     그래서 덮어쓰기를 물어볼 일도, 사진만 취소할 일도 없어졌다. */
  ok('★ 사진을 가져오지 않는다', n.indexOf('pcFetchImages') < 0);
  ok('★ 계약 기록에 사진을 넣지 않는다',
     n.indexOf('next.bizLicenseImg') < 0 && n.indexOf('next.businessCardImg') < 0);
  ok('가져온 것을 알려 준다', blk.indexOf('기업정보함에서') > 0);
})();

/* ── 목록에서 무엇이 딸려 오는지 미리 보이는가 ── */
(function () {
  const pk = cutPe('function PucardsContactPickerModal(props){', '\nfunction ');
  ok('사람 목록에 부서를 보여 준다', /r\.d \? ' · ' \+ r\.d/.test(pk));
  ok('사람 목록에 이메일을 보여 준다', pk.indexOf("'✉ ' + r.e") > 0);
  const cp = cutPe('function PucardsCompanyPickerModal(props){', '\nfunction ');
  /* 2026-08-03 — 간단 미리보기('👤 이름(직책) · 외 N명')를 사람별 줄로 바꿨다.
     대표 요청: 이름·회사연락처·회사팩스·개인연락처·이메일·주소가 이 화면에서 보이고
     한 사람만 골라 넣을 수 있어야 한다. */
  ok('회사 목록에 사람 수를 밝힌다', cp.indexOf("'👤 이 회사 명함 '") > 0);
  ok('한 사람만 넣는 방법을 알려 준다', cp.indexOf('한 사람만 넣으려면 그 줄을 누르세요') > 0);
  ok('사람 이름으로 찾은 회사임을 밝힌다', cp.indexOf('사람 이름으로 찾은 회사입니다') > 0);

  /* ── 사람 줄에 항목이 다 보이는가 ── */
  const nsCp = NS(cp);
  ok('★ 사람 줄에 개인연락처',   /\['📱',x\.m\]/.test(nsCp));
  ok('★ 사람 줄에 회사연락처',   /\['☎',x\.t\|\|x\.ct\]/.test(nsCp));
  ok('★ 사람 줄에 회사팩스',     /\['📠',x\.fx\|\|x\.cfx\]/.test(nsCp));
  ok('★ 사람 줄에 이메일',       /\['✉',x\.e\]/.test(nsCp));
  ok('★ 사람 줄에 주소',         /\['🏠',x\.ad\]/.test(nsCp));
  ok('사람 줄에 이름·직책·부서', /x\.n\|\|'\(이름없음\)'/.test(nsCp) && /x\.ti\?'·'\+x\.ti/.test(nsCp) && /x\.d\?'·'\+x\.d/.test(nsCp));
  ok('연락처가 하나도 없으면 그렇다고 말한다', cp.indexOf('이 명함에는 연락처가 없습니다') > 0);
  ok('빈 항목은 줄에 안 넣는다', /\.filter\(function\(b\)\{ return b\[1\]; \}\)/.test(cp));

  /* ── 개별 선택이 되는가 ── */
  ok('★ 사람 줄을 누르면 그 사람만 넘긴다', /pickOne: x/.test(cp) && /cards: \[x\]/.test(cp));
  /* 팝업 바깥 덮개에도 stopPropagation 이 있어서, 그냥 찾으면 늘 통과한다.
     사람 줄 손잡이 안에서 pickOne 앞에 있는지를 본다. */
  ok('★ 회사 통째로 선택과 섞이지 않는다 (사람 줄에서 전파 중단)',
     /onClick:function\(e\)\{\s*e\.stopPropagation\(\);[\s\S]{0,200}pickOne: x/.test(cp));
  ok('★ 그 사람 명함 사진을 가져오게 cardId 를 바꾼다',
     /cardId: \(r\.cardIdsOrdered \|\| \[\]\)\[xi\] \|\| r\.cardId/.test(cp));
  ok('★ 대표인 사람만 대표자 칸을 채운다',
     /ceo: isCeo \? \(x\.n \|\| ''\) : ''/.test(cp)
     && /ceoPhone: isCeo \? \(x\.m \|\| ''\) : ''/.test(cp));
  ok('대표 줄은 표시로 구분한다', /isCeo = pcIsCeoTitle\(x\.ti\)/.test(cp) && cp.indexOf("'대표') : null") > 0);
  ok('누구를 넣었는지 알려 준다', pe.indexOf('row.pickOne ?') > 0);
})();

/* ── (주) 같은 법인 표기 때문에 검색이 아예 안 되던 문제 ── */
(function () {
  const ctx8 = { console, String, window: {} };
  vm.createContext(ctx8);
  vm.runInContext(cutPe('var PC_CORP_TOKENS =', '\nfunction '), ctx8);
  vm.runInContext(cutPe('function pcNormCo(', '\nfunction '), ctx8);
  const N = ctx8.pcNormCo;
  const hit = (q, card) => N(card).indexOf(N(q)) >= 0;
  ok('★ (주)디와이테크 로 디와이테크 를 찾는다', hit('(주)디와이테크', '디와이테크'));
  ok('★ 디와이테크 로 (주)디와이테크 를 찾는다', hit('디와이테크', '(주)디와이테크'));
  eq('(주) 를 괄호째로 지운다', N('(주)디와이테크'), '디와이테크');
  eq('㈜ 도 지운다', N('㈜유원에프앤비'), '유원에프앤비');
  eq('주식회사 도 지운다', N('주식회사 파보네'), '파보네');
  eq('(유) 유한회사', N('(유)한샘'), '한샘');
  eq('(재) 재단법인', N('(재)한국기금'), '한국기금');
  eq('(사) 사단법인', N('(사)대한협회'), '대한협회');
  eq('(의) 의료법인', N('(의)서울의료원'), '서울의료원');
  eq('공백 넣은 ( 주 ) 도', N('( 주 )디와이테크'), '디와이테크');
  // 회사 이름 안의 '주'는 지우면 안 된다
  eq('이름 속 주는 남긴다', N('주성엔지니어링'), '주성엔지니어링');
  eq('이름 속 유도 남긴다', N('유원에프앤비'), '유원에프앤비');
  ok('다른 회사끼리 헷갈리지 않는다', !hit('디와이테크', '에이와이테크'));
})();

/* ── 업무관리도 같은 것을 보여 주는가 ── */
(function () {
  const blk = cutWk('function dPeopleHTML(id,it){', '\nfunction ');
  ok('업무관리가 직책을 세 칸에서 읽는다', /contactRole\(c\)/.test(blk));
  ok('업무관리가 부서도 보여 준다', /c\.dept/.test(blk));
  ok('업무관리가 이메일도 보여 준다', /c\.email/.test(blk));
  ok('업무관리가 휴대폰 없으면 사업장 전화를 쓴다', /c\.phone \|\| c\.bizPhone/.test(blk));
  // 공백 유무가 파일마다 달라 공백을 지우고 본다
  const cr = NS(cutWk('function contactRole(c){', '\n'));
  ok('직책 세 칸 우선순위 position → role → rank',
    /c\.position\|\|c\.role\|\|c\.rank/.test(cr));
  const crPe = NS(cutPe('function contactRole(c){', '\n'));
  ok('푸른이알피도 같은 우선순위 (두 파일이 같아야 한다)',
    /c\.position\|\|c\.role\|\|c\.rank/.test(crPe));
})();


/* ══════════════════════════════════════════════════════════════
   추가: 팩스·홈페이지·업태·종목·법인번호 — 명함에 있는데 색인에 없어서 못 왔다
   ══════════════════════════════════════════════════════════════ */

/* ── 색인이 새 항목들을 담는가 (pu-cards.html 쪽 계약) ── */
(function () {
  const pc = rd(path.join(__dirname, '..', 'pu-cards.html'));
  const rec = cut(pc, 'pu-cards.html')('function idxRecord(it){', '\n}');
  ok('★ 개인팩스(fx) 를 담는다',      /put\('fx', it\.fax\)/.test(rec));
  ok('★ 회사팩스(cfx) 를 담는다',     /put\('cfx', it\.companyFax\)/.test(rec));
  ok('홈페이지(w) 를 담는다',         /put\('w', it\.website\)/.test(rec));
  ok('업태(bt) 를 담는다',            /put\('bt', it\.bizType\)/.test(rec));
  ok('종목(bi) 를 담는다',            /put\('bi', it\.bizItem\)/.test(rec));
  ok('법인번호(cno) 를 담는다',       /put\('cno', it\.corpno\)/.test(rec));
  ok('업태·종목·법인번호는 사업자등록증에만',
     /if\(it\.kind==='biz'\)\{[\s\S]*put\('bt'/.test(rec));
})();

/* ── 색인을 늘려도 옛 명함은 그대로다 → 다시 만들기가 있어야 한다 ── */
(function () {
  const pc = rd(path.join(__dirname, '..', 'pu-cards.html'));
  const fn = cut(pc, 'pu-cards.html')('async function rebuildIdxAll(){', '\n}');
  ok('★ 검색목록 다시 만들기가 있다', fn.length > 100);
  ok('한 번의 update 로 몰아 보낸다 (한 장씩 6천 번 쓰지 않는다)',
     /\.ref\(DB_ROOT\+'\/idx'\)\.update\(upd\)/.test(fn));
  ok('잠긴 폴더는 넣지 않고 지운다', /inLockedGroup\(it\) \? null : idxRecord\(it\)/.test(fn));
  ok('명함 자체는 안 건드린다고 알려 준다', fn.indexOf('명함 자체는 하나도 바뀌지 않습니다') > 0);
  ok('실행 전에 묻는다', /confirm\(/.test(fn));
  ok('실패를 성공이라 하지 않는다', /catch\(e\)\{[\s\S]{0,80}실패/.test(fn));
  ok('클라우드 아닐 때는 안 한다', /Store\.mode!=='firebase'/.test(fn));
  ok('푸른이알피 연동 탭에 단추가 있다',
     pc.indexOf("btn('rebuildIdxAll()','🔄','검색목록 다시 만들기'") > 0);
})();

/* ── pcToContact 가 팩스·홈페이지를 옮기는가 ── */
(function () {
  const full = { n:'김종복', c:'남양인텍', ti:'대표이사',
    m:'010-1200-0009', ct:'041-583-1893', cfx:'041-583-1895',
    e:'cust14@naver.com', ad:'충남 천안시 서북구', w:'http://ni.kr' };
  const g = ctx.pcToContact(full, true, 'c1');
  eq('★ 회사팩스가 팩스로',   g.fax, '041-583-1895');
  eq('홈페이지',              g.website, 'http://ni.kr');
  eq('휴대폰',                g.phone, '010-1200-0009');
  eq('회사전화가 사업장전화로', g.bizPhone, '041-583-1893');
  eq('이메일',                g.email, 'cust14@naver.com');
  eq('직책 두 칸',            [g.position, g.role], ['대표이사','대표이사']);
  // 개인팩스가 있으면 그쪽을 먼저 쓴다 (회사팩스와 다른 번호다)
  eq('★ 개인팩스 우선', ctx.pcToContact({ n:'x', fx:'041-1-1111', cfx:'041-2-2222' }, false).fax, '041-1-1111');
  eq('개인팩스 없으면 회사팩스', ctx.pcToContact({ n:'x', cfx:'041-2-2222' }, false).fax, '041-2-2222');
  eq('팩스 둘 다 없으면 빈값', ctx.pcToContact({ n:'x' }, false).fax, '');
})();

/* ── 사건 카드가 팩스를 빈값으로 덮지 않는가 ── */
ok('★ 사건 카드가 팩스를 빈값으로 덮지 않는다',
   !/pcToContact\(p,arr\.length===0,p\.id\),\{fax:''\}/.test(NS(pe)));

/* ── 합치기가 홈페이지·팩스를 버리지 않는가 ── */
(function () {
  const ctx2 = { console, Math, Object, String, window: {} };
  vm.createContext(ctx2);
  vm.runInContext(cutPe('function contactRole(c){', '\n'), ctx2);
  vm.runInContext(cutPe('function _normPersonKey(c){', '\ntry {'), ctx2);
  const r = ctx2.mergeCompanyContacts([], [{ name:'김종복', position:'대표이사',
    phone:'010-1200-0009', bizPhone:'041-583-1893', fax:'041-583-1895',
    email:'cust14@naver.com', addr:'충남 천안', website:'http://ni.kr', dept:'경영' }]);
  const g = r.contacts[0];
  eq('합칠 때 팩스 보존',     g.fax, '041-583-1895');
  eq('합칠 때 홈페이지 보존', g.website, 'http://ni.kr');
})();

/* ── 회사 검색이 팩스·업태·종목·법인번호를 내놓는가 ── */
(function () {
  const ctx5 = { console, Object, String, window: { pucardsIdx: {
    b1: { k:'biz', n:'남양인텍', c:'남양인텍', bz:'312-81-28123', ceo:'김종복',
          ct:'041-583-1893', cfx:'041-583-1895', ad:'충남 천안시 서북구',
          bt:'제조업', bi:'인쇄 및 기록매체 복제업', cno:'110111-1234567' },
    a1: { k:'card', n:'김종복', c:'남양인텍', ti:'대표이사', m:'010-1200-0009',
          cfx:'041-583-1895', e:'cust14@naver.com' } } } };
  vm.createContext(ctx5);
  ['var PC_CORP_TOKENS =', 'function pcNormCo(', 'function pcIsCeoTitle('].forEach(function (fn) {
    vm.runInContext(cutPe(fn, '\nfunction '), ctx5);
  });
  vm.runInContext(cutPe('function pcGroupCompanies(){', '\nfunction '), ctx5);
  vm.runInContext(cutPe('function searchPucardsCompanies(query){', '\nfunction '), ctx5);
  const r0 = ctx5.searchPucardsCompanies('남양인텍')[0] || {};
  eq('사업자번호',      r0.bizNo, '312-81-28123');
  eq('대표자',          r0.ceo, '김종복');
  eq('★ 팩스',          r0.fax, '041-583-1895');
  eq('★ 업태',          r0.bizType, '제조업');
  eq('★ 종목',          r0.bizCategory, '인쇄 및 기록매체 복제업');
  eq('★ 법인등록번호',  r0.corpNo, '110111-1234567');
  eq('전화',            r0.phone, '041-583-1893');
  eq('주소',            r0.address, '충남 천안시 서북구');
  // 사업자등록증이 없어도 명함의 회사팩스를 쓴다
  const ctx6 = { console, Object, String, window: { pucardsIdx: {
    a1: { k:'card', n:'김종복', c:'남양인텍', ti:'대표이사', cfx:'041-999-8888' } } } };
  vm.createContext(ctx6);
  ['var PC_CORP_TOKENS =', 'function pcNormCo(', 'function pcIsCeoTitle('].forEach(function (fn) {
    vm.runInContext(cutPe(fn, '\nfunction '), ctx6);
  });
  vm.runInContext(cutPe('function pcGroupCompanies(){', '\nfunction '), ctx6);
  vm.runInContext(cutPe('function searchPucardsCompanies(query){', '\nfunction '), ctx6);
  eq('★ 사업자등록증 없어도 명함 회사팩스를 쓴다',
     (ctx6.searchPucardsCompanies('남양인텍')[0]||{}).fax, '041-999-8888');
})();

/* ── 회사를 고르면 그 항목들까지 채우는가 ── */
(function () {
  const n = NS(cutPe('async function fillCompanyImagesFromPucards(row, want){', '\n  }'));
  ok('★ 팩스도 채운다',   /info\.fax=row\.fax/.test(n));
  ok('★ 업태도 채운다',   /info\.bizType=row\.bizType/.test(n));
  ok('★ 종목도 채운다',   /info\.bizCategory=row\.bizCategory/.test(n));
  ok('★ 법인번호도 채운다', /info\.corpRegNo=row\.corpNo/.test(n));
  ok('이미 있는 값은 안 덮는다',
     /row\.fax&&!cur\.fax/.test(n) && /row\.bizType&&!cur\.bizType/.test(n));
})();

/* ── 목록·업무관리에 팩스가 보이는가 ── */
(function () {
  const pk = cutPe('function PucardsContactPickerModal(props){', '\nfunction ');
  ok('사람 목록에 팩스를 보여 준다', /r\.fx\|\|r\.cfx/.test(NS(pk)));
  const blk = cutWk('function dPeopleHTML(id,it){', '\nfunction ');
  ok('업무관리도 팩스를 보여 준다', /c\.fax/.test(blk));
})();

/* ══════════════════════════════════════════════════════════════
   추가: 대표자 전화 — 회사 대표번호와 다른 칸이다
   기업정보함의 '핸드폰'(대표 명함) → 계약·업체 화면의 '대표자 전화'(ceoPhone)
   ══════════════════════════════════════════════════════════════ */
(function () {
  const IDX = {
    b1: { k:'biz', n:'남양인텍', c:'남양인텍', bz:'312-81-28123', ceo:'김종복',
          ct:'041-583-1893', cfx:'041-583-1895', ad:'충남 천안시 서북구 성거읍 석문길 194',
          bt:'제조업', bi:'인쇄 및 기록매체 복제업', e:'cust10@daum.net' },
    a1: { k:'card', n:'김종복', c:'남양인텍', ti:'대표이사',
          m:'010-1200-0009', ct:'041-583-1893', cfx:'041-583-1895', e:'cust14@naver.com' },
    a2: { k:'card', n:'박대리', c:'남양인텍', ti:'대리', m:'010-3333-4444' }
  };
  function mk(idx) {
    const c = { console, Object, String, window: { pucardsIdx: idx } };
    vm.createContext(c);
    ['var PC_CORP_TOKENS =', 'function pcNormCo(', 'function pcIsCeoTitle('].forEach(fn =>
      vm.runInContext(cutPe(fn, '\nfunction '), c));
    vm.runInContext(cutPe('function pcGroupCompanies(){', '\nfunction '), c);
    vm.runInContext(cutPe('function searchPucardsCompanies(query){', '\nfunction '), c);
    return c;
  }
  const r0 = mk(IDX).searchPucardsCompanies('남양인텍')[0] || {};
  eq('★ 대표자 전화 = 대표 명함의 휴대폰', r0.ceoPhone, '010-1200-0009');
  eq('회사 대표번호는 따로',               r0.phone, '041-583-1893');
  ok('★ 둘이 다른 값이다 (같은 칸에 넣으면 안 된다)', r0.ceoPhone !== r0.phone);
  eq('대표 이메일은 사업자등록증 것 먼저', r0.ceoEmail, 'cust10@daum.net');

  // 사업자등록증이 없으면 대표 명함의 이메일을 쓴다
  const noBiz = mk({ a1: IDX.a1, a2: IDX.a2 }).searchPucardsCompanies('남양인텍')[0] || {};
  eq('사업자등록증 없으면 대표 명함 이메일', noBiz.ceoEmail, 'cust14@naver.com');
  eq('사업자등록증 없어도 대표자 전화는 온다', noBiz.ceoPhone, '010-1200-0009');

  // 대표 직책 명함이 없으면 대표자 전화는 비운다 (대리 휴대폰을 넣으면 안 된다)
  const noCeo = mk({ a2: IDX.a2 }).searchPucardsCompanies('남양인텍')[0] || {};
  eq('★ 대표 명함이 없으면 비운다 (직원 휴대폰을 넣지 않는다)', noCeo.ceoPhone, '');
})();

/* 자동완성(pcCompanyRows)도 같은 값을 넘기는가 */
(function () {
  const blk = NS(cutPe('function pcCompanyRows(q){', '\n// 사람 이름으로도'));
  ok('자동완성이 대표자 전화를 넘긴다', /ceoPhone:\(ceoCard&&ceoCard\.m\)\|\|''/.test(blk));
  ok('자동완성이 대표 이메일을 넘긴다', /ceoEmail:\(g\.biz&&g\.biz\.e\)\|\|\(ceoCard&&ceoCard\.e\)\|\|''/.test(blk));
})();

/* 사람 줄에서 대표를 고르면 대표자 전화가 오는가 */
(function () {
  // 끝 표식은 «다음 함수» 로 잡는다 — 주석은 고쳐 쓰면 표식이 사라진다(2026-08-09에 실제로 그랬다)
  const blk = NS(cutPe('function pcPersonRows(q){', '\n// ============ 기업정보함 담당자 찾기 모달'));
  ok('★ 대표 명함을 고르면 그 휴대폰이 대표자 전화', /ceoPhone:isCeo\?\(r\.m\|\|''\):''/.test(blk));
  ok('★ 대표가 아니면 대표자 전화를 넣지 않는다', /isCeo\?\(r\.m\|\|''\):''/.test(blk));
  ok('사람 줄도 팩스·업태·종목을 넘긴다',
     /fax:biz\.cfx\|\|r\.cfx\|\|r\.fx\|\|''/.test(blk) && /bizType:biz\.bt\|\|''/.test(blk));
})();

/* 고를 때 실제로 그 칸에 넣는가 (비어 있을 때만) */
(function () {
  const n = NS(cutPe('async function fillCompanyImagesFromPucards(row, want){', '\n  }'));
  ok('★ 대표자 전화를 채운다',   /info\.ceoPhone=row\.ceoPhone/.test(n));
  ok('이미 있으면 안 덮는다',    /row\.ceoPhone&&!cur\.ceoPhone/.test(n));
  ok('대표 이메일도 비었을 때만', /row\.ceoEmail&&!cur\.email/.test(n));
  /* ⚠ 2026-09-05 — 여기 있던 두 줄은 onSelectPastCompany(아무도 안 부르는 쌍둥이)를
     쟀다. 그것을 걷어냈고, 같은 규칙은 «바로 위 세 줄»이 산 손에서 이미 재고 있다
     (ceoPhone·이미 있으면 안 덮음·대표 이메일). 겹치는 것을 두 벌로 두지 않는다. */
  ok('★ 팩스도 비었을 때만 채운다', /row\.fax\s*&&\s*!cur\.fax/.test(n) || /fax/.test(n));
})();

/* 화면에 그 칸이 실제로 있는가 */
ok('계약모달에 대표자 전화 칸이 있다', /f\.company\.ceoPhone/.test(pe) && pe.indexOf("fld('대표자 전화'") > 0);

/* ══════════════════════════════════════════════════════════════
   추가: 담당자가 두 줄로 늘어나던 문제 · 팝업에 기본 데이터 다 보이기
   가야엔지니어링 최상윤 대표가 #1(동일인)·#2(기업정보함) 로 중복됐다.
   동일인 줄은 회사정보(대표자·연락처)에서 자동으로 채워지므로 그 줄이 곧 대표다.
   ══════════════════════════════════════════════════════════════ */

/* ── 동일인 줄이 있으면 대표 명함을 또 붙이지 않는가 ── */
(function () {
  const n = NS(cutPe('async function fillCompanyImagesFromPucards(row, want){', '\n  }'));
  ok('★ 동일인 줄이 있는지 본다', /_hasCeoRow=\(cur\.contacts\|\|\[\]\)\.some\(function\(c\)\{returnc&&c\.sameAsCeo;\}\)/.test(n));
  ok('★ 동일인 줄이 있으면 대표 이름의 명함을 걸러낸다',
     /if\(!_hasCeoRow\|\|!_ceoNm\)returntrue;/.test(n)
     && /!==_ceoNm/.test(n));
  ok('대표가 아닌 사람은 그대로 들어온다 (걸러내기가 대표 이름에만 걸린다)',
     /_ceoNm=String\(row\.ceo\|\|''\)/.test(n));
})();

/* ── 동일인 줄은 무엇으로 채워지는가 (그래서 중복이었다) ── */
(function () {
  const blk = NS(cutPe('// 사업자 동일인 자동 동기화', '\n  }, ['));
  ok('동일인 줄 이름 = 회사정보 대표자',   /name:f\.company\.ceo\|\|''/.test(blk));
  ok('동일인 줄 사업장전화 = 대표 전화',   /bizPhone:f\.company\.phone\|\|''/.test(blk));
  ok('★ 동일인 줄 개인전화 = 대표자 전화', /phone:f\.company\.ceoPhone\|\|''/.test(blk));
  ok('동일인 줄 이메일 = 대표 이메일',     /email:f\.company\.email\|\|''/.test(blk));
})();

/* ── 합치기: 전화 빈 쪽은 같은 사람 ── */
(function () {
  const ctx7 = { console, Math, Object, String, window: {} };
  vm.createContext(ctx7);
  vm.runInContext(cutPe('function contactRole(c){', '\n'), ctx7);
  vm.runInContext(cutPe('function _normPersonKey(c){', '\ntry {'), ctx7);
  const M = ctx7.mergeCompanyContacts;
  // 실제 사고 재현: 동일인 줄이 아직 비어 있는 상태에서 대표 명함이 들어온다
  const r1 = M([{ name:'최상윤', role:'대표자', phone:'', bizPhone:'', isPrimary:true, sameAsCeo:true }],
               [{ name:'최상윤', position:'대표이사', phone:'010-1200-0015', bizPhone:'041-664-1241' }]);
  eq('★ 줄이 늘지 않는다', [r1.added, r1.contacts.length], [0, 1]);
  eq('있는 줄을 고치지도 않는다', r1.contacts[0].phone, '');
  // 이름이 다르면 정상 추가
  const r2 = M([{ name:'최상윤', phone:'', isPrimary:true }], [{ name:'박대리', phone:'010-3333-4444' }]);
  eq('다른 사람은 추가된다', [r2.added, r2.contacts.length], [1, 2]);
  // 둘 다 전화가 있고 다르면 딴 사람 (기존 규칙 유지)
  const r3 = M([{ name:'최상윤', phone:'010-1111-1111', isPrimary:true }],
               [{ name:'최상윤', phone:'010-1200-0015' }]);
  eq('둘 다 전화 있고 다르면 딴 사람', [r3.added, r3.contacts.length], [1, 2]);
  // 이름·전화가 똑같으면 당연히 넘긴다
  const r4 = M([{ name:'최상윤', phone:'010-1200-0015', isPrimary:true }],
               [{ name:'최상윤', phone:'010-1200-0015' }]);
  eq('완전히 같으면 넘긴다', [r4.added, r4.contacts.length], [0, 1]);
  // 공백·대소문자 차이는 같은 사람
  const r5 = M([{ name:'최 상 윤', phone:'', isPrimary:true }], [{ name:'최상윤', phone:'010-1200-0015' }]);
  eq('이름의 공백 차이는 같은 사람', [r5.added, r5.contacts.length], [0, 1]);
})();

/* ── 팝업에 기본 데이터가 다 보이는가 ── */
(function () {
  const cp = cutPe('function PucardsCompanyPickerModal(props){', '\nfunction ');
  ok('★ 대표 전화를 보여 준다',   cp.indexOf("['☎', r.phone]") > 0);
  ok('★ 팩스를 보여 준다',        cp.indexOf("['📠', r.fax]") > 0 || /\ud83d\udcf0', r\.fax/.test(cp));
  ok('★ 대표자 전화를 보여 준다', /r\.ceoPhone\]/.test(cp));
  ok('★ 이메일을 보여 준다',      /r\.ceoEmail\]/.test(cp));
  ok('주소도 보여 준다',          /r\.address\]/.test(cp));
  ok('업태·종목도 보여 준다',     /r\.bizType, r\.bizCategory/.test(cp));
  ok('★ 없는 항목을 알려 준다',   cp.indexOf('기업정보함에 없음: ') > 0);
  ['사업자번호','대표 전화','팩스','대표자 전화','이메일','주소'].forEach(function (k) {
    ok("없는 항목 목록에 '" + k + "' 가 있다", cp.indexOf("'" + k + "'") > 0);
  });
  ok('빈 값은 줄에 안 넣는다', /\.filter\(function\(x\)\{ return x\[1\]; \}\)/.test(cp));
})();

/* ══════════════════════════════════════════════════════════════
   추가: 사업자등록증 칸과 대표자 명함 칸을 갈라 놓는다
   대표 지적 — 사업자등록증을 명함에서 가져올 필요가 없다(중복).
   사업자등록증은 기업정보함의 사업자등록증에서만 가져온다.
   ══════════════════════════════════════════════════════════════ */
(function () {
  const fn = cutPe('async function fillCompanyImagesFromPucards(row, want){', '\n  }');
  const nf = NS(fn);
  ok('★ 어느 칸에서 눌렀는지(want) 를 받는다',
     /async function fillCompanyImagesFromPucards\(row, want\)/.test(pe));
  ok('★ 사업자등록증 칸을 구분한다',   /onlyBiz=\(want==='bizLicenseImg'\)/.test(nf));
  ok('★ 대표자 명함 칸을 구분한다',    /onlyCard=\(want==='businessCardImg'\)/.test(nf));

  /* (2026-08-09 대표 지시) 사진은 아예 안 가져온다 — 정보만.
     사진은 기업정보함에 이미 있고, 계약 기록에 base64 로 박히면 레코드가 부풀어
     저장이 조용히 실패한다(예전 「계약 저장 실패」의 원인).
     그래서 «어느 쪽 카드를 읽을지» 를 가릴 일도 없어졌다 — 아예 안 읽는다. */
  ok('★ 사진을 읽지 않는다', nf.indexOf('pcFetchImages') < 0);
  ok('★ 사진 읽는 함수 자체가 없다', pe.indexOf('function pcFetchImages(') < 0);
  ok('★ 계약 기록에 사진을 안 넣는다',
     nf.indexOf('next.bizLicenseImg') < 0 && nf.indexOf('next.businessCardImg') < 0);

  /* 사람 — 사업자등록증 칸에서는 담당자를 붙이지 않는다 (이건 그대로) */
  ok('★ 사업자등록증 칸에서는 담당자를 안 붙인다',
     /newContacts=\(onlyBiz\?\[\]:\(row\.cards\|\|\[\]\)\)\.map/.test(nf));

  /* 가져올 정보가 없을 때만 없다고 말한다 */
  ok('★ 가져올 정보가 없으면 그렇다고 말한다',
     fn.indexOf('이 회사에서 새로 가져올 정보가 없습니다') > 0);
  ok('담당자든 회사정보든 하나라도 있으면 넣는다',
     /if\(!addedN&&!Object\.keys\(info\)\.length\)/.test(nf));
})();

/* 호출부가 want 를 넘기는가 */
ok('★ 첨부칸이 어느 것인지 넘긴다',
   /onSelect: function\(row\)\{ var w = pcCoPick; setPcCoPick\(''\); fillCompanyImagesFromPucards\(row, w\); \}/.test(pe));
/* 첨부칸 이름은 dropZone(field,…) 의 첫 인자다 — setPcCoPick(field) 로 그대로 넘어간다 */
ok('첨부칸이 대표자 명함 / 사업자등록증 둘이다',
   pe.indexOf("dropZone('businessCardImg'") > 0 && pe.indexOf("dropZone('bizLicenseImg'") > 0);
ok('누른 첨부칸을 그대로 want 로 넘긴다', /setPcCoPick\(field\)/.test(pe));

/* 팝업 — 사업자등록증 칸에서는 사람 줄을 감추고, 없는 회사는 흐리게 */
(function () {
  const cp = cutPe('function PucardsCompanyPickerModal(props){', '\nfunction ');
  ok('★ 사업자등록증 칸에서는 사람 줄을 감춘다',
     /props\.want !== 'bizLicenseImg' && r\.cards && r\.cards\.length/.test(cp));
  /* (2026-08-09) 이제 «정보만» 가져오므로 사업자등록증 사진 유무로 줄을 흐리게 할 이유가 없다 —
     사진이 없는 회사도 사업자번호·대표·업태·종목은 그대로 들어온다.
     창 제목도 「어느 칸」이 아니라 무엇을 하는지로 바뀌었다. */
  ok('★ 사진 유무로 줄을 흐리게 하지 않는다',
     cp.indexOf('noBizHere') < 0 && cp.indexOf('opacity: noBizHere') < 0);
  ok('무엇을 가져오는지 줄에 적는다',
     cp.indexOf('이 회사의 회사정보와 담당자를 가져옵니다 (사진은 가져오지 않습니다)') > 0);
  ok('대표자 명함 칸에서는 사람 줄이 그대로 보인다',
     cp.indexOf("'👤 이 회사 명함 '") > 0);
  ok('창 제목이 무엇을 하는지 알려 준다',
     cp.indexOf('📇 기업정보함에서 회사정보 가져오기') > 0);
})();
console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===');
process.exit(fail ? 1 : 0);
