/* 기금 목록 — 묶음(충남·경기…)마다 열이 같은 자리에 오나.

   묶음마다 «표를 따로» 만들기 때문에, 폭을 안 정해 두면 표가 저마다 제 내용에 맞춰
   칸을 잡는다. 그러면 충남 12개와 경기 4개가 위아래로 놓였을 때 열이 어긋나
   한 목록으로 보이지 않는다 — 눈으로 훑어 내려가다 자리를 잃는다.

   ⚠ 폭은 <colgroup> 이 아니라 «머리 칸»에 준다. 좁은 화면에서 .mo·.ph 는
     display:none 으로 접히는데, <col> 은 그대로 남아 접힌 칸의 폭까지 차지한다.

   실행: node fund-erp/tools/check_cols.js */
const fs = require('fs'), path = require('path');
const W = path.resolve(__dirname, '..', '..');
const src = fs.readFileSync(path.join(W, 'fund.html'), 'utf8');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><body></body>');
global.window = dom.window; global.document = dom.window.document;
function gF(n){const i=src.indexOf('function '+n+'(');if(i<0)throw Error('없음 '+n);let d=0;
  for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}}
global.esc = s => String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
global.fundRow = () => '<tr><td>x</td></tr>';   // 몸통은 여기서 볼 것이 아니다
(0, eval)([gF('_headHTML'), gF('fundTable')].join('\n'));

let bad = 0;
const ok = (n, c, w) => { if (c) console.log('  · ' + n); else { bad++; console.log('  ✗ ' + n + (w ? '  — ' + w : '')); } };

const heads = html => {
  const d = document.createElement('div'); d.innerHTML = html;
  return [].slice.call(d.querySelectorAll('thead th')).map(th => ({
    name: (th.textContent||'').trim(),
    cls: th.getAttribute('class') || '',
    w: (th.getAttribute('style')||'').replace(/^width:/, '') || '(남는 자리)',
  }));
};

/* 지역기금은 전부 공동이라 두 묶음의 칸 목록이 같아야 한다 */
const 충남 = heads(fundTable([{ fund_type:'공동' }], false, ''));
const 경기 = heads(fundTable([{ fund_type:'공동' }], false, ''));

console.log('■ 묶음 사이에 열이 맞나');
ok('칸 수가 같다', 충남.length === 경기.length, 충남.length + ' vs ' + 경기.length);
ok('칸 이름이 같은 차례', 충남.map(c=>c.name).join('|') === 경기.map(c=>c.name).join('|'),
   충남.map(c=>c.name).join('|'));
ok('칸 폭이 같다', 충남.map(c=>c.w).join('|') === 경기.map(c=>c.w).join('|'),
   충남.map(c=>c.name+':'+c.w).join(' '));

console.log('\n■ 폭이 정말 못 박혔나');
console.log('   ' + 충남.map(c => c.name + ' ' + c.w).join(' · '));
ok('표가 고정 폭이다', /table\.fixcol\{table-layout:fixed\}/.test(src));
ok('기금명만 남는 자리를 가져간다',
   충남.filter(c => c.w === '(남는 자리)').map(c=>c.name).join() === '기금명',
   충남.filter(c => c.w === '(남는 자리)').map(c=>c.name).join());
ok('나머지는 모두 픽셀로 정해졌다',
   충남.filter(c => c.name !== '기금명').every(c => /px$/.test(c.w)),
   충남.map(c=>c.name+':'+c.w).join(' '));

console.log('\n■ 좁은 화면에서 접히는 칸');
/* 접히는 칸에 폭을 colgroup 으로 주면 접혀도 자리가 남는다 — 머리 칸에 줘야 함께 사라진다 */
/* 파일 안 다른 표에는 colgroup 이 있다(서식 변환본 등) — «이 표»만 본다 */
ok('폭을 머리 칸에 준다 (colgroup 아님)',
  !/<colgroup/.test(fundTable([{ fund_type:'공동' }], false, ''))
  && /style="width:/.test(fundTable([{ fund_type:'공동' }], false, '')));
ok('부담당·대표자는 접히는 칸(mo)', 충남.filter(c=>c.cls==='mo').map(c=>c.name).join() === '부담당,대표자',
   충남.filter(c=>c.cls==='mo').map(c=>c.name).join());
ok('정보·분류는 더 좁을 때 접힌다(ph)', 충남.filter(c=>/ph/.test(c.cls)).map(c=>c.name).join() === '정보,분류',
   충남.filter(c=>/ph/.test(c.cls)).map(c=>c.name).join());

console.log('\n■ 칸 수가 달라지는 경우');
/* 사내기금만 있는 묶음에는 「분류」 칸을 안 세운다 — 머리와 몸통이 어긋나지 않게 */
const 사내 = heads(fundTable([{ fund_type:'사내' }], false, ''));
ok('사내만 있으면 분류 칸이 없다', 사내.map(c=>c.name).indexOf('분류') < 0, 사내.map(c=>c.name).join('|'));
const 설립중 = heads(fundTable([{ fund_type:'공동' }], false, 'setup'));
ok('설립중에는 삭제 칸이 붙는다', 설립중[설립중.length-1].name === '삭제', 설립중.map(c=>c.name).join('|'));

console.log(bad ? '\nFAILURES ' + bad : '\nALL PASS (묶음 사이 열이 맞는다)');
process.exit(bad ? 1 : 0);
