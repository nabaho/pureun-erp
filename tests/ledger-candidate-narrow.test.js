// 후보 좁히기 — 적요 이름과 맞는 것 먼저, 이름이 다른 것은 접어둔다
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, hint){
  if(cond){ pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (hint ? ' — ' + hint : '')); }
}
function eq(name, got, want){
  const good = JSON.stringify(got) === JSON.stringify(want);
  if(good){ pass++; console.log('  PASS ' + name + '  (' + JSON.stringify(got) + ')'); }
  else { fail++; console.log('  FAIL ' + name + '  받음 ' + JSON.stringify(got) + ' · 기대 ' + JSON.stringify(want)); }
}

// ── 화면이 쓰는 갈래 기준을 그대로 옮겨 본다 ──
function split(sugs){
  const hit = [], other = [];
  sugs.forEach(s => { if((s.nameScore||0) >= 60) hit.push(s); else other.push(s); });
  return { hit, other };
}

console.log('\n[1번 행 실제 자료 — 후보 12건이 몇 건으로 줄어드나]');
{
  // 적요 「(주)이피아」 · 1,100,000원. 화면에 실제로 떴던 후보들.
  // nameScore 는 적요 vs 업체명 점수 (일치 100 · 포함 85 · 부분 60 · 유사 35 · 없음 0)
  const sugs = [
    { name:'이피아 컨설팅(잔금)',        store:'consultings', nameScore:100, amount:1155000 },
    { name:'이피아 사건(착수)',          store:'cases',       nameScore:100, amount:550000  },
    { name:'이피아 사건(성공보수)',      store:'cases',       nameScore:100, amount:22      },
    { name:'웅천새마을금고 컨설팅(계약금)', store:'consultings', nameScore:0,  amount:1100000 },
    { name:'맥스텍 컨설팅(잔금)',        store:'consultings', nameScore:0,   amount:1155000 },
    { name:'- 사건(착수)',               store:'cases',       nameScore:0,   amount:1000000 },
  ];
  const { hit, other } = split(sugs);
  eq('이름이 맞는 것 3건만 먼저 보인다', hit.length, 3);
  eq('이름이 다른 3건은 접힌다', other.length, 3);
  eq('먼저 보이는 것은 전부 이피아',
     hit.map(s => s.name.split(' ')[0]), ['이피아','이피아','이피아']);

  // 계약 6건을 뺀 뒤이므로 12 → 6, 다시 이름으로 3건
  ok('처음 12건이 눈에 보이는 3건으로 줄었다', hit.length <= 3);
}

console.log('\n[이름으로 못 찾는 건 — 「노동권익과」]');
{
  const sugs = [
    { name:'가나상사 컨설팅(잔금)', store:'consultings', nameScore:0, amount:9900000 },
    { name:'다라산업 사건(성공보수)', store:'cases',     nameScore:0, amount:9900000 },
  ];
  const { hit, other } = split(sugs);
  eq('이름 맞는 것이 없다', hit.length, 0);
  eq('금액 맞는 것이 후보로 남는다', other.length, 2);
  ok('이럴 때는 기본으로 펼친다 (화면 규칙: hit 가 0이면 openOther)', hit.length === 0);
}

console.log('\n[갈림 기준 — 어디까지를 「이름이 맞다」고 보나]');
{
  const cases = [
    ['이름 일치(100)',   100, true],
    ['이름 포함(85)',     85, true],
    ['부분 일치(60)',     60, true],
    ['이름 유사(35)',     35, false],
    ['안 맞음(0)',         0, false],
  ];
  cases.forEach(([label, score, want]) => {
    const { hit } = split([{ nameScore:score }]);
    eq(label + ' → ' + (want ? '먼저 보임' : '접힘'), hit.length === 1, want);
  });
}

console.log('\n[검색·필터가 제대로 거르나]');
{
  const other = [
    { cand:{ companyName:'웅천새마을금고', label:'컨설팅(계약금)', store:'consultings', item:{no:'인사노무-2026-006'} } },
    { cand:{ companyName:'맥스텍',        label:'컨설팅(잔금)',   store:'consultings', item:{no:'현물-2026-014'} } },
    { cand:{ companyName:'송림산업',      label:'사건(성공보수)', store:'cases',       item:{caseNo:'부해등-2026-002'} } },
  ];
  function filt(list, kf, q){
    q = (q||'').trim().toLowerCase();
    return list.filter(s => {
      if(kf && s.cand.store !== kf) return false;
      if(q){
        const hay = ((s.cand.companyName||'')+' '+(s.cand.label||'')+' '
                  +((s.cand.item&&(s.cand.item.caseNo||s.cand.item.no))||'')).toLowerCase();
        if(hay.indexOf(q) < 0) return false;
      }
      return true;
    });
  }
  eq('필터 없으면 전부', filt(other,'','').length, 3);
  eq('종류 칩 — 컨설팅만', filt(other,'consultings','').map(s=>s.cand.companyName), ['웅천새마을금고','맥스텍']);
  eq('업체명으로 찾기', filt(other,'','맥스').map(s=>s.cand.companyName), ['맥스텍']);
  eq('관리번호로 찾기', filt(other,'','부해등').map(s=>s.cand.companyName), ['송림산업']);
  eq('칩과 검색을 같이', filt(other,'cases','송림').map(s=>s.cand.companyName), ['송림산업']);
  eq('없으면 빈 목록', filt(other,'','없는이름').length, 0);
}

/* (2026-08-09) 「이름 맞는 것 먼저 · 나머지는 접어둠」 을 «아예 안 보여줌» 으로 바꿨다.
   접어 둬도 펼치면 여전히 열두 건이 쏟아졌고, 그 열둘은 이름 근거가 하나도 없는 것들이라
   사람이 고를 근거가 없었다(대표 지적: "유사한 금액을 맞추려고만 해서 맞지도 않다").
   이제 게이트(erpNameEvidence)가 목록에서 빼고, 「🔍 직접 찾기」에서만 볼 수 있다.
   위의 «점수 60 으로 가른다» 는 셈 자체는 게이트 안에 그대로 살아 있다. */
console.log('\n[코드에 제대로 붙었는지 — 이름 근거 게이트]');
ok('이름 점수 60 이 여전히 기준이다', /if\(nm >= 60\) return \{ ok:true, why:'이름' \}/.test(src));
ok('세금계산서는 근거로 인정한다', /if\(iv >= 85\) return \{ ok:true, why:'세금계산서' \}/.test(src));
/* (2026-08-10) 금액지문은 근거에서 뺐다 — 같은 금액을 매달 내는 곳이 여럿이면
   그 여럿이 다 후보로 떠서 아무것도 못 좁혀 줬다(대표 제보). */
ok('금액지문만으로는 근거로 치지 않는다', !/if\(fp >= 90\) return \{ ok:true, why:'입금이력' \}/.test(src));
ok('금액지문은 「뺐다」고 표시해 둔다', /if\(fp >= 90\) return \{ ok:false, fp:true,/.test(src));
ok('몇 곳을 뺐는지 세어 목록에 달아 준다', /res\.fpHidden = fpHidden;/.test(src));
ok('근거 없는 후보는 목록에서 뺀다', /if\(r\.score > 0 && \(ev\.ok \|\| includeWeak\)\)/.test(src));
ok('뺀 까닭을 말해 준다', /이름 근거 없음 — 금액만 비슷합니다/.test(src));
ok('직접 찾기는 뺀 것도 본다 (우회 인자)', /erpMatchTxnToPending\(txn, pendingArr, limit, includeWeak\)/.test(src));
ok('약한 후보에는 표시가 붙는다', /weak:!ev\.ok/.test(src));
ok('화면에 「직접 찾기」 길이 있다', /function openFindRow\(row\)/.test(src));
ok('후보가 없는 줄에서 바로 찾을 수 있다', /openFindRow\(row\); \}/.test(src));
ok('같은 업체의 여러 달은 한 줄로 묶는다', /function erpGroupPendByCompany\(sugList\)/.test(src));
ok('맞는 후보가 없으면 알려준다', /'후보 없음'/.test(src));

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===\n');
process.exit(fail ? 1 : 0);
