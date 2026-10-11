'use strict';
// Resource Boundaries
const {resolve,sep} = require('node:path');
const APP_CSP = "default-src 'none'; script-src 'self'; script-src-attr 'none'; style-src 'self'; style-src-attr 'none'; img-src 'self' data:; font-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'; worker-src 'none'; media-src 'none'; manifest-src 'none'";
const APP_CSP_HEADER = APP_CSP+"; frame-ancestors 'none'";
const PRINT_CSP = "frame-ancestors 'none'; default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'; worker-src 'none'";
const RESOURCE_TYPES = Object.freeze({
  '/src/index.html':'text/html; charset=utf-8',
  '/src/styles.css':'text/css; charset=utf-8',
  '/src/app.js':'text/javascript; charset=utf-8',
  '/lib/booklet.js':'text/javascript; charset=utf-8',
  '/lib/units.js':'text/javascript; charset=utf-8',
  '/lib/revisions.js':'text/javascript; charset=utf-8',
  '/lib/print-lab.js':'text/javascript; charset=utf-8',
  '/assets/icon-32.png':'image/png'
});
const isReadRequest=request=>Boolean(request && (request.method==='GET' || request.method==='HEAD'));
function resourcePath(projectRoot, requestedUrl) {
  let url;
  try {url = new URL(requestedUrl);} catch {return null;}
  if(url.protocol !== 'skosh:' || url.hostname !== 'app' || url.search || url.hash || url.username || url.password || url.port)return null;
  if(!Object.hasOwn(RESOURCE_TYPES,url.pathname))return null;
  const root=resolve(projectRoot);
  const target=resolve(root,'.'+url.pathname);
  return target.startsWith(root+sep)?{target,mime:RESOURCE_TYPES[url.pathname]}:null;
}
const responseHeaders=(mime,csp)=>Object.freeze({
  'content-type':mime,
  'content-security-policy':csp,
  'x-content-type-options':'nosniff',
  'cross-origin-resource-policy':'same-origin',
  'cache-control':'no-store'
});
module.exports={APP_CSP,APP_CSP_HEADER,PRINT_CSP,RESOURCE_TYPES,isReadRequest,resourcePath,responseHeaders};
