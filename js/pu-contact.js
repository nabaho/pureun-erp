/* 담당자 연락처 — 값이 둘 이상일 때의 «한 곳» 규칙   (2026-09-08 대표 지시)

   ■ 대표 물음
     「담당자 핸드폰 번호나 명함이 2개씩 있는 경우가 가끔 있다. 이메일이나 연락처를
      추가하고 어느 것이 메인인지 체크 표시가 필요한데 이 부분은 어떻게 설계하는 게 좋은가?」
     「기업정보함도 연락처와 이메일 두 개와 선택이 동기화 되어 연결되도록 해라」

   ■ 얼개 — 메인은 «체크»가 아니라 «자리»다
       { phone:'010-1111-2222', phoneLabel:'업무',
         phoneMore:[{ v:'010-3333-4444', label:'개인' }] }
     phone·email 은 «늘 메인»이다. 급여·메일·사진첩·경력관리·엑셀이 지금 읽는
     그 칸이 그대로 메인 값을 준다 — 그래서 저 화면들을 한 줄도 안 고쳐도 된다.
     ★ 를 누르면 자리를 «맞바꾼다»(promote). 어느 것이 메인인가를 따로 적지 않으므로
     «체크가 둘이거나 하나도 없는» 상태가 생길 수 없다.

   ■ 왜 배열 하나로 안 하나
     phone/email 을 읽는 곳이 191명분·앱 다섯 개에 흩어져 있다. 배열로 바꾸면
     그 전부를 같은 날 고쳐야 하고, 하나라도 놓치면 «연락처가 빈 화면»이 된다.

   ■ 기업정보함(pu-cards)과의 짝
     명함 색인은 짧은 열쇠를 쓴다 — m(휴대폰) · e(이메일).
     곁칸은 mm · em 으로 담는다. cardToMore()·moreToCard() 가 그 다리다.

   ⚠ 이 파일이 규칙의 «한 곳»이다. 화면마다 따로 셈하지 말 것 —
     그러면 기업정보함과 푸른이알피에서 메인이 서로 달라진다. */
(function(root, factory){
  var api = factory();
  if(typeof module === 'object' && module.exports) module.exports = api;
  if(root) root.PuContact = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function(){
  'use strict';

  /* 한 사람이 가질 수 있는 값의 수. 넉넉하되 끝이 있어야 한다 —
     붙여넣기 사고로 수십 개가 들어오면 화면이 무너진다. */
  var MAX = 6;
  var KINDS = { phone:1, email:1 };

  function clean(v){ return String(v == null ? '' : v).trim(); }
  function arr(v){ return Array.isArray(v) ? v : []; }
  function moreKey(kind){ return kind + 'More'; }
  function labelKey(kind){ return kind + 'Label'; }

  /* 같은 번호인가 — 010-1111-2222 와 01011112222 는 같다.
     이메일은 대소문자를 안 가린다(사람이 두 벌로 적는 흔한 자리다). */
  function same(kind, a, b){
    a = clean(a); b = clean(b);
    if(!a || !b) return false;
    if(kind === 'email') return a.toLowerCase() === b.toLowerCase();
    return a.replace(/[^0-9]/g, '') === b.replace(/[^0-9]/g, '');
  }

  /* 메인 먼저, 그다음 곁칸. 빈 값과 겹친 값은 빼고 돌려준다.
     화면은 이 목록만 그리면 된다 — 메인 판단을 화면이 하지 않는다. */
  function values(rec, kind){
    if(!KINDS[kind]) return [];
    rec = rec || {};
    var out = [], seen = [];
    function push(v, label, main){
      v = clean(v); if(!v) return;
      for(var i = 0; i < seen.length; i++){ if(same(kind, seen[i], v)) return; }
      seen.push(v);
      out.push({ v:v, label:clean(label), main:!!main });
    }
    push(rec[kind], rec[labelKey(kind)], true);
    arr(rec[moreKey(kind)]).forEach(function(x){
      if(x && typeof x === 'object') push(x.v, x.label, false);
      else push(x, '', false);
    });
    /* 메인 자리가 비었는데 곁칸에 값이 있으면 첫 곁칸이 메인이 된다 —
       «메인 없는 사람»을 만들지 않는다. */
    if(out.length && !out[0].main) out[0].main = true;
    return out.slice(0, MAX);
  }

  /* 목록을 다시 레코드 칸으로 — values() 의 반대. 저장 직전에 쓴다. */
  function apply(rec, kind, list){
    var next = Object.assign({}, rec || {});
    if(!KINDS[kind]) return next;
    var rows = arr(list).map(function(x){ return { v:clean(x && x.v), label:clean(x && x.label) }; })
                        .filter(function(x){ return x.v; });
    var kept = [];
    rows.forEach(function(r){
      for(var i = 0; i < kept.length; i++){ if(same(kind, kept[i].v, r.v)) return; }
      kept.push(r);
    });
    kept = kept.slice(0, MAX);
    next[kind] = kept.length ? kept[0].v : '';
    var lab = kept.length ? kept[0].label : '';
    if(lab) next[labelKey(kind)] = lab; else delete next[labelKey(kind)];
    var rest = kept.slice(1);
    if(rest.length) next[moreKey(kind)] = rest; else delete next[moreKey(kind)];
    return next;
  }

  /* ★ — i 번째 곁칸을 메인 자리로 올리고 지금 메인을 그 자리로 내린다.
     ⚠ 값을 «지우지 않는다». 맞바꿈이라 되돌리기도 같은 동작이다. */
  function promote(rec, kind, i){
    var list = values(rec, kind);
    if(i < 0 || i >= list.length) return Object.assign({}, rec || {});
    var next = list.slice();
    var pick = next.splice(i, 1)[0];
    next.unshift(pick);
    return apply(rec, kind, next);
  }

  function add(rec, kind, v, label){
    return apply(rec, kind, values(rec, kind).concat([{ v:v, label:label }]));
  }
  function remove(rec, kind, i){
    var list = values(rec, kind);
    if(i < 0 || i >= list.length) return Object.assign({}, rec || {});
    list.splice(i, 1);
    return apply(rec, kind, list);
  }
  /* 빈 값·겹친 값·넘치는 값을 걷는다. 저장 문 앞에서 한 번 지나가면 된다. */
  function normalize(rec){
    var next = Object.assign({}, rec || {});
    Object.keys(KINDS).forEach(function(kind){ next = apply(next, kind, values(next, kind)); });
    return next;
  }

  /* ── 기업정보함(pu-cards) 색인과의 다리 ──────────────────────────────
     색인은 짧은 열쇠를 쓴다: m 휴대폰 · e 이메일 · mm/em 곁칸.
     ⚠ 색인 한 줄은 사람 수천이 들어가는 자리라 «짧게» 담는다 —
       이름표가 없으면 글자 하나(문자열)로, 있으면 {v,l} 로. */
  function cardToMore(idxRec, kind){
    idxRec = idxRec || {};
    var key = (kind === 'email') ? 'em' : 'mm';
    return arr(idxRec[key]).map(function(x){
      if(x && typeof x === 'object') return { v:clean(x.v), label:clean(x.l || x.label) };
      return { v:clean(x), label:'' };
    }).filter(function(x){ return x.v; });
  }
  function moreToCard(rec, kind){
    return values(rec, kind).slice(1).map(function(x){
      return x.label ? { v:x.v, l:x.label } : x.v;
    });
  }

  /* 명함에서 값이 하나 더 왔을 때 — «덮지 않고» 곁칸에 붙인다.
     ⚠ 덮으면 사람이 골라 둔 메인이 말없이 바뀐다. 고르는 것은 ★ 로 사람이 한다. */
  function mergeIn(rec, kind, v, label){
    v = clean(v); if(!v) return Object.assign({}, rec || {});
    var list = values(rec, kind);
    for(var i = 0; i < list.length; i++){ if(same(kind, list[i].v, v)) return Object.assign({}, rec || {}); }
    if(!list.length) return apply(rec, kind, [{ v:v, label:label }]);
    return apply(rec, kind, list.concat([{ v:v, label:label }]));
  }

  return { MAX:MAX, values:values, apply:apply, promote:promote, add:add, remove:remove,
           normalize:normalize, cardToMore:cardToMore, moreToCard:moreToCard,
           mergeIn:mergeIn, sameValue:same };
});
