/* 계약창 「과거 데이터 선택」 목록 — 닫히는가, 업태·종목이 딸려오는가
   ★ 이 목록은 회사정보 위를 덮는다. 안 닫히면 아래 칸을 못 본다.
   ★ 업태·종목이 안 왔을 때 "왜 안 왔는지"를 누르기 전에 알 수 있어야 한다. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const HTML = path.join(__dirname, '..', 'pu-erp.html');
// 줄바꿈은 LF 로 통일해 읽는다 (윈도우 CRLF / CI LF 양쪽에서 같은 표식이 찾히도록)
const src = fs.readFileSync(HTML, 'utf8').replace(/\r\n/g, '\n');

function slice(a, b){
  const i = src.indexOf(a);
  if(i < 0) throw new Error('시작 표식 못찾음: ' + a);
  const j = src.indexOf(b, i);
  if(j < 0) throw new Error('끝 표식 못찾음: ' + b);
  return src.slice(i, j);
}

let pass = 0, fail = 0;
const t = (name, got, want) => {
  const G = JSON.stringify(got), W = JSON.stringify(want);
  if(G === W) pass++;
  else { fail++; console.log('FAIL ' + name + '\n  got  = ' + G + '\n  want = ' + W); }
};

/* ═══ 1. ★ 바깥을 누르면 닫히는가 (없던 기능) ═══ */
{
  const blk = slice('  // ── 「과거 데이터 선택」 목록 닫기 ──', '  var cd = useState(false);');
  t('★ 바깥 클릭을 듣는 자리가 생겼다', /document\.addEventListener\('mousedown', onDocDown\)/.test(blk), true);
  t('★ 닫을 때 목록을 비운다', /setAutoResults\(\[\]\); setAutoIdx\(-1\);/.test(blk), true);
  t('★ 목록 안을 누르면 안 닫는다 (선택이 먹통되지 않게)',
    /closest\('\[data-autocomplete\]'\)/.test(blk), true);
  t('★ 입력칸을 눌러도 안 닫는다', /closest\('\[data-autocomplete-input\]'\)/.test(blk), true);
  t('★ 열려 있을 때만 듣는다 (평소엔 리스너를 안 건다)',
    /if\(autoResults\.length === 0\) return;/.test(blk), true);
  t('★ 닫힐 때 리스너를 뗀다 (쌓이면 느려진다)',
    /return function\(\)\{ document\.removeEventListener\('mousedown', onDocDown\); \};/.test(blk), true);
  t('열림 여부가 바뀔 때만 다시 건다', /\}, \[autoResults\.length\]\);/.test(blk), true);
}
// 실제로 판정 함수가 의도대로 동작하는지 — 안/밖을 흉내내 확인
{
  function makeCloser(){
    let cleared = 0;
    const ctx = {
      setAutoResults(){ cleared++; },
      setAutoIdx(){},
      handler:null,
      document:{
        addEventListener(_, fn){ ctx.handler = fn; },
        removeEventListener(){ ctx.handler = null; }
      }
    };
    vm.createContext(ctx);
    // useEffect 본문만 떼어 그대로 실행한다
    const body = slice('    function onDocDown(e){', '    // 캡처 단계에서 들어야');
    vm.runInContext(body + '\ndocument.addEventListener("mousedown", onDocDown);', ctx);
    return { ctx, cleared: () => cleared };
  }
  const mk = (matches) => ({ closest: (sel) => (matches.indexOf(sel) >= 0 ? {} : null) });
  {
    const { ctx, cleared } = makeCloser();
    ctx.handler({ target: mk([]) });
    t('★ 아무 데나 누르면 닫힌다', cleared(), 1);
  }
  {
    const { ctx, cleared } = makeCloser();
    ctx.handler({ target: mk(['[data-autocomplete]']) });
    t('★ 목록 안을 누르면 안 닫힌다', cleared(), 0);
  }
  {
    const { ctx, cleared } = makeCloser();
    ctx.handler({ target: mk(['[data-autocomplete-input]']) });
    t('★ 입력칸을 누르면 안 닫힌다', cleared(), 0);
  }
  {
    const { ctx, cleared } = makeCloser();
    ctx.handler({ target: null });                    // 이상한 이벤트
    t('target 이 없어도 안 터지고 닫는다', cleared(), 1);
  }
  {
    const { ctx, cleared } = makeCloser();
    ctx.handler({ target: {} });                      // closest 없는 노드(텍스트 등)
    t('closest 없는 대상도 안 터진다', cleared(), 1);
  }
}

/* ═══ 2. ★ 이미 정해진 회사에서는 칸을 눌렀다고 목록이 다시 열리지 않는다 ═══ */
{
  const blk = slice('          onFocus:function(e){', '          placeholder:\'회사명 또는 엑셀 한 행 붙여넣기\'');
  t('★ 계약 수정 화면에서는 안 연다', /if\(props\.cur\) return;/.test(blk), true);
  t('★ 이미 업체를 특정했으면 안 연다', /if\(\(f\.company\|\|\{\}\)\.companyId\) return;/.test(blk), true);
  t('신규·미특정일 때는 예전대로 연다', /searchPastCompanies\(f\.company\.name\.toLowerCase\(\)\)/.test(blk), true);
  t('왜 그렇게 했는지 적어 뒀다', /회사정보 위를 덮어/.test(blk), true);
}
t('입력칸에 표식을 붙였다', /'data-autocomplete-input':'1'/.test(src), true);
t('목록에도 표식이 그대로 있다', /'data-autocomplete':'1'/.test(src), true);

/* ═══ 3. ★ 업태·종목이 딸려오는지 줄에서 미리 보인다 ═══ */
function rowsCtx(idx){
  const c = {
    console, Object, JSON, Array, String, Number, parseInt, isNaN, RegExp,
    window: { pucardsIdx: idx },
    pcNormCo(s){ return String(s||'').toLowerCase().replace(/[\s\-()·.,]/g,''); },
    pcIsCeoTitle(s){ return /대표/.test(String(s||'')); },
    pcToContact(x, primary){ return { name:x.n||'', primary:!!primary }; }
  };
  vm.createContext(c);
  // pcCompanyRows 는 pcGroupCompanies 로 색인을 회사 단위로 묶는다 — 같이 실어야 한다
  vm.runInContext(slice('function pcGroupCompanies(){', 'function pcPersonRows(q){'), c);
  return c;
}
{
  // 업태가 색인에 있는 경우
  const idx = {
    b1: { k:'biz', c:'주식회사 에이치비씨솔루션', bz:'7888803295', ceo:'김영범', bt:'서비스업', bi:'소프트웨어개발' },
    c1: { k:'card', c:'주식회사 에이치비씨솔루션', n:'김영범', ti:'대표' }
  };
  const rows = rowsCtx(idx).pcCompanyRows('에이치비씨');
  t('회사 줄이 나온다', rows.length >= 1, true);
  t('★ 업태가 있으면 줄에 보여 준다', /업태 서비스업\/소프트웨어개발/.test(rows[0].sub), true);
  t('★ 고르면 업태가 딸려온다', rows[0]._pc.bizType, '서비스업');
  t('★ 종목도 딸려온다', rows[0]._pc.bizCategory, '소프트웨어개발');
}
{
  // ★ 업태가 색인에 없는 경우 — 이게 대표가 겪은 상황이다
  const idx = {
    b1: { k:'biz', c:'주식회사 에이치비씨솔루션', bz:'7888803295', ceo:'김영범' },
    c1: { k:'card', c:'주식회사 에이치비씨솔루션', n:'김영범', ti:'대표' }
  };
  const rows = rowsCtx(idx).pcCompanyRows('에이치비씨');
  /* ★ 문구를 그대로 박아 두지 않는다 — 2026-08-11 에 「업태 없음」이 거짓이 됐다.
     이제는 색인에 없어도 고를 때 기업정보함 «원본» 에서 마저 읽으므로 「없음」이라 단정하면
     거짓말이다. 규칙만 못 박는다: 사업자등록증이 있는 회사면 업태 사정을 어떻게든 알린다. */
  t('★ 업태가 색인에 없으면 그 사정을 줄에서 알린다', /업태/.test(rows[0].sub), true);
  t('★ 「없다」고 단정하지 않는다 (원본에 있을 수 있다)', /업태 없음/.test(rows[0].sub), false);
  t('★ 그때 색인에서 딸려오는 업태는 빈 값 (원본은 고른 뒤에 읽는다)', rows[0]._pc.bizType, '');
  t('원본을 읽어 갈 열쇠(사업자등록증 카드 id)가 딸려온다', rows[0]._pc.bizId, 'b1');
  t('사업자번호·대표는 그대로 보인다',
    /7888803295/.test(rows[0].sub) && /대표 김영범/.test(rows[0].sub), true);
}
{
  // 업태만 있고 종목이 없어도 알려준다
  const idx = { b1: { k:'biz', c:'가나상사', bz:'1234567890', bt:'제조업' } };
  const rows = rowsCtx(idx).pcCompanyRows('가나');
  t('업태만 있어도 보여 준다', /업태 제조업/.test(rows[0].sub), true);
  t('없는 종목 때문에 빈 슬래시가 붙지 않는다', /업태 제조업\//.test(rows[0].sub), false);
}
{
  // 사업자등록증 없이 명함만 있는 회사 — 업태 얘기 자체를 꺼내지 않는다
  const idx = { c1: { k:'card', c:'다라기업', n:'홍길동', ti:'과장' } };
  const rows = rowsCtx(idx).pcCompanyRows('다라');
  t('★ 사업자등록증이 없으면 업태 표시를 안 한다', /업태/.test(rows[0].sub), false);
  t('명함 장수는 보인다', /명함 1장/.test(rows[0].sub), true);
}

/* ═══ 4. 고를 때 업태·종목이 실제로 넘어가는가 (덮어쓰지 않고 빈 칸만) ═══ */
{
  /* ⚠ 2026-09-05 다시 겨눔 — 예전에는 onSelectPastCompany 를 쟀는데, 그것은
     «아무도 안 부르는» 쌍둥이였다(걷어냄). 기업정보함에서 고르는 일은
     fillCompanyImagesFromPucards 가 한다 — 규칙은 그대로다(빈 칸일 때만 채운다). */
  const blk = slice('  async function fillCompanyImagesFromPucards(row, want){', '\n  }');
  t('★ 기업정보함에서 업태를 가져온다', /row\.bizType\s+&&\s+!cur\.bizType/.test(blk), true);
  t('★ 종목도 가져온다', /row\.bizCategory\s+&&\s+!cur\.bizCategory/.test(blk), true);
  t('★ 이미 적어 둔 업태를 덮지 않는다 (빈 칸일 때만)',
    /!cur\.bizType/.test(blk), true);
}
{
  /* ⚠ 2026-09-05 다시 겨눔 — 표지가 onSelectPastCompany «안»에 있었다(걷어냄).
     과거 계약·업체에서 고르는 일은 fillFromPast 가 한다.
     ⚠ 규칙이 조금 다르다 — 그쪽은 고른 기록으로 회사 칸을 «통째로» 새로 세우므로
       「빈 칸일 때만」이 아니다. 그래서 여기서는 «업태·종목이 함께 넘어가는가»만 본다.
       빈 칸만 채우는 규칙은 기업정보함 경로(위 덩이)가 지킨다. */
  const blk = slice('  function fillFromPast(picked){', '\n  }');
  t('과거 계약·업체에서도 업태를 가져온다', /bizType: src\.bizType \|\| ''/.test(blk), true);
  t('과거 계약·업체에서도 종목을 가져온다', /bizCategory: src\.bizCategory \|\| ''/.test(blk), true);
}

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===');
process.exit(fail ? 1 : 0);
