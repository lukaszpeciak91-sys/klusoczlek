// Single shared music and procedural SFX controller. No sound asset generation.
export const TRACKS=Object.freeze({Menu:'menu',Arena:'act1',Airship:'act2',Volcano:'act3',School:'act4',Catacombs:'act5',Credits:'credits'});
const KEY='klusoczlek-audio-v1';
const clamp=v=>Math.max(0,Math.min(1,Number(v)||0));
export function loadAudioSettings(storage=globalThis.localStorage){
  try{const value=JSON.parse(storage?.getItem(KEY)||'{}');return {music:clamp(value.music??.45),sfx:clamp(value.sfx??.65),muted:value.muted===true};}
  catch{return {music:.45,sfx:.65,muted:false};}
}
export class RetroAudio {
  constructor(){
    this.settings=loadAudioSettings();this.track=null;this.music=null;this.context=null;this.master=null;
    this.unlocked=false;this.voices=0;this.maxVoices=9;this.last=new Map();this.streamVoice=null;this.noise=null;
    this.fade=null;this.heldByVisibility=false;this.token=0;
  }
  init(game){
    this.game=game;
    if(typeof document==='undefined')return;
    const unlock=()=>{void this.unlock();};
    document.addEventListener('pointerdown',unlock,{passive:true});
    document.addEventListener('keydown',unlock);
    document.addEventListener('visibilitychange',()=>{
      if(document.hidden){this.heldByVisibility=true;this.music?.pause();this.stopStream();this.context?.suspend?.().catch(()=>{});}
      else{this.heldByVisibility=false;if(this.unlocked){void this.unlock();this.playCurrent();}}
    });
    window.addEventListener('blur',()=>{this.music?.pause();this.stopStream();});
    window.addEventListener('focus',()=>{if(!document.hidden&&this.unlocked)this.playCurrent();});
  }
  async unlock(){
    if(typeof window==='undefined'||typeof document==='undefined')return false;
    try{
      if(!this.context){
        const C=window.AudioContext||window.webkitAudioContext;
        this.context=this.game?.sound?.context|| (C?new C():null);
        if(this.context){this.master=this.context.createGain();this.master.gain.value=.28;this.master.connect(this.context.destination);}
      }
      if(this.context?.state==='suspended')await this.context.resume();
      this.unlocked=true;this.playCurrent();return true;
    }catch{return false;}
  }
  save(){
    try{globalThis.localStorage?.setItem(KEY,JSON.stringify(this.settings));}catch{}
  }
  volume(kind,value){if(kind!=='music'&&kind!=='sfx')return;this.settings[kind]=clamp(value);this.save();this.syncMusic();}
  mute(value=!this.settings.muted){this.settings.muted=Boolean(value);this.save();this.syncMusic();if(value)this.stopStream();}
  syncMusic(){if(this.music)this.music.volume=this.settings.muted?0:this.settings.music;}
  enter(scene){
    const id=TRACKS[scene];if(!id||id===this.track)return;
    this.track=id;this.stopStream();this.changeTrack(id);
  }
  credits(){this.enter('Credits');}
  changeTrack(id){
    if(typeof Audio==='undefined')return;
    const token=++this.token;
    if(this.fade){clearInterval(this.fade);this.fade=null;}
    const old=this.music;
    if(old){
      if(!old.paused&&old.volume>0){
        let ticks=0,start=old.volume;
        this.fade=setInterval(()=>{if(++ticks>=5||token!==this.token){clearInterval(this.fade);this.fade=null;old.pause();old.currentTime=0;return;}old.volume=start*(1-ticks/5);},60);
      }else{old.pause();old.currentTime=0;}
    }
    try{
      const audio=new Audio(import.meta.env?.BASE_URL?import.meta.env.BASE_URL+'assets/music/'+id+'.ogg':'/assets/music/'+id+'.ogg');
      audio.loop=id!=='credits';audio.preload='auto';audio.volume=this.settings.muted?0:this.settings.music;
      audio.addEventListener('error',()=>{ /* sound is optional */ });
      this.music=audio;this.playCurrent();
    }catch{this.music=null;}
  }
  playCurrent(){
    if(!this.unlocked||!this.music||typeof document!=='undefined'&&document.hidden)return;
    this.syncMusic();
    if(this.music.paused)try{this.music.play()?.catch(()=>{});}catch{}
  }
  pauseForMenu(){this.stopStream();}
  stopStream(){
    if(!this.streamVoice)return;
    try{const v=this.streamVoice;v.gain.gain.setTargetAtTime(0,this.context.currentTime,.025);v.source.stop(this.context.currentTime+.12);}catch{}
    this.streamVoice=null;
  }
  noiseBuffer(){
    if(this.noise||!this.context)return this.noise;
    const buffer=this.context.createBuffer(1,4096,this.context.sampleRate),data=buffer.getChannelData(0);
    for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
    this.noise=buffer;return buffer;
  }
  tone(freq,end,duration,type='square',level=.3){
    if(!this.unlocked||this.settings.muted||!this.settings.sfx||!this.context||this.voices>=this.maxVoices)return;
    try{
      const c=this.context,at=c.currentTime,o=c.createOscillator(),g=c.createGain();
      this.voices++;o.type=type;o.frequency.setValueAtTime(freq,at);
      o.frequency.exponentialRampToValueAtTime(Math.max(25,end),at+duration);
      g.gain.setValueAtTime(.0001,at);g.gain.exponentialRampToValueAtTime(Math.max(.001,level*this.settings.sfx),at+.007);
      g.gain.exponentialRampToValueAtTime(.0001,at+duration);
      o.connect(g);g.connect(this.master);o.onended=()=>{this.voices=Math.max(0,this.voices-1);o.disconnect();g.disconnect();};
      o.start(at);o.stop(at+duration+.01);
    }catch{}
  }
  noiseHit(duration,frequency,level=.2){
    if(!this.unlocked||this.settings.muted||!this.settings.sfx||!this.context||this.voices>=this.maxVoices)return;
    try{
      const c=this.context,at=c.currentTime,source=c.createBufferSource(),filter=c.createBiquadFilter(),gain=c.createGain();
      this.voices++;source.buffer=this.noiseBuffer();source.loop=true;filter.type='lowpass';filter.frequency.value=frequency;
      gain.gain.setValueAtTime(Math.max(.001,level*this.settings.sfx),at);
      gain.gain.exponentialRampToValueAtTime(.0001,at+duration);
      source.connect(filter);filter.connect(gain);gain.connect(this.master);
      source.onended=()=>{this.voices=Math.max(0,this.voices-1);source.disconnect();filter.disconnect();gain.disconnect();};
      source.start(at);source.stop(at+duration);
    }catch{}
  }
  limited(name,ms){const now=typeof performance!=='undefined'?performance.now():Date.now();if(now-(this.last.get(name)??-Infinity)<ms)return false;this.last.set(name,now);return true;}
  shot(weapon){
    if(weapon==='rifle'){if(!this.limited('rifle',55))return;this.tone(290,125,.08,'square',.32);this.noiseHit(.055,2100,.15);}
    else if(weapon==='blunderbuss'){if(!this.limited('blast',140))return;this.tone(150,48,.19,'sawtooth',.42);this.noiseHit(.16,720,.32);}
  }
  stream(weapon,on){
    if(!on||!['flamethrower','water-flamethrower'].includes(weapon)){this.stopStream();return;}
    if(this.streamVoice?.weapon===weapon)return;
    this.stopStream();
    if(!this.unlocked||this.settings.muted||!this.settings.sfx||!this.context)return;
    try{
      const c=this.context,source=c.createBufferSource(),filter=c.createBiquadFilter(),gain=c.createGain();
      source.buffer=this.noiseBuffer();source.loop=true;filter.type=weapon==='flamethrower'?'lowpass':'bandpass';
      filter.frequency.value=weapon==='flamethrower'?690:420;filter.Q.value=.7;
      gain.gain.value=.095*this.settings.sfx;source.connect(filter);filter.connect(gain);gain.connect(this.master);
      source.start();this.streamVoice={source,gain,filter,weapon};
    }catch{}
  }
  hurt(){if(this.limited('hurt',95))this.tone(320,95,.18,'sawtooth',.33);}
  death(){this.stopStream();if(this.limited('death',850)){this.tone(460,60,.72,'sawtooth',.4);}}
  enemyDeath(){if(this.limited('enemyDeath',85)){this.tone(220,65,.13,'square',.19);this.noiseHit(.09,1150,.13);}}
}
export const retroAudio=new RetroAudio();
