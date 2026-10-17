import { once } from "node:events";
import type { Server } from "node:http";
import express from "express";
import type { NextFunction, Request, Response } from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClientCollectionScope } from "../tenantAccess";

interface TestRequest extends Request {
  user?: {
    role: string;
    partnerId?: string;
    clientId?: string;
    token: { id: string };
  };
}

const storageMock = vi.hoisted(() => ({
  getClients: vi.fn(),
  getClient: vi.fn(),
  getClientWithPartner: vi.fn(),
  getClientPartners: vi.fn(),
  getClientsWithPartners: vi.fn(),
  getPartners: vi.fn(),
  getPartner: vi.fn(),
  getPartnerClients: vi.fn(),
  getPartnerPayments: vi.fn(),
  updateClient: vi.fn(),
  setClientPartners: vi.fn(),
  logAssistantAction: vi.fn(),
}));



vi.mock("../middleware", () => ({
  authMiddleware: (req: TestRequest, res: Response, next: NextFunction) => {
    const role = req.header("x-test-role");
    if (!role) return res.status(401).json({ error: "Not authenticated" });
    req.user = {
      role,
      partnerId: req.header("x-test-partner-id") || undefined,
      clientId: req.header("x-test-client-id") || undefined,
      token: { id: "test-token" },
    };
    next();
  },
  requireRole: (...roles: string[]) => (req: TestRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  },
}));

import { createClientsRouter } from "./clients";
import { createPartnersRouter } from "./partners";
import { projectInvoiceForRole } from "../permissions";

import { authMiddleware } from "../middleware";
const clientsRouter = createClientsRouter(storageMock, authMiddleware);
const partnersRouter = createPartnersRouter(storageMock, authMiddleware);
const now = new Date("2026-01-01T00:00:00.000Z");

const partnerA = {
  id: "partner-a",
  name: "Partner A",
  email: "partner-a@example.test",
  phone: "+70000000001",
  telegram: "@partner_a",
  commissionRate: "15.00",
  leverageRole: "external",
  createdAt: now,
  updatedAt: now,
};

const partnerB = {
  ...partnerA,
  id: "partner-b",
  name: "Partner B",
  email: "partner-b@example.test",
};

const clientA = {
  id: "client-a",
  name: "Client A",
  email: "client-a@example.test",
  phone: "+79990000001",
  telegram: "@client_a",
  contactPerson: "Alice",
  partnerId: partnerA.id,
  tgChatId: "-100000001",
  tgBotToken: "bot-secret-a",
  createdAt: now,
  updatedAt: now,
};

const clientB = {
  ...clientA,
  id: "client-b",
  name: "Client B",
  email: "client-b@example.test",
  partnerId: partnerB.id,
  tgChatId: "-100000002",
  tgBotToken: "bot-secret-b",
};

const clientsForScope = (scope: ClientCollectionScope) => {
  if (scope.kind === "client") return scope.clientId === clientA.id ? [clientA] : [clientB];
  if (scope.kind === "partner") return scope.partnerId === partnerA.id ? [clientA] : [clientB];
  return [clientA, clientB];
};

function actorHeaders(
  role: string,
  ids: { clientId?: string; partnerId?: string } = {},
): Record<string, string> {
  return {
    "x-test-role": role,
    ...(ids.clientId ? { "x-test-client-id": ids.clientId } : {}),
    ...(ids.partnerId ? { "x-test-partner-id": ids.partnerId } : {}),
  };
}

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use(clientsRouter);
  app.use(partnersRouter);

  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not start");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  if (!server) return;
  await new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  });
});

beforeEach(() => {
  vi.clearAllMocks();

  storageMock.getClients.mockImplementation(async (scope: ClientCollectionScope) => clientsForScope(scope));
  storageMock.getClient.mockImplementation(async (id: string) => {
    if (id === clientA.id) return clientA;
    if (id === clientB.id) return clientB;
    return null;
  });
  storageMock.getClientWithPartner.mockImplementation(async (id: string) => {
    if (id === clientA.id) return { ...clientA, partner: partnerA };
    if (id === clientB.id) return { ...clientB, partner: partnerB };
    return null;
  });
  storageMock.getClientPartners.mockImplementation(async (id: string) => {
    if (id === clientA.id) return [partnerA];
    if (id === clientB.id) return [partnerB];
    return [];
  });
  storageMock.getClientsWithPartners.mockImplementation(async (scope: ClientCollectionScope) => (
    clientsForScope(scope).map(client => ({
      ...client,
      partners: client.id === clientA.id ? [partnerA] : [partnerB],
    }))
  ));
  storageMock.getPartners.mockResolvedValue([partnerA, partnerB]);
  storageMock.getPartner.mockImplementation(async (id: string) => {
    if (id === partnerA.id) return partnerA;
    if (id === partnerB.id) return partnerB;
    return null;
  });
  storageMock.getPartnerClients.mockImplementation(async (id: string) => (
    id === partnerA.id ? [clientA] : [clientB]
  ));
  storageMock.updateClient.mockResolvedValue(clientA);
  storageMock.setClientPartners.mockResolvedValue(undefined);
  storageMock.logAssistantAction.mockResolvedValue(undefined);
});

describe("tenant isolation for client reads", () => {
  it("client catalog is forcibly scoped to the session clientId", async () => {
    const response = await fetch(`${baseUrl}/api/clients`, {
      headers: actorHeaders("client", { clientId: clientA.id }),
    });
    const body = await response.json() as Array<Record<string, unknown>>;

    expect(response.status).toBe(200);
    expect(storageMock.getClients).toHaveBeenCalledWith({ kind: "client", clientId: clientA.id });
    expect(body.map(item => item.id)).toEqual([clientA.id]);
    expect(body[0]).not.toHaveProperty("tgBotToken");
    expect(body[0]).not.toHaveProperty("tgChatId");
    expect(body[0]).not.toHaveProperty("partnerId");
  });

  it("client cannot read a foreign client by id", async () => {
    const response = await fetch(`${baseUrl}/api/clients/${clientB.id}`, {
      headers: actorHeaders("client", { clientId: clientA.id }),
    });
    expect(response.status).toBe(404);
  });

  it("partner catalog and detail are limited to linked clients", async () => {
    const headers = actorHeaders("partner", { partnerId: partnerA.id });
    const listResponse = await fetch(`${baseUrl}/api/clients`, { headers });
    const list = await listResponse.json() as Array<Record<string, unknown>>;
    const foreignResponse = await fetch(`${baseUrl}/api/clients/${clientB.id}`, { headers });

    expect(storageMock.getClients).toHaveBeenCalledWith({ kind: "partner", partnerId: partnerA.id });
    expect(list.map(item => item.id)).toEqual([clientA.id]);
    expect(list[0]).not.toHaveProperty("tgBotToken");
    expect(list[0]).not.toHaveProperty("tgChatId");
    expect(foreignResponse.status).toBe(404);
  });

  it("staff sees Telegram configuration status, never the bot token", async () => {
    const response = await fetch(`${baseUrl}/api/clients`, {
      headers: actorHeaders("admin"),
    });
    const body = await response.json() as Array<Record<string, unknown>>;

    expect(response.status).toBe(200);
    expect(body).toHaveLength(2);
    expect(body[0].tgChatId).toBe(clientA.tgChatId);
    expect(body[0].hasTgBotToken).toBe(true);
    expect(body[0]).not.toHaveProperty("tgBotToken");
  });
});

describe("tenant isolation for client-partner relationships", () => {
  it("client sees only own relationships and only a public partner DTO", async () => {
    const headers = actorHeaders("client", { clientId: clientA.id });
    const ownResponse = await fetch(`${baseUrl}/api/clients/${clientA.id}/partners`, { headers });
    const own = await ownResponse.json() as Array<Record<string, unknown>>;
    const foreignResponse = await fetch(`${baseUrl}/api/clients/${clientB.id}/partners`, { headers });
    const aggregateResponse = await fetch(`${baseUrl}/api/clients-with-partners`, { headers });
    const aggregate = await aggregateResponse.json() as Array<Record<string, unknown>>;

    expect(ownResponse.status).toBe(200);
    expect(own).toEqual([{ id: partnerA.id, name: partnerA.name, createdAt: now.toISOString(), updatedAt: now.toISOString() }]);
    expect(own[0]).not.toHaveProperty("commissionRate");
    expect(own[0]).not.toHaveProperty("email");
    expect(foreignResponse.status).toBe(404);
    expect(aggregate.map(item => item.id)).toEqual([clientA.id]);
    expect(aggregate[0]).not.toHaveProperty("tgBotToken");
  });

  it("with-partner endpoint enforces ownership and redacts both objects", async () => {
    const headers = actorHeaders("client", { clientId: clientA.id });
    const ownResponse = await fetch(`${baseUrl}/api/clients/${clientA.id}/with-partner`, { headers });
    const own = await ownResponse.json() as Record<string, unknown>;
    const foreignResponse = await fetch(`${baseUrl}/api/clients/${clientB.id}/with-partner`, { headers });

    expect(ownResponse.status).toBe(200);
    expect(own).not.toHaveProperty("tgBotToken");
    expect(own).not.toHaveProperty("tgChatId");
    expect(own.partner).toEqual({
      id: partnerA.id,
      name: partnerA.name,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
    expect(own.partner).not.toHaveProperty("commissionRate");
    expect(foreignResponse.status).toBe(404);
  });

  it("client can read only a linked partner and never its internal terms", async () => {
    const headers = actorHeaders("client", { clientId: clientA.id });
    const linkedResponse = await fetch(`${baseUrl}/api/partners/${partnerA.id}`, { headers });
    const linked = await linkedResponse.json() as Record<string, unknown>;
    const foreignResponse = await fetch(`${baseUrl}/api/partners/${partnerB.id}`, { headers });

    expect(linkedResponse.status).toBe(200);
    expect(linked).toEqual({ id: partnerA.id, name: partnerA.name, createdAt: now.toISOString(), updatedAt: now.toISOString() });
    expect(linked).not.toHaveProperty("commissionRate");
    expect(linked).not.toHaveProperty("email");
    expect(foreignResponse.status).toBe(404);
  });

  it("partner-clients endpoint returns only the client's own row to a client", async () => {
    storageMock.getPartnerClients.mockResolvedValue([clientA, clientB]);
    const response = await fetch(`${baseUrl}/api/partners/${partnerA.id}/clients`, {
      headers: actorHeaders("client", { clientId: clientA.id }),
    });
    const body = await response.json() as Array<Record<string, unknown>>;

    expect(response.status).toBe(200);
    expect(body.map(item => item.id)).toEqual([clientA.id]);
    expect(storageMock.getPartnerClients).not.toHaveBeenCalled();
    expect(body[0]).not.toHaveProperty("tgBotToken");
  });

  it("partner cannot enumerate another partner's client list", async () => {
    const response = await fetch(`${baseUrl}/api/partners/${partnerB.id}/clients`, {
      headers: actorHeaders("partner", { partnerId: partnerA.id }),
    });
    expect(response.status).toBe(404);
    expect(storageMock.getPartnerClients).not.toHaveBeenCalled();
  });
});

describe("Telegram secret redaction", () => {
  it("redacts the token from update response and audit log", async () => {
    const response = await fetch(`${baseUrl}/api/clients/${clientA.id}`, {
      method: "PATCH",
      headers: {
        ...actorHeaders("admin"),
        "content-type": "application/json",
      },
      body: JSON.stringify({ name: clientA.name, tgBotToken: "rotated-secret" }),
    });
    const body = await response.json();
    const auditEntry = storageMock.logAssistantAction.mock.calls[0][0];

    expect(response.status).toBe(200);
    expect(body.hasTgBotToken).toBe(true);
    expect(body).not.toHaveProperty("tgBotToken");
    expect(auditEntry.details).not.toContain("rotated-secret");
    expect(auditEntry.details).toContain("[REDACTED]");
  });

  it("does not leak a nested client token through invoice projection", () => {
    const projected = projectInvoiceForRole({
      id: "invoice-1",
      invoiceNumber: "INV-1",
      client: clientA,
    }, "admin");

    expect(projected.client.hasTgBotToken).toBe(true);
    expect(projected.client).not.toHaveProperty("tgBotToken");
  });
});


it("partner payments require a role and an explicit partner scope", async () => {
  storageMock.getPartnerPayments.mockResolvedValue([]);
  expect((await fetch(`${baseUrl}/api/partner-payments`, { headers: actorHeaders('client', { clientId: clientA.id }) })).status).toBe(403);
  expect((await fetch(`${baseUrl}/api/partner-payments`, { headers: actorHeaders('partner') })).status).toBe(403);
  expect((await fetch(`${baseUrl}/api/partner-payments`, { headers: actorHeaders('admin') })).status).toBe(400);
  expect((await fetch(`${baseUrl}/api/partner-payments?partnerId=${partnerB.id}`, { headers: actorHeaders('partner', { partnerId: partnerA.id }) })).status).toBe(200);
  expect(storageMock.getPartnerPayments).toHaveBeenCalledWith(partnerA.id);
});
