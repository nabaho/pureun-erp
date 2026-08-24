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
    const boxes = (await client.list()).filter(MB.isSyncable);
    const syncSnap = (await db.ref(ROOT + '/sync').once('value')).val() || {};

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

    /* ③ 예산이 남는 동안 «줄 서서 몇 바퀴» 돈다.
       첫 배포 회차를 재 보니 폴더 33개를 한 바퀴 도는 데 30초였다 — 예산은 460초다.
       한 바퀴만 돌면 폴더마다 한 뭉치씩이라 몇 만 통을 다 가져오는 데 하루가 걸린다.
       그래서 폴더를 «줄»로 세우고, 아직 남은 폴더는 줄 끝에 다시 세운다. 예산이 다할
       때까지 돌고, 다 끝난 폴더는 줄에서 빠지므로 헛돌지 않는다.
       ⚠ 돌려 세우는 것이 요점이다 — 앞 폴더를 끝까지 파면 그 사이 뒤 폴더는 한 통도
         안 온다. 대표 눈에는 「어떤 칸은 되고 어떤 칸은 안 된다」로 보인다. */
    const queue = plan.slice();
    let pruned = 0;
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
            const alive = {};
            p.uids.forEach((u) => { alive[String(u)] = 1; });
            const have = (await db.ref(ROOT + '/msgs/' + p.slug).once('value')).val() || {};
            const gone = {};
            let g = 0;
            Object.keys(have).forEach((k) => {
              if (!alive[k]) { gone[ROOT + '/msgs/' + p.slug + '/' + k] = null; g++; }
            });
            if (g) await db.ref().update(gone);
            out.removed += g;
            p.sync.n = p.uids.length;
            /* 이번에 «살아 있던 통수»를 적어 둔다 — 다음 회차에 이보다 줄었으면
               지운 것이 있다는 뜻이라 그때 다시 읽는다. */
            p.sync.lastN = p.uids.length;
            p.sync.prunedAt = nowMs();
          } catch (e) {
            console.warn('syncMailbox 정리 실패:', p.box.path, String((e && e.message) || e));
          }
        }
      } finally {
        try { lock.release(); } catch (_) { /* 이미 놓였다 */ }
      }

      p.sync.at = nowMs();
      p.sync.ver = MB.ROW_VER;
      /* 통수는 «번호 목록의 길이»가 진짜다 — STATUS 가 주는 값이 서버마다 달랐다
         (실측 2026-08-24: 열두 폴더가 나란히 400 으로 나왔다). 목록은 셀 수 있다. */
      p.sync.total = p.uids ? p.uids.length : Number(p.st.messages || 0);
      if (p.uids) {
        /* 옆줄 폴더 줄이 보는 값도 같은 값으로 맞춘다 */
        await db.ref(ROOT + '/folders/' + p.slug + '/total').set(p.uids.length);
      }
      await db.ref(ROOT + '/sync/' + p.slug).update(p.sync);
      if (more) queue.push(p);          // 아직 남았다 — 줄 끝에 다시 세운다
    }

    /* ⑤ 셈은 «끝난 뒤 한 번만» 한다. 바퀴마다 세면 같은 폴더를 여러 번 센다 —
       「기다리는 폴더 33개」가 「198개」로 보이면 그 숫자를 못 믿게 된다. */
    plan.forEach((p) => { if (p.sync && p.sync.done) out.ready++; else out.waiting++; });
    out.turns = turns;

    await db.ref(ROOT + '/meta').update({
      at: nowMs(), ok: true, folders: out.folders, rows: out.rows,
      removed: out.removed, ready: out.ready, waiting: out.waiting, turns: turns, err: '',
    });
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

async function withFolder(deps, slug, fn, opts) {
  const write = !!(opts && opts.write);
  const path = await folderPath(deps, slug);

  const user = await deps.mailUserAsync();
  const pass = deps.mailPass();
  if (!user || !pass) { const e = new Error('메일 계정이 설정되지 않았습니다'); e.status = 500; throw e; }

  const client = await connect(deps, user, pass);
  try {
    const lock = await client.getMailboxLock(path, { readOnly: !write });
    try { return await fn(client); } finally {
      try { lock.release(); } catch (_) { /* 이미 놓였다 */ }
    }
  } finally {
    try { await client.logout(); } catch (_) { /* 이미 끊겼다 */ }
  }
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
  out = out || { html: null, text: null, atts: [] };
  if (!node || (depth || 0) > 8) return out;
  const kids = node.childNodes || node.children;
  if (Array.isArray(kids)) {
    kids.forEach((k) => pickParts(k, out, (depth || 0) + 1));
    return out;
  }
  const type = String(node.type || '').toLowerCase();
  const disp = String(node.disposition || '').toLowerCase();
  const fname = (node.dispositionParameters && node.dispositionParameters.filename) ||
                (node.parameters && node.parameters.name) || '';
  const isAtt = disp === 'attachment' || (fname && type.indexOf('text/') !== 0 && !node.id);
  if (isAtt) {
    out.atts.push({
      part: String(node.part || ''), name: String(fname || '이름없는첨부'),
      mime: type, size: Number(node.size || 0),
    });
    return out;
  }
  if (type === 'text/html' && !out.html) out.html = String(node.part || '');
  if (type === 'text/plain' && !out.text) out.text = String(node.part || '');
  return out;
}

module.exports = function build(deps) {
  const F = deps.functions;
  const REGION = deps.MAIL_REGION;

  /* 총괄관리자만. 회사 메일함에는 고객사 임직원의 신상이 그대로 들어 있다.
     창고·DB 규칙은 uid_roles 를 못 보는 자리가 있어, 서버가 여기서 다시 따진다. */
  async function requireAdmin(req) {
    const decoded = await deps.requireStaff(req);
    const snap = await deps.getDatabase().ref('uid_roles/' + decoded.uid + '/isAdmin').once('value');
    if (snap.val() !== true) {
      const e = new Error('총괄관리자만 메일함을 볼 수 있습니다.');
      e.status = 403;
      throw e;
    }
    return decoded;
  }

  function reply(res, code, body) {
    res.status(code).json(body);
  }

  async function gate(req, res, fn) {
    deps.setCors(req, res);
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST') { reply(res, 405, { ok: false, error: 'POST 요청만 허용됩니다.' }); return; }
    try {
      await requireAdmin(req);
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
        if (!slug || !/^\d+$/.test(uid)) { reply(res, 400, { ok: false, error: '어느 메일인지 알 수 없습니다.' }); return; }

        const got = await withFolder(deps, slug, async (client) => {
          const head = await client.fetchOne(uid, { uid: true, size: true, bodyStructure: true, envelope: true }, { uid: true });
          if (!head) throw Object.assign(new Error('그 메일이 없습니다 — 다음메일에서 지워졌을 수 있습니다'), { status: 404 });

          /* 읽음 표시 — 다음메일에서 열었을 때와 «같게» 만든다. 이것을 안 하면 앱에서
             다 읽었는데도 옆줄의 「안읽음」이 영원히 그 수로 남는다.
             ⚠ 실패해도 본문은 보여 준다. 표시가 안 된 것보다 못 읽는 것이 나쁘다. */
          try { await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true }); } catch (_) { /* 표시만 못 했다 */ }
          try {
            await deps.getDatabase().ref(ROOT + '/msgs/' + slug + '/' + uid + '/r').set(1);
          } catch (_) { /* 목록 쪽 표시는 다음 회차에 맞춰진다 */ }

          const size = Number(head.size || 0);
          if (size && size <= BODY_FULL_MAX) {
            const { simpleParser } = require('mailparser');
            const one = await client.fetchOne(uid, { uid: true, source: true }, { uid: true });
            const p = await simpleParser(one.source);
            return {
              html: p.html || '', text: String(p.text || ''),
              atts: (p.attachments || [])
                .filter((a) => !(a.contentDisposition === 'inline' && a.cid))
                .map((a, i) => ({ i: i, part: '', name: String(a.filename || '이름없는첨부'),
                  mime: String(a.contentType || ''), size: Number(a.size || 0) })),
              full: true,
            };
          }

          /* 큰 메일 — 본문 부분만 */
          const parts = pickParts(head.bodyStructure, null, 0);
          let html = '', text = '';
          if (parts.html) {
            const d = await client.download(uid, parts.html, { uid: true });
            html = (await drain(d.content, BODY_FULL_MAX)).toString('utf8');
          } else if (parts.text) {
            const d = await client.download(uid, parts.text, { uid: true });
            text = (await drain(d.content, BODY_FULL_MAX)).toString('utf8');
          }
          return {
            html: html, text: text,
            atts: parts.atts.map((a, i) => Object.assign({ i: i }, a)),
            full: false,
          };
        }, { write: true });

        reply(res, 200, Object.assign({ ok: true }, got));
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
        if (!slug || !/^\d+$/.test(uid) || !Number.isInteger(idx) || idx < 0) {
          reply(res, 400, { ok: false, error: '어느 첨부인지 알 수 없습니다.' }); return;
        }

        const got = await withFolder(deps, slug, async (client) => {
          const head = await client.fetchOne(uid, { uid: true, size: true, bodyStructure: true }, { uid: true });
          if (!head) throw Object.assign(new Error('그 메일이 없습니다'), { status: 404 });
          const parts = pickParts(head.bodyStructure, null, 0);
          const a = parts.atts[idx];
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
