#!/usr/bin/env node
/* 「푸른 포털」 홈 화면 아이콘 — icon-portal-192.png · icon-portal-512.png
   (대표 지시 2026-08-24 「디자인 바꿔줘 너무 촌스럽다」)

   ★ 무엇이 촌스러웠나 — 이모지 🏠 를 흰 바탕에 그대로 박아 둔 것이었다.
     푸른 ERP 본 아이콘(icon-192.png)은 「푸」 마크인데 포털만 이모지라,
     한 회사 아이콘 묶음 안에서 이것만 겉돌았다.

   ★ 무엇으로 바꿨나 — 같은 「푸」를 «뒤집어» 쓴다.
       본 아이콘 : 흰 바탕 + 짙은 푸른 글자
       포털 아이콘: 짙은 푸른 바탕 + 흰 글자
     한 식구인 것이 한눈에 보이면서, 나란히 놓여도 헷갈리지 않는다.

   ⚠ 「푸」는 ㅍ 와 ㅜ 라 자·모가 전부 «곧은 획» 이다. 그래서 글꼴 없이도
     반듯하게 그릴 수 있다(획 끝만 살짝 둥글린다). 이 저장소에 그림 라이브러리를
     들이지 않겠다는 규칙을 그대로 지킨다.
   ⚠ 바탕은 가장자리까지 채운다 — 기기가 동그라미로 잘라도 흰 귀퉁이가 안 생긴다.
   ⚠ 글자는 가운데 48% 안에만 둔다. 동그라미로 잘려도 획이 안 잘린다.

   고치려면 이 파일을 고치고 `node scripts/make-portal-icon.js` 를 다시 돌린다.
   (배포 때 scripts/ 는 통째로 빠지므로 인터넷에는 안 올라간다) */
'use strict';
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

/* ── PNG 로 묶기 (8비트 RGBA) ── */
function crc32(buf) {
  if (typeof zlib.crc32 === 'function') return zlib.crc32(buf) >>> 0;
  let c, n, k, t = [];
  for (n = 0; n < 256; n++) { c = n; for (k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0; }
  let r = 0xFFFFFFFF;
  for (n = 0; n < buf.length; n++) r = t[(r ^ buf[n]) & 0xFF] ^ (r >>> 8);
  return (r ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}
function toPng(size, pixelAt) {
  const stride = size * 4 + 1;                 // 줄마다 앞에 「거르개 없음(0)」 한 바이트
  const raw = Buffer.alloc(size * stride);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const c = pixelAt(x, y), o = y * stride + 1 + x * 4;
      raw[o] = c[0]; raw[o + 1] = c[1]; raw[o + 2] = c[2]; raw[o + 3] = c[3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;                    // 8비트 · RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ── 색 — manifest 의 theme_color(#1e3a8a)에서 브랜드 파랑(#2563eb)으로 ── */
const BG_TOP = [0x1e, 0x3a, 0x8a];
const BG_BOT = [0x25, 0x63, 0xeb];
const INK    = [255, 255, 255];

/* 둥근 네모 한 획 */
function bar(x0, y0, x1, y1, r) {
  return function (u, v) {
    if (u < x0 || u > x1 || v < y0 || v > y1) return false;
    const rr = Math.min(r, (x1 - x0) / 2, (y1 - y0) / 2);
    const cx = Math.min(Math.max(u, x0 + rr), x1 - rr);
    const cy = Math.min(Math.max(v, y0 + rr), y1 - rr);
    const dx = u - cx, dy = v - cy;
    return dx * dx + dy * dy <= rr * rr;
  };
}

function draw(size) {
  const S = 4;                                  // 한 칸을 4×4 로 훑어 계단을 없앤다

  /* 글자 자리 — 가운데 48%. 동그라미로 잘려도 안 잘리는 안쪽이다. */
  const L = .272, R = .728;                     // 글자 좌우
  const W = .048;                               // 획 굵기
  const r = .019;                               // 획 끝 둥글리기
  const IN = .082;                              // ㅍ 세로획을 가장자리에서 얼마나 들이나

  /* ㅍ — 위·아래 가로획 사이에 세로획 둘.
     ⚠ 세로획을 너무 안쪽에 두면 «H» 처럼 보인다. 가로획을 셋으로 나눈 자리에 세운다. */
  const P_TOP = .250, P_BOT = .492;
  const strokes = [
    bar(L, P_TOP, R, P_TOP + W, r),                            // ㅍ 윗 가로
    bar(L, P_BOT - W, R, P_BOT, r),                            // ㅍ 아랫 가로
    bar(L + IN, P_TOP + W * .55, L + IN + W, P_BOT - W * .55, r),   // ㅍ 왼 세로
    bar(R - IN - W, P_TOP + W * .55, R - IN, P_BOT - W * .55, r),   // ㅍ 오른 세로
    /* ㅜ — 가로획 하나에 가운데서 내려긋는 기둥.
       기둥은 가로획보다 살짝 굵게 둔다 — 그래야 아래가 안 허전하다. */
    bar(L, .597, R, .597 + W, r),                              // ㅜ 가로
    bar(.5 - W * .56, .597 + W * .55, .5 + W * .56, .762, r),  // ㅜ 기둥
  ];

  function isInk(u, v) {
    for (let i = 0; i < strokes.length; i++) if (strokes[i](u, v)) return true;
    return false;
  }

  return function (x, y) {
    let R_ = 0, G_ = 0, B_ = 0;
    for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
      const u = (x + (sx + .5) / S) / size, v = (y + (sy + .5) / S) / size;
      /* 바탕은 위→아래 기울기. 오른쪽 위를 아주 살짝 밝혀 평평해 보이지 않게 한다. */
      const t = Math.min(1, Math.max(0, v * .86 + (1 - u) * .14));
      const bg = [0, 1, 2].map(i => Math.round(BG_TOP[i] + (BG_BOT[i] - BG_TOP[i]) * t));
      const c = isInk(u, v) ? INK : bg;
      R_ += c[0]; G_ += c[1]; B_ += c[2];
    }
    const n = S * S;
    return [Math.round(R_ / n), Math.round(G_ / n), Math.round(B_ / n), 255];
  };
}

const ROOT = path.join(__dirname, '..');
[192, 512].forEach(function (size) {
  const out = path.join(ROOT, 'icon-portal-' + size + '.png');
  fs.writeFileSync(out, toPng(size, draw(size)));
  console.log('만듦:', path.basename(out), fs.statSync(out).size, 'bytes');
});
