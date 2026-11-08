/**
 * Shapes shared with the frontend. Kept in sync with src/types.ts by hand; the
 * server only needs the receipt/item subset plus the AI result shape.
 */

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

export interface ReceiptItem {
  id: string;
  name: string;
  price: number;
  qty: number;
  category: Category;
  code?: string;
}

export interface Receipt {
  id: string;
  merchant: string;
  date: string;
  currency: string;
  items: ReceiptItem[];
  subtotal?: number;
  tax?: number;
  total: number;
  savings?: number;
  imageThumb?: string;
  rawText?: string;
  notes?: string;
  createdAt: number;
}

export interface AiReadResult {
  merchant: string;
  date: string;
  currency: string | null;
  items: ReceiptItem[];
  subtotal?: number;
  tax?: number;
  total: number;
  savings?: number;
  rawText: string;
  warnings: string[];
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}
