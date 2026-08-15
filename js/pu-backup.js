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
    'pu-cards.html': { id: 'cards', paths: ['pucards'] },
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
    var config = { id: base.id, paths: base.paths.slice() };
    if (base.id === 'kcareer') config.paths = ['kcareer/' + user.uid];
    /* 규정관리의 실제 작업물(작성 중인 규정·작업 보관)은 사람마다 따로 있고
       규칙이 남의 칸 읽기를 막는다 — 그래서 백업하는 사람 본인 칸만 담는다
       (kcareer 와 같은 방식). 남의 작업까지 담으려면 콘솔 규칙을 열어야 한다. */
    if (base.id === 'rules') config.paths = config.paths.concat(['rules_mgmt/wip/' + user.uid, 'rules_mgmt/worksession/' + user.uid]);
    return config;
  }

  function readPaths(db, paths) {
    var result = [];
    return paths.reduce(function (chain, dbPath) {
      return chain.then(function () {
        return db.ref(dbPath).once('value').then(function (snapshot) {
          var entry = { path: dbPath, exists: snapshot.exists() };
          if (entry.exists) entry.value = snapshot.val();
          result.push(entry);
        });
      });
    }, Promise.resolve()).then(function () { return result; });
  }

  function snapshotKey(label) {
    return label === 'daily' ? dayKey() : dayKey() + '-' + Date.now().toString(36);
  }

  function createSnapshot(app, config, label) {
    var db = app.database();
    var user = app.auth().currentUser;
    if (!user || !config || !config.paths.length) return Promise.resolve(false);
    return readPaths(db, config.paths).then(function (data) {
      var key = snapshotKey(label || 'manual');
      var record = {
        system: config.id,
        createdAt: Date.now(),
        createdBy: user.uid,
        label: label || 'manual',
        paths: data
      };
      var updates = {};
      updates['systemBackups/' + safeKey(config.id) + '/' + key] = record;
      updates['systemBackupsIndex/' + safeKey(config.id) + '/' + key] = { createdAt: record.createdAt, createdBy: user.uid, label: record.label };
      return db.ref().update(updates).then(function () { return prune(app, config); }).then(function () { return record; });
    });
  }

  function prune(app, config) {
    var base = 'systemBackupsIndex/' + safeKey(config.id);
    return app.database().ref(base).once('value').then(function (snapshot) {
      var value = snapshot.val() || {};
      var keys = Object.keys(value).sort(function (a, b) { return Number(value[a].createdAt || 0) - Number(value[b].createdAt || 0); });
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
      return Object.keys(value).map(function (key) { return Object.assign({ key: key }, value[key] || {}); })
        .sort(function (a, b) { return Number(b.createdAt || 0) - Number(a.createdAt || 0); });
    });
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
      var updates = {};
      var values = {};
      backup.paths.forEach(function (entry) { if (entry && entry.path) values[entry.path] = entry.exists === false ? null : entry.value; });
      config.paths.forEach(function (dbPath) { updates[dbPath] = Object.prototype.hasOwnProperty.call(values, dbPath) ? values[dbPath] : null; });
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
        return app.database().ref('systemBackupsIndex/' + safeKey(config.id) + '/' + dayKey()).once('value').then(function (daily) {
          if (!daily.exists()) return createSnapshot(app, config, 'daily');
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

  window.PUBackup = { install: install, snapshot: function () { return current ? createSnapshot(current.app, current.config, 'manual') : Promise.resolve(false); }, _config: getConfig, _dayKey: dayKey };
  install();
})(typeof window !== 'undefined' ? window : null);
