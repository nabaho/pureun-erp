// 새 건의 폰 알림 — 분류 이름이 건의함과 짝이 맞는가
//  안 맞으면 폰에 「기타」로만 찍혀 무슨 건의인지 알 수 없다 (2026-08-13 발견: 15개 중 7개만 있었다).
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const fnSrc = fs.readFileSync(path.join(root, 'functions', 'index.js'), 'utf8');
const enterSrc = fs.readFileSync(path.join(root, 'enter.html'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, hint){
  if(cond){ pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (hint ? ' — ' + hint : '')); }
}

// 건의함(enter.html)이 쓰는 분류 키 — SG_CATS 의 key: 'xxx'
const catBlock = (enterSrc.match(/var SG_CATS\s*=\s*\[[\s\S]*?\n\s*\];/) || [''])[0];
const enterKeys = Array.from(new Set(
  (catBlock.match(/key:\s*'([a-z]+)'/g) || []).map(s => s.replace(/key:\s*'|'/g, ''))
));

// 알림(functions/index.js)이 아는 분류 키
const pushBlock = (fnSrc.match(/const SG_CAT_NAME\s*=\s*\{[\s\S]*?\n\};/) || [''])[0];
// 한 줄에 여러 개가 올 수 있다 (erp: "…", consult: "…", …) — 줄머리만 보면 놓친다
const pushKeys = Array.from(new Set(
  (pushBlock.match(/([a-z]+)\s*:\s*"/g) || []).map(s => s.replace(/[\s:"]/g, ''))
));

console.log('\n[건의함이 쓰는 분류를 알림도 다 아는가]');
ok('건의함 분류를 찾았다 (' + enterKeys.length + '개)', enterKeys.length >= 10,
   '찾은 키: ' + enterKeys.join(','));
ok('알림 분류표를 찾았다 (' + pushKeys.length + '개)', pushKeys.length >= 10,
   '찾은 키: ' + pushKeys.join(','));

const missing = enterKeys.filter(k => pushKeys.indexOf(k) < 0);
ok('빠진 분류가 없다', missing.length === 0,
   '알림에 없는 분류: ' + missing.join(', ') + ' → 폰에 「기타」로만 찍힌다');

const extra = pushKeys.filter(k => enterKeys.indexOf(k) < 0);
ok('건의함에 없는 분류를 알림이 들고 있지 않다', extra.length === 0,
   '남는 분류: ' + extra.join(', '));

console.log('\n[이름이 비어 있지 않다]');
const names = (pushBlock.match(/:\s*"([^"]*)"/g) || []).map(s => s.replace(/:\s*"|"/g, ''));
ok('모든 분류에 이름이 있다', names.length === pushKeys.length && names.every(n => n.trim().length > 0));

console.log('\n[왜 맞춰야 하는지 코드에 적혀 있다]');
ok('짝을 맞추라는 설명이 있다', /enter\.html 의 SG_CATS/.test(fnSrc));

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===\n');
process.exit(fail ? 1 : 0);
