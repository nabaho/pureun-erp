/* fund_forms.js 전수 개인정보·실데이터 스캔.
   서식 템플릿은 «어느 기금이 실제로 낸 서류»를 변환한 것이라, 사람 이름·집주소·
   계좌번호가 그대로 딸려 온다. fund.html·fund_forms.js 는 인터넷에 공개 배포되므로
   그대로 두면 남의 개인정보가 주소만 알면 읽힌다.

   ⚠ 예전에는 이 검사가 «다른 폴더»를 보고 있었다(C:/Users/fair0/Documents/pureunall).
     그래서 깨끗하다고 나오는 동안 저장소의 서식에는 실명·집주소·계좌번호가 남아 있었다.
     이제 «이 저장소»를 본다 — 경로를 박아 두지 않는다.

   실행: node fund-erp/tools/pii_scan.js */
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const FORMS = path.join(ROOT, 'fund_forms.js');
if (!fs.existsSync(FORMS)) { console.log('✗ fund_forms.js 를 못 찾음: ' + FORMS); process.exit(1); }
global.window = {};
(0, eval)(fs.readFileSync(FORMS, 'utf8'));
const F = global.window.HWP_FORMS || {};

const PATTERNS = [
  ['전화번호', /\b0\d{1,2}[-)]\s?\d{3,4}-\d{4}\b/g],
  ['휴대폰', /\b01[016789][-)]?\s?\d{3,4}-?\d{4}\b/g],
  ['주민번호', /\b\d{6}\s*-\s*[1-4]\d{6}\b/g],
  ['상세주소', /(서울|경기|인천|부산|대구|광주|대전|울산|세종|강원|충북|충남|전북|전남|경북|경남|제주)(특별시|광역시|도)?\s?[가-힣]{1,10}(시|군|구)\s?[^<{]{4,50}/g],
  ['사업자번호', /\b\d{3}-\d{2}-\d{5}\b/g],
  ['법인등록번호', /\b\d{6}-\d{7}\b/g],
  ['계좌번호(붙임표)', /\b\d{3,6}-\d{2,6}-\d{5,8}\b/g],
  /* 예전 검사가 놓친 것들 — 실제로 이 꼴로 남아 있었다 */
  ['계좌번호(띄어쓰기)', /\b\d{3}[ ]\d{3}[ ]\d{3}[ ]\d{3}[ ]\d{2}\b/g],
  ['은행 이름', /\b(하나|국민|신한|우리|농협|기업|카카오|토스|새마을|수협|SC제일|씨티)은행\b/g],
];

/* 사람 이름은 낱말만 보고는 못 가른다 — 서식에는 「서명·성명·확인」처럼
   이름처럼 생긴 말이 잔뜩이다. 그래서 둘을 «함께» 본다:
     ① 이름이 들어갈 자리인가 (위원명·컨설턴트명·대표이사 칸)
     ② 그 글자가 «흔한 성»으로 시작하고, 서식 낱말이 아닌가
   느슨하게 잡으면 늘 울어 대고, 그러면 아무도 안 읽는다. */
const SURNAME = /^(김|이|박|최|정|강|조|윤|장|임|한|오|서|신|권|황|안|송|류|전|홍|고|문|양|손|배|백|허|남|심|노|하|곽|성|차|주|우|구|나|민|유|진|지|엄|채|원|천|방|공|현|함|변|염|여|추|도|소|석|선|설|마|길|연|위|표|명|기|반|왕|옥|육|인|맹|제|모|탁|국|어|은|편|용)/;
const FORM_WORD = new Set(['서명', '성명', '날인', '확인', '위원', '이사', '감사', '대표', '신청',
  '계좌', '은행', '금액', '주소', '전화', '구분', '비고', '합계', '출석', '찬성', '기금',
  '명칭', '직책', '연번', '회차', '수량', '종류', '내역', '계좌번호', '컨설턴트명', '위원명']);
const looksName = s => s && s.length >= 2 && s.length <= 4 && SURNAME.test(s) && !FORM_WORD.has(s);
const NAME_SLOTS = [
  ['협의회 위원명', /(?:근로자|사용자)위원\s*<\/td>\s*<td[^>]*>\s*([가-힣]{2,4})\s*</g],
  ['컨설턴트명', /컨설턴트명\s*<\/td>\s*<td[^>]*>\s*([가-힣]{2,4})\s*</g],
  ['출연확인서 대표이사', /대표이사\s*([가-힣]{2,4})\s*\(/g],
  ['신청인', /신청인\s+([가-힣]{2,4})\s*\(/g],
];

let total = 0;
for (const k of Object.keys(F)) {
  const raw = String(F[k]);
  const txt = raw.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ');
  const found = [];
  for (const [name, re] of PATTERNS) {
    const m = txt.match(re);
    if (m) found.push(name + ': ' + [...new Set(m)].slice(0, 3).map(s => s.trim().slice(0, 52)).join(' / '));
  }
  for (const [name, re] of NAME_SLOTS) {
    const hits = [...raw.matchAll(re)].map(m => m[1]).filter(looksName);
    if (hits.length) found.push(name + '에 이름이 남음: ' + [...new Set(hits)].join(' / '));
  }
  if (found.length) { total++; console.log('■ ' + k); found.forEach(f => console.log('    ' + f)); }
}
console.log(total ? '\n총 ' + total + '종에서 발견' : '\n✓ 전 서식 깨끗함 (' + Object.keys(F).length + '종)');
process.exit(total ? 1 : 0);
