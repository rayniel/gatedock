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
      configurable: true, value: { writeText: jest.fn().mockResolvedValue() }
    })
    vm = {
      ...GuacamoleClient.data(),
      ...GuacamoleClient.methods,
      directClipboard: true,
      clientState: 3,
      client: { createClipboardStream: jest.fn(), sendKeyEvent: jest.fn() },
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

  it('preserves Shift+Insert and lets Ctrl/Cmd+V reach the browser', () => {
    vm.keyboard = { pressed: { 65505: true } }
    vm.handleDirectPaste(paste)
    expect(vm.client.sendKeyEvent.mock.calls).toEqual([[1, 65379], [0, 65379]])
    expect(vm.isBrowserPasteKey(118, { 65507: true })).toBe(true)
    expect(vm.isBrowserPasteKey(118, { 65515: true })).toBe(true)
    expect(vm.isBrowserPasteKey(65379, { 65505: true })).toBe(true)
    expect(vm.isBrowserPasteKey(118, {})).toBe(false)
    vm.directClipboard = false
    expect(vm.isBrowserPasteKey(118, { 65507: true })).toBe(false)
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
