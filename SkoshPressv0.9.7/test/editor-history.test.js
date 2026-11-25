'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {create}=require('../lib/editor-history');
const fixture=()=>({doc:{name:'Book',pages:[{frames:[]}]},index:0,selected:null,dirty:false,undo:[],redo:[]});
test('failed transaction restores oversized documents without depending on history',()=>{
 const history=create({maxBytes:100});const state=fixture();state.doc.name='x'.repeat(200);state.selected='frame';
 const original=structuredClone(state);
 assert.throws(()=>history.transaction(state,()=>{state.doc.name='Changed';state.index=9;state.selected=null;throw Error('Failed');},()=>{}),/Failed/);
 assert.deepEqual(state,original);
});
test('undo redo and no-op preserve the expected timeline',()=>{
 const history=create();const state=fixture();
 history.transaction(state,()=>{state.doc.name='Edited';},()=>{});
 assert.equal(history.travel(state,'undo'),true);assert.equal(state.doc.name,'Book');
 history.transaction(state,()=>{},()=>{});assert.equal(state.redo.length,1);
 assert.throws(()=>history.transaction(state,()=>{state.doc.name='Other';},()=>{throw Error('Render failed');}),/Render failed/);
 assert.equal(state.doc.name,'Book');assert.equal(state.redo.length,1);
 assert.equal(history.travel(state,'redo'),true);assert.equal(state.doc.name,'Edited');
 history.travel(state,'undo');history.transaction(state,()=>{state.doc.name='Branch';},()=>{});assert.equal(state.redo.length,0);
});
test('bounds history by entries and UTF-8 bytes',()=>{
 const history=create({maxEntries:2,maxBytes:12});const stack=[];
 history.push(stack,'abc');history.push(stack,'def');history.push(stack,'ghi');assert.equal(stack.length,2);
 history.push(stack,'ééééé');assert.equal(stack.length,1);
 history.push(stack,'é'.repeat(7));assert.equal(stack.length,0);
});
