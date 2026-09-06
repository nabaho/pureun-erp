/* 참여사업장 명부 — 머리와 몸통의 칸이 «같은 차례»로 서 있나,
   그리고 «사람 셋»(대표자·담당자·근로자대표)이 제자리에 있나.

   ① 「협력」 체크를 가운데에서 맨 앞(번호 왼쪽)으로 옮겼다. 머리와 몸통을 따로 적는
      구조라, 한쪽만 옮기면 값이 통째로 한 칸씩 밀린다 — 사업자번호 자리에 업종이 오는 식이다.
      눈으로는 잘 안 보이고, 엑셀로 내보내야 드러난다.

   ② 한 사업장에 사람이 셋 나오고 «다 다른 사람»인 경우가 많다:
      대표자(사업주) · 담당자(실무) · 근로자대표(노사 합의에 서명).
      근로자대표는 별지 제7호 첨부서류 2번(재직증명서)으로 소속을 확인해야 하므로,
      명부에서 «확인됐는지»가 바로 보여야 한다.

   ⚠ 줄 만드는 코드를 조각으로 파서 «그대로» 돌린다. 흉내 내어 다시 쓰면
     화면이 바뀌어도 검사는 옛 모양을 통과시킨다.

   실행: node fund-erp/tools/check_siterow.js */
const fs = require('fs'), path = require('path');
const W = path.resolve(__dirname, '..', '..');
const src = fs.readFileSync(path.join(W, 'fund.html'), 'utf8');
/* ⚠ jsdom 은 이 저장소에 «안 깔려 있다». 없으면 SKIP 이라 말하고 넘어간다 —
     check_forms.js·check_backup.js 가 쓰는 그 관례다. 그냥 require 하면
     검사가 죽고, 「열이 어긋났다」가 아니라 «검사기가 없다»는 뜻인데도
     main 이 통째로 빨강이 된다(2026-09-06 에 실제로 그랬다).
     설치: npm i jsdom --no-save */
let JSDOM;
try { JSDOM = require('jsdom').JSDOM; }
catch (e) {
  console.log('SKIP: jsdom 이 없어 참여사업장 명부 칸 검사를 건너뜁니다 (npm i jsdom --no-save)');
  process.exit(0);
}
const dom = new JSDOM('<!doctype html><body></body>');
global.window = dom.window; global.document = dom.window.document;

let bad = 0;
const ok = (n, c, w) => { if (c) console.log('  · ' + n); else { bad++; console.log('  ✗ ' + n + (w ? '  — ' + w : '')); } };
function gF(n){const i=src.indexOf('function '+n+'(');if(i<0)throw Error('없음 '+n);let d=0;
  for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}}

/* ── 줄 하나를 만드는 «그 코드»를 통째로 떠 온다 (map 안이라 조각으로 판다) ── */
const from = src.indexOf('var rows=arr.map(function(s,i){');
if (from < 0) { console.log('  ✗ 명부 줄 만드는 자리를 못 찾음\n\nFAILURES 1'); process.exit(1); }
let d0 = 0, end = -1;
for (let k = src.indexOf('{', from + 20); k < src.length; k++) {
  if (src[k] === '{') d0++; else if (src[k] === '}') { d0--; if (!d0) { end = k; break; } }
}
const body = src.slice(src.indexOf('{', from + 20) + 1, end);

/* 그리는 데 필요한 것만 채워 넣는다 — 값 만드는 부분은 «진짜 함수»를 쓴다 */
global.esc = v => String(v==null?'':v).replace(/[&<>"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));
global.num = v => (v==null||v===''?'':Math.round(Number(String(v).replace(/[^0-9.-]/g,''))||0));
(0, eval)(gF('_siteContacts'));
(0, eval)(gF('_siteWrep'));
global.maxEmp = 20;
const makeRow = new Function('s', 'i', body);

const SITE = { _id:'S1', name:'가나기계(주)', ceo:'홍길동', biz_no:'000-00-00000',
  biz_type:'제조(시험)', partner:true, address:'어딘가 1', company_size:12,
  contacts:[{name:'이담당', mobile:'010-0000-0000', email:'x@example.com', isPrimary:true}],
  /* 사람 셋이 «다 다르다» — 이래야 자리가 섞였을 때 드러난다 */
  wrep_name:'박노측', wrep_title:'생산1팀 대리', wrep_mobile:'010-1111-1111',
  wrep_doc:{ owner:'U1', year:'2026', id:'PH-1', at:'2026-09-06' } };

const draw = (s) => { const dv = document.createElement('div');
  dv.innerHTML = '<table><tbody>' + makeRow(s, 0) + '</tbody></table>';
  return [].slice.call(dv.querySelectorAll('td')); };
const tds = draw(SITE);

/* 머리는 소스에서 읽는다 */
const hi = src.indexOf('<th title="별지15호 ⑩ 협력업체');
const hline = src.slice(src.lastIndexOf('\n', hi) + 1, src.indexOf('\n', hi));
const ths = (hline.match(/<th[^>]*>([^<]*)/g) || []).map(x => x.replace(/<th[^>]*>/, '').trim()).filter(Boolean);

console.log('■ 칸 차례');
console.log('   머리: ' + ths.join(' | '));
ok('협력이 맨 앞', ths[0] === '협력', ths[0]);
ok('그 다음이 번호', ths[1] === '번호', ths[1]);
ok('머리와 몸통의 칸 수가 같다', ths.length === tds.length, ths.length + ' vs ' + tds.length);

console.log('\n■ 값이 제자리에 있나');
const cell = n => { const k = ths.indexOf(n); return k < 0 ? '(칸 없음)' : (tds[k].textContent || '').trim(); };
ok('첫 칸이 체크상자', !!tds[0].querySelector('input[type=checkbox]'), tds[0].innerHTML.slice(0, 40));
ok('켜져 있으면 체크됨', tds[0].querySelector('input').hasAttribute('checked'));
ok('번호 = 1', cell('번호') === '1', cell('번호'));
ok('상호', cell('상호') === '가나기계(주)', cell('상호'));
ok('대표자', cell('대표자') === '홍길동', cell('대표자'));
ok('사업자번호', cell('사업자번호') === '000-00-00000', cell('사업자번호'));
ok('업종', cell('업종') === '제조(시험)', cell('업종'));
ok('상시근로자', cell('상시근로자') === '12', cell('상시근로자'));
ok('소재지', cell('소재지') === '어딘가 1', cell('소재지'));

console.log('\n■ 사람 셋이 «서로 다른 칸»에 선다');
ok('담당자 칸에 담당자', /이담당/.test(cell('담당자')), cell('담당자'));
ok('근로자대표 칸이 있다', ths.indexOf('근로자대표') >= 0, ths.join('|'));
ok('근로자대표 칸에 근로자대표', /박노측/.test(cell('근로자대표')), cell('근로자대표'));
ok('직위도 함께 보인다', /생산1팀 대리/.test(cell('근로자대표')), cell('근로자대표'));
/* 자리가 섞이면 여기서 드러난다 — 대표자·담당자가 근로자대표 칸에 오면 안 된다 */
ok('근로자대표 칸에 대표자가 안 온다', !/홍길동/.test(cell('근로자대표')), cell('근로자대표'));
ok('근로자대표 칸에 담당자가 안 온다', !/이담당/.test(cell('근로자대표')), cell('근로자대표'));
ok('담당자 칸에 근로자대표가 안 온다', !/박노측/.test(cell('담당자')), cell('담당자'));

console.log('\n■ 재직증명서로 «확인됐는지»가 보인다 (별지 제7호 첨부서류 2번)');
ok('이어 두면 「재직」이 뜬다', /재직/.test(cell('근로자대표')), cell('근로자대표'));
const noDoc = draw(Object.assign({}, SITE, { wrep_doc: null }));
const cell2 = n => { const k = ths.indexOf(n); return k < 0 ? '' : (noDoc[k].textContent || '').trim(); };
ok('없으면 「확인 필요」가 뜬다', /확인 필요/.test(cell2('근로자대표')), cell2('근로자대표'));
ok('없을 때 「재직」이라 하지 않는다', !/재직/.test(cell2('근로자대표')), cell2('근로자대표'));
const noRep = draw(Object.assign({}, SITE, { wrep_name:'', wrep_title:'', wrep_doc:null }));
const cell3 = n => { const k = ths.indexOf(n); return k < 0 ? '' : (noRep[k].textContent || '').trim(); };
ok('근로자대표가 없으면 조용하다 (없는 사람에게 확인을 요구하지 않는다)',
   cell3('근로자대표') === '—', cell3('근로자대표'));

console.log('\n■ 체크를 눌러도 줄이 안 열린다');
/* 줄 전체가 editSite 를 부르므로, 체크 칸은 눌림이 위로 안 가게 막아야 한다 */
ok('체크 칸이 눌림을 막는다', /stopPropagation/.test(tds[0].getAttribute('onclick') || ''),
   tds[0].getAttribute('onclick'));

console.log(bad ? '\nFAILURES ' + bad : '\nALL PASS (명부 칸이 제자리)');
process.exit(bad ? 1 : 0);
