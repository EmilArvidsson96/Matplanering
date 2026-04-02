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

export type Tag = 'snabb' | 'festlig' | 'barnvänlig' | 'lowfodmap' | 'lchf' | 'stark'

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

export interface CookingRecord {
  weekId: string   // "YYYY-MM-DD" (Saturday)
  date: string
  portions: number
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
  notes: string
  cookingHistory: CookingRecord[]
}

export type MealType = 'lunch' | 'middag'

export interface PlannedMeal {
  id: string
  dishId: string | null
  name: string
  portions: number
  isRemainder: boolean
  notes: string
  usesIngredientsFromHome: string
}

export interface ScheduleSlot {
  date: string       // "YYYY-MM-DD"
  type: MealType
  assignedMealIds: string[]
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
  dishId: string | null
  isPurchased: boolean
  isExcluded: boolean
}

export interface WeekPlan {
  id: string           // Saturday "YYYY-MM-DD"
  startDate: string
  endDate: string
  householdSize: number
  meals: PlannedMeal[]
  schedule: ScheduleSlot[]
  shoppingList: ShoppingItem[]
}

export interface AppSettings {
  defaultHouseholdSize: number
  costPerPortion: number
  pantryItems: string[]
}

export interface LibraryData {
  dishes: Dish[]
}
