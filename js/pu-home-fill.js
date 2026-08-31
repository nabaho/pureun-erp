/* 푸른통합시스템 — 홈페이지 편집 화면 「채우기」 단추 만들기
   ═══════════════════════════════════════════════════════════════
   대표 결정 2026-08-30: 서버가 대신 로그인해 쓰는 방식 대신 «단추» 로 간다.

   왜 이 방식인가 — 정찰(2026-08-30)로 알아낸 것 때문이다.
     · 얼굴 사진은 «숨은 칸(content)» 안에 들어 있다. 서버가 경력사항만 보내고
       그 칸을 빠뜨리면 **사진이 지워진 채 저장된다.** 오류도 안 나고 우리 화면엔
       「같음」으로 뜬다 — 고객이 보기 전엔 아무도 모른다.
     · 확인표(_rx_csrf_token)가 로그인한 사람의 화면에 묶여 있다.
   단추는 «이미 열려 있는 그 화면»을 쓰므로 숨은 칸도 확인표도 건드릴 일이 없다.
   우리는 경력사항 칸 하나만 채운다. 그래서 사진이 날아갈 길이 없다.

   ★ 이 단추는 «채우기만» 한다. 저장(등록)은 사람이 누른다.
     기계가 저장까지 하면 잘못 채웠을 때 되돌릴 틈이 없다.

   쓰는 곳: pu-home.html 이 이 파일로 즐겨찾기 주소를 만들어 보여 준다. */
(function (global) {
  'use strict';

  /* 채울 칸 — 정찰로 확인한 이름이다(2026-08-30).
     화면 이름표 「경력사항」이 실제로는 extra_vars4 다.
     ⚠ 홈페이지를 개편하면 이 이름이 바뀔 수 있다. 그때는 «못 찾았다»고 멈춰야지
       다른 칸에 쓰면 안 된다 — 경력이 「메인 설명」 자리에 들어간다. */
  var FIELD = 'extra_vars4';
  var FIELD_LABEL = '경력사항';
  var BOARD = 'people_board';

  /* 이 화면이 «구성원 편집 화면»이 맞는지 본다. 아니면 아무것도 안 한다. */
  function pageCheck(loc) {
    var s = String((loc && loc.search) || '');
    if (s.indexOf('mid=' + BOARD) < 0) {
      return { ok: false, why: '구성원 편집 화면이 아닙니다.\n\n통합시스템에서 「홈페이지에서 이 사람 글 열기」로 연 화면에서 눌러 주십시오.' };
    }
    if (s.indexOf('act=dispBoardWrite') < 0) {
      return { ok: false, why: '글을 «고치는» 화면이 아닙니다.\n\n「수정」을 누른 뒤에 이 단추를 눌러 주십시오.' };
    }
    var m = s.match(/document_srl=(\d+)/);
    return { ok: true, srl: m ? m[1] : '' };
  }

  /* 붙일 글자가 말이 되는지 본다 — 엉뚱한 것을 붙여 넣지 않게 */
  function textCheck(text) {
    var t = String(text == null ? '' : text);
    if (!t.trim()) {
      return { ok: false, why: '복사된 내용이 없습니다.\n\n통합시스템에서 「붙여넣을 내용 복사」를 먼저 눌러 주십시오.' };
    }
    if (/<\s*(html|body|div|table|script)\b/i.test(t)) {
      return { ok: false, why: '복사된 것이 경력사항이 아닌 것 같습니다(화면 조각이 섞여 있습니다).\n\n「붙여넣을 내용 복사」를 다시 눌러 주십시오.' };
    }
    if (t.length > 4000) {
      return { ok: false, why: '복사된 내용이 너무 깁니다(' + t.length + '자).\n\n경력사항이 맞는지 확인해 주십시오.' };
    }
    return { ok: true, text: t };
  }

  /* 실제로 채운다. 저장하지 않는다. 다른 칸은 건드리지 않는다. */
  function fill(doc, text) {
    var el = doc.querySelector('[name="' + FIELD + '"]');
    if (!el) {
      return { ok: false, why: FIELD_LABEL + ' 칸을 찾지 못했습니다(' + FIELD + ').\n\n홈페이지 화면이 바뀌었을 수 있습니다.\n다른 칸에 잘못 쓰지 않으려고 «아무것도 하지 않고» 멈춥니다.' };
    }
    var before = String(el.value == null ? '' : el.value);
    el.value = text;
    /* 라이믹스가 값이 바뀐 것을 알아채도록 알린다 */
    try {
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (e) { }
    try { el.focus(); el.scrollIntoView({ block: 'center' }); } catch (e) { }
    return { ok: true, before: before, after: text, changed: before !== text };
  }

  /* 즐겨찾기에 넣을 주소를 만든다.
     ⚠ 한 줄로 만들어야 한다 — 즐겨찾기 주소에 줄바꿈이 들어가면 잘린다. */
  function bookmarkletUrl() {
    var src = [
      '(async function(){',
      'var F="' + FIELD + '",L="' + FIELD_LABEL + '",B="' + BOARD + '";',
      'var s=location.search;',
      'if(s.indexOf("mid="+B)<0||s.indexOf("act=dispBoardWrite")<0){',
      'alert("구성원 편집 화면에서 눌러 주십시오.\\n\\n통합시스템의 「홈페이지에서 이 사람 글 열기」로 연 화면입니다.");return;}',
      'var t="";try{t=await navigator.clipboard.readText();}catch(e){',
      'alert("클립보드를 읽지 못했습니다.\\n\\n브라우저가 물어보면 「허용」을 눌러 주십시오.");return;}',
      'if(!t||!t.trim()){alert("복사된 내용이 없습니다.\\n\\n통합시스템에서 「붙여넣을 내용 복사」를 먼저 눌러 주십시오.");return;}',
      'if(/<\\s*(html|body|div|table|script)\\b/i.test(t)){alert("복사된 것이 경력사항이 아닌 것 같습니다.\\n\\n다시 복사해 주십시오.");return;}',
      'var el=document.querySelector("[name=\\""+F+"\\"]");',
      'if(!el){alert(L+" 칸을 찾지 못했습니다("+F+").\\n\\n홈페이지 화면이 바뀐 것 같습니다.\\n다른 칸에 잘못 쓰지 않으려고 아무것도 하지 않습니다.");return;}',
      'var b=el.value||"";el.value=t;',
      'el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}));',
      'el.focus();el.scrollIntoView({block:"center"});',
      'var d=document.createElement("div");',
      'd.style.cssText="position:fixed;left:50%;top:18px;transform:translateX(-50%);z-index:99999;background:#0F7B4F;color:#fff;padding:10px 16px;border-radius:9px;font:700 14px Malgun Gothic,sans-serif;box-shadow:0 6px 22px rgba(0,0,0,.22)";',
      'd.textContent=(b===t?L+"은 이미 같습니다 — 등록을 누르지 않아도 됩니다":L+"을 채웠습니다 — 확인하고 「등록」을 누르십시오");',
      'document.body.appendChild(d);setTimeout(function(){d.remove();},6000);',
      '})();'
    ].join('');
    return 'javascript:' + encodeURIComponent(src);
  }

  /* ═══════════════════════════════════════════════════════════════════════
     쪽 본문 채우기 (대표 지시 2026-08-31 「모두 다 — 쪽 본문 안 깨지게」)
     ═══════════════════════════════════════════════════════════════════════
     ★ 구성원(경력사항)은 «칸 하나»를 통째로 바꾸면 됐다. 쪽은 다르다 —
       본문 안에 지도 위젯·지사 탭·표·구획이 들어 있어, 글자를 통째로 바꾸면
       그것들이 통째로 사라진다(그래서 여태 붙여넣기를 안 드렸다).

     ★ 그래서 여기서는 «마크업을 한 글자도 건드리지 않는다».
       바뀐 줄의 «글자»만 제자리에서 갈아 끼운다. 태그·속성·순서·빈칸은 그대로다.

     ★ 자리는 «번호»가 아니라 «원래 글자»로 짝짓는다.
       번호로 짝지으면, 그 사이 홈페이지를 누가 고쳐 줄이 하나 늘거나 줄었을 때
       엉뚱한 자리에 글자가 들어간다 — 그게 이 방식에서 가장 무서운 사고다.
       원래 글자가 안 보이거나 두 군데 이상이면 «그 줄만 건너뛰고» 알린다.

     ★ 저장(등록)은 사람이 누른다. 기계가 저장까지 하면 되돌릴 틈이 없다. */

  /* 본문을 «태그와 글자»로 쪼갠다 — 다시 이어 붙이면 원문 그대로다(무손실).
     script·style 안은 건드리지 않는다(그 안의 < 는 태그가 아니다). */
  function splitHtml(html) {
    return String(html == null ? '' : html).split(/(<[^>]*>)/);
  }
  function isTag(tok) { return tok.length > 1 && tok.charAt(0) === '<'; }
  function tagName(tok) {
    var m = /^<\s*\/?\s*([a-zA-Z0-9-]+)/.exec(tok);
    return m ? m[1].toLowerCase() : '';
  }
  /* 겹공백을 하나로, 앞뒤를 다듬는다 — 화면이 보여 준 줄과 같은 기준이라야 짝이 맞는다
     (PuHomeParse.tidy 와 같은 결. 부품이 없을 때를 대비해 여기에도 둔다). */
  function tidy(s) {
    return String(s == null ? '' : s).replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function escText(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* 사람이 읽는 «글자 줄»만 순서대로 — script·style 안과 빈칸뿐인 곳은 뺀다.
     at 은 토큰 자리(몇 번째 조각인지)다. 사람에게 보여 주는 번호가 아니다. */
  function textRuns(html) {
    var toks = splitHtml(html), out = [], skip = 0, i, t;
    for (i = 0; i < toks.length; i++) {
      t = toks[i];
      if (isTag(t)) {
        var name = tagName(t);
        if (name === 'script' || name === 'style') skip += (t.indexOf('</') === 0 ? -1 : 1);
        if (skip < 0) skip = 0;
        continue;
      }
      if (skip > 0) continue;
      if (!tidy(t)) continue;
      out.push({ at: i, text: tidy(t) });
    }
    return out;
  }

  /* 바뀐 줄만 갈아 끼운다.
     edits: [{ before, after }] — before 는 «홈페이지에 지금 있는» 글자다.
     돌려주는 것: { html, done:[…], skipped:[{before, why}] } */
  function applyLineEdits(html, edits) {
    var toks = splitHtml(html);
    var runs = textRuns(html);
    var used = {}, done = [], skipped = [];
    var cursor = 0;

    (edits || []).forEach(function (e) {
      var before = tidy(e && e.before), after = String((e && e.after) == null ? '' : e.after);
      if (!before) { skipped.push({ before: before, why: '원래 글자가 비어 있어 자리를 찾을 수 없습니다' }); return; }
      if (tidy(after) === before) { skipped.push({ before: before, why: '바뀐 것이 없습니다' }); return; }

      /* 같은 글자가 여러 군데면 «어느 줄인지 단정할 수 없다» — 손대지 않는다.
         (홈페이지에는 「T. 041-…」처럼 똑같은 줄이 여러 지사에 있다) */
      var hits = [];
      for (var k = 0; k < runs.length; k++) {
        if (used[runs[k].at]) continue;
        if (runs[k].text === before) hits.push(k);
      }
      if (!hits.length) {
        skipped.push({ before: before, why: '홈페이지에서 그 줄을 찾지 못했습니다 — 그 사이 누가 고쳤을 수 있습니다' });
        return;
      }
      if (hits.length > 1) {
        /* 순서를 실마리로 삼는다 — 앞에서부터 채워 왔으니 그 뒤에 하나만 남았다면 그것이다.
           그래도 둘 이상이면 «단정하지 않고» 건너뛴다. 잘못 짚느니 안 채우는 것이 낫다. */
        var ahead = hits.filter(function (k) { return k >= cursor; });
        if (ahead.length !== 1) {
          skipped.push({ before: before,
            why: '똑같은 줄이 ' + hits.length + '군데 있어 어느 것인지 단정할 수 없습니다' });
          return;
        }
        hits = ahead;
      }
      var idx = hits[0], run = runs[idx];
      /* 앞뒤 빈칸은 그대로 두고 «글자만» 바꾼다 — 줄바꿈·들여쓰기가 살아 있어야
         나중에 사람이 홈페이지 편집기에서 봐도 모양이 안 흐트러진다. */
      var raw = toks[run.at];
      var lead = raw.match(/^\s*/)[0], tail = raw.match(/\s*$/)[0];
      toks[run.at] = lead + escText(after) + tail;
      used[run.at] = true;
      cursor = idx + 1;
      done.push({ before: before, after: after });
    });

    return { html: toks.join(''), done: done, skipped: skipped };
  }

  /* 화면에 «고칠 수 있는 줄»로 내놓을 목록.
     ★ 채울 수 있는지 없는지를 화면이 저 나름대로 재지 않는다 — 여기서 한 번만 정한다.
       (같은 글이 여럿이면 applyLineEdits 가 어차피 건너뛴다. 그 사실을 미리 알려
        헛되이 고치게 두지 않는다.) */
  function fixableRuns(bodyHtml) {
    var runs = textRuns(bodyHtml);
    var cnt = {};
    runs.forEach(function (r) { cnt[r.text] = (cnt[r.text] || 0) + 1; });
    return runs.map(function (r) {
      return { text: r.text, ok: cnt[r.text] === 1,
               why: cnt[r.text] === 1 ? ''
                 : '이 쪽에 똑같은 글이 ' + cnt[r.text] + '군데 있어 어느 자리인지 단정할 수 없습니다' };
    });
  }

  /* 통합시스템 → 홈페이지로 건네는 «쪽지». 클립보드에 이 모양으로 담는다.
     ★ 어느 쪽인지(mid)를 함께 넣는다 — 엉뚱한 쪽에서 눌렀을 때 멈추기 위해서다. */
  function packPageEdits(mid, edits) {
    return JSON.stringify({ 푸른ERP: '쪽 채우기', 쪽: String(mid || ''), 줄: (edits || []).map(function (e) {
      return { 전: String(e.before == null ? '' : e.before), 후: String(e.after == null ? '' : e.after) };
      /* 안내 — 예전에 넣어 두신 «경력사항 단추»가 이 쪽지를 거절하게 하는 <div> 한 줄 */
    }), 안내: 쪽지안내 }, null, 0);
  }
  /* 쪽지를 푼다. 모양이 아니면 «아무것도 하지 않는다» */
  function unpackPageEdits(text) {
    var o = null;
    try { o = JSON.parse(String(text || '')); } catch (e) { o = null; }
    if (!o || o['푸른ERP'] !== '쪽 채우기' || !Array.isArray(o['줄'])) {
      return { ok: false, why: '복사된 것이 «쪽 채우기» 쪽지가 아닙니다.\n\n통합시스템에서 「홈페이지에 채우기용 복사」를 먼저 눌러 주십시오.' };
    }
    var edits = o['줄'].map(function (r) { return { before: r && r['전'], after: r && r['후'] }; })
      .filter(function (e) { return e.before; });
    if (!edits.length) return { ok: false, why: '바뀐 줄이 없습니다.' };
    return { ok: true, mid: String(o['쪽'] || ''), edits: edits };
  }

  /* 쪽 편집 화면에서 «본문 칸»을 찾는다.
     ★ 못 찾으면 «아무것도 하지 않는다». 엉뚱한 칸에 본문을 쓰면 쪽이 통째로 망가진다.
     ★ 라이믹스는 편집기를 여러 모양으로 쓴다 — 아는 모양을 차례로 짚어 본다. */
  function findPageEditor(win) {
    var doc = win && win.document;
    if (!doc) return null;
    /* ① CKEditor (라이믹스 기본) — 글자를 넣고 빼는 제 길이 있다 */
    var CK = win.CKEDITOR;
    if (CK && CK.instances) {
      for (var k in CK.instances) {
        if (!Object.prototype.hasOwnProperty.call(CK.instances, k)) continue;
        var ed = CK.instances[k];
        if (ed && typeof ed.getData === 'function' && typeof ed.setData === 'function') {
          return { kind: 'ckeditor', name: k,
                   get: function () { return ed.getData(); },
                   set: function (h) { ed.setData(h); } };
        }
      }
    }
    /* ② 숨은 글칸(textarea[name=content]) — 편집기가 없거나 「HTML 로 보기」일 때 */
    var ta = doc.querySelector('textarea[name="content"]');
    if (ta) {
      return { kind: 'textarea', name: 'content',
               get: function () { return ta.value; },
               set: function (h) {
                 ta.value = h;
                 try {
                   ta.dispatchEvent(new win.Event('input', { bubbles: true }));
                   ta.dispatchEvent(new win.Event('change', { bubbles: true }));
                 } catch (e) { }
               } };
    }
    /* ③ 직접 고치는 칸(contenteditable) */
    var ce = doc.querySelector('[contenteditable="true"]');
    if (ce) {
      return { kind: 'contenteditable', name: '',
               get: function () { return ce.innerHTML; },
               set: function (h) { ce.innerHTML = h; } };
    }
    return null;
  }


/* ═══════════════════════════════════════════════════════════════════════
     구성원 칸 채우기 · 비공개 (대표 지시 2026-08-31)
     ═══════════════════════════════════════════════════════════════════════
     대표 지시: 「비공개 버튼 만들어달라. 여기 화면에서 직접 수정하면
                니가 직접 고치는 형태로 연결해달라」

     ★ 여태는 «경력사항 칸 하나»만 채웠다. 이름·직책1·직책2가 다르면 채워도
       딱지가 그대로 「안 올라감」이었다 — 단추가 고장 난 것처럼 보이는 자리였다.

     ★ 칸 이름을 «짐작하지 않는다». 경력사항만 이름을 안다(extra_vars4).
       나머지는 화면에 «보이는 칸 이름»(직책1·직책2)으로 찾는다. 찾은 것이
       하나가 아니면 그 칸은 «건너뛰고» 무엇을 못 했는지 말한다.
       짐작해서 쓰면 엉뚱한 칸을 덮는데, 그건 되돌릴 수 없다.

     ★ 저장은 «물어보고» 누른다. 기계가 말없이 저장하면 되돌릴 틈이 없다. */

  /* 칸 이름을 견줄 때 쓰는 다듬기 — 「직책1 :」·「직책1*」 이 다 같은 이름이다 */
  function tidyLabel(s) {
    return String(s == null ? '' : s).replace(/[\s:：*()]/g, '');
  }

  /* 글자를 넣을 수 있는 칸인가. 숨은 칸·단추·파일은 아니다 —
     숨은 칸에 쓰면 화면에 아무 표시도 안 나면서 자료만 바뀐다. */
  function isField(el) {
    if (!el || !el.tagName) return false;
    var t = String(el.tagName).toLowerCase();
    if (t === 'textarea' || t === 'select') return true;
    if (t !== 'input') return false;
    var ty = String(el.type || 'text').toLowerCase();
    return ['hidden', 'submit', 'button', 'reset', 'file', 'checkbox', 'radio', 'image']
      .indexOf(ty) < 0;
  }

  /* 「보이는 이름」 옆의 칸을 찾는다 — for → 안쪽 → 다음 형제 → 가까운 어버이 순 */
  function fieldNear(el) {
    var doc = el.ownerDocument;
    var id = el.getAttribute && el.getAttribute('for');
    if (id && doc.getElementById) {
      var byId = doc.getElementById(id);
      if (isField(byId)) return byId;
    }
    var inside = el.querySelector && el.querySelector('input,textarea,select');
    if (isField(inside)) return inside;
    var n = el.nextElementSibling;
    var hop = 0;
    while (n && hop++ < 4) {
      if (isField(n)) return n;
      var f = n.querySelector && n.querySelector('input,textarea,select');
      if (isField(f)) return f;
      n = n.nextElementSibling;
    }
    var p = el.parentElement, up = 0;
    while (p && up++ < 3) {
      var g = p.querySelector && p.querySelector('input,textarea,select');
      if (isField(g)) return g;
      p = p.parentElement;
    }
    return null;
  }

  /* ★ 화면에 보이는 이름으로 칸을 찾는다. 하나로 좁혀지지 않으면 «없는 것으로 본다». */
  function findFieldByLabel(doc, label) {
    var want = tidyLabel(label);
    if (!want || !doc || !doc.querySelectorAll) return null;
    var tags = doc.querySelectorAll('label,th,legend,dt,.title,.tit,strong,b,span');
    var hits = [];
    for (var i = 0; i < tags.length; i++) {
      var el = tags[i];
      if (tidyLabel(el.textContent) !== want) continue;
      var f = fieldNear(el);
      if (isField(f) && hits.indexOf(f) < 0) hits.push(f);
    }
    return hits.length === 1 ? hits[0] : null;
  }

  /* 값을 넣고 «바뀐 것을 알린다» — 알리지 않으면 라이믹스가 못 알아채고 저장에서 빠진다 */
  function setFieldValue(el, val) {
    var before = String(el.value == null ? '' : el.value);
    el.value = val;
    try {
      var W = (el.ownerDocument && el.ownerDocument.defaultView) || window;
      el.dispatchEvent(new W.Event('input', { bubbles: true }));
      el.dispatchEvent(new W.Event('change', { bubbles: true }));
    } catch (e) { }
    return before;
  }

  /* 우리 칸 이름 ↔ 홈페이지 편집 화면의 칸.
     name 이 있으면 그것으로 먼저 찾는다(확실히 아는 칸). 없으면 보이는 이름으로. */
  /* ★ 「이름」은 «일부러» 빠져 있다.
     지금 홈페이지 목록 카드는 「권형하대표」 한 덩어리로 찍히고, 펼친 창은
     「권형하 + 대표」로 갈려 있다 — 글 제목이 '권형하'인지 '권형하대표'인지
     편집 화면을 봐야 안다. '권형하'로 덮었는데 제목이 '권형하대표'였다면
     카드에서 「대표」가 «조용히» 사라진다. 확인 전에는 손대지 않는다.
     (이름이 다를 때는 화면이 「손으로 고치십시오」라고 말한다.) */
  var MEMBER_FIELDS = [
    { key: '직책1', label: '직책1', name: '' },
    { key: '직책2', label: '직책2', name: '' },
    { key: '경력사항', label: '경력사항', name: FIELD }
  ];

  function fillMemberFields(doc, 칸) {
    var done = [], skipped = [];
    MEMBER_FIELDS.forEach(function (f) {
      if (!칸 || !Object.prototype.hasOwnProperty.call(칸, f.key)) return;
      var want = String(칸[f.key] == null ? '' : 칸[f.key]);
      var el = null;
      if (f.name && doc.querySelector) el = doc.querySelector('[name="' + f.name + '"]');
      if (!isField(el)) el = findFieldByLabel(doc, f.label);
      if (!isField(el)) el = findFieldByLabel(doc, f.key);
      if (!isField(el)) {
        skipped.push({ 칸: f.key, why: '이 화면에서 「' + f.key + '」 칸을 하나로 찾지 못했습니다' });
        return;
      }
      var before = String(el.value == null ? '' : el.value);
      if (before === want) { skipped.push({ 칸: f.key, why: '이미 같습니다' }); return; }
      setFieldValue(el, want);
      try { el.scrollIntoView({ block: 'center' }); } catch (e) { }
      done.push({ 칸: f.key, before: before, after: want });
    });
    return { done: done, skipped: skipped };
  }

  /* ★ 비공개로 바꾼다 — «지우지» 않는다. 잘못 내렸어도 되살릴 수 있어야 한다.
     고르개(select)에 「비공개」가 있으면 그것을, 없으면 「비밀글」 같은 딸깍 칸을 본다.
     둘 다 하나로 안 좁혀지면 «아무것도 하지 않는다». */
  function setPrivate(doc) {
    var sels = doc.querySelectorAll ? doc.querySelectorAll('select') : [];
    var 고른것 = [];
    for (var i = 0; i < sels.length; i++) {
      var opts = sels[i].options || [];
      for (var j = 0; j < opts.length; j++) {
        var t = tidyLabel(opts[j].textContent);
        if (t === '비공개' || t === '비밀' || t === '비밀글') {
          고른것.push({ sel: sels[i], idx: j, text: opts[j].textContent });
        }
      }
    }
    if (고른것.length === 1) {
      var g = 고른것[0];
      g.sel.selectedIndex = g.idx;
      try {
        var W = (doc.defaultView) || window;
        g.sel.dispatchEvent(new W.Event('change', { bubbles: true }));
      } catch (e) { }
      try { g.sel.scrollIntoView({ block: 'center' }); } catch (e) { }
      return { ok: true, how: '고르개를 「' + tidyLabel(g.text) + '」로 바꿨습니다' };
    }
    if (고른것.length > 1) {
      return { ok: false, why: '「비공개」를 고를 곳이 ' + 고른것.length
        + '군데라 어느 것인지 단정할 수 없습니다.\n\n화면에서 직접 바꿔 주십시오.' };
    }

    var boxes = doc.querySelectorAll ? doc.querySelectorAll('input[type="checkbox"]') : [];
    var 딸깍 = [];
    for (var k = 0; k < boxes.length; k++) {
      var b = boxes[k];
      var 이름 = tidyLabel((b.parentElement && b.parentElement.textContent) || '')
        + tidyLabel(b.name || '');
      if (/비공개|비밀글|secret/i.test(이름)) 딸깍.push(b);
    }
    if (딸깍.length === 1) {
      if (!딸깍[0].checked) { 딸깍[0].click(); }
      try { 딸깍[0].scrollIntoView({ block: 'center' }); } catch (e) { }
      return { ok: true, how: '「비밀글」에 표시했습니다' };
    }
    return { ok: false, why: '이 화면에서 «비공개로 바꾸는 자리»를 찾지 못했습니다.\n\n'
      + '화면에서 직접 바꿔 주시고, 어떤 화면인지 사진으로 알려 주시면 맞추겠습니다.' };
  }

  /* 저장 단추를 찾는다 — 누르는 것은 «사람이 그러라고 했을 때»만 */
  function findSaveButton(doc) {
    var cands = doc.querySelectorAll
      ? doc.querySelectorAll('button,input[type="submit"],a.btn,.btn_save,#save')
      : [];
    var hits = [];
    for (var i = 0; i < cands.length; i++) {
      var el = cands[i];
      var t = tidyLabel(el.textContent || el.value || '');
      if (t === '저장' || t === '등록' || t === '수정' || t === '확인') hits.push(el);
    }
    return hits.length === 1 ? hits[0] : null;
  }

  /* ── 쪽지(클립보드) ─────────────────────────────────────────────
     ★ 「안내」 칸에 <div> 를 넣어 둔다. 예전에 넣어 두신 «경력사항 단추»가
       이 쪽지를 받으면 «화면 조각이 섞였다»며 거절한다 — 쪽지가 경력사항 칸에
       통째로 박히는 사고를 막는다. 새 단추는 이 칸을 그냥 무시한다. */
  var 쪽지안내 = '<div>푸른ERP 쪽지입니다 — 붙여넣지 마시고 「★ 푸른ERP 채우기」를 누르십시오</div>';

  function packMemberFields(srl, 칸) {
    return JSON.stringify({ 푸른ERP: '구성원 채우기', 글번호: String(srl || ''),
      칸: 칸 || {}, 안내: 쪽지안내 }, null, 0);
  }
  function packPrivate(srl, name) {
    return JSON.stringify({ 푸른ERP: '비공개', 글번호: String(srl || ''),
      이름: String(name || ''), 안내: 쪽지안내 }, null, 0);
  }

  /* 쪽지를 푼다 — 세 갈래(쪽 채우기·구성원 채우기·비공개)를 한 자리에서 가른다 */
  function readPacket(text) {
    var o = null;
    try { o = JSON.parse(String(text || '')); } catch (e) { o = null; }
    if (!o || !o['푸른ERP']) {
      return { ok: false, why: '복사된 것이 푸른ERP 쪽지가 아닙니다.\n\n'
        + '통합시스템에서 「홈페이지에 채우기용 복사」를 먼저 눌러 주십시오.' };
    }
    var kind = String(o['푸른ERP']);
    if (kind === '쪽 채우기') {
      var got = unpackPageEdits(text);
      return got.ok ? { ok: true, kind: kind, mid: got.mid, edits: got.edits } : got;
    }
    if (kind === '구성원 채우기') {
      var 칸 = o['칸'] || {};
      var n = 0;
      for (var k in 칸) { if (Object.prototype.hasOwnProperty.call(칸, k)) n++; }
      if (!n) return { ok: false, why: '채울 칸이 없습니다.' };
      return { ok: true, kind: kind, srl: String(o['글번호'] || ''), 칸: 칸 };
    }
    if (kind === '비공개') {
      return { ok: true, kind: kind, srl: String(o['글번호'] || ''), name: String(o['이름'] || '') };
    }
    return { ok: false, why: '모르는 쪽지입니다(' + kind + ').' };
  }

  /* ★ 즐겨찾기 단추 하나로 셋을 다 한다 — 쪽 채우기·구성원 채우기·비공개.
     ★ 검사한 부품 소스를 «그대로» 실어 보낸다. 단추에 따로 베껴 쓰면
       검사가 지키는 코드와 실제로 도는 코드가 조용히 갈라진다. */
  function fillBookmarkletUrl() {
    var parts = [splitHtml, isTag, tagName, tidy, escText, textRuns, applyLineEdits,
                 unpackPageEdits, findPageEditor, tidyLabel, isField, fieldNear,
                 findFieldByLabel, setFieldValue, fillMemberFields, setPrivate,
                 findSaveButton, readPacket].map(function (f) { return String(f); });
    var src = '(async function(){' + parts.join('\n') + '\n'
      + 'MEMBER_FIELDS=' + JSON.stringify(MEMBER_FIELDS) + ';'
      + 'function 알림(msg,색){var d=document.createElement("div");'
      + 'd.style.cssText="position:fixed;left:50%;top:18px;transform:translateX(-50%);z-index:99999;'
      + 'background:"+(색||"#0F7B4F")+";color:#fff;padding:10px 16px;border-radius:9px;'
      + 'font:700 14px Malgun Gothic,sans-serif;box-shadow:0 6px 22px rgba(0,0,0,.22);max-width:80vw";'
      + 'd.textContent=msg;document.body.appendChild(d);setTimeout(function(){d.remove();},9000);}'
      + 'var t="";try{t=await navigator.clipboard.readText();}catch(e){'
      + 't=prompt("클립보드를 못 읽었습니다. 여기에 붙여넣기(Ctrl+V) 해 주십시오")||"";}'
      + 'var p=readPacket(t);'
      + 'if(!p.ok){alert(p.why);return;}'
      /* ── 쪽 채우기 ── */
      + 'if(p.kind==="쪽 채우기"){'
      + 'var ed=findPageEditor(window);'
      + 'if(!ed){alert("본문 칸을 찾지 못했습니다.\\n\\n쪽을 «고치는» 화면에서 눌러 주십시오.");return;}'
      + 'var out=applyLineEdits(ed.get(),p.edits);'
      + 'if(!out.done.length){alert("채운 줄이 없습니다.\\n\\n"'
      + '+out.skipped.map(function(s){return "· "+s.before+"\\n   → "+s.why;}).join("\\n"));return;}'
      + 'ed.set(out.html);'
      + '알림(out.done.length+"줄을 채웠습니다 — 확인하고 저장하십시오"'
      + '+(out.skipped.length?" (건너뛴 "+out.skipped.length+"줄은 아래에)":""));'
      + 'if(out.skipped.length){alert("건너뛴 줄\\n\\n"'
      + '+out.skipped.map(function(s){return "· "+s.before+"\\n   → "+s.why;}).join("\\n\\n"));}'
      + 'return;}'
      /* ── 구성원 채우기 ── */
      + 'if(p.kind==="구성원 채우기"){'
      + 'if(p.srl&&location.search.indexOf(p.srl)<0){'
      + 'if(!confirm("이 화면은 글 번호 "+p.srl+" 이 아닌 것 같습니다.\\n\\n그래도 채울까요?"))return;}'
      + 'var r=fillMemberFields(document,p["칸"]);'
      + 'if(!r.done.length){alert("바뀐 칸이 없습니다.\\n\\n"'
      + '+r.skipped.map(function(s){return "· "+s["칸"]+" → "+s.why;}).join("\\n"));return;}'
      + '알림(r.done.map(function(d){return d["칸"];}).join("·")+" 를 채웠습니다");'
      + 'if(r.skipped.length){alert("채우지 못한 칸\\n\\n"'
      + '+r.skipped.map(function(s){return "· "+s["칸"]+" → "+s.why;}).join("\\n"));}'
      + 'var sb=findSaveButton(document);'
      + 'if(sb&&confirm("이대로 저장할까요?\\n\\n채운 칸: "'
      + '+r.done.map(function(d){return d["칸"];}).join(", ")+"\\n\\n"'
      + '+"「취소」를 누르시면 화면에 채워만 두고 저장하지 않습니다."))sb.click();'
      + 'else if(!sb)알림("저장 단추를 못 찾았습니다 — 화면에서 직접 눌러 주십시오","#B45309");'
      + 'return;}'
      /* ── 비공개 ── */
      + 'if(p.kind==="비공개"){'
      + 'if(!confirm((p.name||"이 사람")+" 님의 글을 «비공개»로 바꿉니다.\\n\\n'
      + '지우는 것이 아니라 감추는 것이라 언제든 되살릴 수 있습니다.\\n\\n계속할까요?"))return;'
      + 'var pr=setPrivate(document);'
      + 'if(!pr.ok){alert(pr.why);return;}'
      + '알림("비공개로 바꿨습니다 — "+pr.how);'
      + 'var sb2=findSaveButton(document);'
      + 'if(sb2&&confirm("이대로 저장할까요?\\n\\n저장해야 홈페이지에서 내려갑니다."))sb2.click();'
      + 'else if(!sb2)알림("저장 단추를 못 찾았습니다 — 화면에서 직접 눌러 주십시오","#B45309");'
      + 'return;}'
      + '})();';
    return 'javascript:' + encodeURIComponent(src);
  }

  global.PuHomeFill = {
    FIELD: FIELD,
    FIELD_LABEL: FIELD_LABEL,
    BOARD: BOARD,
    pageCheck: pageCheck,
    textCheck: textCheck,
    fill: fill,
    bookmarkletUrl: bookmarkletUrl,
    /* 쪽 본문 */
    textRuns: textRuns,
    fixableRuns: fixableRuns,
    applyLineEdits: applyLineEdits,
    packPageEdits: packPageEdits,
    unpackPageEdits: unpackPageEdits,
    /* 구성원 칸 채우기·비공개 (대표 지시 2026-08-31) */
    MEMBER_FIELDS: MEMBER_FIELDS,
    tidyLabel: tidyLabel,
    isField: isField,
    findFieldByLabel: findFieldByLabel,
    fillMemberFields: fillMemberFields,
    setPrivate: setPrivate,
    findSaveButton: findSaveButton,
    packMemberFields: packMemberFields,
    packPrivate: packPrivate,
    readPacket: readPacket,
    fillBookmarkletUrl: fillBookmarkletUrl
  };
})(typeof window !== 'undefined' ? window : globalThis);
