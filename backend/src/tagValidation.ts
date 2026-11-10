const colors = ['slate', 'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple']

export function tagInput(body: unknown, partial: boolean) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  const input = body as Record<string, unknown>
  const keys = Object.keys(input)
  if (keys.length === 0 || keys.some((key) => key !== 'name' && key !== 'color')) return null
  if (!partial && (!('name' in input) || !('color' in input))) return null

  const changes: { name?: string; normalizedName?: string; color?: string } = {}
  if ('name' in input) {
    if (typeof input.name !== 'string') return null
    const name = input.name.trim()
    if (!name || name.length > 24) return null
    changes.name = name
    changes.normalizedName = name.toLowerCase()
  }
  if ('color' in input) {
    if (typeof input.color !== 'string' || !colors.includes(input.color)) return null
    changes.color = input.color
  }
  return changes
}

export function parseTagIds(value: unknown): number[] | null {
  if (!Array.isArray(value) || !value.every((id) => Number.isSafeInteger(id) && id > 0 && id <= 2147483647) ||
      new Set(value).size !== value.length) return null
  return value
}
