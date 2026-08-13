(() => {
    'use strict';

    const canvas = document.querySelector('.ocean-canvas');
    const gl = canvas?.getContext('webgl2', {
        alpha: false,
        antialias: false,
        depth: false,
        powerPreference: 'low-power',
        premultipliedAlpha: true,
        preserveDrawingBuffer: false,
        stencil: false,
    });

    if (!canvas || !gl) {
        canvas?.remove();
        return;
    }

    const vertexSource = `#version 300 es
        in vec2 position;

        void main() {
            gl_Position = vec4(position, 0.0, 1.0);
        }
    `;

    const fragmentSource = `#version 300 es
        precision highp float;

        uniform vec2 resolution;
        uniform float time;
        uniform vec3 lineColor;
        uniform vec3 backgroundColor;
        uniform sampler2D disturbanceMap;

        out vec4 fragmentColor;

        float bandLimit(float phase) {
            float footprint = fwidth(phase);
            return 1.0 - smoothstep(0.28, 1.0, footprint);
        }

        float gradientNoise(vec2 pixel) {
            return fract(
                52.9829189 * fract(dot(pixel, vec2(0.06711056, 0.00583715)))
            );
        }

        float waveField(vec2 point) {
            const vec2 swellA = vec2(0.17715, 0.98418);
            const vec2 swellB = vec2(-0.46135, 0.88722);
            const vec2 swellC = vec2(0.66063, 0.75071);
            float phaseA = dot(point, swellA) * 1.48 + time * 0.52;
            float phaseB = dot(point, swellB) * 2.72 - time * 0.43;
            float phaseC = dot(point, swellC) * 5.15 + time * 0.31;
            float phaseD = point.x * 7.5 - point.y * 0.38 - time * 0.27;
            float weightA = bandLimit(phaseA);
            float weightB = bandLimit(phaseB);
            float weightC = bandLimit(phaseC);
            float weightD = bandLimit(phaseD);

            float height = sin(phaseA) * 0.44 * weightA
                + sin(phaseB) * 0.21 * weightB
                + sin(phaseC) * 0.085 * weightC
                + sin(phaseD) * 0.032 * weightD;

            return height;
        }

        float contour(float signal, float weight) {
            float width = max(fwidth(signal) * weight, 0.005);
            return 1.0 - smoothstep(0.0, width, abs(signal));
        }

        void main() {
            vec2 uv = gl_FragCoord.xy / resolution;
            float aspect = resolution.x / resolution.y;
            float horizon = mix(
                0.46,
                0.72,
                smoothstep(0.72, 1.15, aspect)
            );

            if (uv.y > horizon) {
                discard;
            }

            float screenDepth = (horizon - uv.y) / horizon;
            float disturbance = texture(disturbanceMap, uv).r;
            float perspective = 1.0 / (screenDepth * 1.55 + 0.026);
            float worldX = (uv.x - 0.5) * aspect * perspective;
            float worldZ = perspective;
            float logDepth = log(1.0 + worldZ);
            vec2 surfacePoint = vec2(worldX, worldZ);
            float height = waveField(surfacePoint);
            float depthFade = smoothstep(0.012, 0.88, screenDepth);
            float structureFade = smoothstep(0.0015, 0.085, screenDepth);
            float foreground = smoothstep(0.08, 0.94, screenDepth);
            float crestPhase = logDepth * 12.0 + height * 3.15
                + time * 0.2 + disturbance * 4.8;
            float crestWeight = bandLimit(crestPhase);
            float ridges = contour(sin(crestPhase), 1.0) * crestWeight;
            float horizonLine = exp(
                -abs(uv.y - horizon) * resolution.y * 0.42
            );

            float surfaceDarkness = 0.195 * depthFade;
            float alpha = clamp(
                surfaceDarkness * 0.72
                    + ridges * structureFade * mix(0.19, 0.3, foreground)
                    + horizonLine * 0.11,
                0.0,
                0.52
            );
            float dither = (gradientNoise(gl_FragCoord.xy) - 0.5) / 255.0;
            vec3 color = mix(backgroundColor, lineColor, alpha * 0.92);

            fragmentColor = vec4(clamp(color + dither, 0.0, 1.0), 1.0);
        }
    `;

    const simulationFragmentSource = `#version 300 es
        precision highp float;

        uniform sampler2D previousState;
        uniform vec2 texelSize;
        uniform vec4 pressurePoints;
        uniform vec2 pressureProperties;

        out vec4 nextState;

        float pressureBlob(vec2 point, vec2 center, float radius) {
            vec2 offset = (point - center) / radius;
            float distanceSquared = dot(offset, offset);
            float core = exp(-distanceSquared * 1.35);
            float skirt = exp(-distanceSquared * 0.34);
            return skirt * 0.28 - core;
        }

        void main() {
            vec2 uv = gl_FragCoord.xy * texelSize;
            float current = texture(previousState, uv).r;
            float previous = texture(previousState, uv).g;
            float left = texture(previousState, uv - vec2(texelSize.x, 0.0)).r;
            float right = texture(previousState, uv + vec2(texelSize.x, 0.0)).r;
            float below = texture(previousState, uv - vec2(0.0, texelSize.y)).r;
            float above = texture(previousState, uv + vec2(0.0, texelSize.y)).r;
            float laplacian = left + right + below + above - 4.0 * current;
            float next = (2.0 * current - previous + laplacian * 0.34) * 0.9984;

            if (pressureProperties.x != 0.0) {
                float aspect = texelSize.y / texelSize.x;
                vec2 metric = vec2(aspect, 1.0);
                vec2 start = pressurePoints.xy * metric;
                vec2 end = pressurePoints.zw * metric;
                vec2 point = uv * metric;
                float radius = pressureProperties.y;
                float pressure = pressureBlob(point, end, radius);
                if (length(end - start) > 0.0001) {
                    pressure -= pressureBlob(point, start, radius) * 0.62;
                }
                next += pressure * pressureProperties.x;
            }

            float edge = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
            next *= mix(0.94, 1.0, smoothstep(0.0, 0.045, edge));
            nextState = vec4(next, current, 0.0, 1.0);
        }
    `;

    /** Compiles one shader and reports a useful browser-console error on failure. */
    function compileShader(type, source) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);

        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            const message = gl.getShaderInfoLog(shader);
            gl.deleteShader(shader);
            throw new Error(`Ocean shader compilation failed: ${message}`);
        }

        return shader;
    }

    /** Links the full-screen vertex shader with one fragment pass. */
    function createProgram(source) {
        const program = gl.createProgram();
        const vertexShader = compileShader(gl.VERTEX_SHADER, vertexSource);
        const fragmentShader = compileShader(gl.FRAGMENT_SHADER, source);

        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);

        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            const message = gl.getProgramInfoLog(program);
            gl.deleteProgram(program);
            throw new Error(`Ocean shader linking failed: ${message}`);
        }

        return program;
    }

    /** Converts a CSS hexadecimal color into normalized WebGL channels. */
    function parseHexColor(value) {
        const match = value.trim().match(/^#([0-9a-f]{6})$/i);
        if (!match) {
            return [0.35, 0.35, 0.35];
        }

        const color = Number.parseInt(match[1], 16);
        return [
            ((color >> 16) & 255) / 255,
            ((color >> 8) & 255) / 255,
            (color & 255) / 255,
        ];
    }

    let renderProgram;
    let simulationProgram = null;
    try {
        renderProgram = createProgram(fragmentSource);
    } catch (error) {
        console.warn(error);
        canvas.remove();
        return;
    }
    if (gl.getExtension('EXT_color_buffer_float')) {
        try {
            simulationProgram = createProgram(simulationFragmentSource);
        } catch (error) {
            console.warn(error);
        }
    }
    const positionLocation = gl.getAttribLocation(renderProgram, 'position');
    const resolutionLocation = gl.getUniformLocation(renderProgram, 'resolution');
    const timeLocation = gl.getUniformLocation(renderProgram, 'time');
    const colorLocation = gl.getUniformLocation(renderProgram, 'lineColor');
    const backgroundLocation = gl.getUniformLocation(renderProgram, 'backgroundColor');
    const disturbanceLocation = gl.getUniformLocation(renderProgram, 'disturbanceMap');
    const buffer = gl.createBuffer();

    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 3, -1, -1, 3]),
        gl.STATIC_DRAW,
    );
    gl.useProgram(renderProgram);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    const simulationWidth = 256;
    const simulationHeight = 144;
    const zeroTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, zeroTexture);
    gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA8,
        1,
        1,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        new Uint8Array([0, 0, 0, 255]),
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    /** Creates one floating-point texture and framebuffer for wave state. */
    function createSimulationTarget(linearFiltering) {
        const texture = gl.createTexture();
        const framebuffer = gl.createFramebuffer();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA16F,
            simulationWidth,
            simulationHeight,
            0,
            gl.RGBA,
            gl.HALF_FLOAT,
            null,
        );
        gl.texParameteri(
            gl.TEXTURE_2D,
            gl.TEXTURE_MIN_FILTER,
            linearFiltering ? gl.LINEAR : gl.NEAREST,
        );
        gl.texParameteri(
            gl.TEXTURE_2D,
            gl.TEXTURE_MAG_FILTER,
            linearFiltering ? gl.LINEAR : gl.NEAREST,
        );
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.framebufferTexture2D(
            gl.FRAMEBUFFER,
            gl.COLOR_ATTACHMENT0,
            gl.TEXTURE_2D,
            texture,
            0,
        );
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
            throw new Error('Ocean simulation framebuffer is incomplete.');
        }
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        return { texture, framebuffer };
    }

    /** Builds the ping-pong height field and caches its shader locations. */
    function createSimulation() {
        if (!simulationProgram) {
            return null;
        }

        const linearFiltering = Boolean(gl.getExtension('OES_texture_float_linear'));
        const read = createSimulationTarget(linearFiltering);
        const write = createSimulationTarget(linearFiltering);
        const simulation = {
            read,
            write,
            positionLocation: gl.getAttribLocation(simulationProgram, 'position'),
            stateLocation: gl.getUniformLocation(simulationProgram, 'previousState'),
            texelLocation: gl.getUniformLocation(simulationProgram, 'texelSize'),
            pressureLocation: gl.getUniformLocation(simulationProgram, 'pressurePoints'),
            propertiesLocation: gl.getUniformLocation(simulationProgram, 'pressureProperties'),
        };
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        return simulation;
    }

    let simulation = null;
    try {
        simulation = createSimulation();
    } catch (error) {
        console.warn(error);
        simulationProgram = null;
    }
    canvas.dataset.simulation = simulation ? 'height-field' : 'unavailable';

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const colorQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const targetFrameDuration = 1000 / 60;
    const pointerPositions = new Map();
    const pendingImpulses = [];
    let animationFrame = 0;
    let lastDrawTime = 0;
    let lastSimulationTime = performance.now();
    let simulationAccumulator = 0;
    let startTime = performance.now();

    /** Matches the drawing buffer to the responsive CSS box and current DPR. */
    function resize() {
        const bounds = canvas.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        const width = Math.max(1, Math.round(bounds.width * dpr));
        const height = Math.max(1, Math.round(bounds.height * dpr));

        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
            gl.viewport(0, 0, width, height);
        }
    }

    /** Reads the active theme colors so the final GPU pass stays monochromatic. */
    function updateColors() {
        const styles = getComputedStyle(document.documentElement);
        const line = parseHexColor(styles.getPropertyValue('--text-secondary'));
        const background = parseHexColor(styles.getPropertyValue('--bg'));
        gl.useProgram(renderProgram);
        gl.uniform3fv(colorLocation, line);
        gl.uniform3fv(backgroundLocation, background);
        gl.clearColor(background[0], background[1], background[2], 1);
    }

    /** Converts a viewport pointer into canvas UV space when it is over water. */
    function waterPoint(event) {
        const bounds = canvas.getBoundingClientRect();
        const x = (event.clientX - bounds.left) / bounds.width;
        const y = 1 - (event.clientY - bounds.top) / bounds.height;
        const aspect = bounds.width / bounds.height;
        const horizonBlend = Math.min(Math.max((aspect - 0.72) / 0.43, 0), 1);
        const easedBlend = horizonBlend * horizonBlend * (3 - 2 * horizonBlend);
        const horizon = 0.46 + (0.72 - 0.46) * easedBlend;
        const overWater = x >= 0 && x <= 1 && y >= 0 && y <= horizon;

        if (!overWater) {
            return null;
        }

        return { x, y };
    }

    /** Queues one pressure-body impulse while bounding per-frame GPU work. */
    function queuePressureImpulse(start, end, amplitude, radius) {
        if (!simulation || motionQuery.matches) {
            return;
        }

        pendingImpulses.push({ start, end, amplitude, radius });
        if (pendingImpulses.length > 8) {
            pendingImpulses.splice(0, pendingImpulses.length - 8);
        }
    }

    /** Relocates a rounded pressure body through the persistent height field. */
    function handlePointerMove(event) {
        if (event.pointerType === 'touch' && !pointerPositions.has(event.pointerId)) {
            return;
        }

        const point = waterPoint(event);
        const previous = pointerPositions.get(event.pointerId);
        if (!point) {
            pointerPositions.delete(event.pointerId);
            return;
        }

        if (previous) {
            const distance = Math.hypot(point.x - previous.x, point.y - previous.y);
            if (distance > 0.0015) {
                const touch = event.pointerType === 'touch';
                const amplitude = touch
                    ? Math.min(0.09, 0.027 + distance * 0.22)
                    : Math.min(0.042, 0.009 + distance * 0.1);
                queuePressureImpulse(previous, point, amplitude, touch ? 0.026 : 0.02);
            }
        } else if (event.pointerType === 'mouse') {
            queuePressureImpulse(point, point, 0.016, 0.021);
        }

        pointerPositions.set(event.pointerId, point);
    }

    /** Starts a tap impulse whose resulting waves persist after release. */
    function handlePointerDown(event) {
        const point = waterPoint(event);
        if (!point) {
            return;
        }

        pointerPositions.set(event.pointerId, point);
        const touch = event.pointerType === 'touch';
        queuePressureImpulse(point, point, touch ? 0.082 : 0.05, touch ? 0.03 : 0.024);
    }

    /** Ends input ownership without clearing the simulated water state. */
    function handlePointerEnd(event) {
        pointerPositions.delete(event.pointerId);
    }

    /** Binds the shared full-screen triangle for one shader program. */
    function bindGeometry(program, location) {
        gl.useProgram(program);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.enableVertexAttribArray(location);
        gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
    }

    /** Advances the damped wave equation and optionally injects a pressure body. */
    function stepSimulation(impulse = null) {
        if (!simulation || !simulationProgram) {
            return;
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, simulation.write.framebuffer);
        gl.viewport(0, 0, simulationWidth, simulationHeight);
        bindGeometry(simulationProgram, simulation.positionLocation);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, simulation.read.texture);
        gl.uniform1i(simulation.stateLocation, 0);
        gl.uniform2f(
            simulation.texelLocation,
            1 / simulationWidth,
            1 / simulationHeight,
        );

        if (impulse) {
            gl.uniform4f(
                simulation.pressureLocation,
                impulse.start.x,
                impulse.start.y,
                impulse.end.x,
                impulse.end.y,
            );
            gl.uniform2f(
                simulation.propertiesLocation,
                impulse.amplitude,
                impulse.radius,
            );
        } else {
            gl.uniform4f(simulation.pressureLocation, 0, 0, 0, 0);
            gl.uniform2f(simulation.propertiesLocation, 0, 0.02);
        }

        gl.drawArrays(gl.TRIANGLES, 0, 3);
        [simulation.read, simulation.write] = [simulation.write, simulation.read];
    }

    /** Runs fixed simulation steps so propagation persists independently of input. */
    function advanceSimulation(now) {
        if (!simulation || motionQuery.matches) {
            pendingImpulses.length = 0;
            lastSimulationTime = now;
            simulationAccumulator = 0;
            return;
        }

        const elapsed = Math.min(Math.max(now - lastSimulationTime, 0), 50);
        lastSimulationTime = now;
        simulationAccumulator += elapsed / targetFrameDuration;
        let steps = Math.min(Math.floor(simulationAccumulator), 3);
        if (pendingImpulses.length > 0 && steps === 0) {
            steps = 1;
        }

        for (let step = 0; step < steps; step += 1) {
            stepSimulation(pendingImpulses.shift() || null);
            simulationAccumulator = Math.max(0, simulationAccumulator - 1);
        }
    }

    /** Draws one ocean frame from the current persistent simulation state. */
    function draw(now = startTime) {
        resize();
        advanceSimulation(now);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, canvas.width, canvas.height);
        bindGeometry(renderProgram, positionLocation);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform2f(resolutionLocation, canvas.width, canvas.height);
        gl.uniform1f(timeLocation, (now - startTime) / 1000);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(
            gl.TEXTURE_2D,
            simulation ? simulation.read.texture : zeroTexture,
        );
        gl.uniform1i(disturbanceLocation, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    /** Runs only while visible and allowed by the user's motion preference. */
    function animate(now) {
        const elapsed = now - lastDrawTime;
        if (elapsed >= targetFrameDuration) {
            draw(now);
            lastDrawTime = now - (elapsed % targetFrameDuration);
        }
        animationFrame = requestAnimationFrame(animate);
    }

    /** Restarts rendering after visibility, theme, or motion settings change. */
    function refresh() {
        cancelAnimationFrame(animationFrame);
        animationFrame = 0;
        updateColors();

        startTime = performance.now();
        lastDrawTime = startTime;
        lastSimulationTime = startTime;
        simulationAccumulator = 0;
        draw(startTime);

        if (document.hidden || motionQuery.matches) {
            return;
        }

        animationFrame = requestAnimationFrame(animate);
    }

    const resizeObserver = new ResizeObserver(() => draw());
    resizeObserver.observe(canvas);
    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('pointerdown', handlePointerDown, { passive: true });
    window.addEventListener('pointerup', handlePointerEnd, { passive: true });
    window.addEventListener('pointercancel', handlePointerEnd, { passive: true });
    window.addEventListener('pointerout', (event) => {
        if (event.pointerType === 'mouse' && event.relatedTarget === null) {
            pointerPositions.delete(event.pointerId);
        }
    }, { passive: true });
    window.addEventListener('blur', () => {
        pointerPositions.clear();
    });
    document.addEventListener('visibilitychange', refresh);
    motionQuery.addEventListener('change', refresh);
    colorQuery.addEventListener('change', refresh);
    refresh();
})();
