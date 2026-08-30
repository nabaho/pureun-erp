'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../js/kcareer-hanja.js');

test('성(姓) 후보가 첫 자리에서 «먼저» 나온다 — 이름 첫 글자는 거의 성이다', () => {
  const c = H.candidates('권형하');
  assert.equal(c.length, 3);
  assert.equal(c[0].list[0], '權', '권의 첫 후보는 성씨 權 이어야 합니다');
  // 같은 소리라도 «이름 자리»에서는 성씨를 앞세우지 않는다.
  // 권(權)은 성·이름 표 둘 다 權 으로 시작해 구분이 안 되므로 이(李)로 본다.
  assert.equal(H.forSyllable('이', true)[0], '李', '첫 자리면 성씨 李 가 먼저');
  assert.notEqual(H.forSyllable('이', false)[0], '李', '이름 자리면 李 가 먼저일 이유가 없다');
  assert.ok(H.forSyllable('이', false).includes('李'), '그래도 후보에는 있어야 한다');
});

test('대표 이름 권형하의 후보에 實際 한자가 들어 있다', () => {
  const c = H.candidates('권형하');
  assert.ok(c[1].list.includes('炯'), '형: 炯');
  assert.ok(c[2].list.includes('河'), '하: 河');
});

test('흔한 성씨는 빠짐없이 첫 후보로 잡힌다', () => {
  const pairs = [['김', '金'], ['이', '李'], ['박', '朴'], ['최', '崔'], ['정', '鄭'],
    ['강', '姜'], ['조', '趙'], ['윤', '尹'], ['장', '張'], ['임', '林'],
    ['한', '韓'], ['오', '吳'], ['서', '徐'], ['신', '申'], ['권', '權'], ['황', '黃']];
  pairs.forEach(([k, v]) => {
    assert.equal(H.forSyllable(k, true)[0], v, k + ' → ' + v);
  });
});

test('후보는 겹치지 않는다 — 같은 한자를 두 번 보여 주면 고르기 어렵다', () => {
  Object.keys(H._GIVEN).forEach((k) => {
    const list = H.forSyllable(k, true);
    assert.equal(new Set(list).size, list.length, k + ' 의 후보에 중복이 있습니다');
  });
});

test('★ 표에 없는 소리는 «없다»고 말한다 — 비슷한 것을 지어내지 않는다', () => {
  // 이름에 거의 쓰이지 않는 소리
  assert.deepEqual(H.forSyllable('뷁', true), []);
  const c = H.candidates('뷁');
  assert.equal(c[0].list.length, 0);
  assert.equal(c[0].hangul, true, '한글이기는 하다고 알려 줘야 합니다');
});

test('한글이 아닌 글자는 그대로 두고 후보를 내지 않는다', () => {
  const c = H.candidates('권A하');
  assert.equal(c[1].hangul, false);
  assert.deepEqual(c[1].list, []);
});

test('이미 한자로 적혀 있으면 알아본다 — 바꿀 것이 없다고 말하려고', () => {
  assert.equal(H.isHanja('權炯河'), true);
  assert.equal(H.isHanja('권형하'), false);
  assert.equal(H.isHanja('權형하'), false, '섞여 있으면 아직 덜 된 것입니다');
  assert.equal(H.isHanja(''), false);
  assert.equal(H.isHanja(null), false);
});

test('빈 값·공백을 넣어도 터지지 않는다', () => {
  assert.deepEqual(H.candidates(''), []);
  assert.deepEqual(H.candidates(null), []);
  assert.equal(H.candidates('권 형 하').length, 3, '공백은 무시합니다');
});

test('표의 한자는 «한자»여야 한다 — 한글이 섞이면 고르는 순간 틀린 이름이 된다', () => {
  [H._SURNAME, H._GIVEN].forEach((tbl) => {
    Object.keys(tbl).forEach((k) => {
      assert.ok(/^[一-鿿㐀-䶿]*$/.test(tbl[k]),
        k + ' 의 후보에 한자가 아닌 글자가 섞였습니다: ' + tbl[k]);
    });
  });
});

test('열쇠는 «한 글자 한글»이다', () => {
  [H._SURNAME, H._GIVEN].forEach((tbl) => {
    Object.keys(tbl).forEach((k) => {
      assert.equal(k.length, 1, k + ' 는 한 글자가 아닙니다');
      assert.ok(H.isHangulSyllable(k), k + ' 는 한글 음절이 아닙니다');
    });
  });
});
