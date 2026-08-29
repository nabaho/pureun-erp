/* 받은 한글 서식이 「파일 내용과 확장자가 일치하지 않습니다」로 막히던 것 (2026-08-29 대표 제보)
   ─────────────────────────────────────────────────────────────────────────────
   관공서 서식은 한글에서 hwpx로 저장해 놓고 이름만 .hwp 인 것이 흔하다.
   그때 이름을 «속»에 맞춰야 문서가 열린다.

   ⚠ 이 검사는 화면 파일에서 함수를 떼어 **실제로 돌려** 본다.
     글자만 맞춰 보는 검사는 함수가 망가져도 그대로 통과한다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'kcareer.html'), 'utf8');

/* 주석을 걷어낸 본문 — 잘 쓴 주석이 검사를 통과시키는 일을 막는다 */
function stripComments(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
}

/* 이름 붙은 함수 하나를 중괄호 균형으로 떼어 낸다 */
function grab(name) {
  const i = source.indexOf('function ' + name + '(');
  assert.ok(i > 0, name + ' 이(가) kcareer.html 에 있어야 합니다');
  let depth = 0, started = false, j = i;
  for (; j < source.length; j++) {
    const c = source[j];
    if (c === '{') { depth++; started = true; }
    else if (c === '}') { depth--; if (started && depth === 0) { j++; break; } }
  }
  return source.slice(i, j);
}

/* detect 가 내주는 형식으로 _hwpFixName 을 돌린다. detect 가 null 이면 엔진이 없는 상태. */
function fixName(detect) {
  const engine = detect ? { detectFormat: detect } : null;
  const body = grab('_isHwpName') + '\n' + grab('_hwpFixName') + '\nreturn _hwpFixName;';
  return new Function('window', 'PureunHwp', body)({ PureunHwp: engine }, engine);
}

const asHwpx = () => 'hwpx';
const asHwp = () => 'hwp';

test('이름은 .hwp 인데 속이 hwpx 면 hwpx 로 연다', () => {
  const fix = fixName(asHwpx);
  assert.equal(fix(new Uint8Array([0x50, 0x4b, 0x03, 0x04]), '위촉신청서.hwp'), '위촉신청서.hwpx');
});

test('이름은 .hwpx 인데 속이 옛 hwp 면 hwp 로 연다 — 거꾸로도 막히면 안 된다', () => {
  const fix = fixName(asHwp);
  assert.equal(fix(new Uint8Array([0xd0, 0xcf]), '이력서양식.hwpx'), '이력서양식.hwp');
});

test('이름과 속이 같으면 이름을 건드리지 않는다', () => {
  assert.equal(fixName(asHwpx)(new Uint8Array(), '양식.hwpx'), '양식.hwpx');
  assert.equal(fixName(asHwp)(new Uint8Array(), '양식.HWP'), '양식.HWP');
});

test('docx 는 속이 zip(=hwpx 로 보임)이어도 절대 이름을 바꾸지 않는다', () => {
  /* 여기가 무너지면 워드 서식이 한글 서식으로 둔갑해 엉뚱한 엔진으로 넘어간다 */
  assert.equal(fixName(asHwpx)(new Uint8Array([0x50, 0x4b]), '경력기술서.docx'), '경력기술서.docx');
  assert.equal(fixName(asHwpx)(new Uint8Array([0x50, 0x4b]), '서식.pdf'), '서식.pdf');
});

test('속을 못 알아보면 이름을 그대로 둔다 — 모르는 문서는 손대지 않는다', () => {
  assert.equal(fixName(() => '')(new Uint8Array([1, 2, 3]), '수상한것.hwp'), '수상한것.hwp');
});

test('엔진이 없거나 던져도 이름은 망가지지 않는다', () => {
  assert.equal(fixName(null)(new Uint8Array(), '양식.hwp'), '양식.hwp');
  assert.equal(fixName(() => { throw new Error('엔진 고장'); })(new Uint8Array(), '양식.hwp'), '양식.hwp');
});

test('올린 파일 이름을 그대로 쓰지 않는다 — 바로잡은 이름 하나로 쭉 간다', () => {
  const body = stripComments(grab('importTemplateFile'));
  assert.match(body, /_hwpFixName\(/, '업로드 입구에서 이름을 바로잡아야 합니다');
  /* 올린 이름은 «바로잡는 재료»로만 쓴다 — 보관함·임시저장·편집기에 그대로 흘려보내면
     다음에 열 때 같은 자리에서 또 막힌다. */
  assert.doesNotMatch(body, /name:\s*file\.name/, '보관함·임시저장에 어긋난 이름이 남습니다');
  assert.doesNotMatch(body, /mountEditor\([^)]*file\.name/, '편집기에 어긋난 이름이 넘어갑니다');
  assert.match(stripComments(grab('mountEditor')), /_hwpFixName\(/,
    '보관함·이어서 하기로 들어오는 길에도 관문이 있어야 합니다');
});

test('받은 한글 서식은 큰 창으로 뜨고, 그 창에서 바로 채울 수 있다', () => {
  const body = stripComments(grab('importTemplateFile'));
  assert.match(body, /openHwpViewer\(/, '올리면 큰 창이 떠야 합니다');
  /* 큰 창의 발판에 채우기 단추가 있는가 — 창을 닫았다 열지 않고 그 자리에서 채운다 */
  const modal = source.slice(source.indexOf('id="modalHwpView"'));
  const foot = modal.slice(modal.indexOf('modal-foot'), modal.indexOf('modal-foot') + 800);
  assert.match(foot, /rhAutoFillDoc\(\)/);
});

test('큰 창에 떠 있는 문서를 채운다 — 보관함에서 바로 연 서식도 채워져야 한다', () => {
  const body = stripComments(grab('rhAutoFillDoc'));
  assert.match(body, /_hwpView/, '지금 화면에 보이는 문서를 채움 대상으로 삼아야 합니다');
});

/* ── 큰 창에서 A4 쪽이 실제로 커지는가 ──
   엔진은 문서의 본래 크기까지만 그린다. 창을 키워도 가운데 작게 앉아 있으면
   「큰 창」이 아무 소용이 없다. */
function fitInto(clientWidth, canvases) {
  const box = { clientWidth: clientWidth, querySelectorAll: () => canvases };
  const doc = { getElementById: (id) => (id === 'hwpViewBody' ? box : null) };
  new Function('document', grab('_hwpViewFit') + '\n_hwpViewFit();')(doc);
  return canvases;
}
const page = () => ({ width: 793, height: 1122, style: {} });   // A4 한 쪽

test('큰 창에서는 A4 쪽이 창 너비를 채운다', () => {
  const [cv] = fitInto(1400, [page()]);
  assert.equal(cv.style.width, '1368px');
  /* 세로는 값을 박지 않고 «비율이 지켜졌는가»를 본다 — A4 모양이 찌그러지면 안 된다 */
  const w = parseFloat(cv.style.width), h = parseFloat(cv.style.height);
  assert.ok(Math.abs(h / w - 1122 / 793) < 0.005, 'A4 비율이 지켜져야 합니다 (' + w + '×' + h + ')');
});

test('아무리 창이 커도 알갱이의 2배 위로는 늘리지 않는다 — 그 위는 글자가 뭉개진다', () => {
  const [cv] = fitInto(3000, [page()]);
  assert.equal(cv.style.width, '1586px');
});

test('창을 줄이면 따라 줄어든다 — 가로 스크롤이 생기지 않게', () => {
  const [cv] = fitInto(600, [page()]);
  assert.equal(cv.style.width, '568px');
});

test('창 크기가 아직 안 잡혔으면 손대지 않는다 — 잘못 늘리느니 그대로', () => {
  const [cv] = fitInto(0, [page()]);
  assert.equal(cv.style.width, undefined);
});
