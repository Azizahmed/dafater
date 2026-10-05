import { Module } from '@nestjs/common';

import { AuthModule } from '../auth';
import { ServerConfigModule } from '../config';
import { UserModule } from '../user';
import { CustomSetupController } from './controller';
import { SelfhostGuard } from './guard';
import { SetupMiddleware } from './setup';
import { SignUpController } from './sign-up';
import { StaticFilesResolver } from './static';

@Module({
  imports: [AuthModule, UserModule, ServerConfigModule],
  providers: [SetupMiddleware, StaticFilesResolver, SelfhostGuard],
  controllers: [CustomSetupController, SignUpController],
})
export class SelfhostModule {}
