/* 사업장 하나로 오간 것을 한 줄기로 (대표 목표 2026-08-30)
   ══════════════════════════════════════════════════════════════════
   대표: 「푸른메일함에 직원의 거래처와 관련된 사업장의 메일을 동기화해서 연결…
         추후에 그 사업장과 관련된 카카오톡과 문자 등의 정보도 당겨오게」

   여태 자료가 세 곳에 흩어져 있었다 — 받은 메일(paydata/maillog), 보낸 메일
   (pucards sentBox), 그리고 급여데이터함 서랍. 「이 사업장과 무슨 이야기가
   오갔나」를 보려면 세 화면을 따로 열어야 했다.

   ⚠ **갈래(source)를 밖에서 넣는다.** 문자·카톡은 아직 없다 — 나중에 생기면
     `SOURCES` 에 한 줄 더하면 되고, 화면은 손대지 않는다. 화면이 갈래마다
     갈라져 있으면 갈래가 늘 때마다 화면을 고치게 된다.
   ⚠ 사본을 만들지 않는다. 있는 자리를 **읽어서 한 줄기로 세울 뿐**이다 —
     옮겨 담으면 어느 쪽이 진짜인지 알 수 없어진다.

   화면(pu-cards.html)은 이 파일을 불러 쓰고 그리기만 한다.
   ── 검사: tests/co-thread.test.js */
(function (root) {
  'use strict';

  /* 갈래 하나의 모양.
       key   : 줄에 붙일 이름표(mail-in · mail-out · sms · kakao …)
       label : 사람에게 보일 말
       rows  : 그 갈래의 자료를 표준 줄로 바꾸는 함수 */
  function norm(v) {
    return String(v == null ? '' : v).normalize('NFC')
      .replace(/[㈜]/g, '').replace(/\(주\)|\(유\)/g, '')
      .replace(/주식회사|유한회사|농업회사법인|사회복지법인|의료법인/g, '')
      .replace(/\s+/g, '').replace(/[.,·・\-–—_'"]/g, '').toLowerCase();
  }

  function mailOf(v) {
    var m = String(v == null ? '' : v).match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
    return m ? m[0].toLowerCase() : '';
  }

  /* 이 줄이 그 사업장 것인가 — 세 가지로 본다.
     ① 줄에 사업장 번호가 적혀 있다(가장 확실하다)
     ② 오간 주소가 그 사업장에 적힌 주소다
     ③ 제목에 그 사업장 이름이 있다(짧은 이름은 안 본다 — 아무 데나 걸린다)
     ⚠ ③ 은 **짐작**이다. 줄에 그렇다고 적어 화면이 갈라 보일 수 있게 한다. */
  function matchRow(row, co, addrs) {
    if (!row || !co) return '';
    if (row.companyId && String(row.companyId) === String(co.id)) return 'id';
    var a = mailOf(row.from) || mailOf(row.to);
    if (a && addrs && addrs[a]) return 'addr';
    var n = norm(co.name);
    if (n.length >= 3) {
      var text = norm(String(row.subject || '') + ' ' + String(row.text || ''));
      if (text.indexOf(n) >= 0) return 'text';
    }
    return '';
  }

  /* 그 사업장에 적힌 주소들 — 업체관리 담당자·세무사무실 */
  function addrsOf(co) {
    var out = {};
    if (!co) return out;
    (Array.isArray(co.contacts) ? co.contacts : []).forEach(function (c) {
      var e = mailOf(c && c.email);
      if (e) out[e] = 1;
    });
    [co.primaryContactEmail, co.taxEmail, co.email].forEach(function (v) {
      var e = mailOf(v);
      if (e) out[e] = 1;
    });
    return out;
  }

  /* 주소 → 그 주소를 적어 둔 사업장들.
     ⚠ 한 사장이 여러 사업장을 하면서 «메일 주소는 하나»만 쓰는 곳이 많다.
       2026-09-02 실제 자료로 재 보니 받은 메일 72줄 중 33줄이 여러 곳에
       한꺼번에 걸렸다(안경원 네 곳 등). 그때 제목이 한 곳을 집어 말하면
       그곳 것으로 좁힌다 — 서버(mail-receive.companyOf)가 자료를 나눌 때
       쓰는 것과 «같은 규칙»이다. 달리 보면 자료는 A 로 갔는데 목록에는
       네 곳에 다 보이는 어긋남이 생긴다. */
  var _ixCache = (typeof WeakMap === 'function') ? new WeakMap() : null;
  function addrIndex(all) {
    if (!Array.isArray(all)) return null;
    if (_ixCache && _ixCache.has(all)) return _ixCache.get(all);
    var ix = {};
    all.forEach(function (co) {
      if (!co) return;
      Object.keys(addrsOf(co)).forEach(function (e) {
        (ix[e] = ix[e] || []).push(co);
      });
    });
    if (_ixCache) _ixCache.set(all, ix);
    return ix;
  }

  /* 여럿 가운데 제목이 «집어 말한» 곳들. 한 곳도 안 집으면 빈손을 준다 —
     그때는 아무 곳도 지우지 않는다(함부로 지우면 아예 안 보이게 된다).
     둘을 집으면 그 둘만 남는다 — 안 집힌 곳은 그 통과 상관이 없다. */
  function named(row, cands) {
    var text = norm(String((row && row.subject) || '') + ' ' + String((row && row.text) || ''));
    var out = [];
    (cands || []).forEach(function (c) {
      var n = norm(c && c.name);
      if (n.length >= 3 && text.indexOf(n) >= 0) out.push(c);
    });
    return out;
  }

  /* 한 줄기로 세운다 — 갈래가 몇이든 시각 내림차순 한 줄기.
     sources: [{ key, label, rows: [표준 줄] }]
     표준 줄: { id, at, who, subject, text, companyId, from, to, atts, meta }
     opt.all: 업체 명단 전체(주면 주소를 나눠 쓰는 곳을 제목으로 좁힌다) */
  function thread(co, sources, opt) {
    var o = opt || {};
    var addrs = addrsOf(co);
    var ix = addrIndex(o.all);
    var out = [];
    (sources || []).forEach(function (s) {
      if (!s || !Array.isArray(s.rows)) return;
      s.rows.forEach(function (r) {
        var how = matchRow(r, co, addrs);
        if (!how) return;
        if (o.sureOnly && how === 'text') return;   // 짐작은 빼고 본다
        /* 주소로 걸린 것만 좁힌다 — 사업장 번호(id)는 서버가 이미 정한 것이라
           뒤집지 않고, 제목으로 걸린 것(text)은 이미 그 이름이 나온 것이다. */
        if (how === 'addr' && ix) {
          var e = mailOf(r.from) || mailOf(r.to);
          var share = ix[e] || [];
          if (share.length > 1) {
            var pick = named(r, share);
            /* 제목이 어느 곳을 집었는데 그 안에 내가 없으면 다른 곳 것이다 */
            if (pick.length && !pick.some(function (c) { return String(c.id) === String(co.id); })) return;
          }
        }
        out.push({
          key: s.key, label: s.label,
          id: String((r && r.id) || ''),
          at: Number((r && r.at) || 0),
          who: String((r && r.who) || ''),
          subject: String((r && r.subject) || ''),
          text: String((r && r.text) || ''),
          from: String((r && r.from) || ''),
          to: String((r && r.to) || ''),
          atts: Number((r && r.atts) || 0),
          how: how,
          meta: (r && r.meta) || null
        });
      });
    });
    /* 늦게 온 것이 위로 — 「무슨 이야기가 오갔나」는 최근부터 본다 */
    out.sort(function (a, b) { return b.at - a.at; });
    return out;
  }

  /* 갈래별 셈 — 화면이 칩으로 보여 준다 */
  function counts(rows) {
    var c = { all: 0, guess: 0 };
    (rows || []).forEach(function (r) {
      c.all++;
      c[r.key] = (c[r.key] || 0) + 1;
      if (r.how === 'text') c.guess++;
    });
    return c;
  }

  /* ── 갈래 만들기 ──
     ⚠ 자리 이름을 여기 한 곳에만 적는다. 화면 여러 곳에 흩어 놓으면
       자리가 바뀔 때 한 곳만 고치게 된다. */

  /* 받은 메일 — 서버가 적어 둔 목록(paydata/maillog) */
  function fromMailLog(box) {
    var rows = [];
    Object.keys(box || {}).forEach(function (k) {
      var r = box[k] || {};
      if (!r.at) return;
      rows.push({
        id: k, at: Number(r.at || 0),
        who: String(r.from || ''), from: String(r.from || ''),
        subject: String(r.subject || ''), text: String(r.preview || ''),
        companyId: String(r.companyId || ''), atts: Number(r.atts || 0),
        meta: { took: Number(r.took || 0), why: String(r.why || ''),
          seatName: String(r.seatName || ''), box: String(r.box || '') }
      });
    });
    return { key: 'in', label: '받은 메일', rows: rows };
  }

  /* 보낸 메일 — 푸른 메일이 적어 둔 것 */
  function fromSentBox(box) {
    var rows = [];
    Object.keys(box || {}).forEach(function (k) {
      var r = box[k] || {};
      if (!r.at) return;
      var to = String(r.to || '');
      rows.push({
        id: k, at: Number(r.at || 0),
        who: to, to: to,
        subject: String(r.subject || ''), text: String(r.body || ''),
        companyId: String(r.companyId || ''),
        atts: (Array.isArray(r.ids) ? r.ids.length : 0) + (Array.isArray(r.files) ? r.files.length : 0),
        meta: { cc: String(r.cc || ''), by: String(r.by || r.sender || '') }
      });
    });
    return { key: 'out', label: '보낸 메일', rows: rows };
  }

  /* ⚠ 문자·카톡은 **아직 없다**(2026-08-30). 폰 다리는 은행 거래문자만 담고,
     카톡은 받는 길이 아예 없다. 자리가 생기면 여기 한 줄만 더하면 된다 —
     화면·thread()·counts() 는 손대지 않는다. 그것이 이렇게 갈라 둔 까닭이다.
       function fromSms(box) { … return { key:'sms', label:'문자', rows: … }; }
       function fromKakao(box) { … return { key:'kakao', label:'카톡', rows: … }; } */
  var PLANNED = ['sms', 'kakao'];

  root.PuCoThread = {
    norm: norm, mailOf: mailOf, addrsOf: addrsOf, matchRow: matchRow,
    addrIndex: addrIndex, named: named, thread: thread, counts: counts,
    fromMailLog: fromMailLog, fromSentBox: fromSentBox,
    PLANNED: PLANNED
  };
})(typeof window !== 'undefined' ? window : globalThis);
