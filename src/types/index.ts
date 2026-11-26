export type Protein =
  | 'kyckling' | 'nöt' | 'fläsk' | 'fisk' | 'skaldjur'
  | 'lamm' | 'vilt' | 'vegetarisk' | 'vegan'

export type Carb = 'ris' | 'pasta' | 'potatis' | 'nudlar' | 'bröd' | 'ingen'

export type Cuisine =
  | 'svensk' | 'italiensk' | 'asiatisk' | 'japansk' | 'koreansk'
  | 'indisk' | 'mellanöstern' | 'mexikansk' | 'fransk' | 'nordafrikansk' | 'övrigt'

export type DishType =
  | 'soppa' | 'sallad' | 'paj' | 'gryta' | 'grillat'
  | 'bowl' | 'burgare' | 'taco' | 'wrap' | 'pizza'
  | 'pasta' | 'curry' | 'risotto' | 'omelett' | 'smörgås'
  | 'wok' | 'sushi' | 'köttbit'

export type Tag = 'snabb' | 'festlig' | 'barnvänlig' | 'lowfodmap' | 'lchf' | 'stark' | 'lågfett'

export type SortOrder = 'popularitet' | 'säsong' | 'alfabetisk'

export type ShoppingCategory =
  | 'mejeri' | 'kött' | 'fisk' | 'grönsaker' | 'frukt'
  | 'torrvaror' | 'konserver' | 'frys' | 'bröd' | 'kryddor' | 'övrigt'

export interface Ingredient {
  id: string
  name: string
  amount: number
  unit: string
  category: ShoppingCategory
  portionsBase: number
}

export interface TemporaryIngredient {
  id: string
  name: string
  amount: string
  unit: string
  category: ShoppingCategory
}

export interface CookingRecord {
  weekId: string   // "YYYY-MM-DD" (Saturday)
  date: string
  portions: number
}

export interface RecipeStep {
  id: string
  text: string
}

export interface Dish {
  id: string
  name: string
  protein: Protein[]
  carb: Carb[]
  cuisine: Cuisine
  type: DishType[]
  tags: Tag[]
  recipeUrl: string
  ingredients: Ingredient[]
  instructions: RecipeStep[]
  notes: string
  cookingHistory: CookingRecord[]
  preferredMonths: number[]   // 1–12, overrides computed season; empty = use history
  /** AI results saved on the recipe so they survive reloads and other devices. */
  ai?: DishAiData
  yieldUnit?: string          // what the recipe yields, e.g. "bullar", "limpor"; empty = portioner
  /** Picture chosen by the user. Wins over `autoImage`. */
  imageUrl?: string
  /** Picture found automatically (recipe page or image search). */
  autoImage?: DishAutoImage
}

export interface DishAutoImage {
  /** Empty when nothing good was found (retried after a while). */
  url: string
  source?: 'recipe' | 'search'
  /** Page the picture comes from. */
  pageUrl?: string
  /** Other pictures that passed the checks, best first — offered in the editor. */
  alternatives?: string[]
  /** Name + link it was found for; a change triggers a new search. */
  key: string
  at: string   // ISO date
}

export interface RecipeImprovement {
  title: string         // short label
  detail: string        // the actual suggestion, ready to add as a note
  category: string      // e.g. "smak", "teknik", "hälsa", "tid", "tillbehör"
  /** True once the suggestion has been added to the recipe's notes. */
  applied?: boolean
}

export interface DishAiData {
  /** Last "split into clearer steps" result; `hash` is of the instructions it was made from. */
  split?: { hash: string; steps: string[]; at: string }
  /** Last improvement suggestions (kept even after the recipe changes). */
  improvements?: { items: RecipeImprovement[]; at: string }
}

export type MealType = 'lunch' | 'middag'

export interface MealComponent {
  id: string
  dishId: string | null
  name: string
  portionsMode: 'own' | 'total'
  portions: number   // only used when portionsMode === 'own'
}

export interface PlannedMeal {
  id: string
  name: string
  components: MealComponent[]
  isRemainder: boolean
  notes: string
  usesIngredientsFromHome: string
  temporaryIngredients: TemporaryIngredient[]
  /** Extra portions cooked on top of what's eaten, to put in the freezer. */
  freezePortions?: number
  /** 'extra' = cooked/baked for later (freezer, baking) — not eaten from this week's portions. */
  kind?: 'meal' | 'extra'
  extraType?: ExtraType
  /** Day the extra cooking/baking is planned for ("YYYY-MM-DD"), optional. */
  plannedDate?: string
}

export type ExtraType = 'frys' | 'bak'

export interface MealAssignment {
  mealId: string
  portions: number   // portions cooked at this specific slot
}

export interface ScheduleSlot {
  date: string       // "YYYY-MM-DD"
  type: MealType
  assignments: MealAssignment[]   // replaces old assignedMealIds
  portionsNeeded: number
  event: string
}

export interface ShoppingItem {
  id: string
  name: string
  amount: string
  unit: string
  category: ShoppingCategory
  isAutoAdded: boolean
  dishIds: string[]   // dishes this item came from (multiple if merged)
  isPurchased: boolean
  isExcluded: boolean
  /** Why it's excluded: marked at home this week, always at home, or in stock. */
  excludedReason?: 'home' | 'pantry' | 'stock'
  excludedAt?: string
  /** Soft delete: shown under Borttagna until the list is rebuilt. */
  deletedAt?: string
  /** Answered "Köp" to "Har du redan hemma?". */
  homeAnswer?: 'buy'
  /** Suggested Mathem product (fetched on demand, saved with the week). */
  mathem?: MathemSuggestion
}

/** What we keep about a Mathem product on a shopping row (price = last seen). */
export interface MathemSnapshot {
  productId: number
  name: string
  packSize: string
  imageUrl?: string
  price: number
  onSale: boolean
}

export interface MathemSuggestion {
  product: MathemSnapshot | null
  quantity: number
  /** Put in the cart. False = skip (not a product, not found, or the user said no). */
  include: boolean
  source?: 'preference' | 'ai' | 'search' | 'manual'
  /** Search query whose (locally cached) hits are the alternatives. */
  query: string
  note?: string
  /** Extrapris swap the user hasn't answered yet. */
  saleAlt?: MathemSnapshot
  saleReason?: string
  matchedAt: string
}

export interface UnitConversion {
  id: string
  fromUnit: string
  ingredientHint?: string  // if set, only applies when ingredient name contains this
  toGrams: number
}

export interface StepsCompleted {
  portioner?: boolean
  brainstorm?: boolean
  schema?: boolean
}

export interface WeekPlan {
  id: string              // Saturday "YYYY-MM-DD" — stable nav identifier
  startDate: string       // actual first day (may differ from id)
  startMealType: MealType // first meal of the window
  endDate: string         // actual last day
  endMealType: MealType   // last meal of the window
  householdSize: number
  meals: PlannedMeal[]
  schedule: ScheduleSlot[]
  shoppingList: ShoppingItem[]
  stepsCompleted?: StepsCompleted
  actualCost?: number | null
  dismissedMergePairs?: string[]  // normalized keys for dismissed similar-ingredient suggestions
}

export type AiModel = 'haiku' | 'sonnet' | 'opus'

export interface AppSettings {
  defaultHouseholdSize: number
  costPerPortion: number
  pantryItems: string[]
  unitConversions: UnitConversion[]
  anthropicApiKey?: string
  aiModel?: AiModel
  calibrationModel?: AiModel
  costOverrides?: Record<string, number>  // lexicon canonical name → calibrated SEK/kg
  recipeSiteRules?: Record<string, RecipeSiteRule>  // hostname (no www.) → learned scraping rule
  /** Learned ingredient → store product choices, keyed by normalized ingredient name. */
  productPreferences?: Record<string, ProductPreference>
  /** Main rules for picking store products. */
  shoppingRules?: ShoppingRules
  /** Extra free-text household rules for picking products. */
  productRules?: string
  /** Things bought in a big pack and only when they run out, by ingredient key. */
  stockItems?: Record<string, StockItem>
  /** Ingredient keys where the user said no to "Gör till förrådsvara?". */
  stockDeclined?: string[]
  /** Products never to suggest again, per ingredient key. */
  productAvoid?: Record<string, number[]>
  /** How often each ingredient was at home vs bought when asked. */
  homeStats?: Record<string, { home: number; buy: number }>
}

/** A förrådsvara: bought in a big pack, only when it runs out. */
export interface StockItem {
  name: string
  category?: ShoppingCategory
  productId?: number
  productName?: string
  packSize?: string
  imageUrl?: string
  /** Estimate baseline: fraction left at the start of this week (1 = new pack). */
  baseline: { weekId: string; fraction: number }
  /** Share of the pack used by planned recipes per week (-1 = couldn't measure). */
  usage: Record<string, number>
  /** Set by hand: 'out' puts it on the list; 'low' asks. */
  manual?: 'low' | 'out'
  /** Don't ask "Har du kvar?", the user says when it's out. */
  neverAsk?: boolean
}

export interface ShoppingRules {
  lactoseFree: boolean     // always lactose-free where a lactose-free variant exists
  preferSwedish: boolean   // Swedish origin unless there's no reasonable Swedish option
  preferOffers: boolean    // suggest swaps to extrapris products (the user confirms each swap)
  organicFor: string       // product types that should always be organic, e.g. "spannmål, pasta, mjöl"
}

/** A store product the household has chosen for an ingredient before. */
export interface ProductPreference {
  store: 'mathem'
  productId: number
  name: string        // product full name when chosen
  packSize: string    // e.g. "5 dl", "Sverige, 900 g"
  chosenAt: string    // ISO date of the latest choice
  timesChosen: number
  /** Always buy this many packs, whatever recipes need. */
  fixedQuantity?: number
}

/** CSS selectors learned (via AI) for scraping recipes from a site without AI next time. */
export interface RecipeSiteRule {
  ingredientSelector: string
  instructionSelector?: string
  titleSelector?: string
  servingsSelector?: string
  learnedAt: string   // ISO date
}

export interface LibraryData {
  dishes: Dish[]
}
