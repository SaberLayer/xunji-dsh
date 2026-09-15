import { readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

/** 检查程序目录的每一层，包括空目录；第三方依赖只检查运行期缓存。 */
export function forbiddenArtifactPaths(root, forbiddenNames) {
  const problems = []
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name)
      const path = relative(root, absolute).replaceAll('\\', '/')
      const normalized = `/${path.toLowerCase()}/`
      if (forbiddenNames.some((name) => normalized.includes(`/${name.toLowerCase()}/`))) {
        problems.push(path)
        continue
      }
      if (entry.isSymbolicLink()) {
        problems.push(`${path}（产物不允许符号链接）`)
        continue
      }
      if (!entry.isDirectory() || path === 'runtime') continue
      if (path === 'app/node_modules') {
        if (readdirSync(absolute).some((name) => name.toLowerCase() === '.cache')) problems.push(`${path}/.cache`)
        continue
      }
      walk(absolute)
    }
  }
  walk(root)
  return problems
}
