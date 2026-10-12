// The SDK can load dependencies after its own load event.
export function connectVworld({key, status, window, document, parserLoaded = false, onReady = () => {}}) {
  key = (key || '').trim();
  if (!key) {
    status.textContent = '인증키가 아직 설정되지 않았습니다. 실제 3D 자료를 불러오지 않았습니다.';
    return;
  }
  status.textContent = '브이월드 지도를 연결하고 있습니다.';
  let finished = false, started = false, poll;
  const finish = (message) => {
    if (finished) return;
    finished = true;
    window.clearTimeout(timeout);
    window.clearInterval(poll);
    status.textContent = message;
  };
  const timeout = window.setTimeout(() => finish('지도 연결 시간이 초과되었습니다. 인증키의 등록 주소와 서비스 이용 설정을 확인한 뒤 새로고침해 주세요.'), 30000);
  const fail = () => finish('지도를 연결하지 못했습니다. 네트워크와 인증키의 등록 주소·서비스 이용 설정을 확인해 주세요.');
  function startWhenReady() {
    const vw = window.vw;
    if (finished || started || !vw?.Map || !vw.CameraPosition || !vw.CoordZ || !vw.Direction) return;
    started = true;
    window.clearInterval(poll);
    try {
      const map = new vw.Map();
      vw.ws3dInitCallBack = () => {
        finish('브이월드 3D 자료 · 장소를 선택해 살펴보세요.');
        onReady(map, vw);
      };
      const position = new vw.CameraPosition(new vw.CoordZ(127.269, 36.501, 1400), new vw.Direction(0, -60, 0));
      map.setOption({mapId: 'map', initPosition: position, logo: true, navigation: true});
      map.setMapId('map');
      map.setInitPosition(position);
      map.start();
    } catch { fail(); }
  }
  if (parserLoaded) {
    poll = window.setInterval(startWhenReady, 100);
    startWhenReady();
    return;
  }
  const script = document.createElement('script');
  script.src = 'https://map.vworld.kr/js/webglMapInit.js.do?version=3.0&apiKey=' + encodeURIComponent(key);
  script.onerror = fail;
  script.onload = () => {
    if (finished) return;
    poll = window.setInterval(startWhenReady, 100);
    startWhenReady();
  };
  document.head.append(script);
}
