/* Pureunall shared daily snapshots and point-in-time restore for Firebase systems. */
(function (window) {
  'use strict';
  if (!window || !window.document || window.PUBackup) return;

  var configs = {
    'enter.html': { id: 'portal', paths: ['data/portal_prefs_uid', 'data/suggestions', 'data/sg_meta'] },
    'chwieop.html': { id: 'chwieop', paths: ['chwieop'] },
    'docs-esign.html': { id: 'esign', paths: ['esign'] },
    'fund.html': { id: 'fund', paths: ['fund_erp'] },
    'gov-consulting.html': { id: 'gov-consulting', paths: ['scal_cos', 'scal_scheds', 'scal_roundlog', 'scal_staff'] },
    'kcareer.html': { id: 'kcareer', paths: [] },
    'payroll-os.html': { id: 'payroll', paths: ['payroll_os'] },
    /* ⚠ 'pucards' 통째 백업 금지 (2026-08-16 종일 오류 폭주의 근원).
       그 안에는 명함 사진 원본(photos)·썸네일(thumbs)·첨부 원본(materialFiles)·
       휴지통(trash)이 들어 있어 수백 MB 다. 실시간DB 는 한 번의 쓰기를 16MB 까지만
       받아 주므로 이 백업 쓰기는 «영원히 성공할 수 없고», 실패하니 「오늘 했음」
       표시가 안 남아 관리자 탭을 열 때마다 다시 통째로 읽고(과금) 다시 통째로
       보냈다(서버가 조각조각 거부 — 콘솔에 오류 수만 건). 사람이 손으로 넣어
       «되살릴 수 없는» 자료만 담는다.
       ─ 안 담는 것과 이유 ─
         photos·thumbs   : 사진 본문 — 크다. 지워지면 아프지만 백업이 막히는 것보다 낫다
         materialFiles   : 첨부 파일 본문 — 크다. 이름·설명(materials)은 담는다
         trash           : 휴지통 — 이미 지운 것의 사본
         sentBox·sendLog·scheduled : 발송 기록(로그)
         idx·bykey       : items 에서 언제든 다시 만드는 색인 */
    'pu-cards.html': { id: 'cards',
      paths: ['pucards/items', 'pucards/groups', 'pucards/views', 'pucards/classifyRules',
              'pucards/config', 'pucards/coInfo', 'pucards/coFolders', 'pucards/coTagHidden',
              'pucards/materials', 'pucards/matSets'],
      /* 옛 명함에는 사진이 본문에 박혀 있던 시절 것이 남아 있다 — 그 칸만 뺀다 */
      strip: { 'pucards/items': ['thumb', 'thumb2', 'photo', 'photo2'] } },
    /* ⚠ rules_mgmt 는 **통째로 읽을 수 없다**. 콘솔 규칙이 .read 를 아랫칸마다
       따로 열어 두었기 때문이다(done·orig·archive·decisions·matchfix 는 직원 전체,
       wip·worksession 은 본인만). 통째로 읽으려 하면 permission_denied 가 나고
       그때마다 관리자 화면에 장애 알림이 떴다(2026-08 한 달에 68건).
       그래서 읽을 수 있는 칸만 적는다 — 본인 칸은 getConfig 에서 붙인다. */
    'rules.html': { id: 'rules', paths: ['rules_mgmt/done', 'rules_mgmt/archive', 'rules_mgmt/orig', 'rules_mgmt/decisions', 'rules_mgmt/matchfix'] },
    'work.html': { id: 'work', paths: ['work_erp'] }
  };
  var KEEP_DAYS = 30;
  var boundApps = [];
  var current = null;

  function pageName() { return window.location.pathname.split('/').pop() || 'enter.html'; }
  function dayKey(date) {
    var d = date || new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function safeKey(value) { return String(value || '').replace(/[.#$\[\]/]/g, '_'); }

  function getConfig(user) {
    var base = configs[pageName()];
    if (!base) return null;
    var config = { id: base.id, paths: base.paths.slice(), strip: base.strip || {} };
    if (base.id === 'kcareer') config.paths = ['kcareer/' + user.uid];
    /* 규정관리의 실제 작업물(작성 중인 규정·작업 보관)은 사람마다 따로 있고
       규칙이 남의 칸 읽기를 막는다 — 그래서 백업하는 사람 본인 칸만 담는다
       (kcareer 와 같은 방식). 남의 작업까지 담으려면 콘솔 규칙을 열어야 한다. */
    if (base.id === 'rules') config.paths = config.paths.concat(['rules_mgmt/wip/' + user.uid, 'rules_mgmt/worksession/' + user.uid]);
    return config;
  }

  /* 기록마다 무거운 칸(사진 등)을 뺀 사본 — 원본은 건드리지 않는다 */
  function stripFields(value, fields) {
    if (!value || typeof value !== 'object' || !fields || !fields.length) return value;
    var out = {};
    Object.keys(value).forEach(function (k) {
      var rec = value[k];
      if (rec && typeof rec === 'object') {
        var copy = Object.assign({}, rec);
        fields.forEach(function (f) { delete copy[f]; });
        out[k] = copy;
      } else out[k] = rec;
    });
    return out;
  }

  function readPaths(db, paths, strip) {
    var result = [];
    return paths.reduce(function (chain, dbPath) {
      return chain.then(function () {
        return db.ref(dbPath).once('value').then(function (snapshot) {
          var entry = { path: dbPath, exists: snapshot.exists() };
          if (entry.exists) entry.value = stripFields(snapshot.val(), strip && strip[dbPath]);
          result.push(entry);
        });
      });
    }, Promise.resolve()).then(function () { return result; });
  }

  /* ── 백업 한 통의 크기 지킴이 ──
     실시간DB 는 한 번의 쓰기를 16MB 까지만 받아 준다. 넘치면 서버가 조각조각 거부해
     오류가 수만 건 쌓이고, 「오늘 했음」 표시가 안 남아 탭마다 다시 시도했다(2026-08-16).
     너무 큰 칸은 값을 담지 않고 «건너뛰었다»고 적는다 — 통이 반드시 들어가게.
     ⚠ 길이(JSON 글자 수)로 잰다. 한글은 실제 바이트가 더 크지만, 한도를 넉넉히
       낮게 잡아(8/12MB < 16MB) 그 오차를 덮는다. */
  var MAX_ENTRY_CHARS = 8 * 1024 * 1024;
  var MAX_TOTAL_CHARS = 12 * 1024 * 1024;
  function entrySize(entry) {
    try { return JSON.stringify(entry.value === undefined ? null : entry.value).length; }
    catch (_) { return Infinity; }
  }
  function trimForWrite(entries) {
    var sized = entries.map(function (entry) { return { entry: entry, size: entrySize(entry) }; });
    var skipped = [];
    /* ① 한 칸이 혼자 너무 크면 그 칸만 뺀다 */
    sized.forEach(function (item) {
      if (item.size > MAX_ENTRY_CHARS) {
        skipped.push({ path: item.entry.path, chars: item.size });
        item.entry = { path: item.entry.path, exists: item.entry.exists, skipped: 'too-big', chars: item.size };
        item.size = 0;
      }
    });
    /* ② 다 합쳐도 크면 큰 칸부터 뺀다 — 작은 칸이라도 살리는 쪽이 낫다 */
    var total = sized.reduce(function (s, x) { return s + x.size; }, 0);
    while (total > MAX_TOTAL_CHARS) {
      var biggest = null;
      sized.forEach(function (item) { if (item.size > 0 && (!biggest || item.size > biggest.size)) biggest = item; });
      if (!biggest) break;
      skipped.push({ path: biggest.entry.path, chars: biggest.size });
      total -= biggest.size;
      biggest.entry = { path: biggest.entry.path, exists: biggest.entry.exists, skipped: 'too-big', chars: biggest.size };
      biggest.size = 0;
    }
    return { paths: sized.map(function (x) { return x.entry; }), skipped: skipped };
  }

  function snapshotKey(label) {
    return label === 'daily' ? dayKey() : dayKey() + '-' + Date.now().toString(36);
  }

  /* ══ 백업에 담기는 주민번호를 잠근다 (대표 지시 2026-08-29) ══════════════
     「푸른 화면에서는 주민번호가 보여야 한다. 그렇게 해야 업무 작업이 가능하다.
       하지만 백업 시 주번 암호화해야 된다.」

     ★ 화면과 살아 있는 자료는 «그대로» 다 — 잠그는 것은 백업 사본뿐이다.
     ⚠ 2026-09-07 까지 이 잠금은 pu-erp.html 자기 백업에만 있었다. 이 공용 부품은
       기금(임원 주민등록번호)·경력관리(주민번호)까지 서른 시점씩 뜨면서 «안 잠갔다».
       열린 문은 아니었다(systemBackups 는 관리자·위임관리인만 읽는다) — 그러나 잠금을
       만든 까닭이 「백업은 오래 남고, 옮겨 다니고, 아무도 안 본다」였고, 그 겹이 없었다.
     ⚠★ «크기를 재기 전에» 잠근다. 잠근 값은 열세 자리에서 백 자리 가까이로 늘어난다 —
        재고 나서 잠그면 16MB 한도를 넘겨 서버가 통째로 거부한다(2026-08-16 그 사고).
     ⚠ 열쇠를 못 얻으면 **백업을 쓰지 않는다.** 잠기지 않은 채로 쓰면 지시를 어기는 것이고,
       조용히 넘기면 아무도 모른다. 실패는 위쪽 식힘·알림 길로 그대로 올라간다.
     ⚠ 잠글 것이 «없으면» 열쇠를 아예 안 가져온다(업무·전자서명 등 주민번호가 없는 앱).
       그 앱들의 백업이 열쇠 칸 권한 때문에 멎으면 안 된다. */
  var SEAL_KEY_PATH = 'backup_key/v1';
  function sealEntries(db, entries) {
    var S = window.PuRrnSeal;
    if (!S) return Promise.reject(new Error(
      '잠금 모듈(js/pu-rrn-seal.js)을 못 불러왔습니다 — 주민번호를 잠그지 않은 백업은 쓰지 않습니다'));
    var need = entries.reduce(function (n, e) {
      return n + (e && e.exists && e.value !== undefined ? S.countToSeal(e.value) : 0);
    }, 0);
    if (!need) return Promise.resolve(entries);
    return S.keyFor(db.ref(SEAL_KEY_PATH)).then(function (key) {
      return Promise.all(entries.map(function (e) {
        if (!e || !e.exists || e.value === undefined) return e;
        return S.seal(e.value, key).then(function (v) {
          return { path: e.path, exists: e.exists, value: v };
        });
      }));
    });
  }

  /* ── 되돌릴 때는 «반드시» 푼다 ──
     안 풀면 화면의 주민번호 자리에 `enc:v1:…` 이 그대로 들어간다. 자료가 깨진 것처럼
     보이고, 그 화면을 저장하는 순간 진짜 값이 사라진다.
     ★ 이 잠금이 생기기 «전» 백업은 잠긴 자리가 없어 그대로 지나간다 — 옛 백업을 손볼 필요가 없다. */
  function unsealBackup(db, backup) {
    var S = window.PuRrnSeal;
    var paths = backup && backup.paths || [];
    if (!S) {
      /* 부품이 없는데 잠긴 값이 들어 있으면 복원을 «멈춘다» — 못 푸는 것을 그대로 쓰는 것이
         가장 나쁘다. 글자로 찾는 것은 부품이 없어 PREFIX 를 물어볼 수 없기 때문이다. */
      var 잠긴듯 = JSON.stringify(paths).indexOf('enc:v1:') >= 0;
      if (잠긴듯) return Promise.reject(new Error(
        '잠금 모듈(js/pu-rrn-seal.js)을 못 불러왔습니다 — 잠긴 백업은 풀 수 없어 복원하지 않습니다'));
      return Promise.resolve(backup);
    }
    if (!S.countSealed(paths)) return Promise.resolve(backup);
    return S.keyFor(db.ref(SEAL_KEY_PATH)).then(function (key) {
      return S.unseal(paths, key);
    }).then(function (풀린것) {
      return Object.assign({}, backup, { paths: 풀린것 });
    });
  }

  function createSnapshot(app, config, label) {
    var db = app.database();
    var user = app.auth().currentUser;
    if (!user || !config || !config.paths.length) return Promise.resolve(false);
    return readPaths(db, config.paths, config.strip).then(function (data) {
      return sealEntries(db, data);     // ★ 크기를 «재기 전에» 잠근다
    }).then(function (data) {
      var trimmed = trimForWrite(data);
      var key = snapshotKey(label || 'manual');
      var record = {
        system: config.id,
        createdAt: Date.now(),
        createdBy: user.uid,
        label: label || 'manual',
        paths: trimmed.paths
      };
      /* 못 담은 칸이 있으면 기록에도, 관리자 알림에도 남긴다 — 조용히 빠지면
         복원할 때가 되어서야 없다는 것을 안다. */
      if (trimmed.skipped.length) {
        record.skipped = trimmed.skipped;
        try { if (window.PUHealth) window.PUHealth.report('backup', new Error('백업에서 큰 칸을 건너뜀: ' + trimmed.skipped.map(function (x) { return x.path; }).join(', '))); } catch (_) {}
      }
      var updates = {};
      updates['systemBackups/' + safeKey(config.id) + '/' + key] = record;
      updates['systemBackupsIndex/' + safeKey(config.id) + '/' + key] = { createdAt: record.createdAt, createdBy: user.uid, label: record.label };
      return db.ref().update(updates).then(function () { clearFail(config.id); return prune(app, config); }).then(function () { return record; });
    });
  }

  /* 여러 관리자 탭·기기가 동시에 첫 화면을 열어도 큰 원본을 읽는 백업은 한 대만
     수행한다. RTDB transaction으로 먼저 짧은 임대권을 얻고, 얻은 탭만 본문을 읽는다. */
  var DAILY_CLAIM_MS = 20 * 60 * 1000;
  function runDailySnapshot(app, config) {
    var db = app.database();
    var user = app.auth().currentUser;
    if (!user) return Promise.resolve(false);
    var now = Date.now();
    var token = user.uid + ':' + now.toString(36) + ':' + Math.random().toString(36).slice(2, 8);
    /* 이미 쓰기 권한이 배포돼 있는 백업 색인 아래에 둔다. 새 규칙을 요구하지 않는다. */
    var claim = db.ref('systemBackupsIndex/' + safeKey(config.id) + '/_dailyClaim/' + dayKey());
    return claim.transaction(function (current) {
      if (current && current.status === 'done') return;
      if (current && current.claimedAt && now - Number(current.claimedAt) < DAILY_CLAIM_MS) return;
      return { token: token, claimedBy: user.uid, claimedAt: now, status: 'running' };
    }, undefined, false).then(function (result) {
      if (!result.committed || !result.snapshot || result.snapshot.child('token').val() !== token) return false;
      return createSnapshot(app, config, 'daily').then(function (record) {
        return claim.set({ token: token, claimedBy: user.uid, claimedAt: now, completedAt: Date.now(), status: 'done' })
          .then(function () { return record; });
      }, function (error) {
        /* 실패 임대는 다음 시도까지 붙들지 않는다. 내 임대일 때만 지운다. */
        return claim.transaction(function (current) {
          return current && current.token === token ? null : current;
        }, undefined, false).catch(function () {}).then(function () { throw error; });
      });
    });
  }

  /* ── 실패 뒤 식힘 시간 ──
     백업이 실패하면 「오늘 했음」 표시가 안 남아 관리자 탭을 «열 때마다» 처음부터
     다시 했다 — 전체 읽기(과금)와 실패 쓰기가 종일 되풀이됐다(2026-08-16).
     실패하면 6시간 쉬었다가 다시 해 본다. 지우는 것이 아니라 쉬는 것이다. */
  var FAIL_COOLDOWN_MS = 6 * 60 * 60 * 1000;
  function failStampKey(id) { return 'pu_backup_fail_v1:' + safeKey(id); }
  function inCooldown(id) {
    try {
      var t = Number(window.localStorage.getItem(failStampKey(id)) || 0);
      return !!t && (Date.now() - t) < FAIL_COOLDOWN_MS;
    } catch (_) { return false; }
  }
  function noteFail(id) { try { window.localStorage.setItem(failStampKey(id), String(Date.now())); } catch (_) {} }
  function clearFail(id) { try { window.localStorage.removeItem(failStampKey(id)); } catch (_) {} }

  function prune(app, config) {
    var base = 'systemBackupsIndex/' + safeKey(config.id);
    return app.database().ref(base).once('value').then(function (snapshot) {
      var value = snapshot.val() || {};
      var keys = Object.keys(value).filter(function (key) { return key !== '_dailyClaim'; })
        .sort(function (a, b) { return Number(value[a].createdAt || 0) - Number(value[b].createdAt || 0); });
      if (keys.length <= KEEP_DAYS) return;
      var updates = {};
      keys.slice(0, keys.length - KEEP_DAYS).forEach(function (key) {
        updates['systemBackups/' + safeKey(config.id) + '/' + key] = null;
        updates['systemBackupsIndex/' + safeKey(config.id) + '/' + key] = null;
      });
      return app.database().ref().update(updates);
    });
  }

  function ensureButton(app, config) {
    var button = window.document.getElementById('pu-backup-admin-button');
    if (!button) {
      button = window.document.createElement('button');
      button.id = 'pu-backup-admin-button';
      button.type = 'button';
      button.textContent = '백업·복구';
      button.style.cssText = 'position:fixed;left:max(12px,env(safe-area-inset-left));bottom:max(58px,calc(env(safe-area-inset-bottom) + 58px));z-index:2147483645;border:0;border-radius:999px;padding:9px 13px;background:#245a9b;color:#fff;font:800 12px/1.2 system-ui,sans-serif;box-shadow:0 6px 22px #0003;cursor:pointer;';
      window.document.body.appendChild(button);
    }
    button.onclick = function () { showPanel(app, config); };
    return button;
  }

  function loadIndex(app, config) {
    return app.database().ref('systemBackupsIndex/' + safeKey(config.id)).once('value').then(function (snapshot) {
      var value = snapshot.val() || {};
      return Object.keys(value).filter(function (key) { return key !== '_dailyClaim'; })
        .map(function (key) { return Object.assign({ key: key }, value[key] || {}); })
        .sort(function (a, b) { return Number(b.createdAt || 0) - Number(a.createdAt || 0); });
    });
  }

  /* ── 무엇을 되돌릴 것인가 — 백업에 «담긴 것»만 쓴다 ──
     예전에는 지금 설정(config.paths)을 기준으로 백업에 없는 칸을 null 로 지웠다.
     2026-08-16 백업 대상을 통째('pucards')에서 낱칸으로 바꾸면서, 그 방식이면
     옛 통째 백업을 복원할 때 낱칸들이 백업에 「없다」고 보여 «전부 지워질» 뻔했다.
     백업에 담긴 칸만 쓰면 옛 백업(통째)과 새 백업(낱칸)이 모두 안전하다.
     크기 때문에 건너뛴 칸(skipped)은 그대로 둔다 — 값이 없는데 지우면 안 된다. */
  function restorePlan(backup) {
    var updates = {};
    (backup.paths || []).forEach(function (entry) {
      if (!entry || !entry.path || entry.skipped) return;
      updates[entry.path] = entry.exists === false ? null : (entry.value === undefined ? null : entry.value);
    });
    return updates;
  }

  function restore(app, config, item, button) {
    if (window.navigator.onLine === false) { window.alert('오프라인에서는 복원할 수 없습니다. 연결 후 다시 시도해 주세요.'); return; }
    var when = new Date(Number(item.createdAt || 0)).toLocaleString('ko-KR');
    if (!window.confirm(when + ' 백업으로 복원하시겠습니까?\n현재 상태는 복원 직전 백업으로 먼저 보관됩니다.')) return;
    button.disabled = true;
    createSnapshot(app, config, 'pre-restore').then(function () {
      return app.database().ref('systemBackups/' + safeKey(config.id) + '/' + item.key).once('value');
    }).then(function (snapshot) {
      var backup = snapshot.val();
      if (!backup || !Array.isArray(backup.paths)) throw new Error('백업 본문이 없습니다.');
      return unsealBackup(app.database(), backup);   // ★ 쓰기 전에 «반드시» 푼다
    }).then(function (backup) {
      var updates = restorePlan(backup);
      if (!Object.keys(updates).length) throw new Error('이 백업에는 복원할 내용이 없습니다.');
      return app.database().ref().update(updates).then(function () {
        return app.database().ref('systemRestoreLog/' + safeKey(config.id)).push({
          restoredAt: Date.now(), restoredBy: app.auth().currentUser.uid, backupKey: item.key
        });
      });
    }).then(function () {
      window.alert('복원이 완료되었습니다. 최신 데이터를 불러오기 위해 화면을 새로고침합니다.');
      window.location.reload();
    }).catch(function (error) {
      button.disabled = false;
      window.alert('복원 실패: ' + String(error && error.message || error));
    });
  }

  function showPanel(app, config) {
    var old = window.document.getElementById('pu-backup-panel'); if (old) old.remove();
    var panel = window.document.createElement('div');
    panel.id = 'pu-backup-panel';
    panel.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#0f172acc;padding:20px;display:grid;place-items:center;font-family:system-ui,sans-serif;';
    var box = window.document.createElement('div');
    box.style.cssText = 'width:min(620px,100%);max-height:min(720px,90vh);overflow:auto;background:#fff;border-radius:16px;padding:18px;color:#172033;box-shadow:0 20px 60px #0005;';
    box.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><b style="font-size:17px">자동 백업 · 시점 복구</b><button id="pu-bk-close" type="button">닫기</button></div><p style="font-size:12px;color:#526071">매일 첫 관리자 접속 때 백업하며 최근 30개 시점을 보관합니다.</p><button id="pu-bk-now" type="button" style="border:0;border-radius:8px;background:#245a9b;color:#fff;padding:8px 12px;font-weight:800;cursor:pointer">지금 백업</button><div id="pu-bk-list" style="margin-top:12px">불러오는 중…</div>';
    box.querySelector('#pu-bk-close').onclick = function () { panel.remove(); };
    box.querySelector('#pu-bk-now').onclick = function (event) {
      event.target.disabled = true;
      createSnapshot(app, config, 'manual').then(function () { showPanel(app, config); }).catch(function (error) { event.target.disabled = false; window.alert('백업 실패: ' + String(error && error.message || error)); });
    };
    panel.onclick = function (event) { if (event.target === panel) panel.remove(); };
    panel.appendChild(box); window.document.body.appendChild(panel);
    loadIndex(app, config).then(function (items) {
      var list = box.querySelector('#pu-bk-list'); list.textContent = '';
      if (!items.length) { list.textContent = '아직 백업이 없습니다.'; return; }
      items.forEach(function (item) {
        var row = window.document.createElement('div');
        row.style.cssText = 'display:flex;gap:8px;align-items:center;border-top:1px solid #e3e8ef;padding:10px 2px;font-size:12px;';
        var label = window.document.createElement('span'); label.style.flex = '1';
        label.textContent = new Date(Number(item.createdAt || 0)).toLocaleString('ko-KR') + ' · ' + (item.label || 'backup');
        var restoreButton = window.document.createElement('button'); restoreButton.type = 'button'; restoreButton.textContent = '이 시점 복원';
        restoreButton.onclick = function () { restore(app, config, item, restoreButton); };
        row.appendChild(label); row.appendChild(restoreButton); list.appendChild(row);
      });
    }).catch(function (error) { box.querySelector('#pu-bk-list').textContent = '백업 목록을 불러오지 못했습니다: ' + String(error && error.message || error); });
  }

  function bindApp(app) {
    if (!app || boundApps.indexOf(app) >= 0 || !app.auth || !app.database) return;
    boundApps.push(app);
    app.auth().onAuthStateChanged(function (user) {
      if (!user) return;
      var config = getConfig(user); if (!config) return;
      app.database().ref('uid_roles/' + user.uid).once('value').then(function (snapshot) {
        var role = snapshot.val() || {};
        if (!role.isAdmin && !role.isSubAdmin) return;
        current = { app: app, config: config };
        ensureButton(app, config);
        /* 여러 기기가 같은 날짜 색인을 따로 읽은 뒤 경쟁하지 않도록 바로 서버 잠금으로
           들어간다. 완료 여부까지 transaction 한 번이 판단하므로 유휴 읽기도 한 번 줄어든다. */
        if (inCooldown(config.id)) return;
        return runDailySnapshot(app, config).catch(function (error) {
          noteFail(config.id);
          throw error;
        });
      }).catch(function (error) { if (window.PUHealth) window.PUHealth.report('backup', error); });
    });
  }

  function install() {
    if (!window.firebase) return false;
    (window.firebase.apps || []).forEach(bindApp);
    var original = window.firebase.initializeApp;
    if (typeof original === 'function' && !original.__puBackupWrapped) {
      var wrapped = function () { var app = original.apply(window.firebase, arguments); bindApp(app); return app; };
      wrapped.__puBackupWrapped = true; window.firebase.initializeApp = wrapped;
    }
    return true;
  }

  window.PUBackup = { install: install, snapshot: function () { return current ? createSnapshot(current.app, current.config, 'manual') : Promise.resolve(false); }, _config: getConfig, _dayKey: dayKey,
    /* 검사용 — 순수 셈들 */
    _trim: trimForWrite, _strip: stripFields, _restorePlan: restorePlan,
    _limits: { entry: MAX_ENTRY_CHARS, total: MAX_TOTAL_CHARS, cooldown: FAIL_COOLDOWN_MS } };
  install();
})(typeof window !== 'undefined' ? window : null);
