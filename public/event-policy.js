/* Pure Today visibility policy for universal events. No event-family or region allowlist. */
(function(root,factory) {
  const api=factory(typeof module==='object'&&module.exports?require('./event-clock.js'):root.GOEventClock);
  if(typeof module==='object'&&module.exports) module.exports=api;
  else root.GOTodayVisibility=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(clock){
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
  function scheduleStatus(schedule,now,zone){return clock.status(schedule,now,zone);}
  function todayPlacement(event,nowInput,viewerZone){
    const now=nowInput instanceof Date?nowInput.getTime():new Date(nowInput).getTime();
    if(!Number.isFinite(now))throw new Error('Valid now required');
    if(!viewerZone)throw new Error('Viewer timezone required');
    const status=event&&event.lifecycle==='postponed'?'unknown':scheduleStatus(event&&event.schedule,now,viewerZone);
    // Region is a display attribute, NEVER an eligibility filter.
    // Keep announced future in-person events discoverable on Today.
    const inPerson=!!(event&&(event.inPerson===true||event.attendance==='in-person'||event.scope==='in-person'));
    const localDay=localParts(new Date(now),viewerZone).slice(0,10);
    const announced=inPerson&&status==='unknown'&&(event.lifecycle==='announced'||event.lifecycle==='postponed');
    const visible=event.lifecycle!=='cancelled'&&event.lifecycle!=='ended'&&(status==='active'||(inPerson&&status==='upcoming')||announced);
    return {visible:visible,status:status,section:status==='active'?'happening-now':inPerson&&status==='upcoming'?'upcoming-in-person':announced?'announced-in-person':null,viewerDay:localDay};
  }
  return {scheduleStatus:scheduleStatus,todayPlacement:todayPlacement};
}));
