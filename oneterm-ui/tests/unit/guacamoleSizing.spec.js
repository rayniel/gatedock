import GuacamoleClient from '@/modules/oneterm/views/connect/guacamoleClient'

jest.mock('@/modules/oneterm/views/connect/guacamoleClient/clipboardModal.vue', () => ({}))
jest.mock('@/modules/oneterm/views/connect/guacamoleClient/resolutionModal.vue', () => ({}))
jest.mock('@/modules/oneterm/views/connect/fileManagement/fileManagementDrawer.vue', () => ({}))

describe('Guacamole display sizing', () => {
  let vm
  let display

  beforeEach(() => {
    display = { getWidth: () => 1280, getHeight: () => 720, scale: jest.fn() }
    vm = {
      resolution: 'auto',
      clientState: 3,
      requestedSize: { width: 1280, height: 720 },
      $route: { query: {} },
      $refs: { onetermGuacamoleRef: { clientWidth: 1920, clientHeight: 1080 } },
      client: {
        getDisplay: () => display,
        sendSize: jest.fn()
      }
    }
    Object.assign(vm, GuacamoleClient.methods)
  })

  it('scales against actual remote dimensions and requests the new automatic size', () => {
    vm.handleDisplaySize()
    expect(display.scale).toHaveBeenCalledWith(1.5)
    expect(vm.client.sendSize).toHaveBeenCalledWith(1920, 1080)
    vm.handleDisplaySize()
    expect(vm.client.sendSize).toHaveBeenCalledTimes(1)
  })

  it('preserves fixed resolution and letterboxes without distortion', () => {
    vm.resolution = ['1280', '720']
    vm.$refs.onetermGuacamoleRef.clientHeight = 1200
    vm.handleDisplaySize()
    expect(display.scale).toHaveBeenCalledWith(1.5)
    expect(vm.client.sendSize).not.toHaveBeenCalled()
  })

  it('sends numeric dimensions when the configured resolution changes', () => {
    vm.resolution = ['1600', '900']
    vm.handleResolutionUpdate()
    expect(vm.client.sendSize).toHaveBeenCalledWith(1600, 900)
  })

  it('does not send resize instructions in monitor mode', () => {
    vm.$route.query.is_monitor = '1'
    vm.handleDisplaySize()
    expect(display.scale).toHaveBeenCalledWith(1.5)
    expect(vm.client.sendSize).not.toHaveBeenCalled()
  })

  it('ignores hidden tabs with zero-sized containers', () => {
    vm.$refs.onetermGuacamoleRef.clientWidth = 0
    vm.handleDisplaySize()
    expect(display.scale).not.toHaveBeenCalled()
    expect(vm.client.sendSize).not.toHaveBeenCalled()
  })

  it('does not send sizes before a connection is established', () => {
    vm.clientState = 1
    vm.handleDisplaySize()
    expect(vm.client.sendSize).not.toHaveBeenCalled()
  })
})
