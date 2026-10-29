export const DIALOGUES=Object.freeze({
 'before-wave-1':[
  ['aloes','ALOES','O Jessuuuu… Ale mnie głowa boli… Gdzie ja jestem? Co ja tutaj robię?'],
  ['bobrozombi','BOBROZOMBI','Matko Boska! To Kłusoczłek! Szybko, bracia, do ataku!'],
  ['aloes','ALOES','To chyba jakaś pomyłka…']
 ],
 'before-first-bocianolak':[
  ['bobrozombi','BOBROZOMBI','Auaaaa! Jako zombie miałem nie czuć bólu… Bleee…'],
  ['bocianolak','BOCIANOŁAK','Damianek… Czemu ty się nie ruszasz?'],
  ['bocianolak','BOCIANOŁAK','Co zrobiłeś Damianowi, ty bydlaku?! Wisiał mi sto złotych! Oddawaj!']
 ],
 'before-first-zubrokryptyda':[
  ['zubrokryptyda','ŻUBROKRYPTYDA','Nikt nie będzie bezprawnie mordował naszych przyjaciół!'],
  ['bobrozombi','BOBROZOMBI','Waldek, pokaż mu, gdzie raki zimują!']
 ],
 'after-final-enemy':[
  ['bobrozombi','BOBROZOMBI','A więc dokonało się… Cyganka mówiła prawdę… Wszystkich nas wykończy przeklęty Kłusoczłek!'],
  ['zubrokryptyda','ŻUBROKRYPTYDA','Nigdy nie zapomnę naszych wspólnych wakacji, Marcin…'],
  ['aloes','ALOES','Żegnajcie… przyjaciele…']
 ]
});
export function createDialogueState(){return {id:null,index:0};}
export function beginDialogue(state,id){
 if(state.id||!DIALOGUES[id])return false;
 state.id=id;state.index=0;return true;
}
export function advanceDialogue(state){
 if(!state.id)return null;
 if(++state.index<DIALOGUES[state.id].length)return 'next';
 const ended=state.id;state.id=null;state.index=0;return ended;
}
export function currentDialogue(state){return state.id?DIALOGUES[state.id][state.index]:null;}
