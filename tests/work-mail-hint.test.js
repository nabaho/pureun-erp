'use strict';
// 푸른 메일함에서 들어온 메일을 업무 옆에 붙인다 — node --test tests/work-mail-hint.test.js
//
// ⚠ 먼저 알아야 할 것 — 여기에는 «메일 본문이 없다».
//   푸른 메일의 수신함(paydata/maillog)은 사본이 아니라 「서버가 무엇을 보았나」는
//   기록이다. 한 줄에 보낸이·제목·미리보기 몇 줄·시각뿐이고 본문은 다음메일에 있다.
//   그래서 이 기능이 하는 일은 «요약»이 아니라 «있었다는 것을 알려 주기»다.
//
// 이 검사가 지키는 것
//   ① 남의 메일이 남의 업무에 붙지 않는다 (공용 도메인·한 글자 회사명)
//   ② 못 읽어도 화면이 멀쩡하다 (콘솔 규칙이 없으면 못 읽는다)
//   ③ 「요약」인 척하지 않는다 — 본문이 없다고 화면이 말한다
//   ④ 읽기만 한다
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const W = fs.readFileSync(path.join(__dirname, '..', 'work.html'), 'utf8').replace(/\r\n/g, '\n');
const CSS = W.slice(W.indexOf('<style>') + 7, W.indexOf('</style>'));

function grab(name){
  const i = W.indexOf('function ' + name + '(');
  assert.ok(i >= 0, '못 찾음: ' + name);
  let d = 0, j = i;
  for(;;j++){ if(W[j] === '{') d++; else if(W[j] === '}'){ d--; if(!d){ j++; break; } } }
  return W.slice(i, j);
}

function makeBox(opts){
  opts = opts || {};
  const log = { added:[], set:[], removed:[], toast:[] };
  const box = {
    console, Date, String, Number, Array, Object, isNaN,
    mailSrc: opts.mail === undefined ? [] : opts.mail,
    mailchk: JSON.parse(JSON.stringify(opts.chk || {})),
    NS: 'work_erp',
    S: { me:{ sid:'P-001', name:'권형하' }, drawerId:null },
    todayStr: () => '2026-08-27',
    toast(m){ log.toast.push(String(m)); },
    route(){}, renderDrawer(){},
    addLog(id, t, d, k){ log.added.push({ id, t, d, k }); return Promise.resolve(opts.logOk !== false); },
    fbDb: { ref(p){ return {
      set(v){ log.set.push({ p, v });
        return opts.setOk === false ? Promise.reject(new Error('막힘')) : Promise.resolve(); },
      remove(){ log.removed.push(p); return Promise.resolve(); }
    }; } },
    _normCo: s => String(s || '').replace(/\(주\)|㈜|주식회사|\(유\)|유한회사|[\s·.,\-()]/g, '').toLowerCase(),
    esc: x => String(x == null ? '' : x).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])),
    escJ: x => String(x == null ? '' : x).replace(/\\/g, '\\\\').replace(/'/g, "\\'"),
    hlp: k => '<span class="hlp" data-k="' + k + '">ⓘ</span>',
    // ⚠ 흉내라도 «그 업무의» 업체를 돌려줘야 한다 — 무엇을 물어도 같은 업체를 주면
    //   「남의 업무에 안 붙는다」를 검사할 수가 없다
    coFind: it => (opts.co && it && it.co_id === opts.co.id) ? opts.co : null,
    peRec: () => (opts.pe || null),
    _cList: o => (o && o.contacts) || []
  };
  box.window = box;
  vm.createContext(box);
  vm.runInContext(
    W.match(/var MAIL_PUBLIC=\{[^}]*\};/)[0] + '\n'
    + grab('_mailAddr') + '\n' + grab('_mailDom') + '\n' + grab('mailKeysOf') + '\n'
    + grab('mailFor') + '\n' + grab('_mailWhen') + '\n'
    + grab('mailBrief') + '\n' + grab('mailLogLine') + '\n' + grab('mailKey') + '\n' + grab('mailChk') + '\n'
    + grab('mailSee') + '\n' + grab('mailUnsee') + '\n' + grab('mailNew') + '\n'
    + grab('dMailHTML') + '\n' + grab('mailFlag') + '\n'
    + 'this.keys=mailKeysOf; this.forIt=mailFor; this.flag=mailFlag; this.block=dMailHTML;'
    + 'this.brief=mailBrief; this.logLine=mailLogLine; this.see=mailSee; this.unsee=mailUnsee;'
    + 'this.fresh=mailNew;', box);
  box._log = log;
  return box;
}

const 메일 = [
  { at:1756000000000, from:'kim@gana.co.kr',    subject:'자료 보냅니다',   preview:'요청하신 임금대장…', took:2 },
  { at:1755900000000, from:'㈜가나 <hr@gana.co.kr>', subject:'회신',      preview:'검토했습니다' },
  { at:1755800000000, from:'someone@naver.com', subject:'㈜가나전자 문의', preview:'안녕하세요' },
  { at:1755700000000, from:'other@dara.kr',     subject:'다라 건',        preview:'확인 바랍니다' },
  { at:1755600000000, from:'spam@naver.com',    subject:'광고',           preview:'특가' }
];

const 업무 = { company:'㈜가나', co_id:'co-1' };
const 업체 = { id:'co-1', name:'㈜가나', contacts:[{ name:'김', email:'kim@gana.co.kr' }] };

/* ══════════════════════════════════════
   ① 이어 붙는 기준
   ══════════════════════════════════════ */
test('보낸이 주소가 그 업체 담당자면 붙는다', () => {
  const b = makeBox({ mail:메일, co:업체 });
  const got = Array.from(b.forIt(업무)).map(m => m.subject);
  assert.ok(got.indexOf('자료 보냅니다') >= 0);
});

test('회사 도메인이 같으면 붙는다 — 담당자가 여럿이어도 놓치지 않는다', () => {
  const b = makeBox({ mail:메일, co:업체 });
  assert.ok(Array.from(b.forIt(업무)).some(m => m.subject === '회신'));
});

test('이름이 붙어 온 주소에서도 메일 주소만 읽어 낸다', () => {
  const b = makeBox({});
  assert.equal(b._mailAddr('㈜가나 <hr@gana.co.kr>'), 'hr@gana.co.kr');
  assert.equal(b._mailAddr('KIM@GANA.CO.KR'), 'kim@gana.co.kr');
  assert.equal(b._mailAddr(''), '');
  assert.equal(b._mailAddr(null), '');
});

test('제목에 회사 이름이 나오면 붙는다 — 표기가 달라도 같은 회사로 본다', () => {
  const b = makeBox({ mail:메일, co:업체 });
  // 「㈜가나전자 문의」 — 회사 이름 「가나」가 들어 있다
  assert.ok(Array.from(b.forIt(업무)).some(m => m.subject === '㈜가나전자 문의'));
});

/* ══════════════════════════════════════
   ② 남의 메일이 안 붙는다
   ══════════════════════════════════════ */
test('⚠ 공용 메일 도메인은 업체 표식이 못 된다 — naver.com 하나로 묶으면 남의 메일이 다 붙는다', () => {
  const b = makeBox({ mail:메일, co:{ id:'co-2', name:'다라', contacts:[{ email:'sales@naver.com' }] } });
  const k = b.keys({ company:'다라' });
  assert.equal(Object.keys(Array.from(Object.keys(k.doms))).length, 0, 'naver.com 이 도메인 표식에 들어갔다');
});

test('남의 회사 메일은 안 붙는다', () => {
  const b = makeBox({ mail:메일, co:업체 });
  assert.ok(!Array.from(b.forIt(업무)).some(m => m.subject === '다라 건'));
});

test('광고 메일은 안 붙는다 — 회사 이름도 도메인도 안 맞는다', () => {
  const b = makeBox({ mail:메일, co:업체 });
  assert.ok(!Array.from(b.forIt(업무)).some(m => m.subject === '광고'));
});

test('⚠ 한 글자 회사명으로는 이름을 안 맞춘다 — 아무 제목에나 걸린다', () => {
  const b = makeBox({ mail:[{ at:1, from:'x@zzz.com', subject:'가나다라마' }] });
  assert.equal(Array.from(b.forIt({ company:'가' })).length, 0);
});

test('회사 이름도 이메일도 없으면 아무것도 안 붙는다', () => {
  const b = makeBox({ mail:메일 });
  assert.equal(Array.from(b.forIt({ company:'' })).length, 0);
});

test('미리보기(preview)로는 안 맞춘다 — 본문 비슷한 것에 걸리면 남의 메일이 딸려 온다', () => {
  const b = makeBox({ mail:[{ at:1, from:'x@zzz.com', subject:'문의', preview:'㈜가나 관련해서요' }] });
  assert.equal(Array.from(b.forIt(업무)).length, 0);
});

/* ══════════════════════════════════════
   ③ 못 읽어도 멀쩡하다
   ══════════════════════════════════════ */
test('아직 안 읽었으면 블록을 아예 안 그린다 — 「없음」이라고 거짓말하지 않는다', () => {
  const b = makeBox({ mail:undefined });          // mailSrc = null 인 상태를 흉내
  b.mailSrc = null;
  assert.equal(b.block(업무), '');
});

test('못 읽었으면(규칙 없음) 빈 목록이 되고 화면은 그대로 돈다', () => {
  const b = makeBox({ mail:[] });
  assert.equal(b.block(업무), '');
  assert.equal(b.flag(업무), '');
});

test('읽는 곳이 실패를 삼킨다 — 콘솔 규칙이 없어도 앱이 안 멈춘다', () => {
  const L = grab('mailLoad');
  assert.match(L, /\.catch\(function\(\)\{ mailSrc=\[\];/);
});

test('메일이 없으면 목록 표식도 없다 — 빈 ✉ 를 달지 않는다', () => {
  assert.equal(makeBox({ mail:메일, co:업체 }).flag({ company:'없는회사' }), '');
});

/* ══════════════════════════════════════
   ④ 「요약」인 척하지 않는다
   ══════════════════════════════════════ */
test('블록 제목이 「요약」이 아니다 — 요약할 본문이 없다', () => {
  const h = makeBox({ mail:메일, co:업체 }).block(업무);
  assert.match(h, /이 업체에서 온 메일/);
  assert.ok(h.indexOf('요약') < 0);
});

test('ⓘ 에 본문이 없다는 것과 어디서 봐야 하는지를 적어 둔다', () => {
  const H = W.slice(W.indexOf('var HELP={'), W.indexOf('function hlp('));
  assert.match(H, /<b>여기에는 본문이 없습니다/);
  assert.match(H, /다음메일<\/b>에서 하십시오/);
  assert.match(H, /남의 메일이 섞일 수 있습니다/, '붙는 기준이 넉넉하다는 것도 말해 준다');
});

test('제목·보낸이·때가 함께 나온다 — 보낸이를 봐야 남의 메일인지 안다', () => {
  const h = makeBox({ mail:메일, co:업체 }).block(업무);
  assert.match(h, /자료 보냅니다/);
  assert.match(h, /kim@gana\.co\.kr/);
  assert.match(h, /class="s"/);
});

test('자료가 담긴 메일은 그렇게 표시한다', () => {
  assert.match(makeBox({ mail:메일, co:업체 }).block(업무), /자료 2건 담김/);
});

test('너무 많으면 열 줄만 — 나머지는 몇 건인지만', () => {
  const many = [];
  for(let i = 0; i < 14; i++) many.push({ _k:'k' + i, at:i + 1, from:'a@gana.co.kr', subject:'메일' + i });
  const h = makeBox({ mail:many, co:업체 }).block(업무, 'W1');
  assert.equal((h.match(/class="mlrow"/g) || []).length, 10);
  assert.match(h, /외 4건/);
});

/* ══════════════════════════════════════════════════════════════════
   ⑥ 한 줄로 줄이기 — 「요약」이라고 부를 수 있는 것은 제목뿐이다
   ══════════════════════════════════════════════════════════════════ */
test('제목이 곧 한 줄이다 — 본문이 없으니 지어내지 않는다', () => {
  assert.equal(makeBox({}).brief({ subject:'취업규칙 개정 문의' }), '취업규칙 개정 문의');
});

test('대괄호 발송 표시는 뗀다 — 자리만 먹고 무슨 일인지는 안 알려 준다', () => {
  const b = makeBox({});
  assert.equal(b.brief({ subject:'[광고] 특가 안내' }), '특가 안내');
  assert.equal(b.brief({ subject:'[푸른노무법인][알림] 회신 바랍니다' }), '회신 바랍니다');
});

test('제목이 너무 짧으면 미리보기 앞머리를 조금 붙인다', () => {
  const t = makeBox({}).brief({ subject:'문의', preview:'취업규칙 관련해서 여쭙습니다' });
  assert.match(t, /문의 — 취업규칙 관련해서/);
});

test('⚠ 알찬 제목에는 미리보기를 안 붙인다 — 우리말 제목은 짧아도 다 말한다', () => {
  const t = makeBox({}).brief({ subject:'취업규칙 개정 문의', preview:'검토 부탁드립니다' });
  assert.equal(t, '취업규칙 개정 문의');
});

test('제목이 없으면 미리보기로, 그것도 없으면 그렇게 말한다', () => {
  const b = makeBox({});
  assert.equal(b.brief({ preview:'내용만 있습니다' }), '내용만 있습니다');
  assert.equal(b.brief({}), '(제목 없음)');
});

test('한 줄은 짧게 자른다 — 기록 한 줄이 화면을 넘기면 표가 무너진다', () => {
  const t = makeBox({}).brief({ subject:'가'.repeat(120) });
  assert.ok(t.length <= 47, '길이: ' + t.length);
  assert.match(t, /…$/);
});

test('기록 한 줄은 «언제 온 메일인지»를 앞에 세운다', () => {
  const b = makeBox({});
  const line = b.logLine({ at:new Date('2026-08-27T10:30:00').getTime(), subject:'취업규칙 문의' });
  assert.match(line, /^✉ 8\.27 메일 — 취업규칙 문의$/);
});

/* ══════════════════════════════════════════════════════════════════
   ⑦ 담당자가 체크한다
   ══════════════════════════════════════════════════════════════════ */
const 한통 = [{ _k:'m1', at:new Date('2026-08-27T09:00:00').getTime(),
  from:'kim@gana.co.kr', subject:'취업규칙 개정 문의', preview:'검토 부탁드립니다' }];

test('[기록에 담기] 를 누르면 그 주 기록에 한 줄이 들어간다', () => {
  const b = makeBox({ mail:한통, co:업체 });
  b.see('W1', 'm1', 1);
  assert.equal(b._log.added.length, 1);
  assert.equal(b._log.added[0].id, 'W1');
  assert.match(b._log.added[0].t, /^✉ 8\.27 메일 — 취업규칙 개정 문의$/);
  assert.equal(b._log.added[0].k, 'mail', '나중에 걸러 볼 수 있게 종류를 남긴다');
});

test('⚠ 기록이 먼저다 — 기록이 안 되면 「담김」으로 표시하지 않는다', async () => {
  const b = makeBox({ mail:한통, co:업체, logOk:false });
  b.see('W1', 'm1', 1);
  await new Promise(r => setTimeout(r, 0));
  assert.equal(b._log.set.length, 0, '기록도 못 했는데 담긴 것으로 표시했다');
});

test('[확인만] 은 기록을 안 남긴다 — 기록할 것이 없는 메일이 있다', () => {
  const b = makeBox({ mail:한통, co:업체 });
  b.see('W1', 'm1', 0);
  assert.equal(b._log.added.length, 0);
  assert.equal(b._log.set.length, 1);
  assert.ok(!b._log.set[0].v.log);
});

test('누가 언제 확인했는지 남긴다', () => {
  const b = makeBox({ mail:한통, co:업체 });
  b.see('W1', 'm1', 0);
  const v = b._log.set[0].v;
  assert.equal(v.by, 'P-001');
  assert.equal(v.byName, '권형하');
  assert.ok(v.at);
});

test('⚠ 확인 표시는 «메일»에 붙는다 — 업무마다 두면 한 통을 여러 번 확인해야 한다', () => {
  const b = makeBox({ mail:한통, co:업체 });
  b.see('W1', 'm1', 0);
  assert.equal(b._log.set[0].p, 'work_erp/mailchk/m1');
});

test('없는 메일을 확인하라고 하면 조용히 지나가지 않는다', () => {
  const b = makeBox({ mail:한통, co:업체 });
  b.see('W1', '없는키', 0);
  assert.equal(b._log.set.length, 0);
  assert.match(b._log.toast.join(''), /메일을 찾지 못했습니다/);
});

test('되돌리기는 확인 표시만 지운다 — 이미 남긴 기록은 그대로 둔다', () => {
  const b = makeBox({ mail:한통, co:업체, chk:{ m1:{ by:'P-001', log:1 } } });
  b.unsee('m1');
  assert.equal(b._log.removed.join(','), 'work_erp/mailchk/m1');
  assert.equal(b._log.added.length, 0, '기록을 건드렸다');
});

/* ══════════════════════════════════════════════════════════════════
   ⑧ 안 본 것이 눈에 띈다
   ══════════════════════════════════════════════════════════════════ */
test('목록의 ✉ 숫자는 «아직 안 본» 것만 센다 — 전부 세면 확인해도 안 줄어든다', () => {
  const two = [한통[0], { _k:'m2', at:2, from:'hr@gana.co.kr', subject:'회신' }];
  assert.match(makeBox({ mail:two, co:업체 }).flag(업무), /✉ 2/);
  assert.match(makeBox({ mail:two, co:업체, chk:{ m1:{ by:'x' } } }).flag(업무), /✉ 1/);
  assert.equal(makeBox({ mail:two, co:업체, chk:{ m1:{by:'x'}, m2:{by:'x'} } }).flag(업무), '');
});

test('상자 머리에 안 본 것이 몇 통인지 적는다', () => {
  const h = makeBox({ mail:한통, co:업체 }).block(업무, 'W1');
  assert.match(h, /안 본 1/);
});

test('안 본 것이 위로 온다 — 그것이 이 상자를 여는 까닭이다', () => {
  const two = [{ _k:'old', at:9, from:'kim@gana.co.kr', subject:'먼저온것' },
               { _k:'new', at:1, from:'kim@gana.co.kr', subject:'나중것' }];
  const h = makeBox({ mail:two, co:업체, chk:{ old:{ by:'x' } } }).block(업무, 'W1');
  assert.ok(h.indexOf('나중것') < h.indexOf('먼저온것'), '확인한 것이 위에 있다');
});

test('확인한 줄은 흐리게 두되 지우지 않는다 — 「무엇을 봤는지」도 자료다', () => {
  const h = makeBox({ mail:한통, co:업체, chk:{ m1:{ by:'x', byName:'권형하', at:'2026-08-27T00:00:00' } } })
    .block(업무, 'W1');
  assert.match(h, /class="mlrow seen"/);
  assert.match(h, /✓ 확인함/);
  assert.match(h, /권형하/);
});

test('기록에 담은 것과 확인만 한 것을 갈라 적는다', () => {
  const h = makeBox({ mail:한통, co:업체, chk:{ m1:{ by:'x', log:1, at:'2026-08-27T00:00:00' } } })
    .block(업무, 'W1');
  assert.match(h, /✎ 기록에 담김/);
});

test('아직 안 본 줄에만 단추가 있다', () => {
  const h1 = makeBox({ mail:한통, co:업체 }).block(업무, 'W1');
  assert.match(h1, /✎ 기록에 담기/);
  assert.match(h1, /✓ 확인만/);
  const h2 = makeBox({ mail:한통, co:업체, chk:{ m1:{ by:'x' } } }).block(업무, 'W1');
  assert.ok(h2.indexOf('✎ 기록에 담기') < 0);
});

test('단추에 무엇이 기록될지 미리 적어 둔다 — 눌러 보고 알면 늦다', () => {
  const h = makeBox({ mail:한통, co:업체 }).block(업무, 'W1');
  assert.match(h, /title="[^"]*✉ 8\.27 메일 — 취업규칙 개정 문의/);
});

/* ══════════════════════════════════════════════════════════════════
   ⑨ 쉽게 찾을 수 있다
   ══════════════════════════════════════════════════════════════════ */
test('기록으로 들어가므로 이미 있는 검색·주간표·팀 전체가 그대로 훑는다', () => {
  // 표식(✉)을 «글자»로 넣는다 — 그래야 네 군데 그리는 곳을 안 고쳐도 어디서나 보인다
  assert.match(grab('mailLogLine'), /'✉ '\+/);
});

test('확인 표시는 함께 본다 — 남이 확인하면 내 ✉ 숫자도 줄어야 한다', () => {
  assert.match(W, /watchMapChildren\(NS\+'\/mailchk'/);
});

test('업무 번호를 받아서 쓴다 — it._id 는 비어 있을 수 있다', () => {
  assert.match(grab('dMailHTML'), /function dMailHTML\(it,itemId\)\{/);
  assert.match(grab('dMailHTML'), /var id=itemId\|\|it\._id;/);
});

/* ══════════════════════════════════════
   ⑤ 읽기만 한다 · 화면에 달려 있다
   ══════════════════════════════════════ */
test('메일함에 쓰지 않는다 — 답장·삭제·읽음은 다음메일이 진짜다', () => {
  const L = grab('mailLoad');
  ['set(', 'update(', 'remove(', 'push('].forEach(t =>
    assert.ok(L.indexOf(t) < 0, '쓰기(' + t + ')가 들어 있다'));
  assert.match(L, /\.once\('value'\)/);
});

test('한 번에 다 읽지 않는다 — 최근 것만 (트래픽·요금)', () => {
  assert.match(grab('mailLoad'), /limitToLast\(MAIL_MAX\)/);
  assert.match(W, /MAIL_MAX=300/);
});

test('내 업무와 팀 전체 두 곳에 표식이 붙는다', () => {
  assert.equal((W.match(/\+mailFlag\(it\)/g) || []).length, 2);
});

test('드로어에 블록이 붙는다', () => {
  assert.match(W, /h\+=dMailHTML\(it,id\);/);
});

test('업체 목록을 먼저 받고 읽는다 — 이름표가 없으면 이어 붙일 수가 없다', () => {
  assert.match(W, /coLoad\(\)\.then\(mailLoad\)/);
});

test('첫 화면을 붙잡지 않는다 — 다 읽은 뒤에 한 번 다시 그린다', () => {
  const i = W.indexOf('coLoad().then(mailLoad)');
  const 조각 = W.slice(i, i + 300);
  assert.match(조각, /if\(mailSrc&&mailSrc\.length\)\{ route\(\);/);
  assert.match(조각, /catch\(function\(\)\{\}\)/);
});

test('모양이 CSS에 있다', () => {
  ['.mlf{', '.mlrow{', '.mlrow .t{', '.mlrow .p{'].forEach(c =>
    assert.ok(CSS.indexOf(c) >= 0, c + ' 없음'));
});
