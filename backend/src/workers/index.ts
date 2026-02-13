/**
 * Worker Lambda Index
 *
 * Re-exports all worker handlers for clean imports.
 * Each worker is deployed as a separate Lambda function
 * and orchestrated by AWS Step Functions.
 *
 * Workers:
 *  - dynamodb-provisioner: Creates/registers DynamoDB tables
 *  - cognito-provisioner:  Provisions Cognito user identities
 *  - ses-notification:     Sends credential emails via SES
 *  - provisioning-verifier: Validates provisioned resources
 */

export { handler as dynamodbProvisionerHandler } from './dynamodb-provisioner.handler';
export { handler as cognitoProvisionerHandler } from './cognito-provisioner.handler';
export { handler as sesNotificationHandler } from './ses-notification.handler';
export { handler as provisioningVerifierHandler } from './provisioning-verifier.handler';
