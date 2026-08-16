/* 푸른통합시스템 — 경력관리 항목을 홈페이지 경력사항 문장으로
   기간이 끝났는지로 現/前 을 가른다. 기간을 모르면 끝났다고 단정하지 않는다 —
   멀쩡히 하고 있는 위촉을 前 으로 내려버리는 쪽이 더 나쁜 잘못이기 때문이다. */
(function (global) {
  'use strict';

  function endOf(item) {
    const raw = (item && (item.end || item.period)) || '';
    const m = String(raw).match(/(\d{4})[-.\/]?(\d{2})?[-.\/]?(\d{2})?\s*$/);
    if (!m) return '';
    return m[1] + '-' + (m[2] || '12') + '-' + (m[3] || '31');
  }

  function toLine(item, today) {
    const src = item || {};
    const words = [src.org, src.role, src.title].map(function (v) {
      return String(v || '').trim();
    }).filter(Boolean);
    const body = words.join(' ').replace(/\s+/g, ' ').trim();

    const end = endOf(src);
    const unknown = !end;
    const ended = !!end && end < String(today);

    return { text: (ended ? '前 ' : '現 ') + body, ended: ended, unknown: unknown };
  }

  /* 홈페이지에 現 으로 올라가 있는 줄 중, 경력관리에서는 기간이 끝난 것을 찾는다. */
  function expiredInLive(liveCareers, items, today) {
    const endedBodies = (items || [])
      .map(function (it) { return toLine(it, today); })
      .filter(function (r) { return r.ended; })
      .map(function (r) { return r.text.replace(/^前\s*/, ''); });

    return (liveCareers || []).filter(function (line) {
      if (!/^現/.test(line)) return false;
      const body = line.replace(/^現\s*/, '');
      return endedBodies.indexOf(body) !== -1;
    });
  }

  global.PuHomeCareer = { toLine: toLine, expiredInLive: expiredInLive };
})(typeof window !== 'undefined' ? window : globalThis);
