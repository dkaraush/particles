const stats = new Stats();
const canvasParent = document.querySelector('#preview')
const canvas = document.querySelector('canvas.gl')
const texcanvas = document.querySelector('canvas.tex')

let W, H
const resize = () => {
  const sz = Math.min(700, Math.min(canvasParent.clientWidth, canvasParent.clientHeight) * .6)
  texcanvas.style.width = texcanvas.style.height = canvas.style.width = canvas.style.height = sz + 'px'
  canvas.width = texcanvas.width = W = Math.floor(sz * window.devicePixelRatio)
  canvas.height = texcanvas.height = H = Math.floor(sz * window.devicePixelRatio)

  // drawing test text texture:
  const ctx = texcanvas.getContext('2d')
  ctx.clearRect(0, 0, W, H)
  const scale = W / 500
  ctx.scale(scale, scale)
  ctx.fillStyle = 'rgba(255, 0, 0, 1)'
  ctx.fillRect(10, 10, 100, 40)
  ctx.fillRect(120, 10, 80, 40)
  ctx.fillRect(210, 10, 40, 40)
  ctx.fillRect(260, 10, 80, 40)

  ctx.fillRect(10, 60, 80, 40)
  ctx.fillRect(100, 60, 120, 40)
  
  ctx.fillRect(10, 110, 120, 40)
  ctx.fillRect(140, 110, 30, 40)
  ctx.fillRect(180, 110, 90, 40)
  ctx.fillRect(280, 110, 80, 40)
  ctx.fillRect(370, 110, 120, 40)
  
  ctx.fillRect(10, 160, 90, 40)
  
  ctx.fillRect(10, 260, 30, 40)
  ctx.fillRect(50, 260, 90, 40)
  ctx.fillRect(150, 260, 190, 40)
  ctx.fillRect(350, 260, 50, 40)

  ctx.fillStyle = 'rgba(255, 0, 0, .5)'
  ctx.fillRect(0, 0, 260+80+10, 60)
  ctx.fillRect(0, 60, 230, 40)
  ctx.fillRect(0, 100, 370+120+10, 60)
  ctx.fillRect(0, 160, 110, 50)
  ctx.fillRect(0, 250, 410, 60)

}
window.onresize = resize
resize()

function easeOutQuint(x) {
  return 1 - Math.pow(1 - x, 5);
}

let reset = true
const GUI = {
  particlesCount: 7000, // 5000 for non-text
  radius: window.devicePixelRatio * 1.6,
  reset: () => {
    reset = true
  },
  destroy: () => {
    die()
  },
  seed: Math.random() * 10,
  noiseScale: 22, // 6 for non-text
  noiseSpeed: .6,
  forceMult: .6,
  velocityMult: 1.,
  dampingMult: .9999,
  maxVelocity: 6.,
  longevity: 1.4,
  noiseMovement: 4,
  timeScale: 1, // .65 for non-text
  color: 0xffffff,

  fadeOut: false,
  fadeOutXY: [0, 0],

  text: true,
  showTextTexture: false
}

const gl = canvas.getContext('webgl2')

let transformFeedback
let bufferIndex = 0
let buffer
let bufferParticlesCount
let currentBuffer

let program
let textTexture

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
let colorHandle

let fadeOutHandle
let fadeOutXYHandle

let textHandle
let textTextureHandle

const genBuffer = () => {
  if (buffer) {
    gl.deleteBuffer(buffer[0])
    gl.deleteBuffer(buffer[1])
  }
  buffer = []
  for (let i = 0; i < 2; ++i) {
    buffer[i] = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer[i])
    gl.bufferData(gl.ARRAY_BUFFER, (bufferParticlesCount = Math.ceil(GUI.particlesCount)) * 7 * 4, gl.DYNAMIC_DRAW)
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
  gl.transformFeedbackVaryings(program, [ 'outPosition', 'outVelocity', 'outTime', 'outDuration', 'outAlpha' ], gl.INTERLEAVED_ATTRIBS)
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
  colorHandle = gl.getUniformLocation(program, 'color')

  fadeOutHandle = gl.getUniformLocation(program, 'fadeOut')
  fadeOutXYHandle = gl.getUniformLocation(program, 'fadeOutXY')

  textHandle = gl.getUniformLocation(program, 'text')
  textTextureHandle = gl.getUniformLocation(program, 'textTexture')

  textTexture = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, textTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, texcanvas);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_NEAREST);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.bindTexture(gl.TEXTURE_2D, null);

  gl.clearColor(0, 0, 0, 0)
  gl.viewport(0, 0, W, H)
  gl.enable(gl.BLEND)
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
}

let running = true
let time = 0
let fadeOutTime = 0
let lastDrawTime = window.performance.now()
const loop = () => {
  if (!running) {
    return
  }

  canvasParent.className = GUI.showTextTexture ? 'text' : 'notext'

  stats.begin();
  const now = window.performance.now()
  const dt = Math.min((now - lastDrawTime) / 1_000, 1) * GUI.timeScale
  lastDrawTime = now
  
  time += dt
  if (GUI.fadeOut) {
    const fadeOutDuration = 400 // ms
    fadeOutTime += (dt * 1000 / fadeOutDuration)
  }
  const fadeOutT = Math.min(fadeOutTime, 1)

  if (bufferParticlesCount < GUI.particlesCount) {
    genBuffer()
    reset = true
  }

  gl.viewport(0, 0, W, H)
  gl.clear(gl.COLOR_BUFFER_BIT)

  if (fadeOutT < 1) {
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
    gl.uniform3f(colorHandle,
      ((GUI.color >> 16) & 0xff) / 0xff,
      ((GUI.color >> 8) & 0xff) / 0xff,
      (GUI.color & 0xff) / 0xff
    )
    gl.uniform1f(fadeOutHandle, fadeOutT)
    gl.uniform2f(fadeOutXYHandle, GUI.fadeOutXY[0], GUI.fadeOutXY[1])
    gl.uniform1f(textHandle, GUI.text ? 1 : 0)
    if (GUI.text) {
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, textTexture)
      gl.uniform1i(textTextureHandle, 0)
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer[bufferIndex])
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 28, 0)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 28, 8)
    gl.enableVertexAttribArray(1)
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 28, 16)
    gl.enableVertexAttribArray(2)
    gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 28, 20)
    gl.enableVertexAttribArray(3)
    gl.vertexAttribPointer(4, 1, gl.FLOAT, false, 28, 24)
    gl.enableVertexAttribArray(4)
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, buffer[1 - bufferIndex])
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 28, 0)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 28, 8)
    gl.enableVertexAttribArray(1)
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 28, 16)
    gl.enableVertexAttribArray(2)
    gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 28, 20)
    gl.enableVertexAttribArray(3)
    gl.vertexAttribPointer(4, 1, gl.FLOAT, false, 28, 24)
    gl.enableVertexAttribArray(4)
    gl.beginTransformFeedback(gl.POINTS)
    gl.drawArrays(gl.POINTS, 0, GUI.particlesCount)
    gl.endTransformFeedback()
    gl.bindBuffer(gl.ARRAY_BUFFER, null)
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, null)
  } // else, everything is faded out, nothing to render
  
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

gui.add(GUI, 'text')
gui.add(GUI, 'showTextTexture')
gui.add(GUI, 'particlesCount', 0, 1_000_000)
gui.add(GUI, 'radius', 0, 30)
gui.add(GUI, 'timeScale', 0, 10)
gui.add(GUI, 'noiseScale', 0.01, 30)
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
gui.add(GUI, 'fadeOut')
gui.addColor(GUI, 'color')

canvas.onclick = e => {
  GUI.fadeOut = true
  GUI.fadeOutXY = [
    e.offsetX * window.devicePixelRatio,
    H - e.offsetY * window.devicePixelRatio
  ]
}