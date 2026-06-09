export interface ParsedChannel {
  name: string;
  tvgId: string;
  tvgName: string;
  tvgLogo: string;
  groupTitle: string;
  sourceUrl: string;
  contentType: 'LIVE' | 'MOVIE' | 'SERIES';
  category?: string;
  genre?: string;
}

export class M3uParser {

  static detectContentType(
    groupTitle: string,
    sourceUrl: string,
  ): 'LIVE' | 'MOVIE' | 'SERIES' {
    const group = (groupTitle || '').toLowerCase();
    const url   = (sourceUrl  || '').toLowerCase();

    if (url.includes('/series/') || group.includes('series')) return 'SERIES';
    if (
      url.includes('/movie/')  ||
      url.includes('/vod/')    ||
      group.includes('movie')  ||
      group.includes('vod')    ||
      group.includes('film')
    ) return 'MOVIE';

    return 'LIVE';
  }

  static extractGenre(groupTitle: string): string | undefined {
    const hints = [
      'action', 'comedy', 'drama', 'horror', 'romance',
      'thriller', 'anime', 'sports', 'news', 'kids',
      'documentary', 'music', 'religious',
    ];
    const lower = (groupTitle || '').toLowerCase();
    const found = hints.find((h) => lower.includes(h));
    return found ? found.toUpperCase() : undefined;
  }

  static parseExtInf(line: string): Omit<ParsedChannel, 'sourceUrl' | 'contentType'> {
    const attrs = { tvgId: '', tvgName: '', tvgLogo: '', groupTitle: '' };
    const attrRegex = /([a-zA-Z0-9-]+)="([^"]*)"/g;
    let match: RegExpExecArray | null;

    while ((match = attrRegex.exec(line)) !== null) {
      const [, key, value] = match;
      if (key === 'tvg-id')      attrs.tvgId      = value;
      if (key === 'tvg-name')    attrs.tvgName    = value;
      if (key === 'tvg-logo')    attrs.tvgLogo    = value;
      if (key === 'group-title') attrs.groupTitle = value;
    }

    const commaIndex = line.indexOf(',');
    const name = commaIndex >= 0 ? line.slice(commaIndex + 1).trim() : '';

    return {
      name,
      tvgId:      attrs.tvgId,
      tvgName:    attrs.tvgName || name,
      tvgLogo:    attrs.tvgLogo,
      groupTitle: attrs.groupTitle,
      category:   attrs.groupTitle || undefined,
      genre:      this.extractGenre(attrs.groupTitle),
    };
  }

  static parse(raw: string): ParsedChannel[] {
    if (!raw.trim().startsWith('#EXTM3U')) {
      throw new Error('Invalid M3U: missing #EXTM3U header');
    }

    const lines    = raw.split(/\r?\n/);
    const channels: ParsedChannel[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (!line.startsWith('#EXTINF')) continue;

      const sourceUrl = lines[i + 1]?.trim();
      if (!sourceUrl || sourceUrl.startsWith('#')) continue;

      const meta        = this.parseExtInf(line);
      const contentType = this.detectContentType(meta.groupTitle, sourceUrl);

      channels.push({ ...meta, sourceUrl, contentType });
    }

    return channels;
  }
}