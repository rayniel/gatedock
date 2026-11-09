import { shallowMount } from '@vue/test-utils'
import { constantRouterMap } from '@/router/config'
import AssetTable from '@/modules/oneterm/views/workStation/asset/assetTable'
import { getAssetList } from '@/modules/oneterm/api/asset'

jest.mock('@/layouts', () => ({ UserLayout: {}, BasicLayout: {}, RouteView: {} }))
jest.mock('@/config/app', () => ({ buildModules: ['oneterm'] }))
jest.mock('@/router/utils', () => ({ getAppAclRouter: jest.fn() }))
jest.mock('@/store', () => ({}))
jest.mock('@/modules/oneterm/api/asset', () => ({ getAssetList: jest.fn() }))
jest.mock('@/modules/oneterm/views/assets/assets/loginModal.vue', () => ({}))

describe('standalone desktop entry', () => {
  it('registers a top-level page without the administration layout', () => {
    const route = constantRouterMap.find(route => route.name === 'oneterm_desktop')
    expect(route.path).toBe('/oneterm/desktop/:asset_id/:account_id/:protocol')
    expect(route.hidden).toBe(true)
    expect(route.children).toBeUndefined()
    expect(typeof route.component).toBe('function')
  })

  it('builds a new-tab URL with identifiers, not credentials or permission claims', () => {
    const resolve = jest.fn().mockReturnValue({ href: '/desktop-link' })
    const href = AssetTable.methods.desktopHref.call({ $router: { resolve } },
      { id: 12, name: 'asset' },
      { account_id: 34, account_name: 'account', protocol: 'rdp:3389' })
    expect(href).toBe('/desktop-link')
    expect(resolve).toHaveBeenCalledWith({
      name: 'oneterm_desktop',
      params: { asset_id: 12, account_id: 34, protocol: 'rdp:3389' },
      query: { title: 'account@asset' }
    })
  })

  it('preserves the original embedded connection action', () => {
    const emit = jest.fn()
    AssetTable.methods.openTerminal.call({ $emit: emit }, 12, 'asset',
      { account_id: 34, protocol: 'rdp:3389', protocolType: 'rdp' })
    expect(emit).toHaveBeenCalledWith('openTerminal', {
      assetId: 12, assetName: 'asset', accountId: 34, protocol: 'rdp:3389', protocolType: 'rdp'
    })
  })

  it.each(['rdp', 'ssh'])('renders separate account actions for %s without bubbling clicks', async protocolType => {
    const row = {
      id: 12,
      name: 'asset',
      accountList: [{ account_id: 34, account_name: 'account', protocol: `${protocolType}:3389`, protocolType }]
    }
    getAssetList.mockResolvedValue({ data: { list: [] } })
    const wrapper = shallowMount(AssetTable, {
      mocks: {
        $t: key => key,
        $store: { state: { windowHeight: 900 } },
        $router: { resolve: () => ({ href: '/desktop-link' }) }
      },
      stubs: {
        'a-input-search': true,
        'a-space': true,
        'a-button': true,
        'a-icon': true,
        'ops-icon': true,
        'a-pagination': true,
        'ops-table': { render(h) { return h('div', this.$slots.default) } },
        'vxe-column': {
          render(h) {
            return h('div', this.$scopedSlots.content ? this.$scopedSlots.content({ row }) : [])
          }
        },
        'a-tooltip': { render(h) { return h('div', this.$slots.default) } }
      }
    })
    try {
      const group = wrapper.find('.workstation-asset-table-account-item')
      const connect = group.find('button')
      expect(connect.attributes('title')).toBe('oneterm.desktop.openInWorkstation')
      await group.trigger('click')
      expect(wrapper.emitted('openTerminal')).toBeUndefined()
      await connect.trigger('click')
      expect(wrapper.emitted('openTerminal')).toHaveLength(1)
      const desktop = group.find('a')
      expect(desktop.exists()).toBe(protocolType === 'rdp')
      if (desktop.exists()) {
        expect(desktop.attributes('href')).toBe('/desktop-link')
        expect(desktop.attributes('target')).toBe('_blank')
        expect(desktop.element.parentElement.closest('button')).toBeNull()
        await desktop.trigger('click')
        expect(wrapper.emitted('openTerminal')).toHaveLength(1)
      }
    } finally {
      wrapper.destroy()
    }
  })
})
