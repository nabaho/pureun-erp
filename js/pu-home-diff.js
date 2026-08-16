/* 푸른통합시스템 — 홈페이지 대조와 딱지 판정
   우리 자료와 홈페이지를 견주고, 푸른ERP 입·퇴사를 얹어 딱지를 정한다.
   판단만 한다. 고치지 않는다. */
(function (global) {
  'use strict';

  const tidy = (global.PuHomeParse && global.PuHomeParse.tidy) || function (s) {
    return String(s || '').replace(/\s+/g, ' ').trim();
  };

  function signature(m) {
    return [
      tidy(m.name), tidy(m.position1), tidy(m.position2),
      (m.careers || []).map(tidy).filter(Boolean).join('\n')
    ].join('');
  }

  function staffOf(staff, name) {
    if (!Array.isArray(staff)) return null;
    return staff.find(function (s) { return tidy(s.name) === tidy(name); }) || null;
  }

  function memberStatus(ours, live, staff, today) {
    const liveList = live || [];
    const liveBySrl = {};
    liveList.forEach(function (m) { liveBySrl[String(m.srl)] = m; });

    const out = (ours || []).map(function (m) {
      const key = String(m.key);
      const onLive = liveBySrl[key];
      const person = staffOf(staff, m.name);

      // 퇴사일이 지났는데 홈페이지에 아직 있으면 내릴 것
      if (onLive && person && person.leftAt && String(person.leftAt) < String(today)) {
        return { key: key, name: m.name, status: 'toRemove', reason: '퇴사일 ' + person.leftAt };
      }
      if (!onLive) return { key: key, name: m.name, status: 'toAdd', reason: '홈페이지에 없음' };
      if (signature(m) === signature(onLive)) {
        return { key: key, name: m.name, status: 'same', reason: '' };
      }
      return { key: key, name: m.name, status: 'pending', reason: '내용이 다름' };
    });

    const ourKeys = (ours || []).map(function (m) { return String(m.key); });
    liveList.forEach(function (m) {
      if (ourKeys.indexOf(String(m.srl)) === -1) {
        out.push({ key: String(m.srl), name: m.name, status: 'liveOnly', reason: '통합시스템에 없음' });
      }
    });

    return out;
  }

  /* 읽어낸 결과를 믿어도 되는지. 0명이면 사람이 사라진 게 아니라 화면 구조가 바뀐 것이다.
     이걸 안 물으면 구조가 바뀐 날 아홉 명이 전부 「안 올라감」으로 뜬다. */
  function isTrustworthy(live) {
    return Array.isArray(live) && live.length > 0;
  }

  /* 쪽 대조. 못 읽은 쪽은 'unknown' 으로 둔다 —
     읽기에 실패한 것을 「안 올라감」으로 몰면 멀쩡한 쪽을 다시 붙여넣게 된다. */
  function pageStatus(ourPages, livePages) {
    const live = livePages || {};
    return Object.keys(ourPages || {}).map(function (path) {
      const mine = tidy((ourPages[path] || {}).text);
      if (typeof live[path] !== 'string') return { path: path, status: 'unknown' };
      return { path: path, status: tidy(live[path]) === mine ? 'same' : 'pending' };
    });
  }

  /* 이름이 다른 쪽 본문에 남아 있는지 훑는다. 동명이인이 있을 수 있어 알리기만 한다. */
  function nameLeftovers(name, pages) {
    const needle = tidy(name);
    if (!needle) return [];
    return (pages || []).map(function (p) {
      const hits = String(p.text || '').split(needle).length - 1;
      return { path: p.path, count: hits };
    }).filter(function (r) { return r.count > 0; });
  }

  global.PuHomeDiff = {
    memberStatus: memberStatus, pageStatus: pageStatus, isTrustworthy: isTrustworthy,
    nameLeftovers: nameLeftovers, signature: signature
  };
})(typeof window !== 'undefined' ? window : globalThis);
