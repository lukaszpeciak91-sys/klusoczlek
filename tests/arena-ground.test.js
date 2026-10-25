import test from 'node:test';
import assert from 'node:assert/strict';
import {isApprovedGroundPng,groundTextureUrl} from '../src/arena-ground.js';
const header=(w,h,type=2)=>{const b=new Uint8Array(29);b.set([137,80,78,71,13,10,26,10]);const v=new DataView(b.buffer);v.setUint32(16,w);v.setUint32(20,h);b[24]=8;b[25]=type;return b;};
test('approved ground PNG dimensions, RGB/RGBA metadata and BASE_URL',()=>{assert.equal(isApprovedGroundPng(header(1024,1024)),true);assert.equal(isApprovedGroundPng(header(1024,1024,6)),true);assert.equal(isApprovedGroundPng(header(64,64)),false);assert.equal(isApprovedGroundPng(header(1024,1024,3)),false);assert.equal(isApprovedGroundPng(new Uint8Array(12)),false);assert.equal(groundTextureUrl('/klusoczlek/'),'/klusoczlek/assets/terrain/arena-ground.png');});
