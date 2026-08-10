/* 여러 쪽짜리 문서는 통째로 한 번 읽는다 — 대표 결정 2026-08-10
   "계약서는 어떻게 ocr 처리해야하나" → 「문서 통째로 한 번」

   계약서는 보수가 2조, 계약기간이 6조, 서명·날인이 마지막 쪽에 흩어져 있다.
   쪽마다 따로 읽으면 아무도 문서 전체를 못 봐서 조문만 있는 2쪽 이후가 죄다
   빈칸으로 돌아온다. AI 호출도 쪽수만큼 든다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'js', 'pu-doc-read.js'), 'utf8');
const app = fs.readFileSync(path.join(root, 'pu-photos.html'), 'utf8');

/* 판독기를 실제로 돌려 **AI 에 무엇을 보내는지** 들여다본다.
   글자 모양만 보면 그림을 한 장만 실어 보내도 통과한다. */
function sent(input) {
  let body = null;
  /* ⚠ 이 모듈은 window 가 있으면 거기에 붙는다 — ctx.PuDocRead 가 아니라
     ctx.window.PuDocRead 다(끝줄의 `typeof window !== 'undefined' ? window : globalThis`). */
  const ctx = { window: {}, console: { warn() {} } };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  const R = ctx.window.PuDocRead;
  R.init({
    fetch: function (url, init) {
      body = JSON.parse(init.body);
      return Promise.resolve({
        ok: true,
        json: function () {
          return Promise.resolve({
            candidates: [{ content: { parts: [{ text: '{"kind":"contract"}' }] } }]
          });
        }
      });
    },
    getKey: function () { return 'KEY'; },
    delay: function (f) { f(); }
  });
  return R.read(input).then(function () { return body; });
}

const one = 'data:image/jpeg;base64,AAAA';
const two = 'data:image/jpeg;base64,BBBB';
const three = 'data:image/jpeg;base64,CCCC';

function images(body) {
  return body.contents[0].parts.filter(function (p) { return p.inline_data; });
}
function text(body) {
  return body.contents[0].parts.filter(function (p) { return p.text; })
    .map(function (p) { return p.text; }).join('');
}

test('★ 여러 쪽을 한 번의 요청에 함께 싣는다', async () => {
  const body = await sent([one, two, three]);
  assert.equal(images(body).length, 3,
    '쪽을 다 안 실으면 2조의 보수와 6조의 기간을 함께 볼 수 없습니다.');
});

test('★ 쪽 차례가 뒤바뀌지 않는다', async () => {
  const body = await sent([one, two, three]);
  const got = images(body).map(function (p) { return p.inline_data.data; });
  assert.deepEqual(got, ['AAAA', 'BBBB', 'CCCC'],
    '차례가 섞이면 「1쪽·2쪽」을 가리키는 조문을 잘못 읽습니다.');
});

test('★ 한 문서의 여러 쪽임을 말해 준다 — 안 그러면 쪽마다 답한다', async () => {
  const body = await sent([one, two]);
  const t = text(body);
  assert.ok(/한 문서의 여러 쪽/.test(t), '무엇을 보낸 것인지 안 알려 줍니다.');
  assert.ok(/한 벌의 JSON/.test(t), '쪽마다 따로 답하면 우리가 쓸 수가 없습니다.');
});

test('★ 한 장짜리에는 그 말을 안 붙인다', async () => {
  /* 한 장인데 「여러 쪽」이라고 하면 AI 가 없는 쪽을 지어낸다. */
  const body = await sent(one);
  assert.equal(images(body).length, 1);
  assert.ok(!/한 문서의 여러 쪽/.test(text(body)), '한 장인데 여러 쪽이라고 말합니다.');
});

test('빈 것이 섞여 있어도 있는 쪽으로 읽는다', async () => {
  const body = await sent([one, '', two]);
  assert.equal(images(body).length, 2, '못 받은 쪽 때문에 판독 전체가 멎으면 안 됩니다.');
});

/* ── 화면 쪽 ── */
test('★ 격자에서도 형제 쪽을 모아 한 번에 읽는다', () => {
  const fn = app.match(/function docPages\(id\)[\s\S]*?\n\}/);
  assert.ok(fn, 'docPages 를 찾지 못했습니다.');
  assert.ok(/doc\.group === g/.test(fn[0]), '묶음 번호로 모으지 않습니다.');
  assert.ok(/\.sort\(/.test(fn[0]) && /doc\.page/.test(fn[0]),
    '쪽 차례로 안 세우면 뒤죽박죽 보냅니다.');
  const read = app.match(/function readPhoto\(id\)[\s\S]*?\n\}/);
  assert.ok(/docPages\(id\)/.test(read[0]), 'readPhoto 가 형제 쪽을 안 모읍니다.');
  assert.ok(/imgs\.length > 1 \? imgs : imgs\[0\]/.test(read[0]),
    '한 장짜리까지 배열로 보내면 「여러 쪽」이라고 잘못 말하게 됩니다.');
});

test('★ 읽은 답을 모든 쪽에 남긴다', () => {
  /* 한 쪽에만 쓰면 나머지는 「안 읽음」으로 남아, 화면을 열 때마다 같은 문서를
     또 읽으러 간다 — 한도를 쪽수만큼 더 쓴다. */
  const read = app.match(/function readPhoto\(id\)[\s\S]*?\n\}/)[0];
  assert.ok(/pages\.reduce\(/.test(read), '쪽마다 저장하지 않습니다.');
  assert.ok(/saveRead\(gridYear, p\.id, read, photoOwner\(p\.id\)\)/.test(read),
    '쪽마다 주인을 안 보고 저장합니다.');
  const start = app.match(/function startRead\(job\)[\s\S]*?\n\}/)[0];
  assert.ok(/sibs\.forEach\(/.test(start) && /sibs\.reduce\(/.test(start),
    '방금 올린 쪽들에 답을 안 남깁니다.');
});

test('★ 명함첩·업체관리에는 대표 쪽 하나만 보낸다', () => {
  /* 쪽마다 보내면 같은 업체가 쪽수만큼 쌓인다. */
  const read = app.match(/function readPhoto\(id\)[\s\S]*?\n\}/)[0];
  assert.ok(/sendCards\(pages\[0\]\.id/.test(read), '쪽마다 명함첩으로 보냅니다.');
  assert.ok(/sendCompany\(pages\[0\]\.id/.test(read), '쪽마다 업체관리로 보냅니다.');
  const start = app.match(/function startRead\(job\)[\s\S]*?\n\}/)[0];
  assert.ok(/sendCards\(sibs\[0\]\.id/.test(start), '쪽마다 명함첩으로 보냅니다.');
  assert.ok(/sendCompany\(sibs\[0\]\.id/.test(start), '쪽마다 업체관리로 보냅니다.');
});

test('★ 이미 올라간 문서도 문서마다 한 번만 대기열에 넣는다', () => {
  const fn = app.match(/function autoReadPending\(\)[\s\S]*?\n\}/);
  assert.ok(fn, 'autoReadPending 를 찾지 못했습니다.');
  assert.ok(/seenDoc/.test(fn[0]),
    '쪽마다 걸면 첫 쪽이 문서 전체를 읽어 놓은 뒤에도 나머지가 또 읽습니다.');
});

test('몇 쪽을 함께 보고 낸 답인지 남긴다', () => {
  /* 「2쪽인데 왜 같은 내용인가」에 답할 수 있어야 한다. */
  assert.ok(/read\.pagesRead = pages\.length/.test(app) &&
    /read\.pagesRead = sibs\.length/.test(app), '몇 쪽을 봤는지 안 남깁니다.');
});
