const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const version = {
  sha: process.env.PU_RELEASE_SHA || 'local',
  shortSha: (process.env.PU_RELEASE_SHA || 'local').slice(0, 8),
  runId: process.env.PU_RELEASE_RUN || '',
  deployedAt: new Date().toISOString()
};

fs.writeFileSync(path.join(root, 'version.json'), `${JSON.stringify(version, null, 2)}\n`, 'utf8');
console.log(`Prepared version ${version.shortSha} at ${version.deployedAt}`);
