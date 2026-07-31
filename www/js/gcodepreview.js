var gcode_preview_max_bytes = 100 * 1024 * 1024;
var gcode_preview_renderer = null;
var gcode_preview_abort = null;
var gcode_preview_load_id = 0;
var gcode_preview_selected = "";

function GCodePreviewRenderer(canvas) {
    this.canvas = canvas;
    this.gl = canvas.getContext("webgl", { antialias: false });
    if (!this.gl) throw new Error("WebGL is not available");

    var gl = this.gl;
    var vertex = this.shader(gl.VERTEX_SHADER,
        "attribute vec2 position;" +
        "uniform vec2 center;" +
        "uniform vec2 scale;" +
        "void main(){vec2 p=(position-center)*scale;gl_Position=vec4(p,0.0,1.0);}");
    var fragment = this.shader(gl.FRAGMENT_SHADER,
        "precision mediump float;" +
        "uniform vec4 color;" +
        "void main(){gl_FragColor=color;}");
    this.program = gl.createProgram();
    gl.attachShader(this.program, vertex);
    gl.attachShader(this.program, fragment);
    gl.linkProgram(this.program);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(this.program));
    }
    this.position = gl.getAttribLocation(this.program, "position");
    this.centerUniform = gl.getUniformLocation(this.program, "center");
    this.scaleUniform = gl.getUniformLocation(this.program, "scale");
    this.colorUniform = gl.getUniformLocation(this.program, "color");
    this.buffers = [];
    this.pending = { rapid: [], feed: [] };
    this.segmentCount = 0;
    this.centerX = 0;
    this.centerY = 0;
    this.viewHeight = 10;
    this.resetBounds();
    this.bindControls();
    this.resize();
}

GCodePreviewRenderer.prototype.shader = function(type, source) {
    var shader = this.gl.createShader(type);
    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);
    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
        throw new Error(this.gl.getShaderInfoLog(shader));
    }
    return shader;
};

GCodePreviewRenderer.prototype.resetBounds = function() {
    this.minX = Infinity;
    this.minY = Infinity;
    this.maxX = -Infinity;
    this.maxY = -Infinity;
};


GCodePreviewRenderer.prototype.add = function(type, x1, y1, x2, y2) {
    var points = this.pending[type];
    points.push(x1, y1, x2, y2);
    this.minX = Math.min(this.minX, x1, x2);
    this.minY = Math.min(this.minY, y1, y2);
    this.maxX = Math.max(this.maxX, x1, x2);
    this.maxY = Math.max(this.maxY, y1, y2);
    this.segmentCount++;
    if (points.length >= 16384) this.flush(type);
};

GCodePreviewRenderer.prototype.flush = function(type) {
    var points = this.pending[type];
    if (points.length == 0) return;
    var buffer = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(points), this.gl.STATIC_DRAW);
    this.buffers.push({ buffer: buffer, count: points.length / 2, type: type });
    this.pending[type] = [];
};

GCodePreviewRenderer.prototype.clear = function() {
    for (var i = 0; i < this.buffers.length; i++) {
        this.gl.deleteBuffer(this.buffers[i].buffer);
    }
    this.buffers = [];
    this.pending = { rapid: [], feed: [] };
    this.segmentCount = 0;
    this.resetBounds();
    this.draw();
};

GCodePreviewRenderer.prototype.finish = function() {
    this.flush("rapid");
    this.flush("feed");
};

GCodePreviewRenderer.prototype.fit = function() {
    if (!isFinite(this.minX)) return;
    this.resize();
    var width = Math.max(this.maxX - this.minX, 0.001);
    var height = Math.max(this.maxY - this.minY, 0.001);
    var aspect = this.canvas.width / this.canvas.height;
    this.centerX = (this.minX + this.maxX) / 2;
    this.centerY = (this.minY + this.maxY) / 2;
    this.viewHeight = Math.max(height, width / aspect) * 1.1;
    this.draw();
};

GCodePreviewRenderer.prototype.resize = function() {
    var rect = this.canvas.getBoundingClientRect();
    var ratio = window.devicePixelRatio || 1;
    var width = Math.max(1, Math.round(rect.width * ratio));
    var height = Math.max(1, Math.round(rect.height * ratio));
    if (this.canvas.width != width || this.canvas.height != height) {
        this.canvas.width = width;
        this.canvas.height = height;
    }
    this.gl.viewport(0, 0, width, height);
};

GCodePreviewRenderer.prototype.draw = function() {
    var gl = this.gl;
    this.resize();
    gl.clearColor(1, 1, 1, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program);
    gl.enableVertexAttribArray(this.position);
    var aspect = this.canvas.width / this.canvas.height;
    gl.uniform2f(this.centerUniform, this.centerX, this.centerY);
    gl.uniform2f(this.scaleUniform, 2 / (this.viewHeight * aspect), 2 / this.viewHeight);
    for (var i = 0; i < this.buffers.length; i++) {
        var item = this.buffers[i];
        if (item.type == "rapid") gl.uniform4f(this.colorUniform, 0.2, 0.65, 0.9, 1);
        else gl.uniform4f(this.colorUniform, 0.1, 0.25, 0.55, 1);
        gl.bindBuffer(gl.ARRAY_BUFFER, item.buffer);
        gl.vertexAttribPointer(this.position, 2, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.LINES, 0, item.count);
    }
};

GCodePreviewRenderer.prototype.bindControls = function() {
    var renderer = this;
    var dragging = false;
    var lastX = 0;
    var lastY = 0;
    this.canvas.addEventListener("pointerdown", function(event) {
        dragging = true;
        lastX = event.clientX;
        lastY = event.clientY;
        renderer.canvas.setPointerCapture(event.pointerId);
    });
    this.canvas.addEventListener("pointerup", function(event) {
        dragging = false;
        renderer.canvas.releasePointerCapture(event.pointerId);
    });
    this.canvas.addEventListener("pointercancel", function() { dragging = false; });
    this.canvas.addEventListener("pointermove", function(event) {
        if (!dragging) return;
        var rect = renderer.canvas.getBoundingClientRect();
        var scale = renderer.viewHeight / rect.height;
        renderer.centerX -= (event.clientX - lastX) * scale * (rect.width / rect.height);
        renderer.centerY += (event.clientY - lastY) * scale;
        lastX = event.clientX;
        lastY = event.clientY;
        renderer.draw();
    });
    this.canvas.addEventListener("wheel", function(event) {
        event.preventDefault();
        renderer.viewHeight *= event.deltaY < 0 ? 0.8 : 1.25;
        renderer.draw();
    }, { passive: false });
};

function GCodePreviewParser(segmentFn) {
    this.segmentFn = segmentFn;
    this.x = 0;
    this.y = 0;
    this.z = 0;
    this.motion = 0;
    this.absolute = true;
    this.arcAbsolute = false;
    this.unit = 1;
    this.plane = 17;
    this.warnings = 0;
}

GCodePreviewParser.prototype.line = function(text) {
    text = text.replace(/\([^)]*\)/g, "");
    text = text.split(";")[0];
    var regex = /([A-Za-z])\s*([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/g;
    var words = {};
    var suppressMotion = false;
    var match;
    while ((match = regex.exec(text)) !== null) {
        var letter = match[1].toUpperCase();
        var value = Number(match[2]);
        if (letter == "G") {
            if (value == 0 || value == 1 || value == 2 || value == 3) this.motion = value;
            else if (value == 17 || value == 18 || value == 19) this.plane = value;
            else if (value == 20) this.unit = 25.4;
            else if (value == 21) this.unit = 1;
            else if (value == 90) this.absolute = true;
            else if (value == 91) this.absolute = false;
            else if (value == 90.1) this.arcAbsolute = true;
            else if (value == 91.1) this.arcAbsolute = false;
            else if (value == 10 || value == 28 || value == 30 || value == 43.1 || value == 92) suppressMotion = true;
        } else {
            words[letter] = value;
        }
    }
    var hasAxis = words.X !== undefined || words.Y !== undefined || words.Z !== undefined;
    var hasArc = words.I !== undefined || words.J !== undefined || words.R !== undefined;
    if (suppressMotion || (!hasAxis && !(hasArc && (this.motion == 2 || this.motion == 3)))) return;

    var x = words.X === undefined ? this.x : (this.absolute ? words.X * this.unit : this.x + words.X * this.unit);
    var y = words.Y === undefined ? this.y : (this.absolute ? words.Y * this.unit : this.y + words.Y * this.unit);
    var z = words.Z === undefined ? this.z : (this.absolute ? words.Z * this.unit : this.z + words.Z * this.unit);
    if (this.motion == 0 || this.motion == 1) {
        if (x != this.x || y != this.y) this.segmentFn(this.motion == 0 ? "rapid" : "feed", this.x, this.y, x, y);
    } else if (this.motion == 2 || this.motion == 3) {
        if (this.plane == 17) this.arc(this.motion == 2, x, y, words);
        else {
            this.warnings++;
            if (x != this.x || y != this.y) this.segmentFn("feed", this.x, this.y, x, y);
        }
    }
    this.x = x;
    this.y = y;
    this.z = z;
};

GCodePreviewParser.prototype.arc = function(clockwise, x, y, words) {
    var centerX;
    var centerY;
    if (words.R !== undefined) {
        var radius = words.R * this.unit;
        var dx = x - this.x;
        var dy = y - this.y;
        var chord = Math.sqrt(dx * dx + dy * dy);
        if (chord == 0 || Math.abs(radius) < chord / 2) {
            this.warnings++;
            this.segmentFn("feed", this.x, this.y, x, y);
            return;
        }
        var h = Math.sqrt(radius * radius - chord * chord / 4);
        var sign = (clockwise ? -1 : 1) * (radius < 0 ? -1 : 1);
        centerX = (this.x + x) / 2 - dy * h * sign / chord;
        centerY = (this.y + y) / 2 + dx * h * sign / chord;
    } else {
        if (words.I === undefined && words.J === undefined) {
            this.warnings++;
            if (x != this.x || y != this.y) this.segmentFn("feed", this.x, this.y, x, y);
            return;
        }
        var i = (words.I || 0) * this.unit;
        var j = (words.J || 0) * this.unit;
        centerX = this.arcAbsolute ? i : this.x + i;
        centerY = this.arcAbsolute ? j : this.y + j;
    }
    var startAngle = Math.atan2(this.y - centerY, this.x - centerX);
    var endAngle = Math.atan2(y - centerY, x - centerX);
    var sweep = endAngle - startAngle;
    if (clockwise && sweep >= 0) sweep -= Math.PI * 2;
    if (!clockwise && sweep <= 0) sweep += Math.PI * 2;
    var segments = Math.min(180, Math.max(2, Math.ceil(Math.abs(sweep) / (Math.PI / 36))));
    var oldX = this.x;
    var oldY = this.y;
    var radiusValue = Math.sqrt((this.x - centerX) * (this.x - centerX) + (this.y - centerY) * (this.y - centerY));
    for (var n = 1; n <= segments; n++) {
        var angle = startAngle + sweep * n / segments;
        var nextX = n == segments ? x : centerX + radiusValue * Math.cos(angle);
        var nextY = n == segments ? y : centerY + radiusValue * Math.sin(angle);
        this.segmentFn("feed", oldX, oldY, nextX, nextY);
        oldX = nextX;
        oldY = nextY;
    }
};

function gcode_preview_status(text) {
    id("gcode_preview_status").textContent = text;
}

function gcode_preview_url(path, name) {
    var parts = (path + name).split("/");
    var encoded = [];
    for (var i = 0; i < parts.length; i++) {
        if (parts[i].length) encoded.push(encodeURIComponent(parts[i]));
    }
    return "/SD/" + encoded.join("/");
}

async function gcode_preview_stream(url, expectedSize, phase, segmentFn, loadId) {
    var response = await fetch(url, { signal: gcode_preview_abort.signal, credentials: "same-origin" });
    if (!response.ok) throw new Error("File load failed (" + response.status + ")");
    if (!response.body || !response.body.getReader) throw new Error("Streaming is not supported by this browser");
    var reader = response.body.getReader();
    var decoder = new TextDecoder("utf-8");
    var parser = new GCodePreviewParser(segmentFn);
    var tail = "";
    var bytes = 0;
    var lastStatus = 0;
    while (true) {
        var result = await reader.read();
        if (loadId != gcode_preview_load_id) return null;
        if (result.done) break;
        bytes += result.value.byteLength;
        if (bytes > gcode_preview_max_bytes) throw new Error("File exceeds 100 MB preview limit");
        var text = tail + decoder.decode(result.value, { stream: true });
        var lines = text.split(/\r?\n/);
        tail = lines.pop();
        for (var i = 0; i < lines.length; i++) parser.line(lines[i]);
        if (Date.now() - lastStatus > 250) {
            var percent = expectedSize > 0 ? Math.min(100, Math.round(bytes * 100 / expectedSize)) : 0;
            gcode_preview_status(phase + (percent ? " " + percent + "%" : ""));
            lastStatus = Date.now();
        }
    }
    tail += decoder.decode();
    if (tail.length) parser.line(tail);
    return parser;
}

async function gcode_preview_load(path, entry, loadId) {
    var size = Number(entry.size);
    if (isNaN(size)) size = 0;
    if (size > gcode_preview_max_bytes) throw new Error("File exceeds 100 MB preview limit");
    if (!gcode_preview_renderer) gcode_preview_renderer = new GCodePreviewRenderer(id("gcode_preview_canvas"));
    gcode_preview_renderer.clear();

    var parser = await gcode_preview_stream(gcode_preview_url(path, entry.sdname), size, "Loading", function(type, x1, y1, x2, y2) {
        gcode_preview_renderer.add(type, x1, y1, x2, y2);
    }, loadId);
    if (!parser || loadId != gcode_preview_load_id) return;
    gcode_preview_renderer.finish();
    gcode_preview_renderer.fit();
    var status = gcode_preview_renderer.segmentCount + " segments";
    if (parser.warnings) status += ", " + parser.warnings + " unsupported arcs";
    gcode_preview_status(status);
}

function gcode_preview_select(path, entry, index) {
    if (!entry.isprintable) return;
    gcode_preview_load_id++;
    if (gcode_preview_abort) gcode_preview_abort.abort();
    gcode_preview_abort = new AbortController();
    gcode_preview_selected = path + entry.sdname;
    id("gcode_preview_filename").textContent = entry.name;
    gcode_preview_status("Loading");
    var selected = document.querySelectorAll(".gcode-preview-selected");
    for (var i = 0; i < selected.length; i++) selected[i].classList.remove("gcode-preview-selected");
    var row = id("files_file_" + index);
    if (row) row.classList.add("gcode-preview-selected");
    gcode_preview_load(path, entry, gcode_preview_load_id).catch(function(error) {
        if (error.name != "AbortError") gcode_preview_status(error.message);
    });
}

function gcode_preview_is_selected(path, name) {
    return gcode_preview_selected == path + name;
}

function gcode_preview_clear_selection() {
    gcode_preview_load_id++;
    if (gcode_preview_abort) gcode_preview_abort.abort();
    gcode_preview_selected = "";
    var filename = id("gcode_preview_filename");
    if (filename) filename.textContent = "";
    if (gcode_preview_renderer) gcode_preview_renderer.clear();
    var status = id("gcode_preview_status");
    if (status) status.textContent = "Select a G-code file";
}

function gcode_preview_fit() {
    if (gcode_preview_renderer) gcode_preview_renderer.fit();
}

window.addEventListener("resize", function() {
    if (gcode_preview_renderer) gcode_preview_renderer.draw();
});
