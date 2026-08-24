/* 탭만 봐도 어떤 프로그램인지 안다 (대표 지시 2026-08-24, 자안)

   ★ 무슨 일이 있었나
     팝업 창을 여러 개 띄우면 탭이 전부 「푸른…」 이었다. 아이콘도 같아서
     좁아질수록 구별이 안 됐다. 22개 화면 가운데 아이콘이 있는 것은 4개뿐이었고,
     그중 3개는 «같은 그림»(icon-192.png)이었다. 제목 규칙도 둘로 갈려 있었다
     (「푸른노무법인 ERP V1」 6개 · 「급여관리 — 푸른노무법인」 6개).

   ★ 고른 방법 (자안) — 그림 아이콘 + 짧은 이름
     · 아이콘: 포털 타일에서 쓰던 그림을 그대로 (새로 외울 것이 없다)
     · 제목  : 기능 이름을 맨 앞에, 회사 이름은 뺀다
     ⚠ 고객·근로자가 여는 화면(전자위임장·이음센터)에는 회사 이름을 남긴다.
       그분들에게는 «누가 보낸 것인지»가 먼저다.
     ※ 이 규격은 pu-cards.html 이 2026-08-21 에 먼저 쓰던 것이다 — 그대로 폈다.

   ★ 지키려는 것
     ① 화면마다 아이콘이 있고, 규격이 같다
     ② 그림이 서로 겹치지 않는다 (겹치면 애초에 하려던 일이 안 된다)
     ③ 제목 앞이 서로 겹치지 않는다 (좁은 탭은 앞에서부터 보인다)
     ④ 직원용 제목에 회사 이름을 다시 붙이지 않는다
     ⑤ ★ 포털 타일의 그림과 그 화면의 탭 그림이 «같다» — 다르면 두 벌을 외워야 한다 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const portal = fs.readFileSync(path.join(ROOT, 'enter.html'), 'utf8').replace(/\r\n/g, '\n');

let pass = 0, fail = 0;
function ok(name, cond, hint){
  if(cond){ pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (hint ? '\n    ' + hint : '')); }
}

/* 탭에 서는 화면들 — 포털에서 열리거나 링크로 열리는 것 */
const PAGES = [
  'enter.html','pu-erp.html','gov-consulting.html','work.html','kcareer.html',
  'pu-cards.html','pu-photos.html','pu-camera.html','fund.html','rules.html',
  'chwieop.html','docs-esign.html','payroll-os.html','pu-paydata.html','pu-home.html',
  'install.html','fund-poc.html','sign.html','ieum-view.html',
];
/* 고객·근로자가 여는 화면 — 여기엔 회사 이름을 남긴다 */
const OUTSIDE = ['sign.html', 'ieum-view.html'];

/* ⚠ 아이콘 주소 안에는 > 가 들어 있다. <link[^>]+ 로 훑으면 거기서 끊긴다 —
   따옴표 짝으로 끊어야 한다. */
const ICON_RE = /<link\s+rel="icon"\s+href="([^"]*)"\s*>/;
const SPEC = /^data:image\/svg\+xml,<svg xmlns='http:\/\/www\.w3\.org\/2000\/svg' viewBox='0 0 100 100'><text y='80' font-size='80'>(.+)<\/text><\/svg>$/;

const info = {};
PAGES.forEach(function(f){
  const p = path.join(ROOT, f);
  if(!fs.existsSync(p)) return;
  const s = fs.readFileSync(p, 'utf8');
  const title = ((s.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '').trim();
  const href = (s.match(ICON_RE) || [])[1] || '';
  const m = href.match(SPEC);
  /* ★ 이모지 한 글자로 그리는 것이 이 저장소의 «보통» 규격이다 — 짧고, 고칠 것이 없다.
     다만 이모지는 기기·브라우저가 «저마다 다른 그림» 으로 그린다. 그래서 회사 얼굴이
     되는 화면(포털)은 획으로 직접 그려 둔다(대표 지시 2026-08-24 「너무 촌스럽다」).
     ⚠ 여기서 볼 것은 «어느 규격인가» 가 아니라 ① 그림이 있는가 ② 서로 다른가 이다.
       규격을 못 박아 두었다가, 포털 아이콘을 제대로 그린 것만으로 이 검사가 깨졌다. */
  const drawn = !m && /^data:image\/svg\+xml,/.test(href) && /<(rect|path|circle|polygon)/.test(href);
  info[f] = { title, href, emoji: m ? m[1] : null, drawn: drawn, id: m ? m[1] : (drawn ? href : null) };
});

console.log('\n[① 화면마다 아이콘이 있고 규격이 같다]');
ok('탭에 서는 화면을 찾았다', Object.keys(info).length >= 18, '찾은 수: ' + Object.keys(info).length);
const noIcon = Object.keys(info).filter(f => !info[f].id);
ok('★ 모든 화면에 그림 아이콘이 있다', noIcon.length === 0,
   noIcon.length ? ('빠진 곳:\n      ' + noIcon.map(f => f + '  href=' + (info[f].href || '(없음)').slice(0, 60)).join('\n      ')) : '');

console.log('\n[② 그림이 서로 겹치지 않는다]');
const byEmoji = {};
Object.keys(info).forEach(f => { const e = info[f].id; if(e) (byEmoji[e] = byEmoji[e] || []).push(f); });
const dupE = Object.keys(byEmoji).filter(e => byEmoji[e].length > 1);
ok('★ 같은 그림을 쓰는 화면이 없다', dupE.length === 0,
   dupE.map(e => '      ' + e.slice(0, 24) + ' → ' + byEmoji[e].join(', ')).join('\n'));

console.log('\n[③ 제목 앞이 겹치지 않는다 — 좁은 탭은 앞에서부터 보인다]');
const byHead = {};
Object.keys(info).forEach(f => { const h = info[f].title.slice(0, 4); (byHead[h] = byHead[h] || []).push(info[f].title); });
const dupH = Object.keys(byHead).filter(h => new Set(byHead[h]).size > 1);
ok('★ 앞 4글자가 겹치는 제목이 없다', dupH.length === 0,
   dupH.map(h => '      「' + h + '…」 → ' + Array.from(new Set(byHead[h])).join(' / ')).join('\n'));

console.log('\n[④ 직원용 제목에 회사 이름을 붙이지 않는다]');
const withCo = Object.keys(info).filter(f => OUTSIDE.indexOf(f) < 0 && /푸른노무법인/.test(info[f].title));
ok('★ 「푸른노무법인」 이 직원용 탭 제목에 없다', withCo.length === 0,
   withCo.map(f => '      ' + f + '  「' + info[f].title + '」').join('\n'));
/* 반대로 고객이 여는 화면에는 «남아 있어야» 한다 — 누가 보낸 것인지가 먼저다 */
OUTSIDE.forEach(function(f){
  if(!info[f]) return;
  ok('고객이 여는 ' + f + ' 에는 회사 이름이 남아 있다', /푸른노무법인/.test(info[f].title),
     '「' + info[f].title + '」');
});

console.log('\n[⑤ ★ 포털 타일 그림 = 그 화면의 탭 그림]');
/* 다르면 같은 프로그램을 그림 두 벌로 외워야 한다 */
const tileRe = /\{ key:'([\w]+)',\s*name:'([^']*)',\s*desc:'[^']*',\s*icon:'([^']*)',\s*url:'([^'?]+)[^']*'/g;
let t, tiles = 0, mismatch = [];
while((t = tileRe.exec(portal))){
  const [, key, name, icon, url] = t;
  if(key === 'mail') continue;                 // 메일은 같은 파일을 주소로 갈라 쓴다(아래에서 따로 본다)
  if(!info[url] || !info[url].emoji) continue;
  tiles++;
  if(info[url].emoji !== icon) mismatch.push(name + ' — 타일 ' + icon + ' / 탭 ' + info[url].emoji + ' (' + url + ')');
}
ok('포털 타일을 실제로 읽었다 (읽는 규칙이 바뀌면 알려 준다)', tiles >= 10, '읽은 타일 수: ' + tiles);
ok('★ 타일 그림과 탭 그림이 모두 같다', mismatch.length === 0,
   mismatch.map(m => '      ' + m).join('\n'));

console.log('\n[⑥ 메일은 같은 파일을 주소로 갈라 쓴다]');
/* pu-cards.html?view=mail — 파일이 하나라 <head> 에서 제 이름·아이콘으로 바꿔 단다 */
const cards = fs.readFileSync(path.join(ROOT, 'pu-cards.html'), 'utf8');
ok('메일 주소일 때 제목을 바꿔 단다', /view=mail[\s\S]{0,400}?document\.title\s*=/.test(cards));
ok('메일 주소일 때 아이콘도 바꿔 단다', /view=mail[\s\S]{0,700}?link\[rel=icon\]/.test(cards));

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===\n');
process.exit(fail ? 1 : 0);
