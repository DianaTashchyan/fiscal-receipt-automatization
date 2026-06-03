import { NextResponse } from 'next/server'
import { ZodError } from 'zod'

export type ApiSuccess<T> = {
  success: true
  data: T
}

export type ApiError = {
  success: false
  error: string
  details?: unknown
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError

export function ok<T>(data: T, status = 200): NextResponse<ApiSuccess<T>> {
  return NextResponse.json({ success: true, data }, { status })
}

export function created<T>(data: T): NextResponse<ApiSuccess<T>> {
  return ok(data, 201)
}

export function accepted<T>(data: T): NextResponse<ApiSuccess<T>> {
  return ok(data, 202)
}

export function badRequest(error: string, details?: unknown): NextResponse<ApiError> {
  return NextResponse.json({ success: false, error, details }, { status: 400 })
}

export function unauthorized(error = 'Unauthorized'): NextResponse<ApiError> {
  return NextResponse.json({ success: false, error }, { status: 401 })
}

export function forbidden(error = 'Forbidden'): NextResponse<ApiError> {
  return NextResponse.json({ success: false, error }, { status: 403 })
}

export function notFound(error = 'Not found'): NextResponse<ApiError> {
  return NextResponse.json({ success: false, error }, { status: 404 })
}

export function conflict(error: string): NextResponse<ApiError> {
  return NextResponse.json({ success: false, error }, { status: 409 })
}

export function serverError(error = 'Internal server error'): NextResponse<ApiError> {
  return NextResponse.json({ success: false, error }, { status: 500 })
}

export function validationError(err: ZodError): NextResponse<ApiError> {
  return badRequest('Validation failed', err.flatten().fieldErrors)
}

export function handleRouteError(err: unknown): NextResponse<ApiError> {
  console.error('[API Error]', err)

  if (err instanceof ZodError) return validationError(err)

  if (isPrismaError(err, 'P2002')) {
    return conflict('A record with this data already exists')
  }

  if (isPrismaError(err, 'P2025')) {
    return notFound()
  }

  return serverError()
}

function isPrismaError(err: unknown, code: string): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: string }).code === code
  )
}
