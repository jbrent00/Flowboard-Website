type EmailAddress = {
  emailAddress: string
  verification?: { status: string } | null
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

export function verifiedEmailKeys(addresses: EmailAddress[]) {
  const keys = new Set<string>()
  for (const address of addresses) {
    if (address.verification?.status !== 'verified') continue
    const key = normalizeEmail(address.emailAddress)
    if (key) keys.add(key)
  }
  return [...keys]
}
