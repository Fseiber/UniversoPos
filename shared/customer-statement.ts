export type AccountPurchase = {
  id: number;
  createdAt: string;
  status: string;
  total: string;
  creditAmount: string;
  quickAmount: string;
  surcharge: string;
  pendingName: string | null;
  voidReason: string | null;
  lines: {
    name: string;
    quantity: string;
    unit: string;
    unitPrice: string;
    total: string;
  }[];
  payments: { method: string; amount: string }[];
};
export type AccountEntry = {
  id: number;
  createdAt: string;
  kind: string;
  amount: string;
  balanceAfter: string;
  purchase: AccountPurchase | null;
};
export type CustomerStatement = {
  customer: {
    id: number;
    name: string;
    creditLimit: string;
    balance: string;
    available: string;
  };
  from: string | null;
  to: string | null;
  generatedAt: string;
  openingBalance: string;
  closingBalance: string;
  creditAdded: string;
  paymentsReceived: string;
  reversals: string;
  purchases: AccountPurchase[];
  movements: AccountEntry[];
};
