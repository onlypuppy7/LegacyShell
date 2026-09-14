import assert from 'node:assert/strict';
import { simulateEdge } from './physicsSimulation.js';
const from={x:0.5,y:1,z:0.5},to={x:3.5,y:1,z:0.5};
let probes=0;
const player={...from,dx:0,dy:0,dz:0,climbing:false,jumping:false,climbingCell:{},modifiers:{},
    Collider:{playerCollidesWithMap(){probes++;return true;}},
    createSnapshot(){return {...from,climbing:false};},
    restoreSnapshot(s){Object.assign(this,s);},
    jump(){return false;},
    simulateMovement(){Object.assign(this,from);this.dy=0;},
};
assert.equal(simulateEdge(player,from,to,{requireSupport:true,maxTicks:4}).success,false);
assert.equal(probes,0,'no acceptance-only footing probes while outside arrival radius');
player.simulateMovement=function(){Object.assign(this,to);this.dy=0;};
assert.equal(simulateEdge(player,from,to,{requireSupport:true,maxTicks:4}).success,true);
assert.equal(probes,1,'actual arrival still verifies real footing');
console.log('4 arrival probe-cost assertions passed');
