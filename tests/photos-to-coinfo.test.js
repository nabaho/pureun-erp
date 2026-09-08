/* 사진첩 → 기업정보 보내기.
   서식·신청서는 여기 말고는 갈 곳이 없었다 — 18개 칸을 읽어 놓고도 어디에도 안 남았다.
   저장소를 진짜 Firebase 없이 돌리려고 가짜 db 를 만들어 넣는다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { cutFn } = require('./cut-fn');
const src  = fs.readFileSync(path.join(__dirname, '..', 'js', 'pu-doc-file.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'pu-photos.html'), 'utf8');

function load(existing){
  const i = src.indexOf('function sendToCoInfo');
  const j = src.indexOf('function sendToCompany');
  assert.ok(i > 0 && j > i, 'sendToCoInfo 를 찾지 못했습니다');
  const writes = [];
  const ctx = {
    Promise, Object, String, Date, Error,
    CARDS_ROOT: 'pucards',
    /* 2026-08-24: 값이 어긋날 때 알림 글이 칸 이름표를 쓴다 — 잘라낸 조각 밖에 있어 넣어 준다 */
    CO_LABEL: { ceo:'대표자', address:'소재지', applyField:'지원 희망분야' },
    /* 2026-08-28: 어긋남 알림이 «기업정보함» 이름표를 먼저 본다 */
    FIELD_LABEL: { ceo:'대표자', address:'소재지', companyTel:'대표번호' },
    /* 2026-08-28: 서류 밑에 pairs 를 담는다 — 그 한계값 */
    CO_PAIRS_MAX: 60, CO_PAIR_LEN: 300,
    bizKey: v => { const d = String(v||'').replace(/\D/g,''); return d.length>=10 ? d : ''; },
    deps: { db: { ref: p => ({
      once: () => Promise.resolve({ val: () => existing }),
      update: v => { writes.push({ path:p, val:v }); return Promise.resolve(); }
    }) } },
    _writes: writes
  };
  vm.createContext(ctx);
  vm.runInContext(src.slice(i, j), ctx);
  return ctx;
}
const FORM = { bizno:'134-86-05772', company:'가나컨트롤(주)', ceo:'나성환',
  corpno:'110111-1234567', docName:'기술·경영 혁신 지원신청서', applyNo:'2026-5',
  applyItems:'가드레일, 크래쉬쿠션, 태양광', applyField:'인사·조직', applyDate:'2026-03-15',
  dueDays:'60일', homepage:'www.ganactrl.co.kr/', email:'cust20@ganactrl.co.kr' };

test('사업자번호를 열쇠로 회사 자리에 넣는다', async () => {
  /* 기업정보함 기업정보 화면도 같은 열쇠로 회사를 가른다 — 어긋나면 엉뚱한 회사에 붙는다 */
  const c = load({});
  const r = await c.sendToCoInfo({ fields: FORM });
  assert.equal(r.ok, true);
  assert.equal(c._writes[0].path, 'pucards/coInfo/1348605772');
});

test('신청서에서 읽은 칸이 다 들어간다', async () => {
  const c = load({});
  const r = await c.sendToCoInfo({ fields: FORM });
  const v = c._writes[0].val;
  ['docName','applyNo','applyItems','applyField','applyDate','dueDays','homepage','email','corpno']
    .forEach(k => assert.ok(v[k], k + ' 이 빠졌다'));
  assert.ok(r.filled.length >= 9);
});

test('이미 있는 값은 덮지 않는다', async () => {
  /* 나중에 읽은 서식이 먼저 읽은 값을 지우면 사람이 고쳐 둔 것도 함께 날아간다 */
  const c = load({ ceo:'사람이 고친 대표자', applyField:'앞서 넣은 분야' });
  const r = await c.sendToCoInfo({ fields: FORM });
  const v = c._writes[0].val;
  assert.equal(v.ceo, undefined, '이미 있는 대표자를 덮었다');
  assert.equal(v.applyField, undefined, '이미 있는 분야를 덮었다');
  assert.ok(v.docName, '빈 칸은 채워야 한다');
});

test('빈 값·공백은 넣지 않는다', async () => {
  const c = load({});
  await c.sendToCoInfo({ fields: { bizno:FORM.bizno, ceo:'   ', docName:'서식' } });
  const v = c._writes[0].val;
  assert.equal(v.ceo, undefined);
  assert.equal(v.docName, '서식');
});

test('사업자번호가 없으면 아무것도 안 쓰고 까닭을 말한다', async () => {
  /* 어느 회사인지 모르는 채 쓰면 남의 회사에 붙는다 */
  const c = load({});
  const r = await c.sendToCoInfo({ fields: { company:'상호만 있음', docName:'서식' } });
  assert.equal(r.ok, false);
  assert.equal(c._writes.length, 0);
  assert.match(r.message, /사업자번호/);
});

test('채울 칸도 없고 갈래도 이미 있으면 쓰지 않는다', async () => {
  const c = load({ docName:'기술·경영 혁신 지원신청서', tags:{ '기술·경영 혁신 지원신청서': true } });
  const r = await c.sendToCoInfo({ fields: { bizno:FORM.bizno, docName:'기술·경영 혁신 지원신청서' } });
  assert.equal(c._writes.length, 0);
  assert.match(r.message, /이미 다 들어 있습니다/);
});

test('서류이름이 다르면 새 사업 갈래로 붙는다', async () => {
  /* 한 회사가 여러 사업에 들어갈 수 있다 — 앞 사업 딱지를 지우면 안 된다 */
  const c = load({ docName:'앞선 신청서', tags:{ '앞선 신청서': true } });
  const r = await c.sendToCoInfo({ fields: { bizno:FORM.bizno, docName:'기술·경영 혁신 지원신청서' } });
  assert.equal(c._writes[0].val['tags/기술·경영 혁신 지원신청서'], true);
  assert.equal(c._writes[0].val['tags/앞선 신청서'], undefined, '앞 갈래를 건드리면 안 된다');
  assert.ok(r.filled.indexOf('갈래') >= 0);
});

test('갈래 이름에서 실시간DB 가 못 쓰는 글자를 빼낸다', async () => {
  /* . # $ [ ] / 가 들어가면 열쇠로 못 쓴다 — 통째로 저장이 실패한다 */
  const c = load({});
  await c.sendToCoInfo({ fields: { bizno:FORM.bizno, docName:'2026. 기술/경영 [혁신] #지원' } });
  const k = Object.keys(c._writes[0].val).find(x => x.indexOf('tags/') === 0);
  assert.ok(k, '갈래를 안 붙였다');
  assert.doesNotMatch(k.slice(5), /[.#$/[\]]/, '못 쓰는 글자가 남았다');
});

test('기업정보 화면이 모르는 칸은 보내지 않는다', async () => {
  /* 화면에 안 나오면서 저장소만 불어난다 */
  const c = load({});
  await c.sendToCoInfo({ fields: { bizno:FORM.bizno, docName:'서식', 엉뚱한칸:'값', scope:'위임사무' } });
  assert.equal(c._writes[0].val['엉뚱한칸'], undefined);
  assert.equal(c._writes[0].val.scope, undefined);
});

test('누가 언제 넣었는지 남긴다', async () => {
  const c = load({});
  await c.sendToCoInfo({ fields: FORM, byName: '권형하' });
  assert.equal(c._writes[0].val.by, '권형하');
  assert.ok(c._writes[0].val.at > 0);
});

/* ── 화면 ── */
test('어느 회사인지 모르면 단추를 안 띄우고 까닭을 말한다', () => {
  /* 아무 말 없이 단추만 없으면 「왜 안 되지」로 시간을 버린다.
     ⚠ 2026-09-07: 문구가 «사업자번호»만 말하면 안 된다 — 상호로도 가므로,
       번호만 말하면 적을 수 있는 것을 안 적게 만든다. */
  assert.match(html, /function canSendCoInfo/);
  assert.match(html, /어느 회사 것인지 몰라 기업 상세로 보낼 수 없습니다/);
  assert.match(html, /사업자번호나 상호<\/b>를 채워 주세요/,
    '★ 무엇을 채우면 되는지 말해 주지 않는다');
});

test('한 번 보낸 사진은 다시 안 보낸다', () => {
  assert.match(html, /if \(read\.filedInfo && read\.filedInfo\.at\) return false/);
});

test('보낸 표시는 사진 주인 자리에 남긴다', () => {
  /* 남의 사진을 관리자가 보냈을 때 내 자리에 쓰면 주인 화면엔 「아직 안 보냄」으로 남아 또 보낸다 */
  /* ⚠ 2026-08-23: 해를 gridYear 로 «박아 두지 않는다». 자동 보내기가 붙으면서
     sendCoInfo 가 year 를 받게 되었다 — 화면의 해로 짐작하면 다른 해 사진의 기록이
     엉뚱한 자리에 적힌다. 지킬 것은 「주인 자리(photoOwner)에 적는다」이지 그 해를
     어디서 얻느냐가 아니다. 고정 폭 slice 도 cutFn 으로 바꿨다 — 함수가 길어지면
     창이 끝에 못 닿는다(tests/test-cut-truncation 이 그것을 잡는다). */
  const fn = cutFn(html, 'function sendCoInfo(');
  assert.match(fn, /saveRead\([A-Za-z]+, id, read, photoOwner\(id\)\)/,
    '★ 주인 자리에 안 적으면 주인 화면엔 「아직 안 보냄」으로 남아 또 보냅니다');
});

test('어느 서류에서 온 값인지 남긴다', async () => {
  /* 값만 옮기면 「이 숫자 어디서 봤더라」에 답할 수 없다 — 사진첩에 그 서류가
     그대로 있는데도 다시 찾아 헤매게 된다(대표 지시 2026-08-13). */
  const c = load({});
  await c.sendToCoInfo({ fields: FORM, byName:'권형하', photo:{ year:'2026', id:'p1', owner:'u1' } });
  const v = c._writes[0].val;
  const k = Object.keys(v).find(x => x.indexOf('docs/') === 0);
  assert.ok(k, '서류 기록을 안 남겼다');
  assert.equal(v[k].id, 'p1');
  assert.equal(v[k].year, '2026');
  assert.equal(v[k].owner, 'u1');
  assert.equal(v[k].by, '권형하');
  assert.ok(v[k].at > 0);
});

test('서류는 사진마다 한 줄씩 쌓인다', async () => {
  /* 한 회사에 서류가 여러 장 온다. 나중 것이 앞 것을 지우면 이력이 사라진다. */
  const c = load({ docs:{ '2025_p9':{ name:'사업자등록증', id:'p9' } } });
  await c.sendToCoInfo({ fields: FORM, photo:{ year:'2026', id:'p1' } });
  const keys = Object.keys(c._writes[0].val).filter(x => x.indexOf('docs/') === 0);
  assert.deepEqual(keys, ['docs/2026_p1'], '앞 서류를 덮었거나 새 것을 안 남겼다');
});

test('같은 사진을 두 번 보내도 줄이 늘지 않는다', async () => {
  const c = load({ docs:{ '2026_p1':{ name:'서식', id:'p1' } }, docName:'기술·경영 혁신 지원신청서',
                   tags:{'기술·경영 혁신 지원신청서':true} });
  const r = await c.sendToCoInfo({ fields: { bizno:FORM.bizno, docName:'기술·경영 혁신 지원신청서' },
                                   photo:{ year:'2026', id:'p1' } });
  assert.equal(c._writes.length, 0, '같은 사진인데 또 썼다');
  assert.match(r.message, /이미 다 들어 있습니다/);
});

test('사진 번호가 없으면 서류 기록도 안 남긴다', async () => {
  /* 옛 방식으로 보낸 것에는 사진 번호가 없다 — 없는 채로 빈 줄을 만들면 안 된다 */
  const c = load({});
  await c.sendToCoInfo({ fields: FORM });
  const k = Object.keys(c._writes[0].val).find(x => x.indexOf('docs/') === 0);
  assert.equal(k, undefined);
});

test('사진첩이 사진 번호·연도·주인을 함께 넘긴다', () => {
  /* ⚠ 예전에는 앞 900자만 봤다(함수는 1,178자) — 함수를 통째로 본다.
     ⚠ 2026-08-23: 해를 gridYear 로 박아 두지 않는다 — 자동 보내기가 붙으면서
       sendCoInfo 가 year 를 받게 되었다(화면의 해로 짐작하면 다른 해 사진의 기록이
       엉뚱한 자리에 적힌다). 지킬 것은 「셋을 함께 넘긴다」이다. */
  /* ⚠ 2026-08-28: CMS 신청서가 붙으면서 함수가 둘로 갈렸다 — sendCoInfo 는 «어느 회사인지»를
     갖추고(그 서식엔 사업자번호가 없어 업체명으로 찾는다), 실제로 보내는 것은
     sendCoInfoWith 다. 지킬 것은 그대로 「셋을 함께 넘긴다」이다. */
  const fn = cutFn(html, 'function sendCoInfoWith(');
  assert.ok(fn, 'sendCoInfoWith 를 찾지 못했습니다');
  assert.match(fn, /photo: \{ year: [A-Za-z]+, id: id, owner: photoOwner\(id\)/,
    '★ 어느 사진에서 온 값인지 안 남기면 나중에 그 서류를 못 찾습니다');
  /* 그리고 그 해가 «주어진 것»부터 쓰는지 — 화면의 해는 마지막 수단이어야 한다. */
  assert.match(cutFn(html, 'function sendCoInfo('), /const yr = year \|\|/,
    '★ 화면의 해부터 쓰면 다른 해 사진에서 어긋납니다');
});
