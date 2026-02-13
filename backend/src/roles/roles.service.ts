import { Injectable, NotFoundException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { DynamoDBService } from '../common/dynamodb/dynamodb.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

export interface Role {
  id: string;
  name: string;
  description?: string;
  permissions: number;
  accountId?: string;
  enterpriseId?: string;
  productId?: string;
  serviceId?: string;
  workstreamId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RolePermission {
  id: string;
  roleId: string;
  menuKey: string;
  menuLabel: string;
  isVisible: boolean;
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  tabs?: RolePermissionTab[];
}

export interface RolePermissionTab {
  key: string;
  label: string;
  isVisible: boolean;
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

@Injectable()
export class RolesService {
  constructor(private readonly dynamoDb: DynamoDBService) {}

  async findAll(): Promise<Role[]> {
    const result = await this.dynamoDb.queryByIndex(
      'GSI1',
      'GSI1PK = :pk',
      { ':pk': 'ENTITY#ROLE' },
    );

    return (result.Items || []).map(this.mapToRole);
  }

  async findOne(id: string): Promise<Role> {
    const result = await this.dynamoDb.get({
      Key: { PK: `ROLE#${id}`, SK: 'METADATA' },
    });

    if (!result.Item) {
      throw new NotFoundException(`Role with ID ${id} not found`);
    }

    return this.mapToRole(result.Item);
  }

  async create(dto: CreateRoleDto): Promise<Role> {
    const id = uuidv4();
    const now = new Date().toISOString();

    const role: Record<string, any> = {
      PK: `ROLE#${id}`,
      SK: 'METADATA',
      GSI1PK: 'ENTITY#ROLE',
      GSI1SK: `ROLE#${id}`,
      id,
      name: dto.name,
      description: dto.description,
      permissions: dto.permissions || 0,
      accountId: dto.accountId,
      enterpriseId: dto.enterpriseId,
      productId: dto.productId,
      serviceId: dto.serviceId,
      workstreamId: dto.workstreamId,
      createdAt: now,
      updatedAt: now,
    };

    await this.dynamoDb.put({ Item: role });

    return this.mapToRole(role);
  }

  async update(id: string, dto: UpdateRoleDto): Promise<Role> {
    const existing = await this.findOne(id);
    if (!existing) {
      throw new NotFoundException(`Role with ID ${id} not found`);
    }

    const now = new Date().toISOString();
    const updateExpressions: string[] = ['#updatedAt = :updatedAt'];
    const expressionAttributeNames: Record<string, string> = {
      '#updatedAt': 'updatedAt',
    };
    const expressionAttributeValues: Record<string, any> = {
      ':updatedAt': now,
    };

    const fields = ['name', 'description', 'permissions', 'accountId', 'enterpriseId', 'productId', 'serviceId', 'workstreamId'];
    
    for (const field of fields) {
      if ((dto as Record<string, any>)[field] !== undefined) {
        updateExpressions.push(`#${field} = :${field}`);
        expressionAttributeNames[`#${field}`] = field;
        expressionAttributeValues[`:${field}`] = (dto as Record<string, any>)[field];
      }
    }

    const result = await this.dynamoDb.update({
      Key: { PK: `ROLE#${id}`, SK: 'METADATA' },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW',
    });

    return this.mapToRole(result.Attributes!);
  }

  async remove(id: string): Promise<void> {
    const items = await this.dynamoDb.query({
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': `ROLE#${id}` },
    });

    if (!items.Items?.length) {
      throw new NotFoundException(`Role with ID ${id} not found`);
    }

    const deleteRequests = items.Items.map((item) => ({
      DeleteRequest: { Key: { PK: item.PK, SK: item.SK } },
    }));

    for (let i = 0; i < deleteRequests.length; i += 25) {
      await this.dynamoDb.batchWrite(deleteRequests.slice(i, i + 25));
    }
  }

  async getPermissions(roleId: string): Promise<RolePermission[]> {
    const result = await this.dynamoDb.query({
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `ROLE#${roleId}`,
        ':sk': 'PERMISSION#',
      },
    });

    return (result.Items || []).map(this.mapToPermission);
  }

  async updatePermissions(roleId: string, permissions: RolePermission[]): Promise<RolePermission[]> {
    // First, delete existing permissions
    const existing = await this.dynamoDb.query({
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `ROLE#${roleId}`,
        ':sk': 'PERMISSION#',
      },
    });

    if (existing.Items?.length) {
      const deleteRequests = existing.Items.map((item) => ({
        DeleteRequest: { Key: { PK: item.PK, SK: item.SK } },
      }));
      await this.dynamoDb.batchWrite(deleteRequests);
    }

    // Add new permissions
    const now = new Date().toISOString();
    const operations = permissions.map((perm) => ({
      Put: {
        Item: {
          PK: `ROLE#${roleId}`,
          SK: `PERMISSION#${perm.menuKey}`,
          id: perm.id || uuidv4(),
          roleId,
          menuKey: perm.menuKey,
          menuLabel: perm.menuLabel,
          isVisible: perm.isVisible ?? true,
          canView: perm.canView ?? true,
          canCreate: perm.canCreate ?? false,
          canEdit: perm.canEdit ?? false,
          canDelete: perm.canDelete ?? false,
          tabs: perm.tabs,
          createdAt: now,
          updatedAt: now,
        },
      },
    }));

    if (operations.length) {
      await this.dynamoDb.transactWrite(operations);
    }

    return this.getPermissions(roleId);
  }

  private mapToRole(item: Record<string, any>): Role {
    return {
      id: item.id,
      name: item.name,
      description: item.description,
      permissions: item.permissions,
      accountId: item.accountId,
      enterpriseId: item.enterpriseId,
      productId: item.productId,
      serviceId: item.serviceId,
      workstreamId: item.workstreamId,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }

  private mapToPermission(item: Record<string, any>): RolePermission {
    return {
      id: item.id,
      roleId: item.roleId,
      menuKey: item.menuKey,
      menuLabel: item.menuLabel,
      isVisible: item.isVisible,
      canView: item.canView,
      canCreate: item.canCreate,
      canEdit: item.canEdit,
      canDelete: item.canDelete,
      tabs: item.tabs,
    };
  }
}
