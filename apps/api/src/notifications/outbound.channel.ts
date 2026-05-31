import { Logger } from '@nestjs/common';
import { isPlaceholderTenant } from '../auth/entra.js';

export interface OutboundRecipient {
  email: string;
  displayName: string;
}
export interface OutboundMessage {
  title: string;
  body?: string | null | undefined;
  severity: string;
  linkPath?: string | null | undefined;
}

/**
 * Out-of-app delivery (beyond the in-app record). Returns the channel names it
 * delivered to, e.g. ['EMAIL']. Local uses a log channel; cloud sends email via
 * Microsoft Graph.
 */
export interface OutboundChannel {
  deliver(to: OutboundRecipient, msg: OutboundMessage): Promise<string[]>;
}

/** Local default — logs what would be sent, delivers nothing externally. */
export class LogOutboundChannel implements OutboundChannel {
  private readonly logger = new Logger('Notify');
  async deliver(to: OutboundRecipient, msg: OutboundMessage): Promise<string[]> {
    this.logger.log(`→ ${to.email}: [${msg.severity}] ${msg.title}`);
    return [];
  }
}

/** Cloud — sends email via Graph /users/{email}/sendMail (client-credentials). */
export class GraphMailChannel implements OutboundChannel {
  private readonly logger = new Logger(GraphMailChannel.name);
  constructor(
    private readonly tenantId: string,
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly sender: string,
  ) {}

  private async token(): Promise<string> {
    const body = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    });
    const res = await fetch(`https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`, {
      method: 'POST',
      body,
    });
    if (!res.ok) throw new Error(`Graph token failed: ${res.status}`);
    return ((await res.json()) as { access_token: string }).access_token;
  }

  async deliver(to: OutboundRecipient, msg: OutboundMessage): Promise<string[]> {
    try {
      const token = await this.token();
      const link = msg.linkPath ? `<p><a href="${process.env.WEB_ORIGIN ?? ''}${msg.linkPath}">Open in CES Ops</a></p>` : '';
      const res = await fetch(
        `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(this.sender)}/sendMail`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify({
            message: {
              subject: msg.title,
              body: { contentType: 'HTML', content: `<p>${msg.body ?? ''}</p>${link}` },
              toRecipients: [{ emailAddress: { address: to.email } }],
            },
            saveToSentItems: false,
          }),
        },
      );
      if (!res.ok) throw new Error(`sendMail ${res.status}`);
      return ['EMAIL'];
    } catch (err) {
      this.logger.warn(`email to ${to.email} failed: ${err instanceof Error ? err.message : err}`);
      return [];
    }
  }
}

export function createOutboundChannel(env: {
  AZURE_TENANT_ID?: string;
  AZURE_API_CLIENT_ID?: string;
  AZURE_API_CLIENT_SECRET?: string;
  NOTIFY_EMAIL_SENDER?: string;
}): OutboundChannel {
  const configured =
    !isPlaceholderTenant(env.AZURE_TENANT_ID) &&
    !!env.AZURE_API_CLIENT_ID &&
    !!env.AZURE_API_CLIENT_SECRET &&
    !!env.NOTIFY_EMAIL_SENDER;
  if (configured) {
    return new GraphMailChannel(
      env.AZURE_TENANT_ID!,
      env.AZURE_API_CLIENT_ID!,
      env.AZURE_API_CLIENT_SECRET!,
      env.NOTIFY_EMAIL_SENDER!,
    );
  }
  return new LogOutboundChannel();
}
