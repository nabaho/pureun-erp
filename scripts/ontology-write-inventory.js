#!/usr/bin/env node
/* 온톨로지 저장 전수조사. 코드의 현재 숫자를 배포 잣대로 박지 않고, 등록 프로그램·
 * 소유 저장뿌리·공용 관문 탑재·직접 쓰기 흔적을 매번 새로 계산해 보여 준다. */
'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),O=require('../js/pu-ontology.js');

function src(file){return fs.readFileSync(path.join(root,file),'utf8');}
function bare(text){return text.replace(/<!--[^]*?-->/g,' ').replace(/\/\*[^]*?\*\//g,' ').replace(/(^|[^:])\/\/[^\n]*/g,'$1');}
function tokens(text){
  const s=bare(text),methods={set:0,update:0,remove:0,push:0,transaction:0};
  Object.keys(methods).forEach(k=>{methods[k]=(s.match(new RegExp('\\.'+k+'\\s*\\(','g'))||[]).length;});
  return methods;
}
function add(a){return Object.values(a).reduce((n,v)=>n+v,0);}
function inventory(){
  const programs=Object.entries(O.PROGRAMS).map(([key,p])=>{
    const file=p.file.split('?')[0],text=src(file),writes=tokens(text);
    return {key,name:p.name,file,primaryRoots:p.primaryRoots.slice(),entityTypes:p.entityTypes.slice(),
      mode:/pu-ontology-write\.js\?v=\d+[^>]*data-mode="observe"/.test(text)?'observe':
        (/pu-ontology-write\.js\?v=\d+/.test(text)?'enforce':'missing'),
      writeTokens:writes,totalWriteTokens:add(writes)};
  });
  const functionFiles=fs.readdirSync(path.join(root,'functions')).filter(f=>f.endsWith('.js')&&!f.endsWith('.test.js'));
  const satellites=Object.entries(O.SATELLITES||{}).map(([key,s])=>{
    const text=src(s.file),usesDatabase=/firebase-database-compat\.js|firebase\.database\s*\(/.test(text);
    return {key,name:s.name,file:s.file,program:s.program,usesDatabase,
      mode:/pu-ontology-write\.js\?v=\d+[^>]*data-mode="observe"/.test(text)?'observe':
        (/pu-ontology-write\.js\?v=\d+/.test(text)?'enforce':'missing')};
  });
  const server=functionFiles.map(file=>{const writes=tokens(src('functions/'+file));return {file:'functions/'+file,writeTokens:writes,totalWriteTokens:add(writes)};})
    .filter(x=>x.totalWriteTokens>0);
  return {generatedAt:new Date().toISOString(),contractVersion:require('../js/pu-ontology-write.js').CONTRACT_VERSION,
    programs,satellites,server,counts:{programs:programs.length,gated:programs.filter(x=>x.mode!=='missing').length,
      databaseSatellites:satellites.filter(x=>x.usesDatabase).length,
      gatedDatabaseSatellites:satellites.filter(x=>x.usesDatabase&&x.mode!=='missing').length,
      observe:programs.filter(x=>x.mode==='observe').length,enforce:programs.filter(x=>x.mode==='enforce').length,
      clientWriteTokens:programs.reduce((n,x)=>n+x.totalWriteTokens,0),serverWriteTokens:server.reduce((n,x)=>n+x.totalWriteTokens,0)}};
}
function markdown(inv){
  const rows=inv.programs.map(x=>`| ${x.name} | \`${x.file}\` | ${x.mode} | ${x.totalWriteTokens} | ${x.primaryRoots.map(r=>'`'+r+'`').join(', ')} |`).join('\n');
  return `# 푸른통합 온톨로지 저장 경로 전수조사\n\n`+
    `생성: ${inv.generatedAt} · 계약 판 ${inv.contractVersion}\n\n`+
    `> 쓰기 흔적 수는 위험 위치를 찾기 위한 진단값이다. 배열 push 같은 동명이 섞일 수 있어 배포 합격 수치로 고정하지 않는다.\n\n`+
    `| 프로그램 | 화면 | 관문 | 쓰기 흔적 | 소유 저장뿌리 |\n|---|---|---:|---:|---|\n${rows}\n\n`+
    `등록 프로그램 ${inv.counts.programs}, 관문 탑재 ${inv.counts.gated}, 관찰 ${inv.counts.observe}, 강제 ${inv.counts.enforce}. `+
    `Firebase 딸린 화면 ${inv.counts.databaseSatellites}, 관문 탑재 ${inv.counts.gatedDatabaseSatellites}.\n`;
}
const inv=inventory();
if(require.main===module)process.stdout.write(process.argv.includes('--markdown')?markdown(inv):JSON.stringify(inv,null,2)+'\n');
module.exports={inventory,markdown,tokens};
