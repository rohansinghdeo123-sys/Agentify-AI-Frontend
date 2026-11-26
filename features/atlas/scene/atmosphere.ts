import * as T from "three";
import { mesh, randomFor } from "./primitives";
import { clouds } from "./clouds";
import { addMountainRanges } from "./mountainRanges";

const skyVertex = `
  varying vec3 world;
  void main() {
    vec4 wt = modelMatrix * vec4(position,1.);
    world = wt.xyz;
    gl_Position = projectionMatrix * viewMatrix * wt;
  }
`;

const skyFragment = `
  varying vec3 world;
  uniform float daylight;
  float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float noise(vec2 p){
    vec2 i=floor(p),f=fract(p);
    vec2 u=f*f*(3.-2.*f);
    return mix(mix(hash(i),hash(i+vec2(1.,0.)),u.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),u.x),u.y);
  }
  void main(){
    vec3 direction=normalize(world-cameraPosition);
    float horizon=exp(-abs(direction.y+.105)*5.6);
    vec3 color=mix(vec3(.006,.056,.061),vec3(.11,.34,.32),horizon*.77);
    vec2 p=direction.xy*vec2(10.,15.);
    vec2 turbulence=vec2(noise(p*.69+10.),noise(p*.62-6.));
    float haze=noise(p+turbulence*2.)+noise(p*2.06+4.35)*.4+noise(p*4.2)*.24+noise(p*8.)*.08;
    float aurora=exp(-abs(direction.y+.10-direction.x*.37)*5.);
    float veil=smoothstep(.76,1.25,haze)*(.21+aurora*.47);
    color=mix(color,vec3(.066,.37,.32),veil);
    vec3 day=mix(vec3(.71,.85,.83),vec3(.95,.95,.87),horizon*.86);
    day=mix(day,vec3(.57,.79,.74),veil*.7);
    gl_FragColor=sRGBTransferEOTF(vec4(mix(color,day,daylight),1.));
    #include <colorspace_fragment>
  }
`;

const waterFragment = `
  varying vec3 world;
  void main() {
    vec3 view=normalize(cameraPosition-world);
    float waves=sin(world.z*14.+sin(world.x*1.51))*.57+sin(world.z*27.+world.x*.84)*.27+sin(world.z*46.-world.x*4.3)*.16;
    float shore=exp(-abs(world.x+1.)*.15)*exp(-abs(world.z-8.)*.12);
    float glint=exp(-abs(world.x+.8)*.60)*exp(-abs(world.z-10.)*.23)*pow(max(waves*.5+.5,0.),3.8);
    float edge=exp(-distance(world.xz,vec2(0.,8.))*.14);
    vec3 color=mix(vec3(.015,.10,.105),vec3(.025,.24,.215),shore*.79);
    color+=vec3(.72,.37,.10)*glint*.73;
    gl_FragColor=sRGBTransferEOTF(vec4(color,edge*(.28+.56*view.y)));
    #include <colorspace_fragment>
  }
`;

export function atmosphere(parent: T.Scene, compact: boolean, redraw: () => void) {
  const group = new T.Group();
  group.name = "Atmosphere and mountain ranges";
  parent.add(group);
  const daylight = { value: 0 };
  mesh(group, new T.SphereGeometry(154, 32, 20), new T.ShaderMaterial({
    vertexShader: skyVertex, fragmentShader: skyFragment, side: T.BackSide,
    uniforms: { daylight },
    depthWrite: false,
  })).renderOrder = -20;
  const water = mesh(group, new T.PlaneGeometry(60, 43), new T.ShaderMaterial({
    vertexShader: skyVertex, fragmentShader: waterFragment, transparent: true, depthWrite: false,
  }), [0, -.76, 4]);
  water.rotation.x = -Math.PI / 2;
  water.renderOrder = -1;
  addMountainRanges(group, compact);

  const cloudLayer = clouds(group, compact, redraw);

  // The established sky pattern is independent of the cloud bank count.
  const random = randomFor(compact ? 3270378621 : 2639693888);
  const stars: number[] = [];
  const colors: number[] = [];
  for (let i = 0; i < 290; i++) {
    stars.push(-48 + random() * 95, 5 + random() * 37, -42 - random() * 40);
    const intensity = .29 + random() * .65;
    colors.push(.84 * intensity, 1 * intensity, .90 * intensity);
  }
  const skyPoints = new T.BufferGeometry();
  skyPoints.setAttribute("position", new T.Float32BufferAttribute(stars, 3));
  skyPoints.setAttribute("color", new T.Float32BufferAttribute(colors, 3));
  const starField = new T.Points(skyPoints, new T.PointsMaterial({
    size: .069, transparent: true, vertexColors: true, opacity: .72, depthWrite: false, fog: false,
  }));
  group.add(starField);
  return {
    daylight,
    starField,
    ...cloudLayer,
  };
}
