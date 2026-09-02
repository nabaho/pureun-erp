/* 재무제표·주석이 «무엇을 적는가» — 글자가 있나 없나가 아니라 값이 맞나를 본다.
   여기 담긴 다섯 가지는 전부 실제로 틀렸던 것이다:

     1) 주석 소재지가 늘 「—」  — 기금 항목은 addr 이 아니라 address 인데 addr 을 읽었다
     2) 주석 회계연도가 늘 1.1.~12.31. — 설립 첫해는 인가일부터다
     3) 손익계산서가 잡수익을 「이자수익」이라 적었다 — 수익 세부를 계정별로 나눠야 한다
     4) 당기 결손·전기 잉여인 해에 전기 잉여가 「결손금」 칸에 양수로 앉았다
     5) 「이자수익」 요약이 준비금환입까지 더한 값이었다(fin.interest)

   실행: node fund-erp/tools/check_notes.js */
const fs = require('fs'), path = require('path');
const W = path.resolve(__dirname, '..', '..');
const src = fs.readFileSync(path.join(W, 'fund.html'), 'utf8');
function gF(n){const i=src.indexOf('function '+n+'(');if(i<0)throw Error('없음 '+n);let d=0;
  for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}}
function gV(n){const i=src.indexOf('var '+n+'=');if(i<0)throw Error('없음 '+n);let d=0;
  for(let k=src.indexOf('=',i);k<src.length;k++){const c=src[k];
    if(c==='{'||c==='[')d++;else if(c==='}'||c===']'){d--;if(!d)return src.slice(i,src.indexOf(';',k)+1);}}}
global.num = v => { if (v === '' || v == null) return ''; const n = Number(String(v).replace(/,/g,'')); return isFinite(n) ? n : '' };
global.esc = s => String(s == null ? '' : s);
global.S = { fundId: 'X', year: 2026 };
global.funds = { X: { fund_type: '공동', years: { 2026: { opening: {}, reserve_auto: false } } } };
(0, eval)(['ACCT_CHART','PURPOSE_ACCTS','ADMIN_ACCTS','OPEN_ACCT','RESERVE_ACCTS','CF_INVEST',
  'CF_FINANCE','IE_TREE'].map(gV).join('\n') + '\n'
  + ['_openingOf','_splitsOf','_splitSum','_txnDone','expandSplits','journalOf','acctMoves','computeFin',
     '_contribOf','_reserveRate','_rsvSwapOf','_rsvRoles','_reserveAcct','reserveAdjust','_reserveEntry',
     '_reserveEntries','_openAssets','cashMoves','_retLabel','_retVal','stmtBS','stmtIS','stmtRE','stmtNotes'].map(gF).join('\n'));

let bad = 0;
const ok = (n, cond, saw) => { if (!cond) bad++;
  console.log('  ' + (cond ? '·' : '✗') + ' ' + n + (cond ? '' : '   실제: ' + saw)); };

/* ── 1·2. 주석의 소재지와 회계연도 ───────────────────────── */
console.log('■ 주석 — 기금의 개요');
funds.X = { name:'가나공동', fund_type:'공동', address:'대전 어딘가 1', inka_date:'2026-04-15',
            years:{2026:{opening:{},reserve_auto:false}} };
let N = stmtNotes([], computeFin([], 'X', 2026), {}, 'X', 2026);
const line = (sec, k) => { const s = N.find(x => x.h.indexOf(sec) >= 0);
  const l = s && s.lines.find(y => y[0] === k); return l ? l[1] : '(줄 없음)'; };
ok('소재지가 실제 주소로 나온다', line('개요','소재지') === '대전 어딘가 1', line('개요','소재지'));
ok('설립 첫해는 인가일부터', line('개요','회계연도') === '2026. 4. 15. ~ 2026. 12. 31.', line('개요','회계연도'));

funds.X.inka_date = '2019-04-15';
N = stmtNotes([], computeFin([], 'X', 2026), {}, 'X', 2026);
ok('둘째 해부터는 1월 1일부터', line('개요','회계연도') === '2026. 1. 1. ~ 2026. 12. 31.', line('개요','회계연도'));

funds.X.address = '';
N = stmtNotes([], computeFin([], 'X', 2026), {}, 'X', 2026);
ok('주소가 비면 「—」 (지어내지 않는다)', line('개요','소재지') === '—', line('개요','소재지'));

/* ── 3. 손익계산서의 수익 세부 ───────────────────────────── */
console.log('\n■ 손익계산서 — 수익 세부');
funds.X = { fund_type:'공동', years:{2026:{opening:{},reserve_auto:false}} };
const T = [
  { _id:'a', date:'2026-01-02', approved:true, deposit:10000000, withdraw:0, debit:'현금성자산', credit:'기본재산' },
  { _id:'b', date:'2026-06-01', approved:true, deposit:70000, withdraw:0, debit:'현금성자산', credit:'잡수익' },
];
let fin = computeFin(T, 'X', 2026);
let R = stmtIS(fin, {}, fin.tb, {});
const has = l => R.some(r => r.lbl === l);
const val = l => { const r = R.find(x => x.lbl === l); return r ? r.cur : null; };
ok('잡수익만 있으면 「이자수익」 줄이 없다', !has('가. 이자수익'), R.map(r=>r.lbl).join('/'));
ok('「가. 잡수익」 70,000 으로 적힌다', val('가. 잡수익') === 70000, val('가. 잡수익'));

T.push({ _id:'c', date:'2026-07-01', approved:true, deposit:30000, withdraw:0, debit:'현금성자산', credit:'이자수익' });
fin = computeFin(T, 'X', 2026); R = stmtIS(fin, {}, fin.tb, {});
ok('둘 다 있으면 이자수익이 「가」', val('가. 이자수익') === 30000, val('가. 이자수익'));
ok('잡수익은 「나」로 이어 붙는다', val('나. 잡수익') === 70000, val('나. 잡수익'));
ok('세부 합계 = 1. 사업수익', (val('가. 이자수익')||0)+(val('나. 잡수익')||0) === val('1. 사업수익'), val('1. 사업수익'));

/* 준비금환입은 사업수익이 아니다 — 별지15호 ㉙ 은 이자·잡수익만 적는다 */
T.push({ _id:'d', date:'2026-08-01', approved:true, nocash:1, amount:5000000,
         debit:'고유목적사업준비금2', credit:'고유목적사업준비금환입' });
fin = computeFin(T, 'X', 2026); R = stmtIS(fin, {}, fin.tb, {});
ok('환입은 사업수익에 안 섞인다', val('1. 사업수익') === 100000, val('1. 사업수익'));

/* ── 3-2. 글머리(가·나·다…)는 «적은 줄만» 세어 붙인다 ───

   목록 자리로 글머리를 고르면, 앞의 것이 없는 해에 「나.」로 시작한다.
   사업수익 세부에서 그러다 고쳤는데, 사업외수익(준비금 환입)에도 같은 것이 있었다. */
console.log('\n■ 사업외수익 글머리');
{
  /* 준비금2 환입만 있는 해 — 준비금1 줄은 없다 */
  funds.X = { fund_type:'공동', years:{2026:{opening:{},reserve_auto:false}} };
  const A = [
    { _id:'o', date:'2026-01-02', approved:true, deposit:10000000, withdraw:0,
      debit:'현금성자산', credit:'기본재산' },
    { _id:'p', date:'2026-12-31', approved:true, nocash:1, amount:3000000,
      debit:'기본재산', credit:'고유목적사업준비금2' },
    { _id:'q', date:'2026-12-31', approved:true, nocash:1, amount:3000000,
      debit:'고유목적사업준비금2', credit:'고유목적사업준비금환입' },
  ];
  const fi = computeFin(A, 'X', 2026);
  const RR = stmtIS(fi, {}, fi.tb, {});
  const L = RR.map(r => r.lbl);
  ok('준비금1 환입이 없으면 그 줄도 없다',
     L.indexOf('가. 고유목적사업준비금1 환입') < 0, L.join('/'));
  ok('준비금2 환입이 「가.」로 시작한다',
     L.indexOf('가. 고유목적사업준비금2 환입') >= 0, L.join('/'));
  const rr = RR.find(r => r.lbl === '가. 고유목적사업준비금2 환입');
  ok('그 금액이 3,000,000', rr && rr.cur === 3000000, rr && rr.cur);
  ok('6. 사업외수익과 같다',
     rr && rr.cur === RR.find(r => r.lbl === '6. 사업외수익').cur,
     RR.find(r => r.lbl === '6. 사업외수익').cur);
}

/* ── 4. 비교 재무상태표의 전기 부호 ──────────────────────── */
console.log('\n■ 재무상태표 — 당기 결손·전기 잉여');
const B = stmtBS({ retained:-500000, tb:{} }, { retained:300000 });
const brow = l => { const r = B.find(x => x.lbl === l); return r || null; };
const loss = brow('Ⅱ. 결손금');
ok('당기 결손이면 줄 이름이 「결손금」', !!loss, B.map(r=>r.lbl).join('/'));
ok('당기 결손 500,000 이 양수로', loss && loss.cur === 500000, loss && loss.cur);
ok('전기 잉여 300,000 은 음수로 (결손 아님을 보인다)', loss && loss.prv === -300000, loss && loss.prv);

const B2 = stmtBS({ retained:300000, tb:{} }, { retained:-500000 });
const gain = B2.find(x => x.lbl === 'Ⅱ. 이익잉여금');
ok('반대 해에는 이름이 「이익잉여금」', !!gain, B2.map(r=>r.lbl).join('/'));
ok('전기 결손 500,000 은 음수로', gain && gain.prv === -500000, gain && gain.prv);

/* ── 4-2. 이익잉여금처분계산서도 같은 결함이 있었다 ─── */
console.log('\n■ 처분계산서 — 당기 결손·전기 잉여');
const E = stmtRE({ retained:-500000, net:-800000, opening:{retained:300000} },
                 { retained:300000,  net:200000,  opening:{retained:100000} });
const erow = l => E.find(x => x.lbl === l) || null;
const e1 = erow('1. 처분전결손금');
ok('당기 결손이면 「처분전결손금」', !!e1, E.map(r=>r.lbl).join('/'));
ok('당기 결손 500,000 이 양수로', e1 && e1.cur === 500000, e1 && e1.cur);
ok('전기 잉여 300,000 은 음수로', e1 && e1.prv === -300000, e1 && e1.prv);
const e4 = erow('4. 차기이월결손금');
ok('차기이월도 같은 부호', e4 && e4.cur === 500000 && e4.prv === -300000, e4 && (e4.cur+'/'+e4.prv));
const e2 = erow('1) 전기이월이익잉여금');
ok('전기이월은 제 부호로(잉여 300,000)', e2 && e2.cur === 300000 && e2.prv === 100000, e2 && (e2.cur+'/'+e2.prv));
const e3 = erow('2) 당기순손실');
ok('당기순손실 800,000 양수·전기 이익은 음수',
   e3 && e3.cur === 800000 && e3.prv === -200000, e3 && (e3.cur+'/'+e3.prv));

/* ── 6. 준비금 맞바꿈(reserve_swap) ────────────

   어느 번호가 이자 쪽이고 어느 번호가 이월 쪽인지는 기금마다 다르다.
   설정·전입을 «번호»로 못 박아 두면 맞바꿈 기금에서 장부와 잔액 셈이 갈라진다 —
   설정은 준비금1로 나가고 환입은 준비금2에서 빼, 준비금2가 음수가 된다.
   대차와 당기순이익은 맞아서 화면만 보면 멀줦해 보이는 종류의 결함이다. */
console.log('\n■ 준비금 맞바꿈');
const RUN = swap => {
  funds.X = { fund_type:'공동', reserve_swap:swap, years:{2026:{opening:{},reserve_auto:true}} };
  const arr = [
    { _id:'a', date:'2026-01-05', approved:true, deposit:10000000, withdraw:0,
      memo:'출연금', debit:'현금성자산', credit:'기본재산' },
    { _id:'b', date:'2026-06-01', approved:true, deposit:0, withdraw:9000000,
      memo:'경조사비', debit:'경조사비', credit:'현금성자산' },
  ];
  const rc = reserveAdjust(arr, 'X', 2026);
  const all = arr.concat(_reserveEntries(2026, rc).map(x => Object.assign({_id:x.id}, x.e)));
  const f = computeFin(all, 'X', 2026);
  const bal = a => { const v = f.tb[a]; return v ? v.credit - v.debit : 0; };
  return { rc, f, bal, all };
};
[false, true].forEach(sw => {
  const { rc, f, bal } = RUN(sw);
  const tag = sw ? '맞바꿈 켜짐' : '기본    ';
  ok(tag + ' — 설정은 이월 쪽(' + rc.acctCarry + ')으로',
     rc.parts.length === 1 && rc.parts[0].acct === rc.acctCarry, rc.parts.map(p => p.acct).join());
  RESERVE_ACCTS.forEach(a => ok(tag + ' — ' + a + ' 음수 아님', bal(a) >= 0, bal(a)));
  ok(tag + ' — 준비금 둘 다 0 으로 맞물림',
     RESERVE_ACCTS.every(a => bal(a) === 0), RESERVE_ACCTS.map(a => bal(a)).join('/'));
  ok(tag + ' — 당기순이익 0', Math.round(f.net) === 0, Math.round(f.net));
  ok(tag + ' — 기본재산 1,000,000', Math.round(f.basic) === 1000000, Math.round(f.basic));
});

/* ── 7. 주석 4절 — 기본재산 감소를 «실제 계정»으로 갈라 적는가 ─ */
console.log('\n■ 주석 4절 — 기본재산의 변동');
[false, true].forEach(sw => {
  const { rc, f, all } = RUN(sw);
  const NN = stmtNotes(all, f, {}, 'X', 2026);
  const s4 = NN.find(x => x.h.indexOf('4.') === 0);
  const lbls = s4.rows.map(r => r[0]);
  const tag = sw ? '맞바꿈 켜짐' : '기본    ';
  ok(tag + ' — 실제 대변 계정(' + rc.acctCarry + ') 이름으로',
     lbls.indexOf(rc.acctCarry + ' 설정') >= 0, lbls.join(' / '));
  const other = RESERVE_ACCTS.filter(a => a !== rc.acctCarry)[0];
  ok(tag + ' — 쓰지도 않은 ' + other + ' 줄은 없다',
     lbls.indexOf(other + ' 설정') < 0, lbls.join(' / '));
  const g = l => { const r = s4.rows.find(x => x[0] === l); return r ? r[1] : 0; };
  ok(tag + ' — 기초 + 출연 + 감소 = 기말',
     g('기초') + g('당기 출연') + g(rc.acctCarry + ' 설정') === g('기말'),
     g('기초') + '+' + g('당기 출연') + '+' + g(rc.acctCarry + ' 설정') + ' vs ' + g('기말'));
});

/* 준비금과 무관한 기본재산 감소를 설정액으로 둔갑시키면 안 된다 */
funds.X = { fund_type:'공동', years:{2026:{opening:{},reserve_auto:false}} };
const RB = [
  { _id:'a', date:'2026-01-05', approved:true, deposit:5000000, withdraw:0,
    debit:'현금성자산', credit:'기본재산' },
  { _id:'x', date:'2026-09-01', approved:true, deposit:0, withdraw:400000,
    memo:'출연금 반환', debit:'기본재산', credit:'현금성자산' },
];
const fb = computeFin(RB, 'X', 2026);
const S4 = stmtNotes(RB, fb, {}, 'X', 2026).find(x => x.h.indexOf('4.') === 0);
const gb = l => { const r = S4.rows.find(x => x[0] === l); return r ? r[1] : null; };
ok('준비금 아닌 감소는 「그 밖의 감소」', gb('그 밖의 감소') === -400000, gb('그 밖의 감소'));
ok('그것을 설정액으로 적지 않는다',
   !S4.rows.some(r => /설정$/.test(r[0])), S4.rows.map(r => r[0]).join(' / '));

/* ── 6-2. 전입과 환입 차례도 역할을 따라야 한다 ───────

   위의 시험은 «환입하는 해» 하나만 지나고, 준비금도 한 쪽만 잔액이 있어
   ① 전입(순이익>0)과 ② 둘 다 있을 때의 차례를 전혀 안 본다.
   되돌림 시험에서 그 둘을 놓쳐 이 두 가지를 더한다. */
console.log('\n■ 전입·환입 차례');
[false, true].forEach(sw => {
  /* 순이익이 나는 해 — 이자 20만만 들어오고 쓴 것이 없다.
     출연금이 없으므로 설정 한도도 0 이라 전입만 생긴다. */
  funds.X = { fund_type:'공동', reserve_swap:sw, years:{2026:{opening:{},reserve_auto:true}} };
  const arr = [
    { _id:'i', date:'2026-03-01', approved:true, deposit:200000, withdraw:0,
      memo:'이자', debit:'현금성자산', credit:'이자수익' },
  ];
  const rc = reserveAdjust(arr, 'X', 2026);
  const tag = sw ? '맞바꿈 켜짐' : '기본    ';
  ok(tag + ' — 순이익이 나면 전입이다', rc.kind === '전입', rc.kind);
  ok(tag + ' — 전입도 이월 쪽(' + rc.acctCarry + ')으로',
     rc.parts.length === 1 && rc.parts[0].acct === rc.acctCarry,
     rc.parts.map(x => x.acct).join());

  /* 두 준비금에 다 잔액이 있고 환입해야 하는 해 — 이자 쪽을 먼저 쓴다
     (법인세법 제29조 준비금). 번호 순서로 돌면 맞바꿈 기금에서 거꾸로 빠진다. */
  funds.X = { fund_type:'공동', reserve_swap:sw,
              years:{2026:{opening:{reserve:1000000, reserve2:1000000}, reserve_auto:true}} };
  const arr2 = [
    { _id:'s', date:'2026-06-01', approved:true, deposit:0, withdraw:600000,
      memo:'경조사비', debit:'경조사비', credit:'현금성자산' },
  ];
  const rc2 = reserveAdjust(arr2, 'X', 2026);
  ok(tag + ' — 모자란 해는 환입이다', rc2.kind === '환입', rc2.kind);
  ok(tag + ' — 환입은 이자 쪽(' + rc2.acctInterest + ')부터',
     rc2.parts.length >= 1 && rc2.parts[0].acct === rc2.acctInterest,
     rc2.parts.map(x => x.acct + ':' + x.amount).join(' '));
});

/* ── 5. 이름이 잘못됐던 fin.interest ─────────────────────── */
console.log('\n■ 없앤 항목');
ok('computeFin 이 interest 를 더는 안 내보낸다', !('interest' in fin), Object.keys(fin).filter(k=>k==='interest'));
/* 주석글에 이름이 남아 있는 건 괜찮다 — «코드»에 남았는지만 본다 */
const bare = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\r\n]*/g, '');
ok('밖으로 나가는 자리에 fin.interest 가 없다', !/fin\.interest|won\(f\.interest\)/.test(bare), '아직 있다');

console.log(bad ? '\nFAILURES ' + bad : '\nALL PASS');
process.exit(bad ? 1 : 0);
