/* 업무관리 ↔ 푸른이알피 연동 · 담당자 · 화면 편의 — 배선과 안전장치
   ⚠ 원래 임시 폴더에만 두었다가 한 번 날아갔다. 저장소에 둔다. */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const W = fs.readFileSync(process.argv[2] || path.join(ROOT, 'work.html'), 'utf8');
const P = fs.readFileSync(path.join(ROOT, 'pu-erp.html'), 'utf8');
const C = fs.readFileSync(path.join(ROOT, 'pu-cards.html'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
}
function grab(name) {
  const i = W.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('못 찾음: ' + name);
  let d = 0, st = false;
  for (let j = i; j < W.length; j++) {
    if (W[j] === '{') { d++; st = true; }
    else if (W[j] === '}') { d--; if (st && d === 0) return W.slice(i, j + 1); }
  }
  throw new Error('괄호 안 닫힘: ' + name);
}
const gvar = n => {
  const cand = [';$', '^\\];$', '^\\};$']
    .map(end => new RegExp('^var ' + n + '=[\\s\\S]*?' + end, 'm').exec(W))
    .filter(Boolean).map(m => m[0]).sort((a, b) => a.length - b.length);
  for (const s of cand) { try { new Function(s); return s; } catch (e) {} }
  throw new Error('못 읽음: ' + n);
};

/* ── 문법·안전 ── */
const blocks = W.match(/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/g) || [];
ok('인라인 스크립트가 한 덩어리', blocks.length === 1, blocks.length + '개');
blocks.forEach(function (b, i) {
  const js = b.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '');
  let e = null;
  try { new Function(js); } catch (err) { e = err.message; }
  ok('스크립트 문법이 맞다', !e, e);
});
ok('NUL 바이트가 없다', W.indexOf('\u0000') < 0);
ok('푸른이알피 마스터를 여기서 쓰지 않는다 (dbSet/dbPatch 호출 없음)',
  !/(?<![\w$.])db(?:Set|Patch|Get)\s*\(/.test(W.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')));

/* ── 관할(상대기관) — judgment 가 새 이름, jurisdiction 은 옛 이름 ── */
ok('푸른이알피는 관할을 judgment 에 담는다', P.indexOf('init.judgment || init.jurisdiction') > 0);
const CAND = grab('_peCandOf');
ok('두 이름을 모두 보되 새 이름이 먼저', CAND.indexOf('x.judgment||x.jurisdiction') > 0);
ok('기관·담당자·전화·이메일을 함께 가져온다',
  ['jur_org:', 'jur_ph:', 'jur_em:', 'officer:'].every(s => CAND.indexOf(s) > 0));
ok('관할 네 칸이 미러 대상',
  ['officer', 'jur_org', 'jur_ph', 'jur_em'].every(f => gvar('PE_MIRROR').indexOf("'" + f + "'") > 0));
ok('원본 상태(계약관리 등)도 읽는다', CAND.indexOf('pe_st:peStatus(x)') > 0
  && gvar('PE_MIRROR').indexOf("'pe_st'") > 0);
ok('원본 상태를 우리 상태에 덮어쓰지 않는다', !/(^|[^_\w])status:/.test(CAND));
ok('상태가 같으면 두 번 그리지 않는다', grab('peStChip').indexOf("v===(it.status||'진행중')") > 0);
ok('상대기관은 여기서 못 고친다 (원본은 푸른이알피)',
  grab('dOrgHTML').indexOf('<input') < 0);

/* ── 구분: 계약관리 이름에 맞춘다 ── */
ok('푸른이알피 메뉴가 계약관리', P.indexOf("text:'계약관리'") > 0);
ok('계약관리 건은 구분이 계약', gvar('PE_DEF').indexOf("'contract','계약'") > 0);
ok('옛 이름 업체는 계약으로 읽는다', gvar('KIND_ALIAS').indexOf("'업체':'계약'") > 0);
ok('배지도 계약으로 나온다', grab('catBadge').indexOf('catNorm(cat)') > 0);

/* ── 담당: 주담당·부담당을 함께 세운다 ── */
ok('차례는 푸른이알피 sortOrder 를 쓴다', grab('_normStaff').indexOf('u.sortOrder') > 0);
ok('내 업무에는 나를 뺀 나머지가 나온다', grab('rowHTML').indexOf("mgrLine(it,'other')") > 0);
/* 주담당·부담당 둘 다 제 열로 뺐다 — 기업명 옆에 붙여 두면 이름 길이에 따라
   줄이 들쭉날쭉해 세로로 훑을 수가 없다. 주담당 열은 평면일 때만 낸다
   (묶어 볼 때는 묶음 머리에 이미 있다). */
ok('팀 전체 주담당은 평면일 때 제 열에 그린다',
  /showMain\?'<td>'\+mgrCell\(/.test(grab('renderTeam'))
  && /var showMain=!!S\.teamFlat/.test(grab('renderTeam')));
ok('기업 칸에는 담당 이름을 더 안 붙인다 (열로 갔다)',
  grab('renderTeam').indexOf("mgrLine(it,'main'") < 0);
ok('부담당은 제 열에 그린다', grab('renderTeam').indexOf("colTD('team','sub',subCell(it))") > 0);
ok('주담당만 그리는 길이 실제로 있다', grab('mgrLine').indexOf("(mode==='main')?[]") > 0);
ok('혼자 하는 업무에는 빈 줄을 그리지 않는다', grab('mgrLine').indexOf("return h?") > 0);

/* ── 남의 건 가져오기 = 부담당으로 붙는다 ── */
const PULL = grab('pullOne');
ok('주담당은 바꾸지 않는다 (원본은 푸른이알피)', PULL.indexOf('mgr_main:{sid:mSid') > 0);
ok('참여 요청을 푸른이알피에도 넘긴다', PULL.indexOf('rec.pe_addsub=[me.sid') > 0);
ok('이미 있는 건이면 새로 만들지 않는다', PULL.indexOf("if(c._have){") > 0);
ok('이미 붙어 있으면 아무것도 쓰지 않는다', PULL.indexOf('openDrawer(it._id); return;') > 0);
/* 엔진은 MyDeskV2 밖으로 나가 top-level wsSyncRun 이 됐다(그 화면을 열어야만 돌던 것을
   앱 켤 때와 업무관리 신호에도 돌게 하려고). 주석 표시로 자르면 옮길 때마다 깨지므로
   함수 본문을 괄호로 잡는다. */
const ENG = (function () {
  const i = P.indexOf('function wsSyncRun(');
  if (i < 0) throw new Error('wsSyncRun 못 찾음');
  let d = 0, st = false;
  for (let j = i; j < P.length; j++) {
    if (P[j] === '{') { d++; st = true; }
    else if (P[j] === '}') { d--; if (st && !d) return P.slice(i, j + 1); }
  }
  throw new Error('wsSyncRun 끝 못 찾음');
})();
ok('엔진이 요청을 읽어 공동담당에 더한다',
  ENG.indexOf('Array.isArray(w.pe_addsub)') > 0
  && ENG.indexOf('dbPatch(t.store, t.id, { managerSubs:t.subs })') > 0);
ok('더하기만 한다 (사람을 빼지 않는다)', ENG.indexOf('curS.push(sd)') > 0);
ok('주담당을 부담당으로 또 넣지 않는다', ENG.indexOf('if(sd === pe.managerMain) return;') > 0);
ok('처리한 요청은 지운다', ENG.indexOf("/pe_addsub'] = null") > 0);
ok('기준선만 찍고 돌아가는 분기보다 앞에 둔다',
  ENG.indexOf('부담당 참여 요청') < ENG.indexOf("note:'기준선'"));

/* ── 기업정보함에서 담당자 찾기 ── */
ok('기업정보함 본문을 먼저 읽는다 (색인은 저장할 때만 갱신된다)',
  grab('cardLoad').indexOf("'pucards/items'") < grab('cardLoad').indexOf("'pucards/idx'"));
ok('기업정보함은 읽기만 한다', !/\.set\(|\.update\(|\.remove\(/.test(grab('cardLoad')));
ok('기업정보함 본문이 pucards/items 에 있다', C.indexOf("watchCardMap(this.db.ref(DB_ROOT+'/items')") > 0);
ok("'개인'으로 숨긴 사람은 내보내지 않는다", grab('_cardRow').indexOf("r.sc==='private'") > 0);
ok('사업자등록증은 사람이 아니라 뺀다', grab('_cardRow').indexOf("r.k==='biz'") > 0);
const CF = grab('cardFind');
ok('검색 전에는 남의 명함을 늘어놓지 않는다', CF.indexOf('if(!q) return;') > 0);
ok('회사 없는 명함은 기본으로 감춘다', CF.indexOf('if(!withNoCo) return;') > 0);
ok('비슷한 회사를 따로 낸다 (계열사 담당자가 함께 맡는다)',
  CF.indexOf('akin.push(r)') > 0 && grab('cardModal').indexOf('◐ 비슷한 회사') > 0);
ok('공용 메일로는 같은 회사로 묶지 않는다',
  gvar('MAIL_COMMON').indexOf("'naver.com'") > 0 && grab('mailDom').indexOf('MAIL_COMMON') > 0);
ok('두 글자 미만 이름으로는 묶지 않는다', grab('coAkin').indexOf('s.length>=2') > 0);
ok('다른 업무로 옮기면 회사 없는 명함 보기가 꺼진다',
  grab('cardModal').indexOf('if(S._cardFor!==id) S._cardNoCo=false;') > 0);

/* ── 한글 조합 중 Enter ── */
ok('조합 중인 Enter 를 가려낸다',
  grab('_ime').indexOf('isComposing') > 0 && grab('_ime').indexOf('229') > 0);
const raw = (W.match(/onkeydown="if\(event\.key===\\'Enter\\'/g) || []).length;
const safe = (W.match(/onkeydown="if\(event\.key===\\'Enter\\'&&!_ime\(event\)\)/g) || []).length;
ok('Enter 로 저장하는 칸이 모두 막혀 있다', raw > 0 && raw === safe, raw + '중 ' + safe);
ok('주간 기록·빠른 기록도 막혀 있다',
  grab('wkKey').indexOf('if(_ime(e)) return;') > 0 && grab('qbKey').indexOf('if(_ime(e)) return;') > 0);

/* ── 주간 칸을 요일로 ── */
ok('요일마다 그 날짜를 달고 있다', grab('wkCellHTML').indexOf('data-d="\'+d+\'"') > 0);
ok('주말은 기록이 있을 때만 낸다', grab('wkDays').indexOf('if(we){') > 0);
ok('위아래는 같은 요일을 지킨다', grab('wkMove').indexOf(".wkin[data-c=") > 0);
ok('좌우는 빈 칸에서만 요일을 옮긴다',
  grab('wkKey').indexOf("(e.key==='ArrowLeft'||e.key==='ArrowRight')&&!inp.value") > 0);

/* ── 화면 넓게 쓰기 ── */
ok('빽빽하게·메뉴 접기를 이 컴퓨터에 기억한다', grab('viewPref').indexOf('VIEW_KEY') > 0);
ok('접었을 때 다시 펼 손잡이가 남는다',
  W.indexOf('id="sideOn"') > 0 && /body\.nos #sideOn\{display:block\}/.test(W));
ok('두 화면 머리에 칩이 붙어 있다',
  grab('renderMy').indexOf('viewChips()') > 0 && grab('renderTeam').indexOf('viewChips()') > 0);

/* ── 설명은 ⓘ 팝업 (안내문을 화면에 깔지 않는다) ── */
ok('설명은 HELP 한 곳에 모아 둔다', ['steps', 'people', 'org', 'mgr', 'kb', 'note']
  .every(k => W.indexOf("hlp('" + k + "')") > 0));
ok('상자마다 깔려 있던 안내문이 사라졌다',
  ['업체 담당자와 다르면 여기에 적습니다', '부담당도 이 업무의 기록을 씁니다']
    .every(s => W.indexOf(s) < 0));
ok('오류·주의 안내는 화면에 그대로 둔다', W.indexOf('업무 칸이 비어') > 0);

/* ── 종료 즉시 반영 — 되돌아가면 안 되는 세 가지 ──
   엔진을 MyDeskV2 밖으로 빼고, 업무관리가 찍는 신호로 곧바로 돌게 했다.
   아래 셋은 어기면 조용히 망가진다 — 화면만 보아서는 알 수 없다. */

// ① 신호는 종료 저장과 따로 보낸다. 한 묶음이면 이 자리 쓰기가 규칙에 막히는
//    순간 묶음 전체가 실패해 종료 자체가 안 된다.
ok('종료 저장 묶음에 신호를 섞지 않는다',
  !/up\[NS\s*\+\s*'\/sync_ping'\]/.test(W)
  && /fbDb\.ref\(NS\s*\+\s*'\/sync_ping'\)\.set\(/.test(W));
ok('신호가 실패해도 종료는 살아 있다 (조용히 넘긴다)',
  /sync_ping'\)\.set\(\{at:Date\.now\(\),itemId:id\}\)\.catch\(function\(\)\{\}\)/.test(W));

// ② 엔진은 work_erp/items 에도 쓴다. items 를 들으면 제가 쓴 걸 제가 듣고 끝없이 돈다.
ok('푸른이알피는 items 가 아니라 sync_ping 만 지켜본다',
  P.indexOf("fbDb.ref('work_erp/sync_ping')") > 0
  && !/fbDb\.ref\('work_erp\/items'\)\.on\(/.test(P));
ok('엔진이 items 에 쓰는 것은 그대로다 (되먹임을 막아야 하는 이유)',
  ENG.indexOf("up['work_erp/items/'") > 0);

// ③ 신호가 연달아 와도 엔진이 겹쳐 돌면 같은 것을 두 번 쓴다.
ok('엔진에 겹침 방지 자물쇠가 있다',
  /var _wsBusy = false;/.test(P) && ENG.indexOf('if(_wsBusy)') > 0
  && ENG.indexOf('_wsBusy = true;') > 0);
ok('어느 길로 끝나도 자물쇠를 푼다', (ENG.match(/fin\(\)/g) || []).length >= 4);

console.log('\n' + (fail ? 'FAILED ' + fail + '/' + (pass + fail) : 'ALL ' + pass + ' PASS'));
process.exit(fail ? 1 : 0);
