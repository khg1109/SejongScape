import test from 'node:test';
import assert from 'node:assert/strict';
import {connectVworld} from '../src/vworld-loader.js';

function fixture(key = 'test-only-not-a-real-key') {
  const timers = new Map(), intervals = new Map(), scripts = [], status = {};
  let id = 0, starts = 0;
  const window = {
    setTimeout(fn) { timers.set(++id, fn); return id; },
    clearTimeout(id) { timers.delete(id); },
    setInterval(fn) { intervals.set(++id, fn); return id; },
    clearInterval(id) { intervals.delete(id); },
  };
  const document = {createElement: () => ({}), head: {append: s => scripts.push(s)}};
  function api(throws = false) {
    window.vw = {
      Map: class {setOption() {} setMapId() {} setInitPosition() {} start() {starts++; if (throws) throw Error('failure');}},
      CoordZ: class {}, Direction: class {}, CameraPosition: class {},
    };
  }
  connectVworld({key, status, window, document});
  return {window, status, scripts, timers, intervals, api, get starts() {return starts;}};
}

test('Missing key makes no external requests or timers', () => {
  const f = fixture(' ');
  assert.equal(f.scripts.length, 0); assert.equal(f.timers.size, 0);
  assert.match(f.status.textContent, /인증키가 아직/);
});
test('Delayed SDK dependencies start once and report ready only after callback', () => {
  const f = fixture(); f.scripts[0].onload(); assert.equal(f.starts, 0);
  f.api(); [...f.intervals.values()].forEach(fn => fn());
  assert.equal(f.starts, 1); assert.equal(f.intervals.size, 0);
  assert.match(f.status.textContent, /연결하고/);
  f.window.vw.ws3dInitCallBack();
  assert.match(f.status.textContent, /브이월드 3D 자료/); assert.equal(f.timers.size, 0);
});
test('Network failure settles and ignores a late load event', () => {
  const f = fixture(); f.scripts[0].onerror(); f.api(); f.scripts[0].onload();
  assert.match(f.status.textContent, /연결하지 못/);
  assert.equal(f.starts, 0); assert.equal(f.intervals.size, 0);
});
test('Timeout stops dependency polling and prevents late startup', () => {
  const f = fixture(); f.scripts[0].onload();
  [...f.timers.values()].forEach(fn => fn()); f.api();
  assert.equal(f.intervals.size, 0); assert.equal(f.starts, 0);
  assert.match(f.status.textContent, /시간이 초과/);
});
test('Synchronous API error settles without a hanging timeout', () => {
  const f = fixture(); f.api(true); f.scripts[0].onload();
  assert.match(f.status.textContent, /연결하지 못/);
  assert.equal(f.timers.size, 0); assert.equal(f.intervals.size, 0);
});
