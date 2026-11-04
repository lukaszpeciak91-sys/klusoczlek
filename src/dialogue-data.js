export const DIALOGUES=Object.freeze({
 'before-wave-1':[
  ['aloes','ALOES','O Jessuuuu… Ale mnie głowa boli… Gdzie ja jestem? Co ja tutaj robię?'],
  ['bobrozombi','BOBROZOMBI','Matko Boska! To z pewnością Kłusoczłek! Szybko, bracia, do ataku!'],
  ['aloes','ALOES','To chyba jakaś pomyłka…']
 ],
 'before-first-bocianolak':[
  ['bobrozombi','BOBROZOMBI','Auaaaa! Jako zombie miałem nie czuć bólu… Bleee… *zdechł*'],
  ['bocianolak','BOCIANOŁAK','Damianek… Czemu ty się nie ruszasz?'],
  ['bocianolak','BOCIANOŁAK','Co zrobiłeś Damianowi, ty bydlaku?! Wisiał mi sto złotych! Oddawaj!']
 ],
 'before-first-zubrokryptyda':[
  ['zubrokryptyda','ŻUBROKRYPTYDA','Nikt nie będzie bezprawnie mordował naszych przyjaciół!'],
  ['bobrozombi','BOBROZOMBI','Waldek, pokaż mu, gdzie raki zimują!']
 ],
 'after-final-enemy':[
  ['marcin','MARCIN','A więc dokonało się… Przepowiednia się spełniła… Wszystkich nas wykończy przeklęty Kłusoczłek!'],
  ['zubrokryptyda','ŻUBROKRYPTYDA','Nigdy nie zapomnę naszych wspólnych wakacji, Marcin…'],
  ['aloes','ALOES','*chlip* Żegnajcie… przyjaciele…']
 ],
 'act1-marcin-last':[
  ['marcin','MARCIN','A więc dokonało się… Przepowiednia się spełniła… Wszystkich nas wykończy przeklęty Kłusoczłek!']
 ],
 'act1-witness-last':[
  ['zubrokryptyda','ŻUBROKRYPTYDA','Nigdy nie zapomnę naszych wspólnych wakacji, Marcin…']
 ],
 'act1-aloes-last':[
  ['aloes','ALOES','*chlip* Żegnajcie… przyjaciele…']
 ],
 'act1-captain':[
  ['captain','CAPTAIN','Szybko Klusoczłeku zaraz zaroi się tu od tych abominacji!'],
  ['aloes','ALOES','Znowu to samo… Kim pan właściwie jest?'],
  ['captain','CAPTAIN','Kapitanem podniebnego parostatku. Dla przyjaciół Marian. Ale Ty możesz mówić mi Kapitanie!'],
  ['captain','CAPTAIN','Wskakuj na pokład, nie mamy całego dnia!'],
  ['aloes','ALOES','Parostatku? W powietrzu?!'],
  ['captain','CAPTAIN','A gdzie miałby latać? Pod ziemią?']
 ],
 'act2-opening':[
  ['aloes','ALOES','Kapitanie, gdzie my właściwie jesteśmy? Co to za magiczna kraina?'],
  ['captain','KAPITAN','Nie magiczna, a zaczarowana! I nie kraina, tylko cały świat! Zaczarowany Świat!'],
  ['aloes','ALOES','I czym są te wszystkie stwory? Skąd się wzięły?'],
  ['captain','KAPITAN','Co?! Nie wiem! Ja na pewno nie miałem z tym nic wspólnego!'],
  ['aloes','ALOES','Ale ja przecież tylko...'],
  ['captain','KAPITAN','Dobra, nieważne! Chcesz wrócić do domu czy nie?'],
  ['aloes','ALOES','No właśnie! Pomożesz mi wrócić do domu?'],
  ['captain','KAPITAN','Oczywiście, Kłusoczłeku! Musisz jedynie zebrać dla mnie trzy magiczne artefakty Potwornych Mocarzy!'],
  ['aloes','ALOES','Trzy artefakty?'],
  ['captain','KAPITAN','Jeden już masz! Perukę Marcina! Pozostały jeszcze róg myśliwski Bogdana i rower Błażeja!'],
  ['aloes','ALOES','Rower?'],
  ['captain','KAPITAN','Tak! Rower! Masz coś do rowerów?!'],
  ['aloes','ALOES','Nie, nie... A gdzie znajdę te artefakty?'],
  ['captain','KAPITAN','Bocianołak Bogdan mieszka w pobliskim wulkanie, a Żubrokryptyda Błażej uczy się w pobliskiej szkole zawodowej!'],
  ['aloes','ALOES','A kiedy już je zdobędę, naprawdę odwieziesz mnie do domu?'],
  ['captain','KAPITAN','Oczywiście! Masz moje kapitańskie słowo!'],
  ['captain','KAPITAN','O nie! Kłusoczłeku! Chwyć za broń!'],
  ['aloes','ALOES','Co się dzieje?!'],
  ['captain','KAPITAN','Zbliża się komando potwornych lotniarzy!'],
  ['aloes','ALOES','Że co?!'],
  ['captain','KAPITAN','NIE MA CZASU NA WYJAŚNIENIA! BROŃ PAROSTATKU!']
 ],
 'act2-finale':[
  ['captain','KAPITAN','Uff udało się nam...'],
  ['captain','KAPITAN','A teraz nie ma co mitrężyć! Kurs na Wulkan Bogdana!']
 ],
 'before-marcin':[
  ['bobrozombi','BOBROZOMBI','Taki jesteś?! Czekaj aż zawołam Marcina'],
  ['bobrozombi','BOBROZOMBI','Marcin! Maaaarciiin!']
 ],
 'after-first-bocianolak-hit':[
  ['bocianolak','BOCIANOŁAK','Tylko nie po nogach!']
 ]
});
export const BOCIANOLAK_HIT_DIALOGUE='after-first-bocianolak-hit';
// Queue only: HP/death/projectile/explosion bookkeeping must finish before UI.
export function queueBocianolakHitDialogue(session,enemy,before,after){
 if(session.firstBocianolakHit||enemy.type!=='bocianolak'||enemy.dead||!Number.isFinite(before)||!Number.isFinite(after)||before<=0||after<0||after>=before)return false;
 session.firstBocianolakHit=true;
 session.narrativeEvents.add(BOCIANOLAK_HIT_DIALOGUE);
 return true;
}
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
