import { Module } from '@nestjs/common';
import { PlaylistModule } from './playlist/playlist.module';

@Module({
  imports: [PlaylistModule],
})
export class AppModule {}