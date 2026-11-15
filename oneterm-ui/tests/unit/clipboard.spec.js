import Guacamole from 'guacamole-common-js'
import { shallowMount } from '@vue/test-utils'
import GuacamoleClient from '@/modules/oneterm/views/connect/guacamoleClient'
import DisplaySetting from '@/modules/oneterm/views/systemSettings/terminalDisplay/displaySetting'
import AccessControl from '@/modules/oneterm/views/systemSettings/accessControl'
import { defaultPreferenceSetting } from '@/modules/oneterm/views/systemSettings/terminalDisplay/constants'
import { getPreference, putPreference } from '@/modules/oneterm/api/preference'
import { getConfig, postConfig } from '@/modules/oneterm/api/config'

jest.mock('guacamole-common-js', () => ({
  StringReader: jest.fn(),
  StringWriter: jest.fn()
}))
jest.mock('@/modules/oneterm/views/connect/guacamoleClient/clipboardModal.vue', () => ({}))
jest.mock('@/modules/oneterm/views/connect/guacamoleClient/resolutionModal.vue', () => ({}))
jest.mock('@/modules/oneterm/views/connect/fileManagement/fileManagementDrawer.vue', () => ({}))
jest.mock('@/modules/oneterm/api/preference', () => ({ getPreference: jest.fn(), putPreference: jest.fn() }))
jest.mock('@/modules/oneterm/api/config', () => ({ getConfig: jest.fn(), postConfig: jest.fn() }))

describe('direct text clipboard', () => {
  let vm
  let writer
  let reader
  let paste

  beforeEach(() => {
    jest.clearAllMocks()
    writer = { sendText: jest.fn(), sendEnd: jest.fn() }
    reader = {}
    Guacamole.StringWriter.mockImplementation(() => writer)
    Guacamole.StringReader.mockImplementation(() => reader)
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true })
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        readText: jest.fn().mockResolvedValue('local text'),
        writeText: jest.fn().mockResolvedValue()
      }
    })
    Object.defineProperty(navigator, 'permissions', {
      configurable: true, value: { query: jest.fn().mockResolvedValue({ state: 'granted' }) }
    })
    vm = {
      ...GuacamoleClient.data(),
      ...GuacamoleClient.methods,
      directClipboard: true,
      clientState: 3,
      client: { createClipboardStream: jest.fn(), sendKeyEvent: jest.fn(), sendMouseState: jest.fn() },
      assetPermissions: { copy: true, paste: true },
      $route: { query: {} },
      $message: { warning: jest.fn() },
      $t: key => key,
      $copyText: jest.fn().mockResolvedValue(),
      $refs: { onetermGuacamoleRef: { contains: () => true } }
    }
    jest.spyOn(document, 'hasFocus').mockReturnValue(true)
    paste = {
      preventDefault: jest.fn(),
      stopPropagation: jest.fn(),
      clipboardData: { types: ['text/plain'], getData: jest.fn().mockReturnValue('local text') }
    }
  })

  afterEach(() => jest.restoreAllMocks())

  it('is off by default and disabled for monitors even when selected', () => {
    expect(defaultPreferenceSetting.settings.directClipboard).toBe(false)
    const context = { preferenceSetting: { settings: { directClipboard: true } }, $route: { query: {} } }
    expect(GuacamoleClient.computed.directClipboard.call(context)).toBe(true)
    context.$route.query.is_monitor = '1'
    expect(GuacamoleClient.computed.directClipboard.call(context)).toBe(false)
  })

  it('sends native paste text before the remote paste shortcut', () => {
    vm.handleDirectPaste(paste)
    expect(paste.preventDefault).toHaveBeenCalled()
    expect(writer.sendText).toHaveBeenCalledWith('local text')
    expect(writer.sendEnd).toHaveBeenCalled()
    expect(writer.sendEnd.mock.invocationCallOrder[0]).toBeLessThan(vm.client.sendKeyEvent.mock.invocationCallOrder[0])
    expect(vm.client.sendKeyEvent.mock.calls).toEqual([[1, 65507], [1, 118], [0, 118], [0, 65507]])
  })

  it('does not release a physically held Control key', () => {
    vm.keyboard = { pressed: { 65507: true } }
    vm.handleDirectPaste(paste)
    expect(vm.client.sendKeyEvent.mock.calls).toEqual([[1, 118], [0, 118]])
  })

  it('preserves Command while pasting with its remote Control mapping', () => {
    vm.keyboard = { pressed: { 65515: true } }
    vm.handleDirectPaste(paste)
    expect(vm.client.sendKeyEvent.mock.calls).toEqual([[1, 118], [0, 118]])
  })

  it('recognizes Ctrl/Cmd+V and Shift+Insert as direct-paste shortcuts', () => {
    vm.keyboard = { pressed: { 65505: true } }
    vm.handleDirectPaste(paste)
    expect(vm.client.sendKeyEvent.mock.calls).toEqual([[1, 65379], [0, 65379]])
    expect(vm.isDirectPasteShortcut(118, { 65507: true })).toBe(true)
    expect(vm.isDirectPasteShortcut(118, { 65515: true })).toBe(true)
    expect(vm.isDirectPasteShortcut(65379, { 65505: true })).toBe(true)
    expect(vm.isDirectPasteShortcut(118, {})).toBe(false)
    vm.directClipboard = false
    expect(vm.isDirectPasteShortcut(118, { 65507: true })).toBe(false)
  })

  it('lets the browser paste event provide text without forwarding a stray keyup', async () => {
    const wrapper = shallowMount(GuacamoleClient, {
      propsData: {
        preferenceSetting: { settings: { directClipboard: true } },
        assetPermissions: { copy: true, paste: true }
      },
      mocks: {
        $route: { query: {} },
        $message: { warning: jest.fn(), destroy: jest.fn() },
        $t: key => key
      },
      methods: { init: jest.fn() }
    })
    try {
      const client = {
        createClipboardStream: jest.fn(),
        sendKeyEvent: jest.fn(),
        disconnect: jest.fn()
      }
      wrapper.vm.client = client
      wrapper.vm.clientState = 3
      wrapper.vm.keyboard = { pressed: { 65507: true, 118: true } }
      expect(wrapper.vm.handleKeyDown(118)).toBe(true)
      expect(client.sendKeyEvent).not.toHaveBeenCalled()
      await wrapper.find('.oneterm-guacamole-wrap').trigger('paste', {
        clipboardData: { types: ['text/plain'], getData: () => 'local text' }
      })
      wrapper.vm.handleKeyUp(118)
      expect(writer.sendText).toHaveBeenCalledWith('local text')
      expect(writer.sendEnd.mock.invocationCallOrder[0]).toBeLessThan(client.sendKeyEvent.mock.invocationCallOrder[0])
      expect(client.sendKeyEvent.mock.calls).toEqual([[1, 118], [0, 118]])
      expect(navigator.clipboard.readText).not.toHaveBeenCalled()
    } finally {
      wrapper.destroy()
    }
  })

  it('synchronizes on focus only when clipboard-read permission is already granted', async () => {
    await vm.syncClipboardOnFocus()
    expect(navigator.permissions.query).toHaveBeenCalledWith({ name: 'clipboard-read' })
    expect(navigator.clipboard.readText).toHaveBeenCalledTimes(1)
    expect(writer.sendText).toHaveBeenCalledWith('local text')
    expect(writer.sendEnd).toHaveBeenCalled()
    expect(vm.client.sendKeyEvent).not.toHaveBeenCalled()
  })

  it('synchronizes an authorized standalone page before its input sink gains focus', async () => {
    vm.isStandaloneDesktop = true
    vm.clipboardAuthorizationAttempted = true
    vm.$refs.onetermGuacamoleRef.contains = () => false
    await vm.syncClipboardOnFocus()
    expect(navigator.clipboard.readText).toHaveBeenCalledTimes(1)
    expect(writer.sendText).toHaveBeenCalledWith('local text')
    expect(vm.client.sendKeyEvent).not.toHaveBeenCalled()
  })

  it('uses page focus for the mounted standalone route', async () => {
    const wrapper = shallowMount(GuacamoleClient, {
      propsData: {
        preferenceSetting: { settings: { directClipboard: true } },
        assetPermissions: { copy: true, paste: true }
      },
      mocks: {
        $route: { name: 'oneterm_desktop', query: {} },
        $message: { warning: jest.fn(), destroy: jest.fn() },
        $t: key => key
      },
      methods: { init: jest.fn() }
    })
    try {
      wrapper.vm.client = { createClipboardStream: jest.fn(), disconnect: jest.fn() }
      wrapper.vm.clientState = 3
      wrapper.vm.clipboardAuthorizationAttempted = true
      wrapper.vm.syncLocalClipboard = jest.fn(wrapper.vm.syncLocalClipboard.bind(wrapper.vm))
      expect(wrapper.vm.$refs.onetermGuacamoleRef.contains(document.activeElement)).toBe(false)
      window.dispatchEvent(new Event('focus'))
      await wrapper.vm.syncLocalClipboard.mock.results[0].value
      expect(writer.sendText).toHaveBeenCalledWith('local text')
    } finally {
      wrapper.destroy()
    }
  })

  it('defers initial authorization until a background standalone page gains focus', async () => {
    vm.isStandaloneDesktop = true
    vm.$refs.onetermGuacamoleRef.contains = () => false
    document.hasFocus.mockReturnValue(false)
    await vm.syncClipboardOnConnect()
    expect(vm.clipboardAuthorizationAttempted).toBe(false)
    expect(navigator.clipboard.readText).not.toHaveBeenCalled()

    document.hasFocus.mockReturnValue(true)
    navigator.permissions.query.mockResolvedValue({ state: 'prompt' })
    await vm.syncClipboardOnFocus()
    expect(navigator.clipboard.readText).toHaveBeenCalledTimes(1)
    expect(vm.clipboardAuthorizationAttempted).toBe(true)
    await vm.syncClipboardOnFocus()
    expect(navigator.clipboard.readText).toHaveBeenCalledTimes(1)
  })

  it('does not synchronize a standalone page after the window loses focus during a read', async () => {
    vm.isStandaloneDesktop = true
    vm.clipboardAuthorizationAttempted = true
    vm.$refs.onetermGuacamoleRef.contains = () => false
    let resolveRead
    let markReadStarted
    const readStarted = new Promise(resolve => { markReadStarted = resolve })
    navigator.clipboard.readText.mockImplementation(() => {
      markReadStarted()
      return new Promise(resolve => { resolveRead = resolve })
    })
    const pending = vm.syncClipboardOnFocus()
    await readStarted
    expect(navigator.clipboard.readText).toHaveBeenCalledTimes(1)
    document.hasFocus.mockReturnValue(false)
    resolveRead('local text')
    await pending
    expect(vm.client.createClipboardStream).not.toHaveBeenCalled()
  })

  it('requests initial authorization once per session, not on subsequent focus', async () => {
    navigator.permissions.query.mockResolvedValue({ state: 'prompt' })
    await vm.syncClipboardOnConnect()
    await vm.syncClipboardOnConnect()
    await vm.syncClipboardOnFocus()
    expect(navigator.clipboard.readText).toHaveBeenCalledTimes(1)
    expect(writer.sendText).toHaveBeenCalledWith('local text')
    expect(vm.client.sendKeyEvent).not.toHaveBeenCalled()
  })

  it('starts initial authorization when the connection is established', async () => {
    vm.handleDisplaySize = jest.fn()
    vm.$message.destroy = jest.fn()
    vm.$message.success = jest.fn()
    vm.$emit = jest.fn()
    vm.syncLocalClipboard = jest.fn(vm.syncLocalClipboard.bind(vm))
    vm.onClientStateChange(3)
    await vm.syncLocalClipboard.mock.results[0].value
    expect(navigator.clipboard.readText).toHaveBeenCalledTimes(1)
    expect(writer.sendText).toHaveBeenCalledWith('local text')
  })

  it('does not require the asynchronously focused input sink for initial authorization', async () => {
    navigator.permissions.query.mockResolvedValue({ state: 'prompt' })
    vm.$refs.onetermGuacamoleRef.contains = () => false
    await vm.syncClipboardOnConnect()
    expect(navigator.clipboard.readText).toHaveBeenCalledTimes(1)
  })

  it.each(['disabled', 'denied', 'disconnected', 'disposed'])('does not request initial authorization when %s', async mode => {
    if (mode === 'disabled') vm.directClipboard = false
    if (mode === 'denied') vm.assetPermissions.paste = false
    if (mode === 'disconnected') vm.clientState = 5
    if (mode === 'disposed') vm.disposed = true
    await vm.syncClipboardOnConnect()
    expect(navigator.permissions.query).not.toHaveBeenCalled()
    expect(navigator.clipboard.readText).not.toHaveBeenCalled()
    expect(vm.clipboardAuthorizationAttempted).toBe(false)
  })

  it('reports previously denied initial authorization without requesting on every focus', async () => {
    navigator.permissions.query.mockResolvedValue({ state: 'denied' })
    navigator.clipboard.readText.mockRejectedValue(new Error('permission denied'))
    await vm.syncClipboardOnConnect()
    await vm.syncClipboardOnFocus()
    expect(navigator.clipboard.readText).toHaveBeenCalledTimes(1)
    expect(vm.$message.warning).toHaveBeenCalledTimes(1)
  })

  it('requests initial authorization even when permission queries are unsupported', async () => {
    Object.defineProperty(navigator, 'permissions', { configurable: true, value: undefined })
    await vm.syncClipboardOnConnect()
    await vm.syncClipboardOnFocus()
    expect(navigator.clipboard.readText).toHaveBeenCalledTimes(1)
    expect(writer.sendText).toHaveBeenCalledWith('local text')
  })

  it('does not clear an already synchronized clipboard when the browser paste event arrives', async () => {
    await vm.syncClipboardOnFocus()
    vm.handleDirectPaste(paste)
    expect(vm.client.createClipboardStream).toHaveBeenCalledTimes(1)
    expect(writer.sendEnd).toHaveBeenCalledTimes(1)
    expect(vm.client.sendKeyEvent).toHaveBeenCalledWith(1, 118)

    navigator.clipboard.readText.mockResolvedValue('second text')
    await vm.syncClipboardOnFocus()
    paste.clipboardData.getData.mockReturnValue('second text')
    vm.handleDirectPaste(paste)
    expect(vm.client.createClipboardStream).toHaveBeenCalledTimes(2)
    expect(writer.sendText).toHaveBeenLastCalledWith('second text')
    expect(writer.sendEnd).toHaveBeenCalledTimes(2)
  })

  it('updates the deduplication state when the remote clipboard changes', () => {
    vm.handleClipboardOk('local text')
    vm.handleClipboardReceived({}, 'text/plain')
    reader.ontext('remote text')
    reader.onend()
    vm.handleDirectPaste(paste)
    expect(vm.client.createClipboardStream).toHaveBeenCalledTimes(2)
    expect(writer.sendText).toHaveBeenLastCalledWith('local text')
  })

  it('resends text when remote clipboard changes cannot be observed without copy permission', () => {
    vm.assetPermissions.copy = false
    vm.handleDirectPaste(paste)
    vm.handleDirectPaste(paste)
    expect(vm.client.createClipboardStream).toHaveBeenCalledTimes(2)
  })

  it.each(['prompt', 'denied'])('does not request clipboard data when permission is %s', async state => {
    navigator.permissions.query.mockResolvedValue({ state })
    await vm.syncClipboardOnFocus()
    expect(navigator.clipboard.readText).not.toHaveBeenCalled()
    expect(vm.client.createClipboardStream).not.toHaveBeenCalled()
    expect(vm.$message.warning).not.toHaveBeenCalled()
  })

  it.each(['disabled', 'denied', 'unfocused', 'disconnected'])('does not sync on focus when %s', async mode => {
    if (mode === 'disabled') vm.directClipboard = false
    if (mode === 'denied') vm.assetPermissions.paste = false
    if (mode === 'unfocused') vm.$refs.onetermGuacamoleRef.contains = () => false
    if (mode === 'disconnected') vm.clientState = 5
    await vm.syncClipboardOnFocus()
    expect(navigator.permissions.query).not.toHaveBeenCalled()
    expect(navigator.clipboard.readText).not.toHaveBeenCalled()
  })

  it('does not overwrite a newer paste when a focus read resolves late', async () => {
    let resolveRead
    navigator.clipboard.readText.mockReturnValue(new Promise(resolve => { resolveRead = resolve }))
    const pending = vm.syncClipboardOnFocus()
    await Promise.resolve()
    vm.handleDirectPaste(paste)
    resolveRead('stale text')
    await pending
    expect(writer.sendText).toHaveBeenCalledTimes(1)
    expect(writer.sendText).toHaveBeenCalledWith('local text')
  })

  it('does not send an in-flight focus read after sync is disabled', async () => {
    let resolveRead
    navigator.clipboard.readText.mockReturnValue(new Promise(resolve => { resolveRead = resolve }))
    const pending = vm.syncClipboardOnFocus()
    await Promise.resolve()
    vm.directClipboard = false
    resolveRead('text')
    await pending
    expect(vm.client.createClipboardStream).not.toHaveBeenCalled()
  })

  it('reports an authorized clipboard read failure', async () => {
    navigator.clipboard.readText.mockRejectedValue(new Error('permission denied'))
    await vm.syncClipboardOnFocus()
    expect(vm.$message.warning).toHaveBeenCalledWith('oneterm.guacamole.clipboardFailed')
    expect(vm.client.createClipboardStream).not.toHaveBeenCalled()
  })

  it('does not intercept paste when disabled or disconnected', () => {
    vm.directClipboard = false
    vm.handleDirectPaste(paste)
    vm.directClipboard = true
    vm.clientState = 5
    vm.handleDirectPaste(paste)
    expect(paste.preventDefault).not.toHaveBeenCalled()
    expect(vm.client.createClipboardStream).not.toHaveBeenCalled()
  })

  it('blocks native and manual paste without permission', () => {
    vm.assetPermissions.paste = false
    vm.handleDirectPaste(paste)
    vm.handleClipboardOk('manual')
    expect(vm.$message.warning).toHaveBeenCalled()
    expect(vm.client.createClipboardStream).not.toHaveBeenCalled()
    expect(vm.client.sendKeyEvent).not.toHaveBeenCalled()
  })

  it('rejects non-text clipboard data and sends empty text to clear stale remote content', () => {
    paste.clipboardData.types = ['image/png']
    vm.handleDirectPaste(paste)
    expect(vm.$message.warning).toHaveBeenCalled()
    expect(vm.client.createClipboardStream).not.toHaveBeenCalled()
    paste.clipboardData.types = ['text/plain']
    paste.clipboardData.getData.mockReturnValue('')
    vm.handleDirectPaste(paste)
    expect(writer.sendText).not.toHaveBeenCalled()
    expect(writer.sendEnd).toHaveBeenCalled()
  })

  it('writes remote text, including an empty clipboard, directly to the browser', () => {
    vm.handleClipboardReceived({}, 'text/plain')
    reader.ontext('remote ')
    reader.ontext('text')
    reader.onend()
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('remote text')
    vm.handleClipboardReceived({}, 'text/plain')
    reader.onend()
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('')
  })

  it('writes remote copies in a focused standalone page without input-sink focus', () => {
    vm.isStandaloneDesktop = true
    vm.$refs.onetermGuacamoleRef.contains = () => false
    vm.handleClipboardReceived({}, 'text/plain')
    reader.ontext('remote text')
    reader.onend()
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('remote text')
    navigator.clipboard.writeText.mockClear()
    document.hasFocus.mockReturnValue(false)
    reader.onend()
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled()
  })

  it('preserves legacy copy mode', () => {
    vm.directClipboard = false
    vm.handleClipboardReceived({}, 'text/plain')
    reader.ontext('remote text')
    reader.onend()
    expect(vm.$copyText).toHaveBeenCalledWith('remote text')
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled()
  })

  it('does not copy from denied, monitored, disposed or inactive sessions', () => {
    vm.assetPermissions.copy = false
    vm.handleClipboardReceived({}, 'text/plain')
    vm.assetPermissions.copy = true
    vm.$route.query.is_monitor = '1'
    vm.handleClipboardReceived({}, 'text/plain')
    expect(Guacamole.StringReader).not.toHaveBeenCalled()
    vm.$route.query = {}
    vm.handleClipboardReceived({}, 'text/plain')
    reader.ontext('remote text')
    vm.disposed = true
    reader.onend()
    vm.disposed = false
    vm.$refs.onetermGuacamoleRef.contains = () => false
    reader.onend()
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled()
  })

  it('reports insecure contexts and browser permission failures without unhandled rejections', async () => {
    Object.defineProperty(window, 'isSecureContext', { value: false })
    vm.handleClipboardReceived({}, 'text/plain')
    reader.ontext('remote text')
    reader.onend()
    expect(vm.$message.warning).toHaveBeenCalledWith('oneterm.guacamole.clipboardUnavailable')
    Object.defineProperty(window, 'isSecureContext', { value: true })
    vm.clipboardWarningShown = false
    navigator.clipboard.writeText.mockRejectedValue(new Error('permission denied'))
    reader.onend()
    await Promise.resolve()
    expect(vm.$message.warning).toHaveBeenCalledWith('oneterm.guacamole.clipboardFailed')
  })

  it('merges old preferences and resets without mutating the shared defaults', async () => {
    getPreference.mockResolvedValue({ data: { settings: { resolution: '1600x900' } } })
    const setting = { form: { settings: {} } }
    await DisplaySetting.methods.initData.call(setting)
    expect(setting.form.settings).toEqual({ resolution: '1600x900' })
    DisplaySetting.methods.resetForm.call(setting)
    expect(setting.form.settings).not.toHaveProperty('directClipboard')
    setting.form.settings.resolution = '1920x1080'
    expect(defaultPreferenceSetting.settings.resolution).toBe('auto')
    expect(defaultPreferenceSetting.settings.directClipboard).toBe(false)
  })

  it('does not overwrite clipboard preferences when saving display settings', async () => {
    const context = {
      form: { font_size: 14, settings: { resolution: 'auto', directClipboard: false } },
      $refs: { displaySettingForm: { validate: onValidate => onValidate(true) } },
      $message: { success: jest.fn() },
      $t: key => key,
      $emit: jest.fn()
    }
    DisplaySetting.methods.handleSubmit.call(context)
    expect(putPreference).toHaveBeenCalledWith({ font_size: 14, settings: { resolution: 'auto' } })
    await Promise.resolve()
  })

  it.each([false, true])('keeps personal preferences separate from admin controls (admin=%s)', async isAdmin => {
    getPreference.mockResolvedValue({ data: { settings: { directClipboard: true } } })
    getConfig.mockResolvedValue({ data: { timeout: 5 } })
    putPreference.mockResolvedValue({})
    const wrapper = shallowMount(AccessControl, {
      propsData: { isAdmin },
      mocks: { $t: key => key, $message: { success: jest.fn() } },
      stubs: ['a-form-model', 'a-form-model-item', 'a-input-number', 'a-space', 'a-button', 'a-divider', 'a-switch']
    })
    try {
      for (let i = 0; i < 10; i++) await Promise.resolve()
      await wrapper.vm.$nextTick()
      expect(wrapper.vm.directClipboard).toBe(true)
      expect(wrapper.findComponent({ ref: 'configForm' }).exists()).toBe(isAdmin)
      expect(wrapper.find('.access-control-preference').exists()).toBe(true)
      expect(getConfig).toHaveBeenCalledTimes(isAdmin ? 1 : 0)
      wrapper.vm.directClipboard = false
      await wrapper.vm.saveClipboardPreference()
      expect(putPreference).toHaveBeenCalledWith({ settings: { directClipboard: false } })
      expect(postConfig).not.toHaveBeenCalled()
    } finally {
      wrapper.destroy()
    }
  })
})
