const ISO_TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|([+-])(\d{2}):(\d{2}))$/i

export function parseScheduledTimestamp(value: unknown): Date | string {
  if (typeof value !== 'string') {
    return 'scheduledAt must be an ISO timestamp with a timezone'
  }

  const match = ISO_TIMESTAMP_PATTERN.exec(value)
  if (!match) return 'scheduledAt must be an ISO timestamp with a timezone'

  const [, yearText, monthText, dayText, hourText, minuteText, secondText, fraction, zone, sign, offsetHourText, offsetMinuteText] = match
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const hour = Number(hourText)
  const minute = Number(minuteText)
  const second = Number(secondText)
  const offsetHour = Number(offsetHourText ?? 0)
  const offsetMinute = Number(offsetMinuteText ?? 0)

  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth[month - 1]! ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    offsetHour > 14 ||
    offsetMinute > 59 ||
    (offsetHour === 14 && offsetMinute !== 0)
  ) {
    return 'scheduledAt must be a valid timestamp'
  }

  const milliseconds = Number((fraction ?? '').slice(0, 3).padEnd(3, '0'))
  const localDate = new Date(0)
  localDate.setUTCHours(hour, minute, second, milliseconds)
  localDate.setUTCFullYear(year, month - 1, day)

  const offsetDirection = sign === '+' ? 1 : sign === '-' ? -1 : 0
  const offsetMilliseconds = offsetDirection * (offsetHour * 60 + offsetMinute) * 60_000
  const instant = new Date(localDate.getTime() - offsetMilliseconds)
  return Number.isNaN(instant.getTime())
    ? 'scheduledAt must be a valid timestamp'
    : instant
}

export function isJoinWindowOpen(
  scheduledAt: Date,
  durationMinutes: number,
  now: Date,
): boolean {
  const start = scheduledAt.getTime()
  const end = start + durationMinutes * 60_000
  return now.getTime() >= start - 15 * 60_000 && now.getTime() < end
}
