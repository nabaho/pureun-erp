/* 사업장 담당자 — 직책 칸 통일 · 계약→업체관리 추가 합치기 · 업무관리 복수 담당자
   - 직책이 position(업체관리) / role(계약 회사정보) / rank(업무관리) 셋으로 갈려 있어
     한쪽에서 적은 직책이 다른 쪽에서 빈칸으로 보였다 → contactRole() 로 읽을 때 세 칸을 본다
   - 계약에 적은 담당자가 업체관리 마스터에 안 올라와 손으로 또 적고 있었다
     → 저장할 때 '없는 사람만' 더한다. 있는 사람은 전화·직책까지 그대로 둔다(대표 결정)
   - 업무관리는 이 건 담당자가 한 명뿐이었다 → contacts 배열. contact(단수)는 contacts[0]과 같게 유지 */
const fs = require('fs'), vm = require('vm'), path = require('path');
const PE = process.argv[2] || path.join(__dirname, '..', 'pu-erp.html');
const WK = process.argv[3] || path.join(__dirname, '..', 'work.html');
const pe = fs.readFileSync(PE, 'utf8');
const wk = fs.readFileSync(WK, 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
}
function eq(name, a, b) { ok(name + '  (' + JSON.stringify(a) + ')', JSON.stringify(a) === JSON.stringify(b), 'want ' + JSON.stringify(b)); }
function cutter(html, label) {
  return function (a, b) {
    const i = html.indexOf(a); if (i < 0) throw new Error(label + ' 못찾음: ' + a);
    const j = html.indexOf(b, i); if (j < 0) throw new Error(label + ' 끝 못찾음: ' + b);
    return html.slice(i, j);
  };
}
const peSlice = cutter(pe, 'pu-erp'), wkSlice = cutter(wk, 'work');
function peCount(s) { return pe.split(s).length - 1; }
function wkCount(s) { return wk.split(s).length - 1; }

/* ── 실제 코드를 그대로 떼어 모래상자에서 돌린다 ── */
const P = { console, Object, Array, String, Number, JSON, Math, window: {} };
vm.createContext(P);
vm.runInContext(peSlice('/* ============ 사업장 담당자의 직책', 'try {'), P);

const W = { console, Object, Array, String, Number, JSON, Math, window: {} };
vm.createContext(W);
vm.runInContext(wkSlice("/* 담당자의 '직책'이 저장된 칸이 세 가지다.", 'function telHref(p)'), W);

const contactRole = P.contactRole;
const normKey = P._normPersonKey;
const merge = P.mergeCompanyContacts;
const itemContacts = W.itemContacts;

/* ══ ① 직책 읽기 — position > role > rank ══ */
ok('pu-erp 에 contactRole 이 있다', typeof contactRole === 'function');
ok('work.html 에도 같은 이름으로 있다', typeof W.contactRole === 'function');
eq('position 을 먼저 읽는다', contactRole({ position: '인사팀장', role: '나', rank: '다' }), '인사팀장');
eq('position 이 없으면 role', contactRole({ role: '안전관리자', rank: '다' }), '안전관리자');
eq('둘 다 없으면 rank', contactRole({ rank: '과장' }), '과장');
eq('position 이 빈 문자열이면 다음 칸으로', contactRole({ position: '', role: '대리' }), '대리');
eq('아무것도 없으면 빈 문자열', contactRole({}), '');
eq('null 이면 빈 문자열', contactRole(null), '');
eq('undefined 도 빈 문자열', contactRole(undefined), '');
eq('★ 업체관리(position)에 적은 직책을 업무관리에서 읽는다',
   W.contactRole({ name: '김철수', position: '인사팀장' }), '인사팀장');
eq('★ 계약 회사정보(role)에 적은 직책도 읽는다',
   W.contactRole({ name: '김철수', role: '안전관리자' }), '안전관리자');
eq('두 파일의 결과가 같다 (복사해 둔 함수가 어긋나지 않았다)',
   [contactRole({ role: 'A' }), contactRole({ rank: 'B' }), contactRole({})],
   [W.contactRole({ role: 'A' }), W.contactRole({ rank: 'B' }), W.contactRole({})]);

/* ══ ② 같은 사람인가 — 이름(공백 제거) + 전화(숫자만) ══ */
ok('_normPersonKey 가 있다', typeof normKey === 'function');
eq('전화 표기가 달라도 같은 키', normKey({ name: '김철수', phone: '010-1111-2222' }),
   normKey({ name: '김철수', phone: '01011112222' }));
eq('이름 사이 공백은 무시', normKey({ name: '김 철수', phone: '01011112222' }),
   normKey({ name: '김철수', phone: '010 1111 2222' }));
eq('이름도 전화도 없으면 빈 키 (담을 수 없다)', normKey({ name: '', phone: '' }), '');
eq('null 도 빈 키', normKey(null), '');
ok('이름만 있어도 키가 생긴다', normKey({ name: '김철수' }) !== '');
ok('전화만 있어도 키가 생긴다', normKey({ phone: '01011112222' }) !== '');

/* ══ ③ 합치기 — 없는 사람만 추가 ══ */
ok('mergeCompanyContacts 가 있다', typeof merge === 'function');

// 새 사람은 그대로 들어간다
(function () {
  const ex = [{ name: '김철수', phone: '010-1111-2222', position: '인사팀장', isPrimary: true }];
  const r = merge(ex, [{ name: '박영희', phone: '010-3333-4444', position: '안전관리자' }]);
  eq('새 사람은 붙는다 (added=1)', [r.added, r.skipped], [1, 0]);
  eq('목록이 2명이 된다', r.contacts.length, 2);
  eq('붙은 사람의 이름·직책·전화', [r.contacts[1].name, r.contacts[1].position, r.contacts[1].phone],
     ['박영희', '안전관리자', '010-3333-4444']);
  eq('★ 원본 배열은 바뀌지 않는다', ex.length, 1);
  ok('새 배열을 돌려준다', r.contacts !== ex);
})();

// 이름+전화가 같으면 건너뛴다 — 기존 항목은 한 글자도 바뀌지 않는다
(function () {
  const keep = { name: '김철수', phone: '010-1111-2222', position: '인사팀장', email: 'kim@old.kr', isPrimary: true };
  const before = JSON.stringify(keep);
  const r = merge([keep], [{ name: '김철수', phone: '01011112222', position: '안전관리자', email: 'kim@new.kr' }]);
  eq('같은 사람은 건너뛴다 (added=0, skipped=1)', [r.added, r.skipped], [0, 1]);
  eq('목록 길이가 그대로', r.contacts.length, 1);
  eq('★ 기존 항목이 글자 하나까지 그대로다 (직책·메일을 덮어쓰지 않는다)',
     JSON.stringify(r.contacts[0]), before);
  eq('바뀐 게 없으니 added 가 0 — 호출부는 저장하지 않는다', r.added, 0);
})();

// 이름은 같은데 전화가 다르면 '다른 사람'으로 따로 넣는다
(function () {
  const ex = [{ name: '김철수', phone: '010-1111-2222', position: '인사팀장', isPrimary: true }];
  const r = merge(ex, [{ name: '김철수', phone: '010-9999-8888', position: '안전관리자' }]);
  eq('같은 이름 + 다른 전화 → 따로 붙인다', [r.added, r.contacts.length], [1, 2]);
  eq('기존 번호는 그대로', r.contacts[0].phone, '010-1111-2222');
  eq('새 번호는 새 줄에', r.contacts[1].phone, '010-9999-8888');
})();
/* 2026-08-03 규칙 바뀜 — 대표 지적으로 되돌렸다.
   종전: 이름이 같아도 한쪽 전화가 비면 '딴 사람일 수 있다'며 새 줄로 넣었다.
   실제로는 전화가 아직 안 적힌 같은 사람이라, 똑같은 이름이 두 줄로 붙었다
   (가야엔지니어링 최상윤 대표가 #1·#2 로 중복).
   지금: 새 줄을 만들지 않고 그냥 넘긴다. 있는 줄을 고치지도 않는다
   (대표 결정 '없는 사람만 추가, 있는 사람은 그대로'를 둘 다 지킨다). */
(function () {
  const ex = [{ name: '김철수', phone: '', position: '인사팀장', isPrimary: true }];
  const r = merge(ex, [{ name: '김철수', phone: '010-1111-2222' }]);
  eq('★ 이름 같고 한쪽 전화가 비면 같은 사람 — 줄을 늘리지 않는다',
    [r.added, r.contacts.length], [0, 1]);
  eq('있는 줄을 고치지도 않는다 (전화가 여전히 빈칸)', r.contacts[0].phone, '');
  eq('한 건 넘긴 것으로 센다', r.skipped, 1);
  // 반대 방향도 같다 — 들어온 쪽에 전화가 없을 때
  const r2 = merge([{ name: '김철수', phone: '010-1111-2222', isPrimary: true }], [{ name: '김철수', phone: '' }]);
  eq('들어온 쪽 전화가 비어도 줄을 늘리지 않는다', [r2.added, r2.contacts.length], [0, 1]);
  // 둘 다 전화가 있고 서로 다르면 여전히 딴 사람으로 본다
  const r3 = merge([{ name: '김철수', phone: '010-1111-2222', isPrimary: true }], [{ name: '김철수', phone: '010-9999-8888' }]);
  eq('둘 다 전화가 있고 다르면 딴 사람 (이 규칙은 그대로)', [r3.added, r3.contacts.length], [1, 2]);
})();

// 빈 줄은 담지 않는다
(function () {
  const r = merge([], [{ name: '', phone: '', position: '팀장' }, { name: '   ', phone: '' }]);
  eq('이름도 전화도 없으면 담지 않는다', [r.added, r.skipped, r.contacts.length], [0, 2, 0]);
})();

// pcId(기업정보함 출처)는 지킨다 / 명함 사진은 옮기지 않는다
(function () {
  const r = merge([], [{ name: '박영희', phone: '010-3333-4444', pcId: 'pc-abc', pcAt: '2026-08-01',
    cardImg: 'data:image/png;base64,AAAA', sameAsCeo: true }]);
  eq('★ pcId 를 지킨다 (기업정보함 출처 추적)', r.contacts[0].pcId, 'pc-abc');
  eq('pcAt 도 지킨다', r.contacts[0].pcAt, '2026-08-01');
  eq('명함 사진(cardImg)은 업체관리로 옮기지 않는다', r.contacts[0].cardImg, undefined);
  eq('계약 화면 전용 표시(sameAsCeo)도 옮기지 않는다', r.contacts[0].sameAsCeo, undefined);
})();

// 대표(isPrimary) 표시를 빼앗지 않는다
(function () {
  const ex = [{ name: '김철수', phone: '010-1111-2222', isPrimary: true }];
  const r = merge(ex, [{ name: '박영희', phone: '010-3333-4444', isPrimary: true }]);
  eq('★ 기존에 대표가 있으면 붙는 사람은 대표가 아니다', r.contacts[1].isPrimary, false);
  eq('기존 대표는 그대로 대표', r.contacts[0].isPrimary, true);
  eq('대표는 한 명뿐', r.contacts.filter(function (c) { return c.isPrimary; }).length, 1);
})();
(function () {
  const r = merge([], [{ name: '김철수', phone: '010-1111-2222', isPrimary: true },
                       { name: '박영희', phone: '010-3333-4444', isPrimary: true }]);
  eq('기존이 비어 있으면 첫 사람은 들고 온 대표 표시를 그대로 쓴다', r.contacts[0].isPrimary, true);
  eq('두 번째부터는 대표가 아니다', r.contacts[1].isPrimary, false);
})();
(function () {
  const r = merge([], [{ name: '김철수', phone: '010-1111-2222' }]);
  eq('기존이 비었고 들고 온 쪽도 대표가 아니면 대표로 만들지 않는다', r.contacts[0].isPrimary, false);
})();
(function () {
  const ex = [{ name: '김철수', phone: '010-1111-2222' }];   // 대표가 없는 옛 데이터
  const r = merge(ex, [{ name: '박영희', phone: '010-3333-4444' }]);
  eq('기존에 대표가 없으면 첫 번째로 붙는 사람이 대표가 된다', r.contacts[1].isPrimary, true);
})();

// 세는 값
(function () {
  const ex = [{ name: '김철수', phone: '010-1111-2222', isPrimary: true }];
  const r = merge(ex, [{ name: '김철수', phone: '010-1111-2222' },      // 있음
                       { name: '박영희', phone: '010-3333-4444' },      // 새로
                       { name: '', phone: '' },                          // 빈 줄
                       { name: '박영희', phone: '010-3333-4444' }]);     // 같은 묶음 안 중복
  eq('added / skipped 를 정확히 센다', [r.added, r.skipped], [1, 3]);
  eq('목록은 2명', r.contacts.length, 2);
})();
(function () {
  eq('들고 온 게 없으면 아무 일도 없다', (function () { const r = merge([{ name: 'A', phone: '1' }], []); return [r.added, r.skipped, r.contacts.length]; })(), [0, 0, 1]);
  eq('둘 다 비어도 안전하다', (function () { const r = merge(null, null); return [r.added, r.skipped, r.contacts.length]; })(), [0, 0, 0]);
})();

/* ══ ④ 업무관리 이 건 담당자 (복수) ══ */
ok('itemContacts 가 있다', typeof itemContacts === 'function');
eq('contacts 배열을 읽는다', itemContacts({ contacts: [{ name: '가' }, { name: '나' }] }).length, 2);
eq('contacts 의 순서를 지킨다',
   itemContacts({ contacts: [{ name: '가' }, { name: '나' }] }).map(function (c) { return c.name; }), ['가', '나']);
eq('★ 옛 데이터: contact 한 명이면 그것을 읽는다',
   itemContacts({ contact: { name: '김철수', rank: '과장', phone: '010' } }).length, 1);
eq('옛 데이터의 이름이 그대로 나온다',
   itemContacts({ contact: { name: '김철수' } })[0].name, '김철수');
eq('직책만 있는 옛 데이터도 살린다', itemContacts({ contact: { rank: '과장' } }).length, 1);
eq('둘 다 없으면 빈 배열', itemContacts({}), []);
eq('contact 가 빈 껍데기면 빈 배열', itemContacts({ contact: { name: '', rank: '', phone: '' } }), []);
eq('contacts 가 빈 배열이면 옛 칸으로 내려간다',
   itemContacts({ contacts: [], contact: { name: '김철수' } })[0].name, '김철수');
eq('레코드 자체가 없으면 빈 배열', itemContacts(null), []);
eq('contacts 가 있으면 contact(단수)는 보지 않는다',
   itemContacts({ contacts: [{ name: '가' }], contact: { name: '나' } })[0].name, '가');

/* 저장은 contacts 에 하고 contact(단수)를 contacts[0]과 같게 유지한다 */
const ctSave = wkSlice('function _ctSave(id,arr,msg){', 'function saveContactAt(');
ok('★ 저장할 때 contact 를 contacts[0] 과 같게 둔다 (검색·연동이 그 칸을 본다)',
   ctSave.indexOf('contact:clean[0]||null') > 0);
ok('담당자가 하나도 없으면 두 칸 모두 지운다',
   ctSave.indexOf('contacts:clean.length?clean:null') > 0);
ok('빈 줄은 저장하지 않는다', ctSave.indexOf("return c&&(c.name||c.rank||c.phone);") > 0);
ok('★ 직책은 rank(옛 칸)와 position(공통 칸) 둘 다 적는다',
   ctSave.indexOf("rank:c.rank||'', position:c.rank||''") > 0);
ok('기업정보함에서 고른 사람도 position 을 함께 적는다',
   wkCount('rank:_rk, position:_rk') === 1);
ok('푸른이알피 연동도 position 을 함께 적는다',
   peCount('{ name:scn, rank:scr, position:scr, phone:scp }') === 1);
ok('푸른이알피 쪽에 되돌려 쓸 때도 role·position 을 함께 적는다',
   peCount('c0.name = scn; c0.role = scr; c0.position = scr; c0.phone = scp;') === 1);
ok('푸른이알피 연동은 첫 사람만 맞추고 뒷사람은 그대로 둔다',
   peCount("var _crest = (w.contacts || []).slice(1);") === 1
   && peCount("_c1 ? [_c1].concat(_crest) : (_crest.length ? _crest : null)") === 1);

/* ══ ⑤ work.html 배선 ══ */
const coC = wkSlice('function coContacts(it){', '/* 이 건 담당자 — 여러 명');
ok('★ 이관본의 최상위 contacts 를 읽는 층이 생겼다 (사건·컨설팅·기금·기타)',
   coC.indexOf('_cList(r)') > 0);
ok('그 층도 "이 건" 으로 표시한다', (coC.match(/_src='이 건'/g) || []).length === 2,
   (coC.match(/_src='이 건'/g) || []).length + '곳');
ok('업체관리 마스터 fallback 은 그대로 남아 있다',
   coC.indexOf('_cList(coFind(it))') > 0 && coC.indexOf("_src='업체관리'") > 0);
ok('순서: company.contacts → 레코드 최상위 → 업체관리',
   coC.indexOf('_cList(r&&r.company)') < coC.indexOf('_cList(r)')
   && coC.indexOf('_cList(r)') < coC.indexOf('_cList(coFind(it))'));

const dPeople = wkSlice('function dPeopleHTML(id,it){', 'function _subOpts(it){');
ok('★ [＋ 담당자 추가] 버튼이 있다', dPeople.indexOf('＋ 담당자 추가') > 0);
ok('줄마다 ✕(빼기)가 있다', dPeople.indexOf('contactDelAt(') > 0);
ok('줄마다 인덱스가 붙은 저장 핸들러를 쓴다',
   dPeople.indexOf('saveContactAt(') > 0 && dPeople.indexOf("id=\"ct-nm-'+ri+'\"") > 0);
ok('입력칸 세 개(이름·직급·연락처)가 줄마다 있다',
   dPeople.indexOf("id=\"ct-rk-'+ri+'\"") > 0 && dPeople.indexOf("id=\"ct-ph-'+ri+'\"") > 0);
ok('기업정보함에서 찾기 버튼은 그대로 있다', dPeople.indexOf('📇 기업정보함에서 찾기') > 0);
ok('✕ 비우기 버튼은 그대로 있다', dPeople.indexOf('✕ 비우기') > 0);
ok('읽기 전용 푸른이알피 담당자 목록이 그 위에 남아 있다',
   dPeople.indexOf('coContacts(it)') > 0 && dPeople.indexOf("<span class=\"src\">") > 0);
ok('★ 읽기 전용 목록의 직책은 contactRole 로 읽는다 (position 도 보인다)',
   dPeople.indexOf("contactRole(c)?'<span class=\"rk\">'+esc(contactRole(c))") > 0);
ok('맨 직책 읽기(c.role)는 남아 있지 않다', wkCount("(c.role?'<span class=\"rk\">'") === 0);
ok('saveContactAt / contactAdd / contactDelAt 가 각각 한 번 정의돼 있다',
   wkCount('function saveContactAt(id,i){') === 1
   && wkCount('function contactAdd(id){') === 1
   && wkCount('function contactDelAt(id,i){') === 1);
ok('아무도 안 부르는 옛 saveContact 는 남기지 않았다 (빈 화면을 읽어 지울 위험)',
   wkCount('function saveContact(id){') === 0 && wkCount("saveContact('") === 0);
ok('★ 줄이 화면에 없으면 저장하지 않는다 (빈 화면으로 담당자를 지우지 않는다)',
   ctSave.indexOf("if(!$('ct-nm-0')) return Promise.resolve(false);") > 0);
/* 2026-09-05 대표 지시 「화면이 너무 정신없다」 — 예전에는 «늘» 빈 줄 하나를 깔았다.
   사업장 담당자가 이미 있는데도 그 밑에 빈 칸 셋이 붙어 서랍이 어수선했다.
   ⚠ 적을 길은 그대로다 — [＋ 담당자 추가]가 한 줄을 만든다(바로 아래 검사).
   ⚠ 빈 화면으로 담당자를 지우는 사고는 위 ct-nm-0 검사가 막는다. */
ok('비어 있으면 빈 줄을 안 깐다 (적을 때는 [＋ 담당자 추가])',
   wkCount('function _ctRowCount(id){') === 1
   && wkCount('return itemContacts(items[id]||{}).length+((S._ctAdd&&S._ctAdd[id])||0);') === 1
   && wkCount('Math.max(1, itemContacts(items[id]||{}).length') === 0);
ok('★ 그리는 쪽과 [＋ 담당자 추가]가 같은 줄 셈을 본다 (어긋나면 눌러도 안 늘어난다)',
   dPeople.indexOf('_ctRowCount(id)') > 0 && wkCount('var shown=_ctRowCount(id);') === 1
   && wkCount('S._ctAdd[id]=(shown+1)-itemContacts(items[id]||{}).length;') === 1);
ok('★ [＋ 담당자 추가]는 적던 줄을 먼저 저장한다 (다시 그리며 날리지 않는다)',
   wkCount('_ctSave(id,_ctRows()).then(function(){') === 1);
ok('원래 비어 있으면 쓸데없이 쓰지 않는다',
   ctSave.indexOf("if(!clean.length&&!itemContacts(items[id]||{}).length) return Promise.resolve(true);") > 0);
ok('여러 명일 때 비우기는 한 번 묻는다', wkCount('이 건 담당자 \'+n+\'명을 모두 비웁니다.') === 1);
ok('비우기는 contact·contacts 를 모두 지운다', wkCount('{contact:null,contacts:null}') === 1);
ok('기업정보함에서 고른 사람은 한 명 더로 붙는다 (덮어쓰지 않는다)',
   wkCount('arr.push(rec);') === 1 && wkCount('patchItem(id,{contacts:arr,contact:arr[0]||null})') === 1);
ok('같은 사람을 두 번 넣지 않는다', wkCount('이미 담당자로 들어 있습니다') === 1);
ok('저장 전 빈 줄은 화면에만 둔다 (S._ctAdd)', wkCount('S._ctAdd') >= 4);
ok('담당자 한 줄 + ✕ 를 위한 CSS 가 있다',
   wkCount('.c3.c4{grid-template-columns:1.1fr .6fr 1.1fr 24px}') === 1 && wkCount('.c3 .ctx{') === 1);

/* ══ ⑥ pu-erp 배선 — 계약 → 업체관리 추가 합치기 ══ */
const sync = peSlice('(function syncCompanies(){', '// 저장 성공 → draft 삭제');
ok('★ 계약 저장 때 업체관리 담당자를 합친다',
   sync.indexOf('mergeCompanyContacts(co.contacts || []') > 0);
ok('계약의 회사정보 담당자를 들고 간다',
   sync.indexOf('(saveData.company && saveData.company.contacts) || []') > 0);
ok('★ 추가된 사람이 있을 때만 저장한다 (안 바뀌면 레코드를 건드리지 않는다)',
   sync.indexOf('if(mg.added > 0){ patch.contacts = mg.contacts;') > 0);
ok('추가되면 알려 준다', sync.indexOf("'👤 업체관리에 담당자 ' + ctAdded + '명 추가'") > 0);
ok('건너뛴 사람은 있을 때만 말한다', sync.indexOf("ctSkipped > 0 ?") > 0);
ok('★ managerMain/managerSubs 는 여전히 건드리지 않는다',
   sync.indexOf('managerMain') > 0 && sync.indexOf('managerSubs') > 0
   && sync.indexOf('managerMain:') < 0 && sync.indexOf('managerSubs:') < 0);
ok('옛 경고 주석이 그대로 남아 있다',
   peCount('(2026-07-12: 계약 저장 시 업체 주담당이 조용히 덮어써지는 사고 방지)') === 1);
ok('사업장 담당자는 추가만 한다는 규칙이 주석으로 남았다',
   sync.indexOf("사업장 담당자(contacts)는 '없는 사람만 추가'한다") > 0);
ok('CMS·세금계산서 동기화는 그대로다',
   sync.indexOf('isCMS: !!(saveData.isCMS)') > 0 && sync.indexOf('taxInvoiceIssueDay:') > 0);
ok('helpers 가 window 에 노출돼 있다',
   peCount('window.contactRole = contactRole;') === 1
   && peCount('window.mergeCompanyContacts = mergeCompanyContacts;') === 1
   && peCount('window._normPersonKey = _normPersonKey;') === 1);
ok('업체관리 표의 직책도 contactRole 로 읽는다',
   peCount('contactRole(primary)') === 2 && peCount('contactRole(second)') === 2);
/* ⚠ 2026-08-26 다시 겨눔 — 개수를 못 박고 있었다.
   지켜야 할 규칙은 「직책은 contactRole 로 읽는다」이지 «몇 번 쓰였나»가 아니다.
   새로 읽는 자리가 생길 때마다(계약창 접힘 줄 등) 이 검사가 «까닭 없이» 빨개졌다. */
ok('상세보기의 직책도 contactRole 로 읽는다',
   peCount('contactRole(primaryContact)') === 2 && peCount('contactRole(p)') >= 2);
ok('편집칸은 그대로 position 을 쓴다 (읽기만 통일했다)',
   peCount("value:c.position || ''") === 1);
ok('근로자(workers)의 직책은 건드리지 않았다', peCount('wk.position') >= 1);

/* ══ ⑦ pu-erp 배선 — 중복 배너 접기·닫기 ══ */
const banner = peSlice('// 동일 회사 계약 실시간 안내 (종류별 구분)', "h('div', { className:'fld' }, h('label', null, '대표자 (1 / 2)')");
ok('★ 한 줄로 접힌다 (점 · 몇 건)', banner.indexOf("dotIcon + ' 같은 사업장 ' + dupContracts.length + '건'") > 0);
ok('한 줄 결론이 붙는다', banner.indexOf("String(conclusion).replace(/^→\\s*/, '')") > 0);
ok('[자세히] 버튼이 있다', banner.indexOf("dupDetail ? '접기' : '자세히'") > 0);
ok('[✕] 버튼이 있다', banner.indexOf('setDupBannerHid(true)') > 0);
ok('닫기는 이 편집 동안만이다 (state 로만 둔다 — 저장하지 않는다)',
   peCount('var dbh = useState(false); var dupBannerHid = dbh[0];') === 1
   && peCount('localStorage') > 0 && banner.indexOf('localStorage') < 0);
ok('★ 🔴 확인 전에는 ✕ 를 주지 않는다',
   banner.indexOf("var blocking = (worst === 'dup' && !confirmedDuplicate);") > 0
   && banner.indexOf('🔴 중복 확인 전에는 닫을 수 없습니다') > 0);
ok('★ 닫아 뒀는데 확인이 풀리면 한 줄로 되살아난다',
   banner.indexOf('if(dupBannerHid && !blocking) return null;') > 0
   && banner.indexOf('var reopened = dupBannerHid && blocking;') > 0
   && banner.indexOf("reopened ? '중복 확인이 아직 필요합니다. ' : ''") > 0);
ok('★ 확인 체크박스는 접혀 있어도 늘 보인다 (자세히 카드 밖에 있다)',
   banner.indexOf("needConfirm && h('label'") > banner.indexOf("dotIcon + ' 같은 사업장 '")
   && banner.indexOf("needConfirm && h('label'") < banner.indexOf("dupDetail && h('div'"));
ok('★ 저장을 막는 장치가 그대로다 (needConfirm ← contractDupNeedsConfirm, checked ← confirmedDuplicate)',
   peCount('var needConfirm = contractDupNeedsConfirm(worst);') === 1
   && peCount('checked: confirmedDuplicate,') === 1
   && peCount('if(!confirmedDuplicate && hasOverlap){') === 1);
ok('★ 확인 문구가 그대로 남아 있다',
   peCount('✔ 동일 사업장이지만 새로운 계약 진행임을 확인했습니다 (저장 허용)') === 1);
ok('✕ 로 닫는 코드가 confirmedDuplicate 를 손대지 않는다',
   banner.indexOf('setDupBannerHid(true)') > 0
   && banner.slice(banner.indexOf('setDupBannerHid(true)') - 120, banner.indexOf('setDupBannerHid(true)') + 60)
        .indexOf('setConfirmedDuplicate') < 0);
ok('자세히 카드에 예전 정보가 그대로 들어 있다',
   banner.indexOf('detailKids') > 0
   && banner.indexOf("'🔍 이력'") > 0 && banner.indexOf("'📋 정보 가져오기'") > 0
   && banner.indexOf("'지금 작성 중 '") > 0 && banner.indexOf('주담당 ') > 0
   && banner.indexOf('계약일 ') > 0 && banner.indexOf("'... 외 '") > 0);
ok('줄마다 판정 점·계약번호·상태칩이 그대로다',
   banner.indexOf("var dot = vk === 'dup' ? '🔴'") > 0
   && banner.indexOf("c.contractNo || '-'") > 0 && banner.indexOf('closedLabel') > 0);
ok('결론 한 줄도 카드 안에 남아 있다',
   banner.indexOf("style:{ fontSize:'11px', fontWeight:700, color:titleColor, marginTop:'6px' } }, conclusion)") > 0);


/* ══════════════════════════════════════════════════════════════
   추가: 검색키 전체 담당자 · 담당자를 기업정보함에서 찾기 (사업장 이름 자동검색)
   ══════════════════════════════════════════════════════════════ */

/* ── 1. 업무관리 검색이 담당자 전원을 본다 ── */
(function(){
  const cut = cutter(wk, 'work.html');
  const ctxQ = { console };
  vm.createContext(ctxQ);
  vm.runInContext(cut('function contactRole(c){', '\n}') + '\n}', ctxQ);
  vm.runInContext(cut('function itemContacts(it){', '\n}') + '\n}', ctxQ);
  vm.runInContext(cut('function matchQ(it,q){', '\n}') + '\n}', ctxQ);
  const mq = ctxQ.matchQ;

  const it3 = { company:'가나상사', contacts:[
    { name:'하서윤', rank:'실장',    phone:'010-1200-0005' },
    { name:'이근혜', position:'차장', phone:'010-1200-0004' },
    { name:'송금석', role:'대표자',  phone:'041-575-7994' } ]};
  it3.contact = it3.contacts[0];
  ok('검색: 1번째 담당자',        mq(it3, '하서윤'));
  ok('검색: 2번째 담당자',        mq(it3, '이근혜'));
  ok('검색: 3번째 담당자',        mq(it3, '송금석'));
  ok('검색: 2번째 담당자 직책',   mq(it3, '차장'));
  ok('검색: 3번째 담당자 직책',   mq(it3, '대표자'));
  ok('검색: 전화 하이픈 그대로',  mq(it3, '010-1200-0004'));
  ok('검색: 전화 숫자만',         mq(it3, '01012000004'));
  ok('검색: 없는 이름은 안 걸림', !mq(it3, '없는사람'));

  const legacy = { company:'다라기업', contact:{ name:'옛담당', rank:'과장', phone:'010-1111-2222' } };
  ok('검색: 옛 단수 담당자',      mq(legacy, '옛담당'));
  ok('검색: 옛 단수 전화 숫자만', mq(legacy, '01011112222'));

  const none = { company:'무담당', title:'현장클리닉' };
  ok('검색: 담당자 없어도 회사명',   mq(none, '무담당'));
  ok('검색: 담당자 없어도 업무명',   mq(none, '현장클리닉'));
  ok('검색: 담당자 없으면 안 걸림', !mq(none, '하서윤'));
  ok('검색: 빈 검색어는 전부 통과',  mq(none, ''));
})();

/* ── 2. 지식카드 이름 목록도 담당자 전원 ── */
ok('지식카드 이름 목록이 itemContacts 를 쓴다 (2곳)',
   (wk.match(/\.concat\(itemContacts\(it\)\.map\(function\(c\)\{ return c&&c\.name; \}\)\)/g) || []).length === 2);
ok('지식카드에서 옛 단수 참조가 사라졌다',
   wk.indexOf('[it.officer,it.client,(it.contact&&it.contact.name)]') < 0);

/* ── 3. 공용 담당자 편집기(업체관리·컨설팅·기금·기타)에 기업정보함 버튼 ── */
(function(){
  const cut = cutter(pe, 'pu-erp.html');
  const ce = cut('function ContactsEditor(props){', '\nfunction ');
  const ceNs = ce.replace(/\s/g, '');
  ok('공용 편집기에 기업정보함 버튼', ce.indexOf("'📇 기업정보함'") > 0);
  ok('공용 편집기가 companyName 을 초기검색으로 넘긴다',
     /initialQuery:props\.companyName\|\|''/.test(ceNs));
  // 2026-08-03: 화면마다 따로 만들던 것을 pcToContact 하나로 통일했다.
  // 예전 어설션은 각 화면이 직접 'position:p.ti' 를 쓰는지 봤는데, 이제 변환기가
  // position·role 을 함께 채우므로 '변환기를 쓰는지'를 본다 (더 강한 조건이다).
  ok('공용 편집기가 정식 변환기(pcToContact)를 쓴다', /pcToContact\(p,/.test(ceNs));
  ok('공용 편집기가 중복 사람을 막는다',
     ce.indexOf('_normPersonKey') > 0 && ce.indexOf('이미 있는 담당자입니다') > 0);
  ok('공용 편집기가 pcId 를 넘겨 출처를 남긴다', /pcToContact\(p,n\.length===0,p\.id\)/.test(ceNs));
  ok('공용 편집기의 + 추가 는 그대로', ce.indexOf("'+ 추가'") > 0);
})();

/* ── 4. 두 호출부가 사업장 이름을 넘긴다 ── */
ok('업체관리가 업체명을 넘긴다',           /companyName: f\.name \|\| ''/.test(pe));
ok('컨설팅·기금·기타가 사업장명을 넘긴다', /companyName: f\.companyName \|\| ''/.test(pe));

/* ── 5. 사건관리 자체 담당자 카드 ── */
(function(){
  const cut = cutter(pe, 'pu-erp.html');
  const cm = cut('function CaseEditModal(props){', '\nfunction CaseManagement(props){');
  const cmNs = cm.replace(/\s/g, '');
  ok('사건 카드에 기업정보함 버튼', cm.indexOf("'📇 기업정보함'") > 0);
  ok('사건 카드가 사업장명으로 먼저 찾는다', /initialQuery:f\.companyName\|\|''/.test(cmNs));
  ok('사건 카드도 정식 변환기를 쓴다 (팩스 칸은 유지)',
     /pcToContact\(p,arr\.length===0,p\.id\)/.test(cmNs) && /fax:''/.test(cmNs));
  ok('사건 카드도 중복 사람을 막는다',
     cm.indexOf('_normPersonKey') > 0 && cm.indexOf('이미 있는 담당자입니다') > 0);
  ok('사건 카드의 + 추가 는 그대로', cm.indexOf("'+ 추가'") > 0);
})();

/* ── 6. 기업정보함 찾기 창을 여는 모든 곳이 초기검색을 넘긴다 ── */
(function(){
  /* ⚠ 「바로 다음 줄」로 못 박지 않는다 — 2026-08-31 에 «왜 그렇게 넘기는지» 적은
       주석 한 덩이를 앞에 넣었더니 여기서 깨졌다. 기능은 멀쩡했다.
       볼 것은 «그 창을 여는 곳마다 초기검색을 넘기는가» 이지 몇째 줄인가가 아니다.
       열두 줄 안이면 같은 속성 목록으로 본다 — 그보다 멀면 다른 것을 보고 있는 것이다. */
  const lines = pe.split('\n');
  let mounts = 0, withQ = 0; const missing = [];
  lines.forEach(function(L, i){
    if(L.indexOf('h(PucardsContactPickerModal, {') < 0) return;
    mounts++;
    if(lines.slice(i + 1, i + 13).join('\n').indexOf('initialQuery') >= 0) withQ++;
    else missing.push(i + 1);
  });
  ok('기업정보함 찾기 창을 여는 곳이 4군데', mounts === 4, '실제 ' + mounts + '곳');
  ok('네 곳 모두 초기검색을 넘긴다', withQ === mounts, '빠진 줄: ' + missing.join(','));
})();

/* ── 7. 안내 줄은 자동검색했을 때만 ── */
(function(){
  const cut = cutter(pe, 'pu-erp.html');
  const pk = cut('function PucardsContactPickerModal(props){', '\nfunction ');
  ok('안내 줄이 있다', pk.indexOf('으로 먼저 찾았습니다') > 0);
  ok('안내 줄은 초기검색이 있고 결과가 있을 때만',
     /props\.initialQuery && query === props\.initialQuery && results\.length > 0/.test(pk));
  ok('검색창은 그대로 (직접 검색 가능)', pk.indexOf('setQuery(e.target.value)') > 0);
})();
console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===');
process.exit(fail ? 1 : 0);
