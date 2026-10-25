import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {assetManifest} from '../src/asset-manifest.js';

const dirs=[...new Set(assetManifest.map(a=>a.path.split('/')[0]))].sort();
function ignored(path) {
 const r=spawnSync('git',['check-ignore','--no-index','-q',path],{encoding:'utf8'});
 assert.ok([0,1].includes(r.status),r.stderr);
 return r.status===0;
}
test('every manifest directory is tracked by a .gitkeep',()=>{
 assert.deepEqual(dirs,['dialogue','enemies','obstacles','pickups','player','portraits','terrain','weapons']);
 for(const dir of dirs){
  assert.ok(existsSync('public/assets/'+dir+'/.gitkeep'),dir);
  assert.equal(ignored('public/assets/'+dir+'/.gitkeep'),false,dir);
 }
});
test('approved asset PNG paths are not ignored; scratch and backups are',()=>{
 for(const a of assetManifest)assert.equal(ignored('public/assets/'+a.path),false,a.path);
 assert.equal(ignored('public/assets/player/player.png'),false);
 for(const name of ['public/assets/player/player.png.bak','public/assets/enemies/_tmp/test.png','public/assets/terrain/_work/asset.png','public/assets/player/Thumbs.db','public/assets/obstacles/_tmp/rock.png','public/assets/obstacles/rock.png.bak']){
  assert.equal(ignored(name),true,name);
 }
});
