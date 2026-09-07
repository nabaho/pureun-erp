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
  /* ★ 폴더 이름에서 «연도와 개정 꼬리»를 벗긴다 (2026-09-07 실측에서 잡았다).
     폴더가 「한빛산업2022」면 사업장이 «한빛산업2022»로 앉았다 —
     그러면 같은 회사가 «해마다 딴 사업장»이 되어 이력이 갈라진다.
     ⚠ 벗긴 것으로 «바꿔치기»하지 않는다. 둘 다 후보로 두고 ERP 대조는 원래 이름을
       먼저 본다 — 회사 이름에 정말로 숫자가 든 곳이 있다(「2020컴퍼니」).
       ERP 로 못 맞췄을 때 «보여 줄» 이름만 벗긴 쪽을 쓴다. */
  var YEAR_IN = /(19|20)\d{2}\s*(년도|년)?/g;
  var REV_TAIL = /[_\-\s]*(전부개정|일부개정|개정본|개정안|개정|제정|현행|기존|최종|안|판)\s*$/;
  function stripYear(s) {
    var t = String(s == null ? '' : s).replace(YEAR_IN, ' ');
    t = t.replace(REV_TAIL, '');
    return t.replace(/[\s_\-]+/g, ' ').trim();
  }

  function folderHints(p) {
    var parts = String(p || '').split(/[\/\\]/);
    parts.pop();                                  // 마지막은 파일명
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      var s = String(parts[i] || '').trim();
      if (s.length < 2) continue;
      if (YEAR_ONLY.test(s)) continue;
      out.push(s);                                /* 원래 이름이 먼저 — ERP 대조에 유리하다 */
      var c = stripYear(s);
      if (c && c.length >= 2 && c !== s) out.push(c);
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
      /* ⚠ ERP 로 못 맞췄을 때 «보여 줄» 이름에서는 연도를 벗긴다 —
         「한빛산업2022」가 사업장으로 앉으면 같은 회사가 해마다 갈라진다. */
      var 보일것 = stripYear(cands[0]) || cands[0];
      return { site: 보일것, bizno: '', how: isFolder ? '폴더' : '파일명' };
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
    /* 낱말«들»이 모인 층 — 4단계의 앞머리 훑기가 여기를 orderByKey 로 읽는다.
       ⚠ idx() 와 반드시 같은 자리여야 한다. 어긋나면 조용히 아무것도 안 나온다
         (검사가 idx() 가 이 아래인지 견준다). */
    idxK: function () { return DB_ROOT + '/idx/k'; },
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

  /* ══════ 4단계 — 사례집 검색 (설계서 §5-③) ══════
     지금 조문 검색(artsBuild)은 보관함 건마다 Firebase 읽기 1회로 전문을 다 쌓는다.
     수백 건이면 무너진다. 그래서 서고는 색인으로 «후보를 좁히고» 본문은 고른 것만 읽는다.

     ★★ 색인 낱말과 검색어의 길이 관계가 «양쪽»이다 — 한 방향만 하면
        「되는 것 같은데 안 나온다」가 된다.
        · 색인 낱말이 더 «길 때»  「연차」 → 「연차유급휴가」   ⇒ 앞머리 훑기 1회
        · 색인 낱말이 더 «짧을 때» 「연차유급휴가」 → 「연차」  ⇒ 앞토막 정확히 찾기
     ⚠ 색인은 «좁히는 도구»다. 판정은 읽어 온 본문이 한다(기존 artsSearch 와 같은 방식). */

  /* 본문에서 읽을 회차 수의 바닥. 없으면 수백 개를 읽어 지금과 똑같아진다.
     너무 작으면 못 찾고, 너무 크면 무너진다. */
  var IDX_PICK = 40;

  /* 색인을 어떻게 읽을지 정한다. 한글 두 글자 미만이면 색인으로 할 일이 없다(null). */
  function idxLookups(q) {
    var s = String(q == null ? '' : q).replace(/\s+/g, '');
    /* 색인 낱말은 [가-힣] 뿐이다(idxKeysOf) — 영문·숫자만 있으면 걸릴 것이 없다 */
    if (!/^[가-힣]{2,}$/.test(s)) return null;
    var exact = [];
    /* 검색어 «자체»는 앞머리 훑기가 이미 잡는다 — 두 번 읽지 않는다.
       앞토막은 두 글자부터(한 글자 열쇠는 애초에 안 생긴다). */
    for (var n = 2; n < s.length && exact.length < 9; n++) exact.push(s.slice(0, n));
    /* \uf8ff 는 대개의 글자보다 뒤에 온다 — 「s 로 시작하는 모든 열쇠」의 범위 끝이다.
       Firebase 의 orderByKey().startAt(prefix).endAt(prefixEnd) 에 그대로 넣는다.
       \u26a0 소스에 «글자 그대로» 넣지 않는다 — 눈에 안 보이는 글자라 편집·붙여넣기에서
         조용히 사라진다. 이스케이프로 적어 둔다. */
    return { prefix: s, prefixEnd: s + '\uf8ff', exact: exact };
  }

  /* 색인이 준 것을 «사업장·회차» 후보로. 여러 낱말에 걸린 것을 앞에 둔다. */
  function idxRefs(byKeyword) {
    if (!byKeyword || typeof byKeyword !== 'object') return [];
    var 셈 = {};
    Object.keys(byKeyword).forEach(function (kw) {
      var refs = byKeyword[kw];
      if (!refs || typeof refs !== 'object') return;
      Object.keys(refs).forEach(function (ref) {
        var i = ref.indexOf('__');
        /* 망가진 열쇠는 조용히 버린다 — 화면이 죽는 것보다 낫다 */
        if (i <= 0 || i + 2 >= ref.length) return;
        var siteKey = ref.slice(0, i), revId = ref.slice(i + 2);
        if (!siteKey || !revId) return;
        var got = 셈[ref] || (셈[ref] = { siteKey: siteKey, revId: revId, hits: 0 });
        got.hits++;
      });
    });
    return Object.keys(셈).map(function (k) { return 셈[k]; })
      .sort(function (a, b) {
        return b.hits - a.hits
          || (a.siteKey < b.siteKey ? -1 : a.siteKey > b.siteKey ? 1 : 0)
          || (a.revId < b.revId ? -1 : 1);
      })
      .slice(0, IDX_PICK);
  }

  /* ★★ 못 찾는 것을 «말해 준다». 안 적으면 「검색했는데 없네」로 읽힌다 —
     색인은 그 회차에서 «2번 이상» 나온 낱말 «상위 60개»만 담는다(idxKeysOf). */
  function searchCaveat(info) {
    var v = info || {};
    if (v.noIndex) {
      return '서고는 한글 두 글자 이상으로만 찾습니다 — 색인이 한글 낱말로 되어 있습니다.';
    }
    var s = '서고 색인은 한 회차에서 2번 이상 나온 낱말 상위 ' + IDX_MAX
      + '개만 담습니다 — 한 번만 나온 말은 색인에 없어 찾지 못합니다.';
    if (v.capped) {
      s += ' 이번 검색은 ' + v.indexed + '곳이 걸렸는데 그중 '
        + v.picked + '곳의 본문만 읽었습니다(많이 걸린 곳부터).';
    }
    return s;
  }

  /* ══════ 3단계 — 보여 주기 (설계서 §5-①②) ══════
     ⚠ 여기도 «화면·Firebase 없음»이다. 읽어 온 것을 «줄로 만들어» 돌려줄 뿐이다.
     ★ 목록은 index 층«만» 읽는다 — 회차·본문을 함께 읽으면 서고를 여는 순간
       수십 MB 가 딸려 온다(설계서 §3 이 층을 가른 까닭). */

  var ROLE_KO = { before:'개정 전', after:'개정본', daejo:'대조표',
                  report:'신고서', opinion:'의견', consent:'동의', etc:'기타' };

  /* 값 다듬기 — 없는 것은 «빈 글»로. ⚠ null 을 그대로 두면 화면에 「null」이 찍힌다. */
  function txt(v) { return String(v == null ? '' : v).trim(); }

  /* ⚠ 배열도 typeof 로는 'object' 다 — 안 걸러 내면 저장 모양이 바뀔 때 숫자·배열이
     «업체 한 줄»로 세어진다. pu-erp 의 erpCompaniesFrom 이 같은 자리에서 겪었다
     (2026-09-05 「ERP 업체 2건 로드」 — 실은 지도 통째와 시각 숫자였다). */
  function isRow(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }

  /* 목록 한 줄 — casebook/index/{siteKey} 를 그대로 옮긴다(없는 칸은 안 지어낸다) */
  function indexRows(indexValue) {
    var v = indexValue || {}, out = [];
    Object.keys(v).forEach(function (k) {
      var r = v[k]; if (!isRow(r)) return;
      out.push({
        siteKey: k,
        site: txt(r.site), bizno: txt(r.bizno),
        industry: txt(r.industry), size: (typeof r.size === 'number' ? r.size : null),
        revCount: (typeof r.revCount === 'number' ? r.revCount : 0),
        lastYear: txt(r.lastYear),
        updatedAt: txt(r.updatedAt), updatedBy: txt(r.updatedBy)
      });
    });
    /* 최근 연도가 앞, 같으면 사업장 이름. ⚠ 연도 없는 것은 «맨 뒤»로 —
       가운데 섞이면 목록이 뒤죽박죽으로 보인다. */
    out.sort(function (a, b) {
      if (a.lastYear !== b.lastYear) {
        if (!a.lastYear) return 1;
        if (!b.lastYear) return -1;
        return a.lastYear < b.lastYear ? 1 : -1;
      }
      return a.site < b.site ? -1 : (a.site > b.site ? 1 : 0);
    });
    return out;
  }

  /* 목록 거르기 — 연도·업종·규모·담당(설계서 §5-①).
     ⚠ 안 준 칸은 «안 거른다». 빈 값을 조건으로 삼으면 아무것도 안 보인다. */
  function filterIndex(rows, q) {
    var f = q || {};
    var t = txt(f.text).toLowerCase();
    return (rows || []).filter(function (r) {
      if (t) {
        var 건초 = (r.site + ' ' + r.bizno + ' ' + r.industry + ' ' + r.updatedBy).toLowerCase();
        if (건초.indexOf(t) < 0) return false;
      }
      if (f.year && String(r.lastYear) !== String(f.year)) return false;
      if (f.industry && r.industry.indexOf(f.industry) < 0) return false;
      if (f.by && r.updatedBy.indexOf(f.by) < 0) return false;
      /* 규모는 «모르는 것»과 «0명»이 다르다 — 모르는 것은 걸러 낼 근거가 없다 */
      if (f.sizeMin != null) { if (r.size == null || r.size < f.sizeMin) return false; }
      if (f.sizeMax != null) { if (r.size == null || r.size > f.sizeMax) return false; }
      return true;
    });
  }

  /* 목록에서 고를 수 있는 «연도»들 — 실제로 있는 것만, 최근 순 */
  function yearsOf(rows) {
    var seen = {};
    (rows || []).forEach(function (r) { if (r.lastYear) seen[r.lastYear] = 1; });
    return Object.keys(seen).sort().reverse();
  }

  /* 한 사업장의 회차 — casebook/rev/{siteKey} (설계서 §5-②).
     ⚠ 시간순은 «회차 번호»로 정한다. 2022 · 2022-2 는 뒤엣것이 나중이다. */
  function revRows(revValue) {
    var v = revValue || {}, out = [];
    Object.keys(v).forEach(function (k) {
      var r = v[k]; if (!isRow(r)) return;
      out.push({
        revId: k, year: txt(r.year) || k.split('-')[0],
        at: txt(r.at), by: txt(r.by), site: txt(r.site),
        note: txt(r.note), savedAt: txt(r.savedAt),
        chips: revChips(r)
      });
    });
    out.sort(function (a, b) {
      if (a.year !== b.year) return a.year < b.year ? 1 : -1;
      return a.revId < b.revId ? 1 : (a.revId > b.revId ? -1 : 0);
    });
    return out;
  }

  /* 어떤 서류가 들어 있나 — 칩. ROLES 차례를 그대로 따른다(회차마다 자리가 안 바뀌게).
     ⚠ 본문이 없는 것(스캔 PDF 등)은 «있다»고만 하지 않고 그렇다고 적는다(설계서 §8). */
  function revChips(rev) {
    var docs = (rev && rev.docs) || {};
    return ROLES.filter(function (r) { return !!docs[r]; }).map(function (r) {
      var d = docs[r] || {};
      return { role: r, label: ROLE_KO[r] || r, name: txt(d.name),
               noText: d.noText === true, artCount: (typeof d.artCount === 'number' ? d.artCount : null) };
    });
  }

  /* 「이 회차로 검토 시작」이 될 수 있나 — 개정본 본문이 있어야 한다.
     ⚠ 안 되는 까닭을 «말한다». 단추만 흐리면 왜 못 누르는지 아무도 모른다. */
  function canStartReview(rev) {
    var docs = (rev && rev.docs) || {};
    if (!docs.after) return { ok: false, why: '개정본이 없습니다' };
    if (docs.after.noText === true) return { ok: false, why: '개정본에 글이 없습니다 (스캔 파일)' };
    return { ok: true, why: '' };
  }

  /* 실적표 — 목록을 그대로 내보낸다(설계서 §5-① 「그대로 xlsx_gen 으로」).
     ⚠ 화면에서 «거른 뒤»의 줄을 받는다 — 보고 있는 것과 내보낸 것이 달라지면 안 된다. */
  function perfSheet(rows) {
    return {
      /* ⚠ 화면에 「그 뒤 시행」을 보이면서 실적표에서 빼면, 보는 것과 내보낸 것이 달라진다.
         ★ 셀 수 없는 곳은 «0 이 아니라 물음표» — 0 은 「다 반영됐다」로 읽힌다. */
      headers: ['사업장', '사업자번호', '업종', '상시근로자', '개정 회차', '최근 연도', '그 뒤 시행', '담당', '갱신'],
      colRatios: [3, 1.6, 1.8, 1.1, 1, 1, 1.1, 1.2, 1.6],
      rows: (rows || []).map(function (r) {
        return [r.site, r.bizno, r.industry,
                r.size == null ? '' : String(r.size),
                String(r.revCount), r.lastYear,
                (r.sinceCount === undefined ? '' : (r.sinceCount == null ? '?' : String(r.sinceCount))),
                r.updatedBy, r.updatedAt];
      })
    };
  }

  /* ══════ ㉠ 「글 없음」이 실제로 몇 건인가 (대표 물음 2026-09-07) ══════
     「단순 보관은 의미가 없다 — OCR 을 해야 하나」에 답하려면 먼저 «몇 %인지»를 알아야 한다.
     ★ 모르고 OCR 을 붙이면 큰 공사를 헛한다. 그래서 세는 것이 첫걸음이다.

     ⚠ 이 셈은 회차 층을 «통째로» 읽어야 한다 — 목록(index)에는 없는 값이다.
       그래서 화면이 저절로 하지 않고 «사람이 누를 때만» 한 번 돈다(설계서 §3 의 층 가르기). */

  var BODY_ROLES = ['before', 'after', 'daejo'];        /* 본문류 — 검색·문안 재사용에 쓴다 */
  var SUBMIT_ROLES = ['report', 'opinion', 'consent'];  /* 제출류 — 증빙에 쓴다 */

  function tallyNoText(allRevs) {
    var 통 = { total: 0, noText: 0, byRole: {}, body: { total: 0, noText: 0 },
               submit: { total: 0, noText: 0 }, other: { total: 0, noText: 0 },
               sites: 0, revs: 0 };
    ROLES.forEach(function (r) { 통.byRole[r] = { total: 0, noText: 0 }; });

    var v = allRevs || {};
    Object.keys(v).forEach(function (siteKey) {
      var revs = v[siteKey]; if (!isRow(revs)) return;
      통.sites++;
      Object.keys(revs).forEach(function (revId) {
        var rev = revs[revId]; if (!isRow(rev)) return;
        통.revs++;
        var docs = rev.docs; if (!isRow(docs)) return;
        Object.keys(docs).forEach(function (role) {
          var d = docs[role]; if (!isRow(d)) return;
          var 없음 = d.noText === true;
          통.total++; if (없음) 통.noText++;
          if (통.byRole[role]) { 통.byRole[role].total++; if (없음) 통.byRole[role].noText++; }
          var 칸 = BODY_ROLES.indexOf(role) >= 0 ? 통.body
                 : (SUBMIT_ROLES.indexOf(role) >= 0 ? 통.submit : 통.other);
          칸.total++; if (없음) 칸.noText++;
        });
      });
    });
    return 통;
  }

  /* 백분율 — ⚠ 0개를 0% 라고 하지 않는다. 「없다」와 「0%」는 다른 말이다. */
  function pct(part, whole) {
    if (!whole) return null;
    return Math.round(part / whole * 1000) / 10;
  }

  /* ══════ ㉡ 제출 서류에 «몇 줄 적기» (대표 지시 2026-09-07 「ㄴ」) ══════
     ★ 왜 OCR 이 아니라 손으로 적나 — 신고서·의견청취·동의서에서 정작 필요한 것은
       「언제·어느 노동청에·몇 명 동의로」인데, 그건 도장과 손글씨라 OCR 이 못 읽는다.
       본문을 뽑아 봐야 쓸 데가 없다. 사람이 3초면 적고, 그것이 실적 증빙에 쓰인다.
     ★ 칸을 서류마다 따로 두지 않고 «한 모양»으로 둔다 — 셋이 결국 같은 것을 적는다:
       언제(at) · 무슨 번호로(no) · 어디에(office) · 몇 명이(n) · 전체 몇 중(nAll). */

  var SUB_FIELDS = ['at', 'no', 'office', 'n', 'nAll'];

  function subOf(doc) {
    var v = doc && doc.sub;
    if (!isRow(v)) return null;
    var out = { at: txt(v.at), no: txt(v.no), office: txt(v.office),
                n: (typeof v.n === 'number' ? v.n : null),
                nAll: (typeof v.nAll === 'number' ? v.nAll : null) };
    /* ⚠ 아무것도 안 적힌 것은 «없는 것»이다 — 빈 칸을 화면에 그리면 자리만 먹는다 */
    return subWorth(out) ? out : null;
  }
  function subWorth(s) {
    if (!s) return false;
    return !!(s.at || s.no || s.office || s.n != null || s.nAll != null);
  }

  /* 화면에 뿌릴 한 줄 — 서류에 따라 말이 달라진다(「신고」와 「동의」는 다른 일이다).
     ⚠ 없는 값은 «건너뛴다». 「— · — · 0명」처럼 빈 것을 채워 그리지 않는다. */
  function subLine(role, sub) {
    var s = subOf({ sub: sub }) || (subWorth(sub) ? sub : null);
    if (!s) return '';
    var 말 = role === 'report' ? '신고' : (role === 'consent' ? '동의' : (role === 'opinion' ? '의견청취' : '제출'));
    var 조각 = [];
    if (s.at) 조각.push(s.at + ' ' + 말);
    else 조각.push(말);
    if (s.office) 조각.push(s.office);
    if (s.no) 조각.push('접수 ' + s.no);
    if (s.n != null) 조각.push(s.nAll != null ? (s.n + '/' + s.nAll + '명') : (s.n + '명'));
    else if (s.nAll != null) 조각.push('전체 ' + s.nAll + '명');
    return 조각.join(' · ');
  }

  /* 적기 전에 걸러 낸다 — ⚠ 규칙(파이어베이스)에서 막히기 «전에» 사람에게 말해 준다.
     규칙이 막으면 「permission_denied」만 뜨고 무엇이 잘못인지 안 알려 준다. */
  function validSub(s) {
    var v = s || {}, 탈 = [];
    if (v.at && !/^\d{4}-\d{2}-\d{2}$/.test(String(v.at))) 탈.push('날짜는 2024-03-15 꼴로 적으세요');
    if (String(v.no || '').length > 40) 탈.push('접수번호가 너무 깁니다(40자)');
    if (String(v.office || '').length > 60) 탈.push('기관 이름이 너무 깁니다(60자)');
    [['n', '인원'], ['nAll', '전체 인원']].forEach(function (짝) {
      var x = v[짝[0]];
      if (x == null || x === '') return;
      if (typeof x !== 'number' || !isFinite(x) || x < 0 || x > 100000 || x !== Math.floor(x))
        탈.push(짝[1] + '은 0 이상의 정수라야 합니다');
    });
    if (v.n != null && v.nAll != null && v.n > v.nAll) 탈.push('동의 인원이 전체 인원보다 많습니다');
    return { ok: 탈.length === 0, why: 탈 };
  }

  /* 저장할 모양으로 — 빈 값은 «안 담는다»(규칙이 빈 문자열도 자리로 세지 않게) */
  function subClean(s) {
    var v = s || {}, out = {};
    if (txt(v.at)) out.at = txt(v.at);
    if (txt(v.no)) out.no = txt(v.no);
    if (txt(v.office)) out.office = txt(v.office);
    if (typeof v.n === 'number') out.n = v.n;
    if (typeof v.nAll === 'number') out.nAll = v.nAll;
    return Object.keys(out).length ? out : null;
  }

  /* ══════ 「그 뒤 시행 N」 — 서고를 «명단»으로 바꾸는 자리 (대표 물음 2026-09-07) ══════
     대표 물음: 「취규 내용검토 필요한가?」 → 필요하다. 그리고 그것이 서고의 값어치다.

     ★ 왜 — 법이 계속 바뀐다. 2022년에 맞던 문구가 2026년엔 아닐 수 있다.
       규칙집 92개 중 18개에 시행일이 붙어 있고, 2022년 회차 뒤로만 열 개가 시행됐다
       (출산전후휴가 · 육아휴직 · 배우자 출산휴가 · 임금명세서 교부 …).
       마지막 개정이 오래된 사업장은 그것들을 못 반영했을 수 있다 — 곧 연락할 명단이다.

     ★★ 「위반」이라 말하지 않는다. 서고의 회차는 «그때 우리가 낸 것»이지
       «지금 그 회사가 쓰는 것»이 아니다. 우리를 안 거치고 자체 개정했을 수도 있다.
       그래서 「마지막으로 본 것이 언제이고, 그 뒤 시행된 것이 몇 개인가」까지만 말한다.

     ★ 이 셈은 «본문을 안 읽는다» — 목록에 이미 있는 lastYear 와 규칙집 시행일만 견준다.
       그래서 목록 화면에서 곧바로 나온다(층을 안 건드린다). 어느 조문이 실제로 걸리는지는
       사업장을 «열 때» 본문에 규칙을 돌려 본다 — 그건 딴 일이다. */

  /* 규칙집에서 시행일 붙은 것만 추려 둔다 — 화면이 넘겨준다(모듈이 규칙집을 안 들고 있게) */
  function datedRules(rules) {
    return (rules || []).filter(function (r) {
      return r && typeof r.effective === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.effective);
    }).map(function (r) {
      return { id: txt(r.id), name: txt(r.name), law: txt(r.law),
               category: txt(r.category), effective: r.effective };
    }).sort(function (a, b) { return a.effective < b.effective ? -1 : 1; });
  }

  /* 회차 연도 뒤에 시행됐고 «오늘 이미 시행 중»인 것 — 앞으로 시행될 것은 따로 센다.
     ⚠ 아직 시행 전인 것을 「못 반영했다」에 섞으면 안 된다. 그건 아직 안 지켜도 되는 것이다. */
  function sinceRules(lastYear, dated, today) {
    var y = txt(lastYear);
    var 오늘 = txt(today) || new Date().toISOString().slice(0, 10);
    if (!/^\d{4}$/.test(y)) return { since: [], coming: [], unknown: true };
    var 끝 = y + '-12-31';
    var since = [], coming = [];
    (dated || []).forEach(function (r) {
      if (r.effective <= 끝) return;
      if (r.effective <= 오늘) since.push(r); else coming.push(r);
    });
    return { since: since, coming: coming, unknown: false };
  }

  /* 목록 줄마다 붙일 값 — 본문을 안 읽고 나온다 */
  function markSince(rows, dated, today) {
    return (rows || []).map(function (r) {
      var s = sinceRules(r.lastYear, dated, today);
      return Object.assign({}, r, {
        sinceCount: s.unknown ? null : s.since.length,
        comingCount: s.unknown ? null : s.coming.length,
        since: s.since
      });
    });
  }

  /* ══════ 깊은 검토 — 회차 본문에 규칙을 실제로 돌린 «결과를 추린다» ══════
     대표 물음(2026-09-07) 「취규 내용검토 필요한가?」의 둘째 층.
     목록의 「그 뒤 시행 N」은 연도만 견줬다. 여기서는 그 회차 본문에 규칙 92개를 돌려
     «어느 조문이 걸리는지»까지 본다. 돌리는 일은 rules.html 의 evaluate 가 한다 —
     여기는 그 결과를 «사람이 읽을 수 있게 추리는» 몫만 진다(그래야 검사가 돈다).

     ★★ 이 화면이 가장 조심할 것 — 「위반의심 0」을 «깨끗하다»로 읽게 두면 안 된다.
       규칙 92개 중 27개는 «수동확인»이라 기계가 아예 판단하지 않는다.
       0 을 보고 안심하는 순간 그 27개가 통째로 사라진다. 그래서 늘 함께 적는다. */

  /* 상시근로자 수 → 검토 엔진이 쓰는 규모 열쇠.
     ⚠ 모르면 «지어내지 않는다» — null 을 돌려주고, 부르는 쪽이 사람에게 묻는다.
       규모에 따라 보는 규칙이 크게 달라진다(전체 53 · 5인이상 19 · 10인이상 17 · 30인이상 3). */
  function sizeKeyOf(n) {
    if (typeof n !== 'number' || !isFinite(n) || n < 0) return null;
    if (n < 5) return '5인미만';
    if (n < 10) return '5인이상';
    if (n < 30) return '10인이상';
    return '30인이상';
  }

  /* 결과를 추린다. 봐야 할 것(위반의심·누락)을 앞으로, 그 안에서도 «급한 것»을 앞으로.
     ⚠ 「적합」을 목록에 안 싣는다 — 볼 것이 90줄이면 봐야 할 3줄이 묻힌다. */
  var SEVERITY = { '위반의심': 0, '누락': 1, '시행예정': 2, '수동확인': 3, '적합': 4 };
  var CAT_ORDER = ['필수기재', '강행규정', '최신개정', '타법령', '절차', '조건부', '권장'];

  function reviewTally(results) {
    var 셈 = { 적합: 0, 누락: 0, 위반의심: 0, 수동확인: 0, 시행예정: 0 };
    var 봐야 = [];
    (results || []).forEach(function (x) {
      if (!x || !x.rule) return;
      var st = txt(x.status);
      if (셈[st] === undefined) 셈[st] = 0;
      셈[st]++;
      if (st === '위반의심' || st === '누락') {
        봐야.push({ id: txt(x.rule.id), name: txt(x.rule.name), law: txt(x.rule.law),
                    category: txt(x.rule.category), status: st,
                    loc: txt(x.loc), note: txt(x.note), effective: txt(x.rule.effective) });
      }
    });
    봐야.sort(function (a, b) {
      if (SEVERITY[a.status] !== SEVERITY[b.status]) return SEVERITY[a.status] - SEVERITY[b.status];
      var ca = CAT_ORDER.indexOf(a.category), cb = CAT_ORDER.indexOf(b.category);
      if (ca < 0) ca = 99; if (cb < 0) cb = 99;
      if (ca !== cb) return ca - cb;
      return a.id < b.id ? -1 : (a.id > b.id ? 1 : 0);
    });
    return { count: 셈, total: (results || []).length, must: 봐야 };
  }

  /* ★★ 이 검토가 «무엇을 안 봤는지». 숫자 옆에 늘 붙는다.
     ⚠ 늘리지 말 것이 아니라 «줄이지» 말 것 — 안 본 것을 안 적으면 0 이 「깨끗함」이 된다. */
  function reviewCaveats(o) {
    var v = o || {}, 말 = [];
    if (v.manual > 0)
      말.push('규칙 ' + v.manual + '개는 «수동확인»이라 기계가 판단하지 않았습니다 — '
              + '「위반의심 0」이 곧 깨끗하다는 뜻이 아닙니다.');
    if (!v.sizeKey)
      말.push('상시근로자 수를 몰라 규모를 고르지 못했습니다 — 규모에 따라 보는 규칙이 달라집니다.');
    else if (v.sizeFrom === '짐작')
      말.push('규모를 «' + v.sizeKey + '»로 보고 셌습니다(업체 자료에서 가져온 값) — 다르면 고쳐 주십시오.');
    if (v.futureCount > 0)
      말.push('아직 시행 전인 규칙 ' + v.futureCount + '개는 «시행예정»으로 따로 두었습니다.');
    말.push('서고의 회차는 「그때 우리가 낸 것」입니다 — 그 뒤 자체 개정했을 수 있습니다.');
    말.push('규칙 기반 자동 검토이며 최종 판단은 공인노무사의 검토를 거쳐야 합니다.');
    return 말;
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
    nameFromFile: nameFromFile, stripYear: stripYear,
    siteOf: siteOf,
    shaOf: shaOf,
    paths: paths,
    /* 2단계 — 분류 심장 */
    yearOf: yearOf, effDateOf: effDateOf, folderOf: folderOf,
    classifyOne: classifyOne, classify: classify, markBeforeAfter: markBeforeAfter,
    applyFolderSite: applyFolderSite, firmSite: firmSite,
    splitReady: splitReady, WRITE_ORDER: WRITE_ORDER,
    /* 2단계-B — 올릴 것 가르기 */
    uploadPlan: uploadPlan, idxKeysOf: idxKeysOf, IDX_MAX: IDX_MAX,
    /* 4단계 — 사례집 검색 (2026-09-07) */
    idxLookups: idxLookups, idxRefs: idxRefs, searchCaveat: searchCaveat, IDX_PICK: IDX_PICK,
    /* 3단계 — 보여 주기 */
    ROLE_KO: ROLE_KO, indexRows: indexRows, filterIndex: filterIndex, yearsOf: yearsOf,
    revRows: revRows, revChips: revChips, canStartReview: canStartReview, perfSheet: perfSheet,
    /* ㉠ 글 없음 세기 · ㉡ 제출 서류 몇 줄 적기 (2026-09-07) */
    BODY_ROLES: BODY_ROLES, SUBMIT_ROLES: SUBMIT_ROLES, tallyNoText: tallyNoText, pct: pct,
    SUB_FIELDS: SUB_FIELDS, subOf: subOf, subWorth: subWorth, subLine: subLine,
    validSub: validSub, subClean: subClean,
    /* 「그 뒤 시행 N」 — 서고를 명단으로 (2026-09-07) */
    datedRules: datedRules, sinceRules: sinceRules, markSince: markSince,
    /* 깊은 검토 — 결과 추리기 (2026-09-07) */
    sizeKeyOf: sizeKeyOf, reviewTally: reviewTally, reviewCaveats: reviewCaveats,
    CAT_ORDER: CAT_ORDER
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.PuRulesCasebook = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
