import { SetMetadata } from '@nestjs/common';
import {
  AUTH_ACCESS_POLICY_METADATA,
  type AuthAccessPolicy,
} from '../auth-access-policy';

export function Public(): MethodDecorator & ClassDecorator {
  return SetMetadata(AUTH_ACCESS_POLICY_METADATA, {
    type: 'public',
  } satisfies AuthAccessPolicy);
}
