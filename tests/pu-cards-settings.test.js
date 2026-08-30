/* 기업정보함 환경설정 — 정리 탭을 다른 탭과 같은 모양으로, 사이드바 버튼 간격
   ★ 폰(모바일 시트)에서 부르는 경로는 예전 그대로여야 한다 — 여기서 절대 바뀌면 안 된다.
   ★ 안 보이던 글자 버그(--ink 변수가 밝은 화면에 안 덮어써짐)를 고쳤는지도 함께 확인한다. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const HTML = path.join(__dirname, '..', 'pu-cards.html');
const src = fs.readFileSync(HTML, 'utf8');

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

/* ── 샌드박스: openCleanupCenter + 그 도우미들만 떼어 온다 ── */
function makeCtx(counts, panelTarget){
  const written = { inline: null, modal: null, setSub: null };
  const els = {};
  const trashObj = {};
  for(let i = 0; i < (counts.trash || 0); i++) trashObj['t' + i] = 1;
  const c = {
    console, Object, JSON, Array, String, Number, isNaN, RegExp,
    state: { tab: 'card', trash: trashObj, setSub: '' },
    $(id){ if(!els[id]) els[id] = { innerHTML: '' }; return els[id]; },
    findDupGroups(){ return new Array(counts.dup || 0); },
    findSimilarGroups(){ return new Array(counts.sim || 0); },
    emptyTargets(){ return new Array(counts.empty || 0); },
    mojibakeTargets(){ return new Array(counts.moji || 0); },
    nameFixList(){ return new Array(counts.nameFix || 0); },
    mixedFixList(){ return new Array(counts.mixedFix || 0); },
    toast(){}
  };
  vm.createContext(c);
  vm.runInContext("const esc = s => String(s??'').replace(/[&<>\"']/g, ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[ch]));", c);
  // ★ classifyPlan (규칙 분류, Task 3) 은 이 슬라이스 범위 안에 함께 딸려 오는데,
  //   _canon 은 그 범위 밖(파일 앞쪽)에 있어 여기서 별도로 심어 준다.
  vm.runInContext("const _canon = s => String(s||'').replace(/^\\s*\\d+\\s*[.)\\-]?\\s*/,'').replace(/\\s/g,'');", c);
  vm.runInContext(slice("let _panelTarget='modal';", "const SET_TABS="), c);
  vm.runInContext(slice('function openCleanupCenter(){', 'async function mergeSimilar'), c);
  // ★ _panelTarget 은 let 으로 선언돼 컨텍스트 객체의 속성으로 안 보인다 —
  //   밖에서 c._panelTarget = ... 로 대입해도 실제 스크립트가 보는 값은 안 바뀐다.
  //   같은 컨텍스트 안에서 다시 실행해 재대입해야 한다.
  vm.runInContext('_panelTarget = ' + JSON.stringify(panelTarget) + ';', c);
  c.showPanel = function(html){
    if(panelTarget === 'inline') written.inline = html;
    else written.modal = html;
  };
  return { c, written };
}

/* ═══ 1. ★ 폰 경로(모달) — 예전 그대로, 손대지 않았다 ═══ */
{
  const { c, written } = makeCtx({ dup: 3, sim: 0, empty: 0, moji: 0, nameFix: 0, mixedFix: 0 }, 'modal');
  c.openCleanupCenter();
  const h = written.modal;
  t('★ 모달 경로는 여전히 mhead 를 쓴다', /<div class="mhead">/.test(h), true);
  t('★ 모달 경로는 여전히 ditem 줄이다', /class="ditem"/.test(h), true);
  t('★ 모달 경로는 여전히 큰 버튼(.btn)이다', /class="btn primary"/.test(h), true);
  t('건수가 그대로 보인다', /3묶음/.test(h), true);
  t('설명 문장이 줄 안에 그대로 있다', /합치면 빈 칸이 서로 채워집니다/.test(h), true);
  t('★ inline 에는 안 쓴다', written.inline, null);
}

/* ═══ 2. ★ PC 환경설정(인라인) — 다른 탭과 같은 setbtn 모양으로 바뀐다 ═══ */
{
  const { c, written } = makeCtx({ dup: 3, sim: 5, empty: 0, moji: 0, nameFix: 0, mixedFix: 0 }, 'inline');
  c.openCleanupCenter();
  const h = written.inline;
  t('★ 인라인 경로는 setbtn 을 쓴다', /class="setbtn"/.test(h), true);
  t('★ 인라인 경로엔 mhead 가 없다', /class="mhead"/.test(h), false);
  t('★ 인라인 경로엔 큰 버튼(.btn primary/ghost)이 없다', /class="btn (primary|ghost)"/.test(h), false);
  t('★ 인라인 경로엔 ditem 줄이 없다', /class="ditem"/.test(h), false);
  t('안내문이 setnote 로 나온다', /class="setnote"/.test(h), true);
  t('건수가 짧게 보인다', /3묶음/.test(h), true);
  t('★ 모달에는 안 쓴다', written.modal, null);
}

/* ═══ 3. ★ 설명이 사라지지 않고 말풍선(title)으로 옮겨진다 ═══ */
{
  const { c, written } = makeCtx({ dup: 3, sim: 0, empty: 0, moji: 0, nameFix: 0, mixedFix: 0 }, 'inline');
  c.openCleanupCenter();
  const h = written.inline;
  t('★ 설명 문장이 title 말풍선에 남아 있다',
    /title="[^"]*전화·이메일·\(이름\+회사\)가 같은 항목[^"]*"/.test(h), true);
  t('★ 말풍선 안엔 HTML 태그가 그대로 새지 않는다 (굵게 표시하는 항목)', (() => {
    const { c: c2, written: w2 } = makeCtx({ dup: 0, sim: 0, empty: 5, moji: 0, nameFix: 0, mixedFix: 0 }, 'inline');
    c2.openCleanupCenter();
    return /title="[^"]*<b>[^"]*"/.test(w2.inline);
  })(), false);
}

/* ═══ 4. ★ 확인 필요 없음(초록 ✓)과 있음(주황 숫자)이 인라인에서도 갈린다 ═══ */
{
  const { c, written } = makeCtx({ dup: 0, sim: 0, empty: 0, moji: 0, nameFix: 0, mixedFix: 0 }, 'inline');
  c.openCleanupCenter();
  const h = written.inline;
  t('전부 0건이면 이상 없음이 여럿 보인다', (h.match(/✓ 이상 없음/g) || []).length >= 4, true);
  t('★ 이상 없음은 초록', /color:var\(--green\)">✓ 이상 없음/.test(h), true);
}
{
  const { c, written } = makeCtx({ dup: 7, sim: 12, empty: 2, moji: 1, nameFix: 3, mixedFix: 4, trash: 5 }, 'inline');
  // ★ 규칙 분류(Task 3) 항목도 걸리는 게 있어야 이 줄만 "이상 없음"으로 남지 않는다 —
  //   기본 규칙(CLASSIFY_DEFAULTS)의 '노무' 단어가 걸리도록 미분류 명함 하나를 심는다.
  c.state.items = { x1: { id:'x1', kind:'card', company:'노무법인테스트', group:'' } };
  c.openCleanupCenter();
  const h = written.inline;
  t('건수가 있으면 이상 없음이 하나도 안 보인다', /이상 없음/.test(h), false);
  t('★ 건수는 주황', /color:var\(--orange\);font-weight:700">7묶음/.test(h), true);
  t('모든 건수가 보인다', ['7묶음','12묶음','2장','1장','3건','4건'].every(x => h.indexOf(x) >= 0), true);
}

/* ═══ 5. 사업자등록증 탭에서는 명함 전용 항목(유사 후보·깨진 글자)이 안 나온다 — 양쪽 경로 다 ═══ */
{
  const { c, written } = makeCtx({ dup: 1, sim: 9, empty: 0, moji: 9, nameFix: 0, mixedFix: 0 }, 'inline');
  c.state.tab = 'biz';
  c.openCleanupCenter();
  const h = written.inline;
  t('사업자등록증 탭엔 유사 후보가 없다', /유사 후보/.test(h), false);
  t('사업자등록증 탭엔 깨진 글자가 없다', /깨진 글자/.test(h), false);
  t('사업자등록증이라고 안내에 나온다', /사업자등록증<\/b> 탭/.test(h), true);
}

/* ═══ 6. 배선 — 코드에 실제로 반영됐는지 ═══ */
t('★ 정리 탭 함수가 실제로 _panelTarget 을 본다', /const inline = _panelTarget==='inline';/.test(src), true);
t('★ 인라인일 때 setbtn 을 만드는 코드가 있다', /class="setbtn" title="\$\{esc\(plain\(desc\)\)\}"/.test(src), true);
t('설명에서 태그를 지우는 정리 함수가 있다', /const plain = s=>String\(s\)\.replace\(\/<\[\^>\]\+>\/g,''\);/.test(src), true);

/* ═══ 7. ★ 안 보이던 글자 — CSS 변수 덮어쓰기가 환경설정 화면까지 간다 ═══ */
/* 2026-08-30 색을 팔레트로 줄이며 값이 바뀌었다 — «어떤 색»이 아니라
   「밝은 테마 변수가 두 곳에 함께 걸린다 · 모달만 밝은 바탕과 짙은 글자를 갖는다」를 본다 */
const CP = require('./lib-palette.js');
t('★ 밝은 색 변수가 #pcSettings 에도 적용된다',
  /body\.pc \.modal,body\.pc #pcSettings\{\s*\n\s*--ink:#[0-9a-fA-F]{3,6};/.test(src), true);
const pcModal = (src.match(/body\.pc \.modal\{([^}]*background[^}]*)\}/) || [])[1] || '';
t('모달 전용 배경·글자색은 그대로 모달에만',
  !!pcModal && CP.isLight(CP.colorOf(pcModal, 'background')) && CP.isDark(CP.colorOf(pcModal, 'color')), true);

/* ═══ 8. 사이드바 — 자료함·환경설정 사이 간격 ═══ */
t('★ 사이드바 설정 버튼에 아래쪽 여백이 생겼다', /\.pcside-settings\{[^}]*margin-bottom:8px/.test(src), true);
t('마지막 버튼은 여백이 없다(불필요한 빈 공간 방지)', /\.pcside-settings:last-child\{margin-bottom:0\}/.test(src), true);

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===');
process.exit(fail ? 1 : 0);
