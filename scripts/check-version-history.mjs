// CI verifies immutable lock history against the PR base or previous push.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const base=process.env.CHART_BASE_SHA;
if(!base||/^0+$/.test(base)){console.log('Initial commit: no previous chart history.');process.exit(0);}
let previous;
try{previous=JSON.parse(execFileSync('git',['show',`${base}:src/data/chart-lock.json`],{encoding:'utf8',stdio:['ignore','pipe','ignore']}));}
catch{console.log('Base has no chart lock; initial chart publication.');process.exit(0);}
const current=JSON.parse(readFileSync('src/data/chart-lock.json','utf8'));
for(const [key,hash] of Object.entries(previous))if(current[key]!==hash)throw new Error(`Published chart hash was changed or removed: ${key}. Keep old entries and increment chartVersion.`);
console.log('Published chart versions are immutable.');
