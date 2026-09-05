/* 스캔 PDF 를 «두 번» 읽을 수 있나 — 서류 자동 입력이 여기서 늘 터졌다.

   pdf.js 는 건네받은 버퍼를 워커로 «넘겨준다»(transfer). 넘긴 순간 원본은 무효가 되고,
   같은 버퍼를 다시 쓰면 이렇게 터진다:
     읽기 실패: Failed to execute 'postMessage' on 'Worker':
                An ArrayBuffer is detached and could not be cloned.

   스캔 PDF 는 글자층이 없어 두 번 읽어야 한다 — 글자를 찾아보고(pdfText),
   없으면 그림으로 그려 OCR 한다(pdfPageCanvases). 그 둘째 읽기가 늘 실패했다.
   고유번호증·등기부처럼 스캔으로만 오는 서류는 그래서 한 번도 판독되지 않았다.

   여기서는 pdf.js 를 흉내 내되 «진짜로 넘겨준다» — structuredClone 의 transfer 로
   버퍼를 무효로 만든다. 사본을 주지 않으면 실제와 똑같이 터진다.

   실행: node fund-erp/tools/check_pdfbuf.js */
const fs = require('fs'), path = require('path');
const W = path.resolve(__dirname, '..', '..');
const src = fs.readFileSync(path.join(W, 'fund.html'), 'utf8');
function gF(n){const i=src.indexOf('function '+n+'(');if(i<0)throw Error('없음 '+n);let d=0;
  for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}}

let bad = 0;
const ok = (n, c, w) => { if (c) console.log('  · ' + n); else { bad++; console.log('  ✗ ' + n + (w ? '  — ' + w : '')); } };

/* pdf.js 흉내 — 받은 data 의 버퍼를 진짜로 넘겨준다(=무효로 만든다) */
let handed = [];
global.pdfjsLib = {
  GlobalWorkerOptions: {},
  getDocument(opts) {
    const u = opts.data;
    handed.push(u);
    structuredClone(u.buffer, { transfer: [u.buffer] });   // ← 여기서 무효가 된다
    return { promise: Promise.resolve({
      numPages: 1,
      getPage: () => Promise.resolve({
        getTextContent: () => Promise.resolve({ items: [] }),
        getViewport: () => ({ width: 10, height: 10 }),
        render: () => ({ promise: Promise.resolve() }),
      }),
      destroy(){},
    }) };
  },
};
global.document = { createElement: () => ({ width:0, height:0,
  getContext: () => ({ getImageData: () => ({ data: new Uint8ClampedArray(4) }), putImageData(){} }) }) };

(0, eval)([gF('_pdfCopy'), gF('pdfText'), gF('_binarize'), gF('pdfPageCanvases')].join('\n'));

const buf = new Uint8Array(2048).fill(7);

console.log('■ 같은 버퍼로 두 번 읽기 (스캔 PDF 의 실제 흐름)');
pdfText(buf).then(txt => {
  ok('글자 읽기가 끝난다', typeof txt === 'string', txt);
  /* 여기가 문제였던 자리 — 글자가 없으면 같은 buf 로 OCR 로 넘어간다 */
  ok('글자층이 없다고 나온다(스캔본)', !String(txt).trim(), JSON.stringify(txt));
  ok('원본 버퍼가 살아 있다', buf.byteLength === 2048, buf.byteLength + ' — 넘겨줘 무효가 됐다');
  return pdfPageCanvases(buf, 1);
}).then(cvs => {
  ok('같은 버퍼로 OCR 그리기까지 간다', Array.isArray(cvs) && cvs.length === 1, cvs && cvs.length);
  ok('두 번 다 pdf.js 에 «사본»을 줬다',
     handed.length === 2 && handed.every(u => u !== buf), handed.length + '번');
  ok('사본이 원본과 같은 내용', handed[0] !== buf && handed[0].byteLength === 0, '넘겨준 뒤라 0이어야 정상');
  console.log(bad ? '\nFAILURES ' + bad : '\nALL PASS (스캔 PDF 를 두 번 읽는다)');
  process.exit(bad ? 1 : 0);
}).catch(e => {
  console.log('  ✗ 터졌다: ' + (e && e.message));
  console.log('\nFAILURES ' + (bad + 1));
  process.exit(1);
});
