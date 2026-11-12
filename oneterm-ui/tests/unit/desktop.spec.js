import { shallowMount } from '@vue/test-utils'
import Desktop from '@/modules/oneterm/views/connect/desktop'
import { getAssetPermissions } from '@/modules/oneterm/api/asset'
import { getPreference } from '@/modules/oneterm/api/preference'

jest.mock('@/modules/oneterm/views/connect/guacamoleClient', () => ({
  name: 'GuacamolePanel',
  render: h => h('div')
}))
jest.mock('@/modules/oneterm/api/asset', () => ({ getAssetPermissions: jest.fn() }))
jest.mock('@/modules/oneterm/api/preference', () => ({ getPreference: jest.fn() }))

const settle = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}

describe('standalone RDP desktop', () => {
  let wrapper
  let message

  const mount = (protocol = 'rdp:3389') => shallowMount(Desktop, {
    mocks: {
      $route: {
        params: { asset_id: '12', account_id: '34', protocol },
        query: { title: 'account@asset' }
      },
      $t: key => key,
      $message: message
    },
    stubs: {
      'a-icon': true,
      'a-button': { template: '<button v-bind="$attrs" v-on="$listeners"><slot /></button>' }
    }
  })

  beforeEach(() => {
    message = { error: jest.fn() }
    getPreference.mockResolvedValue({ data: { settings: { resolution: 'auto' } } })
    getAssetPermissions.mockResolvedValue({
      data: { results: { 34: { results: { connect: { allowed: true }, paste: { allowed: false } } } } }
    })
  })

  afterEach(() => {
    if (wrapper) wrapper.destroy()
    jest.clearAllMocks()
  })

  it('loads permissions before creating a standalone session and preserves denied actions', async () => {
    let resolvePermissions
    getAssetPermissions.mockReturnValue(new Promise(resolve => { resolvePermissions = resolve }))
    wrapper = mount()
    expect(wrapper.findComponent({ name: 'GuacamolePanel' }).exists()).toBe(false)
    resolvePermissions({ data: { results: { 34: { results: { connect: { allowed: true } } } } } })
    await settle()
    expect(getAssetPermissions).toHaveBeenCalledWith('12', { account_ids: '34' })
    const client = wrapper.findComponent({ name: 'GuacamolePanel' })
    expect(client.exists()).toBe(true)
    expect(wrapper.vm.permissions.paste).toBe(false)
    expect(wrapper.text()).not.toContain('oneterm.guacamole.clipboard')
    expect(wrapper.text()).not.toContain('oneterm.fileManagement.name')
  })

  it('fails closed when connect permission is denied', async () => {
    getAssetPermissions.mockResolvedValue({ data: { results: {} } })
    wrapper = mount()
    await settle()
    expect(wrapper.vm.ready).toBe(false)
    expect(wrapper.findComponent({ name: 'GuacamolePanel' }).exists()).toBe(false)
    expect(message.error).toHaveBeenCalledWith('oneterm.desktop.permissionDenied')
  })

  it('collapses the side toolbar by default and switches its horizontal arrow when toggled', async () => {
    wrapper = mount()
    await settle()
    const toolbar = wrapper.find('.standalone-desktop-toolbar')
    const toggle = wrapper.find('.standalone-desktop-toggle')
    expect(toolbar.isVisible()).toBe(false)
    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(toggle.find('a-icon-stub').attributes('type')).toBe('left')
    await toggle.trigger('click')
    expect(toolbar.isVisible()).toBe(true)
    expect(toggle.attributes('aria-expanded')).toBe('true')
    expect(toggle.find('a-icon-stub').attributes('type')).toBe('right')
    await toggle.trigger('click')
    expect(toolbar.isVisible()).toBe(false)
  })

  it('reports permission service failures without opening a session', async () => {
    getAssetPermissions.mockRejectedValue(new Error('Permission service unavailable'))
    wrapper = mount()
    await settle()
    expect(wrapper.vm.ready).toBe(false)
    expect(message.error).toHaveBeenCalledWith('Permission service unavailable')
  })

  it('rejects unsupported protocols before fetching connection details', async () => {
    wrapper = mount('ssh:22')
    await settle()
    expect(getAssetPermissions).not.toHaveBeenCalled()
    expect(message.error).toHaveBeenCalledWith('oneterm.desktop.invalidProtocol')
  })

  it('disconnects without closing the tab and permits an explicit new session', async () => {
    wrapper = mount()
    await settle()
    wrapper.vm.handleClose()
    await wrapper.vm.$nextTick()
    expect(wrapper.findComponent({ name: 'GuacamolePanel' }).exists()).toBe(false)
    expect(wrapper.vm.ended).toBe(true)
    await wrapper.vm.load()
    await wrapper.vm.$nextTick()
    expect(wrapper.findComponent({ name: 'GuacamolePanel' }).exists()).toBe(true)
  })

  it('uses the standalone document for fullscreen so modal portals remain visible', async () => {
    wrapper = mount()
    await settle()
    const request = jest.fn().mockResolvedValue()
    document.documentElement.requestFullscreen = request
    await wrapper.vm.toggleFullscreen()
    expect(request).toHaveBeenCalled()
    delete document.documentElement.requestFullscreen
  })

  it('reports fullscreen failure instead of pretending it succeeded', async () => {
    wrapper = mount()
    await settle()
    document.documentElement.requestFullscreen = jest.fn().mockRejectedValue(new Error('Denied'))
    await wrapper.vm.toggleFullscreen()
    expect(wrapper.vm.fullscreen).toBe(false)
    expect(message.error).toHaveBeenCalledWith('oneterm.desktop.fullscreenFailed')
    delete document.documentElement.requestFullscreen
  })
})
