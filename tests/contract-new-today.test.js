/* 계약 — 오늘 등록한 건 맨 위·표시 · 부가세 말풍선
   ★ 날짜 경계가 위험하다. regAt 은 UTC ISO 문자열인데 '오늘'은 한국 날짜다.
     문자열을 그냥 자르면 아침 9시 이전에 등록한 건이 어제 것으로 보인다.
   ★ 말풍선은 창을 막지 않아야 한다(누를 것이 없어야 금액 넣던 흐름이 안 끊긴다). */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const HTML = path.join(__dirname, '..', 'pu-erp.html');
// 줄바꿈은 LF 로 통일 (윈도우 CRLF / CI LF 양쪽에서 같은 표식이 찾히도록)
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

/* ── 오늘 등록 판정 샌드박스 ── */
function regCtx(todayStr){
  const c = {
    console, Date, Object, JSON, String, Number, parseInt, isNaN,
    window: {},
    todayYMD(){ return todayStr; }
  };
  vm.createContext(c);
  vm.runInContext(slice('function regDayOf(x){', 'function arvClear(store, id, after){'), c);
  return c;
}
// 로컬 시간으로 지정한 날짜·시각의 ISO 문자열 (등록 시각을 흉내낸다)
const isoLocal = (y, m, d, hh, mm) => new Date(y, m - 1, d, hh, mm, 0).toISOString();
const ymd = (y, m, d) => y + '-' + ('0'+m).slice(-2) + '-' + ('0'+d).slice(-2);

/* ═══ 1. ★ 날짜 경계 — 한국 시간 기준으로 갈리는가 ═══ */
{
  const c = regCtx(ymd(2026, 8, 6));
  t('★ 오늘 오전에 등록한 건은 오늘', c.regIsToday({ regAt: isoLocal(2026,8,6, 9,5) }), true);
  t('★ 오늘 새벽 0시 5분도 오늘', c.regIsToday({ regAt: isoLocal(2026,8,6, 0,5) }), true);
  t('★ 오늘 밤 23시 55분도 오늘', c.regIsToday({ regAt: isoLocal(2026,8,6, 23,55) }), true);
  t('★ 어제 밤 23시 55분은 오늘이 아니다', c.regIsToday({ regAt: isoLocal(2026,8,5, 23,55) }), false);
  t('★ 내일 0시 5분도 오늘이 아니다', c.regIsToday({ regAt: isoLocal(2026,8,7, 0,5) }), false);
  // ★ 이게 핵심 — 하루 24시간 어느 때에 등록해도 그 날짜로 나와야 한다.
  //   ISO 문자열을 그냥 slice(0,10) 하면 UTC 날짜가 나와, 한국처럼 UTC 보다 앞선 곳에서는
  //   아침 등록이 어제 것으로 보인다. 시간대를 가리지 않고 확인하려고 24시간을 다 훑는다.
  //   (CI 는 UTC 로 도는데, 기계의 시간대를 단정하면 내 PC 에서만 통과하는 검사가 된다)
  {
    let bad = [];
    for(let hh = 0; hh < 24; hh++){
      const at = isoLocal(2026,8,6, hh, 30);
      if(c.regDayOf({ regAt: at }) !== ymd(2026,8,6)) bad.push(hh);
      if(c.regIsToday({ regAt: at }) !== true) bad.push('today:' + hh);
    }
    t('★ 하루 24시간 어느 때 등록해도 그 날짜로 나온다', bad, []);
  }
  // 자정 직전·직후 1분도 제 날짜에 붙는다 (경계에서 하루가 밀리면 「오늘」이 어긋난다)
  t('★ 자정 1분 전은 그날', c.regDayOf({ regAt: isoLocal(2026,8,6, 23,59) }), ymd(2026,8,6));
  t('★ 자정 1분 후는 다음 날', c.regDayOf({ regAt: isoLocal(2026,8,7, 0,1) }), ymd(2026,8,7));
}

/* ═══ 1-2. ★★ 한국 시간대에서 직접 확인한다 ═══
   위 검사는 "돌리는 기계의 시간대" 기준이라, CI(UTC)에서는 ISO 문자열을 그냥 잘라도
   우연히 맞아 버그가 안 잡힌다. 대표는 한국에서 쓰므로, 자식 프로세스를 한국 시간대로
   띄워 거기서도 맞는지 본다 — 이래야 CI 에서도 이 실수가 걸린다. */
{
  const { spawnSync } = require('child_process');
  const probe = `
    const fs=require('fs'), vm=require('vm');
    const src=fs.readFileSync(${JSON.stringify(HTML)},'utf8').replace(/\\r\\n/g,'\\n');
    function sl(a,b){const i=src.indexOf(a),j=src.indexOf(b,i);return src.slice(i,j);}
    const c={console,Date,Object,JSON,String,Number,parseInt,isNaN,window:{},todayYMD(){return '2026-08-06';}};
    vm.createContext(c);
    vm.runInContext(sl('function regDayOf(x){','function arvClear(store, id, after){'), c);
    // 한국 아침 7:30 — UTC 로는 전날 22:30 이라 문자열을 자르면 8월 5일이 된다
    const at = new Date(2026, 7, 6, 7, 30, 0).toISOString();
    process.stdout.write(c.regDayOf({ regAt: at }) + '|' + (c.regIsToday({ regAt: at }) ? 'Y' : 'N'));
  `;
  const r = spawnSync(process.execPath, ['-e', probe],
    { encoding:'utf8', env: Object.assign({}, process.env, { TZ:'Asia/Seoul' }) });
  const out = (r.stdout || '').trim();
  t('★ 한국 시간대에서도 아침 등록이 그날로 나온다', out, '2026-08-06|Y');
  if(out !== '2026-08-06|Y' && r.stderr) console.log('  (자식 오류) ' + String(r.stderr).slice(0, 300));
}
/* ═══ 2. 방어 ═══ */
{
  const c = regCtx(ymd(2026, 8, 6));
  t('regAt 없으면 오늘 아님', c.regIsToday({ companyName:'가나' }), false);
  t('빈 regAt 도 아님', c.regIsToday({ regAt:'' }), false);
  t('이상한 값도 아님', c.regIsToday({ regAt:'어제쯤' }), false);
  t('null 도 아님', c.regIsToday(null), false);
  t('★ 옛 계약(regAt 없음)은 표시가 안 붙는다', c.regDayOf({ id:'ct-old' }), '');
  t('시각도 빈 문자열', c.regTimeText({ id:'ct-old' }), '');
  t('이상한 값의 시각도 빈 문자열', c.regTimeText({ regAt:'x' }), '');
}
/* ═══ 3. 등록 시각 표기 ═══ */
{
  const c = regCtx(ymd(2026, 8, 6));
  t('시각은 hh:mm', c.regTimeText({ regAt: isoLocal(2026,8,6, 15,42) }), '15:42');
  t('한 자리 시각도 0을 채운다', c.regTimeText({ regAt: isoLocal(2026,8,6, 9,5) }), '09:05');
  t('자정은 00:00', c.regTimeText({ regAt: isoLocal(2026,8,6, 0,0) }), '00:00');
}
/* ═══ 4. ★ 정렬 — 오늘 것이 맨 위, 그 안에서 최근 순 ═══ */
{
  const c = regCtx(ymd(2026, 8, 6));
  const A = { id:'A', regAt: isoLocal(2026,8,6, 9,5) };    // 오늘 아침
  const B = { id:'B', regAt: isoLocal(2026,8,6, 15,42) };  // 오늘 오후
  const C = { id:'C', regAt: isoLocal(2026,8,5, 11,0) };   // 어제
  const D = { id:'D' };                                    // 옛 계약
  const base = (x, y) => String(x.id).localeCompare(String(y.id));
  const sorted = [D, C, A, B].slice().sort(function(x, y){ return c.regSort(x, y, base); });
  t('★ 오늘 것이 맨 위, 그 안에서 최근 등록 순', sorted.map(x => x.id), ['B','A','C','D']);
  t('★ 오늘 것끼리는 늦게 올린 것이 위', c.regSort(A, B, base) > 0, true);
  t('오늘 것이 어제 것보다 위', c.regSort(A, C, base) < 0, true);
  t('★ 오늘 것이 아니면 원래 정렬을 그대로 쓴다', c.regSort(C, D, base), base(C, D));
  t('base 를 안 주면 0', c.regSort(C, D), 0);
}
{
  // 날짜가 바뀌면 저절로 풀린다 — 어제 올린 것들은 더 이상 위로 안 간다
  const c = regCtx(ymd(2026, 8, 7));
  const A = { id:'A', regAt: isoLocal(2026,8,6, 9,5) };
  const D = { id:'D' };
  const base = (x, y) => String(x.id).localeCompare(String(y.id));
  t('★ 하루 지나면 오늘 표시가 풀린다', c.regIsToday(A), false);
  t('★ 그러면 정렬도 원래대로', c.regSort(A, D, base), base(A, D));
}

/* ═══ 5. 배선 — 새 계약에 등록 시각을 찍는가 ═══ */
t('★ 새 계약에 regAt 을 찍는다', /regAt: \(new Date\(\)\)\.toISOString\(\)/.test(src), true);
t('왜 필요한지 적어 뒀다', /목록 중간에 섞여 안 보였다/.test(src), true);
t('★ 칸반 정렬이 regSort 를 쓴다', /return regSort\(a, b, function\(x, y\)\{/.test(src), true);
t('★ 핀 고정이 여전히 먼저다 (핀이 밀리면 안 된다)',
  /if\(pa !== pb\) return pa - pb;\s*\n\s*\/\/ ★ 오늘 새로 등록한 카드를 맨 위로/.test(src), true);
t('★ 옮긴 카드 정렬(orderTs)은 그대로 살아 있다', /var oa = x\.orderTs \|\| 0, ob = y\.orderTs \|\| 0;/.test(src), true);
t('오늘 등록 묶음 머리줄이 있다', /🆕 오늘 등록 ' \+ todayN \+ '건/.test(src), true);
t('그 아래 구분줄도 있다', /'그 전에 등록한 것'/.test(src), true);
t('★ 오늘 건이 없으면 머리줄을 안 넣는다', /if\(todayN === 0\) return cards\.map/.test(src), true);
t('카드에 오늘 딱지가 붙는다', /'🆕 오늘 ' \+ regTimeText\(c\)/.test(src), true);
t('★ 카드 왼쪽에 초록 띠', /regIsToday\(c\)\) \? '3px solid #16a34a'/.test(src), true);
/* ⚠ 2026-08-31: 카드가 다섯 줄→두 줄로 줄면서(대표 「셀의 길이를 자꾸
   길게하지 말고」) 회사명·이관딱지·오늘딱지가 «한 줄» 안의 형제 요소가 됐다.
   못 박을 것은 뒤에 쉼표가 있는 옛 모양이 아니라 「arvBadge 를 부르는가」다. */
t('이관 딱지(arvBadge)와 따로 둔다', /arvBadge\(c, 'contracts', refreshContracts\)/.test(src), true);
t('밖에서도 쓸 수 있게 열어 뒀다', /window\.regIsToday\s*=/.test(src), true);

/* ═══ 6. ★ 부가세 말풍선 — 창을 막지 않는가, 언제 뜨는가 ═══ */
function vatCtx(muted){
  const store = {};
  if(muted) store['pureun_v6_vat_hint_off'] = '1';
  const shown = [];
  const c = {
    console, Object, JSON, String, Number, Math, parseInt,
    localStorage: {
      getItem(k){ return (k in store) ? store[k] : null; },
      setItem(k, v){ store[k] = String(v); }
    },
    window: {},
    vatHintBubble(anchor, msg){ shown.push(msg); }
  };
  vm.createContext(c);
  vm.runInContext(slice('var VAT_HINT_OFF_KEY =', '// 말풍선 한 개만 띄운다'), c);
  return { c, shown, store };
}
{
  const { c, shown } = vatCtx(false);
  c.vatAmountHint(true, 1155000, '잔금');
  t('★ 부가세포함 + 금액이 있으면 알린다', shown.length, 1);
  t('넣은 금액을 그대로 보여준다', /1,155,000원은 부가세포함/.test(shown[0]), true);
  t('★ 공급가·부가세를 갈라 보여준다', /공급가 1,050,000 \+ 부가세 105,000/.test(shown[0]), true);
  t('어느 칸인지 알려준다', /^잔금 /.test(shown[0]), true);
}
{
  const { c, shown } = vatCtx(false);
  c.vatAmountHint(false, 1155000, '잔금');
  t('★ 부가세 별도면 안 알린다', shown.length, 0);
}
{
  const { c, shown } = vatCtx(false);
  c.vatAmountHint(true, 0, '잔금');
  t('★ 0원이면 안 알린다 (빈 칸 지나칠 때마다 뜨면 방해)', shown.length, 0);
  c.vatAmountHint(true, null, '잔금');
  t('금액이 없어도 안 알린다', shown.length, 0);
}
{
  const { c, shown } = vatCtx(true);
  c.vatAmountHint(true, 1155000, '잔금');
  t('★ 그만 보기를 켰으면 안 알린다', shown.length, 0);
}
{
  const { c, shown } = vatCtx(false);
  c.vatIncludedHint(true, '계약금');
  t('체크를 켤 때도 알린다', shown.length, 1);
  t('최종 금액을 넣으라고 말한다', /부가세를 더한 최종 금액/.test(shown[0]), true);
  c.vatIncludedHint(false, '계약금');
  t('★ 끌 때는 안 알린다', shown.length, 1);
}
{
  const { c, store } = vatCtx(false);
  t('처음엔 안 꺼져 있다', c.vatHintMuted(), false);
  c.vatHintMute();
  t('★ 끄면 저장된다', store['pureun_v6_vat_hint_off'], '1');
  t('끈 뒤엔 꺼진 것으로 읽힌다', c.vatHintMuted(), true);
}
// 말풍선 자체
{
  const mk = slice('function vatHintBubble(anchor, msg, ms){', 'window.vatHintBubble = vatHintBubble;');
  t('★ 창을 막지 않는다 (덮개가 없다)', /rgba\(0,0,0,0\.45\)/.test(mk), false);
  t('★ 저절로 사라진다', /setTimeout\(function\(\)\{\s*\n\s*b\.style\.opacity = '0';/.test(mk), true);
  t('기본 3초', /\}, ms \|\| 3000\);/.test(mk), true);
  t('★ 하나만 띄운다 (앞엣것을 지운다)', /if\(old && old\.parentNode\) old\.parentNode\.removeChild\(old\);/.test(mk), true);
  // 같은 코드가 클릭 핸들러에도 있으므로 "새 말풍선을 만들기 전"이라는 자리까지 고정한다
  t('★ 앞 타이머도 끈다 (겹쳐 뜨면 먼저 것이 늦게 지운다)',
    /removeChild\(old\);\s*\n\s*if\(_vatBubbleTimer\)\{ clearTimeout\(_vatBubbleTimer\); _vatBubbleTimer = null; \}\s*\n\s*var el = anchor/.test(mk), true);
  t('★ 줄바꿈이 살아 있다 (두 줄짜리 안내)', /white-space:pre-line/.test(mk), true);
  t('★ 화면 밖으로 나가면 당겨 온다', /r2\.right > window\.innerWidth - 8/.test(mk), true);
  t('★ 눌러서 끌 수 있다', /b\.addEventListener\('mousedown', function\(ev\)\{/.test(mk), true);
  t('★ 누를 때 뒤 칸 포커스를 안 뺏는다', /ev\.preventDefault\(\); ev\.stopPropagation\(\);/.test(mk), true);
  t('누르면 그만 보기가 저장된다', /vatHintMute\(\);/.test(mk), true);
  t('무엇을 하는 건지 적혀 있다', /눌러서 그만 보기/.test(mk), true);
}
// 금액 칸에 실제로 붙었는가
t('★ 계약금 칸에서 금액 안내를 부른다',
  /onBlur:function\(e\)\{ vatAmountHint\(f\.contractFeeVatIncluded, f\.amounts\[kindV\]/.test(src), true);
t('★ 잔금 칸에서도 부른다',
  /onBlur:function\(e\)\{ vatAmountHint\(f\.balanceFeeVatIncluded, f\.successFee/.test(src), true);
t('★ 기금·업체 금액 칸에서도 부른다',
  /vatAmountHint\(kindV === 'fund' \? f\.fundVatIncluded : true/.test(src), true);
t('체크박스 8곳이 모두 말풍선 자리를 넘긴다',
  (src.match(/vatIncludedHint\(e\.target\.checked, [^;]*, e\.target\)/g) || []).length, 8);
// 이름은 "없앴다"는 주석에 남아 있으므로, 정의·호출이 없는지를 본다
t('★ 창을 막던 알림창 정의가 없다', /window\.showAlertMutable\s*=/.test(src), false);
t('★ 그것을 부르는 곳도 없다', /showAlertMutable\(/.test(src), false);

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===');
process.exit(fail ? 1 : 0);
