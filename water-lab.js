(() => {
    'use strict';

    const engine = window.oceanLab;
    const canvas = document.querySelector('.ocean-canvas');
    const controls = document.querySelector('.control-list');
    const status = document.querySelector('.scenario-status');
    const metricFps = document.querySelector('[data-metric="fps"]');
    const metricPhysics = document.querySelector('[data-metric="physics"]');
    const metricState = document.querySelector('[data-metric="state"]');
    const pointerId = 8102;
    let scenarioGeneration = 0;

    if (!engine || !canvas) {
        status.textContent = 'The GPU solver could not initialize.';
        return;
    }

    const controlDefinitions = [
        ['gravity', 'Gravity', 0.01],
        ['meanDepth', 'Water depth', 0.001],
        ['viscosity', 'Viscosity', 0.00001],
        ['drag', 'Drag', 0.01],
        ['bodyCoupling', 'Body coupling', 0.01],
        ['bodyDisplacement', 'Displacement', 0.01],
        ['bodyPressure', 'Body pressure', 0.01],
        ['surfaceSmoothing', 'Ripple smoothing', 0.001],
        ['clickGrowth', 'Click growth', 0.01],
        ['disturbanceScale', 'Visual gain', 0.1],
    ];
    const inputByName = new Map();

    /** Formats small physical coefficients without hiding useful precision. */
    function formatValue(name, value) {
        if (name === 'viscosity') {
            return value.toFixed(5);
        }
        if (name === 'meanDepth') {
            return value.toFixed(3);
        }
        if (name === 'surfaceSmoothing') {
            return value.toFixed(3);
        }
        return value.toFixed(value < 1 ? 2 : 1);
    }

    /** Creates one bounded range control from the engine's stability limits. */
    function createControl([name, label, step]) {
        const row = document.createElement('div');
        const labelElement = document.createElement('label');
        const input = document.createElement('input');
        const value = document.createElement('output');
        const limits = engine.limits[name];

        row.className = 'control-row';
        labelElement.htmlFor = `control-${name}`;
        labelElement.textContent = label;
        input.id = `control-${name}`;
        input.type = 'range';
        input.min = String(limits[0]);
        input.max = String(limits[1]);
        input.step = String(step);
        value.className = 'control-value';
        input.addEventListener('input', () => {
            const numericValue = Number(input.value);
            engine.setParameters({ [name]: numericValue });
            value.textContent = formatValue(name, numericValue);
        });
        row.append(labelElement, input, value);
        controls.append(row);
        inputByName.set(name, { input, value });
    }

    /** Synchronizes every slider with one complete parameter set. */
    function showParameters(parameterSet) {
        for (const [name, elements] of inputByName) {
            elements.input.value = String(parameterSet[name]);
            elements.value.textContent = formatValue(name, parameterSet[name]);
        }
    }

    /** Converts water UV coordinates into viewport pointer coordinates. */
    function viewportPoint(x, y) {
        const bounds = canvas.getBoundingClientRect();
        return {
            x: bounds.left + x * bounds.width,
            y: bounds.top + (1 - y) * bounds.height,
        };
    }

    /** Sends a real PointerEvent through the same production input path. */
    function sendPointer(
        type,
        x,
        y,
        pressed = false,
        pointerType = 'mouse',
        eventPointerId = pointerId,
    ) {
        const point = viewportPoint(x, y);
        window.dispatchEvent(new PointerEvent(type, {
            bubbles: true,
            buttons: pressed ? 1 : 0,
            clientX: point.x,
            clientY: point.y,
            pointerId: eventPointerId,
            pointerType,
        }));
    }

    /** Waits in wall-clock time so scripted scenarios remain visually readable. */
    function delay(milliseconds) {
        return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
    }

    /** Moves one body along a smooth path with deterministic timing. */
    async function movePath(
        points,
        duration,
        pressed,
        generation,
        pointerType = 'mouse',
        eventPointerId = pointerId,
    ) {
        const interval = duration / Math.max(points.length - 1, 1);
        for (const point of points) {
            if (generation !== scenarioGeneration) {
                return false;
            }
            sendPointer(
                'pointermove',
                point.x,
                point.y,
                pressed,
                pointerType,
                eventPointerId,
            );
            await delay(interval);
        }
        return true;
    }

    /** Runs a repeatable interaction against the production event handlers. */
    async function runScenario(name) {
        const generation = ++scenarioGeneration;
        engine.reset();
        status.textContent = `Running ${name}…`;
        await delay(120);

        if (name === 'click') {
            sendPointer('pointermove', 0.66, 0.28);
            await delay(220);
            sendPointer('pointerdown', 0.66, 0.28, true);
            await delay(180);
            sendPointer('pointerup', 0.66, 0.28);
        } else if (name === 'hover') {
            const points = Array.from({ length: 28 }, (_, index) => {
                const amount = index / 27;
                return {
                    x: 0.2 + amount * 0.66,
                    y: 0.24 + Math.sin(amount * Math.PI * 2) * 0.055,
                };
            });
            await movePath(points, 1250, false, generation);
        } else if (name === 'pan') {
            const points = Array.from({ length: 32 }, (_, index) => {
                const amount = index / 31;
                return {
                    x: 0.24 + amount * 0.58,
                    y: 0.2 + amount * 0.17 + Math.sin(amount * Math.PI) * 0.04,
                };
            });
            sendPointer('pointermove', points[0].x, points[0].y);
            sendPointer('pointerdown', points[0].x, points[0].y, true);
            await movePath(points, 1450, true, generation);
            const end = points.at(-1);
            sendPointer('pointerup', end.x, end.y);
        } else if (name === 'touch') {
            const touchId = pointerId + 1;
            const points = Array.from({ length: 30 }, (_, index) => {
                const amount = index / 29;
                return {
                    x: 0.2 + amount * 0.64,
                    y: 0.19 + amount * 0.18
                        + Math.sin(amount * Math.PI * 2) * 0.045,
                };
            });
            sendPointer(
                'pointerdown',
                points[0].x,
                points[0].y,
                true,
                'touch',
                touchId,
            );
            await movePath(
                points,
                1350,
                true,
                generation,
                'touch',
                touchId,
            );
            const end = points.at(-1);
            sendPointer(
                'pointerup',
                end.x,
                end.y,
                false,
                'touch',
                touchId,
            );
        } else if (name === 'stress') {
            for (let pass = 0; pass < 4; pass += 1) {
                if (generation !== scenarioGeneration) {
                    return;
                }
                const x = 0.32 + pass * 0.14;
                const y = 0.2 + (pass % 2) * 0.12;
                sendPointer('pointermove', x, y);
                sendPointer('pointerdown', x, y, true);
                await delay(110);
                sendPointer('pointerup', x, y);
            }
        }

        if (generation === scenarioGeneration) {
            status.textContent = `${name} complete · fluid continues freely`;
        }
    }

    /** Updates performance readouts without synchronizing with GPU memory. */
    function updateMetrics() {
        const metrics = engine.getMetrics();
        metricFps.textContent = metrics.frameRate > 0
            ? `${metrics.frameRate.toFixed(0)} fps`
            : 'sampling';
        metricPhysics.textContent = metrics.simulationRate > 0
            ? `${metrics.simulationRate.toFixed(0)} steps/s`
            : 'sampling';
        metricState.textContent = `${metrics.width}×${metrics.height}`;
        requestAnimationFrame(updateMetrics);
    }

    controlDefinitions.forEach(createControl);
    showParameters(engine.getParameters());
    document.querySelectorAll('[data-scenario]').forEach((button) => {
        button.addEventListener('click', () => runScenario(button.dataset.scenario));
    });
    document.querySelectorAll('[data-view]').forEach((button) => {
        button.addEventListener('click', () => {
            const selected = Number(button.dataset.view);
            engine.setDebugView(selected);
            document.querySelectorAll('[data-view]').forEach((candidate) => {
                candidate.setAttribute(
                    'aria-pressed',
                    String(candidate === button),
                );
            });
        });
    });
    document.querySelector('.reset-fluid').addEventListener('click', () => {
        scenarioGeneration += 1;
        engine.reset();
        status.textContent = 'Water reset';
    });
    document.querySelector('.reset-parameters').addEventListener('click', () => {
        engine.setParameters(engine.defaults);
        showParameters(engine.getParameters());
    });

    Object.defineProperty(window, 'waterLab', {
        configurable: true,
        value: Object.freeze({ runScenario }),
    });
    updateMetrics();
})();
