import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateContactDto } from './create-contact.dto';

export class UpdateContactDto extends PartialType(
  OmitType(CreateContactDto, ['openingBalanceSupplier', 'openingBalanceCustomer', 'role'] as const),
) {}
