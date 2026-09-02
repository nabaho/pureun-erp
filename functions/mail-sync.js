/* 다음메일함 통째 동기화 — 메일함에 붙는 일
   ═══════════════════════════════════════════════════════════════════════════
   대표 지시 2026-08-24: "다음 370-6@daum.net 에 있는 메일을 모두 동기화 시켜달라."

   값 판단은 mail-box.js 가 한다(검사 대상). 여기는 **붙고·읽고·적는 일**만 한다.
   index.js 가 아니라 따로 둔 까닭: index.js 는 이미 2,100줄이고, 메일함은 앞으로
   손댈 일이 많다. 한 파일이 커지면 남의 기능을 건드리지 않고 고치기가 어렵다.

   ⚠ 지키는 것 다섯 (mail-box.js 머리글과 같은 약속이다)
   1. 읽기만 한다 — IMAP 을 readOnly 로 연다. 읽음 표시도 안 바꾼다.
      (급여자료 줍는 기계 receivePaydataMail 은 읽음 표시를 하지만, 그것은 「처리했다」는
       제 표시가 필요해서다. 여기는 사람의 메일함을 비추는 거울이라 손대면 안 된다.)
   2. 본문은 실시간DB에 담지 않는다 — 볼 때 그 자리에서 가져온다.
   3. 한 회차에 다 하지 않는다 — 시간·통수 한도를 두고 다음 회차로 넘긴다.
   4. 폴더 이름을 못 박지 않는다 — IMAP 이 알려 주는 것을 그대로 따른다.
   5. 총괄관리자만 본다 — 회사 메일함에는 고객사 임직원의 신상이 그대로 들어 있다.

   ⚠ 백업 대상에 mailbox 를 넣지 말 것. 백업은 낱칸 허용목록이라 지금은 안 들어간다
     (2026-08-16 사고: 무거운 뿌리를 넣어 백업이 통째로 막혔다). */
'use strict';

const MB = require('./mail-box');

const ROOT = 'mailbox';

/* 한 회차 한도 — 넘으면 다음 회차로 넘긴다. 죽는 것보다 나눠 하는 것이 낫다. */
/* ⚠ 진단은 «꺼 둔다». 2026-09-02 에 한 번 켜서 답을 다 얻었다(STATUS 참고) —
     IMAP 은 폴더당 400통이 끝이고, 번호를 직접 짚어도 창 밖은 0통이다.
   ⚠★ 켠 채로 두지 말 것 — 진단이 붙은 회차는 9초에서 «14초»로 늘었다(실측).
     진단 하나 때문에 «메일이 안 들어오는 것»은 그 어떤 답보다 나쁘다.
     다시 재려면 여기만 true 로 두고, 답을 읽으면 곧 되돌린다.
   ⚠ 아래 POP3 탐침은 «한 번도 안 돌았다» — 올리자마자 위험을 없애려고 진단을 껐다.
     그래서 「POP3 로는 더 주는가」는 아직 «모르는 답»이다. 다시 재려면 이것부터다.
     ★ 잘못 적었다가 바로잡은 것 하나 — 회차가 하나 빠진 것을 처음에 POP3 탐침 탓으로
       적었는데, 그 탐침은 돈 적이 없다. 그때 배포를 세 번 했고(예약 함수를 새로 올리면
       그 회차를 건너뛴다) 그쪽이 훨씬 그럴듯하다. 원인을 못 가렸으면 «못 가렸다»고
       적어야지, 그럴듯한 것을 원인으로 적으면 다음 사람이 엉뚱한 것을 고친다. */
const MB_DIAG = false;
/* ══ ★★ POP3 는 30,000통을 준다 — IMAP 의 400통과 «75배» 차이다 (2026-09-02 실측) ══
   MB_POP {"stat":"+OK 30000 36783009165","imapCap":400}   ← 05:18 회차
   즉 30,000통 · 36.8GB. 1년치(약 17,000통)를 «넉넉히 덮는다».
   ★ 그러므로 「1년치 완전 동기화」는 «가능하다» — 다만 IMAP 이 아니라 POP3 로.
     앞서 IMAP 만 보고 「불가능」이라 적었던 것을 이 값이 뒤집는다.

   ⚠★ 여기서 내가 두 번 틀렸다, 둘 다 «성급한 판정»이었다 —
     ① 04:46·05:15 회차가 «빠졌다»고 보고 탐침을 두 번 껐다. 그런데 05:18 에 그 회차가
        멀쩡히 돌아 있었다. 빠진 것이 아니라 «로그가 늦게 올라온 것»이었다.
        로그가 안 보이는 것을 「안 돈 것」으로 읽으면 안 된다 — 1~3분은 예사로 늦는다.
     ② 그 «안 빠진» 회차를 근거로 탐침을 껐는데, 정작 그 회차가 답을 내놓고 있었다.
   ⚠ 탐침은 답을 얻었으므로 꺼 둔다 — 다시 잴 까닭이 없다. 다음에 무언가를 잴 때는
     로그가 «늦다»는 것을 셈에 넣고, 최소 3회차는 보고 판단할 것.
   ⚠ POP3 로 실제로 끌어오려면 챙길 것: ①DELE 를 «절대» 안 부른다 ②다음메일 설정의
     「가져온 메일 남겨두기」가 켜져 있어야 한다 ③UIDL 로 이미 받은 것을 가린다
     ④TOP 으로 머리글만 받는다(36.8GB 를 통째로 받을 일이 아니다). */
const POP_PROBE = false;
let _popTried = false;
const CHUNK = 400;          // 한 폴더에서 한 바퀴에 볼 통수
const MAX_ROWS = 9000;      // 한 회차 전체 통수 — 한 줄이 250바이트쯤이니 2MB 남짓
const MAX_TURNS = 400;      // 줄에서 꺼내 볼 횟수 — 끝나지 않는 회차를 막는 뒷그물
const WRITE_BATCH = 250;    // 실시간DB에 한 번에 적을 줄 수
const PREVIEW_BYTES = 800;   // 글(text/plain) 은 앞 800바이트면 넉넉하다
const PREVIEW_HTML_BYTES = 3000; /* html 은 앞머리가 <head><style> 로 가득해 800으로는
   글이 한 자도 안 나온다(2026-08-24 대표 화면: 「.color_fix span {color:#888 !i」). */
const PRUNE_GAP_MS = 24 * 60 * 60 * 1000;  // 통수가 그대로일 때의 그물 — 하루에 한 번
const BODY_FULL_MAX = 2 * 1024 * 1024;     // 이보다 작으면 통째로 받아 파싱한다
const ATT_MAX = 20 * 1024 * 1024;          // 첨부 하나를 돌려줄 상한

function nowMs() { return Date.now(); }

/* ── 붙기 ──
   접속 아이디 후보 차례는 보내기(mail-deliver)와 **같아야** 한다. 다음 계정마다
   「370-6」인지 「370-6@daum.net」인지가 달라서, 한쪽만 고치면 보내기는 되는데
   받기는 안 되는(또는 그 반대) 일이 생긴다. */
async function connect(deps, user, pass) {
  const { ImapFlow } = require('imapflow');
  let last = null;
  for (const id of deps.MD.loginIds(user, process.env.DAUM_MAIL_ID)) {
    const c = new ImapFlow({
      host: 'imap.daum.net', port: 993, secure: true,
      auth: { user: id, pass: pass }, logger: false,
    });
    try { await c.connect(); return c; } catch (e) {
      last = e;
      try { await c.logout(); } catch (_) { /* 이미 끊겼다 */ }
    }
  }
  throw last || new Error('다음메일에 붙지 못했습니다');
}

/* ── 한 회차 ──
   scheduled(자동)와 HTTP(지금 가져오기)가 **같은 코드**를 쓴다. 두 벌이면 한쪽만
   고치고 지나간다. */
async function runSync(deps, opts) {
  const o = opts || {};
  const deadline = nowMs() + Math.max(20000, Number(o.deadlineMs || 460000));
  const db = deps.getDatabase();
  const out = { ok: true, folders: 0, rows: 0, removed: 0, ready: 0, waiting: 0, err: '' };

  const user = await deps.mailUserAsync();
  const pass = deps.mailPass();
  if (!user || !pass) return { ok: false, error: '메일 계정이 설정되지 않았습니다' };

  /* opts.client 는 «검사용 구멍»이다. 실제 메일함에 붙지 않고 한 회차를 돌려 보려면
     이 자리가 있어야 한다 — 창이 어떻게 움직이는지는 글자만 보는 검사로는 못 잡는다
     (2026-08-24 에 옛것 방향이 구간을 건너뛰는 것을 이 검사로 잡았다). */
  let client = o.client || null;
  if (!client) {
    try { client = await connect(deps, user, pass); } catch (e) {
      return { ok: false, error: '다음메일에 붙지 못했습니다 — ' + String((e && e.message) || e) };
    }
  }

  try {
    const boxes = (await client.list()).filter(MB.isSyncable).filter(MB.isWanted);
    const syncSnap = (await db.ref(ROOT + '/sync').once('value')).val() || {};

    /* ── 안 가져오기로 한 칸이 이미 담겨 있으면 걷어낸다 (대표 지시 2026-08-26) ──
       "메일함에 스팸함은 연결시켜서 가지고 올 필요없다. 그런데 왜 가지고 있나"
       ⚠ 앞으로 안 가져오는 것만으로는 부족하다 — 어제까지 담아 둔 스팸 수백 통이 DB 에
         그대로 남아 왼쪽에 스팸함 칸으로 계속 보인다. 여기서 한 번 치운다.
       ⚠ 걷어내기에 실패해도 동기화는 이어 간다. 다음 회차에 또 해 본다 — 이것 때문에
         메일 전체가 안 오면 바꾼 보람이 없다. */
    try {
      const known = (await db.ref(ROOT + '/folders').once('value')).val() || {};
      const drop = {};
      Object.keys(known).forEach((slug) => {
        const kind = String((known[slug] || {}).kind || '');
        /* 안 가져오기로 한 칸 — 폴더째 걷는다(스팸함) */
        if (MB.SKIP_KINDS.indexOf(kind) >= 0) {
          drop[ROOT + '/folders/' + slug] = null;
          drop[ROOT + '/msgs/' + slug] = null;
          drop[ROOT + '/sync/' + slug] = null;
          return;
        }
        /* 메일만 안 가져오는 칸 — 폴더는 «남기고» 담긴 메일만 걷는다(휴지통).
           ⚠ 폴더까지 지우면 [삭제]가 옮길 자리를 못 찾아 삭제 자체가 막힌다. */
        if (MB.NO_MSG_KINDS.indexOf(kind) >= 0) {
          drop[ROOT + '/msgs/' + slug] = null;
          drop[ROOT + '/sync/' + slug] = null;
        }
      });
      if (Object.keys(drop).length) {
        await db.ref().update(drop);
        console.log('syncMailbox 안 쓰는 칸을 걷어냈습니다:', Object.keys(drop).length / 3);
      }
    } catch (e) {
      console.warn('syncMailbox 안 쓰는 칸 걷어내기 실패:', String((e && e.message) || e));
    }

    /* ① 폴더 목록부터 적는다 — 통수를 못 가져와도 왼쪽 폴더 목록은 그려진다.
          「아직 아무것도 안 보인다」와 「폴더는 보이는데 목록이 비었다」는 사람에게
          아주 다른 이야기다. */
    const fUp = {};
    const plan = [];
    for (const b of boxes) {
      let st = null;
      try {
        st = await client.status(b.path, { messages: true, unseen: true, uidNext: true, uidValidity: true });
      } catch (e) {
        /* 이 폴더만 못 봤다 — 나머지는 계속한다 */
        console.warn('syncMailbox 폴더를 못 열었습니다:', b.path, String((e && e.message) || e));
        continue;
      }
      const slug = MB.slugOf(b.path);
      const rec = MB.folderRecord(b, st);
      rec.at = nowMs();
      rec.slug = slug;
      fUp[ROOT + '/folders/' + slug] = rec;
      plan.push({ box: b, st: st, slug: slug, sync: syncSnap[slug] || {} });
    }
    if (Object.keys(fUp).length) await db.ref().update(fUp);
    out.folders = plan.length;

    /* ② 사람이 먼저 보는 폴더부터 — 받은 → 보낸 → 임시 → 손폴더 → 스팸 → 휴지통.
          시간이 모자라 끊기더라도 중요한 것이 먼저 차 있다. */
    plan.sort((a, b) => MB.folderOrder(MB.folderKind(a.box)) - MB.folderOrder(MB.folderKind(b.box)));

    /* ══ 진단 (2026-08-31, 대표 목표 「1년치 완전 동기화 가능한가」) — «읽기만» 하고 기록만 남긴다 ══
       다음메일이 폴더당 400통만 «목록»으로 내주는 것은 재 봤다(SEARCH ALL). 그런데 아직
       안 재 본 것이 있다 — ①날짜로 찾으면(SINCE) 그 너머가 나오나 ②번호를 직접 짚어
       꺼내면(FETCH by UID) 창 밖 옛 메일이 나오나. ②가 되면 1년치를 «자동으로» 끌어올 수 있다.
       ⚠ 받은메일함 한 칸만, 한 회차에 한 번만, 실패해도 동기화는 그대로 이어 간다.
       ⚠ 답을 읽은 뒤 «걷어낸다» — 진단은 남겨 두면 회차마다 헛일을 한다.
       ⚠★ «진짜 메일함일 때만» 돈다(!o.client). 이 진단은 일부러 «목록에 없는 번호»를
         달라고 해 본다 — 그것이 물음의 핵심이기 때문이다. 그런데 그것은 동기화 길에서는
         금지 사항이고, 검사가 그 규칙을 지키고 있다(mail-sync-run 「없는 번호를 달라고
         하지 않는다」). 가짜 메일함으로는 어차피 답이 안 나오므로, 검사가 지키는 규칙을
         무르지 않고 진단만 비켜 세운다. */
    if (MB_DIAG && !o.client) {
      try {
        const inbox = plan.find((p) => MB.folderKind(p.box) === 'inbox') || plan[0];
        if (inbox) {
          const lock = await client.getMailboxLock(inbox.box.path, { readOnly: true });
          try {
            const caps = [];
            try { (client.capabilities || new Map()).forEach((v, k) => caps.push(k)); } catch (_) { /* 없으면 빈 채로 */ }
            const exists = client.mailbox ? Number(client.mailbox.exists || 0) : -1;
            const all = (await client.search({ all: true }, { uid: true })) || [];
            const nums = all.map(Number).filter((n) => n > 0).sort((a, b) => a - b);
            const lo = nums.length ? nums[0] : 0, hi = nums.length ? nums[nums.length - 1] : 0;
            const since = new Date(nowMs() - 365 * 86400000);
            let bySince = -1, below = -1, fetchBelow = 'skip', fetchBelowDate = '';
            try { bySince = ((await client.search({ since: since }, { uid: true })) || []).length; }
            catch (e) { bySince = 'ERR ' + String((e && e.message) || e); }
            if (lo > 1) {
              try { below = ((await client.search({ uid: '1:' + (lo - 1) }, { uid: true })) || []).length; }
              catch (e) { below = 'ERR ' + String((e && e.message) || e); }
              try {
                /* 창 바로 밑 번호부터 20개를 «직접 짚어» 꺼내 본다 — 있으면 목록 밖 옛 메일이 산 것이다 */
                const got = [];
                for await (const m of client.fetch({ uid: Math.max(1, lo - 20) + ':' + (lo - 1) }, { uid: true, envelope: true }, { uid: true })) {
                  got.push({ u: m.uid, d: m.envelope && m.envelope.date ? new Date(m.envelope.date).toISOString().slice(0, 10) : '' });
                }
                fetchBelow = got.length;
                fetchBelowDate = got.length ? (got[0].d + '~' + got[got.length - 1].d) : '';
              } catch (e) { fetchBelow = 'ERR ' + String((e && e.message) || e); }
            }
            const oldest = nums.length ? await (async () => {
              try { const m = await client.fetchOne(String(lo), { envelope: true }, { uid: true });
                return m && m.envelope && m.envelope.date ? new Date(m.envelope.date).toISOString().slice(0, 10) : ''; }
              catch (_) { return ''; }
            })() : '';
            /* ── POP3 로도 물어본다 (2026-09-02) ──
               IMAP 은 폴더당 400통에서 막혔다(위 값으로 확정). 그런데 다음은 POP3 에
               «가져올 범위»를 따로 둔다 — 거기서 전체를 준다면 옛 메일을 끌어올 길이 남는다.
               ⚠ STAT 하나만 묻는다 — 통수와 크기만 돌려주는 명령이라 메일을 건드리지 않는다.
                 (RETR·DELE 는 안 부른다. 읽음 표시도 안 바뀐다.) */
            let pop = 'skip';
            try {
              pop = await new Promise((ok) => {
                const tls = require('tls');
                let buf = '', step = 0, done = false;
                const fin = (v) => { if (!done) { done = true; try { s.end(); } catch (_) {} ok(v); } };
                const s = tls.connect({ host: 'pop.daum.net', port: 995, servername: 'pop.daum.net' });
                const t = setTimeout(() => fin('TIMEOUT'), 15000);
                s.on('error', (e) => { clearTimeout(t); fin('ERR ' + String((e && e.message) || e)); });
                s.on('data', (d) => {
                  buf += d.toString('utf8');
                  if (buf.indexOf('\r\n') < 0) return;
                  const line = buf.slice(0, buf.indexOf('\r\n')); buf = buf.slice(line.length + 2);
                  if (line.charAt(0) === '-') { clearTimeout(t); return fin('DENIED ' + line.slice(0, 60)); }
                  if (step === 0) { step = 1; s.write('USER ' + user + '\r\n'); return; }
                  if (step === 1) { step = 2; s.write('PASS ' + pass + '\r\n'); return; }
                  if (step === 2) { step = 3; s.write('STAT\r\n'); return; }
                  clearTimeout(t); return fin(line.trim().slice(0, 40));   /* +OK <통수> <바이트> */
                });
              });
            } catch (e) { pop = 'ERR ' + String((e && e.message) || e); }
            console.log('MB_DIAG_POP', JSON.stringify({ stat: pop }));
            /* ── 칸마다 «다음이 보여 주는 수»와 «우리가 든 수» ──
               400 이라는 벽이 어느 칸에 «실제로» 걸리는지 본다. 대부분의 업무 칸은
               400 밑이라 이미 완전하다 — 그 사실이 「얼마나 완벽한가」의 답이다. */
            try {
              const held = (await deps.getDatabase().ref(ROOT + '/msgs').once('value')).val() || {};
              const rows = plan.map((p) => ({
                n: String(p.box.path).slice(0, 18),
                daum: Number(p.st.messages || 0),
                ours: Object.keys(held[p.slug] || {}).length,
              })).sort((a, b) => b.daum - a.daum);
              const capped = rows.filter((r) => r.daum >= 400).length;
              console.log('MB_DIAG_BOXES', JSON.stringify({
                folders: rows.length, cappedAt400: capped,
                oursTotal: rows.reduce((s, r) => s + r.ours, 0),
                top: rows.slice(0, 8),
              }));
            } catch (e) { console.warn('MB_DIAG_BOXES 실패:', String((e && e.message) || e)); }
            console.log('MB_DIAG', JSON.stringify({
              box: inbox.box.path, statusMessages: Number(inbox.st.messages || 0), exists: exists,
              searchAll: nums.length, uidLo: lo, uidHi: hi, oldestVisible: oldest,
              searchSince365d: bySince, searchUidBelowLo: below,
              fetchBelowLo: fetchBelow, fetchBelowDates: fetchBelowDate,
              uidNext: Number(inbox.st.uidNext || 0), caps: caps.join(' '),
            }));
          } finally { try { lock.release(); } catch (_) { /* 이미 놓였다 */ } }
        }
      } catch (e) { console.warn('MB_DIAG 실패:', String((e && e.message) || e)); }
    }

    /* ③ 예산이 남는 동안 «줄 서서 몇 바퀴» 돈다.
       첫 배포 회차를 재 보니 폴더 33개를 한 바퀴 도는 데 30초였다 — 예산은 460초다.
       한 바퀴만 돌면 폴더마다 한 뭉치씩이라 몇 만 통을 다 가져오는 데 하루가 걸린다.
       그래서 폴더를 «줄»로 세우고, 아직 남은 폴더는 줄 끝에 다시 세운다. 예산이 다할
       때까지 돌고, 다 끝난 폴더는 줄에서 빠지므로 헛돌지 않는다.
       ⚠ 돌려 세우는 것이 요점이다 — 앞 폴더를 끝까지 파면 그 사이 뒤 폴더는 한 통도
         안 온다. 대표 눈에는 「어떤 칸은 되고 어떤 칸은 안 된다」로 보인다. */
    /* ⚠ 휴지통은 «폴더만» 남기고 메일은 안 가져온다(대표 지시 2026-08-29).
         줄에서 빼는 것으로 끝난다 — 폴더 기록은 위에서 이미 적었으므로 [삭제]가 그대로 된다. */
    const queue = plan.filter((p) => MB.wantsMsgs(p.box));
    let pruned = 0;
    let swept = 0;   /* 한 회차에 표시를 맞추는 폴더 수 — 시간이 한쪽으로 쏠리지 않게 */
    let turns = 0;
    while (queue.length && turns < MAX_TURNS && nowMs() < deadline && out.rows < MAX_ROWS) {
      turns++;
      const p = queue.shift();
      let more = false;      // 이 폴더에 아직 볼 것이 남았나 (줄 끝에 다시 세울지)

      /* 줄에 담는 칸이 바뀌었으면(예: 미리보기를 더했다) 그 폴더만 처음부터 다시 훑는다.
         적어 둔 줄은 그대로 두고 표시만 지운다 — 다시 받아 «덮어쓰면» 새 칸이 채워진다.
         ⚠ 줄을 지우지 않는 것이 요점이다. 지우면 다시 받는 동안 목록이 비어 보인다. */
      if (MB.needsRefetch(p.sync)) {
        p.sync = { uv: Number(p.st.uidValidity || 0), ver: MB.ROW_VER };
      }

      /* 서버가 번호를 다시 매겼다 — 지난 목록은 다른 메일을 가리킨다. 버리고 다시 시작한다. */
      if (MB.uidReset(p.sync, p.st.uidValidity)) {
        await db.ref(ROOT + '/msgs/' + p.slug).remove();
        p.sync = {};
      }

      let lock;
      try { lock = await client.getMailboxLock(p.box.path, { readOnly: true }); } catch (e) {
        console.warn('syncMailbox 폴더 잠금 실패:', p.box.path, String((e && e.message) || e));
        continue;   /* 이 폴더는 줄에서 뺀다 — 못 여는 폴더를 계속 다시 세우면 회차가 헛돈다 */
      }
      try {
        /* ── 이 폴더에 «지금 있는 번호 목록» ──
           회차 안에서 한 번만 받는다(바퀴마다 다시 물으면 그만큼 느려진다).
           이것이 있어야 빈 구간을 열지 않는다 — 까닭은 mail-box.js pickToFetch 머리글. */
        if (!p.uids) {
          try {
            p.uids = (await client.search({ all: true }, { uid: true })) || [];
          } catch (e) {
            console.warn('syncMailbox 번호 목록을 못 받았습니다:', p.box.path, String((e && e.message) || e));
            p.uids = [];
          }
        }
        const pick = MB.pickToFetch(p.uids, p.sync, CHUNK);
        /* 어느 방향인지 함께 들고 간다 — 중간에 끊겼을 때 표시를 옮겨도 되는지가
           방향마다 다르다(아래 «끊겼을 때» 주석). */
        const ranges = [];
        if (pick.fresh.length) ranges.push({ dir: 'fresh', uids: pick.fresh });
        if (pick.back.length) ranges.push({ dir: 'back', uids: pick.back });
        if (ranges.length) more = true;   // 가져올 것이 있었다 — 다음 바퀴에 다시 고른다

        /* ⚠ 가져올 것이 «없을» 때도 표시를 적어야 한다. 안 적으면 폴더가 다 찼는데도
           done 이 영원히 false 로 남아 ①「기다리는 폴더 33개」라고 거짓을 말하고,
           ②정리(지워진 메일 빼기)가 한 번도 돌지 않는다(doneAll 이 안 된다).
           실제로 그랬다 — INBOX 가 400/400 인데 끝났다고 안 했다(2026-08-24 실측). */
        if (!ranges.length) {
          p.sync = MB.nextSync(p.sync, [], p.st.uidValidity, pick.done);
        }

        {
          for (const r of ranges) {
            const seen = [];
            let n = 0;
            let cut = false;      // 시간·통수 한도에 걸려 중간에 끊겼나
            /* 한 뭉치를 먼저 손에 들고, 미리보기를 채운 뒤에 적는다 —
               미리보기는 «본문 조각 번호»별로 몰아서 받아야 싸다(아래 ②). */
            const held = [];
            try {
              for await (const msg of client.fetch(
                MB.uidSet(r.uids),
                { uid: true, envelope: true, flags: true, size: true, bodyStructure: true },
                { uid: true }
              )) {
                const row = MB.msgRow(msg);
                if (!row.u) continue;
                held.push({ row: row, tp: MB.textPartOf(msg.bodyStructure, 0) });
                seen.push(row.u); n++; out.rows++;
                if (nowMs() > deadline || out.rows >= MAX_ROWS) { cut = true; break; }
              }
            } catch (e) {
              cut = true;
              console.warn('syncMailbox 목록을 못 읽었습니다:', p.box.path, String((e && e.message) || e));
            }

            /* ② 미리보기 — 폰 목록의 셋째 줄(대표 화면 2026-08-24).
               ⚠ 본문을 통째로 받지 않는다. 글이 든 «조각의 앞 800바이트»만 잘라 받는다.
                 20MB 첨부가 붙은 메일에서도 오가는 것은 800바이트다.
               ⚠ 조각 번호(1 · 1.1 …)가 메일마다 달라서, 같은 번호끼리 몰아 한 번에 받는다.
                 한 뭉치에 보통 두세 번이면 끝난다.
               ⚠ 못 받아도 그냥 간다 — 미리보기 때문에 목록이 막히면 안 된다. */
            if (!cut && held.length) {
              const byPart = {};
              held.forEach((g) => {
                if (!g.tp || !g.tp.part) return;
                /* 자르는 길이가 html 인지에 따라 다르므로 묶음 열쇠에 함께 넣는다 */
                const key = g.tp.part + '|' + (g.tp.html ? 1 : 0);
                (byPart[key] = byPart[key] || []).push(g);
              });
              for (const key of Object.keys(byPart)) {
                if (nowMs() > deadline) break;
                const group = byPart[key];
                const part = key.slice(0, key.lastIndexOf('|'));
                const isHtml = key.slice(key.lastIndexOf('|') + 1) === '1';
                const maxLen = isHtml ? PREVIEW_HTML_BYTES : PREVIEW_BYTES;
                try {
                  const got = {};
                  for await (const m of client.fetch(
                    MB.uidSet(group.map((g) => g.row.u)),
                    { uid: true, bodyParts: [{ key: part, start: 0, maxLength: maxLen }] },
                    { uid: true }
                  )) {
                    const bp = m.bodyParts;
                    const buf = !bp ? null : (typeof bp.get === 'function' ? bp.get(part) : bp[part]);
                    if (buf) got[String(m.uid)] = buf;
                  }
                  group.forEach((g) => {
                    const buf = got[String(g.row.u)];
                    if (buf) g.row.p = MB.previewFrom(buf, g.tp);
                  });
                } catch (e) {
                  console.warn('syncMailbox 미리보기를 못 받았습니다:', p.box.path, part,
                    String((e && e.message) || e));
                }
              }
            }

            /* ③ 이제 적는다 */
            let batch = {};
            let w = 0;
            for (const g of held) {
              batch[ROOT + '/msgs/' + p.slug + '/' + g.row.u] = g.row;
              if (++w % WRITE_BATCH === 0) { await db.ref().update(batch); batch = {}; }
            }
            if (Object.keys(batch).length) await db.ref().update(batch);

            /* ── 끊겼을 때 표시를 어떻게 옮기나 ──
               IMAP 은 번호가 «작은 것부터» 온다. 그래서 중간에 끊기면 손에 있는 것은
               그 구간의 «아래쪽»이다.

               · 새것 방향([hi+1 … 맨위])은 끊겨도 괜찮다. hi 를 «받은 것 중 가장 큰
                 번호»로 올리면, 다음 회차가 바로 그 위에서 이어 받는다.
               · 옛것 방향([lo-뭉치 … lo-1])은 끊기면 표시를 **옮기면 안 된다.**
                 lo 를 받은 것 중 가장 작은 번호로 내리면, 못 받은 «위쪽»(예: 4751~5000)이
                 이미 본 것으로 표시돼 **영원히 건너뛴다.** 그냥 두면 다음 회차에 같은
                 구간을 다시 본다 — 같은 줄을 덮어쓰는 것뿐이라 해가 없다.

               ⚠ 끝까지 다 본 뭉치는 «달라고 한 번호 전부»를 표시에 넣는다. 그 사이
                 지워진 번호가 있으면 받은 것이 그보다 적은데, 그때 표시가 안 움직이면
                 같은 뭉치를 영원히 다시 본다(창이 멈춘다). */
            if (r.dir === 'back' && cut) {
              /* 표시를 옮기지 않는다 — 이번에 적은 줄은 그대로 남는다 */
            } else {
              if (!cut) r.uids.forEach((u) => seen.push(u));
              const before = Number(p.sync.n || 0);
              p.sync = MB.nextSync(p.sync, seen, p.st.uidValidity, pick.done && !cut);
              p.sync.n = before + n;
            }
            if (cut) break;
          }
        }

        /* ④ 다음메일에서 지운 것을 우리 목록에서도 뺀다.
           번호 목록(p.uids)이 이미 손에 있으니 «무엇이 살아 있나»는 따로 물어볼 것이 없다.
           비싼 것은 «우리가 무엇을 갖고 있나»다 — 그건 폴더 전체를 읽어야 안다.

           ⚠ 그래서 언제 읽을지가 요금을 가른다(2026-08-16 「once 뒤 on」 사고와 같은 결).
             ① 살아 있는 통수가 «줄었을 때» — 지운 것이 있다는 뜻이다. 이것이 흔한 경우다.
             ② 그 밖에는 하루에 한 번만 — 지운 것과 새로 온 것이 같은 수라 통수가 그대로인
                드문 경우를 위한 그물이다.
           ⚠ 예전에는 「셈(n) != 살아 있는 통수」로 판정했다. 그런데 n 은 «적은 줄 수»를
             세는 값이라 새 메일이 오고 가는 사이 조금씩 어긋난다(실측 7,379 vs 7,376).
             그러면 판정이 «늘 참»이 되어 회차마다 폴더 하나를 통째로 읽었다. */
        const doneAll = !more && !!p.sync.done;
        const lastN = Number(p.sync.lastN || 0);
        const shrank = doneAll && lastN > 0 && p.uids.length < lastN;
        const stale = nowMs() - Number(p.sync.prunedAt || 0) > PRUNE_GAP_MS;
        const mismatch = doneAll && (shrank || stale);
        if (mismatch && pruned < 1 && nowMs() < deadline) {
          pruned++;
          try {
            const have = (await db.ref(ROOT + '/msgs/' + p.slug).once('value')).val() || {};
            const haveKeys = Object.keys(have);
            /* ⚠ 「목록에 없으면 지운다」가 아니다 — 다음메일이 폴더당 400통까지만
               보여 주므로, 새 메일이 오면 가장 옛것이 그 창 밖으로 «밀린다».
               지운 것과 밀려난 것을 갈라야 우리 거울이 400 을 넘어 쌓인다.
               까닭은 mail-box.js goneKeys 머리글(대표 지시 2026-08-28). */
            const dead = MB.goneKeys(haveKeys, p.uids);
            const gone = {};
            dead.forEach((k) => { gone[ROOT + '/msgs/' + p.slug + '/' + k] = null; });
            if (dead.length) await db.ref().update(gone);
            out.removed += dead.length;
            /* 우리가 «실제로 들고 있는» 줄 수 — 화면의 「이 칸에 모두 몇 통」이 이것이다.
               다음메일이 주는 400 을 그대로 적으면, 400 을 넘겨 쌓인 뒤에도 400 이라고
               말하게 된다(목록에는 그보다 많이 보이는데). 여기서만 셀 수 있다 —
               폴더를 통째로 읽는 자리가 여기뿐이다. */
            p.sync.kept = Math.max(0, haveKeys.length - dead.length);
            p.sync.n = p.uids.length;
            /* 이번에 «살아 있던 통수»를 적어 둔다 — 다음 회차에 이보다 줄었으면
               지운 것이 있다는 뜻이라 그때 다시 읽는다. */
            p.sync.lastN = p.uids.length;
            p.sync.prunedAt = nowMs();
          } catch (e) {
            console.warn('syncMailbox 정리 실패:', p.box.path, String((e && e.message) || e));
          }
        }

        /* ⑤ ── 다음메일에서 «읽은 것»을 우리 목록에도 옮긴다 (대표 보고 2026-08-30) ──
           "안읽금이 매칭이 안된다 … 다음에서 읽음이면 푸른메일도 같이 동기화 되어야
            하는데 따로 논다."

           ★ 왜 따로 놀았나 — 우리는 [lo … hi] 사이를 «다시 읽지 않는다»(pickToFetch).
             한 번 가져온 줄의 r(읽음)·g(중요)·w(답장함)은 «그때 찍힌 그대로» 굳는다.
             그 뒤 다음메일에서 읽어도 우리 줄은 안 바뀐다.
             한편 옆줄·머리의 「안읽음」 수는 STATUS 가 주는 값이라 늘 최신이다 —
             그래서 두 수가 어긋나 「엉망」으로 보였다.
             ⚠ 실측 2026-08-30: 받은메일함은 다음이 «안읽음 0» 이라는데 우리 줄에는
               34통이 안읽음이었다. 전체로 다음 28 vs 우리 80 — 52통이 어긋나 있었다.

           ★ 표시만 다시 받는 것은 «싸다» — envelope·bodyStructure 없이 flags 만이라
             400통짜리 폴더도 한 번 왕복이면 끝난다.
           ⚠ 그래도 회차마다 하지 않는다. «다음메일이 말하는 안읽음 수»가 지난번과
             다를 때만 훑는다 — 그 값이 곧 「누가 뭘 읽었다」는 신호다.
             하루가 지나면 그물로 한 번 더 훑는다(중요·답장함만 바뀐 경우).
           ⚠ 바뀐 줄만 적는다. 400줄을 늘 덮어쓰면 요금도 요금이고, 보고 있는 화면이
             까닭 없이 다시 그려진다. */
        /* ★ 신호는 «두 수가 다른가»다 — 다음메일이 말하는 안읽음(STATUS, 늘 최신)과
             우리가 들고 있는 안읽음(sync.unread, 훑을 때마다 다시 셈).
           ⚠ 「다음 쪽 수가 지난번과 달라졌나」로는 모자란다. 다음이 «이미 0» 인데
             우리만 34통이 안읽음인 지금 상황을 못 잡는다 — 0 은 더 안 줄어든다.
             두 수를 곧바로 견주면 그 어긋남이 바로 신호가 되고, 맞춘 뒤에는 조용해진다. */
        const unseenNow = Number(p.st.unseen || 0);
        const knownUnread = Number(p.sync.unread);
        const sweptGap = nowMs() - Number(p.sync.sweptAt || 0) > PRUNE_GAP_MS;
        const needSweep = !!p.sync.done && p.uids && p.uids.length &&
          (!Number.isFinite(knownUnread) || knownUnread !== unseenNow || sweptGap);
        if (needSweep && swept < 2 && nowMs() < deadline) {
          swept++;
          try {
            const flags = {};
            for await (const m of client.fetch(
              MB.uidSet(p.uids), { uid: true, flags: true }, { uid: true }
            )) {
              flags[String(m.uid)] = {
                r: MB.hasFlag(m.flags, '\\Seen') ? 1 : 0,
                g: MB.hasFlag(m.flags, '\\Flagged') ? 1 : 0,
                w: MB.hasFlag(m.flags, '\\Answered') ? 1 : 0,
              };
            }
            const have = (await db.ref(ROOT + '/msgs/' + p.slug).once('value')).val() || {};
            const patch = {};
            let moved = 0;
            Object.keys(flags).forEach((u) => {
              const row = have[u]; if (!row) return;      /* 아직 안 가져온 줄은 건드리지 않는다 */
              const f = flags[u];
              ['r', 'g', 'w'].forEach((k) => {
                if (Number(row[k] || 0) !== f[k]) {
                  patch[ROOT + '/msgs/' + p.slug + '/' + u + '/' + k] = f[k];
                  moved++;
                }
              });
            });
            if (moved) await db.ref().update(patch);
            out.synced = (out.synced || 0) + moved;
            /* ⚠ 맞춘 «뒤»의 안읽음 수를 세어 둔다 — 다음 회차에 다음메일이 말하는 수와
                 견줄 값이다. 안 세어 두면 어긋남을 못 알아채거나(안 훑음),
                 늘 어긋난 것으로 보여 회차마다 폴더를 통째로 읽는다(요금). */
            let unread = 0;
            Object.keys(have).forEach((u) => {
              const f = flags[u];
              const r = f ? f.r : Number(have[u].r || 0);
              if (!r) unread++;
            });
            p.sync.unread = unread;
            p.sync.sweptAt = nowMs();
          } catch (e) {
            console.warn('syncMailbox 표시 맞추기 실패:', p.box.path, String((e && e.message) || e));
          }
        }
      } finally {
        try { lock.release(); } catch (_) { /* 이미 놓였다 */ }
      }

      p.sync.at = nowMs();
      p.sync.ver = MB.ROW_VER;
      /* ── 이 칸에 모두 몇 통인가 ──
         STATUS 가 주는 값은 못 믿는다(실측 2026-08-24: 열두 폴더가 나란히 400).
         번호 목록의 길이는 셀 수 있지만, 그것은 «다음메일이 지금 보여 주는» 수다.
         우리는 그보다 많이 들고 있을 수 있다 — 창 밖으로 밀려난 옛 메일을 이제
         안 지우기 때문이다(대표 지시 2026-08-28). 그럴 때는 «우리가 든 수»가 맞다:
         목록에 그만큼 보이는데 머리에 400 이라고 적으면 그 숫자를 못 믿게 된다.
         ⚠ kept 는 정리할 때만 새로 세므로 하루쯤 뒤처질 수 있다. 그 사이 온 새 메일은
           번호 목록에도 들어 있으므로 큰 쪽을 쓰면 어느 쪽으로도 밑돌지 않는다. */
      const seen = p.uids ? p.uids.length : Number(p.st.messages || 0);
      const total = Math.max(seen, Number(p.sync.kept || 0));
      p.sync.total = total;
      if (p.uids) {
        /* 옆줄 폴더 줄이 보는 값도 같은 값으로 맞춘다 */
        await db.ref(ROOT + '/folders/' + p.slug + '/total').set(total);
      }
      await db.ref(ROOT + '/sync/' + p.slug).update(p.sync);
      if (more) queue.push(p);          // 아직 남았다 — 줄 끝에 다시 세운다
    }

    /* ⑤ 셈은 «끝난 뒤 한 번만» 한다. 바퀴마다 세면 같은 폴더를 여러 번 센다 —
       「기다리는 폴더 33개」가 「198개」로 보이면 그 숫자를 못 믿게 된다.
       ⚠ 줄 판이 옛것인 폴더는 «다 된 것이 아니다». 지난 회차에 done 으로 적혀 있어도
         새 칸(미리보기)이 아직 없다 — 다시 훑어야 한다. 그것까지 ready 로 세면
         「33개 다 됐다」고 해 놓고 화면에는 셋째 줄이 없는 줄이 남는다(2026-08-24 실측:
         일곱 폴더만 새 판인데 ready 가 33 이었다). */
    plan.forEach((p) => {
      const done = MB.folderDone(p.sync);
      if (done) out.ready++; else out.waiting++;
    });
    out.turns = turns;

    await db.ref(ROOT + '/meta').update({
      at: nowMs(), ok: true, folders: out.folders, rows: out.rows,
      removed: out.removed, ready: out.ready, waiting: out.waiting, turns: turns, err: '',
    });

    /* ══ POP3 로는 더 주는가 — «그릇당 한 번», 일이 다 끝난 뒤에만 (2026-09-02) ══
       IMAP 은 폴더당 400통이 끝인 것이 확정됐다. 남은 «모르는 답»이 이것 하나다:
       다음은 POP3 에 「가져올 범위」를 따로 두는데, 거기서 전체를 준다면 옛 메일을
       끌어올 길이 남는다.
       ⚠★ 앞서 이 탐침을 회차 «가운데»에 두었다가, 회차가 9초→14초로 늘어 곧 껐다.
         이번에는 ①메일 일이 «다 끝난 뒤» ②그릇당 «한 번»만 ③예산이 1분 넘게 남았을 때만
         ④10초 안에 안 끝나면 스스로 접는다. 그래서 동기화를 늦추지 않는다.
       ⚠ STAT 하나만 묻는다 — 통수와 크기만 돌려주는 명령이라 메일을 건드리지 않는다.
         RETR·DELE 는 부르지 않는다. 읽음 표시도 안 바뀐다.
       ⚠ 답을 얻으면 이 덩이를 걷어낸다. 남겨 두면 그릇이 새로 뜰 때마다 헛일을 한다. */
    if (POP_PROBE && !_popTried && nowMs() < deadline - 60000) {
      _popTried = true;
      try {
        const stat = await new Promise((ok) => {
          const tls = require('tls');
          let buf = '', step = 0, done = false;
          const fin = (v) => { if (!done) { done = true; try { s.end(); } catch (_) {} ok(v); } };
          const s = tls.connect({ host: 'pop.daum.net', port: 995, servername: 'pop.daum.net' });
          const t = setTimeout(() => fin('TIMEOUT'), 10000);
          s.on('error', (e) => { clearTimeout(t); fin('ERR ' + String((e && e.message) || e)); });
          s.on('data', (d) => {
            buf += d.toString('utf8');
            let i;
            while ((i = buf.indexOf('\r\n')) >= 0) {
              const line = buf.slice(0, i); buf = buf.slice(i + 2);
              if (line.charAt(0) === '-') { clearTimeout(t); return fin('DENIED ' + line.slice(0, 60)); }
              if (step === 0) { step = 1; s.write('USER ' + user + '\r\n'); continue; }
              if (step === 1) { step = 2; s.write('PASS ' + pass + '\r\n'); continue; }
              if (step === 2) { step = 3; s.write('STAT\r\n'); continue; }
              clearTimeout(t); return fin(line.trim().slice(0, 40));   /* +OK <통수> <바이트> */
            }
          });
        });
        console.log('MB_POP', JSON.stringify({ stat: stat, imapCap: 400 }));
      } catch (e) { console.warn('MB_POP 실패:', String((e && e.message) || e)); }
    }
  } catch (e) {
    out.ok = false;
    out.err = String((e && e.message) || e);
    console.error('syncMailbox 실패:', out.err);
    try {
      await db.ref(ROOT + '/meta').update({ at: nowMs(), ok: false, err: out.err.slice(0, 300) });
    } catch (_) { /* 적지도 못하면 로그만 남는다 */ }
  } finally {
    try { await client.logout(); } catch (_) { /* 이미 끊겼다 */ }
  }
  return out;
}

/* ── 폴더 하나를 열어 무엇인가 하기 ──
   ⚠ write 를 켜지 않으면 읽음 표시도, 옮기기도 못 한다. 그래서 부르는 쪽이
     「고칠 일이 있는가」를 밝혀야 한다. 기본은 읽기 전용이다 — 실수로 켜지지 않게. */
async function folderPath(deps, slug) {
  const snap = await deps.getDatabase().ref(ROOT + '/folders/' + slug + '/path').once('value');
  const path = String(snap.val() || '');
  if (!path) { const e = new Error('그 폴더를 찾지 못했습니다'); e.status = 404; throw e; }
  return path;
}

/* ══════════════════════════════════════════════════════════════════════════
   붙어 둔 것을 «다시 쓴다» (대표 목표 2026-08-31 「팝업 열리는 속도」)
   ══════════════════════════════════════════════════════════════════════════
   ★ 예전에는 메일 한 통을 열 때마다 다음메일에 «새로 붙었다» — TLS 악수 + 로그인 +
     폴더 열기. 본문을 받는 시간보다 «붙는 시간»이 더 긴 일이 흔하다.
   ★ 이 함수가 도는 그릇(1세대 함수 한 대)은 부름과 부름 사이에도 «살아 있다».
     그래서 붙어 둔 것을 모듈 자리에 두고 다음 부름이 그대로 쓴다.

   ⚠ 죽은 것을 물려주면 «더 나쁘다» — 첫 명령에서 실패하고 그제야 다시 붙으니
     오히려 느려진다. 그래서 ①usable 을 보고 ②그래도 실패하면 «한 번만» 새로 붙어
     다시 해 본다. 두 번째 실패는 진짜 실패다.
   ⚠ 오래 놀린 것은 버린다 — 다음메일이 조용히 끊어 두어도 usable 이 참일 수 있다.
   ⚠ 한 그릇은 한 번에 한 부름만 받는다(1세대) — 그래서 «쓰는 중» 표시로 충분하다.
     동시에 들어오면 그때는 새로 붙는다(빌려 쓰다 서로 명령이 섞이면 안 된다). */
const WARM_IDLE_MS = 4 * 60 * 1000;   /* 이보다 오래 놀렸으면 버린다 */
let _warm = null;                      /* { client, at, busy } */

async function warmConnect(deps, user, pass) {
  const w = _warm;
  if (w && !w.busy && w.client && w.client.usable && (nowMs() - w.at) < WARM_IDLE_MS) {
    w.busy = true;
    return { client: w.client, reused: true };
  }
  if (w && w.client && !w.busy) { try { await w.client.logout(); } catch (_) { /* 이미 끊겼다 */ } _warm = null; }
  const client = await connect(deps, user, pass);
  if (!w || !w.busy) _warm = { client: client, at: nowMs(), busy: true };
  return { client: client, reused: false, spare: !!(w && w.busy) };
}
function warmDone(client, ok) {
  if (_warm && _warm.client === client) {
    _warm.busy = false;
    _warm.at = nowMs();
    if (!ok) { try { _warm.client.logout(); } catch (_) { /* 이미 끊겼다 */ } _warm = null; }
    return true;    /* 살려 둔다 */
  }
  return false;     /* 남는 것으로 붙은 것 — 부른 쪽이 끊는다 */
}

async function withFolder(deps, slug, fn, opts) {
  const write = !!(opts && opts.write);
  const path = await folderPath(deps, slug);

  const user = await deps.mailUserAsync();
  const pass = deps.mailPass();
  if (!user || !pass) { const e = new Error('메일 계정이 설정되지 않았습니다'); e.status = 500; throw e; }

  /* ⚠ 시간을 «갈라» 적는다 (2026-08-31, 대표 목표 「팝업 열리는 속도」).
       본문을 열 때마다 여기서 다음메일에 «새로 붙고»(TLS+로그인) 끝나면 끊는다.
       느린 것이 «붙는 데»인지 «본문 받는 데»인지 갈라야 무엇을 고칠지 정해진다 —
       합쳐 재면 둘 다 의심스럽고 아무것도 못 고친다. */
  /* ⚠ 붙어 둔 것이 죽어 있었으면 «한 번만» 새로 붙어 다시 해 본다 — 물려받은 것이
       조용히 끊겨 있는 일은 늘 있다. 두 번째 실패는 진짜 실패로 올린다. */
  let lastErr = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const t0 = nowMs();
    const got = await warmConnect(deps, user, pass);
    const client = got.client;
    const tConn = nowMs() - t0;
    let ok = false;
    try {
      const t1 = nowMs();
      const lock = await client.getMailboxLock(path, { readOnly: !write });
      const tOpen = nowMs() - t1;
      try {
        const t2 = nowMs();
        const r = await fn(client);
        ok = true;
        console.log('MB_TIME', JSON.stringify({ slug: slug, connect: tConn, select: tOpen,
          work: nowMs() - t2, reused: !!got.reused }));
        return r;
      } finally {
        try { lock.release(); } catch (_) { /* 이미 놓였다 */ }
      }
    } catch (e) {
      lastErr = e;
      /* 물려받은 것이 죽어 실패했을 때만 다시 해 본다 — 새로 붙어서도 실패했으면 진짜다 */
      if (!got.reused || attempt >= 1) throw e;
      console.warn('withFolder 물려받은 연결이 죽어 다시 붙습니다:', String((e && e.message) || e));
    } finally {
      if (!warmDone(client, ok)) {
        try { await client.logout(); } catch (_) { /* 이미 끊겼다 */ }
      }
    }
  }
  throw lastErr || new Error('메일함을 열지 못했습니다');
}

/* 흐르는 것을 한 덩이로. 상한을 넘으면 멈춘다 — 메모리를 다 먹고 죽는 것보다 낫다. */
async function drain(stream, max) {
  const parts = [];
  let size = 0;
  for await (const chunk of stream) {
    size += chunk.length;
    if (size > max) throw Object.assign(new Error('너무 큽니다'), { status: 413 });
    parts.push(chunk);
  }
  return Buffer.concat(parts);
}

/* 구조에서 「본문」과 「첨부」를 갈라 놓는다. 본문 부분만 따로 받으면
   20MB 첨부가 붙은 메일도 글을 바로 읽을 수 있다. */
function pickParts(node, out, depth) {
  out = out || { html: null, text: null, htmlCs: '', textCs: '', atts: [] };
  if (!node || (depth || 0) > 8) return out;
  const type = String(node.type || '').toLowerCase();
  const disp = String(node.disposition || '').toLowerCase();
  const fname = (node.dispositionParameters && node.dispositionParameters.filename) ||
                (node.parameters && node.parameters.name) || '';
  /* ⚠ 첨부인지 «먼저» 본다 — 안으로 파고들기 전에.
     전달된 메일이 통째로 첨부된 것(message/rfc822)은 그 안에 또 조각이 들어 있다.
     먼저 파고들면 첨부 목록에 «안쪽 첨부»가 오르고, 정작 사람이 화면에서 보는
     「전달된메일.eml」은 목록에 없다. 그러면 첫째 첨부를 눌렀을 때 «다른 파일»이
     내려온다 — 화면은 mailparser 차례, 받는 쪽은 이 차례를 쓰기 때문이다.
     (2026-08-27 실측: 화면 [전달된메일.eml, 바깥첨부.pdf] · 서버 [안쪽첨부.pdf, 바깥첨부.pdf]) */
  const isAtt = disp === 'attachment' || (fname && type.indexOf('text/') !== 0 && !node.id);
  if (isAtt) {
    out.atts.push({
      part: String(node.part || ''), name: String(fname || '이름없는첨부'),
      mime: type, size: Number(node.size || 0),
    });
    return out;
  }
  const kids = node.childNodes || node.children;
  if (Array.isArray(kids)) {
    kids.forEach((k) => pickParts(k, out, (depth || 0) + 1));
    return out;
  }
  /* 글자표를 함께 들고 온다 — 이것이 없으면 아래에서 utf-8 로 못 박아 읽어야 하고,
     euc-kr 로 온 한글 메일이 통째로 깨진다. */
  const cs = String((node.parameters && node.parameters.charset) || '').toLowerCase();
  if (type === 'text/html' && !out.html) { out.html = String(node.part || ''); out.htmlCs = cs; }
  if (type === 'text/plain' && !out.text) { out.text = String(node.part || ''); out.textCs = cs; }
  return out;
}

module.exports = function build(deps) {
  const F = deps.functions;
  const REGION = deps.MAIL_REGION;

  /* ══════════════════════════════════════════════════════════════════════════
     누가 회사 메일함을 볼 수 있나 (대표 지시 2026-08-27 「전 직원에게 다 열기」)
     ══════════════════════════════════════════════════════════════════════════
     예전에는 총괄관리자 한 사람뿐이었다. 그래서 직원이 메일함에 들어가도 화면이
     통째로 비어 있었다 — 자기 담당 메일조차 못 봤다.

     ★ 「직원」의 뜻을 «로그인한 사람»으로 두면 안 된다.
       deps.requireStaff 는 «비밀번호로 로그인했는가»만 본다. 회사 계정이 아니어도
       통과한다. 그래서 여기서 uid_roles 에 «사번이 적힌 재직자»인지 한 번 더 본다.
       (2026-08-27 실측: uid_roles 는 10명 전원이 사번·status 를 갖고 있다)
     ⚠ 콘솔 규칙(mailbox.read)도 «같은 뜻»으로 맞춰야 한다 — 한쪽만 열면
       목록은 보이는데 본문에서 403 이 나거나, 그 반대가 된다.
     ⚠ status 는 그 사람이 «본인이 로그인할 때» 적힌다. 퇴사자가 다시 로그인하지
       않으면 active 로 남는다 — 퇴사 계정은 로그인 자체를 막아야 진짜로 닫힌다.
       (이 저장소의 다른 규칙들도 모두 같은 처지다. 여기서만 생기는 구멍이 아니다) */
  async function requireMailUser(req) {
    const decoded = await deps.requireStaff(req);
    const snap = await deps.getDatabase().ref('uid_roles/' + decoded.uid).once('value');
    const v = snap.val() || {};
    if (!v.sid || v.status !== 'active') {
      const e = new Error('회사 메일함은 재직 중인 직원만 볼 수 있습니다.');
      e.status = 403;
      throw e;
    }
    return decoded;
  }

  /* 다음메일의 «폴더 자체»를 만들고 지우는 일만 대표 몫으로 남긴다.
     한 사람이 폴더를 지우면 열 사람의 화면이 함께 바뀌고, 그 안의 메일이 휴지통으로
     간다 — 되돌리기 어렵다. 메일을 «보고·읽음 표시하고·옮기는» 것과는 무게가 다르다. */
  async function requireAdmin(req) {
    const decoded = await requireMailUser(req);
    const snap = await deps.getDatabase().ref('uid_roles/' + decoded.uid + '/isAdmin').once('value');
    if (snap.val() !== true) {
      const e = new Error('다음메일 폴더를 만들고 지우는 것은 대표님만 할 수 있습니다.');
      e.status = 403;
      throw e;
    }
    return decoded;
  }

  function reply(res, code, body) {
    res.status(code).json(body);
  }

  /* who: 통과 조건. 안 주면 «재직 중인 직원». */
  async function gate(req, res, fn, who) {
    deps.setCors(req, res);
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST') { reply(res, 405, { ok: false, error: 'POST 요청만 허용됩니다.' }); return; }
    try {
      await (who || requireMailUser)(req);
      await fn();
    } catch (e) {
      console.error('mailbox:', String((e && e.message) || e));
      reply(res, e && e.status ? e.status : 500, { ok: false, error: (e && e.message) || '처리하지 못했습니다.' });
    }
  }

  return {
    /* ══════ 자동 — 10분마다 ══════
       보낸 메일까지 함께 따라오게 하려면 자주 봐야 한다. 붙는 값이 싸다(목록만). */
    syncMailbox: F
      .region(REGION)
      .runWith({ secrets: ['DAUM_MAIL_PASSWORD'], timeoutSeconds: 540, memory: '512MB' })
      .pubsub.schedule('every 10 minutes')
      .timeZone('Asia/Seoul')
      .onRun(async () => {
        const r = await runSync(deps, { deadlineMs: 460000 });
        console.log('syncMailbox', r);
        return null;
      }),

    /* ══════ 지금 가져오기 ══════
       10분을 기다리지 않고 사람이 누르는 자리. 화면의 「새로고침 ↻」이 이것을 부른다. */
    pullMailbox: F
      .region(REGION)
      .runWith({ secrets: ['DAUM_MAIL_PASSWORD'], timeoutSeconds: 300, memory: '512MB' })
      .https.onRequest((req, res) => gate(req, res, async () => {
        const r = await runSync(deps, { deadlineMs: 230000 });
        reply(res, r.ok ? 200 : 500, Object.assign({ ok: r.ok }, r));
      })),

    /* ══════ 메일 한 통 열기 ══════
       본문은 실시간DB에 담지 않는다 — 여기서 그 자리에서 가져온다.
       작으면 통째로 받아 파싱하고(믿을 수 있다), 크면 본문 부분만 골라 받는다
       (20MB 첨부가 붙은 메일에서 글 한 줄 보려고 20MB 를 받지 않게). */
    readMailMessage: F
      .region(REGION)
      .runWith({ secrets: ['DAUM_MAIL_PASSWORD'], timeoutSeconds: 120, memory: '512MB' })
      .https.onRequest((req, res) => gate(req, res, async () => {
        const b = req.body || {};
        const slug = String(b.slug || '');
        const uid = String(b.uid || '');
        /* 미리 받기 — 읽는 동안 위·아래 통을 조용히 받아 둘 때 쓴다.
           ⚠ 이때는 읽음 표시를 «안» 건드린다 (아래 if (!peek)). */
        const peek = !!b.peek;
        if (!slug || !/^\d+$/.test(uid)) { reply(res, 400, { ok: false, error: '어느 메일인지 알 수 없습니다.' }); return; }

        const got = await withFolder(deps, slug, async (client) => {
          const head = await client.fetchOne(uid, { uid: true, size: true, bodyStructure: true, envelope: true }, { uid: true });
          if (!head) throw Object.assign(new Error('그 메일이 없습니다 — 다음메일에서 지워졌을 수 있습니다'), { status: 404 });

          /* 읽음 표시 — 다음메일에서 열었을 때와 «같게» 만든다. 이것을 안 하면 앱에서
             다 읽었는데도 옆줄의 「안읽음」이 영원히 그 수로 남는다.
             ⚠ 실패해도 본문은 보여 준다. 표시가 안 된 것보다 못 읽는 것이 나쁘다.
             ★ peek 이면 «아무것도 안 건드린다» (2026-08-30) — 앱이 다음·이전 통을
               미리 받아 둘 때 쓰는 길이다. 미리 받았다고 안 읽은 메일이 읽음으로
               바뀌면, 대표께서 열어 보시지도 않은 메일이 조용히 사라진 것처럼 된다. */
          if (!peek) {
            try { await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true }); } catch (_) { /* 표시만 못 했다 */ }
            try {
              await deps.getDatabase().ref(ROOT + '/msgs/' + slug + '/' + uid + '/r').set(1);
            } catch (_) { /* 목록 쪽 표시는 다음 회차에 맞춰진다 */ }
          }

          /* ── 첨부 목록은 «한 벌»로 만든다 (2026-08-27) ──
             ⚠ 예전에는 작은 메일은 mailparser 가, 첨부를 내려받는 쪽은 pickParts 가
               각각 세었다. 두 차례가 어긋나면 첫째 첨부를 눌렀을 때 다른 파일이 온다.
               이제 «구조»(pickParts) 하나만 보고, 조각 이름(part)까지 실어 보낸다 —
               받는 쪽은 번호가 아니라 그 이름으로 집는다. 차례가 흔들려도 안 어긋난다. */
          const parts = pickParts(head.bodyStructure, null, 0);
          const atts = parts.atts.map((a, i) => Object.assign({ i: i }, a));

          const size = Number(head.size || 0);
          if (size && size <= BODY_FULL_MAX) {
            const { simpleParser } = require('mailparser');
            const one = await client.fetchOne(uid, { uid: true, source: true }, { uid: true });
            const p = await simpleParser(one.source);
            return { html: p.html || '', text: String(p.text || ''), atts: atts, full: true };
          }

          /* 큰 메일 — 본문 부분만.
             ⚠ 글자표를 못 박지 않는다. 예전에는 toString('utf8') 이라 euc-kr 로 온
               한글 메일이 2MB 를 넘는 순간 통째로 깨졌다(작은 메일은 mailparser 가
               알아서 해 주므로 큰 것만 그랬다 — 그래서 눈에 잘 안 띄었다). */
          let html = '', text = '';
          if (parts.html) {
            const d = await client.download(uid, parts.html, { uid: true });
            html = MB.toText(await drain(d.content, BODY_FULL_MAX), parts.htmlCs);
          } else if (parts.text) {
            const d = await client.download(uid, parts.text, { uid: true });
            text = MB.toText(await drain(d.content, BODY_FULL_MAX), parts.textCs);
          }
          return { html: html, text: text, atts: atts, full: false };
        }, { write: true });

        reply(res, 200, Object.assign({ ok: true }, got));
      })),

    /* ══════ 폴더 만들기 · 이름 바꾸기 · 지우기 ══════
       ⚠ 여기는 다음메일의 «폴더 자체»를 고치는 자리다. 메일 한 통을 옮기는 것과 다르다 —
         폴더를 지우면 그 안의 메일이 함께 사라진다. 그래서 셋을 지킨다.
       ① 손으로 만든 폴더(custom)만 건드린다. 받은메일함·보낸메일함처럼 다음메일이
          만들어 둔 칸은 이름도 못 바꾸고 지우지도 못한다 — 지우면 메일함이 망가진다.
       ② 지우기는 «비우고 지운다». 안에 있는 메일을 먼저 휴지통으로 옮긴 뒤 빈 폴더를
          지운다. 그래야 잘못 눌러도 다음메일 휴지통에서 되찾을 수 있다.
       ③ 우리 목록에서도 그 자리를 곧바로 지운다 — 다음 회차를 기다리면 없는 폴더가
          옆줄에 남아 눌러도 빈 화면이 된다. */
    manageMailFolder: F
      .region(REGION)
      .runWith({ secrets: ['DAUM_MAIL_PASSWORD'], timeoutSeconds: 300, memory: '512MB' })
      .https.onRequest((req, res) => gate(req, res, async () => {
        const b = req.body || {};
        const act = String(b.act || '');
        if (['create', 'rename', 'delete'].indexOf(act) < 0) {
          reply(res, 400, { ok: false, error: '알 수 없는 작업입니다.' }); return;
        }
        const db = deps.getDatabase();
        const all = (await db.ref(ROOT + '/folders').once('value')).val() || {};
        /* 구분자는 폴더 기록에서 가져온다 — 서버마다 다르다(/ 인 곳도, . 인 곳도). */
        let delim = '';
        Object.keys(all).forEach((k) => { if (!delim && all[k] && all[k].delim) delim = all[k].delim; });

        const user = await deps.mailUserAsync();
        const pass = deps.mailPass();
        if (!user || !pass) { reply(res, 500, { ok: false, error: '메일 계정이 설정되지 않았습니다.' }); return; }

        /* 건드려도 되는 폴더인가 — 손으로 만든 것만 */
        const mine = (slug) => {
          const f = all[slug];
          if (!f) { const e = new Error('그 폴더를 찾지 못했습니다'); e.status = 404; throw e; }
          if (f.kind !== 'custom') {
            const e = new Error('「' + (f.name || '') + '」 은 다음메일이 만들어 둔 칸이라 여기서 고칠 수 없습니다.');
            e.status = 400; throw e;
          }
          return f;
        };

        const client = await connect(deps, user, pass);
        try {
          if (act === 'create') {
            const parent = b.parent ? mine(String(b.parent)) : null;
            const name = String(b.name || '');
            const bad = MB.folderNameBad(name, delim);
            if (bad) { reply(res, 400, { ok: false, error: bad }); return; }
            if (parent && !delim) {
              reply(res, 400, { ok: false, error: '이 메일함은 하위 폴더를 만들 수 없습니다 (서버가 층을 알려 주지 않습니다).' });
              return;
            }
            const path = MB.childPath(parent ? parent.path : '', name, delim);
            await client.mailboxCreate(path);
            reply(res, 200, { ok: true, path: path });
            return;
          }

          if (act === 'rename') {
            const f = mine(String(b.slug || ''));
            const name = String(b.name || '');
            const bad = MB.folderNameBad(name, delim);
            if (bad) { reply(res, 400, { ok: false, error: bad }); return; }
            const to = MB.renamedPath(f.path, name, delim);
            if (to === f.path) { reply(res, 200, { ok: true, path: to, same: true }); return; }
            await client.mailboxRename(f.path, to);
            /* 옛 자리를 우리 목록에서 지운다 — 새 자리는 다음 회차가 적는다 */
            const up = {};
            up[ROOT + '/folders/' + String(b.slug)] = null;
            up[ROOT + '/msgs/' + String(b.slug)] = null;
            up[ROOT + '/sync/' + String(b.slug)] = null;
            await db.ref().update(up);
            reply(res, 200, { ok: true, path: to });
            return;
          }

          /* act === 'delete' — 비우고 지운다 */
          const f = mine(String(b.slug || ''));
          const trashSlug = Object.keys(all).find((k) => all[k] && all[k].kind === 'trash');
          let moved = 0;
          if (trashSlug && all[trashSlug].path !== f.path) {
            const lock = await client.getMailboxLock(f.path);
            try {
              const uids = await client.search({ all: true }, { uid: true });
              if (uids && uids.length) {
                await client.messageMove(uids.join(','), all[trashSlug].path, { uid: true });
                moved = uids.length;
              }
            } finally {
              try { lock.release(); } catch (_) { /* 이미 놓였다 */ }
            }
          }
          await client.mailboxDelete(f.path);
          const up = {};
          up[ROOT + '/folders/' + String(b.slug)] = null;
          up[ROOT + '/msgs/' + String(b.slug)] = null;
          up[ROOT + '/sync/' + String(b.slug)] = null;
          await db.ref().update(up);
          reply(res, 200, { ok: true, moved: moved });
        } finally {
          try { await client.logout(); } catch (_) { /* 이미 끊겼다 */ }
        }
      }, requireAdmin)),   /* ★ 이 창구만 대표 몫이다 — 폴더를 지우면 열 사람 화면이 함께 바뀐다 */

    /* ══════ 표시 켜고 끄기 — 중요(★) · 읽음 ══════
       ⚠ 이것도 다음메일을 «고치는» 자리다. 다만 되돌릴 수 있는 것이라(다시 누르면 된다)
         물어보지 않고 그 자리에서 한다 — 별을 누를 때마다 「하시겠습니까」가 뜨면 못 쓴다.
       ⚠ 켤 수 있는 표시를 둘로 못 박는다. \Deleted 같은 것을 여기로 흘려보내면
         이 창구가 조용히 «지우는 길»이 된다. */
    flagMailMessages: F
      .region(REGION)
      .runWith({ secrets: ['DAUM_MAIL_PASSWORD'], timeoutSeconds: 120, memory: '512MB' })
      .https.onRequest((req, res) => gate(req, res, async () => {
        const b = req.body || {};
        const slug = String(b.slug || '');
        const uids = (Array.isArray(b.uids) ? b.uids : []).map(String).filter((u) => /^\d+$/.test(u));
        const FLAGS = { star: '\\Flagged', read: '\\Seen' };
        const flag = FLAGS[String(b.flag || '')];
        const on = !!b.on;
        if (!slug || !uids.length || !flag) { reply(res, 400, { ok: false, error: '무엇에 무슨 표시를 할지 알 수 없습니다.' }); return; }
        if (uids.length > 200) { reply(res, 400, { ok: false, error: '한 번에 200통까지 할 수 있습니다.' }); return; }

        await withFolder(deps, slug, async (client) => {
          if (on) await client.messageFlagsAdd(uids.join(','), [flag], { uid: true });
          else await client.messageFlagsRemove(uids.join(','), [flag], { uid: true });
        }, { write: true });

        /* 우리 목록도 그 자리에서 맞춘다 — 다음 회차를 기다리면 별이 도로 꺼져 보인다 */
        const key = (String(b.flag) === 'star') ? 'g' : 'r';
        const up = {};
        uids.forEach((u) => { up[ROOT + '/msgs/' + slug + '/' + u + '/' + key] = on ? 1 : 0; });
        await deps.getDatabase().ref().update(up);

        reply(res, 200, { ok: true, n: uids.length });
      })),

    /* ══════ 첨부를 «급여데이터함으로» 바로 넘기기 (대표 결정 2026-08-30) ══════
       급여자료가 메일로 오면 여태 «내려받아 → 급여데이터함을 열어 → 다시 올리는»
       세 걸음이었다. 서버가 10분마다 스스로 훑는 길(receivePaydataMail)은 이미
       있지만 그것은 «아는 곳에서 온 것»만 담는다 — 모르는 주소로 온 자료, 지난
       메일에서 뒤늦게 찾은 자료는 사람이 손으로 옮겨야 했다.

       ★ 새로 짓는 것이 «없다». 첨부를 읽는 길(바로 아래 readMailAttachment 와 같은
         셈)과 창고에 담아 대기 칸에 적는 길(deps.payMailStore)이 이미 있다 —
         그 둘을 잇는다.
       ⚠ 화면에서 창고에 «직접» 쓰지 않는다. 그러려면 규칙을 새로 열어야 하고,
         한 번 연 문은 닫기 어렵다. 서버가 대신 담는다.
       ⚠ 대기 칸까지만이다. «판독은 안 돌린다» — 받자마자 AI 로 보내면 주민번호
         가림을 통째로 건너뛴다(pu-paydata 의 끌어다 놓기와 같은 원칙).
       ⚠ 다음메일을 고치지 않는다. 읽기만 한다. */
    mailAttToPaydata: F
      .region(REGION)
      .runWith({ secrets: ['DAUM_MAIL_PASSWORD'], timeoutSeconds: 300, memory: '1GB' })
      .https.onRequest((req, res) => gate(req, res, async () => {
        if (typeof deps.payMailStore !== 'function') {
          reply(res, 500, { ok: false, error: '급여데이터함으로 담는 길이 없습니다.' }); return;
        }
        const b = req.body || {};
        const slug = String(b.slug || '');
        const uid = String(b.uid || '');
        const idx = Number(b.index);
        const part = /^[0-9]+(\.[0-9]+)*$/.test(String(b.part || '')) ? String(b.part) : '';
        if (!slug || !/^\d+$/.test(uid) || (!part && !(Number.isInteger(idx) && idx >= 0))) {
          reply(res, 400, { ok: false, error: '어느 첨부인지 알 수 없습니다.' }); return;
        }

        const got = await withFolder(deps, slug, async (client) => {
          const head = await client.fetchOne(uid, { uid: true, size: true, bodyStructure: true }, { uid: true });
          if (!head) throw Object.assign(new Error('그 메일이 없습니다'), { status: 404 });
          const parts = pickParts(head.bodyStructure, null, 0);
          /* ⚠ 조각 이름이 있으면 «반드시» 첨부 목록 안에 있는 것이어야 한다 —
               아무 조각이나 받아 주면 이 창구가 본문을 통째로 꺼내는 길이 된다
               (readMailAttachment 와 같은 잣대). */
          const a = part ? parts.atts.find((x) => x.part === part) : parts.atts[idx];
          if (!a) throw Object.assign(new Error('그 첨부가 없습니다'), { status: 404 });
          if (Number(a.size || 0) > ATT_MAX) throw Object.assign(new Error('너무 큽니다 — 다음메일에서 내려받아 주세요'), { status: 413 });
          const d = await client.download(uid, a.part, { uid: true });
          const buf = await drain(d.content, ATT_MAX);
          return { name: a.name, mime: a.mime || 'application/octet-stream', buf: buf };
        });

        const r = await deps.payMailStore({
          filename: got.name, content: got.buf,
          contentType: got.mime, size: got.buf.length,
        }, { from: String(b.from || ''), subject: String(b.subject || ''), box: slug });

        reply(res, 200, { ok: true, id: r.id, seat: r.seat, shared: r.shared,
          why: r.why, name: got.name, bytes: got.buf.length });
      })),

    /* ══════ 본문까지 찾기 (대표 결정 2026-08-30) ══════
       화면의 찾기는 «받아 둔 것»의 보낸이·제목만 본다. 그래서 「그 말이 본문에 있는데
       안 나온다」가 된다 — 7,337통 가운데 손에 든 것은 100통뿐이기도 했다.

       ★ 여기서는 다음메일에게 «직접» 묻는다. IMAP 이 본문까지 뒤져 번호만 돌려준다.
       ⚠ 돌려주는 것은 «번호»뿐이다. 본문을 여기서 실어 나르면 한 번에 수십 MB 가 되고,
         화면은 어차피 목록만 그린다. 줄 내용은 우리 실시간DB 에 이미 있다.
       ⚠ 폴더마다 한 번씩 묻는다. 한꺼번에 뒤지는 길은 IMAP 에 없다.
       ⚠ 찾는 말은 «두 글자 이상»만 받는다. 한 글자면 거의 전부가 걸려 뜻이 없고,
         서버만 오래 붙잡는다.
       ⚠ 다음메일을 «고치지 않는다» — 읽기만 한다. */
    searchMailbox: F
      .region(REGION)
      .runWith({ secrets: ['DAUM_MAIL_PASSWORD'], timeoutSeconds: 300, memory: '512MB' })
      .https.onRequest((req, res) => gate(req, res, async () => {
        const b = req.body || {};
        const q = String(b.q || '').trim();
        if (q.length < 2) { reply(res, 400, { ok: false, error: '두 글자 이상 적어 주세요.' }); return; }

        /* 어느 폴더를 뒤질까 — 안 적으면 «우리가 아는 폴더 전부» */
        const fsnap = await deps.getDatabase().ref(ROOT + '/folders').once('value');
        const folders = fsnap.val() || {};
        const want = Array.isArray(b.slugs) && b.slugs.length
          ? b.slugs.map(String).filter((s) => folders[s])
          : Object.keys(folders);
        if (!want.length) { reply(res, 200, { ok: true, q, hit: {}, n: 0, seen: 0 }); return; }

        const hit = {};
        let n = 0;
        let seen = 0;
        const bad = [];
        for (let i = 0; i < want.length; i++) {
          const slug = want[i];
          try {
            /* ⚠ or 로 묶는다 — body 만 뒤지면 제목에만 있는 말을 놓친다.
                 IMAP 의 TEXT 는 머리글+본문을 함께 보지만 서버마다 셈이 달라,
                 우리가 뜻하는 세 자리를 그대로 적는다. */
            const uids = await withFolder(deps, slug, async (client) => (
              await client.search(
                { or: [{ body: q }, { header: { subject: q } }, { header: { from: q } }] },
                { uid: true }
              )
            ) || []);
            seen++;
            if (uids.length) { hit[slug] = uids.map(Number).filter((u) => u > 0); n += hit[slug].length; }
          } catch (e) {
            /* 한 폴더가 안 되어도 나머지는 돌려준다 — 「하나도 못 찾았다」로 보이면 안 된다 */
            bad.push(slug);
          }
        }
        reply(res, 200, { ok: true, q, hit, n, seen, bad });
      })),

    /* ══════ 휴지통으로 · 폴더 옮기기 ══════
       ⚠ 여기가 거울이 원본을 «고치는» 유일한 자리다(읽음 표시 빼고). 그래서 좁게 만든다 —
         옮기는 것만 되고, 지우는 것(\Deleted+EXPUNGE)은 아예 없다. 다음메일 휴지통에서
         되돌릴 수 있어야 한다. 사람이 화면에서 물음에 답한 뒤에만 여기까지 온다. */
    moveMailMessages: F
      .region(REGION)
      .runWith({ secrets: ['DAUM_MAIL_PASSWORD'], timeoutSeconds: 120, memory: '512MB' })
      .https.onRequest((req, res) => gate(req, res, async () => {
        const b = req.body || {};
        const from = String(b.from || '');
        const to = String(b.to || '');
        const uids = (Array.isArray(b.uids) ? b.uids : []).map(String).filter((u) => /^\d+$/.test(u));
        if (!from || !to || !uids.length) { reply(res, 400, { ok: false, error: '무엇을 어디로 옮길지 알 수 없습니다.' }); return; }
        if (from === to) { reply(res, 400, { ok: false, error: '같은 폴더입니다.' }); return; }
        if (uids.length > 200) { reply(res, 400, { ok: false, error: '한 번에 200통까지 옮길 수 있습니다.' }); return; }

        const dest = await folderPath(deps, to);
        await withFolder(deps, from, async (client) => {
          await client.messageMove(uids.join(','), dest, { uid: true });
        }, { write: true });

        /* 우리 목록에서도 곧바로 뺀다 — 다음 회차를 기다리면 지운 것이 잠깐 되살아 보인다 */
        const up = {};
        uids.forEach((u) => { up[ROOT + '/msgs/' + from + '/' + u] = null; });
        await deps.getDatabase().ref().update(up);

        reply(res, 200, { ok: true, moved: uids.length });
      })),

    /* ══════ 첨부 하나 내려받기 ══════
       창고에 옮겨 담지 않는다 — 옮기면 그 순간부터 두 곳을 지켜야 하고, 지운 뒤에도
       사본이 남는다. 그 자리에서 받아 그대로 넘긴다. */
    readMailAttachment: F
      .region(REGION)
      .runWith({ secrets: ['DAUM_MAIL_PASSWORD'], timeoutSeconds: 300, memory: '1GB' })
      .https.onRequest((req, res) => gate(req, res, async () => {
        const b = req.body || {};
        const slug = String(b.slug || '');
        const uid = String(b.uid || '');
        const idx = Number(b.index);
        /* 조각 이름(1.2 처럼 숫자와 점만)이 오면 그것으로 집는다 — 번호보다 튼튼하다.
           옛 화면이 아직 번호만 보낼 수 있으므로 번호도 받는다. */
        const part = /^[0-9]+(\.[0-9]+)*$/.test(String(b.part || '')) ? String(b.part) : '';
        if (!slug || !/^\d+$/.test(uid) || (!part && !(Number.isInteger(idx) && idx >= 0))) {
          reply(res, 400, { ok: false, error: '어느 첨부인지 알 수 없습니다.' }); return;
        }

        const got = await withFolder(deps, slug, async (client) => {
          const head = await client.fetchOne(uid, { uid: true, size: true, bodyStructure: true }, { uid: true });
          if (!head) throw Object.assign(new Error('그 메일이 없습니다'), { status: 404 });
          const parts = pickParts(head.bodyStructure, null, 0);
          /* ⚠ 조각 이름이 있으면 «반드시» 첨부 목록 안에 있는 것이어야 한다.
             아무 조각이나 받아 주면 이 창구가 본문을 통째로 꺼내는 길이 된다. */
          const a = part ? parts.atts.find((x) => x.part === part) : parts.atts[idx];
          if (!a) throw Object.assign(new Error('그 첨부가 없습니다'), { status: 404 });
          if (Number(a.size || 0) > ATT_MAX) throw Object.assign(new Error('너무 큽니다 — 다음메일에서 내려받아 주세요'), { status: 413 });
          const d = await client.download(uid, a.part, { uid: true });
          const buf = await drain(d.content, ATT_MAX);
          return { name: a.name, mime: a.mime || 'application/octet-stream', b64: buf.toString('base64') };
        });

        reply(res, 200, Object.assign({ ok: true }, got));
      })),
  };
};

/* 검사에서 부를 수 있게 열어 둔다 — 값 판단(pickParts)과 «한 회차 돌리기»(runSync).
   runSync 는 opts.client 로 가짜 메일함을 끼울 수 있다. */
module.exports.pickParts = pickParts;
module.exports.runSync = runSync;
module.exports.ROOT = ROOT;
module.exports.CHUNK = CHUNK;
