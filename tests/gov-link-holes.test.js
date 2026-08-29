/* 정부컨설팅의 «연결»에 난 구멍 (2026-08-29 대표 지시 검토)
   — 이알피 연결과 사진첩·창고 연결을 훑어 찾은 것들.

   ★ 여기서 못 박는 것은 «규칙» 이다. 이름·문구가 바뀌어도 규칙만 지키면 안 깨진다.

   찾은 구멍
   ① 저장하는 길이 둘인데 한쪽(💾 개별 저장)이 반쪽이었다 —
      창고에 안 올리고, 사진첩 「증빙으로 씀」 표도 안 붙였다.
      그 표가 없으면 **보유기준이 증빙 5년이 아니라 1년**으로 잡혀 일찍 지워진다.
   ② 지우는데 창고 사본이 남았다 — 다른 PC 에서 열면 **되살아난다**.
   ③ 일정·사업장을 영구삭제해도 창고 사진이 남았다.
   ④ 찍은 시각(m칸)이 일정 삭제 때 안 지워졌다.
   ⑤ 이알피 자료를 이 브라우저 사본으로 «무조건» 먼저 읽었다 —
      옛 판으로 부담당을 되돌리고 그것을 이알피에 도로 올려 새 값을 덮을 수 있었다.
   ⑥ 저장 형식을 «못 물어본 것»을 「아니다」로 기억해, 한 번 끊기면
      그 세션 내내 이알피에 아무것도 못 올렸다. */
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'gov-consulting.html'), 'utf8');
/* 주석을 먼저 걷는다 — 잘 쓴 주석이 검사를 통과시키면 안 된다 */
const bare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
const S = bare(SRC);

/* ⚠ 검사가 «조용히 눈을 감는» 자리 — 한 줄 주석 안에 블록 주석 시작 기호가 있으면,
     주석을 걷는 흔한 방식(블록을 먼저 지운다)이 그 기호를 열림으로 보고
     **다음 닫힘까지의 코드를 통째로 먹는다.** 그러면 그 구간을 보는 검사는
     「없다」가 아니라 「찾지 못했다」로도 안 걸리고 그냥 통과해 버린다.
     실제로 이 파일의 「Firebase(data 아래)」 한 줄이 그랬다(2026-08-29).
     이 저장소의 검사 22개가 같은 방식을 쓰므로, 여기서 못 박아 둔다. */
test('한 줄 주석 안에 블록 주석 시작 기호를 두지 않는다 — 검사가 눈을 감는다', () => {
  const bad = [];
  SRC.split(/\r?\n/).forEach((ln, i) => {
    const at = ln.search(/(^|[^:*/])\/\//);
    if (at < 0) return;
    if (ln.slice(at).includes('/' + '*')) bad.push((i + 1) + ': ' + ln.trim().slice(0, 70));
  });
  assert.deepStrictEqual(bad, [],
    '이 줄들이 주석 걷기를 망가뜨려, 뒤따르는 코드를 보는 검사가 조용히 통과합니다:\n' + bad.join('\n'));
});

/* 함수 하나를 글자로 떼어 온다 — 다음 함수 선언 앞까지 */
function fnBody(name) {
  /* ⚠ 이름이 «딱 그것»이어야 한다 — 그냥 찾으면 erpRead 가 erpReadLocal 에 걸린다 */
  const m = new RegExp('function\\s+' + name + '\\s*\\(').exec(S);
  const a = m ? m.index : -1;
  assert.ok(a > 0, name + ' 을(를) 찾지 못했다 — 이름이 바뀌었으면 이 검사도 함께 고칠 것');
  const b = S.indexOf('\nfunction ', a + 8);
  const c = S.indexOf('\nasync function ', a + 8);
  const ends = [b, c].filter((x) => x > a);
  return S.slice(a, ends.length ? Math.min.apply(null, ends) : a + 4000);
}

/* ══════ ① 저장하는 길은 하나뿐이다 ══════ */

test('증빙을 저장하는 길이 하나다 — 창고·사진첩 표를 빠뜨릴 자리가 없다', () => {
  const slot = fnBody('saveStampSlot');
  ['evUpload', 'markAlbumUsed', 'saveStampTime', 'markPlain', 'addPhotoHash', 'logPhoto']
    .forEach((must) => {
      assert.ok(new RegExp('\\b' + must + '\\s*\\(').test(slot),
        '온전한 저장 한 길에 ' + must + ' 이(가) 빠졌다');
    });
});

test('💾 개별 저장이 «따로» 저장하지 않는다 — 반쪽이 되는 자리가 여기였다', () => {
  const a = S.indexOf(".rf-save').onclick");
  assert.ok(a > 0, '개별 저장 단추를 찾지 못했다');
  const body = S.slice(a, S.indexOf(".rf-del').onclick"));
  assert.ok(/saveStampSlot\s*\(/.test(body),
    '개별 저장이 온전한 저장 한 길(saveStampSlot)을 부르지 않는다');
  assert.ok(!/savePhotoToDB\s*\(/.test(body),
    '개별 저장이 제 손으로 또 저장한다 — 두 길이 되면 반드시 한쪽만 고쳐지는 날이 온다');
});

/* ══════ ② 지우면 창고에서도 지운다 ══════ */

test('증빙 한 칸을 지우면 창고 사본도 지운다 — 안 지우면 되살아난다', () => {
  const del = fnBody('deleteStampSlot');
  assert.ok(/evRemove\s*\(/.test(del), '창고 사본을 안 지운다 — 다른 PC 에서 되살아난다');
  assert.ok(/plainKey\s*\(/.test(del) && /timeKey\s*\(/.test(del),
    '「안 찍음」 표와 찍은 시각도 함께 지워야 앞뒤가 맞는다');
});

test('지우는 자리가 모두 그 한 길을 쓴다', () => {
  ['.rf-del\').onclick', 'function delEditPhoto'].forEach((anchor) => {
    const a = S.indexOf(anchor);
    assert.ok(a > 0, anchor + ' 을(를) 찾지 못했다');
    const body = S.slice(a, a + 1400);
    assert.ok(/deleteStampSlot\s*\(/.test(body),
      anchor + ' 가 온전한 삭제 한 길(deleteStampSlot)을 안 쓴다');
  });
});

/* ══════ ③④ 일정을 통째로 지울 때 ══════ */

test('일정을 통째로 지우면 창고 사진도 지운다', () => {
  const f = fnBody('deletePhotoFromDB');
  assert.ok(/evRemove\s*\(/.test(f),
    '브라우저 안만 지우면 창고에 현장 사진이 남는다 — 「지웠다」는 말과 다르다');
});

test('일정을 통째로 지울 때 찍은 시각도 함께 지운다', () => {
  /* 칸 이름을 한 곳에서만 정하는가 — 두 곳에 적으면 한쪽만 고쳐진다.
     실제로 예전에는 c·o·f 만 적혀 있어 시각(m)이 남았다. */
  const keys = fnBody('photoSlotKeys');
  ['plainKey', 'timeKey'].forEach((k) => {
    assert.ok(new RegExp('\\b' + k + '\\s*\\(').test(keys), '칸 목록에 ' + k + ' 이(가) 빠졌다');
  });
  const f = fnBody('deletePhotoFromDB');
  assert.ok(/photoSlotKeys\s*\(/.test(f), '지우는 곳이 칸 목록을 안 쓰고 제 손으로 적는다');
});

/* ══════ ⑤ 이알피 자료의 «나이» ══════ */

test('이알피를 읽을 때 이 브라우저 사본과 클라우드의 «시각»을 견준다', () => {
  const f = fnBody('erpRead');
  assert.ok(/erpCloudStamp\s*\(/.test(f) && /erpLocalStamp\s*\(/.test(f),
    '사본을 무조건 먼저 쓰면, 이 PC 에서 이알피를 오래 안 연 사람은 몇 달 전 판으로 판단한다');
});

/* 읽어서 보여 주는 것은 옛것이라도 낫지만, 옛것으로 새것을 덮으면 자료가 상한다.
   ⚠ 글자로 「ERP.stale 이 있나」만 보면 안 된다 — 표만 세우고 관문을 없애도 통과한다.
     그래서 **실제로 돌려 보고** 맞추기가 불렸는지 센다. */
function runErpLoadAll(staleFlag) {
  const m = /async function erpLoadAll\s*\(/.exec(S);
  assert.ok(m, 'erpLoadAll 을 찾지 못했다');
  const a = m.index;
  const b = S.indexOf('\nfunction erpSidName', a);
  assert.ok(b > a, 'erpLoadAll 의 끝을 찾지 못했다');
  const called = { staff: 0, subs: 0 };
  const ctx = {
    console: { warn: () => {}, log: () => {} }, Promise, Object, Array, Boolean,
    ERP: { types: [], consultings: [], dir: [], loaded: false, err: '' },
    erpRead: () => Promise.resolve({
      rows: [{ id: 'E1', code: 'X', companyName: '가', name: '나' }],
      src: 'local', stale: staleFlag,
    }),
    syncStaffFromErp: () => { called.staff++; },
    erpSyncSubsDown: () => { called.subs++; },
  };
  vm.createContext(ctx);
  vm.runInContext(S.slice(a, b) + '\nthis._run = erpLoadAll;', ctx);
  return ctx._run().then(() => ({ called, ERP: ctx.ERP }));
}

test('옛 사본으로 읽은 판에서는 맞추기를 «실제로» 건너뛴다', async () => {
  const stale = await runErpLoadAll(true);
  assert.strictEqual(stale.ERP.stale, true, '옛 사본이라는 표가 안 섰다');
  assert.strictEqual(stale.called.subs, 0,
    '옛 판으로 부담당을 되돌리면, 그것이 이알피로 올라가 새 값을 덮는다');
  assert.strictEqual(stale.called.staff, 0,
    '몇 달 전 명부로 재직자를 휴직·퇴사로 돌려놓으면 그 사람이 담당에서 빠진다');

  const fresh = await runErpLoadAll(false);
  assert.strictEqual(fresh.called.subs, 1, '최신 판에서는 맞춰야 한다 — 관문이 늘 닫혀 있으면 기능이 없는 것이다');
  assert.strictEqual(fresh.called.staff, 1);
});

test('옛 사본으로는 이알피에 올리지 않는다', () => {
  const up = fnBody('erpSyncSubsUp');
  const head = up.slice(0, up.indexOf('getCoAtts'));
  assert.ok(/ERP\.stale/.test(head) && /return\s+null/.test(head),
    '옛 사본으로 올리면 그사이 남이 넣은 부담당을 없던 것으로 덮는다');
});

/* ══════ ⑥ 못 물어본 것을 「아니다」로 기억하지 않는다 ══════ */

test('저장 형식을 못 물어봤을 때 그것을 기억하지 않는다', () => {
  const f = fnBody('erpConsObjForm');
  const cat = f.slice(f.indexOf('catch'));
  assert.ok(cat.length > 0, 'catch 가 없다');
  assert.ok(!/_erpConsObjForm\s*=/.test(cat),
    '못 물어본 것을 「아니다」로 기억하면, 한 번 끊긴 뒤 그 세션 내내 이알피에 못 올린다');
});

/* ══════ 실제로 돌려 본다 — 글자만 보지 않는다 ══════ */

function loadErpRead(over) {
  const a = S.indexOf('async function erpReadCloud');
  const b = S.indexOf('\nasync function erpLoadAll');
  assert.ok(a > 0 && b > a, 'erpRead 묶음을 찾지 못했다');
  const st = { ls: {}, cloudStamp: 0, cloudRows: null };
  const ctx = Object.assign({
    console, JSON, Number, String, Object, Array, Promise, isFinite,
    ERP_LS_PREFIX: 'pureun_v6_',
    FB_READY: true,
    localStorage: { getItem: (k) => (k in st.ls ? st.ls[k] : null) },
    _fbDB: {
      ref: (p) => ({
        once: () => Promise.resolve({
          val: () => (/\/u$/.test(p) ? st.cloudStamp : (st.cloudRows == null ? null : { v: st.cloudRows, u: st.cloudStamp })),
        }),
      }),
    },
    erpToArray: (v) => (v == null ? null : (Array.isArray(v) ? v : (typeof v === 'object' ? Object.values(v) : null))),
    erpReadLocal: (key) => { try { return JSON.parse(st.ls['pureun_v6_' + key] || 'null'); } catch (e) { return null; } },
  }, over || {});
  vm.createContext(ctx);
  vm.runInContext(S.slice(a, b), ctx);
  ctx._st = st;
  return ctx;
}

test('클라우드가 더 새것이면 클라우드를 쓴다', async () => {
  const ctx = loadErpRead(); const st = ctx._st;
  st.ls['pureun_v6_consultings'] = JSON.stringify([{ id: 'E1', managerSubs: ['옛값'] }]);
  st.ls['pureun_v6__meta_consultings'] = '1000';
  st.cloudStamp = 2000;
  st.cloudRows = [{ id: 'E1', managerSubs: ['새값'] }];
  const got = await ctx.erpRead('consultings');
  assert.strictEqual(got.src, 'cloud', '이 PC 사본이 더 옛것인데 그것을 썼다');
  assert.strictEqual(got.rows[0].managerSubs[0], '새값');
});

test('이 브라우저 사본이 최신이면 통신하지 않고 그것을 쓴다', async () => {
  const ctx = loadErpRead(); const st = ctx._st;
  st.ls['pureun_v6_consultings'] = JSON.stringify([{ id: 'E1' }]);
  st.ls['pureun_v6__meta_consultings'] = '3000';
  st.cloudStamp = 2000;
  const got = await ctx.erpRead('consultings');
  assert.strictEqual(got.src, 'local');
  assert.strictEqual(got.stale, false);
});

test('클라우드가 새것인데 못 읽으면 — 있는 사본을 쓰되 «옛것»이라고 표시한다', async () => {
  const ctx = loadErpRead(); const st = ctx._st;
  st.ls['pureun_v6_consultings'] = JSON.stringify([{ id: 'E1' }]);
  st.ls['pureun_v6__meta_consultings'] = '1000';
  st.cloudStamp = 2000;
  st.cloudRows = null;                       // 규칙이 막았다
  const got = await ctx.erpRead('consultings');
  assert.strictEqual(got.src, 'local', '못 읽었다고 빈손을 주면 기능이 통째로 멈춘다');
  assert.strictEqual(got.stale, true, '옛것이라는 표가 없으면 이 자료로 이알피를 덮는다');
});

test('클라우드 시각을 모르면(0) 이 브라우저 사본을 그대로 쓴다', async () => {
  const ctx = loadErpRead(); const st = ctx._st;
  st.ls['pureun_v6_consultings'] = JSON.stringify([{ id: 'E1' }]);
  st.cloudStamp = 0;                          // 규칙·끊김 — 모른다
  const got = await ctx.erpRead('consultings');
  assert.strictEqual(got.src, 'local');
  assert.strictEqual(got.stale, false, '모르는 것을 «옛것»으로 단정하면 기능이 멈춘다');
});
