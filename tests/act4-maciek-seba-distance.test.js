import test from 'node:test';
import assert from 'node:assert/strict';
import {MACIEK_SEBA_RADIUS,maciekSebaNearby} from '../src/school-staging.js';
import {SCHOOL_PLACES} from '../src/school-contract.js';
import {DIALOGUES} from '../src/dialogue-data.js';

test('Maciek/Seba approach is exactly 280 units from unchanged Maciek location',()=>{
 assert.equal(MACIEK_SEBA_RADIUS,280);
 assert.deepEqual(SCHOOL_PLACES.maciek,{x:695,y:620});
 assert.deepEqual(SCHOOL_PLACES.seba,{x:770,y:610});
 assert.equal(maciekSebaNearby({x:415,y:620}),true,'280 is inclusive');
 assert.equal(maciekSebaNearby({x:445,y:620}),true,'250 approaches safely');
 assert.equal(maciekSebaNearby({x:414,y:620}),false,'281 is outside');
 assert.equal(maciekSebaNearby({x:695,y:901}),false,'281 vertical is outside');
 assert.equal(maciekSebaNearby(null),null);
});
test('optional Act IV dialogue content and three panel sequence remain unchanged',()=>{
 assert.deepEqual(DIALOGUES['act4-maciek-seba'],[
  ['bobrozombi','MACIEK','Najpierw Marcin...potem Bogdan...\no co chodzi temu Kłusoczłeku?'],
  ['bobrozombi','MACIEK','I w ogóle Sebuś, czemu Kłusoczłek,\nże kłusuje jak koń?'],
  ['bocianolak','SEBA','Ty to Maciek jednak głupi jesteś...\nA to nie jest czasem on? Do ataku!']
 ]);
});
