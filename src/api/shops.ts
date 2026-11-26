/**
 * Store products in one shape (ICA Handla products are mapped into it) and
 * the bookmarklet that fills a store's cart or the ICA list.
 */

import { ICA_HANDLA, type IcaProduct } from './ica'

export interface StoreProduct {
  id: string
  name: string
  packSize: string
  price: number
  unitPrice: string
  onSale: boolean
  /** Offer text when the store has one, e.g. "3 för 56 kr". */
  offer?: string
  tags: string[]
  imageUrl?: string
  url: string
}

// ── ICA Handla ──────────────────────────────────────────────────────────────

export function fromIca(store: string, p: IcaProduct): StoreProduct {
  const tags: string[] = []
  if (/sverige/i.test(p.country)) tags.push('Från Sverige')
  else if (p.country) tags.push(`Ursprung: ${p.country}`)
  if (/\beko\b|ekologisk|krav/i.test(p.name)) tags.push('Ekologisk')
  if (/laktosfri/i.test(p.name)) tags.push('Laktosfri')
  return {
    id: p.id,
    name: p.name,
    packSize: p.packSize.replace(/(\d)\.(\d)/, '$1,$2').replace(/(\d)([a-zA-Z])/, '$1 $2'),
    price: p.price,
    unitPrice: p.unitPrice,
    onSale: p.offers.length > 0,
    offer: p.offers[0],
    tags,
    imageUrl: p.image,
    url: `${ICA_HANDLA}/stores/${store}/products/${p.retailerProductId}/details`,
  }
}

/** "Maxi ICA Stormarknad Häggvik" → "ICA Häggvik". */
export function shortIcaName(name: string): string {
  const place = name.replace(/^(maxi\s+)?ica\s+(nära|supermarket|kvantum|stormarknad)?\s*/i, '').trim()
  return place ? `ICA ${place}` : name
}

// ── Bookmarklet ─────────────────────────────────────────────────────────────

/**
 * One bookmarklet for every store. It reads the plan the app put after `#` in
 * the address and, with the page's own login:
 *  - mathem.se: POSTs the products to the cart (cookie csrftoken),
 *  - handlaprivatkund.ica.se: POSTs them to the ICA Handla cart (CSRF from the page),
 *  - willys.se: POSTs them to the Willys cart (CSRF from /axfood/rest/csrf-token),
 *  - www.ica.se: adds the rows to the ICA shopping list with that name (creates it if missing).
 * When that worked it clears the plan from the address, so a second click can't
 * add everything twice (after an error the plan stays, so you can log in and click again).
 *
 * No alert() boxes: progress and the result show in a closable status bar at the
 * top of the store's page, with a button that reloads the page to show the result.
 */
export const STORE_BOOKMARKLET = 'javascript:' + encodeURIComponent(`(async()=>{
const C={info:'#15171a',ok:'#1f7a4d',err:'#b42318'};
const btn=(t,f,l)=>{const e=document.createElement('button');e.textContent=t;if(l)e.setAttribute('aria-label',l);e.onclick=f;e.style.cssText='all:unset;cursor:pointer;padding:6px 14px;border-radius:999px;background:rgba(255,255,255,.18);font:600 14px system-ui,sans-serif';return e};
const say=(t,k,a)=>{let b=document.getElementById('matplan-msg');if(!b){b=document.createElement('div');b.id='matplan-msg';b.setAttribute('role','status');document.body.prepend(b)}
b.style.cssText='position:sticky;top:0;z-index:2147483647;display:flex;gap:10px;align-items:center;padding:12px 16px;color:#fff;background:'+C[k]+';font:600 15px/1.35 system-ui,sans-serif';
b.replaceChildren();const s=document.createElement('span');s.style.flex='1';s.textContent=t;b.append(s);
if(a)b.append(btn(a[0],a[1]));b.append(btn('✕',()=>b.remove(),'Stäng'));scrollTo(0,0)};
if(window.__matplanBusy)return;
const h=location.hash,clear=()=>history.replaceState(null,'',location.pathname+location.search);
const dec=s=>JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(s)))));
const fail=t=>say(t,'err'),done=(t,l)=>{clear();say(t,'ok',[l,()=>location.reload()])};
const bad='Kunde inte läsa listan. Öppna butiken igen via knappen i Matplanering.';
window.__matplanBusy=1;
try{
let m=h.match(/matplan=([^&]+)/);
if(m&&/mathem\\.se$/.test(location.hostname)){
 let plan;try{plan=JSON.parse(atob(decodeURIComponent(m[1])))}catch(e){return fail(bad)}
 say('Lägger '+plan.length+' produkter i Mathem-korgen…','info');
 const c=document.cookie.match(/csrftoken=([^;]+)/);
 const r=await fetch('/api/v1/cart/items/',{method:'POST',credentials:'include',headers:{'content-type':'application/json',accept:'application/json','x-csrftoken':c?c[1]:''},body:JSON.stringify({items:plan.map(p=>({product_id:p[0],quantity:p[1]}))})});
 return r.ok?done('Klart! '+plan.length+' produkter ligger i Mathem-korgen.','Visa korgen'):fail('Mathem svarade '+r.status+(r.status==401||r.status==403?'. Logga in på mathem.se och klicka på bokmärket igen.':'. Försök igen om en stund.'))}
if(m&&location.hostname==='handlaprivatkund.ica.se'){
 let plan;try{plan=dec(m[1])}catch(e){return fail(bad)}
 const s=(location.pathname.match(/stores\\/(\\d+)/)||[])[1];
 const t=[...document.querySelectorAll('script:not([src])')].map(x=>x.textContent).find(x=>x.includes('"csrf"'))||'';
 const csrf=(t.match(/"csrf":\\{"token":"([^"]+)"/)||[])[1];
 if(!s||!csrf)return fail('Hittade inte butiken eller sessionen. Ladda om sidan och klicka på bokmärket igen.');
 if(/"isLoggedIn":false/.test(t))return fail('Logga in på ICA Handla först (Konto uppe till höger), och klicka sedan på bokmärket igen.');
 say('Lägger '+plan.length+' produkter i ICA-varukorgen…','info');
 const r=await fetch('/stores/'+s+'/api/cart/v1/carts/active/apply-quantity',{method:'POST',credentials:'include',headers:{'content-type':'application/json',accept:'application/json','x-csrf-token':csrf},body:JSON.stringify(plan.map(p=>({productId:p[0],quantity:p[1]})))});
 return r.ok?done('Klart! '+plan.length+' produkter ligger i ICA-varukorgen.','Visa varukorgen'):fail('ICA svarade '+r.status+'. Är du inloggad på ICA Handla? Klicka på bokmärket igen.')}
if(m&&/(^|\\.)willys\\.se$/.test(location.hostname)){
 let plan;try{plan=JSON.parse(atob(decodeURIComponent(m[1])))}catch(e){return fail(bad)}
 const u=await(await fetch('/axfood/rest/customer',{headers:{accept:'application/json'}})).json().catch(()=>({}));
 if(!u.uid||u.uid==='anonymous')return fail('Logga in på willys.se först, och klicka sedan på bokmärket igen.');
 say('Lägger '+plan.length+' produkter i Willys-varukorgen…','info');
 const t=await(await fetch('/axfood/rest/csrf-token',{headers:{accept:'application/json'}})).json();
 const r=await fetch('/axfood/rest/cart/addProducts',{method:'POST',credentials:'include',headers:{'content-type':'application/json',accept:'application/json','x-csrf-token':t},body:JSON.stringify({products:plan.map(p=>({productCodePost:p[0],qty:p[1],pickUnit:'pieces',hideDiscountToolTip:false,noReplacementFlag:false}))})});
 return r.ok?done('Klart! '+plan.length+' produkter ligger i Willys-varukorgen.','Visa varukorgen'):fail('Willys svarade '+r.status+'. Är du inloggad på willys.se? Klicka på bokmärket igen.')}
m=h.match(/matplanlista=([^&]+)/);
if(m&&location.hostname==='www.ica.se'){
 let plan;try{plan=dec(m[1])}catch(e){return fail(bad)}
 const u=await(await fetch('/api/user/information',{headers:{accept:'application/json'}})).json();
 if(!u.accessToken||!(u.loginState>0))return fail('Logga in på ica.se först, och klicka sedan på bokmärket igen.');
 say('Lägger varor i listan "'+plan.n+'"…','info');
 const G='https://apim-pub.gw.ica.se/sverige/digx/shopping-list/v1/api',H={accept:'application/json','content-type':'application/json',authorization:'Bearer '+u.accessToken};
 const all=await(await fetch(G+'/list/all',{headers:H})).json(),lists=Array.isArray(all)?all:(all.items||[]);
 const l=lists.find(x=>(x.name||'').trim().toLowerCase()===plan.n.trim().toLowerCase());
 let n=0;
 if(l){const have=new Set((l.rows||[]).map(r=>(r.text||'').trim().toLowerCase()));
  for(const t of plan.r){if(have.has(t.trim().toLowerCase()))continue;const r=await fetch(G+'/list/'+l.id+'/row',{method:'POST',headers:H,body:JSON.stringify({text:t})});if(r.ok)n++}}
 else{const r=await fetch(G+'/list',{method:'POST',headers:H,body:JSON.stringify({name:plan.n,rows:plan.r.map(t=>({text:t}))})});if(!r.ok)return fail('ICA svarade '+r.status+'. Klicka på bokmärket igen om en stund.');n=plan.r.length}
 return done('Klart! '+n+' varor lades i listan "'+plan.n+'". Den syns i ICA-appen.','Ladda om')}
fail('Ingen inköpslista att fylla på den här sidan. Öppna butiken via knappen i Matplanering först.')
}catch(e){fail('Något gick fel: '+(e&&e.message||e)+'. Kontrollera uppkopplingen och klicka på bokmärket igen.')}
finally{window.__matplanBusy=0}
})()`)
