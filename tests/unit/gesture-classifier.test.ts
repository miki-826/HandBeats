import { describe,expect,it } from 'vitest';
import { classifyGesture,type Landmark } from '@/mediapipe/gestureClassifier';
function pose(extended:boolean[]):Landmark[]{
  const points=Array.from({length:21},()=>({x:0,y:0,z:0}));
  points[0]={x:0,y:.2,z:0};
  points[1]={x:.1,y:.14,z:0};points[2]={x:.17,y:.12,z:0};points[3]={x:.24,y:.1,z:0};points[4]={x:.31,y:.08,z:0};
  [5,9,13,17].forEach((base,finger)=>{const x=-.12+finger*.08;points[base]={x,y:0,z:0};points[base+1]={x,y:-.1,z:0};points[base+2]={x,y:extended[finger]?-.16:0,z:0};points[base+3]={x,y:extended[finger]?-.23:.07,z:0};});
  return points;
}
describe('anatomical gesture classification',()=>{
  it.each([
    [[false,false,false,false],'fist'],
    [[true,false,false,false],'gun'],
    [[true,true,true,true],'open'],
    [[true,true,false,false],null],
  ] as const)('classifies a pose independently of in-plane rotation and scale', (fingers,expected)=>{
    for(const rotation of [0,Math.PI/2,Math.PI]){
      const points=pose([...fingers]).map(p=>({x:(p.x*Math.cos(rotation)-p.y*Math.sin(rotation))*2+.3,y:(p.x*Math.sin(rotation)+p.y*Math.cos(rotation))*2+.2,z:0}));
      expect(classifyGesture(points)).toBe(expected);
    }
  });
});
