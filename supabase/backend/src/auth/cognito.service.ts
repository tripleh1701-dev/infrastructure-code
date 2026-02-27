import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import * as jwksClient from 'jwks-rsa';

interface JWK {
  kid: string;
  alg: string;
  kty: string;
  e: string;
  n: string;
  use: string;
}

interface CachedKey {
  key: string;
  expiresAt: number;
}

@Injectable()
export class CognitoService implements OnModuleInit {
  private readonly logger = new Logger(CognitoService.name);
  private jwksClient: jwksClient.JwksClient;
  private keyCache: Map<string, CachedKey> = new Map();
  private readonly keyCacheTTL = 3600000; // 1 hour in milliseconds

  private userPoolId: string;
  private clientId: string;
  private region: string;
  private issuer: string;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    this.userPoolId = this.configService.get<string>('COGNITO_USER_POOL_ID', '');
    this.clientId = this.configService.get<string>('COGNITO_CLIENT_ID', '');
    this.region = this.configService.get<string>('COGNITO_REGION', 'us-east-1');

    if (!this.userPoolId || !this.clientId) {
      this.logger.warn('Cognito configuration missing. Authentication will be disabled.');
      return;
    }

    this.issuer = `https://cognito-idp.${this.region}.amazonaws.com/${this.userPoolId}`;
    const jwksUri = `${this.issuer}/.well-known/jwks.json`;

    this.jwksClient = jwksClient({
      jwksUri,
      cache: true,
      cacheMaxAge: this.keyCacheTTL,
      rateLimit: true,
      jwksRequestsPerMinute: 10,
    });

    this.logger.log(`Cognito service initialized for pool: ${this.userPoolId}`);
  }

  /**
   * Verify a JWT token against Cognito JWKS
   */
  async verifyToken(token: string): Promise<Record<string, any>> {
    if (!this.jwksClient) {
      throw new Error('Cognito service not initialized');
    }

    // Decode token header to get key ID (kid)
    const decoded = jwt.decode(token, { complete: true });
    
    if (!decoded || typeof decoded === 'string') {
      throw new Error('Invalid token format');
    }

    const { header, payload } = decoded;
    
    if (!header.kid) {
      throw new Error('Token missing key ID (kid)');
    }

    // Validate token_use claim
    const tokenPayload = payload as jwt.JwtPayload;
    if (tokenPayload.token_use !== 'access' && tokenPayload.token_use !== 'id') {
      throw new Error('Invalid token_use claim');
    }

    // Get the signing key
    const signingKey = await this.getSigningKey(header.kid);

    // Verify the token
    const verifiedPayload = jwt.verify(token, signingKey, {
      algorithms: ['RS256'],
      issuer: this.issuer,
      clockTolerance: 30, // 30 seconds clock skew tolerance
    }) as Record<string, any>;

    // Additional validation for access tokens
    if (verifiedPayload.token_use === 'access') {
      // Verify client_id for access tokens
      if (verifiedPayload.client_id !== this.clientId) {
        throw new Error('Token client_id mismatch');
      }
    }

    // Additional validation for id tokens
    if (verifiedPayload.token_use === 'id') {
      // Verify aud for id tokens
      if (verifiedPayload.aud !== this.clientId) {
        throw new Error('Token audience mismatch');
      }
    }

    return verifiedPayload;
  }

  /**
   * Get signing key from JWKS (with caching)
   */
  private async getSigningKey(kid: string): Promise<string> {
    // Check cache first
    const cached = this.keyCache.get(kid);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.key;
    }

    // Fetch from JWKS
    const key = await this.jwksClient.getSigningKey(kid);
    const publicKey = key.getPublicKey();

    // Cache the key
    this.keyCache.set(kid, {
      key: publicKey,
      expiresAt: Date.now() + this.keyCacheTTL,
    });

    return publicKey;
  }

  /**
   * Get Cognito configuration (for debugging)
   */
  getConfig() {
    return {
      userPoolId: this.userPoolId,
      clientId: this.clientId ? `${this.clientId.slice(0, 8)}...` : 'not configured',
      region: this.region,
      issuer: this.issuer,
    };
  }

  /**
   * Check if Cognito is configured
   */
  isConfigured(): boolean {
    return !!(this.userPoolId && this.clientId);
  }
}
