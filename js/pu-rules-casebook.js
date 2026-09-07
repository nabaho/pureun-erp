/* 취업규칙 서고 — 순수 판정과 경로 조립 (화면·Firebase 없음)
   설계서: docs/superpowers/specs/2026-09-02-취업규칙-서고-design.md

   여기 있는 함수는 모두 «값을 넣으면 값이 나오는» 것뿐이다. 화면에 두면
   수백 건을 검사로 못 박을 수가 없어서 따로 뺐다. */
(function (global) {
  'use strict';

  /* 실시간DB 키로 쓸 수 없는 글자를 바꾼다.
     ⚠ rules.html:3940 의 fbKey 와 «글자 하나까지» 같아야 한다. */
  function fbKey(s) {
    return String(s || '').replace(/[.#$\[\]\/\s]/g, '_').slice(0, 120) || 'unknown';
  }

  /* 보관함 레코드의 id 와 같은 형태 — doSaveArchive(rules.html:4575).
     하이픈을 지우지 않는다. 일부러 그렇게 둔다: 지우면 이미 쌓인 레코드와 어긋난다. */
  function siteKeyOf(bizno, site) {
    return 'site_' + fbKey(bizno || site);
  }

  /* 조회용 — 하이픈 표기가 갈려도 찾아내려고 두 형태를 모두 준다.
     첫 번째가 «쓸 때의 형태»(보관함 레코드와 같은 것)다. */
  function siteKeyCandidates(bizno, site) {
    var out = [siteKeyOf(bizno, site)];
    var digits = String(bizno || '').replace(/[^0-9]/g, '');
    if (digits) {
      var alt = 'site_' + fbKey(digits);
      if (out.indexOf(alt) < 0) out.push(alt);
    }
    return out;
  }

    var ROLES = ['before', 'after', 'daejo', 'report', 'opinion', 'consent', 'etc'];

  /* 파일명에서 서류종류를 가리는 단서. **배열 순서가 우선순위**다 —
     「신구대조표(개정안)」처럼 둘이 걸리면 위쪽이 이긴다.
     사무소 이름 규칙이 다르면 이 표만 고친다. 코드 여러 곳에 흩으면 다시는 못 고친다.

     ⚠ 설계서 §4 의 before 단서에서 홑글자 「구」를 뺐다 — 「대구지점」·「연구소」가
       전부 개정 전으로 잡힌다. 괄호 낀 「(구)」만 단서로 쓴다. */
  var DOC_ROLE_HINTS = [
    { role: 'daejo',   words: ['신구대조표', '신구 대조표', '대조표', '신구'] },
    { role: 'report',  words: ['신고서'] },
    { role: 'opinion', words: ['의견청취', '의견서', '의견'] },
    { role: 'consent', words: ['동의서', '동의'] },
    { role: 'after',   words: ['개정안', '개정', '최종', '(신)'] },
    { role: 'before',  words: ['현행', '기존', '(구)'] }
  ];

  var HEAD_SCAN = 200;   // 본문은 앞 200자만 본다 — 뒤쪽 낱말에 끌려가지 않게

  function hitRole(text) {
    var t = String(text || '');
    if (!t) return null;
    for (var i = 0; i < DOC_ROLE_HINTS.length; i++) {
      var h = DOC_ROLE_HINTS[i];
      for (var j = 0; j < h.words.length; j++) {
        if (t.indexOf(h.words[j]) >= 0) return h.role;
      }
    }
    return null;
  }

  /* 파일명만 본다(경로는 siteOf 가 쓴다). 파일명으로 못 가리면 본문 첫머리로 보강.
     끝까지 못 가리면 null — 「확인 필요」로 사람에게 올라간다. */
  function roleOf(fileName, headText) {
    var base = String(fileName || '');
    var slash = Math.max(base.lastIndexOf('/'), base.lastIndexOf('\\'));
    if (slash >= 0) base = base.slice(slash + 1);
    base = base.replace(/\.[A-Za-z0-9]{1,5}$/, '');
    var byName = hitRole(base);
    if (byName) return byName;
    return hitRole(String(headText || '').slice(0, HEAD_SCAN));
  }

  /* 회차 번호. 같은 해가 이미 있으면 -2, -3 … 으로 뒤에 붙인다.
     ⚠ 중간에 빈 번호가 있어도 메우지 않는다 — 지운 회차의 파일과 뒤섞일 수 있다.
     연도를 못 가렸으면 조용히 올해로 바꾸지 않고 「연도미상」으로 남긴다. */
  function revIdOf(year, existingIds) {
    var base = String(year == null ? '' : year).trim() || '연도미상';
    var have = {};
    var list = existingIds || [];
    for (var i = 0; i < list.length; i++) have[String(list[i])] = 1;
    if (!have[base]) return base;
    /* ★ 번호는 «뒤로만» 간다 — 빈자리를 메우지 않는다.
       2022 · 2022-3 이 있고 2022-2 를 지운 자리라면, -2 를 다시 쓰는 순간
       지운 회차의 창고 파일(Storage)과 뒤섞인다. 파일은 실시간DB 와 달리
       한 번에 안 지워질 수 있어, 되쓰기는 «남의 파일을 제 회차로» 만든다.
       ⚠ 계획서의 첫 구현은 빈자리를 메웠다(while 로 첫 빈 번호 찾기).
         같은 계획서의 검사가 그것을 막고 있었다 — 검사 쪽이 맞다. */
    var 가장큰 = 1;
    for (var k in have) {
      if (!Object.prototype.hasOwnProperty.call(have, k)) continue;
      if (k.indexOf(base + '-') !== 0) continue;
      var m = Number(k.slice(base.length + 1));
      if (m > 가장큰) 가장큰 = m;
    }
    return base + '-' + (가장큰 + 1);
  }

  /* 업체명 정규화 — pu-erp.html 의 erpNormName 과 같은 규칙.
     그쪽은 pu-erp 안에 있어 rules.html 에서 못 부른다. 앞으로 이 모듈이
     그 규칙의 제자리다(pu-erp 도 나중에 여기로 옮겨 올 수 있다). */
  function normName(s) {
    var t = String(s === null || s === undefined ? '' : s).toLowerCase();
    t = t.replace(/주식회사|㈜|\(주\)|유한회사|합자회사|재단법인|사단법인|\(재\)|\(사\)/g, '');
    t = t.replace(/[\s\-_.,·()\[\]{}'"]/g, '');
    return t;
  }

  /* 「취업규칙_삼성디지컴_개정안」 → 「삼성디지컴」.
     rules.html 의 shortSite 가 쓰는 것과 같은 얼개다. */
  function nameFromFile(name) {
    var base = String(name || '').replace(/\.[A-Za-z0-9]{1,5}$/, '');
    var m = base.match(/취업규칙[_\s]*([가-힣A-Za-z0-9()㈜]{2,20})/);
    if (!m) return '';
    return m[1].replace(/[_\-]*(개정안|개정|최종|제정|현행|기존|안)$/, '').trim();
  }

  var YEAR_ONLY = /^(19|20)\d{2}년?$/;

  /* 폴더 조각 중 사업장 이름일 만한 것 — 연도 폴더와 한 글자는 뺀다. */
  function folderHints(p) {
    var parts = String(p || '').split(/[\/\\]/);
    parts.pop();                                  // 마지막은 파일명
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      var s = String(parts[i] || '').trim();
      if (s.length < 2) continue;
      if (YEAR_ONLY.test(s)) continue;
      out.push(s);
    }
    return out;
  }

  function findErp(cand, erpList) {
    var n = normName(cand);
    if (n.length < 2) return null;
    var list = erpList || [];
    var i;
    for (i = 0; i < list.length; i++) {
      if (list[i] && normName(list[i].name) === n) return { co: list[i], how: 'ERP 정확' };
    }
    for (i = 0; i < list.length; i++) {
      var en = list[i] && normName(list[i].name);
      if (!en) continue;
      if (en.indexOf(n) >= 0 || n.indexOf(en) >= 0) return { co: list[i], how: 'ERP 부분' };
    }
    return null;
  }

  /* 폴더를 먼저, 그다음 파일명. 어느 쪽도 ERP 에 없으면 이름만 두고
     사업자번호는 «빈칸으로 남긴다» — 지어내면 수백 건이 틀린 번호로 붙는다. */
  function siteOf(entry, erpList) {
    var e = entry || {};
    var cands = folderHints(e.path || e.name || '');
    var fromFile = nameFromFile(e.name || '');
    if (fromFile) cands.push(fromFile);

    var i, hit;
    for (i = 0; i < cands.length; i++) {
      hit = findErp(cands[i], erpList);
      if (hit) return { site: hit.co.name || cands[i], bizno: hit.co.bizNo || '', how: hit.how };
    }
    if (cands.length) {
      var isFolder = cands[0] !== fromFile || folderHints(e.path || '').length > 0;
      return { site: cands[0], bizno: '', how: isFolder ? '폴더' : '파일명' };
    }
    return { site: '', bizno: '', how: null };
  }

  function hex(u8) {
    var s = '';
    for (var i = 0; i < u8.length; i++) {
      var h = u8[i].toString(16);
      s += h.length === 1 ? '0' + h : h;
    }
    return s;
  }

  /* SHA-256. 브라우저와 Node 24 모두 crypto.subtle 이 있어 갈래를 하나로 둔다 —
     두 갈래를 두면 한쪽만 검사되고 다른 쪽이 조용히 썩는다. */
  function shaOf(bytes) {
    var u8;
    if (bytes instanceof Uint8Array) u8 = bytes;
    else if (bytes && bytes.byteLength !== undefined) u8 = new Uint8Array(bytes);
    else return Promise.reject(new TypeError('바이트가 아닙니다'));
    var sub = global.crypto && global.crypto.subtle;
    if (!sub) return Promise.reject(new Error('이 환경에서는 파일 해시를 만들 수 없습니다'));
    return sub.digest('SHA-256', u8).then(function (buf) { return hex(new Uint8Array(buf)); });
  }

  var DB_ROOT = 'rules_mgmt/casebook';
  var FILE_ROOT = 'casebook';

  function okRole(role) {
    if (ROLES.indexOf(role) < 0) throw new Error('알 수 없는 역할: ' + role);
    return role;
  }

  /* 경로를 한 곳에 모은다 — 여러 곳에서 문자열로 이어 붙이면 층 경계가 무너진다. */
  var paths = {
    index: function (siteKey) { return DB_ROOT + '/index/' + siteKey; },
    rev: function (siteKey, revId) { return DB_ROOT + '/rev/' + siteKey + '/' + revId; },
    text: function (siteKey, revId, role) {
      return DB_ROOT + '/text/' + siteKey + '/' + revId + '/' + okRole(role);
    },
    idx: function (keyword, siteKey, revId) {
      return DB_ROOT + '/idx/k/' + keyword + '/' + siteKey + '__' + revId;
    },
    file: function (siteKey, revId, role, ext) {
      var e = String(ext || '').replace(/^\./, '').toLowerCase();
      return FILE_ROOT + '/' + siteKey + '/' + revId + '/' + okRole(role) + '.' + e;
    }
  };

  /* ⚠ 계획서(1단계)가 과제마다 「api 에 이것을 더한다」로 흩어 적어 둔 것을 한자리에 모았다.
     흩어 두면 과제를 이어 붙일 때마다 하나씩 빠뜨린다. */
  var api = {
    fbKey: fbKey,
    siteKeyOf: siteKeyOf,
    siteKeyCandidates: siteKeyCandidates,
    ROLES: ROLES,
    DOC_ROLE_HINTS: DOC_ROLE_HINTS,
    roleOf: roleOf,
    revIdOf: revIdOf,
    normName: normName,
    /* ⚠ 계획서가 Produces 목록에 안 적었는데 검사가 부른다 — 2단계가 따로 쓴다고
       적혀 있어 내보내는 것이 맞다(빠뜨리면 2단계에서 같은 것을 또 만든다). */
    nameFromFile: nameFromFile,
    siteOf: siteOf,
    shaOf: shaOf,
    paths: paths
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.PuRulesCasebook = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
