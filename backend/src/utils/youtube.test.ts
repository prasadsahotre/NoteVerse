import assert from 'node:assert/strict'
import test from 'node:test'
import { parseOptionalYoutubeVideoId, parseYoutubeVideoId } from './youtube.js'

const videoId = 'dQw4w9WgXcQ'

test('parses supported YouTube URL formats', () => {
  for (const url of [
    `https://www.youtube.com/watch?v=${videoId}`,
    `https://youtu.be/${videoId}`,
    `https://www.youtube.com/embed/${videoId}`,
    `https://www.youtube.com/shorts/${videoId}`,
    `youtube.com/watch?v=${videoId}`,
  ]) {
    assert.equal(parseYoutubeVideoId(url), videoId, url)
  }
})

test('rejects unrelated hosts, malformed URLs, and invalid video IDs', () => {
  for (const url of [
    `https://example.com/watch?v=${videoId}`,
    `https://youtube.com.evil.example/watch?v=${videoId}`,
    `https://youtube-nocookie.com/embed/${videoId}`,
    `https://youtube.com/watch?v=short`,
    `https://youtu.be/${videoId}/extra`,
    `not a URL`,
    `http://youtube.com/watch?v=${videoId}`,
  ]) {
    assert.equal(parseYoutubeVideoId(url), null, url)
  }
})

test('distinguishes an omitted video field from clearing it', () => {
  assert.deepEqual(parseOptionalYoutubeVideoId(undefined), {
    provided: false,
    valid: true,
  })
  assert.deepEqual(parseOptionalYoutubeVideoId(null), {
    provided: true,
    valid: true,
    videoId: null,
  })
  assert.deepEqual(parseOptionalYoutubeVideoId('  '), {
    provided: true,
    valid: true,
    videoId: null,
  })
  assert.deepEqual(
    parseOptionalYoutubeVideoId(`https://youtu.be/${videoId}`),
    { provided: true, valid: true, videoId },
  )
})
