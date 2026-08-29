/* 폰 거르개 ↔ 서버 파서가 «같은 것을 받아들이는가» (2026-08-29)

   ★ 무슨 일이 있었나
     대표 보고: 「폰문자 연결 중단 · 하나카드 내역도 중단」.
     화면은 「연결 뒤 문자 0건」 이라고만 했다.

     파 보니 폰 앱이 «서버에 닿기도 전에» 카드 문자를 버리고 있었다.
     카드 문자는 「하나9950 승인 …」 처럼 하나+숫자로 오는데, 폰 거르개는
     하나카드·하나은행·keb하나·「하나 」(하나+빈칸) 넷만 봤다. 「하나9950」 은
     빈칸이 아니라 숫자가 붙어 어느 것에도 안 걸렸다.

     서버는 2026-08-23 에 같은 문제를 이미 고쳤다(「서버가 조용히 버리고 있었다」).
     폰에는 그 고침이 안 왔다 — 폰 거르개는 2026-08-23 이후 한 번도 안 바뀌었다.

   ★ 왜 이 검사가 필요한가
     폰에서 버리면 «서버는 아무것도 못 듣는다». lastSkip 도 안 남는다.
     그래서 화면은 「문자가 안 온다」 와 「와서 버렸다」 를 가를 수가 없다.
     양쪽 규칙이 또 갈라지지 않게, 이 검사가 «자바 원본을 읽어» 견준다.

   ★ 지키려는 것
     ① 서버가 읽을 수 있다고 한 문자는 폰도 통과시킨다
     ② 보안 문구(인증번호 등)는 폰에서 막는다
     ③ 자바 원본을 읽어 본다 — 옮겨 적은 사본을 보면 또 갈라진다 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const JAVA = path.join(ROOT, 'android', 'hana-sms-bridge', 'app', 'src', 'main',
  'java', 'kr', 'pureun', 'hanabridge', 'HanaMessageFilter.java');

let fail = 0, total = 0;
function ok(name, cond, hint) {
  total++;
  if (cond) { console.log('ok   ' + name); return; }
  fail++;
  console.log('FAIL ' + name + (hint ? '\n     → ' + hint : ''));
}

const src = fs.readFileSync(JAVA, 'utf8').split('\r\n').join('\n');

/* ── 자바 원본에서 «지금 쓰는 규칙»을 그대로 꺼낸다 ─────────────────────
   옮겨 적으면 자바를 고쳤을 때 이 검사가 옛 규칙을 보게 된다. */
function javaPattern(name){
  const re = new RegExp('Pattern\\s+' + name + '\\s*=\\s*Pattern\\.compile\\(([\\s\\S]*?)\\);');
  const m = src.match(re);
  if(!m) throw new Error('자바에서 ' + name + ' 을 못 찾음 — 이름이 바뀌었나요?');
  /* "a" + "b" 로 이어 붙인 것을 하나로 */
  const body = m[1].split('+').map(s => s.trim())
    .map(s => s.replace(/^"|"$/g, ''))
    .join('');
  /* 자바 문자열의 \\ 는 정규식의 \ 하나다 */
  return new RegExp(body.split('\\\\').join('\\'), 'i');
}
function javaStringList(name){
  const re = new RegExp('String\\[\\]\\s+' + name + '\\s*=\\s*\\{([\\s\\S]*?)\\};');
  const m = src.match(re);
  if(!m) throw new Error('자바에서 ' + name + ' 을 못 찾음');
  return m[1].split(',').map(s => s.trim().replace(/^"|"$/g, '')).filter(Boolean);
}

const HANA = javaPattern('HANA');
const MONEY = javaPattern('MONEY');
const DATE = javaPattern('DATE');
const SECURITY = javaStringList('SECURITY');
const MOVE = ['승인', '취소', '입금', '출금', '이체'];

/* 자바 isTransaction 을 «지금 원본 값으로» 그대로 흉내 낸다 */
function phonePasses(msg){
  const v = String(msg || '').toLowerCase();
  for (const b of SECURITY) if (v.indexOf(b) >= 0) return false;
  if (!HANA.test(v)) return false;
  if (!MOVE.some(m => v.indexOf(m) >= 0)) return false;
  return MONEY.test(v) && DATE.test(v);
}

/* ── 서버가 «읽을 수 있다»고 제 검사에 적어 둔 진짜 문자들 ──────────────
   서버 검사(functions/hana-message.test.js)에서 그대로 뽑아 온다 —
   손으로 옮겨 적으면 서버가 늘어날 때 여기가 따라가지 못한다. */
const serverTest = fs.readFileSync(path.join(ROOT, 'functions', 'hana-message.test.js'), 'utf8').split('\r\n').join('\n');
const samples = [];      /* { msg, serverOk } */
const sre = /parseHanaMessage\(\s*"((?:[^"\\]|\\.)*)"/g;
let m2;
while ((m2 = sre.exec(serverTest))) {
  /* ⚠ 서버 검사에는 «거부해야 맞는» 표본도 있다(날짜 없음·인증번호 등).
     그것까지 「폰이 통과시켜야 한다」고 보면 헛실패가 난다 — 실제로 한 번 났다.
     바로 뒤 줄의 기대값을 읽어 «서버가 받아들이는 것»만 통과 대상으로 삼는다. */
  const after = serverTest.slice(m2.index, m2.index + 400);
  const serverOk = !/ok:\s*false/.test(after.split('\n').slice(0, 4).join('\n'));
  samples.push({ msg: m2[1], serverOk: serverOk });
}

console.log('[① 서버가 «받아들이는» 문자는 폰도 통과시킨다]');
ok('서버 검사에서 실제 문자를 읽어 왔다', samples.length >= 5, '읽은 수: ' + samples.length);
ok('받아들이는 것과 거부하는 것을 갈라 읽었다',
   samples.some(s => s.serverOk) && samples.some(s => !s.serverOk),
   '둘 다 있어야 이 검사가 뜻이 있다');

const shouldPass = samples.filter(s => s.serverOk).map(s => s.msg);
const shouldBlock = samples.filter(s => !s.serverOk).map(s => s.msg);

const dropped = shouldPass.filter(s => !phonePasses(s));
ok('★ 통과해야 할 문자를 하나도 안 버린다', dropped.length === 0,
   dropped.length ? ('폰에서 버려지는 문자:\n       · ' + dropped.join('\n       · ')) : '');

console.log('\n[② 카드 문자를 알아본다 — 이번에 깨졌던 자리]');
[
  '[Web발신] 하나9950 승인 푸른노무법 26,000원 일시불 08/18 12:59 스시리두정',
  '하나9950 승인취소 26,000원 08/23 09:02 스시리',
  '하나1234 승인 5,000원 08/29 10:00 편의점',
].forEach(function (s) {
  ok('「' + s.slice(0, 22) + '…」 통과', phonePasses(s),
     '하나+숫자 꼴을 못 알아보면 카드 내역이 통째로 안 들어온다');
});

console.log('\n[③ 은행 문자도 그대로]');
[
  '[Web발신] 하나은행 입금 1,250,000원 08/22 15:31 주식회사 예시',
  '하나은행 입금1,000,000원 08/23 09:01 거래처',
].forEach(function (s) { ok('「' + s.slice(0, 20) + '…」 통과', phonePasses(s)); });

console.log('\n[④ 막아야 할 것은 막는다]');
/* ⚠ 서버가 ok:false 를 준다고 «폰이 막아야 한다»는 뜻이 아니다 — 실제로 한 번 헛실패했다.
     · security_message      → 폰이 막아야 한다 (밖으로 나가면 안 되는 글)
     · missing_datetime      → 막으면 좋다 (보내 봐야 못 쓴다)
     · card_cancel_review_required → «보내야 한다» — 서버가 대기함에 넣어 사람이 본다
   그러니 「보내면 안 되는 것」만 못 박고, 나머지는 서버 몫으로 둔다. */
const mustBlock = shouldBlock.filter(s => SECURITY.some(b => s.toLowerCase().indexOf(b) >= 0));
ok('보안 문구가 든 문자는 폰이 «반드시» 막는다',
   mustBlock.length > 0 && mustBlock.every(s => !phonePasses(s)),
   '인증번호·비밀번호가 든 글이 서버로 나가면 안 된다');
ok('카드 취소는 폰이 «막지 않는다» — 서버가 대기함에 넣어 사람이 본다',
   phonePasses('하나9950 승인취소 26,000원 08/23 09:02 스시리'),
   '폰이 막으면 취소가 영영 안 보인다');
ok('인증번호 문자를 막는다', !phonePasses('하나은행 인증번호 123456 입금 10,000원 08/22 15:31'));
ok('하나와 상관없는 문자는 안 보낸다', !phonePasses('국민은행 입금 10,000원 08/22 15:31'),
   '남의 은행 문자까지 서버로 보내면 안 된다');
ok('금액이 없으면 안 보낸다', !phonePasses('하나은행 입금 안내 08/22 15:31'));
ok('날짜가 없으면 안 보낸다', !phonePasses('하나9950 승인 26,000원'));

console.log('\n[④-b 거르는 «차례»가 그대로 있다]');
/* ⚠ 위 시험은 자바에서 «규칙 값»(HANA·MONEY·DATE·SECURITY)만 꺼내 쓰고,
     그것을 어떻게 엮는지는 이 파일이 옮겨 적고 있다. 그래서 자바의 «논리»를
     빼 버리면 위 시험은 못 잡는다(일부러 빼 보고 확인했다).
     그 구멍을 여기서 막는다 — 다섯 관문이 isTransaction 안에 살아 있는지 본다. */
const body = (src.match(/static boolean isTransaction\([\s\S]*?\n    \}/) || [''])[0];
ok('isTransaction 을 찾았다', body.length > 50);
/* ⚠ 「막는 줄이 있나」만 보면 조건을 if(false) 로 바꿔도 안 걸린다 — 일부러 해 보고 알았다.
   실제로 «무엇을 보고» 막는지까지 본다. */
ok('보안 문구를 막는 줄이 있다',
   /for \(String blocked : SECURITY\)/.test(body) &&
   /if \(value\.contains\(blocked\)\)\s*return false;/.test(body),
   '빠지면 인증번호가 든 글이 서버로 나간다');
ok('「하나」를 보는 줄이 있다', /HANA\.matcher\(value\)\.find\(\)/.test(body));
ok('거래말(승인·입금 등)을 보는 줄이 있다', /movement/.test(body) && /"승인"/.test(body));
ok('금액을 보는 줄이 있다', /MONEY\.matcher\(value\)\.find\(\)/.test(body));
ok('날짜를 보는 줄이 있다', /DATE\.matcher\(value\)\.find\(\)/.test(body),
   '빠지면 날짜 없는 글까지 서버로 가서 「추측 저장」 위험이 생긴다');

console.log('\n[⑤ 서버와 같은 낱말을 본다]');
const server = fs.readFileSync(path.join(ROOT, 'functions', 'hana-message.js'), 'utf8');
['하나원큐', '하나1q', 'keb'].forEach(function (w) {
  ok('폰도 「' + w + '」 를 안다', HANA.test(w + ' 입금 1,000원 08/29 10:00') || HANA.source.toLowerCase().indexOf(w) >= 0,
     '서버가 아는 낱말을 폰이 모르면 그 문자는 영영 안 온다');
});
ok('서버 파서에도 카드 규칙이 있다', /하나\\s\*\\d\{3,4\}/.test(server) || /하나\s*\\s\*\\d/.test(server) || server.indexOf('\\d{3,4}') >= 0,
   '서버 규칙이 바뀌었으면 폰도 같이 봐야 한다');

console.log('\n  === ' + (total - fail) + ' 통과 / ' + fail + ' 실패 ===');
process.exit(fail ? 1 : 0);
