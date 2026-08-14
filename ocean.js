(() => {
    'use strict';

    const localMode = location.protocol === 'file:'
        || location.hostname === 'localhost'
        || location.hostname === '127.0.0.1';
    const script = document.currentScript;
    const labMode = script?.hasAttribute('data-ocean-lab') ?? false;
    const canvas = document.querySelector('.ocean-canvas');
    const gl = canvas?.getContext('webgl2', {
        alpha: false,
        antialias: false,
        depth: false,
        powerPreference: 'high-performance',
        premultipliedAlpha: true,
        preserveDrawingBuffer: false,
        stencil: false,
    });

    if (!canvas || !gl) {
        canvas?.remove();
        return;
    }

    const vertexSource = `#version 300 es
        layout(location = 0) in vec2 position;

        void main() {
            gl_Position = vec4(position, 0.0, 1.0);
        }
    `;

    const fragmentSource = `#version 300 es
        precision highp float;

        uniform vec2 inverseResolution;
        uniform vec4 projection;
        uniform float time;
        uniform vec3 lineColor;
        uniform vec3 backgroundColor;
        uniform sampler2D disturbanceMap;
        uniform float disturbanceScale;
        uniform int debugView;
        uniform vec4 featherBounds;
        uniform vec2 featherShape;

        out vec4 fragmentColor;

        float bandLimit(float phase) {
            float footprint = fwidth(phase);
            return 1.0 - smoothstep(0.28, 1.0, footprint);
        }

        float ditherNoise(vec2 pixel) {
            uvec2 coordinate = uvec2(pixel);
            uint state = coordinate.x * 747796405u
                + coordinate.y * 2891336453u + 277803737u;
            uint word = (
                (state >> ((state >> 28u) + 4u)) ^ state
            ) * 277803737u;
            return float((word >> 22u) ^ word) / 4294967295.0;
        }

        float contentFeather(vec2 pixel) {
            vec2 normalized = (pixel - featherBounds.xy) * featherBounds.zw;
            float radius = length(normalized);
            return featherShape.y * (1.0 - smoothstep(featherShape.x, 1.0, radius));
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
            vec2 uv = gl_FragCoord.xy * inverseResolution;

            if (debugView == 1) {
                float signedHeight = clamp(
                    0.5 + texture(disturbanceMap, uv).r * 18.0,
                    0.0,
                    1.0
                );
                fragmentColor = vec4(vec3(signedHeight), 1.0);
                return;
            }

            if (debugView == 2) {
                vec2 velocity = texture(disturbanceMap, uv).gb;
                float speed = clamp(length(velocity) * 3.0, 0.0, 1.0);
                fragmentColor = vec4(mix(backgroundColor, lineColor, speed), 1.0);
                return;
            }

            float aspect = projection.x;
            float horizon = projection.y;
            if (uv.y > horizon) {
                discard;
            }

            float screenDepth = (horizon - uv.y) * projection.z;
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
                + time * 0.2 + disturbance * disturbanceScale;
            float crestWeight = bandLimit(crestPhase);
            float ridges = contour(sin(crestPhase), 1.0) * crestWeight;
            float horizonLine = exp(
                -abs(uv.y - horizon) * projection.w * 0.42
            );

            float surfaceDarkness = 0.195 * depthFade;
            float alpha = clamp(
                surfaceDarkness * 0.72
                    + ridges * structureFade * mix(0.19, 0.3, foreground)
                    + horizonLine * 0.11,
                0.0,
                0.52
            );
            float feather = contentFeather(gl_FragCoord.xy);
            vec3 color = mix(backgroundColor, lineColor, alpha * 0.92);
            color = mix(color, backgroundColor, feather);
            float ditherStrength = 1.0 - smoothstep(0.985, 1.0, feather);
            float dither = (
                ditherNoise(gl_FragCoord.xy) - 0.5
            ) * ditherStrength / 255.0;

            fragmentColor = vec4(clamp(color + dither, 0.0, 1.0), 1.0);
        }
    `;

    const simulationFragmentSource = `#version 300 es
        precision highp float;

        const int maximumBodies = 4;

        uniform sampler2D previousState;
        uniform vec4 grid;
        uniform vec4 physics;
        uniform vec4 coupling;
        uniform float surfaceSmoothing;
        uniform vec4 damping;
        uniform vec4 currentBodies[maximumBodies];
        uniform vec4 previousBodies[maximumBodies];
        uniform int bodyCount;

        out vec4 nextState;

        float displacedSurface(vec2 point, vec4 body) {
            if (body.z <= 0.00001 || body.w <= 0.00001) {
                return 0.0;
            }

            vec2 offset = (point - body.xy) / body.z;
            float distanceSquared = dot(offset, offset);
            float core = exp(-distanceSquared * 0.72);
            float skirt = exp(-distanceSquared * 0.12);
            return (skirt / 6.0 - core) * body.w;
        }

        vec2 pressureGradient(vec2 point, vec4 body) {
            if (body.z <= 0.00001 || body.w <= 0.00001) {
                return vec2(0.0);
            }

            float width = body.z * 1.34;
            vec2 offset = (point - body.xy) / width;
            float potential = exp(-dot(offset, offset) * 0.64) * body.w;
            return -1.28 * potential * offset / width;
        }

        void main() {
            vec2 uv = gl_FragCoord.xy * grid.xy;
            vec3 center = texture(previousState, uv).rgb;
            vec3 left = texture(previousState, uv - vec2(grid.x, 0.0)).rgb;
            vec3 right = texture(previousState, uv + vec2(grid.x, 0.0)).rgb;
            vec3 below = texture(previousState, uv - vec2(0.0, grid.y)).rgb;
            vec3 above = texture(previousState, uv + vec2(0.0, grid.y)).rgb;
            float timestep = physics.x;
            float gravity = physics.y;
            float meanDepth = physics.z;
            float drag = physics.w;
            float viscosity = coupling.x;
            float bodyCoupling = coupling.y;
            float bodyDisplacement = coupling.z;
            float bodyPressure = coupling.w;
            float inverseSpan = grid.z;

            vec2 heightGradient = vec2(
                right.r - left.r,
                above.r - below.r
            ) * inverseSpan;
            float leftFlux = max(meanDepth + left.r, meanDepth * 0.2) * left.g;
            float rightFlux = max(meanDepth + right.r, meanDepth * 0.2) * right.g;
            float belowFlux = max(meanDepth + below.r, meanDepth * 0.2) * below.b;
            float aboveFlux = max(meanDepth + above.r, meanDepth * 0.2) * above.b;
            float fluxDivergence = (
                rightFlux - leftFlux + aboveFlux - belowFlux
            ) * inverseSpan;
            vec2 velocity = center.gb;
            vec2 velocityLaplacian = (
                left.gb + right.gb + below.gb + above.gb - 4.0 * velocity
            ) * grid.w;
            float nextHeight = center.r - fluxDivergence * timestep;
            vec2 nextVelocity = velocity
                - gravity * heightGradient * timestep
                + viscosity * velocityLaplacian * timestep;

            float aspect = grid.y / grid.x;
            vec2 metric = vec2(aspect, 1.0);
            vec2 point = uv * metric;
            for (int index = 0; index < maximumBodies; index += 1) {
                if (index >= bodyCount) {
                    break;
                }

                vec4 body = currentBodies[index];
                vec4 previousBody = previousBodies[index];
                body.xy *= metric;
                previousBody.xy *= metric;
                vec2 offset = point - body.xy;
                float radius = max(body.z, 0.00001);
                float distanceSquared = dot(offset, offset) / (radius * radius);
                float contact = exp(-distanceSquared * 0.82);
                float immersion = smoothstep(0.0, 0.014, body.w);
                vec2 bodyVelocity = (body.xy - previousBody.xy) / timestep;
                float bodySpeedSquared = dot(bodyVelocity, bodyVelocity);
                if (bodySpeedSquared > 0.04) {
                    bodyVelocity *= 0.2 * inversesqrt(bodySpeedSquared);
                }

                float entrainment = clamp(
                    contact * immersion * bodyCoupling,
                    0.0,
                    0.58
                );
                nextVelocity = mix(nextVelocity, bodyVelocity, entrainment);
                nextHeight += (
                    displacedSurface(point, body)
                    - displacedSurface(point, previousBody)
                ) * bodyDisplacement;
                nextVelocity -= gravity * pressureGradient(point, body)
                    * bodyPressure * timestep;
            }

            float neighboringHeight = 0.25 * (
                left.r + right.r + below.r + above.r
            );
            nextHeight = mix(nextHeight, neighboringHeight, surfaceSmoothing);

            float speedSquared = dot(nextVelocity, nextVelocity);
            if (speedSquared > 0.0576) {
                nextVelocity *= 0.24 * inversesqrt(speedSquared);
            }
            nextHeight = clamp(nextHeight, -0.045, 0.045);

            float edge = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
            float interior = smoothstep(0.0, 0.055, edge);
            nextHeight *= mix(damping.x, damping.y, interior);
            nextVelocity *= mix(damping.z, damping.w, interior);
            nextState = vec4(nextHeight, nextVelocity, 1.0);
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
    const inverseResolutionLocation = gl.getUniformLocation(
        renderProgram,
        'inverseResolution',
    );
    const projectionLocation = gl.getUniformLocation(renderProgram, 'projection');
    const timeLocation = gl.getUniformLocation(renderProgram, 'time');
    const colorLocation = gl.getUniformLocation(renderProgram, 'lineColor');
    const backgroundLocation = gl.getUniformLocation(renderProgram, 'backgroundColor');
    const disturbanceLocation = gl.getUniformLocation(renderProgram, 'disturbanceMap');
    const disturbanceScaleLocation = gl.getUniformLocation(renderProgram, 'disturbanceScale');
    const debugViewLocation = gl.getUniformLocation(renderProgram, 'debugView');
    const featherBoundsLocation = gl.getUniformLocation(renderProgram, 'featherBounds');
    const featherShapeLocation = gl.getUniformLocation(renderProgram, 'featherShape');
    const buffer = gl.createBuffer();
    const vertexArray = gl.createVertexArray();

    gl.bindVertexArray(vertexArray);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 3, -1, -1, 3]),
        gl.STATIC_DRAW,
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.activeTexture(gl.TEXTURE0);

    const maximumBodies = 4;
    const simulationWidth = 256;
    const simulationHeight = 144;
    const simulationStepDuration = 1000 / 120;
    const simulationTimestep = simulationStepDuration / 1000;
    const texelX = 1 / simulationWidth;
    const texelY = 1 / simulationHeight;
    const gridUniform = new Float32Array([
        texelX,
        texelY,
        0.5 / texelY,
        1 / (texelY * texelY),
    ]);
    const fixedDamping = [
        Math.exp(-6 * simulationTimestep),
        Math.exp(-0.025 * simulationTimestep),
        Math.exp(-8 * simulationTimestep),
    ];
    const parameterDefinitions = Object.freeze({
        gravity: { value: 1.45, min: 0.6, max: 2.4 },
        meanDepth: { value: 0.04, min: 0.02, max: 0.08 },
        viscosity: { value: 0.00058, min: 0.00005, max: 0.001 },
        drag: { value: 0.28, min: 0.02, max: 0.6 },
        bodyCoupling: { value: 0.09, min: 0.03, max: 0.3 },
        bodyDisplacement: { value: 0.3, min: 0.15, max: 0.9 },
        bodyPressure: { value: 0.9, min: 0.2, max: 1.4 },
        surfaceSmoothing: { value: 0.006, min: 0, max: 0.04 },
        clickGrowth: { value: 0.9, min: 0.4, max: 1.8 },
        disturbanceScale: { value: 52, min: 5, max: 72 },
        pointerSize: { value: 1, min: 0.5, max: 2.5 },
        pointerDepth: { value: 1, min: 0.35, max: 2.5 },
    });
    const defaultParameters = Object.freeze(Object.fromEntries(
        Object.entries(parameterDefinitions)
            .map(([name, { value }]) => [name, value]),
    ));
    const parameters = { ...defaultParameters };
    const zeroSimulationState = new Float32Array(4);
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
    const simulationFilter = gl.getExtension('OES_texture_float_linear')
        ? gl.LINEAR
        : gl.NEAREST;

    /** Creates one floating-point texture and framebuffer for wave state. */
    function createSimulationTarget() {
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
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, simulationFilter);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, simulationFilter);
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
        gl.clearBufferfv(gl.COLOR, 0, zeroSimulationState);
        return { texture, framebuffer };
    }

    /** Builds the ping-pong fluid state and caches its shader locations. */
    function createSimulation() {
        if (!simulationProgram) {
            return null;
        }

        const read = createSimulationTarget();
        const write = createSimulationTarget();
        const simulation = {
            read,
            write,
            stateLocation: gl.getUniformLocation(simulationProgram, 'previousState'),
            gridLocation: gl.getUniformLocation(simulationProgram, 'grid'),
            physicsLocation: gl.getUniformLocation(simulationProgram, 'physics'),
            couplingLocation: gl.getUniformLocation(simulationProgram, 'coupling'),
            smoothingLocation: gl.getUniformLocation(simulationProgram, 'surfaceSmoothing'),
            dampingLocation: gl.getUniformLocation(simulationProgram, 'damping'),
            currentBodiesLocation: gl.getUniformLocation(simulationProgram, 'currentBodies[0]'),
            previousBodiesLocation: gl.getUniformLocation(simulationProgram, 'previousBodies[0]'),
            bodyCountLocation: gl.getUniformLocation(simulationProgram, 'bodyCount'),
        };
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        return simulation;
    }

    let simulation = null;
    let simulationInitializationStarted = false;
    canvas.dataset.simulation = 'pending';

    /** Compiles and allocates the physical solver after the first ocean frame. */
    function initializeSimulation() {
        if (simulationInitializationStarted) {
            return simulation;
        }
        simulationInitializationStarted = true;

        if (!gl.getExtension('EXT_color_buffer_float')) {
            canvas.dataset.simulation = 'unavailable';
            return null;
        }

        try {
            simulationProgram = createProgram(simulationFragmentSource);
            simulation = createSimulation();
            configurePrograms();
            updateColors();
        } catch (error) {
            console.warn(error);
            simulationProgram = null;
            simulation = null;
        }
        canvas.dataset.simulation = simulation ? 'shallow-water' : 'unavailable';
        return simulation;
    }

    /** Schedules solver initialization without delaying the first visual frame. */
    function scheduleSimulationInitialization() {
        if (labMode) {
            initializeSimulation();
            return;
        }
        if ('requestIdleCallback' in window) {
            requestIdleCallback(initializeSimulation, { timeout: 250 });
            return;
        }
        setTimeout(initializeSimulation, 0);
    }

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const colorQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const narrowQuery = window.matchMedia('(max-width: 600px)');
    const narrowFeatherLayout = {
        offsetX: -38,
        offsetY: -48,
        extraWidth: 38,
        extraHeight: 220,
        radiusX: 1.18,
        radiusY: 1.06,
        fadeStart: 0.54,
    };
    const wideFeatherLayout = {
        offsetX: -72,
        offsetY: -72,
        extraWidth: 72,
        extraHeight: 250,
        radiusX: 1.08,
        radiusY: 1.12,
        fadeStart: 0.5,
    };
    const targetFrameDuration = 1000 / 60;
    const bodies = new Map();
    const currentBodyData = new Float32Array(maximumBodies * 4);
    const previousBodyData = new Float32Array(maximumBodies * 4);
    let animationFrame = 0;
    let lastDrawTime = 0;
    let lastSimulationTime = performance.now();
    let simulationAccumulator = 0;
    let startTime = performance.now();
    let debugView = 0;
    let sampledFrames = 0;
    let sampleStart = startTime;
    let sampledFrameRate = 0;
    let simulationStepsSinceSample = 0;
    let sampledSimulationRate = 0;
    let simulationActive = false;
    let uploadedBodyCount = -1;
    let currentProgram = null;
    let currentFramebuffer;
    let currentTexture;
    let viewportWidth = -1;
    let viewportHeight = -1;
    let contentElement = null;

    /** Switches programs only when the next pass requires a different one. */
    function useGpuProgram(program) {
        if (currentProgram === program) return;
        gl.useProgram(program);
        currentProgram = program;
    }

    /** Tracks the draw target to avoid redundant default-framebuffer binds. */
    function bindDrawTarget(framebuffer) {
        if (currentFramebuffer === framebuffer) return;
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        currentFramebuffer = framebuffer;
    }

    /** Tracks the unit-zero texture shared by simulation and presentation. */
    function bindStateTexture(texture) {
        if (currentTexture === texture) return;
        gl.bindTexture(gl.TEXTURE_2D, texture);
        currentTexture = texture;
    }

    /** Updates the viewport only when a pass changes target dimensions. */
    function setViewport(width, height) {
        if (viewportWidth === width && viewportHeight === height) return;
        gl.viewport(0, 0, width, height);
        viewportWidth = width;
        viewportHeight = height;
    }

    /** Matches the shader's responsive horizon calculation. */
    function horizonForAspect(aspect) {
        const blend = Math.min(Math.max((aspect - 0.72) / 0.43, 0), 1);
        const eased = blend * blend * (3 - 2 * blend);
        return 0.46 + (0.72 - 0.46) * eased;
    }

    /** Matches the drawing buffer to the responsive CSS box and current DPR. */
    function resize() {
        const bounds = canvas.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        const width = Math.max(1, Math.round(bounds.width * dpr));
        const height = Math.max(1, Math.round(bounds.height * dpr));

        if (canvas.width === width && canvas.height === height) {
            return false;
        }

        canvas.width = width;
        canvas.height = height;
        const aspect = width / height;
        const horizon = horizonForAspect(aspect);
        useGpuProgram(renderProgram);
        gl.uniform2f(inverseResolutionLocation, 1 / width, 1 / height);
        gl.uniform4f(projectionLocation, aspect, horizon, 1 / horizon, height);
        return true;
    }

    /**
     * Maps the content's elliptical shelter into drawing-buffer coordinates.
     * Keeping this blend in the opaque final pass avoids quantized CSS-alpha rings.
     */
    function updateContentFeather() {
        const main = contentElement;
        if (!main) {
            useGpuProgram(renderProgram);
            gl.uniform4f(featherBoundsLocation, 0, 0, 1, 1);
            gl.uniform2f(featherShapeLocation, 1, 0);
            return false;
        }

        const canvasBounds = canvas.getBoundingClientRect();
        const mainBounds = main.getBoundingClientRect();
        const narrow = narrowQuery.matches;
        const layout = narrow ? narrowFeatherLayout : wideFeatherLayout;
        const scaleX = canvas.width / canvasBounds.width;
        const scaleY = canvas.height / canvasBounds.height;
        const width = narrow
            ? window.innerWidth + layout.extraWidth
            : Math.min(1120, window.innerWidth + layout.extraWidth);
        const height = mainBounds.height + layout.extraHeight;
        const originX = (
            mainBounds.left + layout.offsetX - canvasBounds.left
        ) * scaleX;
        const originY = (
            mainBounds.top + layout.offsetY - canvasBounds.top
        ) * scaleY;

        useGpuProgram(renderProgram);
        gl.uniform4f(
            featherBoundsLocation,
            originX,
            canvas.height - originY,
            1 / (width * scaleX * layout.radiusX),
            -1 / (height * scaleY * layout.radiusY),
        );
        gl.uniform2f(featherShapeLocation, layout.fadeStart, 1);
        return true;
    }

    /** Reads the active theme colors so the final GPU pass stays monochromatic. */
    function updateColors() {
        const styles = getComputedStyle(document.documentElement);
        const line = parseHexColor(styles.getPropertyValue('--text-secondary'));
        const background = parseHexColor(styles.getPropertyValue('--bg'));
        useGpuProgram(renderProgram);
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
        const horizon = horizonForAspect(aspect);
        const overWater = x >= 0 && x <= 1 && y >= 0 && y <= horizon;

        if (!overWater) {
            return null;
        }

        return { x, y };
    }

    /** Creates one immersed body whose size and depth respond continuously. */
    function createBody(event, point) {
        initializeSimulation();
        if (!simulationActive) {
            simulationActive = true;
            lastSimulationTime = performance.now();
            simulationAccumulator = 0;
        }
        const touch = event.pointerType === 'touch';
        const body = {
            target: { ...point },
            position: { ...point },
            previousPosition: { ...point },
            baseRadius: touch ? 0.055 : 0.04,
            baseDepth: touch ? 0.01 : 0.0068,
            radius: 0,
            previousRadius: 0,
            depth: 0,
            previousDepth: 0,
            presence: 0,
            pressAmount: 0,
            clickEnergy: 0,
            present: true,
            pressed: false,
        };
        bodies.set(event.pointerId, body);
        return body;
    }

    /** Finds or creates the immersed body associated with one pointer. */
    function bodyFor(event, point) {
        return bodies.get(event.pointerId) || createBody(event, point);
    }

    /** Ignores pointer activity inside the local tuning inspector. */
    function overLocalControls(event) {
        return event.target instanceof Element
            && event.target.closest('.water-controls');
    }

    /** Moves an immersed body; the solver transfers its momentum to the fluid. */
    function handlePointerMove(event) {
        if (overLocalControls(event)) {
            return;
        }
        if (event.pointerType === 'touch' && !bodies.has(event.pointerId)) {
            return;
        }

        const point = waterPoint(event);
        if (!point) {
            const body = bodies.get(event.pointerId);
            if (body) {
                body.present = false;
                body.pressed = false;
            }
            return;
        }

        const body = bodyFor(event, point);
        body.target = point;
        body.present = true;
    }

    /** Grows the immersed body so its added volume launches a physical wave. */
    function handlePointerDown(event) {
        if (overLocalControls(event)) {
            return;
        }
        const point = waterPoint(event);
        if (!point) {
            return;
        }

        const body = bodyFor(event, point);
        body.target = point;
        body.present = true;
        body.pressed = true;
        body.clickEnergy = 1;
    }

    /** Removes the body gradually while leaving all displaced fluid in motion. */
    function handlePointerEnd(event) {
        const body = bodies.get(event.pointerId);
        if (!body) {
            return;
        }

        body.pressed = false;
        if (event.pointerType === 'touch') {
            body.present = false;
        }
    }

    /** Eases body geometry while retaining its previous immersed boundary. */
    function advanceBodies(timestep) {
        if (bodies.size === 0) {
            return 0;
        }

        currentBodyData.fill(0);
        previousBodyData.fill(0);
        let activeBodies = 0;
        const positionResponse = 1 - Math.exp(-34 * timestep);

        for (const [pointerId, body] of bodies) {
            body.previousPosition.x = body.position.x;
            body.previousPosition.y = body.position.y;
            body.previousRadius = body.radius;
            body.previousDepth = body.depth;
            body.position.x += (body.target.x - body.position.x) * positionResponse;
            body.position.y += (body.target.y - body.position.y) * positionResponse;

            const presenceTarget = body.present ? 1 : 0;
            const presenceRate = body.present ? 12 : 6;
            body.presence += (presenceTarget - body.presence)
                * (1 - Math.exp(-presenceRate * timestep));
            const pressTarget = body.pressed ? 1 : 0;
            const pressRate = body.pressed ? 15 : 7;
            body.pressAmount += (pressTarget - body.pressAmount)
                * (1 - Math.exp(-pressRate * timestep));
            body.clickEnergy *= Math.exp(-2.8 * timestep);

            const expansion = Math.max(body.pressAmount, body.clickEnergy);
            body.radius = body.baseRadius * parameters.pointerSize * body.presence
                * (1 + parameters.clickGrowth * expansion);
            body.depth = body.baseDepth * parameters.pointerDepth * body.presence
                * (1 + 0.65 * expansion);

            const expired = !body.present
                && body.radius < 0.00005
                && body.previousRadius < 0.00005
                && body.clickEnergy < 0.001;
            if (expired) {
                bodies.delete(pointerId);
                continue;
            }
            if (activeBodies >= maximumBodies) {
                continue;
            }

            const offset = activeBodies * 4;
            currentBodyData[offset] = body.position.x;
            currentBodyData[offset + 1] = body.position.y;
            currentBodyData[offset + 2] = body.radius;
            currentBodyData[offset + 3] = body.depth;
            previousBodyData[offset] = body.previousPosition.x;
            previousBodyData[offset + 1] = body.previousPosition.y;
            previousBodyData[offset + 2] = body.previousRadius;
            previousBodyData[offset + 3] = body.previousDepth;
            activeBodies += 1;
        }

        return activeBodies;
    }

    /** Uploads simulation uniforms that remain stable across physics steps. */
    function uploadSimulationParameters() {
        if (!simulation || !simulationProgram) return;

        useGpuProgram(simulationProgram);
        gl.uniform4fv(simulation.gridLocation, gridUniform);
        gl.uniform4f(
            simulation.physicsLocation,
            simulationTimestep,
            parameters.gravity,
            parameters.meanDepth,
            0,
        );
        gl.uniform4f(
            simulation.couplingLocation,
            parameters.viscosity,
            parameters.bodyCoupling,
            parameters.bodyDisplacement,
            parameters.bodyPressure,
        );
        gl.uniform1f(simulation.smoothingLocation, parameters.surfaceSmoothing);
        gl.uniform4f(
            simulation.dampingLocation,
            fixedDamping[0],
            fixedDamping[1],
            fixedDamping[2],
            Math.exp(-parameters.drag * simulationTimestep),
        );
    }

    /** Uploads presentation uniforms that change only when tuning changes. */
    function uploadRenderParameters() {
        useGpuProgram(renderProgram);
        gl.uniform1f(disturbanceScaleLocation, parameters.disturbanceScale);
    }

    /** Configures persistent sampler and parameter state for both GPU passes. */
    function configurePrograms() {
        useGpuProgram(renderProgram);
        gl.uniform1i(disturbanceLocation, 0);
        gl.uniform1i(debugViewLocation, debugView);
        if (simulation && simulationProgram) {
            useGpuProgram(simulationProgram);
            gl.uniform1i(simulation.stateLocation, 0);
        }
        uploadSimulationParameters();
        uploadRenderParameters();
    }

    /** Advances the shallow-water equations by one fixed physical timestep. */
    function stepSimulation(timestep) {
        if (!simulation || !simulationProgram) {
            return;
        }

        const activeBodies = advanceBodies(timestep);
        bindDrawTarget(simulation.write.framebuffer);
        setViewport(simulationWidth, simulationHeight);
        useGpuProgram(simulationProgram);
        bindStateTexture(simulation.read.texture);
        if (activeBodies > 0) {
            gl.uniform4fv(simulation.currentBodiesLocation, currentBodyData);
            gl.uniform4fv(simulation.previousBodiesLocation, previousBodyData);
        }
        if (uploadedBodyCount !== activeBodies) {
            gl.uniform1i(simulation.bodyCountLocation, activeBodies);
            uploadedBodyCount = activeBodies;
        }

        gl.drawArrays(gl.TRIANGLES, 0, 3);
        const previousRead = simulation.read;
        simulation.read = simulation.write;
        simulation.write = previousRead;
        simulationStepsSinceSample += 1;
    }

    /** Runs a 120 Hz fixed-step fluid clock independently of presentation FPS. */
    function advanceSimulation(now) {
        if (!simulation || !simulationActive || motionQuery.matches) {
            lastSimulationTime = now;
            simulationAccumulator = 0;
            return;
        }

        const elapsed = Math.min(Math.max(now - lastSimulationTime, 0), 50);
        lastSimulationTime = now;
        simulationAccumulator += elapsed / simulationStepDuration;
        const steps = Math.min(Math.floor(simulationAccumulator), 6);
        const timestep = simulationStepDuration / 1000;

        for (let step = 0; step < steps; step += 1) {
            stepSimulation(timestep);
            simulationAccumulator = Math.max(0, simulationAccumulator - 1);
        }
    }

    /** Draws one ocean frame from the current persistent simulation state. */
    function draw(now = performance.now()) {
        advanceSimulation(now);
        bindDrawTarget(null);
        setViewport(canvas.width, canvas.height);
        useGpuProgram(renderProgram);
        bindStateTexture(simulation ? simulation.read.texture : zeroTexture);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform1f(timeLocation, (now - startTime) / 1000);
        gl.drawArrays(gl.TRIANGLES, 0, 3);

        sampledFrames += 1;
        const sampleElapsed = now - sampleStart;
        if (sampleElapsed >= 1000) {
            sampledFrameRate = (sampledFrames * 1000) / sampleElapsed;
            sampledSimulationRate = (simulationStepsSinceSample * 1000) / sampleElapsed;
            sampledFrames = 0;
            simulationStepsSinceSample = 0;
            sampleStart = now;
        }
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

    /** Applies bounded laboratory parameters without destabilizing the solver. */
    function setParameters(values) {
        let changed = false;
        for (const [name, value] of Object.entries(values)) {
            const definition = parameterDefinitions[name];
            if (!definition || !Number.isFinite(value)) {
                continue;
            }
            const nextValue = Math.min(Math.max(value, definition.min), definition.max);
            if (parameters[name] !== nextValue) {
                parameters[name] = nextValue;
                changed = true;
            }
        }
        if (changed) {
            uploadSimulationParameters();
            uploadRenderParameters();
        }
    }

    /** Applies a diagnostic view without resending it on every frame. */
    function setDebugView(view) {
        debugView = Math.min(Math.max(Number(view) || 0, 0), 2);
        useGpuProgram(renderProgram);
        gl.uniform1i(debugViewLocation, debugView);
    }

    /** Clears both fluid buffers and every immersed body deterministically. */
    function resetSimulation() {
        if (!simulation) {
            return;
        }

        gl.clearColor(0, 0, 0, 0);
        for (const target of [simulation.read, simulation.write]) {
            bindDrawTarget(target.framebuffer);
            gl.clear(gl.COLOR_BUFFER_BIT);
        }
        bindDrawTarget(null);
        bodies.clear();
        currentBodyData.fill(0);
        previousBodyData.fill(0);
        simulationActive = false;
        uploadedBodyCount = -1;
        const now = performance.now();
        lastSimulationTime = now;
        simulationAccumulator = 0;
        updateColors();
        draw(now);
    }

    /** Returns lightweight timing and state data for the visual laboratory. */
    function simulationMetrics() {
        return {
            frameRate: sampledFrameRate,
            simulationRate: sampledSimulationRate,
            active: simulationActive,
            bodies: bodies.size,
            width: simulationWidth,
            height: simulationHeight,
            state: canvas.dataset.simulation,
        };
    }

    /** Restarts rendering after visibility, theme, or motion settings change. */
    function refresh() {
        cancelAnimationFrame(animationFrame);
        animationFrame = 0;
        updateColors();
        resize();
        updateContentFeather();

        startTime = performance.now();
        lastDrawTime = startTime;
        lastSimulationTime = startTime;
        simulationAccumulator = 0;
        sampledFrames = 0;
        simulationStepsSinceSample = 0;
        sampleStart = startTime;
        draw(startTime);

        if (document.hidden || motionQuery.matches) {
            return;
        }

        animationFrame = requestAnimationFrame(animate);
    }

    configurePrograms();
    const resizeObserver = new ResizeObserver(() => {
        resize();
        updateContentFeather();
        draw(performance.now());
    });
    resizeObserver.observe(canvas);

    /** Starts tracking content geometry after the parser has created the main element. */
    function observeContentFeather() {
        const main = document.querySelector('main');
        if (!main) return;
        contentElement = main;
        resizeObserver.observe(main);
        updateContentFeather();
        draw(performance.now());
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', observeContentFeather, { once: true });
    } else {
        observeContentFeather();
    }

    /** Keeps the GPU feather attached to document content during viewport scrolling. */
    function handleScroll() {
        updateContentFeather();
        if (motionQuery.matches || document.hidden) {
            draw(performance.now());
        }
    }
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('pointerdown', handlePointerDown, { passive: true });
    window.addEventListener('pointerup', handlePointerEnd, { passive: true });
    window.addEventListener('pointercancel', handlePointerEnd, { passive: true });
    window.addEventListener('pointerout', (event) => {
        if (event.pointerType === 'mouse' && event.relatedTarget === null) {
            const body = bodies.get(event.pointerId);
            if (body) {
                body.present = false;
                body.pressed = false;
            }
        }
    }, { passive: true });
    window.addEventListener('blur', () => {
        for (const body of bodies.values()) {
            body.present = false;
            body.pressed = false;
        }
    });
    document.addEventListener('visibilitychange', refresh);
    motionQuery.addEventListener('change', refresh);
    colorQuery.addEventListener('change', refresh);

    if (labMode || localMode) {
        Object.defineProperty(window, 'oceanLab', {
            configurable: true,
            value: Object.freeze({
                definitions: parameterDefinitions,
                defaults: defaultParameters,
                getParameters: () => ({ ...parameters }),
                getMetrics: simulationMetrics,
                reset: resetSimulation,
                setDebugView,
                setParameters,
            }),
        });
    }
    refresh();
    scheduleSimulationInitialization();
})();
