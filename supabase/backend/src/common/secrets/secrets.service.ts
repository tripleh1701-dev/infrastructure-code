import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SecretsManagerClient,
  GetSecretValueCommand,
  DescribeSecretCommand,
} from '@aws-sdk/client-secrets-manager';

interface CachedSecret {
  value: string | Record<string, any>;
  expiresAt: number;
  versionId?: string;
}

interface DatabaseCredentials {
  engine: string;
  host: string;
  port: number;
  dbname: string;
  username: string;
  password: string;
}

interface JWTConfig {
  secret_key: string;
  refresh_token_secret: string;
  expiry_hours: number;
  refresh_expiry_days: number;
  algorithm: string;
  previous_secret_key?: string; // For key rotation support
}

interface CognitoConfig {
  user_pool_id: string;
  client_id: string;
  region: string;
  jwks_uri: string;
}

@Injectable()
export class SecretsService implements OnModuleInit {
  private readonly logger = new Logger(SecretsService.name);
  private client: SecretsManagerClient;
  private cache: Map<string, CachedSecret> = new Map();
  private readonly cacheTTL: number;
  private readonly useSecretsManager: boolean;

  constructor(private readonly configService: ConfigService) {
    this.cacheTTL = this.configService.get<number>('SECRETS_CACHE_TTL_MS', 300000); // 5 minutes default
    this.useSecretsManager = this.configService.get<boolean>('USE_SECRETS_MANAGER', false);
  }

  async onModuleInit() {
    if (!this.useSecretsManager) {
      this.logger.log('Secrets Manager disabled - using environment variables');
      return;
    }

    const region = this.configService.get<string>('AWS_REGION', 'us-east-1');
    
    this.client = new SecretsManagerClient({ region });
    this.logger.log(`Secrets Manager service initialized in region: ${region}`);

    // Pre-warm cache with configured secrets
    await this.prewarmCache();
  }

  /**
   * Pre-warm the cache with commonly used secrets
   */
  private async prewarmCache(): Promise<void> {
    const secretArns = [
      this.configService.get<string>('DATABASE_SECRET_ARN'),
      this.configService.get<string>('JWT_SECRET_ARN'),
      this.configService.get<string>('API_KEYS_SECRET_ARN'),
      this.configService.get<string>('COGNITO_SECRET_ARN'),
    ].filter(Boolean);

    for (const arn of secretArns) {
      try {
        await this.getSecret(arn!);
        this.logger.debug(`Pre-warmed cache for secret: ${this.maskArn(arn!)}`);
      } catch (error) {
        this.logger.warn(`Failed to pre-warm cache for secret: ${this.maskArn(arn!)}`);
      }
    }
  }

  /**
   * Get a secret value from Secrets Manager (with caching)
   */
  async getSecret<T = string>(secretId: string, parseJson = true): Promise<T> {
    // Check cache first
    const cached = this.cache.get(secretId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value as T;
    }

    if (!this.client) {
      throw new Error('Secrets Manager client not initialized');
    }

    try {
      const command = new GetSecretValueCommand({
        SecretId: secretId,
      });

      const response = await this.client.send(command);

      if (!response.SecretString) {
        throw new Error('Secret does not contain a string value');
      }

      const value = parseJson ? JSON.parse(response.SecretString) : response.SecretString;

      // Cache the secret
      this.cache.set(secretId, {
        value,
        expiresAt: Date.now() + this.cacheTTL,
        versionId: response.VersionId,
      });

      return value as T;
    } catch (error) {
      this.logger.error(`Failed to retrieve secret: ${this.maskArn(secretId)}`, error);
      throw error;
    }
  }

  /**
   * Get database credentials from Secrets Manager
   */
  async getDatabaseCredentials(): Promise<DatabaseCredentials> {
    const secretArn = this.configService.get<string>('DATABASE_SECRET_ARN');
    
    if (!secretArn) {
      // Fallback to environment variables
      return {
        engine: this.configService.get<string>('DATABASE_ENGINE', 'postgres'),
        host: this.configService.get<string>('DATABASE_HOST', ''),
        port: this.configService.get<number>('DATABASE_PORT', 5432),
        dbname: this.configService.get<string>('DATABASE_NAME', ''),
        username: this.configService.get<string>('DATABASE_USERNAME', ''),
        password: this.configService.get<string>('DATABASE_PASSWORD', ''),
      };
    }

    return this.getSecret<DatabaseCredentials>(secretArn);
  }

  /**
   * Get JWT configuration from Secrets Manager
   */
  async getJWTConfig(): Promise<JWTConfig> {
    const secretArn = this.configService.get<string>('JWT_SECRET_ARN');
    
    if (!secretArn) {
      // Fallback to environment variables
      return {
        secret_key: this.configService.get<string>('JWT_SECRET_KEY', ''),
        refresh_token_secret: this.configService.get<string>('JWT_REFRESH_SECRET', ''),
        expiry_hours: this.configService.get<number>('JWT_EXPIRY_HOURS', 24),
        refresh_expiry_days: this.configService.get<number>('JWT_REFRESH_EXPIRY_DAYS', 7),
        algorithm: this.configService.get<string>('JWT_ALGORITHM', 'HS256'),
      };
    }

    return this.getSecret<JWTConfig>(secretArn);
  }

  /**
   * Get Cognito configuration from Secrets Manager
   */
  async getCognitoConfig(): Promise<CognitoConfig> {
    const secretArn = this.configService.get<string>('COGNITO_SECRET_ARN');
    
    if (!secretArn) {
      // Fallback to environment variables
      const userPoolId = this.configService.get<string>('COGNITO_USER_POOL_ID', '');
      const region = this.configService.get<string>('COGNITO_REGION', 'us-east-1');
      
      return {
        user_pool_id: userPoolId,
        client_id: this.configService.get<string>('COGNITO_CLIENT_ID', ''),
        region,
        jwks_uri: `https://cognito-idp.${region}.amazonaws.com/${userPoolId}/.well-known/jwks.json`,
      };
    }

    return this.getSecret<CognitoConfig>(secretArn);
  }

  /**
   * Get API key by name from Secrets Manager
   */
  async getApiKey(keyName: string): Promise<string> {
    const secretArn = this.configService.get<string>('API_KEYS_SECRET_ARN');
    
    if (!secretArn) {
      // Fallback to environment variable
      const envKey = `API_KEY_${keyName.toUpperCase().replace(/-/g, '_')}`;
      return this.configService.get<string>(envKey, '');
    }

    const apiKeys = await this.getSecret<Record<string, string>>(secretArn);
    return apiKeys[keyName] || '';
  }

  /**
   * Get custom secret value
   */
  async getCustomSecret<T = Record<string, any>>(secretPath: string): Promise<T> {
    const projectName = this.configService.get<string>('PROJECT_NAME', 'license-portal');
    const environment = this.configService.get<string>('NODE_ENV', 'development');
    
    const fullSecretName = `${projectName}-${environment}/${secretPath}`;
    return this.getSecret<T>(fullSecretName);
  }

  /**
   * Check if a secret is approaching rotation
   */
  async checkSecretRotationStatus(secretId: string): Promise<{
    rotationEnabled: boolean;
    nextRotationDate?: Date;
    lastRotatedDate?: Date;
  }> {
    if (!this.client) {
      throw new Error('Secrets Manager client not initialized');
    }

    try {
      const command = new DescribeSecretCommand({
        SecretId: secretId,
      });

      const response = await this.client.send(command);

      return {
        rotationEnabled: response.RotationEnabled || false,
        nextRotationDate: response.NextRotationDate,
        lastRotatedDate: response.LastRotatedDate,
      };
    } catch (error) {
      this.logger.error(`Failed to check rotation status: ${this.maskArn(secretId)}`, error);
      throw error;
    }
  }

  /**
   * Invalidate cached secret (force refresh on next access)
   */
  invalidateCache(secretId: string): void {
    this.cache.delete(secretId);
    this.logger.debug(`Cache invalidated for secret: ${this.maskArn(secretId)}`);
  }

  /**
   * Invalidate all cached secrets
   */
  invalidateAllCache(): void {
    this.cache.clear();
    this.logger.debug('All secret cache invalidated');
  }

  /**
   * Mask ARN for logging (security)
   */
  private maskArn(arn: string): string {
    if (arn.startsWith('arn:aws:secretsmanager:')) {
      const parts = arn.split(':');
      if (parts.length >= 7) {
        const secretName = parts.slice(6).join(':');
        return `***:${secretName.substring(0, 10)}...`;
      }
    }
    return arn.substring(0, 15) + '...';
  }

  /**
   * Check if Secrets Manager is enabled
   */
  isEnabled(): boolean {
    return this.useSecretsManager && !!this.client;
  }

  /**
   * Get cache statistics for monitoring
   */
  getCacheStats(): {
    enabled: boolean;
    cacheSize: number;
    cacheTTLMs: number;
  } {
    return {
      enabled: this.useSecretsManager,
      cacheSize: this.cache.size,
      cacheTTLMs: this.cacheTTL,
    };
  }
}
