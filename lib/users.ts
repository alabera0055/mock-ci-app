import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export interface User {
  id: string
  name: string
  email: string
  passwordHash: string
  salt: string
  createdAt: string
  failedLogins?: number
  lockedUntil?: number
}

export type LoginResult = { ok: true; user: User } | { ok: false; locked: boolean }

const MAX_FAILED_LOGINS = 5
const LOCK_MS = 60 * 1000
const KEY_LENGTH = 64

// MOCKCI_DATA_DIR lets the checks use a throwaway folder.
const dataDir = () => process.env.MOCKCI_DATA_DIR || join(process.cwd(), 'data')
const usersFile = () => join(dataDir(), 'users.json')

// ponytail: whole-file read and write, fine for one dev server; needs a lock if several processes write at once.
function readUsers(): User[] {
  const file = usersFile()

  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as User[]) : []
}

function writeUsers(users: User[]): void {
  const file = usersFile()
  const temp = `${file}.${process.pid}.tmp`

  mkdirSync(dataDir(), { recursive: true })

  // Rename is atomic, so a crash mid-write never leaves a half-written file.
  writeFileSync(temp, JSON.stringify(users, null, 2))
  renameSync(temp, file)
}

export const normalizeEmail = (email: string) => email.trim().toLowerCase()

const hashPassword = (password: string, salt: string) => scryptSync(password, salt, KEY_LENGTH)

function setPassword(user: User, password: string): void {
  user.salt = randomBytes(16).toString('hex')
  user.passwordHash = hashPassword(password, user.salt).toString('hex')
}

export function findUserByEmail(email: string): User | undefined {
  const wanted = normalizeEmail(email)

  return readUsers().find(user => user.email === wanted)
}

export function findUserById(id: string | null | undefined): User | undefined {
  return id ? readUsers().find(user => user.id === id) : undefined
}

/** Returns null when the email already has an account. */
export function createUser(name: string, email: string, password: string): User | null {
  const users = readUsers()
  const normalized = normalizeEmail(email)

  if (users.some(user => user.email === normalized)) return null

  const user: User = {
    id: randomUUID(),
    name: name.trim(),
    email: normalized,
    passwordHash: '',
    salt: '',
    createdAt: new Date().toISOString()
  }

  setPassword(user, password)
  users.push(user)
  writeUsers(users)

  return user
}

export function checkLogin(email: string, password: string, now = Date.now()): LoginResult {
  const users = readUsers()
  const wanted = normalizeEmail(email)
  const user = users.find(item => item.email === wanted)

  if (!user) {
    // Same hashing work as a real check, so the answer time doesn't show which emails exist.
    hashPassword(password, 'no-such-user')

    return { ok: false, locked: false }
  }

  if (user.lockedUntil && user.lockedUntil > now) return { ok: false, locked: true }

  if (timingSafeEqual(hashPassword(password, user.salt), Buffer.from(user.passwordHash, 'hex'))) {
    delete user.failedLogins
    delete user.lockedUntil
    writeUsers(users)

    return { ok: true, user }
  }

  user.failedLogins = (user.failedLogins ?? 0) + 1

  if (user.failedLogins >= MAX_FAILED_LOGINS) {
    user.failedLogins = 0
    user.lockedUntil = now + LOCK_MS
  }

  writeUsers(users)

  return { ok: false, locked: Boolean(user.lockedUntil && user.lockedUntil > now) }
}
