/* 푸른통합시스템 — 서류 등록 층
   판독한 서류를 기업정보함과 업체관리에 넣는 유일한 파일이다.
   판독 층(pu-doc-read.js)이 "읽기"를 아는 유일한 파일인 것과 짝을 이룬다.
   화면은 이 파일의 함수 하나를 부르고 결과 문구만 띄운다 —
   그래서 사진첩 화면은 기업정보함이 어떻게 생겼는지 몰라도 된다.

   ⚠ 이 층은 **실데이터를 만진다.** 지켜야 할 것 네 가지:
   1. 반드시 다중 경로 update 한 번. 상위 노드를 통째로 set 하면 남의 명함이
      지워진다(2026-07 실데이터 사고).
   2. 검색 인덱스(pucards/idx)를 레코드와 **함께** 쓴다. 안 쓰면 기업정보함·
      푸른이알피의 검색이 이 명함을 못 찾는다.
   3. 이미 있는 명함이면 **빈 칸만** 채운다. 기존 값을 절대 덮지 않는다.
   4. 읽어낸 것이 없으면 아무것도 만들지 않는다(빈 껍데기 금지). */
(function (global) {
  'use strict';

  var CARDS_ROOT = 'pucards';

  var deps = { db: null, storage: null };
  function init(o) {
    o = o || {};
    deps.db = o.db || null;
    if (o.storage !== undefined) deps.storage = o.storage || null;
    return true;
  }

  /* ── 원본 사진은 «창고»에 둔다 (2026-08-26) ──
     기업정보함은 2026-08-09 에 원본을 창고로 옮겼다 — 명함 4,400장 약 1.7GB 가
     실시간DB 무료 한도(1GB)를 이것 하나로 넘겨 데이터베이스가 멈출 뻔했다.
     그런데 **사진첩을 거쳐 들어오는 길만 옛 방식**이라, 한 장에 약 700KB 씩
     실시간DB 로 도로 쌓이고 있었다(2026-08-26 실측: 417장 · 약 284MB).

     ⚠ 창고 이름을 여기 적어 둔다. 부르는 화면(사진첩·정부사업일정)은 저마다
       **다른 창고**를 기본으로 쓴다 — 사진첩은 pureun-erp-hrphotos 다.
       그래서 firebase.storage() 를 그냥 쓰면 엉뚱한 창고에 올라간다.
     ⚠ 막히면(규칙·권한·꾸러미 없음) 조용히 «옛 자리»로 물러난다. 기업정보함의
       읽기는 창고 먼저, 없으면 실시간DB 순이라 어느 쪽에 있어도 보인다 —
       올리다 막혔다고 명함 등록을 통째로 무르는 것이 훨씬 나쁘다. */
  /* 서류 밑에 담는 pairs 의 한계 (대표 결정 2026-08-28).
     판독이 어긋나 글자가 쏟아지면 그것이 그대로 요금이다 — 2026-08-16·08-26 에
     두 번 겪었다. 자른 것은 docs/{서류}/pairsCut 에 «몇 개 잘랐는지»를 남긴다. */
  var CO_PAIRS_MAX = 60;
  var CO_PAIR_LEN = 300;


  var CARDS_BUCKET = 'gs://pureun-erp-photos';
  function cardsStorage() {
    if (deps.storage) return deps.storage;
    try {
      if (global.firebase && global.firebase.app) {
        deps.storage = global.firebase.app().storage(CARDS_BUCKET);
        return deps.storage;
      }
    } catch (e) { /* 꾸러미가 없거나 창고가 없다 — 옛 자리로 간다 */ }
    return null;
  }
  /* 올렸으면 true. 올릴 것이 없거나 막히면 false — 부르는 쪽이 옛 자리에 담는다. */
  function putPhoto(id, dataUrl) {
    if (!dataUrl) return Promise.resolve(false);
    var st = cardsStorage();
    if (!st) return Promise.resolve(false);
    try {
      return st.ref(CARDS_ROOT + '/photos/' + id)
        .putString(String(dataUrl), 'data_url')
        .then(function () { return true; })
        .catch(function () { return false; });
    } catch (e) { return Promise.resolve(false); }
  }

  /* 기업정보함 레코드 종류 — 판독 종류와 이름이 다르다. */
  /* 서식·신청서도 받는다 (대표 지시 2026-08-31) — 담기는 것은 그 서식의 «담당자»다.
     회사 정보는 명함이 아니라 기업 상세(sendToCoInfo)로 따로 간다. */
  var TO_CARD_KIND = { card: 'card', bizreg: 'biz', form: 'card' };

  /* 화면에 "무엇을 채웠는지" 한국어로 알리려고 쓰는 표. */
  var FIELD_LABEL = {
    name: '이름', company: '회사명', ceo: '대표자', bizno: '사업자번호',
    corpno: '법인번호', openDate: '개업일', bizType: '업태', bizItem: '종목',
    issueDate: '등록증 발급일',
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
     기업정보함과 **같은 기준**으로 중복을 본다 — 명함은 휴대폰 숫자,
     사업자등록증은 사업자번호 숫자. 기준이 다르면 같은 사람이 두 번 쌓인다.
     열쇠가 없으면(휴대폰 없는 명함 등) 찾지 않는다 — 이름만으로 붙이면
     동명이인이 서로를 덮는다. */
  function dedupKey(kind, fields) {
    /* ⚠ 서식도 «명함»이다 (대표 지시 2026-08-31) — CARDS_KIND.form 이 'card' 다.
       그런데 여기서 서식을 빼 두어 «중복을 아예 안 봤다». 그래서 같은 담당자가
       서식 한 장마다 새 명함으로 쌓이고, 나중에 들어온 쪽에만 회사가 붙는 일이 생겼다.
       명함과 «같은 기준»(휴대폰 숫자)으로 본다 — 기준이 다르면 같은 사람이 두 번 쌓인다. */
    if (kind === 'card' || kind === 'form') return digits(fields && fields.mobile);
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
     기업정보함이 pucards/bykey 에 「번호 → 명함번호」를 적어 두므로 한 칸만 읽는다.

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

  /* ══════ 담당자 명함이 «어느 회사» 것인지 (대표 지시 2026-08-31) ══════
     「사진첩에 기업의 정보를 화면 캡처로 합쳐서 정리하는 경우가 여러 번 있다.
      이럴 경우 담당자 정보를 별도 기업정보함에서 기업의 이름이 보이지 않더라도
      정확하게 찾아서 연결시켜 기업정보함 명함에 정확히 넣어라」

     ■ 무엇이 문제인가
       캡처한 화면에 «회사 이름이 안 보이는» 일이 흔하다 — 두 쪽짜리 신청서의 2쪽에는
       담당자 정보만 있고 상호는 1쪽에 있다. 판독은 문서 통째로 하지만 상호 칸을 못 읽으면
       mapTo 가 «빈 값을 아예 안 싣기» 때문에, 명함의 회사 칸이 빈 채로 만들어진다.
       회사가 없는 명함은 기업 상세에서 어느 회사에도 안 붙는다 — 사람 따로, 회사 따로 뜬다.

     ■ 어떻게 찾나 — 사업자번호가 «회사를 가리키는 유일한 값»이다
       ① pucards/bykey/b{번호} → 그 번호를 가진 등록증의 번호
       ② pucards/idx/{그 번호} → 그 등록증의 상호(c)
       ③ 그래도 없으면 pucards/coInfo/{번호}/company — 서식이 채워 둔 회사 이름
     ⚠ «두세 칸»만 읽는다. 목록을 통째로 훑지 않는다 — 사진 한 장마다 색인 6천 줄을
       내려받던 그 실수를 되풀이하지 않는다(바로 위 findByKey 와 같은 결).
     ⚠ 이름으로는 찾지 «않는다». 이름이 없어서 찾는 것이므로 애초에 쓸 수 없다.
     ⚠ 찾아간 등록증의 번호를 «다시 맞춰 본다» — 번호를 고친 등록증의 옛 열쇠가 남아
       있을 수 있는데, 그대로 믿으면 «남의 회사» 이름을 이 사람 명함에 적는다.
     ⚠ 못 찾으면 빈 글자를 준다. 지어내지 않는다 — 틀린 회사에 붙는 것보다 빈 것이 낫다. */
  function findCoNameByBizNo(bizno) {
    var key = bizKey(bizno);
    if (!key || !deps.db) return Promise.resolve('');
    return deps.db.ref(CARDS_ROOT + '/' + BYKEY + '/b' + key).once('value')
      .then(function (s) {
        var id = s.val();
        if (!id || typeof id !== 'string') return '';
        return deps.db.ref(CARDS_ROOT + '/idx/' + id).once('value').then(function (s2) {
          var row = s2.val();
          if (!row || (row.k || 'card') !== 'biz') return '';   /* 지워졌거나 종류가 다르다 */
          if (digits(row.bz) !== key) return '';                /* 번호가 바뀐 옛 열쇠 */
          return String(row.c == null ? '' : row.c).trim();
        });
      })
      .then(function (nm) {
        if (nm) return nm;
        /* 등록증이 아직 없는 회사 — 서식이 기업 상세에 적어 둔 이름이 있을 수 있다 */
        return deps.db.ref(CARDS_ROOT + '/coInfo/' + key + '/company').once('value')
          .then(function (s3) { return String(s3.val() == null ? '' : s3.val()).trim(); });
      })
      .catch(function () { return ''; });                       /* 못 찾으면 그냥 빈 채로 간다 */
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
     기업정보함이 쓰는 약어 이름 그대로 만든다. 이름이 다르면 기업정보함·푸른이알피의
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

  /* ── 기업정보함에 보내기 ──
     자동으로 부를 수도 있고(검증 통과분), 사람이 버튼으로 부를 수도 있다.
     돌려주는 것: { id, created, filled[], message } */
  /* 서식에 «사람»이 적혀 있는가 — 이름이 알맹이다. 이름 없이 연락처만 있으면
     누구 것인지 알 수 없어 명함으로 쓸 수 없다. */
  function formHasContact(fields) {
    return !blank((fields || {}).name);
  }

  function sendToCards(o) {
    o = o || {};
    var kind = o.kind;
    var want = TO_CARD_KIND[kind];
    if (!want) {
      return Promise.reject(new Error('명함과 사업자등록증만 기업정보함으로 보낼 수 있습니다'));
    }
    if (!deps.db) return Promise.reject(new Error('실시간DB가 연결되지 않았습니다'));

    /* 판독 결과를 기업정보함 필드 이름으로 바꾼다(변환표는 판독 층에 있다). */
    var mapped = global.PuDocRead.mapTo('cards', kind, o.fields || {});
    delete mapped.kind;                       // 종류는 아래에서 직접 넣는다
    /* ⚠ 서식은 «담당자 이름이 있을 때만» 명함이 된다 (대표 지시 2026-08-31).
       신청서에는 회사 이름이 늘 있으므로, 이름을 안 보면 서식마다 「회사명만 있는
       명함」이 하나씩 생긴다 — 지우기도 어렵고 목록만 어지럽다.
       회사 정보는 여기서 막혀도 기업 상세(sendToCoInfo)로 이미 간다. */
    if (kind === 'form' && !formHasContact(o.fields)) {
      return Promise.reject(new Error('이 서식에는 담당자 이름이 없어 명함으로 만들지 않았습니다 — 회사 정보는 기업 상세로 들어갑니다'));
    }
    if (!Object.keys(mapped).length) {
      return Promise.reject(new Error('읽어낸 정보가 없어 기업정보함에 보낼 수 없습니다'));
    }

    /* ── 회사 이름을 못 읽었으면 «사업자번호로 찾아» 채운다 (대표 지시 2026-08-31) ──
       캡처 화면에 상호가 안 보여도 사업자번호만 있으면 어느 회사인지 정해진다.
       ⚠ 이미 읽어 낸 이름이 있으면 손대지 «않는다» — 서류에 적힌 것이 먼저다.
       ⚠ 못 찾아도 명함은 그대로 만든다. 사람은 실재하므로, 회사를 못 찾았다고
         명함을 통째로 버리면 그 담당자를 잃는다. 못 찾았다는 것만 알린다. */
    var coFilled = '';
    var pre = (blank(mapped.company) && bizKey((o.fields || {}).bizno))
      ? findCoNameByBizNo((o.fields || {}).bizno).then(function (nm) {
          if (nm) { mapped.company = nm; coFilled = nm; }
        })
      : Promise.resolve();

    /* 개인 폴더 확인이 **먼저다.** 뒤에 두면 이미 만들고 난 뒤가 된다. */
    return pre.then(function () {
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
    }).then(function (res) {
      /* 무엇을 «찾아» 붙였는지 알린다 — 조용히 붙이면 틀렸을 때 알아챌 길이 없다.
         회사를 끝내 못 찾았으면 그것도 말한다(빈 회사 칸은 나중에 미아가 된다). */
      if (res && !res.blocked) {
        if (coFilled) res.coFilled = coFilled;
        else if (blank(mapped.company)) res.coMissing = true;
      }
      return res;
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
      var addPhoto = blank(rec.thumb) && !blank(o.thumb);
      if (addPhoto) {
        u[CARDS_ROOT + '/items/' + hit.id + '/thumb'] = o.thumb;
        /* ⚠ 사진 고리는 **셋을 한 벌로** 적는다(대표 검토 2026-08-27) — 사진첩은
           사람별·해별로 갈려 있어 번호 하나로는 못 연다. 여기서 하나라도 빠지면
           명함의 「📷 사진첩 원본」이 열리지 않는다. 새로 만드는 쪽(createOne)과
           **같은 세 칸**이라야 한다. */
        if (o.photoId) {
          u[CARDS_ROOT + '/items/' + hit.id + '/photoId'] = o.photoId;
          u[CARDS_ROOT + '/items/' + hit.id + '/photoYear'] = o.photoYear || '';
          u[CARDS_ROOT + '/items/' + hit.id + '/photoOwner'] = o.photoOwner || '';
        }
        labels.push('사진');
      }

      var when = whenText(rec.createdAt || rec.updatedAt || 0);
      var who = whoText(Object.assign({}, rec, gaps));
      var head = '이미 기업정보함에 있습니다' +
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
      /* 원본은 «먼저» 창고에 올린다 — 올라갔으면 실시간DB 에는 안 넣는다.
         막혔으면 옛 자리에 담아 사진이 사라지지 않게 한다. */
      return (addPhoto ? putPhoto(hit.id, o.full) : Promise.resolve(false))
        .then(function (up) {
          if (addPhoto && o.full && !up) u[CARDS_ROOT + '/photos/' + hit.id] = o.full;
          return deps.db.ref().update(u).then(function () { return out; });
        });
    });
  }

  /* 새 명함 — 레코드·검색 인덱스·사진을 한 번의 update 로. */
  function createOne(o, mapped, want) {
    var id = deps.db.ref(CARDS_ROOT + '/items').push().key;
    var rec = Object.assign({}, mapped, {
      id: id,
      kind: want,
      thumb: o.thumb || '',              // 목록용 미리보기(없으면 기업정보함 격자가 빈다)
      /* 뒷면 미리보기 — 명함 모드로 앞뒤를 이어 찍었을 때만 온다(대표 지시 2026-08-09).
         기업정보함은 뒷면을 items/{id}/thumb2 와 photos/{id}_b 두 자리에 나눠 둔다. */
      thumb2: o.thumb2 || '',
      fav: false,
      scope: 'shared',                   // 전 직원 공유 (사진첩 설계와 같게)
      createdAt: o.takenAt || Date.now(),
      updatedAt: Date.now(),
      source: 'pu-photos',               // 어디서 왔는지 남긴다
      /* 사진첩 사진과 잇는 고리 — **셋이 한 벌**이라야 열린다(사진첩은 사람별·해별로
         갈려 있다). 번호만 적던 것을 2026-08-27 검토에서 바로잡았다. */
      photoId: o.photoId || '',
      photoYear: String(o.photoYear || ''),
      photoOwner: o.photoOwner || '',
      capturedBy: o.byName || ''
    });
    var u = {};
    u[CARDS_ROOT + '/items/' + id] = rec;
    u[CARDS_ROOT + '/idx/' + id] = idxOf(rec);
    /* 번호 열쇠도 같이 — 안 쓰면 다음에 같은 명함을 찍었을 때 또 새로 만든다 */
    var bk = byKeyName(o.kind, o.fields);
    if (bk) u[CARDS_ROOT + '/' + BYKEY + '/' + bk] = id;
    /* 무엇으로 넣었는지 — **판독이 읽어 온 제목 그대로** 말한다(대표 지적 2026-08-17).
       사업자등록증명(국세청 증명원)을 넣고도 「사업자등록증으로 넣었습니다」라고
       하면 다른 서류가 들어간 줄 안다. 둘은 같은 갈래(bizreg)로 다뤄 같은 자리에
       쌓이는 것이 맞지만, **말은 실제 서류 이름이어야 한다.** */
    var docName = String((o.fields && o.fields.docName) || '').trim();
    var label = docName || (want === 'biz' ? '사업자등록증' : '명함');
    /* 사진은 기업정보함이 «자기 사본»을 갖는다 — 사진첩을 정리해도 기록이 온전하게.
       ⚠ 사본은 **창고**에 둔다(위 putPhoto 의 까닭). 뒷면은 `{id}_b` 자리에 —
         기업정보함 편집기·상세보기가 보는 자리와 같다(그쪽 화면은 안 고쳐도 된다).
       ⚠ 올리고 «나서» 레코드를 쓴다. 순서를 바꾸면 레코드는 있는데 사진이 없는
         틈이 생긴다. 반대로 레코드 쓰기가 넘어지면 창고에 홀로 남는 파일이 생기는데,
         그것은 자리만 조금 먹을 뿐 아무 화면도 안 가리킨다. */
    return Promise.all([putPhoto(id, o.full), putPhoto(id + '_b', o.full2)])
      .then(function (up) {
        if (o.full && !up[0]) u[CARDS_ROOT + '/photos/' + id] = o.full;
        if (o.full2 && !up[1]) u[CARDS_ROOT + '/photos/' + id + '_b'] = o.full2;
        return deps.db.ref().update(u);
      })
      .then(function () {
        return {
          id: id, created: true, filled: [],
          message: '기업정보함에 ' + label + '으로 새로 넣었습니다'
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

  /* ── 업체를 «이름»으로 찾는다 (대표 지시 2026-08-28) ──
     회의·현장 사진에는 사업자번호가 없다. 사람이 적어 넣는 것은 업체 «이름»뿐이라,
     그 이름으로 업체를 찾아야 담당자를 알 수 있다.

     ⚠ 표기가 제각각이다 — 「(주)승진텍라인」·「승진텍 라인」·「승진텍라인㈜」.
       법인 표시와 띄어쓰기를 걷어 내고 견준다.
     ⚠ **딱 하나만 맞을 때만** 준다. 같은 이름이 둘이면 어느 쪽 담당자인지 알 수 없고,
       잘못 고르면 **남의 업체 담당자에게 사진이 열린다.** 애매하면 아무것도 안 하는
       것이 맞다 — 사람이 손으로 고르면 된다. */
  function coNameKey(v) {
    return String(v == null ? '' : v)
      .replace(/\(주\)|\(유\)|주식회사|유한회사|유한책임회사|㈜|㈲/g, '')
      .replace(/\s+/g, '')
      .toLowerCase();
  }

  function findCompanyByName(name) {
    var key = coNameKey(name);
    if (!key) return Promise.resolve(null);
    if (!deps.db) return Promise.reject(new Error('실시간DB가 연결되지 않았습니다'));
    return deps.db.ref(ERP_CO).once('value').then(function (s) {
      var wrap = s.val();
      var raw = (wrap && wrap.v !== undefined) ? wrap.v : wrap;
      var hits = [];
      eachCompany(raw, function (co, at) {
        if (coNameKey(co.name) === key) hits.push({ id: co.id || at, at: at, rec: co });
      });
      return hits.length === 1 ? hits[0] : null;
    });
  }

  /* 그 업체의 주담당·부담당 사번. 담당이 없으면 빈 배열.
     ⚠ 계약·사건과 **같은 칸 이름**이다(managerMain/managerSubs). 업체 담당자는
       업체관리에서만 고치는 값이라(푸른이알피 주석) 여기서는 읽기만 한다. */
  function companyMgrSids(rec) {
    var out = [];
    if (!rec) return out;
    if (rec.managerMain) out.push(rec.managerMain);
    (rec.managerSubs || []).forEach(function (s) {
      if (s && out.indexOf(s) < 0) out.push(s);
    });
    return out;
  }

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

  /* ══════ 이미 보낸 서류에 «적힌 것»을 뒤늦게 채운다 (대표 지시 2026-08-29) ══════
     2026-08-28 부터 보낸 서류에는 docs/{서류}/pairs 가 담긴다. 그런데 «그 전에 보낸
     서류»에는 없다 — 대표 화면 기준 400장 남짓.

     ⚠ 다시 판독하지 «않는다». 판독은 AI 호출이고 그것이 그대로 요금이다. 그런데
       판독 결과는 이미 사진에 남아 있다(사진 항목의 meta.read.fields) — 옮기기만
       하면 0원이다.
     ⚠ 사진첩에서 부른다. 사진은 puphotos/u/{uid} 에, 기업정보는 pucards/coInfo 에
       있어 뿌리가 다르다. 사진첩은 제 사진을 이미 손에 들고 있다.
     ⚠ «이미 보낸 서류»에만 채운다. 안 보낸 사진까지 쓰면 기업정보함에 없던 서류가
       이름·날짜도 없이 pairs 만 든 껍데기로 생긴다.
     ⚠ 회사마다 «한 번» 읽고 «한 번» 쓴다. 서류 한 장마다 오가면 400번이 800번이 된다
       (2026-08-16 에 겪은 그 규모다).

     list: [{ fields, photo:{year,id,owner} }] — sendToCoInfo 에 넣는 것과 같은 꼴.
     돌려주는 것: { scanned, coCount, filled, already, notSent, noKey, failed } */
  function backfillPairs(list, onStep) {
    var items = Array.isArray(list) ? list : [];
    var out = { scanned: items.length, coCount: 0, filled: 0,
                already: 0, notSent: 0, noKey: 0, failed: 0 };
    if (!deps.db) return Promise.reject(new Error('실시간DB가 연결되지 않았습니다'));

    /* 회사별로 모은다 — 오가는 횟수를 회사 수로 줄이는 것이 이 함수의 요점이다 */
    var byCo = {};
    items.forEach(function (it) {
      var f = (it && it.fields) || {};
      var ph = (it && it.photo) || {};
      var key = bizKey(f.bizno);
      if (!key || !ph.id) { out.noKey++; return; }
      var tidy = tidyPairs(f.pairs);
      if (!tidy.pairs.length) return;                    /* 담을 것이 없다 */
      var dk = String(ph.year || 'unknown') + '_' + String(ph.id).replace(/[.#$/[\]]/g, '_');
      (byCo[key] = byCo[key] || []).push({ dk: dk, tidy: tidy });
    });

    var keys = Object.keys(byCo);
    out.coCount = keys.length;
    var i = 0;
    function step() {
      if (i >= keys.length) return Promise.resolve(out);
      var key = keys[i++];
      return one(key).then(function () {
        if (onStep) { try { onStep(i, keys.length, out); } catch (e) {} }
        return step();
      });
    }
    function one(key) {
      var base = CARDS_ROOT + '/coInfo/' + key;
      return deps.db.ref(base + '/docs').once('value')
        .then(function (s) {
          var docs = s.val() || {};
          var upd = {}, n = 0;
          byCo[key].forEach(function (e) {
            var cur = docs[e.dk];
            if (!cur) { out.notSent++; return; }          /* 안 보낸 사진 — 만들지 않는다 */
            if (cur.pairs) { out.already++; return; }     /* 이미 있다 — 다시 쓰면 요금만 는다 */
            upd['docs/' + e.dk + '/pairs'] = e.tidy.pairs;
            if (e.tidy.cut) upd['docs/' + e.dk + '/pairsCut'] = e.tidy.cut;
            n++;
          });
          if (!n) return;
          return deps.db.ref(base).update(upd).then(function () { out.filled += n; });
        })
        .catch(function () { out.failed++; });            /* 한 회사가 막혀도 나머지는 계속 */
    }
    return step();
  }

  /* ══════ 기업정보(기업정보함 🏢)로 보내기 ══════
     서식·신청서는 지금까지 갈 곳이 없었다 — 읽어 놓고도 어디에도 안 남았다.
     업체관리(ERP)와 다른 점: **업체가 없어도 받는다.** ERP 는 실제 거래처만 두는
     곳이라 없는 업체를 만들면 유령이 쌓이지만, 기업정보는 「이 회사에 대해 아는 것」을
     모으는 자리라 거래처가 아니어도 값이 있다(대표 지시 2026-08-12).

     ⚠ 열쇠는 사업자번호다. 기업정보함 기업정보 화면도 같은 열쇠로 회사를 가른다 —
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
    /* ⚠ product·sales·workers 를 늘렸다 (대표 지시 2026-08-23) — 기술보호울타리·
       현장클리닉의 사업장 정보 화면을 캡처해 담을 때, 정작 자격을 가리는 숫자
       (매출액·상시근로자수)가 pairs 에만 있어 기업 상세까지 오지 못했다.
       늘릴 때는 pu-cards.html 의 CO_FIELDS 에도 이름표를 함께 넣어야 한다 —
       여기만 늘리면 값은 쌓이는데 화면에 안 나온다. */
    /* ⚠ issueDate(등록증 발급일)는 «최신을 가리는 잣대»다 (2026-09-07). 이것이 없으면
         대표자가 바뀐 새 등록증과 옛 등록증을 구별할 길이 아예 없다.
         pu-cards.html 의 CO_FIELDS 에도 함께 들어 있다 — 둘은 늘 짝이다. */
    var KEEP = ['company','ceo','corpno','address','companyTel','mobile','email','homepage','companyFax',
                'issueDate',
                'bizType','bizItem','openDate','smeType','product','sales','workers',
                'docName','applyNo','applyItems',
                /* 세금계산서 발급처 (대표 지시 2026-08-30) — 등록증에서 읽는다.
                   ⚠ pu-cards.html 의 CO_FIELDS 와 짝이다. 여기만 늘리면 값은 쌓이는데
                     화면에 안 나오고, 저쪽만 늘리면 값이 아예 안 온다. */
                'taxInvoiceEmail','taxInvoiceContact',
                'applyField','applyDetail','applyDate','dueDays','birth',
                /* ── 은행·자동이체 (대표 지시 2026-08-28) — CMS 신청서에서 온다 ──
                   ⚠ 계좌번호를 **온전히** 담는다. 대표 결정: "뒤 계좌 모두 보여야 한다.
                     그래야 추후 데이터를 이용해서 cms 자동입력할 수 있다."
                     **가리도록 되돌리지 말 것** — 「계좌번호가 그대로 있네」로 보이지만
                     그것이 목적이다(자동입력에 쓰려면 온전한 번호라야 한다).
                   ⚠ 예금주 **주민번호는 여기 없다.** 판독기가 아예 안 읽는다
                     (js/pu-doc-read.js 의 kind=cms 물음에 「읽지 마세요」로 못박아 두었다). */
                'bankName','bankAcct','bankHolder','payDay','payerNo','applyType'];
    var ref = deps.db.ref(CARDS_ROOT + '/coInfo/' + key);
    return ref.once('value').then(function (s) {
      var cur = s.val() || {};
      var add = {}, filled = [], clash = [];
      var ph0 = o.photo || {};
      /* 이 서류의 열쇠. 아래 docs/ 와 «같은 열쇠»를 쓴다 — 칸마다 이것 하나만 가리켜
         「이 값이 어디서 왔나」에 답한다(대표 지시 2026-08-24, 4순위).
         ⚠ 서류 이름·날짜·사람·사진번호를 칸마다 통째로 베끼지 «않는다». 그건 이미
           docs/{열쇠} 에 한 번 들어 있다. 칸이 스무 개면 그 차이가 스무 배다
           (2026-08-16 대량 쓰기 사고를 되풀이하지 않는다). */
      var dk = ph0.id
        ? String(ph0.year || 'unknown') + '_' + String(ph0.id).replace(/[.#$/[\]]/g, '_')
        : '';
      KEEP.forEach(function (k) {
        var v = fields[k];
        if (v == null || String(v).trim() === '') return;
        var got = String(v).trim();
        var had = (cur[k] == null) ? '' : String(cur[k]).trim();
        if (had !== '') {
          /* ── 값이 «다를 때» (대표 지시 2026-08-24, 1순위) ──
             값은 여전히 안 덮는다 — 사람이 고쳐 둔 것이 사라지면 안 된다.
             그런데 예전에는 «다른 값이 와서 안 넣은 것»과 «이미 같아서 안 넣은 것»을
             구별하지 않고 둘 다 조용히 넘어갔고, 화면에는 「이미 다 들어 있습니다」라고
             알렸다 — 사실은 어긋난 값이 있는데 확인된 것처럼 읽혔다.
             노무법인 계약서·신고서에 대표자·소재지가 틀리면 그대로 나간다.
             ⚠ 다를 때만 쓴다. 같으면 한 글자도 안 쓴다 — 그래야 요금이 안 는다
               (2026-08-23 에 줄인 실시간DB 사용량을 되돌리지 않는다).
             ⚠ 칸 이름이 열쇠다 — 같은 칸을 다시 보내면 한 줄을 덮어쓴다. 쌓이면
               줄이 끝없이 는다. */
          if (had !== got) {
            /* ⚠ 발급일을 함께 남긴다 (2026-09-07) — 「지금 값」과 「읽은 값」만으로는
                 어느 쪽이 최신인지 알 수 없다. 대표자가 바뀌는 공공기관에서는 그것이
                 곧 판단 근거다. 없으면 빈 문자열로 두고 화면이 「모름」이라 말한다. */
            add['conflicts/' + k] = {
              got: got, had: had,
              issued: String(fields.issueDate || '').trim(),
              doc: String(fields.docName || '').trim(),
              by: o.byName || '', at: Date.now(),
              photoId: String(ph0.id || ''), photoYear: String(ph0.year || ''),
              photoOwner: String(ph0.owner || '')
            };
            clash.push(k);
          }
          return;                                                     /* 이미 있으면 그대로 둔다 */
        }
        add[k] = got;
        /* «채운 칸에만» 붙인다. 안 채운 칸에 붙이면 남의 서류를 가리키게 된다. */
        if (dk) add['src/' + k] = dk;
        filled.push(k);
      });
      /* 어떤 사업으로 들어온 회사인지 딱지를 붙인다 — 서류이름이 곧 사업 이름이다.
         기업정보 화면이 이 딱지로 갈래(탭)를 저절로 만든다. 손으로 만들 필요가 없다
         (대표 지시 2026-08-12). 이름이 「값 없음」이 되지 않도록 . # $ [ ] / 를 뺀다 —
         실시간DB 는 열쇠에 이 글자들을 못 쓴다. */
      var tag = String(fields.docName || '').trim().replace(/[.#$/[\]]/g, ' ').replace(/\s+/g, ' ').trim();
      if (tag && !(cur.tags && cur.tags[tag])) { add['tags/' + tag] = true; filled.push('갈래'); }

      /* 어느 서류에서 온 값인지 남긴다.
         값만 옮기면 나중에 「이 숫자 어디서 봤더라」에 답할 수 없다 — 사진첩에 그 서류가
         그대로 있는데도 다시 찾아 헤매게 된다(대표 지시 2026-08-13).
         ⚠ 덮어쓰지 않고 사진 하나에 한 줄씩 쌓는다. 한 회사에 서류가 여러 장 오고,
           나중 것이 앞 것을 지우면 이력이 사라진다. 같은 사진을 두 번 보내면 같은
           자리에 다시 쓰여 줄이 늘지 않는다(사진 번호를 열쇠로 삼는다). */
      var ph = o.photo || {};
      if (ph.id) {
        if (!(cur.docs && cur.docs[dk])) {
          var doc = { name: tag || '서식', year: String(ph.year || ''), id: String(ph.id),
                      owner: String(ph.owner || ''), at: Date.now(), by: o.byName || '' };
          /* ── 서류에 «적힌 것 전부»를 그 서류 밑에 (대표 결정 2026-08-28) ──
             「기업정보함에는 사진첩에서 들어온 그 기업과 관련된 정보는 모두 보관하고 싶다」

             판독 층은 이름 붙은 칸(company·ceo·sales…)과 함께 pairs 를 만든다 —
             문서에 적힌 «모든 항목»을 적힌 그대로다. 그런데 KEEP 29칸만 통과시켜,
             pairs 는 «저장되는 곳이 아예 없었다». 되메우기(PAIR_TO_KEY, 이름표 55가지)가
             아는 이름만 칸으로 옮기고 나머지(신청 사유·사업 기간·지원 금액·고용보험
             관리번호 …)는 통째로 사라졌다. 서식은 계속 새로 생기므로 «이름표를
             쫓아가는 방식은 끝이 없다» — 그래서 서류 밑에 통째로 둔다.

             ⚠ 회사 칸에 밀어 넣지 «않는다». 서류마다 표기가 달라 서로 덮고 어긋난다.
               서류 밑에 두면 「그 서류가 뭐라고 했는가」가 영영 남는다.
             ⚠ 개수·길이는 «자른다». 판독이 어긋나 글자가 쏟아지면 그것이 그대로
               요금이다(2026-08-16·08-26 두 번 겪었다). 자른 것은 잘랐다고 남긴다 —
               조용히 줄이면 나중에 「왜 없지」가 된다.
             ⚠ 개인정보는 «거르지 않는다» — 대표 결정 2026-08-28 (가) 「그대로 다 담는다」.
               주민등록번호는 판독 층이 애초에 안 읽는다(PROMPT_ALL 에 못 박혀 있다). */
          var tidy = tidyPairs(fields.pairs);
          if (tidy.pairs.length) {
            doc.pairs = tidy.pairs;
            if (tidy.cut) doc.pairsCut = tidy.cut;
          }
          add['docs/' + dk] = doc;
          filled.push('서류');
        }
      }

      /* 어긋남을 사람 말로. 「이미 다 들어 있습니다」로 뭉뚱그리면 확인된 것처럼 읽힌다. */
      var clashMsg = clash.length
        ? '⚠ ' + clash.length + '개 칸이 기존 값과 «다릅니다» — 기업 상세에서 확인해 주세요 ('
          + clash.map(function (k) { return FIELD_LABEL[k] || CO_LABEL[k] || k; }).join(', ') + ')'
        : '';
      if (!filled.length && !clash.length) {
        return { ok: true, filled: [], conflicts: 0,
                 message: '새로 채울 칸이 없습니다 — 이미 다 들어 있습니다' };
      }
      add.at = Date.now();
      add.by = o.byName || '';
      return ref.update(add).then(function () {
        var msg = filled.length ? filled.length + '개 칸을 기업 상세에 넣었습니다' : '';
        if (clashMsg) msg = msg ? (msg + '\n' + clashMsg) : clashMsg;
        return { ok: true, filled: filled, conflicts: clash.length, message: msg };
      });
    });
  }

  /* ── 업체 목록을 «한 번만» 읽어 사업자번호 지도를 만든다 (2026-08-23) ──
     findCompanyByBizNo 는 부를 때마다 업체 목록을 통째로 내려받는다(업체 371곳).
     기다리는 사진이 152장인데 하나씩 확인하면 **152번** 내려받는다 — 실시간DB 는
     내려받은 양으로 돈을 받으므로 그건 못 쓴다. 한 번 읽고 메모리에서 맞춘다.
     ⚠ 같은 사업자번호가 두 벌 있으면 앞엣것을 쓴다 — findCompanyByBizNo 와 같다.
       (업체관리에 중복이 있는 것은 별개 문제다. 여기서 골라 고치지 않는다.) */
  function companyIndex() {
    if (!deps.db) return Promise.reject(new Error('실시간DB가 연결되지 않았습니다'));
    return deps.db.ref(ERP_CO).once('value').then(function (s) {
      var wrap = s.val();
      var raw = (wrap && wrap.v !== undefined) ? wrap.v : wrap;
      var byBiz = {};
      eachCompany(raw, function (co, at) {
        var k = bizKey(co.bizNo);
        if (k && !byBiz[k]) byBiz[k] = { id: co.id || at, at: at, rec: co };
      });
      return byBiz;
    });
  }

  /* 사진 하나가 업체에 넣을 값 — 읽기 전에 가릴 수 있는 것을 여기서 다 가린다.
     돌려주는 것: { stop: 결과 } 면 더 볼 것이 없다 / { key, mapped } 면 찾아본다. */
  function coPlan(o) {
    var kind = o.kind;
    if (kind !== 'bizreg' && kind !== 'sme') {
      return { err: new Error('사업자등록증과 중소기업확인서만 업체관리로 보낼 수 있습니다') };
    }
    var fields = o.fields || {};
    var key = bizKey(fields.bizno);
    if (!key) {
      return { stop: { found: false, filled: [],
        message: '사업자번호를 읽지 못해 업체를 찾을 수 없습니다' } };
    }
    var mapped = global.PuDocRead.mapTo('erp', kind, fields);
    delete mapped.bizNo;                      // 찾는 열쇠다 — 다시 쓰지 않는다
    if (kind === 'sme') {
      Object.keys(mapped).forEach(function (k) { if (!SME_ONLY[k]) delete mapped[k]; });
    }
    if (!Object.keys(mapped).length) {
      return { stop: { found: false, filled: [], message: '업체에 채울 내용이 없습니다' } };
    }
    return { key: key, mapped: mapped };
  }

  /* 지도에서 찾아 «쓸 것»을 만든다 — 실제 쓰기는 부르는 쪽이 한 번에 모아서 한다.
     돌려주는 것: { result, writes } — writes 가 비면 쓸 것이 없다. */
  function coFill(hit, mapped, o) {
    if (!hit) {
      /* 못 찾았다고 만들지 않는다 — **업체는 계약이 만든다**(대표 결정 2026-08-23).
         사진첩이 업체를 만들면 갈래(자문·급여·기금·노조)를 짐작해야 하고, 상담으로
         받아 둔 서류까지 업체가 되어 업체관리가 서류함이 된다. 계약관리에서 업체가
         생기면 이 사진의 값은 그때 저절로 들어간다(사진첩이 다시 맞춰 본다). */
      return { writes: {}, result: { found: false, filled: [],
        message: '아직 업체관리에 없는 업체입니다 — 계약이 만들어지면 저절로 들어갑니다' } };
    }
    var gaps = fillGaps(hit.rec, mapped);
    var names = Object.keys(gaps);
    if (!names.length) {
      return { writes: {}, result: { found: true, id: hit.id, filled: [],
        message: '업체 「' + (hit.rec.name || '') + '」에 이미 다 들어 있었습니다' } };
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
    return { writes: u, result: { found: true, id: hit.id, filled: labels,
      message: '업체 「' + (hit.rec.name || '') + '」의 빈 칸 ' + labels.length +
        '개를 채웠습니다 (' + labels.join('·') + ')' } };
  }

  /* 담을 수 있게 다듬는다 — 빈 껍데기를 버리고, 개수·길이를 자르고, 몇 개 잘랐는지 센다.
     ⚠ 보낼 때(sendToCoInfo)와 뒤늦게 채울 때(backfillPairs)가 «같은 규칙»을 쓴다.
       두 벌로 두면 한쪽만 고쳐져, 언제 보냈느냐에 따라 담긴 내용이 달라진다. */
  function tidyPairs(raw) {
    var list = Array.isArray(raw) ? raw : [];
    var keep = [], usable = 0;
    list.forEach(function (p) {
      var pk = String((p && p.k) == null ? '' : p.k).trim();
      var pv = String((p && p.v) == null ? '' : p.v).trim();
      if (!pk || !pv) return;                            /* 빈 껍데기는 안 담는다 */
      usable++;
      if (keep.length >= CO_PAIRS_MAX) return;
      keep.push({ k: pk.slice(0, CO_PAIR_LEN), v: pv.slice(0, CO_PAIR_LEN) });
    });
    return { pairs: keep, cut: usable - keep.length };
  }

  /* 여러 장을 «한 번 읽고 한 번 써서» 처리한다. 돌려주는 것은 넣은 순서대로의
     결과 배열 — 사진 하나하나가 저마다 filedCo 에 적을 값을 받는다.
     ⚠ 쓰기도 한 번에 모은다. 152장을 하나씩 쓰면 그만큼 왕복이 생긴다. */
  function sendToCompanyMany(list) {
    var items = list || [];
    if (!items.length) return Promise.resolve([]);
    if (!deps.db) return Promise.reject(new Error('실시간DB가 연결되지 않았습니다'));
    var plans = [], bad = null;
    items.forEach(function (o) {
      var p = coPlan(o || {});
      if (p.err && !bad) bad = p.err;
      plans.push(p);
    });
    if (bad) return Promise.reject(bad);
    /* 찾아볼 것이 하나도 없으면 **읽지 않는다** — 기다리는 사진이 없는데 업체
       목록을 내려받으면 그냥 돈만 나간다. */
    if (!plans.some(function (p) { return p.key; })) {
      return Promise.resolve(plans.map(function (p) { return p.stop; }));
    }
    return companyIndex().then(function (idx) {
      var out = [], u = {};
      plans.forEach(function (p, i) {
        if (p.stop) { out.push(p.stop); return; }
        var got = coFill(idx[p.key] || null, p.mapped, items[i] || {});
        Object.keys(got.writes).forEach(function (k) { u[k] = got.writes[k]; });
        out.push(got.result);
      });
      if (!Object.keys(u).length) return out;
      return deps.db.ref().update(u).then(function () { return out; });
    });
  }

  /* 한 장 — 여러 장 길을 그대로 쓴다(길이 둘이면 한쪽만 고쳐진다). */

  /* ══════ 이미 만들어진 명함의 «빠진 회사»를 되짚어 채운다 (대표 지시 2026-08-31) ══════
     「두장 합친 사진인경우 이부분을 다시 확인하고 자동으로 수정 변경해라」

     서식(form)에서 온 명함은 이제 sendToCards 가 만들 때부터 회사를 달고 온다.
     그런데 그 전에 손으로 만들었거나 다른 사정으로 회사가 안 붙은 채 «이미 있는»
     명함은 저절로 안 고쳐진다 — 실제로 「대천맛김」 담당자 「이권우」 명함이 그랬다.
     사진첩이 «두 장 이상 합친 서식»을 다시 볼 때마다 그 명함을 되짚어 채운다.
     바로 위 sendToCompanyMany(«업체가 나중에 생기면 스스로 맞춰 본다»)와 같은 결이다.

     ⚠ 이미 값이 있으면 손대지 «않는다»(gap-fill) — 사람이 넣어 둔 다른 회사 이름을
       지우면 안 된다. fillGaps 와 같은 규칙이지만, 여기는 회사 «한 칸»만 본다.
     ⚠ 카드가 이미 지워졌으면 조용히 넘어간다 — 지운 명함을 되살리지 않는다.
     ⚠ 채울 것이 하나도 없으면 update 를 «안 부른다» — 헛돈이 나가지 않는다. */
  function repairCardCompanyMany(list) {
    var items = (list || []).filter(function (o) { return o && o.id && !blank(o.company); });
    if (!items.length) return Promise.resolve([]);
    if (!deps.db) return Promise.reject(new Error('실시간DB가 연결되지 않았습니다'));
    return Promise.all(items.map(function (o) {
      return deps.db.ref(CARDS_ROOT + '/items/' + o.id).once('value');
    })).then(function (snaps) {
      var u = {}, out = [];
      snaps.forEach(function (s, i) {
        var cur = s.val();
        var o = items[i];
        if (!cur) { out.push({ id: o.id, patched: false }); return; }
        if (!blank(cur.company)) { out.push({ id: o.id, patched: false }); return; }
        u[CARDS_ROOT + '/items/' + o.id + '/company'] = o.company;
        out.push({ id: o.id, patched: true });
      });
      if (!Object.keys(u).length) return out;
      return deps.db.ref().update(u).then(function () { return out; });
    });
  }

  function sendToCompany(o) {
    return sendToCompanyMany([o || {}]).then(function (r) { return r[0]; });
  }

  /* ══════════════════════════════════════════════════════════════
     계약의 「CMS 자동이체」를 켠다 (대표 지시 2026-08-28)
     ══════════════════════════════════════════════════════════════
     "사진첩에서 cms 계약서가 정리되어 자동이체 승인한 경우 자동이체 체크해달라."

     ⚠ 규칙 넷. 이 넷을 어기면 남의 계약이 바뀐다.

     1. **계약을 새로 만들지 않는다.** 못 찾으면 아무것도 하지 않고 그대로 알린다.
     2. **딱 하나일 때만 켠다**(대표 결정 2026-08-28 ②㉮). 그 업체에 살아 있는 계약이
        둘 이상이면 어느 것인지 알 수 없다 — 「어느 계약인지 골라 주세요」로 알린다.
        진행 중인 것 전부에 켜면 끝난 자문까지 자동이체가 켜진다.
     3. **끄지 않는다.** 켜는 일만 한다. 신청서 한 장 때문에 사람이 손으로 꺼 둔 것이
        도로 켜지는 일은 있어도, 켜 둔 것이 꺼지는 일은 없어야 한다.
     4. **칸 하나만 쓴다.** 계약 레코드를 통째로 쓰면 그 사이 다른 사람이 고친 값이 날아간다
        (업체관리에서 겪은 그 사고다 — coFill 의 까닭과 같다).

     ⚠ 「승인」의 뜻은 부르는 쪽이 정한다(대표 결정 ③㉮: 은행·계좌·예금주가 다 읽히면).
       여기서는 «켜 달라는 말을 들으면 켠다». */
  var ERP_CT = 'data/contracts';

  function eachContract(raw, fn) {
    if (!raw) return;
    if (Array.isArray(raw)) {
      for (var i = 0; i < raw.length; i++) if (raw[i]) fn(raw[i], String(i));
      return;
    }
    if (typeof raw !== 'object') return;
    Object.keys(raw).forEach(function (k) { if (raw[k]) fn(raw[k], k); });
  }

  /* 끝난 계약은 셈에서 뺀다 — 지난해 끝난 자문까지 세면 늘 「여럿」이 되어 아무것도 못 켠다. */
  function ctLive(c) {
    var st = String((c && c.status) || '').toLowerCase();
    return st !== 'closed' && st !== 'done' && st !== 'end' && st !== '종료';
  }

  function setContractCms(o) {
    o = o || {};
    if (!deps.db) return Promise.reject(new Error('실시간DB가 연결되지 않았습니다'));
    var bizKeyV = bizKey(o.bizNo);
    var nameKeyV = coNameKey(o.companyName);
    if (!bizKeyV && !nameKeyV) {
      return Promise.resolve({ ok: false, message: '어느 업체인지 알 수 없습니다' });
    }
    return deps.db.ref(ERP_CT).once('value').then(function (s) {
      var wrap = s.val();
      var raw = (wrap && wrap.v !== undefined) ? wrap.v : wrap;
      var hits = [];
      eachContract(raw, function (c, at) {
        if (!ctLive(c)) return;
        var mine = (bizKeyV && bizKey(c.bizNo) === bizKeyV) ||
                   (!bizKeyV && nameKeyV && coNameKey(c.companyName || c.company) === nameKeyV);
        if (mine) hits.push({ id: c.id || at, at: at, rec: c });
      });
      if (!hits.length) {
        return { ok: false, message: '푸른이알피에 그 업체의 진행 중인 계약이 없습니다' };
      }
      if (hits.length > 1) {
        return { ok: false, many: hits.length,
          message: '계약이 ' + hits.length + '건이라 어느 것인지 알 수 없습니다 — 계약관리에서 골라 켜 주세요' };
      }
      var hit = hits[0];
      if (hit.rec.isCMS === true) {
        return { ok: true, already: true, id: hit.id, message: '이미 자동이체로 되어 있었습니다' };
      }
      var now = Date.now();
      var u = {}, path = ERP_CT + '/v/' + hit.at + '/';
      u[path + 'isCMS'] = true;
      /* 어디서 켰는지 남긴다 — 나중에 「이거 누가 켰지」에 답해야 한다 */
      u[path + 'cmsFrom'] = 'CMS 신청서' + (o.bankName ? ' (' + o.bankName + ')' : '');
      u[path + 'cmsAt'] = now;
      u[path + 'updatedAt'] = now;
      if (o.byName) u[path + 'updatedBy'] = o.byName;
      /* 갱신시각 — 푸른이알피가 이걸 보고 다시 읽는다. 안 쓰면 화면에 안 나타난다. */
      u[ERP_CT + '/u'] = now;
      return deps.db.ref().update(u).then(function () {
        return { ok: true, id: hit.id,
          message: '「' + (hit.rec.companyName || hit.rec.company || '') + '」 계약에 자동이체를 켰습니다' };
      });
    });
  }

  /* ══════ 👷 근로자 정보함으로 보내기 (대표 결정 2026-09-01) ══════
     대표 지시 「근로자 정보함을 별도로 만들고 싶다. 사건 등과 관련해서 근로자 정보를
     사진첩에서 당겨올 경우 연결시켜 만들고 싶다」 + 집단 진정 검토안 ㉯ 승인.

     ── ⚠⚠ 여기에 «사람 정보»를 담지 않는다 ──
     이 자리에 담는 것은 「어느 사진 서류가 누구 것인가」 **하나**다.
     주민번호·주소·연락처는 한 글자도 안 온다 — 그것은 이알피 사건 안에 이미 있고,
     근로자 정보함은 볼 때 그쪽에서 읽는다. 여기 베껴 두면 같은 민감정보가 두 벌이
     되고, 이 자리는 기업정보함 아래라 직원 누구나 읽는다.
     (판독기도 그 넷에서 이름만 읽는다 — js/pu-doc-read.js 의 「담지 마세요」 못박음.)

     ── 사람을 가리는 열쇠는 «이름 + 회사» ──
     대표 결정. 이름만으로 묶으면 동명이인이 한 사람이 되고, 주민번호로 묶으면
     확실하지만 근태표·급여명세서에는 번호가 없어 그 사람들이 다 빠진다.
     ⚠ **회사를 못 읽었으면 아무것도 안 붙인다.** 회사 없는 것끼리 묶으면 남남인
       「김수」 둘이 한 사람이 된다 — 사건 서류에서 그것은 사고다. 그때는 사진첩에
       할 일로 남겨 사람이 회사를 적게 한다.

     ── 한 장이 여러 사람에게 붙는다 ──
     근태표·임금대장은 한 장에 사람이 여럿이다(fields.rows). 그 줄마다 한 사람씩
     붙인다 — 집단 진정에서 근태표 한 장이 서른 명 공용인 것이 이 길이다. */

  var WORKER_ROOT = CARDS_ROOT + '/workerInfo';

  /* 이 갈래는 근로자 정보함으로 간다. 다섯은 «사람 것»이라 회사가 아니라 사람에게 붙는다
     (신분증·주민등록서류·위임장·개인정보동의서·근로계약서), 둘은 «사람이 여럿 적힌 표»다.
     ⚠ pu-photos.html 의 WORKER_KINDS 와 짝이다 — 한쪽만 늘리면 값이 안 오거나
       할 일이 안 뜬다(tests/cards-worker-box.test.js 가 둘을 견준다).
     ⚠ wcontract(근로계약서, 대표 지시 2026-09-02)는 «근로자와 사업주»의 것이다.
       우리 사무소가 당사자인 contract 는 여기 없다 — 그것은 사람이 아니라 업체에 붙는다. */
  /* ⚠⚠ 근태표(timesheet)·급여서류(payslip)는 **일부러 빠져 있다** (대표 지시 2026-09-02
       「근태표등은 필요없다. 주로 푸른이알피에서 근로자 사건등에 대한 부분이다」).
     한 번 넣어 봤더니 근태표 한 장에 적힌 일곱 명이 근로자 정보함 목록 앞머리를
     통째로 먹었다 — 근태표에 이름이 있다는 것은 「그 달에 일했다」는 뜻일 뿐,
     우리가 그 사람 일을 맡았다는 뜻이 아니다.
     ⚠ 다시 넣지 말 것. 넣으면 사람이 아닌 것이 사람으로 목록에 쌓인다. */
  var WORKER_DOC_KINDS = { idcard: 1, resident: 1, mandate: 1, consent: 1, wcontract: 1 };

  /* 실시간DB 열쇠로 쓸 수 있게 다듬는다. 한글은 그대로 쓸 수 있지만
     . # $ / [ ] 는 자리 이름에 못 쓴다 — 이름에 점이 든 경우가 실제로 있다. */
  function wkSafe(v) {
    return String(v == null ? '' : v).replace(/[.#$/[\]]/g, '_').replace(/\s+/g, '');
  }

  /* 사람 열쇠 = 회사 + 이름. 회사 다듬기는 업체 찾기(coNameKey)와 **같은 규칙**이다 —
     「(주)승진텍라인」과 「승진텍 라인」이 다른 사람으로 갈라지면 안 된다.
     ⚠ 둘 중 하나라도 비면 빈 문자열을 준다. 부르는 쪽은 그때 아무것도 안 붙인다. */
  /* ⚠⚠ 회사 다듬기는 **pu-cards.html 의 _norm 과 한 글자도 같아야 한다.**
     그쪽이 같은 열쇠로 사람을 찾는다 — 규칙이 어긋나면 여기서 이은 서류가
     근로자 정보함에서 «딴 사람»에게 붙거나 아무에게도 안 붙는다.
     ⚠ 업체 찾기의 coNameKey 와는 «다르다»(그쪽은 유한회사 표기도 걷어낸다).
       업체를 찾는 일과 사람을 가르는 일은 잣대가 다르다 — 섞지 않는다.
     검사(cards-worker-box)가 두 규칙을 같은 이름들로 돌려 견준다. */
  function wkCompanyNorm(v) {
    return String(v == null ? '' : v)
      .replace(/\s|\(주\)|주식회사|㈜/g, '')
      .replace(/[.#$/[\]]/g, '')
      .toLowerCase();
  }
  function workerKey(name, company) {
    var n = wkSafe(name);
    var c = wkSafe(wkCompanyNorm(company));
    if (!n || !c) return '';
    return c + '__' + n;
  }

  /* 사진 한 장을 가리키는 열쇠 — coInfo/docs 와 **같은 규칙**이다 */
  function wkDocKey(photo) {
    var ph = photo || {};
    if (!ph.id) return '';
    return String(ph.year || 'unknown') + '_' + String(ph.id).replace(/[.#$/[\]]/g, '_');
  }

  /* ── 이 사진이 «누구들» 것인가 — 순수 로직 (검사 대상) ──
     o: { kind, fields, photo:{year,id,owner}, at }
     돌려주는 것: { targets: [{key,name,company,doc}], skipped: [{name,why}] }
     ⚠ 서버를 안 만진다. 그래서 검사가 실데이터 없이 규칙을 그대로 볼 수 있다. */
  function workerDocTargets(o) {
    o = o || {};
    var out = { targets: [], skipped: [] };
    var kind = String(o.kind || '');
    if (!WORKER_DOC_KINDS[kind]) return out;
    var f = o.fields || {};
    var dk = wkDocKey(o.photo);
    if (!dk) { out.skipped.push({ name: '', why: '사진을 가리킬 수 없습니다' }); return out; }
    var company = f.company || '';

    /* ⚠ 받는 갈래 넷(신분증·주민등록서류·위임장·동의서)은 모두 «한 사람 것»이다.
       한 장에 여러 사람이 적힌 표(근태표·임금대장)를 그 줄마다 붙이는 길이 있었는데,
       대표 지시 2026-09-02 로 그 두 갈래가 빠지면서 **아무것도 지나갈 수 없는 길**이
       되었다 — 검사로 밟을 수 없는 길은 두지 않는다(그런 길은 조용히 썩는다).
       근태표를 되살릴 일이 생기면 그때 다시 짠다. */
    if (blank(f.name)) { out.skipped.push({ name: '', why: '이름을 읽지 못했습니다' }); return out; }
    var people = [f.name];

    var seen = {};
    people.forEach(function (nm) {
      var name = String(nm).trim();
      var key = workerKey(name, company);
      if (!key) {
        out.skipped.push({ name: name, why: blank(company)
          ? '회사를 읽지 못했습니다 — 회사를 적어야 사람을 가릴 수 있습니다'
          : '이름을 읽지 못했습니다' });
        return;
      }
      if (seen[key]) return;                       /* 같은 표에 같은 이름이 두 줄 */
      seen[key] = 1;
      out.targets.push({
        key: key, name: name, company: String(company).trim(),
        doc: {
          kind: kind,
          docName: blank(f.docName) ? '' : String(f.docName).trim(),
          period: blank(f.period) ? '' : String(f.period).trim(),
          at: o.at || Date.now(),
          photo: { year: (o.photo && o.photo.year) || '', id: (o.photo && o.photo.id) || '',
                   owner: (o.photo && o.photo.owner) || '' }
        },
        dk: dk
      });
    });
    return out;
  }

  /* ══════ 겹치는 근로자 서류 (대표 결정 2026-09-03, 안 ㉯ 「붙일 때 물어본다」) ══════

     ■ 무엇이 잘못돼 있었나
     서류를 가리는 열쇠가 «서류»가 아니라 **사진 한 장**(wkDocKey = 해_사진번호)이다.
     그래서 아래 「이미 붙어 있으면 다시 안 쓴다」는 막이가 **같은 사진을 두 번 보낼
     때만** 걸리고, **같은 신분증을 다시 찍은 것은 그냥 지나가** 「신분증 2」로 쌓였다.

     ■ 왜 자동으로 안 지우나 (㉰를 안 고른 까닭)
     사람을 가리는 열쇠가 「이름 + 회사」다. 판독이 이름을 한 글자 잘못 읽거나
     동명이인이면 **남의 신분증을 덮어쓴다.** 명함은 다시 찍으면 그만이지만
     신분증은 근로자에게 다시 달라고 해야 한다 — 되돌리는 값이 전혀 다르다.

     ⚠ 이 함수는 «찾기만» 한다. 무엇을 할지는 사람이 정한다. */
  function wkSameKind(cur, kind, dk) {
    var had = (cur && cur.docs) || {};
    return Object.keys(had).filter(function (k) {
      return k !== dk && had[k] && String(had[k].kind || '') === String(kind || '');
    }).map(function (k) {
      return { dk: k, kind: had[k].kind, docName: had[k].docName || '',
               at: Number(had[k].at || 0) || 0, photo: had[k].photo || {} };
    }).sort(function (a, b) { return b.at - a.at; });     // 가장 최근 것이 앞
  }

  /* 이 서류가 그 사람에게 «이미 같은 갈래로» 있는가 — 보내기 «전»에 묻는다.
     돌려주는 것: [{ key, name, company, dk, kind, older:[{dk,at,docName,photo}] }]
     ⚠ 겹치는 것이 없는 항목은 아예 안 담는다 — 부르는 쪽이 length 만 보면 되게. */
  /* 사람 칸을 읽는 «한 곳» — 겹침 찾기와 보내기가 같은 길로 읽는다.
     돌려주는 것: { 사람열쇠: 그 사람 칸 } */
  function readWorkerRows(keys) {
    if (!keys.length) return Promise.resolve({});
    if (!deps.db) return Promise.reject(new Error('실시간DB가 연결되지 않았습니다'));
    return Promise.all(keys.map(function (k) {
      return deps.db.ref(WORKER_ROOT + '/' + k).once('value');
    })).then(function (snaps) {
      var cur = {};
      snaps.forEach(function (s2, i) { cur[keys[i]] = s2.val() || {}; });
      return cur;
    });
  }

  /* ⚠ **읽은 것을 부르는 쪽에 넘겨준다** (2026-09-03 검토에서 찾음).
       종전에는 겹침을 찾을 때 사람 칸을 읽고, 곧바로 sendToWorkerMany 가 **같은 칸을
       또 읽었다** — 겹치지 않는 «흔한 길»에서 왕복이 두 배였다.
       `into` 를 주면 읽은 것을 into.rows 에 담아 준다(돌려주는 모양은 그대로다 —
       부르는 쪽이 length 만 보므로 여기 손대면 그 자리가 다 흔들린다).
     ⚠ 넘겨받은 것은 **곧바로** 쓸 때만 뜻이 있다. 사람이 답할 때까지 기다렸다 쓰면
       그 사이 남이 고친 이름·회사를 옛 값으로 덮을 수 있다 —
       그래서 사람이 고르는 길(바꾸기·둘 다 두기)에서는 넘기지 «않는다». */
  function findWorkerDupes(list, into) {
    var items = Array.isArray(list) ? list : [];
    var want = [];
    items.forEach(function (it) {
      workerDocTargets(it).targets.forEach(function (g) {
        want.push({ key: g.key, name: g.name, company: g.company, dk: g.dk, kind: g.doc.kind });
      });
    });
    if (!want.length) return Promise.resolve([]);
    var keys = want.map(function (w) { return w.key; })
      .filter(function (k, i, a) { return a.indexOf(k) === i; });
    return readWorkerRows(keys).then(function (cur) {
      if (into) into.rows = cur;
      return want.map(function (w) {
        return Object.assign({}, w, { older: wkSameKind(cur[w.key], w.kind, w.dk) });
      }).filter(function (w) { return w.older.length; });
    });
  }

  /* 옛 서류를 «치우고» 새것을 넣는다 — 사람이 「새것으로 바꾸기」를 골랐을 때만.
     ⚠ 사진은 여기서 안 지운다. 화면 쪽이 휴지통으로 보낸다(30일 안에 되살린다) —
       저장 층이 남의 사진첩에 손대기 시작하면 어디서 지워졌는지 아무도 못 짚는다. */
  function dropWorkerDocs(key, dks) {
    var list = (dks || []).filter(Boolean);
    if (!key || !list.length) return Promise.resolve(0);
    if (!deps.db) return Promise.reject(new Error('실시간DB가 연결되지 않았습니다'));
    /* ★★ **청구한 서류는 못 걷는다** (대표 결정 2026-09-03, 청구 ㉮).
       ㉮(서류에 도장만)를 고른 대가가 이것이다 — 근거가 사라질 수 있는 장부는
       장부가 아니다. 이 한 줄이 빠지면 ㉮ 는 청구 근거로 쓸 수 없다. */
    return deps.db.ref(WORKER_ROOT + '/' + key + '/docs').once('value').then(function (s) {
      var had = s.val() || {};
      var locked = list.filter(function (dk) { return had[dk] && had[dk].billed; });
      if (locked.length) {
        return Promise.reject(new Error(
          '이미 청구한 서류 ' + locked.length + '장은 걷을 수 없습니다 — 청구 근거입니다'));
      }
      var u = {};
      list.forEach(function (dk) { u[WORKER_ROOT + '/' + key + '/docs/' + dk] = null; });
      return deps.db.ref().update(u).then(function () { return list.length; });
    });
  }

  /* ══════ 🧾 청구 도장 (대표 결정 2026-09-03, 안 ㉮ 「서류에 도장만」) ══════
     세는 단위는 **업체 × 근로자 × 서류종류 = 1건**이다. 건수는 그때그때 세고,
     담는 것은 「청구했나」 하나뿐이라 **새 자리도 새 규칙도 없다.**

     ⚠ **금액은 여기 안 담는다.** 붙는 순간 이 칸이 재무 자료가 되어 재무 권한 없는
       직원에게 막아야 하는 자리가 된다 — 그러면 정작 일을 한 담당자가 제 실적을 못 본다.
       두 곳을 잇는 데는 업체 이름과 건수면 충분하다.
     ⚠ 도장은 **되돌릴 수 있다**(on=false → null). 잘못 찍었을 때 되돌릴 길이 없으면
       사람이 도장 찍기를 무서워해서 아예 안 찍는다 — 그러면 이 칸이 죽는다. */
  function markWorkerBilled(key, dks, by, on) {
    var list = (dks || []).filter(Boolean);
    if (!key || !list.length) return Promise.resolve(0);
    if (!deps.db) return Promise.reject(new Error('실시간DB가 연결되지 않았습니다'));
    var v = (on === false) ? null : { at: Date.now(), by: String(by || '').slice(0, 40) };
    var u = {};
    list.forEach(function (dk) { u[WORKER_ROOT + '/' + key + '/docs/' + dk + '/billed'] = v; });
    return deps.db.ref().update(u).then(function () { return list.length; });
  }

  /* ── 여러 장을 한 번에 보낸다 ──
     list: [{ kind, fields, photo, at }]
     ⚠ 사람마다 «한 번» 읽고, 전체를 «한 번» 쓴다. 서류 한 장마다 오가면
       근태표 서른 줄이 예순 번 왕복이 된다(2026-08-16 에 겪은 그 규모다).
     ⚠ 이미 붙어 있는 서류는 다시 안 쓴다 — 같은 값을 덮어써도 요금은 든다.
     돌려주는 것: { sent, already, skipped:[{name,why}], people }

     ⚠ `rows` 는 «방금» 읽어 둔 사람 칸이다(findWorkerDupes 가 주는 것). 주면 다시 안
       읽는다 — 겹침을 묻고 곧바로 보내는 길에서 같은 칸을 두 번 읽던 것을 없앤다.
     ⚠ **오래된 것을 주면 안 된다.** 이름·회사를 「빈 칸일 때만」 채우는 판단이 이 값을
       보므로, 그 사이 남이 채워 둔 이름을 옛 값으로 덮을 수 있다.
       사람이 답할 때까지 기다린 길(바꾸기·둘 다 두기)에서는 주지 «않는다».
     ⚠ 아는 사람이 한 명이라도 빠져 있으면 통째로 다시 읽는다 — 반만 새 값으로
       판단하면 어느 쪽이 옳은지 아무도 못 짚는다. */
  function sendToWorkerMany(list, rows) {
    var items = Array.isArray(list) ? list : [];
    var out = { sent: 0, already: 0, skipped: [], people: 0 };
    var byKey = {};
    items.forEach(function (it) {
      var t = workerDocTargets(it);
      out.skipped = out.skipped.concat(t.skipped);
      t.targets.forEach(function (g) {
        var e = byKey[g.key] = byKey[g.key] || { name: g.name, company: g.company, docs: {} };
        e.docs[g.dk] = g.doc;
      });
    });
    var keys = Object.keys(byKey);
    out.people = keys.length;
    if (!keys.length) return Promise.resolve(out);
    if (!deps.db) return Promise.reject(new Error('실시간DB가 연결되지 않았습니다'));

    /* 방금 읽어 둔 것이 «사람 전부»를 덮으면 그것을 쓰고, 아니면 통째로 다시 읽는다 */
    var have = rows && keys.every(function (k) { return rows[k] !== undefined; })
      ? Promise.resolve(rows) : readWorkerRows(keys);
    return have.then(function (got) {
      var u = {};
      keys.forEach(function (key) {
        var e = byKey[key], cur = got[key] || {};
        var base = WORKER_ROOT + '/' + key;
        /* 이름·회사는 «빈 칸만» 채운다 — 사람이 고쳐 둔 표기를 덮지 않는다 */
        if (blank(cur.name) && !blank(e.name)) u[base + '/name'] = e.name;
        if (blank(cur.company) && !blank(e.company)) u[base + '/company'] = e.company;
        var had = cur.docs || {};
        Object.keys(e.docs).forEach(function (dk) {
          if (had[dk]) { out.already++; return; }
          u[base + '/docs/' + dk] = e.docs[dk];
          out.sent++;
        });
      });
      if (!Object.keys(u).length) return out;
      return deps.db.ref().update(u).then(function () { return out; });
    });
  }

  /* ══════════════ ✉️ 메일로 보내기 — «사진첩과 메일 사이» (대표 지시 2026-09-03) ══════════════
     「기록 남기고 민감서류 메일」 · 승인 목업 docs/mockups/photos-mail-and-bankbook.html

     ■ 왜 이 층에 있나
     처음에는 사진첩(pu-photos.html)에 그대로 넣었다가 «다른 앱의 클라우드 루트를
     건드리지 않는다» 검사에 걸렸다. 그 검사가 맞다 — 화면이 기업정보함의 속(자리 이름·
     창고 이름)을 알기 시작하면, 그쪽이 바뀔 때 화면이 조용히 깨진다.
     이 층은 원래 «사진첩 ↔ 기업정보함» 사이를 잇는 자리이고, 창고 이름도 여기 있다.

     ■ ⚠⚠ 창고가 «둘»이다
     사진첩 창고는 pureun-erp-hrphotos, 메일 첨부 창고는 pureun-erp-photos 다.
     firebase.storage() 를 그냥 쓰면 사진첩 창고에 올라가고 **서버는 못 찾아 첨부가
     조용히 빠진 채** 메일이 나간다 — 가장 나쁜 실패다. cardsStorage() 가 콕 집는다.

     ■ ⚠⚠ 원본 «자리»를 넘기면 사진이 지워진다
     서버는 보낸 뒤 첨부로 쓴 자리를 치운다(임시 첨부가 쌓이지 않게).
     그래서 원본을 가리키지 않고 **사본을 임시 자리에 올려** 그 자리를 넘긴다. */

  var MAIL_FN_URL = 'https://asia-northeast3-pureun-erp.cloudfunctions.net/sendMaterialMail';
  var MAIL_MAX_BYTES = 18 * 1024 * 1024;      /* 다음메일이 주는 만큼 */
  var _mailIdx = null;                        /* 경량 검색목록 — 한 번만 읽는다 */

  /* 받는 사람 고르개의 알맹이 — 순수 함수다(검사 대상).
     ⚠ 이메일이 «없는» 명함은 안 내놓는다. 골라도 보낼 수가 없다.
     ⚠ 두 글자 미만으로는 안 찾는다 — 전부가 쏟아지면 고를 수가 없다. */
  function pickMailPeople(idx, query) {
    var q = String(query == null ? '' : query).trim().toLowerCase()
      .replace(/[\s\-㈜()]|주식회사/g, '');
    if (q.length < 2) return [];
    var out = [];
    Object.keys(idx || {}).forEach(function (id) {
      if (out.length >= 40) return;
      var r = idx[id];
      if (!r || r.k === 'biz') return;          /* 사람(명함)만 */
      if (!r.e) return;
      var hay = (String(r.n || '') + String(r.c || '') + String(r.ti || '') + String(r.e || ''))
        .toLowerCase().replace(/[\s\-㈜()]|주식회사/g, '');
      if (hay.indexOf(q) >= 0) {
        out.push({ id: id, name: r.n || '', company: r.c || '', email: r.e });
      }
    });
    return out;
  }
  /* 목록을 한 번 읽어 두고 찾는다 — 글자를 칠 때마다 내려받지 않는다 */
  function findMailPeople(query) {
    if (_mailIdx) return Promise.resolve(pickMailPeople(_mailIdx, query));
    if (!deps.db) return Promise.reject(new Error('실시간DB가 연결되지 않았습니다'));
    return deps.db.ref(CARDS_ROOT + '/idx').once('value').then(function (s) {
      _mailIdx = s.val() || {};
      return pickMailPeople(_mailIdx, query);
    });
  }

  /* 첨부 한 개를 «임시 자리»에 올린다. 돌려주는 것: { name, size, path } */
  function putMailFile(blob, name) {
    if (!blob) return Promise.reject(new Error('붙일 것이 없습니다'));
    if (blob.size > MAIL_MAX_BYTES) {
      return Promise.reject(new Error('파일이 너무 큽니다 (' + Math.round(blob.size / 1048576) + 'MB)'));
    }
    var st = cardsStorage();
    if (!st) return Promise.reject(new Error('창고에 연결하지 못했습니다'));
    var u = global.firebase && global.firebase.auth && global.firebase.auth().currentUser;
    if (!u) return Promise.reject(new Error('로그인이 필요합니다'));
    /* ⚠ 파일 이름을 «자리»에 안 쓴다 — 한글·빈칸·슬래시가 든 이름이 그대로 주소가 되면
         올라가지 않는 것이 생긴다. 이름은 보낼 때 따로 실어 보낸다. */
    var key = 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    var path = CARDS_ROOT + '/mailout/' + u.uid + '/' + key;
    return st.ref(path).put(blob).then(function () {
      return { name: String(name || '첨부'), size: blob.size, path: path };
    });
  }

  /* 서버에 보내 달라고 부른다 — 기업정보함이 쓰는 «그 서버»다(길이 둘이면 한쪽만 고쳐진다). */
  function sendMail(payload) {
    var u = global.firebase && global.firebase.auth && global.firebase.auth().currentUser;
    if (!u) return Promise.reject(new Error('로그인이 풀렸습니다'));
    return u.getIdToken().then(function (token) {
      return global.fetch(MAIL_FN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify(payload || {})
      });
    }).then(function (res) {
      return res.json().catch(function () { return null; }).then(function (j) {
        if (!res.ok || !j || !j.ok) throw new Error((j && j.error) || ('서버 응답 ' + res.status));
        return j;
      });
    });
  }

  global.PuDocFile = {
    init: init,
    MAIL_MAX_BYTES: MAIL_MAX_BYTES,
    pickMailPeople: pickMailPeople,
    findMailPeople: findMailPeople,
    putMailFile: putMailFile,
    sendMail: sendMail,
    inPrivateVault: inPrivateVault,
    byKeyName: byKeyName,
    findExisting: findExisting,
    fillGaps: fillGaps,
    idxOf: idxOf,
    whenText: whenText,
    sendToCards: sendToCards,
    findCompanyByBizNo: findCompanyByBizNo,
    coNameKey: coNameKey,
    findCompanyByName: findCompanyByName,
    companyMgrSids: companyMgrSids,
    setContractCms: setContractCms,
    companyIndex: companyIndex,
    sendToCoInfo: sendToCoInfo,
    backfillPairs: backfillPairs,
    sendToCompany: sendToCompany,
    sendToCompanyMany: sendToCompanyMany,
    repairCardCompanyMany: repairCardCompanyMany,
    WORKER_DOC_KINDS: WORKER_DOC_KINDS,
    workerKey: workerKey,
    workerDocTargets: workerDocTargets,
    wkSameKind: wkSameKind,
    findWorkerDupes: findWorkerDupes,
    dropWorkerDocs: dropWorkerDocs,
    markWorkerBilled: markWorkerBilled,
    sendToWorkerMany: sendToWorkerMany
  };
})(typeof window !== 'undefined' ? window : globalThis);
