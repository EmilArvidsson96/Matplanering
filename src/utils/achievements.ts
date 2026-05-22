import type { Achievement } from '../types/game'

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first_blood',  name: 'Första poängen',     description: 'Få din första poäng.',                  emoji: '🌱', unlock: s => s.totalPoints >= 1 },
  { id: 'level_5',      name: 'På gång',             description: 'Nå nivå 5.',                            emoji: '⭐', unlock: s => s.level >= 5 },
  { id: 'level_10',     name: 'Köksmästare',         description: 'Nå nivå 10.',                           emoji: '👨‍🍳', unlock: s => s.level >= 10 },
  { id: 'level_25',     name: 'Stjärnkock',          description: 'Nå nivå 25.',                           emoji: '🌟', unlock: s => s.level >= 25 },
  { id: 'weeks_1',      name: 'Veckoplaneraren',     description: 'Slutför en hel veckoplan.',             emoji: '📅', unlock: s => s.weeksCompleted >= 1 },
  { id: 'weeks_4',      name: 'Månadsmästare',       description: 'Slutför 4 veckoplaner.',                emoji: '🗓️', unlock: s => s.weeksCompleted >= 4 },
  { id: 'weeks_12',     name: 'Säsongsproffs',       description: 'Slutför 12 veckoplaner.',               emoji: '🏆', unlock: s => s.weeksCompleted >= 12 },
  { id: 'streak_3',     name: 'På rad',              description: '3 veckor i streck.',                    emoji: '🔥', unlock: s => s.streak >= 3 },
  { id: 'streak_8',     name: 'Outstoppbar',         description: '8 veckor i streck.',                    emoji: '⚡', unlock: s => s.streak >= 8 },
  { id: 'dish_1',       name: 'Receptsamlare',       description: 'Fyll i ditt första kompletta recept.',  emoji: '📖', unlock: s => s.dishesPolished >= 1 },
  { id: 'dish_10',      name: 'Receptbiblioteket',   description: 'Komplettera 10 recept.',                emoji: '📚', unlock: s => s.dishesPolished >= 10 },
  { id: 'dish_25',      name: 'Kokboksförfattare',   description: 'Komplettera 25 recept.',                emoji: '🧑‍🍳', unlock: s => s.dishesPolished >= 25 },
  { id: 'eco_5',        name: 'Klimathjälte',        description: '5 vegetariska/veganska måltider.',      emoji: '🌍', unlock: s => s.ecoMealCount >= 5 },
  { id: 'eco_20',       name: 'Planetens vän',       description: '20 klimatsmarta måltider.',             emoji: '🌳', unlock: s => s.ecoMealCount >= 20 },
  { id: 'healthy_5',    name: 'Hälsoivrare',         description: '5 nyttiga måltider.',                   emoji: '🥗', unlock: s => s.healthyMealCount >= 5 },
  { id: 'healthy_20',   name: 'Nyttighetsninja',     description: '20 nyttiga måltider.',                  emoji: '💪', unlock: s => s.healthyMealCount >= 20 },
  { id: 'cheap_1',      name: 'Sparbössan',          description: 'En vecka under budget.',                emoji: '💰', unlock: s => s.cheapWeekCount >= 1 },
  { id: 'cheap_5',      name: 'Krösusöverlevare',    description: '5 veckor under budget.',                emoji: '🪙', unlock: s => s.cheapWeekCount >= 5 },
  { id: 'polish_5',     name: 'Receptpolisher',      description: 'Polera 5 recept till 100%.',            emoji: '✨', unlock: s => s.dishesPolished >= 5 },
  { id: 'polish_50',    name: 'Receptperfektionisten',description: 'Polera 50 recept till 100%.',          emoji: '💎', unlock: s => s.dishesPolished >= 50 },
]
