/* 메일 «속»을 읽어 담당자로 나누기 (대표 승인 목업 ㉮㉯, 2026-09-05)
   「메일 내부의 자료를 검토하고 연결시킬 수 있는지 확인 / 담당자에게 분류하는 기능」

   ★ 왜 만들었나 — 지금은 보낸이 «주소»로만 나눈다. 세무사무소 한 주소가 자문사 스무 곳
     메일을 보내고, 담당자 개인 네이버·한메일에는 회사 이름이 어디에도 없다. 그래서
     담당 모름이 1,600통이다. 제목과 본문 첫 줄에는 거의 늘 적혀 있고, 그 둘은 «이미
     손에 있다»(row.s · row.p) — 새로 받아 올 것이 없다.

   지키는 것.
   ① 이름이 «겹치는» 업체는 아예 안 짚는다 — 짚으면 «남의 회사» 담당자에게 간다
   ② 짧은 이름은 안 짚는다 — 두 글자면 엉뚱한 데서 걸린다
   ③ 끝난 업체·담당자 없는 업체는 안 짚는다 — 짚어도 갈 칸이 없다
   ④ 제목이 «먼저»다 — 그 메일이 무엇에 대한 것인지는 제목이 말한다
   ⑤ 그래도 «본문 첫 줄»을 본다 — 이 일의 값어치 절반이 거기 있다
   ⑥ 가장 «긴» 이름이 이긴다 — 「서산시」와 「서산시시설관리공단」
   ⑦ 우리 식구 주소는 업체에 안 잇는다 — 우리가 보낸 메일이다
   ⑧ 근거 «한 통»만으로는 안 켠다 — 단체 메일 한 통이 76통을 엉뚱한 사람에게 보낸다
   ⑨ 기계가 «혼자» 잇지 않는다 — 훑기에는 쓰기가 없고, 잇기는 사람이 확인한다
   ⑩ 한꺼번에 «한 번만» 쓰고, 실패하면 화면도 되돌린다
   ⑪ 이름만 담지 않는다 — 업체 «열쇠»를 함께 담는다(온톨로지)
   ⑫ 푸른이알피에 적기는 «기본이 꺼짐» — 다른 앱의 자료다 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { sliceFn } = require('./fnslice.js');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'pu-cards.html'), 'utf8');
/* 주석을 먼저 걷는다 — 잘 쓴 주석이 검사를 통과시키면 안 된다 */
const bare = app.replace(/\/\*[\s\S]*?\*\//g, ' ');

/* ── 진짜 함수를 그대로 태운다 ── */
function sandbox(cos){
  const ctx = { console };
  vm.createContext(ctx);
  vm.runInContext(`globalThis.ErpMatch = { ready:false, byName:{}, nameN:{}, nameByEmail:{},
    _norm(s){ return String(s||'').toLowerCase()
      .replace(/㈜|\\(주\\)|주식회사|주\\)|\\(유\\)|유한회사|농업회사법인|유한책임회사|합자회사|합명회사|재단법인|사단법인|의료법인|\\(재\\)|\\(사\\)/g,'')
      .replace(/[\\s\\-_.,·・()[\\]{}'"]/g,''); } };
    globalThis.mbMyAddr = () => '370-6@daum.net';
    globalThis._mbGsNames = null; globalThis._mbGsHead = null;`, ctx);
  /* 문턱 상수는 «소스에 적힌 값 그대로» 태운다 — 여기서 다시 적으면 앱과 달라진다 */
  ['MB_GUESS_MINLEN','MB_GUESS_MINEV','MB_GUESS_MINRATIO'].forEach(k=>{
    const m = bare.match(new RegExp('const ' + k + '\\s*=\\s*([0-9.]+)'));
    assert.ok(m, k + ' 을 소스에서 못 찾았습니다');
    vm.runInContext('const ' + k + ' = ' + m[1] + ';', ctx);
  });
  ['function mbGuessBust(','function mbGuessNames(','function mbGuessHead(',
   'function mbGuessIn(','function mbGuessOf(','function mbGuessOurs('].forEach(f=>{
    vm.runInContext(sliceFn(app, f), ctx);
  });
  const byName = {}, nameN = {};
  (cos||[]).forEach(c=>{
    const n = ctx.ErpMatch._norm(c.name);
    nameN[n] = (nameN[n]||0) + 1;
    if(!byName[n]) byName[n] = { company:c.name, main:(c.who===undefined?'김담당':c.who),
      id:(c.id||('co-'+n)), left:!!c.left };
  });
  ctx.ErpMatch.byName = byName; ctx.ErpMatch.nameN = nameN; ctx.ErpMatch.ready = true;
  ctx.mbGuessBust();
  return ctx;
}
const CO = [{ name:'㈜큐로에프앤비' }, { name:'주식회사 맘스터치앤컴퍼니' }];

/* ══════ ①②③ 안 짚는 것 ══════ */

test('★★ 이름이 «겹치는» 업체는 아예 안 짚는다 — 남의 회사 담당자에게 간다', () => {
  const one = sandbox([{ name:'행복한e치과의원', who:'김하나', id:'A' }]);
  assert.ok(one.mbGuessIn('행복한e치과의원 8월 급여'), '한 곳뿐일 때는 짚어야 합니다');
  const two = sandbox([{ name:'행복한e치과의원', who:'김하나', id:'A' },
                       { name:'행복한 e 치과의원', who:'박두울', id:'B' }]);
  assert.equal(two.mbGuessIn('행복한e치과의원 8월 급여'), null,
    '이름이 겹치는데도 짚습니다 — 둘 중 아무 쪽 담당자나 붙습니다');
});

test('★★ 짧은 이름은 안 짚는다 — 두 글자면 엉뚱한 데서 걸린다', () => {
  const ctx = sandbox([{ name:'대성' }, { name:'대성산업개발' }]);
  assert.equal(ctx.mbGuessIn('오늘 대성했습니다'), null,
    '두 글자 이름으로 짚습니다 — 아무 문장에서나 걸립니다');
  assert.ok(ctx.mbGuessIn('대성산업개발 근로계약서'), '긴 이름은 짚어야 합니다');
});

test('★★ 끝난 업체·담당자 없는 업체는 안 짚는다 — 짚어도 갈 칸이 없다', () => {
  const ended = sandbox([{ name:'끝난상사', left:true }]);
  assert.equal(ended.mbGuessIn('끝난상사 자문계약'), null, '끝난 업체를 짚습니다');
  const noWho = sandbox([{ name:'담당없는상사', who:'' }]);
  assert.equal(noWho.mbGuessIn('담당없는상사 자문계약'), null,
    '담당자가 없는 업체를 짚습니다 — 눌러도 보낼 사람이 없습니다');
});

/* ══════ ④⑤⑥ 무엇을 고르나 ══════ */

test('★★ 제목이 «먼저»다 — 무엇에 대한 메일인지는 제목이 말한다', () => {
  const ctx = sandbox(CO);
  const g = ctx.mbGuessOf({ s:'맘스터치앤컴퍼니 징계 검토', p:'큐로에프앤비 이혜은입니다' });
  assert.ok(g, '아무것도 못 찾았습니다');
  assert.equal(g.from, '제목', '본문이 제목을 이깁니다');
  assert.match(g.co, /맘스터치/, '제목의 업체가 아닙니다');
});

test('★★ 그래도 «본문 첫 줄»을 본다 — 이 일의 값어치 절반이 거기 있다', () => {
  /* 실제로 있던 메일이다 — 제목에는 업체가 없고 주소는 illycaffe.co.kr 인데
     업체는 ㈜큐로에프앤비였다(실측 2026-09-05). 본문을 안 보면 영영 못 찾는다. */
  const ctx = sandbox(CO);
  const g = ctx.mbGuessOf({ s:'출산휴가 및 육아휴직 종료 후 복직 관련 문의',
                            p:'안녕하세요, 노무사님. 큐로에프앤비 운영팀 이혜은차장입니다.' });
  assert.ok(g, '제목에 없으면 못 찾습니다 — 본문 첫 줄을 안 봅니다');
  assert.equal(g.from, '본문');
  assert.match(g.co, /큐로에프앤비/);
});

test('★★ 가장 «긴» 이름이 이긴다 — 「서산시」와 「서산시시설관리공단」', () => {
  const ctx = sandbox([{ name:'서산시', who:'김하나' },
                       { name:'서산시시설관리공단', who:'박두울' }]);
  const g = ctx.mbGuessIn('서산시시설관리공단 자문의뢰');
  assert.ok(g, '아무것도 못 찾았습니다');
  assert.equal(g.company, '서산시시설관리공단',
    '짧은 이름이 이겼습니다 — 큰 기관 메일이 시청 담당자에게 갑니다');
});

test('★ 업체를 안 말하는 메일에는 «아무 말도 안 한다»', () => {
  const ctx = sandbox(CO);
  assert.equal(ctx.mbGuessOf({ s:'[대한상의] 법정의무교육 안내', p:'회원사 여러분께' }), null,
    '엉뚱한 업체를 짚습니다');
});

/* ══════ ⑦ 우리 식구 ══════ */

test('★★ 우리 식구 주소는 업체에 안 잇는다 — 우리가 보낸 메일이다', () => {
  const ctx = sandbox(CO);
  assert.equal(ctx.mbGuessOurs('370-6@daum.net'), true, '우리 계정을 남으로 봅니다');
  assert.equal(ctx.mbGuessOurs('p001@pureun.kr'), true, '우리 직원 주소를 남으로 봅니다');
  assert.equal(ctx.mbGuessOurs('netty24@illycaffe.co.kr'), false, '남의 주소를 우리 것으로 봅니다');
});

/* ══════ ⑧ 문턱 — 여기가 가장 위험한 자리다 ══════ */

test('★★ 근거 «한 통»만으로는 안 켠다 — 단체 메일 한 통이 76통을 엉뚱한 사람에게 보낸다', () => {
  const ev = Number((bare.match(/const MB_GUESS_MINEV\s*=\s*([0-9.]+)/)||[])[1]);
  assert.ok(ev >= 2, '근거 ' + ev + '통이면 켭니다 — 실측 2026-09-05 에 공인노무사회(76통)와 '
    + '대한상공회의소(50통)가 어쩌다 한 번 언급한 업체로 통째로 이어질 뻔했습니다');
  const ratio = Number((bare.match(/const MB_GUESS_MINRATIO\s*=\s*([0-9.]+)/)||[])[1]);
  assert.ok(ratio > 0, '그 주소 메일의 «몫»을 안 봅니다 — 500통 중 3통도 켜집니다');
  /* ⚠ «어느 함수»에 있는지를 박지 않는다 — 줄 만드는 자리를 따로 뽑으면서 한 번 옮겼다.
       두 문턱이 실제로 쓰이는지는 아래 돌려 보는 검사들이 지킨다. 여기서는 있기만 본다. */
  assert.match(bare, /v\s*>=\s*MB_GUESS_MINEV/, '근거 문턱을 아무 데서도 안 씁니다');
  assert.match(bare, />=\s*MB_GUESS_MINRATIO/, '몫 문턱을 아무 데서도 안 씁니다');
});

/* 주소 한 개의 표를 줄 하나로 만드는 자리 — 진짜로 돌려 본다 */
function rowCtx(){
  const ctx = { console };
  vm.createContext(ctx);
  ['MB_GUESS_MINEV','MB_GUESS_MINRATIO'].forEach(k=>{
    const m = bare.match(new RegExp('const ' + k + '\\s*=\\s*([0-9.]+)'));
    vm.runInContext('const ' + k + ' = ' + m[1] + ';', ctx);
  });
  vm.runInContext(sliceFn(app, 'function mbGuessRow('), ctx);
  return ctx;
}
const EV = { co:'㈜보기', id:'co-1', who:'김담당', from:'본문', txt:'…' };

test('★★ 문턱에 못 미치는 줄도 «지우지 않고 꺼서» 내놓는다', () => {
  const ctx = rowCtx();
  /* 실제로 있던 것 — 공인노무사회 76통 가운데 한 통에만 업체 이름이 나왔다 */
  const thin = ctx.mbGuessRow('biztf@kcplaa.or.kr',
    { n:76, votes:{ 'co-1':1 }, ev:{ 'co-1':EV }, name:'오미나' });
  assert.ok(thin, '얇은 줄을 목록에서 «지웁니다» — 왜 그 주소가 안 나오는지 볼 자리가 없어집니다');
  assert.equal(thin.sure, false, '근거 한 통짜리를 켜 둡니다 — 76통이 엉뚱한 담당자에게 갑니다');
});

test('★★ 근거가 두텁고 «몫»도 크면 켠다', () => {
  const ctx = rowCtx();
  const sure = ctx.mbGuessRow('cust04@hanmail.net',
    { n:19, votes:{ 'co-1':19 }, ev:{ 'co-1':EV }, name:'이건철' });
  assert.equal(sure.sure, true, '열아홉 통이 다 같은 업체를 말하는데도 안 켭니다');
});

test('★★ 근거 통수만 보지 않는다 — «몫»이 작으면 단체 메일이다', () => {
  const ctx = rowCtx();
  const many = ctx.mbGuessRow('news@somewhere.or.kr',
    { n:500, votes:{ 'co-1':3 }, ev:{ 'co-1':EV }, name:'' });
  assert.equal(many.sure, false,
    '500통 가운데 3통으로 켭니다 — 497통이 엉뚱한 담당자에게 갑니다');
});

test('★★ 여러 업체가 섞인 표는 «줄을 안 만든다»', () => {
  const ctx = rowCtx();
  assert.equal(ctx.mbGuessRow('tax@office.kr',
    { n:20, votes:{ 'co-1':9, 'co-2':8 }, ev:{ 'co-1':EV, 'co-2':EV }, name:'' }), null,
    '세무사무소 한 주소를 한 업체로 정합니다 — 스무 곳 메일이 한 담당자에게 갑니다');
  assert.equal(ctx.mbGuessRow('x@y.kr', { n:5, votes:{}, ev:{}, name:'' }), null);
});

test('★★ 열 때는 «믿을 만한 것만» 켜 둔다', () => {
  const open = sliceFn(app, 'function mbGuessOpen(').replace(/\/\*[\s\S]*?\*\//g, ' ');
  assert.match(open, /if\s*\(\s*r\.sure\s*\)/,
    '얇은 것까지 켜진 채로 열립니다 — [잇기]를 한 번 누르면 그대로 나갑니다');
});

test('★★ 여러 업체가 섞인 주소는 아예 안 올린다 — 세무사무소가 그렇다', () => {
  const scan = sliceFn(app, 'function mbGuessScan(').replace(/\/\*[\s\S]*?\*\//g, ' ');
  assert.match(scan, /ks\.length\s*>\s*1/,
    '한 주소가 여러 업체를 말해도 하나로 정합니다 — 스무 곳 메일이 한 담당자에게 갑니다');
});

test('★★ 이미 담당자가 나오는 주소는 «주소로» 한 번만 묻는다', () => {
  const scan = sliceFn(app, 'function mbGuessScan(').replace(/\/\*[\s\S]*?\*\//g, ' ');
  assert.match(scan, /mbWhoOfRow\(\s*\{\s*e:\s*em\s*\}/,
    '줄마다 담당자를 묻습니다 — 한 통에 박아 둔 것이 섞여 「이미 잡힌다」를 잘못 답합니다');
});

/* ══════ ⑨⑩⑪⑫ 잇는 자리 ══════ */

test('★★ 훑기에는 «쓰기»가 없다 — 기계가 혼자 잇지 않는다', () => {
  const scan = sliceFn(app, 'function mbGuessScan(').replace(/\/\*[\s\S]*?\*\//g, ' ');
  assert.ok(!/\.set\(|\.update\(|\.remove\(|mbCfgSet\(/.test(scan),
    '훑기만 해도 무언가 저장합니다 — 짐작이 원본이 됩니다');
});

test('★★ 잇기는 «사람이 확인»한다 — 아니라고 하면 그 자리에서 돌아간다', () => {
  const ap = sliceFn(app, 'function mbGuessApply(').replace(/\/\*[\s\S]*?\*\//g, ' ');
  /* ⚠ confirm 이 «있는지»만 보면 안 된다 — 물어 놓고 답을 안 보는 코드도 통과한다.
       「아니라고 하면 돌아간다」가 규칙이므로 그 꼴을 본다. */
  assert.match(ap, /if\(!confirm\(/, '물어 놓고 답을 안 봅니다 — 취소해도 이어집니다');
  assert.match(ap, /\)\)\s*return;/, '아니라고 해도 그 자리에서 안 돌아갑니다');
  const iAsk = ap.indexOf('confirm(');
  const iPut = ap.search(/\.update\(|_mbCo\[key\]\s*=/);
  assert.ok(iAsk > 0 && iPut > iAsk, '묻기 «전»에 이어 버립니다');
});

test('★★ 한꺼번에 «한 번만» 쓴다 — 서른다섯 번 쓰고 서른다섯 번 알리지 않는다', () => {
  const ap = sliceFn(app, 'function mbGuessApply(').replace(/\/\*[\s\S]*?\*\//g, ' ');
  assert.ok(!/mbCfgSet\(/.test(ap),
    '주소마다 따로 저장합니다 — 알림이 그 수만큼 뜨고, 반쯤 저장된 채로 끊길 수 있습니다');
  assert.match(ap, /ref\(\)\.update\(\s*up\s*\)/, '한 번에 쓰지 않습니다');
});

test('★★ 실패하면 화면도 «되돌린다» — 이었다고 보이는데 새로고침하면 사라지면 안 된다', () => {
  const ap = sliceFn(app, 'function mbGuessApply(').replace(/\/\*[\s\S]*?\*\//g, ' ');
  assert.match(ap, /\.catch\(/, '실패를 안 받습니다');
  /* ⚠ 「before 라는 말이 나오나」로는 모자란다 — 담아 두는 줄만 빼도 그대로 통과한다
       (이빨 확인이 그 구멍을 잡았다). 담는 자리와 되돌리는 자리를 «따로» 본다. */
  assert.match(ap, /before\[key\]\s*=\s*_mbCo\[key\]/,
    '되돌릴 옛 값을 «담아 두지» 않습니다 — 이어져 있던 주소를 덮어쓰면 옛 것이 사라집니다');
  assert.match(ap, /_mbCo\[key\]\s*=\s*before\[key\]/,
    '실패해도 옛 값으로 «안 되돌립니다» — 이었다고 보이는데 새로고침하면 사라집니다');
});

test('★★ 이름만 담지 않는다 — 업체 «열쇠»를 함께 담는다 (온톨로지)', () => {
  const ap = sliceFn(app, 'function mbGuessApply(').replace(/\/\*[\s\S]*?\*\//g, ' ');
  assert.match(ap, /id:\s*String\(r\.id\|\|''\)/,
    '업체 이름만 담습니다 — 이름이 바뀌면 이은 것이 끊기고, 이름을 관계 열쇠로 쓰지 '
    + '말라는 푸른통합 온톨로지 규칙에도 어긋납니다');
});

test('★★ 푸른이알피에 적기는 «기본이 꺼짐» — 다른 앱의 자료다', () => {
  const html = sliceFn(app, 'function mbGuessHtml(').replace(/\/\*[\s\S]*?\*\//g, ' ');
  assert.match(html, /state\.mbGsErp\s*\?\s*'checked'/,
    '적기 체크가 상태를 안 봅니다');
  assert.ok(!/mbGsErp\s*=\s*(true|1)\b/.test(bare),
    '푸른이알피에 적기가 처음부터 켜져 있습니다 — 한 번에 수십 곳을 고치는 일입니다');
});

/* ══════ ㉮ 「담당자 ˅」 창 ══════ */

test('★★ 지금 담당자와 «같으면» 안 그린다 — 할 일 없는 칸이 창만 길게 만든다', () => {
  const mv = sliceFn(app, 'function mbOwnerMove(').replace(/\/\*[\s\S]*?\*\//g, ' ');
  assert.match(mv, /picked\.every\(v=>mbWhoOfRow\(v\)\s*===\s*g0\.who\)/,
    '지금 담당자와 같아도 짐작 칸을 그립니다');
});

test('★★ 고른 것이 «여러 업체»를 말하면 안 짚는다', () => {
  const mv = sliceFn(app, 'function mbOwnerMove(').replace(/\/\*[\s\S]*?\*\//g, ' ');
  assert.match(mv, /gks\.length\s*===\s*1/,
    '여러 업체가 나와도 하나를 골라 짚습니다 — 기계가 고를 자리가 아닙니다');
});

test('★★ 업체·사람 이름을 «단추 글자에 실어 보내지» 않는다 — 홑따옴표 하나면 단추가 죽는다', () => {
  /* esc 는 홑따옴표를 &#39; 로 바꾸는데, 그것이 attribute 안에서 «다시 홑따옴표로 풀린다».
     그래서 onclick="f('오브라이언&#39;s')" 는 브라우저가 읽는 순간 구문오류가 된다.
     주소만 싣고, 이름은 «누를 때» 다시 짚는다. */
  const mv = sliceFn(app, 'function mbOwnerMove(').replace(/\/\*[\s\S]*?\*\//g, ' ');
  /* ⚠ [^)]* 로 자르면 안 된다 — 인자 안에 esc(one) 이 있어 «첫 닫는 괄호»에서 끊긴다.
       그러면 뒤에 이름을 더 실어도 안 보인다(이빨 확인이 그 구멍을 잡았다). */
  const m = mv.match(/mbGuessLink\([\s\S]{0,80}/);
  assert.ok(m, '잇는 자리가 없습니다');
  const call = m[0].slice(0, m[0].indexOf('"') < 0 ? m[0].length : m[0].indexOf('"'));
  assert.ok(!/gNew\.|gFrom|\.name|\bv\.n\b/.test(call),
    '이름을 그대로 실어 보냅니다: ' + call);
});

test('★ 짐작 칸은 직원 목록과 «갈라» 놓는다 — 사람 이름 사이에 끼면 담당자로 읽힌다', () => {
  const mv = sliceFn(app, 'function mbOwnerMove(').replace(/\/\*[\s\S]*?\*\//g, ' ');
  assert.match(mv, /fmsec/, '가르는 머리줄이 없습니다');
  assert.match(mv, /직원/, '직원 목록에 이름표가 없습니다');
});

/* ══════ 새 이름이 겹치지 않았나 ══════ */

test('★★ 새로 지은 이름이 «한 번만» 선언돼 있다 — 겹치면 뒤엣것이 조용히 이긴다', () => {
  ['mbGuessBust','mbGuessNames','mbGuessHead','mbGuessIn','mbGuessOf','mbGuessOurs',
   'mbGuessRow','mbGuessScan','mbGuessOpen','mbGuessClose','mbGuessPick','mbGuessPickAll','mbGuessErp',
   'mbGuessRows','mbGuessLink','mbGuessApply','mbGuessErpFill','mbGuessHtml'].forEach(n=>{
    const n2 = (bare.match(new RegExp('function\\s+' + n + '\\s*\\(', 'g')) || []).length;
    assert.equal(n2, 1, n + ' 이 ' + n2 + '번 선언돼 있습니다 '
      + '(이 파일은 한 덩이입니다 — 겹치면 구문오류 없이 뒤엣것이 이깁니다)');
  });
});

test('★★ 그린 창이 «화면에 붙어» 있다 — 만들어만 두면 아무도 못 본다', () => {
  assert.match(bare, /\$\{mbGuessHtml\(\)\}/, '메일 화면이 이 창을 안 그립니다');
  assert.match(bare, /mbGuessOpen\(\)/, '여는 자리가 없습니다');
});
