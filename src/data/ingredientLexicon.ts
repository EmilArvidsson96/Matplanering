/**
 * Swedish ingredient lexicon — utökad version.
 *
 * Estimates only — baserat på publika källor:
 *  • RISE Klimatdatabas (LCA, kg CO₂e/kg från jord till butik)
 *  • Konsumentverkets matkostnadsdata + ICA / Coop prislistor 2024
 *
 * Allt normaliserat till "per kg" av ätbar produkt.
 *   - costPerKg: SEK/kg (snitt-detaljhandelspris)
 *   - co2ePerKg: kg CO₂-ekvivalenter / kg
 *
 * Matchning sker via substring på ingrediensnamn (lowercase). FÖRSTA TRÄFFEN
 * VINNER — så mer specifika poster ligger före generiska (t.ex. "soltorkad
 * tomat" före "tomat", "västerbottensost" före "ost", "smörolja" före "smör").
 *
 * Täcker alla ingredienser man rimligen kan stöta på i de ~150 recepten i
 * grundbiblioteket (svensk husmanskost, italienskt, franskt, asiatiskt,
 * indiskt, mellanösternmat, mexikanskt, nordafrikanskt m.fl.).
 */

export interface LexEntry {
  keywords: string[]   // substrings, lowercase
  name: string         // canonical
  costPerKg: number    // SEK/kg
  co2ePerKg: number    // kg CO2e/kg
}

export const INGREDIENT_LEXICON: LexEntry[] = [
  // ════════════════════════════════════════════════════════════════════════
  // 🥇 HÖG PRIORITET — sammansatta namn som annars skulle "kapas" av kortare
  // nyckelord längre ned (t.ex. "kycklingbuljong" → "Kyckling"). Måste matchas
  // före de generiska protein- och rotnyckelorden.
  // ════════════════════════════════════════════════════════════════════════
  { name: 'Kycklingbuljong', keywords: ['kycklingbuljong'],                                          costPerKg: 30,  co2ePerKg: 1.5 },
  { name: 'Oxbuljong',       keywords: ['oxbuljong', 'köttbuljong'],                                 costPerKg: 30,  co2ePerKg: 2.0 },
  { name: 'Fiskbuljong',     keywords: ['fiskbuljong', 'skaldjursfond'],                             costPerKg: 35,  co2ePerKg: 1.5 },
  { name: 'Kalvfond',        keywords: ['kalvfond', 'kalvbuljong'],                                  costPerKg: 80,  co2ePerKg: 2.0 },
  { name: 'Grönsaksbuljong', keywords: ['grönsaksbuljong', 'gronsaksbuljong'],                       costPerKg: 30,  co2ePerKg: 1.0 },
  { name: 'Kokosmjölk',      keywords: ['kokosmjölk', 'kokosmjolk', 'kokoskräm', 'kokoskram', 'kokosgrädde', 'kokosgradde'], costPerKg: 45, co2ePerKg: 2.5 },
  { name: 'Kokosolja',       keywords: ['kokosolja'],                                                costPerKg: 80,  co2ePerKg: 2.5 },
  { name: 'Vitlök',          keywords: ['vitlök', 'vitlok'],                                         costPerKg: 90,  co2ePerKg: 0.5 },
  { name: 'Purjolök',        keywords: ['purjolök', 'purjolok'],                                     costPerKg: 30,  co2ePerKg: 0.4 },
  { name: 'Salladslök',      keywords: ['salladslök', 'salladslok', 'vårlök', 'varlok'],             costPerKg: 35,  co2ePerKg: 0.4 },
  { name: 'Rödlök',          keywords: ['rödlök', 'rodlok'],                                         costPerKg: 25,  co2ePerKg: 0.3 },
  { name: 'Sötpotatis',      keywords: ['sötpotatis', 'sotpotatis'],                                 costPerKg: 35,  co2ePerKg: 0.4 },
  { name: 'Färskpotatis',    keywords: ['färskpotatis', 'farskpotatis', 'amandinepotatis'],          costPerKg: 35,  co2ePerKg: 0.3 },
  { name: 'Klyftpotatis',    keywords: ['klyftpotatis'],                                             costPerKg: 22,  co2ePerKg: 0.3 },
  { name: 'Krossade tomater',keywords: ['krossade tomater', 'passerade tomater'],                    costPerKg: 25,  co2ePerKg: 1.1 },
  { name: 'Soltorkad tomat', keywords: ['soltorkad tomat', 'soltorkade tomater'],                    costPerKg: 220, co2ePerKg: 2 },
  { name: 'Tomatpuré',       keywords: ['tomatpuré', 'tomatpure', 'tomatkoncentrat'],                costPerKg: 60,  co2ePerKg: 1.5 },
  { name: 'Kycklingfilé',    keywords: ['kycklingfilé', 'kycklingfile', 'kycklingbröst'],            costPerKg: 160, co2ePerKg: 5 },
  { name: 'Kycklinglår',     keywords: ['kycklinglår'],                                              costPerKg: 110, co2ePerKg: 5 },
  { name: 'Kycklingfärs',    keywords: ['kycklingfärs'],                                             costPerKg: 130, co2ePerKg: 5 },
  { name: 'Fläskfilé',       keywords: ['fläskfilé', 'fläskfile'],                                   costPerKg: 160, co2ePerKg: 7 },
  { name: 'Fläsksida',       keywords: ['fläsksida', 'sidfläsk'],                                    costPerKg: 130, co2ePerKg: 8 },
  { name: 'Fläskfärs',       keywords: ['fläskfärs'],                                                costPerKg: 110, co2ePerKg: 6 },
  { name: 'Lammfärs',        keywords: ['lammfärs'],                                                 costPerKg: 200, co2ePerKg: 23 },
  { name: 'Nötfärs',         keywords: ['nötfärs', 'blandfärs', 'köttfärs'],                         costPerKg: 150, co2ePerKg: 26 },
  { name: 'Laxfilé',         keywords: ['laxfilé', 'laxfile'],                                       costPerKg: 230, co2ePerKg: 5 },
  { name: 'Varmrökt lax',    keywords: ['varmrökt lax', 'varmrokt lax'],                             costPerKg: 280, co2ePerKg: 6 },
  { name: 'Gravlax',         keywords: ['gravlax'],                                                  costPerKg: 320, co2ePerKg: 6 },
  { name: 'Torskrygg',       keywords: ['torskrygg', 'torskfilé', 'torskfile'],                      costPerKg: 230, co2ePerKg: 3 },

  // ════════════════════════════════════════════════════════════════════════
  // KÖTT — RÖTT, GRIS, FÅGEL, VILT, CHARK
  // ════════════════════════════════════════════════════════════════════════

  // ─── Nöt (specifika styckdetaljer först) ────────────────────────────────
  { name: 'Oxfilé',           keywords: ['oxfilé', 'oxfile', 'filé av nöt'],                              costPerKg: 600, co2ePerKg: 30 },
  { name: 'Entrecôte',        keywords: ['entrecote', 'entrecôte', 'ryggbiff'],                           costPerKg: 350, co2ePerKg: 28 },
  { name: 'Biff',             keywords: ['biffstek', 'rumpstek', 'innanlår', 'ytterlår', 'rostbiff'],     costPerKg: 280, co2ePerKg: 27 },
  { name: 'Högrev',           keywords: ['högrev', 'bringa', 'bog', 'grytbitar nöt', 'grytbitar av nöt'], costPerKg: 180, co2ePerKg: 26 },
  { name: 'Nötfärs',          keywords: ['nötfärs', 'blandfärs', 'köttfärs'],                             costPerKg: 150, co2ePerKg: 26 },
  { name: 'Nötkött (övrigt)', keywords: ['nötkött', 'biff', 'nöt'],                                       costPerKg: 220, co2ePerKg: 27 },

  // ─── Lamm ───────────────────────────────────────────────────────────────
  { name: 'Lammfärs',         keywords: ['lammfärs'],                                                     costPerKg: 200, co2ePerKg: 23 },
  { name: 'Lammracks',        keywords: ['lammracks', 'lammrack', 'lammkotlett'],                         costPerKg: 320, co2ePerKg: 25 },
  { name: 'Lamm',             keywords: ['lamm', 'lammkött', 'lammstek', 'lammlägg'],                     costPerKg: 230, co2ePerKg: 24 },

  // ─── Fläsk ──────────────────────────────────────────────────────────────
  { name: 'Fläskfilé',        keywords: ['fläskfilé', 'fläskfile'],                                       costPerKg: 160, co2ePerKg: 7 },
  { name: 'Fläsksida',        keywords: ['fläsksida', 'sidfläsk', 'pancetta'],                            costPerKg: 130, co2ePerKg: 8 },
  { name: 'Fläskkarré',       keywords: ['fläskkarré', 'fläskkarre', 'kotlett', 'fläskkotlett'],          costPerKg: 110, co2ePerKg: 7 },
  { name: 'Spareribs',        keywords: ['revben', 'ribs', 'spareribs', 'tjocka revben'],                 costPerKg: 130, co2ePerKg: 7 },
  { name: 'Fläskfärs',        keywords: ['fläskfärs'],                                                    costPerKg: 110, co2ePerKg: 6 },
  { name: 'Bacon',            keywords: ['bacon'],                                                        costPerKg: 180, co2ePerKg: 8 },
  { name: 'Skinka',           keywords: ['kokt skinka', 'rimmad skinka', 'serrano', 'prosciutto'],        costPerKg: 200, co2ePerKg: 8 },
  { name: 'Kassler',          keywords: ['kassler'],                                                      costPerKg: 130, co2ePerKg: 7 },
  { name: 'Fläsk',            keywords: ['fläsk', 'fläskkött'],                                           costPerKg: 110, co2ePerKg: 7 },

  // ─── Charkprodukter / korv ──────────────────────────────────────────────
  { name: 'Falukorv',         keywords: ['falukorv'],                                                     costPerKg: 70,  co2ePerKg: 6 },
  { name: 'Isterband',        keywords: ['isterband'],                                                    costPerKg: 130, co2ePerKg: 8 },
  { name: 'Chorizo',          keywords: ['chorizo'],                                                      costPerKg: 180, co2ePerKg: 9 },
  { name: 'Salsiccia',        keywords: ['salsiccia', 'salsiccie', 'italiensk korv'],                     costPerKg: 200, co2ePerKg: 9 },
  { name: 'Bratwurst',        keywords: ['bratwurst', 'wienerkorv', 'frankfurter', 'grillkorv', 'kokkorv', 'prinskorv'], costPerKg: 90, co2ePerKg: 7 },
  { name: 'Salami',           keywords: ['salami', 'mortadella'],                                         costPerKg: 240, co2ePerKg: 9 },
  { name: 'Blodpudding',      keywords: ['blodpudding'],                                                  costPerKg: 50,  co2ePerKg: 4 },
  { name: 'Leverpastej',      keywords: ['leverpastej', 'lever'],                                         costPerKg: 80,  co2ePerKg: 5 },
  { name: 'Korv (övrigt)',    keywords: ['korv'],                                                         costPerKg: 100, co2ePerKg: 7 },

  // ─── Fågel ──────────────────────────────────────────────────────────────
  { name: 'Kycklingfilé',     keywords: ['kycklingfilé', 'kycklingfile', 'kycklingbröst'],                costPerKg: 160, co2ePerKg: 5 },
  { name: 'Kycklinglår',      keywords: ['kycklinglår', 'kycklingben', 'kycklingvinge'],                  costPerKg: 110, co2ePerKg: 5 },
  { name: 'Kycklingfärs',     keywords: ['kycklingfärs'],                                                 costPerKg: 130, co2ePerKg: 5 },
  { name: 'Hel kyckling',     keywords: ['hel kyckling', 'majskyckling'],                                 costPerKg: 90,  co2ePerKg: 5 },
  { name: 'Kyckling',         keywords: ['kyckling'],                                                     costPerKg: 130, co2ePerKg: 5 },
  { name: 'Kalkon',           keywords: ['kalkon'],                                                       costPerKg: 140, co2ePerKg: 5 },
  { name: 'Anka',             keywords: ['anka', 'ankbröst', 'anklår'],                                   costPerKg: 280, co2ePerKg: 6 },

  // ─── Vilt ───────────────────────────────────────────────────────────────
  { name: 'Renskav',          keywords: ['renskav'],                                                      costPerKg: 280, co2ePerKg: 6 },
  { name: 'Älg',              keywords: ['älgkött', 'älgfärs', 'älg'],                                    costPerKg: 260, co2ePerKg: 6 },
  { name: 'Hjort',            keywords: ['hjort', 'rådjur'],                                              costPerKg: 300, co2ePerKg: 6 },
  { name: 'Ren',              keywords: ['ren', 'renstek', 'renkött'],                                    costPerKg: 280, co2ePerKg: 6 },
  { name: 'Vilt',             keywords: ['vilt', 'viltfärs'],                                             costPerKg: 280, co2ePerKg: 6 },

  // ════════════════════════════════════════════════════════════════════════
  // FISK & SKALDJUR
  // ════════════════════════════════════════════════════════════════════════
  { name: 'Lax (filé)',       keywords: ['laxfilé', 'laxfile', 'laxsida'],                                costPerKg: 230, co2ePerKg: 5 },
  { name: 'Varmrökt lax',     keywords: ['varmrökt lax', 'varmrokt lax'],                                 costPerKg: 280, co2ePerKg: 6 },
  { name: 'Gravlax',          keywords: ['gravlax', 'kallrökt lax'],                                      costPerKg: 320, co2ePerKg: 6 },
  { name: 'Lax',              keywords: ['lax'],                                                          costPerKg: 220, co2ePerKg: 5 },
  { name: 'Torsk',            keywords: ['torsk', 'torskrygg', 'torskfilé', 'torskfile'],                 costPerKg: 230, co2ePerKg: 3 },
  { name: 'Sej / kolja',      keywords: ['sej', 'kolja', 'gråsej'],                                       costPerKg: 160, co2ePerKg: 3 },
  { name: 'Rödspätta',        keywords: ['rödspätta', 'rödspatta', 'flundra'],                            costPerKg: 200, co2ePerKg: 3 },
  { name: 'Sill / strömming', keywords: ['sill', 'strömming', 'stromming'],                               costPerKg: 90,  co2ePerKg: 1.5 },
  { name: 'Makrill',          keywords: ['makrill'],                                                      costPerKg: 110, co2ePerKg: 1.8 },
  { name: 'Ansjovis',         keywords: ['ansjovis', 'sardell'],                                          costPerKg: 200, co2ePerKg: 2.5 },
  { name: 'Sardiner',         keywords: ['sardin'],                                                       costPerKg: 90,  co2ePerKg: 2 },
  { name: 'Tonfisk',          keywords: ['tonfisk'],                                                      costPerKg: 95,  co2ePerKg: 6 },
  { name: 'Räkor',            keywords: ['räkor', 'räka', 'tigerräkor', 'pillade räkor'],                 costPerKg: 320, co2ePerKg: 11 },
  { name: 'Kräftor',          keywords: ['kräftor', 'kräfta', 'kräftstjärt'],                             costPerKg: 280, co2ePerKg: 9 },
  { name: 'Hummer',           keywords: ['hummer'],                                                       costPerKg: 500, co2ePerKg: 13 },
  { name: 'Krabba',           keywords: ['krabba', 'krabbkött'],                                          costPerKg: 220, co2ePerKg: 8 },
  { name: 'Musslor',          keywords: ['blåmusslor', 'musslor', 'mussla'],                              costPerKg: 90,  co2ePerKg: 0.6 },
  { name: 'Kammusslor',       keywords: ['kammusslor', 'pilgrimsmussla', 'kammussla'],                    costPerKg: 380, co2ePerKg: 3 },
  { name: 'Bläckfisk',        keywords: ['bläckfisk', 'calamari', 'calamari', 'tioarmad bläckfisk'],      costPerKg: 220, co2ePerKg: 6 },
  { name: 'Löjrom',           keywords: ['löjrom', 'lojrom', 'rom'],                                      costPerKg: 1400, co2ePerKg: 4 },
  { name: 'Kaviar',           keywords: ['kaviar'],                                                       costPerKg: 250, co2ePerKg: 3 },
  { name: 'Surimi',           keywords: ['surimi', 'krabbsticks'],                                        costPerKg: 110, co2ePerKg: 3 },
  { name: 'Fisk (övrigt)',    keywords: ['fisk', 'vitfisk', 'fiskfilé', 'fiskfile'],                      costPerKg: 200, co2ePerKg: 4 },

  // ════════════════════════════════════════════════════════════════════════
  // MEJERI & ÄGG
  // ════════════════════════════════════════════════════════════════════════
  // Ostar (specifika först)
  { name: 'Västerbottensost', keywords: ['västerbottensost', 'vasterbottensost', 'västerbotten'],         costPerKg: 280, co2ePerKg: 15 },
  { name: 'Parmesan',         keywords: ['parmesan', 'pecorino', 'grana padano'],                         costPerKg: 320, co2ePerKg: 15 },
  { name: 'Cheddar',          keywords: ['cheddar'],                                                      costPerKg: 180, co2ePerKg: 14 },
  { name: 'Brie / Camembert', keywords: ['brie', 'camembert'],                                            costPerKg: 200, co2ePerKg: 12 },
  { name: 'Blåmögelost',      keywords: ['blåmögelost', 'gorgonzola', 'roquefort', 'stilton', 'blue cheese'], costPerKg: 240, co2ePerKg: 13 },
  { name: 'Burrata',          keywords: ['burrata'],                                                      costPerKg: 220, co2ePerKg: 12 },
  { name: 'Mozzarella',       keywords: ['mozzarella'],                                                   costPerKg: 130, co2ePerKg: 11 },
  { name: 'Halloumi',         keywords: ['halloumi'],                                                     costPerKg: 180, co2ePerKg: 12 },
  { name: 'Feta',             keywords: ['feta', 'fetaost'],                                              costPerKg: 140, co2ePerKg: 11 },
  { name: 'Paneer',           keywords: ['paneer'],                                                       costPerKg: 160, co2ePerKg: 11 },
  { name: 'Ricotta',          keywords: ['ricotta'],                                                      costPerKg: 100, co2ePerKg: 7 },
  { name: 'Mascarpone',       keywords: ['mascarpone'],                                                   costPerKg: 180, co2ePerKg: 10 },
  { name: 'Philadelphia',     keywords: ['philadelphia', 'färskost', 'creme cheese', 'cream cheese'],     costPerKg: 140, co2ePerKg: 9 },
  { name: 'Ost (hård)',       keywords: ['ost', 'gouda', 'edamer', 'havarti', 'gruyère', 'manchego', 'taleggio'], costPerKg: 160, co2ePerKg: 14 },

  // Övriga mejeriprodukter
  { name: 'Smörolja / ghi',   keywords: ['smörolja', 'smorolja', 'ghi', 'ghee'],                          costPerKg: 180, co2ePerKg: 13 },
  { name: 'Smör',             keywords: ['smör'],                                                         costPerKg: 110, co2ePerKg: 12 },
  { name: 'Margarin',         keywords: ['margarin', 'bregott'],                                          costPerKg: 60,  co2ePerKg: 3 },
  { name: 'Vispgrädde',       keywords: ['vispgrädde'],                                                   costPerKg: 60,  co2ePerKg: 6 },
  { name: 'Matlagningsgrädde',keywords: ['matlagningsgrädde'],                                            costPerKg: 50,  co2ePerKg: 5 },
  { name: 'Crème fraîche',    keywords: ['creme fraiche', 'crème fraiche', 'creme fraîche'],              costPerKg: 70,  co2ePerKg: 6 },
  { name: 'Gräddfil',         keywords: ['gräddfil', 'graddfil'],                                         costPerKg: 50,  co2ePerKg: 4 },
  { name: 'Sour cream',       keywords: ['sour cream', 'gräddfil'],                                       costPerKg: 70,  co2ePerKg: 5 },
  { name: 'Grädde',           keywords: ['grädde'],                                                       costPerKg: 55,  co2ePerKg: 6 },
  { name: 'Kvarg',            keywords: ['kvarg', 'kesella', 'keso'],                                     costPerKg: 50,  co2ePerKg: 3 },
  { name: 'Yoghurt grekisk',  keywords: ['grekisk yoghurt', 'turkisk yoghurt', 'turkisk yoghurt'],        costPerKg: 60,  co2ePerKg: 3 },
  { name: 'Yoghurt',          keywords: ['yoghurt'],                                                      costPerKg: 35,  co2ePerKg: 2 },
  { name: 'Filmjölk',         keywords: ['filmjölk', 'filmjolk', 'kefir', 'kärnmjölk'],                   costPerKg: 18,  co2ePerKg: 1.5 },
  { name: 'Mjölk',            keywords: ['mjölk', 'mjolk'],                                               costPerKg: 14,  co2ePerKg: 1.4 },

  // Ägg
  { name: 'Äggula',           keywords: ['äggula', 'aggula', 'gula'],                                     costPerKg: 70,  co2ePerKg: 5 },
  { name: 'Äggvita',          keywords: ['äggvita', 'aggvita'],                                           costPerKg: 35,  co2ePerKg: 3 },
  { name: 'Ägg',              keywords: ['ägg', 'agg'],                                                   costPerKg: 55,  co2ePerKg: 4 },

  // Växtbaserad mjölk
  { name: 'Havredryck',       keywords: ['havredryck', 'havremjölk', 'havremjolk', 'oatly'],              costPerKg: 18,  co2ePerKg: 0.4 },
  { name: 'Sojadryck',        keywords: ['sojadryck', 'sojamjölk', 'sojamjolk'],                          costPerKg: 22,  co2ePerKg: 0.5 },
  { name: 'Mandelmjölk',      keywords: ['mandelmjölk', 'mandelmjolk', 'mandeldryck'],                    costPerKg: 28,  co2ePerKg: 0.6 },
  { name: 'Kokosgrädde',      keywords: ['kokosgrädde', 'kokosmjölk', 'kokosmjolk', 'kokoskräm'],         costPerKg: 45,  co2ePerKg: 2.5 },

  // ════════════════════════════════════════════════════════════════════════
  // VEGETABILISKA PROTEINER & BÖNOR
  // ════════════════════════════════════════════════════════════════════════
  { name: 'Tofu',             keywords: ['tofu', 'dubu'],                                                 costPerKg: 70,  co2ePerKg: 1.2 },
  { name: 'Tempeh',           keywords: ['tempeh'],                                                       costPerKg: 110, co2ePerKg: 1.5 },
  { name: 'Sojafärs',         keywords: ['sojafärs', 'sojaprodukter', 'oumph', 'oumphfärs', 'oumph färs'], costPerKg: 90, co2ePerKg: 1.5 },
  { name: 'Quorn',            keywords: ['quorn', 'mykoprotein'],                                         costPerKg: 130, co2ePerKg: 1.5 },
  { name: 'Plantbeef',        keywords: ['plantbeef', 'beyond meat', 'beyond burger', 'växtfärs', 'växtbaserad färs', 'vegofärs'], costPerKg: 130, co2ePerKg: 2 },
  { name: 'Sejtan',           keywords: ['sejtan', 'seitan', 'vetegluten'],                               costPerKg: 90,  co2ePerKg: 1.5 },
  { name: 'Kikärtor',         keywords: ['kikärt', 'kikärtor', 'kikartor', 'kikart'],                     costPerKg: 35,  co2ePerKg: 0.8 },
  { name: 'Röda linser',      keywords: ['röda linser', 'roda linser'],                                   costPerKg: 40,  co2ePerKg: 0.9 },
  { name: 'Gröna/svarta linser', keywords: ['gröna linser', 'svarta linser', 'belugalinser', 'puylinser', 'puy linser'], costPerKg: 55, co2ePerKg: 0.9 },
  { name: 'Linser',           keywords: ['linser', 'lins'],                                               costPerKg: 40,  co2ePerKg: 0.9 },
  { name: 'Svarta bönor',     keywords: ['svarta bönor', 'svarta bonor'],                                 costPerKg: 35,  co2ePerKg: 0.8 },
  { name: 'Kidneybönor',      keywords: ['kidneyböna', 'kidneybönor', 'kidneybonor'],                     costPerKg: 35,  co2ePerKg: 0.8 },
  { name: 'Vita bönor',       keywords: ['vita bönor', 'vita bonor', 'cannellini', 'butter beans'],       costPerKg: 35,  co2ePerKg: 0.8 },
  { name: 'Borlotti',         keywords: ['borlotti'],                                                     costPerKg: 45,  co2ePerKg: 0.8 },
  { name: 'Sojabönor',        keywords: ['sojaböna', 'sojabönor', 'edamame'],                             costPerKg: 50,  co2ePerKg: 1.0 },
  { name: 'Bönor (övriga)',   keywords: ['bönor', 'bonor'],                                               costPerKg: 35,  co2ePerKg: 0.8 },

  // ════════════════════════════════════════════════════════════════════════
  // KOLHYDRATER — SPANNMÅL, RIS, PASTA, POTATIS, BRÖD
  // ════════════════════════════════════════════════════════════════════════
  { name: 'Basmati / jasmin', keywords: ['jasminris', 'basmati', 'basmatiris'],                           costPerKg: 35,  co2ePerKg: 4 },
  { name: 'Risotto-ris',      keywords: ['arborio', 'carnaroli', 'risotto-ris', 'risottoris'],            costPerKg: 50,  co2ePerKg: 4 },
  { name: 'Sushiris',         keywords: ['sushiris', 'sushi-ris', 'rundkornigt ris'],                     costPerKg: 50,  co2ePerKg: 4 },
  { name: 'Fullkornsris',     keywords: ['fullkornsris', 'råris'],                                        costPerKg: 35,  co2ePerKg: 4 },
  { name: 'Ris',              keywords: ['ris'],                                                          costPerKg: 30,  co2ePerKg: 4 },
  { name: 'Spaghetti',        keywords: ['spaghetti'],                                                    costPerKg: 25,  co2ePerKg: 1.5 },
  { name: 'Tagliatelle',      keywords: ['tagliatelle', 'fettuccine', 'pappardelle'],                     costPerKg: 30,  co2ePerKg: 1.5 },
  { name: 'Penne / makaroner',keywords: ['penne', 'makaroner', 'rigatoni', 'fusilli'],                    costPerKg: 25,  co2ePerKg: 1.5 },
  { name: 'Lasagneplattor',   keywords: ['lasagneplattor', 'lasagne'],                                    costPerKg: 30,  co2ePerKg: 1.5 },
  { name: 'Tortellini',       keywords: ['tortellini', 'ravioli'],                                        costPerKg: 90,  co2ePerKg: 3 },
  { name: 'Pasta',            keywords: ['pasta'],                                                        costPerKg: 25,  co2ePerKg: 1.5 },
  { name: 'Gnocchi',          keywords: ['gnocchi'],                                                      costPerKg: 60,  co2ePerKg: 1.4 },
  { name: 'Risnudlar',        keywords: ['risnudlar', 'risnudel'],                                        costPerKg: 50,  co2ePerKg: 2 },
  { name: 'Äggnudlar',        keywords: ['äggnudlar', 'aggnudlar', 'mie-nudlar'],                         costPerKg: 50,  co2ePerKg: 2 },
  { name: 'Ramen-nudlar',     keywords: ['ramen', 'ramen-nudlar', 'ramennudlar'],                         costPerKg: 70,  co2ePerKg: 2 },
  { name: 'Udon',             keywords: ['udon'],                                                         costPerKg: 80,  co2ePerKg: 2 },
  { name: 'Soba',             keywords: ['soba'],                                                         costPerKg: 90,  co2ePerKg: 1.6 },
  { name: 'Glasnudlar',       keywords: ['glasnudlar', 'glasnudel', 'cellofan-nudlar'],                   costPerKg: 80,  co2ePerKg: 2 },
  { name: 'Nudlar',           keywords: ['nudlar', 'nudel'],                                              costPerKg: 60,  co2ePerKg: 2 },
  { name: 'Färskpotatis',     keywords: ['färskpotatis', 'farskpotatis', 'amandinepotatis', 'amandine'],  costPerKg: 35,  co2ePerKg: 0.3 },
  { name: 'Klyftpotatis',     keywords: ['klyftpotatis', 'rostad potatis'],                               costPerKg: 22,  co2ePerKg: 0.3 },
  { name: 'Pommes frites',    keywords: ['pommes', 'pommes frites'],                                      costPerKg: 30,  co2ePerKg: 0.5 },
  { name: 'Sötpotatis',       keywords: ['sötpotatis', 'sotpotatis'],                                     costPerKg: 35,  co2ePerKg: 0.4 },
  { name: 'Potatis',          keywords: ['potatis'],                                                      costPerKg: 20,  co2ePerKg: 0.3 },
  { name: 'Tortilla',         keywords: ['tortilla', 'tortillas', 'tortillabröd', 'wrap'],                costPerKg: 60,  co2ePerKg: 1.1 },
  { name: 'Pitabröd',         keywords: ['pita', 'pitabröd', 'pita-bröd'],                                costPerKg: 55,  co2ePerKg: 1.0 },
  { name: 'Naanbröd',         keywords: ['naan', 'naanbröd'],                                             costPerKg: 60,  co2ePerKg: 1.2 },
  { name: 'Hamburgerbröd',    keywords: ['hamburgerbröd', 'hamburgerbrod', 'burgerbröd', 'briochebröd'],  costPerKg: 70,  co2ePerKg: 1.1 },
  { name: 'Tunnbröd',         keywords: ['tunnbröd', 'tunnbrod'],                                         costPerKg: 70,  co2ePerKg: 1.0 },
  { name: 'Knäckebröd',       keywords: ['knäckebröd', 'knackebrod'],                                     costPerKg: 70,  co2ePerKg: 1.1 },
  { name: 'Baguette',         keywords: ['baguette', 'frukostbröd', 'ciabatta', 'focaccia'],              costPerKg: 50,  co2ePerKg: 1.1 },
  { name: 'Surdegsbröd',      keywords: ['surdegsbröd', 'surdeg', 'levain'],                              costPerKg: 70,  co2ePerKg: 1.2 },
  { name: 'Bröd',             keywords: ['bröd', 'brod', 'limpa'],                                        costPerKg: 50,  co2ePerKg: 1.1 },
  { name: 'Bao buns',         keywords: ['bao', 'bao bun', 'bao-bröd'],                                   costPerKg: 90,  co2ePerKg: 1.4 },
  { name: 'Pizzadeg',         keywords: ['pizzadeg', 'pinsa-deg', 'pinsa'],                               costPerKg: 35,  co2ePerKg: 1.1 },
  { name: 'Kimbap-nori',      keywords: ['nori', 'kimbap', 'sushi-nori'],                                 costPerKg: 800, co2ePerKg: 0.5 },
  { name: 'Wakame',           keywords: ['wakame', 'tång', 'tang', 'hijiki'],                             costPerKg: 600, co2ePerKg: 0.3 },
  { name: 'Bulgur',           keywords: ['bulgur'],                                                       costPerKg: 35,  co2ePerKg: 1.2 },
  { name: 'Couscous',         keywords: ['couscous'],                                                     costPerKg: 40,  co2ePerKg: 1.2 },
  { name: 'Matvete',          keywords: ['matvete'],                                                      costPerKg: 35,  co2ePerKg: 1.0 },
  { name: 'Quinoa',           keywords: ['quinoa'],                                                       costPerKg: 90,  co2ePerKg: 1.5 },
  { name: 'Polenta',          keywords: ['polenta'],                                                      costPerKg: 30,  co2ePerKg: 1.0 },
  { name: 'Havregryn',        keywords: ['havregryn', 'flingor', 'müsli', 'musli'],                       costPerKg: 25,  co2ePerKg: 0.8 },
  { name: 'Vetemjöl',         keywords: ['vetemjöl', 'vetemjol', 'durumvete'],                            costPerKg: 18,  co2ePerKg: 0.7 },
  { name: 'Rågmjöl',          keywords: ['rågmjöl', 'ragmjol'],                                           costPerKg: 25,  co2ePerKg: 0.7 },
  { name: 'Mandelmjöl',       keywords: ['mandelmjöl', 'mandelmjol', 'nötmjöl'],                          costPerKg: 200, co2ePerKg: 3 },
  { name: 'Mjöl (annat)',     keywords: ['mjöl', 'mjol'],                                                 costPerKg: 18,  co2ePerKg: 0.8 },
  { name: 'Ströbröd / panko', keywords: ['ströbröd', 'strobrod', 'panko', 'ströbrödssmulor'],             costPerKg: 60,  co2ePerKg: 1.0 },
  { name: 'Jäst',             keywords: ['jäst', 'torrjäst', 'färskjäst'],                                costPerKg: 120, co2ePerKg: 1.0 },
  { name: 'Bakpulver',        keywords: ['bakpulver', 'bikarbonat'],                                      costPerKg: 100, co2ePerKg: 1.0 },

  // ════════════════════════════════════════════════════════════════════════
  // GRÖNSAKER
  // ════════════════════════════════════════════════════════════════════════
  // Tomat-familjen (specifika först)
  { name: 'Soltorkad tomat',  keywords: ['soltorkad tomat', 'soltorkade tomater'],                        costPerKg: 220, co2ePerKg: 2 },
  { name: 'Körsbärstomat',    keywords: ['körsbärstomat', 'cocktail tomater', 'cocktailtomater', 'datteltomater'], costPerKg: 80, co2ePerKg: 1.6 },
  { name: 'Krossade tomater', keywords: ['krossade tomater', 'passerade tomater', 'pulpa', 'tomatpulpa'], costPerKg: 25,  co2ePerKg: 1.1 },
  { name: 'Tomatpuré',        keywords: ['tomatpuré', 'tomatpure', 'tomatkoncentrat'],                    costPerKg: 60,  co2ePerKg: 1.5 },
  { name: 'Tomatsås',         keywords: ['tomatsås', 'tomatsas', 'marinara'],                             costPerKg: 35,  co2ePerKg: 1.2 },
  { name: 'Tomat',            keywords: ['tomat', 'bifftomat'],                                           costPerKg: 40,  co2ePerKg: 1.4 },

  // Lök-familjen
  { name: 'Schalottenlök',    keywords: ['schalottenlök', 'schalottenlok'],                               costPerKg: 60,  co2ePerKg: 0.4 },
  { name: 'Rödlök',           keywords: ['rödlök', 'rodlok'],                                             costPerKg: 25,  co2ePerKg: 0.3 },
  { name: 'Salladslök',       keywords: ['salladslök', 'salladslok', 'vårlök', 'varlok', 'salotti'],      costPerKg: 35,  co2ePerKg: 0.4 },
  { name: 'Purjolök',         keywords: ['purjolök', 'purjolok'],                                         costPerKg: 30,  co2ePerKg: 0.4 },
  { name: 'Vitlök',           keywords: ['vitlök', 'vitlok'],                                             costPerKg: 90,  co2ePerKg: 0.5 },
  { name: 'Gul lök',          keywords: ['gul lök', 'lök', 'lok'],                                        costPerKg: 18,  co2ePerKg: 0.3 },
  { name: 'Gräslök',          keywords: ['gräslök', 'graslok'],                                           costPerKg: 200, co2ePerKg: 1.0 },

  // Rotfrukter
  { name: 'Morot',            keywords: ['morot', 'morötter', 'baby-morötter'],                           costPerKg: 18,  co2ePerKg: 0.3 },
  { name: 'Palsternacka',     keywords: ['palsternacka'],                                                 costPerKg: 30,  co2ePerKg: 0.4 },
  { name: 'Kålrot',           keywords: ['kålrot', 'kalrot', 'rotmos'],                                   costPerKg: 22,  co2ePerKg: 0.3 },
  { name: 'Rödbeta',          keywords: ['rödbeta', 'rodbeta'],                                           costPerKg: 22,  co2ePerKg: 0.3 },
  { name: 'Jordärtskocka',    keywords: ['jordärtskocka', 'jordartskocka', 'topinambur'],                 costPerKg: 70,  co2ePerKg: 0.4 },
  { name: 'Selleri / sellerirot', keywords: ['sellerirot', 'rotselleri', 'stjälkselleri', 'stjalkselleri', 'selleri'], costPerKg: 30, co2ePerKg: 0.4 },
  { name: 'Rättika / daikon', keywords: ['daikon', 'rättika', 'rattika'],                                 costPerKg: 40,  co2ePerKg: 0.3 },
  { name: 'Rädisa',           keywords: ['rädisa', 'radisa'],                                             costPerKg: 60,  co2ePerKg: 0.4 },
  { name: 'Ingefära',         keywords: ['ingefära', 'ingefara'],                                         costPerKg: 110, co2ePerKg: 0.7 },
  { name: 'Galangal',         keywords: ['galangal'],                                                     costPerKg: 200, co2ePerKg: 1.0 },
  { name: 'Pepparrot',        keywords: ['pepparrot'],                                                    costPerKg: 110, co2ePerKg: 0.6 },

  // Kål
  { name: 'Grönkål',          keywords: ['grönkål', 'gronkal', 'kale'],                                   costPerKg: 60,  co2ePerKg: 0.5 },
  { name: 'Brysselkål',       keywords: ['brysselkål', 'brysselkal'],                                     costPerKg: 50,  co2ePerKg: 0.5 },
  { name: 'Vitkål',           keywords: ['vitkål', 'vitkal', 'spetskål', 'spetskal'],                     costPerKg: 18,  co2ePerKg: 0.4 },
  { name: 'Rödkål',           keywords: ['rödkål', 'rodkal'],                                             costPerKg: 22,  co2ePerKg: 0.4 },
  { name: 'Savojkål',         keywords: ['savojkål', 'savojkal'],                                         costPerKg: 30,  co2ePerKg: 0.4 },
  { name: 'Kinakål',          keywords: ['kinakål', 'kinakal', 'salladskål', 'salladskal'],               costPerKg: 30,  co2ePerKg: 0.4 },
  { name: 'Pak choi',         keywords: ['pak choi', 'bok choy', 'pak-choi'],                             costPerKg: 50,  co2ePerKg: 0.5 },
  { name: 'Broccoli',         keywords: ['broccoli', 'broccolini', 'tenderstem'],                         costPerKg: 35,  co2ePerKg: 0.5 },
  { name: 'Blomkål',          keywords: ['blomkål', 'blomkal', 'romanesco'],                              costPerKg: 35,  co2ePerKg: 0.5 },

  // Fruktgrönsaker
  { name: 'Paprika',          keywords: ['paprika'],                                                      costPerKg: 50,  co2ePerKg: 1.0 },
  { name: 'Chili',            keywords: ['chili', 'jalapeño', 'jalapeno', 'habanero', 'serrano-chili', 'birdseye'], costPerKg: 200, co2ePerKg: 1.0 },
  { name: 'Aubergine',        keywords: ['aubergine', 'äggplanta'],                                       costPerKg: 50,  co2ePerKg: 0.5 },
  { name: 'Zucchini',         keywords: ['zucchini', 'squash', 'patisson'],                               costPerKg: 40,  co2ePerKg: 0.5 },
  { name: 'Gurka',            keywords: ['gurka', 'salladsgurka', 'pressgurka', 'inlagd gurka'],          costPerKg: 35,  co2ePerKg: 1.0 },
  { name: 'Pumpa',            keywords: ['pumpa', 'butternut', 'hokkaido', 'muskotpumpa'],                costPerKg: 30,  co2ePerKg: 0.3 },
  { name: 'Majs',             keywords: ['majs', 'majskolv'],                                             costPerKg: 30,  co2ePerKg: 0.6 },

  // Bladgrönsaker
  { name: 'Spenat',           keywords: ['spenat', 'bladspenat'],                                         costPerKg: 80,  co2ePerKg: 0.5 },
  { name: 'Ruccola',          keywords: ['ruccola', 'rucola'],                                            costPerKg: 90,  co2ePerKg: 0.6 },
  { name: 'Mangold',          keywords: ['mangold', 'rödbetsblast'],                                      costPerKg: 70,  co2ePerKg: 0.5 },
  { name: 'Isbergssallad',    keywords: ['isberg', 'isbergssallad'],                                      costPerKg: 35,  co2ePerKg: 0.4 },
  { name: 'Romansallad',      keywords: ['romansallad', 'romaine'],                                       costPerKg: 50,  co2ePerKg: 0.5 },
  { name: 'Sallad (annat)',   keywords: ['sallad', 'salladsblad', 'salladsmix', 'mache', 'machesallad'],  costPerKg: 50,  co2ePerKg: 0.5 },
  { name: 'Basilika',         keywords: ['basilika'],                                                     costPerKg: 400, co2ePerKg: 1.5 },
  { name: 'Persilja',         keywords: ['persilja', 'bladpersilja'],                                     costPerKg: 200, co2ePerKg: 1.0 },
  { name: 'Koriander (färsk)',keywords: ['färsk koriander', 'koriander färsk', 'koriander blad'],         costPerKg: 250, co2ePerKg: 1.0 },
  { name: 'Mynta',            keywords: ['mynta'],                                                        costPerKg: 250, co2ePerKg: 1.0 },
  { name: 'Dill',             keywords: ['dill'],                                                         costPerKg: 200, co2ePerKg: 0.8 },
  { name: 'Dragon',           keywords: ['dragon', 'estragon'],                                           costPerKg: 250, co2ePerKg: 1.0 },
  { name: 'Salvia',           keywords: ['salvia'],                                                       costPerKg: 250, co2ePerKg: 1.0 },
  { name: 'Rosmarin',         keywords: ['rosmarin'],                                                     costPerKg: 200, co2ePerKg: 1.0 },
  { name: 'Timjan',           keywords: ['timjan'],                                                       costPerKg: 250, co2ePerKg: 1.0 },
  { name: 'Citrongräs',       keywords: ['citrongräs', 'citrongras', 'lemongrass'],                       costPerKg: 200, co2ePerKg: 1.0 },
  { name: 'Kaffirlimeblad',   keywords: ['kaffirlimeblad', 'limeblad'],                                   costPerKg: 600, co2ePerKg: 1.5 },

  // Övrigt
  { name: 'Sparris',          keywords: ['sparris', 'grön sparris', 'vit sparris'],                       costPerKg: 120, co2ePerKg: 0.8 },
  { name: 'Fänkål',           keywords: ['fänkål', 'fankal'],                                             costPerKg: 50,  co2ePerKg: 0.5 },
  { name: 'Gröna bönor',      keywords: ['haricots verts', 'gröna bönor', 'brytbönor', 'snittbönor'],     costPerKg: 60,  co2ePerKg: 0.8 },
  { name: 'Sockerärtor',      keywords: ['sockerärtor', 'sockerartor', 'sockerärter', 'snowpeas', 'snap peas'], costPerKg: 80, co2ePerKg: 0.7 },
  { name: 'Ärtor (frysta)',   keywords: ['ärtor', 'artor', 'gröna ärtor', 'gröna artor', 'ärter'],        costPerKg: 30,  co2ePerKg: 0.7 },
  { name: 'Avokado',          keywords: ['avokado'],                                                      costPerKg: 80,  co2ePerKg: 2.5 },
  { name: 'Oliver',           keywords: ['oliv', 'oliver', 'kalamata'],                                   costPerKg: 120, co2ePerKg: 1.5 },
  { name: 'Kapris',           keywords: ['kapris'],                                                       costPerKg: 220, co2ePerKg: 1.5 },
  { name: 'Bambuskott',       keywords: ['bambuskott'],                                                   costPerKg: 60,  co2ePerKg: 1.0 },
  { name: 'Vattenkastanj',    keywords: ['vattenkastanj'],                                                costPerKg: 80,  co2ePerKg: 1.0 },
  { name: 'Sojaböngroddar',   keywords: ['böngroddar', 'bongroddar', 'alfalfa', 'mungböngroddar'],        costPerKg: 35,  co2ePerKg: 0.5 },
  { name: 'Kimchi',           keywords: ['kimchi'],                                                       costPerKg: 110, co2ePerKg: 0.8 },
  { name: 'Surkål',           keywords: ['surkål', 'surkal', 'sauerkraut'],                               costPerKg: 50,  co2ePerKg: 0.5 },
  { name: 'Inlagda grönsaker',keywords: ['inlagda grönsaker', 'pickles', 'cornichoner', 'silverlök', 'rödbetor inlagda'], costPerKg: 60, co2ePerKg: 0.8 },

  // Svamp
  { name: 'Kantarell',        keywords: ['kantarell', 'trattkantarell'],                                  costPerKg: 350, co2ePerKg: 1.0 },
  { name: 'Karljohan',        keywords: ['karljohan', 'stensopp', 'porcini'],                             costPerKg: 280, co2ePerKg: 1.0 },
  { name: 'Shiitake',         keywords: ['shiitake', 'shitake'],                                          costPerKg: 200, co2ePerKg: 1.0 },
  { name: 'Portobello',       keywords: ['portobello'],                                                   costPerKg: 90,  co2ePerKg: 0.8 },
  { name: 'Champinjon',       keywords: ['champinjon', 'svamp', 'ostronskivling'],                        costPerKg: 60,  co2ePerKg: 0.8 },

  // ════════════════════════════════════════════════════════════════════════
  // FRUKT & BÄR
  // ════════════════════════════════════════════════════════════════════════
  { name: 'Citron',           keywords: ['citron', 'citronzest', 'citronsaft'],                           costPerKg: 50,  co2ePerKg: 0.8 },
  { name: 'Lime',             keywords: ['lime', 'limesaft', 'limezest'],                                 costPerKg: 60,  co2ePerKg: 0.9 },
  { name: 'Apelsin',          keywords: ['apelsin', 'apelsinzest', 'apelsinsaft'],                        costPerKg: 30,  co2ePerKg: 0.5 },
  { name: 'Mandarin',         keywords: ['mandarin', 'klementin'],                                        costPerKg: 35,  co2ePerKg: 0.5 },
  { name: 'Grapefrukt',       keywords: ['grapefrukt'],                                                   costPerKg: 40,  co2ePerKg: 0.6 },
  { name: 'Äpple',            keywords: ['äpple', 'apple'],                                               costPerKg: 30,  co2ePerKg: 0.4 },
  { name: 'Päron',            keywords: ['päron', 'paron'],                                               costPerKg: 30,  co2ePerKg: 0.5 },
  { name: 'Banan',            keywords: ['banan'],                                                        costPerKg: 25,  co2ePerKg: 0.9 },
  { name: 'Mango',            keywords: ['mango'],                                                        costPerKg: 60,  co2ePerKg: 1.6 },
  { name: 'Ananas',           keywords: ['ananas'],                                                       costPerKg: 35,  co2ePerKg: 1.2 },
  { name: 'Persika / nektarin', keywords: ['persika', 'nektarin', 'aprikos'],                             costPerKg: 50,  co2ePerKg: 0.6 },
  { name: 'Plommon',          keywords: ['plommon'],                                                      costPerKg: 50,  co2ePerKg: 0.4 },
  { name: 'Vindruvor',        keywords: ['druva', 'druvor', 'vindruvor'],                                 costPerKg: 50,  co2ePerKg: 0.7 },
  { name: 'Granatäpple',      keywords: ['granatäpple', 'granatapple', 'granatäpplekärnor'],              costPerKg: 80,  co2ePerKg: 0.8 },
  { name: 'Dadlar',           keywords: ['dadel', 'dadlar', 'medjool'],                                   costPerKg: 90,  co2ePerKg: 1.2 },
  { name: 'Fikon',            keywords: ['fikon', 'fig'],                                                 costPerKg: 110, co2ePerKg: 0.5 },
  { name: 'Russin',           keywords: ['russin', 'sultana', 'korinter'],                                costPerKg: 50,  co2ePerKg: 1.2 },

  // Bär
  { name: 'Lingon',           keywords: ['lingon'],                                                       costPerKg: 60,  co2ePerKg: 0.6 },
  { name: 'Jordgubbar',       keywords: ['jordgubbar', 'jordgubb'],                                       costPerKg: 90,  co2ePerKg: 1.0 },
  { name: 'Hallon',           keywords: ['hallon'],                                                       costPerKg: 120, co2ePerKg: 1.5 },
  { name: 'Blåbär',           keywords: ['blåbär', 'blabar'],                                             costPerKg: 100, co2ePerKg: 1.5 },
  { name: 'Hjortron',         keywords: ['hjortron'],                                                     costPerKg: 600, co2ePerKg: 1.0 },
  { name: 'Björnbär',         keywords: ['björnbär', 'bjornbar'],                                         costPerKg: 110, co2ePerKg: 1.4 },
  { name: 'Vinbär',           keywords: ['vinbär', 'vinbar', 'svarta vinbär'],                            costPerKg: 80,  co2ePerKg: 0.8 },

  // ════════════════════════════════════════════════════════════════════════
  // FETT & OLJOR
  // ════════════════════════════════════════════════════════════════════════
  { name: 'Olivolja',         keywords: ['olivolja', 'extra virgin'],                                     costPerKg: 90,  co2ePerKg: 3.0 },
  { name: 'Sesamolja',        keywords: ['sesamolja'],                                                    costPerKg: 200, co2ePerKg: 3.5 },
  { name: 'Kokosolja',        keywords: ['kokosolja'],                                                    costPerKg: 80,  co2ePerKg: 2.5 },
  { name: 'Rapsolja / matolja', keywords: ['rapsolja', 'matolja', 'solrosolja'],                          costPerKg: 40,  co2ePerKg: 2.5 },

  // ════════════════════════════════════════════════════════════════════════
  // SÅSER, VINÄGRAR, BULJONGER, KRYDDOR
  // ════════════════════════════════════════════════════════════════════════
  // Asiatiska såser
  { name: 'Soja (mörk)',      keywords: ['mörk soja', 'morksoja'],                                        costPerKg: 70,  co2ePerKg: 1.5 },
  { name: 'Soja (ljus)',      keywords: ['ljus soja', 'ljussoja'],                                        costPerKg: 60,  co2ePerKg: 1.5 },
  { name: 'Soja',             keywords: ['soja', 'sojasås'],                                              costPerKg: 50,  co2ePerKg: 1.5 },
  { name: 'Mirin',            keywords: ['mirin'],                                                        costPerKg: 90,  co2ePerKg: 1.5 },
  { name: 'Sake',             keywords: ['sake', 'kokvin japansk'],                                       costPerKg: 100, co2ePerKg: 1.5 },
  { name: 'Risvinäger',       keywords: ['risvinäger', 'risvinager', 'ris-vinäger'],                      costPerKg: 60,  co2ePerKg: 1.2 },
  { name: 'Miso',             keywords: ['miso', 'misopaste', 'misopasta'],                               costPerKg: 110, co2ePerKg: 1.5 },
  { name: 'Gochujang',        keywords: ['gochujang', 'koreansk chilipaste'],                             costPerKg: 130, co2ePerKg: 1.5 },
  { name: 'Hoisinsås',        keywords: ['hoisin', 'hoisinsås'],                                          costPerKg: 110, co2ePerKg: 1.5 },
  { name: 'Ostronsås',        keywords: ['ostronsås', 'ostronsas'],                                       costPerKg: 100, co2ePerKg: 1.5 },
  { name: 'Fisksås',          keywords: ['fisksås', 'fisksas', 'nam pla'],                                costPerKg: 60,  co2ePerKg: 2.0 },
  { name: 'Teriyaki',         keywords: ['teriyaki'],                                                     costPerKg: 90,  co2ePerKg: 1.5 },
  { name: 'Sweet chili',      keywords: ['sweet chili', 'sweetchili'],                                    costPerKg: 60,  co2ePerKg: 1.5 },
  { name: 'Sriracha',         keywords: ['sriracha'],                                                     costPerKg: 80,  co2ePerKg: 1.5 },
  { name: 'Sambal oelek',     keywords: ['sambal', 'sambal oelek'],                                       costPerKg: 100, co2ePerKg: 1.5 },
  { name: 'Dashi',            keywords: ['dashi'],                                                        costPerKg: 250, co2ePerKg: 2.0 },

  // Currypastor & blandningar
  { name: 'Röd currypasta',   keywords: ['röd curry', 'röd curry-pasta', 'röd currypasta', 'red curry'],  costPerKg: 200, co2ePerKg: 1.8 },
  { name: 'Grön currypasta',  keywords: ['grön curry', 'grön currypasta', 'green curry'],                 costPerKg: 200, co2ePerKg: 1.8 },
  { name: 'Panang-pasta',     keywords: ['panang', 'panang curry'],                                       costPerKg: 220, co2ePerKg: 1.8 },
  { name: 'Massaman',         keywords: ['massaman'],                                                     costPerKg: 220, co2ePerKg: 1.8 },
  { name: 'Tandoori-krydda',  keywords: ['tandoori', 'tikka masala-pasta', 'tikka-pasta'],                costPerKg: 220, co2ePerKg: 1.5 },
  { name: 'Curry (pulver)',   keywords: ['currypulver', 'currypaste', 'currypasta', 'curry'],             costPerKg: 220, co2ePerKg: 1.5 },
  { name: 'Garam masala',     keywords: ['garam masala'],                                                 costPerKg: 280, co2ePerKg: 1.5 },

  // Mellanöstern / Nordafrika
  { name: 'Tahini',           keywords: ['tahini', 'sesampasta'],                                         costPerKg: 130, co2ePerKg: 2.0 },
  { name: 'Harissa',          keywords: ['harissa'],                                                      costPerKg: 200, co2ePerKg: 1.5 },
  { name: 'Ras el hanout',    keywords: ['ras el hanout'],                                                costPerKg: 350, co2ePerKg: 1.5 },
  { name: 'Sumak',            keywords: ['sumak', 'sumac'],                                               costPerKg: 350, co2ePerKg: 1.5 },
  { name: 'Za\'atar',         keywords: ['za\'atar', 'zaatar'],                                           costPerKg: 350, co2ePerKg: 1.5 },
  { name: 'Granatäppelsirap', keywords: ['granatäppelsirap', 'granatapplesirap', 'pomegranate molasses'], costPerKg: 200, co2ePerKg: 2.0 },
  { name: 'Hummus',           keywords: ['hummus'],                                                       costPerKg: 90,  co2ePerKg: 1.2 },
  { name: 'Tzatziki',         keywords: ['tzatziki', 'tsatsiki'],                                         costPerKg: 80,  co2ePerKg: 3.0 },
  { name: 'Ezme',             keywords: ['ezme'],                                                         costPerKg: 90,  co2ePerKg: 1.5 },

  // Europeiska/franska/italienska klassiker
  { name: 'Dijonsenap',       keywords: ['dijon', 'dijonsenap'],                                          costPerKg: 110, co2ePerKg: 1.5 },
  { name: 'Senap',            keywords: ['senap', 'gravlaxsås', 'gravlaxsas'],                            costPerKg: 80,  co2ePerKg: 1.4 },
  { name: 'Worcestershiresås',keywords: ['worcestershire', 'worcestersås'],                               costPerKg: 110, co2ePerKg: 1.5 },
  { name: 'Pesto',            keywords: ['pesto', 'rödpesto', 'grönpesto'],                               costPerKg: 200, co2ePerKg: 4.0 },
  { name: 'Balsamvinäger',    keywords: ['balsamico', 'balsamvinäger', 'balsamvinager'],                  costPerKg: 130, co2ePerKg: 1.5 },
  { name: 'Vinäger (annan)',  keywords: ['vinäger', 'vinager', 'rödvinsvinäger', 'vitvinsvinäger', 'äppelcidervinäger'], costPerKg: 50, co2ePerKg: 1.2 },
  { name: 'Béarnaise',        keywords: ['béarnaise', 'bearnaise', 'béarnaisesås'],                       costPerKg: 200, co2ePerKg: 7 },
  { name: 'Hollandaise',      keywords: ['hollandaise'],                                                  costPerKg: 200, co2ePerKg: 7 },
  { name: 'Majonnäs',         keywords: ['majonnäs', 'majonnas', 'mayo', 'aioli'],                        costPerKg: 90,  co2ePerKg: 3 },
  { name: 'Ketchup',          keywords: ['ketchup'],                                                      costPerKg: 50,  co2ePerKg: 1.4 },

  // Buljonger / fonder
  { name: 'Grönsaksbuljong',  keywords: ['grönsaksbuljong', 'gronsaksbuljong'],                           costPerKg: 30,  co2ePerKg: 1.0 },
  { name: 'Kycklingbuljong',  keywords: ['kycklingbuljong'],                                              costPerKg: 30,  co2ePerKg: 1.5 },
  { name: 'Oxbuljong',        keywords: ['oxbuljong', 'köttbuljong'],                                     costPerKg: 30,  co2ePerKg: 2.0 },
  { name: 'Fiskbuljong',      keywords: ['fiskbuljong', 'skaldjursfond'],                                 costPerKg: 35,  co2ePerKg: 1.5 },
  { name: 'Kalvfond',         keywords: ['kalvfond', 'kalvbuljong'],                                      costPerKg: 80,  co2ePerKg: 2.0 },
  { name: 'Buljong',          keywords: ['buljong', 'fond'],                                              costPerKg: 30,  co2ePerKg: 1.5 },

  // Vin / alkohol till matlagning
  { name: 'Rödvin (matlagning)', keywords: ['rödvin', 'rodvin'],                                          costPerKg: 80,  co2ePerKg: 1.8 },
  { name: 'Vitvin (matlagning)', keywords: ['vitvin'],                                                    costPerKg: 80,  co2ePerKg: 1.8 },
  { name: 'Öl (matlagning)',     keywords: ['öl', 'lagerölen', 'ipa'],                                    costPerKg: 30,  co2ePerKg: 0.7 },
  { name: 'Cider',               keywords: ['cider'],                                                     costPerKg: 35,  co2ePerKg: 1.0 },
  { name: 'Sherry',              keywords: ['sherry', 'marsala', 'vermouth', 'port'],                     costPerKg: 200, co2ePerKg: 2.0 },
  { name: 'Cognac',              keywords: ['cognac', 'calvados', 'brandy'],                              costPerKg: 400, co2ePerKg: 2.5 },

  // Kryddor (vanliga)
  { name: 'Spiskummin',       keywords: ['spiskummin', 'kummin'],                                         costPerKg: 220, co2ePerKg: 1.5 },
  { name: 'Koriander (frö)',  keywords: ['korianderfrö', 'korianderfro', 'koriander frö', 'koriander pulver'], costPerKg: 220, co2ePerKg: 1.5 },
  { name: 'Paprikapulver',    keywords: ['paprikapulver', 'rökt paprika', 'pimentón'],                    costPerKg: 220, co2ePerKg: 1.5 },
  { name: 'Gurkmeja',         keywords: ['gurkmeja', 'turmeric'],                                         costPerKg: 220, co2ePerKg: 1.5 },
  { name: 'Kardemumma',       keywords: ['kardemumma'],                                                   costPerKg: 600, co2ePerKg: 1.5 },
  { name: 'Kanel',            keywords: ['kanel'],                                                        costPerKg: 220, co2ePerKg: 1.5 },
  { name: 'Saffran',          keywords: ['saffran'],                                                      costPerKg: 8000,co2ePerKg: 3.0 },
  { name: 'Muskot',           keywords: ['muskot', 'nutmeg'],                                             costPerKg: 350, co2ePerKg: 1.5 },
  { name: 'Lagerblad',        keywords: ['lagerblad'],                                                    costPerKg: 250, co2ePerKg: 1.0 },
  { name: 'Oregano',          keywords: ['oregano', 'mejram'],                                            costPerKg: 220, co2ePerKg: 1.0 },
  { name: 'Chiliflingor',     keywords: ['chiliflingor', 'chilipulver', 'cayenne'],                       costPerKg: 220, co2ePerKg: 1.5 },
  { name: 'Tacokrydda',       keywords: ['tacokrydda', 'fajitakrydda'],                                   costPerKg: 130, co2ePerKg: 1.5 },
  { name: 'Salt',             keywords: ['salt', 'havssalt', 'flingsalt'],                                costPerKg: 25,  co2ePerKg: 0.3 },
  { name: 'Peppar',           keywords: ['peppar', 'svartpeppar', 'vitpeppar'],                           costPerKg: 250, co2ePerKg: 1.5 },
  { name: 'Krydda (generisk)',keywords: ['krydda'],                                                       costPerKg: 200, co2ePerKg: 1.5 },

  // Sötningsmedel
  { name: 'Strösocker',       keywords: ['strösocker', 'strosocker', 'florsocker'],                       costPerKg: 18,  co2ePerKg: 1.0 },
  { name: 'Brunt socker',     keywords: ['brunt socker', 'farinsocker', 'muscovado'],                     costPerKg: 30,  co2ePerKg: 1.2 },
  { name: 'Honung',           keywords: ['honung'],                                                       costPerKg: 110, co2ePerKg: 0.8 },
  { name: 'Lönnsirap',        keywords: ['lönnsirap', 'lonnsirap', 'maple'],                              costPerKg: 200, co2ePerKg: 1.5 },
  { name: 'Agavesirap',       keywords: ['agave', 'agavesirap'],                                          costPerKg: 130, co2ePerKg: 1.2 },
  { name: 'Sirap',            keywords: ['sirap', 'ljus sirap', 'mörk sirap'],                            costPerKg: 35,  co2ePerKg: 1.0 },
  { name: 'Socker',           keywords: ['socker'],                                                       costPerKg: 18,  co2ePerKg: 1.0 },

  // Nötter & frön
  { name: 'Mandel',           keywords: ['mandel', 'mandlar'],                                            costPerKg: 200, co2ePerKg: 2.5 },
  { name: 'Cashew',           keywords: ['cashew', 'cashewnötter'],                                       costPerKg: 220, co2ePerKg: 3.0 },
  { name: 'Valnötter',        keywords: ['valnöt', 'valnotter', 'valnötter'],                             costPerKg: 200, co2ePerKg: 2.5 },
  { name: 'Hasselnötter',     keywords: ['hasselnöt', 'hasselnotter', 'hasselnötter'],                    costPerKg: 200, co2ePerKg: 2.0 },
  { name: 'Pinjenötter',      keywords: ['pinjenöt', 'pinjenotter', 'pinjenötter'],                       costPerKg: 600, co2ePerKg: 3.0 },
  { name: 'Jordnötter',       keywords: ['jordnöt', 'jordnotter', 'jordnötter', 'peanut'],                costPerKg: 60,  co2ePerKg: 1.5 },
  { name: 'Pistage',          keywords: ['pistasch', 'pistage'],                                          costPerKg: 280, co2ePerKg: 2.5 },
  { name: 'Sesamfrön',        keywords: ['sesamfrön', 'sesamfron', 'sesamfrö'],                           costPerKg: 130, co2ePerKg: 2.0 },
  { name: 'Pumpafrön',        keywords: ['pumpafrön', 'pumpafron', 'pumpakärnor', 'pumpakarnor'],         costPerKg: 100, co2ePerKg: 1.5 },
  { name: 'Solrosfrön',       keywords: ['solrosfrön', 'solrosfron', 'solroskärnor', 'solroskarnor'],     costPerKg: 50,  co2ePerKg: 1.0 },
  { name: 'Chiafrön',         keywords: ['chiafrön', 'chia'],                                             costPerKg: 130, co2ePerKg: 1.5 },
  { name: 'Linfrön',          keywords: ['linfrön', 'lin'],                                               costPerKg: 60,  co2ePerKg: 1.0 },
  { name: 'Jordnötssmör',     keywords: ['jordnötssmör', 'jordnotssmor', 'peanutbutter'],                 costPerKg: 110, co2ePerKg: 2.0 },

  // ════════════════════════════════════════════════════════════════════════
  // ÖVRIGT / SPECIALPRODUKTER
  // ════════════════════════════════════════════════════════════════════════
  { name: 'Choklad',          keywords: ['choklad', 'kakao', 'mörk choklad'],                             costPerKg: 200, co2ePerKg: 19 },
  { name: 'Vanilj',           keywords: ['vanilj', 'vaniljsocker', 'vaniljstång'],                        costPerKg: 600, co2ePerKg: 3.0 },
  { name: 'Gelatin',          keywords: ['gelatin', 'agar agar', 'agar-agar'],                            costPerKg: 200, co2ePerKg: 2.0 },
  { name: 'Vatten',           keywords: ['vatten', 'kranvatten'],                                         costPerKg: 0.01,co2ePerKg: 0.001 },
  { name: 'Iskuber / is',     keywords: ['is', 'iskuber'],                                                costPerKg: 5,   co2ePerKg: 0.05 },
]

/** Fallback when nothing matches. Neutral average values. */
export const LEX_FALLBACK: LexEntry = {
  name: 'Okänd ingrediens',
  keywords: [],
  costPerKg: 50,
  co2ePerKg: 1.5,
}

/** Find best lexicon entry by ingredient name. */
export function lookupIngredient(name: string): LexEntry {
  const lower = name.toLowerCase()
  for (const entry of INGREDIENT_LEXICON) {
    if (entry.keywords.some(k => lower.includes(k))) return entry
  }
  return LEX_FALLBACK
}
