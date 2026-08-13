/* 사진첩 → 기업정보 보내기.
   서식·신청서는 여기 말고는 갈 곳이 없었다 — 18개 칸을 읽어 놓고도 어디에도 안 남았다.
   저장소를 진짜 Firebase 없이 돌리려고 가짜 db 를 만들어 넣는다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

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
const FORM = { bizno:'134-86-05772', company:'신성컨트롤(주)', ceo:'조성환',
  corpno:'110111-2867195', docName:'기술·경영 혁신 지원신청서', applyNo:'2026-5',
  applyItems:'가드레일, 크래쉬쿠션, 태양광', applyField:'인사·조직', applyDate:'2026-03-15',
  dueDays:'60일', homepage:'www.sscontrol.co.kr/', email:'jhw@sscontrol.co.kr' };

test('사업자번호를 열쇠로 회사 자리에 넣는다', async () => {
  /* 명함첩 기업정보 화면도 같은 열쇠로 회사를 가른다 — 어긋나면 엉뚱한 회사에 붙는다 */
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

test('채울 것이 없으면 쓰지 않는다', async () => {
  const c = load({ docName:'이미 있음' });
  const r = await c.sendToCoInfo({ fields: { bizno:FORM.bizno, docName:'같은 것' } });
  assert.equal(c._writes.length, 0);
  assert.match(r.message, /이미 다 들어 있습니다/);
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
test('사업자번호를 못 읽었으면 단추를 안 띄우고 까닭을 말한다', () => {
  /* 아무 말 없이 단추만 없으면 「왜 안 되지」로 시간을 버린다 */
  assert.match(html, /function canSendCoInfo/);
  assert.match(html, /사업자번호를 읽지 못해 기업정보로 보낼 수 없습니다/);
});

test('한 번 보낸 사진은 다시 안 보낸다', () => {
  assert.match(html, /if \(read\.filedInfo && read\.filedInfo\.at\) return false/);
});

test('보낸 표시는 사진 주인 자리에 남긴다', () => {
  /* 남의 사진을 관리자가 보냈을 때 내 자리에 쓰면 주인 화면엔 「아직 안 보냄」으로 남아 또 보낸다 */
  const at = html.indexOf('function sendCoInfo(');
  assert.match(html.slice(at, at + 1400), /saveRead\(gridYear, id, read, photoOwner\(id\)\)/);
});
