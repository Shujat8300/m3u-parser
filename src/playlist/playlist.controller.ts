import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { PlaylistService } from './playlist.service';

@Controller('playlist')
export class PlaylistController {
  constructor(private readonly playlistService: PlaylistService) {}

  // GET /playlist/parse?url=...&page=1&limit=100&type=LIVE
  @Get('parse')
  parse(
    @Query('url')   url:   string,
    @Query('page')  page   = '1',
    @Query('limit') limit  = '100',
    @Query('type')  type   = 'ALL',
  ) {
    if (!url) {
      throw new BadRequestException('Query param "url" is required');
    }
    return this.playlistService.parseFromUrl(
      url,
      parseInt(page,  10),
      parseInt(limit, 10),
      type as 'ALL' | 'LIVE' | 'MOVIE' | 'SERIES',
    );
  }
}