import type { Category } from '../types';
import { kindCategoryPriors, recognizeStore } from './stores';

/**
 * A weighted, explainable item classifier.
 *
 * Receipt item names are terse and noisy ("GV WHT BRD", "TIDE LIQ 92OZ"), so a
 * plain first-match keyword list is fragile. This scores every category against
 * the name using several independent signals — specific words, brand names,
 * pack/unit hints and fuzzy fragments — and picks the strongest. A store hint
 * breaks ties (produce bought at a grocery store is more likely Groceries).
 */

/** Strong, unambiguous words. Each hit adds a lot of confidence. */
const STRONG: Partial<Record<Category, string[]>> = {
  Groceries: [
    'milk','bread','egg','eggs','cheese','yogurt','yoghurt','butter','cream','produce','banana','apple','orange','tomato','onion','potato','garlic','ginger','spinach','lettuce','carrot','cucumber','pepper','mushroom','broccoli','rice','basmati','pasta','penne','spaghetti','noodle','flour','atta','sugar','salt','oil','ghee','dal','lentil','beans','chickpea','cereal','oat','granola','juice','soda','cola','water','tea','coffee','chicken','beef','pork','mutton','fish','shrimp','prawn','turkey','bacon','sausage','ham','tortilla','pita','bagel','muffin','donut','cookie','biscuit','cracker','chips','crisps','chocolate','candy','honey','jam','jelly','peanut','almond','cashew','raisin','date','spice','masala','curry','sauce','ketchup','mayo','vinegar','pickle','frozen','ice cream','paneer','tofu','soy','lentils','corn','peas','cabbage','cauliflower','celery','avocado','berry','grape','mango','lemon','lime','coconut','nut','snack','yogurt','sour cream','cheddar','mozzarella','parmesan',
  ],
  Dining: [
    'burger','pizza','sandwich','sub ','wrap','salad','fries','sushi','taco','burrito','meal','combo','entree','appetizer','dessert','latte','cappuccino','espresso','macchiato','mocha','smoothie','frappuccino','beer','wine','cocktail','whiskey','vodka','restaurant','cafe','coffee shop','bakery','deli','bar ','grill','kitchen','bistro','diner',
  ],
  Household: [
    'detergent','laundry','soap','shampoo','conditioner','body wash','hand wash','tissue','paper towel','toilet paper','napkin','toothpaste','toothbrush','mouthwash','deodorant','razor','shaving','cleaner','cleaning','bleach','disinfectant','sponge','scrub','trash bag','garbage bag','dish soap','dishwash','dishwasher','air freshener','candle','battery','light bulb','foil','cling film','zip bag','storage bag','broom','mop','duster','detergent','fabric softener','dryer sheet','diaper','diapers','wipes','tide','gainer','clorox','lysol','palmolive','dawn','bounty','charmin','scott','kleenex','glad','hefty','drano','febreze','swiffer','cottonelle','all free','persil','arm & hammer','purex','snuggle','downy','ajax','comet','windex','pledge','pine sol','mr clean','scrubbing bubbles','method','seventh generation','huggies','pampers','luvs','kotex','always','tampax',
  ],
  Health: [
    'medicine','tablet','capsule','syrup','vitamin','supplement','bandage','band-aid','gauze','mask','sanitizer','hand sanitizer','pain relief','aspirin','ibuprofen','acetaminophen','tylenol','advil','aleve','motrin','naproxen','antacid','tums','pepto','cough','cold','allergy','claritin','zyrtec','benadryl','flonase','ointment','cream','lotion','sunscreen','thermometer','first aid','pharmacy','prescription','dental','floss','contact lens','condom','prenatal','probiotic','omega','calcium','zinc','melatonin','thermacare','neosporin','hydrocortisone','benadryl','dayquil','nyquil','robitussin','mucinex',
  ],
  Transport: [
    'fuel','gasoline','petrol','diesel','unleaded','octane','toll','parking','fare','metro','subway ticket','bus ticket','train ticket','taxi','uber','lyft','ride','gas station','chevron','shell','exxon','mobil','bp ','sunoco','valero','citgo','speedway','wawa fuel','quiktrip','racetrac','circle k','76','arco','marathon',
  ],
  Electronics: [
    'charger','charging','cable','usb','hdmi','adapter','battery pack','power bank','headphone','earbud','earphone','airpod','speaker','soundbar','laptop','notebook pc','tablet pc','ipad','phone case','screen protector','mouse','keyboard','monitor','display','webcam','router','modem','hard drive','ssd','flash drive','memory card','printer','ink cartridge','toner','tv','television','console','controller','smartwatch','drone','camera','lens','tripod','microphone','gopro','ring','alexa','echo dot','chromecast','roku','fire stick','anker','belkin','logitech','sandisk','seagate','western digital','kingston','corsair','razer','jbl','bose','sony','samsung','apple','google nest',
  ],
  Clothing: [
    'shirt','tshirt','t-shirt','polo','blouse','jeans','pants','trousers','shorts','dress','skirt','sweater','hoodie','jacket','coat','blazer','suit','tie','scarf','glove','sock','socks','hat','cap','beanie','shoe','shoes','sneaker','sneakers','boot','boots','sandal','slipper','heel','clothing','apparel','underwear','bra','panties','boxer','brief','leggings','tights','pajama','robe','swimsuit','bikini','belt','wallet','purse','handbag','backpack','nike','adidas','puma','levi','gap','h&m','zara','uniqlo','old navy','hanes','fruit of the loom','calvin klein','tommy','ralph lauren','under armour','reebok','new balance','skechers','vans','converse','north face','columbia','patagonia',
  ],
  Entertainment: [
    'movie','cinema','theater','theatre','ticket','concert','museum','zoo','park admission','netflix','spotify','hulu','disney+','hbo','subscription','streaming','game','video game','playstation','xbox','nintendo','steam','board game','puzzle','toy','lego','doll','action figure','book','novel','magazine','newspaper','dvd','blu-ray','vinyl','guitar','instrument','craft','art supply','bowling','arcade','amusement','festival','event',
  ],
  Bills: [
    'electric','electricity','utility','utilities','water bill','gas bill','internet','broadband','wifi','phone bill','mobile bill','cell phone','cable bill','insurance','premium','rent','mortgage','hoa','tax payment','property tax','service charge','monthly fee','annual fee','membership fee','phone service','verizon','at&t','t-mobile','comcast','xfinity','spectrum','centurylink',
  ],
};

/** Brand names map straight to a category, which is very reliable. */
const BRANDS: Partial<Record<Category, string[]>> = {
  Groceries: ['kraft','heinz','kellogg','general mills','nestle','pepsi','coca-cola','coke','frito','lay','doritos','pringles','oreo','nabisco','quaker','dannon','yoplait','chobani','sabra','land o lakes','philadelphia','sargento','tillamook','horizon','organic valley','silk','almond breeze','ocean spray','welch','minute maid','tropicana','gatorade','snapple','lipton','folgers','maxwell','starbucks','dunkin','smucker','jif','skippy','nutella','barilla','ragu','prego','campbell','progresso','swanson','hormel','oscar mayer','tyson','perdue','mccain','birds eye','green giant','del monte','dole','fresh express','lactaid','kikkoman','sriracha','cholula','tabasco'],
  Household: ['tide','gain','cheer','arm & hammer','clorox','lysol','palmolive','dawn','cascade','finish','bounty','charmin','scott','kleenex','puffs','glad','hefty','ziploc','saran','reynolds','drano','febreze','swiffer','mr clean','pine-sol','windex','pledge','downy','snuggle','persil','purex','all','huggies','pampers','luvs','cottonelle','angel soft','method','seventh generation','oxiclean','shout','resolve','rescue','terro','raid','off','cutter','air wick','glade','yankee candle','duracell','energizer','rayovac'],
  Health: ['tylenol','advil','motrin','aleve','bayer','excedrin','advil','benadryl','zyrtec','claritin','allegra','flonase','nasacort','dayquil','nyquil','mucinex','robitussin','delsym','tums','pepto-bismol','mylanta','gas-x','imodium','dulcolax','colace','metamucil','benefiber','centrum','one a day','nature made','nature\'s bounty','garden of life','optimum nutrition','thermacare','neosporin','band-aid','curad','johnson & johnson','cvs','walgreens','rite aid'],
  Electronics: ['apple','samsung','sony','lg','panasonic','philips','anker','belkin','logitech','sandisk','seagate','western digital','kingston','corsair','razer','jbl','bose','beats','sennheiser','garmin','fitbit','gopro','ring','nest','amazon','google','microsoft','hp','dell','lenovo','asus','acer','toshiba','canon','nikon','epson','brother'],
  Clothing: ['nike','adidas','puma','reebok','new balance','skechers','vans','converse','under armour','the north face','columbia','patagonia','levi','wrangler','lee','gap','old navy','h&m','zara','uniqlo','hanes','fruit of the loom','calvin klein','tommy hilfiger','ralph lauren','dockers','carhartt','dickies','timberland','merrell','clarks','crocs'],
  Transport: ['chevron','shell','exxon','mobil','bp','sunoco','valero','citgo','speedway','racetrac','quiktrip','circle k','wawa','arco','marathon','phillips 66','conoco','76'],
};

/** Pack/unit and form hints that nudge certain categories. */
const HINTS: [RegExp, Category, number][] = [
  [/\b\d+\s?(ml|l|fl\s?oz|oz|gal|liter|litre)\b/i, 'Groceries', 1],
  [/\b\d+\s?(lb|lbs|kg|g|gram|pound)\b/i, 'Groceries', 1],
  [/\b(organic|fresh|frozen|chilled|produce)\b/i, 'Groceries', 2],
  [/\b(liquid|detergent|softener|bleach|disinfect)\b/i, 'Household', 3],
  [/\b(capsule|tablet|softgel|syrup|ointment|suppositor)\b/i, 'Health', 3],
  [/\b(refill|pack|ct|count|rolls?|sheets?)\b/i, 'Household', 0.5],
  [/\b(recharge|prepaid|top\s?up|plan)\b/i, 'Bills', 2],
  [/\b(shirt|tee|trouser|jean|dress|size\s+[xsml]+)\b/i, 'Clothing', 2],
];

const ALL: Category[] = [
  'Groceries','Dining','Transport','Household','Health','Electronics','Clothing','Entertainment','Bills','Other',
];

/**
 * Automotive and other goods that share a word with a category ("motor oil",
 * "engine oil") but are not groceries. When one of these appears, the item is
 * kept out of that category.
 */
const AUTO_EXCLUDE = /\b(motor\s+oil|engine\s+oil|5w-?30|10w-?30|0w-?20|antifreeze|coolant|windshield|wiper|brake\s+fluid|spark\s+plug|oil\s+filter|air\s+filter|transmission|motor\s+fl|diesel\s+exhaust)\b/i;

/** Categories a store type makes more likely, used only to break near-ties. */
function storePriors(store?: string): Partial<Record<Category, number>> {
  const s = (store || '').toLowerCase();
  const kind = s ? recognizeStore(store || '').kind : 'Other';
  const priors: Partial<Record<Category, number>> = {
    ...(kindCategoryPriors(kind) ?? {}),
  };

  // Belt-and-braces name hints for stores not in the catalog.
  if (/grocer|market|bazaar|supermarket|foods?|mart|costco|walmart|kroger|safeway|aldi|lidl|trader|whole foods|publix|sprouts|h-?e-?b|albertsons|wegmans|target/.test(s)) {
    priors.Groceries = Math.max(priors.Groceries ?? 0, 2);
    priors.Household = Math.max(priors.Household ?? 0, 1.5);
  }
  if (/pharmacy|drug|rx|cvs|walgreens|rite aid/.test(s)) priors.Health = Math.max(priors.Health ?? 0, 3);
  if (/restaurant|cafe|café|grill|kitchen|diner|bistro|pizza|bar\b|coffee/.test(s)) priors.Dining = Math.max(priors.Dining ?? 0, 4);
  if (/gas|fuel|petrol|shell|chevron|exxon|speedway|quiktrip|wawa|circle k/.test(s)) priors.Transport = Math.max(priors.Transport ?? 0, 3);
  if (/best buy|apple store|micro center|electronics|radio ?shack/.test(s)) priors.Electronics = Math.max(priors.Electronics ?? 0, 3);
  if (/macy|kohl|nordstrom|tj ?maxx|marshalls|ross|old navy|gap|h&m|zara|uniqlo|dillard/.test(s)) priors.Clothing = Math.max(priors.Clothing ?? 0, 3);

  return priors;
}

function countHits(haystack: string, needles: string[]): number {
  let n = 0;
  for (const w of needles) {
    if (w.length <= 3) {
      // Short tokens must match on a word boundary to avoid false positives.
      if (new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(haystack)) n++;
    } else if (haystack.includes(w)) {
      n++;
    }
  }
  return n;
}

export interface CategorizeOptions {
  /** Merchant name, used as a weak prior. */
  store?: string;
  /** Category the user picked last time for this exact item. */
  learned?: Category;
}

/**
 * Chooses the most likely category for an item name. A user-taught category
 * always wins; otherwise the category with the highest weighted score is
 * returned, falling back to "Other".
 */
export function categorize(name: string, options: CategorizeOptions = {}): Category {
  if (options.learned) return options.learned;
  const hay = ` ${name.toLowerCase()} `;
  const auto = AUTO_EXCLUDE.test(name);
  const scores = new Map<Category, number>();
  const add = (c: Category, v: number) => scores.set(c, (scores.get(c) || 0) + v);

  for (const c of ALL) {
    const strong = STRONG[c];
    if (strong) add(c, countHits(hay, strong) * 3);
    const brands = BRANDS[c];
    if (brands) add(c, countHits(hay, brands) * 4);
  }
  for (const [re, c, w] of HINTS) {
    if (re.test(name)) add(c, w);
  }
  const priors = storePriors(options.store);
  for (const c of ALL) {
    if (priors[c]) add(c, priors[c] as number);
  }
  // A shared word such as "oil" in "motor oil" should not imply groceries.
  if (auto) scores.set('Groceries', 0);

  let best: Category = 'Other';
  let bestScore = 0;
  for (const c of ALL) {
    if (c === 'Other') continue;
    const s = scores.get(c) || 0;
    if (s > bestScore) {
      bestScore = s;
      best = c;
    }
  }
  return bestScore > 0 ? best : 'Other';
}
