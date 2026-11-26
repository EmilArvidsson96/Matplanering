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
 * It then clears the plan from the address so a second click can't add everything twice.
 */
export const STORE_BOOKMARKLET = 'javascript:' + encodeURIComponent(`(async()=>{
const h=location.hash,clear=()=>history.replaceState(null,'',location.pathname+location.search);
const dec=s=>JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(s)))));
let m=h.match(/matplan=([^&]+)/);
if(m&&/mathem\\.se$/.test(location.hostname)){
 let plan;try{plan=JSON.parse(atob(decodeURIComponent(m[1])))}catch(e){alert('Kunde inte läsa listan.');return}
 const c=document.cookie.match(/csrftoken=([^;]+)/);
 const r=await fetch('/api/v1/cart/items/',{method:'POST',credentials:'include',headers:{'content-type':'application/json',accept:'application/json','x-csrftoken':c?c[1]:''},body:JSON.stringify({items:plan.map(p=>({product_id:p[0],quantity:p[1]}))})});
 clear();if(r.ok){alert('Klart! '+plan.length+' produkter lades i Mathem-korgen.');location.reload()}else alert('Mathem svarade '+r.status+'. Är du inloggad på mathem.se?');return}
if(m&&location.hostname==='handlaprivatkund.ica.se'){
 let plan;try{plan=dec(m[1])}catch(e){alert('Kunde inte läsa listan.');return}
 const s=(location.pathname.match(/stores\\/(\\d+)/)||[])[1];
 const t=[...document.querySelectorAll('script:not([src])')].map(x=>x.textContent).find(x=>x.includes('"csrf"'))||'';
 const csrf=(t.match(/"csrf":\\{"token":"([^"]+)"/)||[])[1];
 if(!s||!csrf){alert('Hittade inte butiken eller sessionen. Ladda om sidan och försök igen.');return}
 if(/"isLoggedIn":false/.test(t)){alert('Logga in på ICA Handla först (Konto uppe till höger), och klicka sedan på bokmärket igen.');return}
 const r=await fetch('/stores/'+s+'/api/cart/v1/carts/active/apply-quantity',{method:'POST',credentials:'include',headers:{'content-type':'application/json',accept:'application/json','x-csrf-token':csrf},body:JSON.stringify(plan.map(p=>({productId:p[0],quantity:p[1]})))});
 clear();if(r.ok){alert('Klart! '+plan.length+' produkter lades i ICA-varukorgen.');location.reload()}else alert('ICA svarade '+r.status+'. Är du inloggad på ICA Handla?');return}
if(m&&/(^|\\.)willys\\.se$/.test(location.hostname)){
 let plan;try{plan=JSON.parse(atob(decodeURIComponent(m[1])))}catch(e){alert('Kunde inte läsa listan.');return}
 const u=await(await fetch('/axfood/rest/customer',{headers:{accept:'application/json'}})).json().catch(()=>({}));
 if(!u.uid||u.uid==='anonymous'){alert('Logga in på willys.se först, och klicka sedan på bokmärket igen.');return}
 const t=await(await fetch('/axfood/rest/csrf-token',{headers:{accept:'application/json'}})).json();
 const r=await fetch('/axfood/rest/cart/addProducts',{method:'POST',credentials:'include',headers:{'content-type':'application/json',accept:'application/json','x-csrf-token':t},body:JSON.stringify({products:plan.map(p=>({productCodePost:p[0],qty:p[1],pickUnit:'pieces',hideDiscountToolTip:false,noReplacementFlag:false}))})});
 clear();if(r.ok){alert('Klart! '+plan.length+' produkter lades i Willys-varukorgen.');location.reload()}else alert('Willys svarade '+r.status+'. Är du inloggad på willys.se?');return}
m=h.match(/matplanlista=([^&]+)/);
if(m&&location.hostname==='www.ica.se'){
 let plan;try{plan=dec(m[1])}catch(e){alert('Kunde inte läsa listan.');return}
 const u=await(await fetch('/api/user/information',{headers:{accept:'application/json'}})).json();
 if(!u.accessToken||!(u.loginState>0)){alert('Logga in på ica.se först, och klicka sedan på bokmärket igen.');return}
 const G='https://apim-pub.gw.ica.se/sverige/digx/shopping-list/v1/api',H={accept:'application/json','content-type':'application/json',authorization:'Bearer '+u.accessToken};
 const all=await(await fetch(G+'/list/all',{headers:H})).json(),lists=Array.isArray(all)?all:(all.items||[]);
 const l=lists.find(x=>(x.name||'').trim().toLowerCase()===plan.n.trim().toLowerCase());
 let n=0;
 if(l){const have=new Set((l.rows||[]).map(r=>(r.text||'').trim().toLowerCase()));
  for(const t of plan.r){if(have.has(t.trim().toLowerCase()))continue;const r=await fetch(G+'/list/'+l.id+'/row',{method:'POST',headers:H,body:JSON.stringify({text:t})});if(r.ok)n++}}
 else{const r=await fetch(G+'/list',{method:'POST',headers:H,body:JSON.stringify({name:plan.n,rows:plan.r.map(t=>({text:t}))})});if(!r.ok){alert('ICA svarade '+r.status+'.');return}n=plan.r.length}
 clear();alert('Klart! '+n+' varor lades i listan "'+plan.n+'". Den syns i ICA-appen.');location.reload();return}
alert('Ingen inköpslista att fylla på den här sidan. Öppna butiken via knappen i Matplanering först.')
})()`)
