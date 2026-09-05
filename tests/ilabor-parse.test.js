/* 한국공인노무사회 자료 읽개 — 진짜 HTML 로 규칙을 못 박는다
   ═══════════════════════════════════════════════════════════════════════════
   대표 지시 2026-09-03: 「여기에서 자료와 데이터를 찾아서 가지고 와라 …
   비번아이디를 연결해서 자동으로」 → 방식 「나」(로그인해서 첨부까지) 승인.

   ★ 밑감은 «실제로 받아 온 HTML»이다 (tests/fixtures/ilabor-*.html, 2026-09-03).
     흉내 낸 HTML 로만 검사하면, 사이트가 실제로 어떻게 생겼는지는 아무도 안 지킨다.

   ★ 이 검사가 지키는 규칙
     ① 목록에서 고유번호·sid·제목·기관·날짜를 «다» 뽑는다 (하나만 빠져도 자료를 잃는다)
     ② 고유번호와 sid 를 «헷갈리지 않는다» — 다른 수다
     ③ «막힘»과 «내용 없음»을 가른다 (안 가르면 로그인 풀림을 「자료 없음」으로 읽는다)
     ④ 못 읽으면 «못 읽었다고 말한다» — 빈 값을 성공으로 돌려주지 않는다
     ⑤ 남의 서버·우리 요금에 울타리가 있다 (개수·크기 상한)
     ⑥ 브라우저 표시를 «지우지 않는다» — 없으면 자료가 하나도 안 온다 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const P = require('../functions/ilabor-parse.js');

const 밑감 = (이름) => fs.readFileSync(path.join(__dirname, 'fixtures', 이름), 'utf8');
const 목록쪽 = 밑감('ilabor-list.html');
const 막힌쪽 = 밑감('ilabor-detail-locked.html');

/* ══════ ① 목록 ══════ */

test('★ 진짜 목록에서 자료를 뽑는다 — 열 줄', () => {
  const 것 = P.목록읽기(목록쪽);
  assert.ok(것.length >= 5, '뽑힌 것이 너무 적다: ' + 것.length);
  /* 검사고정-허용: 아래 셋은 «실제로 받아 온 밑감»의 값이다.
     읽개를 고쳐 이 값이 달라지면 엉뚱한 칸을 읽고 있는 것이다. */
  const 첫 = 것[0];
  assert.equal(첫.고유번호, '3430');
  assert.equal(첫.sid, '4156');
  assert.equal(첫.기관, '재정경제부');
  assert.equal(첫.날짜, '2026-08-27');
  assert.ok(/사업체노동력조사/.test(첫.제목), '제목이 엉뚱하다: ' + 첫.제목);
});

test('★★ 고유번호와 sid 를 «헷갈리지 않는다» — 다른 수다', () => {
  /* 화면에 보이는 것은 고유번호(3430), 상세로 갈 때 쓰는 것은 sid(4156).
     이 둘을 섞으면 «엉뚱한 자료»를 연다. 실측에서 늘 656 만큼 어긋나 있었다. */
  const 것 = P.목록읽기(목록쪽);
  것.forEach((x) => {
    assert.notEqual(x.고유번호, x.sid, '고유번호와 sid 가 같게 뽑혔다 — 한쪽을 잘못 읽었다');
    assert.ok(x.주소.indexOf('sid=' + x.sid) > 0, '주소의 sid 가 뽑은 sid 와 다르다: ' + x.주소);
  });
});

test('한 줄에서 다섯 칸을 다 뽑는다 — 하나만 비어도 자료를 잃는다', () => {
  P.목록읽기(목록쪽).forEach((x, i) => {
    ['고유번호', 'sid', '제목', '기관', '날짜', '주소'].forEach((k) => {
      assert.ok(x[k] && String(x[k]).length, i + '번째 줄의 «' + k + '» 이 비었다');
    });
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(x.날짜), '날짜 꼴이 아니다: ' + x.날짜);
  });
});

test('같은 sid 를 두 번 담지 않는다 — 목록에 링크가 두 번 나온다', () => {
  /* 실측: 한 자료에 링크가 두 개(번호·제목) 붙어 있다. */
  const 것 = P.목록읽기(목록쪽);
  const 본것 = new Set(것.map((x) => x.sid));
  assert.equal(본것.size, 것.length);
});

test('주소는 «온전한» 주소다 — 이어 붙일 필요가 없게', () => {
  P.목록읽기(목록쪽).forEach((x) => {
    assert.ok(/^https?:\/\//.test(x.주소), '반쪽 주소다: ' + x.주소);
    assert.ok(x.주소.indexOf('&amp;') < 0, '&amp; 가 안 풀렸다 — 엉뚱한 곳으로 간다: ' + x.주소);
  });
});

test('쪽수를 읽는다 — 안 읽으면 첫 쪽만 보고 「이것뿐」이라 여긴다', () => {
  assert.ok(P.쪽수(목록쪽) > 1, '쪽수를 1 로만 본다');
});

test('엉뚱한 것을 넣어도 «빈손»으로 돌려주고 터지지 않는다', () => {
  ['', null, undefined, '<html>아무것도 없음</html>'].forEach((v) => {
    assert.deepEqual(P.목록읽기(v), []);
    assert.equal(P.쪽수(v), 1);
  });
});

/* ══════ ② 막힘 ══════ */

test('★★ 로그인 없이 받은 상세를 «막혔다»로 본다', () => {
  /* 이것이 안 되면 로그인 풀림을 「오늘은 자료가 없네」로 읽고 조용히 아무것도 안 가져온다. */
  assert.equal(P.막혔나(막힌쪽), true, '진짜 막힌 쪽을 막힘으로 못 본다');
});

test('보안장비가 튕겨 낸 것도 «막힘»이다 — 브라우저 표시를 빠뜨렸을 때', () => {
  const 튕김 = '<html><head><title>302 Found</title></head><body>'
    + '<a href="http://se-cu.com/error.html">here</a></body></html>';
  assert.equal(P.막혔나(튕김), true);
});

test('★ «큰» 쪽인데 본문이 「로그인 후 이용」이면 막힘이다', () => {
  /* 작은 쪽은 크기로도 걸린다. 이 검사는 «본문 글자로 보는 길»이 살아 있는지를 본다 —
     사이트가 온전한 쪽에 그 말만 얹어 줄 때가 그 길이 일하는 자리다.
     ⚠ 이 검사가 없으면 그 길을 지워도 아무도 모른다(2026-09-03 되돌림에서 실제로 안 걸렸다). */
  const 큰막힘 = '<html><body>' + '가'.repeat(5000)
    + '<div>이 자료는 로그인 후 이용가능합니다.</div></body></html>';
  assert.ok(큰막힘.length > 4000, '밑감이 작으면 크기 조건으로 걸려 이 검사의 뜻이 사라진다');
  assert.equal(P.막혔나(큰막힘), true);
});

test('제대로 온 쪽은 «막힘이 아니다»', () => {
  assert.equal(P.막혔나(목록쪽), false, '멀쩡한 목록을 막힘으로 본다 — 아무것도 못 가져온다');
});

/* ══════ ②-1 로그인 문은 «공인노무사회» 다 ══════ */

test('★★ 로그인은 ilabor 가 아니라 공인노무사회에서 한다', () => {
  /* 2026-09-03 에 하루를 여기서 썼다. ilabor 의 로그인 칸에 보냈더니
     「로그인 정보가 존재하지 않습니다」가 왔다 — 아이디가 틀린 게 아니라
     «계정이 거기 없었다». 대표께서 화면으로 알려 주셨다:
     공인노무사회에서 로그인 → /sso/ilabor 로 넘어간다.
     ⚠ 이 검사가 없으면 다음 사람이 또 ilabor 쪽으로 되돌린다. */
  assert.ok(/kcplaa\.or\.kr/.test(P.로그인보내는곳),
    '로그인을 공인노무사회로 안 보낸다: ' + P.로그인보내는곳);
  assert.ok(!/ilabor/.test(P.로그인보내는곳), '★ 로그인을 다시 ilabor 로 보내고 있다');
  assert.ok(/\/login\/chk$/.test(P.로그인보내는곳), '보내는 자리가 /login/chk 가 아니다');
  assert.ok(/\/sso\/ilabor$/.test(P.SSO주소), 'SSO 자리가 /sso/ilabor 가 아니다');
});

test('★★ 반드시 «www.» 를 쓴다 — 없으면 깨진 곳으로 보낸다', () => {
  /* 실측: kcplaa.or.kr/login 은 host 와 path 를 슬래시 없이 붙여
     `www.kcplaa.or.krlogin` 으로 보낸다. 이름 풀이가 안 되어 «조용히» 실패한다. */
  assert.ok(/^https:\/\/www\.kcplaa\.or\.kr/.test(P.회원사이트),
    '★ www. 가 없다 — 깨진 리다이렉트로 조용히 실패한다: ' + P.회원사이트);
});

test('★ 로그인 칸 이름이 밑감(실제 폼)과 같다', () => {
  /* 흉내가 아니라 «실제로 받아 온 폼»과 대조한다. */
  const 폼 = 밑감('kcplaa-login.html');
  assert.ok(/name="login_id"/.test(폼), '밑감에 login_id 가 없다 — 밑감이 낡았다');
  assert.ok(/name="login_pass"/.test(폼), '밑감에 login_pass 가 없다');
  const m = /action="([^"]*)"/.exec(폼);
  assert.ok(m && P.로그인보내는곳.endsWith(m[1]),
    '보내는 자리가 폼의 action 과 다르다: ' + (m && m[1]) + ' vs ' + P.로그인보내는곳);
});

/* ══════ ②-2 SSO 넘겨받기 ══════ */

test('★ SSO 답에서 ilabor 주소를 뽑는다', () => {
  const r = P.sso주소뽑기("location.href='https://ilabor.co.kr/main/sso.php?k=abc';");
  assert.equal(r.ok, true);
  assert.equal(r.주소, 'https://ilabor.co.kr/main/sso.php?k=abc');
  assert.equal(r.열쇠붙음, true);
});

test('★★ 열쇠가 «안 붙은» 맨 주소면 그 사실을 말한다 (실제 답으로)', () => {
  /* 로그인 안 한 채로 부르면 맨 주소만 온다 — 실제로 받아 온 답이다.
     그대로 열면 «손님»으로 들어가 상세가 다 막힌다. 그것을 조용히 넘기면
     「자료가 안 온다」인데 까닭을 못 짚는다. */
  const r = P.sso주소뽑기(밑감('kcplaa-sso-notlogged.txt'));
  assert.equal(r.ok, true, '주소는 뽑아야 한다');
  assert.equal(r.열쇠붙음, false, '★ 열쇠가 없는데 붙었다고 한다 — 손님인 줄 모른다');
});

test('★★ 남의 주소로는 «안 간다»', () => {
  /* 답을 바꿔치기해도 우리 아이디로 엉뚱한 곳을 열지 않게. */
  ['location.href="https://evil.example.com/x";',
   "location.href='https://ilabor.co.kr.evil.com/x';",
   "location.href='http://notilabor.co.kr/';"].forEach((답) => {
    const r = P.sso주소뽑기(답);
    assert.equal(r.ok, false, '★ 남의 주소를 받았다: ' + 답);
  });
});

test('SSO 답이 비었으면 «못 찾았다»고 한다', () => {
  ['', null, undefined, '<html>아무것도</html>'].forEach((v) => {
    assert.equal(P.sso주소뽑기(v).ok, false);
  });
});

/* ══════ ③ 로그인 판정 ══════ */

test('★ 로그인 판정은 «모르면 실패»로 본다', () => {
  /* 모르는 것을 성공으로 치면, 그 뒤 모든 자료가 「막힘」인데 까닭을 못 짚는다. */
  assert.equal(P.로그인됐나('아이디 또는 비밀번호가 일치하지 않습니다').ok, false);
  assert.equal(P.로그인됐나('없는 아이디입니다').ok, false);
  assert.equal(P.로그인됐나('알 수 없는 무슨 글').ok, false, '모르는 답을 성공으로 봤다');
  assert.equal(P.로그인됐나('<script>top.location.href="/main/index.php";</script>').ok, true);
  assert.equal(P.로그인됐나('').ok, true, '빈 답은 조용한 성공이다');
});

test('★★ alert 이 있으면 «보내 주더라도» 실패로 본다 — 닫히는 쪽으로', () => {
  /* 사이트가 말을 띄우고 «동시에» 어디론가 보내는 답을 줄 수 있다.
     그때 보내기만 보고 성공이라 하면, 「점검 중」이라 해 놓고 손님으로 들어가
     그 뒤 모든 자료가 막힌다 — 까닭은 못 짚는다.
     ⚠ 이 검사가 없으면 alert 캐내는 줄을 지워도 아무도 모른다
       (2026-09-03 되돌림에서 실제로 안 걸렸다). */
  const r = P.로그인됐나('alert("지금은 점검 중입니다"); location.href="/main/index.php";');
  assert.equal(r.ok, false, '★ 말을 띄웠는데 성공으로 봤다');
  assert.ok(/점검/.test(r.까닭), 'alert 속 말이 까닭으로 안 왔다: ' + r.까닭);
});

test('실패하면 «까닭»을 함께 준다 — 왜 안 됐는지 말해야 한다', () => {
  const r = P.로그인됐나('비밀번호를 확인해 주세요');
  assert.equal(r.ok, false);
  assert.ok(r.까닭 && r.까닭.length, '까닭이 비었다');
});

/* ══════ ④ 상세·첨부 ══════ */

test('★ 막힌 쪽을 상세읽기에 넣으면 «성공이라 하지 않는다»', () => {
  const r = P.상세읽기(막힌쪽);
  assert.equal(r.ok, false);
  assert.ok(/막혔/.test(r.까닭), '까닭이 「막혔다」가 아니다: ' + r.까닭);
});

test('읽을 것이 없으면 «없다고 말한다» — 빈 값을 성공으로 주지 않는다', () => {
  const r = P.상세읽기('<html><body><div></div></body></html>');
  assert.equal(r.ok, false);
});

test('첨부를 찾는다 — 내려받기 스크립트와 파일 이름꼴 둘 다', () => {
  const h = '<a href="/main/include/download.php?sid=1&fno=2">시행지침.hwp</a>'
    + '<a href="./files/가이드.pdf">활용가이드</a>';
  const 것 = P.첨부읽기(h);
  assert.equal(것.length, 2, JSON.stringify(것));
  것.forEach((x) => assert.ok(/^https?:\/\//.test(x.주소), '반쪽 주소다: ' + x.주소));
});

test('꾸밈 그림·헛 링크는 첨부가 아니다', () => {
  const h = '<a href="/img/btn_down.gif">내려받기</a>'
    + '<a href="#">위로</a>'
    + '<a href="javascript:void(0)">닫기</a>'
    + '<a href="mailto:a@b.c">메일</a>'
    + '<a href="/main/include/download.php?sid=9">진짜.hwp</a>';
  const 것 = P.첨부읽기(h);
  assert.equal(것.length, 1, JSON.stringify(것));
  assert.ok(/진짜/.test(것[0].이름));
});

test('같은 첨부를 두 번 담지 않는다', () => {
  const h = '<a href="/d.php?f=1">가.pdf</a><a href="/d.php?f=1">가.pdf</a>';
  assert.equal(P.첨부읽기(h).length, 1);
});

/* ══════ ⑤ 울타리 — 남의 서버와 우리 요금 ══════ */

test('★ 이미 가진 것은 다시 안 부른다', () => {
  const 목록 = [{ sid: '1' }, { sid: '2' }, { sid: '3' }];
  const 새것 = P.새것고르기(목록, { 2: {} }, 10);
  assert.deepEqual(새것.map((x) => x.sid), ['1', '3']);
});

test('★★ 한 번에 가져오는 수에 «상한»이 있다', () => {
  /* 상한이 없으면 첫 회에 3,430건을 부른다 — 남의 서버에 하는 짓이 아니다. */
  const 목록 = Array.from({ length: 500 }, (_, i) => ({ sid: String(i) }));
  assert.equal(P.새것고르기(목록, {}, 10).length, 10);
  assert.ok(P.새것고르기(목록, {}, 0).length <= 20, '상한을 안 주면 무한이 된다');
  assert.ok(P.새것고르기(목록, {}).length <= 20, '기본 상한이 없다');
});

test('★ 첨부는 개수·크기에 울타리가 있다 — 창고는 무료가 아니다', () => {
  const 많이 = Array.from({ length: 30 }, (_, i) => ({ 이름: i + '.pdf', 주소: 'http://x/' + i }));
  assert.ok(P.첨부거르기(많이).length <= P.첨부최대개수);
  assert.equal(P.너무크나(P.첨부최대바이트 + 1), true);
  assert.equal(P.너무크나(1024), false);
  assert.equal(P.너무크나(undefined), false, '크기를 모를 때는 막지 않는다(모르는 것이 큰 것은 아니다)');
});

test('창고 자리 이름에 파이어베이스가 못 쓰는 글자가 없다', () => {
  const 자리 = P.창고자리('4156', '가이드 (최종)#1/2.hwp');
  assert.ok(자리.indexOf('ilabor/4156/') === 0, 자리);
  assert.ok(!/[#[\]]/.test(자리.slice('ilabor/4156/'.length)), '못 쓰는 글자가 남았다: ' + 자리);
});

/* ══════ ⑥ 브라우저 표시 ══════ */

test('★★ 브라우저 표시를 «지우지 않는다» — 없으면 자료가 하나도 안 온다', () => {
  /* 실측 2026-09-03: 표시가 없으면 302 로 보안장비 오류쪽으로 튕긴다.
     오류가 나는 것이 아니라 «오류쪽 HTML 이 200 처럼» 오므로 더 위험하다. */
  assert.ok(/Mozilla/.test(P.브라우저표시), '브라우저 표시가 비었다');
  assert.ok(P.브라우저표시.length > 40);
});

test('주소 뿌리는 한 곳에서만 온다 — 두 곳에 적으면 한쪽만 낡는다', () => {
  assert.ok(P.사이트.indexOf(P.벽) === 0);
  assert.ok(/\/main\/$/.test(P.사이트), '사이트 뿌리가 /main/ 으로 끝나야 한다: ' + P.사이트);
});

/* ══════ ⑦ 서버 쪽이 지켜야 할 것 (글자로 본다) ══════ */

test('★★ 아이디·비밀번호가 «저장소에 없다»', () => {
  /* 암호는 서버 비밀값으로만 온다. 저장소에 적히면 그 순간 새 나간 것이다. */
  const idx = fs.readFileSync(path.join(__dirname, '..', 'functions', 'index.js'), 'utf8');
  /* ⚠ ilaborPull «만» 보면 모자란다 — 로그인 함수(노무사회로그인)가 그 밖에 있다.
     노무사회 덩이 전체를 본다: require 줄부터 ilaborPull 끝까지. */
  const 덩이 = /const 노무사회 = require\("\.\/ilabor-parse"\)[\s\S]*?exports\.ilaborPull[\s\S]*?\n  \}\);/.exec(idx);
  assert.ok(덩이, '노무사회 덩이를 못 찾았다');
  assert.ok(/process\.env\.ILABOR_ID/.test(덩이[0]), '아이디를 비밀값에서 안 읽는다');
  assert.ok(/process\.env\.ILABOR_PW/.test(덩이[0]), '비밀번호를 비밀값에서 안 읽는다');
  assert.ok(/secrets:\s*\["ILABOR_ID",\s*"ILABOR_PW"\]/.test(덩이[0]), '비밀값을 선언하지 않았다');
  /* ⚠ 여기서 «실제 아이디를 글자로 적어» 찾지 않는다 — 그러면 그 아이디가
       이 검사 파일에 남아, 막으려던 일을 우리가 하는 셈이 된다.
       대신 «값을 글자로 박아 두지 않았는지»를 본다: 보내는 몸통이 변수여야 한다. */
  /* ⚠ 칸 이름은 바뀐다 — ilabor 의 id·pw 에서 공인노무사회의 login_id·login_pass 로
       바뀌었다(2026-09-03, 로그인 문이 딴 곳이었다). 그래서 «이름»을 못 박지 않고
       「아이디·암호 «변수»를 보내는가」만 본다. */
  assert.ok(/login_id:\s*String\(아이디|id:\s*String\(아이디/.test(덩이[0]),
    '아이디를 변수로 안 보낸다 — 글자로 박혔을 수 있다');
  assert.ok(/login_pass:\s*String\(암호|pw:\s*String\(암호/.test(덩이[0]),
    '비밀번호를 변수로 안 보낸다 — 글자로 박혔을 수 있다');
  const 박힘 = /(login_id|login_pass|아이디|암호|password|passwd)\s*[:=]\s*["'][^"']{3,}["']/i.exec(덩이[0]);
  assert.equal(박힘, null, '★ 아이디·비밀번호로 보이는 «글자»가 박혀 있다: ' + (박힘 && 박힘[0]));
  const parse = fs.readFileSync(path.join(__dirname, '..', 'functions', 'ilabor-parse.js'), 'utf8');
  const 박힘2 = /(id|pw|password|passwd)\s*[:=]\s*["'][^"']{3,}["']/i.exec(parse);
  assert.equal(박힘2, null, '★ 읽개에 값이 박혀 있다: ' + (박힘2 && 박힘2[0]));
});

test('★ 읽개는 바깥을 «두드리지 않는다» — 검사가 인터넷 없이 돌아야 한다', () => {
  const parse = fs.readFileSync(path.join(__dirname, '..', 'functions', 'ilabor-parse.js'), 'utf8');
  ['fetch(', 'require("http', "require('http", 'XMLHttpRequest', 'axios']
    .forEach((낱말) => {
      assert.equal(parse.indexOf(낱말), -1,
        '읽개가 바깥을 두드린다(' + 낱말 + ') — 바깥 두드리는 일은 index.js 몫이다');
    });
});

test('★ 총괄관리자만 부를 수 있다 — 회원 계정으로 남의 사이트에 드는 일이다', () => {
  const idx = fs.readFileSync(path.join(__dirname, '..', 'functions', 'index.js'), 'utf8');
  const 덩이 = /exports\.ilaborPull[\s\S]*?\n  \}\);/.exec(idx)[0];
  assert.ok(/requireStaff/.test(덩이), '누가 부르는지 안 본다');
  assert.ok(/isAdmin\s*!==\s*true/.test(덩이), '총괄관리자로 막지 않는다');
});

test('★ 남의 서버를 몰아치지 않는다 — 부를 때마다 쉰다', () => {
  const idx = fs.readFileSync(path.join(__dirname, '..', 'functions', 'index.js'), 'utf8');
  const 덩이 = /exports\.ilaborPull[\s\S]*?\n  \}\);/.exec(idx)[0];
  assert.ok(/잠깐\(\d+\)/.test(덩이), '쉬지 않고 잇달아 부른다');
});

/* ══════ ⑧ 상세는 «라벨»로 읽는다 (2026-09-04 — 엿보기로 진짜 화면을 처음 봤다) ══════
   대표께서 엿보기를 눌러 주셔서 로그인한 상세를 처음 볼 수 있었다.
   밑감은 그때 실제로 받은 글이다 — tests/fixtures/ilabor-detail-text.txt */

const 상세글 = 밑감('ilabor-detail-text.txt');

test('★★ 라벨로 자료번호·제목·기관·작성일을 읽는다 (진짜 화면)', () => {
  /* 검사고정-허용: 실제로 받아 온 자료(3430번)의 값이다.
     읽개를 고쳐 이 값이 달라지면 엉뚱한 칸을 읽고 있는 것이다. */
  const r = P.상세읽기('<html><body>' + 상세글 + '</body></html>');
  assert.equal(r.ok, true);
  assert.equal(r.읽은법, '라벨');
  assert.equal(r.고유번호, '3430');
  assert.equal(r.기관, '재정경제부');
  assert.equal(r.날짜, '2026-08-27');
  assert.match(r.제목, /사업체노동력조사/);
});

test('★★ 제목에 «ilabor 3.0» 이 들어오지 않는다', () => {
  /* 2026-09-04 에 실제로 그랬다 — <title> 을 제목으로 삼아 쪽 제목이 들어왔다.
     이 검사가 그 실수를 못 박는다. */
  const r = P.상세읽기('<html><head><title>ilabor 3.0 - 한국공인노무사회</title></head><body>'
    + 상세글 + '</body></html>');
  assert.ok(!/ilabor/i.test(r.제목), '★ 쪽 제목이 자료 제목으로 들어왔다: ' + r.제목);
});

test('★★ 본문에 차림표·바닥글이 «안» 섞인다', () => {
  /* 2026-09-04 에 실제로 그랬다 — 본문 4,000자가 죄다 메뉴와 바닥글이었다.
     그것을 뉴스레터에 실으면 남의 사이트 메뉴가 거래처에 나간다. */
  const r = P.상세읽기('<html><body>' + 상세글 + '</body></html>');
  ['공인노무사법 지원금 코로나', '이용약관', '사업자등록번호', 'COPYRIGHT']
    .forEach((말) => {
      assert.ok(r.본문.indexOf(말) < 0, '★ 본문에 「' + 말 + '」 이 섞였다');
    });
  assert.ok(r.본문.length < 400, '본문이 아직 길다(' + r.본문.length + '자) — 무엇이 섞였나 보라');
});

test('설명이 제목과 같으면 «비운다» — 두 번 보여 주지 않는다', () => {
  const r = P.상세읽기('<html><body>' + 상세글 + '</body></html>');
  assert.equal(r.설명, '', '같은 글이 제목과 설명에 두 번 들어갔다');
});

test('★ 라벨이 없으면 «되돌아가되 알린다» — 조용히 넘기지 않는다', () => {
  /* 쪽 모양이 바뀌면 라벨을 못 찾는다. 그때 아무 말 없이 <title> 로 돌아가면
     어느 날부터 제목이 「ilabor 3.0」이 되어도 아무도 모른다. */
  const r = P.상세읽기('<html><head><title>ilabor 3.0 - 한국공인노무사회</title></head>'
    + '<body>라벨이 하나도 없는 새 모양 쪽입니다. 글은 이만큼 있습니다.</body></html>');
  assert.equal(r.ok, true, '읽을 것이 있으면 성공이다');
  assert.equal(r.읽은법, '되돌아간길');
  assert.ok(r.알림 && /라벨/.test(r.알림), '★ 모양이 바뀐 것을 알리지 않는다');
});

test('꼬리(이용약관·COPYRIGHT)부터는 «잘라낸다»', () => {
  const 라 = P.라벨로읽기('자료번호 1 제목 가나다 작성일 2026-01-01 '
    + '이전 페이지는 없습니다. 이용약관 개인정보취급방침 COPYRIGHT 어쩌고');
  assert.equal(라['제목'], '가나다');
  assert.ok(!/이용약관|COPYRIGHT/.test(JSON.stringify(라)), '꼬리가 값에 섞였다');
});

test('라벨이 하나 없어도 나머지는 읽는다', () => {
  /* 라벨 이름을 못 박는 것이 아니라 «라벨과 라벨 사이»를 자르므로 이것이 된다 */
  const 라 = P.라벨로읽기('자료번호 77 제목 어떤 자료 작성일 2026-02-03');
  assert.equal(라['자료번호'], '77');
  assert.equal(라['제목'], '어떤 자료');
  assert.equal(라['작성일'], '2026-02-03');
  assert.equal(라['설명'], undefined, '없는 라벨을 만들어내지 않는다');
});

test('첨부 이름을 «여러 개» 읽는다 (첨부파일1·2·3)', () => {
  const 라 = P.라벨로읽기('자료번호 1 제목 가 첨부파일1 하나.pdf 첨부파일2 둘.hwp');
  assert.deepEqual(라.첨부이름, ['하나.pdf', '둘.hwp']);
});

/* ══════════════════════════════════════════════════════════════════════════
   끊긴 줄은 다시 건다 — 실측 2026-09-05
   ══════════════════════════════════════════════════════════════════════════
   「엿보기」는 되는데 「상세+첨부」에서 UND_ERR_SOCKET 으로 막혔다.
   더운 서버가 «이미 끊긴 줄»을 물려받아 나는 탈이라, 다시 걸면 붙는다.
   ⚠ 그렇다고 아무 탈에나 다시 걸면 안 된다 — 비밀번호가 틀렸는데 세 번
     두드리면 계정이 잠긴다. 그 경계를 여기서 못 박는다. */
test('★ 줄이 끊긴 까닭이면 «다시 건다»', () => {
  ['UND_ERR_SOCKET', 'ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'EAI_AGAIN'].forEach((코드) => {
    assert.equal(P.다시걸까(코드, ''), true, 코드 + ' 는 다시 걸어야 한다');
  });
});

test('★ 까닭 코드가 «비어 있어도» 속말로 알아본다', () => {
  /* undici 판에 따라 code 없이 message 만 오는 일이 있다.
     코드가 없다고 못 고치면 이 고침은 뜻이 없다. */
  assert.equal(P.다시걸까('', 'other side closed'), true);
  assert.equal(P.다시걸까('', 'socket hang up'), true);
  assert.equal(P.다시걸까(undefined, 'Premature close'), true, '대소문자를 가리지 않는다');
});

test('★ 줄 문제가 «아니면» 다시 걸지 않는다 — 계정이 잠긴다', () => {
  assert.equal(P.다시걸까('CERT_HAS_EXPIRED', ''), false, '증서 문제는 다시 걸어도 같다');
  assert.equal(P.다시걸까('ENOTFOUND', ''), false, '없는 주소는 다시 걸어도 없다');
  assert.equal(P.다시걸까('', ''), false, '까닭을 모르면 두드리지 않는다');
  assert.equal(P.다시걸까('', '로그인 정보가 존재하지 않습니다'), false,
    '★ 비밀번호가 틀렸는데 다시 걸면 계정이 잠긴다');
});

test('다시 걸기는 «끝이 있다» — 갈수록 쉬고, 한도가 있다', () => {
  assert.ok(P.다시걸기 >= 2, '한 번은 다시 걸어야 뜻이 있다');
  assert.ok(P.다시걸기 <= 5, '끝없이 두드리면 상대가 우리를 막는다');
  assert.ok(P.다시걸기쉼(2) > P.다시걸기쉼(1), '갈수록 길게 쉰다');
  assert.ok(P.다시걸기쉼(1) > 0, '쉬지 않고 바로 걸면 같은 줄을 또 잡는다');
  assert.ok(P.다시걸기쉼(99) <= 3000, '함수가 시간 초과로 죽지 않게 한도가 있다');
});
