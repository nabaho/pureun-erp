/* 참여사업장 명부 — 머리와 몸통의 칸이 «같은 차례»로 서 있나.

   「협력」 체크를 가운데에서 맨 앞(번호 왼쪽)으로 옮겼다. 머리와 몸통을 따로 적는
   구조라, 한쪽만 옮기면 값이 통째로 한 칸씩 밀린다 — 사업자번호 자리에 업종이 오는 식이다.
   눈으로는 잘 안 보이고, 엑셀로 내보내야 드러난다.

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

/* 명부 한 줄을 만드는 조각을 그대로 떠 온다 — 함수가 아니라 map 안에 있어 조각으로 판다 */
const i = src.indexOf('협력 체크를 «맨 앞»에 둔다');
if (i < 0) { console.log('  ✗ 그 자리를 못 찾음'); process.exit(1); }
const from = src.indexOf("return '<tr onclick", i);
const to = src.indexOf("</tr>';", from);
const rowSrc = src.slice(from, to + 7).replace(/^return /, 'globalThis.__row = ');

/* 그리는 데 필요한 것만 채워 넣는다 */
/* (0,eval) 은 «전역»에서 돌아 지역 변수를 못 본다 — 조각이 쓰는 이름을 전역에 둔다 */
global.s = { _id:'S1', name:'가나기계(주)', ceo:'홍길동', biz_no:'000-00-00000',
             biz_type:'제조(시험)', partner:true, address:'어딘가 1' };
global.c = { email:'x@example.com' };
global.i = 0; global.bar = ''; global.emp = 12; global.contact = '이담당 · 010-0000-0000';
global.esc = v => String(v==null?'':v).replace(/[&<>"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));
(0, eval)(rowSrc);
const __row = global.__row;

const d = document.createElement('div');
d.innerHTML = '<table><tbody>' + __row + '</tbody></table>';
const tds = [].slice.call(d.querySelectorAll('td'));

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

console.log('\n■ 체크를 눌러도 줄이 안 열린다');
/* 줄 전체가 editSite 를 부르므로, 체크 칸은 눌림이 위로 안 가게 막아야 한다 */
ok('체크 칸이 눌림을 막는다', /stopPropagation/.test(tds[0].getAttribute('onclick') || ''),
   tds[0].getAttribute('onclick'));

console.log(bad ? '\nFAILURES ' + bad : '\nALL PASS (명부 칸이 제자리)');
process.exit(bad ? 1 : 0);
