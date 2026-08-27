/* ══════ 짝 파수꾼 — 「한쪽만 고쳐진 것」을 잡는다 (2026-08-27) ══════

   대표 물음: 「이런 돌연변이는 앞으로 안 생기게 할 수 없나」

   2026-08-26~27 하루에 여섯 가지 고장을 찾았는데, **여섯이 다 같은 모양**이었다 —
   짝이 맞아야 하는 두 곳 가운데 **한쪽만 고쳐졌다.**

     ① 저장 층은 「서버에 열쇠를 내밀라」로 바뀌었는데 부르는 앱 셋이 안 따라옴
        → 계약서·근태기록부 31장이 세 앱에서 한 장도 안 열림
     ② 저장 층에 「증빙으로 썼다」 칸이 생겼는데 쓰는 앱도 화면도 안 따라옴
        → 표시가 찍힌 사진 0장, 계약 증빙이 1년 시계
     ③ 기업정보함은 원본을 창고로 옮겼는데 사진첩 경유 길만 옛 방식
        → 실시간DB 에 284MB
     ④ 판독기가 값을 두 자리에 담는데 한쪽만 채움
        → 화면에는 보이는 번호가 프로그램에는 없음
     ⑤ 주소 표시를 카메라·공유는 지우는데 사진만 안 지움
        → 들어갈 때마다 같은 사진이 다시 열림
     ⑥ 클라이언트가 「글자만」 보내게 됐는데 서버는 그림을 요구
        → 글자 있는 PDF 판독이 만들어진 뒤 한 번도 성공 못 함

   사람이 조심해서 막을 수 있는 것이 아니다 — **짝을 기계가 지키게 한다.**
   아래 셋은 각각 위의 ⑥·⑤·① 을 «고치기 전 코드에서 실제로 울리는지» 확인하고 넣었다.

   ⚠ 새 앱·새 길이 늘면 여기가 **저절로** 따라간다(목록을 손으로 안 적는다).
     그것이 이 파일의 핵심이다 — 손으로 적는 목록은 다음에 또 빠뜨린다. */

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');
const htmlFiles = fs.readdirSync(R).filter(function (f) { return /\.html$/.test(f); });
const readHtml = function (f) { return fs.readFileSync(path.join(R, f), 'utf8'); };

/* ══════ ① 앞뒤 맞대보기 — 클라이언트가 «실제로 만드는» 요청을 서버에 먹여 본다 ══════
   ⑥ 이 여기서 걸린다. 판독기가 보내는 몸통을 가로채 서버 validate 에 그대로 넣는다.
   둘 중 한쪽 모양이 바뀌면 그날로 운다 — 배포 뒤 실사용에서가 아니라. */

function readerWithSpy() {
  const sent = [];
  const ctx = {
    console, Promise, Object, Array, JSON, String, Number, Math, Date, RegExp, Error,
    isFinite, parseInt, parseFloat, setTimeout, clearTimeout,
    fetch: function (url, init) {
      sent.push(JSON.parse(init.body));
      /* AI 가 제대로 답한 척한다 — 우리가 볼 것은 «보낸 몸통»이다 */
      return Promise.resolve({ ok: true, status: 200,
        json: function () { return Promise.resolve({ ok: true, reply: {
          candidates: [{ content: { parts: [{ text: '{"kind":"bizreg","company":"가나"}' }] } }] } }); } });
    }
  };
  ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(R, 'js', 'pu-doc-read.js'), 'utf8'), ctx);
  ctx.PuDocRead.init({
    fetch: ctx.fetch,
    getToken: function () { return Promise.resolve('tok'); },
    readDocUrl: 'https://example/readDoc'
  });
  return { D: ctx.PuDocRead, sent: sent };
}

const server = require(path.join(R, 'functions', 'doc-read.js'));

test('★ 판독기가 «그림으로» 보내는 요청을 서버가 받는다', async () => {
  const r = readerWithSpy();
  await r.D.read('data:image/jpeg;base64,QUJD');
  assert.equal(r.sent.length, 1, '판독기가 서버를 안 불렀습니다');
  const v = server.validate(r.sent[0]);
  assert.equal(v.ok, true,
    '★ 판독기가 보내는 것을 서버가 돌려보냅니다 — 판독이 통째로 막힙니다: ' + v.error);
});

test('★ 판독기가 «글자만» 보내는 요청도 서버가 받는다 — 글자 있는 PDF 의 길이다', async () => {
  /* ⚠ 이 검사가 없어서 2026-08-24~27 사흘 동안 그 길이 한 번도 안 됐다.
     클라이언트만 고치고 서버를 안 고쳤는데 **아무도 몰랐다** — 사람이 그 PDF 를
     올려 볼 때까지. 여기서 걸렸으면 그날 알았다. */
  const r = readerWithSpy();
  await r.D.readDocText('사업자등록증명\n상호 주식회사 대원유지\n사업자등록번호 312-86-35425');
  assert.equal(r.sent.length, 1, '글자 판독이 서버를 안 불렀습니다');
  const body = r.sent[0];
  assert.ok(!body.parts.some(function (p) { return p.inline_data; }),
    '글자 길인데 그림이 실렸습니다 — 이 검사의 전제가 깨졌습니다');
  const v = server.validate(body);
  assert.equal(v.ok, true,
    '★ 글자만 보내면 서버가 돌려보냅니다 — 글자 있는 PDF 가 통째로 안 읽힙니다: ' + v.error);
});

test('★ 여러 쪽을 한 번에 보내는 요청도 서버가 받는다', async () => {
  const r = readerWithSpy();
  await r.D.read(['data:image/jpeg;base64,QUJD', 'data:image/jpeg;base64,REVG']);
  const v = server.validate(r.sent[0]);
  assert.equal(v.ok, true, '★ 여러 쪽 계약서를 서버가 돌려보냅니다: ' + v.error);
});

test('서버는 여전히 «빈 요청»을 막는다 — 부르는 만큼이 요금이다', () => {
  /* 위 셋을 통과시키려고 문을 통째로 열어 두면 안 된다 */
  assert.equal(server.validate({ parts: [] }).ok, false);
  assert.equal(server.validate({ parts: [{ text: '  ' }] }).ok, false);
  assert.equal(server.validate(null).ok, false);
});

/* ══════ ② 주소에 넣은 표시는 반드시 지운다 ══════
   ⑤ 가 여기서 걸린다. 주소에서 읽는 이름을 «자동으로» 모아, 지우는 짝이 있는지 본다.
   안 지우면 그 주소가 한 번 굳는 순간(새로고침·즐겨찾기·시작화면 지정) 되풀이된다. */

/* 지우지 «않아야» 하는 것 — 까닭을 반드시 적는다. 적을 까닭이 없으면 지워야 하는 것이다. */
const KEEP_IN_URL = {
  v: '판 번호 — 지우면 브라우저가 옛 파일을 계속 쓴다(캐시가 안 깨진다)',
  portalcam: '끝나면 enter.html 로 나간다 — 이 화면에 머무르지 않으므로 되풀이될 자리가 없다'
};

test('★ 주소에서 읽는 표시는 모두 «지우는 짝»이 있다', () => {
  const src = readHtml('pu-photos.html');
  const got = {};
  const re = /(?:searchParams|\bq|\bu)\s*\.get\(\s*'([a-zA-Z][\w-]*)'\s*\)/g;
  let m;
  while ((m = re.exec(src))) got[m[1]] = true;
  assert.ok(Object.keys(got).length >= 5,
    '주소에서 읽는 표시를 ' + Object.keys(got).length + '개만 찾았습니다 — 찾는 규칙이 어긋났습니다');

  const missing = Object.keys(got).filter(function (k) {
    if (KEEP_IN_URL[k]) return false;
    return !new RegExp("delete\\(\\s*'" + k + "'\\s*\\)|'" + k + "'[^\\n]{0,80}forEach[^\\n]{0,60}delete")
      .test(src) && !new RegExp("\\[[^\\]]*'" + k + "'[^\\]]*\\]\\.forEach\\(function \\(k\\) \\{[^}]*delete\\(k\\)").test(src);
  });
  assert.deepEqual(missing, [],
    '★ 주소에 남는 표시가 있습니다 — 그 주소가 한 번 굳으면 들어올 때마다 같은 일이 되풀이됩니다.\n' +
    '  지우거나, 안 지울 까닭을 KEEP_IN_URL 에 적어 주세요: ' + missing.join(', '));
});

test('지우지 않기로 한 것에는 «까닭»이 적혀 있다', () => {
  /* 예외 목록이 「그냥 넣어 둔 것」이 되면 이 파수꾼은 곧 무력해진다 */
  Object.keys(KEEP_IN_URL).forEach(function (k) {
    assert.ok(String(KEEP_IN_URL[k]).length >= 15, k + ' 에 까닭이 없습니다');
  });
});

/* ══════ ③ 공용 저장 층을 세우는 곳은 모두 같은 필수 항목을 넘긴다 ══════
   ① 이 여기서 걸린다. **화면 목록을 손으로 안 적는다** — 저장 층을 싣는 html 을
   저절로 찾는다. 새 앱이 사진첩 저장 층을 쓰기 시작해도 그날로 여기 들어온다. */

/* 넘기지 않으면 «조용히» 못 쓰게 되는 것들. 오류가 안 나서 더 무섭다. */
const MUST_PASS = {
  auth: '서버(photoView)에 내밀 열쇠 — 없으면 계약서·근태기록부가 오류도 없이 빈손이 된다',
  db: '실시간DB — 없으면 아무것도 못 읽는다'
};

function topKeys(lit) {
  const keys = [];
  let depth = 0;
  for (let i = 0; i < lit.length; i++) {
    const c = lit[i];
    if (c === '{' || c === '[' || c === '(') { depth++; continue; }
    if (c === '}' || c === ']' || c === ')') { depth--; continue; }
    if (c === "'" || c === '"') { const qc = c; i++; while (i < lit.length && lit[i] !== qc) { if (lit[i] === '\\') i++; i++; } continue; }
    if (depth !== 1) continue;
    const m = /^([A-Za-z_$][\w$]*)\s*:/.exec(lit.slice(i));
    if (m && /[{,\s]/.test(lit[i - 1] || '{')) { keys.push(m[1]); i += m[0].length - 1; }
  }
  return keys;
}

function initCallsIn(src) {
  const out = [];
  const re = /PuPhotoStore\.init\(\s*\{/g;
  let m;
  while ((m = re.exec(src))) {
    let i = m.index + m[0].length - 1, depth = 0, end = -1;
    for (; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') { depth--; if (!depth) { end = i; break; } }
    }
    if (end < 0) continue;
    const lit = src.slice(m.index + m[0].length - 1, end + 1);
    out.push({ keys: topKeys(lit), raw: lit.replace(/\s+/g, ' ').slice(0, 90) });
  }
  return out;
}

test('★ 사진첩 저장 층을 쓰는 «모든» 화면이 필수 항목을 넘긴다', () => {
  /* 손으로 적은 목록이 아니라 — 저장 층을 싣는 화면을 저절로 찾는다. */
  const users = htmlFiles.filter(function (f) {
    return /src="js\/pu-photo-store\.js/.test(readHtml(f));
  });
  assert.ok(users.length >= 4,
    '저장 층을 쓰는 화면을 ' + users.length + '개만 찾았습니다 — 찾는 규칙이 어긋났습니다');

  const bad = [];
  users.forEach(function (f) {
    const calls = initCallsIn(readHtml(f));
    if (!calls.length) { bad.push(f + ' — 저장 층을 싣기만 하고 세우지 않습니다'); return; }
    calls.forEach(function (c, i) {
      Object.keys(MUST_PASS).forEach(function (need) {
        if (c.keys.indexOf(need) < 0) {
          bad.push(f + ' (' + (i + 1) + '번째) — ' + need + ' 없음: ' + c.raw);
        }
      });
    });
  });
  assert.deepEqual(bad, [],
    '★ 저장 층을 세우면서 필수 항목을 빠뜨린 곳이 있습니다.\n' +
    Object.keys(MUST_PASS).map(function (k) { return '  ' + k + ' : ' + MUST_PASS[k]; }).join('\n') +
    '\n\n' + bad.join('\n'));
});

test('★ 저장 층을 세우는 자리가 화면마다 «한 곳»이다 — 여럿이면 다음에 또 빠뜨린다', () => {
  /* 정부사업일정은 네 곳에서 제각각 세우다 그 가운데 셋이 열쇠를 빠뜨렸다.
     한 곳으로 모으면 빠뜨릴 자리가 없어진다. */
  const many = [];
  htmlFiles.forEach(function (f) {
    const n = initCallsIn(readHtml(f)).length;
    if (n > 1) many.push(f + ' — ' + n + '곳');
  });
  assert.deepEqual(many, [],
    '★ 한 화면에서 저장 층을 여러 곳에서 세웁니다 — 함수 하나로 모아 주세요:\n' + many.join('\n'));
});

test('필수 항목 목록에는 «왜 필요한지»가 적혀 있다', () => {
  Object.keys(MUST_PASS).forEach(function (k) {
    assert.ok(String(MUST_PASS[k]).length >= 15, k + ' 에 까닭이 없습니다');
  });
});
