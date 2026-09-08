/* ══════════════════════════════════════════════════════════════
   푸른 통합시스템 — 프로그램 사이 이동 (공용 앱바)
   2026-08-07

   무엇: 어느 프로그램에서든 오른쪽 가장자리 「즐겨찾기」 손잡이를 눌러 다른 프로그램으로 바로 간다.
        종전에는 포털(enter.html)로 돌아갔다가 타일을 눌러야 해서 두 번 거쳤다.

   ★★ 새 프로그램을 만들 때 반드시 지킬 것 (대표님 지시, 2026-08-07) ★★
     ① <script src="js/pu-appbar.js"></script> 한 줄을 넣는다  ← 이것만으로 저절로 붙는다
     ② 아래 APPS 배열에 그 프로그램 한 줄을 더한다
     둘 중 하나라도 빠뜨리면 그 프로그램만 오갈 수 없는 섬이 된다.

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

  /* 프로그램 목록 — 포털(enter.html)의 타일과 같은 차례·같은 이름으로 둔다.
     새 프로그램이 생기면 여기 한 줄만 더한다.
     ⚠ 실제로 두 개(문서관리·급여관리)가 빠져 있어 그 앱들만 즐겨찾기가 안 떴다
       (대표 보고 2026-08-13: "문서관리에는 왜 즐겨찾기 안 나오나"). 목록에 없으면
       손잡이가 붙어도 그 앱이 목록에 안 보이고, script 를 안 실으면 손잡이 자체가
       없다 — 이번엔 둘 다였다. 이름도 포털 개명(2026-08-11)을 따라잡았다. */
  var APPS = [
    { key: 'erp',     name: '푸른이알피',   icon: '🏢', url: 'pu-erp.html',         desc: '인사·급여·재무' },
    { key: 'consult', name: '정부사업일정', icon: '📅', url: 'gov-consulting.html', desc: '보고서 일정및사진관리' },
    { key: 'work',    name: '업무관리',     icon: '📋', url: 'work.html',           desc: '주간 업무기록' },
    { key: 'career',  name: '경력관리',     icon: '🗂', url: 'kcareer.html',        desc: '개인 이력서', adminOnly: true },
    { key: 'govbid',  name: '정부사업신청', icon: '🏛', url: 'gov.html',            desc: '공고 모아보기', adminOnly: true },
    { key: 'cards',   name: '기업정보함',    icon: '📇', url: 'pu-cards.html',       desc: '사업자·명함·계약서' },
    /* ⚠ 메일은 기업정보함과 같은 파일이고 주소만 다르다. whoAmI() 는 파일 이름만
       견주므로(물음표 뒤는 안 본다) 메일 창에서도 「지금 앱」은 기업정보함으로 잡힌다 —
       그래서 이 줄이 늘어도 지금 앱 표시가 흔들리지 않는다. */
    { key: 'mail',    name: '메일',        icon: '✉️', url: 'pu-cards.html?view=mail', desc: '자료 붙여 보내기·예약' },
    { key: 'photos',  name: '사진첩',       icon: '🖼️', url: 'pu-photos.html',      desc: '사진·서류' },
    { key: 'paydata', name: '급여데이터함',  icon: '💼', url: 'pu-paydata.html',     desc: '급여자료 사업장별' },
    { key: 'fund',    name: '기금관리',     icon: '🏦', url: 'fund.html',           desc: '근로복지기금 운영' },
    { key: 'rules',   name: '취업규칙 관리', icon: '📋', url: 'rules.html',          desc: '작성·검토·개정·신고' },
    { key: 'docs',    name: '문서관리',     icon: '📄', url: 'docs-esign.html',     desc: '계약서 전자송부' },
    { key: 'payroll', name: '급여관리',     icon: '💰', url: 'payroll-os.html',     desc: '급여 아웃소싱' },
    { key: 'home',    name: '홈페이지 관리', icon: '🌐', url: 'pu-home.html',        desc: '구성원·주요업무 글', adminOnly: true },
    /* 뉴스레터 — 경력관리·홈페이지 관리와 «같이» 총괄관리자 전용이다.
       포털 타일(enter.html)과 잣대를 맞춘다 — 한쪽만 보이면 눌러도 막히는 문이 된다. */
    { key: 'news',    name: '뉴스레터 관리', icon: '📰', url: 'pu-news.html',        desc: '주간뉴스레터 짓기·보내기', adminOnly: true }
  ];

  /* 단추에 적는 말 — 한 곳에서만 정한다. 바꾸려면 여기 한 줄. */
  var ICON = '⊞';
  var LABEL = '즐겨찾기';

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
  /* 총괄관리자만 보는 것 — 대표 지시 2026-08-17.
     「흐리게도 보이지 않게」 하라 하셨으므로 목록에서 아예 뺀다.
     ★ 모를 때는 «감춘다»(닫는 쪽으로 실패). 아닌 사람에게 잠깐이라도 보이는 것보다,
       관리자에게 잠깐 늦게 보이는 편이 낫다 — 알아내는 즉시 다시 그린다.
     근거는 포털 타일과 같은 잣대(명부의 role)다. 근거가 둘이면 언젠가 어긋난다. */
  function isAdminNow() {
    try {
      var me = global.PuWhoami && global.PuWhoami.get && global.PuWhoami.get();
      return !!(me && me.role === 'admin');
    } catch (e) { return false; }
  }

  function ordered() {
    var f = favs();
    var admin = isAdminNow();
    return APPS.filter(function (a) { return !a.adminOnly || admin; }).sort(function (a, b) {
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
  /* ══ 같은 프로그램은 «한 창»만 (대표 지시 2026-09-08) ═══════════════════════
     「기업정보함에서 보기 클릭하면 새롭게 기업정보함 창이 열린다.
       항상 푸른통합시스템의 모든 창은 2개가 열리지 않고 하나만 열리게 해라」

     ★★ 까닭 — `window.open(주소, '_blank')` 는 «누를 때마다 새 탭»이다. 서류를 댓 개만
       훑어도 기업정보함 탭이 그만큼 쌓이고, 나중에 어느 것이 무엇인지도 모르고
       하나씩 닫아야 한다. 대표님이 2026-08-27 에 사진첩 하나만 그렇게 고쳐 달라
       하셨고(pu-cards 의 CO_DOC_WIN), 2026-09-08 에 «모든 창»으로 넓히셨다.

     ★ 방법은 «창에 이름을 붙이는 것» 하나다. 이름이 같으면 브라우저가 그 창을 다시
       쓴다 — 처음엔 새 창이 열리고, 그다음부터는 그 창이 새 내용으로 바뀐다.
     ⚠ 열려 있던 창은 «뒤에 가려 있다» — focus() 로 앞으로 끌어오지 않으면
       「아무 일도 안 일어난」 것처럼 보인다.
     ⚠ 팝업이 막히면 «이 창»에서 간다(앱바가 옮기는 방식과 같다). 막혔다고 아무 일도
       안 하면 눌러도 반응이 없는 화면이 된다 — 이 저장소가 여러 번 밟은 자리다.

     ⚠⚠ 이름은 «주소의 화면 이름»에서 뽑는다. 부르는 곳마다 손으로 적게 하면
       한 곳은 반드시 다르게 적고, 그 앱만 탭이 쌓인다.
     ★ purpose 를 주면 «그 일 전용 창»이 된다 — 메일 쓰기가 그렇다(쓰던 편지가 딴
       화면으로 바뀌면 안 된다). 「하나만」은 «같은 것이 둘로 안 열린다»는 뜻이고,
       하는 일이 다른 창을 억지로 하나로 합치라는 뜻이 아니다. */
  function winNameOf(url) {
    var m = /(?:^|\/)([A-Za-z0-9_-]+)\.html/.exec(String(url || ''));
    return 'pu_' + (m ? m[1].replace(/-/g, '_') : 'app');
  }
  function goApp(url, purpose) {
    var u = String(url || '');
    if (!u) return null;
    var name = purpose ? ('pu_' + String(purpose)) : winNameOf(u);
    var w = null;
    try { w = global.open(u, name); } catch (_) { w = null; }
    if (w) {
      try { w.focus(); } catch (_) { /* 브라우저가 막을 수 있다 — 옮긴 것은 됐다 */ }
      return w;
    }
    navTo(u);          // 팝업이 막혔다 — 이 창에서 간다
    return null;
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
    var isTab = btn.hasAttribute('data-pu-appbar-tab');

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
    /* 신원은 파이어베이스가 늦게 알려 준다. 관리자 전용 줄이 처음엔 감춰져 있으므로,
       알아내는 즉시 다시 그린다 — 안 그리면 관리자에게 영영 안 보인다. */
    try {
      if (global.PuWhoami && global.PuWhoami.onChange) global.PuWhoami.onChange(function () { draw(); });
    } catch (e) { }

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
    if (isTab) {
      /* 오른쪽 가장자리 손잡이 — 목록은 **왼쪽으로** 펼치고 손잡이와 세로 가운데를 맞춘다.
         화면 위아래로 넘치지 않게 가둔다(짧은 창에서도 다 보이게). */
      pop.style.left = Math.max(8, r.left - W - 8) + 'px';
      pop.style.top = Math.max(8, Math.min(r.top + r.height / 2 - pr.height / 2,
        global.innerHeight - pr.height - 8)) + 'px';
    } else {
      var below = global.innerHeight - anchorY;
      var above = r.top;
      if (pr.height > below - 8 && above > below) {
        pop.style.top = 'auto';
        pop.style.bottom = (global.innerHeight - r.top + 5) + 'px';
      }
    }
    /* ★ 닫기 감시는 **어느 모양이든 반드시** 건다.
       손잡이 자리잡기에서 return 으로 빠져나가 이 두 줄을 건너뛰는 바람에
       바깥을 눌러도 Esc 를 눌러도 안 닫히는 일이 있었다. */
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
    btn.textContent = ICON + ' ' + LABEL;
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
  /* ── 손잡이를 어디에 둘 것인가 ──
     대표님 요구: **모든 프로그램에서 똑같은 자리**, 그리고 아무것과도 안 겹칠 것.
     8개 앱의 화면고정(fixed) 요소를 전부 뽑아 비교한 결과 —
       · 위 왼/오른  : 머리줄·로그아웃·상태표시가 5개 앱에서 쓴다
       · 아래 왼/오른: 접속자판·＋단추·저장표시가 4~5개 앱에서 쓴다
       · 아래 가운데 : **토스트 알림 자리**다(컨설팅·기업정보함·사진첩·경력관리 모두 left:50%)
                       업무관리는 빠른기록 바까지 깔려 있다
       · 세로 가운데 : **8개 앱 모두 0건 — 완전히 비어 있다**
     그래서 «오른쪽 가장자리 · 세로 한가운데» 에 세로 손잡이로 고정한다.
     머리줄·바닥줄·토스트·＋단추 어느 것과도 만나지 않는 유일한 자리다. */
  function makeTab() {
    var tab = document.createElement('button');
    tab.type = 'button';
    tab.setAttribute('data-pu-appbar-btn', '1');
    tab.setAttribute('data-pu-appbar-tab', '1');
    tab.title = '다른 프로그램으로 이동 (로그인은 그대로 이어집니다)';
    tab.style.cssText =
      'position:fixed;right:0;top:50%;transform:translateY(-50%);z-index:9998;' +
      'writing-mode:vertical-rl;text-orientation:upright;' +
      'padding:14px 5px;border:none;border-radius:9px 0 0 9px;' +
      'background:#1e40af;color:#fff;font-size:11.5px;font-weight:700;letter-spacing:1px;' +
      'font-family:-apple-system,"Malgun Gothic",sans-serif;cursor:pointer;' +
      'box-shadow:-2px 0 10px rgba(0,0,0,.20);opacity:.72;transition:opacity .15s,padding .15s;';
    tab.textContent = LABEL;
    tab.addEventListener('mouseenter', function () { tab.style.opacity = '1'; tab.style.paddingRight = '8px'; });
    tab.addEventListener('mouseleave', function () { tab.style.opacity = '.72'; tab.style.paddingRight = '5px'; });
    tab.addEventListener('click', function (e) { e.stopPropagation(); openPop(tab); });
    return tab;
  }

  function auto() {
    /* 주소로 알아낸 값이 있을 때만 덮어쓴다.
       앱이 mount({current}) 로 알려 준 것을 빈 값으로 지워 버리면
       「보던 화면」이 어느 앱 것인지 몰라 기록이 안 남는다. */
    _me = whoAmI() || _me;
    if (document.querySelector('[data-pu-appbar-btn]')) return;   // 두 번 붙지 않게
    if (!document.body) return;
    document.body.appendChild(makeTab());
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
    // 검사용 — 관리자 전용 줄이 실제로 빠지는지 본다
    _ordered: ordered,
    _isAdminNow: isAdminNow,
    mount: mount,
    auto: auto,
    open: open,
    /* 같은 프로그램은 «한 창»만 (대표 지시 2026-09-08) — 앱끼리 창을 열 때는
       window.open(…, '_blank') 대신 «반드시» 이것을 쓴다.
       ⚠ tests/one-window-per-app.test.js 가 _blank 가 되살아나는 것을 막는다. */
    goApp: goApp, winNameOf: winNameOf,
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
