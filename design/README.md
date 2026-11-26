# Design – klickbar prototyp av appen

Hela appen (mobil, 390 px) ritad i Claude Design som en klickbar prototyp.
Det här är **utgångspunkten för alla designdiskussioner**: ändra här först,
bygg sedan i `src/`.

- **Canvas:** https://claude.ai/artifact/3c2dFn8R36KAEqeHLJ78Mm (privat – dela via Share-menyn om någon annan ska se den)
- **Källfiler:** `design/project/` – en `.dc.html` per skärm + `canvas.json` (index med positioner och titlar)
- **Exempeldata:** vecka 47, lör 21 – lör 28 nov 2026

## Skärmar

| Artboard | Motsvarar i appen | Källa i `src/` |
|---|---|---|
| `Main` – Vecka | `/` | `components/SummaryPage.tsx`, `layout/WeekNavigator.tsx` |
| `PlaneraPortioner` | `/planera?steg=portioner` | `steps/PortionsStep.tsx` |
| `PlaneraBrainstorm` | `/planera?steg=brainstorm` | `steps/BrainstormStep.tsx`, `steps/ExtraCookingSection.tsx` |
| `PlaneraSchema` | `/planera?steg=schema` | `steps/ScheduleStep.tsx` |
| `ValjRatt` (modal) | Välj rätt från biblioteket | `steps/DishPicker.tsx` |
| `Tilldela` (modal) | Tilldela matlagning | `steps/ScheduleStep.tsx` (MealAssignPicker) |
| `Recept` | `/recept` (lista) | `recipe/RecipePage.tsx` |
| `ReceptDetalj` | `/recept?dish=…` | `recipe/RecipeDetail.tsx` |
| `ReceptAI` (modal) | Förbättringsförslag | `recipe/RecipeAiTools.tsx` |
| `Bibliotek` | `/bibliotek` | `library/LibraryPage.tsx` |
| `Filter` (modal) | Filter i biblioteket | `library/LibraryPage.tsx` |
| `RattEditor` (modal) | Redigera rätt | `library/DishEditor.tsx` |
| `Inkop` | `/inkop` | `shopping/ShoppingPage.tsx` m.fl. |
| `Forrad` | `/forrad` | `shopping/StockPage.tsx` |
| `Mer` (modal) | Mer-menyn i flikraden | `layout/AppShell.tsx` |
| `Spel` | `/spel` | `game/GamePanel.tsx` |
| `Installningar` | `/inst` | `settings/SettingsPage.tsx` |
| `Login` | PIN-inloggning | `auth/LoginPage.tsx` |
| `Feedback` (modal) | Skicka feedback | `feedback/FeedbackWidget.tsx` |
| `TabBar` (komponent) | Flytande flikmeny | `layout/AppShell.tsx` |
| `Icon` (komponent) | Lucide-ikoner som används | – |

Alla länkar fungerar i Play-läget: flikmenyn, kort, knappar, stegväljaren och
modalernas stäng-knappar går till rätt artboard. Interaktiva detaljer (bocka av
varor, byta flik, portionsstegare, filterchips, spelläge på/av) fungerar inom
respektive skärm.

## Tokens (samma som `tailwind.config.js`)

| Token | Värde |
|---|---|
| canvas | `#F5F4EF` |
| ink / soft / muted / faint | `#15171A` / `#3D4046` / `#5C6066` / `#8A8E94` |
| line / line-soft | `#E2E0D8` / `#EEEDE7` |
| brand-600 / 700 (basilikagrön, enda accent) | `#1F6B45` / `#16503A` |
| mint / mint-ink / mint-bright | `#DDF3E4` / `#0F4A2E` / `#B5F0C9` |
| Typsnitt | Inter (text), Manrope 800 (rubriker) |
| Radier | kort 24 px, knappar/chips helt runda, sheets 28 px |

## Arbetsflöde

1. Designändring: redigera filen i `design/project/` (eller i canvasen) och
   publicera om till samma canvas-URL.
2. Ändrades något direkt i canvasen? Läs tillbaka filen från canvasen och
   spara den här så att repot och canvasen är i synk.
3. När designen är klar: implementera i `src/` och håll prototypen uppdaterad
   så att den fortsätter spegla appen.
