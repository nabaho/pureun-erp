/* 메일함 ↔ 세무사무실 담당자 (대표 승인 2026-08-28, 가·나)

   ★ 가) 업체관리에 세무사무실 이메일이 이미 적힌 곳에서 오면 「○○사의 세무사무실」
     나) 아직 안 적힌 곳인데 본문에 업체 이름이 보이면 「등록할까요?」

   ★ 하지 «않는» 것
     본문 서명에서 담당자 이름·담당 세무서를 읽어내지 않는다 —
     사무실마다 모양이 달라 틀리게 넣는다. 틀린 담당자는 안 넣느니만 못하다.

   ★ 지키려는 것
     ① 아는 주소를 알아본다 (한 사무실이 여러 업체를 맡는 경우 포함)
     ② 우리 직원 메일에는 참견하지 않는다
     ③ 「아니오」 한 주소는 다시 안 묻는다
     ④ 짧은 이름으로 아무 데나 걸리지 않는다
     ⑤ 이미 세무사무실이 적힌 업체는 다시 안 묻는다
     ⑥ 저장은 «빈 칸만» 채운다 — 사람이 고쳐 둔 것을 메일 한 통이 지우면 안 된다
     ⑦ 세무사무실만 적힌 업체가 색인에서 빠지지 않는다 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8').split('\r\n').join('\n');

function grab(decl) {
  const i = src.indexOf(decl);
  if (i < 0) throw new Error('못 찾음: ' + decl);
  let d = 0, j = src.indexOf('{', i);
  for (; j < src.length; j++) {
    if (src[j] === '{') d++;
    else if (src[j] === '}') { d--; if (!d) { j++; break; } }
  }
  return src.slice(i, j);
}

/* 브라우저 흉내 — 저장칸은 진짜처럼 움직이게 */
const store = {};
const box = {
  console, String, Object, JSON, Array, Number,
  localStorage: {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); }
  },
  ErpMatch: null,
  state: {}
};
box.window = box;
vm.createContext(box);
vm.runInContext(
  grab('const TAX_SKIP_KEY') + ';\n' +
  grab('function taxSkipSet()') + '\n' +
  grab('function taxSkipAdd(email)') + '\n' +
  grab('function taxHintFor(email, name, subject, body)') + '\n' +
  ';this.hint = taxHintFor; this.skipAdd = taxSkipAdd;', box);
const hint = box.hint, skipAdd = box.skipAdd;

let fail = 0, total = 0;
function ok(name, cond, hintTxt) {
  total++;
  if (cond) { console.log('ok   ' + name); return; }
  fail++;
  console.log('FAIL ' + name + (hintTxt ? '\n     → ' + hintTxt : ''));
}

/* 업체 자료 — 실제 모양대로 */
const CO_A = { id: 'co-1', name: '주식회사코엘이엔지', taxEmail: 'tax@hansol-tax.kr',
               taxOfficeName: '한솔세무회계', taxContact: '', taxPhone: '' };
const CO_B = { id: 'co-2', name: '보문사', taxEmail: '', taxOfficeName: '', taxContact: '', taxPhone: '' };
const CO_C = { id: 'co-3', name: '텃골영농조합법인(용인)', taxEmail: '', taxOfficeName: '', taxContact: '', taxPhone: '' };
const CO_D = { id: 'co-4', name: '주식회사세창이엔지', taxEmail: 'tax@hansol-tax.kr',
               taxOfficeName: '한솔세무회계', taxContact: '', taxPhone: '' };

box.ErpMatch = {
  ready: true,
  nameByEmail: { 'p001@pureun.kr': '권형하' },
  byTaxEmail: {
    'tax@hansol-tax.kr': [
      { id: 'co-1', coName: '주식회사코엘이엔지', taxOfficeName: '한솔세무회계' },
      { id: 'co-4', coName: '주식회사세창이엔지', taxOfficeName: '한솔세무회계' }
    ]
  },
  companies: [CO_A, CO_B, CO_C, CO_D]
};

console.log('[① 아는 주소]');
{
  const r = hint('tax@hansol-tax.kr', '김세무', '보수총액 신고 자료 요청', '안녕하세요');
  ok('아는 주소를 알아본다', r && r.kind === 'known', JSON.stringify(r));
  ok('한 사무실이 맡은 업체를 모두 준다', r && r.cos.length === 2,
     '두 곳을 맡고 있는데 하나만 주면 나머지가 안 채워진다');
}
{
  const r = hint('TAX@Hansol-Tax.KR', '김세무', '제목', '본문');
  ok('대소문자가 달라도 알아본다', r && r.kind === 'known');
}

console.log('\n[② 우리 직원 메일에는 참견 안 한다]');
ok('직원 메일은 지나간다', hint('p001@pureun.kr', '권형하', '주식회사코엘이엔지 건', '텃골영농조합법인(용인)') === null,
   '우리끼리 주고받는 메일에 띠가 뜨면 성가시다');

console.log('\n[④⑤ 모르는 주소 — 본문에서 업체 찾기]');
{
  const r = hint('park@daehan-tax.co.kr', '박회계', '4대보험 문의',
                 '텃골영농조합법인(용인) 담당하고 있는 대한세무법인 박회계입니다.');
  ok('본문에 업체 이름이 보이면 묻는다', r && r.kind === 'ask' && r.co.coName === '텃골영농조합법인(용인)',
     JSON.stringify(r));
}
ok('짧은 이름(보문사)으로는 안 걸린다',
   hint('who@x.kr', '아무개', '보문사 앞에서 만나요', '보문사 근처입니다') === null,
   '세 글자 이름이 아무 문장에나 걸리면 헛물만 켠다');
ok('이미 세무사무실이 적힌 업체는 안 묻는다',
   (function () {
     const r = hint('other@x.kr', '아무개', '주식회사코엘이엔지 건', '주식회사코엘이엔지 관련');
     return !r || r.co.coName !== '주식회사코엘이엔지';
   })(),
   '이미 적힌 곳을 또 물으면 성가시다');
ok('업체 이름이 안 보이면 아무 말 안 한다',
   hint('spam@x.kr', '광고', '할인 안내', '이번 주 특가입니다') === null);

console.log('\n[③ 「아니오」 한 주소]');
skipAdd('park@daehan-tax.co.kr');
ok('다시 안 묻는다',
   hint('park@daehan-tax.co.kr', '박회계', '4대보험 문의', '텃골영농조합법인(용인) 담당입니다') === null,
   '같은 것을 매번 물으면 곧 안 보게 된다');
ok('그래도 «아는 주소»는 계속 알아본다',
   (function () { skipAdd('tax@hansol-tax.kr');
     const r = hint('tax@hansol-tax.kr', '김세무', '제목', '본문');
     return r && r.kind === 'known'; })(),
   '이미 등록된 것은 「아니오」와 상관없다');

console.log('\n[준비 안 됐을 때]');
box.ErpMatch.ready = false;
ok('업체를 아직 못 읽었으면 아무 말 안 한다', hint('tax@hansol-tax.kr', 'x', 'y', 'z') === null);
box.ErpMatch.ready = true;
ok('주소가 없으면 아무 말 안 한다', hint('', 'x', 'y', 'z') === null);

console.log('\n[⑥⑦ 화면·색인에 제대로 걸려 있다]');
ok('세무사무실 이메일로 색인한다', /byTaxEmail\[te\] = byTaxEmail\[te\] \|\| \[\]/.test(src));
ok('세무사무실만 적힌 업체가 안 걸러진다', /&& !rec\.taxEmail\) return;/.test(src),
   '담당자·유형이 비어 있어도 세무 메일은 온다');
ok('저장은 빈 칸만 채운다', /if\(blank\(cur\.taxEmail\)\)/.test(src) && /안 덮는다/.test(src),
   '사람이 고쳐 둔 것을 메일 한 통이 지우면 안 된다');
ok('갱신시각을 찍어 ERP 가 다시 읽게 한다', /up\['data\/companies\/u'\] = now;/.test(src),
   '안 찍으면 저장해도 푸른이알피에 안 나타난다');
ok('띠가 메일 화면에 붙어 있다', /\$\{taxStripHtml\(v\)\}/.test(src));
const modals = (src.match(/\+ taxSaveHtml\(\);/g) || []).length;
ok('저장 창이 PC·폰 «둘 다»에 붙어 있다', modals === 2,
   '지금 ' + modals + '곳 — 한쪽만 달면 기기에 따라 안 뜬다');

console.log('\n  === ' + (total - fail) + ' 통과 / ' + fail + ' 실패 ===');
process.exit(fail ? 1 : 0);
