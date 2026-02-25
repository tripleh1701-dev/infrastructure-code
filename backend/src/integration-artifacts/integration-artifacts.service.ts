import { Injectable, BadRequestException } from '@nestjs/common';
import { FetchPackagesDto } from './dto/fetch-packages.dto';

/** Artifact collection endpoints per package */
const ARTIFACT_COLLECTIONS = [
  'IntegrationDesigntimeArtifacts',
  'ValueMappingDesigntimeArtifacts',
  'ScriptCollectionDesigntimeArtifacts',
  'MessageMappingDesigntimeArtifacts',
  'ScriptCollectionDesigntimeArtifacts', // also covers GroovyScript
  'MessageResourcesDesigntimeArtifacts',
] as const;

// Deduplicate since ScriptCollection appears twice in the mapping
const UNIQUE_ARTIFACT_COLLECTIONS = [...new Set(ARTIFACT_COLLECTIONS)];

interface CpiPackage {
  Name: string;
  Version: string;
  Id: string;
  [key: string]: any;
}

@Injectable()
export class IntegrationArtifactsService {

  /**
   * Fetch integration packages (and nested artifacts) from SAP CPI.
   */
  async fetchPackages(dto: FetchPackagesDto) {
    const authHeader = await this.resolveAuthHeader(dto);

    // 1. Fetch top-level integration packages
    const packagesUrl = dto.apiUrl.replace(/\/$/, '');
    const packagesResp = await fetch(packagesUrl, {
      headers: { Authorization: authHeader, Accept: 'application/json' },
    });

    if (!packagesResp.ok) {
      const body = await packagesResp.text();
      throw new BadRequestException(
        `SAP CPI IntegrationPackages call failed [${packagesResp.status}]: ${body}`,
      );
    }

    const packagesJson = await packagesResp.json();
    const packages: CpiPackage[] =
      packagesJson?.d?.results ?? packagesJson?.d ?? packagesJson?.results ?? [];

    // 2. For each package, fetch artifact collections in parallel
    const enriched = await Promise.all(
      packages.map(async (pkg) => {
        const baseUrl = packagesUrl.replace(
          /\/IntegrationPackages$/i,
          '',
        );

        const artifactResults = await Promise.all(
          UNIQUE_ARTIFACT_COLLECTIONS.map(async (collection) => {
            try {
              const url = `${baseUrl}/IntegrationPackages('${pkg.Id}')/${collection}`;
              const resp = await fetch(url, {
                headers: { Authorization: authHeader, Accept: 'application/json' },
              });
              if (!resp.ok) return { collection, artifacts: [] };
              const json = await resp.json();
              const artifacts = json?.d?.results ?? json?.d ?? json?.results ?? [];
              return { collection, artifacts };
            } catch {
              return { collection, artifacts: [] };
            }
          }),
        );

        const enrichedPkg: Record<string, any> = {
          Name: pkg.Name,
          Version: pkg.Version,
          Id: pkg.Id,
        };

        for (const { collection, artifacts } of artifactResults) {
          enrichedPkg[collection] = artifacts.map((a: any) => ({
            Name: a.Name,
            Version: a.Version,
            Id: a.Id,
          }));
        }

        return enrichedPkg;
      }),
    );

    return {
      success: true,
      data: enriched,
      count: enriched.length,
    };
  }

  // ── Auth resolution ─────────────────────────────────────────────────────────

  private async resolveAuthHeader(dto: FetchPackagesDto): Promise<string> {
    const authType = (dto.authenticationType || '').toLowerCase();

    if (authType === 'oauth2') {
      if (!dto.oauth2TokenUrl || !dto.oauth2ClientId || !dto.oauth2ClientSecret) {
        throw new BadRequestException(
          'OAuth2 requires oauth2TokenUrl, oauth2ClientId, and oauth2ClientSecret',
        );
      }
      return this.getOAuth2Token(
        dto.oauth2TokenUrl,
        dto.oauth2ClientId,
        dto.oauth2ClientSecret,
      );
    }

    if (authType === 'basic') {
      if (!dto.username || !dto.apiKey) {
        throw new BadRequestException('Basic auth requires username and apiKey (password)');
      }
      const encoded = Buffer.from(`${dto.username}:${dto.apiKey}`).toString('base64');
      return `Basic ${encoded}`;
    }

    if (authType === 'username and api key') {
      if (!dto.username || !dto.apiKey) {
        throw new BadRequestException('Username+API Key auth requires username and apiKey');
      }
      const encoded = Buffer.from(`${dto.username}:${dto.apiKey}`).toString('base64');
      return `Basic ${encoded}`;
    }

    throw new BadRequestException(`Unsupported authenticationType: ${dto.authenticationType}`);
  }

  private async getOAuth2Token(
    tokenUrl: string,
    clientId: string,
    clientSecret: string,
  ): Promise<string> {
    const resp = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: 'grant_type=client_credentials',
    });

    if (!resp.ok) {
      const body = await resp.text();
      throw new BadRequestException(`OAuth2 token fetch failed [${resp.status}]: ${body}`);
    }

    const json = await resp.json();
    return `Bearer ${json.access_token}`;
  }
}
