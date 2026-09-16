import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { CONFIGURATION_GUIDES, connectorPhases, type InventoryEntry } from './workflows.js'
import { CONFIG_API_URL, PHASE_COPY } from './api.js'
import { ImportPanel } from './ImportPanel.js'

/** 资料源配置页：按卡片填写并保存到本机 .env，对话导入卡额外带上传区。 */
export function ConfigurationPanel({ inventory, state, onNotice }: {
  inventory: readonly InventoryEntry[]
  state: 'loading' | 'ready' | 'error'
  onNotice: (message: string) => void
}): ReactNode {
  const defaultGuide = CONFIGURATION_GUIDES[0]!
  const [selectedId, setSelectedId] = useState(defaultGuide.id)
  const [copyNotice, setCopyNotice] = useState('')
  const [values, setValues] = useState<Record<string, string>>({})
  const [cleared, setCleared] = useState<readonly string[]>([])
  const [configured, setConfigured] = useState<Record<string, boolean>>({})
  // 非密钥开关项由服务端回显实际值，下拉据此选中当前状态
  const [current, setCurrent] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const phases = useMemo(() => connectorPhases(inventory), [inventory])
  const guide = CONFIGURATION_GUIDES.find((item) => item.id === selectedId) ?? defaultGuide
  const phase = state === 'ready' ? phases[guide.connectorId] : state === 'error' ? 'failed' : 'loading'
  // 无密钥字段的资料源（如对话导入）不应显示凭据相关措辞
  const hasSecret = guide.fields.some((field) => field.secret)

  const refreshConfiguration = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch(`${CONFIG_API_URL}/status`, { cache: 'no-store' })
      const body = await response.json() as { ok?: boolean; configured?: Record<string, boolean>; values?: Record<string, string> }
      if (!response.ok || !body.ok || !body.configured) throw new Error('本机配置服务不可用。请通过 npm start 启动。')
      setConfigured(body.configured)
      if (body.values) setCurrent(body.values)
    } catch (error) {
      const message = error instanceof Error ? error.message : '无法读取本机配置状态。'
      onNotice(message)
    }
  }, [onNotice])

  useEffect(() => { void refreshConfiguration() }, [refreshConfiguration])

  const saveConfiguration = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    const entries = guide.fields
      .map((field) => [field.key, cleared.includes(field.key) ? '' : (field.secret ? values[field.key] ?? '' : values[field.key]?.trim() ?? '')] as const)
      .filter(([key, value]) => value.length > 0 || cleared.includes(key))
    if (!entries.length) {
      setCopyNotice('请先填写至少一个配置项；留空的字段会保留现有值。')
      return
    }
    setSaving(true)
    try {
      const response = await fetch(CONFIG_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: Object.fromEntries(entries) }),
      })
      const body = await response.json() as { ok?: boolean; configured?: Record<string, boolean>; values?: Record<string, string>; error?: string }
      if (!response.ok || !body.ok || !body.configured) throw new Error(body.error ?? '保存失败。')
      setConfigured(body.configured)
      if (body.values) setCurrent(body.values)
      setValues({})
      setCleared([])
      const message = '配置已保存；重启后生效。'
      setCopyNotice(message)
      onNotice(message)
    } catch (error) {
      const message = error instanceof Error ? error.message : '保存失败。'
      setCopyNotice(message)
      onNotice(message)
    } finally {
      setSaving(false)
    }
  }

  return <section className="xunji-config-panel" aria-label="资料源图形化配置" data-xunji-configuration-panel>
    <div className="xunji-config-panel__intro">
      <div><strong>配置资料源</strong><span>配置与导入文件只保存在本机</span></div>
      <span className="xunji-config-panel__safe">不写入浏览器</span>
    </div>
    <div className="xunji-config-panel__tabs" role="tablist" aria-label="选择资料源">
      {CONFIGURATION_GUIDES.map((item) => <button
        key={item.id}
        type="button"
        role="tab"
        aria-selected={item.id === guide.id}
        data-active={item.id === guide.id || undefined}
        onClick={() => { setSelectedId(item.id); setCopyNotice(''); setValues({}); setCleared([]) }}
      >{item.label}</button>)}
    </div>
    <div className="xunji-config-panel__card" role="tabpanel">
      <div className="xunji-config-panel__heading">
        <div><h3>{guide.label}</h3><p>{guide.description}</p></div>
        <span className="xunji-connection__phase" data-phase={phase}><i/>{PHASE_COPY[phase]}</span>
      </div>
      <div className="xunji-config-panel__permission"><span>权限范围</span><strong>只读</strong><p>{guide.readOnlyScope}</p></div>
      <div className="xunji-config-panel__field">
        <span>本机 .env 已配置的变量</span>
        <div className="xunji-config-panel__variables">{guide.variables.map((variable) => <code key={variable}>{variable}</code>)}</div>
      </div>
      <form className="xunji-config-panel__form" onSubmit={(event) => void saveConfiguration(event)}>
        <div className="xunji-config-panel__form-title"><span>直接填写并保存</span><em>{hasSecret ? '不会回显已有密钥' : '无需密钥'}</em></div>
        {guide.fields.map((field) => <label className="xunji-config-panel__input" key={field.key}>
          <span>{field.label}{field.optional ? '（可选）' : ''}<i data-configured={configured[field.key] || undefined}>{configured[field.key] ? '已保存' : '未设置'}</i></span>
          {field.choices
            ? <select
              value={values[field.key] ?? current[field.key] ?? ''}
              onChange={(event) => setValues((entries) => ({ ...entries, [field.key]: event.target.value }))}
            >
              <option value="" disabled>请选择</option>
              {field.choices.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
            </select>
            : <input
              type={field.secret ? 'password' : 'text'}
              autoComplete="off"
              placeholder={field.placeholder}
              value={values[field.key] ?? ''}
              onChange={(event) => { setValues((current) => ({ ...current, [field.key]: event.target.value })); setCleared((keys) => keys.filter((key) => key !== field.key)) }}
            />}
          {!field.choices && configured[field.key] && <button className="xunji-config-panel__clear" type="button" disabled={saving} onClick={() => { setValues((current) => ({ ...current, [field.key]: '' })); setCleared((keys) => [...new Set([...keys, field.key])]) }}>{cleared.includes(field.key) ? '保存后清除' : '清除此项'}</button>}
        </label>)}
        <button type="submit" disabled={saving}>{saving ? '正在保存…' : '保存到本机 .env'}</button>
      </form>
      {guide.id === 'chat-import' ? <ImportPanel onNotice={onNotice}/> : null}
      <div className="xunji-config-panel__help">
        <strong>{hasSecret ? '如何获取凭据' : '使用步骤'}</strong>
        <ol>{guide.help.steps.map((step) => <li key={step}>{step}</li>)}</ol>
        <a href={guide.help.href} target="_blank" rel="noreferrer">{guide.help.label} ↗</a>
      </div>
      <p className="xunji-config-panel__unified">{guide.id === 'chat-import'
        ? '启用开关改动需重启生效；启用后新上传的对话文件即时可检索，无需重启。'
        : '保存并重启后，会自动启用已配置资料源并按提问内容检索。'}</p>
      {copyNotice ? <p className="xunji-config-panel__notice" role="status">{copyNotice}</p> : null}
    </div>
  </section>
}
