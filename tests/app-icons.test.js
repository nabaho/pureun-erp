/* 「앱으로 설치」해도 프로그램마다 제 아이콘이 뜬다 (대표 지시 2026-08-24, 차안)

   ★ 무슨 일이 있었나
     설치 준비(manifest)는 7개 화면에 이미 있었다. 그런데 이름은 다 다른데
     «그림 파일은 다섯이 똑같았다»(icon-192.png). 바탕화면에 깔면 아이콘이 같아
     어느 것이 무엇인지 알 수 없었다. 포털과 이알피는 manifest 자체를 같이 썼다.

   ★ 고친 것
     프로그램마다 제 PNG 를 굽고(탭에 쓰는 그림글자와 «같은 그림»), manifest·홈화면
     아이콘을 각자 제 것으로 걸었다.
     ⚠ 홈화면 아이콘(apple-touch-icon)은 PNG 여야 한다 — 아이폰은 SVG 를 안 읽는다.
       탭 아이콘(rel=icon, 그림글자 SVG)과 «다른 것»이다.

   ★ 지키려는 것
     ① manifest 마다 제 아이콘을 쓴다 (다섯이 같은 그림으로 되돌아가지 않는다)
     ② 그 그림 파일이 «실제로 있다»
     ③ 화면마다 제 manifest 를 건다 (포털·이알피가 다시 한 벌을 같이 쓰지 않는다)
     ④ 홈화면 아이콘도 제 것이고, PNG 다
     ⑤ ★ 탭 그림글자 = 바탕화면 아이콘 = 포털 타일  — 셋이 같아야 한 벌만 외운다 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const portal = fs.readFileSync(path.join(ROOT, 'enter.html'), 'utf8').replace(/\r\n/g, '\n');

let pass = 0, fail = 0;
function ok(name, cond, hint){
  if(cond){ pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (hint ? '\n    ' + hint : '')); }
}

/* [화면, manifest, 아이콘 이름표, 포털에서 그 프로그램의 열쇠(없으면 null)] */
const APPS = [
  ['enter.html',      'manifest.json',            'portal',  null],
  ['pu-erp.html',     'pu-erp-manifest.json',     'erp',     'erp'],
  ['pu-cards.html',   'pu-cards-manifest.json',   'cards',   'cards'],
  ['pu-photos.html',  'pu-photos-manifest.json',  'photos',  'photos'],
  ['pu-camera.html',  'pu-camera-manifest.json',  'camera',  null],
  ['pu-paydata.html', 'pu-paydata-manifest.json', 'paydata', 'paydata'],
  ['work.html',       'work-manifest.json',       'work',    'work'],
];
const MAIL = ['pu-mail-manifest.json', 'mail', 'mail'];   // 주소로 갈라 쓰는 것

console.log('\n[① manifest 마다 제 아이콘]');
const used = {};
APPS.concat([[null, MAIL[0], MAIL[1], null]]).forEach(function ([page, mf, tag]){
  const p = path.join(ROOT, mf);
  if(!fs.existsSync(p)){ ok(mf + ' 이 있다', false); return; }
  let j;
  try { j = JSON.parse(fs.readFileSync(p, 'utf8')); } catch(e){ ok(mf + ' 이 올바른 JSON', false, e.message); return; }
  const srcs = (j.icons || []).map(i => i.src);
  ok(mf.padEnd(26) + ' → icon-' + tag,
     srcs.length >= 2 && srcs.every(s => s.indexOf('icon-' + tag + '-') === 0),
     '지금: ' + srcs.join(', '));
  srcs.forEach(s => { (used[s] = used[s] || []).push(mf); });
});

console.log('\n[② 같은 그림을 두 프로그램이 쓰지 않는다]');
const dup = Object.keys(used).filter(s => used[s].length > 1);
ok('★ 아이콘 파일을 나눠 쓰는 곳이 없다', dup.length === 0,
   dup.map(s => '      ' + s + ' → ' + used[s].join(', ')).join('\n'));

console.log('\n[③ 그림 파일이 실제로 있다]');
const missing = Object.keys(used).filter(s => !fs.existsSync(path.join(ROOT, s)));
ok('★ 없는 그림을 가리키지 않는다', missing.length === 0, '없는 파일: ' + missing.join(', '));
const tiny = Object.keys(used).filter(s => {
  const p = path.join(ROOT, s);
  return fs.existsSync(p) && fs.statSync(p).size < 500;    // 빈 파일이면 아이콘이 안 뜬다
});
ok('그림이 빈 파일이 아니다', tiny.length === 0, '너무 작음: ' + tiny.join(', '));

console.log('\n[④ 화면마다 제 manifest · 제 홈화면 아이콘]');
APPS.forEach(function ([page, mf, tag]){
  const s = fs.readFileSync(path.join(ROOT, page), 'utf8');
  const m = (s.match(/<link\s+rel="manifest"\s+href="([^"]*)"\s*>/) || [])[1];
  /* 앞에 /pureunall/ 이 붙어 있어도 맞는 것이다 — 하위 폴더에서 열어도 되라고 그렇게 쓴다 */
  ok(page.padEnd(18) + ' manifest = ' + mf, !!m && m.replace(/^.*\//, '') === mf, '지금: ' + m);
  const a = (s.match(/<link\s+rel="apple-touch-icon"\s+href="([^"]*)"\s*>/) || [])[1];
  ok(page.padEnd(18) + ' 홈화면 아이콘 = icon-' + tag, !!a && a.indexOf('icon-' + tag + '-192.png') >= 0,
     '지금: ' + a);
  /* 아이폰은 SVG 를 홈화면 아이콘으로 안 읽는다 — 그림글자 SVG 를 여기 넣으면 안 된다 */
  ok(page.padEnd(18) + ' 홈화면 아이콘이 PNG 다', !!a && /\.png$/.test(a), '지금: ' + a);
});

console.log('\n[⑤ ★ 탭 그림글자 = 바탕화면 아이콘 = 포털 타일]');
/* 굽는 스크립트가 쓴 그림글자를 파일 이름표로 되짚을 수는 없으므로,
   «탭 그림글자»와 «포털 타일 그림»이 같은지를 본다. 바탕화면 PNG 는 그 그림글자로 구웠다. */
const tileRe = /\{ key:'([\w]+)',[^}]*?icon:'([^']*)',\s*url:'([^'?]+)([^']*)'/g;
let t, checked = 0, bad = [];
while((t = tileRe.exec(portal))){
  const [, key, icon, url, qs] = t;
  const app = APPS.find(a => a[0] === url && a[3] === key);
  if(!app && !(key === 'mail')) continue;
  const page = url;
  const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
  if(key === 'mail'){
    /* 메일은 같은 파일을 ?view=mail 로 갈라 쓴다 — 그때 갈아 다는 그림을 본다 */
    const mm = html.match(/view=mail[\s\S]{0,900}?font-size='80'>([^<]*)<\/text>/);
    const emo = mm ? mm[1].replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/️/g, '') : null;
    checked++;
    if(emo !== icon.replace(/️/g, '')) bad.push('메일 — 타일 ' + icon + ' / 탭 ' + emo);
    continue;   /* ⚠ return 을 쓰면 «모듈이 통째로» 끝난다 — 아래 검사가 안 돈다 */
  }
  const im = html.match(/<link rel="icon" href="[^"]*font-size='80'>([^<]*)<\/text>/);
  const emo = im ? im[1] : null;
  checked++;
  if(!emo || emo.replace(/️/g, '') !== icon.replace(/️/g, '')) bad.push(key + ' — 타일 ' + icon + ' / 탭 ' + emo);
}
ok('포털 타일을 실제로 읽었다', checked >= 4, '읽은 수: ' + checked);
ok('★ 타일 그림과 탭 그림이 같다 (설치 아이콘도 이 그림으로 구웠다)', bad.length === 0,
   bad.map(b => '      ' + b).join('\n'));

console.log('\n[⑥ 포털과 이알피가 manifest 를 같이 쓰지 않는다]');
/* 같이 쓰면 둘 중 하나를 설치할 때 다른 하나의 이름·아이콘으로 깔린다 */
const pm = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const em = JSON.parse(fs.readFileSync(path.join(ROOT, 'pu-erp-manifest.json'), 'utf8'));
ok('★ 포털 manifest 는 포털을 연다', /enter\.html$/.test(pm.start_url || ''), 'start_url: ' + pm.start_url);
ok('★ 이알피 manifest 는 이알피를 연다', /pu-erp\.html$/.test(em.start_url || ''), 'start_url: ' + em.start_url);
ok('둘의 이름이 다르다', pm.name !== em.name, pm.name + ' / ' + em.name);

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===\n');
process.exit(fail ? 1 : 0);
