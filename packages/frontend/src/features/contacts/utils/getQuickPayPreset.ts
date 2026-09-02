export type QuickPayContact = {
  accounts: Array<{ role: string; currentBalance: string }>;
};

export function getQuickPayPreset(contact: QuickPayContact): 'PAYMENT_IN' | 'PAYMENT_OUT' {
  const supplierAcc = contact.accounts.find((a) => a.role === 'SUPPLIER');
  const customerAcc = contact.accounts.find((a) => a.role === 'CUSTOMER');
  const supplierNonZero = supplierAcc ? Math.abs(Number(supplierAcc.currentBalance)) >= 0.005 : false;
  const customerNonZero = customerAcc ? Math.abs(Number(customerAcc.currentBalance)) >= 0.005 : false;
  if (customerNonZero && !supplierNonZero) return 'PAYMENT_IN';
  if (supplierNonZero && !customerNonZero) return 'PAYMENT_OUT';
  if (customerNonZero && supplierNonZero) return 'PAYMENT_IN';
  if (supplierNonZero) return 'PAYMENT_OUT';
  return 'PAYMENT_IN';
}
