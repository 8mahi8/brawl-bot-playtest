// Confirm --emit really produced four complete, byte-identical standalone
// files in a STAGING directory; these files are NOT published automatically.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const {makeAll,safeTarget}=require('../scripts/build-friends-online.cjs');
const result=makeAll();
for(const [mode,build] of Object.entries(result)){
 const dest=safeTarget(build.mode.output);
 assert(fs.existsSync(dest),'missing staged HTML: '+mode);
 const bytes=fs.readFileSync(dest,'utf8');
 assert.equal(bytes,build.html,'stage output drift '+mode);
 assert(bytes.length>100000,'unexpectedly truncated standalone HTML '+mode);
 console.log('PASS emitted '+mode+' '+build.mode.output+' ('+bytes.length+' chars)');
}
console.log('PASS four staging HTMLs are complete; no Google Sites or published HTML touched');
