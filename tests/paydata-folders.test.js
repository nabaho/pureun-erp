'use strict';
// 내 폴더 — 사진첩과 같은 방식. 실행: node --test tests/*.test.js
//   분류 탭과 다른 축이다 — 탭은 「무엇인가」, 폴더는 「어느 일인가」.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadStore() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'pu-paydata-store.js'), 'utf8');
  const sandbox = { window: {}, console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(src, { filename: 'pu-paydata-store.js' }).runInContext(sandbox);
  const S = sandbox.window.PuPaydataStore;
  S.init({ uid: 'U1' });
  return S;
}

/* 가짜 실시간DB — 진짜 파이어베이스처럼 **나무 구조**로 담는다. 경로 문자열을
   그대로 열쇠로 쓰면(플랫 저장) 부모 경로를 읽었을 때 자식들이 안 모인다 —
   실제 update({'a/b/c': 1}) 뒤 ref('a/b').once('value') 는 {c:1} 을 돌려주는데,
   플랫 저장은 그 부모 열쇠 자체가 없어 undefined 가 나온다. 처음 그렇게 짰다가
   폴더 dedup·삭제 검사 넷이 한꺼번에 틀려서 잡았다(원인은 이 파일이었지 저장
   층 코드가 아니었다). */
function setAtPath(root, path, value) {
  const parts = path.split('/').filter(Boolean);
  if (value === null) {
    let cur = root;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!cur[parts[i]] || typeof cur[parts[i]] !== 'object') return;
      cur = cur[parts[i]];
    }
    delete cur[parts[parts.length - 1]];
    return;
  }
  let cur = root;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!cur[parts[i]] || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}
function getAtPath(root, path) {
  const parts = path.split('/').filter(Boolean);
  let cur = root;
  for (let i = 0; i < parts.length; i++) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[parts[i]];
  }
  return cur;
}

/* update() 는 항상 ref() 없이(= 다중 경로) 부른다 — 그 모양만 흉내낸다. */
function fakeDbMulti() {
  const tree = {};
  let seq = 0;
  return {
    _tree: tree,
    ref(p) {
      if (p === undefined) {
        return {
          update(map) {
            Object.keys(map).forEach(k => setAtPath(tree, k, map[k]));
            return Promise.resolve();
          }
        };
      }
      return {
        once() { return Promise.resolve({ val: () => getAtPath(tree, p) }); },
        push() { return { key: 'f' + (++seq) }; }
      };
    }
  };
}

test('★ 사업장마다 폴더 자리가 다르다', () => {
  const S = loadStore();
  assert.equal(S.foldersPath('co_1'), 'paydata/u/U1/folders/co_1');
  assert.notEqual(S.foldersPath('co_1'), S.foldersPath('co_2'));
});

test('빈 폴더 목록은 빈 객체를 준다', () => {
  const S = loadStore();
  S.init({ db: fakeDbMulti() });
  return S.listFolders('co_1').then(v => assert.deepEqual(Object.keys(v), []));
});

test('폴더를 만들면 목록에 나타난다', () => {
  const S = loadStore();
  S.init({ db: fakeDbMulti() });
  return S.addFolder('co_1', '2026 정기감사').then(r => {
    assert.equal(r.created, true);
    assert.ok(r.id);
    return S.listFolders('co_1');
  }).then(list => {
    const ids = Object.keys(list);
    assert.equal(ids.length, 1);
    assert.equal(list[ids[0]].name, '2026 정기감사');
    assert.equal(list[ids[0]].parent, null);
  });
});

test('★ 같은 어버이 안에서 이름이 겹치면 새로 안 만든다', () => {
  const S = loadStore();
  S.init({ db: fakeDbMulti() });
  return S.addFolder('co_1', '정기감사').then(a =>
    S.addFolder('co_1', ' 정기감사 ').then(b => {   // 앞뒤 공백만 다르다
      assert.equal(b.created, false);
      assert.equal(b.id, a.id);
    })
  );
});

test('★ 하위폴더의 하위폴더는 만들지 않는다 — 한 단계 위로 끌어올린다', () => {
  const S = loadStore();
  S.init({ db: fakeDbMulti() });
  return S.addFolder('co_1', '어버이').then(top =>
    S.addFolder('co_1', '자식', top.id).then(kid =>
      S.addFolder('co_1', '손주', kid.id).then(grandkid => {
        // 손주는 자식(kid) 밑이 아니라 어버이(top) 밑으로 올라간다
        assert.equal(grandkid.parent, top.id);
      })
    )
  );
});

test('★ 다른 사업장에 같은 이름을 또 만들 수 있다', () => {
  const S = loadStore();
  S.init({ db: fakeDbMulti() });
  return S.addFolder('co_1', '현장사진').then(a =>
    S.addFolder('co_2', '현장사진').then(b => {
      assert.notEqual(a.id, b.id, '사업장이 다르면 같은 이름도 따로 만들어져야 합니다');
    })
  );
});

test('이름을 바꾼다', () => {
  const S = loadStore();
  S.init({ db: fakeDbMulti() });
  return S.addFolder('co_1', '옛 이름').then(r =>
    S.renameFolder('co_1', r.id, '새 이름').then(() => S.listFolders('co_1'))
  ).then(list => {
    const ids = Object.keys(list);
    assert.equal(list[ids[0]].name, '새 이름');
  });
});

test('★ 폴더를 지워도 자료는 안 지운다 — 이름표만 없앤다', () => {
  const S = loadStore();
  const db = fakeDbMulti();
  S.init({ db: db });
  return S.addFolder('co_1', '지울 폴더').then(r => {
    setAtPath(db._tree, S.itemPath('202608', 'a1'), { companyId: 'co_1', kind: 'attend', folder: r.id });
    return S.deleteFolder('co_1', r.id).then(() => {
      assert.equal(getAtPath(db._tree, S.itemPath('202608', 'a1')) != null, true, '자료가 함께 지워지면 안 됩니다');
      assert.equal(getAtPath(db._tree, S.foldersPath('co_1') + '/' + r.id), undefined);
    });
  });
});

test('★ 어버이를 지우면 하위폴더도 함께 지운다 — 고아가 남지 않는다', () => {
  const S = loadStore();
  const db = fakeDbMulti();
  S.init({ db: db });
  return S.addFolder('co_1', '어버이').then(top =>
    S.addFolder('co_1', '자식', top.id).then(() =>
      S.deleteFolder('co_1', top.id).then(() => S.listFolders('co_1'))
    )
  ).then(list => {
    assert.equal(Object.keys(list).length, 0, '하위폴더가 남아 있습니다');
  });
});

test('★ 자료를 폴더에 넣고 뺀다', () => {
  const S = loadStore();
  const db = fakeDbMulti();
  S.init({ db: db });
  setAtPath(db._tree, S.itemPath('202608', 'a1'), { companyId: 'co_1', kind: 'attend' });
  return S.setFolder('202608', 'a1', 'f1').then(() => {
    assert.equal(getAtPath(db._tree, S.itemPath('202608', 'a1')).folder, 'f1');
    return S.setFolder('202608', 'a1', '');
  }).then(() => {
    // 실시간DB는 null 을 쓰면 그 자리를 지운다 — 남는 것은 folder:null 이 아니라
    // folder 칸 자체가 없는 것이다. 되찾을 때는 둘 다 "폴더 없음"으로 같게 본다.
    assert.equal(getAtPath(db._tree, S.itemPath('202608', 'a1')).folder, undefined);
  });
});

test('실시간DB가 없으면 알리고 거절한다', () => {
  const S = loadStore();
  return S.listFolders('co_1').then(
    () => { throw new Error('거절해야 합니다'); },
    (e) => assert.match(e.message, /실시간DB/)
  );
});

test('사업장·이름이 비면 만들지 않고 알린다', () => {
  const S = loadStore();
  S.init({ db: fakeDbMulti() });
  return Promise.all([
    S.addFolder('', '이름').then(() => { throw new Error('거절해야 합니다'); }, e => assert.match(e.message, /사업장/)),
    S.addFolder('co_1', '').then(() => { throw new Error('거절해야 합니다'); }, e => assert.match(e.message, /이름/))
  ]);
});
