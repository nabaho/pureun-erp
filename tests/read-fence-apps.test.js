'use strict';
/* 판독으로 나가는 길 — **모든 화면**을 훑는 울타리 (대표 지시 2026-08-17 ②)
   실행: node --test tests/*.test.js · 목업 docs/mockups/read-fence-wide.html

   ⚠ 왜 이 검사가 생겼나: 울타리가 급여데이터함·사진첩 **두 앱만** 지키고 있었다.
     그 사이로 자문관리가 판독을 붙였는데 **아무도 몰랐다.** 다른 방에서 들어온 것을
     훑다가 찾았다. 앱마다 따로 지키면 새 앱은 늘 빠진다 — 그래서 여기서 통째로 훑는다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const R = path.join(__dirname, '..');

/* 저장소 뿌리의 화면들만 본다(참고용·목업 폴더는 뺀다). */
function appFiles() {
  return fs.readdirSync(R)
    .filter(f => f.endsWith('.html'))
    .map(f => ({ name: f, src: fs.readFileSync(path.join(R, f), 'utf8') }));
}

const loadsReader = a => /<script[^>]+src="js\/pu-doc-read\.js/.test(a.src);
const loadsMasker = a => /<script[^>]+src="js\/pu-rrn-mask\.js/.test(a.src);

/* ⚠ **아는 채로 열어 둔 화면.** 늘리는 것은 감수 범위를 말없이 넓히는 일이라
   대표께 물어야 한다.
   · gov-consulting.html — 정부포털 사업장 정보 캡처를 **사진 그대로** 보낸다.
     가림 창도, 판독 층 문지기도 없다(문지기는 글자용이라 사진에는 안 걸린다).
     **대표 결정 2026-08-17: 「그대로 감수한다」**(넷 중 1번).
     안 고른 길: ②가림 창 붙이기 ③기계가 자동으로 가리기 ④판독 끄기.
     ⚠ 이 목록을 **늘리지 말 것.** 늘리는 것은 감수 범위를 말없이 넓히는 일이다 —
     새 화면이 필요하면 대표께 다시 물어야 한다. */
const KNOWN_OPEN = ['gov-consulting.html'];

test('★ 판독 층을 실은 화면은 가림 층도 싣는다', () => {
  const bad = appFiles().filter(a => loadsReader(a) && !loadsMasker(a)).map(a => a.name);
  const extra = bad.filter(n => KNOWN_OPEN.indexOf(n) < 0);
  assert.deepEqual(extra, [],
    '★ 판독은 하는데 주민번호 지우개가 없는 화면이 새로 생겼습니다: ' + extra.join(', ')
    + ' — js/pu-rrn-mask.js 를 함께 싣거나, 어쩔 수 없으면 KNOWN_OPEN 에 **까닭과 함께** 적으세요');
});

/* 아는 구멍이 메워졌는데 목록에 남아 있으면, 다음 사람이 「여기는 원래 여는 데」로
   읽고 또 연다. 메워졌으면 목록에서 빼라고 알린다. */
test('아는 구멍이 메워지면 목록에서 빼라고 알린다', () => {
  const apps = appFiles();
  const stale = KNOWN_OPEN.filter(n => {
    const a = apps.filter(x => x.name === n)[0];
    return !a || !loadsReader(a) || loadsMasker(a);
  });
  assert.deepEqual(stale, [],
    '이 화면들은 이제 지켜집니다 — KNOWN_OPEN 에서 빼 주세요: ' + stale.join(', '));
});

/* ══════ 판독기를 부르는 곳 ══════ */

/* 사진을 안 보내는 것들 — 이 이름만 울타리 밖에서 불러도 된다.
   ⚠ 이름을 **늘어놓고 막지 않는다.** 여기 없는 것은 전부 새는 길로 본다 —
     판독 함수를 새로 만들면 이 검사가 먼저 깨진다. 그것이 의도다. */
const SAFE = ['init', 'bizNoDigits', 'bizNoValid', 'fmtBizNo', 'mapTo', 'keysFrom',
  'MODELS', 'PROMPTS', 'READ_VERSION', 'PROMPT_VERSION', 'autoOk',
  /* healRead 는 밖으로 안 보낸다 — 이미 읽어 온 답을 손보는 계산뿐이다 */
  'healRead',
  /* APP_KO 는 «이름표 표»다(2026-09-08) — 앱 이름을 한국말로 옮기는 사전뿐이고
     사진도 글도 어디로 안 보낸다. 앱별 판독 셈을 화면에 「사진첩 184」로 적는 데 쓴다.
     ⚠ 이 표를 화면 쪽에 두면 안 된다 — 사진첩 화면에 다른 앱 이름을 글자로 적으면
       「다른 앱의 클라우드 루트를 건드리지 않는다」가 걸린다(그 검사가 옳다). */
  'APP_KO'];

/* 그 앱에서 판독기를 부르는 것이 허락된 자리. 각 앱의 울타리 검사가 따로 지킨다. */
const GATED = {
  'pu-paydata.html': ['runRead', 'runSheetRead', 'readOneSum'],
  'pu-photos.html': ['startRead', 'readPhoto', 'imgChunkMakers', 'readDocChunked',
    'runReadChunks', 'textChunkMakers'],
  'gov-consulting.html': ['refCapRead'],      // 아는 채로 열어 둔 곳(KNOWN_OPEN)
  /* 경력관리 — 위촉장·자격증·경력증명서를 읽는다(대표 지시 2026-09-06 「사진첩 판독기로 바꿔라」).
     ⚠ 부르는 자리는 _kcReader 하나뿐이다. 이 층을 다른 곳에서 또 부르면 여기서 걸린다 —
       그래야 «사진이 어디로 나가는지»를 한 자리에서 볼 수 있다. */
  'kcareer.html': ['_kcReader']
};

function fnAround(src, at) {
  const head = src.lastIndexOf('\nfunction ', at);
  if (head < 0) return '(모름)';
  const m = src.slice(head + 1, head + 120).match(/^function\s+(\w+)/);
  return m ? m[1] : '(모름)';
}

test('★ 판독기를 부르는 자리가 앱마다 정해진 곳뿐이다', () => {
  const bad = [];
  appFiles().forEach(a => {
    const re = /PuDocRead\.(\w+)/g;
    let m;
    while ((m = re.exec(a.src)) !== null) {
      if (SAFE.indexOf(m[1]) >= 0) continue;
      const fn = fnAround(a.src, m.index);
      const ok = GATED[a.name] || [];
      if (ok.indexOf(fn) < 0) bad.push(a.name + ' : ' + fn + ' → PuDocRead.' + m[1]);
    }
  });
  assert.deepEqual(bad, [],
    '★ 판독기를 부르는 새 길이 생겼습니다: ' + bad.join(' / ')
    + ' — 가림을 거치게 하거나, 사진을 안 보내는 것이면 SAFE 에 이름을 더하세요');
});

/* ══════ 글자 길의 문지기 ══════ */

/* ⚠ 예전에는 `if (RM && RM.maskRrnInText)` 라 **지우개가 없으면 안 지우고 그냥
   보냈다** — 오류도 없고 아무 말도 없었다. 조용히 새는 것보다 시끄럽게 멈추는
   편이 낫다(대표 지시 2026-08-17). */
test('★ 지우개가 없으면 글자 판독을 막는다 — 그냥 보내지 않는다', () => {
  const src = fs.readFileSync(path.join(R, 'js', 'pu-doc-read.js'), 'utf8');
  assert.match(src, /function rrnScrub\(body\)/, '지우개 판정이 한 곳에 없습니다');
  assert.match(src, /if \(!RM \|\| !RM\.maskRrnInText\) return null/,
    '★ 지우개가 없을 때 막지 않습니다');
  assert.equal(/if \(RM && RM\.maskRrnInText\) body =/.test(src), false,
    '★ 「없으면 통과」가 남아 있습니다 — 그러면 조용히 새 나갑니다');
  /* 막았으면 **까닭을 말해야** 한다 — 아무 말 없이 실패하면 왜 안 되는지 모른다. */
  assert.match(src, /NO_SCRUB/, '막은 까닭을 안 알립니다');
  assert.match(src, /가림 층을 실어 주세요/, '어떻게 고치는지가 없으면 알려도 소용없습니다');
});

test('★ 글자를 보내는 길이 모두 그 문지기를 거친다', () => {
  const src = fs.readFileSync(path.join(R, 'js', 'pu-doc-read.js'), 'utf8');
  ['readTableText', 'readDocText'].forEach(fn => {
    const m = src.match(new RegExp('function ' + fn + '\\([\\s\\S]*?\\n  \\}'));
    assert.ok(m, fn + ' 을 찾을 수 없습니다');
    assert.match(m[0], /rrnScrub\(body\)/, fn + ' 이 문지기를 안 거칩니다');
    assert.match(m[0], /body === null/, fn + ' 이 막힌 것을 안 봅니다');
  });
});
