import Decimal from "decimal.js";
import { currency } from "./api";
type Credit = {
  creditUnlimited?: boolean;
  creditLimit: string | number;
  balance: string | number;
};
export const creditLimitText = (customer: Credit) =>
  customer.creditUnlimited ? "Sin límite" : currency(customer.creditLimit);
export const availableCreditText = (
  customer: Credit,
  balance: string | number = customer.balance,
) =>
  customer.creditUnlimited
    ? "Sin límite"
    : currency(new Decimal(customer.creditLimit).minus(balance).toString());
