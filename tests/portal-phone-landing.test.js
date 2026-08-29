/* 폰에서 로그인하면 포털 화면에 머문다
   '로그인 후 바로가기'(homeApp)는 서버에 저장돼 기기 간 공유된다.
   그래서 PC 에서 '푸른이알피'로 잡아 두면 폰에서도 로그인할 때마다 이알피로 넘어갔고,
   배너의 '포털 머무르기'는 1.5초 안에 눌러야 해서 폰에서는 사실상 못 막았다. */
const fs = require('fs'), path = require('path');
const en = fs.readFileSync(process.argv[2] || path.join(__dirname, '..', 'enter.html'), 'utf8');
const NS = s => s.replace(/\s/g, '');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
}
function cut(a, b) {
  const i = en.indexOf(a); if (i < 0) throw new Error('못찾음: ' + a);
  const j = en.indexOf(b, i); if (j < 0) throw new Error('끝 못찾음: ' + b);
  return en.slice(i, j);
}

/* ── 폰에서는 자동 이동하지 않는다 ── */
(function () {
  const fn = cut('function maybeGoHome(){', '\n  }');
  ok('★ 폰이면 자동 이동을 하지 않는다', /if\(isMobile\(\)\)return;/.test(NS(fn)));
  ok('★ 그 검사가 바로가기 설정을 읽기 전에 온다',
     NS(fn).indexOf('if(isMobile())return;') < NS(fn).indexOf('tilePrefs.homeApp'));
  ok('왜 그런지 코드에 적어 뒀다',
     fn.indexOf('기기 간에 공유') > 0 && fn.indexOf('포털 머무르기') > 0);
  ok('PC 동작은 그대로 (배너 경로가 살아 있다)', /showHomeBanner\(app\)/.test(fn));
})();

/* ── 설정이 기기 간 공유된다는 전제가 맞는지 (이 전제가 깨지면 위 수정의 근거가 바뀐다) ── */
(function () {
  const sv = cut('function saveTilePrefs(){', '\n  }');
  ok('★ 바로가기 설정이 서버에도 저장된다 (그래서 폰에 새어 들어왔다)',
     /db\.ref\(tilePrefPath\(\)\)\.set\(tilePrefs\)/.test(sv));
  ok('기기별 캐시에도 저장한다', /localStorage\.setItem\(tilePrefLocalKey\(\)/.test(sv));
})();

/* ── 기본 줄이 바뀐 새 타일을 옛 사용자 저장값이 되돌리지 않는다 ── */
(function () {
  const apps = cut('var APPS = [', '\n  ];');
  const apply = cut('function applyTileOrder(){', '\n  }');
  /* ⚠ 2026-08-29: 줄이 둘(support/direct) → 넷(client/store/office/outside)이 됐다.
     급여데이터함은 «자료함»으로 갔다 — 사진첩과 같은 줄이다(둘 다 쌓아 두는 함).
     못 박을 것은 줄 «이름»이 아니라, ①제자리가 정해져 있는가
     ②옛 저장값이 그 제자리를 못 덮는가 다. */
  const rows = cut('var APP_ROWS = [', '\n  ];');
  ok('★ 급여데이터함에 제자리가 정해져 있다 (그 줄이 실제로 있는 줄이다)',
     (function () {
       const m = /key:'paydata'[\s\S]{0,200}?row:'([a-z]+)'/.exec(apps);
       return !!(m && rows.indexOf("id:'" + m[1] + "'") >= 0);
     })());
  ok('★ 급여데이터함은 사진첩과 «같은 줄»이다 (둘 다 쌓아 두는 함이다)',
     (function () {
       const a = /key:'paydata'[\s\S]{0,200}?row:'([a-z]+)'/.exec(apps);
       const b = /key:'photos'[\s\S]{0,200}?row:'([a-z]+)'/.exec(apps);
       return !!(a && b && a[1] === b[1]);
     })());
  ok('★★ 옛 저장값이 «지금 없는 줄»이면 앱의 제자리로 보낸다 (타일이 사라지면 안 된다)',
     /savedRowOf\(t\.dataset\.key, t\.dataset\.row\)/.test(apply)
     && /function savedRowOf[\s\S]{0,200}?rowExists\(r\) \? r : dflt/.test(en));
})();

/* ── 폰에서는 설명이 셀을 밀어내지 않고 툴팁으로 남는다 ── */
(function () {
  const bar = cut('function buildHomeBar(){', '\n  }');
  ok('★ 좁은 화면의 별도 안내 칸은 비워 둔다', /var phoneNote = '<span class="hb-hint"><\/span>';/.test(bar));
  ok('폰용 툴팁도 다르게', bar.indexOf('PC 에서 로그인할 때만 적용됩니다') > 0);
  ok('PC 에서는 종전 툴팁 그대로', bar.indexOf('선택하면 로그인 후 그 앱으로 바로 이동합니다') > 0);
})();

/* ── 설정 변경 안내도 잠시 뒤 숨겨 셀 줄이 겹치지 않는다 ── */
(function () {
  const h = cut("$('homeAppSel').addEventListener('change'", '\n  }');
  ok('★ 4초 뒤 안내를 숨긴다', /hint\.style\.display='none';/.test(NS(h)));
  ok('폰에서 고른 값의 뜻을 알려 준다', h.indexOf('폰은 이 화면 유지') > 0);
})();

/* ── 로그아웃 뒤 같은 탭에서 다시 로그인해도 포털에 머문다 ── */
(function () {
  const h = cut("$('logoutBtn').addEventListener('click'", '\n  });');
  ok('★ 로그아웃 때 바로가기 건너뛰기 표식을 남긴다',
     /sessionStorage\.setItem\('pu_skip_home','1'\)/.test(h));
})();

/* ── 포털이 홈화면 앱의 시작 화면인지 (이건 이미 맞았다 — 회귀 방지로 고정) ── */
(function () {
  const mf = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'));
  ok('홈화면 앱은 포털에서 시작한다', /enter\.html$/.test(mf.start_url || ''), 'start_url=' + mf.start_url);
  ok('포털이 그 manifest 를 쓴다', /<link[^>]+rel="manifest"[^>]+manifest\.json"/.test(en));
})();

/* ── 메일은 타일을 따로 두지 않는다 (대표 지시 2026-08-21) ──
   메일은 기업정보함과 «같은 프로그램»이고 문만 달랐다. 문을 하나 더 내니 한 프로그램이
   타일 둘을 차지해 첫 화면만 길어졌다 — 「메일은 여기 있을 필요 없다, 기업정보함으로」.
   ★ 지키려는 것은 둘이다: «타일은 하나» 그리고 «기능은 그대로».
     타일만 지우고 메일로 가는 길까지 막으면 그건 기능을 없앤 것이다. */
(function () {
  const apps = cut('var APPS = [', '\n  ];');
  /* 2026-08-24 대표 지시 「해라 포털도」로 메일 타일을 되살렸다. 08-21 에 뺀 까닭은
     「한 프로그램이 타일 둘을 차지한다」였는데, 같은 날 옆줄을 두 창으로 나눠 메일 문에서는
     명함 살림이 아예 안 보이게 되었다 — 이제 «다른 두 화면»이라 타일도 둘이 맞다. */
  ok('★ 메일 타일이 있다 (대표 지시 2026-08-24)', /key:'mail'/.test(apps));
  ok('★ 메일 타일은 메일 문으로 간다', /key:'mail'[^\n]*pu-cards\.html\?view=mail/.test(apps));
  ok('★ 기업정보함 타일은 그대로 있다', /key:'cards'[\s\S]{0,160}?url:'pu-cards\.html'/.test(apps));
  /* 기능은 살아 있다 — 기업정보함 안에서 메일 화면으로 갈 수 있어야 한다.
     ⚠ 이 줄이 깨지면 「타일만 지운 것」이 아니라 「메일을 없앤 것」이다. */
  const cards = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8');
  ok('★ 메일 화면으로 가는 길이 살아 있다', cards.indexOf('mail') > 0);
})();

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===');
process.exit(fail ? 1 : 0);
