-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "steamId" TEXT NOT NULL,
    "personaName" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "cs2Hours" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ServerSlot" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "pterodactylId" INTEGER,
    "identifier" TEXT,
    "status" TEXT NOT NULL DEFAULT 'free',
    "purpose" TEXT NOT NULL DEFAULT 'pool',
    "mode" TEXT,
    "allocationHost" TEXT,
    "allocationPort" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServerSlot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Lobby" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "visibility" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "map" TEXT NOT NULL,
    "slots" INTEGER NOT NULL,
    "password" TEXT,
    "maxPing" INTEGER,
    "minHours" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'waiting',
    "inviteCode" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "serverSlotId" TEXT,
    "connectHost" TEXT,
    "connectPort" INTEGER,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "Lobby_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LobbyMember" (
    "id" TEXT NOT NULL,
    "lobbyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pingMs" INTEGER,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LobbyMember_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LobbyMessage" (
    "id" TEXT NOT NULL,
    "lobbyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LobbyMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_steamId_key" ON "User"("steamId");
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");
CREATE UNIQUE INDEX "ServerSlot_identifier_key" ON "ServerSlot"("identifier");
CREATE UNIQUE INDEX "Lobby_inviteCode_key" ON "Lobby"("inviteCode");
CREATE UNIQUE INDEX "Lobby_serverSlotId_key" ON "Lobby"("serverSlotId");
CREATE UNIQUE INDEX "LobbyMember_lobbyId_userId_key" ON "LobbyMember"("lobbyId", "userId");

ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Lobby" ADD CONSTRAINT "Lobby_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Lobby" ADD CONSTRAINT "Lobby_serverSlotId_fkey" FOREIGN KEY ("serverSlotId") REFERENCES "ServerSlot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LobbyMember" ADD CONSTRAINT "LobbyMember_lobbyId_fkey" FOREIGN KEY ("lobbyId") REFERENCES "Lobby"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LobbyMember" ADD CONSTRAINT "LobbyMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LobbyMessage" ADD CONSTRAINT "LobbyMessage_lobbyId_fkey" FOREIGN KEY ("lobbyId") REFERENCES "Lobby"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LobbyMessage" ADD CONSTRAINT "LobbyMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
