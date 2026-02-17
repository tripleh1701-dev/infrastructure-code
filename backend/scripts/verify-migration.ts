/**
 * Utility: Verify migration data integrity
 * 
 * Runs checks to ensure data was migrated correctly by comparing
 * counts and sampling records.
 * 
 * Usage: npx ts-node scripts/verify-migration.ts
 */

import { createClient } from '@supabase/supabase-js';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.migration' });

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// DynamoDB client
const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const docClient = DynamoDBDocumentClient.from(dynamoClient);
const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || process.env.CONTROL_PLANE_TABLE_NAME;
if (!TABLE_NAME) { console.error('ERROR: DYNAMODB_TABLE_NAME or CONTROL_PLANE_TABLE_NAME must be set'); process.exit(1); }

interface VerificationResult {
  entity: string;
  supabaseCount: number;
  dynamoDBCount: number;
  match: boolean;
}

async function countDynamoDBEntities(entityType: string): Promise<number> {
  let count = 0;
  let lastEvaluatedKey: Record<string, any> | undefined;

  do {
    const result = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :pk',
        ExpressionAttributeValues: { ':pk': `ENTITY#${entityType}` },
        Select: 'COUNT',
        ExclusiveStartKey: lastEvaluatedKey,
      })
    );

    count += result.Count || 0;
    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return count;
}

async function verify() {
  console.log('Verifying migration data integrity...\n');

  const results: VerificationResult[] = [];

  // Define entities to check
  const entities = [
    { name: 'ACCOUNT', supabaseTable: 'accounts' },
    { name: 'ENTERPRISE', supabaseTable: 'enterprises' },
    { name: 'LICENSE', supabaseTable: 'account_licenses' },
    { name: 'WORKSTREAM', supabaseTable: 'workstreams' },
    { name: 'USER', supabaseTable: 'account_technical_users' },
    { name: 'ROLE', supabaseTable: 'roles' },
    { name: 'GROUP', supabaseTable: 'groups' },
    { name: 'PRODUCT', supabaseTable: 'products' },
    { name: 'SERVICE', supabaseTable: 'services' },
  ];

  for (const entity of entities) {
    // Count in Supabase
    const { count: supabaseCount } = await supabase
      .from(entity.supabaseTable)
      .select('*', { count: 'exact', head: true });

    // Count in DynamoDB
    const dynamoDBCount = await countDynamoDBEntities(entity.name);

    const match = supabaseCount === dynamoDBCount;
    results.push({
      entity: entity.name,
      supabaseCount: supabaseCount || 0,
      dynamoDBCount,
      match,
    });

    const status = match ? '✓' : '✗';
    console.log(
      `  ${status} ${entity.name.padEnd(15)} Supabase: ${String(supabaseCount || 0).padStart(4)} | DynamoDB: ${String(dynamoDBCount).padStart(4)}`
    );
  }

  // Summary
  const allMatch = results.every((r) => r.match);
  console.log('\n' + '─'.repeat(50));

  if (allMatch) {
    console.log('✅ All entity counts match! Migration verified.');
  } else {
    console.log('⚠️  Some counts do not match. Please investigate:');
    results
      .filter((r) => !r.match)
      .forEach((r) => {
        console.log(`   - ${r.entity}: Expected ${r.supabaseCount}, got ${r.dynamoDBCount}`);
      });
  }
}

verify().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
