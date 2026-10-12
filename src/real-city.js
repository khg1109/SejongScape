import {connectVworld} from './vworld-loader.js';
const places = {
  government:[127.2651,36.5055,700],
  library:[127.2680,36.4988,350],
  archives:[127.2732,36.5016,350],
  lake:[127.2737,36.4981,1000],
};
const select = document.querySelector('#place');
connectVworld({key: import.meta.env.VITE_VWORLD_API_KEY, status: document.querySelector('#status'), window, document, parserLoaded:true,
  onReady(map, vw) {
    select.disabled = false;
    select.addEventListener('change', () => {
      const point = places[select.value];
      if (!point) return;
      try {
        map.moveTo(new vw.CameraPosition(new vw.CoordZ(...point), new vw.Direction(0,-60,0)));
        document.querySelector('#status').textContent = '자료를 불러오며 이동합니다. 촬영 시점은 확인되지 않았습니다.';
      } catch {
        document.querySelector('#status').textContent = '장소 이동에 실패했습니다. 지도 확대·축소를 이용해 주세요.';
      }
    });
  },
});
