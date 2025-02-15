// sc.js (Optimized for Raw Performance, reducing high-level abstractions)
import { syna } from "./state";

export class sc extends HTMLElement {
  static template = '';
  static events = {};
  static state = {};
  static connect = {};
  static registered = false;

  static prototype_fragment = null;
  static ref_paths = [];
  static binding_instructions = null;
  static event_map = null;

  static register() {
    if (this.registered) return;
    this.registered = true;

    // Convert template to function if it's a string
    let tpl = this.template;
    if (typeof tpl !== 'function') {
      const tempStr = tpl;
      tpl = function() { return tempStr; };
      this.template = tpl;
    }

    // Preprocess template to extract bindings and compile accessor functions
    const templateString = tpl();
    const processedInfo = this._process_template(templateString);
    const processedTemplate = processedInfo[0];
    const bindingInstructions = processedInfo[1];

    // Create a template fragment once
    const templateEl = document.createElement('template');
    templateEl.innerHTML = processedTemplate;
    this.prototype_fragment = templateEl.content;

    // Pre-collect ref paths using traversal
    this.ref_paths = this._collect_ref_paths(this.prototype_fragment);

    // Preprocess events into arrays to avoid repeated object checks
    const eventsObj = this.events;
    const eventKeys = [];
    const eventValues = [];
    for (const key in eventsObj) {
      if (Object.prototype.hasOwnProperty.call(eventsObj, key)) {
        eventKeys[eventKeys.length] = key;
        eventValues[eventValues.length] = eventsObj[key];
      }
    }
    this.event_map = { keys: eventKeys, values: eventValues };

    // Store binding instructions
    this.binding_instructions = bindingInstructions;
  }

  static _collect_ref_paths(fragment) {
    const refs = [];
    function traverse(node, path) {
      if (node.nodeType === 1 && node.hasAttribute('data-ref')) {
        refs[refs.length] = {
          refName: node.getAttribute('data-ref'),
          path: path.slice()
        };
      }
      let idx = 0;
      for (let child = node.firstChild; child; child = child.nextSibling) {
        path[path.length] = idx++;
        traverse(child, path);
        path.length--;
      }
    }
    traverse(fragment, []);
    return refs;
  }

  static _process_template(template) {
    const bindingInstructions = [];
    let currentPos = 0;
    let result = '';
    let bindingCount = 0;
    const bindingPattern = /\{\{([^}]+)\}\}/g;
    let match;

    while ((match = bindingPattern.exec(template)) !== null) {
      const fullMatch = match[0];
      const expression = match[1].trim();
      const bindingId = `__bind_${bindingCount++}`;

      // Append everything before this match
      result += template.substring(currentPos, match.index);

      // Analyze context for attribute or text
      const beforeContext = template.substring(0, match.index);
      const lastOpenTag = beforeContext.lastIndexOf('<');
      const nextCloseTag = template.indexOf('>', match.index);
      const tagContent = template.substring(lastOpenTag, nextCloseTag + 1);

      let isAttribute = false;
      let attributeName = null;
      const inAttrCheck1 = beforeContext.substring(lastOpenTag).indexOf('="');
      const inAttrCheck2 = beforeContext.substring(lastOpenTag).indexOf("='");
      if ((inAttrCheck1 !== -1 && inAttrCheck1 < fullMatch.length) ||
          (inAttrCheck2 !== -1 && inAttrCheck2 < fullMatch.length)) {
        isAttribute = true;
        const attrMatch = beforeContext.substring(lastOpenTag).match(/\s([^\s>]+)=["']?$/);
        if (attrMatch) attributeName = attrMatch[1];
      }

      // data-ref check
      let dataRef = null;
      const dataRefMatch = /data-ref=["']([^"']+)["']/.exec(tagContent);
      if (dataRefMatch) {
        dataRef = dataRefMatch[1];
      }

      const parts = expression.split('.');
      const sourceName = parts[0];
      const path = parts.slice(1);
      const accessor = this._create_accessor(path);

      bindingInstructions[bindingInstructions.length] = {
        id: bindingId,
        sourceName,
        path,
        refName: dataRef,
        isAttribute,
        attributeName,
        originalContent: fullMatch,
        accessor
      };

      // Insert placeholder
      result += `[${bindingId}]`;
      currentPos = match.index + fullMatch.length;
    }
    // Append any trailing part
    result += template.substring(currentPos);

    return [result, bindingInstructions];
  }

  static _create_accessor(pathArr) {
    if (!pathArr.length) {
      return function(obj) { return obj; };
    }
    return function(obj) {
      let current = obj;
      for (let i = 0, len = pathArr.length; i < len; i++) {
        if (current == null) return undefined;
        current = current[pathArr[i]];
      }
      return current;
    };
  }

  constructor() {
    super();
    const Ctor = this.constructor;
    Ctor.register();

    // Clone the precompiled fragment
    const fragmentClone = Ctor.prototype_fragment.cloneNode(true);
    this.fragment = fragmentClone;

    // Map cloned data-ref nodes using precomputed paths
    const nodes = {};
    const refPaths = Ctor.ref_paths;
    for (let i = 0, rLen = refPaths.length; i < rLen; i++) {
      const refItem = refPaths[i];
      let node = fragmentClone;
      const path = refItem.path;
      for (let j = 0, pLen = path.length; j < pLen; j++) {
        node = node.childNodes[path[j]];
      }
      nodes[refItem.refName] = node;
    }
    this.nodes = nodes;

    // Initialize state and set up watchers
    this.state = syna(Ctor.state);

    // Process bindings
    this._process_bindings();

    // Set up events
    this._setup_events();
  }

  _process_bindings() {
    const bindingInstructions = this.constructor.binding_instructions;
    const instructionsLen = bindingInstructions.length;
    const nodes = this.nodes;
    const state = this.state;
    const connect = this.constructor.connect;
    const perNodeBindings = {};
    const standaloneBindings = [];

    // Separate out per-node vs. one-time (no data-ref)
    for (let i = 0; i < instructionsLen; i++) {
      const binding = bindingInstructions[i];
      const refName = binding.refName;
      if (refName) {
        if (!perNodeBindings[refName]) {
          perNodeBindings[refName] = [];
        }
        perNodeBindings[refName][perNodeBindings[refName].length] = binding;
      } else {
        standaloneBindings[standaloneBindings.length] = binding;
      }
    }

    // Apply one-time bindings
    for (let i = 0, sLen = standaloneBindings.length; i < sLen; i++) {
      this._apply_one_time_binding(standaloneBindings[i]);
    }

    // Set up dynamic bindings per node
    this.binding_cleanups = [];
    for (const refName in perNodeBindings) {
      if (!Object.prototype.hasOwnProperty.call(perNodeBindings, refName)) continue;
      const node = nodes[refName];
      const nodeBindings = perNodeBindings[refName];
      const nodeBindingsLen = nodeBindings.length;
      const nodeBindingValues = {};
      let originalAttrs = null;
      let originalText = null;

      for (let i = 0; i < nodeBindingsLen; i++) {
        const binding = nodeBindings[i];
        const id = binding.id;
        nodeBindingValues[id] = '';

        const updateValue = (value) => {
          if (value == null) value = '';
          nodeBindingValues[id] = value;
          if (binding.isAttribute && binding.attributeName) {
            if (!originalAttrs) {
              originalAttrs = Object.create(null);
              // Store the original attribute (only once)
              originalAttrs[binding.attributeName] = node.getAttribute(binding.attributeName);
            }
            let newValue = originalAttrs[binding.attributeName];
            for (const bid in nodeBindingValues) {
              if (Object.prototype.hasOwnProperty.call(nodeBindingValues, bid)) {
                newValue = newValue.replace(`[${bid}]`, nodeBindingValues[bid]);
              }
            }
            node.setAttribute(binding.attributeName, newValue);
          } else {
            if (!originalText) {
              // Store the original text content (only once)
              originalText = node.textContent;
            }
            let newContent = originalText;
            for (const bid in nodeBindingValues) {
              if (Object.prototype.hasOwnProperty.call(nodeBindingValues, bid)) {
                newContent = newContent.replace(`[${bid}]`, nodeBindingValues[bid]);
              }
            }
            node.textContent = newContent;
          }
        };

        let source = null;
        if (binding.sourceName === 'state') {
          source = state;
        } else {
          source = connect[binding.sourceName];
        }
        if (source && typeof source.watch === 'function') {
          const unsubscribe = source.watch(binding.path.join('.'), updateValue);
          this.binding_cleanups[this.binding_cleanups.length] = unsubscribe;
          updateValue(binding.accessor(source));
        } else {
          // Source not found or not watchable
          updateValue('');
        }
      }
    }
  }

  _apply_one_time_binding(binding) {
    const placeholder = `[${binding.id}]`;
    const fragment = this.fragment;
    const sourceName = binding.sourceName;
    const accessor = binding.accessor;
    let source;
    if (sourceName === 'state') {
      source = this.state;
    } else {
      source = this.constructor.connect[sourceName];
    }
    const value = (source ? accessor(source) : '') || '';

    // TreeWalker for both attributes and text
    const walker = document.createTreeWalker(
      fragment,
      NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
      null,
      false
    );
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.nodeType === 1) {
        // Attributes
        const attributes = node.attributes;
        for (let i = 0, len = attributes.length; i < len; i++) {
          const attr = attributes[i];
          const strVal = attr.value;
          const phIndex = strVal.indexOf(placeholder);
          if (phIndex !== -1) {
            attr.value = strVal.replace(placeholder, value);
          }
        }
      } else if (node.nodeType === 3) {
        // Text node
        const txt = node.textContent;
        const phIndex = txt.indexOf(placeholder);
        if (phIndex !== -1) {
          node.textContent = txt.replace(placeholder, value);
        }
      }
    }
  }

  _setup_events() {
    const event_map = this.constructor.event_map;
    const len = event_map.keys.length;
    const event_cleanups = [];
    for (let i = 0; i < len; i++) {
      const type = event_map.keys[i];
      const handlerName = event_map.values[i];
      const handler = (typeof this[handlerName] === 'function')
        ? this[handlerName].bind(this)
        : () => {};
      this.addEventListener(type, handler);
      event_cleanups[event_cleanups.length] = () => {
        this.removeEventListener(type, handler);
      };
    }
    this.event_cleanups = event_cleanups;
  }

  connectedCallback() {
    this.appendChild(this.fragment);
    if (typeof this.mount === 'function') {
      this.mount();
    }
  }

  disconnectedCallback() {
    if (typeof this.un_mount === 'function') {
      this.un_mount();
    }
    // Clean up event listeners
    const event_cleanups = this.event_cleanups;
    for (let i = 0, len = event_cleanups.length; i < len; i++) {
      event_cleanups[i]();
    }
    // Clean up watchers
    const binding_cleanups = this.binding_cleanups;
    for (let i = 0, bLen = binding_cleanups.length; i < bLen; i++) {
      binding_cleanups[i]();
    }
  }

  mount() {}
  un_mount() {}
}
