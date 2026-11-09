import Protocol from '@/modules/oneterm/views/assets/assets/protocol'

jest.mock('@/modules/oneterm/api/gateway', () => ({ getGatewayList: jest.fn() }))
jest.mock('@/modules/oneterm/views/assets/assets/protocol/webConfigForm.vue', () => ({}))

describe('asset Telnet Backspace preference', () => {
  const makeVm = () => {
    const vm = { ...Protocol.data(), ...Protocol.methods }
    Object.defineProperty(vm, 'hasTelnetProtocol', { get: () => Protocol.computed.hasTelnetProtocol.call(vm) })
    Object.defineProperty(vm, 'hasWebProtocol', { get: () => Protocol.computed.hasWebProtocol.call(vm) })
    return vm
  }

  it('defaults old Telnet assets to DEL and persists BS on edit', () => {
    const vm = makeVm()
    vm.setValues({ protocols: ['telnet:23'] })
    expect(vm.hasTelnetProtocol).toBe(true)
    expect(vm.getValues().telnet_backspace).toBe('del')
    vm.form.telnet_backspace = 'bs'
    const values = vm.getValues()
    expect(values.telnet_backspace).toBe('bs')
    vm.setValues(values)
    expect(vm.form.telnet_backspace).toBe('bs')
  })

  it('omits the setting for non-Telnet assets and retains it when switching back', () => {
    const vm = makeVm()
    vm.setValues({ protocols: ['telnet:23'], telnet_backspace: 'bs' })
    vm.protocols[0].value = 'ssh'
    expect(vm.hasTelnetProtocol).toBe(false)
    expect(vm.getValues().telnet_backspace).toBeUndefined()
    vm.protocols[0].value = 'telnet'
    expect(vm.getValues().telnet_backspace).toBe('bs')
  })

  it('resets the choice between editing different assets', () => {
    const vm = makeVm()
    vm.setValues({ protocols: ['telnet:23'], telnet_backspace: 'bs' })
    vm.setValues({ protocols: ['telnet:23'] })
    expect(vm.form.telnet_backspace).toBe('del')
  })
})
