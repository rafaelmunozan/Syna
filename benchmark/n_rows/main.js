
class Row extends sc {
  static template = `
    <div class="row">
      <div>Row @{{state.id}}</div>
      <div>Value: @{{state.value}}</div>
    </div>
  `;

  static css = `
    .row {
      display: flex;
      padding: 8px;
      border-bottom: 1px solid #eee;
      justify-content: space-between;
    }
  `;

  static state = {
    id: 0,
    value: 0
  };
}

class Container extends sc {
  static disposable = true;
  static template = `
    <div class="container">
      <div class="controls">
        <button data-ref="addBtn">Run Benchmark</button>
        <div>
          <div>Mean Duration: @{{state.stats.mean}}ms</div>
          <div>CI (95%): ±@{{state.stats.ci}}ms</div>
          <div>Slowdown: @{{state.stats.slowdown}}x</div>
          <div>Memory Usage: @{{state.stats.memory}}MB</div>
        </div>
      </div>
      <div class="heatmap" data-ref="heatmap"></div>
      <div class="rows" data-ref="rowsContainer"></div>
    </div>
  `;

  static css = `
    .container {
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
    }
    .controls {
      display: flex;
      gap: 20px;
      align-items: center;
      margin-bottom: 20px;
    }
    .heatmap {
      display: grid;
      grid-template-columns: repeat(10, 1fr);
      gap: 2px;
      margin-bottom: 20px;
    }
    .heatmap-cell {
      aspect-ratio: 1;
      border-radius: 2px;
    }
  `;

  static state = {
    timeTaken: 0,
    stats: {
      mean: 0,
      ci: 0,
      slowdown: 1,
      memory: 0
    },
    memoryData: []
  };

  static events = {
    'click.addBtn': 'handleAdd'
  };

  async handleAdd() {
    const iterations = 10;
    const n = 1_000;
    const samples = [];
    const memoryData = [];
    
    // Run iterations
    for (let iter = 0; iter < iterations; iter++) {
      // Force garbage collection if possible
      if (window.gc) window.gc();

      const startMemory = performance.memory?.usedJSHeapSize || 0;
      const startTime = performance.now();
      const fragment = document.createDocumentFragment();

      for (let i = 0; i < n; i++) {
        const row = document.createElement('benchmark-row');
        row.state.id = i + 1;
        row.state.value = i + 2;
        fragment.appendChild(row);
      }

      this.nodes.rowsContainer.innerHTML = '';
      this.nodes.rowsContainer.appendChild(fragment);
      
      const endMemory = performance.memory?.usedJSHeapSize || 0;
      const duration = performance.now() - startTime;
      const memoryUsed = (endMemory - startMemory) / (1024 * 1024); // Convert to MB

      samples.push(duration);
      memoryData.push(memoryUsed);
      console.log('time taken by iteration ' + iter + ' is ' + duration);
    }    

    // Calculate statistics
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    
    // Standard deviation
    const variance = samples.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / (samples.length - 1);
    const stdDev = Math.sqrt(variance);
    
    // 95% confidence interval using t-distribution (t-value for n=5, α=0.05 is 2.776)
    const ci = (2.776 * stdDev) / Math.sqrt(samples.length);
    
    // Slowdown relative to fastest run
    const fastest = Math.min(...samples);
    const slowdown = mean / fastest;

    // Calculate memory statistics
    const avgMemory = memoryData.reduce((a, b) => a + b, 0) / memoryData.length;

    // Update state
    this.state.stats = {
      mean: mean.toFixed(2),
      ci: ci.toFixed(2),
      slowdown: slowdown.toFixed(2),
      memory: avgMemory.toFixed(2)
    };

    // Update heatmap
    this.updateHeatmap(samples);
  }

  // Add new method to update heatmap
  updateHeatmap(samples) {
    const heatmapContainer = this.nodes.heatmap;
    heatmapContainer.innerHTML = '';

    const min = Math.min(...samples);
    const max = Math.max(...samples);
    
    samples.forEach(value => {
      const cell = document.createElement('div');
      cell.className = 'heatmap-cell';
      
      // Calculate color intensity (0-1)
      const intensity = (value - min) / (max - min);
      
      // Use a color gradient from green to red
      const hue = ((1 - intensity) * 120).toFixed(0); // 120 is green, 0 is red
      cell.style.backgroundColor = `hsl(${hue}, 70%, 50%)`;
      
      // Add tooltip
      cell.title = `${value.toFixed(2)}ms`;
      
      heatmapContainer.appendChild(cell);
    });
  }
}

customElements.define('benchmark-row', Row);
customElements.define('app-root', Container);