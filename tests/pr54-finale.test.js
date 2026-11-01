import test from 'node:test';
import assert from 'node:assert/strict';
import {createEpisode,claimBossIntroduction,allyShortfall,BOSS_SCENE_HARD_CAP} from '../src/episode.js';
for(const [ms,alive,pending,expected] of [[239999,0,false,false],[252000,0,false,true],[252000,1,false,false],[252000,0,true,false],[260000,12,false,true],[260000,1,true,true]]){
 test('PR54 boss conditional '+ms+' alive '+alive+' pending '+pending,()=>{
  const e=createEpisode();e.wave=5;
  assert.equal(claimBossIntroduction(e,ms,{ordinaryAlive:alive,narrativePending:pending}),expected);
  assert.equal(claimBossIntroduction(e,260000,{ordinaryAlive:0}),!expected);
 });
}
test('PR54 ally roster counts survivors without negative queues',()=>{
 for(const [survivors,missing] of [[0,12],[3,9],[7,5],[10,2],[12,0],[14,0]])
  assert.equal(allyShortfall(survivors),missing);
 assert.ok(BOSS_SCENE_HARD_CAP>=12);
});
