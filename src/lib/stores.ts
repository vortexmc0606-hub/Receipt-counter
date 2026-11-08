/**
 * Store and brand recognition.
 *
 * Receipt headers are noisy ("WALMART #4521 SUPERCENTER", "STARBUCKS STORE
 * 12345"), and the same chain prints its name differently on every receipt. This
 * module maps whatever is printed to one canonical store name, and to a kind
 * (grocery, restaurant, fuel, …) so spending can be grouped by store and shown
 * per brand.
 *
 * The catalog below covers the large chains; anything not listed is recognised
 * from the receipt header itself and remembered locally, so the list grows with
 * use (see the Store registry in stores.ts consumers / db.ts).
 */

export type StoreKind =
  | 'Grocery'
  | 'Superstore'
  | 'Wholesale'
  | 'Convenience'
  | 'Pharmacy'
  | 'Restaurant'
  | 'Fast Food'
  | 'Coffee'
  | 'Bakery'
  | 'Ice Cream'
  | 'Fuel'
  | 'Electronics'
  | 'Home Improvement'
  | 'Clothing'
  | 'Department'
  | 'Entertainment'
  | 'Online'
  | 'Other';

export interface StoreDef {
  /** Canonical display name. */
  name: string;
  kind: StoreKind;
  /** Extra spellings / short forms seen on receipts. */
  aliases?: string[];
}

export const STORE_CATALOG: StoreDef[] = [
  // ---------- Grocery ----------
  { name: "Kroger", kind: 'Grocery', aliases: ['kroger', 'kroger co', 'kroger plus'] },
  { name: 'Safeway', kind: 'Grocery', aliases: ['safeway', 'safeway inc'] },
  { name: 'Albertsons', kind: 'Grocery', aliases: ['albertsons', 'albertson'] },
  { name: 'Publix', kind: 'Grocery', aliases: ['publix', 'publix super'] },
  { name: 'Aldi', kind: 'Grocery', aliases: ['aldi', 'aldi sud'] },
  { name: 'Lidl', kind: 'Grocery', aliases: ['lidl'] },
  { name: "Trader Joe's", kind: 'Grocery', aliases: ['trader joes', 'trader joe', 'trader joe s'] },
  { name: 'Whole Foods', kind: 'Grocery', aliases: ['whole foods', 'whole foods market', 'wfm'] },
  { name: 'Wegmans', kind: 'Grocery', aliases: ['wegmans', 'wegman'] },
  { name: 'H-E-B', kind: 'Grocery', aliases: ['h e b', 'heb', 'h e b grocery'] },
  { name: 'Meijer', kind: 'Grocery', aliases: ['meijer'] },
  { name: 'Food Lion', kind: 'Grocery', aliases: ['food lion', 'foodlion'] },
  { name: 'Stop & Shop', kind: 'Grocery', aliases: ['stop and shop', 'stop shop'] },
  { name: 'ShopRite', kind: 'Grocery', aliases: ['shoprite', 'shop rite'] },
  { name: 'Sprouts', kind: 'Grocery', aliases: ['sprouts', 'sprouts farmers market'] },
  { name: 'Harris Teeter', kind: 'Grocery', aliases: ['harris teeter', 'harristeeter'] },
  { name: 'Piggly Wiggly', kind: 'Grocery', aliases: ['piggly wiggly', 'piggly'] },
  { name: 'Winn-Dixie', kind: 'Grocery', aliases: ['winn dixie', 'winndixie'] },
  { name: 'Grocery Outlet', kind: 'Grocery', aliases: ['grocery outlet', 'grocery outlet bargain'] },
  { name: 'WinCo Foods', kind: 'Grocery', aliases: ['winco', 'winco foods'] },
  { name: 'Giant Eagle', kind: 'Grocery', aliases: ['giant eagle'] },
  { name: 'Giant', kind: 'Grocery', aliases: ['giant food', 'giant'] },
  { name: 'Schnucks', kind: 'Grocery', aliases: ['schnucks', 'schnuck'] },
  { name: 'Save A Lot', kind: 'Grocery', aliases: ['save a lot', 'savealot'] },
  { name: 'Market Basket', kind: 'Grocery', aliases: ['market basket'] },
  { name: 'Food 4 Less', kind: 'Grocery', aliases: ['food 4 less', 'food4less'] },
  { name: 'Jewel-Osco', kind: 'Grocery', aliases: ['jewel osco', 'jewel'] },
  { name: 'Ralphs', kind: 'Grocery', aliases: ['ralphs'] },
  { name: 'Vons', kind: 'Grocery', aliases: ['vons'] },
  { name: 'Fry\u2019s Food', kind: 'Grocery', aliases: ['frys food', 'frys'] },
  { name: 'King Soopers', kind: 'Grocery', aliases: ['king soopers'] },
  { name: 'Smith\u2019s Food', kind: 'Grocery', aliases: ['smiths food', 'smiths'] },
  { name: 'Fred Meyer', kind: 'Superstore', aliases: ['fred meyer', 'fredmeyer'] },
  { name: 'QFC', kind: 'Grocery', aliases: ['qfc', 'quality food center'] },
  { name: 'Dillons', kind: 'Grocery', aliases: ['dillons'] },
  { name: 'Mariano\u2019s', kind: 'Grocery', aliases: ['marianos'] },
  { name: 'Loblaws', kind: 'Grocery', aliases: ['loblaws', 'loblaw'] },
  { name: 'No Frills', kind: 'Grocery', aliases: ['no frills', 'nofrills'] },
  { name: 'Sobeys', kind: 'Grocery', aliases: ['sobeys', 'sobey'] },
  { name: 'Metro', kind: 'Grocery', aliases: ['metro grocery', 'metro'] },
  { name: 'Save-On-Foods', kind: 'Grocery', aliases: ['save on foods', 'saveonfoods'] },
  { name: 'Real Canadian Superstore', kind: 'Superstore', aliases: ['real canadian superstore', 'superstore'] },
  { name: 'T&T Supermarket', kind: 'Grocery', aliases: ['t t supermarket', 'tnt supermarket', 't&t'] },
  { name: 'Longo\u2019s', kind: 'Grocery', aliases: ['longos'] },
  { name: 'Farm Boy', kind: 'Grocery', aliases: ['farm boy'] },
  { name: 'Tesco', kind: 'Grocery', aliases: ['tesco'] },
  { name: 'Sainsbury\u2019s', kind: 'Grocery', aliases: ['sainsburys', 'sainsbury'] },
  { name: 'Asda', kind: 'Superstore', aliases: ['asda'] },
  { name: 'Morrisons', kind: 'Grocery', aliases: ['morrisons', 'morrison'] },
  { name: 'Waitrose', kind: 'Grocery', aliases: ['waitrose'] },
  { name: 'Coles', kind: 'Grocery', aliases: ['coles'] },
  { name: 'Woolworths', kind: 'Grocery', aliases: ['woolworths', 'woolies'] },
  { name: 'Patel Brothers', kind: 'Grocery', aliases: ['patel brothers', 'patel bros'] },
  { name: 'India Bazaar', kind: 'Grocery', aliases: ['india bazaar', 'indian bazaar'] },
  { name: 'Apna Bazar', kind: 'Grocery', aliases: ['apna bazar', 'apna bazaar'] },
  { name: 'Subzi Mandi', kind: 'Grocery', aliases: ['subzi mandi', 'sabzi mandi'] },
  { name: 'Namaste Plaza', kind: 'Grocery', aliases: ['namaste plaza', 'namaste'] },
  { name: 'Cash & Carry', kind: 'Wholesale', aliases: ['cash and carry', 'cash carry'] },

  // ---------- Superstore / Department ----------
  { name: 'Walmart', kind: 'Superstore', aliases: ['walmart', 'wal mart', 'walmart supercenter', 'walmart neighborhood market'] },
  { name: 'Target', kind: 'Department', aliases: ['target', 'target store', 'super target'] },
  { name: 'Costco', kind: 'Wholesale', aliases: ['costco', 'costco wholesale', 'costco business center'] },
  { name: "Sam's Club", kind: 'Wholesale', aliases: ['sams club', 'sams'] },
  { name: "BJ's Wholesale", kind: 'Wholesale', aliases: ['bjs wholesale', 'bjs', 'bj s wholesale'] },
  { name: 'Kmart', kind: 'Department', aliases: ['kmart', 'k mart'] },
  { name: 'Dollar General', kind: 'Convenience', aliases: ['dollar general', 'dollargeneral'] },
  { name: 'Dollar Tree', kind: 'Convenience', aliases: ['dollar tree'] },
  { name: 'Family Dollar', kind: 'Convenience', aliases: ['family dollar'] },
  { name: 'Five Below', kind: 'Department', aliases: ['five below'] },
  { name: 'Big Lots', kind: 'Department', aliases: ['big lots'] },
  { name: 'Macy\u2019s', kind: 'Department', aliases: ['macys', 'macy'] },
  { name: 'Nordstrom', kind: 'Department', aliases: ['nordstrom', 'nordstrom rack'] },
  { name: 'Kohl\u2019s', kind: 'Department', aliases: ['kohls', 'kohl'] },
  { name: 'JCPenney', kind: 'Department', aliases: ['jcpenney', 'jc penney', 'jcp'] },
  { name: 'Dillard\u2019s', kind: 'Department', aliases: ['dillards'] },
  { name: 'Belk', kind: 'Department', aliases: ['belk'] },
  { name: 'Bloomingdale\u2019s', kind: 'Department', aliases: ['bloomingdales'] },
  { name: 'Saks Fifth Avenue', kind: 'Department', aliases: ['saks fifth avenue', 'saks'] },
  { name: 'Neiman Marcus', kind: 'Department', aliases: ['neiman marcus', 'neiman'] },
  { name: 'TJ Maxx', kind: 'Clothing', aliases: ['tj maxx', 'tjmaxx', 't j maxx'] },
  { name: 'Marshalls', kind: 'Clothing', aliases: ['marshalls', 'marshall'] },
  { name: 'Ross', kind: 'Clothing', aliases: ['ross dress for less', 'ross'] },
  { name: 'Burlington', kind: 'Clothing', aliases: ['burlington', 'burlington coat factory'] },

  // ---------- Convenience / Fuel ----------
  { name: '7-Eleven', kind: 'Convenience', aliases: ['7 eleven', '7eleven', '7-eleven', 'seven eleven'] },
  { name: 'Circle K', kind: 'Convenience', aliases: ['circle k', 'circlek'] },
  { name: 'Wawa', kind: 'Convenience', aliases: ['wawa'] },
  { name: 'Sheetz', kind: 'Convenience', aliases: ['sheetz'] },
  { name: 'QuikTrip', kind: 'Convenience', aliases: ['quiktrip', 'quik trip', 'qt'] },
  { name: 'Casey\u2019s', kind: 'Convenience', aliases: ['caseys', 'casey'] },
  { name: 'Cumberland Farms', kind: 'Convenience', aliases: ['cumberland farms', 'cumberland'] },
  { name: 'RaceTrac', kind: 'Convenience', aliases: ['racetrac', 'race trac'] },
  { name: 'Kwik Trip', kind: 'Convenience', aliases: ['kwik trip', 'kwiktrip'] },
  { name: 'Maverik', kind: 'Convenience', aliases: ['maverik'] },
  { name: 'Buc-ee\u2019s', kind: 'Convenience', aliases: ['bucees', 'buc ee s'] },
  { name: 'Royal Farms', kind: 'Convenience', aliases: ['royal farms'] },
  { name: 'Turkey Hill', kind: 'Convenience', aliases: ['turkey hill'] },
  { name: 'Shell', kind: 'Fuel', aliases: ['shell', 'shell oil'] },
  { name: 'Chevron', kind: 'Fuel', aliases: ['chevron'] },
  { name: 'Exxon', kind: 'Fuel', aliases: ['exxon', 'exxonmobil'] },
  { name: 'Mobil', kind: 'Fuel', aliases: ['mobil', 'mobil 1'] },
  { name: 'BP', kind: 'Fuel', aliases: ['bp', 'british petroleum', 'bp gas'] },
  { name: 'Sunoco', kind: 'Fuel', aliases: ['sunoco'] },
  { name: 'Valero', kind: 'Fuel', aliases: ['valero'] },
  { name: 'Citgo', kind: 'Fuel', aliases: ['citgo'] },
  { name: 'Phillips 66', kind: 'Fuel', aliases: ['phillips 66', 'phillips'] },
  { name: 'Conoco', kind: 'Fuel', aliases: ['conoco'] },
  { name: 'ARCO', kind: 'Fuel', aliases: ['arco', 'arco ampm'] },
  { name: 'Marathon', kind: 'Fuel', aliases: ['marathon', 'marathon petroleum'] },
  { name: 'Speedway', kind: 'Fuel', aliases: ['speedway'] },
  { name: 'Love\u2019s', kind: 'Fuel', aliases: ['loves', 'loves travel'] },
  { name: 'Pilot', kind: 'Fuel', aliases: ['pilot', 'pilot flying j', 'flying j'] },

  // ---------- Pharmacy ----------
  { name: 'CVS', kind: 'Pharmacy', aliases: ['cvs', 'cvs pharmacy', 'cvs pharmacy store'] },
  { name: 'Walgreens', kind: 'Pharmacy', aliases: ['walgreens', 'walgreen'] },
  { name: 'Rite Aid', kind: 'Pharmacy', aliases: ['rite aid', 'riteaid'] },
  { name: 'Duane Reade', kind: 'Pharmacy', aliases: ['duane reade'] },
  { name: 'Shoppers Drug Mart', kind: 'Pharmacy', aliases: ['shoppers drug mart', 'shoppers'] },
  { name: 'Rexall', kind: 'Pharmacy', aliases: ['rexall'] },
  { name: 'London Drugs', kind: 'Pharmacy', aliases: ['london drugs'] },
  { name: 'Boots', kind: 'Pharmacy', aliases: ['boots', 'boots pharmacy'] },
  { name: 'Chemist Warehouse', kind: 'Pharmacy', aliases: ['chemist warehouse'] },

  // ---------- Restaurants (fast food) ----------
  { name: "McDonald's", kind: 'Fast Food', aliases: ['mcdonalds', 'mcdonald', 'mcd'] },
  { name: 'Burger King', kind: 'Fast Food', aliases: ['burger king', 'bk'] },
  { name: "Wendy's", kind: 'Fast Food', aliases: ['wendys', 'wendy'] },
  { name: 'Taco Bell', kind: 'Fast Food', aliases: ['taco bell', 'tacobell'] },
  { name: 'KFC', kind: 'Fast Food', aliases: ['kfc', 'kentucky fried chicken'] },
  { name: 'Popeyes', kind: 'Fast Food', aliases: ['popeyes', 'popeye', 'popeyes louisiana'] },
  { name: 'Chick-fil-A', kind: 'Fast Food', aliases: ['chick fil a', 'chickfila', 'chick fil'] },
  { name: 'Subway', kind: 'Fast Food', aliases: ['subway'] },
  { name: "Jimmy John's", kind: 'Fast Food', aliases: ['jimmy johns', 'jimmy john'] },
  { name: "Jersey Mike's", kind: 'Fast Food', aliases: ['jersey mikes', 'jersey mike'] },
  { name: 'Firehouse Subs', kind: 'Fast Food', aliases: ['firehouse subs', 'firehouse'] },
  { name: "Arby's", kind: 'Fast Food', aliases: ['arbys', 'arby'] },
  { name: 'Sonic', kind: 'Fast Food', aliases: ['sonic drive in', 'sonic'] },
  { name: 'Dairy Queen', kind: 'Fast Food', aliases: ['dairy queen', 'dq'] },
  { name: "Carl's Jr.", kind: 'Fast Food', aliases: ['carls jr', 'carls jr', 'carls'] },
  { name: 'Hardee\u2019s', kind: 'Fast Food', aliases: ['hardees', 'hardee'] },
  { name: 'Jack in the Box', kind: 'Fast Food', aliases: ['jack in the box', 'jack in box'] },
  { name: 'Whataburger', kind: 'Fast Food', aliases: ['whataburger', 'what a burger'] },
  { name: 'In-N-Out', kind: 'Fast Food', aliases: ['in n out', 'innout', 'in n out burger'] },
  { name: 'Five Guys', kind: 'Fast Food', aliases: ['five guys', '5 guys'] },
  { name: 'Shake Shack', kind: 'Fast Food', aliases: ['shake shack'] },
  { name: 'Culver\u2019s', kind: 'Fast Food', aliases: ['culvers', 'culver'] },
  { name: "Raising Cane's", kind: 'Fast Food', aliases: ['raising canes', 'raising cane'] },
  { name: "Zaxby's", kind: 'Fast Food', aliases: ['zaxbys', 'zaxby'] },
  { name: 'Bojangles', kind: 'Fast Food', aliases: ['bojangles', 'bojangle'] },
  { name: 'Del Taco', kind: 'Fast Food', aliases: ['del taco'] },
  { name: 'El Pollo Loco', kind: 'Fast Food', aliases: ['el pollo loco', 'pollo loco'] },
  { name: 'Chipotle', kind: 'Fast Food', aliases: ['chipotle', 'chipotle mexican grill'] },
  { name: 'Qdoba', kind: 'Fast Food', aliases: ['qdoba'] },
  { name: 'Moe\u2019s', kind: 'Fast Food', aliases: ['moes southwest', 'moes'] },
  { name: 'Panera', kind: 'Fast Food', aliases: ['panera', 'panera bread'] },
  { name: 'Potbelly', kind: 'Fast Food', aliases: ['potbelly', 'potbelly sandwich'] },
  { name: 'Quiznos', kind: 'Fast Food', aliases: ['quiznos'] },
  { name: 'Wingstop', kind: 'Fast Food', aliases: ['wingstop', 'wing stop'] },
  { name: 'Buffalo Wild Wings', kind: 'Restaurant', aliases: ['buffalo wild wings', 'bww', 'bdubs'] },
  { name: 'Hooters', kind: 'Restaurant', aliases: ['hooters'] },
  { name: 'Steak \u2018n Shake', kind: 'Fast Food', aliases: ['steak n shake', 'steak and shake'] },
  { name: 'White Castle', kind: 'Fast Food', aliases: ['white castle'] },
  { name: 'Krystal', kind: 'Fast Food', aliases: ['krystal'] },
  { name: 'Freddy\u2019s', kind: 'Fast Food', aliases: ['freddys', 'freddy'] },
  { name: 'Portillo\u2019s', kind: 'Fast Food', aliases: ['portillos', 'portillo'] },
  { name: "Jollibee", kind: 'Fast Food', aliases: ['jollibee'] },

  // ---------- Restaurants (pizza) ----------
  { name: "Domino's", kind: 'Fast Food', aliases: ['dominos', 'domino'] },
  { name: 'Pizza Hut', kind: 'Fast Food', aliases: ['pizza hut', 'pizzahut'] },
  { name: "Papa John's", kind: 'Fast Food', aliases: ['papa johns', 'papa john'] },
  { name: 'Little Caesars', kind: 'Fast Food', aliases: ['little caesars', 'little caesar'] },
  { name: "Papa Murphy's", kind: 'Fast Food', aliases: ['papa murphys'] },
  { name: "Marco's Pizza", kind: 'Fast Food', aliases: ['marcos pizza', 'marcos'] },
  { name: 'California Pizza Kitchen', kind: 'Restaurant', aliases: ['california pizza kitchen', 'cpk'] },
  { name: 'Blaze Pizza', kind: 'Fast Food', aliases: ['blaze pizza', 'blaze'] },
  { name: 'MOD Pizza', kind: 'Fast Food', aliases: ['mod pizza'] },
  { name: 'Round Table Pizza', kind: 'Fast Food', aliases: ['round table', 'round table pizza'] },

  // ---------- Restaurants (sit-down) ----------
  { name: "Denny's", kind: 'Restaurant', aliases: ['dennys', 'denny'] },
  { name: 'IHOP', kind: 'Restaurant', aliases: ['ihop', 'international house of pancakes'] },
  { name: 'Waffle House', kind: 'Restaurant', aliases: ['waffle house'] },
  { name: 'Cracker Barrel', kind: 'Restaurant', aliases: ['cracker barrel'] },
  { name: "Applebee's", kind: 'Restaurant', aliases: ['applebees', 'applebee'] },
  { name: "Chili's", kind: 'Restaurant', aliases: ['chilis', 'chili'] },
  { name: 'TGI Friday\u2019s', kind: 'Restaurant', aliases: ['tgi fridays', 'tgi friday', 'fridays'] },
  { name: 'Olive Garden', kind: 'Restaurant', aliases: ['olive garden'] },
  { name: 'Red Lobster', kind: 'Restaurant', aliases: ['red lobster'] },
  { name: 'Outback Steakhouse', kind: 'Restaurant', aliases: ['outback steakhouse', 'outback'] },
  { name: 'LongHorn Steakhouse', kind: 'Restaurant', aliases: ['longhorn steakhouse', 'longhorn'] },
  { name: 'Texas Roadhouse', kind: 'Restaurant', aliases: ['texas roadhouse'] },
  { name: 'Ruby Tuesday', kind: 'Restaurant', aliases: ['ruby tuesday'] },
  { name: 'Red Robin', kind: 'Restaurant', aliases: ['red robin'] },
  { name: 'Bob Evans', kind: 'Restaurant', aliases: ['bob evans'] },
  { name: 'Perkins', kind: 'Restaurant', aliases: ['perkins'] },
  { name: 'Golden Corral', kind: 'Restaurant', aliases: ['golden corral'] },
  { name: 'Sizzler', kind: 'Restaurant', aliases: ['sizzler'] },
  { name: 'The Cheesecake Factory', kind: 'Restaurant', aliases: ['cheesecake factory', 'cheesecake'] },
  { name: "P.F. Chang's", kind: 'Restaurant', aliases: ['pf changs', 'pf chang', 'p f changs'] },
  { name: 'Benihana', kind: 'Restaurant', aliases: ['benihana'] },
  { name: 'Bahama Breeze', kind: 'Restaurant', aliases: ['bahama breeze'] },
  { name: 'Yard House', kind: 'Restaurant', aliases: ['yard house'] },
  { name: 'Dave & Buster\u2019s', kind: 'Entertainment', aliases: ['dave and busters', 'dave busters'] },
  { name: 'On The Border', kind: 'Restaurant', aliases: ['on the border'] },
  { name: 'Noodles & Company', kind: 'Fast Food', aliases: ['noodles and company', 'noodles'] },
  { name: 'Sweetgreen', kind: 'Fast Food', aliases: ['sweetgreen'] },
  { name: 'Cava', kind: 'Fast Food', aliases: ['cava'] },
  { name: 'Boston Market', kind: 'Fast Food', aliases: ['boston market'] },
  { name: "Nando's", kind: 'Restaurant', aliases: ['nandos', 'nando'] },
  { name: 'Wagamama', kind: 'Restaurant', aliases: ['wagamama'] },
  { name: 'PizzaExpress', kind: 'Restaurant', aliases: ['pizzaexpress', 'pizza express'] },
  { name: 'Greggs', kind: 'Bakery', aliases: ['greggs'] },

  // ---------- Coffee / Bakery / Ice cream ----------
  { name: 'Starbucks', kind: 'Coffee', aliases: ['starbucks', 'starbucks coffee'] },
  { name: 'Dunkin\u2019', kind: 'Coffee', aliases: ['dunkin', 'dunkin donuts', 'dunkin donuts'] },
  { name: 'Peet\u2019s Coffee', kind: 'Coffee', aliases: ['peets', 'peets coffee'] },
  { name: 'Caribou Coffee', kind: 'Coffee', aliases: ['caribou', 'caribou coffee'] },
  { name: 'Tim Hortons', kind: 'Coffee', aliases: ['tim hortons', 'tim horton'] },
  { name: 'Dutch Bros', kind: 'Coffee', aliases: ['dutch bros', 'dutch bros coffee'] },
  { name: 'Scooter\u2019s Coffee', kind: 'Coffee', aliases: ['scooters coffee', 'scooters'] },
  { name: 'The Coffee Bean', kind: 'Coffee', aliases: ['coffee bean', 'coffee bean and tea leaf'] },
  { name: 'Costa Coffee', kind: 'Coffee', aliases: ['costa coffee', 'costa'] },
  { name: 'Caff\u00e8 Nero', kind: 'Coffee', aliases: ['caffe nero'] },
  { name: 'Pret A Manger', kind: 'Coffee', aliases: ['pret a manger', 'pret'] },
  { name: 'Krispy Kreme', kind: 'Bakery', aliases: ['krispy kreme'] },
  { name: 'Einstein Bros', kind: 'Bakery', aliases: ['einstein bros', 'einstein bagels'] },
  { name: 'Bruegger\u2019s', kind: 'Bakery', aliases: ['brueggers', 'bruegger'] },
  { name: 'Crumbl', kind: 'Bakery', aliases: ['crumbl', 'crumbl cookies'] },
  { name: 'Insomnia Cookies', kind: 'Bakery', aliases: ['insomnia cookies', 'insomnia'] },
  { name: "Auntie Anne's", kind: 'Bakery', aliases: ['auntie annes', 'auntie anne'] },
  { name: 'Cinnabon', kind: 'Bakery', aliases: ['cinnabon'] },
  { name: 'Baskin-Robbins', kind: 'Ice Cream', aliases: ['baskin robbins', 'baskin', 'br ice cream'] },
  { name: 'Cold Stone', kind: 'Ice Cream', aliases: ['cold stone', 'cold stone creamery'] },
  { name: 'Ben & Jerry\u2019s', kind: 'Ice Cream', aliases: ['ben and jerrys', 'ben jerrys'] },
  { name: 'H\u00e4agen-Dazs', kind: 'Ice Cream', aliases: ['haagen dazs', 'haagen daz'] },
  { name: 'Menchie\u2019s', kind: 'Ice Cream', aliases: ['menchies', 'menchie'] },
  { name: 'Yogurtland', kind: 'Ice Cream', aliases: ['yogurtland'] },
  { name: 'Pinkberry', kind: 'Ice Cream', aliases: ['pinkberry'] },
  { name: 'Sweet Frog', kind: 'Ice Cream', aliases: ['sweet frog', 'sweetfrog'] },

  // ---------- Electronics / Home / Clothing ----------
  { name: 'Best Buy', kind: 'Electronics', aliases: ['best buy', 'bestbuy'] },
  { name: 'Apple Store', kind: 'Electronics', aliases: ['apple store', 'apple retail'] },
  { name: 'Microsoft Store', kind: 'Electronics', aliases: ['microsoft store', 'microsoft'] },
  { name: 'Micro Center', kind: 'Electronics', aliases: ['micro center', 'microcenter'] },
  { name: 'B&H Photo', kind: 'Electronics', aliases: ['b and h', 'bh photo', 'b h photo'] },
  { name: 'Newegg', kind: 'Online', aliases: ['newegg'] },
  { name: 'GameStop', kind: 'Entertainment', aliases: ['gamestop', 'game stop'] },
  { name: 'Verizon', kind: 'Electronics', aliases: ['verizon', 'verizon wireless'] },
  { name: 'AT&T', kind: 'Electronics', aliases: ['at and t', 'att', 'at t'] },
  { name: 'T-Mobile', kind: 'Electronics', aliases: ['t mobile', 'tmobile'] },
  { name: 'Home Depot', kind: 'Home Improvement', aliases: ['home depot', 'homedepot', 'the home depot'] },
  { name: 'Lowe\u2019s', kind: 'Home Improvement', aliases: ['lowes', 'lowe'] },
  { name: 'Ace Hardware', kind: 'Home Improvement', aliases: ['ace hardware', 'ace'] },
  { name: 'True Value', kind: 'Home Improvement', aliases: ['true value'] },
  { name: 'Menards', kind: 'Home Improvement', aliases: ['menards', 'menard'] },
  { name: 'Harbor Freight', kind: 'Home Improvement', aliases: ['harbor freight'] },
  { name: 'Tractor Supply', kind: 'Home Improvement', aliases: ['tractor supply', 'tractor supply co'] },
  { name: 'IKEA', kind: 'Home Improvement', aliases: ['ikea'] },
  { name: 'Bed Bath & Beyond', kind: 'Department', aliases: ['bed bath and beyond', 'bed bath beyond'] },
  { name: 'Michaels', kind: 'Entertainment', aliases: ['michaels', 'michaels stores'] },
  { name: 'Hobby Lobby', kind: 'Entertainment', aliases: ['hobby lobby'] },
  { name: 'PetSmart', kind: 'Other', aliases: ['petsmart'] },
  { name: 'Petco', kind: 'Other', aliases: ['petco'] },
  { name: 'Bath & Body Works', kind: 'Clothing', aliases: ['bath and body works', 'bath body works'] },
  { name: 'Old Navy', kind: 'Clothing', aliases: ['old navy'] },
  { name: 'Gap', kind: 'Clothing', aliases: ['gap', 'gapkids', 'gap factory'] },
  { name: 'Banana Republic', kind: 'Clothing', aliases: ['banana republic'] },
  { name: 'H&M', kind: 'Clothing', aliases: ['h and m', 'h&m', 'hm'] },
  { name: 'Zara', kind: 'Clothing', aliases: ['zara'] },
  { name: 'Uniqlo', kind: 'Clothing', aliases: ['uniqlo'] },
  { name: 'Forever 21', kind: 'Clothing', aliases: ['forever 21', 'forever21'] },
  { name: 'American Eagle', kind: 'Clothing', aliases: ['american eagle', 'ae outfitters'] },
  { name: 'Hollister', kind: 'Clothing', aliases: ['hollister'] },
  { name: 'Abercrombie', kind: 'Clothing', aliases: ['abercrombie', 'abercrombie and fitch'] },
  { name: 'Aeropostale', kind: 'Clothing', aliases: ['aeropostale'] },
  { name: 'Express', kind: 'Clothing', aliases: ['express'] },
  { name: 'Victoria\u2019s Secret', kind: 'Clothing', aliases: ['victorias secret', 'victoria secret'] },
  { name: 'Foot Locker', kind: 'Clothing', aliases: ['foot locker', 'footlocker'] },
  { name: 'Famous Footwear', kind: 'Clothing', aliases: ['famous footwear'] },
  { name: 'DSW', kind: 'Clothing', aliases: ['dsw', 'designer shoe warehouse'] },
  { name: 'Nike', kind: 'Clothing', aliases: ['nike', 'nike factory', 'nike store'] },
  { name: 'Adidas', kind: 'Clothing', aliases: ['adidas'] },
  { name: 'Hibbett', kind: 'Clothing', aliases: ['hibbett', 'hibbett sports'] },
  { name: 'Dick\u2019s Sporting Goods', kind: 'Other', aliases: ['dicks sporting goods', 'dicks'] },
  { name: 'REI', kind: 'Other', aliases: ['rei', 'rei co op'] },
  { name: 'Barnes & Noble', kind: 'Entertainment', aliases: ['barnes and noble', 'barnes noble'] },

  // ---------- Online ----------
  { name: 'Amazon', kind: 'Online', aliases: ['amazon', 'amazon com', 'amzn', 'amazon prime'] },
  { name: 'eBay', kind: 'Online', aliases: ['ebay'] },
  { name: 'Etsy', kind: 'Online', aliases: ['etsy'] },
  { name: 'Temu', kind: 'Online', aliases: ['temu'] },
  { name: 'Shein', kind: 'Online', aliases: ['shein'] },
  { name: 'AliExpress', kind: 'Online', aliases: ['aliexpress', 'ali express'] },
  { name: 'Instacart', kind: 'Online', aliases: ['instacart'] },
  { name: 'DoorDash', kind: 'Online', aliases: ['doordash', 'door dash'] },
  { name: 'Uber Eats', kind: 'Online', aliases: ['uber eats', 'ubereats'] },
  { name: 'Grubhub', kind: 'Online', aliases: ['grubhub'] },
  { name: 'Postmates', kind: 'Online', aliases: ['postmates'] },
  { name: 'Uber', kind: 'Other', aliases: ['uber'] },
  { name: 'Lyft', kind: 'Other', aliases: ['lyft'] },

  // ---------- Entertainment ----------
  { name: 'AMC Theatres', kind: 'Entertainment', aliases: ['amc', 'amc theatres'] },
  { name: 'Regal Cinemas', kind: 'Entertainment', aliases: ['regal', 'regal cinemas'] },
  { name: 'Cinemark', kind: 'Entertainment', aliases: ['cinemark'] },
  { name: 'Cineplex', kind: 'Entertainment', aliases: ['cineplex'] },
  { name: 'Netflix', kind: 'Entertainment', aliases: ['netflix'] },
  { name: 'Spotify', kind: 'Entertainment', aliases: ['spotify'] },
  { name: 'Disney+', kind: 'Entertainment', aliases: ['disney plus', 'disney+'] },
  { name: 'HBO Max', kind: 'Entertainment', aliases: ['hbo max', 'hbo'] },
  { name: 'Hulu', kind: 'Entertainment', aliases: ['hulu'] },
  { name: 'Steam', kind: 'Entertainment', aliases: ['steam games', 'steam'] },
  { name: 'Topgolf', kind: 'Entertainment', aliases: ['topgolf'] },
  { name: 'Bowlero', kind: 'Entertainment', aliases: ['bowlero'] },
  { name: 'Chuck E. Cheese', kind: 'Entertainment', aliases: ['chuck e cheese', 'chuck e cheese s'] },
];

/** Item names that reveal a restaurant even when the header is unreadable. */
const FOOD_ITEM_RE =
  /\b(burger|fries|nuggets|whopper|big mac|mcnugget|meal|combo|wrap|burrito|taco|pizza|slice|sandwich|sub|salad|chicken bucket|wing|latte|espresso|cappuccino|frappuccino|mocha|smoothie|donut|doughnut|bagel|muffin|cookie|ice cream|sundae|blizzard|shake|milkshake|entree|appetizer|soda|soft drink)\b/i;

/** Words that are never part of a store name. */
const STORE_NOISE =
  /\b(#\s*\d+|\d{3,}|inc|llc|ltd|corp|company|co|the)\b/gi;

/** Lowercases and strips punctuation so spellings line up. */
function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

interface IndexEntry {
  def: StoreDef;
  key: string;
  alias: boolean;
}

let INDEX: IndexEntry[] | null = null;

function buildIndex(): IndexEntry[] {
  const entries: IndexEntry[] = [];
  for (const def of STORE_CATALOG) {
    entries.push({ def, key: norm(def.name), alias: false });
    for (const a of def.aliases ?? []) {
      const k = norm(a);
      if (k && k !== norm(def.name)) entries.push({ def, key: k, alias: true });
    }
  }
  // Longest keys first so "whole foods market" wins over "market".
  entries.sort((a, b) => b.key.length - a.key.length);
  return entries;
}

function index(): IndexEntry[] {
  if (!INDEX) INDEX = buildIndex();
  return INDEX;
}

export interface StoreMatch {
  /** Canonical name, or a cleaned-up version of the printed name. */
  name: string;
  kind: StoreKind;
  /** True when the store was found in the built-in catalog. */
  known: boolean;
}

function isFoodItems(items?: { name: string }[]): boolean {
  if (!items || items.length === 0) return false;
  const foodish = items.filter((i) => FOOD_ITEM_RE.test(i.name)).length;
  return foodish >= Math.max(2, Math.ceil(items.length * 0.5));
}

/**
 * Maps a printed merchant name to a canonical store. Falls back to a cleaned
 * version of the printed text when nothing in the catalog matches, and uses the
 * line items to spot restaurants whose header is unreadable.
 *
 * `custom` holds stores learned from previous receipts; those win over the
 * built-in catalog so a name you have seen before is always mapped the same way.
 */
export function recognizeStore(
  rawMerchant: string,
  items?: { name: string }[],
  custom: { from: string; name: string; kind: StoreKind }[] = [],
): StoreMatch {
  const raw = (rawMerchant || '').trim();
  const n = norm(raw);

  for (const c of custom) {
    const k = norm(c.from);
    if (k.length >= 3 && (k === n || new RegExp(`(^|\\s)${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`).test(n))) {
      return { name: c.name, kind: c.kind, known: true };
    }
  }

  if (n.length >= 3) {
    // Whole-string match first.
    for (const e of index()) {
      if (e.key === n) return { name: e.def.name, kind: e.def.kind, known: true };
    }
    // Then the longest alias contained in the printed name.
    for (const e of index()) {
      if (e.key.length < 3) continue;
      const re = new RegExp(`(^|\\s)${e.key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`);
      if (re.test(n)) return { name: e.def.name, kind: e.def.kind, known: true };
    }
  }

  // Unknown store: tidy the printed header into a display name.
  const cleaned = raw
    .replace(STORE_NOISE, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  const name = (cleaned.length >= 3 ? cleaned : raw || 'Unknown merchant')
    .replace(/\b\w/g, (c) => c.toUpperCase());

  let kind: StoreKind = 'Other';
  if (isFoodItems(items)) kind = 'Restaurant';
  return { name, kind, known: false };
}

/** The kind for a canonical store name, when it is in the catalog. */
export function storeKind(name: string): StoreKind {
  const n = norm(name);
  for (const e of index()) {
    if (e.key === n) return e.def.kind;
  }
  return 'Other';
}
