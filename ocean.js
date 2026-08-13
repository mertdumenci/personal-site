(() => {
    'use strict';

    const canvas = document.querySelector('.ocean-canvas');
    const gl = canvas?.getContext('webgl2', {
        alpha: true,
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

        out vec4 fragmentColor;

        vec3 waveField(vec2 point) {
            const vec2 swellA = vec2(0.17715, 0.98418);
            const vec2 swellB = vec2(-0.46135, 0.88722);
            const vec2 swellC = vec2(0.66063, 0.75071);
            float phaseA = dot(point, swellA) * 1.48 + time * 0.52;
            float phaseB = dot(point, swellB) * 2.72 - time * 0.43;
            float phaseC = dot(point, swellC) * 5.15 + time * 0.31;
            float phaseD = point.x * 7.5 - point.y * 0.38 - time * 0.27;

            float height = sin(phaseA) * 0.44
                + sin(phaseB) * 0.21
                + sin(phaseC) * 0.085
                + sin(phaseD) * 0.032;
            vec2 gradient = cos(phaseA) * 0.44 * 1.48 * swellA
                + cos(phaseB) * 0.21 * 2.72 * swellB
                + cos(phaseC) * 0.085 * 5.15 * swellC
                + cos(phaseD) * 0.032 * vec2(7.5, -0.38);

            return vec3(height, gradient);
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
            float perspective = 1.0 / (screenDepth * 1.55 + 0.026);
            float worldX = (uv.x - 0.5) * aspect * perspective;
            float worldZ = perspective;
            float logDepth = log(1.0 + worldZ);
            vec2 surfacePoint = vec2(worldX, worldZ);
            vec3 field = waveField(surfacePoint);
            float height = field.x;
            vec3 normal = normalize(vec3(-field.y, 1.0, -field.z));

            vec3 lightDirection = normalize(vec3(-0.48, 0.82, 0.31));
            vec3 viewDirection = normalize(vec3(-worldX * 0.025, 1.35, -1.0));
            float diffuse = clamp(dot(normal, lightDirection), 0.0, 1.0);
            float specular = max(
                dot(reflect(-lightDirection, normal), viewDirection),
                0.0
            );
            float specularSquared = specular * specular;
            float specularFourth = specularSquared * specularSquared;
            float specularEighth = specularFourth * specularFourth;
            specular = specularEighth * specularEighth * specularEighth;
            float depthFade = smoothstep(0.012, 0.88, screenDepth);
            float structureFade = smoothstep(0.0015, 0.085, screenDepth);
            float foreground = smoothstep(0.08, 0.94, screenDepth);
            float crestPhase = logDepth * 12.0 + height * 3.15 + time * 0.2;
            float ridges = contour(sin(crestPhase), 1.0);
            float shoulderBase = 0.5 + 0.5 * cos(crestPhase + 0.42);
            float shoulderSquared = shoulderBase * shoulderBase;
            float shoulders = shoulderSquared * shoulderSquared
                * shoulderSquared * shoulderBase;
            float horizonLine = exp(
                -abs(uv.y - horizon) * resolution.y * 0.42
            );

            float surfaceDarkness = (
                0.11 + (1.0 - diffuse) * 0.28 - specular * 0.13
            ) * depthFade;
            float alpha = clamp(
                surfaceDarkness * 0.72
                    + ridges * structureFade * mix(0.19, 0.3, foreground)
                    + shoulders * structureFade * 0.045
                    + horizonLine * 0.11,
                0.0,
                0.52
            );

            fragmentColor = vec4(lineColor * alpha, alpha);
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

    /** Links the full-screen vertex and procedural-ocean fragment shaders. */
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

    let program;
    try {
        program = createProgram();
    } catch (error) {
        console.warn(error);
        canvas.remove();
        return;
    }
    const positionLocation = gl.getAttribLocation(program, 'position');
    const resolutionLocation = gl.getUniformLocation(program, 'resolution');
    const timeLocation = gl.getUniformLocation(program, 'time');
    const colorLocation = gl.getUniformLocation(program, 'lineColor');
    const buffer = gl.createBuffer();

    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 3, -1, -1, 3]),
        gl.STATIC_DRAW,
    );
    gl.useProgram(program);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const colorQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const targetFrameDuration = 1000 / 60;
    let animationFrame = 0;
    let lastDrawTime = 0;
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

    /** Reads the active theme color so the shader remains monochromatic. */
    function updateColor() {
        const value = getComputedStyle(document.documentElement)
            .getPropertyValue('--text-secondary');
        gl.uniform3fv(colorLocation, parseHexColor(value));
    }

    /** Draws one frame; animation changes only a GPU uniform. */
    function draw(now = startTime) {
        resize();
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform2f(resolutionLocation, canvas.width, canvas.height);
        gl.uniform1f(timeLocation, (now - startTime) / 1000);
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
        updateColor();

        if (document.hidden || motionQuery.matches) {
            draw();
        } else {
            startTime = performance.now();
            lastDrawTime = 0;
            animationFrame = requestAnimationFrame(animate);
        }
    }

    const resizeObserver = new ResizeObserver(() => draw());
    resizeObserver.observe(canvas);
    document.addEventListener('visibilitychange', refresh);
    motionQuery.addEventListener('change', refresh);
    colorQuery.addEventListener('change', refresh);
    refresh();
})();
