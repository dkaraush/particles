const stats = new Stats();
const canvasParent = document.querySelector('#preview')
const canvas = document.querySelector('canvas')

let W, H
const resize = () => {
  const sz = Math.min(700, Math.min(canvasParent.clientWidth, canvasParent.clientHeight) * .6)
  canvas.style.width = canvas.style.height = sz + 'px'
  canvas.width = W = Math.floor(sz * window.devicePixelRatio)
  canvas.height = H = Math.floor(sz * window.devicePixelRatio)
}
window.onresize = resize
resize()

let reset = true
const GUI = {
  particlesCount: 5000,
  radius: window.devicePixelRatio * 1.6,
  reset: () => {
    reset = true
  },
  destroy: () => {
    die()
  },
  seed: Math.random() * 10,
  noiseScale: 6,
  noiseSpeed: .6,
  forceMult: .6,
  velocityMult: 1.,
  dampingMult: .9999,
  maxVelocity: 6.,
  longevity: 1.4,
  noiseMovement: 4,
  timeScale: .65
}

const gl = canvas.getContext('webgl2')

let transformFeedback
let bufferIndex = 0
let buffer
let bufferParticlesCount
let currentBuffer

let program

let timeHandle
let deltaTimeHandle
let sizeHandle
let resetHandle
let radiusHandle
let seedHandle
let noiseScaleHandle
let noiseSpeedHandle
let forcegMultHandle
let velocityMultHandle
let dampingMultHandle
let longevityHandle
let maxVelocityHandle
let noiseMovementHandle

const genBuffer = () => {
  if (buffer) {
    gl.deleteBuffer(buffer[0])
    gl.deleteBuffer(buffer[1])
  }
  buffer = []
  for (let i = 0; i < 2; ++i) {
    buffer[i] = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer[i])
    gl.bufferData(gl.ARRAY_BUFFER, (bufferParticlesCount = Math.ceil(GUI.particlesCount)) * 6 * 4, gl.DYNAMIC_DRAW)
  }
}

const compileShader = async (type, path) => {
  const shader = gl.createShader(type)
  gl.shaderSource(shader, await (await fetch(path)).text() + '\n//' + Math.random())
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw 'compile shader error:\n' + gl.getShaderInfoLog(shader)
  }
  return shader
}

const init = async () => {

  genBuffer()

  const vertexShader = await compileShader(gl.VERTEX_SHADER, './vertex.glsl')
  const fragmentShader = await compileShader(gl.FRAGMENT_SHADER, './fragment.glsl')
  program = gl.createProgram()
  gl.attachShader(program, vertexShader)
  gl.attachShader(program, fragmentShader)
  gl.transformFeedbackVaryings(program, [ 'outPosition', 'outVelocity', 'outTime', 'outDuration' ], gl.INTERLEAVED_ATTRIBS)
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw 'program link error:\n' + gl.getProgramInfoLog(program)
  }
  gl.deleteShader(vertexShader)
  gl.deleteShader(fragmentShader)

  timeHandle = gl.getUniformLocation(program, 'time')
  deltaTimeHandle = gl.getUniformLocation(program, 'deltaTime')
  sizeHandle = gl.getUniformLocation(program, 'size')
  resetHandle = gl.getUniformLocation(program, 'reset')
  radiusHandle = gl.getUniformLocation(program, 'r')
  seedHandle = gl.getUniformLocation(program, 'seed')
  noiseScaleHandle = gl.getUniformLocation(program, 'noiseScale')
  noiseSpeedHandle = gl.getUniformLocation(program, 'noiseSpeed')
  dampingMultHandle = gl.getUniformLocation(program, 'dampingMult')
  velocityMultHandle = gl.getUniformLocation(program, 'velocityMult')
  forceMultHandle = gl.getUniformLocation(program, 'forceMult')
  longevityHandle = gl.getUniformLocation(program, 'longevity')
  maxVelocityHandle = gl.getUniformLocation(program, 'maxVelocity')
  noiseMovementHandle = gl.getUniformLocation(program, 'noiseMovement')

  gl.clearColor(0, 0, 0, 0)
  gl.viewport(0, 0, W, H)
  gl.enable(gl.BLEND)
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
}

let running = true
let time = 0
let lastDrawTime = window.performance.now()
const loop = () => {
  if (!running) {
    return
  }

  stats.begin();
  const now = window.performance.now()
  const dt = (now - lastDrawTime) / 1_000 * GUI.timeScale
  lastDrawTime = now
  
  time += dt

  if (bufferParticlesCount < GUI.particlesCount) {
    genBuffer()
    reset = true
  }

  gl.viewport(0, 0, W, H)
  gl.clear(gl.COLOR_BUFFER_BIT)

  gl.useProgram(program)
  gl.uniform1f(resetHandle, reset ? 1 : 0)
  if (reset) {
    time = 0
    reset = false;
  }
  gl.uniform1f(timeHandle, time)
  gl.uniform1f(deltaTimeHandle, dt)
  gl.uniform2f(sizeHandle, W, H)
  gl.uniform1f(seedHandle, GUI.seed)
  gl.uniform1f(radiusHandle, GUI.radius)
  gl.uniform1f(noiseScaleHandle, GUI.noiseScale)
  gl.uniform1f(noiseSpeedHandle, GUI.noiseSpeed)
  gl.uniform1f(dampingMultHandle, GUI.dampingMult)
  gl.uniform1f(velocityMultHandle, GUI.velocityMult)
  gl.uniform1f(forceMultHandle, GUI.forceMult)
  gl.uniform1f(longevityHandle, GUI.longevity)
  gl.uniform1f(maxVelocityHandle, GUI.maxVelocity)
  gl.uniform1f(noiseMovementHandle, GUI.noiseMovement)
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer[bufferIndex])
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 24, 0)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 24, 8)
  gl.enableVertexAttribArray(1)
  gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 24, 16)
  gl.enableVertexAttribArray(2)
  gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 24, 20)
  gl.enableVertexAttribArray(3)
  gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, buffer[1 - bufferIndex])
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 24, 0)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 24, 8)
  gl.enableVertexAttribArray(1)
  gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 24, 16)
  gl.enableVertexAttribArray(2)
  gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 24, 20)
  gl.enableVertexAttribArray(3)
  gl.beginTransformFeedback(gl.POINTS)
  gl.drawArrays(gl.POINTS, 0, GUI.particlesCount)
  gl.endTransformFeedback()
  gl.bindBuffer(gl.ARRAY_BUFFER, null)
  gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, null)
  
  bufferIndex = 1 - bufferIndex
  stats.end();

  requestAnimationFrame(loop)
}

(async () => {
  await init()
  loop()
})()

const die = () => {
  running = false
  
  if (buffer) {
    gl.deleteBuffer(buffer[0])
    gl.deleteBuffer(buffer[1])
  }
  buffer = null
  gl.deleteProgram(program)
  program = null
  canvas.remove()
}

const gui = new dat.GUI({ hideable: false })
gui.domElement.remove()
document.querySelector('#tools').appendChild(gui.domElement)

stats.showPanel( 0 );
var perfLi = document.createElement("li");
perfLi.style.height = '50px'
stats.domElement.style.position = "static";
perfLi.appendChild(stats.domElement);
perfLi.classList.add("gui-stats");
gui.__ul.appendChild(perfLi);

gui.add(GUI, 'particlesCount', 0, 1_000_000)
gui.add(GUI, 'radius', 0, 30)
gui.add(GUI, 'timeScale', 0, 10)
gui.add(GUI, 'noiseScale', 0.01, 20)
gui.add(GUI, 'noiseSpeed', 0., 3)
gui.add(GUI, 'noiseMovement', 0, 100)
gui.add(GUI, 'longevity', 0, 3)
gui.add(GUI, 'maxVelocity', 0, 100)
gui.add(GUI, 'forceMult', 0, 15)
gui.add(GUI, 'velocityMult', 0, 15)
gui.add(GUI, 'dampingMult', 0.9, 0.9999)
gui.add(GUI, 'seed', 0, 100)
gui.add(GUI, 'reset')
gui.add(GUI, 'destroy')