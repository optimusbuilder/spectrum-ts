import {
  type AdvancedIMessage,
  createClient,
} from "@photon-ai/advanced-imessage";
import { SPECTRUM_CLOUD_URL } from "../../utils/cloud";

const RENEWAL_RATIO = 0.8;
const EXPIRY_BUFFER_MS = 30_000;
const RETRY_DELAY_MS = 30_000;

interface SharedTokenData {
  expiresIn: number;
  token: string;
  type: "shared";
}

interface DedicatedTokenData {
  auth: Record<string, string>;
  expiresIn: number;
  type: "dedicated";
}

type TokenData = SharedTokenData | DedicatedTokenData;

interface TokenResponse {
  data: TokenData;
  succeed: boolean;
}

interface CloudAuth {
  dispose: () => void;
}

const cloudAuthState = new WeakMap<AdvancedIMessage[], CloudAuth>();

async function fetchTokens(
  projectId: string,
  projectSecret: string
): Promise<TokenData> {
  const url = `${SPECTRUM_CLOUD_URL}/${projectId}/imessage/tokens`;
  const credentials = btoa(`${projectId}:${projectSecret}`);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Spectrum Cloud authentication failed (${response.status}): ${body || response.statusText}`
    );
  }

  const json = (await response.json()) as TokenResponse;
  if (!json.succeed) {
    throw new Error(
      "Spectrum Cloud authentication failed: server returned succeed=false"
    );
  }

  return json.data;
}

export async function createCloudClients(
  projectId: string,
  projectSecret: string
): Promise<AdvancedIMessage[]> {
  let tokenData = await fetchTokens(projectId, projectSecret);
  let tokenExpiresAt = Date.now() + tokenData.expiresIn * 1000;
  let disposed = false;
  let renewalTimer: ReturnType<typeof setTimeout> | undefined;

  const scheduleRenewal = () => {
    if (disposed) {
      return;
    }
    const ttlMs = tokenData.expiresIn * 1000;
    const renewInMs = Math.max(ttlMs * RENEWAL_RATIO, 5000);

    renewalTimer = setTimeout(async () => {
      try {
        tokenData = await fetchTokens(projectId, projectSecret);
        tokenExpiresAt = Date.now() + tokenData.expiresIn * 1000;
        scheduleRenewal();
      } catch {
        renewalTimer = setTimeout(() => scheduleRenewal(), RETRY_DELAY_MS);
        renewalTimer?.unref?.();
      }
    }, renewInMs);
    renewalTimer?.unref?.();
  };

  scheduleRenewal();

  const refreshIfNeeded = async (): Promise<void> => {
    if (Date.now() < tokenExpiresAt - EXPIRY_BUFFER_MS) {
      return;
    }
    tokenData = await fetchTokens(projectId, projectSecret);
    tokenExpiresAt = Date.now() + tokenData.expiresIn * 1000;
    scheduleRenewal();
  };

  const buildClients = (): AdvancedIMessage[] => {
    if (tokenData.type === "shared") {
      const address =
        process.env.SPECTRUM_IMESSAGE_ADDRESS ??
        "spectrum-cloud.photon.codes:443";

      return [
        createClient({
          address,
          tls: true,
          token: async () => {
            await refreshIfNeeded();
            return (tokenData as SharedTokenData).token;
          },
        }),
      ];
    }

    return Object.entries(tokenData.auth).map(([instanceId, token]) =>
      createClient({
        address: `${instanceId}.imsg.photon.codes:443`,
        tls: true,
        token: async () => {
          await refreshIfNeeded();
          const data = tokenData as DedicatedTokenData;
          return data.auth[instanceId] ?? token;
        },
      })
    );
  };

  const clients = buildClients();

  cloudAuthState.set(clients, {
    dispose: () => {
      disposed = true;
      if (renewalTimer !== undefined) {
        clearTimeout(renewalTimer);
        renewalTimer = undefined;
      }
    },
  });

  return clients;
}

export async function disposeCloudAuth(
  clients: AdvancedIMessage[]
): Promise<void> {
  const auth = cloudAuthState.get(clients);
  if (auth) {
    auth.dispose();
    cloudAuthState.delete(clients);
  }
}
