import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { BooleanQuery } from '../../../common/decorators/boolean-query.decorator';
import { NotificationType } from '../../../common/enums';
import { NotificationCategory } from '../notification-category';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

/**
 * `GET /notifications` filters, on top of pagination.
 *
 * Every filter the frontend sends must be declared here: the global
 * `ValidationPipe({ forbidNonWhitelisted: true })` rejects an undeclared query
 * param with a 400 rather than ignoring it.
 */
export class NotificationQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: NotificationCategory,
    description:
      'Coarse grouping the Notifications centre filters by; matches every type in the category',
  })
  @IsEnum(NotificationCategory)
  @IsOptional()
  category?: NotificationCategory;

  @ApiPropertyOptional({
    enum: NotificationType,
    description: 'Exact event type. Narrower than `category`.',
  })
  @IsEnum(NotificationType)
  @IsOptional()
  type?: NotificationType;

  @BooleanQuery(
    'Read state. Omit for both. The frontend models this as a boolean; the column stores `readAt`, so `false` means `readAt IS NULL`.',
  )
  read?: boolean;
}
