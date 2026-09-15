export function searchTokens(value) {
  const found = new Set()
  for (const chunk of String(value).toLocaleLowerCase().match(/\p{Script=Han}+|[a-z0-9_/-]{2,}/gu) ?? []) {
    if (/^\p{Script=Han}+$/u.test(chunk)) {
      if (chunk.length <= 24) found.add(chunk)
      for (let size = 2; size <= Math.min(4, chunk.length); size += 1) {
        for (let index = 0; index <= chunk.length - size; index += 1) found.add(chunk.slice(index, index + size))
      }
    } else found.add(chunk)
  }
  return [...found]
}

export function matchedPositions(haystack, terms) {
  return terms.map((term) => haystack.indexOf(term)).filter((position) => position >= 0)
}
