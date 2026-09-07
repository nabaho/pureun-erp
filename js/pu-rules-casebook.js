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
    /* 한 사업장의 회차 «전부» — 이어 올리기가 sha 를 훑는 자리다. 본문은 딴 층이라 가볍다. */
    revs: function (siteKey) { return DB_ROOT + '/rev/' + siteKey; },
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

  /* ══════ 2단계 — 일괄 분류 (설계서 §4 「이 물건의 심장」) ══════
     폴더를 통째로 떨어뜨리면 파일마다 셋을 가려야 한다 — 어느 사업장 / 몇 년 / 무슨 서류.
     ⚠⚠ 여기도 «화면·Firebase 없음»이다. 가려서 «표»를 돌려줄 뿐, 아무것도 안 올린다.
     ★ 원칙 — 못 가리면 «추측하지 않는다».
       빈칸은 눈에 띄지만 틀린 값을 확신해서 넣으면 아무도 못 찾는다. 수백 건이면 더욱
       그렇다. 애매한 것은 etc 로 조용히 밀어 넣지 않고 «확인 필요»로 사람 앞에 올린다.
       (설계서가 실제 사고로 확인했다 — erpVatTextToFlag 가 「부가세 불포함」을 정반대로
        판정해, 청구액이 10% 적게 잡히고 있었다.) */

  /* 연도 — 파일명 20xx › 본문 시행일 › 파일 수정일. rules.html 의 bankYearOf 와 같은 규칙.
     ⚠ 못 가리면 «올해로 바꾸지 않는다». 빈 문자열로 두어 확인 필요가 되게 한다. */
  function yearOf(name, text, mtime) {
    var m = String(name == null ? '' : name).match(/(20\d\d)/);
    if (m) return m[1];
    var ds = String(text == null ? '' : text)
      .match(/(20\d\d)\s*[년.]\s*\d{1,2}\s*[월.]\s*\d{1,2}/g) || [];
    if (ds.length) {
      var years = ds.map(function (x) { return (x.match(/20\d\d/) || [''])[0]; }).sort();
      return years[years.length - 1];
    }
    if (mtime) {
      var d = new Date(mtime);
      if (!isNaN(d.getTime())) return String(d.getFullYear());
    }
    return '';
  }

  /* 부칙 시행일 — 「한 회차에 취업규칙이 둘인데 신·구 표시가 없으면 이른 쪽이 before」 */
  function effDateOf(text) {
    var m = String(text == null ? '' : text)
      .match(/(20\d\d)\s*[년.]\s*(\d{1,2})\s*[월.]\s*(\d{1,2})/);
    if (!m) return '';
    return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
  }

  /* 폴더 — webkitRelativePath 의 맨 앞 조각. 같은 폴더에 한꺼번에 적용할 때 쓴다. */
  function folderOf(entry) {
    var p = String((entry && entry.path) || '');
    var at = p.lastIndexOf('/');
    return at > 0 ? p.slice(0, at) : '';
  }

  /* 파일 하나를 가린다 — 못 가린 것은 why 에 «무엇을» 못 가렸는지 적는다 */
  function classifyOne(entry, erpList) {
    var e = entry || {};
    var role = roleOf(e.name || '', e.head || '');
    var site = siteOf(e, erpList || []);
    var year = yearOf(e.name || '', e.head || '', e.mtime);
    var why = [];
    if (!site.site) why.push('사업장');
    if (!year) why.push('연도');
    if (!role) why.push('서류종류');
    return {
      path: String(e.path || e.name || ''), name: String(e.name || ''),
      folder: folderOf(e),
      site: site.site, bizno: site.bizno, how: site.how,
      year: year, role: role, eff: effDateOf(e.head || ''),
      need: why.length > 0, why: why
    };
  }

  /* 폴더 하나를 통째로 — 그리고 «신·구»를 가린다 */
  function classify(entries, erpList) {
    var rows = (entries || []).map(function (e) { return classifyOne(e, erpList); });
    return markBeforeAfter(rows);
  }

  /* ★ 한 회차에 취업규칙이 «둘»인데 신·구 표시가 없으면 부칙 시행일이 이른 쪽을 before.
     ⚠ 시행일을 둘 다 모르면 «가리지 않는다» — 확인 필요로 남긴다.
       날짜 없이 파일 차례로 정하면 폴더를 다시 읽을 때 답이 달라진다. */
  function markBeforeAfter(rows) {
    var 묶음 = {};
    rows.forEach(function (r) {
      if (r.role) return;                       /* 이미 가려진 것은 손대지 않는다 */
      if (!r.site || !r.year) return;
      var k = r.site + '|' + r.year;
      (묶음[k] = 묶음[k] || []).push(r);
    });
    Object.keys(묶음).forEach(function (k) {
      var 짝 = 묶음[k];
      if (짝.length !== 2) return;
      if (!짝[0].eff || !짝[1].eff || 짝[0].eff === 짝[1].eff) return;
      var 이른것 = (짝[0].eff < 짝[1].eff) ? 짝[0] : 짝[1];
      var 늦은것 = (이른것 === 짝[0]) ? 짝[1] : 짝[0];
      이른것.role = 'before'; 늦은것.role = 'after';
      [이른것, 늦은것].forEach(function (r) {
        r.why = r.why.filter(function (w) { return w !== '서류종류'; });
        r.need = r.why.length > 0;
        r.how = (r.how ? r.how + '+' : '') + '시행일';
      });
    });
    return rows;
  }

  /* 한 줄을 고치면 «같은 폴더의 나머지»에 한 번에 — 수백 건을 한 줄씩 고칠 수는 없다.
     ⚠ 이미 사업장이 가려진 줄은 «덮지 않는다». 덮으면 맞게 가려진 것까지 뭉갠다.
       덮으려면 부르는 쪽이 force 를 준다(사람이 「전부 이 사업장으로」를 누른 때). */
  /* ★ 어느 짐작이 «단단한가» — ERP 업체와 맞은 것만 단단하다.
     폴더·파일명에서 가져온 이름은 «짐작»이다. 폴더가 「2022개정」 이면 그것이
     사업장으로 들어앉는데, 사람이 진짜 사업장을 알려 주는 자리에서 그 짐작을
     지켜 주면 「눌러도 안 바뀐다」가 된다(2026-09-05 에 실제로 그랬다).
     ⚠ 그렇다고 ERP 로 맞은 것까지 덮지는 않는다 — 그건 사람이 시킬 때만(force). */
  function firmSite(r) { return !!(r && r.site && String(r.how || '').indexOf('ERP') === 0); }

  function applyFolderSite(rows, folder, site, bizno, force) {
    return (rows || []).map(function (r) {
      if (r.folder !== folder) return r;
      if (firmSite(r) && !force) return r;
      var why = r.why.filter(function (w) { return w !== '사업장'; });
      return Object.assign({}, r, { site: site, bizno: bizno || '', how: '사람',
        why: why, need: why.length > 0 });
    });
  }

  /* ★ 확인 필요분은 «빼고 먼저 올린다» — 17건 때문에 325건이 막히면 안 된다.
     다시 올릴 때 sha 로 이미 올라간 것은 건너뛰므로 안전하다(설계서 §4 결정 2). */
  function splitReady(rows) {
    var ready = [], need = [];
    (rows || []).forEach(function (r) { (r.need ? need : ready).push(r); });
    return { ready: ready, need: need };
  }

  /* ★ 쓰는 순서 — «무거운 것부터». 중간에 끊기면 「파일은 있고 색인이 없는」 고아가
     남는다. 그래서 rev 에 적힌 것만 목록에 보이게 하고, 다시 올릴 때 sha 로 고아를
     찾아 색인만 다시 붙인다(파일을 또 올리지 않는다). 설계서 §7. */
  var WRITE_ORDER = ['file', 'text', 'rev', 'index'];

  /* ══════ 2단계-B — 올릴 것을 «가른다» (설계서 §7 「중단은 예외가 아니라 기본값」) ══════
     화면은 이 표만 보고 올린다. 여기에 Firebase 도 DOM 도 없다 — 그래야 검사가 돈다.

     state.existing[siteKey] = [ { revId, year, shas:[…] }, … ]   ← 서고에 이미 있는 회차
     돌려주는 것:
       need  확인 필요 — 안 올린다(17건 때문에 325건이 막히면 안 된다)
       skip  sha 가 이미 서고에 있다 — 같은 폴더를 다시 떨어뜨려도 두 번 안 올린다
       revs  올릴 회차. 같은 사업장·같은 해의 서류 여러 벌이 «한 회차»로 모인다

     ★ 끊긴 것을 «이어» 올린다 — 같은 사업장·같은 해에 이미 있는 회차가 이 묶음의
       파일 하나라도 들고 있으면 «그 회차에 이어 붙인다»(새 회차를 만들지 않는다).
       안 그러면 넷 중 셋을 올리고 끊겼을 때 나머지 하나가 「2022-2」라는 유령 회차로
       혼자 앉는다 — 설계서 §7 이 말한 고아다. */
  function uploadPlan(rows, state) {
    var st = state || {};
    var existing = st.existing || {};
    var need = [], skip = [], 통 = {}, 차례 = [];
    /* 건너뛴 파일이 어느 회차에 들어 있었는지 — 남은 짝을 «그 회차로» 보낼 표찰 */
    var 이음 = {};

    (rows || []).forEach(function (r) {
      if (r.need) { need.push(r); return; }
      var siteKey = siteKeyOf(r.bizno, r.site);
      var 있던것 = existing[siteKey] || [];
      var 이미 = null, i;
      for (i = 0; i < 있던것.length; i++) {
        if ((있던것[i].shas || []).indexOf(r.sha) >= 0) { 이미 = 있던것[i]; break; }
      }
      if (이미 && r.sha) {
        이음[siteKey + '|' + r.year] = 이미.revId;
        skip.push(Object.assign({}, r, { at: 이미.revId }));
        return;
      }

      var k = siteKey + '|' + r.year;
      if (!통[k]) {
        통[k] = { siteKey: siteKey, site: r.site, bizno: r.bizno || '', year: r.year,
                  revId: '', isNew: true, docs: [] };
        차례.push(통[k]);
      }
      var 회 = 통[k];
      /* 같은 회차에 같은 역할이 둘 — 어느 것이 진짜인지 «내가 못 고른다» */
      for (i = 0; i < 회.docs.length; i++) {
        if (회.docs[i].role === r.role) {
          var why = (r.why || []).concat(['같은 회차에 ' + r.role + ' 가 둘']);
          need.push(Object.assign({}, r, { need: true, why: why }));
          return;
        }
      }
      회.docs.push(r);
    });

    /* 회차 번호는 «묶음을 다 모은 뒤에» 매긴다 — 파일 차례에 따라 답이 달라지지 않게 */
    차례.forEach(function (회) {
      var 있던것 = existing[회.siteKey] || [];
      var 표찰 = 이음[회.siteKey + '|' + 회.year];
      if (표찰) { 회.revId = 표찰; 회.isNew = false; return; }
      var 이을것 = null, i, j;
      for (i = 0; i < 있던것.length && !이을것; i++) {
        if (String(있던것[i].year) !== String(회.year)) continue;
        for (j = 0; j < 회.docs.length; j++) {
          if ((있던것[i].shas || []).indexOf(회.docs[j].sha) >= 0) { 이을것 = 있던것[i]; break; }
        }
      }
      if (이을것) { 회.revId = 이을것.revId; 회.isNew = false; return; }
      회.revId = revIdOf(회.year, 있던것.map(function (x) { return x.revId; }));
    });

    return { need: need, skip: skip, revs: 차례, order: WRITE_ORDER };
  }

  /* 색인 낱말 — «개정본(after)만». before 까지 넣으면 옛 문구가 검색에 섞인다
     (문안 은행이 「⚠ 개정 전 문구 의심」으로 이미 겪은 일이다. 설계서 §3-④). */
  var IDX_MAX = 60;
  var IDX_STOP = ['취업규칙', '제정', '개정', '사업장', '근로자', '회사', '경우', '이하', '다음',
                  '한다', '있다', '없다', '또는', '기타', '관하여', '대하여', '위하여'];
  function idxKeysOf(role, text) {
    if (role !== 'after') return [];
    var 낱말 = String(text == null ? '' : text).match(/[가-힣]{2,10}/g) || [];
    var 셈 = {};
    낱말.forEach(function (w) {
      if (IDX_STOP.indexOf(w) >= 0) return;
      셈[w] = (셈[w] || 0) + 1;
    });
    return Object.keys(셈)
      .filter(function (w) { return 셈[w] >= 2; })
      .sort(function (a, b) { return 셈[b] - 셈[a] || (a < b ? -1 : 1); })
      .slice(0, IDX_MAX);
  }

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
    paths: paths,
    /* 2단계 — 분류 심장 */
    yearOf: yearOf, effDateOf: effDateOf, folderOf: folderOf,
    classifyOne: classifyOne, classify: classify, markBeforeAfter: markBeforeAfter,
    applyFolderSite: applyFolderSite, firmSite: firmSite,
    splitReady: splitReady, WRITE_ORDER: WRITE_ORDER,
    /* 2단계-B — 올릴 것 가르기 */
    uploadPlan: uploadPlan, idxKeysOf: idxKeysOf, IDX_MAX: IDX_MAX
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.PuRulesCasebook = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
