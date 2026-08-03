/* Pureunall representative-approved development automation client. */
(function (root, factory) {
  var api = factory(root || {});
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.PUDevAutomation = api;
})(typeof window !== 'undefined' ? window : null, function (window) {
  'use strict';

  var DEFAULT_ENDPOINT = 'https://us-central1-pureun-erp.cloudfunctions.net/developmentAutomation';
  var STATUS_TEXT = {
    queued: '개발 대기', coding: 'AI 개발 중', pr_ready: '검사·검토 대기',
    deploy_approved: '배포 승인됨', deploying: '운영 배포 중', deployed: '운영 배포 완료',
    failed: '자동개발 실패', closed: '개발 종료', rollback_requested: '복귀 진행 중',
    rolled_back: '직전 버전 복귀 완료'
  };

  function endpoint() {
    var configured = window.PU_CFG && window.PU_CFG.developmentAutomationUrl;
    return /^https:\/\//i.test(String(configured || '')) ? configured : DEFAULT_ENDPOINT;
  }

  function selectedIndexes(container) {
    if (!container || !container.querySelectorAll) return [];
    return Array.prototype.map.call(container.querySelectorAll('input[data-dev-image]:checked'), function (input) {
      return Number(input.getAttribute('data-dev-image'));
    }).filter(function (index) { return Number.isInteger(index) && index >= 0; }).slice(0, 3);
  }

  function statusText(status) { return STATUS_TEXT[status] || '준비'; }

  function currentUser() {
    try { return window.firebase && window.firebase.auth && window.firebase.auth().currentUser; } catch (_) { return null; }
  }

  function post(action, payload) {
    var user = currentUser();
    if (!user) return Promise.reject(new Error('다시 로그인해 주세요.'));
    return user.getIdToken(true).then(function (token) {
      return window.fetch(endpoint(), {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({ action: action }, payload || {}))
      });
    }).then(function (response) {
      return response.json().catch(function () { return { ok: false, error: '서버 응답을 확인할 수 없습니다.' }; })
        .then(function (body) {
          if (!response.ok || !body.ok) throw new Error(body.error || '자동개발 요청에 실패했습니다.');
          return body.data || {};
        });
    });
  }

  function execute(payload) { return post('execute', payload); }
  function refreshStatus(suggestionId) { return post('status', { suggestionId: suggestionId }); }
  function approveDeploy(suggestionId, prNumber) { return post('approveDeploy', { suggestionId: suggestionId, prNumber: prNumber }); }
  function prepareRollback(suggestionId) { return post('prepareRollback', { suggestionId: suggestionId }); }

  function reauthenticate(password) {
    var user = currentUser();
    if (!user || !user.email) return Promise.reject(new Error('다시 로그인해 주세요.'));
    if (!password) return Promise.reject(new Error('현재 비밀번호를 입력해 주세요.'));
    var credential = window.firebase.auth.EmailAuthProvider.credential(user.email, password);
    return user.reauthenticateWithCredential(credential);
  }

  function rollback(suggestionId, code, password) {
    return reauthenticate(password).then(function () {
      return post('rollback', { suggestionId: suggestionId, code: String(code || '').trim() });
    });
  }

  return {
    DEFAULT_ENDPOINT: DEFAULT_ENDPOINT,
    STATUS_TEXT: STATUS_TEXT,
    endpoint: endpoint,
    selectedIndexes: selectedIndexes,
    statusText: statusText,
    execute: execute,
    refreshStatus: refreshStatus,
    approveDeploy: approveDeploy,
    prepareRollback: prepareRollback,
    rollback: rollback,
    _post: post
  };
});
