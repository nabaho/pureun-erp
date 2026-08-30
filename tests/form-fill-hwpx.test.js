/* 사업장 «원본 서식» 채우기 — js/pu-form-fill.js
   지키려는 규칙:
     ① 토큰이 여러 런으로 갈라져 있어도 채운다 (한글이 글꼴 바뀔 때마다 쪼갠다)
     ② 원본을 «망가뜨리지 않는다» — 글자 아닌 태그가 든 문단은 손대지 않는다
     ③ 채운 결과도 여전히 한글이 여는 .hwpx 다 (mimetype·본문이 그대로 있다)
     ④ 못 채운 토큰은 «말해 준다» — 조용히 {{성명}} 이 찍혀 나가면 접수처에서 되돌아온다
   실행: node --test tests/form-fill-hwpx.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const F = require(path.resolve(__dirname, '../js/pu-form-fill.js'));
const JSZip = require(path.resolve(__dirname, '../vendor/jszip.min.js'));

const 문단 = (...런들) => '<hp:p id="1">' + 런들.map((t) => '<hp:run charPrIDRef="0"><hp:t>' + t + '</hp:t></hp:run>').join('') + '</hp:p>';
const 바꾸기 = (map) => (s) => s.replace(/\{\{[^{}]+\}\}/g, (t) => (t in map ? map[t] : t));

test('토큰이 런 여러 개로 갈라져 있어도 채운다', () => {
  const out = F.fillSectionXml(문단('성명: {{회', '사명}} 귀하'), 바꾸기({ '{{회사명}}': '푸른노무법인' }));
  assert.match(out, /푸른노무법인/);
  assert.ok(!/\{\{/.test(out), '토큰이 남았습니다');
});

test('런은 지우지 않고 비워 둔다 (런이 사라지면 한글이 글자모양을 잃는다)', () => {
  const before = 문단('{{회', '사명}}');
  const after = F.fillSectionXml(before, 바꾸기({ '{{회사명}}': '가나' }));
  const 세기 = (s, re) => (s.match(re) || []).length;
  assert.equal(세기(after, /<hp:run\b/g), 세기(before, /<hp:run\b/g), '런 수가 달라졌습니다');
  assert.equal(세기(after, /<hp:t\b/g), 세기(before, /<hp:t\b/g), '글자칸 수가 달라졌습니다');
});

test('글자 아닌 태그가 든 문단은 건드리지 않는다', () => {
  const xml = '<hp:p id="2"><hp:run><hp:t>{{회사명}}<hp:tab/></hp:t></hp:run></hp:p>';
  assert.equal(F.fillSectionXml(xml, 바꾸기({ '{{회사명}}': '가나' })), xml,
    '탭이 든 문단을 건드렸습니다 — 원본이 망가집니다');
});

test('바뀔 것이 없으면 원문 그대로 둔다', () => {
  const xml = 문단('그냥 글');
  assert.equal(F.fillSectionXml(xml, 바꾸기({})), xml);
});

test('&·< 같은 글자를 넣어도 XML 이 깨지지 않는다', () => {
  const out = F.fillSectionXml(문단('{{회사명}}'), 바꾸기({ '{{회사명}}': '가&나<다>' }));
  assert.match(out, /가&amp;나&lt;다&gt;/);
  assert.ok(!/<다>/.test(out), '날것 태그가 들어갔습니다');
});

test('원본이 쓰는 토큰 목록을 미리 알려 준다 (서식 등록에 쓴다)', () => {
  const xml = 문단('{{회', '사명}} / {{대표자}}');
  assert.deepEqual(F.tokensInSection(xml).sort(), ['{{대표자}}', '{{회사명}}']);
});

test('못 채운 토큰은 말해 준다', async () => {
  const zip = new JSZip();
  zip.file('mimetype', 'application/hwp+zip');
  zip.file('Contents/section0.xml', '<hs:sec>' + 문단('{{회사명}} / {{대표자}}') + '</hs:sec>');
  const bytes = await zip.generateAsync({ type: 'uint8array' });
  const r = await F.fillHwpx(bytes, 바꾸기({ '{{회사명}}': '푸른' }), { JSZip });
  assert.deepEqual(r.leftover, ['{{대표자}}'], '안 채워진 토큰을 알려 주지 않습니다');
});

test('채운 뒤에도 한글이 여는 묶음 그대로다 (mimetype·본문이 남는다)', async () => {
  const zip = new JSZip();
  zip.file('mimetype', 'application/hwp+zip');
  zip.file('META-INF/container.xml', '<container/>');
  zip.file('Contents/header.xml', '<hh:head/>');
  zip.file('Contents/section0.xml', '<hs:sec>' + 문단('{{회사명}}') + '</hs:sec>');
  zip.file('Contents/section1.xml', '<hs:sec>' + 문단('{{대표자}}') + '</hs:sec>');
  const bytes = await zip.generateAsync({ type: 'uint8array' });

  const r = await F.fillHwpx(bytes, 바꾸기({ '{{회사명}}': '푸른노무법인', '{{대표자}}': '권형하' }), { JSZip });
  const back = await JSZip.loadAsync(r.bytes);
  for (const name of ['mimetype', 'META-INF/container.xml', 'Contents/header.xml']) {
    assert.ok(back.file(name), name + ' 이 사라졌습니다 — 한글이 못 엽니다');
  }
  assert.match(await back.file('Contents/section0.xml').async('string'), /푸른노무법인/);
  assert.match(await back.file('Contents/section1.xml').async('string'), /권형하/,
    '본문이 여러 장인 서식은 둘째 장이 안 채워집니다');
  assert.deepEqual(r.leftover, []);
});

test('한글 서식이 아니면 까닭을 말한다 (조용히 빈 파일을 내려주지 않는다)', async () => {
  const zip = new JSZip();
  zip.file('hello.txt', 'x');
  const bytes = await zip.generateAsync({ type: 'uint8array' });
  await assert.rejects(() => F.fillHwpx(bytes, (s) => s, { JSZip }), /본문/);
});

test('앱이 이 층을 실제로 부를 수 있게 파일이 붙어 있다', () => {
  const fs = require('node:fs');
  assert.ok(fs.existsSync(path.resolve(__dirname, '../vendor/jszip.min.js')),
    'JSZip 이 없으면 서식 채우기가 브라우저에서 돌지 않습니다');
});

/* ⑤ 한글이 «파일을 열기도 전에» 보는 자리 — mimetype
   2026-08-30: 그냥 다시 묶었더니 hwpx 검사기가 「mimetype should use ZIP_STORED,
   got compress_type=8」로 걸렀다. 한글도 같은 자리를 본다. 값이 곧 규칙이다.
   검사고정-허용: 0 = 무압축(STORE), 묶음 맨 앞 = 규격이 정한 자리다. */
test('mimetype 은 압축하지 않고 묶음 맨 앞에 남는다', async () => {
  const zip = new JSZip();
  zip.file('mimetype', 'application/hwp+zip');
  zip.file('Contents/section0.xml', '<hs:sec>' + 문단('{{회사명}}') + '</hs:sec>');
  const bytes = await zip.generateAsync({ type: 'uint8array' });
  const r = await F.fillHwpx(bytes, 바꾸기({ '{{회사명}}': '푸른' }), { JSZip });

  const b = Buffer.from(r.bytes);
  assert.equal(b.readUInt32LE(0), 0x04034b50, '묶음 시작이 ZIP 이 아닙니다');
  assert.equal(b.readUInt16LE(8), 0, 'mimetype 이 압축돼 있습니다 — 한글이 열지 못합니다');
  const len = b.readUInt16LE(26);
  assert.equal(b.slice(30, 30 + len).toString('utf8'), 'mimetype',
    '묶음 맨 앞이 mimetype 이 아닙니다');
});

test('글자 아닌 파일(그림·글꼴)은 손대지 않고 그대로 옮긴다', async () => {
  const 그림 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 1, 2, 250]);
  const zip = new JSZip();
  zip.file('mimetype', 'application/hwp+zip');
  zip.file('BinData/image1.png', 그림);
  zip.file('Contents/section0.xml', '<hs:sec>' + 문단('{{회사명}}') + '</hs:sec>');
  const bytes = await zip.generateAsync({ type: 'uint8array' });

  const r = await F.fillHwpx(bytes, 바꾸기({ '{{회사명}}': '푸른' }), { JSZip });
  const back = await JSZip.loadAsync(r.bytes);
  const out = Buffer.from(await back.file('BinData/image1.png').async('uint8array'));
  assert.ok(out.equals(그림), '도장·로고 그림이 망가졌습니다');
});

/* ⑥ ERP 화면이 이 길을 실제로 열어 준다 — 붙여만 두고 안 부르면 없는 것과 같다 */
const fs = require('node:fs');
const erp = fs.readFileSync(path.resolve(__dirname, '../pu-erp.html'), 'utf8');

test('서식 채우기 층이 캐시 번호와 함께 붙어 있다', () => {
  assert.match(erp, /src="js\/pu-form-fill\.js\?v=\d+"/,
    '캐시 번호가 없으면 고쳐도 브라우저가 옛 파일을 씁니다');
});

test('계약 서식 창에 «원본 서식 채우기» 길이 있다', () => {
  assert.match(erp, /onClick:\s*doFillOriginal/, '단추가 아무 데도 걸려 있지 않습니다');
  assert.match(erp, /function doFillOriginal\(\)/);
});

test('채우는 값은 서버로 가지 않는다 (주민번호가 든 서식이 많다)', () => {
  const at = erp.indexOf('function doFillOriginal()');
  const body = erp.slice(at, erp.indexOf('function doEmailMulti()', at));
  assert.ok(at > 0 && body.length > 200, '함수 본문을 못 찾았습니다');
  for (const 나가는길 of [/\bfetch\s*\(/, /fbDb\s*\./, /XMLHttpRequest/, /\.set\s*\(/, /\.push\s*\(/]) {
    assert.ok(!나가는길.test(body),
      '서식에 넣은 값이 밖으로 나갑니다: ' + 나가는길 + ' — 이 일은 화면 안에서 끝나야 합니다');
  }
});

test('못 채운 자리는 화면에 말해 준다', () => {
  const at = erp.indexOf('function doFillOriginal()');
  const body = erp.slice(at, erp.indexOf('function doEmailMulti()', at));
  assert.match(body, /leftover/, '못 채운 토큰을 확인하지 않습니다');
  assert.match(body, /showToast\([^)]*leftover|leftover[\s\S]{0,80}showToast/,
    '못 채운 자리를 조용히 넘깁니다 — 그대로 접수하면 되돌아옵니다');
});
