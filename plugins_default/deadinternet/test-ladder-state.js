import assert from 'node:assert/strict';
import { simulateEdgeCached } from './physicsSimulation.js';
const from = {x:1.5,y:2,z:1.5}, to = {x:1.7,y:3,z:1.5};
const observed = [];
const player = { ...from, dx:0,dy:0,dz:0,jumping:false,climbing:false,
    climbingCell:{x:8,z:8,ry:0}, modifiers:{},
    Collider:{playerCollidesWithMap:()=>true},
    createSnapshot(){return {...from,climbing:this.climbing};},
    restoreSnapshot(s){Object.assign(this,s);},
    jump(){return false;},
    simulateMovement(input){
        observed.push({climbing:this.climbing,cell:{...this.climbingCell},input});
        Object.assign(this,to);this.dy=0;this.climbing=false;
    },
};
const room = {}, rung = {x:1,z:1,ry:Math.PI/2};
const check = climbingStart => simulateEdgeCached(room,player,'1,2,1','1,3,1',from,to,
    {climbingStart,requireSupport:true,verticalTolerance:0.05,maxTicks:4});
assert.equal(check(rung).success,true);
assert.deepEqual(observed[0].cell,rung);
assert.equal(observed[0].climbing,true);
assert.equal(observed[0].input.ddy,1,'attached movement uses climb input');
assert.equal(player.climbing,false,'restore original attachment state');
assert.deepEqual(player.climbingCell,{x:8,z:8,ry:0},'restore original rung');
const count=observed.length;
check({...rung});
assert.equal(observed.length,count,'identical starting attachment reuses cache');
check({...rung,ry:Math.PI});
assert.ok(observed.length>count,'different starting rung orientation invalidates cache');
console.log('8 ladder state/cache assertions passed');
