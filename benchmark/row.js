import { sc } from '../syna/sc.js';

export class BenchmarkRow extends sc {
    static template = `
        <div class="benchmark-row" data-ref="rowRoot">
            <div class="cell" data-ref="indexCell">{{state.index}}</div>
            <div class="cell" data-ref="timeCell">{{state.time}}ms</div>
        </div>
    `;

    static state = {
        index: 0,
        time: 0
    };
}

customElements.define('benchmark-row', BenchmarkRow);