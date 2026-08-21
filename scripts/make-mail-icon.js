#!/usr/bin/env node
/* 「푸른 메일」 홈 화면 아이콘을 만든다 — icon-mail-192.png · icon-mail-512.png

   왜 따로 그리나 — 바탕화면에 아이콘을 하나 더 두는 목적이 「한눈에 찾기」인데,
   기존 icon-192.png(푸른 ERP)를 그대로 쓰면 아이콘 두 개가 똑같이 생긴다.
   그러면 아이콘을 나눈 값어치가 사라진다.

   왜 손으로 PNG 를 짜나 — 이 저장소에는 그림 라이브러리가 없다(넣고 싶지도 않다).
   PNG 는 「길이+종류+자료+CRC」 덩어리를 이어 붙인 것뿐이라 zlib 하나로 충분하다.

   고침이 필요하면 이 파일을 고치고 `node scripts/make-mail-icon.js` 를 다시 돌린다.
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

/* ── 무엇을 그리나 ──
   ⚠ purpose:"any maskable" 로 쓸 것이라 바탕은 «가장자리까지» 채운다.
     기기가 동그라미·네모 어떤 모양으로 잘라도 흰 귀퉁이가 안 생긴다.
   ⚠ 봉투는 안쪽 80%(안전 구역) 안에만 그린다 — 잘려도 안 잘리게. */
const BG_TOP = [30, 64, 175];      // #1e40af — 즐겨찾기 손잡이와 같은 파랑
const BG_BOT = [37, 99, 235];      // #2563eb
const WHITE = [255, 255, 255];

function draw(size) {
  const S = 3;                                  // 한 칸을 3×3 으로 훑어 계단을 없앤다
  const rect = { x0: .20, x1: .80, y0: .30, y1: .70, r: .035 };
  const line = .030;                            // 봉투 덮개 선 굵기(비율)

  function inRounded(u, v) {
    if (u < rect.x0 || u > rect.x1 || v < rect.y0 || v > rect.y1) return false;
    const r = rect.r;
    const cx = Math.min(Math.max(u, rect.x0 + r), rect.x1 - r);
    const cy = Math.min(Math.max(v, rect.y0 + r), rect.y1 - r);
    const dx = u - cx, dy = v - cy;
    return dx * dx + dy * dy <= r * r;
  }
  /* 덮개 — 왼쪽 위에서 가운데 아래로, 다시 오른쪽 위로 내려긋는 V */
  function onFlap(u, v) {
    const mx = (rect.x0 + rect.x1) / 2, my = rect.y0 + (rect.y1 - rect.y0) * .62;
    function near(ax, ay, bx, by) {
      const dx = bx - ax, dy = by - ay;
      let t = ((u - ax) * dx + (v - ay) * dy) / (dx * dx + dy * dy);
      t = Math.min(1, Math.max(0, t));
      const px = ax + dx * t - u, py = ay + dy * t - v;
      return Math.sqrt(px * px + py * py) <= line / 2;
    }
    return near(rect.x0, rect.y0, mx, my) || near(mx, my, rect.x1, rect.y0);
  }

  return function (x, y) {
    let r = 0, g = 0, b = 0;
    for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
      const u = (x + (sx + .5) / S) / size, v = (y + (sy + .5) / S) / size;
      const bg = [0, 1, 2].map(i => Math.round(BG_TOP[i] + (BG_BOT[i] - BG_TOP[i]) * v));
      let c = bg;
      if (inRounded(u, v)) c = onFlap(u, v) ? bg : WHITE;
      r += c[0]; g += c[1]; b += c[2];
    }
    const n = S * S;
    return [Math.round(r / n), Math.round(g / n), Math.round(b / n), 255];
  };
}

const ROOT = path.join(__dirname, '..');
[192, 512].forEach(function (size) {
  const out = path.join(ROOT, 'icon-mail-' + size + '.png');
  fs.writeFileSync(out, toPng(size, draw(size)));
  console.log('만듦:', path.basename(out), fs.statSync(out).size, 'bytes');
});
