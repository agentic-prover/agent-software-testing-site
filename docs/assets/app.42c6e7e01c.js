/*! SPDX-License-Identifier: Apache-2.0 | Copyright 2026 The Agent Software Testing authors */
(function(){
"use strict";
var $=function(s,r){return(r||document).querySelector(s);};
var $$=function(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s));};
var main=$("#main");
var page=main?main.getAttribute("data-page"):"";
var ROOT=main?main.getAttribute("data-root")||"":"";
var root=document.documentElement;
var INDEX=window.CRIndex||{items:[]};
if(main)main.classList.remove("no-js");
if(page==="notfound")$$("a.skip").forEach(function(a){
a.addEventListener("click",function(e){if(main){e.preventDefault();main.focus();main.scrollIntoView();}});
});
function swapIn(e){if(!e)return;e.classList.remove("swap-in");void e.offsetWidth;e.classList.add("swap-in");}
var live=$("#live");
function say(t){if(live){live.textContent="";setTimeout(function(){live.textContent=t;},30);}}
var pal=$("#pal"),palIn=$("#pal-in"),palList=$("#pal-list"),palItems=[],palSel=0;
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return c==="&"?"&amp;":c==="<"?"&lt;":c===">"?"&gt;":c==='"'?"&quot;":"&#39;";});}
var palStatus=$("#pal-status");
function palRender(){
var q=palIn.value.toLowerCase().trim(),kind=null;
var m=/^([pt])\s+(.*)$/.exec(q);if(m){kind=m[1];q=m[2];}
var toks=q.split(/\s+/).filter(Boolean);
var list=INDEX.items.filter(function(it){
if(kind&&it[5]!==kind)return false;
return toks.every(function(t){return it[3].indexOf(t)>=0;});
});
if(toks.length)list.sort(function(a,b){
var sa=a[1].toLowerCase().indexOf(toks[0]),sb=b[1].toLowerCase().indexOf(toks[0]);
sa=sa<0?99:sa;sb=sb<0?99:sb;
return sa-sb;
});
list=list.slice(0,40);
palItems=list;palSel=0;
var h="",last="";
if(!list.length)h='<li class="none" role="presentation">No program or tool matches. Definitions are in Terms on the pages of tables.</li>';
list.forEach(function(it,i){
if(it[0]!==last){h+='<li class="h" role="presentation">'+esc(it[0])+"</li>";last=it[0];}
h+='<li class="i" role="presentation"><a role="option" tabindex="-1" id="po-'+i+'" href="'+esc(ROOT+it[2])+'" data-i="'+i+'" aria-selected="'+(i===0)+'">'+esc(it[1])+'<span class="h">'+esc(it[4])+"</span></a></li>";
});
palList.innerHTML=h;
palIn.setAttribute("aria-expanded",list.length?"true":"false");
palIn.setAttribute("aria-activedescendant",list.length?"po-0":"");
if(palStatus){palStatus.textContent="";setTimeout(function(){palStatus.textContent=list.length?list.length+(list.length===1?" result":" results"):"No match. Definitions are in Terms on the pages of tables";},30);}
}
function palMove(d){
if(!palItems.length)return;
var cur=$('a[aria-selected="true"]',palList);if(cur)cur.setAttribute("aria-selected","false");
palSel=(palSel+d+palItems.length)%palItems.length;
var n=$("#po-"+palSel,palList);n.setAttribute("aria-selected","true");n.scrollIntoView({block:"nearest"});
palIn.setAttribute("aria-activedescendant","po-"+palSel);
}
function go(href){
var path=href.split("#")[0],tok=href.split("#")[1];
var here=location.pathname.split("/").pop()||"index.html";
if(path.split("/").pop()===here&&tok)location.hash=tok;
else if(path.split("/").pop()!==here)location.href=ROOT+href;
}
function palGo(i){var it=palItems[i];if(!it)return;pal.close();go(it[2]);}
function palOpen(){
if(!pal||pal.open)return;
if(typeof pal.showModal!=="function"){location.href=ROOT+"tools.html";return;}
palIn.value="";palRender();pal.showModal();palIn.focus();
}
if(pal){
palIn.addEventListener("input",palRender);
palIn.addEventListener("keydown",function(e){
if(e.key==="ArrowDown"){e.preventDefault();palMove(1);}
else if(e.key==="ArrowUp"){e.preventDefault();palMove(-1);}
else if(e.key==="Enter"){e.preventDefault();palGo(palSel);}
});
palList.addEventListener("click",function(e){var a=e.target.closest("a");if(a){e.preventDefault();palGo(Number(a.getAttribute("data-i")));}});
palList.addEventListener("mousemove",function(e){var a=e.target.closest("a");if(a){var i=Number(a.getAttribute("data-i"));if(i!==palSel)palMove(i-palSel);}});
pal.addEventListener("click",function(e){if(e.target===pal)pal.close();});
pal.addEventListener("close",function(){palList.innerHTML="";palItems=[];});
$$("[data-open-palette]").forEach(function(b){b.addEventListener("click",palOpen);});
$$("[data-theme-toggle]").forEach(function(b){
b.addEventListener("click",function(){
var dark=root.getAttribute("data-theme")!=="dark";
if(dark)root.setAttribute("data-theme","dark");else root.removeAttribute("data-theme");
try{localStorage.setItem("theme",dark?"dark":"light");}catch(e){}
var meta=$('meta[name="theme-color"]');
if(meta)meta.content=getComputedStyle(document.body).backgroundColor;
window.dispatchEvent(new Event("themechange"));
});
});
$$("[data-close-palette]").forEach(function(b){b.addEventListener("click",function(){pal.close();});});
}
document.addEventListener("keydown",function(e){
if((e.metaKey||e.ctrlKey)&&(e.key==="k"||e.key==="K")){e.preventDefault();palOpen();}
});
(function(){
var all=$$("details.terms");
if(!all.length)return;
function place(d,reveal){
var dl=d.querySelector(".terms-dl");if(!dl)return;
dl.style.left="";dl.style.right="";dl.style.maxWidth="";
var cw=document.documentElement.clientWidth,mr=main?main.getBoundingClientRect():{left:0,right:cw},g=main?parseFloat(getComputedStyle(main).paddingLeft)||0:0;
var lo=Math.max(mr.left+g,8),hi=Math.min(mr.right-g,cw-8);
dl.style.maxWidth=Math.max(0,hi-lo)+"px";
var r=dl.getBoundingClientRect(),op=dl.offsetParent||document.body,cb=op.getBoundingClientRect(),left=r.left;
if(left+r.width>hi)left=hi-r.width;
if(left<lo)left=lo;
if(Math.abs(left-r.left)>0.5){dl.style.left=(left-cb.left-(op.clientLeft||0))+"px";dl.style.right="auto";}
if(reveal){try{dl.scrollIntoView({block:"nearest"});}catch(e){}}
}
all.forEach(function(d){
d.addEventListener("toggle",function(){if(d.open){place(d,true);all.forEach(function(o){if(o!==d&&o.open)o.open=false;});}});
d.addEventListener("focusout",function(e){if(d.open&&e.relatedTarget&&!d.contains(e.relatedTarget))d.open=false;});
});
function outside(e){all.forEach(function(d){if(d.open&&!d.contains(e.target))d.open=false;});}
document.addEventListener("pointerdown",outside);
document.addEventListener("click",outside);
document.addEventListener("keydown",function(e){
if(e.key!=="Escape"||e.defaultPrevented)return;
all.forEach(function(d){if(d.open){d.open=false;var s=d.querySelector("summary");if(s)s.focus();}});
});
window.addEventListener("resize",function(){all.forEach(function(d){if(d.open)place(d);});});
})();
function openHash(){
var id=location.hash.slice(1),e=id?document.getElementById(id):null;
if(!e||e.tagName!=="DETAILS")return;
e.open=true;
e.scrollIntoView({block:"start"});
var s=e.querySelector("summary");if(s){try{s.focus({preventScroll:true});}catch(err){s.focus();}}
}
openHash();
window.addEventListener("hashchange",openHash);
function cellVal(tr,key,table){
if(key==="name")return tr.getAttribute("data-name");
if(/^c\d+$/.test(key)){
var td=tr.querySelector('td[data-c="'+key+'"]');
if(!td)return null;
var v=td.getAttribute(table.getAttribute("data-unit")==="pct"?"data-pct":"data-med");
return v===""||v==null?null:Number(v);
}
var a=tr.getAttribute("data-"+key);
if(a==null||a==="")return null;
return isNaN(Number(a))?a:Number(a);
}
function headText(b){
var parts=[];
$$(".th-top, .th-sub, .th-trk",b).forEach(function(n){
var c=n.cloneNode(true);
$$(".sr, .ind",c).forEach(function(x){x.parentNode.removeChild(x);});
var t=c.textContent.replace(/\s+/g," ").trim();
if(t)parts.push(t);
});
return parts.length?parts.join(" "):b.textContent.replace(/\s+/g," ").trim();
}
function attachSort(table,opts){
opts=opts||{};
var state={key:null,dir:0};
var tbody=table.tBodies[0];
var rows=$$("tr",tbody).filter(function(r){return!r.classList.contains("detail")&&!r.classList.contains("grp");});
rows.forEach(function(r,i){r.setAttribute("data-o",i);});
var details=new Map();
rows.forEach(function(r){var n=r.nextElementSibling;if(n&&n.classList.contains("detail"))details.set(r,n);});
function detailOf(r){return details.get(r)||null;}
function sorted(list){
var out=list.slice();
out.sort(function(a,b){
if(!state.dir)return Number(a.getAttribute("data-o"))-Number(b.getAttribute("data-o"));
var x=cellVal(a,state.key,table),y=cellVal(b,state.key,table);
if(x==null&&y==null)return 0;if(x==null)return 1;if(y==null)return-1;
var c=typeof x==="string"?x.localeCompare(y):x-y;
return state.dir*c||Number(a.getAttribute("data-o"))-Number(b.getAttribute("data-o"));
});
return out;
}
function apply(){
if(opts.grouped){
var groups=[],cur=null;
$$("tr",tbody).forEach(function(r){if(r.classList.contains("grp")){cur={head:r,rows:[]};groups.push(cur);}else if(cur)cur.rows.push(r);});
groups.forEach(function(g){
var frag=document.createDocumentFragment();
sorted(g.rows).forEach(function(r){frag.appendChild(r);});
tbody.insertBefore(frag,g.head.nextSibling);
});
}else{
var frag=document.createDocumentFragment();
sorted(rows).forEach(function(r){frag.appendChild(r);var d=detailOf(r);if(d)frag.appendChild(d);});
tbody.appendChild(frag);
}
$$("th[aria-sort]",table).forEach(function(th){th.setAttribute("aria-sort","none");});
if(state.dir){var b=$('button.sort[data-k="'+state.key+'"]',table);if(b)b.closest("th").setAttribute("aria-sort",state.dir>0?"ascending":"descending");}
}
table.addEventListener("click",function(e){
var b=e.target.closest("button.sort");if(!b||!table.contains(b))return;
var k=b.getAttribute("data-k"),textual=k==="name"||k==="family"||k==="group";
if(state.key!==k){state.key=k;state.dir=textual?1:-1;}
else if(state.dir===(textual?1:-1))state.dir=-state.dir;
else state.dir=0;
apply();
say(state.dir?"Sorted by "+headText(b)+", "+(state.dir>0?"ascending":"descending"):"Original order");
});
return{reapply:function(){if(state.dir)apply();},state:state};
}
var spyObs=null,spyHold=0;
function markSection(id){
$$(".subbar nav a[data-sec]").forEach(function(a){
var on=a.getAttribute("data-sec")===id;
a.classList.toggle("on",on);
if(on)a.setAttribute("aria-current","location");else a.removeAttribute("aria-current");
});
}
function spy(){
var links=$$(".subbar nav a[data-sec]");
if(!links.length)return;
if(spyObs)spyObs.disconnect();
if(!("IntersectionObserver"in window))return;
spyObs=new IntersectionObserver(function(es){
es.forEach(function(en){
if(!en.isIntersecting||Date.now()<spyHold)return;
markSection(en.target.id);
});
},{rootMargin:"-30% 0px -60% 0px"});
$$("main section.section").forEach(function(s){spyObs.observe(s);});
}
$$(".subbar nav a[data-sec]").forEach(function(a){
a.addEventListener("click",function(){
var s=document.getElementById(a.getAttribute("data-sec")),h=s&&s.querySelector("h2");
spyHold=Date.now()+800;
markSection(a.getAttribute("data-sec"));
if(!h)return;
h.setAttribute("tabindex","-1");
setTimeout(function(){try{h.focus({preventScroll:true});}catch(e){h.focus();}},0);
});
});
spy();
function recsRoles(){
$$("table.recs").forEach(function(t){
if(t.closest("tr.detail[hidden]"))return;
var flat=getComputedStyle(t).display!=="table",on=t.hasAttribute("data-roles");
if(flat===on)return;
var set=function(e,r){if(flat)e.setAttribute("role",r);else e.removeAttribute("role");};
set(t,"table");
$$("thead, tbody",t).forEach(function(g){set(g,"rowgroup");});
$$("tr",t).forEach(function(r){set(r,"row");});
$$("th",t).forEach(function(c){set(c,c.closest("thead")?"columnheader":"rowheader");});
$$("td",t).forEach(function(c){set(c,"cell");});
if(flat)t.setAttribute("data-roles","");else t.removeAttribute("data-roles");
});
}
if($("table.recs")){
recsRoles();
if(window.matchMedia){
var mq=window.matchMedia("(max-width: 719px)");
if(mq.addEventListener)mq.addEventListener("change",recsRoles);else if(mq.addListener)mq.addListener(recsRoles);
}
}
var frames=$$(".tbl-wrap.stickyhead"),cues=$$(".tbl-cue"),frameTick=0;
function measureFrames(){
frameTick=0;
var extra=null;
frames.forEach(function(fr){
var t=fr.querySelector("table"),hd=t&&t.tHead;
if(!t||!fr.offsetWidth)return;
var wide=t.offsetWidth>fr.offsetWidth+1;
if(wide!==fr.classList.contains("is-wide"))fr.classList.toggle("is-wide",wide);
if(hd&&hd.offsetHeight){
fr.style.setProperty("--head-h",hd.offsetHeight+"px");
if(getComputedStyle(fr).overflowY==="visible")extra=hd.offsetHeight+8;
}
});
if(extra==null)root.style.removeProperty("--sp-extra");else root.style.setProperty("--sp-extra",extra+"px");
$$(".tbl-wrap").forEach(function(fr){
var st=fr.querySelector("thead .sticky");
if(st)fr.style.setProperty("--sticky-w",st.offsetWidth+"px");
});
cues.forEach(cueUpdate);
}
function cueUpdate(cue){
var fr=cue.firstElementChild;if(!fr||!fr.offsetWidth)return;
var max=fr.scrollWidth-fr.clientWidth,x=fr.scrollLeft,more=[],st=fr.querySelector("thead .sticky");
if(max>1&&x>1)more.push("l");
if(max>1&&x<max-1)more.push("r");
var v=more.join(" ");
if(cue.getAttribute("data-more")!==v)cue.setAttribute("data-more",v);
cue.style.setProperty("--cue-left",(st?st.offsetWidth:0)+"px");
}
function queueFrames(){if(!frameTick)frameTick=requestAnimationFrame(measureFrames);}
cues.forEach(function(cue){
cue.setAttribute("data-cue","");
if(cue.firstElementChild)cue.firstElementChild.addEventListener("scroll",function(){cueUpdate(cue);},{passive:true});
});
if(frames.length||cues.length){
measureFrames();
window.addEventListener("resize",queueFrames);
if(window.ResizeObserver){
var ro=new ResizeObserver(queueFrames);
$$(".tbl-wrap").forEach(function(fr){ro.observe(fr);var t=fr.querySelector("table");if(t)ro.observe(t);});
$$(".chips-cue .chip").forEach(function(c){ro.observe(c);});
}
}
var SCROLLERS=".tbl-wrap, #legend, .terms-dl",saved=new WeakMap(),scrollTick=0;
function syncScrollers(){
scrollTick=0;
$$(SCROLLERS).forEach(function(el){
if(!el.offsetWidth&&!el.offsetHeight)return;
if(!saved.has(el))saved.set(el,{role:el.getAttribute("role"),label:el.getAttribute("aria-label")});
var keep=saved.get(el),on=el.scrollWidth>el.clientWidth+1||el.scrollHeight>el.clientHeight+1;
if(on){
el.setAttribute("tabindex","0");
if(keep.role)el.setAttribute("role",keep.role);
if(keep.label)el.setAttribute("aria-label",keep.label);
}else if(el!==document.activeElement){
el.removeAttribute("tabindex");
if(keep.role)el.removeAttribute("role");
if(keep.label&&keep.role)el.removeAttribute("aria-label");
}
});
}
function queueScrollers(){if(!scrollTick)scrollTick=requestAnimationFrame(syncScrollers);}
syncScrollers();
window.addEventListener("resize",queueScrollers);
window.addEventListener("load",queueScrollers);
if(window.ResizeObserver){var sro=new ResizeObserver(queueScrollers);$$(SCROLLERS).forEach(function(el){sro.observe(el);});}
if(window.MutationObserver&&main){
new MutationObserver(function(records){
for(var i=0;i<records.length;i++){var n=records[i].target;if(!(n.nodeType===1&&n.closest&&n.closest("#mapbox"))){queueScrollers();return;}}
}).observe(main,{childList:true,subtree:true,attributes:true,attributeFilter:["hidden","open"]});
}
$$("details").forEach(function(d){d.addEventListener("toggle",queueScrollers);});
window.CRApp={frames:queueFrames,say:say,swapIn:swapIn,attachSort:attachSort,esc:esc,root:ROOT,spy:spy,recsRoles:recsRoles,scrollers:queueScrollers};
function initResults(){
var panels=$$(".gpanel"),sorters=panels.map(function(p){return attachSort($("table",p));});
var E=window.CREntries,SRC=main.getAttribute("data-src");
var UNIT_TOKEN={pct:"",n:"branches",spread:"spread"},GROUPS=$$('input[name="rgroup"]').map(function(r){return r.value;}),DEFAULT_GROUP=GROUPS[0],GROUP_TOKENS=GROUPS.slice(1);
function buildSpread(table){
if(table.getAttribute("data-spread"))return;
table.setAttribute("data-spread","1");
var NF=new Intl.NumberFormat("en-US"),nf=function(n){return NF.format(Number(n));};
$$("td.cell[data-lo]",table).forEach(function(td){
var tot=Number(td.parentNode.getAttribute("data-total")),lo=Number(td.getAttribute("data-lo")),hi=Number(td.getAttribute("data-hi")),pct=Number(td.getAttribute("data-pct"));
var v=document.createElement("span");v.className="v u-s";
v.innerHTML=$(".u-n",td).innerHTML+'<span class="rg" aria-hidden="true">'+nf(lo)+"–"+nf(hi)+"</span>";
var bar=document.createElement("span");bar.className="mb rng";
var i=document.createElement("i"),t=document.createElement("b");
i.style.left=(100*lo/tot).toFixed(2)+"%";i.style.width=Math.max(100*(hi-lo)/tot,0.4).toFixed(2)+"%";t.style.left=pct.toFixed(2)+"%";
bar.appendChild(i);bar.appendChild(t);
var runs=$(".sr",td),rg=document.createElement("span");rg.className="sr u-sr";rg.textContent=", range "+nf(lo)+" to "+nf(hi);
td.insertBefore(v,runs);td.insertBefore(bar,$(".mb",td));
if(runs)runs.parentNode.insertBefore(rg,runs.nextSibling);
});
}
function setUnit(v){
panels.forEach(function(p,i){var tb=$("table",p);if(v==="spread"&&!p.hidden)buildSpread(tb);tb.setAttribute("data-unit",v);sorters[i].reapply();});
var r=$('input[name="unit"][value="'+v+'"]');if(r)r.checked=true;
}
function setGroup(v,announce){
panels.forEach(function(p){p.hidden=p.getAttribute("data-group")!==v;});
var shown=$("#g-"+v),u=$('input[name="unit"]:checked');
if(shown&&u&&u.value==="spread")buildSpread($("table",shown));
var r=$('input[name="rgroup"][value="'+v+'"]');if(r)r.checked=true;
var p=$("#g-"+v);if(announce)swapIn(p);
var name=r&&r.nextElementSibling?r.nextElementSibling.textContent:v;
if(announce)say(name+" group: "+p.getAttribute("data-rows")+" programs, "+p.getAttribute("data-cols")+" tools");
}
function writeHash(){
var g=$('input[name="rgroup"]:checked'),u=$('input[name="unit"]:checked');
var t=[g&&g.value!==DEFAULT_GROUP?g.value:"",u?UNIT_TOKEN[u.value]:""].filter(Boolean).join("-");
if(g&&g.value==="chosen"&&chosen)t=E.format({e:chosen.shown,rest:u&&UNIT_TOKEN[u.value]?[UNIT_TOKEN[u.value]]:[]});
try{history.replaceState(null,"",t?"#"+t:location.pathname+location.search);}catch(e){}
}
function readHash(){
var a=E?E.parse(location.hash):{e:null,rest:[location.hash.slice(1)]};
var raw=a.rest.join("&"),g=DEFAULT_GROUP,u="pct",known=!raw&&!a.e;
raw.split("-").forEach(function(k){
if(GROUP_TOKENS.indexOf(k)>=0&&!a.e){g=k;known=true;}
else if(k==="branches"){u="n";known=true;}
else if(k==="spread"){u="spread";known=true;}
});
if(a.e&&SRC){g="chosen";known=true;}
return{g:g,u:u,known:known,e:a.e&&SRC?a.e:null};
}
var chosen=null,FAMILIES={agent:"Agent",llm:"Language model",symbolic:"Symbolic",fuzzer:"Fuzzer",hybrid:"Hybrid",other:"Other"};
var FAMILY_ORDER=["agent","llm","symbolic","fuzzer","hybrid","other"],NB=/(Direct-Input|GPT-5\.5)/g;
var nb=function(t){return esc(t).replace(NB,'<span class="nb">$1</span>');};
function sortHead(k,label,extra,right){
var ind='<span class="ind"></span>',inExtra=extra.indexOf("{ind}")>=0;
var top=inExtra?'<span class="th-top">'+label+"</span>":'<span class="th-top">'+(right?ind+label:label+ind)+"</span>";
return'<span class="th-static"><span class="th-top">'+label+"</span>"+extra.split("{ind}").join("")+'</span><button class="sort" type="button" data-k="'+k+'">'+top+extra.split("{ind}").join(ind)+"</button>";
}
function chosenHtml(M,cols,rows){
var bands=[],h;
cols.forEach(function(x){var b=bands[bands.length-1];if(b&&b.f===x.family)b.n++;else bands.push({f:x.family,n:1});});
var starts={},at=0;
bands.forEach(function(b){starts[at]=true;at+=b.n;});
h='<table class="tbl res" data-unit="pct" data-sortable="1"><caption class="sr">Median final branch coverage by program and tool, the entries chosen on the front page</caption><thead><tr>'+
'<th class="sticky" scope="col" aria-sort="none" rowspan="2">'+sortHead("name","Program","",false)+"</th>"+
'<th class="r col-total" scope="col" aria-sort="none" rowspan="2">'+sortHead("total","Total branches","",true)+"</th>";
bands.forEach(function(b){h+='<th class="band bstart" colspan="'+b.n+'" scope="colgroup">'+esc(FAMILIES[b.f]||b.f)+"</th>";});
h+="</tr><tr>";
cols.forEach(function(x,ci){
var trk=cols.length>8?'<span class="th-trk">'+esc(x.track)+' <span class="trk-last">{ind}track</span></span>':'<span class="th-trk">{ind}'+esc(x.track)+" track</span>";
var nl=x.name.indexOf(", "),first=nl<0?x.name:x.name.slice(0,nl),rest=nl<0?"":x.name.slice(nl+2);
h+='<th class="r cell'+(starts[ci]?" bstart":"")+'" scope="col" aria-sort="none" title="Version '+esc(x.v)+'">'+
sortHead("c"+ci,nb(first),'<span class="th-sub">'+nb(rest)+'</span><span class="sr">, version '+esc(x.v)+"</span>"+trk,true)+"</th>";
});
h+="</tr></thead><tbody>";
rows.forEach(function(r,i){
h+='<tr data-i="'+i+'" data-name="'+esc(r.p.name.toLowerCase())+'" data-total="'+r.p.total+'"><th class="sticky" scope="row"><a class="pname" href="programs/'+esc(r.p.id)+'.html">'+esc(r.p.name)+"</a>"+
'<span class="sub mono mob-only"><span aria-hidden="true">'+E.fmt(r.p.total)+'</span><span class="sr">'+E.fmt(r.p.total)+' branches</span></span></th>'+
'<td class="num r muted col-total" data-v="'+r.p.total+'"><span class="v">'+E.fmt(r.p.total)+"</span></td>";
cols.forEach(function(x,ci){
var c=r.cells[x.id],bs=starts[ci]?" bstart":"";
if(!c){h+='<td class="cell r miss'+bs+'" data-c="c'+ci+'" data-pct="" data-med="" data-state="no-run"><span class="v" aria-hidden="true">–</span><span class="sr">no runs</span></td>';return;}
var pct=c[0]/r.p.total*100,d=c[3]<3?'<sup class="dag" title="Fewer than three runs ('+c[3]+')">†</sup>':"";
h+='<td class="cell r'+bs+'" data-c="c'+ci+'" data-pct="'+E.fixed(pct,2)+'" data-med="'+c[0]+'" data-lo="'+c[1]+'" data-hi="'+c[2]+'" title="'+E.fmt(c[0])+" of "+E.fmt(r.p.total)+
" branches, "+c[3]+" "+E.plural(c[3],"run","runs")+'"><span class="v u-pct">'+E.fixed(pct,1)+"%"+d+'</span><span class="v u-n">'+E.fmt(c[0])+d+"</span>"+
'<span class="sr">, '+c[3]+" "+E.plural(c[3],"run","runs")+'</span><span class="mb u-bar"><i style="width:'+E.fixed(pct,1)+'%"></i></span></td>';
});
h+="</tr>";
});
return h+"</tbody></table>";
}
function buildChosen(named,unit){
var data=E.Data(SRC);
return Promise.all([data.programs(),data.entries()]).then(function(r){
var P=r[0],M=r[1],shown=E.fromAddress(named,M);
if(!shown.length)return false;
return Promise.all(shown.map(function(x){return data.cells(x.id);})).then(function(got){
var by={},cols=shown.map(function(x){return M.by[x.id];});
shown.forEach(function(x,i){by[x.id]=got[i];});
cols.sort(function(a,b){
var ta=M.toolList.indexOf(M.tools[a.tool]),tb=M.toolList.indexOf(M.tools[b.tool]);
return FAMILY_ORDER.indexOf(a.family)-FAMILY_ORDER.indexOf(b.family)||ta-tb||a.k-b.k;
});
var rows=[];
P.list.forEach(function(p){var cs={},any=false;cols.forEach(function(x){if(by[x.id][p.id]){cs[x.id]=by[x.id][p.id];any=true;}});if(any)rows.push({p:p,cells:cs});});
if(chosen){var old=chosen.panel,i=panels.indexOf(old);if(i>=0){panels.splice(i,1);sorters.splice(i,1);}old.parentNode.removeChild(old);}
var panel=document.createElement("div");
panel.className="gpanel";panel.id="g-chosen";panel.setAttribute("data-group","chosen");panel.setAttribute("data-rows",rows.length);panel.setAttribute("data-cols",cols.length);panel.hidden=true;
panel.innerHTML='<h2 class="gp-title sr">Chosen group</h2>'+(rows.length>30?'<div class="findbox"><label for="ch-find">Find a program</label><input class="namebox" id="ch-find" type="search" autocomplete="off" spellcheck="false"></div>':"")+
'<div class="tbl-cue"><div class="tbl-wrap stickyhead" tabindex="0" role="region" aria-label="Median final branch coverage by program and tool, the entries chosen on the front page">'+chosenHtml(M,cols,rows)+"</div></div>";
panels[0].parentNode.insertBefore(panel,panels[0]);
panels.push(panel);sorters.push(attachSort($("table",panel)));
var fr=$(".tbl-wrap",panel),cue=$(".tbl-cue",panel);
frames.push(fr);cues.push(cue);cue.setAttribute("data-cue","");fr.addEventListener("scroll",function(){cueUpdate(cue);},{passive:true});
if(window.ResizeObserver&&typeof ro!=="undefined"){ro.observe(fr);ro.observe($("table",panel));}
var find=$("#ch-find",panel);
if(find)find.addEventListener("input",function(){
var q=find.value.trim().toLowerCase();
$$("tbody tr",panel).forEach(function(tr){tr.hidden=!!q&&tr.getAttribute("data-name").indexOf(q)<0;});
});
chosen={panel:panel,shown:shown,named:E.format({e:named})};
if(!$('input[name="rgroup"][value="chosen"]')){
var seg=$('input[name="rgroup"]').closest(".seg"),lab=document.createElement("label");
lab.innerHTML='<input type="radio" name="rgroup" value="chosen" aria-controls="g-chosen"><span>Chosen</span>';
seg.appendChild(lab);
$("input",lab).addEventListener("change",function(){setGroup("chosen",true);writeHash();});
}
queueFrames();queueScrollers();
return true;
});
});
}
$$('input[name="unit"]').forEach(function(r){r.addEventListener("change",function(){setUnit(r.value);writeHash();});});
$$('input[name="rgroup"]').forEach(function(r){r.addEventListener("change",function(){setGroup(r.value,true);writeHash();});});
var h0=readHash();
if(h0.e)buildChosen(h0.e,h0.u).then(function(ok){
if(!ok){say("The entries could not be shown. The groups of the table are below.");return;}
setGroup("chosen",false);setUnit(h0.u);
},function(){say("The entries could not be loaded. The groups of the table are below.");});
else{
if(h0.g!==DEFAULT_GROUP)setGroup(h0.g,false);
if(h0.u!=="pct")setUnit(h0.u);
}
window.addEventListener("hashchange",function(){
var h=readHash(),g=$('input[name="rgroup"]:checked'),u=$('input[name="unit"]:checked');
if(!h.known)return;
if(h.e&&!(chosen&&chosen.named===E.format({e:h.e}))){
buildChosen(h.e,h.u).then(function(ok){if(ok){setGroup("chosen",true);setUnit(h.u);}});
return;
}
if(!g||g.value!==h.g)setGroup(h.g,true);
if(!u||u.value!==h.u)setUnit(h.u);
});
}
function initTools(){
var wrap=$("#tools-wrap"),table=$("table",wrap),group="all";
attachSort(table);
function rowOf(id){return $('tr.trow[data-id="'+id+'"]',wrap);}
function setOpen(id,open,scroll){
var tr=rowOf(id),dt=document.getElementById("d-"+id);if(!tr||!dt)return;
dt.hidden=!open||tr.hidden;$(".rowbtn",tr).setAttribute("aria-expanded",String(open));
if(open)recsRoles();
if(open&&scroll)tr.scrollIntoView({block:"start"});
}
wrap.addEventListener("click",function(e){
var b=e.target.closest(".rowbtn");if(!b)return;
e.preventDefault();
var tr=b.closest("tr"),id=tr.getAttribute("data-id"),open=$(".rowbtn",tr).getAttribute("aria-expanded")!=="true";
setOpen(id,open,false);
try{if(open)history.replaceState(null,"","#"+id);else if(location.hash==="#"+id)history.replaceState(null,"",location.pathname+location.search);}catch(err){}
});
function filter(){
$$("tr.trow",wrap).forEach(function(tr){
var show=group==="all"||tr.getAttribute("data-g")===group;
tr.hidden=!show;
var dt=document.getElementById("d-"+tr.getAttribute("data-id"));
dt.hidden=!show||$(".rowbtn",tr).getAttribute("aria-expanded")!=="true";
});
}
$$('input[name="tgroup"]').forEach(function(r){
r.addEventListener("change",function(){group=r.value;filter();swapIn(wrap);say($$("tr.trow:not([hidden])",wrap).length+" tools");});
});
function fromHash(){
var id=location.hash.slice(1),tr=id&&rowOf(id);
if(!tr)return;
if(group!=="all"&&tr.getAttribute("data-g")!==group){var r=$('input[name="tgroup"][value="all"]');r.checked=true;group="all";filter();}
setOpen(id,true,true);
var rb=$(".rowbtn",tr);
if(rb&&rb.offsetParent){try{rb.focus({preventScroll:true});}catch(err){rb.focus();}}
say((rb&&rb.getAttribute("aria-label")||"Results of the tool")+" opened");
}
window.addEventListener("hashchange",fromHash);
fromHash();
}
function initDoc(){
var links=$$(".toc a");if(!links.length||!("IntersectionObserver"in window))return;
var io=new IntersectionObserver(function(es){
es.forEach(function(en){
if(!en.isIntersecting)return;
links.forEach(function(a){
var on=a.getAttribute("href")==="#"+en.target.id;
a.classList.toggle("on",on);
if(on)a.setAttribute("aria-current","location");else a.removeAttribute("aria-current");
});
});
},{rootMargin:"-20% 0px -70% 0px"});
$$(".prose h2[id]").forEach(function(h){io.observe(h);});
}
if(page==="results")initResults();
else if(page==="tools")initTools();
else if(page==="doc")initDoc();
})();
