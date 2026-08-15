/* 사건 단계 기한 → 캘린더·내 프로젝트·업무관리 연결
   기한이 한 군데라도 안 보이거나, 사람이 적은 "다음 할 일"을 덮으면 사고가 된다. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ERP  = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8');
const WORK = fs.readFileSync(path.join(__dirname, '..', 'work.html'), 'utf8');

function sliceOf(src, a, b){
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

/* ══════ 1. pu-erp — 단계 기한 계산 (연결의 근원) ══════ */
const erp = (function(){
  let store = {};
  const c = {
    console, Date, Math, Object, JSON, Array, String, Number, parseInt, isNaN, RegExp,
    window:{}, showToast(){}, todayYMD(){ return '2026-08-04'; },
    dbGet(k, d){ return (k in store) ? store[k] : d; }, dbSet(k, v){ store[k] = v; return true; }
  };
  vm.createContext(c);
  vm.runInContext(sliceOf(ERP, 'var BIZ_CASE_STAGE_KEY', 'window.caseSyncStageCode'), c);
  return c;
})();

// 지노위 판정서 07-15 송달 → 중노위 재심 기한
const oneStage = { stages:[{ id:'s1', code:'lrc-local', noticeDate:'2026-07-15' }] };
t('단계에서 기한이 나온다', !!erp.caseNextDue(oneStage, '2026-07-16'), true);
t('단계가 없으면 없다', erp.caseNextDue({ id:'c1' }, '2026-07-16'), null);
t('빈 stages 도 없다', erp.caseNextDue({ stages:[] }, '2026-07-16'), null);
t('★ 이미 지난 기한은 안 알린다', erp.caseNextDue(oneStage, '2027-01-01'), null);
// 여러 단계 중 가장 이른 것
const many = { stages:[
  { id:'s1', code:'lrc-central', noticeDate:'2026-09-01' },
  { id:'s2', code:'lrc-local',   noticeDate:'2026-07-15' }
]};
{
  const a = erp.caseStageDue(many.stages[0], erp.caseStageInfo('lrc-central'));
  const b = erp.caseStageDue(many.stages[1], erp.caseStageInfo('lrc-local'));
  const early = (a && b) ? (a.due < b.due ? a.due : b.due) : (a || b || {}).due;
  t('★ 가장 이른 기한을 고른다', erp.caseNextDue(many, '2026-07-16').due, early);
}

/* ══════ 2. pu-erp 캘린더 — 단계 기한이 실려 오는가 ══════ */
t('캘린더에 단계 기한 층이 있다', /type:'stage-due'/.test(ERP), true);
t('사람이 넣은 마감일 층은 그대로', /type:'deadline'/.test(ERP), true);
t('★ 단계 기한은 끌어 옮길 수 없다',
  /type:'stage-due'[\s\S]{0,400}?draggable:false/.test(ERP), true);
t('확인 안 된 기한에 (확인) 을 붙인다',
  /type:'stage-due'[\s\S]{0,300}?dueVerified \? '' : '\(확인\)'/.test(ERP), true);
t('확인 여부로 색을 나눈다',
  /type:'stage-due'[\s\S]{0,500}?info\.dueVerified \? '#991b1b' : '#d97706'/.test(ERP), true);
t('종료·보관된 사건은 캘린더에서 뺀다',
  /3-2\) 사건 단계 기한[\s\S]{0,300}?c\.permanentArchived \|\| c\.closedDate/.test(ERP), true);
t('달 범위 밖은 넣지 않는다',
  /type:'stage-due'[\s\S]{0,900}/.test(ERP) && /!inCalRange\(d\.due\)/.test(ERP), true);
t('상세창이 어디서 고치는지 알려준다', /사건 ▸ 심급·단계에서 계산된 기한/.test(ERP), true);
t('단계 기한 함수 없으면 캘린더가 건너뛴다',
  /if\(typeof caseStageDue === 'function'\)\{\s*[\r\n]+\s*cases\.forEach/.test(ERP), true);

/* ══════ 3. pu-erp 내 프로젝트 D-day ══════ */
t('D-day 가 단계 기한도 같이 본다',
  /사람이 넣은 마감일\) \+ 심급·단계에서 계산된 법정 기한 중 가장 가까운 것/.test(ERP), true);
t('★ deadlines 만 보던 조건이 사라졌다', /if\(type==='case' && x\.deadlines && x\.deadlines\.length>0\)\{/.test(ERP), false);
t('무슨 기한인지 넘긴다', /dDayWhy:dDayWhy/.test(ERP), true);
// 주석만 남고 실제로 꺼져 있는 일이 없게, D-day 를 고르는 그 블록을 떼어내 확인한다
{
  const blk = sliceOf(ERP, '// D-day: 사건은 deadlines', 'return {');
  t('★ D-day 블록이 x.stages 를 실제로 돈다', /x\.stages\.forEach\(function\(stg\)\{/.test(blk), true);
  t('★ 그 안에서 단계 기한을 계산한다', /caseStageDue\(stg, _si\)/.test(blk), true);
  t('★ 계산된 기한을 후보에 넣는다', /if\(_sd\) consider\(_sd\.due/.test(blk), true);
  t('★ 조건이 꺼져 있지 않다', /if\(\s*false/.test(blk), false);
  t('사람이 넣은 마감일도 그대로 후보', /\(x\.deadlines\|\|\[\]\)\.forEach/.test(blk), true);
  t('단계 기한 함수가 없을 때만 건너뛴다',
    /if\(typeof caseStageDue === 'function' && Array\.isArray\(x\.stages\)\)\{/.test(blk), true);
}
t('D-day 칸이 말풍선으로 알려준다',
  /it\.dDayDate \+ \(it\.dDayWhy \? ' · ' \+ it\.dDayWhy : ''\)/.test(ERP), true);

// D-day 고르는 규칙을 실제로 돌려 본다 (buildItems 안의 로직과 같은 술어)
{
  const today = new Date('2026-08-04T00:00:00'); today.setHours(0,0,0,0);
  function pickD(x){
    let nearest = null;
    const consider = (dateStr, why) => {
      if(!dateStr) return;
      const dd = new Date(dateStr); dd.setHours(0,0,0,0);
      const diff = Math.round((dd - today)/86400000);
      if(nearest === null || Math.abs(diff) < Math.abs(nearest.diff)) nearest = { date:dateStr, diff, why };
    };
    (x.deadlines||[]).forEach(d => consider(d.date, d.title || '마감'));
    (x.stages||[]).forEach(stg => {
      const si = erp.caseStageInfo(stg && stg.code) || {};
      const sd = erp.caseStageDue(stg, si);
      if(sd) consider(sd.due, (si.short || si.name || '단계') + ' 기한' + (si.dueVerified ? '' : '(확인)'));
    });
    return nearest;
  }
  t('마감일만 있으면 그것', pickD({ deadlines:[{ date:'2026-08-20', title:'이유서' }] }).date, '2026-08-20');
  t('단계만 있으면 그것', !!pickD({ stages:[{ code:'lrc-local', noticeDate:'2026-08-01' }] }), true);
  t('아무것도 없으면 null', pickD({}), null);
  {
    const sd = erp.caseStageDue({ code:'lrc-local', noticeDate:'2026-08-01' }, erp.caseStageInfo('lrc-local')).due;
    // 단계 기한을 훨씬 뒤로 밀어 둔 마감일과 겨루게 한다
    const r = pickD({ deadlines:[{ date:'2026-12-31', title:'먼 마감' }],
                      stages:[{ code:'lrc-local', noticeDate:'2026-08-01' }] });
    t('★ 단계 기한이 더 가까우면 그것이 D-day', r.date, sd);
    t('★ 무슨 기한인지 함께 온다', /기한/.test(r.why), true);
  }
  {
    const r = pickD({ deadlines:[{ date:'2026-08-05', title:'가까운 마감' }],
                      stages:[{ code:'wc-review', noticeDate:'2026-08-01' }] });
    t('사람이 넣은 마감일이 더 가까우면 그것', r.date, '2026-08-05');
    t('그 마감일의 이름이 온다', r.why, '가까운 마감');
  }
  t('★ 단계 기한이 확인 안 됐으면 표시가 붙는다',
    /\(확인\)/.test(pickD({ stages:[{ code:'lrc-local', noticeDate:'2026-08-01' }] }).why), true);
}

/* ══════ 4. pu-erp → 업무관리 한 방향 내려보내기 ══════ */
t('사건일 때만 내려보낸다', /if\(w\.ref\.type === 'case' && typeof caseNextDue === 'function'\)\{/.test(ERP), true);
t('★ 끝난 사건의 기한은 안 내려보낸다', /isItemClosed\(pe\) \? null : caseNextDue\(pe\)/.test(ERP), true);
t('pe_due 라는 별도 칸을 쓴다', /work_erp\/items\/' \+ wid \+ '\/pe_due'/.test(ERP), true);
t('★ 다음 할 일(next)을 덮지 않는다',
  /pe_due'\] = _want/.test(ERP) && !/pe_due[\s\S]{0,200}\/next'\] =/.test(ERP), true);
t('바뀐 게 없으면 쓰지 않는다', /if\(!_same\)\{ up\['work_erp\/items\/' \+ wid \+ '\/pe_due'\]/.test(ERP), true);
t('확인 여부도 함께 보낸다', /verified: _ndi\.dueVerified === true/.test(ERP), true);
t('★ 기준선 분기보다 앞에 둔다 (새로 연결한 건도 첫 패스에 받는다)',
  ERP.indexOf("w.ref.type === 'case' && typeof caseNextDue") < ERP.indexOf("if(!snap.synced_at){"), true);
t('★ pick3(양방향) 를 타지 않는다',
  /pe_due[\s\S]{0,400}?pick3/.test(ERP.slice(ERP.indexOf("사건 단계 기한 → 업무관리"), ERP.indexOf("var peClosed = isItemClosed(pe)"))), false);

// 같은 값이면 다시 쓰지 않는가 (쓰기가 반복되면 동기화가 멈추지 않는다)
{
  const cmp = (cur, want) => (cur && want)
    ? (String(cur.date||'') === want.date && String(cur.label||'') === want.label
       && (cur.verified === true) === want.verified)
    : (!cur && !want);
  const W = { date:'2026-07-25', label:'지노위 기한', verified:false };
  t('같으면 안 쓴다', cmp({ date:'2026-07-25', label:'지노위 기한', verified:false }, W), true);
  t('날짜가 다르면 쓴다', cmp({ date:'2026-07-26', label:'지노위 기한', verified:false }, W), false);
  t('이름이 다르면 쓴다', cmp({ date:'2026-07-25', label:'중노위 기한', verified:false }, W), false);
  t('확인 여부가 다르면 쓴다', cmp({ date:'2026-07-25', label:'지노위 기한', verified:true }, W), false);
  t('없다가 생기면 쓴다', cmp(null, W), false);
  t('있다가 없어지면 쓴다', cmp({ date:'2026-07-25', label:'지노위 기한', verified:false }, null), false);
  t('둘 다 없으면 안 쓴다', cmp(null, null), true);
  t('verified 가 없는 옛 값도 false 로 본다', cmp({ date:'2026-07-25', label:'지노위 기한' }, W), true);
}

/* ══════ 5. 업무관리 화면 ══════ */
const wctx = (function(){
  const c = { console, Date, Math, Object, JSON, Array, String, Number, parseInt, isNaN, RegExp,
    esc(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m])); },
    todayStr(){ return '2026-08-04'; } };
  vm.createContext(c);
  vm.runInContext(sliceOf(WORK, 'function dday(', 'function ddayHTML('), c);
  vm.runInContext(sliceOf(WORK, 'function itemDue(it){', '/* ── 기록 쓰기'), c);
  return c;
})();

// itemDue — 임박 판정·정렬이 보는 기한
t('아무 기한도 없으면 빈 값', wctx.itemDue({}), '');
t('다음 할 일만 있으면 그것', wctx.itemDue({ next:{ date:'2026-08-20' } }), '2026-08-20');
t('기한만 있으면 그것', wctx.itemDue({ due:'2026-08-20' }), '2026-08-20');
t('★ 원래 순서 유지 — 다음 할 일이 기한보다 앞선다',
  wctx.itemDue({ next:{ date:'2026-08-20' }, due:'2026-01-01' }), '2026-08-20');
t('★ 단계 기한이 더 이르면 그것이 기준',
  wctx.itemDue({ next:{ date:'2026-08-20' }, pe_due:{ date:'2026-08-10' } }), '2026-08-10');
t('★ 단계 기한이 더 늦으면 원래 값 그대로',
  wctx.itemDue({ next:{ date:'2026-08-10' }, pe_due:{ date:'2026-08-20' } }), '2026-08-10');
t('단계 기한만 있으면 그것', wctx.itemDue({ pe_due:{ date:'2026-08-10' } }), '2026-08-10');
t('단계 기한에 날짜가 없으면 무시', wctx.itemDue({ due:'2026-08-20', pe_due:{ date:'' } }), '2026-08-20');
t('pe_due 가 null 이어도 안 터진다', wctx.itemDue({ due:'2026-08-20', pe_due:null }), '2026-08-20');

// ★ dday() 는 stub 이 아닌 실제 시계를 본다 — 날짜를 고정값으로 박으면 날이 바뀔 때마다 깨진다.
//   오늘을 기준으로 며칠 뒤/앞 날짜를 만들어 쓴다.
const ymdFromToday = n => {
  const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() + n);
  return d.getFullYear() + '-' + ('0'+(d.getMonth()+1)).slice(-2) + '-' + ('0'+d.getDate()).slice(-2);
};

// 임박(D-7) 판정에 단계 기한이 들어오는가 — 이것이 "기한 알림"의 실체다
{
  const near = it => { const n = wctx.dday(wctx.itemDue(it)); return n !== null && n <= 7; };
  t('★ 단계 기한이 임박하면 알린다', near({ next:{ date:ymdFromToday(200) }, pe_due:{ date:ymdFromToday(2) } }), true);
  t('단계 기한이 멀면 안 알린다', near({ next:{ date:ymdFromToday(200) }, pe_due:{ date:ymdFromToday(120) } }), false);
  t('★ 단계 기한이 지났으면 알린다', near({ pe_due:{ date:ymdFromToday(-34) } }), true);
}

// 배지
{
  const html = wctx.sdueHTML({ pe_due:{ date:ymdFromToday(2), label:'중노위 기한', verified:true } });
  t('배지에 남은 날짜', /D-2/.test(html), true);
  t('배지에 단계 이름', /중노위 기한/.test(html), true);
  t('확인된 기한엔 (확인) 없음', /\(확인\)/.test(html), false);
  t('확인된 기한은 unv 아님', /class="sdue"/.test(html), true);
  const un = wctx.sdueHTML({ pe_due:{ date:ymdFromToday(2), label:'재심사 기한', verified:false } });
  t('★ 확인 안 된 기한엔 (확인)', /\(확인\)/.test(un), true);
  t('확인 안 된 기한은 색이 다르다', /class="sdue unv"/.test(un), true);
  t('★ 확인하라고 어디로 갈지 알려준다', /환경설정 ▸ 업무유형/.test(un), true);
  t('여기서 못 바꾼다고 알린다', /여기서는 바꿀 수 없습니다/.test(un), true);
  t('지난 기한은 D+', /D\+34/.test(wctx.sdueHTML({ pe_due:{ date:ymdFromToday(-34), label:'x' } })), true);
  t('오늘이면 D-Day', /D-Day/.test(wctx.sdueHTML({ pe_due:{ date:ymdFromToday(0), label:'x' } })), true);
  t('pe_due 없으면 빈 문자열', wctx.sdueHTML({}), '');
  t('날짜 없으면 빈 문자열', wctx.sdueHTML({ pe_due:{ label:'x' } }), '');
  t('null 이어도 안 터진다', wctx.sdueHTML(null), '');
  t('★ 이름에 태그가 섞여도 그대로 나가지 않는다',
    /&lt;script&gt;/.test(wctx.sdueHTML({ pe_due:{ date:'2026-08-06', label:'<script>' } })), true);
}

// 화면 배선
t('업무 줄에 배지를 붙인다', /nx \+= sdueHTML\(it\);/.test(WORK), true);
t('★ 목록과 종료화면 두 곳 모두', (WORK.match(/nx \+= sdueHTML\(it\);/g) || []).length, 2);
t('★ 다음 할 일 계산을 덮지 않고 이어 붙인다', /nx=it\.next&&it\.next\.text\?ddayHTML/.test(WORK), true);
t('상세창에 단계 기한 칸이 있다', /⚖ 단계 기한/.test(WORK), true);
t('★ 상세창의 단계 기한은 입력칸이 아니다',
  /⚖ 단계 기한<\/span>'\+sdueHTML\(it\)/.test(WORK), true);
t('복사에 단계 기한 줄이 들어간다', /'단계 기한: '\+\(it\.pe_due&&it\.pe_due\.date/.test(WORK), true);
t('복사에서 확인 필요를 밝힌다', /\(확인 필요\)/.test(WORK), true);

// 캘린더 레이어
t('캘린더에 단계 기한 층이 있다', /\['sdue','단계 기한'/.test(WORK), true);
// 네 번째 칸이 기본 켬. 뒤에 짧은 이름·묶음이 더 붙어도 뜻은 같다.
t('기본으로 켜져 있다', /\['sdue','단계 기한',\s*'#b91c1c',\s*1\s*[,\]]/.test(WORK), true);
t('★ 캘린더에서 끌어 옮길 수 없다',
  /if\(L\.sdue\)[\s\S]{0,400}?add\(pd\.date,\{k:'sdue'[^}]*\}\)/.test(WORK)
  && !/k:'sdue'[^}]*drag:1/.test(WORK), true);
t('확인 여부로 색을 나눈다', /pd\.verified\?'#b91c1c':'#b45309'/.test(WORK), true);
t('그 달에 없는 날짜는 안 넣는다', /if\(!pd\|\|!pd\.date\|\|!map\[pd\.date\]\) return;/.test(WORK), true);
t('남의 건은 안 보인다(팀 보기 제외)',
  /if\(L\.sdue\)[\s\S]{0,200}?if\(!teamWide&&!isOf\(it,who\)\) return;/.test(WORK), true);

// 업무관리는 이 칸을 되돌려 쓰지 않는다
t('★ 업무관리가 pe_due 를 저장하지 않는다',
  /patchItem\([^)]*pe_due|pe_due:\s*\{|\/pe_due'\]\s*=/.test(WORK), false);

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===');
process.exit(fail ? 1 : 0);
