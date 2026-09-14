// Search scheduling contract, not a replacement for real-map physics tests.
import assert from 'node:assert/strict';
import { findPath } from './pathfinding.js';
import { simulateEdge } from './physicsSimulation.js';
const map={width:4,height:3,depth:3,data:[]};
for(let x=0;x<map.width;x++) {
    map.data[x]=[];
    for(let y=0;y<map.height;y++) map.data[x][y]=Array.from({length:map.depth},()=>y===0
        ? {idx:1,mesh:{colliderType:'full'},rx:0,ry:0,rz:0} : {});
}
const start={x:0.5,y:1,z:0.5},goal={x:2.5,y:1,z:0.5};
const p={...start,dx:0,dy:0,dz:0,climbing:false,jumping:false,climbingCell:{},modifiers:{},
    Collider:{playerCollidesWithMap(player,pos=player){return pos.y<1;}},
    createSnapshot(){return {x:this.x,y:this.y,z:this.z,dx:this.dx,dy:this.dy,dz:this.dz,climbing:this.climbing};},
    restoreSnapshot(s){Object.assign(this,s);},
    jump(){return false;},
    simulateMovement({ddx,ddz}){
        const nx=this.x+ddx*0.08,nz=this.z+ddz*0.08;
        // Static candidates deliberately cannot see this rejected crossing.
        if(Math.min(this.x,nx)<1 && Math.max(this.x,nx)>=1 && Math.min(this.z,nz)<1) return;
        this.x=nx;this.z=nz;this.dy=0;
    },
};
const room={map};
const path=findPath(room,p,goal);
assert.ok(path?.length,'a failed cheap candidate does not discard the detour');
assert.ok(path.some(w=>w.z>=1.5),'route goes around the rejected crossing');
assert.equal(path.at(-1).x,goal.x);
assert.equal(path.at(-1).z,goal.z);
assert.deepEqual([p.x,p.y,p.z],[start.x,start.y,start.z],'verification restores player pose');
let from=start;
for(const to of path){
    assert.equal(simulateEdge(p,from,to,{jump:to.type==='jump',requireSupport:true}).success,true,'every returned edge passes verification');
    from=to;
}
console.log('Deferred verification detour, endpoint, state and edge contracts passed');
