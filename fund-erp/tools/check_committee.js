/* 설립준비위원회 위원 — 서식이 «한 곳»(임원 명부)을 보나, 그리고 참여사업장에서 당겨오나.

   별지 제7호는 「기금법인 설립준비위원회 위원」의 성명·생년월일·직책을 묻는다.
   앱에는 그 값을 담는 길이 둘로 갈라져 있었다:
     · 원본 .hwp 를 채우는 길(fillCommittee) — «임원 명부»를 읽었다
     · 자동생성본·회의록·엑셀 — worker_committee·emp_committee 를 읽었다
   그런데 뒤엣것은 앱 어디에서도 «쓰는 곳이 없는» 칸이었다. 그래서 위원 칸이 늘 비었다.
   한 곳(임원 명부)으로 모은다.

   ⚠ 감사는 위원이 아니라 따로 두는 기관이다.
   ⚠ 이사장은 명부의 역할이 그냥 「이사장」이라 노측인지 사측인지가 «자료에 없다» —
     한쪽에 밀어 넣으면 서식이 그럴듯하게 틀린 채로 관청에 간다. 빈칸으로 둔다.
   ⚠ 참여사업장에서 당겨올 때 «자동으로» 넣지 않는다. 사업장이 열다섯이어도 위원은
     노·사 각 1~3인이고, 누가 위원인지는 자료에 없다 — 사람이 고른다.

   실행: node fund-erp/tools/check_committee.js */
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
(0, eval)(gF('_officersOf'));
(0, eval)(gF('_prepCommittee'));
(0, eval)(gF('_siteWrep'));

const F = { name: '가나공동근로복지기금', chairman: '홍길동', fund_type: '공동',
  officers: [
    { role: '이사장', name: '홍길동' },
    { role: '근로자측 이사', name: '박노측', birth: '1980-01-01', title: '생산1팀 대리' },
    { role: '근로자측 이사', name: '김노측', birth: '1981-02-02', title: '품질팀 주임' },
    { role: '사용자측 이사', name: '최사측', birth: '1975-03-03', title: '대표이사' },
    { role: '근로자측 감사', name: '정감사', birth: '1979-04-04', title: '감사' },
    { role: '사용자측 감사', name: '오감사' },
    /* ⚠ 손으로 적은 역할은 「이사」와 「감사」가 한 줄에 같이 오기도 한다.
       이런 줄이 없으면 «감사를 빼는» 갈래를 되돌려도 검사가 못 잡는다(실제로 그랬다). */
    { role: '근로자측 이사 겸 감사', name: '한겸직', birth: '1977-05-05', title: '감사' },
  ] };

console.log('■ 위원을 «명부 한 곳»에서 읽는다');
const wk = _prepCommittee(F, '근로자측'), er = _prepCommittee(F, '사용자측');
ok('근로자측 위원만 고른다', wk.map(o => o.name).join(',') === '박노측,김노측', wk.map(o => o.name).join(','));
ok('「이사 겸 감사」는 위원에 안 넣는다', !wk.some(o => o.name === '한겸직'), wk.map(o => o.name).join(','));
ok('사용자측 위원만 고른다', er.map(o => o.name).join(',') === '최사측', er.map(o => o.name).join(','));
ok('감사는 위원이 아니다 (「이사 겸 감사」도 뺀다)',
   !wk.concat(er).some(o => /감사/.test(o.name)), wk.concat(er).map(o => o.name).join(','));
/* 이사장도 이사이므로 위원이 맞지만, 명부에 «측»이 없다 — 한쪽에 밀어 넣으면 틀린 서식이 나간다 */
ok('이사장은 측이 없어 넣지 않는다', !wk.concat(er).some(o => o.name === '홍길동'));
ok('서식 격자가 세 줄이라 셋까지만', _prepCommittee({ officers: Array.from({ length: 5 },
  (_, i) => ({ role: '근로자측 이사', name: '노' + i })) }, '근로자측').length === 3);
ok('명부가 없어도 안 터진다', (function () { try { return _prepCommittee({}, '근로자측').length === 0; } catch (e) { return false; } })());

console.log('\n■ 죽은 칸을 읽던 곳이 남아 있지 않다');
/* 그 두 칸은 앱 어디에서도 «쓰는 곳이 없다». 하나라도 남아 있으면 그 서식만 빈 채로 나간다. */
ok('worker_committee·emp_committee 를 읽는 곳이 없다',
   !/f\.worker_committee|f\.emp_committee/.test(src),
   (src.match(/f\.(worker|emp)_committee/g) || []).join(','));
ok('원본 .hwp 채우기도 같은 곳을 본다 (fillCommittee)', /_officersOf\(f\)/.test(gF('fillCommittee')));

if (!JSDOM) {
  console.log('SKIP: jsdom 이 없어 «그린 서식» 확인은 건너뜁니다 (npm i jsdom --no-save)');
} else {
  console.log('\n■ 별지 제7호 위원 격자가 «성명·생년월일·직책»을 채운다');
  global.S = { year: 2026 };
  global.num = (v) => (v == null || v === '' ? '' : Math.round(Number(String(v).replace(/[^0-9.-]/g, '')) || 0));
  global.hwpFormHTML = () => '';
  ['dgV', 'dgWon', 'dgToday', 'docBody'].forEach((n) => (0, eval)(gF(n)));
  const doc = new JSDOM('<body><div id=x></div>').window.document;
  doc.getElementById('x').innerHTML = docBody('inka', F, []);
  const tbls = [].slice.call(doc.querySelectorAll('table'));
  /* 위원 격자는 「구분 · 성명 · 생년월일 · 직책」 머리를 가진 표다 */
  const grid = tbls.filter((t) => /구\s*분/.test((t.querySelector('tr') || {}).textContent || '')
    && /생년월일/.test((t.querySelector('tr') || {}).textContent || ''))[0];
  ok('위원 격자를 찾는다', !!grid, tbls.map((t) => (t.querySelector('tr') || {}).textContent).join(' / '));
  if (grid) {
    const body = [].slice.call(grid.querySelectorAll('tr')).slice(1).map((tr) =>
      [].slice.call(tr.children).map((td) => (td.textContent || '').trim()));
    const flat = body.map((r) => r.join('|')).join('\n');
    ok('근로자측 위원 이름이 선다', /박노측/.test(flat) && /김노측/.test(flat), flat);
    ok('사용자측 위원 이름이 선다', /최사측/.test(flat), flat);
    ok('생년월일이 선다 (예전엔 늘 밑줄만 나갔다)', /1980-01-01/.test(flat), flat);
    ok('직책이 선다', /생산1팀 대리/.test(flat), flat);
    ok('감사는 격자에 없다', !/정감사|오감사/.test(flat), flat);
    ok('이사장은 격자에 없다', !/홍길동/.test(flat), flat);
    /* 없는 사람을 지어내면 안 된다 — 빈 줄은 밑줄로 둔다 */
    const bare = doc.getElementById('x');
    bare.innerHTML = docBody('inka', { name: '가나', fund_type: '공동', officers: [] }, []);
    const g2 = [].slice.call(bare.querySelectorAll('table')).filter((t) =>
      /생년월일/.test((t.querySelector('tr') || {}).textContent || ''))[0];
    ok('위원이 없으면 빈 줄(밑줄)로 둔다', !!g2 && /[＿_]/.test(g2.textContent), g2 && g2.textContent.slice(0, 80));
  }
}

console.log('\n■ 참여사업장에서 «골라» 당겨온다');
const pick = gF('openSitePeoplePick');
ok('참여사업장의 근로자대표를 후보로 세운다', /_siteWrep\(st\)/.test(pick), pick.slice(0, 400));
ok('참여사업장의 대표자도 후보로 세운다', /st\.ceo/.test(pick));
ok('어느 사업장 사람인지 보여 준다', /esc\(st\.name\|\|''\)/.test(pick));
/* ⚠ 자동으로 넣으면 안 된다 — 누가 위원인지는 자료에 없다 */
ok('체크로 고르게 한다 (자동으로 안 넣는다)', /type="checkbox" id="spk-/.test(pick), pick.slice(0, 900));
const add = gF('addPickedOfficers');
ok('고른 것만 넣는다', /c\.checked/.test(add), add);
ok('아무것도 안 골랐으면 넣지 않는다', /고른 사람이 없습니다/.test(add));
/* 이미 명부에 있는 이름을 또 넣으면 서식에 두 번 찍힌다 */
/* ⚠ 「이미 있음」이라는 «글자»만 보면, 판을 false 로 바꿔도 글자가 남아 통과한다.
     명부에서 이름을 걷어(have) 그것으로 판을 짓는지 본다. */
ok('이미 있는 이름은 다시 안 넣는다',
   /_officersOf\(f\)\.forEach\(function\(o\)\{ if\(o\.name\) have\[/.test(pick)
   && /var dup=have\[String\(t\[1\]\)\.trim\(\)\]/.test(pick)
   && /\(dup\?' disabled':''\)/.test(pick),
   pick.slice(0, 1400));
/* 저장은 사람이 누른다 — 조용히 덮어쓰지 않는다 */
ok('넣기만 하고 저장은 사람이 누른다', /\[💾 저장\]을 누르세요/.test(add) && !/fbDb\.ref/.test(add), add);
ok('단추가 임원 명부에 이어져 있다',
   /onclick="openSitePeoplePick\(\)"/.test(src) && src.indexOf('function openSitePeoplePick(') >= 0);

console.log(bad ? '\nFAILURES ' + bad : '\nALL PASS (위원이 명부 한 곳에서 서식으로 간다)');
process.exit(bad ? 1 : 0);
