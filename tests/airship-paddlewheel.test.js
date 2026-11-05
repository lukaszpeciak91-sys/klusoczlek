import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DECK_POLYGON} from '../src/airship-contract.js';
import {PADDLEWHEEL_MOUNT,PADDLEWHEEL_DEGREES_PER_SECOND,PADDLEWHEEL_RADIANS_PER_SECOND,
  paddlewheelDisplaySize,advancePaddlewheelAngle} from '../src/airship-paddlewheel.js';

test('single approved PNG asset exists, keeps original filename and has valid dimensions',()=>{
  const data=readFileSync(new URL('../public/assets/obstacles/airship-paddlewheel.png',import.meta.url));
  assert.deepEqual(Array.from(data.subarray(0,8)),[137,80,78,71,13,10,26,10]);
  const width=data.readUInt32BE(16),height=data.readUInt32BE(20);
  assert.ok(width>0&&height>0);
  const output=paddlewheelDisplaySize(width,height);
  assert.ok(Math.max(output.width,output.height)<=PADDLEWHEEL_MOUNT.diameter+1e-9);
  assert.ok(Math.abs(output.width/output.height-width/height)<1e-9,'never stretch the approved wheel');
  console.log('INFO approved stern paddlewheel PNG',width+'x'+height,'display',output.width+'x'+output.height);
});
test('stern mounting center remains partly outside right hull, with origin-centered clearance',()=>{
  const sternX=Math.max(...DECK_POLYGON.map(p=>p.x));
  assert.equal(PADDLEWHEEL_MOUNT.x,863);
  assert.equal(PADDLEWHEEL_MOUNT.y,282);
  assert.ok(PADDLEWHEEL_MOUNT.x+PADDLEWHEEL_MOUNT.diameter/2>sternX);
  assert.ok(PADDLEWHEEL_MOUNT.x-PADDLEWHEEL_MOUNT.diameter/2>780);
  assert.equal(PADDLEWHEEL_MOUNT.depth,3);
});
test('wheel rotates clockwise at exactly 25 degrees/s at independent frame rates',()=>{
  assert.equal(PADDLEWHEEL_DEGREES_PER_SECOND,25);
  for(const dt of [1000/60,1000/30,1000/20,100]){
    const frames=Math.round(1000/dt),actualDt=1000/frames;
    let angle=0;
    for(let i=0;i<frames;i++)angle=advancePaddlewheelAngle(angle,actualDt);
    assert.ok(Math.abs(angle-PADDLEWHEEL_RADIANS_PER_SECOND)<1e-9,{dt,angle});
  }
});
test('zero, invalid and paused durations do not rotate; resume spike is bounded',()=>{
  const start=.7;
  for(const dt of [0,-20,NaN,Infinity])assert.equal(advancePaddlewheelAngle(start,dt),start);
  assert.ok(Math.abs(advancePaddlewheelAngle(start,5000)-start-PADDLEWHEEL_RADIANS_PER_SECOND*.1)<1e-9);
  let angle=start;
  for(let n=0;n<180;n++)angle=advancePaddlewheelAngle(angle,16.666666666666668);
  assert.ok(angle>start&&angle<Math.PI*2);
});
