/**
 * DIRECTIVE-013 Stage 6.1 — quotation DTO (v3.0 repair foundation).
 *
 * Shape consumed by `RepairDomainService.quoteOrder`. Amounts are decimal
 * strings (Rule ③); negativity and emptiness are rejected by the service
 * with `InvalidRepairPricingError`.
 */
export interface QuoteRepairOrderDto {
  /** Technician labor price, e.g. "150.00". */
  laborPrice: string;
  /** Headline estimate communicated to the customer, e.g. "200.00". */
  estimatedCost: string;
}
