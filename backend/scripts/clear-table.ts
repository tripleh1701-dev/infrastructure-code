/**
 * Utility: Clear all data from DynamoDB table
 * 
 * WARNING: This will delete ALL data from the table!
 * Use with caution.
 * 
 * Usage: npx ts-node scripts/clear-table.ts
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import * as dotenv from 'dotenv';
import * as readline from 'readline';

// Load environment variables
dotenv.config({ path: '.env.migration' });

// DynamoDB client
const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const docClient = DynamoDBDocumentClient.from(dynamoClient);

const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || 'app_data';

async function promptConfirmation(): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(
      `\n⚠️  WARNING: This will DELETE ALL DATA from table "${TABLE_NAME}".\n` +
      `   Type "DELETE" to confirm: `,
      (answer) => {
        rl.close();
        resolve(answer === 'DELETE');
      }
    );
  });
}

async function clearTable() {
  console.log(`\nScanning table "${TABLE_NAME}"...`);

  let totalDeleted = 0;
  let lastEvaluatedKey: Record<string, any> | undefined;

  do {
    // Scan for items
    const scanResult = await docClient.send(
      new ScanCommand({
        TableName: TABLE_NAME,
        ProjectionExpression: 'PK, SK',
        ExclusiveStartKey: lastEvaluatedKey,
      })
    );

    const items = scanResult.Items || [];
    lastEvaluatedKey = scanResult.LastEvaluatedKey;

    if (items.length === 0) {
      break;
    }

    // Batch delete items (max 25 per batch)
    for (let i = 0; i < items.length; i += 25) {
      const batch = items.slice(i, i + 25);
      
      await docClient.send(
        new BatchWriteCommand({
          RequestItems: {
            [TABLE_NAME]: batch.map((item) => ({
              DeleteRequest: {
                Key: { PK: item.PK, SK: item.SK },
              },
            })),
          },
        })
      );

      totalDeleted += batch.length;
      process.stdout.write(`\r   Deleted ${totalDeleted} items...`);
    }
  } while (lastEvaluatedKey);

  console.log(`\n\n✅ Table cleared! Total items deleted: ${totalDeleted}`);
}

async function main() {
  const confirmed = await promptConfirmation();

  if (!confirmed) {
    console.log('\n❌ Operation cancelled.');
    process.exit(0);
  }

  await clearTable();
}

main().catch((err) => {
  console.error('\nError:', err);
  process.exit(1);
});
