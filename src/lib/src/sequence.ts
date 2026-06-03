// ============================================================
// src/lib/src/sequence.ts
// Persistent, concurrency-safe SRC `seq` management (manual §4).
//
// SRC requires that every seq-bearing request in a CRN's session use a value
// strictly greater than the previous one. We persist the last value per CRN in
// the SrcSequence table and bump it atomically inside a serializable-ish
// transaction so two concurrent requests can never reuse the same seq.
// The counter is never reset on restart (it lives in the database).
// ============================================================

import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma/client";

/**
 * Atomically reserve and return the next seq for a CRN.
 *
 * Implemented as a single upsert-then-read inside a transaction. We use a raw
 * upsert with an arithmetic increment so the read-modify-write is done by the
 * database, not in JS, eliminating the race entirely.
 */
export async function nextSeq(crn: string): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ lastSeq: bigint }>>(Prisma.sql`
    INSERT INTO "SrcSequence" ("crn", "lastSeq", "updatedAt")
    VALUES (${crn}, 1, NOW())
    ON CONFLICT ("crn")
    DO UPDATE SET "lastSeq" = "SrcSequence"."lastSeq" + 1, "updatedAt" = NOW()
    RETURNING "lastSeq";
  `);

  const value = rows[0]?.lastSeq;
  if (value === undefined) {
    throw new Error(`Failed to reserve seq for CRN ${crn}`);
  }
  return Number(value);
}

/** Peek the last used seq without incrementing (diagnostics only). */
export async function peekSeq(crn: string): Promise<number> {
  const row = await prisma.srcSequence.findUnique({ where: { crn } });
  return row ? Number(row.lastSeq) : 0;
}

/**
 * Seed the counter to match what SRC already has (e.g. you printed receipts
 * from another system first). Sets lastSeq so the NEXT nextSeq() returns
 * value+1.
 */
export async function setSeq(crn: string, value: number): Promise<void> {
  await prisma.srcSequence.upsert({
    where: { crn },
    create: { crn, lastSeq: BigInt(value) },
    update: { lastSeq: BigInt(value) },
  });
}
