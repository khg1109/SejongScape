import {defineConfig, loadEnv} from 'vite';
import {fileURLToPath} from 'node:url';
import {createReadStream} from 'node:fs';
import {stat} from 'node:fs/promises';
import {resolve, sep, extname} from 'node:path';
import {localTrafficPlugin} from './server/2026-11-05-local-traffic.mjs';

export default defineConfig(({mode}) => ({
  plugins: [{
    name:'live-sumo-output', apply:'serve',
    configureServer(server){
      // These files are created after startup and deliberately excluded from HMR.
      for(const dataset of ['2026-11-05-sourced-sumo','2026-11-05-sumo-demand70','2026-11-05-sumo-demand50']){
      const root=resolve(server.config.root,'public/data/'+dataset);
      server.middlewares.use('/data/'+dataset,async(req,res)=>{
        if(!['GET','HEAD'].includes(req.method)){res.statusCode=405;res.end();return;}
        try{
          const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
          if(!path.startsWith(root+sep)){res.statusCode=403;res.end();return;}
          const info=await stat(path);
          if(!info.isFile()){res.statusCode=404;res.end();return;}
          res.setHeader('Content-Type',extname(path)==='.json'?'application/json; charset=utf-8':'application/octet-stream');
          res.setHeader('Content-Length',info.size);res.setHeader('Cache-Control','no-store');
          if(req.method==='HEAD'){res.end();return;}
          createReadStream(path).on('error',()=>res.destroy()).pipe(res);
        }catch{res.statusCode=404;res.end('SUMO output is not available yet.');}
      });
      }
    },
  },localTrafficPlugin(), {
    name: 'vworld-parser-script',
    transformIndexHtml: {
      order: 'post',
      handler(html, context) {
        if (!context.filename?.endsWith('real.html')) return html;
        const key = loadEnv(mode, process.cwd(), 'VITE_').VITE_VWORLD_API_KEY?.trim();
        if (!key) return html;
        return [{tag:'script', attrs:{id:'vworld-sdk', src:'https://map.vworld.kr/js/webglMapInit.js.do?version=3.0&apiKey='+encodeURIComponent(key)}, injectTo:'head-prepend'}];
      },
    },
  }],
  server: {
    fs: {deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/scripts/.cache/**']},
    watch: {ignored: ['**/public/data/2026-11-04-*-sumo/**','**/public/data/2026-11-05-sourced-sumo/**','**/public/data/2026-11-05-sumo-demand70/**','**/public/data/2026-11-05-sumo-demand50/**','**/scripts/.cache/**']},
  },
  build: {
    outDir: 'dist/client',
    rollupOptions: {
      input: {
        fullSumo: fileURLToPath(new URL('./2026-11-04-full-sumo.html', import.meta.url)),
        roadLab: fileURLToPath(new URL('./2026-11-03-road-lab.html', import.meta.url)),
        traffic: fileURLToPath(new URL('./traffic.html', import.meta.url)),
        sumo: fileURLToPath(new URL('./sumo.html', import.meta.url)),
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        real: fileURLToPath(new URL('./real.html', import.meta.url)),
      },
    },
  },
}));

