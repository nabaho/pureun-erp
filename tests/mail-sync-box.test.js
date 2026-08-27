/* 다음메일함 통째 동기화 — 값 판단 검사.
   실제 메일함에 붙지 않는다. 여기서 틀리면 「모두 동기화」가 조용히 절반만 되거나,
   폴더 하나가 다른 폴더 자리를 덮어쓴다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const MB = require('../functions/mail-box.js');
const fs = require('node:fs');
const path = require('node:path');

/* ── 폴더 열쇠 ──
   다음메일 폴더 경로에는 점이 들어간다(INBOX.1.자문사답변). 실시간DB 열쇠에는
   점을 못 쓴다 — 그대로 쓰면 저장이 통째로 실패한다. */

test('★ 점이 든 폴더 경로도 실시간DB 열쇠로 쓸 수 있다', () => {
  const k = MB.slugOf('INBOX.1.자문사답변');
  assert.equal(/[.#$/[\]]/.test(k), false, '못 쓰는 글자가 남아 있다');
  assert.ok(k.length > 0);
});

test('★ 바꾼 뒤에 겹치지 않는다 — 두 폴더가 한 자리를 다투면 하나가 사라진다', () => {
  assert.notEqual(MB.slugOf('INBOX.a'), MB.slugOf('INBOX_a'));
  assert.notEqual(MB.slugOf('INBOX/a'), MB.slugOf('INBOX.a'));
});

test('같은 경로는 늘 같은 열쇠 — 회차마다 새 폴더가 생기면 안 된다', () => {
  assert.equal(MB.slugOf('보낸메일함'), MB.slugOf('보낸메일함'));
});

/* ── 어떤 칸인가 ──
   이름을 못 박지 않는다. IMAP 표시를 먼저 믿는다. */

test('★ 특수용도표시가 있으면 그것을 믿는다 — 이름이 무엇이든', () => {
  assert.equal(MB.folderKind({ specialUse: '\\Sent', name: '아무이름' }), 'sent');
  assert.equal(MB.folderKind({ specialUse: '\\Drafts', name: 'zzz' }), 'drafts');
  assert.equal(MB.folderKind({ specialUse: '\\Trash', name: 'zzz' }), 'trash');
});

test('★ 그 계정에 «실제로 있는» 이름을 안다 — 실측 2026-08-25 (370-6@daum.net)', () => {
  /* 다음메일이 만들어 둔 칸은 「스팸편지함」·「내게쓴편지함」·「예약편지함」이다.
     예전 목록에는 「스팸함」만 있어서, 400통이 든 내게쓴편지함이 「내 메일함」 밑
     잡폴더로 밀려나 있었고 화면의 「내게쓴메일함」은 가짜 거르개라 늘 비어 있었다. */
  assert.equal(MB.folderKind({ name: '스팸편지함', path: '스팸편지함' }), 'spam');
  assert.equal(MB.folderKind({ name: '내게쓴편지함', path: '내게쓴편지함' }), 'tome');
  assert.equal(MB.folderKind({ name: '예약편지함', path: '예약편지함' }), 'sched');
  /* 대표가 손으로 만든 폴더는 그대로 손폴더다 — 이름에 점이 있어도 마찬가지 */
  assert.equal(MB.folderKind({ name: '1.자문사답변', path: '1.자문사답변' }), 'custom');
  assert.equal(MB.folderKind({ name: '청구서함', path: '청구서함' }), 'custom');
});

test('★ 옆줄 차례 — 받은 → 내게쓴 → 보낸 → 임시 → 예약 → 보관 → 손폴더 → 스팸 → 휴지통', () => {
  const order = (k) => MB.folderOrder(k);
  const seq = ['inbox','tome','sent','drafts','sched','archive','custom','spam','trash'];
  for(let i = 1; i < seq.length; i++){
    assert.ok(order(seq[i-1]) < order(seq[i]),
      seq[i-1] + ' 이 ' + seq[i] + ' 보다 뒤에 있다');
  }
});

test('표시가 없으면 이름으로 짚는다 — 한글·영문 둘 다', () => {
  assert.equal(MB.folderKind({ name: 'INBOX', path: 'INBOX' }), 'inbox');
  assert.equal(MB.folderKind({ name: '보낸메일함', path: '보낸메일함' }), 'sent');
  assert.equal(MB.folderKind({ name: 'Sent Messages', path: 'Sent Messages' }), 'sent');
  assert.equal(MB.folderKind({ name: '휴지통', path: '휴지통' }), 'trash');
});

test('아무것도 안 맞으면 손으로 만든 폴더로 둔다 — 버리지 않는다', () => {
  assert.equal(MB.folderKind({ name: '1.자문사답변', path: 'INBOX.1.자문사답변' }), 'custom');
});

test('고를 수 없는 껍데기 폴더는 세지 않는다 — 늘 0통으로 남는다', () => {
  assert.equal(MB.isSyncable({ path: 'INBOX', flags: new Set(['\\Noselect']) }), false);
  assert.equal(MB.isSyncable({ path: 'INBOX', flags: ['\\NonExistent'] }), false);
  assert.equal(MB.isSyncable({ path: 'INBOX', flags: new Set(['\\HasChildren']) }), true);
});

/* ══════ 가져올 까닭이 있는 칸만 (대표 지시 2026-08-26) ══════
   "메일함에 스팸함은 연결시켜서 가지고 올 필요없다. 그런데 왜 가지고 있나"
   ⚠ 지금까지 폴더를 «가리지 않고» 다 가져왔다. 스팸이 든 것은 필요해서가 아니라
     아무도 빼지 않아서였다. */

test('★ 스팸함은 가져오지 않는다 — 광고 수백 통이 DB 와 동기화 예산을 먹는다', () => {
  assert.equal(MB.isWanted({ name: '스팸편지함', path: '스팸편지함' }), false);
  assert.equal(MB.isWanted({ path: 'Junk', specialUse: '\\Junk' }), false);
});

test('★ 휴지통은 남긴다 — 잘못 지운 것을 찾는 자리라 사람이 실제로 본다', () => {
  assert.equal(MB.isWanted({ name: '휴지통', path: '휴지통' }), true);
});

test('받은메일함·보낸메일함·손으로 만든 폴더는 그대로 가져온다', () => {
  assert.equal(MB.isWanted({ path: 'INBOX', specialUse: '\\Inbox' }), true);
  assert.equal(MB.isWanted({ name: '보낸메일함', path: '보낸메일함' }), true);
  assert.equal(MB.isWanted({ name: '1.자문사답변', path: 'INBOX.1.자문사답변' }), true);
});

test('★ 빼는 갈래를 «한 자리»에서만 정한다 — 두 곳에 적으면 한쪽만 고쳐진다', () => {
  /* 동기화가 «이미 담긴 것을 걷어낼 때»도 이 목록을 본다(mail-sync.js). 목록이 갈리면
     「앞으로는 안 가져오는데 이미 담긴 스팸은 안 지워지는」 어중간한 상태가 된다. */
  assert.ok(Array.isArray(MB.SKIP_KINDS), '빼는 갈래 목록이 밖으로 나와 있지 않다');
  assert.ok(MB.SKIP_KINDS.indexOf('spam') >= 0, '스팸이 빼는 목록에 없다');
  assert.ok(MB.SKIP_KINDS.indexOf('trash') < 0, '휴지통까지 빼고 있다');
});

test('★ 동기화가 «이미 담긴» 스팸도 걷어낸다 — 안 지우면 왼쪽에 그대로 남는다', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'functions', 'mail-sync.js'), 'utf8');
  assert.match(src, /isWanted/, '스팸을 걸러 내지 않는다');
  assert.match(src, /SKIP_KINDS/, '이미 담긴 것을 걷어내는 자리가 없다');
  /* 목록·본문·진행표 셋을 다 지워야 한다 — 하나만 남아도 칸이 계속 보이거나
     다음 회차가 「이미 다 했다」고 여긴다 */
  ['/folders/', '/msgs/', '/sync/'].forEach((p) => {
    assert.ok(src.indexOf("ROOT + '" + p + "' + slug] = null") > 0,
      p + ' 를 걷어내지 않는다');
  });
});

/* ── 첨부 개수 ──
   서명 로고까지 세면 거의 모든 메일에 📎 가 붙어 표시가 뜻을 잃는다. */

test('★ 본문에 박힌 그림(서명 로고)은 첨부로 세지 않는다', () => {
  const structure = {
    childNodes: [
      { type: 'text/html' },
      { type: 'image/png', disposition: 'inline', id: '<logo@sig>',
        dispositionParameters: { filename: 'logo.png' } },
    ],
  };
  assert.equal(MB.attCount(structure, 0), 0);
});

test('진짜 첨부는 센다', () => {
  const structure = {
    childNodes: [
      { type: 'text/plain' },
      { type: 'application/pdf', disposition: 'attachment',
        dispositionParameters: { filename: '급여대장.pdf' } },
      { type: 'application/vnd.ms-excel', disposition: 'attachment',
        dispositionParameters: { filename: '명부.xls' } },
    ],
  };
  assert.equal(MB.attCount(structure, 0), 2);
});

test('disposition 이 없는 옛 메일도 이름이 붙은 것은 첨부로 본다', () => {
  const structure = {
    childNodes: [
      { type: 'text/plain' },
      { type: 'application/octet-stream', parameters: { name: '계약서.hwp' } },
    ],
  };
  assert.equal(MB.attCount(structure, 0), 1);
});

/* ── 폴더 만들기·이름 바꾸기 (대표 지시 2026-08-25) ──
   ⚠ 여기가 틀리면 다음메일에 엉뚱한 자리에 폴더가 생기거나, 이름을 바꾸다 하위 폴더가
     통째로 딸려 간다. 되돌리기 어려운 자리라 값 판단을 따로 검사한다. */

test('★ 이름에 구분자를 못 쓴다 — 「가/나」는 IMAP 이 두 층으로 읽는다', () => {
  assert.match(MB.folderNameBad('가/나', '/'), /쓸 수 없습니다/);
  assert.equal(MB.folderNameBad('가.나', '/'), '', '구분자가 아니면 점은 써도 된다');
  assert.equal(MB.folderNameBad('1.자문사답변', '/'), '', '지금 대표 폴더 이름이 이렇다');
});

test('빈 이름·앞뒤 빈칸·너무 긴 이름을 막는다 — 눈에 안 보이는데 다른 폴더가 된다', () => {
  assert.match(MB.folderNameBad('', '/'), /적어 주세요/);
  assert.match(MB.folderNameBad('   ', '/'), /적어 주세요/);
  assert.match(MB.folderNameBad(' 가 ', '/'), /빈칸/);
  assert.match(MB.folderNameBad('가'.repeat(61), '/'), /깁니다/);
  assert.equal(MB.folderNameBad('계약서류', '/'), '');
});

test('★ 하위 폴더는 어버이 아래로 붙는다', () => {
  assert.equal(MB.childPath('1.자문사답변', '계약', '/'), '1.자문사답변/계약');
  assert.equal(MB.childPath('', '새폴더', '/'), '새폴더', '어버이가 없으면 맨 위');
  assert.equal(MB.childPath('가', '나', ''), '나', '구분자를 모르면 층을 못 만든다 — 맨 위에');
});

test('★ 이름을 바꿔도 어버이는 그대로다 — 어버이째 옮기면 하위가 통째로 딸려 간다', () => {
  assert.equal(MB.renamedPath('1.자문사답변/계약', '계약서', '/'), '1.자문사답변/계약서');
  assert.equal(MB.renamedPath('1.자문사답변', '자문답변', '/'), '자문답변');
});

test('★ 폴더 기록에 구분자와 층을 함께 적는다 — 없으면 하위 폴더를 만들 수 없다', () => {
  const rec = MB.folderRecord({ path: '가/나/다', name: '다', delimiter: '/' }, { messages: 3 });
  assert.equal(rec.delim, '/');
  assert.equal(rec.parent, '가/나');
  assert.equal(rec.depth, 2);
  const top = MB.folderRecord({ path: '1.자문사답변', name: '1.자문사답변', delimiter: '/' }, {});
  assert.equal(top.parent, '', '맨 위 폴더는 어버이가 없다');
  assert.equal(top.depth, 0, '이름의 점을 층으로 읽으면 안 된다');
});

/* ── 미리보기 (폰 목록 셋째 줄) ── */

test('★ 글이 든 조각을 고른다 — text/plain 이 먼저다(html 은 꼬리표를 걷어야 해서 지저분하다)', () => {
  const st = { childNodes: [
    { part: '1', type: 'text/plain', encoding: 'base64', parameters: { charset: 'euc-kr' } },
    { part: '2', type: 'text/html', encoding: 'quoted-printable', parameters: { charset: 'utf-8' } },
  ] };
  const tp = MB.textPartOf(st, 0);
  assert.equal(tp.part, '1');
  assert.equal(tp.html, false);
  assert.equal(tp.cs, 'euc-kr');
});

test('글이 html 뿐이면 그것을 쓴다', () => {
  const st = { childNodes: [{ part: '1', type: 'text/html', encoding: '7bit' }] };
  assert.equal(MB.textPartOf(st, 0).html, true);
});

test('★ 첨부는 미리보기로 쓰지 않는다 — 앞 800바이트를 적으면 목록이 깨진 글자로 찬다', () => {
  const st = { childNodes: [
    { part: '1', type: 'application/pdf', disposition: 'attachment',
      dispositionParameters: { filename: '급여대장.pdf' } },
  ] };
  assert.equal(MB.textPartOf(st, 0), null);
});

test('★ 잘려 온 base64 도 깨지지 않게 읽는다 — 앞부분만 받아 오기 때문이다', () => {
  const full = Buffer.from('안녕하세요 노무사님 자료 보내드립니다', 'utf8').toString('base64');
  const cut = full.slice(0, full.length - 3);          // 묶음 가운데가 잘렸다
  const got = MB.previewFrom(Buffer.from(cut), { enc: 'base64', cs: 'utf-8' });
  assert.match(got, /^안녕하세요 노무사님/);
});

test('따옴표인용(quoted-printable)도 읽는다 — 한글 메일에 흔하다', () => {
  const qp = '=EC=95=88=EB=85=95=ED=95=98=EC=84=B8=EC=9A=94 test';
  assert.match(MB.previewFrom(Buffer.from(qp), { enc: 'quoted-printable', cs: 'utf-8' }), /^안녕하세요/);
});

test('html 은 꼬리표를 걷고 글만 남긴다', () => {
  const h = '<p>안녕하세요.</p><script>steal()</script><b>자료</b>&nbsp;보냅니다';
  const got = MB.previewFrom(Buffer.from(h), { enc: '7bit', cs: 'utf-8', html: true });
  assert.equal(got.indexOf('<'), -1);
  assert.equal(got.indexOf('steal'), -1);
  assert.match(got, /안녕하세요/);
});

test('★ 잘려서 «안 닫힌» style 안의 CSS 가 새어 나오지 않는다 — 실제로 목록에 나왔다', () => {
  /* 대표 화면 2026-08-24: 「메일 발송 | 노동위원회 .color_fix span {color:#888 !i」.
     앞부분만 잘라 받으므로 </style> 가 안 들어와, 여는 꼬리표만 지워지고 CSS 가 글로 남았다. */
  const cutHtml = '<html><head><style>.color_fix span {color:#888 !imp';
  const got = MB.previewFrom(Buffer.from(cutHtml), { enc: '7bit', cs: 'utf-8', html: true });
  assert.equal(got.indexOf('color_fix'), -1, 'CSS 가 미리보기에 남아 있다');
  assert.equal(got.indexOf('{'), -1, 'CSS 조각이 남아 있다');
});

test('★ 글(text/plain) 조각에 실려 온 CSS 도 걷는다 — html 만 걷고 있었다', () => {
  /* 실측 2026-08-24: 「… 감사합니다. p{margin-top:0;margin-bo」.
     html 을 글로 바꿔 보내는 메일 프로그램이 style 을 그대로 흘려 넣는다. */
  const t = '안녕하세요 선생님 처리 결과 알려드립니다. 감사합니다. p{margin-top:0;margin-bo';
  const got = MB.previewFrom(Buffer.from(t), { enc: '7bit', cs: 'utf-8' });   // html: false
  assert.equal(got.indexOf('{'), -1, '글 조각의 CSS 가 남아 있다');
  assert.match(got, /감사합니다/, '본문까지 지워졌다');
});

test('잘린 꼬리표 꼬리도 글로 새지 않는다', () => {
  const got = MB.previewFrom(Buffer.from('<p>안녕하세요 자료 보냅니다</p><div class="x'),
                             { enc: '7bit', cs: 'utf-8', html: true });
  assert.equal(got, '안녕하세요 자료 보냅니다');
});

test('★ 인용줄(> …)은 건너뛴다 — 답장은 온통 인용으로 시작한다', () => {
  const t = '> 이전 메일 내용입니다\n> 또 인용\n실제 답장입니다';
  assert.equal(MB.previewFrom(Buffer.from(t), { enc: '7bit', cs: 'utf-8' }), '실제 답장입니다');
});

test('★ 숫자 문자(&#44048;)를 글자로 푼다 — 안 풀면 「감사합니다」가 코드로 보인다', () => {
  /* 2026-08-24 실측: 보낸메일함 줄이 「&#44048;&#49324;&#54633;&#45768;&#45796;」로 나왔다. */
  const got = MB.previewFrom(Buffer.from('&#44048;&#49324;&#54633;&#45768;&#45796;'),
                             { enc: '7bit', cs: 'utf-8', html: true });
  assert.equal(got, '감사합니다');
  assert.equal(MB.previewFrom(Buffer.from('&#xAC00;&#xB098;'),
                             { enc: '7bit', cs: 'utf-8', html: true }), '가나');
});

test('망가진 숫자 문자에 걸려 넘어지지 않는다 — 못 알아보면 그냥 둔다', () => {
  /* 글자로 못 바꾸는 것을 억지로 바꾸면 목록이 물음표로 찬다. 손대지 않는 것이 낫다. */
  assert.equal(MB.unentity('&#0;').trim(), '', '쓸 수 없는 번호는 빈칸으로');
  assert.equal(MB.unentity('&#999999999999;'), '&#999999999999;', '자릿수가 터무니없으면 그냥 둔다');
  assert.equal(MB.unentity('&#xZZZZ;'), '&#xZZZZ;', '16진수가 아니면 그냥 둔다');
  assert.equal(MB.unentity('&unknown;'), '&unknown;', '모르는 이름은 그냥 둔다');
});

test('★ 전달·답장의 «메일 머리줄»은 글이 아니다 — 그것부터 보이면 무슨 메일인지 모른다', () => {
  const t = '--- Original Message ---\nFrom : "푸른노무법인"<370-6@daum.net>\n'
          + 'To : 이혜은\nSubject : 자료\n\n실제 본문입니다';
  assert.equal(MB.previewFrom(Buffer.from(t), { enc: '7bit', cs: 'utf-8' }), '실제 본문입니다');
  assert.equal(MB.isHeadLine('보낸사람 : 홍길동'), true);
  assert.equal(MB.isHeadLine('----- 원본 메시지 -----'), true);
  assert.equal(MB.isHeadLine('안녕하세요 자료 보냅니다'), false);
});

test('머리줄밖에 없으면 그것이라도 보여 준다 — 빈 줄보다 낫다', () => {
  const t = '--- Original Message ---\nFrom : "푸른노무법인"<370-6@daum.net>';
  assert.ok(MB.previewFrom(Buffer.from(t), { enc: '7bit', cs: 'utf-8' }).length > 0);
});

test('html 의 <br>·</p> 는 줄로 바꾼다 — 안 그러면 머리줄을 줄 단위로 걷을 수 없다', () => {
  const got = MB.previewFrom(Buffer.from('<p>From : 누구</p><br>실제 글입니다'),
                             { enc: '7bit', cs: 'utf-8', html: true });
  assert.equal(got, '실제 글입니다');
});

test('★ 인용밖에 없으면 인용이라도 보여 준다 — 빈 줄은 「본문 없는 메일」로 읽힌다', () => {
  const t = '> 이전 메일 내용입니다\n> 또 인용';
  const got = MB.previewFrom(Buffer.from(t), { enc: '7bit', cs: 'utf-8' });
  assert.ok(got.length > 0, '셋째 줄이 비었다');
  assert.match(got, /이전 메일 내용/);
});

test('미리보기는 길이를 못 박는다 — 만 줄이 오가는 자리다', () => {
  const long = Buffer.from('가'.repeat(500));
  assert.ok(MB.previewFrom(long, { enc: '7bit', cs: 'utf-8' }).length <= MB.PREVIEW_MAX);
});

test('★ 줄에 칸을 더하면 판 번호가 올라간다 — 안 올리면 새 칸이 새 메일에만 붙는다', () => {
  assert.ok(MB.ROW_VER >= 2);
  assert.equal(MB.needsRefetch({ ver: MB.ROW_VER }), false);
  assert.equal(MB.needsRefetch({ ver: MB.ROW_VER - 1 }), true);
  assert.equal(MB.needsRefetch({}), true, '판 번호가 없던 옛 폴더는 다시 훑어야 한다');
});

test('★ 줄 판이 옛것인 폴더는 «다 된 것이 아니다» — 그러면 셈이 거짓말을 한다', () => {
  /* 2026-08-24 실측: 서른셋 가운데 일곱만 새 판이었는데 회차 기록은 ready 33 이었다.
     지난 회차의 done 이 그대로 남아 있어서다. 숫자가 거짓이면 아무도 안 믿는다. */
  assert.equal(MB.folderDone({ done: true, ver: MB.ROW_VER }), true);
  assert.equal(MB.folderDone({ done: true, ver: MB.ROW_VER - 1 }), false, '옛 판을 다 됐다고 한다');
  assert.equal(MB.folderDone({ done: true }), false, '판 번호가 없던 옛 폴더를 다 됐다고 한다');
  assert.equal(MB.folderDone({ done: false, ver: MB.ROW_VER }), false);
  assert.equal(MB.folderDone(null), false);
});

test('미리보기를 넘기면 줄에 담긴다', () => {
  const row = MB.msgRow({ uid: 1, envelope: {} }, '안녕하세요 자료 보냅니다');
  assert.equal(row.p, '안녕하세요 자료 보냅니다');
  assert.equal(MB.msgRow({ uid: 1, envelope: {} }).p, '');
});

/* ── 목록 한 줄 ── */

test('★ 보낸이 이름이 없으면 주소를 이름 자리에도 쓴다 — 칸이 비면 무엇이 왔는지 모른다', () => {
  const row = MB.msgRow({
    uid: 12,
    envelope: { from: [{ address: 'Boss@Example.COM' }], subject: '문의', date: '2026-08-24T06:00:00Z' },
  });
  assert.equal(row.f, 'Boss@Example.COM');
  assert.equal(row.e, 'boss@example.com');
});

test('제목의 줄바꿈은 한 줄로 편다 — 목록이 두 줄로 벌어지면 차림이 무너진다', () => {
  const row = MB.msgRow({ uid: 3, envelope: { subject: '첫줄\r\n둘째줄', from: [] } });
  assert.equal(row.s.indexOf('\n'), -1);
  assert.equal(row.s, '첫줄 둘째줄');
});

test('읽음·중요 표시를 그대로 옮긴다', () => {
  const seen = MB.msgRow({ uid: 1, flags: new Set(['\\Seen', '\\Flagged']), envelope: {} });
  assert.equal(seen.r, 1);
  assert.equal(seen.g, 1);
  const fresh = MB.msgRow({ uid: 2, flags: new Set(), envelope: {} });
  assert.equal(fresh.r, 0);
  assert.equal(fresh.g, 0);
});

test('날짜를 못 알아보면 0 — 목록이 1970년으로 튀지 않게', () => {
  assert.equal(MB.msgRow({ uid: 1, envelope: { date: '알수없음' } }).d, 0);
  assert.equal(MB.msgRow({ uid: 1, envelope: {} }).d, 0);
});

/* ── 어느 번호를 가져올까 ──
   ⚠ 예전에는 번호를 300씩 «훑어 내려갔다». 그런데 이 계정의 번호는 폴더별이 아니라
     계정 전체에서 하나씩 매겨져 171,876번까지 가 있고, 폴더 하나에는 그중 400개만
     있다(실측 2026-08-24). 훑어 내려가면 거의 언제나 «빈 구간»을 열게 되어 400통
     폴더 하나에 430바퀴가 걸렸다. 이제 메일함이 알려 준 번호 목록을 보고 고른다. */

test('★ 번호가 흩어져 있어도 빈 구간을 열지 않는다 — 훑어 내려가던 방식의 값이 여기서 갈린다', () => {
  /* 번호가 17만번대에 400개만 흩어져 있다 */
  const uids = [];
  for (let i = 0; i < 400; i++) uids.push(171876 - i * 37);
  const pick = MB.pickToFetch(uids, {}, 400);
  assert.equal(pick.back.length, 400, '한 바퀴에 다 고르지 못했다');
  assert.equal(pick.done, true, '더 볼 것이 없는데 안 끝났다고 한다');
  /* 고른 것은 모두 «실제로 있는» 번호다 — 없는 번호를 달라고 하지 않는다 */
  pick.back.forEach((u) => assert.ok(uids.indexOf(u) >= 0, u + ' 는 없는 번호다'));
});

test('★ 처음이면 새것에 가까운 쪽부터 한 뭉치 — 사람이 먼저 볼 것이 먼저 찬다', () => {
  const uids = [10, 20, 30, 40, 50];
  const pick = MB.pickToFetch(uids, {}, 3);
  assert.deepEqual(pick.back, [50, 40, 30]);
  assert.equal(pick.done, false);
});

test('★ 바퀴를 거듭하면 옛것까지 다 닿는다 — 그때 done', () => {
  const uids = [];
  for (let i = 1; i <= 950; i++) uids.push(i * 11);
  let sync = {};
  const got = {};
  let guard = 0;
  while (guard++ < 50) {
    const pick = MB.pickToFetch(uids, sync, 400);
    const seen = pick.fresh.concat(pick.back);
    if (!seen.length) break;
    seen.forEach((u) => { got[u] = 1; });
    sync = MB.nextSync(sync, seen, 7, pick.done);
    if (pick.done) break;
  }
  assert.ok(guard < 50, '끝나지 않았다');
  assert.equal(Object.keys(got).length, 950, '빠진 번호가 있다');
  assert.equal(sync.done, true);
});

test('새 메일이 오면 새것을 먼저 고른다 — 뭉치로 자르지 않는다(보통 몇 통뿐이다)', () => {
  const uids = [100, 200, 300, 400, 500];
  const pick = MB.pickToFetch(uids, { hi: 300, lo: 200, uv: 7 }, 400);
  assert.deepEqual(pick.fresh, [500, 400]);
  assert.deepEqual(pick.back, [100]);
  assert.equal(pick.done, true);
});

test('빈 폴더는 볼 것이 없다 — 바퀴마다 헛되게 붙지 않는다', () => {
  const pick = MB.pickToFetch([], {}, 400);
  assert.deepEqual(pick.back, []);
  assert.deepEqual(pick.fresh, []);
  assert.equal(pick.done, true);
});

test('★ 번호는 낱개로 적어 보낸다 — 구간으로 줄이면 없는 번호까지 달라고 하는 셈이다', () => {
  assert.equal(MB.uidSet([30, 10, 20]), '10,20,30');
  assert.equal(MB.uidSet([5, 0, -1, 7]), '5,7');
  assert.equal(MB.uidSet([]), '');
});

test('★ 표시가 뒤로 가지 않는다 — 되돌아가면 같은 것을 영원히 다시 가져온다', () => {
  const s = MB.nextSync({ hi: 5000, lo: 100, uv: 7 }, [200, 300], 7, false);
  assert.equal(s.hi, 5000);
  assert.equal(s.lo, 100);
});

test('★ 지난 회차가 적어 둔 것을 떨어뜨리지 않는다 — 정리 판정이 통째로 망가진다', () => {
  /* n 을 잃으면 「통수가 다르다」가 늘 참이 되어 폴더를 회차마다 헛되게 읽고(요금),
     lastN 을 잃으면 그 반대로 «지운 것이 있어도 못 알아챈다». 둘 다 겪었다(2026-08-24). */
  const s = MB.nextSync({ hi: 500, lo: 200, uv: 7, n: 301, prunedAt: 1756000000000, lastN: 299 },
                        [150, 199], 7, false);
  assert.equal(s.n, 301);
  assert.equal(s.prunedAt, 1756000000000);
  assert.equal(s.lastN, 299);
});

test('번호가 갈리면 셈도 버린다 — 다른 메일을 세어 둔 값이다', () => {
  const s = MB.nextSync({ hi: 500, lo: 1, uv: 7, n: 500, prunedAt: 9, lastN: 500 }, [10], 9, true);
  assert.equal(s.n, 0);
  assert.equal(s.prunedAt, 0);
  assert.equal(s.lastN, 0);
});

test('★ 서버가 번호를 다시 매겼으면(uidValidity 변경) 처음부터 다시 한다', () => {
  assert.equal(MB.uidReset({ uv: 7 }, 9), true);
  assert.equal(MB.uidReset({ uv: 7 }, 7), false);
  assert.equal(MB.uidReset({}, 7), false, '처음이면 다시 할 것이 없다');
  const s = MB.nextSync({ hi: 5000, lo: 1, uv: 7 }, [10, 20], 9, false);
  assert.equal(s.uv, 9);
  assert.equal(s.hi, 20, '지난 표시를 그대로 두면 새 번호를 건너뛴다');
  assert.equal(s.lo, 10);
});


/* ══════════════════════════════════════════════════════════════════════════
   전달된 메일이 «통째로 첨부»된 것 (2026-08-27 검토에서 나옴)
   ══════════════════════════════════════════════════════════════════════════
   노무법인에 아주 흔한 모양이다 — 받은 메일을 그대로 붙여 보내는 것(message/rfc822).
   그 첨부 «안»에 또 조각이 들어 있다.

   ⚠ 예전에는 첨부인지 보기 «전»에 안으로 파고들었다. 그래서
       화면에 보이는 차례 : [전달된메일.eml, 바깥첨부.pdf]   (작은 메일 — mailparser)
       첨부 받는 쪽 차례  : [안쪽첨부.pdf,  바깥첨부.pdf]   (pickParts)
     첫째 첨부를 누르면 «다른 파일»이 내려왔다.
   ★ 사람 눈에 그것은 «파일 하나»다. 그래서 첨부인지 먼저 보고, 첨부면 안 파고든다. */

const MS = require('../functions/mail-sync.js');

/* 전달된 메일이 통째로 붙은 흔한 모양 */
const FWD = { type:'multipart/mixed', childNodes:[
  { type:'text/plain', part:'1', parameters:{ charset:'euc-kr' } },
  { type:'message/rfc822', part:'2', disposition:'attachment',
    dispositionParameters:{ filename:'전달된메일.eml' }, size:9000,
    childNodes:[
      { type:'text/plain', part:'2.1' },
      { type:'application/pdf', part:'2.2', disposition:'attachment',
        dispositionParameters:{ filename:'안쪽첨부.pdf' }, size:5000 } ] },
  { type:'application/pdf', part:'3', disposition:'attachment',
    dispositionParameters:{ filename:'바깥첨부.pdf' }, size:7000 } ]};

test('★ 통째로 첨부된 메일은 «한 개»다 — 안으로 파고들면 누른 것과 다른 파일이 내려온다', () => {
  const got = MS.pickParts(FWD, null, 0);
  const names = got.atts.map(a => a.name);
  assert.ok(names.indexOf('전달된메일.eml') >= 0,
    '사람이 화면에서 보는 첨부(.eml)가 목록에 없습니다 — 누르면 다른 것이 옵니다');
  assert.ok(names.indexOf('안쪽첨부.pdf') < 0,
    '첨부 «안»의 것이 목록에 올라왔습니다 — 차례가 화면과 어긋납니다');
  assert.ok(names.indexOf('바깥첨부.pdf') >= 0, '바깥 첨부가 빠졌습니다');
  /* ⚠ 조각 이름을 함께 실어야 한다 — 받는 쪽이 번호가 아니라 이것으로 집는다 */
  got.atts.forEach(a => assert.ok(a.part, a.name + ' 에 조각 이름이 없습니다'));
});

test('★ 📎 개수도 사람 눈과 같아야 한다 — 안쪽 것까지 세면 표시가 뜻을 잃는다', () => {
  assert.equal(MB.attCount(FWD, 0), 2, '사람 눈에는 첨부가 둘입니다');
  /* 안에 첨부가 셋 든 것을 붙여도 «한 개»다 */
  const many = { type:'multipart/mixed', childNodes:[
    { type:'text/plain', part:'1' },
    { type:'message/rfc822', part:'2', disposition:'attachment',
      dispositionParameters:{ filename:'묶음.eml' }, size:1,
      childNodes:[1,2,3].map((n,i)=>({ type:'application/pdf', part:'2.'+(i+1),
        disposition:'attachment', dispositionParameters:{ filename:'안'+n+'.pdf' }, size:1 })) } ]};
  assert.equal(MB.attCount(many, 0), 1, '붙인 메일 하나를 여러 개로 세고 있습니다');
});

test('★ 본문 조각의 «글자표»를 들고 온다 — 없으면 큰 메일의 한글이 깨진다', () => {
  const got = MS.pickParts(FWD, null, 0);
  assert.equal(got.textCs, 'euc-kr', '글자표를 안 들고 옵니다');
  /* 큰 메일은 이 값으로 읽는다 — utf-8 로 못 박으면 euc-kr 한글이 통째로 깨진다.
     (작은 메일은 mailparser 가 알아서 해 주므로 큰 것만 그랬다 — 눈에 잘 안 띈다) */
  const euc = Buffer.from([0xB0,0xA8,0xBB,0xE7,0xC7,0xD5,0xB4,0xCF,0xB4,0xD9]);
  assert.equal(MB.toText(euc, got.textCs), '감사합니다');
  assert.notEqual(euc.toString('utf8'), '감사합니다', '검사 밑그림이 틀렸습니다');
});
