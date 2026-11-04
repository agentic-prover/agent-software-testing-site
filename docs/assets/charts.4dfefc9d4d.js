/*! SPDX-License-Identifier: Apache-2.0 | Copyright 2026 The Agent Software Testing authors */
(function(){
"use strict";
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return c==="&"?"&amp;":c==="<"?"&lt;":c===">"?"&gt;":c==='"'?"&quot;":"&#39;";});}
var NF=new Intl.NumberFormat("en-US");
function fmt(n){return n==null||isNaN(n)?"":NF.format(n);}
function clock(t){var h=Math.floor(t/3600),m=Math.round((t%3600)/60);return h+":"+(m<10?"0":"")+m;}
function hoursText(t){return Number((t/3600).toFixed(2))+" h";}
function wrapLabel(text,max){
var out=[],cur="";
text.split(" ").forEach(function(w){
if(cur&&(cur+" "+w).length>max){out.push(cur);cur=w;}else cur=cur?cur+" "+w:w;
});
if(cur)out.push(cur);
return out;
}
function dashClass(d){return d?" d"+d:"";}
function nameLines(n){var i=n.indexOf(", ");return i<0?[n,""]:[n.slice(0,i),n.slice(i+2)];}
function keyHTML(s){
return'<span class="keyswatch" aria-hidden="true"><svg viewBox="0 0 22 10"><line class="c'+s.k+dashClass(s.d)+'" x1="2" y1="5" x2="20" y2="5" stroke-width="2" stroke-linecap="round"/></svg></span>';
}
function niceTicks(max,want){
var raw=max/want,pow=Math.pow(10,Math.floor(Math.log10(raw))),f=raw/pow;
var step=(f<=1?1:f<=2?2:f<=2.5?2.5:f<=5?5:10)*pow;
var top=Math.ceil(max/step)*step,t=[],v;
for(v=0;v<=top+step/1000;v+=step)t.push(Math.round(v*1000)/1000);
return{step:step,top:top,ticks:t};
}
function Chart(host){
this.host=host;this.data=null;this.ids=[];this.idx=-1;this.tip=null;this.layout=null;
var self=this;
this._draw=function(){self.draw();};
if(window.ResizeObserver){
this.ro=new ResizeObserver(function(){if(self._raf)cancelAnimationFrame(self._raf);self._raf=requestAnimationFrame(self._draw);});
this.ro.observe(host);
}
host.addEventListener("keydown",function(e){self.key(e);});
document.addEventListener("keydown",function(e){if(e.key==="Escape"&&self.tip&&self.tip.classList.contains("on"))self.hide();});
host.addEventListener("blur",function(){self.hide();});
host.addEventListener("focus",function(){if(self.layout&&self.idx<0)self.show(self.layout.n-1,true);});
}
Chart.prototype.set=function(data,ids,range){this.data=data;this.ids=ids;this.range=range==="2h"?"2h":"full";this.idx=-1;this.draw();};
Chart.prototype.draw=function(){
var host=this.host,W=host.clientWidth,H=host.clientHeight,D=this.data;
if(!D||!W||!H)return;
var series=[],self=this;
this.ids.forEach(function(id){var b=D.series[id];if(b)series.push({id:id,s:b,b:b});});
if(!series.length){
host.innerHTML='<div class="empty">No coverage curves in this selection for '+esc(D.name)+". Final coverage is in the table below.</div>";
this.layout=null;this.tip=null;return;
}
var wide=W>=680,m={l:50,r:wide?160:14,t:22,b:28};
var pw=W-m.l-m.r,ph=H-m.t-m.b,nAll=Math.max.apply(null,series.map(function(x){return x.b.med.length;})),n=this.range==="2h"?Math.min(nAll,9):nAll;
var ymax=0;
series.forEach(function(x){
x.len=Math.min(n,x.b.med.length);
x.start=x.b.med[0]===0&&x.b.hi[0]===0&&x.len>1?1:0;
for(var q=x.start;q<x.len;q++)if(x.b.hi[q]>ymax)ymax=x.b.hi[q];
});
var nt=niceTicks(ymax*1.04,5),top=nt.top;
var X=function(i){return m.l+pw*i/(n-1);};
var Y=function(v){return m.t+ph-ph*v/top;};
var out='<svg viewBox="0 0 '+W+" "+H+'" width="'+W+'" height="'+H+'" role="img" aria-label="Line chart: covered branches against campaign time for '+esc(D.name)+'. The table view has the values."><g class="ax">';
nt.ticks.forEach(function(v){
out+='<line class="'+(v===0?"b":"g")+'" x1="'+m.l+'" x2="'+(m.l+pw)+'" y1="'+Y(v).toFixed(1)+'" y2="'+Y(v).toFixed(1)+'"/><text x="'+(m.l-8)+'" y="'+(Y(v)+4).toFixed(1)+'" text-anchor="end">'+fmt(v)+"</text>";
});
var xstep=n<=9?(W<520?4:2):(W<520?8:4),i;
for(i=0;i<n;i+=xstep){
out+='<text x="'+X(i).toFixed(1)+'" y="'+(H-8)+'" text-anchor="'+(i===0?"start":i===n-1?"end":"middle")+'">'+(D.t[i]/3600)+" h</text>";
}
out+='<text class="cap" x="0" y="10">Covered branches</text></g>';
series.forEach(function(x){
var up="",dn="";
for(i=x.start;i<x.len;i++)up+=(i>x.start?"L":"M")+X(i).toFixed(1)+" "+Y(x.b.hi[i]).toFixed(1);
for(i=x.len-1;i>=x.start;i--)dn+="L"+X(i).toFixed(1)+" "+Y(x.b.lo[i]).toFixed(1);
out+='<path class="band-a c'+x.s.k+'" data-id="'+esc(x.id)+'" d="'+up+dn+'Z"/>';
});
series.forEach(function(x){
var d="";
for(i=x.start;i<x.len;i++)d+=(i>x.start?"L":"M")+X(i).toFixed(1)+" "+Y(x.b.med[i]).toFixed(1);
out+='<path class="ln c'+x.s.k+dashClass(x.s.d)+'" data-id="'+esc(x.id)+'" d="'+d+'"/>';
});
var ends=series.map(function(x){
return{x:x,y:Y(x.b.med[x.len-1]),lines:wrapLabel(x.s.n,24)};
}).sort(function(a,b){return a.y-b.y;});
var dots="",labelled="",LH=13,top0=m.t-4,bot0=m.t+ph+6;
if(wide){
var k;
for(k=0;k<ends.length;k++){
ends[k].h=ends[k].lines.length*LH;
ends[k].ly=Math.max(ends[k].y,k?ends[k-1].ly+(ends[k-1].h+ends[k].h)/2+1:top0+ends[k].h/2);
}
for(k=ends.length-1;k>=0;k--){
var lim=k===ends.length-1?bot0-ends[k].h/2:ends[k+1].ly-(ends[k+1].h+ends[k].h)/2-1;
if(ends[k].ly>lim)ends[k].ly=lim;
}
}
var ex=X(n-1);
ends.forEach(function(e){
var own=X(e.x.len-1);
var dot='<circle class="dotr c'+e.x.s.k+'" data-id="'+esc(e.x.id)+'" cx="'+own.toFixed(1)+'" cy="'+e.y.toFixed(1)+'" r="4"/>';
if(wide){
var lead=Math.abs(e.ly-e.y)>2||own<ex?'<path class="leader" data-id="'+esc(e.x.id)+'" d="M'+(own+5).toFixed(1)+" "+e.y.toFixed(1)+"L"+(ex+11).toFixed(1)+" "+e.ly.toFixed(1)+'"/>':"";
var y0=e.ly-(e.lines.length-1)*LH/2+4,tx=(ex+14).toFixed(1),tsp="";
e.lines.forEach(function(ln,q){tsp+='<tspan x="'+tx+'"'+(q?' dy="'+LH+'"':"")+">"+esc(ln)+"</tspan>";});
labelled+=dot+lead+'<text class="endlab" data-id="'+esc(e.x.id)+'" x="'+tx+'" y="'+y0.toFixed(1)+'">'+tsp+"</text>";
}else dots+=dot;
});
out+=dots+labelled;
out+='<g class="hv" style="visibility:hidden"><line class="cross" y1="'+m.t+'" y2="'+(m.t+ph)+'" x1="0" x2="0"/>';
series.forEach(function(x){out+='<circle class="dotr hd c'+x.s.k+'" r="4" cx="0" cy="0"/>';});
out+='</g><rect class="ov" x="'+m.l+'" y="'+m.t+'" width="'+pw+'" height="'+ph+'"/></svg>';
host.innerHTML=out;
var tip=document.createElement("div");tip.className="tip";tip.setAttribute("aria-hidden","true");host.appendChild(tip);
this.tip=tip;
this.layout={W:W,H:H,m:m,pw:pw,ph:ph,n:n,X:X,Y:Y,series:series};
host.setAttribute("role","slider");host.setAttribute("tabindex","0");host.setAttribute("aria-label","Campaign time");host.setAttribute("aria-describedby","chart-help");
host.setAttribute("aria-valuemin","0");host.setAttribute("aria-valuemax",String(n-1));
if(this.idx<0||this.idx>n-1){this.idx=-1;host.setAttribute("aria-valuenow",String(n-1));host.setAttribute("aria-valuetext",this.reading(n-1));}
if(this.hot)this.highlight(this.hot);
var ov=host.querySelector(".ov");
function at(e){
var r=ov.getBoundingClientRect(),t=(e.clientX-r.left)/r.width;
return Math.max(0,Math.min(n-1,Math.round(t*(n-1))));
}
ov.addEventListener("pointermove",function(e){self.show(at(e),false);});
ov.addEventListener("pointerdown",function(e){self.show(at(e),false);});
ov.addEventListener("pointerleave",function(){if(document.activeElement!==host)self.hide();});
if(this.idx>=0)this.show(this.idx,true);
};
Chart.prototype.show=function(i,fromKey){
var L=this.layout;if(!L)return;
this.idx=i;
var hv=this.host.querySelector(".hv"),line=hv.querySelector(".cross"),dots=hv.querySelectorAll(".hd");
var x=L.X(i),D=this.data;
hv.style.visibility="visible";
line.setAttribute("x1",x);line.setAttribute("x2",x);
var rows=[];
L.series.forEach(function(s,k){
if(i<s.start||i>=s.len){dots[k].style.visibility="hidden";return;}
dots[k].style.visibility="";dots[k].setAttribute("cx",x);dots[k].setAttribute("cy",L.Y(s.b.med[i]));
rows.push({s:s.s,v:s.b.med[i],lo:s.b.lo[i],hi:s.b.hi[i]});
});
rows.sort(function(a,b){return b.v-a.v;});
var tip=this.tip;while(tip.firstChild)tip.removeChild(tip.firstChild);
var th=document.createElement("div");th.className="th";th.textContent="Campaign time "+hoursText(D.t[i]);tip.appendChild(th);
rows.forEach(function(r){
var tr=document.createElement("div");tr.className="tr";
var key=document.createElement("span");key.innerHTML=keyHTML(r.s);tr.appendChild(key.firstChild);
var nl=nameLines(r.s.n),nm=document.createElement("span");nm.className="n";nm.textContent=nl[0]+" ";
var sm=document.createElement("small");sm.textContent=nl[1];nm.appendChild(sm);tr.appendChild(nm);
var v=document.createElement("span");v.className="x";v.textContent=fmt(r.v);tr.appendChild(v);
if(r.lo!==r.hi){var rg=document.createElement("span");rg.className="r";rg.textContent=fmt(r.lo)+"–"+fmt(r.hi);tr.appendChild(rg);}
tip.appendChild(tr);
});
tip.classList.add("on");
var tw=tip.offsetWidth,th2=tip.offsetHeight,left=x+14;
if(left+tw>L.W-4)left=x-tw-14;
if(left<4)left=4;
var topPos=Math.max(4,Math.min(L.H-th2-4,L.m.t+6));
tip.style.left=left+"px";tip.style.top=topPos+"px";
this.host.setAttribute("aria-valuenow",String(i));this.host.setAttribute("aria-valuetext",this.reading(i));
};
Chart.prototype.reading=function(i){
var L=this.layout,D=this.data;if(!L||!D)return"";
var rows=L.series.filter(function(s){return i>=s.start&&i<s.len;}).map(function(s){return{s:s.s,v:s.b.med[i]};}).sort(function(a,b){return b.v-a.v;});
return"Campaign time "+clock(D.t[i])+": "+rows.map(function(r){return r.s.n+" "+fmt(r.v);}).join(", ");
};
Chart.prototype.highlight=function(id){
this.hot=id||null;
var els=this.host.querySelectorAll("[data-id]"),k,e;
for(k=0;k<els.length;k++){
e=els[k];
e.classList.toggle("dim",!!id&&e.getAttribute("data-id")!==id);
e.classList.toggle("hot",!!id&&e.getAttribute("data-id")===id&&e.classList.contains("ln"));
}
};
Chart.prototype.hide=function(){
var hv=this.host.querySelector(".hv");if(hv)hv.style.visibility="hidden";
if(this.tip)this.tip.classList.remove("on");
this.idx=-1;
};
Chart.prototype.key=function(e){
var L=this.layout;if(!L)return;
var i=this.idx<0?L.n-1:this.idx,k=e.key;
if(k==="ArrowRight")i=Math.min(L.n-1,i+1);
else if(k==="ArrowLeft")i=Math.max(0,i-1);
else if(k==="Home")i=0;
else if(k==="End")i=L.n-1;
else if(k==="Escape"){this.hide();return;}
else return;
e.preventDefault();this.show(i,true);
};
Chart.prototype.destroy=function(){if(this.ro)this.ro.disconnect();this.host.innerHTML="";};
function timeTable(D,ids){
var cols=[];
ids.forEach(function(id){if(D.series[id])cols.push({id:id,s:D.series[id]});});
if(!cols.length)return'<p class="muted pad">No coverage curves in this selection.</p>';
var h='<div class="tbl-wrap" tabindex="0" role="region" aria-label="Median covered branches at each checkpoint"><table class="tbl fit"><caption class="sr">Median covered branches of the selected tools at each checkpoint</caption><thead><tr><th class="sticky" scope="col">Time</th>';
cols.forEach(function(c){var nl=nameLines(c.s.n);h+='<th class="r" scope="col"><span class="th-top">'+esc(nl[0])+'</span><span class="th-sub">'+esc(nl[1])+"</span></th>";});
h+="</tr></thead><tbody>";
D.t.forEach(function(t,i){
h+='<tr><th class="sticky num" scope="row">'+clock(t)+"</th>";
cols.forEach(function(c){if(i>=c.s.med.length){h+='<td class="num r"><span class="muted">–</span></td>';return;}h+='<td class="num r">'+fmt(c.s.med[i])+(c.s.lo[i]!==c.s.hi[i]?' <span class="muted small">'+fmt(c.s.lo[i])+"–"+fmt(c.s.hi[i])+"</span>":"")+"</td>";});
h+="</tr>";
});
return h+"</tbody></table></div>";
}
window.CRChart={Chart:Chart,timeTable:timeTable};
})();
