import { sc } from '../syna/sc.js';
import { BenchmarkRow } from './row.js';

export class BenchmarkTable extends sc {
    static template = `
        <div class="benchmark-container">
            <div class="benchmark-actions">
                <button class="btn btn-primary" data-ref="runBtn">Run Benchmark</button>
                <input type="number" class="input" value="1000" data-ref="rowCount" style="width: 100px">
            </div>
            <div class="benchmark-container" data-ref="container"></div>
        </div>
    `;

    static events = {
        click: 'handleClick'
    };

    handleClick(e) {
        if (e.target === this.nodes.runBtn) {
            this.runBenchmark();
        }
    }

    runBenchmark() {
        // Clear previous results
        this.nodes.container.innerHTML = '';

        const count = parseInt(this.nodes.rowCount.value) || 1000;
        const startTime = performance.now();

        // Create rows using document.createElement for proper upgrade/lifecycle.
        const rows = [];
        for (let i = 0; i < count; i++) {
            const row = document.createElement('benchmark-row');
            // Set state properties after element is created.
            row.state.index = i + 1;
            row.state.time = 0;
            rows.push(row);
            this.nodes.container.appendChild(row);
        }

        const endTime = performance.now();
        const totalTime = endTime - startTime;
        const timePerRow = totalTime / count;

        // Update rows' times
        rows.forEach(row => {
            row.state.time = timePerRow.toFixed(3);
        });

        console.log(`Created ${count} rows in ${totalTime.toFixed(2)}ms`);
        console.log(`Average time per row: ${timePerRow.toFixed(3)}ms`);
    }
}

customElements.define('benchmark-table', BenchmarkTable);