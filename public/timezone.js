/* Melbourne display by default, with an explicit device-time option. This preference never rewrites event schedules or account data. */
(function () {
  'use strict';
  var clock=window.GOEventClock,select=document.getElementById('timezone-choice'),form=document.getElementById('timezone-form'),status=document.getElementById('timezone-status');
  if(!clock||!select||!form)return;
  var zones=[];
  try{zones=Intl.supportedValuesOf('timeZone');}catch(error){zones=['UTC','America/Los_Angeles','America/New_York','America/Sao_Paulo','Europe/London','Europe/Paris','Africa/Johannesburg','Asia/Kolkata','Asia/Tokyo','Australia/Melbourne','Pacific/Auckland'];}
  [clock.deviceZone(),clock.selectedZone(),'UTC'].filter(clock.validZone).forEach(function(zone){if(zones.indexOf(zone)<0)zones.push(zone);});
  zones.sort();
  function option(value,label){var opt=document.createElement('option');opt.value=value;opt.textContent=label;select.appendChild(opt);}
  option('','Device time ('+clock.deviceZone().replace(/_/g,' ')+')');
  zones.forEach(function(zone){option(zone,zone.replace(/_/g,' '));});
  select.value=clock.validZone(clock.selectedZone())?clock.selectedZone():'';
  status.textContent='Currently showing times in '+clock.viewerZone().replace(/_/g,' ')+'. Event-local times are preserved.';
  form.addEventListener('submit',function(event){
    event.preventDefault();
    try{clock.setViewerZone(select.value);}catch(error){status.textContent='The time zone could not be saved on this device. Please try again.';return;}
    location.reload();
  });
}());
