#version 300 es

precision highp float;

layout(location = 0) in vec2 inPosition;
layout(location = 1) in vec2 inVelocity;
layout(location = 2) in float inTime;
layout(location = 3) in float inDuration;

out vec2 outPosition;
out vec2 outVelocity;
out float outTime;
out float outDuration;

out float alpha;

uniform float reset;
uniform float time;
uniform float deltaTime;
uniform vec2 size;
uniform float r;
uniform float seed;
uniform float noiseScale;
uniform float noiseSpeed;
uniform float dampingMult;
uniform float forceMult;
uniform float velocityMult;
uniform float longevity;
uniform float maxVelocity;
uniform float noiseMovement;

float rand(vec2 n) { 
	return fract(sin(dot(n, vec2(12.9898, 4.1414 - seed * .42))) * 43758.5453);
}
vec4 loop(vec4 p) {
  p.xy = fract(p.xy / noiseScale) * noiseScale;
  p.zw = fract(p.zw / noiseScale) * noiseScale;
  return p;
}
vec3 loop(vec3 p) {
  p.xy = fract(p.xy / noiseScale) * noiseScale;
  return p;
}
float mod289(float x){return x - floor(x * (1.0 / (289.0 + seed))) * (289.0 + seed);}
vec4 mod289(vec4 x){return x - floor(x * (1.0 / (289.0 + seed))) * (289.0 + seed);}
vec4 perm(vec4 x){return mod289(((x * 34.0) + 1.0) * x);}
float noise(vec3 p){
  
  vec3 a = floor(p);
  vec3 d = p - a;
  d = d * d * (3.0 - 2.0 * d);

  vec4 b = a.xxyy + vec4(0.0, 1.0, 0.0, 1.0);
  vec4 k1 = perm(loop(b.xyxy));
  vec4 k2 = perm(loop(k1.xyxy + b.zzww));

  vec4 c = k2 + a.zzzz;
  vec4 k3 = perm(c);
  vec4 k4 = perm(c + 1.0);

  vec4 o1 = fract(k3 * (1.0 / 41.0));
  vec4 o2 = fract(k4 * (1.0 / 41.0));

  vec4 o3 = o2 * d.z + o1 * (1.0 - d.z);
  vec2 o4 = o3.yw * d.x + o3.xz * (1.0 - d.x);

  return o4.y * d.y + o4.x * (1.0 - d.y);
}
vec3 grad(vec3 p) {
  const float e = 0.1;

  float n1, n2, n3;

  vec3 ex = vec3(e, 0.0, 0.0);
  vec3 ey = vec3(0.0, e, 0.0);
  vec3 ez = vec3(0.0, 0.0, e);

  n1 = noise(loop(p + ex)) - noise(loop(p - ex));
  n2 = noise(loop(p + ey)) - noise(loop(p - ey));
  n3 = noise(loop(p + ez)) - noise(loop(p - ez));

  return vec3(n1, n2, n3) / (2.0 * e);
}
vec3 curlNoise(vec3 p) {
  p.xy /= size;
  p.x *= (size.x / size.y);
  p.xy = fract(p.xy);
  p.xy *= noiseScale;

  vec3 dp = grad(loop(p));
  
  float x = dp.y - grad(loop(p + vec3(0.0, 0.01, 0.0))).z;
  float y = dp.z - grad(loop(p + vec3(0.0, 0.0, 0.01))).x;
  float z = dp.x - grad(loop(p + vec3(0.01, 0.0, 0.0))).y;

  return vec3(x, y, z);
}


void main() {
  vec2 position = inPosition;
  vec2 velocity = inVelocity;
  float particleDuration = inDuration;
  float particleTime = inTime + deltaTime * particleDuration / longevity;

  if (reset > 0.) {
    particleTime = rand(vec2(-94.3, 83.9) * vec2(gl_VertexID, gl_VertexID));
    particleDuration = .2 + 4. * rand(vec2(gl_VertexID) + seed * 32.4);
    position = vec2(
      rand(vec2(42., -3.) * vec2(cos(float(gl_VertexID) - seed), gl_VertexID)),
      rand(vec2(-3., 42.) * vec2(time * time, sin(float(gl_VertexID) + seed)))
    ) * size;
    velocity = vec2(0.);
  } else if (particleTime >= 1.) {
    particleTime = 0.0;
    particleDuration = .2 + 4. * rand(vec2(gl_VertexID) + position);
    velocity = vec2(0.);
  }
  
  vec2 force = normalize(curlNoise(vec3(position + time * noiseMovement, time * noiseSpeed + rand(position) * 2.5)).xy);

  velocity += force * forceMult * deltaTime * min(size.x, size.y) * .1;
  velocity *= dampingMult;
  float vlen = length(velocity);
  if (vlen > maxVelocity) {
    velocity = velocity / vlen * maxVelocity;
  }

  position += velocity * velocityMult * deltaTime;
  position = fract(position / size) * size;

  outPosition = position;
  outVelocity = velocity;
  outTime = particleTime;
  outDuration = particleDuration;

  gl_PointSize = r;
  gl_Position = vec4((position / size * 2.0 - vec2(1.0)), 0.0, 1.0);
  alpha = sin(particleTime * 3.14);
}
