//sound system for LegacyShell

//so, quick TLDR on what needs to be done/not done or how stuff works
//FIXME: test the new attachment way.

//https://github.com/goldfire/howler.js
//https://howlerjs.com
import { TransformNode, Vector3 } from "babylonjs";
import { Howl, Howler } from "howler";


const APOLLO_LOG = true;
const APOLLO_GLOBAL_PANNER_ATTRB /*= {
  panningModel: 'HRTF',
  refDistance: 0.8,
  rolloffFactor: 2.5,
  distanceModel: 'exponential'
};
*/
={
  distanceModel: "exponential",
  rolloffFactor: 1,
  maxDistance: 100,
  refDistance: 1
}
/**
 * list of sounds that have been loaded in.
 * @type {Howl{}}
 */
const sounds = {};
const APOLLO_EMERGENCY_FALLBACK_SOUND = new Howl({
  src: "sound/fallBack.mp3",
  onload: function () { if (APOLLO_LOG) console.log("APOLLO: fallback loaded!"); }
}); //if this doesn't load, all hope is lost...

/**
 * loads a sound from a given source and saves it under the given name.
 * @param {String} src - the source of the media.
 * @param {String} name - the name of the sound.
 */
function loadSound(src, name, onLoadingComplete) {
  if(APOLLO_LOG) console.log(`APOLLO: loadSound() called for ${name} via ${src} `);
  let snd = new Howl({ src , onload: onLoadingComplete}); //create howl object
  if (sounds[name])
    console.warn(
      `APOLLO: loadSound() called for ${name}, but sound ${name} already exists. Sound will be overwritten!`,
    );
  sounds[name] = snd;
}

/**
 * safe way of getting Howl object from the sounds storage. Will return fallback if the sound does not exist.
 * @param {String} name - the name of the desired sound.
 * @returns {Howl} the sound, or the fallback sound.
 */
function getSound(name) {
  if (!sounds[name]) {
    console.error(
      `APOLLO: getSound() called for ${name}, but ${name} does not exist! Returning fallback...`,
    );
    return APOLLO_EMERGENCY_FALLBACK_SOUND;
  }
  return sounds[name];
}


window.APOLLO_MULTIPLIERS = [-1, -1, -1];

/**
 * 
 * @param {Vector3} vec - the vec that should be translated
 * @returns the translated "vector" (only x, y, z properties!)
 */
function translateVec(vec){
  return {x: APOLLO_MULTIPLIERS[0]*vec.x, 
          y: APOLLO_MULTIPLIERS[1]*vec.y, 
          z: APOLLO_MULTIPLIERS[2]*vec.z};
}

/**
 * a SoundInstance represents a currently playing sound.
 */
class SoundInstance {
  //is this class unneccesary? Kinda. Would it be less clean without it? ye, kinda.
  /**
   * @type {Howl}
   */
  howl;
  /**
   * @type {number}
   */
  id; //prob isnt even a String but WHO CARES!!!
  constructor(howl, id) {
    this.howl = howl;
    this.id = id;
  }
}


/** 
* update the position from where sounds are being heard. Bound to cam in shellshock.min.js.
* @param {Vector3} newPos - the position to set the listener position to. AUTOMATICALLY ADAPTED TO HOWLER'S COORDINATE SYSTEM!
* @param {Vector3} newRotFront - the new forward vector
* @param {Vector3} newRotUp - the new up vector
*/
function updateListener(newPos, newRotFront, newRotUp){
  const p2 = translateVec(newPos);
  Howler.pos(p2.x, p2.y, p2.z);
  Howler.orientation(newRotFront.x, newRotFront.y, newRotFront.z, newRotUp.x, newRotUp.y, newRotUp.z);
}

/**
 * plays a sound independent from an emitter, at a fixed pos.
 * @param {String} name - name of the sound whose play is desired.
 * @param {Vector3} pos - position of the sound's playback. AUTOMATICALLY ADAPTED TO HOWLER'S COORDINATE SYSTEM!
 */
function playSoundIndependent(name, pos, rate){
  const p2 = translateVec(pos);
  const sound = getSound(name);
  const id = sound.play();
  sound.volume(1, id);
  sound.pannerAttr(APOLLO_GLOBAL_PANNER_ATTRB, id);
  sound.pos(p2.x, p2.y, p2.z, id);
  if(rate) sound.rate(rate, id);

}

/**
 * plays a sound independent from an emitter, 2D.
 * @param {String} name - name of the sound whose play is desired.
 */
function playSoundIndependent2D(name){
  const sound = getSound(name);
  const id = sound.play();
  sound.volume(1, id);
}

/**
emitters can be imagined like a loudspeaker. They play sounds at their location with their set parameters.
*/
class Emitter {
  /**
   * all Emitters that have been created.
   * @type {Emitter[]}
   */
  static activeEmitters = [];

  /**
   * the parent of this Emitter. The sound will follow it.
   *@type {TransformNode}
   */
  parent;
  /**
   * @type {boolean}
   */
  is2D;
  /**
   * @type {number}
   */
  emitterVolume;
  /**
   * @type {SoundInstance[]}
   */
  //playingSounds;

  /**
   * creates a new Emitter and attaches it to a given TransformNode.
   * @param {TransformNode} parent - the parent of this Emitter. The sound will follow it. Note: BABYLON.Mesh inherites from BABYLON.TransformNode.
   */
  constructor(parent) {
    Emitter.activeEmitters.push(this);
    this.parent = parent;
    this.is2D = !parent;
    this.emitterVolume = 1;
    this.playingSounds = [];
    //sub to render update bab thing
    if (this.parent && !this.is2D && this.parent.onBeforeRenderObservable) { //man I dont even care if this.parent.onBeforeRenderObservable doesnt exist just fuck you. FUCK YOU. !!
      this.parent.onBeforeRenderObservable.add(this.update.bind(this));
    }
    if(APOLLO_LOG) console.log(`APOLLO: Emitter created, is2d: ${this.is2D}` );
  }

  /**
  * @deprecated
  */
  static updateAll() {
    this.activeEmitters.forEach((em) => {
      em.update();
    });
  }

  /**
   * plays a sound on this emitter.
   * @param {String} name - the name of the sound.
   */
  play(name, rate) {
    const sound = getSound(name);
    const id = sound.play();
    const instance = new SoundInstance(sound, id);
    this.playingSounds.push(instance);
    sound.on("end", this.#onSoundEnd.bind(this), id);
    this.#instanceSyncWithMaster(instance);
    if(rate) sound.rate(rate, instance.id);
    sound.volume(this.emitterVolume, id);
    //FIXME: make this feel more like the original LS values
    sound.pannerAttr(APOLLO_GLOBAL_PANNER_ATTRB, instance.id);
  }

  /**
   * syncs a given instance's position with that of this Emitter's master (parent).
   * @param {SoundInstance} inst - the instance to sync.
   */
  #instanceSyncWithMaster(inst) {

    if ( !inst ||!inst.howl) return;
    if(this.is2D){
      inst.howl.stereo(0, inst.id);
      inst.howl.pannerAttr({
        panningModel: 'HRTF',
        distanceModel: 'linear',
        refDistance: 1,
        maxDistance: 1, 
      }, inst.id);
      //FIXME: this is a hack!
    }
    if (!this.parent) return;
    /**@type {Vector3} */
    const nP = this.parent.getAbsolutePosition();
    const p2 = translateVec(nP);
    inst.howl.pos(p2.x, p2.y, p2.z, inst.id);
  }

  /**
   *internal func to handle sound end, removes the instance.
   *@param {String} id - called by the howl, id of the stopped sound.
   */
  #onSoundEnd(id) {
    this.#removeInstanceById(id);
  }

  /**
   * removes a sound instance from this emitter's tracked instances based on ID
   * @param {number} id - the id of the emitter to remove
   */
  #removeInstanceById(id){
    this.playingSounds.forEach((snd) => {
      if (snd.id === id) {
        this.playingSounds.splice(
          this.playingSounds.indexOf(snd),
          1,
        );
      }
    });
    if(APOLLO_LOG) console.log(`APOLLO: after removeInstanceById (called with param ${id}): new array: ${this.playingSounds} (${this.playingSounds.length})`);
  }

  /**
   * update the currently playing sound's positions.
   */
  update() {
    this.playingSounds.forEach((inst) => {
      if (!inst.howl.playing(inst.id)) {
        this.#removeInstanceById(inst.id);
        return;
      }
      this.#instanceSyncWithMaster(inst);
    });
  }
}
