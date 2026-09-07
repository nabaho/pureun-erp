/* 기금관리 화면 구조 회귀 — 여러 세션이 같은 파일을 고치므로 '되돌아가면 안 되는 것'만 지킨다.
 *
 * 여기 있는 항목은 전부 **실제로 한 번 깨졌던 것**이다. 다시 깨지면 이 검사가 먼저 운다.
 * ⚠ 이 저장소는 통째로 github.io 로 공개된다 — 실제 기금명·금액을 쓰지 말 것.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'fund.html'), 'utf8');
const stripComments = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
function slice(from, to) {
  const a = SRC.indexOf(from);
  assert.ok(a >= 0, '기준점을 못 찾음: ' + from);
  const b = to ? SRC.indexOf(to, a) : SRC.length;
  return SRC.slice(a, b > a ? b : SRC.length);
}

test('메뉴를 눌렀을 때 화면이 바뀐다 — pointerdown 에서 포인터를 잡지 않는다', () => {
  /* 2026-07-27 실제 회귀: 메뉴 순서 드래그를 넣으며 pointerdown 에서 setPointerCapture 를
     걸었더니 click 대상이 #navlist 가 되어 .sitem 의 onclick(화면 이동)이 죽었다.
     캡처는 '실제로 끌기 시작한 뒤'에만 걸어야 한다. */
  const nav = slice('function bindNavDrag', '/* ── 모바일 서랍 메뉴 ──');
  const down = stripComments(nav.slice(nav.indexOf("addEventListener('pointerdown'"), nav.indexOf("addEventListener('pointermove'")));
  const move = nav.slice(nav.indexOf("addEventListener('pointermove'"), nav.indexOf('function end('));
  assert.ok(!down.includes('setPointerCapture'), 'pointerdown 에서 캡처하면 메뉴 클릭이 죽는다');
  assert.ok(move.includes('setPointerCapture'), '끌기 시작 후에는 캡처해야 사이드바 밖으로 나가도 이어진다');
  assert.match(move, /Math\.abs\(dy\)<5\) return;[\s\S]{0,320}setPointerCapture/, '캡처가 임계값 판정보다 앞에 있다');
  assert.match(nav, /if\(!moved\) return;/, '안 움직였으면 click 을 삼키면 안 된다');
});

test('기금 목록 화면은 하나 — 서식·결산은 보기 전환으로 본다', () => {
  /* 같은 42개 목록을 세 화면(기금 현황·서식 현황·결산 대장)이 각각 그리던 것을 합쳤다.
     다시 갈라지면 분류·검색이 화면마다 따로 놀게 된다. */
  assert.match(SRC, /var HOME_VIEWS=\[\['basic'/, '보기 전환 정의가 없다');
  assert.ok(!SRC.includes('id="nav-docsboard"'), '서식 현황이 다시 별도 메뉴가 됐다');
  assert.ok(!SRC.includes('id="nav-closeboard"'), '결산 대장이 다시 별도 메뉴가 됐다');
  assert.match(SRC, /function docsMatrixHTML\(list\)/, '서식 매트릭스가 목록을 인수로 받아야 한다');
  assert.match(SRC, /function closeMatrixHTML\(list0\)/, '결산 매트릭스가 목록을 인수로 받아야 한다');
  assert.match(SRC, /S\.view==='docsboard'\)\{ S\.view='home'; S\.homeView='docs'; \}/, '옛 링크 호환이 빠졌다');
  assert.match(SRC, /S\.view==='closeboard'\)\{ S\.view='home'; S\.homeView='close'; \}/, '옛 링크 호환이 빠졌다');
});

test('설명은 화면에 깔지 않고 ⓘ 로 접는다 — 오류 메시지는 예외', () => {
  const i0 = SRC.indexOf('var HELP={');
  assert.ok(i0 >= 0, 'HELP 등록부가 없다');
  const box = {};
  new Function(SRC.slice(i0, SRC.indexOf('\n};', i0) + 3) + ';this.HELP=HELP;').call(box);
  const keys = Object.keys(box.HELP);
  assert.ok(keys.length >= 20, '도움말 항목이 너무 적다: ' + keys.length);
  keys.forEach(k => {
    assert.ok(box.HELP[k].t && box.HELP[k].t.length > 1, '제목 없음: ' + k);
    assert.ok(box.HELP[k].h && box.HELP[k].h.length > 10, '본문 없음: ' + k);
    assert.ok(!/['"]/.test(box.HELP[k].t), '제목에 따옴표가 있으면 속성 삽입이 깨진다: ' + k);
  });
  /* ⓘ 는 hlp('키') 로 직접 부르기도 하고, 표(CARD_TARGETS 등)에 help:'키' 로 적어 두고
     hlp(T.help) 로 부르기도 한다 — 둘 다 «쓰고 있는 것»으로 센다. */
  const used = [...SRC.matchAll(/hlp\('([^']+)'\)/g)].map(m => m[1])
    .concat([...SRC.matchAll(/help:\s*'([^']+)'/g)].map(m => m[1]));
  const missing = [...new Set(used)].filter(k => !box.HELP[k]);
  assert.deepEqual(missing, [], '등록부에 없는 도움말을 부른다(빈 버튼이 된다)');
  const unused = keys.filter(k => !used.includes(k));
  assert.deepEqual(unused, [], '화면에 놓이지 않은 도움말이 있다');
  assert.match(SRC, /hlp[\s\S]{0,120}event\.stopPropagation\(\)/, 'ⓘ 클릭이 행·탭 클릭과 겹친다');

  /* 화면에 남은 장문 설명은 오류·상태 메시지뿐이어야 한다.
     아래 둘은 정리 이후 다른 작업에서 새로 깔린 것 — 아직 ⓘ 로 못 옮겼다.
     **여기에 더 추가하지 말 것.** 새 설명문은 hlp()/HELP 로 접는다. */
  const KNOWN = [
    '연도별 결산·지원금·담당자·설립 진행·계약관계 데이터는 건드리지 않습니다',   // 데이터 가져오기 안내
    '지원율이 80·60·40점에서 계단처럼 떨어지므로'                              // 지원금 신청액 주의
  ];
  const long = SRC.split('\n')
    .map((ln, i) => ({ ln, i: i + 1 }))
    .filter(x => /<p class="muted"|class="msg (warn|ok|err)"/.test(x.ln))
    .map(x => ({ ...x, ko: (x.ln.replace(/<[^>]*>/g, '').replace(/'\s*\+[^+]*\+\s*'/g, '').match(/[가-힣]/g) || []).length }))
    .filter(x => x.ko >= 25);
  const notMsg = long.filter(x => !/class="msg /.test(x.ln) && !KNOWN.some(k => x.ln.includes(k)));
  assert.deepEqual(notMsg.map(x => 'L' + x.i), [], '설명문이 새로 화면에 깔렸다 — ⓘ(hlp) 로 옮길 것');
});

test('폰에서 보이는 구조가 살아 있다', () => {
  const m = SRC.slice(SRC.indexOf('@media (max-width:860px)'), SRC.indexOf('@media (max-width:600px)'));
  assert.ok(m, '모바일 미디어쿼리가 없다');
  assert.ok(SRC.indexOf('#main{margin-left:216px') < SRC.indexOf('@media (max-width:860px)'),
    '미디어쿼리가 기본 규칙보다 앞에 오면 적용되지 않는다');
  assert.match(m, /#side\{[^}]*translateX\(-100%\)/, '사이드바 서랍 전환이 빠졌다');
  assert.match(m, /body\.sideopen #sideveil\{display:block\}/, '오버레이 표시 규칙이 빠졌다');
  assert.match(m, /#main\{margin-left:0\}/, '본문 좌측 여백 해제가 빠졌다');
  // 좁은 화면에서 입력폼은 1열이어야 한다(.grid·.gridw 어느 이름으로 적어도 된다)
  assert.match(m, /\.grid[^{]*\{grid-template-columns:1fr/, '입력폼 1열 전환이 빠졌다');
  assert.match(m, /\.gridw/, '넓은 폼(.gridw)도 폰에서 1열로 접혀야 한다');
  assert.match(m, /\.tabbar\{flex-wrap:nowrap;overflow-x:auto/, '탭 좌우 스와이프가 빠졌다');
  assert.match(m, /\.fld input,\.fld select,\.fld textarea,\.search\{font-size:16px\}/,
    'iOS 는 16px 미만 입력칸에 포커스하면 화면을 확대한다');
  assert.ok(!/user-scalable\s*=\s*no|maximum-scale/.test(SRC), '핀치 확대를 막으면 A4 미리보기를 못 읽는다');
});

test('서식은 A4 규격으로 나뉜다', () => {
  const box = {};
  const varLine = SRC.match(/var A4_W=[^\n]+/);
  assert.ok(varLine, 'A4 상수가 없다');
  function grabFn(name) {
    const i = SRC.indexOf('function ' + name + '(');
    let d = 0, on = false;
    for (let j = i; j < SRC.length; j++) {
      if (SRC[j] === '{') { d++; on = true; }
      else if (SRC[j] === '}') { d--; if (on && !d) return SRC.slice(i, j + 1); }
    }
  }
  new Function(varLine[0] + '\n' + grabFn('dgDocCss') + '\n' + grabFn('dgDocCssIn')
    + ';this.print=dgDocCss();this.screen=dgDocCssIn();').call(box);
  assert.match(box.print, /@page\{size:A4 portrait/, '인쇄가 A4 세로가 아니다');
  assert.match(box.print, /\.a4\{width:170mm/, '본문폭 = 210 − 여백 20×2');
  assert.match(box.print, /\.a4\{[^}]*height:257mm/, '본문높이 = 297 − 여백 20×2');
  assert.match(box.print, /\.a4:last-child\{page-break-after:auto\}/, '마지막 장 뒤에 빈 페이지가 생긴다');
  assert.match(box.screen, /#doced \.a4\{width:210mm/, '화면 용지가 A4 폭이 아니다');
  assert.match(box.screen, /box-sizing:border-box/, '여백이 폭에 포함되지 않으면 250mm 가 된다');
  assert.ok(!/max-width:760px/.test(box.print + box.screen), '옛 760px 제한이 A4 와 충돌한다');
});

test('푸른이알피 청구 연동은 남의 원장을 건드리지 않는다', () => {
  const pe = slice('var _peCache=null;', 'function renderBilling(');
  assert.ok(!/ref\('data\/[^']*'\)\s*\.\s*(set|update|remove|push)/.test(pe),
    '푸른이알피 원장(data/*)에 쓰면 사무관리가 깨진다');
  assert.match(pe, /ref\('data\/'\+key\+'\/v'\)\.once\('value'\)/, '읽기는 once 만');
  assert.match(SRC, /ref\(NS\+'\/puerp_link\//, '연결 보정은 우리 네임스페이스에만 저장해야 한다');
  assert.match(pe, /orderByChild\('sourceKind'\)\.equalTo\('fund'\)/, '매출 원장을 통째로 받으면 폰에서 무겁다');
});

test('서류 원본은 사진첩에 두고 기금은 참조만 갖는다', () => {
  assert.match(SRC, /<script src="js\/pu-photo-store\.js(\?v=\d+)?"><\/script>/, '공용 저장 층을 쓰지 않는다');
  assert.match(SRC, /var PHOTO_BUCKET='gs:\/\/pureun-erp-hrphotos'/, '사진첩 창고 지정이 없다');
  const album = fs.readFileSync(path.join(__dirname, '..', 'pu-photos.html'), 'utf8');
  assert.ok(album.includes("'pureun-erp-hrphotos'"), '사진첩 본체와 창고가 다르면 원본을 못 찾는다');
  assert.match(SRC, /ref\(NS\+'\/funds\/'\+fid\+'\/scans\/'\+kind\)/, '스캔 참조 경로가 없다');
  assert.ok(!/scans\/[^\n]{0,120}(dataUrl|base64|src:)/.test(SRC),
    '이미지를 실시간DB에 넣으면 기금 목록 로딩이 통째로 느려진다');
  /* 2026-09-06: 직접 올린 서류도 사진첩에 남기게 하면서 «어디서 왔는지» 깃발을 붙였다
     (fromAlbum) — 사진첩에서 온 것은 이미 이어져 있어 두 번 넣으면 사본이 쌓인다.
     같은 경로를 타는 것이 여기서 지킬 뜻이다. 깃발이 붙는 것은 괜찮다. */
  assert.match(SRC, /readDocInto\(zid,kind,file(,true)?\)/, '사진첩 사진도 기존 판독 경로를 타야 한다(두 벌 금지)');
});

test('결산 확정은 그때의 수치를 스냅샷으로 남긴다', () => {
  /* 저장 방식(단일 update / 다중경로 update)은 바뀔 수 있으므로 '무엇을 쓰는지'만 본다 */
  const lock = SRC.slice(SRC.indexOf('function lockClosing'), SRC.indexOf('function unlockClosing'));
  ['locked', 'locked_at', 'locked_by'].forEach(k => {
    assert.ok(new RegExp("closing/'\\+fid\\+'/'\\+yr\\+'/" + k + "'\\]").test(lock) || lock.includes(k + ':'),
      '확정 시 ' + k + ' 를 남기지 않는다');
  });
  assert.ok(/fin['\]:]/.test(lock) && /snap/.test(lock), '확정 시 수치 스냅샷을 남겨야 한다');
  assert.match(SRC, /update\(\{locked:null,locked_at:null,locked_by:null\}\)/,
    '해제는 잠금만 풀고 스냅샷은 남겨야 한다');
  assert.match(SRC, /ref\(NS\+'\/closing'\)\.once\('value'\)/,
    '결산 상태는 한 번에 읽어야 한다(기금별 반복 조회 금지)');
});

test('미완비는 사이드바 하위 묶음으로 — 제목줄에 붙이지 않는다', () => {
  /* 「기금 현황  44 · 미완비 22」가 두 줄로 접혀 읽기 어려웠다(대표 지적).
     미완비는 유형이 아니라 상태라 하위 묶음으로 따로 세운다. */
  const box = {};
  const i = SRC.indexOf('var HOME_GROUPS=');
  new Function(SRC.slice(i, SRC.indexOf('];', i) + 2) + ';this.G=HOME_GROUPS;').call(box);
  assert.ok(box.G.some(g => g[0] === 'inc'), '하위 묶음에 미완비가 없다');
  // 제목줄에 «보이는 글자»만 본다 — 마우스 올림말(title)에는 남아 있어도 된다
  assert.ok(!/hc\.textContent=[^\n]*미완비/.test(SRC), '제목줄 글자에 미완비를 다시 붙였다');
  assert.match(SRC, /B\.inc=live\.filter\(function\(f\)\{ return nDone\(f\)<5; \}\)/, '미완비 목록 계산이 없다');
  assert.match(SRC, /S\.homeTab==='inc'/, '본문이 미완비 묶음을 다루지 않는다');
  assert.ok(SRC.includes("'home.inc':{t:"), '미완비 도움말이 없다');
  // 비면 숨기고, 설립중은 제외한다
  assert.match(SRC, /g\[0\]==='past'\|\|g\[0\]==='inc'\)\) return '';/, '빈 미완비 묶음을 숨기지 않는다');
});

test('기금 정보 폼은 화면 폭을 다 쓴다 — 760px 2열에 갇히지 않는다', () => {
  assert.match(SRC, /\.gridw\{display:grid;grid-template-columns:repeat\(auto-fit,minmax\(215px,1fr\)\)/,
    '넓은 폼 격자가 없다');
  // max-width:none(폰에서 푸는 것)은 괜찮다 — 실제 «폭 제한»만 막는다
  assert.ok(!/\.gridw\{[^}]*max-width:\s*(?!none)/.test(SRC), '넓은 폼에 폭 제한을 걸면 다시 아래로 흘러내린다');
  // 여백은 바뀔 수 있다 — 「기금 정보 폼이 넓은 격자를 쓰는가」만 본다
  assert.match(SRC, /class="gridw"[^>]*oninput="markDirty\(\)"/, '기금 정보가 넓은 격자를 쓰지 않는다');
  assert.ok(!/전기이월[\s\S]{0,400}class="grid" style="max-width:760px"/.test(SRC),
    '전기이월 칸이 다시 2열 760px 에 갇혔다');
  const box = {};
  const i = SRC.indexOf('var INFO_SECS=');
  new Function(SRC.slice(i, SRC.indexOf('};', i) + 2) + ';this.S=INFO_SECS;').call(box);
  /* 묶음은 «이름으로» 못 박는다 — 개수만 세면 하나 더할 때 뜻은 그대로인데 검사가 깨지고,
     엉뚱한 묶음이 끼어도 개수만 맞으면 통과한다. 「사무소 임대차」는 2026-09-07 에 더했다(임대차계약서·사업자등록신청서가 묻는다). */
  assert.deepEqual(Object.keys(box.S), ['name','manager','chairman','tax_office','lease_lessor'],
    '묶음 머리가 정해진 다섯(기본·담당·인가등기·관할연락·사무소 임대차)이 아니다');
  const fields = SRC.slice(SRC.indexOf('var FIELDS='), SRC.indexOf('];', SRC.indexOf('var FIELDS=')));
  Object.keys(box.S).forEach(k => assert.ok(fields.includes("'" + k + "'"), 'FIELDS 에 없는 칸에 묶음 머리를 걸었다: ' + k));
  /* 여러 칸 폭이 필요한 칸(단추가 붙는 관할 3칸·담당 한 줄)은 넓게, 단 «자리가 있을 때만».
     좁은 화면에서 span 을 그대로 두면 없는 열이 생겨 화면 밖으로 넘친다. */
  const wide = SRC.match(/@media \(min-width:1200px\)\{[^}]*\.gridw[\s\S]{0,200}?\}\s*\}/);
  assert.ok(wide, '넓은 칸 규칙이 없다');
  assert.match(wide[0], /\.fld\.w2\{grid-column:span 2\}/, 'w2 규칙이 없다');
  assert.match(wide[0], /\.fld\.w3\{grid-column:span 3\}/, 'w3 규칙이 없다');
  assert.match(SRC, /\.gridw \.fld\.w2,\.gridw \.fld\.w3\{grid-column:auto\}/, '폰에서 여러 칸 폭을 풀지 않으면 넘친다');
});
