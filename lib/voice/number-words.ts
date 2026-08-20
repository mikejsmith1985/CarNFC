// Turns a number the way a person says it back into digits a form field can hold.
//
// Phone dictation is inconsistent about this. The same reading comes back as
// "123400" on one handset and "one hundred twenty three thousand four hundred"
// on another, and the difference is not something the person under the vehicle
// should have to care about.
//
// Nothing here is a model or a service. It is a lookup table and an accumulator,
// so it runs on a dead phone in a garage with no signal.

const WORD_VALUES: Record<string, number> = {
  zero: 0,
  oh: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fourty: 40, // a common mis-transcription, and harmless to accept
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
}

/** Words that multiply what has been counted so far rather than adding to it. */
const SCALE_VALUES: Record<string, number> = {
  hundred: 100,
  thousand: 1000,
  million: 1_000_000,
}

/**
 * The scale at or above which a group is banked instead of multiplied.
 *
 * "Hundred" multiplies what is being counted — a hundred, then twenty, then
 * three, is still one group. "Thousand" ends that group and starts a new one,
 * which is what makes "one hundred twenty three thousand four hundred" add up
 * to 123400 rather than multiplying the whole lot together.
 */
const BANKING_SCALE = 1000

const DECIMAL_SEPARATOR_WORD = 'point'

/** Above this, a word is a quantity rather than a single digit after the point. */
const SINGLE_DIGIT_LIMIT = 10

/** Filler a person says around a number that carries no value of its own. */
const IGNORED_WORDS = new Set(['and', 'a', 'an', 'the'])

/**
 * Reads a spoken or typed number, or null when there is no number in it.
 *
 * Returns a string rather than a number because every consumer is a form field,
 * and a string keeps a trailing zero the person actually said.
 */
export function spokenToNumber(spoken: string): string | null {
  const cleaned = spoken.toLowerCase().replace(/[,$]/g, '').replace(/-/g, ' ').trim()

  if (cleaned === '') return null

  // A decimal that arrived as digits needs no interpretation at all.
  const digitDecimal = cleaned.match(/\b\d+\.\d+\b/)
  if (digitDecimal) return digitDecimal[0]

  const [wholeSpoken = '', ...fractionSpoken] = cleaned.split(
    new RegExp(`\\b${DECIMAL_SEPARATOR_WORD}\\b`),
  )

  const whole = accumulateNumber(tokenize(wholeSpoken))
  if (whole === null) return null

  if (fractionSpoken.length === 0) return String(whole)

  const fractionDigits = readDigitSequence(tokenize(fractionSpoken.join(' ')))
  if (fractionDigits === '') return String(whole)

  return `${whole}.${fractionDigits}`
}

function tokenize(text: string): string[] {
  return text
    .split(/\s+/)
    .map((token) => token.replace(/[^a-z0-9.]/g, ''))
    .filter((token) => token !== '' && !IGNORED_WORDS.has(token))
}

/**
 * Adds up a run of number words the way English composes them.
 *
 * "Twenty four" adds, "two hundred" multiplies what came before it, and
 * "thousand" banks the group so counting can start again — which is why the
 * total and the current group are tracked separately.
 */
function accumulateNumber(tokens: string[]): number | null {
  let total = 0
  let currentGroup = 0
  let hasSeenNumber = false

  for (const token of tokens) {
    if (/^\d+$/.test(token)) {
      currentGroup += Number(token)
      hasSeenNumber = true
      continue
    }

    const wordValue = WORD_VALUES[token]
    if (wordValue !== undefined) {
      currentGroup += wordValue
      hasSeenNumber = true
      continue
    }

    const scale = SCALE_VALUES[token]
    if (scale === undefined) continue // a unit the person said aloud; not a number

    hasSeenNumber = true
    if (scale >= BANKING_SCALE) {
      total += (currentGroup === 0 ? 1 : currentGroup) * scale
      currentGroup = 0
    } else {
      currentGroup = (currentGroup === 0 ? 1 : currentGroup) * scale
    }
  }

  if (!hasSeenNumber) return null
  return total + currentGroup
}

/** Reads the part after "point" digit by digit, because "five five" is .55 not .10. */
function readDigitSequence(tokens: string[]): string {
  let digits = ''

  for (const token of tokens) {
    if (/^\d+$/.test(token)) {
      digits += token
      continue
    }
    const wordValue = WORD_VALUES[token]
    if (wordValue !== undefined && wordValue < SINGLE_DIGIT_LIMIT) digits += String(wordValue)
  }

  return digits
}
