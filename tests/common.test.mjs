import test from 'node:test'
import assert from 'node:assert/strict'
import { compareVersion, mergeAllowBuilds, parseVersion, validateFeatures, versions } from '../scripts/common.mjs'

test('默认不安装宠物', () => {
  assert.equal(versions.pets.default, 'none')
})

test('解析并比较 Node 版本', () => {
  assert.deepEqual(parseVersion('22.19.0'), [22, 19, 0])
  assert.equal(compareVersion('22.19.0', '22.19.0'), 0)
  assert.equal(compareVersion('24.0.0', '22.19.0'), 1)
  assert.equal(compareVersion('22.17.1', '22.19.0'), -1)
})

test('拒绝未知企业能力', () => {
  assert.throws(() => validateFeatures(['unknown']), /未知能力/)
})

test('未启用企业能力时不要求任何密钥', () => {
  assert.deepEqual(validateFeatures([]), [])
})

test('为 Profile 幂等追加 Git 插件构建白名单', () => {
  const key = 'harness-pet@https://example.test/archive'
  const once = mergeAllowBuilds('packages:\n  - .\n', [key])
  const twice = mergeAllowBuilds(once, [key])
  assert.match(once, /allowBuilds:/)
  assert.equal(once, twice)
  assert.equal(once.match(/harness-pet/g)?.length, 1)
})
