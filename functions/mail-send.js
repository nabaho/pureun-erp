/* 자료 메일 보내기 — 순수 로직
   ═══════════════════════════════════════════════════════════════════════════
   보내는 일 자체(SMTP)는 index.js 가 한다. 여기는 **값만** 다룬다 —
   그래야 실제로 메일을 쏘지 않고도 검사할 수 있다.

   ⚠ 이 층이 막아야 하는 것 네 가지
   1. 아무 데나 보내기 — 받는 주소를 검사하고 개수를 막는다. 로그인한 직원만
      부를 수 있지만, 그래도 우리 계정이 공개 발송기가 되면 안 된다.
   2. 너무 큰 첨부 — 메일 서버가 통째로 거절하면 '보냈다'고 나오고 실제로는
      아무 데도 안 간다. 보내기 전에 우리가 먼저 막는다.
   3. 헤더 끼워넣기 — 제목에 줄바꿈이 들어가면 받는사람·참조를 몰래 더할 수 있다.
   4. 빈 껍데기 — 받는 주소나 제목이 없으면 아예 부르지 않는다. */
'use strict';

/* 다음메일 기준. 25MB 라고 적혀 있지만 base64 로 부풀면 더 커지므로 여유를 둔다. */
const MAX_TOTAL_BYTES = 18 * 1024 * 1024;
const MAX_TO = 5;
const MAX_SUBJECT = 200;

/* 주소 하나가 쓸 만한가. 완벽한 검사가 아니라 '눈에 띄는 잘못'을 거른다 —
   진짜 판정은 메일 서버가 한다. */
function isEmail(v) {
  const s = String(v == null ? '' : v).trim();
  return /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]{2,}$/.test(s);
}

/* 쉼표·세미콜론으로 여러 개 올 수 있다. 다듬어 중복을 없애고 개수를 막는다. */
function parseRecipients(v) {
  const raw = Array.isArray(v) ? v : String(v == null ? '' : v).split(/[,;]/);
  const out = [];
  raw.forEach(function (x) {
    const s = String(x == null ? '' : x).trim();
    if (!s || !isEmail(s) || out.indexOf(s) >= 0) return;
    out.push(s);
  });
  return out;
}

/* 제목의 줄바꿈을 없앤다 — 남겨 두면 그 뒤에 Bcc: 한 줄을 붙여
   우리 몰래 다른 곳으로도 보낼 수 있다(헤더 끼워넣기). */
function cleanSubject(v) {
  return String(v == null ? '' : v).replace(/[\r\n]+/g, ' ').trim().slice(0, MAX_SUBJECT);
}

/* base64 dataURL 이 실제로 몇 바이트인가. 문자열 길이로 재면 3분의 1을 더 크게 본다. */
function dataUrlBytes(dataUrl) {
  const s = String(dataUrl == null ? '' : dataUrl);
  const i = s.indexOf(',');
  if (i < 0) return 0;
  const b64 = s.slice(i + 1);
  const pad = (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0);
  return Math.max(0, Math.floor(b64.length * 3 / 4) - pad);
}

/* 자료 하나를 첨부 한 개로. 파일 내용이 없으면 null — 부르는 쪽이 걸러낸다.
   ⚠ 이름이 없으면 '자료.dat' 로 둔다. 이름 없는 첨부는 받는 쪽에서 열리지 않는다. */
function toAttachment(meta, dataUrl) {
  const url = String(dataUrl == null ? '' : dataUrl);
  const i = url.indexOf(',');
  if (i < 0 || !url.slice(i + 1)) return null;
  const m = (meta || {});
  const name = String(m.fileName || m.name || '자료.dat').replace(/[\\/:*?"<>|\r\n]/g, '_');
  return {
    filename: name,
    content: url.slice(i + 1),
    encoding: 'base64',
    bytes: dataUrlBytes(url)
  };
}

/* ══════ 서식 있는 본문 (대표 지시 2026-08-24 「다음메일과 완전하게 같게」) ══════
   그전에는 쓰기 화면에 글꼴·굵게 단추가 있는데 받는 사람에게는 아무 영향이 없었다 —
   본문이 평문이라 서식이 갈 데가 없었다. 이제 서식을 실제로 보낸다.

   ⚠ 남의 손으로 만들어진 HTML 을 그대로 내보내지 않는다. 직원만 쓰는 화면이지만,
     한 번 나간 메일은 되돌릴 수 없고 받는 쪽 메일 프로그램에서 열린다.
     그래서 «허용한 것만 남기고 나머지는 버린다»(allowlist). 새 태그를 쓰려면
     여기 목록에 먼저 올려야 한다 — 목록에 없으면 조용히 사라진다. */

/* 다음메일 도구줄이 내는 태그들.
   ⚠ img 는 «우리 것»만 통과한다(아래 IMG_OK). 아무 그림이나 허용하면
     받는 쪽이 열 때 남의 서버로 신호가 가서 「언제 읽었나」가 새 나간다.

   ★ 표(table)를 2026-09-02 에 «더했다» — 뉴스레터 때문이다(대표 지시 같은 날).
     메일에서 자리를 잡는 길은 표뿐이다. div 로 짠 자리잡기는 아웃룩·다음메일에서
     무너진다. 표가 없으면 뉴스레터가 «줄글 뭉치»로 도착한다.
   ★ 표를 더하는 것은 안전한 쪽이다 — 표는 글을 «담는» 그릇이지 무엇을 «하지»
     않는다. 위험한 것은 script·iframe·on* 손잡이·javascript: 주소인데
     그 넷은 아래에서 그대로 막는다. 엑셀에서 표를 붙여넣던 평소 메일도 함께 살아난다. */
const HTML_OK = ['b','strong','i','em','u','s','strike','br','p','div','span',
                 'ul','ol','li','a','hr','blockquote','font','sub','sup','img',
                 'table','thead','tbody','tfoot','tr','td','th','caption','h1','h2','h3','h4','h5','h6'];

/* 통과시킬 그림 —
   ① cid:pusign — 내 서명 명함 사진(functions/mail-sign.js). 보낼 때 서버가
      이 이름으로 인라인 첨부를 붙여 준다.
   ② 우리 홈페이지에 «우리가 올린» 그림. 뉴스레터 배너·로고 자리다.
      바깥 그림을 계속 막는 까닭(열람 시각이 남의 서버로 새는 것)은 그대로 지킨다 —
      우리 주소는 우리 서버라, 우리가 이미 아는 것 말고는 새 나갈 데가 없다.
   ⚠ 여기에 «남의 도메인»을 더하지 말 것. 한 줄 더하는 순간 열람 추적이 뚫린다. */
const SIGN_IMG_OK = 'cid:pusign';
const IMG_HOST_OK = ['https://nabaho.github.io/pureunall/'];
function imgSrcOk(v) {
  const s = String(v == null ? '' : v).trim();
  if (s.toLowerCase() === SIGN_IMG_OK) return SIGN_IMG_OK;
  for (const p of IMG_HOST_OK) { if (s.slice(0, p.length).toLowerCase() === p) return s; }
  return '';
}

/* 메일에서 안전한 꾸밈만. position·z-index 처럼 «자리를 잡는» 것은 받는 화면을
   덮어쓸 수 있어 뺀다.
   ★ 2026-09-02 에 padding·border·width·height·letter-spacing 을 더했다 —
     표로 짠 뉴스레터가 여백과 테두리 없이는 만들어지지 않는다.
     이 다섯은 «자기 칸 안»에서만 힘을 쓴다. 받는 화면을 덮는 것들과 다르다. */
const STYLE_OK = ['color','background-color','background','font-family','font-size',
                  'font-weight','font-style','text-decoration','text-align',
                  'line-height','margin','margin-left','padding-left','text-indent',
                  'padding','padding-top','padding-right','padding-bottom',
                  'border','border-top','border-bottom','border-left','border-right',
                  'border-radius','border-collapse','border-spacing',
                  'width','max-width','height','min-height','vertical-align',
                  'letter-spacing','display'];

/* 태그마다 남길 속성. 여기 없는 속성은 다 버린다(on* 손잡이가 여기서 걸러진다). */
const TABLE_ATTR = ['style','width','height','align','valign','bgcolor',
                    'cellpadding','cellspacing','border','colspan','rowspan','role'];
const ATTR_OK = {
  a:    ['href','style'],
  font: ['color','face','size','style'],
  p:    ['style','align'], div: ['style','align'], span: ['style'],
  ul:   ['style'], ol: ['style'], li: ['style'], blockquote: ['style'],
  b:['style'], strong:['style'], i:['style'], em:['style'],
  u:['style'], s:['style'], strike:['style'], sub:['style'], sup:['style'],
  h1:['style'], h2:['style'], h3:['style'], h4:['style'], h5:['style'], h6:['style'],
  hr:[], br:[],
  table: TABLE_ATTR, thead: TABLE_ATTR, tbody: TABLE_ATTR, tfoot: TABLE_ATTR,
  tr: TABLE_ATTR, td: TABLE_ATTR, th: TABLE_ATTR, caption: ['style','align'],
  /* 그림 — 주소와 «자리 크기»만. 크기를 안 받으면 배너가 원본 크기로 튀어나와
     편지 폭을 넘는다. alt 는 그림이 안 뜰 때 대신 나오는 글자라 받는다. */
  img: ['src','width','height','alt','style']
};

/* style 한 줄에서 허용한 속성만 남긴다. url( 이 있으면 그 style 을 통째로 버린다 —
   바깥 그림을 불러오면 「언제 읽었나」가 남의 서버에 새 나간다. */
function cleanStyle(v) {
  const s = String(v == null ? '' : v);
  if (/url\s*\(|expression\s*\(|[<>]/i.test(s)) return '';
  const out = [];
  s.split(';').forEach(function (part) {
    const i = part.indexOf(':');
    if (i < 0) return;
    const k = part.slice(0, i).trim().toLowerCase();
    const val = part.slice(i + 1).trim();
    if (!val || STYLE_OK.indexOf(k) < 0) return;
    out.push(k + ':' + val);
  });
  return out.join(';');
}

/* 누를 수 있는 주소인가 — http·https·mailto 만. javascript: 는 받는 쪽에서 돈다. */
function cleanHref(v) {
  const s = String(v == null ? '' : v).trim().replace(/[ -\s]/g, '');
  return /^(https?:\/\/|mailto:)/i.test(s) ? s.replace(/"/g, '&quot;') : '';
}

/* 허용한 서식만 남긴다. 모르는 태그는 «글자는 살리고 태그만» 버린다 —
   태그와 함께 글자까지 버리면 편지 내용이 사라진다. */
function sanitizeHtml(v) {
  let s = String(v == null ? '' : v);
  if (!s) return '';
  /* script·style 은 안의 글자까지 지운다. 태그만 지우면 코드가 글자로 남는다. */
  s = s.replace(/<\s*(script|style|iframe|object|embed|template)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, '');
  s = s.replace(/<\s*(script|style|iframe|object|embed|template)\b[^>]*>/gi, '');
  s = s.replace(/<!--[\s\S]*?-->/g, '');

  return s.replace(/<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g,
    function (whole, slash, rawName, rawAttrs) {
      const name = rawName.toLowerCase();
      if (HTML_OK.indexOf(name) < 0) return '';        // 태그만 버리고 글자는 남긴다
      if (slash) return '</' + name + '>';
      /* 그림은 «우리 것»만. 그 밖의 img 는 통째로 버린다 —
         속성만 걸러 빈 <img> 를 남기면 받는 화면에 깨진 그림 자리가 뜬다. */
      if (name === 'img') {
        const src = /src\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/i.exec(rawAttrs);
        const val = src ? (src[2] !== undefined ? src[2] : (src[3] !== undefined ? src[3] : src[4])) : '';
        const okSrc = imgSrcOk(val);
        if (!okSrc) return '';
        /* 서명 그림은 예전 그대로 — src 하나만 남긴다. 받을 이유가 없는 속성이고,
           받는 속성이 늘어날수록 빠져나갈 틈이 생긴다. */
        if (okSrc === SIGN_IMG_OK) return '<img src="' + SIGN_IMG_OK + '">';
        /* 우리 홈페이지 그림(뉴스레터 배너·로고)은 «자리 크기»까지 남긴다 —
           크기를 버리면 배너가 원본 크기로 튀어나와 편지 폭을 넘는다.
           src 는 여기서 확인한 값으로 «다시 적는다» — 아래 걸개를 거치지 않게. */
        const keepImg = ['src="' + okSrc.replace(/"/g, '&quot;') + '"'];
        const reI = /([a-zA-Z-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
        let mi;
        while ((mi = reI.exec(rawAttrs))) {
          const ki = mi[1].toLowerCase();
          if (ki === 'src') continue;
          if (['width', 'height', 'alt', 'style'].indexOf(ki) < 0) continue;
          const vi = mi[3] !== undefined ? mi[3] : (mi[4] !== undefined ? mi[4] : mi[5]);
          if (ki === 'style') { const cs = cleanStyle(vi); if (cs) keepImg.push('style="' + cs + '"'); continue; }
          if (/[<>"]/.test(vi)) continue;
          keepImg.push(ki + '="' + vi + '"');
        }
        return '<img ' + keepImg.join(' ') + '>';
      }
      const allow = ATTR_OK[name] || [];
      const keep = [];
      /* 속성 하나하나를 이름으로 확인한다 — 목록에 없으면 버린다(on* 이 여기서 걸린다) */
      const re = /([a-zA-Z-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
      let m;
      while ((m = re.exec(rawAttrs))) {
        const k = m[1].toLowerCase();
        const val = m[3] !== undefined ? m[3] : (m[4] !== undefined ? m[4] : m[5]);
        if (allow.indexOf(k) < 0) continue;
        if (k === 'style') { const cs = cleanStyle(val); if (cs) keep.push('style="' + cs + '"'); continue; }
        if (k === 'href')  { const hf = cleanHref(val);  if (hf) keep.push('href="' + hf + '"');  continue; }
        if (/[<>"]/.test(val)) continue;
        keep.push(k + '="' + val + '"');
      }
      return '<' + name + (keep.length ? ' ' + keep.join(' ') : '') + '>';
    });
}

/* 서식 있는 본문에서 평문 몫을 뽑는다. 서식을 못 읽는 메일 프로그램이 아직 있어
   두 몫을 «같이» 보내는데, 평문을 따로 쓰면 두 몫이 다른 말을 하게 된다. */
function htmlToText(v) {
  /* ⚠ pu-cards.html 의 htmlToTextC 와 «한 글자도 다르지 않게» 유지한다.
     tests/cards-mail-editor.test.js 가 두 쪽이 같은 답을 내는지 확인한다. */
  let s = String(v == null ? '' : v);
  if (!s) return '';
  s = s.replace(/<\s*(script|style)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, '');
  s = s.replace(/<\s*br\s*\/?\s*>/gi, '\n');
  s = s.replace(/<\s*\/\s*(p|div|li|blockquote|tr|h[1-6])\s*>/gi, '\n');
  s = s.replace(/<\s*hr\s*\/?\s*>/gi, '\n');
  s = s.replace(/<[^>]*>/g, '');
  s = s.replace(/&nbsp;/gi, ' ').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
       .replace(/&quot;/gi, '"').replace(/&#0*39;|&apos;/gi, "'").replace(/&amp;/gi, '&');
  /* 편집기는 빈 문단을 잔뜩 남긴다 — 셋 이상은 둘로 줄인다 */
  return s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/* 첨부가 너무 클 때 하는 말 — «한 곳»에만 적는다.
   ⚠ 재는 자리가 둘이다: 여기(붙인 뒤 합계)와 mail-deliver(내려받기 «전»에 미리).
     문구를 두 벌로 두면 같은 일에 다른 말이 나와 무엇이 문제인지 흐려진다. */
function sizeError(total) {
  return '첨부가 너무 큽니다 (' + (Number(total || 0) / 1024 / 1024).toFixed(1) + 'MB). '
       + (MAX_TOTAL_BYTES / 1024 / 1024) + 'MB 아래로 줄여 주세요.';
}

/* 보내도 되는 요청인가. 되면 {ok:true, ...정리된 값}, 아니면 {ok:false, error}.
   ⚠ 첨부 크기는 **합계**로 본다. 한 개씩만 보면 8MB 세 개가 통과한다.
   ⚠★ 여기는 «붙어 있는 첨부의 bytes»만 셀 수 있다. bytes 를 안 달고 넘기면
      합계가 0 으로 보여 **한도가 통째로 없는 것과 같다**(2026-09-03 실측: 창고를
      거쳐 온 30MB 두 개가 그대로 통과했다). 첨부를 만드는 쪽이 bytes 를 «반드시»
      단다 — tests/mail-send-size.test.js 가 그것까지 지킨다. */
function validateSend(o) {
  const p = o || {};
  const to = parseRecipients(p.to);
  if (!to.length) return { ok: false, error: '받는 사람 주소가 없거나 형식이 맞지 않습니다.' };
  if (to.length > MAX_TO) return { ok: false, error: '받는 사람은 한 번에 ' + MAX_TO + '명까지입니다.' };

  const cc = parseRecipients(p.cc).filter(function (a) { return to.indexOf(a) < 0; });
  if (cc.length > MAX_TO) return { ok: false, error: '참조는 한 번에 ' + MAX_TO + '명까지입니다.' };

  /* 숨은참조 — 받는사람·참조에 이미 있으면 뺀다. 그대로 두면 같은 사람에게 두 통 간다. */
  const bcc = parseRecipients(p.bcc).filter(function (a) {
    return to.indexOf(a) < 0 && cc.indexOf(a) < 0;
  });
  if (bcc.length > MAX_TO) return { ok: false, error: '숨은참조는 한 번에 ' + MAX_TO + '명까지입니다.' };

  const subject = cleanSubject(p.subject);
  if (!subject) return { ok: false, error: '제목이 비어 있습니다.' };

  /* 서식 있는 본문 — 오면 씻어서 쓰고, 안 오면 예전과 «똑같이» 평문만 보낸다.
     여기서 멋대로 html 을 만들면, 평문으로 걸어 둔 옛 예약 메일의 모양이 바뀐다. */
  const html = sanitizeHtml(p.html);
  /* 평문 몫 — 화면이 준 것이 있으면 그것을, 없으면 서식에서 뽑아낸다 */
  const given = String(p.body == null ? '' : p.body);
  const body = given.trim() ? given : htmlToText(html);
  /* ⚠ 빈 껍데기는 «글자»로 판단한다. <p><br></p> 는 태그가 있어도 빈 편지다. */
  if (!body.trim()) return { ok: false, error: '본문이 비어 있습니다.' };

  const files = (p.attachments || []).filter(Boolean);
  let total = 0;
  files.forEach(function (f) { total += (f.bytes || 0); });
  if (total > MAX_TOTAL_BYTES) return { ok: false, error: sizeError(total) };
  return { ok: true, to: to, cc: cc, bcc: bcc, subject: subject,
    body: body, html: html, attachments: files, bytes: total };
}

/* 보낸 기록 — 화면이 아니라 **서버가** 남긴다. 실제로 나간 것만 남아야
   '보냈다는데 안 왔다'를 가릴 수 있다. 기업정보함 화면이 쓰는 모양과 같아야 한다. */
function sentLogRec(o) {
  const p = o || {};
  return {
    at: p.at || 0,
    by: String(p.by || ''),
    to: (p.to || []).join(', '),
    names: (p.names || []).map(function (v) { return String(v || ''); }).filter(Boolean),
    set: String(p.set || ''),
    auto: true                 /* 자동 발송으로 나갔다는 표시 — 손으로 보낸 것과 구분 */
  };
}

module.exports = {
  MAX_TOTAL_BYTES, MAX_TO, MAX_SUBJECT,
  isEmail, parseRecipients, cleanSubject, dataUrlBytes,
  toAttachment, validateSend, sentLogRec, sizeError,
  sanitizeHtml, htmlToText, cleanStyle, cleanHref,
  HTML_OK, STYLE_OK, SIGN_IMG_OK
};
