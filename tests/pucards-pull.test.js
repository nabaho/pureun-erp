/* 명함첩에서 가져오기 — 명함에 있는 것을 빠뜨리지 않는가
   명함첩 색인(pu-cards.html idxRecord)이 담는 것:
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

/* ── 명함첩 색인이 정말 그 항목들을 담는가 (pu-cards.html 쪽 계약) ── */
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
  m: '010-4747-9985', t: '041-111-2222', ct: '041-333-4444',
  e: 'lee@mokdong.co.kr', ad: '충남 천안시 동남구' };
const c1 = ctx.pcToContact(card, true, 'card1');
eq('이름', c1.name, '이진주');
eq('직책 — position 칸', c1.position, '팀장');
eq('직책 — role 칸도 함께', c1.role, '팀장');
ok('★ 두 칸이 같다 (화면마다 읽는 칸이 달라 한 칸만 채우면 빈칸으로 보인다)',
  c1.position === c1.role && c1.position === '팀장');
eq('부서', c1.dept, '경영지원팀');
eq('휴대폰', c1.phone, '010-4747-9985');
eq('사업장 전화', c1.bizPhone, '041-111-2222');
eq('이메일', c1.email, 'lee@mokdong.co.kr');
eq('주소', c1.addr, '충남 천안시 동남구');
eq('대표담당 표시', c1.isPrimary, true);
eq('명함첩 출처', c1.pcFrom, '명함첩');
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
    phone: '010-4747-9985', bizPhone: '041-111-2222', email: 'lee@x.kr',
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
          m: '010-4747-9985', e: 'lee@mokdong.co.kr' },
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
  eq('★ 전화 하이픈',   sp('010-4747'), ['이진주']);
  eq('★ 전화 숫자만',   sp('01047479985'), ['이진주']);
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
  ['function pcNormCo(', 'function pcIsCeoTitle('].forEach(function (fn) {
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
  const blk = cutPe('async function fillCompanyImagesFromPucards(row){', '\n  }');
  const n = NS(blk);
  ok('★ 명함 줄을 담당자로 바꾼다', /row\.cards\|\|\[\]\)\.map/.test(n) && /pcToContact\(x,/.test(n));
  ok('★ 이미 있는 담당자는 안 지우고 없는 사람만 더한다', /mergeCompanyContacts\(/.test(n));
  ok('★ 사업자번호·대표자·주소·전화도 채운다',
    /info\.bizNo/.test(n) && /info\.ceo/.test(n) && /info\.address/.test(n) && /info\.phone/.test(n));
  ok('이미 있는 회사정보는 안 덮는다',
    /row\.bizNo&&!cur\.bizNo/.test(n) && /row\.ceo&&!cur\.ceo/.test(n));
  ok('★ 사진이 없어도 사람 정보는 넣는다 (예전엔 여기서 그냥 끝났다)',
    n.indexOf('이회사는명함첩에사진이없습니다') < 0);
  ok('사진 덮어쓰기는 물어본다', /popConfirm\(/.test(n));
  ok('사진만 취소해도 사람 정보는 들어간다', /got=\[\];img=\{\};/.test(n));
  ok('가져온 것을 알려 준다', blk.indexOf('명함첩에서') > 0);
})();

/* ── 목록에서 무엇이 딸려 오는지 미리 보이는가 ── */
(function () {
  const pk = cutPe('function PucardsContactPickerModal(props){', '\nfunction ');
  ok('사람 목록에 부서를 보여 준다', /r\.d \? ' · ' \+ r\.d/.test(pk));
  ok('사람 목록에 이메일을 보여 준다', pk.indexOf("'✉ ' + r.e") > 0);
  const cp = cutPe('function PucardsCompanyPickerModal(props){', '\nfunction ');
  ok('회사 목록에 딸려 올 사람을 미리 보여 준다', cp.indexOf("'👤 '") > 0);
  ok('사람 이름으로 찾은 회사임을 밝힌다', cp.indexOf('사람 이름으로 찾은 회사입니다') > 0);
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

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===');
process.exit(fail ? 1 : 0);
