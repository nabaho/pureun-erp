/* 홈페이지 굳히기 — 지금 홈페이지 열두 쪽을 «그대로» 정적 파일로 떠 온다.
   ═══════════════════════════════════════════════════════════════════════════
   대표 결정 2026-08-31: 홈페이지를 새로 만들고 도메인을 옮긴다(디자인 이전 권리 확인됨).

   ■ 왜 «다시 그리지» 않는가
     디자인을 새로 그리면 「미묘하게 다른」 화면이 나온다. 대표가 매일 보는 화면이라
     그 미묘한 차이가 곧 불만이 된다. 그래서 지금 화면을 통째로 떠 와 틀로 쓰고,
     바뀌는 부분(구성원·자문사·공지)만 나중에 우리 자료로 그린다.

   ■ 주소를 그대로 지킨다
     쪽마다 <mid>/index.html 로 담는다 — 도메인을 옮겨도 /people · /work1 이 그대로 산다.
     검색(네이버·구글) 색인이 주소를 따라가므로, 주소가 바뀌면 노출이 끊긴다.

   ■ 링크는 «상대 주소»로 바꾼다
     /people → ../people/ 처럼. 그래야 임시 주소(…/pureunall/site/)에서도,
     나중에 도메인 뿌리에서도 «같은 파일»이 그대로 돈다.

   실행: node scripts/freeze-homepage.js [--out site]
   다시 돌려도 안전하다(같은 자리에 덮어쓴다). */
'use strict';
const https = require('https');
const fs = require('fs');
const path = require('path');

const ORIGIN = 'https://xn--o80bs5mdnbm0bf80anms.kr';
/* 사람이 읽는 도메인도 본문에 그대로 박혀 있다(한글 도메인) — 둘 다 갈아 끼운다 */
const ORIGIN_HANGUL = 'https://푸른노무법인.kr';

const PAGES = [
  { mid: '', 이름: '메인' },
  { mid: 'greeting', 이름: '인사말' },
  { mid: 'people', 이름: '구성원 소개' },
  { mid: 'partner', 이름: '자문사현황' },
  { mid: 'work1', 이름: '주요업무1' },
  { mid: 'work2', 이름: '주요업무2' },
  { mid: 'work3', 이름: '주요업무3' },
  { mid: 'work4', 이름: '주요업무4' },
  { mid: 'work5a', 이름: '주요업무5a' },
  { mid: 'work5b', 이름: '주요업무5b' },
  { mid: 'inquiry', 이름: '오시는길' },
  { mid: 'notice', 이름: '공지사항' }
];

const OUT = (() => {
  const i = process.argv.indexOf('--out');
  return path.resolve(i > 0 ? process.argv[i + 1] : 'site');
})();

/* ★ 사람에게 보이는 «진짜 주소». 검색엔진에게 「원본은 여기」라고 말하는 데 쓴다.
   대표 지시 2026-08-31: 「홈페이지가 외부로 나갈 경우 원래 있던 도메인으로 나가야 한다.
   나바호 깃허브로 나가면 안 된다」 */
const REAL_ORIGIN = 'https://푸른노무법인.kr';

/* --live : 도메인을 옮긴 «실제 운영»용으로 굳힌다(검색 차단을 빼고).
   붙이지 않으면 미리보기용 — 검색에 잡히지 않게 막는다. */
const LIVE = process.argv.indexOf('--live') > 0;

/* ── 내려받기 (한 번에 넷까지, 예의 있게) ── */
function fetchBin(url) {
  return new Promise(resolve => {
    const req = https.get(url, { timeout: 30000 }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(fetchBin(new URL(res.headers.location, url).href));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ code: res.statusCode, buf: Buffer.concat(chunks),
                                    type: res.headers['content-type'] || '' }));
    });
    req.on('error', () => resolve({ code: 0, buf: Buffer.alloc(0), type: '' }));
    req.on('timeout', () => { req.destroy(); resolve({ code: 0, buf: Buffer.alloc(0), type: '' }); });
  });
}

async function 줄서서(목록, 한번에, 일) {
  const 남은 = 목록.slice();
  const 결과 = [];
  await Promise.all(Array.from({ length: 한번에 }, async () => {
    while (남은.length) {
      const it = 남은.shift();
      결과.push(await 일(it));
    }
  }));
  return 결과;
}

/* ── 자산 주소 모으기 ── */
const ASSET_RE = /(?:src|href)="([^"]+)"|url\((['"]?)([^'")]+)\2\)|srcset="([^"]+)"/gi;

function 자산주소들(글, 기준) {
  const out = new Set();
  let m;
  ASSET_RE.lastIndex = 0;
  while ((m = ASSET_RE.exec(글))) {
    const 후보 = [m[1], m[3]].filter(Boolean);
    if (m[4]) m[4].split(',').forEach(s => 후보.push(s.trim().split(/\s+/)[0]));
    후보.forEach(u => {
      if (!u || u.startsWith('data:') || u.startsWith('#') || u.startsWith('mailto:')
          || u.startsWith('tel:') || u.startsWith('javascript:')) return;
      let abs;
      try { abs = new URL(u, 기준).href; } catch (e) { return; }
      /* 우리 도메인 것만 떠 온다 — 남의 서버(카카오 지도 등)는 그대로 부른다 */
      if (abs.indexOf(ORIGIN) !== 0 && abs.indexOf(ORIGIN_HANGUL) !== 0) return;
      if (/[?&]act=|[?&]mid=/.test(abs)) return;          // 쪽 주소는 자산이 아니다
      out.add(abs.split('#')[0]);
    });
  }
  return [...out];
}

/* 자산이 담길 파일 자리. «파일이 아닌 것»은 null 을 돌려 건너뛴다 —
   뿌리 주소(/)나 쪽 주소가 자산으로 섞여 들어오면 폴더에 덮어쓰려다 통째로 멎는다. */
function 자산경로(abs) {
  let p = abs.replace(ORIGIN, '').replace(ORIGIN_HANGUL, '');
  p = decodeURIComponent(p.split('?')[0].split('#')[0]);
  if (p.startsWith('/')) p = p.slice(1);
  if (!p || p.endsWith('/')) return null;
  const 끝 = p.split('/').pop();
  if (끝.indexOf('.') < 0) return null;        // 확장자가 없으면 쪽 주소다
  return p;
}

function 담기(파일, buf) {
  const 자리 = path.join(OUT, 파일);
  fs.mkdirSync(path.dirname(자리), { recursive: true });
  fs.writeFileSync(자리, buf);
}

/* ── 쪽 글자 고치기 ── */
function 쪽고치기(html, mid) {
  /* 쪽은 <mid>/index.html 에 담긴다. 게시판 글은 <mid>/<번호>/index.html 이라 한 겹 더 깊다 */
  const 깊이 = mid ? '../'.repeat(mid.split('/').length) : '';
  let s = html;

  /* ① 우리 도메인 절대주소 → 뿌리 상대주소 */
  s = s.split(ORIGIN_HANGUL).join('').split(ORIGIN).join('');

  /* ② 쪽으로 가는 길: /people → ../people/ (메인에서는 people/) */
  PAGES.forEach(p => {
    if (!p.mid) return;
    const re = new RegExp('(href=")\\/' + p.mid + '(\\/?)(")', 'g');
    s = s.replace(re, '$1' + 깊이 + p.mid + '/$3');
  });
  /* 게시판 글로 가는 길: /notice/139 → ../notice/139/ (뒤 빗금이 있어야 폴더로 바로 간다) */
  s = s.replace(/(href=")\/(notice)\/(\d+)(\/?)(")/g, '$1' + 깊이 + '$2/$3/$5');
  s = s.replace(/(href=")(\.\.\/)+(notice)\/(\d+)(")/g, '$1' + 깊이 + '$3/$4/$5');

  /* ★ 게시판 글로 가는 «가짜 주소»는 제자리걸음(#)으로 바꾼다.
     자문사 로고·구성원 사진의 href 는 /partner_board/185 같은 주소인데,
     지금 홈페이지에서도 그 주소는 «열리지 않는다»(403). 실제로는 자바스크립트가
     창을 띄우고 주소는 안 쓴다. 그대로 두면 우리 쪽에서는 «없는 쪽»으로 튄다.
     data-srl 은 건드리지 않으므로 창은 그대로 열린다. */
  s = s.replace(/(<a[^>]*\shref=")[^"]*\/[a-z_]+_board\/\d+(")/gi, '$1#$2');

  /* ★ RSS·Atom 구독 주소는 «뺀다».
     라이믹스가 만들어 주던 것이라 굳힌 사본에는 만들 것이 없다. 그대로 두면
     눌렀을 때 없는 쪽이 뜬다 — 있는 척하는 것보다 없는 편이 낫다.
     (공지사항은 다음 단계에서 우리 자료로 다시 그린다.) */
  s = s.replace(/<link[^>]+href="[^"]*\/(?:rss|atom)"[^>]*>/gi, '');
  s = s.replace(/<a[^>]+href="[^"]*\/(?:rss|atom)"[^>]*>[\s\S]*?<\/a>/gi, '');

  /* 메인으로 가는 길 */
  s = s.replace(/(href=")\/(")/g, '$1' + (깊이 || './') + '$2');

  /* ③ 자산: /assets/… → ../assets/… */
  s = s.replace(/((?:src|href)=")\/(?!\/)/g, '$1' + 깊이);
  s = s.replace(/(url\((['"]?))\/(?!\/)/g, '$1' + 깊이);

  /* ④ ★ 「이 쪽의 진짜 주소」는 언제나 «우리 도메인»이다.
        위 ③에서 절대주소를 상대주소로 바꾸다 보면 canonical·og:url 까지 상대주소가 되는데,
        그러면 임시 주소가 «자기가 원본»이라고 검색엔진에 말하게 된다 —
        진짜 홈페이지와 검색에서 서로 잡아먹고, 검색 결과에 깃허브 주소가 뜬다.
        도메인을 옮긴 뒤에는 이 주소가 곧 제 주소라 그대로 맞다. */
  const 진짜주소 = REAL_ORIGIN + '/' + mid;
  s = s.replace(/<link[^>]+rel=["']canonical["'][^>]*>/gi,
    '<link rel="canonical" href="' + 진짜주소 + '" />');
  s = s.replace(/(<meta[^>]+property=["']og:url["'][^>]*content=")[^"]*(")/gi,
    '$1' + 진짜주소 + '$2');

  /* ⑤ 미리보기 동안에는 «검색에 잡히지 않게» 한다.
        임시 주소가 색인되면 진짜 홈페이지의 노출을 갉아먹는다.
        도메인을 옮길 때 --live 로 굳히면 이 줄이 빠진다. */
  if (!LIVE) {
    s = s.replace(/<head([^>]*)>/i,
      '<head$1>\n<meta name="robots" content="noindex, nofollow" />'
      + '   <!-- 미리보기 동안만: 검색에 안 잡히게. --live 로 굳히면 빠진다 -->');
  }

  /* ⑥ 굳힌 사본임을 남긴다 — 나중에 이 파일을 여는 사람이 헷갈리지 않게 */
  const 표시 = '\n<!-- 푸른노무법인 홈페이지 — ' + new Date().toISOString().slice(0, 10)
    + ' 굳힌 사본 (' + (LIVE ? '실제 운영용' : '미리보기용 · 검색 차단') + ').\n'
    + '     scripts/freeze-homepage.js 로 다시 만든다. 손으로 고치지 말 것: 다시 굳히면 사라진다. -->\n';
  s = s.replace(/<\/head>/i, 표시 + '</head>');
  return s;
}

/* 게시판 글(공지사항)을 찾아낸다 — 목록 쪽에서 «글로 가는 길»을 긁는다.
   ★ 처음 정찰에서 이것을 놓쳤다. `document_srl=` 로만 찾았는데 주소가 `/notice/139` 모양이라
     「공지사항은 비어 있다」고 잘못 읽었다. 화면에 보이는 길을 그대로 따라가는 것이 맞다. */
function 게시글주소들(html, mid) {
  /* 떠 오기 «전»의 글이라 주소가 /notice/139 모양이다(고치기 전). 상대주소 모양도 함께 본다. */
  const re = new RegExp('href="(?:\\/|(?:\\.\\.\\/)+)?' + mid + '\\/(\\d+)\\/?"', 'g');
  return [...new Set([...html.matchAll(re)].map(m => m[1]))];
}

/* ── 본 일 ── */
(async () => {
  console.log('■ 쪽 ' + PAGES.length + '개를 떠 옵니다');
  const 쪽글 = {};
  const 자산 = new Set();

  for (const p of PAGES) {
    const url = ORIGIN + '/' + p.mid;
    const r = await fetchBin(url);
    if (r.code !== 200 || !r.buf.length) {
      console.log('  ✗ ' + p.이름 + ' (' + r.code + ') — 건너뜁니다');
      continue;
    }
    const html = r.buf.toString('utf8');
    쪽글[p.mid] = html;
    자산주소들(html, url).forEach(a => 자산.add(a));
    console.log('  · ' + p.이름.padEnd(10) + ' ' + String(html.length).padStart(6) + '자');
  }

  /* 게시판 글 — 목록만 떠 오면 「제목은 보이는데 눌러도 없는 쪽」이 된다 */
  const 글목록 = [];
  for (const mid of ['notice']) {
    if (!쪽글[mid]) continue;
    const 번호들 = 게시글주소들(쪽글[mid], mid);
    if (!번호들.length) { console.log('\n■ ' + mid + ' 에는 글이 없습니다'); continue; }
    console.log('\n■ ' + mid + ' 글 ' + 번호들.length + '개를 떠 옵니다');
    for (const no of 번호들) {
      const url = ORIGIN + '/' + mid + '/' + no;
      const r = await fetchBin(url);
      if (r.code !== 200 || !r.buf.length) { console.log('  ✗ ' + no + ' (' + r.code + ')'); continue; }
      const html = r.buf.toString('utf8');
      쪽글[mid + '/' + no] = html;
      글목록.push(mid + '/' + no);
      자산주소들(html, url).forEach(a => 자산.add(a));
      const 제목 = (/<title>([^<]*)<\/title>/i.exec(html) || [, ''])[1].trim();
      console.log('  · ' + no + '  ' + 제목.slice(0, 40));
    }
  }

  console.log('\n■ 자산 ' + 자산.size + '개를 떠 옵니다 (CSS 안의 그림까지 한 겹 더)');
  let 받음 = 0, 실패 = [];
  const 첫판 = [...자산];
  const 더 = new Set();
  await 줄서서(첫판, 4, async abs => {
    const r = await fetchBin(abs);
    if (r.code !== 200 || !r.buf.length) { 실패.push(abs); return; }
    const 파일 = 자산경로(abs);
    if (!파일) return;
    담기(파일, r.buf);
    받음++;
    if (/\.css($|\?)/i.test(abs)) {
      자산주소들(r.buf.toString('utf8'), abs).forEach(a => { if (!자산.has(a)) 더.add(a); });
    }
  });
  if (더.size) {
    await 줄서서([...더], 4, async abs => {
      const r = await fetchBin(abs);
      if (r.code !== 200 || !r.buf.length) { 실패.push(abs); return; }
      const 파일2 = 자산경로(abs);
      if (!파일2) return;
      담기(파일2, r.buf);
      받음++;
    });
  }
  console.log('  받은 것 ' + 받음 + '개' + (실패.length ? ' · 못 받은 것 ' + 실패.length + '개' : ''));
  실패.slice(0, 5).forEach(f => console.log('    ✗ ' + f));

  console.log('\n■ 쪽을 담습니다 (주소를 그대로 지키는 모양으로)');
  Object.keys(쪽글).forEach(mid => {
    const 파일 = mid ? mid + '/index.html' : 'index.html';
    담기(파일, Buffer.from(쪽고치기(쪽글[mid], mid), 'utf8'));
    console.log('  · ' + 파일);
  });

  /* 굳힌 것이 무엇인지 한 장으로 남긴다 */
  const 적바림 = [
    '# 홈페이지 굳힌 사본',
    '',
    '- 굳힌 날: ' + new Date().toISOString().slice(0, 10),
    '- 떠 온 곳: ' + ORIGIN + ' (라이믹스)',
    '- 쪽 ' + Object.keys(쪽글).length + '개 · 자산 ' + 받음 + '개',
    '',
    '## 손으로 고치지 마십시오',
    '',
    '`node scripts/freeze-homepage.js` 로 다시 만듭니다 — 손으로 고친 것은 사라집니다.',
    '',
    '## 주소',
    '',
    '쪽마다 `<이름>/index.html` 로 담았습니다. 도메인을 옮겨도 `/people`, `/work1` 이',
    '그대로 삽니다 — 주소가 바뀌면 검색 노출이 끊기기 때문입니다.',
    '',
    '링크는 «상대 주소»입니다. 임시 주소(`…/pureunall/site/`)에서도, 나중에 도메인',
    '뿌리에서도 같은 파일이 그대로 돕니다.',
    ''
  ].join('\n');
  담기('README.md', Buffer.from(적바림, 'utf8'));

  console.log('\n끝났습니다 → ' + OUT);
})();
