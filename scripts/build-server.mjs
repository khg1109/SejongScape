import fs from 'node:fs/promises';
await fs.mkdir('dist/server',{recursive:true});
await fs.cp('server','dist/server',{recursive:true});
await fs.mkdir('dist/.openai',{recursive:true});
await fs.copyFile('.openai/hosting.json','dist/.openai/hosting.json');
await fs.cp('drizzle','dist/.openai/drizzle',{recursive:true});
await fs.writeFile('dist/server/wrangler.json',JSON.stringify({name:'sejongscape',main:'index.js',compatibility_date:'2026-09-01',assets:{directory:'../client',binding:'ASSETS',run_worker_first:true},d1_databases:[{binding:'DB',database_name:'sejongscape-visits',database_id:'local'}]},null,2));
await import('./seal-assets.mjs');
