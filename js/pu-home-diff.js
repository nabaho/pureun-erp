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

  // 이름이 같은 직원을 전부 찾는다. Array.find 로 첫 사람만 집으면
  // 동명이인 중 누가 진짜인지 확정 못 한 채 엉뚱한 사람의 퇴사일로 판단해버린다.
  function staffMatches(staff, name) {
    if (!Array.isArray(staff)) return [];
    const key = tidy(name);
    return staff.filter(function (s) { return tidy(s.name) === key; });
  }

  // 이름이 유일할 때만 그 사람으로 단정한다. 0명이면 못 찾은 것, 2명 이상이면 동명이인이라
  // 어느 쪽도 아니다 — 둘 다 null 로 두고, 동명이인 여부는 staffMatches 로 따로 확인한다.
  function staffOf(staff, name) {
    const matches = staffMatches(staff, name);
    return matches.length === 1 ? matches[0] : null;
  }

  function memberStatus(ours, live, staff, today) {
    const liveList = live || [];
    const liveBySrl = {};
    const liveSrlOrder = []; // 고유 srl 을 처음 나온 순서로만 기록 — liveOnly 중복 방지용
    liveList.forEach(function (m) {
      const srlKey = String(m.srl);
      // 홈페이지에 같은 글 번호가 두 번 나오면 첫 것만 쓴다.
      // 나중 것으로 덮으면 조용히 어긋나고, liveOnly 판정에서도 같은 번호가 두 번 뜬다.
      if (!Object.prototype.hasOwnProperty.call(liveBySrl, srlKey)) {
        liveBySrl[srlKey] = m;
        liveSrlOrder.push(srlKey);
      }
    });

    const out = (ours || []).map(function (m) {
      const key = String(m.key);
      const onLive = liveBySrl[key];
      const matches = staffMatches(staff, m.name);

      // 동명이인(2명 이상)이면 누가 진짜인지 확정할 수 없어 입·퇴사 판정을 하지 않는다.
      // 내용 대조(same/pending) 결과만 쓰고, 사람이 직접 가릴 수 있도록 사유에 남긴다.
      if (onLive && matches.length > 1) {
        if (signature(m) === signature(onLive)) {
          return { key: key, name: m.name, status: 'same', reason: '동명이인이 있어 입·퇴사 판단을 보류함' };
        }
        return { key: key, name: m.name, status: 'pending', reason: '내용이 다름 · 동명이인이 있어 입·퇴사 판단을 보류함' };
      }

      const person = matches.length === 1 ? matches[0] : null;

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
    liveSrlOrder.forEach(function (srlKey) {
      if (ourKeys.indexOf(srlKey) === -1) {
        const m = liveBySrl[srlKey];
        out.push({ key: srlKey, name: m.name, status: 'liveOnly', reason: '통합시스템에 없음' });
      }
    });

    return out;
  }

  // 홈페이지 쪽에서 같은 글 번호가 몇 번이나 겹쳤는지 알려준다.
  // memberStatus 는 첫 것만 쓰고 조용히 넘어가므로, 화면이 사람에게 보여줄 수 있도록 따로 둔다.
  function duplicateLiveKeys(live) {
    const seen = {};
    const dup = [];
    (live || []).forEach(function (m) {
      const key = String(m.srl);
      if (seen[key] === 1) {
        dup.push(key);
        seen[key] = 2; // 세 번 이상 겹쳐도 한 번만 보고한다
      } else if (!seen[key]) {
        seen[key] = 1;
      }
    });
    return dup;
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
    // 한 글자 이름은 아무 낱말 조각에나 걸려 오탐을 낸다. 한국 사람 이름은 보통 두 글자
    // 이상이니, 두 글자 미만이면 믿을 수 없는 훑기를 하지 않고 빈 결과를 돌려준다.
    if (needle.length < 2) return [];
    return (pages || []).map(function (p) {
      const hits = String(p.text || '').split(needle).length - 1;
      return { path: p.path, count: hits };
    }).filter(function (r) { return r.count > 0; });
  }

  global.PuHomeDiff = {
    memberStatus: memberStatus, pageStatus: pageStatus, isTrustworthy: isTrustworthy,
    nameLeftovers: nameLeftovers, signature: signature, duplicateLiveKeys: duplicateLiveKeys
  };
})(typeof window !== 'undefined' ? window : globalThis);
