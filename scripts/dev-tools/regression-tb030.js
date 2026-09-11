/**
 * Archived TB-030 end-to-end regression scenario (contacts, sales, ledger flows).
 * Relocated from repo root during Phase-1 dead-code cleanup (TASK-BRIEF-001).
 * WARNING: targets hardcoded BASE http://localhost:3001/api — retarget to a
 * disposable backend (temp DB, alt port) before use. Never run against production data.
 */
const BASE = 'http://localhost:3001/api';
const today = new Date().toISOString().slice(0,10);

async function req(method, path, body) {
  const url = BASE + path;
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  console.log(`\n>>> ${method} ${url}`);
  if (body !== undefined) console.log(`REQ BODY: ${JSON.stringify(body)}`);
  const res = await fetch(url, opts);
  const text = await res.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  console.log(`STATUS: ${res.status}`);
  console.log(`RES BODY: ${JSON.stringify(parsed, null, 2)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${path}: ${text}`);
  return parsed;
}

async function run() {
  console.log('=== TB-030 REGRESSION START ===');
  console.log(`BASE=${BASE} today=${today}`);

  // 1 CONTACTS
  console.log('\n===== 1. CONTACTS: create CUSTOMER =====');
  const cust = await req('POST', '/contacts', { name: 'Regression Customer', role: 'CUSTOMER', phone: '0555123456' });
  const custId = cust.id;
  const custAccountId = cust.accounts?.[0]?.id || (await req('GET', `/contacts/${custId}`)).accounts[0].id;
  const allContacts = await req('GET', '/contacts');
  console.log(`VERIFY customer in list: ${allContacts.some(c=>c.id===custId) ? 'PASS' : 'FAIL'}`);

  const supplier = await req('POST', '/contacts', { name: 'Regression Supplier', role: 'SUPPLIER' });
  const suppId = supplier.id;

  // Funding cash for purchases
  console.log('\n===== FUND CASH: owner-deposit 5000 =====');
  await req('POST', '/cash/owner-deposit', { amount: '5000.00', note: 'regression seed deposit' });

  // 2 INVENTORY
  console.log('\n===== 2. INVENTORY: create item + stock IN =====');
  const item = await req('POST', '/inventory/items', { name: 'Regression Widget', costPrice: '50.00', sellingPrice: '80.00', sku: 'REG-001', initialStock: 0 });
  const itemId = item.id;
  const movIn = await req('POST', '/inventory/movements', { itemId, type: 'IN', quantity: 10, note: 'initial stock' });
  const itemAfter = await req('GET', `/inventory/items/${itemId}`);
  console.log(`VERIFY stock movements exist: ${JSON.stringify(movIn)}`);
  const movements = await req('GET', `/inventory/movements/${itemId}`);
  console.log(`VERIFY movements count>=1: ${movements.length>=1 ? 'PASS' : 'FAIL'}`);

  // 3 SERVICES
  console.log('\n===== 3. SERVICES: create service =====');
  const svc = await req('POST', '/services', { name: 'Regression Repair Labor', supplierId: suppId, pricingType: 'FIXED', fixedProfit: '25.00' });
  const svcId = svc.id;
  const allSvcs = await req('GET', '/services');
  console.log(`VERIFY service in list: ${allSvcs.some(s=>s.id===svcId) ? 'PASS' : 'FAIL'}`);

  // 4 TRANSACTIONS SALE
  console.log('\n===== 4. TRANSACTIONS SALE =====');
  const sale = await req('POST', '/transactions/sale', {
    type: 'SALE',
    accountId: custAccountId,
    amount: '185.00',
    amountPaidNow: '100.00',
    note: 'sale with item+service',
    itemLines: [{ itemId, quantity: 2, unitPrice: '80.00' }],
    serviceLines: [{ serviceId: svcId, amount: '25.00' }]
  });
  console.log(`VERIFY invoiceNumber: ${sale.invoiceNumber ? 'PASS '+sale.invoiceNumber : 'FAIL missing'}`);
  const saleId = sale.id;
  const saleDetail = await req('GET', `/transactions/${saleId}`);
  // ledger
  const ledger = await req('GET', `/reports/accounts/${custAccountId}/ledger`);
  console.log(`VERIFY ledger entry for sale: ${ledger.length>=1 ? 'PASS' : 'FAIL'} count=${ledger.length}`);
  // cash IN
  const cashMovements1 = await req('GET', '/cash/movements?category=SALE_PAYMENT');
  console.log(`VERIFY cash IN SALE_PAYMENT exists: ${cashMovements1.some(m=>m.type==='IN' && m.amount==='100.00') ? 'PASS' : 'FAIL (check movements)'}`);
  console.log(`cash SALE_PAYMENT movements: ${JSON.stringify(cashMovements1.slice(0,3), null,2)}`);

  // 5 PURCHASE
  console.log('\n===== 5. TRANSACTIONS PURCHASE =====');
  // need supplier account id
  const suppDetail = await req('GET', `/contacts/${suppId}`);
  const suppAccountId = suppDetail.accounts[0].id;
  const purchase = await req('POST', '/transactions/purchase', {
    type: 'PURCHASE',
    accountId: suppAccountId,
    amount: '200.00',
    amountPaidNow: '200.00',
    note: 'purchase stock',
    itemLines: [{ itemId, quantity: 4, unitPrice: '50.00' }]
  });
  console.log(`VERIFY purchase invoice: ${purchase.invoiceNumber ? 'PASS' : 'FAIL'}`);
  const cashOut = await req('GET', '/cash/movements?category=PURCHASE_PAYMENT');
  console.log(`VERIFY cash OUT PURCHASE_PAYMENT: ${JSON.stringify(cashOut.slice(0,3), null,2)}`);
  const itemAfterPurchase = await req('GET', `/inventory/items/${itemId}`);
  console.log(`VERIFY item after purchase: ${JSON.stringify(itemAfterPurchase)}`);

  // 6 PAYMENT_IN / PAYMENT_OUT
  console.log('\n===== 6. PAYMENT_IN / PAYMENT_OUT =====');
  // customer has receivable from sale (amount 185 - 100 paid = 85 debt). Pay it
  const payIn = await req('POST', '/transactions/payment-in', { accountId: custAccountId, amount: '50.00', note: 'partial debt payment' });
  console.log(`VERIFY payment-in: ${JSON.stringify(payIn)}`);
  const ledger2 = await req('GET', `/reports/accounts/${custAccountId}/ledger`);
  console.log(`VERIFY ledger updated: count=${ledger2.length}`);
  // Need payable first: create purchase with debt
  const purchaseDebt = await req('POST', '/transactions/purchase', {
    type: 'PURCHASE',
    accountId: suppAccountId,
    amount: '100.00',
    amountPaidNow: '0.00',
    note: 'purchase with debt for PAYMENT_OUT test',
    itemLines: [{ itemId, quantity: 2, unitPrice: '50.00' }]
  });
  console.log(`Created purchase debt: ${purchaseDebt.id} amount 100 unpaid`);
  const payOut = await req('POST', '/transactions/payment-out', { accountId: suppAccountId, amount: '30.00', note: 'supplier payment' });
  console.log(`VERIFY payment-out: ${JSON.stringify(payOut)}`);

  // 7 CASH
  console.log('\n===== 7. CASH domain =====');
  const balanceBeforeDraw = await req('GET', '/cash/balance');
  console.log(`BALANCE before draw: ${JSON.stringify(balanceBeforeDraw)}`);
  const draw = await req('POST', '/cash/owner-draw', { amount: '100.00', note: 'owner draw test' });
  const balanceAfterDraw = await req('GET', '/cash/balance');
  console.log(`VERIFY draw decremented: before=${balanceBeforeDraw.currentBalance} after=${balanceAfterDraw.currentBalance} diff=${(parseFloat(balanceBeforeDraw.currentBalance)-parseFloat(balanceAfterDraw.currentBalance)).toFixed(2)}`);
  const deposit = await req('POST', '/cash/owner-deposit', { amount: '200.00', note: 'owner deposit test' });
  const balanceAfterDeposit = await req('GET', '/cash/balance');
  console.log(`VERIFY deposit incremented: afterDraw=${balanceAfterDraw.currentBalance} afterDeposit=${balanceAfterDeposit.currentBalance}`);
  const dailyClosing = await req('GET', `/cash/daily-closing?date=${today}`);
  console.log(`VERIFY daily closing: ${JSON.stringify(dailyClosing,null,2)}`);

  // 8 EXPENSES
  console.log('\n===== 8. EXPENSES =====');
  const newCat = await req('POST', '/expenses/categories', { name: 'Regression Cat' });
  const catId = newCat.id;
  const catsBefore = await req('GET', '/expenses/categories');
  console.log(`VERIFY category in list: ${catsBefore.some(c=>c.id===catId) ? 'PASS' : 'FAIL'}`);
  const balanceBeforeExpense = await req('GET', '/cash/balance');
  const expense = await req('POST', '/expenses', { categoryId: catId, amount: '75.00', description: 'regression expense' });
  console.log(`VERIFY expense created: ${JSON.stringify(expense)}`);
  const balanceAfterExpense = await req('GET', '/cash/balance');
  console.log(`VERIFY cash decremented by 75: before=${balanceBeforeExpense.currentBalance} after=${balanceAfterExpense.currentBalance}`);
  const breakdown = await req('GET', '/expenses/breakdown');
  console.log(`VERIFY breakdown includes new cat: ${JSON.stringify(breakdown,null,2)}`);

  // 9 REPAIR INTERNAL
  console.log('\n===== 9. REPAIR INTERNAL =====');
  const balanceBeforeRepairInt = await req('GET', '/cash/balance');
  const repairInt = await req('POST', '/repair', {
    contactId: custId,
    deviceType: 'PHONE',
    deviceBrand: 'Samsung',
    deviceModel: 'A55',
    problemDescription: 'screen crack internal',
    repairType: 'INTERNAL',
    technicianName: 'Tech Ali',
    estimatedCost: '300.00',
    depositAmount: '50.00',
    notes: 'internal ticket'
  });
  console.log(`VERIFY repair internal ticket: ${JSON.stringify(repairInt,null,2)}`);
  const cashAfterDeposit = await req('GET', '/cash/balance');
  console.log(`VERIFY cash IN deposit 50: before=${balanceBeforeRepairInt.currentBalance} after=${cashAfterDeposit.currentBalance}`);
  const repairIntId = repairInt.id;
  // deliver with actual > deposit
  const deliveredInt = await req('PATCH', `/repair/${repairIntId}/status`, { status: 'DELIVERED', actualCost: '250.00', notes: 'delivered' });
  console.log(`VERIFY delivered internal invoice: ${JSON.stringify(deliveredInt,null,2)}`);
  console.log(`VERIFY invoiceNumber format REP-XXXXXX: ${/^REP-\d{6}$/.test(deliveredInt.invoiceNumber) ? 'PASS' : 'FAIL '+deliveredInt.invoiceNumber}`);
  const cashAfterDeliver = await req('GET', '/cash/balance');
  console.log(`VERIFY cash IN remainder 200 (250-50): beforeDeliver=${cashAfterDeposit.currentBalance} after=${cashAfterDeliver.currentBalance}`);
  const profitResp = await req('GET', '/reports/profit');
  console.log(`VERIFY getNetProfit repairProfit: ${JSON.stringify(profitResp,null,2)}`);

  // 10 REPAIR EXTERNAL
  console.log('\n===== 10. REPAIR EXTERNAL =====');
  const repairExt = await req('POST', '/repair', {
    contactId: custId,
    deviceType: 'LAPTOP',
    deviceBrand: 'Dell',
    deviceModel: 'XPS13',
    problemDescription: 'board failure',
    repairType: 'EXTERNAL',
    estimatedCost: '500.00',
    depositAmount: '0.00'
  });
  const repairExtId = repairExt.id;
  console.log(`VERIFY external ticket: ${JSON.stringify(repairExt,null,2)}`);
  const balanceBeforeExtCost = await req('GET', '/cash/balance');
  const extCost = await req('POST', `/repair/${repairExtId}/external-cost`, { externalCost: '120.00', note: 'external part' });
  console.log(`VERIFY externalCost recorded: ${JSON.stringify(extCost,null,2)}`);
  const cashAfterExtCost = await req('GET', '/cash/balance');
  console.log(`VERIFY cash OUT 120: before=${balanceBeforeExtCost.currentBalance} after=${cashAfterExtCost.currentBalance}`);
  const cashOutExt = await req('GET', '/cash/movements?category=PURCHASE_PAYMENT');
  console.log(`VERIFY PURCHASE_PAYMENT for externalCost: ${JSON.stringify(cashOutExt.filter(m=>m.amount==='120.00').slice(0,2),null,2)}`);
  const deliveredExt = await req('PATCH', `/repair/${repairExtId}/status`, { status: 'DELIVERED', actualCost: '400.00' });
  console.log(`VERIFY delivered external: ${JSON.stringify(deliveredExt,null,2)}`);
  // profit should be 400-120=280 for this ticket, but cumulative includes previous internal 250 + 280 = 530
  const profitAfterExt = await req('GET', '/reports/profit');
  console.log(`VERIFY profit after external: ${JSON.stringify(profitAfterExt,null,2)}`);

  // 11 REPAIR CANCELLED
  console.log('\n===== 11. REPAIR CANCELLED =====');
  const repairCancel = await req('POST', '/repair', {
    contactId: custId,
    deviceType: 'TABLET',
    deviceBrand: 'iPad',
    deviceModel: 'Air',
    problemDescription: 'battery',
    repairType: 'INTERNAL',
    estimatedCost: '150.00',
    depositAmount: '40.00'
  });
  const repairCancelId = repairCancel.id;
  const balanceBeforeCancelDeposit = await req('GET', '/cash/balance');
  // deposit already posted 40; now cancel
  const balanceAfterCancelDeposit = await req('GET', '/cash/balance');
  const cancelled = await req('PATCH', `/repair/${repairCancelId}/status`, { status: 'CANCELLED' });
  console.log(`VERIFY cancelled: ${JSON.stringify(cancelled,null,2)}`);
  const balanceAfterCancel = await req('GET', '/cash/balance');
  console.log(`VERIFY cash OUT ADJUSTMENT 40: afterCancel=${balanceAfterCancel.currentBalance}`);
  const adjMovements = await req('GET', '/cash/movements?category=ADJUSTMENT');
  console.log(`VERIFY ADJUSTMENT movement 40 exists: ${JSON.stringify(adjMovements.filter(m=>m.amount==='40.00').slice(0,2),null,2)}`);

  // 12 REPORTS CAPITAL
  console.log('\n===== 12. REPORTS CAPITAL =====');
  const capital = await req('GET', '/reports/capital');
  console.log(`CAPITAL: ${JSON.stringify(capital,null,2)}`);
  const invVal = parseFloat(capital.inventoryValue);
  const recv = parseFloat(capital.totalReceivables);
  const cashInHand = parseFloat(capital.cashInHand);
  const pay = parseFloat(capital.totalPayables);
  const expectedNet = (invVal + recv + cashInHand - pay).toFixed(2);
  console.log(`VERIFY netCapital = inv(${invVal})+recv(${recv})+cash(${cashInHand})-pay(${pay}) = ${expectedNet} vs ${capital.netCapital} : ${expectedNet===capital.netCapital ? 'PASS' : 'FAIL'}`);

  // 13 REPORTS PROFIT
  console.log('\n===== 13. REPORTS PROFIT =====');
  const profit2 = await req('GET', '/reports/profit');
  console.log(`PROFIT: ${JSON.stringify(profit2,null,2)}`);
  const grossCalc = (parseFloat(profit2.serviceProfit)+parseFloat(profit2.itemProfit)+parseFloat(profit2.repairProfit)).toFixed(2);
  console.log(`VERIFY gross = service(${profit2.serviceProfit})+item(${profit2.itemProfit})+repair(${profit2.repairProfit})=${grossCalc} vs ${profit2.grossProfit} : ${grossCalc===profit2.grossProfit ? 'PASS' : 'FAIL'}`);

  // 14 DEBT SUMMARY
  console.log('\n===== 14. REPORTS DEBT SUMMARY =====');
  const debt = await req('GET', '/reports/debt-summary');
  console.log(`DEBT SUMMARY topDebtors: ${JSON.stringify(debt.topDebtors,null,2)}`);
  console.log(`DEBT SUMMARY topCreditors: ${JSON.stringify(debt.topCreditors,null,2)}`);
  const debtorBalances = debt.topDebtors.map(d=>parseFloat(d.currentBalance));
  const sortedDesc = [...debtorBalances].sort((a,b)=>b-a);
  console.log(`VERIFY debtors sorted desc: ${JSON.stringify(debtorBalances)} vs sorted ${JSON.stringify(sortedDesc)} : ${JSON.stringify(debtorBalances)===JSON.stringify(sortedDesc) ? 'PASS' : 'FAIL'}`);
  console.log(`VERIFY slice at 5: topDebtors.length=${debt.topDebtors.length} <=5 ? ${debt.topDebtors.length<=5?'PASS':'FAIL'}`);

  // 15 EXPENSE REPORT
  console.log('\n===== 15. REPORTS EXPENSE REPORT =====');
  const expReport = await req('GET', '/reports/expenses');
  console.log(`EXP REPORT: ${JSON.stringify(expReport,null,2)}`);
  const sumBreakdown = expReport.breakdown.reduce((acc,b)=>acc+parseFloat(b.totalAmount),0).toFixed(2);
  console.log(`VERIFY breakdown sum ${sumBreakdown} vs totalExpenses ${expReport.totalExpenses} : ${sumBreakdown===expReport.totalExpenses ? 'PASS' : 'FAIL'}`);

  // 16 SOFT DELETE
  console.log('\n===== 16. SOFT DELETE =====');
  const delContact = await req('DELETE', `/contacts/${custId}`);
  console.log(`DELETE contact resp: ${JSON.stringify(delContact,null,2)}`);
  const contactsAfterDelete = await req('GET', '/contacts');
  console.log(`VERIFY contact not in list after soft delete: ${contactsAfterDelete.some(c=>c.id===custId) ? 'FAIL still present' : 'PASS not present'}`);
  const delItem = await req('DELETE', `/inventory/items/${itemId}`);
  console.log(`DELETE item resp: ${JSON.stringify(delItem,null,2)}`);
  const itemsAfterDelete = await req('GET', '/inventory/items');
  console.log(`VERIFY item not in active list: ${itemsAfterDelete.some(i=>i.id===itemId) ? 'FAIL' : 'PASS'}`);
  const delCat = await req('DELETE', `/expenses/categories/${catId}`);
  console.log(`DELETE category resp: ${JSON.stringify(delCat,null,2)}`);
  const catsAfterDelete = await req('GET', '/expenses/categories');
  console.log(`VERIFY category not in active list: ${catsAfterDelete.some(c=>c.id===catId) ? 'FAIL' : 'PASS'}`);

  // SUMMARY
  console.log('\n===== SUMMARY =====');
  const summary = await req('GET', '/reports/summary');
  console.log(`SUMMARY: ${JSON.stringify(summary,null,2)}`);

  console.log('\n=== TB-030 REGRESSION COMPLETE — ALL DOMAINS EXECUTED ===');
}

run().catch(e=>{ console.error('REGRESSION FAILED:', e); process.exit(1); });
