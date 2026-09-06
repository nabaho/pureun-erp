/* 넣어 둔 서류를 «화면으로 볼 수 있나».

   값이 어디서 왔는지 되짚으려면 원본을 봐야 한다 — 그래야 잘못을 찾는다.
   그런데 원본이 이미 붙어 있어도 이름을 누르면 «다시 고르기»가 열렸다.
   확인할 길이 사실상 없었고, 확인하려다 실수로 새 파일을 고르기 쉬웠다.

   규칙: 붙어 있으면 «보기», 없으면 «고르기». 바꿔 넣기는 [↻] 로 따로 둔다.

   ⚠ jsdom 이 있어야 한다. 없으면 곱게 건너뛰되 «건너뛰었다»고 분명히 말한다
     (check_forms·check_backup·check_cols·check_siterow 이 모두 이 방식이다).
     설치: npm i jsdom --no-save
     ★ 이 대목을 빼면 jsdom 이 없는 곳에서 «전체 검사»가 통째로 빨강이 되고,
       그러면 이 저장소의 모든 앱 배포가 함께 막힌다(2026-09-06 에 실제로 막혔다).

   실행: node fund-erp/tools/check_docview.js */
const fs = require('fs'), path = require('path');
const W = path.resolve(__dirname, '..', '..');
const src = fs.readFileSync(path.join(W, 'fund.html'), 'utf8');
let JSDOM;
try { JSDOM = require('jsdom').JSDOM; }
catch(e){ console.log('SKIP: jsdom 이 없어 서류 보기 검사를 건너뜁니다 (npm i jsdom --no-save)'); process.exit(0); }
const dom = new JSDOM('<!doctype html><body></body>');
global.window = dom.window; global.document = dom.window.document;
function gF(n){const i=src.indexOf('function '+n+'(');if(i<0)throw Error('없음 '+n);let d=0;
  for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}}
global.esc = v => String(v==null?'':v).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
global.S = { fundId:'X' };
global.funds = {};
global.charterLoad = () => true;
global.S.ch = [];
(0, eval)([gF('docZoneOne'), gF('charterZone')].join('\n'));

let bad = 0;
const ok = (n, c, w) => { if (c) console.log('  · ' + n); else { bad++; console.log('  ✗ ' + n + (w ? '  — ' + w : '')); } };
const draw = html => { const d = document.createElement('div'); d.innerHTML = html; return d; };
const click = (d, sel) => { const e = d.querySelector(sel); return e ? (e.getAttribute('onclick') || '') : '(없음)'; };

console.log('■ 원본이 «없을» 때 — 눌러서 고른다');
funds.X = {};
let d = draw(docZoneOne('dz-inka', 'inka', '설립인가증', '인가번호'));
ok('이름을 누르면 파일 고르기', /dzPick\('dz-inka'/.test(click(d, '#dz-inka')), click(d, '#dz-inka'));
ok('아직 보기 단추는 없다', !/openScan/.test(d.innerHTML));
ok('바꾸기(↻)도 없다', d.innerHTML.indexOf('↻') < 0);
ok('사진첩에서 고르기는 늘 있다', /openAlbumPick/.test(d.innerHTML));

console.log('\n■ 원본이 «있을» 때 — 눌러서 본다');
funds.X = { scans: { inka: { owner:'u1', year:2021, id:'p1', at:'2026-09-06' } } };
d = draw(docZoneOne('dz-inka', 'inka', '설립인가증', '인가번호'));
ok('이름을 누르면 «원본 보기»', /openScan\('inka'\)/.test(click(d, '#dz-inka')), click(d, '#dz-inka'));
ok('다시 고르기가 «안» 열린다', !/dzPick/.test(click(d, '#dz-inka')), click(d, '#dz-inka'));
ok('바꿔 넣을 길은 [↻] 로 따로', /dzPick\('dz-inka'/.test(d.innerHTML) && d.innerHTML.indexOf('↻') > 0);
ok('보기 단추도 있다', /openScan\('inka'\)/.test(d.innerHTML));
ok('언제 연결했는지 알려 준다', /2026-09-06/.test(d.innerHTML), d.innerHTML.slice(0, 120));
ok('붙어 있음이 테두리로 보인다', /border:1px solid/.test(d.innerHTML));

console.log('\n■ 정관도 같은 규칙');
funds.X = {}; S.ch = [];
let c = draw(charterZone());
ok('아무것도 없으면 고르기', /dzPick\('dz-charter'/.test(click(c, '#dz-charter')), click(c, '#dz-charter'));
/* 원본은 없지만 «읽어 둔 전문»이 있으면 그것을 보여 준다 */
S.ch = [{ id:'c1', at:'2026-07-25' }];
c = draw(charterZone());
ok('읽어 둔 전문이 있으면 전문 보기', /openCharterText\('c1'\)/.test(click(c, '#dz-charter')), click(c, '#dz-charter'));
funds.X = { scans: { charter: { owner:'u1', year:2021, id:'p9', at:'2026-09-06' } } };
c = draw(charterZone());
ok('원본이 있으면 원본 보기가 이긴다', /openScan\('charter'\)/.test(click(c, '#dz-charter')), click(c, '#dz-charter'));
ok('정관도 바꾸기(↻)가 따로 있다', c.innerHTML.indexOf('↻') > 0);

/* ── 사진첩에서 «당겨오는» 길이 막다른 끝이 아닌가 ──
   사진첩에 넣어 뒀는데도 제목에 그 낱말이 없으면(판독 안 한 사진·다른 이름) 못 찾는다.
   전에는 「없습니다」로 끝나 창을 닫고 작은 🖼 단추를 다시 찾아야 했다. */
console.log('\n■ 사진첩에서 찾기 — 못 찾아도 길이 있다');
global.$ = (id) => document.getElementById(id);
global.hlp = () => '';
global.loadingHTML = () => '';
global.docZoneLabel = (k) => k;
global.PuPhotoStore = { loadThumb: () => Promise.resolve(null) };
(0, eval)(src.slice(src.indexOf('var DOC_FIND='), src.indexOf('};', src.indexOf('var DOC_FIND=')) + 2));
global.DOC_FIND = DOC_FIND;
global._dfScanned = 12;
global._dfFound = { inka: [], corpreg: [], taxid: [], charter: [] };
(0, eval)(gF('renderDocFind') + gF('docFindBrowse'));
document.body.innerHTML = '<div id="dfBody"></div>';
funds.X = {};
renderDocFind();
const out = document.getElementById('dfBody').innerHTML;
ok('못 찾아도 그냥 끝나지 않는다', /docFindBrowse/.test(out), out.slice(0, 160));
ok('네 가지 모두에 길을 준다', (out.match(/docFindBrowse\(/g) || []).length === 4,
   (out.match(/docFindBrowse\(/g) || []).length);
ok('무엇을 하는 것인지 말해 준다', /사진첩에서 직접 고르기/.test(out), out.slice(0, 160));
ok('다음부터 저절로 나오게 하는 법도 알려 준다', /판독해 두면 다음부터는/.test(out), out.slice(0, 160));

/* 찾았을 때도 «여기 없으면» 길이 있어야 한다 — 점수 높은 여섯 장만 보이기 때문이다 */
global._dfFound = { inka: [{ it: { id: 'p1', year: 2024, meta: {} }, sc: 3 }], corpreg: [], taxid: [], charter: [] };
renderDocFind();
const out2 = document.getElementById('dfBody').innerHTML;
ok('찾았을 때도 직접 고를 길이 있다', /여기 없으면 직접 고르기/.test(out2), out2.slice(0, 160));

console.log('\n■ 넘어가면 그 자리로 열린다');
let opened = null;
global.closeM = () => {};
global.openAlbumPick = (zid, kind) => { opened = zid + '|' + kind; };
docFindBrowse('inka');
ok('설립인가증 자리로', opened === 'dz-inka|inka', opened);
docFindBrowse('charter');
ok('정관 자리로', opened === 'dz-charter|charter', opened);

console.log(bad ? '\nFAILURES ' + bad : '\nALL PASS (넣어 둔 서류를 눌러서 본다)');
process.exit(bad ? 1 : 0);
