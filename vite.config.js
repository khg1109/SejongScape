import {defineConfig, loadEnv} from 'vite';
import {fileURLToPath} from 'node:url';
import trafficInitial from './server/traffic-initial.js';

export default defineConfig(({mode}) => ({
  plugins: [{name:'traffic-local-preview',apply:'serve',configureServer(server){server.middlewares.use('/api/traffic',(_req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({items:trafficInitial,mode:'saved',status:'snapshot',fetchedAt:null,source:'ITS 국가교통정보센터',serverTime:Date.now()}));});}}, {
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
  build: {
    outDir: 'dist/client',
    rollupOptions: {
      input: {
        traffic: fileURLToPath(new URL('./traffic.html', import.meta.url)),
        sumo: fileURLToPath(new URL('./sumo.html', import.meta.url)),
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        real: fileURLToPath(new URL('./real.html', import.meta.url)),
      },
    },
  },
}));

