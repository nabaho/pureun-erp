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

/* ── 폰에서 그 설정이 안 먹는다는 것을 화면에 밝힌다 ── */
(function () {
  const bar = cut('function buildHomeBar(){', '\n  }');
  ok('★ 폰에 안내 문구를 보여 준다', bar.indexOf('폰에서는 자동 이동하지 않습니다') > 0);
  ok('폰용 툴팁도 다르게', bar.indexOf('PC 에서 로그인할 때만 적용됩니다') > 0);
  ok('PC 에서는 종전 툴팁 그대로', bar.indexOf('선택하면 로그인 후 그 앱으로 바로 이동합니다') > 0);
})();

/* ── 폰에서 설정을 바꿔도 안내가 사라지지 않는다 ── */
(function () {
  const h = cut("$('homeAppSel').addEventListener('change'", '\n  }');
  ok('★ 4초 뒤 폰 안내로 되돌린다 (숨기면 오해가 남는다)',
     /if\(isMobile\(\)\)\{/.test(NS(h)) && h.indexOf('폰에서는 자동 이동하지 않습니다') > 0);
  ok('PC 에서는 종전대로 숨긴다', /hint\.style\.display='none';/.test(NS(h)));
  ok('폰에서 고른 값의 뜻을 알려 준다', h.indexOf('폰은 이 화면 유지') > 0);
})();

/* ── 포털이 홈화면 앱의 시작 화면인지 (이건 이미 맞았다 — 회귀 방지로 고정) ── */
(function () {
  const mf = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'));
  ok('홈화면 앱은 포털에서 시작한다', /enter\.html$/.test(mf.start_url || ''), 'start_url=' + mf.start_url);
  ok('포털이 그 manifest 를 쓴다', /<link[^>]+rel="manifest"[^>]+manifest\.json"/.test(en));
})();

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===');
process.exit(fail ? 1 : 0);
