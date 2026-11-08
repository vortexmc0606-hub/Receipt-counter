import type { GeoLocation } from './lib/geo';

export type Category =
  | 'Groceries'
  | 'Dining'
  | 'Household'
  | 'Health'
  | 'Transport'
  | 'Electronics'
  | 'Clothing'
  | 'Entertainment'
  | 'Bills'
  | 'Other';

export const CATEGORIES: Category[] = [
  'Groceries',
  'Dining',
  'Household',
  'Health',
  'Transport',
  'Electronics',
  'Clothing',
  'Entertainment',
  'Bills',
  'Other',
];

export interface ReceiptItem {
  id: string;
  name: string;
  /** Line total (qty * unit price) unless the receipt prints a single figure. */
  price: number;
  qty: number;
  category: Category;
  /** Product/SKU code printed next to the item, when one is present. */
  code?: string;
}

export interface Receipt {
  id: string;
  merchant: string;
  /** ISO date, yyyy-MM-dd. */
  date: string;
  currency: string;
  items: ReceiptItem[];
  subtotal?: number;
  tax?: number;
  /** Tax rate in percent, when known (printed or learned for the store). */
  taxRate?: number;
  total: number;
  /** Amount the receipt reports as saved (informational only). */
  savings?: number;
  imageThumb?: string;
  rawText?: string;
  notes?: string;
  createdAt: number;
}

export interface Settings {
  currency: string;
  llmBaseUrl: string;
  llmApiKey: string;
  llmModel: string;
  /** Use a vision model to read receipts instead of on-device OCR. */
  aiReading: boolean;
  /** Vision model used for AI reading (e.g. a multimodal OpenRouter model). */
  visionModel: string;
  /** Clean up photos (shadow removal, deskew, crop, threshold) before reading. */
  enhanceScan: boolean;
  /**
   * Base URL of the Receipt Scanner backend. When set, receipt reading and the
   * assistant go through the server, which holds the API key — so no key is ever
   * exposed in this browser. Leave empty to run fully on-device.
   */
  apiBaseUrl: string;
  /** Push each saved receipt to the backend so it is available across devices. */
  backendSync: boolean;
  /**
   * Default tax rate in percent, used when a receipt shows no tax and the app
   * has not yet learned a rate for that store. Zero means "do not add tax".
   */
  defaultTaxRate: number;
  /**
   * When on, the app uses the device's location (or the address printed on the
   * receipt) to estimate the sales-tax rate when a receipt shows no tax.
   */
  smartLocation: boolean;
  /** The last location resolved for smart tax estimation, kept for reuse. */
  location: GeoLocation | null;
  theme: 'light' | 'dark';
}

export const DEFAULT_SETTINGS: Settings = {
  currency: '$',
  llmBaseUrl: '',
  llmApiKey: '',
  llmModel: 'gpt-4o-mini',
  aiReading: false,
  visionModel: 'openai/gpt-4o-mini',
  enhanceScan: true,
  apiBaseUrl: '',
  backendSync: false,
  defaultTaxRate: 0,
  smartLocation: false,
  location: null,
  theme: 'light',
};

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** Structured rows the assistant wants to render as a table. */
  table?: { columns: string[]; rows: (string | number)[][] };
  sources?: string[];
  createdAt: number;
}

/** A durable fact the assistant has been told to remember. */
export interface MemoryFact {
  id: string;
  text: string;
  createdAt: number;
}
