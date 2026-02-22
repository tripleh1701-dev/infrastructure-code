/**
 * Inline CloudFormation template for private-account DynamoDB provisioning.
 * Eliminates the need to read from the filesystem at runtime, which fails
 * in Lambda because the relative path to the YAML file doesn't resolve.
 *
 * This MUST be kept in sync with backend/cloudformation/private-account-dynamodb.yaml
 */
export const PRIVATE_ACCOUNT_DYNAMODB_TEMPLATE = `AWSTemplateFormatVersion: '2010-09-09'
Description: >
  Dedicated DynamoDB table for private-cloud tenant accounts.
  Invoked at runtime by the DynamoDB Provisioner worker Lambda
  when an account with cloudType=private is created.

Parameters:
  AccountId:
    Type: String
    Description: Unique account identifier
  AccountName:
    Type: String
    Description: Human-readable account name
  Environment:
    Type: String
    Default: dev
    AllowedValues: [dev, staging, prod]
  ProjectName:
    Type: String
    Default: app
  BillingMode:
    Type: String
    Default: PAY_PER_REQUEST
    AllowedValues: [PAY_PER_REQUEST, PROVISIONED]
  ReadCapacity:
    Type: Number
    Default: 5
    Description: Read capacity units (only used when BillingMode is PROVISIONED)
  WriteCapacity:
    Type: Number
    Default: 5
    Description: Write capacity units (only used when BillingMode is PROVISIONED)
  EnablePointInTimeRecovery:
    Type: String
    Default: 'true'
    AllowedValues: ['true', 'false']
    Description: Enable point-in-time recovery for the DynamoDB table
  EnableDeletionProtection:
    Type: String
    Default: 'true'
    AllowedValues: ['true', 'false']
    Description: Enable deletion protection for the DynamoDB table
  EnableAutoScaling:
    Type: String
    Default: 'false'
    AllowedValues: ['true', 'false']
    Description: Enable auto-scaling (reserved for future use)

Conditions:
  IsProvisioned: !Equals [!Ref BillingMode, PROVISIONED]
  PITREnabled: !Equals [!Ref EnablePointInTimeRecovery, 'true']
  DeletionProtected: !Equals [!Ref EnableDeletionProtection, 'true']

Resources:
  AccountTable:
    Type: AWS::DynamoDB::Table
    DeletionPolicy: Retain
    UpdateReplacePolicy: Retain
    Properties:
      TableName: !Sub '\${ProjectName}-\${Environment}-\${AccountId}'
      BillingMode: !Ref BillingMode
      DeletionProtectionEnabled: !If [DeletionProtected, true, false]
      ProvisionedThroughput: !If
        - IsProvisioned
        - ReadCapacityUnits: !Ref ReadCapacity
          WriteCapacityUnits: !Ref WriteCapacity
        - !Ref AWS::NoValue
      PointInTimeRecoverySpecification:
        PointInTimeRecoveryEnabled: !If [PITREnabled, true, false]
      SSESpecification:
        SSEEnabled: true
      AttributeDefinitions:
        - AttributeName: PK
          AttributeType: S
        - AttributeName: SK
          AttributeType: S
        - AttributeName: GSI1PK
          AttributeType: S
        - AttributeName: GSI1SK
          AttributeType: S
        - AttributeName: entityType
          AttributeType: S
      KeySchema:
        - AttributeName: PK
          KeyType: HASH
        - AttributeName: SK
          KeyType: RANGE
      GlobalSecondaryIndexes:
        - IndexName: GSI1
          KeySchema:
            - AttributeName: GSI1PK
              KeyType: HASH
            - AttributeName: GSI1SK
              KeyType: RANGE
          Projection:
            ProjectionType: ALL
          ProvisionedThroughput: !If
            - IsProvisioned
            - ReadCapacityUnits: !Ref ReadCapacity
              WriteCapacityUnits: !Ref WriteCapacity
            - !Ref AWS::NoValue
        - IndexName: GSI-EntityType
          KeySchema:
            - AttributeName: entityType
              KeyType: HASH
            - AttributeName: SK
              KeyType: RANGE
          Projection:
            ProjectionType: ALL
          ProvisionedThroughput: !If
            - IsProvisioned
            - ReadCapacityUnits: !Ref ReadCapacity
              WriteCapacityUnits: !Ref WriteCapacity
            - !Ref AWS::NoValue
      Tags:
        - Key: AccountId
          Value: !Ref AccountId
        - Key: AccountName
          Value: !Ref AccountName
        - Key: Environment
          Value: !Ref Environment
        - Key: CloudType
          Value: private
        - Key: ManagedBy
          Value: CloudFormation-Runtime

  TableNameParam:
    Type: AWS::SSM::Parameter
    Properties:
      Name: !Sub '/accounts/\${AccountId}/dynamodb/table-name'
      Type: String
      Value: !Ref AccountTable
      Description: !Sub 'DynamoDB table name for private account \${AccountId}'

  TableArnParam:
    Type: AWS::SSM::Parameter
    Properties:
      Name: !Sub '/accounts/\${AccountId}/dynamodb/table-arn'
      Type: String
      Value: !GetAtt AccountTable.Arn
      Description: !Sub 'DynamoDB table ARN for private account \${AccountId}'

Outputs:
  TableName:
    Description: Name of the provisioned DynamoDB table
    Value: !Ref AccountTable
  TableArn:
    Description: ARN of the provisioned DynamoDB table
    Value: !GetAtt AccountTable.Arn
  TableStreamArn:
    Description: Stream ARN (if enabled)
    Value: !Ref AWS::NoValue`;
