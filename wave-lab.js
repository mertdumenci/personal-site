(() => {
    'use strict';

    const studies = [
        {
            name: 'Horizon Swells',
            shortName: 'Swells',
            description: 'Long, readable crest bands compress toward a fixed horizon over a softly shaded surface.',
        },
        {
            name: 'Coastal Sets',
            shortName: 'Sets',
            description: 'Wave families arrive in quiet groups, creating near-shore rhythm with deep-water spacing.',
        },
        {
            name: 'Cross Sea',
            shortName: 'Cross sea',
            description: 'Two directional swell systems intersect while retaining a strong longitudinal horizon cue.',
        },
        {
            name: 'Graphite Surface',
            shortName: 'Graphite',
            description: 'Stepped monochrome shading turns the ocean into a restrained moving pencil study.',
        },
        {
            name: 'Topographic Tides',
            shortName: 'Topo',
            description: 'Bathymetric contour logic maps wave height and distance into layered tidal isolines.',
        },
        {
            name: 'Current Field',
            shortName: 'Currents',
            description: 'Flow lines visualize an invisible current field bending toward the distant horizon.',
        },
        {
            name: 'Horizon Lattice',
            shortName: 'Lattice',
            description: 'A warped perspective mesh exposes the geometry beneath a procedural water surface.',
        },
        {
            name: 'Tidal Interference',
            shortName: 'Interference',
            description: 'Two coherent fields form a slow monochrome moiré that still resolves into ocean depth.',
        },
    ];

    const canvas = document.querySelector('.study-canvas');
    const title = document.querySelector('.study-title');
    const description = document.querySelector('.study-description');
    const counter = document.querySelector('.counter');
    const metrics = document.querySelector('.study-metrics');
    const options = document.querySelector('.study-options');
    const previous = document.querySelector('.previous');
    const next = document.querySelector('.next');
    const gl = canvas.getContext('webgl2', {
        alpha: true,
        antialias: false,
        depth: false,
        powerPreference: 'high-performance',
        premultipliedAlpha: true,
        preserveDrawingBuffer: false,
        stencil: false,
    });

    if (!gl) {
        metrics.textContent = 'WebGL 2 is unavailable in this browser.';
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
        uniform int variant;

        out vec4 fragmentColor;

        vec3 waveField(vec2 point) {
            const vec2 directionA = vec2(0.155, 0.988);
            const vec2 directionB = vec2(-0.447, 0.894);
            const vec2 directionC = vec2(0.647, 0.762);
            float phaseA = dot(point, directionA) * 1.38 + time * 0.46;
            float phaseB = dot(point, directionB) * 2.57 - time * 0.35;
            float phaseC = dot(point, directionC) * 4.78 + time * 0.24;

            float height = sin(phaseA) * 0.42
                + sin(phaseB) * 0.19
                + sin(phaseC) * 0.075;
            vec2 gradient = cos(phaseA) * 0.42 * 1.38 * directionA
                + cos(phaseB) * 0.19 * 2.57 * directionB
                + cos(phaseC) * 0.075 * 4.78 * directionC;
            return vec3(height, gradient);
        }

        float contour(float signal, float weight) {
            float width = max(fwidth(signal) * weight, 0.005);
            return 1.0 - smoothstep(0.0, width, abs(signal));
        }

        float horizonRule(float y, float horizon) {
            return exp(-abs(y - horizon) * resolution.y * 0.5);
        }

        void main() {
            vec2 uv = gl_FragCoord.xy / resolution;
            float aspect = resolution.x / resolution.y;
            float horizon = 0.71;

            if (uv.y > horizon) {
                discard;
            }

            float screenDepth = (horizon - uv.y) / horizon;
            float perspective = 1.0 / (screenDepth * 1.58 + 0.02);
            float worldX = (uv.x - 0.5) * aspect * perspective;
            float worldZ = perspective;
            float logDepth = log(1.0 + worldZ);
            vec2 point = vec2(worldX, worldZ);
            vec3 field = waveField(point);
            float height = field.x;
            vec3 normal = normalize(vec3(-field.y, 1.0, -field.z));
            vec3 light = normalize(vec3(-0.46, 0.84, 0.29));
            vec3 view = normalize(vec3(-worldX * 0.02, 1.3, -1.0));
            float diffuse = clamp(dot(normal, light), 0.0, 1.0);
            float specular = pow(max(dot(reflect(-light, normal), view), 0.0), 22.0);
            float depthFade = smoothstep(0.012, 0.88, screenDepth);
            float structureFade = smoothstep(0.0015, 0.085, screenDepth);
            float foreground = smoothstep(0.08, 0.94, screenDepth);
            float base = (0.11 + (1.0 - diffuse) * 0.28 - specular * 0.13)
                * depthFade;
            float alpha = base;

            if (variant == 0) {
                float crestPhase = logDepth * 12.0 + height * 3.15 + time * 0.2;
                float ridges = contour(sin(crestPhase), 1.0);
                float shoulders = pow(
                    0.5 + 0.5 * cos(crestPhase + 0.42),
                    7.0
                );
                alpha = base * 0.72
                    + ridges * structureFade * mix(0.19, 0.3, foreground)
                    + shoulders * structureFade * 0.045;
            } else if (variant == 1) {
                float phase = logDepth * 12.8 + height * 3.6 + time * 0.22;
                float ridges = contour(sin(phase), 1.02);
                float sets = 0.16 + 0.84 * pow(
                    0.5 + 0.5 * sin(logDepth * 2.15 - time * 0.1),
                    4.0
                );
                alpha = base * 0.62 + ridges * sets * structureFade * 0.34;
            } else if (variant == 2) {
                float systemA = contour(
                    sin(logDepth * 12.4 + worldX * 0.18 + height * 2.6 + time * 0.18),
                    1.02
                );
                float systemB = contour(
                    sin(logDepth * 10.7 - worldX * 0.31 - height * 1.8 - time * 0.13),
                    1.0
                );
                alpha = base * 0.58
                    + (systemA * 0.24 + systemB * 0.15) * structureFade;
            } else if (variant == 3) {
                float steppedLight = floor(diffuse * 7.0) / 7.0;
                float grain = contour(
                    sin(worldX * 7.4 + worldZ * 0.22 + height * 3.8),
                    0.9
                );
                alpha = (0.12 + (1.0 - steppedLight) * 0.34) * depthFade
                    + grain * foreground * 0.035;
            } else if (variant == 4) {
                float elevation = contour(sin(height * 11.0 + logDepth * 3.3), 1.0);
                float depthLines = contour(
                    sin(logDepth * 11.2 + height * 1.4 + time * 0.11),
                    1.02
                );
                alpha = base * 0.25 + elevation * structureFade * 0.25
                    + depthLines * structureFade * 0.1;
            } else if (variant == 5) {
                float warp = sin(worldX * 0.42 + worldZ * 0.27 + time * 0.13)
                    + sin(worldX * 0.19 - worldZ * 0.31 - time * 0.09) * 0.55;
                float streams = contour(
                    sin(worldX * 2.85 + worldZ * 0.14 + warp * 1.9),
                    1.05
                );
                alpha = base * 0.17
                    + streams * structureFade * mix(0.12, 0.27, foreground);
            } else if (variant == 6) {
                float longitudinal = contour(
                    sin(worldX * 1.28 + height * 1.4),
                    1.05
                );
                float transverse = contour(
                    sin(logDepth * 11.7 + height * 2.5 + time * 0.16),
                    1.02
                );
                alpha = base * 0.16
                    + longitudinal * structureFade * 0.11
                    + transverse * structureFade * 0.2;
            } else {
                float fieldA = sin(worldZ * 2.42 + worldX * 0.37 + time * 0.12);
                float fieldB = sin(worldZ * 2.18 - worldX * 0.44 - time * 0.1);
                float interference = contour(fieldA + fieldB, 1.12);
                float echo = contour(fieldA - fieldB, 1.0);
                alpha = base * 0.2
                    + (interference * 0.23 + echo * 0.07) * structureFade;
            }

            alpha += horizonRule(uv.y, horizon) * 0.11;
            alpha = clamp(alpha, 0.0, 0.56);
            vec3 graphite = vec3(0.18);
            fragmentColor = vec4(graphite * alpha, alpha);
        }
    `;

    /** Compiles a shader and surfaces GLSL diagnostics in the study UI. */
    function compileShader(type, source) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);

        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            const message = gl.getShaderInfoLog(shader);
            gl.deleteShader(shader);
            throw new Error(message);
        }

        return shader;
    }

    /** Links the study's full-screen vertex and variant fragment shaders. */
    function createProgram() {
        const program = gl.createProgram();
        const vertexShader = compileShader(gl.VERTEX_SHADER, vertexSource);
        const fragmentShader = compileShader(gl.FRAGMENT_SHADER, fragmentSource);
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);

        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            const message = gl.getProgramInfoLog(program);
            gl.deleteProgram(program);
            throw new Error(message);
        }

        return program;
    }

    let program;
    try {
        program = createProgram();
    } catch (error) {
        metrics.textContent = `Shader error: ${error.message}`;
        return;
    }

    const positionLocation = gl.getAttribLocation(program, 'position');
    const resolutionLocation = gl.getUniformLocation(program, 'resolution');
    const timeLocation = gl.getUniformLocation(program, 'time');
    const variantLocation = gl.getUniformLocation(program, 'variant');
    const buffer = gl.createBuffer();
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    let selected = Number.parseInt(new URLSearchParams(location.search).get('variant'), 10);
    let animationFrame = 0;
    let startTime = performance.now();
    let frameCount = 0;
    let sampleStart = startTime;

    if (!Number.isInteger(selected) || selected < 0 || selected >= studies.length) {
        selected = 0;
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.useProgram(program);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    /** Keeps the GPU buffer sharp while bounding fill-rate on Retina displays. */
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

    /** Draws one selected study and samples its presentation frame rate. */
    function draw(now = startTime) {
        resize();
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform2f(resolutionLocation, canvas.width, canvas.height);
        gl.uniform1f(timeLocation, (now - startTime) / 1000);
        gl.uniform1i(variantLocation, selected);
        gl.drawArrays(gl.TRIANGLES, 0, 3);

        frameCount += 1;
        const elapsed = now - sampleStart;
        if (elapsed >= 1000) {
            metrics.textContent = `${Math.round((frameCount * 1000) / elapsed)} fps · ${canvas.width}×${canvas.height}`;
            frameCount = 0;
            sampleStart = now;
        }
    }

    /** Advances animation only when the page is visible and motion is allowed. */
    function animate(now) {
        draw(now);
        animationFrame = requestAnimationFrame(animate);
    }

    /** Synchronizes the study copy, controls, URL, and shader uniform. */
    function selectStudy(index) {
        selected = (index + studies.length) % studies.length;
        const study = studies[selected];
        title.textContent = study.name;
        description.textContent = study.description;
        counter.textContent = `${selected + 1} / ${studies.length}`;
        document.querySelectorAll('.study-option').forEach((button, buttonIndex) => {
            button.setAttribute('aria-current', String(buttonIndex === selected));
        });
        history.replaceState(null, '', `?variant=${selected}`);
        draw(performance.now());
    }

    /** Starts or pauses the render loop after visibility or motion changes. */
    function refreshAnimation() {
        cancelAnimationFrame(animationFrame);
        animationFrame = 0;

        if (document.hidden || motionQuery.matches) {
            draw();
        } else {
            startTime = performance.now();
            sampleStart = startTime;
            frameCount = 0;
            animationFrame = requestAnimationFrame(animate);
        }
    }

    studies.forEach((study, index) => {
        const button = document.createElement('button');
        button.className = 'study-option';
        button.type = 'button';
        button.textContent = study.shortName;
        button.addEventListener('click', () => selectStudy(index));
        options.append(button);
    });

    previous.addEventListener('click', () => selectStudy(selected - 1));
    next.addEventListener('click', () => selectStudy(selected + 1));
    window.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowLeft') {
            selectStudy(selected - 1);
        } else if (event.key === 'ArrowRight') {
            selectStudy(selected + 1);
        }
    });
    document.addEventListener('visibilitychange', refreshAnimation);
    motionQuery.addEventListener('change', refreshAnimation);
    new ResizeObserver(() => draw(performance.now())).observe(canvas);
    selectStudy(selected);
    refreshAnimation();
})();
