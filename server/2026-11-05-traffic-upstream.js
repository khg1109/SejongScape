import scope from './2026-11-05-sejong-traffic-scope.js';
export function trafficUpstream(env) {
  if (env.ITS_RELAY_URL || env.ITS_RELAY_TOKEN) {
    if (!env.ITS_RELAY_URL || !env.ITS_RELAY_TOKEN) throw Error('incomplete_relay_configuration');
    const url = new URL(env.ITS_RELAY_URL);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/api/traffic') throw Error('invalid_relay_url');
    return { url, options: { redirect: 'error', headers: { 'OAI-Sites-Authorization': 'Bearer ' + env.ITS_RELAY_TOKEN } } };
  }
  const url = new URL('https://openapi.its.go.kr:9443/trafficInfo');
  url.search = new URLSearchParams({apiKey:env.ITS_API_KEY,type:'all',getType:'json',minX:scope.bbox[0],maxX:scope.bbox[2],minY:scope.bbox[1],maxY:scope.bbox[3]}).toString();
  return { url, options: {} };
}
