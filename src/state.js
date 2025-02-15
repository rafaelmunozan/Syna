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
  for (let i = 0; i < globalSynaQueue.length; i++) {
    globalSynaQueue[i]._flush();
  }
  globalSynaQueue.length = 0;
}

function splitDot(str) {
  const parts = [];
  let start = 0;
  for (let i = 0; i < str.length; i++) {
    if (str.charCodeAt(i) === 46) {
      parts[parts.length] = str.substring(start, i);
      start = i + 1;
    }
  }
  if (start < str.length) {
    parts[parts.length] = str.substring(start);
  }
  return parts;
}

function joinDot(parts, startIndex) {
  let result = '';
  for (let i = startIndex; i < parts.length; i++) {
    if (i > startIndex) {
      result += '.';
    }
    result += parts[i];
  }
  return result;
}

function createAccessor(pathArr) {
  return function(obj) {
    let current = obj;
    for (let i = 0; i < pathArr.length; i++) {
      if (current == null) return undefined;
      current = current[pathArr[i]];
    }
    return current;
  };
}

export function syna(initialState) {
  const keys = [];
  const keyIndexMap = {};
  let indexCounter = 0;
  for (const key in initialState) {
    if (initialState.hasOwnProperty(key)) {
      keys[keys.length] = key;
      keyIndexMap[key] = indexCounter++;
    }
  }
  const lenKeys = keys.length;

  const bitIndex = [];
  for (let i = 0; i < lenKeys; i++) {
    bitIndex[1 << i] = i;
  }

  const state = {};
  for (let i = 0; i < lenKeys; i++) {
    const k = keys[i];
    state[k] = initialState[k];
  }

  const listeners = {};
  const nestedListeners = {};

  let dirtyBitmask = 0;
  let manager;

  const nestedProxyCache = new WeakMap();
  const hasNestedListeners = {};

  function createNestedHandler(parentKey) {
    return {
      set(obj, prop, val) {
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
    let mask = dirtyBitmask;
    dirtyBitmask = 0;

    while (mask !== 0) {
      const leastSetBit = mask & -mask;
      const index = bitIndex[leastSetBit];
      const key = keys[index];
      const value = state[key];
      mask = mask - leastSetBit;

      const keyListeners = listeners[key];
      if (keyListeners && keyListeners.length > 0) {
        const copyLen = keyListeners.length;
        const tempArray = new Array(copyLen);
        for (let j = 0; j < copyLen; j++) {
          tempArray[j] = keyListeners[j];
        }
        for (let j = 0; j < copyLen; j++) {
            tempArray[j](value);
        }
      }

      const nMap = nestedListeners[key];
      if (nMap) {
        for (const path in nMap) {
          if (nMap.hasOwnProperty(path)) {
            const group = nMap[path];
            const newVal = group.accessor(value);
            if (newVal !== group.lastValue) {
              group.lastValue = newVal;
              const callbacks = group.callbacks;
              const cLen = callbacks.length;
              for (let k = 0; k < cLen; k++) {
                  callbacks[k](newVal);
              }
            }
          }
        }
      }
    }
  }

  function _scheduleFlush() {
    let found = false;
    for (let i = 0; i < globalSynaQueue.length; i++) {
      if (globalSynaQueue[i] === manager) {
        found = true;
        break;
      }
    }
    if (!found) {
      globalSynaQueue[globalSynaQueue.length] = manager;
    }
    globalScheduleFlush();
  }

  function unwatch(path, callback) {
    let dotFound = false;
    for (let i = 0; i < path.length; i++) {
      if (path.charCodeAt(i) === 46) {
        dotFound = true;
        break;
      }
    }

    if (dotFound) {
      const parts = splitDot(path);
      const topKey = parts[0];
      const nestedPathArrLen = parts.length - 1;
      const subArr = new Array(nestedPathArrLen);
      for (let i = 0; i < nestedPathArrLen; i++) {
        subArr[i] = parts[i + 1];
      }
      const nestedPath = joinDot(subArr, 0);

      const topMap = nestedListeners[topKey];
      if (topMap && topMap[nestedPath]) {
        const group = topMap[nestedPath];
        const cArr = group.callbacks;
        let idx = -1;
        for (let i = 0; i < cArr.length; i++) {
          if (cArr[i] === callback) {
            idx = i;
            break;
          }
        }
        if (idx !== -1) {
          for (let j = idx; j < cArr.length - 1; j++) {
            cArr[j] = cArr[j + 1];
          }
          cArr.length = cArr.length - 1;
        }
        if (cArr.length === 0) {
          delete topMap[nestedPath];
          let hasProps = false;
          for (const mk in topMap) {
            if (topMap.hasOwnProperty(mk)) {
              hasProps = true;
              break;
            }
          }
          if (!hasProps) {
            delete nestedListeners[topKey];
            delete hasNestedListeners[topKey];
          }
        }
      }
    } else {
      const arr = listeners[path];
      if (arr && arr.length > 0) {
        let idx = -1;
        for (let i = 0; i < arr.length; i++) {
          if (arr[i] === callback) {
            idx = i;
            break;
          }
        }
        if (idx !== -1) {
          for (let j = idx; j < arr.length - 1; j++) {
            arr[j] = arr[j + 1];
          }
          arr.length = arr.length - 1;
          if (arr.length === 0) {
            delete listeners[path];
          }
        }
      }
    }
  }

  function watch(path, callback) {
    if (typeof callback !== "function") return () => {};

    let dotFound = false;
    for (let i = 0; i < path.length; i++) {
      if (path.charCodeAt(i) === 46) {
        dotFound = true;
        break;
      }
    }

    if (dotFound) {
      const parts = splitDot(path);
      const topKey = parts[0];
      const nestedPathArrLen = parts.length - 1;
      const subArr = new Array(nestedPathArrLen);
      for (let i = 0; i < nestedPathArrLen; i++) {
        subArr[i] = parts[i + 1];
      }
      const nestedPathKey = joinDot(subArr, 0);

      const accessor = createAccessor(subArr);

      hasNestedListeners[topKey] = true;
      if (!nestedListeners[topKey]) {
        nestedListeners[topKey] = {};
      }
      const topMap = nestedListeners[topKey];

      if (!topMap[nestedPathKey]) {
        topMap[nestedPathKey] = {
          accessor: accessor,
          lastValue: accessor(state[topKey]),
          callbacks: []
        };
      }
      const cList = topMap[nestedPathKey].callbacks;
      cList[cList.length] = callback;
    } else {
      if (!listeners[path]) {
        listeners[path] = [];
      }
      const arr = listeners[path];
      arr[arr.length] = callback;
    }

    return () => unwatch(path, callback);
  }

  const handler = {
    get(target, prop) {
      if (prop === "watch") return watch;
      if (prop === "_flush") return _flush;
      if (prop === "unwatch") return unwatch;

      const value = target[prop];
      if (!value || typeof value !== "object" || !hasNestedListeners[prop]) {
        return value;
      }

      let proxy = nestedProxyCache.get(value);
      if (!proxy) {
        proxy = new Proxy(value, createNestedHandler(prop));
        nestedProxyCache.set(value, proxy);
      }
      return proxy;
    },
    set(target, prop, newVal) {
      if (prop === "watch" || prop === "unwatch" || prop === "_flush") return false;

      if (target.hasOwnProperty(prop)) {
        const oldVal = target[prop];
        if (oldVal !== newVal) {
          target[prop] = newVal;
          const idx = keyIndexMap[prop];
          if (idx !== undefined) {
            dirtyBitmask |= (1 << idx);
            _scheduleFlush();
          }
        }
      } else {
        target[prop] = newVal;
      }
      return true;
    }
  };

  manager = new Proxy(state, handler);
  return manager;
}