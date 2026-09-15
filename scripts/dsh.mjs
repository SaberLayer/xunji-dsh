import { runDsh } from './common.mjs'

const args = process.argv.slice(2)
const staging = args.includes('--staging')
const forwarded = args.filter((arg) => arg !== '--staging')

await runDsh(forwarded, { staging })
