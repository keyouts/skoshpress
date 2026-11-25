'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.SkoshEditorRecovery=api;
})(typeof window!=='undefined'?window:null,()=>{
  function create({enabled,capture,write,clear,onError,delay=1400}){
    let timer=null,signature='',pending=null,generation=0,requested=false;
    function cancel(){clearTimeout(timer);timer=null;}
    async function snapshot(){
      if(!enabled())return;
      if(pending){requested=true;return pending;}
      const epoch=generation;
      pending=(async()=>{
        try{
          const doc=capture(),next=JSON.stringify(doc);
          if(next===signature)return;
          const result=await write(doc);
          if(result?.saved&&epoch===generation)signature=next;
        }catch(error){if(epoch===generation)onError(error);}
      })();
      try{await pending;}finally{pending=null;if(requested){requested=false;if(epoch===generation&&enabled())await snapshot();}}
    }
    function schedule(){if(!enabled())return;cancel();timer=setTimeout(()=>{timer=null;void snapshot();},delay);}
    async function drain(){cancel();generation++;requested=false;signature='';if(pending)await pending;}
    async function reset(){await drain();await clear();}
    return {snapshot,schedule,drain,reset};
  }
  return {create};
});
