import * as T from "three";
import { mesh, randomFor } from "./primitives";
import { taperedRock } from "./terrain";

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

function softCloud(seed: number) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const context = canvas.getContext("2d")!;
  const random = randomFor(seed);
  for (let i = 0; i < 49; i++) {
    const x = 42 + random() * 172;
    const y = 41 + (1 - Math.sin(x * .055 + seed)) * 12 + random() * 30;
    const radius = 9 + random() * 35;
    const fade = .75 * (1 - Math.abs(x - 128) / 165);
    const lobe = context.createRadialGradient(x - radius * .12, y - radius * .37, radius * .09, x, y, radius);
    lobe.addColorStop(0, "rgba(209,229,211," + fade + ")");
    lobe.addColorStop(.39, "rgba(164,197,190," + fade * .85 + ")");
    lobe.addColorStop(.76, "rgba(75,126,130," + fade * .31 + ")");
    lobe.addColorStop(1, "rgba(50,104,111,0)");
    context.fillStyle = lobe;
    context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  const result = new T.CanvasTexture(canvas);
  result.colorSpace = T.SRGBColorSpace;
  return result;
}

export function atmosphere(parent: T.Scene, compact: boolean) {
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
  const rock = new T.MeshStandardMaterial({ color: 0x518b8d, roughness: 1, vertexColors: true, side: T.DoubleSide });
  for (const [index, [x, y, z, w, h, d]] of [
    [-19,-7,-23,6.0,12,7],[-12,-8,-30,5.1,9.5,7], [-27,-7,-40,6,13,6],
    [24,-9,-25,5.9,13,8],[18,-12,-18,5.5,8,6],[30,-9,-39,8,14,9],
    [38,-5,-56,9,15,9],[-27,-10,-53,9,11,10],[8,-11,-40,7,8,8],
  ].entries()) taperedRock(group, rock, [x, y, z], [w, h, d], 956 + index, true);

  const cloudMaps = [softCloud(12), softCloud(48), softCloud(179)];
  const random = randomFor(319);
  const layer = (x: number, y: number, z: number, width: number, height: number, alpha: number) => {
    const stock = new T.SpriteMaterial({
      map: cloudMaps[Math.floor(random() * cloudMaps.length)], depthWrite: false,
      transparent: true, opacity: alpha, color: 0xe5f0ea,
    });
    const mist = new T.Sprite(stock);
    mist.position.set(x, y, z);
    mist.scale.set(width, height, 1);
    group.add(mist);
  };
  for (let i = 0; i < (compact ? 34 : 49); i++) {
    const x = -33 + random() * 69, z = -40 + random() * 45;
    const y = -4.8 + random() * 7.3;
    layer(x, y, z, 4.6 + random() * 12, 2.3 + random() * 3.4, .32 + random() * .55);
  }
  layer(-9.4, -2.2, 7.5, 12, 4.1, .75);
  layer(10.8, -1.65, 7.8, 9.1, 3.4, .75);
  layer(-12.1, -.94, 12.8, 8.8, 3.6, .52);
  layer(12.1, -1.4, 12.7, 10.8, 3.8, .51);
  for (const [x, y, z] of [[-4.7,.25,3.7],[11.5,2.6,.2],[2.55,6.25,-7.4],[7.7,-.92,7.8]]) {
    layer(x,y,z,3.8,1.43,.70);
  }

  const stars: number[] = [];
  const colors: number[] = [];
  for (let i = 0; i < 440; i++) {
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
  return { daylight, starField };
}
