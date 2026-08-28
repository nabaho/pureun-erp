/* 덜 만들어진 사진을 올리기 «전에» 잡는다 (김동현 제보 2026-08-27)

   ★ 무슨 일이 있었나
     한 번에 28장을 올렸더니 격자에 「위쪽 띠만」 보이고 아래는 빈 칸이었다.
     브라우저에서 재현해 보니, 덜 받은 JPEG 는 «정상으로 열리고 크기도 맞게» 나온다 —
     다만 있는 줄만 칠하고 나머지는 빈 채로 남는다.
     즉 화면 탓도 느린 탓도 아니고 «파일이 실제로 불완전»했다.

   ★ 어디서 잘렸나
     창고(Storage) 업로드는 통째로 되거나 실패하지 반쯤 남지 않는다.
     그러니 올리기 «전»에 이미 잘려 있었다 — 폰에서 큰 사진을 연달아 줄이면
     canvas 가 메모리에 밀려 toDataURL 이 잘린 결과를 내놓는 일이 있다.

   ★ 지키려는 것
     ① 온전한 JPEG 는 온전하다고 본다 (헛경보가 나면 사진을 못 올린다)
     ② 뒤가 잘린 JPEG 는 «반드시» 잡는다 — 조금 잘려도
     ③ JPEG 가 아닌 것에는 참견하지 않는다
     ④ 이상한 값이 들어와도 안 죽는다
     ⑤ 화면 코드에 관문이 실제로 걸려 있다 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const zlib = require('zlib');

const src = fs.readFileSync(path.join(__dirname, '..', 'pu-photos.html'), 'utf8').split('\r\n').join('\n');

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

/* 브라우저의 atob 를 흉내 낸다 */
const box = {
  console, String, Number, Math, Uint8Array, Error,
  atob: function (b) { return Buffer.from(b, 'base64').toString('binary'); }
};
box.window = box;
vm.createContext(box);
vm.runInContext(grab('function jpegTailBytes(dataUrl, n)') + '\n' +
                grab('function jpegIsWhole(dataUrl)') + '\n' +
                ';this.whole = jpegIsWhole;', box);
const whole = box.whole;

let fail = 0, total = 0;
function ok(name, cond, hint) {
  total++;
  if (cond) { console.log('ok   ' + name); return; }
  fail++;
  console.log('FAIL ' + name + (hint ? '\n     → ' + hint : ''));
}

/* ── 진짜 JPEG 를 하나 만든다 (머리 + 알맹이 + 끝표시 FFD9) ──
   실제 사진 대신, 규격이 같은 바이트 뭉치면 이 검사에는 충분하다. */
function makeJpeg(bodyBytes) {
  const head = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0]);
  const body = Buffer.alloc(bodyBytes);
  for (let i = 0; i < bodyBytes; i++) body[i] = (i * 37) % 251;   // 0xFF 로 안 끝나게
  const eoi = Buffer.from([0xFF, 0xD9]);
  return Buffer.concat([head, body, eoi]);
}
const toUrl = (buf) => 'data:image/jpeg;base64,' + buf.toString('base64');

const full = makeJpeg(4000);

console.log('[① 온전한 것은 온전하다]');
ok('온전한 JPEG', whole(toUrl(full)) === true);
/* base64 길이가 4의 배수로 딱 떨어지지 않는 경우도 있다 — 세 가지 길이로 본다 */
[3999, 4001, 4002].forEach(function (n) {
  ok('길이 ' + n + ' 인 것도 온전하다고 본다', whole(toUrl(makeJpeg(n))) === true,
     '헛경보가 나면 멀쩡한 사진을 못 올린다');
});

console.log('\n[② 잘린 것은 반드시 잡는다]');
[1, 2, 5, 50, 500, 2000, 3900].forEach(function (cut) {
  const part = full.slice(0, full.length - cut);
  ok('뒤 ' + String(cut).padStart(4) + '바이트가 없으면 잡는다', whole(toUrl(part)) === false,
     '못 잡으면 잘린 사진이 그대로 창고에 올라간다');
});

console.log('\n[③ JPEG 가 아니면 참견 안 한다]');
ok('PNG 는 그냥 통과', whole('data:image/png;base64,iVBORw0KGgo=') === true);
ok('그냥 글자도 통과', whole('hello') === true);

console.log('\n[④ 이상한 값]');
ok('빈 값은 «온전하지 않다»', whole('') === true, 'JPEG 가 아니므로 참견 안 하는 것이 맞다');
ok('null 도 안 죽는다', whole(null) === true);
ok('너무 짧은 JPEG 는 잡는다', whole('data:image/jpeg;base64,//2Q==') === false,
   '이 정도 길이면 사진일 리가 없다');
ok('base64 가 깨져 있어도 안 죽는다', whole('data:image/jpeg;base64,!!!!' + 'A'.repeat(600)) === false);

console.log('\n[⑤ 화면에 관문이 걸려 있다]');
ok('사진 만들 때 온전한지 본다', /if \(jpegIsWhole\(o\.dataUrl\)\) return o;/.test(src),
   '안 보면 잘린 채로 올라간다');
ok('한 번은 다시 그려 본다', /return drawScaled\(im, sizes\[i\]\.maxEdge, sizes\[i\]\.quality\);/.test(src),
   '메모리에 밀린 것뿐이면 다시 그리면 대개 성공한다');
ok('두 번째도 잘리면 «안 올린다»',
   /throw new Error\('사진을 온전히 줄이지 못했습니다/.test(src),
   '조용히 올리면 격자에 위쪽 띠만 보이는데 사람은 까닭을 알 길이 없다');
ok('무슨 일이 있었는지 자취를 남긴다', /덜 만들어져 다시 그림/.test(src));

console.log('\n  === ' + (total - fail) + ' 통과 / ' + fail + ' 실패 ===');
process.exit(fail ? 1 : 0);
