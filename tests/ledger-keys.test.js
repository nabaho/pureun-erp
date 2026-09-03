/* 거래내역 — 키보드로 밟아 나가기 · 되돌리기 · 표 안에서 찾기
   (2026-08-09) 대표 요청: "거래내역에 추가할 단축키나 좀더 편의기능 없을까".
   미처리 271건을 줄마다 마우스로 눌러야 했다. ↑↓ 로 옮기고 Enter 로 처리한다.

   여기서 못 박는 것은 «판단» 이지 화면 모양이 아니다 —
   칸 너비·색·글자를 손볼 때마다 검사가 깨지면 아무도 안 고친다. */
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8').replace(/\r\n/g, '\n');

let pass = 0, fail = 0;
function t(name, got, want){
  const G = JSON.stringify(got), W = JSON.stringify(want);
  if(G === W){ pass++; console.log('  PASS ' + name + '  (' + G + ')'); }
  else { fail++; console.log('  FAIL ' + name + '\n    받음 ' + G + '\n    기대 ' + W); }
}

/* 순수함수만 떼어 실제로 돌려본다 — 「소스에 이 글자가 있나」 는 동작을 지키지 못한다 */
const ctx = { window:{}, document:{}, console:console };
ctx.window = ctx;
const grab = (from, to) => src.slice(src.indexOf(from), src.indexOf(to));
const CODE = grab('function erpIsTyping(el){', 'function erpUnmarkBankRow(row){');
require('vm').createContext(ctx);
require('vm').runInContext(CODE, ctx);

console.log('\n[① 어떤 키가 무엇을 하는가]');
const K = (key, extra, c) => ctx.erpLedgerKey(Object.assign({ key:key }, extra || {}), c || {});
t('↓ 는 아래로', K('ArrowDown'), 'down');
t('↑ 는 위로', K('ArrowUp'), 'up');
t('Enter 는 처리', K('Enter'), 'act');
t('Space 는 체크', K(' '), 'check');
t('h 는 보류', K('h'), 'hold');
t('대문자 H 도 보류 (한/영 전환 중에도 눌린다)', K('H'), 'hold');
t('f 는 찾기 창', K('f'), 'pick');
t('/ 는 표에서 찾기', K('/'), 'search');
t('Esc 는 풀기', K('Escape'), 'esc');
t('Ctrl+Z 는 되돌리기', K('z', { ctrlKey:true }), 'undo');
t('맥의 ⌘Z 도 되돌리기', K('z', { metaKey:true }), 'undo');
t('모르는 키는 아무것도 안 한다', K('q'), null);

console.log('\n[② 글자를 치는 중에는 표가 움직이지 않는다]');
/* 이게 없으면 업체명을 치다가 h 를 눌렀을 때 그 줄이 보류함으로 들어간다 */
t('입력칸 안의 h 는 그냥 글자', K('h', {}, { typing:true }), null);
t('입력칸 안의 Space 도 그냥 글자', K(' ', {}, { typing:true }), null);
t('입력칸 안의 Ctrl+Z 는 브라우저 몫 (우리가 가로채면 글자를 못 물린다)',
  K('z', { ctrlKey:true }, { typing:true }), null);
t('입력칸 안에서도 Esc 는 듣는다 (찾기 칸을 닫아야 한다)', K('Escape', {}, { typing:true }), 'esc');

console.log('\n[③ 팝업이 떠 있으면 뒤의 표는 조용히 있는다]');
/* 가려진 표가 몰래 움직이면 무엇을 확정했는지 알 수 없다 */
t('팝업 중 Enter 는 안 듣는다', K('Enter', {}, { modal:true }), null);
t('팝업 중 ↓ 도 안 듣는다', K('ArrowDown', {}, { modal:true }), null);
t('팝업 중에도 Esc 는 듣는다', K('Escape', {}, { modal:true }), 'esc');
t('팝업 중에도 Ctrl+Z 는 듣는다', K('z', { ctrlKey:true }, { modal:true }), 'undo');
t('Alt 를 낀 키는 안 듣는다 (브라우저 메뉴 단축키)', K('h', { altKey:true }), null);

console.log('\n[④ 커서가 설 자리 — 목록 밖으로 나가지 않는다]');
t('아무 줄도 안 골랐을 때 ↓ 는 첫 줄', ctx.erpNextCur(-1, 10, 1), 0);
t('아무 줄도 안 골랐을 때 ↑ 는 끝 줄', ctx.erpNextCur(-1, 10, -1), 9);
t('가운데서 ↓', ctx.erpNextCur(4, 10, 1), 5);
t('가운데서 ↑', ctx.erpNextCur(4, 10, -1), 3);
t('맨 위에서 ↑ 는 제자리 (밖으로 안 나간다)', ctx.erpNextCur(0, 10, -1), 0);
t('맨 아래서 ↓ 도 제자리', ctx.erpNextCur(9, 10, 1), 9);
t('줄이 없으면 커서도 없다', ctx.erpNextCur(3, 0, 1), -1);

console.log('\n[⑤ 처리한 뒤 저절로 다음 줄로 — 손이 마우스로 안 돌아간다]');
/* 확정한 줄은 목록에서 빠지므로 «그 자리» 에 다음 줄이 올라온다 */
t('확정해서 줄이 빠졌으면 자리를 지킨다', ctx.erpCurAfterAct(3, 10, 9), 3);
t('줄이 안 빠졌으면 한 칸 내려간다 (보류 등)', ctx.erpCurAfterAct(3, 10, 10), 4);
t('마지막 줄을 확정하면 새 마지막 줄로', ctx.erpCurAfterAct(9, 10, 9), 8);
t('마지막 한 줄을 확정하면 커서가 없어진다', ctx.erpCurAfterAct(0, 1, 0), -1);
t('커서가 없으면 그대로 없다', ctx.erpCurAfterAct(-1, 10, 9), -1);

console.log('\n[⑥ 표 안에서 찾기 — 줄을 감추지 않는다]');
const r = (memo, amount) => ({ memo:memo, amount:amount, date:'2026-07-14' });
t('적요로 찾는다', ctx.erpLedgerHit(r('노리시스템(주)', 330000), null, '노리'), true);
t('업체명으로 찾는다', ctx.erpLedgerHit(r('익선원', 220000), { co:'㈜신흥기업' }, '신흥'), true);
t('담당자로도 찾는다', ctx.erpLedgerHit(r('익선원', 220000), { staff:'김동현' }, '김동현'), true);
t('금액을 숫자만 쳐도 찾는다', ctx.erpLedgerHit(r('비즈사업비2건', 2100000), null, '2100000'), true);
t('★ 콤마를 넣어 쳐도 찾는다 (통장을 보고 그대로 옮겨 적는다)',
  ctx.erpLedgerHit(r('비즈사업비2건', 2100000), null, '2,100,000'), true);
t('금액 일부만 쳐도 찾는다', ctx.erpLedgerHit(r('비즈사업비2건', 2100000), null, '210'), true);
t('찾는 금액 두 꼴을 모두 넣어 둔다',
  /String\(amt\), amt\.toLocaleString\(\)\]\.join\(' '\)/.test(src), true);
t('안 맞으면 안 찾힌다', ctx.erpLedgerHit(r('노리시스템(주)', 330000), null, '신흥'), false);
t('빈 글자면 모두 맞는 것으로 본다 (아무것도 감추지 않는다)',
  ctx.erpLedgerHit(r('노리시스템(주)', 330000), null, ''), true);
t('앞뒤 공백은 무시한다', ctx.erpLedgerHit(r('노리시스템(주)', 330000), null, '  노리  '), true);
t('빈 줄도 안 터진다', ctx.erpLedgerHit(null, null, '노리'), false);

console.log('\n[⑦ Enter 로 다음 짝으로 — 엑셀 찾기와 같다]');
const rows = [r('노리시스템', 1), r('신흥기업', 2), r('노리시스템', 3), r('중원공영', 4)];
t('맞는 줄의 자리를 모은다', ctx.erpHitIdx(rows, null, '노리'), [0, 2]);
t('다음 짝으로', ctx.erpNextHit([0, 2], 0), 2);
t('마지막을 지나면 처음으로 돈다', ctx.erpNextHit([0, 2], 2), 0);
t('아직 아무 줄도 안 골랐으면 첫 짝으로', ctx.erpNextHit([0, 2], -1), 0);
t('맞는 줄이 없으면 커서를 옮기지 않는다', ctx.erpNextHit([], 3), -1);

console.log('\n[⑧ 화면 쪽 — 잃으면 안 되는 것]');
/* ★ 정렬로 바꿀 때 세운 규칙과 같다: 찾기는 줄을 «감추지 않는다».
   감추면 안 보이는 줄이 조용히 확정될 수 있다. */
t('찾기가 목록을 거르지 않는다',
  /incList\s*=\s*incList\.filter\([\s\S]{0,120}?erpLedgerHit/.test(src), false);
t('맞은 줄은 칠하기만 한다', /var _hit=!!\(ldQ && ldHitSet\[_ri\]\)/.test(src), true);
t('커서가 선 줄은 테두리로 알린다', /_cur\?\{outline:'2px solid #2563eb'/.test(src), true);
t('커서 줄은 화면 안으로 따라 구른다 (안 보이는 줄을 확정하면 안 된다)',
  /data-ldrow="' \+ ldCur \+ '"[\s\S]{0,120}?scrollIntoView/.test(src), true);
t('아직 안 그린 줄로는 커서가 못 간다',
  /var n = Math\.min\(incList\.length, ldShow\);/.test(src), true);
t('마우스로 짚은 줄에서 자판으로 이어 간다', /setLdCur\(_ri\);/.test(src), true);

console.log('\n[⑨ Enter 는 「처리」 칸 단추와 같은 판단을 쓴다]');
/* 두 길이 다르면 눈으로 본 것과 손으로 한 것이 어긋난다 */
const ACT = grab('function ldActOn(row){', '/* ══════ 자판 ══════');
t('ldActOn 구역을 잘라냈다', ACT.length > 200 && ACT.length < 1600, true);
t('초록이고 업체가 하나일 때만 바로 확정', /_s\.state === 'ready' && _g\.length === 1/.test(ACT), true);
t('노랑은 확인 창을 연다', /_s\.state === 'check'[\s\S]{0,60}?setOpenRow\(row\._k\)/.test(ACT), true);
t('CMS 줄은 CMS 창으로 (업체 후보로 확정하면 남의 돈이 된다)',
  /isCmsMemo\[row\._k\][\s\S]{0,40}?setCmsRow\(row\)/.test(ACT), true);
t('후보가 없으면 찾기 창', /openFindRow\(row\)/.test(ACT), true);
t('줄이 빠졌는지를 돌려준다 (커서를 어디로 옮길지가 여기 달렸다)',
  /confirmRow\(row, p, \{ feeAmount:_s\.fee \|\| 0 \}\);\s*\n\s*return true;/.test(ACT), true);

console.log('\n[⑩ 되돌리기]');
const UNDO = grab('function undoLast(){', '/* ══════ Enter 한 번이 하는 일 ══════');
t('undoLast 구역을 잘라냈다', UNDO.length > 400 && UNDO.length < 2200, true);
t('★ 장부만 물리지 않고 줄까지 목록에 도로 넣는다 (안 그러면 다시 처리할 길이 없다)',
  /arr\.splice\(at, 0, lastAct\.row\)/.test(UNDO), true);
t('있던 자리에 도로 꽂는다 (끝에 붙이면 날짜 순서가 흐트러진다)',
  /var at = \(lastAct\.pos >= 0/.test(UNDO), true);
t('두 번 넣지 않는다', /arr\.some\(function\(x\)\{ return x && x\._k === lastAct\.row\._k; \}\)/.test(UNDO), true);
t('처리됨 표시도 지운다 (다음에 파일을 올려도 「이미 처리」로 숨지 않게)',
  /erpUnmarkBankRow\(lastAct\.row\)/.test(UNDO), true);
t('보류는 보류 되돌리기로 무른다', /lastAct\.kind === 'hold'[\s\S]{0,60}?unholdRow/.test(UNDO), true);
t('기록을 못 찾으면 알린다 (조용히 삼키지 않는다)', /되돌릴 기록을 찾지 못했습니다/.test(UNDO), true);

console.log('\n[⑪ 되돌리기는 한 곳에서만 — 두 길이 다른 일을 하면 안 된다]');
/* Ctrl+Z 와 「확정 이력」의 되돌리기가 같은 함수를 써야, 되돌린 뒤의 장부가 하나다 */
/* 못 박는 것은 «같은 함수를 쓴다» 이다 — 돌려주는지까지 글자로 박으면 멀쩡한 손질에도 깨진다
   (2026-09-03: 되돌리기 실패를 삼키지 않도록 return 을 붙였더니 깨졌다) */
t('확정 이력의 되돌리기도 같은 함수를 쓴다',
  /function undoConfirm\(fi\)\{[^}]*erpUndoIncome\(fi\)/.test(src), true);
t('되돌리기 본체는 하나뿐이다',
  (src.match(/rollback\.retainerPaid=false/g) || []).length, 1);
t('무른 표시를 남긴다 (지우지 않는다)', /undoneDate:new Date\(\)\.toISOString\(\)/.test(src), true);

console.log('\n[⑫ 되돌릴 손잡이 — 방금 만든 그 한 건을 문다]');
/* 목록에서 나중에 뒤지면 같은 금액 다른 건을 물 수 있다 */
t('확정 기록의 열쇠를 먼저 지어 둔다', /var _fiId = 'fi-'\+Date\.now\(\)/.test(src), true);
/* 저장하는 «함수 이름» 이 아니라 «미리 지은 열쇠를 그대로 쓴다» 를 본다 */
t('그 열쇠로 저장한다',
  /(dbUpsert\('finance_income',\s*|erpUpsertIncome\(\s*)\{id:_fiId,/.test(src), true);
t('자문료도 열쇠를 돌려준다 (안 돌려주면 자문료는 되돌릴 수 없다)',
  /if\(isAdv\) return _fiId;/.test(src), true);
t('마지막에도 열쇠를 돌려준다', /return _fiId;\s*\/\/ 되돌리기가 잡을 손잡이/.test(src), true);
t('확정하면 방금 한 일을 적어 둔다', /setLastAct\(\{ kind:'confirm', fid:_fid/.test(src), true);
t('보류도 적어 둔다', /setLastAct\(\{ kind:'hold', row:row/.test(src), true);

console.log('\n[⑬ 「/」 를 전체 검색에 빼앗기지 않는다]');
/* 전체 검색이 document 에서 「/」 를 가로챈다 — 그보다 먼저 잡아 멈춰 세워야 한다 */
t('window 의 잡는 단계에 붙인다',
  /window\.addEventListener\('keydown', onKey, true\)/.test(src), true);
t('치우는 것도 잡는 단계로 (안 그러면 화면을 떠나도 계속 듣는다)',
  /window\.removeEventListener\('keydown', onKey, true\)/.test(src), true);
t('우리가 처리한 키는 더 퍼지지 않게 막는다', /e\.preventDefault\(\); e\.stopPropagation\(\);/.test(src), true);

console.log('\n[⑭ 자판이 있다는 것을 알린다]');
/* 단축키는 «있는 줄 모르면 없는 것과 같다» */
t('표 아래에 자판 안내 띠가 있다', /'⌨ 자판'/.test(src), true);
['↑ ↓', 'Enter', 'Space', 'H', 'F', '/', 'Ctrl\\+Z', 'Esc'].forEach(function(k){
  t('안내에 ' + k.replace('\\', '') + ' 가 있다', new RegExp("\\['" + k + "','").test(src), true);
});

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===\n');
process.exit(fail ? 1 : 0);
