import type { JwtModuleOptions } from '@nestjs/jwt';
import type { SecurityConfiguration } from '../config/security.config';

export function createJwtOptions(
  security: SecurityConfiguration,
): JwtModuleOptions {
  return {
    secret: security.jwtSecret,
    signOptions: { expiresIn: security.jwtExpiresIn },
  };
}
