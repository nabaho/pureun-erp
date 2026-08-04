/* 푸른통합시스템 — 서류 등록 층
   판독한 서류를 명함첩에 넣는 유일한 파일이다.
   판독 층(pu-doc-read.js)이 "읽기"를 아는 유일한 파일인 것과 짝을 이룬다.
   화면은 이 파일의 함수 하나를 부르고 결과 문구만 띄운다 —
   그래서 사진첩 화면은 명함첩이 어떻게 생겼는지 몰라도 된다.

   ⚠ 이 층은 **실데이터를 만진다.** 지켜야 할 것 네 가지:
   1. 반드시 다중 경로 update 한 번. 상위 노드를 통째로 set 하면 남의 명함이
      지워진다(2026-07 실데이터 사고).
   2. 검색 인덱스(pucards/idx)를 레코드와 **함께** 쓴다. 안 쓰면 명함첩·
      푸른이알피의 검색이 이 명함을 못 찾는다.
   3. 이미 있는 명함이면 **빈 칸만** 채운다. 기존 값을 절대 덮지 않는다.
   4. 읽어낸 것이 없으면 아무것도 만들지 않는다(빈 껍데기 금지). */
(function (global) {
  'use strict';

  var CARDS_ROOT = 'pucards';

  var deps = { db: null };
  function init(o) { o = o || {}; deps.db = o.db || null; return true; }

  /* 명함첩 레코드 종류 — 판독 종류와 이름이 다르다. */
  var TO_CARD_KIND = { card: 'card', bizreg: 'biz' };

  /* 화면에 "무엇을 채웠는지" 한국어로 알리려고 쓰는 표. */
  var FIELD_LABEL = {
    name: '이름', company: '회사명', ceo: '대표자', bizno: '사업자번호',
    corpno: '법인번호', openDate: '개업일', bizType: '업태', bizItem: '종목',
    dept: '부서', title: '직책', mobile: '휴대폰', tel: '전화', fax: '팩스',
    email: '이메일', companyTel: '대표번호', companyFax: '회사팩스',
    companyAddr: '회사주소', address: '소재지', website: '홈페이지', memo: '메모'
  };

  function digits(v) { return String(v == null ? '' : v).replace(/\D/g, ''); }
  function blank(v) { return v === undefined || v === null || String(v).trim() === ''; }

  /* 언제 저장된 것과 겹쳤는지 사람 말로. 밀리초를 그대로 보여주면 아무 뜻이 없다. */
  function whenText(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
      ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  /* 겹친 상대가 무엇인지 — '홍길동 · 가나상사'. 번호만 보여주면 못 알아본다. */
  function whoText(rec) {
    var r = rec || {};
    return [r.name, r.company].filter(function (v) { return !blank(v); }).join(' · ');
  }

  /* ── 이미 있는 것 찾기 ──
     명함첩과 **같은 기준**으로 중복을 본다 — 명함은 휴대폰 숫자,
     사업자등록증은 사업자번호 숫자. 기준이 다르면 같은 사람이 두 번 쌓인다.
     열쇠가 없으면(휴대폰 없는 명함 등) 찾지 않는다 — 이름만으로 붙이면
     동명이인이 서로를 덮는다. */
  function dedupKey(kind, fields) {
    if (kind === 'card') return digits(fields && fields.mobile);
    if (kind === 'bizreg') return digits(fields && fields.bizno);
    return '';
  }

  function findExisting(kind, fields) {
    var key = dedupKey(kind, fields);
    var want = TO_CARD_KIND[kind];
    if (!key || !want) return Promise.resolve(null);
    if (!deps.db) return Promise.reject(new Error('실시간DB가 연결되지 않았습니다'));
    return deps.db.ref(CARDS_ROOT + '/idx').once('value').then(function (s) {
      var idx = s.val() || {};
      var ids = Object.keys(idx);
      for (var i = 0; i < ids.length; i++) {
        var row = idx[ids[i]] || {};
        if ((row.k || 'card') !== want) continue;   // 종류가 다르면 다른 물건이다
        var mine = want === 'biz' ? digits(row.bz) : digits(row.m);
        if (mine && mine === key) return { id: ids[i], idx: row };
      }
      return null;
    });
  }

  /* ── 빈 칸만 채우기 ──
     들어온 값 중 **기존이 비어 있는 칸에만** 넣은 변경분을 돌려준다.
     빈 값을 실어 보내면 기존 대표자·주소를 지운다 — 자동 입력의 최대 위험. */
  function fillGaps(existing, incoming) {
    var was = existing || {}, now = incoming || {}, out = {};
    for (var k in now) {
      if (!Object.prototype.hasOwnProperty.call(now, k)) continue;
      if (k === 'kind' || k === 'id') continue;      // 종류·번호를 바꾸면 다른 물건이 된다
      if (blank(now[k])) continue;
      if (!blank(was[k])) continue;                  // 이미 있는 값은 손대지 않는다
      out[k] = now[k];
    }
    return out;
  }

  /* ── 검색 인덱스 ──
     명함첩이 쓰는 약어 이름 그대로 만든다. 이름이 다르면 명함첩·푸른이알피의
     검색이 이 명함을 못 찾는다(경량 인덱스라 다른 앱이 이것만 읽는다). */
  function idxOf(rec) {
    var isBiz = rec.kind === 'biz';
    var row = {
      n: rec.name || '', c: rec.company || '', m: rec.mobile || '', t: rec.tel || '',
      e: rec.email || '', ti: rec.title || '', d: rec.dept || '', ct: rec.companyTel || '',
      ad: isBiz ? (rec.address || '') : (rec.companyAddr || ''),
      k: rec.kind || 'card'
    };
    if (isBiz) { row.bz = rec.bizno || ''; row.ceo = rec.ceo || ''; }
    return row;
  }

  /* ── 명함첩에 보내기 ──
     자동으로 부를 수도 있고(검증 통과분), 사람이 버튼으로 부를 수도 있다.
     돌려주는 것: { id, created, filled[], message } */
  function sendToCards(o) {
    o = o || {};
    var kind = o.kind;
    var want = TO_CARD_KIND[kind];
    if (!want) {
      return Promise.reject(new Error('명함과 사업자등록증만 명함첩으로 보낼 수 있습니다'));
    }
    if (!deps.db) return Promise.reject(new Error('실시간DB가 연결되지 않았습니다'));

    /* 판독 결과를 명함첩 필드 이름으로 바꾼다(변환표는 판독 층에 있다). */
    var mapped = global.PuDocRead.mapTo('cards', kind, o.fields || {});
    delete mapped.kind;                       // 종류는 아래에서 직접 넣는다
    if (!Object.keys(mapped).length) {
      return Promise.reject(new Error('읽어낸 정보가 없어 명함첩에 보낼 수 없습니다'));
    }

    return findExisting(kind, o.fields).then(function (hit) {
      return hit ? fillOne(hit, mapped, want, o) : createOne(o, mapped, want);
    });
  }

  /* ── 이미 있는 명함 = 중복 ──
     빈 칸만 채운다. 이미 있는 값은 덮지 않는다.

     ⚠ 여기서 **언제 저장된 것과 겹쳤는지**를 반드시 함께 돌려준다. 그냥
     '이미 있습니다'라고만 하면 사람은 어느 것이 원본인지 알 수 없고,
     자기 사진이 왜 사라졌는지도 알 수 없다.

     redundant = 이 사진이 더한 것이 하나도 없다는 뜻. 화면은 이때만 사진을
     스스로 치운다(휴지통으로 — 30일 안에 되살릴 수 있다). */
  function fillOne(hit, mapped, want, o) {
    o = o || {};
    return deps.db.ref(CARDS_ROOT + '/items/' + hit.id).once('value').then(function (s) {
      var rec = s.val() || {};
      var gaps = fillGaps(rec, mapped);
      var names = Object.keys(gaps);
      var labels = names.map(function (n) { return FIELD_LABEL[n] || n; });

      var u = {};
      for (var i = 0; i < names.length; i++) {
        u[CARDS_ROOT + '/items/' + hit.id + '/' + names[i]] = gaps[names[i]];
      }

      /* 사진이 없던 명함이라면 이 사진이 **첫 사진**이다 — 빈 칸을 채우는 것과 같다.
         (사진이 이미 있으면 덮지 않는다. 원래 것이 더 나을 수 있다.)
         이 판단이 없으면 '글자는 다 있지만 사진은 없는' 명함에 들어온 사진을
         쓸모없다고 보고 치워 버린다. */
      if (blank(rec.thumb) && !blank(o.thumb)) {
        u[CARDS_ROOT + '/items/' + hit.id + '/thumb'] = o.thumb;
        if (o.full) u[CARDS_ROOT + '/photos/' + hit.id] = o.full;
        if (o.photoId) u[CARDS_ROOT + '/items/' + hit.id + '/photoId'] = o.photoId;
        labels.push('사진');
      }

      var when = whenText(rec.createdAt || rec.updatedAt || 0);
      var who = whoText(Object.assign({}, rec, gaps));
      var head = '이미 명함첩에 있습니다' +
        (when ? ' — ' + when + '에 저장된 것' : '') + (who ? ' (' + who + ')' : '');
      var out = {
        id: hit.id, created: false, filled: labels,
        dup: true, dupAt: rec.createdAt || rec.updatedAt || 0, dupWho: who,
        redundant: !labels.length
      };

      if (!labels.length) {
        out.message = head + '과 같고, 새로 채울 것이 없었습니다';
        return out;                                 // 쓸 것이 없으면 아무것도 쓰지 않는다
      }
      /* 인덱스도 같이 갱신해야 검색에 새 값이 잡힌다. */
      u[CARDS_ROOT + '/idx/' + hit.id] = idxOf(Object.assign({}, rec, gaps, { kind: want }));
      out.message = head + '. 빈 칸 ' + labels.length + '개를 채웠습니다 (' + labels.join('·') + ')';
      return deps.db.ref().update(u).then(function () { return out; });
    });
  }

  /* 새 명함 — 레코드·검색 인덱스·사진을 한 번의 update 로. */
  function createOne(o, mapped, want) {
    var id = deps.db.ref(CARDS_ROOT + '/items').push().key;
    var rec = Object.assign({}, mapped, {
      id: id,
      kind: want,
      thumb: o.thumb || '',              // 목록용 미리보기(없으면 명함첩 격자가 빈다)
      fav: false,
      scope: 'shared',                   // 전 직원 공유 (사진첩 설계와 같게)
      createdAt: o.takenAt || Date.now(),
      updatedAt: Date.now(),
      source: 'pu-photos',               // 어디서 왔는지 남긴다
      photoId: o.photoId || '',          // 사진첩 사진과 잇는 고리
      capturedBy: o.byName || ''
    });
    var u = {};
    u[CARDS_ROOT + '/items/' + id] = rec;
    u[CARDS_ROOT + '/idx/' + id] = idxOf(rec);
    /* 사진은 명함첩이 자기 사본을 갖는다 — 사진첩을 정리해도 명함첩 기록이 온전하게. */
    if (o.full) u[CARDS_ROOT + '/photos/' + id] = o.full;
    var label = want === 'biz' ? '사업자등록증' : '명함';
    return deps.db.ref().update(u).then(function () {
      return {
        id: id, created: true, filled: [],
        message: '명함첩에 ' + label + '으로 새로 넣었습니다'
      };
    });
  }

  global.PuDocFile = {
    init: init,
    findExisting: findExisting,
    fillGaps: fillGaps,
    idxOf: idxOf,
    whenText: whenText,
    sendToCards: sendToCards
  };
})(typeof window !== 'undefined' ? window : globalThis);
