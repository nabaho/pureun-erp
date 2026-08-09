/* 같은 사업장 계약 중복 판정 3단계 + 세부 종류 이름 붙이기
   - 세부 종류는 코드(typeCodes[종류])로 저장된다 → 이름으로 바꿔야 사람이 읽는다
   - 이름이 같은 유형이 둘 있다(산업일자리: 한국능률협회 / 충남기업혁신협회) → 기관까지 붙어야 구분된다
   - 판정: 🔴 dup(같은 세부 종류 진행 중) / 🟡 again(같은 세부 종류 종료=재계약) / 🟢 diff(세부 종류 다름) */
const fs = require('fs'), vm = require('vm'), path = require('path');
const TARGET = process.argv[2] || path.join(__dirname, '..', 'pu-erp.html');
const html = fs.readFileSync(TARGET, 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
}
function eq(name, a, b) { ok(name + '  (' + JSON.stringify(a) + ')', JSON.stringify(a) === JSON.stringify(b), 'want ' + JSON.stringify(b)); }
function count(s) { return html.split(s).length - 1; }
function slice(a, b) {
  const i = html.indexOf(a); if (i < 0) throw new Error('못찾음: ' + a);
  const j = html.indexOf(b, i); if (j < 0) throw new Error('끝 못찾음: ' + b);
  return html.slice(i, j);
}

/* ── 실제 코드를 그대로 떼어 모래상자에서 돌린다 (시드도 파일 원본) ── */
const ctx = { console, Object, Array, String, Number, JSON, Math, window: {}, __store: {} };
ctx.dbGet = function (k, d) { return Object.prototype.hasOwnProperty.call(ctx.__store, k) ? ctx.__store[k] : d; };
ctx.dbSet = function (k, v) { ctx.__store[k] = v; };
vm.createContext(ctx);
vm.runInContext(slice('var BIZ_CASE_SEED = [', 'var CONSULTING_DEMO_SEED'), ctx);          // 유형 시드 원본
vm.runInContext(slice('var CONTRACT_KINDS = [', '// 종류별 세부 분류 라벨'), ctx);           // CONTRACT_KINDS + kindInfo
vm.runInContext(slice('function getKindTypes(kindV, includeHidden){', '// ============ 과거 회사 통합 검색'), ctx);
vm.runInContext(slice('// ============ 계약의 세부 종류', '// 계약번호 자동 생성'), ctx);     // 이번에 추가한 helpers

const subLabel = ctx.contractSubtypeLabel;
const subCode = ctx.contractSubtypeCode;
const verdict = ctx.contractDupVerdict;
const worst = ctx.contractDupWorst;
const needConfirm = ctx.contractDupNeedsConfirm;
function label(c, k) { const r = subLabel(c, k); return r ? r.label : null; }
function cons(code, extra) { return Object.assign({ kinds: ['consulting'], typeCodes: { consulting: code } }, extra || {}); }

/* ══ ① 세부 종류 이름 — 이름이 같으면 기관까지 ══ */
ok('helpers 가 window 에 노출돼 있다', typeof subLabel === 'function' && typeof verdict === 'function');
eq('cons-job-neung 은 기관까지', label(cons('cons-job-neung'), 'consulting'), '산업일자리 (한국능률협회)');
eq('cons-job-chung 은 기관까지', label(cons('cons-job-chung'), 'consulting'), '산업일자리 (충남기업혁신협회)');
ok('★ 이름이 같은 두 유형이 서로 다르게 보인다',
   label(cons('cons-job-neung'), 'consulting') !== label(cons('cons-job-chung'), 'consulting'),
   '둘이 똑같이 보이면 대표가 구분할 수 없다');
eq('기관 없는 유형은 괄호를 붙이지 않는다', label(cons('cons-techguard'), 'consulting'), '기술보호울타리');
eq('기관 없는 유형의 agency 는 빈 문자열', subLabel(cons('cons-techguard'), 'consulting').agency, '');
eq('일터상생혁신도 기관까지', label(cons('cons-ilteo'), 'consulting'), '일터상생혁신 (노사발전재단)');
eq('사건 유형도 이름으로', label({ kinds: ['case'], typeCodes: { case: 'case-dismiss' } }, 'case'), '부해등');
eq('기금 유형도 이름으로', label({ kinds: ['fund'], typeCodes: { fund: 'fund-single' } }, 'fund'), '사내근로복지기금');
eq('code 도 함께 돌려준다', subLabel(cons('cons-hr'), 'consulting').code, 'cons-hr');

/* ══ ② 모르는 코드 · 빈 값 ══ */
eq('등록되지 않은 코드는 null', subLabel(cons('cons-없는것'), 'consulting'), null);
eq('세부 종류가 비어 있으면 null', subLabel({ kinds: ['consulting'], typeCodes: {} }, 'consulting'), null);
eq('typeCodes 자체가 없어도 null', subLabel({ kinds: ['consulting'] }, 'consulting'), null);
eq('종류를 안 주면 null', subLabel(cons('cons-hr'), ''), null);
eq('레코드가 없으면 null', subLabel(null, 'consulting'), null);
eq('세부 종류 코드 뽑기', subCode(cons('cons-hr'), 'consulting'), 'cons-hr');
eq('없으면 빈 문자열', subCode({ kinds: ['consulting'] }, 'consulting'), '');

/* ══ ③ 레거시 typeCode — 종류가 하나일 때만 쓴다 ══ */
eq('옛 데이터: 종류 1개면 typeCode 를 쓴다',
   label({ kinds: ['consulting'], typeCode: 'cons-seed' }, 'consulting'), '씨앗컨설팅');
eq('옛 데이터: kind(단수) 필드도 본다',
   label({ kind: 'consulting', typeCode: 'cons-clinic' }, 'consulting'), '현장클리닉');
eq('★ 종류가 여러 개면 typeCode 를 쓰지 않는다 (어느 종류의 코드인지 알 수 없다)',
   label({ kinds: ['consulting', 'case'], typeCode: 'cons-seed' }, 'consulting'), null);
eq('종류가 여러 개여도 typeCodes 는 정상',
   label({ kinds: ['consulting', 'case'], typeCodes: { consulting: 'cons-seed', case: 'case-wage' } }, 'consulting'), '씨앗컨설팅');
eq('typeCode 가 다른 종류의 것이면 쓰지 않는다',
   label({ kinds: ['case'], typeCode: 'case-wage' }, 'consulting'), null);
eq('이름이 박힌 옛 레코드는 마지막 수단으로 살린다',
   label({ kinds: ['consulting'], consultingType: '옛컨설팅이름' }, 'consulting'), '옛컨설팅이름');

/* ══ ④ 숨긴 유형도 이름이 유지된다 (옛 계약이 가리킬 수 있다) ══ */
ctx.__store['biz_cons_types'] = ctx.BIZ_CONS_SEED.concat([
  { code: 'cons-retired', short: '폐지', name: '없어진컨설팅', agency: '옛기관', sortOrder: 200, hidden: true }
]);
eq('숨긴 유형도 이름으로 나온다', label(cons('cons-retired'), 'consulting'), '없어진컨설팅 (옛기관)');
ok('숨긴 유형은 새 등록 목록에는 안 보인다',
   ctx.getKindTypes('consulting').every(function (t) { return t.code !== 'cons-retired'; }));

/* ══ ⑤ 판정 3단계 ══ */
const form = cons('cons-techguard');
const running = cons('cons-techguard');
const closed = cons('cons-techguard', { status: 'closed', closedDate: '2026-01-31' });
const cancelled = cons('cons-techguard', { status: 'cancelled' });
const other = cons('cons-hr');

eq('같은 세부 종류 + 진행 중 → dup', verdict(running, form).verdict, 'dup');
eq('같은 세부 종류 + 종료 → again', verdict(closed, form).verdict, 'again');
eq('같은 세부 종류 + 취소 → again', verdict(cancelled, form).verdict, 'again');
eq('세부 종류가 다르면 → diff', verdict(other, form).verdict, 'diff');
eq('이름이 같아도 코드가 다르면 diff (산업일자리 두 기관)',
   verdict(cons('cons-job-neung'), cons('cons-job-chung')).verdict, 'diff');
eq('겹치는 종류를 알려준다', verdict(running, form).shared, ['consulting']);
eq('diff 는 세부 종류 미입력 표시가 없다', verdict(other, form).missingSubtype, false);

/* 한쪽이라도 비어 있으면 판단 불가 → 안전하게 dup */
eq('기존 계약의 세부 종류가 비면 dup', verdict({ kinds: ['consulting'] }, form).verdict, 'dup');
eq('그때 세부 종류 미입력 표시가 붙는다', verdict({ kinds: ['consulting'] }, form).missingSubtype, true);
eq('지금 작성 중인 쪽이 비어도 dup', verdict(running, { kinds: ['consulting'], typeCodes: {} }).verdict, 'dup');
eq('둘 다 비어도 dup', verdict({ kinds: ['consulting'] }, { kinds: ['consulting'] }).verdict, 'dup');
eq('비어 있는 쪽은 same 이 아니다', verdict({ kinds: ['consulting'] }, form).same, []);

/* 종류가 안 겹치면 비교 자체를 하지 않는다 */
eq('★ 종류가 다르면 비교 대상이 아니다 (null)',
   verdict({ kinds: ['case'], typeCodes: { case: 'case-wage' } }, form), null);
eq('종류가 없으면 null', verdict({}, form), null);
eq('지금 작성 중인 종류가 없으면 null', verdict(running, { kinds: [] }), null);

/* 여러 종류를 함께 계약한 경우 */
const bothForm = { kinds: ['consulting', 'case'], typeCodes: { consulting: 'cons-techguard', case: 'case-wage' } };
const bothSameOne = { kinds: ['consulting', 'case'], typeCodes: { consulting: 'cons-hr', case: 'case-wage' } };
eq('겹치는 종류 중 하나라도 같으면 dup', verdict(bothSameOne, bothForm).verdict, 'dup');
eq('같은 것으로 잡힌 종류를 알려준다', verdict(bothSameOne, bothForm).same, ['case']);
eq('다른 것으로 잡힌 종류도 알려준다', verdict(bothSameOne, bothForm).diff, ['consulting']);

/* ══ ⑥ 여러 건이면 가장 센 판정을 따른다 ══ */
const vDup = verdict(running, form), vAgain = verdict(closed, form), vDiff = verdict(other, form);
eq('diff + dup → dup', worst([vDiff, vDup]), 'dup');
eq('diff + again → again', worst([vDiff, vAgain]), 'again');
eq('again + dup → dup', worst([vAgain, vDup]), 'dup');
eq('전부 diff → diff', worst([vDiff, vDiff]), 'diff');
eq('겹치는 게 없으면 null', worst([null, null]), null);
eq('빈 목록도 null', worst([]), null);

/* ══ ⑦ 저장 전 확인 체크박스는 🔴 일 때만 ══ */
eq('dup 이면 확인 필요', needConfirm('dup'), true);
eq('again 이면 확인 안 받는다', needConfirm('again'), false);
eq('diff 이면 확인 안 받는다', needConfirm('diff'), false);
eq('겹치는 게 없으면 확인 안 받는다', needConfirm(null), false);

/* ══ ⑦-2 드롭다운을 안 건드려도 화면에 골라진 값으로 판정한다 (헛경고 방지) ══ */
const fill = ctx.contractFormSubtypeFill;
eq('세부 종류를 안 고르면 그 종류의 첫 항목으로 본다',
   fill({ kinds: ['case'], typeCodes: {} }).typeCodes.case, 'case-hr');
eq('이미 고른 값은 건드리지 않는다',
   fill({ kinds: ['consulting'], typeCodes: { consulting: 'cons-cci' } }).typeCodes.consulting, 'cons-cci');
eq('상담사항은 세부 종류가 없으니 채우지 않는다',
   fill({ kinds: ['consult'], typeCodes: {} }).typeCodes.consult, undefined);
eq('원본 폼을 바꾸지 않는다 (사본을 돌려준다)', (function () {
   const src = { kinds: ['case'], typeCodes: {} }; fill(src); return src.typeCodes.case;
 })(), undefined);
eq('★ 채워 넣고 나면 세부 종류가 다른 사건끼리는 diff 로 갈린다',
   verdict({ kinds: ['case'], typeCodes: { case: 'case-wage' } },
           fill({ kinds: ['case'], typeCodes: {} })).verdict, 'diff');
eq('같은 사건 유형이면 여전히 dup',
   verdict({ kinds: ['case'], typeCodes: { case: 'case-hr' } },
           fill({ kinds: ['case'], typeCodes: {} })).verdict, 'dup');
eq('상담사항끼리는 판단 근거가 없으니 dup (확인받는다)',
   verdict({ kinds: ['consult'] }, fill({ kinds: ['consult'], typeCodes: {} })).verdict, 'dup');

/* ══ ⑧ 화면 배선 (HTML) ══ */
ok('판정 함수를 배너에서 쓴다', count('contractDupVerdict(c, fEff)') === 1);
ok('배너·저장 확인창 둘 다 화면에 골라진 세부 종류로 본다',
   count('contractFormSubtypeFill(f)') === 2, count('contractFormSubtypeFill(f)') + '곳');
ok('가장 센 판정으로 배너 색을 정한다', count('contractDupWorst(') === 2, count('contractDupWorst(') + '곳');
ok('체크박스는 needConfirm 일 때만 그린다', count('needConfirm && h(') === 1);
ok('★ 체크박스 문구는 그대로 남아 저장을 막는다',
   count('✔ 동일 사업장이지만 새로운 계약 진행임을 확인했습니다 (저장 허용)') === 1);
ok('옛 판정(isNewKind)은 사라졌다', count('isNewKind') === 0, count('isNewKind') + '곳');
ok('옛 세부종류 읽기(c.consultingType || c.caseType || c.fundType || c.programName)는 사라졌다',
   count("c.consultingType || c.caseType || c.fundType || c.programName") === 0);
ok('종류 › 세부종류 문구를 한 곳(kindSubText)에서 만든다',
   count("function kindSubText(rec, k){") === 1
   && count("kindName(k) + ' › ' + (lb ? lb.label : '세부 종류 미입력')") === 1);
ok('지금 작성 중 줄과 기존 계약 줄이 같은 문구 함수를 쓴다',
   count('kindSubText(fEff, k)') === 1 && count('kindSubText(c, k)') === 1);
ok('상담사항은 세부 종류가 없는 종류라 미입력이라고 하지 않는다',
   count("if(k === 'consult') return kindName(k);") === 1);
ok('세부 종류 미입력은 확인 필요라고 알린다', count('세부 종류 미입력 — 확인 필요') === 1);
ok('결론 한 줄 3가지가 있다',
   count('→ 세부 종류가 달라 중복이 아닙니다. 그대로 저장하셔도 됩니다.') === 1
   && count('이 진행 중입니다. 새로 만들지 말고 기존 계약을 확인하세요.') === 1
   && count('이 종료돼 있습니다 — 재계약이면 정상입니다.') === 1);
ok('종류 자체가 안 겹칠 때는 "종류가 달라"라고 말한다 (세부 종류 얘기를 하지 않는다)',
   count('→ 종류가 달라 중복이 아닙니다. 그대로 저장하셔도 됩니다.') === 1
   && count('같은 사업장, 다른 종류 계약 — 신규 진행 정상') === 1
   && count('같은 사업장, 다른 세부 종류 계약 — 신규 진행 정상') === 1);
ok('지금 작성 중 줄에 세부 종류가 붙는다', count("mySubs ? h('span', null, ' · ', h('b', null, mySubs)) : null") === 1);
ok('이력 창도 세부 종류를 이름으로 보여준다', count("' 유형: ' + sub.label") === 1);
ok('이력 창 금액은 종류별 amounts 에서 읽는다', count("var a = Number((c.amounts && c.amounts[k]) || 0);") === 1);
ok('저장 전 확인창도 세부 종류를 적는다', count("var _sub = contractSubtypeLabel(c, k);") === 1);

/* 명함첩에서 회사 찾기 */
ok('PucardsCompanyPickerModal 이 한 번 정의돼 있다', count('function PucardsCompanyPickerModal(props){') === 1);
ok('PucardsCompanyPickerModal 이 정의 1곳 + 사용 1곳 이상 나온다',
   count('PucardsCompanyPickerModal') >= 2, count('PucardsCompanyPickerModal') + '곳');
ok('회사 검색은 회사 묶음 함수를 그대로 쓴다 (묶는 코드를 두 번 만들지 않았다)',
   count('function pcGroupCompanies(){') === 1 && count('pcGroupCompanies()') === 3,
   'pcGroupCompanies() ' + count('pcGroupCompanies()') + '곳');
/* (2026-08-09 대표 지시) 사진은 가져오지 않는다 — 정보만.
   "굳이 명함이나 사업자등록증 사진을 가지고 올 필요는 없어 보인다".
   사진은 명함첩에 이미 있고, 계약 기록에 base64 로 박히면 레코드가 부풀어
   저장이 조용히 실패한다(예전 「계약 저장 실패」의 원인). */
ok('첨부칸 두 곳(대표자 명함·사업자등록증)에서 같은 버튼을 쓴다 — dropZone 한 곳에 있다',
   count("'📇 명함첩 정보 가져오기'") === 1 && count("dropZone('businessCardImg', '📇 대표자 명함', '')") === 1
   && count("dropZone('bizLicenseImg',   '📋 사업자등록증', '')") === 1);
ok('사진은 가져오지 않는다', count('사진을 명함첩 사진으로 바꿉니다') === 0
   && count('function pcFetchImages(') === 0);
ok('사진이 필요하면 명함첩에서 보라고 길을 준다', count("'명함첩에서 보기'") === 1);
// 2026-08-03: 회사를 고르면 담당자·회사정보를 가져온다.
// 2026-08-09: 사진을 빼면서 문구도 '가져올 정보가 없습니다'로 바뀌었다.
ok('가져올 게 하나도 없을 때만 없다고 말한다',
   count('이 회사에서 새로 가져올 정보가 없습니다 (이미 다 들어와 있습니다)') === 1
   && count('이 회사는 명함첩에 사진이 없습니다') === 0);
ok('사업자등록증·명함 표시를 붙인다', count("'사업자등록증 있음'") === 1 && count("'명함 ' + r.cardCount + '장'") === 1);
/* ⚠ 2026-08-07 다시 겨눔 — 64a9562(기업담당자를 명함첩에서 골라 담기)가 세 번째
   검색칸을 더하면서 이 검사가 2개로 못 박아 둔 탓에 **모든 앱의 배포가 막혔다**.
   지켜야 할 것은 칸의 개수가 아니라 **모든 칸이 같은 문구를 쓰는 것**이다
   (문구가 갈리면 같은 기능이 자리마다 달라 보인다). */
const PC_PH = "'명함첩 ' + Object.keys(window.pucardsIdx||{}).length + '건에서 검색'";
ok('명함첩 건수 안내 문구를 그대로 쓴다', count(PC_PH) >= 2);
ok('★ 명함첩 검색칸 문구가 자리마다 갈리지 않았다',
   (html.match(/'명함첩 ' \+ [^\r\n]*?'건[^\r\n]*?검색'/g) || []).every(function (s) { return s === PC_PH; }));
ok('자동완성에도 명함첩 표시가 붙는다', count("'📇 명함첩' + ((r._pc.bizId || r._pc.cardId) ? ' · 사진 있음' : '') + ' '") === 1);
ok('자동완성 목록 머리글에 명함첩 건수를 적는다', count("'📇 명함첩 ' + pcN + '건 — 누르면 사진까지 가져옵니다'") === 1);

/* 담당자 헤더 한 줄 */
const ctHead = slice('// 헤더 한 줄: 번호 · 주담당자 · 동일인 · 명함첩 · 명함 첨부 · 삭제',
                     '// 명함첩에서 가져온 담당자: 출처·시점 표시');
ok('한 줄 헤더에 주담당자 표시가 있다', ctHead.indexOf('✓ 주담당자') > 0 && ctHead.indexOf('주담당자로') > 0);
ok('한 줄 헤더에 동일인 체크박스가 있다(라벨은 짧게)', ctHead.indexOf("'🔗 동일인'") > 0);
ok('동일인 뜻은 마우스를 올리면 그대로 보인다', ctHead.indexOf('🔗 사업자(대표) 동일인 —') > 0);
ok('한 줄 헤더에 명함첩 찾기 버튼이 있다', ctHead.indexOf("'📇 명함첩'") > 0 && ctHead.indexOf('setPcPickIdx(idx)') > 0);
ok('한 줄 헤더에 명함 첨부가 있다', ctHead.indexOf("'📎 명함 첨부'") > 0);
ok('명함 첨부는 끌어놓기·Ctrl+V 를 그대로 받는다',
   ctHead.indexOf('onDrop:function(e){ e.preventDefault(); putCard(') > 0 && ctHead.indexOf('onPaste:function(e){') > 0);
ok('명함 OCR 은 그대로 살아 있다', ctHead.indexOf("setOcrField('contact-'+idx)") > 0);
ok('명함이 붙어 있으면 그 자리에 작은 그림으로 보여준다', ctHead.indexOf("height:'22px'") > 0);
ok('한 줄 헤더에 삭제(×) 가 있다', ctHead.indexOf('removeContact(idx)') > 0);
ok('동일인일 때는 명함첩·첨부가 숨는다 (두 컨트롤 모두 !locked)',
   (ctHead.match(/!locked/g) || []).length === 2, (ctHead.match(/!locked/g) || []).length + '곳');
ok('옛 담당자 명함 드롭존 블록은 사라졌다', count('담당자 명함 첨부 (OCR)') === 0);
ok('동일인 동기화 안내는 별도 줄로 그대로 남아 있다',
   count('🔒 회사정보(대표자/연락처)와 동기화 중 - 회사정보 수정 시 자동 반영.') === 1);
ok('명함첩 출처 줄도 그대로 남아 있다', count(' 가져옴 · 자동연동 안 됨') === 1);

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===');
process.exit(fail ? 1 : 0);
