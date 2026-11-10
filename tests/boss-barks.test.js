import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {MARCIN_BARKS,KLUSOCZLEK_BARKS,createBossBarks} from '../src/boss-barks.js';

test('approved boss bark lines are exact and exclusive to their boss',()=>{
 assert.deepEqual(MARCIN_BARKS,['Aaaaaa','Odwal się od moich przyjaciół',
  'Gdzie uciekasz?!','Ataaaaak!','Twoje dni są policzone!']);
 assert.deepEqual(KLUSOCZLEK_BARKS,['Niech Cię kule biją!','Wracaj tutaj!',
  'Będziesz pięknie wyglądał gdy Cię wypcham','Takiego trofeum nie miałem ']);
});

test('boss bark is cosmetic, timed, paused and shut down without touching gameplay',()=>{
 const previousDocument=globalThis.document,previousWindow=globalThis.window;
 globalThis.document={hidden:false,hasFocus:()=>true};
 globalThis.window={innerWidth:780,innerHeight:437};
 try{
  const events=new EventEmitter();
  const root={visible:false,active:true,setScrollFactor(){return this;},setDepth(){return this;},
   setVisible(v){this.visible=v;return this;},add(){return this;},
   setPosition(x,y){this.x=x;this.y=y;return this;},destroy(){this.active=false;}};
  const graphics={clear(){return this;},fillStyle(){return this;},lineStyle(){return this;},
   fillRoundedRect(){return this;},strokeRoundedRect(){return this;},fillTriangle(){return this;}};
  const caption={width:80,height:30,setOrigin(){return this;},
   setText(s){this.text=s;this.width=Math.min(240,s.length*7);return this;},
   setPosition(){return this;}};
  const scene={add:{container:()=>root,graphics:()=>graphics,text:()=>caption},
   events,sys:{isActive:()=>true},scene:{isPaused:()=>false},
   cameras:{main:{zoom:1,getWorldPoint:()=>({x:0,y:0})}},
   scale:{width:780,height:437},
   hudLayout:{panelY:8,panelHeight:42,joystickX:75,joystickY:380,
    aimX:700,aimY:380,joystickRadius:36}};
  const actor={active:true,x:390,y:310};
  const barks=createBossBarks(scene,{phrases:MARCIN_BARKS,speaker:()=>actor,
   allowed:()=>true});
  for(let i=0;i<105;i++)barks.tick(50);
  assert.equal(barks.shown,1);
  assert.equal(barks.root.visible,true);
  assert.equal(caption.text,MARCIN_BARKS[0]);
  events.emit('pause');
  assert.equal(root.visible,false,'pause hides the bubble immediately');
  for(let i=0;i<60;i++)barks.tick(50);
  assert.equal(barks.shown,1,'no bark before next interval');
  events.emit('shutdown');
  assert.equal(root.active,false,'shutdown destroys the overlay');
 }finally{globalThis.document=previousDocument;globalThis.window=previousWindow;}
});
