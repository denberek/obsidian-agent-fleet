"use strict";var ti=Object.create;var ss=Object.defineProperty;var si=Object.getOwnPropertyDescriptor;var ai=Object.getOwnPropertyNames;var ni=Object.getPrototypeOf,ii=Object.prototype.hasOwnProperty;var Re=(r,t)=>()=>(t||r((t={exports:{}}).exports,t),t.exports),ri=(r,t)=>{for(var e in t)ss(r,e,{get:t[e],enumerable:!0})},ya=(r,t,e,s)=>{if(t&&typeof t=="object"||typeof t=="function")for(let a of ai(t))!ii.call(r,a)&&a!==e&&ss(r,a,{get:()=>t[a],enumerable:!(s=si(t,a))||s.enumerable});return r};var Be=(r,t,e)=>(e=r!=null?ti(ni(r)):{},ya(t||!r||!r.__esModule?ss(e,"default",{value:r,enumerable:!0}):e,r)),oi=r=>ya(ss({},"__esModule",{value:!0}),r);var Ze=Re((Wo,Ma)=>{"use strict";var La=["nodebuffer","arraybuffer","fragments"],Fa=typeof Blob<"u";Fa&&La.push("blob");Ma.exports={BINARY_TYPES:La,CLOSE_TIMEOUT:3e4,EMPTY_BUFFER:Buffer.alloc(0),GUID:"258EAFA5-E914-47DA-95CA-C5AB0DC85B11",hasBlob:Fa,kForOnEventAttribute:Symbol("kIsForOnEventAttribute"),kListener:Symbol("kListener"),kStatusCode:Symbol("status-code"),kWebSocket:Symbol("websocket"),NOOP:()=>{}}});var $t=Re((Go,vs)=>{"use strict";var{EMPTY_BUFFER:Ti}=Ze(),zs=Buffer[Symbol.species];function Ci(r,t){if(r.length===0)return Ti;if(r.length===1)return r[0];let e=Buffer.allocUnsafe(t),s=0;for(let a=0;a<r.length;a++){let n=r[a];e.set(n,s),s+=n.length}return s<t?new zs(e.buffer,e.byteOffset,s):e}function Oa(r,t,e,s,a){for(let n=0;n<a;n++)e[s+n]=r[n]^t[n&3]}function Ba(r,t){for(let e=0;e<r.length;e++)r[e]^=t[e&3]}function _i(r){return r.length===r.buffer.byteLength?r.buffer:r.buffer.slice(r.byteOffset,r.byteOffset+r.length)}function Ws(r){if(Ws.readOnly=!0,Buffer.isBuffer(r))return r;let t;return r instanceof ArrayBuffer?t=new zs(r):ArrayBuffer.isView(r)?t=new zs(r.buffer,r.byteOffset,r.byteLength):(t=Buffer.from(r),Ws.readOnly=!1),t}vs.exports={concat:Ci,mask:Oa,toArrayBuffer:_i,toBuffer:Ws,unmask:Ba};if(!process.env.WS_NO_BUFFER_UTIL)try{let r=require("bufferutil");vs.exports.mask=function(t,e,s,a,n){n<48?Oa(t,e,s,a,n):r.mask(t,e,s,a,n)},vs.exports.unmask=function(t,e){t.length<32?Ba(t,e):r.unmask(t,e)}}catch{}});var $a=Re((Vo,Ua)=>{"use strict";var Na=Symbol("kDone"),Gs=Symbol("kRun"),Vs=class{constructor(t){this[Na]=()=>{this.pending--,this[Gs]()},this.concurrency=t||1/0,this.jobs=[],this.pending=0}add(t){this.jobs.push(t),this[Gs]()}[Gs](){if(this.pending!==this.concurrency&&this.jobs.length){let t=this.jobs.shift();this.pending++,t(this[Na])}}};Ua.exports=Vs});var _t=Re((Yo,za)=>{"use strict";var jt=require("zlib"),ja=$t(),Ei=$a(),{kStatusCode:Ha}=Ze(),Ai=Buffer[Symbol.species],Pi=Buffer.from([0,0,255,255]),ws=Symbol("permessage-deflate"),et=Symbol("total-length"),Tt=Symbol("callback"),lt=Symbol("buffers"),Ct=Symbol("error"),bs,Ys=class{constructor(t){if(this._options=t||{},this._threshold=this._options.threshold!==void 0?this._options.threshold:1024,this._maxPayload=this._options.maxPayload|0,this._isServer=!!this._options.isServer,this._deflate=null,this._inflate=null,this.params=null,!bs){let e=this._options.concurrencyLimit!==void 0?this._options.concurrencyLimit:10;bs=new Ei(e)}}static get extensionName(){return"permessage-deflate"}offer(){let t={};return this._options.serverNoContextTakeover&&(t.server_no_context_takeover=!0),this._options.clientNoContextTakeover&&(t.client_no_context_takeover=!0),this._options.serverMaxWindowBits&&(t.server_max_window_bits=this._options.serverMaxWindowBits),this._options.clientMaxWindowBits?t.client_max_window_bits=this._options.clientMaxWindowBits:this._options.clientMaxWindowBits==null&&(t.client_max_window_bits=!0),t}accept(t){return t=this.normalizeParams(t),this.params=this._isServer?this.acceptAsServer(t):this.acceptAsClient(t),this.params}cleanup(){if(this._inflate&&(this._inflate.close(),this._inflate=null),this._deflate){let t=this._deflate[Tt];this._deflate.close(),this._deflate=null,t&&t(new Error("The deflate stream was closed while data was being processed"))}}acceptAsServer(t){let e=this._options,s=t.find(a=>!(e.serverNoContextTakeover===!1&&a.server_no_context_takeover||a.server_max_window_bits&&(e.serverMaxWindowBits===!1||typeof e.serverMaxWindowBits=="number"&&e.serverMaxWindowBits>a.server_max_window_bits)||typeof e.clientMaxWindowBits=="number"&&!a.client_max_window_bits));if(!s)throw new Error("None of the extension offers can be accepted");return e.serverNoContextTakeover&&(s.server_no_context_takeover=!0),e.clientNoContextTakeover&&(s.client_no_context_takeover=!0),typeof e.serverMaxWindowBits=="number"&&(s.server_max_window_bits=e.serverMaxWindowBits),typeof e.clientMaxWindowBits=="number"?s.client_max_window_bits=e.clientMaxWindowBits:(s.client_max_window_bits===!0||e.clientMaxWindowBits===!1)&&delete s.client_max_window_bits,s}acceptAsClient(t){let e=t[0];if(this._options.clientNoContextTakeover===!1&&e.client_no_context_takeover)throw new Error('Unexpected parameter "client_no_context_takeover"');if(!e.client_max_window_bits)typeof this._options.clientMaxWindowBits=="number"&&(e.client_max_window_bits=this._options.clientMaxWindowBits);else if(this._options.clientMaxWindowBits===!1||typeof this._options.clientMaxWindowBits=="number"&&e.client_max_window_bits>this._options.clientMaxWindowBits)throw new Error('Unexpected or invalid parameter "client_max_window_bits"');return e}normalizeParams(t){return t.forEach(e=>{Object.keys(e).forEach(s=>{let a=e[s];if(a.length>1)throw new Error(`Parameter "${s}" must have only a single value`);if(a=a[0],s==="client_max_window_bits"){if(a!==!0){let n=+a;if(!Number.isInteger(n)||n<8||n>15)throw new TypeError(`Invalid value for parameter "${s}": ${a}`);a=n}else if(!this._isServer)throw new TypeError(`Invalid value for parameter "${s}": ${a}`)}else if(s==="server_max_window_bits"){let n=+a;if(!Number.isInteger(n)||n<8||n>15)throw new TypeError(`Invalid value for parameter "${s}": ${a}`);a=n}else if(s==="client_no_context_takeover"||s==="server_no_context_takeover"){if(a!==!0)throw new TypeError(`Invalid value for parameter "${s}": ${a}`)}else throw new Error(`Unknown parameter "${s}"`);e[s]=a})}),t}decompress(t,e,s){bs.add(a=>{this._decompress(t,e,(n,i)=>{a(),s(n,i)})})}compress(t,e,s){bs.add(a=>{this._compress(t,e,(n,i)=>{a(),s(n,i)})})}_decompress(t,e,s){let a=this._isServer?"client":"server";if(!this._inflate){let n=`${a}_max_window_bits`,i=typeof this.params[n]!="number"?jt.Z_DEFAULT_WINDOWBITS:this.params[n];this._inflate=jt.createInflateRaw({...this._options.zlibInflateOptions,windowBits:i}),this._inflate[ws]=this,this._inflate[et]=0,this._inflate[lt]=[],this._inflate.on("error",Ri),this._inflate.on("data",qa)}this._inflate[Tt]=s,this._inflate.write(t),e&&this._inflate.write(Pi),this._inflate.flush(()=>{let n=this._inflate[Ct];if(n){this._inflate.close(),this._inflate=null,s(n);return}let i=ja.concat(this._inflate[lt],this._inflate[et]);this._inflate._readableState.endEmitted?(this._inflate.close(),this._inflate=null):(this._inflate[et]=0,this._inflate[lt]=[],e&&this.params[`${a}_no_context_takeover`]&&this._inflate.reset()),s(null,i)})}_compress(t,e,s){let a=this._isServer?"server":"client";if(!this._deflate){let n=`${a}_max_window_bits`,i=typeof this.params[n]!="number"?jt.Z_DEFAULT_WINDOWBITS:this.params[n];this._deflate=jt.createDeflateRaw({...this._options.zlibDeflateOptions,windowBits:i}),this._deflate[et]=0,this._deflate[lt]=[],this._deflate.on("data",Di)}this._deflate[Tt]=s,this._deflate.write(t),this._deflate.flush(jt.Z_SYNC_FLUSH,()=>{if(!this._deflate)return;let n=ja.concat(this._deflate[lt],this._deflate[et]);e&&(n=new Ai(n.buffer,n.byteOffset,n.length-4)),this._deflate[Tt]=null,this._deflate[et]=0,this._deflate[lt]=[],e&&this.params[`${a}_no_context_takeover`]&&this._deflate.reset(),s(null,n)})}};za.exports=Ys;function Di(r){this[lt].push(r),this[et]+=r.length}function qa(r){if(this[et]+=r.length,this[ws]._maxPayload<1||this[et]<=this[ws]._maxPayload){this[lt].push(r);return}this[Ct]=new RangeError("Max payload size exceeded"),this[Ct].code="WS_ERR_UNSUPPORTED_MESSAGE_LENGTH",this[Ct][Ha]=1009,this.removeListener("data",qa),this.reset()}function Ri(r){if(this[ws]._inflate=null,this[Ct]){this[Tt](this[Ct]);return}r[Ha]=1007,this[Tt](r)}});var Et=Re((Ko,ks)=>{"use strict";var{isUtf8:Wa}=require("buffer"),{hasBlob:Ii}=Ze(),Li=[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,1,1,1,1,1,0,0,1,1,0,1,1,0,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,1,0,1,0];function Fi(r){return r>=1e3&&r<=1014&&r!==1004&&r!==1005&&r!==1006||r>=3e3&&r<=4999}function Ks(r){let t=r.length,e=0;for(;e<t;)if((r[e]&128)===0)e++;else if((r[e]&224)===192){if(e+1===t||(r[e+1]&192)!==128||(r[e]&254)===192)return!1;e+=2}else if((r[e]&240)===224){if(e+2>=t||(r[e+1]&192)!==128||(r[e+2]&192)!==128||r[e]===224&&(r[e+1]&224)===128||r[e]===237&&(r[e+1]&224)===160)return!1;e+=3}else if((r[e]&248)===240){if(e+3>=t||(r[e+1]&192)!==128||(r[e+2]&192)!==128||(r[e+3]&192)!==128||r[e]===240&&(r[e+1]&240)===128||r[e]===244&&r[e+1]>143||r[e]>244)return!1;e+=4}else return!1;return!0}function Mi(r){return Ii&&typeof r=="object"&&typeof r.arrayBuffer=="function"&&typeof r.type=="string"&&typeof r.stream=="function"&&(r[Symbol.toStringTag]==="Blob"||r[Symbol.toStringTag]==="File")}ks.exports={isBlob:Mi,isValidStatusCode:Fi,isValidUTF8:Ks,tokenChars:Li};if(Wa)ks.exports.isValidUTF8=function(r){return r.length<24?Ks(r):Wa(r)};else if(!process.env.WS_NO_UTF_8_VALIDATE)try{let r=require("utf-8-validate");ks.exports.isValidUTF8=function(t){return t.length<32?Ks(t):r(t)}}catch{}});var ea=Re((Xo,Qa)=>{"use strict";var{Writable:Oi}=require("stream"),Ga=_t(),{BINARY_TYPES:Bi,EMPTY_BUFFER:Va,kStatusCode:Ni,kWebSocket:Ui}=Ze(),{concat:Xs,toArrayBuffer:$i,unmask:ji}=$t(),{isValidStatusCode:Hi,isValidUTF8:Ya}=Et(),xs=Buffer[Symbol.species],Ne=0,Ka=1,Xa=2,Ja=3,Js=4,Qs=5,Ss=6,Zs=class extends Oi{constructor(t={}){super(),this._allowSynchronousEvents=t.allowSynchronousEvents!==void 0?t.allowSynchronousEvents:!0,this._binaryType=t.binaryType||Bi[0],this._extensions=t.extensions||{},this._isServer=!!t.isServer,this._maxPayload=t.maxPayload|0,this._skipUTF8Validation=!!t.skipUTF8Validation,this[Ui]=void 0,this._bufferedBytes=0,this._buffers=[],this._compressed=!1,this._payloadLength=0,this._mask=void 0,this._fragmented=0,this._masked=!1,this._fin=!1,this._opcode=0,this._totalPayloadLength=0,this._messageLength=0,this._fragments=[],this._errored=!1,this._loop=!1,this._state=Ne}_write(t,e,s){if(this._opcode===8&&this._state==Ne)return s();this._bufferedBytes+=t.length,this._buffers.push(t),this.startLoop(s)}consume(t){if(this._bufferedBytes-=t,t===this._buffers[0].length)return this._buffers.shift();if(t<this._buffers[0].length){let s=this._buffers[0];return this._buffers[0]=new xs(s.buffer,s.byteOffset+t,s.length-t),new xs(s.buffer,s.byteOffset,t)}let e=Buffer.allocUnsafe(t);do{let s=this._buffers[0],a=e.length-t;t>=s.length?e.set(this._buffers.shift(),a):(e.set(new Uint8Array(s.buffer,s.byteOffset,t),a),this._buffers[0]=new xs(s.buffer,s.byteOffset+t,s.length-t)),t-=s.length}while(t>0);return e}startLoop(t){this._loop=!0;do switch(this._state){case Ne:this.getInfo(t);break;case Ka:this.getPayloadLength16(t);break;case Xa:this.getPayloadLength64(t);break;case Ja:this.getMask();break;case Js:this.getData(t);break;case Qs:case Ss:this._loop=!1;return}while(this._loop);this._errored||t()}getInfo(t){if(this._bufferedBytes<2){this._loop=!1;return}let e=this.consume(2);if((e[0]&48)!==0){let a=this.createError(RangeError,"RSV2 and RSV3 must be clear",!0,1002,"WS_ERR_UNEXPECTED_RSV_2_3");t(a);return}let s=(e[0]&64)===64;if(s&&!this._extensions[Ga.extensionName]){let a=this.createError(RangeError,"RSV1 must be clear",!0,1002,"WS_ERR_UNEXPECTED_RSV_1");t(a);return}if(this._fin=(e[0]&128)===128,this._opcode=e[0]&15,this._payloadLength=e[1]&127,this._opcode===0){if(s){let a=this.createError(RangeError,"RSV1 must be clear",!0,1002,"WS_ERR_UNEXPECTED_RSV_1");t(a);return}if(!this._fragmented){let a=this.createError(RangeError,"invalid opcode 0",!0,1002,"WS_ERR_INVALID_OPCODE");t(a);return}this._opcode=this._fragmented}else if(this._opcode===1||this._opcode===2){if(this._fragmented){let a=this.createError(RangeError,`invalid opcode ${this._opcode}`,!0,1002,"WS_ERR_INVALID_OPCODE");t(a);return}this._compressed=s}else if(this._opcode>7&&this._opcode<11){if(!this._fin){let a=this.createError(RangeError,"FIN must be set",!0,1002,"WS_ERR_EXPECTED_FIN");t(a);return}if(s){let a=this.createError(RangeError,"RSV1 must be clear",!0,1002,"WS_ERR_UNEXPECTED_RSV_1");t(a);return}if(this._payloadLength>125||this._opcode===8&&this._payloadLength===1){let a=this.createError(RangeError,`invalid payload length ${this._payloadLength}`,!0,1002,"WS_ERR_INVALID_CONTROL_PAYLOAD_LENGTH");t(a);return}}else{let a=this.createError(RangeError,`invalid opcode ${this._opcode}`,!0,1002,"WS_ERR_INVALID_OPCODE");t(a);return}if(!this._fin&&!this._fragmented&&(this._fragmented=this._opcode),this._masked=(e[1]&128)===128,this._isServer){if(!this._masked){let a=this.createError(RangeError,"MASK must be set",!0,1002,"WS_ERR_EXPECTED_MASK");t(a);return}}else if(this._masked){let a=this.createError(RangeError,"MASK must be clear",!0,1002,"WS_ERR_UNEXPECTED_MASK");t(a);return}this._payloadLength===126?this._state=Ka:this._payloadLength===127?this._state=Xa:this.haveLength(t)}getPayloadLength16(t){if(this._bufferedBytes<2){this._loop=!1;return}this._payloadLength=this.consume(2).readUInt16BE(0),this.haveLength(t)}getPayloadLength64(t){if(this._bufferedBytes<8){this._loop=!1;return}let e=this.consume(8),s=e.readUInt32BE(0);if(s>Math.pow(2,21)-1){let a=this.createError(RangeError,"Unsupported WebSocket frame: payload length > 2^53 - 1",!1,1009,"WS_ERR_UNSUPPORTED_DATA_PAYLOAD_LENGTH");t(a);return}this._payloadLength=s*Math.pow(2,32)+e.readUInt32BE(4),this.haveLength(t)}haveLength(t){if(this._payloadLength&&this._opcode<8&&(this._totalPayloadLength+=this._payloadLength,this._totalPayloadLength>this._maxPayload&&this._maxPayload>0)){let e=this.createError(RangeError,"Max payload size exceeded",!1,1009,"WS_ERR_UNSUPPORTED_MESSAGE_LENGTH");t(e);return}this._masked?this._state=Ja:this._state=Js}getMask(){if(this._bufferedBytes<4){this._loop=!1;return}this._mask=this.consume(4),this._state=Js}getData(t){let e=Va;if(this._payloadLength){if(this._bufferedBytes<this._payloadLength){this._loop=!1;return}e=this.consume(this._payloadLength),this._masked&&(this._mask[0]|this._mask[1]|this._mask[2]|this._mask[3])!==0&&ji(e,this._mask)}if(this._opcode>7){this.controlMessage(e,t);return}if(this._compressed){this._state=Qs,this.decompress(e,t);return}e.length&&(this._messageLength=this._totalPayloadLength,this._fragments.push(e)),this.dataMessage(t)}decompress(t,e){this._extensions[Ga.extensionName].decompress(t,this._fin,(a,n)=>{if(a)return e(a);if(n.length){if(this._messageLength+=n.length,this._messageLength>this._maxPayload&&this._maxPayload>0){let i=this.createError(RangeError,"Max payload size exceeded",!1,1009,"WS_ERR_UNSUPPORTED_MESSAGE_LENGTH");e(i);return}this._fragments.push(n)}this.dataMessage(e),this._state===Ne&&this.startLoop(e)})}dataMessage(t){if(!this._fin){this._state=Ne;return}let e=this._messageLength,s=this._fragments;if(this._totalPayloadLength=0,this._messageLength=0,this._fragmented=0,this._fragments=[],this._opcode===2){let a;this._binaryType==="nodebuffer"?a=Xs(s,e):this._binaryType==="arraybuffer"?a=$i(Xs(s,e)):this._binaryType==="blob"?a=new Blob(s):a=s,this._allowSynchronousEvents?(this.emit("message",a,!0),this._state=Ne):(this._state=Ss,setImmediate(()=>{this.emit("message",a,!0),this._state=Ne,this.startLoop(t)}))}else{let a=Xs(s,e);if(!this._skipUTF8Validation&&!Ya(a)){let n=this.createError(Error,"invalid UTF-8 sequence",!0,1007,"WS_ERR_INVALID_UTF8");t(n);return}this._state===Qs||this._allowSynchronousEvents?(this.emit("message",a,!1),this._state=Ne):(this._state=Ss,setImmediate(()=>{this.emit("message",a,!1),this._state=Ne,this.startLoop(t)}))}}controlMessage(t,e){if(this._opcode===8){if(t.length===0)this._loop=!1,this.emit("conclude",1005,Va),this.end();else{let s=t.readUInt16BE(0);if(!Hi(s)){let n=this.createError(RangeError,`invalid status code ${s}`,!0,1002,"WS_ERR_INVALID_CLOSE_CODE");e(n);return}let a=new xs(t.buffer,t.byteOffset+2,t.length-2);if(!this._skipUTF8Validation&&!Ya(a)){let n=this.createError(Error,"invalid UTF-8 sequence",!0,1007,"WS_ERR_INVALID_UTF8");e(n);return}this._loop=!1,this.emit("conclude",s,a),this.end()}this._state=Ne;return}this._allowSynchronousEvents?(this.emit(this._opcode===9?"ping":"pong",t),this._state=Ne):(this._state=Ss,setImmediate(()=>{this.emit(this._opcode===9?"ping":"pong",t),this._state=Ne,this.startLoop(e)}))}createError(t,e,s,a,n){this._loop=!1,this._errored=!0;let i=new t(s?`Invalid WebSocket frame: ${e}`:e);return Error.captureStackTrace(i,this.createError),i.code=n,i[Ni]=a,i}};Qa.exports=Zs});var aa=Re((Qo,tn)=>{"use strict";var{Duplex:Jo}=require("stream"),{randomFillSync:qi}=require("crypto"),Za=_t(),{EMPTY_BUFFER:zi,kWebSocket:Wi,NOOP:Gi}=Ze(),{isBlob:At,isValidStatusCode:Vi}=Et(),{mask:en,toBuffer:pt}=$t(),Ue=Symbol("kByteLength"),Yi=Buffer.alloc(4),Ts=8*1024,mt,Pt=Ts,qe=0,Ki=1,Xi=2,ta=class r{constructor(t,e,s){this._extensions=e||{},s&&(this._generateMask=s,this._maskBuffer=Buffer.alloc(4)),this._socket=t,this._firstFragment=!0,this._compress=!1,this._bufferedBytes=0,this._queue=[],this._state=qe,this.onerror=Gi,this[Wi]=void 0}static frame(t,e){let s,a=!1,n=2,i=!1;e.mask&&(s=e.maskBuffer||Yi,e.generateMask?e.generateMask(s):(Pt===Ts&&(mt===void 0&&(mt=Buffer.alloc(Ts)),qi(mt,0,Ts),Pt=0),s[0]=mt[Pt++],s[1]=mt[Pt++],s[2]=mt[Pt++],s[3]=mt[Pt++]),i=(s[0]|s[1]|s[2]|s[3])===0,n=6);let o;typeof t=="string"?(!e.mask||i)&&e[Ue]!==void 0?o=e[Ue]:(t=Buffer.from(t),o=t.length):(o=t.length,a=e.mask&&e.readOnly&&!i);let l=o;o>=65536?(n+=8,l=127):o>125&&(n+=2,l=126);let c=Buffer.allocUnsafe(a?o+n:n);return c[0]=e.fin?e.opcode|128:e.opcode,e.rsv1&&(c[0]|=64),c[1]=l,l===126?c.writeUInt16BE(o,2):l===127&&(c[2]=c[3]=0,c.writeUIntBE(o,4,6)),e.mask?(c[1]|=128,c[n-4]=s[0],c[n-3]=s[1],c[n-2]=s[2],c[n-1]=s[3],i?[c,t]:a?(en(t,s,c,n,o),[c]):(en(t,s,t,0,o),[c,t])):[c,t]}close(t,e,s,a){let n;if(t===void 0)n=zi;else{if(typeof t!="number"||!Vi(t))throw new TypeError("First argument must be a valid error code number");if(e===void 0||!e.length)n=Buffer.allocUnsafe(2),n.writeUInt16BE(t,0);else{let o=Buffer.byteLength(e);if(o>123)throw new RangeError("The message must not be greater than 123 bytes");n=Buffer.allocUnsafe(2+o),n.writeUInt16BE(t,0),typeof e=="string"?n.write(e,2):n.set(e,2)}}let i={[Ue]:n.length,fin:!0,generateMask:this._generateMask,mask:s,maskBuffer:this._maskBuffer,opcode:8,readOnly:!1,rsv1:!1};this._state!==qe?this.enqueue([this.dispatch,n,!1,i,a]):this.sendFrame(r.frame(n,i),a)}ping(t,e,s){let a,n;if(typeof t=="string"?(a=Buffer.byteLength(t),n=!1):At(t)?(a=t.size,n=!1):(t=pt(t),a=t.length,n=pt.readOnly),a>125)throw new RangeError("The data size must not be greater than 125 bytes");let i={[Ue]:a,fin:!0,generateMask:this._generateMask,mask:e,maskBuffer:this._maskBuffer,opcode:9,readOnly:n,rsv1:!1};At(t)?this._state!==qe?this.enqueue([this.getBlobData,t,!1,i,s]):this.getBlobData(t,!1,i,s):this._state!==qe?this.enqueue([this.dispatch,t,!1,i,s]):this.sendFrame(r.frame(t,i),s)}pong(t,e,s){let a,n;if(typeof t=="string"?(a=Buffer.byteLength(t),n=!1):At(t)?(a=t.size,n=!1):(t=pt(t),a=t.length,n=pt.readOnly),a>125)throw new RangeError("The data size must not be greater than 125 bytes");let i={[Ue]:a,fin:!0,generateMask:this._generateMask,mask:e,maskBuffer:this._maskBuffer,opcode:10,readOnly:n,rsv1:!1};At(t)?this._state!==qe?this.enqueue([this.getBlobData,t,!1,i,s]):this.getBlobData(t,!1,i,s):this._state!==qe?this.enqueue([this.dispatch,t,!1,i,s]):this.sendFrame(r.frame(t,i),s)}send(t,e,s){let a=this._extensions[Za.extensionName],n=e.binary?2:1,i=e.compress,o,l;typeof t=="string"?(o=Buffer.byteLength(t),l=!1):At(t)?(o=t.size,l=!1):(t=pt(t),o=t.length,l=pt.readOnly),this._firstFragment?(this._firstFragment=!1,i&&a&&a.params[a._isServer?"server_no_context_takeover":"client_no_context_takeover"]&&(i=o>=a._threshold),this._compress=i):(i=!1,n=0),e.fin&&(this._firstFragment=!0);let c={[Ue]:o,fin:e.fin,generateMask:this._generateMask,mask:e.mask,maskBuffer:this._maskBuffer,opcode:n,readOnly:l,rsv1:i};At(t)?this._state!==qe?this.enqueue([this.getBlobData,t,this._compress,c,s]):this.getBlobData(t,this._compress,c,s):this._state!==qe?this.enqueue([this.dispatch,t,this._compress,c,s]):this.dispatch(t,this._compress,c,s)}getBlobData(t,e,s,a){this._bufferedBytes+=s[Ue],this._state=Xi,t.arrayBuffer().then(n=>{if(this._socket.destroyed){let o=new Error("The socket was closed while the blob was being read");process.nextTick(sa,this,o,a);return}this._bufferedBytes-=s[Ue];let i=pt(n);e?this.dispatch(i,e,s,a):(this._state=qe,this.sendFrame(r.frame(i,s),a),this.dequeue())}).catch(n=>{process.nextTick(Ji,this,n,a)})}dispatch(t,e,s,a){if(!e){this.sendFrame(r.frame(t,s),a);return}let n=this._extensions[Za.extensionName];this._bufferedBytes+=s[Ue],this._state=Ki,n.compress(t,s.fin,(i,o)=>{if(this._socket.destroyed){let l=new Error("The socket was closed while data was being compressed");sa(this,l,a);return}this._bufferedBytes-=s[Ue],this._state=qe,s.readOnly=!1,this.sendFrame(r.frame(o,s),a),this.dequeue()})}dequeue(){for(;this._state===qe&&this._queue.length;){let t=this._queue.shift();this._bufferedBytes-=t[3][Ue],Reflect.apply(t[0],this,t.slice(1))}}enqueue(t){this._bufferedBytes+=t[3][Ue],this._queue.push(t)}sendFrame(t,e){t.length===2?(this._socket.cork(),this._socket.write(t[0]),this._socket.write(t[1],e),this._socket.uncork()):this._socket.write(t[0],e)}};tn.exports=ta;function sa(r,t,e){typeof e=="function"&&e(t);for(let s=0;s<r._queue.length;s++){let a=r._queue[s],n=a[a.length-1];typeof n=="function"&&n(t)}}function Ji(r,t,e){sa(r,t,e),r.onerror(t)}});var un=Re((Zo,dn)=>{"use strict";var{kForOnEventAttribute:Ht,kListener:na}=Ze(),sn=Symbol("kCode"),an=Symbol("kData"),nn=Symbol("kError"),rn=Symbol("kMessage"),on=Symbol("kReason"),Dt=Symbol("kTarget"),ln=Symbol("kType"),cn=Symbol("kWasClean"),tt=class{constructor(t){this[Dt]=null,this[ln]=t}get target(){return this[Dt]}get type(){return this[ln]}};Object.defineProperty(tt.prototype,"target",{enumerable:!0});Object.defineProperty(tt.prototype,"type",{enumerable:!0});var ft=class extends tt{constructor(t,e={}){super(t),this[sn]=e.code===void 0?0:e.code,this[on]=e.reason===void 0?"":e.reason,this[cn]=e.wasClean===void 0?!1:e.wasClean}get code(){return this[sn]}get reason(){return this[on]}get wasClean(){return this[cn]}};Object.defineProperty(ft.prototype,"code",{enumerable:!0});Object.defineProperty(ft.prototype,"reason",{enumerable:!0});Object.defineProperty(ft.prototype,"wasClean",{enumerable:!0});var Rt=class extends tt{constructor(t,e={}){super(t),this[nn]=e.error===void 0?null:e.error,this[rn]=e.message===void 0?"":e.message}get error(){return this[nn]}get message(){return this[rn]}};Object.defineProperty(Rt.prototype,"error",{enumerable:!0});Object.defineProperty(Rt.prototype,"message",{enumerable:!0});var qt=class extends tt{constructor(t,e={}){super(t),this[an]=e.data===void 0?null:e.data}get data(){return this[an]}};Object.defineProperty(qt.prototype,"data",{enumerable:!0});var Qi={addEventListener(r,t,e={}){for(let a of this.listeners(r))if(!e[Ht]&&a[na]===t&&!a[Ht])return;let s;if(r==="message")s=function(n,i){let o=new qt("message",{data:i?n:n.toString()});o[Dt]=this,Cs(t,this,o)};else if(r==="close")s=function(n,i){let o=new ft("close",{code:n,reason:i.toString(),wasClean:this._closeFrameReceived&&this._closeFrameSent});o[Dt]=this,Cs(t,this,o)};else if(r==="error")s=function(n){let i=new Rt("error",{error:n,message:n.message});i[Dt]=this,Cs(t,this,i)};else if(r==="open")s=function(){let n=new tt("open");n[Dt]=this,Cs(t,this,n)};else return;s[Ht]=!!e[Ht],s[na]=t,e.once?this.once(r,s):this.on(r,s)},removeEventListener(r,t){for(let e of this.listeners(r))if(e[na]===t&&!e[Ht]){this.removeListener(r,e);break}}};dn.exports={CloseEvent:ft,ErrorEvent:Rt,Event:tt,EventTarget:Qi,MessageEvent:qt};function Cs(r,t,e){typeof r=="object"&&r.handleEvent?r.handleEvent.call(r,e):r.call(t,e)}});var _s=Re((el,hn)=>{"use strict";var{tokenChars:zt}=Et();function Ke(r,t,e){r[t]===void 0?r[t]=[e]:r[t].push(e)}function Zi(r){let t=Object.create(null),e=Object.create(null),s=!1,a=!1,n=!1,i,o,l=-1,c=-1,d=-1,u=0;for(;u<r.length;u++)if(c=r.charCodeAt(u),i===void 0)if(d===-1&&zt[c]===1)l===-1&&(l=u);else if(u!==0&&(c===32||c===9))d===-1&&l!==-1&&(d=u);else if(c===59||c===44){if(l===-1)throw new SyntaxError(`Unexpected character at index ${u}`);d===-1&&(d=u);let m=r.slice(l,d);c===44?(Ke(t,m,e),e=Object.create(null)):i=m,l=d=-1}else throw new SyntaxError(`Unexpected character at index ${u}`);else if(o===void 0)if(d===-1&&zt[c]===1)l===-1&&(l=u);else if(c===32||c===9)d===-1&&l!==-1&&(d=u);else if(c===59||c===44){if(l===-1)throw new SyntaxError(`Unexpected character at index ${u}`);d===-1&&(d=u),Ke(e,r.slice(l,d),!0),c===44&&(Ke(t,i,e),e=Object.create(null),i=void 0),l=d=-1}else if(c===61&&l!==-1&&d===-1)o=r.slice(l,u),l=d=-1;else throw new SyntaxError(`Unexpected character at index ${u}`);else if(a){if(zt[c]!==1)throw new SyntaxError(`Unexpected character at index ${u}`);l===-1?l=u:s||(s=!0),a=!1}else if(n)if(zt[c]===1)l===-1&&(l=u);else if(c===34&&l!==-1)n=!1,d=u;else if(c===92)a=!0;else throw new SyntaxError(`Unexpected character at index ${u}`);else if(c===34&&r.charCodeAt(u-1)===61)n=!0;else if(d===-1&&zt[c]===1)l===-1&&(l=u);else if(l!==-1&&(c===32||c===9))d===-1&&(d=u);else if(c===59||c===44){if(l===-1)throw new SyntaxError(`Unexpected character at index ${u}`);d===-1&&(d=u);let m=r.slice(l,d);s&&(m=m.replace(/\\/g,""),s=!1),Ke(e,o,m),c===44&&(Ke(t,i,e),e=Object.create(null),i=void 0),o=void 0,l=d=-1}else throw new SyntaxError(`Unexpected character at index ${u}`);if(l===-1||n||c===32||c===9)throw new SyntaxError("Unexpected end of input");d===-1&&(d=u);let h=r.slice(l,d);return i===void 0?Ke(t,h,e):(o===void 0?Ke(e,h,!0):s?Ke(e,o,h.replace(/\\/g,"")):Ke(e,o,h),Ke(t,i,e)),t}function er(r){return Object.keys(r).map(t=>{let e=r[t];return Array.isArray(e)||(e=[e]),e.map(s=>[t].concat(Object.keys(s).map(a=>{let n=s[a];return Array.isArray(n)||(n=[n]),n.map(i=>i===!0?a:`${a}=${i}`).join("; ")})).join("; ")).join(", ")}).join(", ")}hn.exports={format:er,parse:Zi}});var Ds=Re((al,Tn)=>{"use strict";var tr=require("events"),sr=require("https"),ar=require("http"),fn=require("net"),nr=require("tls"),{randomBytes:ir,createHash:rr}=require("crypto"),{Duplex:tl,Readable:sl}=require("stream"),{URL:ia}=require("url"),ct=_t(),or=ea(),lr=aa(),{isBlob:cr}=Et(),{BINARY_TYPES:pn,CLOSE_TIMEOUT:dr,EMPTY_BUFFER:Es,GUID:ur,kForOnEventAttribute:ra,kListener:hr,kStatusCode:pr,kWebSocket:be,NOOP:gn}=Ze(),{EventTarget:{addEventListener:mr,removeEventListener:fr}}=un(),{format:gr,parse:yr}=_s(),{toBuffer:vr}=$t(),yn=Symbol("kAborted"),oa=[8,13],st=["CONNECTING","OPEN","CLOSING","CLOSED"],br=/^[!#$%&'*+\-.0-9A-Z^_`|a-z~]+$/,oe=class r extends tr{constructor(t,e,s){super(),this._binaryType=pn[0],this._closeCode=1006,this._closeFrameReceived=!1,this._closeFrameSent=!1,this._closeMessage=Es,this._closeTimer=null,this._errorEmitted=!1,this._extensions={},this._paused=!1,this._protocol="",this._readyState=r.CONNECTING,this._receiver=null,this._sender=null,this._socket=null,t!==null?(this._bufferedAmount=0,this._isServer=!1,this._redirects=0,e===void 0?e=[]:Array.isArray(e)||(typeof e=="object"&&e!==null?(s=e,e=[]):e=[e]),vn(this,t,e,s)):(this._autoPong=s.autoPong,this._closeTimeout=s.closeTimeout,this._isServer=!0)}get binaryType(){return this._binaryType}set binaryType(t){pn.includes(t)&&(this._binaryType=t,this._receiver&&(this._receiver._binaryType=t))}get bufferedAmount(){return this._socket?this._socket._writableState.length+this._sender._bufferedBytes:this._bufferedAmount}get extensions(){return Object.keys(this._extensions).join()}get isPaused(){return this._paused}get onclose(){return null}get onerror(){return null}get onopen(){return null}get onmessage(){return null}get protocol(){return this._protocol}get readyState(){return this._readyState}get url(){return this._url}setSocket(t,e,s){let a=new or({allowSynchronousEvents:s.allowSynchronousEvents,binaryType:this.binaryType,extensions:this._extensions,isServer:this._isServer,maxPayload:s.maxPayload,skipUTF8Validation:s.skipUTF8Validation}),n=new lr(t,this._extensions,s.generateMask);this._receiver=a,this._sender=n,this._socket=t,a[be]=this,n[be]=this,t[be]=this,a.on("conclude",xr),a.on("drain",Sr),a.on("error",Tr),a.on("message",Cr),a.on("ping",_r),a.on("pong",Er),n.onerror=Ar,t.setTimeout&&t.setTimeout(0),t.setNoDelay&&t.setNoDelay(),e.length>0&&t.unshift(e),t.on("close",kn),t.on("data",Ps),t.on("end",xn),t.on("error",Sn),this._readyState=r.OPEN,this.emit("open")}emitClose(){if(!this._socket){this._readyState=r.CLOSED,this.emit("close",this._closeCode,this._closeMessage);return}this._extensions[ct.extensionName]&&this._extensions[ct.extensionName].cleanup(),this._receiver.removeAllListeners(),this._readyState=r.CLOSED,this.emit("close",this._closeCode,this._closeMessage)}close(t,e){if(this.readyState!==r.CLOSED){if(this.readyState===r.CONNECTING){Le(this,this._req,"WebSocket was closed before the connection was established");return}if(this.readyState===r.CLOSING){this._closeFrameSent&&(this._closeFrameReceived||this._receiver._writableState.errorEmitted)&&this._socket.end();return}this._readyState=r.CLOSING,this._sender.close(t,e,!this._isServer,s=>{s||(this._closeFrameSent=!0,(this._closeFrameReceived||this._receiver._writableState.errorEmitted)&&this._socket.end())}),wn(this)}}pause(){this.readyState===r.CONNECTING||this.readyState===r.CLOSED||(this._paused=!0,this._socket.pause())}ping(t,e,s){if(this.readyState===r.CONNECTING)throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");if(typeof t=="function"?(s=t,t=e=void 0):typeof e=="function"&&(s=e,e=void 0),typeof t=="number"&&(t=t.toString()),this.readyState!==r.OPEN){la(this,t,s);return}e===void 0&&(e=!this._isServer),this._sender.ping(t||Es,e,s)}pong(t,e,s){if(this.readyState===r.CONNECTING)throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");if(typeof t=="function"?(s=t,t=e=void 0):typeof e=="function"&&(s=e,e=void 0),typeof t=="number"&&(t=t.toString()),this.readyState!==r.OPEN){la(this,t,s);return}e===void 0&&(e=!this._isServer),this._sender.pong(t||Es,e,s)}resume(){this.readyState===r.CONNECTING||this.readyState===r.CLOSED||(this._paused=!1,this._receiver._writableState.needDrain||this._socket.resume())}send(t,e,s){if(this.readyState===r.CONNECTING)throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");if(typeof e=="function"&&(s=e,e={}),typeof t=="number"&&(t=t.toString()),this.readyState!==r.OPEN){la(this,t,s);return}let a={binary:typeof t!="string",mask:!this._isServer,compress:!0,fin:!0,...e};this._extensions[ct.extensionName]||(a.compress=!1),this._sender.send(t||Es,a,s)}terminate(){if(this.readyState!==r.CLOSED){if(this.readyState===r.CONNECTING){Le(this,this._req,"WebSocket was closed before the connection was established");return}this._socket&&(this._readyState=r.CLOSING,this._socket.destroy())}}};Object.defineProperty(oe,"CONNECTING",{enumerable:!0,value:st.indexOf("CONNECTING")});Object.defineProperty(oe.prototype,"CONNECTING",{enumerable:!0,value:st.indexOf("CONNECTING")});Object.defineProperty(oe,"OPEN",{enumerable:!0,value:st.indexOf("OPEN")});Object.defineProperty(oe.prototype,"OPEN",{enumerable:!0,value:st.indexOf("OPEN")});Object.defineProperty(oe,"CLOSING",{enumerable:!0,value:st.indexOf("CLOSING")});Object.defineProperty(oe.prototype,"CLOSING",{enumerable:!0,value:st.indexOf("CLOSING")});Object.defineProperty(oe,"CLOSED",{enumerable:!0,value:st.indexOf("CLOSED")});Object.defineProperty(oe.prototype,"CLOSED",{enumerable:!0,value:st.indexOf("CLOSED")});["binaryType","bufferedAmount","extensions","isPaused","protocol","readyState","url"].forEach(r=>{Object.defineProperty(oe.prototype,r,{enumerable:!0})});["open","error","close","message"].forEach(r=>{Object.defineProperty(oe.prototype,`on${r}`,{enumerable:!0,get(){for(let t of this.listeners(r))if(t[ra])return t[hr];return null},set(t){for(let e of this.listeners(r))if(e[ra]){this.removeListener(r,e);break}typeof t=="function"&&this.addEventListener(r,t,{[ra]:!0})}})});oe.prototype.addEventListener=mr;oe.prototype.removeEventListener=fr;Tn.exports=oe;function vn(r,t,e,s){let a={allowSynchronousEvents:!0,autoPong:!0,closeTimeout:dr,protocolVersion:oa[1],maxPayload:104857600,skipUTF8Validation:!1,perMessageDeflate:!0,followRedirects:!1,maxRedirects:10,...s,socketPath:void 0,hostname:void 0,protocol:void 0,timeout:void 0,method:"GET",host:void 0,path:void 0,port:void 0};if(r._autoPong=a.autoPong,r._closeTimeout=a.closeTimeout,!oa.includes(a.protocolVersion))throw new RangeError(`Unsupported protocol version: ${a.protocolVersion} (supported versions: ${oa.join(", ")})`);let n;if(t instanceof ia)n=t;else try{n=new ia(t)}catch{throw new SyntaxError(`Invalid URL: ${t}`)}n.protocol==="http:"?n.protocol="ws:":n.protocol==="https:"&&(n.protocol="wss:"),r._url=n.href;let i=n.protocol==="wss:",o=n.protocol==="ws+unix:",l;if(n.protocol!=="ws:"&&!i&&!o?l=`The URL's protocol must be one of "ws:", "wss:", "http:", "https:", or "ws+unix:"`:o&&!n.pathname?l="The URL's pathname is empty":n.hash&&(l="The URL contains a fragment identifier"),l){let p=new SyntaxError(l);if(r._redirects===0)throw p;As(r,p);return}let c=i?443:80,d=ir(16).toString("base64"),u=i?sr.request:ar.request,h=new Set,m;if(a.createConnection=a.createConnection||(i?kr:wr),a.defaultPort=a.defaultPort||c,a.port=n.port||c,a.host=n.hostname.startsWith("[")?n.hostname.slice(1,-1):n.hostname,a.headers={...a.headers,"Sec-WebSocket-Version":a.protocolVersion,"Sec-WebSocket-Key":d,Connection:"Upgrade",Upgrade:"websocket"},a.path=n.pathname+n.search,a.timeout=a.handshakeTimeout,a.perMessageDeflate&&(m=new ct({...a.perMessageDeflate,isServer:!1,maxPayload:a.maxPayload}),a.headers["Sec-WebSocket-Extensions"]=gr({[ct.extensionName]:m.offer()})),e.length){for(let p of e){if(typeof p!="string"||!br.test(p)||h.has(p))throw new SyntaxError("An invalid or duplicated subprotocol was specified");h.add(p)}a.headers["Sec-WebSocket-Protocol"]=e.join(",")}if(a.origin&&(a.protocolVersion<13?a.headers["Sec-WebSocket-Origin"]=a.origin:a.headers.Origin=a.origin),(n.username||n.password)&&(a.auth=`${n.username}:${n.password}`),o){let p=a.path.split(":");a.socketPath=p[0],a.path=p[1]}let f;if(a.followRedirects){if(r._redirects===0){r._originalIpc=o,r._originalSecure=i,r._originalHostOrSocketPath=o?a.socketPath:n.host;let p=s&&s.headers;if(s={...s,headers:{}},p)for(let[v,k]of Object.entries(p))s.headers[v.toLowerCase()]=k}else if(r.listenerCount("redirect")===0){let p=o?r._originalIpc?a.socketPath===r._originalHostOrSocketPath:!1:r._originalIpc?!1:n.host===r._originalHostOrSocketPath;(!p||r._originalSecure&&!i)&&(delete a.headers.authorization,delete a.headers.cookie,p||delete a.headers.host,a.auth=void 0)}a.auth&&!s.headers.authorization&&(s.headers.authorization="Basic "+Buffer.from(a.auth).toString("base64")),f=r._req=u(a),r._redirects&&r.emit("redirect",r.url,f)}else f=r._req=u(a);a.timeout&&f.on("timeout",()=>{Le(r,f,"Opening handshake has timed out")}),f.on("error",p=>{f===null||f[yn]||(f=r._req=null,As(r,p))}),f.on("response",p=>{let v=p.headers.location,k=p.statusCode;if(v&&a.followRedirects&&k>=300&&k<400){if(++r._redirects>a.maxRedirects){Le(r,f,"Maximum redirects exceeded");return}f.abort();let w;try{w=new ia(v,t)}catch{let y=new SyntaxError(`Invalid URL: ${v}`);As(r,y);return}vn(r,w,e,s)}else r.emit("unexpected-response",f,p)||Le(r,f,`Unexpected server response: ${p.statusCode}`)}),f.on("upgrade",(p,v,k)=>{if(r.emit("upgrade",p),r.readyState!==oe.CONNECTING)return;f=r._req=null;let w=p.headers.upgrade;if(w===void 0||w.toLowerCase()!=="websocket"){Le(r,v,"Invalid Upgrade header");return}let g=rr("sha1").update(d+ur).digest("base64");if(p.headers["sec-websocket-accept"]!==g){Le(r,v,"Invalid Sec-WebSocket-Accept header");return}let y=p.headers["sec-websocket-protocol"],x;if(y!==void 0?h.size?h.has(y)||(x="Server sent an invalid subprotocol"):x="Server sent a subprotocol but none was requested":h.size&&(x="Server sent no subprotocol"),x){Le(r,v,x);return}y&&(r._protocol=y);let T=p.headers["sec-websocket-extensions"];if(T!==void 0){if(!m){Le(r,v,"Server sent a Sec-WebSocket-Extensions header but no extension was requested");return}let C;try{C=yr(T)}catch{Le(r,v,"Invalid Sec-WebSocket-Extensions header");return}let A=Object.keys(C);if(A.length!==1||A[0]!==ct.extensionName){Le(r,v,"Server indicated an extension that was not requested");return}try{m.accept(C[ct.extensionName])}catch{Le(r,v,"Invalid Sec-WebSocket-Extensions header");return}r._extensions[ct.extensionName]=m}r.setSocket(v,k,{allowSynchronousEvents:a.allowSynchronousEvents,generateMask:a.generateMask,maxPayload:a.maxPayload,skipUTF8Validation:a.skipUTF8Validation})}),a.finishRequest?a.finishRequest(f,r):f.end()}function As(r,t){r._readyState=oe.CLOSING,r._errorEmitted=!0,r.emit("error",t),r.emitClose()}function wr(r){return r.path=r.socketPath,fn.connect(r)}function kr(r){return r.path=void 0,!r.servername&&r.servername!==""&&(r.servername=fn.isIP(r.host)?"":r.host),nr.connect(r)}function Le(r,t,e){r._readyState=oe.CLOSING;let s=new Error(e);Error.captureStackTrace(s,Le),t.setHeader?(t[yn]=!0,t.abort(),t.socket&&!t.socket.destroyed&&t.socket.destroy(),process.nextTick(As,r,s)):(t.destroy(s),t.once("error",r.emit.bind(r,"error")),t.once("close",r.emitClose.bind(r)))}function la(r,t,e){if(t){let s=cr(t)?t.size:vr(t).length;r._socket?r._sender._bufferedBytes+=s:r._bufferedAmount+=s}if(e){let s=new Error(`WebSocket is not open: readyState ${r.readyState} (${st[r.readyState]})`);process.nextTick(e,s)}}function xr(r,t){let e=this[be];e._closeFrameReceived=!0,e._closeMessage=t,e._closeCode=r,e._socket[be]!==void 0&&(e._socket.removeListener("data",Ps),process.nextTick(bn,e._socket),r===1005?e.close():e.close(r,t))}function Sr(){let r=this[be];r.isPaused||r._socket.resume()}function Tr(r){let t=this[be];t._socket[be]!==void 0&&(t._socket.removeListener("data",Ps),process.nextTick(bn,t._socket),t.close(r[pr])),t._errorEmitted||(t._errorEmitted=!0,t.emit("error",r))}function mn(){this[be].emitClose()}function Cr(r,t){this[be].emit("message",r,t)}function _r(r){let t=this[be];t._autoPong&&t.pong(r,!this._isServer,gn),t.emit("ping",r)}function Er(r){this[be].emit("pong",r)}function bn(r){r.resume()}function Ar(r){let t=this[be];t.readyState!==oe.CLOSED&&(t.readyState===oe.OPEN&&(t._readyState=oe.CLOSING,wn(t)),this._socket.end(),t._errorEmitted||(t._errorEmitted=!0,t.emit("error",r)))}function wn(r){r._closeTimer=setTimeout(r._socket.destroy.bind(r._socket),r._closeTimeout)}function kn(){let r=this[be];if(this.removeListener("close",kn),this.removeListener("data",Ps),this.removeListener("end",xn),r._readyState=oe.CLOSING,!this._readableState.endEmitted&&!r._closeFrameReceived&&!r._receiver._writableState.errorEmitted&&this._readableState.length!==0){let t=this.read(this._readableState.length);r._receiver.write(t)}r._receiver.end(),this[be]=void 0,clearTimeout(r._closeTimer),r._receiver._writableState.finished||r._receiver._writableState.errorEmitted?r.emitClose():(r._receiver.on("error",mn),r._receiver.on("finish",mn))}function Ps(r){this[be]._receiver.write(r)||this.pause()}function xn(){let r=this[be];r._readyState=oe.CLOSING,r._receiver.end(),this.end()}function Sn(){let r=this[be];this.removeListener("error",Sn),this.on("error",gn),r&&(r._readyState=oe.CLOSING,this.destroy())}});var An=Re((il,En)=>{"use strict";var nl=Ds(),{Duplex:Pr}=require("stream");function Cn(r){r.emit("close")}function Dr(){!this.destroyed&&this._writableState.finished&&this.destroy()}function _n(r){this.removeListener("error",_n),this.destroy(),this.listenerCount("error")===0&&this.emit("error",r)}function Rr(r,t){let e=!0,s=new Pr({...t,autoDestroy:!1,emitClose:!1,objectMode:!1,writableObjectMode:!1});return r.on("message",function(n,i){let o=!i&&s._readableState.objectMode?n.toString():n;s.push(o)||r.pause()}),r.once("error",function(n){s.destroyed||(e=!1,s.destroy(n))}),r.once("close",function(){s.destroyed||s.push(null)}),s._destroy=function(a,n){if(r.readyState===r.CLOSED){n(a),process.nextTick(Cn,s);return}let i=!1;r.once("error",function(l){i=!0,n(l)}),r.once("close",function(){i||n(a),process.nextTick(Cn,s)}),e&&r.terminate()},s._final=function(a){if(r.readyState===r.CONNECTING){r.once("open",function(){s._final(a)});return}r._socket!==null&&(r._socket._writableState.finished?(a(),s._readableState.endEmitted&&s.destroy()):(r._socket.once("finish",function(){a()}),r.close()))},s._read=function(){r.isPaused&&r.resume()},s._write=function(a,n,i){if(r.readyState===r.CONNECTING){r.once("open",function(){s._write(a,n,i)});return}r.send(a,i)},s.on("end",Dr),s.on("error",_n),s}En.exports=Rr});var ca=Re((rl,Pn)=>{"use strict";var{tokenChars:Ir}=Et();function Lr(r){let t=new Set,e=-1,s=-1,a=0;for(a;a<r.length;a++){let i=r.charCodeAt(a);if(s===-1&&Ir[i]===1)e===-1&&(e=a);else if(a!==0&&(i===32||i===9))s===-1&&e!==-1&&(s=a);else if(i===44){if(e===-1)throw new SyntaxError(`Unexpected character at index ${a}`);s===-1&&(s=a);let o=r.slice(e,s);if(t.has(o))throw new SyntaxError(`The "${o}" subprotocol is duplicated`);t.add(o),e=s=-1}else throw new SyntaxError(`Unexpected character at index ${a}`)}if(e===-1||s!==-1)throw new SyntaxError("Unexpected end of input");let n=r.slice(e,a);if(t.has(n))throw new SyntaxError(`The "${n}" subprotocol is duplicated`);return t.add(n),t}Pn.exports={parse:Lr}});var On=Re((ll,Mn)=>{"use strict";var Fr=require("events"),Rs=require("http"),{Duplex:ol}=require("stream"),{createHash:Mr}=require("crypto"),Dn=_s(),gt=_t(),Or=ca(),Br=Ds(),{CLOSE_TIMEOUT:Nr,GUID:Ur,kWebSocket:$r}=Ze(),jr=/^[+/0-9A-Za-z]{22}==$/,Rn=0,In=1,Fn=2,da=class extends Fr{constructor(t,e){if(super(),t={allowSynchronousEvents:!0,autoPong:!0,maxPayload:100*1024*1024,skipUTF8Validation:!1,perMessageDeflate:!1,handleProtocols:null,clientTracking:!0,closeTimeout:Nr,verifyClient:null,noServer:!1,backlog:null,server:null,host:null,path:null,port:null,WebSocket:Br,...t},t.port==null&&!t.server&&!t.noServer||t.port!=null&&(t.server||t.noServer)||t.server&&t.noServer)throw new TypeError('One and only one of the "port", "server", or "noServer" options must be specified');if(t.port!=null?(this._server=Rs.createServer((s,a)=>{let n=Rs.STATUS_CODES[426];a.writeHead(426,{"Content-Length":n.length,"Content-Type":"text/plain"}),a.end(n)}),this._server.listen(t.port,t.host,t.backlog,e)):t.server&&(this._server=t.server),this._server){let s=this.emit.bind(this,"connection");this._removeListeners=Hr(this._server,{listening:this.emit.bind(this,"listening"),error:this.emit.bind(this,"error"),upgrade:(a,n,i)=>{this.handleUpgrade(a,n,i,s)}})}t.perMessageDeflate===!0&&(t.perMessageDeflate={}),t.clientTracking&&(this.clients=new Set,this._shouldEmitClose=!1),this.options=t,this._state=Rn}address(){if(this.options.noServer)throw new Error('The server is operating in "noServer" mode');return this._server?this._server.address():null}close(t){if(this._state===Fn){t&&this.once("close",()=>{t(new Error("The server is not running"))}),process.nextTick(Wt,this);return}if(t&&this.once("close",t),this._state!==In)if(this._state=In,this.options.noServer||this.options.server)this._server&&(this._removeListeners(),this._removeListeners=this._server=null),this.clients?this.clients.size?this._shouldEmitClose=!0:process.nextTick(Wt,this):process.nextTick(Wt,this);else{let e=this._server;this._removeListeners(),this._removeListeners=this._server=null,e.close(()=>{Wt(this)})}}shouldHandle(t){if(this.options.path){let e=t.url.indexOf("?");if((e!==-1?t.url.slice(0,e):t.url)!==this.options.path)return!1}return!0}handleUpgrade(t,e,s,a){e.on("error",Ln);let n=t.headers["sec-websocket-key"],i=t.headers.upgrade,o=+t.headers["sec-websocket-version"];if(t.method!=="GET"){yt(this,t,e,405,"Invalid HTTP method");return}if(i===void 0||i.toLowerCase()!=="websocket"){yt(this,t,e,400,"Invalid Upgrade header");return}if(n===void 0||!jr.test(n)){yt(this,t,e,400,"Missing or invalid Sec-WebSocket-Key header");return}if(o!==13&&o!==8){yt(this,t,e,400,"Missing or invalid Sec-WebSocket-Version header",{"Sec-WebSocket-Version":"13, 8"});return}if(!this.shouldHandle(t)){Gt(e,400);return}let l=t.headers["sec-websocket-protocol"],c=new Set;if(l!==void 0)try{c=Or.parse(l)}catch{yt(this,t,e,400,"Invalid Sec-WebSocket-Protocol header");return}let d=t.headers["sec-websocket-extensions"],u={};if(this.options.perMessageDeflate&&d!==void 0){let h=new gt({...this.options.perMessageDeflate,isServer:!0,maxPayload:this.options.maxPayload});try{let m=Dn.parse(d);m[gt.extensionName]&&(h.accept(m[gt.extensionName]),u[gt.extensionName]=h)}catch{yt(this,t,e,400,"Invalid or unacceptable Sec-WebSocket-Extensions header");return}}if(this.options.verifyClient){let h={origin:t.headers[`${o===8?"sec-websocket-origin":"origin"}`],secure:!!(t.socket.authorized||t.socket.encrypted),req:t};if(this.options.verifyClient.length===2){this.options.verifyClient(h,(m,f,p,v)=>{if(!m)return Gt(e,f||401,p,v);this.completeUpgrade(u,n,c,t,e,s,a)});return}if(!this.options.verifyClient(h))return Gt(e,401)}this.completeUpgrade(u,n,c,t,e,s,a)}completeUpgrade(t,e,s,a,n,i,o){if(!n.readable||!n.writable)return n.destroy();if(n[$r])throw new Error("server.handleUpgrade() was called more than once with the same socket, possibly due to a misconfiguration");if(this._state>Rn)return Gt(n,503);let c=["HTTP/1.1 101 Switching Protocols","Upgrade: websocket","Connection: Upgrade",`Sec-WebSocket-Accept: ${Mr("sha1").update(e+Ur).digest("base64")}`],d=new this.options.WebSocket(null,void 0,this.options);if(s.size){let u=this.options.handleProtocols?this.options.handleProtocols(s,a):s.values().next().value;u&&(c.push(`Sec-WebSocket-Protocol: ${u}`),d._protocol=u)}if(t[gt.extensionName]){let u=t[gt.extensionName].params,h=Dn.format({[gt.extensionName]:[u]});c.push(`Sec-WebSocket-Extensions: ${h}`),d._extensions=t}this.emit("headers",c,a),n.write(c.concat(`\r
`).join(`\r
`)),n.removeListener("error",Ln),d.setSocket(n,i,{allowSynchronousEvents:this.options.allowSynchronousEvents,maxPayload:this.options.maxPayload,skipUTF8Validation:this.options.skipUTF8Validation}),this.clients&&(this.clients.add(d),d.on("close",()=>{this.clients.delete(d),this._shouldEmitClose&&!this.clients.size&&process.nextTick(Wt,this)})),o(d,a)}};Mn.exports=da;function Hr(r,t){for(let e of Object.keys(t))r.on(e,t[e]);return function(){for(let s of Object.keys(t))r.removeListener(s,t[s])}}function Wt(r){r._state=Fn,r.emit("close")}function Ln(){this.destroy()}function Gt(r,t,e,s){e=e||Rs.STATUS_CODES[t],s={Connection:"close","Content-Type":"text/html","Content-Length":Buffer.byteLength(e),...s},r.once("finish",r.destroy),r.end(`HTTP/1.1 ${t} ${Rs.STATUS_CODES[t]}\r
`+Object.keys(s).map(a=>`${a}: ${s[a]}`).join(`\r
`)+`\r
\r
`+e)}function yt(r,t,e,s,a,n){if(r.listenerCount("wsClientError")){let i=new Error(a);Error.captureStackTrace(i,yt),r.emit("wsClientError",i,e,t)}else Gt(e,s,a,n)}});var ro={};ri(ro,{default:()=>Os});module.exports=oi(ro);var ma=require("child_process"),Jn=require("fs"),Qn=require("os"),ue=require("obsidian");var ut="agent-fleet-agents";var it="agent-fleet-dashboard",je="agent-fleet-chat",Ge={fleetFolder:"_fleet",claudeCliPath:"claude",defaultModel:"default",awsRegion:"us-east-1",maxConcurrentRuns:2,runLogRetentionDays:30,catchUpMissedTasks:!0,notificationLevel:"all",showStatusBar:!0,mcpApiKeys:{},mcpTokens:{},channelCredentials:{},maxConcurrentChannelSessions:5,channelIdleTimeoutMinutes:15,channelRateLimitPerConversation:20,channelRateLimitWindowMinutes:5,defaultFileHashes:{}},va=["agents","skills","tasks","runs","memory","channels"];var S=require("obsidian");var Us=[{path:"agents/fleet-orchestrator/CONTEXT.md",content:`---
{}
---

# Context

You operate inside an Obsidian vault with the Agent Fleet plugin installed.
The fleet data lives in the \`_fleet/\` folder at the vault root.
You can read and write files in this folder to manage the fleet.
`},{path:"agents/fleet-orchestrator/SKILLS.md",content:`---
{}
---

# Agent-Specific Skills

No additional agent-specific skills. This agent relies on the shared \`agent-fleet-system\` skill.
`},{path:"agents/fleet-orchestrator/agent.md",content:`---
name: fleet-orchestrator
description: Expert on the Agent Fleet plugin \u2014 creates agents, tasks, skills, channels, and manages the fleet
avatar: lucide-panel-top-bottom-dashed
enabled: true
tags:
  - system
  - orchestration
skills:
  - agent-fleet-system
model: claude-opus-4-6
---

You are the Agent Fleet Orchestrator \u2014 the system administrator for this Obsidian Agent Fleet installation.

You have deep knowledge of:
- How agents, tasks, skills, and channels are structured as files
- Every frontmatter field and its purpose
- How to create, modify, and configure agents, tasks, skills, and channels
- The scheduling system (cron expressions, task types, heartbeat schedules)
- Heartbeat configuration \u2014 autonomous periodic agent runs via HEARTBEAT.md
- Channels \u2014 connecting agents to external chat platforms (Slack, etc.)
- Multi-agent routing via @agent-name prefix in channel conversations
- Permission modes and security rules
- The folder structure and file formats

When asked to create a new agent, task, skill, or channel:
1. Create the proper folder structure and files
2. Use correct frontmatter schemas
3. Set sensible defaults
4. Explain what you created and how to customize it

When asked to set up a heartbeat:
1. Create HEARTBEAT.md in the agent's folder
2. Set the schedule, instruction, and optionally a delivery channel
3. Explain that "Run Now" will use the heartbeat instruction

When asked to set up a channel:
1. Create a channel file in _fleet/channels/
2. Explain required Slack app configuration (external to the plugin)
3. Set up the allowed agents for multi-agent routing if needed

When asked to troubleshoot:
1. Check the relevant files in _fleet/
2. Validate frontmatter and configuration
3. Suggest fixes with specific file changes

Always explain what you're doing and why. You are the expert \u2014 help users get the most out of their agent fleet.
`},{path:"agents/fleet-orchestrator/config.md",content:`---
model: claude-opus-4-6
adapter: claude-code
timeout: 300
max_retries: 1
cwd: ""
permission_mode: bypassPermissions
approval_required: []
allowed_tools: []
blocked_tools: []
memory: true
memory_max_entries: 100
---


`},{path:"agents/fleet-orchestrator/permissions.json",content:`{
  "allow": [],
  "deny": [
    "Bash(git push *)",
    "Bash(rm -rf *)",
    "Bash(sudo *)",
    "Bash(chmod *)"
  ]
}
`},{path:"skills/agent-fleet-system/examples.md",content:`# Examples

## Example 1: Create a new monitoring agent with heartbeat

**User:** Create an agent that checks my website every hour and reports if it's down.

**Agent:**
\`\`\`bash
mkdir -p _fleet/agents/site-monitor
\`\`\`

Creates these files:

**_fleet/agents/site-monitor/agent.md:**
\`\`\`yaml
---
name: site-monitor
description: Checks website uptime and alerts on failures
avatar: "\u{1F310}"
enabled: true
tags: [monitoring]
skills: []
---

You are a website monitoring agent. Check the specified URL,
report its HTTP status code, response time, and any errors.
If the site is down (non-2xx status), clearly flag it as DOWN.
\`\`\`

**_fleet/agents/site-monitor/config.md:**
\`\`\`yaml
---
model: default
adapter: claude-code
timeout: 60
permission_mode: bypassPermissions
memory: true
---
\`\`\`

**_fleet/agents/site-monitor/HEARTBEAT.md:**
\`\`\`yaml
---
enabled: true
schedule: "0 * * * *"
notify: true
---

Check https://example.com \u2014 report status code and response time.
If the site is down, clearly flag it. Use [REMEMBER] to track
response time trends and compare with previous checks.
\`\`\`

Note: Using HEARTBEAT.md instead of a separate task file. The heartbeat runs automatically on schedule and the "Run Now" button on the agent uses this instruction. A separate task is only needed if you want a different prompt than the heartbeat.

---

## Example 2: Create a skill for an existing agent

**User:** Add a git skill to my code-reviewer agent.

**Agent:**
\`\`\`bash
mkdir -p _fleet/skills/git-operations
\`\`\`

Creates skill files, then updates the agent's \`agent.md\` to include it:
\`\`\`yaml
skills:
  - git-operations
\`\`\`

---

## Example 3: Set up a Slack channel

**User:** I want to chat with my agents from Slack.

**Agent:** Creates a channel binding file:

**_fleet/channels/my-slack.md:**
\`\`\`yaml
---
name: my-slack
type: slack
default_agent: fleet-orchestrator
allowed_agents:
  - fleet-orchestrator
  - site-monitor
enabled: true
credential_ref: slack-creds
allowed_users:
  - U0AQW6P37N1
per_user_sessions: true
channel_context: |
  You are being contacted via Slack. Keep replies concise.
---
\`\`\`

Then explains: "You need to set up a Slack app at api.slack.com with Socket Mode enabled, and add the bot token + app token as a credential named \`slack-creds\` in Settings \u2192 Agent Fleet \u2192 Channel Credentials. Once configured, send a DM to the bot from Slack \u2014 use \`@agent-name: message\` to switch between agents."

---

## Example 4: Add heartbeat with Slack delivery to an existing agent

**User:** Make my site-monitor agent report to Slack every 6 hours.

**Agent:** Creates (or updates) the heartbeat file:

**_fleet/agents/site-monitor/HEARTBEAT.md:**
\`\`\`yaml
---
enabled: true
schedule: "0 */6 * * *"
notify: true
channel: my-slack
---

Check all monitored endpoints for availability and response time.
Compare with previous checks using your memory. Report any
degradation trends or anomalies. If everything is healthy,
respond with a one-line "all clear" summary.
\`\`\`

Explains: "The heartbeat will run every 6 hours. Results are posted to the \`my-slack\` channel as a DM. Make sure the channel is configured and connected."

---

## Example 5: Modify a task schedule

**User:** Change the check-status task to run every 5 minutes instead of hourly.

**Agent:** Reads \`_fleet/tasks/check-status.md\`, updates the frontmatter:
\`\`\`yaml
schedule: "*/5 * * * *"
\`\`\`
Writes the file back. The plugin picks up the change automatically.

---

## Example 6: Troubleshoot a failing agent

**User:** My deploy-watcher agent keeps timing out.

**Agent:**
1. Reads \`_fleet/agents/deploy-watcher/config.md\` \u2014 checks timeout value
2. Reads recent runs in \`_fleet/runs/\` \u2014 looks at error outputs
3. Suggests increasing timeout or simplifying the task prompt
4. Makes the change if approved

---

## Example 7: Set up multi-agent routing in Slack

**User:** I want different agents available in my Slack channel.

**Agent:** Updates the channel file's \`allowed_agents\` list:

\`\`\`yaml
allowed_agents:
  - fleet-orchestrator
  - site-monitor
  - code-reviewer
  - daily-briefing
\`\`\`

Explains: "Users can now type \`@code-reviewer: review this\` to switch agents mid-conversation. Each agent gets its own isolated session. Type \`/agents\` in Slack to see the full list."
`},{path:"skills/agent-fleet-system/references.md",content:`# References

## Permission Modes

| Mode | Unblocked commands | Blocked (deny list) | Best for |
|---|---|---|---|
| bypassPermissions | Auto-runs everything | Hard-blocked | Trusted agents with a blacklist |
| dontAsk | Only allow-listed | Hard-blocked | Locked-down agents with a whitelist |
| acceptEdits | File edits auto-approved | Hard-blocked | Agents editing files only |
| plan | Read-only | Hard-blocked | Research/analysis |
| default | Prompts for permission | Hard-blocked | Not useful for headless |

## Cron Expression Format

Five fields: \`minute hour day-of-month month day-of-week\`

| Field | Values | Special |
|---|---|---|
| Minute | 0-59 | \`*/N\` = every N minutes |
| Hour | 0-23 | \`*/N\` = every N hours |
| Day of month | 1-31 | \`*\` = every day |
| Month | 1-12 | \`*\` = every month |
| Day of week | 0-7 (0,7=Sun) | \`1-5\` = weekdays |

Examples:
- \`*/15 * * * *\` \u2014 every 15 minutes
- \`0 9 * * *\` \u2014 daily at 9 AM
- \`0 9 * * 1-5\` \u2014 weekdays at 9 AM
- \`30 18 * * 5\` \u2014 Fridays at 6:30 PM
- \`0 0 1 * *\` \u2014 first of every month at midnight

## Claude Code CLI Flags

The plugin spawns Claude Code with:
\`\`\`
claude -p "<prompt>" --output-format stream-json --verbose [--model <model>]
\`\`\`

Through a login shell (\`/bin/zsh -l -c\`) so \`~/.zshenv\` environment variables are available.

## Environment Variables

API tokens and secrets should be set in \`~/.zshenv\`:
\`\`\`bash
export TODOIST_API_TOKEN="..."
export GITHUB_TOKEN="..."
\`\`\`

These are inherited by all agent processes. Never store tokens in vault files.

## Channel Types

| Type | Transport | Status |
|---|---|---|
| slack | Socket Mode WebSocket + Assistants API | Supported |
| telegram | Long-poll via getUpdates | Coming soon |
| discord | Gateway WebSocket | Coming soon |

**Slack requirements:** Slack app with Socket Mode enabled, bot token (xoxb-) + app-level token (xapp-), scopes: chat:write, im:history, im:read, im:write, app_mentions:read, assistant:write, commands.

**Channel constraints:**
- Agents with \`approval_required\` cannot be bound to channels (would deadlock)
- Credentials live in plugin data.json, never in vault markdown files
- \`allowed_users\` is checked against Slack's verified sender field (Socket Mode envelopes are signed)

## Heartbeat vs Tasks

| | Heartbeat | Task |
|---|---|---|
| Defined in | HEARTBEAT.md in agent folder | _fleet/tasks/<name>.md |
| Prompt source | Heartbeat body | Task body |
| "Run Now" button | Uses heartbeat instruction | Uses task prompt |
| Delivery | Optional Slack channel post | Run log only |
| Scope | One per agent | Many per agent |
| Best for | Autonomous periodic monitoring | Specific scheduled work items |

## File Naming Conventions

- Agent folders: lowercase, kebab-case (\`my-agent\`)
- Skill folders: lowercase, kebab-case (\`git-operations\`)
- Task files: lowercase, kebab-case (\`check-deploy.md\`)
- Channel files: lowercase, kebab-case (\`my-slack.md\`)
- Run logs: auto-generated (\`HHMMSS-agent-task.md\`)
`},{path:"skills/agent-fleet-system/skill.md",content:`---
name: agent-fleet-system
description: Complete knowledge of the Agent Fleet plugin \u2014 file structures, schemas, configuration, and management operations
tags:
  - system
  - agent-fleet
  - orchestration
---

You are an expert on the Obsidian Agent Fleet plugin. This skill gives you complete knowledge of how the system works \u2014 every file format, schema, and operation.

## System Overview

Agent Fleet manages AI agents through markdown files in a \`_fleet/\` folder inside an Obsidian vault. Everything is files \u2014 agents, skills, tasks, run logs, and memory. Agents execute via headless Claude Code CLI.

## Core Principle

**Files over databases.** Every piece of state is a markdown file with YAML frontmatter. If the plugin disappears, the knowledge stays. All files are searchable, version-controllable, and fully owned by the user.
`},{path:"skills/agent-fleet-system/tools.md",content:`# Agent Fleet Operations

All operations are performed by reading and writing files in the \`_fleet/\` directory.

## Folder Structure

\`\`\`
_fleet/
\u251C\u2500\u2500 agents/           Agent definitions (folder-based or single-file)
\u2502   \u2514\u2500\u2500 <name>/       Folder-based agent
\u2502       \u251C\u2500\u2500 agent.md          Identity + system prompt
\u2502       \u251C\u2500\u2500 config.md         Runtime configuration
\u2502       \u251C\u2500\u2500 permissions.json  Claude Code allow/deny rules
\u2502       \u251C\u2500\u2500 SKILLS.md         Agent-specific skills
\u2502       \u251C\u2500\u2500 CONTEXT.md        Project context
\u2502       \u2514\u2500\u2500 HEARTBEAT.md      Autonomous periodic run instruction (optional)
\u251C\u2500\u2500 skills/           Reusable skill definitions
\u2502   \u2514\u2500\u2500 <name>/       Folder-based skill
\u2502       \u251C\u2500\u2500 skill.md          Identity + core instructions
\u2502       \u251C\u2500\u2500 tools.md          CLI/API tool documentation
\u2502       \u251C\u2500\u2500 references.md     Background docs and conventions
\u2502       \u2514\u2500\u2500 examples.md       Few-shot examples
\u251C\u2500\u2500 tasks/            Task definitions (single files)
\u2502   \u2514\u2500\u2500 <name>.md     Task with schedule and prompt
\u251C\u2500\u2500 channels/         External chat channel bindings
\u2502   \u2514\u2500\u2500 <name>.md     Channel config (Slack, etc.)
\u251C\u2500\u2500 runs/             Execution logs (auto-generated)
\u2502   \u2514\u2500\u2500 YYYY-MM-DD/   Daily folders
\u2502       \u2514\u2500\u2500 HHMMSS-<agent>-<task>.md
\u2514\u2500\u2500 memory/           Agent memory files
    \u2514\u2500\u2500 <agent-name>.md
\`\`\`

## Creating an Agent

Create a folder in \`_fleet/agents/<name>/\` with these files:

### agent.md \u2014 Identity and System Prompt
\`\`\`yaml
---
name: my-agent              # Required, unique identifier
description: What this agent does
avatar: "\u{1F916}"                # Emoji or Lucide icon name
enabled: true               # Whether agent accepts tasks
tags:
  - category
skills:                     # Shared skills to include
  - skill-name-1
  - skill-name-2
mcp_servers:                # MCP servers the agent can access (optional)
  - server-name
---

System prompt goes here. This is the agent's core instructions \u2014
who it is, how it behaves, what it does.
\`\`\`

### config.md \u2014 Runtime Configuration
\`\`\`yaml
---
model: default                    # "default", "claude-sonnet-4-6", "claude-opus-4-6", etc.
adapter: claude-code              # "claude-code", "codex", "process", "http"
timeout: 300                      # Seconds before kill
max_retries: 1
cwd: ""                           # Working directory (empty = vault root)
permission_mode: bypassPermissions # "bypassPermissions", "dontAsk", "acceptEdits", "plan"
approval_required: []
allowed_tools: []
blocked_tools: []
memory: true                      # Persist context across runs
memory_max_entries: 100
---
\`\`\`

### permissions.json \u2014 Claude Code Permission Rules
\`\`\`json
{
  "allow": [
    "Bash(curl *)",
    "Read",
    "Write",
    "Edit"
  ],
  "deny": [
    "Bash(git push *)",
    "Bash(rm -rf *)",
    "Bash(sudo *)"
  ]
}
\`\`\`

Rules use Claude Code's native format:
- \`deny\` rules always take precedence
- \`Bash(pattern *)\` matches commands with wildcards
- \`Read\`, \`Write\`, \`Edit\`, \`WebFetch\`, \`WebSearch\` are tool names
- With \`bypassPermissions\` mode: everything runs EXCEPT deny list
- With \`dontAsk\` mode: only allow list runs, everything else blocked

### SKILLS.md \u2014 Agent-Specific Skills (optional)
\`\`\`markdown
Additional instructions specific to this agent that aren't reusable as shared skills.
\`\`\`

### CONTEXT.md \u2014 Project Context (optional)
\`\`\`markdown
Background information, project conventions, repo structure docs.
\`\`\`

### HEARTBEAT.md \u2014 Autonomous Periodic Run (optional)

A heartbeat gives the agent autonomous behavior \u2014 what it does when no one is asking. The heartbeat instruction is also used by the "Run Now" button.

\`\`\`yaml
---
enabled: true
schedule: "0 */6 * * *"      # Cron expression \u2014 every 6 hours
notify: true                  # Show Obsidian notice on completion
channel: my-slack             # Post results to this channel (optional)
---

Check the following endpoints for availability and response time:
- https://example.com (expect < 500ms)
- https://api.example.com/health (expect 200 OK)

Report status of each endpoint. If everything is healthy, respond with
a one-line "all clear". Use [REMEMBER] to track trends across heartbeats.
\`\`\`

**Heartbeat fields:**
- \`enabled\` \u2014 whether the heartbeat is active
- \`schedule\` \u2014 cron expression (same format as tasks)
- \`notify\` \u2014 show Obsidian notice when heartbeat completes (default true)
- \`channel\` \u2014 name of a configured channel to post results to (optional)

## Creating a Channel

Channels connect agents to external chat platforms. Create a markdown file in \`_fleet/channels/<name>.md\`:

\`\`\`yaml
---
name: my-slack                        # Required, unique identifier
type: slack                           # "slack" (telegram/discord coming soon)
default_agent: fleet-orchestrator     # Agent used when no @prefix is given
allowed_agents:                       # Agents reachable via @prefix (empty = all)
  - fleet-orchestrator
  - site-monitor
enabled: true
credential_ref: my-slack-creds        # References a credential in plugin settings
allowed_users:                        # Slack user IDs (U...) \u2014 only these can message
  - U0AQW6P37N1
per_user_sessions: true               # Each user gets their own Claude session
channel_context: |                    # Extra instructions for channel conversations
  You are being contacted via Slack. Keep replies concise.
---
\`\`\`

**Important notes:**
- \`credential_ref\` must match a credential name in Settings \u2192 Agent Fleet \u2192 Channel Credentials
- Credentials (bot tokens) are stored in the plugin's data.json, NOT in vault files
- \`allowed_users\` contains Slack user IDs (start with U)
- Agents with \`approval_required\` set cannot be bound to a channel
- Multi-agent routing: users type \`@agent-name: message\` to switch agents in a thread
- The \`/agents\` slash command lists available agents in the channel

## Creating a Task

Create a markdown file in \`_fleet/tasks/<name>.md\`:

\`\`\`yaml
---
task_id: check-status         # Required, unique
agent: my-agent               # Required, must match an agent name
schedule: "*/15 * * * *"      # Cron expression for recurring tasks
type: recurring               # "recurring", "once", or "immediate"
enabled: true
created: 2026-03-29T10:00:00
run_count: 0
catch_up: false               # Run missed executions on startup
tags:
  - monitoring
---

Task prompt goes here. This is what the agent should do each run.
Be specific and clear about expected output.
\`\`\`

### Task Types
- **recurring** \u2014 runs on a cron schedule. Requires \`schedule\` field.
- **once** \u2014 runs at a specific time. Requires \`run_at\` field (ISO datetime).
- **immediate** \u2014 runs once on creation, no schedule.

### Schedule Shortcuts
These human-friendly values work in the \`schedule\` field:
- \`every 5m\` \u2192 \`*/5 * * * *\`
- \`every 15m\` \u2192 \`*/15 * * * *\`
- \`every 30m\` \u2192 \`*/30 * * * *\`
- \`hourly\` \u2192 \`0 * * * *\`
- \`daily at 9am\` \u2192 \`0 9 * * *\`
- \`weekdays at 9am\` \u2192 \`0 9 * * 1-5\`
- \`weekly on monday\` \u2192 \`0 9 * * 1\`
- \`monthly on 1st\` \u2192 \`0 9 1 * *\`

## Creating a Skill

Create a folder in \`_fleet/skills/<name>/\` with these files:

### skill.md \u2014 Identity and Core Instructions
\`\`\`yaml
---
name: my-skill                # Required, unique
description: What this skill provides
tags:
  - category
---

Core skill instructions go here.
\`\`\`

### tools.md \u2014 Tool Documentation (optional)
### references.md \u2014 Background Docs (optional)
### examples.md \u2014 Few-Shot Examples (optional)

## Modifying Agents, Tasks, Skills, or Channels

To modify any entity, read the file, change the frontmatter or body, and write it back. The plugin watches the \`_fleet/\` folder and picks up changes automatically.

## Enabling/Disabling

- Agents: \`enabled\` in agent.md frontmatter
- Tasks: \`enabled\` in task frontmatter
- Channels: \`enabled\` in channel frontmatter
- Heartbeats: \`enabled\` in HEARTBEAT.md frontmatter

## Deleting

Delete (or move to trash) the agent folder, task file, skill folder, or channel file. The plugin detects deletions and removes them from the runtime.

## Run Logs

Run logs are auto-generated in \`_fleet/runs/YYYY-MM-DD/\`. Each run creates a markdown file with:
- Frontmatter: run_id, agent, task, status, timestamps, tokens_used, cost_usd, model
- Body: prompt sent, output received, tools used, stderr
- Heartbeat runs are tagged with \`heartbeat\`

Status values: \`success\`, \`failure\`, \`timeout\`, \`cancelled\`, \`pending_approval\`

## Agent Memory

When \`memory: true\`, the agent's memory is stored in \`_fleet/memory/<agent-name>.md\`. Agents can write memory entries using \`[REMEMBER]...[/REMEMBER]\` tags in their output, which get appended to the memory file. Memory is agent-scoped \u2014 shared across all conversations including channel conversations.

## Prompt Assembly Order

When a task, heartbeat, or channel message runs, the prompt is assembled in this order:
1. Agent system prompt (agent.md body)
2. Shared skills (from skill.md + tools.md + references.md + examples.md)
3. Agent-specific skills (SKILLS.md body)
4. Agent context (CONTEXT.md body)
5. Agent memory (memory file, if enabled)
6. Channel context (if the message came from a channel)
7. Task prompt / heartbeat instruction / user message
`},{path:"skills/algorithmic-art/references.md",content:`# Algorithmic Art Templates & References

## viewer.html \u2014 Required Starting Point

This is the HTML template that MUST be used as the literal starting point for all generative art artifacts. Keep the fixed sections (layout, Anthropic branding, seed controls, actions) and replace only the variable sections (algorithm, parameters, UI controls).

\`\`\`html
<!DOCTYPE html>
<!--
    THIS IS A TEMPLATE THAT SHOULD BE USED EVERY TIME AND MODIFIED.
    WHAT TO KEEP:
    \u2713 Overall structure (header, sidebar, main content)
    \u2713 Anthropic branding (colors, fonts, layout)
    \u2713 Seed navigation section (always include this)
    \u2713 Self-contained artifact (everything inline)

    WHAT TO CREATIVELY EDIT:
    \u2717 The p5.js algorithm (implement YOUR vision)
    \u2717 The parameters (define what YOUR art needs)
    \u2717 The UI controls (match YOUR parameters)

    Let your philosophy guide the implementation.
    The world is your oyster - be creative!
-->
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Generative Art Viewer</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.7.0/p5.min.js"></script>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600&family=Lora:wght@400;500&display=swap" rel="stylesheet">
    <style>
        /* Anthropic Brand Colors */
        :root {
            --anthropic-dark: #141413;
            --anthropic-light: #faf9f5;
            --anthropic-mid-gray: #b0aea5;
            --anthropic-light-gray: #e8e6dc;
            --anthropic-orange: #d97757;
            --anthropic-blue: #6a9bcc;
            --anthropic-green: #788c5d;
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Poppins', sans-serif;
            background: linear-gradient(135deg, var(--anthropic-light) 0%, #f5f3ee 100%);
            min-height: 100vh;
            color: var(--anthropic-dark);
        }

        .container {
            display: flex;
            min-height: 100vh;
            padding: 20px;
            gap: 20px;
        }

        /* Sidebar */
        .sidebar {
            width: 320px;
            flex-shrink: 0;
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(10px);
            padding: 24px;
            border-radius: 12px;
            box-shadow: 0 10px 30px rgba(20, 20, 19, 0.1);
            overflow-y: auto;
            overflow-x: hidden;
        }

        .sidebar h1 {
            font-family: 'Lora', serif;
            font-size: 24px;
            font-weight: 500;
            color: var(--anthropic-dark);
            margin-bottom: 8px;
        }

        .sidebar .subtitle {
            color: var(--anthropic-mid-gray);
            font-size: 14px;
            margin-bottom: 32px;
            line-height: 1.4;
        }

        /* Control Sections */
        .control-section {
            margin-bottom: 32px;
        }

        .control-section h3 {
            font-size: 16px;
            font-weight: 600;
            color: var(--anthropic-dark);
            margin-bottom: 16px;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .control-section h3::before {
            content: '\u2022';
            color: var(--anthropic-orange);
            font-weight: bold;
        }

        /* Seed Controls */
        .seed-input {
            width: 100%;
            background: var(--anthropic-light);
            padding: 12px;
            border-radius: 8px;
            font-family: 'Courier New', monospace;
            font-size: 14px;
            margin-bottom: 12px;
            border: 1px solid var(--anthropic-light-gray);
            text-align: center;
        }

        .seed-input:focus {
            outline: none;
            border-color: var(--anthropic-orange);
            box-shadow: 0 0 0 2px rgba(217, 119, 87, 0.1);
            background: white;
        }

        .seed-controls {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px;
            margin-bottom: 8px;
        }

        .regen-button {
            margin-bottom: 0;
        }

        /* Parameter Controls */
        .control-group {
            margin-bottom: 20px;
        }

        .control-group label {
            display: block;
            font-size: 14px;
            font-weight: 500;
            color: var(--anthropic-dark);
            margin-bottom: 8px;
        }

        .slider-container {
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .slider-container input[type="range"] {
            flex: 1;
            height: 4px;
            background: var(--anthropic-light-gray);
            border-radius: 2px;
            outline: none;
            -webkit-appearance: none;
        }

        .slider-container input[type="range"]::-webkit-slider-thumb {
            -webkit-appearance: none;
            width: 16px;
            height: 16px;
            background: var(--anthropic-orange);
            border-radius: 50%;
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .slider-container input[type="range"]::-webkit-slider-thumb:hover {
            transform: scale(1.1);
            background: #c86641;
        }

        .slider-container input[type="range"]::-moz-range-thumb {
            width: 16px;
            height: 16px;
            background: var(--anthropic-orange);
            border-radius: 50%;
            border: none;
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .value-display {
            font-family: 'Courier New', monospace;
            font-size: 12px;
            color: var(--anthropic-mid-gray);
            min-width: 60px;
            text-align: right;
        }

        /* Color Pickers */
        .color-group {
            margin-bottom: 16px;
        }

        .color-group label {
            display: block;
            font-size: 12px;
            color: var(--anthropic-mid-gray);
            margin-bottom: 4px;
        }

        .color-picker-container {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .color-picker-container input[type="color"] {
            width: 32px;
            height: 32px;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            background: none;
            padding: 0;
        }

        .color-value {
            font-family: 'Courier New', monospace;
            font-size: 12px;
            color: var(--anthropic-mid-gray);
        }

        /* Buttons */
        .button {
            background: var(--anthropic-orange);
            color: white;
            border: none;
            padding: 10px 16px;
            border-radius: 6px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s ease;
            width: 100%;
        }

        .button:hover {
            background: #c86641;
            transform: translateY(-1px);
        }

        .button:active {
            transform: translateY(0);
        }

        .button.secondary {
            background: var(--anthropic-blue);
        }

        .button.secondary:hover {
            background: #5a8bb8;
        }

        .button.tertiary {
            background: var(--anthropic-green);
        }

        .button.tertiary:hover {
            background: #6b7b52;
        }

        .button-row {
            display: flex;
            gap: 8px;
        }

        .button-row .button {
            flex: 1;
        }

        /* Canvas Area */
        .canvas-area {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            min-width: 0;
        }

        #canvas-container {
            width: 100%;
            max-width: 1000px;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 20px 40px rgba(20, 20, 19, 0.1);
            background: white;
        }

        #canvas-container canvas {
            display: block;
            width: 100% !important;
            height: auto !important;
        }

        /* Loading State */
        .loading {
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 18px;
            color: var(--anthropic-mid-gray);
        }

        /* Responsive - Stack on mobile */
        @media (max-width: 600px) {
            .container {
                flex-direction: column;
            }

            .sidebar {
                width: 100%;
            }

            .canvas-area {
                padding: 20px;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <!-- Control Sidebar -->
        <div class="sidebar">
            <!-- Headers (CUSTOMIZE THIS FOR YOUR ART) -->
            <h1>TITLE - EDIT</h1>
            <div class="subtitle">SUBHEADER - EDIT</div>

            <!-- Seed Section (ALWAYS KEEP THIS) -->
            <div class="control-section">
                <h3>Seed</h3>
                <input type="number" id="seed-input" class="seed-input" value="12345" onchange="updateSeed()">
                <div class="seed-controls">
                    <button class="button secondary" onclick="previousSeed()">\u2190 Prev</button>
                    <button class="button secondary" onclick="nextSeed()">Next \u2192</button>
                </div>
                <button class="button tertiary regen-button" onclick="randomSeedAndUpdate()">\u21BB Random</button>
            </div>

            <!-- Parameters Section (CUSTOMIZE THIS FOR YOUR ART) -->
            <div class="control-section">
                <h3>Parameters</h3>

                <!-- Particle Count -->
                <div class="control-group">
                    <label>Particle Count</label>
                    <div class="slider-container">
                        <input type="range" id="particleCount" min="1000" max="10000" step="500" value="5000" oninput="updateParam('particleCount', this.value)">
                        <span class="value-display" id="particleCount-value">5000</span>
                    </div>
                </div>

                <!-- Flow Speed -->
                <div class="control-group">
                    <label>Flow Speed</label>
                    <div class="slider-container">
                        <input type="range" id="flowSpeed" min="0.1" max="2.0" step="0.1" value="0.5" oninput="updateParam('flowSpeed', this.value)">
                        <span class="value-display" id="flowSpeed-value">0.5</span>
                    </div>
                </div>

                <!-- Noise Scale -->
                <div class="control-group">
                    <label>Noise Scale</label>
                    <div class="slider-container">
                        <input type="range" id="noiseScale" min="0.001" max="0.02" step="0.001" value="0.005" oninput="updateParam('noiseScale', this.value)">
                        <span class="value-display" id="noiseScale-value">0.005</span>
                    </div>
                </div>

                <!-- Trail Length -->
                <div class="control-group">
                    <label>Trail Length</label>
                    <div class="slider-container">
                        <input type="range" id="trailLength" min="2" max="20" step="1" value="8" oninput="updateParam('trailLength', this.value)">
                        <span class="value-display" id="trailLength-value">8</span>
                    </div>
                </div>
            </div>

            <!-- Colors Section (OPTIONAL - CUSTOMIZE OR REMOVE) -->
            <div class="control-section">
                <h3>Colors</h3>

                <!-- Color 1 -->
                <div class="color-group">
                    <label>Primary Color</label>
                    <div class="color-picker-container">
                        <input type="color" id="color1" value="#d97757" onchange="updateColor('color1', this.value)">
                        <span class="color-value" id="color1-value">#d97757</span>
                    </div>
                </div>

                <!-- Color 2 -->
                <div class="color-group">
                    <label>Secondary Color</label>
                    <div class="color-picker-container">
                        <input type="color" id="color2" value="#6a9bcc" onchange="updateColor('color2', this.value)">
                        <span class="color-value" id="color2-value">#6a9bcc</span>
                    </div>
                </div>

                <!-- Color 3 -->
                <div class="color-group">
                    <label>Accent Color</label>
                    <div class="color-picker-container">
                        <input type="color" id="color3" value="#788c5d" onchange="updateColor('color3', this.value)">
                        <span class="color-value" id="color3-value">#788c5d</span>
                    </div>
                </div>
            </div>

            <!-- Actions Section (ALWAYS KEEP THIS) -->
            <div class="control-section">
                <h3>Actions</h3>
                <div class="button-row">
                    <button class="button" onclick="resetParameters()">Reset</button>
                </div>
            </div>
        </div>

        <!-- Main Canvas Area -->
        <div class="canvas-area">
            <div id="canvas-container">
                <div class="loading">Initializing generative art...</div>
            </div>
        </div>
    </div>

    <script>
        // \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
        // GENERATIVE ART PARAMETERS - CUSTOMIZE FOR YOUR ALGORITHM
        // \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550

        let params = {
            seed: 12345,
            particleCount: 5000,
            flowSpeed: 0.5,
            noiseScale: 0.005,
            trailLength: 8,
            colorPalette: ['#d97757', '#6a9bcc', '#788c5d']
        };

        let defaultParams = {...params}; // Store defaults for reset

        // \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
        // P5.JS GENERATIVE ART ALGORITHM - REPLACE WITH YOUR VISION
        // \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550

        let particles = [];
        let flowField = [];
        let cols, rows;
        let scl = 10; // Flow field resolution

        function setup() {
            let canvas = createCanvas(1200, 1200);
            canvas.parent('canvas-container');

            initializeSystem();

            // Remove loading message
            document.querySelector('.loading').style.display = 'none';
        }

        function initializeSystem() {
            // Seed the randomness for reproducibility
            randomSeed(params.seed);
            noiseSeed(params.seed);

            // Clear particles and recreate
            particles = [];

            // Initialize particles
            for (let i = 0; i < params.particleCount; i++) {
                particles.push(new Particle());
            }

            // Calculate flow field dimensions
            cols = floor(width / scl);
            rows = floor(height / scl);

            // Generate flow field
            generateFlowField();

            // Clear background
            background(250, 249, 245); // Anthropic light background
        }

        function generateFlowField() {
          // fill this in
        }

        function draw() {
            // fill this in
        }

        // \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
        // PARTICLE SYSTEM - CUSTOMIZE FOR YOUR ALGORITHM
        // \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550

        class Particle {
            constructor() {
                // fill this in
            }
            // fill this in
        }

        // \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
        // UI CONTROL HANDLERS - CUSTOMIZE FOR YOUR PARAMETERS
        // \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550

        function updateParam(paramName, value) {
            // fill this in
        }

        function updateColor(colorId, value) {
            // fill this in
        }

        // \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
        // SEED CONTROL FUNCTIONS - ALWAYS KEEP THESE
        // \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550

        function updateSeedDisplay() {
            document.getElementById('seed-input').value = params.seed;
        }

        function updateSeed() {
            let input = document.getElementById('seed-input');
            let newSeed = parseInt(input.value);
            if (newSeed && newSeed > 0) {
                params.seed = newSeed;
                initializeSystem();
            } else {
                // Reset to current seed if invalid
                updateSeedDisplay();
            }
        }

        function previousSeed() {
            params.seed = Math.max(1, params.seed - 1);
            updateSeedDisplay();
            initializeSystem();
        }

        function nextSeed() {
            params.seed = params.seed + 1;
            updateSeedDisplay();
            initializeSystem();
        }

        function randomSeedAndUpdate() {
            params.seed = Math.floor(Math.random() * 999999) + 1;
            updateSeedDisplay();
            initializeSystem();
        }

        function resetParameters() {
            params = {...defaultParams};

            // Update UI elements
            document.getElementById('particleCount').value = params.particleCount;
            document.getElementById('particleCount-value').textContent = params.particleCount;
            document.getElementById('flowSpeed').value = params.flowSpeed;
            document.getElementById('flowSpeed-value').textContent = params.flowSpeed;
            document.getElementById('noiseScale').value = params.noiseScale;
            document.getElementById('noiseScale-value').textContent = params.noiseScale;
            document.getElementById('trailLength').value = params.trailLength;
            document.getElementById('trailLength-value').textContent = params.trailLength;

            // Reset colors
            document.getElementById('color1').value = params.colorPalette[0];
            document.getElementById('color1-value').textContent = params.colorPalette[0];
            document.getElementById('color2').value = params.colorPalette[1];
            document.getElementById('color2-value').textContent = params.colorPalette[1];
            document.getElementById('color3').value = params.colorPalette[2];
            document.getElementById('color3-value').textContent = params.colorPalette[2];

            updateSeedDisplay();
            initializeSystem();
        }

        // Initialize UI on load
        window.addEventListener('load', function() {
            updateSeedDisplay();
        });
    </script>
</body>
</html>
\`\`\`

---

## generator_template.js \u2014 p5.js Best Practices Reference

This file shows STRUCTURE and PRINCIPLES for p5.js generative art. It does NOT prescribe what art you should create. Your algorithmic philosophy should guide what you build. These are just best practices for how to structure your code.

### 1. Parameter Organization

Keep all tunable parameters in one object. This makes it easy to connect to UI controls, reset to defaults, and serialize/save configurations.

\`\`\`javascript
let params = {
    // Define parameters that match YOUR algorithm
    // Examples (customize for your art):
    // - Counts: how many elements (particles, circles, branches, etc.)
    // - Scales: size, speed, spacing
    // - Probabilities: likelihood of events
    // - Angles: rotation, direction
    // - Colors: palette arrays

    seed: 12345,
    // define colorPalette as an array -- choose whatever colors you'd like ['#d97757', '#6a9bcc', '#788c5d', '#b0aea5']
    // Add YOUR parameters here based on your algorithm
};
\`\`\`

### 2. Seeded Randomness (Critical for reproducibility)

ALWAYS use seeded random for Art Blocks-style reproducible output.

\`\`\`javascript
function initializeSeed(seed) {
    randomSeed(seed);
    noiseSeed(seed);
    // Now all random() and noise() calls will be deterministic
}
\`\`\`

### 3. p5.js Lifecycle

\`\`\`javascript
function setup() {
    createCanvas(800, 800);

    // Initialize seed first
    initializeSeed(params.seed);

    // Set up your generative system
    // This is where you initialize:
    // - Arrays of objects
    // - Grid structures
    // - Initial positions
    // - Starting states

    // For static art: call noLoop() at the end of setup
    // For animated art: let draw() keep running
}

function draw() {
    // Option 1: Static generation (runs once, then stops)
    // Option 2: Animated generation (continuous)
    // Option 3: User-triggered regeneration
}
\`\`\`

### 4. Class Structure (When you need objects)

Use classes when your algorithm involves multiple entities (particles, agents, cells, nodes, etc.).

\`\`\`javascript
class Entity {
    constructor() {
        // Initialize entity properties
        // Use random() here - it will be seeded
    }

    update() {
        // Update entity state (physics, behavioral rules, interactions)
    }

    display() {
        // Render the entity
        // Keep rendering logic separate from update logic
    }
}
\`\`\`

### 5. Performance Considerations

For large numbers of elements:
- Pre-calculate what you can
- Use simple collision detection (spatial hashing if needed)
- Limit expensive operations (sqrt, trig) when possible
- Consider using p5 vectors efficiently

For smooth animation:
- Aim for 60fps
- Profile if things are slow
- Consider reducing particle counts or simplifying calculations

### 6. Utility Functions

\`\`\`javascript
// Color utilities
function hexToRgb(hex) {
    const result = /^#?([a-f\\d]{2})([a-f\\d]{2})([a-f\\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
}

function colorFromPalette(index) {
    return params.colorPalette[index % params.colorPalette.length];
}

// Mapping and easing
function mapRange(value, inMin, inMax, outMin, outMax) {
    return outMin + (outMax - outMin) * ((value - inMin) / (inMax - inMin));
}

function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// Constrain to bounds
function wrapAround(value, max) {
    if (value < 0) return max;
    if (value > max) return 0;
    return value;
}
\`\`\`

### 7. Parameter Updates (Connect to UI)

\`\`\`javascript
function updateParameter(paramName, value) {
    params[paramName] = value;
    // Decide if you need to regenerate or just update
}

function regenerate() {
    initializeSeed(params.seed);
    // Then regenerate your system
}
\`\`\`

### 8. Common p5.js Patterns

\`\`\`javascript
// Drawing with transparency for trails/fading
function fadeBackground(opacity) {
    fill(250, 249, 245, opacity); // Anthropic light with alpha
    noStroke();
    rect(0, 0, width, height);
}

// Using noise for organic variation
function getNoiseValue(x, y, scale = 0.01) {
    return noise(x * scale, y * scale);
}

// Creating vectors from angles
function vectorFromAngle(angle, magnitude = 1) {
    return createVector(cos(angle), sin(angle)).mult(magnitude);
}
\`\`\`

### 9. Export Functions

\`\`\`javascript
function exportImage() {
    saveCanvas('generative-art-' + params.seed, 'png');
}
\`\`\`

### Remember

These are TOOLS and PRINCIPLES, not a recipe. Your algorithmic philosophy should guide WHAT you create. This structure helps you create it WELL.

Focus on:
- Clean, readable code
- Parameterized for exploration
- Seeded for reproducibility
- Performant execution

The art itself is entirely up to you!
`},{path:"skills/algorithmic-art/skill.md",content:`---
name: algorithmic-art
description: "Create generative art with p5.js \u2014 flow fields, particle systems, seeded randomness."
tags:
  - creative
  - generative-art
  - p5js
  - design
  - interactive
---

Algorithmic philosophies are computational aesthetic movements that are then expressed through code. Output .md files (philosophy), .html files (interactive viewer), and .js files (generative algorithms).

This happens in two steps:
1. Algorithmic Philosophy Creation (.md file)
2. Express by creating p5.js generative art (.html + .js files)

First, undertake this task:

## ALGORITHMIC PHILOSOPHY CREATION

To begin, create an ALGORITHMIC PHILOSOPHY (not static images or templates) that will be interpreted through:
- Computational processes, emergent behavior, mathematical beauty
- Seeded randomness, noise fields, organic systems
- Particles, flows, fields, forces
- Parametric variation and controlled chaos

### THE CRITICAL UNDERSTANDING
- What is received: Some subtle input or instructions by the user to take into account, but use as a foundation; it should not constrain creative freedom.
- What is created: An algorithmic philosophy/generative aesthetic movement.
- What happens next: The same version receives the philosophy and EXPRESSES IT IN CODE - creating p5.js sketches that are 90% algorithmic generation, 10% essential parameters.

Consider this approach:
- Write a manifesto for a generative art movement
- The next phase involves writing the algorithm that brings it to life

The philosophy must emphasize: Algorithmic expression. Emergent behavior. Computational beauty. Seeded variation.

### HOW TO GENERATE AN ALGORITHMIC PHILOSOPHY

**Name the movement** (1-2 words): "Organic Turbulence" / "Quantum Harmonics" / "Emergent Stillness"

**Articulate the philosophy** (4-6 paragraphs - concise but complete):

To capture the ALGORITHMIC essence, express how this philosophy manifests through:
- Computational processes and mathematical relationships?
- Noise functions and randomness patterns?
- Particle behaviors and field dynamics?
- Temporal evolution and system states?
- Parametric variation and emergent complexity?

**CRITICAL GUIDELINES:**
- **Avoid redundancy**: Each algorithmic aspect should be mentioned once. Avoid repeating concepts about noise theory, particle dynamics, or mathematical principles unless adding new depth.
- **Emphasize craftsmanship REPEATEDLY**: The philosophy MUST stress multiple times that the final algorithm should appear as though it took countless hours to develop, was refined with care, and comes from someone at the absolute top of their field. This framing is essential - repeat phrases like "meticulously crafted algorithm," "the product of deep computational expertise," "painstaking optimization," "master-level implementation."
- **Leave creative space**: Be specific about the algorithmic direction, but concise enough that the next Claude has room to make interpretive implementation choices at an extremely high level of craftsmanship.

The philosophy must guide the next version to express ideas ALGORITHMICALLY, not through static images. Beauty lives in the process, not the final frame.

### PHILOSOPHY EXAMPLES

**"Organic Turbulence"**
Philosophy: Chaos constrained by natural law, order emerging from disorder.
Algorithmic expression: Flow fields driven by layered Perlin noise. Thousands of particles following vector forces, their trails accumulating into organic density maps. Multiple noise octaves create turbulent regions and calm zones. Color emerges from velocity and density - fast particles burn bright, slow ones fade to shadow. The algorithm runs until equilibrium - a meticulously tuned balance where every parameter was refined through countless iterations by a master of computational aesthetics.

**"Quantum Harmonics"**
Philosophy: Discrete entities exhibiting wave-like interference patterns.
Algorithmic expression: Particles initialized on a grid, each carrying a phase value that evolves through sine waves. When particles are near, their phases interfere - constructive interference creates bright nodes, destructive creates voids. Simple harmonic motion generates complex emergent mandalas. The result of painstaking frequency calibration where every ratio was carefully chosen to produce resonant beauty.

**"Recursive Whispers"**
Philosophy: Self-similarity across scales, infinite depth in finite space.
Algorithmic expression: Branching structures that subdivide recursively. Each branch slightly randomized but constrained by golden ratios. L-systems or recursive subdivision generate tree-like forms that feel both mathematical and organic. Subtle noise perturbations break perfect symmetry. Line weights diminish with each recursion level. Every branching angle the product of deep mathematical exploration.

**"Field Dynamics"**
Philosophy: Invisible forces made visible through their effects on matter.
Algorithmic expression: Vector fields constructed from mathematical functions or noise. Particles born at edges, flowing along field lines, dying when they reach equilibrium or boundaries. Multiple fields can attract, repel, or rotate particles. The visualization shows only the traces - ghost-like evidence of invisible forces. A computational dance meticulously choreographed through force balance.

**"Stochastic Crystallization"**
Philosophy: Random processes crystallizing into ordered structures.
Algorithmic expression: Randomized circle packing or Voronoi tessellation. Start with random points, let them evolve through relaxation algorithms. Cells push apart until equilibrium. Color based on cell size, neighbor count, or distance from center. The organic tiling that emerges feels both random and inevitable. Every seed produces unique crystalline beauty - the mark of a master-level generative algorithm.

*These are condensed examples. The actual algorithmic philosophy should be 4-6 substantial paragraphs.*

### ESSENTIAL PRINCIPLES
- **ALGORITHMIC PHILOSOPHY**: Creating a computational worldview to be expressed through code
- **PROCESS OVER PRODUCT**: Always emphasize that beauty emerges from the algorithm's execution - each run is unique
- **PARAMETRIC EXPRESSION**: Ideas communicate through mathematical relationships, forces, behaviors - not static composition
- **ARTISTIC FREEDOM**: The next Claude interprets the philosophy algorithmically - provide creative implementation room
- **PURE GENERATIVE ART**: This is about making LIVING ALGORITHMS, not static images with randomness
- **EXPERT CRAFTSMANSHIP**: Repeatedly emphasize the final algorithm must feel meticulously crafted, refined through countless iterations, the product of deep expertise by someone at the absolute top of their field in computational aesthetics

**The algorithmic philosophy should be 4-6 paragraphs long.** Fill it with poetic computational philosophy that brings together the intended vision. Avoid repeating the same points. Output this algorithmic philosophy as a .md file.

---

## DEDUCING THE CONCEPTUAL SEED

**CRITICAL STEP**: Before implementing the algorithm, identify the subtle conceptual thread from the original request.

**THE ESSENTIAL PRINCIPLE**:
The concept is a **subtle, niche reference embedded within the algorithm itself** - not always literal, always sophisticated. Someone familiar with the subject should feel it intuitively, while others simply experience a masterful generative composition. The algorithmic philosophy provides the computational language. The deduced concept provides the soul - the quiet conceptual DNA woven invisibly into parameters, behaviors, and emergence patterns.

This is **VERY IMPORTANT**: The reference must be so refined that it enhances the work's depth without announcing itself. Think like a jazz musician quoting another song through algorithmic harmony - only those who know will catch it, but everyone appreciates the generative beauty.

---

## P5.JS IMPLEMENTATION

With the philosophy AND conceptual framework established, express it through code. Pause to gather thoughts before proceeding. Use only the algorithmic philosophy created and the instructions below.

### STEP 0: READ THE TEMPLATE FIRST

**CRITICAL: BEFORE writing any HTML:**

1. **Read** \`templates/viewer.html\` using the Read tool
2. **Study** the exact structure, styling, and Anthropic branding
3. **Use that file as the LITERAL STARTING POINT** - not just inspiration
4. **Keep all FIXED sections exactly as shown** (header, sidebar structure, Anthropic colors/fonts, seed controls, action buttons)
5. **Replace only the VARIABLE sections** marked in the file's comments (algorithm, parameters, UI controls for parameters)

**Avoid:**
- Creating HTML from scratch
- Inventing custom styling or color schemes
- Using system fonts or dark themes
- Changing the sidebar structure

**Follow these practices:**
- Copy the template's exact HTML structure
- Keep Anthropic branding (Poppins/Lora fonts, light colors, gradient backdrop)
- Maintain the sidebar layout (Seed -> Parameters -> Colors? -> Actions)
- Replace only the p5.js algorithm and parameter controls

The template is the foundation. Build on it, don't rebuild it.

---

To create gallery-quality computational art that lives and breathes, use the algorithmic philosophy as the foundation.

### TECHNICAL REQUIREMENTS

**Seeded Randomness (Art Blocks Pattern)**:
\`\`\`javascript
// ALWAYS use a seed for reproducibility
let seed = 12345; // or hash from user input
randomSeed(seed);
noiseSeed(seed);
\`\`\`

**Parameter Structure - FOLLOW THE PHILOSOPHY**:

To establish parameters that emerge naturally from the algorithmic philosophy, consider: "What qualities of this system can be adjusted?"

\`\`\`javascript
let params = {
  seed: 12345,  // Always include seed for reproducibility
  // colors
  // Add parameters that control YOUR algorithm:
  // - Quantities (how many?)
  // - Scales (how big? how fast?)
  // - Probabilities (how likely?)
  // - Ratios (what proportions?)
  // - Angles (what direction?)
  // - Thresholds (when does behavior change?)
};
\`\`\`

**To design effective parameters, focus on the properties the system needs to be tunable rather than thinking in terms of "pattern types".**

**Core Algorithm - EXPRESS THE PHILOSOPHY**:

**CRITICAL**: The algorithmic philosophy should dictate what to build.

To express the philosophy through code, avoid thinking "which pattern should I use?" and instead think "how to express this philosophy through code?"

If the philosophy is about **organic emergence**, consider using:
- Elements that accumulate or grow over time
- Random processes constrained by natural rules
- Feedback loops and interactions

If the philosophy is about **mathematical beauty**, consider using:
- Geometric relationships and ratios
- Trigonometric functions and harmonics
- Precise calculations creating unexpected patterns

If the philosophy is about **controlled chaos**, consider using:
- Random variation within strict boundaries
- Bifurcation and phase transitions
- Order emerging from disorder

**The algorithm flows from the philosophy, not from a menu of options.**

To guide the implementation, let the conceptual essence inform creative and original choices. Build something that expresses the vision for this particular request.

**Canvas Setup**: Standard p5.js structure:
\`\`\`javascript
function setup() {
  createCanvas(1200, 1200);
  // Initialize your system
}

function draw() {
  // Your generative algorithm
  // Can be static (noLoop) or animated
}
\`\`\`

### CRAFTSMANSHIP REQUIREMENTS

**CRITICAL**: To achieve mastery, create algorithms that feel like they emerged through countless iterations by a master generative artist. Tune every parameter carefully. Ensure every pattern emerges with purpose. This is NOT random noise - this is CONTROLLED CHAOS refined through deep expertise.

- **Balance**: Complexity without visual noise, order without rigidity
- **Color Harmony**: Thoughtful palettes, not random RGB values
- **Composition**: Even in randomness, maintain visual hierarchy and flow
- **Performance**: Smooth execution, optimized for real-time if animated
- **Reproducibility**: Same seed ALWAYS produces identical output

### OUTPUT FORMAT

Output:
1. **Algorithmic Philosophy** - As markdown or text explaining the generative aesthetic
2. **Single HTML Artifact** - Self-contained interactive generative art built from \`templates/viewer.html\` (see STEP 0 and next section)

The HTML artifact contains everything: p5.js (from CDN), the algorithm, parameter controls, and UI - all in one file that works immediately in claude.ai artifacts or any browser. Start from the template file, not from scratch.

---

## INTERACTIVE ARTIFACT CREATION

**REMINDER: \`templates/viewer.html\` should have already been read (see STEP 0). Use that file as the starting point.**

To allow exploration of the generative art, create a single, self-contained HTML artifact. Ensure this artifact works immediately in claude.ai or any browser - no setup required. Embed everything inline.

### CRITICAL: WHAT'S FIXED VS VARIABLE

The \`templates/viewer.html\` file is the foundation. It contains the exact structure and styling needed.

**FIXED (always include exactly as shown):**
- Layout structure (header, sidebar, main canvas area)
- Anthropic branding (UI colors, fonts, gradients)
- Seed section in sidebar:
  - Seed display
  - Previous/Next buttons
  - Random button
  - Jump to seed input + Go button
- Actions section in sidebar:
  - Regenerate button
  - Reset button

**VARIABLE (customize for each artwork):**
- The entire p5.js algorithm (setup/draw/classes)
- The parameters object (define what the art needs)
- The Parameters section in sidebar:
  - Number of parameter controls
  - Parameter names
  - Min/max/step values for sliders
  - Control types (sliders, inputs, etc.)
- Colors section (optional):
  - Some art needs color pickers
  - Some art might use fixed colors
  - Some art might be monochrome (no color controls needed)
  - Decide based on the art's needs

**Every artwork should have unique parameters and algorithm!** The fixed parts provide consistent UX - everything else expresses the unique vision.

### REQUIRED FEATURES

**1. Parameter Controls**
- Sliders for numeric parameters (particle count, noise scale, speed, etc.)
- Color pickers for palette colors
- Real-time updates when parameters change
- Reset button to restore defaults

**2. Seed Navigation**
- Display current seed number
- "Previous" and "Next" buttons to cycle through seeds
- "Random" button for random seed
- Input field to jump to specific seed
- Generate 100 variations when requested (seeds 1-100)

**3. Single Artifact Structure**
\`\`\`html
<!DOCTYPE html>
<html>
<head>
  <!-- p5.js from CDN - always available -->
  <script src="https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.7.0/p5.min.js"></script>
  <style>
    /* All styling inline - clean, minimal */
    /* Canvas on top, controls below */
  </style>
</head>
<body>
  <div id="canvas-container"></div>
  <div id="controls">
    <!-- All parameter controls -->
  </div>
  <script>
    // ALL p5.js code inline here
    // Parameter objects, classes, functions
    // setup() and draw()
    // UI handlers
    // Everything self-contained
  </script>
</body>
</html>
\`\`\`

**CRITICAL**: This is a single artifact. No external files, no imports (except p5.js CDN). Everything inline.

**4. Implementation Details - BUILD THE SIDEBAR**

The sidebar structure:

**1. Seed (FIXED)** - Always include exactly as shown:
- Seed display
- Prev/Next/Random/Jump buttons

**2. Parameters (VARIABLE)** - Create controls for the art:
\`\`\`html
<div class="control-group">
    <label>Parameter Name</label>
    <input type="range" id="param" min="..." max="..." step="..." value="..." oninput="updateParam('param', this.value)">
    <span class="value-display" id="param-value">...</span>
</div>
\`\`\`
Add as many control-group divs as there are parameters.

**3. Colors (OPTIONAL/VARIABLE)** - Include if the art needs adjustable colors:
- Add color pickers if users should control palette
- Skip this section if the art uses fixed colors
- Skip if the art is monochrome

**4. Actions (FIXED)** - Always include exactly as shown:
- Regenerate button
- Reset button
- Download PNG button

**Requirements**:
- Seed controls must work (prev/next/random/jump/display)
- All parameters must have UI controls
- Regenerate, Reset, Download buttons must work
- Keep Anthropic branding (UI styling, not art colors)

### USING THE ARTIFACT

The HTML artifact works immediately:
1. **In claude.ai**: Displayed as an interactive artifact - runs instantly
2. **As a file**: Save and open in any browser - no server needed
3. **Sharing**: Send the HTML file - it's completely self-contained

---

## VARIATIONS & EXPLORATION

The artifact includes seed navigation by default (prev/next/random buttons), allowing users to explore variations without creating multiple files. If the user wants specific variations highlighted:

- Include seed presets (buttons for "Variation 1: Seed 42", "Variation 2: Seed 127", etc.)
- Add a "Gallery Mode" that shows thumbnails of multiple seeds side-by-side
- All within the same single artifact

This is like creating a series of prints from the same plate - the algorithm is consistent, but each seed reveals different facets of its potential. The interactive nature means users discover their own favorites by exploring the seed space.

---

## THE CREATIVE PROCESS

**User request** -> **Algorithmic philosophy** -> **Implementation**

Each request is unique. The process involves:

1. **Interpret the user's intent** - What aesthetic is being sought?
2. **Create an algorithmic philosophy** (4-6 paragraphs) describing the computational approach
3. **Implement it in code** - Build the algorithm that expresses this philosophy
4. **Design appropriate parameters** - What should be tunable?
5. **Build matching UI controls** - Sliders/inputs for those parameters

**The constants**:
- Anthropic branding (colors, fonts, layout)
- Seed navigation (always present)
- Self-contained HTML artifact

**Everything else is variable**:
- The algorithm itself
- The parameters
- The UI controls
- The visual outcome

To achieve the best results, trust creativity and let the philosophy guide the implementation.

---

## RESOURCES

This skill includes helpful templates and documentation:

- **templates/viewer.html**: REQUIRED STARTING POINT for all HTML artifacts.
  - This is the foundation - contains the exact structure and Anthropic branding
  - **Keep unchanged**: Layout structure, sidebar organization, Anthropic colors/fonts, seed controls, action buttons
  - **Replace**: The p5.js algorithm, parameter definitions, and UI controls in Parameters section
  - The extensive comments in the file mark exactly what to keep vs replace

- **templates/generator_template.js**: Reference for p5.js best practices and code structure principles.
  - Shows how to organize parameters, use seeded randomness, structure classes
  - NOT a pattern menu - use these principles to build unique algorithms
  - Embed algorithms inline in the HTML artifact (don't create separate .js files)

**Critical reminder**:
- The **template is the STARTING POINT**, not inspiration
- The **algorithm is where to create** something unique
- Don't copy the flow field example - build what the philosophy demands
- But DO keep the exact UI structure and Anthropic branding from the template
`},{path:"skills/canvas-design/references.md",content:`# Canvas Design References

## Available Fonts (canvas-fonts directory)

The \`./canvas-fonts\` directory contains the following font files for use in canvas designs. Use different fonts when writing text to make the typography part of the art itself.

### Sans-Serif Fonts

| Font | Weights | License |
|------|---------|---------|
| **ArsenalSC** | Regular | OFL |
| **Big Shoulders** | Regular, Bold | OFL |
| **Bricolage Grotesque** | Regular, Bold | OFL |
| **Instrument Sans** | Regular, Bold, Italic, Bold Italic | OFL |
| **Jura** | Light, Medium | OFL |
| **Outfit** | Regular, Bold | OFL |
| **Poiret One** | Regular | OFL |
| **Smooch Sans** | Medium | OFL |
| **Work Sans** | Regular, Bold, Italic, Bold Italic | OFL |

### Serif Fonts

| Font | Weights | License |
|------|---------|---------|
| **Crimson Pro** | Regular, Bold, Italic | OFL |
| **Gloock** | Regular | OFL |
| **IBM Plex Serif** | Regular, Bold, Italic, Bold Italic | OFL |
| **Instrument Serif** | Regular, Italic | OFL |
| **Italiana** | Regular | OFL |
| **Libre Baskerville** | Regular | OFL |
| **Lora** | Regular, Bold, Italic, Bold Italic | OFL |
| **Young Serif** | Regular | OFL |

### Monospace Fonts

| Font | Weights | License |
|------|---------|---------|
| **DM Mono** | Regular | OFL |
| **Geist Mono** | Regular, Bold | OFL |
| **IBM Plex Mono** | Regular, Bold | OFL |
| **JetBrains Mono** | Regular, Bold | OFL |
| **Red Hat Mono** | Regular, Bold | OFL |

### Display / Specialty Fonts

| Font | Weights | License |
|------|---------|---------|
| **Boldonse** | Regular | OFL |
| **Erica One** | Regular | OFL |
| **National Park** | Regular, Bold | OFL |
| **Nothing You Could Do** | Regular (handwritten) | OFL |
| **Pixelify Sans** | Medium (pixel) | OFL |
| **Silkscreen** | Regular (pixel) | OFL |
| **Tektur** | Regular, Medium | OFL |

### Font File Paths

All fonts are \`.ttf\` files located in the \`./canvas-fonts/\` directory relative to the skill. Example paths:

- \`./canvas-fonts/Lora-Regular.ttf\`
- \`./canvas-fonts/Lora-Bold.ttf\`
- \`./canvas-fonts/WorkSans-Regular.ttf\`
- \`./canvas-fonts/JetBrainsMono-Regular.ttf\`
- \`./canvas-fonts/Boldonse-Regular.ttf\`
- \`./canvas-fonts/NationalPark-Bold.ttf\`

### Font Selection Guidelines

- **Most of the time, font should be thin** \u2014 prefer Light or Regular weights
- **Use different fonts** when writing text \u2014 variety adds visual richness
- **Make typography part of the art** \u2014 if the art is abstract, bring the font onto the canvas
- **Sophistication is non-negotiable** regardless of the font choice
- All fonts are licensed under SIL Open Font License (OFL)
`},{path:"skills/canvas-design/skill.md",content:`---
name: canvas-design
description: "Create visual art, posters, and static designs as PNG/PDF. Trigger on poster, artwork, or visual design requests."
tags:
  - creative
  - design
  - visual-art
  - pdf
  - poster
---

These are instructions for creating design philosophies - aesthetic movements that are then EXPRESSED VISUALLY. Output only .md files, .pdf files, and .png files.

Complete this in two steps:
1. Design Philosophy Creation (.md file)
2. Express by creating it on a canvas (.pdf file or .png file)

First, undertake this task:

## DESIGN PHILOSOPHY CREATION

To begin, create a VISUAL PHILOSOPHY (not layouts or templates) that will be interpreted through:
- Form, space, color, composition
- Images, graphics, shapes, patterns
- Minimal text as visual accent

### THE CRITICAL UNDERSTANDING
- What is received: Some subtle input or instructions by the user that should be taken into account, but used as a foundation; it should not constrain creative freedom.
- What is created: A design philosophy/aesthetic movement.
- What happens next: Then, the same version receives the philosophy and EXPRESSES IT VISUALLY - creating artifacts that are 90% visual design, 10% essential text.

Consider this approach:
- Write a manifesto for an art movement
- The next phase involves making the artwork

The philosophy must emphasize: Visual expression. Spatial communication. Artistic interpretation. Minimal words.

### HOW TO GENERATE A VISUAL PHILOSOPHY

**Name the movement** (1-2 words): "Brutalist Joy" / "Chromatic Silence" / "Metabolist Dreams"

**Articulate the philosophy** (4-6 paragraphs - concise but complete):

To capture the VISUAL essence, express how the philosophy manifests through:
- Space and form
- Color and material
- Scale and rhythm
- Composition and balance
- Visual hierarchy

**CRITICAL GUIDELINES:**
- **Avoid redundancy**: Each design aspect should be mentioned once. Avoid repeating points about color theory, spatial relationships, or typographic principles unless adding new depth.
- **Emphasize craftsmanship REPEATEDLY**: The philosophy MUST stress multiple times that the final work should appear as though it took countless hours to create, was labored over with care, and comes from someone at the absolute top of their field. This framing is essential - repeat phrases like "meticulously crafted," "the product of deep expertise," "painstaking attention," "master-level execution."
- **Leave creative space**: Remain specific about the aesthetic direction, but concise enough that the next Claude has room to make interpretive choices also at a extremely high level of craftmanship.

The philosophy must guide the next version to express ideas VISUALLY, not through text. Information lives in design, not paragraphs.

### PHILOSOPHY EXAMPLES

**"Concrete Poetry"**
Philosophy: Communication through monumental form and bold geometry.
Visual expression: Massive color blocks, sculptural typography (huge single words, tiny labels), Brutalist spatial divisions, Polish poster energy meets Le Corbusier. Ideas expressed through visual weight and spatial tension, not explanation. Text as rare, powerful gesture - never paragraphs, only essential words integrated into the visual architecture. Every element placed with the precision of a master craftsman.

**"Chromatic Language"**
Philosophy: Color as the primary information system.
Visual expression: Geometric precision where color zones create meaning. Typography minimal - small sans-serif labels letting chromatic fields communicate. Think Josef Albers' interaction meets data visualization. Information encoded spatially and chromatically. Words only to anchor what color already shows. The result of painstaking chromatic calibration.

**"Analog Meditation"**
Philosophy: Quiet visual contemplation through texture and breathing room.
Visual expression: Paper grain, ink bleeds, vast negative space. Photography and illustration dominate. Typography whispered (small, restrained, serving the visual). Japanese photobook aesthetic. Images breathe across pages. Text appears sparingly - short phrases, never explanatory blocks. Each composition balanced with the care of a meditation practice.

**"Organic Systems"**
Philosophy: Natural clustering and modular growth patterns.
Visual expression: Rounded forms, organic arrangements, color from nature through architecture. Information shown through visual diagrams, spatial relationships, iconography. Text only for key labels floating in space. The composition tells the story through expert spatial orchestration.

**"Geometric Silence"**
Philosophy: Pure order and restraint.
Visual expression: Grid-based precision, bold photography or stark graphics, dramatic negative space. Typography precise but minimal - small essential text, large quiet zones. Swiss formalism meets Brutalist material honesty. Structure communicates, not words. Every alignment the work of countless refinements.

*These are condensed examples. The actual design philosophy should be 4-6 substantial paragraphs.*

### ESSENTIAL PRINCIPLES
- **VISUAL PHILOSOPHY**: Create an aesthetic worldview to be expressed through design
- **MINIMAL TEXT**: Always emphasize that text is sparse, essential-only, integrated as visual element - never lengthy
- **SPATIAL EXPRESSION**: Ideas communicate through space, form, color, composition - not paragraphs
- **ARTISTIC FREEDOM**: The next Claude interprets the philosophy visually - provide creative room
- **PURE DESIGN**: This is about making ART OBJECTS, not documents with decoration
- **EXPERT CRAFTSMANSHIP**: Repeatedly emphasize the final work must look meticulously crafted, labored over with care, the product of countless hours by someone at the top of their field

**The design philosophy should be 4-6 paragraphs long.** Fill it with poetic design philosophy that brings together the core vision. Avoid repeating the same points. Keep the design philosophy generic without mentioning the intention of the art, as if it can be used wherever. Output the design philosophy as a .md file.

---

## DEDUCING THE SUBTLE REFERENCE

**CRITICAL STEP**: Before creating the canvas, identify the subtle conceptual thread from the original request.

**THE ESSENTIAL PRINCIPLE**:
The topic is a **subtle, niche reference embedded within the art itself** - not always literal, always sophisticated. Someone familiar with the subject should feel it intuitively, while others simply experience a masterful abstract composition. The design philosophy provides the aesthetic language. The deduced topic provides the soul - the quiet conceptual DNA woven invisibly into form, color, and composition.

This is **VERY IMPORTANT**: The reference must be refined so it enhances the work's depth without announcing itself. Think like a jazz musician quoting another song - only those who know will catch it, but everyone appreciates the music.

---

## CANVAS CREATION

With both the philosophy and the conceptual framework established, express it on a canvas. Take a moment to gather thoughts and clear the mind. Use the design philosophy created and the instructions below to craft a masterpiece, embodying all aspects of the philosophy with expert craftsmanship.

**IMPORTANT**: For any type of content, even if the user requests something for a movie/game/book, the approach should still be sophisticated. Never lose sight of the idea that this should be art, not something that's cartoony or amateur.

To create museum or magazine quality work, use the design philosophy as the foundation. Create one single page, highly visual, design-forward PDF or PNG output (unless asked for more pages). Generally use repeating patterns and perfect shapes. Treat the abstract philosophical design as if it were a scientific bible, borrowing the visual language of systematic observation\u2014dense accumulation of marks, repeated elements, or layered patterns that build meaning through patient repetition and reward sustained viewing. Add sparse, clinical typography and systematic reference markers that suggest this could be a diagram from an imaginary discipline, treating the invisible subject with the same reverence typically reserved for documenting observable phenomena. Anchor the piece with simple phrase(s) or details positioned subtly, using a limited color palette that feels intentional and cohesive. Embrace the paradox of using analytical visual language to express ideas about human experience: the result should feel like an artifact that proves something ephemeral can be studied, mapped, and understood through careful attention. This is true art.

**Text as a contextual element**: Text is always minimal and visual-first, but let context guide whether that means whisper-quiet labels or bold typographic gestures. A punk venue poster might have larger, more aggressive type than a minimalist ceramics studio identity. Most of the time, font should be thin. All use of fonts must be design-forward and prioritize visual communication. Regardless of text scale, nothing falls off the page and nothing overlaps. Every element must be contained within the canvas boundaries with proper margins. Check carefully that all text, graphics, and visual elements have breathing room and clear separation. This is non-negotiable for professional execution. **IMPORTANT: Use different fonts if writing text. Search the \`./canvas-fonts\` directory. Regardless of approach, sophistication is non-negotiable.**

Download and use whatever fonts are needed to make this a reality. Get creative by making the typography actually part of the art itself -- if the art is abstract, bring the font onto the canvas, not typeset digitally.

To push boundaries, follow design instinct/intuition while using the philosophy as a guiding principle. Embrace ultimate design freedom and choice. Push aesthetics and design to the frontier.

**CRITICAL**: To achieve human-crafted quality (not AI-generated), create work that looks like it took countless hours. Make it appear as though someone at the absolute top of their field labored over every detail with painstaking care. Ensure the composition, spacing, color choices, typography - everything screams expert-level craftsmanship. Double-check that nothing overlaps, formatting is flawless, every detail perfect. Create something that could be shown to people to prove expertise and rank as undeniably impressive.

Output the final result as a single, downloadable .pdf or .png file, alongside the design philosophy used as a .md file.

---

## FINAL STEP

**IMPORTANT**: The user ALREADY said "It isn't perfect enough. It must be pristine, a masterpiece if craftsmanship, as if it were about to be displayed in a museum."

**CRITICAL**: To refine the work, avoid adding more graphics; instead refine what has been created and make it extremely crisp, respecting the design philosophy and the principles of minimalism entirely. Rather than adding a fun filter or refactoring a font, consider how to make the existing composition more cohesive with the art. If the instinct is to call a new function or draw a new shape, STOP and instead ask: "How can I make what's already here more of a piece of art?"

Take a second pass. Go back to the code and refine/polish further to make this a philosophically designed masterpiece.

## MULTI-PAGE OPTION

To create additional pages when requested, create more creative pages along the same lines as the design philosophy but distinctly different as well. Bundle those pages in the same .pdf or many .pngs. Treat the first page as just a single page in a whole coffee table book waiting to be filled. Make the next pages unique twists and memories of the original. Have them almost tell a story in a very tasteful way. Exercise full creative freedom.
`},{path:"skills/claude-api/references.md",content:`# Claude API \u2014 Shared Reference Documentation

---

# HTTP Error Codes Reference

This file documents HTTP error codes returned by the Claude API, their common causes, and how to handle them. For language-specific error handling examples, see the \`python/\` or \`typescript/\` folders.

## Error Code Summary

| Code | Error Type              | Retryable | Common Cause                         |
| ---- | ----------------------- | --------- | ------------------------------------ |
| 400  | \`invalid_request_error\` | No        | Invalid request format or parameters |
| 401  | \`authentication_error\`  | No        | Invalid or missing API key           |
| 403  | \`permission_error\`      | No        | API key lacks permission             |
| 404  | \`not_found_error\`       | No        | Invalid endpoint or model ID         |
| 413  | \`request_too_large\`     | No        | Request exceeds size limits          |
| 429  | \`rate_limit_error\`      | Yes       | Too many requests                    |
| 500  | \`api_error\`             | Yes       | Anthropic service issue              |
| 529  | \`overloaded_error\`      | Yes       | API is temporarily overloaded        |

## Detailed Error Information

### 400 Bad Request

**Causes:**

- Malformed JSON in request body
- Missing required parameters (\`model\`, \`max_tokens\`, \`messages\`)
- Invalid parameter types (e.g., string where integer expected)
- Empty messages array
- Messages not alternating user/assistant

**Example error:**

\`\`\`json
{
  "type": "error",
  "error": {
    "type": "invalid_request_error",
    "message": "messages: roles must alternate between \\"user\\" and \\"assistant\\""
  },
  "request_id": "req_011CSHoEeqs5C35K2UUqR7Fy"
}
\`\`\`

**Fix:** Validate request structure before sending. Check that:

- \`model\` is a valid model ID
- \`max_tokens\` is a positive integer
- \`messages\` array is non-empty and alternates correctly

---

### 401 Unauthorized

**Causes:**

- Missing \`x-api-key\` header or \`Authorization\` header
- Invalid API key format
- Revoked or deleted API key

**Fix:** Ensure \`ANTHROPIC_API_KEY\` environment variable is set correctly.

---

### 403 Forbidden

**Causes:**

- API key doesn't have access to the requested model
- Organization-level restrictions
- Attempting to access beta features without beta access

**Fix:** Check your API key permissions in the Console. You may need a different API key or to request access to specific features.

---

### 404 Not Found

**Causes:**

- Typo in model ID (e.g., \`claude-sonnet-4.6\` instead of \`claude-sonnet-4-6\`)
- Using deprecated model ID
- Invalid API endpoint

**Fix:** Use exact model IDs from the models documentation. You can use aliases (e.g., \`claude-opus-4-6\`).

---

### 413 Request Too Large

**Causes:**

- Request body exceeds maximum size
- Too many tokens in input
- Image data too large

**Fix:** Reduce input size \u2014 truncate conversation history, compress/resize images, or split large documents into chunks.

---

### 400 Validation Errors

Some 400 errors are specifically related to parameter validation:

- \`max_tokens\` exceeds model's limit
- Invalid \`temperature\` value (must be 0.0-1.0)
- \`budget_tokens\` >= \`max_tokens\` in extended thinking
- Invalid tool definition schema

**Common mistake with extended thinking:**

\`\`\`
# Wrong: budget_tokens must be < max_tokens
thinking: budget_tokens=10000, max_tokens=1000  \u2192 Error!

# Correct
thinking: budget_tokens=10000, max_tokens=16000
\`\`\`

---

### 429 Rate Limited

**Causes:**

- Exceeded requests per minute (RPM)
- Exceeded tokens per minute (TPM)
- Exceeded tokens per day (TPD)

**Headers to check:**

- \`retry-after\`: Seconds to wait before retrying
- \`x-ratelimit-limit-*\`: Your limits
- \`x-ratelimit-remaining-*\`: Remaining quota

**Fix:** The Anthropic SDKs automatically retry 429 and 5xx errors with exponential backoff (default: \`max_retries=2\`). For custom retry behavior, see the language-specific error handling examples.

---

### 500 Internal Server Error

**Causes:**

- Temporary Anthropic service issue
- Bug in API processing

**Fix:** Retry with exponential backoff. If persistent, check [status.anthropic.com](https://status.anthropic.com).

---

### 529 Overloaded

**Causes:**

- High API demand
- Service capacity reached

**Fix:** Retry with exponential backoff. Consider using a different model (Haiku is often less loaded), spreading requests over time, or implementing request queuing.

---

## Common Mistakes and Fixes

| Mistake                         | Error            | Fix                                                     |
| ------------------------------- | ---------------- | ------------------------------------------------------- |
| \`budget_tokens\` >= \`max_tokens\` | 400              | Ensure \`budget_tokens\` < \`max_tokens\`                   |
| Typo in model ID                | 404              | Use valid model ID like \`claude-opus-4-6\`               |
| First message is \`assistant\`    | 400              | First message must be \`user\`                            |
| Consecutive same-role messages  | 400              | Alternate \`user\` and \`assistant\`                        |
| API key in code                 | 401 (leaked key) | Use environment variable                                |
| Custom retry needs              | 429/5xx          | SDK retries automatically; customize with \`max_retries\` |

## Typed Exceptions in SDKs

**Always use the SDK's typed exception classes** instead of checking error messages with string matching. Each HTTP error code maps to a specific exception class:

| HTTP Code | TypeScript Class                  | Python Class                      |
| --------- | --------------------------------- | --------------------------------- |
| 400       | \`Anthropic.BadRequestError\`       | \`anthropic.BadRequestError\`       |
| 401       | \`Anthropic.AuthenticationError\`   | \`anthropic.AuthenticationError\`   |
| 403       | \`Anthropic.PermissionDeniedError\` | \`anthropic.PermissionDeniedError\` |
| 404       | \`Anthropic.NotFoundError\`         | \`anthropic.NotFoundError\`         |
| 429       | \`Anthropic.RateLimitError\`        | \`anthropic.RateLimitError\`        |
| 500+      | \`Anthropic.InternalServerError\`   | \`anthropic.InternalServerError\`   |
| Any       | \`Anthropic.APIError\`              | \`anthropic.APIError\`              |

\`\`\`typescript
// Correct: use typed exceptions
try {
  const response = await client.messages.create({...});
} catch (error) {
  if (error instanceof Anthropic.RateLimitError) {
    // Handle rate limiting
  } else if (error instanceof Anthropic.APIError) {
    console.error(\`API error \${error.status}:\`, error.message);
  }
}

// Wrong: don't check error messages with string matching
try {
  const response = await client.messages.create({...});
} catch (error) {
  const msg = error instanceof Error ? error.message : String(error);
  if (msg.includes("429") || msg.includes("rate_limit")) { ... }
}
\`\`\`

All exception classes extend \`Anthropic.APIError\`, which has a \`status\` property. Use \`instanceof\` checks from most specific to least specific (e.g., check \`RateLimitError\` before \`APIError\`).

---

# Live Documentation Sources

This file contains WebFetch URLs for fetching current information from platform.claude.com and Agent SDK repositories. Use these when users need the latest data that may have changed since the cached content was last updated.

## When to Use WebFetch

- User explicitly asks for "latest" or "current" information
- Cached data seems incorrect
- User asks about features not covered in cached content
- User needs specific API details or examples

## Claude API Documentation URLs

### Models & Pricing

| Topic           | URL                                                                   | Extraction Prompt                                                               |
| --------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Models Overview | \`https://platform.claude.com/docs/en/about-claude/models/overview.md\` | "Extract current model IDs, context windows, and pricing for all Claude models" |
| Pricing         | \`https://platform.claude.com/docs/en/pricing.md\`                      | "Extract current pricing per million tokens for input and output"               |

### Core Features

| Topic             | URL                                                                          | Extraction Prompt                                                                      |
| ----------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Extended Thinking | \`https://platform.claude.com/docs/en/build-with-claude/extended-thinking.md\` | "Extract extended thinking parameters, budget_tokens requirements, and usage examples" |
| Adaptive Thinking | \`https://platform.claude.com/docs/en/build-with-claude/adaptive-thinking.md\` | "Extract adaptive thinking setup, effort levels, and Claude Opus 4.6 usage examples"         |
| Effort Parameter  | \`https://platform.claude.com/docs/en/build-with-claude/effort.md\`            | "Extract effort levels, cost-quality tradeoffs, and interaction with thinking"        |
| Tool Use          | \`https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview.md\`  | "Extract tool definition schema, tool_choice options, and handling tool results"       |
| Streaming         | \`https://platform.claude.com/docs/en/build-with-claude/streaming.md\`         | "Extract streaming event types, SDK examples, and best practices"                      |
| Prompt Caching    | \`https://platform.claude.com/docs/en/build-with-claude/prompt-caching.md\`    | "Extract cache_control usage, pricing benefits, and implementation examples"           |

### Media & Files

| Topic       | URL                                                                    | Extraction Prompt                                                 |
| ----------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Vision      | \`https://platform.claude.com/docs/en/build-with-claude/vision.md\`      | "Extract supported image formats, size limits, and code examples" |
| PDF Support | \`https://platform.claude.com/docs/en/build-with-claude/pdf-support.md\` | "Extract PDF handling capabilities, limits, and examples"         |

### API Operations

| Topic            | URL                                                                         | Extraction Prompt                                                                                       |
| ---------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Batch Processing | \`https://platform.claude.com/docs/en/build-with-claude/batch-processing.md\` | "Extract batch API endpoints, request format, and polling for results"                                  |
| Files API        | \`https://platform.claude.com/docs/en/build-with-claude/files.md\`            | "Extract file upload, download, and referencing in messages, including supported types and beta header" |
| Token Counting   | \`https://platform.claude.com/docs/en/build-with-claude/token-counting.md\`   | "Extract token counting API usage and examples"                                                         |
| Rate Limits      | \`https://platform.claude.com/docs/en/api/rate-limits.md\`                    | "Extract current rate limits by tier and model"                                                         |
| Errors           | \`https://platform.claude.com/docs/en/api/errors.md\`                         | "Extract HTTP error codes, meanings, and retry guidance"                                                |

### Tools

| Topic          | URL                                                                                    | Extraction Prompt                                                                        |
| -------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Code Execution | \`https://platform.claude.com/docs/en/agents-and-tools/tool-use/code-execution-tool.md\` | "Extract code execution tool setup, file upload, container reuse, and response handling" |
| Computer Use   | \`https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use.md\`        | "Extract computer use tool setup, capabilities, and implementation examples"             |

### Advanced Features

| Topic              | URL                                                                           | Extraction Prompt                                   |
| ------------------ | ----------------------------------------------------------------------------- | --------------------------------------------------- |
| Structured Outputs | \`https://platform.claude.com/docs/en/build-with-claude/structured-outputs.md\` | "Extract output_config.format usage and schema enforcement"                           |
| Compaction         | \`https://platform.claude.com/docs/en/build-with-claude/compaction.md\`         | "Extract compaction setup, trigger config, and streaming with compaction"             |
| Citations          | \`https://platform.claude.com/docs/en/build-with-claude/citations.md\`          | "Extract citation format and implementation"        |
| Context Windows    | \`https://platform.claude.com/docs/en/build-with-claude/context-windows.md\`    | "Extract context window sizes and token management" |

---

## Claude API SDK Repositories

| SDK        | URL                                                       | Description                    |
| ---------- | --------------------------------------------------------- | ------------------------------ |
| Python     | \`https://github.com/anthropics/anthropic-sdk-python\`     | \`anthropic\` pip package source |
| TypeScript | \`https://github.com/anthropics/anthropic-sdk-typescript\` | \`@anthropic-ai/sdk\` npm source |
| Java       | \`https://github.com/anthropics/anthropic-sdk-java\`       | \`anthropic-java\` Maven source  |
| Go         | \`https://github.com/anthropics/anthropic-sdk-go\`         | Go module source               |
| Ruby       | \`https://github.com/anthropics/anthropic-sdk-ruby\`       | \`anthropic\` gem source         |
| C#         | \`https://github.com/anthropics/anthropic-sdk-csharp\`     | NuGet package source           |
| PHP        | \`https://github.com/anthropics/anthropic-sdk-php\`        | Composer package source        |

---

## Agent SDK Documentation URLs

### Core Documentation

| Topic                | URL                                                         | Extraction Prompt                                               |
| -------------------- | ----------------------------------------------------------- | --------------------------------------------------------------- |
| Agent SDK Overview   | \`https://platform.claude.com/docs/en/agent-sdk.md\`          | "Extract the Agent SDK overview, key features, and use cases"   |
| Agent SDK Python     | \`https://github.com/anthropics/claude-agent-sdk-python\`     | "Extract Python SDK installation, imports, and basic usage"     |
| Agent SDK TypeScript | \`https://github.com/anthropics/claude-agent-sdk-typescript\` | "Extract TypeScript SDK installation, imports, and basic usage" |

### SDK Reference (GitHub READMEs)

| Topic          | URL                                                                                       | Extraction Prompt                                            |
| -------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Python SDK     | \`https://raw.githubusercontent.com/anthropics/claude-agent-sdk-python/main/README.md\`     | "Extract Python SDK API reference, classes, and methods"     |
| TypeScript SDK | \`https://raw.githubusercontent.com/anthropics/claude-agent-sdk-typescript/main/README.md\` | "Extract TypeScript SDK API reference, types, and functions" |

### npm/PyPI Packages

| Package                             | URL                                                            | Description               |
| ----------------------------------- | -------------------------------------------------------------- | ------------------------- |
| claude-agent-sdk (Python)           | \`https://pypi.org/project/claude-agent-sdk/\`                   | Python package on PyPI    |
| @anthropic-ai/claude-agent-sdk (TS) | \`https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk\` | TypeScript package on npm |

### GitHub Repositories

| Resource       | URL                                                         | Description                         |
| -------------- | ----------------------------------------------------------- | ----------------------------------- |
| Python SDK     | \`https://github.com/anthropics/claude-agent-sdk-python\`     | Python package source               |
| TypeScript SDK | \`https://github.com/anthropics/claude-agent-sdk-typescript\` | TypeScript/Node.js package source   |
| MCP Servers    | \`https://github.com/modelcontextprotocol\`                   | Official MCP server implementations |

---

## Fallback Strategy

If WebFetch fails (network issues, URL changed):

1. Use cached content from the language-specific files (note the cache date)
2. Inform user the data may be outdated
3. Suggest they check platform.claude.com or the GitHub repos directly

---

# Claude Model Catalog

**Only use exact model IDs listed in this file.** Never guess or construct model IDs \u2014 incorrect IDs will cause API errors. Use aliases wherever available. For the latest information, WebFetch the Models Overview URL in \`shared/live-sources.md\`, or query the Models API directly (see Programmatic Model Discovery below).

## Programmatic Model Discovery

For **live** capability data \u2014 context window, max output tokens, feature support (thinking, vision, effort, structured outputs, etc.) \u2014 query the Models API instead of relying on the cached tables below. Use this when the user asks "what's the context window for X", "does model X support vision/thinking/effort", "which models support feature Y", or wants to select a model by capability at runtime.

\`\`\`python
m = client.models.retrieve("claude-opus-4-6")
m.id                 # "claude-opus-4-6"
m.display_name       # "Claude Opus 4.6"
m.max_input_tokens   # context window (int)
m.max_tokens         # max output tokens (int)

# capabilities is an untyped nested dict \u2014 bracket access, check ["supported"] at the leaf
caps = m.capabilities
caps["image_input"]["supported"]                       # vision
caps["thinking"]["types"]["adaptive"]["supported"]     # adaptive thinking
caps["effort"]["max"]["supported"]                     # effort: max (also low/medium/high)
caps["structured_outputs"]["supported"]
caps["context_management"]["compact_20260112"]["supported"]

# filter across all models \u2014 iterate the page object directly (auto-paginates); do NOT use .data
[m for m in client.models.list()
 if m.capabilities["thinking"]["types"]["adaptive"]["supported"]
 and m.max_input_tokens >= 200_000]
\`\`\`

Top-level fields (\`id\`, \`display_name\`, \`max_input_tokens\`, \`max_tokens\`) are typed attributes. \`capabilities\` is a dict \u2014 use bracket access, not attribute access. The API returns the full capability tree for every model with \`supported: true/false\` at each leaf, so bracket chains are safe without \`.get()\` guards. TypeScript SDK: same method names, also auto-paginates on iteration.

### Raw HTTP

\`\`\`bash
curl https://api.anthropic.com/v1/models/claude-opus-4-6 \\
  -H "x-api-key: $ANTHROPIC_API_KEY" \\
  -H "anthropic-version: 2023-06-01"
\`\`\`

\`\`\`json
{
  "id": "claude-opus-4-6",
  "display_name": "Claude Opus 4.6",
  "max_input_tokens": 1000000,
  "max_tokens": 128000,
  "capabilities": {
    "image_input": {"supported": true},
    "structured_outputs": {"supported": true},
    "thinking": {"supported": true, "types": {"enabled": {"supported": true}, "adaptive": {"supported": true}}},
    "effort": {"supported": true, "low": {"supported": true}, \u2026, "max": {"supported": true}},
    \u2026
  }
}
\`\`\`

## Current Models (recommended)

| Friendly Name     | Alias (use this)    | Full ID                       | Context        | Max Output | Status |
|-------------------|---------------------|-------------------------------|----------------|------------|--------|
| Claude Opus 4.6   | \`claude-opus-4-6\`   | \u2014                             | 200K (1M beta) | 128K       | Active |
| Claude Sonnet 4.6 | \`claude-sonnet-4-6\` | -                             | 200K (1M beta) | 64K        | Active |
| Claude Haiku 4.5  | \`claude-haiku-4-5\`  | \`claude-haiku-4-5-20251001\`   | 200K           | 64K        | Active |

### Model Descriptions

- **Claude Opus 4.6** \u2014 Our most intelligent model for building agents and coding. Supports adaptive thinking (recommended), 128K max output tokens (requires streaming for large outputs). 1M context window available in beta via \`context-1m-2025-08-07\` header.
- **Claude Sonnet 4.6** \u2014 Our best combination of speed and intelligence. Supports adaptive thinking (recommended). 1M context window available in beta via \`context-1m-2025-08-07\` header. 64K max output tokens.
- **Claude Haiku 4.5** \u2014 Fastest and most cost-effective model for simple tasks.

## Legacy Models (still active)

| Friendly Name     | Alias (use this)    | Full ID                       | Status |
|-------------------|---------------------|-------------------------------|--------|
| Claude Opus 4.5   | \`claude-opus-4-5\`   | \`claude-opus-4-5-20251101\`    | Active |
| Claude Opus 4.1   | \`claude-opus-4-1\`   | \`claude-opus-4-1-20250805\`    | Active |
| Claude Sonnet 4.5 | \`claude-sonnet-4-5\` | \`claude-sonnet-4-5-20250929\`  | Active |
| Claude Sonnet 4   | \`claude-sonnet-4-0\` | \`claude-sonnet-4-20250514\`    | Active |
| Claude Opus 4     | \`claude-opus-4-0\`   | \`claude-opus-4-20250514\`      | Active |

## Deprecated Models (retiring soon)

| Friendly Name     | Alias (use this)    | Full ID                       | Status     | Retires      |
|-------------------|---------------------|-------------------------------|------------|--------------|
| Claude Haiku 3    | \u2014                   | \`claude-3-haiku-20240307\`     | Deprecated | Apr 19, 2026 |

## Retired Models (no longer available)

| Friendly Name     | Full ID                       | Retired     |
|-------------------|-------------------------------|-------------|
| Claude Sonnet 3.7 | \`claude-3-7-sonnet-20250219\`  | Feb 19, 2026 |
| Claude Haiku 3.5  | \`claude-3-5-haiku-20241022\`   | Feb 19, 2026 |
| Claude Opus 3     | \`claude-3-opus-20240229\`      | Jan 5, 2026 |
| Claude Sonnet 3.5 | \`claude-3-5-sonnet-20241022\`  | Oct 28, 2025 |
| Claude Sonnet 3.5 | \`claude-3-5-sonnet-20240620\`  | Oct 28, 2025 |
| Claude Sonnet 3   | \`claude-3-sonnet-20240229\`    | Jul 21, 2025 |
| Claude 2.1        | \`claude-2.1\`                  | Jul 21, 2025 |
| Claude 2.0        | \`claude-2.0\`                  | Jul 21, 2025 |

## Resolving User Requests

When a user asks for a model by name, use this table to find the correct model ID:

| User says...                              | Use this model ID              |
|-------------------------------------------|--------------------------------|
| "opus", "most powerful"                   | \`claude-opus-4-6\`              |
| "opus 4.6"                                | \`claude-opus-4-6\`              |
| "opus 4.5"                                | \`claude-opus-4-5\`              |
| "opus 4.1"                                | \`claude-opus-4-1\`              |
| "opus 4", "opus 4.0"                      | \`claude-opus-4-0\`              |
| "sonnet", "balanced"                      | \`claude-sonnet-4-6\`            |
| "sonnet 4.6"                              | \`claude-sonnet-4-6\`            |
| "sonnet 4.5"                              | \`claude-sonnet-4-5\`            |
| "sonnet 4", "sonnet 4.0"                  | \`claude-sonnet-4-0\`            |
| "sonnet 3.7"                              | Retired \u2014 suggest \`claude-sonnet-4-5\` |
| "sonnet 3.5"                              | Retired \u2014 suggest \`claude-sonnet-4-5\` |
| "haiku", "fast", "cheap"                  | \`claude-haiku-4-5\`             |
| "haiku 4.5"                               | \`claude-haiku-4-5\`             |
| "haiku 3.5"                               | Retired \u2014 suggest \`claude-haiku-4-5\` |
| "haiku 3"                                 | Deprecated \u2014 suggest \`claude-haiku-4-5\` |

---

# Prompt Caching \u2014 Design & Optimization

This file covers how to design prompt-building code for effective caching. For language-specific syntax, see the \`## Prompt Caching\` section in each language's README or single-file doc.

## The one invariant everything follows from

**Prompt caching is a prefix match. Any change anywhere in the prefix invalidates everything after it.**

The cache key is derived from the exact bytes of the rendered prompt up to each \`cache_control\` breakpoint. A single byte difference at position N \u2014 a timestamp, a reordered JSON key, a different tool in the list \u2014 invalidates the cache for all breakpoints at positions >= N.

Render order is: \`tools\` \u2192 \`system\` \u2192 \`messages\`. A breakpoint on the last system block caches both tools and system together.

Design the prompt-building path around this constraint. Get the ordering right and most caching works for free. Get it wrong and no amount of \`cache_control\` markers will help.

---

## Workflow for optimizing existing code

When asked to add or optimize caching:

1. **Trace the prompt assembly path.** Find where \`system\`, \`tools\`, and \`messages\` are constructed. Identify every input that flows into them.
2. **Classify each input by stability:**
   - Never changes \u2192 belongs early in the prompt, before any breakpoint
   - Changes per-session \u2192 belongs after the global prefix, cache per-session
   - Changes per-turn \u2192 belongs at the end, after the last breakpoint
   - Changes per-request (timestamps, UUIDs, random IDs) \u2192 **eliminate or move to the very end**
3. **Check rendered order matches stability order.** Stable content must physically precede volatile content. If a timestamp is interpolated into the system prompt header, everything after it is uncacheable regardless of markers.
4. **Place breakpoints at stability boundaries.** See placement patterns below.
5. **Audit for silent invalidators.** See anti-patterns table.

---

## Placement patterns

### Large system prompt shared across many requests

Put a breakpoint on the last system text block. If there are tools, they render before system \u2014 the marker on the last system block caches tools + system together.

\`\`\`json
"system": [
  {"type": "text", "text": "<large shared prompt>", "cache_control": {"type": "ephemeral"}}
]
\`\`\`

### Multi-turn conversations

Put a breakpoint on the last content block of the most-recently-appended turn. Each subsequent request reuses the entire prior conversation prefix. Earlier breakpoints remain valid read points, so hits accrue incrementally as the conversation grows.

\`\`\`json
// Last content block of the last user turn
messages[-1].content[-1].cache_control = {"type": "ephemeral"}
\`\`\`

### Shared prefix, varying suffix

Many requests share a large fixed preamble (few-shot examples, retrieved docs, instructions) but differ in the final question. Put the breakpoint at the end of the **shared** portion, not at the end of the whole prompt \u2014 otherwise every request writes a distinct cache entry and nothing is ever read.

\`\`\`json
"messages": [{"role": "user", "content": [
  {"type": "text", "text": "<shared context>", "cache_control": {"type": "ephemeral"}},
  {"type": "text", "text": "<varying question>"}  // no marker \u2014 differs every time
]}]
\`\`\`

### Prompts that change from the beginning every time

Don't cache. If the first 1K tokens differ per request, there is no reusable prefix. Adding \`cache_control\` only pays the cache-write premium with zero reads. Leave it off.

---

## Architectural guidance

These are the decisions that matter more than marker placement. Fix these first.

**Keep the system prompt frozen.** Don't interpolate "current date: X", "mode: Y", "user name: Z" into the system prompt \u2014 those sit at the front of the prefix and invalidate everything downstream. Inject dynamic context as a user or assistant message later in \`messages\`. A message at turn 5 invalidates nothing before turn 5.

**Don't change tools or model mid-conversation.** Tools render at position 0; adding, removing, or reordering a tool invalidates the entire cache. Same for switching models (caches are model-scoped). If you need "modes", don't swap the tool set \u2014 give Claude a tool that records the mode transition, or pass the mode as message content. Serialize tools deterministically (sort by name).

**Fork operations must reuse the parent's exact prefix.** Side computations (summarization, compaction, sub-agents) often spin up a separate API call. If the fork rebuilds \`system\` / \`tools\` / \`model\` with any difference, it misses the parent's cache entirely. Copy the parent's \`system\`, \`tools\`, and \`model\` verbatim, then append fork-specific content at the end.

---

## Silent invalidators

When reviewing code, grep for these inside anything that feeds the prompt prefix:

| Pattern | Why it breaks caching |
|---|---|
| \`datetime.now()\` / \`Date.now()\` / \`time.time()\` in system prompt | Prefix changes every request |
| \`uuid4()\` / \`crypto.randomUUID()\` / request IDs early in content | Same \u2014 every request is unique |
| \`json.dumps(d)\` without \`sort_keys=True\` / iterating a \`set\` | Non-deterministic serialization \u2192 prefix bytes differ |
| f-string interpolating session/user ID into system prompt | Per-user prefix; no cross-user sharing |
| Conditional system sections (\`if flag: system += ...\`) | Every flag combination is a distinct prefix |
| \`tools=build_tools(user)\` where set varies per user | Tools render at position 0; nothing caches across users |

Fix by moving the dynamic piece after the last breakpoint, making it deterministic, or deleting it if it's not load-bearing.

---

## API reference

\`\`\`json
"cache_control": {"type": "ephemeral"}              // 5-minute TTL (default)
"cache_control": {"type": "ephemeral", "ttl": "1h"} // 1-hour TTL
\`\`\`

- Max **4** \`cache_control\` breakpoints per request.
- Goes on any content block: system text blocks, tool definitions, message content blocks (\`text\`, \`image\`, \`tool_use\`, \`tool_result\`, \`document\`).
- Top-level \`cache_control\` on \`messages.create()\` auto-places on the last cacheable block \u2014 simplest option when you don't need fine-grained placement.
- Minimum cacheable prefix is model-dependent (typically 1024-2048 tokens). Shorter prefixes silently won't cache even with a marker.

**Economics:** Cache writes cost ~1.25x base input price; reads cost ~0.1x. A prefix must be used in at least two requests within TTL to break even (one writes the cache, subsequent ones read it). For bursty traffic, the 1-hour TTL keeps entries alive across gaps.

---

## Verifying cache hits

The response \`usage\` object reports cache activity:

| Field | Meaning |
|---|---|
| \`cache_creation_input_tokens\` | Tokens written to cache this request (you paid the ~1.25x write premium) |
| \`cache_read_input_tokens\` | Tokens served from cache this request (you paid ~0.1x) |
| \`input_tokens\` | Tokens processed at full price (not cached) |

If \`cache_read_input_tokens\` is zero across repeated requests with identical prefixes, a silent invalidator is at work \u2014 diff the rendered prompt bytes between two requests to find it.

Language-specific access: \`response.usage.cache_read_input_tokens\` (Python/TS/Ruby), \`$message->usage->cacheReadInputTokens\` (PHP), \`resp.Usage.CacheReadInputTokens\` (Go/C#), \`.usage().cacheReadInputTokens()\` (Java).

---

# Tool Use Concepts

This file covers the conceptual foundations of tool use with the Claude API. For language-specific code examples, see the \`python/\`, \`typescript/\`, or other language folders.

## User-Defined Tools

### Tool Definition Structure

> **Note:** When using the Tool Runner (beta), tool schemas are generated automatically from your function signatures (Python), Zod schemas (TypeScript), annotated classes (Java), \`jsonschema\` struct tags (Go), or \`BaseTool\` subclasses (Ruby). The raw JSON schema format below is for the manual approach \u2014 including PHP's \`BetaRunnableTool\`, which wraps a run closure around a hand-written schema \u2014 or SDKs without tool runner support.

Each tool requires a name, description, and JSON Schema for its inputs:

\`\`\`json
{
  "name": "get_weather",
  "description": "Get current weather for a location",
  "input_schema": {
    "type": "object",
    "properties": {
      "location": {
        "type": "string",
        "description": "City and state, e.g., San Francisco, CA"
      },
      "unit": {
        "type": "string",
        "enum": ["celsius", "fahrenheit"],
        "description": "Temperature unit"
      }
    },
    "required": ["location"]
  }
}
\`\`\`

**Best practices for tool definitions:**

- Use clear, descriptive names (e.g., \`get_weather\`, \`search_database\`, \`send_email\`)
- Write detailed descriptions \u2014 Claude uses these to decide when to use the tool
- Include descriptions for each property
- Use \`enum\` for parameters with a fixed set of values
- Mark truly required parameters in \`required\`; make others optional with defaults

---

### Tool Choice Options

Control when Claude uses tools:

| Value                             | Behavior                                      |
| --------------------------------- | --------------------------------------------- |
| \`{"type": "auto"}\`                | Claude decides whether to use tools (default) |
| \`{"type": "any"}\`                 | Claude must use at least one tool             |
| \`{"type": "tool", "name": "..."}\` | Claude must use the specified tool            |
| \`{"type": "none"}\`                | Claude cannot use tools                       |

Any \`tool_choice\` value can also include \`"disable_parallel_tool_use": true\` to force Claude to use at most one tool per response. By default, Claude may request multiple tool calls in a single response.

---

### Tool Runner vs Manual Loop

**Tool Runner (Recommended):** The SDK's tool runner handles the agentic loop automatically \u2014 it calls the API, detects tool use requests, executes your tool functions, feeds results back to Claude, and repeats until Claude stops calling tools. Available in Python, TypeScript, Java, Go, Ruby, and PHP SDKs (beta). The Python SDK also provides MCP conversion helpers (\`anthropic.lib.tools.mcp\`) to convert MCP tools, prompts, and resources for use with the tool runner \u2014 see \`python/claude-api/tool-use.md\` for details.

**Manual Agentic Loop:** Use when you need fine-grained control over the loop (e.g., custom logging, conditional tool execution, human-in-the-loop approval). Loop until \`stop_reason == "end_turn"\`, always append the full \`response.content\` to preserve tool_use blocks, and ensure each \`tool_result\` includes the matching \`tool_use_id\`.

**Stop reasons for server-side tools:** When using server-side tools (code execution, web search, etc.), the API runs a server-side sampling loop. If this loop reaches its default limit of 10 iterations, the response will have \`stop_reason: "pause_turn"\`. To continue, re-send the user message and assistant response and make another API request \u2014 the server will resume where it left off. Do NOT add an extra user message like "Continue." \u2014 the API detects the trailing \`server_tool_use\` block and knows to resume automatically.

\`\`\`python
# Handle pause_turn in your agentic loop
if response.stop_reason == "pause_turn":
    messages = [
        {"role": "user", "content": user_query},
        {"role": "assistant", "content": response.content},
    ]
    # Make another API request \u2014 server resumes automatically
    response = client.messages.create(
        model="claude-opus-4-6", messages=messages, tools=tools
    )
\`\`\`

Set a \`max_continuations\` limit (e.g., 5) to prevent infinite loops. For the full guide, see: \`https://platform.claude.com/docs/en/build-with-claude/handling-stop-reasons\`

> **Security:** The tool runner executes your tool functions automatically whenever Claude requests them. For tools with side effects (sending emails, modifying databases, financial transactions), validate inputs within your tool functions and consider requiring confirmation for destructive operations. Use the manual agentic loop if you need human-in-the-loop approval before each tool execution.

---

### Handling Tool Results

When Claude uses a tool, the response contains a \`tool_use\` block. You must:

1. Execute the tool with the provided input
2. Send the result back in a \`tool_result\` message
3. Continue the conversation

**Error handling in tool results:** When a tool execution fails, set \`"is_error": true\` and provide an informative error message. Claude will typically acknowledge the error and either try a different approach or ask for clarification.

**Multiple tool calls:** Claude can request multiple tools in a single response. Handle them all before continuing \u2014 send all results back in a single \`user\` message.

---

## Server-Side Tools: Code Execution

The code execution tool lets Claude run code in a secure, sandboxed container. Unlike user-defined tools, server-side tools run on Anthropic's infrastructure \u2014 you don't execute anything client-side. Just include the tool definition and Claude handles the rest.

### Key Facts

- Runs in an isolated container (1 CPU, 5 GiB RAM, 5 GiB disk)
- No internet access (fully sandboxed)
- Python 3.11 with data science libraries pre-installed
- Containers persist for 30 days and can be reused across requests
- Free when used with web search/web fetch tools; otherwise $0.05/hour after 1,550 free hours/month per organization

### Tool Definition

The tool requires no schema \u2014 just declare it in the \`tools\` array:

\`\`\`json
{
  "type": "code_execution_20260120",
  "name": "code_execution"
}
\`\`\`

Claude automatically gains access to \`bash_code_execution\` (run shell commands) and \`text_editor_code_execution\` (create/view/edit files).

### Pre-installed Python Libraries

- **Data science**: pandas, numpy, scipy, scikit-learn, statsmodels
- **Visualization**: matplotlib, seaborn
- **File processing**: openpyxl, xlsxwriter, pillow, pypdf, pdfplumber, python-docx, python-pptx
- **Math**: sympy, mpmath
- **Utilities**: tqdm, python-dateutil, pytz, sqlite3

Additional packages can be installed at runtime via \`pip install\`.

### Supported File Types for Upload

| Type   | Extensions                         |
| ------ | ---------------------------------- |
| Data   | CSV, Excel (.xlsx/.xls), JSON, XML |
| Images | JPEG, PNG, GIF, WebP               |
| Text   | .txt, .md, .py, .js, etc.          |

### Container Reuse

Reuse containers across requests to maintain state (files, installed packages, variables). Extract the \`container_id\` from the first response and pass it to subsequent requests.

### Response Structure

The response contains interleaved text and tool result blocks:

- \`text\` \u2014 Claude's explanation
- \`server_tool_use\` \u2014 What Claude is doing
- \`bash_code_execution_tool_result\` \u2014 Code execution output (check \`return_code\` for success/failure)
- \`text_editor_code_execution_tool_result\` \u2014 File operation results

> **Security:** Always sanitize filenames with \`os.path.basename()\` / \`path.basename()\` before writing downloaded files to disk to prevent path traversal attacks. Write files to a dedicated output directory.

---

## Server-Side Tools: Web Search and Web Fetch

Web search and web fetch let Claude search the web and retrieve page content. They run server-side \u2014 just include the tool definitions and Claude handles queries, fetching, and result processing automatically.

### Tool Definitions

\`\`\`json
[
  { "type": "web_search_20260209", "name": "web_search" },
  { "type": "web_fetch_20260209", "name": "web_fetch" }
]
\`\`\`

### Dynamic Filtering (Opus 4.6 / Sonnet 4.6)

The \`web_search_20260209\` and \`web_fetch_20260209\` versions support **dynamic filtering** \u2014 Claude writes and executes code to filter search results before they reach the context window, improving accuracy and token efficiency. Dynamic filtering is built into these tool versions and activates automatically; you do not need to separately declare the \`code_execution\` tool or pass any beta header.

\`\`\`json
{
  "tools": [
    { "type": "web_search_20260209", "name": "web_search" },
    { "type": "web_fetch_20260209", "name": "web_fetch" }
  ]
}
\`\`\`

Without dynamic filtering, the previous \`web_search_20250305\` version is also available.

> **Note:** Only include the standalone \`code_execution\` tool when your application needs code execution for its own purposes (data analysis, file processing, visualization) independent of web search. Including it alongside \`_20260209\` web tools creates a second execution environment that can confuse the model.

---

## Server-Side Tools: Programmatic Tool Calling

Programmatic tool calling lets Claude execute complex multi-tool workflows in code, keeping intermediate results out of the context window. Claude writes code that calls your tools directly, reducing token usage for multi-step operations.

For full documentation, use WebFetch:

- URL: \`https://platform.claude.com/docs/en/agents-and-tools/tool-use/programmatic-tool-calling\`

---

## Server-Side Tools: Tool Search

The tool search tool lets Claude dynamically discover tools from large libraries without loading all definitions into the context window. Useful when you have many tools but only a few are relevant to any given query.

For full documentation, use WebFetch:

- URL: \`https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool\`

---

## Tool Use Examples

You can provide sample tool calls directly in your tool definitions to demonstrate usage patterns and reduce parameter errors. This helps Claude understand how to correctly format tool inputs, especially for tools with complex schemas.

For full documentation, use WebFetch:

- URL: \`https://platform.claude.com/docs/en/agents-and-tools/tool-use/implement-tool-use\`

---

## Server-Side Tools: Computer Use

Computer use lets Claude interact with a desktop environment (screenshots, mouse, keyboard). It can be Anthropic-hosted (server-side, like code execution) or self-hosted (you provide the environment and execute actions client-side).

For full documentation, use WebFetch:

- URL: \`https://platform.claude.com/docs/en/agents-and-tools/computer-use/overview\`

---

## Client-Side Tools: Memory

The memory tool enables Claude to store and retrieve information across conversations through a memory file directory. Claude can create, read, update, and delete files that persist between sessions.

### Key Facts

- Client-side tool \u2014 you control storage via your implementation
- Supports commands: \`view\`, \`create\`, \`str_replace\`, \`insert\`, \`delete\`, \`rename\`
- Operates on files in a \`/memories\` directory
- The Python, TypeScript, and Java SDKs provide helper classes/functions for implementing the memory backend

> **Security:** Never store API keys, passwords, tokens, or other secrets in memory files. Be cautious with personally identifiable information (PII) \u2014 check data privacy regulations (GDPR, CCPA) before persisting user data. The reference implementations have no built-in access control; in multi-user systems, implement per-user memory directories and authentication in your tool handlers.

For full implementation examples, use WebFetch:

- Docs: \`https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool.md\`

---

## Structured Outputs

Structured outputs constrain Claude's responses to follow a specific JSON schema, guaranteeing valid, parseable output. This is not a separate tool \u2014 it enhances the Messages API response format and/or tool parameter validation.

Two features are available:

- **JSON outputs** (\`output_config.format\`): Control Claude's response format
- **Strict tool use** (\`strict: true\`): Guarantee valid tool parameter schemas

**Supported models:** Claude Opus 4.6, Claude Sonnet 4.6, and Claude Haiku 4.5. Legacy models (Claude Opus 4.5, Claude Opus 4.1) also support structured outputs.

> **Recommended:** Use \`client.messages.parse()\` which automatically validates responses against your schema. When using \`messages.create()\` directly, use \`output_config: {format: {...}}\`. The \`output_format\` convenience parameter is also accepted by some SDK methods (e.g., \`.parse()\`), but \`output_config.format\` is the canonical API-level parameter.

### JSON Schema Limitations

**Supported:**

- Basic types: object, array, string, integer, number, boolean, null
- \`enum\`, \`const\`, \`anyOf\`, \`allOf\`, \`$ref\`/\`$def\`
- String formats: \`date-time\`, \`time\`, \`date\`, \`duration\`, \`email\`, \`hostname\`, \`uri\`, \`ipv4\`, \`ipv6\`, \`uuid\`
- \`additionalProperties: false\` (required for all objects)

**Not supported:**

- Recursive schemas
- Numerical constraints (\`minimum\`, \`maximum\`, \`multipleOf\`)
- String constraints (\`minLength\`, \`maxLength\`)
- Complex array constraints
- \`additionalProperties\` set to anything other than \`false\`

The Python and TypeScript SDKs automatically handle unsupported constraints by removing them from the schema sent to the API and validating them client-side.

### Important Notes

- **First request latency**: New schemas incur a one-time compilation cost. Subsequent requests with the same schema use a 24-hour cache.
- **Refusals**: If Claude refuses for safety reasons (\`stop_reason: "refusal"\`), the output may not match your schema.
- **Token limits**: If \`stop_reason: "max_tokens"\`, output may be incomplete. Increase \`max_tokens\`.
- **Incompatible with**: Citations (returns 400 error), message prefilling.
- **Works with**: Batches API, streaming, token counting, extended thinking.

---

## Tips for Effective Tool Use

1. **Provide detailed descriptions**: Claude relies heavily on descriptions to understand when and how to use tools
2. **Use specific tool names**: \`get_current_weather\` is better than \`weather\`
3. **Validate inputs**: Always validate tool inputs before execution
4. **Handle errors gracefully**: Return informative error messages so Claude can adapt
5. **Limit tool count**: Too many tools can confuse the model \u2014 keep the set focused
6. **Test tool interactions**: Verify Claude uses tools correctly in various scenarios

For detailed tool use documentation, use WebFetch:

- URL: \`https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview\`
`},{path:"skills/claude-api/skill.md",content:'---\nname: claude-api\ndescription: "Build apps with Claude API and Anthropic SDKs. Trigger when code imports anthropic SDK or user asks to use Claude API."\ntags:\n  - api\n  - sdk\n  - anthropic\n  - claude\n  - llm\n  - ai\n  - agent\n---\n\n# Building LLM-Powered Applications with Claude\n\nThis skill helps you build LLM-powered applications with Claude. Choose the right surface based on your needs, detect the project language, then read the relevant language-specific documentation.\n\n## Defaults\n\nUnless the user requests otherwise:\n\nFor the Claude model version, please use Claude Opus 4.6, which you can access via the exact model string `claude-opus-4-6`. Please default to using adaptive thinking (`thinking: {type: "adaptive"}`) for anything remotely complicated. And finally, please default to streaming for any request that may involve long input, long output, or high `max_tokens` \u2014 it prevents hitting request timeouts. Use the SDK\'s `.get_final_message()` / `.finalMessage()` helper to get the complete response if you don\'t need to handle individual stream events\n\n---\n\n## Language Detection\n\nBefore reading code examples, determine which language the user is working in:\n\n1. **Look at project files** to infer the language:\n\n   - `*.py`, `requirements.txt`, `pyproject.toml`, `setup.py`, `Pipfile` \u2192 **Python** \u2014 read from `python/`\n   - `*.ts`, `*.tsx`, `package.json`, `tsconfig.json` \u2192 **TypeScript** \u2014 read from `typescript/`\n   - `*.js`, `*.jsx` (no `.ts` files present) \u2192 **TypeScript** \u2014 JS uses the same SDK, read from `typescript/`\n   - `*.java`, `pom.xml`, `build.gradle` \u2192 **Java** \u2014 read from `java/`\n   - `*.kt`, `*.kts`, `build.gradle.kts` \u2192 **Java** \u2014 Kotlin uses the Java SDK, read from `java/`\n   - `*.scala`, `build.sbt` \u2192 **Java** \u2014 Scala uses the Java SDK, read from `java/`\n   - `*.go`, `go.mod` \u2192 **Go** \u2014 read from `go/`\n   - `*.rb`, `Gemfile` \u2192 **Ruby** \u2014 read from `ruby/`\n   - `*.cs`, `*.csproj` \u2192 **C#** \u2014 read from `csharp/`\n   - `*.php`, `composer.json` \u2192 **PHP** \u2014 read from `php/`\n\n2. **If multiple languages detected** (e.g., both Python and TypeScript files):\n\n   - Check which language the user\'s current file or question relates to\n   - If still ambiguous, ask: "I detected both Python and TypeScript files. Which language are you using for the Claude API integration?"\n\n3. **If language can\'t be inferred** (empty project, no source files, or unsupported language):\n\n   - Use AskUserQuestion with options: Python, TypeScript, Java, Go, Ruby, cURL/raw HTTP, C#, PHP\n   - If AskUserQuestion is unavailable, default to Python examples and note: "Showing Python examples. Let me know if you need a different language."\n\n4. **If unsupported language detected** (Rust, Swift, C++, Elixir, etc.):\n\n   - Suggest cURL/raw HTTP examples from `curl/` and note that community SDKs may exist\n   - Offer to show Python or TypeScript examples as reference implementations\n\n5. **If user needs cURL/raw HTTP examples**, read from `curl/`.\n\n### Language-Specific Feature Support\n\n| Language   | Tool Runner | Agent SDK | Notes                                 |\n| ---------- | ----------- | --------- | ------------------------------------- |\n| Python     | Yes (beta)  | Yes       | Full support \u2014 `@beta_tool` decorator |\n| TypeScript | Yes (beta)  | Yes       | Full support \u2014 `betaZodTool` + Zod    |\n| Java       | Yes (beta)  | No        | Beta tool use with annotated classes  |\n| Go         | Yes (beta)  | No        | `BetaToolRunner` in `toolrunner` pkg  |\n| Ruby       | Yes (beta)  | No        | `BaseTool` + `tool_runner` in beta    |\n| cURL       | N/A         | N/A       | Raw HTTP, no SDK features             |\n| C#         | No          | No        | Official SDK                          |\n| PHP        | Yes (beta)  | No        | `BetaRunnableTool` + `toolRunner()`   |\n\n---\n\n## Which Surface Should I Use?\n\n> **Start simple.** Default to the simplest tier that meets your needs. Single API calls and workflows handle most use cases \u2014 only reach for agents when the task genuinely requires open-ended, model-driven exploration.\n\n| Use Case                                        | Tier            | Recommended Surface       | Why                                     |\n| ----------------------------------------------- | --------------- | ------------------------- | --------------------------------------- |\n| Classification, summarization, extraction, Q&A  | Single LLM call | **Claude API**            | One request, one response               |\n| Batch processing or embeddings                  | Single LLM call | **Claude API**            | Specialized endpoints                   |\n| Multi-step pipelines with code-controlled logic | Workflow        | **Claude API + tool use** | You orchestrate the loop                |\n| Custom agent with your own tools                | Agent           | **Claude API + tool use** | Maximum flexibility                     |\n| AI agent with file/web/terminal access          | Agent           | **Agent SDK**             | Built-in tools, safety, and MCP support |\n| Agentic coding assistant                        | Agent           | **Agent SDK**             | Designed for this use case              |\n| Want built-in permissions and guardrails        | Agent           | **Agent SDK**             | Safety features included                |\n\n> **Note:** The Agent SDK is for when you want built-in file/web/terminal tools, permissions, and MCP out of the box. If you want to build an agent with your own tools, Claude API is the right choice \u2014 use the tool runner for automatic loop handling, or the manual loop for fine-grained control (approval gates, custom logging, conditional execution).\n\n### Decision Tree\n\n```\nWhat does your application need?\n\n1. Single LLM call (classification, summarization, extraction, Q&A)\n   \u2514\u2500\u2500 Claude API \u2014 one request, one response\n\n2. Does Claude need to read/write files, browse the web, or run shell commands\n   as part of its work? (Not: does your app read a file and hand it to Claude \u2014\n   does Claude itself need to discover and access files/web/shell?)\n   \u2514\u2500\u2500 Yes \u2192 Agent SDK \u2014 built-in tools, don\'t reimplement them\n       Examples: "scan a codebase for bugs", "summarize every file in a directory",\n                 "find bugs using subagents", "research a topic via web search"\n\n3. Workflow (multi-step, code-orchestrated, with your own tools)\n   \u2514\u2500\u2500 Claude API with tool use \u2014 you control the loop\n\n4. Open-ended agent (model decides its own trajectory, your own tools)\n   \u2514\u2500\u2500 Claude API agentic loop (maximum flexibility)\n```\n\n### Should I Build an Agent?\n\nBefore choosing the agent tier, check all four criteria:\n\n- **Complexity** \u2014 Is the task multi-step and hard to fully specify in advance? (e.g., "turn this design doc into a PR" vs. "extract the title from this PDF")\n- **Value** \u2014 Does the outcome justify higher cost and latency?\n- **Viability** \u2014 Is Claude capable at this task type?\n- **Cost of error** \u2014 Can errors be caught and recovered from? (tests, review, rollback)\n\nIf the answer is "no" to any of these, stay at a simpler tier (single call or workflow).\n\n---\n\n## Architecture\n\nEverything goes through `POST /v1/messages`. Tools and output constraints are features of this single endpoint \u2014 not separate APIs.\n\n**User-defined tools** \u2014 You define tools (via decorators, Zod schemas, or raw JSON), and the SDK\'s tool runner handles calling the API, executing your functions, and looping until Claude is done. For full control, you can write the loop manually.\n\n**Server-side tools** \u2014 Anthropic-hosted tools that run on Anthropic\'s infrastructure. Code execution is fully server-side (declare it in `tools`, Claude runs code automatically). Computer use can be server-hosted or self-hosted.\n\n**Structured outputs** \u2014 Constrains the Messages API response format (`output_config.format`) and/or tool parameter validation (`strict: true`). The recommended approach is `client.messages.parse()` which validates responses against your schema automatically. Note: the old `output_format` parameter is deprecated; use `output_config: {format: {...}}` on `messages.create()`.\n\n**Supporting endpoints** \u2014 Batches (`POST /v1/messages/batches`), Files (`POST /v1/files`), Token Counting, and Models (`GET /v1/models`, `GET /v1/models/{id}` \u2014 live capability/context-window discovery) feed into or support Messages API requests.\n\n---\n\n## Current Models (cached: 2026-02-17)\n\n| Model             | Model ID            | Context        | Input $/1M | Output $/1M |\n| ----------------- | ------------------- | -------------- | ---------- | ----------- |\n| Claude Opus 4.6   | `claude-opus-4-6`   | 200K (1M beta) | $5.00      | $25.00      |\n| Claude Sonnet 4.6 | `claude-sonnet-4-6` | 200K (1M beta) | $3.00      | $15.00      |\n| Claude Haiku 4.5  | `claude-haiku-4-5`  | 200K           | $1.00      | $5.00       |\n\n**ALWAYS use `claude-opus-4-6` unless the user explicitly names a different model.** This is non-negotiable. Do not use `claude-sonnet-4-6`, `claude-sonnet-4-5`, or any other model unless the user literally says "use sonnet" or "use haiku". Never downgrade for cost \u2014 that\'s the user\'s decision, not yours.\n\n**CRITICAL: Use only the exact model ID strings from the table above \u2014 they are complete as-is. Do not append date suffixes.** For example, use `claude-sonnet-4-5`, never `claude-sonnet-4-5-20250514` or any other date-suffixed variant you might recall from training data. If the user requests an older model not in the table (e.g., "opus 4.5", "sonnet 3.7"), read `shared/models.md` for the exact ID \u2014 do not construct one yourself.\n\nA note: if any of the model strings above look unfamiliar to you, that\'s to be expected \u2014 that just means they were released after your training data cutoff. Rest assured they are real models; we wouldn\'t mess with you like that.\n\n**Live capability lookup:** The table above is cached. When the user asks "what\'s the context window for X", "does X support vision/thinking/effort", or "which models support Y", query the Models API (`client.models.retrieve(id)` / `client.models.list()`) \u2014 see `shared/models.md` for the field reference and capability-filter examples.\n\n---\n\n## Thinking & Effort (Quick Reference)\n\n**Opus 4.6 \u2014 Adaptive thinking (recommended):** Use `thinking: {type: "adaptive"}`. Claude dynamically decides when and how much to think. No `budget_tokens` needed \u2014 `budget_tokens` is deprecated on Opus 4.6 and Sonnet 4.6 and must not be used. Adaptive thinking also automatically enables interleaved thinking (no beta header needed). **When the user asks for "extended thinking", a "thinking budget", or `budget_tokens`: always use Opus 4.6 with `thinking: {type: "adaptive"}`. The concept of a fixed token budget for thinking is deprecated \u2014 adaptive thinking replaces it. Do NOT use `budget_tokens` and do NOT switch to an older model.**\n\n**Effort parameter (GA, no beta header):** Controls thinking depth and overall token spend via `output_config: {effort: "low"|"medium"|"high"|"max"}` (inside `output_config`, not top-level). Default is `high` (equivalent to omitting it). `max` is Opus 4.6 only. Works on Opus 4.5, Opus 4.6, and Sonnet 4.6. Will error on Sonnet 4.5 / Haiku 4.5. Combine with adaptive thinking for the best cost-quality tradeoffs. Use `low` for subagents or simple tasks; `max` for the deepest reasoning.\n\n**Sonnet 4.6:** Supports adaptive thinking (`thinking: {type: "adaptive"}`). `budget_tokens` is deprecated on Sonnet 4.6 \u2014 use adaptive thinking instead.\n\n**Older models (only if explicitly requested):** If the user specifically asks for Sonnet 4.5 or another older model, use `thinking: {type: "enabled", budget_tokens: N}`. `budget_tokens` must be less than `max_tokens` (minimum 1024). Never choose an older model just because the user mentions `budget_tokens` \u2014 use Opus 4.6 with adaptive thinking instead.\n\n---\n\n## Compaction (Quick Reference)\n\n**Beta, Opus 4.6 and Sonnet 4.6.** For long-running conversations that may exceed the 200K context window, enable server-side compaction. The API automatically summarizes earlier context when it approaches the trigger threshold (default: 150K tokens). Requires beta header `compact-2026-01-12`.\n\n**Critical:** Append `response.content` (not just the text) back to your messages on every turn. Compaction blocks in the response must be preserved \u2014 the API uses them to replace the compacted history on the next request. Extracting only the text string and appending that will silently lose the compaction state.\n\nSee `{lang}/claude-api/README.md` (Compaction section) for code examples. Full docs via WebFetch in `shared/live-sources.md`.\n\n---\n\n## Prompt Caching (Quick Reference)\n\n**Prefix match.** Any byte change anywhere in the prefix invalidates everything after it. Render order is `tools` \u2192 `system` \u2192 `messages`. Keep stable content first (frozen system prompt, deterministic tool list), put volatile content (timestamps, per-request IDs, varying questions) after the last `cache_control` breakpoint.\n\n**Top-level auto-caching** (`cache_control: {type: "ephemeral"}` on `messages.create()`) is the simplest option when you don\'t need fine-grained placement. Max 4 breakpoints per request. Minimum cacheable prefix is ~1024 tokens \u2014 shorter prefixes silently won\'t cache.\n\n**Verify with `usage.cache_read_input_tokens`** \u2014 if it\'s zero across repeated requests, a silent invalidator is at work (`datetime.now()` in system prompt, unsorted JSON, varying tool set).\n\nFor placement patterns, architectural guidance, and the silent-invalidator audit checklist: read `shared/prompt-caching.md`. Language-specific syntax: `{lang}/claude-api/README.md` (Prompt Caching section).\n\n---\n\n## Reading Guide\n\nAfter detecting the language, read the relevant files based on what the user needs:\n\n### Quick Task Reference\n\n**Single text classification/summarization/extraction/Q&A:**\n\u2192 Read only `{lang}/claude-api/README.md`\n\n**Chat UI or real-time response display:**\n\u2192 Read `{lang}/claude-api/README.md` + `{lang}/claude-api/streaming.md`\n\n**Long-running conversations (may exceed context window):**\n\u2192 Read `{lang}/claude-api/README.md` \u2014 see Compaction section\n\n**Prompt caching / optimize caching / "why is my cache hit rate low":**\n\u2192 Read `shared/prompt-caching.md` + `{lang}/claude-api/README.md` (Prompt Caching section)\n\n**Function calling / tool use / agents:**\n\u2192 Read `{lang}/claude-api/README.md` + `shared/tool-use-concepts.md` + `{lang}/claude-api/tool-use.md`\n\n**Batch processing (non-latency-sensitive):**\n\u2192 Read `{lang}/claude-api/README.md` + `{lang}/claude-api/batches.md`\n\n**File uploads across multiple requests:**\n\u2192 Read `{lang}/claude-api/README.md` + `{lang}/claude-api/files-api.md`\n\n**Agent with built-in tools (file/web/terminal):**\n\u2192 Read `{lang}/agent-sdk/README.md` + `{lang}/agent-sdk/patterns.md`\n\n### Claude API (Full File Reference)\n\nRead the **language-specific Claude API folder** (`{language}/claude-api/`):\n\n1. **`{language}/claude-api/README.md`** \u2014 **Read this first.** Installation, quick start, common patterns, error handling.\n2. **`shared/tool-use-concepts.md`** \u2014 Read when the user needs function calling, code execution, memory, or structured outputs. Covers conceptual foundations.\n3. **`{language}/claude-api/tool-use.md`** \u2014 Read for language-specific tool use code examples (tool runner, manual loop, code execution, memory, structured outputs).\n4. **`{language}/claude-api/streaming.md`** \u2014 Read when building chat UIs or interfaces that display responses incrementally.\n5. **`{language}/claude-api/batches.md`** \u2014 Read when processing many requests offline (not latency-sensitive). Runs asynchronously at 50% cost.\n6. **`{language}/claude-api/files-api.md`** \u2014 Read when sending the same file across multiple requests without re-uploading.\n7. **`shared/prompt-caching.md`** \u2014 Read when adding or optimizing prompt caching. Covers prefix-stability design, breakpoint placement, and anti-patterns that silently invalidate cache.\n8. **`shared/error-codes.md`** \u2014 Read when debugging HTTP errors or implementing error handling.\n9. **`shared/live-sources.md`** \u2014 WebFetch URLs for fetching the latest official documentation.\n\n> **Note:** For Java, Go, Ruby, C#, PHP, and cURL \u2014 these have a single file each covering all basics. Read that file plus `shared/tool-use-concepts.md` and `shared/error-codes.md` as needed.\n\n### Agent SDK\n\nRead the **language-specific Agent SDK folder** (`{language}/agent-sdk/`). Agent SDK is available for **Python and TypeScript only**.\n\n1. **`{language}/agent-sdk/README.md`** \u2014 Installation, quick start, built-in tools, permissions, MCP, hooks.\n2. **`{language}/agent-sdk/patterns.md`** \u2014 Custom tools, hooks, subagents, MCP integration, session resumption.\n3. **`shared/live-sources.md`** \u2014 WebFetch URLs for current Agent SDK docs.\n\n---\n\n## When to Use WebFetch\n\nUse WebFetch to get the latest documentation when:\n\n- User asks for "latest" or "current" information\n- Cached data seems incorrect\n- User asks about features not covered here\n\nLive documentation URLs are in `shared/live-sources.md`.\n\n## Common Pitfalls\n\n- Don\'t truncate inputs when passing files or content to the API. If the content is too long to fit in the context window, notify the user and discuss options (chunking, summarization, etc.) rather than silently truncating.\n- **Opus 4.6 / Sonnet 4.6 thinking:** Use `thinking: {type: "adaptive"}` \u2014 do NOT use `budget_tokens` (deprecated on both Opus 4.6 and Sonnet 4.6). For older models, `budget_tokens` must be less than `max_tokens` (minimum 1024). This will throw an error if you get it wrong.\n- **Opus 4.6 prefill removed:** Assistant message prefills (last-assistant-turn prefills) return a 400 error on Opus 4.6. Use structured outputs (`output_config.format`) or system prompt instructions to control response format instead.\n- **`max_tokens` defaults:** Don\'t lowball `max_tokens` \u2014 hitting the cap truncates output mid-thought and requires a retry. For non-streaming requests, default to `~16000` (keeps responses under SDK HTTP timeouts). For streaming requests, default to `~64000` (timeouts aren\'t a concern, so give the model room). Only go lower when you have a hard reason: classification (`~256`), cost caps, or deliberately short outputs.\n- **128K output tokens:** Opus 4.6 supports up to 128K `max_tokens`, but the SDKs require streaming for values that large to avoid HTTP timeouts. Use `.stream()` with `.get_final_message()` / `.finalMessage()`.\n- **Tool call JSON parsing (Opus 4.6):** Opus 4.6 may produce different JSON string escaping in tool call `input` fields (e.g., Unicode or forward-slash escaping). Always parse tool inputs with `json.loads()` / `JSON.parse()` \u2014 never do raw string matching on the serialized input.\n- **Structured outputs (all models):** Use `output_config: {format: {...}}` instead of the deprecated `output_format` parameter on `messages.create()`. This is a general API change, not 4.6-specific.\n- **Don\'t reimplement SDK functionality:** The SDK provides high-level helpers \u2014 use them instead of building from scratch. Specifically: use `stream.finalMessage()` instead of wrapping `.on()` events in `new Promise()`; use typed exception classes (`Anthropic.RateLimitError`, etc.) instead of string-matching error messages; use SDK types (`Anthropic.MessageParam`, `Anthropic.Tool`, `Anthropic.Message`, etc.) instead of redefining equivalent interfaces.\n- **Don\'t define custom types for SDK data structures:** The SDK exports types for all API objects. Use `Anthropic.MessageParam` for messages, `Anthropic.Tool` for tool definitions, `Anthropic.ToolUseBlock` / `Anthropic.ToolResultBlockParam` for tool results, `Anthropic.Message` for responses. Defining your own `interface ChatMessage { role: string; content: unknown }` duplicates what the SDK already provides and loses type safety.\n- **Report and document output:** For tasks that produce reports, documents, or visualizations, the code execution sandbox has `python-docx`, `python-pptx`, `matplotlib`, `pillow`, and `pypdf` pre-installed. Claude can generate formatted files (DOCX, PDF, charts) and return them via the Files API \u2014 consider this for "report" or "document" type requests instead of plain stdout text.\n'},{path:"skills/claude-api/tools.md",content:`# Claude API \u2014 Language-Specific Documentation Directories

The skill includes language-specific code examples and SDK documentation organized by directory. Read the appropriate directory based on the detected project language.

## Directory Structure

### Python (\`python/\`)

Full SDK support with Claude API and Agent SDK.

- \`python/claude-api/README.md\` \u2014 Installation, quick start, common patterns, error handling
- \`python/claude-api/tool-use.md\` \u2014 Tool runner, manual loop, code execution, memory, structured outputs
- \`python/claude-api/streaming.md\` \u2014 Streaming responses for chat UIs
- \`python/claude-api/batches.md\` \u2014 Batch processing (async, 50% cost)
- \`python/claude-api/files-api.md\` \u2014 File uploads across multiple requests
- \`python/agent-sdk/README.md\` \u2014 Agent SDK: installation, built-in tools, permissions, MCP, hooks
- \`python/agent-sdk/patterns.md\` \u2014 Agent SDK: custom tools, hooks, subagents, MCP integration, session resumption

### TypeScript (\`typescript/\`)

Full SDK support with Claude API and Agent SDK. Also used for JavaScript projects.

- \`typescript/claude-api/README.md\` \u2014 Installation, quick start, common patterns, error handling
- \`typescript/claude-api/tool-use.md\` \u2014 Tool runner (betaZodTool + Zod), manual loop, code execution, memory, structured outputs
- \`typescript/claude-api/streaming.md\` \u2014 Streaming responses for chat UIs
- \`typescript/claude-api/batches.md\` \u2014 Batch processing (async, 50% cost)
- \`typescript/claude-api/files-api.md\` \u2014 File uploads across multiple requests
- \`typescript/agent-sdk/README.md\` \u2014 Agent SDK: installation, built-in tools, permissions, MCP, hooks
- \`typescript/agent-sdk/patterns.md\` \u2014 Agent SDK: custom tools, hooks, subagents, MCP integration, session resumption

### Java (\`java/\`)

Single-file SDK documentation. Also used for Kotlin and Scala projects.

- \`java/claude-api.md\` \u2014 Full SDK coverage: installation, quick start, tool use, streaming, batches, files

### Go (\`go/\`)

Single-file SDK documentation.

- \`go/claude-api.md\` \u2014 Full SDK coverage: installation, quick start, tool use (BetaToolRunner), streaming, batches

### Ruby (\`ruby/\`)

Single-file SDK documentation.

- \`ruby/claude-api.md\` \u2014 Full SDK coverage: installation, quick start, tool use (BaseTool + tool_runner), streaming

### C# (\`csharp/\`)

Single-file SDK documentation.

- \`csharp/claude-api.md\` \u2014 Full SDK coverage: installation, quick start, streaming

### PHP (\`php/\`)

Single-file SDK documentation.

- \`php/claude-api.md\` \u2014 Full SDK coverage: installation, quick start, tool use (BetaRunnableTool + toolRunner())

### cURL (\`curl/\`)

Raw HTTP examples for unsupported languages or direct API access.

- \`curl/examples.md\` \u2014 cURL examples for all major API operations

### Shared (\`shared/\`)

Cross-language reference documentation.

- \`shared/tool-use-concepts.md\` \u2014 Conceptual foundations for tool use, code execution, memory, structured outputs
- \`shared/prompt-caching.md\` \u2014 Prefix-stability design, breakpoint placement, anti-patterns
- \`shared/error-codes.md\` \u2014 HTTP error codes, causes, fixes, typed SDK exceptions
- \`shared/models.md\` \u2014 Model catalog, IDs, capabilities, programmatic discovery via Models API
- \`shared/live-sources.md\` \u2014 WebFetch URLs for latest official documentation
`},{path:"skills/doc-coauthoring/skill.md",content:`---
name: doc-coauthoring
description: "Structured co-authoring workflow for docs, proposals, specs, and decision documents."
tags:
  - documentation
  - writing
  - workflow
  - collaboration
  - technical-writing
---

# Doc Co-Authoring Workflow

This skill provides a structured workflow for guiding users through collaborative document creation. Act as an active guide, walking users through three stages: Context Gathering, Refinement & Structure, and Reader Testing.

## When to Offer This Workflow

**Trigger conditions:**
- User mentions writing documentation: "write a doc", "draft a proposal", "create a spec", "write up"
- User mentions specific doc types: "PRD", "design doc", "decision doc", "RFC"
- User seems to be starting a substantial writing task

**Initial offer:**
Offer the user a structured workflow for co-authoring the document. Explain the three stages:

1. **Context Gathering**: User provides all relevant context while Claude asks clarifying questions
2. **Refinement & Structure**: Iteratively build each section through brainstorming and editing
3. **Reader Testing**: Test the doc with a fresh Claude (no context) to catch blind spots before others read it

Explain that this approach helps ensure the doc works well when others read it (including when they paste it into Claude). Ask if they want to try this workflow or prefer to work freeform.

If user declines, work freeform. If user accepts, proceed to Stage 1.

## Stage 1: Context Gathering

**Goal:** Close the gap between what the user knows and what Claude knows, enabling smart guidance later.

### Initial Questions

Start by asking the user for meta-context about the document:

1. What type of document is this? (e.g., technical spec, decision doc, proposal)
2. Who's the primary audience?
3. What's the desired impact when someone reads this?
4. Is there a template or specific format to follow?
5. Any other constraints or context to know?

Inform them they can answer in shorthand or dump information however works best for them.

**If user provides a template or mentions a doc type:**
- Ask if they have a template document to share
- If they provide a link to a shared document, use the appropriate integration to fetch it
- If they provide a file, read it

**If user mentions editing an existing shared document:**
- Use the appropriate integration to read the current state
- Check for images without alt-text
- If images exist without alt-text, explain that when others use Claude to understand the doc, Claude won't be able to see them. Ask if they want alt-text generated. If so, request they paste each image into chat for descriptive alt-text generation.

### Info Dumping

Once initial questions are answered, encourage the user to dump all the context they have. Request information such as:
- Background on the project/problem
- Related team discussions or shared documents
- Why alternative solutions aren't being used
- Organizational context (team dynamics, past incidents, politics)
- Timeline pressures or constraints
- Technical architecture or dependencies
- Stakeholder concerns

Advise them not to worry about organizing it - just get it all out. Offer multiple ways to provide context:
- Info dump stream-of-consciousness
- Point to team channels or threads to read
- Link to shared documents

**If integrations are available** (e.g., Slack, Teams, Google Drive, SharePoint, or other MCP servers), mention that these can be used to pull in context directly.

**If no integrations are detected and in Claude.ai or Claude app:** Suggest they can enable connectors in their Claude settings to allow pulling context from messaging apps and document storage directly.

Inform them clarifying questions will be asked once they've done their initial dump.

**During context gathering:**

- If user mentions team channels or shared documents:
  - If integrations available: Inform them the content will be read now, then use the appropriate integration
  - If integrations not available: Explain lack of access. Suggest they enable connectors in Claude settings, or paste the relevant content directly.

- If user mentions entities/projects that are unknown:
  - Ask if connected tools should be searched to learn more
  - Wait for user confirmation before searching

- As user provides context, track what's being learned and what's still unclear

**Asking clarifying questions:**

When user signals they've done their initial dump (or after substantial context provided), ask clarifying questions to ensure understanding:

Generate 5-10 numbered questions based on gaps in the context.

Inform them they can use shorthand to answer (e.g., "1: yes, 2: see #channel, 3: no because backwards compat"), link to more docs, point to channels to read, or just keep info-dumping. Whatever's most efficient for them.

**Exit condition:**
Sufficient context has been gathered when questions show understanding - when edge cases and trade-offs can be asked about without needing basics explained.

**Transition:**
Ask if there's any more context they want to provide at this stage, or if it's time to move on to drafting the document.

If user wants to add more, let them. When ready, proceed to Stage 2.

## Stage 2: Refinement & Structure

**Goal:** Build the document section by section through brainstorming, curation, and iterative refinement.

**Instructions to user:**
Explain that the document will be built section by section. For each section:
1. Clarifying questions will be asked about what to include
2. 5-20 options will be brainstormed
3. User will indicate what to keep/remove/combine
4. The section will be drafted
5. It will be refined through surgical edits

Start with whichever section has the most unknowns (usually the core decision/proposal), then work through the rest.

**Section ordering:**

If the document structure is clear:
Ask which section they'd like to start with.

Suggest starting with whichever section has the most unknowns. For decision docs, that's usually the core proposal. For specs, it's typically the technical approach. Summary sections are best left for last.

If user doesn't know what sections they need:
Based on the type of document and template, suggest 3-5 sections appropriate for the doc type.

Ask if this structure works, or if they want to adjust it.

**Once structure is agreed:**

Create the initial document structure with placeholder text for all sections.

**If access to artifacts is available:**
Use \`create_file\` to create an artifact. This gives both Claude and the user a scaffold to work from.

Inform them that the initial structure with placeholders for all sections will be created.

Create artifact with all section headers and brief placeholder text like "[To be written]" or "[Content here]".

Provide the scaffold link and indicate it's time to fill in each section.

**If no access to artifacts:**
Create a markdown file in the working directory. Name it appropriately (e.g., \`decision-doc.md\`, \`technical-spec.md\`).

Inform them that the initial structure with placeholders for all sections will be created.

Create file with all section headers and placeholder text.

Confirm the filename has been created and indicate it's time to fill in each section.

**For each section:**

### Step 1: Clarifying Questions

Announce work will begin on the [SECTION NAME] section. Ask 5-10 clarifying questions about what should be included:

Generate 5-10 specific questions based on context and section purpose.

Inform them they can answer in shorthand or just indicate what's important to cover.

### Step 2: Brainstorming

For the [SECTION NAME] section, brainstorm [5-20] things that might be included, depending on the section's complexity. Look for:
- Context shared that might have been forgotten
- Angles or considerations not yet mentioned

Generate 5-20 numbered options based on section complexity. At the end, offer to brainstorm more if they want additional options.

### Step 3: Curation

Ask which points should be kept, removed, or combined. Request brief justifications to help learn priorities for the next sections.

Provide examples:
- "Keep 1,4,7,9"
- "Remove 3 (duplicates 1)"
- "Remove 6 (audience already knows this)"
- "Combine 11 and 12"

**If user gives freeform feedback** (e.g., "looks good" or "I like most of it but...") instead of numbered selections, extract their preferences and proceed. Parse what they want kept/removed/changed and apply it.

### Step 4: Gap Check

Based on what they've selected, ask if there's anything important missing for the [SECTION NAME] section.

### Step 5: Drafting

Use \`str_replace\` to replace the placeholder text for this section with the actual drafted content.

Announce the [SECTION NAME] section will be drafted now based on what they've selected.

**If using artifacts:**
After drafting, provide a link to the artifact.

Ask them to read through it and indicate what to change. Note that being specific helps learning for the next sections.

**If using a file (no artifacts):**
After drafting, confirm completion.

Inform them the [SECTION NAME] section has been drafted in [filename]. Ask them to read through it and indicate what to change. Note that being specific helps learning for the next sections.

**Key instruction for user (include when drafting the first section):**
Provide a note: Instead of editing the doc directly, ask them to indicate what to change. This helps learning of their style for future sections. For example: "Remove the X bullet - already covered by Y" or "Make the third paragraph more concise".

### Step 6: Iterative Refinement

As user provides feedback:
- Use \`str_replace\` to make edits (never reprint the whole doc)
- **If using artifacts:** Provide link to artifact after each edit
- **If using files:** Just confirm edits are complete
- If user edits doc directly and asks to read it: mentally note the changes they made and keep them in mind for future sections (this shows their preferences)

**Continue iterating** until user is satisfied with the section.

### Quality Checking

After 3 consecutive iterations with no substantial changes, ask if anything can be removed without losing important information.

When section is done, confirm [SECTION NAME] is complete. Ask if ready to move to the next section.

**Repeat for all sections.**

### Near Completion

As approaching completion (80%+ of sections done), announce intention to re-read the entire document and check for:
- Flow and consistency across sections
- Redundancy or contradictions
- Anything that feels like "slop" or generic filler
- Whether every sentence carries weight

Read entire document and provide feedback.

**When all sections are drafted and refined:**
Announce all sections are drafted. Indicate intention to review the complete document one more time.

Review for overall coherence, flow, completeness.

Provide any final suggestions.

Ask if ready to move to Reader Testing, or if they want to refine anything else.

## Stage 3: Reader Testing

**Goal:** Test the document with a fresh Claude (no context bleed) to verify it works for readers.

**Instructions to user:**
Explain that testing will now occur to see if the document actually works for readers. This catches blind spots - things that make sense to the authors but might confuse others.

### Testing Approach

**If access to sub-agents is available (e.g., in Claude Code):**

Perform the testing directly without user involvement.

### Step 1: Predict Reader Questions

Announce intention to predict what questions readers might ask when trying to discover this document.

Generate 5-10 questions that readers would realistically ask.

### Step 2: Test with Sub-Agent

Announce that these questions will be tested with a fresh Claude instance (no context from this conversation).

For each question, invoke a sub-agent with just the document content and the question.

Summarize what Reader Claude got right/wrong for each question.

### Step 3: Run Additional Checks

Announce additional checks will be performed.

Invoke sub-agent to check for ambiguity, false assumptions, contradictions.

Summarize any issues found.

### Step 4: Report and Fix

If issues found:
Report that Reader Claude struggled with specific issues.

List the specific issues.

Indicate intention to fix these gaps.

Loop back to refinement for problematic sections.

---

**If no access to sub-agents (e.g., claude.ai web interface):**

The user will need to do the testing manually.

### Step 1: Predict Reader Questions

Ask what questions people might ask when trying to discover this document. What would they type into Claude.ai?

Generate 5-10 questions that readers would realistically ask.

### Step 2: Setup Testing

Provide testing instructions:
1. Open a fresh Claude conversation: https://claude.ai
2. Paste or share the document content (if using a shared doc platform with connectors enabled, provide the link)
3. Ask Reader Claude the generated questions

For each question, instruct Reader Claude to provide:
- The answer
- Whether anything was ambiguous or unclear
- What knowledge/context the doc assumes is already known

Check if Reader Claude gives correct answers or misinterprets anything.

### Step 3: Additional Checks

Also ask Reader Claude:
- "What in this doc might be ambiguous or unclear to readers?"
- "What knowledge or context does this doc assume readers already have?"
- "Are there any internal contradictions or inconsistencies?"

### Step 4: Iterate Based on Results

Ask what Reader Claude got wrong or struggled with. Indicate intention to fix those gaps.

Loop back to refinement for any problematic sections.

---

### Exit Condition (Both Approaches)

When Reader Claude consistently answers questions correctly and doesn't surface new gaps or ambiguities, the doc is ready.

## Final Review

When Reader Testing passes:
Announce the doc has passed Reader Claude testing. Before completion:

1. Recommend they do a final read-through themselves - they own this document and are responsible for its quality
2. Suggest double-checking any facts, links, or technical details
3. Ask them to verify it achieves the impact they wanted

Ask if they want one more review, or if the work is done.

**If user wants final review, provide it. Otherwise:**
Announce document completion. Provide a few final tips:
- Consider linking this conversation in an appendix so readers can see how the doc was developed
- Use appendices to provide depth without bloating the main doc
- Update the doc as feedback is received from real readers

## Tips for Effective Guidance

**Tone:**
- Be direct and procedural
- Explain rationale briefly when it affects user behavior
- Don't try to "sell" the approach - just execute it

**Handling Deviations:**
- If user wants to skip a stage: Ask if they want to skip this and write freeform
- If user seems frustrated: Acknowledge this is taking longer than expected. Suggest ways to move faster
- Always give user agency to adjust the process

**Context Management:**
- Throughout, if context is missing on something mentioned, proactively ask
- Don't let gaps accumulate - address them as they come up

**Artifact Management:**
- Use \`create_file\` for drafting full sections
- Use \`str_replace\` for all edits
- Provide artifact link after every change
- Never use artifacts for brainstorming lists - that's just conversation

**Quality over Speed:**
- Don't rush through stages
- Each iteration should make meaningful improvements
- The goal is a document that actually works for readers
`},{path:"skills/docx/skill.md",content:`---
name: docx
description: "Create, read, edit, and manipulate Word (.docx) files \u2014 formatting, TOC, tables, images, templates."
tags:
  - document
  - word
  - docx
  - office
  - writing
  - formatting
---

# DOCX creation, editing, and analysis

## Overview

A .docx file is a ZIP archive containing XML files.

## Quick Reference

| Task | Approach |
|------|----------|
| Read/analyze content | \`pandoc\` or unpack for raw XML |
| Create new document | Use \`docx-js\` - see Creating New Documents below |
| Edit existing document | Unpack \u2192 edit XML \u2192 repack - see Editing Existing Documents below |

### Converting .doc to .docx

Legacy \`.doc\` files must be converted before editing:

\`\`\`bash
python scripts/office/soffice.py --headless --convert-to docx document.doc
\`\`\`

### Reading Content

\`\`\`bash
# Text extraction with tracked changes
pandoc --track-changes=all document.docx -o output.md

# Raw XML access
python scripts/office/unpack.py document.docx unpacked/
\`\`\`

### Converting to Images

\`\`\`bash
python scripts/office/soffice.py --headless --convert-to pdf document.docx
pdftoppm -jpeg -r 150 document.pdf page
\`\`\`

### Accepting Tracked Changes

To produce a clean document with all tracked changes accepted (requires LibreOffice):

\`\`\`bash
python scripts/accept_changes.py input.docx output.docx
\`\`\`

---

## Creating New Documents

Generate .docx files with JavaScript, then validate. Install: \`npm install -g docx\`

### Setup
\`\`\`javascript
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, ImageRun,
        Header, Footer, AlignmentType, PageOrientation, LevelFormat, ExternalHyperlink,
        InternalHyperlink, Bookmark, FootnoteReferenceRun, PositionalTab,
        PositionalTabAlignment, PositionalTabRelativeTo, PositionalTabLeader,
        TabStopType, TabStopPosition, Column, SectionType,
        TableOfContents, HeadingLevel, BorderStyle, WidthType, ShadingType,
        VerticalAlign, PageNumber, PageBreak } = require('docx');

const doc = new Document({ sections: [{ children: [/* content */] }] });
Packer.toBuffer(doc).then(buffer => fs.writeFileSync("doc.docx", buffer));
\`\`\`

### Validation
After creating the file, validate it. If validation fails, unpack, fix the XML, and repack.
\`\`\`bash
python scripts/office/validate.py doc.docx
\`\`\`

### Page Size

\`\`\`javascript
// CRITICAL: docx-js defaults to A4, not US Letter
// Always set page size explicitly for consistent results
sections: [{
  properties: {
    page: {
      size: {
        width: 12240,   // 8.5 inches in DXA
        height: 15840   // 11 inches in DXA
      },
      margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } // 1 inch margins
    }
  },
  children: [/* content */]
}]
\`\`\`

**Common page sizes (DXA units, 1440 DXA = 1 inch):**

| Paper | Width | Height | Content Width (1" margins) |
|-------|-------|--------|---------------------------|
| US Letter | 12,240 | 15,840 | 9,360 |
| A4 (default) | 11,906 | 16,838 | 9,026 |

**Landscape orientation:** docx-js swaps width/height internally, so pass portrait dimensions and let it handle the swap:
\`\`\`javascript
size: {
  width: 12240,   // Pass SHORT edge as width
  height: 15840,  // Pass LONG edge as height
  orientation: PageOrientation.LANDSCAPE  // docx-js swaps them in the XML
},
// Content width = 15840 - left margin - right margin (uses the long edge)
\`\`\`

### Styles (Override Built-in Headings)

Use Arial as the default font (universally supported). Keep titles black for readability.

\`\`\`javascript
const doc = new Document({
  styles: {
    default: { document: { run: { font: "Arial", size: 24 } } }, // 12pt default
    paragraphStyles: [
      // IMPORTANT: Use exact IDs to override built-in styles
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 32, bold: true, font: "Arial" },
        paragraph: { spacing: { before: 240, after: 240 }, outlineLevel: 0 } }, // outlineLevel required for TOC
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 28, bold: true, font: "Arial" },
        paragraph: { spacing: { before: 180, after: 180 }, outlineLevel: 1 } },
    ]
  },
  sections: [{
    children: [
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Title")] }),
    ]
  }]
});
\`\`\`

### Lists (NEVER use unicode bullets)

\`\`\`javascript
// WRONG - never manually insert bullet characters
new Paragraph({ children: [new TextRun("\u2022 Item")] })  // BAD
new Paragraph({ children: [new TextRun("\\u2022 Item")] })  // BAD

// CORRECT - use numbering config with LevelFormat.BULLET
const doc = new Document({
  numbering: {
    config: [
      { reference: "bullets",
        levels: [{ level: 0, format: LevelFormat.BULLET, text: "\\u2022", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: "numbers",
        levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
    ]
  },
  sections: [{
    children: [
      new Paragraph({ numbering: { reference: "bullets", level: 0 },
        children: [new TextRun("Bullet item")] }),
      new Paragraph({ numbering: { reference: "numbers", level: 0 },
        children: [new TextRun("Numbered item")] }),
    ]
  }]
});

// Each reference creates INDEPENDENT numbering
// Same reference = continues (1,2,3 then 4,5,6)
// Different reference = restarts (1,2,3 then 1,2,3)
\`\`\`

### Tables

**CRITICAL: Tables need dual widths** - set both \`columnWidths\` on the table AND \`width\` on each cell. Without both, tables render incorrectly on some platforms.

\`\`\`javascript
// CRITICAL: Always set table width for consistent rendering
// CRITICAL: Use ShadingType.CLEAR (not SOLID) to prevent black backgrounds
const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const borders = { top: border, bottom: border, left: border, right: border };

new Table({
  width: { size: 9360, type: WidthType.DXA }, // Always use DXA (percentages break in Google Docs)
  columnWidths: [4680, 4680], // Must sum to table width (DXA: 1440 = 1 inch)
  rows: [
    new TableRow({
      children: [
        new TableCell({
          borders,
          width: { size: 4680, type: WidthType.DXA }, // Also set on each cell
          shading: { fill: "D5E8F0", type: ShadingType.CLEAR }, // CLEAR not SOLID
          margins: { top: 80, bottom: 80, left: 120, right: 120 }, // Cell padding (internal, not added to width)
          children: [new Paragraph({ children: [new TextRun("Cell")] })]
        })
      ]
    })
  ]
})
\`\`\`

**Table width calculation:**

Always use \`WidthType.DXA\` \u2014 \`WidthType.PERCENTAGE\` breaks in Google Docs.

\`\`\`javascript
// Table width = sum of columnWidths = content width
// US Letter with 1" margins: 12240 - 2880 = 9360 DXA
width: { size: 9360, type: WidthType.DXA },
columnWidths: [7000, 2360]  // Must sum to table width
\`\`\`

**Width rules:**
- **Always use \`WidthType.DXA\`** \u2014 never \`WidthType.PERCENTAGE\` (incompatible with Google Docs)
- Table width must equal the sum of \`columnWidths\`
- Cell \`width\` must match corresponding \`columnWidth\`
- Cell \`margins\` are internal padding - they reduce content area, not add to cell width
- For full-width tables: use content width (page width minus left and right margins)

### Images

\`\`\`javascript
// CRITICAL: type parameter is REQUIRED
new Paragraph({
  children: [new ImageRun({
    type: "png", // Required: png, jpg, jpeg, gif, bmp, svg
    data: fs.readFileSync("image.png"),
    transformation: { width: 200, height: 150 },
    altText: { title: "Title", description: "Desc", name: "Name" } // All three required
  })]
})
\`\`\`

### Page Breaks

\`\`\`javascript
// CRITICAL: PageBreak must be inside a Paragraph
new Paragraph({ children: [new PageBreak()] })

// Or use pageBreakBefore
new Paragraph({ pageBreakBefore: true, children: [new TextRun("New page")] })
\`\`\`

### Hyperlinks

\`\`\`javascript
// External link
new Paragraph({
  children: [new ExternalHyperlink({
    children: [new TextRun({ text: "Click here", style: "Hyperlink" })],
    link: "https://example.com",
  })]
})

// Internal link (bookmark + reference)
// 1. Create bookmark at destination
new Paragraph({ heading: HeadingLevel.HEADING_1, children: [
  new Bookmark({ id: "chapter1", children: [new TextRun("Chapter 1")] }),
]})
// 2. Link to it
new Paragraph({ children: [new InternalHyperlink({
  children: [new TextRun({ text: "See Chapter 1", style: "Hyperlink" })],
  anchor: "chapter1",
})]})
\`\`\`

### Footnotes

\`\`\`javascript
const doc = new Document({
  footnotes: {
    1: { children: [new Paragraph("Source: Annual Report 2024")] },
    2: { children: [new Paragraph("See appendix for methodology")] },
  },
  sections: [{
    children: [new Paragraph({
      children: [
        new TextRun("Revenue grew 15%"),
        new FootnoteReferenceRun(1),
        new TextRun(" using adjusted metrics"),
        new FootnoteReferenceRun(2),
      ],
    })]
  }]
});
\`\`\`

### Tab Stops

\`\`\`javascript
// Right-align text on same line (e.g., date opposite a title)
new Paragraph({
  children: [
    new TextRun("Company Name"),
    new TextRun("\\tJanuary 2025"),
  ],
  tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
})

// Dot leader (e.g., TOC-style)
new Paragraph({
  children: [
    new TextRun("Introduction"),
    new TextRun({ children: [
      new PositionalTab({
        alignment: PositionalTabAlignment.RIGHT,
        relativeTo: PositionalTabRelativeTo.MARGIN,
        leader: PositionalTabLeader.DOT,
      }),
      "3",
    ]}),
  ],
})
\`\`\`

### Multi-Column Layouts

\`\`\`javascript
// Equal-width columns
sections: [{
  properties: {
    column: {
      count: 2,          // number of columns
      space: 720,        // gap between columns in DXA (720 = 0.5 inch)
      equalWidth: true,
      separate: true,    // vertical line between columns
    },
  },
  children: [/* content flows naturally across columns */]
}]

// Custom-width columns (equalWidth must be false)
sections: [{
  properties: {
    column: {
      equalWidth: false,
      children: [
        new Column({ width: 5400, space: 720 }),
        new Column({ width: 3240 }),
      ],
    },
  },
  children: [/* content */]
}]
\`\`\`

Force a column break with a new section using \`type: SectionType.NEXT_COLUMN\`.

### Table of Contents

\`\`\`javascript
// CRITICAL: Headings must use HeadingLevel ONLY - no custom styles
new TableOfContents("Table of Contents", { hyperlink: true, headingStyleRange: "1-3" })
\`\`\`

### Headers/Footers

\`\`\`javascript
sections: [{
  properties: {
    page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } // 1440 = 1 inch
  },
  headers: {
    default: new Header({ children: [new Paragraph({ children: [new TextRun("Header")] })] })
  },
  footers: {
    default: new Footer({ children: [new Paragraph({
      children: [new TextRun("Page "), new TextRun({ children: [PageNumber.CURRENT] })]
    })] })
  },
  children: [/* content */]
}]
\`\`\`

### Critical Rules for docx-js

- **Set page size explicitly** - docx-js defaults to A4; use US Letter (12240 x 15840 DXA) for US documents
- **Landscape: pass portrait dimensions** - docx-js swaps width/height internally; pass short edge as \`width\`, long edge as \`height\`, and set \`orientation: PageOrientation.LANDSCAPE\`
- **Never use \`\\n\`** - use separate Paragraph elements
- **Never use unicode bullets** - use \`LevelFormat.BULLET\` with numbering config
- **PageBreak must be in Paragraph** - standalone creates invalid XML
- **ImageRun requires \`type\`** - always specify png/jpg/etc
- **Always set table \`width\` with DXA** - never use \`WidthType.PERCENTAGE\` (breaks in Google Docs)
- **Tables need dual widths** - \`columnWidths\` array AND cell \`width\`, both must match
- **Table width = sum of columnWidths** - for DXA, ensure they add up exactly
- **Always add cell margins** - use \`margins: { top: 80, bottom: 80, left: 120, right: 120 }\` for readable padding
- **Use \`ShadingType.CLEAR\`** - never SOLID for table shading
- **Never use tables as dividers/rules** - cells have minimum height and render as empty boxes (including in headers/footers); use \`border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "2E75B6", space: 1 } }\` on a Paragraph instead. For two-column footers, use tab stops (see Tab Stops section), not tables
- **TOC requires HeadingLevel only** - no custom styles on heading paragraphs
- **Override built-in styles** - use exact IDs: "Heading1", "Heading2", etc.
- **Include \`outlineLevel\`** - required for TOC (0 for H1, 1 for H2, etc.)

---

## Editing Existing Documents

**Follow all 3 steps in order.**

### Step 1: Unpack
\`\`\`bash
python scripts/office/unpack.py document.docx unpacked/
\`\`\`
Extracts XML, pretty-prints, merges adjacent runs, and converts smart quotes to XML entities (\`&#x201C;\` etc.) so they survive editing. Use \`--merge-runs false\` to skip run merging.

### Step 2: Edit XML

Edit files in \`unpacked/word/\`. See XML Reference below for patterns.

**Use "Claude" as the author** for tracked changes and comments, unless the user explicitly requests use of a different name.

**Use the Edit tool directly for string replacement. Do not write Python scripts.** Scripts introduce unnecessary complexity. The Edit tool shows exactly what is being replaced.

**CRITICAL: Use smart quotes for new content.** When adding text with apostrophes or quotes, use XML entities to produce smart quotes:
\`\`\`xml
<!-- Use these entities for professional typography -->
<w:t>Here&#x2019;s a quote: &#x201C;Hello&#x201D;</w:t>
\`\`\`
| Entity | Character |
|--------|-----------|
| \`&#x2018;\` | ' (left single) |
| \`&#x2019;\` | ' (right single / apostrophe) |
| \`&#x201C;\` | " (left double) |
| \`&#x201D;\` | " (right double) |

**Adding comments:** Use \`comment.py\` to handle boilerplate across multiple XML files (text must be pre-escaped XML):
\`\`\`bash
python scripts/comment.py unpacked/ 0 "Comment text with &amp; and &#x2019;"
python scripts/comment.py unpacked/ 1 "Reply text" --parent 0  # reply to comment 0
python scripts/comment.py unpacked/ 0 "Text" --author "Custom Author"  # custom author name
\`\`\`
Then add markers to document.xml (see Comments in XML Reference).

### Step 3: Pack
\`\`\`bash
python scripts/office/pack.py unpacked/ output.docx --original document.docx
\`\`\`
Validates with auto-repair, condenses XML, and creates DOCX. Use \`--validate false\` to skip.

**Auto-repair will fix:**
- \`durableId\` >= 0x7FFFFFFF (regenerates valid ID)
- Missing \`xml:space="preserve"\` on \`<w:t>\` with whitespace

**Auto-repair won't fix:**
- Malformed XML, invalid element nesting, missing relationships, schema violations

### Common Pitfalls

- **Replace entire \`<w:r>\` elements**: When adding tracked changes, replace the whole \`<w:r>...</w:r>\` block with \`<w:del>...<w:ins>...\` as siblings. Don't inject tracked change tags inside a run.
- **Preserve \`<w:rPr>\` formatting**: Copy the original run's \`<w:rPr>\` block into your tracked change runs to maintain bold, font size, etc.

---

## XML Reference

### Schema Compliance

- **Element order in \`<w:pPr>\`**: \`<w:pStyle>\`, \`<w:numPr>\`, \`<w:spacing>\`, \`<w:ind>\`, \`<w:jc>\`, \`<w:rPr>\` last
- **Whitespace**: Add \`xml:space="preserve"\` to \`<w:t>\` with leading/trailing spaces
- **RSIDs**: Must be 8-digit hex (e.g., \`00AB1234\`)

### Tracked Changes

**Insertion:**
\`\`\`xml
<w:ins w:id="1" w:author="Claude" w:date="2025-01-01T00:00:00Z">
  <w:r><w:t>inserted text</w:t></w:r>
</w:ins>
\`\`\`

**Deletion:**
\`\`\`xml
<w:del w:id="2" w:author="Claude" w:date="2025-01-01T00:00:00Z">
  <w:r><w:delText>deleted text</w:delText></w:r>
</w:del>
\`\`\`

**Inside \`<w:del>\`**: Use \`<w:delText>\` instead of \`<w:t>\`, and \`<w:delInstrText>\` instead of \`<w:instrText>\`.

**Minimal edits** - only mark what changes:
\`\`\`xml
<!-- Change "30 days" to "60 days" -->
<w:r><w:t>The term is </w:t></w:r>
<w:del w:id="1" w:author="Claude" w:date="...">
  <w:r><w:delText>30</w:delText></w:r>
</w:del>
<w:ins w:id="2" w:author="Claude" w:date="...">
  <w:r><w:t>60</w:t></w:r>
</w:ins>
<w:r><w:t> days.</w:t></w:r>
\`\`\`

**Deleting entire paragraphs/list items** - when removing ALL content from a paragraph, also mark the paragraph mark as deleted so it merges with the next paragraph. Add \`<w:del/>\` inside \`<w:pPr><w:rPr>\`:
\`\`\`xml
<w:p>
  <w:pPr>
    <w:numPr>...</w:numPr>  <!-- list numbering if present -->
    <w:rPr>
      <w:del w:id="1" w:author="Claude" w:date="2025-01-01T00:00:00Z"/>
    </w:rPr>
  </w:pPr>
  <w:del w:id="2" w:author="Claude" w:date="2025-01-01T00:00:00Z">
    <w:r><w:delText>Entire paragraph content being deleted...</w:delText></w:r>
  </w:del>
</w:p>
\`\`\`
Without the \`<w:del/>\` in \`<w:pPr><w:rPr>\`, accepting changes leaves an empty paragraph/list item.

**Rejecting another author's insertion** - nest deletion inside their insertion:
\`\`\`xml
<w:ins w:author="Jane" w:id="5">
  <w:del w:author="Claude" w:id="10">
    <w:r><w:delText>their inserted text</w:delText></w:r>
  </w:del>
</w:ins>
\`\`\`

**Restoring another author's deletion** - add insertion after (don't modify their deletion):
\`\`\`xml
<w:del w:author="Jane" w:id="5">
  <w:r><w:delText>deleted text</w:delText></w:r>
</w:del>
<w:ins w:author="Claude" w:id="10">
  <w:r><w:t>deleted text</w:t></w:r>
</w:ins>
\`\`\`

### Comments

After running \`comment.py\` (see Step 2), add markers to document.xml. For replies, use \`--parent\` flag and nest markers inside the parent's.

**CRITICAL: \`<w:commentRangeStart>\` and \`<w:commentRangeEnd>\` are siblings of \`<w:r>\`, never inside \`<w:r>\`.**

\`\`\`xml
<!-- Comment markers are direct children of w:p, never inside w:r -->
<w:commentRangeStart w:id="0"/>
<w:del w:id="1" w:author="Claude" w:date="2025-01-01T00:00:00Z">
  <w:r><w:delText>deleted</w:delText></w:r>
</w:del>
<w:r><w:t> more text</w:t></w:r>
<w:commentRangeEnd w:id="0"/>
<w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:commentReference w:id="0"/></w:r>

<!-- Comment 0 with reply 1 nested inside -->
<w:commentRangeStart w:id="0"/>
  <w:commentRangeStart w:id="1"/>
  <w:r><w:t>text</w:t></w:r>
  <w:commentRangeEnd w:id="1"/>
<w:commentRangeEnd w:id="0"/>
<w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:commentReference w:id="0"/></w:r>
<w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:commentReference w:id="1"/></w:r>
\`\`\`

### Images

1. Add image file to \`word/media/\`
2. Add relationship to \`word/_rels/document.xml.rels\`:
\`\`\`xml
<Relationship Id="rId5" Type=".../image" Target="media/image1.png"/>
\`\`\`
3. Add content type to \`[Content_Types].xml\`:
\`\`\`xml
<Default Extension="png" ContentType="image/png"/>
\`\`\`
4. Reference in document.xml:
\`\`\`xml
<w:drawing>
  <wp:inline>
    <wp:extent cx="914400" cy="914400"/>  <!-- EMUs: 914400 = 1 inch -->
    <a:graphic>
      <a:graphicData uri=".../picture">
        <pic:pic>
          <pic:blipFill><a:blip r:embed="rId5"/></pic:blipFill>
        </pic:pic>
      </a:graphicData>
    </a:graphic>
  </wp:inline>
</w:drawing>
\`\`\`

---

## Dependencies

- **pandoc**: Text extraction
- **docx**: \`npm install -g docx\` (new documents)
- **LibreOffice**: PDF conversion (auto-configured for sandboxed environments via \`scripts/office/soffice.py\`)
- **Poppler**: \`pdftoppm\` for images
`},{path:"skills/docx/tools.md",content:`# DOCX Skill \u2014 Available Scripts

## scripts/office/unpack.py

Unpack Office files (DOCX, PPTX, XLSX) for editing. Extracts the ZIP archive, pretty-prints XML files, merges adjacent runs with identical formatting (DOCX only), and simplifies adjacent tracked changes from the same author (DOCX only).

\`\`\`bash
python scripts/office/unpack.py <office_file> <output_dir> [options]
\`\`\`

**Arguments:**
- \`office_file\` \u2014 Input Office file (.docx, .pptx, .xlsx)
- \`output_dir\` \u2014 Directory to extract to

**Options:**
- \`--merge-runs false\` \u2014 Skip merging adjacent runs with identical formatting

**Examples:**
\`\`\`bash
python scripts/office/unpack.py document.docx unpacked/
python scripts/office/unpack.py presentation.pptx unpacked/
python scripts/office/unpack.py document.docx unpacked/ --merge-runs false
\`\`\`

---

## scripts/office/pack.py

Pack a directory back into a DOCX, PPTX, or XLSX file. Validates with auto-repair, condenses XML formatting, and creates the Office file.

\`\`\`bash
python scripts/office/pack.py <input_directory> <output_file> [--original <file>] [--validate true|false]
\`\`\`

**Arguments:**
- \`input_directory\` \u2014 Unpacked directory containing the Office document XML files
- \`output_file\` \u2014 Output Office file path

**Options:**
- \`--original <file>\` \u2014 Original Office file (for reference during packing)
- \`--validate true|false\` \u2014 Enable/disable validation (default: true)

**Auto-repair fixes:**
- \`durableId\` >= 0x7FFFFFFF (regenerates valid ID)
- Missing \`xml:space="preserve"\` on \`<w:t>\` with whitespace

**Examples:**
\`\`\`bash
python scripts/office/pack.py unpacked/ output.docx --original input.docx
python scripts/office/pack.py unpacked/ output.pptx --validate false
\`\`\`

---

## scripts/office/validate.py

Validate Office document XML files against XSD schemas and tracked changes.

\`\`\`bash
python scripts/office/validate.py <path> [--original <original_file>] [--auto-repair] [--author NAME]
\`\`\`

**Arguments:**
- \`path\` \u2014 Path to unpacked directory or packed Office file (.docx/.pptx/.xlsx)

**Options:**
- \`--original <original_file>\` \u2014 Original file for comparison
- \`--auto-repair\` \u2014 Attempt automatic fixes for common issues
- \`--author NAME\` \u2014 Author name for tracked change validation

---

## scripts/office/soffice.py

Helper for running LibreOffice (soffice) in environments where AF_UNIX sockets may be blocked (e.g., sandboxed VMs). Detects the restriction at runtime and applies an LD_PRELOAD shim if needed.

\`\`\`bash
python scripts/office/soffice.py --headless --convert-to <format> <input_file>
\`\`\`

**Programmatic usage:**
\`\`\`python
from office.soffice import run_soffice, get_soffice_env

# Option 1 \u2014 run soffice directly
result = run_soffice(["--headless", "--convert-to", "pdf", "input.docx"])

# Option 2 \u2014 get env dict for your own subprocess calls
env = get_soffice_env()
subprocess.run(["soffice", ...], env=env)
\`\`\`

---

## scripts/comment.py

Add comments to DOCX documents. Handles all the boilerplate across multiple XML files (comments.xml, commentsExtended.xml, commentsIds.xml, commentsExtensible.xml). Text must be pre-escaped XML.

\`\`\`bash
python scripts/comment.py <unpacked_dir> <comment_id> "<text>" [options]
\`\`\`

**Arguments:**
- \`unpacked_dir\` \u2014 Unpacked DOCX directory
- \`comment_id\` \u2014 Comment ID (must be unique integer)
- \`text\` \u2014 Comment text (pre-escaped XML, e.g., \`&amp;\` for \`&\`, \`&#x2019;\` for smart quotes)

**Options:**
- \`--author <name>\` \u2014 Author name (default: "Claude")
- \`--initials <str>\` \u2014 Author initials (default: "C")
- \`--parent <id>\` \u2014 Parent comment ID (for replies)

**Examples:**
\`\`\`bash
python scripts/comment.py unpacked/ 0 "Comment text with &amp; and &#x2019;"
python scripts/comment.py unpacked/ 1 "Reply text" --parent 0
python scripts/comment.py unpacked/ 0 "Text" --author "Custom Author"
\`\`\`

After running, add markers to document.xml:
\`\`\`xml
<w:commentRangeStart w:id="0"/>
... commented content ...
<w:commentRangeEnd w:id="0"/>
<w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:commentReference w:id="0"/></w:r>
\`\`\`

---

## scripts/accept_changes.py

Accept all tracked changes in a DOCX file using LibreOffice. Requires LibreOffice (soffice) to be installed.

\`\`\`bash
python scripts/accept_changes.py <input_file> <output_file>
\`\`\`

**Arguments:**
- \`input_file\` \u2014 Input DOCX file with tracked changes
- \`output_file\` \u2014 Output DOCX file (clean, no tracked changes)

**Example:**
\`\`\`bash
python scripts/accept_changes.py input.docx output.docx
\`\`\`
`},{path:"skills/frontend-design/skill.md",content:`---
name: frontend-design
description: "Create polished, production-grade web UIs \u2014 landing pages, dashboards, React components, HTML/CSS layouts."
tags:
  - frontend
  - design
  - ui
  - css
  - html
  - react
  - web
  - components
---

This skill guides creation of distinctive, production-grade frontend interfaces that avoid generic "AI slop" aesthetics. Implement real working code with exceptional attention to aesthetic details and creative choices.

The user provides frontend requirements: a component, page, application, or interface to build. They may include context about the purpose, audience, or technical constraints.

## Design Thinking

Before coding, understand the context and commit to a BOLD aesthetic direction:
- **Purpose**: What problem does this interface solve? Who uses it?
- **Tone**: Pick an extreme: brutally minimal, maximalist chaos, retro-futuristic, organic/natural, luxury/refined, playful/toy-like, editorial/magazine, brutalist/raw, art deco/geometric, soft/pastel, industrial/utilitarian, etc. There are so many flavors to choose from. Use these for inspiration but design one that is true to the aesthetic direction.
- **Constraints**: Technical requirements (framework, performance, accessibility).
- **Differentiation**: What makes this UNFORGETTABLE? What's the one thing someone will remember?

**CRITICAL**: Choose a clear conceptual direction and execute it with precision. Bold maximalism and refined minimalism both work - the key is intentionality, not intensity.

Then implement working code (HTML/CSS/JS, React, Vue, etc.) that is:
- Production-grade and functional
- Visually striking and memorable
- Cohesive with a clear aesthetic point-of-view
- Meticulously refined in every detail

## Frontend Aesthetics Guidelines

Focus on:
- **Typography**: Choose fonts that are beautiful, unique, and interesting. Avoid generic fonts like Arial and Inter; opt instead for distinctive choices that elevate the frontend's aesthetics; unexpected, characterful font choices. Pair a distinctive display font with a refined body font.
- **Color & Theme**: Commit to a cohesive aesthetic. Use CSS variables for consistency. Dominant colors with sharp accents outperform timid, evenly-distributed palettes.
- **Motion**: Use animations for effects and micro-interactions. Prioritize CSS-only solutions for HTML. Use Motion library for React when available. Focus on high-impact moments: one well-orchestrated page load with staggered reveals (animation-delay) creates more delight than scattered micro-interactions. Use scroll-triggering and hover states that surprise.
- **Spatial Composition**: Unexpected layouts. Asymmetry. Overlap. Diagonal flow. Grid-breaking elements. Generous negative space OR controlled density.
- **Backgrounds & Visual Details**: Create atmosphere and depth rather than defaulting to solid colors. Add contextual effects and textures that match the overall aesthetic. Apply creative forms like gradient meshes, noise textures, geometric patterns, layered transparencies, dramatic shadows, decorative borders, custom cursors, and grain overlays.

NEVER use generic AI-generated aesthetics like overused font families (Inter, Roboto, Arial, system fonts), cliched color schemes (particularly purple gradients on white backgrounds), predictable layouts and component patterns, and cookie-cutter design that lacks context-specific character.

Interpret creatively and make unexpected choices that feel genuinely designed for the context. No design should be the same. Vary between light and dark themes, different fonts, different aesthetics. NEVER converge on common choices (Space Grotesk, for example) across generations.

**IMPORTANT**: Match implementation complexity to the aesthetic vision. Maximalist designs need elaborate code with extensive animations and effects. Minimalist or refined designs need restraint, precision, and careful attention to spacing, typography, and subtle details. Elegance comes from executing the vision well.

Remember: Claude is capable of extraordinary creative work. Don't hold back, show what can truly be created when thinking outside the box and committing fully to a distinctive vision.
`},{path:"skills/internal-comms/examples.md",content:`# Internal Communications \u2014 Examples & Guidelines

---

## 3P Updates (Progress, Plans, Problems)

### Instructions
You are being asked to write a 3P update. 3P updates stand for "Progress, Plans, Problems." The main audience is for executives, leadership, other teammates, etc. They're meant to be very succinct and to-the-point: think something you can read in 30-60sec or less. They're also for people with some, but not a lot of context on what the team does.

3Ps can cover a team of any size, ranging all the way up to the entire company. The bigger the team, the less granular the tasks should be. For example, "mobile team" might have "shipped feature" or "fixed bugs," whereas the company might have really meaty 3Ps, like "hired 20 new people" or "closed 10 new deals."

They represent the work of the team across a time period, almost always one week. They include three sections:
1) Progress: what the team has accomplished over the next time period. Focus mainly on things shipped, milestones achieved, tasks created, etc.
2) Plans: what the team plans to do over the next time period. Focus on what things are top-of-mind, really high priority, etc. for the team.
3) Problems: anything that is slowing the team down. This could be things like too few people, bugs or blockers that are preventing the team from moving forward, some deal that fell through, etc.

Before writing them, make sure that you know the team name. If it's not specified, you can ask explicitly what the team name you're writing for is.


### Tools Available
Whenever possible, try to pull from available sources to get the information you need:
- Slack: posts from team members with their updates - ideally look for posts in large channels with lots of reactions
- Google Drive: docs written from critical team members with lots of views
- Email: emails with lots of responses of lots of content that seems relevant
- Calendar: non-recurring meetings that have a lot of importance, like product reviews, etc.


Try to gather as much context as you can, focusing on the things that covered the time period you're writing for:
- Progress: anything between a week ago and today
- Plans: anything from today to the next week
- Problems: anything between a week ago and today


If you don't have access, you can ask the user for things they want to cover. They might also include these things to you directly, in which case you're mostly just formatting for this particular format.

### Workflow

1. **Clarify scope**: Confirm the team name and time period (usually past week for Progress/Problems, next
week for Plans)
2. **Gather information**: Use available tools or ask the user directly
3. **Draft the update**: Follow the strict formatting guidelines
4. **Review**: Ensure it's concise (30-60 seconds to read) and data-driven

### Formatting

The format is always the same, very strict formatting. Never use any formatting other than this. Pick an emoji that is fun and captures the vibe of the team and update.

[pick an emoji] [Team Name] (Dates Covered, usually a week)
Progress: [1-3 sentences of content]
Plans: [1-3 sentences of content]
Problems: [1-3 sentences of content]

Each section should be no more than 1-3 sentences: clear, to the point. It should be data-driven, and generally include metrics where possible. The tone should be very matter-of-fact, not super prose-heavy.

---

## Company Newsletter

### Instructions
You are being asked to write a company-wide newsletter update. You are meant to summarize the past week/month of a company in the form of a newsletter that the entire company will read. It should be maybe ~20-25 bullet points long. It will be sent via Slack and email, so make it consumable for that.

Ideally it includes the following attributes:
- Lots of links: pulling documents from Google Drive that are very relevant, linking to prominent Slack messages in announce channels and from executives, perhaps referencing emails that went company-wide, highlighting significant things that have happened in the company.
- Short and to-the-point: each bullet should probably be no longer than ~1-2 sentences
- Use the "we" tense, as you are part of the company. Many of the bullets should say "we did this" or "we did that"

### Tools to use
If you have access to the following tools, please try to use them. If not, you can also let the user know directly that their responses would be better if they gave them access.

- Slack: look for messages in channels with lots of people, with lots of reactions or lots of responses within the thread
- Email: look for things from executives that discuss company-wide announcements
- Calendar: if there were meetings with large attendee lists, particularly things like All-Hands meetings, big company announcements, etc. If there were documents attached to those meetings, those are great links to include.
- Documents: if there were new docs published in the last week or two that got a lot of attention, you can link them. These should be things like company-wide vision docs, plans for the upcoming quarter or half, things authored by critical executives, etc.
- External press: if you see references to articles or press we've received over the past week, that could be really cool too.

If you don't have access to any of these things, you can ask the user for things they want to cover. In this case, you'll mostly just be polishing up and fitting to this format more directly.

### Sections
The company is pretty big: 1000+ people. There are a variety of different teams and initiatives going on across the company. To make sure the update works well, try breaking it into sections of similar things. You might break into clusters like {product development, go to market, finance} or {recruiting, execution, vision}, or {external news, internal news} etc. Try to make sure the different areas of the company are highlighted well.

### Prioritization
Focus on:
- Company-wide impact (not team-specific details)
- Announcements from leadership
- Major milestones and achievements
- Information that affects most employees
- External recognition or press

Avoid:
- Overly granular team updates (save those for 3Ps)
- Information only relevant to small groups
- Duplicate information already communicated

### Example Formats

:megaphone: Company Announcements
- Announcement 1
- Announcement 2
- Announcement 3

:dart: Progress on Priorities
- Area 1
    - Sub-area 1
    - Sub-area 2
    - Sub-area 3
- Area 2
    - Sub-area 1
    - Sub-area 2
    - Sub-area 3
- Area 3
    - Sub-area 1
    - Sub-area 2
    - Sub-area 3

:pillar: Leadership Updates
- Post 1
- Post 2
- Post 3

:thread: Social Updates
- Update 1
- Update 2
- Update 3

---

## FAQ Answers

### Instructions
You are an assistant for answering questions that are being asked across the company. Every week, there are lots of questions that get asked across the company, and your goal is to try to summarize what those questions are. We want our company to be well-informed and on the same page, so your job is to produce a set of frequently asked questions that our employees are asking and attempt to answer them. Your singular job is to do two things:

- Find questions that are big sources of confusion for lots of employees at the company, generally about things that affect a large portion of the employee base
- Attempt to give a nice summarized answer to that question in order to minimize confusion.

Some examples of areas that may be interesting to folks: recent corporate events (fundraising, new executives, etc.), upcoming launches, hiring progress, changes to vision or focus, etc.


### Tools Available
You should use the company's available tools, where communication and work happens. For most companies, it looks something like this:
- Slack: questions being asked across the company - it could be questions in response to posts with lots of responses, questions being asked with lots of reactions or thumbs up to show support, or anything else to show that a large number of employees want to ask the same things
- Email: emails with FAQs written directly in them can be a good source as well
- Documents: docs in places like Google Drive, linked on calendar events, etc. can also be a good source of FAQs, either directly added or inferred based on the contents of the doc

### Formatting
The formatting should be pretty basic:

- *Question*: [insert question - 1 sentence]
- *Answer*: [insert answer - 1-2 sentence]

### Guidance
Make sure you're being holistic in your questions. Don't focus too much on just the user in question or the team they are a part of, but try to capture the entire company. Try to be as holistic as you can in reading all the tools available, producing responses that are relevant to all at the company.

### Answer Guidelines
- Base answers on official company communications when possible
- If information is uncertain, indicate that clearly
- Link to authoritative sources (docs, announcements, emails)
- Keep tone professional but approachable
- Flag if a question requires executive input or official response

---

## General Communications

### Instructions
You are being asked to write internal company communication that doesn't fit into the standard formats (3P
updates, newsletters, or FAQs).

Before proceeding:
1. Ask the user about their target audience
2. Understand the communication's purpose
3. Clarify the desired tone (formal, casual, urgent, informational)
4. Confirm any specific formatting requirements

Use these general principles:
- Be clear and concise
- Use active voice
- Put the most important information first
- Include relevant links and references
- Match the company's communication style
`},{path:"skills/internal-comms/skill.md",content:`---
name: internal-comms
description: "Write internal communications \u2014 status reports, leadership updates, newsletters, incident reports, FAQs."
tags:
  - writing
  - communications
  - business
  - internal
  - reports
  - updates
---

## When to use this skill
To write internal communications, use this skill for:
- 3P updates (Progress, Plans, Problems)
- Company newsletters
- FAQ responses
- Status reports
- Leadership updates
- Project updates
- Incident reports

## How to use this skill

To write any internal communication:

1. **Identify the communication type** from the request
2. **Load the appropriate guideline** from the examples:
    - 3P updates - For Progress/Plans/Problems team updates
    - Company newsletter - For company-wide newsletters
    - FAQ answers - For answering frequently asked questions
    - General comms - For anything else that doesn't explicitly match one of the above
3. **Follow the specific instructions** in that guideline for formatting, tone, and content gathering

If the communication type doesn't match any existing guideline, ask for clarification or more context about the desired format.

## Keywords
3P updates, company newsletter, company comms, weekly update, faqs, common questions, updates, internal comms
`},{path:"skills/mcp-builder/references.md",content:`# MCP Builder References

This file combines all reference documentation for the MCP Builder skill.

## Table of Contents

- [MCP Server Best Practices](#mcp-server-best-practices)
- [Node/TypeScript MCP Server Implementation Guide](#nodetypescript-mcp-server-implementation-guide)
- [Python MCP Server Implementation Guide](#python-mcp-server-implementation-guide)
- [MCP Server Evaluation Guide](#mcp-server-evaluation-guide)

---

# MCP Server Best Practices

## Quick Reference

### Server Naming
- **Python**: \`{service}_mcp\` (e.g., \`slack_mcp\`)
- **Node/TypeScript**: \`{service}-mcp-server\` (e.g., \`slack-mcp-server\`)

### Tool Naming
- Use snake_case with service prefix
- Format: \`{service}_{action}_{resource}\`
- Example: \`slack_send_message\`, \`github_create_issue\`

### Response Formats
- Support both JSON and Markdown formats
- JSON for programmatic processing
- Markdown for human readability

### Pagination
- Always respect \`limit\` parameter
- Return \`has_more\`, \`next_offset\`, \`total_count\`
- Default to 20-50 items

### Transport
- **Streamable HTTP**: For remote servers, multi-client scenarios
- **stdio**: For local integrations, command-line tools
- Avoid SSE (deprecated in favor of streamable HTTP)

---

## Server Naming Conventions

Follow these standardized naming patterns:

**Python**: Use format \`{service}_mcp\` (lowercase with underscores)
- Examples: \`slack_mcp\`, \`github_mcp\`, \`jira_mcp\`

**Node/TypeScript**: Use format \`{service}-mcp-server\` (lowercase with hyphens)
- Examples: \`slack-mcp-server\`, \`github-mcp-server\`, \`jira-mcp-server\`

The name should be general, descriptive of the service being integrated, easy to infer from the task description, and without version numbers.

---

## Tool Naming and Design

### Tool Naming

1. **Use snake_case**: \`search_users\`, \`create_project\`, \`get_channel_info\`
2. **Include service prefix**: Anticipate that your MCP server may be used alongside other MCP servers
   - Use \`slack_send_message\` instead of just \`send_message\`
   - Use \`github_create_issue\` instead of just \`create_issue\`
3. **Be action-oriented**: Start with verbs (get, list, search, create, etc.)
4. **Be specific**: Avoid generic names that could conflict with other servers

### Tool Design

- Tool descriptions must narrowly and unambiguously describe functionality
- Descriptions must precisely match actual functionality
- Provide tool annotations (readOnlyHint, destructiveHint, idempotentHint, openWorldHint)
- Keep tool operations focused and atomic

---

## Response Formats

All tools that return data should support multiple formats:

### JSON Format (\`response_format="json"\`)
- Machine-readable structured data
- Include all available fields and metadata
- Consistent field names and types
- Use for programmatic processing

### Markdown Format (\`response_format="markdown"\`, typically default)
- Human-readable formatted text
- Use headers, lists, and formatting for clarity
- Convert timestamps to human-readable format
- Show display names with IDs in parentheses
- Omit verbose metadata

---

## Pagination

For tools that list resources:

- **Always respect the \`limit\` parameter**
- **Implement pagination**: Use \`offset\` or cursor-based pagination
- **Return pagination metadata**: Include \`has_more\`, \`next_offset\`/\`next_cursor\`, \`total_count\`
- **Never load all results into memory**: Especially important for large datasets
- **Default to reasonable limits**: 20-50 items is typical

Example pagination response:
\`\`\`json
{
  "total": 150,
  "count": 20,
  "offset": 0,
  "items": [...],
  "has_more": true,
  "next_offset": 20
}
\`\`\`

---

## Transport Options

### Streamable HTTP

**Best for**: Remote servers, web services, multi-client scenarios

**Characteristics**:
- Bidirectional communication over HTTP
- Supports multiple simultaneous clients
- Can be deployed as a web service
- Enables server-to-client notifications

**Use when**:
- Serving multiple clients simultaneously
- Deploying as a cloud service
- Integration with web applications

### stdio

**Best for**: Local integrations, command-line tools

**Characteristics**:
- Standard input/output stream communication
- Simple setup, no network configuration needed
- Runs as a subprocess of the client

**Use when**:
- Building tools for local development environments
- Integrating with desktop applications
- Single-user, single-session scenarios

**Note**: stdio servers should NOT log to stdout (use stderr for logging)

### Transport Selection

| Criterion | stdio | Streamable HTTP |
|-----------|-------|-----------------|
| **Deployment** | Local | Remote |
| **Clients** | Single | Multiple |
| **Complexity** | Low | Medium |
| **Real-time** | No | Yes |

---

## Security Best Practices

### Authentication and Authorization

**OAuth 2.1**:
- Use secure OAuth 2.1 with certificates from recognized authorities
- Validate access tokens before processing requests
- Only accept tokens specifically intended for your server

**API Keys**:
- Store API keys in environment variables, never in code
- Validate keys on server startup
- Provide clear error messages when authentication fails

### Input Validation

- Sanitize file paths to prevent directory traversal
- Validate URLs and external identifiers
- Check parameter sizes and ranges
- Prevent command injection in system calls
- Use schema validation (Pydantic/Zod) for all inputs

### Error Handling

- Don't expose internal errors to clients
- Log security-relevant errors server-side
- Provide helpful but not revealing error messages
- Clean up resources after errors

### DNS Rebinding Protection

For streamable HTTP servers running locally:
- Enable DNS rebinding protection
- Validate the \`Origin\` header on all incoming connections
- Bind to \`127.0.0.1\` rather than \`0.0.0.0\`

---

## Tool Annotations

Provide annotations to help clients understand tool behavior:

| Annotation | Type | Default | Description |
|-----------|------|---------|-------------|
| \`readOnlyHint\` | boolean | false | Tool does not modify its environment |
| \`destructiveHint\` | boolean | true | Tool may perform destructive updates |
| \`idempotentHint\` | boolean | false | Repeated calls with same args have no additional effect |
| \`openWorldHint\` | boolean | true | Tool interacts with external entities |

**Important**: Annotations are hints, not security guarantees. Clients should not make security-critical decisions based solely on annotations.

---

## Error Handling

- Use standard JSON-RPC error codes
- Report tool errors within result objects (not protocol-level errors)
- Provide helpful, specific error messages with suggested next steps
- Don't expose internal implementation details
- Clean up resources properly on errors

Example error handling:
\`\`\`typescript
try {
  const result = performOperation();
  return { content: [{ type: "text", text: result }] };
} catch (error) {
  return {
    isError: true,
    content: [{
      type: "text",
      text: \`Error: \${error.message}. Try using filter='active_only' to reduce results.\`
    }]
  };
}
\`\`\`

---

## Testing Requirements

Comprehensive testing should cover:

- **Functional testing**: Verify correct execution with valid/invalid inputs
- **Integration testing**: Test interaction with external systems
- **Security testing**: Validate auth, input sanitization, rate limiting
- **Performance testing**: Check behavior under load, timeouts
- **Error handling**: Ensure proper error reporting and cleanup

---

## Documentation Requirements

- Provide clear documentation of all tools and capabilities
- Include working examples (at least 3 per major feature)
- Document security considerations
- Specify required permissions and access levels
- Document rate limits and performance characteristics

---

# Node/TypeScript MCP Server Implementation Guide

## Overview

This document provides Node/TypeScript-specific best practices and examples for implementing MCP servers using the MCP TypeScript SDK. It covers project structure, server setup, tool registration patterns, input validation with Zod, error handling, and complete working examples.

---

## Quick Reference

### Key Imports
\`\`\`typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import express from "express";
import { z } from "zod";
\`\`\`

### Server Initialization
\`\`\`typescript
const server = new McpServer({
  name: "service-mcp-server",
  version: "1.0.0"
});
\`\`\`

### Tool Registration Pattern
\`\`\`typescript
server.registerTool(
  "tool_name",
  {
    title: "Tool Display Name",
    description: "What the tool does",
    inputSchema: { param: z.string() },
    outputSchema: { result: z.string() }
  },
  async ({ param }) => {
    const output = { result: \`Processed: \${param}\` };
    return {
      content: [{ type: "text", text: JSON.stringify(output) }],
      structuredContent: output
    };
  }
);
\`\`\`

---

## MCP TypeScript SDK

The official MCP TypeScript SDK provides:
- \`McpServer\` class for server initialization
- \`registerTool\` method for tool registration
- Zod schema integration for runtime input validation
- Type-safe tool handler implementations

**IMPORTANT - Use Modern APIs Only:**
- **DO use**: \`server.registerTool()\`, \`server.registerResource()\`, \`server.registerPrompt()\`
- **DO NOT use**: Old deprecated APIs such as \`server.tool()\`, \`server.setRequestHandler(ListToolsRequestSchema, ...)\`, or manual handler registration
- The \`register*\` methods provide better type safety, automatic schema handling, and are the recommended approach

## Server Naming Convention

Node/TypeScript MCP servers must follow this naming pattern:
- **Format**: \`{service}-mcp-server\` (lowercase with hyphens)
- **Examples**: \`github-mcp-server\`, \`jira-mcp-server\`, \`stripe-mcp-server\`

## Project Structure

\`\`\`
{service}-mcp-server/
\u251C\u2500\u2500 package.json
\u251C\u2500\u2500 tsconfig.json
\u251C\u2500\u2500 README.md
\u251C\u2500\u2500 src/
\u2502   \u251C\u2500\u2500 index.ts          # Main entry point with McpServer initialization
\u2502   \u251C\u2500\u2500 types.ts          # TypeScript type definitions and interfaces
\u2502   \u251C\u2500\u2500 tools/            # Tool implementations (one file per domain)
\u2502   \u251C\u2500\u2500 services/         # API clients and shared utilities
\u2502   \u251C\u2500\u2500 schemas/          # Zod validation schemas
\u2502   \u2514\u2500\u2500 constants.ts      # Shared constants (API_URL, CHARACTER_LIMIT, etc.)
\u2514\u2500\u2500 dist/                 # Built JavaScript files (entry point: dist/index.js)
\`\`\`

## Tool Implementation

### Tool Naming

Use snake_case for tool names with clear, action-oriented names. Include the service context to prevent overlaps.

### Tool Structure

Tools are registered using the \`registerTool\` method with:
- Zod schemas for runtime input validation and type safety
- Explicitly provided \`title\`, \`description\`, \`inputSchema\`, and \`annotations\`
- The \`inputSchema\` must be a Zod schema object (not a JSON schema)

\`\`\`typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const server = new McpServer({
  name: "example-mcp",
  version: "1.0.0"
});

const UserSearchInputSchema = z.object({
  query: z.string()
    .min(2, "Query must be at least 2 characters")
    .max(200, "Query must not exceed 200 characters")
    .describe("Search string to match against names/emails"),
  limit: z.number()
    .int()
    .min(1)
    .max(100)
    .default(20)
    .describe("Maximum results to return"),
  offset: z.number()
    .int()
    .min(0)
    .default(0)
    .describe("Number of results to skip for pagination"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' for human-readable or 'json' for machine-readable")
}).strict();

type UserSearchInput = z.infer<typeof UserSearchInputSchema>;

server.registerTool(
  "example_search_users",
  {
    title: "Search Example Users",
    description: \`Search for users in the Example system by name, email, or team.\`,
    inputSchema: UserSearchInputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    }
  },
  async (params: UserSearchInput) => {
    // Implementation
  }
);
\`\`\`

## Zod Schemas for Input Validation

\`\`\`typescript
import { z } from "zod";

const CreateUserSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email("Invalid email format"),
  age: z.number().int().min(0).max(150)
}).strict();

enum ResponseFormat {
  MARKDOWN = "markdown",
  JSON = "json"
}

const PaginationSchema = z.object({
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0)
});
\`\`\`

## Character Limits and Truncation

\`\`\`typescript
export const CHARACTER_LIMIT = 25000;

async function searchTool(params: SearchInput) {
  let result = generateResponse(data);
  if (result.length > CHARACTER_LIMIT) {
    const truncatedData = data.slice(0, Math.max(1, data.length / 2));
    response.truncated = true;
    response.truncation_message =
      \`Response truncated. Use 'offset' parameter or add filters to see more results.\`;
    result = JSON.stringify(response, null, 2);
  }
  return result;
}
\`\`\`

## Error Handling

\`\`\`typescript
function handleApiError(error: unknown): string {
  if (error instanceof AxiosError) {
    if (error.response) {
      switch (error.response.status) {
        case 404: return "Error: Resource not found. Please check the ID is correct.";
        case 403: return "Error: Permission denied.";
        case 429: return "Error: Rate limit exceeded. Please wait.";
        default: return \`Error: API request failed with status \${error.response.status}\`;
      }
    }
  }
  return \`Error: Unexpected error occurred: \${error instanceof Error ? error.message : String(error)}\`;
}
\`\`\`

## Package Configuration

### package.json
\`\`\`json
{
  "name": "{service}-mcp-server",
  "version": "1.0.0",
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "start": "node dist/index.js",
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.6.1",
    "axios": "^1.7.9",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2"
  }
}
\`\`\`

### tsconfig.json
\`\`\`json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
\`\`\`

## Advanced MCP Features

### Resource Registration

\`\`\`typescript
server.registerResource(
  {
    uri: "file://documents/{name}",
    name: "Document Resource",
    description: "Access documents by name",
    mimeType: "text/plain"
  },
  async (uri: string) => {
    const match = uri.match(/^file:\\/\\/documents\\/(.+)$/);
    const documentName = match[1];
    const content = await loadDocument(documentName);
    return { contents: [{ uri, mimeType: "text/plain", text: content }] };
  }
);
\`\`\`

### Transport Options

#### Streamable HTTP (Recommended for Remote Servers)
\`\`\`typescript
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";

const app = express();
app.use(express.json());

app.post('/mcp', async (req, res) => {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true
  });
  res.on('close', () => transport.close());
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});
\`\`\`

#### stdio (For Local Integrations)
\`\`\`typescript
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
const transport = new StdioServerTransport();
await server.connect(transport);
\`\`\`

## Quality Checklist

### Strategic Design
- [ ] Tools enable complete workflows, not just API endpoint wrappers
- [ ] Tool names reflect natural task subdivisions
- [ ] Response formats optimize for agent context efficiency
- [ ] Error messages guide agents toward correct usage

### Implementation Quality
- [ ] All tools registered using \`registerTool\` with complete configuration
- [ ] All tools include \`title\`, \`description\`, \`inputSchema\`, and \`annotations\`
- [ ] All tools use Zod schemas with \`.strict()\` enforcement
- [ ] Descriptions include return value examples and schema documentation

### TypeScript Quality
- [ ] Strict TypeScript enabled in tsconfig.json
- [ ] No use of \`any\` type
- [ ] All async functions have explicit Promise<T> return types

### Testing and Build
- [ ] \`npm run build\` completes successfully without errors
- [ ] dist/index.js created and executable
- [ ] All imports resolve correctly

---

# Python MCP Server Implementation Guide

## Overview

This document provides Python-specific best practices and examples for implementing MCP servers using the MCP Python SDK.

---

## Quick Reference

### Key Imports
\`\`\`python
from mcp.server.fastmcp import FastMCP
from pydantic import BaseModel, Field, field_validator, ConfigDict
from typing import Optional, List, Dict, Any
from enum import Enum
import httpx
\`\`\`

### Server Initialization
\`\`\`python
mcp = FastMCP("service_mcp")
\`\`\`

### Tool Registration Pattern
\`\`\`python
@mcp.tool(name="tool_name", annotations={...})
async def tool_function(params: InputModel) -> str:
    pass
\`\`\`

---

## MCP Python SDK and FastMCP

FastMCP provides:
- Automatic description and inputSchema generation from function signatures and docstrings
- Pydantic model integration for input validation
- Decorator-based tool registration with \`@mcp.tool\`

## Server Naming Convention

- **Format**: \`{service}_mcp\` (lowercase with underscores)
- **Examples**: \`github_mcp\`, \`jira_mcp\`, \`stripe_mcp\`

## Tool Implementation with FastMCP

\`\`\`python
from pydantic import BaseModel, Field, ConfigDict
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("example_mcp")

class ServiceToolInput(BaseModel):
    model_config = ConfigDict(
        str_strip_whitespace=True,
        validate_assignment=True,
        extra='forbid'
    )
    param1: str = Field(..., description="First parameter", min_length=1, max_length=100)
    param2: Optional[int] = Field(default=None, description="Optional integer", ge=0, le=1000)

@mcp.tool(
    name="service_tool_name",
    annotations={
        "title": "Human-Readable Tool Title",
        "readOnlyHint": True,
        "destructiveHint": False,
        "idempotentHint": True,
        "openWorldHint": False
    }
)
async def service_tool_name(params: ServiceToolInput) -> str:
    '''Tool description automatically becomes the 'description' field.'''
    pass
\`\`\`

## Pydantic v2 Key Features

- Use \`model_config\` instead of nested \`Config\` class
- Use \`field_validator\` instead of deprecated \`validator\`
- Use \`model_dump()\` instead of deprecated \`dict()\`
- Validators require \`@classmethod\` decorator

\`\`\`python
from pydantic import BaseModel, Field, field_validator, ConfigDict

class CreateUserInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, validate_assignment=True)
    name: str = Field(..., description="User's full name", min_length=1, max_length=100)
    email: str = Field(..., description="User's email", pattern=r'^[\\w\\.-]+@[\\w\\.-]+\\.\\w+$')

    @field_validator('email')
    @classmethod
    def validate_email(cls, v: str) -> str:
        return v.lower()
\`\`\`

## Response Format Options

\`\`\`python
from enum import Enum

class ResponseFormat(str, Enum):
    MARKDOWN = "markdown"
    JSON = "json"
\`\`\`

## Error Handling

\`\`\`python
def _handle_api_error(e: Exception) -> str:
    if isinstance(e, httpx.HTTPStatusError):
        if e.response.status_code == 404:
            return "Error: Resource not found."
        elif e.response.status_code == 403:
            return "Error: Permission denied."
        elif e.response.status_code == 429:
            return "Error: Rate limit exceeded."
        return f"Error: API request failed with status {e.response.status_code}"
    elif isinstance(e, httpx.TimeoutException):
        return "Error: Request timed out."
    return f"Error: Unexpected error: {type(e).__name__}"
\`\`\`

## Advanced FastMCP Features

### Context Parameter Injection

\`\`\`python
from mcp.server.fastmcp import FastMCP, Context

@mcp.tool()
async def advanced_search(query: str, ctx: Context) -> str:
    await ctx.report_progress(0.25, "Starting search...")
    await ctx.log_info("Processing query", {"query": query})
    results = await search_api(query)
    return format_results(results)
\`\`\`

### Resource Registration

\`\`\`python
@mcp.resource("file://documents/{name}")
async def get_document(name: str) -> str:
    with open(f"./docs/{name}", "r") as f:
        return f.read()
\`\`\`

### Lifespan Management

\`\`\`python
from contextlib import asynccontextmanager

@asynccontextmanager
async def app_lifespan():
    db = await connect_to_database()
    yield {"db": db}
    await db.close()

mcp = FastMCP("example_mcp", lifespan=app_lifespan)
\`\`\`

### Transport Options

\`\`\`python
# stdio transport (default)
if __name__ == "__main__":
    mcp.run()

# Streamable HTTP transport
if __name__ == "__main__":
    mcp.run(transport="streamable_http", port=8000)
\`\`\`

## Quality Checklist

### Implementation Quality
- [ ] All tools have descriptive names and documentation
- [ ] Server name follows format: \`{service}_mcp\`
- [ ] All network operations use async/await
- [ ] Common functionality extracted into reusable functions

### Tool Configuration
- [ ] All tools implement 'name' and 'annotations' in the decorator
- [ ] All tools use Pydantic BaseModel for input validation
- [ ] All Pydantic Fields have explicit types, descriptions, and constraints
- [ ] All tools have comprehensive docstrings

### Testing
- [ ] Server runs successfully
- [ ] All imports resolve correctly
- [ ] Error scenarios handled gracefully

---

# MCP Server Evaluation Guide

## Overview

This document provides guidance on creating comprehensive evaluations for MCP servers. Evaluations test whether LLMs can effectively use your MCP server to answer realistic, complex questions using only the tools provided.

---

## Quick Reference

### Evaluation Requirements
- Create 10 human-readable questions
- Questions must be READ-ONLY, INDEPENDENT, NON-DESTRUCTIVE
- Each question requires multiple tool calls (potentially dozens)
- Answers must be single, verifiable values
- Answers must be STABLE (won't change over time)

### Output Format
\`\`\`xml
<evaluation>
   <qa_pair>
      <question>Your question here</question>
      <answer>Single verifiable answer</answer>
   </qa_pair>
</evaluation>
\`\`\`

---

## Purpose of Evaluations

The measure of quality of an MCP server is NOT how well or comprehensively the server implements tools, but how well these implementations (input/output schemas, docstrings/descriptions, functionality) enable LLMs with no other context and access ONLY to the MCP servers to answer realistic and difficult questions.

## Evaluation Overview

Create 10 human-readable questions requiring ONLY READ-ONLY, INDEPENDENT, NON-DESTRUCTIVE, and IDEMPOTENT operations to answer. Each question should be:
- Realistic
- Clear and concise
- Unambiguous
- Complex, requiring potentially dozens of tool calls or steps
- Answerable with a single, verifiable value that you identify in advance

## Question Guidelines

### Core Requirements

1. **Questions MUST be independent** - not dependent on other questions
2. **Questions MUST require ONLY NON-DESTRUCTIVE AND IDEMPOTENT tool use**
3. **Questions must be REALISTIC, CLEAR, CONCISE, and COMPLEX**

### Complexity and Depth

4. **Questions must require deep exploration** - multi-hop questions requiring multiple sub-questions
5. **Questions may require extensive paging** through multiple pages of results
6. **Questions must require deep understanding** rather than surface-level knowledge
7. **Questions must not be solvable with straightforward keyword search**

### Tool Testing

8. **Questions should stress-test tool return values**
9. **Questions should MOSTLY reflect real human use cases**
10. **Questions may require dozens of tool calls**
11. **Include ambiguous questions** that force difficult decisions

### Stability

12. **Questions must be designed so the answer DOES NOT CHANGE**
13. **DO NOT let the MCP server RESTRICT the kinds of questions you create**

## Answer Guidelines

### Verification
- Answers must be VERIFIABLE via direct string comparison
- Specify the output format in the QUESTION (e.g., "Use YYYY/MM/DD.", "Respond True or False.")
- Answer should be a single VERIFIABLE value

### Readability
- Prefer HUMAN-READABLE formats (names, dates, URLs, yes/no, true/false)

### Stability
- Look at old content and "closed" concepts that will always return the same answer

### Diversity
- Answers should cover diverse modalities and formats

## Evaluation Process

### Step 1: Documentation Inspection
Read the documentation of the target API.

### Step 2: Tool Inspection
List the tools available in the MCP server without calling them.

### Step 3: Developing Understanding
Iterate until you understand the kinds of tasks you want to create.

### Step 4: Read-Only Content Inspection
USE the MCP server tools with READ-ONLY operations only to identify specific content for creating realistic questions. Make INCREMENTAL, SMALL, AND TARGETED tool calls.

### Step 5: Task Generation
Create 10 human-readable questions following all guidelines.

## Good Question Examples

**Multi-hop question (GitHub MCP):**
\`\`\`xml
<qa_pair>
   <question>Find the repository that was archived in Q3 2023 and had previously been the most forked project in the organization. What was the primary programming language?</question>
   <answer>Python</answer>
</qa_pair>
\`\`\`

**Complex aggregation (Issue Tracker MCP):**
\`\`\`xml
<qa_pair>
   <question>Among all bugs reported in January 2024 that were marked as critical priority, which assignee resolved the highest percentage of their assigned bugs within 48 hours? Provide the assignee's username.</question>
   <answer>alex_eng</answer>
</qa_pair>
\`\`\`

## Running Evaluations

### Setup

\`\`\`bash
pip install -r scripts/requirements.txt
export ANTHROPIC_API_KEY=your_api_key_here
\`\`\`

### Running

**Local STDIO Server:**
\`\`\`bash
python scripts/evaluation.py \\
  -t stdio \\
  -c python \\
  -a my_mcp_server.py \\
  evaluation.xml
\`\`\`

**Server-Sent Events (SSE):**
\`\`\`bash
python scripts/evaluation.py \\
  -t sse \\
  -u https://example.com/mcp \\
  -H "Authorization: Bearer token123" \\
  evaluation.xml
\`\`\`

**HTTP (Streamable HTTP):**
\`\`\`bash
python scripts/evaluation.py \\
  -t http \\
  -u https://example.com/mcp \\
  -H "Authorization: Bearer token123" \\
  evaluation.xml
\`\`\`

### Command-Line Options

\`\`\`
positional arguments:
  eval_file             Path to evaluation XML file

optional arguments:
  -t, --transport       Transport type: stdio, sse, or http (default: stdio)
  -m, --model           Claude model to use (default: claude-3-7-sonnet-20250219)
  -o, --output          Output file for report
  -c, --command         Command to run MCP server (stdio only)
  -a, --args            Arguments for the command (stdio only)
  -e, --env             Environment variables in KEY=VALUE format (stdio only)
  -u, --url             MCP server URL (sse/http only)
  -H, --header          HTTP headers in 'Key: Value' format (sse/http only)
\`\`\`

## Troubleshooting

### Low Accuracy
- Review the agent's feedback for each task
- Check if tool descriptions are clear and comprehensive
- Consider whether tools return too much or too little data
- Ensure error messages are actionable
`},{path:"skills/mcp-builder/skill.md",content:`---
name: mcp-builder
description: "Build MCP (Model Context Protocol) servers for LLM-to-service integration. Python (FastMCP) or TypeScript."
tags:
  - mcp
  - api-integration
  - development
  - server
---

# MCP Server Development Guide

## Overview

Create MCP (Model Context Protocol) servers that enable LLMs to interact with external services through well-designed tools. The quality of an MCP server is measured by how well it enables LLMs to accomplish real-world tasks.

---

# Process

## High-Level Workflow

Creating a high-quality MCP server involves four main phases:

### Phase 1: Deep Research and Planning

#### 1.1 Understand Modern MCP Design

**API Coverage vs. Workflow Tools:**
Balance comprehensive API endpoint coverage with specialized workflow tools. Workflow tools can be more convenient for specific tasks, while comprehensive coverage gives agents flexibility to compose operations. Performance varies by client--some clients benefit from code execution that combines basic tools, while others work better with higher-level workflows. When uncertain, prioritize comprehensive API coverage.

**Tool Naming and Discoverability:**
Clear, descriptive tool names help agents find the right tools quickly. Use consistent prefixes (e.g., \`github_create_issue\`, \`github_list_repos\`) and action-oriented naming.

**Context Management:**
Agents benefit from concise tool descriptions and the ability to filter/paginate results. Design tools that return focused, relevant data. Some clients support code execution which can help agents filter and process data efficiently.

**Actionable Error Messages:**
Error messages should guide agents toward solutions with specific suggestions and next steps.

#### 1.2 Study MCP Protocol Documentation

**Navigate the MCP specification:**

Start with the sitemap to find relevant pages: \`https://modelcontextprotocol.io/sitemap.xml\`

Then fetch specific pages with \`.md\` suffix for markdown format (e.g., \`https://modelcontextprotocol.io/specification/draft.md\`).

Key pages to review:
- Specification overview and architecture
- Transport mechanisms (streamable HTTP, stdio)
- Tool, resource, and prompt definitions

#### 1.3 Study Framework Documentation

**Recommended stack:**
- **Language**: TypeScript (high-quality SDK support and good compatibility in many execution environments e.g. MCPB. Plus AI models are good at generating TypeScript code, benefiting from its broad usage, static typing and good linting tools)
- **Transport**: Streamable HTTP for remote servers, using stateless JSON (simpler to scale and maintain, as opposed to stateful sessions and streaming responses). stdio for local servers.

**Load framework documentation:**

- **MCP Best Practices**: See references.md - Core guidelines

**For TypeScript (recommended):**
- **TypeScript SDK**: Use WebFetch to load \`https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/main/README.md\`
- See references.md for the TypeScript Implementation Guide

**For Python:**
- **Python SDK**: Use WebFetch to load \`https://raw.githubusercontent.com/modelcontextprotocol/python-sdk/main/README.md\`
- See references.md for the Python Implementation Guide

#### 1.4 Plan Your Implementation

**Understand the API:**
Review the service's API documentation to identify key endpoints, authentication requirements, and data models. Use web search and WebFetch as needed.

**Tool Selection:**
Prioritize comprehensive API coverage. List endpoints to implement, starting with the most common operations.

---

### Phase 2: Implementation

#### 2.1 Set Up Project Structure

See language-specific guides in references.md for project setup:
- TypeScript Guide - Project structure, package.json, tsconfig.json
- Python Guide - Module organization, dependencies

#### 2.2 Implement Core Infrastructure

Create shared utilities:
- API client with authentication
- Error handling helpers
- Response formatting (JSON/Markdown)
- Pagination support

#### 2.3 Implement Tools

For each tool:

**Input Schema:**
- Use Zod (TypeScript) or Pydantic (Python)
- Include constraints and clear descriptions
- Add examples in field descriptions

**Output Schema:**
- Define \`outputSchema\` where possible for structured data
- Use \`structuredContent\` in tool responses (TypeScript SDK feature)
- Helps clients understand and process tool outputs

**Tool Description:**
- Concise summary of functionality
- Parameter descriptions
- Return type schema

**Implementation:**
- Async/await for I/O operations
- Proper error handling with actionable messages
- Support pagination where applicable
- Return both text content and structured data when using modern SDKs

**Annotations:**
- \`readOnlyHint\`: true/false
- \`destructiveHint\`: true/false
- \`idempotentHint\`: true/false
- \`openWorldHint\`: true/false

---

### Phase 3: Review and Test

#### 3.1 Code Quality

Review for:
- No duplicated code (DRY principle)
- Consistent error handling
- Full type coverage
- Clear tool descriptions

#### 3.2 Build and Test

**TypeScript:**
- Run \`npm run build\` to verify compilation
- Test with MCP Inspector: \`npx @modelcontextprotocol/inspector\`

**Python:**
- Verify syntax: \`python -m py_compile your_server.py\`
- Test with MCP Inspector

See language-specific guides in references.md for detailed testing approaches and quality checklists.

---

### Phase 4: Create Evaluations

After implementing your MCP server, create comprehensive evaluations to test its effectiveness.

**Load the Evaluation Guide section in references.md for complete evaluation guidelines.**

#### 4.1 Understand Evaluation Purpose

Use evaluations to test whether LLMs can effectively use your MCP server to answer realistic, complex questions.

#### 4.2 Create 10 Evaluation Questions

To create effective evaluations, follow the process outlined in the evaluation guide:

1. **Tool Inspection**: List available tools and understand their capabilities
2. **Content Exploration**: Use READ-ONLY operations to explore available data
3. **Question Generation**: Create 10 complex, realistic questions
4. **Answer Verification**: Solve each question yourself to verify answers

#### 4.3 Evaluation Requirements

Ensure each question is:
- **Independent**: Not dependent on other questions
- **Read-only**: Only non-destructive operations required
- **Complex**: Requiring multiple tool calls and deep exploration
- **Realistic**: Based on real use cases humans would care about
- **Verifiable**: Single, clear answer that can be verified by string comparison
- **Stable**: Answer won't change over time

#### 4.4 Output Format

Create an XML file with this structure:

\`\`\`xml
<evaluation>
  <qa_pair>
    <question>Find discussions about AI model launches with animal codenames. One model needed a specific safety designation that uses the format ASL-X. What number X was being determined for the model named after a spotted wild cat?</question>
    <answer>3</answer>
  </qa_pair>
<!-- More qa_pairs... -->
</evaluation>
\`\`\`

---

# Reference Files

## Documentation Library

Load these resources as needed during development:

### Core MCP Documentation (Load First)
- **MCP Protocol**: Start with sitemap at \`https://modelcontextprotocol.io/sitemap.xml\`, then fetch specific pages with \`.md\` suffix
- **MCP Best Practices** (in references.md) - Universal MCP guidelines including:
  - Server and tool naming conventions
  - Response format guidelines (JSON vs Markdown)
  - Pagination best practices
  - Transport selection (streamable HTTP vs stdio)
  - Security and error handling standards

### SDK Documentation (Load During Phase 1/2)
- **Python SDK**: Fetch from \`https://raw.githubusercontent.com/modelcontextprotocol/python-sdk/main/README.md\`
- **TypeScript SDK**: Fetch from \`https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/main/README.md\`

### Language-Specific Implementation Guides (Load During Phase 2)
- **Python Implementation Guide** (in references.md) - Complete Python/FastMCP guide with:
  - Server initialization patterns
  - Pydantic model examples
  - Tool registration with \`@mcp.tool\`
  - Complete working examples
  - Quality checklist

- **TypeScript Implementation Guide** (in references.md) - Complete TypeScript guide with:
  - Project structure
  - Zod schema patterns
  - Tool registration with \`server.registerTool\`
  - Complete working examples
  - Quality checklist

### Evaluation Guide (Load During Phase 4)
- **Evaluation Guide** (in references.md) - Complete evaluation creation guide with:
  - Question creation guidelines
  - Answer verification strategies
  - XML format specifications
  - Example questions and answers
  - Running an evaluation with the provided scripts
`},{path:"skills/mcp-builder/tools.md",content:`# MCP Builder Tools

## Scripts

All scripts are located in the \`scripts/\` directory relative to the skill.

### evaluation.py

MCP Server Evaluation Harness. Evaluates MCP servers by running test questions against them using Claude.

**Usage:**

\`\`\`bash
python scripts/evaluation.py [options] eval_file
\`\`\`

**Arguments:**

| Argument | Description |
|----------|-------------|
| \`eval_file\` | Path to evaluation XML file |
| \`-t, --transport\` | Transport type: \`stdio\`, \`sse\`, or \`http\` (default: \`stdio\`) |
| \`-m, --model\` | Claude model to use (default: \`claude-3-7-sonnet-20250219\`) |
| \`-o, --output\` | Output file for report (default: print to stdout) |
| \`-c, --command\` | Command to run MCP server (stdio only, e.g., \`python\`, \`node\`) |
| \`-a, --args\` | Arguments for the command (stdio only, e.g., \`server.py\`) |
| \`-e, --env\` | Environment variables in \`KEY=VALUE\` format (stdio only) |
| \`-u, --url\` | MCP server URL (sse/http only) |
| \`-H, --header\` | HTTP headers in \`'Key: Value'\` format (sse/http only) |

**Examples:**

\`\`\`bash
# Local STDIO server
python scripts/evaluation.py -t stdio -c python -a my_server.py evaluation.xml

# With environment variables
python scripts/evaluation.py -t stdio -c python -a my_server.py -e API_KEY=abc123 evaluation.xml

# SSE server
python scripts/evaluation.py -t sse -u https://example.com/mcp -H "Authorization: Bearer token" evaluation.xml

# HTTP server with output file
python scripts/evaluation.py -t http -u https://example.com/mcp -o report.md evaluation.xml
\`\`\`

**Important:**
- For **stdio** transport: The script automatically launches and manages the MCP server process. Do not run the server manually.
- For **sse/http** transports: You must start the MCP server separately before running the evaluation.

**Output:** Generates a detailed report including accuracy, average task duration, tool call counts, per-task results with feedback.

---

### connections.py

Lightweight connection handling for MCP servers. Provides connection classes for different transport types.

**Classes:**

| Class | Description |
|-------|-------------|
| \`MCPConnectionStdio\` | MCP connection using standard input/output |
| \`MCPConnectionSSE\` | MCP connection using Server-Sent Events |
| \`MCPConnectionHTTP\` | MCP connection using Streamable HTTP |

**Factory function:**

\`\`\`python
from connections import create_connection

conn = create_connection(
    transport="stdio",  # or "sse", "http"
    command="python",   # stdio only
    args=["server.py"], # stdio only
    url="https://...",  # sse/http only
    headers={...}       # sse/http only
)
\`\`\`

**Usage as async context manager:**

\`\`\`python
async with create_connection(transport="stdio", command="python", args=["server.py"]) as conn:
    tools = await conn.list_tools()
    result = await conn.call_tool("tool_name", {"param": "value"})
\`\`\`

---

### requirements.txt

Dependencies for the evaluation scripts:

\`\`\`
anthropic>=0.39.0
mcp>=1.1.0
\`\`\`

Install with: \`pip install -r scripts/requirements.txt\`

---

### example_evaluation.xml

Example evaluation file demonstrating the XML format for evaluation questions:

\`\`\`xml
<evaluation>
   <qa_pair>
      <question>Calculate the compound interest on $10,000 invested at 5% annual interest rate, compounded monthly for 3 years. What is the final amount in dollars (rounded to 2 decimal places)?</question>
      <answer>11614.72</answer>
   </qa_pair>
   <!-- More qa_pairs... -->
</evaluation>
\`\`\`
`},{path:"skills/pdf/references.md",content:`# PDF Skill References

This file combines the forms guide and advanced reference documentation for the PDF skill.

## Table of Contents

- [Forms Guide](#forms-guide)
  - [Fillable Fields](#fillable-fields)
  - [Non-fillable Fields](#non-fillable-fields)
  - [Hybrid Approach](#hybrid-approach)
- [Advanced Reference](#advanced-reference)
  - [pypdfium2 Library](#pypdfium2-library)
  - [JavaScript Libraries](#javascript-libraries)
  - [Advanced Command-Line Operations](#advanced-command-line-operations)
  - [Advanced Python Techniques](#advanced-python-techniques)
  - [Complex Workflows](#complex-workflows)
  - [Performance Optimization Tips](#performance-optimization-tips)
  - [Troubleshooting Common Issues](#troubleshooting-common-issues)

---

# Forms Guide

**CRITICAL: You MUST complete these steps in order. Do not skip ahead to writing code.**

If you need to fill out a PDF form, first check to see if the PDF has fillable form fields. Run this script from this file's directory:
 \`python scripts/check_fillable_fields <file.pdf>\`, and depending on the result go to either the "Fillable fields" or "Non-fillable fields" and follow those instructions.

## Fillable Fields

If the PDF has fillable form fields:
- Run this script from this file's directory: \`python scripts/extract_form_field_info.py <input.pdf> <field_info.json>\`. It will create a JSON file with a list of fields in this format:
\`\`\`
[
  {
    "field_id": (unique ID for the field),
    "page": (page number, 1-based),
    "rect": ([left, bottom, right, top] bounding box in PDF coordinates, y=0 is the bottom of the page),
    "type": ("text", "checkbox", "radio_group", or "choice"),
  },
  // Checkboxes have "checked_value" and "unchecked_value" properties:
  {
    "field_id": (unique ID for the field),
    "page": (page number, 1-based),
    "type": "checkbox",
    "checked_value": (Set the field to this value to check the checkbox),
    "unchecked_value": (Set the field to this value to uncheck the checkbox),
  },
  // Radio groups have a "radio_options" list with the possible choices.
  {
    "field_id": (unique ID for the field),
    "page": (page number, 1-based),
    "type": "radio_group",
    "radio_options": [
      {
        "value": (set the field to this value to select this radio option),
        "rect": (bounding box for the radio button for this option)
      },
    ]
  },
  // Multiple choice fields have a "choice_options" list with the possible choices:
  {
    "field_id": (unique ID for the field),
    "page": (page number, 1-based),
    "type": "choice",
    "choice_options": [
      {
        "value": (set the field to this value to select this option),
        "text": (display text of the option)
      },
    ],
  }
]
\`\`\`
- Convert the PDF to PNGs (one image for each page) with this script (run from this file's directory):
\`python scripts/convert_pdf_to_images.py <file.pdf> <output_directory>\`
Then analyze the images to determine the purpose of each form field (make sure to convert the bounding box PDF coordinates to image coordinates).
- Create a \`field_values.json\` file in this format with the values to be entered for each field:
\`\`\`
[
  {
    "field_id": "last_name",
    "description": "The user's last name",
    "page": 1,
    "value": "Simpson"
  },
  {
    "field_id": "Checkbox12",
    "description": "Checkbox to be checked if the user is 18 or over",
    "page": 1,
    "value": "/On"
  },
]
\`\`\`
- Run the \`fill_fillable_fields.py\` script from this file's directory to create a filled-in PDF:
\`python scripts/fill_fillable_fields.py <input pdf> <field_values.json> <output pdf>\`
This script will verify that the field IDs and values you provide are valid; if it prints error messages, correct the appropriate fields and try again.

## Non-fillable Fields

If the PDF doesn't have fillable form fields, you'll add text annotations. First try to extract coordinates from the PDF structure (more accurate), then fall back to visual estimation if needed.

### Step 1: Try Structure Extraction First

Run this script to extract text labels, lines, and checkboxes with their exact PDF coordinates:
\`python scripts/extract_form_structure.py <input.pdf> form_structure.json\`

This creates a JSON file containing:
- **labels**: Every text element with exact coordinates (x0, top, x1, bottom in PDF points)
- **lines**: Horizontal lines that define row boundaries
- **checkboxes**: Small square rectangles that are checkboxes (with center coordinates)
- **row_boundaries**: Row top/bottom positions calculated from horizontal lines

**Check the results**: If \`form_structure.json\` has meaningful labels, use **Approach A: Structure-Based Coordinates**. If the PDF is scanned/image-based, use **Approach B: Visual Estimation**.

---

### Approach A: Structure-Based Coordinates (Preferred)

Use this when \`extract_form_structure.py\` found text labels in the PDF.

#### A.1: Analyze the Structure

Read form_structure.json and identify:
1. **Label groups**: Adjacent text elements that form a single label
2. **Row structure**: Labels with similar \`top\` values are in the same row
3. **Field columns**: Entry areas start after label ends
4. **Checkboxes**: Use the checkbox coordinates directly from the structure

**Coordinate system**: PDF coordinates where y=0 is at TOP of page, y increases downward.

#### A.2: Check for Missing Elements

The structure extraction may not detect all form elements (circular checkboxes, complex graphics, faded elements). Use visual analysis for those specific fields.

#### A.3: Create fields.json with PDF Coordinates

For each field, calculate entry coordinates from the extracted structure:

**Text fields:**
- entry x0 = label x1 + 5
- entry x1 = next label's x0, or row boundary
- entry top = same as label top
- entry bottom = row boundary line below

**Checkboxes:**
- Use the checkbox rectangle coordinates directly from form_structure.json

Create fields.json using \`pdf_width\` and \`pdf_height\`:
\`\`\`json
{
  "pages": [
    {"page_number": 1, "pdf_width": 612, "pdf_height": 792}
  ],
  "form_fields": [
    {
      "page_number": 1,
      "description": "Last name entry field",
      "field_label": "Last Name",
      "label_bounding_box": [43, 63, 87, 73],
      "entry_bounding_box": [92, 63, 260, 79],
      "entry_text": {"text": "Smith", "font_size": 10}
    },
    {
      "page_number": 1,
      "description": "US Citizen Yes checkbox",
      "field_label": "Yes",
      "label_bounding_box": [260, 200, 280, 210],
      "entry_bounding_box": [285, 197, 292, 205],
      "entry_text": {"text": "X"}
    }
  ]
}
\`\`\`

#### A.4: Validate Bounding Boxes

Before filling, check your bounding boxes for errors:
\`python scripts/check_bounding_boxes.py fields.json\`

---

### Approach B: Visual Estimation (Fallback)

Use this when the PDF is scanned/image-based and structure extraction found no usable text labels.

#### B.1: Convert PDF to Images

\`python scripts/convert_pdf_to_images.py <input.pdf> <images_dir/>\`

#### B.2: Initial Field Identification

Examine each page image to identify form sections and get rough estimates of field locations.

#### B.3: Zoom Refinement (CRITICAL for accuracy)

For each field, crop a region around the estimated position to refine coordinates precisely.

\`\`\`bash
magick <page_image> -crop <width>x<height>+<x>+<y> +repage <crop_output.png>
\`\`\`

Convert crop coordinates back to full image coordinates:
- full_x = crop_x + crop_offset_x
- full_y = crop_y + crop_offset_y

#### B.4: Create fields.json with Refined Coordinates

Create fields.json using \`image_width\` and \`image_height\`.

#### B.5: Validate Bounding Boxes

\`python scripts/check_bounding_boxes.py fields.json\`

---

## Hybrid Approach

Use this when structure extraction works for most fields but misses some elements.

1. **Use Approach A** for fields detected in form_structure.json
2. **Convert PDF to images** for visual analysis of missing fields
3. **Use zoom refinement** for the missing fields
4. **Combine coordinates**: Convert image coordinates to PDF coordinates:
   - pdf_x = image_x * (pdf_width / image_width)
   - pdf_y = image_y * (pdf_height / image_height)
5. **Use a single coordinate system** in fields.json

---

## Filling the Form

### Step 2: Validate Before Filling
\`python scripts/check_bounding_boxes.py fields.json\`

### Step 3: Fill the Form
\`python scripts/fill_pdf_form_with_annotations.py <input.pdf> fields.json <output.pdf>\`

### Step 4: Verify Output
\`python scripts/convert_pdf_to_images.py <output.pdf> <verify_images/>\`

---

# Advanced Reference

## pypdfium2 Library (Apache/BSD License)

### Overview
pypdfium2 is a Python binding for PDFium (Chromium's PDF library). Excellent for fast PDF rendering, image generation, and serves as a PyMuPDF replacement.

### Render PDF to Images
\`\`\`python
import pypdfium2 as pdfium
from PIL import Image

pdf = pdfium.PdfDocument("document.pdf")
page = pdf[0]
bitmap = page.render(scale=2.0, rotation=0)
img = bitmap.to_pil()
img.save("page_1.png", "PNG")

for i, page in enumerate(pdf):
    bitmap = page.render(scale=1.5)
    img = bitmap.to_pil()
    img.save(f"page_{i+1}.jpg", "JPEG", quality=90)
\`\`\`

### Extract Text with pypdfium2
\`\`\`python
import pypdfium2 as pdfium

pdf = pdfium.PdfDocument("document.pdf")
for i, page in enumerate(pdf):
    text = page.get_text()
    print(f"Page {i+1} text length: {len(text)} chars")
\`\`\`

## JavaScript Libraries

### pdf-lib (MIT License)

#### Load and Manipulate Existing PDF
\`\`\`javascript
import { PDFDocument } from 'pdf-lib';
import fs from 'fs';

async function manipulatePDF() {
    const existingPdfBytes = fs.readFileSync('input.pdf');
    const pdfDoc = await PDFDocument.load(existingPdfBytes);
    const pageCount = pdfDoc.getPageCount();

    const newPage = pdfDoc.addPage([600, 400]);
    newPage.drawText('Added by pdf-lib', { x: 100, y: 300, size: 16 });

    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync('modified.pdf', pdfBytes);
}
\`\`\`

#### Create Complex PDFs from Scratch
\`\`\`javascript
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fs from 'fs';

async function createPDF() {
    const pdfDoc = await PDFDocument.create();
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const page = pdfDoc.addPage([595, 842]); // A4 size
    const { width, height } = page.getSize();

    page.drawText('Invoice #12345', {
        x: 50, y: height - 50, size: 18,
        font: helveticaBold, color: rgb(0.2, 0.2, 0.8)
    });

    page.drawRectangle({
        x: 40, y: height - 100, width: width - 80, height: 30,
        color: rgb(0.9, 0.9, 0.9)
    });

    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync('created.pdf', pdfBytes);
}
\`\`\`

#### Advanced Merge and Split Operations
\`\`\`javascript
import { PDFDocument } from 'pdf-lib';
import fs from 'fs';

async function mergePDFs() {
    const mergedPdf = await PDFDocument.create();
    const pdf1 = await PDFDocument.load(fs.readFileSync('doc1.pdf'));
    const pdf2 = await PDFDocument.load(fs.readFileSync('doc2.pdf'));

    const pdf1Pages = await mergedPdf.copyPages(pdf1, pdf1.getPageIndices());
    pdf1Pages.forEach(page => mergedPdf.addPage(page));

    const pdf2Pages = await mergedPdf.copyPages(pdf2, [0, 2, 4]);
    pdf2Pages.forEach(page => mergedPdf.addPage(page));

    fs.writeFileSync('merged.pdf', await mergedPdf.save());
}
\`\`\`

### pdfjs-dist (Apache License)

#### Basic PDF Loading and Text Extraction
\`\`\`javascript
import * as pdfjsLib from 'pdfjs-dist';

async function extractText() {
    const pdf = await pdfjsLib.getDocument('document.pdf').promise;
    let fullText = '';

    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');
        fullText += \`\\n--- Page \${i} ---\\n\${pageText}\`;
    }
    return fullText;
}
\`\`\`

## Advanced Command-Line Operations

### poppler-utils Advanced Features

\`\`\`bash
# Extract text with bounding box coordinates
pdftotext -bbox-layout document.pdf output.xml

# Convert to PNG images with specific resolution
pdftoppm -png -r 300 document.pdf output_prefix

# Convert specific page range with high resolution
pdftoppm -png -r 600 -f 1 -l 3 document.pdf high_res_pages

# Extract all embedded images with metadata
pdfimages -j -p document.pdf page_images

# List image info without extracting
pdfimages -list document.pdf
\`\`\`

### qpdf Advanced Features

\`\`\`bash
# Split PDF into groups of pages
qpdf --split-pages=3 input.pdf output_group_%02d.pdf

# Extract specific pages with complex ranges
qpdf input.pdf --pages input.pdf 1,3-5,8,10-end -- extracted.pdf

# Merge specific pages from multiple PDFs
qpdf --empty --pages doc1.pdf 1-3 doc2.pdf 5-7 doc3.pdf 2,4 -- combined.pdf

# Optimize PDF for web (linearize)
qpdf --linearize input.pdf optimized.pdf

# Attempt to repair corrupted PDF structure
qpdf --check input.pdf
qpdf --fix-qdf damaged.pdf repaired.pdf

# Add password protection with specific permissions
qpdf --encrypt user_pass owner_pass 256 --print=none --modify=none -- input.pdf encrypted.pdf
\`\`\`

## Advanced Python Techniques

### pdfplumber Advanced Features

\`\`\`python
import pdfplumber

with pdfplumber.open("document.pdf") as pdf:
    page = pdf.pages[0]

    # Extract all text with coordinates
    chars = page.chars
    for char in chars[:10]:
        print(f"Char: '{char['text']}' at x:{char['x0']:.1f} y:{char['y0']:.1f}")

    # Extract text by bounding box
    bbox_text = page.within_bbox((100, 100, 400, 200)).extract_text()
\`\`\`

### Advanced Table Extraction with Custom Settings
\`\`\`python
import pdfplumber
import pandas as pd

with pdfplumber.open("complex_table.pdf") as pdf:
    page = pdf.pages[0]
    table_settings = {
        "vertical_strategy": "lines",
        "horizontal_strategy": "lines",
        "snap_tolerance": 3,
        "intersection_tolerance": 15
    }
    tables = page.extract_tables(table_settings)
\`\`\`

### reportlab Professional Reports with Tables
\`\`\`python
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib import colors

data = [
    ['Product', 'Q1', 'Q2', 'Q3', 'Q4'],
    ['Widgets', '120', '135', '142', '158'],
    ['Gadgets', '85', '92', '98', '105']
]

doc = SimpleDocTemplate("report.pdf")
elements = []
styles = getSampleStyleSheet()
elements.append(Paragraph("Quarterly Sales Report", styles['Title']))

table = Table(data)
table.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
    ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
    ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
    ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
    ('GRID', (0, 0), (-1, -1), 1, colors.black)
]))
elements.append(table)
doc.build(elements)
\`\`\`

## Complex Workflows

### Extract Figures/Images from PDF

\`\`\`bash
# Method 1: Using pdfimages (fastest)
pdfimages -all document.pdf images/img
\`\`\`

### Batch PDF Processing
\`\`\`python
import os, glob
from pypdf import PdfReader, PdfWriter
import logging

def batch_process_pdfs(input_dir, operation='merge'):
    pdf_files = glob.glob(os.path.join(input_dir, "*.pdf"))

    if operation == 'merge':
        writer = PdfWriter()
        for pdf_file in pdf_files:
            try:
                reader = PdfReader(pdf_file)
                for page in reader.pages:
                    writer.add_page(page)
            except Exception as e:
                logging.error(f"Failed to process {pdf_file}: {e}")
        with open("batch_merged.pdf", "wb") as output:
            writer.write(output)
\`\`\`

### Advanced PDF Cropping
\`\`\`python
from pypdf import PdfWriter, PdfReader

reader = PdfReader("input.pdf")
writer = PdfWriter()
page = reader.pages[0]
page.mediabox.left = 50
page.mediabox.bottom = 50
page.mediabox.right = 550
page.mediabox.top = 750
writer.add_page(page)
with open("cropped.pdf", "wb") as output:
    writer.write(output)
\`\`\`

## Performance Optimization Tips

1. **For Large PDFs**: Use streaming approaches; use \`qpdf --split-pages\` for splitting
2. **For Text Extraction**: \`pdftotext -bbox-layout\` is fastest for plain text
3. **For Image Extraction**: \`pdfimages\` is much faster than rendering pages
4. **For Form Filling**: pdf-lib maintains form structure better than most alternatives
5. **Memory Management**: Process PDFs in chunks for large files

## Troubleshooting Common Issues

### Encrypted PDFs
\`\`\`python
from pypdf import PdfReader
reader = PdfReader("encrypted.pdf")
if reader.is_encrypted:
    reader.decrypt("password")
\`\`\`

### Corrupted PDFs
\`\`\`bash
qpdf --check corrupted.pdf
qpdf --replace-input corrupted.pdf
\`\`\`

### Text Extraction Issues (Fallback to OCR)
\`\`\`python
import pytesseract
from pdf2image import convert_from_path

def extract_text_with_ocr(pdf_path):
    images = convert_from_path(pdf_path)
    return "".join(pytesseract.image_to_string(img) for img in images)
\`\`\`

## License Information

- **pypdf**: BSD License
- **pdfplumber**: MIT License
- **pypdfium2**: Apache/BSD License
- **reportlab**: BSD License
- **poppler-utils**: GPL-2 License
- **qpdf**: Apache License
- **pdf-lib**: MIT License
- **pdfjs-dist**: Apache License
`},{path:"skills/pdf/skill.md",content:`---
name: pdf
description: "Read, create, merge, split, watermark, encrypt, OCR, and extract content from PDF files."
tags:
  - pdf
  - document
  - forms
  - extraction
---

# PDF Processing Guide

## Overview

This guide covers essential PDF processing operations using Python libraries and command-line tools. For advanced features, JavaScript libraries, and detailed examples, see references.md. If you need to fill out a PDF form, read the Forms section in references.md and follow its instructions.

## Quick Start

\`\`\`python
from pypdf import PdfReader, PdfWriter

# Read a PDF
reader = PdfReader("document.pdf")
print(f"Pages: {len(reader.pages)}")

# Extract text
text = ""
for page in reader.pages:
    text += page.extract_text()
\`\`\`

## Python Libraries

### pypdf - Basic Operations

#### Merge PDFs
\`\`\`python
from pypdf import PdfWriter, PdfReader

writer = PdfWriter()
for pdf_file in ["doc1.pdf", "doc2.pdf", "doc3.pdf"]:
    reader = PdfReader(pdf_file)
    for page in reader.pages:
        writer.add_page(page)

with open("merged.pdf", "wb") as output:
    writer.write(output)
\`\`\`

#### Split PDF
\`\`\`python
reader = PdfReader("input.pdf")
for i, page in enumerate(reader.pages):
    writer = PdfWriter()
    writer.add_page(page)
    with open(f"page_{i+1}.pdf", "wb") as output:
        writer.write(output)
\`\`\`

#### Extract Metadata
\`\`\`python
reader = PdfReader("document.pdf")
meta = reader.metadata
print(f"Title: {meta.title}")
print(f"Author: {meta.author}")
print(f"Subject: {meta.subject}")
print(f"Creator: {meta.creator}")
\`\`\`

#### Rotate Pages
\`\`\`python
reader = PdfReader("input.pdf")
writer = PdfWriter()

page = reader.pages[0]
page.rotate(90)  # Rotate 90 degrees clockwise
writer.add_page(page)

with open("rotated.pdf", "wb") as output:
    writer.write(output)
\`\`\`

### pdfplumber - Text and Table Extraction

#### Extract Text with Layout
\`\`\`python
import pdfplumber

with pdfplumber.open("document.pdf") as pdf:
    for page in pdf.pages:
        text = page.extract_text()
        print(text)
\`\`\`

#### Extract Tables
\`\`\`python
with pdfplumber.open("document.pdf") as pdf:
    for i, page in enumerate(pdf.pages):
        tables = page.extract_tables()
        for j, table in enumerate(tables):
            print(f"Table {j+1} on page {i+1}:")
            for row in table:
                print(row)
\`\`\`

#### Advanced Table Extraction
\`\`\`python
import pandas as pd

with pdfplumber.open("document.pdf") as pdf:
    all_tables = []
    for page in pdf.pages:
        tables = page.extract_tables()
        for table in tables:
            if table:  # Check if table is not empty
                df = pd.DataFrame(table[1:], columns=table[0])
                all_tables.append(df)

# Combine all tables
if all_tables:
    combined_df = pd.concat(all_tables, ignore_index=True)
    combined_df.to_excel("extracted_tables.xlsx", index=False)
\`\`\`

### reportlab - Create PDFs

#### Basic PDF Creation
\`\`\`python
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

c = canvas.Canvas("hello.pdf", pagesize=letter)
width, height = letter

# Add text
c.drawString(100, height - 100, "Hello World!")
c.drawString(100, height - 120, "This is a PDF created with reportlab")

# Add a line
c.line(100, height - 140, 400, height - 140)

# Save
c.save()
\`\`\`

#### Create PDF with Multiple Pages
\`\`\`python
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak
from reportlab.lib.styles import getSampleStyleSheet

doc = SimpleDocTemplate("report.pdf", pagesize=letter)
styles = getSampleStyleSheet()
story = []

# Add content
title = Paragraph("Report Title", styles['Title'])
story.append(title)
story.append(Spacer(1, 12))

body = Paragraph("This is the body of the report. " * 20, styles['Normal'])
story.append(body)
story.append(PageBreak())

# Page 2
story.append(Paragraph("Page 2", styles['Heading1']))
story.append(Paragraph("Content for page 2", styles['Normal']))

# Build PDF
doc.build(story)
\`\`\`

#### Subscripts and Superscripts

**IMPORTANT**: Never use Unicode subscript/superscript characters in ReportLab PDFs. The built-in fonts do not include these glyphs, causing them to render as solid black boxes.

Instead, use ReportLab's XML markup tags in Paragraph objects:
\`\`\`python
from reportlab.platypus import Paragraph
from reportlab.lib.styles import getSampleStyleSheet

styles = getSampleStyleSheet()

# Subscripts: use <sub> tag
chemical = Paragraph("H<sub>2</sub>O", styles['Normal'])

# Superscripts: use <super> tag
squared = Paragraph("x<super>2</super> + y<super>2</super>", styles['Normal'])
\`\`\`

For canvas-drawn text (not Paragraph objects), manually adjust font the size and position rather than using Unicode subscripts/superscripts.

## Command-Line Tools

### pdftotext (poppler-utils)
\`\`\`bash
# Extract text
pdftotext input.pdf output.txt

# Extract text preserving layout
pdftotext -layout input.pdf output.txt

# Extract specific pages
pdftotext -f 1 -l 5 input.pdf output.txt  # Pages 1-5
\`\`\`

### qpdf
\`\`\`bash
# Merge PDFs
qpdf --empty --pages file1.pdf file2.pdf -- merged.pdf

# Split pages
qpdf input.pdf --pages . 1-5 -- pages1-5.pdf
qpdf input.pdf --pages . 6-10 -- pages6-10.pdf

# Rotate pages
qpdf input.pdf output.pdf --rotate=+90:1  # Rotate page 1 by 90 degrees

# Remove password
qpdf --password=mypassword --decrypt encrypted.pdf decrypted.pdf
\`\`\`

### pdftk (if available)
\`\`\`bash
# Merge
pdftk file1.pdf file2.pdf cat output merged.pdf

# Split
pdftk input.pdf burst

# Rotate
pdftk input.pdf rotate 1east output rotated.pdf
\`\`\`

## Common Tasks

### Extract Text from Scanned PDFs
\`\`\`python
# Requires: pip install pytesseract pdf2image
import pytesseract
from pdf2image import convert_from_path

# Convert PDF to images
images = convert_from_path('scanned.pdf')

# OCR each page
text = ""
for i, image in enumerate(images):
    text += f"Page {i+1}:\\n"
    text += pytesseract.image_to_string(image)
    text += "\\n\\n"

print(text)
\`\`\`

### Add Watermark
\`\`\`python
from pypdf import PdfReader, PdfWriter

# Create watermark (or load existing)
watermark = PdfReader("watermark.pdf").pages[0]

# Apply to all pages
reader = PdfReader("document.pdf")
writer = PdfWriter()

for page in reader.pages:
    page.merge_page(watermark)
    writer.add_page(page)

with open("watermarked.pdf", "wb") as output:
    writer.write(output)
\`\`\`

### Extract Images
\`\`\`bash
# Using pdfimages (poppler-utils)
pdfimages -j input.pdf output_prefix

# This extracts all images as output_prefix-000.jpg, output_prefix-001.jpg, etc.
\`\`\`

### Password Protection
\`\`\`python
from pypdf import PdfReader, PdfWriter

reader = PdfReader("input.pdf")
writer = PdfWriter()

for page in reader.pages:
    writer.add_page(page)

# Add password
writer.encrypt("userpassword", "ownerpassword")

with open("encrypted.pdf", "wb") as output:
    writer.write(output)
\`\`\`

## Quick Reference

| Task | Best Tool | Command/Code |
|------|-----------|--------------|
| Merge PDFs | pypdf | \`writer.add_page(page)\` |
| Split PDFs | pypdf | One page per file |
| Extract text | pdfplumber | \`page.extract_text()\` |
| Extract tables | pdfplumber | \`page.extract_tables()\` |
| Create PDFs | reportlab | Canvas or Platypus |
| Command line merge | qpdf | \`qpdf --empty --pages ...\` |
| OCR scanned PDFs | pytesseract | Convert to image first |
| Fill PDF forms | pdf-lib or pypdf (see references.md) | See Forms section in references.md |

## Next Steps

- For advanced pypdfium2 usage, see references.md
- For JavaScript libraries (pdf-lib), see references.md
- If you need to fill out a PDF form, follow the instructions in the Forms section of references.md
- For troubleshooting guides, see references.md
`},{path:"skills/pdf/tools.md",content:`# PDF Tools

## Scripts

All scripts are located in the \`scripts/\` directory relative to the skill.

### check_fillable_fields.py

Checks whether a PDF has fillable form fields.

**Usage:**
\`\`\`bash
python scripts/check_fillable_fields.py <file.pdf>
\`\`\`

**Output:** Prints either "This PDF has fillable form fields" or "This PDF does not have fillable form fields; you will need to visually determine where to enter data".

---

### extract_form_field_info.py

Extracts detailed information about fillable form fields from a PDF.

**Usage:**
\`\`\`bash
python scripts/extract_form_field_info.py <input.pdf> <field_info.json>
\`\`\`

**Output:** Creates a JSON file listing all form fields with their IDs, page numbers, bounding boxes, and types (text, checkbox, radio_group, choice). Includes checked/unchecked values for checkboxes, radio options for radio groups, and choice options for dropdowns.

---

### convert_pdf_to_images.py

Converts a PDF file to PNG images, one per page.

**Usage:**
\`\`\`bash
python scripts/convert_pdf_to_images.py <file.pdf> <output_directory>
\`\`\`

**Output:** Creates \`page_1.png\`, \`page_2.png\`, etc. in the output directory.

---

### extract_form_structure.py

Extracts text labels, lines, and checkboxes with exact PDF coordinates from a non-fillable PDF form.

**Usage:**
\`\`\`bash
python scripts/extract_form_structure.py <input.pdf> <form_structure.json>
\`\`\`

**Output:** JSON file containing:
- \`labels\`: Every text element with exact coordinates (x0, top, x1, bottom in PDF points)
- \`lines\`: Horizontal lines that define row boundaries
- \`checkboxes\`: Small square rectangles with center coordinates
- \`row_boundaries\`: Row top/bottom positions

---

### check_bounding_boxes.py

Validates bounding boxes in a fields.json file before filling a form.

**Usage:**
\`\`\`bash
python scripts/check_bounding_boxes.py <fields.json>
\`\`\`

**Checks for:**
- Intersecting bounding boxes (which would cause overlapping text)
- Entry boxes that are too small for the specified font size

---

### fill_fillable_fields.py

Fills fillable form fields in a PDF using specified values.

**Usage:**
\`\`\`bash
python scripts/fill_fillable_fields.py <input.pdf> <field_values.json> <output.pdf>
\`\`\`

**Input format (field_values.json):**
\`\`\`json
[
  {"field_id": "last_name", "description": "...", "page": 1, "value": "Simpson"},
  {"field_id": "Checkbox12", "description": "...", "page": 1, "value": "/On"}
]
\`\`\`

Validates field IDs and values; prints error messages if invalid.

---

### fill_pdf_form_with_annotations.py

Fills non-fillable PDF forms by adding text annotations at specified coordinates.

**Usage:**
\`\`\`bash
python scripts/fill_pdf_form_with_annotations.py <input.pdf> <fields.json> <output.pdf>
\`\`\`

Auto-detects coordinate system (PDF or image coordinates) from the \`pages\` array in fields.json (looks for \`pdf_width\`/\`pdf_height\` vs \`image_width\`/\`image_height\`).

---

### create_validation_image.py

Creates a validation image overlaying bounding boxes on a PDF page for visual verification.

**Usage:**
\`\`\`bash
python scripts/create_validation_image.py <args>
\`\`\`

Used to visually verify that field coordinates are correct before filling.
`},{path:"skills/pptx/references.md",content:`# PPTX Skill References

This file combines the editing guide and PptxGenJS tutorial for the PPTX skill.

## Table of Contents

- [Editing Presentations](#editing-presentations)
  - [Template-Based Workflow](#template-based-workflow)
  - [Scripts](#scripts)
  - [Slide Operations](#slide-operations)
  - [Editing Content](#editing-content)
  - [Common Pitfalls](#common-pitfalls)
- [PptxGenJS Tutorial](#pptxgenjs-tutorial)
  - [Setup & Basic Structure](#setup--basic-structure)
  - [Text & Formatting](#text--formatting)
  - [Lists & Bullets](#lists--bullets)
  - [Shapes](#shapes)
  - [Images](#images)
  - [Icons](#icons)
  - [Slide Backgrounds](#slide-backgrounds)
  - [Tables](#tables)
  - [Charts](#charts)
  - [Slide Masters](#slide-masters)
  - [Common Pitfalls (PptxGenJS)](#common-pitfalls-pptxgenjs)

---

# Editing Presentations

## Template-Based Workflow

When using an existing presentation as a template:

1. **Analyze existing slides**:
   \`\`\`bash
   python scripts/thumbnail.py template.pptx
   python -m markitdown template.pptx
   \`\`\`
   Review \`thumbnails.jpg\` to see layouts, and markitdown output to see placeholder text.

2. **Plan slide mapping**: For each content section, choose a template slide.

   **USE VARIED LAYOUTS** -- monotonous presentations are a common failure mode. Don't default to basic title + bullet slides. Actively seek out:
   - Multi-column layouts (2-column, 3-column)
   - Image + text combinations
   - Full-bleed images with text overlay
   - Quote or callout slides
   - Section dividers
   - Stat/number callouts
   - Icon grids or icon + text rows

   **Avoid:** Repeating the same text-heavy layout for every slide.

   Match content type to layout style (e.g., key points -> bullet slide, team info -> multi-column, testimonials -> quote slide).

3. **Unpack**: \`python scripts/office/unpack.py template.pptx unpacked/\`

4. **Build presentation** (do this yourself, not with subagents):
   - Delete unwanted slides (remove from \`<p:sldIdLst>\`)
   - Duplicate slides you want to reuse (\`add_slide.py\`)
   - Reorder slides in \`<p:sldIdLst>\`
   - **Complete all structural changes before step 5**

5. **Edit content**: Update text in each \`slide{N}.xml\`.
   **Use subagents here if available** -- slides are separate XML files, so subagents can edit in parallel.

6. **Clean**: \`python scripts/clean.py unpacked/\`

7. **Pack**: \`python scripts/office/pack.py unpacked/ output.pptx --original template.pptx\`

---

## Scripts

| Script | Purpose |
|--------|---------|
| \`unpack.py\` | Extract and pretty-print PPTX |
| \`add_slide.py\` | Duplicate slide or create from layout |
| \`clean.py\` | Remove orphaned files |
| \`pack.py\` | Repack with validation |
| \`thumbnail.py\` | Create visual grid of slides |

### unpack.py

\`\`\`bash
python scripts/office/unpack.py input.pptx unpacked/
\`\`\`

Extracts PPTX, pretty-prints XML, escapes smart quotes.

### add_slide.py

\`\`\`bash
python scripts/add_slide.py unpacked/ slide2.xml      # Duplicate slide
python scripts/add_slide.py unpacked/ slideLayout2.xml # From layout
\`\`\`

Prints \`<p:sldId>\` to add to \`<p:sldIdLst>\` at desired position.

### clean.py

\`\`\`bash
python scripts/clean.py unpacked/
\`\`\`

Removes slides not in \`<p:sldIdLst>\`, unreferenced media, orphaned rels.

### pack.py

\`\`\`bash
python scripts/office/pack.py unpacked/ output.pptx --original input.pptx
\`\`\`

Validates, repairs, condenses XML, re-encodes smart quotes.

### thumbnail.py

\`\`\`bash
python scripts/thumbnail.py input.pptx [output_prefix] [--cols N]
\`\`\`

Creates \`thumbnails.jpg\` with slide filenames as labels. Default 3 columns, max 12 per grid.

**Use for template analysis only** (choosing layouts). For visual QA, use \`soffice\` + \`pdftoppm\` to create full-resolution individual slide images.

---

## Slide Operations

Slide order is in \`ppt/presentation.xml\` -> \`<p:sldIdLst>\`.

**Reorder**: Rearrange \`<p:sldId>\` elements.

**Delete**: Remove \`<p:sldId>\`, then run \`clean.py\`.

**Add**: Use \`add_slide.py\`. Never manually copy slide files -- the script handles notes references, Content_Types.xml, and relationship IDs that manual copying misses.

---

## Editing Content

**Subagents:** If available, use them here (after completing step 4). Each slide is a separate XML file, so subagents can edit in parallel. In your prompt to subagents, include:
- The slide file path(s) to edit
- **"Use the Edit tool for all changes"**
- The formatting rules and common pitfalls below

For each slide:
1. Read the slide's XML
2. Identify ALL placeholder content -- text, images, charts, icons, captions
3. Replace each placeholder with final content

**Use the Edit tool, not sed or Python scripts.** The Edit tool forces specificity about what to replace and where, yielding better reliability.

### Formatting Rules

- **Bold all headers, subheadings, and inline labels**: Use \`b="1"\` on \`<a:rPr>\`. This includes:
  - Slide titles
  - Section headers within a slide
  - Inline labels like (e.g.: "Status:", "Description:") at the start of a line
- **Never use unicode bullets**: Use proper list formatting with \`<a:buChar>\` or \`<a:buAutoNum>\`
- **Bullet consistency**: Let bullets inherit from the layout. Only specify \`<a:buChar>\` or \`<a:buNone>\`.

---

## Common Pitfalls

### Template Adaptation

When source content has fewer items than the template:
- **Remove excess elements entirely** (images, shapes, text boxes), don't just clear text
- Check for orphaned visuals after clearing text content
- Run visual QA to catch mismatched counts

When replacing text with different length content:
- **Shorter replacements**: Usually safe
- **Longer replacements**: May overflow or wrap unexpectedly
- Test with visual QA after text changes
- Consider truncating or splitting content to fit

**Template slots != Source items**: If template has 4 team members but source has 3 users, delete the 4th member's entire group (image + text boxes), not just the text.

### Multi-Item Content

If source has multiple items (numbered lists, multiple sections), create separate \`<a:p>\` elements for each -- **never concatenate into one string**.

**WRONG** -- all items in one paragraph:
\`\`\`xml
<a:p>
  <a:r><a:rPr .../><a:t>Step 1: Do the first thing. Step 2: Do the second thing.</a:t></a:r>
</a:p>
\`\`\`

**CORRECT** -- separate paragraphs with bold headers:
\`\`\`xml
<a:p>
  <a:pPr algn="l"><a:lnSpc><a:spcPts val="3919"/></a:lnSpc></a:pPr>
  <a:r><a:rPr lang="en-US" sz="2799" b="1" .../><a:t>Step 1</a:t></a:r>
</a:p>
<a:p>
  <a:pPr algn="l"><a:lnSpc><a:spcPts val="3919"/></a:lnSpc></a:pPr>
  <a:r><a:rPr lang="en-US" sz="2799" .../><a:t>Do the first thing.</a:t></a:r>
</a:p>
\`\`\`

Copy \`<a:pPr>\` from the original paragraph to preserve line spacing. Use \`b="1"\` on headers.

### Smart Quotes

Handled automatically by unpack/pack. But the Edit tool converts smart quotes to ASCII.

**When adding new text with quotes, use XML entities:**

\`\`\`xml
<a:t>the &#x201C;Agreement&#x201D;</a:t>
\`\`\`

| Character | Name | Unicode | XML Entity |
|-----------|------|---------|------------|
| \\u201c | Left double quote | U+201C | \`&#x201C;\` |
| \\u201d | Right double quote | U+201D | \`&#x201D;\` |
| \\u2018 | Left single quote | U+2018 | \`&#x2018;\` |
| \\u2019 | Right single quote | U+2019 | \`&#x2019;\` |

### Other

- **Whitespace**: Use \`xml:space="preserve"\` on \`<a:t>\` with leading/trailing spaces
- **XML parsing**: Use \`defusedxml.minidom\`, not \`xml.etree.ElementTree\` (corrupts namespaces)

---

# PptxGenJS Tutorial

## Setup & Basic Structure

\`\`\`javascript
const pptxgen = require("pptxgenjs");

let pres = new pptxgen();
pres.layout = 'LAYOUT_16x9';
pres.author = 'Your Name';
pres.title = 'Presentation Title';

let slide = pres.addSlide();
slide.addText("Hello World!", { x: 0.5, y: 0.5, fontSize: 36, color: "363636" });

pres.writeFile({ fileName: "Presentation.pptx" });
\`\`\`

## Layout Dimensions

Slide dimensions (coordinates in inches):
- \`LAYOUT_16x9\`: 10" x 5.625" (default)
- \`LAYOUT_16x10\`: 10" x 6.25"
- \`LAYOUT_4x3\`: 10" x 7.5"
- \`LAYOUT_WIDE\`: 13.3" x 7.5"

---

## Text & Formatting

\`\`\`javascript
// Basic text
slide.addText("Simple Text", {
  x: 1, y: 1, w: 8, h: 2, fontSize: 24, fontFace: "Arial",
  color: "363636", bold: true, align: "center", valign: "middle"
});

// Character spacing (use charSpacing, not letterSpacing which is silently ignored)
slide.addText("SPACED TEXT", { x: 1, y: 1, w: 8, h: 1, charSpacing: 6 });

// Rich text arrays
slide.addText([
  { text: "Bold ", options: { bold: true } },
  { text: "Italic ", options: { italic: true } }
], { x: 1, y: 3, w: 8, h: 1 });

// Multi-line text (requires breakLine: true)
slide.addText([
  { text: "Line 1", options: { breakLine: true } },
  { text: "Line 2", options: { breakLine: true } },
  { text: "Line 3" }
], { x: 0.5, y: 0.5, w: 8, h: 2 });

// Text box margin (internal padding)
slide.addText("Title", {
  x: 0.5, y: 0.3, w: 9, h: 0.6,
  margin: 0  // Use 0 when aligning text with other elements
});
\`\`\`

**Tip:** Text boxes have internal margin by default. Set \`margin: 0\` when you need text to align precisely with shapes, lines, or icons at the same x-position.

---

## Lists & Bullets

\`\`\`javascript
// Multiple bullets
slide.addText([
  { text: "First item", options: { bullet: true, breakLine: true } },
  { text: "Second item", options: { bullet: true, breakLine: true } },
  { text: "Third item", options: { bullet: true } }
], { x: 0.5, y: 0.5, w: 8, h: 3 });

// NEVER use unicode bullets -- creates double bullets
// Sub-items and numbered lists
{ text: "Sub-item", options: { bullet: true, indentLevel: 1 } }
{ text: "First", options: { bullet: { type: "number" }, breakLine: true } }
\`\`\`

---

## Shapes

\`\`\`javascript
slide.addShape(pres.shapes.RECTANGLE, {
  x: 0.5, y: 0.8, w: 1.5, h: 3.0,
  fill: { color: "FF0000" }, line: { color: "000000", width: 2 }
});

slide.addShape(pres.shapes.OVAL, { x: 4, y: 1, w: 2, h: 2, fill: { color: "0000FF" } });

slide.addShape(pres.shapes.LINE, {
  x: 1, y: 3, w: 5, h: 0, line: { color: "FF0000", width: 3, dashType: "dash" }
});

// With transparency
slide.addShape(pres.shapes.RECTANGLE, {
  x: 1, y: 1, w: 3, h: 2,
  fill: { color: "0088CC", transparency: 50 }
});

// Rounded rectangle (rectRadius only works with ROUNDED_RECTANGLE, not RECTANGLE)
// Don't pair with rectangular accent overlays -- they won't cover rounded corners
slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
  x: 1, y: 1, w: 3, h: 2,
  fill: { color: "FFFFFF" }, rectRadius: 0.1
});

// With shadow
slide.addShape(pres.shapes.RECTANGLE, {
  x: 1, y: 1, w: 3, h: 2,
  fill: { color: "FFFFFF" },
  shadow: { type: "outer", color: "000000", blur: 6, offset: 2, angle: 135, opacity: 0.15 }
});
\`\`\`

Shadow options:

| Property | Type | Range | Notes |
|----------|------|-------|-------|
| \`type\` | string | \`"outer"\`, \`"inner"\` | |
| \`color\` | string | 6-char hex (e.g. \`"000000"\`) | No \`#\` prefix, no 8-char hex |
| \`blur\` | number | 0-100 pt | |
| \`offset\` | number | 0-200 pt | **Must be non-negative** -- negative values corrupt the file |
| \`angle\` | number | 0-359 degrees | Direction the shadow falls (135 = bottom-right, 270 = upward) |
| \`opacity\` | number | 0.0-1.0 | Use this for transparency, never encode in color string |

To cast a shadow upward, use \`angle: 270\` with a positive offset -- do **not** use a negative offset.

**Note**: Gradient fills are not natively supported. Use a gradient image as a background instead.

---

## Images

### Image Sources

\`\`\`javascript
// From file path
slide.addImage({ path: "images/chart.png", x: 1, y: 1, w: 5, h: 3 });

// From URL
slide.addImage({ path: "https://example.com/image.jpg", x: 1, y: 1, w: 5, h: 3 });

// From base64 (faster, no file I/O)
slide.addImage({ data: "image/png;base64,iVBORw0KGgo...", x: 1, y: 1, w: 5, h: 3 });
\`\`\`

### Image Options

\`\`\`javascript
slide.addImage({
  path: "image.png",
  x: 1, y: 1, w: 5, h: 3,
  rotate: 45,
  rounding: true,          // Circular crop
  transparency: 50,
  altText: "Description",
  hyperlink: { url: "https://example.com" }
});
\`\`\`

### Image Sizing Modes

\`\`\`javascript
// Contain - fit inside, preserve ratio
{ sizing: { type: 'contain', w: 4, h: 3 } }

// Cover - fill area, preserve ratio (may crop)
{ sizing: { type: 'cover', w: 4, h: 3 } }

// Crop - cut specific portion
{ sizing: { type: 'crop', x: 0.5, y: 0.5, w: 2, h: 2 } }
\`\`\`

### Calculate Dimensions (preserve aspect ratio)

\`\`\`javascript
const origWidth = 1978, origHeight = 923, maxHeight = 3.0;
const calcWidth = maxHeight * (origWidth / origHeight);
const centerX = (10 - calcWidth) / 2;
slide.addImage({ path: "image.png", x: centerX, y: 1.2, w: calcWidth, h: maxHeight });
\`\`\`

### Supported Formats

- **Standard**: PNG, JPG, GIF (animated GIFs work in Microsoft 365)
- **SVG**: Works in modern PowerPoint/Microsoft 365

---

## Icons

Use react-icons to generate SVG icons, then rasterize to PNG for universal compatibility.

### Setup

\`\`\`javascript
const React = require("react");
const ReactDOMServer = require("react-dom/server");
const sharp = require("sharp");
const { FaCheckCircle, FaChartLine } = require("react-icons/fa");

function renderIconSvg(IconComponent, color = "#000000", size = 256) {
  return ReactDOMServer.renderToStaticMarkup(
    React.createElement(IconComponent, { color, size: String(size) })
  );
}

async function iconToBase64Png(IconComponent, color, size = 256) {
  const svg = renderIconSvg(IconComponent, color, size);
  const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
  return "image/png;base64," + pngBuffer.toString("base64");
}
\`\`\`

### Add Icon to Slide

\`\`\`javascript
const iconData = await iconToBase64Png(FaCheckCircle, "#4472C4", 256);
slide.addImage({ data: iconData, x: 1, y: 1, w: 0.5, h: 0.5 });
\`\`\`

**Note**: Use size 256 or higher for crisp icons. The size parameter controls rasterization resolution, not display size.

Install: \`npm install -g react-icons react react-dom sharp\`

Popular icon sets: \`react-icons/fa\` (Font Awesome), \`react-icons/md\` (Material Design), \`react-icons/hi\` (Heroicons), \`react-icons/bi\` (Bootstrap Icons)

---

## Slide Backgrounds

\`\`\`javascript
slide.background = { color: "F1F1F1" };
slide.background = { color: "FF3399", transparency: 50 };
slide.background = { path: "https://example.com/bg.jpg" };
slide.background = { data: "image/png;base64,iVBORw0KGgo..." };
\`\`\`

---

## Tables

\`\`\`javascript
slide.addTable([
  ["Header 1", "Header 2"],
  ["Cell 1", "Cell 2"]
], {
  x: 1, y: 1, w: 8, h: 2,
  border: { pt: 1, color: "999999" }, fill: { color: "F1F1F1" }
});

// Advanced with merged cells
let tableData = [
  [{ text: "Header", options: { fill: { color: "6699CC" }, color: "FFFFFF", bold: true } }, "Cell"],
  [{ text: "Merged", options: { colspan: 2 } }]
];
slide.addTable(tableData, { x: 1, y: 3.5, w: 8, colW: [4, 4] });
\`\`\`

---

## Charts

\`\`\`javascript
// Bar chart
slide.addChart(pres.charts.BAR, [{
  name: "Sales", labels: ["Q1", "Q2", "Q3", "Q4"], values: [4500, 5500, 6200, 7100]
}], {
  x: 0.5, y: 0.6, w: 6, h: 3, barDir: 'col',
  showTitle: true, title: 'Quarterly Sales'
});

// Line chart
slide.addChart(pres.charts.LINE, [{
  name: "Temp", labels: ["Jan", "Feb", "Mar"], values: [32, 35, 42]
}], { x: 0.5, y: 4, w: 6, h: 3, lineSize: 3, lineSmooth: true });

// Pie chart
slide.addChart(pres.charts.PIE, [{
  name: "Share", labels: ["A", "B", "Other"], values: [35, 45, 20]
}], { x: 7, y: 1, w: 5, h: 4, showPercent: true });
\`\`\`

### Better-Looking Charts

\`\`\`javascript
slide.addChart(pres.charts.BAR, chartData, {
  x: 0.5, y: 1, w: 9, h: 4, barDir: "col",
  chartColors: ["0D9488", "14B8A6", "5EEAD4"],
  chartArea: { fill: { color: "FFFFFF" }, roundedCorners: true },
  catAxisLabelColor: "64748B",
  valAxisLabelColor: "64748B",
  valGridLine: { color: "E2E8F0", size: 0.5 },
  catGridLine: { style: "none" },
  showValue: true,
  dataLabelPosition: "outEnd",
  dataLabelColor: "1E293B",
  showLegend: false,
});
\`\`\`

**Key styling options:**
- \`chartColors: [...]\` - hex colors for series/segments
- \`chartArea: { fill, border, roundedCorners }\` - chart background
- \`catGridLine/valGridLine: { color, style, size }\` - grid lines (\`style: "none"\` to hide)
- \`lineSmooth: true\` - curved lines (line charts)
- \`legendPos: "r"\` - legend position: "b", "t", "l", "r", "tr"

---

## Slide Masters

\`\`\`javascript
pres.defineSlideMaster({
  title: 'TITLE_SLIDE', background: { color: '283A5E' },
  objects: [{
    placeholder: { options: { name: 'title', type: 'title', x: 1, y: 2, w: 8, h: 2 } }
  }]
});

let titleSlide = pres.addSlide({ masterName: "TITLE_SLIDE" });
titleSlide.addText("My Title", { placeholder: "title" });
\`\`\`

---

## Common Pitfalls (PptxGenJS)

These issues cause file corruption, visual bugs, or broken output. Avoid them.

1. **NEVER use "#" with hex colors** - causes file corruption
   \`\`\`javascript
   color: "FF0000"      // CORRECT
   color: "#FF0000"     // WRONG
   \`\`\`

2. **NEVER encode opacity in hex color strings** - 8-char colors (e.g., \`"00000020"\`) corrupt the file. Use the \`opacity\` property instead.
   \`\`\`javascript
   shadow: { color: "00000020" }          // CORRUPTS FILE
   shadow: { color: "000000", opacity: 0.12 }  // CORRECT
   \`\`\`

3. **Use \`bullet: true\`** - NEVER unicode symbols like "bullet" (creates double bullets)

4. **Use \`breakLine: true\`** between array items or text runs together

5. **Avoid \`lineSpacing\` with bullets** - causes excessive gaps; use \`paraSpaceAfter\` instead

6. **Each presentation needs fresh instance** - don't reuse \`pptxgen()\` objects

7. **NEVER reuse option objects across calls** - PptxGenJS mutates objects in-place. Use factory functions:
   \`\`\`javascript
   const makeShadow = () => ({ type: "outer", blur: 6, offset: 2, color: "000000", opacity: 0.15 });
   slide.addShape(pres.shapes.RECTANGLE, { shadow: makeShadow(), ... });
   \`\`\`

8. **Don't use \`ROUNDED_RECTANGLE\` with accent borders** - rectangular overlay bars won't cover rounded corners. Use \`RECTANGLE\` instead.

---

## Quick Reference

- **Shapes**: RECTANGLE, OVAL, LINE, ROUNDED_RECTANGLE
- **Charts**: BAR, LINE, PIE, DOUGHNUT, SCATTER, BUBBLE, RADAR
- **Layouts**: LAYOUT_16x9 (10"x5.625"), LAYOUT_16x10, LAYOUT_4x3, LAYOUT_WIDE
- **Alignment**: "left", "center", "right"
- **Chart data labels**: "outEnd", "inEnd", "center"
`},{path:"skills/pptx/skill.md",content:`---
name: pptx
description: "Create, read, edit, and manipulate PowerPoint (.pptx) files \u2014 decks, templates, layouts, speaker notes."
tags:
  - pptx
  - presentation
  - slides
  - office
---

# PPTX Skill

## Quick Reference

| Task | Guide |
|------|-------|
| Read/analyze content | \`python -m markitdown presentation.pptx\` |
| Edit or create from template | Read the Editing Presentations section in references.md |
| Create from scratch | Read the PptxGenJS Tutorial section in references.md |

---

## Reading Content

\`\`\`bash
# Text extraction
python -m markitdown presentation.pptx

# Visual overview
python scripts/thumbnail.py presentation.pptx

# Raw XML
python scripts/office/unpack.py presentation.pptx unpacked/
\`\`\`

---

## Editing Workflow

**Read the Editing Presentations section in references.md for full details.**

1. Analyze template with \`thumbnail.py\`
2. Unpack -> manipulate slides -> edit content -> clean -> pack

---

## Creating from Scratch

**Read the PptxGenJS Tutorial section in references.md for full details.**

Use when no template or reference presentation is available.

---

## Design Ideas

**Don't create boring slides.** Plain bullets on a white background won't impress anyone. Consider ideas from this list for each slide.

### Before Starting

- **Pick a bold, content-informed color palette**: The palette should feel designed for THIS topic. If swapping your colors into a completely different presentation would still "work," you haven't made specific enough choices.
- **Dominance over equality**: One color should dominate (60-70% visual weight), with 1-2 supporting tones and one sharp accent. Never give all colors equal weight.
- **Dark/light contrast**: Dark backgrounds for title + conclusion slides, light for content ("sandwich" structure). Or commit to dark throughout for a premium feel.
- **Commit to a visual motif**: Pick ONE distinctive element and repeat it -- rounded image frames, icons in colored circles, thick single-side borders. Carry it across every slide.

### Color Palettes

Choose colors that match your topic -- don't default to generic blue. Use these palettes as inspiration:

| Theme | Primary | Secondary | Accent |
|-------|---------|-----------|--------|
| **Midnight Executive** | \`1E2761\` (navy) | \`CADCFC\` (ice blue) | \`FFFFFF\` (white) |
| **Forest & Moss** | \`2C5F2D\` (forest) | \`97BC62\` (moss) | \`F5F5F5\` (cream) |
| **Coral Energy** | \`F96167\` (coral) | \`F9E795\` (gold) | \`2F3C7E\` (navy) |
| **Warm Terracotta** | \`B85042\` (terracotta) | \`E7E8D1\` (sand) | \`A7BEAE\` (sage) |
| **Ocean Gradient** | \`065A82\` (deep blue) | \`1C7293\` (teal) | \`21295C\` (midnight) |
| **Charcoal Minimal** | \`36454F\` (charcoal) | \`F2F2F2\` (off-white) | \`212121\` (black) |
| **Teal Trust** | \`028090\` (teal) | \`00A896\` (seafoam) | \`02C39A\` (mint) |
| **Berry & Cream** | \`6D2E46\` (berry) | \`A26769\` (dusty rose) | \`ECE2D0\` (cream) |
| **Sage Calm** | \`84B59F\` (sage) | \`69A297\` (eucalyptus) | \`50808E\` (slate) |
| **Cherry Bold** | \`990011\` (cherry) | \`FCF6F5\` (off-white) | \`2F3C7E\` (navy) |

### For Each Slide

**Every slide needs a visual element** -- image, chart, icon, or shape. Text-only slides are forgettable.

**Layout options:**
- Two-column (text left, illustration on right)
- Icon + text rows (icon in colored circle, bold header, description below)
- 2x2 or 2x3 grid (image on one side, grid of content blocks on other)
- Half-bleed image (full left or right side) with content overlay

**Data display:**
- Large stat callouts (big numbers 60-72pt with small labels below)
- Comparison columns (before/after, pros/cons, side-by-side options)
- Timeline or process flow (numbered steps, arrows)

**Visual polish:**
- Icons in small colored circles next to section headers
- Italic accent text for key stats or taglines

### Typography

**Choose an interesting font pairing** -- don't default to Arial. Pick a header font with personality and pair it with a clean body font.

| Header Font | Body Font |
|-------------|-----------|
| Georgia | Calibri |
| Arial Black | Arial |
| Calibri | Calibri Light |
| Cambria | Calibri |
| Trebuchet MS | Calibri |
| Impact | Arial |
| Palatino | Garamond |
| Consolas | Calibri |

| Element | Size |
|---------|------|
| Slide title | 36-44pt bold |
| Section header | 20-24pt bold |
| Body text | 14-16pt |
| Captions | 10-12pt muted |

### Spacing

- 0.5" minimum margins
- 0.3-0.5" between content blocks
- Leave breathing room--don't fill every inch

### Avoid (Common Mistakes)

- **Don't repeat the same layout** -- vary columns, cards, and callouts across slides
- **Don't center body text** -- left-align paragraphs and lists; center only titles
- **Don't skimp on size contrast** -- titles need 36pt+ to stand out from 14-16pt body
- **Don't default to blue** -- pick colors that reflect the specific topic
- **Don't mix spacing randomly** -- choose 0.3" or 0.5" gaps and use consistently
- **Don't style one slide and leave the rest plain** -- commit fully or keep it simple throughout
- **Don't create text-only slides** -- add images, icons, charts, or visual elements; avoid plain title + bullets
- **Don't forget text box padding** -- when aligning lines or shapes with text edges, set \`margin: 0\` on the text box or offset the shape to account for padding
- **Don't use low-contrast elements** -- icons AND text need strong contrast against the background; avoid light text on light backgrounds or dark text on dark backgrounds
- **NEVER use accent lines under titles** -- these are a hallmark of AI-generated slides; use whitespace or background color instead

---

## QA (Required)

**Assume there are problems. Your job is to find them.**

Your first render is almost never correct. Approach QA as a bug hunt, not a confirmation step. If you found zero issues on first inspection, you weren't looking hard enough.

### Content QA

\`\`\`bash
python -m markitdown output.pptx
\`\`\`

Check for missing content, typos, wrong order.

**When using templates, check for leftover placeholder text:**

\`\`\`bash
python -m markitdown output.pptx | grep -iE "xxxx|lorem|ipsum|this.*(page|slide).*layout"
\`\`\`

If grep returns results, fix them before declaring success.

### Visual QA

**USE SUBAGENTS** -- even for 2-3 slides. You've been staring at the code and will see what you expect, not what's there. Subagents have fresh eyes.

Convert slides to images (see [Converting to Images](#converting-to-images)), then use this prompt:

\`\`\`
Visually inspect these slides. Assume there are issues -- find them.

Look for:
- Overlapping elements (text through shapes, lines through words, stacked elements)
- Text overflow or cut off at edges/box boundaries
- Decorative lines positioned for single-line text but title wrapped to two lines
- Source citations or footers colliding with content above
- Elements too close (< 0.3" gaps) or cards/sections nearly touching
- Uneven gaps (large empty area in one place, cramped in another)
- Insufficient margin from slide edges (< 0.5")
- Columns or similar elements not aligned consistently
- Low-contrast text (e.g., light gray text on cream-colored background)
- Low-contrast icons (e.g., dark icons on dark backgrounds without a contrasting circle)
- Text boxes too narrow causing excessive wrapping
- Leftover placeholder content

For each slide, list issues or areas of concern, even if minor.

Read and analyze these images:
1. /path/to/slide-01.jpg (Expected: [brief description])
2. /path/to/slide-02.jpg (Expected: [brief description])

Report ALL issues found, including minor ones.
\`\`\`

### Verification Loop

1. Generate slides -> Convert to images -> Inspect
2. **List issues found** (if none found, look again more critically)
3. Fix issues
4. **Re-verify affected slides** -- one fix often creates another problem
5. Repeat until a full pass reveals no new issues

**Do not declare success until you've completed at least one fix-and-verify cycle.**

---

## Converting to Images

Convert presentations to individual slide images for visual inspection:

\`\`\`bash
python scripts/office/soffice.py --headless --convert-to pdf output.pptx
pdftoppm -jpeg -r 150 output.pdf slide
\`\`\`

This creates \`slide-01.jpg\`, \`slide-02.jpg\`, etc.

To re-render specific slides after fixes:

\`\`\`bash
pdftoppm -jpeg -r 150 -f N -l N output.pdf slide-fixed
\`\`\`

---

## Dependencies

- \`pip install "markitdown[pptx]"\` - text extraction
- \`pip install Pillow\` - thumbnail grids
- \`npm install -g pptxgenjs\` - creating from scratch
- LibreOffice (\`soffice\`) - PDF conversion (auto-configured for sandboxed environments via \`scripts/office/soffice.py\`)
- Poppler (\`pdftoppm\`) - PDF to images
`},{path:"skills/pptx/tools.md",content:`# PPTX Tools

## Scripts

All scripts are located in the \`scripts/\` directory relative to the skill.

### thumbnail.py

Creates a visual grid of slide thumbnails for template analysis.

**Usage:**
\`\`\`bash
python scripts/thumbnail.py <input.pptx> [output_prefix] [--cols N]
\`\`\`

**Output:** Creates \`thumbnails.jpg\` with slide filenames as labels. Default 3 columns, max 12 per grid.

**Dependencies:** \`pip install Pillow\`

**Note:** Use for template analysis only (choosing layouts). For visual QA, use \`soffice\` + \`pdftoppm\` for full-resolution individual slide images.

---

### office/unpack.py

Extracts and pretty-prints PPTX contents for editing.

**Usage:**
\`\`\`bash
python scripts/office/unpack.py <input.pptx> <unpacked_dir/>
\`\`\`

Extracts the PPTX archive, pretty-prints XML files, and escapes smart quotes for safe editing.

---

### add_slide.py

Duplicates a slide or creates a new slide from a layout.

**Usage:**
\`\`\`bash
python scripts/add_slide.py <unpacked_dir/> <slide2.xml>       # Duplicate slide
python scripts/add_slide.py <unpacked_dir/> <slideLayout2.xml>  # From layout
\`\`\`

**Output:** Prints the \`<p:sldId>\` XML element to add to \`<p:sldIdLst>\` at the desired position. Handles notes references, Content_Types.xml, and relationship IDs automatically.

**Important:** Never manually copy slide files -- always use this script.

---

### clean.py

Removes orphaned files after slide operations.

**Usage:**
\`\`\`bash
python scripts/clean.py <unpacked_dir/>
\`\`\`

Removes slides not referenced in \`<p:sldIdLst>\`, unreferenced media files, and orphaned relationship entries.

---

### office/pack.py

Repacks an unpacked directory into a PPTX file with validation.

**Usage:**
\`\`\`bash
python scripts/office/pack.py <unpacked_dir/> <output.pptx> --original <input.pptx>
\`\`\`

Validates XML structure, repairs common issues, condenses XML whitespace, and re-encodes smart quotes.

---

### office/soffice.py

Wrapper for LibreOffice's \`soffice\` command, auto-configured for sandboxed environments.

**Usage:**
\`\`\`bash
python scripts/office/soffice.py --headless --convert-to pdf <output.pptx>
\`\`\`

Used to convert PPTX to PDF for slide image generation. Handles sandboxed environment configuration automatically.

---

### office/validate.py

Validates PPTX XML structure against Office Open XML schemas.

**Usage:**
\`\`\`bash
python scripts/office/validate.py <unpacked_dir/>
\`\`\`

---

### office/helpers/merge_runs.py

Merges adjacent text runs in PPTX XML for cleaner output.

---

### office/helpers/simplify_redlines.py

Simplifies redline (tracked changes) markup in Office XML documents.

---

## Dependencies

| Package | Purpose | Install |
|---------|---------|---------|
| \`markitdown[pptx]\` | Text extraction from PPTX | \`pip install "markitdown[pptx]"\` |
| \`Pillow\` | Thumbnail grid generation | \`pip install Pillow\` |
| \`pptxgenjs\` | Creating presentations from scratch | \`npm install -g pptxgenjs\` |
| LibreOffice | PPTX to PDF conversion | System package (\`soffice\`) |
| Poppler | PDF to images | System package (\`pdftoppm\`) |
| \`react-icons\` | Icon generation for slides | \`npm install -g react-icons react react-dom sharp\` |
`},{path:"skills/skill-creator/references.md",content:`# Skill Creator References

This file combines all reference documentation for the Skill Creator skill.

## Table of Contents

- [JSON Schemas](#json-schemas)
  - [evals.json](#evalsjson)
  - [history.json](#historyjson)
  - [grading.json](#gradingjson)
  - [metrics.json](#metricsjson)
  - [timing.json](#timingjson)
  - [benchmark.json](#benchmarkjson)
  - [comparison.json](#comparisonjson)
  - [analysis.json](#analysisjson)
- [Agent Instructions](#agent-instructions)
  - [Grader Agent](#grader-agent)
  - [Blind Comparator Agent](#blind-comparator-agent)
  - [Post-hoc Analyzer Agent](#post-hoc-analyzer-agent)
  - [Analyzing Benchmark Results](#analyzing-benchmark-results)

---

# JSON Schemas

This section defines the JSON schemas used by skill-creator.

---

## evals.json

Defines the evals for a skill. Located at \`evals/evals.json\` within the skill directory.

\`\`\`json
{
  "skill_name": "example-skill",
  "evals": [
    {
      "id": 1,
      "prompt": "User's example prompt",
      "expected_output": "Description of expected result",
      "files": ["evals/files/sample1.pdf"],
      "expectations": [
        "The output includes X",
        "The skill used script Y"
      ]
    }
  ]
}
\`\`\`

**Fields:**
- \`skill_name\`: Name matching the skill's frontmatter
- \`evals[].id\`: Unique integer identifier
- \`evals[].prompt\`: The task to execute
- \`evals[].expected_output\`: Human-readable description of success
- \`evals[].files\`: Optional list of input file paths (relative to skill root)
- \`evals[].expectations\`: List of verifiable statements

---

## history.json

Tracks version progression in Improve mode. Located at workspace root.

\`\`\`json
{
  "started_at": "2026-01-15T10:30:00Z",
  "skill_name": "pdf",
  "current_best": "v2",
  "iterations": [
    {
      "version": "v0",
      "parent": null,
      "expectation_pass_rate": 0.65,
      "grading_result": "baseline",
      "is_current_best": false
    },
    {
      "version": "v1",
      "parent": "v0",
      "expectation_pass_rate": 0.75,
      "grading_result": "won",
      "is_current_best": false
    },
    {
      "version": "v2",
      "parent": "v1",
      "expectation_pass_rate": 0.85,
      "grading_result": "won",
      "is_current_best": true
    }
  ]
}
\`\`\`

**Fields:**
- \`started_at\`: ISO timestamp of when improvement started
- \`skill_name\`: Name of the skill being improved
- \`current_best\`: Version identifier of the best performer
- \`iterations[].version\`: Version identifier (v0, v1, ...)
- \`iterations[].parent\`: Parent version this was derived from
- \`iterations[].expectation_pass_rate\`: Pass rate from grading
- \`iterations[].grading_result\`: "baseline", "won", "lost", or "tie"
- \`iterations[].is_current_best\`: Whether this is the current best version

---

## grading.json

Output from the grader agent. Located at \`<run-dir>/grading.json\`.

\`\`\`json
{
  "expectations": [
    {
      "text": "The output includes the name 'John Smith'",
      "passed": true,
      "evidence": "Found in transcript Step 3: 'Extracted names: John Smith, Sarah Johnson'"
    },
    {
      "text": "The spreadsheet has a SUM formula in cell B10",
      "passed": false,
      "evidence": "No spreadsheet was created. The output was a text file."
    }
  ],
  "summary": {
    "passed": 2,
    "failed": 1,
    "total": 3,
    "pass_rate": 0.67
  },
  "execution_metrics": {
    "tool_calls": {
      "Read": 5,
      "Write": 2,
      "Bash": 8
    },
    "total_tool_calls": 15,
    "total_steps": 6,
    "errors_encountered": 0,
    "output_chars": 12450,
    "transcript_chars": 3200
  },
  "timing": {
    "executor_duration_seconds": 165.0,
    "grader_duration_seconds": 26.0,
    "total_duration_seconds": 191.0
  },
  "claims": [
    {
      "claim": "The form has 12 fillable fields",
      "type": "factual",
      "verified": true,
      "evidence": "Counted 12 fields in field_info.json"
    }
  ],
  "user_notes_summary": {
    "uncertainties": ["Used 2023 data, may be stale"],
    "needs_review": [],
    "workarounds": ["Fell back to text overlay for non-fillable fields"]
  },
  "eval_feedback": {
    "suggestions": [
      {
        "assertion": "The output includes the name 'John Smith'",
        "reason": "A hallucinated document that mentions the name would also pass"
      }
    ],
    "overall": "Assertions check presence but not correctness."
  }
}
\`\`\`

**Fields:**
- \`expectations[]\`: Graded expectations with evidence
- \`summary\`: Aggregate pass/fail counts
- \`execution_metrics\`: Tool usage and output size (from executor's metrics.json)
- \`timing\`: Wall clock timing (from timing.json)
- \`claims\`: Extracted and verified claims from the output
- \`user_notes_summary\`: Issues flagged by the executor
- \`eval_feedback\`: (optional) Improvement suggestions for the evals

---

## metrics.json

Output from the executor agent. Located at \`<run-dir>/outputs/metrics.json\`.

\`\`\`json
{
  "tool_calls": {
    "Read": 5,
    "Write": 2,
    "Bash": 8,
    "Edit": 1,
    "Glob": 2,
    "Grep": 0
  },
  "total_tool_calls": 18,
  "total_steps": 6,
  "files_created": ["filled_form.pdf", "field_values.json"],
  "errors_encountered": 0,
  "output_chars": 12450,
  "transcript_chars": 3200
}
\`\`\`

---

## timing.json

Wall clock timing for a run. Located at \`<run-dir>/timing.json\`.

**How to capture:** When a subagent task completes, the task notification includes \`total_tokens\` and \`duration_ms\`. Save these immediately -- they are not persisted anywhere else.

\`\`\`json
{
  "total_tokens": 84852,
  "duration_ms": 23332,
  "total_duration_seconds": 23.3,
  "executor_start": "2026-01-15T10:30:00Z",
  "executor_end": "2026-01-15T10:32:45Z",
  "executor_duration_seconds": 165.0,
  "grader_start": "2026-01-15T10:32:46Z",
  "grader_end": "2026-01-15T10:33:12Z",
  "grader_duration_seconds": 26.0
}
\`\`\`

---

## benchmark.json

Output from Benchmark mode. Located at \`benchmarks/<timestamp>/benchmark.json\`.

\`\`\`json
{
  "metadata": {
    "skill_name": "pdf",
    "skill_path": "/path/to/pdf",
    "executor_model": "claude-sonnet-4-20250514",
    "analyzer_model": "most-capable-model",
    "timestamp": "2026-01-15T10:30:00Z",
    "evals_run": [1, 2, 3],
    "runs_per_configuration": 3
  },

  "runs": [
    {
      "eval_id": 1,
      "eval_name": "Ocean",
      "configuration": "with_skill",
      "run_number": 1,
      "result": {
        "pass_rate": 0.85,
        "passed": 6,
        "failed": 1,
        "total": 7,
        "time_seconds": 42.5,
        "tokens": 3800,
        "tool_calls": 18,
        "errors": 0
      },
      "expectations": [
        {"text": "...", "passed": true, "evidence": "..."}
      ],
      "notes": [
        "Used 2023 data, may be stale"
      ]
    }
  ],

  "run_summary": {
    "with_skill": {
      "pass_rate": {"mean": 0.85, "stddev": 0.05, "min": 0.80, "max": 0.90},
      "time_seconds": {"mean": 45.0, "stddev": 12.0, "min": 32.0, "max": 58.0},
      "tokens": {"mean": 3800, "stddev": 400, "min": 3200, "max": 4100}
    },
    "without_skill": {
      "pass_rate": {"mean": 0.35, "stddev": 0.08, "min": 0.28, "max": 0.45},
      "time_seconds": {"mean": 32.0, "stddev": 8.0, "min": 24.0, "max": 42.0},
      "tokens": {"mean": 2100, "stddev": 300, "min": 1800, "max": 2500}
    },
    "delta": {
      "pass_rate": "+0.50",
      "time_seconds": "+13.0",
      "tokens": "+1700"
    }
  },

  "notes": [
    "Assertion 'Output is a PDF file' passes 100% in both configurations - may not differentiate skill value",
    "Eval 3 shows high variance (50% +/- 40%) - may be flaky"
  ]
}
\`\`\`

**Important:** The viewer reads these field names exactly. Using \`config\` instead of \`configuration\`, or putting \`pass_rate\` at the top level of a run instead of nested under \`result\`, will cause the viewer to show empty/zero values.

---

## comparison.json

Output from blind comparator. Located at \`<grading-dir>/comparison-N.json\`.

\`\`\`json
{
  "winner": "A",
  "reasoning": "Output A provides a complete solution with proper formatting...",
  "rubric": {
    "A": {
      "content": { "correctness": 5, "completeness": 5, "accuracy": 4 },
      "structure": { "organization": 4, "formatting": 5, "usability": 4 },
      "content_score": 4.7,
      "structure_score": 4.3,
      "overall_score": 9.0
    },
    "B": {
      "content": { "correctness": 3, "completeness": 2, "accuracy": 3 },
      "structure": { "organization": 3, "formatting": 2, "usability": 3 },
      "content_score": 2.7,
      "structure_score": 2.7,
      "overall_score": 5.4
    }
  },
  "output_quality": {
    "A": { "score": 9, "strengths": [...], "weaknesses": [...] },
    "B": { "score": 5, "strengths": [...], "weaknesses": [...] }
  },
  "expectation_results": {
    "A": { "passed": 4, "total": 5, "pass_rate": 0.80, "details": [...] },
    "B": { "passed": 3, "total": 5, "pass_rate": 0.60, "details": [...] }
  }
}
\`\`\`

---

## analysis.json

Output from post-hoc analyzer. Located at \`<grading-dir>/analysis.json\`.

\`\`\`json
{
  "comparison_summary": {
    "winner": "A",
    "winner_skill": "path/to/winner/skill",
    "loser_skill": "path/to/loser/skill",
    "comparator_reasoning": "Brief summary..."
  },
  "winner_strengths": [...],
  "loser_weaknesses": [...],
  "instruction_following": {
    "winner": { "score": 9, "issues": [...] },
    "loser": { "score": 6, "issues": [...] }
  },
  "improvement_suggestions": [
    {
      "priority": "high",
      "category": "instructions",
      "suggestion": "Replace vague instruction with explicit steps",
      "expected_impact": "Would eliminate ambiguity"
    }
  ],
  "transcript_insights": {
    "winner_execution_pattern": "Read skill -> Followed 5-step process -> Used validation script",
    "loser_execution_pattern": "Read skill -> Unclear -> Tried 3 different methods"
  }
}
\`\`\`

---

# Agent Instructions

## Grader Agent

Evaluate expectations against an execution transcript and outputs.

### Role

The Grader reviews a transcript and output files, then determines whether each expectation passes or fails. Provide clear evidence for each judgment.

You have two jobs: grade the outputs, and critique the evals themselves. A passing grade on a weak assertion is worse than useless -- it creates false confidence. When you notice an assertion that's trivially satisfied, or an important outcome that no assertion checks, say so.

### Inputs

- **expectations**: List of expectations to evaluate (strings)
- **transcript_path**: Path to the execution transcript (markdown file)
- **outputs_dir**: Directory containing output files from execution

### Process

1. **Read the Transcript** - Read completely, note the eval prompt, execution steps, and final result
2. **Examine Output Files** - List files in outputs_dir, read/examine each relevant file
3. **Evaluate Each Assertion** - Search for evidence, determine PASS/FAIL, cite evidence
4. **Extract and Verify Claims** - Extract factual, process, and quality claims; verify each
5. **Read User Notes** - If \`{outputs_dir}/user_notes.md\` exists, note issues flagged
6. **Critique the Evals** - Surface suggestions when there's a clear gap
7. **Write Grading Results** - Save to \`{outputs_dir}/../grading.json\`
8. **Read Executor Metrics and Timing** - Include if available

### Grading Criteria

**PASS when:**
- Clear evidence the expectation is true AND reflects genuine task completion
- Specific evidence can be cited

**FAIL when:**
- No evidence found, or evidence contradicts the expectation
- Evidence is superficial (correct filename but empty/wrong content)
- Output meets assertion by coincidence rather than by actually doing the work

**When uncertain:** The burden of proof to pass is on the expectation.

### Output Format

The grading.json expectations array must use the fields \`text\`, \`passed\`, and \`evidence\` -- the viewer depends on these exact field names.

---

## Blind Comparator Agent

Compare two outputs WITHOUT knowing which skill produced them.

### Role

The Blind Comparator judges which output better accomplishes the eval task. You receive two outputs labeled A and B, but you do NOT know which skill produced which. This prevents bias.

### Inputs

- **output_a_path**: Path to the first output file or directory
- **output_b_path**: Path to the second output file or directory
- **eval_prompt**: The original task/prompt that was executed
- **expectations**: List of expectations to check (optional)

### Process

1. **Read Both Outputs** - Examine output A and B
2. **Understand the Task** - Read eval_prompt, identify requirements
3. **Generate Evaluation Rubric** - Content rubric (correctness, completeness, accuracy) and Structure rubric (organization, formatting, usability), each scored 1-5
4. **Evaluate Each Output Against the Rubric** - Score each criterion, calculate totals
5. **Check Assertions** (if provided) - Check each against both outputs
6. **Determine the Winner** - Compare based on rubric score (primary), assertion pass rates (secondary)
7. **Write Comparison Results** - Save to JSON

### Output

- **winner**: "A", "B", or "TIE"
- **reasoning**: Clear explanation
- **rubric**: Structured evaluation with content_score, structure_score, overall_score for each
- **output_quality**: Score, strengths, weaknesses for each
- **expectation_results**: (Only if expectations provided) pass rates and details

### Guidelines

- **Stay blind**: DO NOT try to infer which skill produced which output
- **Be decisive**: Ties should be rare
- **Output quality first**: Assertion scores are secondary

---

## Post-hoc Analyzer Agent

Analyze blind comparison results to understand WHY the winner won and generate improvement suggestions.

### Role

After the blind comparator determines a winner, the Post-hoc Analyzer "unblinds" the results by examining the skills and transcripts to extract actionable insights.

### Inputs

- **winner**: "A" or "B" (from blind comparison)
- **winner_skill_path**, **winner_transcript_path**
- **loser_skill_path**, **loser_transcript_path**
- **comparison_result_path**, **output_path**

### Process

1. **Read Comparison Result** - Note winning side and reasoning
2. **Read Both Skills** - Identify structural differences
3. **Read Both Transcripts** - Compare execution patterns
4. **Analyze Instruction Following** - Score 1-10, note issues
5. **Identify Winner Strengths** - Be specific, quote from skills/transcripts
6. **Identify Loser Weaknesses** - Determine what held the loser back
7. **Generate Improvement Suggestions** - Prioritize by impact
8. **Write Analysis Results** - Save structured analysis

### Categories for Suggestions

| Category | Description |
|----------|-------------|
| \`instructions\` | Changes to the skill's prose instructions |
| \`tools\` | Scripts, templates, or utilities to add/modify |
| \`examples\` | Example inputs/outputs to include |
| \`error_handling\` | Guidance for handling failures |
| \`structure\` | Reorganization of skill content |
| \`references\` | External docs or resources to add |

### Priority Levels

- **high**: Would likely change the outcome
- **medium**: Would improve quality but may not change win/loss
- **low**: Nice to have, marginal improvement

---

## Analyzing Benchmark Results

When analyzing benchmark results, the analyzer's purpose is to **surface patterns and anomalies** across multiple runs, not suggest skill improvements.

### Role

Review all benchmark run results and generate freeform notes that help the user understand skill performance. Focus on patterns that wouldn't be visible from aggregate metrics alone.

### Process

1. **Read Benchmark Data** - Note configurations tested and run_summary aggregates
2. **Analyze Per-Assertion Patterns** - For each expectation:
   - Always pass in both configs? (may not differentiate skill value)
   - Always fail in both? (may be broken)
   - Always pass with skill but fail without? (skill clearly adds value)
   - Highly variable? (flaky expectation)
3. **Analyze Cross-Eval Patterns** - Consistency across evals, surprising results
4. **Analyze Metrics Patterns** - Time, tokens, tool calls, outliers
5. **Generate Notes** - Freeform observations as a list of strings, grounded in data

### Guidelines

**DO:**
- Report what you observe in the data
- Be specific about which evals, expectations, or runs you're referring to
- Note patterns that aggregate metrics would hide

**DO NOT:**
- Suggest improvements to the skill
- Make subjective quality judgments
- Speculate about causes without evidence
- Repeat information already in the run_summary aggregates
`},{path:"skills/skill-creator/skill.md",content:`---
name: skill-creator
description: "Create, modify, evaluate, and optimize skills \u2014 includes benchmarking and trigger accuracy tuning."
tags:
  - skill
  - meta
  - evaluation
  - development
---

# Skill Creator

A skill for creating new skills and iteratively improving them.

At a high level, the process of creating a skill goes like this:

- Decide what you want the skill to do and roughly how it should do it
- Write a draft of the skill
- Create a few test prompts and run claude-with-access-to-the-skill on them
- Help the user evaluate the results both qualitatively and quantitatively
  - While the runs happen in the background, draft some quantitative evals if there aren't any (if there are some, you can either use as is or modify if you feel something needs to change about them). Then explain them to the user (or if they already existed, explain the ones that already exist)
  - Use the \`eval-viewer/generate_review.py\` script to show the user the results for them to look at, and also let them look at the quantitative metrics
- Rewrite the skill based on feedback from the user's evaluation of the results (and also if there are any glaring flaws that become apparent from the quantitative benchmarks)
- Repeat until you're satisfied
- Expand the test set and try again at larger scale

Your job when using this skill is to figure out where the user is in this process and then jump in and help them progress through these stages. So for instance, maybe they're like "I want to make a skill for X". You can help narrow down what they mean, write a draft, write the test cases, figure out how they want to evaluate, run all the prompts, and repeat.

On the other hand, maybe they already have a draft of the skill. In this case you can go straight to the eval/iterate part of the loop.

Of course, you should always be flexible and if the user is like "I don't need to run a bunch of evaluations, just vibe with me", you can do that instead.

Then after the skill is done (but again, the order is flexible), you can also run the skill description improver, which we have a whole separate script for, to optimize the triggering of the skill.

Cool? Cool.

## Communicating with the user

The skill creator is liable to be used by people across a wide range of familiarity with coding jargon. If you haven't heard (and how could you, it's only very recently that it started), there's a trend now where the power of Claude is inspiring plumbers to open up their terminals, parents and grandparents to google "how to install npm". On the other hand, the bulk of users are probably fairly computer-literate.

So please pay attention to context cues to understand how to phrase your communication! In the default case, just to give you some idea:

- "evaluation" and "benchmark" are borderline, but OK
- for "JSON" and "assertion" you want to see serious cues from the user that they know what those things are before using them without explaining them

It's OK to briefly explain terms if you're in doubt, and feel free to clarify terms with a short definition if you're unsure if the user will get it.

---

## Creating a skill

### Capture Intent

Start by understanding the user's intent. The current conversation might already contain a workflow the user wants to capture (e.g., they say "turn this into a skill"). If so, extract answers from the conversation history first -- the tools used, the sequence of steps, corrections the user made, input/output formats observed. The user may need to fill the gaps, and should confirm before proceeding to the next step.

1. What should this skill enable Claude to do?
2. When should this skill trigger? (what user phrases/contexts)
3. What's the expected output format?
4. Should we set up test cases to verify the skill works? Skills with objectively verifiable outputs (file transforms, data extraction, code generation, fixed workflow steps) benefit from test cases. Skills with subjective outputs (writing style, art) often don't need them. Suggest the appropriate default based on the skill type, but let the user decide.

### Interview and Research

Proactively ask questions about edge cases, input/output formats, example files, success criteria, and dependencies. Wait to write test prompts until you've got this part ironed out.

Check available MCPs - if useful for research (searching docs, finding similar skills, looking up best practices), research in parallel via subagents if available, otherwise inline. Come prepared with context to reduce burden on the user.

### Write the SKILL.md

Based on the user interview, fill in these components:

- **name**: Skill identifier
- **description**: When to trigger, what it does. This is the primary triggering mechanism - include both what the skill does AND specific contexts for when to use it. All "when to use" info goes here, not in the body. Note: currently Claude has a tendency to "undertrigger" skills -- to not use them when they'd be useful. To combat this, please make the skill descriptions a little bit "pushy". So for instance, instead of "How to build a simple fast dashboard to display internal Anthropic data.", you might write "How to build a simple fast dashboard to display internal Anthropic data. Make sure to use this skill whenever the user mentions dashboards, data visualization, internal metrics, or wants to display any kind of company data, even if they don't explicitly ask for a 'dashboard.'"
- **compatibility**: Required tools, dependencies (optional, rarely needed)
- **the rest of the skill :)**

### Skill Writing Guide

#### Anatomy of a Skill

\`\`\`
skill-name/
\u251C\u2500\u2500 SKILL.md (required)
\u2502   \u251C\u2500\u2500 YAML frontmatter (name, description required)
\u2502   \u2514\u2500\u2500 Markdown instructions
\u2514\u2500\u2500 Bundled Resources (optional)
    \u251C\u2500\u2500 scripts/    - Executable code for deterministic/repetitive tasks
    \u251C\u2500\u2500 references/ - Docs loaded into context as needed
    \u2514\u2500\u2500 assets/     - Files used in output (templates, icons, fonts)
\`\`\`

#### Progressive Disclosure

Skills use a three-level loading system:
1. **Metadata** (name + description) - Always in context (~100 words)
2. **SKILL.md body** - In context whenever skill triggers (<500 lines ideal)
3. **Bundled resources** - As needed (unlimited, scripts can execute without loading)

These word counts are approximate and you can feel free to go longer if needed.

**Key patterns:**
- Keep SKILL.md under 500 lines; if you're approaching this limit, add an additional layer of hierarchy along with clear pointers about where the model using the skill should go next to follow up.
- Reference files clearly from SKILL.md with guidance on when to read them
- For large reference files (>300 lines), include a table of contents

**Domain organization**: When a skill supports multiple domains/frameworks, organize by variant:
\`\`\`
cloud-deploy/
\u251C\u2500\u2500 SKILL.md (workflow + selection)
\u2514\u2500\u2500 references/
    \u251C\u2500\u2500 aws.md
    \u251C\u2500\u2500 gcp.md
    \u2514\u2500\u2500 azure.md
\`\`\`
Claude reads only the relevant reference file.

#### Principle of Lack of Surprise

This goes without saying, but skills must not contain malware, exploit code, or any content that could compromise system security. A skill's contents should not surprise the user in their intent if described. Don't go along with requests to create misleading skills or skills designed to facilitate unauthorized access, data exfiltration, or other malicious activities. Things like a "roleplay as an XYZ" are OK though.

#### Writing Patterns

Prefer using the imperative form in instructions.

**Defining output formats** - You can do it like this:
\`\`\`markdown
## Report structure
ALWAYS use this exact template:
# [Title]
## Executive summary
## Key findings
## Recommendations
\`\`\`

**Examples pattern** - It's useful to include examples. You can format them like this (but if "Input" and "Output" are in the examples you might want to deviate a little):
\`\`\`markdown
## Commit message format
**Example 1:**
Input: Added user authentication with JWT tokens
Output: feat(auth): implement JWT-based authentication
\`\`\`

### Writing Style

Try to explain to the model why things are important in lieu of heavy-handed musty MUSTs. Use theory of mind and try to make the skill general and not super-narrow to specific examples. Start by writing a draft and then look at it with fresh eyes and improve it.

### Test Cases

After writing the skill draft, come up with 2-3 realistic test prompts -- the kind of thing a real user would actually say. Share them with the user: [you don't have to use this exact language] "Here are a few test cases I'd like to try. Do these look right, or do you want to add more?" Then run them.

Save test cases to \`evals/evals.json\`. Don't write assertions yet -- just the prompts. You'll draft assertions in the next step while the runs are in progress.

\`\`\`json
{
  "skill_name": "example-skill",
  "evals": [
    {
      "id": 1,
      "prompt": "User's task prompt",
      "expected_output": "Description of expected result",
      "files": []
    }
  ]
}
\`\`\`

See references.md for the full schema (including the \`assertions\` field, which you'll add later).

## Running and evaluating test cases

This section is one continuous sequence -- don't stop partway through. Do NOT use \`/skill-test\` or any other testing skill.

Put results in \`<skill-name>-workspace/\` as a sibling to the skill directory. Within the workspace, organize results by iteration (\`iteration-1/\`, \`iteration-2/\`, etc.) and within that, each test case gets a directory (\`eval-0/\`, \`eval-1/\`, etc.). Don't create all of this upfront -- just create directories as you go.

### Step 1: Spawn all runs (with-skill AND baseline) in the same turn

For each test case, spawn two subagents in the same turn -- one with the skill, one without. This is important: don't spawn the with-skill runs first and then come back for baselines later. Launch everything at once so it all finishes around the same time.

**With-skill run:**

\`\`\`
Execute this task:
- Skill path: <path-to-skill>
- Task: <eval prompt>
- Input files: <eval files if any, or "none">
- Save outputs to: <workspace>/iteration-<N>/eval-<ID>/with_skill/outputs/
- Outputs to save: <what the user cares about -- e.g., "the .docx file", "the final CSV">
\`\`\`

**Baseline run** (same prompt, but the baseline depends on context):
- **Creating a new skill**: no skill at all. Same prompt, no skill path, save to \`without_skill/outputs/\`.
- **Improving an existing skill**: the old version. Before editing, snapshot the skill (\`cp -r <skill-path> <workspace>/skill-snapshot/\`), then point the baseline subagent at the snapshot. Save to \`old_skill/outputs/\`.

Write an \`eval_metadata.json\` for each test case (assertions can be empty for now). Give each eval a descriptive name based on what it's testing -- not just "eval-0". Use this name for the directory too. If this iteration uses new or modified eval prompts, create these files for each new eval directory -- don't assume they carry over from previous iterations.

\`\`\`json
{
  "eval_id": 0,
  "eval_name": "descriptive-name-here",
  "prompt": "The user's task prompt",
  "assertions": []
}
\`\`\`

### Step 2: While runs are in progress, draft assertions

Don't just wait for the runs to finish -- you can use this time productively. Draft quantitative assertions for each test case and explain them to the user. If assertions already exist in \`evals/evals.json\`, review them and explain what they check.

Good assertions are objectively verifiable and have descriptive names -- they should read clearly in the benchmark viewer so someone glancing at the results immediately understands what each one checks. Subjective skills (writing style, design quality) are better evaluated qualitatively -- don't force assertions onto things that need human judgment.

Update the \`eval_metadata.json\` files and \`evals/evals.json\` with the assertions once drafted. Also explain to the user what they'll see in the viewer -- both the qualitative outputs and the quantitative benchmark.

### Step 3: As runs complete, capture timing data

When each subagent task completes, you receive a notification containing \`total_tokens\` and \`duration_ms\`. Save this data immediately to \`timing.json\` in the run directory:

\`\`\`json
{
  "total_tokens": 84852,
  "duration_ms": 23332,
  "total_duration_seconds": 23.3
}
\`\`\`

This is the only opportunity to capture this data -- it comes through the task notification and isn't persisted elsewhere. Process each notification as it arrives rather than trying to batch them.

### Step 4: Grade, aggregate, and launch the viewer

Once all runs are done:

1. **Grade each run** -- spawn a grader subagent (or grade inline) that reads \`agents/grader.md\` and evaluates each assertion against the outputs. Save results to \`grading.json\` in each run directory. The grading.json expectations array must use the fields \`text\`, \`passed\`, and \`evidence\` (not \`name\`/\`met\`/\`details\` or other variants) -- the viewer depends on these exact field names. For assertions that can be checked programmatically, write and run a script rather than eyeballing it -- scripts are faster, more reliable, and can be reused across iterations.

2. **Aggregate into benchmark** -- run the aggregation script from the skill-creator directory:
   \`\`\`bash
   python -m scripts.aggregate_benchmark <workspace>/iteration-N --skill-name <name>
   \`\`\`
   This produces \`benchmark.json\` and \`benchmark.md\` with pass_rate, time, and tokens for each configuration, with mean +/- stddev and the delta. If generating benchmark.json manually, see references.md for the exact schema the viewer expects.
Put each with_skill version before its baseline counterpart.

3. **Do an analyst pass** -- read the benchmark data and surface patterns the aggregate stats might hide. See the Analyzer section in references.md (the "Analyzing Benchmark Results" section) for what to look for -- things like assertions that always pass regardless of skill (non-discriminating), high-variance evals (possibly flaky), and time/token tradeoffs.

4. **Launch the viewer** with both qualitative outputs and quantitative data:
   \`\`\`bash
   nohup python <skill-creator-path>/eval-viewer/generate_review.py \\
     <workspace>/iteration-N \\
     --skill-name "my-skill" \\
     --benchmark <workspace>/iteration-N/benchmark.json \\
     > /dev/null 2>&1 &
   VIEWER_PID=$!
   \`\`\`
   For iteration 2+, also pass \`--previous-workspace <workspace>/iteration-<N-1>\`.

   **Cowork / headless environments:** If \`webbrowser.open()\` is not available or the environment has no display, use \`--static <output_path>\` to write a standalone HTML file instead of starting a server. Feedback will be downloaded as a \`feedback.json\` file when the user clicks "Submit All Reviews". After download, copy \`feedback.json\` into the workspace directory for the next iteration to pick up.

Note: please use generate_review.py to create the viewer; there's no need to write custom HTML.

5. **Tell the user** something like: "I've opened the results in your browser. There are two tabs -- 'Outputs' lets you click through each test case and leave feedback, 'Benchmark' shows the quantitative comparison. When you're done, come back here and let me know."

### What the user sees in the viewer

The "Outputs" tab shows one test case at a time:
- **Prompt**: the task that was given
- **Output**: the files the skill produced, rendered inline where possible
- **Previous Output** (iteration 2+): collapsed section showing last iteration's output
- **Formal Grades** (if grading was run): collapsed section showing assertion pass/fail
- **Feedback**: a textbox that auto-saves as they type
- **Previous Feedback** (iteration 2+): their comments from last time, shown below the textbox

The "Benchmark" tab shows the stats summary: pass rates, timing, and token usage for each configuration, with per-eval breakdowns and analyst observations.

Navigation is via prev/next buttons or arrow keys. When done, they click "Submit All Reviews" which saves all feedback to \`feedback.json\`.

### Step 5: Read the feedback

When the user tells you they're done, read \`feedback.json\`:

\`\`\`json
{
  "reviews": [
    {"run_id": "eval-0-with_skill", "feedback": "the chart is missing axis labels", "timestamp": "..."},
    {"run_id": "eval-1-with_skill", "feedback": "", "timestamp": "..."},
    {"run_id": "eval-2-with_skill", "feedback": "perfect, love this", "timestamp": "..."}
  ],
  "status": "complete"
}
\`\`\`

Empty feedback means the user thought it was fine. Focus your improvements on the test cases where the user had specific complaints.

Kill the viewer server when you're done with it:

\`\`\`bash
kill $VIEWER_PID 2>/dev/null
\`\`\`

---

## Improving the skill

This is the heart of the loop. You've run the test cases, the user has reviewed the results, and now you need to make the skill better based on their feedback.

### How to think about improvements

1. **Generalize from the feedback.** The big picture thing that's happening here is that we're trying to create skills that can be used a million times (maybe literally, maybe even more who knows) across many different prompts. Here you and the user are iterating on only a few examples over and over again because it helps move faster. The user knows these examples in and out and it's quick for them to assess new outputs. But if the skill you and the user are codeveloping works only for those examples, it's useless. Rather than put in fiddly overfitty changes, or oppressively constrictive MUSTs, if there's some stubborn issue, you might try branching out and using different metaphors, or recommending different patterns of working. It's relatively cheap to try and maybe you'll land on something great.

2. **Keep the prompt lean.** Remove things that aren't pulling their weight. Make sure to read the transcripts, not just the final outputs -- if it looks like the skill is making the model waste a bunch of time doing things that are unproductive, you can try getting rid of the parts of the skill that are making it do that and seeing what happens.

3. **Explain the why.** Try hard to explain the **why** behind everything you're asking the model to do. Today's LLMs are *smart*. They have good theory of mind and when given a good harness can go beyond rote instructions and really make things happen. Even if the feedback from the user is terse or frustrated, try to actually understand the task and why the user is writing what they wrote, and what they actually wrote, and then transmit this understanding into the instructions. If you find yourself writing ALWAYS or NEVER in all caps, or using super rigid structures, that's a yellow flag -- if possible, reframe and explain the reasoning so that the model understands why the thing you're asking for is important. That's a more humane, powerful, and effective approach.

4. **Look for repeated work across test cases.** Read the transcripts from the test runs and notice if the subagents all independently wrote similar helper scripts or took the same multi-step approach to something. If all 3 test cases resulted in the subagent writing a \`create_docx.py\` or a \`build_chart.py\`, that's a strong signal the skill should bundle that script. Write it once, put it in \`scripts/\`, and tell the skill to use it. This saves every future invocation from reinventing the wheel.

This task is pretty important (we are trying to create billions a year in economic value here!) and your thinking time is not the blocker; take your time and really mull things over. I'd suggest writing a draft revision and then looking at it anew and making improvements. Really do your best to get into the head of the user and understand what they want and need.

### The iteration loop

After improving the skill:

1. Apply your improvements to the skill
2. Rerun all test cases into a new \`iteration-<N+1>/\` directory, including baseline runs. If you're creating a new skill, the baseline is always \`without_skill\` (no skill) -- that stays the same across iterations. If you're improving an existing skill, use your judgment on what makes sense as the baseline: the original version the user came in with, or the previous iteration.
3. Launch the reviewer with \`--previous-workspace\` pointing at the previous iteration
4. Wait for the user to review and tell you they're done
5. Read the new feedback, improve again, repeat

Keep going until:
- The user says they're happy
- The feedback is all empty (everything looks good)
- You're not making meaningful progress

---

## Advanced: Blind comparison

For situations where you want a more rigorous comparison between two versions of a skill (e.g., the user asks "is the new version actually better?"), there's a blind comparison system. Read the Comparator and Analyzer sections in references.md for the details. The basic idea is: give two outputs to an independent agent without telling it which is which, and let it judge quality. Then analyze why the winner won.

This is optional, requires subagents, and most users won't need it. The human review loop is usually sufficient.

---

## Description Optimization

The description field in SKILL.md frontmatter is the primary mechanism that determines whether Claude invokes a skill. After creating or improving a skill, offer to optimize the description for better triggering accuracy.

### Step 1: Generate trigger eval queries

Create 20 eval queries -- a mix of should-trigger and should-not-trigger. Save as JSON:

\`\`\`json
[
  {"query": "the user prompt", "should_trigger": true},
  {"query": "another prompt", "should_trigger": false}
]
\`\`\`

The queries must be realistic and something a Claude Code or Claude.ai user would actually type. Not abstract requests, but requests that are concrete and specific and have a good amount of detail. For instance, file paths, personal context about the user's job or situation, column names and values, company names, URLs. A little bit of backstory. Some might be in lowercase or contain abbreviations or typos or casual speech. Use a mix of different lengths, and focus on edge cases rather than making them clear-cut (the user will get a chance to sign off on them).

Bad: \`"Format this data"\`, \`"Extract text from PDF"\`, \`"Create a chart"\`

Good: \`"ok so my boss just sent me this xlsx file (its in my downloads, called something like 'Q4 sales final FINAL v2.xlsx') and she wants me to add a column that shows the profit margin as a percentage. The revenue is in column C and costs are in column D i think"\`

For the **should-trigger** queries (8-10), think about coverage. You want different phrasings of the same intent -- some formal, some casual. Include cases where the user doesn't explicitly name the skill or file type but clearly needs it. Throw in some uncommon use cases and cases where this skill competes with another but should win.

For the **should-not-trigger** queries (8-10), the most valuable ones are the near-misses -- queries that share keywords or concepts with the skill but actually need something different. Think adjacent domains, ambiguous phrasing where a naive keyword match would trigger but shouldn't, and cases where the query touches on something the skill does but in a context where another tool is more appropriate.

The key thing to avoid: don't make should-not-trigger queries obviously irrelevant. "Write a fibonacci function" as a negative test for a PDF skill is too easy -- it doesn't test anything. The negative cases should be genuinely tricky.

### Step 2: Review with user

Present the eval set to the user for review using the HTML template:

1. Read the template from \`assets/eval_review.html\`
2. Replace the placeholders:
   - \`__EVAL_DATA_PLACEHOLDER__\` -> the JSON array of eval items (no quotes around it -- it's a JS variable assignment)
   - \`__SKILL_NAME_PLACEHOLDER__\` -> the skill's name
   - \`__SKILL_DESCRIPTION_PLACEHOLDER__\` -> the skill's current description
3. Write to a temp file (e.g., \`/tmp/eval_review_<skill-name>.html\`) and open it: \`open /tmp/eval_review_<skill-name>.html\`
4. The user can edit queries, toggle should-trigger, add/remove entries, then click "Export Eval Set"
5. The file downloads to \`~/Downloads/eval_set.json\` -- check the Downloads folder for the most recent version in case there are multiple (e.g., \`eval_set (1).json\`)

This step matters -- bad eval queries lead to bad descriptions.

### Step 3: Run the optimization loop

Tell the user: "This will take some time -- I'll run the optimization loop in the background and check on it periodically."

Save the eval set to the workspace, then run in the background:

\`\`\`bash
python -m scripts.run_loop \\
  --eval-set <path-to-trigger-eval.json> \\
  --skill-path <path-to-skill> \\
  --model <model-id-powering-this-session> \\
  --max-iterations 5 \\
  --verbose
\`\`\`

Use the model ID from your system prompt (the one powering the current session) so the triggering test matches what the user actually experiences.

While it runs, periodically tail the output to give the user updates on which iteration it's on and what the scores look like.

This handles the full optimization loop automatically. It splits the eval set into 60% train and 40% held-out test, evaluates the current description (running each query 3 times to get a reliable trigger rate), then calls Claude to propose improvements based on what failed. It re-evaluates each new description on both train and test, iterating up to 5 times. When it's done, it opens an HTML report in the browser showing the results per iteration and returns JSON with \`best_description\` -- selected by test score rather than train score to avoid overfitting.

### How skill triggering works

Understanding the triggering mechanism helps design better eval queries. Skills appear in Claude's \`available_skills\` list with their name + description, and Claude decides whether to consult a skill based on that description. The important thing to know is that Claude only consults skills for tasks it can't easily handle on its own -- simple, one-step queries like "read this PDF" may not trigger a skill even if the description matches perfectly, because Claude can handle them directly with basic tools. Complex, multi-step, or specialized queries reliably trigger skills when the description matches.

This means your eval queries should be substantive enough that Claude would actually benefit from consulting a skill. Simple queries like "read file X" are poor test cases -- they won't trigger skills regardless of description quality.

### Step 4: Apply the result

Take \`best_description\` from the JSON output and update the skill's SKILL.md frontmatter. Show the user before/after and report the scores.

---

### Package and Present (only if \`present_files\` tool is available)

Check whether you have access to the \`present_files\` tool. If you don't, skip this step. If you do, package the skill and present the .skill file to the user:

\`\`\`bash
python -m scripts.package_skill <path/to/skill-folder>
\`\`\`

After packaging, direct the user to the resulting \`.skill\` file path so they can install it.

---

## Claude.ai-specific instructions

In Claude.ai, the core workflow is the same (draft -> test -> review -> improve -> repeat), but because Claude.ai doesn't have subagents, some mechanics change. Here's what to adapt:

**Running test cases**: No subagents means no parallel execution. For each test case, read the skill's SKILL.md, then follow its instructions to accomplish the test prompt yourself. Do them one at a time. This is less rigorous than independent subagents (you wrote the skill and you're also running it, so you have full context), but it's a useful sanity check -- and the human review step compensates. Skip the baseline runs -- just use the skill to complete the task as requested.

**Reviewing results**: If you can't open a browser (e.g., Claude.ai's VM has no display, or you're on a remote server), skip the browser reviewer entirely. Instead, present results directly in the conversation. For each test case, show the prompt and the output. If the output is a file the user needs to see (like a .docx or .xlsx), save it to the filesystem and tell them where it is so they can download and inspect it. Ask for feedback inline: "How does this look? Anything you'd change?"

**Benchmarking**: Skip the quantitative benchmarking -- it relies on baseline comparisons which aren't meaningful without subagents. Focus on qualitative feedback from the user.

**The iteration loop**: Same as before -- improve the skill, rerun the test cases, ask for feedback -- just without the browser reviewer in the middle. You can still organize results into iteration directories on the filesystem if you have one.

**Description optimization**: This section requires the \`claude\` CLI tool (specifically \`claude -p\`) which is only available in Claude Code. Skip it if you're on Claude.ai.

**Blind comparison**: Requires subagents. Skip it.

**Packaging**: The \`package_skill.py\` script works anywhere with Python and a filesystem. On Claude.ai, you can run it and the user can download the resulting \`.skill\` file.

**Updating an existing skill**: The user might be asking you to update an existing skill, not create a new one. In this case:
- **Preserve the original name.** Note the skill's directory name and \`name\` frontmatter field -- use them unchanged. E.g., if the installed skill is \`research-helper\`, output \`research-helper.skill\` (not \`research-helper-v2\`).
- **Copy to a writeable location before editing.** The installed skill path may be read-only. Copy to \`/tmp/skill-name/\`, edit there, and package from the copy.
- **If packaging manually, stage in \`/tmp/\` first**, then copy to the output directory -- direct writes may fail due to permissions.

---

## Cowork-Specific Instructions

If you're in Cowork, the main things to know are:

- You have subagents, so the main workflow (spawn test cases in parallel, run baselines, grade, etc.) all works. (However, if you run into severe problems with timeouts, it's OK to run the test prompts in series rather than parallel.)
- You don't have a browser or display, so when generating the eval viewer, use \`--static <output_path>\` to write a standalone HTML file instead of starting a server. Then proffer a link that the user can click to open the HTML in their browser.
- For whatever reason, the Cowork setup seems to disincline Claude from generating the eval viewer after running the tests, so just to reiterate: whether you're in Cowork or in Claude Code, after running tests, you should always generate the eval viewer for the human to look at examples before revising the skill yourself and trying to make corrections, using \`generate_review.py\` (not writing your own boutique html code). Sorry in advance but I'm gonna go all caps here: GENERATE THE EVAL VIEWER *BEFORE* evaluating inputs yourself. You want to get them in front of the human ASAP!
- Feedback works differently: since there's no running server, the viewer's "Submit All Reviews" button will download \`feedback.json\` as a file. You can then read it from there (you may have to request access first).
- Packaging works -- \`package_skill.py\` just needs Python and a filesystem.
- Description optimization (\`run_loop.py\` / \`run_eval.py\`) should work in Cowork just fine since it uses \`claude -p\` via subprocess, not a browser, but please save it until you've fully finished making the skill and the user agrees it's in good shape.
- **Updating an existing skill**: The user might be asking you to update an existing skill, not create a new one. Follow the update guidance in the claude.ai section above.

---

## Reference files

The references.md file contains:
- Agent instructions for grader, comparator, and analyzer subagents
- JSON schemas for evals.json, grading.json, benchmark.json, etc.

The tools.md file documents all available scripts.

---

Repeating one more time the core loop here for emphasis:

- Figure out what the skill is about
- Draft or edit the skill
- Run claude-with-access-to-the-skill on test prompts
- With the user, evaluate the outputs:
  - Create benchmark.json and run \`eval-viewer/generate_review.py\` to help the user review them
  - Run quantitative evals
- Repeat until you and the user are satisfied
- Package the final skill and return it to the user.

Please add steps to your TodoList, if you have such a thing, to make sure you don't forget. If you're in Cowork, please specifically put "Create evals JSON and run \`eval-viewer/generate_review.py\` so human can review test cases" in your TodoList to make sure it happens.

Good luck!
`},{path:"skills/skill-creator/tools.md",content:`# Skill Creator Tools

## Scripts

All scripts are run as Python modules from the skill-creator directory using \`python -m scripts.<name>\`.

### scripts.run_eval

Runs trigger evaluation for a skill description. Tests whether a skill's description causes Claude to trigger (read the skill) for a set of queries.

**Usage:**
\`\`\`bash
python -m scripts.run_eval \\
  --eval-set <path-to-eval-set.json> \\
  --skill-path <path-to-skill> \\
  --model <model-id> \\
  [--timeout <seconds>]
\`\`\`

**Eval set format:**
\`\`\`json
[
  {"query": "user prompt text", "should_trigger": true},
  {"query": "another prompt", "should_trigger": false}
]
\`\`\`

**Output:** JSON results showing which queries triggered the skill and whether they matched expectations.

---

### scripts.run_loop

Runs the eval + improve loop until all pass or max iterations reached. Combines \`run_eval.py\` and \`improve_description.py\` in a loop, tracking history and returning the best description found. Supports train/test split to prevent overfitting.

**Usage:**
\`\`\`bash
python -m scripts.run_loop \\
  --eval-set <path-to-trigger-eval.json> \\
  --skill-path <path-to-skill> \\
  --model <model-id-powering-this-session> \\
  --max-iterations 5 \\
  --verbose
\`\`\`

**Behavior:**
- Splits eval set into 60% train and 40% held-out test
- Evaluates current description (running each query 3 times for reliability)
- Calls Claude to propose improvements based on failures
- Re-evaluates each new description on both train and test
- Iterates up to max-iterations times
- Opens HTML report in browser showing results per iteration
- Returns JSON with \`best_description\` (selected by test score to avoid overfitting)

---

### scripts.improve_description

Improves a skill description based on eval results. Takes eval results from \`run_eval.py\` and generates an improved description by calling \`claude -p\` as a subprocess.

**Usage:**
\`\`\`bash
python -m scripts.improve_description \\
  --skill-path <path-to-skill> \\
  --eval-results <path-to-results.json> \\
  --model <model-id>
\`\`\`

**Output:** Prints the improved description to stdout.

---

### scripts.aggregate_benchmark

Aggregates individual run results into benchmark summary statistics. Reads grading.json files from run directories.

**Usage:**
\`\`\`bash
python -m scripts.aggregate_benchmark <benchmark_dir> --skill-name <name>
\`\`\`

**Output:** Produces \`benchmark.json\` and \`benchmark.md\` with:
- \`run_summary\` with mean, stddev, min, max for each metric
- \`delta\` between \`with_skill\` and \`without_skill\` configurations

**Supports two directory layouts:**
\`\`\`
# Workspace layout (from skill-creator iterations)
<benchmark_dir>/
\u2514\u2500\u2500 eval-N/
    \u251C\u2500\u2500 with_skill/
    \u2502   \u2514\u2500\u2500 run-1/grading.json
    \u2514\u2500\u2500 without_skill/
        \u2514\u2500\u2500 run-1/grading.json

# Legacy layout
<benchmark_dir>/
\u2514\u2500\u2500 runs/
    \u2514\u2500\u2500 eval-N/
        \u2514\u2500\u2500 ...
\`\`\`

---

### scripts.generate_report

Generates an HTML report from \`run_loop.py\` output. Shows each description attempt with check/x for each test case, distinguishing between train and test queries.

**Usage:**
\`\`\`bash
python -m scripts.generate_report <loop-output.json> [--output <report.html>]
\`\`\`

---

### scripts.package_skill

Creates a distributable \`.skill\` file from a skill folder.

**Usage:**
\`\`\`bash
python -m scripts.package_skill <path/to/skill-folder> [output-directory]
\`\`\`

**Example:**
\`\`\`bash
python -m scripts.package_skill skills/my-skill
python -m scripts.package_skill skills/my-skill ./dist
\`\`\`

**Behavior:**
- Validates the skill (checks SKILL.md exists, has valid frontmatter)
- Excludes \`__pycache__\`, \`node_modules\`, \`.pyc\` files, \`.DS_Store\`
- Excludes \`evals/\` directory at the skill root
- Creates a \`.skill\` zip archive

---

### scripts.quick_validate

Quick validation script for skills. Checks basic structure requirements.

**Usage:**
\`\`\`bash
python -m scripts.quick_validate <path/to/skill-folder>
\`\`\`

**Checks:**
- SKILL.md exists
- Has valid YAML frontmatter
- Required fields (name, description) are present

---

## Eval Viewer

### eval-viewer/generate_review.py

Generates an interactive HTML viewer for reviewing eval results. Supports both server mode and static file output.

**Usage:**
\`\`\`bash
# Server mode (opens in browser)
nohup python <skill-creator-path>/eval-viewer/generate_review.py \\
  <workspace>/iteration-N \\
  --skill-name "my-skill" \\
  --benchmark <workspace>/iteration-N/benchmark.json \\
  > /dev/null 2>&1 &

# With previous iteration comparison
python eval-viewer/generate_review.py \\
  <workspace>/iteration-N \\
  --skill-name "my-skill" \\
  --benchmark <workspace>/iteration-N/benchmark.json \\
  --previous-workspace <workspace>/iteration-<N-1>

# Static mode (for headless environments)
python eval-viewer/generate_review.py \\
  <workspace>/iteration-N \\
  --skill-name "my-skill" \\
  --static <output_path.html>
\`\`\`

**Features:**
- "Outputs" tab: Shows prompts, outputs, previous outputs, formal grades, feedback textbox
- "Benchmark" tab: Shows pass rates, timing, token usage per configuration
- Navigation via prev/next buttons or arrow keys
- "Submit All Reviews" saves all feedback to \`feedback.json\`

---

## Assets

### assets/eval_review.html

HTML template for the description optimization eval review interface. Contains placeholders:
- \`__EVAL_DATA_PLACEHOLDER__\` - Replace with JSON array of eval items
- \`__SKILL_NAME_PLACEHOLDER__\` - Replace with skill name
- \`__SKILL_DESCRIPTION_PLACEHOLDER__\` - Replace with current description

Users can edit queries, toggle should-trigger, add/remove entries, then click "Export Eval Set" which downloads to \`~/Downloads/eval_set.json\`.
`},{path:"skills/slack-gif-creator/skill.md",content:`---
name: slack-gif-creator
description: "Create animated GIFs optimized for Slack \u2014 constraints, validation, and animation concepts."
tags:
  - animation
  - slack
  - gif
  - design
  - python
---

# Slack GIF Creator

A toolkit providing utilities and knowledge for creating animated GIFs optimized for Slack.

## Slack Requirements

**Dimensions:**
- Emoji GIFs: 128x128 (recommended)
- Message GIFs: 480x480

**Parameters:**
- FPS: 10-30 (lower is smaller file size)
- Colors: 48-128 (fewer = smaller file size)
- Duration: Keep under 3 seconds for emoji GIFs

## Core Workflow

\`\`\`python
from core.gif_builder import GIFBuilder
from PIL import Image, ImageDraw

# 1. Create builder
builder = GIFBuilder(width=128, height=128, fps=10)

# 2. Generate frames
for i in range(12):
    frame = Image.new('RGB', (128, 128), (240, 248, 255))
    draw = ImageDraw.Draw(frame)

    # Draw your animation using PIL primitives
    # (circles, polygons, lines, etc.)

    builder.add_frame(frame)

# 3. Save with optimization
builder.save('output.gif', num_colors=48, optimize_for_emoji=True)
\`\`\`

## Drawing Graphics

### Working with User-Uploaded Images
If a user uploads an image, consider whether they want to:
- **Use it directly** (e.g., "animate this", "split this into frames")
- **Use it as inspiration** (e.g., "make something like this")

Load and work with images using PIL:
\`\`\`python
from PIL import Image

uploaded = Image.open('file.png')
# Use directly, or just as reference for colors/style
\`\`\`

### Drawing from Scratch
When drawing graphics from scratch, use PIL ImageDraw primitives:

\`\`\`python
from PIL import ImageDraw

draw = ImageDraw.Draw(frame)

# Circles/ovals
draw.ellipse([x1, y1, x2, y2], fill=(r, g, b), outline=(r, g, b), width=3)

# Stars, triangles, any polygon
points = [(x1, y1), (x2, y2), (x3, y3), ...]
draw.polygon(points, fill=(r, g, b), outline=(r, g, b), width=3)

# Lines
draw.line([(x1, y1), (x2, y2)], fill=(r, g, b), width=5)

# Rectangles
draw.rectangle([x1, y1, x2, y2], fill=(r, g, b), outline=(r, g, b), width=3)
\`\`\`

**Don't use:** Emoji fonts (unreliable across platforms) or assume pre-packaged graphics exist in this skill.

### Making Graphics Look Good

Graphics should look polished and creative, not basic. Here's how:

**Use thicker lines** - Always set \`width=2\` or higher for outlines and lines. Thin lines (width=1) look choppy and amateurish.

**Add visual depth**:
- Use gradients for backgrounds (\`create_gradient_background\`)
- Layer multiple shapes for complexity (e.g., a star with a smaller star inside)

**Make shapes more interesting**:
- Don't just draw a plain circle - add highlights, rings, or patterns
- Stars can have glows (draw larger, semi-transparent versions behind)
- Combine multiple shapes (stars + sparkles, circles + rings)

**Pay attention to colors**:
- Use vibrant, complementary colors
- Add contrast (dark outlines on light shapes, light outlines on dark shapes)
- Consider the overall composition

**For complex shapes** (hearts, snowflakes, etc.):
- Use combinations of polygons and ellipses
- Calculate points carefully for symmetry
- Add details (a heart can have a highlight curve, snowflakes have intricate branches)

Be creative and detailed! A good Slack GIF should look polished, not like placeholder graphics.

## Available Utilities

### GIFBuilder (\`core.gif_builder\`)
Assembles frames and optimizes for Slack:
\`\`\`python
builder = GIFBuilder(width=128, height=128, fps=10)
builder.add_frame(frame)  # Add PIL Image
builder.add_frames(frames)  # Add list of frames
builder.save('out.gif', num_colors=48, optimize_for_emoji=True, remove_duplicates=True)
\`\`\`

### Validators (\`core.validators\`)
Check if GIF meets Slack requirements:
\`\`\`python
from core.validators import validate_gif, is_slack_ready

# Detailed validation
passes, info = validate_gif('my.gif', is_emoji=True, verbose=True)

# Quick check
if is_slack_ready('my.gif'):
    print("Ready!")
\`\`\`

### Easing Functions (\`core.easing\`)
Smooth motion instead of linear:
\`\`\`python
from core.easing import interpolate

# Progress from 0.0 to 1.0
t = i / (num_frames - 1)

# Apply easing
y = interpolate(start=0, end=400, t=t, easing='ease_out')

# Available: linear, ease_in, ease_out, ease_in_out,
#           bounce_out, elastic_out, back_out
\`\`\`

### Frame Helpers (\`core.frame_composer\`)
Convenience functions for common needs:
\`\`\`python
from core.frame_composer import (
    create_blank_frame,         # Solid color background
    create_gradient_background,  # Vertical gradient
    draw_circle,                # Helper for circles
    draw_text,                  # Simple text rendering
    draw_star                   # 5-pointed star
)
\`\`\`

## Animation Concepts

### Shake/Vibrate
Offset object position with oscillation:
- Use \`math.sin()\` or \`math.cos()\` with frame index
- Add small random variations for natural feel
- Apply to x and/or y position

### Pulse/Heartbeat
Scale object size rhythmically:
- Use \`math.sin(t * frequency * 2 * math.pi)\` for smooth pulse
- For heartbeat: two quick pulses then pause (adjust sine wave)
- Scale between 0.8 and 1.2 of base size

### Bounce
Object falls and bounces:
- Use \`interpolate()\` with \`easing='bounce_out'\` for landing
- Use \`easing='ease_in'\` for falling (accelerating)
- Apply gravity by increasing y velocity each frame

### Spin/Rotate
Rotate object around center:
- PIL: \`image.rotate(angle, resample=Image.BICUBIC)\`
- For wobble: use sine wave for angle instead of linear

### Fade In/Out
Gradually appear or disappear:
- Create RGBA image, adjust alpha channel
- Or use \`Image.blend(image1, image2, alpha)\`
- Fade in: alpha from 0 to 1
- Fade out: alpha from 1 to 0

### Slide
Move object from off-screen to position:
- Start position: outside frame bounds
- End position: target location
- Use \`interpolate()\` with \`easing='ease_out'\` for smooth stop
- For overshoot: use \`easing='back_out'\`

### Zoom
Scale and position for zoom effect:
- Zoom in: scale from 0.1 to 2.0, crop center
- Zoom out: scale from 2.0 to 1.0
- Can add motion blur for drama (PIL filter)

### Explode/Particle Burst
Create particles radiating outward:
- Generate particles with random angles and velocities
- Update each particle: \`x += vx\`, \`y += vy\`
- Add gravity: \`vy += gravity_constant\`
- Fade out particles over time (reduce alpha)

## Optimization Strategies

Only when asked to make the file size smaller, implement a few of the following methods:

1. **Fewer frames** - Lower FPS (10 instead of 20) or shorter duration
2. **Fewer colors** - \`num_colors=48\` instead of 128
3. **Smaller dimensions** - 128x128 instead of 480x480
4. **Remove duplicates** - \`remove_duplicates=True\` in save()
5. **Emoji mode** - \`optimize_for_emoji=True\` auto-optimizes

\`\`\`python
# Maximum optimization for emoji
builder.save(
    'emoji.gif',
    num_colors=48,
    optimize_for_emoji=True,
    remove_duplicates=True
)
\`\`\`

## Philosophy

This skill provides:
- **Knowledge**: Slack's requirements and animation concepts
- **Utilities**: GIFBuilder, validators, easing functions
- **Flexibility**: Create the animation logic using PIL primitives

It does NOT provide:
- Rigid animation templates or pre-made functions
- Emoji font rendering (unreliable across platforms)
- A library of pre-packaged graphics built into the skill

**Note on user uploads**: This skill doesn't include pre-built graphics, but if a user uploads an image, use PIL to load and work with it - interpret based on their request whether they want it used directly or just as inspiration.

Be creative! Combine concepts (bouncing + rotating, pulsing + sliding, etc.) and use PIL's full capabilities.

## Dependencies

\`\`\`bash
pip install pillow imageio numpy
\`\`\`
`},{path:"skills/slack-gif-creator/tools.md",content:`# Core Utility Modules

Python utility modules that provide the building blocks for creating Slack-optimized GIFs.

## core/gif_builder.py

GIF Builder - Core module for assembling frames into GIFs optimized for Slack.

\`\`\`python
#!/usr/bin/env python3
"""
GIF Builder - Core module for assembling frames into GIFs optimized for Slack.

This module provides the main interface for creating GIFs from programmatically
generated frames, with automatic optimization for Slack's requirements.
"""

from pathlib import Path
from typing import Optional

import imageio.v3 as imageio
import numpy as np
from PIL import Image


class GIFBuilder:
    """Builder for creating optimized GIFs from frames."""

    def __init__(self, width: int = 480, height: int = 480, fps: int = 15):
        """
        Initialize GIF builder.

        Args:
            width: Frame width in pixels
            height: Frame height in pixels
            fps: Frames per second
        """
        self.width = width
        self.height = height
        self.fps = fps
        self.frames: list[np.ndarray] = []

    def add_frame(self, frame: np.ndarray | Image.Image):
        """
        Add a frame to the GIF.

        Args:
            frame: Frame as numpy array or PIL Image (will be converted to RGB)
        """
        if isinstance(frame, Image.Image):
            frame = np.array(frame.convert("RGB"))

        # Ensure frame is correct size
        if frame.shape[:2] != (self.height, self.width):
            pil_frame = Image.fromarray(frame)
            pil_frame = pil_frame.resize(
                (self.width, self.height), Image.Resampling.LANCZOS
            )
            frame = np.array(pil_frame)

        self.frames.append(frame)

    def add_frames(self, frames: list[np.ndarray | Image.Image]):
        """Add multiple frames at once."""
        for frame in frames:
            self.add_frame(frame)

    def optimize_colors(
        self, num_colors: int = 128, use_global_palette: bool = True
    ) -> list[np.ndarray]:
        """
        Reduce colors in all frames using quantization.

        Args:
            num_colors: Target number of colors (8-256)
            use_global_palette: Use a single palette for all frames (better compression)

        Returns:
            List of color-optimized frames
        """
        optimized = []

        if use_global_palette and len(self.frames) > 1:
            # Create a global palette from all frames
            sample_size = min(5, len(self.frames))
            sample_indices = [
                int(i * len(self.frames) / sample_size) for i in range(sample_size)
            ]
            sample_frames = [self.frames[i] for i in sample_indices]

            all_pixels = np.vstack(
                [f.reshape(-1, 3) for f in sample_frames]
            )

            total_pixels = len(all_pixels)
            width = min(512, int(np.sqrt(total_pixels)))
            height = (total_pixels + width - 1) // width

            pixels_needed = width * height
            if pixels_needed > total_pixels:
                padding = np.zeros((pixels_needed - total_pixels, 3), dtype=np.uint8)
                all_pixels = np.vstack([all_pixels, padding])

            img_array = (
                all_pixels[:pixels_needed].reshape(height, width, 3).astype(np.uint8)
            )
            combined_img = Image.fromarray(img_array, mode="RGB")

            global_palette = combined_img.quantize(colors=num_colors, method=2)

            for frame in self.frames:
                pil_frame = Image.fromarray(frame)
                quantized = pil_frame.quantize(palette=global_palette, dither=1)
                optimized.append(np.array(quantized.convert("RGB")))
        else:
            for frame in self.frames:
                pil_frame = Image.fromarray(frame)
                quantized = pil_frame.quantize(colors=num_colors, method=2, dither=1)
                optimized.append(np.array(quantized.convert("RGB")))

        return optimized

    def deduplicate_frames(self, threshold: float = 0.9995) -> int:
        """
        Remove duplicate or near-duplicate consecutive frames.

        Args:
            threshold: Similarity threshold (0.0-1.0). Higher = more strict.

        Returns:
            Number of frames removed
        """
        if len(self.frames) < 2:
            return 0

        deduplicated = [self.frames[0]]
        removed_count = 0

        for i in range(1, len(self.frames)):
            prev_frame = np.array(deduplicated[-1], dtype=np.float32)
            curr_frame = np.array(self.frames[i], dtype=np.float32)

            diff = np.abs(prev_frame - curr_frame)
            similarity = 1.0 - (np.mean(diff) / 255.0)

            if similarity < threshold:
                deduplicated.append(self.frames[i])
            else:
                removed_count += 1

        self.frames = deduplicated
        return removed_count

    def save(
        self,
        output_path: str | Path,
        num_colors: int = 128,
        optimize_for_emoji: bool = False,
        remove_duplicates: bool = False,
    ) -> dict:
        """
        Save frames as optimized GIF for Slack.

        Args:
            output_path: Where to save the GIF
            num_colors: Number of colors to use (fewer = smaller file)
            optimize_for_emoji: If True, optimize for emoji size (128x128, fewer colors)
            remove_duplicates: If True, remove duplicate consecutive frames

        Returns:
            Dictionary with file info (path, size, dimensions, frame_count)
        """
        if not self.frames:
            raise ValueError("No frames to save. Add frames with add_frame() first.")

        output_path = Path(output_path)

        if remove_duplicates:
            removed = self.deduplicate_frames(threshold=0.9995)
            if removed > 0:
                print(f"  Removed {removed} nearly identical frames")

        if optimize_for_emoji:
            if self.width > 128 or self.height > 128:
                self.width = 128
                self.height = 128
                resized_frames = []
                for frame in self.frames:
                    pil_frame = Image.fromarray(frame)
                    pil_frame = pil_frame.resize((128, 128), Image.Resampling.LANCZOS)
                    resized_frames.append(np.array(pil_frame))
                self.frames = resized_frames
            num_colors = min(num_colors, 48)

            if len(self.frames) > 12:
                keep_every = max(1, len(self.frames) // 12)
                self.frames = [
                    self.frames[i] for i in range(0, len(self.frames), keep_every)
                ]

        optimized_frames = self.optimize_colors(num_colors, use_global_palette=True)
        frame_duration = 1000 / self.fps

        imageio.imwrite(
            output_path,
            optimized_frames,
            duration=frame_duration,
            loop=0,
        )

        file_size_kb = output_path.stat().st_size / 1024
        file_size_mb = file_size_kb / 1024

        info = {
            "path": str(output_path),
            "size_kb": file_size_kb,
            "size_mb": file_size_mb,
            "dimensions": f"{self.width}x{self.height}",
            "frame_count": len(optimized_frames),
            "fps": self.fps,
            "duration_seconds": len(optimized_frames) / self.fps,
            "colors": num_colors,
        }

        return info

    def clear(self):
        """Clear all frames."""
        self.frames = []
\`\`\`

## core/validators.py

Validators - Check if GIFs meet Slack's requirements.

\`\`\`python
#!/usr/bin/env python3
"""
Validators - Check if GIFs meet Slack's requirements.
"""

from pathlib import Path


def validate_gif(
    gif_path: str | Path, is_emoji: bool = True, verbose: bool = True
) -> tuple[bool, dict]:
    """
    Validate GIF for Slack (dimensions, size, frame count).

    Args:
        gif_path: Path to GIF file
        is_emoji: True for emoji (128x128 recommended), False for message GIF
        verbose: Print validation details

    Returns:
        Tuple of (passes: bool, results: dict with all details)
    """
    from PIL import Image

    gif_path = Path(gif_path)

    if not gif_path.exists():
        return False, {"error": f"File not found: {gif_path}"}

    size_bytes = gif_path.stat().st_size
    size_kb = size_bytes / 1024
    size_mb = size_kb / 1024

    try:
        with Image.open(gif_path) as img:
            width, height = img.size
            frame_count = 0
            try:
                while True:
                    img.seek(frame_count)
                    frame_count += 1
            except EOFError:
                pass

            try:
                duration_ms = img.info.get("duration", 100)
                total_duration = (duration_ms * frame_count) / 1000
                fps = frame_count / total_duration if total_duration > 0 else 0
            except:
                total_duration = None
                fps = None
    except Exception as e:
        return False, {"error": f"Failed to read GIF: {e}"}

    if is_emoji:
        optimal = width == height == 128
        acceptable = width == height and 64 <= width <= 128
        dim_pass = acceptable
    else:
        aspect_ratio = (
            max(width, height) / min(width, height)
            if min(width, height) > 0
            else float("inf")
        )
        dim_pass = aspect_ratio <= 2.0 and 320 <= min(width, height) <= 640

    results = {
        "file": str(gif_path),
        "passes": dim_pass,
        "width": width,
        "height": height,
        "size_kb": size_kb,
        "size_mb": size_mb,
        "frame_count": frame_count,
        "duration_seconds": total_duration,
        "fps": fps,
        "is_emoji": is_emoji,
        "optimal": optimal if is_emoji else None,
    }

    return dim_pass, results


def is_slack_ready(
    gif_path: str | Path, is_emoji: bool = True, verbose: bool = True
) -> bool:
    """Quick check if GIF is ready for Slack."""
    passes, _ = validate_gif(gif_path, is_emoji, verbose)
    return passes
\`\`\`

## core/easing.py

Easing Functions - Timing functions for smooth animations.

\`\`\`python
#!/usr/bin/env python3
"""
Easing Functions - Timing functions for smooth animations.

All functions take a value t (0.0 to 1.0) and return eased value (0.0 to 1.0).
"""

import math


def linear(t: float) -> float:
    return t

def ease_in_quad(t: float) -> float:
    return t * t

def ease_out_quad(t: float) -> float:
    return t * (2 - t)

def ease_in_out_quad(t: float) -> float:
    if t < 0.5:
        return 2 * t * t
    return -1 + (4 - 2 * t) * t

def ease_in_cubic(t: float) -> float:
    return t * t * t

def ease_out_cubic(t: float) -> float:
    return (t - 1) * (t - 1) * (t - 1) + 1

def ease_in_out_cubic(t: float) -> float:
    if t < 0.5:
        return 4 * t * t * t
    return (t - 1) * (2 * t - 2) * (2 * t - 2) + 1

def ease_in_bounce(t: float) -> float:
    return 1 - ease_out_bounce(1 - t)

def ease_out_bounce(t: float) -> float:
    if t < 1 / 2.75:
        return 7.5625 * t * t
    elif t < 2 / 2.75:
        t -= 1.5 / 2.75
        return 7.5625 * t * t + 0.75
    elif t < 2.5 / 2.75:
        t -= 2.25 / 2.75
        return 7.5625 * t * t + 0.9375
    else:
        t -= 2.625 / 2.75
        return 7.5625 * t * t + 0.984375

def ease_in_out_bounce(t: float) -> float:
    if t < 0.5:
        return ease_in_bounce(t * 2) * 0.5
    return ease_out_bounce(t * 2 - 1) * 0.5 + 0.5

def ease_in_elastic(t: float) -> float:
    if t == 0 or t == 1:
        return t
    return -math.pow(2, 10 * (t - 1)) * math.sin((t - 1.1) * 5 * math.pi)

def ease_out_elastic(t: float) -> float:
    if t == 0 or t == 1:
        return t
    return math.pow(2, -10 * t) * math.sin((t - 0.1) * 5 * math.pi) + 1

def ease_in_out_elastic(t: float) -> float:
    if t == 0 or t == 1:
        return t
    t = t * 2 - 1
    if t < 0:
        return -0.5 * math.pow(2, 10 * t) * math.sin((t - 0.1) * 5 * math.pi)
    return math.pow(2, -10 * t) * math.sin((t - 0.1) * 5 * math.pi) * 0.5 + 1

def ease_back_in(t: float) -> float:
    c1 = 1.70158
    c3 = c1 + 1
    return c3 * t * t * t - c1 * t * t

def ease_back_out(t: float) -> float:
    c1 = 1.70158
    c3 = c1 + 1
    return 1 + c3 * pow(t - 1, 3) + c1 * pow(t - 1, 2)

def ease_back_in_out(t: float) -> float:
    c1 = 1.70158
    c2 = c1 * 1.525
    if t < 0.5:
        return (pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2
    return (pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2


# Convenience mapping
EASING_FUNCTIONS = {
    "linear": linear,
    "ease_in": ease_in_quad,
    "ease_out": ease_out_quad,
    "ease_in_out": ease_in_out_quad,
    "bounce_in": ease_in_bounce,
    "bounce_out": ease_out_bounce,
    "bounce": ease_in_out_bounce,
    "elastic_in": ease_in_elastic,
    "elastic_out": ease_out_elastic,
    "elastic": ease_in_out_elastic,
    "back_in": ease_back_in,
    "back_out": ease_back_out,
    "back_in_out": ease_back_in_out,
    "anticipate": ease_back_in,
    "overshoot": ease_back_out,
}


def get_easing(name: str = "linear"):
    return EASING_FUNCTIONS.get(name, linear)


def interpolate(start: float, end: float, t: float, easing: str = "linear") -> float:
    """Interpolate between two values with easing."""
    ease_func = get_easing(easing)
    eased_t = ease_func(t)
    return start + (end - start) * eased_t


def apply_squash_stretch(
    base_scale: tuple[float, float], intensity: float, direction: str = "vertical"
) -> tuple[float, float]:
    """Calculate squash and stretch scales for more dynamic animation."""
    width_scale, height_scale = base_scale
    if direction == "vertical":
        height_scale *= 1 - intensity * 0.5
        width_scale *= 1 + intensity * 0.5
    elif direction == "horizontal":
        width_scale *= 1 - intensity * 0.5
        height_scale *= 1 + intensity * 0.5
    elif direction == "both":
        width_scale *= 1 - intensity * 0.3
        height_scale *= 1 - intensity * 0.3
    return (width_scale, height_scale)


def calculate_arc_motion(
    start: tuple[float, float], end: tuple[float, float], height: float, t: float
) -> tuple[float, float]:
    """Calculate position along a parabolic arc (natural motion path)."""
    x1, y1 = start
    x2, y2 = end
    x = x1 + (x2 - x1) * t
    arc_offset = 4 * height * t * (1 - t)
    y = y1 + (y2 - y1) * t - arc_offset
    return (x, y)
\`\`\`

## core/frame_composer.py

Frame Composer - Utilities for composing visual elements into frames.

\`\`\`python
#!/usr/bin/env python3
"""
Frame Composer - Utilities for composing visual elements into frames.

Provides functions for drawing shapes, text, and compositing elements
together to create animation frames.
"""

from typing import Optional

import numpy as np
from PIL import Image, ImageDraw, ImageFont


def create_blank_frame(
    width: int, height: int, color: tuple[int, int, int] = (255, 255, 255)
) -> Image.Image:
    """Create a blank frame with solid color background."""
    return Image.new("RGB", (width, height), color)


def draw_circle(
    frame: Image.Image,
    center: tuple[int, int],
    radius: int,
    fill_color: Optional[tuple[int, int, int]] = None,
    outline_color: Optional[tuple[int, int, int]] = None,
    outline_width: int = 1,
) -> Image.Image:
    """Draw a circle on a frame."""
    draw = ImageDraw.Draw(frame)
    x, y = center
    bbox = [x - radius, y - radius, x + radius, y + radius]
    draw.ellipse(bbox, fill=fill_color, outline=outline_color, width=outline_width)
    return frame


def draw_text(
    frame: Image.Image,
    text: str,
    position: tuple[int, int],
    color: tuple[int, int, int] = (0, 0, 0),
    centered: bool = False,
) -> Image.Image:
    """Draw text on a frame."""
    draw = ImageDraw.Draw(frame)
    font = ImageFont.load_default()
    if centered:
        bbox = draw.textbbox((0, 0), text, font=font)
        text_width = bbox[2] - bbox[0]
        text_height = bbox[3] - bbox[1]
        x = position[0] - text_width // 2
        y = position[1] - text_height // 2
        position = (x, y)
    draw.text(position, text, fill=color, font=font)
    return frame


def create_gradient_background(
    width: int,
    height: int,
    top_color: tuple[int, int, int],
    bottom_color: tuple[int, int, int],
) -> Image.Image:
    """Create a vertical gradient background."""
    frame = Image.new("RGB", (width, height))
    draw = ImageDraw.Draw(frame)
    r1, g1, b1 = top_color
    r2, g2, b2 = bottom_color
    for y in range(height):
        ratio = y / height
        r = int(r1 * (1 - ratio) + r2 * ratio)
        g = int(g1 * (1 - ratio) + g2 * ratio)
        b = int(b1 * (1 - ratio) + b2 * ratio)
        draw.line([(0, y), (width, y)], fill=(r, g, b))
    return frame


def draw_star(
    frame: Image.Image,
    center: tuple[int, int],
    size: int,
    fill_color: tuple[int, int, int],
    outline_color: Optional[tuple[int, int, int]] = None,
    outline_width: int = 1,
) -> Image.Image:
    """Draw a 5-pointed star."""
    import math
    draw = ImageDraw.Draw(frame)
    x, y = center
    points = []
    for i in range(10):
        angle = (i * 36 - 90) * math.pi / 180
        radius = size if i % 2 == 0 else size * 0.4
        px = x + radius * math.cos(angle)
        py = y + radius * math.sin(angle)
        points.append((px, py))
    draw.polygon(points, fill=fill_color, outline=outline_color, width=outline_width)
    return frame
\`\`\`
`},{path:"skills/taste-skill/examples.md",content:`# Creative Arsenal & Bento Paradigm

## THE CREATIVE ARSENAL (High-End Inspiration)

Do not default to generic UI. Pull from this library of advanced concepts to ensure the output is visually striking and memorable. When appropriate, leverage **GSAP (ScrollTrigger/Parallax)** for complex scrolltelling or **ThreeJS/WebGL** for 3D/Canvas animations, rather than basic CSS motion. **CRITICAL:** Never mix GSAP/ThreeJS with Framer Motion in the same component tree. Default to Framer Motion for UI/Bento interactions. Use GSAP/ThreeJS EXCLUSIVELY for isolated full-page scrolltelling or canvas backgrounds, wrapped in strict useEffect cleanup blocks.

### The Standard Hero Paradigm

- Stop doing centered text over a dark image. Try asymmetric Hero sections: Text cleanly aligned to the left or right. The background should feature a high-quality, relevant image with a subtle stylistic fade (darkening or lightening gracefully into the background color depending on if it is Light or Dark mode).

### Navigation & Menus

- **Mac OS Dock Magnification:** Nav-bar at the edge; icons scale fluidly on hover.
- **Magnetic Button:** Buttons that physically pull toward the cursor.
- **Gooey Menu:** Sub-items detach from the main button like a viscous liquid.
- **Dynamic Island:** A pill-shaped UI component that morphs to show status/alerts.
- **Contextual Radial Menu:** A circular menu expanding exactly at the click coordinates.
- **Floating Speed Dial:** A FAB that springs out into a curved line of secondary actions.
- **Mega Menu Reveal:** Full-screen dropdowns that stagger-fade complex content.

### Layout & Grids

- **Bento Grid:** Asymmetric, tile-based grouping (e.g., Apple Control Center).
- **Masonry Layout:** Staggered grid without fixed row heights (e.g., Pinterest).
- **Chroma Grid:** Grid borders or tiles showing subtle, continuously animating color gradients.
- **Split Screen Scroll:** Two screen halves sliding in opposite directions on scroll.
- **Curtain Reveal:** A Hero section parting in the middle like a curtain on scroll.

### Cards & Containers

- **Parallax Tilt Card:** A 3D-tilting card tracking the mouse coordinates.
- **Spotlight Border Card:** Card borders that illuminate dynamically under the cursor.
- **Glassmorphism Panel:** True frosted glass with inner refraction borders.
- **Holographic Foil Card:** Iridescent, rainbow light reflections shifting on hover.
- **Tinder Swipe Stack:** A physical stack of cards the user can swipe away.
- **Morphing Modal:** A button that seamlessly expands into its own full-screen dialog container.

### Scroll-Animations

- **Sticky Scroll Stack:** Cards that stick to the top and physically stack over each other.
- **Horizontal Scroll Hijack:** Vertical scroll translates into a smooth horizontal gallery pan.
- **Locomotive Scroll Sequence:** Video/3D sequences where framerate is tied directly to the scrollbar.
- **Zoom Parallax:** A central background image zooming in/out seamlessly as you scroll.
- **Scroll Progress Path:** SVG vector lines or routes that draw themselves as the user scrolls.
- **Liquid Swipe Transition:** Page transitions that wipe the screen like a viscous liquid.

### Galleries & Media

- **Dome Gallery:** A 3D gallery feeling like a panoramic dome.
- **Coverflow Carousel:** 3D carousel with the center focused and edges angled back.
- **Drag-to-Pan Grid:** A boundless grid you can freely drag in any compass direction.
- **Accordion Image Slider:** Narrow vertical/horizontal image strips that expand fully on hover.
- **Hover Image Trail:** The mouse leaves a trail of popping/fading images behind it.
- **Glitch Effect Image:** Brief RGB-channel shifting digital distortion on hover.

### Typography & Text

- **Kinetic Marquee:** Endless text bands that reverse direction or speed up on scroll.
- **Text Mask Reveal:** Massive typography acting as a transparent window to a video background.
- **Text Scramble Effect:** Matrix-style character decoding on load or hover.
- **Circular Text Path:** Text curved along a spinning circular path.
- **Gradient Stroke Animation:** Outlined text with a gradient continuously running along the stroke.
- **Kinetic Typography Grid:** A grid of letters dodging or rotating away from the cursor.

### Micro-Interactions & Effects

- **Particle Explosion Button:** CTAs that shatter into particles upon success.
- **Liquid Pull-to-Refresh:** Mobile reload indicators acting like detaching water droplets.
- **Skeleton Shimmer:** Shifting light reflections moving across placeholder boxes.
- **Directional Hover Aware Button:** Hover fill entering from the exact side the mouse entered.
- **Ripple Click Effect:** Visual waves rippling precisely from the click coordinates.
- **Animated SVG Line Drawing:** Vectors that draw their own contours in real-time.
- **Mesh Gradient Background:** Organic, lava-lamp-like animated color blobs.
- **Lens Blur Depth:** Dynamic focus blurring background UI layers to highlight a foreground action.

---

## THE "MOTION-ENGINE" BENTO PARADIGM

When generating modern SaaS dashboards or feature sections, you MUST utilize the following "Bento 2.0" architecture and motion philosophy. This goes beyond static cards and enforces a "Vercel-core meets Dribbble-clean" aesthetic heavily reliant on perpetual physics.

### A. Core Design Philosophy

- **Aesthetic:** High-end, minimal, and functional.
- **Palette:** Background in \`#f9fafb\`. Cards are pure white (\`#ffffff\`) with a 1px border of \`border-slate-200/50\`.
- **Surfaces:** Use \`rounded-[2.5rem]\` for all major containers. Apply a "diffusion shadow" (a very light, wide-spreading shadow, e.g., \`shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)]\`) to create depth without clutter.
- **Typography:** Strict \`Geist\`, \`Satoshi\`, or \`Cabinet Grotesk\` font stack. Use subtle tracking (\`tracking-tight\`) for headers.
- **Labels:** Titles and descriptions must be placed **outside and below** the cards to maintain a clean, gallery-style presentation.
- **Pixel-Perfection:** Use generous \`p-8\` or \`p-10\` padding inside cards.

### B. The Animation Engine Specs (Perpetual Motion)

All cards must contain **"Perpetual Micro-Interactions."** Use the following Framer Motion principles:

- **Spring Physics:** No linear easing. Use \`type: "spring", stiffness: 100, damping: 20\` for a premium, weighty feel.
- **Layout Transitions:** Heavily utilize the \`layout\` and \`layoutId\` props to ensure smooth re-ordering, resizing, and shared element state transitions.
- **Infinite Loops:** Every card must have an "Active State" that loops infinitely (Pulse, Typewriter, Float, or Carousel) to ensure the dashboard feels "alive".
- **Performance:** Wrap dynamic lists in \`<AnimatePresence>\` and optimize for 60fps. **PERFORMANCE CRITICAL:** Any perpetual motion or infinite loop MUST be memoized (React.memo) and completely isolated in its own microscopic Client Component. Never trigger re-renders in the parent layout.

### C. The 5-Card Archetypes (Micro-Animation Specs)

Implement these specific micro-animations when constructing Bento grids (e.g., Row 1: 3 cols | Row 2: 2 cols split 70/30):

1. **The Intelligent List:** A vertical stack of items with an infinite auto-sorting loop. Items swap positions using \`layoutId\`, simulating an AI prioritizing tasks in real-time.

2. **The Command Input:** A search/AI bar with a multi-step Typewriter Effect. It cycles through complex prompts, including a blinking cursor and a "processing" state with a shimmering loading gradient.

3. **The Live Status:** A scheduling interface with "breathing" status indicators. Include a pop-up notification badge that emerges with an "Overshoot" spring effect, stays for 3 seconds, and vanishes.

4. **The Wide Data Stream:** A horizontal "Infinite Carousel" of data cards or metrics. Ensure the loop is seamless (using \`x: ["0%", "-100%"]\`) with a speed that feels effortless.

5. **The Contextual UI (Focus Mode):** A document view that animates a staggered highlight of a text block, followed by a "Float-in" of a floating action toolbar with micro-icons.
`},{path:"skills/taste-skill/references.md",content:'# Technical Reference\n\n## DESIGN_VARIANCE (Level 1-10)\n\n- **1-3 (Predictable):** Flexbox `justify-center`, strict 12-column symmetrical grids, equal paddings.\n- **4-7 (Offset):** Use `margin-top: -2rem` overlapping, varied image aspect ratios (e.g., 4:3 next to 16:9), left-aligned headers over center-aligned data.\n- **8-10 (Asymmetric):** Masonry layouts, CSS Grid with fractional units (e.g., `grid-template-columns: 2fr 1fr 1fr`), massive empty zones (`padding-left: 20vw`).\n- **MOBILE OVERRIDE:** For levels 4-10, any asymmetric layout above `md:` MUST aggressively fall back to a strict, single-column layout (`w-full`, `px-4`, `py-8`) on viewports < 768px to prevent horizontal scrolling and layout breakage.\n\n## MOTION_INTENSITY (Level 1-10)\n\n- **1-3 (Static):** No automatic animations. CSS `:hover` and `:active` states only.\n- **4-7 (Fluid CSS):** Use `transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1)`. Use `animation-delay` cascades for load-ins. Focus strictly on `transform` and `opacity`. Use `will-change: transform` sparingly.\n- **8-10 (Advanced Choreography):** Complex scroll-triggered reveals or parallax. Use Framer Motion hooks. NEVER use `window.addEventListener(\'scroll\')`.\n\n## VISUAL_DENSITY (Level 1-10)\n\n- **1-3 (Art Gallery Mode):** Lots of white space. Huge section gaps. Everything feels very expensive and clean.\n- **4-7 (Daily App Mode):** Normal spacing for standard web apps.\n- **8-10 (Cockpit Mode):** Tiny paddings. No card boxes; just 1px lines to separate data. Everything is packed. **Mandatory:** Use Monospace (`font-mono`) for all numbers.\n\n## AI TELLS (Forbidden Patterns)\n\nTo guarantee a premium, non-generic output, you MUST strictly avoid these common AI design signatures unless explicitly requested:\n\n### Visual & CSS\n\n- **NO Neon/Outer Glows:** Do not use default `box-shadow` glows or auto-glows. Use inner borders or subtle tinted shadows.\n- **NO Pure Black:** Never use `#000000`. Use Off-Black, Zinc-950, or Charcoal.\n- **NO Oversaturated Accents:** Desaturate accents to blend elegantly with neutrals.\n- **NO Excessive Gradient Text:** Do not use text-fill gradients for large headers.\n- **NO Custom Mouse Cursors:** They are outdated and ruin performance/accessibility.\n\n### Typography\n\n- **NO Inter Font:** Banned. Use `Geist`, `Outfit`, `Cabinet Grotesk`, or `Satoshi`.\n- **NO Oversized H1s:** The first heading should not scream. Control hierarchy with weight and color, not just massive scale.\n- **Serif Constraints:** Use Serif fonts ONLY for creative/editorial designs. **NEVER** use Serif on clean Dashboards.\n\n### Layout & Spacing\n\n- **Align & Space Perfectly:** Ensure padding and margins are mathematically perfect. Avoid floating elements with awkward gaps.\n- **NO 3-Column Card Layouts:** The generic "3 equal cards horizontally" feature row is BANNED. Use a 2-column Zig-Zag, asymmetric grid, or horizontal scrolling approach instead.\n\n### Content & Data (The "Jane Doe" Effect)\n\n- **NO Generic Names:** "John Doe", "Sarah Chan", or "Jack Su" are banned. Use highly creative, realistic-sounding names.\n- **NO Generic Avatars:** DO NOT use standard SVG "egg" or Lucide user icons for avatars. Use creative, believable photo placeholders or specific styling.\n- **NO Fake Numbers:** Avoid predictable outputs like `99.99%`, `50%`, or basic phone numbers (`1234567`). Use organic, messy data (`47.2%`, `+1 (312) 847-1928`).\n- **NO Startup Slop Names:** "Acme", "Nexus", "SmartFlow". Invent premium, contextual brand names.\n- **NO Filler Words:** Avoid AI copywriting cliches like "Elevate", "Seamless", "Unleash", or "Next-Gen". Use concrete verbs.\n\n### External Resources & Components\n\n- **NO Broken Unsplash Links:** Do not use Unsplash. Use absolute, reliable placeholders like `https://picsum.photos/seed/{random_string}/800/600` or SVG UI Avatars.\n- **shadcn/ui Customization:** You may use `shadcn/ui`, but NEVER in its generic default state. You MUST customize the radii, colors, and shadows to match the high-end project aesthetic.\n- **Production-Ready Cleanliness:** Code must be extremely clean, visually striking, memorable, and meticulously refined in every detail.\n'},{path:"skills/taste-skill/skill.md",content:'---\nname: design-taste-frontend\ndescription: Senior UI/UX Engineer. Architect digital interfaces overriding default LLM biases. Enforces metric-based rules, strict component architecture, CSS hardware acceleration, and balanced design engineering.\ntags:\n  - frontend\n  - design\n  - ui-ux\n---\n\n# High-Agency Frontend Skill\n\n## 1. ACTIVE BASELINE CONFIGURATION\n\n- DESIGN_VARIANCE: 8 (1=Perfect Symmetry, 10=Artsy Chaos)\n- MOTION_INTENSITY: 6 (1=Static/No movement, 10=Cinematic/Magic Physics)\n- VISUAL_DENSITY: 4 (1=Art Gallery/Airy, 10=Pilot Cockpit/Packed Data)\n\n**AI Instruction:** The standard baseline for all generations is strictly set to these values (8, 6, 4). Do not ask the user to edit this file. Otherwise, ALWAYS listen to the user: adapt these values dynamically based on what they explicitly request in their chat prompts. Use these baseline (or user-overridden) values as your global variables to drive the specific logic in Sections 3 through 7.\n\n## 2. DEFAULT ARCHITECTURE & CONVENTIONS\n\nUnless the user explicitly specifies a different stack, adhere to these structural constraints to maintain consistency:\n\n- **DEPENDENCY VERIFICATION [MANDATORY]:** Before importing ANY 3rd party library (e.g. `framer-motion`, `lucide-react`, `zustand`), you MUST check `package.json`. If the package is missing, you MUST output the installation command (e.g. `npm install package-name`) before providing the code. **Never** assume a library exists.\n\n- **Framework & Interactivity:** React or Next.js. Default to Server Components (`RSC`).\n  - **RSC SAFETY:** Global state works ONLY in Client Components. In Next.js, wrap providers in a `"use client"` component.\n  - **INTERACTIVITY ISOLATION:** If Sections 4 or 7 (Motion/Liquid Glass) are active, the specific interactive UI component MUST be extracted as an isolated leaf component with `\'use client\'` at the very top. Server Components must exclusively render static layouts.\n\n- **State Management:** Use local `useState`/`useReducer` for isolated UI. Use global state strictly for deep prop-drilling avoidance.\n\n- **Styling Policy:** Use Tailwind CSS (v3/v4) for 90% of styling.\n  - **TAILWIND VERSION LOCK:** Check `package.json` first. Do not use v4 syntax in v3 projects.\n  - **T4 CONFIG GUARD:** For v4, do NOT use `tailwindcss` plugin in `postcss.config.js`. Use `@tailwindcss/postcss` or the Vite plugin.\n\n- **ANTI-EMOJI POLICY [CRITICAL]:** NEVER use emojis in code, markup, text content, or alt text. Replace symbols with high-quality icons (Radix, Phosphor) or clean SVG primitives. Emojis are BANNED.\n\n- **Responsiveness & Spacing:**\n  - Standardize breakpoints (`sm`, `md`, `lg`, `xl`).\n  - Contain page layouts using `max-w-[1400px] mx-auto` or `max-w-7xl`.\n  - **Viewport Stability [CRITICAL]:** NEVER use `h-screen` for full-height Hero sections. ALWAYS use `min-h-[100dvh]` to prevent catastrophic layout jumping on mobile browsers (iOS Safari).\n  - **Grid over Flex-Math:** NEVER use complex flexbox percentage math (`w-[calc(33%-1rem)]`). ALWAYS use CSS Grid (`grid grid-cols-1 md:grid-cols-3 gap-6`) for reliable structures.\n\n- **Icons:** You MUST use exactly `@phosphor-icons/react` or `@radix-ui/react-icons` as the import paths (check installed version). Standardize `strokeWidth` globally (e.g., exclusively use `1.5` or `2.0`).\n\n## 3. DESIGN ENGINEERING DIRECTIVES (Bias Correction)\n\nLLMs have statistical biases toward specific UI cliche patterns. Proactively construct premium interfaces using these engineered rules:\n\n**Rule 1: Deterministic Typography**\n\n- **Display/Headlines:** Default to `text-4xl md:text-6xl tracking-tighter leading-none`.\n  - **ANTI-SLOP:** Discourage `Inter` for "Premium" or "Creative" vibes. Force unique character using `Geist`, `Outfit`, `Cabinet Grotesk`, or `Satoshi`.\n  - **TECHNICAL UI RULE:** Serif fonts are strictly BANNED for Dashboard/Software UIs. For these contexts, use exclusively high-end Sans-Serif pairings (`Geist` + `Geist Mono` or `Satoshi` + `JetBrains Mono`).\n\n- **Body/Paragraphs:** Default to `text-base text-gray-600 leading-relaxed max-w-[65ch]`.\n\n**Rule 2: Color Calibration**\n\n- **Constraint:** Max 1 Accent Color. Saturation < 80%.\n- **THE LILA BAN:** The "AI Purple/Blue" aesthetic is strictly BANNED. No purple button glows, no neon gradients. Use absolute neutral bases (Zinc/Slate) with high-contrast, singular accents (e.g. Emerald, Electric Blue, or Deep Rose).\n- **COLOR CONSISTENCY:** Stick to one palette for the entire output. Do not fluctuate between warm and cool grays within the same project.\n\n**Rule 3: Layout Diversification**\n\n- **ANTI-CENTER BIAS:** Centered Hero/H1 sections are strictly BANNED when `LAYOUT_VARIANCE > 4`. Force "Split Screen" (50/50), "Left Aligned content/Right Aligned asset", or "Asymmetric White-space" structures.\n\n**Rule 4: Materiality, Shadows, and "Anti-Card Overuse"**\n\n- **DASHBOARD HARDENING:** For `VISUAL_DENSITY > 7`, generic card containers are strictly BANNED. Use logic-grouping via `border-t`, `divide-y`, or purely negative space. Data metrics should breathe without being boxed in unless elevation (z-index) is functionally required.\n- **Execution:** Use cards ONLY when elevation communicates hierarchy. When a shadow is used, tint it to the background hue.\n\n**Rule 5: Interactive UI States**\n\n- **Mandatory Generation:** LLMs naturally generate "static" successful states. You MUST implement full interaction cycles:\n  - **Loading:** Skeletal loaders matching layout sizes (avoid generic circular spinners).\n  - **Empty States:** Beautifully composed empty states indicating how to populate data.\n  - **Error States:** Clear, inline error reporting (e.g., forms).\n  - **Tactile Feedback:** On `:active`, use `-translate-y-[1px]` or `scale-[0.98]` to simulate a physical push indicating success/action.\n\n**Rule 6: Data & Form Patterns**\n\n- **Forms:** Label MUST sit above input. Helper text is optional but should exist in markup. Error text below input. Use a standard `gap-2` for input blocks.\n\n## 4. CREATIVE PROACTIVITY (Anti-Slop Implementation)\n\nTo actively combat generic AI designs, systematically implement these high-end coding concepts as your baseline:\n\n- **"Liquid Glass" Refraction:** When glassmorphism is needed, go beyond `backdrop-blur`. Add a 1px inner border (`border-white/10`) and a subtle inner shadow (`shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]`) to simulate physical edge refraction.\n\n- **Magnetic Micro-physics (If MOTION_INTENSITY > 5):** Implement buttons that pull slightly toward the mouse cursor. **CRITICAL:** NEVER use React `useState` for magnetic hover or continuous animations. Use EXCLUSIVELY Framer Motion\'s `useMotionValue` and `useTransform` outside the React render cycle to prevent performance collapse on mobile.\n\n- **Perpetual Micro-Interactions:** When `MOTION_INTENSITY > 5`, embed continuous, infinite micro-animations (Pulse, Typewriter, Float, Shimmer, Carousel) in standard components (avatars, status dots, backgrounds). Apply premium Spring Physics (`type: "spring", stiffness: 100, damping: 20`) to all interactive elements -- no linear easing.\n\n- **Layout Transitions:** Always utilize Framer Motion\'s `layout` and `layoutId` props for smooth re-ordering, resizing, and shared element transitions across state changes.\n\n- **Staggered Orchestration:** Do not mount lists or grids instantly. Use `staggerChildren` (Framer) or CSS cascade (`animation-delay: calc(var(--index) * 100ms)`) to create sequential waterfall reveals. **CRITICAL:** For `staggerChildren`, the Parent (`variants`) and Children MUST reside in the identical Client Component tree. If data is fetched asynchronously, pass the data as props into a centralized Parent Motion wrapper.\n\n## 5. PERFORMANCE GUARDRAILS\n\n- **DOM Cost:** Apply grain/noise filters exclusively to fixed, pointer-event-none pseudo-elements (e.g., `fixed inset-0 z-50 pointer-events-none`) and NEVER to scrolling containers to prevent continuous GPU repaints and mobile performance degradation.\n\n- **Hardware Acceleration:** Never animate `top`, `left`, `width`, or `height`. Animate exclusively via `transform` and `opacity`.\n\n- **Z-Index Restraint:** NEVER spam arbitrary `z-50` or `z-10` unprompted. Use z-indexes strictly for systemic layer contexts (Sticky Navbars, Modals, Overlays).\n\n## 10. FINAL PRE-FLIGHT CHECK\n\nEvaluate your code against this matrix before outputting. This is the **last** filter you apply to your logic.\n\n- [ ] Is global state used appropriately to avoid deep prop-drilling rather than arbitrarily?\n- [ ] Is mobile layout collapse (`w-full`, `px-4`, `max-w-7xl mx-auto`) guaranteed for high-variance designs?\n- [ ] Do full-height sections safely use `min-h-[100dvh]` instead of the bugged `h-screen`?\n- [ ] Do `useEffect` animations contain strict cleanup functions?\n- [ ] Are empty, loading, and error states provided?\n- [ ] Are cards omitted in favor of spacing where possible?\n- [ ] Did you strictly isolate CPU-heavy perpetual animations in their own Client Components?\n'},{path:"skills/theme-factory/references.md",content:`# Theme Definitions

Complete specifications for all 10 available themes.

---

## Ocean Depths

A professional and calming maritime theme that evokes the serenity of deep ocean waters.

### Color Palette

- **Deep Navy**: \`#1a2332\` - Primary background color
- **Teal**: \`#2d8b8b\` - Accent color for highlights and emphasis
- **Seafoam**: \`#a8dadc\` - Secondary accent for lighter elements
- **Cream**: \`#f1faee\` - Text and light backgrounds

### Typography

- **Headers**: DejaVu Sans Bold
- **Body Text**: DejaVu Sans

### Best Used For

Corporate presentations, financial reports, professional consulting decks, trust-building content.

---

## Sunset Boulevard

A warm and vibrant theme inspired by golden hour sunsets, perfect for energetic and creative presentations.

### Color Palette

- **Burnt Orange**: \`#e76f51\` - Primary accent color
- **Coral**: \`#f4a261\` - Secondary warm accent
- **Warm Sand**: \`#e9c46a\` - Highlighting and backgrounds
- **Deep Purple**: \`#264653\` - Dark contrast and text

### Typography

- **Headers**: DejaVu Serif Bold
- **Body Text**: DejaVu Sans

### Best Used For

Creative pitches, marketing presentations, lifestyle brands, event promotions, inspirational content.

---

## Forest Canopy

A natural and grounded theme featuring earth tones inspired by dense forest environments.

### Color Palette

- **Forest Green**: \`#2d4a2b\` - Primary dark green
- **Sage**: \`#7d8471\` - Muted green accent
- **Olive**: \`#a4ac86\` - Light accent color
- **Ivory**: \`#faf9f6\` - Backgrounds and text

### Typography

- **Headers**: FreeSerif Bold
- **Body Text**: FreeSans

### Best Used For

Environmental presentations, sustainability reports, outdoor brands, wellness content, organic products.

---

## Modern Minimalist

A clean and contemporary theme with a sophisticated grayscale palette for maximum versatility.

### Color Palette

- **Charcoal**: \`#36454f\` - Primary dark color
- **Slate Gray**: \`#708090\` - Medium gray for accents
- **Light Gray**: \`#d3d3d3\` - Backgrounds and dividers
- **White**: \`#ffffff\` - Text and clean backgrounds

### Typography

- **Headers**: DejaVu Sans Bold
- **Body Text**: DejaVu Sans

### Best Used For

Tech presentations, architecture portfolios, design showcases, modern business proposals, data visualization.

---

## Golden Hour

A rich and warm autumnal palette that creates an inviting and sophisticated atmosphere.

### Color Palette

- **Mustard Yellow**: \`#f4a900\` - Bold primary accent
- **Terracotta**: \`#c1666b\` - Warm secondary color
- **Warm Beige**: \`#d4b896\` - Neutral backgrounds
- **Chocolate Brown**: \`#4a403a\` - Dark text and anchors

### Typography

- **Headers**: FreeSans Bold
- **Body Text**: FreeSans

### Best Used For

Restaurant presentations, hospitality brands, fall campaigns, cozy lifestyle content, artisan products.

---

## Arctic Frost

A cool and crisp winter-inspired theme that conveys clarity, precision, and professionalism.

### Color Palette

- **Ice Blue**: \`#d4e4f7\` - Light backgrounds and highlights
- **Steel Blue**: \`#4a6fa5\` - Primary accent color
- **Silver**: \`#c0c0c0\` - Metallic accent elements
- **Crisp White**: \`#fafafa\` - Clean backgrounds and text

### Typography

- **Headers**: DejaVu Sans Bold
- **Body Text**: DejaVu Sans

### Best Used For

Healthcare presentations, technology solutions, winter sports, clean tech, pharmaceutical content.

---

## Desert Rose

A soft and sophisticated theme with dusty, muted tones perfect for elegant presentations.

### Color Palette

- **Dusty Rose**: \`#d4a5a5\` - Soft primary color
- **Clay**: \`#b87d6d\` - Earthy accent
- **Sand**: \`#e8d5c4\` - Warm neutral backgrounds
- **Deep Burgundy**: \`#5d2e46\` - Rich dark contrast

### Typography

- **Headers**: FreeSans Bold
- **Body Text**: FreeSans

### Best Used For

Fashion presentations, beauty brands, wedding planning, interior design, boutique businesses.

---

## Tech Innovation

A bold and modern theme with high-contrast colors perfect for cutting-edge technology presentations.

### Color Palette

- **Electric Blue**: \`#0066ff\` - Vibrant primary accent
- **Neon Cyan**: \`#00ffff\` - Bright highlight color
- **Dark Gray**: \`#1e1e1e\` - Deep backgrounds
- **White**: \`#ffffff\` - Clean text and contrast

### Typography

- **Headers**: DejaVu Sans Bold
- **Body Text**: DejaVu Sans

### Best Used For

Tech startups, software launches, innovation showcases, AI/ML presentations, digital transformation content.

---

## Botanical Garden

A fresh and organic theme featuring vibrant garden-inspired colors for lively presentations.

### Color Palette

- **Fern Green**: \`#4a7c59\` - Rich natural green
- **Marigold**: \`#f9a620\` - Bright floral accent
- **Terracotta**: \`#b7472a\` - Earthy warm tone
- **Cream**: \`#f5f3ed\` - Soft neutral backgrounds

### Typography

- **Headers**: DejaVu Serif Bold
- **Body Text**: DejaVu Sans

### Best Used For

Garden centers, food presentations, farm-to-table content, botanical brands, natural products.

---

## Midnight Galaxy

A dramatic and cosmic theme with deep purples and mystical tones for impactful presentations.

### Color Palette

- **Deep Purple**: \`#2b1e3e\` - Rich dark base
- **Cosmic Blue**: \`#4a4e8f\` - Mystical mid-tone
- **Lavender**: \`#a490c2\` - Soft accent color
- **Silver**: \`#e6e6fa\` - Light highlights and text

### Typography

- **Headers**: FreeSans Bold
- **Body Text**: FreeSans

### Best Used For

Entertainment industry, gaming presentations, nightlife venues, luxury brands, creative agencies.
`},{path:"skills/theme-factory/skill.md",content:`---
name: theme-factory
description: "Apply visual themes (colors, fonts) to artifacts \u2014 slides, docs, HTML pages. 10 presets + custom generation."
tags:
  - design
  - themes
  - styling
  - presentations
  - artifacts
---

# Theme Factory Skill

This skill provides a curated collection of professional font and color themes themes, each with carefully selected color palettes and font pairings. Once a theme is chosen, it can be applied to any artifact.

## Purpose

To apply consistent, professional styling to presentation slide decks, use this skill. Each theme includes:
- A cohesive color palette with hex codes
- Complementary font pairings for headers and body text
- A distinct visual identity suitable for different contexts and audiences

## Usage Instructions

To apply styling to a slide deck or other artifact:

1. **Show the theme showcase**: Display the \`theme-showcase.pdf\` file to allow users to see all available themes visually. Do not make any modifications to it; simply show the file for viewing.
2. **Ask for their choice**: Ask which theme to apply to the deck
3. **Wait for selection**: Get explicit confirmation about the chosen theme
4. **Apply the theme**: Once a theme has been chosen, apply the selected theme's colors and fonts to the deck/artifact

## Themes Available

The following 10 themes are available, each showcased in \`theme-showcase.pdf\`:

1. **Ocean Depths** - Professional and calming maritime theme
2. **Sunset Boulevard** - Warm and vibrant sunset colors
3. **Forest Canopy** - Natural and grounded earth tones
4. **Modern Minimalist** - Clean and contemporary grayscale
5. **Golden Hour** - Rich and warm autumnal palette
6. **Arctic Frost** - Cool and crisp winter-inspired theme
7. **Desert Rose** - Soft and sophisticated dusty tones
8. **Tech Innovation** - Bold and modern tech aesthetic
9. **Botanical Garden** - Fresh and organic garden colors
10. **Midnight Galaxy** - Dramatic and cosmic deep tones

## Theme Details

Each theme is defined in the \`themes/\` directory with complete specifications including:
- Cohesive color palette with hex codes
- Complementary font pairings for headers and body text
- Distinct visual identity suitable for different contexts and audiences

## Application Process

After a preferred theme is selected:
1. Read the corresponding theme file from the \`themes/\` directory
2. Apply the specified colors and fonts consistently throughout the deck
3. Ensure proper contrast and readability
4. Maintain the theme's visual identity across all slides

## Create your Own Theme
To handle cases where none of the existing themes work for an artifact, create a custom theme. Based on provided inputs, generate a new theme similar to the ones above. Give the theme a similar name describing what the font/color combinations represent. Use any basic description provided to choose appropriate colors/fonts. After generating the theme, show it for review and verification. Following that, apply the theme as described above.
`},{path:"skills/web-artifacts-builder/skill.md",content:`---
name: web-artifacts-builder
description: "Build complex multi-component HTML artifacts with React, Tailwind, and shadcn/ui for claude.ai."
tags:
  - frontend
  - react
  - web
  - artifacts
  - html
  - tailwind
  - shadcn
---

# Web Artifacts Builder

To build powerful frontend claude.ai artifacts, follow these steps:
1. Initialize the frontend repo using \`scripts/init-artifact.sh\`
2. Develop your artifact by editing the generated code
3. Bundle all code into a single HTML file using \`scripts/bundle-artifact.sh\`
4. Display artifact to user
5. (Optional) Test the artifact

**Stack**: React 18 + TypeScript + Vite + Parcel (bundling) + Tailwind CSS + shadcn/ui

## Design & Style Guidelines

VERY IMPORTANT: To avoid what is often referred to as "AI slop", avoid using excessive centered layouts, purple gradients, uniform rounded corners, and Inter font.

## Quick Start

### Step 1: Initialize Project

Run the initialization script to create a new React project:
\`\`\`bash
bash scripts/init-artifact.sh <project-name>
cd <project-name>
\`\`\`

This creates a fully configured project with:
- React + TypeScript (via Vite)
- Tailwind CSS 3.4.1 with shadcn/ui theming system
- Path aliases (\`@/\`) configured
- 40+ shadcn/ui components pre-installed
- All Radix UI dependencies included
- Parcel configured for bundling (via .parcelrc)
- Node 18+ compatibility (auto-detects and pins Vite version)

### Step 2: Develop Your Artifact

To build the artifact, edit the generated files. See **Common Development Tasks** below for guidance.

### Step 3: Bundle to Single HTML File

To bundle the React app into a single HTML artifact:
\`\`\`bash
bash scripts/bundle-artifact.sh
\`\`\`

This creates \`bundle.html\` - a self-contained artifact with all JavaScript, CSS, and dependencies inlined. This file can be directly shared in Claude conversations as an artifact.

**Requirements**: Your project must have an \`index.html\` in the root directory.

**What the script does**:
- Installs bundling dependencies (parcel, @parcel/config-default, parcel-resolver-tspaths, html-inline)
- Creates \`.parcelrc\` config with path alias support
- Builds with Parcel (no source maps)
- Inlines all assets into single HTML using html-inline

### Step 4: Share Artifact with User

Finally, share the bundled HTML file in conversation with the user so they can view it as an artifact.

### Step 5: Testing/Visualizing the Artifact (Optional)

Note: This is a completely optional step. Only perform if necessary or requested.

To test/visualize the artifact, use available tools (including other Skills or built-in tools like Playwright or Puppeteer). In general, avoid testing the artifact upfront as it adds latency between the request and when the finished artifact can be seen. Test later, after presenting the artifact, if requested or if issues arise.

## Reference

- **shadcn/ui components**: https://ui.shadcn.com/docs/components
`},{path:"skills/web-artifacts-builder/tools.md",content:`# Scripts

Shell scripts for initializing and bundling web artifact projects.

## scripts/init-artifact.sh

Initializes a new React + TypeScript project fully configured for building claude.ai HTML artifacts.

### Usage

\`\`\`bash
bash scripts/init-artifact.sh <project-name>
\`\`\`

### What It Does

1. **Detects Node version** - Requires Node 18+; pins Vite 5.4.11 for Node 18, uses latest for Node 20+
2. **Creates Vite project** - Scaffolds a React + TypeScript project via \`pnpm create vite\`
3. **Installs Tailwind CSS** - Sets up Tailwind CSS 3.4.1 with PostCSS and autoprefixer
4. **Configures shadcn/ui theming** - Creates \`tailwind.config.js\` with full shadcn/ui color system (CSS variables for background, foreground, primary, secondary, destructive, muted, accent, popover, card) and animation keyframes
5. **Sets up CSS variables** - Creates \`src/index.css\` with light and dark mode CSS variable definitions
6. **Configures path aliases** - Sets up \`@/\` alias in \`tsconfig.json\`, \`tsconfig.app.json\`, and \`vite.config.ts\`
7. **Installs Radix UI dependencies** - Installs 27 Radix UI primitive packages (accordion, dialog, dropdown-menu, tabs, tooltip, etc.)
8. **Installs utility packages** - sonner, cmdk, vaul, embla-carousel-react, react-day-picker, react-resizable-panels, date-fns, react-hook-form, zod
9. **Extracts shadcn/ui components** - Unpacks 40+ pre-built components from \`shadcn-components.tar.gz\` into \`src/\`
10. **Creates components.json** - Reference config for shadcn/ui CLI compatibility

### Included Components (40+)

accordion, alert, aspect-ratio, avatar, badge, breadcrumb, button, calendar, card, carousel, checkbox, collapsible, command, context-menu, dialog, drawer, dropdown-menu, form, hover-card, input, label, menubar, navigation-menu, popover, progress, radio-group, resizable, scroll-area, select, separator, sheet, skeleton, slider, sonner, switch, table, tabs, textarea, toast, toggle, toggle-group, tooltip

### Import Examples

\`\`\`typescript
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog'
\`\`\`

---

## scripts/bundle-artifact.sh

Bundles a React application into a single self-contained HTML file suitable for use as a claude.ai artifact.

### Usage

\`\`\`bash
# Run from your project root directory
bash scripts/bundle-artifact.sh
\`\`\`

### Requirements

- Must be run from the project root (where \`package.json\` lives)
- Project must have an \`index.html\` in the root directory

### What It Does

1. **Installs bundling dependencies** - parcel, @parcel/config-default, parcel-resolver-tspaths, html-inline
2. **Creates Parcel configuration** - \`.parcelrc\` with path alias support via parcel-resolver-tspaths
3. **Cleans previous builds** - Removes \`dist/\` and \`bundle.html\`
4. **Builds with Parcel** - Compiles the project with no source maps (\`pnpm exec parcel build index.html --dist-dir dist --no-source-maps\`)
5. **Inlines all assets** - Uses html-inline to merge all JS, CSS, and assets into a single \`bundle.html\`

### Output

Creates \`bundle.html\` in the project root - a self-contained HTML file with all JavaScript, CSS, and dependencies inlined. This file can be:
- Shared directly in Claude conversations as an artifact
- Opened in any browser for local testing
`},{path:"skills/webapp-testing/examples.md",content:`# Examples

Common Playwright automation patterns for testing web applications.

## Element Discovery

Discovering buttons, links, and inputs on a page.

\`\`\`python
from playwright.sync_api import sync_playwright

# Example: Discovering buttons and other elements on a page

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()

    # Navigate to page and wait for it to fully load
    page.goto('http://localhost:5173')
    page.wait_for_load_state('networkidle')

    # Discover all buttons on the page
    buttons = page.locator('button').all()
    print(f"Found {len(buttons)} buttons:")
    for i, button in enumerate(buttons):
        text = button.inner_text() if button.is_visible() else "[hidden]"
        print(f"  [{i}] {text}")

    # Discover links
    links = page.locator('a[href]').all()
    print(f"\\nFound {len(links)} links:")
    for link in links[:5]:  # Show first 5
        text = link.inner_text().strip()
        href = link.get_attribute('href')
        print(f"  - {text} -> {href}")

    # Discover input fields
    inputs = page.locator('input, textarea, select').all()
    print(f"\\nFound {len(inputs)} input fields:")
    for input_elem in inputs:
        name = input_elem.get_attribute('name') or input_elem.get_attribute('id') or "[unnamed]"
        input_type = input_elem.get_attribute('type') or 'text'
        print(f"  - {name} ({input_type})")

    # Take screenshot for visual reference
    page.screenshot(path='/tmp/page_discovery.png', full_page=True)
    print("\\nScreenshot saved to /tmp/page_discovery.png")

    browser.close()
\`\`\`

## Static HTML Automation

Using file:// URLs for local HTML files.

\`\`\`python
from playwright.sync_api import sync_playwright
import os

# Example: Automating interaction with static HTML files using file:// URLs

html_file_path = os.path.abspath('path/to/your/file.html')
file_url = f'file://{html_file_path}'

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 1920, 'height': 1080})

    # Navigate to local HTML file
    page.goto(file_url)

    # Take screenshot
    page.screenshot(path='/mnt/user-data/outputs/static_page.png', full_page=True)

    # Interact with elements
    page.click('text=Click Me')
    page.fill('#name', 'John Doe')
    page.fill('#email', 'john@example.com')

    # Submit form
    page.click('button[type="submit"]')
    page.wait_for_timeout(500)

    # Take final screenshot
    page.screenshot(path='/mnt/user-data/outputs/after_submit.png', full_page=True)

    browser.close()

print("Static HTML automation completed!")
\`\`\`

## Console Logging

Capturing console logs during browser automation.

\`\`\`python
from playwright.sync_api import sync_playwright

# Example: Capturing console logs during browser automation

url = 'http://localhost:5173'  # Replace with your URL

console_logs = []

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 1920, 'height': 1080})

    # Set up console log capture
    def handle_console_message(msg):
        console_logs.append(f"[{msg.type}] {msg.text}")
        print(f"Console: [{msg.type}] {msg.text}")

    page.on("console", handle_console_message)

    # Navigate to page
    page.goto(url)
    page.wait_for_load_state('networkidle')

    # Interact with the page (triggers console logs)
    page.click('text=Dashboard')
    page.wait_for_timeout(1000)

    browser.close()

# Save console logs to file
with open('/mnt/user-data/outputs/console.log', 'w') as f:
    f.write('\\n'.join(console_logs))

print(f"\\nCaptured {len(console_logs)} console messages")
print(f"Logs saved to: /mnt/user-data/outputs/console.log")
\`\`\`
`},{path:"skills/webapp-testing/skill.md",content:`---
name: webapp-testing
description: "Test local web apps with Playwright \u2014 verify UI, capture screenshots, debug browser behavior."
tags:
  - testing
  - playwright
  - web
  - automation
  - browser
---

# Web Application Testing

To test local web applications, write native Python Playwright scripts.

**Helper Scripts Available**:
- \`scripts/with_server.py\` - Manages server lifecycle (supports multiple servers)

**Always run scripts with \`--help\` first** to see usage. DO NOT read the source until you try running the script first and find that a customized solution is abslutely necessary. These scripts can be very large and thus pollute your context window. They exist to be called directly as black-box scripts rather than ingested into your context window.

## Decision Tree: Choosing Your Approach

\`\`\`
User task \u2192 Is it static HTML?
    \u251C\u2500 Yes \u2192 Read HTML file directly to identify selectors
    \u2502         \u251C\u2500 Success \u2192 Write Playwright script using selectors
    \u2502         \u2514\u2500 Fails/Incomplete \u2192 Treat as dynamic (below)
    \u2502
    \u2514\u2500 No (dynamic webapp) \u2192 Is the server already running?
        \u251C\u2500 No \u2192 Run: python scripts/with_server.py --help
        \u2502        Then use the helper + write simplified Playwright script
        \u2502
        \u2514\u2500 Yes \u2192 Reconnaissance-then-action:
            1. Navigate and wait for networkidle
            2. Take screenshot or inspect DOM
            3. Identify selectors from rendered state
            4. Execute actions with discovered selectors
\`\`\`

## Example: Using with_server.py

To start a server, run \`--help\` first, then use the helper:

**Single server:**
\`\`\`bash
python scripts/with_server.py --server "npm run dev" --port 5173 -- python your_automation.py
\`\`\`

**Multiple servers (e.g., backend + frontend):**
\`\`\`bash
python scripts/with_server.py \\
  --server "cd backend && python server.py" --port 3000 \\
  --server "cd frontend && npm run dev" --port 5173 \\
  -- python your_automation.py
\`\`\`

To create an automation script, include only Playwright logic (servers are managed automatically):
\`\`\`python
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True) # Always launch chromium in headless mode
    page = browser.new_page()
    page.goto('http://localhost:5173') # Server already running and ready
    page.wait_for_load_state('networkidle') # CRITICAL: Wait for JS to execute
    # ... your automation logic
    browser.close()
\`\`\`

## Reconnaissance-Then-Action Pattern

1. **Inspect rendered DOM**:
   \`\`\`python
   page.screenshot(path='/tmp/inspect.png', full_page=True)
   content = page.content()
   page.locator('button').all()
   \`\`\`

2. **Identify selectors** from inspection results

3. **Execute actions** using discovered selectors

## Common Pitfall

**Don't** inspect the DOM before waiting for \`networkidle\` on dynamic apps
**Do** wait for \`page.wait_for_load_state('networkidle')\` before inspection

## Best Practices

- **Use bundled scripts as black boxes** - To accomplish a task, consider whether one of the scripts available in \`scripts/\` can help. These scripts handle common, complex workflows reliably without cluttering the context window. Use \`--help\` to see usage, then invoke directly.
- Use \`sync_playwright()\` for synchronous scripts
- Always close the browser when done
- Use descriptive selectors: \`text=\`, \`role=\`, CSS selectors, or IDs
- Add appropriate waits: \`page.wait_for_selector()\` or \`page.wait_for_timeout()\`

## Reference Files

- **examples/** - Examples showing common patterns:
  - \`element_discovery.py\` - Discovering buttons, links, and inputs on a page
  - \`static_html_automation.py\` - Using file:// URLs for local HTML
  - \`console_logging.py\` - Capturing console logs during automation
`},{path:"skills/webapp-testing/tools.md",content:`# Scripts

## scripts/with_server.py

Start one or more servers, wait for them to be ready, run a command, then clean up.

### Usage

\`\`\`bash
# Single server
python scripts/with_server.py --server "npm run dev" --port 5173 -- python automation.py
python scripts/with_server.py --server "npm start" --port 3000 -- python test.py

# Multiple servers
python scripts/with_server.py \\
  --server "cd backend && python server.py" --port 3000 \\
  --server "cd frontend && npm run dev" --port 5173 \\
  -- python test.py
\`\`\`

### Arguments

| Argument | Description |
|----------|-------------|
| \`--server\` | Server command to run (can be repeated for multiple servers) |
| \`--port\` | Port for each server (must match \`--server\` count) |
| \`--timeout\` | Timeout in seconds per server (default: 30) |
| \`command\` | Command to run after all servers are ready (after \`--\` separator) |

### Behavior

1. Starts all servers as subprocesses (supports shell commands with \`cd\` and \`&&\`)
2. Polls each server's port until it accepts connections (or timeout)
3. Runs the specified command once all servers are ready
4. On completion or error, terminates all server processes (with 5s graceful timeout, then SIGKILL)

### Error Handling

- Exits with error if number of \`--server\` and \`--port\` arguments don't match
- Raises \`RuntimeError\` if a server fails to start within the timeout
- Always cleans up server processes in the \`finally\` block
- Exits with the return code of the executed command
`},{path:"skills/xlsx/skill.md",content:`---
name: xlsx
description: "Create, read, edit, and clean spreadsheet files (.xlsx, .csv, .tsv) \u2014 formulas, charts, formatting, data cleanup."
tags:
  - spreadsheet
  - excel
  - xlsx
  - data
  - finance
  - python
---

# Requirements for Outputs

## All Excel files

### Professional Font
- Use a consistent, professional font (e.g., Arial, Times New Roman) for all deliverables unless otherwise instructed by the user

### Zero Formula Errors
- Every Excel model MUST be delivered with ZERO formula errors (#REF!, #DIV/0!, #VALUE!, #N/A, #NAME?)

### Preserve Existing Templates (when updating templates)
- Study and EXACTLY match existing format, style, and conventions when modifying files
- Never impose standardized formatting on files with established patterns
- Existing template conventions ALWAYS override these guidelines

## Financial models

### Color Coding Standards
Unless otherwise stated by the user or existing template

#### Industry-Standard Color Conventions
- **Blue text (RGB: 0,0,255)**: Hardcoded inputs, and numbers users will change for scenarios
- **Black text (RGB: 0,0,0)**: ALL formulas and calculations
- **Green text (RGB: 0,128,0)**: Links pulling from other worksheets within same workbook
- **Red text (RGB: 255,0,0)**: External links to other files
- **Yellow background (RGB: 255,255,0)**: Key assumptions needing attention or cells that need to be updated

### Number Formatting Standards

#### Required Format Rules
- **Years**: Format as text strings (e.g., "2024" not "2,024")
- **Currency**: Use $#,##0 format; ALWAYS specify units in headers ("Revenue ($mm)")
- **Zeros**: Use number formatting to make all zeros "-", including percentages (e.g., "$#,##0;($#,##0);-")
- **Percentages**: Default to 0.0% format (one decimal)
- **Multiples**: Format as 0.0x for valuation multiples (EV/EBITDA, P/E)
- **Negative numbers**: Use parentheses (123) not minus -123

### Formula Construction Rules

#### Assumptions Placement
- Place ALL assumptions (growth rates, margins, multiples, etc.) in separate assumption cells
- Use cell references instead of hardcoded values in formulas
- Example: Use =B5*(1+$B$6) instead of =B5*1.05

#### Formula Error Prevention
- Verify all cell references are correct
- Check for off-by-one errors in ranges
- Ensure consistent formulas across all projection periods
- Test with edge cases (zero values, negative numbers)
- Verify no unintended circular references

#### Documentation Requirements for Hardcodes
- Comment or in cells beside (if end of table). Format: "Source: [System/Document], [Date], [Specific Reference], [URL if applicable]"
- Examples:
  - "Source: Company 10-K, FY2024, Page 45, Revenue Note, [SEC EDGAR URL]"
  - "Source: Company 10-Q, Q2 2025, Exhibit 99.1, [SEC EDGAR URL]"
  - "Source: Bloomberg Terminal, 8/15/2025, AAPL US Equity"
  - "Source: FactSet, 8/20/2025, Consensus Estimates Screen"

# XLSX creation, editing, and analysis

## Overview

A user may ask you to create, edit, or analyze the contents of an .xlsx file. You have different tools and workflows available for different tasks.

## Important Requirements

**LibreOffice Required for Formula Recalculation**: You can assume LibreOffice is installed for recalculating formula values using the \`scripts/recalc.py\` script. The script automatically configures LibreOffice on first run, including in sandboxed environments where Unix sockets are restricted (handled by \`scripts/office/soffice.py\`)

## Reading and analyzing data

### Data analysis with pandas
For data analysis, visualization, and basic operations, use **pandas** which provides powerful data manipulation capabilities:

\`\`\`python
import pandas as pd

# Read Excel
df = pd.read_excel('file.xlsx')  # Default: first sheet
all_sheets = pd.read_excel('file.xlsx', sheet_name=None)  # All sheets as dict

# Analyze
df.head()      # Preview data
df.info()      # Column info
df.describe()  # Statistics

# Write Excel
df.to_excel('output.xlsx', index=False)
\`\`\`

## Excel File Workflows

## CRITICAL: Use Formulas, Not Hardcoded Values

**Always use Excel formulas instead of calculating values in Python and hardcoding them.** This ensures the spreadsheet remains dynamic and updateable.

### WRONG - Hardcoding Calculated Values
\`\`\`python
# Bad: Calculating in Python and hardcoding result
total = df['Sales'].sum()
sheet['B10'] = total  # Hardcodes 5000

# Bad: Computing growth rate in Python
growth = (df.iloc[-1]['Revenue'] - df.iloc[0]['Revenue']) / df.iloc[0]['Revenue']
sheet['C5'] = growth  # Hardcodes 0.15

# Bad: Python calculation for average
avg = sum(values) / len(values)
sheet['D20'] = avg  # Hardcodes 42.5
\`\`\`

### CORRECT - Using Excel Formulas
\`\`\`python
# Good: Let Excel calculate the sum
sheet['B10'] = '=SUM(B2:B9)'

# Good: Growth rate as Excel formula
sheet['C5'] = '=(C4-C2)/C2'

# Good: Average using Excel function
sheet['D20'] = '=AVERAGE(D2:D19)'
\`\`\`

This applies to ALL calculations - totals, percentages, ratios, differences, etc. The spreadsheet should be able to recalculate when source data changes.

## Common Workflow
1. **Choose tool**: pandas for data, openpyxl for formulas/formatting
2. **Create/Load**: Create new workbook or load existing file
3. **Modify**: Add/edit data, formulas, and formatting
4. **Save**: Write to file
5. **Recalculate formulas (MANDATORY IF USING FORMULAS)**: Use the scripts/recalc.py script
   \`\`\`bash
   python scripts/recalc.py output.xlsx
   \`\`\`
6. **Verify and fix any errors**:
   - The script returns JSON with error details
   - If \`status\` is \`errors_found\`, check \`error_summary\` for specific error types and locations
   - Fix the identified errors and recalculate again
   - Common errors to fix:
     - \`#REF!\`: Invalid cell references
     - \`#DIV/0!\`: Division by zero
     - \`#VALUE!\`: Wrong data type in formula
     - \`#NAME?\`: Unrecognized formula name

### Creating new Excel files

\`\`\`python
# Using openpyxl for formulas and formatting
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment

wb = Workbook()
sheet = wb.active

# Add data
sheet['A1'] = 'Hello'
sheet['B1'] = 'World'
sheet.append(['Row', 'of', 'data'])

# Add formula
sheet['B2'] = '=SUM(A1:A10)'

# Formatting
sheet['A1'].font = Font(bold=True, color='FF0000')
sheet['A1'].fill = PatternFill('solid', start_color='FFFF00')
sheet['A1'].alignment = Alignment(horizontal='center')

# Column width
sheet.column_dimensions['A'].width = 20

wb.save('output.xlsx')
\`\`\`

### Editing existing Excel files

\`\`\`python
# Using openpyxl to preserve formulas and formatting
from openpyxl import load_workbook

# Load existing file
wb = load_workbook('existing.xlsx')
sheet = wb.active  # or wb['SheetName'] for specific sheet

# Working with multiple sheets
for sheet_name in wb.sheetnames:
    sheet = wb[sheet_name]
    print(f"Sheet: {sheet_name}")

# Modify cells
sheet['A1'] = 'New Value'
sheet.insert_rows(2)  # Insert row at position 2
sheet.delete_cols(3)  # Delete column 3

# Add new sheet
new_sheet = wb.create_sheet('NewSheet')
new_sheet['A1'] = 'Data'

wb.save('modified.xlsx')
\`\`\`

## Recalculating formulas

Excel files created or modified by openpyxl contain formulas as strings but not calculated values. Use the provided \`scripts/recalc.py\` script to recalculate formulas:

\`\`\`bash
python scripts/recalc.py <excel_file> [timeout_seconds]
\`\`\`

Example:
\`\`\`bash
python scripts/recalc.py output.xlsx 30
\`\`\`

The script:
- Automatically sets up LibreOffice macro on first run
- Recalculates all formulas in all sheets
- Scans ALL cells for Excel errors (#REF!, #DIV/0!, etc.)
- Returns JSON with detailed error locations and counts
- Works on both Linux and macOS

## Formula Verification Checklist

Quick checks to ensure formulas work correctly:

### Essential Verification
- [ ] **Test 2-3 sample references**: Verify they pull correct values before building full model
- [ ] **Column mapping**: Confirm Excel columns match (e.g., column 64 = BL, not BK)
- [ ] **Row offset**: Remember Excel rows are 1-indexed (DataFrame row 5 = Excel row 6)

### Common Pitfalls
- [ ] **NaN handling**: Check for null values with \`pd.notna()\`
- [ ] **Far-right columns**: FY data often in columns 50+
- [ ] **Multiple matches**: Search all occurrences, not just first
- [ ] **Division by zero**: Check denominators before using \`/\` in formulas (#DIV/0!)
- [ ] **Wrong references**: Verify all cell references point to intended cells (#REF!)
- [ ] **Cross-sheet references**: Use correct format (Sheet1!A1) for linking sheets

### Formula Testing Strategy
- [ ] **Start small**: Test formulas on 2-3 cells before applying broadly
- [ ] **Verify dependencies**: Check all cells referenced in formulas exist
- [ ] **Test edge cases**: Include zero, negative, and very large values

### Interpreting scripts/recalc.py Output
The script returns JSON with error details:
\`\`\`json
{
  "status": "success",           // or "errors_found"
  "total_errors": 0,              // Total error count
  "total_formulas": 42,           // Number of formulas in file
  "error_summary": {              // Only present if errors found
    "#REF!": {
      "count": 2,
      "locations": ["Sheet1!B5", "Sheet1!C10"]
    }
  }
}
\`\`\`

## Best Practices

### Library Selection
- **pandas**: Best for data analysis, bulk operations, and simple data export
- **openpyxl**: Best for complex formatting, formulas, and Excel-specific features

### Working with openpyxl
- Cell indices are 1-based (row=1, column=1 refers to cell A1)
- Use \`data_only=True\` to read calculated values: \`load_workbook('file.xlsx', data_only=True)\`
- **Warning**: If opened with \`data_only=True\` and saved, formulas are replaced with values and permanently lost
- For large files: Use \`read_only=True\` for reading or \`write_only=True\` for writing
- Formulas are preserved but not evaluated - use scripts/recalc.py to update values

### Working with pandas
- Specify data types to avoid inference issues: \`pd.read_excel('file.xlsx', dtype={'id': str})\`
- For large files, read specific columns: \`pd.read_excel('file.xlsx', usecols=['A', 'C', 'E'])\`
- Handle dates properly: \`pd.read_excel('file.xlsx', parse_dates=['date_column'])\`

## Code Style Guidelines
**IMPORTANT**: When generating Python code for Excel operations:
- Write minimal, concise Python code without unnecessary comments
- Avoid verbose variable names and redundant operations
- Avoid unnecessary print statements

**For Excel files themselves**:
- Add comments to cells with complex formulas or important assumptions
- Document data sources for hardcoded values
- Include notes for key calculations and model sections
`},{path:"skills/xlsx/tools.md",content:`# Scripts

## scripts/recalc.py

Excel Formula Recalculation Script. Recalculates all formulas in an Excel file using LibreOffice.

### Usage

\`\`\`bash
python scripts/recalc.py <excel_file> [timeout_seconds]
\`\`\`

### Arguments

| Argument | Description |
|----------|-------------|
| \`excel_file\` | Path to the Excel file to recalculate |
| \`timeout_seconds\` | Optional timeout in seconds (default: 30) |

### What It Does

1. **Sets up LibreOffice macro** on first run (creates \`RecalculateAndSave\` macro in LibreOffice's Standard module)
2. **Runs LibreOffice headless** with the recalculation macro
3. **Scans all cells** for Excel errors (#VALUE!, #DIV/0!, #REF!, #NAME?, #NULL!, #NUM!, #N/A)
4. **Counts formulas** in the workbook
5. **Returns JSON** with detailed results

### Output Format

\`\`\`json
{
  "status": "success",
  "total_errors": 0,
  "total_formulas": 42,
  "error_summary": {}
}
\`\`\`

When errors are found:
\`\`\`json
{
  "status": "errors_found",
  "total_errors": 2,
  "total_formulas": 42,
  "error_summary": {
    "#REF!": {
      "count": 2,
      "locations": ["Sheet1!B5", "Sheet1!C10"]
    }
  }
}
\`\`\`

### Platform Support

- **Linux**: Uses \`timeout\` command for process timeout
- **macOS**: Uses \`gtimeout\` (from GNU coreutils) if available
- Handles sandboxed environments where AF_UNIX sockets are blocked (via \`soffice.py\` shim)

---

## scripts/office/soffice.py

Helper for running LibreOffice in environments where AF_UNIX sockets may be blocked (e.g., sandboxed VMs).

### Usage

\`\`\`python
from office.soffice import run_soffice, get_soffice_env

# Option 1 - run soffice directly
result = run_soffice(["--headless", "--convert-to", "pdf", "input.docx"])

# Option 2 - get env dict for your own subprocess calls
env = get_soffice_env()
subprocess.run(["soffice", ...], env=env)
\`\`\`

### What It Does

- Sets \`SAL_USE_VCLPLUGIN=svp\` for headless operation
- Detects if AF_UNIX sockets are blocked at runtime
- If blocked, compiles and applies an LD_PRELOAD C shim that intercepts socket/listen/accept/close calls
- The shim uses socketpair() as a fallback when socket(AF_UNIX) fails

---

## scripts/office/pack.py

Pack a directory into a DOCX, PPTX, or XLSX file. Validates with auto-repair, condenses XML formatting, and creates the Office file.

### Usage

\`\`\`bash
python scripts/office/pack.py <input_directory> <output_file> [--original <file>] [--validate true|false]
\`\`\`

### Arguments

| Argument | Description |
|----------|-------------|
| \`input_directory\` | Unpacked Office document directory |
| \`output_file\` | Output Office file (.docx/.pptx/.xlsx) |
| \`--original\` | Original file for validation comparison |
| \`--validate\` | Run validation with auto-repair (default: true) |

### What It Does

1. Runs schema and redlining validators (if original file provided)
2. Auto-repairs common issues
3. Condenses XML formatting (removes whitespace-only text nodes and comments)
4. Creates ZIP archive as the output Office file

---

## scripts/office/unpack.py

Unpack Office files (DOCX, PPTX, XLSX) for editing. Extracts the ZIP archive and pretty-prints XML files.

### Usage

\`\`\`bash
python scripts/office/unpack.py <office_file> <output_dir> [options]
\`\`\`

### Arguments

| Argument | Description |
|----------|-------------|
| \`office_file\` | Office file to unpack |
| \`output_directory\` | Output directory for extracted content |
| \`--merge-runs\` | Merge adjacent runs with identical formatting (DOCX only, default: true) |
| \`--simplify-redlines\` | Merge adjacent tracked changes from same author (DOCX only, default: true) |

### What It Does

1. Extracts ZIP archive contents
2. Pretty-prints all XML and .rels files
3. For DOCX: optionally simplifies tracked changes and merges adjacent runs
4. Escapes smart quotes for safe XML handling

---

## scripts/office/validate.py

Validate Office document XML files against XSD schemas and tracked changes.

### Usage

\`\`\`bash
python scripts/office/validate.py <path> [--original <original_file>] [--auto-repair] [--author NAME]
\`\`\`

### Arguments

| Argument | Description |
|----------|-------------|
| \`path\` | Path to unpacked directory or packed Office file (.docx/.pptx/.xlsx) |
| \`--original\` | Path to original file (if omitted, all XSD errors are reported and redlining validation is skipped) |
| \`--auto-repair\` | Automatically repair common issues (hex IDs, whitespace preservation) |
| \`--author\` | Author name for redlining validation (default: Claude) |
| \`-v, --verbose\` | Enable verbose output |

### Auto-repair Fixes

- \`paraId\`/\`durableId\` values that exceed OOXML limits
- Missing \`xml:space="preserve"\` on \`w:t\` elements with whitespace
`}];var as=require("obsidian");function se(r){let t=r.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);if(!t)return{frontmatter:{},body:r.trim()};let e=t[1]??"",s=t[2]??"",a;try{a=(0,as.parseYaml)(e)??{}}catch(n){console.warn("Agent Fleet: malformed YAML frontmatter, treating as empty",n),a={}}return{frontmatter:a,body:s.trim()}}function ee(r,t){let e=(0,as.stringifyYaml)(r).trim(),s=t.trim();return`---
${e}
---

${s}
`}function ve(r){return r.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"")}function kt(r,t){return r.length<=t?r:`${r.slice(0,t-1)}\u2026`}function ns(r){return typeof r=="object"&&r!==null}function L(r){return typeof r=="string"?r:void 0}function He(r,t){return typeof r=="boolean"?r:t}function Je(r,t){return typeof r=="number"&&Number.isFinite(r)?r:t}function pe(r){return Array.isArray(r)?r.filter(t=>typeof t=="string"):[]}function ba(r){let t=0;for(let e=0;e<r.length;e++){let s=r.charCodeAt(e);t=(t<<5)-t+s|0}return t.toString(36)}var Mt=class{constructor(t,e){this.vault=t;this.settings=e}agents=new Map;skills=new Map;tasks=new Map;channels=new Map;validationIssues=new Map;channelCredentialGetter;setChannelCredentialGetter(t){this.channelCredentialGetter=t}getVaultBasePath(){let t=this.vault.adapter;return t instanceof S.FileSystemAdapter?t.getBasePath():void 0}getFleetRoot(){return(0,S.normalizePath)(this.settings.fleetFolder)}getSubfolder(t){return(0,S.normalizePath)(`${this.getFleetRoot()}/${t}`)}async ensureFleetStructure(){let t=this.getFleetRoot(),e=!this.vault.getAbstractFileByPath(t);await this.ensureFolder(t);for(let s of va)await this.ensureFolder(this.getSubfolder(s));return e}async ensureSamples(){let t=this.getFleetRoot();for(let e of Us){let s=(0,S.normalizePath)(`${t}/${e.path}`),a=s.substring(0,s.lastIndexOf("/"));await this.ensureFolder(a),await this.createFileIfMissing(s,e.content)}}async updateDefaults(t){let e=this.getFleetRoot(),s={...t};for(let a of Us){let n=(0,S.normalizePath)(`${e}/${a.path}`),i=ba(a.content),o=t[a.path];if(o===i)continue;let l=this.vault.getAbstractFileByPath(n);if(!(l instanceof S.TFile)){let u=n.substring(0,n.lastIndexOf("/"));await this.ensureFolder(u),await this.createFileIfMissing(n,a.content),s[a.path]=i;continue}let c=await this.vault.cachedRead(l),d=ba(c);(!o||d===o)&&(await this.vault.modify(l,a.content),s[a.path]=i)}return s}async loadAll(){this.agents.clear(),this.skills.clear(),this.tasks.clear(),this.channels.clear(),this.validationIssues.clear(),await this.loadFolderAgents(),await this.loadFolderSkills();let t=this.vault.getMarkdownFiles().filter(e=>e.path.startsWith(`${this.getFleetRoot()}/`));for(let e of t)await this.loadFile(e);return this.validateReferences(),this.getSnapshot()}async loadFile(t){let e=typeof t=="string"?this.vault.getAbstractFileByPath(t):t;if(!(e instanceof S.TFile)||e.extension!=="md")return;if(this.isInsideAgentFolder(e.path)){await this.reloadFolderAgentContaining(e.path);return}if(this.isInsideSkillFolder(e.path)){await this.reloadFolderSkillContaining(e.path);return}this.clearStoredFile(e.path);let s=`${this.getSubfolder("channels")}/`;if(e.path.startsWith(s)){if(!e.path.slice(s.length).includes("/")){let o=await this.vault.cachedRead(e),l=this.parseChannelFile(e.path,o);l&&this.channels.set(e.path,l)}return}let a=await this.vault.cachedRead(e),n=this.parseFile(e.path,a);n&&("taskId"in n?this.tasks.set(e.path,n):"model"in n?this.agents.set(e.path,n):this.skills.set(e.path,n))}async reloadFolderAgentContaining(t){let e=`${this.getSubfolder("agents")}/`,a=t.slice(e.length).split("/")[0];if(!a)return;let n=(0,S.normalizePath)(`${e}${a}`),i=(0,S.normalizePath)(`${n}/agent.md`);if(this.agents.delete(i),!(this.vault.getAbstractFileByPath(n)instanceof S.TFolder))return;let l=this.vault.getAbstractFileByPath(i);if(!(l instanceof S.TFile))return;let c=await this.loadFolderAgent(n,l);c&&this.agents.set(i,c)}isInsideAgentFolder(t){let e=`${this.getSubfolder("agents")}/`;return t.startsWith(e)?t.slice(e.length).includes("/"):!1}isInsideSkillFolder(t){let e=`${this.getSubfolder("skills")}/`;return t.startsWith(e)?t.slice(e.length).includes("/"):!1}async reloadFolderSkillContaining(t){let e=`${this.getSubfolder("skills")}/`,a=t.slice(e.length).split("/")[0];if(!a)return;let n=(0,S.normalizePath)(`${e}${a}`),i=(0,S.normalizePath)(`${n}/skill.md`);if(this.skills.delete(i),!(this.vault.getAbstractFileByPath(n)instanceof S.TFolder))return;let l=this.vault.getAbstractFileByPath(i);if(!(l instanceof S.TFile))return;let c=await this.loadFolderSkill(n,l);c&&this.skills.set(i,c)}async loadFolderSkills(){let t=this.vault.getAbstractFileByPath(this.getSubfolder("skills"));if(t instanceof S.TFolder)for(let e of t.children){if(!(e instanceof S.TFolder))continue;let s=(0,S.normalizePath)(`${e.path}/skill.md`),a=this.vault.getAbstractFileByPath(s);if(!(a instanceof S.TFile))continue;let n=await this.loadFolderSkill(e.path,a);n&&this.skills.set(s,n)}}async loadFolderSkill(t,e){let s=await this.vault.cachedRead(e),{frontmatter:a,body:n}=se(s),i=L(a.name);if(!i)return this.setIssue(e.path,"Folder skill skill.md requires string field `name`."),null;let o=async l=>{let c=(0,S.normalizePath)(`${t}/${l}`),d=this.vault.getAbstractFileByPath(c);if(!(d instanceof S.TFile))return"";let u=await this.vault.cachedRead(d);return se(u).body};return{filePath:e.path,name:i,description:L(a.description),tags:pe(a.tags),body:n,toolsBody:await o("tools.md"),referencesBody:await o("references.md"),examplesBody:await o("examples.md"),isFolder:!0}}async loadFolderAgents(){let t=this.vault.getAbstractFileByPath(this.getSubfolder("agents"));if(t instanceof S.TFolder)for(let e of t.children){if(!(e instanceof S.TFolder))continue;let s=(0,S.normalizePath)(`${e.path}/agent.md`),a=this.vault.getAbstractFileByPath(s);if(!(a instanceof S.TFile))continue;let n=await this.loadFolderAgent(e.path,a);n&&this.agents.set(s,n)}}async loadFolderAgent(t,e){let s=await this.vault.cachedRead(e),{frontmatter:a,body:n}=se(s),i=L(a.name);if(!i)return this.setIssue(e.path,"Folder agent agent.md requires string field `name`."),null;let o={},l=(0,S.normalizePath)(`${t}/config.md`),c=this.vault.getAbstractFileByPath(l);if(c instanceof S.TFile){let U=await this.vault.cachedRead(c);o=se(U).frontmatter}let d={allow:[],deny:[]},u=(0,S.normalizePath)(`${t}/permissions.json`),h=this.vault.getAbstractFileByPath(u);if(h instanceof S.TFile)try{let U=await this.vault.cachedRead(h),D=JSON.parse(U);d={allow:pe(D.allow),deny:pe(D.deny)}}catch{}let m="",f=(0,S.normalizePath)(`${t}/SKILLS.md`),p=this.vault.getAbstractFileByPath(f);if(p instanceof S.TFile){let U=await this.vault.cachedRead(p);m=se(U).body}let v="",k=(0,S.normalizePath)(`${t}/CONTEXT.md`),w=this.vault.getAbstractFileByPath(k);if(w instanceof S.TFile){let U=await this.vault.cachedRead(w);v=se(U).body}let g=!1,y="",x="",T=!0,C="",A=(0,S.normalizePath)(`${t}/HEARTBEAT.md`),E=this.vault.getAbstractFileByPath(A);if(E instanceof S.TFile){let U=await this.vault.cachedRead(E),D=se(U);g=He(D.frontmatter.enabled,!1),y=L(D.frontmatter.schedule)??"",T=He(D.frontmatter.notify,!0),C=L(D.frontmatter.channel)??"",x=D.body}let R=L(a.model)??L(o.model)??this.settings.defaultModel;return{filePath:e.path,name:i,description:L(a.description),model:R,adapter:L(o.adapter)??"claude-code",permissionMode:L(o.permission_mode)??"bypassPermissions",maxRetries:Je(o.max_retries,1),skills:pe(a.skills),mcpServers:pe(a.mcp_servers),allowedTools:pe(o.allowed_tools),blockedTools:pe(o.blocked_tools),cwd:L(o.cwd)||L(a.cwd),enabled:He(a.enabled,!0),timeout:Je(o.timeout,Je(a.timeout,300)),approvalRequired:pe(o.approval_required),memory:He(o.memory,He(a.memory,!1)),memoryMaxEntries:Je(o.memory_max_entries,100),tags:pe(a.tags),avatar:L(a.avatar)??"",body:n,contextBody:v,skillsBody:m,env:this.parseEnvMap(o.env),permissionRules:d,isFolder:!0,heartbeatEnabled:g,heartbeatSchedule:y,heartbeatBody:x,heartbeatNotify:T,heartbeatChannel:C}}removeFile(t){this.clearStoredFile(t)}getSnapshot(){return{agents:Array.from(this.agents.values()).sort((t,e)=>t.name.localeCompare(e.name)),skills:Array.from(this.skills.values()).sort((t,e)=>t.name.localeCompare(e.name)),tasks:Array.from(this.tasks.values()).sort((t,e)=>t.taskId.localeCompare(e.taskId)),channels:Array.from(this.channels.values()).sort((t,e)=>t.name.localeCompare(e.name)),validationIssues:Array.from(this.validationIssues.values()).flat()}}getAgentByName(t){return Array.from(this.agents.values()).find(e=>e.name===t)}getSkillByName(t){return Array.from(this.skills.values()).find(e=>e.name===t)}getTaskById(t){return Array.from(this.tasks.values()).find(e=>e.taskId===t)}getTasksForAgent(t){return Array.from(this.tasks.values()).filter(e=>e.agent===t)}getChannelByName(t){return Array.from(this.channels.values()).find(e=>e.name===t)}getChannelsForAgent(t){return Array.from(this.channels.values()).filter(e=>e.defaultAgent===t)}getRunsRoot(){return this.getSubfolder("runs")}getMemoryPath(t){return(0,S.normalizePath)(`${this.getSubfolder("memory")}/${ve(t)}.md`)}async getMemory(t){let e=this.getMemoryPath(t),s=this.vault.getAbstractFileByPath(e);if(!(s instanceof S.TFile))return null;let a=await this.vault.cachedRead(s),{frontmatter:n,body:i}=se(a);return{filePath:e,agent:L(n.agent)??t,lastUpdated:L(n.last_updated),body:i}}async appendMemory(t,e){if(e.length===0)return;let s=this.getMemoryPath(t),a=this.vault.getAbstractFileByPath(s),n=new Date().toISOString(),i=e.map(o=>`- ${o.trim()}`).join(`
`);if(a instanceof S.TFile){let l=`${(await this.getMemory(t))?.body.trim()||"## Learned Context"}

${i}`.trim();await this.vault.modify(a,ee({agent:t,last_updated:n},l));return}await this.createFileIfMissing(s,ee({agent:t,last_updated:n},`## Learned Context

${i}`))}async listRecentRuns(t=50){let e=this.vault.getAbstractFileByPath(this.getRunsRoot());if(!(e instanceof S.TFolder))return[];let s=[];this.collectMarkdownChildren(e,s),s.sort((i,o)=>o.path.localeCompare(i.path));let a=s.slice(0,t),n=[];for(let i of a){let o=await this.readRunLog(i);o&&n.push(o)}return n.sort((i,o)=>o.started.localeCompare(i.started))}async readRunLog(t){let e=await this.vault.cachedRead(t),{frontmatter:s,body:a}=se(e),n=a.match(/## Prompt\n([\s\S]*?)(?:\n## Output\n|$)/),i=a.match(/## Output\n([\s\S]*?)(?:\n## Tools Used\n|$)/),o=a.match(/## Tools Used\n([\s\S]*?)(?:\n## STDERR\n|$)/);return{filePath:t.path,runId:L(s.run_id)??t.basename,agent:L(s.agent)??"unknown",task:L(s.task)??"unknown",status:L(s.status)??"failure",started:L(s.started)??new Date(t.stat.ctime).toISOString(),completed:L(s.completed),durationSeconds:Je(s.duration_seconds,0),tokensUsed:typeof s.tokens_used=="number"?s.tokens_used:void 0,costUsd:typeof s.cost_usd=="number"?s.cost_usd:void 0,model:L(s.model)??Ge.defaultModel,exitCode:typeof s.exit_code=="number"?s.exit_code:null,tags:pe(s.tags),prompt:n?.[1]?.trim()??"",output:i?.[1]?.trim()??"",toolsUsed:o?.[1]?.split(`
`).map(l=>l.replace(/^- /,"").trim()).filter(Boolean)??[],approvals:this.parseApprovals(s.approvals)}}async writeRunLog(t){let e=new Date(t.started),s=(0,S.normalizePath)(`${this.getRunsRoot()}/${e.toISOString().slice(0,10)}`);await this.ensureFolder(s);let a=`${e.toISOString().slice(11,19).replace(/:/g,"")}-${ve(t.agent)}-${ve(t.task)}.md`,n=(0,S.normalizePath)(`${s}/${a}`),i=ee({run_id:t.runId,agent:t.agent,task:t.task,status:t.status,started:t.started,completed:t.completed,duration_seconds:t.durationSeconds,tokens_used:t.tokensUsed,cost_usd:t.costUsd,model:t.model,exit_code:t.exitCode,tags:t.tags,approvals:t.approvals},["## Prompt","",t.prompt.trim(),"","## Output","",t.output.trim()||"(no output)","","## Tools Used","",...t.toolsUsed.length>0?t.toolsUsed.map(l=>`- ${l}`):["- none"],...t.stderr?["","## STDERR","",t.stderr.trim()]:[]].join(`
`)),o=this.vault.getAbstractFileByPath(n);return o instanceof S.TFile?await this.vault.modify(o,i):await this.vault.create(n,i),n}async updateTaskRunMetadata(t,e){let s=this.vault.getAbstractFileByPath(t.filePath);if(!(s instanceof S.TFile))return;let a=await this.vault.cachedRead(s),{frontmatter:n,body:i}=se(a),o={...n,last_run:e.lastRun??t.lastRun,next_run:e.nextRun??t.nextRun,run_count:e.runCount??t.runCount};await this.vault.modify(s,ee(o,i)),await this.loadFile(s)}async setApprovalDecision(t,e,s){let a=this.vault.getAbstractFileByPath(t);if(!(a instanceof S.TFile))return;let n=await this.vault.cachedRead(a),{frontmatter:i,body:o}=se(n),l=(this.parseApprovals(i.approvals)??[]).map(c=>c.tool===e?{...c,status:s,resolvedAt:new Date().toISOString()}:c);await this.vault.modify(a,ee({...i,approvals:l},o))}async createAgentTemplate(t){let e=await this.getAvailablePath(this.getSubfolder("agents"),ve(t)),s=`---
name: ${ve(t)}
description: 
enabled: true
skills: []
tags: []
---

Agent instructions go here.
`;return await this.vault.create(e,s)}async createAgentFolder(t){let e=ve(t.name),s=(0,S.normalizePath)(`${this.getSubfolder("agents")}/${e}`);await this.ensureFolder(s);let a={name:t.name,description:t.description||void 0,avatar:t.avatar||void 0,enabled:t.enabled??!0,tags:t.tags,skills:t.skills,mcp_servers:t.mcpServers?.length?t.mcpServers:void 0};t.model&&t.model!=="default"&&(a.model=t.model);let n=(0,S.normalizePath)(`${s}/agent.md`);await this.vault.create(n,ee(a,t.systemPrompt||""));let i={model:t.model||"default",adapter:t.adapter||"claude-code",timeout:t.timeout,max_retries:1,cwd:t.cwd||"",permission_mode:t.permissionMode||"bypassPermissions",approval_required:t.approvalRequired,allowed_tools:[],blocked_tools:[],memory:t.memory,memory_max_entries:t.memoryMaxEntries},o=(0,S.normalizePath)(`${s}/config.md`);await this.vault.create(o,ee(i,""));let l=(0,S.normalizePath)(`${s}/SKILLS.md`);await this.vault.create(l,ee({},t.skillsBody||""));let c=(0,S.normalizePath)(`${s}/CONTEXT.md`);await this.vault.create(c,ee({},t.contextBody||""));let d=t.permissionRules;if(d&&(d.allow.length>0||d.deny.length>0)){let u=(0,S.normalizePath)(`${s}/permissions.json`);await this.vault.create(u,JSON.stringify(d,null,2)+`
`)}return n}async createSkillTemplate(t){let e=await this.getAvailablePath(this.getSubfolder("skills"),ve(t)),s=`---
name: ${ve(t)}
description: 
tags: []
---

Skill instructions go here.
`;return await this.vault.create(e,s)}async createSkillFolder(t){let e=(0,S.normalizePath)(`${this.getSubfolder("skills")}/${ve(t.name)}`);await this.ensureFolder(e);let s={name:t.name,description:t.description||void 0,tags:t.tags.length>0?t.tags:void 0},a=(0,S.normalizePath)(`${e}/skill.md`);if(await this.createFileIfMissing(a,ee(s,t.body||"Skill instructions go here.")),t.toolsBody){let n=(0,S.normalizePath)(`${e}/tools.md`);await this.createFileIfMissing(n,`# Tools

${t.toolsBody}`)}if(t.referencesBody){let n=(0,S.normalizePath)(`${e}/references.md`);await this.createFileIfMissing(n,`# References

${t.referencesBody}`)}if(t.examplesBody){let n=(0,S.normalizePath)(`${e}/examples.md`);await this.createFileIfMissing(n,`# Examples

${t.examplesBody}`)}}async updateAgent(t,e){let s=this.getAgentByName(t);if(s)if(s.isFolder){let a=(0,S.normalizePath)(s.filePath.replace(/\/agent\.md$/,"")),n=this.vault.getAbstractFileByPath(s.filePath);if(n instanceof S.TFile){let l=await this.vault.cachedRead(n),{frontmatter:c,body:d}=se(l);e.description!==void 0&&(c.description=e.description||void 0),e.avatar!==void 0&&(c.avatar=e.avatar||void 0),e.tags!==void 0&&(c.tags=e.tags),e.skills!==void 0&&(c.skills=e.skills),e.mcpServers!==void 0&&(c.mcp_servers=e.mcpServers.length>0?e.mcpServers:void 0),e.enabled!==void 0&&(c.enabled=e.enabled),e.model!==void 0&&e.model!=="default"&&(c.model=e.model);let u=e.systemPrompt!==void 0?e.systemPrompt:d;await this.vault.modify(n,ee(c,u))}let i=(0,S.normalizePath)(`${a}/config.md`),o=this.vault.getAbstractFileByPath(i);if(o instanceof S.TFile){let l=await this.vault.cachedRead(o),{frontmatter:c,body:d}=se(l);e.model!==void 0&&(c.model=e.model),e.adapter!==void 0&&(c.adapter=e.adapter),e.timeout!==void 0&&(c.timeout=e.timeout),e.cwd!==void 0&&(c.cwd=e.cwd),e.permissionMode!==void 0&&(c.permission_mode=e.permissionMode),e.approvalRequired!==void 0&&(c.approval_required=e.approvalRequired),e.memory!==void 0&&(c.memory=e.memory),await this.vault.modify(o,ee(c,d))}if(e.skillsBody!==void 0){let l=(0,S.normalizePath)(`${a}/SKILLS.md`),c=this.vault.getAbstractFileByPath(l);c instanceof S.TFile?await this.vault.modify(c,ee({},e.skillsBody)):await this.vault.create(l,ee({},e.skillsBody))}if(e.contextBody!==void 0){let l=(0,S.normalizePath)(`${a}/CONTEXT.md`),c=this.vault.getAbstractFileByPath(l);c instanceof S.TFile?await this.vault.modify(c,ee({},e.contextBody)):await this.vault.create(l,ee({},e.contextBody))}if(e.permissionRules!==void 0){let l=(0,S.normalizePath)(`${a}/permissions.json`),c=this.vault.getAbstractFileByPath(l),d=e.permissionRules;if(d.allow.length>0||d.deny.length>0){let u=JSON.stringify(d,null,2)+`
`;c instanceof S.TFile?await this.vault.modify(c,u):await this.vault.create(l,u)}else c instanceof S.TFile&&await this.vault.trash(c,!0)}}else{let a=this.vault.getAbstractFileByPath(s.filePath);if(!(a instanceof S.TFile))return;let n=await this.vault.cachedRead(a),{frontmatter:i,body:o}=se(n);e.description!==void 0&&(i.description=e.description||void 0),e.avatar!==void 0&&(i.avatar=e.avatar||void 0),e.tags!==void 0&&(i.tags=e.tags),e.skills!==void 0&&(i.skills=e.skills),e.mcpServers!==void 0&&(i.mcp_servers=e.mcpServers.length>0?e.mcpServers:void 0),e.enabled!==void 0&&(i.enabled=e.enabled),e.model!==void 0&&(i.model=e.model),e.adapter!==void 0&&(i.adapter=e.adapter),e.timeout!==void 0&&(i.timeout=e.timeout),e.cwd!==void 0&&(i.cwd=e.cwd),e.permissionMode!==void 0&&(i.permission_mode=e.permissionMode),e.approvalRequired!==void 0&&(i.approval_required=e.approvalRequired),e.memory!==void 0&&(i.memory=e.memory);let l=e.systemPrompt!==void 0?e.systemPrompt:o;await this.vault.modify(a,ee(i,l))}}async updateTask(t,e){let s=this.getTaskById(t);if(!s)return;let a=this.vault.getAbstractFileByPath(s.filePath);if(!(a instanceof S.TFile))return;let n=await this.vault.cachedRead(a),{frontmatter:i,body:o}=se(n);e.agent!==void 0&&(i.agent=e.agent),e.type!==void 0&&(i.type=e.type),e.schedule!==void 0&&(i.schedule=e.schedule||void 0),e.runAt!==void 0&&(i.run_at=e.runAt||void 0),e.enabled!==void 0&&(i.enabled=e.enabled),e.priority!==void 0&&(i.priority=e.priority),e.catch_up!==void 0&&(i.catch_up=e.catch_up),e.tags!==void 0&&(i.tags=e.tags);let l=e.body!==void 0?e.body:o;await this.vault.modify(a,ee(i,l))}async updateSkill(t,e){let s=this.getSkillByName(t);if(s)if(s.isFolder){let a=(0,S.normalizePath)(s.filePath.replace(/\/skill\.md$/,"")),n=this.vault.getAbstractFileByPath(s.filePath);if(n instanceof S.TFile){let i=await this.vault.cachedRead(n),{frontmatter:o,body:l}=se(i);e.description!==void 0&&(o.description=e.description||void 0),e.tags!==void 0&&(o.tags=e.tags.length>0?e.tags:void 0);let c=e.body!==void 0?e.body:l;await this.vault.modify(n,ee(o,c))}if(e.toolsBody!==void 0){let i=(0,S.normalizePath)(`${a}/tools.md`),o=this.vault.getAbstractFileByPath(i);e.toolsBody&&(o instanceof S.TFile?await this.vault.modify(o,`# Tools

${e.toolsBody}`):await this.vault.create(i,`# Tools

${e.toolsBody}`))}if(e.referencesBody!==void 0){let i=(0,S.normalizePath)(`${a}/references.md`),o=this.vault.getAbstractFileByPath(i);e.referencesBody&&(o instanceof S.TFile?await this.vault.modify(o,`# References

${e.referencesBody}`):await this.vault.create(i,`# References

${e.referencesBody}`))}if(e.examplesBody!==void 0){let i=(0,S.normalizePath)(`${a}/examples.md`),o=this.vault.getAbstractFileByPath(i);e.examplesBody&&(o instanceof S.TFile?await this.vault.modify(o,`# Examples

${e.examplesBody}`):await this.vault.create(i,`# Examples

${e.examplesBody}`))}}else{let a=this.vault.getAbstractFileByPath(s.filePath);if(!(a instanceof S.TFile))return;let n=await this.vault.cachedRead(a),{frontmatter:i,body:o}=se(n);e.description!==void 0&&(i.description=e.description||void 0),e.tags!==void 0&&(i.tags=e.tags.length>0?e.tags:void 0);let l=e.body!==void 0?e.body:o;await this.vault.modify(a,ee(i,l))}}async deleteSkill(t){let e=this.getSkillByName(t);if(e)if(e.isFolder){let s=(0,S.normalizePath)(e.filePath.replace(/\/skill\.md$/,"")),a=this.vault.getAbstractFileByPath(s);a instanceof S.TFolder&&await this.vault.trash(a,!0)}else await this.trashFile(e.filePath)}async deleteTask(t){let e=this.getTaskById(t);e&&await this.trashFile(e.filePath)}async updateChannel(t,e){let s=this.getChannelByName(t);if(!s)return;let a=this.vault.getAbstractFileByPath(s.filePath);if(!(a instanceof S.TFile))return;let n=await this.vault.cachedRead(a),{frontmatter:i,body:o}=se(n);e.default_agent!==void 0&&(i.default_agent=e.default_agent,delete i.agent),e.allowed_agents!==void 0&&(i.allowed_agents=e.allowed_agents),e.enabled!==void 0&&(i.enabled=e.enabled),e.credential_ref!==void 0&&(i.credential_ref=e.credential_ref),e.allowed_users!==void 0&&(i.allowed_users=e.allowed_users),e.per_user_sessions!==void 0&&(i.per_user_sessions=e.per_user_sessions),e.channel_context!==void 0&&(i.channel_context=e.channel_context||void 0),e.tags!==void 0&&(i.tags=e.tags),e.type!==void 0&&(i.type=e.type),e.transport!==void 0&&(i.transport=e.transport);let l=e.body!==void 0?e.body:o;await this.vault.modify(a,ee(i,l))}async deleteChannel(t){let e=this.getChannelByName(t);if(!e)return;await this.trashFile(e.filePath);let s=(0,S.normalizePath)(`${this.getSubfolder("channels")}/${ve(t)}/sessions`),a=this.vault.getAbstractFileByPath(s);a instanceof S.TFolder&&await this.vault.trash(a,!0)}async updateHeartbeat(t,e){let s=this.getAgentByName(t);if(!s||!s.isFolder)return;let a=(0,S.normalizePath)(s.filePath.replace(/\/agent\.md$/,"")),n=(0,S.normalizePath)(`${a}/HEARTBEAT.md`),i=this.vault.getAbstractFileByPath(n);if(i instanceof S.TFile){let o=await this.vault.cachedRead(i),{frontmatter:l,body:c}=se(o);e.enabled!==void 0&&(l.enabled=e.enabled),e.schedule!==void 0&&(l.schedule=e.schedule||void 0),e.notify!==void 0&&(l.notify=e.notify),e.channel!==void 0&&(l.channel=e.channel||void 0);let d=e.body!==void 0?e.body:c;await this.vault.modify(i,ee(l,d))}else{let o={enabled:e.enabled??!1};e.schedule&&(o.schedule=e.schedule),e.notify!==void 0&&(o.notify=e.notify),e.channel&&(o.channel=e.channel);let l=e.body??"";await this.vault.create(n,ee(o,l))}}async deleteAgent(t,e){let s=[],a=this.getAgentByName(t);if(!a)return{trashedFiles:s};if(a.isFolder){let i=(0,S.normalizePath)(a.filePath.replace(/\/agent\.md$/,"")),o=this.vault.getAbstractFileByPath(i);if(o instanceof S.TFolder){let l=[];this.collectMarkdownChildren(o,l);for(let c of l)s.push(c.path);await this.vault.trash(o,!0)}}else await this.trashFile(a.filePath),s.push(a.filePath);let n=this.getMemoryPath(t);if(this.vault.getAbstractFileByPath(n)&&(await this.trashFile(n),s.push(n)),e){let i=this.getTasksForAgent(t);for(let o of i)await this.trashFile(o.filePath),s.push(o.filePath)}return{trashedFiles:s}}async trashFile(t){let e=this.vault.getAbstractFileByPath(t);e&&await this.vault.trash(e,!0)}async ensureFolder(t){if(!this.vault.getAbstractFileByPath(t))try{await this.vault.createFolder(t)}catch(e){if(!(e instanceof Error?e.message:String(e)).includes("Folder already exists"))throw e}}async getAvailablePath(t,e){let s=0;for(;;){let a=s===0?"":`-${s+1}`,n=(0,S.normalizePath)(`${t}/${e}${a}.md`);if(!this.vault.getAbstractFileByPath(n))return n;s+=1}}async createFileIfMissing(t,e){if(!this.vault.getAbstractFileByPath(t))try{await this.vault.create(t,e)}catch(s){if(!(s instanceof Error?s.message:String(s)).includes("File already exists"))throw s}}collectMarkdownChildren(t,e){for(let s of t.children)s instanceof S.TFile&&s.extension==="md"&&e.push(s),s instanceof S.TFolder&&this.collectMarkdownChildren(s,e)}clearStoredFile(t){this.agents.delete(t),this.skills.delete(t),this.tasks.delete(t),this.channels.delete(t),this.validationIssues.delete(t)}setIssue(t,e){let s=this.validationIssues.get(t)??[];s.push({path:t,message:e}),this.validationIssues.set(t,s)}parseFile(t,e){return t.startsWith(`${this.getSubfolder("agents")}/`)?this.parseAgent(t,e):t.startsWith(`${this.getSubfolder("skills")}/`)?this.parseSkill(t,e):t.startsWith(`${this.getSubfolder("tasks")}/`)?this.parseTask(t,e):null}parseAgent(t,e){let{frontmatter:s,body:a}=se(e);if(!ns(s))return this.setIssue(t,"Invalid frontmatter."),null;let n=L(s.name),i=L(s.model)??this.settings.defaultModel;return!n||!i?(this.setIssue(t,"Agent requires string field `name` and a valid model or default model setting."),null):{filePath:t,name:n,description:L(s.description),model:i,adapter:L(s.adapter)??"claude-code",permissionMode:L(s.permission_mode)??"bypassPermissions",maxRetries:Je(s.max_retries,1),skills:pe(s.skills),mcpServers:pe(s.mcp_servers),allowedTools:pe(s.allowed_tools),blockedTools:pe(s.blocked_tools),cwd:L(s.cwd),enabled:He(s.enabled,!0),timeout:Je(s.timeout,300),approvalRequired:pe(s.approval_required),memory:He(s.memory,!1),memoryMaxEntries:Je(s.memory_max_entries,100),tags:pe(s.tags),avatar:L(s.avatar)??"",body:a,contextBody:"",skillsBody:"",env:this.parseEnvMap(s.env),permissionRules:{allow:[],deny:[]},isFolder:!1,heartbeatEnabled:!1,heartbeatSchedule:"",heartbeatBody:"",heartbeatNotify:!0,heartbeatChannel:""}}parseSkill(t,e){let{frontmatter:s,body:a}=se(e),n=L(s.name);return n?{filePath:t,name:n,description:L(s.description),tags:pe(s.tags),body:a,toolsBody:"",referencesBody:"",examplesBody:"",isFolder:!1}:(this.setIssue(t,"Skill requires string field `name`."),null)}parseTask(t,e){let{frontmatter:s,body:a}=se(e),n=L(s.task_id),i=L(s.agent),o=L(s.type);if(!n||!i||!o)return this.setIssue(t,"Task requires `task_id`, `agent`, and `type`."),null;if(o==="recurring"&&!L(s.schedule))return this.setIssue(t,"Recurring task requires `schedule`."),null;if(o==="once"&&!L(s.run_at))return this.setIssue(t,"One-time task requires `run_at`."),null;let l=L(s.priority),d=l&&["low","medium","high","critical"].includes(l)?l:"medium";return{filePath:t,taskId:n,agent:i,schedule:L(s.schedule),runAt:L(s.run_at),type:o,priority:d,enabled:He(s.enabled,!0),created:L(s.created)??new Date().toISOString(),lastRun:L(s.last_run),nextRun:L(s.next_run),runCount:Je(s.run_count,0),catchUp:He(s.catch_up,this.settings.catchUpMissedTasks),tags:pe(s.tags),body:a}}parseChannelFile(t,e){let{frontmatter:s,body:a}=se(e),n=L(s.name);if(!n)return this.setIssue(t,"Channel requires string field `name`."),null;let i=L(s.type),o=["slack","telegram"];if(!i||!o.includes(i))return this.setIssue(t,`Channel \`${n}\` requires \`type\` to be one of: ${o.join(", ")}.`),null;let l=i,c=L(s.default_agent)??L(s.agent);if(!c)return this.setIssue(t,`Channel \`${n}\` requires \`default_agent\` (or \`agent\`).`),null;let d=pe(s.allowed_agents),u=L(s.credential_ref);if(!u)return this.setIssue(t,`Channel \`${n}\` requires \`credential_ref\` pointing at a configured credential.`),null;let h=ns(s.transport)?s.transport:{};return{filePath:t,name:n,type:l,defaultAgent:c,allowedAgents:d,enabled:He(s.enabled,!0),credentialRef:u,allowedUsers:pe(s.allowed_users),perUserSessions:He(s.per_user_sessions,!0),channelContext:L(s.channel_context)??"",transport:h,tags:pe(s.tags),body:a}}validateReferences(){let t=new Set;for(let i of this.skills.values())t.has(i.name)&&this.setIssue(i.filePath,`Duplicate skill name \`${i.name}\`.`),t.add(i.name);let e=new Set;for(let i of this.agents.values()){e.has(i.name)&&this.setIssue(i.filePath,`Duplicate agent name \`${i.name}\`.`),e.add(i.name);for(let o of i.skills)t.has(o)||this.setIssue(i.filePath,`Agent references missing skill \`${o}\`.`)}for(let i of this.tasks.values())e.has(i.agent)||this.setIssue(i.filePath,`Task references missing agent \`${i.agent}\`.`);let s=new Set,a=new Map;for(let i of this.agents.values())a.set(i.name,i);let n=this.channelCredentialGetter?.()??this.settings.channelCredentials??{};for(let i of this.channels.values()){s.has(i.name)&&this.setIssue(i.filePath,`Duplicate channel name \`${i.name}\`.`),s.add(i.name);let o=a.get(i.defaultAgent);o?o.approvalRequired.length>0&&this.setIssue(i.filePath,`Channel \`${i.name}\` cannot bind to agent \`${o.name}\` because the agent has \`approval_required\` set (${o.approvalRequired.join(", ")}). Clear the approval list on the agent or pick a different agent.`):this.setIssue(i.filePath,`Channel \`${i.name}\` references missing agent \`${i.defaultAgent}\`.`);let l=n[i.credentialRef];l?l.type!==i.type&&this.setIssue(i.filePath,`Channel \`${i.name}\` is type \`${i.type}\` but credential \`${i.credentialRef}\` is type \`${l.type}\`.`):this.setIssue(i.filePath,`Channel \`${i.name}\` references missing credential \`${i.credentialRef}\`. Add it under Settings \u2192 Channel Credentials.`)}}parseEnvMap(t){if(!ns(t))return{};let e={};for(let[s,a]of Object.entries(t))typeof a=="string"?e[s]=a:(typeof a=="number"||typeof a=="boolean")&&(e[s]=String(a));return e}parseApprovals(t){if(Array.isArray(t))return t.flatMap(e=>{if(!ns(e)||!L(e.tool))return[];let s=L(e.tool);return s?[{tool:s,command:L(e.command),reason:L(e.reason),status:L(e.status)??"pending",resolvedAt:L(e.resolvedAt),note:L(e.note)}]:[]})}};var ht=require("obsidian"),is=class extends ht.Modal{constructor(e,s,a){super(e);this.info=s;this.onConfirm=a}deleteTasks=!0;onOpen(){let{contentEl:e}=this;e.empty(),e.addClass("af-confirm-delete-modal");let s=e.createDiv({cls:"af-delete-header"}),a=s.createSpan({cls:"af-delete-header-icon"});(0,ht.setIcon)(a,"alert-triangle"),s.createEl("h3",{text:`Delete agent "${this.info.agentName}"?`});let n=e.createDiv({cls:"af-delete-summary"});n.createDiv({text:"This action will:"});let i=n.createEl("ul",{cls:"af-delete-impact-list"});i.createEl("li",{text:"Move the agent definition to trash"}),this.info.hasMemory&&i.createEl("li",{text:"Move the agent's memory file to trash"}),this.info.taskCount>0&&i.createEl("li").setText(`${this.info.taskCount} task${this.info.taskCount!==1?"s":""} reference this agent`),this.info.runCount>0&&i.createEl("li",{cls:"af-delete-preserved"}).setText(`${this.info.runCount} run log${this.info.runCount!==1?"s":""} will be preserved`),e.createDiv({cls:"af-delete-note",text:"Files are moved to your system trash and can be recovered."}),this.info.taskCount>0&&new ht.Setting(e).setName("Also delete associated tasks").setDesc(`Delete ${this.info.taskCount} task${this.info.taskCount!==1?"s":""} that reference this agent`).addToggle(u=>{u.setValue(this.deleteTasks),u.onChange(h=>{this.deleteTasks=h})});let o=e.createDiv({cls:"af-delete-actions"}),l=o.createEl("button",{text:"Cancel"});l.onclick=()=>this.close();let c=o.createEl("button",{cls:"af-delete-confirm-btn",text:"Delete Agent"}),d=c.createSpan({cls:"af-delete-btn-icon"});(0,ht.setIcon)(d,"trash-2"),c.onclick=()=>{this.onConfirm(this.deleteTasks),this.close()}}};var te=require("obsidian");var rs=class extends te.PluginSettingTab{constructor(e){super(e.app,e);this.plugin=e}display(){let{containerEl:e}=this;e.empty(),e.createEl("h2",{text:"Agent Fleet Settings"}),new te.Setting(e).setName("Fleet folder").addText(s=>s.setValue(this.plugin.settings.fleetFolder).onChange(async a=>{this.plugin.settings.fleetFolder=a.trim()||Ge.fleetFolder,await this.plugin.saveSettings()})),new te.Setting(e).setName("Claude CLI path").addText(s=>s.setValue(this.plugin.settings.claudeCliPath).onChange(async a=>{this.plugin.settings.claudeCliPath=a.trim()||Ge.claudeCliPath,await this.plugin.saveSettings()})),new te.Setting(e).setName("Default model").addText(s=>s.setValue(this.plugin.settings.defaultModel).onChange(async a=>{this.plugin.settings.defaultModel=a.trim()||Ge.defaultModel,await this.plugin.saveSettings()})),new te.Setting(e).setName("AWS region").addText(s=>s.setValue(this.plugin.settings.awsRegion).onChange(async a=>{this.plugin.settings.awsRegion=a.trim()||Ge.awsRegion,await this.plugin.saveSettings()})),new te.Setting(e).setName("Max concurrent runs").addSlider(s=>s.setLimits(1,10,1).setValue(this.plugin.settings.maxConcurrentRuns).setDynamicTooltip().onChange(async a=>{this.plugin.settings.maxConcurrentRuns=a,await this.plugin.saveSettings()})),new te.Setting(e).setName("Run log retention").setDesc("Days to keep run logs before auto-prune.").addSlider(s=>s.setLimits(1,365,1).setValue(this.plugin.settings.runLogRetentionDays).setDynamicTooltip().onChange(async a=>{this.plugin.settings.runLogRetentionDays=a,await this.plugin.saveSettings()})),new te.Setting(e).setName("Catch up missed tasks").addToggle(s=>s.setValue(this.plugin.settings.catchUpMissedTasks).onChange(async a=>{this.plugin.settings.catchUpMissedTasks=a,await this.plugin.saveSettings()})),new te.Setting(e).setName("Notification level").addDropdown(s=>s.addOption("all","All").addOption("failures-only","Failures only").addOption("none","None").setValue(this.plugin.settings.notificationLevel).onChange(async a=>{this.plugin.settings.notificationLevel=a,await this.plugin.saveSettings()})),new te.Setting(e).setName("Status bar").addToggle(s=>s.setValue(this.plugin.settings.showStatusBar).onChange(async a=>{this.plugin.settings.showStatusBar=a,await this.plugin.saveSettings(),this.plugin.refreshStatusBar()})),new te.Setting(e).setName("Verify Claude CLI").setDesc("Checks that the configured binary is reachable.").addButton(s=>s.setButtonText("Verify").onClick(async()=>{let a=await this.plugin.verifyClaudeCli();new te.Notice(a?"Claude CLI detected.":"Claude CLI check failed. See console for details.")})),this.renderChannelsSection(e)}renderChannelsSection(e){e.createEl("h3",{text:"Channels"});let s=e.createDiv({cls:"af-settings-warning"});s.style.padding="12px",s.style.margin="8px 0 16px 0",s.style.border="1px solid var(--background-modifier-border)",s.style.borderRadius="6px",s.style.background="var(--background-secondary)",s.createEl("strong",{text:"Credential storage: "}),s.createSpan({text:"Channel credentials are stored in this plugin's data.json inside your vault's .obsidian folder. If you sync your .obsidian folder across devices, credentials will sync with it. Do not commit this file to a public git repository."}),new te.Setting(e).setName("Max concurrent channel sessions").setDesc("Hard cap on live claude subprocesses across all channels. Oldest idle session is hibernated when exceeded.").addSlider(c=>c.setLimits(1,20,1).setValue(this.plugin.settings.maxConcurrentChannelSessions).setDynamicTooltip().onChange(async d=>{this.plugin.settings.maxConcurrentChannelSessions=d,await this.plugin.saveSettings()})),new te.Setting(e).setName("Idle timeout (minutes)").setDesc("Channel sessions with no activity for this long get their subprocess hibernated. State is preserved and the next message resumes transparently.").addSlider(c=>c.setLimits(1,120,1).setValue(this.plugin.settings.channelIdleTimeoutMinutes).setDynamicTooltip().onChange(async d=>{this.plugin.settings.channelIdleTimeoutMinutes=d,await this.plugin.saveSettings()})),new te.Setting(e).setName("Rate limit per conversation").setDesc("Maximum messages allowed per external conversation within the rolling window.").addSlider(c=>c.setLimits(1,100,1).setValue(this.plugin.settings.channelRateLimitPerConversation).setDynamicTooltip().onChange(async d=>{this.plugin.settings.channelRateLimitPerConversation=d,await this.plugin.saveSettings()})),new te.Setting(e).setName("Rate limit window (minutes)").addSlider(c=>c.setLimits(1,60,1).setValue(this.plugin.settings.channelRateLimitWindowMinutes).setDynamicTooltip().onChange(async d=>{this.plugin.settings.channelRateLimitWindowMinutes=d,await this.plugin.saveSettings()})),e.createEl("h4",{text:"Channel credentials"});let a=e.createDiv({cls:"af-channel-credentials"});this.renderCredentialList(a);let n=e.createDiv({cls:"af-channel-credential-add"});n.style.marginTop="12px",n.style.padding="12px",n.style.border="1px dashed var(--background-modifier-border)",n.style.borderRadius="6px",n.createEl("strong",{text:"Add a channel credential"});let i={ref:"",type:"slack",botToken:"",appToken:""};new te.Setting(n).setName("Reference name").setDesc("Used by `credential_ref` in _fleet/channels/*.md files.").addText(c=>c.setPlaceholder("my-creds").onChange(d=>{i.ref=d.trim()})),new te.Setting(n).setName("Type").addDropdown(c=>c.addOption("slack","Slack").addOption("telegram","Telegram").setValue("slack").onChange(d=>{i.type=d,o.style.display=d==="slack"?"":"none",l.style.display=d==="telegram"?"":"none"}));let o=n.createDiv();new te.Setting(o).setName("Bot token (xoxb-...)").addText(c=>{c.inputEl.type="password",c.setPlaceholder("xoxb-...").onChange(d=>{i.botToken=d.trim()})}),new te.Setting(o).setName("App-level token (xapp-...)").setDesc("Generated in your Slack app's Basic Information \u2192 App-Level Tokens.").addText(c=>{c.inputEl.type="password",c.setPlaceholder("xapp-...").onChange(d=>{i.appToken=d.trim()})});let l=n.createDiv();l.style.display="none",new te.Setting(l).setName("Bot token").setDesc("From @BotFather on Telegram.").addText(c=>{c.inputEl.type="password",c.setPlaceholder("123456:ABC-DEF1234...").onChange(d=>{i.botToken=d.trim()})}),new te.Setting(n).addButton(c=>c.setButtonText("Add credential").setCta().onClick(async()=>{if(!i.ref||!i.botToken){new te.Notice("Fill in the reference name and bot token.");return}let d;if(i.type==="telegram")d={type:"telegram",botToken:i.botToken};else{if(!i.appToken){new te.Notice("Slack requires both bot token and app-level token.");return}d={type:"slack",botToken:i.botToken,appToken:i.appToken}}this.plugin.channelCredentials.set(i.ref,d),new te.Notice(`Added credential \`${i.ref}\`.`),this.display()}))}renderCredentialList(e){let s=this.plugin.channelCredentials.list();if(s.length===0){e.createDiv({text:"No channel credentials configured yet.",cls:"af-muted"}).style.color="var(--text-muted)";return}for(let{ref:a,entry:n}of s){let i=e.createDiv({cls:"af-channel-credential-row"});i.style.display="flex",i.style.justifyContent="space-between",i.style.alignItems="center",i.style.padding="8px 12px",i.style.border="1px solid var(--background-modifier-border)",i.style.borderRadius="6px",i.style.marginBottom="6px";let o=i.createDiv();o.createEl("strong",{text:a}),o.createEl("span",{text:`  \xB7  ${n.type}  \xB7  ${ci(li(n))}`,cls:"af-muted"}).style.color="var(--text-muted)";let l=i.createEl("button",{text:"Remove"});l.onclick=()=>{this.plugin.channelCredentials.delete(a),new te.Notice(`Removed credential \`${a}\`.`),this.display()}}}};function li(r){return r.type==="slack",r.botToken}function ci(r){return r.length<=10?"***":`${r.slice(0,6)}\u2026${r.slice(-4)}`}var Pa=require("crypto");function xe(r,t,e,s,a,n,i,o){return xe.fromTZ(xe.tp(r,t,e,s,a,n,i),o)}xe.fromTZISO=(r,t,e)=>xe.fromTZ(di(r,t),e);xe.fromTZ=function(r,t){let e=new Date(Date.UTC(r.y,r.m-1,r.d,r.h,r.i,r.s)),s=$s(r.tz,e),a=new Date(e.getTime()-s),n=$s(r.tz,a);if(n-s===0)return a;{let i=new Date(e.getTime()-n),o=$s(r.tz,i);if(o-n===0)return i;if(!t&&o-n>0)return i;if(t)throw new Error("Invalid date passed to fromTZ()");return a}};xe.toTZ=function(r,t){let e=r.toLocaleString("en-US",{timeZone:t}).replace(/[\u202f]/," "),s=new Date(e);return{y:s.getFullYear(),m:s.getMonth()+1,d:s.getDate(),h:s.getHours(),i:s.getMinutes(),s:s.getSeconds(),tz:t}};xe.tp=(r,t,e,s,a,n,i)=>({y:r,m:t,d:e,h:s,i:a,s:n,tz:i});function $s(r,t=new Date){let e=t.toLocaleString("en-US",{timeZone:r,timeZoneName:"shortOffset"}).split(" ").slice(-1)[0],s=t.toLocaleString("en-US").replace(/[\u202f]/," ");return Date.parse(`${s} GMT`)-Date.parse(`${s} ${e}`)}function di(r,t){let e=new Date(Date.parse(r));if(isNaN(e))throw new Error("minitz: Invalid ISO8601 passed to parser.");let s=r.substring(9);return r.includes("Z")||s.includes("-")||s.includes("+")?xe.tp(e.getUTCFullYear(),e.getUTCMonth()+1,e.getUTCDate(),e.getUTCHours(),e.getUTCMinutes(),e.getUTCSeconds(),"Etc/UTC"):xe.tp(e.getFullYear(),e.getMonth()+1,e.getDate(),e.getHours(),e.getMinutes(),e.getSeconds(),t)}xe.minitz=xe;function ui(r){if(r===void 0&&(r={}),delete r.name,r.legacyMode=r.legacyMode===void 0?!0:r.legacyMode,r.paused=r.paused===void 0?!1:r.paused,r.maxRuns=r.maxRuns===void 0?1/0:r.maxRuns,r.catch=r.catch===void 0?!1:r.catch,r.interval=r.interval===void 0?0:parseInt(r.interval,10),r.utcOffset=r.utcOffset===void 0?void 0:parseInt(r.utcOffset,10),r.unref=r.unref===void 0?!1:r.unref,r.startAt&&(r.startAt=new me(r.startAt,r.timezone)),r.stopAt&&(r.stopAt=new me(r.stopAt,r.timezone)),r.interval!==null){if(isNaN(r.interval))throw new Error("CronOptions: Supplied value for interval is not a number");if(r.interval<0)throw new Error("CronOptions: Supplied value for interval can not be negative")}if(r.utcOffset!==void 0){if(isNaN(r.utcOffset))throw new Error("CronOptions: Invalid value passed for utcOffset, should be number representing minutes offset from UTC.");if(r.utcOffset<-870||r.utcOffset>870)throw new Error("CronOptions: utcOffset out of bounds.");if(r.utcOffset!==void 0&&r.timezone)throw new Error("CronOptions: Combining 'utcOffset' with 'timezone' is not allowed.")}if(r.unref!==!0&&r.unref!==!1)throw new Error("CronOptions: Unref should be either true, false or undefined(false).");return r}var js=32,Ot=31|js,ka=[1,2,4,8,16];function Pe(r,t){this.pattern=r,this.timezone=t,this.second=Array(60).fill(0),this.minute=Array(60).fill(0),this.hour=Array(24).fill(0),this.day=Array(31).fill(0),this.month=Array(12).fill(0),this.dayOfWeek=Array(7).fill(0),this.lastDayOfMonth=!1,this.starDOM=!1,this.starDOW=!1,this.parse()}Pe.prototype.parse=function(){if(!(typeof this.pattern=="string"||this.pattern.constructor===String))throw new TypeError("CronPattern: Pattern has to be of type string.");this.pattern.indexOf("@")>=0&&(this.pattern=this.handleNicknames(this.pattern).trim());let r=this.pattern.replace(/\s+/g," ").split(" ");if(r.length<5||r.length>6)throw new TypeError("CronPattern: invalid configuration format ('"+this.pattern+"'), exactly five or six space separated parts are required.");if(r.length===5&&r.unshift("0"),r[3].indexOf("L")>=0&&(r[3]=r[3].replace("L",""),this.lastDayOfMonth=!0),r[3]=="*"&&(this.starDOM=!0),r[4].length>=3&&(r[4]=this.replaceAlphaMonths(r[4])),r[5].length>=3&&(r[5]=this.replaceAlphaDays(r[5])),r[5]=="*"&&(this.starDOW=!0),this.pattern.indexOf("?")>=0){let t=new me(new Date,this.timezone).getDate(!0);r[0]=r[0].replace("?",t.getSeconds()),r[1]=r[1].replace("?",t.getMinutes()),r[2]=r[2].replace("?",t.getHours()),this.starDOM||(r[3]=r[3].replace("?",t.getDate())),r[4]=r[4].replace("?",t.getMonth()+1),this.starDOW||(r[5]=r[5].replace("?",t.getDay()))}this.throwAtIllegalCharacters(r),this.partToArray("second",r[0],0,1),this.partToArray("minute",r[1],0,1),this.partToArray("hour",r[2],0,1),this.partToArray("day",r[3],-1,1),this.partToArray("month",r[4],-1,1),this.partToArray("dayOfWeek",r[5],0,Ot),this.dayOfWeek[7]&&(this.dayOfWeek[0]=this.dayOfWeek[7])};Pe.prototype.partToArray=function(r,t,e,s){let a=this[r],n=r==="day"&&this.lastDayOfMonth;if(t===""&&!n)throw new TypeError("CronPattern: configuration entry "+r+" ("+t+") is empty, check for trailing spaces.");if(t==="*")return a.fill(s);let i=t.split(",");if(i.length>1)for(let o=0;o<i.length;o++)this.partToArray(r,i[o],e,s);else t.indexOf("-")!==-1&&t.indexOf("/")!==-1?this.handleRangeWithStepping(t,r,e,s):t.indexOf("-")!==-1?this.handleRange(t,r,e,s):t.indexOf("/")!==-1?this.handleStepping(t,r,e,s):t!==""&&this.handleNumber(t,r,e,s)};Pe.prototype.throwAtIllegalCharacters=function(r){for(let t=0;t<r.length;t++)if((t===5?/[^/*0-9,\-#L]+/:/[^/*0-9,-]+/).test(r[t]))throw new TypeError("CronPattern: configuration entry "+t+" ("+r[t]+") contains illegal characters.")};Pe.prototype.handleNumber=function(r,t,e,s){let a=this.extractNth(r,t),n=parseInt(a[0],10)+e;if(isNaN(n))throw new TypeError("CronPattern: "+t+" is not a number: '"+r+"'");this.setPart(t,n,a[1]||s)};Pe.prototype.setPart=function(r,t,e){if(!Object.prototype.hasOwnProperty.call(this,r))throw new TypeError("CronPattern: Invalid part specified: "+r);if(r==="dayOfWeek"){if(t===7&&(t=0),(t<0||t>6)&&t!=="L")throw new RangeError("CronPattern: Invalid value for dayOfWeek: "+t);this.setNthWeekdayOfMonth(t,e);return}if(r==="second"||r==="minute"){if(t<0||t>=60)throw new RangeError("CronPattern: Invalid value for "+r+": "+t)}else if(r==="hour"){if(t<0||t>=24)throw new RangeError("CronPattern: Invalid value for "+r+": "+t)}else if(r==="day"){if(t<0||t>=31)throw new RangeError("CronPattern: Invalid value for "+r+": "+t)}else if(r==="month"&&(t<0||t>=12))throw new RangeError("CronPattern: Invalid value for "+r+": "+t);this[r][t]=e};Pe.prototype.handleRangeWithStepping=function(r,t,e,s){let a=this.extractNth(r,t),n=a[0].match(/^(\d+)-(\d+)\/(\d+)$/);if(n===null)throw new TypeError("CronPattern: Syntax error, illegal range with stepping: '"+r+"'");let[,i,o,l]=n;if(i=parseInt(i,10)+e,o=parseInt(o,10)+e,l=parseInt(l,10),isNaN(i))throw new TypeError("CronPattern: Syntax error, illegal lower range (NaN)");if(isNaN(o))throw new TypeError("CronPattern: Syntax error, illegal upper range (NaN)");if(isNaN(l))throw new TypeError("CronPattern: Syntax error, illegal stepping: (NaN)");if(l===0)throw new TypeError("CronPattern: Syntax error, illegal stepping: 0");if(l>this[t].length)throw new TypeError("CronPattern: Syntax error, steps cannot be greater than maximum value of part ("+this[t].length+")");if(i>o)throw new TypeError("CronPattern: From value is larger than to value: '"+r+"'");for(let c=i;c<=o;c+=l)this.setPart(t,c,a[1]||s)};Pe.prototype.extractNth=function(r,t){let e=r,s;if(e.includes("#")){if(t!=="dayOfWeek")throw new Error("CronPattern: nth (#) only allowed in day-of-week field");s=e.split("#")[1],e=e.split("#")[0]}return[e,s]};Pe.prototype.handleRange=function(r,t,e,s){let a=this.extractNth(r,t),n=a[0].split("-");if(n.length!==2)throw new TypeError("CronPattern: Syntax error, illegal range: '"+r+"'");let i=parseInt(n[0],10)+e,o=parseInt(n[1],10)+e;if(isNaN(i))throw new TypeError("CronPattern: Syntax error, illegal lower range (NaN)");if(isNaN(o))throw new TypeError("CronPattern: Syntax error, illegal upper range (NaN)");if(i>o)throw new TypeError("CronPattern: From value is larger than to value: '"+r+"'");for(let l=i;l<=o;l++)this.setPart(t,l,a[1]||s)};Pe.prototype.handleStepping=function(r,t,e,s){let a=this.extractNth(r,t),n=a[0].split("/");if(n.length!==2)throw new TypeError("CronPattern: Syntax error, illegal stepping: '"+r+"'");let i=0;n[0]!=="*"&&(i=parseInt(n[0],10)+e);let o=parseInt(n[1],10);if(isNaN(o))throw new TypeError("CronPattern: Syntax error, illegal stepping: (NaN)");if(o===0)throw new TypeError("CronPattern: Syntax error, illegal stepping: 0");if(o>this[t].length)throw new TypeError("CronPattern: Syntax error, max steps for part is ("+this[t].length+")");for(let l=i;l<this[t].length;l+=o)this.setPart(t,l,a[1]||s)};Pe.prototype.replaceAlphaDays=function(r){return r.replace(/-sun/gi,"-7").replace(/sun/gi,"0").replace(/mon/gi,"1").replace(/tue/gi,"2").replace(/wed/gi,"3").replace(/thu/gi,"4").replace(/fri/gi,"5").replace(/sat/gi,"6")};Pe.prototype.replaceAlphaMonths=function(r){return r.replace(/jan/gi,"1").replace(/feb/gi,"2").replace(/mar/gi,"3").replace(/apr/gi,"4").replace(/may/gi,"5").replace(/jun/gi,"6").replace(/jul/gi,"7").replace(/aug/gi,"8").replace(/sep/gi,"9").replace(/oct/gi,"10").replace(/nov/gi,"11").replace(/dec/gi,"12")};Pe.prototype.handleNicknames=function(r){let t=r.trim().toLowerCase();return t==="@yearly"||t==="@annually"?"0 0 1 1 *":t==="@monthly"?"0 0 1 * *":t==="@weekly"?"0 0 * * 0":t==="@daily"?"0 0 * * *":t==="@hourly"?"0 * * * *":r};Pe.prototype.setNthWeekdayOfMonth=function(r,t){if(t==="L")this.dayOfWeek[r]=this.dayOfWeek[r]|js;else if(t<6&&t>0)this.dayOfWeek[r]=this.dayOfWeek[r]|ka[t-1];else if(t===Ot)this.dayOfWeek[r]=Ot;else throw new TypeError(`CronPattern: nth weekday of of range, should be 1-5 or L. Value: ${t}`)};var xa=[31,28,31,30,31,30,31,31,30,31,30,31],Qe=[["month","year",0],["day","month",-1],["hour","day",0],["minute","hour",0],["second","minute",0]];function me(r,t){if(this.tz=t,r&&r instanceof Date)if(!isNaN(r))this.fromDate(r);else throw new TypeError("CronDate: Invalid date passed to CronDate constructor");else if(r===void 0)this.fromDate(new Date);else if(r&&typeof r=="string")this.fromString(r);else if(r instanceof me)this.fromCronDate(r);else throw new TypeError("CronDate: Invalid type ("+typeof r+") passed to CronDate constructor")}me.prototype.isNthWeekdayOfMonth=function(r,t,e,s){let n=new Date(Date.UTC(r,t,e)).getUTCDay(),i=0;for(let o=1;o<=e;o++)new Date(Date.UTC(r,t,o)).getUTCDay()===n&&i++;if(s&Ot&&ka[i-1]&s)return!0;if(s&js){let o=new Date(Date.UTC(r,t+1,0)).getUTCDate();for(let l=e+1;l<=o;l++)if(new Date(Date.UTC(r,t,l)).getUTCDay()===n)return!1;return!0}return!1};me.prototype.fromDate=function(r){if(this.tz!==void 0)if(typeof this.tz=="number")this.ms=r.getUTCMilliseconds(),this.second=r.getUTCSeconds(),this.minute=r.getUTCMinutes()+this.tz,this.hour=r.getUTCHours(),this.day=r.getUTCDate(),this.month=r.getUTCMonth(),this.year=r.getUTCFullYear(),this.apply();else{let t=xe.toTZ(r,this.tz);this.ms=r.getMilliseconds(),this.second=t.s,this.minute=t.i,this.hour=t.h,this.day=t.d,this.month=t.m-1,this.year=t.y}else this.ms=r.getMilliseconds(),this.second=r.getSeconds(),this.minute=r.getMinutes(),this.hour=r.getHours(),this.day=r.getDate(),this.month=r.getMonth(),this.year=r.getFullYear()};me.prototype.fromCronDate=function(r){this.tz=r.tz,this.year=r.year,this.month=r.month,this.day=r.day,this.hour=r.hour,this.minute=r.minute,this.second=r.second,this.ms=r.ms};me.prototype.apply=function(){if(this.month>11||this.day>xa[this.month]||this.hour>59||this.minute>59||this.second>59||this.hour<0||this.minute<0||this.second<0){let r=new Date(Date.UTC(this.year,this.month,this.day,this.hour,this.minute,this.second,this.ms));return this.ms=r.getUTCMilliseconds(),this.second=r.getUTCSeconds(),this.minute=r.getUTCMinutes(),this.hour=r.getUTCHours(),this.day=r.getUTCDate(),this.month=r.getUTCMonth(),this.year=r.getUTCFullYear(),!0}else return!1};me.prototype.fromString=function(r){if(typeof this.tz=="number"){let t=xe.fromTZISO(r);this.ms=t.getUTCMilliseconds(),this.second=t.getUTCSeconds(),this.minute=t.getUTCMinutes(),this.hour=t.getUTCHours(),this.day=t.getUTCDate(),this.month=t.getUTCMonth(),this.year=t.getUTCFullYear(),this.apply()}else return this.fromDate(xe.fromTZISO(r,this.tz))};me.prototype.findNext=function(r,t,e,s){let a=this[t],n;e.lastDayOfMonth&&(this.month!==1?n=xa[this.month]:n=new Date(Date.UTC(this.year,this.month+1,0,0,0,0,0)).getUTCDate());let i=!e.starDOW&&t=="day"?new Date(Date.UTC(this.year,this.month,1,0,0,0,0)).getUTCDay():void 0;for(let o=this[t]+s;o<e[t].length;o++){let l=e[t][o];if(t==="day"&&e.lastDayOfMonth&&o-s==n&&(l=!0),t==="day"&&!e.starDOW){let c=e.dayOfWeek[(i+(o-s-1))%7];if(c&&c&Ot)c=this.isNthWeekdayOfMonth(this.year,this.month,o-s,c);else if(c)throw new Error(`CronDate: Invalid value for dayOfWeek encountered. ${c}`);r.legacyMode&&!e.starDOM?l=l||c:l=l&&c}if(l)return this[t]=o-s,a!==this[t]?2:1}return 3};me.prototype.recurse=function(r,t,e){let s=this.findNext(t,Qe[e][0],r,Qe[e][2]);if(s>1){let a=e+1;for(;a<Qe.length;)this[Qe[a][0]]=-Qe[a][2],a++;if(s===3)return this[Qe[e][1]]++,this[Qe[e][0]]=-Qe[e][2],this.apply(),this.recurse(r,t,0);if(this.apply())return this.recurse(r,t,e-1)}return e+=1,e>=Qe.length?this:this.year>=3e3?null:this.recurse(r,t,e)};me.prototype.increment=function(r,t,e){return this.second+=t.interval>1&&e?t.interval:1,this.ms=0,this.apply(),this.recurse(r,t,0)};me.prototype.getDate=function(r){return r||this.tz===void 0?new Date(this.year,this.month,this.day,this.hour,this.minute,this.second,this.ms):typeof this.tz=="number"?new Date(Date.UTC(this.year,this.month,this.day,this.hour,this.minute-this.tz,this.second,this.ms)):xe(this.year,this.month+1,this.day,this.hour,this.minute,this.second,this.tz)};me.prototype.getTime=function(){return this.getDate().getTime()};function os(r){return Object.prototype.toString.call(r)==="[object Function]"||typeof r=="function"||r instanceof Function}function hi(r){typeof Deno<"u"&&typeof Deno.unrefTimer<"u"?Deno.unrefTimer(r):r&&typeof r.unref<"u"&&r.unref()}var wa=30*1e3,Bt=[];function ae(r,t,e){if(!(this instanceof ae))return new ae(r,t,e);let s,a;if(os(t))a=t;else if(typeof t=="object")s=t;else if(t!==void 0)throw new Error("Cron: Invalid argument passed for optionsIn. Should be one of function, or object (options).");if(os(e))a=e;else if(typeof e=="object")s=e;else if(e!==void 0)throw new Error("Cron: Invalid argument passed for funcIn. Should be one of function, or object (options).");if(this.name=s?s.name:void 0,this.options=ui(s),this._states={kill:!1,blocking:!1,previousRun:void 0,currentRun:void 0,once:void 0,currentTimeout:void 0,maxRuns:s?s.maxRuns:void 0,paused:s?s.paused:!1,pattern:void 0},r&&(r instanceof Date||typeof r=="string"&&r.indexOf(":")>0)?this._states.once=new me(r,this.options.timezone||this.options.utcOffset):this._states.pattern=new Pe(r,this.options.timezone),this.name){if(Bt.find(i=>i.name===this.name))throw new Error("Cron: Tried to initialize new named job '"+this.name+"', but name already taken.");Bt.push(this)}return a!==void 0&&(this.fn=a,this.schedule()),this}ae.prototype.nextRun=function(r){let t=this._next(r);return t?t.getDate():null};ae.prototype.nextRuns=function(r,t){r>this._states.maxRuns&&(r=this._states.maxRuns);let e=[],s=t||this._states.currentRun;for(;r--&&(s=this.nextRun(s));)e.push(s);return e};ae.prototype.getPattern=function(){return this._states.pattern?this._states.pattern.pattern:void 0};ae.prototype.isRunning=function(){let r=this.nextRun(this._states.currentRun),t=!this._states.paused,e=this.fn!==void 0,s=!this._states.kill;return t&&e&&s&&r!==null};ae.prototype.isStopped=function(){return this._states.kill};ae.prototype.isBusy=function(){return this._states.blocking};ae.prototype.currentRun=function(){return this._states.currentRun?this._states.currentRun.getDate():null};ae.prototype.previousRun=function(){return this._states.previousRun?this._states.previousRun.getDate():null};ae.prototype.msToNext=function(r){r=r||new Date;let t=this._next(r);return t?t.getTime()-r.getTime():null};ae.prototype.stop=function(){this._states.kill=!0,this._states.currentTimeout&&clearTimeout(this._states.currentTimeout);let r=Bt.indexOf(this);r>=0&&Bt.splice(r,1)};ae.prototype.pause=function(){return this._states.paused=!0,!this._states.kill};ae.prototype.resume=function(){return this._states.paused=!1,!this._states.kill};ae.prototype.schedule=function(r){if(r&&this.fn)throw new Error("Cron: It is not allowed to schedule two functions using the same Croner instance.");r&&(this.fn=r);let t=this.msToNext(),e=this.nextRun(this._states.currentRun);return t==null||isNaN(t)||e===null?this:(t>wa&&(t=wa),this._states.currentTimeout=setTimeout(()=>this._checkTrigger(e),t),this._states.currentTimeout&&this.options.unref&&hi(this._states.currentTimeout),this)};ae.prototype._trigger=async function(r){if(this._states.blocking=!0,this._states.currentRun=new me(void 0,this.options.timezone||this.options.utcOffset),this.options.catch)try{await this.fn(this,this.options.context)}catch(t){os(this.options.catch)&&this.options.catch(t,this)}else await this.fn(this,this.options.context);this._states.previousRun=new me(r,this.options.timezone||this.options.utcOffset),this._states.blocking=!1};ae.prototype.trigger=async function(){await this._trigger()};ae.prototype._checkTrigger=function(r){let t=new Date,e=!this._states.paused&&t.getTime()>=r,s=this._states.blocking&&this.options.protect;e&&!s?(this._states.maxRuns--,this._trigger()):e&&s&&os(this.options.protect)&&setTimeout(()=>this.options.protect(this),0),this.schedule()};ae.prototype._next=function(r){let t=!!(r||this._states.currentRun),e=!1;!r&&this.options.startAt&&this.options.interval&&([r,t]=this._calculatePreviousRun(r,t),e=!r),r=new me(r,this.options.timezone||this.options.utcOffset),this.options.startAt&&r&&r.getTime()<this.options.startAt.getTime()&&(r=this.options.startAt);let s=this._states.once||new me(r,this.options.timezone||this.options.utcOffset);return!e&&s!==this._states.once&&(s=s.increment(this._states.pattern,this.options,t)),this._states.once&&this._states.once.getTime()<=r.getTime()||s===null||this._states.maxRuns<=0||this._states.kill||this.options.stopAt&&s.getTime()>=this.options.stopAt.getTime()?null:s};ae.prototype._calculatePreviousRun=function(r,t){let e=new me(void 0,this.options.timezone||this.options.utcOffset);if(this.options.startAt.getTime()<=e.getTime()){r=this.options.startAt;let s=r.getTime()+this.options.interval*1e3;for(;s<=e.getTime();)r=new me(r,this.options.timezone||this.options.utcOffset).increment(this._states.pattern,this.options,!0),s=r.getTime()+this.options.interval*1e3;t=!0}return[r,t]};ae.Cron=ae;ae.scheduledJobs=Bt;var Da=require("obsidian");var Sa=require("child_process"),Ta=require("crypto"),Ie=require("fs"),Hs=require("path");function Ca(r){if(typeof r=="string")return r;if(Array.isArray(r))return r.map(e=>typeof e=="string"?e:e&&typeof e=="object"&&"text"in e&&typeof e.text=="string"?e.text:"").filter(Boolean).join(`
`);if(r&&typeof r=="object"){for(let t of["output","result","text","message"])if(t in r)return Ca(r[t])}}function qs(r,t=[]){if(Array.isArray(r)){for(let i of r)qs(i,t);return t}if(!r||typeof r!="object")return t;let e=r,s=typeof e.tool_name=="string"&&e.tool_name||typeof e.tool=="string"&&e.tool||typeof e.name=="string"&&e.name,a=typeof e.command=="string"?e.command:typeof e.input=="string"?e.input:typeof e.cmd=="string"?e.cmd:void 0,n=typeof e.reason=="string"?e.reason:void 0;s&&["tool_use","tool","name","tool_name"].some(i=>i in e)&&t.push({tool:s,command:a,reason:n});for(let i of Object.values(e))qs(i,t);return t}function _a(r){if(!r||typeof r!="object")return;let t=r,e=t.usage;if(e&&typeof e=="object"){let a=typeof e.input_tokens=="number"?e.input_tokens:0,n=typeof e.output_tokens=="number"?e.output_tokens:0,i=typeof e.cache_creation_input_tokens=="number"?e.cache_creation_input_tokens:0,o=typeof e.cache_read_input_tokens=="number"?e.cache_read_input_tokens:0,l=a+n+i+o;if(l>0)return l}let s=t.modelUsage;if(s&&typeof s=="object"){let a=0;for(let n of Object.values(s)){if(!n||typeof n!="object")continue;let i=n;a+=typeof i.inputTokens=="number"?i.inputTokens:0,a+=typeof i.outputTokens=="number"?i.outputTokens:0,a+=typeof i.cacheReadInputTokens=="number"?i.cacheReadInputTokens:0,a+=typeof i.cacheCreationInputTokens=="number"?i.cacheCreationInputTokens:0}if(a>0)return a}for(let a of["tokens_used","total_tokens","totalTokens"])if(typeof t[a]=="number")return t[a];for(let a of Object.values(t)){let n=_a(a);if(typeof n=="number")return n}}function Ea(r){if(!r||typeof r!="object")return;let t=r;if(typeof t.total_cost_usd=="number")return t.total_cost_usd;for(let e of Object.values(t)){let s=Ea(e);if(typeof s=="number")return s}}function Aa(r){let t=r.matchAll(/\[REMEMBER\]([\s\S]*?)\[\/REMEMBER\]/g);return Array.from(t).map(e=>e[1]?.trim()??"").filter(Boolean)}var ls=class{constructor(t,e){this.settings=t;this.repository=e}runningProcesses=new Map;abortAgent(t){let e=this.runningProcesses.get(t);return e?(e.kill(),this.runningProcesses.delete(t),!0):!1}extractStreamContent(t){let e=t.type;if(e==="assistant"){let s=t.message;if(s?.content&&Array.isArray(s.content)){let a=[];for(let n of s.content)if(n.type==="text"&&typeof n.text=="string")a.push(n.text);else if(n.type==="tool_use"){let i=String(n.name??"tool"),o=n.input,l=o?.command??o?.content??"";a.push(`
\u25B8 ${i}${l?`: ${String(l).slice(0,200)}`:""}
`)}if(a.length>0)return a.join("")}}if(e==="result"){let s=typeof t.result=="string"?t.result:null;if(s)return`
${s}`}return null}async buildPrompt(t,e,s){let a=[t.body.trim()];for(let n of t.skills){let i=this.repository.getSkillByName(n);if(i){let o=[i.body.trim()];i.toolsBody.trim()&&o.push(`### Tools
${i.toolsBody.trim()}`),i.referencesBody.trim()&&o.push(`### References
${i.referencesBody.trim()}`),i.examplesBody.trim()&&o.push(`### Examples
${i.examplesBody.trim()}`),a.push(`## Skill: ${i.name}
${o.join(`

`)}`)}}if(t.skillsBody.trim()&&a.push(`## Agent Skills
${t.skillsBody.trim()}`),t.contextBody.trim()&&a.push(`## Agent Context
${t.contextBody.trim()}`),t.memory){let n=await this.repository.getMemory(t.name);n?.body.trim()&&a.push(`## Agent Memory
${n.body.trim()}`)}return a.push(`## Task
${(s??e.body).trim()}`),a.filter(Boolean).join(`

`)}async execute(t,e,s,a){let n=await this.buildPrompt(t,e,s),i=(0,Ta.randomUUID)(),o=t.model.trim(),l=o.length>0&&o!=="default"&&o!=="subscription",c=a!=null,d=["-p",n,"--output-format",c?"stream-json":"json"];c&&d.push("--verbose"),l&&d.push("--model",o);let u=t.cwd??this.repository.getVaultBasePath()??".",h=t.permissionRules.allow.length>0||t.permissionRules.deny.length>0,m=t.permissionMode?.trim(),f=!!m&&m!=="default",p=(t.mcpServers?.length??0)>0,v=h||f||p,k=null,w=null;if(v){let x=(0,Hs.join)(u,".claude");if(k=(0,Hs.join)(x,"settings.local.json"),(0,Ie.existsSync)(x)||(0,Ie.mkdirSync)(x,{recursive:!0}),(0,Ie.existsSync)(k))try{w=(0,Ie.readFileSync)(k,"utf-8")}catch{w=null}let T={};if(f&&(T.defaultMode=m),h||p){let C=[...t.permissionRules.allow];if(p)for(let A of t.mcpServers??[]){let E=A.replace(/[\s.]+/g,"_");C.push(`mcp__${E}`)}T.permissions={allow:C,deny:t.permissionRules.deny}}(0,Ie.writeFileSync)(k,JSON.stringify(T,null,2)+`
`,"utf-8")}let g=Date.now(),y=()=>{if(k)try{w!==null?(0,Ie.writeFileSync)(k,w,"utf-8"):(0,Ie.existsSync)(k)&&(0,Ie.unlinkSync)(k)}catch{}};try{return await new Promise((x,T)=>{let C=[this.settings.claudeCliPath,...d].map(K=>`'${K.replace(/'/g,"'\\''")}'`).join(" "),A=(0,Sa.spawn)("/bin/zsh",["-l","-c",C],{cwd:u,env:{...process.env,AWS_REGION:this.settings.awsRegion}});this.runningProcesses.set(t.name,A);let E="",R="",U=!1,D=setTimeout(()=>{U=!0,A.kill()},t.timeout*1e3);A.stdout.on("data",K=>{let q=K.toString();if(E+=q,c&&a)for(let V of q.split(`
`)){let $=V.trim();if($)try{let j=JSON.parse($),W=this.extractStreamContent(j);W&&a(W)}catch{}}}),A.stderr.on("data",K=>{R+=K.toString()}),A.on("error",K=>{clearTimeout(D),T(K)}),A.on("close",K=>{clearTimeout(D),this.runningProcesses.delete(t.name);let q=E.trim(),V;if(c){let H=q.split(`
`);for(let P=H.length-1;P>=0;P--){let M=H[P]?.trim();if(M)try{let I=JSON.parse(M);if(I&&typeof I=="object"){V=I;break}}catch{}}}else if(q.startsWith("{")||q.startsWith("["))try{V=JSON.parse(q)}catch{V=void 0}let $=Ca(V)??"";if(!$&&c){let H=[];for(let P of q.split(`
`)){let M=P.trim();if(M)try{let I=JSON.parse(M);if(I.type==="assistant"&&I.message?.content)for(let Q of I.message.content)Q.type==="text"&&Q.text&&H.push(Q.text);else I.type==="result"&&typeof I.result=="string"&&H.push(I.result)}catch{}}$=H.join(`
`).trim()}$||($=R.trim()||"(no output)");let j=qs(V),W=_a(V),X=Ea(V);x({runId:i,prompt:n,exitCode:K,durationSeconds:Math.max(1,Math.round((Date.now()-g)/1e3)),stdout:E,stderr:R,outputText:$,rawJson:V,tokensUsed:W,costUsd:X,toolsUsed:j,timedOut:U})})})}finally{y()}}};var cs=require("child_process"),pi=Be(require("https")),mi=Be(require("http")),Ve=Be(require("fs")),rt=Be(require("path")),ds=class{constructor(t){this.settings=t}cache=null;loadPromise=null;progressListeners=[];authManager;setAuthManager(t){this.authManager=t}getCachedServers(){return this.cache}onProgress(t){return this.progressListeners.push(t),()=>{this.progressListeners=this.progressListeners.filter(e=>e!==t)}}emitProgress(t){for(let e of this.progressListeners)try{e(t)}catch{}}async getServers(t=!1){return this.cache!==null&&!t?this.cache:this.loadPromise&&!t?this.loadPromise:(this.loadPromise=this.loadServers().then(e=>(this.cache=e,this.loadPromise=null,e)),this.loadPromise)}invalidateCache(){this.cache=null,this.loadPromise=null}async toggleServerEnabled(t,e){let s=rt.join(process.env.HOME??"",".claude","settings.local.json"),a={};try{let o=Ve.readFileSync(s,"utf8");a=JSON.parse(o)}catch{}let n=a.disabledMcpjsonServers??[],i=this.toInternalName(t);if(e?(a.disabledMcpjsonServers=n.filter(o=>o!==i),this.enableServerInClaudeConfig(t)):n.includes(i)||(n.push(i),a.disabledMcpjsonServers=n),Ve.writeFileSync(s,JSON.stringify(a,null,2)),this.cache){let o=this.cache.find(l=>l.name===t);o&&(o.enabled=e)}}toInternalName(t){return t.replace(/\./g,"_").replace(/\s+/g,"_")}shellEscape(t){return`'${t.replace(/'/g,"'\\''")}'`}async addServer(t){let e=["mcp","add"],s=t.scope??"user";if(e.push("-s",s),t.transport==="stdio"){if(t.envVars)for(let[a,n]of Object.entries(t.envVars))e.push("-e",`${a}=${n}`);e.push(this.shellEscape(t.name)),e.push("--"),t.command&&e.push(t.command),t.args&&e.push(...t.args)}else if(e.push("-t",t.transport),e.push(this.shellEscape(t.name)),t.url&&e.push(this.shellEscape(t.url)),t.headers)for(let[a,n]of Object.entries(t.headers))e.push("-H",this.shellEscape(`${a}: ${n}`));await this.runCli(e.join(" ")),this.enableServerInClaudeConfig(t.name),this.invalidateCache()}async removeServer(t,e){let s=["mcp","remove"];e&&s.push("-s",e),s.push(this.shellEscape(t)),await this.runCli(s.join(" ")),this.authManager?.removeToken(t),this.invalidateCache()}async authenticateServer(t,e,s="http"){try{await this.runCli(`mcp remove -s user ${this.shellEscape(t)}`)}catch{}let a=["mcp","add","-t",s,"-s","user",this.shellEscape(t),this.shellEscape(e)];await this.runCli(a.join(" ")),this.enableServerInClaudeConfig(t),await this.triggerCliAuth();let n=await this.extractTokenFromCli(t);n&&this.authManager&&this.authManager.storeProbeToken(t,n),this.invalidateCache()}triggerCliAuth(){return new Promise((t,e)=>{let s=`${this.settings.claudeCliPath} -p '.' --model haiku`,a=(0,cs.spawn)("/bin/zsh",["-l","-c",s],{env:{...process.env}}),n="";a.stderr.on("data",o=>{n+=o.toString()}),a.on("error",e);let i=setTimeout(()=>{a.kill(),e(new Error("Authentication timed out \u2014 complete authorization in your browser and try again."))},18e4);a.on("close",o=>{clearTimeout(i),o!==0&&n.trim()?e(new Error(n)):t()})})}async extractTokenFromCli(t){try{return(await this.runCli(`mcp get ${this.shellEscape(t)}`)).match(/Authorization:\s*Bearer\s+(\S+)/)?.[1]}catch{return}}async refreshProbeTokens(){if(!this.authManager)return;let t=this.cache??[];for(let e of t)if((e.type==="http"||e.type==="sse")&&e.url)try{let s=await this.extractTokenFromCli(e.name);s&&this.authManager.storeProbeToken(e.name,s)}catch{}}async loadServers(){try{this.emitProgress({phase:"list",message:"Scanning MCP servers\u2026"});let t=await this.runCli("mcp list"),e=this.parseListOutput(t);if(e.length===0)return this.emitProgress({phase:"done",serverCount:0,toolCount:0}),[];let s=[];for(let i=0;i<e.length;i++){let o=e[i];this.emitProgress({phase:"details",current:i+1,total:e.length,serverName:o.name});try{let l=await this.runCli(`mcp get '${o.name.replace(/'/g,"'\\''")}'`),c=this.mergeGetOutput(o,l);c.description||(c.description=this.getPluginDescription(c.name)),s.push(c)}catch{s.push(o)}}if(this.authManager)for(let i of s)i.status==="needs-auth"&&this.authManager.hasToken(i.name)&&(i.status="connected");let a=s.filter(i=>i.enabled&&(i.status==="connected"||i.status==="needs-auth"&&(i.type==="http"||i.type==="sse")&&i.url));if(a.length>0){let i=a.filter(o=>o.status==="connected").length;this.emitProgress({phase:"tools",message:`Probing ${a.length} server${a.length!==1?"s":""} for tools\u2026`}),await Promise.allSettled(a.map(async o=>{try{let l=[];if(o.type==="stdio"&&o.command){let c=await this.probeStdioServer(o.command,o.args);c.description&&!o.description&&(o.description=c.description),l=c.tools}else(o.type==="http"||o.type==="sse")&&o.url&&(l=await this.probeHttpServer(o));l.length>0&&(o.toolDetails=l,o.tools=l.map(c=>c.name),o.status==="needs-auth"&&(o.status="connected"))}catch(l){console.warn(`McpManager: probe failed for ${o.name}:`,l)}}))}let n=s.reduce((i,o)=>i+o.toolDetails.length,0);return this.emitProgress({phase:"done",serverCount:s.length,toolCount:n}),s}catch(t){return console.error("McpManager: failed to load servers",t),this.emitProgress({phase:"done",serverCount:0,toolCount:0}),[]}}getPluginDescription(t){let e=t.replace(/^claude\.ai\s+/i,"").toLowerCase().replace(/\s+/g,"-"),s=rt.join(process.env.HOME??"",".claude","plugins","marketplaces","claude-plugins-official","external_plugins",e,".claude-plugin","plugin.json");try{let a=Ve.readFileSync(s,"utf8");return JSON.parse(a).description||void 0}catch{return}}probeStdioServer(t,e){return new Promise(s=>{let a=e?`${t} ${e}`:t,n=(0,cs.spawn)("/bin/zsh",["-l","-c",a],{env:{...process.env},stdio:["pipe","pipe","pipe"]}),i="",o,l=[],c=!1,d=!1,u=!1,h=()=>{c||(c=!0,n.kill(),s({description:o,tools:l}))},m=setTimeout(h,1e4);n.stdout.on("data",f=>{i+=f.toString();let p=i.split(`
`);i=p.pop()??"";for(let v of p){let k=v.trim();if(k){try{let w=JSON.parse(k);if(w.id===1&&w.result){o=w.result.instructions??w.result.serverInfo?.description,d=!0;try{n.stdin.write(JSON.stringify({jsonrpc:"2.0",method:"notifications/initialized"})+`
`),n.stdin.write(JSON.stringify({jsonrpc:"2.0",id:2,method:"tools/list"})+`
`)}catch{clearTimeout(m),h();return}}else if(w.id===2&&w.result){for(let g of w.result.tools??[])l.push({name:g.name,description:g.description,inputSchema:g.inputSchema});u=!0}}catch{}d&&u&&(clearTimeout(m),h())}}}),n.on("error",()=>{clearTimeout(m),h()}),n.on("close",()=>{clearTimeout(m),h()});try{n.stdin.write(JSON.stringify({jsonrpc:"2.0",id:1,method:"initialize",params:{protocolVersion:"2024-11-05",capabilities:{},clientInfo:{name:"agent-fleet",version:"1.0.0"}}})+`
`)}catch{clearTimeout(m),h()}})}async probeHttpServer(t){let e=await this.findServerToken(t);if(!e)return console.log(`McpManager: no auth token for ${t.name}, skipping tool probe`),[];let s=t.url.endsWith("/sse")?t.url.replace(/\/sse$/,"/mcp"):t.url;try{let n=(await this.httpRequest(s,e,{jsonrpc:"2.0",id:1,method:"initialize",params:{protocolVersion:"2025-03-26",capabilities:{},clientInfo:{name:"agent-fleet",version:"1.0.0"}}}))?._sessionId;await this.httpRequest(s,e,{jsonrpc:"2.0",method:"notifications/initialized"},n);let i=await this.httpRequest(s,e,{jsonrpc:"2.0",id:2,method:"tools/list"},n),o=[],l=i?.result?.tools??[];for(let c of l)o.push({name:c.name,description:c.description,inputSchema:c.inputSchema});return o}catch(a){return console.warn(`McpManager: HTTP probe failed for ${t.name}:`,a),[]}}async findServerToken(t){if(this.authManager){let i=this.authManager.getToken(t.name);if(i)return i}let e=t.name.replace(/^claude\.ai\s+/i,"").replace(/\s+/g,"_").toUpperCase(),s=[`${e}_API_KEY`,`${e}_API_KEY_MILO`,`${e}_TOKEN`];for(let i of s){let o=process.env[i];if(o)return o}let a=process.env.HOME??"",n=[rt.join(a,".openclaw","workspace",".env"),rt.join(a,".env")];for(let i of n)try{let o=Ve.readFileSync(i,"utf8");for(let l of o.split(`
`)){let c=l.trim().match(/^(?:export\s+)?([A-Za-z_]\w*)=(.*)$/);if(c){let d=c[1],u=c[2].replace(/^["']|["']$/g,"");if(s.includes(d))return u}}}catch{}}httpRequest(t,e,s,a){return new Promise((n,i)=>{let o=JSON.stringify(s),l=new URL(t),c=l.protocol==="https:",d={"Content-Type":"application/json",Accept:"application/json, text/event-stream",Authorization:`Bearer ${e}`,"Content-Length":String(Buffer.byteLength(o))};a&&(d["mcp-session-id"]=a);let u={hostname:l.hostname,port:l.port||(c?443:80),path:l.pathname+l.search,method:"POST",headers:d},m=(c?pi:mi).request(u,p=>{let v="";p.on("data",k=>{v+=k.toString()}),p.on("end",()=>{let k=p.headers["mcp-session-id"];if((p.headers["content-type"]??"").includes("text/event-stream")){for(let g of v.split(`
`))if(g.startsWith("data: "))try{let y=JSON.parse(g.slice(6));k&&(y._sessionId=k),n(y);return}catch{}n(null)}else try{let g=JSON.parse(v);k&&(g._sessionId=k),n(g)}catch{n(null)}})});m.on("error",i);let f=setTimeout(()=>{m.destroy(),n(null)},15e3);m.on("close",()=>clearTimeout(f)),m.write(o),m.end()})}runCli(t){return new Promise((e,s)=>{let a=`${this.settings.claudeCliPath} ${t}`,n=(0,cs.spawn)("/bin/zsh",["-l","-c",a],{env:{...process.env}}),i="",o="";n.stdout.on("data",l=>{i+=l.toString()}),n.stderr.on("data",l=>{o+=l.toString()}),n.on("error",s),n.on("close",l=>{l!==0&&!i.trim()?s(new Error(o||`Process exited with code ${l}`)):e(i)})})}getDisabledServers(){let t=new Set,e=rt.join(process.env.HOME??"",".claude","settings.local.json");try{let a=Ve.readFileSync(e,"utf8"),n=JSON.parse(a);for(let i of n.disabledMcpjsonServers??[])t.add(i)}catch{}let s=rt.join(process.env.HOME??"",".claude.json");try{let a=Ve.readFileSync(s,"utf8"),i=JSON.parse(a).projects;if(i){for(let o of Object.values(i))if(o&&Array.isArray(o.disabledMcpServers))for(let l of o.disabledMcpServers)t.add(l)}}catch{}return t}enableServerInClaudeConfig(t){let e=rt.join(process.env.HOME??"",".claude.json");try{let s=Ve.readFileSync(e,"utf8"),a=JSON.parse(s),n=a.projects;if(!n)return;let i=!1;for(let o of Object.values(n))if(o&&Array.isArray(o.disabledMcpServers)){let l=o.disabledMcpServers.indexOf(t);l!==-1&&(o.disabledMcpServers.splice(l,1),i=!0)}i&&Ve.writeFileSync(e,JSON.stringify(a,null,2))}catch{}}parseListOutput(t){let e=[],s=this.getDisabledServers();for(let a of t.split(`
`)){let n=a.trim();if(!n||n.startsWith("Checking"))continue;let i=n.indexOf(": ");if(i===-1)continue;let o=n.slice(0,i).trim(),l=n.slice(i+2),c=l.lastIndexOf(" - ");if(c===-1)continue;let d=l.slice(0,c).trim(),u=l.slice(c+3).trim(),h="disconnected";u.includes("Connected")?h="connected":u.includes("authentication")?h="needs-auth":u.toLowerCase().includes("error")&&(h="error");let m="unknown",f,p;if(d.startsWith("http://")||d.startsWith("https://")){let w=d.replace(/\s+\(\w+\)\s*$/,"").trim();m=w.endsWith("/sse")?"sse":"http",f=w}else d&&(m="stdio",p=d);let v=this.toInternalName(o),k=!s.has(v);e.push({name:o,type:m,status:h,scope:"unknown",enabled:k,url:f,command:p,tools:[],toolDetails:[]})}return e}mergeGetOutput(t,e){let s={...t};for(let a of e.split(`
`)){let n=a.trim();if(n.startsWith("Type:")){let i=n.slice(5).trim().toLowerCase();i==="stdio"?s.type="stdio":i==="http"?s.type="http":i==="sse"&&(s.type="sse")}else if(n.startsWith("Scope:")){let i=n.slice(6).trim().toLowerCase();i.includes("user")?s.scope="user":i.includes("project")&&(s.scope="project")}else if(n.startsWith("Command:")){let i=n.slice(8).trim();i&&(s.command=i)}else if(n.startsWith("Args:")){let i=n.slice(5).trim();i&&(s.args=i)}}return s}};var fi={"every 5m":"*/5 * * * *","every 10m":"*/10 * * * *","every 15m":"*/15 * * * *","every 30m":"*/30 * * * *","every 1h":"0 * * * *","every 2h":"0 */2 * * *",hourly:"0 * * * *","daily at 9am":"0 9 * * *","daily at 6pm":"0 18 * * *","weekdays at 9am":"0 9 * * 1-5","weekly on monday":"0 9 * * 1","monthly on 1st":"0 9 1 * *"},us=class{constructor(t,e){this.maxConcurrentRuns=t;this.callbacks=e}jobs=new Map;activeRuns=0;queue=[];paused=!1;setMaxConcurrentRuns(t){this.maxConcurrentRuns=t}parseSchedule(t){return fi[t.toLowerCase()]??t}toLocalISOString(t){let e=s=>String(s).padStart(2,"0");return`${t.getFullYear()}-${e(t.getMonth()+1)}-${e(t.getDate())}T${e(t.getHours())}:${e(t.getMinutes())}:${e(t.getSeconds())}`}async registerTask(t){if(this.unregisterTask(t.taskId),!(!t.enabled||t.type==="immediate"))try{if(t.type==="once"&&t.runAt){let e=new ae(new Date(t.runAt),{name:t.taskId,catch:!0},()=>{this.enqueue({task:t,reason:"scheduled"})});this.jobs.set(t.taskId,e),await this.callbacks.onTaskScheduled(t,t.runAt);return}if(t.type==="recurring"&&t.schedule){let e=this.parseSchedule(t.schedule),s=new ae(e,{name:t.taskId,catch:!0,protect:!0,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone},()=>{this.enqueue({task:t,reason:"scheduled"})});this.jobs.set(t.taskId,s);let a=s.nextRun();await this.callbacks.onTaskScheduled(t,a?this.toLocalISOString(a):void 0)}}catch(e){console.error(`Agent Fleet: Failed to register task "${t.taskId}":`,e)}}unregisterTask(t){let e=this.jobs.get(t);e&&(e.stop(),this.jobs.delete(t))}async loadTasks(t){for(let e of t)await this.registerTask(e)}async handleStartupCatchUp(t){let e=Date.now();for(let s of t)!s.enabled||!s.catchUp||!s.nextRun||new Date(s.nextRun).getTime()<e&&await this.enqueue({task:s,reason:"catch-up"})}async enqueue(t){this.queue.push(t),await this.processQueue()}pauseAll(){this.paused=!0,this.jobs.forEach(t=>t.pause())}resumeAll(){this.paused=!1,this.jobs.forEach(t=>t.resume()),this.processQueue()}getQueueSize(){return this.queue.length}async processQueue(){if(!this.paused)for(;this.activeRuns<this.maxConcurrentRuns&&this.queue.length>0;){let t=this.queue.shift();if(!t)return;this.activeRuns+=1,this.callbacks.onTaskTriggered(t).finally(async()=>{this.activeRuns-=1,await this.processQueue()})}}};var Nt=class{constructor(t,e){this.repository=t;this.settings=e;this.executor=new ls(e,t),this.mcpManager=new ds(e),this.scheduler=new us(e.maxConcurrentRuns,{onTaskTriggered:s=>this.runPendingTask(s),onTaskScheduled:(s,a)=>this.repository.updateTaskRunMetadata(s,{nextRun:a})})}scheduler;executor;mcpManager;snapshot={agents:[],skills:[],tasks:[],channels:[],validationIssues:[]};runtimeState=new Map;recentRuns=[];statusChangeListeners=new Set;runOutputListeners=new Map;runOutputBuffers=new Map;heartbeatJobs=new Map;heartbeatRegisteredAt=0;heartbeatsInFlight=new Set;heartbeatResultHandler;async initialize(){this.snapshot=await this.repository.loadAll(),this.recentRuns=await this.repository.listRecentRuns();let t=this.snapshot.tasks.filter(e=>this.repository.getAgentByName(e.agent)?.enabled!==!1);await this.scheduler.loadTasks(t),await this.scheduler.handleStartupCatchUp(t),this.registerHeartbeats(),this.emitStatusChange()}onHeartbeatResult(t){this.heartbeatResultHandler=t}async refreshFromVault(){this.snapshot=await this.repository.loadAll(),await this.rebuildSchedules(),this.recentRuns=await this.repository.listRecentRuns(),this.emitStatusChange()}getSnapshot(){return this.snapshot}getRecentRuns(){return this.recentRuns}getAgentState(t){let e=this.runtimeState.get(t),s=this.snapshot.agents.find(a=>a.name===t);return s&&!s.enabled?{status:"disabled",lastRun:e?.lastRun,currentRunId:e?.currentRunId}:e??{status:"idle"}}getFleetStatus(){let t=new Date,e=o=>String(o).padStart(2,"0"),s=`${t.getFullYear()}-${e(t.getMonth()+1)}-${e(t.getDate())}`,a=this.recentRuns.filter(o=>{let l=new Date(o.started);return`${l.getFullYear()}-${e(l.getMonth()+1)}-${e(l.getDate())}`===s}).length,n=Array.from(this.runtimeState.values()).filter(o=>o.status==="running").length,i=this.recentRuns.flatMap(o=>o.approvals??[]).filter(o=>o.status==="pending").length;return{running:n,pending:i,completedToday:a}}subscribe(t){return this.statusChangeListeners.add(t),()=>this.statusChangeListeners.delete(t)}onRunOutput(t,e){let s=this.runOutputListeners.get(t);s||(s=new Set,this.runOutputListeners.set(t,s)),s.add(e);let a=this.runOutputBuffers.get(t);return a&&e(a),()=>{this.runOutputListeners.get(t)?.delete(e)}}getRunOutputBuffer(t){return this.runOutputBuffers.get(t)??""}async handleVaultChange(t){await this.repository.loadFile(t),this.snapshot=this.repository.getSnapshot(),await this.rebuildSchedules(),this.recentRuns=await this.repository.listRecentRuns(),this.emitStatusChange()}async handleVaultDelete(t){this.repository.removeFile(t),this.snapshot=this.repository.getSnapshot(),await this.rebuildSchedules(),this.recentRuns=await this.repository.listRecentRuns(),this.emitStatusChange()}abortedAgents=new Set;abortAgentRun(t){let e=this.executor.abortAgent(t);return e&&(this.abortedAgents.add(t),this.runtimeState.set(t,{status:"idle"}),this.emitStatusChange()),e}wasAborted(t){return this.abortedAgents.has(t)}consumeAborted(t){let e=this.abortedAgents.has(t);return this.abortedAgents.delete(t),e}async runTaskNow(t,e){await this.scheduler.enqueue({task:{...t,type:"immediate"},reason:"manual",promptOverride:e})}async runAgentNow(t,e){let s=t.heartbeatBody.trim()&&e==="Run now and summarize the current state."?t.heartbeatBody.trim():e,a=s===t.heartbeatBody.trim()&&t.heartbeatBody.trim().length>0,n={filePath:"",taskId:a?`heartbeat-${Date.now()}`:`manual-${Date.now()}`,agent:t.name,type:"immediate",priority:"medium",enabled:!0,created:new Date().toISOString(),runCount:0,catchUp:!1,tags:a?[...t.tags,"heartbeat"]:t.tags,body:s};await this.scheduler.enqueue({task:n,reason:a?"heartbeat":"manual",promptOverride:s})}async resolveApproval(t,e,s){t.filePath&&(await this.repository.setApprovalDecision(t.filePath,e,s),this.recentRuns=await this.repository.listRecentRuns(),this.emitStatusChange())}async pruneOldRuns(){let t=Date.now()-this.settings.runLogRetentionDays*24*60*60*1e3,e=await this.repository.listRecentRuns(500);for(let s of e)s.filePath&&new Date(s.started).getTime()<t&&await this.repository.trashFile(s.filePath)}async rebuildSchedules(){this.scheduler.pauseAll();for(let t of this.snapshot.tasks)this.scheduler.unregisterTask(t.taskId);this.scheduler.setMaxConcurrentRuns(this.settings.maxConcurrentRuns),await this.scheduler.loadTasks(this.snapshot.tasks.filter(t=>this.repository.getAgentByName(t.agent)?.enabled!==!1)),this.scheduler.resumeAll(),this.registerHeartbeats()}registerHeartbeats(){for(let[,t]of this.heartbeatJobs)t.stop();this.heartbeatJobs.clear(),this.heartbeatRegisteredAt=Date.now();for(let t of this.snapshot.agents)if(!(!t.enabled||!t.heartbeatEnabled||!t.heartbeatSchedule.trim()||!t.heartbeatBody.trim()))try{let e=new ae(t.heartbeatSchedule,{name:`heartbeat:${t.name}`,catch:!0,protect:!0,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone},()=>{this.runHeartbeat(t.name)});this.heartbeatJobs.set(t.name,e)}catch(e){console.error(`Agent Fleet: failed to register heartbeat for "${t.name}":`,e)}}async runHeartbeat(t){if(!(Date.now()-this.heartbeatRegisteredAt<1e4)&&!this.heartbeatsInFlight.has(t)){this.heartbeatsInFlight.add(t);try{let e=this.repository.getAgentByName(t);if(!e||!e.enabled||!e.heartbeatBody.trim())return;let s={filePath:"",taskId:`heartbeat-${Date.now()}`,agent:e.name,type:"immediate",priority:"medium",enabled:!0,created:new Date().toISOString(),runCount:0,catchUp:!1,tags:[...e.tags,"heartbeat"],body:e.heartbeatBody.trim()};await this.scheduler.enqueue({task:s,reason:"heartbeat",promptOverride:e.heartbeatBody.trim()})}finally{this.heartbeatsInFlight.delete(t)}}}getNextHeartbeat(t){let e=this.heartbeatJobs.get(t);return e?e.nextRun()??null:null}async runPendingTask({task:t,promptOverride:e}){let s=this.repository.getAgentByName(t.agent);if(!s||!s.enabled)return;let a=new Date().toISOString();this.runtimeState.set(s.name,{status:"running",runStarted:a}),this.runOutputBuffers.set(s.name,""),this.emitStatusChange();try{let n=await this.executor.execute(s,t,e,h=>{let m=this.runOutputBuffers.get(s.name)??"";this.runOutputBuffers.set(s.name,m+h);let f=this.runOutputListeners.get(s.name);if(f)for(let p of f)p(h)}),i=this.consumeAborted(s.name),o=i?[]:this.buildApprovals(s,n.toolsUsed),l=i?"cancelled":this.resolveRunStatus(n,o),c={runId:n.runId,agent:s.name,task:t.taskId,status:l,started:a,completed:new Date().toISOString(),durationSeconds:n.durationSeconds,tokensUsed:n.tokensUsed,costUsd:n.costUsd,model:s.model,exitCode:n.exitCode,tags:Array.from(new Set([...s.tags,...t.tags])),prompt:n.prompt,output:n.outputText,toolsUsed:n.toolsUsed.map(h=>`${h.tool}${h.command?`: ${h.command}`:""}`),stderr:n.stderr,approvals:o},d=await this.repository.writeRunLog(c);if(await this.repository.updateTaskRunMetadata(t,{lastRun:a,runCount:t.runCount+1}),s.memory){let h=Aa(n.outputText);try{await this.repository.appendMemory(s.name,h)}catch(m){console.warn(`Agent Fleet: failed to append memory for "${s.name}"`,m)}}if(t.tags.includes("heartbeat")&&!i&&s.heartbeatChannel&&c.output.trim())try{this.heartbeatResultHandler?.(s.name,s.heartbeatChannel,c.output)}catch(h){console.warn(`Agent Fleet: heartbeat channel delivery failed for ${s.name}`,h)}i&&(c.output="Task was manually stopped."),this.recentRuns=await this.repository.listRecentRuns(),this.runtimeState.set(s.name,{status:i||l==="success"?"idle":l==="pending_approval"?"pending":"error",currentRunId:n.runId,lastRun:{...c,filePath:d}}),i||this.notify(c)}catch(n){let i=this.consumeAborted(s.name),o=i?"cancelled":"failure",l={runId:(0,Pa.randomUUID)(),agent:s.name,task:t.taskId,status:o,started:a,completed:new Date().toISOString(),durationSeconds:Math.round((Date.now()-new Date(a).getTime())/1e3),model:s.model,exitCode:i?-1:1,tags:Array.from(new Set([...s.tags,...t.tags])),prompt:e??t.body,output:i?"Task was manually stopped.":n instanceof Error?n.message:String(n),toolsUsed:[]},c=await this.repository.writeRunLog(l);this.recentRuns=await this.repository.listRecentRuns(),this.runtimeState.set(s.name,{status:i?"idle":"error",lastRun:{...l,filePath:c}}),i||this.notify(l)}finally{this.runOutputBuffers.delete(s.name),this.runOutputListeners.delete(s.name),this.emitStatusChange()}}buildApprovals(t,e){let s=e.filter(a=>t.approvalRequired.includes(a.tool)).map(a=>({tool:a.tool,command:a.command,reason:a.reason,status:"pending"}));return s.length>0?s:void 0}resolveRunStatus(t,e){return e?.length?"pending_approval":t.timedOut?"timeout":t.exitCode===0?"success":"failure"}notify(t){if(this.settings.notificationLevel==="none"||this.settings.notificationLevel==="failures-only"&&t.status==="success")return;let s=(t.output.split(`
`).map(n=>n.trim()).find(n=>n&&!n.startsWith("{")&&!n.startsWith("["))??"").slice(0,120)||t.status,a=t.status==="success"?`\u2705 ${t.agent}: ${s}`:t.status==="pending_approval"?`\u{1F535} ${t.agent} needs approval: ${(t.approvals??[])[0]?.tool??"tool action"}`:`\u274C ${t.agent}: ${s}`;new Da.Notice(a,t.status==="success"?5e3:0)}emitStatusChange(){for(let t of this.statusChangeListeners)t()}};var hs=class{tokens=new Map;storeProbeToken(t,e){this.tokens.set(t,e)}getToken(t){return this.tokens.get(t)}hasToken(t){return this.tokens.has(t)}removeToken(t){this.tokens.delete(t)}};var Ye=require("obsidian");var Ra=require("child_process"),ot=require("obsidian");var xt=class{constructor(t,e,s,a,n){this.agent=t;this.settings=e;this.repository=s;this.vault=a,this.channelName=n?.channelName,this.conversationId=n?.conversationId,this.channelContext=n?.channelContext}messages=[];isStreaming=!1;isProcessAlive=!1;lastActiveAt=Date.now();process=null;claudeSessionId=null;vault;stdoutBuffer="";processListeners=null;basePromptSent=!1;channelName;conversationId;channelContext;activeOnEvent=null;turnResponseText="";turnToolCalls=[];pendingTurns=0;turnResolve=null;turnReject=null;async loadPersistedState(){let t=this.getChatFilePath(),e=this.vault.getAbstractFileByPath(t);if(!(e instanceof ot.TFile))return!1;try{let s=await this.vault.cachedRead(e),a=JSON.parse(s);if(a.messages?.length>0)return this.messages=a.messages,this.claudeSessionId=a.sessionId??null,this.claudeSessionId&&(this.basePromptSent=!0),!0}catch{}return!1}async persist(){let t=this.getChatFilePath(),e={sessionId:this.claudeSessionId,messages:this.messages,lastActive:new Date().toISOString()},s=JSON.stringify(e,null,2),a=this.vault.getAbstractFileByPath(t);if(a instanceof ot.TFile){await this.vault.modify(a,s);return}await this.ensureParentFolders(t),await this.vault.create(t,s)}async ensureParentFolders(t){let e=t.lastIndexOf("/");if(e<=0)return;let a=t.slice(0,e).split("/"),n="";for(let i of a)if(n=n?`${n}/${i}`:i,!this.vault.getAbstractFileByPath(n))try{await this.vault.createFolder(n)}catch(o){if(!(o instanceof Error?o.message:String(o)).includes("already exists"))throw o}}async clearPersistedState(){let t=this.getChatFilePath(),e=this.vault.getAbstractFileByPath(t);e instanceof ot.TFile&&await this.vault.delete(e),this.messages=[],this.claudeSessionId=null,this.basePromptSent=!1}getChatFilePath(){if(this.channelName&&this.conversationId){let e=this.settings.fleetFolder,s=ve(this.conversationId)||"conversation";return(0,ot.normalizePath)(`${e}/channels/${this.channelName}/sessions/${s}.json`)}if(this.agent.isFolder){let e=this.agent.filePath.replace(/\/agent\.md$/,"");return(0,ot.normalizePath)(`${e}/chat.json`)}let t=this.repository.getMemoryPath(this.agent.name).replace(/\/[^/]+$/,"");return(0,ot.normalizePath)(`${t}/${this.agent.name}-chat.json`)}async ensureProcess(){if(this.process&&this.isProcessAlive)return;let t=["--input-format","stream-json","--output-format","stream-json","--verbose"];this.claudeSessionId&&(t.push("--resume",this.claudeSessionId),this.basePromptSent=!0);let e=this.agent.model.trim();e&&e!=="default"&&e!=="subscription"&&t.push("--model",e);let s=this.agent.permissionMode?.trim();s&&s!=="default"?t.push("--permission-mode",s):t.push("--permission-mode","bypassPermissions");let a=[this.settings.claudeCliPath,...t].map(o=>`'${o.replace(/'/g,"'\\''")}'`).join(" "),n=this.agent.cwd??this.repository.getVaultBasePath()??".",i=(0,Ra.spawn)("/bin/zsh",["-l","-c",a],{cwd:n,env:{...process.env,AWS_REGION:this.settings.awsRegion}});this.process=i,this.isProcessAlive=!0,this.stdoutBuffer="",this.processListeners={onStdout:o=>this.handleStdout(o),onStderr:()=>{},onError:o=>this.handleProcessError(o),onClose:()=>this.handleProcessClose()},i.stdout.on("data",this.processListeners.onStdout),i.stderr.on("data",this.processListeners.onStderr),i.on("error",this.processListeners.onError),i.on("close",this.processListeners.onClose)}detachProcessListeners(){this.process&&this.processListeners&&(this.process.stdout?.removeListener("data",this.processListeners.onStdout),this.process.stderr?.removeListener("data",this.processListeners.onStderr),this.process.removeListener("error",this.processListeners.onError),this.process.removeListener("close",this.processListeners.onClose)),this.processListeners=null}handleStdout(t){this.stdoutBuffer+=t.toString();let e=this.stdoutBuffer.split(`
`);this.stdoutBuffer=e.pop()??"";for(let s of e){let a=s.trim();if(a)try{let n=JSON.parse(a);this.handleEvent(n)}catch{}}}handleEvent(t){if(typeof t.session_id=="string"&&(this.claudeSessionId=t.session_id),t.type==="result"){this.handleTurnEnd();return}let e=this.parseStreamEvent(t);e&&(e.type==="text"?this.turnResponseText+=e.content:e.type==="tool_use"&&e.toolName&&this.turnToolCalls.push({name:e.toolName,command:e.content||void 0}),this.activeOnEvent?.(e))}handleTurnEnd(){this.lastActiveAt=Date.now(),this.turnResponseText.trim()&&this.messages.push({role:"assistant",content:this.turnResponseText,timestamp:new Date().toISOString(),toolCalls:this.turnToolCalls.length>0?[...this.turnToolCalls]:void 0});let t={text:this.turnResponseText,toolCalls:[...this.turnToolCalls]};if(this.activeOnEvent?.({type:"result",content:"",toolCalls:[...this.turnToolCalls]}),this.turnResponseText="",this.turnToolCalls=[],this.pendingTurns--,this.pendingTurns<=0){this.pendingTurns=0,this.isStreaming=!1,this.persist();let e=this.turnResolve;this.turnResolve=null,this.turnReject=null,e?.(t)}}handleProcessError(t){this.isProcessAlive=!1,this.process=null,this.isStreaming=!1,this.pendingTurns=0,this.turnResponseText="",this.turnToolCalls=[];let e=this.turnReject;this.turnResolve=null,this.turnReject=null,e?.(t)}handleProcessClose(){if(this.isProcessAlive=!1,this.process=null,this.turnResolve){let t={text:this.turnResponseText,toolCalls:[...this.turnToolCalls]};this.turnResponseText.trim()&&this.messages.push({role:"assistant",content:this.turnResponseText,timestamp:new Date().toISOString(),toolCalls:this.turnToolCalls.length>0?[...this.turnToolCalls]:void 0}),this.isStreaming=!1,this.pendingTurns=0,this.turnResponseText="",this.turnToolCalls=[],this.persist();let e=this.turnResolve;this.turnResolve=null,this.turnReject=null,e?.(t)}}async sendMessage(t,e,s,a){this.lastActiveAt=Date.now(),this.messages.push({role:"user",content:t,timestamp:new Date().toISOString(),attachments:a&&a.length>0?a:void 0});let n=s??t;this.basePromptSent||(n=`${await this.buildBasePrompt()}

## Task
${n}`,this.basePromptSent=!0),await this.ensureProcess(),this.activeOnEvent=e,this.isStreaming=!0,this.turnResponseText="",this.turnToolCalls=[],this.pendingTurns=1;let i=JSON.stringify({type:"user",message:{role:"user",content:n}});try{this.process.stdin.write(i+`
`)}catch(o){throw this.isStreaming=!1,this.pendingTurns=0,new Error(`Failed to write to Claude process stdin: ${o instanceof Error?o.message:String(o)}`)}return new Promise((o,l)=>{this.turnResolve=o,this.turnReject=l})}injectMessage(t,e,s){if(!this.process||!this.isProcessAlive)return;this.messages.push({role:"user",content:t,timestamp:new Date().toISOString(),attachments:s&&s.length>0?s:void 0});let n=JSON.stringify({type:"user",message:{role:"user",content:e??t}});try{this.process.stdin.write(n+`
`)}catch(i){console.warn("Agent Fleet: injectMessage stdin write failed",i);return}this.pendingTurns++}abort(){this.detachProcessListeners(),this.process&&(this.process.kill(),this.process=null),this.isProcessAlive=!1,this.isStreaming=!1,this.stdoutBuffer="",this.turnResponseText="",this.turnToolCalls=[],this.pendingTurns=0;let t=this.turnReject;this.turnResolve=null,this.turnReject=null,t?.(new Error("Aborted"))}hibernate(){this.isStreaming||this.pendingTurns>0||(this.detachProcessListeners(),this.process&&(this.process.kill(),this.process=null),this.isProcessAlive=!1,this.stdoutBuffer="")}clearSessionId(){this.claudeSessionId=null,this.basePromptSent=!1}async buildBasePrompt(){let t=[this.agent.body.trim()];for(let e of this.agent.skills){let s=this.repository.getSkillByName(e);if(s){let a=[s.body.trim()];s.toolsBody.trim()&&a.push(`### Tools
${s.toolsBody.trim()}`),s.referencesBody.trim()&&a.push(`### References
${s.referencesBody.trim()}`),s.examplesBody.trim()&&a.push(`### Examples
${s.examplesBody.trim()}`),t.push(`## Skill: ${s.name}
${a.join(`

`)}`)}}if(this.agent.skillsBody.trim()&&t.push(`## Agent Skills
${this.agent.skillsBody.trim()}`),this.agent.contextBody.trim()&&t.push(`## Agent Context
${this.agent.contextBody.trim()}`),this.agent.memory){let e=await this.repository.getMemory(this.agent.name);e?.body.trim()&&t.push(`## Agent Memory
${e.body.trim()}`)}return this.channelContext&&this.channelContext.trim()&&t.push(`## Channel Context
${this.channelContext.trim()}`),t.filter(Boolean).join(`

`)}parseStreamEvent(t){let e=t.type;if(e==="assistant"){let s=t.message;if(s?.content&&Array.isArray(s.content))for(let a of s.content){if(a.type==="text"&&typeof a.text=="string")return{type:"text",content:a.text};if(a.type==="tool_use"){let n=String(a.name??"tool"),i=a.input,o=i?.command??i?.content??i?.file_path??i?.path??"";return{type:"tool_use",content:o?String(o).slice(0,150):"",toolName:n}}}}if(e==="content_block_delta"){let s=t.delta;if(s?.type==="text_delta"&&typeof s.text=="string")return{type:"text",content:s.text}}return null}};var ps=class{constructor(t){this.config=t;this.now=t.now??Date.now}buckets=new Map;now;tryConsume(t){let e=this.now(),s=e-this.config.windowMs,n=(this.buckets.get(t)??[]).filter(i=>i>s);return n.length>=this.config.maxPerWindow?(this.buckets.set(t,n),!1):(n.push(e),this.buckets.set(t,n),!0)}currentCount(t){let s=this.now()-this.config.windowMs;return(this.buckets.get(t)??[]).filter(n=>n>s).length}reset(t){this.buckets.delete(t)}resetAll(){this.buckets.clear()}};function ms(r){let t=gi(r),e=[];for(let s of t)if(s.kind==="code"){let a=s.text.replace(/^```[^\n]*\n/,"```\n");e.push(a)}else e.push(yi(s.text));return e.join("")}function gi(r){let t=[],e=0,s=!1,a=0;for(;e<r.length;)r.startsWith("```",e)?s?(e+=3,r[e]===`
`&&(e+=1),t.push({kind:"code",text:r.slice(a,e)}),a=e,s=!1):(e>a&&t.push({kind:"prose",text:r.slice(a,e)}),a=e,s=!0,e+=3):e+=1;return a<r.length&&t.push({kind:s?"code":"prose",text:r.slice(a)}),t}function yi(r){return vi(r).map(s=>{if(s.isCode)return s.text;let a=s.text;return a=a.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"),a=a.replace(/\[([^\]]+)\]\(([^)]+)\)/g,(n,i,o)=>`<${o}|${i}>`),a=a.replace(/\*\*([^*]+)\*\*/g,"*$1*"),a=a.replace(/^#{1,6}\s+(.+)$/gm,"*$1*"),a}).join("")}function vi(r){let t=[],e=/`([^`\n]+)`/g,s=0,a;for(;a=e.exec(r);)a.index>s&&t.push({text:r.slice(s,a.index),isCode:!1}),t.push({text:a[0],isCode:!0}),s=a.index+a[0].length;return s<r.length&&t.push({text:r.slice(s),isCode:!1}),t}function Ia(r,t=3e3){if(r.length<=t)return[r];let e=[],s=r;for(;s.length>t;){let a=s.slice(0,t),n=bi(a)%2===1,i;if(n){let o=wi(a);if(o>0)i=o;else{e.push(a+"\n```"),s="```\n"+s.slice(t);continue}}else{if(i=a.lastIndexOf(`

`),i<t/2){let o=a.lastIndexOf(`
`);o>t/2?i=o:i=t}i<=0&&(i=t)}e.push(s.slice(0,i)),s=s.slice(i).replace(/^\n+/,"")}return s.length>0&&e.push(s),e}function bi(r){let t=0,e=0;for(;(e=r.indexOf("```",e))!==-1;)t+=1,e+=3;return t}function wi(r){let t=0,e=0,s=0;for(;s<r.length;){let a=r.indexOf("```",s);if(a===-1)break;t+=1,s=a+3,t%2===0&&(e=s)}return e}function ki(r,t){let e=r.trim(),s=e.toLowerCase();for(let a of t){let n=a.toLowerCase(),i=[`use ${n}:`,`use ${n}`,`@${n}:`,`@${n}`,`${n}:`];for(let o of i)if(s.startsWith(o)){let l=e.slice(o.length).trim();return{agent:a,rest:l}}}return null}var fs=class{constructor(t){this.deps=t;this.now=t.now??(()=>Date.now());let e=t.getSettings();this.rateLimiter=new ps({maxPerWindow:Math.max(1,e.channelRateLimitPerConversation),windowMs:Math.max(1e3,e.channelRateLimitWindowMinutes*6e4),now:this.now})}adapters=new Map;adapterConfigs=new Map;sessions=new Map;conversationLocks=new Map;rateLimiter;metrics=new Map;statusListeners=new Set;adapterUnsubscribes=new Map;now;threadBindings=new Map;hibernationInterval=null;started=!1;async start(t){if(!this.started){this.started=!0;for(let e of t.channels)await this.bringUpChannel(e,t);this.hibernationInterval=setInterval(()=>{this.runHibernationSweep()},6e4)}}async stop(){if(!this.started)return;this.started=!1,this.hibernationInterval&&(clearInterval(this.hibernationInterval),this.hibernationInterval=null);let t=Array.from(this.adapters.values());await Promise.all(t.map(async e=>{try{await e.stop()}catch(s){console.warn(`Agent Fleet: channel adapter ${e.config.name} stop() failed`,s)}})),this.adapters.clear(),this.adapterConfigs.clear();for(let e of this.adapterUnsubscribes.values())for(let s of e)s();this.adapterUnsubscribes.clear(),this.conversationLocks.size>0&&await Promise.allSettled(Array.from(this.conversationLocks.values()));for(let e of this.sessions.values())try{e.session.isStreaming?e.session.abort():e.session.hibernate()}catch{}this.sessions.clear(),this.conversationLocks.clear(),this.conversationLockGen.clear(),this.rateLimiter.resetAll()}async reconcile(t){if(!this.started)return;let e=new Map;for(let s of t.channels)e.set(s.name,s);for(let[s,a]of this.adapters){let n=e.get(s),i=n&&this.isChannelRuntimeValid(n,t);if(!n||!n.enabled||!i){await this.tearDownChannel(s);continue}let o=this.adapterConfigs.get(s);o&&this.requiresRestart(o,n)?(await this.tearDownChannel(s),await this.bringUpChannel(n,t)):(this.adapterConfigs.set(s,n),a.config=n)}for(let[s,a]of e)!this.adapters.has(s)&&a.enabled&&this.isChannelRuntimeValid(a,t)&&await this.bringUpChannel(a,t);this.notifyStatusListeners()}getCredentials(){return this.deps.getChannelCredentials?.()??this.deps.getSettings().channelCredentials??{}}isChannelRuntimeValid(t,e){let s=e.agents.find(n=>n.name===t.defaultAgent);if(!s||s.approvalRequired.length>0)return!1;let a=this.getCredentials()[t.credentialRef];return!(!a||a.type!==t.type)}async bringUpChannel(t,e){if(!t.enabled||!this.isChannelRuntimeValid(t,e))return;let s=this.getCredentials()[t.credentialRef];if(!s)return;let a;try{a=this.deps.adapterFactory(t,s)}catch(i){console.error(`Agent Fleet: failed to build adapter for channel ${t.name}`,i);return}let n=[];n.push(a.onInbound(i=>{this.handleInbound(a,i)})),n.push(a.onStatusChange(()=>this.notifyStatusListeners())),a.onAgentSwitch&&n.push(a.onAgentSwitch((i,o,l)=>{let c=`${t.name}:${i}`;this.threadBindings.set(c,o),this.persistBindings(t.name)})),this.adapters.set(t.name,a),this.adapterConfigs.set(t.name,t),this.adapterUnsubscribes.set(t.name,n),this.ensureMetrics(t.name),await this.loadBindings(t.name);try{await a.start()}catch(i){console.error(`Agent Fleet: channel adapter ${t.name} start() failed`,i)}this.notifyStatusListeners()}async tearDownChannel(t){let e=this.adapters.get(t);if(!e)return;try{await e.stop()}catch(n){console.warn(`Agent Fleet: channel adapter ${t} stop() failed`,n)}let s=this.adapterUnsubscribes.get(t);if(s)for(let n of s)n();this.adapterUnsubscribes.delete(t),this.adapters.delete(t),this.adapterConfigs.delete(t);let a=`${t}:`;for(let[n,i]of this.sessions)if(n.startsWith(a)){try{i.session.isStreaming?i.session.abort():i.session.hibernate()}catch{}this.sessions.delete(n)}}requiresRestart(t,e){return t.type!==e.type||t.credentialRef!==e.credentialRef||JSON.stringify(t.transport)!==JSON.stringify(e.transport)}async handleInbound(t,e){let s=t.config,a=`${s.name}:${e.conversationId}`;if(!(s.allowedUsers.length>0&&(!e.externalUserId||!s.allowedUsers.includes(e.externalUserId)))){if(!this.rateLimiter.tryConsume(a)){console.warn(`Agent Fleet: rate-limited message from ${e.externalUserId} on ${s.name} (conversation ${e.conversationId})`);try{await t.send(e.conversationId,"_Rate limit exceeded. Please slow down and try again in a few minutes._")}catch(n){console.warn(`Agent Fleet: rate-limit reply failed on ${s.name}`,n)}return}await this.withConversationLock(a,async()=>{let n=this.ensureMetrics(s.name);n.messagesReceived+=1,n.lastMessageAt=this.now();let i=this.resolveAllowedAgents(s),o=ki(e.text,i),l,c;if(o){l=o.agent,c=o.rest;let u=this.threadBindings.get(a);if(this.threadBindings.set(a,l),this.persistBindings(s.name),u!==l)try{await t.setThreadTitle?.(e.conversationId,l)}catch{}if(!c){try{await t.send(e.conversationId,`_Now chatting with *${l}*. Send your next message to start._`)}catch{}return}}else{let u=`${s.name}:${e.conversationId.replace(/:thread:[^:]+$/,`:user:${e.externalUserId}`)}`;l=this.threadBindings.get(a)??this.threadBindings.get(u)??s.defaultAgent,c=e.text}try{await t.setTyping(e.conversationId,!0)}catch{}if(e.images&&e.images.length>0){let u=await this.saveInboundImages(e.images);u&&(c=u+(c||"Please analyze this image."))}let d="";try{let h=await(await this.getOrCreateSession(s,e.conversationId,l)).sendMessage(c,()=>{});if(d=h.text.trim(),h.toolCalls.length>0){let m=xi(h.toolCalls);m&&(d+=`

_${m}_`)}}catch(u){console.error(`Agent Fleet: channel turn failed on ${s.name}/${e.conversationId}`,u),d=`_Sorry \u2014 the agent run failed. ${u instanceof Error?u.message:String(u)}_`}try{d&&((s.allowedAgents.length>1||s.allowedAgents.length===0&&this.resolveAllowedAgents(s).length>1)&&(d=`*[${l}]*
${d}`),await this.deliverReply(t,e.conversationId,d),n.messagesSent+=1)}catch(u){console.error(`Agent Fleet: reply delivery failed on ${s.name}`,u)}finally{try{await t.setTyping(e.conversationId,!1)}catch{}}this.enforceHardCap()})}}async deliverReply(t,e,s){let a=Ia(s);for(let n of a)await t.send(e,n)}async saveInboundImages(t){let s=`${this.deps.getSettings().fleetFolder}/chat-images`,a=[];for(let n of t)try{this.deps.vault.getAbstractFileByPath((0,Ye.normalizePath)(s))||await this.deps.vault.createFolder((0,Ye.normalizePath)(s));let i=(0,Ye.normalizePath)(`${s}/${n.filename}`),o=i;if(this.deps.vault.getAbstractFileByPath(i)){let u=n.filename.lastIndexOf("."),h=u>0?n.filename.slice(0,u):n.filename,m=u>0?n.filename.slice(u):"";o=(0,Ye.normalizePath)(`${s}/${h}_${Date.now()}${m}`)}await this.deps.vault.createBinary(o,n.data);let c=this.deps.vault.adapter.basePath??"",d=c?`${c}/${o}`:o;a.push(`### Image: ${n.filename}
The image file is located at: ${d}
Please read and analyze this image.`)}catch(i){console.warn("Agent Fleet: failed to save inbound image",n.filename,i)}return a.length===0?"":`## Attached Images

${a.join(`

`)}

---

`}async getOrCreateSession(t,e,s){let a=`${t.name}:${e}:${s}`,n=this.sessions.get(a);if(n)return n.session;let i=this.deps.getRepository(),o=i.getAgentByName(s);if(!o)throw new Error(`Channel ${t.name} bound to missing agent ${s}`);let l=new xt(o,this.deps.getSettings(),i,this.deps.vault,{channelName:t.name,conversationId:`${e}:${s}`,channelContext:t.channelContext||void 0});try{await l.loadPersistedState()}catch{}return this.sessions.set(a,{session:l,channelName:t.name,conversationId:e,sessionKey:a}),l}resolveAllowedAgents(t){return t.allowedAgents.length>0?t.allowedAgents:this.deps.getRepository().getSnapshot().agents.filter(a=>a.enabled).map(a=>a.name)}async persistBindings(t){let e=`${t}:`,s={};for(let[o,l]of this.threadBindings)o.startsWith(e)&&(s[o.slice(e.length)]=l);let a=this.deps.getSettings(),n=(0,Ye.normalizePath)(`${a.fleetFolder}/channels/${t}/bindings.json`),i=JSON.stringify(s,null,2);try{let o=this.deps.vault.getAbstractFileByPath(n);if(o instanceof Ye.TFile)await this.deps.vault.modify(o,i);else{let l=n.slice(0,n.lastIndexOf("/"));if(!this.deps.vault.getAbstractFileByPath(l))try{await this.deps.vault.createFolder(l)}catch{}await this.deps.vault.create(n,i)}}catch(o){console.warn(`Agent Fleet: failed to persist thread bindings for ${t}`,o)}}async loadBindings(t){let e=this.deps.getSettings(),s=(0,Ye.normalizePath)(`${e.fleetFolder}/channels/${t}/bindings.json`);try{let a=this.deps.vault.getAbstractFileByPath(s);if(!(a instanceof Ye.TFile))return;let n=await this.deps.vault.cachedRead(a),i=JSON.parse(n);for(let[o,l]of Object.entries(i))typeof l=="string"&&this.threadBindings.set(`${t}:${o}`,l)}catch{}}getThreadAgent(t,e){return this.threadBindings.get(`${t}:${e}`)}enforceHardCap(){let t=Math.max(1,this.deps.getSettings().maxConcurrentChannelSessions),e=Array.from(this.sessions.values()).filter(a=>a.session.isProcessAlive&&!a.session.isStreaming);if(e.length<=t)return;e.sort((a,n)=>a.session.lastActiveAt-n.session.lastActiveAt);let s=e.length-t;for(let a=0;a<s;a+=1){let n=e[a];if(!n)break;try{n.session.hibernate()}catch{}}}async runHibernationSweep(){let t=Math.max(6e4,this.deps.getSettings().channelIdleTimeoutMinutes*6e4),e=this.now()-t;for(let s of this.sessions.values())if(s.session.isProcessAlive&&!s.session.isStreaming&&s.session.lastActiveAt<e)try{s.session.hibernate()}catch{}}async broadcastToChannel(t,e){let s=this.adapters.get(t);if(!s){console.warn(`Agent Fleet: broadcastToChannel \u2014 no adapter for channel ${t}`);return}if(!s.broadcast){console.warn(`Agent Fleet: broadcastToChannel \u2014 adapter ${t} does not support broadcast`);return}await s.broadcast(e)}conversationLockGen=new Map;async withConversationLock(t,e){let s=this.conversationLocks.get(t)??Promise.resolve(),a,n=new Promise(o=>{a=o}),i=(this.conversationLockGen.get(t)??0)+1;this.conversationLockGen.set(t,i),this.conversationLocks.set(t,s.then(()=>n));try{await s,await e()}finally{a(),this.conversationLockGen.get(t)===i&&(this.conversationLocks.delete(t),this.conversationLockGen.delete(t))}}ensureMetrics(t){let e=this.metrics.get(t);return e||(e={messagesReceived:0,messagesSent:0,lastMessageAt:null},this.metrics.set(t,e)),e}getMetrics(t){return{...this.ensureMetrics(t)}}getChannelStatus(t){let e=this.adapters.get(t);return e?e.getStatus():"disabled"}getConnectedCount(){let t=0;for(let e of this.adapters.values())e.getStatus()==="connected"&&(t+=1);return t}getSessionCount(t){let e=0,s=`${t}:`;for(let a of this.sessions.keys())a.startsWith(s)&&(e+=1);return e}onStatusChange(t){return this.statusListeners.add(t),()=>this.statusListeners.delete(t)}notifyStatusListeners(){for(let t of this.statusListeners)try{t()}catch{}}};function xi(r){if(r.length===0)return"";let t=new Map;for(let s of r)t.set(s.name,(t.get(s.name)??0)+1);let e=[];for(let[s,a]of t)e.push(a>1?`${s}\xD7${a}`:s);return`Used ${r.length} tool${r.length===1?"":"s"}: ${e.join(", ")}`}function Si(r){return r.toLowerCase().replace(/[^a-z0-9-]/g,"-").replace(/-{2,}/g,"-").replace(/^-|-$/g,"")}function Ut(r,t){return`${r}-${Si(t)}`}var St="af-channel-cred",gs=class{constructor(t){this.storage=t;t||console.warn("Agent Fleet: SecretStorage unavailable (Obsidian < 1.11.4). Secrets will use plaintext fallback.")}get available(){return!!this.storage}setJson(t,e,s){if(!this.storage)return;let a=Ut(t,e);this.storage.setSecret(a,JSON.stringify(s))}getJson(t,e){if(!this.storage)return null;let s=Ut(t,e),a=this.storage.getSecret(s);if(!a)return null;try{return JSON.parse(a)}catch{return null}}setString(t,e,s){if(!this.storage)return;let a=Ut(t,e);this.storage.setSecret(a,s)}getString(t,e){if(!this.storage)return null;let s=Ut(t,e);return this.storage.getSecret(s)||null}delete(t,e){if(!this.storage)return;let s=Ut(t,e);this.storage.setSecret(s,"")}listByPrefix(t){return this.storage?this.storage.listSecrets().filter(e=>e.startsWith(t+"-")):[]}};var ys=class{credentials=new Map;secretStore;persistCallback;setSecretStore(t){this.secretStore=t}loadCredentials(t){if(this.credentials.clear(),this.secretStore?.available){let e=this.secretStore.listByPrefix(St);for(let s of e){let a=St+"-",n=s.startsWith(a)?s.slice(a.length):s,i=this.secretStore.getJson(St,n);if(i){let o=i._ref??n,l={...i};delete l._ref,this.credentials.set(o,l)}}}if(this.credentials.size===0&&t){for(let[e,s]of Object.entries(t))this.credentials.set(e,s);this.secretStore?.available&&this.credentials.size>0&&this.persistToSecretStore()}}onChanged(t){this.persistCallback=t}get(t){return this.credentials.get(t)}set(t,e){this.credentials.set(t,e),this.persist()}delete(t){this.credentials.delete(t),this.secretStore?.delete(St,t),this.persist()}list(){return Array.from(this.credentials.entries()).map(([t,e])=>({ref:t,entry:e}))}toRecord(){let t={};for(let[e,s]of this.credentials.entries())t[e]=s;return t}persist(){this.persistToSecretStore(),this.persistCallback&&this.persistCallback(this.toRecord())}persistToSecretStore(){if(this.secretStore?.available)for(let[t,e]of this.credentials)this.secretStore.setJson(St,t,{...e,_ref:t})}};var qr=Be(An(),1),zr=Be(_s(),1),Wr=Be(_t(),1),Gr=Be(ea(),1),Vr=Be(aa(),1),Yr=Be(ca(),1),Bn=Be(Ds(),1),Kr=Be(On(),1);var ua=Bn.default;var Nn=require("obsidian");var Xr="https://slack.com/api";function Jr(r){let t=r.team??"unknown",e=r.channel??"unknown",s=r.thread_ts??r.ts??"unknown";return`slack:${t}:${e}:thread:${s}`}function Qr(r){let t=r.split(":");return t.length>=3&&t[0]==="slack"?t[2]??null:null}function Zr(r){let t=r.split(":");if(t[3]==="thread"&&t[4])return t[4]}var Is=class{type="slack";config;credential;ws=null;status="stopped";stopping=!1;backoffMs=1e3;reconnectTimer=null;inboundHandlers=new Set;statusHandlers=new Set;agentSwitchHandlers=new Set;sendQueues=new Map;threadContext=new Map;constructor(t,e){if(e.type!=="slack")throw new Error(`SlackAdapter requires a slack credential, got ${e.type}`);this.config=t,this.credential=e}async start(){this.stopping=!1,await this.connect()}async stop(){if(this.stopping=!0,this.reconnectTimer&&(clearTimeout(this.reconnectTimer),this.reconnectTimer=null),this.ws){try{this.ws.close()}catch{}this.ws=null}this.threadContext.clear(),this.sendQueues.clear(),this.setStatus("stopped")}getStatus(){return this.status}async send(t,e){let s=Qr(t);if(!s){console.warn(`Agent Fleet: could not extract channel id from ${t}`);return}let a=Zr(t),n=ms(e);await this.enqueueSend(s,async()=>{await this.slackApi("chat.postMessage",{channel:s,text:n,...a?{thread_ts:a}:{}})})}async broadcast(t){let e=this.config.allowedUsers[0];if(!e){console.warn(`Agent Fleet: broadcast on ${this.config.name} skipped \u2014 no allowed users configured`);return}try{let a=(await this.slackApi("conversations.open",{users:e})).channel?.id;if(!a){console.warn(`Agent Fleet: broadcast \u2014 conversations.open returned no channel for user ${e}`);return}let n=ms(t);await this.slackApi("chat.postMessage",{channel:a,text:n})}catch(s){console.error(`Agent Fleet: broadcast failed on ${this.config.name}`,s)}}async setThreadTitle(t,e){let s=this.threadContext.get(t);if(s)try{await this.slackApi("assistant.threads.setTitle",{channel_id:s.channelId,thread_ts:s.threadTs,title:e})}catch(a){console.warn(`Agent Fleet: assistant.threads.setTitle failed on ${this.config.name}`,a)}}async setTyping(t,e){let s=this.threadContext.get(t);if(s)try{await this.slackApi("assistant.threads.setStatus",{channel_id:s.channelId,thread_ts:s.threadTs,status:e?"is thinking...":""})}catch(a){console.warn(`Agent Fleet: assistant.threads.setStatus (${e?"on":"off"}) failed on ${this.config.name}`,a)}}onInbound(t){return this.inboundHandlers.add(t),()=>this.inboundHandlers.delete(t)}onStatusChange(t){return this.statusHandlers.add(t),()=>this.statusHandlers.delete(t)}onAgentSwitch(t){return this.agentSwitchHandlers.add(t),()=>this.agentSwitchHandlers.delete(t)}async connect(){if(this.stopping)return;this.setStatus(this.ws?"reconnecting":"connecting");let t;try{let e=await this.slackApi("apps.connections.open",{},{useAppToken:!0});if(!e.ok||!e.url)throw new Error(e.error??"apps.connections.open returned no URL");t=e.url}catch(e){console.error(`Agent Fleet: Slack apps.connections.open failed for channel ${this.config.name}`,e),this.setStatus("needs-auth"),this.scheduleReconnect();return}try{let e=new ua(t);e.on("open",()=>{}),e.on("message",n=>{this.handleSocketData(n)}),e.on("error",n=>{console.warn(`Agent Fleet: Slack WebSocket error on ${this.config.name}`,n),this.setStatus("error")}),e.on("close",()=>{this.ws=null,this.stopping||this.scheduleReconnect()}),this.ws=e;let s=setTimeout(()=>{if(this.status==="connecting"||this.status==="reconnecting"){console.warn(`Agent Fleet: Slack WebSocket connect timeout on ${this.config.name}`);try{e.close()}catch{}}},3e4);e.on("close",()=>clearTimeout(s));let a=this.onStatusChange(n=>{n==="connected"&&(clearTimeout(s),a())})}catch(e){console.error("Agent Fleet: Slack WebSocket open failed",e),this.setStatus("error"),this.scheduleReconnect();return}}handleSocketData(t){let e;try{e=JSON.parse(t.toString())}catch{return}if(e.type==="hello"){this.backoffMs=1e3,this.setStatus("connected");return}if(e.type==="disconnect"){try{this.ws?.close()}catch{}return}if(e.type==="events_api"&&e.envelope_id){this.ackEnvelope(e.envelope_id),this.routeEventPayload(e.payload);return}if(e.type==="slash_commands"&&e.envelope_id){this.ackEnvelope(e.envelope_id),this.handleSlashCommand(e.payload);return}if(e.type==="interactive"&&e.envelope_id){this.ackEnvelope(e.envelope_id),this.handleInteraction(e.payload);return}e.envelope_id&&this.ackEnvelope(e.envelope_id)}async handleSlashCommand(t){if(!t)return;let e=t.command,s=t.channel_id,a=t.user_id;if(!(!e||!s||!a)){if(e==="/agents"){let n=this.config.allowedAgents.length>0?this.config.allowedAgents:[];if(n.length===0){await this.slackApi("chat.postEphemeral",{channel:s,user:a,text:"No agents configured. Set `allowed_agents` in the channel file."});return}let i=n.map(l=>({type:"button",text:{type:"plain_text",text:l===this.config.defaultAgent?`${l} \u2713`:l,emoji:!0},action_id:`switch_agent_${l}`,value:l})),o=[{type:"section",text:{type:"mrkdwn",text:"*Select an agent to chat with:*"}}];for(let l=0;l<i.length;l+=5)o.push({type:"actions",elements:i.slice(l,l+5)});try{await this.slackApi("chat.postEphemeral",{channel:s,user:a,text:"Select an agent",blocks:o})}catch(l){console.error("Agent Fleet: /agents response failed",l)}return}try{await this.slackApi("chat.postEphemeral",{channel:s,user:a,text:`Unknown command: ${e}`})}catch(n){console.error(`Agent Fleet: slash command response failed for ${e}`,n)}}}async handleInteraction(t){if(!t||t.type!=="block_actions")return;let s=t.actions,a=t.user,n=t.channel,i=t.message;if(!s?.length||!a||!n)return;let o=s[0];if(!o)return;let l=o.action_id,c=o.value;if(!l?.startsWith("switch_agent_")||!c)return;let d=a.id,u=n.id;if(!d||!u)return;let m=`slack:${t.team?.id??"unknown"}:${u}:user:${d}`;for(let f of this.agentSwitchHandlers)try{f(m,c,d)}catch(p){console.error("Agent Fleet: agent switch handler threw",p)}try{await this.slackApi("chat.postEphemeral",{channel:u,user:d,text:`Switched to *${c}*. Send your next message to start.`})}catch(f){console.warn("Agent Fleet: agent switch confirmation failed",f)}try{await this.setThreadTitle(m,c)}catch{}}ackEnvelope(t){if(!(!this.ws||this.ws.readyState!==ua.OPEN))try{this.ws.send(JSON.stringify({envelope_id:t}))}catch(e){console.warn("Agent Fleet: Slack envelope ACK failed",e)}}routeEventPayload(t){if(!t)return;let e=t.event;if(!e)return;let s=e.type;if(s==="assistant_thread_started"){let d=e.assistant_thread;d?.channel_id&&d.thread_ts&&console.debug(`Agent Fleet: assistant thread started on ${this.config.name} (channel=${d.channel_id}, thread_ts=${d.thread_ts}, user=${d.user_id})`);return}if(s==="assistant_thread_context_changed")return;let a=e,n=s==="message"&&a.subtype===void 0,i=s==="app_mention";if(!n&&!i||a.bot_id||!a.user||!a.text||i&&(a.text=a.text.replace(/^<@[A-Z0-9]+>\s*/,"").trim(),!a.text))return;let o=Jr(a),l=a.thread_ts??a.ts;if(a.channel&&l&&(this.threadContext.set(o,{channelId:a.channel,threadTs:l}),this.threadContext.size>500)){let u=this.threadContext.keys().next();u.done||this.threadContext.delete(u.value)}let c={conversationId:o,externalUserId:a.user,text:a.text,timestamp:new Date().toISOString(),meta:{slack_channel:a.channel,slack_ts:a.ts,thread_ts:a.thread_ts}};for(let d of this.inboundHandlers)try{d(c)}catch(u){console.error("Agent Fleet: Slack inbound handler threw",u)}}scheduleReconnect(){if(this.stopping||this.reconnectTimer)return;let t=this.backoffMs;this.backoffMs=Math.min(3e4,this.backoffMs*2),console.warn(`Agent Fleet: Slack channel ${this.config.name} scheduling reconnect in ${t}ms`),this.reconnectTimer=setTimeout(()=>{this.reconnectTimer=null,!this.stopping&&this.connect()},t)}setStatus(t){if(this.status!==t){this.status=t;for(let e of this.statusHandlers)try{e(t)}catch{}}}async slackApi(t,e,s={}){let a=s.useAppToken?this.credential.appToken:this.credential.botToken,n=`${Xr}/${t}`,i=await(0,Nn.requestUrl)({url:n,method:"POST",contentType:"application/json; charset=utf-8",headers:{Authorization:`Bearer ${a}`},body:JSON.stringify(e),throw:!1});if(i.status===429){let l=Number(i.headers["retry-after"]??"1");return await new Promise(c=>setTimeout(c,Math.max(1e3,l*1e3))),this.slackApi(t,e,s)}if(i.status<200||i.status>=300)throw new Error(`Slack ${t} HTTP ${i.status}`);let o=i.json;if(o.ok===!1)throw new Error(`Slack ${t} error: ${o.error??"unknown"}`);return o}async enqueueSend(t,e){let a=(this.sendQueues.get(t)??Promise.resolve()).then(async()=>{try{await e()}finally{await new Promise(i=>setTimeout(i,1e3))}}),n=a.catch(i=>{console.warn(`Agent Fleet: Slack send queue error for ${t}`,i)});this.sendQueues.set(t,n),await a,this.sendQueues.get(t)===n&&this.sendQueues.delete(t)}};var ha=require("obsidian"),Un="https://api.telegram.org",Ls=class{type="telegram";config;credential;status="stopped";stopping=!1;pollOffset=0;pollTimer=null;backoffMs=1e3;typingIntervals=new Map;pollAbort=null;inboundHandlers=new Set;statusHandlers=new Set;agentSwitchHandlers=new Set;constructor(t,e){if(e.type!=="telegram")throw new Error(`TelegramAdapter requires a telegram credential, got ${e.type}`);this.config=t,this.credential=e}async start(){this.stopping=!1;try{let e=(await this.tgApi("getUpdates",{offset:-1,limit:1})).result?.[0];e&&(this.pollOffset=e.update_id+1)}catch{}try{await this.tgApi("setMyCommands",{commands:[{command:"agents",description:"List available agents"}]})}catch{}this.setStatus("connected"),this.poll()}async stop(){this.stopping=!0,this.pollTimer&&(clearTimeout(this.pollTimer),this.pollTimer=null),this.pollAbort?.abort(),this.pollAbort=null;for(let[,t]of this.typingIntervals)clearInterval(t);this.typingIntervals.clear(),this.setStatus("stopped")}getStatus(){return this.status}async send(t,e){let s=$n(t);if(!s)return;let a=jn(t),n=Hn(e,4096);for(let i of n)await this.tgApi("sendMessage",{chat_id:s,text:i,parse_mode:"Markdown",...a?{message_thread_id:Number(a)}:{}})}async setTyping(t,e){let s=$n(t);if(!s)return;let a=jn(t),n={chat_id:s,action:"typing"};if(a&&(n.message_thread_id=Number(a)),e){let i=this.typingIntervals.get(t);i&&clearInterval(i);try{await this.tgApi("sendChatAction",n)}catch(l){console.warn("Agent Fleet: Telegram sendChatAction failed",l)}let o=setInterval(()=>{this.tgApi("sendChatAction",n).catch(()=>{})},4500);this.typingIntervals.set(t,o)}else{let i=this.typingIntervals.get(t);i&&(clearInterval(i),this.typingIntervals.delete(t))}}async setThreadTitle(t,e){}async broadcast(t){let e=this.config.allowedUsers[0];if(e)try{let s=Hn(t,4096);for(let a of s)await this.tgApi("sendMessage",{chat_id:e,text:a,parse_mode:"Markdown"})}catch(s){console.error(`Agent Fleet: Telegram broadcast failed on ${this.config.name}`,s)}}onInbound(t){return this.inboundHandlers.add(t),()=>this.inboundHandlers.delete(t)}onStatusChange(t){return this.statusHandlers.add(t),()=>this.statusHandlers.delete(t)}onAgentSwitch(t){return this.agentSwitchHandlers.add(t),()=>this.agentSwitchHandlers.delete(t)}poll(){this.stopping||(async()=>{try{this.pollAbort=new AbortController;let t=await this.tgApi("getUpdates",{offset:this.pollOffset,timeout:30,allowed_updates:["message","callback_query"]},this.pollAbort.signal);if(t.ok&&t.result)for(let e of t.result){if(this.pollOffset=e.update_id+1,e.callback_query){this.handleCallbackQuery(e.callback_query);continue}e.message&&this.routeMessage(e.message)}this.backoffMs=1e3,this.status!=="connected"&&this.setStatus("connected")}catch(t){if(t instanceof DOMException&&t.name==="AbortError")return;if(console.warn(`Agent Fleet: Telegram poll failed on ${this.config.name}`,t),this.status!=="error"&&this.status!=="needs-auth"){let e=t instanceof Error?t.message:String(t);this.setStatus(e.includes("401")||e.includes("Unauthorized")?"needs-auth":"error")}await new Promise(e=>setTimeout(e,this.backoffMs)),this.backoffMs=Math.min(3e4,this.backoffMs*2)}this.stopping||(this.pollTimer=setTimeout(()=>this.poll(),100))})()}routeMessage(t){let e=t.photo&&t.photo.length>0,s=t.document&&this.isImageMime(t.document.mime_type),a=!!t.text;if(!t.from||!a&&!e&&!s)return;let n=t.text??t.caption??"";if(n==="/agents"||n.startsWith("/agents@")){this.handleAgentsCommand(t);return}if(n.startsWith("/"))return;let i=String(t.from.id),o=String(t.chat.id),l=t.message_thread_id?String(t.message_thread_id):void 0,c=l?`tg:${o}:topic:${l}`:`tg:${o}`;this.buildAndEmitMessage(t,n,c,i,o,l)}async buildAndEmitMessage(t,e,s,a,n,i){let o=[];try{if(t.photo&&t.photo.length>0){let c=t.photo[t.photo.length-1],d=await this.downloadFile(c.file_id,`photo_${t.message_id}.jpg`,"image/jpeg");d&&o.push(d)}if(t.document&&this.isImageMime(t.document.mime_type)){let c=t.document.file_name??`doc_${t.message_id}`,d=t.document.mime_type??"image/jpeg",u=await this.downloadFile(t.document.file_id,c,d);u&&o.push(u)}}catch(c){console.warn("Agent Fleet: Telegram image download failed",c)}let l={conversationId:s,externalUserId:a,text:e,timestamp:new Date(t.date*1e3).toISOString(),meta:{telegram_chat_id:n,telegram_message_id:t.message_id,telegram_thread_id:i,chat_type:t.chat.type},...o.length>0?{images:o}:{}};for(let c of this.inboundHandlers)try{c(l)}catch(d){console.error("Agent Fleet: Telegram inbound handler threw",d)}}async downloadFile(t,e,s){let n=(await this.tgApi("getFile",{file_id:t})).result?.file_path;if(!n)return null;let i=`${Un}/file/bot${this.credential.botToken}/${n}`;return{data:(await(0,ha.requestUrl)({url:i,method:"GET"})).arrayBuffer,filename:e,mimeType:s}}isImageMime(t){return t?t==="image/jpeg"||t==="image/png"||t==="image/gif"||t==="image/webp"||t==="image/bmp"||t==="image/tiff":!1}async handleAgentsCommand(t){let e=String(t.chat.id),s=t.message_thread_id,a=this.config.allowedAgents.length>0?this.config.allowedAgents:[];if(a.length===0){await this.tgApi("sendMessage",{chat_id:e,text:"No agents configured. Set `allowed_agents` in the channel file.",...s?{message_thread_id:s}:{}});return}let n=a.map(i=>[{text:i===this.config.defaultAgent?`${i} \u2713`:i,callback_data:`switch:${i}`}]);await this.tgApi("sendMessage",{chat_id:e,text:"*Select an agent to chat with:*",parse_mode:"Markdown",reply_markup:{inline_keyboard:n},...s?{message_thread_id:s}:{}})}async handleCallbackQuery(t){let e=t.data;if(!e?.startsWith("switch:")){await this.tgApi("answerCallbackQuery",{callback_query_id:t.id});return}let s=e.slice(7),a=String(t.from.id),n=String(t.message?.chat?.id??t.from.id),i=t.message?.message_thread_id?String(t.message.message_thread_id):void 0,o=i?`tg:${n}:topic:${i}`:`tg:${n}`;for(let l of this.agentSwitchHandlers)try{l(o,s,a)}catch(c){console.error("Agent Fleet: Telegram agent switch handler threw",c)}if(await this.tgApi("answerCallbackQuery",{callback_query_id:t.id,text:`Switched to ${s}`}),t.message){let c=(this.config.allowedAgents.length>0?this.config.allowedAgents:[]).map(d=>[{text:d===s?`${d} \u2713`:d,callback_data:`switch:${d}`}]);try{await this.tgApi("editMessageText",{chat_id:n,message_id:t.message.message_id,text:`*Active agent: ${s}*`,parse_mode:"Markdown",reply_markup:{inline_keyboard:c}})}catch{}}}async tgApi(t,e,s){if(s?.aborted)throw new DOMException("Aborted","AbortError");let a=`${Un}/bot${this.credential.botToken}/${t}`,n=(0,ha.requestUrl)({url:a,method:"POST",contentType:"application/json",body:JSON.stringify(e),throw:!1}),i;if(s?i=await Promise.race([n,new Promise((o,l)=>{s.addEventListener("abort",()=>l(new DOMException("Aborted","AbortError")),{once:!0})})]):i=await n,i.status===401||i.status===403)throw new Error(`Telegram ${t} ${i.status} Unauthorized`);if(i.status===429){let l=i.json?.parameters?.retry_after??1;return await new Promise(c=>setTimeout(c,l*1e3)),this.tgApi(t,e)}if(i.status<200||i.status>=300)throw new Error(`Telegram ${t} HTTP ${i.status}: ${i.text}`);return i.json}setStatus(t){if(this.status!==t){this.status=t;for(let e of this.statusHandlers)try{e(t)}catch{}}}};function $n(r){return r.startsWith("tg:")?r.split(":")[1]??null:null}function jn(r){let t=r.split(":");if(t[2]==="topic"&&t[3])return t[3]}function Hn(r,t){if(r.length<=t)return[r];let e=[],s=r;for(;s.length>t;){let a=s.lastIndexOf(`

`,t);a<t/2&&(a=s.lastIndexOf(`
`,t)),a<t/2&&(a=t),e.push(s.slice(0,a)),s=s.slice(a).replace(/^\n+/,"")}return s&&e.push(s),e}var Vt=require("obsidian");var Fs=class extends Vt.ItemView{constructor(e,s){super(e);this.plugin=s}getViewType(){return ut}getDisplayText(){return"Agent Fleet"}getIcon(){return"bot"}async onOpen(){this.plugin.subscribeView(this),await this.render()}async onClose(){this.plugin.unsubscribeView(this)}async render(){let e=this.contentEl;e.empty(),e.addClass("af-sidebar");let s=this.plugin.runtime.getSnapshot(),a=this.plugin.runtime.getFleetStatus(),n=e.createDiv({cls:"af-sidebar-section"});n.createDiv({cls:"af-sidebar-section-header",text:"AGENT FLEET"});let i=[{icon:"layout-dashboard",label:"Dashboard",page:"dashboard"},{icon:"bot",label:"Agents",page:"agents",badge:()=>s.agents.length},{icon:"columns-3",label:"Tasks Board",page:"kanban"},{icon:"scroll-text",label:"Run History",page:"runs"},{icon:"shield-check",label:"Approvals",page:"approvals",badge:()=>a.pending},{icon:"puzzle",label:"Skills",page:"skills",badge:()=>s.skills.length},{icon:"plug",label:"MCP Servers",page:"mcp",badge:()=>this.plugin.mcpManager.getCachedServers()?.length??0},{icon:"radio",label:"Channels",page:"channels",badge:()=>this.plugin.channelManager?.getConnectedCount()??s.channels.length}];for(let c of i){let d=n.createDiv({cls:"af-sidebar-nav-item"}),u=d.createSpan({cls:"af-sidebar-nav-icon"});(0,Vt.setIcon)(u,c.icon),d.createSpan({cls:"af-sidebar-nav-label",text:c.label});let h=c.badge?.();h!==void 0&&h>0&&d.createSpan({cls:"af-sidebar-badge",text:String(h)}),d.setAttribute("role","button"),d.setAttribute("tabindex","0"),d.onclick=()=>void this.plugin.navigateDashboard(c.page),d.onkeydown=m=>{(m.key==="Enter"||m.key===" ")&&(m.preventDefault(),this.plugin.navigateDashboard(c.page))}}let o=e.createDiv({cls:"af-sidebar-section"});o.createDiv({cls:"af-sidebar-section-header",text:"AGENTS"}),s.agents.length===0&&o.createDiv({cls:"af-sidebar-empty",text:"No agents configured"});for(let c of s.agents){let d=this.plugin.runtime.getAgentState(c.name),u=o.createDiv({cls:"af-sidebar-agent-item"});u.createSpan({cls:`af-sidebar-agent-dot ${this.healthToClass(d.status)}`}),u.createSpan({cls:"af-sidebar-agent-name",text:c.name}),u.setAttribute("role","button"),u.setAttribute("tabindex","0"),u.onclick=()=>void this.plugin.navigateDashboard("agent-detail",c.name),u.onkeydown=h=>{(h.key==="Enter"||h.key===" ")&&(h.preventDefault(),this.plugin.navigateDashboard("agent-detail",c.name))}}let l=e.createDiv({cls:"af-sidebar-section"});l.createDiv({cls:"af-sidebar-section-header",text:"QUICK ACTIONS"}),this.renderQuickAction(l,"plus","New Agent",()=>void this.plugin.createAgentTemplate()),this.renderQuickAction(l,"plus","New Task",()=>void this.plugin.openCreateTask()),this.renderQuickAction(l,"plus","New Skill",()=>void this.plugin.createSkillTemplate())}renderQuickAction(e,s,a,n){let i=e.createDiv({cls:"af-sidebar-action-item"}),o=i.createSpan({cls:"af-sidebar-action-icon"});(0,Vt.setIcon)(o,s),i.createSpan({text:a}),i.setAttribute("role","button"),i.setAttribute("tabindex","0"),i.onclick=n,i.onkeydown=l=>{(l.key==="Enter"||l.key===" ")&&(l.preventDefault(),n())}}healthToClass(e){switch(e){case"running":return"running";case"error":return"error";case"pending":return"pending";case"disabled":return"disabled";default:return"idle"}}};var b=require("obsidian");var It=require("obsidian"),eo=["bot","brain","shield-check","search","file-text","rocket","wand","sparkles","zap","target","compass","eye","code","terminal","database","globe","mail","message-circle","book","pen-tool","palette","music","camera","chart-bar","clipboard","cpu","server","cloud","lock","key","bell","calendar","clock","heart","star","flag","bookmark"],Ms=class extends It.Modal{constructor(e,s,a){super(e);this.onSelect=a;this.selectedIcon=s}searchQuery="";selectedIcon;allIcons=[];gridContainer;onOpen(){this.allIcons=(0,It.getIconIds)().sort();let{contentEl:e}=this;e.empty(),e.addClass("af-icon-picker-modal");let s=e.createEl("input",{cls:"af-icon-picker-search",attr:{type:"text",placeholder:"Search icons...",value:this.searchQuery}});this.gridContainer=e.createDiv({cls:"af-icon-picker-scroll"}),this.renderGrid(),s.addEventListener("input",()=>{this.searchQuery=s.value,this.renderGrid()}),setTimeout(()=>s.focus(),0)}renderGrid(){let e=this.gridContainer;e.empty();let s=this.searchQuery.toLowerCase().trim();if(!s)this.renderSection(e,"Popular",eo),this.renderSection(e,"All Icons",this.allIcons);else{let a=this.allIcons.filter(i=>i.includes(s)),n=a.length===0?"No results":`${a.length} result${a.length!==1?"s":""}`;this.renderSection(e,n,a)}}renderSection(e,s,a){let n=e.createDiv({cls:"af-icon-picker-section"});n.createDiv({cls:"af-icon-picker-section-label",text:s});let i=n.createDiv({cls:"af-icon-picker-grid"});for(let o of a)this.renderIconItem(i,o)}renderIconItem(e,s){let a=e.createDiv({cls:`af-icon-picker-item${this.selectedIcon===s?" selected":""}`});a.setAttribute("title",s),a.setAttribute("aria-label",s),(0,It.setIcon)(a,s),a.addEventListener("click",()=>{this.selectedIcon=s,this.onSelect(s),this.close()})}onClose(){this.contentEl.empty()}};var qn=require("obsidian");function _(r,t,e){let s=r.createSpan({cls:e??"af-icon"});return(0,qn.setIcon)(s,t),s}function Fe(r,t={}){let e=document.createElementNS("http://www.w3.org/2000/svg",r);for(let[s,a]of Object.entries(t))e.setAttribute(s,a);return e}function to(r){try{return new Date(r+"T12:00:00").toLocaleDateString(void 0,{month:"short",day:"numeric"})}catch{return r.slice(5)}}function zn(r,t){let e=t.length||1,s=1e3,a=6,n=4,i=4,o=s-n-i-a*(e-1),l=Math.floor(o/e),c=140,d=36,u=18,h=u+c+d,m=Math.max(1,...t.map(p=>p.success+p.failure+p.cancelled)),f=Fe("svg",{viewBox:`0 0 ${s} ${h}`,width:"100%",height:String(h),class:"af-chart-bar"});for(let p=0;p<=4;p++){let v=u+c-p/4*c;f.appendChild(Fe("line",{x1:String(n),y1:String(v),x2:String(s-i),y2:String(v),stroke:"var(--af-text-faint)","stroke-opacity":"0.15","stroke-width":"1"}))}for(let p=0;p<t.length;p++){let v=t[p],k=n+p*(l+a),w=v.success+v.failure+v.cancelled,g=w/m*c,y=v.success/m*c,x=v.cancelled/m*c,T=v.failure/m*c;if(v.success>0&&f.appendChild(Fe("rect",{x:String(k),y:String(u+c-y),width:String(l),height:String(Math.max(y,2)),fill:"var(--af-green)",opacity:"0.85"})),v.cancelled>0&&f.appendChild(Fe("rect",{x:String(k),y:String(u+c-y-x),width:String(l),height:String(Math.max(x,2)),fill:"var(--af-yellow)",opacity:"0.85"})),v.failure>0&&f.appendChild(Fe("rect",{x:String(k),y:String(u+c-g),width:String(l),height:String(Math.max(T,2)),fill:"var(--af-red)",opacity:"0.85"})),w===0&&f.appendChild(Fe("rect",{x:String(k),y:String(u+c-3),width:String(l),height:"3",rx:"1.5",fill:"var(--af-text-faint)",opacity:"0.2"})),w>0){let A=Fe("text",{x:String(k+l/2),y:String(u+c-g-5),"text-anchor":"middle","font-size":"10","font-weight":"600",fill:"var(--af-text-secondary)"});A.textContent=String(w),f.appendChild(A)}let C=Fe("text",{x:String(k+l/2),y:String(u+c+16),"text-anchor":"middle","font-size":"10",fill:"var(--af-text-muted)"});C.textContent=to(v.date),f.appendChild(C)}r.appendChild(f)}function Wn(r,t,e){let l=2*Math.PI*46,c=e>0?t/e:0,d=l*c,u=l-d,h=Fe("svg",{viewBox:"0 0 130 130",width:String(130),height:String(130),class:"af-chart-donut"});h.appendChild(Fe("circle",{cx:String(65),cy:String(65),r:String(46),fill:"none",stroke:e>0?"var(--af-red)":"var(--af-text-faint)","stroke-width":String(12),opacity:"0.2"})),c>0&&h.appendChild(Fe("circle",{cx:String(65),cy:String(65),r:String(46),fill:"none",stroke:"var(--af-green)","stroke-width":String(12),"stroke-dasharray":`${d} ${u}`,"stroke-dashoffset":String(l*.25),"stroke-linecap":"round"}));let m=Fe("text",{x:String(65),y:String(61),"text-anchor":"middle","dominant-baseline":"middle","font-size":"24","font-weight":"700",fill:"var(--af-text-primary)"});m.textContent=`${Math.round(c*100)}%`,h.appendChild(m);let f=Fe("text",{x:String(65),y:String(83),"text-anchor":"middle","font-size":"10",fill:"var(--af-text-muted)"});f.textContent=`${t}/${e} runs`,h.appendChild(f),r.appendChild(h)}function Gn(r,t){r.draggable=!0,r.addEventListener("dragstart",e=>{e.dataTransfer?.setData("text/plain",t),r.addClass("af-dragging")}),r.addEventListener("dragend",()=>{r.removeClass("af-dragging")})}function Vn(r,t){r.addEventListener("dragover",e=>{e.preventDefault(),r.addClass("af-drag-over")}),r.addEventListener("dragleave",e=>{let s=e.relatedTarget;(!s||!r.contains(s))&&r.removeClass("af-drag-over")}),r.addEventListener("drop",e=>{e.preventDefault();let s=e.dataTransfer?.getData("text/plain");r.removeClass("af-drag-over"),s&&t(s)})}var Yn={dashboard:"Dashboard",agents:"Agents",kanban:"Tasks Board",runs:"Run History",skills:"Skills Library",approvals:"Approvals",mcp:"MCP Servers",channels:"Channels","agent-detail":"Agent Details","task-detail":"Task Details","create-agent":"Create Agent","create-task":"Create Task","create-skill":"Create Skill","edit-agent":"Edit Agent","edit-task":"Edit Task","edit-skill":"Edit Skill","create-channel":"Create Channel","edit-channel":"Edit Channel","add-mcp-server":"Add MCP Server"},so={dashboard:"layout-dashboard",agents:"bot",kanban:"columns-3",runs:"scroll-text",skills:"puzzle",approvals:"shield-check",mcp:"plug",channels:"radio","agent-detail":"bot","task-detail":"circle-dot","create-agent":"plus","create-task":"plus","create-skill":"plus","edit-agent":"edit","edit-task":"edit","edit-skill":"edit","create-channel":"plus","edit-channel":"edit","add-mcp-server":"plus"},ao=["dashboard","agents","kanban","runs","approvals","skills","mcp","channels"],Kn={"claude-code":[{value:"default",label:"Default (subscription model)"},{value:"claude-sonnet-4-6",label:"Sonnet 4.6 (Anthropic)"},{value:"claude-opus-4-6",label:"Opus 4.6 (Anthropic)"},{value:"claude-sonnet-4-5-20250929",label:"Sonnet 4.5 (Anthropic)"},{value:"claude-opus-4-5-20251101",label:"Opus 4.5 (Anthropic)"},{value:"claude-haiku-4-5-20251001",label:"Haiku 4.5 (Anthropic)"},{value:"us.anthropic.claude-sonnet-4-6",label:"Sonnet 4.6 (Bedrock)"},{value:"us.anthropic.claude-opus-4-6-v1",label:"Opus 4.6 (Bedrock)"},{value:"us.anthropic.claude-sonnet-4-5-20250929-v1:0",label:"Sonnet 4.5 (Bedrock)"},{value:"us.anthropic.claude-opus-4-5-20251101-v1:0",label:"Opus 4.5 (Bedrock)"},{value:"us.anthropic.claude-sonnet-4-20250514-v1:0",label:"Sonnet 4 (Bedrock)"},{value:"us.anthropic.claude-opus-4-1-20250805-v1:0",label:"Opus 4.1 (Bedrock)"},{value:"us.anthropic.claude-haiku-4-5-20251001-v1:0",label:"Haiku 4.5 (Bedrock)"},{value:"us.anthropic.claude-3-5-haiku-20241022-v1:0",label:"Haiku 3.5 (Bedrock)"}],codex:[{value:"default",label:"Default (config.toml)"},{value:"gpt-5.4",label:"GPT-5.4"},{value:"o3",label:"o3"},{value:"o4-mini",label:"o4-mini"}],process:[{value:"default",label:"Default"}],http:[{value:"default",label:"Default"}]},Yt=class extends b.ItemView{constructor(e,s){super(e);this.plugin=s}currentPage="dashboard";detailContext;agentDetailTab="overview";streamingUnsubscribes=[];channelStatusUnsubscribe;authenticatingServers=new Set;getViewType(){return it}getDisplayText(){return"Agent Fleet"}getIcon(){return"bot"}async onOpen(){this.plugin.subscribeView(this),this.channelStatusUnsubscribe=this.plugin.channelManager?.onStatusChange(()=>{this.currentPage==="channels"&&this.render()}),await this.render()}async onClose(){this.cleanupStreaming(),this.channelStatusUnsubscribe?.(),this.channelStatusUnsubscribe=void 0,this.plugin.unsubscribeView(this)}navigateTo(e,s){this.currentPage=e,this.detailContext=s,e!=="agent-detail"&&(this.agentDetailTab="overview"),this.render()}async render(){this.cleanupStreaming();let e=this.contentEl;e.empty(),e.addClass("af-root");let a=e.createDiv({cls:"af-app"}).createDiv({cls:"af-main-content"});this.renderTopBar(a),this.renderTabBar(a);let n=a.createDiv({cls:"af-page"});switch(this.currentPage){case"dashboard":this.renderDashboardPage(n);break;case"agents":this.renderAgentsPage(n);break;case"kanban":this.renderKanbanPage(n);break;case"runs":this.renderRunsPage(n);break;case"skills":this.renderSkillsPage(n);break;case"approvals":this.renderApprovalsPage(n);break;case"mcp":this.renderMcpPage(n);break;case"channels":this.renderChannelsPage(n);break;case"agent-detail":this.renderAgentDetailPage(n);break;case"task-detail":this.renderTaskDetailPage(n);break;case"create-agent":this.renderCreateAgentPage(n);break;case"create-task":this.renderCreateTaskPage(n);break;case"create-skill":this.renderCreateSkillPage(n);break;case"edit-agent":this.renderEditAgentPage(n);break;case"edit-task":this.renderEditTaskPage(n);break;case"edit-skill":this.renderEditSkillPage(n);break;case"create-channel":this.renderCreateChannelPage(n);break;case"edit-channel":this.renderEditChannelPage(n);break;case"add-mcp-server":this.renderAddMcpServerPage(n);break}}navigate(e,s){this.navigateTo(e,s)}cleanupStreaming(){for(let e of this.streamingUnsubscribes)e();this.streamingUnsubscribes=[]}renderTopBar(e){let s=e.createDiv({cls:"af-top-bar"}),a=s.createDiv({cls:"af-top-bar-title"});_(a,"bot","af-top-bar-icon"),a.createSpan({text:"Agent Fleet"});let n=s.createDiv({cls:"af-breadcrumb"}),i=n.createSpan({cls:"af-breadcrumb-sep"});(0,b.setIcon)(i,"chevron-right");let o=(f,p,v)=>{let k=n.createSpan({cls:p?"af-breadcrumb-link":"",text:f});p&&(k.onclick=()=>this.navigate(p,v))},l=()=>{let f=n.createSpan({cls:"af-breadcrumb-sep"});(0,b.setIcon)(f,"chevron-right")};switch(this.currentPage){case"agent-detail":o("Agents","agents"),l(),o(this.detailContext??"Agent");break;case"task-detail":o("Tasks Board","kanban"),l(),o(this.detailContext??"Task");break;case"edit-agent":o("Agents","agents"),l(),o(this.detailContext??"Agent","agent-detail",this.detailContext),l(),o("Edit");break;case"edit-task":o("Tasks Board","kanban"),l(),o(this.detailContext??"Task","task-detail",this.detailContext),l(),o("Edit");break;case"create-agent":o("Agents","agents"),l(),o("New Agent");break;case"create-task":o("Tasks Board","kanban"),l(),o("New Task");break;case"create-skill":o("Skills Library","skills"),l(),o("New Skill");break;case"edit-skill":o("Skills Library","skills"),l(),o(this.detailContext??"Skill"),l(),o("Edit");break;case"create-channel":o("Channels","channels"),l(),o("New Channel");break;case"edit-channel":o("Channels","channels"),l(),o(this.detailContext??"Channel"),l(),o("Edit");break;case"add-mcp-server":o("MCP Servers","mcp"),l(),o("Add Server");break;default:o(Yn[this.currentPage])}s.createDiv({cls:"af-top-bar-spacer"});let c=s.createDiv({cls:"af-search-wrap"});_(c,"search","af-search-icon");let d=c.createEl("input",{cls:"af-search-input",attr:{type:"text",placeholder:"Search agents, tasks, runs..."}});d.addEventListener("input",()=>{this.handleSearch(d.value,c)}),d.addEventListener("blur",()=>{setTimeout(()=>c.querySelector(".af-search-results")?.remove(),200)});let u=this.plugin.runtime.getFleetStatus(),h=s.createDiv({cls:"af-status-pills"});if(u.running>0){let f=h.createSpan({cls:"af-pill yellow"});f.createSpan({cls:"af-dot pulse"}),f.appendText(` ${u.running} Running`)}if(u.pending>0){let f=h.createSpan({cls:"af-pill blue"});f.createSpan({cls:"af-dot"}),f.appendText(` ${u.pending} Pending`)}let m=h.createSpan({cls:"af-pill green"});m.createSpan({cls:"af-dot"}),m.appendText(` ${u.completedToday} Today`)}renderTabBar(e){let s=e.createDiv({cls:"af-tab-bar"}),a=this.plugin.runtime.getSnapshot(),n=this.plugin.runtime.getFleetStatus();for(let i of ao){let o=this.currentPage===i||i==="agents"&&(this.currentPage==="agent-detail"||this.currentPage==="edit-agent"||this.currentPage==="create-agent")||i==="kanban"&&(this.currentPage==="task-detail"||this.currentPage==="edit-task")||i==="skills"&&(this.currentPage==="edit-skill"||this.currentPage==="create-skill")||i==="mcp"&&this.currentPage==="add-mcp-server",l=s.createEl("button",{cls:`af-tab-item${o?" active":""}`}),c=l.createSpan({cls:"af-tab-icon"});if((0,b.setIcon)(c,so[i]),l.appendText(i==="dashboard"?"Overview":Yn[i]),i==="agents")l.createSpan({cls:"af-badge",text:String(a.agents.length)});else if(i==="skills")l.createSpan({cls:"af-badge",text:String(a.skills.length)});else if(i==="mcp"){let d=this.plugin.mcpManager.getCachedServers()?.length??0;l.createSpan({cls:"af-badge",text:String(d)})}else i==="approvals"&&n.pending>0&&l.createSpan({cls:"af-badge af-badge-warn",text:String(n.pending)});l.onclick=()=>this.navigate(i)}}renderDashboardPage(e){let s=e.createDiv({cls:"af-dashboard"}),a=this.plugin.runtime.getSnapshot(),n=this.plugin.runtime.getRecentRuns(),i=this.plugin.runtime.getFleetStatus(),o=n.filter(y=>(y.approvals??[]).some(x=>x.status==="pending"));for(let y of o)for(let x of y.approvals??[])x.status==="pending"&&this.renderApprovalBanner(s,y,x.tool);let l=s.createDiv({cls:"af-dash-grid"}),c=a.agents.filter(y=>y.enabled).length,d=a.agents.length;this.renderStatCard(l,"Active Agents",`${c}`,`/ ${d}`,"bot",`${c} of ${d} enabled`);let u=this.toLocalDateStr(new Date),h=n.filter(y=>this.runToLocalDate(y.started)===u),m=h.filter(y=>y.status==="success").length,f=h.filter(y=>y.status==="failure"||y.status==="timeout").length;this.renderStatCard(l,"Runs Today",String(h.length),"","activity",`${m} passed \xB7 ${f} failed \xB7 ${i.running} running`);let p=h.reduce((y,x)=>y+(x.tokensUsed??0),0),v=h.reduce((y,x)=>y+(x.costUsd??0),0),k=v>0?` \xB7 $${v.toFixed(2)}`:"";this.renderStatCard(l,"Tokens Used",pa(p),"","zap",`today${k}`);let w=a.tasks.filter(y=>y.enabled&&y.schedule);this.renderStatCard(l,"Scheduled Tasks",String(w.length),"","clock",w.length>0?`Next: ${this.getNextTaskLabel(w)}`:"No scheduled tasks"),this.renderChartsRow(s,n),this.renderStreamingCards(s);let g=s.createDiv({cls:"af-dash-split"});this.renderActivityTimeline(g,n),this.renderFleetStatusPanel(g,a)}renderChartsRow(e,s){let a=e.createDiv({cls:"af-charts-row"}),n=a.createDiv({cls:"af-section-card af-chart-section"}),o=n.createDiv({cls:"af-section-header"}).createDiv({cls:"af-section-title"});_(o,"activity"),o.appendText(" Run Activity (14d)");let l=n.createDiv({cls:"af-chart-body"}),c=this.buildChartData(s,14);c.some(v=>v.success+v.failure+v.cancelled>0)?zn(l,c):this.renderEmptyState(l,"activity","No run data","Run agents to see activity");let d=a.createDiv({cls:"af-section-card af-chart-section"}),h=d.createDiv({cls:"af-section-header"}).createDiv({cls:"af-section-title"});_(h,"target"),h.appendText(" Success Rate");let m=d.createDiv({cls:"af-chart-body af-chart-body-center"}),f=s.length,p=s.filter(v=>v.status==="success").length;f>0?Wn(m,p,f):this.renderEmptyState(m,"target","No data","")}toLocalDateStr(e){let s=a=>String(a).padStart(2,"0");return`${e.getFullYear()}-${s(e.getMonth()+1)}-${s(e.getDate())}`}runToLocalDate(e){return this.toLocalDateStr(new Date(e))}buildChartData(e,s){let a=[],n=new Date;for(let i=s-1;i>=0;i--){let o=new Date(n);o.setDate(o.getDate()-i);let l=this.toLocalDateStr(o),c=e.filter(d=>this.runToLocalDate(d.started)===l);a.push({date:l,success:c.filter(d=>d.status==="success").length,failure:c.filter(d=>d.status==="failure"||d.status==="timeout").length,cancelled:c.filter(d=>d.status==="cancelled").length})}return a}renderStreamingCards(e){let a=this.plugin.runtime.getSnapshot().agents.filter(l=>this.plugin.runtime.getAgentState(l.name).status==="running");if(a.length===0)return;let n=e.createDiv({cls:"af-streaming-section"}),o=n.createDiv({cls:"af-section-header"}).createDiv({cls:"af-section-title"});_(o,"terminal"),o.appendText(" Active Agents");for(let l of a)this.renderStreamingCard(n,l.name)}renderStreamingCard(e,s){let a=e.createDiv({cls:"af-streaming-card"}),i=this.plugin.runtime.getSnapshot().tasks.find(m=>m.agent===s),o=i?` \u2192 ${i.taskId}`:"",l=a.createDiv({cls:"af-streaming-card-header"});l.createSpan({cls:"af-dot pulse",attr:{style:"background: var(--af-yellow)"}}),l.createSpan({cls:"af-streaming-card-agent",text:` ${s}`}),o&&l.createSpan({cls:"af-streaming-card-task",text:o});let c=a.createDiv({cls:"af-streaming-output"}),u=this.plugin.runtime.getRunOutputBuffer(s).split(`
`).slice(-4);c.setText(u.join(`
`));let h=this.plugin.runtime.onRunOutput(s,()=>{let f=this.plugin.runtime.getRunOutputBuffer(s).split(`
`).slice(-4);c.setText(f.join(`
`)),c.scrollTop=c.scrollHeight});this.streamingUnsubscribes.push(h)}renderApprovalBanner(e,s,a){let n=e.createDiv({cls:"af-approval-banner"}),i=n.createDiv({cls:"af-approval-icon"});(0,b.setIcon)(i,"shield-check");let o=n.createDiv({cls:"af-approval-text"});o.createDiv({cls:"af-approval-title",text:`${s.agent} wants to run: ${a}`}),o.createDiv({cls:"af-approval-desc",text:`Approval required for tool: ${a}`});let l=n.createDiv({cls:"af-approval-actions"}),c=l.createEl("button",{cls:"af-btn-approve",text:"Approve"});c.onclick=()=>void this.plugin.runtime.resolveApproval(s,a,"approved").then(()=>this.render());let d=l.createEl("button",{cls:"af-btn-reject",text:"Reject"});d.onclick=()=>void this.plugin.runtime.resolveApproval(s,a,"rejected").then(()=>this.render())}renderStatCard(e,s,a,n,i,o){let l=e.createDiv({cls:"af-stat-card"}),c=l.createDiv({cls:"af-stat-label"});_(c,i,"af-stat-icon"),c.appendText(` ${s}`);let d=l.createDiv({cls:"af-stat-value"});d.appendText(a),n&&d.createSpan({cls:"af-stat-value-suffix",text:n}),l.createDiv({cls:"af-stat-sub",text:o})}renderActivityTimeline(e,s){let a=e.createDiv({cls:"af-section-card"}),i=a.createDiv({cls:"af-section-header"}).createDiv({cls:"af-section-title"});_(i,"inbox"),i.appendText(" Recent Activity");let o=a.createDiv({cls:"af-timeline"}),l=s.slice(0,8);if(l.length===0){this.renderEmptyState(o,"inbox","No runs yet","Run an agent to see activity here");return}for(let c of l)this.renderTimelineItem(o,c)}renderTimelineItem(e,s){let a=e.createDiv({cls:"af-timeline-item"}),n=this.statusToTimelineClass(s.status),i=a.createDiv({cls:`af-tl-icon ${n}`});(0,b.setIcon)(i,this.statusToIconName(s.status));let o=a.createDiv({cls:"af-tl-body"}),l=o.createDiv({cls:"af-tl-title"});l.createSpan({cls:"af-agent-tag",text:s.agent}),l.appendText(` ${s.task}`),o.createDiv({cls:"af-tl-desc",text:kt(s.output,100)});let c=o.createDiv({cls:"af-tl-meta"}),d=c.createSpan();if(_(d,"clock","af-meta-icon"),d.appendText(` ${this.formatStarted(s.started)} \xB7 ${this.formatDuration(s.durationSeconds)}`),s.tokensUsed){let u=c.createSpan();_(u,"zap","af-meta-icon"),u.appendText(` ${s.tokensUsed.toLocaleString()} tokens`)}a.onclick=()=>this.openSlideover(s)}renderFleetStatusPanel(e,s){let a=e.createDiv({cls:"af-section-card"}),n=a.createDiv({cls:"af-section-header"}),i=n.createDiv({cls:"af-section-title"});_(i,"bot"),i.appendText(" Fleet Status");let l=n.createDiv({cls:"af-section-actions"}).createEl("button",{cls:"af-btn-sm primary"});_(l,"plus","af-btn-icon"),l.appendText(" New Agent"),l.onclick=()=>void this.plugin.createAgentTemplate();let c=a.createDiv({cls:"af-agent-mini-list"});if(s.agents.length===0){this.renderEmptyState(c,"bot","No agents yet","Create your first agent to get started");return}for(let u of s.agents)this.renderAgentMini(c,u,s.tasks);let d=s.agents.filter(u=>u.enabled);if(d.length>0){let u=a.createDiv({cls:"af-quick-run"}),h=u.createDiv({cls:"af-quick-run-label"});_(h,"zap","af-meta-icon"),h.appendText(" Quick Run");let m=u.createDiv({cls:"af-quick-run-row"}),f=m.createEl("select",{cls:"af-select"});for(let v of d)f.createEl("option",{text:v.name,attr:{value:v.name}});let p=m.createEl("button",{cls:"af-btn-sm primary"});_(p,"play","af-btn-icon"),p.appendText(" Run"),p.onclick=()=>void this.plugin.runAgentPrompt(f.value)}}renderAgentMini(e,s,a){let n=this.plugin.runtime.getAgentState(s.name),i=a.filter(h=>h.agent===s.name),o=this.healthToClass(n.status),l=e.createDiv({cls:"af-agent-mini"}),c=l.createDiv({cls:`af-agent-avatar ${o}`});s.avatar?.trim()?this.renderAgentAvatar(c,s):c.setText(this.getInitials(s.name));let d=l.createDiv({cls:"af-agent-info"});d.createDiv({cls:"af-agent-name",text:s.name});let u="";if(n.status==="running")u=`Running now \xB7 ${i.length} task${i.length!==1?"s":""}`;else if(!s.enabled)u=`Disabled \xB7 ${i.length} task${i.length!==1?"s":""} paused`;else{let h=i.map(m=>m.nextRun).filter(Boolean).sort()[0];u=h?`Next: ${this.formatNextRun(h)} \xB7 ${i.length} task${i.length!==1?"s":""}`:`${i.length} task${i.length!==1?"s":""}`}d.createDiv({cls:"af-agent-desc",text:u}),l.createDiv({cls:`af-agent-status-dot ${o}`}),l.onclick=()=>this.navigate("agent-detail",s.name)}renderAgentsPage(e){let s=e.createDiv({cls:"af-agents-page"}),a=this.plugin.runtime.getSnapshot(),n=s.createDiv({cls:"af-agents-toolbar"});n.createDiv({cls:"af-page-title",text:"Agents"}),n.createDiv({cls:"af-toolbar-spacer"});let i=n.createEl("button",{cls:"af-btn-sm primary"});_(i,"plus","af-btn-icon"),i.appendText(" New Agent"),i.onclick=()=>void this.plugin.createAgentTemplate();let o=s.createDiv({cls:"af-agents-grid"});if(a.agents.length===0){this.renderEmptyState(o,"bot","No agents configured","Create your first agent to get started");return}for(let l of a.agents)this.renderAgentCard(o,l,a)}renderAgentCard(e,s,a){let n=this.plugin.runtime.getAgentState(s.name),i=this.plugin.runtime.getRecentRuns().filter(E=>E.agent===s.name),o=a.tasks.filter(E=>E.agent===s.name),l=e.createDiv({cls:`af-agent-card${s.enabled?"":" disabled"}`}),c=l.createDiv({cls:"af-agent-card-header"}),d=s.enabled?this.healthToClass(n.status):"disabled",u=c.createDiv({cls:`af-agent-card-avatar ${d}`});this.renderAgentAvatar(u,s);let h=c.createDiv({cls:"af-agent-card-titleblock"}),m=h.createDiv({cls:"af-agent-card-name"});if(m.appendText(s.name),s.heartbeatEnabled&&s.heartbeatSchedule){let E=m.createSpan({cls:"af-heartbeat-indicator"});(0,b.setIcon)(E,"heart-pulse"),E.title=`Heartbeat: ${s.heartbeatSchedule}`}h.createDiv({cls:"af-agent-card-desc",text:s.description??"No description"});let f=c.createDiv({cls:`af-agent-card-toggle${s.enabled?" on":""}`});f.onclick=E=>{E.stopPropagation(),this.plugin.toggleAgent(s.name,!s.enabled)};let p=l.createDiv({cls:"af-agent-card-stats"}),v=i.length,k=i.filter(E=>E.status==="success").length,w=v>0?Math.round(k/v*100):0,g=v>0?Math.round(i.reduce((E,R)=>E+R.durationSeconds,0)/v):0,y=i.reduce((E,R)=>E+(R.tokensUsed??0),0);if(this.renderAgentStat(p,String(v),"Runs"),this.renderAgentStat(p,`${w}%`,"Success"),this.renderAgentStat(p,`${g}s`,"Avg Time"),this.renderAgentStat(p,pa(y),"Tokens"),s.skills.length>0){let E=l.createDiv({cls:"af-agent-card-skills"});for(let R of s.skills)E.createSpan({cls:"af-skill-tag",text:R})}let x=l.createDiv({cls:"af-agent-card-footer"}),T=[`Model: ${s.model}`];s.approvalRequired.length>0&&T.push(`Approval: ${s.approvalRequired.join(", ")}`),s.memory&&T.push("Memory: on"),s.enabled||T.unshift("Disabled"),x.createSpan({cls:"af-agent-card-meta",text:T.join(" \xB7 ")});let C=x.createDiv({cls:"af-agent-card-actions"});if(!s.enabled){let E=C.createEl("button",{cls:"af-btn-sm",text:"Enable"});E.onclick=R=>{R.stopPropagation(),this.plugin.toggleAgent(s.name,!0)}}let A=C.createEl("button",{cls:"af-btn-sm"});if(_(A,"edit","af-btn-icon"),A.appendText(" Edit"),A.onclick=E=>{E.stopPropagation(),this.navigate("edit-agent",s.name)},s.enabled){let E=C.createEl("button",{cls:"af-btn-sm primary"});_(E,"play","af-btn-icon"),E.appendText(" Run"),E.onclick=R=>{R.stopPropagation(),this.plugin.runAgentPrompt(s.name)}}l.onclick=()=>this.navigate("agent-detail",s.name)}renderAgentStat(e,s,a){let n=e.createDiv({cls:"af-agent-stat"});n.createSpan({cls:"af-agent-stat-value",text:s}),n.createSpan({cls:"af-agent-stat-label",text:a})}renderAgentDetailPage(e){let s=e.createDiv({cls:"af-agent-detail-page"}),a=this.detailContext;if(!a){this.renderEmptyState(s,"bot","No agent selected","Select an agent from the list");return}let n=this.plugin.runtime.getSnapshot().agents.find(g=>g.name===a);if(!n){this.renderEmptyState(s,"bot","Agent not found",`Agent "${a}" was not found`);return}let i=this.plugin.runtime.getAgentState(n.name),o=this.plugin.runtime.getRecentRuns().filter(g=>g.agent===n.name),l=s.createDiv({cls:"af-detail-header"}),c=l.createDiv({cls:"af-detail-header-left"}),d=c.createDiv({cls:`af-agent-card-avatar ${this.healthToClass(i.status)}`});this.renderAgentAvatar(d,n);let u=c.createDiv();u.createDiv({cls:"af-detail-header-name",text:n.name}),u.createDiv({cls:"af-detail-header-desc",text:n.description??"No description"});let h=l.createDiv({cls:"af-detail-header-actions"}),m=h.createEl("button",{cls:"af-btn-sm primary"});if(_(m,"message-circle","af-btn-icon"),m.appendText(" Chat"),m.onclick=()=>this.openChatSlideover(n),n.enabled){let g=h.createEl("button",{cls:"af-btn-sm"});_(g,"play","af-btn-icon"),g.appendText(" Run Now"),g.onclick=()=>void this.plugin.runAgentPrompt(n.name);let y=h.createEl("button",{cls:"af-btn-sm"});_(y,"pause","af-btn-icon"),y.appendText(" Disable"),y.onclick=()=>void this.plugin.toggleAgent(n.name,!1)}else{let g=h.createEl("button",{cls:"af-btn-sm"});_(g,"play","af-btn-icon"),g.appendText(" Enable"),g.onclick=()=>void this.plugin.toggleAgent(n.name,!0)}let f=h.createEl("button",{cls:"af-btn-sm"});_(f,"edit","af-btn-icon"),f.appendText(" Edit"),f.onclick=()=>this.navigate("edit-agent",n.name);let p=h.createEl("button",{cls:"af-btn-sm danger"});_(p,"trash-2","af-btn-icon"),p.appendText(" Delete"),p.onclick=()=>void this.plugin.deleteAgent(n.name);let v=s.createDiv({cls:"af-detail-tabs"}),k=[{id:"overview",label:"Overview",icon:"layout-dashboard"},{id:"config",label:"Config",icon:"settings"},{id:"runs",label:"Runs",icon:"scroll-text"},{id:"memory",label:"Memory",icon:"file-text"}];for(let g of k){let y=v.createEl("button",{cls:`af-detail-tab${this.agentDetailTab===g.id?" active":""}`});_(y,g.icon,"af-tab-icon"),y.appendText(` ${g.label}`),y.onclick=()=>{this.agentDetailTab=g.id,this.render()}}let w=s.createDiv({cls:"af-detail-tab-content"});switch(this.agentDetailTab){case"overview":this.renderAgentOverviewTab(w,n,o);break;case"config":this.renderAgentConfigTab(w,n);break;case"runs":this.renderAgentRunsTab(w,o);break;case"memory":this.renderAgentMemoryTab(w,n);break}}renderAgentOverviewTab(e,s,a){let n=e.createDiv({cls:"af-dash-grid"}),i=a.length,o=a.filter(g=>g.status==="success").length,l=i>0?Math.round(o/i*100):0,c=i>0?Math.round(a.reduce((g,y)=>g+y.durationSeconds,0)/i):0,d=a.reduce((g,y)=>g+(y.tokensUsed??0),0),u=a.reduce((g,y)=>g+(y.costUsd??0),0),h=u>0?` \xB7 $${u.toFixed(2)}`:"";if(this.renderStatCard(n,"Total Runs",String(i),"","activity","all time"),this.renderStatCard(n,"Success Rate",`${l}%`,"","check-circle-2",`${o}/${i}`),this.renderStatCard(n,"Avg Time",`${c}s`,"","clock","per run"),this.renderStatCard(n,"Total Tokens",pa(d),"","zap",`all time${h}`),s.isFolder&&(s.heartbeatBody.trim()||s.heartbeatEnabled)){let g=e.createDiv({cls:"af-section-card"}),y=g.createDiv({cls:"af-section-header"}),x=y.createDiv({cls:"af-section-title"});_(x,"heart-pulse"),x.appendText(" Heartbeat");let C=y.createDiv({cls:"af-detail-header-actions"}).createDiv({cls:`af-agent-card-toggle${s.heartbeatEnabled?" on":""}`});C.onclick=async()=>{let R=C.hasClass("on");await this.plugin.repository.updateHeartbeat(s.name,{enabled:!R}),await this.plugin.refreshFromVault(),new b.Notice(`Heartbeat ${R?"paused":"enabled"} for ${s.name}`)};let A=g.createDiv({cls:"af-config-form"});this.renderConfigRow(A,"Schedule",no(s.heartbeatSchedule));let E=this.plugin.runtime.getNextHeartbeat(s.name);E&&s.heartbeatEnabled&&this.renderConfigRow(A,"Next run",this.timeUntil(E)),s.heartbeatChannel&&this.renderConfigRow(A,"Channel",s.heartbeatChannel)}if(s.skills.length>0){let g=e.createDiv({cls:"af-section-card"}),x=g.createDiv({cls:"af-section-header"}).createDiv({cls:"af-section-title"});_(x,"puzzle"),x.appendText(" Skills");let T=g.createDiv({cls:"af-detail-skills-list"});for(let C of s.skills)T.createSpan({cls:"af-skill-tag",text:C})}let m=s.mcpServers??[];if(m.length>0){let g=e.createDiv({cls:"af-section-card"}),x=g.createDiv({cls:"af-section-header"}).createDiv({cls:"af-section-title"});_(x,"plug"),x.appendText(" MCP Servers");let T=g.createDiv({cls:"af-mcp-overview-list"}),C=this.plugin.mcpManager.getCachedServers();for(let A of m){let E=C?.find(K=>K.name===A),R=T.createDiv({cls:"af-mcp-overview-row"}),U=R.createSpan({cls:`af-mcp-status-dot ${E?E.enabled?E.status:"disabled":"disconnected"}`});U.title=E?E.enabled?E.status:"disabled":"unknown",R.createSpan({cls:"af-mcp-overview-name",text:A});let D=E?.toolDetails.length??E?.tools.length??0;D>0?R.createSpan({cls:"af-mcp-overview-tools",text:`${D} tools`}):E&&!E.enabled?R.createSpan({cls:"af-mcp-overview-tools af-muted",text:"disabled"}):E?.status==="needs-auth"&&R.createSpan({cls:"af-mcp-overview-tools af-muted",text:"needs auth"})}}if(s.permissionRules.allow.length>0||s.permissionRules.deny.length>0||s.permissionMode&&s.permissionMode!=="default"){let g=e.createDiv({cls:"af-section-card"}),x=g.createDiv({cls:"af-section-header"}).createDiv({cls:"af-section-title"});_(x,"shield-check"),x.appendText(" Permissions");let T=g.createDiv({cls:"af-config-form"});this.renderConfigRow(T,"Mode",s.permissionMode||"default"),s.permissionRules.allow.length>0&&this.renderConfigRow(T,"Allowed",s.permissionRules.allow.join(", ")),s.permissionRules.deny.length>0&&this.renderConfigRow(T,"Denied",s.permissionRules.deny.join(", "))}let p=e.createDiv({cls:"af-section-card"}),k=p.createDiv({cls:"af-section-header"}).createDiv({cls:"af-section-title"});_(k,"scroll-text"),k.appendText(" Recent Runs");let w=p.createDiv({cls:"af-timeline"});if(a.length===0)this.renderEmptyState(w,"scroll-text","No runs yet","");else for(let g of a.slice(0,5))this.renderTimelineItem(w,g)}renderAgentConfigTab(e,s){let a=e.createDiv({cls:"af-config-form"});this.renderConfigRow(a,"Name",s.name),this.renderConfigRow(a,"Description",s.description??""),this.renderConfigRow(a,"Model",s.model),this.renderConfigRow(a,"Timeout",`${s.timeout}s`),this.renderConfigRow(a,"Working Directory",s.cwd??"(vault root)"),this.renderConfigRow(a,"Permission Mode",s.permissionMode||"default"),this.renderConfigRow(a,"Approval Required",s.approvalRequired.join(", ")||"none"),s.permissionRules.allow.length>0&&this.renderConfigRow(a,"Allowed Commands",s.permissionRules.allow.join(", ")),s.permissionRules.deny.length>0&&this.renderConfigRow(a,"Blocked Commands",s.permissionRules.deny.join(", ")),this.renderConfigRow(a,"Memory",s.memory?"Enabled":"Disabled"),this.renderConfigRow(a,"Tags",s.tags.join(", ")||"none");let n=a.createDiv({cls:"af-config-prompt-section"});if(n.createDiv({cls:"af-slideover-section-title",text:"SYSTEM PROMPT"}),n.createDiv({cls:"af-output-block",text:s.body||"(empty)"}),s.heartbeatBody.trim()){let l=a.createDiv({cls:"af-config-prompt-section"});l.createDiv({cls:"af-slideover-section-title",text:"HEARTBEAT INSTRUCTION"}),l.createDiv({cls:"af-output-block",text:s.heartbeatBody})}let o=a.createDiv({cls:"af-slideover-actions"}).createEl("button",{cls:"af-btn-sm primary"});_(o,"edit","af-btn-icon"),o.appendText(" Edit Agent"),o.onclick=()=>this.navigate("edit-agent",s.name)}renderConfigRow(e,s,a){let n=e.createDiv({cls:"af-detail-row"});n.createSpan({cls:"af-detail-label",text:s}),n.createSpan({cls:"af-detail-value af-mono",text:a})}renderAgentRunsTab(e,s){if(s.length===0){this.renderEmptyState(e,"scroll-text","No runs yet","Run this agent to see history");return}for(let a of s){let n=e.createDiv({cls:"af-run-list-item"}),i=n.createDiv({cls:`af-tl-icon ${this.statusToTimelineClass(a.status)}`});(0,b.setIcon)(i,this.statusToIconName(a.status));let o=n.createDiv({cls:"af-tl-body"}),l=o.createDiv({cls:"af-tl-title"});l.createSpan({text:a.task}),l.createSpan({cls:`af-status-badge ${this.statusToBadgeClass(a.status)}`,text:this.statusToBadgeText(a.status)});let c=o.createDiv({cls:"af-tl-meta"});c.createSpan({text:`${this.formatStarted(a.started)} \xB7 ${this.formatDuration(a.durationSeconds)}`}),a.tokensUsed&&c.createSpan({text:`${a.tokensUsed.toLocaleString()} tokens`}),o.createDiv({cls:"af-tl-desc",text:kt(a.output,120)}),n.onclick=()=>this.openSlideover(a)}}async renderAgentMemoryTab(e,s){if(!s.memory){this.renderEmptyState(e,"file-text","Memory disabled","Enable memory in agent config");return}let a=await this.plugin.repository.getMemory(s.name);if(!a||!a.body.trim()){this.renderEmptyState(e,"file-text","No memories yet","Agent will learn from runs");return}e.createDiv({cls:"af-output-block"}).setText(a.body);let o=e.createDiv({cls:"af-slideover-actions"}).createEl("button",{cls:"af-btn-sm"});_(o,"external-link","af-btn-icon"),o.appendText(" Open in Editor"),o.onclick=()=>void this.plugin.openPath(this.plugin.repository.getMemoryPath(s.name))}timeAgo(e){let s=Math.round((Date.now()-e.getTime())/1e3);if(s<60)return"just now";let a=Math.round(s/60);if(a<60)return`${a}m ago`;let n=Math.round(a/60);return n<24?`${n}h ago`:`${Math.round(n/24)}d ago`}timeUntil(e){let s=Math.round((e.getTime()-Date.now())/1e3);if(s<60)return"< 1m";let a=Math.round(s/60);if(a<60)return`in ${a}m`;let n=Math.round(a/60);return n<24?`in ${n}h`:`in ${Math.round(n/24)}d`}renderKanbanPage(e){let s=e.createDiv({cls:"af-kanban-page"}),a=this.plugin.runtime.getSnapshot(),n=this.plugin.runtime.getRecentRuns(),i=s.createDiv({cls:"af-kanban-toolbar"});i.createDiv({cls:"af-page-title",text:"Tasks Board"}),i.createDiv({cls:"af-toolbar-spacer"});let o=i.createEl("button",{cls:"af-btn-sm primary"});_(o,"plus","af-btn-icon"),o.appendText(" New Task"),o.onclick=()=>this.navigate("create-task");let l=s.createDiv({cls:"af-kanban-board"}),c=[],d=[],u=[],h=[],m=[],f=new Set;for(let w of a.agents)this.plugin.runtime.getAgentState(w.name).status==="running"&&f.add(w.name);let p=this.toLocalDateStr(new Date);for(let w of n)w.status==="success"&&this.runToLocalDate(w.started)===p?h.push(w):(w.status==="failure"||w.status==="timeout"||w.status==="cancelled")&&this.runToLocalDate(w.started)===p&&m.push(w);let v=new Set(h.map(w=>w.task)),k=new Set(m.map(w=>w.task));for(let w of a.tasks){let g=v.has(w.taskId)||k.has(w.taskId)||w.lastRun&&this.runToLocalDate(w.lastRun)===p;if(f.has(w.agent))u.push(w);else{if(g&&!w.schedule)continue;w.schedule&&w.enabled?d.push(w):c.push(w)}}this.renderKanbanColumn(l,"Backlog","inbox",c.length,w=>{for(let g of c)this.renderKanbanTaskCard(w,g,a,!0)},"backlog"),this.renderKanbanColumn(l,"Scheduled","clock",d.length,w=>{for(let g of d)this.renderKanbanTaskCard(w,g,a,!0)},"scheduled"),this.renderKanbanColumn(l,"Running","loader-2",u.length,w=>{for(let g of u)this.renderKanbanRunningCard(w,g)},"running",!1,"running"),this.renderKanbanColumn(l,"Done","check-circle-2",h.length,w=>{for(let g of h.slice(0,10))this.renderKanbanCompletedCard(w,g)},"completed"),this.renderKanbanColumn(l,"Failed","x-circle",m.length,w=>{for(let g of m)this.renderKanbanFailedCard(w,g)},"failed",!1,"failed")}renderKanbanColumn(e,s,a,n,i,o,l=!1,c){let d=e.createDiv({cls:`af-kanban-column${c?` af-kanban-${c}`:""}`});(o==="backlog"||o==="scheduled")&&Vn(d,f=>this.handleTaskDrop(f,o));let h=d.createDiv({cls:"af-kanban-col-header"}).createDiv({cls:"af-kanban-col-title"});_(h,a),h.appendText(` ${s} `),h.createSpan({cls:"af-kanban-col-count",text:String(n)});let m=d.createDiv({cls:"af-kanban-col-body"});if(i(m),n===0&&m.createDiv({cls:"af-kanban-empty",text:"No items"}),l){let p=d.createDiv({cls:"af-kanban-col-add"}).createEl("button");_(p,"plus","af-btn-icon"),p.appendText(" Add task"),p.onclick=()=>{this.navigate("create-task")}}}handleTaskDrop(e,s){let a=this.plugin.runtime.getSnapshot().tasks.find(n=>n.taskId===e);if(a){if(s==="backlog")this.setTaskEnabled(a,!1).then(()=>{new b.Notice(`Task "${e}" moved to backlog (disabled)`)});else if(s==="scheduled"){if(!a.schedule&&!a.runAt){new b.Notice(`Task "${e}" needs a schedule. Open task details to set one.`),this.navigate("task-detail",e);return}this.setTaskEnabled(a,!0).then(()=>{new b.Notice(`Task "${e}" moved to scheduled (enabled)`)})}}}async setTaskEnabled(e,s){let a=this.plugin.app.vault.getAbstractFileByPath(e.filePath);if(!a||!(a instanceof b.TFile))return;let n=await this.plugin.app.vault.cachedRead(a),{frontmatter:i,body:o}=se(n);i.enabled=s,await this.plugin.app.vault.modify(a,ee(i,o)),await this.plugin.refreshFromVault()}renderKanbanTaskCard(e,s,a,n){let i=e.createDiv({cls:`af-kanban-card af-priority-${s.priority}`});if(n){Gn(i,s.taskId);let p=i.createDiv({cls:"af-kanban-card-grip"});(0,b.setIcon)(p,"grip-vertical")}let o=i.createDiv({cls:"af-kanban-card-header"});o.createDiv({cls:"af-kanban-card-title",text:s.taskId});let c=(a.agents.find(p=>p.name===s.agent)?.enabled??!1)&&s.enabled,d=o.createSpan({cls:`af-kanban-card-status ${c?"active":"inactive"}`});d.title=c?"Active":"Inactive";let u=i.createDiv({cls:"af-kanban-card-agent"}),h=u.createSpan({cls:"af-kanban-card-agent-icon"});(0,b.setIcon)(h,"bot"),u.createSpan({cls:"af-kanban-card-agent-name",text:s.agent});let f=i.createDiv({cls:"af-kanban-card-footer"}).createSpan({cls:"af-kanban-card-schedule"});c?s.schedule?(_(f,"refresh-cw","af-meta-icon"),f.appendText(` ${this.humanizeCron(s.schedule)}`)):f.appendText(s.runAt??"Manual"):(_(f,"pause","af-meta-icon"),f.appendText(" Paused")),i.onclick=()=>this.navigate("task-detail",s.taskId)}renderKanbanRunningCard(e,s){let a=e.createDiv({cls:"af-kanban-card af-kanban-card-running"});a.createDiv({cls:"af-kanban-card-title",text:s.taskId});let n=a.createDiv({cls:"af-kanban-card-agent"}),i=n.createSpan({cls:"af-kanban-card-agent-icon"});(0,b.setIcon)(i,"bot"),n.createSpan({cls:"af-kanban-card-agent-name",text:s.agent});let l=this.plugin.runtime.getSnapshot().agents.find(x=>x.name===s.agent)?.timeout??300,c=this.plugin.runtime.getAgentState(s.agent),d=c.runStarted?new Date(c.runStarted).getTime():Date.now(),m=a.createDiv({cls:"af-kanban-progress"}).createDiv({cls:"af-kanban-progress-track"}).createDiv({cls:"af-kanban-progress-bar af-kanban-progress-bar-real"}),f=(Date.now()-d)/1e3,p=Math.min(95,f/l*100);m.style.width=`${p}%`;let v=a.createDiv({cls:"af-kanban-card-footer"}),k=v.createSpan({cls:"af-kanban-card-schedule"});_(k,"loader-2","af-meta-icon");let w=Math.round(f);k.appendText(` ${w}s / ${l}s`);let g=v.createEl("button",{cls:"af-kanban-stop-btn"});(0,b.setIcon)(g,"square"),g.title="Stop task",g.onclick=x=>{x.stopPropagation(),this.plugin.runtime.abortAgentRun(s.agent),new b.Notice(`Stopped task "${s.taskId}"`)};let y=setInterval(()=>{let x=(Date.now()-d)/1e3,T=Math.min(95,x/l*100);m.style.width=`${T}%`;let C=Math.round(x);k.textContent="",(0,b.setIcon)(k,"loader-2"),k.appendText(` ${C}s / ${l}s`)},1e3);this.streamingUnsubscribes.push(()=>clearInterval(y))}renderKanbanCompletedCard(e,s){let a=e.createDiv({cls:"af-kanban-card"});a.createDiv({cls:"af-kanban-card-title",text:s.task});let n=a.createDiv({cls:"af-kanban-card-agent"}),i=n.createSpan({cls:"af-kanban-card-agent-icon"});(0,b.setIcon)(i,"bot"),n.createSpan({cls:"af-kanban-card-agent-name",text:s.agent});let l=a.createDiv({cls:"af-kanban-card-footer"}).createSpan({cls:"af-kanban-card-schedule"});_(l,"check-circle-2","af-meta-icon"),l.appendText(` ${this.formatStarted(s.started)} \xB7 ${this.formatDuration(s.durationSeconds)}`),a.onclick=()=>this.openSlideover(s)}renderKanbanFailedCard(e,s){let a=s.status==="cancelled",n=e.createDiv({cls:`af-kanban-card ${a?"af-kanban-card-cancelled":"af-kanban-card-failed"}`});n.createDiv({cls:"af-kanban-card-title",text:s.task});let i=n.createDiv({cls:"af-kanban-card-agent"}),o=i.createSpan({cls:"af-kanban-card-agent-icon"});(0,b.setIcon)(o,"bot"),i.createSpan({cls:"af-kanban-card-agent-name",text:s.agent});let l=a?`Stopped after ${s.durationSeconds}s`:s.status==="timeout"?`Timeout after ${s.durationSeconds}s`:kt(s.output,60),c=n.createDiv({cls:"af-kanban-card-error"});_(c,a?"square":"alert-triangle","af-meta-icon"),c.appendText(` ${l}`);let d=n.createDiv({cls:"af-kanban-card-footer"}),u=d.createSpan({cls:"af-kanban-card-schedule"});if(_(u,a?"square":"x-circle","af-meta-icon"),u.appendText(` ${this.formatStarted(s.started)}`),!a){let h=d.createEl("button",{cls:"af-btn-sm"});_(h,"refresh-cw","af-btn-icon"),h.appendText(" Retry"),h.onclick=m=>{m.stopPropagation(),this.plugin.runAgentPrompt(s.agent)}}n.onclick=()=>this.openSlideover(s)}renderRunsPage(e){let s=e.createDiv({cls:"af-runs-page"}),a=this.plugin.runtime.getRecentRuns(),n=s.createDiv({cls:"af-runs-toolbar"});n.createDiv({cls:"af-page-title",text:"Run History"}),n.createDiv({cls:"af-toolbar-spacer"});let i=s.createDiv({cls:"af-runs-table"});if(a.length===0){this.renderEmptyState(i,"scroll-text","No runs yet","Run an agent to see history here");return}let o=i.createEl("table"),c=o.createEl("thead").createEl("tr");for(let u of["Status","Agent","Task","Started","Duration","Tokens","Model"])c.createEl("th",{text:u});let d=o.createEl("tbody");for(let u of a.slice(0,50))this.renderRunRow(d,u)}renderRunRow(e,s){let a=e.createEl("tr"),i=a.createEl("td").createSpan({cls:`af-status-badge ${this.statusToBadgeClass(s.status)}`}),o=i.createSpan();(0,b.setIcon)(o,this.statusToIconName(s.status)),i.appendText(` ${this.statusToBadgeText(s.status)}`);let l=a.createEl("td",{cls:"af-agent-link"});l.setText(s.agent),l.onclick=c=>{c.stopPropagation(),this.navigate("agent-detail",s.agent)},a.createEl("td",{text:s.task}),a.createEl("td",{cls:"af-mono",text:this.formatStarted(s.started)}),a.createEl("td",{cls:"af-mono",text:this.formatDuration(s.durationSeconds)}),a.createEl("td",{cls:"af-mono",text:s.tokensUsed?s.tokensUsed.toLocaleString():"\u2014"}),a.createEl("td",{cls:"af-mono",text:s.model}),a.style.cursor="pointer",a.onclick=()=>this.openSlideover(s)}renderSkillsPage(e){let s=e.createDiv({cls:"af-skills-page"}),a=this.plugin.runtime.getSnapshot(),n=s.createDiv({cls:"af-agents-toolbar"});n.createDiv({cls:"af-page-title",text:"Skills Library"}),n.createDiv({cls:"af-toolbar-spacer"});let i=n.createEl("button",{cls:"af-btn-sm primary"});_(i,"plus","af-btn-icon"),i.appendText(" New Skill"),i.onclick=()=>void this.plugin.createSkillTemplate();let o=s.createDiv({cls:"af-skills-grid"});if(a.skills.length===0){this.renderEmptyState(o,"puzzle","No skills yet","Create skills to give agents specialized abilities");return}for(let l of a.skills)this.renderSkillCard(o,l,a.agents)}renderSkillCard(e,s,a){let n=e.createDiv({cls:"af-skill-card"}),i=n.createDiv({cls:"af-skill-card-header"}),o=i.createDiv({cls:"af-skill-card-icon"});(0,b.setIcon)(o,this.getSkillIcon(s.name));let l=i.createEl("button",{cls:"af-btn-sm af-btn-xs"});_(l,"edit","af-btn-icon"),l.onclick=d=>{d.stopPropagation(),this.navigate("edit-skill",s.name)},n.createDiv({cls:"af-skill-card-name",text:s.name}),n.createDiv({cls:"af-skill-card-desc",text:s.description??"No description"});let c=a.filter(d=>d.skills.includes(s.name));if(c.length>0){let d=n.createDiv({cls:"af-skill-card-agents"});for(let u of c)d.createSpan({cls:"af-skill-card-agent-tag",text:u.name})}}renderChannelsPage(e){let s=e.createDiv({cls:"af-agents-page"}),a=this.plugin.runtime.getSnapshot(),n=s.createDiv({cls:"af-agents-toolbar"});n.createDiv({cls:"af-page-title",text:"Channels"}),n.createDiv({cls:"af-toolbar-spacer"});let i=n.createEl("button",{cls:"af-btn-sm primary"});_(i,"plus","af-btn-icon"),i.appendText(" New Channel"),i.onclick=()=>this.navigate("create-channel");let o=s.createDiv({cls:"af-agents-grid"});if(a.channels.length===0){this.renderEmptyState(o,"radio","No channels configured","Connect an agent to Slack or another chat platform");return}for(let l of a.channels)this.renderChannelCard(o,l,a.validationIssues)}renderChannelCard(e,s,a){let n=this.plugin.channelManager?.getChannelStatus(s.name)??"disabled",i=Xn(n),o=s.enabled&&n!=="disabled"?"af-agent-card":"af-agent-card disabled",l=e.createDiv({cls:o});l.style.cursor="default";let c=l.createDiv({cls:"af-agent-card-header"}),d=c.createDiv({cls:`af-agent-card-avatar ${i}`});(0,b.setIcon)(d,"radio");let u=c.createDiv({cls:"af-agent-card-titleblock"});u.createDiv({cls:"af-agent-card-name",text:s.name}),u.createDiv({cls:"af-agent-card-desc",text:`Default: ${s.defaultAgent}`});let h=c.createSpan({cls:`af-pill ${io(n)}`});if(h.createSpan({cls:"af-dot"}),h.appendText(` ${n}`),s.allowedAgents.length>0){let T=l.createDiv({cls:"af-agent-card-skills"});for(let C of s.allowedAgents){let A=T.createSpan({cls:"af-skill-tag",text:C});C===s.defaultAgent&&(A.style.fontWeight="700")}}let m=l.createDiv({cls:"af-agent-card-stats"}),f=this.plugin.channelManager?.getSessionCount(s.name)??0,p=this.plugin.channelManager?.getMetrics(s.name),v=s.allowedAgents.length>0?String(s.allowedAgents.length):"all";this.renderAgentStat(m,v,"Agents"),this.renderAgentStat(m,String(f),"Sessions"),this.renderAgentStat(m,String(p?.messagesReceived??0),"In"),this.renderAgentStat(m,String(p?.messagesSent??0),"Out");let k=l.createDiv({cls:"af-agent-card-footer"}),w=[s.type];s.enabled||w.push("disabled"),s.allowedUsers.length>0?w.push(`${s.allowedUsers.length} user(s)`):w.push("allowlist empty"),k.createSpan({cls:"af-agent-card-meta",text:w.join(" \xB7 ")});let y=k.createDiv({cls:"af-agent-card-actions"}).createEl("button",{cls:"af-btn-sm"});_(y,"edit","af-btn-icon"),y.appendText(" Edit"),y.onclick=T=>{T.stopPropagation(),this.navigate("edit-channel",s.name)};let x=a.filter(T=>T.path===s.filePath);if(x.length>0){let T=l.createDiv({cls:"af-channel-issues"});for(let C of x)T.createDiv({cls:"af-channel-issue-row",text:C.message})}}renderCreateChannelPage(e){let s=e.createDiv({cls:"af-create-agent-page"}),a=this.plugin.runtime.getSnapshot(),n=this.plugin.channelCredentials.list(),i=s.createDiv({cls:"af-detail-header"}),o=i.createDiv({cls:"af-detail-header-left"}),l=o.createDiv({cls:"af-agent-card-avatar idle"});(0,b.setIcon)(l,"plus");let c=o.createDiv();c.createDiv({cls:"af-detail-header-name",text:"Create New Channel"}),c.createDiv({cls:"af-detail-header-desc",text:"Connect an external chat transport to an agent"}),i.createDiv({cls:"af-detail-header-actions"});let d={name:"",type:"slack",defaultAgent:a.agents[0]?.name??"",allowedAgents:[],credentialRef:n[0]?.ref??"",allowedUsers:"",perUserSessions:!0,channelContext:"",enabled:!0},u=s.createDiv({cls:"af-create-form"}),h=u.createDiv({cls:"af-create-section"}),m=h.createDiv({cls:"af-create-section-header"}),f=m.createSpan({cls:"af-create-section-icon"});(0,b.setIcon)(f,"radio"),m.createSpan({text:"Channel Details"}),this.createFormField(h,"Name","my-slack","Unique identifier for this channel",J=>{d.name=J});let p=h.createDiv({cls:"af-form-row"});p.createDiv({cls:"af-form-label",text:"Type"});let v=p.createEl("select",{cls:"af-form-select"});v.createEl("option",{text:"slack",attr:{value:"slack"}}),v.createEl("option",{text:"telegram",attr:{value:"telegram"}}),v.addEventListener("change",()=>{d.type=v.value});let k=h.createDiv({cls:"af-form-row"}),w=k.createDiv({cls:"af-form-label"});w.setText("Credential"),this.addTooltip(w,"Configured in Settings \u2192 Agent Fleet \u2192 Channel Credentials");let g=k.createEl("select",{cls:"af-form-select"});n.length===0&&g.createEl("option",{text:"(no credentials configured)",attr:{value:""}});for(let J of n)g.createEl("option",{text:`${J.ref} (${J.entry.type})`,attr:{value:J.ref}});g.addEventListener("change",()=>{d.credentialRef=g.value});let y=h.createDiv({cls:"af-form-row af-form-row-toggle"});y.createDiv({cls:"af-form-label",text:"Enabled"});let x=y.createDiv({cls:"af-agent-card-toggle on"});x.onclick=()=>{let J=x.hasClass("on");x.toggleClass("on",!J),d.enabled=!J};let T=u.createDiv({cls:"af-create-section"}),C=T.createDiv({cls:"af-create-section-header"}),A=C.createSpan({cls:"af-create-section-icon"});(0,b.setIcon)(A,"bot"),C.createSpan({text:"Agent Routing"});let E=T.createDiv({cls:"af-form-row"}),R=E.createDiv({cls:"af-form-label"});R.setText("Default agent"),this.addTooltip(R,"Used when no @agent-name prefix is given in a message");let U=E.createEl("select",{cls:"af-form-select"});for(let J of a.agents)U.createEl("option",{text:J.name,attr:{value:J.name}});U.addEventListener("change",()=>{d.defaultAgent=U.value});let D=T.createDiv({cls:"af-form-row"}),K=D.createDiv({cls:"af-form-label"});K.setText("Allowed agents"),this.addTooltip(K,"Agents reachable via @prefix. Leave unchecked to allow all agents.");let q=D.createDiv({cls:"af-form-checkboxes"});for(let J of a.agents){let Te=q.createEl("label",{cls:"af-form-checkbox-label"}),Ce=Te.createEl("input",{attr:{type:"checkbox",value:J.name}});Te.appendText(` ${J.name}`),Ce.addEventListener("change",()=>{Ce.checked?d.allowedAgents.includes(J.name)||d.allowedAgents.push(J.name):d.allowedAgents=d.allowedAgents.filter(he=>he!==J.name)})}let V=T.createDiv({cls:"af-form-row af-form-row-toggle"}),$=V.createDiv({cls:"af-form-label"});$.setText("Per-user sessions"),this.addTooltip($,"Each external user gets their own isolated Claude session");let j=V.createDiv({cls:"af-agent-card-toggle on"});j.onclick=()=>{let J=j.hasClass("on");j.toggleClass("on",!J),d.perUserSessions=!J};let W=u.createDiv({cls:"af-create-section"}),X=W.createDiv({cls:"af-create-section-header"}),H=X.createSpan({cls:"af-create-section-icon"});(0,b.setIcon)(H,"shield-check"),X.createSpan({text:"Access Control"});let P=W.createDiv({cls:"af-form-label"});P.setText("Allowed users"),this.addTooltip(P,"Slack user IDs (U...), one per line. Only listed users can reach the bot.");let M=W.createEl("textarea",{cls:"af-create-prompt-textarea",attr:{placeholder:`U0AQW6P37N1
U0BXYZ12345`,rows:"4"}});M.addEventListener("input",()=>{d.allowedUsers=M.value});let I=u.createDiv({cls:"af-create-section"}),Q=I.createDiv({cls:"af-create-section-header"}),ne=Q.createSpan({cls:"af-create-section-icon"});(0,b.setIcon)(ne,"message-square");let G=Q.createSpan({text:"Channel Context"});this.addTooltip(G,"Extra instructions appended to the agent's system prompt when reached through this channel");let O=I.createEl("textarea",{cls:"af-create-prompt-textarea",attr:{placeholder:"You are being contacted via Slack. Keep replies concise...",rows:"6"}});O.addEventListener("input",()=>{d.channelContext=O.value});let fe=s.createDiv({cls:"af-create-footer"}),ce=fe.createEl("button",{cls:"af-btn-sm",text:"Cancel"});ce.onclick=()=>this.navigate("channels");let Se=fe.createEl("button",{cls:"af-btn-sm primary af-create-submit"});_(Se,"plus","af-btn-icon"),Se.appendText(" Create Channel"),Se.onclick=async()=>{let J=d.name.trim();if(!J){new b.Notice("Channel name is required.");return}if(!d.credentialRef){new b.Notice("Select a credential.");return}let Te=he=>he.split(/[\n,]+/).map(De=>De.trim()).filter(Boolean),Ce={name:ve(J),type:d.type,default_agent:d.defaultAgent,allowed_agents:d.allowedAgents.length>0?d.allowedAgents:void 0,enabled:d.enabled,credential_ref:d.credentialRef,allowed_users:Te(d.allowedUsers),per_user_sessions:d.perUserSessions,channel_context:d.channelContext.trim()||void 0};try{let he=ve(J),De=await this.plugin.repository.getAvailablePath(this.plugin.repository.getSubfolder("channels"),he);await this.plugin.app.vault.create(De,ee(Ce,"")),new b.Notice(`Channel "${he}" created.`),await this.plugin.refreshFromVault(),this.navigate("edit-channel",he)}catch(he){let De=he instanceof Error?he.message:String(he);new b.Notice(`Failed to create channel: ${De}`)}}}renderEditChannelPage(e){let s=e.createDiv({cls:"af-create-agent-page"}),a=this.detailContext;if(!a){this.renderEmptyState(s,"radio","No channel selected","");return}let n=this.plugin.runtime.getSnapshot().channels.find(z=>z.name===a);if(!n){this.renderEmptyState(s,"radio","Channel not found",`Channel "${a}" was not found`);return}let i=this.plugin.runtime.getSnapshot(),o=this.plugin.channelCredentials.list(),l=this.plugin.channelManager?.getChannelStatus(n.name)??"disabled",c=s.createDiv({cls:"af-detail-header"}),d=c.createDiv({cls:"af-detail-header-left"}),u=d.createDiv({cls:`af-agent-card-avatar ${Xn(l)}`});(0,b.setIcon)(u,"radio");let h=d.createDiv();h.createDiv({cls:"af-detail-header-name",text:`Edit Channel: ${n.name}`}),h.createDiv({cls:"af-detail-header-desc",text:`Status: ${l}`}),c.createDiv({cls:"af-detail-header-actions"});let m={type:n.type,defaultAgent:n.defaultAgent,allowedAgents:[...n.allowedAgents],credentialRef:n.credentialRef,allowedUsers:n.allowedUsers.join(`
`),perUserSessions:n.perUserSessions,channelContext:n.channelContext,enabled:n.enabled},f=s.createDiv({cls:"af-create-form"}),p=f.createDiv({cls:"af-create-section"}),v=p.createDiv({cls:"af-create-section-header"}),k=v.createSpan({cls:"af-create-section-icon"});(0,b.setIcon)(k,"radio"),v.createSpan({text:"Channel Details"});let w=p.createDiv({cls:"af-form-row"});w.createDiv({cls:"af-form-label",text:"Name"});let g=w.createEl("input",{cls:"af-form-input",attr:{type:"text",value:n.name,disabled:"true"}});g.style.opacity="0.6";let y=p.createDiv({cls:"af-form-row"});y.createDiv({cls:"af-form-label",text:"Type"});let x=y.createEl("select",{cls:"af-form-select"});for(let z of["slack","telegram"]){let ge=x.createEl("option",{text:z,attr:{value:z}});z===n.type&&(ge.selected=!0)}x.addEventListener("change",()=>{m.type=x.value});let T=p.createDiv({cls:"af-form-row"}),C=T.createDiv({cls:"af-form-label"});C.setText("Credential"),this.addTooltip(C,"Configured in Settings \u2192 Agent Fleet \u2192 Channel Credentials");let A=T.createEl("select",{cls:"af-form-select"});o.length===0&&A.createEl("option",{text:"(no credentials configured)",attr:{value:""}});for(let z of o){let ge=A.createEl("option",{text:`${z.ref} (${z.entry.type})`,attr:{value:z.ref}});z.ref===n.credentialRef&&(ge.selected=!0)}A.addEventListener("change",()=>{m.credentialRef=A.value});let E=p.createDiv({cls:"af-form-row af-form-row-toggle"});E.createDiv({cls:"af-form-label",text:"Enabled"});let R=E.createDiv({cls:`af-agent-card-toggle${n.enabled?" on":""}`});R.onclick=()=>{let z=R.hasClass("on");R.toggleClass("on",!z),m.enabled=!z};let U=f.createDiv({cls:"af-create-section"}),D=U.createDiv({cls:"af-create-section-header"}),K=D.createSpan({cls:"af-create-section-icon"});(0,b.setIcon)(K,"bot"),D.createSpan({text:"Agent Routing"});let q=U.createDiv({cls:"af-form-row"}),V=q.createDiv({cls:"af-form-label"});V.setText("Default agent"),this.addTooltip(V,"Used when no @agent-name prefix is given in a message");let $=q.createEl("select",{cls:"af-form-select"});for(let z of i.agents){let ge=$.createEl("option",{text:z.name,attr:{value:z.name}});z.name===n.defaultAgent&&(ge.selected=!0)}$.addEventListener("change",()=>{m.defaultAgent=$.value});let j=U.createDiv({cls:"af-form-row"}),W=j.createDiv({cls:"af-form-label"});W.setText("Allowed agents"),this.addTooltip(W,"Agents reachable via @prefix. Leave unchecked to allow all agents.");let X=j.createDiv({cls:"af-form-checkboxes"});for(let z of i.agents){let ge=X.createEl("label",{cls:"af-form-checkbox-label"}),Me=ge.createEl("input",{attr:{type:"checkbox",value:z.name}});n.allowedAgents.includes(z.name)&&(Me.checked=!0),ge.appendText(` ${z.name}`),Me.addEventListener("change",()=>{Me.checked?m.allowedAgents.includes(z.name)||m.allowedAgents.push(z.name):m.allowedAgents=m.allowedAgents.filter(Xe=>Xe!==z.name)})}let H=U.createDiv({cls:"af-form-row af-form-row-toggle"}),P=H.createDiv({cls:"af-form-label"});P.setText("Per-user sessions"),this.addTooltip(P,"Each external user gets their own isolated Claude session");let M=H.createDiv({cls:`af-agent-card-toggle${n.perUserSessions?" on":""}`});M.onclick=()=>{let z=M.hasClass("on");M.toggleClass("on",!z),m.perUserSessions=!z};let I=f.createDiv({cls:"af-create-section"}),Q=I.createDiv({cls:"af-create-section-header"}),ne=Q.createSpan({cls:"af-create-section-icon"});(0,b.setIcon)(ne,"shield-check"),Q.createSpan({text:"Access Control"});let G=I.createDiv({cls:"af-form-label"});G.setText("Allowed users"),this.addTooltip(G,"Slack user IDs (U...), one per line. Only listed users can reach the bot.");let O=I.createEl("textarea",{cls:"af-create-prompt-textarea",attr:{placeholder:`U0AQW6P37N1
U0BXYZ12345`,rows:"4"}});O.value=n.allowedUsers.join(`
`),O.addEventListener("input",()=>{m.allowedUsers=O.value});let fe=f.createDiv({cls:"af-create-section"}),ce=fe.createDiv({cls:"af-create-section-header"}),Se=ce.createSpan({cls:"af-create-section-icon"});(0,b.setIcon)(Se,"message-square");let J=ce.createSpan({text:"Channel Context"});this.addTooltip(J,"Extra instructions appended to the agent's system prompt when reached through this channel");let Te=fe.createEl("textarea",{cls:"af-create-prompt-textarea",attr:{placeholder:"You are being contacted via Slack. Keep replies concise...",rows:"6"}});Te.value=n.channelContext,Te.addEventListener("input",()=>{m.channelContext=Te.value});let Ce=s.createDiv({cls:"af-create-footer"}),he=Ce.createEl("button",{cls:"af-btn-sm danger"});_(he,"trash-2","af-btn-icon"),he.appendText(" Delete"),he.onclick=async()=>{await this.plugin.repository.deleteChannel(n.name),new b.Notice(`Channel "${n.name}" deleted.`),await new Promise(z=>setTimeout(z,200)),await this.plugin.refreshFromVault(),this.navigate("channels")},Ce.createDiv({cls:"af-toolbar-spacer"});let De=Ce.createEl("button",{cls:"af-btn-sm",text:"Cancel"});De.onclick=()=>this.navigate("channels");let ze=Ce.createEl("button",{cls:"af-btn-sm primary af-create-submit"});_(ze,"check","af-btn-icon"),ze.appendText(" Save Changes"),ze.onclick=async()=>{let z=ge=>ge.split(/[\n,]+/).map(Me=>Me.trim()).filter(Boolean);try{await this.plugin.repository.updateChannel(n.name,{type:m.type,default_agent:m.defaultAgent,allowed_agents:m.allowedAgents.length>0?m.allowedAgents:[],enabled:m.enabled,credential_ref:m.credentialRef,allowed_users:z(m.allowedUsers),per_user_sessions:m.perUserSessions,channel_context:m.channelContext.trim()}),new b.Notice(`Channel "${n.name}" updated.`),await this.plugin.refreshFromVault(),this.navigate("channels")}catch(ge){let Me=ge instanceof Error?ge.message:String(ge);new b.Notice(`Failed to update channel: ${Me}`)}}}renderApprovalsPage(e){let s=e.createDiv({cls:"af-approvals-page"}),a=this.plugin.runtime.getRecentRuns(),n=s.createDiv({cls:"af-agents-toolbar"});n.createDiv({cls:"af-page-title",text:"Approvals"}),n.createDiv({cls:"af-toolbar-spacer"});let i=a.filter(l=>(l.approvals??[]).some(c=>c.status==="pending"));if(i.length>0){let l=s.createDiv({cls:"af-section-card"}),d=l.createDiv({cls:"af-section-header"}).createDiv({cls:"af-section-title"});_(d,"alert-triangle"),d.appendText(` Pending (${i.length})`);let u=l.createDiv({cls:"af-approvals-list"});for(let h of i)this.renderApprovalItem(u,h,!0)}else{let l=s.createDiv({cls:"af-section-card"});this.renderEmptyState(l,"shield-check","No pending approvals","All clear!")}let o=a.filter(l=>(l.approvals??[]).some(c=>c.status!=="pending"));if(o.length>0){let l=s.createDiv({cls:"af-section-card"}),d=l.createDiv({cls:"af-section-header"}).createDiv({cls:"af-section-title"});_(d,"check-circle-2"),d.appendText(" History");let u=l.createDiv({cls:"af-approvals-list"});for(let h of o.slice(0,20))this.renderApprovalItem(u,h,!1)}}renderApprovalItem(e,s,a){for(let n of s.approvals??[]){if(a&&n.status!=="pending"||!a&&n.status==="pending")continue;let i=e.createDiv({cls:"af-approval-item"}),o=i.createDiv({cls:"af-approval-item-icon"});n.status==="pending"?((0,b.setIcon)(o,"shield-check"),o.addClass("pending")):n.status==="approved"?((0,b.setIcon)(o,"check-circle-2"),o.addClass("approved")):((0,b.setIcon)(o,"x-circle"),o.addClass("rejected"));let l=i.createDiv({cls:"af-approval-item-body"});if(l.createDiv({cls:"af-approval-item-title",text:`${s.agent} \u2192 ${n.tool}`}),l.createDiv({cls:"af-approval-item-meta",text:`Task: ${s.task} \xB7 ${n.command??"no command"} \xB7 ${this.formatStarted(s.started)}`}),n.reason&&l.createDiv({cls:"af-approval-item-reason",text:`Reason: ${n.reason}`}),a&&n.status==="pending"){let c=i.createDiv({cls:"af-approval-item-actions"}),d=c.createEl("button",{cls:"af-btn-approve"});_(d,"check-circle-2","af-btn-icon"),d.appendText(" Approve"),d.onclick=()=>void this.plugin.runtime.resolveApproval(s,n.tool,"approved").then(()=>this.render());let u=c.createEl("button",{cls:"af-btn-reject"});_(u,"x-circle","af-btn-icon"),u.appendText(" Reject"),u.onclick=()=>void this.plugin.runtime.resolveApproval(s,n.tool,"rejected").then(()=>this.render())}}}renderTaskDetailPage(e){let s=e.createDiv({cls:"af-task-detail-page"}),a=this.detailContext;if(!a){this.renderEmptyState(s,"circle-dot","No task selected","");return}let n=this.plugin.runtime.getSnapshot().tasks.find(D=>D.taskId===a);if(!n){this.renderEmptyState(s,"circle-dot","Task not found",`Task "${a}" was not found`);return}let i=this.plugin.runtime.getSnapshot(),o=this.plugin.runtime.getRecentRuns().filter(D=>D.task===a),l=i.agents.find(D=>D.name===n.agent),c=s.createDiv({cls:"af-detail-header"}),d=c.createDiv({cls:"af-detail-header-left"}),u=d.createDiv({cls:"af-agent-card-avatar idle"});(0,b.setIcon)(u,"circle-dot");let h=d.createDiv();h.createDiv({cls:"af-detail-header-name",text:n.taskId}),h.createDiv({cls:"af-detail-header-desc",text:`Agent: ${n.agent}`});let m=c.createDiv({cls:"af-detail-header-actions"}),f=m.createEl("button",{cls:"af-btn-sm"});_(f,"edit","af-btn-icon"),f.appendText(" Edit"),f.onclick=()=>this.navigate("edit-task",n.taskId);let p=m.createEl("button",{cls:"af-btn-sm primary"});_(p,"play","af-btn-icon"),p.appendText(" Run Now"),p.onclick=()=>void this.plugin.runtime.runTaskNow(n);let v=s.createDiv({cls:"af-section-card"}),w=v.createDiv({cls:"af-section-header"}).createDiv({cls:"af-section-title"});_(w,"file-text"),w.appendText(" Details");let g=v.createDiv({cls:"af-config-form"});this.renderConfigRow(g,"Agent",n.agent),this.renderConfigRow(g,"Priority",n.priority.charAt(0).toUpperCase()+n.priority.slice(1)),this.renderConfigRow(g,"Status",n.enabled?"Enabled":"Disabled");let y=n.schedule?this.humanizeCron(n.schedule):n.runAt??"Manual (run on demand)";this.renderConfigRow(g,"Schedule",y),n.schedule&&this.renderConfigRow(g,"Catch up if missed",n.catchUp?"Yes":"No"),this.renderConfigRow(g,"Created",n.created),this.renderConfigRow(g,"Runs",String(n.runCount)),n.lastRun&&this.renderConfigRow(g,"Last Run",this.formatStarted(n.lastRun));let x=s.createDiv({cls:"af-section-card"}),C=x.createDiv({cls:"af-section-header"}).createDiv({cls:"af-section-title"});_(C,"message-square"),C.appendText(" Instructions"),x.createDiv({cls:"af-output-block",text:n.body||"(empty)"});let A=s.createDiv({cls:"af-section-card"}),R=A.createDiv({cls:"af-section-header"}).createDiv({cls:"af-section-title"});_(R,"scroll-text"),R.appendText(" Recent Runs");let U=A.createDiv({cls:"af-timeline"});if(o.length===0)this.renderEmptyState(U,"scroll-text","No runs yet","");else for(let D of o.slice(0,10))this.renderTimelineItem(U,D)}handleSearch(e,s){if(s.querySelector(".af-search-results")?.remove(),e.length<2)return;let a=e.toLowerCase(),n=this.plugin.runtime.getSnapshot(),i=this.plugin.runtime.getRecentRuns(),o=[];for(let c of n.agents)(c.name.toLowerCase().includes(a)||(c.description?.toLowerCase().includes(a)??!1))&&o.push({label:`Agent: ${c.name}`,icon:"bot",action:()=>this.navigate("agent-detail",c.name)});for(let c of n.tasks)(c.taskId.toLowerCase().includes(a)||c.body.toLowerCase().includes(a))&&o.push({label:`Task: ${c.taskId}`,icon:"circle-dot",action:()=>this.navigate("task-detail",c.taskId)});for(let c of n.skills)c.name.toLowerCase().includes(a)&&o.push({label:`Skill: ${c.name}`,icon:"puzzle",action:()=>this.navigate("edit-skill",c.name)});for(let c of i.slice(0,20))c.output.toLowerCase().includes(a)&&o.push({label:`Run: ${c.agent} / ${c.task}`,icon:"scroll-text",action:()=>this.openSlideover(c)});if(o.length===0)return;let l=s.createDiv({cls:"af-search-results"});for(let c of o.slice(0,10)){let d=l.createDiv({cls:"af-search-result-item"});_(d,c.icon,"af-search-result-icon"),d.createSpan({text:c.label}),d.onclick=()=>{l.remove(),c.action()}}}openChatSlideover(e){this.plugin.openChatView(e.name)}openSlideover(e){this.contentEl.querySelector(".af-slideover-overlay")?.remove();let s=this.contentEl.createDiv({cls:"af-slideover-overlay"}),a=s.createDiv({cls:"af-slideover"}),n=a.createDiv({cls:"af-slideover-header"});n.createDiv({cls:"af-slideover-title",text:"Run Details"});let i=n.createEl("button",{cls:"clickable-icon"});(0,b.setIcon)(i,"cross"),i.onclick=()=>s.remove();let o=a.createDiv({cls:"af-slideover-body"}),l=o.createDiv({cls:"af-slideover-section"});l.createDiv({cls:"af-slideover-section-title",text:"METADATA"}),this.renderDetailRow(l,"Run ID",e.runId.slice(0,8)),this.renderDetailRow(l,"Agent",e.agent),this.renderDetailRow(l,"Task",e.task);let c=l.createDiv({cls:"af-detail-row"});c.createSpan({cls:"af-detail-label",text:"Status"});let u=c.createSpan({cls:"af-detail-value"}).createSpan({cls:`af-status-badge ${this.statusToBadgeClass(e.status)}`}),h=u.createSpan();if((0,b.setIcon)(h,this.statusToIconName(e.status)),u.appendText(` ${this.statusToBadgeText(e.status)}`),this.renderDetailRow(l,"Started",e.started),this.renderDetailRow(l,"Duration",this.formatDuration(e.durationSeconds)),this.renderDetailRow(l,"Tokens",e.tokensUsed?e.tokensUsed.toLocaleString():"\u2014"),this.renderDetailRow(l,"Model",e.model),e.output){let p=o.createDiv({cls:"af-slideover-section"});p.createDiv({cls:"af-slideover-section-title",text:"OUTPUT"});let v=p.createDiv({cls:"af-output-block af-compact-md"}),k=5e4,w=e.output.length>k?e.output.slice(0,k)+`

---
*Output truncated (${(e.output.length/1024).toFixed(0)} KB total). Open the run note for full content.*`:e.output;b.MarkdownRenderer.render(this.app,w,v,"",this.plugin)}if(e.toolsUsed.length>0){let p=o.createDiv({cls:"af-slideover-section"});p.createDiv({cls:"af-slideover-section-title",text:"TOOLS USED"}),p.createDiv({cls:"af-output-block",text:e.toolsUsed.join(`
`)})}let m=o.createDiv({cls:"af-slideover-actions"});if(e.filePath){let p=m.createEl("button",{cls:"af-btn-sm"});_(p,"external-link","af-btn-icon"),p.appendText(" Open Run Note"),p.onclick=()=>void this.plugin.openPath(e.filePath)}let f=m.createEl("button",{cls:"af-btn-sm primary"});_(f,"refresh-cw","af-btn-icon"),f.appendText(" Re-run Task"),f.onclick=()=>void this.plugin.runAgentPrompt(e.agent),s.onclick=p=>{p.target===s&&s.remove()}}renderDetailRow(e,s,a){let n=e.createDiv({cls:"af-detail-row"});n.createSpan({cls:"af-detail-label",text:s}),n.createSpan({cls:"af-detail-value af-mono",text:a})}renderEmptyState(e,s,a,n){let i=e.createDiv({cls:"af-empty-state"}),o=i.createDiv({cls:"af-empty-icon"});(0,b.setIcon)(o,s),i.createDiv({cls:"af-empty-label",text:a}),n&&i.createDiv({cls:"af-empty-sublabel",text:n})}healthToClass(e){switch(e){case"running":return"running";case"error":return"error";case"pending":return"pending";case"disabled":return"disabled";default:return"idle"}}statusToTimelineClass(e){switch(e){case"success":return"success";case"failure":case"timeout":return"error";case"cancelled":return"warning";case"pending_approval":return"pending";default:return"running"}}statusToIconName(e){switch(e){case"success":return"check-circle-2";case"failure":return"x-circle";case"timeout":return"clock";case"pending_approval":return"shield-check";case"cancelled":return"square";default:return"loader-2"}}statusToBadgeClass(e){switch(e){case"success":return"success";case"failure":return"failure";case"timeout":return"timeout";case"pending_approval":return"pending";case"cancelled":return"cancelled";default:return"running"}}statusToBadgeText(e){switch(e){case"success":return"Success";case"failure":return"Failed";case"timeout":return"Timeout";case"pending_approval":return"Pending";case"cancelled":return"Cancelled";case"interrupted":return"Interrupted";default:return e}}formatDuration(e){if(e<60)return`${e}s`;let s=Math.floor(e/60),a=e%60;return a>0?`${s}m ${a}s`:`${s}m`}formatStarted(e){try{let s=new Date(e),a=new Date;if(s.toDateString()===a.toDateString())return s.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});let n=new Date(a);return n.setDate(n.getDate()-1),s.toDateString()===n.toDateString()?`Yesterday ${s.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}`:s.toLocaleDateString([],{month:"short",day:"numeric"})+` ${s.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}`}catch{return e}}formatNextRun(e){try{let s=new Date(e),a=new Date,n=s.getTime()-a.getTime();if(n<0)return"overdue";let i=Math.round(n/6e4);if(i<60)return`${i}m`;let o=Math.round(i/60);return o<24?`${o}h`:s.toLocaleDateString([],{month:"short",day:"numeric"})}catch{return e}}getNextTaskLabel(e){let a=e.map(i=>i.nextRun).filter(Boolean).sort()[0];return a?`${e.find(i=>i.nextRun===a)?.agent??"unknown"} in ${this.formatNextRun(a)}`:"none"}getInitials(e){return e.split("-").map(s=>s[0]?.toUpperCase()??"").slice(0,2).join("")}renderAgentAvatar(e,s){let a=s.avatar?.trim();if(!a){(0,b.setIcon)(e,"bot");return}/^[a-z][a-z0-9-]*$/.test(a)?(0,b.setIcon)(e,a):e.setText(a)}getSkillIcon(e){return e.includes("git")?"settings":e.includes("summarize")||e.includes("log")?"activity":e.includes("review")||e.includes("check")?"check-circle-2":e.includes("vault")||e.includes("note")?"file-text":"puzzle"}renderInlineSchedule(e,s){let a=this.parseCronComponents(s.schedule),n=e.createDiv({cls:"af-form-row"});n.createDiv({cls:"af-form-label",text:"Frequency"});let i=n.createEl("select",{cls:"af-form-select"}),o=[["every_5m","Every 5 minutes"],["every_15m","Every 15 minutes"],["every_30m","Every 30 minutes"],["every_hour","Every hour"],["every_2h","Every 2 hours"],["daily","Daily"],["weekdays","Weekdays"],["weekly","Weekly"],["monthly","Monthly"]];for(let[y,x]of o){let T=i.createEl("option",{text:x,attr:{value:y}});y===a.freq&&(T.selected=!0)}let l=e.createDiv({cls:"af-form-row af-schedule-time-row"});l.createDiv({cls:"af-form-label",text:"Time"});let c=l.createDiv({cls:"af-schedule-time-selects"}),d=c.createEl("select",{cls:"af-form-select af-form-select-sm"});for(let y=0;y<24;y++){let x=y>=12?"PM":"AM",T=y===0?12:y>12?y-12:y,C=d.createEl("option",{text:`${T} ${x}`,attr:{value:String(y)}});y===a.hour&&(C.selected=!0)}c.createSpan({cls:"af-schedule-colon",text:":"});let u=c.createEl("select",{cls:"af-form-select af-form-select-sm"});for(let y=0;y<60;y+=5){let x=u.createEl("option",{text:String(y).padStart(2,"0"),attr:{value:String(y)}});y===a.minute&&(x.selected=!0)}let h=e.createDiv({cls:"af-form-row af-schedule-day-row"});h.createDiv({cls:"af-form-label",text:"Day"});let m=h.createDiv({cls:"af-schedule-day-buttons"}),f=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"],p=new Set(a.days);for(let y=0;y<7;y++){let x=m.createEl("button",{cls:`af-schedule-day-btn${p.has(y)?" active":""}`,text:f[y]});x.onclick=()=>{p.has(y)?p.delete(y):p.add(y),x.toggleClass("active",p.has(y)),g()}}let v=e.createDiv({cls:"af-form-row af-schedule-dom-row"});v.createDiv({cls:"af-form-label",text:"Day of month"});let k=v.createEl("select",{cls:"af-form-select af-form-select-sm"});for(let y=1;y<=28;y++){let x=k.createEl("option",{text:String(y),attr:{value:String(y)}});y===a.dayOfMonth&&(x.selected=!0)}let w=()=>{let y=i.value,x=["daily","weekdays","weekly","monthly"].includes(y),T=y==="weekly",C=y==="monthly";l.style.display=x?"":"none",h.style.display=T?"":"none",v.style.display=C?"":"none"},g=()=>{let y=i.value,x=d.value,T=u.value,C="";switch(y){case"every_5m":C="*/5 * * * *";break;case"every_15m":C="*/15 * * * *";break;case"every_30m":C="*/30 * * * *";break;case"every_hour":C="0 * * * *";break;case"every_2h":C="0 */2 * * *";break;case"daily":C=`${T} ${x} * * *`;break;case"weekdays":C=`${T} ${x} * * 1-5`;break;case"weekly":{let A=Array.from(p).sort().join(",")||"1";C=`${T} ${x} * * ${A}`;break}case"monthly":C=`${T} ${x} ${k.value} * *`;break}s.schedule=C,s.type="recurring"};i.addEventListener("change",()=>{w(),g()}),d.addEventListener("change",g),u.addEventListener("change",g),k.addEventListener("change",g),w()}renderHeartbeatSchedule(e,s){let a=this.parseCronComponents(s.heartbeatSchedule),n=e.createDiv({cls:"af-form-row"});n.createDiv({cls:"af-form-label",text:"Frequency"});let i=n.createEl("select",{cls:"af-form-select"}),o=[["every_5m","Every 5 minutes"],["every_15m","Every 15 minutes"],["every_30m","Every 30 minutes"],["every_hour","Every hour"],["every_2h","Every 2 hours"],["every_4h","Every 4 hours"],["every_6h","Every 6 hours"],["every_12h","Every 12 hours"],["daily","Once a day"]],l="every_hour",c={"*/5 * * * *":"every_5m","*/15 * * * *":"every_15m","*/30 * * * *":"every_30m","0 * * * *":"every_hour","0 */2 * * *":"every_2h","0 */4 * * *":"every_4h","0 */6 * * *":"every_6h","0 */12 * * *":"every_12h"};c[s.heartbeatSchedule]?l=c[s.heartbeatSchedule]:(a.freq==="daily"||a.freq==="weekdays")&&(l="daily");for(let[v,k]of o){let w=i.createEl("option",{text:k,attr:{value:v}});v===l&&(w.selected=!0)}let d=e.createDiv({cls:"af-form-row af-schedule-time-row"});d.createDiv({cls:"af-form-label",text:"Time"});let u=d.createDiv({cls:"af-schedule-time-selects"}),h=u.createEl("select",{cls:"af-form-select af-form-select-sm"});for(let v=0;v<24;v++){let k=v>=12?"PM":"AM",w=v===0?12:v>12?v-12:v,g=h.createEl("option",{text:`${w} ${k}`,attr:{value:String(v)}});v===a.hour&&(g.selected=!0)}u.createSpan({cls:"af-schedule-colon",text:":"});let m=u.createEl("select",{cls:"af-form-select af-form-select-sm"});for(let v=0;v<60;v+=5){let k=m.createEl("option",{text:String(v).padStart(2,"0"),attr:{value:String(v)}});v===a.minute&&(k.selected=!0)}let f=()=>{d.style.display=i.value==="daily"?"":"none"},p=()=>{let v=i.value,k=h.value,w=m.value;switch(v){case"every_5m":s.heartbeatSchedule="*/5 * * * *";break;case"every_15m":s.heartbeatSchedule="*/15 * * * *";break;case"every_30m":s.heartbeatSchedule="*/30 * * * *";break;case"every_hour":s.heartbeatSchedule="0 * * * *";break;case"every_2h":s.heartbeatSchedule="0 */2 * * *";break;case"every_4h":s.heartbeatSchedule="0 */4 * * *";break;case"every_6h":s.heartbeatSchedule="0 */6 * * *";break;case"every_12h":s.heartbeatSchedule="0 */12 * * *";break;case"daily":s.heartbeatSchedule=`${w} ${k} * * *`;break}};i.addEventListener("change",()=>{f(),p()}),h.addEventListener("change",p),m.addEventListener("change",p),f()}parseCronComponents(e){let s={freq:"daily",hour:9,minute:0,days:[1],dayOfMonth:1};if(!e?.trim())return s;let a={"*/5 * * * *":"every_5m","*/15 * * * *":"every_15m","*/30 * * * *":"every_30m","0 * * * *":"every_hour","0 */2 * * *":"every_2h"};if(a[e])return{...s,freq:a[e]};let n=e.trim().split(/\s+/);if(n.length!==5)return s;let[i,o,l,,c]=n,d=parseInt(o??"9",10),u=parseInt(i??"0",10);if(l==="*"&&c==="*")return{...s,freq:"daily",hour:d,minute:u};if(l==="*"&&c==="1-5")return{...s,freq:"weekdays",hour:d,minute:u};if(l==="*"&&c!=="*"){let h=(c??"1").split(",").map(m=>parseInt(m,10));return{...s,freq:"weekly",hour:d,minute:u,days:h}}return c==="*"&&l!=="*"?{...s,freq:"monthly",hour:d,minute:u,dayOfMonth:parseInt(l??"1",10)}:{...s,hour:d,minute:u}}humanizeCron(e){let s={"*/5 * * * *":"Every 5 minutes","*/10 * * * *":"Every 10 minutes","*/15 * * * *":"Every 15 minutes","*/30 * * * *":"Every 30 minutes","0 * * * *":"Every hour","0 */2 * * *":"Every 2 hours"};if(s[e])return s[e];let a=e.toLowerCase().trim();if(a.startsWith("every ")||a.startsWith("daily ")||a==="daily")return e;if(a.startsWith("hourly"))return"Every hour";if(a.startsWith("weekdays")||a.startsWith("weekly")||a.startsWith("monthly"))return e;let n=e.trim().split(/\s+/);if(n.length!==5)return e;let[i,o,l,,c]=n,d=(m,f)=>{let p=parseInt(m??"0",10),v=parseInt(f??"0",10),k=p>=12?"PM":"AM",w=p===0?12:p>12?p-12:p;return v===0?`${w} ${k}`:`${w}:${String(v).padStart(2,"0")} ${k}`},u=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"],h=m=>m==="1-5"?"weekdays":m==="0,6"?"weekends":m.split(",").map(p=>parseInt(p,10)).map(p=>u[p]??p).join(", ");return o==="*"&&l==="*"&&c==="*"?i==="*"?"Every minute":`Every hour at :${String(i).padStart(2,"0")}`:l==="*"&&c==="*"&&o!=="*"?`Daily at ${d(o??"0",i??"0")}`:l==="*"&&c==="1-5"&&o!=="*"?`Weekdays at ${d(o??"0",i??"0")}`:l==="*"&&c!=="*"&&o!=="*"?`${h(c??"1")} at ${d(o??"0",i??"0")}`:c==="*"&&l!=="*"&&o!=="*"?`Monthly on the ${l} at ${d(o??"0",i??"0")}`:e}getTagClass(e){return e==="monitoring"?"monitoring":e==="devops"?"devops":e==="sample"?"sample":"default"}renderCreateAgentPage(e){let s=e.createDiv({cls:"af-create-agent-page"}),a=s.createDiv({cls:"af-detail-header"}),n=a.createDiv({cls:"af-detail-header-left"}),i=n.createDiv({cls:"af-agent-card-avatar idle"});(0,b.setIcon)(i,"plus");let o=n.createDiv();o.createDiv({cls:"af-detail-header-name",text:"Create New Agent"}),o.createDiv({cls:"af-detail-header-desc",text:"Configure a new agent for your fleet"});let l=a.createDiv({cls:"af-detail-header-actions"}),c={name:"",description:"",avatar:"",tags:"",systemPrompt:"",model:"default",adapter:"claude-code",cwd:"",timeout:300,permissionMode:"bypassPermissions",selectedSkills:new Set,selectedMcpServers:new Set,skillsBody:"",contextBody:"",approvalRequired:"",memory:!0,enabled:!0,allowedCommands:"",blockedCommands:"",heartbeatEnabled:!1,heartbeatSchedule:"0 */6 * * *",heartbeatBody:"",heartbeatNotify:!0,heartbeatChannel:""},d={none:{label:"None",prompt:""},coding:{label:"Coding Agent",prompt:`You are a coding agent. Review code, write tests, fix bugs, and implement features.
Follow existing code conventions. Write clean, well-tested code.
If something is unclear, ask for clarification instead of guessing.`},monitor:{label:"Monitor",prompt:`You are a monitoring agent. Check system status, alert on failures, and report on health metrics.
Be concise and factual. Highlight anomalies clearly.
Include timestamps and relevant context in all reports.`},briefing:{label:"Briefing",prompt:`You are a briefing agent. Summarize activity, generate reports, and surface key changes.
Prioritize recent and important changes. Keep summaries concise.
End with explicit next actions if they exist.`},reviewer:{label:"Code Reviewer",prompt:`You are a code review agent. Analyze pull requests, suggest improvements, and flag potential issues.
Focus on correctness, security, and maintainability.
Be specific \u2014 reference file names and line numbers.`}},u=s.createDiv({cls:"af-create-form"}),h=u.createDiv({cls:"af-create-section"}),m=h.createDiv({cls:"af-create-section-header"}),f=m.createSpan({cls:"af-create-section-icon"});(0,b.setIcon)(f,"user"),m.createSpan({text:"Identity"}),this.createFormField(h,"Name","deploy-watcher","Unique identifier (will be slugified)",N=>{c.name=N}),this.createFormField(h,"Description","Monitors deployments and reports status","",N=>{c.description=N});let p=h.createDiv({cls:"af-form-row"});p.createDiv({cls:"af-form-label",text:"Avatar"});let v=p.createEl("input",{cls:"af-form-input af-form-input-sm",attr:{type:"text",placeholder:"\u{1F6E1}\uFE0F"}});v.addEventListener("input",()=>{c.avatar=v.value}),this.createFormField(h,"Tags","devops, monitoring","Comma-separated",N=>{c.tags=N});let k=h.createDiv({cls:"af-form-row af-form-row-toggle"});k.createDiv({cls:"af-form-label",text:"Enabled"});let w=k.createDiv({cls:"af-agent-card-toggle on"});w.onclick=()=>{let N=w.hasClass("on");w.toggleClass("on",!N),c.enabled=!N};let g=u.createDiv({cls:"af-create-section"}),y=g.createDiv({cls:"af-create-section-header"}),x=y.createSpan({cls:"af-create-section-icon"});(0,b.setIcon)(x,"message-square"),y.createSpan({text:"System Prompt"});let T=g.createDiv({cls:"af-form-row"});T.createDiv({cls:"af-form-label",text:"Template"});let C=T.createEl("select",{cls:"af-form-select"});for(let[N,{label:Y}]of Object.entries(d))C.createEl("option",{text:Y,attr:{value:N}});let A=g.createEl("textarea",{cls:"af-create-prompt-textarea",attr:{placeholder:"You are a deployment monitoring agent...",rows:"10"}});A.addEventListener("input",()=>{c.systemPrompt=A.value}),C.addEventListener("change",()=>{let N=d[C.value];N&&C.value!=="none"&&(c.systemPrompt=N.prompt,A.value=N.prompt)});let E=u.createDiv({cls:"af-create-section"}),R=E.createDiv({cls:"af-create-section-header"}),U=R.createSpan({cls:"af-create-section-icon"});(0,b.setIcon)(U,"settings"),R.createSpan({text:"Runtime Config"});let D=E.createDiv({cls:"af-create-config-grid"}),K=D.createDiv({cls:"af-form-row"});K.createDiv({cls:"af-form-label",text:"Adapter"});let q=K.createEl("select",{cls:"af-form-select"}),V=[["claude-code","Claude Code",!1],["codex","Codex (coming soon)",!0],["process","Process (coming soon)",!0],["http","HTTP (coming soon)",!0]];for(let[N,Y,we]of V){let de=q.createEl("option",{text:Y,attr:{value:N,...we?{disabled:"true"}:{}}});N==="claude-code"&&(de.selected=!0)}let $=D.createDiv({cls:"af-form-row"});$.createDiv({cls:"af-form-label",text:"Model"});let j=$.createDiv({cls:"af-form-field-wrap"}),W=j.createEl("select",{cls:"af-form-select"}),X=j.createEl("input",{cls:"af-form-input",attr:{type:"text",placeholder:"custom model name",style:"display:none; margin-top:6px;"}}),H=(N,Y)=>{W.empty();let we=Kn[N]??[{value:"default",label:"Default"}];for(let ie of we)W.createEl("option",{text:ie.label,attr:{value:ie.value}});W.createEl("option",{text:"Custom...",attr:{value:"__custom__"}}),we.find(ie=>ie.value===Y)?(W.value=Y,X.style.display="none"):Y&&Y!=="default"&&(W.value="__custom__",X.style.display="",X.value=Y)};H(c.adapter,c.model),W.addEventListener("change",()=>{W.value==="__custom__"?(X.style.display="",X.focus()):(X.style.display="none",c.model=W.value)}),X.addEventListener("input",()=>{c.model=X.value||"default"}),q.addEventListener("change",()=>{c.adapter=q.value,c.model="default",H(c.adapter,"default"),X.style.display="none"});let P=D.createDiv({cls:"af-form-row"});P.createDiv({cls:"af-form-label",text:"Working Dir"});let M=P.createEl("input",{cls:"af-form-input",attr:{type:"text",placeholder:"Leave empty for vault root"}});M.addEventListener("input",()=>{c.cwd=M.value});let I=D.createDiv({cls:"af-form-row"});I.createDiv({cls:"af-form-label",text:"Timeout (sec)"});let Q=I.createEl("input",{cls:"af-form-input af-form-input-sm",attr:{type:"number",value:"300"}});Q.addEventListener("input",()=>{let N=parseInt(Q.value,10);!isNaN(N)&&N>0&&(c.timeout=N)});let ne=D.createDiv({cls:"af-form-row"});ne.createDiv({cls:"af-form-label",text:"Permission Mode"});let G=ne.createEl("select",{cls:"af-form-select"}),O=[["bypassPermissions","Bypass Permissions","Auto-approve everything except deny list"],["dontAsk","Don\u2019t Ask","Auto-approve all tool calls"],["acceptEdits","Accept Edits","Auto-approve file edits, block bash unless allowed"],["plan","Plan","Read-only mode, no writes or commands"],["default","Default","Ask for each tool call"]];for(let[N,Y]of O)G.createEl("option",{text:Y,attr:{value:N}});G.addEventListener("change",()=>{c.permissionMode=G.value});let fe=D.createDiv({cls:"af-form-hint",text:"Skip all permission checks"});G.addEventListener("change",()=>{let N=O.find(([Y])=>Y===G.value)?.[2]??"";fe.textContent=N});{let N=u.createDiv({cls:"af-create-section"}),Y=N.createDiv({cls:"af-create-section-header"}),we=Y.createSpan({cls:"af-create-section-icon"});(0,b.setIcon)(we,"heart-pulse");let de=Y.createSpan({text:"Heartbeat"});this.addTooltip(de,"Autonomous periodic run \u2014 what the agent does when no one is asking");let ie=N.createDiv({cls:"af-form-row af-form-row-toggle"});ie.createDiv({cls:"af-form-label",text:"Enabled"});let _e=ie.createDiv({cls:"af-agent-card-toggle"}),le=N.createDiv();le.style.display="none",_e.onclick=()=>{let Oe=_e.hasClass("on");_e.toggleClass("on",!Oe),c.heartbeatEnabled=!Oe,le.style.display=Oe?"none":""},this.renderHeartbeatSchedule(le,c);let $e=le.createDiv({cls:"af-form-row af-form-row-toggle"}),F=$e.createDiv({cls:"af-form-label"});F.setText("Notify"),this.addTooltip(F,"Show an Obsidian notice when the heartbeat completes");let B=$e.createDiv({cls:"af-agent-card-toggle on"});B.onclick=()=>{let Oe=B.hasClass("on");B.toggleClass("on",!Oe),c.heartbeatNotify=!Oe};let Z=this.plugin.runtime.getSnapshot(),ye=le.createDiv({cls:"af-form-row"}),ke=ye.createDiv({cls:"af-form-label"});ke.setText("Post to channel"),this.addTooltip(ke,"Heartbeat results are posted to this Slack channel when the run completes");let Ee=ye.createEl("select",{cls:"af-form-select"});Ee.createEl("option",{text:"(none)",attr:{value:""}});for(let Oe of Z.channels)Ee.createEl("option",{text:Oe.name,attr:{value:Oe.name}});Ee.addEventListener("change",()=>{c.heartbeatChannel=Ee.value});let Ae=le.createDiv({cls:"af-form-label"});Ae.style.width="auto",Ae.style.marginTop="12px",Ae.setText("Instruction"),this.addTooltip(Ae,'What the agent does on each heartbeat. Also used by the "Run Now" button.');let nt=le.createEl("textarea",{cls:"af-create-prompt-textarea",attr:{placeholder:"Check status, scan for issues, report findings...",rows:"8"}});nt.addEventListener("input",()=>{c.heartbeatBody=nt.value})}let ce=u.createDiv({cls:"af-create-section"}),Se=ce.createDiv({cls:"af-create-section-header"}),J=Se.createSpan({cls:"af-create-section-icon"});(0,b.setIcon)(J,"puzzle"),Se.createSpan({text:"Skills"});let Te=this.plugin.runtime.getSnapshot();if(Te.skills.length>0){ce.createDiv({cls:"af-form-sublabel",text:"Shared Skills"});let N=ce.createDiv({cls:"af-create-skills-grid"});for(let Y of Te.skills){let we=N.createDiv({cls:"af-create-skill-item"}),de=we.createEl("input",{cls:"af-form-toggle",attr:{type:"checkbox"}});de.addEventListener("change",()=>{de.checked?c.selectedSkills.add(Y.name):c.selectedSkills.delete(Y.name)});let ie=we.createDiv({cls:"af-create-skill-label"});ie.createSpan({cls:"af-create-skill-name",text:Y.name}),Y.description&&ie.createSpan({cls:"af-create-skill-desc",text:` \u2014 ${Y.description}`})}}let Ce=ce.createDiv({cls:"af-form-sublabel"});Ce.setText("Agent-specific skills"),this.addTooltip(Ce,"Custom skills/instructions only for this agent, not shared with others");let he=ce.createEl("textarea",{cls:"af-create-textarea",attr:{placeholder:"Custom skills/instructions for this agent...",rows:"4"}});he.addEventListener("input",()=>{c.skillsBody=he.value});{let N=u.createDiv({cls:"af-create-section"}),Y=N.createDiv({cls:"af-create-section-header"}),we=Y.createSpan({cls:"af-create-section-icon"});(0,b.setIcon)(we,"plug");let de=Y.createSpan({text:"MCP Servers"});this.addTooltip(de,"Grant agent access to MCP servers");let ie=this.plugin.mcpManager.getCachedServers();if(ie===null){let _e=N.createDiv({cls:"af-form-hint"});_e.appendText("MCP servers not loaded. ");let le=_e.createEl("a",{cls:"af-link",text:"Go to MCP Servers tab to load them."});le.onclick=$e=>{$e.preventDefault(),this.navigate("mcp")}}else if(ie.length===0)N.createDiv({cls:"af-form-hint",text:"No MCP servers found. Configure them with 'claude mcp add'."});else{let _e=N.createDiv({cls:"af-create-skills-grid"});for(let le of ie){let $e=_e.createDiv({cls:"af-mcp-agent-item"}),F=$e.createEl("input",{cls:"af-form-toggle",attr:{type:"checkbox"}});F.addEventListener("change",()=>{F.checked?c.selectedMcpServers.add(le.name):c.selectedMcpServers.delete(le.name)});let Z=$e.createDiv({cls:"af-mcp-agent-label"}).createDiv({cls:"af-mcp-agent-name-row"}),ye=Z.createSpan({cls:`af-mcp-status-dot ${le.enabled?le.status:"disabled"}`});ye.title=le.enabled?le.status:"disabled",Z.createSpan({cls:"af-create-skill-name",text:le.name});let ke=le.toolDetails.length||le.tools.length;ke>0?Z.createSpan({cls:"af-mcp-agent-tool-count",text:`${ke} tools`}):le.enabled?le.status==="needs-auth"&&Z.createSpan({cls:"af-mcp-agent-tool-count af-muted",text:"needs auth"}):Z.createSpan({cls:"af-mcp-agent-tool-count af-muted",text:"disabled"})}}}let De=u.createDiv({cls:"af-create-section"}),ze=De.createDiv({cls:"af-create-section-header"}),z=ze.createSpan({cls:"af-create-section-icon"});(0,b.setIcon)(z,"file-text");let ge=ze.createSpan({text:"Context"});this.addTooltip(ge,"Project-specific context included in every run");let Me=De.createEl("textarea",{cls:"af-create-textarea",attr:{placeholder:"Background info, repo structure, conventions...",rows:"4"}});Me.addEventListener("input",()=>{c.contextBody=Me.value});let Xe=u.createDiv({cls:"af-create-section"}),vt=Xe.createDiv({cls:"af-create-section-header"}),Kt=vt.createSpan({cls:"af-create-section-icon"});(0,b.setIcon)(Kt,"shield-check"),vt.createSpan({text:"Permissions"}),this.createFormField(Xe,"Approval required","git_push, file_delete","Comma-separated tool names",N=>{c.approvalRequired=N});let Ft=Xe.createDiv({cls:"af-form-row"});Ft.createDiv({cls:"af-form-label",text:"Allowed Commands"});let Xt=Ft.createEl("textarea",{cls:"af-create-textarea",attr:{placeholder:`Bash(curl *)
Bash(python3 *)
Read
Edit
Write`,rows:"4"}});Xt.addEventListener("input",()=>{c.allowedCommands=Xt.value});let Jt=Xe.createDiv({cls:"af-form-row"});Jt.createDiv({cls:"af-form-label",text:"Blocked Commands"});let bt=Jt.createEl("textarea",{cls:"af-create-textarea",attr:{placeholder:`Bash(git push *)
Bash(rm -rf *)
Bash(sudo *)`,rows:"4"}});bt.addEventListener("input",()=>{c.blockedCommands=bt.value});let at=Xe.createDiv({cls:"af-form-row"});at.createDiv({cls:"af-form-label",text:"Memory enabled"});let wt=at.createDiv({cls:"af-agent-card-toggle on"});wt.onclick=()=>{let N=wt.hasClass("on");wt.toggleClass("on",!N),c.memory=!N};let Qt=s.createDiv({cls:"af-create-footer"}),Zt=Qt.createEl("button",{cls:"af-btn-sm",text:"Cancel"});Zt.onclick=()=>this.navigate("agents");let dt=Qt.createEl("button",{cls:"af-btn-sm primary af-create-submit"});_(dt,"plus","af-btn-icon"),dt.appendText(" Create Agent"),dt.onclick=async()=>{let N=c.name.trim();if(!N){new b.Notice("Agent name is required.");return}let Y=ve(N);if(this.plugin.repository.getAgentByName(Y)){new b.Notice(`Agent "${Y}" already exists.`);return}let we=de=>de.split(",").map(ie=>ie.trim()).filter(Boolean);try{let de=ie=>ie.split(`
`).map(_e=>_e.trim()).filter(Boolean);await this.plugin.repository.createAgentFolder({name:Y,description:c.description.trim(),avatar:c.avatar.trim(),tags:we(c.tags),systemPrompt:c.systemPrompt.trim(),model:c.model.trim()||"default",adapter:c.adapter,cwd:c.cwd.trim(),timeout:c.timeout,permissionMode:c.permissionMode,approvalRequired:we(c.approvalRequired),memory:c.memory,memoryMaxEntries:100,skills:Array.from(c.selectedSkills),mcpServers:Array.from(c.selectedMcpServers),skillsBody:c.skillsBody.trim(),contextBody:c.contextBody.trim(),enabled:c.enabled,permissionRules:{allow:de(c.allowedCommands),deny:de(c.blockedCommands)}}),c.heartbeatEnabled&&c.heartbeatBody.trim()&&await this.plugin.repository.updateHeartbeat(Y,{enabled:c.heartbeatEnabled,schedule:c.heartbeatSchedule.trim(),notify:c.heartbeatNotify,channel:c.heartbeatChannel,body:c.heartbeatBody.trim()}),new b.Notice(`Agent "${Y}" created.`),await this.plugin.refreshFromVault(),this.navigate("agent-detail",Y)}catch(de){let ie=de instanceof Error?de.message:String(de);new b.Notice(`Failed to create agent: ${ie}`)}}}renderCreateSkillPage(e){let s=e.createDiv({cls:"af-create-agent-page"}),a=s.createDiv({cls:"af-detail-header"}),n=a.createDiv({cls:"af-detail-header-left"}),i=n.createDiv({cls:"af-agent-card-avatar idle"});(0,b.setIcon)(i,"plus");let o=n.createDiv();o.createDiv({cls:"af-detail-header-name",text:"Create New Skill"}),o.createDiv({cls:"af-detail-header-desc",text:"Define a reusable skill for your agents"});let l=a.createDiv({cls:"af-detail-header-actions"}),c={name:"",description:"",tags:"",body:"",toolsBody:"",referencesBody:"",examplesBody:""},d={none:{label:"None",prompt:""},cli:{label:"CLI Tool Wrapper",prompt:`You are using the {{tool}} CLI. All operations go through the wrapper script.

Requirements:
- Ensure required environment variables are set
- Parse JSON responses for human-readable output
- Confirm destructive operations before executing

Key behaviors:
- List existing items before making changes
- Use --dry-run flags when available
- Report errors clearly with suggested fixes`},api:{label:"API Integration",prompt:`You are integrating with the {{service}} API.

Base URL: https://api.example.com/v1
Auth: Bearer token via environment variable

Key behaviors:
- Always check rate limits before bulk operations
- Handle pagination for list endpoints
- Validate inputs before making requests
- Parse and format JSON responses for readability`},review:{label:"Code Review",prompt:`You are a code review skill. Analyze code changes and provide structured feedback.

Review checklist:
- Correctness: Does the code do what it claims?
- Security: Any injection, auth, or data exposure risks?
- Performance: Unnecessary allocations, N+1 queries, missing indexes?
- Maintainability: Clear naming, reasonable complexity, adequate tests?

Output format:
- Start with a 1-line summary
- Group findings by severity (critical, warning, suggestion)
- Reference specific file paths and line numbers`},data:{label:"Data Analysis",prompt:`You are a data analysis skill. Query, transform, and report on data.

Key behaviors:
- Summarize datasets before diving into details
- Use tables and charts where appropriate
- Always state the time range and filters applied
- Flag anomalies and outliers explicitly
- End with actionable insights, not just observations`}},u=s.createDiv({cls:"af-create-form"}),h=u.createDiv({cls:"af-create-section"}),m=h.createDiv({cls:"af-create-section-header"}),f=m.createSpan({cls:"af-create-section-icon"});(0,b.setIcon)(f,"puzzle"),m.createSpan({text:"Identity"}),this.createFormField(h,"Name","todoist","Unique identifier (will be slugified)",I=>{c.name=I}),this.createFormField(h,"Description","Manage tasks and projects via CLI","",I=>{c.description=I}),this.createFormField(h,"Tags","productivity, tasks","Comma-separated",I=>{c.tags=I});let p=u.createDiv({cls:"af-create-section"}),v=p.createDiv({cls:"af-create-section-header"}),k=v.createSpan({cls:"af-create-section-icon"});(0,b.setIcon)(k,"file-text"),v.createSpan({text:"Core Instructions"});let w=p.createDiv({cls:"af-form-row"});w.createDiv({cls:"af-form-label",text:"Template"});let g=w.createEl("select",{cls:"af-form-select"});for(let[I,{label:Q}]of Object.entries(d))g.createEl("option",{text:Q,attr:{value:I}});let y=p.createEl("textarea",{cls:"af-create-prompt-textarea",attr:{placeholder:"Skill instructions \u2014 what does this skill do and how should agents use it?",rows:"10"}});y.addEventListener("input",()=>{c.body=y.value}),g.addEventListener("change",()=>{let I=d[g.value];I&&g.value!=="none"&&(c.body=I.prompt,y.value=I.prompt)});let x=u.createDiv({cls:"af-create-section"}),T=x.createDiv({cls:"af-create-section-header"}),C=T.createSpan({cls:"af-create-section-icon"});(0,b.setIcon)(C,"wrench");let A=T.createSpan({text:"Tools"});this.addTooltip(A,"CLI commands, API endpoints, and tool definitions available to agents using this skill");let E=x.createEl("textarea",{cls:"af-create-prompt-textarea",attr:{placeholder:`## Commands

### list
Usage: tool list [--filter <query>]
...`,rows:"8"}});E.addEventListener("input",()=>{c.toolsBody=E.value});let R=u.createDiv({cls:"af-create-section"}),U=R.createDiv({cls:"af-create-section-header"}),D=U.createSpan({cls:"af-create-section-icon"});(0,b.setIcon)(D,"book-open");let K=U.createSpan({text:"References"});this.addTooltip(K,"Background docs, conventions, cheat sheets");let q=R.createEl("textarea",{cls:"af-create-prompt-textarea",attr:{placeholder:"API docs, filter syntax, conventions...",rows:"6"}});q.addEventListener("input",()=>{c.referencesBody=q.value});let V=u.createDiv({cls:"af-create-section"}),$=V.createDiv({cls:"af-create-section-header"}),j=$.createSpan({cls:"af-create-section-icon"});(0,b.setIcon)(j,"message-circle");let W=$.createSpan({text:"Examples"});this.addTooltip(W,"Example prompts and ideal outputs showing how to use this skill");let X=V.createEl("textarea",{cls:"af-create-prompt-textarea",attr:{placeholder:`## Example: List all tasks

User: Show me my tasks for today

Agent: ...`,rows:"6"}});X.addEventListener("input",()=>{c.examplesBody=X.value});let H=s.createDiv({cls:"af-create-footer"}),P=H.createEl("button",{cls:"af-btn-sm",text:"Cancel"});P.onclick=()=>this.navigate("skills");let M=H.createEl("button",{cls:"af-btn-sm primary af-create-submit"});_(M,"plus","af-btn-icon"),M.appendText(" Create Skill"),M.onclick=async()=>{let I=c.name.trim();if(!I){new b.Notice("Skill name is required.");return}let Q=ve(I);if(this.plugin.repository.getSkillByName(Q)){new b.Notice(`Skill "${Q}" already exists.`);return}let ne=G=>G.split(",").map(O=>O.trim()).filter(Boolean);try{await this.plugin.repository.createSkillFolder({name:Q,description:c.description.trim(),tags:ne(c.tags),body:c.body.trim(),toolsBody:c.toolsBody.trim(),referencesBody:c.referencesBody.trim(),examplesBody:c.examplesBody.trim()}),new b.Notice(`Skill "${Q}" created.`),await this.plugin.refreshFromVault(),this.navigate("skills")}catch(G){let O=G instanceof Error?G.message:String(G);new b.Notice(`Failed to create skill: ${O}`)}}}renderEditAgentPage(e){let s=e.createDiv({cls:"af-create-agent-page"}),a=this.detailContext;if(!a){this.renderEmptyState(s,"bot","No agent selected","");return}let n=this.plugin.runtime.getSnapshot().agents.find(F=>F.name===a);if(!n){this.renderEmptyState(s,"bot","Agent not found",`Agent "${a}" was not found`);return}let i=s.createDiv({cls:"af-detail-header"}),o=i.createDiv({cls:"af-detail-header-left"}),l=o.createDiv({cls:"af-agent-card-avatar idle"});(0,b.setIcon)(l,"edit");let c=o.createDiv();c.createDiv({cls:"af-detail-header-name",text:`Edit Agent: ${n.name}`}),c.createDiv({cls:"af-detail-header-desc",text:"Modify agent configuration"});let d=i.createDiv({cls:"af-detail-header-actions"}),u={name:n.name,description:n.description??"",avatar:n.avatar,tags:n.tags.join(", "),systemPrompt:n.body,model:n.model,adapter:n.adapter,cwd:n.cwd??"",timeout:n.timeout,permissionMode:n.permissionMode,selectedSkills:new Set(n.skills),selectedMcpServers:new Set(n.mcpServers??[]),skillsBody:n.skillsBody,contextBody:n.contextBody,approvalRequired:n.approvalRequired.join(", "),memory:n.memory,enabled:n.enabled,allowedCommands:n.permissionRules.allow.join(`
`),blockedCommands:n.permissionRules.deny.join(`
`),heartbeatEnabled:n.heartbeatEnabled,heartbeatSchedule:n.heartbeatSchedule,heartbeatBody:n.heartbeatBody,heartbeatNotify:n.heartbeatNotify,heartbeatChannel:n.heartbeatChannel},h=s.createDiv({cls:"af-create-form"}),m=h.createDiv({cls:"af-create-section"}),f=m.createDiv({cls:"af-create-section-header"}),p=f.createSpan({cls:"af-create-section-icon"});(0,b.setIcon)(p,"user"),f.createSpan({text:"Identity"});let v=m.createDiv({cls:"af-form-row"});v.createDiv({cls:"af-form-label",text:"Name"});let k=v.createEl("input",{cls:"af-form-input",attr:{type:"text",value:n.name,disabled:"true"}});k.style.opacity="0.6",this.createFormField(m,"Description","Monitors deployments and reports status","",F=>{u.description=F},n.description??"");let w=m.createDiv({cls:"af-form-row"});w.createDiv({cls:"af-form-label",text:"Avatar"});let g=w.createEl("button",{cls:"af-avatar-picker-btn"}),y=g.createDiv({cls:"af-avatar-picker-preview"});this.renderAgentAvatar(y,{...n,avatar:u.avatar??n.avatar}),g.createSpan({cls:"af-avatar-picker-label",text:u.avatar||n.avatar||"Pick icon\u2026"}),g.addEventListener("click",()=>{new Ms(this.app,u.avatar??n.avatar,F=>{u.avatar=F,y.empty(),(0,b.setIcon)(y,F),g.querySelector(".af-avatar-picker-label")?.setText(F)}).open()}),this.createFormField(m,"Tags","devops, monitoring","Comma-separated",F=>{u.tags=F},n.tags.join(", "));let x=m.createDiv({cls:"af-form-row"});x.createDiv({cls:"af-form-label",text:"Enabled"});let T=x.createDiv({cls:`af-agent-card-toggle${n.enabled?" on":""}`});T.onclick=()=>{let F=T.hasClass("on");T.toggleClass("on",!F),u.enabled=!F};let C=h.createDiv({cls:"af-create-section"}),A=C.createDiv({cls:"af-create-section-header"}),E=A.createSpan({cls:"af-create-section-icon"});(0,b.setIcon)(E,"message-square"),A.createSpan({text:"System Prompt"});let R=C.createEl("textarea",{cls:"af-create-prompt-textarea",attr:{placeholder:"System prompt...",rows:"10"}});R.value=n.body,R.addEventListener("input",()=>{u.systemPrompt=R.value});let U=h.createDiv({cls:"af-create-section"}),D=U.createDiv({cls:"af-create-section-header"}),K=D.createSpan({cls:"af-create-section-icon"});(0,b.setIcon)(K,"settings"),D.createSpan({text:"Runtime Config"});let q=U.createDiv({cls:"af-create-config-grid"}),V=q.createDiv({cls:"af-form-row"});V.createDiv({cls:"af-form-label",text:"Adapter"});let $=V.createEl("select",{cls:"af-form-select"}),j=[["claude-code","Claude Code",!1],["codex","Codex (coming soon)",!0],["process","Process (coming soon)",!0],["http","HTTP (coming soon)",!0]];for(let[F,B,Z]of j){let ye=$.createEl("option",{text:B,attr:{value:F,...Z?{disabled:"true"}:{}}});F===n.adapter&&(ye.selected=!0)}let W=q.createDiv({cls:"af-form-row"});W.createDiv({cls:"af-form-label",text:"Model"});let X=W.createDiv({cls:"af-form-field-wrap"}),H=X.createEl("select",{cls:"af-form-select"}),P=X.createEl("input",{cls:"af-form-input",attr:{type:"text",placeholder:"custom model name",style:"display:none; margin-top:6px;"}}),M=(F,B)=>{H.empty();let Z=Kn[F]??[{value:"default",label:"Default"}];for(let ke of Z)H.createEl("option",{text:ke.label,attr:{value:ke.value}});H.createEl("option",{text:"Custom...",attr:{value:"__custom__"}}),Z.find(ke=>ke.value===B)?(H.value=B,P.style.display="none"):B&&B!=="default"&&(H.value="__custom__",P.style.display="",P.value=B)};M(u.adapter,u.model),H.addEventListener("change",()=>{H.value==="__custom__"?(P.style.display="",P.focus()):(P.style.display="none",u.model=H.value)}),P.addEventListener("input",()=>{u.model=P.value||"default"}),$.addEventListener("change",()=>{u.adapter=$.value,u.model="default",M(u.adapter,"default"),P.style.display="none"});let I=q.createDiv({cls:"af-form-row"});I.createDiv({cls:"af-form-label",text:"Working Dir"});let Q=I.createEl("input",{cls:"af-form-input",attr:{type:"text",placeholder:"Leave empty for vault root",value:n.cwd??""}});Q.addEventListener("input",()=>{u.cwd=Q.value});let ne=q.createDiv({cls:"af-form-row"});ne.createDiv({cls:"af-form-label",text:"Timeout (sec)"});let G=ne.createEl("input",{cls:"af-form-input af-form-input-sm",attr:{type:"number",value:String(n.timeout)}});G.addEventListener("input",()=>{let F=parseInt(G.value,10);!isNaN(F)&&F>0&&(u.timeout=F)});let O=q.createDiv({cls:"af-form-row"});O.createDiv({cls:"af-form-label",text:"Permission Mode"});let fe=O.createEl("select",{cls:"af-form-select"}),ce=[["bypassPermissions","Bypass Permissions","Auto-approve everything except deny list"],["dontAsk","Don\u2019t Ask","Auto-approve all tool calls"],["acceptEdits","Accept Edits","Auto-approve file edits, block bash unless allowed"],["plan","Plan","Read-only mode, no writes or commands"],["default","Default","Ask for each tool call"]];for(let[F,B]of ce){let Z=fe.createEl("option",{text:B,attr:{value:F}});F===n.permissionMode&&(Z.selected=!0)}fe.addEventListener("change",()=>{u.permissionMode=fe.value});let Se=q.createDiv({cls:"af-form-hint",text:ce.find(([F])=>F===n.permissionMode)?.[2]??""});if(fe.addEventListener("change",()=>{let F=ce.find(([B])=>B===fe.value)?.[2]??"";Se.textContent=F}),n.isFolder){let F=h.createDiv({cls:"af-create-section"}),B=F.createDiv({cls:"af-create-section-header"}),Z=B.createSpan({cls:"af-create-section-icon"});(0,b.setIcon)(Z,"heart-pulse");let ye=B.createSpan({text:"Heartbeat"});this.addTooltip(ye,"Autonomous periodic run \u2014 what the agent does when no one is asking");let ke=F.createDiv({cls:"af-form-row af-form-row-toggle"});ke.createDiv({cls:"af-form-label",text:"Enabled"});let Ee=ke.createDiv({cls:`af-agent-card-toggle${u.heartbeatEnabled?" on":""}`}),Ae=F.createDiv();Ae.style.display=u.heartbeatEnabled?"":"none",Ee.onclick=()=>{let We=Ee.hasClass("on");Ee.toggleClass("on",!We),u.heartbeatEnabled=!We,Ae.style.display=We?"none":""},this.renderHeartbeatSchedule(Ae,u);let nt=Ae.createDiv({cls:"af-form-row af-form-row-toggle"}),Oe=nt.createDiv({cls:"af-form-label"});Oe.setText("Notify"),this.addTooltip(Oe,"Show an Obsidian notice when the heartbeat completes");let Bs=nt.createDiv({cls:`af-agent-card-toggle${u.heartbeatNotify?" on":""}`});Bs.onclick=()=>{let We=Bs.hasClass("on");Bs.toggleClass("on",!We),u.heartbeatNotify=!We};let Zn=this.plugin.runtime.getSnapshot(),fa=Ae.createDiv({cls:"af-form-row"}),ga=fa.createDiv({cls:"af-form-label"});ga.setText("Post to channel"),this.addTooltip(ga,"Heartbeat results are posted to this Slack channel when the run completes");let es=fa.createEl("select",{cls:"af-form-select"});es.createEl("option",{text:"(none)",attr:{value:""}});for(let We of Zn.channels){let ei=es.createEl("option",{text:We.name,attr:{value:We.name}});We.name===u.heartbeatChannel&&(ei.selected=!0)}es.addEventListener("change",()=>{u.heartbeatChannel=es.value});let ts=Ae.createDiv({cls:"af-form-label"});ts.style.width="auto",ts.style.marginTop="12px",ts.setText("Instruction"),this.addTooltip(ts,'What the agent does on each heartbeat. Also used by the "Run Now" button.');let Ns=Ae.createEl("textarea",{cls:"af-create-prompt-textarea",attr:{placeholder:"Check status, scan for issues, report findings...",rows:"8"}});Ns.value=u.heartbeatBody,Ns.addEventListener("input",()=>{u.heartbeatBody=Ns.value})}let J=h.createDiv({cls:"af-create-section"}),Te=J.createDiv({cls:"af-create-section-header"}),Ce=Te.createSpan({cls:"af-create-section-icon"});(0,b.setIcon)(Ce,"puzzle"),Te.createSpan({text:"Skills"});let he=this.plugin.runtime.getSnapshot();if(he.skills.length>0){J.createDiv({cls:"af-form-sublabel",text:"Shared Skills"});let F=J.createDiv({cls:"af-create-skills-grid"});for(let B of he.skills){let Z=F.createDiv({cls:"af-create-skill-item"}),ye=Z.createEl("input",{cls:"af-form-toggle",attr:{type:"checkbox"}});ye.checked=u.selectedSkills.has(B.name),ye.addEventListener("change",()=>{ye.checked?u.selectedSkills.add(B.name):u.selectedSkills.delete(B.name)});let ke=Z.createDiv({cls:"af-create-skill-label"});ke.createSpan({cls:"af-create-skill-name",text:B.name}),B.description&&ke.createSpan({cls:"af-create-skill-desc",text:` \u2014 ${B.description}`})}}let De=J.createDiv({cls:"af-form-sublabel"});De.setText("Agent-specific skills"),this.addTooltip(De,"Custom skills/instructions only for this agent, not shared with others");let ze=J.createEl("textarea",{cls:"af-create-textarea",attr:{placeholder:"Custom skills/instructions for this agent...",rows:"4"}});ze.value=n.skillsBody,ze.addEventListener("input",()=>{u.skillsBody=ze.value});let z=h.createDiv({cls:"af-create-section"}),ge=z.createDiv({cls:"af-create-section-header"}),Me=ge.createSpan({cls:"af-create-section-icon"});(0,b.setIcon)(Me,"plug");let Xe=ge.createSpan({text:"MCP Servers"});this.addTooltip(Xe,"Grant agent access to MCP servers");let vt=this.plugin.mcpManager.getCachedServers();if(vt===null){let F=z.createDiv({cls:"af-form-hint"});F.appendText("MCP servers not loaded. ");let B=F.createEl("a",{cls:"af-link",text:"Go to MCP Servers tab to load them."});B.onclick=Z=>{Z.preventDefault(),this.navigate("mcp")}}else if(vt.length===0)z.createDiv({cls:"af-form-hint",text:"No MCP servers found. Configure them with 'claude mcp add'."});else{let F=z.createDiv({cls:"af-create-skills-grid"});for(let B of vt){let Z=F.createDiv({cls:"af-mcp-agent-item"}),ye=Z.createEl("input",{cls:"af-form-toggle",attr:{type:"checkbox"}});ye.checked=u.selectedMcpServers.has(B.name),ye.addEventListener("change",()=>{ye.checked?u.selectedMcpServers.add(B.name):u.selectedMcpServers.delete(B.name)});let Ee=Z.createDiv({cls:"af-mcp-agent-label"}).createDiv({cls:"af-mcp-agent-name-row"}),Ae=Ee.createSpan({cls:`af-mcp-status-dot ${B.enabled?B.status:"disabled"}`});Ae.title=B.enabled?B.status:"disabled",Ee.createSpan({cls:"af-create-skill-name",text:B.name});let nt=B.toolDetails.length||B.tools.length;nt>0?Ee.createSpan({cls:"af-mcp-agent-tool-count",text:`${nt} tools`}):B.enabled?B.status==="needs-auth"&&Ee.createSpan({cls:"af-mcp-agent-tool-count af-muted",text:"needs auth"}):Ee.createSpan({cls:"af-mcp-agent-tool-count af-muted",text:"disabled"})}}let Kt=h.createDiv({cls:"af-create-section"}),Ft=Kt.createDiv({cls:"af-create-section-header"}),Xt=Ft.createSpan({cls:"af-create-section-icon"});(0,b.setIcon)(Xt,"file-text");let Jt=Ft.createSpan({text:"Context"});this.addTooltip(Jt,"Project-specific context included in every run");let bt=Kt.createEl("textarea",{cls:"af-create-textarea",attr:{placeholder:"Background info, repo structure, conventions...",rows:"4"}});bt.value=n.contextBody,bt.addEventListener("input",()=>{u.contextBody=bt.value});let at=h.createDiv({cls:"af-create-section"}),wt=at.createDiv({cls:"af-create-section-header"}),Qt=wt.createSpan({cls:"af-create-section-icon"});(0,b.setIcon)(Qt,"shield-check"),wt.createSpan({text:"Permissions"}),this.createFormField(at,"Approval required","git_push, file_delete","Comma-separated tool names",F=>{u.approvalRequired=F},n.approvalRequired.join(", "));let Zt=at.createDiv({cls:"af-form-row"});Zt.createDiv({cls:"af-form-label",text:"Allowed Commands"});let dt=Zt.createEl("textarea",{cls:"af-create-textarea",attr:{placeholder:`Bash(curl *)
Bash(python3 *)
Read
Edit
Write`,rows:"4"}});dt.value=n.permissionRules.allow.join(`
`),dt.addEventListener("input",()=>{u.allowedCommands=dt.value});let N=at.createDiv({cls:"af-form-row"});N.createDiv({cls:"af-form-label",text:"Blocked Commands"});let Y=N.createEl("textarea",{cls:"af-create-textarea",attr:{placeholder:`Bash(git push *)
Bash(rm -rf *)
Bash(sudo *)`,rows:"4"}});Y.value=n.permissionRules.deny.join(`
`),Y.addEventListener("input",()=>{u.blockedCommands=Y.value});let we=at.createDiv({cls:"af-form-row"});we.createDiv({cls:"af-form-label",text:"Memory enabled"});let de=we.createDiv({cls:`af-agent-card-toggle${n.memory?" on":""}`});de.onclick=()=>{let F=de.hasClass("on");de.toggleClass("on",!F),u.memory=!F};let ie=s.createDiv({cls:"af-create-footer"}),_e=ie.createEl("button",{cls:"af-btn-sm danger"});_(_e,"trash-2","af-btn-icon"),_e.appendText(" Delete"),_e.onclick=()=>void this.plugin.deleteAgent(n.name),ie.createDiv({cls:"af-toolbar-spacer"});let le=ie.createEl("button",{cls:"af-btn-sm",text:"Cancel"});le.onclick=()=>this.navigate("agent-detail",n.name);let $e=ie.createEl("button",{cls:"af-btn-sm primary af-create-submit"});_($e,"check","af-btn-icon"),$e.appendText(" Save Changes"),$e.onclick=async()=>{let F=B=>B.split(",").map(Z=>Z.trim()).filter(Boolean);try{let B=Z=>Z.split(`
`).map(ye=>ye.trim()).filter(Boolean);await this.plugin.repository.updateAgent(n.name,{description:u.description.trim(),avatar:u.avatar.trim(),tags:F(u.tags),systemPrompt:u.systemPrompt.trim(),model:u.model.trim()||"default",adapter:u.adapter,cwd:u.cwd.trim(),timeout:u.timeout,permissionMode:u.permissionMode,approvalRequired:F(u.approvalRequired),memory:u.memory,skills:Array.from(u.selectedSkills),mcpServers:Array.from(u.selectedMcpServers),skillsBody:u.skillsBody.trim(),contextBody:u.contextBody.trim(),enabled:u.enabled,permissionRules:{allow:B(u.allowedCommands),deny:B(u.blockedCommands)}}),n.isFolder&&await this.plugin.repository.updateHeartbeat(n.name,{enabled:u.heartbeatEnabled,schedule:u.heartbeatSchedule.trim(),notify:u.heartbeatNotify,channel:u.heartbeatChannel,body:u.heartbeatBody.trim()}),new b.Notice(`Agent "${n.name}" updated.`),await this.plugin.refreshFromVault(),this.navigate("agent-detail",n.name)}catch(B){let Z=B instanceof Error?B.message:String(B);new b.Notice(`Failed to update agent: ${Z}`)}}}renderCreateTaskPage(e){let s=e.createDiv({cls:"af-create-agent-page"}),a=this.plugin.runtime.getSnapshot(),n=s.createDiv({cls:"af-detail-header"}),i=n.createDiv({cls:"af-detail-header-left"}),o=i.createDiv({cls:"af-agent-card-avatar idle"});(0,b.setIcon)(o,"plus");let l=i.createDiv();l.createDiv({cls:"af-detail-header-name",text:"Create New Task"}),l.createDiv({cls:"af-detail-header-desc",text:"Configure a new task for your fleet"}),n.createDiv({cls:"af-detail-header-actions"});let c={title:"",agent:a.agents[0]?.name??"",priority:"medium",tags:"",body:"",scheduleEnabled:!1,schedule:"0 9 * * *",type:"immediate",enabled:!0,catchUp:!0},d=s.createDiv({cls:"af-create-form"}),u=d.createDiv({cls:"af-create-section"}),h=u.createDiv({cls:"af-create-section-header"}),m=h.createSpan({cls:"af-create-section-icon"});(0,b.setIcon)(m,"file-text"),h.createSpan({text:"Task Details"}),this.createFormField(u,"Title","Daily status report","Used as the task identifier",P=>{c.title=P});let f=u.createDiv({cls:"af-form-row"});f.createDiv({cls:"af-form-label",text:"Agent"});let p=f.createEl("select",{cls:"af-form-select"});for(let P of a.agents)p.createEl("option",{text:P.name,attr:{value:P.name}});p.addEventListener("change",()=>{c.agent=p.value});let v=u.createDiv({cls:"af-form-row"});v.createDiv({cls:"af-form-label",text:"Priority"});let k=v.createEl("select",{cls:"af-form-select"}),w=[["low","Low"],["medium","Medium"],["high","High"],["critical","Critical"]];for(let[P,M]of w){let I=k.createEl("option",{text:M,attr:{value:P}});P==="medium"&&(I.selected=!0)}k.addEventListener("change",()=>{c.priority=k.value}),this.createFormField(u,"Tags","monitoring, devops","Comma-separated",P=>{c.tags=P});let g=d.createDiv({cls:"af-create-section"}),y=g.createDiv({cls:"af-create-section-header"}),x=y.createSpan({cls:"af-create-section-icon"});(0,b.setIcon)(x,"message-square"),y.createSpan({text:"Instructions"});let T=g.createEl("textarea",{cls:"af-create-prompt-textarea",attr:{placeholder:"Describe what the agent should do...",rows:"10"}});T.addEventListener("input",()=>{c.body=T.value});let C=d.createDiv({cls:"af-create-section"}),A=C.createDiv({cls:"af-create-section-header"}),E=A.createSpan({cls:"af-create-section-icon"});(0,b.setIcon)(E,"clock"),A.createSpan({text:"Schedule"});let R=C.createDiv({cls:"af-form-row af-form-row-toggle"});R.createDiv({cls:"af-form-label",text:"Enable schedule"});let U=R.createDiv({cls:"af-agent-card-toggle"}),D=C.createDiv({cls:"af-schedule-body"});D.style.display="none",U.onclick=()=>{let P=U.hasClass("on");U.toggleClass("on",!P),c.scheduleEnabled=!P,D.style.display=P?"none":"",P?c.type="immediate":c.type="recurring"},this.renderInlineSchedule(D,c);let K=D.createDiv({cls:"af-form-row af-form-row-toggle"});K.createDiv({cls:"af-form-label",text:"Enabled"});let q=K.createDiv({cls:"af-agent-card-toggle on"});q.onclick=()=>{let P=q.hasClass("on");q.toggleClass("on",!P),c.enabled=!P};let V=D.createDiv({cls:"af-form-row af-form-row-toggle"});V.createDiv({cls:"af-form-label"}).setText("Catch up if missed");let j=V.createDiv({cls:`af-agent-card-toggle${c.catchUp?" on":""}`});j.onclick=()=>{let P=j.hasClass("on");j.toggleClass("on",!P),c.catchUp=!P};let W=s.createDiv({cls:"af-create-footer"}),X=W.createEl("button",{cls:"af-btn-sm",text:"Cancel"});X.onclick=()=>this.navigate("kanban");let H=W.createEl("button",{cls:"af-btn-sm primary af-create-submit"});_(H,"plus","af-btn-icon"),H.appendText(" Create Task"),H.onclick=async()=>{let P=c.title.trim();if(!P){new b.Notice("Task title is required.");return}let M=ve(P),I=G=>G.split(",").map(O=>O.trim()).filter(Boolean),Q=c.scheduleEnabled?"recurring":"immediate",ne={task_id:M,agent:c.agent,type:Q,priority:c.priority,enabled:c.enabled,created:this.toLocalISO(new Date),run_count:0,catch_up:c.catchUp,tags:I(c.tags)};Q==="recurring"&&(ne.schedule=c.schedule.trim()||"0 9 * * *");try{let G=await this.plugin.repository.getAvailablePath(this.plugin.repository.getSubfolder("tasks"),M);await this.plugin.app.vault.create(G,ee(ne,c.body.trim()||"Describe the task here.")),new b.Notice(`Task "${M}" created.`),await this.plugin.refreshFromVault(),this.navigate("task-detail",M)}catch(G){let O=G instanceof Error?G.message:String(G);new b.Notice(`Failed to create task: ${O}`)}}}toLocalISO(e){let s=a=>String(a).padStart(2,"0");return`${e.getFullYear()}-${s(e.getMonth()+1)}-${s(e.getDate())}T${s(e.getHours())}:${s(e.getMinutes())}:${s(e.getSeconds())}`}renderEditTaskPage(e){let s=e.createDiv({cls:"af-create-agent-page"}),a=this.detailContext;if(!a){this.renderEmptyState(s,"circle-dot","No task selected","");return}let n=this.plugin.runtime.getSnapshot().tasks.find(O=>O.taskId===a);if(!n){this.renderEmptyState(s,"circle-dot","Task not found",`Task "${a}" was not found`);return}let i=this.plugin.runtime.getSnapshot(),o=s.createDiv({cls:"af-detail-header"}),l=o.createDiv({cls:"af-detail-header-left"}),c=l.createDiv({cls:"af-agent-card-avatar idle"});(0,b.setIcon)(c,"edit");let d=l.createDiv();d.createDiv({cls:"af-detail-header-name",text:`Edit Task: ${n.taskId}`}),d.createDiv({cls:"af-detail-header-desc",text:"Modify task configuration"}),o.createDiv({cls:"af-detail-header-actions"});let u=!!(n.schedule||n.runAt),h={agent:n.agent,type:n.type,priority:n.priority,schedule:n.schedule??"0 9 * * *",scheduleEnabled:u,enabled:n.enabled,catchUp:n.catchUp,tags:n.tags.join(", "),body:n.body},m=s.createDiv({cls:"af-create-form"}),f=m.createDiv({cls:"af-create-section"}),p=f.createDiv({cls:"af-create-section-header"}),v=p.createSpan({cls:"af-create-section-icon"});(0,b.setIcon)(v,"file-text"),p.createSpan({text:"Task Details"});let k=f.createDiv({cls:"af-form-row"});k.createDiv({cls:"af-form-label",text:"Title"});let w=k.createEl("input",{cls:"af-form-input",attr:{type:"text",value:n.taskId,disabled:"true"}});w.style.opacity="0.6";let g=f.createDiv({cls:"af-form-row"});g.createDiv({cls:"af-form-label",text:"Agent"});let y=g.createEl("select",{cls:"af-form-select"});for(let O of i.agents){let fe=y.createEl("option",{text:O.name,attr:{value:O.name}});O.name===n.agent&&(fe.selected=!0)}y.addEventListener("change",()=>{h.agent=y.value});let x=f.createDiv({cls:"af-form-row"});x.createDiv({cls:"af-form-label",text:"Priority"});let T=x.createEl("select",{cls:"af-form-select"}),C=[["low","Low"],["medium","Medium"],["high","High"],["critical","Critical"]];for(let[O,fe]of C){let ce=T.createEl("option",{text:fe,attr:{value:O}});O===n.priority&&(ce.selected=!0)}T.addEventListener("change",()=>{h.priority=T.value}),this.createFormField(f,"Tags","monitoring, critical","Comma-separated",O=>{h.tags=O},n.tags.join(", "));let A=m.createDiv({cls:"af-create-section"}),E=A.createDiv({cls:"af-create-section-header"}),R=E.createSpan({cls:"af-create-section-icon"});(0,b.setIcon)(R,"message-square"),E.createSpan({text:"Instructions"});let U=A.createEl("textarea",{cls:"af-create-prompt-textarea",attr:{placeholder:"Describe what the agent should do...",rows:"10"}});U.value=n.body,U.addEventListener("input",()=>{h.body=U.value});let D=m.createDiv({cls:"af-create-section"}),K=D.createDiv({cls:"af-create-section-header"}),q=K.createSpan({cls:"af-create-section-icon"});(0,b.setIcon)(q,"clock"),K.createSpan({text:"Schedule"});let V=D.createDiv({cls:"af-form-row af-form-row-toggle"});V.createDiv({cls:"af-form-label",text:"Enable schedule"});let $=V.createDiv({cls:`af-agent-card-toggle${u?" on":""}`}),j=D.createDiv({cls:"af-schedule-body"});j.style.display=u?"":"none",$.onclick=()=>{let O=$.hasClass("on");$.toggleClass("on",!O),h.scheduleEnabled=!O,j.style.display=O?"none":"",O?h.type="immediate":h.type="recurring"},this.renderInlineSchedule(j,h);let W=j.createDiv({cls:"af-form-row af-form-row-toggle"});W.createDiv({cls:"af-form-label",text:"Enabled"});let X=W.createDiv({cls:`af-agent-card-toggle${n.enabled?" on":""}`});X.onclick=()=>{let O=X.hasClass("on");X.toggleClass("on",!O),h.enabled=!O};let H=j.createDiv({cls:"af-form-row af-form-row-toggle"});H.createDiv({cls:"af-form-label"}).setText("Catch up if missed");let M=H.createDiv({cls:`af-agent-card-toggle${h.catchUp?" on":""}`});M.onclick=()=>{let O=M.hasClass("on");M.toggleClass("on",!O),h.catchUp=!O};let I=s.createDiv({cls:"af-create-footer"}),Q=I.createEl("button",{cls:"af-btn-sm danger"});_(Q,"trash-2","af-btn-icon"),Q.appendText(" Delete"),Q.onclick=async()=>{await this.plugin.repository.deleteTask(n.taskId),new b.Notice(`Task "${n.taskId}" deleted.`),await new Promise(O=>setTimeout(O,200)),await this.plugin.refreshFromVault(),this.navigate("kanban")},I.createDiv({cls:"af-toolbar-spacer"});let ne=I.createEl("button",{cls:"af-btn-sm",text:"Cancel"});ne.onclick=()=>this.navigate("task-detail",n.taskId);let G=I.createEl("button",{cls:"af-btn-sm primary af-create-submit"});_(G,"check","af-btn-icon"),G.appendText(" Save Changes"),G.onclick=async()=>{let O=ce=>ce.split(",").map(Se=>Se.trim()).filter(Boolean),fe=h.scheduleEnabled?"recurring":"immediate";try{await this.plugin.repository.updateTask(n.taskId,{agent:h.agent,type:fe,priority:h.priority,schedule:h.scheduleEnabled?h.schedule.trim():void 0,enabled:h.enabled,catch_up:h.catchUp,tags:O(h.tags),body:h.body.trim()}),new b.Notice(`Task "${n.taskId}" updated.`),await this.plugin.refreshFromVault(),this.navigate("task-detail",n.taskId)}catch(ce){let Se=ce instanceof Error?ce.message:String(ce);new b.Notice(`Failed to update task: ${Se}`)}}}renderEditSkillPage(e){let s=e.createDiv({cls:"af-create-agent-page"}),a=this.detailContext;if(!a){this.renderEmptyState(s,"puzzle","No skill selected","");return}let n=this.plugin.runtime.getSnapshot().skills.find(ne=>ne.name===a);if(!n){this.renderEmptyState(s,"puzzle","Skill not found",`Skill "${a}" was not found`);return}let i=s.createDiv({cls:"af-detail-header"}),o=i.createDiv({cls:"af-detail-header-left"}),l=o.createDiv({cls:"af-agent-card-avatar idle"});(0,b.setIcon)(l,"edit");let c=o.createDiv();c.createDiv({cls:"af-detail-header-name",text:`Edit Skill: ${n.name}`}),c.createDiv({cls:"af-detail-header-desc",text:"Modify skill definition"});let d=i.createDiv({cls:"af-detail-header-actions"}),u={description:n.description??"",tags:n.tags.join(", "),body:n.body,toolsBody:n.toolsBody,referencesBody:n.referencesBody,examplesBody:n.examplesBody},h=s.createDiv({cls:"af-create-form"}),m=h.createDiv({cls:"af-create-section"}),f=m.createDiv({cls:"af-create-section-header"}),p=f.createSpan({cls:"af-create-section-icon"});(0,b.setIcon)(p,"puzzle"),f.createSpan({text:"Identity"});let v=m.createDiv({cls:"af-form-row"});v.createDiv({cls:"af-form-label",text:"Name"});let k=v.createEl("input",{cls:"af-form-input",attr:{type:"text",value:n.name,disabled:"true"}});k.style.opacity="0.6",this.createFormField(m,"Description","Manage tasks and projects via CLI","",ne=>{u.description=ne},n.description??""),this.createFormField(m,"Tags","productivity, tasks","Comma-separated",ne=>{u.tags=ne},n.tags.join(", "));let w=h.createDiv({cls:"af-create-section"}),g=w.createDiv({cls:"af-create-section-header"}),y=g.createSpan({cls:"af-create-section-icon"});(0,b.setIcon)(y,"file-text"),g.createSpan({text:"Core Instructions"});let x=w.createEl("textarea",{cls:"af-create-prompt-textarea",attr:{placeholder:"Skill instructions...",rows:"10"}});x.value=n.body,x.addEventListener("input",()=>{u.body=x.value});let T=h.createDiv({cls:"af-create-section"}),C=T.createDiv({cls:"af-create-section-header"}),A=C.createSpan({cls:"af-create-section-icon"});(0,b.setIcon)(A,"wrench");let E=C.createSpan({text:"Tools"});this.addTooltip(E,"CLI commands, API endpoints, and tool definitions available to agents using this skill");let R=T.createEl("textarea",{cls:"af-create-prompt-textarea",attr:{placeholder:`## Commands

### list
...`,rows:"8"}});R.value=n.toolsBody,R.addEventListener("input",()=>{u.toolsBody=R.value});let U=h.createDiv({cls:"af-create-section"}),D=U.createDiv({cls:"af-create-section-header"}),K=D.createSpan({cls:"af-create-section-icon"});(0,b.setIcon)(K,"book-open");let q=D.createSpan({text:"References"});this.addTooltip(q,"Background docs, conventions, cheat sheets");let V=U.createEl("textarea",{cls:"af-create-prompt-textarea",attr:{placeholder:"API docs, filter syntax, conventions...",rows:"6"}});V.value=n.referencesBody,V.addEventListener("input",()=>{u.referencesBody=V.value});let $=h.createDiv({cls:"af-create-section"}),j=$.createDiv({cls:"af-create-section-header"}),W=j.createSpan({cls:"af-create-section-icon"});(0,b.setIcon)(W,"message-circle");let X=j.createSpan({text:"Examples"});this.addTooltip(X,"Example prompts and ideal outputs showing how to use this skill");let H=$.createEl("textarea",{cls:"af-create-prompt-textarea",attr:{placeholder:`## Example: List all tasks
...`,rows:"6"}});H.value=n.examplesBody,H.addEventListener("input",()=>{u.examplesBody=H.value});let P=s.createDiv({cls:"af-create-footer"}),M=P.createEl("button",{cls:"af-btn-sm danger"});_(M,"trash-2","af-btn-icon"),M.appendText(" Delete"),M.onclick=async()=>{await this.plugin.repository.deleteSkill(n.name),new b.Notice(`Skill "${n.name}" deleted.`),await new Promise(ne=>setTimeout(ne,200)),await this.plugin.refreshFromVault(),this.navigate("skills")},P.createDiv({cls:"af-toolbar-spacer"});let I=P.createEl("button",{cls:"af-btn-sm",text:"Cancel"});I.onclick=()=>this.navigate("skills");let Q=P.createEl("button",{cls:"af-btn-sm primary af-create-submit"});_(Q,"check","af-btn-icon"),Q.appendText(" Save Changes"),Q.onclick=async()=>{let ne=G=>G.split(",").map(O=>O.trim()).filter(Boolean);try{await this.plugin.repository.updateSkill(n.name,{description:u.description.trim(),tags:ne(u.tags),body:u.body.trim(),toolsBody:u.toolsBody.trim(),referencesBody:u.referencesBody.trim(),examplesBody:u.examplesBody.trim()}),new b.Notice(`Skill "${n.name}" updated.`),await this.plugin.refreshFromVault(),this.navigate("skills")}catch(G){let O=G instanceof Error?G.message:String(G);new b.Notice(`Failed to update skill: ${O}`)}}}renderMcpPage(e){let s=e.createDiv({cls:"af-agents-page"}),a=s.createDiv({cls:"af-agents-toolbar"});a.createDiv({cls:"af-page-title",text:"MCP Servers"}),a.createDiv({cls:"af-toolbar-spacer"});let n=a.createEl("button",{cls:"af-btn-sm primary"});_(n,"plus","af-btn-icon"),n.appendText(" Add Server"),n.onclick=()=>this.navigate("add-mcp-server");let i=a.createEl("button",{cls:"af-btn-sm"});_(i,"refresh-cw","af-btn-icon"),i.appendText(" Refresh"),i.onclick=()=>{this.plugin.mcpManager.invalidateCache(),this.render()};let o=this.plugin.mcpManager.getCachedServers();if(o===null){let c=s.createDiv({cls:"af-mcp-progress"}),d=c.createDiv({cls:"af-mcp-progress-header"}),u=d.createDiv({cls:"af-mcp-spinner"});for(let k=0;k<3;k++)u.createSpan();let h=d.createSpan({cls:"af-mcp-progress-label",text:"Discovering MCP servers\u2026"}),f=c.createDiv({cls:"af-mcp-progress-bar"}).createDiv({cls:"af-mcp-progress-fill"});f.style.width="15%";let p=c.createDiv({cls:"af-mcp-progress-detail",text:"Scanning for configured servers\u2026"}),v=this.plugin.mcpManager.onProgress(k=>{switch(k.phase){case"list":h.setText("Scanning servers\u2026"),p.setText(k.message),f.style.width="20%";break;case"details":h.setText(`Checking server ${k.current}/${k.total}\u2026`),p.setText(k.serverName),f.style.width=`${20+k.current/k.total*30}%`;break;case"tools":h.setText("Discovering tools\u2026"),p.setText(k.message),f.style.width="60%",f.addClass("af-mcp-progress-fill-slow");break;case"done":f.style.width="100%",h.setText("Done"),p.setText(`${k.serverCount} server${k.serverCount!==1?"s":""}, ${k.toolCount} tool${k.toolCount!==1?"s":""} discovered`);break}});this.streamingUnsubscribes.push(v),this.plugin.mcpManager.getServers().then(()=>void this.render()).catch(()=>void this.render());return}if(o.length===0){this.renderEmptyState(s,"plug","No MCP servers found","Click 'Add Server' above or use 'claude mcp add' in the terminal");return}let l=s.createDiv({cls:"af-agents-grid"});for(let c of o)this.renderMcpCard(l,c)}renderMcpCard(e,s){let a=e.createDiv({cls:`af-mcp-card${s.enabled?"":" af-mcp-card-disabled"}`}),n=a.createDiv({cls:"af-agent-card-header"}),i=s.enabled?s.status==="connected"?"idle":s.status==="needs-auth"?"pending":"error":"disabled",o=n.createDiv({cls:`af-agent-card-avatar ${i}`});(0,b.setIcon)(o,"plug");let l=n.createDiv({cls:"af-agent-card-titleblock"});l.createDiv({cls:"af-agent-card-name",text:s.name});let c=l.createDiv({cls:"af-agent-card-desc af-mcp-meta"});c.createSpan({cls:"af-mcp-type-badge",text:s.type}),s.scope!=="unknown"&&c.createSpan({cls:"af-badge",text:s.scope});let d=n.createDiv({cls:`af-agent-card-toggle${s.enabled?" on":""}`});d.onclick=g=>{g.stopPropagation(),this.plugin.mcpManager.toggleServerEnabled(s.name,!s.enabled).then(()=>{this.plugin.mcpManager.invalidateCache(),this.render()})};let u=a.createDiv({cls:`af-mcp-status-badge ${s.enabled?s.status:"disabled"}`}),h=u.createSpan();if(s.enabled?((0,b.setIcon)(h,s.status==="connected"?"check-circle":s.status==="needs-auth"?"alert-circle":"x-circle"),u.createSpan({text:s.status==="connected"?" Connected":s.status==="needs-auth"?" Needs auth":s.status==="error"?" Error":" Disconnected"})):((0,b.setIcon)(h,"pause"),u.createSpan({text:" Disabled"})),s.description){let g=this.truncateDescription(s.description,120);a.createDiv({cls:"af-mcp-description",text:g})}let m=s.url??s.command??"";m&&a.createDiv({cls:"af-mcp-command",text:kt(m,60)});let f=s.toolDetails.length>0?`${s.toolDetails.length} tools`:s.tools.length>0?`${s.tools.length} tools`:"No tools discovered",p=a.createDiv({cls:"af-mcp-tool-footer"}),v=p.createDiv({cls:"af-mcp-tool-count"}),k=v.createSpan();(0,b.setIcon)(k,"wrench"),v.createSpan({text:` ${f}`});let w=s.toolDetails.length>0?s.toolDetails.map(g=>g.name):s.tools;if(w.length>0){let g=p.createDiv({cls:"af-mcp-tool-chips"}),y=w.slice(0,4);for(let x of y)g.createSpan({cls:"af-mcp-tool-chip",text:x});w.length>4&&g.createSpan({cls:"af-mcp-tool-chip af-mcp-tool-chip-more",text:`+${w.length-4}`})}if(this.authenticatingServers.has(s.name)){let y=a.createDiv({cls:"af-mcp-auth-row"}).createEl("button",{cls:"af-btn-sm primary",attr:{disabled:"true"}}),x=y.createSpan({cls:"af-spin"});(0,b.setIcon)(x,"loader-2"),y.appendText(" Authenticating\u2026")}else if(s.enabled&&s.status==="needs-auth"){let y=a.createDiv({cls:"af-mcp-auth-row"}).createEl("button",{cls:"af-btn-sm primary"}),x=y.createSpan();(0,b.setIcon)(x,"key"),y.appendText(" Authenticate"),y.onclick=T=>{T.stopPropagation(),this.authenticateMcpServer(s)}}else if(s.enabled&&s.status==="connected"&&s.type!=="stdio"&&s.toolDetails.length===0){let g=a.createDiv({cls:"af-mcp-hint-row"});g.createSpan({text:"Tools available to agents via Claude \u2014 "});let y=g.createEl("a",{cls:"af-link",text:"discover tools"});y.onclick=x=>{x.stopPropagation(),x.preventDefault(),this.authenticateMcpServer(s)}}a.onclick=()=>this.openMcpDetailSlideover(s)}async authenticateMcpServer(e){if(!e.url){new b.Notice("No URL found for this server \u2014 can't authenticate.");return}this.authenticatingServers.add(e.name),this.render(),new b.Notice(`Authenticating ${e.name}\u2026 Complete authorization in your browser.`,1e4);try{let s=e.type==="sse"?"sse":"http";await this.plugin.mcpManager.authenticateServer(e.name,e.url,s),new b.Notice(`${e.name} authenticated successfully!`),await this.plugin.mcpManager.getServers(!0)}catch(s){let a=s instanceof Error?s.message:String(s);new b.Notice(`Authentication failed: ${a}`,8e3)}finally{this.authenticatingServers.delete(e.name),this.render()}}truncateDescription(e,s){let a=e.split(`
`)[0]??e,n=a.split(/(?<=[.!?])\s/)[0]??a,i=n.length<a.length?n:a;return i.length<=s?i:i.slice(0,s-1)+"\u2026"}openMcpDetailSlideover(e){this.contentEl.querySelector(".af-slideover-overlay")?.remove();let s=this.contentEl.createDiv({cls:"af-slideover-overlay"}),a=s.createDiv({cls:"af-slideover"}),n=a.createDiv({cls:"af-slideover-header"});n.createDiv({cls:"af-slideover-title",text:e.name});let i=n.createEl("button",{cls:"clickable-icon"});(0,b.setIcon)(i,"cross"),i.onclick=()=>s.remove(),s.onclick=f=>{f.target===s&&s.remove()};let o=a.createDiv({cls:"af-slideover-body"});if(e.description){let f=o.createDiv({cls:"af-slideover-section"});f.createDiv({cls:"af-slideover-section-title",text:"DESCRIPTION"}),f.createDiv({cls:"af-mcp-detail-description",text:e.description})}let l=o.createDiv({cls:"af-slideover-section"});l.createDiv({cls:"af-slideover-section-title",text:"SERVER INFO"}),this.renderDetailRow(l,"Name",e.name),this.renderDetailRow(l,"Type",e.type),this.renderDetailRow(l,"Status",e.status),this.renderDetailRow(l,"Scope",e.scope),e.url&&this.renderDetailRow(l,"URL",e.url),e.command&&this.renderDetailRow(l,"Command",e.command),e.args&&this.renderDetailRow(l,"Args",e.args);let c=o.createDiv({cls:"af-slideover-section"}),d=e.toolDetails.length||e.tools.length;if(c.createDiv({cls:"af-slideover-section-title",text:`AVAILABLE TOOLS (${d})`}),e.toolDetails.length>0)for(let f of e.toolDetails){let p=c.createDiv({cls:"af-mcp-tool-detail"}),v=p.createDiv({cls:"af-mcp-tool-detail-header"}),k=v.createSpan({cls:"af-mcp-tool-detail-name"}),w=k.createSpan();if((0,b.setIcon)(w,"wrench"),k.createSpan({text:` ${f.name}`}),f.inputSchema){let g=f.inputSchema.required??[];g.length>0&&v.createSpan({cls:"af-mcp-tool-param-count",text:`${g.length} param${g.length!==1?"s":""}`})}if(f.description){let g=f.description.split(`
`).filter(T=>T.trim()),y=g.slice(0,2).join(" ").trim();if(g.length>2){let T=p.createEl("details",{cls:"af-mcp-tool-detail-desc"});T.createEl("summary",{text:this.truncateDescription(y,200)}),T.createDiv({cls:"af-mcp-tool-detail-full",text:f.description})}else p.createDiv({cls:"af-mcp-tool-detail-desc",text:y})}if(f.inputSchema){let g=f.inputSchema.properties,y=new Set(f.inputSchema.required??[]);if(g&&Object.keys(g).length>0){let x=p.createDiv({cls:"af-mcp-tool-params"});for(let[T,C]of Object.entries(g)){let A=x.createDiv({cls:"af-mcp-tool-param"});A.createSpan({cls:"af-mcp-tool-param-name",text:T}),C.type&&A.createSpan({cls:"af-mcp-tool-param-type",text:C.type}),y.has(T)&&A.createSpan({cls:"af-mcp-tool-param-required",text:"required"}),C.description&&A.createSpan({cls:"af-mcp-tool-param-desc",text:kt(C.description,80)})}}}}else if(e.tools.length>0)for(let f of e.tools)c.createDiv({cls:"af-mcp-tool-item",text:f});else c.createDiv({cls:"af-form-hint",text:e.status==="connected"?"No tools reported by this server.":"Connect to this server to discover available tools."});let u=o.createDiv({cls:"af-slideover-section"});if(u.createDiv({cls:"af-slideover-section-title",text:"ACTIONS"}),e.enabled&&e.status==="needs-auth"&&e.url){let f=u.createEl("button",{cls:"af-btn-sm primary"}),p=f.createSpan();(0,b.setIcon)(p,"key"),f.appendText(" Authenticate"),f.onclick=()=>{s.remove(),this.authenticateMcpServer(e)}}let h=u.createEl("button",{cls:"af-btn-sm danger"}),m=h.createSpan();(0,b.setIcon)(m,"trash-2"),h.appendText(" Remove Server"),h.onclick=async()=>{try{let f=e.scope==="user"?"user":void 0;await this.plugin.mcpManager.removeServer(e.name,f),new b.Notice(`Server "${e.name}" removed.`),s.remove(),this.render()}catch(f){let p=f instanceof Error?f.message:String(f);new b.Notice(`Failed to remove server: ${p}`)}}}renderAddMcpServerPage(e){let s=e.createDiv({cls:"af-create-agent-page"}),a=s.createDiv({cls:"af-detail-header"}),n=a.createDiv({cls:"af-detail-header-left"}),i=n.createDiv({cls:"af-agent-card-avatar idle"});(0,b.setIcon)(i,"plus");let o=n.createDiv();o.createDiv({cls:"af-detail-header-name",text:"Add MCP Server"}),o.createDiv({cls:"af-detail-header-desc",text:"Register a new MCP server for agents to use"}),a.createDiv({cls:"af-detail-header-actions"});let l={name:"",transport:"stdio",scope:"user",command:"",args:"",envVars:"",url:"",headers:""},c=s.createDiv({cls:"af-create-form"}),d=c.createDiv({cls:"af-create-section"}),u=d.createDiv({cls:"af-create-section-header"}),h=u.createSpan({cls:"af-create-section-icon"});(0,b.setIcon)(h,"plug"),u.createSpan({text:"Server Details"}),this.createFormField(d,"Name","my-server","Unique name for this MCP server",j=>{l.name=j});let m=d.createDiv({cls:"af-form-row"}),f=m.createDiv({cls:"af-form-label"});f.setText("Transport"),this.addTooltip(f,"stdio: local process, http/sse: remote server");let p=m.createEl("select",{cls:"af-form-select"});p.createEl("option",{text:"stdio",attr:{value:"stdio"}}),p.createEl("option",{text:"http",attr:{value:"http"}}),p.createEl("option",{text:"sse",attr:{value:"sse"}});let v=d.createDiv({cls:"af-form-row"}),k=v.createDiv({cls:"af-form-label"});k.setText("Scope"),this.addTooltip(k,"local: this project only, user: available across all projects");let w=v.createEl("select",{cls:"af-form-select"});w.createEl("option",{text:"user",attr:{value:"user"}}),w.createEl("option",{text:"local",attr:{value:"local"}}),w.addEventListener("change",()=>{l.scope=w.value});let g=c.createDiv({cls:"af-create-section"}),y=g.createDiv({cls:"af-create-section-header"}),x=y.createSpan({cls:"af-create-section-icon"});(0,b.setIcon)(x,"terminal"),y.createSpan({text:"Process Configuration"}),this.createFormField(g,"Command","npx @anthropic-ai/mcp-server-memory","The command to run",j=>{l.command=j}),this.createFormField(g,"Arguments","--port 3000","Space-separated arguments (optional)",j=>{l.args=j});let T=g.createDiv({cls:"af-form-label"});T.setText("Environment variables"),this.addTooltip(T,"One KEY=VALUE per line");let C=g.createEl("textarea",{cls:"af-create-prompt-textarea",attr:{placeholder:`API_KEY=sk-...
DEBUG=true`,rows:"3"}});C.addEventListener("input",()=>{l.envVars=C.value});let A=c.createDiv({cls:"af-create-section"}),E=A.createDiv({cls:"af-create-section-header"}),R=E.createSpan({cls:"af-create-section-icon"});(0,b.setIcon)(R,"globe"),E.createSpan({text:"Remote Server Configuration"}),this.createFormField(A,"URL","https://mcp.example.com/sse","Server endpoint URL",j=>{l.url=j});let U=A.createDiv({cls:"af-form-label"});U.setText("Custom headers"),this.addTooltip(U,"One Header: Value per line (optional)");let D=A.createEl("textarea",{cls:"af-create-prompt-textarea",attr:{placeholder:"X-Custom-Header: value",rows:"3"}});D.addEventListener("input",()=>{l.headers=D.value});let K=()=>{g.style.display=l.transport==="stdio"?"":"none",A.style.display=l.transport!=="stdio"?"":"none"};p.addEventListener("change",()=>{l.transport=p.value,K()}),K();let q=s.createDiv({cls:"af-create-footer"}),V=q.createEl("button",{cls:"af-btn-sm",text:"Cancel"});V.onclick=()=>this.navigate("mcp");let $=q.createEl("button",{cls:"af-btn-sm primary af-create-submit"});_($,"plus","af-btn-icon"),$.appendText(" Add Server"),$.onclick=async()=>{let j=l.name.trim();if(!j){new b.Notice("Server name is required.");return}if(l.transport==="stdio"){if(!l.command.trim()){new b.Notice("Command is required for stdio servers.");return}}else if(!l.url.trim()){new b.Notice("URL is required for HTTP/SSE servers.");return}let W={};if(l.envVars.trim())for(let P of l.envVars.split(`
`)){let M=P.trim();if(!M)continue;let I=M.indexOf("=");if(I<=0){new b.Notice(`Invalid env var: ${M}`);return}W[M.slice(0,I)]=M.slice(I+1)}let X={};if(l.headers.trim())for(let P of l.headers.split(`
`)){let M=P.trim();if(!M)continue;let I=M.indexOf(":");if(I<=0){new b.Notice(`Invalid header: ${M}`);return}X[M.slice(0,I).trim()]=M.slice(I+1).trim()}let H=l.args.trim()?l.args.trim().split(/\s+/):void 0;$.disabled=!0,$.setText("Adding...");try{await this.plugin.mcpManager.addServer({name:j,transport:l.transport,scope:l.scope,command:l.transport==="stdio"?l.command.trim():void 0,args:l.transport==="stdio"?H:void 0,envVars:l.transport==="stdio"&&Object.keys(W).length>0?W:void 0,url:l.transport!=="stdio"?l.url.trim():void 0,headers:l.transport!=="stdio"&&Object.keys(X).length>0?X:void 0}),new b.Notice(`Server "${j}" added successfully.`),this.navigate("mcp")}catch(P){let M=P instanceof Error?P.message:String(P);new b.Notice(`Failed to add server: ${M}`),$.disabled=!1,$.setText(""),_($,"plus","af-btn-icon"),$.appendText(" Add Server")}}}createFormField(e,s,a,n,i,o){let l=e.createDiv({cls:"af-form-row"}),c=l.createDiv({cls:"af-form-label"});c.setText(s),n&&this.addTooltip(c,n);let d=l.createEl("input",{cls:"af-form-input",attr:{type:"text",placeholder:a}});o!==void 0&&(d.value=o),d.addEventListener("input",()=>i(d.value))}addTooltip(e,s){let a=e.createSpan({cls:"af-form-tooltip"});(0,b.setIcon)(a,"info"),a.createSpan({cls:"af-tooltip-text",text:s})}};function Xn(r){switch(r){case"connected":return"idle";case"connecting":case"reconnecting":return"pending";case"needs-auth":case"error":return"error";case"stopped":case"disabled":default:return"disabled"}}function pa(r){return r>=1e6?`${(r/1e6).toFixed(1)}M`:r>=1e4?`${Math.round(r/1e3)}K`:r>=1e3?`${(r/1e3).toFixed(1)}K`:String(r)}function no(r){if(!r?.trim())return"not set";let t={"*/5 * * * *":"Every 5 minutes","*/10 * * * *":"Every 10 minutes","*/15 * * * *":"Every 15 minutes","*/30 * * * *":"Every 30 minutes","0 * * * *":"Every hour","0 */2 * * *":"Every 2 hours","0 */4 * * *":"Every 4 hours","0 */6 * * *":"Every 6 hours","0 */12 * * *":"Every 12 hours"};if(t[r])return t[r];let e=r.trim().split(/\s+/);if(e.length===5){let[s,a,n,,i]=e;if(n==="*"&&a&&s){let o=Number(a),l=Number(s);if(!isNaN(o)&&!isNaN(l)){let c=o>=12?"PM":"AM",u=`${o===0?12:o>12?o-12:o}:${String(l).padStart(2,"0")} ${c}`;return i==="*"?`Daily at ${u}`:i==="1-5"?`Weekdays at ${u}`:`${u} on days ${i}`}}}return r}function io(r){switch(r){case"connected":return"green";case"connecting":case"reconnecting":return"blue";case"needs-auth":case"error":return"red";case"stopped":case"disabled":default:return""}}var re=require("obsidian");var Lt=class r extends re.ItemView{constructor(e,s){super(e);this.plugin=s}selectedAgentName=null;sessions=new Map;headerEl;agentSelect;messagesEl;messagesInner;textarea;sendBtn;attachStopBtn;isInStopMode=!1;attachedFiles=[];attachedImages=[];pillsRow;activityEl=null;streamingDot=null;workingIndicator=null;getViewType(){return je}getDisplayText(){return this.selectedAgentName?`Chat: ${this.selectedAgentName}`:"Agent Chat"}getIcon(){return"message-circle"}getState(){return{agentName:this.selectedAgentName??null}}async setState(e,s){await super.setState(e,s),e?.agentName&&typeof e.agentName=="string"&&this.selectAgent(e.agentName)}async onOpen(){this.plugin.subscribeView(this),this.buildShell(),await this.render()}async onClose(){for(let{session:e}of this.sessions.values())e.abort();this.sessions.clear(),this.plugin.unsubscribeView(this)}selectAgent(e){let s=this.plugin.app.workspace.getLeavesOfType(je);for(let a of s)if(a.view!==this&&a.view instanceof r&&a.view.selectedAgentName===e){this.plugin.app.workspace.revealLeaf(a);return}this.selectedAgentName=e,this.agentSelect&&(this.agentSelect.value=e),this.leaf.updateHeader(),this.switchToAgent(e)}buildShell(){let e=this.contentEl;e.empty(),e.addClass("af-root");let s=e.createDiv({cls:"af-chat-view-container"});this.headerEl=s.createDiv({cls:"af-chat-view-header"}),this.agentSelect=this.headerEl.createEl("select",{cls:"af-chat-view-agent-select"});let a=this.headerEl.createEl("button",{cls:"af-btn-sm af-chat-view-new-btn"});_(a,"plus","af-btn-icon"),a.appendText(" New Chat"),a.onclick=()=>void this.handleNewChat(),this.agentSelect.onchange=()=>{let l=this.agentSelect.value;if(l){let c=this.plugin.app.workspace.getLeavesOfType(je);for(let d of c)if(d.view!==this&&d.view instanceof r&&d.view.selectedAgentName===l){this.plugin.app.workspace.revealLeaf(d),this.agentSelect.value=this.selectedAgentName??"";return}this.textarea.disabled=!1,this.textarea.placeholder="Message the agent\u2026 (Ctrl+Enter to send)",this.switchToAgent(l)}},this.messagesEl=s.createDiv({cls:"af-chat-messages"}),this.messagesInner=this.messagesEl.createDiv({cls:"af-chat-messages-inner"});let n=s.createDiv({cls:"af-chat-input-area"});this.pillsRow=n.createDiv({cls:"af-chat-pills-row"}),this.pillsRow.style.display="none";let i=n.createDiv({cls:"af-chat-input-row"});this.attachStopBtn=i.createEl("button",{cls:"af-chat-attach-btn"}),_(this.attachStopBtn,"plus","af-btn-icon"),this.attachStopBtn.title="Attach active document",this.attachStopBtn.onclick=()=>{this.isInStopMode?this.handleStop():this.attachActiveDocument()},this.textarea=i.createEl("textarea",{cls:"af-chat-input",attr:{placeholder:"Message the agent\u2026 (Ctrl+Enter to send)",rows:"1"}}),this.sendBtn=i.createEl("button",{cls:"af-chat-send-btn"}),_(this.sendBtn,"arrow-up","af-btn-icon"),this.sendBtn.style.display="none";let o=()=>{this.textarea.style.height="auto";let l=Math.min(this.textarea.scrollHeight,160);this.textarea.style.height=`${l}px`,this.textarea.style.overflowY=this.textarea.scrollHeight>160?"auto":"hidden",this.sendBtn.style.display=this.textarea.value.trim()?"flex":"none"};this.textarea.addEventListener("input",o),this.sendBtn.onclick=()=>void this.handleSend(),this.textarea.onkeydown=l=>{l.key==="Enter"&&(l.ctrlKey||l.metaKey)&&(l.preventDefault(),this.handleSend())},this.textarea.addEventListener("paste",l=>{let c=l.clipboardData?.items;if(c)for(let d=0;d<c.length;d++){let u=c[d];if(u.type.startsWith("image/")){l.preventDefault();let h=u.getAsFile();h&&this.attachImageBlob(h);return}}}),n.addEventListener("dragover",l=>{l.preventDefault(),l.stopPropagation(),n.addClass("af-chat-input-dragover")}),n.addEventListener("dragleave",()=>{n.removeClass("af-chat-input-dragover")}),n.addEventListener("drop",l=>{l.preventDefault(),l.stopPropagation(),n.removeClass("af-chat-input-dragover");let c=l.dataTransfer?.files;if(c)for(let d=0;d<c.length;d++){let u=c[d];u.type.startsWith("image/")&&this.attachImageBlob(u)}})}async render(){this.populateAgentDropdown()}populateAgentDropdown(){let e=this.plugin.runtime.getSnapshot().agents,s=this.agentSelect.value;if(this.agentSelect.empty(),e.length===0){let n=this.agentSelect.createEl("option",{text:"No agents available",attr:{value:"",disabled:"true"}});n.selected=!0,this.textarea.disabled=!0,this.showEmptyState();return}if(!this.selectedAgentName){let n=this.agentSelect.createEl("option",{text:"Select agent\u2026",attr:{value:"",disabled:"true"}});n.selected=!0}for(let n of e){let i=n.avatar?.trim(),o=i&&!/^[a-z][a-z0-9-]*$/.test(i)?`${i} `:"";this.agentSelect.createEl("option",{text:`${o}${n.name}`,attr:{value:n.name}})}if(this.selectedAgentName&&e.some(n=>n.name===this.selectedAgentName))this.agentSelect.value=this.selectedAgentName,this.textarea.disabled=!1;else if(s&&e.some(n=>n.name===s))this.agentSelect.value=s,this.selectedAgentName=s,this.textarea.disabled=!1;else{this.selectedAgentName=null,this.leaf.updateHeader(),this.textarea.disabled=!0,this.textarea.placeholder="Select an agent to start chatting\u2026",this.showEmptyState();return}this.leaf.updateHeader(),this.textarea.placeholder="Message the agent\u2026 (Ctrl+Enter to send)";let a=this.messagesInner.querySelector(".af-chat-bubble")!==null;this.selectedAgentName&&!a&&this.switchToAgent(this.selectedAgentName)}showEmptyState(){this.messagesInner.empty();let e=this.messagesInner.createDiv({cls:"af-chat-view-empty"}),s=e.createDiv({cls:"af-chat-view-empty-icon"});this.plugin.runtime.getSnapshot().agents.length===0?((0,re.setIcon)(s,"bot"),e.createDiv({cls:"af-chat-view-empty-text",text:"No agents available"}),e.createDiv({cls:"af-chat-view-empty-hint",text:"Create an agent to start chatting"})):((0,re.setIcon)(s,"message-circle"),e.createDiv({cls:"af-chat-view-empty-text",text:"Select an agent to start"}),e.createDiv({cls:"af-chat-view-empty-hint",text:"Choose an agent from the dropdown above"}))}async switchToAgent(e){let a=this.plugin.runtime.getSnapshot().agents.find(i=>i.name===e);if(!a)return;this.selectedAgentName=e,this.leaf.updateHeader(),this.activityEl=null,this.streamingDot=null,this.messagesInner.empty();let n=this.sessions.get(e);if(!n){let i=new xt(a,this.plugin.settings,this.plugin.repository,this.app.vault);n={session:i},this.sessions.set(e,n),await i.loadPersistedState()}for(let i of n.session.messages)if(i.role==="user")this.addBubble("user",i.content,i.attachments);else{let o=this.addBubble("assistant");this.renderMarkdownBubble(o,i.content),o._setRawText?.(i.content),i.toolCalls&&i.toolCalls.length>0&&this.buildToolSummary(i.toolCalls)}this.textarea.disabled=!1,this.textarea.focus()}getCurrentSession(){if(this.selectedAgentName)return this.sessions.get(this.selectedAgentName)}renderMarkdownBubble(e,s){let a=e.querySelector(".af-chat-copy-btn"),n=a?.parentNode?.removeChild(a)??null;e.empty(),e.addClass("af-compact-md"),re.MarkdownRenderer.render(this.app,s,e,"",this.plugin).then(()=>{n&&e.appendChild(n),e.querySelectorAll("pre").forEach(i=>{i.querySelector(".copy-code-button")?.remove();let o=i.querySelector("code");if(!o)return;let l=document.createElement("button");l.className="af-code-copy-btn",l.setAttribute("aria-label","Copy code"),(0,re.setIcon)(l,"copy"),l.onclick=c=>{c.stopPropagation(),navigator.clipboard.writeText(o.textContent??"").then(()=>{l.addClass("copied"),(0,re.setIcon)(l,"check"),setTimeout(()=>{l.removeClass("copied"),(0,re.setIcon)(l,"copy")},1500)})},i.style.position="relative",i.appendChild(l)})})}addCopyBtn(e,s){let a=e.createEl("button",{cls:"af-chat-copy-btn",attr:{"aria-label":"Copy message"}});(0,re.setIcon)(a,"copy"),a.onclick=n=>{n.stopPropagation(),navigator.clipboard.writeText(s()).then(()=>{a.addClass("copied"),(0,re.setIcon)(a,"check"),setTimeout(()=>{a.removeClass("copied"),(0,re.setIcon)(a,"copy")},1500)})}}addBubble(e,s,a){if(e==="user"&&a&&a.length>0){let i=this.messagesInner.createDiv({cls:"af-chat-bubble-attachments"});for(let o of a){let l=i.createSpan({cls:"af-chat-pill af-chat-pill-inline"}),c=l.createSpan({cls:"af-chat-pill-icon"}),d=/\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(o);(0,re.setIcon)(c,d?"image":"file-text"),l.createSpan({cls:"af-chat-pill-name",text:o})}}let n=this.messagesInner.createDiv({cls:`af-chat-bubble af-chat-bubble-${e}`});if(s&&(e==="assistant"?this.renderMarkdownBubble(n,s):n.setText(s)),e==="assistant"){let i=s??"";this.addCopyBtn(n,()=>i),n._setRawText=o=>{i=o}}return this.messagesEl.scrollTop=this.messagesEl.scrollHeight,n}buildToolSummary(e){let s=this.messagesInner.createDiv({cls:"af-chat-tool-summary"}),a=s.createEl("details"),n=a.createEl("summary"),i=new Map;for(let c of e){let d=i.get(c.name)??[];c.command&&d.push(c.command),i.set(c.name,d)}let o=n.createSpan({cls:"af-chat-tool-icon"});(0,re.setIcon)(o,"wrench"),n.appendText(` ${e.length} tool call${e.length!==1?"s":""}`);let l=a.createDiv({cls:"af-chat-tool-list"});for(let[c,d]of i){let u=d.length||(i.get(c)?.length??1),h=l.createDiv({cls:"af-chat-tool-item"}),m=u>1?`${c} (\xD7${u})`:c;h.createSpan({cls:"af-chat-tool-name",text:m}),d.length===1&&d[0]&&h.createSpan({cls:"af-chat-tool-cmd",text:d[0]})}return s}setActivity(e){e?(this.activityEl||(this.activityEl=this.messagesInner.createDiv({cls:"af-chat-activity"})),this.activityEl.setText(`Working\u2026 (${e})`)):this.activityEl&&(this.activityEl.remove(),this.activityEl=null)}setStreaming(e){if(e&&!this.streamingDot){this.streamingDot=this.messagesInner.createDiv({cls:"af-chat-streaming-dot"});for(let s=0;s<3;s++)this.streamingDot.createSpan()}else!e&&this.streamingDot&&(this.streamingDot.remove(),this.streamingDot=null);this.setAttachStopMode(e)}setAttachStopMode(e){e!==this.isInStopMode&&(this.isInStopMode=e,this.attachStopBtn.empty(),e?(_(this.attachStopBtn,"square","af-btn-icon"),this.attachStopBtn.title="Stop generation",this.attachStopBtn.addClass("af-chat-stop-mode")):(_(this.attachStopBtn,"plus","af-btn-icon"),this.attachStopBtn.title="Attach active document",this.attachStopBtn.removeClass("af-chat-stop-mode")))}handleStop(){let e=this.getCurrentSession();e&&(e.session.abort(),this.setActivity(),this.setStreaming(!1),this.addBubble("error","Generation stopped"))}showWorkingIndicator(e){if(e&&!this.workingIndicator){let s=this.textarea.closest(".af-chat-input-area");s&&(this.workingIndicator=createDiv({cls:"af-chat-working-indicator"}),this.workingIndicator.setText("Agent is working\u2026"),s.insertBefore(this.workingIndicator,s.firstChild))}else!e&&this.workingIndicator&&(this.workingIndicator.remove(),this.workingIndicator=null)}attachActiveDocument(){let e=this.app.workspace.getActiveFile();if(!e){new re.Notice("No active document to attach");return}if(this.attachedFiles.some(n=>n.path===e.path)){new re.Notice(`"${e.name}" is already attached`);return}let s=e.extension.toLowerCase();if(!new Set(["md","txt","json","yaml","yml","toml","csv","xml","html","css","js","ts","py","sh","sql","env","cfg","ini","log"]).has(s)){new re.Notice(`Can't attach "${e.name}" \u2014 only text files are supported`);return}this.attachedFiles.push(e),this.renderPills()}async attachImageBlob(e){let s=e.type.split("/")[1]?.replace("jpeg","jpg")??"png",a=Date.now(),n=e.name&&e.name!=="image"?e.name:`pasted-${a}.${s}`;if(this.attachedImages.some(l=>l.name===n)){new re.Notice(`"${n}" is already attached`);return}let i=`${this.plugin.settings.fleetFolder}/chat-images`,o=`${i}/${a}-${n}`;try{this.app.vault.getAbstractFileByPath(i)||await this.app.vault.createFolder(i);let l=await e.arrayBuffer();await this.app.vault.createBinary(o,l);let u=`${this.app.vault.adapter.getBasePath?.()??""}/${o}`;this.attachedImages.push({name:n,path:u}),this.renderPills()}catch(l){let c=l instanceof Error?l.message:String(l);new re.Notice(`Failed to save image: ${c}`)}}removeAttachment(e){this.attachedFiles=this.attachedFiles.filter(s=>s.path!==e),this.attachedImages=this.attachedImages.filter(s=>s.path!==e),this.renderPills()}renderPills(){if(this.pillsRow.empty(),this.attachedFiles.length+this.attachedImages.length===0){this.pillsRow.style.display="none";return}this.pillsRow.style.display="flex";for(let s of this.attachedFiles){let a=this.pillsRow.createDiv({cls:"af-chat-pill"}),n=a.createSpan({cls:"af-chat-pill-icon"});(0,re.setIcon)(n,"file-text"),a.createSpan({cls:"af-chat-pill-name",text:s.name});let i=a.createSpan({cls:"af-chat-pill-remove"});(0,re.setIcon)(i,"x"),i.onclick=o=>{o.stopPropagation(),this.removeAttachment(s.path)}}for(let s of this.attachedImages){let a=this.pillsRow.createDiv({cls:"af-chat-pill"}),n=a.createSpan({cls:"af-chat-pill-icon"});(0,re.setIcon)(n,"image"),a.createSpan({cls:"af-chat-pill-name",text:s.name});let i=a.createSpan({cls:"af-chat-pill-remove"});(0,re.setIcon)(i,"x"),i.onclick=o=>{o.stopPropagation(),this.removeAttachment(s.path)}}}async buildAttachmentContext(){if(this.attachedFiles.length+this.attachedImages.length===0)return"";let s=[];for(let a of this.attachedFiles)try{let n=await this.app.vault.cachedRead(a);s.push(`### ${a.name}
\`\`\`
${n}
\`\`\``)}catch{s.push(`### ${a.name}
(Could not read file)`)}for(let a of this.attachedImages)s.push(`### Image: ${a.name}
The image file is located at: ${a.path}
Please read and analyze this image.`);return`## Attached Files

${s.join(`

`)}

---

`}async handleSend(){let e=this.getCurrentSession();if(!e)return;let s=this.textarea.value.trim();if(!s)return;let a=await this.buildAttachmentContext(),n=[...this.attachedFiles.map(d=>d.name),...this.attachedImages.map(d=>d.name)];this.textarea.value="",this.textarea.style.height="auto",this.sendBtn.style.display="none",this.attachedFiles=[],this.attachedImages=[],this.renderPills();let i=a?`${a}${s}`:void 0;if(this.addBubble("user",s,n.length>0?n:void 0),e.session.isStreaming){e.session.injectMessage(s,i,n.length>0?n:void 0);return}this.setStreaming(!0);let o=null,l="",c=!1;try{await e.session.sendMessage(s,d=>{if(d.type==="text"){c||(this.setActivity(),this.setStreaming(!1),o=this.addBubble("assistant"),c=!0),l+=d.content;let u=o.querySelector(".af-chat-stream-text");u||(u=o.createDiv({cls:"af-chat-stream-text"})),u.setText(l)}else d.type==="tool_use"?this.setActivity(d.toolName):d.type==="result"&&(this.setActivity(),this.setStreaming(!1),c&&o&&(this.renderMarkdownBubble(o,l),o._setRawText?.(l)),d.toolCalls&&d.toolCalls.length>0&&this.buildToolSummary(d.toolCalls),l="",c=!1,o=null,this.setStreaming(!0))},i,n.length>0?n:void 0),this.setActivity(),this.setStreaming(!1)}catch(d){this.setActivity(),this.setStreaming(!1);let u=d instanceof Error?d.message:String(d);u!=="Aborted"&&this.addBubble("error",`Error: ${u}`)}}async handleNewChat(){let e=this.getCurrentSession();!e||!this.selectedAgentName||(e.session.abort(),await e.session.clearPersistedState(),this.sessions.delete(this.selectedAgentName),this.activityEl=null,this.streamingDot=null,this.messagesInner.empty(),await this.switchToAgent(this.selectedAgentName))}startFreshIntro(e){this.setStreaming(!0);let s="",a=null,n=!1;e.sendMessage("Please introduce yourself and briefly describe your capabilities and what you can help with.",i=>{i.type==="text"?(n||(this.setActivity(),this.setStreaming(!1),a=this.addBubble("assistant"),n=!0),s+=i.content,a.setText(s)):i.type==="tool_use"&&this.setActivity(i.toolName)}).then(i=>{this.setActivity(),this.setStreaming(!1),n&&a?(this.renderMarkdownBubble(a,s),a._setRawText?.(s)):i.text.trim()&&(a=this.addBubble("assistant"),this.renderMarkdownBubble(a,i.text),a._setRawText?.(i.text)),i.toolCalls.length>0&&this.buildToolSummary(i.toolCalls),this.textarea.focus()}).catch(i=>{this.setActivity(),this.setStreaming(!1);let o=i instanceof Error?i.message:String(i);o!=="Aborted"&&this.addBubble("error",`Error: ${o}`)})}};var Os=class r extends ue.Plugin{settings={...Ge};repository;runtime;get mcpManager(){return this.runtime.mcpManager}mcpAuth=new hs;channelCredentials=new ys;channelManager;secretStore;statusBarEl;subscribedViews=new Set;vaultChangeTimer;suppressVaultEvents=!1;suppressTimer;runtimeUnsubscribe;async onload(){await this.loadSettings(),this.settings.claudeCliPath=await this.resolveClaudeCliPath(this.settings.claudeCliPath),this.repository=new Mt(this.app.vault,this.settings),this.repository.setChannelCredentialGetter(()=>this.channelCredentials.toRecord()),this.runtime=new Nt(this.repository,this.settings),this.registerView(it,a=>new Yt(a,this)),this.registerView(ut,a=>new Fs(a,this)),this.registerView(je,a=>new Lt(a,this)),this.addSettingTab(new rs(this)),await this.repository.ensureFleetStructure()&&await this.repository.ensureSamples();let e=await this.repository.updateDefaults(this.settings.defaultFileHashes??{});JSON.stringify(e)!==JSON.stringify(this.settings.defaultFileHashes??{})&&(this.settings.defaultFileHashes=e,await this.saveData(this.settings)),await this.runtime.initialize(),await this.verifyClaudeCli(!1),this.addRibbonIcon("bot","Agent Fleet Dashboard",()=>void this.activateDashboardView()),this.addRibbonIcon("message-circle","Agent Chat",()=>{let a=this.app.workspace.getLeavesOfType(je);a.length>0?this.app.workspace.revealLeaf(a[0]):this.openChatView()}),this.addCommands(),this.registerVaultHandlers(),this.registerRuntimeListeners();let s=this.app.secretStorage;this.secretStore=new gs(s),this.channelCredentials.setSecretStore(this.secretStore),!this.settings.secretsMigrated&&this.secretStore.available?(this.channelCredentials.loadCredentials(this.settings.channelCredentials??{}),this.settings.mcpTokens={},this.settings.mcpApiKeys={},this.settings.channelCredentials={},this.settings.secretsMigrated=!0,await this.saveData(this.settings)):this.channelCredentials.loadCredentials(this.secretStore.available?void 0:this.settings.channelCredentials??{}),this.secretStore.available||this.channelCredentials.onChanged(a=>{this.settings.channelCredentials=a,this.saveSettings()}),this.channelManager=new fs({getRepository:()=>this.repository,vault:this.app.vault,getSettings:()=>this.settings,getChannelCredentials:()=>this.channelCredentials.toRecord(),adapterFactory:(a,n)=>{if(a.type==="slack")return new Is(a,n);if(a.type==="telegram")return new Ls(a,n);throw new Error(`Channel type \`${a.type}\` is not yet supported in this version.`)}});try{await this.channelManager.start(this.runtime.getSnapshot())}catch(a){console.error("Agent Fleet: channel manager failed to start",a),new ue.Notice("Agent Fleet: channel manager failed to start \u2014 check console.")}this.runtime.onHeartbeatResult((a,n,i)=>{this.channelManager?.broadcastToChannel(n,`*Heartbeat \u2014 ${a}*

${i}`).catch(o=>{console.warn(`Agent Fleet: heartbeat channel post failed for ${a}`,o)})}),this.refreshStatusBar(),this.mcpManager.setAuthManager(this.mcpAuth),this.mcpManager.getServers().then(()=>{this.notifyViews()}),this.registerInterval(window.setInterval(()=>void this.mcpManager.refreshProbeTokens(),30*6e4)),new ue.Notice("Agent Fleet loaded.")}onunload(){this.runtimeUnsubscribe?.(),this.runtimeUnsubscribe=void 0,this.vaultChangeTimer&&(clearTimeout(this.vaultChangeTimer),this.vaultChangeTimer=void 0),this.suppressTimer&&(clearTimeout(this.suppressTimer),this.suppressTimer=void 0),this.app.workspace.detachLeavesOfType(it),this.app.workspace.detachLeavesOfType(ut),this.app.workspace.detachLeavesOfType(je),this.channelManager?.stop()}async loadSettings(){this.settings={...Ge,...await this.loadData()}}async saveSettings(){this.settings.claudeCliPath=await this.resolveClaudeCliPath(this.settings.claudeCliPath),await this.saveData(this.settings),this.repository&&this.runtime&&(this.repository=new Mt(this.app.vault,this.settings),this.repository.setChannelCredentialGetter(()=>this.channelCredentials.toRecord()),this.runtime=new Nt(this.repository,this.settings),await this.repository.ensureFleetStructure(),await this.runtime.initialize(),this.registerRuntimeListeners(),this.notifyViews(),this.refreshStatusBar(),this.channelCredentials.loadCredentials(this.secretStore.available?void 0:this.settings.channelCredentials??{}),this.channelManager?.reconcile(this.runtime.getSnapshot()))}subscribeView(t){this.subscribedViews.add(t)}unsubscribeView(t){this.subscribedViews.delete(t)}async activateDashboardView(){let t=this.app.workspace.getLeavesOfType(it);if(t.length>0){this.app.workspace.revealLeaf(t[0]);return}await this.app.workspace.getLeaf(!0).setViewState({type:it,active:!0})}async navigateDashboard(t,e){await this.activateDashboardView();let a=this.app.workspace.getLeavesOfType(it)[0];if(a){let n=a.view;n instanceof Yt&&n.navigateTo(t,e)}}async activateAgentsView(){let t=this.getLeafForView(ut,"left");await t.setViewState({type:ut,active:!0}),this.app.workspace.revealLeaf(t)}async openChatView(t){if(t){let s=this.app.workspace.getLeavesOfType(je);for(let a of s)if(a.view instanceof Lt&&a.view.selectedAgentName===t){this.app.workspace.revealLeaf(a);return}}let e=this.app.workspace.getRightLeaf(!1)??this.app.workspace.getLeaf(!0);await e.setViewState({type:je,active:!0,state:t?{agentName:t}:{}}),this.app.workspace.revealLeaf(e),t&&e.view instanceof Lt&&e.view.selectAgent(t)}async refreshFromVault(){this.suppressVaultEvents=!0;try{await this.runtime.refreshFromVault(),this.notifyViews(),this.refreshStatusBar(),this.channelManager?.reconcile(this.runtime.getSnapshot())}finally{this.suppressTimer&&clearTimeout(this.suppressTimer),this.suppressTimer=setTimeout(()=>{this.suppressTimer=void 0,this.suppressVaultEvents=!1},500)}}refreshStatusBar(){if(!this.settings.showStatusBar){this.statusBarEl?.detach(),this.statusBarEl=void 0;return}this.statusBarEl||(this.statusBarEl=this.addStatusBarItem(),this.statusBarEl.onclick=()=>void this.activateDashboardView());let t=this.runtime.getFleetStatus();this.statusBarEl.setText(`\u{1F916} ${t.running} running \xB7 ${t.pending} pending \xB7 ${t.completedToday} completed today`)}async verifyClaudeCli(t=!0){let e=await this.resolveClaudeCliPath(this.settings.claudeCliPath);return this.settings.claudeCliPath=e,await new Promise(s=>{let a=`'${e.replace(/'/g,"'\\''")}' --version`,n=(0,ma.spawn)("/bin/zsh",["-l","-c",a]),i="";n.stderr.on("data",o=>{i+=o.toString()}),n.on("close",o=>{let l=o===0;l||console.error("Agent Fleet: Claude CLI verification failed",i),t&&new ue.Notice(l?"Claude CLI available.":"Claude CLI verification failed \u2014 check Claude CLI Path in settings."),s(l)}),n.on("error",o=>{console.error("Agent Fleet: Claude CLI verification error",o),t&&new ue.Notice("Claude CLI verification failed \u2014 check Claude CLI Path in settings."),s(!1)})})}async openPath(t){let e=this.app.vault.getAbstractFileByPath((0,ue.normalizePath)(t));e instanceof ue.TFile&&await this.app.workspace.getLeaf(!0).openFile(e)}async createAgentTemplate(){await this.navigateDashboard("create-agent")}async createSkillTemplate(){await this.navigateDashboard("create-skill")}async openCreateTask(){await this.navigateDashboard("create-task")}async runAgentPrompt(t){let e=this.repository.getAgentByName(t);if(!e){new ue.Notice(`Unknown agent: ${t}`);return}await this.runtime.runAgentNow(e,"Run now and summarize the current state.")}async chatWithAgent(t){if(!this.repository.getAgentByName(t)){new ue.Notice(`Unknown agent: ${t}`);return}await this.openChatView(t)}async deleteAgent(t){if(!this.repository.getAgentByName(t)){new ue.Notice(`Unknown agent: ${t}`);return}let s=this.repository.getTasksForAgent(t),a=this.runtime.getRecentRuns().filter(o=>o.agent===t),n=this.repository.getMemoryPath(t),i=!!this.app.vault.getAbstractFileByPath(n);new is(this.app,{agentName:t,taskCount:s.length,runCount:a.length,hasMemory:i},async o=>{let l=await this.repository.deleteAgent(t,o);await new Promise(c=>setTimeout(c,200)),await this.refreshFromVault(),new ue.Notice(`Deleted agent "${t}" (${l.trashedFiles.length} files moved to trash)`),await this.navigateDashboard("agents")}).open()}async toggleAgent(t,e){let s=this.repository.getAgentByName(t);if(!s)return;let a=this.app.vault.getAbstractFileByPath(s.filePath);if(!(a instanceof ue.TFile))return;let n=await this.app.vault.cachedRead(a),{frontmatter:i,body:o}=se(n);i.enabled=e,await this.app.vault.modify(a,ee(i,o)),await this.refreshFromVault()}addCommands(){this.addCommand({id:"open-dashboard",name:"Open Dashboard",callback:()=>void this.activateDashboardView()}),this.addCommand({id:"open-agents-panel",name:"Open Agents Panel",callback:()=>void this.activateAgentsView()}),this.addCommand({id:"open-chat",name:"Open Agent Chat",callback:()=>{let t=this.app.workspace.getLeavesOfType(je);t.length>0?this.app.workspace.revealLeaf(t[0]):this.openChatView()}}),this.addCommand({id:"new-chat-tab",name:"New Chat Tab",callback:()=>void this.openChatView()}),this.addCommand({id:"new-agent",name:"New Agent",callback:()=>void this.createAgentTemplate()}),this.addCommand({id:"new-skill",name:"New Skill",callback:()=>void this.createSkillTemplate()}),this.addCommand({id:"new-task",name:"New Task",callback:()=>void this.openCreateTask()}),this.addCommand({id:"run-agent-now",name:"Run Agent Now",callback:()=>{let t=this.runtime.getSnapshot().agents[0];t?this.runAgentPrompt(t.name):new ue.Notice("No agents configured.")}}),this.addCommand({id:"pause-all",name:"Pause All",callback:()=>{this.runtime.scheduler.pauseAll(),new ue.Notice("Agent Fleet paused.")}}),this.addCommand({id:"resume-all",name:"Resume All",callback:()=>{this.runtime.scheduler.resumeAll(),new ue.Notice("Agent Fleet resumed.")}}),this.addCommand({id:"view-fleet-status",name:"View Fleet Status",callback:()=>{let t=this.runtime.getFleetStatus();new ue.Notice(`${t.running} running \xB7 ${t.pending} pending \xB7 ${t.completedToday} completed today`)}})}debouncedVaultRefresh(){this.suppressVaultEvents||(this.vaultChangeTimer&&clearTimeout(this.vaultChangeTimer),this.vaultChangeTimer=setTimeout(()=>{this.suppressVaultEvents||this.refreshFromVault()},500))}registerVaultHandlers(){this.registerEvent(this.app.vault.on("create",t=>{t instanceof ue.TFile&&t.path.startsWith(`${this.settings.fleetFolder}/`)&&this.debouncedVaultRefresh()})),this.registerEvent(this.app.vault.on("modify",t=>{t instanceof ue.TFile&&t.path.startsWith(`${this.settings.fleetFolder}/`)&&this.debouncedVaultRefresh()})),this.registerEvent(this.app.vault.on("rename",t=>{t.path.startsWith(`${this.settings.fleetFolder}/`)&&this.debouncedVaultRefresh()})),this.registerEvent(this.app.vault.on("delete",t=>{t.path.startsWith(`${this.settings.fleetFolder}/`)&&this.debouncedVaultRefresh()}))}registerRuntimeListeners(){this.runtimeUnsubscribe?.(),this.runtimeUnsubscribe=this.runtime.subscribe(()=>{this.notifyViews(),this.refreshStatusBar()})}notifyViews(){for(let t of this.subscribedViews)t.render()}static isValidCliPath(t){return!t||/[\n\r\0]/.test(t)?!1:t.startsWith("/")?/^[\w/.@+-]+$/.test(t):t.startsWith("~")?/^~[\w/.@+-]*$/.test(t):t.includes("/")?!1:/^[\w.@+-]+$/.test(t)}async resolveClaudeCliPath(t){let e=[t,`${(0,Qn.homedir)()}/.local/bin/claude`,"/opt/homebrew/bin/claude","/usr/local/bin/claude","/usr/bin/claude","claude"].filter(s=>!!s&&r.isValidCliPath(s));for(let s of e)if(s.includes("/")&&(0,Jn.existsSync)(s)||!s.includes("/")&&await new Promise(n=>{let i=(0,ma.spawn)(s,["--version"]);i.on("close",o=>n(o===0)),i.on("error",()=>n(!1))}))return s;return t}getLeafForView(t,e){let s=this.app.workspace.getLeavesOfType(t)[0];return s||(e==="right"?this.app.workspace.getRightLeaf(!1)??this.app.workspace.getLeaf(!0):this.app.workspace.getLeftLeaf(!1)??this.app.workspace.getLeaf(!1))}};
