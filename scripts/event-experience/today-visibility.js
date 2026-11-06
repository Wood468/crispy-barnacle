/* Pure Today visibility policy for universal events. No event-family or region allowlist. */
(function(root,factory) {
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  else root.GOTodayVisibility=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function localParts(instant,zone){
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(instant);
    const out={};parts.forEach(p=>{if(p.type!=='literal')out[p.type]=p.value;});
    return out.year+'-'+out.month+'-'+out.day+'T'+out.hour+':'+out.minute+':'+out.second;
  }
  function asMillis(value){
    if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})$/.test(value))return NaN;
    return Date.parse(value);
  }
  function scheduleStatus(schedule,now){
    if(!schedule||!schedule.start||!schedule.end)return 'unknown';
    if(schedule.timeBasis==='instant'){
      const start=asMillis(schedule.start),end=asMillis(schedule.end);
      if(!Number.isFinite(start)||!Number.isFinite(end)||start>=end)return 'unknown';
      return now<start?'upcoming':now<end?'active':'ended';
    }
    if(schedule.timeBasis==='local'){
      if(!schedule.timeZone)return 'unknown';
      try {
        const current=localParts(new Date(now),schedule.timeZone);
        const start=schedule.start.length===16?schedule.start+':00':schedule.start;
        const end=schedule.end.length===16?schedule.end+':00':schedule.end;
        if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(start)||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(end)||start>=end)return 'unknown';
        return current<start?'upcoming':current<end?'active':'ended';
      }catch(_){return 'unknown';}
    }
    return 'unknown';
  }
  function todayPlacement(event,nowInput,viewerZone){
    const now=nowInput instanceof Date?nowInput.getTime():new Date(nowInput).getTime();
    if(!Number.isFinite(now))throw new Error('Valid now required');
    if(!viewerZone)throw new Error('Viewer timezone required');
    const status=scheduleStatus(event&&event.schedule,now);
    // Region is a display attribute, NEVER an eligibility filter.
    // Keep announced future in-person events discoverable on Today.
    const inPerson=!!(event&&(event.inPerson===true||event.attendance==='in-person'||event.scope==='in-person'));
    const localDay=localParts(new Date(now),viewerZone).slice(0,10);
    const visible=status==='active'||(inPerson&&status==='upcoming');
    return {visible:visible,status:status,section:status==='active'?'happening-now':inPerson&&status==='upcoming'?'upcoming-in-person':null,viewerDay:localDay};
  }
  return {scheduleStatus:scheduleStatus,todayPlacement:todayPlacement};
}));
