/* 🚫 스팸 자동 거르기 (대표 지시 2026-09-08 「스펨메일은 자동으로 거르게 만들어 달라」)

   대표께서 짚으신 한 통 — 받은메일함 09.08 09:29
     주소 「-????x?!@ksz.com」 · 제목에 못 읽은 글자 다섯 · 받는이 「3696322@daum.net」

   ⚠⚠ 이 검사에서 가장 중요한 것은 «멀쩡한 메일을 안 잡는가»다.
     자문사 메일 한 통이 조용히 사라지는 것이 스팸 백 통보다 아프다. 스팸을 놓치면
     대표께서 한 줄 지나치실 뿐이지만, 멀쩡한 것을 먹으면 그 메일함을 못 믿게 된다.

   ★ 무엇을 볼지는 실제 메일 6,334통(받은 쪽)에 대 보고 골랐다.
       ① 제목·이름에 못 읽은 글자   →   1통(그 스팸)  · 멀쩡한 것 0통  ✔ 쓴다
       ② 주소 앞부분이 주소 꼴이 아님 →   1통(같은 것)  · 멀쩡한 것 0통  ✔ 쓴다
       ③ 받는 주소에 우리가 없다     → 245통 · «전부 멀쩡했다»          ✘ 안 쓴다
       ④ 이름과 주소가 똑같다       → 596통 · «전부 멀쩡했다»          ✘ 안 쓴다

   지키는 것.
   ① 그 스팸을 «잡는다»
   ② 멀쩡한 것을 «안 잡는다» (실제로 있던 줄로 본다)
   ③ 낱말로 «안» 가린다
   ④ 우리가 보낸 칸은 «안» 본다
   ⑤ 사람이 손댄 것(자문사·담당자·「스팸 아님」)은 «무조건 지나간다»
   ⑥ 조용히 «안» 사라진다 — 걸렀다고 알리고, 되돌릴 길을 그 자리에 둔다
   ⑦ 다음메일은 «그대로» 둔다 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { sliceFn } = require('./fnslice.js');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'pu-cards.html'), 'utf8');
const bare = app.replace(/\/\*[\s\S]*?\*\//g, ' ');
const FFFD = String.fromCharCode(0xFFFD);

/* 판정만 떼어 돌린다 — 화면 없이 «그 한 통»을 그대로 넣어 본다 */
function judge(row, opts){
  const o = opts || {};
  const ctx = { String, Number, Object, Boolean, console,
    _mbFolders: o.folders || { 'INBOX-x': { kind:'inbox' }, 'Sent Messages-x': { kind:'sent' },
      'Drafts-x': { kind:'drafts' }, '내게쓴편지함-x': { kind:'tome' }, '예약편지함-x': { kind:'sched' } },
    _mbCo: o.co || {}, _mbWhoMsg: o.whoMsg || {},
    _mbNotSpam: o.notSpam || {}, _mbSpamOff: o.off === true };
  vm.createContext(ctx);
  vm.runInContext(bare.match(/const MB_SENT_KINDS = [^\n]*/)[0], ctx);
  ['mbWhoKey','mbDomOf','mbFolderBy','mbSpamOn','mbBrokenText','mbBadLocal','mbSpamWhy','mbIsSpam']
    .forEach(n=>vm.runInContext(sliceFn(app, 'function ' + n + '('), ctx));
  return { why: ctx.mbSpamWhy(row), is: ctx.mbIsSpam(row) };
}

/* 대표께서 짚으신 그 한 통 — 실시간DB 에 담긴 값 그대로 */
const THE_SPAM = {
  _slug:'INBOX-x', _key:'INBOX-x:172722',
  e:'-????x?!@ksz.com', f:'-????x?!@ksz.com',
  s:'&' + FFFD + FFFD + '&' + FFFD + FFFD + '' + FFFD + 'e' + FFFD + 'e' + FFFD + 'e ~~',
  t:'3696322@daum.net', tn:'3696322@daum.net',
  p:'지속력! 단단함! 사이즈 벌크업이 필요하셨다면 지금 클릭하세요 무조건 증정! 빅이벤트 행사중!',
  d:1788827356000, r:0, a:0, g:0, z:3460
};

/* ══════ ① 그 스팸을 잡는가 ══════ */

test('★★★ 대표께서 짚으신 그 한 통을 «잡는다»', () => {
  const r = judge(THE_SPAM);
  assert.ok(r.is, '그 스팸을 못 잡습니다');
  /* 까닭이 «둘 다» 적혀야 한다 — 하나만 걸려도 잡지만, 둘 다 보이는 것이 이 통의 모습이다 */
  assert.match(r.why, /제목이 깨졌습니다/, '깨진 제목을 안 봅니다');
  assert.match(r.why, /주소가 규약에 안 맞습니다/, '이상한 주소를 안 봅니다');
});

test('★★★ 까닭을 «못 적으면 안 거른다»', () => {
  /* ⚠ 이것이 이 기능의 안전장치다. 까닭 없이 거르는 길이 하나라도 있으면
       언젠가 멀쩡한 메일이 «이유 없이» 사라진다. */
  const f = sliceFn(app, 'function mbSpamWhy(').replace(/\/\*[\s\S]*?\*\//g, ' ');
  assert.match(f, /return why\.join/, '까닭을 모아 돌려주지 않습니다');
  const g = sliceFn(app, 'function mbIsSpam(').replace(/\/\*[\s\S]*?\*\//g, ' ');
  assert.match(g, /!!mbSpamWhy\(v\)/, '까닭과 «따로» 판정합니다 — 두 벌이 되면 어긋납니다');
});

/* ══════ ② 멀쩡한 것을 안 잡는가 — 가장 중요한 자리 ══════ */

/* 실제 메일함에 있던 줄들이다(2026-09-08 실측). 하나라도 걸리면 이 기능은 쓸 수 없다. */
const REAL_GOOD = [
  { _slug:'INBOX-x', e:'worksos@nosa.or.kr', f:'근로자이음센터', s:'근로자이음센터 운영기관 선정 안내', t:'370-6@daum.net' },
  /* ③ 이 잡던 것들 — 참조·전달로 온 «멀쩡한» 메일 */
  { _slug:'INBOX-x', e:'jaesung.kim@momstouch.co.kr', f:'김재성', s:'[맘스터치] 복직요청서_이은경님', t:'yuncpa@hanmail.net' },
  { _slug:'INBOX-x', e:'yuncpa@hanmail.net', f:'윤현철', s:'교육수당 및 상담수당 지급명세서-윤현철', t:'hmhtax114@naver.com' },
  /* ④ 가 잡던 것들 — 기계가 보내는 정상 메일(이름과 주소가 같다) */
  { _slug:'INBOX-x', e:'kepco@kepco.co.kr', f:'kepco@kepco.co.kr', s:'이메일청구 접수 인증번호 전송', t:'370-6@daum.net' },
  { _slug:'INBOX-x', e:'service@kcplaa.or.kr', f:'service@kcplaa.or.kr', s:'[訃音] 최재호 노무사님 모친상', t:'370-6@daum.net' },
  /* 제목이 «파일 이름»인 것 — 읽히는 글자 비율로 가리려 했다가 이것들이 걸렸다 */
  { _slug:'INBOX-x', e:'hns09588@gmail.com', f:'김하나', s:'처벌불원의사 확인서.hwp', t:'370-6@daum.net' },
  { _slug:'INBOX-x', e:'53179ny@naver.com', f:'김나연', s:'26.4.14_김나연_아이본병원.pdf', t:'370-6@daum.net' },
  /* 자기에게 쓴 쪽지 — 제목이 「ㅇㅇㅇ」 */
  { _slug:'INBOX-x', e:'370-6@daum.net', f:'푸른노무법인', s:'ㅇㅇㅇ', t:'370-6@daum.net' },
  /* 주소에 «점·더하기·밑줄»이 든 멀쩡한 주소 — 규약이 허락한 글자다 */
  { _slug:'INBOX-x', e:'hong.gil-dong+erp_1@some-corp.co.kr', f:'홍길동', s:'자문 계약서 송부', t:'370-6@daum.net' },
  /* 제목이 아예 없는 것 */
  { _slug:'INBOX-x', e:'a@b.kr', f:'김철수', s:'', t:'370-6@daum.net' },
  /* 주소가 아예 없는 것 — 이상하긴 하지만 «스팸이라 할 근거가 아니다» */
  { _slug:'INBOX-x', e:'', f:'', s:'REBOW 가입 축하 메일입니다.', t:'370-6@daum.net' },
];

test('★★★ 실제로 있던 «멀쩡한» 메일을 하나도 안 잡는다', () => {
  REAL_GOOD.forEach(v=>{
    const r = judge(v);
    assert.equal(r.why, '', '멀쩡한 메일을 잡습니다: ' + v.e + ' ｜ ' + v.s + ' → ' + r.why);
  });
});

test('★★★ 낱말로는 «안» 가린다 — 체불·해고 상담 메일이 걸린다', () => {
  /* ⚠ 그 스팸의 본문은 「지금 클릭하세요 무조건 증정 빅이벤트」였다. 낱말 목록은
       금방 떠오르지만 우리 일에는 못 쓴다 — 아래가 «전부 멀쩡한» 메일이다. */
  [ '대출금 압류로 임금이 안 나온 건 상담',
    '광고비 미지급 관련 체불 진정',
    '무료 노무상담 이벤트 안내 공문',
    '클릭 한 번으로 신청하는 정부지원사업 안내',
  ].forEach(s=>{
    const r = judge({ _slug:'INBOX-x', e:'a@b.kr', f:'김철수', s:s, t:'370-6@daum.net' });
    assert.equal(r.why, '', '낱말로 가리고 있습니다: ' + s);
  });
  /* 소스에도 낱말 목록이 없어야 한다 — 있으면 언젠가 늘어난다 */
  const f = sliceFn(app, 'function mbSpamWhy(');
  assert.ok(!/대출|광고|클릭|무료|이벤트/.test(f.replace(/\/\*[\s\S]*?\*\//g, ' ')),
    '판정 안에 낱말이 들어 있습니다 — 목록은 끝없이 손봐야 하고 언젠가 진짜를 잡습니다');
});

/* ══════ ④ 우리가 보낸 칸 ══════ */

test('★★★ 우리가 «보낸» 칸은 아예 안 본다', () => {
  ['Sent Messages-x','Drafts-x','내게쓴편지함-x','예약편지함-x'].forEach(slug=>{
    const r = judge(Object.assign({}, THE_SPAM, { _slug: slug }));
    assert.equal(r.why, '', slug + ' 에서도 거릅니다 — 우리가 쓴 것을 스팸이라 합니다');
  });
  /* 받은 칸에서는 그대로 걸려야 한다 — 위 검사가 «늘 통과»하는 것이 아님을 함께 본다 */
  assert.ok(judge(Object.assign({}, THE_SPAM, { _slug:'INBOX-x' })).is);
});

/* ══════ ⑤ 사람이 손댄 것 ══════ */

test('★★★ 자문사로 이어 둔 주소는 «무조건 지나간다» — 규칙보다 사람이 앞선다', () => {
  const co = { '-????x?!@ksz,com': '어느자문사' };
  assert.equal(judge(THE_SPAM, { co }).why, '', '이어 둔 주소인데도 거릅니다');
  /* 도메인으로 이어 둔 것도 */
  const co2 = { '@ksz,com': '어느자문사' };
  assert.equal(judge(THE_SPAM, { co: co2 }).why, '', '도메인으로 이어 둔 곳인데도 거릅니다');
});

test('★★★ 담당자를 «박아 둔» 메일은 지나간다 — 사람이 이미 봤다는 뜻이다', () => {
  const whoMsg = { 'inbox-x:172722': '권형하' };
  assert.equal(judge(THE_SPAM, { whoMsg }).why, '', '사람이 담당자를 박았는데도 거릅니다');
});

test('★★★ 「스팸 아님」으로 되돌린 주소는 «다시는» 안 걸린다', () => {
  const notSpam = { '-????x?!@ksz,com': 1 };
  assert.equal(judge(THE_SPAM, { notSpam }).why, '', '되돌렸는데 또 거릅니다');
});

test('★★★ 되돌리기는 «주소 하나»만 푼다 — 도메인째 풀면 온 세상이 열린다', () => {
  /* ⚠ 자문사 잇기에서 무료 메일을 도메인으로 못 잇게 한 것과 같은 까닭이다. */
  const f = sliceFn(app, 'function mbNotSpam(').replace(/\/\*[\s\S]*?\*\//g, ' ');
  assert.ok(!/@'\s*\+|'@'\s*\+\s*mbDomOf|mbDomOf\(/.test(f),
    '되돌리기가 도메인을 만집니다 — 주소 하나만 풀어야 합니다');
  assert.match(f, /mbWhoKey\(em\)/, '주소를 열쇠로 안 적습니다');
  assert.match(f, /mailNotSpam/, '되돌린 것을 안 담습니다 — 새로고침하면 도로 걸립니다');
});

test('★★ 끄면 «아무것도 안 거른다»', () => {
  assert.equal(judge(THE_SPAM, { off:true }).why, '', '껐는데도 거릅니다');
});

/* ══════ ⑥ 조용히 사라지지 않는가 ══════ */

test('★★★ 걸렀다고 «알리는 줄»이 있다 — 조용히 빼면 「우리가 메일을 먹었다」가 된다', () => {
  const f = sliceFn(app, 'function mbSpamLineHtml(').replace(/\/\*[\s\S]*?\*\//g, ' ');
  assert.match(f, /스팸으로 보여/, '걸렀다는 말이 없습니다');
  assert.match(f, /목록에서 뺐습니다/, '무엇을 했는지 안 적혀 있습니다');
  assert.match(f, /mbSpamShow\(/, '「보기」로 열어 볼 길이 없습니다 — 되돌릴 길 없는 거르기는 못 믿습니다');
  /* 0통이면 줄 자체가 없어야 한다 — 늘 있으면 떴을 때의 뜻이 옅어진다(점검 칩과 같은 규칙) */
  assert.match(f, /if\(!n\) return ''/, '0통일 때도 줄을 그립니다');
});

test('★★★ 걸린 줄에는 «왜 걸렸는지»와 «되돌리는 단추»가 함께 붙는다', () => {
  const i = app.indexOf('class="dm-why"');
  assert.ok(i > 0, '까닭 딱지가 없습니다');
  const seg = app.slice(i - 700, i + 700);
  assert.match(seg, /mbNotSpam\(/, '되돌리는 단추가 그 줄에 없습니다 — 설정으로 찾아가게 하면 아무도 안 합니다');
  assert.match(seg, /스팸 아님/, '단추 이름이 없습니다');
  assert.match(seg, /event\.stopPropagation\(\)/,
    '되돌리려 누르면 메일이 열립니다 — 열리면 읽음이 되고 목록도 바뀝니다');
});

/* mbMatchedRows 를 «실제로 돌려» 본다 — 글자로만 보면 조건 한 조각이 빠져도 통과한다
   (이빨 확인이 그 구멍을 잡았다: 「보기」 조건을 지웠는데 검사가 다 통과했다). */
function matched(rows, opts){
  const o = opts || {};
  const ctx = { String, Number, Object, Boolean, console,
    state: { mbFilter:'', mbQ:'', mbSpamShow: !!o.show, mbPage:1, mbPageFor:'' },
    _mbFolders: { 'INBOX-x': { kind:'inbox' } },
    _mbCo:{}, _mbWhoMsg:{}, _mbNotSpam:{}, _mbSpamOff: o.off === true,
    _mbMemo: null,
    mbNow: () => 'INBOX-x',
    mbAllRows: () => rows,
    mbFindHit: () => false };
  vm.createContext(ctx);
  vm.runInContext(bare.match(/const MB_SENT_KINDS = [^\n]*/)[0], ctx);
  ['mbMemoOf','mbWhoKey','mbDomOf','mbFolderBy','mbSpamOn','mbBrokenText','mbBadLocal',
   'mbSpamWhy','mbIsSpam','mbMatchedRows'].forEach(n=>
    vm.runInContext(sliceFn(app, 'function ' + n + '('), ctx));
  return ctx.mbMatchedRows();
}

test('★★★ 목록에서 «실제로» 빠진다 — 그리고 「보기」를 누르면 «실제로» 돌아온다', () => {
  const good = { _slug:'INBOX-x', _key:'INBOX-x:1', e:'a@b.kr', f:'김철수', s:'자문 계약서', r:1 };
  const rows = [good, Object.assign({}, THE_SPAM)];
  const off = matched(rows);
  assert.equal(off.length, 1, '스팸이 목록에 그대로 있습니다');
  assert.equal(off[0]._key, 'INBOX-x:1', '엉뚱한 것을 뺐습니다');
  const on = matched(rows, { show:true });
  assert.equal(on.length, 2, '「보기」를 눌렀는데 «안 돌아옵니다» — 감추는 것이지 없애는 것이 아닙니다');
  /* 껐을 때도 그대로 다 보여야 한다 */
  assert.equal(matched(rows, { off:true }).length, 2, '껐는데도 뺍니다');
});

test('★★★ 한 자리에서만 «뺀다» — 목록·쪽수·모두고르기·방향키가 함께 맞아야 한다', () => {
  /* ⚠ 딴 자리에서 빼면 목록에는 안 보이는데 「모두 고르기」에는 들어가는 메일이 생긴다.
       그 상태로 [삭제] 를 누르면 «안 보이는 메일이 지워진다».
     ★ mbVisibleRows·쪽수·mbVisibleKeys 가 모두 mbMatchedRows 를 지나므로,
       여기 한 곳에서 빼면 그 넷이 함께 맞는다. */
  const f = sliceFn(app, 'function mbMatchedRows(').replace(/\/\*[\s\S]*?\*\//g, ' ');
  /* 셈의 열쇠에 「보기」가 들어가야 한다 — 안 넣으면 눌러도 옛 목록이 그대로 나온다 */
  assert.match(f, /state\.mbSpamShow\?'s':''/, '셈의 열쇠에 「보기」가 안 들어갔습니다');
  /* 빼는 자리가 «하나»여야 한다 */
  const n = (bare.match(/filter\(v=>!mbIsSpam\(v\)\)/g) || []).length;
  assert.equal(n, 1, '스팸을 ' + n + '곳에서 뺍니다 — 한 곳이어야 합니다');
  /* 보이는 것·쪽수·고르기가 모두 이 함수를 지나는지 */
  ['mbVisibleRows','mbPageCount','mbVisibleKeys'].forEach(nm=>{
    const g = sliceFn(app, 'function ' + nm + '(').replace(/\/\*[\s\S]*?\*\//g, ' ');
    assert.match(g, /mbMatchedRows\(\)|mbVisibleRows\(\)/,
      nm + ' 이 mbMatchedRows 를 안 지납니다 — 딴 셈이 되면 스팸이 그 자리에 남습니다');
  });
});

test('★★ 안읽음 셈에서도 «뺀다» — 1통 있다는데 아무리 봐도 없으면 고장이다', () => {
  const i = bare.indexOf('const cntUnread = Math.max(0, mbFolders()');
  assert.ok(i > 0, '안읽음 셈이 스팸을 안 뺍니다');
  const seg = bare.slice(i, i + 600);
  assert.match(seg, /mbIsSpam\(v\)/, '뺀 스팸이 셈에는 남아 있습니다');
  assert.match(seg, /Math\.max\(0,/, '셈이 «빼기»로 음수가 될 수 있습니다');
});

/* ══════ ⑦ 다음메일은 그대로 ══════ */

test('★★★ 다음메일에는 «아무것도 쓰지 않는다» — 잘못 걸려도 아무것도 잃지 않는다', () => {
  /* ⚠ 대표 선택 2026-09-08 「㉮ 로 시작해 뒤에 ㉯ 로」. ㉯(다음메일 스팸함으로 옮기기)는
       «아직 아니다». 지금 그 길을 만들면 잘못 걸린 메일이 30일 뒤 저절로 사라진다. */
  ['mbSpamWhy','mbIsSpam','mbSpamLineHtml','mbNotSpam','mbSpamOffSet','mbSpamShow'].forEach(n=>{
    const f = sliceFn(app, 'function ' + n + '(').replace(/\/\*[\s\S]*?\*\//g, ' ');
    assert.ok(!/mbMoveDaum|mbTrash|readMailAttachment|moveMail|MB_FN/.test(f),
      n + ' 이 다음메일을 만집니다 — 지금은 우리 목록에서만 빼기로 했습니다');
  });
});

/* ══════ ⑧ 켜고 끄기 · 이름 ══════ */

test('★★ 안 적혀 있으면 «켠 것»이다 — 만들어 놓고 아무 일도 안 하면 안 된다', () => {
  const f = sliceFn(app, 'function mbSpamOn(').replace(/\/\*[\s\S]*?\*\//g, ' ');
  assert.match(f, /_mbSpamOff !== true/,
    '빈 값을 「꺼짐」으로 읽습니다 — 대표께서는 「자동으로 거르게」라 하셨습니다');
  /* 못 읽었으면 반대로 «꺼진» 채로 둔다 — 「스팸 아님」 목록을 모르는 채로 거르면
     이미 되돌려 둔 주소를 도로 잡는다 */
  const load = bare.indexOf('if(_mbNotSpam === null){ _mbNotSpam = {}; _mbSpamOff = true; }');
  assert.ok(load > 0, '못 읽었을 때도 그대로 거릅니다 — 되돌려 둔 주소를 도로 잡습니다');
});

test('★★ 설정에 켜고 끄는 자리가 있다', () => {
  const i = app.indexOf("row('🚫 스팸 자동 거르기'");
  assert.ok(i > 0, '설정에 스팸 거르기 줄이 없습니다');
  const seg = app.slice(i, i + 2400);
  assert.match(seg, /mbSpamOffSet\(!this\.checked\)/, '켜고 끄는 손잡이가 없습니다');
  assert.match(seg, /다음메일은 <b>그대로 둡니다<\/b>/, '다음메일을 건드리는지 안 알려 줍니다');
  assert.match(seg, /6,334통/, '무엇에 대 보고 정했는지 안 알려 줍니다');
  assert.match(seg, /낱말로는 안 가립니다/, '낱말로 안 가린다는 말이 없습니다');
  /* 긴 설명은 접는다 — 「열람 확인」에서 배운 그 규칙이다 */
  assert.match(seg, /<details class="msmore">/, '긴 설명을 안 접었습니다');
});

test('★★ 새로 지은 이름이 «한 번만» 선언돼 있다', () => {
  ['mbSpamOn','mbBrokenText','mbBadLocal','mbSpamWhy','mbIsSpam','mbSpamRows',
   'mbSpamLineHtml','mbSpamShow','mbNotSpam','mbSpamOffSet'].forEach(n=>{
    const c = (bare.match(new RegExp('function\\s+' + n + '\\s*\\(', 'g')) || []).length;
    assert.equal(c, 1, n + ' 이 ' + c + '번 선언돼 있습니다');
  });
});

test('★★★ 못 읽은 글자를 «탈출표기»로 적어 두었다 — 날글자는 조용히 바뀐다', () => {
  /* ⚠ U+FFFD 를 날글자로 두면 편집기·붙여넣기·줄끝 고치기를 거치는 사이 딴 것으로
       바뀐다. 그러면 이 거르기는 «아무 일도 안 하면서» 검사를 통과한다. */
  const f = bare.match(/function mbBrokenText[^\n]*/)[0];
  assert.match(f, /\\uFFFD/, '못 읽은 글자를 탈출표기로 안 적었습니다');
  assert.ok(f.indexOf(FFFD) < 0, '날글자가 그대로 있습니다 — 언젠가 조용히 바뀝니다');
});
