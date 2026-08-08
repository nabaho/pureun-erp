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

console.log('\n[코드에 제대로 붙었는지]');
ok('이름 점수 60 을 기준으로 가른다', /if\(\(s\.nameScore\|\|0\) >= 60\) hit\.push\(s\); else other\.push\(s\);/.test(src));
ok('이름 맞는 것을 머리말과 함께 먼저 보여준다', /🔎 적요 「'\+\(row\.memo\|\|'-'\)\+'」 와 이름이 맞는 것 '\+hit\.length/.test(src));
ok('이름이 다른 것은 접어둔다', /'이름이 다른 것 ':'후보 '\)\+other\.length\+'건'/.test(src));
ok('접힌 무리에 왜 접었는지 적는다', /hit\.length\?' — 금액만 맞음':''/.test(src));
ok('이름으로 못 찾으면 기본으로 펼친다', /\(hit\.length===0\)/.test(src));
ok('후보가 넉넉할 때만 칩·검색을 낸다', /other\.length>=4 && h\('div'/.test(src));
ok('종류 칩이 있다', /candK\);\s*if\(on\) delete n\[row\._k\]; else n\[row\._k\]=k; setCandK\(n\)/.test(src));
ok('검색 상자가 있다', /placeholder:'업체·번호로 찾기'/.test(src));
ok('칸 높이를 묶어 표가 안 흔들린다', /maxHeight:'150px',overflowY:'auto'/.test(src));
ok('후보에 관리번호도 보여준다', /_no=\(s\.cand\.item&&\(s\.cand\.item\.caseNo\|\|s\.cand\.item\.no\)\)\|\|''/.test(src));
ok('맞는 후보가 없으면 알려준다', /'맞는 후보가 없습니다'/.test(src));

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===\n');
process.exit(fail ? 1 : 0);
