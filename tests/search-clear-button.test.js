/* 업체관리 검색칸 — 「N건 ×」가 숫자 표시로 보이던 것
   (2026-08-11) 대표 지시: "글자 넣은 것 한번에 삭제할 수 있게 x 기능 넣어줘".

   ★ × 는 이미 있었다. 다만 「2건 ×」가 «한 단추» 라 숫자 알림으로 보여
     누를 수 있는 줄 몰랐다 — 그래서 글자를 하나씩 지우고 있었다.
   고침: 숫자(알림)와 ×(누를 것)를 갈라 놓고, ×를 동그란 단추 꼴로. Esc 로도 지운다. */
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8').replace(/\r\n/g, '\n');

let pass = 0, fail = 0;
function t(name, got, want){
  const G = JSON.stringify(got), W = JSON.stringify(want);
  if(G === W){ pass++; console.log('  PASS ' + name + '  (' + G + ')'); }
  else { fail++; console.log('  FAIL ' + name + '\n    받음 ' + G + '\n    기대 ' + W); }
}

/* 업체관리 검색칸만 잘라 본다 — 다른 화면에도 검색칸이 있다 */
const BOX = src.slice(src.indexOf("placeholder:'🔍 업체명·번호·대표·주소·메모'") - 400,
                      src.indexOf("placeholder:'🔍 업체명·번호·대표·주소·메모'") + 1600);

console.log('\n[① 숫자와 ×를 갈라 놓았다]');
t('검색칸 구역을 잘라냈다', BOX.length > 800, true);
t('★ 「N건 ×」 한 덩어리가 사라졌다 (숫자 표시로 보이던 것)', /\+ '건 ×'/.test(src), false);
t('숫자는 알림으로만', /h\('span', \{[\s\S]{0,200}?filtered\.length \+ '건'\)/.test(BOX), true);
t('숫자는 눌러도 안 먹는다 (× 를 노리다 숫자를 눌러 헛손질하지 않게)',
  /pointerEvents:'none'[\s\S]{0,80}?filtered\.length \+ '건'/.test(BOX), true);
t('× 는 따로 선 단추', /h\('button', \{\s*\n\s*onClick:function\(\)\{ setQuery\(''\); \}/.test(BOX), true);
t('× 글자만 담는다', /\},\s*\n\s*'×'\)/.test(BOX), true);

console.log('\n[② 눌러야 할 것으로 보이게]');
t('동그란 단추', /borderRadius:'50%'/.test(BOX), true);
t('바탕색이 있어 눈에 띈다', /background:'#e2e8f0'/.test(BOX), true);
t('손가락으로 누를 만한 크기', /width:'22px', height:'22px'/.test(BOX), true);
t('글자도 커졌다 (10px → 14px)', /fontSize:'14px', fontWeight:700, cursor:'pointer'/.test(BOX), true);

console.log('\n[③ 무엇을 하는 단추인지 말해 준다]');
t('마우스를 올리면 알려 준다', /title:'검색어 지우기 \(Esc\)'/.test(BOX), true);
t('화면 읽어 주는 프로그램도 알 수 있게', /'aria-label':'검색어 지우기'/.test(BOX), true);

console.log('\n[④ Esc 로도 지운다 — 단추에 적어 둔 대로]');
/* 적어 두고 안 되면 그것도 거짓말이다 */
t('★ Esc 를 실제로 받는다',
  /onKeyDown:function\(e\)\{ if\(e\.key === 'Escape' && query\)\{ e\.preventDefault\(\); setQuery\(''\); \} \}/.test(BOX), true);
t('검색어가 없을 때는 Esc 를 가로채지 않는다 (창 닫기가 막히면 안 된다)',
  /e\.key === 'Escape' && query/.test(BOX), true);

console.log('\n[⑤ 글자가 숫자·× 밑에 깔리지 않는다]');
t('검색어가 있으면 오른쪽을 비운다', /paddingRight: query\?'88px':'12px'/.test(BOX), true);
t('비어 있을 때는 넓게 쓴다', /:'12px'/.test(BOX), true);

console.log('\n[⑥ 검색어가 없으면 아무것도 안 그린다]');
t('숫자도 검색할 때만', /query && h\('span'/.test(BOX), true);
t('× 도 검색할 때만', /query && h\('button'/.test(BOX), true);

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===\n');
process.exit(fail ? 1 : 0);
