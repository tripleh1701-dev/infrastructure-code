import { Injectable, NotFoundException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { DynamoDBService } from '../common/dynamodb/dynamodb.service';
import { CreateProductDto } from './dto/create-product.dto';

export interface Product {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class ProductsService {
  constructor(private readonly dynamoDb: DynamoDBService) {}

  async findAll(): Promise<Product[]> {
    const result = await this.dynamoDb.queryByIndex(
      'GSI1',
      'GSI1PK = :pk',
      { ':pk': 'ENTITY#PRODUCT' },
    );

    return (result.Items || []).map(this.mapToProduct);
  }

  async findOne(id: string): Promise<Product> {
    const result = await this.dynamoDb.get({
      Key: { PK: `PRODUCT#${id}`, SK: 'METADATA' },
    });

    if (!result.Item) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }

    return this.mapToProduct(result.Item);
  }

  async create(dto: CreateProductDto): Promise<Product> {
    const id = uuidv4();
    const now = new Date().toISOString();

    const product: Record<string, any> = {
      PK: `PRODUCT#${id}`,
      SK: 'METADATA',
      GSI1PK: 'ENTITY#PRODUCT',
      GSI1SK: `PRODUCT#${id}`,
      id,
      name: dto.name,
      description: dto.description,
      createdAt: now,
      updatedAt: now,
    };

    await this.dynamoDb.put({ Item: product });

    return this.mapToProduct(product);
  }

  async update(id: string, dto: Partial<CreateProductDto>): Promise<Product> {
    await this.findOne(id);

    const now = new Date().toISOString();
    const updateExpressions: string[] = ['#updatedAt = :updatedAt'];
    const names: Record<string, string> = { '#updatedAt': 'updatedAt' };
    const values: Record<string, any> = { ':updatedAt': now };

    if (dto.name !== undefined) {
      updateExpressions.push('#name = :name');
      names['#name'] = 'name';
      values[':name'] = dto.name;
    }

    if (dto.description !== undefined) {
      updateExpressions.push('#description = :description');
      names['#description'] = 'description';
      values[':description'] = dto.description;
    }

    const result = await this.dynamoDb.update({
      Key: { PK: `PRODUCT#${id}`, SK: 'METADATA' },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ReturnValues: 'ALL_NEW',
    });

    return this.mapToProduct(result.Attributes!);
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.dynamoDb.delete({
      Key: { PK: `PRODUCT#${id}`, SK: 'METADATA' },
    });
  }

  private mapToProduct(item: Record<string, any>): Product {
    return {
      id: item.id,
      name: item.name,
      description: item.description,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt || item.createdAt,
    };
  }
}
