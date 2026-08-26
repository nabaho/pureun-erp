/* 서식으로 잡힌 고유번호증 다시 판독 (대표 지시 2026-08-26)
   "고유번호증이 기업정보함에 입력이 안된다" → 판독 지시문에 「고유번호증」이라는 말이
   없어서 form(서식)으로 떨어진 것들이 있다. form 으로 남아 있으면 기업정보함
   사업자 목록에 «아예 안 들어간다». 대표 결정: 자동으로 다시 판독한다.

   ★ 찾는 데는 AI 를 안 쓴다 — 이미 읽어 둔 «제목»만 보면 된다.
     서식으로 분류됐어도 docName 에는 「고유번호증」이 그대로 적혀 있다.
   ⚠ 이미 bizreg 로 잡힌 것은 건드리지 않는다 — 다시 부르면 한도만 태우고 결과는 같다.
   ⚠ «화면에 보이는 것»만 다시 판독한다. 안 보이는 사진에 한도를 쓰면
     아무도 안 본 서류에 돈이 나간다. */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'pu-photos.html'), 'utf8');

function slice(fromMark, toMark) {
  const a = HTML.indexOf(fromMark);
  const b = HTML.indexOf(toMark, a + 1);
  assert.ok(a > 0 && b > a, '표식을 못 찾았다: ' + fromMark);
  return HTML.slice(a, b);
}
function load() {
  const ctx = { console, Object, Array, String, Number };
  vm.createContext(ctx);
  new vm.Script(slice('const UID_RE = ', 'function uidMisreadItems(')).runInContext(ctx);
  return ctx;
}
const mk = (kind, fields) => ({ meta: { read: { kind: kind, fields: fields || {} } } });

/* ── 무엇을 골라내나 ── */

test('서식으로 잡혔지만 제목이 고유번호증이면 골라낸다', () => {
  const { uidMisread } = load();
  assert.strictEqual(uidMisread(mk('form', { docName: '고유번호증' })), true);
  assert.strictEqual(uidMisread(mk('form', { docName: '고유 번호증' })), true);
  assert.strictEqual(uidMisread(mk('other', { docName: '고유번호증' })), true,
    'other 로 떨어진 것도 같은 서류다');
});

test('제목이 비었어도 칸 이름으로 찾는다', () => {
  const { uidMisread } = load();
  assert.strictEqual(uidMisread(mk('form', {
    pairs: [{ k: '단체명', v: 'ㅇㅇ' }, { k: '고유번호', v: '312-82-15421' }],
  })), true);
});

test('이미 사업자등록증으로 잡힌 것은 건드리지 않는다 — 한도만 태운다', () => {
  const { uidMisread } = load();
  assert.strictEqual(uidMisread(mk('bizreg', { docName: '고유번호증' })), false,
    '★ 제 자리에 있는 것을 다시 부르면 안 된다');
  assert.strictEqual(uidMisread(mk('sme', { docName: '고유번호증' })), false);
});

test('사업자등록증에 「고유번호」가 적혀 있어도 안 걸린다 — 갈래를 먼저 본다', () => {
  const { uidMisread } = load();
  assert.strictEqual(uidMisread(mk('bizreg', {
    pairs: [{ k: '고유번호', v: '1' }],
  })), false);
});

test('고유번호증이 아닌 서식은 안 건드린다', () => {
  const { uidMisread } = load();
  assert.strictEqual(uidMisread(mk('form', { docName: '기술혁신 지원신청서' })), false);
  assert.strictEqual(uidMisread(mk('form', { docName: '', pairs: [{ k: '업체명', v: 'ㅇ' }] })), false);
  assert.strictEqual(uidMisread(mk('form', {})), false);
});

test('아직 안 읽은 것·판독 정보가 없는 것에 안 넘어진다', () => {
  const { uidMisread } = load();
  assert.strictEqual(uidMisread(null), false);
  assert.strictEqual(uidMisread({}), false);
  assert.strictEqual(uidMisread({ meta: {} }), false);
  assert.strictEqual(uidMisread({ meta: { read: {} } }), false);
  assert.strictEqual(uidMisread({ meta: { read: { kind: 'form' } } }), false);
});

test('망가진 pairs 에도 안 넘어진다', () => {
  const { uidMisread } = load();
  assert.strictEqual(uidMisread(mk('form', { pairs: [null, {}, { k: null }] })), false);
  assert.strictEqual(uidMisread(mk('form', { pairs: 'x' })), false);
});

/* ── 어디까지를 대상으로 하나 ── */

test('«화면에 보이는 것»만 대상으로 한다 — 안 보이는 사진에 한도를 쓰지 않는다', () => {
  const body = slice('function uidMisreadItems()', 'function renderUidCard()');
  assert.match(body, /shownItems\(\)\.filter\(uidMisread\)/,
    'gridItems 를 쓰면 걸러 놓은 화면 밖 사진까지 판독한다');
});

/* ── 칸 ── */

test('0장이면 칸을 안 보여 준다', () => {
  const body = slice('function renderUidCard()', '/* 다시 판독 —');
  assert.match(body, /card\.style\.display = m \? 'block' : 'none'/);
  assert.match(body, /if \(!m\) return;/, '0장인데 글을 적으면 안 된다');
});

test('장수를 «사진 장수»로 센다 — 접힌 문서는 한 칸이지만 여섯 장이다', () => {
  const body = slice('function renderUidCard()', '/* 다시 판독 —');
  assert.match(body, /idsOf\(it\)\.length/, '칸 수로 세면 말이 어긋난다');
});

test('판독 중에는 단추를 못 누른다 — 두 번 돌면 한도가 두 배로 나간다', () => {
  const body = slice('function renderUidCard()', '/* 다시 판독 —');
  assert.match(body, /box\.disabled = !!reading/);
});

test('확인 필요 칸과 «같은 자리»에서 그린다 — 숫자가 어긋나지 않게', () => {
  const at = HTML.indexOf('renderNeedBox();\r\n  /* 서식으로 잡힌 고유번호증');
  const at2 = HTML.indexOf('renderNeedBox();\n  /* 서식으로 잡힌 고유번호증');
  assert.ok(at > 0 || at2 > 0, 'renderNeedBox 바로 뒤에서 불려야 한다');
  assert.match(HTML, /renderUidCard\(\);/);
});

/* ── 다시 판독 ── */

test('「모아 판독」과 같은 길을 탄다 — 새 판독 길을 만들지 않는다', () => {
  const body = slice('function readUidMisread()', '/* ══════ 여러 장 한꺼번에 기업정보함으로');
  assert.match(body, /readPhoto\(ids\[i\]\)/, '판독은 readPhoto 하나가 맡는다');
  assert.ok(!/fetch\(|generativelanguage|apiKey/.test(body), 'AI 를 직접 부르면 안 된다');
});

test('한 번에 하나씩 부른다 — 동시에 던지면 한도에 다 막힌다', () => {
  const body = slice('function readUidMisread()', '/* ══════ 여러 장 한꺼번에 기업정보함으로');
  assert.match(body, /return step\(i \+ 1\)/, '차례로 이어 불러야 한다');
  assert.ok(!/Promise\.all/.test(body), '한꺼번에 던지면 안 된다');
});

test('한 장이 실패해도 나머지를 이어서 판독한다', () => {
  const body = slice('function readUidMisread()', '/* ══════ 여러 장 한꺼번에 기업정보함으로');
  assert.match(body, /failed\+\+/);
  assert.match(body, /\.then\(function \(\) \{ return step\(i \+ 1\); \}\)/);
});

test('AI 를 몇 번 부르는지 말하고 한 번 물어본다 — 돈이 드는 일이다', () => {
  const body = slice('function readUidMisread()', '/* ══════ 여러 장 한꺼번에 기업정보함으로');
  assert.match(body, /if \(!confirm\(/, '묻지 않고 수십 번 부르면 안 된다');
  assert.match(body, /번\\n/, '몇 번 부르는지 적어야 한다');
});

test('두 번 겹쳐 돌지 않는다', () => {
  const body = slice('function readUidMisread()', '/* ══════ 여러 장 한꺼번에 기업정보함으로');
  assert.match(body, /if \(reading\) return;/);
  assert.match(body, /reading = true;/);
  assert.match(body, /reading = false;/, '끝나고 안 풀면 다음에 못 누른다');
});

test('「판독했다」와 「고쳐졌다」를 갈라 말한다', () => {
  /* ⚠ 다시 읽어도 고유번호증이 아니면 여전히 서식이다. 「30장 판독했습니다」만
       말하면 다 들어간 줄 안다 — 실제로 몇 장이 자리를 옮겼는지 말해야 한다. */
  const body = slice('function readUidMisread()', '/* ══════ 여러 장 한꺼번에 기업정보함으로');
  assert.match(body, /k === 'bizreg'/, '갈래가 실제로 바뀌었는지 봐야 한다');
  assert.match(body, /fixed\+\+/);
  assert.match(body, /장이 사업자등록증 자리로 들어갔습니다/);
  assert.match(body, /여전히 서식입니다/, '안 바뀐 것도 말해야 한다');
});

test('끝나면 칸을 다시 그린다 — 다 고쳤는데 단추가 남아 있으면 안 된다', () => {
  const body = slice('function readUidMisread()', '/* ══════ 여러 장 한꺼번에 기업정보함으로');
  assert.match(body, /renderGridBar\(\); renderGrid\(\); renderUidCard\(\);/);
});
