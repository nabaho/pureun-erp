/* 푸른통합시스템 — 서류 등록 층
   판독한 서류를 명함첩과 업체관리에 넣는 유일한 파일이다.
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

  /* ── 대표님 개인 폴더에 이미 있는가 ──
     개인 폴더로 옮긴 명함은 공유 검색목록(idx)에서 빠진다. 그래서 idx 만 보면
     "없다"고 답하고, 우리가 그 사람을 **공용 목록에 새로 만들어** 감춘 것을
     도로 드러낸다. 지문 목록(pucards/lockkeys)에 있으면 아무것도 만들지 않는다.
     지문은 되돌릴 수 없는 값이라 여기서 누구인지는 알 수 없다 — 있다/없다뿐이다.

     ⚠ 지문 층이 없으면(옛 화면 등) 막지 않고 그냥 지나간다. 여기서 막아 버리면
       개인 폴더를 쓰지도 않는 곳에서 명함이 통째로 안 올라간다. */
  function inPrivateVault(kind, fields) {
    var LK = global.PuLockKey;
    if (!LK || !deps.db) return Promise.resolve(false);
    var key = LK.keyOf(kind, fields);
    if (!key) return Promise.resolve(false);
    return LK.fingerprint(key)
      .then(function (fp) {
        if (!fp) return false;
        return deps.db.ref(LK.pathOf(fp)).once('value').then(function (s) { return !!s.val(); });
      })
      .catch(function () { return false; });
  }

  /* ── 번호 한 칸으로 찾기 ──
     예전에는 명함 한 장을 찍을 때마다 검색목록(idx) **전부**를 내려받아 6천 줄을
     훑었다. 한 장에 1MB 가까이, 여러 장이면 그만큼 되풀이 — 폰에서 느리다.
     명함첩이 pucards/bykey 에 「번호 → 명함번호」를 적어 두므로 한 칸만 읽는다.

     ⚠ 찾아간 명함의 번호를 **다시 맞춰 본다.** 번호를 고친 명함의 옛 열쇠가
       남아 있을 수 있는데, 그대로 믿으면 남의 명함에 이 사진을 붙인다.
     ⚠ 자리가 아직 안 채워졌으면(표시 없음) 옛 방식으로 훑는다. 안 그러면
       "없다"로 읽고 이미 있는 사람을 또 만든다. */
  var BYKEY = 'bykey';
  var BYKEY_FLAG = 'config/bykeyAt';

  function byKeyName(kind, fields) {
    var key = dedupKey(kind, fields);
    if (!key) return '';
    return (TO_CARD_KIND[kind] === 'biz' ? 'b' : 'c') + key;
  }

  function findByKey(kind, fields) {
    var name = byKeyName(kind, fields);
    var want = TO_CARD_KIND[kind];
    var key = dedupKey(kind, fields);
    if (!name) return Promise.resolve(null);
    return deps.db.ref(CARDS_ROOT + '/' + BYKEY + '/' + name).once('value')
      .then(function (s) {
        var id = s.val();
        if (!id || typeof id !== 'string') return null;
        return deps.db.ref(CARDS_ROOT + '/idx/' + id).once('value').then(function (s2) {
          var row = s2.val();
          if (!row) return null;                                  /* 지워진 명함의 옛 열쇠 */
          if ((row.k || 'card') !== want) return null;            /* 종류가 다르면 다른 물건 */
          var mine = want === 'biz' ? digits(row.bz) : digits(row.m);
          if (!mine || mine !== key) return null;                 /* 번호가 바뀐 명함의 옛 열쇠 */
          return { id: id, idx: row };
        });
      });
  }

  function findExisting(kind, fields) {
    var key = dedupKey(kind, fields);
    var want = TO_CARD_KIND[kind];
    if (!key || !want) return Promise.resolve(null);
    if (!deps.db) return Promise.reject(new Error('실시간DB가 연결되지 않았습니다'));
    return deps.db.ref(CARDS_ROOT + '/' + BYKEY_FLAG).once('value').then(function (f) {
      if (f.val()) return findByKey(kind, fields);
      return findByScan(kind, fields, key, want);
    });
  }

  /* 옛 방식 — 검색목록 전부를 훑는다. 번호 열쇠 자리가 채워지기 전까지만 쓴다. */
  function findByScan(kind, fields, key, want) {
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

    /* 개인 폴더 확인이 **먼저다.** 뒤에 두면 이미 만들고 난 뒤가 된다. */
    return inPrivateVault(kind, o.fields).then(function (hidden) {
      if (hidden) {
        /* 왜 아무 일도 안 일어났는지는 알려야 한다. 다만 **어디에 있는지는
           말하지 않는다** — "대표님 개인 폴더에 있습니다"라고 하면 감춘 사실
           자체가 드러난다. 이미 등록돼 있다는 것만 알리면 충분하다. */
        return {
          id: '', created: false, filled: [], blocked: true,
          message: '이미 등록된 명함입니다 — 새로 넣지 않았습니다'
        };
      }
      return findExisting(kind, o.fields).then(function (hit) {
        return hit ? fillOne(hit, mapped, want, o) : createOne(o, mapped, want);
      });
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
      /* 뒷면 미리보기 — 명함 모드로 앞뒤를 이어 찍었을 때만 온다(대표 지시 2026-08-09).
         명함첩은 뒷면을 items/{id}/thumb2 와 photos/{id}_b 두 자리에 나눠 둔다. */
      thumb2: o.thumb2 || '',
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
    /* 번호 열쇠도 같이 — 안 쓰면 다음에 같은 명함을 찍었을 때 또 새로 만든다 */
    var bk = byKeyName(o.kind, o.fields);
    if (bk) u[CARDS_ROOT + '/' + BYKEY + '/' + bk] = id;
    /* 사진은 명함첩이 자기 사본을 갖는다 — 사진첩을 정리해도 명함첩 기록이 온전하게. */
    if (o.full) u[CARDS_ROOT + '/photos/' + id] = o.full;
    /* 뒷면 사본은 `{id}_b` 자리에 — 명함첩 편집기·상세보기가 보는 자리와 같다.
       (명함첩이 자기 카메라로 찍던 시절부터 쓰던 자리라 화면은 안 고쳐도 된다) */
    if (o.full2) u[CARDS_ROOT + '/photos/' + id + '_b'] = o.full2;
    var label = want === 'biz' ? '사업자등록증' : '명함';
    return deps.db.ref().update(u).then(function () {
      return {
        id: id, created: true, filled: [],
        message: '명함첩에 ' + label + '으로 새로 넣었습니다'
      };
    });
  }

  /* ══════════════════════════════════════════════════════════════
     업체관리(푸른이알피)에 넣기
     ══════════════════════════════════════════════════════════════
     ⚠ 규칙 셋. 이 셋을 어기면 실데이터가 망가진다.

     1. **업체를 새로 만들지 않는다.** 사업자번호로 찾지 못하면 아무것도 하지
        않고 그대로 알린다. 새 업체를 만드는 일은 계약·청구가 걸린 결정이라
        사진 한 장으로 자동 생성하면 유령 업체가 쌓인다.
     2. **빈 칸만 채운다.** 기존 값은 절대 덮지 않는다. 이 기능의 실제 값은
        '사업자번호가 없던 업체를 메우는 것'이지 고쳐 쓰는 것이 아니다.
     3. **칸 하나씩 쓴다.** 업체 목록 노드를 통째로 쓰면 그 사이 다른 사람이
        넣은 업체가 지워진다. 목록이 배열이든 객체든 칸 경로로만 쓴다. */

  var ERP_CO = 'data/companies';

  /* 사업자번호는 표기가 제각각이다(하이픈·공백). 숫자만 남겨 비교한다. */
  function bizKey(v) { var d = digits(v); return d.length >= 10 ? d : ''; }

  /* 업체 목록은 배열형·객체형 둘 다 쓰인다(푸른이알피가 옮겨 가는 중이다).
     어느 쪽이든 **칸 경로**를 만들 수 있게 열쇠를 함께 돌려준다. */
  function eachCompany(raw, fn) {
    if (!raw) return;
    if (Array.isArray(raw)) {
      for (var i = 0; i < raw.length; i++) if (raw[i]) fn(raw[i], String(i));
      return;
    }
    if (typeof raw !== 'object') return;
    Object.keys(raw).forEach(function (k) { if (raw[k]) fn(raw[k], k); });
  }

  function findCompanyByBizNo(bizno) {
    var key = bizKey(bizno);
    if (!key) return Promise.resolve(null);
    if (!deps.db) return Promise.reject(new Error('실시간DB가 연결되지 않았습니다'));
    return deps.db.ref(ERP_CO).once('value').then(function (s) {
      var wrap = s.val();
      var raw = (wrap && wrap.v !== undefined) ? wrap.v : wrap;
      var hit = null;
      eachCompany(raw, function (co, at) {
        if (hit) return;
        if (bizKey(co.bizNo) === key) hit = { id: co.id || at, at: at, rec: co };
      });
      return hit;
    });
  }

  /* 업체 칸 이름표 — 무엇을 채웠는지 사람 말로 알리려고 쓴다. */
  var CO_LABEL = {
    name: '업체명', bizNo: '사업자번호', ceo: '대표자', corpNo: '법인번호',
    openDate: '개업일', bizType: '업태', bizCategory: '종목', address: '소재지',
    phone: '전화', fax: '팩스', companySize: '기업규모', industry: '주업종',
    smeExpiry: '중소기업확인서 유효기간', smeIssueNo: '확인서 발급번호',
    smeIssueDate: '확인서 발급일', note: '비고'
  };

  /* 중소기업확인서는 **기업규모와 유효기간만** 채운다(대표 승인 설계).
     나머지 칸(상호·대표자)은 사업자등록증이 더 정확한 원본이다. */
  var SME_ONLY = { companySize: 1, smeExpiry: 1, smeIssueNo: 1, smeIssueDate: 1 };

  /* ══════ 기업정보(명함첩 🏢)로 보내기 ══════
     서식·신청서는 지금까지 갈 곳이 없었다 — 읽어 놓고도 어디에도 안 남았다.
     업체관리(ERP)와 다른 점: **업체가 없어도 받는다.** ERP 는 실제 거래처만 두는
     곳이라 없는 업체를 만들면 유령이 쌓이지만, 기업정보는 「이 회사에 대해 아는 것」을
     모으는 자리라 거래처가 아니어도 값이 있다(대표 지시 2026-08-12).

     ⚠ 열쇠는 사업자번호다. 명함첩 기업정보 화면도 같은 열쇠로 회사를 가른다 —
       한쪽만 바꾸면 보낸 것이 엉뚱한 회사에 붙거나 아예 안 보인다.
     ⚠ 덮어쓰지 않고 **빈 칸만 채운다.** 나중에 읽은 서식이 먼저 읽은 값을 지우면,
       사람이 고쳐 둔 것도 함께 날아간다. */
  function sendToCoInfo(o) {
    o = o || {};
    if (!deps.db) return Promise.reject(new Error('실시간DB가 연결되지 않았습니다'));
    var fields = o.fields || {};
    var key = bizKey(fields.bizno);
    if (!key) {
      return Promise.resolve({ ok: false, filled: [], message: '사업자번호를 읽지 못해 어느 회사인지 알 수 없습니다' });
    }
    /* 기업정보 화면(CO_FIELDS)이 이름표를 붙여 보여주는 칸들만 보낸다.
       모르는 칸까지 밀어 넣으면 화면에 안 나오면서 저장소만 불어난다. */
    var KEEP = ['company','ceo','corpno','address','companyTel','mobile','email','homepage',
                'bizType','bizItem','openDate','smeType','docName','applyNo','applyItems',
                'applyField','applyDetail','applyDate','dueDays','birth'];
    var ref = deps.db.ref(CARDS_ROOT + '/coInfo/' + key);
    return ref.once('value').then(function (s) {
      var cur = s.val() || {};
      var add = {}, filled = [];
      KEEP.forEach(function (k) {
        var v = fields[k];
        if (v == null || String(v).trim() === '') return;
        if (cur[k] != null && String(cur[k]).trim() !== '') return;   /* 이미 있으면 그대로 둔다 */
        add[k] = String(v).trim();
        filled.push(k);
      });
      if (!filled.length) {
        return { ok: true, filled: [], message: '새로 채울 칸이 없습니다 — 이미 다 들어 있습니다' };
      }
      add.at = Date.now();
      add.by = o.byName || '';
      return ref.update(add).then(function () {
        return { ok: true, filled: filled, message: filled.length + '개 칸을 기업정보에 넣었습니다' };
      });
    });
  }

  function sendToCompany(o) {
    o = o || {};
    var kind = o.kind;
    if (kind !== 'bizreg' && kind !== 'sme') {
      return Promise.reject(new Error('사업자등록증과 중소기업확인서만 업체관리로 보낼 수 있습니다'));
    }
    if (!deps.db) return Promise.reject(new Error('실시간DB가 연결되지 않았습니다'));

    var fields = o.fields || {};
    if (!bizKey(fields.bizno)) {
      return Promise.resolve({
        found: false, filled: [],
        message: '사업자번호를 읽지 못해 업체를 찾을 수 없습니다'
      });
    }

    var mapped = global.PuDocRead.mapTo('erp', kind, fields);
    delete mapped.bizNo;                      // 찾는 열쇠다 — 다시 쓰지 않는다
    if (kind === 'sme') {
      Object.keys(mapped).forEach(function (k) { if (!SME_ONLY[k]) delete mapped[k]; });
    }
    if (!Object.keys(mapped).length) {
      return Promise.resolve({
        found: false, filled: [],
        message: '업체에 채울 내용이 없습니다'
      });
    }

    return findCompanyByBizNo(fields.bizno).then(function (hit) {
      if (!hit) {
        /* 못 찾았다고 만들지 않는다. 사람이 업체관리에서 만들면 그때 채워진다. */
        return {
          found: false, filled: [],
          message: '이 사업자번호의 업체가 업체관리에 없습니다 — 업체를 먼저 만들어 주세요'
        };
      }
      var gaps = fillGaps(hit.rec, mapped);
      var names = Object.keys(gaps);
      if (!names.length) {
        return {
          found: true, id: hit.id, filled: [],
          message: '업체 「' + (hit.rec.name || '') + '」에 이미 다 들어 있었습니다'
        };
      }
      var now = Date.now();
      var u = {};
      var path = ERP_CO + '/v/' + hit.at + '/';
      names.forEach(function (k) { u[path + k] = gaps[k]; });
      /* 고친 때·고친 이를 남긴다 — 푸른이알피의 동시 편집 판단이 이걸 본다. */
      u[path + 'updatedAt'] = now;
      if (o.byName) u[path + 'updatedBy'] = o.byName;
      /* 갱신시각 — 푸른이알피가 이걸 보고 다시 읽는다. 안 쓰면 화면에 안 나타난다. */
      u[ERP_CO + '/u'] = now;

      var labels = names.map(function (n) { return CO_LABEL[n] || n; });
      return deps.db.ref().update(u).then(function () {
        return {
          found: true, id: hit.id, filled: labels,
          message: '업체 「' + (hit.rec.name || '') + '」의 빈 칸 ' + labels.length +
            '개를 채웠습니다 (' + labels.join('·') + ')'
        };
      });
    });
  }

  global.PuDocFile = {
    init: init,
    inPrivateVault: inPrivateVault,
    byKeyName: byKeyName,
    findExisting: findExisting,
    fillGaps: fillGaps,
    idxOf: idxOf,
    whenText: whenText,
    sendToCards: sendToCards,
    findCompanyByBizNo: findCompanyByBizNo,
    sendToCoInfo: sendToCoInfo,
    sendToCompany: sendToCompany
  };
})(typeof window !== 'undefined' ? window : globalThis);
