/* 푸른통합시스템 — 앱 사이 끌어놓기 규약
   사진첩의 사진이나 명함첩의 명함을 **다른 앱으로 끌어다 놓는** 유일한 규약 파일이다.
   보내는 앱과 받는 앱이 이 파일 하나를 함께 쓰므로, 앱이 늘어나도 규약이 갈리지 않는다.

   ⚠ 두 가지를 반드시 알고 써야 한다.

   1) **사진 자체가 아니라 '표'를 넘긴다.**
      base64 사진을 dataTransfer 에 담으면 크기 제한에 걸리고 창을 넘길 때 깨진다.
      그래서 어디 있는 무엇인지만(앱·종류·연도·계정·번호) 넘기고,
      받는 쪽이 그 표로 사진을 직접 가져와 **자기 사본**을 만든다.
      원본은 사진첩에 그대로 남는다(설계서 원칙: 가져간 앱이 복사해 소유).

   2) **끌고 오는 중(dragover)에는 값을 읽을 수 없다.** 브라우저는 그때
      '종류 목록'만 보여 준다. 그래서 우리 전용 종류를 하나 심어 두고,
      창을 넘길 때 그 종류가 사라지는 브라우저를 위해 text/plain 에도 같은 값을 담는다.

   ⚠ 창이 동시에 보여야 한다 — 탭 뒤에 숨은 화면으로는 끌어다 놓을 수 없다(브라우저 규칙). */
(function (global) {
  'use strict';

  var TYPE = 'application/x-pureun-drag';
  var HEAD = 'pureun-drag:v1:';

  /* 끄는 쪽에서 부른다. ref = {app, kind, year, owner, id, name, ...}
     여러 장을 함께 보낼 때는 ref.items 에 같은 꼴의 표를 죽 담는다.

     ⚠ **맨 윗칸(id·year·owner…)은 그대로 둔다.** 옛 방식으로 한 장만 읽는
        앱이 아직 있고, 그 앱에서도 최소한 첫 장은 받아져야 한다. 여러 장을
        받을 줄 아는 앱만 items 를 본다(readAll). 규약을 늘리되 깨지 않는다. */
  function set(dt, ref) {
    if (!dt || !ref) return false;
    var raw = HEAD + JSON.stringify(ref);
    try { dt.setData(TYPE, raw); } catch (e) { /* 전용 종류를 막는 브라우저 */ }
    dt.setData('text/plain', raw);
    /* 복사다 — 원본을 옮기는 것이 아니다. */
    dt.effectAllowed = 'copy';
    return true;
  }

  /* 여러 장을 한꺼번에 보낸다. list = [{app,kind,year,owner,id,name,...}, ...]
     첫 장을 맨 윗칸에 두어, 한 장만 읽는 앱도 빈손으로 돌아가지 않게 한다. */
  function setMany(dt, list) {
    if (!dt || !list || !list.length) return false;
    var head = {};
    Object.keys(list[0]).forEach(function (k) { head[k] = list[0][k]; });
    head.items = list;
    head.count = list.length;
    return set(dt, head);
  }

  /* 놓는 쪽에서 부른다. 우리 것이면 표를, 아니면 null. */
  function read(dt) {
    if (!dt || typeof dt.getData !== 'function') return null;
    var raw = '';
    try { raw = dt.getData(TYPE) || ''; } catch (e) { raw = ''; }
    if (!raw) { try { raw = dt.getData('text/plain') || ''; } catch (e) { raw = ''; } }
    if (raw.indexOf(HEAD) !== 0) return null;
    var ref;
    try { ref = JSON.parse(raw.slice(HEAD.length)); } catch (e) { return null; }
    if (!ref || typeof ref !== 'object') return null;
    /* 번호가 없으면 가져올 수 없다 — 빈 것을 받아 빈 칸을 만들지 않는다. */
    if (!ref.id) return null;
    return ref;
  }

  /* 놓는 쪽에서 부른다 — **놓인 것 전부**를 배열로 준다.
     한 장짜리로 온 것도 한 칸짜리 배열로 준다. 받는 앱은 이것만 쓰면
     한 장이든 여러 장이든 같은 길로 처리된다.
     ⚠ 번호 없는 것은 걸러 낸다 — 빈 표를 받아 빈 칸을 만들지 않는다. */
  function readAll(dt) {
    var ref = read(dt);
    if (!ref) return [];
    if (!Array.isArray(ref.items) || !ref.items.length) return [ref];
    var out = [];
    ref.items.forEach(function (x) {
      if (x && x.id) out.push(x);
    });
    return out.length ? out : [ref];
  }

  /* 끌고 오는 중에 '받을 자리'로 보여 줄지 가린다.
     그때는 값을 못 읽으니 종류만 본다. 파일을 끌고 오는 것은 우리 규약이 아니다
     (각 앱의 파일 받기가 처리한다). 글자를 끌고 오는 것은 일단 받아 보고,
     놓을 때 read() 로 다시 가린다. */
  function maybeOurs(dt) {
    if (!dt || !dt.types) return false;
    var types = Array.prototype.slice.call(dt.types);
    /* ⚠ 우리 종류가 있으면 우리 것이다 — 'Files' 가 함께 있어도 그렇다.
       격자의 사진(<img>)을 끌면 **브라우저가 그 그림을 파일로도 함께 실어 보낸다.**
       그래서 Files 를 먼저 보고 '남의 파일'이라고 판단하면 우리 드래그를 놓친다.
       실제 증상(2026-08-04 대표 보고): 사진첩 안에서 사진을 끌었더니 받는 자리가
       열리고 **같은 사진이 다시 올라갔다**(재복사). */
    if (types.indexOf(TYPE) >= 0) return true;
    if (types.indexOf('Files') >= 0) return false;
    return types.indexOf('text/plain') >= 0;
  }

  /* 무엇을 놓았는지 사람에게 알려줄 한 줄. */
  function label(ref) {
    if (!ref) return '';
    var what = ref.kind === 'card' ? '명함' : (ref.docKind === 'doc' ? '서류' : '사진');
    var n = (Array.isArray(ref.items) && ref.items.length) || 0;
    if (n > 1) return what + ' ' + n + '장';
    return ref.name ? (what + ' · ' + ref.name) : what;
  }

  global.PuDrag = {
    TYPE: TYPE,
    set: set,
    setMany: setMany,
    read: read,
    readAll: readAll,
    maybeOurs: maybeOurs,
    label: label
  };
})(typeof window !== 'undefined' ? window : globalThis);
