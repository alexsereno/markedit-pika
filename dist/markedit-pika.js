/*! MarkEdit Pika 0.1.1 — MIT. See THIRD_PARTY_NOTICES.txt. */
"use strict";var Xn=Object.defineProperty;var tr=(t,n)=>{for(var e in n)Xn(t,e,{get:n[e],enumerable:!0})};var I=require("markedit-api");var Ut="https://pika.page/micropub",ee=`${Ut}/media`,ne=new Set(["content","name","category","post-status","published","photo"]);function W(t){let n=new URL(t);if(n.protocol!=="https:"||n.username||n.password)throw new Error("Use an HTTPS URL without embedded credentials.");return n.href}function Ft(t){if(!t||typeof t!="object"||Array.isArray(t))throw new Error("Properties must be an object.");for(let[n,e]of Object.entries(t)){if(!ne.has(n))throw new Error(`Unsupported Pika property: ${n}`);if(!Array.isArray(e))throw new Error(`${n} must be an array.`);for(let r of e)if(n==="photo"){let i=typeof r=="string"?r:r?.value;if(typeof i!="string"||typeof r=="object"&&r.alt!==void 0&&typeof r.alt!="string")throw new Error("Photos need a URL and optional alt text.");W(i)}else{if(typeof r!="string")throw new Error(`${n} values must be strings.`);if(n==="post-status"&&!["draft","published"].includes(r))throw new Error("Status must be draft or published.");if(n==="published"&&(!/^\d{4}-\d\d-\d\dT/.test(r)||!Number.isFinite(Date.parse(r))))throw new Error("Publication date must be an ISO 8601 datetime.")}if(["content","name","post-status","published"].includes(n)&&e.length>1)throw new Error(`${n} accepts one value.`)}}function er(t){if(!t||typeof t!="object"||Array.isArray(t))throw new Error("Properties must be an object.");let n=Object.fromEntries(Object.entries(t).filter(([e])=>ne.has(e)));return Ft(n),n}function un(t,n){if(!t||typeof t!="object"||Array.isArray(t))throw new Error("Invalid post response.");let e=t,r=e.properties??e,i=er(r),o=r.url??e.url??n,a=Array.isArray(o)?o[0]:o,u={properties:i};return typeof a=="string"&&(u.url=W(a)),u}function nr(t){if(!t||typeof t!="object"||Array.isArray(t)||!Object.keys(t).length)throw new Error("Provide replace, add, or delete operations.");for(let[n,e]of Object.entries(t)){if(!["replace","add","delete"].includes(n))throw new Error(`Unsupported update operation: ${n}`);if(n==="delete"&&Array.isArray(e)){if(!e.every(r=>typeof r=="string"&&ne.has(r)))throw new Error("Unknown property to remove.")}else Ft(e)}}var it=class extends Error{constructor(e,r,i,o){super(e);this.status=r;this.code=i;this.retryAt=o}},qt=class{constructor(n,e=fetch,r=6e4){this.token=n;this.transport=e;this.timeoutMs=r}blockedUntil=0;rateDelay=6e4;async request(n,e,r,i=!1){if(Date.now()<this.blockedUntil)throw new it("Pika is rate limiting requests. Wait before trying again.",429,void 0,this.blockedUntil);let o=new AbortController,a,u=new Promise((f,s)=>{a=setTimeout(()=>{o.abort(),s(new Error("Request timed out"))},this.timeoutMs)}),p;try{p=await Promise.race([(async()=>{let f=await this.transport.call(globalThis,n,{method:e,body:r,signal:o.signal,redirect:"error",credentials:"omit",cache:"no-store",headers:{Authorization:`Bearer ${this.token}`,...i?{"Content-Type":"application/json"}:{}}}),s=await f.arrayBuffer();return new Response([204,205,304].includes(f.status)?null:s,{status:f.status,statusText:f.statusText,headers:f.headers})})(),u])}catch{throw new it(e==="GET"?"Could not reach Pika. Check your connection and MarkEdit\u2019s network support.":"The request did not finish. Pika may have received it. Check Pika before retrying; nothing was automatically resent.",0)}finally{clearTimeout(a)}if(!p.ok){let f=await p.json().catch(()=>({})),s;if(p.status===429){let d=p.headers.get("Retry-After"),l=d&&/^\d+$/.test(d)?Number(d)*1e3:d?Date.parse(d)-Date.now():0;this.blockedUntil=Date.now()+Math.max(this.rateDelay,l||0),this.rateDelay=Math.min(this.rateDelay*2,36e5),s=this.blockedUntil}let m={401:"Reconnect with a valid Pika app token.",403:f.error==="insufficient_scope"?`Your token needs ${f.scope||"additional"} permission. Create a new app token.`:"Pika denied this request. Check your account\u2019s post limit and plan.",404:"The post was not found. Check its URL.",429:"Pika is rate limiting requests. Wait at least one minute before retrying."};throw new it(`${m[p.status]||`Pika rejected the request (${p.status}).`}${f.error_description?` ${f.error_description}`:""}`,p.status,f.error,s)}return this.rateDelay=6e4,p}async post(n){return this.request(Ut,"POST",JSON.stringify(n),!0)}location(n){let e=n.headers.get("Location");if(!e)throw new it("Pika accepted the request but its Location header is unavailable. Check Pika before creating another post.",n.status);return W(new URL(e,Ut).href)}async config(){return(await this.request(`${Ut}?q=config`,"GET")).json()}async source(n,e=[]){let r=new URLSearchParams({q:"source",url:W(n)});for(let o of e){if(!ne.has(o))throw new Error(`Unknown property: ${o}`);r.append("properties[]",o)}let i=await(await this.request(`${Ut}?${r}`,"GET")).json();return un(i)}async create(n){if(Ft(n),!n.content?.[0]?.trim()&&!n.photo?.length)throw new Error("Write a post or add a photo first.");return this.location(await this.post({type:["h-entry"],properties:n}))}async update(n,e){nr(e);let r=await this.post({action:"update",url:W(n),...e});try{let i=await r.json();return un(i,r.headers.get("Location"))}catch{throw new it("Pika accepted the update but its response could not be read. Fetch the source before retrying.",r.status)}}async trash(n){await this.post({action:"delete",url:W(n)})}async restore(n){await this.post({action:"undelete",url:W(n)})}async upload(n,e,r=ee){if(W(r)!==ee)throw new Error("Unexpected media endpoint. Tokens are only sent to Pika.");if(!["image/jpeg","image/png","image/gif","image/webp"].includes(n.type))throw new Error("Choose a JPEG, PNG, GIF, or WebP image.");let i=new FormData;return i.append("file",n,e),this.location(await this.request(r,"POST",i))}async preview(n){let e=new URL(W(n));if(e.origin!=="https://pika.page"||!e.pathname.startsWith("/micropub/media/"))throw new Error("Authenticated previews are limited to Pika media URLs.");let r=await(await this.request(e.href,"GET")).blob();if(!["image/jpeg","image/png","image/gif","image/webp"].includes(r.type))throw new Error("Pika did not return a supported image.");return r}};var rr={};function ze(t,n){let e=n||rr,r=typeof e.includeImageAlt=="boolean"?e.includeImageAlt:!0,i=typeof e.includeHtml=="boolean"?e.includeHtml:!0;return cn(t,r,i)}function cn(t,n,e){if(ir(t)){if("value"in t)return t.type==="html"&&!e?"":t.value;if(n&&"alt"in t&&t.alt)return t.alt;if("children"in t)return ln(t.children,n,e)}return Array.isArray(t)?ln(t,n,e):""}function ln(t,n,e){let r=[],i=-1;for(;++i<t.length;)r[i]=cn(t[i],n,e);return r.join("")}function ir(t){return!!(t&&typeof t=="object")}var pn=document.createElement("i");function Mt(t){let n="&"+t+";";pn.innerHTML=n;let e=pn.textContent;return e.charCodeAt(e.length-1)===59&&t!=="semi"||e===n?!1:e}function X(t,n,e,r){let i=t.length,o=0,a;if(n<0?n=-n>i?0:i+n:n=n>i?i:n,e=e>0?e:0,r.length<1e4)a=Array.from(r),a.unshift(n,e),t.splice(...a);else for(e&&t.splice(n,e);o<r.length;)a=r.slice(o,o+1e4),a.unshift(n,0),t.splice(...a),o+=1e4,n+=1e4}function K(t,n){return t.length>0?(X(t,t.length,0,n),t):n}var hn={}.hasOwnProperty;function fn(t){let n={},e=-1;for(;++e<t.length;)or(n,t[e]);return n}function or(t,n){let e;for(e in n){let i=(hn.call(t,e)?t[e]:void 0)||(t[e]={}),o=n[e],a;if(o)for(a in o){hn.call(i,a)||(i[a]=[]);let u=o[a];ar(i[a],Array.isArray(u)?u:u?[u]:[])}}}function ar(t,n){let e=-1,r=[];for(;++e<n.length;)(n[e].add==="after"?t:r).push(n[e]);X(t,0,0,r)}function re(t,n){let e=Number.parseInt(t,n);return e<9||e===11||e>13&&e<32||e>126&&e<160||e>55295&&e<57344||e>64975&&e<65008||(e&65535)===65535||(e&65535)===65534||e>1114111?"\uFFFD":String.fromCodePoint(e)}function gt(t){return t.replace(/[\t\n\r ]+/g," ").replace(/^ | $/g,"").toLowerCase().toUpperCase()}var nt=wt(/[A-Za-z]/),Z=wt(/[\dA-Za-z]/),dn=wt(/[#-'*+\--9=?A-Z^-~]/);function Ht(t){return t!==null&&(t<32||t===127)}var jt=wt(/\d/),mn=wt(/[\dA-Fa-f]/),gn=wt(/[!-/:-@[-`{-~]/);function b(t){return t!==null&&t<-2}function V(t){return t!==null&&(t<0||t===32)}function C(t){return t===-2||t===-1||t===32}var kn=wt(new RegExp("\\p{P}|\\p{S}","u")),wn=wt(/\s/);function wt(t){return n;function n(e){return e!==null&&e>-1&&t.test(String.fromCharCode(e))}}function z(t,n,e,r){let i=r?r-1:1/0,o=0;return a;function a(p){return C(p)?(t.enter(e),u(p)):n(p)}function u(p){return C(p)&&o++<i?(t.consume(p),u):(t.exit(e),n(p))}}function ve(t,n,e,r,i,o){let a=0;return u;function u(s){return o>0&&C(s)?(t.enter(r),p(s)):f(s)}function p(s){return C(s)&&a<o?(t.consume(s),a++,p):(t.exit(r),f(s))}function f(s){return a>=i?n(s):e(s)}}var xn={tokenize:sr};function sr(t){let n=t.attempt(this.parser.constructs.contentInitial,r,i),e;return n;function r(u){if(u===null){t.consume(u);return}return t.enter("lineEnding"),t.consume(u),t.exit("lineEnding"),z(t,n,"linePrefix")}function i(u){return t.enter("paragraph"),o(u)}function o(u){let p=t.enter("chunkText",{contentType:"text",previous:e});return e&&(e.next=p),e=p,a(u)}function a(u){if(u===null){t.exit("chunkText"),t.exit("paragraph"),t.consume(u);return}return b(u)?(t.consume(u),t.exit("chunkText"),o):(t.consume(u),a)}}var kt=class{constructor(){this.index=new Map,this.map=[]}add(n,e,r){yn(this,n,e,r,!1)}addBefore(n,e,r){yn(this,n,e,r,!0)}consume(n){if(this.map.sort(function(o,a){return o[0]-a[0]}),this.map.length===0)return;let e=this.map.length,r=[];for(;e>0;)e-=1,r.push(n.slice(this.map[e][0]+this.map[e][1]),this.map[e][2]),n.length=this.map[e][0];r.push(n.slice()),n.length=0;let i=r.pop();for(;i;){for(let o of i)n.push(o);i=r.pop()}this.map.length=0,this.index.clear()}};function yn(t,n,e,r,i){if(e===0&&r.length===0)return;let o=t.index.get(n);if(o){o[1]+=e,i?(r.push(...o[2]),o[2]=r):o[2].push(...r);return}let a=[n,e,r];t.map.push(a),t.index.set(n,a)}var Sn={tokenize:ur},bn={tokenize:lr};function ur(t){let n=this,e=[],r=0,i,o,a;return u;function u(y){if(r<e.length){let _=e[r];return n.containerState=_[1],t.attempt(_[0].continuation,p,f)(y)}return f(y)}function p(y){if(r++,n.containerState._closeFlow){n.containerState._closeFlow=void 0,i&&M();let _=n.events.length,U=_,k;for(;U--;)if(n.events[U][0]==="exit"&&n.events[U][1].type==="chunkFlow"){k=n.events[U][1].end;break}w(r);let P=_;for(;P<n.events.length;)n.events[P][1].end={...k},P++;let O=new kt;return O.add(U+1,0,n.events.slice(_)),O.add(_,P-_,[]),O.consume(n.events),f(y)}return u(y)}function f(y){if(r===e.length){if(!i)return d(y);if(i.currentConstruct&&i.currentConstruct.concrete)return L(y);n.interrupt=!!(i.currentConstruct&&!i._gfmTableDynamicInterruptHack)}return n.containerState={},t.check(bn,s,m)(y)}function s(y){return i&&M(),w(r),d(y)}function m(y){return n.parser.lazy[n.now().line]=r!==e.length,a=n.now().offset,L(y)}function d(y){return n.containerState={},t.attempt(bn,l,L)(y)}function l(y){return r++,e.push([n.currentConstruct,n.containerState]),d(y)}function L(y){if(y===null){i&&M(),w(0),t.consume(y);return}return i=i||n.parser.flow(n.now()),t.enter("chunkFlow",{_tokenizer:i,contentType:"flow",previous:o}),S(y)}function S(y){if(y===null){A(t.exit("chunkFlow"),!0),w(0),t.consume(y);return}return b(y)?(t.consume(y),A(t.exit("chunkFlow")),r=0,n.interrupt=void 0,u):(t.consume(y),S)}function A(y,_){let U=n.sliceStream(y);if(_&&U.push(null),y.previous=o,o&&(o.next=y),o=y,i.defineSkip(y.start),i.write(U),n.parser.lazy[y.start.line]){let k=i.events.length;for(;k--;)if(i.events[k][1].start.offset<a&&(!i.events[k][1].end||i.events[k][1].end.offset>a))return;let P=n.events.length,O=P,B,H;for(;O--;)if(n.events[O][0]==="exit"&&n.events[O][1].type==="chunkFlow"){if(B){H=n.events[O][1].end;break}B=!0}for(w(r),k=P;k<n.events.length;)n.events[k][1].end={...H},k++;let Y=new kt;Y.add(O+1,0,n.events.slice(P)),Y.add(P,k-P,[]),Y.consume(n.events)}}function w(y){let _=e.length;for(;_-- >y;){let U=e[_];n.containerState=U[1],U[0].exit.call(n,t)}e.length=y}function M(){i.write([null]),o=void 0,i=void 0,n.containerState._closeFlow=void 0}}function lr(t,n,e){return z(t,t.attempt(this.parser.constructs.document,n,e),"linePrefix",this.parser.constructs.disable.null.includes("codeIndented")?void 0:4)}function Fe(t){if(t===null||V(t)||wn(t))return 1;if(kn(t))return 2}function Rt(t,n,e){let r=[],i=-1;for(;++i<t.length;){let o=t[i].resolveAll;o&&!r.includes(o)&&(n=o(n,e),r.push(o))}return n}var Vt={name:"attention",resolveAll:cr,tokenize:pr};function cr(t,n){let e=-1,r;for(;++e<t.length;)if(t[e][0]==="enter"&&t[e][1].type==="attentionSequence"&&t[e][1]._close){let i=e;for(;i--;)if(t[i][0]==="exit"&&t[i][1].type==="attentionSequence"&&t[i][1]._open&&n.sliceSerialize(t[i][1]).charCodeAt(0)===n.sliceSerialize(t[e][1]).charCodeAt(0)){if((t[i][1]._close||t[e][1]._open)&&(t[e][1].end.offset-t[e][1].start.offset)%3&&!((t[i][1].end.offset-t[i][1].start.offset+t[e][1].end.offset-t[e][1].start.offset)%3))continue;let o=t[i][1].end.offset-t[i][1].start.offset>1&&t[e][1].end.offset-t[e][1].start.offset>1?2:1,a={...t[i][1].end},u={...t[e][1].start};En(a,-o),En(u,o);let p={type:o>1?"strongSequence":"emphasisSequence",start:a,end:{...t[i][1].end}},f={type:o>1?"strongSequence":"emphasisSequence",start:{...t[e][1].start},end:u},s={type:o>1?"strongText":"emphasisText",start:{...t[i][1].end},end:{...t[e][1].start}},m={type:o>1?"strong":"emphasis",start:{...p.start},end:{...f.end}};t[i][1].end={...p.start},t[e][1].start={...f.end},r=[],t[i][1].end.offset-t[i][1].start.offset&&(r=K(r,[["enter",t[i][1],n],["exit",t[i][1],n]])),r=K(r,[["enter",m,n],["enter",p,n],["exit",p,n],["enter",s,n]]),r=K(r,Rt(n.parser.constructs.insideSpan.null,t.slice(i+1,e),n)),r=K(r,[["exit",s,n],["enter",f,n],["exit",f,n],["exit",m,n]]);let d=0;t[e][1].end.offset-t[e][1].start.offset&&(d=2,r=K(r,[["enter",t[e][1],n],["exit",t[e][1],n]])),X(t,i-1,e-i+3,r),e=i+r.length-d-2;break}}for(e=-1;++e<t.length;)t[e][1].type==="attentionSequence"&&(t[e][1].type="data");return t}function pr(t,n){let e=this.parser.constructs.attentionMarkers.null,r=this.previous,i=Fe(r),o;return a;function a(p){return o=p,t.enter("attentionSequence"),u(p)}function u(p){if(p===o)return t.consume(p),u;let f=t.exit("attentionSequence"),s=Fe(p),m=!s||s===2&&i||e.includes(p)&&p!==42&&p!==95,d=!i||i===2&&s||e.includes(r)&&r!==42&&r!==95;return f._open=!!(o===42?m:m&&(i||!d)),f._close=!!(o===42?d:d&&(s||!m)),n(p)}}function En(t,n){t.column+=n,t.offset+=n,t._bufferIndex+=n}var Me={name:"autolink",tokenize:hr};function hr(t,n,e){let r=0;return i;function i(l){return t.enter("autolink"),t.enter("autolinkMarker"),t.consume(l),t.exit("autolinkMarker"),t.enter("autolinkProtocol"),o}function o(l){return nt(l)?(t.consume(l),a):l===64?e(l):f(l)}function a(l){return l===43||l===45||l===46||Z(l)?(r=1,u(l)):f(l)}function u(l){return l===58?(t.consume(l),r=0,p):(l===43||l===45||l===46||Z(l))&&r++<32?(t.consume(l),u):(r=0,f(l))}function p(l){return l===62?(t.exit("autolinkProtocol"),t.enter("autolinkMarker"),t.consume(l),t.exit("autolinkMarker"),t.exit("autolink"),n):l===null||l===32||l===60||Ht(l)?e(l):(t.consume(l),p)}function f(l){return l===64?(t.consume(l),s):dn(l)?(t.consume(l),f):e(l)}function s(l){return Z(l)?m(l):e(l)}function m(l){return l===46?(t.consume(l),r=0,s):l===62?(t.exit("autolinkProtocol").type="autolinkEmail",t.enter("autolinkMarker"),t.consume(l),t.exit("autolinkMarker"),t.exit("autolink"),n):d(l)}function d(l){if((l===45||Z(l))&&r++<63){let L=l===45?d:m;return t.consume(l),L}return e(l)}}var xt={partial:!0,tokenize:fr};function fr(t,n,e){return r;function r(o){return C(o)?z(t,i,"linePrefix")(o):i(o)}function i(o){return o===null||b(o)?n(o):e(o)}}var ie={continuation:{tokenize:mr},exit:gr,name:"blockQuote",tokenize:dr};function dr(t,n,e){let r=this;return i;function i(a){if(a===62){let u=r.containerState;return u.open||(t.enter("blockQuote",{_container:!0}),u.open=!0),t.enter("blockQuotePrefix"),t.enter("blockQuoteMarker"),t.consume(a),t.exit("blockQuoteMarker"),o}return e(a)}function o(a){return C(a)?(t.enter("blockQuotePrefixWhitespace"),t.consume(a),t.exit("blockQuotePrefixWhitespace"),t.exit("blockQuotePrefix"),n):(t.exit("blockQuotePrefix"),n(a))}}function mr(t,n,e){let r=this;return i;function i(a){return C(a)?z(t,o,"linePrefix",r.parser.constructs.disable.null.includes("codeIndented")?void 0:4)(a):o(a)}function o(a){return t.attempt(ie,n,e)(a)}}function gr(t){t.exit("blockQuote")}var oe={name:"characterEscape",tokenize:kr};function kr(t,n,e){return r;function r(o){return t.enter("characterEscape"),t.enter("escapeMarker"),t.consume(o),t.exit("escapeMarker"),i}function i(o){return gn(o)?(t.enter("characterEscapeValue"),t.consume(o),t.exit("characterEscapeValue"),t.exit("characterEscape"),n):e(o)}}var ae={name:"characterReference",tokenize:wr};function wr(t,n,e){let r=this,i=0,o,a;return u;function u(m){return t.enter("characterReference"),t.enter("characterReferenceMarker"),t.consume(m),t.exit("characterReferenceMarker"),p}function p(m){return m===35?(t.enter("characterReferenceMarkerNumeric"),t.consume(m),t.exit("characterReferenceMarkerNumeric"),f):(t.enter("characterReferenceValue"),o=31,a=Z,s(m))}function f(m){return m===88||m===120?(t.enter("characterReferenceMarkerHexadecimal"),t.consume(m),t.exit("characterReferenceMarkerHexadecimal"),t.enter("characterReferenceValue"),o=6,a=mn,s):(t.enter("characterReferenceValue"),o=7,a=jt,s(m))}function s(m){if(m===59&&i){let d=t.exit("characterReferenceValue");return a===Z&&!Mt(r.sliceSerialize(d))?e(m):(t.enter("characterReferenceMarker"),t.consume(m),t.exit("characterReferenceMarker"),t.exit("characterReference"),n)}return a(m)&&i++<o?(t.consume(m),s):e(m)}}var $t={partial:!0,tokenize:xr};function xr(t,n,e){let r=this;return i;function i(a){return a===null?e(a):(t.enter("lineEnding"),t.consume(a),t.exit("lineEnding"),o)}function o(a){return r.parser.lazy[r.now().line]?e(a):n(a)}}var se={concrete:!0,name:"codeFenced",tokenize:yr};function yr(t,n,e){let r=this,i={partial:!0,tokenize:U},o=0,a=0,u;return p;function p(k){return f(k)}function f(k){let P=r.events[r.events.length-1];return o=P&&P[1].type==="linePrefix"?P[2].sliceSerialize(P[1],!0).length:0,u=k,t.enter("codeFenced"),t.enter("codeFencedFence"),t.enter("codeFencedFenceSequence"),s(k)}function s(k){return k===u?(a++,t.consume(k),s):a<3?e(k):(t.exit("codeFencedFenceSequence"),C(k)?z(t,m,"whitespace")(k):m(k))}function m(k){return k===null||b(k)?(t.exit("codeFencedFence"),r.interrupt?n(k):t.check($t,S,_)(k)):(t.enter("codeFencedFenceInfo"),t.enter("chunkString",{contentType:"string"}),d(k))}function d(k){return k===null||b(k)?(t.exit("chunkString"),t.exit("codeFencedFenceInfo"),m(k)):C(k)?(t.exit("chunkString"),t.exit("codeFencedFenceInfo"),z(t,l,"whitespace")(k)):k===96&&k===u?e(k):(t.consume(k),d)}function l(k){return k===null||b(k)?m(k):(t.enter("codeFencedFenceMeta"),t.enter("chunkString",{contentType:"string"}),L(k))}function L(k){return k===null||b(k)?(t.exit("chunkString"),t.exit("codeFencedFenceMeta"),m(k)):k===96&&k===u?e(k):(t.consume(k),L)}function S(k){return t.attempt(i,_,A)(k)}function A(k){return t.enter("lineEnding"),t.consume(k),t.exit("lineEnding"),w}function w(k){return o>0&&C(k)?z(t,M,"linePrefix",o+1)(k):M(k)}function M(k){return k===null||b(k)?t.check($t,S,_)(k):(t.enter("codeFlowValue"),y(k))}function y(k){return k===null||b(k)?(t.exit("codeFlowValue"),M(k)):(t.consume(k),y)}function _(k){return t.exit("codeFenced"),n(k)}function U(k,P,O){let B=0;return H;function H(v){return k.enter("lineEnding"),k.consume(v),k.exit("lineEnding"),Y}function Y(v){return k.enter("codeFencedFence"),C(v)?z(k,D,"linePrefix",r.parser.constructs.disable.null.includes("codeIndented")?void 0:4)(v):D(v)}function D(v){return v===u?(k.enter("codeFencedFenceSequence"),E(v)):O(v)}function E(v){return v===u?(B++,k.consume(v),E):B>=a?(k.exit("codeFencedFenceSequence"),C(v)?z(k,R,"whitespace")(v):R(v)):O(v)}function R(v){return v===null||b(v)?(k.exit("codeFencedFence"),P(v)):O(v)}}}var Wt={name:"codeIndented",tokenize:Sr},br={partial:!0,tokenize:Er};function Sr(t,n,e){return r;function r(u){return t.enter("codeIndented"),ve(t,i,e,"linePrefix",4,4)(u)}function i(u){return u===null?a(u):b(u)?t.attempt(br,i,a)(u):(t.enter("codeFlowValue"),o(u))}function o(u){return u===null||b(u)?(t.exit("codeFlowValue"),i(u)):(t.consume(u),o)}function a(u){return t.exit("codeIndented"),n(u)}}function Er(t,n,e){let r=this;return i;function i(a){return r.parser.lazy[r.now().line]?e(a):b(a)?(t.enter("lineEnding"),t.consume(a),t.exit("lineEnding"),i):ve(t,n,o,"linePrefix",4,4)(a)}function o(a){return b(a)?i(a):e(a)}}var Re={name:"codeText",previous:Ir,resolve:Pr,tokenize:Cr};function Pr(t){let n=t.length-4,e=3,r,i;if((t[e][1].type==="lineEnding"||t[e][1].type==="space")&&(t[n][1].type==="lineEnding"||t[n][1].type==="space")){for(r=e;++r<n;)if(t[r][1].type==="codeTextData"){t[e][1].type="codeTextPadding",t[n][1].type="codeTextPadding",e+=2,n-=2;break}}for(r=e-1,n++;++r<=n;)i===void 0?r!==n&&t[r][1].type!=="lineEnding"&&(i=r):(r===n||t[r][1].type==="lineEnding")&&(t[i][1].type="codeTextData",r!==i+2&&(t[i][1].end=t[r-1][1].end,t.splice(i+2,r-i-2),n-=r-i-2,r=i+2),i=void 0);return t}function Ir(t){return t!==96||this.events[this.events.length-1][1].type==="characterEscape"}function Cr(t,n,e){let r=this,i=0,o,a;return u;function u(d){return t.enter("codeText"),t.enter("codeTextSequence"),p(d)}function p(d){return d===96?(t.consume(d),i++,p):(t.exit("codeTextSequence"),f(d))}function f(d){return d===null?e(d):d===32?(t.enter("space"),t.consume(d),t.exit("space"),f):d===96?(a=t.enter("codeTextSequence"),o=0,m(d)):b(d)?(t.enter("lineEnding"),t.consume(d),t.exit("lineEnding"),f):(t.enter("codeTextData"),s(d))}function s(d){return d===null||d===32||d===96||b(d)?(t.exit("codeTextData"),f(d)):(t.consume(d),s)}function m(d){return d===96?(t.consume(d),o++,m):o===i?(t.exit("codeTextSequence"),t.exit("codeText"),n(d)):(a.type="codeTextData",s(d))}}var ue=class{constructor(n){this.left=n?[...n]:[],this.right=[]}get(n){if(n<0||n>=this.left.length+this.right.length)throw new RangeError("Cannot access index `"+n+"` in a splice buffer of size `"+(this.left.length+this.right.length)+"`");return n<this.left.length?this.left[n]:this.right[this.right.length-n+this.left.length-1]}get length(){return this.left.length+this.right.length}shift(){return this.setCursor(0),this.right.pop()}slice(n,e){let r=e??Number.POSITIVE_INFINITY;return r<this.left.length?this.left.slice(n,r):n>this.left.length?this.right.slice(this.right.length-r+this.left.length,this.right.length-n+this.left.length).reverse():this.left.slice(n).concat(this.right.slice(this.right.length-r+this.left.length).reverse())}splice(n,e,r){let i=e||0;this.setCursor(Math.trunc(n));let o=this.right.splice(this.right.length-i,Number.POSITIVE_INFINITY);return r&&Qt(this.left,r),o.reverse()}pop(){return this.setCursor(Number.POSITIVE_INFINITY),this.left.pop()}push(n){this.setCursor(Number.POSITIVE_INFINITY),this.left.push(n)}pushMany(n){this.setCursor(Number.POSITIVE_INFINITY),Qt(this.left,n)}unshift(n){this.setCursor(0),this.right.push(n)}unshiftMany(n){this.setCursor(0),Qt(this.right,n.reverse())}setCursor(n){if(!(n===this.left.length||n>this.left.length&&this.right.length===0||n<0&&this.left.length===0))if(n<this.left.length){let e=this.left.splice(n,Number.POSITIVE_INFINITY);Qt(this.right,e.reverse())}else{let e=this.right.splice(this.left.length+this.right.length-n,Number.POSITIVE_INFINITY);Qt(this.left,e.reverse())}}};function Qt(t,n){let e=0;if(n.length<1e4)t.push(...n);else for(;e<n.length;)t.push(...n.slice(e,e+1e4)),e+=1e4}function le(t){let n={},e=-1,r,i,o,a,u,p,f,s=new ue(t);for(;++e<s.length;){for(;e in n;)e=n[e];if(r=s.get(e),e&&r[1].type==="chunkFlow"&&s.get(e-1)[1].type==="listItemPrefix"&&(p=r[1]._tokenizer.events,o=0,o<p.length&&p[o][1].type==="lineEndingBlank"&&(o+=2),o<p.length&&p[o][1].type==="content"))for(;++o<p.length&&p[o][1].type!=="content";)p[o][1].type==="chunkText"&&(p[o][1]._isInFirstContentOfListItem=!0,o++);if(r[0]==="enter")r[1].contentType&&(Object.assign(n,Tr(s,e)),e=n[e],f=!0);else if(r[1]._container){for(o=e,i=void 0;o--;)if(a=s.get(o),a[1].type==="lineEnding"||a[1].type==="lineEndingBlank")a[0]==="enter"&&(i&&(s.get(i)[1].type="lineEndingBlank"),a[1].type="lineEnding",i=o);else if(!(a[1].type==="linePrefix"||a[1].type==="listItemIndent"))break;i&&(r[1].end={...s.get(i)[1].start},u=s.slice(i,e),u.unshift(r),s.splice(i,e-i+1,u))}}return X(t,0,Number.POSITIVE_INFINITY,s.slice(0)),!f}function Tr(t,n){let e=t.get(n)[1],r=t.get(n)[2],i=n-1,o=[],a=e._tokenizer;a||(a=r.parser[e.contentType](e.start),e._contentTypeTextTrailing&&(a._contentTypeTextTrailing=!0));let u=a.events,p=[],f={},s,m,d=-1,l=e,L=0,S=0,A=[S];for(;l;){for(;t.get(++i)[1]!==l;);o.push(i),l._tokenizer||(s=r.sliceStream(l),l.next||s.push(null),m&&a.defineSkip(l.start),l._isInFirstContentOfListItem&&(a._gfmTasklistFirstContentOfListItem=!0),a.write(s),l._isInFirstContentOfListItem&&(a._gfmTasklistFirstContentOfListItem=void 0)),m=l,l=l.next}for(l=e;++d<u.length;)u[d][0]==="exit"&&u[d-1][0]==="enter"&&u[d][1].type===u[d-1][1].type&&u[d][1].start.line!==u[d][1].end.line&&(S=d+1,A.push(S),l._tokenizer=void 0,l.previous=void 0,l=l.next);for(a.events=[],l?(l._tokenizer=void 0,l.previous=void 0):A.pop(),d=A.length;d--;){let w=u.slice(A[d],A[d+1]),M=o.pop();p.push([M,M+w.length-1]),t.splice(M,2,w)}for(p.reverse(),d=-1;++d<p.length;)f[L+p[d][0]]=L+p[d][1],L+=p[d][1]-p[d][0]-1;return f}var _e={resolve:Ar,tokenize:zr},Lr={partial:!0,tokenize:vr};function Ar(t){return le(t),t}function zr(t,n){let e;return r;function r(u){return t.enter("content"),e=t.enter("chunkContent",{contentType:"content"}),i(u)}function i(u){return u===null?o(u):b(u)?t.check(Lr,a,o)(u):(t.consume(u),i)}function o(u){return t.exit("chunkContent"),t.exit("content"),n(u)}function a(u){return t.consume(u),t.exit("chunkContent"),e.next=t.enter("chunkContent",{contentType:"content",previous:e}),e=e.next,i}}function vr(t,n,e){let r=this;return i;function i(a){return t.exit("chunkContent"),t.enter("lineEnding"),t.consume(a),t.exit("lineEnding"),z(t,o,"linePrefix")}function o(a){if(a===null||b(a))return e(a);let u=r.events[r.events.length-1];return!r.parser.constructs.disable.null.includes("codeIndented")&&u&&u[1].type==="linePrefix"&&u[2].sliceSerialize(u[1],!0).length>=4?n(a):t.interrupt(r.parser.constructs.flow,e,n)(a)}}function ce(t,n,e,r,i,o,a,u,p){let f=p||Number.POSITIVE_INFINITY,s=0;return m;function m(w){return w===60?(t.enter(r),t.enter(i),t.enter(o),t.consume(w),t.exit(o),d):w===null||w===32||w===41||Ht(w)?e(w):(t.enter(r),t.enter(a),t.enter(u),t.enter("chunkString",{contentType:"string"}),S(w))}function d(w){return w===62?(t.enter(o),t.consume(w),t.exit(o),t.exit(i),t.exit(r),n):(t.enter(u),t.enter("chunkString",{contentType:"string"}),l(w))}function l(w){return w===62?(t.exit("chunkString"),t.exit(u),d(w)):w===null||w===60||b(w)?e(w):(t.consume(w),w===92?L:l)}function L(w){return w===60||w===62||w===92?(t.consume(w),l):l(w)}function S(w){return!s&&(w===null||w===41||V(w))?(t.exit("chunkString"),t.exit(u),t.exit(a),t.exit(r),n(w)):s<f&&w===40?(t.consume(w),s++,S):w===41?(t.consume(w),s--,S):w===null||w===32||w===40||Ht(w)?e(w):(t.consume(w),w===92?A:S)}function A(w){return w===40||w===41||w===92?(t.consume(w),S):S(w)}}function pe(t,n,e,r,i,o){let a=this,u=0,p;return f;function f(l){return t.enter(r),t.enter(i),t.consume(l),t.exit(i),t.enter(o),s}function s(l){return u>999||l===null||l===91||l===93&&!p||l===94&&!u&&"_hiddenFootnoteSupport"in a.parser.constructs?e(l):l===93?(t.exit(o),t.enter(i),t.consume(l),t.exit(i),t.exit(r),n):b(l)?(t.enter("lineEnding"),t.consume(l),t.exit("lineEnding"),s):(t.enter("chunkString",{contentType:"string"}),m(l))}function m(l){return l===null||l===91||l===93||b(l)||u++>999?(t.exit("chunkString"),s(l)):(t.consume(l),p||(p=!C(l)),l===92?d:m)}function d(l){return l===91||l===92||l===93?(t.consume(l),u++,m):m(l)}}function he(t,n,e,r,i,o){let a;return u;function u(d){return d===34||d===39||d===40?(t.enter(r),t.enter(i),t.consume(d),t.exit(i),a=d===40?41:d,p):e(d)}function p(d){return d===a?(t.enter(i),t.consume(d),t.exit(i),t.exit(r),n):(t.enter(o),f(d))}function f(d){return d===a?(t.exit(o),p(a)):d===null?e(d):b(d)?(t.enter("lineEnding"),t.consume(d),t.exit("lineEnding"),z(t,f,"linePrefix")):(t.enter("chunkString",{contentType:"string"}),s(d))}function s(d){return d===a||d===null||b(d)?(t.exit("chunkString"),f(d)):(t.consume(d),d===92?m:s)}function m(d){return d===a||d===92?(t.consume(d),s):s(d)}}function Tt(t,n){let e;return r;function r(i){return b(i)?(t.enter("lineEnding"),t.consume(i),t.exit("lineEnding"),e=!0,r):C(i)?z(t,r,e?"linePrefix":"lineSuffix")(i):n(i)}}var Oe={name:"definition",tokenize:Mr},Fr={partial:!0,tokenize:Rr};function Mr(t,n,e){let r=this,i;return o;function o(l){return t.enter("definition"),a(l)}function a(l){return pe.call(r,t,u,e,"definitionLabel","definitionLabelMarker","definitionLabelString")(l)}function u(l){return i=gt(r.sliceSerialize(r.events[r.events.length-1][1]).slice(1,-1)),l===58?(t.enter("definitionMarker"),t.consume(l),t.exit("definitionMarker"),p):e(l)}function p(l){return V(l)?Tt(t,f)(l):f(l)}function f(l){return ce(t,s,e,"definitionDestination","definitionDestinationLiteral","definitionDestinationLiteralMarker","definitionDestinationRaw","definitionDestinationString")(l)}function s(l){return t.attempt(Fr,m,m)(l)}function m(l){return C(l)?z(t,d,"whitespace")(l):d(l)}function d(l){return l===null||b(l)?(t.exit("definition"),r.parser.defined.push(i),n(l)):e(l)}}function Rr(t,n,e){return r;function r(u){return V(u)?Tt(t,i)(u):e(u)}function i(u){return he(t,o,e,"definitionTitle","definitionTitleMarker","definitionTitleString")(u)}function o(u){return C(u)?z(t,a,"whitespace")(u):a(u)}function a(u){return u===null||b(u)?n(u):e(u)}}var Be={name:"hardBreakEscape",tokenize:_r};function _r(t,n,e){return r;function r(o){return t.enter("hardBreakEscape"),t.consume(o),i}function i(o){return b(o)?(t.exit("hardBreakEscape"),n(o)):e(o)}}var De={name:"headingAtx",resolve:Or,tokenize:Br};function Or(t,n){let e=t.length-2,r=3;if(t[r][1].type==="whitespace"&&(r+=2),e-2>r&&t[e][1].type==="whitespace"&&(e-=2),t[e][1].type==="atxHeadingSequence"&&(r===e-1||e-4>r&&t[e-2][1].type==="whitespace")&&(e-=r+1===e?2:4),e>r){let i={type:"atxHeadingText",start:t[r][1].start,end:t[e][1].end},o={type:"chunkText",start:t[r][1].start,end:t[e][1].end,contentType:"text"};X(t,r,e-r+1,[["enter",i,n],["enter",o,n],["exit",o,n],["exit",i,n]])}return t}function Br(t,n,e){let r=0;return i;function i(s){return t.enter("atxHeading"),o(s)}function o(s){return t.enter("atxHeadingSequence"),a(s)}function a(s){return s===35&&r++<6?(t.consume(s),a):s===null||V(s)?(t.exit("atxHeadingSequence"),u(s)):e(s)}function u(s){return s===35?(t.enter("atxHeadingSequence"),p(s)):s===null||b(s)?(t.exit("atxHeading"),n(s)):C(s)?z(t,u,"whitespace")(s):(t.enter("atxHeadingText"),f(s))}function p(s){return s===35?(t.consume(s),p):(t.exit("atxHeadingSequence"),u(s))}function f(s){return s===null||s===35||V(s)?(t.exit("atxHeadingText"),u(s)):(t.consume(s),f)}}var Pn=["address","article","aside","base","basefont","blockquote","body","caption","center","col","colgroup","dd","details","dialog","dir","div","dl","dt","fieldset","figcaption","figure","footer","form","frame","frameset","h1","h2","h3","h4","h5","h6","head","header","hr","html","iframe","legend","li","link","main","menu","menuitem","nav","noframes","ol","optgroup","option","p","param","search","section","summary","table","tbody","td","tfoot","th","thead","title","tr","track","ul"],Ne=["pre","script","style","textarea"];var Ue={concrete:!0,name:"htmlFlow",resolveTo:Nr,tokenize:Ur},Dr={partial:!0,tokenize:qr};function Nr(t){let n=t.length;for(;n--&&!(t[n][0]==="enter"&&t[n][1].type==="htmlFlow"););return n>1&&t[n-2][1].type==="linePrefix"&&(t[n][1].start=t[n-2][1].start,t[n+1][1].start=t[n-2][1].start,t.splice(n-2,2)),t}function Ur(t,n,e){let r=this,i,o,a,u,p;return f;function f(h){return s(h)}function s(h){return t.enter("htmlFlow"),t.enter("htmlFlowData"),t.consume(h),m}function m(h){return h===33?(t.consume(h),d):h===47?(t.consume(h),o=!0,S):h===63?(t.consume(h),i=3,r.interrupt?n:c):nt(h)?(t.consume(h),a=String.fromCharCode(h),A):e(h)}function d(h){return h===45?(t.consume(h),i=2,l):h===91?(t.consume(h),i=5,u=0,L):nt(h)?(t.consume(h),i=4,r.interrupt?n:c):e(h)}function l(h){return h===45?(t.consume(h),r.interrupt?n:c):e(h)}function L(h){let tt="CDATA[";return h===tt.charCodeAt(u++)?(t.consume(h),u===tt.length?r.interrupt?n:D:L):e(h)}function S(h){return nt(h)?(t.consume(h),a=String.fromCharCode(h),A):e(h)}function A(h){if(h===null||h===47||h===62||V(h)){let tt=h===47,Pt=a.toLowerCase();return!tt&&!o&&Ne.includes(Pt)?(i=1,r.interrupt?n(h):D(h)):Pn.includes(a.toLowerCase())?(i=6,tt?(t.consume(h),w):r.interrupt?n(h):D(h)):(i=7,r.interrupt&&!r.parser.lazy[r.now().line]?e(h):o?M(h):y(h))}return h===45||Z(h)?(t.consume(h),a+=String.fromCharCode(h),A):e(h)}function w(h){return h===62?(t.consume(h),r.interrupt?n:D):e(h)}function M(h){return C(h)?(t.consume(h),M):H(h)}function y(h){return h===47?(t.consume(h),H):h===58||h===95||nt(h)?(t.consume(h),_):C(h)?(t.consume(h),y):H(h)}function _(h){return h===45||h===46||h===58||h===95||Z(h)?(t.consume(h),_):U(h)}function U(h){return h===61?(t.consume(h),k):C(h)?(t.consume(h),U):y(h)}function k(h){return h===null||h===60||h===61||h===62||h===96?e(h):h===34||h===39?(t.consume(h),p=h,P):C(h)?(t.consume(h),k):O(h)}function P(h){return h===p?(t.consume(h),p=null,B):h===null||b(h)?e(h):(t.consume(h),P)}function O(h){return h===null||h===34||h===39||h===47||h===60||h===61||h===62||h===96||V(h)?U(h):(t.consume(h),O)}function B(h){return h===47||h===62||C(h)?y(h):e(h)}function H(h){return h===62?(t.consume(h),Y):e(h)}function Y(h){return h===null||b(h)?D(h):C(h)?(t.consume(h),Y):e(h)}function D(h){return h===45&&i===2?(t.consume(h),j):h===60&&i===1?(t.consume(h),$):h===62&&i===4?(t.consume(h),rt):h===63&&i===3?(t.consume(h),c):h===93&&i===5?(t.consume(h),pt):b(h)&&(i===6||i===7)?(t.exit("htmlFlowData"),t.check(Dr,ht,E)(h)):h===null||b(h)?(t.exit("htmlFlowData"),E(h)):(t.consume(h),D)}function E(h){return t.check($t,R,ht)(h)}function R(h){return t.enter("lineEnding"),t.consume(h),t.exit("lineEnding"),v}function v(h){return h===null||b(h)?E(h):(t.enter("htmlFlowData"),D(h))}function j(h){return h===45?(t.consume(h),c):D(h)}function $(h){return h===47?(t.consume(h),a="",st):D(h)}function st(h){if(h===62){let tt=a.toLowerCase();return Ne.includes(tt)?(t.consume(h),rt):D(h)}return nt(h)&&a.length<8?(t.consume(h),a+=String.fromCharCode(h),st):D(h)}function pt(h){return h===93?(t.consume(h),c):D(h)}function c(h){return h===62?(t.consume(h),rt):h===45&&i===2?(t.consume(h),c):D(h)}function rt(h){return h===null||b(h)?(t.exit("htmlFlowData"),ht(h)):(t.consume(h),rt)}function ht(h){return t.exit("htmlFlow"),n(h)}}function qr(t,n,e){return r;function r(i){return t.enter("lineEnding"),t.consume(i),t.exit("lineEnding"),t.attempt(xt,n,e)}}var qe={name:"htmlText",tokenize:Hr};function Hr(t,n,e){let r=this,i,o,a;return u;function u(c){return t.enter("htmlText"),t.enter("htmlTextData"),t.consume(c),p}function p(c){return c===33?(t.consume(c),f):c===47?(t.consume(c),U):c===63?(t.consume(c),y):nt(c)?(t.consume(c),O):e(c)}function f(c){return c===45?(t.consume(c),s):c===91?(t.consume(c),o=0,L):nt(c)?(t.consume(c),M):e(c)}function s(c){return c===45?(t.consume(c),l):e(c)}function m(c){return c===null?e(c):c===45?(t.consume(c),d):b(c)?(a=m,$(c)):(t.consume(c),m)}function d(c){return c===45?(t.consume(c),l):m(c)}function l(c){return c===62?j(c):c===45?d(c):m(c)}function L(c){let rt="CDATA[";return c===rt.charCodeAt(o++)?(t.consume(c),o===rt.length?S:L):e(c)}function S(c){return c===null?e(c):c===93?(t.consume(c),A):b(c)?(a=S,$(c)):(t.consume(c),S)}function A(c){return c===93?(t.consume(c),w):S(c)}function w(c){return c===62?j(c):c===93?(t.consume(c),w):S(c)}function M(c){return c===null||c===62?j(c):b(c)?(a=M,$(c)):(t.consume(c),M)}function y(c){return c===null?e(c):c===63?(t.consume(c),_):b(c)?(a=y,$(c)):(t.consume(c),y)}function _(c){return c===62?j(c):y(c)}function U(c){return nt(c)?(t.consume(c),k):e(c)}function k(c){return c===45||Z(c)?(t.consume(c),k):P(c)}function P(c){return b(c)?(a=P,$(c)):C(c)?(t.consume(c),P):j(c)}function O(c){return c===45||Z(c)?(t.consume(c),O):c===47||c===62||V(c)?B(c):e(c)}function B(c){return c===47?(t.consume(c),j):c===58||c===95||nt(c)?(t.consume(c),H):b(c)?(a=B,$(c)):C(c)?(t.consume(c),B):j(c)}function H(c){return c===45||c===46||c===58||c===95||Z(c)?(t.consume(c),H):Y(c)}function Y(c){return c===61?(t.consume(c),D):b(c)?(a=Y,$(c)):C(c)?(t.consume(c),Y):B(c)}function D(c){return c===null||c===60||c===61||c===62||c===96?e(c):c===34||c===39?(t.consume(c),i=c,E):b(c)?(a=D,$(c)):C(c)?(t.consume(c),D):(t.consume(c),R)}function E(c){return c===i?(t.consume(c),i=void 0,v):c===null?e(c):b(c)?(a=E,$(c)):(t.consume(c),E)}function R(c){return c===null||c===34||c===39||c===60||c===61||c===96?e(c):c===47||c===62||V(c)?B(c):(t.consume(c),R)}function v(c){return c===47||c===62||V(c)?B(c):e(c)}function j(c){return c===62?(t.consume(c),t.exit("htmlTextData"),t.exit("htmlText"),n):e(c)}function $(c){return t.exit("htmlTextData"),t.enter("lineEnding"),t.consume(c),t.exit("lineEnding"),st}function st(c){return C(c)?z(t,pt,"linePrefix",r.parser.constructs.disable.null.includes("codeIndented")?void 0:4)(c):pt(c)}function pt(c){return t.enter("htmlTextData"),a(c)}}var Lt={name:"labelEnd",resolveAll:Wr,resolveTo:Qr,tokenize:Yr},jr={tokenize:Gr},Vr={tokenize:Jr},$r={tokenize:Kr};function Wr(t){let n=-1,e=[];for(;++n<t.length;){let r=t[n][1];if(e.push(t[n]),r.type==="labelImage"||r.type==="labelLink"||r.type==="labelEnd"){let i=r.type==="labelImage"?4:2;r.type="data",n+=i}}return t.length!==e.length&&X(t,0,t.length,e),t}function Qr(t,n){let e=t.length,r=0,i,o,a;for(;e--;){let s=t[e][1];if(i){if(s.type==="link"||s.type==="labelLink"&&s._inactive)break;t[e][0]==="enter"&&s.type==="labelLink"&&(s._inactive=!0)}else if(o){if(t[e][0]==="enter"&&(s.type==="labelImage"||s.type==="labelLink")&&!s._balanced&&(i=e,s.type!=="labelLink")){r=2;break}}else s.type==="labelEnd"&&(o=e)}let u={type:t[i][1].type==="labelLink"?"link":"image",start:{...t[i][1].start},end:{...t[t.length-1][1].end}},p={type:"label",start:{...t[i][1].start},end:{...t[o][1].end}},f={type:"labelText",start:{...t[i+r+2][1].end},end:{...t[o-2][1].start}};return a=[["enter",u,n],["enter",p,n]],a=K(a,t.slice(i+1,i+r+3)),a=K(a,[["enter",f,n]]),a=K(a,Rt(n.parser.constructs.insideSpan.null,t.slice(i+r+4,o-3),n)),a=K(a,[["exit",f,n],t[o-2],t[o-1],["exit",p,n]]),a=K(a,t.slice(o+1)),a=K(a,[["exit",u,n]]),X(t,i,t.length,a),t}function Yr(t,n,e){let r=this,i=r._labelStarts,o,a;if(i){for(;i.length>0&&i[i.length-1]._balanced;)i.pop();o=i[i.length-1]}return u;function u(d){return o?o._inactive?m(d):(a=r.parser.defined.includes(gt(r.sliceSerialize({start:o.end,end:r.now()}))),t.enter("labelEnd"),t.enter("labelMarker"),t.consume(d),t.exit("labelMarker"),t.exit("labelEnd"),p):e(d)}function p(d){return d===40?t.attempt(jr,s,a?s:m)(d):d===91?t.attempt(Vr,s,a?f:m)(d):a?s(d):m(d)}function f(d){return t.attempt($r,s,m)(d)}function s(d){return i.pop(),n(d)}function m(d){return o._balanced=!0,e(d)}}function Gr(t,n,e){return r;function r(m){return t.enter("resource"),t.enter("resourceMarker"),t.consume(m),t.exit("resourceMarker"),i}function i(m){return V(m)?Tt(t,o)(m):o(m)}function o(m){return m===41?s(m):ce(t,a,u,"resourceDestination","resourceDestinationLiteral","resourceDestinationLiteralMarker","resourceDestinationRaw","resourceDestinationString",32)(m)}function a(m){return V(m)?Tt(t,p)(m):s(m)}function u(m){return e(m)}function p(m){return m===34||m===39||m===40?he(t,f,e,"resourceTitle","resourceTitleMarker","resourceTitleString")(m):s(m)}function f(m){return V(m)?Tt(t,s)(m):s(m)}function s(m){return m===41?(t.enter("resourceMarker"),t.consume(m),t.exit("resourceMarker"),t.exit("resource"),n):e(m)}}function Jr(t,n,e){let r=this;return i;function i(u){return pe.call(r,t,o,a,"reference","referenceMarker","referenceString")(u)}function o(u){return r.parser.defined.includes(gt(r.sliceSerialize(r.events[r.events.length-1][1]).slice(1,-1)))?n(u):e(u)}function a(u){return e(u)}}function Kr(t,n,e){return r;function r(o){return t.enter("reference"),t.enter("referenceMarker"),t.consume(o),t.exit("referenceMarker"),i}function i(o){return o===93?(t.enter("referenceMarker"),t.consume(o),t.exit("referenceMarker"),t.exit("reference"),n):e(o)}}var He={name:"labelStartImage",resolveAll:Lt.resolveAll,tokenize:Zr};function Zr(t,n,e){let r=this,i;return o;function o(p){return t.enter("labelImage"),t.enter("labelImageMarker"),t.consume(p),t.exit("labelImageMarker"),a}function a(p){return p===91?(t.enter("labelMarker"),t.consume(p),t.exit("labelMarker"),i=t.exit("labelImage"),u):e(p)}function u(p){return p===94&&"_hiddenFootnoteSupport"in r.parser.constructs?e(p):(r._labelStarts=r._labelStarts||[],r._labelStarts.push(i),n(p))}}var je={name:"labelStartLink",resolveAll:Lt.resolveAll,tokenize:Xr};function Xr(t,n,e){let r=this,i;return o;function o(u){return t.enter("labelLink"),t.enter("labelMarker"),t.consume(u),t.exit("labelMarker"),i=t.exit("labelLink"),a}function a(u){return u===94&&"_hiddenFootnoteSupport"in r.parser.constructs?e(u):(r._labelStarts=r._labelStarts||[],r._labelStarts.push(i),n(u))}}var Yt={name:"lineEnding",tokenize:ti};function ti(t,n){return e;function e(r){return t.enter("lineEnding"),t.consume(r),t.exit("lineEnding"),z(t,n,"linePrefix")}}var At={name:"thematicBreak",tokenize:ei};function ei(t,n,e){let r=0,i;return o;function o(f){return t.enter("thematicBreak"),a(f)}function a(f){return i=f,u(f)}function u(f){return f===i?(t.enter("thematicBreakSequence"),p(f)):r>=3&&(f===null||b(f))?(t.exit("thematicBreak"),n(f)):e(f)}function p(f){return f===i?(t.consume(f),r++,p):(t.exit("thematicBreakSequence"),C(f)?z(t,u,"whitespace")(f):u(f))}}var G={continuation:{tokenize:oi},exit:si,name:"list",tokenize:ii},ni={partial:!0,tokenize:ui},ri={partial:!0,tokenize:ai};function ii(t,n,e){let r=this,i=r.events[r.events.length-1],o=i&&i[1].type==="linePrefix"?i[2].sliceSerialize(i[1],!0).length:0,a=0;return u;function u(l){let L=r.containerState.type||(l===42||l===43||l===45?"listUnordered":"listOrdered");if(L==="listUnordered"?!r.containerState.marker||l===r.containerState.marker:jt(l)){if(r.containerState.type||(r.containerState.type=L,t.enter(L,{_container:!0})),L==="listUnordered")return t.enter("listItemPrefix"),l===42||l===45?t.check(At,e,f)(l):f(l);if(!r.interrupt||l===49)return t.enter("listItemPrefix"),t.enter("listItemValue"),p(l)}return e(l)}function p(l){return jt(l)&&++a<10?(t.consume(l),p):(!r.interrupt||a<2)&&(r.containerState.marker?l===r.containerState.marker:l===41||l===46)?(t.exit("listItemValue"),f(l)):e(l)}function f(l){return t.enter("listItemMarker"),t.consume(l),t.exit("listItemMarker"),r.containerState.marker=r.containerState.marker||l,t.check(xt,r.interrupt?e:s,t.attempt(ni,d,m))}function s(l){return r.containerState.initialBlankLine=!0,o++,d(l)}function m(l){return C(l)?(t.enter("listItemPrefixWhitespace"),t.consume(l),t.exit("listItemPrefixWhitespace"),d):e(l)}function d(l){return r.containerState.size=o+r.sliceSerialize(t.exit("listItemPrefix"),!0).length,n(l)}}function oi(t,n,e){let r=this;return r.containerState._closeFlow=void 0,t.check(xt,i,o);function i(u){return r.containerState.furtherBlankLines=r.containerState.furtherBlankLines||r.containerState.initialBlankLine,z(t,n,"listItemIndent",r.containerState.size+1)(u)}function o(u){return r.containerState.furtherBlankLines||!C(u)?(r.containerState.furtherBlankLines=void 0,r.containerState.initialBlankLine=void 0,a(u)):(r.containerState.furtherBlankLines=void 0,r.containerState.initialBlankLine=void 0,t.attempt(ri,n,a)(u))}function a(u){return r.containerState._closeFlow=!0,r.interrupt=void 0,z(t,t.attempt(G,n,e),"linePrefix",r.parser.constructs.disable.null.includes("codeIndented")?void 0:4)(u)}}function ai(t,n,e){let r=this;return z(t,i,"listItemIndent",r.containerState.size+1);function i(o){let a=r.events[r.events.length-1];return a&&a[1].type==="listItemIndent"&&a[2].sliceSerialize(a[1],!0).length===r.containerState.size?n(o):e(o)}}function si(t){t.exit(this.containerState.type)}function ui(t,n,e){let r=this;return z(t,i,"listItemPrefixWhitespace",r.parser.constructs.disable.null.includes("codeIndented")?void 0:5);function i(o){let a=r.events[r.events.length-1];return!C(o)&&a&&a[1].type==="listItemPrefixWhitespace"?n(o):e(o)}}var fe={name:"setextUnderline",resolveTo:li,tokenize:ci};function li(t,n){let e=new kt,r=t.length,i,o,a;for(;r--;)if(t[r][0]==="enter"){if(t[r][1].type==="content"){i=r;break}t[r][1].type==="paragraph"&&(o=r)}else t[r][1].type==="content"&&e.add(r,1,[]),!a&&t[r][1].type==="definition"&&(a=r);let u={type:"setextHeading",start:{...t[i][1].start},end:{...t[t.length-1][1].end}};return t[o][1].type="setextHeadingText",a?(e.add(o,0,[["enter",u,n]]),e.add(a+1,0,[["exit",t[i][1],n]]),t[i][1].end={...t[a][1].end}):t[i][1]=u,e.add(t.length,0,[["exit",u,n]]),e.consume(t),t}function ci(t,n,e){let r=this,i;return o;function o(f){let s=r.events.length,m;for(;s--;)if(r.events[s][1].type!=="lineEnding"&&r.events[s][1].type!=="linePrefix"&&r.events[s][1].type!=="content"){m=r.events[s][1].type==="paragraph";break}return!r.parser.lazy[r.now().line]&&(r.interrupt||m)?(t.enter("setextHeadingLine"),i=f,a(f)):e(f)}function a(f){return t.enter("setextHeadingLineSequence"),u(f)}function u(f){return f===i?(t.consume(f),u):(t.exit("setextHeadingLineSequence"),C(f)?z(t,p,"lineSuffix")(f):p(f))}function p(f){return f===null||b(f)?(t.exit("setextHeadingLine"),n(f)):e(f)}}var In={tokenize:pi};function pi(t){let n=this,e=t.attempt(xt,r,t.attempt(this.parser.constructs.flowInitial,i,z(t,t.attempt(this.parser.constructs.flow,i,t.attempt(_e,i)),"linePrefix")));return e;function r(o){if(o===null){t.consume(o);return}return t.enter("lineEndingBlank"),t.consume(o),t.exit("lineEndingBlank"),n.currentConstruct=void 0,e}function i(o){if(o===null){t.consume(o);return}return t.enter("lineEnding"),t.consume(o),t.exit("lineEnding"),n.currentConstruct=void 0,e}}var Cn={resolveAll:zn()},Tn=An("string"),Ln=An("text");function An(t){return{resolveAll:zn(t==="text"?hi:void 0),tokenize:n};function n(e){let r=this,i=this.parser.constructs[t],o=e.attempt(i,a,u);return a;function a(s){return f(s)?o(s):u(s)}function u(s){if(s===null){e.consume(s);return}return e.enter("data"),e.consume(s),p}function p(s){return f(s)?(e.exit("data"),o(s)):(e.consume(s),p)}function f(s){if(s===null)return!0;let m=i[s],d=-1;if(m)for(;++d<m.length;){let l=m[d];if(!l.previous||l.previous.call(r,r.previous))return!0}return!1}}}function zn(t){return n;function n(e,r){let i=-1,o;for(;++i<=e.length;)o===void 0?e[i]&&e[i][1].type==="data"&&(o=i,i++):(!e[i]||e[i][1].type!=="data")&&(i!==o+2&&(e[o][1].end=e[i-1][1].end,e.splice(o+2,i-o-2),i=o+2),o=void 0);return t?t(e,r):e}}function hi(t,n){let e=new kt,r=0;for(;++r<=t.length;)if((r===t.length||t[r][1].type==="lineEnding")&&t[r-1][1].type==="data"){let i=t[r-1][1],o=n.sliceStream(i),a=o.length,u=-1,p=0,f;for(;a--;){let s=o[a];if(typeof s=="string"){for(u=s.length;s.charCodeAt(u-1)===32;)p++,u--;if(u)break;u=-1}else if(s===-2)f=!0,p++;else if(s!==-1){a++;break}}if(n._contentTypeTextTrailing&&r===t.length&&(p=0),p){let s={type:r===t.length||f||p<2?"lineSuffix":"hardBreakTrailing",start:{_bufferIndex:a?u:i.start._bufferIndex+u,_index:i.start._index+a,line:i.end.line,column:i.end.column-p,offset:i.end.offset-p},end:{...i.end}};i.end={...s.start},i.start.offset===i.end.offset?Object.assign(i,s):e.add(r,0,[["enter",s,n],["exit",s,n]])}r++}return e.consume(t),t}var Ve={};tr(Ve,{attentionMarkers:()=>yi,contentInitial:()=>di,disable:()=>bi,document:()=>fi,flow:()=>gi,flowInitial:()=>mi,insideSpan:()=>xi,string:()=>ki,text:()=>wi});var fi={42:G,43:G,45:G,48:G,49:G,50:G,51:G,52:G,53:G,54:G,55:G,56:G,57:G,62:ie},di={91:Oe},mi={[-2]:Wt,[-1]:Wt,32:Wt},gi={35:De,42:At,45:[fe,At],60:Ue,61:fe,95:At,96:se,126:se},ki={38:ae,92:oe},wi={[-5]:Yt,[-4]:Yt,[-3]:Yt,33:He,38:ae,42:Vt,60:[Me,qe],91:je,92:[Be,oe],93:Lt,95:Vt,96:Re},xi={null:[Vt,Cn]},yi={null:[42,95]},bi={null:[]};function vn(t,n,e){let r={_bufferIndex:-1,_index:0,line:e&&e.line||1,column:e&&e.column||1,offset:e&&e.offset||0},i={},o=[],a=[],u=[],p=!0,f={attempt:B(P),check:B(O),consume:_,enter:U,exit:k,interrupt:B(O,{interrupt:!0})},s={code:null,containerState:{},defineSkip:w,events:[],now:A,parser:t,previous:null,sliceSerialize:L,sliceStream:S,write:l},m=n.tokenize.call(s,f),d;return n.resolveAll&&o.push(n),s;function l(E){return a=K(a,E),M(),a[a.length-1]!==null?[]:(H(n,0),s.events=Rt(o,s.events,s),s.events)}function L(E,R){return Ei(S(E),R)}function S(E){return Si(a,E)}function A(){let{_bufferIndex:E,_index:R,line:v,column:j,offset:$}=r;return{_bufferIndex:E,_index:R,line:v,column:j,offset:$}}function w(E){i[E.line]=E.column,D()}function M(){for(;r._index<a.length;){let E=a[r._index];if(typeof E=="string"){let R=r._index;for(r._bufferIndex<0&&(r._bufferIndex=0);r._index===R&&r._bufferIndex<E.length;)y(E.charCodeAt(r._bufferIndex))}else y(E)}}function y(E){p=void 0,d=E,m=m(E)}function _(E){b(E)?(r.line++,r.column=1,r.offset+=E===-3?2:1,D()):E!==-1&&(r.column++,r.offset++),r._bufferIndex<0?r._index++:(r._bufferIndex++,r._bufferIndex===a[r._index].length&&(r._bufferIndex=-1,r._index++)),s.previous=E,p=!0}function U(E,R){let v=R||{};return v.type=E,v.start=A(),s.events.push(["enter",v,s]),u.push(v),v}function k(E){let R=u.pop();return R.end=A(),s.events.push(["exit",R,s]),R}function P(E,R){H(E,R.from)}function O(E,R){R.restore()}function B(E,R){return v;function v(j,$,st){let pt,c,rt,ht;return Array.isArray(j)?tt(j):"tokenize"in j?tt([j]):h(j);function h(Q){return Bt;function Bt(ft){let It=ft!==null&&Q[ft],zt=ft!==null&&Q.null,Ae=[...Array.isArray(It)?It:It?[It]:[],...Array.isArray(zt)?zt:zt?[zt]:[]];return tt(Ae)(ft)}}function tt(Q){return pt=Q,c=0,Q.length===0?st:Pt(Q[c])}function Pt(Q){return Bt;function Bt(ft){return ht=Y(),rt=Q,Q.partial||(s.currentConstruct=Q),Q.name&&s.parser.constructs.disable.null.includes(Q.name)?te(ft):Q.tokenize.call(R?Object.assign(Object.create(s),R):s,f,Le,te)(ft)}}function Le(Q){return p=!0,E(rt,ht),$}function te(Q){return p=!0,ht.restore(),++c<pt.length?Pt(pt[c]):st}}}function H(E,R){E.resolveAll&&!o.includes(E)&&o.push(E),E.resolve&&X(s.events,R,s.events.length-R,E.resolve(s.events.slice(R),s)),E.resolveTo&&(s.events=E.resolveTo(s.events,s))}function Y(){let E=A(),R=s.previous,v=s.currentConstruct,j=s.events.length,$=Array.from(u);return{from:j,restore:st};function st(){r=E,s.previous=R,s.currentConstruct=v,s.events.length=j,u=$,D()}}function D(){r.line in i&&r.column<2&&(r.column=i[r.line],r.offset+=i[r.line]-1)}}function Si(t,n){let e=n.start._index,r=n.start._bufferIndex,i=n.end._index,o=n.end._bufferIndex,a;if(e===i)a=[t[e].slice(r,o)];else{if(a=t.slice(e,i),r>-1){let u=a[0];typeof u=="string"?a[0]=u.slice(r):a.shift()}o>0&&a.push(t[i].slice(0,o))}return a}function Ei(t,n){let e=-1,r=[],i;for(;++e<t.length;){let o=t[e],a;if(typeof o=="string")a=o;else switch(o){case-5:{a="\r";break}case-4:{a=`
`;break}case-3:{a=`\r
`;break}case-2:{a=n?" ":"	";break}case-1:{if(!n&&i)continue;a=" ";break}default:a=String.fromCharCode(o)}i=o===-2,r.push(a)}return r.join("")}function $e(t){let r={constructs:fn([Ve,...(t||{}).extensions||[]]),content:i(xn),defined:[],document:i(Sn),flow:i(In),lazy:{},string:i(Tn),text:i(Ln)};return r;function i(o){return a;function a(u){return vn(r,o,u)}}}function We(t){for(;!le(t););return t}var Fn=/[\0\t\n\r]/g;function Qe(){let t=1,n="",e=!0,r;return i;function i(o,a,u){o=n+(typeof o=="string"?o.toString():new TextDecoder(a||void 0).decode(o));let p=[],f=0;for(n="",e&&(o.charCodeAt(0)===65279&&f++,e=void 0);f<o.length;){Fn.lastIndex=f;let s=Fn.exec(o),m=s&&s.index!==void 0?s.index:o.length,d=o.charCodeAt(m);if(!s){n=o.slice(f);break}if(d===10&&f===m&&r)p.push(-3),r=void 0;else switch(r&&(p.push(-5),r=void 0),f<m&&(p.push(o.slice(f,m)),t+=m-f),d){case 0:{p.push(65533),t++;break}case 9:{let l=Math.ceil(t/4)*4;for(p.push(-2);t++<l;)p.push(-1);break}case 10:{p.push(-4),t=1;break}default:r=!0,t=1}f=m+1}return u&&(r&&p.push(-5),n&&p.push(n),p.push(null)),p}}var Pi=/\\([!-/:-@[-`{-~])|&(#(?:\d{1,7}|x[\da-f]{1,6})|[\da-z]{1,31});/gi;function Mn(t){return t.replace(Pi,Ii)}function Ii(t,n,e){if(n)return n;if(e.charCodeAt(0)===35){let i=e.charCodeAt(1),o=i===120||i===88;return re(e.slice(o?2:1),o?16:10)}return Mt(e)||t}function _t(t){return!t||typeof t!="object"?"":"position"in t||"type"in t?Rn(t.position):"start"in t||"end"in t?Rn(t):"line"in t||"column"in t?Ye(t):""}function Ye(t){return _n(t&&t.line)+":"+_n(t&&t.column)}function Rn(t){return Ye(t&&t.start)+"-"+Ye(t&&t.end)}function _n(t){return t&&typeof t=="number"?t:1}var Bn={}.hasOwnProperty;function de(t,n,e){return typeof n!="string"&&(e=n,n=void 0),Ci(e)(We($e(e).document().write(Qe()(t,n,!0))))}function Ci(t){let n={transforms:[],canContainEols:["emphasis","fragment","heading","paragraph","strong"],enter:{autolink:o(an),autolinkProtocol:B,autolinkEmail:B,atxHeading:o(nn),blockQuote:o(ft),characterEscape:B,characterReference:B,codeFenced:o(It),codeFencedFenceInfo:a,codeFencedFenceMeta:a,codeIndented:o(It,a),codeText:o(zt,a),codeTextData:B,data:B,codeFlowValue:B,definition:o(Ae),definitionDestinationString:a,definitionLabelString:a,definitionTitleString:a,emphasis:o(Wn),hardBreakEscape:o(rn),hardBreakTrailing:o(rn),htmlFlow:o(on,a),htmlFlowData:B,htmlText:o(on,a),htmlTextData:B,image:o(Qn),label:a,link:o(an),listItem:o(Yn),listItemValue:d,listOrdered:o(sn,m),listUnordered:o(sn),paragraph:o(Gn),reference:h,referenceString:a,resourceDestinationString:a,resourceTitleString:a,setextHeading:o(nn),strong:o(Jn),thematicBreak:o(Zn)},exit:{atxHeading:p(),atxHeadingSequence:U,autolink:p(),autolinkEmail:Bt,autolinkProtocol:Q,blockQuote:p(),characterEscapeValue:H,characterReferenceMarkerHexadecimal:Pt,characterReferenceMarkerNumeric:Pt,characterReferenceValue:Le,characterReference:te,codeFenced:p(A),codeFencedFence:S,codeFencedFenceInfo:l,codeFencedFenceMeta:L,codeFlowValue:H,codeIndented:p(w),codeText:p(v),codeTextData:H,data:H,definition:p(),definitionDestinationString:_,definitionLabelString:M,definitionTitleString:y,emphasis:p(),hardBreakEscape:p(D),hardBreakTrailing:p(D),htmlFlow:p(E),htmlFlowData:H,htmlText:p(R),htmlTextData:H,image:p($),label:pt,labelText:st,lineEnding:Y,link:p(j),listItem:p(),listOrdered:p(),listUnordered:p(),paragraph:p(),referenceString:tt,resourceDestinationString:c,resourceTitleString:rt,resource:ht,setextHeading:p(O),setextHeadingLineSequence:P,setextHeadingText:k,strong:p(),thematicBreak:p()}};Dn(n,(t||{}).mdastExtensions||[]);let e={};return r;function r(g){let x={type:"root",children:[]},T={stack:[x],tokenStack:[],config:n,enter:u,exit:f,buffer:a,resume:s,data:e},F=[],N=-1;for(;++N<g.length;)if(g[N][1].type==="listOrdered"||g[N][1].type==="listUnordered")if(g[N][0]==="enter")F.push(N);else{let ut=F.pop();N=i(g,ut,N)}for(N=-1;++N<g.length;){let ut=n[g[N][0]];Bn.call(ut,g[N][1].type)&&ut[g[N][1].type].call(Object.assign({sliceSerialize:g[N][2].sliceSerialize},T),g[N][1])}if(T.tokenStack.length>0){let ut=T.tokenStack[T.tokenStack.length-1];(ut[1]||On).call(T,void 0,ut[0])}for(x.position={start:yt(g.length>0?g[0][1].start:{line:1,column:1,offset:0}),end:yt(g.length>0?g[g.length-2][1].end:{line:1,column:1,offset:0})},N=-1;++N<n.transforms.length;)x=n.transforms[N](x)||x;return x}function i(g,x,T){let F=x-1,N=-1,ut=!1,Ct,dt,Dt,Nt;for(;++F<=T;){let et=g[F];switch(et[1].type){case"listUnordered":case"listOrdered":case"blockQuote":{et[0]==="enter"?N++:N--,Nt=void 0;break}case"lineEndingBlank":{et[0]==="enter"&&(Ct&&!Nt&&!N&&!Dt&&(Dt=F),Nt=void 0);break}case"linePrefix":case"listItemValue":case"listItemMarker":case"listItemPrefix":case"listItemPrefixWhitespace":break;default:Nt=void 0}if(!N&&et[0]==="enter"&&et[1].type==="listItemPrefix"||N===-1&&et[0]==="exit"&&(et[1].type==="listUnordered"||et[1].type==="listOrdered")){if(Ct){let vt=F;for(dt=void 0;vt--;){let mt=g[vt];if(mt[1].type==="lineEnding"||mt[1].type==="lineEndingBlank"){if(mt[0]==="exit")continue;dt&&(g[dt][1].type="lineEndingBlank",ut=!0),mt[1].type="lineEnding",dt=vt}else if(!(mt[1].type==="linePrefix"||mt[1].type==="blockQuotePrefix"||mt[1].type==="blockQuotePrefixWhitespace"||mt[1].type==="blockQuoteMarker"||mt[1].type==="listItemIndent"))break}Dt&&(!dt||Dt<dt)&&(Ct._spread=!0),Ct.end=Object.assign({},dt?g[dt][1].start:et[1].end),g.splice(dt||F,0,["exit",Ct,et[2]]),F++,T++}if(et[1].type==="listItemPrefix"){let vt={type:"listItem",_spread:!1,start:Object.assign({},et[1].start),end:void 0};Ct=vt,g.splice(F,0,["enter",vt,et[2]]),F++,T++,Dt=void 0,Nt=!0}}}return g[x][1]._spread=ut,T}function o(g,x){return T;function T(F){u.call(this,g(F),F),x&&x.call(this,F)}}function a(){this.stack.push({type:"fragment",children:[]})}function u(g,x,T){this.stack[this.stack.length-1].children.push(g),this.stack.push(g),this.tokenStack.push([x,T||void 0]),g.position={start:yt(x.start),end:void 0}}function p(g){return x;function x(T){g&&g.call(this,T),f.call(this,T)}}function f(g,x){let T=this.stack.pop(),F=this.tokenStack.pop();if(F)F[0].type!==g.type&&(x?x.call(this,g,F[0]):(F[1]||On).call(this,g,F[0]));else throw new Error("Cannot close `"+g.type+"` ("+_t({start:g.start,end:g.end})+"): it\u2019s not open");T.position.end=yt(g.end)}function s(){return ze(this.stack.pop())}function m(){this.data.expectingFirstListItemValue=!0}function d(g){if(this.data.expectingFirstListItemValue){let x=this.stack[this.stack.length-2];x.start=Number.parseInt(this.sliceSerialize(g),10),this.data.expectingFirstListItemValue=void 0}}function l(){let g=this.resume(),x=this.stack[this.stack.length-1];x.lang=g}function L(){let g=this.resume(),x=this.stack[this.stack.length-1];x.meta=g}function S(){this.data.flowCodeInside||(this.buffer(),this.data.flowCodeInside=!0)}function A(){let g=this.resume(),x=this.stack[this.stack.length-1];x.value=g.replace(/^(\r?\n|\r)|(\r?\n|\r)$/g,""),this.data.flowCodeInside=void 0}function w(){let g=this.resume(),x=this.stack[this.stack.length-1];x.value=g.replace(/(\r?\n|\r)$/g,"")}function M(g){let x=this.resume(),T=this.stack[this.stack.length-1];T.label=x,T.identifier=gt(this.sliceSerialize(g)).toLowerCase()}function y(){let g=this.resume(),x=this.stack[this.stack.length-1];x.title=g}function _(){let g=this.resume(),x=this.stack[this.stack.length-1];x.url=g}function U(g){let x=this.stack[this.stack.length-1];if(!x.depth){let T=this.sliceSerialize(g).length;x.depth=T}}function k(){this.data.setextHeadingSlurpLineEnding=!0}function P(g){let x=this.stack[this.stack.length-1];x.depth=this.sliceSerialize(g).codePointAt(0)===61?1:2}function O(){this.data.setextHeadingSlurpLineEnding=void 0}function B(g){let T=this.stack[this.stack.length-1].children,F=T[T.length-1];(!F||F.type!=="text")&&(F=Kn(),F.position={start:yt(g.start),end:void 0},T.push(F)),this.stack.push(F)}function H(g){let x=this.stack.pop();x.value+=this.sliceSerialize(g),x.position.end=yt(g.end)}function Y(g){let x=this.stack[this.stack.length-1];if(this.data.atHardBreak){let T=x.children[x.children.length-1];T.position.end=yt(g.end),this.data.atHardBreak=void 0;return}!this.data.setextHeadingSlurpLineEnding&&n.canContainEols.includes(x.type)&&(B.call(this,g),H.call(this,g))}function D(){this.data.atHardBreak=!0}function E(){let g=this.resume(),x=this.stack[this.stack.length-1];x.value=g}function R(){let g=this.resume(),x=this.stack[this.stack.length-1];x.value=g}function v(){let g=this.resume(),x=this.stack[this.stack.length-1];x.value=g}function j(){let g=this.stack[this.stack.length-1];if(this.data.inReference){let x=this.data.referenceType||"shortcut";g.type+="Reference",g.referenceType=x,delete g.url,delete g.title}else delete g.identifier,delete g.label;this.data.referenceType=void 0}function $(){let g=this.stack[this.stack.length-1];if(this.data.inReference){let x=this.data.referenceType||"shortcut";g.type+="Reference",g.referenceType=x,delete g.url,delete g.title}else delete g.identifier,delete g.label;this.data.referenceType=void 0}function st(g){let x=this.sliceSerialize(g),T=this.stack[this.stack.length-2];T.label=Mn(x),T.identifier=gt(x).toLowerCase()}function pt(){let g=this.stack[this.stack.length-1],x=this.resume(),T=this.stack[this.stack.length-1];if(this.data.inReference=!0,T.type==="link"){let F=g.children;T.children=F}else T.alt=x}function c(){let g=this.resume(),x=this.stack[this.stack.length-1];x.url=g}function rt(){let g=this.resume(),x=this.stack[this.stack.length-1];x.title=g}function ht(){this.data.inReference=void 0}function h(){this.data.referenceType="collapsed"}function tt(g){let x=this.resume(),T=this.stack[this.stack.length-1];T.label=x,T.identifier=gt(this.sliceSerialize(g)).toLowerCase(),this.data.referenceType="full"}function Pt(g){this.data.characterReferenceType=g.type}function Le(g){let x=this.sliceSerialize(g),T=this.data.characterReferenceType,F;T?(F=re(x,T==="characterReferenceMarkerNumeric"?10:16),this.data.characterReferenceType=void 0):F=Mt(x);let N=this.stack[this.stack.length-1];N.value+=F}function te(g){let x=this.stack.pop();x.position.end=yt(g.end)}function Q(g){H.call(this,g);let x=this.stack[this.stack.length-1];x.url=this.sliceSerialize(g)}function Bt(g){H.call(this,g);let x=this.stack[this.stack.length-1];x.url="mailto:"+this.sliceSerialize(g)}function ft(){return{type:"blockquote",children:[]}}function It(){return{type:"code",lang:null,meta:null,value:""}}function zt(){return{type:"inlineCode",value:""}}function Ae(){return{type:"definition",identifier:"",label:null,title:null,url:""}}function Wn(){return{type:"emphasis",children:[]}}function nn(){return{type:"heading",depth:0,children:[]}}function rn(){return{type:"break"}}function on(){return{type:"html",value:""}}function Qn(){return{type:"image",title:null,url:"",alt:null}}function an(){return{type:"link",title:null,url:"",children:[]}}function sn(g){return{type:"list",ordered:g.type==="listOrdered",start:null,spread:g._spread,children:[]}}function Yn(g){return{type:"listItem",spread:g._spread,checked:null,children:[]}}function Gn(){return{type:"paragraph",children:[]}}function Jn(){return{type:"strong",children:[]}}function Kn(){return{type:"text",value:""}}function Zn(){return{type:"thematicBreak"}}}function yt(t){return{line:t.line,column:t.column,offset:t.offset}}function Dn(t,n){let e=-1;for(;++e<n.length;){let r=n[e];Array.isArray(r)?Dn(t,r):Ti(t,r)}}function Ti(t,n){let e;for(e in n)if(Bn.call(n,e))switch(e){case"canContainEols":{let r=n[e];r&&t[e].push(...r);break}case"transforms":{let r=n[e];r&&t[e].push(...r);break}case"enter":case"exit":{let r=n[e];r&&Object.assign(t[e],r);break}}}function On(t,n){throw t?new Error("Cannot close `"+t.type+"` ("+_t({start:t.start,end:t.end})+"): a different token (`"+n.type+"`, "+_t({start:n.start,end:n.end})+") is open"):new Error("Cannot close document, a token (`"+n.type+"`, "+_t({start:n.start,end:n.end})+") is still open")}function Nn(t,n){if(/^https?:\/\//i.test(t)||t.startsWith("//"))return;let e;if(/^file:/i.test(t)){let i=new URL(t);if(i.host&&i.host!=="localhost")throw new Error("Remote file URLs are not supported.");e=decodeURIComponent(i.pathname)}else{if(/^[a-z][a-z\d+.-]*:/i.test(t)||t.startsWith("#"))throw new Error(`Unsupported image URL: ${t}`);e=decodeURIComponent(t).replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\]^_`{|}~])/g,"$1")}if(!e.startsWith("/")){if(!n)throw new Error("Save this Markdown document before publishing relative images.");e=`${n.slice(0,n.lastIndexOf("/"))}/${e}`}let r=[];for(let i of e.split("/"))i===".."?r.pop():i&&i!=="."&&r.push(i);return`/${r.join("/")}`}function Ge(t,n){for(let e of t)n(e),"children"in e&&Ge(e.children,n)}function Un(t,n){let e=de(t),r=new Map,i=[],o=new Set;return Ge(e.children,a=>{a.type==="definition"&&r.set(a.identifier,a)}),Ge(e.children,a=>{if(a.type==="html"&&/<img\b/i.test(a.value)){for(let m of a.value.matchAll(/\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi))if(Nn(m[1]??m[2]??m[3],n))throw new Error("Local images in HTML must use Markdown image syntax before publishing.")}if(a.type!=="image"&&a.type!=="imageReference")return;let u=a.type==="image"?a:r.get(a.identifier);if(!u)return;let p=Nn(u.url,n);if(!p)return;let f=u.position?.start.offset,s=u.position?.end.offset;f===void 0||s===void 0||o.has(f)||(o.add(f),i.push({path:p,from:f,to:s,alt:a.alt??"",title:u.title,identifier:u.type==="definition"?u.identifier:void 0}))}),i}function Li(t,n,e){return`![${t.replace(/[\\[\]]/g,"\\$&")}](<${n.replaceAll(">","%3E")}>${e?` "${e.replace(/[\\"]/g,"\\$&")}"`:""})`}function qn(t,n){let e=t;for(let{image:r,url:i}of[...n].sort((o,a)=>a.image.from-o.image.from)){let o=r.identifier?`[${r.identifier}]: <${i}>${r.title?` "${r.title.replace(/[\\"]/g,"\\$&")}"`:""}`:Li(r.alt,i,r.title);e=e.slice(0,r.from)+o+e.slice(r.to)}return e}function me(t){let e=de(t).children[0];if(e?.type!=="heading")return{title:"",body:t};let r=e.position?.start.offset??0,i=e.position?.end.offset??0;if(t.slice(0,r).trim())return{title:"",body:t};let o=a=>a.map(u=>"children"in u?o(u.children):"value"in u?String(u.value):u.type==="image"?u.alt??"":"").join("");return{title:o(e.children),body:t.slice(i).replace(/^\r?\n(?:\r?\n)?/,"")}}var Ai="markedit-pika.runtime",Ke="operations",Je="pika";var ge,ke;function zi(){return ge??=new Promise((t,n)=>{let e=indexedDB.open(Ai,1);e.onupgradeneeded=()=>e.result.createObjectStore(Ke),e.onerror=()=>n(new Error("Pika could not open its local operation lock.")),e.onblocked=()=>n(new Error("Close other MarkEdit windows and try Pika again.")),e.onsuccess=()=>{let r=e.result;r.onversionchange=()=>{r.close(),ge=void 0},t(r)}}).catch(t=>{throw ge=void 0,t}),ge}async function we(t,n){let e=await zi();return new Promise((r,i)=>{let o=e.transaction(Ke,"readwrite"),a=o.objectStore(Ke),u=!1;o.oncomplete=()=>r(u),o.onabort=o.onerror=()=>i(new Error("Pika\u2019s operation lock could not be saved."));let p=a.get(Je);p.onsuccess=()=>{let f=p.result;if(n==="release"){f?.id===t&&a.delete(Je),u=!0;return}let s=Date.now();u=n==="acquire"?!f||f.expires<=s:f?.id===t&&f.expires>s,u&&a.put({id:t,expires:s+12e4},Je)}})}async function Ot(){let t=ke;if(!t||t.lost||!await we(t.id,"renew"))throw t&&(t.lost=!0),new Error("This Pika operation expired. Check Pika before trying again.")}async function Hn(t){if(ke)throw new Error("Finish the other Pika action first.");let n={id:crypto.randomUUID(),lost:!1};if(!await we(n.id,"acquire"))throw new Error("Pika is busy in another window. Try again shortly.");ke=n;let e=setInterval(()=>{we(n.id,"renew").then(r=>{r||(n.lost=!0)}).catch(()=>{n.lost=!0})},3e4);try{return await t()}finally{clearInterval(e),ke=void 0,await we(n.id,"release").catch(()=>{})}}var vi=["create","update","publish","draft","trash","restore"],xe=class{constructor(n,e,r){this.host=n;this.beforeWrite=r;this.path=`${e?e.slice(0,e.lastIndexOf("/")):`${n.getDirectoryPath("documents")}/scripts`}/markedit-pika.settings.json`}path;async read(){let n=await this.host.getFileContent(this.path);if(n===void 0)return{version:1,links:{},uploads:{}};let e=JSON.parse(n),r=i=>!!i&&typeof i=="object"&&!Array.isArray(i);if(!r(e)||e.version!==1||!r(e.links)||!r(e.uploads))throw new Error("The Pika settings file is invalid. It has been preserved; repair it before continuing.");if(e.blog!==void 0){if(typeof e.blog!="string")throw new Error("Invalid saved blog URL.");W(e.blog)}if(e.connectionId!==void 0&&typeof e.connectionId!="string")throw new Error("Invalid saved connection.");if(e.pending!==void 0&&(!r(e.pending)||typeof e.pending.started!="string"))throw new Error("Invalid interrupted-send record.");if(r(e.pending)){let i=e.pending;if(i.url!==void 0){if(typeof i.url!="string")throw new Error("Invalid interrupted post URL.");W(i.url)}if(i.path!==void 0&&(typeof i.path!="string"||!i.path.startsWith("/")))throw new Error("Invalid interrupted document path.");if(i.action!==void 0&&!vi.includes(i.action))throw new Error("Invalid interrupted action.")}for(let i of Object.values(e.links)){if(!r(i)||typeof i.url!="string")throw new Error("Invalid saved post link.");if(W(i.url),i.baseline!==void 0&&Ft(i.baseline),i.lastSent!==void 0&&Ft(i.lastSent),i.titleOverride!==void 0&&typeof i.titleOverride!="string")throw new Error("Invalid saved title.")}for(let i of Object.values(e.uploads)){if(typeof i!="string"||!i.startsWith("https://pika.page/micropub/media/"))throw new Error("Invalid saved image URL.");W(i)}return e}async edit(n){await this.beforeWrite?.();let e=await this.read();if(n(e),await this.beforeWrite?.(),!await this.host.createFile({path:this.path,string:`${JSON.stringify(e,null,2)}
`,overwrites:!0}))throw new Error("Pika settings could not be saved. A remote operation may already have succeeded; check Pika before retrying.")}};var jn=`
.markedit-pika { color-scheme: light dark; --preview-background:var(--pika-background,Canvas); background:var(--preview-background); color:var(--pika-text,CanvasText); width:min(420px,calc(100vw - 48px)); max-height:calc(100vh - 48px); overflow:auto; box-sizing:border-box; border:1px solid color-mix(in srgb,currentColor 15%,transparent); border-radius:12px; padding:26px 24px 20px; box-shadow:0 16px 60px #0003; font:13px/1.5 -apple-system,BlinkMacSystemFont,system-ui,sans-serif; text-align:left; animation:pika-fade-in 160ms ease-out; }
.markedit-pika::backdrop { background:#0003; }
.markedit-pika * { box-sizing:border-box; }
.markedit-pika h1 { margin:0 24px 20px 0; font-size:15px; font-weight:600; }
.markedit-pika p { margin:0 0 16px; }
.markedit-pika label { display:block; margin:14px 0; font-weight:500; }
.markedit-pika input { appearance:auto; display:block; width:100%; margin-top:6px; padding:5px 7px; border:1px solid color-mix(in srgb,currentColor 22%,transparent); border-radius:5px; background:Field; color:FieldText; font:13px -apple-system,BlinkMacSystemFont,system-ui,sans-serif; }
.markedit-pika .token-help { display:inline-block; margin-top:-6px; color:LinkText; text-decoration:none; font-size:12px; }
.markedit-pika .token-help:hover { text-decoration:underline; }
.markedit-pika footer { display:flex; justify-content:flex-end; align-items:center; gap:8px; margin-top:24px; flex-wrap:wrap; }
.markedit-pika button:not(.cm-previewClose) { appearance:auto; font:13px -apple-system,BlinkMacSystemFont,system-ui,sans-serif; min-width:70px; padding:4px 12px; border:1px solid color-mix(in srgb,currentColor 15%,transparent); border-radius:6px; background:ButtonFace; color:ButtonText; box-shadow:0 1px 1px #0001; }
.markedit-pika button.primary { background:AccentColor; color:white; border-color:transparent; }
.markedit-pika :focus-visible { outline:2px solid AccentColor; outline-offset:2px; }
.markedit-pika :disabled { opacity:.5; }
.markedit-pika details { margin-top:18px; color:color-mix(in srgb,currentColor 65%,transparent); }
.markedit-pika summary { font-size:12px; cursor:default; }
.markedit-pika .status { margin:16px 0 0; font-size:12px; overflow-wrap:anywhere; }
.markedit-pika .error { color:light-dark(#b3261e,#ffaaa2); }
.markedit-pika [hidden] { display:none!important; }
/* MarkEdit preview close control (MIT, MarkEdit.app); kept scoped to this sheet. */
.markedit-pika .cm-previewClose { position:absolute; z-index:1; top:8px; right:12px; width:24px; height:24px; padding:0; border:0; outline:none; border-radius:50%; background:transparent; color:inherit; }
.markedit-pika.cm-previewKeyboardFocus .cm-previewClose:focus-visible { outline:1px solid currentColor; outline-offset:2px; }
.markedit-pika .cm-previewClose::before { content:''; position:absolute; inset:4px; background:color-mix(in srgb,currentColor 50%,var(--preview-background,Canvas)); mask:url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 18 18"><path fill-rule="evenodd" d="M9 0a9 9 0 1 0 0 18A9 9 0 0 0 9 0z M9 7.94l-2.47-2.47a.75.75 0 0 0-1.06 1.06L7.94 9l-2.47 2.47a.75.75 0 0 0 1.06 1.06L9 10.06l2.47 2.47a.75.75 0 0 0 1.06-1.06L10.06 9l2.47-2.47a.75.75 0 0 0-1.06-1.06z"/></svg>') center / 16px 16px no-repeat; }
.markedit-pika .cm-previewClose:active::before { background:color-mix(in srgb,currentColor 65%,var(--preview-background,Canvas)); }
@keyframes pika-fade-in { from { opacity:0; } to { opacity:1; } }
@media(prefers-reduced-motion:reduce) { .markedit-pika { animation:none; } }
`;var q=new xe(I.MarkEdit,typeof __FILE_PATH__=="string"?__FILE_PATH__:void 0,Ot),ot="pika.app-token",at,Ze=!1,bt=0,St=()=>{},ye=!1;async function Zt(){try{let t=await I.MarkEdit.getFileInfo(),n=await q.read();ye=!!t&&!!n.links[t.filePath]}catch{ye=!1}}var Fi={jpg:"image/jpeg",jpeg:"image/jpeg",png:"image/png",gif:"image/gif",webp:"image/webp"};function J(t,n){let e=document.createElement(t);return n!==void 0&&(e.textContent=n),e}function be(t,n,e="",r="text"){let i=J("label",n),o=J("input");return o.type=r,o.value=e,i.append(o),t.append(i),o}function lt(t,n,e,r=!1){let i=J("button",n);return i.type="button",r&&(i.className="primary"),i.addEventListener("click",e),t.append(i),i}function en(t){window.open(W(t),"_blank","noopener,noreferrer")}async function ct(t,n,e){return await I.MarkEdit.showAlert({title:t,message:n,buttons:["Cancel",e]})===1}function Et(t){return Array.isArray(t)?JSON.stringify(t.map(Et)):JSON.stringify(t&&typeof t=="object"?Object.entries(t).sort(([n],[e])=>n.localeCompare(e)).map(([n,e])=>[n,Et(e)]):t)}function Xt(t){St(),at?.close();let n=I.MarkEdit.editorView,e=J("dialog");at=e,e.className="markedit-pika";let r=J("style");r.textContent=jn,e.append(r);let i=J("h1",t);i.id=`pika-${crypto.randomUUID()}`,e.setAttribute("aria-labelledby",i.id),e.append(i);let o=!1,a=!1;async function u(){o||a||(a=!0,matchMedia("(prefers-reduced-motion: reduce)").matches||await e.animate([{opacity:1},{opacity:0}],{duration:160,easing:"ease-out",fill:"forwards"}).finished.catch(()=>{}),e.close())}let p=lt(e,"",()=>void u());p.className="cm-previewClose",p.title="Close",p.setAttribute("aria-label","Close");let f=J("div");e.append(f);let s=J("p");s.className="status",s.hidden=!0,s.setAttribute("role","status"),s.setAttribute("aria-live","polite"),e.append(s);let m=J("footer");e.append(m);let d=()=>{if(!n.dom)return;let S=getComputedStyle(n.dom);S.backgroundColor!=="rgba(0, 0, 0, 0)"&&e.style.setProperty("--pika-background",S.backgroundColor),e.style.setProperty("--pika-text",S.color);let A=S.color.match(/[\d.]+/g)?.slice(0,3).map(Number);A?.length===3&&(e.style.colorScheme=(A[0]*299+A[1]*587+A[2]*114)/1e3>140?"dark":"light")};d(),window.addEventListener("editor-colors-changed",d),e.addEventListener("cancel",S=>{S.preventDefault(),u()}),e.addEventListener("keydown",S=>{S.key==="Tab"&&e.classList.add("cm-previewKeyboardFocus")}),e.addEventListener("close",()=>{window.removeEventListener("editor-colors-changed",d);for(let S of e.querySelectorAll('input[type="password"]'))S.value="";e.remove(),at===e&&(at=void 0),n.focus?.()},{once:!0});function l(S,A=!1){s.textContent=S,s.hidden=!S,s.classList.toggle("error",A)}async function L(S,A,w=!1){if(o)return;o=!0,e.setAttribute("aria-busy","true");let M=[...e.querySelectorAll("input,button")];for(let y of M)y.disabled=!0;try{w?await S():await Se(S)}catch(y){let _=y instanceof Error?y.message:String(y);A?.value&&(_=_.replaceAll(A.value,"[token]")),l(_,!0)}finally{o=!1,e.removeAttribute("aria-busy");for(let y of M)y.disabled=!1;await Zt()}}return document.body.append(e),e.showModal(),{dialog:e,content:f,footer:m,report:l,run:L}}async function Se(t){if(Ze)throw new Error("Finish the other Pika action first.");Ze=!0;try{return await Hn(t)}finally{Ze=!1}}async function Ce(t,n){if((await q.read()).connectionId!==t)throw new Error("Your Pika connection changed. Reopen Sync to Pika.");if(n)return n;let r=await I.MarkEdit.secretStorage.get(ot);if(!r)throw new Error("Connect to Pika first.");return new qt(r)}async function Xe(t=!1){let n=I.MarkEdit.editorView,e=bt;if(t&&!await I.MarkEdit.saveDocument())return;let r=await I.MarkEdit.getFileInfo();if(e===bt){if(I.MarkEdit.editorView!==n)throw new Error("The document changed. Try again.");if(!r&&t){let i=Date.now()+12e4;for(;e===bt&&Date.now()<i;){if(await new Promise(o=>setTimeout(o,200)),e!==bt||I.MarkEdit.editorView!==n||(r=await I.MarkEdit.getFileInfo(),e!==bt||I.MarkEdit.editorView!==n))return;if(r)return{view:n,path:r.filePath}}return}if(!r)throw new Error("Save this document first.");return{view:n,path:r.filePath}}}async function Gt(t,n,e){if((await q.read()).pending)throw new Error("Check your last post on Pika before trying again.");await q.edit(i=>{i.pending={...t,started:new Date().toISOString()}});let r=!1;try{await Ot();let i=await n();return r=!0,await e(i),await q.edit(o=>{delete o.pending}),i}catch(i){throw!r&&i instanceof it&&i.status>=400&&i.status<500&&await q.edit(o=>{delete o.pending}),i}}async function tn(t,n,e){let r=e??(await t.source(n.url)).properties;return!n.baseline||Et(r)!==Et(n.baseline)?ct("This post changed on Pika","Replace it with the version in this document?","Replace Post"):!0}function Ee(t){if(!t)return;let n=new URL(W(t));if(!["pika.page","www.pika.page"].includes(n.hostname))return n.href}function Vn(t,n,e){t.content.replaceChildren(J("p",n));let r=t.dialog.querySelector("h1");r&&(r.textContent="Pika"),t.footer.replaceChildren(),t.report(""),e&&lt(t.footer,"Open in Pika",()=>{en(e),t.dialog.close()},!0)}async function Pe(t,n,e,r){let i=e["post-status"]?.[0]==="published"?Ee(r?.url)??n:n;try{let o=await t.source(i);return{url:o.properties["post-status"]?.[0]==="published"?Ee(o.url)??i:i,baseline:o.properties}}catch{return{url:i,baseline:void 0,lastSent:e}}}async function Kt(t,n=!1){if(!I.MarkEdit.secretStorage)throw new Error("Update MarkEdit to connect to Pika.");let e=Xt(n?"Replace Pika token":"Connect to Pika"),r=be(e.content,"App token","","password");r.autocomplete="off",r.spellcheck=!1;let i=J("a","Get an app token");i.className="token-help",i.href="https://pika.page/manual/micropub#setup",i.target="_blank",i.rel="noopener noreferrer",i.setAttribute("aria-label","Get an app token (opens in your browser)"),e.content.append(i),lt(e.footer,"Connect",()=>void e.run(async()=>{let o=r.value.trim();if(!o||/\s/.test(o))throw new Error("Enter your app token.");let a=await q.read();if(a.pending)throw new Error("Resolve the interrupted Pika action before replacing your token.");let u=new qt(o);e.report("Connecting\u2026"),await u.config();let p=Object.values(a.links);if(p.length){let s=p.find(d=>!d.trashed),m=!1;if(s)try{await u.source(s.url),m=!0}catch(d){if(!(d instanceof it)||d.status!==404)throw d}if(!m&&!await ct("Is this token for the same Pika blog?","Pika could not verify the blog from your saved posts. Replace the token only if it is for the same blog. To switch blogs, cancel and disconnect first.","Replace Token"))return}let f;await I.MarkEdit.secretStorage.has(ot)&&(f=await I.MarkEdit.secretStorage.get(ot)),await Ot(),await I.MarkEdit.secretStorage.set(ot,o);try{await q.edit(s=>{s.connectionId=crypto.randomUUID(),delete s.blog})}catch(s){throw f?await I.MarkEdit.secretStorage.set(ot,f):await I.MarkEdit.secretStorage.delete(ot),s}r.value="",e.dialog.close(),t||await I.MarkEdit.showAlert({title:"Connected to Pika"})},r).then(async()=>{!e.dialog.open&&t&&await t()}).catch(o=>I.MarkEdit.showAlert({title:"Pika",message:o instanceof Error?o.message:String(o)}))),r.focus()}async function $n(t,n,e,r){let i=Un(t,n),o=new Map;for(let s of i){if(o.has(s.path))continue;let m=await I.MarkEdit.getFileObject(s.path);if(!m)throw new Error(`Couldn\u2019t read image: ${s.path.split("/").pop()}. Check that it still exists.`);let d=Fi[s.path.split(".").pop()?.toLowerCase()??""];if(!d)throw new Error("Pika accepts JPEG, PNG, GIF, and WebP images.");let l=Uint8Array.from(atob(m.data),S=>S.charCodeAt(0)),L=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",l)),S=>S.toString(16).padStart(2,"0")).join("");o.set(s.path,{blob:new Blob([l],{type:d}),hash:L})}let a=new Map,u=0,f=(o.size?await e.config():{})["media-endpoint"]??ee;for(let[s,m]of o){r(`Uploading image ${++u} of ${o.size}\u2026`);let d=(await q.read()).uploads[m.hash];await Ot();let l=d??await e.upload(m.blob,s.split("/").pop()??"image",f);d||await q.edit(L=>{L.uploads[m.hash]=l}),a.set(s,l)}return qn(t,i.map(s=>({image:s,url:a.get(s.path)})))}async function Te(){let t=await q.read(),n=t.pending;if(!n)return;let e=Xt("Check your last Pika action"),r={create:"Creating a draft",update:"Syncing changes",publish:"Publishing",draft:"Returning to draft",trash:"Moving to trash",restore:"Restoring from trash"};e.content.append(J("p",`${n.action?r[n.action]:"The last action"} didn\u2019t finish. Check Pika before continuing.`));let i=n.path,o=J("p",i?`Document: ${i.split("/").pop()}`:"Choose the original Markdown document to link this post.");e.content.append(o),i||lt(e.content,"Choose Original Document\u2026",()=>void e.run(async()=>{let f=await I.MarkEdit.showOpenPanel({title:"Choose the original Markdown document",allowsMultipleSelection:!1});f?.[0]&&(i=f[0],o.textContent=`Document: ${i.split("/").pop()}`)}));let a=be(e.content,"Post URL",n.url??"","url"),u=async f=>{await q.edit(s=>{if(Et(s.pending)!==Et(n)||s.connectionId!==t.connectionId)throw new Error("The interrupted action changed. Reopen Pika.");f?.(s),delete s.pending}),e.dialog.close()};lt(e.footer,"Open Pika",()=>en(n.url??"https://pika.page")),n.action==="trash"?lt(e.footer,"Post Is in Trash",()=>void e.run(async()=>{if(!n.path||!n.url)throw new Error("The original post details are unavailable.");await ct("Did you check Pika\u2019s trash?","Only confirm if this post is in Pika\u2019s trash.","Confirm")&&await u(f=>{let s=f.links[n.path];if(!s||s.url!==n.url)throw new Error("The original post link changed.");s.trashed=!0})}),!0):lt(e.footer,"Link Post",()=>void e.run(async()=>{if(!i)throw new Error("Choose the original Markdown document first.");let f=await Ce(t.connectionId),s=W(a.value.trim()),m=await f.source(s),d=m.properties["post-status"]?.[0]==="published"?Ee(m.url)??s:s;await u(l=>{l.links[i]={...l.links[i],url:d,baseline:m.properties,trashed:!1}})}),!0);let p=n.action==="create";lt(e.footer,p?"No post was created":"I\u2019ve Checked Pika",()=>void e.run(async()=>{await ct(p?"Start a new post?":"Clear this interrupted action?",p?"Only continue if you checked Pika and no post was created.":"Only continue after checking the result on Pika. The action will not be retried automatically.","Continue")&&await u()}))}async function Ie(){if(at?.open){at.focus();return}if(!I.MarkEdit.secretStorage)return Kt(()=>Ie());if(!await I.MarkEdit.secretStorage.has(ot))return Kt(()=>Ie());if((await q.read()).pending)return Te();let t=await Xe(!0);if(!t)return;let n=t,e=await q.read(),r=e.links[n.path],i=n.view.state.doc.toString(),o=me(i),a=Xt("Sync to Pika"),u=r?void 0:be(a.content,"Title",o.title),p;if(!r){let m=J("details");m.append(J("summary","Publication date")),a.content.append(m),p=be(m,"Date","","datetime-local")}let f;a.dialog.addEventListener("close",()=>{f=void 0},{once:!0});async function s(){await a.run(async()=>{if(!n.view.state.doc.toString().trim())throw new Error("Write your post first.");let m=await I.MarkEdit.getFileInfo();if(I.MarkEdit.editorView!==n.view||m?.filePath!==n.path)throw new Error("The document changed. Reopen Sync to Pika.");if(n.view.state.doc.toString()!==i){let P=await Xe(!0);if(!P)return;if(P.view!==n.view||P.path!==n.path)throw new Error("The document changed. Reopen Sync to Pika.");i=n.view.state.doc.toString()}let d=await q.read();if(d.connectionId!==e.connectionId)throw new Error("Your Pika connection changed. Reopen Sync to Pika.");if(Et(d.links[n.path])!==Et(r))throw new Error("This post was updated in another window. Reopen Sync to Pika.");f??=await Ce(e.connectionId);let l=f,L=r,S=!1,A=!1;if(r?.trashed){if(!await ct("This post is in Pika\u2019s trash","Would you like to restore it and sync your changes to the draft?","Restore and Sync"))return;a.report("Restoring draft\u2026"),await Gt({url:r.url,path:n.path,action:"restore"},()=>l.restore(r.url),async()=>{let P=await Pe(l,r.url,{...r.baseline,"post-status":["draft"]});await q.edit(O=>{O.links[n.path]={...r,...P,trashed:!1}})}),A=!0}if(r){let P;try{P=(await l.source(r.url)).properties}catch(O){if(!(O instanceof it)||O.status!==404)throw O;if(!await ct("This post is no longer on Pika","Create a new draft from this document?","Create New Draft"))return;L=void 0}if(P?.["post-status"]?.[0]==="published"){if(S=!0,!await ct("Update published post?","This post is already published. Are you sure you want to update it?","Update Post"))return}else if(P&&!A&&!await tn(l,r,P))return}let w=me(n.view.state.doc.toString());if(!w.body.trim())throw new Error("Write your post first.");let M={content:[w.body]};L||(M["post-status"]=["draft"]);let y=u?.value.trim()??r?.titleOverride??w.title;y&&(M.name=[y]);let _=M.name?[]:["name"];if(p?.value.trim()){let P=new Date(p.value);if(!Number.isFinite(P.getTime()))throw new Error("Enter a valid publication date.");M.published=[P.toISOString()]}a.report("Preparing post\u2026"),M.content=[await $n(w.body,n.path,l,a.report)],a.report(S?"Updating post\u2026":"Saving draft\u2026");let U=async P=>{let O=await Pe(l,P,{...M,"post-status":[S?"published":"draft"]});y!==w.title&&(O.titleOverride=y),await q.edit(B=>{B.links[n.path]=O})},k=L?.url;if(L){let P=L.url;await Gt({url:P,path:n.path,action:"update"},()=>l.update(P,{replace:M,..._.length?{delete:_}:{}}),async()=>U(P))}else k=await Gt({path:n.path,action:"create"},()=>l.create(M),U);Vn(a,S?"Post updated.":"Draft saved.",k)})}r?(a.report("Syncing post\u2026"),await s(),a.dialog.open&&!a.footer.children.length&&!a.content.children.length&&!a.dialog.querySelector(".status.error")&&a.dialog.close()):(lt(a.footer,"Save Draft",()=>void s(),!0),u?.focus())}async function Mi(t,n){if(at?.open){at.focus();return}let e=await q.read();if(e.pending)return Te();if(!await I.MarkEdit.secretStorage.has(ot))return Kt();await Se(async()=>{let r=await Xe(t==="publish");if(!r)return;let i=e.links[r.path];if(e.connectionId!==n.connectionId||r.path!==n.path||i?.url!==n.url)throw new Error("This post or account changed. Reopen Manage Post.");if(t==="open"){if(!i)throw new Error("Sync this document to Pika first.");en(i.url);return}if(t==="new"){if(!i||!await ct("Create a separate draft?","The existing Pika post will be kept.","Continue"))return;await q.edit(f=>{r&&delete f.links[r.path]});return}let o=await Ce(n.connectionId,n.client);if(!i)throw new Error("Sync or link this document to Pika first.");if(t==="publish"){let f=(await o.source(i.url)).properties;if(f["post-status"]?.[0]!=="draft")throw new Error("Only a saved draft can be published.");if(!await tn(o,i,f))return}if(t==="draft"&&!await tn(o,i))return;let a={publish:["Publish this post?","Your document will be synced to the Pika draft, then published on your live site.","Publish"],draft:["Return to draft?","The post will no longer be public.","Return to Draft"],trash:["Move post to trash?","Pika removes trashed posts after 30 days.","Move to Trash"],restore:["Restore post?","The post will return as a draft.","Restore"]}[t];if(!await ct(a[0],a[1],a[2]))return;let u=i,p=async()=>{await Gt({url:u.url,path:r.path,action:t},async()=>{if(t==="trash")await o.trash(u.url);else if(t==="restore")await o.restore(u.url);else return o.update(u.url,{replace:{"post-status":[t==="publish"?"published":"draft"]}})},async f=>{let s=t==="trash"?{...i,trashed:!0}:await Pe(o,u.url,{...u.baseline,"post-status":[t==="publish"?"published":"draft"]},f||void 0);u=s,await q.edit(m=>{r&&(m.links[r.path]={...i,...s,trashed:t==="trash"})})})};if(t==="publish"){let f=Xt("Pika");await f.run(async()=>{f.report("Syncing draft\u2026");let s=r.view.state.doc.toString(),m=me(s);if(!m.body.trim())throw new Error("Write your post first.");let d={content:[await $n(m.body,r.path,o,f.report)]},l=i.titleOverride??m.title;if(l&&(d.name=[l]),f.report("Syncing draft\u2026"),await Gt({url:i.url,path:r.path,action:"update"},()=>o.update(i.url,{replace:d,...d.name?{}:{delete:["name"]}}),async S=>{let A=await Pe(o,i.url,{...d,"post-status":["draft"]},S);u={...i,...A},await q.edit(w=>{w.links[r.path]=u})}),(await o.source(u.url)).properties["post-status"]?.[0]!=="draft")throw new Error("The draft\u2019s status changed on Pika. Check the post before continuing.");f.report("Publishing post\u2026"),await p(),Vn(f,"Post published.",Ee(u.url))},void 0,!0);return}await p(),await I.MarkEdit.showAlert({title:t==="trash"?"Post moved to trash":t==="restore"?"Post restored":"Post saved as draft"})})}async function Ri(){if(St(),at?.open){at.focus();return}let t=await q.read();if(t.pending)return Te();let n=await I.MarkEdit.getFileInfo(),e=n&&t.links[n.filePath];if(!n||!e)return;let r={path:n.filePath,view:I.MarkEdit.editorView},i,o,a=()=>{i=void 0,o&&clearTimeout(o),St===a&&(St=()=>{})},u=(s,m)=>Jt(s,()=>{let d=i;return a(),Mi(m,{client:d,connectionId:t.connectionId,path:r.path,url:e.url})}),p=[];if(e.trashed)p.push(u("Restore from Trash\u2026","restore"));else{let s=await Se(async()=>{let m=await Ce(t.connectionId);try{let d=await m.source(e.url);return i=m,d.properties}catch(d){if(d instanceof it&&d.status===404)return;throw d}});s?(p.push(u("Open on Pika","open")),s["post-status"]?.[0]==="published"?p.push(u("Return to Draft\u2026","draft")):s["post-status"]?.[0]==="draft"&&p.push(u("Publish\u2026","publish")),p.push(u("Move to Trash\u2026","trash")),p.push(u("Create Separate Draft\u2026","new"))):p.push(Jt("Create New Draft\u2026",async()=>{await ct("This post is no longer on Pika","Start a new draft from this document?","Create New Draft")&&(await Se(async()=>{await q.edit(m=>{m.links[r.path]?.url===e.url&&delete m.links[r.path]})}),await Ie())}))}St=a,o=setTimeout(a,6e4);let f=r.view;I.MarkEdit.showContextMenu(p.map(s=>({...s,action:()=>{if(I.MarkEdit.editorView!==f){a();return}s.action()}})))}async function _i(){if(at?.open){at.focus();return}if(!I.MarkEdit.secretStorage||!await I.MarkEdit.secretStorage.has(ot))return Kt();if((await q.read()).pending)return Te();let t=Xt("Pika account");t.content.append(J("p","Connected to Pika.")),lt(t.footer,"Replace Token\u2026",async()=>{t.dialog.close(),await Kt(void 0,!0)}),lt(t.footer,"Disconnect\u2026",()=>void t.run(async()=>{if(!await ct("Disconnect Pika?","Your posts will stay on Pika. Local post links and upload history will be cleared. To renew a token for the same blog, choose Replace Token instead.","Disconnect"))return;let n=await I.MarkEdit.secretStorage.get(ot);await Ot(),await I.MarkEdit.secretStorage.delete(ot);try{await q.edit(e=>{e.connectionId=crypto.randomUUID(),delete e.blog,e.links={},e.uploads={}})}catch(e){throw n&&await I.MarkEdit.secretStorage.set(ot,n),e}t.dialog.close()}))}function Oi(){if(!I.MarkEdit.secretStorage?.get||!I.MarkEdit.secretStorage.set||!I.MarkEdit.secretStorage.has||!I.MarkEdit.secretStorage.delete)throw new Error("MarkEdit\u2019s Keychain API is unavailable to this extension. Update MarkEdit, then restart it.");if(typeof I.MarkEdit.saveDocument!="function")throw new Error("MarkEdit\u2019s document-saving API is unavailable. Update MarkEdit, then restart it.");if(typeof I.MarkEdit.showContextMenu!="function")throw new Error("MarkEdit\u2019s context-menu API is unavailable. Update MarkEdit, then restart it.");if(typeof indexedDB>"u")throw new Error("Local operation storage is unavailable in this MarkEdit window. Restart MarkEdit and try again.")}function Jt(t,n){return{title:t,action:()=>{bt++,Promise.resolve().then(()=>(Oi(),n())).catch(e=>I.MarkEdit.showAlert({title:"Pika",message:e instanceof Error?e.message:String(e)})).finally(Zt)}}}I.MarkEdit.onEditorReady(()=>{ye=!1,Zt()});window.addEventListener("pagehide",()=>{bt++,St()});window.addEventListener("keydown",t=>{t.key==="Escape"&&bt++});window.addEventListener("focus",()=>void Zt());I.MarkEdit.addMainMenuItem({title:"Pika",children:[{...Jt("Sync to Pika\u2026",async()=>{St(),await Ie()}),key:"b",modifiers:["Control","Option","Command"]},{separator:!0},{...Jt("Manage Post\u2026",Ri),state:()=>(Zt(),{isEnabled:ye})},{separator:!0},Jt("Account\u2026",async()=>{St(),await _i()})]});

/*!
MarkEdit Pika — license and bundled third-party licenses

MIT License

Copyright (c) 2026 MarkEdit Prose contributors
Copyright (c) 2026 Alex Sereno (MarkEdit Pika)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.


MarkEdit preview close control styling
MIT License

Copyright (c) 2023 MarkEdit.app

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.


decode-named-character-reference 1.3.0 (MIT)
(The MIT License)

Copyright (c) Titus Wormer <tituswormer@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.


mdast-util-from-markdown 2.0.2 (MIT)
(The MIT License)

Copyright (c) Titus Wormer <tituswormer@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.


mdast-util-to-string 4.0.0 (MIT)
(The MIT License)

Copyright (c) 2015 Titus Wormer <tituswormer@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.


micromark 4.0.3 (MIT)
(The MIT License)

Copyright (c) Titus Wormer <tituswormer@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.


micromark-core-commonmark 2.0.4 (MIT)
(The MIT License)

Copyright (c) Titus Wormer <tituswormer@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.


micromark-factory-destination 2.0.1 (MIT)
(The MIT License)

Copyright (c) Titus Wormer <tituswormer@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.


micromark-factory-label 2.0.1 (MIT)
(The MIT License)

Copyright (c) Titus Wormer <tituswormer@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.


micromark-factory-space 2.1.0 (MIT)
(The MIT License)

Copyright (c) Titus Wormer <tituswormer@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.


micromark-factory-title 2.0.1 (MIT)
(The MIT License)

Copyright (c) Titus Wormer <tituswormer@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.


micromark-factory-whitespace 2.0.1 (MIT)
(The MIT License)

Copyright (c) Titus Wormer <tituswormer@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.


micromark-util-character 2.1.1 (MIT)
(The MIT License)

Copyright (c) Titus Wormer <tituswormer@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.


micromark-util-chunked 2.0.1 (MIT)
(The MIT License)

Copyright (c) Titus Wormer <tituswormer@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.


micromark-util-classify-character 2.0.1 (MIT)
(The MIT License)

Copyright (c) Titus Wormer <tituswormer@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.


micromark-util-combine-extensions 2.0.1 (MIT)
(The MIT License)

Copyright (c) Titus Wormer <tituswormer@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.


micromark-util-decode-numeric-character-reference 2.0.2 (MIT)
(The MIT License)

Copyright (c) Titus Wormer <tituswormer@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.


micromark-util-decode-string 2.0.1 (MIT)
(The MIT License)

Copyright (c) Titus Wormer <tituswormer@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.


micromark-util-edit-map 1.0.0 (MIT)
(The MIT License)

Copyright (c) Titus Wormer <tituswormer@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.


micromark-util-encode 2.0.1 (MIT)
(The MIT License)

Copyright (c) Titus Wormer <tituswormer@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.


micromark-util-html-tag-name 2.0.1 (MIT)
(The MIT License)

Copyright (c) Titus Wormer <tituswormer@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.


micromark-util-normalize-identifier 2.0.1 (MIT)
(The MIT License)

Copyright (c) Titus Wormer <tituswormer@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.


micromark-util-resolve-all 2.0.1 (MIT)
(The MIT License)

Copyright (c) Titus Wormer <tituswormer@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.


micromark-util-sanitize-uri 2.0.1 (MIT)
(The MIT License)

Copyright (c) Titus Wormer <tituswormer@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.


micromark-util-subtokenize 2.1.0 (MIT)
(The MIT License)

Copyright (c) Titus Wormer <tituswormer@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.


unist-util-stringify-position 4.0.0 (MIT)
(The MIT License)

Copyright (c) 2016 Titus Wormer <tituswormer@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/
