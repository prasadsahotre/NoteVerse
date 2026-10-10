const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/

export function parseOptionalYoutubeVideoId(value: unknown): {
  provided: boolean
  valid: boolean
  videoId?: string | null
} {
  if (value === undefined) return { provided: false, valid: true }
  if (value === null) return { provided: true, valid: true, videoId: null }
  if (typeof value !== 'string') return { provided: true, valid: false }
  if (!value.trim()) return { provided: true, valid: true, videoId: null }

  const videoId = parseYoutubeVideoId(value)
  return { provided: true, valid: videoId !== null, videoId }
}

export function parseYoutubeVideoId(value: string): string | null {
  try {
    const trimmedValue = value.trim()
    const candidate = /^[a-z0-9.-]+\//i.test(trimmedValue)
      ? `https://${trimmedValue}`
      : trimmedValue
    const url = new URL(candidate)

    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.port
    ) {
      return null
    }

    const hostname = url.hostname.toLowerCase()
    let videoId: string | null = null

    if (hostname === 'youtu.be') {
      const segments = url.pathname.split('/').filter(Boolean)
      if (segments.length === 1) videoId = segments[0]
    } else if (
      hostname === 'youtube.com' ||
      hostname === 'www.youtube.com' ||
      hostname === 'm.youtube.com'
    ) {
      if (url.pathname === '/watch') {
        const ids = url.searchParams.getAll('v')
        if (ids.length === 1) videoId = ids[0]
      } else {
        const match = url.pathname.match(/^\/(embed|shorts)\/([^/]+)\/?$/)
        if (match) videoId = match[2]
      }
    }

    return videoId && VIDEO_ID_PATTERN.test(videoId) ? videoId : null
  } catch {
    return null
  }
}
