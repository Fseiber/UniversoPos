import { createContext, useContext } from "react";
import type { Customer, Employee, Product, Shift } from "./api";
export type Context = {
  employee: Employee;
  products: Product[];
  customers: Customer[];
  shift: Shift | null;
  stockSettings: { stockEnabled: boolean; version: number };
  refresh: () => Promise<void>;
  task: (fn: () => Promise<void>) => Promise<void>;
  notify: (text: string) => void;
  busy: boolean;
  version: number;
  error: string;
  clearError: () => void;
};
export const PosContext = createContext<Context>(null!);
export const usePos = () => useContext(PosContext);
