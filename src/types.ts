export type Category =
  | 'Groceries'
  | 'Dining'
  | 'Household'
  | 'Health'
  | 'Transport'
  | 'Electronics'
  | 'Clothing'
  | 'Entertainment'
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
  'Other',
];

export interface ReceiptItem {
  id: string;
  name: string;
  /** Line total (qty * unit price) unless the receipt prints a single figure. */
  price: number;
  qty: number;
  category: Category;
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
  theme: 'light' | 'dark';
}

export const DEFAULT_SETTINGS: Settings = {
  currency: '$',
  llmBaseUrl: '',
  llmApiKey: '',
  llmModel: 'gpt-4o-mini',
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
