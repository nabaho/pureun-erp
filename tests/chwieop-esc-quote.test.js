/* 취업규칙 작성기 — 따옴표가 든 회사명에 칸이 깨지지 않는다 (2026-08-28)

   ★ 무슨 일이 있었나
     esc() 가 & < > 만 막고 «따옴표»는 안 막았다. 그런데 그 결과가
     <input value="…"> 안으로 들어간다(fld·fldDate).
     회사명에 「주식회사 "푸른"」 처럼 따옴표가 들어가면 그 자리에서 칸이 끊겨
     입력칸이 깨졌다. 더 나쁜 것은, 이 문서를 저장하면 다른 직원이 불러 여는데
     남이 심어 둔 글이 그 사람 화면에서 돌 수 있었다는 점이다.

   ★ 지키려는 것
     ① 따옴표가 들어와도 칸이 안 끊긴다
     ② 태그를 심어도 «글자»로 남는다
     ③ 멀쩡한 글자는 그대로 보인다 (지나치게 막아 한글·기호가 깨지면 안 된다)
     ④ 치환({회사명} 같은 것)이 여전히 맞는다 — 양쪽 다 같은 함수를 거쳐야 짝이 맞는다 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'chwieop.html'), 'utf8').split('\r\n').join('\n');

function grab(decl) {
  const i = src.indexOf(decl);
  if (i < 0) throw new Error('못 찾음: ' + decl);
  let d = 0, j = src.indexOf('{', i);
  for (; j < src.length; j++) {
    if (src[j] === '{') d++;
    else if (src[j] === '}') { d--; if (!d) { j++; break; } }
  }
  return src.slice(i, j);
}

const box = { console, String, Object };
box.window = box;
vm.createContext(box);
vm.runInContext(grab('function esc(s)') + '\n' + grab('function fld(label,key,val,ph)') + '\n' +
                ';this.esc = esc; this.fld = fld;', box);
const esc = box.esc, fld = box.fld;

let fail = 0, total = 0;
function ok(name, cond, hint) {
  total++;
  if (cond) { console.log('ok   ' + name); return; }
  fail++;
  console.log('FAIL ' + name + (hint ? '\n     → ' + hint : ''));
}

console.log('[① 따옴표가 들어와도 칸이 안 끊긴다]');
const 회사 = '주식회사 "푸른"';
const html = fld('회사명', 'company', 회사, '');
ok('큰따옴표가 글자로 바뀐다', esc(회사).indexOf('"') < 0, '지금: ' + esc(회사));
/* value="…" 안에 «날것 따옴표»가 하나도 없어야 칸이 안 끊긴다 */
const v = html.slice(html.indexOf('value="') + 7);
ok('value 칸이 따옴표에서 안 끊긴다', v.slice(0, v.indexOf('"')).indexOf('&quot;') >= 0,
   'value 안: ' + v.slice(0, 40));
ok('작은따옴표도 막는다', esc("이름'테스트").indexOf("'") < 0, '지금: ' + esc("이름'테스트"));

console.log('\n[② 태그를 심어도 글자로 남는다]');
const 공격 = '푸른" onfocus="alert(1)';
const h2 = fld('회사명', 'company', 공격, '');
/* ⚠ 「onfocus= 라는 글자가 있나」로 보면 안 된다 — 막아 놓은 결과에도 그 «글자»는 남는다
     (value="푸른&quot; onfocus=&quot;alert(1)"). 볼 것은 «칸이 끊겼나» 다:
     value=" 와 그 짝 " 사이에 날것 따옴표가 하나도 없어야 한다. */
const vStart = h2.indexOf('value="') + 7;
const inside = h2.slice(vStart, h2.indexOf('"', vStart));
ok('심은 글이 «칸 밖으로» 못 나간다', inside.indexOf('"') < 0 && inside.indexOf('onfocus=&quot;') >= 0,
   'value 안: ' + inside);
ok('<script> 도 글자로', esc('<script>x</script>').indexOf('<') < 0);

console.log('\n[③ 멀쩡한 글자는 그대로]');
ok('한글·괄호·가운뎃점은 안 건드린다',
   esc('푸른노무법인 (주) · 대표') === '푸른노무법인 (주) · 대표', '지금: ' + esc('푸른노무법인 (주) · 대표'));
ok('빈 값·null 도 안 죽는다', esc(null) === '' && esc(undefined) === '' && esc('') === '');
ok('& 를 두 번 바꾸지 않는다', esc('A&B') === 'A&amp;B', '지금: ' + esc('A&B'));

console.log('\n[④ 치환이 여전히 맞는다]');
/* applyMergeHtml 은 out=esc(text) 한 뒤 esc(k) 로 갈라 붙인다 —
   양쪽 다 같은 함수를 거치므로 짝이 맞아야 한다 */
ok('{회사명} 같은 자리표는 escape 해도 그대로', esc('{회사명}') === '{회사명}',
   '자리표가 바뀌면 치환이 통째로 안 먹는다');
ok('치환 짝이 맞는다',
   esc('앞 {회사명} 뒤').split(esc('{회사명}')).length === 2);

console.log('\n[⑤ 다른 화면도 같은 구멍이 있나]');
const OTHER = ['rules.html', 'kcareer.html'];
OTHER.forEach(function (f) {
  const p = path.join(__dirname, '..', f);
  if (!fs.existsSync(p)) return;
  const s = fs.readFileSync(p, 'utf8');
  /* value="' + 무언가esc( 꼴 — 따옴표 안 막는 함수를 속성에 쓰면 여기서 걸린다 */
  const bad = /value="'\s*\+\s*(esc|escapeH|_xesc)\s*\(/.test(s);
  ok(f + ' 은 속성 안에 따옴표 안 막는 함수를 안 쓴다', !bad,
     '쓰고 있으면 같은 방식으로 칸이 깨진다');
});

console.log('\n  === ' + (total - fail) + ' 통과 / ' + fail + ' 실패 ===');
process.exit(fail ? 1 : 0);
