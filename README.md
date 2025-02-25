# Syna

Syna is a lightweight, high-performance framework for building single-page applications (SPAs) using Web Components. Designed to be fast, memory-efficient, and to offer granular, low-level control. **This is a personal project I built for myself, driven by a passion for learning and experimentation, using Grok 3 and O3-mini**.

## Features

- **Web Components**: Create reusable custom elements with native browser support.
- **Reactive State Management**: Efficiently manage and react to state changes with minimal overhead.
- **Templating**: Use a simple, powerful syntax for static and dynamic bindings.
- **Event Handling**: Declaratively define and handle events with precision.
- **Watchers**: Monitor state changes and execute custom logic in response.
- **Parallel Computation**: Leverage Web Workers for heavy computations without blocking the main thread.
- **Efficient Rendering**: Minimize DOM manipulations for optimal performance.
- **Memory Management**: Includes options for disposable components to reduce memory footprint.

## Getting Started

### Installation

To use Syna, include the scripts in your HTML file.

```html
<script src="path/to/state.js"></script>
<script src="path/to/sc.js"></script>
```

### Basic Usage

Define a custom element by extending the `sc` class, providing a template and optional state:

```javascript
class MyComponent extends sc {
  static template = `
    <div>Hello, {{ state.name }}!</div>
  `;

  static state = {
    name: "World"
  };
}

customElements.define("my-component", MyComponent);
```

Use it in your HTML:

```html
<my-component></my-component>
```

This renders:

```html
<div>Hello, World!</div>
```

## Creating Components

### Defining a Component

Components extend the `sc` class and can include a template, state, and optional CSS:

```javascript
class CounterComponent extends sc {
  static template = `
    <div>Count: @{{ state.count }}</div>
    <button data-ref="increment">Increment</button>
  `;

  static state = {
    count: 0
  };

  static css = `
    div { font-size: 1.2em; }
    button { padding: 5px 10px; }
  `;
}

customElements.define("counter-component", CounterComponent);
```

### Template Syntax

Templates use `{{ source.expression }}` for static bindings and `@{{ source.expression }}` for dynamic bindings:
- `{{ state.name }}`: Static binding, evaluated once.
- `@{{ state.name }}`: Dynamic binding, updates when the state changes.

## Bindings and Templating

### Static Bindings

Static bindings are evaluated once when the component is initialized:

```javascript
class StaticComponent extends sc {
  static template = `
    <div>App Name: {{ state.appName }}</div>
  `;

  static state = {
    appName: "Syna"
  };
}

customElements.define("static-component", StaticComponent);
```

Renders: `<div>App Name: Syna</div>`

### Dynamic Bindings

Dynamic bindings update automatically when the state changes. Use `@{{ }}`:

```javascript
class DynamicComponent extends sc {
  static template = `
    <div>Count: @{{ state.count }}</div>
    <button data-ref="inc">+1</button>
  `;

  static state = {
    count: 0
  };

  static events = {
    "click.inc": "increment"
  };

  increment() {
    this.state.count++;
  }
}

customElements.define("dynamic-component", DynamicComponent);
```

Clicking the button updates the count in real-time.

### HTML Bindings

To bind HTML content dynamically, append `:html` to the expression:

```javascript
class HtmlComponent extends sc {
  static template = `
    <div>@{{ state.content:html }}</div>
  `;

  static state = {
    content: "<strong>Bold Text</strong>"
  };
}

customElements.define("html-component", HtmlComponent);
```

Renders: `<div><strong>Bold Text</strong></div>`

## Event Handling

### Declaring Events

Events are defined in the `events` static property using the `eventType.refName` syntax:

```javascript
class EventComponent extends sc {
  static template = `
    <button data-ref="clickMe">Click Me</button>
  `;

  static state = {
    clicked: false
  };

  static events = {
    "click.clickMe": "handleClick"
  };

  handleClick() {
    this.state.clicked = true;
    console.log("Button clicked!");
  }
}

customElements.define("event-component", EventComponent);
```

Clicking the button triggers `handleClick`.

### Global Events

Events without a `refName` are attached to the component itself:

```javascript
class GlobalEventComponent extends sc {
  static template = `
    <div>Click anywhere on the component</div>
  `;

  static events = {
    "click": "handleComponentClick"
  };

  handleComponentClick(event) {
    console.log("Component clicked at", event.clientX, event.clientY);
  }
}

customElements.define("global-event-component", GlobalEventComponent);
```

## Watchers

### Setting Up Watchers

Watchers monitor state changes and trigger callbacks. Define them in the `watchers` static property:

```javascript
class WatcherComponent extends sc {
  static template = `
    <div>Count: @{{ state.count }}</div>
  `;

  static state = {
    count: 0
  };

  static watchers = {
    "state.count": "onCountChange"
  };

  onCountChange(newValue) {
    console.log("Count changed to:", newValue);
  }

  mount() {
    setInterval(() => this.state.count++, 1000);
  }
}

customElements.define("watcher-component", WatcherComponent);
```

Logs the count every second as it increments.

## Parallel Computation

### Using Web Workers

Define a `parallel` function to run computations in a Web Worker:

```javascript
class ParallelComponent extends sc {
  static template = `
    <div>Result: @{{ state.result }}</div>
    <button data-ref="compute">Compute</button>
  `;

  static state = {
    result: "Not computed yet"
  };

  static parallel = function(data) {
    return data.map(x => x * 2);
  };

  static events = {
    "click.compute": "runComputation"
  };

  async runComputation() {
    const result = await this.run_parallel([1, 2, 3]);
    this.state.result = result.join(", ");
  }
}

customElements.define("parallel-component", ParallelComponent);
```

Clicking "Compute" runs the task in a Web Worker and updates the result to "2, 4, 6".

## Advanced Topics

### Lifecycle Methods

Implement `mount` and `un_mount` for initialization and cleanup:

```javascript
class LifecycleComponent extends sc {
  static template = `<div>I’m alive!</div>`;

  mount() {
    console.log("Component mounted");
  }

  un_mount() {
    console.log("Component unmounted");
  }
}

customElements.define("lifecycle-component", LifecycleComponent);
```

### Detaching and Reattaching Components

Detach a component and reattach it later:

```javascript
class DetachComponent extends sc {
  static template = `<div>Detach Me</div>`;

  detachMe() {
    const detachment = this.detach();
    setTimeout(() => detachment.reattach(document.body), 2000);
  }
}

customElements.define("detach-component", DetachComponent);
```

Call `detachMe()` to remove and reattach after 2 seconds.

### Memory Management

Mark components as `disposable` to clean up registration data after initialization:

```javascript
class DisposableComponent extends sc {
  static template = `<div>Temporary</div>`;
  static disposable = true;
}

customElements.define("disposable-component", DisposableComponent);
```

Reduces memory usage for short-lived components.

## Connecting External State

Use `connect` to bind external reactive state:

```javascript
const externalState = syna({ message: "Hello from outside" });

class ConnectedComponent extends sc {
  static template = `
    <div>@{{ external.message }}</div>
  `;

  static connect = {
    external: externalState
  };
}

customElements.define("connected-component", ConnectedComponent);
```

Updates when `externalState.message` changes.

## API Reference

### `sc` Class

- **`static template`**: String or function returning the component’s HTML template.
- **`static css`**: String of CSS styles appended to the document head.
- **`static events`**: Object mapping `eventType.refName` to method names.
- **`static watchers`**: Object mapping `source.key` to method names.
- **`static state`**: Initial reactive state object.
- **`static connect`**: Object of external reactive state sources.
- **`static parallel`**: Function to run in a Web Worker.
- **`static disposable`**: Boolean to clean up registration data after initialization.
- **`run_parallel(input, options)`**: Runs the `parallel` function with input data.
- **`detach()`**: Detaches the component, returns `{ reattach(target) }`.

### `syna` State Management

Creates a reactive state object:

```javascript
const state = syna({ count: 0 });

// Watch a property
const unsubscribe = state.watch("count", (newValue) => {
  console.log("Count:", newValue);
});

// Update state
state.count = 1; // Triggers watcher

// Unsubscribe
unsubscribe();
```

Supports nested properties:

```javascript
const state = syna({ user: { name: "Alice" } });
state.watch("user.name", (name) => console.log(name));
state.user.name = "Bob"; // Logs "Bob"
```

## Contributing

Since Syna is a personal learning project, contributions are not expected, but feel free to explore the code, fork it, or provide feedback! Check out `src/sc.js` and `src/state.js` to see how it works under the hood.

## License

[MIT License](https://opensource.org/licenses/MIT) - feel free to use, modify, and distribute as you see fit.