(() => {
    'use strict';

    const engine = window.oceanLab;
    if (!engine) {
        return;
    }

    const definitions = [
        ['pointerSize', 'Size', 0.01],
        ['pointerDepth', 'Divot', 0.01],
        ['clickGrowth', 'Click growth', 0.01],
        ['bodyCoupling', 'Wake grip', 0.01],
        ['bodyPressure', 'Pressure', 0.01],
        ['surfaceSmoothing', 'Smoothing', 0.001],
        ['drag', 'Decay', 0.01],
        ['disturbanceScale', 'Visibility', 0.5],
    ];
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    const panel = document.createElement('div');
    const header = document.createElement('div');
    const title = document.createElement('span');
    const reset = document.createElement('button');
    const rows = document.createElement('div');
    const hint = document.createElement('p');
    const controls = new Map();

    details.className = 'water-controls';
    details.dataset.localOnly = 'true';
    summary.textContent = 'Water';
    panel.className = 'water-controls__panel';
    header.className = 'water-controls__header';
    title.className = 'water-controls__title';
    title.textContent = 'Water interaction';
    reset.type = 'button';
    reset.textContent = 'Reset';
    rows.className = 'water-controls__rows';
    hint.className = 'water-controls__hint';
    hint.textContent = 'Local preview only · changes are not saved';

    /** Formats physical and visual values compactly without hiding precision. */
    function format(name, value) {
        if (name === 'surfaceSmoothing') {
            return value.toFixed(3);
        }
        if (name === 'disturbanceScale') {
            return value.toFixed(0);
        }
        return value.toFixed(2);
    }

    /** Synchronizes the visible controls with a full engine parameter set. */
    function show(parameterSet) {
        for (const [name, elements] of controls) {
            elements.input.value = String(parameterSet[name]);
            elements.output.textContent = format(name, parameterSet[name]);
        }
    }

    for (const [name, labelText, step] of definitions) {
        const row = document.createElement('div');
        const label = document.createElement('label');
        const input = document.createElement('input');
        const output = document.createElement('output');
        const [minimum, maximum] = engine.limits[name];

        row.className = 'water-control';
        label.htmlFor = `local-water-${name}`;
        label.textContent = labelText;
        input.id = `local-water-${name}`;
        input.type = 'range';
        input.min = String(minimum);
        input.max = String(maximum);
        input.step = String(step);
        input.addEventListener('input', () => {
            const value = Number(input.value);
            engine.setParameters({ [name]: value });
            output.textContent = format(name, value);
        });
        row.append(label, input, output);
        rows.append(row);
        controls.set(name, { input, output });
    }

    reset.addEventListener('click', () => {
        engine.setParameters(engine.defaults);
        engine.reset();
        show(engine.getParameters());
    });
    header.append(title, reset);
    panel.append(header, rows, hint);
    details.append(summary, panel);
    document.body.append(details);
    show(engine.getParameters());
})();
