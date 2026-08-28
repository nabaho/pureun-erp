/* 기업정보함(명함 모음) → 업체관리 담당자 메일 (대표 요청 2026-08-27)
   ══════════════════════════════════════════════════════════════════
   대표: 「푸른 이알피와 기업정보함을 연결해서 노무사와 직원의 담당사업장의
         직원의 이메일 등을 연결시켜 달라」

   기업정보함에 명함 6,636장이 있고 그중 4,387장에 메일 주소가 있다. 그 주소가
   급여 사업장과 이어지면, 그 사업장 메일이 담당자 칸으로 저절로 간다.

   ⚠ 새 칸을 만들지 않는다. 업체관리의 `contacts[]` + 딸림값 셋에 넣는다 —
     업체관리 화면·급여데이터함·메일 배달이 모두 그 칸을 이미 본다.
   ⚠ 두 사업장에 걸리는 명함은 **아무 데도 안 넣는다.** 한쪽을 골라 넣으면
     남의 업체에 엉뚱한 사람이 붙는다.
   ⚠ 급여 사업장만 본다. 자문·사무대행까지 훑으면 엉뚱한 곳이 섞인다.

   화면(pu-erp.html)은 이 파일을 불러 쓰고 그리기만 한다.
   ── 검사: tests/co-cards-pull.test.js */
(function (root) {
  'use strict';

  var EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

  /* 명함 한 장에서 메일 주소를 모은다.
     ⚠ 칸 이름을 못 박지 않는다 — 기업정보함 칸 이름이 시기마다 달랐다(e·email·이메일).
       글자 칸을 다 훑어 주소 꼴을 캔다.
     ⚠ 사진 번호·열쇠는 건너뛴다 — 거기 주소가 들 일은 없고, 긴 글자라 헛일이다. */
  var SKIP_KEYS = { photoId: 1, id: 1, _k: 1, thumb: 1, img: 1, blob: 1 };

  function cardEmails(card) {
    var out = {}, list = [];
    if (!card || typeof card !== 'object') return list;
    Object.keys(card).forEach(function (k) {
      if (SKIP_KEYS[k]) return;
      var v = card[k];
      if (typeof v !== 'string') return;
      var m = v.match(EMAIL);
      if (!m) return;
      m.forEach(function (a) {
        var low = a.toLowerCase();
        if (out[low]) return;
        out[low] = 1; list.push(a);
      });
    });
    return list;
  }

  /* ⚠ 칸 이름이 두 벌이다. 화면이 늘 들고 있는 **경량 색인**(pucards/idx)은
     짧은 이름(n·c·bz·e)을 쓰고, 원본 명함(pucards/items)은 긴 이름
     (company·bizno·ceo)을 쓴다. 색인을 쓰면 2.9MB 를 안 받는다(요금).
     그래서 둘 다 받아 준다 — 한쪽만 맞추면 다른 데서 통째로 안 잡힌다. */
  function cardName(card) {
    /* 명함이면 그 **사람**(n), 사업자등록증이면 대표자(ceo).
       ceo 를 먼저 보면 명함에서도 대표 이름이 나와 엉뚱한 사람이 적힌다. */
    var keys = String((card && card.k) || '') === 'biz'
      ? ['ceo', 'n', 'name', '대표자']
      : ['n', 'name', '이름', '성명', 'ceo'];
    for (var i = 0; i < keys.length; i++) {
      var v = String((card && card[keys[i]]) || '').trim();
      if (v) return v;
    }
    return '';
  }

  function cardCompany(card) {
    var keys = ['company', 'c', 'co', '회사', '회사명', '업체명'];
    for (var i = 0; i < keys.length; i++) {
      var v = String((card && card[keys[i]]) || '').trim();
      if (v) return v;
    }
    return '';
  }

  function cardBizNo(card) {
    var keys = ['bizno', 'bizNo', 'bz', '사업자등록번호', '사업자번호'];
    for (var i = 0; i < keys.length; i++) {
      var d = String((card && card[keys[i]]) || '').replace(/\D/g, '');
      if (d.length >= 10) return d.slice(0, 10);
    }
    return '';
  }

  /* 이름 다듬기 — 업체관리 쪽과 같은 잣대여야 같은 곳을 찾는다.
     ⚠ 괄호 안 지점말은 지운다 **여기서는**. 명함은 「효마을 푸드스토리」라고만
       적혀 있고 업체관리는 「효마을푸드스토리(양지요양원)」이다 — 앞머리로도 본다. */
  function norm(v) {
    return String(v == null ? '' : v).normalize('NFC')
      .replace(/[㈜]/g, '').replace(/\(주\)|\(유\)|\(재\)|\(사\)/g, '')
      .replace(/주식회사|유한회사|합자회사|농업회사법인|영농조합법인|영어조합법인|사회복지법인|의료법인|재단법인|사단법인/g, '')
      .replace(/\s+/g, '').replace(/[.,·・\-–—_'"’”()]/g, '').toLowerCase();
  }
  function stem(v) {
    return norm(String(v == null ? '' : v).normalize('NFC').replace(/\(.*$/, ''));
  }
  function bizNo10(v) {
    var d = String(v == null ? '' : v).replace(/\D/g, '');
    return d.length >= 10 ? d.slice(0, 10) : '';
  }

  /* 업체를 세 가지 열쇠로 색인한다. 한 열쇠에 두 업체가 걸리면 그 열쇠는 **버린다** —
     골라 넣으면 남의 업체에 엉뚱한 사람이 붙는다. */
  function indexCompanies(companies) {
    var byBiz = {}, byName = {}, byStem = {};
    (companies || []).forEach(function (co) {
      if (!co || !co.id) return;
      var b = bizNo10(co.bizNo);
      if (b) (byBiz[b] = byBiz[b] || []).push(co);
      var n = norm(co.name);
      if (n) (byName[n] = byName[n] || []).push(co);
      var s = stem(co.name);
      if (s.length >= 3) (byStem[s] = byStem[s] || []).push(co);
    });
    return { byBiz: byBiz, byName: byName, byStem: byStem };
  }

  /* 이미 업체관리에 적혀 있는 주소 — 다시 넣지 않는다 */
  function knownEmails(companies) {
    var seen = {};
    (companies || []).forEach(function (co) {
      cardEmails(co).forEach(function (e) { seen[e.toLowerCase()] = 1; });
      /* contacts[] 는 객체 배열이라 글자 칸 훑기로는 안 잡힌다 */
      (Array.isArray(co && co.contacts) ? co.contacts : []).forEach(function (c) {
        var e = String((c && c.email) || '').trim().toLowerCase();
        if (e) seen[e] = 1;
      });
    });
    return seen;
  }

  /* ── 맞추기 ──
     차례가 있다: ① 사업자번호 ② 이름 그대로 ③ 이름 앞머리.
     사업자번호가 가장 확실하다 — 이름이 아무리 달라도 번호가 같으면 같은 곳이다. */
  function matchOne(card, idx) {
    var one = function (map, key, how) {
      if (!key) return null;
      var g = map[key];
      if (!g || g.length !== 1) return null;      // 없거나 둘 이상이면 안 고른다
      return { co: g[0], how: how };
    };
    return one(idx.byBiz, cardBizNo(card), 'biz')
      || one(idx.byName, norm(cardCompany(card)), 'name')
      || one(idx.byStem, stem(cardCompany(card)), 'stem');
  }

  /* 명함 전부를 훑어 업체별로 「넣을 주소」를 모은다.
     companies 는 **이미 급여만 걸러 온 명단**이어야 한다. */
  function plan(cards, companies, opt) {
    var o = opt || {};
    var idx = indexCompanies(companies);
    var known = knownEmails(companies);
    var byCo = {}, ambig = 0, seenMail = {};

    (cards || []).forEach(function (card) {
      var mails = cardEmails(card);
      if (!mails.length) return;
      var hit = matchOne(card, idx);
      if (!hit) {
        /* 두 곳에 걸려서 못 고른 것만 센다 — 아예 안 맞는 것은 셀 것도 없다 */
        var b = cardBizNo(card), n = norm(cardCompany(card)), s = stem(cardCompany(card));
        if ((b && (idx.byBiz[b] || []).length > 1)
          || (n && (idx.byName[n] || []).length > 1)
          || (s.length >= 3 && (idx.byStem[s] || []).length > 1)) ambig++;
        return;
      }
      mails.forEach(function (m) {
        var low = m.toLowerCase();
        if (known[low]) return;              // 업체관리에 이미 있다
        if (seenMail[low]) return;           // 명함 두 장에 같은 주소
        seenMail[low] = 1;
        var id = hit.co.id;
        byCo[id] = byCo[id] || { co: hit.co, rows: [] };
        byCo[id].rows.push({
          email: m, name: cardName(card), how: hit.how,
          cardId: String(card.id || card._k || ''),
          cardCompany: cardCompany(card)
        });
      });
    });

    var items = Object.keys(byCo).map(function (id) { return byCo[id]; });
    /* 담당자별로 묶는다 — 「자기 사업장만 확인하면 된다」가 대표의 뜻이다 */
    items.sort(function (a, b) {
      var am = String(a.co.managerMain || ''), bm = String(b.co.managerMain || '');
      if (am !== bm) return am.localeCompare(bm);
      return String(a.co.name || '').localeCompare(String(b.co.name || ''), 'ko');
    });
    var mails = 0;
    items.forEach(function (x) { mails += x.rows.length; });
    return { items: items, ambig: ambig, sites: items.length, mails: mails,
      stuck: o.stuck ? solves(items, o.stuck) : 0 };
  }

  /* 공용 칸에 쌓인 주소 중 몇 건이 이것으로 풀리나 — 「해서 뭐가 좋아지나」다 */
  function solves(items, stuck) {
    var n = 0;
    (items || []).forEach(function (x) {
      x.rows.forEach(function (r) {
        var c = (stuck || {})[String(r.email).toLowerCase()];
        if (c) n += Number(c) || 0;
      });
    });
    return n;
  }

  /* ── 업체 한 곳에 쓸 것 ──
     ⚠ 이미 적힌 담당자를 덮지 않는다. 새 사람으로 **아래에** 붙인다.
     ⚠ 대표 담당자 자리를 빼앗지 않는다 — 이미 대표가 있으면 그대로 둔다. */
  function patchFor(co, rows) {
    var base = co || {};
    var arr = (Array.isArray(base.contacts) ? base.contacts : []).map(function (c) {
      return Object.assign({}, c);
    });
    if (!arr.length && base.primaryContactName) {
      arr.push({ name: base.primaryContactName, phone: base.primaryContactPhone || '',
        email: base.primaryContactEmail || '', isPrimary: true });
    }
    var have = {};
    arr.forEach(function (c) {
      var e = String((c && c.email) || '').trim().toLowerCase();
      if (e) have[e] = 1;
    });
    var added = 0;
    (rows || []).forEach(function (r) {
      var low = String(r.email || '').trim().toLowerCase();
      if (!low || have[low]) return;
      have[low] = 1;
      arr.push({ name: String(r.name || '').trim(), position: '기업정보함',
        phone: '', email: String(r.email).trim(), isPrimary: arr.length === 0 });
      added++;
    });
    if (!added) return { patch: {}, added: 0, changed: false };
    if (!arr.some(function (c) { return c.isPrimary; })) arr[0].isPrimary = true;
    var pri = arr.filter(function (c) { return c.isPrimary; })[0] || arr[0] || {};
    return {
      added: added, changed: true,
      patch: {
        contacts: arr,
        primaryContactName: pri.name || '',
        primaryContactPhone: pri.phone || '',
        primaryContactEmail: pri.email || ''
      }
    };
  }

  function writes(items, picked) {
    var out = [];
    (items || []).forEach(function (x) {
      var rows = (x.rows || []).filter(function (r) {
        return !picked || picked[String(x.co.id) + '|' + String(r.email).toLowerCase()] !== false;
      });
      if (!rows.length) return;
      var r = patchFor(x.co, rows);
      if (r.changed) out.push({ id: x.co.id, name: x.co.name, patch: r.patch, added: r.added });
    });
    return out;
  }

  root.PuCoCards = {
    cardEmails: cardEmails, cardName: cardName, cardCompany: cardCompany, cardBizNo: cardBizNo,
    norm: norm, stem: stem, bizNo10: bizNo10,
    indexCompanies: indexCompanies, knownEmails: knownEmails, matchOne: matchOne,
    plan: plan, solves: solves, patchFor: patchFor, writes: writes
  };
})(typeof window !== 'undefined' ? window : globalThis);
