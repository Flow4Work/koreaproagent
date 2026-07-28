import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const jsFiles=[
  'app-v4.js',
  'api/analyze-v2.js',
  'api/contact.js',
  'api/discover.js',
  'api/discover-v2.js',
  'api/health.js',
  'api/version.js',
  'lib/ai-provider.js',
  'lib/contact-discovery.js',
  'lib/web-search.js'
];

let failed=false;
for(const file of jsFiles){
  if(!fs.existsSync(file)){console.error(`missing: ${file}`);failed=true;continue}
  const r=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
  if(r.status!==0){console.error(`syntax: ${file}\n${r.stderr||r.stdout}`);failed=true}
}

try{JSON.parse(fs.readFileSync('vercel.json','utf8'))}catch(e){console.error(`vercel.json: ${e.message}`);failed=true}
const html=fs.readFileSync('index.html','utf8');
if(!html.includes('/app-v4.js')||!html.includes('/tool-v4.css')){console.error('index.html is not wired to v4 assets');failed=true}
if(failed)process.exit(1);
console.log(`OK: ${jsFiles.length} JS files + vercel.json + v4 asset wiring`);