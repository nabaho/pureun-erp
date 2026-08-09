/* 거래내역 열 맞추기 · 줄 번호 · 묶어 확정 확인창 · 「세는 시점」
   ★ 세는 시점 버그: 요약칩과 확정 단추를 추천(incSug)이 채워지기 «전» 에 세는 바람에
     화면에는 ⚠️ 가 가득한데 「확정 가능 1건」이라고 적혔다(대표 화면 제보 2026-08-09).
     그때 세어지는 것은 사람이 직접 고른 것뿐이라 자동으로 찾아낸 건 하나도 안 잡혔다.
   ★ 열 맞추기: 한 칸에 업체·항목·달·담당을 다 밀어 넣어 줄마다 길이가 달랐다
     (대표: "기업이름 담당자 현황 등 열을 맞춰야 비교하기 편하다"). */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const HTML = path.join(__dirname, '..', 'pu-erp.html');
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

const FL = slice('function FinanceLedger(){', '\nfunction FinanceIncome');

/* ══════ ① 세는 시점 — 추천이 채워진 뒤여야 한다 ══════ */
const iSug   = FL.indexOf('incSug = _sug.incSug');
const iCount = FL.indexOf('var readyRows = [], stCnt');
const iRender= FL.indexOf("h('tbody',null,incList.slice(0,ldShow)");
t('추천을 화면 자료에 옮기는 곳이 있다', iSug > 0, true);
t('세는 곳이 있다', iCount > 0, true);
t('★ 추천을 채운 뒤에 센다', iSug < iCount, true);
t('세고 나서 그린다', iCount < iRender, true);
t('세는 곳이 하나뿐이다', (FL.match(/var readyRows = \[\], stCnt/g) || []).length, 1);
t('줄과 요약이 같은 함수로 묶음을 만든다', /function rowGroups\(row\)/.test(FL), true);
t('세는 쪽이 그 함수를 쓴다', /var grp = rowGroups\(row\);/.test(FL), true);
t('그리는 쪽도 그 함수를 쓴다', /var _grp=rowGroups\(row\);/.test(FL), true);
t('그리는 쪽이 묶음을 따로 만들지 않는다',
  /else _grp=erpGroupPendByCompany\(_sug\);/.test(FL), false);

/* ══════ ② 열 맞추기 ══════ */
/* 입금 표의 머리만 떼어 온다 — FinanceLedger 안에는 CMS 표 등 다른 표도 있어서
   맨 앞 thead 를 집으면 엉뚱한 표를 재게 된다. */
const _headFrom = FL.lastIndexOf("h('thead'", iRender);
const HEAD = FL.slice(_headFrom, iRender);
['#', '입금액', '날짜', '적요', '📁 업체', '항목 · 현황', '담당', '처리'].forEach(function(h){
  t('머리칸 「' + h + '」', HEAD.indexOf("'" + h + "'") > 0, true);
});
t('업체 칸에 너비가 정해져 있다', /width:'150px'[\s\S]{0,80}?📁 업체/.test(HEAD), true);
t('담당 칸에 너비가 정해져 있다', /width:'58px'[\s\S]{0,60}?'담당'/.test(HEAD), true);
// 넘치는 글자는 그 칸 안에서만 잘린다 (줄 전체가 밀리면 세로 줄맞춤이 깨진다)
t('칸마다 넘침 처리를 공통으로 쓴다',
  /var _cell=Object\.assign\(\{\},tdS,\{padding:'5px 6px',overflow:'hidden',/.test(FL), true);
t('업체는 제 칸에 홀로 있다', /_grp\.length \? _grp\[0\]\.company/.test(FL), true);
t('담당이 제 칸에 있다', /pItem \? \(_pendStaff\(pItem\)\|\|'—'\) : '—'/.test(FL), true);
t('금액은 오른쪽 정렬·자릿수 고정', /textAlign:'right',padding:'5px 6px',whiteSpace:'nowrap',\s*\n\s*fontWeight:700,color:'#16a34a',fontSize:'12px',fontVariantNumeric:'tabular-nums'/.test(FL), true);

/* ══════ ③ 줄 번호 ══════ */
t('통장 입금 왼쪽에 번호가 붙는다', /fontVariantNumeric:'tabular-nums'\}\)\},_ri\+1\)/.test(FL), true);
t('번호 칸이 머리에도 있다', /width:'32px',textAlign:'right',padding:'6px 3px'\}\)\},'#'\)/.test(HEAD), true);

/* ══════ ④ 항목 이름 줄이기 — 같은 말 반복 없애기 ══════ */
const kctx = { console, Object, JSON, Array, String, Number, parseInt, isNaN, Math, RegExp };
vm.createContext(kctx);
vm.runInContext(slice('function erpKindLabel(g){', '\nif(typeof window'), kctx);

t('같은 종류가 세 번 반복되면 한 번만',
  kctx.erpKindLabel({kinds:['자문료(7월)', '자문료(6월) 밀림', '자문료(5월) 밀림']}), '자문료');
t('다른 종류는 함께 보여준다',
  kctx.erpKindLabel({kinds:['컨설팅(계약금)', '사건(착수)']}), '컨설팅·사건');
t('괄호만 다른 것도 한 번만',
  kctx.erpKindLabel({kinds:['사건(착수)', '사건(성공보수)']}), '사건');
t('빈 값도 안 터진다', kctx.erpKindLabel(null), '');
t('빈 이름은 건너뛴다', kctx.erpKindLabel({kinds:['', null, '기금']}), '기금');
t('화면이 이 함수를 쓴다', /erpKindLabel\(_grp\[0\]\)/.test(FL), true);
t('옛 반복 표시가 없다', /_grp\[0\]\.kinds\.filter\(Boolean\)\.join\('·'\)/.test(FL), false);

/* ══════ ⑤ 「외 N곳 골라야 합니다」 줄이기 ══════ */
t('업체 수만 짧게 적는다', /'· 업체 '\+_grp\.length\+'곳'/.test(FL), true);
t('옛 긴 문구가 없다', /곳 — 골라야 합니다'/.test(FL), false);
t('밀린 달도 짧게', /'달 밀림'/.test(FL), true);

/* ══════ ⑥ 이미 확정된 건 표시를 아이콘으로 ══════ */
t('아이콘 하나로 줄인다', /'🔁'\)/.test(FL), true);
t('마우스를 올리면 무엇인지 말해 준다', /같은 금액이 이미 확정돼 있습니다/.test(FL), true);
t('옛 긴 문구가 없다', /'이미 확정된 건일 수 있음'/.test(FL), false);

/* ══════ ⑦ 처리 단추 크기 통일 · CMS 겹침 ══════ */
t('단추 크기를 함수 하나로 맞춘다', /function _actBtn\(bg, fg, bd\)/.test(FL), true);
t('최소 너비를 못 박았다', /minWidth:'44px'/.test(FL), true);
['확정', '확인', 'CMS', '찾기', '보류'].forEach(function(b){
  t('단추 「' + b + '」 가 같은 틀을 쓴다',
    new RegExp("style:_actBtn\\([^)]*\\)\\},(_open\\?'접기':)?'" + b + "'").test(FL), true);
});
t('CMS 줄에는 확인 단추를 겹쳐 놓지 않는다',
  /_st\.state==='check' && !isCms && h\('button'/.test(FL), true);

/* ══════ ⑧ 묶어 확정 — 먼저 보여주고 확인받는다 ══════ */
t('무엇을 합치는지 먼저 묻는다', /고른 통장 ' \+ _gk\.length \+ '줄을 한 항목에 합쳐 확정합니다/.test(FL), true);
t('줄마다 날짜·적요·금액을 적어 준다', /String\(r\.date\|\|''\)\.slice\(5\)[\s\S]{0,120}?\(r\.amount\|\|0\)\.toLocaleString\(\)/.test(FL), true);
t('합계도 보여준다', /'\\n\\n합계 ' \+ _gsum\.toLocaleString\(\)/.test(FL), true);
t('취소하면 창이 안 열린다', /if\(!\(await popConfirm\([\s\S]{0,400}?\)\)\) return;\s*\n\s*setSpSel\(\{\}\); setSpGap\(''\); setSpQ\(''\);/.test(FL), true);

/* ══════ ⑨ 표 칸 수가 서로 맞는가 ══════ */
const thN = (HEAD.match(/h\('th'/g) || []).length;
t('머리 칸이 열 개다', thN, 10);
t('펼침 줄이 표 전체를 덮는다', /colSpan:10,style:\{padding:'8px 10px 10px 62px'/.test(FL), true);
t('더보기 줄도 표 전체를 덮는다', /colSpan:10,style:\{padding:'8px',textAlign:'center',background:'#f8fafc'/.test(FL), true);
// 합계 줄의 칸 수도 머리와 같아야 한다 (2 + 1 + 1 + 2 + 4 = 10)
const FOOT = FL.slice(FL.indexOf("background:'#f0fdf4',borderTop:'2px solid #bbf7d0'"), FL.indexOf("// ── 출금 테이블"));
const spans = (FOOT.match(/colSpan:(\d+)/g) || []).map(function(s){ return parseInt(/\d+/.exec(s)[0], 10); });
const tds = (FOOT.match(/h\('td'/g) || []).length;
const spanSum = spans.reduce(function(a, b){ return a + b; }, 0);
t('합계 줄 칸 수가 머리와 같다', spanSum + (tds - spans.length), 10);

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===');
process.exit(fail ? 1 : 0);
