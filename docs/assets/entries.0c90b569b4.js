/*! SPDX-License-Identifier: Apache-2.0 | Copyright 2026 The Agent Software Testing authors */
(function(root,factory){
if(typeof module==="object"&&module.exports)module.exports=factory(root);
else root.CREntries=factory(root);
})(typeof self!=="undefined"?self:this,function(win){
"use strict";
var PALETTE=8,PER_TOOL=2,PAGE_ROWS=30;
function esc(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");}
var NF=new Intl.NumberFormat("en-US",{maximumFractionDigits:1});
function fmt(n){return NF.format(n);}
function plural(n,a,b){return n===1?a:b;}
function fixed(x,d){
var s=x.toFixed(Math.min(100,d+70)),tail=s.slice(s.length-70);
if(/^50*$/.test(tail)){
var head=s.slice(0,s.length-70).replace(/\.$/,"");
if((head.charCodeAt(head.length-1)-48)%2===0)return head;
}
return x.toFixed(d);
}
function parse(hash){
var out={e:null,p:"",rest:[]};
String(hash||"").replace(/^#/,"").split("&").forEach(function(part){
if(!part)return;
var i=part.indexOf("="),k=i<0?part:part.slice(0,i),v=i<0?"":part.slice(i+1);
if(k==="e")out.e=v.split(",").filter(Boolean).map(function(x){var j=x.lastIndexOf(":");return j<0?{id:x,slot:0}:{id:x.slice(0,j),slot:Number(x.slice(j+1))||0};});
else if(k==="p")out.p=v;
else out.rest.push(part);
});
return out;
}
function format(o){
var parts=[];
if(o.e)parts.push("e="+o.e.map(function(x){return x.id+":"+x.slot;}).join(","));
if(o.p)parts.push("p="+o.p);
return parts.concat(o.rest||[]).join("&");
}
function Data(base,fetcher){
var cache={},get=fetcher||function(u){return win.fetch(u);};
function file(path){
if(!cache[path]){
cache[path]=get(base+path).then(function(r){if(!r.ok)throw new Error(path+": "+r.status);return r.json();}).catch(function(e){delete cache[path];throw e;});
}
return cache[path];
}
return{
programs:function(){
return file("programs.json").then(function(d){
var list=d.programs.map(function(p){return{id:p[0],name:p[1],total:p[2],map:p[3],cells:p[4]};}),by={};
list.forEach(function(p){by[p.id]=p;});
return{list:list,by:by};
});
},
entries:function(){
return file("entries.json").then(function(d){
var tools={},toolList=[],by={},list=d.entries.map(function(e){
return{id:e[0],label:e[1],tool:e[2],name:e[3],group:e[4],n:e[5],k:e[6],v:e[7],track:e[8],family:e[9]};
});
d.tools.forEach(function(t){tools[t[0]]={id:t[0],name:t[1],slot:t[2]};toolList.push(tools[t[0]]);});
list.forEach(function(e){by[e.id]=e;});
return{tools:tools,toolList:toolList,list:list,by:by};
});
},
cells:function(id){return file("e/"+id+".json");}
};
}
function toolsOn(shown,E){
var seen={},out=[];
shown.forEach(function(x){var t=E.by[x.id].tool;if(!seen[t]){seen[t]=x.slot;out.push({id:t,slot:x.slot});}});
return out.sort(function(a,b){return a.slot-b.slot;});
}
function freeSlot(tool,taken){
if(taken.indexOf(tool.slot)<0)return tool.slot;
for(var s=1;s<=PALETTE;s++)if(taken.indexOf(s)<0)return s;
return tool.slot;
}
function add(shown,id,E){
var e=E.by[id],t=E.tools[e.tool],on=toolsOn(shown,E),mine=shown.filter(function(x){return E.by[x.id].tool===e.tool;});
if(shown.some(function(x){return x.id===id;}))return{why:"present",tool:t.name};
if(mine.length>=PER_TOOL)return{why:"two",tool:t.name};
var slot=mine.length?mine[0].slot:freeSlot(t,on.map(function(x){return x.slot;}));
return{shown:shown.concat([{id:id,slot:slot}])};
}
function removeTool(shown,toolId,E){return shown.filter(function(x){return E.by[x.id].tool!==toolId;});}
function fromAddress(named,E){
var shown=[],slots={};
(named||[]).forEach(function(x){
var e=E.by[x.id];
if(!e||shown.some(function(y){return y.id===x.id;}))return;
var mine=shown.filter(function(y){return E.by[y.id].tool===e.tool;});
if(mine.length>=PER_TOOL)return;
var slot=mine.length?mine[0].slot:x.slot;
if(!mine.length){
var taken=Object.keys(slots).map(function(k){return slots[k];});
if(!(slot>=1&&slot<=PALETTE)||taken.indexOf(slot)>=0)slot=freeSlot(E.tools[e.tool],taken);
slots[e.tool]=slot;
}
shown.push({id:x.id,slot:slot});
});
return shown;
}
function marks(shown,E){
return shown.map(function(x){
var e=E.by[x.id],first=shown.filter(function(y){return E.by[y.id].tool===e.tool;}).reduce(function(a,y){return E.by[y.id].k<E.by[a.id].k?y:a;});
return{id:x.id,slot:x.slot,tool:e.tool,name:e.name,ring:first.id!==x.id};
});
}
function same(a,b){return a.length===b.length&&a.every(function(x,i){return x.id===b[i].id&&x.slot===b[i].slot;});}
function pageOf(total,page){
var pages=Math.max(1,Math.ceil(total/PAGE_ROWS)),at=Math.min(Math.max(page,0),pages-1);
return{page:at,pages:pages,from:at*PAGE_ROWS,to:Math.min(total,(at+1)*PAGE_ROWS)};
}
function rows(P,marksOn,cells){
var out=[];
P.list.forEach(function(p){
var cs=[];
marksOn.forEach(function(m){var c=cells[m.id]&&cells[m.id][p.id];if(c)cs.push({m:m,c:c});});
if(cs.length)out.push({p:p,cs:cs});
});
return out;
}
function rowHtml(r,href){
var lines="",dots="",said=[],tot=r.p.total;
r.cs.forEach(function(x){
var med=x.c[0],lo=100*x.c[1]/tot,hi=100*x.c[2]/tot,pct=med/tot*100,n=x.c[3];
var title=x.m.name+": "+fixed(pct,1)+"%, runs "+fixed(lo,1)+"% to "+fixed(hi,1)+"%";
lines+='<i class="wh c'+x.m.slot+'" data-tool="'+esc(x.m.tool)+'" style="--a:'+fixed(lo,2)+";--b:"+fixed(hi,2)+'"></i>';
dots+='<i class="dot c'+x.m.slot+(x.m.ring?" ring":"")+'" data-tool="'+esc(x.m.tool)+'" style="--x:'+fixed(pct,2)+'" title="'+esc(title)+'"></i>';
said.push("<li>"+esc(x.m.name)+": "+fixed(pct,1)+" percent, "+n+" "+plural(n,"run","runs")+", from "+fixed(lo,1)+" to "+fixed(hi,1)+" percent</li>");
});
return'<tr><th scope="row"><a class="pname" href="'+esc(href)+'">'+esc(r.p.name)+'</a><span class="sub">'+fmt(tot)+' branches</span></th>'+
'<td><div class="trk" aria-hidden="true">'+lines+dots+'</div><ul class="sr">'+said.join("")+"</ul></td></tr>";
}
return{PER_TOOL:PER_TOOL,PAGE_ROWS:PAGE_ROWS,esc:esc,fmt:fmt,plural:plural,fixed:fixed,parse:parse,format:format,Data:Data,
toolsOn:toolsOn,freeSlot:freeSlot,add:add,removeTool:removeTool,fromAddress:fromAddress,marks:marks,same:same,pageOf:pageOf,rows:rows,rowHtml:rowHtml};
});
