/* Shared event clock. Wall times resolve to instants; ambiguous boundaries require a policy. */
(function(root,factory){var api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.GOEventClock=api;}(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';
  var formatters=new Map(),zoneValidity=new Map(),resolvedTimes=new Map(),detectedDeviceZone=null;
  function parts(ms,zone){var p={};var formatter=formatters.get(zone);if(!formatter){formatter=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});if(formatters.size>=32)formatters.delete(formatters.keys().next().value);formatters.set(zone,formatter);}formatter.formatToParts(new Date(ms)).forEach(function(x){if(x.type!=='literal')p[x.type]=x.value;});return p.year+'-'+p.month+'-'+p.day+'T'+p.hour+':'+p.minute+':'+p.second;}
  function valid(value,offset){var m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(Z|[+-]\d{2}:\d{2})?$/.exec(String(value||''));if(!m||!!m[7]!==!!offset||+m[4]>23||+m[5]>59||+(m[6]||0)>59)return false;var d=new Date(Date.UTC(+m[1],+m[2]-1,+m[3]));if(d.getUTCFullYear()!==+m[1]||d.getUTCMonth()!==+m[2]-1||d.getUTCDate()!==+m[3])return false;if(m[7]&&m[7]!=='Z'){var h=+m[7].slice(1,3),min=+m[7].slice(4,6);if(h>14||min>59||(h===14&&min!==0))return false;}return !offset||Number.isFinite(Date.parse(value));}
  function resolve(value,zone,policy){if(!validZone(zone))throw Error('Invalid IANA timeZone');var key=String(value)+'|'+String(zone)+'|'+String(policy);if(resolvedTimes.has(key))return resolvedTimes.get(key);if(!valid(value,false))throw Error('Invalid schedule datetime');var wall=value.length===16?value+':00':value,nominal=Date.parse(wall+'Z'),offsets=new Set();for(var h=-48;h<=48;h+=3){var instant=nominal+h*3600000;offsets.add(Date.parse(parts(instant,zone)+'Z')-instant);}var candidates=Array.from(offsets).map(function(o){return nominal-o;}).filter(function(ms){return parts(ms,zone)===wall;}).sort(function(a,b){return a-b;});if(!candidates.length)throw Error('Nonexistent local schedule boundary');if(candidates.length>1&&policy!=='earlier'&&policy!=='later')throw Error('Ambiguous local schedule boundary');var result=policy==='later'?candidates[candidates.length-1]:candidates[0];if(resolvedTimes.size>=512)resolvedTimes.delete(resolvedTimes.keys().next().value);resolvedTimes.set(key,result);return result;}
  function range(s,viewerZone){if(!s)throw Error('Schedule unavailable');var start,end;if(s.timeBasis==='instant'){if(!valid(s.start,true)||!valid(s.end,true))throw Error('Invalid schedule datetime');start=Date.parse(s.start);end=Date.parse(s.end);}else if(s.timeBasis==='local'||s.timeBasis==='player-local'){var zone=s.timeBasis==='player-local'?viewerZone:s.timeZone;if(!zone)throw Error('Local schedule requires IANA timeZone');try{new Intl.DateTimeFormat('en',{timeZone:zone});}catch(e){throw Error('Invalid IANA timeZone');}start=resolve(s.start,zone,s.disambiguation);end=resolve(s.end,zone,s.disambiguation);}else throw Error('Unknown schedule time basis');if(start>=end)throw Error('Schedule end must follow start');return {start:start,end:end};}
  function status(s,now,zone){try{var r=range(s,zone);return now<r.start?'upcoming':now<r.end?'active':'ended';}catch(e){return 'unknown';}}
  // Player-local announcements are civil times, validated before any viewer is known.
  function validateSchedule(schedule) {
    if(!schedule)throw Error('Schedule unavailable');
    if(schedule.timeBasis!=='player-local'){range(schedule);return schedule;}
    if(!valid(schedule.start,false)||!valid(schedule.end,false))throw Error('Invalid player-local schedule datetime');
    var start=Date.parse(schedule.start+'Z'),end=Date.parse(schedule.end+'Z');
    if(start>=end)throw Error('Schedule end must follow start');
    if(schedule.disambiguation!=null&&['earlier','later'].indexOf(schedule.disambiguation)<0)throw Error('Invalid schedule disambiguation');
    return schedule;
  }
  function validZone(zone){if(typeof zone!=='string'||!zone)return false;if(zoneValidity.has(zone))return zoneValidity.get(zone);var valid=true;try{new Intl.DateTimeFormat('en',{timeZone:zone});}catch(e){valid=false;}if(zoneValidity.size>=128)zoneValidity.delete(zoneValidity.keys().next().value);zoneValidity.set(zone,valid);return valid;}
  function deviceZone(){if(detectedDeviceZone)return detectedDeviceZone;try{var zone=Intl.DateTimeFormat().resolvedOptions().timeZone;detectedDeviceZone=validZone(zone)?zone:'UTC';}catch(e){detectedDeviceZone='UTC';}return detectedDeviceZone;}
  if(root.addEventListener)root.addEventListener('focus',function(){detectedDeviceZone=null;});
  function selectedZone(){try{return root.localStorage.getItem('gofn-timezone')||'';}catch(e){return '';}}
  function effectiveViewerTimeZone(override,device){return validZone(override)?override:validZone(device)?device:'UTC';}
  function viewerZone(){return effectiveViewerTimeZone(selectedZone(),deviceZone());}
  function setViewerZone(zone){if(zone&&!validZone(zone))throw Error('Choose a valid time zone');if(zone)root.localStorage.setItem('gofn-timezone',zone);else root.localStorage.removeItem('gofn-timezone');}
  function fields(date,zone){var d=new Date(parts(+date,zone||viewerZone())+'Z');return {year:d.getUTCFullYear(),month:d.getUTCMonth(),day:d.getUTCDate(),weekday:d.getUTCDay(),hour:d.getUTCHours(),minute:d.getUTCMinutes()};}
  function calendarDate(year,month,day,hour,minute,zone){
    zone=zone||viewerZone();var nominal=new Date(Date.UTC(year,month,day,hour||0,minute||0)),wall=nominal.toISOString().slice(0,19);
    try{return new Date(resolve(wall,zone,'earlier'));}catch(error){
      // Calendar boundaries use the first existing hour of a date with a midnight DST gap.
      // Event schedules still use strict range() and never receive this fallback.
      if((hour||0)!==0||(minute||0)!==0)throw error;
      for(var h=1;h<=24;h++){try{return new Date(resolve(new Date(+nominal+h*3600000).toISOString().slice(0,19),zone,'earlier'));}catch(e){}}
      throw error;
    }
  }
  function dayKey(date,zone){return parts(+date,zone||viewerZone()).slice(0,10);}
  function startDay(date,zone){var p=fields(date,zone);return calendarDate(p.year,p.month,p.day,0,0,zone);}
  function addDays(date,n,zone){var p=fields(date,zone);return calendarDate(p.year,p.month,p.day+n,p.hour,p.minute,zone);}
  function parseDate(value,zone){
    if(value instanceof Date||typeof value==='number')return new Date(+value);
    var raw=String(value||'');if(/(?:Z|[+-]\d{2}:\d{2})$/.test(raw))return valid(raw.replace(/\.\d+(?=Z|[+-]\d{2}:\d{2}$)/,''),true)?new Date(raw):new Date(NaN);
    if(/^\d{4}-\d{2}-\d{2}$/.test(raw)){if(!valid(raw+'T00:00',false))return new Date(NaN);var p=raw.split('-').map(Number);return calendarDate(p[0],p[1]-1,p[2],0,0,zone);}
    try{var fractional=/\.(\d+)$/.exec(raw);return new Date(resolve(raw.replace(/\.\d+$/,''),zone||viewerZone())+(fractional?Number('0.'+fractional[1])*1000:0));}catch(e){return new Date(NaN);}
  }
  return {parts:parts,valid:valid,resolve:resolve,range:range,status:status,validateSchedule:validateSchedule,validZone:validZone,deviceZone:deviceZone,selectedZone:selectedZone,effectiveViewerTimeZone:effectiveViewerTimeZone,viewerZone:viewerZone,setViewerZone:setViewerZone,fields:fields,calendarDate:calendarDate,dayKey:dayKey,startDay:startDay,addDays:addDays,parseDate:parseDate};
}));
