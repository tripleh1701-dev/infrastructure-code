import { Injectable, NotFoundException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { DynamoDBService } from '../common/dynamodb/dynamodb.service';
import { CreateLicenseDto } from './dto/create-license.dto';
import { UpdateLicenseDto } from './dto/update-license.dto';

export interface License {
  id: string;
  accountId: string;
  enterpriseId: string;
  productId: string;
  serviceId: string;
  startDate: string;
  endDate: string;
  numberOfUsers: number;
  renewalNotify: boolean;
  noticeDays: number;
  contactFullName: string;
  contactEmail: string;
  contactPhone?: string;
  contactDepartment?: string;
  contactDesignation?: string;
  createdAt: string;
  updatedAt: string;
}

interface FindAllFilters {
  accountId?: string;
  enterpriseId?: string;
}

@Injectable()
export class LicensesService {
  constructor(private readonly dynamoDb: DynamoDBService) {}

  async findAll(filters: FindAllFilters = {}): Promise<License[]> {
    if (filters.accountId) {
      const result = await this.dynamoDb.query({
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': `ACCOUNT#${filters.accountId}`,
          ':sk': 'LICENSE#',
        },
      });

      let licenses = (result.Items || []).map(this.mapToLicense);

      if (filters.enterpriseId) {
        licenses = licenses.filter((l) => l.enterpriseId === filters.enterpriseId);
      }

      return licenses;
    }

    // If no account filter, scan all licenses
    const result = await this.dynamoDb.queryByIndex(
      'GSI1',
      'GSI1PK = :pk',
      { ':pk': 'ENTITY#LICENSE' },
    );

    let licenses = (result.Items || []).map(this.mapToLicense);

    if (filters.enterpriseId) {
      licenses = licenses.filter((l) => l.enterpriseId === filters.enterpriseId);
    }

    return licenses;
  }

  /**
   * Find licenses expiring within a given number of days.
   */
  async findExpiring(filters: {
    accountId?: string;
    enterpriseId?: string;
    days?: number;
  }): Promise<(License & { daysUntilExpiry: number })[]> {
    const allLicenses = await this.findAll({
      accountId: filters.accountId,
      enterpriseId: filters.enterpriseId,
    });

    const now = new Date();
    const windowMs = (filters.days || 30) * 24 * 60 * 60 * 1000;
    const cutoff = new Date(now.getTime() + windowMs);

    return allLicenses
      .filter((l) => {
        const endDate = new Date(l.endDate);
        return endDate > now && endDate <= cutoff;
      })
      .map((l) => ({
        ...l,
        daysUntilExpiry: Math.ceil(
          (new Date(l.endDate).getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
        ),
      }))
      .sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
  }

  /**
   * Returns unique products and services from licenses for a given account + enterprise.
   * Used by security/governance views to know which products/services are licensed.
   */
  async findLicensedEntities(filters: {
    accountId?: string;
    enterpriseId?: string;
  }): Promise<{ products: { id: string; name: string }[]; services: { id: string; name: string }[] }> {
    const licenses = await this.findAll({
      accountId: filters.accountId,
      enterpriseId: filters.enterpriseId,
    });

    // Collect unique product and service IDs
    const productIds = [...new Set(licenses.map((l) => l.productId).filter(Boolean))];
    const serviceIds = [...new Set(licenses.map((l) => l.serviceId).filter(Boolean))];

    // Resolve product names
    const products = await Promise.all(
      productIds.map(async (id) => {
        try {
          const result = await this.dynamoDb.get({
            Key: { PK: `PRODUCT#${id}`, SK: 'METADATA' },
          });
          return { id, name: result.Item?.name || 'Unknown' };
        } catch {
          return { id, name: 'Unknown' };
        }
      }),
    );

    // Resolve service names
    const services = await Promise.all(
      serviceIds.map(async (id) => {
        try {
          const result = await this.dynamoDb.get({
            Key: { PK: `SERVICE#${id}`, SK: 'METADATA' },
          });
          return { id, name: result.Item?.name || 'Unknown' };
        } catch {
          return { id, name: 'Unknown' };
        }
      }),
    );

    return { products, services };
  }

  async findOne(id: string): Promise<License> {
    // Need to query by GSI to find the license without knowing the account
    const result = await this.dynamoDb.queryByIndex(
      'GSI1',
      'GSI1PK = :pk AND GSI1SK = :sk',
      {
        ':pk': 'ENTITY#LICENSE',
        ':sk': `LICENSE#${id}`,
      },
    );

    if (!result.Items?.length) {
      throw new NotFoundException(`License with ID ${id} not found`);
    }

    return this.mapToLicense(result.Items[0]);
  }

  async create(dto: CreateLicenseDto): Promise<License> {
    const id = uuidv4();
    const now = new Date().toISOString();

    const license: Record<string, any> = {
      PK: `ACCOUNT#${dto.accountId}`,
      SK: `LICENSE#${id}`,
      GSI1PK: 'ENTITY#LICENSE',
      GSI1SK: `LICENSE#${id}`,
      GSI2PK: `ENTERPRISE#${dto.enterpriseId}`,
      GSI2SK: `LICENSE#${id}`,
      id,
      accountId: dto.accountId,
      enterpriseId: dto.enterpriseId,
      productId: dto.productId,
      serviceId: dto.serviceId,
      startDate: dto.startDate,
      endDate: dto.endDate,
      numberOfUsers: dto.numberOfUsers || 1,
      renewalNotify: dto.renewalNotify ?? true,
      noticeDays: dto.noticeDays || 30,
      contactFullName: dto.contactFullName,
      contactEmail: dto.contactEmail,
      contactPhone: dto.contactPhone,
      contactDepartment: dto.contactDepartment,
      contactDesignation: dto.contactDesignation,
      createdAt: now,
      updatedAt: now,
    };

    await this.dynamoDb.put({ Item: license });

    return this.mapToLicense(license);
  }

  async update(id: string, dto: UpdateLicenseDto): Promise<License> {
    const existing = await this.findOne(id);
    if (!existing) {
      throw new NotFoundException(`License with ID ${id} not found`);
    }

    const now = new Date().toISOString();
    const updateExpressions: string[] = ['#updatedAt = :updatedAt'];
    const expressionAttributeNames: Record<string, string> = {
      '#updatedAt': 'updatedAt',
    };
    const expressionAttributeValues: Record<string, any> = {
      ':updatedAt': now,
    };

    const fields = [
      'productId', 'serviceId', 'startDate', 'endDate', 'numberOfUsers',
      'renewalNotify', 'noticeDays', 'contactFullName', 'contactEmail',
      'contactPhone', 'contactDepartment', 'contactDesignation',
    ];

    for (const field of fields) {
      if ((dto as Record<string, any>)[field] !== undefined) {
        updateExpressions.push(`#${field} = :${field}`);
        expressionAttributeNames[`#${field}`] = field;
        expressionAttributeValues[`:${field}`] = (dto as Record<string, any>)[field];
      }
    }

    const result = await this.dynamoDb.update({
      Key: { PK: `ACCOUNT#${existing.accountId}`, SK: `LICENSE#${id}` },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW',
    });

    return this.mapToLicense(result.Attributes!);
  }

  async remove(id: string): Promise<void> {
    const existing = await this.findOne(id);
    if (!existing) {
      throw new NotFoundException(`License with ID ${id} not found`);
    }

    await this.dynamoDb.delete({
      Key: { PK: `ACCOUNT#${existing.accountId}`, SK: `LICENSE#${id}` },
    });
  }

  private mapToLicense(item: Record<string, any>): License {
    return {
      id: item.id,
      accountId: item.accountId,
      enterpriseId: item.enterpriseId,
      productId: item.productId,
      serviceId: item.serviceId,
      startDate: item.startDate,
      endDate: item.endDate,
      numberOfUsers: item.numberOfUsers,
      renewalNotify: item.renewalNotify,
      noticeDays: item.noticeDays,
      contactFullName: item.contactFullName,
      contactEmail: item.contactEmail,
      contactPhone: item.contactPhone,
      contactDepartment: item.contactDepartment,
      contactDesignation: item.contactDesignation,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }
}
