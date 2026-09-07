/* 푸른통합시스템 — 경력관리 항목을 홈페이지 경력사항 문장으로
   기간이 끝났는지로 現/前 을 가른다. 기간을 모르면 끝났다고 단정하지 않는다 —
   멀쩡히 하고 있는 위촉을 前 으로 내려버리는 쪽이 더 나쁜 잘못이기 때문이다. */
(function (global) {
  'use strict';

  /* 문자열 전체가 통째로 날짜 모양일 때만 비교용 문자열로 바꾼다.
     실제 달력 날짜가 아니라 "지났는지"만 견주는 용도라서, 일/월을 안 적으면
     31일·12월로 채운다 — 2026-04 처럼 없는 날짜(2026-04-31)가 만들어질 수 있지만
     비교 방향(지났다/안 지났다)은 항상 맞다. */
  function readDate(str) {
    const s = String(str == null ? '' : str).trim();
    const m = s.match(/^(\d{4})[-.\/]?\s*(\d{1,2})?[-.\/]?\s*(\d{1,2})?\.?$/);
    if (!m) return '';
    const pad = function (n) { return n && n.length < 2 ? '0' + n : n; };
    return m[1] + '-' + (pad(m[2]) || '12') + '-' + (pad(m[3]) || '31');
  }

  /* 범위 표시(물결표 ~ ∼, 줄표 – —, "부터", "to", 공백을 낀 하이픈) 뒤에 오는
     날짜만 "끝나는 날"로 인정한다. 하이픈은 'YYYY-MM-DD' 같은 날짜 내부에도 쓰이므로,
     양쪽에 공백이 있을 때만 범위 표시로 본다 — 그래야 시작일 하나뿐인 표기
     (예: '2020-01-15')를 범위로 잘못 쪼개지 않는다. */
  function splitRange(period) {
    const m = String(period || '').match(/^(.*?)(?:~|∼|–|—|부터|\sto\s|\s-\s)(.*)$/);
    return m ? { left: m[1], right: m[2] } : null;
  }

  function endOf(item) {
    const src = item || {};

    // end 칸에 날짜가 있으면 그게 끝나는 날이 맞다. 날짜로 안 읽히면(예: '현재')
    // period 로 넘어간다 — end 가 있다고 period 를 아예 안 보면 안 된다.
    const endDate = readDate(src.end);
    if (endDate) return endDate;

    const period = String(src.period || '').trim();
    if (!period) return '';

    // period 만 있을 때: 범위 표시가 있고 그 뒤에 진짜 날짜가 올 때만 끝난 것으로 본다.
    // 범위 표시가 없으면(날짜 하나뿐) 그건 시작일이다 — 끝났다고 단정하지 않는다.
    const range = splitRange(period);
    if (!range) return '';
    return readDate(range.right);
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

  /* 공백 개수·앞뒤 공백·가운뎃점 표기 차이를 없애 같은 문구인지 견줄 수 있게 한다.
     위촉장류 문구는 "기관·직책" 처럼 가운뎃점으로 잇는 경우가 흔해서 필요하다. */
  function normalizeBody(s) {
    return String(s || '')
      .replace(/[·ㆍ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /* ══ 줄 앞의 한자를 다루는 «한 자리» (대표 지시 2026-09-03) ═══════════════
     「전, 현 한자를 선택해야할 경우가 많다 … 전현도 선택할 수 있게 해달라」

     ★ 왜 여기인가 — 現/前 규칙이 이 파일에 있다. 화면 쪽에 또 정규식을 쓰면
       둘이 갈라진다(한쪽은 앞 공백을 봐 주고 한쪽은 안 봐 주는 식으로).
     ★ 세 자리다: 'now'(現) · 'past'(前) · ''(없음).
       «없음»이 있어야 학력·자격증에 「現」을 억지로 붙이지 않는다.
     ⚠ 한자 뒤의 빈칸까지 «한 덩이»로 본다. 안 그러면 딱지를 켰다 끄면
       속글 앞에 빈칸이 하나 남고, 그 빈칸이 홈페이지 글로 그대로 나간다. */
  const ERA_LETTER = { now: '現', past: '前' };
  const ERA_HEAD = /^\s*(現|前)\s*/;

  function eraOf(line) {
    const m = ERA_HEAD.exec(String(line == null ? '' : line));
    return m ? (m[1] === '現' ? 'now' : 'past') : '';
  }
  function eraBody(line) {
    return String(line == null ? '' : line).replace(ERA_HEAD, '');
  }
  function withEra(line, era) {
    const body = eraBody(line);
    return ERA_LETTER[era] ? ERA_LETTER[era] + ' ' + body : body;
  }

  /* 홈페이지에 現 으로 올라가 있는 줄 중, 경력관리에서는 기간이 끝난 것을 찾는다.
     ★ 앞한자는 위 세 손잡이로만 본다 — 여기 정규식을 따로 쓰면 규칙이 둘로 갈라진다. */
  function expiredInLive(liveCareers, items, today) {
    const endedBodies = (items || [])
      .map(function (it) { return toLine(it, today); })
      .filter(function (r) { return r.ended; })
      .map(function (r) { return normalizeBody(eraBody(r.text)); });

    return (liveCareers || []).filter(function (line) {
      if (eraOf(line) !== 'now') return false;
      return endedBodies.indexOf(normalizeBody(eraBody(line))) !== -1;
    });
  }

  global.PuHomeCareer = { toLine: toLine, expiredInLive: expiredInLive,
    eraOf: eraOf, eraBody: eraBody, withEra: withEra };
})(typeof window !== 'undefined' ? window : globalThis);
