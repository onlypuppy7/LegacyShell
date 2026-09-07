import assert from 'node:assert/strict';
import { simulateEdge } from './physicsSimulation.js';
const from = {x:0.5,y:1,z:0.5}, to = {x:1.9,y:1,z:0.5};
const p = { ...from, dx:0,dy:0,dz:0,climbing:false,jumping:false,climbingCell:{},modifiers:{},
    Collider:{playerCollidesWithMap:()=>true},
    createSnapshot(){return {...from,climbing:false};},
    restoreSnapshot(s){Object.assign(this,s);},
    jump(){return false;},
    simulateMovement(){this.x=1.1;this.y=1;this.z=0.5;this.dy=0;},
};
assert.equal(simulateEdge(p,from,to,{requireSupport:true,maxTicks:4}).success,false,
    'being supported elsewhere in the same grid cell does not reach the actual target pose');
p.simulateMovement=function(){Object.assign(this,to);this.dy=0;};
assert.equal(simulateEdge(p,from,to,{requireSupport:true,maxTicks:4}).success,true);
console.log('2 precise supported-arrival assertions passed');
