/* 로그아웃 화면 — 푸른 통합 안의 모든 프로그램이 «같은 화면»을 쓴다 (대표 지시 2026-08-28)
 *
 * ★ 무슨 일이 있었나
 *   로그인이 풀렸을 때 나오는 화면이 17개 중 «2개만» 제대로였다.
 *   나머지는 흰 바탕에 「로그인이 필요합니다」 한 줄이거나 아예 아무것도 없었다.
 *   프로그램마다 다른 화면이 나오니, 같은 회사 시스템으로 보이지 않았고
 *   어디를 눌러야 돌아가는지도 매번 달랐다.
 *
 * ★ 어떻게 맞췄나
 *   기업정보함이 쓰던 «카드 + 포털로 가는 단추» 를 그대로 떠서 공용으로 만들었다.
 *   프로그램 이름과 한 줄 설명만 넣으면 나머지는 똑같다.
 *
 *   ⚠ 통합 포털(enter.html)에는 넣지 않는다 — 거기가 «로그인하는 곳» 이다.
 *   ⚠ 고객·근로자가 여는 화면(전자위임장·이음센터)에도 넣지 않는다 —
 *     그분들에게는 우리 포털 계정이 없다.
 *
 * 쓰는 법:
 *   PuGate.show({ name:'기금관리', desc:'푸른노무법인 · 근로복지기금' });
 *   PuGate.hide();      // 로그인이 확인되면
 */
(function (w, d) {
  'use strict';
  if (w.PuGate) return;

  var ID = 'pu-gate';
  var PORTAL = 'enter.html';

  /* 포털 주소는 화면마다 깊이가 다를 수 있다 — 이미 정해 둔 값이 있으면 그것을 쓴다 */
  function portalUrl() {
    return (w.PORTAL_URL && String(w.PORTAL_URL)) || PORTAL;
  }

  function css() {
    if (d.getElementById(ID + '-css')) return;
    var st = d.createElement('style');
    st.id = ID + '-css';
    /* 기업정보함(pu-cards.html)의 로그아웃 카드를 그대로 옮겼다 —
       그쪽이 먼저 쓰던 모양이고, 대표 승인이 난 화면이다. */
    st.textContent =
      '#' + ID + '{position:fixed;inset:0;z-index:2147483600;background:#f4f6fb;' +
        'display:flex;align-items:center;justify-content:center;padding:20px;' +
        'font-family:"Noto Sans KR","Malgun Gothic",system-ui,-apple-system,sans-serif}' +
      /* ⚠ box-sizing 을 스스로 못 박는다 — 공용 파일이라 «부르는 화면»의 CSS 초기화에
         기댈 수 없다. 안 박으면 초기화가 없는 화면에서 카드가 360 이 아니라 408 이 된다
         (padding 24×2 가 더 붙는다). 실제로 재 보고 잡았다. */
      '#' + ID + ',#' + ID + ' *{box-sizing:border-box}' +
      '#' + ID + ' .pg-card{width:100%;max-width:360px;background:#fff;border:1px solid #e8ecf3;' +
        'border-radius:16px;padding:28px 24px;box-shadow:0 10px 40px rgba(20,30,50,.08)}' +
      '#' + ID + ' .pg-brand{display:flex;align-items:center;gap:12px;margin-bottom:22px}' +
      '#' + ID + ' .pg-mark{width:44px;height:44px;border-radius:12px;background:#1e2a47;color:#fff;' +
        'display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:800;flex-shrink:0}' +
      '#' + ID + ' .pg-name{font-size:18px;font-weight:800;color:#1b2536;line-height:1.25}' +
      '#' + ID + ' .pg-sub{font-size:12px;color:#8b98b3;margin-top:2px}' +
      '#' + ID + ' .pg-msg{font-size:13.5px;color:#5a6885;margin:4px 2px 20px;line-height:1.65}' +
      '#' + ID + ' .pg-btn{display:block;width:100%;padding:13px;background:#1e2a47;color:#fff;' +
        'border:none;border-radius:12px;font-size:15px;font-weight:700;cursor:pointer;' +
        'text-align:center;text-decoration:none;line-height:1.2;box-sizing:border-box}' +
      '#' + ID + ' .pg-btn:hover{background:#2c3c66}';
    (d.head || d.documentElement).appendChild(st);
  }

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  var PuGate = {
    /* opts.name — 이 프로그램 이름 (없으면 <title> 에서 가져온다)
       opts.desc — 이름 아래 한 줄 (없으면 회사 이름만)          */
    show: function (opts) {
      opts = opts || {};
      css();
      var name = opts.name || (d.title || '푸른노무법인').replace(/\s*—.*$/, '').trim();
      var desc = opts.desc || '푸른노무법인';
      var box = d.getElementById(ID);
      if (!box) {
        box = d.createElement('div');
        box.id = ID;
        (d.body || d.documentElement).appendChild(box);
      }
      box.innerHTML =
        '<div class="pg-card">' +
          '<div class="pg-brand"><span class="pg-mark">푸</span>' +
            '<div><div class="pg-name">' + esc(name) + '</div>' +
            '<div class="pg-sub">' + esc(desc) + '</div></div></div>' +
          '<p class="pg-msg">푸른노무법인 앱은 통합 포털에서 로그인합니다.<br>' +
            '로그인하면 ' + esc(name) + '(으)로 자동 연결됩니다.</p>' +
          '<a class="pg-btn" href="' + esc(portalUrl()) + '">포털에서 로그인 →</a>' +
        '</div>';
      box.style.display = 'flex';
      /* 로그아웃 화면이 떴으면 처음 뜨는 splash 는 치운다 — 겹치면 둘 다 안 보인다 */
      try { var sp = d.getElementById('pu-boot-splash'); if (sp) sp.remove(); } catch (e) {}
      return box;
    },
    hide: function () {
      var box = d.getElementById(ID);
      if (box) box.style.display = 'none';
    },
    isOpen: function () {
      var box = d.getElementById(ID);
      return !!(box && box.style.display !== 'none');
    }
  };

  w.PuGate = PuGate;
})(window, document);
