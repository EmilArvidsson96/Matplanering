# ICA: kundkorg, inköpslista och kategorier

Undersökt och testat 2026-11-26 mot ett inloggat ICA-konto i Chrome och butiken
Maxi ICA Stormarknad Häggvik (butiksnummer 1003415). Inga beställningar lades.
Testvaror och testlistor togs bort efteråt.

Allt nedan är ICA:s inofficiella webb-API:er, samma som ica.se och ICA Handla
själva använder. De kan ändras utan förvarning.

## ICA Handla (kundkorg)

E-handeln ligger på `https://handlaprivatkund.ica.se` (Ocados plattform). Butiken
väljs i adressen: `/stores/{butiksnummer}/…`. Butiksnumret är det som står sist i
butikens adress på ica.se.

| Vad | Anrop (prefix `/stores/{nr}/api`) | Inloggning |
|---|---|---|
| Sök | `GET /webproductpagews/v6/product-pages/search?q=…&maxPageSize=10` | Nej. Ger bara produkt-id:n. |
| Produktdetaljer | `PUT /webproductpagews/v6/products` med `["uuid", …]` | Nej, men sessionscookie + `x-csrf-token` krävs. |
| Läs korgen | `GET /cart/v1/carts/active` | Ja |
| Lägg i / ta ur korgen | `POST /cart/v1/carts/active/apply-quantity` med `[{"productId":"uuid","quantity":2}]` | Ja + `x-csrf-token` |

- `quantity` **läggs till** det som finns i korgen. Negativt antal tar bort.
- CSRF-token finns i sidans `window.__INITIAL_STATE__` (`session.csrf.token`), i
  ett inline-skript. Vilken ICA-sida som helst under `/stores/{nr}/` ger en
  anonym session med token, även en 404-sida (~0,5 MB, lättast).
- Produktdata: `name`, `brand`, `packSizeDescription` ("0.5L"), `price.amount`,
  `unitPrice`, `countryOfOrigin`, `available`, `promotions[].description`
  ("3 för 56 kr"), `image.src`, `retailerProductId`.
- Korgsidan är `/stores/{nr}/basket`. Minsta order är 400 kr.
- **Bot-skydd (AWS WAF):** anrop från en annan webbplats i webbläsaren får alltid
  `202` med tom body. Från en hemma-IP räcker 2–3 snabba sökningar för att bli
  spärrad i flera minuter. Via Cloudflare-Workern gick 12 sökningar i rad bra.
  Workern försöker igen med paus vid `202`.

## ICA-inköpslistan (ICA-appen)

Från en flik på `www.ica.se`: `GET /api/user/information` ger `accessToken`
(några minuter) och `loginState` (2 = inloggad). Sedan
`Authorization: Bearer <token>` mot
`https://apim-pub.gw.ica.se/sverige/digx/shopping-list/v1/api`:

| Vad | Anrop |
|---|---|
| Alla listor | `GET /list/all` |
| Skapa lista med rader | `POST /list` med `{"name":"…","rows":[{"text":"…"}]}` |
| Lägg till rad | `POST /list/{id}/row` med `{"text":"…"}` (valfritt `"quantity":{"amount":2,"unit":"st"}`, `"article":{"id":…}`) |
| Ändra rad | `PUT /row/{id}` med hela raden |
| Ta bort rad / lista | `DELETE /row/{id}`, `DELETE /list/{id}` |
| Varusök (kategori) | `GET …/shoppinglistarticlesearch/v1/search?query=…` |
| Butikssök | `GET …/storesearch/v1/stores/search?query=häggvik` |

Fritext räcker: ICA sorterar raden till rätt avdelning själv. Gatewayen skickar
`Access-Control-Allow-Origin: *`, men token kan bara hämtas på ica.se (Akamai
stoppar serveranrop till `www.ica.se`).

## Så gör appen

- **Sök + pris:** recipe-proxy-Workern har `GET /ica/search?store=&q=` och
  `GET /ica/products?store=&ids=`. Den håller en anonym ICA Handla-session
  per butik i 10 min. I dev kör Vite samma kod under `/ica-api`
  (`vite.config.ts`).
- **Granskning:** `StoreCartModal` matchar raderna per butik (tidigare val →
  sök → AI med huvudreglerna) och visar totalsumman för varje butik i flikarna.
  Val sparas i `settings.icaProductPreferences` (Mathem: `productPreferences`).
- **Fylla korg/lista:** appen öppnar butikens sida med planen efter `#`
  (`#matplan=` eller `#matplanlista=`, base64 av UTF-8-JSON). Bokmärket
  "Matplanering: fyll" (`STORE_BOOKMARKLET` i `src/api/shops.ts`) känner igen
  Mathem, ICA Handla och ica.se och gör anropen ovan med användarens egen
  inloggning. Det rensar `#…` efteråt så att ett andra klick inte dubblar.
  En ICA-lista med samma namn får bara de rader som saknas.

## Kategorier

Appens kategorier följer ICA:s varugrupper (`src/data/categories.ts`):

| Kategori | ICA-grupp (`articleGroupId` / utökad) |
|---|---|
| Frukt & grönt | 4 |
| Kött & fågel | 6 |
| Chark & färdigmat | 6 → 16 (chark), 14 (färdigmat & sallader) |
| Fisk & skaldjur | 6 → 15 |
| Ost | 6 → 13 |
| Mejeri & ägg | 10 |
| Bröd & bageri | 3 |
| Skafferi | 9 |
| Godis & snacks | 9 → 19 |
| Dryck | 9 → 18 |
| Djupfryst | 5 |
| Hushåll & hygien | 7, 11, 9 → 20–22 |
| Övrigt | – |

`src/data/icaCategories.json` är ICA:s egen indelning av alla ingredienser i
biblioteket och de senaste veckornas listor (584 namn slogs upp i ICA:s varusök,
uppenbara felträffar sållades bort och ett 40-tal rättades för hand). Ordning:
hushållets egna val (`settings.categoryOverrides`) → tabellen → ordregler.
Gamla kategorier i sparade veckor och recept översätts när de laddas.
Inom en kategori sorteras raderna efter ICA:s underavdelning.

För att uppdatera tabellen: kör varusöket för nya ingrediensnamn från en
inloggad ica.se-flik och lägg till dem i JSON-filen.
