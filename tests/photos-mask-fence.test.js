'use strict';
/* 사진첩 — 가림을 거치지 않고 판독기가 불리는 길 (울타리, 2026-08-17)
   실행: node --test tests/*.test.js

   급여데이터함에는 「판독기로 가는 길은 하나뿐」이라는 울타리가 있는데 사진첩에는
   없었다. 넓히다가 **실제로 새는 길**을 찾았다 — 아래 KNOWN_GAP 이 그것이다.
   이 검사는 그것을 고치라는 것이 아니라(그건 대표 결정이 필요하다),
   **새로운 길이 하나 더 생기는 것**을 막는다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const R = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');

/* 그 부르기가 들어 있는 함수 이름을 찾는다 — 위로 거슬러 올라가 가장 가까운
   `function 이름(` 을 집는다. */
function fnAround(src, at) {
  const head = src.lastIndexOf('\nfunction ', at);
  if (head < 0) return '(모름)';
  const m = src.slice(head + 1, head + 120).match(/^function\s+(\w+)/);
  return m ? m[1] : '(모름)';
}

function readerCallSites() {
  const out = [];
  const re = /PuDocRead\.read\w*\(/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const fn = fnAround(html, m.index);
    if (out.indexOf(fn) < 0) out.push(fn);
  }
  return out.sort();
}

/* ⚠ 여기가 **아는 채로 열어 둔 길**이다 — 대표 결정 2026-08-17 「이대로 감수한다」.
   · startRead — 사진을 **올리는 중** 대기열에서 자동으로 판독한다.
   · readPhoto — 격자에서 부를 때는 가린 사본(masked)만 읽지만, **대기열이 부를
     때는 masked 없이** 불린다(pumpRead).
   둘 다 가림 화면을 띄울 수 없는 자리다 — 서른 장을 줄 세워 놓고 한 장씩 물을 수
   없다. 그래서 **서류 사진에 찍힌 주민번호는 그대로 나간다.**
   안 고른 길 둘: ①서류 자동 판독을 끈다 ②기계가 찾아 자동으로 가리고 보낸다
   — ②는 기계가 손글씨를 거의 못 찾는데도 「가렸다」고 믿게 만들어, 「사람이 한 번
   본다」를 스스로 무너뜨린다.
   ⚠ 이 목록을 **늘리지 말 것.** 늘리는 것은 감수 범위를 말없이 넓히는 일이다 —
   새 길이 필요하면 대표께 다시 물어야 한다. */
const KNOWN_GAP = ['readPhoto', 'startRead'];

test('★ 사진첩에 판독기로 가는 길이 새로 생기지 않았다', () => {
  const sites = readerCallSites();
  const extra = sites.filter(n => KNOWN_GAP.indexOf(n) < 0);
  assert.deepEqual(extra, [],
    '★ 가림을 안 거치는 판독 길이 새로 생겼습니다: ' + extra.join(', ')
    + ' — 가린 사본만 읽게 하거나, 어쩔 수 없으면 KNOWN_GAP 에 **까닭과 함께** 적으세요');
});

/* 격자에서 사람이 「가리고 판독」을 누른 길은 **가린 사본만** 읽어야 한다.
   여기서 원본을 함께 실으면 가린 뜻이 통째로 없어진다. */
test('★ 가린 사본이 왔으면 원본을 함께 보내지 않는다', () => {
  const m = html.match(/function readPhoto\(id, masked\)[\s\S]*?\n\}/);
  assert.ok(m, 'readPhoto 를 찾을 수 없습니다');
  assert.match(m[0], /masked\s*\n?\s*\?\s*Promise\.resolve\(\[masked\]\)/,
    '★ 가린 사본이 있는데 원본도 함께 보내면 가린 뜻이 없습니다');
});

/* 가림 층을 싣지도 않으면 「가리고 판독」 자체가 없는 것이다. */
test('사진첩이 가림 층을 싣는다', () => {
  assert.match(html, /<script src="js\/pu-rrn-mask\.js\?v=\d+">/);
  assert.match(html, /<script src="js\/pu-rrn-mask-ui\.js\?v=\d+">/);
});
