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
