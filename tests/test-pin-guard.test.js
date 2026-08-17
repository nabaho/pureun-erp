/* 검사가 「바뀌기 쉬운 것」을 글자 그대로 박아 두지 않게 지킨다 (2026-08-16 대표 지시)

   ■ 왜 만들었나
   2026-08-16 하루에만 검사 다섯 개가 «기능이 망가져서» 가 아니라 «멀쩡한 개선» 때문에
   깨졌다. 전부 같은 까닭이었다 — 검사가 «규칙» 이 아니라 «지금 값» 을 박아 두었다.

     · <script src="js/pu-conflict.js"></script>   → 캐시 번호를 올리자 깨짐
     · maxHeight:'calc(100vh - 340px)'             → 높이를 재서 정하게 하자 깨짐
     · calc(100vh - 260px) ×2                      → 같은 이유
     · ref:_ldBoxRef                               → 변수 이름을 정리하자 깨짐
     · '업태 없음' · '2건 ×'                        → 문구를 고치자 깨짐

   ■ 왜 나쁜가
   깨진 검사를 본 다음 사람은 «내가 뭘 잘못했나» 를 한참 찾는다. 그리고 몇 번 겪으면
   검사를 «고쳐야 할 것» 이 아니라 «지워야 할 것» 으로 여기게 된다 — 그게 진짜 손해다.

   ■ 무엇을 지키나
   검사는 «규칙» 을 못 박아야 한다.
     ✗ 「높이가 340px 이다」        ✓ 「제 몸 안에서 구른다(높이 한도가 있다)」
     ✗ 「캐시 번호가 2 다」         ✓ 「캐시 번호가 붙어 있다」
     ✗ 「손잡이 이름이 _ldBoxRef 다」✓ 「손잡이가 달려 있다」
     ✗ 「단추 글자가 '2건 ×' 다」   ✓ 「숫자와 지우기 단추가 갈라져 있다」

   ■ 정말 값을 박아야 할 때
   세율 8.8%, 지급액 820,800원처럼 «그 값 자체가 규칙» 인 것은 박는 게 맞다.
   그런 줄에는 같은 줄에 `검사고정-허용` 을 적어 두면 이 검사가 넘어간다.
   ⚠ 「귀찮아서」 적지 말 것 — 왜 그 값이 규칙인지 함께 적는다. */
const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname);

/* 여기 있는 것은 «오늘 실제로 깨진» 것들이다. 짐작으로 늘리지 않는다 —
   짐작으로 늘리면 헛경고가 늘고, 헛경고가 늘면 아무도 안 본다. */
const RULES = [
  { id: '캐시 번호',
    re: /\?v=\\?\d/,
    fix: '번호를 박지 말고 \\?v=\\d+ 처럼 «붙어 있는지» 만 보세요.' },
  { id: '화면 높이',
    re: /calc\\?\(100vh\s*-\s*\\?\s*\d+px/,
    fix: "숫자 대신 calc\\(100vh[^']*\\) 처럼 «한도가 있는지» 만 보세요." },
  { id: '내부 변수 이름',
    re: /ref:_[A-Za-z]/,
    fix: 'ref:[A-Za-z_$][\\w$]*\\.ref 처럼 «손잡이가 달렸는지» 만 보세요.' }
];

/* 확인하는 줄만 본다 — 설명·안내 문구에 적힌 것은 잘못이 아니다.
   (실패했을 때 사람에게 보여 줄 예시 문장에도 같은 글자가 들어간다) */
function isAssertLine(l){
  return /\.test\(|assert\.|\.match\(|\.includes\(|\.indexOf\(/.test(l);
}

let pass = 0, fail = 0;
function t(name, got, want){
  const G = JSON.stringify(got), W = JSON.stringify(want);
  if(G === W){ pass++; console.log('  PASS ' + name + '  (' + G + ')'); }
  else { fail++; console.log('  FAIL ' + name + '\n    받음 ' + G + '\n    기대 ' + W); }
}

const found = [];
fs.readdirSync(DIR).filter(function(f){ return /\.test\.js$/.test(f); }).forEach(function(f){
  if(f === 'test-pin-guard.test.js') return;              // 이 파일의 «예시» 는 뺀다
  fs.readFileSync(path.join(DIR, f), 'utf8').split(/\r?\n/).forEach(function(l, i){
    const s = l.trim();
    if(s.startsWith('//') || s.startsWith('*') || s.startsWith('/*')) return;
    if(!isAssertLine(l)) return;
    if(l.indexOf('검사고정-허용') >= 0) return;            // 그럴 만한 까닭을 적어 둔 줄
    RULES.forEach(function(r){
      if(r.re.test(l)) found.push({ file:f, line:i + 1, rule:r, text:s.slice(0, 110) });
    });
  });
});

console.log('\n[검사가 「지금 값」이 아니라 「규칙」을 보고 있는가]');
if(found.length){
  console.log('\n  ── 아래 줄들이 바뀌기 쉬운 값을 글자 그대로 박아 두었습니다 ──');
  found.forEach(function(x){
    console.log('  · ' + x.file + ':' + x.line + '  [' + x.rule.id + ']');
    console.log('      ' + x.text);
    console.log('      → ' + x.rule.fix);
  });
  console.log('\n  ★ 그 값 «자체» 가 규칙이라면(세율 8.8% 처럼) 같은 줄에');
  console.log('    검사고정-허용 과 «왜 규칙인지» 를 적어 두세요.\n');
}
t('바뀌기 쉬운 값을 박아 둔 곳이 없다', found.length, 0);

/* ★ 이 검사가 실제로 «잡는지» 를 스스로 확인한다.
   안 잡히는 그물은 있으나 마나이고, 있는 줄 알아서 더 나쁘다. */
console.log('\n[이 검사가 실제로 잡는가]');
const SAMPLES = [
  ["assert.match(app, /<script src=\"js\\/x.js\\?v=2\"><\\/script>/);", '캐시 번호'],
  ["t('높이', /maxHeight:'calc\\(100vh - 340px\\)'/.test(src), true);", '화면 높이'],
  ["const b = FL.match(/h\\('div',\\{ref:_ldBoxRef/g);", '내부 변수 이름']
];
SAMPLES.forEach(function(pair){
  const hit = RULES.filter(function(r){ return r.re.test(pair[0]) && isAssertLine(pair[0]); });
  t('★ ' + pair[1] + ' 를 잡는다', hit.length > 0 && hit[0].id === pair[1], true);
});

console.log('\n[멀쩡한 검사를 잘못 잡지 않는다]');
/* 헛경고가 한 번이라도 나면 다음부터 아무도 안 본다 */
const OK = [
  ["assert.match(app, /<script src=\"js\\/x\\.js\\?v=\\d+\"><\\/script>/);", '번호를 안 박은 것'],
  ["t('한도가 있다', /maxHeight:\\(x\\.max \\|\\| 'calc\\(100vh[^']*\\)'\\)/.test(s), true);", '한도만 보는 것'],
  ["const b = s.match(/ref:[A-Za-z_$][\\w$]*\\.ref/g);", '이름을 안 박은 것'],
  ["// 옛 코드 maxHeight:'calc(100vh - 340px)' 를 지웠다", '설명 줄'],
  ["console.log('  <script src=\"js/a.js?v=1\"></script> 한 줄이면 됩니다');", '안내 문구'],
  ["t('세율', erpWithholdTax(900000,'misc',8.8).total, 79200);", '값 자체가 규칙인 것']
];
OK.forEach(function(pair){
  const s = pair[0].trim();
  const isComment = s.startsWith('//');
  const hit = (!isComment && isAssertLine(pair[0]) && pair[0].indexOf('검사고정-허용') < 0)
    ? RULES.filter(function(r){ return r.re.test(pair[0]); }) : [];
  t('★ ' + pair[1] + ' 은 안 잡는다', hit.length, 0);
});

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===\n');
process.exit(fail ? 1 : 0);
