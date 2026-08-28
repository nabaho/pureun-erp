/* CMS 실데이터 ↔ 적힌 입금액 대조 (김보람 과장 건의 2026-08-28)

   ★ 왜 필요한가
     2026-08-28 이전에는 매칭 창이 보여준 금액과 저장된 금액이 달랐다.
     고쳤다고 «이미 틀리게 적힌 것»이 저절로 낫지는 않는다 — 찾아내야 한다.
     세금계산서·성과급 기준이 이 금액을 딛고 서 있다.

   ★ 지키려는 것
     ① 자문료가 바뀐 뒤 늦게 들어온 입금(칸토덴카 사례)을 실제로 잡아낸다
     ② 맞는 것을 틀렸다고 하지 않는다 (헛경보는 도구를 못 믿게 만든다)
     ③ 실패한 출금은 애초에 입금이 아니므로 대조에서 뺀다
     ④ 같은 날 두 번 빠져나간 것은 «합쳐서» 견준다
     ⑤ 한쪽에만 있는 것은 조용히 지나간다 (다른 이야기다)
     ⑥ 큰 것부터 보여 준다 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { cutFn } = require('./cut-fn');

const src = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8').split('\r\n').join('\n');

const box = { console, Math, String, Number, Object, parseInt, Array };
box.window = box;
vm.createContext(box);
vm.runInContext(cutFn(src, 'function erpCmsAmountAudit') + '\n;this.audit = erpCmsAmountAudit;', box);
const audit = box.audit;

let fail = 0, total = 0;
function ok(name, cond, hint) {
  total++;
  if (cond) { console.log('ok   ' + name); return; }
  fail++;
  console.log('FAIL ' + name + (hint ? '\n     → ' + hint : ''));
}

/* CMS 이름 → ERP 업체 이름 (실제로는 별칭·사업자번호로 푼다) */
const NAMES = {
  '칸토덴카화인프로덕츠한국(주)': '칸토덴카화인프로덕츠',
  '(주)알산정밀': '(주)알산정밀',
  '(주)와이엔케이': '(주)와이엔케이',
  '모르는회사': ''
};
const resolve = (nm) => NAMES[nm] !== undefined ? NAMES[nm] : '';

// ── ① 칸토덴카 사례 — 실제로 275,000 이 빠졌는데 440,000 이 적혔다 ──
{
  const rows = [
    { status:'ok', setdate:'2026-02-03', name:'칸토덴카화인프로덕츠한국(주)', amount:275000 },
    { status:'ok', setdate:'2026-02-03', name:'(주)알산정밀',                 amount:330000 }
  ];
  const incomes = [
    { sourceKind:'company', companyName:'칸토덴카화인프로덕츠', date:'2026-02-03', amount:440000,
      id:'fi-1', note:'CMS 일괄이체 자동매칭', kind:'자문료' },
    { sourceKind:'company', companyName:'(주)알산정밀', date:'2026-02-03', amount:330000,
      id:'fi-2', note:'CMS 일괄이체 자동매칭', kind:'자문료' }
  ];
  const r = audit(rows, incomes, resolve);
  console.log('[① 칸토덴카 사례]');
  ok('틀린 것 1건만 잡는다', r.bad.length === 1, '잡힌 수: ' + r.bad.length);
  ok('잡힌 것이 칸토덴카다', r.bad[0] && r.bad[0].co === '칸토덴카화인프로덕츠',
     '잡힌 업체: ' + (r.bad[0] && r.bad[0].co));
  ok('실제 275,000 · 적힌 440,000 을 그대로 보여준다',
     r.bad[0] && r.bad[0].real === 275000 && r.bad[0].saved === 440000,
     JSON.stringify(r.bad[0]));
  ok('차이 +165,000 원', r.bad[0] && r.bad[0].gap === 165000, '차이: ' + (r.bad[0] && r.bad[0].gap));
  ok('맞는 건(알산정밀)은 안 잡는다', !r.bad.some(b => b.co === '(주)알산정밀'));
  ok('둘 다 대조했다', r.checked === 2, '대조 수: ' + r.checked);
  ok('어느 기록인지 되짚을 수 있다', r.bad[0] && r.bad[0].ids.indexOf('fi-1') >= 0);
}

// ── ③ 실패한 출금은 대조에서 뺀다 ──
{
  const rows = [{ status:'fail', setdate:'2026-02-03', name:'(주)알산정밀', amount:330000 }];
  const incomes = [{ sourceKind:'company', companyName:'(주)알산정밀', date:'2026-02-03',
                     amount:330000, id:'x', note:'', kind:'자문료' }];
  const r = audit(rows, incomes, resolve);
  console.log('\n[③ 실패한 출금]');
  ok('실패한 줄은 대조하지 않는다', r.checked === 0 && r.bad.length === 0,
     '대조 ' + r.checked + ' · 틀림 ' + r.bad.length);
}

// ── ④ 같은 날 두 번 빠진 것 ──
{
  const rows = [
    { status:'ok', setdate:'2026-02-03', name:'(주)와이엔케이', amount:110000 },
    { status:'ok', setdate:'2026-02-03', name:'(주)와이엔케이', amount:110000 }
  ];
  const incomes = [{ sourceKind:'company', companyName:'(주)와이엔케이', date:'2026-02-03',
                     amount:220000, id:'y', note:'', kind:'자문료' }];
  const r = audit(rows, incomes, resolve);
  console.log('\n[④ 같은 날 두 번]');
  ok('합쳐서 견주므로 헛경보가 안 뜬다', r.bad.length === 0 && r.checked === 1,
     '틀림 ' + r.bad.length + ' · 대조 ' + r.checked);
}

// ── ⑤ 한쪽에만 있는 것 ──
{
  const rows = [
    { status:'ok', setdate:'2026-02-03', name:'(주)알산정밀', amount:330000 },
    { status:'ok', setdate:'2026-02-03', name:'모르는회사',   amount:99000 }
  ];
  const incomes = [
    { sourceKind:'company', companyName:'(주)와이엔케이', date:'2026-02-03', amount:220000, id:'z', note:'', kind:'자문료' }
  ];
  const r = audit(rows, incomes, resolve);
  console.log('\n[⑤ 한쪽에만 있는 것]');
  ok('CMS 에만 있는 것은 틀렸다고 하지 않는다', r.bad.length === 0, '틀림: ' + r.bad.length);
  ok('업체를 못 찾은 줄은 따로 센다', r.noLink === 1, '못 찾음: ' + r.noLink);
  ok('입금에만 있는 것도 조용히 지나간다', r.checked === 0, '대조: ' + r.checked);
}

// ── ⑥ 큰 것부터 · 합계 ──
{
  const rows = [
    { status:'ok', setdate:'2026-02-03', name:'(주)알산정밀', amount:330000 },
    { status:'ok', setdate:'2026-02-03', name:'칸토덴카화인프로덕츠한국(주)', amount:275000 }
  ];
  const incomes = [
    { sourceKind:'company', companyName:'(주)알산정밀', date:'2026-02-03', amount:340000, id:'a', note:'', kind:'자문료' },
    { sourceKind:'company', companyName:'칸토덴카화인프로덕츠', date:'2026-02-03', amount:440000, id:'b', note:'', kind:'자문료' }
  ];
  const r = audit(rows, incomes, resolve);
  console.log('\n[⑥ 차례와 합계]');
  ok('많이 어긋난 것이 먼저 나온다', r.bad[0].gap === 165000 && r.bad[1].gap === 10000,
     r.bad.map(b => b.gap).join(', '));
  ok('차이 합계를 알려 준다', r.sumGap === 175000, '합계: ' + r.sumGap);
}

// ── ② 헛경보 없음 (전부 맞을 때) ──
{
  const rows = [{ status:'ok', setdate:'2026-02-03', name:'(주)알산정밀', amount:330000 }];
  const incomes = [{ sourceKind:'company', companyName:'(주)알산정밀', date:'2026-02-03',
                     amount:330000, id:'q', note:'', kind:'자문료' }];
  const r = audit(rows, incomes, resolve);
  console.log('\n[② 전부 맞을 때]');
  ok('맞으면 아무것도 안 잡는다', r.bad.length === 0 && r.sumGap === 0);
  ok('빈 자료를 줘도 안 죽는다',
     audit(null, null, resolve).bad.length === 0 && audit([], [], resolve).checked === 0);
}

console.log('\n  === ' + (total - fail) + ' 통과 / ' + fail + ' 실패 ===');
process.exit(fail ? 1 : 0);
