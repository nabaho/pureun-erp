/* 직접 올린 서류가 «남는가».

   [🖼 사진첩에서 고르기]로 넣으면 원본이 이어져 나중에 [보기]로 다시 본다.
   그런데 파일을 «직접» 올린 길은 판독값만 칸에 넣고 끝나, 원본이 아무 데도 안 남았다 —
   그러면 「무엇을 보고 넣었지」를 되짚지 못한다. 잘못을 찾을 수가 없다.

   ⚠ 남기기가 실패해도 판독은 살린다. 값은 이미 칸에 들어갔다.
   ⚠ 사진첩에서 온 파일은 이미 이어져 있다 — 두 번 넣지 않는다.

   실행: node fund-erp/tools/check_keepdoc.js */
const fs = require('fs'), path = require('path');
const W = path.resolve(__dirname, '..', '..');
const src = fs.readFileSync(path.join(W, 'fund.html'), 'utf8');
function gF(n){const i=src.indexOf('function '+n+'(');if(i<0)throw Error('없음 '+n);let d=0;
  for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}}

let bad = 0;
const ok = (n, c, w) => { if (c) console.log('  · ' + n); else { bad++; console.log('  ✗ ' + n + (w ? '  — ' + w : '')); } };

/* ── 사진첩과 화면을 흉내 낸다 ── */
let saved = null, linked = null;
global.S = { fundId: 'X', user: '홍길동' };
global.funds = { X: { name: '가나공동', short_name: '가나 1호' } };
global.docZoneLabel = (k) => ({ inka: '설립인가증', taxid: '고유번호증' }[k] || k);
global.photoStoreReady = () => true;
global.saveScanRef = (fid, kind, ref) => { linked = { fid, kind, ref }; };
global.PuPhotoStore = {
  uploadSpec: () => ({ maxEdge: 2600, quality: 0.92, thumbEdge: 240 }),
  newId: () => 'PH-1',
  yearOf: (ms) => String(new Date(ms).getFullYear()),
  myUid: () => 'U-1',
  savePhoto: (p) => { saved = p; return Promise.resolve(true); },
};
/* 그림 만들기는 브라우저 것이라 여기서는 결과만 흉내 낸다 —
   여기서 볼 것은 «무엇을 사진첩에 담고 무엇을 잇는가»다. */
global._docToImage = () => Promise.resolve({ full: 'data:image/jpeg;base64,AAA', thumb: 'data:image/jpeg;base64,BBB' });
(0, eval)(gF('_keepDocOriginal'));

console.log('■ 직접 올린 서류를 남긴다');
_keepDocOriginal('inka', { name: '인가증.pdf' }, 'X').then((r) => {
  ok('사진첩에 넣는다', !!saved, saved);
  ok('본문과 미리보기를 함께 담는다', !!(saved.full && saved.thumb), Object.keys(saved || {}));
  const m = (saved || {}).meta || {};
  ok('서류 이름을 적어 둔다', m.kind === '설립인가증', m.kind);
  /* 다음에 [🔎 찾기]가 스스로 찾아내려면 제목에 서류 이름과 기금 이름이 있어야 한다 */
  ok('제목에 서류 이름이 있다 (다음에 찾기가 찾는다)', /설립인가증/.test(m.note || ''), m.note);
  ok('제목에 기금 이름이 있다', /가나 1호/.test(m.note || ''), m.note);
  ok('누가 넣었는지 남는다', m.byName === '홍길동', m.byName);
  ok('올린 때가 자리를 정한다', !!m.upAt, m.upAt);

  console.log('\n■ 이 기금에 잇는다 — 그래야 [보기]가 된다');
  ok('연결을 저장한다', !!linked, linked);
  ok('같은 기금에', linked.fid === 'X', linked.fid);
  ok('같은 서류 자리에', linked.kind === 'inka', linked.kind);
  ok('사진첩의 그 사진을 가리킨다', linked.ref.id === 'PH-1', linked.ref);
  ok('주인도 함께 적는다 (남의 자리 사진도 열리게)', linked.ref.owner === 'U-1', linked.ref.owner);

  console.log('\n■ 배선');
  /* 사진첩에서 온 파일은 이미 이어져 있다 — 두 번 넣으면 사진첩에 사본이 쌓인다 */
  ok('사진첩에서 온 길은 다시 안 넣는다', src.includes('readDocInto(zid,kind,file,true)'));
  ok('이미 이어져 있으면 안 넣는다', /!fromAlbum&&!\(funds\[myFid\]&&\(funds\[myFid\]\.scans\|\|\{\}\)\[kind\]\)/.test(src));
  /* 남기기가 실패해도 판독은 살아야 한다 — 값은 이미 칸에 들어갔다 */
  ok('못 남겨도 판독은 살린다', /판독은 됐지만 원본을 못 남겼습니다/.test(src));
  ok('그때 무엇을 하면 되는지 알려 준다', /\[🖼\]로 사진첩에서 골라 이어 주세요/.test(src));

  console.log(bad ? '\nFAILURES ' + bad : '\nALL PASS (직접 올린 서류가 남는다)');
  process.exit(bad ? 1 : 0);
}).catch((e) => {
  /* 터졌을 때도 «FAILURES» 를 남긴다 — 안 그러면 되돌림 시험이 통과로 읽는다 */
  console.log('  ✗ 터졌다: ' + (e && e.message));
  console.log('\nFAILURES 1');
  process.exit(1);
});
