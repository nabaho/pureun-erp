/* ══════════════════════════════════════════════════════════════
   푸른 통합시스템 — 프로그램 사이 이동 (공용 앱바)
   2026-08-07

   무엇: 어느 프로그램에서든 머리줄의 「⊞ 프로그램」 을 눌러 다른 프로그램으로 바로 간다.
        종전에는 포털(enter.html)로 돌아갔다가 타일을 눌러야 해서 두 번 거쳤다.

   왜 부품으로 빼나: 프로그램이 8개다. 각 앱에 따로 만들면 하나가 늘 때마다 8곳을 고쳐야 한다.
        여기 목록 한 곳만 고치면 전부 반영된다. (pu-photo-store.js 와 같은 뜻)

   로그인: 8개가 같은 파이어베이스 세션을 쓴다 — 옮겨도 다시 로그인하지 않는다.
        그래서 이 부품은 인증을 전혀 건드리지 않는다. 그냥 주소를 옮길 뿐이다.

   쓰는 법 (앱에 두 줄):
     <script src="js/pu-appbar.js"></script>
     PuAppBar.mount('#어디에넣을지', { current:'erp' });
   보던 화면으로 돌아오게 하려면 화면이 바뀔 때마다:
     PuAppBar.mark('biz/contract');       // 그 앱이 알아보는 아무 글자
   그리고 앱이 뜰 때:
     var back = PuAppBar.lastScreen();    // 없으면 ''
   ══════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  /* 프로그램 목록 — 포털(enter.html)의 타일과 같은 차례로 둔다.
     새 프로그램이 생기면 여기 한 줄만 더한다. */
  var APPS = [
    { key: 'erp',     name: '푸른이알피',   icon: '🏢', url: 'pu-erp.html',         desc: '인사·급여·재무' },
    { key: 'work',    name: '업무관리',     icon: '📋', url: 'work.html',           desc: '주간 업무기록' },
    { key: 'consult', name: '컨설팅 일정',  icon: '📅', url: 'gov-consulting.html', desc: '정부지원 관리' },
    { key: 'cards',   name: '명함첩',       icon: '📇', url: 'pu-cards.html',       desc: '명함·사업자등록증' },
    { key: 'photos',  name: '푸른사진첩',   icon: '🖼️', url: 'pu-photos.html',      desc: '현장·회의 사진' },
    { key: 'career',  name: '이력관리',     icon: '🗂', url: 'kcareer.html',        desc: '개인 이력서' },
    { key: 'rules',   name: '취업규칙 관리', icon: '📋', url: 'rules.html',          desc: '작성·검토·개정' },
    { key: 'fund',    name: '기금관리',     icon: '🏦', url: 'fund.html',           desc: '근로복지기금' }
  ];

  var FAV_KEY  = 'pu_appbar_favs';        // 대표님이 별표로 고른 것 (["cards","work"])
  var LAST_KEY = 'pu_appbar_last_';       // + appKey  →  그 앱에서 마지막에 보던 화면

  /* ── 작은 도구 ── */
  function lsGet(k, dflt) {
    try { var v = localStorage.getItem(k); return v === null ? dflt : JSON.parse(v); }
    catch (e) { return dflt; }
  }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function favs() { var a = lsGet(FAV_KEY, []); return Array.isArray(a) ? a : []; }
  function isFav(key) { return favs().indexOf(key) >= 0; }
  function toggleFav(key) {
    var a = favs(), i = a.indexOf(key);
    if (i >= 0) a.splice(i, 1); else a.push(key);
    lsSet(FAV_KEY, a);
    return a;
  }
  /* 별표를 단 것이 위로. 같은 무리 안에서는 정해 둔 차례 그대로 —
     사람마다 순서가 달라져도 무리 안 차례는 같아서 서로 안내하기 쉽다. */
  function ordered() {
    var f = favs();
    return APPS.slice().sort(function (a, b) {
      var fa = f.indexOf(a.key) >= 0 ? 0 : 1, fb = f.indexOf(b.key) >= 0 ? 0 : 1;
      return fa - fb;   // 같으면 원래 차례 (안정 정렬)
    });
  }

  /* ── 보던 화면 기억 ──
     앱이 스스로 알려 준 글자를 그대로 보관했다가, 그 앱으로 돌아올 때 되돌려 준다.
     이 부품은 그 글자가 무슨 뜻인지 모른다 — 해석은 앱이 한다. */
  var _me = '';                                  // 지금 앱 key
  function mark(screen) {
    if (!_me) return;
    if (screen === undefined || screen === null || screen === '') return;
    lsSet(LAST_KEY + _me, String(screen));
  }
  function lastScreen(appKey) { return lsGet(LAST_KEY + (appKey || _me), '') || ''; }

  /* 캐시 우회 — 다른 앱들이 이미 쓰는 방식(10분 버킷)과 같게 맞춘다.
     매번 다른 값을 붙이면 브라우저가 아무것도 못 재사용해 느려진다. */
  function bust() { return 'v=' + Math.floor(Date.now() / 600000); }

  /* 실제로 옮기는 곳. 한 군데로 모아 둔 이유 —
     저장 안 한 내용이 있는 앱은 여기를 가로채 「저장하고 갈까요?」 를 물을 수 있다.
       PuAppBar.onNavigate = function(url, app){ if(dirty && !confirm(...)) return; location.href = url; };
     안 건드리면 그냥 옮긴다. */
  function navTo(url, app) {
    if (typeof global.PuAppBar !== 'undefined' && typeof global.PuAppBar.onNavigate === 'function') {
      global.PuAppBar.onNavigate(url, app);
      return;
    }
    global.location.href = url;
  }
  function go(app) {
    if (!app) return;
    var back = lastScreen(app.key);
    var url = app.url + '?' + bust() + (back ? '&back=' + encodeURIComponent(back) : '');
    navTo(url, app);
  }

  /* ── 화면 ── */
  var _pop = null;
  function closePop() {
    if (_pop && _pop.parentNode) _pop.parentNode.removeChild(_pop);
    _pop = null;
    document.removeEventListener('mousedown', onDocDown, true);
    document.removeEventListener('keydown', onKey, true);
  }
  function onDocDown(e) {
    // ★ 팝업 안을 눌렀을 때는 닫지 않는다 (깔때기에서 같은 실수를 한 적이 있다 —
    //   mousedown 이면 무조건 닫으면 안쪽 클릭도 닫혀 아무것도 못 고른다)
    if (e.target && e.target.closest && e.target.closest('[data-pu-appbar-pop]')) return;
    if (e.target && e.target.closest && e.target.closest('[data-pu-appbar-btn]')) return;
    closePop();
  }
  function onKey(e) { if (e.key === 'Escape') closePop(); }

  /* 목록을 걸 높이 — 단추 밑이 아니라 **머리줄 밑**이다.
     단추는 머리줄보다 작아서(위아래 여백) 단추 밑에 걸면 머리줄을 몇 px 덮는다(실측). */
  function barBottom(btn) {
    var r = btn.getBoundingClientRect();
    var y = r.bottom, p = btn.parentElement, n = 0;
    while (p && n++ < 4) {
      var pb = p.getBoundingClientRect();
      // 단추를 품은 '줄' 로 보이는 것만: 훨씬 넓고, 아래로 조금만 더 내려간 것
      if (pb.bottom > y && (pb.bottom - r.bottom) <= 40 && pb.width > r.width * 2) y = pb.bottom;
      p = p.parentElement;
    }
    return y;
  }

  function openPop(btn) {
    if (_pop) { closePop(); return; }
    var r = btn.getBoundingClientRect();
    var anchorY = barBottom(btn);
    var W = 236;
    var pop = document.createElement('div');
    pop.setAttribute('data-pu-appbar-pop', '1');
    pop.style.cssText =
      'position:fixed;z-index:99999;width:' + W + 'px;background:#fff;border:1px solid #cbd5e1;' +
      'border-radius:9px;box-shadow:0 12px 30px rgba(0,0,0,.20);overflow:hidden;' +
      'font-family:-apple-system,"Malgun Gothic",sans-serif;' +
      'left:' + Math.max(8, Math.min(r.left, global.innerWidth - W - 10)) + 'px;' +
      'top:' + (anchorY + 5) + 'px;';

    var head = document.createElement('div');
    head.style.cssText = 'padding:6px 11px;font-size:10.5px;color:#94a3b8;background:#f8fafc;border-bottom:1px solid #eef2f6';
    head.textContent = '프로그램 이동 · ☆ 를 누르면 위로 올라갑니다';
    pop.appendChild(head);

    var list = document.createElement('div');
    list.style.cssText = 'max-height:min(62vh,420px);overflow-y:auto';
    pop.appendChild(list);

    function draw() {
      list.innerHTML = '';
      var arr = ordered(), lastFav = -1;
      arr.forEach(function (a, i) { if (isFav(a.key)) lastFav = i; });

      arr.forEach(function (a, i) {
        var now = (a.key === _me);
        var row = document.createElement('div');
        row.setAttribute('data-pu-app', a.key);   // 자동 시험·자동화가 줄을 정확히 집을 수 있게
        row.style.cssText =
          'display:flex;align-items:center;gap:8px;padding:7px 10px;font-size:12.5px;' +
          'border-bottom:1px solid #f8fafc;' + (now ? 'background:#eff6ff;' : 'cursor:pointer;') +
          (i === lastFav && lastFav < arr.length - 1 ? 'border-bottom:1px solid #cbd5e1;' : '');

        var star = document.createElement('span');
        star.textContent = isFav(a.key) ? '★' : '☆';
        star.title = isFav(a.key) ? '즐겨찾기에서 빼기' : '즐겨찾기에 넣기 (위로 올라갑니다)';
        star.style.cssText = 'cursor:pointer;font-size:13px;flex-shrink:0;color:' + (isFav(a.key) ? '#f59e0b' : '#cbd5e1');
        star.addEventListener('click', function (e) { e.stopPropagation(); toggleFav(a.key); draw(); });
        row.appendChild(star);

        var ic = document.createElement('span');
        ic.textContent = a.icon;
        ic.style.cssText = 'font-size:15px;flex-shrink:0';
        row.appendChild(ic);

        var nm = document.createElement('span');
        nm.textContent = a.name;
        nm.style.cssText = 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;' +
          (now ? 'font-weight:800;color:#1d4ed8' : 'color:#1e293b');
        row.appendChild(nm);

        var tail = document.createElement('span');
        tail.style.cssText = 'font-size:10px;color:#94a3b8;flex-shrink:0';
        tail.textContent = now ? '지금' : (lastScreen(a.key) ? '↩' : '');
        if (!now && lastScreen(a.key)) tail.title = '보던 화면으로 돌아갑니다';
        row.appendChild(tail);

        if (!now) {
          row.addEventListener('click', function () { closePop(); go(a); });
          row.addEventListener('mouseenter', function () { row.style.background = '#f8fafc'; });
          row.addEventListener('mouseleave', function () { row.style.background = ''; });
        }
        list.appendChild(row);
      });
    }
    draw();

    var foot = document.createElement('div');
    foot.style.cssText = 'padding:7px 10px;border-top:1px solid #eef2f6;background:#f8fafc';
    var home = document.createElement('span');
    home.textContent = '🏠 시작화면(포털)';
    home.style.cssText = 'font-size:11.5px;color:#475569;cursor:pointer';
    home.addEventListener('click', function () { closePop(); navTo('enter.html?' + bust(), null); });
    foot.appendChild(home);
    pop.appendChild(foot);

    document.body.appendChild(pop);
    _pop = pop;
    /* 아래가 좁고 **위가 더 넓을 때만** 위로 펼친다.
       종전처럼 「아래로 넘치면 무조건 위」로 하면, 머리줄이 화면 맨 위에 있는 앱에서
       목록이 머리줄을 덮어 버린다(창이 짧을 때 특히). */
    var pr = pop.getBoundingClientRect();
    var below = global.innerHeight - anchorY;
    var above = r.top;
    if (pr.height > below - 8 && above > below) {
      pop.style.top = 'auto';
      pop.style.bottom = (global.innerHeight - r.top + 5) + 'px';
    }
    document.addEventListener('mousedown', onDocDown, true);
    document.addEventListener('keydown', onKey, true);
  }

  /* ── 붙이기 ── */
  function mount(host, opts) {
    opts = opts || {};
    _me = opts.current || '';
    var el = (typeof host === 'string') ? document.querySelector(host) : host;
    if (!el) return null;
    if (el.querySelector('[data-pu-appbar-btn]')) return null;   // 두 번 붙지 않게

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('data-pu-appbar-btn', '1');
    btn.title = '다른 프로그램으로 이동 (로그인은 그대로 이어집니다)';
    btn.textContent = '⊞ 프로그램';
    btn.style.cssText =
      'display:inline-flex;align-items:center;gap:4px;background:#eff6ff;color:#1d4ed8;' +
      'border:1px solid #93c5fd;border-radius:6px;padding:4px 10px;font-size:11.5px;' +
      'font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap;flex-shrink:0;';
    btn.addEventListener('click', function (e) { e.stopPropagation(); openPop(btn); });
    el.appendChild(btn);
    return btn;
  }

  /* 앱이 뜰 때 주소에 실려 온 「보던 화면」을 꺼낸다.
     주소에 없으면 저장해 둔 것을 쓴다(주소를 직접 친 경우에도 이어지게). */
  function backTarget(searchStr) {
    try {
      var s = (searchStr !== undefined && searchStr !== null) ? String(searchStr) : (global.location.search || '');
      var m = /[?&]back=([^&]*)/.exec(s);
      if (m) return decodeURIComponent(m[1]);
    } catch (e) {}
    return lastScreen();
  }

  /* 주소로 지금 어느 프로그램인지 알아낸다 — 앱이 따로 알려 주지 않아도 되게 */
  function whoAmI() {
    var f = '';
    try { f = (global.location.pathname || '').split('/').pop().toLowerCase(); } catch (e) {}
    for (var i = 0; i < APPS.length; i++) {
      if (APPS[i].url.toLowerCase() === f) return APPS[i].key;
    }
    return '';
  }

  /* 스스로 붙기 — 앱은 <script src="js/pu-appbar.js"></script> 한 줄이면 된다.
     ① 앱이 자리를 정해 뒀으면(<span data-pu-appbar></span>) 거기에 붙인다.
     ② 안 정해 뒀으면 오른쪽 위에 떠 있는 단추로 붙인다.
        자리를 정하는 것이 보기 좋지만, 안 해도 일단 쓸 수 있어야 8개를 한꺼번에 살릴 수 있다. */
  function auto() {
    _me = whoAmI();
    /* 앱이 단추를 직접 그리는 경우(<meta name="pu-appbar" content="self">)에는
       손대지 않는다. 안 그러면 로그인 전에 떠 있는 단추가 하나 생기고,
       로그인 뒤 앱이 그린 단추와 **둘이 겹친다.** */
    if (document.querySelector('meta[name="pu-appbar"][content="self"]')) return;
    var host = document.querySelector('[data-pu-appbar]:not([data-pu-appbar="float"])');
    var btn = document.querySelector('[data-pu-appbar-btn]');
    if (btn) {
      /* ★ 옮기는 것은 **내가 띄운 단추뿐**이다.
         앱이 제자리에 그려 둔 단추까지 끌어오면 엉뚱한 곳으로 간다.
         (자리가 늦게 생기는 앱을 위해, 떠 있던 것만 제자리로 들여보낸다) */
      var old = document.querySelector('[data-pu-appbar="float"]');
      if (host && old && old.contains(btn)) {
        host.appendChild(btn);
        if (old.parentNode) old.parentNode.removeChild(old);
      }
      return;
    }
    if (host) { mount(host, { current: _me }); return; }
    // 자리를 못 찾았을 때만 임시로 띄운다 (나중에 자리가 생기면 위에서 옮겨 간다)
    var float = document.createElement('div');
    float.setAttribute('data-pu-appbar', 'float');
    float.style.cssText = 'position:fixed;top:8px;right:10px;z-index:9998;';
    document.body.appendChild(float);
    mount(float, { current: _me });
  }
  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else setTimeout(fn, 0);
  }
  // 앱 화면이 늦게 그려지는 경우(리액트·프리액트)가 있어 한 번 더 살핀다
  ready(function () { auto(); setTimeout(auto, 1200); });

  /* 앱이 스스로 단추를 그리고 이 함수만 부르는 길.
     리액트·프리액트로 머리줄을 그리는 앱(푸른이알피)은 남의 DOM 을 끼워 넣으면
     다시 그릴 때 지워질 수 있다. 그래서 단추는 앱이 그리고, 목록만 여기서 연다. */
  function open(btnEl) {
    if (!_me) _me = whoAmI();
    if (!btnEl) return;
    openPop(btnEl);
  }

  global.PuAppBar = {
    APPS: APPS,
    mount: mount,
    auto: auto,
    open: open,
    whoAmI: whoAmI,
    mark: mark,
    lastScreen: lastScreen,
    backTarget: backTarget,
    favs: favs,
    toggleFav: toggleFav,
    ordered: ordered,
    _close: closePop
  };
})(window);
