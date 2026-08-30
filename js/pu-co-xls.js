/* 급여담당자 연락처 엑셀 → 업체관리 (대표 결정 2026-08-24)
   ══════════════════════════════════════════════════════════════════
   대표가 담당자별 엑셀 3개를 주셨다. 한 줄은
     사업장명 │ 담당자성명 │ 담당자연락처 │ 이메일주소 │ 세무대리인명 │ 세무담당자연락처 │ 세무 이메일주소
   이고, **담당자(우리 직원)는 파일 이름에만 있다** — 시트 안에는 없다.

   ⚠ 새 칸을 만들지 않는다. 업체관리에 이미 자리가 있다 —
     주담당      managerMain (사번, 이름이 아니다)
     업체 담당자 contacts[] + primaryContactName/Phone/Email(딸림값)
     세무사무실  taxOfficeName · taxContact · taxPhone · taxEmail

   ⚠ 엑셀은 **급여 계산 단위**로, 업체관리는 **계약 단위**로 적혀 있다.
   그래서 「와이앤케이(안산-늘푸른요양센터)」처럼 한 업체의 여러 사업장이
   엑셀에는 각각 한 줄이다. 그 줄은 본 업체의 담당자로 붙인다(대표 결정).

   화면(pu-erp.html)은 이 파일을 불러 쓰고, 그리기만 한다.
   ── 검사: tests/co-xls-assign.test.js */
(function (root) {
  'use strict';

  /* ── 이름 다듬기 ──
     ㈜·(주)·주식회사는 표기만 다르고 같은 곳이다.
     ⚠ 괄호 안의 지점말(모종점·배방점)은 **다른 사업장**이라 지우지 않는다. */
  function normName(v) {
    return String(v == null ? '' : v).normalize('NFC')
      .replace(/[㈜]/g, '')
      .replace(/\(주\)|\(유\)|\(재\)|\(사\)/g, '')
      .replace(/주식회사|유한회사|합자회사|농업회사법인|사회복지법인|의료법인|재단법인|사단법인/g, '')
      .replace(/\s+/g, '')
      .replace(/[.,·・\-–—_'"’”]/g, '')
      .toLowerCase();
  }

  /* 앞머리 — 괄호 앞까지. 「와이앤케이(안산-늘푸른요양센터)」 → 「와이앤케이」 */
  function stemName(v) {
    return normName(String(v == null ? '' : v).normalize('NFC').replace(/\(.*$/, ''));
  }

  /* 파일 이름에서 우리 직원 이름 — 「…이메일주소_주민정.xlsx」 → 주민정 */
  function staffFromFileName(fn) {
    var m = String(fn || '').normalize('NFC').replace(/\.xls[xm]?$/i, '').match(/[_\-\s]([가-힣]{2,4})$/);
    return m ? m[1] : '';
  }

  /* ── 시트 읽기 ──
     머리줄을 「사업장명」으로 찾고, 열은 이름의 일부로 맞춘다 —
     사무대행 가져오기(importSubofficeXlsx)가 쓰는 방식과 같게 둔다. */
  /* 「비었다」를 «글로» 적어 둔 칸들 — 값으로 넣으면 그 글자가 명함에 박힌다.
     ⚠ 통째로 그 말일 때만 본다. 「없음상사」 같은 진짜 이름을 지우면 안 된다. */
  var EMPTY_MARK = /^(?:x|X|-|–|—|\.|없음|없다|없습니다|무|미상|모름|해당없음|[가-힣]*\s*없음)$/;

  function parseGrid(grid, opt) {
    var o = opt || {};
    var rows = Array.isArray(grid) ? grid : [];
    var hi = -1;
    for (var i = 0; i < rows.length && i < 20; i++) {
      var r = rows[i] || [];
      for (var j = 0; j < r.length; j++) {
        if (String(r[j] || '').indexOf('사업장명') >= 0) { hi = i; break; }
      }
      if (hi >= 0) break;
    }
    if (hi < 0) return { error: '머리줄(사업장명)을 찾을 수 없습니다', rows: [] };

    var hdr = (rows[hi] || []).map(function (x) { return String(x == null ? '' : x).trim(); });
    function col(names, from) {
      for (var i2 = from || 0; i2 < hdr.length; i2++) {
        for (var k = 0; k < names.length; k++) {
          if (hdr[i2] && hdr[i2].replace(/\s/g, '').indexOf(names[k]) >= 0) return i2;
        }
      }
      return -1;
    }
    var cSite = col(['사업장명']);
    var cName = col(['담당자성명', '담당자이름']);
    var cPhone = col(['담당자연락처']);
    var cMail = col(['이메일주소']);
    var cTax = col(['세무대리인명', '세무사무실']);
    /* ⚠ 세무 쪽 열은 담당자 쪽과 이름이 겹친다(연락처·이메일주소) —
       세무대리인명 **뒤에서** 찾아야 담당자 것을 잡지 않는다. */
    var cTaxPhone = cTax >= 0 ? col(['세무담당자연락처', '연락처'], cTax + 1) : -1;
    var cTaxMail = cTax >= 0 ? col(['세무이메일주소', '이메일주소'], cTax + 1) : -1;
    if (cSite < 0) return { error: '사업장명 열이 없습니다', rows: [] };

    function cell(r, c) {
      if (c < 0) return '';
      var v = String((r || [])[c] == null ? '' : (r || [])[c]).trim().normalize('NFC');
      /* 엑셀에 「x」로 적어 둔 것은 「없다」는 뜻이다 — 값으로 넣으면 안 된다.
         ⚠ 2026-08-30 실제 파일에 「메일 없음」이라고 «글로» 적힌 칸이 있었다.
           그대로 두면 그 글자가 메일 주소가 되어 명함에 박힌다. */
      return EMPTY_MARK.test(v) ? '' : v;
    }

    var out = [];
    var lastSite = '';
    for (var r2 = hi + 1; r2 < rows.length; r2++) {
      var row = rows[r2] || [];
      var site = cell(row, cSite);
      var nm = cell(row, cName);
      /* ★ 사업장명이 빈 줄 = «윗줄 사업장의 둘째 담당자» (예: 「(주)위드유」의
           김영식 대표 아래 김안아 과장). 업체관리는 한 곳에 담당자 하나면 되니
           예전부터 이 줄을 버렸다 — 그런데 «명함»으로는 그분도 한 사람이다.
         2026-08-30 네 파일에서 이렇게 버려지던 사람이 5명이었다.
         ⚠ 켤 때만 살린다(keepSecondContacts). 업체관리 쪽 셈이 달라지면 안 된다. */
      if (!site) {
        if (!o.keepSecondContacts || !nm || !lastSite) continue;
        site = lastSite;
      } else {
        lastSite = site;
      }
      out.push({
        site: site,
        cName: nm, cPhone: cell(row, cPhone), cMail: cell(row, cMail),
        tName: cell(row, cTax), tPhone: cell(row, cTaxPhone), tMail: cell(row, cTaxMail),
        /* 윗줄에서 사업장을 물려받은 줄인가 — 화면이 「둘째 담당자」로 보여 줄 수 있게 */
        second: !cell(row, cSite) ? 1 : 0
      });
    }
    return { error: '', rows: out };
  }

  /* ── 「전광식 대표」·「남유라주임」 을 이름과 직책으로 가른다 ──
     엑셀에는 둘이 한 칸에 들어 있다. 명함으로 넣을 때는 갈라야
     이름으로 찾고 직책으로 부를 수 있다.
     ⚠ 띄어쓰기가 «있을 수도 없을 수도» 있다 — 「전광식 대표」와 「남유라주임」이
       같은 파일에 섞여 있다.
     ⚠ 못 가르면 통째로 이름에 둔다. 억지로 자르면 「김안」+「아 과장」처럼 된다. */
  /* ⚠ 긴 것을 «먼저» 둔다 — 「대표이사」가 「대표」로 잘리면 안 된다.
     ⚠ 2026-08-30 실제 파일에서 「이지해 전무」가 안 갈렸다 — 「전무이사」만 있고
       「전무」가 없었다. 목록에 없는 직책은 통째로 이름이 된다. */
  var TITLES = ['대표이사', '전무이사', '상무이사', '부사장', '부회장',
    '본부장', '사무국장', '사무장', '관리자', '담당자',
    '대표', '사장', '회장', '전무', '상무', '감사', '이사', '고문',
    '원장', '실장', '부장', '차장', '과장', '팀장', '대리', '주임', '사원',
    '점장', '소장', '반장', '조장', '주무관', '담당',
    '간호사', '약사', '세무사', '회계사', '노무사', '변호사'];

  function splitNameTitle(v) {
    var s = String(v == null ? '' : v).trim().normalize('NFC').replace(/\s+/g, ' ');
    if (!s) return { name: '', title: '' };
    for (var i = 0; i < TITLES.length; i++) {
      var t = TITLES[i];
      if (s.length > t.length && s.slice(-t.length) === t) {
        var nm = s.slice(0, s.length - t.length).trim();
        /* 이름이 한 글자만 남으면 안 가른 것으로 본다 — 「김 대표」는 그대로 둔다 */
        if (nm.length >= 2) return { name: nm, title: t };
      }
    }
    return { name: s, title: '' };
  }

  /* ── 빈칸 물려받기 (대표 결정 2026-08-24) ──
     「늘봄반찬(모종점)」에만 연락처가 있고 「늘봄반찬(배방점)」은 비어 있다 —
     한 곳이 지점을 여럿 둔 것이라 위 줄과 같은 사람이다.
     ⚠ **이름 앞머리가 같을 때만** 물려받는다. 「대건정밀」 다음의
     「세창이엔지」까지 물려받으면 남의 연락처가 붙는다. */
  function fillDown(rows) {
    var out = [], last = null;
    (rows || []).forEach(function (r) {
      var v = Object.assign({}, r);
      if (!v.cMail && !v.cName && last && stemName(last.site) === stemName(v.site)
        && stemName(v.site).length >= 2) {
        v.cName = last.cName; v.cPhone = last.cPhone; v.cMail = last.cMail;
        if (!v.tName) { v.tName = last.tName; v.tPhone = last.tPhone; v.tMail = last.tMail; }
        v.inherited = last.site;
      }
      if (v.cMail || v.cName) last = v;
      out.push(v);
    });
    return out;
  }

  /* ── 업체관리와 대조 ──
     kind
       ok     이름이 맞고 유형도 「급여」
       type   맞지만 유형이 급여가 아니다 → 유형을 바꾼다(대표 결정)
       attach 없다. 그러나 본 업체가 있다 → 그 업체의 담당자로 붙인다(대표 결정)
       none   본 업체도 없다 → 아무것도 안 한다(목록으로 알린다)
       clash  같은 업체를 다른 직원의 파일이 둘 다 가리킨다 → 주담당을 건드리지 않는다 */
  function plan(files, companies, users) {
    var cos = Array.isArray(companies) ? companies.filter(Boolean) : [];
    var sidByName = {};
    (users || []).forEach(function (u) {
      if (u && u.name && u.sid) sidByName[String(u.name).normalize('NFC').replace(/\s/g, '')] = u.sid;
    });

    var byName = {};
    cos.forEach(function (co) {
      var k = normName(co.name);
      if (k && !byName[k]) byName[k] = co;      // 이름이 겹치면 첫 것 — 중복 정리는 딴 일이다
    });

    var items = [];
    (files || []).forEach(function (f) {
      var who = f.who || '';
      var sid = sidByName[String(who).replace(/\s/g, '')] || '';
      fillDown(f.rows || []).forEach(function (r) {
        var it = Object.assign({}, r, { who: who, sid: sid, kind: 'none', coId: '', coName: '' });
        var hit = byName[normName(r.site)];
        if (hit) {
          it.coId = hit.id || '';
          it.coName = hit.name || '';
          it.kind = String(hit.typeCode || '') === '급여' ? 'ok' : 'type';
          it.wasType = String(hit.typeCode || '');
          /* 지금 주담당이 누구인지 남긴다 — 남의 담당을 가져오는 일은
             화면에서 「지금 ○○○ → 주민정」으로 보여야 한다. */
          it.wasSid = String(hit.managerMain || '');
        } else {
          var st = stemName(r.site);
          var parent = null;
          if (st.length >= 2) {
            for (var i = 0; i < cos.length; i++) {
              var n = normName(cos[i].name);
              if (n === st || n.indexOf(st) === 0) { parent = cos[i]; break; }
            }
          }
          if (parent) {
            it.kind = 'attach';
            it.coId = parent.id || '';
            it.coName = parent.name || '';
          }
        }
        if (!it.sid) it.noStaff = true;          // 직원명부에 그 이름이 없다
        items.push(it);
      });
    });

    /* 같은 업체를 두 직원이 가리키면 주담당을 못 정한다 — 사람이 봐야 한다 */
    var whoByCo = {};
    items.forEach(function (it) {
      if (it.kind !== 'ok' && it.kind !== 'type') return;
      (whoByCo[it.coId] = whoByCo[it.coId] || {})[it.who] = 1;
    });
    items.forEach(function (it) {
      if (whoByCo[it.coId] && Object.keys(whoByCo[it.coId]).length > 1) it.clash = true;
    });

    return items;
  }

  /* ── 세무 이메일을 넣어도 되는가 ──
     세무사무소 주소 하나가 여러 사업장에 걸린다(정담회계법인 → 7곳).
     메일 배달은 「보낸 주소 → 사업장 → 그 업체 주담당」으로 가는데,
     한 주소가 **담당이 다른** 여러 곳에 걸리면 누구 칸인지 정할 수 없다.
     ⚠ 그때는 넣지 않는다 — 넣으면 남의 자료가 조용히 엉뚱한 사람 칸에 들어간다.
     공용 칸에 남는 것이 낫다. */
  function taxMailSafe(items) {
    var byMail = {};
    (items || []).forEach(function (it) {
      var m = String(it.tMail || '').trim().toLowerCase();
      if (!m) return;
      (byMail[m] = byMail[m] || {})[it.who] = 1;
    });
    var safe = {};
    Object.keys(byMail).forEach(function (m) { safe[m] = Object.keys(byMail[m]).length === 1; });
    return safe;
  }

  /* ── 담당자 한 줄 넣기 ──
     같은 사람이 이미 있으면 빈칸만 채운다 — 사람이 손으로 적어 둔 것을 덮지 않는다. */
  function mergeContact(list, add, primary) {
    var arr = (Array.isArray(list) ? list : []).map(function (c) { return Object.assign({}, c); });
    var mail = function (c) { return String((c && c.email) || '').trim().toLowerCase(); };
    var pname = function (c) { return String((c && c.name) || '').replace(/\s/g, ''); };
    /* ⚠ 메일**이나** 이름이 같으면 같은 사람이다.
       메일만 보면, 이미 있던 줄에 메일이 없을 때 같은 사람이 두 줄로 들어간다
       (대건정밀 김세훈 대표가 그랬다). */
    var same = function (a, b) {
      if (mail(a) && mail(b)) return mail(a) === mail(b);
      return !!pname(a) && pname(a) === pname(b);
    };
    if (!mail(add) && !pname(add)) return arr;
    var at = -1;
    for (var i = 0; i < arr.length; i++) { if (same(arr[i], add)) { at = i; break; } }
    var k = mail(add) || pname(add);
    var key = function (c) { return mail(add) ? mail(c) : pname(c); };
    if (at < 0) {
      arr.push({
        name: add.name || '', position: add.position || '',
        phone: add.phone || '', email: add.email || '',
        isPrimary: primary ? true : arr.length === 0
      });
    } else {
      ['name', 'position', 'phone', 'email'].forEach(function (f) {
        if (!arr[at][f] && add[f]) arr[at][f] = add[f];
      });
    }
    if (primary) {
      var hit = at < 0 ? arr.length - 1 : at;
      arr.forEach(function (c, i2) { c.isPrimary = i2 === hit; });
    } else if (!arr.some(function (c) { return c.isPrimary; }) && arr.length) {
      arr[0].isPrimary = true;
    }
    return arr;
  }

  /* ── 업체 한 곳에 무엇을 쓸지 ──
     ⚠ 바뀌는 값만 담는다. 안 바뀌는 것까지 담으면 「몇 곳이 달라졌나」를
     셀 수 없고, 서버에도 헛것을 쓴다. */
  function patchFor(co, its, opt) {
    var o = opt || {};
    var patch = {}, why = [];
    var base = co || {};

    /* 주담당 — 사번이다(이름이 아니다) */
    var mine = its.filter(function (it) { return it.kind === 'ok' || it.kind === 'type'; });
    var owner = mine.filter(function (it) { return it.sid && !it.clash; })[0];
    var ownerFrom = '';
    if (owner && String(base.managerMain || '') !== owner.sid) {
      patch.managerMain = owner.sid;
      ownerFrom = String(base.managerMain || '');
      why.push(ownerFrom ? '주담당 바꿈' : '주담당 넣음');
    }

    /* 업체 담당자 — contacts[] 와 딸림값 셋 */
    var contacts = Array.isArray(base.contacts) ? base.contacts
      : (base.primaryContactName ? [{
        name: base.primaryContactName, phone: base.primaryContactPhone,
        email: base.primaryContactEmail, isPrimary: true
      }] : []);
    var before = JSON.stringify(contacts);
    its.forEach(function (it) {
      if (!it.cName && !it.cMail) return;
      /* 딸린 사업장에서 온 사람은 어느 사업장인지 적어 둔다 —
         한 업체에 담당자가 여럿 붙으면 누가 어디 사람인지 알 수 없다. */
      var pos = it.kind === 'attach' ? it.site : '';
      /* 대표 담당자로 올릴지 —
         ⓐ 아직 아무도 없으면 올린다
         ⓑ 있어도 그 사람에게 **메일이 없고** 이 사람에겐 있으면 올린다.
            「급여 담당자」처럼 이름만 적힌 자리표가 대표 자리를 지키고 있으면,
            정작 메일 있는 사람이 아래로 밀려 화면에 안 보인다.
         ⚠ 딸린 사업장 사람은 올리지 않는다 — 본 업체의 담당자가 밀린다. */
      var cur = contacts.filter(function (c) { return c.isPrimary; })[0] || null;
      var up = it.kind !== 'attach'
        && (!cur || (!String(cur.email || '').trim() && !!String(it.cMail || '').trim()));
      contacts = mergeContact(contacts, {
        name: it.cName, phone: it.cPhone, email: it.cMail, position: pos
      }, up);
    });
    if (JSON.stringify(contacts) !== before) {
      patch.contacts = contacts;
      var pri = contacts.filter(function (c) { return c.isPrimary; })[0] || contacts[0] || {};
      patch.primaryContactName = pri.name || '';
      patch.primaryContactPhone = pri.phone || '';
      patch.primaryContactEmail = pri.email || '';
      why.push('담당자 넣음');
    }

    /* 세무사무실 — 빈칸만 채운다 */
    var tax = mine.filter(function (it) { return it.tName || it.tMail; })[0]
      || its.filter(function (it) { return it.tName || it.tMail; })[0];
    if (tax) {
      if (tax.tName && !base.taxOfficeName) { patch.taxOfficeName = tax.tName; why.push('세무사무실'); }
      if (tax.tPhone && !base.taxPhone) patch.taxPhone = tax.tPhone;
      var m = String(tax.tMail || '').trim().toLowerCase();
      if (tax.tMail && !base.taxEmail) {
        /* 세무 주소 하나가 여러 사업장에 걸려도 **넣는다**.
           처음에는 뺐다 — 배달이 「먼저 적힌 업체가 이긴다」였고, 담당이 다르면
           남의 자료가 조용히 엉뚱한 칸으로 갔다. 2026-08-24 배달 규칙을 고쳐
           ① 제목·파일 이름에서 사업장을 찾고 ② 못 찾으면 담당이 한 사람일 때만
           그 칸으로 ③ 아니면 공용 칸에 까닭을 적는다 — 그래서 이제 안전하다.
           넣어 두면 제목에 사업장이 적힌 메일은 곧바로 임자에게 간다. */
        patch.taxEmail = tax.tMail;
        if (o.taxSafe && o.taxSafe[m] === false) why.push('세무 주소가 여러 담당에 걸림 — 제목으로 가른다');
      }
    }

    /* 유형 — 급여를 하고 있으니 표기를 맞춘다(대표 결정) */
    if (o.fixType !== false && mine.some(function (it) { return it.kind === 'type'; })
      && String(base.typeCode || '') !== '급여') {
      patch.typeCode = '급여';
      why.push('유형을 급여로');
    }

    return {
      patch: patch, why: why, ownerFrom: ownerFrom,
      changed: Object.keys(patch).length > 0
    };
  }

  /* ── 업체별로 묶어 쓸 것을 만든다 ── */
  function writes(items, companies, opt) {
    var o = opt || {};
    var byId = {};
    (companies || []).forEach(function (co) { if (co && co.id) byId[co.id] = co; });
    var group = {};
    (items || []).forEach(function (it) {
      if (!it.coId || it.skip) return;
      (group[it.coId] = group[it.coId] || []).push(it);
    });
    var out = [];
    Object.keys(group).forEach(function (id) {
      var r = patchFor(byId[id], group[id], o);
      if (r.changed) out.push({
        id: id, name: (byId[id] || {}).name || '',
        patch: r.patch, why: r.why, ownerFrom: r.ownerFrom
      });
    });
    return out;
  }

  /* ── 명함으로 넣을 줄 만들기 (대표 2026-08-30) ──
     「급여담당자는 종이명함이 없는 경우가 많다. 그래서 기업정보함에 별도로 넣어야 한다」
     찍어서 들어올 길이 없는 분들이라 엑셀이 유일한 입구다.

     ★ 기업정보함의 «가져오기»가 쓰는 줄 모양 그대로 돌려준다(name·company·mobile…).
       그래야 이미 있는 중복막이·미리보기·넣기를 그대로 탄다 — 새 길을 안 낸다.
     ⚠ fillDown 은 쓰지 «않는다». 그것은 「같은 업체의 지점」끼리 연락처를 물려받는
       것이라, 명함으로 만들면 같은 사람이 지점 수만큼 생긴다.
     ⚠ 이름이 없는 줄은 «사람이 아니다» — 사업장만 적힌 줄이라 명함이 될 수 없다. */
  function cardRows(rows, staff) {
    var out = [];
    (rows || []).forEach(function (r) {
      if (!r || !r.cName) return;
      var nt = splitNameTitle(r.cName);
      if (!nt.name) return;
      var ph = String(r.cPhone || '').trim();
      var isMobile = /^01[016789]/.test(ph.replace(/\D/g, ''));
      out.push({
        name: nt.name, title: nt.title, company: String(r.site || '').trim(), dept: '',
        mobile: isMobile ? ph : '', tel: isMobile ? '' : ph,
        email: String(r.cMail || '').trim(),
        /* 어디서 왔는지·누가 맡는지를 적어 둔다 — 「이 명함은 왜 사진이 없지」에 답이 된다 */
        memo: '급여담당자 (종이명함 없음)'
          + (staff ? '\n푸른 담당: ' + staff : '')
          + (r.second ? '\n※ 같은 사업장의 둘째 담당자' : '')
      });
    });
    return out;
  }

  function counts(items) {
    var c = { all: 0, ok: 0, type: 0, attach: 0, none: 0, clash: 0, inherited: 0, noStaff: 0 };
    (items || []).forEach(function (it) {
      c.all++; c[it.kind] = (c[it.kind] || 0) + 1;
      if (it.clash) c.clash++;
      if (it.inherited) c.inherited++;
      if (it.noStaff) c.noStaff++;
    });
    return c;
  }

  root.PuCoXls = {
    normName: normName, stemName: stemName, staffFromFileName: staffFromFileName,
    parseGrid: parseGrid, fillDown: fillDown, plan: plan, splitNameTitle: splitNameTitle,
    cardRows: cardRows,
    taxMailSafe: taxMailSafe, mergeContact: mergeContact, patchFor: patchFor,
    writes: writes, counts: counts
  };
})(typeof window !== 'undefined' ? window : globalThis);
