# Fylla kundkorgen på Mathem från inköpslistan

Testat skarpt 2026-11-25 med inköpslistan för v.48 (81 rader) mot ett inloggat
Mathem-konto i Chrome. Resultat: 63 produkter / 75 varor / 2 172,94 kr i korgen
med ett enda API-anrop. Ingen beställning lades.

## Vad Mathem har för API

Mathem kör på Odas plattform. Webbappen pratar med ett JSON-API på samma
domän, `https://www.mathem.se/api/v1/…`.

| Vad | Anrop | Inloggning | Notering |
|---|---|---|---|
| Sök produkter | `GET /api/v1/search/mixed/?q=<text>` | Nej | `items[]` blandar `type: "category"` och `type: "product"`; filtrera på `product`. ~40 träffar/sida. |
| Produktdetalj | `GET /api/v1/products/<id>/` | Nej | Samma fält som i söket. |
| Läs korgen | `GET /api/v1/cart/` | Ja (cookie) | Rader ligger under `groups[]…items[]` med `product` + `quantity`. |
| Lägg i korgen | `POST /api/v1/cart/items/` | Ja (cookie + CSRF) | Body `{"items":[{"product_id":2380,"quantity":2}]}`. Många rader i ett anrop går bra. `quantity` **läggs till** befintligt antal (delta). |
| Ordrar | `GET /api/v1/orders/` | Ja | Tom på kontot idag, så ingen köphistorik att lära av ännu. |

Headers för POST: `content-type: application/json`, `x-csrftoken: <värdet i cookien csrftoken>`.

Produktfält vi har nytta av: `id`, `full_name`, `brand`, `name_extra`
(förpackning, t.ex. "5 dl", "Sverige, 900 g"), `gross_price`,
`gross_unit_price` + `unit_price_quantity_abbreviation` (jämförpris),
`promotion`/`discount` (extrapris), `availability.is_available`,
`client_classifiers` (laktosfri, EKO, svenskt…), `images[].thumbnail.url`,
`front_url`.

Sökrankningen är ibland dålig (t.ex. "söt lök" ger läsk, "pretzels" ger
spenatpinnar). Matchningen behöver alltså antingen sparade preferenser eller
AI som väljer bland träffarna.

## Begränsningar som styr designen

1. **CORS:** API:t skickar ingen `Access-Control-Allow-Origin`. Appen på
   github.io kan inte anropa det direkt.
2. **Sök kräver inte inloggning.** Det kan alltså proxas via en Cloudflare
   Worker (samma mönster som `cloudflare/recipe-proxy`) utan att hantera några
   kunduppgifter.
3. **Korgen kräver inloggad session + CSRF.** Mathem-sessionen ska stanna i
   användarens webbläsare. Vi ska inte lagra Mathem-lösenord eller cookies i
   appen eller i en Worker.

## Föreslagen implementation

### Steg 1: Matchning i appen ("Handla på Mathem" på Inköp-sidan)

För varje rad i `week.shoppingList` (ej `isPurchased`/`isExcluded`):

1. Finns en sparad preferens för ingrediensen? Använd den produkten direkt.
2. Annars: sök via Worker-proxyn och låt AI (befintlig `anthropic.ts`-klient)
   välja produkt och antal förpackningar utifrån mängd + enhet, med
   hushållets preferenser som kontext (se nedan).
3. Visa en granskningslista: ingrediens → vald produkt (bild, förpackning,
   pris, extrapris), antal, med "byt produkt" (visar övriga sökträffar),
   "har hemma" och "hoppa över".
4. Hoppa automatiskt över basvaror i `settings.pantryItems` och rader som inte
   är varor (vatten, fritextrester från receptimporten).

### Steg 2: Lägg i korgen (körs på mathem.se)

Appen bygger en "korgplan": `[{product_id, quantity, label}]`. Två sätt att få
in den i korgen:

- **Bokmärke (rekommenderas, fungerar utan Claude):** appen kopierar planen
  till urklipp eller lägger den i URL:en
  (`https://www.mathem.se/se/cart/#matplan=<base64>`). Användaren klickar på
  ett bokmärke "Fyll Mathem-korg" som läser planen och gör samma `POST` som
  ovan med sidans egen cookie + CSRF, och sedan laddar om korgsidan.
- **Claude desktop + Control Chrome:** appen visar en färdig prompt med planen
  ("lägg dessa product_id i Mathem-korgen"). Claude kör samma JS i fliken,
  vilket är exakt det som gjordes i testet.

Kassan och betalningen gör man alltid själv på Mathem.

### Steg 3: Lära sig preferenser

Ny del i `settings.json` (synkas redan via GitHub-repot):

```ts
interface StoreProductPreference {
  store: 'mathem' | 'ica'
  productId: number
  name: string          // full_name vid valet
  packSize: string      // name_extra
  chosenAt: string      // ISO-datum
  timesChosen: number
}
// AppSettings.productPreferences?: Record<string /* lexikon-/ingrediensnamn */, StoreProductPreference[]>
// AppSettings.productRules?: string[]  // fritext, t.ex. "laktosfri grädde", "svensk kyckling", "Garant hellre än märke"
```

Så lär sig appen:

- **Varje godkänd korgplan** sparar (eller ökar `timesChosen` för) ingrediens →
  produkt. Nästa vecka väljs samma produkt utan sök/AI. Byter man produkt i
  granskningen blir den nya förstahandsvalet.
- **"Har hemma"** i granskningen föreslår att lägga ingrediensen i
  `pantryItems`.
- **Regler i fritext** (`productRules`) skickas med till AI:n när en ny
  ingrediens ska matchas, så att den följer hushållets stil (laktosfritt, EKO,
  svenskt kött, billigaste egna märket, etc.).
- **Senare:** när `/api/v1/orders/` har historik kan den läsas (via bokmärket,
  eftersom den kräver inloggning) och användas för att förifylla preferenser.
  Det ska vara det faktiskt köpta som räknas, inte bara det som lades i korgen.

Nyckeln för preferenser bör vara det normaliserade lexikonnamnet
(`LEX_BY_NAME` i `ingredientLexicon.ts`) där det finns, annars ingrediensnamnet
i gemener, så att "gul lök", "söt lök (stor), tärnad" osv. hamnar på samma
produkt.

### ICA och andra butiker

Samma upplägg fungerar om butiken har ett sök-API och ett korg-API i
webbläsaren. ICA är inte undersökt än. Gör `store` till ett adapter-interface
(`search(q)`, `buildCartScript(plan)`) så att varje butik bara är en ny adapter.

## Testkörningen v.48: hur raderna hanterades

Seed-data med alla val ligger i [`src/data/mathemSeed.json`](../src/data/mathemSeed.json) (används som startpreferenser i appen).
De kan läsas in som första preferenser.

Inte tillagt (antogs finnas hemma eller är inte en vara):
salt, havssalt, svartpeppar, peppar, "Salt & svartpeppar", olivolja, rapsolja,
vetemjöl, vatten, ättiksprit (valfri i receptet), "ca 200 g kött, tillagat"
(rester), fritextraden "av enchiladasåsen…", osaltat smör (täcks av smöret).

Hittades inte på Mathem: **pretzels**.

Antalen valdes för hand utifrån mängd och förpackning, t.ex. vispgrädde 1 kg →
2 × 5 dl, mandelspån 400 g → 4 × 100 g, saffran 1 g → 2 × 0,5 g.

## Implementerat (v1)

- **Inköp → "🛒 Handla på Mathem"** öppnar `MathemCartModal`. Den söker varje rad
  (via `recipe-proxy`-Workern i produktion, Vite-proxyn `/mathem-api` lokalt),
  utgår från tidigare val (`productPreferences`, annars `src/data/mathemSeed.json`)
  och skickar sedan allt till AI:n (`matchProductsWithAi`). AI:n följer
  huvudreglerna, väljer produkt + antal och föreslår extraprisbyten.
- **Huvudregler** under Inställningar → "Handla online": allt laktosfritt,
  alltid svenskt (med undantag), prioritera extrapriser och alltid ekologiskt
  för valda produkttyper, plus egna regler i fritext. Extraprisbyten görs
  aldrig automatiskt: raden visar "Byt / Behåll".
- **Antal förpackningar** räknas av `estimatePacks` när enheterna går att
  jämföra (g/kg/ml/dl/l/msk/tsk, st mot st). Annars används AI:ns antal.
- **Utan API-nyckel** används tidigare val eller första sökträffen, utan regler.
- **Lärande:** när man trycker "Öppna Mathem…" eller "Kopiera till Claude"
  sparas varje rads val i `settings.productPreferences` (nyckel =
  `ingredientKey(namn)`). "🏠 alltid hemma" lägger varan i skafferiet.
  Inlärda val kan tas bort under Inställningar.
- **Korgen fylls på mathem.se:** antingen med bokmärket "Fyll Mathem-korg"
  (dras från modalen till bokmärkesfältet; läser `#matplan=` och rensar den
  efteråt så att ett andra klick inte dubblar korgen) eller genom att klistra
  in prompten i Claude-appen med Chrome-kontroll.
