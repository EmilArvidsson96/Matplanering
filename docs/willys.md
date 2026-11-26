# Willys

Willys is the third store on the shopping page, next to ICA Handla and Mathem.
Prices are fetched in the background, compared in the "Billigast den här
veckan" card, and the chosen store's cart is filled with the bookmarklet.

## Search

- `GET https://www.willys.se/search?q=<text>&size=20` is public JSON, no login.
- Willys answers 403 when the request carries another site's `Origin`, so the
  browser can't call it directly. Prod goes through the recipe-proxy Worker's
  generic `?url=` route (it doesn't forward `Origin`); dev goes through the
  Vite proxy `/willys-api`, which removes `Origin` and `Referer`.
- Online prices are the same for the whole country, so there's no store setting.
- Products sold by weight (code ending `_KG`, price in kr/kg) are priced per
  piece using `averageWeight`, e.g. "Banan, ca 180 g".
- Offers come from `potentialPromotions`: `GENERAL` ones count as offers
  ("2 för 30 kr"); `LOYALTY` ones need Willys Plus and are only shown as text.
- Answers are cached in this browser for a day (`matplan.willys.searches.v1`).

## Matching

`src/store/willysJob.ts` works like the Mathem job: up to three searches at a
time, then the household's earlier Willys choice, AI for new ingredients and
the rule ranking. Choices are learned in `settings.willysProductPreferences`.
The suggestion is saved on the row as `item.willys`.

## Cart

The bookmarklet "Matplanering: fyll" (`STORE_BOOKMARKLET` in `src/api/shops.ts`)
runs on willys.se when the address has `#matplan=…`:

1. `GET /axfood/rest/customer`: stops if `uid` is `anonymous` (not logged in),
   so the products land in the household's own cart.
2. `GET /axfood/rest/csrf-token` returns the token as a JSON string.
3. `POST /axfood/rest/cart/addProducts` with header `x-csrf-token` and body
   `{"products":[{"productCodePost":"101895177_ST","qty":1,"pickUnit":"pieces","hideDiscountToolTip":false,"noReplacementFlag":false}]}`.
   Quantities are added to what's already in the cart. Nothing is ordered.
