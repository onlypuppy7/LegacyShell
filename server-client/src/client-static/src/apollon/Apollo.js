//sound system for LegacyShell

//so, quick TLDR on what needs to be done/not done or how stuff works
//currently, the Emitter update function needs to be called in the render fun
//FIXME: find a way to make it dynamically attach to a parent mesh, like bab does

//https://github.com/goldfire/howler.js
//https://howlerjs.com
import { TransformNode, Vector3 } from "babylonjs";
import { Howl, Howler } from "howler";

/**
 * list of sounds that have been loaded in.
 * @type {Howl{}}
 */
const sounds = {};
const APOLLO_EMERGENCY_FALLBACK_SOUND = new Howl({
  src: "https://github.com/TheRealSeq/Media/raw/50fd01317c6740c76d610a7f544a3f9c353777e8/Apollo/fallBack.mp3",
}); //if this doesn't load, all hope is lost...

/**
 * loads a sound from a given source and saves it under the given name.
 * @param {String} src - the source of the media.
 * @param {String} name - the name of the sound.
 */
function loadSound(src, name) {
  let snd = new Howl({ src, volume: 0 }); //create howl object
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
   * @type {String}
   */
  id; //prob isnt even a String but WHO CARES!!!
  constructor(howl, id) {
    this.howl = howl;
    this.id = id;
  }
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
  playingSounds;

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
  }

  static updateAll() {
    this.activeEmitters.forEach((em) => {
      em.update();
    });
  }

  /**
   * plays a sound on this emitter.
   * @param {String} name - the name of the sound.
   */
  play(name) {
    const sound = getSound(name);
    const id = sound.play();
    const instance = new SoundInstance(sound, id);
    this.playingSounds.push(instance);
    sound.on("end", this.#onSoundEnd, id);
    sound.volume(1, id);
    //FIXME: this might cause problems...
    //TODO: finish
  }

  #onSoundEnd(id) {
    this.playingSounds.forEach((snd) => {
      if (snd.id === id) {
        this.playingSounds = this.playingSounds.splice(
          this.playingSounds.indexOf(snd),
          1,
        );
      }
    });
  }

  /**
   * update the currently playing sound's positions.
   */
  update() {
    /**@type {Vector3} */
    const pos = this.parent.getAbsolutePosition();
    this.playingSounds.forEach((inst) => {
      inst.howl.pos(pos.x, pos.y, pos.z, inst.id);
      //FIXME: this will likely break, bc Babs coord system does not seem to mach howler's. (z forward/backward wrong). Want to fix that once I get to actually hear it though
    });
  }
}
