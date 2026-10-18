import type { AuthenticatedRequest } from '../middleware';
import type { CommandActor } from './invoiceCommands';

export const commandActor = (req: AuthenticatedRequest): CommandActor => ({
  role: req.user!.role, partnerId: req.user!.partnerId, clientId: req.user!.clientId,
  tokenId: req.user!.token.id, requestKey: req.get('Idempotency-Key'), ip: req.ip, userAgent: req.get('user-agent'),
});
