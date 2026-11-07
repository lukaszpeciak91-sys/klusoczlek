// Shared monster speech presentation and deterministic scheduling for Act III.
// Keep the familiar retro monospace / cream lettering and dark outline.
export const MONSTER_BARK_STYLE=Object.freeze({fontFamily:'monospace',fontSize:'14px',fontStyle:'bold',color:'#fff4cf',stroke:'#241018',strokeThickness:4,align:'center'});
export const BARK_DURATION_MS=2200;
export const BARK_COOLDOWN_MS=4500;
export const WATER_BARKS=Object.freeze(['Tylko nie wodą!','Ty łajzo!']);
export const BOGDAN_BARKS=Object.freeze({
 pursuit:Object.freeze(['NIE POKONASZ BOGDANA!','ZARAZ CIE DOPADNE','ZROBIE CI Z DUPY KROPKE NAD I']),
 damage:Object.freeze(['Aaaaaaaaa!']),
 charge:Object.freeze(['Lewatywaaaaa!'])
});
export function createBarkState(){return {lastAt:-Infinity,until:-Infinity,count:0,priority:0};}
export function chooseBark(state,lines,now,{cooldown=BARK_COOLDOWN_MS,duration=BARK_DURATION_MS,priority=1}={}){
 if(!Array.isArray(lines)||!lines.length||!Number.isFinite(now))return null;
 if(now<state.lastAt+cooldown||now<state.until)return null;
 const line=lines[state.count%lines.length];
 state.count++;state.lastAt=now;state.until=now+duration;state.priority=priority;
 return line;
}
export function clearBark(state,text){
 state.until=-Infinity;state.priority=0;
 if(text?.active!==false)text?.setVisible?.(false);
}
export function barkVisible(state,now,allowed=true){return Boolean(allowed&&now<state.until);}
export function makeMonsterBark(scene,x,y,{fontSize=MONSTER_BARK_STYLE.fontSize}={}){
 return scene.add.text(x,y,'',{...MONSTER_BARK_STYLE,fontSize}).setOrigin(.5).setDepth(22).setVisible(false);
}
export function showMonsterBark(text,state,lines,now,options){
 const line=chooseBark(state,lines,now,options);
 if(line&&text?.active!==false)text.setText(line).setVisible(true);
 return line;
}
export function syncMonsterBark(text,state,now,x,y,allowed=true){
 if(!text||text.active===false)return;
 text.setPosition(x,y).setVisible(barkVisible(state,now,allowed));
}
