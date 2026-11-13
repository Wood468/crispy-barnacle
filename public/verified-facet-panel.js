/* Optional, source-checked Event Details presentation for independently
 * promoted verified facets. Never fetches, attaches to events, or modifies the
 * existing UI by itself. The Event Details owner can wire it after canonical
 * source-link and release verification are complete.
 */
(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.GOVerifiedFacetPanel=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  var HOSTS={
    official:['pokemongo.com','www.pokemongo.com'],
    leekduck:['leekduck.com','www.leekduck.com'],
    hub:['pokemongohub.net','www.pokemongohub.net'],
    serebii:['serebii.net','www.serebii.net']
  };
  var ID=/^[a-z0-9][a-z0-9:._-]{0,159}$/i;
  var ACCESS={free:'Free',ticket:'Ticket holders',addon:'Paid add-on',unknown:'Access not confirmed'};
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  });}
  function source(ref){
    if(!ref||typeof ref!=='object'||!Object.prototype.hasOwnProperty.call(HOSTS,ref.sourceId))
      return null;
    try{
      var u=new URL(ref.url);
      if(u.protocol!=='https:'||u.username||u.password||u.port||u.search||u.hash||
        HOSTS[ref.sourceId].indexOf(u.hostname.toLowerCase())<0)return null;
      return {url:u.toString(),label:ref.sourceId==='official'?'Pokémon GO official':
        ref.sourceId==='leekduck'?'Leek Duck':ref.sourceId==='hub'?'Pokémon GO Hub':'Serebii'};
    }catch(error){return null;}
  }
  function citations(row){
    if(!Array.isArray(row.sourceRefs)||!row.sourceRefs.length||row.sourceRefs.length>12)
      return null;
    var seen={},valid=[];
    for(var i=0;i<row.sourceRefs.length;i++){
      var ref=source(row.sourceRefs[i]);
      if(!ref)return null;
      if(!seen[ref.url]){
        valid.push('<a href="'+esc(ref.url)+'" target="_blank" rel="noopener noreferrer">'+esc(ref.label)+'</a>');
        seen[ref.url]=1;
      }
    }
    return '<small class="ue-verified-sources">Sources: '+valid.join(' · ')+'</small>';
  }
  function access(row){
    if(!Object.prototype.hasOwnProperty.call(ACCESS,row.access))return '';
    return '<span class="ue-verified-access" data-access="'+esc(row.access)+'">'+
      esc(ACCESS[row.access])+'</span>';
  }
  function timing(row){
    var fields=[row.dayScope,row.windowText,row.sessionLabel].filter(function(v){
      return typeof v==='string'&&v.trim();
    });
    return fields.length?'<small class="ue-verified-window">'+esc(fields.join(' · '))+'</small>':'';
  }
  function rowHtml(row,kind){
    if(!row||typeof row!=='object'||row.status!=='verified'||!ID.test(row.id||''))return '';
    var a=access(row),sources=citations(row);
    if(!a||!sources)return '';
    var title='',extra='';
    if(kind==='bonuses'){
      if(typeof row.text!=='string'||!row.text.trim())return '';
      title=row.text;
    }else if(kind==='featuredMoves'){
      if(typeof row.pokemonLabel!=='string'||!row.pokemonLabel.trim()||
         typeof row.move!=='string'||!row.move.trim())return '';
      title=row.pokemonLabel+' — '+row.move;
      var methods=Array.isArray(row.acquisitionMethods)?
        row.acquisitionMethods.filter(function(v){return ['catch','evolve','raid'].indexOf(v)>=0;}):[];
      if(methods.length)extra+='<small>Method: '+esc(methods.join(', '))+'</small>';
    }else if(kind==='research'){
      if(typeof row.title!=='string'||!row.title.trim())return '';
      title=row.title;
      var stages=Array.isArray(row.steps)?row.steps:[];
      if(stages.length>30)return '';
      if(stages.length){
        var entries=[];
        for(var i=0;i<stages.length;i++){
          var s=stages[i];
          if(!s||s.taskRewardEvidence!=='not-extracted'||
             !Number.isInteger(s.step)||!Number.isInteger(s.outOf)||
             s.step<1||s.outOf<s.step||s.outOf>100)return '';
          entries.push('<li>Stage '+esc(s.step)+' of '+esc(s.outOf)+
            (s.title?' — '+esc(s.title):'')+'</li>');
        }
        extra='<ol class="ue-verified-stages">'+entries.join('')+'</ol>'+
          '<small>Stage headings only; tasks and rewards have not been verified.</small>';
      }
    }else return '';
    return '<li class="ue-verified-row"><strong>'+esc(title)+'</strong> '+a+
      timing(row)+extra+sources+'</li>';
  }
  function section(title,kind,records){
    if(!Array.isArray(records)||records.length>300)return '';
    var html=records.map(function(r){return rowHtml(r,kind);}).filter(Boolean);
    return html.length?'<section class="ue-verified-group" data-group="'+esc(kind)+
      '"><h3>'+esc(title)+'</h3><ul>'+html.join('')+'</ul></section>':'';
  }
  function render(panels,canonicalEventId){
    if(!panels||typeof panels!=='object'||!ID.test(canonicalEventId||'')||
       panels.eventId!==canonicalEventId||!(/^[a-f0-9]{64}$/.test(panels.reviewFingerprint||'')))
      return '';
    var html=section('Verified event bonuses','bonuses',panels.bonuses)+
      section('Featured attacks and availability','featuredMoves',panels.featuredMoves)+
      section('Research programmes','research',panels.research);
    return html?'<section class="ue-verified-facets" aria-label="Verified source details">'+
      '<h2>Verified source details</h2><p>Source-backed details reviewed for this event; check access and availability.</p>'+
      html+'</section>':'';
  }
  return {render:render};
}));