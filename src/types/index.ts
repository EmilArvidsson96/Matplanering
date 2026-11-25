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
