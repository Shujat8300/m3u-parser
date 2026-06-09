import {
  Injectable,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import * as https from 'https';
import * as http  from 'http';
import { M3uParser, ParsedChannel } from './m3u.parser';

export interface ParseResult {
  url: string;
  totalCount: number;
  page: number;
  limit: number;
  totalPages: number;
  countsByType: {
    LIVE: number;
    MOVIE: number;
    SERIES: number;
  };
  topCategories: Array<{ name: string; count: number }>;
  items: ParsedChannel[];
}

@Injectable()
export class PlaylistService {
  private readonly logger = new Logger(PlaylistService.name);

  private fetchUrl(url: string, redirectCount = 0): Promise<string> {
    if (redirectCount > 5) {
      throw new BadRequestException('Too many redirects');
    }

    return new Promise((resolve, reject) => {
      const transport = url.startsWith('https') ? https : http;

      const req = transport.get(url, (res) => {
        if (
          res.statusCode &&
          [301, 302, 307, 308].includes(res.statusCode) &&
          res.headers.location
        ) {
          resolve(this.fetchUrl(res.headers.location, redirectCount + 1));
          return;
        }

        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`Upstream returned HTTP ${res.statusCode}`));
          return;
        }

        const chunks: Buffer[] = [];
        res.on('data',  (chunk) => chunks.push(Buffer.from(chunk)));
        res.on('end',   ()      => resolve(Buffer.concat(chunks).toString('utf8')));
        res.on('error', reject);
      });

      req.setTimeout(30_000, () => {
        req.destroy(new Error('Request timed out after 30s'));
      });

      req.on('error', reject);
    });
  }

  private buildTopCategories(
    channels: ParsedChannel[],
    limit = 10,
  ): Array<{ name: string; count: number }> {
    const map = new Map<string, number>();

    for (const ch of channels) {
      const cat = (ch.category || ch.groupTitle || '').trim();
      if (!cat) continue;
      map.set(cat, (map.get(cat) ?? 0) + 1);
    }

    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([name, count]) => ({ name, count }));
  }

  async parseFromUrl(
    url: string,
    page = 1,
    limit = 100,
    type: 'ALL' | 'LIVE' | 'MOVIE' | 'SERIES' = 'ALL',
  ): Promise<ParseResult> {
    if (!url?.trim()) {
      throw new BadRequestException('URL is required');
    }

    this.logger.log(`Fetching M3U from: ${url}`);

    let raw: string;
    try {
      raw = await this.fetchUrl(url.trim());
    } catch (err) {
      throw new BadRequestException(
        `Failed to fetch URL: ${(err as Error).message}`,
      );
    }

    this.logger.log(`Fetched ${raw.length} bytes, parsing...`);

    let channels: ParsedChannel[];
    try {
      channels = M3uParser.parse(raw);
    } catch (err) {
      throw new BadRequestException(
        `Failed to parse M3U: ${(err as Error).message}`,
      );
    }

    // Count by type across ALL channels before filtering
    const countsByType = { LIVE: 0, MOVIE: 0, SERIES: 0 };
    for (const ch of channels) {
      countsByType[ch.contentType] += 1;
    }

    // Optional type filter
    if (type && type !== 'ALL') {
      channels = channels.filter((ch) => ch.contentType === type);
    }

    const normalizedPage  = Math.max(1, page);
    const normalizedLimit = Math.min(Math.max(1, limit), 500);
    const totalPages      = Math.ceil(channels.length / normalizedLimit);
    const startIndex      = (normalizedPage - 1) * normalizedLimit;
    const pagedItems      = channels.slice(startIndex, startIndex + normalizedLimit);

    this.logger.log(
      `Returning page ${normalizedPage}/${totalPages} ` +
      `(${pagedItems.length} of ${channels.length} channels)`,
    );

    return {
      url,
      totalCount:    channels.length,
      page:          normalizedPage,
      limit:         normalizedLimit,
      totalPages,
      countsByType,
      topCategories: this.buildTopCategories(channels),
      items:         pagedItems,
    };
  }
}