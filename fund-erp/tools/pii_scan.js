// fund_forms.js 전수 개인정보/실데이터 스캔
global.window = {}; require("C:/Users/fair0/Documents/pureunall/fund_forms.js");
const F = global.window.HWP_FORMS;
const PATTERNS = [
  ['전화번호', /\b0\d{1,2}[-)]\s?\d{3,4}-\d{4}\b/g],
  ['휴대폰', /\b01[016789][-)]?\s?\d{3,4}-?\d{4}\b/g],
  ['주민번호', /\b\d{6}\s*-\s*[1-4]\d{6}\b/g],
  ['상세주소', /(서울|경기|인천|부산|대구|광주|대전|울산|세종|강원|충북|충남|전북|전남|경북|경남|제주)(특별시|광역시|도)?\s?[가-힣]{1,10}(시|군|구)\s?[^<{]{4,50}/g],
  ['사업자번호', /\b\d{3}-\d{2}-\d{5}\b/g],
  ['법인등록번호', /\b\d{6}-\d{7}\b/g],
  ['계좌번호', /\b\d{3,6}-\d{2,6}-\d{5,8}\b/g],
];
let total = 0;
for (const k of Object.keys(F)) {
  const txt = F[k].replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ');
  const found = [];
  for (const [name, re] of PATTERNS) {
    const m = txt.match(re);
    if (m) found.push(name + ': ' + [...new Set(m)].slice(0, 3).map(s => s.trim().slice(0, 52)).join(' / '));
  }
  if (found.length) { total++; console.log('■ ' + k); found.forEach(f => console.log('    ' + f)); }
}
console.log(total ? `\n총 ${total}종에서 발견` : '\n✓ 전 서식 깨끗함');
