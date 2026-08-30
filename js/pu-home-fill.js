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

  global.PuHomeFill = {
    FIELD: FIELD,
    FIELD_LABEL: FIELD_LABEL,
    BOARD: BOARD,
    pageCheck: pageCheck,
    textCheck: textCheck,
    fill: fill,
    bookmarkletUrl: bookmarkletUrl
  };
})(typeof window !== 'undefined' ? window : globalThis);
