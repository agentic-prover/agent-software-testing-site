/*! SPDX-License-Identifier: Apache-2.0 | Copyright 2026 The Agent Software Testing authors */
(function(global){
"use strict";
var VERSION="0.1";
var uid=0;
function el(tag,cls,text){
var e=document.createElement(tag);
if(cls)e.className=cls;
if(text!=null)e.textContent=text;
return e;
}
var NF=new Intl.NumberFormat("en-US");
var WHY="Available when all tools are shown";
function fmt(n){return NF.format(n);}
function pct(a,b){return b?(100*a/b).toFixed(1)+"%":"0.0%";}
function clamp(x,lo,hi){return x<lo?lo:x>hi?hi:x;}
function plural(n,one,many){return n===1?one:many;}
function classesFor(S){
var out=[],c,m,base,extra,lo,k,size;
if(S<=5){for(c=1;c<=S;c++)out.push([c,c]);return out;}
out.push([1,1]);
m=S-2;base=Math.floor(m/3);extra=m%3;lo=2;
for(k=0;k<3;k++){size=base+(k<extra?1:0);out.push([lo,lo+size-1]);lo+=size;}
out.push([S,S]);
return out;
}
function rampIndex(n,i){return n<=1?4:Math.floor(i*4/(n-1)+0.5);}
function classLabel(S,lo,hi){
if(lo!==hi)return lo+" to "+hi;
return lo===1?"1 tool":(lo===S&&S>2?"all "+S:lo+" tools");
}
function seg(start,count,k){
var lo=0,hi=count-1,mid;
while(lo<hi){
mid=(lo+hi+1)>>1;
if(start[mid]<=k)lo=mid;else hi=mid-1;
}
return lo;
}
function easing(css){
var m=/cubic-bezier\(([^)]+)\)/.exec(css),p=m?m[1].split(",").map(parseFloat):[],i;
function at(t,a,b){return 3*a*(1-t)*(1-t)*t+3*b*(1-t)*t*t+t*t*t;}
for(i=0;i<4;i++)if(!(p[i]>=-2&&p[i]<=3))return function(x){return x;};
return function(x){
var lo=0,hi=1,t=x,k;
for(k=0;k<18;k++){t=(lo+hi)/2;if(at(t,p[0],p[2])<x)lo=t;else hi=t;}
return at(t,p[1],p[3]);
};
}
var colourProbe=null;
function parseColour(str,fallback){
if(!colourProbe)colourProbe=document.createElement("canvas").getContext("2d");
try{
colourProbe.fillStyle="black";
colourProbe.fillStyle=str;
var v=colourProbe.fillStyle;
var m;
if((m=/^#([0-9a-f]{6})$/i.exec(v))){
var n=parseInt(m[1],16);
return[(n>>16)&255,(n>>8)&255,n&255];
}
if((m=/^rgba?\(([^)]+)\)/i.exec(v))){
var p=m[1].split(",").map(parseFloat);
return[p[0],p[1],p[2]];
}
}catch(e){}
return fallback||[128,128,128];
}
function rgb(c){return"rgb("+Math.round(c[0])+","+Math.round(c[1])+","+Math.round(c[2])+")";}
function lerp(a,b,t){return[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];}
function ramp(anchors,t){
var k=anchors.length-1,x=clamp(t,0,1)*k,i=Math.min(k-1,Math.floor(x));
return lerp(anchors[i],anchors[i+1],x-i);
}
function undelta(arr){
var out=new Int32Array(arr.length),sum=0;
for(var i=0;i<arr.length;i++){sum+=arr[i];out[i]=sum;}
return out;
}
function typed(arr,max){
var T=max>65535?Int32Array:max>255?Uint16Array:Uint8Array;
var out=new T(arr.length);
for(var i=0;i<arr.length;i++)out[i]=arr[i];
return out;
}
function Reader(data){
this.d=data;
var n=this.n=data.total;
this.S=data.systems.length;
this.F=data.files.length;
this.sel=-1;
this.mask=typed(data.mask,(1<<this.S)-1);
this.lines=data.lines_encoding==="delta"?undelta(data.lines):typed(data.lines,1<<30);
this.branches=typed(data.branches,1<<30);
this.blocks=data.blocks?typed(data.blocks,1<<30):null;
this.fileStart=new Int32Array(this.F+1);
this.fileName=[];
for(var f=0;f<this.F;f++){
this.fileStart[f]=data.files[f].start;
this.fileName.push(data.files[f].name);
}
this.fileStart[this.F]=n;
this.cnt=new Uint8Array(n);
for(var i=0;i<n;i++){
var m=this.mask[i],c=0;
while(m){m&=m-1;c++;}
this.cnt[i]=c;
}
}
function View(root,data,opts){
Reader.call(this,data);
this.id="bm"+(++uid);
this.root=root;
this.o={
minCell:2,maxCell:7,cell:0,targetHeight:null,mark:true,reveal:true,phoneCell:6,phoneWidth:452,
name:data.name||data.program,dataUrl:"",fullRuns:3,onChange:null
};
for(var k in opts)if(Object.prototype.hasOwnProperty.call(opts,k)&&opts[k]!==undefined)this.o[k]=opts[k];
var n=this.n,i;
this.cl=classesFor(this.S);
this.K=this.cl.length;
this.cOf=new Uint8Array(this.S+1);
for(var q=0;q<this.K;q++)for(var cc=this.cl[q][0];cc<=this.cl[q][1];cc++)this.cOf[cc]=q+1;
var bs=this.bs=new Int32Array(this.K+2),fill;
for(i=0;i<n;i++)bs[this.cOf[this.cnt[i]]+1]++;
for(q=0;q<=this.K;q++)bs[q+1]+=bs[q];
fill=bs.slice();
this.ord=new Uint32Array(n);this.rk=new Uint32Array(n);
for(i=0;i<n;i++){q=fill[this.cOf[this.cnt[i]]]++;this.ord[q]=i;this.rk[i]=q;}
this.focus=-1;
this.hover=-1;this.hoverFile=-1;
this.pin=-1;
this.mark=!!this.o.mark;
this.grp=new Uint8Array(n);
this.cls=new Uint8Array(n);
this.uniqueIdx=new Int32Array(0);
this.fileStats=null;
this.W=0;this.dpr=1;this.rawDpr=0;
this.painted=0;
this.stats={cells:n,cell:0,layoutMs:0,paintMs:0};
this._raf=0;this._revealRaf=0;this._revealed=false;this._dead=false;
this.arr="src";
this.lay=null;this.anim=null;this.fade=null;this.fadeTimer=0;this.slow=0;this.sh=0;this.bh=0;
this._build();
this._readTokens();
this._recolor();
this._bind();
this._relayout(true);
}
View.prototype=Object.create(Reader.prototype);
View.prototype.constructor=View;
Reader.prototype._fileOf=function(idx){return seg(this.fileStart,this.F,idx);};
View.prototype._build=function(){
var self=this,d=this.d,id=this.id;
var root=this.root;
while(root.firstChild)root.removeChild(root.firstChild);
root.classList.add("bm");
root.setAttribute("data-program",d.program);
var q=el("div","bm-q");
root.appendChild(q);
var layout=el("div","bm-layout");
q.appendChild(layout);
var side=el("div","bm-side");
layout.appendChild(side);
var fs=el("fieldset","bm-radios");
fs.appendChild(el("legend",null,"Show"));
var head=el("div","bm-tools-head");
head.setAttribute("aria-hidden","true");
head.appendChild(el("span",null,"Tool"));
var unionHead=el("span",null,"Union of runs");
unionHead.title="The share of branches that a tool reaches over all its runs";
head.appendChild(unionHead);
head.appendChild(el("span",null,"Reached by this tool only"));
fs.appendChild(head);
this.radios=[];
this.rows=[];
var self2=this;
function addRadio(value,label,note,reachText,uniqText){
var lab=el("label","bm-tool");
var inp=document.createElement("input");
inp.type="radio";inp.name=id+"-tool";inp.value=String(value);
inp.setAttribute("aria-label",label+(note?", "+note.toLowerCase():"")+": reaches "+reachText+" of the branches over all its runs, "+uniqText+" reached by it alone");
var nm=el("span","bm-tool-name",label);
if(note)nm.appendChild(el("span","bm-tool-note",note));
lab.appendChild(inp);lab.appendChild(nm);
self2.rows.push(lab);
lab.appendChild(el("span","bm-tool-n",reachText));
lab.appendChild(el("span","bm-tool-u"+(uniqText==="0"?" is-zero":""),uniqText));
fs.appendChild(lab);
inp.addEventListener("change",function(){if(inp.checked)self2.select(value<0?null:value);});
self2.radios.push(inp);
}
var sum=d.summary,reachedAny=this.n-sum.none,uniqAll=0;
for(var s=0;s<this.S;s++)uniqAll+=sum.unique[d.systems[s]];
addRadio(-1,"All tools",this.S+" "+plural(this.S,"tool","tools")+" together",
pct(reachedAny,this.n),fmt(uniqAll));
for(var t=0;t<this.S;t++){
var sid=d.systems[t];
var note=d.runs[t]<this.o.fullRuns?"Union of "+d.runs[t]+" "+plural(d.runs[t],"run","runs")+" only":"";
addRadio(t,d.labels[t],note,pct(sum.reached[sid],this.n),fmt(sum.unique[sid]));
}
side.appendChild(fs);
var selWrap=el("div","bm-select-wrap");
var selLab=el("label","bm-field","Show");
selLab.setAttribute("for",id+"-select");
var select=document.createElement("select");
select.id=id+"-select";
var o0=el("option",null,"All tools");o0.value="-1";select.appendChild(o0);
for(var u=0;u<this.S;u++){
var op=el("option",null,d.labels[u]);op.value=String(u);select.appendChild(op);
}
select.addEventListener("change",function(){var v=parseInt(select.value,10);self.select(v<0?null:v);});
selWrap.appendChild(selLab);selWrap.appendChild(select);
side.appendChild(selWrap);
this.select_=select;
var optLab=el("label","bm-opt");
var chk=document.createElement("input");
chk.type="checkbox";chk.checked=this.mark;
chk.addEventListener("change",function(){self.setMark(chk.checked);});
optLab.appendChild(chk);
optLab.appendChild(el("span",null,"Mark branches that only one tool reaches"));
side.appendChild(optLab);
this.markBox=chk;
var main=el("div","bm-main");
layout.appendChild(main);
this.summaryEl=el("p","bm-summary");
this.summaryEl.id=id+"-summary";
main.appendChild(this.summaryEl);
this.statusEl=el("p","bm-sr");
this.statusEl.setAttribute("role","status");
this.statusEl.setAttribute("aria-live","polite");
main.appendChild(this.statusEl);
this.legendTitle=el("p","bm-legend-title");
main.appendChild(this.legendTitle);
this.legendEl=el("ul","bm-legend");
this.legendEl.setAttribute("role","toolbar");
this.legendEl.setAttribute("aria-label","Highlight branches on the map by who reaches them");
this.lgIdx=0;
main.appendChild(this.legendEl);
var skip=el("a","bm-skip","Skip the map");
skip.href="#"+id+"-after";
main.appendChild(skip);
var order=el("div","bm-order"),nm=id+"-arr";
order.appendChild(el("span","bm-order-k","Cells arranged"));
this.orderEl=el("div","seg");
this.orderEl.setAttribute("role","radiogroup");
this.orderEl.setAttribute("aria-label","Arrange the cells");
this.orderEl.innerHTML='<label><input type="radio" name="'+nm+'" value="src" checked><span>By source file</span></label>'+
'<label><input type="radio" name="'+nm+'" value="reach"><span>By tools reaching</span></label>';
function why(){if(self.sel>=0)self._say(WHY);}
this.orderEl.addEventListener("click",function(e){if(self.sel>=0){e.preventDefault();if(e.detail)why();}});
this.orderEl.addEventListener("keydown",function(e){if(e.key===" "||e.key==="Enter")why();});
this.orderEl.addEventListener("change",function(e){self.arrange(e.target.value);});
order.appendChild(this.orderEl);
main.appendChild(order);
var frame=this.frame=el("div","bm-frame");
main.appendChild(frame);
this.holder=el("div","bm-holder");
frame.appendChild(this.holder);
this.stage=el("div","bm-stage");
this.stage.tabIndex=0;
this.stage.setAttribute("role","application");
this.stage.setAttribute("aria-roledescription","branch map");
this.stage.setAttribute("aria-label","Branch map of "+this.o.name+". Arrow keys move between branches.");
this.stage.setAttribute("aria-describedby",this.summaryEl.id);
this.holder.appendChild(this.stage);
this.base=document.createElement("canvas");
this.base.setAttribute("aria-hidden","true");
this.stage.appendChild(this.base);
this.band=el("div","bm-band");this.band.hidden=true;
this.ringHover=el("div","bm-ring");this.ringHover.hidden=true;
this.cursor=el("div","bm-ring bm-cursor");this.cursor.hidden=true;
this.stage.appendChild(this.band);
this.stage.appendChild(this.ringHover);
this.stage.appendChild(this.cursor);
this.bctx=this.base.getContext("2d",{alpha:true});
var touch=!!(window.matchMedia&&window.matchMedia("(pointer: coarse)").matches)||(window.innerWidth||1000)<720;
this.hint=el("p","bm-hint",touch?"Tap a cell to pin it.":"Click a cell to pin it.");
this.hint.id=id+"-after";this.hint.tabIndex=-1;
main.appendChild(this.hint);
this.inspector=el("div","bm-inspector");
main.appendChild(this.inspector);
this.tablesEl=el("details","bm-tables");
this.tablesEl.addEventListener("toggle",function(){if(self.tablesEl.open&&self._tablesStale)self._updateTables();});
var sm=el("summary",null,"Table view");
this.tablesEl.appendChild(sm);
this.tablesBody=el("div");
this.tablesEl.appendChild(this.tablesBody);
main.appendChild(this.tablesEl);
this.tip=el("div","bm-tip");
this.tip.setAttribute("role","tooltip");
this.tip.hidden=true;
root.appendChild(this.tip);
};
View.prototype._readTokens=function(){
var cs=getComputedStyle(this.root);
function tok(name,fb){var v=cs.getPropertyValue(name).trim();return v||fb;}
var T=this.tok={
surface:tok("--bm-surface","Canvas"),ink:tok("--bm-ink","CanvasText"),sep:tok("--bm-sep","LightGray"),
empty:tok("--bm-empty","Gainsboro"),none:tok("--bm-none","GrayText"),dim:tok("--bm-dim","WhiteSmoke"),unique:tok("--bm-unique","OrangeRed"),
dot:tok("--bm-unique-dot","Canvas"),selected:tok("--bm-selected","SteelBlue"),ghost:tok("--bm-ghost","LightSteelBlue"),
noneFocus:tok("--bm-none-focus","GrayText"),focus:tok("--bm-focus","SteelBlue"),ink2:tok("--bm-ink-2","GrayText")
};
var a=[],key=[];
for(var i=1;i<=5;i++)a.push(parseColour(tok("--bm-ramp-"+i,"SteelBlue")));
T.anchors=a;
this.theme=cs.getPropertyValue("color-scheme").trim();
for(var k in T)if(typeof T[k]==="string")key.push(T[k]);
this._tokKey=key.join("|")+"|"+a.join(";");
};
View.prototype._styles=function(){
var K=this.K,T=this.tok,st=new Array(K+6),i;
st[0]=T.none;
for(i=1;i<=K;i++)st[i]=rgb(T.anchors[rampIndex(K,i-1)]);
st[K+1]=T.unique;st[K+2]=T.selected;st[K+3]=T.ghost;st[K+4]=T.dim;st[K+5]=T.noneFocus;
return st;
};
View.prototype._recolor=function(){
var n=this.n,S=this.S,mask=this.mask,cnt=this.cnt,grp=this.grp,cls=this.cls;
var sel=this.sel,bit=sel>=0?(1<<sel):0,i,g;
var ng=sel>=0?4:S+1;
this.groupCount=new Int32Array(ng);
var fs=this.fileStart,F=this.F;
var fst=new Int32Array(F*ng);
var uidx=[];
var f=0;
for(i=0;i<n;i++){
while(i>=fs[f+1])f++;
if(sel>=0){
var m=mask[i],inSel=(m&bit)!==0,others=(m&~bit)!==0;
g=inSel?(others?2:3):(others?1:0);
}else g=cnt[i];
grp[i]=g;
this.groupCount[g]++;
fst[f*ng+g]++;
if((sel>=0&&g===3)||(sel<0&&g===1))uidx.push(i);
}
this.fileStats=fst;this.ng=ng;
this.uniqueIdx=Int32Array.from(uidx);
this._classify();
};
View.prototype._classify=function(){
var n=this.n,S=this.S,K=this.K,grp=this.grp,cls=this.cls,sel=this.sel,focus=this.focus,mark=this.mark,cOf=this.cOf;
var map=new Uint8Array(sel>=0?4:S+1),g,fc;
if(sel>=0){map[0]=0;map[1]=K+3;map[2]=K+2;map[3]=mark?K+1:K+2;}
else{for(g=0;g<=S;g++)map[g]=cOf[g];}
for(var i=0;i<n;i++){
g=grp[i];
if(focus>=0){fc=sel>=0?g:cOf[g];cls[i]=fc===focus?(fc===0?K+5:map[g]):K+4;}
else cls[i]=map[g];
}
this.styles=this._styles();
this.legendMap=map;
};
View.prototype._layoutFor=function(c,W){
var perRow=Math.max(1,Math.floor(W/c)),gap=c<=3?3:c,F=this.F,fs=this.fileStart;
var fy=new Int32Array(F),rows=new Int32Array(F),y=0;
for(var f=0;f<F;f++){
var cnt=fs[f+1]-fs[f],r=Math.ceil(cnt/perRow);
fy[f]=y;rows[f]=r;y+=r*c+gap;
}
return{c:c,perRow:perRow,gap:gap,fy:fy,rows:rows,height:Math.max(0,y-gap)};
};
View.prototype._chooseLayout=function(W){
var o=this.o,L,c;
if(o.cell)return this._layoutFor(o.cell,W);
if(o.phoneCell&&W<o.phoneWidth)return this._layoutFor(o.phoneCell,W);
var target=typeof o.targetHeight==="function"?o.targetHeight(W):
(o.targetHeight||clamp(Math.round(W*0.8),320,680));
for(c=o.maxCell;c>=o.minCell;c--){
L=this._layoutFor(c,W);
if(L.height<=target)return L;
}
return L;
};
var MAX_PIXELS=8e6;
View.prototype._relayout=function(first){
if(this._dead)return;
var W=Math.floor(this.holder.clientWidth);
var raw=window.devicePixelRatio||1;
if(W<40)return;
if(!first&&W===this.W&&raw===this.rawDpr)return;
var t0=performance.now();
this._stop();
this.W=W;this.rawDpr=raw;
var L=this._chooseLayout(W);
this.c=L.c;this.perRow=L.perRow;this.gap=L.gap;this.fy=L.fy;this.frows=L.rows;this.H=L.height;
this.s=L.c>=4?L.c-1:L.c;
var F=this.F,bt=new Int32Array(F);
for(var f=0;f<F;f++)bt[f]=f===0?0:L.fy[f]-L.gap;
this.bandTop=bt;
this.src={start:this.fileStart,y:L.fy,top:bt,rows:L.rows,nseg:F,h:L.height,ord:null,rk:null,px:null};
this.rch=this._bands(L);
this.lay=this.arr==="reach"?this.rch:this.src;
var cssW=this.perRow*this.c,cssH=Math.max(1,this.H,this.rch.h);
var dpr=this.dpr=Math.min(raw,Math.max(1,Math.sqrt(MAX_PIXELS/(cssW*cssH))));
this.big=this.n>12000||cssW*cssH*raw*raw>MAX_PIXELS;
var cx=new Int32Array(this.perRow),cw=new Int32Array(this.perRow);
for(var k=0;k<this.perRow;k++){
var x0=Math.round(k*this.c*dpr),x1=Math.round((k*this.c+this.s)*dpr);
cx[k]=x0;cw[k]=Math.max(1,x1-x0);
}
this.colX=cx;this.colW=cw;
this.stage.style.width=cssW+"px";
this.bh=cssH;
this.base.width=Math.round(cssW*dpr);
this.base.height=Math.round(cssH*dpr);
this.base.style.width=cssW+"px";
this.base.style.height=cssH+"px";
this.sh=0;this.slow=0;
this._size(this.lay.h);
this.stats.layoutMs=performance.now()-t0;
this.stats.cell=this.c;
this.stats.pixels=this.base.width*this.base.height;
this.painted=0;
this._cancelReveal();
this._draw();
};
View.prototype._bands=function(L){
var bs=this.bs,start=[0],y=[],rows=[],top=[],at=0,b,k,r;
for(b=0;b<=this.K;b++){
k=bs[b+1]-bs[b];
if(!k)continue;
r=Math.ceil(k/L.perRow);
top.push(y.length?at-L.gap:0);y.push(at);rows.push(r);start.push(bs[b+1]);
at+=r*L.c+L.gap;
}
return{start:Int32Array.from(start),y:y,top:top,rows:rows,nseg:y.length,h:Math.max(0,at-L.gap),ord:this.ord,rk:this.rk,px:null};
};
View.prototype._size=function(h){
h=Math.max(1,h);
if(h===this.sh)return false;
this.sh=h;
this.stage.style.height=h+"px";
return true;
};
View.prototype._keepPin=function(){
var f=this.frame,c=this.cursor,a,b;
if(this.pin<0||c.hidden||f.scrollHeight<=f.clientHeight)return;
a=c.getBoundingClientRect();b=f.getBoundingClientRect();
if(a.top<b.top||a.bottom>b.bottom)f.scrollTop+=(a.top+a.bottom-b.top-b.bottom)/2;
};
View.prototype._px=function(L){
if(L.px)return L.px;
var n=this.n,x=new Float32Array(n),y=new Float32Array(n),pr=this.perRow,c=this.c,dpr=this.dpr,cx=this.colX,f,k,l,i,r;
for(f=0;f<L.nseg;f++){
for(k=L.start[f],l=0;k<L.start[f+1];k++,l++){
i=L.ord?L.ord[k]:k;r=(l/pr)|0;
x[i]=cx[l-r*pr];y[i]=Math.round((L.y[f]+r*c)*dpr);
}
}
return(L.px={x:x,y:y});
};
View.prototype._paint=function(from,to){
var ctx=this.bctx,dpr=this.dpr,c=this.c,s=this.s,perRow=this.perRow;
var cx=this.colX,cw=this.colW,cls=this.cls,styles=this.styles,last=-1;
var L=this.lay,fs=L.start,F=L.nseg,fy=L.y,ord=L.ord;
var merge=s===c,runK=-1,runX=0,runEnd=0,runY=0,runH=0;
function flush(){
if(runK<0)return;
if(runK!==last){ctx.fillStyle=styles[runK];last=runK;}
ctx.fillRect(runX,runY,runEnd-runX,runH);
runK=-1;
}
var f=seg(fs,F,from);
for(;f<F&&fs[f]<to;f++){
var base=fs[f],l0=Math.max(base,from)-base,l1=Math.min(fs[f+1],to)-base;
var row=(l0/perRow)|0,col=l0-row*perRow;
var ya=fy[f]+row*c,y0=Math.round(ya*dpr),y1=Math.round((ya+s)*dpr);
for(var l=l0;l<l1;l++){
var k=cls[ord?ord[base+l]:base+l];
if(merge){
if(k===runK)runEnd=cx[col]+cw[col];
else{flush();runK=k;runX=cx[col];runEnd=runX+cw[col];runY=y0;runH=y1-y0;}
}else{
if(k!==last){ctx.fillStyle=styles[k];last=k;}
ctx.fillRect(cx[col],y0,cw[col],y1-y0);
}
if(++col===perRow){
if(merge)flush();
col=0;row++;
ya=fy[f]+row*c;y0=Math.round(ya*dpr);y1=Math.round((ya+s)*dpr);
}
}
if(merge)flush();
}
};
View.prototype._paintUnique=function(cur){
if(!this.mark||!this.uniqueIdx.length)return;
var ctx=this.bctx,dpr=this.dpr,u=this.uniqueIdx,c=this.c,s=this.s,perRow=this.perRow,K=this.K,T=this.tok,all=this.sel<0;
var L=this.lay,cx=this.colX,cw=this.colW,fy=L.y,fs=L.start,rk=L.rk,cls=this.cls,dim=K+4;
var lw=Math.max(1,Math.round(dpr)),size=Math.max(1,Math.round(2*dpr));
var n=u.length,xs=new Int32Array(n),ys=new Int32Array(n),ws=new Int32Array(n),hs=new Int32Array(n),m=0,f=0,k;
for(var j=0;j<n;j++){
var idx=u[j];
if(cls[idx]===dim)continue;
if(cur){
xs[m]=Math.round(cur.x[idx]);ys[m]=Math.round(cur.y[idx]);ws[m]=hs[m]=cur.size;
}else{
var rank=rk?rk[idx]:idx;
while(rank>=fs[f+1])f++;
var l=rank-fs[f],r=(l/perRow)|0,col=l-r*perRow,ya=(fy[f]+r*c)*dpr;
xs[m]=cx[col];ws[m]=cw[col];ys[m]=Math.round(ya);hs[m]=Math.round(ya+s*dpr)-ys[m];
}
m++;
}
if(all){
ctx.fillStyle=T.unique;
for(k=0;k<m;k++)ctx.fillRect(xs[k],ys[k],ws[k],hs[k]);
ctx.fillStyle=this.styles[this.cOf[1]];
for(k=0;k<m;k++)if(ws[k]>2*lw&&hs[k]>2*lw)ctx.fillRect(xs[k]+lw,ys[k]+lw,ws[k]-2*lw,hs[k]-2*lw);
}
if(s>=5){
ctx.fillStyle=all?T.unique:T.dot;
for(k=0;k<m;k++)ctx.fillRect(Math.round(xs[k]+(ws[k]-size)/2),Math.round(ys[k]+(hs[k]-size)/2),size,size);
}
};
View.prototype._draw=function(){
var t0=performance.now();
this.bctx.setTransform(1,0,0,1,0,0);
this.bctx.globalAlpha=1;
this.bctx.clearRect(0,0,this.base.width,this.base.height);
var animate=this.o.reveal&&!this._revealed&&!this._reduced()&&this._inView();
this._revealed=true;
if(animate){
this.painted=0;
this._startReveal();
}else{
this._paint(0,this.n);
this._paintUnique();
this.painted=this.n;
}
this.stats.paintMs=performance.now()-t0;
this.root.setAttribute("data-paint-ms",this.stats.paintMs.toFixed(1));
this.root.setAttribute("data-cell",String(this.c));
this._paintOver();
this._updateText();
};
View.prototype._repaint=function(){
if(this.anim)return;
this._cancelReveal();
var t0=performance.now();
this.bctx.setTransform(1,0,0,1,0,0);
this.bctx.globalAlpha=1;
this.bctx.clearRect(0,0,this.base.width,this.base.height);
this._paint(0,this.n);
this._paintUnique();
this.painted=this.n;
this.stats.paintMs=performance.now()-t0;
this.root.setAttribute("data-paint-ms",this.stats.paintMs.toFixed(1));
this._paintOver();
};
View.prototype._reduced=function(){
return!!(window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches);
};
View.prototype._inView=function(){
var r=this.stage.getBoundingClientRect(),vh=window.innerHeight||document.documentElement.clientHeight;
return r.top<vh&&r.bottom>0;
};
View.prototype._startReveal=function(){
var self=this,t0=null,dur=600,lag=Math.max(200,Math.round(this.n*0.05));
this.solid=0;
function finish(){
var ctx=self.bctx;
if(self._dead)return;
self._cancelReveal();
ctx.globalAlpha=1;
if(self.painted<self.n){self._paint(self.painted,self.n);self.painted=self.n;}
if(self.solid<self.n){self._paint(self.solid,self.n);self.solid=self.n;}
self._paintUnique();
}
function frame(ts){
if(self._dead)return;
if(t0===null)t0=ts;
var ctx=self.bctx,p=clamp((ts-t0)/dur,0,1),e=1-Math.pow(1-p,2.2);
var to=p<1?Math.min(self.n,Math.round(e*self.n)):self.n;
if(to>self.painted){ctx.globalAlpha=0.4;self._paint(self.painted,to);self.painted=to;}
var solidTo=p<1?Math.max(self.solid,to-lag):self.n;
if(solidTo>self.solid){ctx.globalAlpha=1;self._paint(self.solid,solidTo);self.solid=solidTo;}
ctx.globalAlpha=1;
if(p<1)self._revealRaf=requestAnimationFrame(frame);
else finish();
}
this._revealRaf=requestAnimationFrame(frame);
this._revealTimer=setTimeout(finish,dur+250);
};
View.prototype._cancelReveal=function(){
if(this._revealRaf){cancelAnimationFrame(this._revealRaf);this._revealRaf=0;}
if(this._revealTimer){clearTimeout(this._revealTimer);this._revealTimer=0;}
};
View.prototype._cellXY=function(idx){
var L=this.lay,k=L.rk?L.rk[idx]:idx,f=seg(L.start,L.nseg,k),l=k-L.start[f],r=(l/this.perRow)|0,col=l-r*this.perRow;
this._cx=col*this.c;this._cy=L.y[f]+r*this.c;this._cf=f;
};
function put(e,x,y,w,h){
e.hidden=false;
e.style.transform="translate("+x+"px,"+y+"px)";
e.style.width=w+"px";e.style.height=h+"px";
}
View.prototype._ring=function(e,idx){
this._cellXY(idx);
var pad=this.s>=5?1.5:2.5;
put(e,this._cx-pad,this._cy-pad,this.s+2*pad,this.s+2*pad);
};
View.prototype._paintOver=function(){
if(this.anim)return;
var f=this.hoverFile;
if(f>=0&&this.hover<0){
var cnt=this.fileStart[f+1]-this.fileStart[f],w=Math.min(cnt,this.perRow)*this.c;
put(this.band,-1.5,this.fy[f]-1.5,w+3,this.frows[f]*this.c+3);
}else this.band.hidden=true;
if(this.hover>=0&&this.hover!==this.pin)this._ring(this.ringHover,this.hover);else this.ringHover.hidden=true;
if(this.pin>=0)this._ring(this.cursor,this.pin);else this.cursor.hidden=true;
};
View.prototype._hit=function(x,y){
var L=this.lay;
this._hf=-1;
if(x<0||y<0||y>=L.h||x>=this.perRow*this.c)return-1;
var lo=seg(L.top,L.nseg,y);
if(!L.ord)this._hf=lo;
var ry=y-L.y[lo];
if(ry<0)return-1;
var r=(ry/this.c)|0,col=(x/this.c)|0,k=L.start[lo]+r*this.perRow+col;
if(r>=L.rows[lo]||k>=L.start[lo+1])return-1;
return L.ord?L.ord[k]:k;
};
View.prototype._hitNear=function(x,y,reach){
var idx=this._hit(x,y),f=this._hf;
if(idx>=0||!reach)return idx;
var best=-1,bd=reach*reach+1,step=2,dx,dy,k,d;
for(dy=-reach;dy<=reach;dy+=step)for(dx=-reach;dx<=reach;dx+=step){
d=dx*dx+dy*dy;
if(d>=bd)continue;
k=this._hit(x+dx,y+dy);
if(k>=0){best=k;bd=d;}
}
this._hf=f;
return best;
};
View.prototype._bind=function(){
var self=this,stage=this.stage;
var down=null;
stage.addEventListener("pointermove",function(e){
if(e.pointerType==="touch"||self.anim)return;
var r=stage.getBoundingClientRect();
var idx=self._hit(e.clientX-r.left,e.clientY-r.top),f=self._hf;
if(idx!==self.hover||(idx<0&&f!==self.hoverFile)){
self.hover=idx;self.hoverFile=f;
self._paintOver();
self._fillTip();
}
self._placeTip(e.clientX,e.clientY);
});
stage.addEventListener("pointerleave",function(){
if(self.hover===-1&&self.hoverFile===-1)return;
self.hover=-1;self.hoverFile=-1;self.tip.hidden=true;self._paintOver();
});
stage.addEventListener("pointerdown",function(e){down={x:e.clientX,y:e.clientY,t:e.pointerType};self._ptr=true;});
stage.addEventListener("pointerup",function(e){
if(!down)return;
var moved=Math.abs(e.clientX-down.x)+Math.abs(e.clientY-down.y),touch=down.t==="touch"||down.t==="pen";
down=null;
if(moved>8||self.anim)return;
var r=stage.getBoundingClientRect();
var idx=self._hitNear(e.clientX-r.left,e.clientY-r.top,touch?8:0);
var next=idx<0?-1:(idx===self.pin?-1:idx);
self._ptr=true;
stage.focus({preventScroll:true});
self.setPin(next,false);
});
stage.addEventListener("pointercancel",function(){down=null;});
stage.addEventListener("keydown",function(e){self._key(e);});
stage.addEventListener("focus",function(){if(self.pin<0&&!self._ptr)self.setPin(self.firstIndex(),false,true);});
this._onEsc=function(e){
if(e.key!=="Escape"||self.tip.hidden)return;
self.hover=-1;self.hoverFile=-1;self.tip.hidden=true;self._paintOver();
};
document.addEventListener("keydown",this._onEsc);
this._onPointerEnd=function(){setTimeout(function(){self._ptr=false;},0);};
document.addEventListener("pointerup",this._onPointerEnd,true);
document.addEventListener("pointercancel",this._onPointerEnd,true);
this._ro=null;
if(window.ResizeObserver){
this._ro=new ResizeObserver(function(){
if(self._raf||Math.floor(self.holder.clientWidth)===self.W)return;
self._raf=requestAnimationFrame(function(){self._raf=0;self._relayout(false);});
});
this._ro.observe(this.holder);
}else{
this._onResize=function(){self._relayout(false);};
window.addEventListener("resize",this._onResize);
}
this._themeChanged=function(){
if(self._dead)return;
var before=self._tokKey;
self._readTokens();
if(self._tokKey===before)return;
self._classify();self._repaint();self._updateLegend();
};
window.addEventListener("themechange",this._themeChanged);
this._onDpr=function(){self._relayout(false);};
window.addEventListener("resize",this._onDpr);
};
View.prototype.destroy=function(){
this._dead=true;
this._cancelReveal();
this._stop();
if(this._raf)cancelAnimationFrame(this._raf);
if(this._ro)this._ro.disconnect();
if(this._mq){
if(this._mq.removeEventListener)this._mq.removeEventListener("change",this._themeChanged);
else if(this._mq.removeListener)this._mq.removeListener(this._themeChanged);
}
window.removeEventListener("resize",this._onDpr);
document.removeEventListener("keydown",this._onEsc);
document.removeEventListener("pointerup",this._onPointerEnd,true);
document.removeEventListener("pointercancel",this._onPointerEnd,true);
if(this._onResize)window.removeEventListener("resize",this._onResize);
while(this.root.firstChild)this.root.removeChild(this.root.firstChild);
};
View.prototype.firstIndex=function(){
return this.n?(this.lay.ord?this.lay.ord[0]:0):-1;
};
View.prototype._move=function(key,ctrl,L){
L=L||this.lay;
var n=this.n,k=L.rk?L.rk[this.pin]:this.pin,f=seg(L.start,L.nseg,k),fs=L.start,perRow=this.perRow,l=k-fs[f],j=k;
switch(key){
case"ArrowRight":j=Math.min(n-1,k+1);break;
case"ArrowLeft":j=Math.max(0,k-1);break;
case"ArrowDown":{
var cntF=fs[f+1]-fs[f],r=(l/perRow)|0,rows=Math.ceil(cntF/perRow);
if(l+perRow<cntF)j=k+perRow;
else if(r<rows-1)j=fs[f+1]-1;
else if(f+1<L.nseg)j=fs[f+1]+Math.min(l%perRow,Math.min(perRow,fs[f+2]-fs[f+1])-1);
break;
}
case"ArrowUp":{
if(l>=perRow)j=k-perRow;
else if(f>0){var pc=fs[f]-fs[f-1];j=fs[f-1]+Math.min(pc-1,Math.floor((pc-1)/perRow)*perRow+l%perRow);}
break;
}
case"Home":j=ctrl?0:fs[f];break;
case"End":j=ctrl?n-1:fs[f+1]-1;break;
case"PageDown":j=f+1<L.nseg?fs[f+1]:n-1;break;
case"PageUp":j=l>0?fs[f]:(f>0?fs[f-1]:0);break;
}
return L.ord?L.ord[j]:j;
};
View.prototype._key=function(e){
var k=e.key;
if(e.altKey||e.metaKey)return;
if(k==="Escape"){if(this.pin>=0){this.setPin(-1,false);e.preventDefault();}return;}
if(["ArrowRight","ArrowLeft","ArrowUp","ArrowDown","Home","End","PageUp","PageDown"].indexOf(k)<0)return;
e.preventDefault();
if(this.pin<0){this.setPin(this.firstIndex(),false,true);return;}
this.setPin(this._move(k,e.ctrlKey),false,true);
};
Reader.prototype._reachList=function(idx){
var m=this.mask[idx],out=[],miss=[];
for(var s=0;s<this.S;s++)(m>>s&1?out:miss).push(s);
return{reach:out,miss:miss};
};
Reader.prototype._detail=function(host,idx){
var d=this.d,f=this._fileOf(idx),l=idx-this.fileStart[f],S=this.S,cnt=this.cnt[idx];
host.appendChild(el("p","bm-d-key bm-mono",this.fileName[f]+":"+this.lines[idx]));
var block=this.blocks?this.blocks[idx]:0;
host.appendChild(el("p","bm-d-sub","Block "+block+", branch "+this.branches[idx]+", "+
fmt(l+1)+" of "+fmt(this.fileStart[f+1]-this.fileStart[f])+" in this file"));
var state=cnt===0?"Reached by none of the "+S+" tools":
cnt===1?"Reached by exactly one tool":
cnt===S?"Reached by all "+S+" tools":"Reached by "+cnt+" of "+S+" tools";
host.appendChild(el("p","bm-d-state",state));
var rl=this._reachList(idx);
if(rl.reach.length){
var ul=el("ul","bm-d-list");
for(var i=0;i<rl.reach.length;i++){
var li=el("li");
li.appendChild(el("span","bm-d-mark"));
li.appendChild(el("span",null,d.labels[rl.reach[i]]));
if(rl.reach[i]===this.sel)li.setAttribute("data-sel","1");
ul.appendChild(li);
}
host.appendChild(ul);
}
if(rl.miss.length&&rl.reach.length){
var names=rl.miss.length<=4?rl.miss.map(function(s){return d.labels[s];}).join("; "):"";
host.appendChild(el("p","bm-d-miss",rl.miss.length<=4?"Not reached by: "+names:
"Not reached by "+rl.miss.length+" other tools."));
}
};
Reader.prototype._line=function(idx){
var f=this._fileOf(idx),cnt=this.cnt[idx],S=this.S;
return this.fileName[f]+":"+this.lines[idx]+", block "+(this.blocks?this.blocks[idx]:0)+", branch "+this.branches[idx]+", "+
(cnt===0?"reached by no tool":cnt===1?"reached by one of "+S+" tools":cnt===S?"reached by all "+S+" tools":"reached by "+cnt+" of "+S+" tools");
};
Reader.prototype.detail=function(host,idx){this._detail(host,idx);};
Reader.prototype.line=function(idx){return this._line(idx);};
Reader.prototype._fileDetail=function(host,f){
var S=this.S,ng=this.ng,st=this.fileStats,base=f*ng,cnt=this.fileStart[f+1]-this.fileStart[f];
host.appendChild(el("p","bm-d-key bm-mono",this.fileName[f]));
host.appendChild(el("p","bm-d-sub",fmt(cnt)+" "+plural(cnt,"branch","branches")));
var line;
if(this.sel<0){
var none=st[base],one=st[base+1],all=st[base+S];
line=fmt(none)+" reached by none, "+fmt(one)+" by exactly one and "+fmt(all)+" by all "+S+".";
}else{
var lab=this.d.labels[this.sel],r=st[base+2]+st[base+3];
line=lab+" reaches "+fmt(r)+" ("+pct(r,cnt)+"), "+fmt(st[base+3])+" of them only it. Other tools alone reach "+
fmt(st[base+1])+"; "+fmt(st[base])+" are reached by none of the "+S+" tools.";
}
host.appendChild(el("p","bm-d-stats",line));
};
View.prototype._fillTip=function(){
var tip=this.tip;
while(tip.firstChild)tip.removeChild(tip.firstChild);
if(this.hover>=0)this._detail(tip,this.hover);
else if(this.hoverFile>=0)this._fileDetail(tip,this.hoverFile);
else{tip.hidden=true;return;}
tip.hidden=false;
};
function placeBeside(tip,px,py){
var w=tip.offsetWidth,h=tip.offsetHeight,vw=document.documentElement.clientWidth,vh=window.innerHeight;
var x=px+16,y=py+18;
if(x+w>vw-8)x=Math.max(8,px-w-14);
if(y+h>vh-8)y=Math.max(8,py-h-14);
tip.style.transform="translate("+Math.round(x)+"px,"+Math.round(y)+"px)";
}
View.prototype._placeTip=function(px,py){
if(!this.tip.hidden)placeBeside(this.tip,px,py);
};
View.prototype.setPin=function(idx,fromApi,scroll){
this.pin=idx;
this._paintOver();
this._fillInspector();
if(idx>=0&&scroll){
try{this.cursor.scrollIntoView({block:"nearest",inline:"nearest"});}catch(e){}
}
if(this.o.onChange)this.o.onChange(this.state());
};
View.prototype._fillInspector=function(){
var box=this.inspector,self=this;
while(box.firstChild)box.removeChild(box.firstChild);
if(this.pin<0){
box.removeAttribute("data-pinned");
box.appendChild(el("p","bm-inspector-empty","No branch pinned."));
this.statusEl.textContent="No branch pinned";
return;
}
box.setAttribute("data-pinned","1");
this._detail(box,this.pin);
this.statusEl.textContent=this._line(this.pin);
var steps=el("div","bm-steps");
function btn(label,fn){
var b=el("button","bm-btn",label);b.type="button";
b.addEventListener("click",function(){fn();});
steps.appendChild(b);
}
btn("Previous branch",function(){self.setPin(self._move("ArrowLeft"),false,true);});
btn("Next branch",function(){self.setPin(self._move("ArrowRight"),false,true);});
btn("Previous file",function(){self.setPin(self._move("PageUp",false,self.src),false,true);});
btn("Next file",function(){self.setPin(self._move("PageDown",false,self.src),false,true);});
btn("Unpin",function(){self.setPin(-1,false);});
box.appendChild(steps);
};
View.prototype._updateText=function(){
var d=this.d,n=this.n,S=this.S,sum=d.summary,gc=this.groupCount,txt;
if(this.sel<0){
txt="Measured for "+S+" main-group "+plural(S,"tool","tools")+".";
}else{
var lab=d.labels[this.sel],reach=gc[2]+gc[3];
txt=lab+" reaches "+fmt(reach)+" of "+fmt(n)+" branches ("+pct(reach,n)+"); "+fmt(gc[3])+" of them no other tool reaches.";
if(d.runs[this.sel]<this.o.fullRuns)txt+=" This is the union of "+d.runs[this.sel]+" "+plural(d.runs[this.sel],"run","runs")+", fewer than the usual "+this.o.fullRuns+".";
}
this.summaryEl.textContent=txt;
this._updateLegend();
this._updateTables();
};
View.prototype._swatch=function(clsId){return this.styles[clsId];};
View.prototype._updateLegend=function(){
var self=this,S=this.S,gc=this.groupCount,ul=this.legendEl,map=this.legendMap;
while(ul.firstChild)ul.removeChild(ul.firstChild);
var sel=this.sel>=0;
ul.className="bm-legend"+(sel?" bm-legend--sel":"");
while(this.legendTitle.firstChild)this.legendTitle.removeChild(this.legendTitle.firstChild);
this.legendTitle.appendChild(document.createTextNode(sel?"Who reaches each branch":"Tools reaching each branch"));
var items=[];
var i;
if(!sel){
var K=this.K,cl=this.cl;
items.push({g:0,k:"Unreached",n:gc[0],who:"no tool"});
for(i=0;i<K;i++){
var lo=cl[i][0],hi=cl[i][1],cnt=0,c;
for(c=lo;c<=hi;c++)cnt+=gc[c];
items.push({g:i+1,k:lo===1&&hi===1?"1 tool":classLabel(S,lo,hi),n:cnt,
who:lo===hi?(lo===1?"exactly one tool":lo===S?"all "+S+" tools":lo+" tools"):lo+" to "+hi+" tools"});
}
}else{
items=[
{g:0,k:"Unreached",n:gc[0]},
{g:1,k:"Other tools only",n:gc[1]},
{g:2,k:"This tool and others",n:gc[2]},
{g:3,k:"Only this tool",n:gc[3]}
];
}
this.legendItems=items;
items.forEach(function(it,k){
var li=el("li");
li.setAttribute("role","presentation");
var b=el("button","bm-chip");b.type="button";
b.setAttribute("aria-pressed",self.focus===it.g?"true":"false");
b.tabIndex=k===self.lgIdx?0:-1;
b.setAttribute("aria-label",it.k+" "+fmt(it.n)+" branches"+(sel?"":", reached by "+it.who));
var sw=el("span","bm-chip-sw"+(it.g===0?" bm-chip-sw--none":""));
sw.style.background=self.styles[sel?map[it.g]:it.g];
b.appendChild(sw);
b.appendChild(el("span","bm-chip-k",it.k));
b.appendChild(el("span","bm-chip-n",fmt(it.n)));
b.addEventListener("click",function(){self.lgIdx=k;self.setFocus(self.focus===it.g?-1:it.g);var again=self.legendEl.querySelectorAll("button")[k];if(again)again.focus();});
b.addEventListener("keydown",function(e){
var all=self.legendEl.querySelectorAll("button"),to=-1;
if(e.key==="ArrowRight")to=Math.min(all.length-1,k+1);
else if(e.key==="ArrowLeft")to=Math.max(0,k-1);
else if(e.key==="Home")to=0;
else if(e.key==="End")to=all.length-1;
if(to<0)return;
e.preventDefault();self.lgIdx=to;
for(var q=0;q<all.length;q++)all[q].tabIndex=q===to?0:-1;
all[to].focus();
});
li.appendChild(b);
ul.appendChild(li);
});
};
View.prototype._updateTables=function(){
if(!this.tablesEl.open){this._tablesStale=true;return;}
this._tablesStale=false;
var self=this,d=this.d,S=this.S,body=this.tablesBody,n=this.n,sum=d.summary;
while(body.firstChild)body.removeChild(body.firstChild);
function table(head,rows,label,cap){
var wrap=el("div","bm-scroll"+(cap?" bm-scroll-cap":""));
wrap.tabIndex=0;wrap.setAttribute("role","region");wrap.setAttribute("aria-label",label);
var t=el("table","bm-table");
t.appendChild(el("caption","bm-sr",label));
var thead=el("thead"),tr=el("tr");
head.forEach(function(h){var th=el("th",null,h);th.scope="col";tr.appendChild(th);});
thead.appendChild(tr);t.appendChild(thead);
var tb=el("tbody");
rows.forEach(function(r){
var row=el("tr");
if(r.sel)row.setAttribute("data-sel","1");
r.cells.forEach(function(c,i){
var cell=i===0?el("th",null,c):el("td",null,c);
if(i===0)cell.scope="row";
row.appendChild(cell);
});
tb.appendChild(row);
});
t.appendChild(tb);wrap.appendChild(t);
return wrap;
}
var h3=el("h3",null,"By tool");
body.appendChild(h3);
var rows=[];
for(var s=0;s<S;s++){
var id=d.systems[s],r=sum.reached[id],u=sum.unique[id];
rows.push({sel:s===this.sel,cells:[d.labels[s],String(d.runs[s]),fmt(r),pct(r,n),fmt(u)]});
}
body.appendChild(table(["Tool","Runs","Branches reached","Share","Only this tool"],rows,"Branches reached by each tool"));
var h4=el("h3",null,"By number of tools reaching a branch");
body.appendChild(h4);
var hr=[];
for(var k=0;k<=S;k++)hr.push({cells:[String(k),fmt(sum.histogram[k]),pct(sum.histogram[k],n)]});
body.appendChild(table(["Tools reaching","Branches","Share"],hr,"Branches by number of tools reaching them"));
var h5=el("h3",null,(this.sel<0?"By file":"By file, for "+d.labels[this.sel])+(this.F>12?" (the table scrolls, "+this.F+" files)":""));
body.appendChild(h5);
var fr=[],ng=this.ng,st=this.fileStats,base,f;
for(f=0;f<this.F;f++){
base=f*ng;
var cnt=this.fileStart[f+1]-this.fileStart[f];
if(this.sel<0)fr.push({cells:[this.fileName[f],fmt(cnt),fmt(st[base]),fmt(st[base+1]),fmt(st[base+S])]});
else fr.push({cells:[this.fileName[f],fmt(cnt),fmt(st[base+2]+st[base+3]),pct(st[base+2]+st[base+3],cnt),fmt(st[base+3]),fmt(st[base+1])]});
}
body.appendChild(table(this.sel<0?
["File","Branches","Unreached","Exactly one tool","All "+S+" tools"]:
["File","Branches","Reached","Share","Only this tool","Only other tools"],fr,"Branches by source file",true));
var note=el("p","bm-table-note");
note.appendChild(document.createTextNode("Reach counts use the union of each tool's runs. "));
if(this.o.dataUrl){
var a=el("a",null,"Download this map's data (JSON)");
a.href=this.o.dataUrl;a.setAttribute("download","");
note.appendChild(a);
note.appendChild(document.createTextNode("."));
}
body.appendChild(note);
};
var DRAW_MS=5,FRAME_MS=12,SLOW_FOR=30000;
View.prototype.arrange=function(to){
to=to==="reach"?"reach":"src";
if(to===this.arr||(to==="reach"&&this.sel>=0))return;
this._endFade();
var from=this.lay;
this._setArr(to);
this.hover=this.hoverFile=-1;
this.tip.hidden=this.ringHover.hidden=this.band.hidden=this.cursor.hidden=true;
this._say(to==="reach"?"Cells arranged by the number of tools that reach them":"Cells arranged by source file");
if(this.slow&&performance.now()-this.slow>SLOW_FOR)this.slow=0;
if(this._reduced()||document.hidden){this._stop();this._size(this.lay.h);this._repaint();this._keepPin();}
else if(this.big||this.slow){this._stop();this._cross(from);}
else this._morph(from,this.lay);
this._showBands(to);
};
View.prototype._showBands=function(to){
var f=this.frame,L=this.rch;
if(this.pin>=0||f.scrollHeight<=f.clientHeight+1)return;
if(to==="src"){f.scrollTop=0;return;}
if(L.nseg>1&&this.bs[1]-this.bs[0]>0){
var top=this.stage.getBoundingClientRect().top-f.getBoundingClientRect().top+f.scrollTop;
f.scrollTop=Math.max(0,top+L.top[1]);
}
};
View.prototype._setArr=function(to){
var i,off=this.sel>=0,r=this.orderEl.querySelectorAll("input");
this.arr=to;this.lay=to==="reach"?this.rch:this.src;
this.orderEl.setAttribute("aria-disabled",off);
this.orderEl.title=off?WHY:"";
for(i=0;i<r.length;i++){r[i].checked=r[i].value===to;r[i].setAttribute("aria-disabled",off);}
};
View.prototype._stop=function(){
var m=this.anim;
if(m){cancelAnimationFrame(m.raf);m.ch.port1.close();this.anim=null;}
this._endFade();
};
View.prototype._endFade=function(){
var f=this.fade;
if(!f)return false;
clearTimeout(this.fadeTimer);this.fade=null;
f.width=f.height=0;f.parentNode.removeChild(f);
return true;
};
View.prototype._cross=function(F){
var self=this,b=this.base,old=document.createElement("canvas"),h=Math.min(b.height,Math.ceil(Math.max(1,F.h)*this.dpr));
old.className="bm-snap";old.setAttribute("aria-hidden","true");
old.width=b.width;old.height=h;old.style.width=b.style.width;old.style.height=h*this.bh/b.height+"px";
old.getContext("2d").drawImage(b,0,0);
this._size(Math.max(this.src.h,this.rch.h));
this.stage.insertBefore(old,this.band);
this._repaint();
void old.offsetWidth;
old.style.opacity="0";
this.fade=old;
this.fadeTimer=setTimeout(function(){if(self._endFade()){self._size(self.lay.h);self._keepPin();}},130);
};
View.prototype._morph=function(F,T){
var self=this,m=this.anim,n=this.n,t;
if(!this.ease)this.ease=easing(getComputedStyle(this.root).getPropertyValue("--ease"));
this._cancelReveal();
this._size(Math.max(this.src.h,this.rch.h));
if(m){m.fx.set(m.x);m.fy.set(m.y);m.t=0;}
else{
var a=this._px(F);
m=this.anim={fx:Float32Array.from(a.x),fy:Float32Array.from(a.y),x:new Float32Array(n),y:new Float32Array(n),size:Math.max(1,Math.round(this.s*this.dpr)),raf:0,t:0,ch:new MessageChannel()};
m.ch.port1.onmessage=function(){if(self.anim===m&&m.t&&performance.now()-m.t>=FRAME_MS){self.slow=performance.now();self._land();}};
}
m.to=this._px(T);m.t0=0;
t=performance.now();
this._frame(0);
if(m.raf)return;
if(performance.now()-t>=DRAW_MS){this._stop();this._cross(F);return;}
m.raf=requestAnimationFrame(function loop(ts){
if(!m.t0)m.t0=ts;
var p=Math.min(1,(ts-m.t0)/200);
m.t=performance.now();m.ch.port2.postMessage(0);
self._frame(self.ease(p));
if(p<1)m.raf=requestAnimationFrame(loop);else self._land();
});
};
View.prototype._frame=function(e){
var m=this.anim,ctx=this.bctx,L=this.rch,st=L.start,ord=this.ord,cls=this.cls,styles=this.styles,z=m.size;
var fx=m.fx,fy=m.fy,x=m.x,y=m.y,tx=m.to.x,ty=m.to.y,f,j,i;
ctx.setTransform(1,0,0,1,0,0);
ctx.globalAlpha=1;
ctx.clearRect(0,0,this.base.width,this.base.height);
for(f=0;f<L.nseg;f++){
ctx.fillStyle=styles[cls[ord[st[f]]]];
for(j=st[f];j<st[f+1];j++){
i=ord[j];
x[i]=fx[i]+(tx[i]-fx[i])*e;y[i]=fy[i]+(ty[i]-fy[i])*e;
ctx.fillRect(Math.round(x[i]),Math.round(y[i]),z,z);
}
}
this._paintUnique(m);
};
View.prototype._land=function(){
this._stop();
this._size(this.lay.h);
this._repaint();
this._keepPin();
};
View.prototype.select=function(sys){
var idx=-1;
if(typeof sys==="number")idx=sys;
else if(typeof sys==="string")idx=this.d.systems.indexOf(sys);
if(idx<-1||idx>=this.S)idx=-1;
if(idx===this.sel)return;
var flip=idx>=0&&this.arr==="reach";
this.sel=idx;this.focus=-1;
this.radios.forEach(function(r,i){
var on=parseInt(r.value,10)===idx;
r.checked=on;
this.rows[i].classList.toggle("is-on",on);
},this);
this.select_.value=String(idx);
this._recolor();
this._stop();
this._setArr(idx>=0?"src":this.arr);
this._size(this.lay.h);
this._repaint();
this._keepPin();
this._updateText();
this._fillInspector();
this._fillTip();
this._say(this.summaryEl.textContent+(flip?" The cells are in source order.":""));
if(this.o.onChange)this.o.onChange(this.state());
};
View.prototype._say=function(t){
if(global.CRApp&&global.CRApp.say)global.CRApp.say(t);else this.statusEl.textContent=t;
};
View.prototype.setMark=function(on){
on=!!on;
if(on===this.mark)return;
this.mark=on;this.markBox.checked=on;
this._classify();this._repaint();this._updateText();
};
View.prototype.setFocus=function(g){
this.focus=g;
this._classify();this._repaint();this._updateLegend();
var it=null;
(this.legendItems||[]).forEach(function(x){if(x.g===g)it=x;});
this._say(it?"Highlighting "+it.k+": "+fmt(it.n)+" branches":"Highlight cleared");
};
View.prototype.state=function(){
return{program:this.d.program,tool:this.sel<0?null:this.d.systems[this.sel],pin:this.pin,mark:this.mark};
};
View.prototype.redraw=function(){this._readTokens();this._classify();this._repaint();this._updateLegend();};
View.prototype.relayout=function(){this._relayout(true);};
function mount(root,data,opts){
if(typeof data==="string")data=(global.BranchMapData||{})[data];
if(!root||!data||!data.mask)throw new Error("BranchMap.mount needs an element and a branch map data object");
var v=new View(root,data,opts||{});
v.radios[0].checked=true;
v.rows[0].classList.add("is-on");
v._fillInspector();
v._updateText();
return v;
}
function popup(reader,opts){
opts=opts||{};
var box=el("div","bm-tip bm-pop"),isOpen=false;
box.setAttribute("role","dialog");
box.setAttribute("aria-label",opts.label||"Branch details");
box.tabIndex=-1;
box.hidden=true;
var home=opts.home||document.body;
home.parentNode?home.parentNode.insertBefore(box,home.nextSibling):document.body.appendChild(box);
function onKey(e){
if(e.key!=="Escape"||!isOpen)return;
e.preventDefault();
close(true);
}
function onDown(e){
if(isOpen&&!box.contains(e.target)&&!(opts.stage&&opts.stage.contains(e.target)))close(false);
}
function close(back){
if(!isOpen)return;
isOpen=false;box.hidden=true;
document.removeEventListener("keydown",onKey);
document.removeEventListener("pointerdown",onDown,true);
if(opts.onClose)opts.onClose();
if(back&&opts.stage)opts.stage.focus({preventScroll:true});
}
function open(idx,x,y,fromKey){
while(box.firstChild)box.removeChild(box.firstChild);
reader._detail(box,idx);
if(opts.href){
var a=el("a","bm-open",opts.text||"Open");a.href=opts.href;
box.appendChild(el("p","bm-d-link")).appendChild(a);
}
box.hidden=false;
placeBeside(box,x,y);
if(!isOpen){
isOpen=true;
document.addEventListener("keydown",onKey);
document.addEventListener("pointerdown",onDown,true);
}
if(fromKey)box.focus({preventScroll:true});
}
return{open:open,close:function(){close(false);},isOpen:function(){return isOpen;},element:box};
}
global.BranchMap={mount:mount,reader:function(data){return new Reader(data);},popup:popup,version:VERSION,classes:classesFor,rampIndex:rampIndex,classLabel:classLabel};
})(window);
