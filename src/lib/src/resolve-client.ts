// ============================================================
// src/lib/src/resolve-client.ts
// Resolves the correct ISrcClient for admin/direct SRC routes.
//
// The /api/src/* admin routes need to call SRC with the right cert.
// Priority:
//   1. restaurantId provided → look up restaurant.srcCertData/srcCertPath
//   2. Global env cert (SRC_CERT_PATH / SRC_CERT_PASSWORD)
//   3. Mock client (when TAX_API_MODE=mock)
//
// Receipt fiscalization uses getRestaurantSrcClient() directly (separate path).
// ============================================================

import prisma from "@/lib/prisma/client";
import { getSrcMode, resolveRestaurantCertConfig } from "./config";
import { getSrcClient, getRestaurantSrcClient } from "./client";
import { ISrcClient } from "./types";

/**
 * Resolve the SRC client for a direct admin API call.
 * Pass restaurantId when the caller knows which restaurant's cert to use.
 * Falls back to global env cert if restaurantId is not given or the restaurant
 * has no stored cert.
 */
export async function resolveAdminSrcClient(
  restaurantId?: string | null
): Promise<ISrcClient> {
  if (getSrcMode() !== "src_real") {
    return getSrcClient(); // mock — cert doesn't matter
  }

  if (restaurantId) {
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        id: true,
        tin: true,
        crn: true,
        srcCertData: true,
        srcCertPassword: true,
        srcCertPath: true,
        srcPrivateKeyEnc: true,
      },
    });

    if (
      restaurant &&
      (restaurant.srcCertData || restaurant.srcCertPath)
    ) {
      const certConfig = resolveRestaurantCertConfig(restaurant);
      return getRestaurantSrcClient(restaurant.id, certConfig);
    }
  }

  // Fall back to global env cert (throws SrcConfigError if not configured)
  return getSrcClient();
}
