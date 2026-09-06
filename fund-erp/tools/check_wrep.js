/* 참여사업장의 «근로자 대표» — 자료·화면·서식이 한 사람을 가리키나.

   한 사업장에 사람이 셋 나오고, 셋이 «다 다른 사람»인 경우가 많다:
     대표자(사업주) · 담당자(실무 연락) · 근로자대표(노사 합의에 서명하는 사람)

   ⚠ 별지 제7호 첨부서류 2번이 「기금법인 설립준비위원의 재직증명서나 그 밖에 신분을
     증명하는 서류(근로계약서 등 소속 근로자임을 증명하는 서류)」를 요구한다 —
     근로자대표가 «그 사업장 근로자가 맞는지»를 서류로 확인해 둬야 한다.

   ⚠ 재직증명서는 «해»가 아니라 «사람»에 붙는다. 지원금 제출서류(연도별)에 두면
     해가 바뀔 때마다 없는 서류가 되고, 사람이 바뀌어도 옛 서류가 남는다.

   ⚠ 저장이 update 가 아니라 set 으로 바뀌거나, 고칠 칸 목록에 wrep_doc 이 끼면
     사업장을 저장할 때마다 재직증명서 연결이 조용히 사라진다.

   실행: node fund-erp/tools/check_wrep.js */
const fs = require('fs'), path = require('path');
const W = path.resolve(__dirname, '..', '..');
const src = fs.readFileSync(path.join(W, 'fund.html'), 'utf8');
let JSDOM = null;
/* jsdom 이 없는 곳에서 이 한 줄이 저장소의 «모든 앱» 배포를 막지 않게 한다 */
try { JSDOM = require('jsdom').JSDOM; } catch (e) { JSDOM = null; }

let bad = 0;
const ok = (n, c, w) => { if (c) console.log('  · ' + n); else { bad++; console.log('  ✗ ' + n + (w ? '  — ' + w : '')); } };
function gF(n){const i=src.indexOf('function '+n+'(');if(i<0)throw Error('없음 '+n);let d=0;
  for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}}

global.esc = v => String(v==null?'':v).replace(/[&<>"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));
global.num = v => (v==null||v===''?'':Math.round(Number(String(v).replace(/[^0-9.-]/g,''))||0));
(0, eval)(gF('_siteWrep'));
(0, eval)(gF('_wrepDocRow'));

const SITE = { _id:'S1', name:'가나기계(주)', ceo:'홍길동', biz_no:'000-00-00000',
  contacts:[{name:'이담당', mobile:'010-0000-0000', isPrimary:true}],
  wrep_name:'박노측', wrep_title:'생산1팀 대리', wrep_mobile:'010-1111-1111', wrep_birth:'1980-01-01',
  wrep_doc:{ owner:'U1', year:'2026', id:'PH-1', at:'2026-09-06' } };

console.log('■ 사람 셋을 «따로» 둔다');
const wf = src.match(/var WREP_FIELDS=\[[\s\S]*?\];/);
ok('근로자대표 칸이 따로 있다', !!wf);
const wkeys = wf ? (wf[0].match(/'(wrep_\w+)'/g) || []).map(x => x.slice(1, -1)) : [];
ok('성명·직위·연락처를 받는다', ['wrep_name','wrep_title','wrep_mobile'].every(k => wkeys.includes(k)), wkeys.join(','));
/* 별지 제7호 위원 격자가 «생년월일»을 묻는다 — 신분을 가리려면 받아 둬야 한다 */
ok('생년월일도 받는다 (별지 제7호 위원 격자가 묻는다)', wkeys.includes('wrep_birth'), wkeys.join(','));
const sf = src.match(/var SITE_FIELDS=\[[\s\S]*?\];/);
/* SITE_FIELDS 는 엑셀 일괄 가져오기의 «열 차례»이기도 하다 — 사람 칸을 끼우면
   이미 만들어 둔 붙여넣기 자료가 통째로 한 칸씩 밀린다 */
ok('사업장 칸 목록에 «안» 섞는다 (엑셀 열 차례가 안 흔들린다)',
   !!sf && !/wrep_/.test(sf[0]), '엑셀 붙여넣기 열이 밀린다');
const w = _siteWrep(SITE);
ok('한 곳에서 읽는다 (_siteWrep)', w.name === '박노측' && w.title === '생산1팀 대리' && !!w.doc, JSON.stringify(w));
ok('빈 사업장에도 안 터진다', (function(){ try { const e = _siteWrep(null); return e.name === '' && !e.doc; } catch (x) { return false; } })());

console.log('\n■ 편집 화면');
const es = gF('editSite');
ok('근로자대표 칸을 그린다', /WREP_FIELDS\.map/.test(es), es.slice(0, 200));
ok('담당자와 «다른 이름»으로 그린다 (sw- / sc-)', /id="sw-'/.test(es) && /id="sc-'/.test(es));
ok('재직증명서 줄을 붙인다', /_wrepDocRow\(sid,s\)/.test(es));

console.log('\n■ 재직증명서 — 이어 두면 볼 수 있나');
if (!JSDOM) {
  console.log('SKIP: jsdom 이 없어 «그린 줄» 확인은 건너뜁니다 (npm i jsdom --no-save)');
} else {
  const doc = new JSDOM('<body><div id=x></div>').window.document;
  const put = (h) => { doc.getElementById('x').innerHTML = h; return doc.getElementById('x'); };
  const on = put(_wrepDocRow('S1', SITE));
  const btns = [].slice.call(on.querySelectorAll('button')).map(b => b.getAttribute('onclick') || '');
  ok('이어 두면 [보기]가 있다', btns.some(x => /openWrepDoc\('S1'\)/.test(x)), btns.join(' | '));
  ok('바꿀 수 있다', btns.some(x => /pickWrepDoc\('S1'\)/.test(x)), btns.join(' | '));
  ok('연결을 끊을 수 있다', btns.some(x => /unlinkWrepDoc\('S1'\)/.test(x)), btns.join(' | '));
  ok('언제 이었는지 보인다', /2026-09-06/.test(on.textContent), on.textContent);

  const off = put(_wrepDocRow('S1', Object.assign({}, SITE, { wrep_doc: null })));
  const b2 = [].slice.call(off.querySelectorAll('button')).map(b => b.getAttribute('onclick') || '');
  ok('없으면 「없음」이라 말한다', /없음/.test(off.textContent), off.textContent);
  ok('없으면 [보기]를 안 준다 (누를 것이 없다)', !b2.some(x => /openWrepDoc/.test(x)), b2.join(' | '));
  ok('없으면 고르는 단추만 준다', b2.some(x => /pickWrepDoc/.test(x)), b2.join(' | '));

  /* 새 사업장은 아직 이을 자리(사업장 열쇠)가 없다 — 조용히 안 되는 단추를 주면 안 된다 */
  const nw = put(_wrepDocRow('', {}));
  ok('새 사업장에는 «저장한 뒤»라고 말해 준다', /저장한 뒤/.test(nw.textContent), nw.textContent);
  ok('새 사업장에는 단추를 안 준다', nw.querySelectorAll('button').length === 0);
}

console.log('\n■ 저장해도 연결이 살아남나');
const ss = gF('saveSite');
ok('근로자대표를 담는다', /WREP_FIELDS\.forEach/.test(ss));
ok('고칠 때도 담는다', /SITE_FIELDS\.concat\(WREP_FIELDS\)/.test(ss), ss.slice(0, 300));
/* set(전체 덮어쓰기)으로 바꾸면 저장할 때마다 재직증명서 연결이 사라진다 */
ok('있는 사업장은 update 로 고친다', /sites\/'\+_fid\+'\/'\+sid\)\.update\(patch\)/.test(ss), ss.slice(-400));
ok('고칠 칸 목록에 wrep_doc 을 넣지 않는다 (연결이 안 지워진다)', !/patch\.wrep_doc|'wrep_doc'/.test(ss));

console.log('\n■ 재직증명서가 사는 자리');
const sw = gF('saveWrepDocRef');
ok('사업장 기록에 붙인다', /sites\/'\+fid\+'\/'\+sid\+'\/wrep_doc/.test(sw), sw.slice(0, 300));
/* 그쪽은 «그 해에 낸 서류»를 세는 자리다. 사람에 붙는 서류를 거기 두면
   해가 바뀔 때마다 없는 서류가 되고, 사람이 바뀌어도 옛 서류가 남는다. */
ok('연도별 제출서류 자리에 두지 않는다', !/subsidy_chk/.test(sw), sw);
ok('한 자리로 되돌려 준다 (하던 일을 잃지 않게)', /editSite\(sid\)/.test(sw));
const ap = gF('openAlbumPick');
ok('근로자대표 갈래에서는 sid 를 비운다', /sid:wrepSid\?'':\(sid\|\|''\)/.test(ap), ap.slice(0, 400));
ok('무엇을 고르는지 이름을 보여 준다', /재직증명서/.test(ap));
const use = src.slice(src.indexOf('if(_pick.shelf){'), src.indexOf('function _dataUrlToFile'));
const iW = use.indexOf('_pick.wrep'), iS = use.indexOf('_pick.sid');
/* 뒤에 오면 «연도별 제출서류» 자리에 먼저 걸려 엉뚱한 곳에 저장된다 */
ok('근로자대표 갈래가 제출서류 갈래보다 «먼저» 온다', iW >= 0 && iW < iS, iW + ' vs ' + iS);
ok('이름표가 있다', /wrep:'근로자대표 재직증명서'/.test(src));

console.log('\n■ 설립합의서 — 노사가 함께 선다');
if (!JSDOM) {
  console.log('SKIP: jsdom 이 없어 서식 확인은 건너뜁니다');
} else {
  global.S = { year: 2026 };
  global.hwpFormHTML = () => '';
  (0, eval)(gF('dgV')); (0, eval)(gF('dgWon')); (0, eval)(gF('dgToday'));
  (0, eval)(gF('_officersOf'));
  (0, eval)(gF('docBody'));
  const F = { name:'가나공동근로복지기금', chairman:'홍길동', fund_type:'공동', contribution_total:10000000 };
  const sites = [SITE, { name:'나다전자(주)', ceo:'최사장', biz_no:'111-11-11111', wrep_name:'김노측' }];
  const doc = new JSDOM('<body><div id=y></div>').window.document;
  doc.getElementById('y').innerHTML = docBody('agreement', F, sites);
  const tbls = [].slice.call(doc.querySelectorAll('table'));
  const t = tbls[tbls.length - 1];
  const head = [].slice.call(t.querySelectorAll('th')).map(x => (x.textContent || '').trim());
  const row1 = [].slice.call(t.querySelectorAll('tr')[1].children).map(x => (x.textContent || '').trim());
  console.log('   별첨 머리: ' + head.join(' | '));
  ok('별첨 명부에 근로자대표 칸이 있다', head.indexOf('근로자대표') >= 0, head.join('|'));
  ok('머리와 몸통의 칸 수가 같다', head.length === row1.length, head.length + ' vs ' + row1.length);
  const at = (n, r) => { const k = head.indexOf(n); return k < 0 ? '(칸 없음)' : r[k]; };
  ok('근로자대표 칸에 근로자대표', at('근로자대표', row1) === '박노측', at('근로자대표', row1));
  ok('대표자 칸에 대표자', at('대표자', row1) === '홍길동', at('대표자', row1));
  const row2 = [].slice.call(t.querySelectorAll('tr')[2].children).map(x => (x.textContent || '').trim());
  ok('둘째 줄도 제자리', at('근로자대표', row2) === '김노측' && at('대표자', row2) === '최사장',
     at('대표자', row2) + ' / ' + at('근로자대표', row2));
  /* 없는 사람을 지어내면 안 된다 — 빈 줄(＿)로 두어 사람이 채우게 한다 */
  const sites2 = [Object.assign({}, SITE, { wrep_name: '' })];
  doc.getElementById('y').innerHTML = docBody('agreement', F, sites2);
  const t2 = [].slice.call(doc.querySelectorAll('table')).pop();
  const r2 = [].slice.call(t2.querySelectorAll('tr')[1].children).map(x => (x.textContent || '').trim());
  ok('근로자대표가 없으면 «빈칸»으로 둔다 (지어내지 않는다)', /^[＿_]+$/.test(at('근로자대표', r2)), at('근로자대표', r2));
}

console.log(bad ? '\nFAILURES ' + bad : '\nALL PASS (근로자대표가 자료·화면·서식에서 한 사람을 가리킨다)');
process.exit(bad ? 1 : 0);
