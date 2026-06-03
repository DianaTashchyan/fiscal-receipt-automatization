import { NextRequest } from 'next/server'
import { createHash, randomBytes } from 'crypto'
import prisma from '@/lib/prisma/client'
import { verifyToken, extractBearerToken, JwtPayload } from '@/lib/utils/jwt'
import { UserRole } from '@prisma/client'
import { unauthorized, forbidden } from '@/lib/utils/api-response'

export async function requireAuth(req: NextRequest): Promise<JwtPayload> {
  const token = extractBearerToken(req.headers.get('authorization'))
  if (!token) throw unauthorized()

  try {
    return await verifyToken(token)
  } catch {
    throw unauthorized('Invalid or expired token')
  }
}

export async function requireAdmin(req: NextRequest): Promise<JwtPayload> {
  const payload = await requireAuth(req)
  if (payload.role !== UserRole.ADMIN) throw forbidden('Admin access required')
  return payload
}

export async function requireRestaurantAccess(
  req: NextRequest,
  restaurantId: string
): Promise<JwtPayload> {
  const payload = await requireAuth(req)

  if (payload.role === UserRole.ADMIN) return payload

  const link = await prisma.userRestaurant.findUnique({
    where: { userId_restaurantId: { userId: payload.sub, restaurantId } },
  })

  if (!link) throw forbidden('You do not have access to this restaurant')

  return payload
}

export async function requireApiKey(req: NextRequest): Promise<string> {
  const rawKey = req.headers.get('x-api-key')
  if (!rawKey) throw unauthorized('Missing X-Api-Key header')

  const keyHash = hashApiKey(rawKey)

  const apiKey = await prisma.restaurantApiKey.findUnique({
    where: { keyHash },
    select: { id: true, restaurantId: true, isActive: true },
  })

  if (!apiKey || !apiKey.isActive) throw unauthorized('Invalid or inactive API key')

  prisma.restaurantApiKey
    .update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } })
    .catch(console.error)

  return apiKey.restaurantId
}

export function hashApiKey(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex')
}

export function generateApiKey(): string {
  return `frk_${randomBytes(32).toString('hex')}`
}
