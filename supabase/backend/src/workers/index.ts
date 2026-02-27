/**
 * Worker Lambda Index
 *
 * Re-exports all worker handlers for clean imports.
 * Each worker is deployed as a separate Lambda function
 * and orchestrated by AWS Step Functions.
 *
 * Workers:
 *  - dynamodb-provisioner: Creates/registers DynamoDB tables (create-infra-worker)
 *  - delete-infra:         Deletes account infrastructure (delete-infra-worker)
 *  - poll-infra:           Polls CloudFormation/SSM status (poll-infra-worker)
 *  - setup-rbac:           Configures groups, roles, permissions (setup-rbac-worker)
 *  - create-admin:         Creates admin Cognito user + DynamoDB record (create-admin-worker)
 *  - cognito-provisioner:  Provisions Cognito user identities (general-purpose)
 *  - ses-notification:     Sends credential emails via SES
 *  - provisioning-verifier: Validates provisioned resources
 *  - post-confirmation:    Cognito post-signup trigger
 */

export { handler as dynamodbProvisionerHandler } from './dynamodb-provisioner.handler';
export { handler as deleteInfraHandler } from './delete-infra.handler';
export { handler as pollInfraHandler } from './poll-infra.handler';
export { handler as setupRbacHandler } from './setup-rbac.handler';
export { handler as createAdminHandler } from './create-admin.handler';
export { handler as cognitoProvisionerHandler } from './cognito-provisioner.handler';
export { handler as sesNotificationHandler } from './ses-notification.handler';
export { handler as provisioningVerifierHandler } from './provisioning-verifier.handler';
export { handler as postConfirmationHandler } from './post-confirmation.handler';
