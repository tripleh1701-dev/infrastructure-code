import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import { DynamoDBService } from '../common/dynamodb/dynamodb.service';

/**
 * License Enforcement Service
 *
 * Validates user creation against active license limits.
 *
 * Enforcement logic:
 *  1. Query all LICENSE# items for the account (PK: ACCOUNT#<id>)
 *  2. Filter to active licenses (endDate >= today)
 *  3. Sum the `numberOfUsers` across all active licenses → total allowed
 *  4. Count all active TECH_USER# items for the account → current count
 *  5. Reject creation if currentCount >= totalAllowed
 *
 * The aggregate model sums ALL active licenses for the account, so an
 * account with a 50-user "Global" license and a 20-user "Oracle" license
 * has a combined cap of 70 users.
 */

export interface LicenseCapacity {
  /** Sum of numberOfUsers across all active licenses */
  totalAllowed: number;
  /** Count of active users currently in the account */
  currentActiveUsers: number;
  /** Remaining seats available */
  remaining: number;
  /** Individual license breakdowns */
  licenses: Array<{
    licenseId: string;
    enterpriseId: string;
    productId: string;
    numberOfUsers: number;
    endDate: string;
  }>;
}

@Injectable()
export class LicenseEnforcementService {
  private readonly logger = new Logger(LicenseEnforcementService.name);

  constructor(private readonly dynamoDb: DynamoDBService) {}

  /**
   * Get the license capacity summary for an account
   */
  async getCapacity(accountId: string): Promise<LicenseCapacity> {
    const [activeLicenses, activeUserCount] = await Promise.all([
      this.getActiveLicenses(accountId),
      this.getActiveUserCount(accountId),
    ]);

    const totalAllowed = activeLicenses.reduce(
      (sum, lic) => sum + (lic.numberOfUsers || 0),
      0,
    );

    return {
      totalAllowed,
      currentActiveUsers: activeUserCount,
      remaining: Math.max(0, totalAllowed - activeUserCount),
      licenses: activeLicenses.map((lic) => ({
        licenseId: lic.id,
        enterpriseId: lic.enterpriseId,
        productId: lic.productId,
        numberOfUsers: lic.numberOfUsers,
        endDate: lic.endDate,
      })),
    };
  }

  /**
   * Validate that the account has capacity for a new user.
   * Throws ForbiddenException if the license limit is exceeded.
   *
   * @param accountId - Account UUID
   * @param requestedCount - Number of new users being created (default 1)
   */
  async validateUserCreation(
    accountId: string,
    requestedCount: number = 1,
  ): Promise<LicenseCapacity> {
    const capacity = await this.getCapacity(accountId);

    if (capacity.totalAllowed === 0) {
      this.logger.warn(
        `Account ${accountId} has no active licenses — user creation blocked`,
      );
      throw new ForbiddenException({
        message: 'No active licenses found for this account',
        code: 'LICENSE_NOT_FOUND',
        accountId,
      });
    }

    if (capacity.remaining < requestedCount) {
      this.logger.warn(
        `Account ${accountId} license limit reached: ` +
          `${capacity.currentActiveUsers}/${capacity.totalAllowed} users ` +
          `(requested: ${requestedCount})`,
      );
      throw new ForbiddenException({
        message:
          `License user limit exceeded. ` +
          `Active users: ${capacity.currentActiveUsers}, ` +
          `Licensed capacity: ${capacity.totalAllowed}, ` +
          `Requested: ${requestedCount}`,
        code: 'LICENSE_LIMIT_EXCEEDED',
        accountId,
        currentActiveUsers: capacity.currentActiveUsers,
        totalAllowed: capacity.totalAllowed,
        remaining: capacity.remaining,
        requested: requestedCount,
      });
    }

    this.logger.debug(
      `License check passed for account ${accountId}: ` +
        `${capacity.currentActiveUsers}/${capacity.totalAllowed} ` +
        `(+${requestedCount} requested, ${capacity.remaining} remaining)`,
    );

    return capacity;
  }

  /**
   * Query all active (non-expired) licenses for an account
   */
  private async getActiveLicenses(
    accountId: string,
  ): Promise<Array<Record<string, any>>> {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    const result = await this.dynamoDb.query({
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `ACCOUNT#${accountId}`,
        ':sk': 'LICENSE#',
      },
    });

    // Filter to active licenses (endDate >= today)
    return (result.Items || []).filter((item) => {
      const endDate = item.endDate;
      return endDate && endDate >= today;
    });
  }

  /**
   * Count active users (status = 'active') in an account.
   * Queries the TECH_USER# sort key prefix under the account partition.
   */
  private async getActiveUserCount(accountId: string): Promise<number> {
    const result = await this.dynamoDb.query({
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `ACCOUNT#${accountId}`,
        ':sk': 'TECH_USER#',
      },
      FilterExpression: '#status = :active',
      ExpressionAttributeNames: { '#status': 'status' },
    });

    // DynamoDB FilterExpression Count reflects post-filter count
    return result.Items?.length || 0;
  }
}
