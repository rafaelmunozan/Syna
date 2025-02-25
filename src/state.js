const globalSynaQueue = [];
let globalSynaPending = false;

function globalScheduleFlush() {
  if (!globalSynaPending) {
    globalSynaPending = true;
    if (typeof queueMicrotask === 'function') {
      queueMicrotask(globalFlush);
    } else {
      Promise.resolve().then(globalFlush);
    }
  }
}

function globalFlush() {
  globalSynaPending = false;
  const queue = globalSynaQueue.slice();
  globalSynaQueue.length = 0;
  for (let i = 0, len = queue.length; i < len; i++) {
    queue[i]._flush();
  }
}

function splitDot(str) {
  const parts = [];
  let start = 0;
  for (let i = 0, len = str.length; i < len; i++) {
    if (str.charCodeAt(i) === 46) { // '.'
      parts.push(str.substring(start, i));
      start = i + 1;
    }
  }
  if (start < str.length) {
    parts.push(str.substring(start));
  }
  return parts;
}

function createAccessor(pathArr) {
  return function (obj) {
    let current = obj;
    for (let i = 0, len = pathArr.length; i < len && current != null; i++) {
      current = current[pathArr[i]];
    }
    return current;
  };
}

function syna(initialState) {
  const keys = Object.keys(initialState);
  const keyIndexMap = {};
  for (let i = 0, len = keys.length; i < len; i++) {
    keyIndexMap[keys[i]] = i;
  }

  const bitIndex = new Uint32Array(32);
  for (let i = 0, len = keys.length; i < len; i++) {
    bitIndex[1 << i] = i;
  }

  const state = { ...initialState };
  const listeners = {};
  const nestedListeners = {};
  let dirtyBitmask = 0;
  let manager;

  const nestedProxyCache = new WeakMap();
  const hasNestedListeners = {};

  function createNestedHandler(parentKey) {
    return {
      set: function(obj, prop, val) {
        obj[prop] = val;
        const idx = keyIndexMap[parentKey];
        if (idx !== undefined) {
          dirtyBitmask |= (1 << idx);
          _scheduleFlush();
        }
        return true;
      }
    };
  }

  function _flush() {
    const mask = dirtyBitmask;
    if (!mask) return;
    dirtyBitmask = 0;
    let bit = mask;
    while (bit) {
      const leastSetBit = bit & -bit;
      const index = bitIndex[leastSetBit];
      const key = keys[index];
      const value = state[key];
      bit ^= leastSetBit;
      const keyListeners = listeners[key];
      if (keyListeners && keyListeners.length) {
        for (let j = 0, len = keyListeners.length; j < len; j++) {
          keyListeners[j](value);
        }
      }
      const nMap = nestedListeners[key];
      if (nMap) {
        for (let nested in nMap) {
          if (nMap.hasOwnProperty(nested)) {
            const group = nMap[nested];
            const newVal = group.accessor(value);
            if (newVal !== group.lastValue) {
              group.lastValue = newVal;
              const callbacks = group.callbacks;
              for (let k = 0, klen = callbacks.length; k < klen; k++) {
                callbacks[k](newVal);
              }
            }
          }
        }
      }
    }
  }

  function _scheduleFlush() {
    if (!(dirtyBitmask && (listeners || nestedListeners))) return;
    if (globalSynaQueue[globalSynaQueue.length - 1] !== manager) {
      globalSynaQueue.push(manager);
    }
    globalScheduleFlush();
  }

  function unwatch(path, callback) {
    const parts = path.indexOf('.') !== -1 ? splitDot(path) : [path];
    const topKey = parts[0];
    if (parts.length > 1) {
      const nestedPath = parts.slice(1).join('.');
      const topMap = nestedListeners[topKey];
      if (topMap && topMap[nestedPath]) {
        const cArr = topMap[nestedPath].callbacks;
        for (let i = 0, len = cArr.length; i < len; i++) {
          if (cArr[i] === callback) {
            cArr.splice(i, 1);
            break;
          }
        }
        if (!cArr.length) {
          delete topMap[nestedPath];
          if (Object.keys(topMap).length === 0) {
            delete nestedListeners[topKey];
            delete hasNestedListeners[topKey];
          }
        }
      }
    } else {
      const arr = listeners[topKey];
      if (arr && arr.length) {
        for (let i = 0, len = arr.length; i < len; i++) {
          if (arr[i] === callback) {
            arr.splice(i, 1);
            break;
          }
        }
        if (!arr.length) delete listeners[topKey];
      }
    }
  }

  function watch(path, callback) {
    if (typeof callback !== 'function') return function(){};
    const parts = path.indexOf('.') !== -1 ? splitDot(path) : [path];
    const topKey = parts[0];
    if (parts.length > 1) {
      const nestedPath = parts.slice(1).join('.');
      const accessor = createAccessor(parts.slice(1));
      hasNestedListeners[topKey] = true;
      nestedListeners[topKey] = nestedListeners[topKey] || {};
      const topMap = nestedListeners[topKey];
      if (!topMap[nestedPath]) {
        topMap[nestedPath] = {
          accessor: accessor,
          lastValue: accessor(state[topKey]),
          callbacks: []
        };
      }
      topMap[nestedPath].callbacks.push(callback);
    } else {
      listeners[topKey] = listeners[topKey] || [];
      listeners[topKey].push(callback);
    }
    return function() { unwatch(path, callback); };
  }

  const handler = {
    get: function(target, prop) {
      if (prop === 'watch') return watch;
      if (prop === '_flush') return _flush;
      if (prop === 'unwatch') return unwatch;
      const value = target[prop];
      if (!value || typeof value !== 'object' || !hasNestedListeners[prop]) {
        return value;
      }
      let proxy = nestedProxyCache.get(value);
      if (!proxy) {
        proxy = new Proxy(value, createNestedHandler(prop));
        nestedProxyCache.set(value, proxy);
      }
      return proxy;
    },
    set: function(target, prop, newVal) {
      if (prop === 'watch' || prop === 'unwatch' || prop === '_flush') return false;
      const oldVal = target[prop];
      if (oldVal === newVal) return true;
      target[prop] = newVal;
      const idx = keyIndexMap[prop];
      if (idx !== undefined) {
        dirtyBitmask |= (1 << idx);
        _scheduleFlush();
      }
      return true;
    }
  };

  manager = new Proxy(state, handler);
  return manager;
}
