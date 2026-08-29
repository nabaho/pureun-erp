'use strict';
/* 푸른노무법인 경력관리 — 한글 서식(HWPX)에 도장 찍기
   (브라우저 window.KcareerHwpStamp / Node module.exports 겸용, DOM·JSZip 미사용 — XML 조각만 만든다)

   2026-08-29 브라우저에서 실제로 찍어 «세 번 만에» 맞췄다. 틀렸던 것을 여기 적어 둔다 —
   지우면 다음 사람이 같은 실수를 되풀이한다.

   ⚠ orgSz(본래 크기)와 curSz(찍을 크기)를 같게 두면 «그림이 잘려 조각만» 그려진다.
     orgSz 는 그림의 px 를 HWPUNIT 으로 바꾼 값이고, curSz 는 종이에 찍을 크기다.
   ⚠ imgRect·imgClip·imgDim 도 «본래 크기» 기준이다. 찍을 크기로 적으면 역시 잘린다.
   ⚠ treatAsChar="1" 로 글자처럼 붙이면 뒤로 밀려 «종이 밖으로» 나간다.
     0 으로 두고 자리를 잡아 겹친다.
   ⚠ 그림 이름표는 반드시 image1·image2… 여야 한다. 엔진이 «이름 규칙»으로 그림을 찾는다 —
     목록(hpf)에 href 를 바로 적어 줘도 pustamp 같은 이름이면 못 찾고 «깨진 상자»가 그려진다
     (실측: pustamp 붉은 알갱이 19 = 깨진 상자, image1 은 379 = 진짜 도장).
   ⚠ 자리는 horzAlign="RIGHT" 로 «문단(칸)의 오른쪽 끝»에 붙인다.
     왼쪽 기준 + 고정 거리로 잡으면 표 안의 좁은 칸에서는 칸 밖으로 나간다.

   도장은 «덮는» 것이지 «지우는» 것이 아니다 — 「(인)」 글자는 그대로 남긴다. */
(function (root) {

  var HU_PER_INCH = 7200, DPI = 96;
  function PX_TO_HU(px) { return Math.round(Number(px || 0) / DPI * HU_PER_INCH); }

  function picXml(o) {
    o = o || {};
    var ORG = PX_TO_HU(o.orgPx || 300);          /* 그림 본래 크기 */
    var S = Math.round(o.showHU || 3400);         /* 찍을 크기 — 기본 지름 약 12mm */
    var ox = Math.round(o.offX || 0), oy = Math.round(o.offY || 0);
    var pid = o.picId || 1;
    return '<hp:pic id="' + pid + '" zOrder="1" numberingType="PICTURE"'
      + ' textWrap="IN_FRONT_OF_TEXT" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None"'
      + ' href="" groupLevel="0" instid="' + pid + '" reverse="0">'
      + '<hp:offset x="0" y="0"/>'
      + '<hp:orgSz width="' + ORG + '" height="' + ORG + '"/>'
      + '<hp:curSz width="' + S + '" height="' + S + '"/>'
      + '<hp:flip horizontal="0" vertical="0"/>'
      + '<hp:rotationInfo angle="0" centerX="' + Math.round(S / 2) + '" centerY="' + Math.round(S / 2) + '" rotateimage="1"/>'
      + '<hp:renderingInfo>'
      + '<hc:transMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>'
      + '<hc:scaMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>'
      + '<hc:rotMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>'
      + '</hp:renderingInfo>'
      + '<hp:imgRect><hc:pt0 x="0" y="0"/><hc:pt1 x="' + ORG + '" y="0"/>'
      + '<hc:pt2 x="' + ORG + '" y="' + ORG + '"/><hc:pt3 x="0" y="' + ORG + '"/></hp:imgRect>'
      + '<hp:imgClip left="0" right="' + ORG + '" top="0" bottom="' + ORG + '"/>'
      + '<hp:inMargin left="0" right="0" top="0" bottom="0"/>'
      + '<hp:imgDim dimwidth="' + ORG + '" dimheight="' + ORG + '"/>'
      + '<hp:img binaryItemIDRef="' + (o.id || 'image1') + '" bright="0" contrast="0" effect="REAL_PIC" alpha="0"/>'
      + '<hp:sz width="' + S + '" height="' + S + '" widthRelTo="ABSOLUTE" heightRelTo="ABSOLUTE" protect="0"/>'
      + '<hp:pos treatAsChar="0" affectLSpacing="0" flowWithText="1" allowOverlap="1"'
      + ' holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="PARA" vertAlign="TOP"'
      + ' horzAlign="' + (o.align || 'RIGHT') + '"'
      + ' vertOffset="' + oy + '" horzOffset="' + ox + '"/>'
      + '<hp:outMargin left="0" right="0" top="0" bottom="0"/>'
      + '</hp:pic>';
  }

  /* 도장 자리 — 「(인)」「（인）」「(서명)」「서명 또는 인」「印」.
     ⚠ 못 찾으면 null 을 돌려준다. 아무 데나 찍지 않는다 — 잘못 날인한 서류는 되돌릴 수 없다. */
  var MARKS = /[（(]\s*(인|서명)\s*[)）]|서명\s*또는\s*인|印/;
  function findSpot(sectionXml) {
    var s = String(sectionXml || '');
    var m = MARKS.exec(s);
    if (!m) return null;
    var end = s.indexOf('</hp:run>', m.index);
    if (end < 0) return null;
    return { index: end + '</hp:run>'.length };
  }

  function insertPic(sectionXml, pic, at) {
    var s = String(sectionXml || '');
    if (!at) return s;                    /* 자리가 없으면 문서를 그대로 — 망가뜨리지 않는다 */
    return s.slice(0, at.index) + '<hp:run charPrIDRef="0">' + pic + '</hp:run>' + s.slice(at.index);
  }

  /* 그림 목록(content.hpf)에 항목을 더한다 — 목록에 없으면 한글이 그림을 못 찾는다.
     이미 있으면 그대로 둔다(도장을 두 번 찍어도 목록이 부풀지 않게). */
  function addToManifest(hpf, id, href) {
    var s = String(hpf || '');
    if (s.indexOf('id="' + id + '"') >= 0) return s;
    return s.replace('</opf:manifest>',
      '<opf:item id="' + id + '" href="' + href + '" media-type="image/png" isEmbeded="1"/></opf:manifest>');
  }

  /* 아직 안 쓴 그림 이름표를 고른다 — image1, image2, …
     ⚠ 이름은 «반드시» image+숫자 여야 한다. 엔진이 그 규칙으로 그림을 찾는다.
       뜻이 담긴 이름(pustamp 등)을 쓰면 목록에 href 를 적어 줘도 «깨진 상자»가 그려진다.
       도장을 두 번 찍어도 앞의 그림을 덮지 않게 빈 번호를 찾아 쓴다. */
  function nextImageId(names) {
    var taken = {}, i;
    (names || []).forEach(function (n) {
      var m = /(?:^|\/)(image\d+)\./i.exec(String(n));
      if (m) taken[m[1].toLowerCase()] = true;
    });
    for (i = 1; i < 1000; i++) if (!taken['image' + i]) return 'image' + i;
    return 'image999';
  }

  var api = { PX_TO_HU: PX_TO_HU, picXml: picXml, findSpot: findSpot,
              insertPic: insertPic, addToManifest: addToManifest, nextImageId: nextImageId };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KcareerHwpStamp = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
