'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {create}=require('../lib/editor-recovery');
test('serializes snapshots and drains outstanding writes before clearing',async()=>{
 let release;let enabled=true;const log=[];let doc={name:'First'};
 const controller=create({enabled:()=>enabled,capture:()=>doc,write:async value=>{log.push(value.name);await new Promise(resolve=>release=resolve);return {saved:true};},clear:async()=>{log.push('clear');},onError:error=>{throw error;}});
 const first=controller.snapshot();const second=controller.snapshot();enabled=false;
 const clearing=controller.reset();assert.deepEqual(log,['First']);release();await Promise.all([first,second,clearing]);assert.deepEqual(log,['First','clear']);
 enabled=true;doc={name:'Next'};const next=controller.snapshot();release();await next;assert.deepEqual(log,['First','clear','Next']);
 await controller.snapshot();assert.deepEqual(log,['First','clear','Next']);
});
