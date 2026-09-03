/* 메일함에서 푸른이알피 담당자 메일 채우기 (대표 물음·승인 2026-09-03, 목업 ㉮)
   「메일함에서 찾아서 푸른이알피의 담당자 메일을 입력할 수 있을까.
     메일 주고받는 것은 많은데 제대로 정리가 안 되어 있다」

   ★ 왜 정리가 안 됐나 — 할 일이 어디 있는지 보여 주는 화면(자문사 이메일 잇기,
     담당 모름 1,582곳)은 «명함첩 안»(config/mailCo)에만 적었고, 푸른이알피에 진짜로
     적는 기능(🏢 새 담당자 등록)은 «메일 한 통 읽는 화면»에만 있었다.
     그래서 「자문사로 이은 주소 0개」였다 — 아무도 안 썼다.

   지키는 것.
   ① 쓰는 자리는 «하나»다 — 두 화면이 같은 erpFillContact 를 쓴다
   ② 이미 적힌 담당자 메일은 «안 덮는다» — 그런데 «실패»도 아니다
   ③ 대표 담당자 거울 칸은 «빈 칸만» 채운다
   ④ 이름이 겹치는 업체에는 «안 적는다» — 엉뚱한 회사에 붙으면 메일이 통째로 샌다
   ⑤ 도메인으로 이은 것은 «안 적는다» — 「@회사.kr 전체」는 사람 한 명이 아니다
   ⑥ 업체는 «열쇠(id)»로 잡는다 — 온톨로지 규칙(업체명을 관계 열쇠로 쓰지 않는다)
   ⑦ 「누가·언제·어디서」를 남긴다 — 되돌리려면 가려낼 수 있어야 한다
   ⑧ 기본이 «켜짐»이다 — 끄는 것이 예외여야 실제로 채워진다 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { sliceFn } = require('./fnslice.js');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'pu-cards.html'), 'utf8');
const code = app.replace(/\/\*[\s\S]*?\*\//g, ' ');
const flush = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };

/* 진짜 erpFillContact 를 태운다 — 가짜 실시간DB 로 «무엇이 적히는지»를 본다 */
function boot(o) {
  const opt = o || {};
  const wrote = [];
  const cos = opt.companies || [{ id: 'co1', name: '맘스터치', contacts: [] }];
  const ctx = {
    Object, String, Number, Array, JSON, Date, Math, Promise, console,
    toast(){}, mbWhoBust(){}, mbCardsRevBump(){}, renderPCSide(){}, renderMailPage(){},
    ErpMatch: { load(){}, companies: cos, _norm: (s)=>String(s||'').replace(/\s/g,'') },
    firebase: {
      auth: () => ({ currentUser: opt.noUser ? null : { email: 'me@pureun.kr' } }),
      database: () => ({
        ref: (p) => ({
          once: async () => { ctx.reads++;
            return { val: () => ({ v: cos.reduce((m,c)=>{ m[c.id]=c; return m; }, {}) }) }; },
          update: async (up) => { wrote.push(up); Object.assign(cos.filter(c=>c.id==='co1')[0]||{}, {}); },
        }),
      }),
    },
    wrote, reads: 0,
  };
  vm.createContext(ctx);
  vm.runInContext(sliceFn(app, 'async function erpFillContact('), ctx);
  return ctx;
}
const written = (c) => (c.wrote[0] ? c.wrote[0]['data/companies/v/co1'] : null);

/* ══════ ② 안 덮는다 ══════ */

test('★★ 이미 적힌 담당자 메일은 «안 덮는다» — 남이 고쳐 둔 것이 사라지면 안 된다', async () => {
  const c = boot({ companies: [{ id:'co1', name:'맘스터치',
    contacts:[{ email:'kim@momstouch.co.kr', name:'김민수' }] }] });
  const r = await c.erpFillContact({ coId:'co1', email:'kim@momstouch.co.kr', name:'딴사람' });
  assert.equal(r.ok, true, '실패로 처리했습니다');
  assert.equal(r.added, false, '이미 있는데 또 적었습니다');
  assert.equal(c.wrote.length, 0, '이미 있는데 실시간DB 에 썼습니다');
});

test('★★ 이미 있는 것은 «실패가 아니다» — 한꺼번에 적을 때 다 틀린 것처럼 보인다', async () => {
  const c = boot({ companies: [{ id:'co1', name:'맘스터치', contacts:[{ email:'a@b.c' }] }] });
  const r = await c.erpFillContact({ coId:'co1', email:'a@b.c' });
  assert.equal(r.ok, true, 'ok:false 로 돌려주면 부르는 쪽이 「못 적었다」고 말합니다');
});

/* ══════ ③ 빈 칸만 ══════ */

test('★★ 대표 담당자 «메일»이 적혀 있으면 안 덮는다', async () => {
  const c = boot({ companies: [{ id:'co1', name:'맘스터치', contacts:[],
    primaryContactEmail:'old@momstouch.co.kr', primaryContactName:'옛담당' }] });
  await c.erpFillContact({ coId:'co1', email:'new@momstouch.co.kr', name:'새담당' });
  const w = written(c);
  assert.equal(w.primaryContactEmail, 'old@momstouch.co.kr', '적혀 있던 대표 메일을 덮었습니다');
  assert.equal(w.contacts.length, 1, '담당자 줄은 늘어야 합니다');
});

test('★★ 메일 칸은 비었는데 «이름»만 적혀 있으면 — 메일만 채우고 이름은 안 덮는다', async () => {
  /* ⚠ 앞 검사만으로는 이 자리를 «밟지 못한다» — 메일이 이미 있으면 이름 줄까지 통째로
       건너뛰기 때문이다. 그래서 이름 보호를 떼어내도 그냥 지나갔다(이빨 확인이 잡음). */
  const c = boot({ companies: [{ id:'co1', name:'맘스터치', contacts:[],
    primaryContactEmail:'', primaryContactName:'옛담당', primaryContactPhone:'010-1111-2222' }] });
  await c.erpFillContact({ coId:'co1', email:'new@momstouch.co.kr', name:'새담당', phone:'010-9999-8888' });
  const w = written(c);
  assert.equal(w.primaryContactEmail, 'new@momstouch.co.kr', '빈 메일 칸을 안 채웠습니다');
  assert.equal(w.primaryContactName, '옛담당', '적혀 있던 대표 이름을 덮었습니다');
  assert.equal(w.primaryContactPhone, '010-1111-2222', '적혀 있던 전화를 덮었습니다');
});

test('★ 비어 있으면 «채운다» — 안 채우면 이 일을 한 보람이 없다', async () => {
  const c = boot();
  await c.erpFillContact({ coId:'co1', email:'kim@momstouch.co.kr', name:'김민수' });
  const w = written(c);
  assert.equal(w.primaryContactEmail, 'kim@momstouch.co.kr', '빈 칸을 안 채웁니다');
  assert.equal(w.primaryContactName, '김민수');
});

/* ══════ ⑦ 누가·언제·어디서 ══════ */

test('★★ 「누가·언제·어디서」를 남긴다 — 되돌리려면 가려낼 수 있어야 한다', async () => {
  const c = boot();
  await c.erpFillContact({ coId:'co1', email:'kim@momstouch.co.kr', from:'mail-link' });
  const add = written(c).contacts[0];
  assert.equal(add.addedFrom, 'mail-link', '어디서 적은 것인지 안 남깁니다');
  assert.equal(add.addedBy, 'me@pureun.kr', '누가 적었는지 안 남깁니다');
  assert.ok(Number(add.addedAt) > 0, '언제 적었는지 안 남깁니다');
});

test('★ 로그인이 없거나 업체 열쇠가 없으면 «안 적는다» — 회사 4,000곳을 읽지도 않는다', async () => {
  /* ⚠ 「ok:false 인가」만 보면 모자란다 — 열쇠 검사를 떼어내도 「업체를 못 찾았다」로
       ok:false 가 되어 그냥 지나간다(이빨 확인이 잡음). 그러니 «읽지도 않았는가»를 본다.
       회사 표는 4,000곳이라, 부를 까닭이 없을 때 읽는 것 자체가 그대로 요금이다. */
  const a = boot({ noUser:true });
  assert.equal((await a.erpFillContact({ coId:'co1', email:'a@b.c' })).ok, false);
  assert.equal(a.reads, 0, '로그인도 없는데 회사 표를 읽었습니다');

  const b = boot();
  assert.equal((await b.erpFillContact({ coId:'', email:'a@b.c' })).ok, false, '열쇠 없이 적습니다');
  assert.equal(b.reads, 0, '업체 열쇠가 없는데 회사 표를 읽었습니다');

  const c = boot();
  assert.equal((await c.erpFillContact({ coId:'co1', email:'없는주소' })).ok, false, '이상한 주소를 적습니다');
  assert.equal(c.reads, 0, '주소가 이상한데 회사 표를 읽었습니다');
});

/* ══════ ①④⑤⑥⑧ 이은 자리에서 부르는 길 ══════ */

test('★★ 쓰는 자리는 «하나»다 — 두 화면이 같은 함수를 쓴다', () => {
  const link = sliceFn(app, 'function mbErpFillFrom(').replace(/\/\*[\s\S]*?\*\//g, ' ');
  const read = sliceFn(app, 'async function mbNewSave(').replace(/\/\*[\s\S]*?\*\//g, ' ');
  assert.match(link, /erpFillContact\(/, '잇기 화면이 딴 길로 적습니다');
  assert.match(read, /erpFillContact\(/, '읽는 화면이 딴 길로 적습니다');
  /* 읽는 화면이 제 손으로 실시간DB 를 만지면 두 벌이 된다 */
  assert.ok(!/data\/companies\/v\//.test(read), '읽는 화면이 아직 제 손으로 씁니다 — 두 벌입니다');
});

test('★★ 이름이 «겹치는» 업체에는 안 적는다 — 엉뚱한 회사에 붙으면 메일이 통째로 샌다', () => {
  const f = sliceFn(app, 'function mbErpFillFrom(').replace(/\/\*[\s\S]*?\*\//g, ' ');
  assert.match(f, /same > 1/, '이름이 겹치는지 안 봅니다');
  assert.match(f, /ErpMatch\.companies/, '업체 전체를 안 세어 봅니다 — byName 은 하나만 들고 있습니다');
});

test('★★ 도메인으로 이은 것은 «안 적는다» — @회사.kr 전체는 사람 한 명이 아니다', () => {
  const f = sliceFn(app, 'function mbCoSet(').replace(/\/\*[\s\S]*?\*\//g, ' ');
  assert.match(f, /if\(!byDomain && mbErpFillOn\(\)\)/,
    '도메인으로 이어도 담당자 칸에 적습니다');
});

test('★★ 업체를 «열쇠(id)»로 담는다 — 이름만 담으면 온톨로지 규칙 위반이다', () => {
  const f = sliceFn(app, 'function mbCoSet(').replace(/\/\*[\s\S]*?\*\//g, ' ');
  assert.match(f, /id:\s*String\(\(rec && rec\.id\)/, '업체 열쇠를 안 담습니다');
  assert.match(f, /mbCfgSet\('mailCo', _mbCo, key, val/, '담는 값이 열쇠를 안 품습니다');
});

test('★★ 옛 칸(이름 글자)도 «그대로 산다» — 값이 두 꼴이라 읽는 자리가 다 지나야 한다', () => {
  const ctx = { String, Object };
  vm.createContext(ctx);
  vm.runInContext(sliceFn(app, 'function mbCoValName('), ctx);
  assert.equal(ctx.mbCoValName('맘스터치'), '맘스터치', '옛 꼴을 못 읽습니다');
  assert.equal(ctx.mbCoValName({ n:'맘스터치', id:'co1' }), '맘스터치', '새 꼴을 못 읽습니다');
  assert.equal(ctx.mbCoValName(null), '', '빈 칸에서 터집니다');
  /* 값을 읽는 «모든» 자리가 이 문을 지나는가 */
  assert.ok(!/ErpMatch\._norm\(_mbCo\[k\]\)/.test(code),
    '한 자리가 아직 값을 날로 읽습니다 — 새로 이은 것이 거기서 안 잡힙니다');
});

test('★★ 새로 지은 이름이 «이미 있는 것과 안 겹친다» — 겹치면 뒤엣것이 이겨 조용히 돈다', () => {
  /* ⚠ 실제로 그랬다(2026-09-03) — mbCoNameOf 로 지었더니 「이 주소의 회사 이름」과
       겹쳤다. 그것은 제 안에서 mbCoOf 를 부르므로 서로를 부르며 스택이 넘쳤고,
       구문오류 하나 없이 검사 196개가 한꺼번에 깨졌다. */
  ['mbCoValName', 'mbCoIdOf', 'erpFillContact', 'mbErpFillOn', 'mbErpFillSet', 'mbErpFillFrom']
    .forEach(n => {
      const hits = (code.match(new RegExp('function\\s+' + n + '\\s*\\(', 'g')) || []).length;
      assert.equal(hits, 1, n + ' 이(가) ' + hits + '번 선언돼 있습니다 — 한 파일에 한 번이어야 합니다');
    });
});

test('★★ 기본이 «켜짐»이다 — 끄는 것이 예외여야 실제로 채워진다', () => {
  const ctx = { localStorage: { getItem: () => null } };
  vm.createContext(ctx);
  vm.runInContext(app.match(/const MB_ERPFILL_LS\s*=[^;]*;/)[0], ctx);
  vm.runInContext(sliceFn(app, 'function mbErpFillOn('), ctx);
  assert.equal(ctx.mbErpFillOn(), true, '기본이 꺼져 있습니다 — 아무도 안 켜면 예전 그대로입니다');
  ctx.localStorage.getItem = () => '0';
  assert.equal(ctx.mbErpFillOn(), false, '꺼 두어도 켜진 것으로 봅니다');
});

test('★ 화면에 켜고 끄는 칸이 «하나» 있다 — 줄마다 두면 200줄이 어지럽다', () => {
  const s = sliceFn(app, 'function whoPageHtml(');
  const n = (s.match(/mbErpFillSet\(/g) || []).length;
  assert.equal(n, 1, '켜고 끄는 칸이 ' + n + '개입니다 — 화면에 하나여야 합니다');
  assert.match(s, /mbErpFillOn\(\)\?'checked'/, '지금 켜졌는지를 안 보여 줍니다');
});

test('★ 보낸이 이름을 «줄에서» 넘긴다 — 없는 표를 뒤지면 이름이 늘 빈 채로 들어간다', () => {
  const s = sliceFn(app, 'function whoPageHtml(');
  assert.match(s, /mbCoSet\('\$\{esc\(o\.e\)\}',this\.value,false,'\$\{esc\(o\.name\|\|''\)\}'\)/,
    '이름을 안 넘깁니다');
  const f = sliceFn(app, 'function mbErpFillFrom(');
  assert.ok(!/nameByAddr/.test(f), '있지도 않은 표(nameByAddr)를 뒤집니다');
});
