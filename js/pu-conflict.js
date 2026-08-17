/* 푸른통합시스템 — 동시 편집 판단 층
   두 사람이 같은 것을 동시에 고쳤는지 **판단하는 유일한 파일**이다.
   화면은 이 파일에 물어보고, 문구를 받아 그대로 띄운다.

   ⚠ 왜 따로 뺐나
   이 판단이 계약관리 화면 안에만 있었다. 그래서 업체·사건·컨설팅·급여에서
   같은 칸을 두 사람이 동시에 고치면 **나중 사람이 이기고 앞사람 것은 말없이
   사라졌다.** 화면마다 베껴 넣으면 한 곳만 고쳐지고 나머지는 또 뒤처진다.

   ⚠ 판단의 재료는 두 개뿐
   · stored — 지금 저장돼 있는 것(다른 사람이 바꿨을 수 있다)
   · mine   — 내가 화면에 띄웠던 것 + 내가 고친 것
   내가 화면을 띄운 시각은 mine.updatedAt 이다. 저장할 때 새 시각이 찍히므로,
   저장 직전의 mine.updatedAt 은 "내가 읽어온 판(版)"을 가리킨다.

   ⚠ 모르면 경고하지 않는다
   시각을 모르는 옛 자료까지 경고하면 사람이 매번 경고를 보고 무시하게 된다.
   그러면 정작 진짜 충돌 때도 그냥 넘긴다 — 경고가 없는 것보다 나쁘다. */
(function (global) {
  'use strict';

  function str(v) { return v == null ? '' : String(v); }

  /* 저장 시각을 읽는다 — 숫자(1755...)든 글자('2026-08-15T...')든 둘 다 받는다.
     ⚠ 왜 둘 다인가
     레코드 대부분은 _recStamp 가 Date.now() 숫자를 찍지만, 상담일지·업무일지처럼
     화면이 제 손으로 new Date().toISOString() 글자를 넣는 자리가 여럿 있다.
     숫자만 읽으면 그런 자리에서는 «시각을 모른다» 로 보여 겹침 판단이 통째로 꺼진다 —
     경고가 안 뜨는 게 아니라 «있는 줄 알았는데 없었다». 조용한 구멍이 가장 나쁘다.
     둘 다 밀리초로 바꾸면 서로 견줄 수 있다. */
  function ts(v) {
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    if (typeof v === 'string' && v) {
      var t = Date.parse(v);
      return isFinite(t) ? t : 0;
    }
    return 0;
  }

  /* 두 판을 견주어 다른 칸 이름을 뽑는다.
     무엇과 견주느냐로 뜻이 달라진다 — 그 구분은 check 가 한다. */
  function diffFields(stored, mine, labels) {
    var a = stored || {}, b = mine || {}, out = [];
    var seen = {};
    var skip = { updatedAt: 1, updatedBy: 1, id: 1 };
    [a, b].forEach(function (o) {
      Object.keys(o).forEach(function (k) {
        if (seen[k] || skip[k]) return;
        seen[k] = 1;
        var av, bv;
        try { av = JSON.stringify(a[k]); bv = JSON.stringify(b[k]); } catch (e) { return; }
        if (av === bv) return;
        var label = labels && labels[k];
        if (label) out.push(label);          // 이름 모르는 칸은 넣지 않는다(영문 코드 노출 금지)
      });
    });
    return out;
  }

  /* 겹쳤나? 겹쳤으면 { who, at, diff, sure }, 아니면 null.
     opts.myName — 나. 내가 방금 고친 것이면 경고하지 않는다(내 것을 남의 것처럼
                   알리면 사람이 놀라고, 다음부터 경고를 안 믿는다).
     opts.labels — 칸 이름표. 없으면 칸 목록을 말하지 않는다.
     opts.base   — **내가 화면에 띄웠을 때의 판**(내가 고치기 전). 있으면 다른 칸이
                   곧 '그분이 고친 칸'이라 정확히 말할 수 있다(sure=true).
                   없으면 내가 고친 칸이 섞이므로 '서로 다른 칸'이라고만 한다. */
  function check(stored, mine, opts) {
    opts = opts || {};
    if (!stored || !mine) return null;                  // 새로 만드는 것 — 겹칠 상대가 없다
    var theirs = ts(stored.updatedAt);
    var readAt = ts(mine.updatedAt);
    if (!theirs || !readAt) return null;                // 시각을 모른다 → 지어내지 않는다
    if (theirs <= readAt) return null;                  // 내가 읽어온 뒤로 바뀌지 않았다
    var who = str(stored.updatedBy);
    var me = str(opts.myName);
    if (who && me && who === me) return null;           // 내가 고친 것이다
    var sure = !!opts.base;
    return {
      who: who, at: theirs, sure: sure,
      diff: diffFields(stored, sure ? opts.base : mine, opts.labels)
    };
  }

  /* 을/를 가리기. '업체을(를)' 처럼 괄호를 달아 두면 사람이 읽다 걸린다.
     한글 한 글자의 받침 유무로 고른다(마지막 글자가 한글이 아니면 '를'). */
  function eulReul(word) {
    var w = str(word);
    if (!w) return '를';
    var c = w.charCodeAt(w.length - 1);
    if (c < 0xAC00 || c > 0xD7A3) return '를';
    return ((c - 0xAC00) % 28) === 0 ? '를' : '을';
  }

  function whenText(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
      ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  /* 저장 직전에 띄우는 물음. 문구는 계약관리에서 쓰던 것을 그대로 이었다
     (이미 사람이 익숙한 말이다). 다만 서로 다른 칸을 함께 알려 준다 —
     '무엇인가 바뀌었다'보다 '전화·주소가 다르다'가 판단에 쓸 수 있는 말이다.
     what: '업체' '사건' 처럼 무엇인지. */
  function message(what, hit) {
    if (!hit) return '';
    var who = hit.who || '다른 사람';
    var when = whenText(hit.at) || '최근';
    var w = what || '자료';
    var lines = [
      '⚠️ 동시 편집',
      '',
      who + '님이 ' + when + '에 이 ' + w + eulReul(w) + ' 고쳤습니다.'
    ];
    if (hit.diff && hit.diff.length) {
      lines.push('');
      if (hit.sure) {
        lines.push('그분이 고친 칸: ' + hit.diff.join(' · '));
      } else {
        lines.push('서로 다른 칸: ' + hit.diff.join(' · '));
        lines.push('(어느 쪽이 고친 것인지는 알 수 없습니다)');
      }
    }
    lines.push('');
    lines.push('그대로 저장하면 그분이 고친 내용이 사라집니다.');
    lines.push('');
    lines.push('• 확인: 그대로 저장 (덮어쓰기)');
    lines.push('• 취소: 닫고 다시 열어 최신 상태에서 작업');
    return lines.join('\n');
  }

  /* 물어보지 못한 채 덮어썼을 때 남기는 한 줄.
     화면이 물어보지 않는 경로(일괄 저장·자동 연결 등)에서도 **적어도 보이게**
     하기 위한 그물이다. 조용히 사라지는 것이 가장 나쁘다. */
  function overwriteNote(what, hit) {
    if (!hit) return '';
    var who = hit.who || '다른 사람';
    return '⚠ ' + who + '님이 ' + (whenText(hit.at) || '방금') + '에 고친 ' +
      (what || '자료') + ' 내용을 덮어썼습니다' +
      (hit.diff && hit.diff.length ? ' (' + hit.diff.join(' · ') + ')' : '');
  }

  global.PuConflict = {
    check: check,
    message: message,
    overwriteNote: overwriteNote,
    diffFields: diffFields,
    whenText: whenText,
    eulReul: eulReul
  };
})(typeof window !== 'undefined' ? window : globalThis);
