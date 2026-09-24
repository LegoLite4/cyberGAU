const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const base = "http://127.0.0.1:4000";

async function main() {
  const owner = await prisma.user.create({
    data: { steamId: "76561198000000001", personaName: "Owner", cs2Hours: 400 },
  });
  const guest = await prisma.user.create({
    data: { steamId: "76561198000000002", personaName: "Guest", cs2Hours: 2 },
  });
  const ownerToken = "owner-token";
  const guestToken = "guest-token";
  const expiresAt = new Date(Date.now() + 86400000);
  await prisma.session.createMany({
    data: [
      { token: ownerToken, userId: owner.id, expiresAt },
      { token: guestToken, userId: guest.id, expiresAt },
    ],
  });

  async function call(path, token, options = {}) {
    const response = await fetch(base + path, {
      ...options,
      headers: {
        ...(options.body ? { "content-type": "application/json" } : {}),
        ...(token ? { cookie: `cybergau_session=${token}` } : {}),
        ...(options.headers || {}),
      },
    });
    const text = await response.text();
    let body;
    try { body = JSON.parse(text); } catch { body = text; }
    return { status: response.status, body };
  }

  const health = await call("/health");
  const created = await call("/lobbies", ownerToken, {
    method: "POST",
    body: JSON.stringify({
      title: "Вечерний мираж",
      visibility: "password",
      format: "5v5",
      map: "de_mirage",
      slots: 10,
      password: "secret",
      maxPing: 150,
      minHours: 10,
    }),
  });
  const id = created.body.id;
  const list = await call("/lobbies");
  const badJoin = await call(`/lobbies/${id}/join`, guestToken, {
    method: "POST",
    body: JSON.stringify({ password: "secret", pingMs: 40 }),
  });
  const goodHours = await prisma.user.update({ where: { id: guest.id }, data: { cs2Hours: 20 } });
  const join = await call(`/lobbies/${id}/join`, guestToken, {
    method: "POST",
    body: JSON.stringify({ password: "secret", pingMs: 40 }),
  });
  const chat = await call(`/lobbies/${id}/messages`, ownerToken, {
    method: "POST",
    body: JSON.stringify({ body: "го на мир" }),
  });
  const started = await call(`/lobbies/${id}/start`, ownerToken, { method: "POST" });
  const modes = await call("/modes");
  const modeBusy = await call("/modes/dm/start", ownerToken, { method: "POST" });
  await call(`/lobbies/${id}/stop`, ownerToken, { method: "POST" });
  const mode = await call("/modes/dm/start", ownerToken, { method: "POST" });
  const profile = await call("/profile", ownerToken);
  const hidden = await call("/lobbies", ownerToken, {
    method: "POST",
    body: JSON.stringify({
      title: "Секрет",
      visibility: "private",
      format: "1v1",
      map: "de_dust2",
    }),
  });
  const publicList = await call("/lobbies");
  const invite = await call(`/invites/${hidden.body.inviteCode}`);

  const report = {
    health: health.status,
    created: created.status,
    listed: list.body.lobbies?.some((lobby) => lobby.id === id),
    hoursRejected: badJoin.status,
    hoursRejectedMessage: badJoin.body.error,
    joined: join.status,
    members: join.body.members?.length,
    chat: chat.status,
    connect: started.body.connect,
    startError: started.body.error,
    modeNames: modes.body.modes?.map((mode) => mode.id),
    modeWhileBusy: modeBusy.body.error,
    modeConnect: mode.body.connect,
    history: profile.body.history?.length,
    hiddenVisible: publicList.body.lobbies?.some((lobby) => lobby.id === hidden.body.id),
    inviteTitle: invite.body.title,
    unused: goodHours.cs2Hours,
  };
  console.log(JSON.stringify(report, null, 2));
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
