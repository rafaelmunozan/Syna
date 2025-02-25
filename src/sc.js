let css_node = document.querySelector('style[id="sc_css"]');

class sc extends HTMLElement {
  static template = '';
  static css = '';
  static events = {};
  static watchers = {};
  static state = {};
  static connect = {};
  static parallel = null;
  static registered = false;
  static disposable = false;

  static prototype_fragment = null;
  static ref_paths = [];
  static binding_instructions = null;
  static binding_node_paths = null;
  static event_map = null;
  static watchers_map = null;
  static _parallel_blob = null;
  static _parallel_url = null;

  static register() {
    if (this.registered) return;
    this.registered = true;

    let tpl = this.template;
    if (typeof tpl !== 'function') {
      const temp_str = tpl;
      tpl = function () { return temp_str; };
      this.template = tpl;
    }

    this._process_css();

    const template_string = tpl();
    const tpl_process = this._process_template(template_string);
    const processed_template = tpl_process[0];
    const binding_instructions = tpl_process[1];

    const template_el = document.createElement('template');
    template_el.innerHTML = processed_template;
    this.prototype_fragment = template_el.content;

    this.ref_paths = this._collect_refs(this.prototype_fragment);
    this.binding_node_paths = this._scan_for_binding_paths(this.prototype_fragment);

    const events_obj = this.events;
    const event_keys = Object.keys(events_obj);
    const event_values = new Array(event_keys.length);
    for (let i = 0, len = event_keys.length; i < len; i++) {
      event_values[i] = events_obj[event_keys[i]];
    }
    this.event_map = { keys: event_keys, values: event_values };
    this.binding_instructions = binding_instructions;

    const watchers_obj = this.watchers || {};
    const watchers_keys = Object.keys(watchers_obj);
    const watchers_values = new Array(watchers_keys.length);
    for (let i = 0, len = watchers_keys.length; i < len; i++) {
      watchers_values[i] = watchers_obj[watchers_keys[i]];
    }
    this.watchers_map = { keys: watchers_keys, values: watchers_values };

    if (this.parallel) {
      const worker_code = `self.onmessage=function(e){var d=e.data;var r=(${this.parallel.toString()})(d.data);self.postMessage({id:d.id,result:r});};`;
      this._parallel_blob = new Blob([worker_code], { type: 'text/javascript' });
      this._parallel_url = URL.createObjectURL(this._parallel_blob);
    }
  }

  static _collect_refs(fragment) {
    const refs = [];
    const stack = [{ node: fragment, path: [] }];
    while (stack.length) {
      const current = stack.pop();
      const node = current.node;
      const path = current.path;
      if (node.nodeType === 1 && node.hasAttribute('data-ref')) {
        refs.push({ ref_name: node.getAttribute('data-ref'), path: path.slice() });
      }
      let child = node.firstChild;
      let idx = 0;
      while (child) {
        stack.push({ node: child, path: path.concat(idx) });
        child = child.nextSibling;
        idx++;
      }
    }
    return refs;
  }

  static _scan_for_binding_paths(fragment) {
    const binding_node_paths = {};
    const stack = [{ node: fragment, path: [] }];
    while (stack.length) {
      const current = stack.pop();
      const node = current.node;
      const path = current.path;
      if (node.nodeType === 1) {
        const attrs = node.attributes;
        for (let i = 0, alen = attrs.length; i < alen; i++) {
          const attr = attrs[i];
          const val = attr.value;
          const matches = val.match(/\[\_\_bind_\d+\]/g);
          if (matches) {
            for (let j = 0, mlen = matches.length; j < mlen; j++) {
              const binding_id = matches[j].slice(1, -1);
              if (!binding_node_paths[binding_id]) binding_node_paths[binding_id] = [];
              binding_node_paths[binding_id].push({
                path: path.slice(),
                type: 'attribute',
                name: attr.name,
              });
            }
          }
        }
      } else if (node.nodeType === 3) {
        const matches = node.textContent.match(/\[\_\_bind_\d+\]/g);
        if (matches) {
          for (let j = 0, mlen = matches.length; j < mlen; j++) {
            const binding_id = matches[j].slice(1, -1);
            if (!binding_node_paths[binding_id]) binding_node_paths[binding_id] = [];
            binding_node_paths[binding_id].push({
              path: path.slice(),
              type: 'text',
            });
          }
        }
      }
      const children = node.childNodes;
      for (let i = children.length - 1; i >= 0; i--) {
        const newPath = path.slice();
        newPath.push(i);
        stack.push({ node: children[i], path: newPath });
      }
    }
    return binding_node_paths;
  }

  static _process_template(template) {
    const binding_instructions = [];
    let binding_count = 0;
    let pos = 0;
    const template_len = template.length;
    let result = '';
    while (pos < template_len) {
      const next_open = template.indexOf('{{', pos);
      if (next_open === -1) {
        result += template.substring(pos);
        break;
      }
      const is_dynamic = template.charCodeAt(next_open - 1) === 64;
      const start_pos = is_dynamic ? next_open - 1 : next_open;
      const close_pos = template.indexOf('}}', next_open);
      if (close_pos === -1) break;
      const expression = template.substring(next_open + 2, close_pos).trim();
      const binding_id = '__bind_' + binding_count++;
      result += template.substring(pos, start_pos);
      let is_attribute = false;
      let attribute_name = null;
      const seg_start = template.lastIndexOf('<', start_pos);
      if (seg_start !== -1) {
        const attr_start = template.substring(seg_start, start_pos);
        const attr_match = /\s([^\s=]+)=["'][^"']*$/.exec(attr_start);
        if (attr_match) {
          is_attribute = true;
          attribute_name = attr_match[1];
        }
      }
      const is_html = expression.endsWith(':html');
      const raw_expr = is_html ? expression.substring(0, expression.length - 5) : expression;
      const dot_pos = raw_expr.indexOf('.');
      const source_name = dot_pos === -1 ? raw_expr : raw_expr.substring(0, dot_pos);
      const prop_path = dot_pos === -1 ? [] : raw_expr.substring(dot_pos + 1).split('.');
      binding_instructions.push({
        id: binding_id,
        source_name: source_name,
        path: prop_path,
        original_content: template.substring(start_pos, close_pos + 2),
        is_dynamic: is_dynamic,
        is_html: is_html,
        is_attribute: is_attribute,
        attribute_name: attribute_name,
        accessor: this._create_accessor(prop_path),
      });
      result += '[' + binding_id + ']';
      pos = close_pos + 2;
    }
    return [result, binding_instructions];
  }

  static _process_css() {
    if (!this.css) return;
    if (!css_node) {
      css_node = document.createElement('style');
      css_node.id = 'sc_css';
      document.head.appendChild(css_node);
    }
    css_node.textContent += this.css;
  }

  static _create_accessor(path_arr) {
    const len = path_arr.length;
    if (!len) return function (obj) { return obj; };
    return function (obj) {
      let current = obj;
      for (let i = 0; i < len && current != null; i++) {
        current = current[path_arr[i]];
      }
      return current;
    };
  }

  static _cleanup_registration_data() {
    this.prototype_fragment = null;
    this.ref_paths = null;
    this.binding_instructions = null;
    this.binding_node_paths = null;
    this.event_map = null;
    this.watchers_map = null;
    this.template = null;
    this.events = null;
    this.watchers = null;
    this.state = null;
    this.css = null;
  }

  constructor() {
    super();
    const ctor = this.constructor;
    ctor.register();

    this.fragment = null;
    this.nodes = null;
    this.state = syna(ctor.state);
    this.is_attached = false;
    this.binding_cleanups = null;
    this.event_cleanups = null;
    this.watchers_unsub = null;
    this._is_initialized = false;
    this.worker = null;
    this._parallel_pending = null;

    if (ctor._parallel_url) {
      this.worker = new Worker(ctor._parallel_url);
      this._parallel_pending = new Map();
      this.worker.onmessage = (e) => {
        const id = e.data.id;
        const result = e.data.result;
        const pending = this._parallel_pending.get(id);
        if (pending) {
          pending.resolve(result);
          this._parallel_pending.delete(id);
        }
      };
      this.worker.onerror = (e) => {
        const keys = Array.prototype.slice.call(this._parallel_pending.keys());
        for (let i = 0, len = keys.length; i < len; i++) {
          const id = keys[i];
          const pending = this._parallel_pending.get(id);
          pending.reject(e);
          this._parallel_pending.delete(id);
        }
      };
    }
  }

  connectedCallback() {
    if (!this._is_initialized) {
      const ctor = this.constructor;
      this.fragment = ctor.prototype_fragment.cloneNode(true);

      this.nodes = Object.create(null);
      this.binding_cleanups = [];
      this.event_cleanups = [];
      this.watchers_unsub = [];

      const refs = ctor.ref_paths;
      for (let i = 0, len = refs.length; i < len; i++) {
        let node = this.fragment;
        const path = refs[i].path;
        for (let j = 0, jlen = path.length; j < jlen; j++) {
          node = node.childNodes[path[j]];
        }
        this.nodes[refs[i].ref_name] = node;
      }

      this._process_bindings();
      this._setup_events();
      this._setup_watchers();

      this.appendChild(this.fragment);
      this.fragment = null;
      this._is_initialized = true;

      if (ctor.disposable) {
        ctor._cleanup_registration_data();
      }
    }

    if (typeof this.mount === 'function') this.mount();
    this.is_attached = true;
  }

  disconnectedCallback() {
    if (this._is_detaching) {
      this._is_detaching = false;
      return;
    }
    if (typeof this.un_mount === 'function') this.un_mount();

    if (this.event_cleanups) {
      for (let i = 0, len = this.event_cleanups.length; i < len; i++) {
        const cleanup = this.event_cleanups[i];
        if (typeof cleanup === 'function') cleanup();
      }
      this.event_cleanups = null;
    }

    if (this.binding_cleanups) {
      for (let i = 0, len = this.binding_cleanups.length; i < len; i++) {
        const unsubscribe = this.binding_cleanups[i];
        if (typeof unsubscribe === 'function') unsubscribe();
      }
      this.binding_cleanups = null;
    }

    if (this.watchers_unsub) {
      for (let i = 0, len = this.watchers_unsub.length; i < len; i++) {
        const unsub = this.watchers_unsub[i];
        if (typeof unsub === 'function') unsub();
      }
      this.watchers_unsub = null;
    }

    if (this.worker) {
      const keys = Array.prototype.slice.call(this._parallel_pending.keys());
      for (let i = 0, len = keys.length; i < len; i++) {
        const id = keys[i];
        const pending = this._parallel_pending.get(id);
        pending.reject(new Error('Component disconnected'));
        this._parallel_pending.delete(id);
      }
      this.worker.terminate();
      this.worker = null;
    }

    this.nodes = null;
    this.fragment = null;
  }

  detach() {
    if (!this.isConnected) return;
    this._detached_node = this;
    this._is_detaching = true;
    const parent = this.parentNode;
    if (parent) parent.removeChild(this);
    return {
      reattach: (target_element) => {
        if (this._detached_node && !this.isConnected && target_element) {
          target_element.appendChild(this._detached_node);
          this._detached_node = null;
        }
      },
    };
  }

  run_parallel(input, options = {}) {
    if (!this.worker) {
      throw new Error('Parallel computation is not available for this component.');
    }
    const id = Math.random().toString(36).slice(2);
    const transfer = options.transfer || [];
    return new Promise((resolve, reject) => {
      this._parallel_pending.set(id, { resolve: resolve, reject: reject });
      this.worker.postMessage({ id: id, data: input }, transfer);
    });
  }

  _process_bindings() {
    const instructions = this.constructor.binding_instructions;
    const binding_paths = this.constructor.binding_node_paths;

    const inst_len = instructions.length;
    for (let i = 0; i < inst_len; i++) {
      const binding = instructions[i];
      if (binding.is_dynamic && binding.is_html) {
        const nodes_info = binding_paths[binding.id] || [];
        const nlen = nodes_info.length;
        for (let j = 0; j < nlen; j++) {
          if (nodes_info[j].type === 'text') {
            let node = this.fragment;
            const path = nodes_info[j].path;
            const path_len = path.length;
            for (let k = 0; k < path_len; k++) {
              node = node.childNodes[path[k]];
            }
            const marker = document.createComment('[' + binding.id + ']');
            marker.__syna_original = node.textContent;
            marker.__syna_placeholders = {};
            node.parentNode.replaceChild(marker, node);
            nodes_info[j].type = 'marker';
          }
        }
      }
    }

    for (let i = 0; i < inst_len; i++) {
      const binding = instructions[i];
      if (!binding.is_dynamic) {
        const nodes_info = binding_paths[binding.id] || [];
        const source = binding.source_name === 'state' ? this.state : this.constructor.connect[binding.source_name];
        const val = (source ? binding.accessor(source) : '') || '';
        const str_val = String(val);
        const nlen = nodes_info.length;
        for (let j = 0; j < nlen; j++) {
          let node = this.fragment;
          const path = nodes_info[j].path;
          const path_len = path.length;
          for (let k = 0; k < path_len; k++) {
            node = node.childNodes[path[k]];
          }
          if (nodes_info[j].type === 'attribute') {
            node.setAttribute(nodes_info[j].name, node.getAttribute(nodes_info[j].name).replace('[' + binding.id + ']', str_val));
          } else if (nodes_info[j].type === 'text') {
            if (binding.is_html) {
              const template = document.createElement('template');
              template.innerHTML = node.textContent.replace('[' + binding.id + ']', str_val);
              node.parentNode.replaceChild(template.content, node);
            } else {
              node.textContent = node.textContent.replace('[' + binding.id + ']', str_val);
            }
          }
        }
      }
    }

    const binding_groups = {};
    for (let i = 0; i < inst_len; i++) {
      const binding = instructions[i];
      if (binding.is_dynamic) {
        const source_name = binding.source_name;
        const path_key = binding.path.join('.');
        const watch_key = source_name + '.' + path_key;
        if (!binding_groups[watch_key]) {
          binding_groups[watch_key] = {
            source_name: source_name,
            path: binding.path,
            accessor: this.constructor._create_accessor(binding.path),
            update_fns: []
          };
        }
        const nodes_info = binding_paths[binding.id] || [];
        const nodes = [];
        const nlen = nodes_info.length;
        for (let j = 0; j < nlen; j++) {
          let node = this.fragment;
          const path = nodes_info[j].path;
          const path_len = path.length;
          for (let k = 0; k < path_len; k++) {
            node = node.childNodes[path[k]];
          }
          nodes.push({ node: node, type: nodes_info[j].type, name: nodes_info[j].name });
        }
        for (let j = 0, n2 = nodes.length; j < n2; j++) {
          if (nodes[j].type === 'text' && !nodes[j].node.__syna_original) {
            nodes[j].node.__syna_original = nodes[j].node.textContent;
            nodes[j].node.__syna_placeholders = {};
          }
        }
        const update_value = (val) => {
          const str_val = val == null ? '' : String(val);
          for (let j = 0, n3 = nodes.length; j < n3; j++) {
            const node = nodes[j].node;
            if (nodes[j].type === 'attribute') {
              if (!node.__syna_originals) {
                node.__syna_originals = {};
                node.__syna_placeholders = {};
              }
              if (!node.__syna_originals[nodes[j].name]) {
                node.__syna_originals[nodes[j].name] = node.getAttribute(nodes[j].name);
              }
              node.__syna_placeholders[binding.id] = str_val;
              let new_val = node.__syna_originals[nodes[j].name];
              for (var ph in node.__syna_placeholders) {
                new_val = new_val.replace('[' + ph + ']', node.__syna_placeholders[ph]);
              }
              node.setAttribute(nodes[j].name, new_val);
            } else if (nodes[j].type === 'marker') {
              node.__syna_placeholders[binding.id] = str_val;
              let html_string = node.__syna_original;
              for (var ph in node.__syna_placeholders) {
                html_string = html_string.replace('[' + ph + ']', node.__syna_placeholders[ph]);
              }
              const parent = node.parentNode;
              if (!parent) continue;
              let sibling = node.nextSibling;
              while (sibling && sibling.__dynamicHTML) {
                const next = sibling.nextSibling;
                parent.removeChild(sibling);
                sibling = next;
              }
              if (html_string) {
                const template = document.createElement('template');
                template.innerHTML = html_string;
                let child = template.content.firstChild;
                while (child) {
                  const next = child.nextSibling;
                  child.__dynamicHTML = true;
                  parent.insertBefore(child, node.nextSibling);
                  child = next;
                }
              }
            } else if (nodes[j].type === 'text') {
              node.__syna_placeholders[binding.id] = str_val;
              let new_text = node.__syna_original;
              for (var ph in node.__syna_placeholders) {
                new_text = new_text.replace('[' + ph + ']', node.__syna_placeholders[ph]);
              }
              node.textContent = new_text;
            }
          }
        };
        binding_groups[watch_key].update_fns.push(update_value);
      }
    }

    const group_keys = Object.keys(binding_groups);
    for (let i = 0, glen = group_keys.length; i < glen; i++) {
      const watch_key = group_keys[i];
      const group = binding_groups[watch_key];
      const source = group.source_name === 'state' ? this.state : this.constructor.connect[group.source_name];
      if (source && typeof source.watch === 'function') {
        const update_fns = group.update_fns;
        const wrapped_update = (val) => {
          for (let j = 0, ulen = update_fns.length; j < ulen; j++) {
            update_fns[j](val);
          }
        };
        const unsubscribe = source.watch(group.path.join('.'), wrapped_update);
        this.binding_cleanups.push(unsubscribe);
        const current_val = group.accessor(source);
        for (let j = 0, ulen = update_fns.length; j < ulen; j++) {
          update_fns[j](current_val);
        }
      }
    }
  }

  _setup_events() {
    const event_map = this.constructor.event_map;
    const event_keys = event_map.keys;
    const event_values = event_map.values;
    for (let i = 0, len = event_keys.length; i < len; i++) {
      const full_name = event_keys[i];
      const handler_name = event_values[i];
      const handler = (typeof this[handler_name] === 'function') ? this[handler_name].bind(this) : function(){};
      const dot_index = full_name.indexOf('.');
      if (dot_index > 0) {
        const event_type = full_name.substring(0, dot_index);
        const node_ref = full_name.substring(dot_index + 1);
        const target_node = this.nodes[node_ref];
        if (target_node) {
          target_node.addEventListener(event_type, handler);
          this.event_cleanups[i] = function() { target_node.removeEventListener(event_type, handler); };
        } else {
          this.event_cleanups[i] = function(){};
        }
      } else {
        this.addEventListener(full_name, handler);
        this.event_cleanups[i] = function() { this.removeEventListener(full_name, handler); }.bind(this);
      }
    }
  }

  _setup_watchers() {
    const watchers_map = this.constructor.watchers_map;
    if (!watchers_map) return;

    const w_keys = watchers_map.keys;
    const w_values = watchers_map.values;
    const watcher_groups = {};
    for (let i = 0, len = w_keys.length; i < len; i++) {
      const watch_def = w_keys[i];
      const callback_name = w_values[i];
      const callback_fn = (typeof this[callback_name] === 'function') ? this[callback_name].bind(this) : function(){};
      const dot_pos = watch_def.indexOf('.');
      if (dot_pos === -1) continue;
      const source_name = watch_def.substring(0, dot_pos);
      const key_path = watch_def.substring(dot_pos + 1);
      const watch_key = source_name + '.' + key_path;
      if (!watcher_groups[watch_key]) {
        watcher_groups[watch_key] = {
          source_name: source_name,
          key_path: key_path,
          callbacks: []
        };
      }
      watcher_groups[watch_key].callbacks.push(callback_fn);
    }
    const group_keys = Object.keys(watcher_groups);
    for (let i = 0, len = group_keys.length; i < len; i++) {
      const watch_key = group_keys[i];
      const group = watcher_groups[watch_key];
      const watch_source = group.source_name === 'state' ? this.state : this.constructor.connect[group.source_name];
      if (watch_source && typeof watch_source.watch === 'function') {
        const callbacks = group.callbacks;
        const wrapped_callback = function(val) {
          for (let j = 0, clen = callbacks.length; j < clen; j++) {
            callbacks[j](val);
          }
        };
        const unsub = watch_source.watch(group.key_path, wrapped_callback);
        this.watchers_unsub.push(unsub);
      }
    }
  }

  mount() {}
  un_mount() {}
}
